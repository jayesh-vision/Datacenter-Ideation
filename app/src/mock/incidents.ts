/* Incidents are built from the alerts, links, services and changes already in
   the estate, so impact, evidence and "what changed before" all point at real
   records. RCA and action plans are deterministic templates (mock AI). */

import type { ActionStep, Alert, Hypothesis, Incident, Service } from '../api/types';
import { mulberry32, pick, intBetween, lognormal } from '../lib/rng';
import type { Db } from './generate';
import { addAlert } from './generate';
import { DAY, HOUR, MIN } from './seed';
import { activeGeo, dcAt } from './geo';

export const RESPONSE_SLA = { 1: 15, 2: 30, 3: 60, 4: 240 } as const;
export const RESOLVE_SLA = { 1: 240, 2: 480, 3: 1440, 4: 4320 } as const;

/* `pathIds`: devices anywhere on a service's path (a GPU job's service rides every node of the job) */
export function impactOf(db: Db, scope: { neIds?: string[]; linkIds?: string[]; dcIds?: string[]; pathIds?: string[] }) {
  const ne = new Set(scope.neIds ?? []), ln = new Set(scope.linkIds ?? []), dcs = new Set(scope.dcIds ?? []), pa = new Set(scope.pathIds ?? []);
  const svcs: Service[] = db.services.filter(s => s.status !== 'Disabled' && (ne.has(s.neId) || s.linkIds.some(l => ln.has(l)) || dcs.has(s.dcId) || (pa.size > 0 && s.path.some(p => pa.has(p)))));
  const custIds = [...new Set(svcs.map(s => s.customerId))];
  const custs = custIds.map(id => db.customers.find(c => c.id === id)!);
  const premium = custs.filter(c => c.premium);
  const revenue = svcs.reduce((a, s) => a + s.revenueMonthly, 0);
  return { services: svcs, customers: custs, premium, revenue };
}

const step = (id: number, s: Omit<ActionStep, 'id' | 'status'> & { status?: ActionStep['status'] }): ActionStep => ({ status: 'pending', ...s, id: `A${id}` });

const DEFAULT_TITLES: Record<Incident['type'], string[]> = {
  Network: ['Interface flapping on backhaul', 'BGP session reset storm', 'OSPF adjacency loss on AGG pair', 'Optical degradation on uplink', 'Access router unreachable'],
  Power: ['Rectifier module alarm', 'UPS on bypass', 'PDU breaker trip'], Cooling: ['CRAH filter blocked — high return temperature', 'Chiller pump fault'], Capacity: ['Backhaul exhaustion warning', 'Port fill above 90% on leaf'],
  Rack: ['Rack over power budget'], Security: ['RADIUS authentication failures spike'],
  GPU: ['GPU fell off the bus — training job stalled', 'NVLink errors slowing a training job', 'Uncorrectable ECC — GPU reset needed']
};

export function buildIncidents(db: Db, TITLES: Record<Incident['type'], string[]> = DEFAULT_TITLES, persona: 'network' | 'colocation' | 'cloud' | 'enterprise' = 'network') {
  const now = db.now;
  const telco = persona === 'network';
  const r = mulberry32(777);
  const inc: Incident[] = db.incidents;
  const newId = () => `INC-${String(++db.seq.inc).padStart(4, '0')}`;
  const linkAlert = (a: Alert, id: string) => { a.incidentId = id; };
  const mk = (p: Omit<Incident, 'id' | 'worklog' | 'verification' | 'impact'> & { impact?: Incident['impact']; worklog?: Incident['worklog']; verification?: Incident['verification'] }, scope: Parameters<typeof impactOf>[1], summary?: (i: ReturnType<typeof impactOf>) => string) => {
    const id = newId();
    const im = impactOf(db, scope);
    const lvl: Incident['impact']['level'] = im.premium.length >= 2 || p.sev === 1 ? 'High' : im.services.length ? 'Medium' : 'Low';
    const incd: Incident = {
      ...p, id,
      impact: p.impact ?? { services: im.services.length, customers: im.customers.length, premium: im.premium.length, revenueAtRisk: im.revenue, level: lvl, summary: summary ? summary(im) : im.services.length ? `${im.services.length} services on the affected scope; ${im.premium.length} premium customer${im.premium.length === 1 ? '' : 's'} exposed.` : 'No customer service traverses the affected scope; operational risk only.' },
      worklog: p.worklog ?? [{ at: p.detected, who: 'Monitoring', text: 'Raised from correlated alarm.', kind: 'system' }],
      verification: p.verification ?? [{ check: 'All correlated alarms cleared', ok: null }, { check: 'Health checks green for 15 minutes', ok: null }, { check: 'Affected services back within SLA', ok: null }]
    };
    if (incd.acknowledged) incd.worklog.push({ at: incd.acknowledged, who: incd.owner, text: `Acknowledged; ${incd.owner} engaged.`, kind: 'human' });
    p.alertIds.forEach(aid => { const a = db.alerts.find(x => x.id === aid); if (a) linkAlert(a, id); });
    inc.push(incd);
    return incd;
  };

  /* 1 — the reference incident on the hero PE */
  const HERO = `${dcAt(1)}-PE-T4-01`;
  const x3 = db.links.find(l => l.protocol === 'LLDP' && ((l.aNe === HERO && l.aIf === 'xe-0/0/3') || (l.zNe === HERO && l.zIf === 'xe-0/0/3')))!;
  const peers = db.nes.filter(n => n.isPe && n.dcId !== dcAt(1) && n.discovery !== 'not-discovered' && n.vendor === 'JUNIPER').filter((_, i) => i % 6 === 1).slice(0, 4);
  peers.forEach((p, i) => addAlert(db, { neId: p.id, dcId: p.dcId, ifName: 'xe-0/0/2', severity: 'minor', title: 'Optical Rx Power Low', description: `Rx power ${(-10.4 - i * 0.3).toFixed(1)} dBm — same SFP-10G-LR lot 22B`, source: 'Interface', type: 'Optics', start: now - (6 + i * 5) * HOUR, state: 'active' }));
  const chgPatch = db.changes.find(c => c.title.startsWith('Re-patch ODF'))!;
  mk({
    title: 'Optical degradation on PE-T4-01 xe-0/0/3 — backhaul flapping', type: 'Network', sev: 2, pri: 2, status: 'Open', owner: 'Mike Johnson', reportedBy: 'Monitoring System', dcId: dcAt(1),
    detected: new Date(2026, 9, 1, 12, 38).getTime(), acknowledged: new Date(2026, 9, 1, 13, 10).getTime(), responseSlaMin: RESPONSE_SLA[2], resolveSlaMin: RESOLVE_SLA[2],
    alertIds: ['ALM-1930', 'ALM-1774', 'ALM-1702', 'ALM-1831'],
    affected: [{ kind: 'NE', id: HERO, label: HERO }, { kind: 'Link', id: x3.id, label: `${HERO} xe-0/0/3 → ${x3.aNe === HERO ? x3.zNe : x3.aNe}` }, { kind: 'Rack', id: db.neById.get(HERO)!.rackId, label: db.neById.get(HERO)!.rackId.replace(`${dcAt(1)}-`, '') }],
    rca: [
      { cause: 'Physical layer issue on xe-0/0/3 — flapping suggests cable or optical degradation rather than a control-plane fault', confidence: 92, evidence: [
        { label: 'ALM-1930: 8 state changes in 20 min on xe-0/0/3', ref: 'ALM-1930', at: new Date(2026, 9, 1, 12, 37, 58).getTime() },
        { label: 'Rx power −11.8 dBm, below the −10.0 dBm warning floor (ALM-1702)', ref: 'ALM-1702', at: new Date(2026, 9, 1, 9, 48).getTime() },
        { label: '1,284 CRC errors on xe-0/0/3 in 24 h; other ports clean', ref: `${HERO}:xe-0/0/3` },
        { label: `${chgPatch.id} re-patched ODF core 7 onto this port 15 h before the first alarm`, ref: chgPatch.id, at: chgPatch.windowEnd },
        { label: 'Same Rx-decay signature on 4 PEs from SFP lot 22B', ref: peers[0]?.id }
      ] },
      { cause: 'Control-plane instability (BGP / OSPF) driving the flaps', confidence: 6, evidence: [{ label: 'Idle BGP peers are on other interfaces (ALM-1655)', ref: 'ALM-1655' }, { label: 'CPU 82% follows flap churn, not the reverse (ALM-1831)', ref: 'ALM-1831' }] },
      { cause: 'Far-end device fault', confidence: 2, evidence: [{ label: 'Far-end port shows no errors or alarms', ref: x3.aNe === HERO ? x3.zNe : x3.aNe }] }
    ],
    actions: [
      step(1, { step: telco ? 'Move premium L3VPN / leased-line traffic off xe-0/0/3 onto xe-0/0/1 (RSVP re-optimise)' : 'Move backhaul traffic off xe-0/0/3 onto xe-0/0/1 (RSVP re-optimise)', owner: 'Priya Nair · NOC', expected: telco ? '6 services leave the flapping path; xe-0/0/1 rises to ~61%' : 'Site traffic leaves the flapping span; xe-0/0/1 rises to ~61%', rollback: 'Revert LSP preference', verify: 'LSP up on new path; latency < 5 ms', disruptive: true }),
      step(2, { step: 'Replace SFP on xe-0/0/3 (lot 22B → spare lot 24A)', owner: 'Rahul Deshpande · Field', expected: 'Rx power back above −7 dBm; flaps stop', rollback: 'Re-insert original optic', verify: 'Rx ≥ −7 dBm, 0 flaps for 15 min', disruptive: true }),
      step(3, { step: 'Run a 15-minute BER test on the span', owner: 'Rahul Deshpande · Field', expected: 'BER < 1e-12', rollback: 'n/a', verify: 'Test report attached', disruptive: false }),
      step(4, { step: 'Reset counters and watch for 24 hours', owner: 'Priya Nair · NOC', expected: 'CRC count stays at 0', rollback: 'n/a', verify: 'No new ALM on xe-0/0/3', disruptive: false }),
      step(5, { step: 'Raise batch RMA for SFP lot 22B (4 nodes)', owner: 'Vendor management', expected: 'Pre-empt the same failure on 4 PEs', rollback: 'n/a', verify: 'RMA reference recorded', disruptive: false })
    ],
    changeIds: [chgPatch.id],
    similar: { text: 'Four other nodes on the same optical vendor batch show the same drift signature. Worth a batch-level RMA rather than four separate ones.', nodes: peers.map(p => p.id) }
  }, { linkIds: [x3.id] }, im => telco ? `${im.services.length} services traverse the affected path. ${im.premium.length} premium customers are exposed — Enterprise Corp's L3VPN carries a 99.99% SLA and its headroom for the month is thin.` : im.services.length ? `${im.services.length} services ride the affected backhaul span; ${im.premium.length} priority ${persona === 'colocation' ? 'tenants' : persona === 'cloud' ? 'accounts' : 'business units'} exposed if the second span also degrades.` : 'No hosted service rides this backhaul span directly; the site keeps its second edge path. Operational risk only.');

  /* 2 — UPS on battery */
  const upsAlert = db.alerts.find(a => a.scope !== "downstream" && a.dcId === dcAt(9) && a.title.includes('On Battery'))!;
  const feedChg = db.changes.find(c => c.dcId === dcAt(9))!;
  mk({
    title: 'UPS-2 on battery after utility feed A loss', type: 'Power', sev: 1, pri: 1, status: 'Investigating', owner: 'James Wilson', reportedBy: 'BMS', dcId: dcAt(9), detected: upsAlert.start + MIN, acknowledged: upsAlert.start + 9 * MIN,
    responseSlaMin: RESPONSE_SLA[1], resolveSlaMin: RESOLVE_SLA[1], alertIds: [upsAlert.id], affected: [{ kind: 'Facility', id: `${dcAt(9)}-UPS-2`, label: 'UPS-2' }, { kind: 'Facility', id: `${dcAt(9)}-AC-1`, label: 'Utility feed A' }],
    rca: [{ cause: 'Utility feeder trip on feed A; DG did not auto-start within 30 s', confidence: 84, evidence: [{ label: `${upsAlert.code}: UPS-2 on battery`, ref: upsAlert.id, at: upsAlert.start }, { label: `${feedChg.id} switched feed A to feeder 2 yesterday`, ref: feedChg.id, at: feedChg.windowEnd }, { label: 'DG controller in MANUAL since that change', ref: dcAt(9) }] },
      { cause: 'ATS (automatic transfer switch) fault', confidence: 12, evidence: [{ label: 'ATS reports position B but no load transfer', ref: dcAt(9) }] }, { cause: 'UPS rectifier fault', confidence: 4, evidence: [{ label: 'UPS-1 on the same feed also lost input', ref: dcAt(9) }] }],
    actions: [step(1, { step: 'Start DG manually and transfer load', owner: 'Facility ops', expected: 'UPS-2 back on mains within 5 min', rollback: 'Return ATS to utility', verify: 'UPS-2 input present; battery charging', disruptive: true }),
      step(2, { step: 'Set DG controller back to AUTO', owner: 'Facility ops', expected: 'Auto-start restored', rollback: 'n/a', verify: 'Controller mode = AUTO', disruptive: false }),
      step(3, { step: 'Shed non-critical lab racks if battery < 8 min', owner: 'Kavita Rao · DC manager', expected: '+6 min autonomy', rollback: 'Re-energise racks', verify: 'Load < 60%', disruptive: true }),
      step(4, { step: 'Raise problem: post-change DG mode check missing from runbook', owner: 'Problem manager', expected: 'Runbook updated', rollback: 'n/a', verify: 'Problem record linked', disruptive: false })],
    changeIds: [feedChg.id], similar: null
  }, { dcIds: [dcAt(9)] }, im => `UPS-2 carries half of the site load. If the battery runs out before DG transfer, ${im.services.length} services and ${im.customers.length} customers lose power.`);

  /* 3 — cooling */
  const crah = db.alerts.find(a => a.scope !== "downstream" && a.dcId === dcAt(3) && a.title.includes('Cooling Unit Failed'))!;
  const zone = db.alerts.find(a => a.scope !== "downstream" && a.dcId === dcAt(3) && a.title === 'Zone Temperature High');
  const dc3 = db.datacenters.find(d => d.id === dcAt(3))!;
  const hotRacks = dc3.racks.filter(rk => rk.tempC > 30);
  const crahChg = db.changes.find(c => c.dcId === dcAt(3))!;
  mk({
    title: `CRAH-11 failed — ${dc3.cooling.units[0].zone} at N redundancy`, type: 'Cooling', sev: 2, pri: 2, status: 'Mitigated', owner: 'Sarah Chen', reportedBy: 'BMS', dcId: dcAt(3), detected: crah.start + MIN, acknowledged: crah.start + 14 * MIN,
    responseSlaMin: RESPONSE_SLA[2], resolveSlaMin: RESOLVE_SLA[2], alertIds: [crah.id, ...(zone ? [zone.id] : [])],
    affected: [{ kind: 'Facility', id: `${dcAt(3)}-CRAH-11`, label: 'CRAH-11' }, ...hotRacks.map(rk => ({ kind: 'Rack' as const, id: rk.id, label: rk.name }))],
    rca: [{ cause: 'Compressor trip on CRAH-11 (high head pressure)', confidence: 90, evidence: [{ label: `${crah.code}: CRAH-11 failed`, ref: crah.id, at: crah.start }, { label: 'CRAH-12 already in maintenance — zone left at N', ref: `${dcAt(3)}-CRAH-12` }, { label: `${hotRacks.length} racks above 30°C inlet`, ref: dcAt(3) }] },
      { cause: 'Condenser airflow blocked', confidence: 10, evidence: [{ label: 'Outdoor temperature 34°C, within design', ref: dcAt(3) }] }],
    actions: [step(1, { step: 'Deploy portable cooling to the hot aisle', owner: 'Facility ops', expected: 'Inlet −3°C', rollback: 'Remove units', verify: 'Zone < 27°C', disruptive: false, status: 'done' }),
      step(2, { step: 'Return CRAH-12 from maintenance early', owner: 'Facility ops', expected: 'Zone back to N+1', rollback: 'n/a', verify: 'CRAH-12 operational', disruptive: false, status: 'done' }),
      step(3, { step: `Complete compressor replacement (${crahChg.id})`, owner: 'Anil Kulkarni', expected: 'CRAH-11 operational', rollback: 'Keep portable cooling', verify: 'Supply 18–20°C', disruptive: false, status: 'running' })],
    changeIds: [crahChg.id], similar: null,
    worklog: [{ at: crah.start + MIN, who: 'Monitoring', text: 'Raised from correlated alarm.', kind: 'system' }, { at: crah.start + 40 * MIN, who: 'Sarah Chen', text: 'Portable cooling in place; CRAH-12 recalled from maintenance.', kind: 'human' }]
  }, { neIds: db.nes.filter(n => hotRacks.some(rk => rk.id === n.rackId)).map(n => n.id) });

  /* 4 — rack power */
  const rackAlerts = db.alerts.filter(a => a.scope !== "downstream" && a.dcId === dcAt(20) && a.title === 'Rack Over Power Budget');
  if (rackAlerts.length) mk({
    title: `${rackAlerts.length} racks over power budget in Hall A`, type: 'Rack', sev: 3, pri: 3, status: 'Open', owner: 'Meera Iyer', reportedBy: 'DCIM', dcId: dcAt(20), detected: rackAlerts[0].start + 2 * MIN,
    responseSlaMin: RESPONSE_SLA[3], resolveSlaMin: RESOLVE_SLA[3], alertIds: rackAlerts.map(a => a.id), affected: rackAlerts.map(a => ({ kind: 'Rack' as const, id: `${dcAt(20)}-${a.description.split(' ')[0]}`, label: a.description.split(' ')[0] })),
    rca: [{ cause: 'New leaf + TOR installs landed in racks already at 85% budget', confidence: 78, evidence: [{ label: 'Draw rose 1.4 kW per rack after last week\'s installs', ref: dcAt(20) }, ...rackAlerts.map(a => ({ label: a.description, ref: a.id }))] }, { cause: 'PDU metering error', confidence: 22, evidence: [{ label: 'Neighbouring PDU on same circuit reads lower', ref: dcAt(20) }] }],
    actions: [step(1, { step: 'Move 2 TOR switches to RACK-H (free 6 kW)', owner: 'Field ops', expected: 'Racks back under 85%', rollback: 'Move back', verify: 'Rack draw < 85% of budget', disruptive: true }), step(2, { step: 'Raise capacity plan for Hall A power', owner: 'Capacity planning', expected: 'Budget uplift approved', rollback: 'n/a', verify: 'Plan linked', disruptive: false })],
    changeIds: [], similar: null
  }, {});

  /* 5..: correlated network faults from the estate */
  const unreach = db.alerts.filter(a => a.scope !== "downstream" && a.title === 'Device Unreachable');
  const downs = db.alerts.filter(a => a.scope !== "downstream" && a.title === 'Link Down' && a.linkId);
  const hot = db.alerts.filter(a => a.scope !== "downstream" && a.title === 'Link Utilisation High' && a.severity === 'major');
  const stale = db.alerts.filter(a => a.scope !== "downstream" && a.title === 'Collector Stale');
  const psu = db.alerts.filter(a => a.scope !== "downstream" && a.title === 'Power Supply Fault');
  const pool: (() => void)[] = [];
  unreach.forEach(a => pool.push(() => {
    const ne = db.neById.get(a.neId!)!;
    const up = db.links.filter(l => l.protocol === 'LLDP' && (l.aNe === ne.id || l.zNe === ne.id)).map(l => l.id);
    const sev = 3 as const;
    mk({ title: `${ne.name} unreachable`, type: 'Network', sev, pri: 3, status: pick(r, ['Open', 'Investigating'] as const), owner: pick(r, activeGeo().people), reportedBy: 'Monitoring System', dcId: ne.dcId, detected: a.start + 2 * MIN, acknowledged: a.start + intBetween(r, 10, 90) * MIN,
      responseSlaMin: RESPONSE_SLA[sev], resolveSlaMin: RESOLVE_SLA[sev], alertIds: [a.id], affected: [{ kind: 'NE', id: ne.id, label: ne.name }],
      rca: [{ cause: 'Loss of power at the access rack (PDU breaker)', confidence: 64, evidence: [{ label: 'Both uplinks lost at the same second', ref: a.id, at: a.start }, { label: 'Neighbouring devices in the rack healthy', ref: ne.rackId }] }, { cause: 'Device hang after memory exhaustion', confidence: 36, evidence: [{ label: 'Memory trended up 14% over 7 days', ref: ne.id }] }],
      actions: [step(1, { step: 'Remote power-cycle via smart PDU outlet', owner: 'NOC', expected: 'Device back in 6 min', rollback: 'n/a', verify: 'ICMP + SNMP respond', disruptive: true }), step(2, { step: 'Dispatch field engineer if no recovery', owner: 'Field ops', expected: 'On site < 2 h', rollback: 'n/a', verify: 'Job closed with evidence', disruptive: false })],
      changeIds: [], similar: null }, { neIds: [ne.id], linkIds: up });
  }));
  const downByDc = new Map<string, Alert[]>();
  downs.forEach(a => downByDc.set(a.dcId, [...(downByDc.get(a.dcId) ?? []), a]));
  downByDc.forEach((as, dc) => pool.push(() => {
    /* severity policy: a multi-link outage exposing 3+ premium customers is SEV1 */
    const prem = impactOf(db, { linkIds: as.map(a => a.linkId!) }).premium.length;
    const sev = as.length > 1 && prem >= 3 ? 1 as const : as.length > 1 ? 2 as const : 3 as const;
    mk({ title: as.length > 1 ? `${as.length} physical links down in ${dc}` : `Link down — ${as[0].neId} ${as[0].ifName}`, type: 'Network', sev, pri: sev, status: pick(r, ['Open', 'Investigating', 'Investigating'] as const), owner: pick(r, activeGeo().people), reportedBy: 'Monitoring System', dcId: dc,
      detected: Math.min(...as.map(a => a.start)) + MIN, acknowledged: chance2(r) ? Math.min(...as.map(a => a.start)) + intBetween(r, 5, 70) * MIN : undefined, responseSlaMin: RESPONSE_SLA[sev], resolveSlaMin: RESOLVE_SLA[sev], alertIds: as.map(a => a.id),
      affected: as.map(a => ({ kind: 'Link' as const, id: a.linkId!, label: `${a.neId} ${a.ifName}` })),
      rca: [{ cause: as.length > 1 ? 'Common cable tray / ODF fault' : 'Optic or patch-cord failure', confidence: as.length > 1 ? 71 : 80, evidence: as.map(a => ({ label: `${a.code}: ${a.description}`, ref: a.id, at: a.start })) }, { cause: 'Far-end line card fault', confidence: as.length > 1 ? 29 : 20, evidence: [{ label: 'Far-end reports LOS on the same ports', ref: as[0].linkId }] }],
      actions: [step(1, { step: 'Check light levels at ODF and swap patch cords', owner: 'Field ops', expected: 'Carrier restored', rollback: 'Restore original cord', verify: 'Link up, 0 errors 15 min', disruptive: false }), step(2, { step: 'Replace optic if Rx < −14 dBm', owner: 'Field ops', expected: 'Link stable', rollback: 'Re-insert optic', verify: 'Rx ≥ −7 dBm', disruptive: true })],
      changeIds: [], similar: null }, { linkIds: as.map(a => a.linkId!) });
  }));
  hot.slice(0, 3).forEach(a => pool.push(() => {
    const l = db.links.find(x => x.id === a.linkId)!;
    mk({ title: `Backhaul ${a.neId} ${a.ifName} at ${Math.round(l.utilPct)}% — capacity exhaustion`, type: 'Capacity', sev: 3, pri: 3, status: 'Open', owner: pick(r, activeGeo().people), reportedBy: 'Capacity forecaster', dcId: a.dcId, detected: a.start + 5 * MIN,
      responseSlaMin: RESPONSE_SLA[3], resolveSlaMin: RESOLVE_SLA[3], alertIds: [a.id], affected: [{ kind: 'Link', id: l.id, label: `${a.neId} ${a.ifName}` }],
      rca: [{ cause: `Organic growth of ${l.growthPct}%/mo on the span`, confidence: 88, evidence: [{ label: `6-month trend ${l.history[0]}% → ${l.utilPct}%`, ref: l.id }, { label: a.description, ref: a.id }] }, { cause: 'Traffic shifted from a failed parallel path', confidence: 12, evidence: [{ label: 'No parallel link down in the last 7 days', ref: l.id }] }],
      actions: [step(1, { step: 'Re-balance LSPs onto parallel backhaul', owner: 'NOC', expected: '−12% on this span', rollback: 'Revert LSP preferences', verify: 'Util < 80%', disruptive: true }), step(2, { step: 'Raise capacity plan: upgrade span to 100G', owner: 'Capacity planning', expected: 'Headroom 18 months', rollback: 'n/a', verify: 'Plan approved', disruptive: false })],
      changeIds: [], similar: null }, { linkIds: [l.id] });
  }));
  stale.forEach(a => pool.push(() => mk({ title: `Discovery collector stale — ${a.dcId}`, type: 'Network', sev: 4, pri: 4, status: 'Open', owner: 'Arjun Mehta', reportedBy: 'Discovery', dcId: a.dcId, detected: a.start + 15 * MIN, acknowledged: a.start + 70 * MIN,
    responseSlaMin: RESPONSE_SLA[4], resolveSlaMin: RESOLVE_SLA[4], alertIds: [a.id], affected: [{ kind: 'Facility', id: `COL-${a.dcId}-2`, label: 'Collector B' }],
    rca: [{ cause: 'Collector VM disk full — poller stopped', confidence: 75, evidence: [{ label: a.description, ref: a.id, at: a.start }] }, { cause: 'Management VLAN change cut reachability', confidence: 25, evidence: [{ label: 'No VLAN change recorded', ref: a.dcId }] }],
    actions: [step(1, { step: 'Purge collector logs and restart poller', owner: 'NOC tooling', expected: 'Fresh data within 15 min', rollback: 'n/a', verify: 'Last-seen < 15 min for all NE', disruptive: false })], changeIds: [], similar: null }, {})));
  psu.slice(0, 6).forEach(a => pool.push(() => {
    const ne = db.neById.get(a.neId!)!;
    mk({ title: `${ne.name} running on single PSU`, type: 'Power', sev: 4, pri: 4, status: pick(r, ['Open', 'Investigating'] as const), owner: pick(r, activeGeo().people), reportedBy: 'Monitoring System', dcId: ne.dcId, detected: a.start + 3 * MIN, acknowledged: a.start + intBetween(r, 30, 200) * MIN,
      responseSlaMin: RESPONSE_SLA[4], resolveSlaMin: RESOLVE_SLA[4], alertIds: [a.id], affected: [{ kind: 'NE', id: ne.id, label: ne.name }],
      rca: [{ cause: 'PSU2 hardware failure', confidence: 91, evidence: [{ label: a.description, ref: a.id, at: a.start }] }, { cause: 'PDU outlet B de-energised', confidence: 9, evidence: [{ label: 'Other devices on PDU B healthy', ref: ne.rackId }] }],
      actions: [step(1, { step: 'Open RMA and hot-swap PSU2', owner: 'Field ops', expected: 'Redundant power restored', rollback: 'n/a', verify: 'PSU2 OK', disruptive: false })], changeIds: [], similar: null }, { neIds: [ne.id] });
  }));
  shuffleInPlace(pool, mulberry32(4242));
  const target = 22;
  for (const f of pool) { if (inc.filter(i => isOpen(i)).length >= target) break; f(); }

  /* history for MTTR / problem trends */
  const TYPES: Incident['type'][] = ['Network', 'Network', 'Network', 'Power', 'Cooling', 'Capacity', 'Rack', 'Security'];
  const live = db.datacenters.filter(d => d.status !== 'planned');
  for (let i = 0; i < 38; i++) {
    const t = pick(r, TYPES); const sev = pick(r, [2, 3, 3, 4, 4] as const); const dc = pick(r, live);
    const det = now - intBetween(r, 30 * 60, 29 * 24 * 60) * MIN;
    const mttr = Math.max(25, Math.round(lognormal(r, sev === 2 ? 300 : sev === 3 ? 900 : 1500, 0.6)));
    const title = pick(r, TITLES[t]);
    const missed = mttr > RESOLVE_SLA[sev];
    inc.push({ id: newId(), title: `${title} — ${dc.id}`, type: t, sev, pri: sev, status: i % 4 === 0 ? 'Resolved' : 'Closed', owner: pick(r, activeGeo().people), reportedBy: 'Monitoring System', dcId: dc.id, detected: det, acknowledged: det + intBetween(r, 4, missed ? 70 : 40) * MIN, resolved: det + mttr * MIN,
      responseSlaMin: RESPONSE_SLA[sev], resolveSlaMin: RESOLVE_SLA[sev], alertIds: [], affected: [], rca: [{ cause: title.includes('Optical') || title.includes('flapping') ? 'Optic degradation (SFP lot 22B)' : 'See postmortem', confidence: 100, evidence: [] }], actions: [], changeIds: [],
      worklog: [{ at: det, who: 'Monitoring', text: 'Raised from correlated alarm.', kind: 'system' }, { at: det + mttr * MIN, who: 'Closure check', text: 'Post-action health checks passed; incident resolved.', kind: 'system' }],
      impact: { services: intBetween(r, 0, 9), customers: intBetween(r, 0, 6), premium: intBetween(r, 0, 2), revenueAtRisk: 0, level: 'Low', summary: 'Historic incident.' }, similar: null, verification: [{ check: 'All correlated alarms cleared', ok: true }, { check: 'Health checks green for 15 minutes', ok: true }, { check: 'Affected services back within SLA', ok: true }], feedback: i % 3 === 0 ? 'confirmed' : undefined });
  }
  inc.sort((a, b) => Number(a.id.slice(4)) - Number(b.id.slice(4)));
  /* daily window: give a few of the history a DAY offset so trends show */
  void DAY;
}

export const isOpen = (i: Incident) => i.status === 'Open' || i.status === 'Investigating' || i.status === 'Mitigated';
const chance2 = (r: () => number) => r() < 0.7;
function shuffleInPlace<T>(a: T[], r: () => number) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
export type { Hypothesis };
