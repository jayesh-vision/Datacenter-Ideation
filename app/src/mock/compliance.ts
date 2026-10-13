/* Compliance (13-Oct-2026, P2B merge phase 7). Policies are evaluated on the estate itself (every resource they apply to, every time),
   framework controls are mapped to the policies that evidence them (P2B mapped ISO A.8.32 change management to a rack-power policy and
   A.5.23 cloud services to N+1 cooling; here each control points at what actually evidences it), manual controls carry an attestation date. */
import type { ComplianceControl, ComplianceFramework, CompliancePolicy, ComplianceView, ComplianceViolation } from '../api/types';
import type { Db } from './generate';
import { activeGeo } from './geo';
import { dcimModel } from './dcim';
import { ipamModel } from './ipam';
import { sitePhys } from './physical';
import { siteSafety } from './safety';
import { sitePm } from './maintenance';
import { modelDates } from './lifecycle';
import { changeRegister } from './changemgmt';
import { mulberry32, seedOf, intBetween } from '../lib/rng';
import { DAY } from './seed';

let cache: ComplianceView | null = null, cacheDb: Db | null = null;
export const clearCompliance = () => { cache = null; };
export function complianceView(db: Db): ComplianceView {
  if (cache && cacheDb === db) return cache;
  cacheDb = db; cache = build(db); return cache;
}

function build(db: Db): ComplianceView {
  const now = db.now;
  const live = db.datacenters.filter(d => d.status === 'on-air');
  const dm = dcimModel(db);
  const V: ComplianceViolation[] = [];
  const pol: CompliancePolicy[] = [];
  const P = (id: string, name: string, rule: string, area: CompliancePolicy['area'], enforcement: CompliancePolicy['enforcement'], evaluated: number, found: Omit<ComplianceViolation, 'id' | 'policyId'>[]) => {
    found.forEach((f, i) => V.push({ ...f, id: `${id}-${i + 1}`, policyId: id }));
    pol.push({ id, name, rule, area, enforcement, evaluated, violations: found.length });
  };
  const ids = new Set(live.map(d => d.id));
  const racks = dm.racks.filter(r => ids.has(r.dcId) && r.status !== 'Planned');
  P('CP-01', 'Rack draw within 80% of its budget', 'Every live rack draws at most 80% of one PDU side, so it survives losing the other side.', 'Power', 'Warn', racks.length,
    racks.filter(r => r.powerPct > 80).map(r => ({ resource: r.id, resourceName: r.name, dcId: r.dcId, message: `${r.drawKw} of ${r.budgetKw} kW (${r.powerPct}%)`, to: `/dcim/racks/${encodeURIComponent(r.id)}` })));
  const single: Omit<ComplianceViolation, 'id' | 'policyId'>[] = []; let devs = 0;
  for (const d of live) { const ph = sitePhys(db, d.id); if (!ph) continue; const by = new Map<string, Set<string>>();
    for (const c of ph.cords) if (c.state === 'live' || c.state === 'on-battery') by.set(c.neId, (by.get(c.neId) ?? new Set()).add(c.pduId.slice(-1)));
    for (const [ne, sides] of by) { devs++; if (sides.size < 2) single.push({ resource: ne, resourceName: db.neById.get(ne)?.name ?? ne, dcId: d.id, message: 'Runs on one PDU side only', to: `/ne/${encodeURIComponent(ne)}?tab=physical` }); } }
  P('CP-02', 'Dual-fed devices', 'Every powered device draws from both the A and the B side.', 'Power', 'Block', devs, single);
  const zones = live.flatMap(d => sitePhys(db, d.id)?.zones ?? []);
  P('CP-03', 'Cooling keeps N+1', 'Every floor keeps one spare cooling unit beyond its heat load.', 'Cooling', 'Block', zones.length, zones.filter(z => z.state !== 'n+1').map(z => ({ resource: z.id, resourceName: `${z.dcId} · ${z.floor}`, dcId: z.dcId, message: z.state === 'short' ? 'Cooling short of the heat load' : 'No spare unit', to: `/facilities?dc=${z.dcId}&tab=cooling` })));
  const ups = live.flatMap(d => d.power.ups.map(u => ({ ...u, dcId: d.id })));
  P('CP-04', 'UPS autonomy at least 10 minutes', 'Every UPS module carries its load on battery for 10 minutes or more (time for the generator to start and take the load).', 'Power', 'Warn', ups.length, ups.filter(u => u.batteryMin < 10).map(u => ({ resource: `${u.dcId}-${u.name}`, resourceName: `${u.dcId} ${u.name}`, dcId: u.dcId, message: `${u.batteryMin} min at ${u.loadPct}% load`, to: `/facilities?dc=${u.dcId}` })));
  const ip = ipamModel(db);
  P('CP-05', 'Addresses inside the site plan', 'Every management address sits inside its site\'s management prefixes and is unique in its VRF.', 'Network', 'Warn', ip.addresses.length,
    ip.findings.filter(f => f.kind === 'Outside plan' || f.kind === 'Conflict').map(f => ({ resource: f.ref ?? f.id, resourceName: f.title, dcId: f.dcId ?? '', message: f.kind, to: '/ipam?tab=addresses&ast=Outside%20plan' })));
  const nes = dm.devices.filter(d => ids.has(d.dcId) && d.status !== 'Tenant-owned' && d.status !== 'Planned');
  P('CP-06', 'No device past vendor end of support', 'Every installed device runs a model the vendor still supports.', 'Lifecycle', 'Warn', nes.length, nes.filter(d => modelDates(d.model, now).endOfSupport < now).map(d => ({ resource: d.id, resourceName: d.name, dcId: d.dcId, message: `${d.model} past end of support`, to: `/ne/${encodeURIComponent(d.id)}?tab=hardware` })));
  const ch = changeRegister(db).changes.filter(c => !['Completed', 'Rolled back', 'Rejected'].includes(c.status));
  P('CP-07', 'Changes follow the change policy', 'No open change breaks a blocking change policy (rollback plan, freeze).', 'Change', 'Block', ch.length, ch.filter(c => c.violations.some(v => v.enforcement === 'Block')).map(c => ({ resource: c.id, resourceName: c.title, dcId: c.dcId, message: c.violations.filter(v => v.enforcement === 'Block').map(v => v.text).join('; '), to: `/changes/${encodeURIComponent(c.id)}` })));
  const fire = live.flatMap(d => siteSafety(db, d.id)?.fire ?? []);
  P('CP-08', 'Fire systems inspected on schedule', 'Every fire zone has its quarterly inspection done or booked.', 'Safety', 'Warn', fire.length, fire.filter(f => f.state !== 'ok').map(f => ({ resource: f.id, resourceName: `${f.dcId} · ${f.zone}`, dcId: f.dcId, message: f.note ?? 'Attention', to: `/facilities?dc=${f.dcId}&tab=environment` })));
  const pm = live.flatMap(d => sitePm(db, d.id) ?? []);
  P('CP-09', 'Plant maintenance not overdue', 'Every plant asset has its preventive maintenance within its interval.', 'Maintenance', 'Warn', pm.length, pm.filter(t => t.state === 'overdue').map(t => ({ resource: t.id, resourceName: `${t.dcId} · ${t.asset}`, dcId: t.dcId, message: `${t.task} overdue since ${new Date(t.nextDue).toISOString().slice(0, 10)}`, to: `/facilities?dc=${t.dcId}&tab=maintenance` })));

  /* ---- frameworks and controls */
  const ppl = activeGeo().people;
  const r = mulberry32(seedOf('compliance'));
  const C: [string, string, string, 'Automated' | 'Manual', string[]][] = [
    ['ISO/IEC 27001:2022', 'A.7.11', 'Supporting utilities', 'Automated', ['CP-02', 'CP-04']],
    ['ISO/IEC 27001:2022', 'A.7.13', 'Equipment maintenance', 'Automated', ['CP-09']],
    ['ISO/IEC 27001:2022', 'A.8.32', 'Change management', 'Automated', ['CP-07']],
    ['ISO/IEC 27001:2022', 'A.8.9', 'Configuration management', 'Automated', ['CP-05']],
    ['ISO/IEC 27001:2022', 'A.7.2', 'Physical entry', 'Manual', []],
    ['ISO/IEC 27001:2022', 'A.5.30', 'ICT readiness for business continuity', 'Manual', []],
    ['ISO/IEC 22237', '22237-3', 'Power distribution', 'Automated', ['CP-01', 'CP-02', 'CP-04']],
    ['ISO/IEC 22237', '22237-4', 'Environmental control', 'Automated', ['CP-03']],
    ['ISO/IEC 22237', '22237-6', 'Security systems (fire, access)', 'Automated', ['CP-08']],
    ['ISO/IEC 22237', '22237-7', 'Management and operational information', 'Automated', ['CP-09', 'CP-06']],
    ['TIA-942-C', 'Electrical', 'Redundant distribution to the rack', 'Automated', ['CP-02', 'CP-01']],
    ['TIA-942-C', 'Mechanical', 'Cooling redundancy', 'Automated', ['CP-03']],
    ['TIA-942-C', 'Telecom', 'Structured cabling records', 'Manual', []],
    ['SOC 2', 'CC8.1', 'Change management', 'Automated', ['CP-07']],
    ['SOC 2', 'A1.2', 'Environmental protections and recovery infrastructure', 'Automated', ['CP-03', 'CP-04', 'CP-08']],
    ['SOC 2', 'CC7.1', 'Vulnerability and configuration monitoring', 'Automated', ['CP-06', 'CP-05']],
    ['SOC 2', 'CC6.4', 'Physical access to facilities', 'Manual', []]
  ];
  const byId = new Map(pol.map(p => [p.id, p]));
  const controls: ComplianceControl[] = C.map(([framework, ref, title, type, policyIds], i) => {
    const ps = policyIds.map(id => byId.get(id)!);
    const vio = ps.reduce((a, p) => a + p.violations, 0), ev = ps.reduce((a, p) => a + p.evaluated, 0);
    const assessed = type === 'Automated' ? now : now - intBetween(r, 40, 420) * DAY;
    const status: ComplianceControl['status'] = type === 'Manual' ? (now - assessed > 365 * DAY ? 'Evidence due' : 'Compliant')
      : vio === 0 ? 'Compliant' : ps.some(p => p.enforcement === 'Block' && p.violations) || vio / Math.max(1, ev) > 0.05 ? 'Non-compliant' : 'Partial';
    return { id: `CTL-${String(i + 1).padStart(2, '0')}`, framework, ref, title, type, policyIds, status, owner: ppl[(i % 5) + 1] ?? 'Compliance', assessed,
      evidence: type === 'Manual' ? `Attestation and audit sample on ${new Date(assessed).toISOString().slice(0, 10)}` : `${ev} resources evaluated by ${policyIds.join(', ')}; ${vio} finding${vio === 1 ? '' : 's'}` };
  });
  const fws = [...new Set(C.map(c => c[0]))];
  const DESC: Record<string, string> = { 'ISO/IEC 27001:2022': 'Information security management (Annex A controls that a datacenter evidences)', 'ISO/IEC 22237': 'Datacenter facilities and infrastructure (EN 50600 family)', 'TIA-942-C': 'Telecommunications infrastructure standard for datacenters', 'SOC 2': 'Trust services criteria (security, availability)' };
  const frameworks: ComplianceFramework[] = fws.map((f, i) => ({ id: `FW-${i + 1}`, name: f, description: DESC[f], controls: controls.filter(c => c.framework === f).length, compliant: controls.filter(c => c.framework === f && c.status === 'Compliant').length }));
  return { frameworks, controls, policies: pol, violations: V };
}
