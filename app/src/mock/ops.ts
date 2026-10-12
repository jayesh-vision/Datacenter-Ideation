/* Operations process (Phase 3, 12-Oct-2026, user): who is on call and who gets paged, the ITSM ticket each incident is synced to,
   the customer notifications an incident owes, problem records that group recurring incidents, resilience tests per site, and
   colocation cross-connect orders and remote-hands tickets. Read models derived from the incidents, sites, customers and services;
   nothing in the generated estate changes. */
import type { CrossConnectOrder, Incident, IncidentOps, OnCall, OnCallRole, Problem, RemoteHandsTicket, ResilienceTest } from '../api/types';
import type { Db } from './generate';
import { mulberry32, seedOf, intBetween, chance, pick } from '../lib/rng';
import { activeGeo } from './geo';
import { DAY, HOUR, MIN } from './seed';
import type { EdgeStatus } from '../api/types';

let memo: { db: Db; problems: Problem[] } | null = null;
export function clearOps() { memo = null; }
const open = (i: Incident) => i.status === 'Open' || i.status === 'Investigating' || i.status === 'Mitigated';

/* ---------------------------------------------------------------- on call */

/* a region's rota: the people of the geography rotate weekly; day shift 08–20, night 20–08 */
export function onCall(db: Db, dcId: string): OnCall[] {
  const dc = db.datacenters.find(d => d.id === dcId); if (!dc) return [];
  const ppl = activeGeo().people;
  const week = Math.floor(db.now / (7 * DAY));
  const h = new Date(db.now).getHours(), day = h >= 8 && h < 20;
  const base = seedOf(dc.regionId) + week;
  const at = (k: number) => ppl[(base + k * 5) % ppl.length];
  const shift = day ? 'Day 08:00–20:00' : 'Night 20:00–08:00';
  const roles: [OnCallRole, 1 | 2 | 3, number, string][] = [
    ['NOC shift lead', 1, 15, 'First response for every alarm in the region'],
    ['Network engineer', 2, 30, 'Routing, fabric, optics and cabling'],
    ['Facility engineer', 2, 30, 'Power, cooling, fire and access'],
    ['Field technician', 2, 60, `On site at ${dc.city}: hands, swaps, patching`],
    ...(db.gpu && [...db.gpu.nodes.values()].some(n => n.dcId === dcId) ? [['AI infrastructure engineer', 2, 30, 'GPU nodes, InfiniBand, schedulers'] as [OnCallRole, 1 | 2 | 3, number, string]] : []),
    ['Duty manager', 3, 60, 'Major incidents, customer and executive comms']
  ];
  return roles.map(([role, tier, esc, covers], k) => ({ role, name: at(k), tier, shift: role === 'Duty manager' ? 'Week, 24 h' : shift, escalateAfterMin: esc, covers }));
}

/* ---------------------------------------------------------------- incidents */

const GROUP: Record<Incident['type'], string> = { Network: 'NOC · Network L2', Power: 'DC Facilities', Cooling: 'DC Facilities', Rack: 'DC Operations', Capacity: 'Capacity planning', Security: 'Security operations', GPU: 'AI infrastructure' };
const ROLE_FOR: Record<Incident['type'], OnCallRole> = { Network: 'Network engineer', Power: 'Facility engineer', Cooling: 'Facility engineer', Rack: 'Field technician', Capacity: 'Network engineer', Security: 'NOC shift lead', GPU: 'AI infrastructure engineer' };
const SN_STATE: Record<Incident['status'], string> = { Open: 'New', Investigating: 'In Progress', Mitigated: 'On Hold (awaiting fix)', Resolved: 'Resolved', Closed: 'Closed' };

export function incidentOps(db: Db, id: string): IncidentOps | null {
  const inc = db.incidents.find(i => i.id === id); if (!inc) return null;
  const now = db.now, rr = mulberry32(seedOf(`${id}:ops`));
  const rota = onCall(db, inc.dcId);
  const who = (r: OnCallRole) => rota.find(x => x.role === r) ?? rota[0];
  const end = inc.resolved ?? now;
  /* paging chain: L1 at once, the owner's role (L2) when acknowledged or after its escalation time, the duty manager for Critical */
  const l1 = who('NOC shift lead'), l2 = who(ROLE_FOR[inc.type]) ?? who('Network engineer'), dm = who('Duty manager');
  const ack = inc.acknowledged;
  const paged: IncidentOps['paged'] = [{ who: l1.name, role: l1.role, at: inc.detected + MIN, ack: ack ? Math.min(ack, inc.detected + 6 * MIN) : undefined, via: 'App' }];
  const l2at = inc.detected + Math.min(l1.escalateAfterMin, ack ? Math.max(2, (ack - inc.detected) / MIN) : l1.escalateAfterMin) * MIN;
  if (l2at <= end) paged.push({ who: l2.name, role: l2.role, at: l2at, ack: ack ? Math.max(ack, l2at + 2 * MIN) : undefined, via: 'Phone' });
  if (inc.sev === 1 && inc.detected + 30 * MIN <= end) paged.push({ who: dm.name, role: dm.role, at: inc.detected + 30 * MIN, ack: inc.detected + 34 * MIN, via: 'Phone' });
  const nextEscalation = open(inc) && !ack ? { who: dm.name, role: dm.role, at: inc.detected + 60 * MIN } : open(inc) && inc.sev <= 2 && !paged.some(p => p.role === 'Duty manager') ? { who: dm.name, role: dm.role, at: inc.detected + inc.resolveSlaMin * 0.75 * MIN } : null;

  /* customer notices: initial within 15 / 30 / 60 min by severity, then updates every 1 / 2 / 4 h until resolved */
  const every = inc.sev === 1 ? 60 : inc.sev === 2 ? 120 : 240;
  const notices: IncidentOps['notices'] = [];
  let nextUpdate: number | null = null;
  if (inc.impact.customers > 0 && inc.sev <= 3) {
    const first = inc.detected + (inc.sev === 1 ? 15 : inc.sev === 2 ? 30 : 60) * MIN;
    const base = { recipients: inc.impact.customers, premium: inc.impact.premium, channel: 'Email + portal' as const };
    if (first <= end) {
      notices.push({ ...base, at: first, kind: 'Initial notice', state: 'sent', text: `We are aware of ${inc.impact.summary.toLowerCase().startsWith('no') ? 'an issue' : 'an issue affecting your services'} at ${inc.dcId}. Engineers are working on it; next update within ${every / 60} h.` });
      /* one open incident in a few has missed its last update: the notice is overdue */
      const missLast = open(inc) && chance(rr, 0.25);
      for (let t = first + every * MIN; t <= end; t += every * MIN) notices.push({ ...base, channel: 'Portal', at: t, kind: 'Update', state: 'sent', text: inc.status === 'Mitigated' ? 'Service restored on a workaround; the permanent fix is scheduled.' : 'Investigation continues; impact unchanged.' });
      const last = notices[notices.length - 1].at;
      nextUpdate = open(inc) ? last + every * MIN : null;
      if (missLast && notices.length > 1) { const lost = notices.pop()!; nextUpdate = lost.at; }
      if (nextUpdate && nextUpdate < now) notices.push({ ...base, channel: 'Portal', at: nextUpdate, kind: 'Update', state: 'overdue', text: `Update owed since ${new Date(nextUpdate).toISOString().slice(11, 16)} UTC` });
      else if (nextUpdate) notices.push({ ...base, channel: 'Portal', at: nextUpdate, kind: 'Update', state: 'scheduled', text: 'Next scheduled update' });
      if (inc.resolved) notices.push({ ...base, at: inc.resolved + 20 * MIN, kind: 'Resolution', state: inc.resolved + 20 * MIN <= now ? 'sent' : 'scheduled', text: 'Resolved; root cause summary to follow in the post-incident report.' });
    }
  }
  const problem = problems(db).find(p => p.incidents.includes(id));
  return {
    incidentId: id, itsm: { system: 'ServiceNow', ref: `INC${String(seedOf(id) % 9000000 + 1000000)}`, state: SN_STATE[inc.status], group: GROUP[inc.type], synced: now - intBetween(rr, 1, 6) * MIN },
    paged, nextEscalation, notices, nextUpdate, updateEveryMin: every, ...(problem ? { problemId: problem.id } : {})
  };
}

/* ---------------------------------------------------------------- problems */

const norm = (db: Db, i: Incident) => {
  const c = i.rca[0]?.cause;
  const base = c && !/postmortem/i.test(c) ? c : i.title;
  let t = base;
  for (const d of db.datacenters) t = t.split(d.id).join('');
  return t.replace(/\b[A-Z]{2,}-[A-Z0-9-]+\b/g, '').replace(/\b\d+(\.\d+)?\b/g, '#').replace(/\s+[—–-]\s+.*$/, '').replace(/\s{2,}/g, ' ').trim();
};
export function problems(db: Db): Problem[] {
  if (memo && memo.db === db) return memo.problems;
  const groups = new Map<string, Incident[]>();
  for (const i of db.incidents) {
    /* an incident whose evidence or plan names an optics lot belongs to that lot's problem */
    const lot = /SFP lot (\w+)|lot (\d+[A-Z])/.exec(JSON.stringify([i.rca, i.actions]));
    const k = lot ? `Network|Optic degradation (SFP lot ${lot[1] ?? lot[2]})` : `${i.type}|${norm(db, i)}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const out: Problem[] = [];
  for (const [k, xs] of groups) {
    if (xs.length < 2) continue;
    const [type] = k.split('|') as [Incident['type']];
    const rr = mulberry32(seedOf(k));
    const chg = xs.flatMap(i => i.changeIds).map(id => db.changes.find(c => c.id === id)).find(c => c && c.status !== 'Completed' && c.status !== 'Rolled back');
    const anyOpen = xs.some(open);
    const lead = xs.find(i => i.rca[0] && !/postmortem/i.test(i.rca[0].cause)) ?? xs[0];
    const title = (k.startsWith('Network|Optic degradation (SFP lot') ? k.split('|')[1] : norm(db, lead)).replace(/#/g, 'N').replace(/^./, c => c.toUpperCase());
    out.push({
      id: `PRB-${String(seedOf(k) % 9000 + 1000)}`, title, type, state: chg ? 'Fix in change' : anyOpen ? 'Investigating' : 'Known error', incidents: xs.map(i => i.id), open: xs.filter(open).length,
      sites: [...new Set(xs.map(i => i.dcId))], firstSeen: Math.min(...xs.map(i => i.detected)), lastSeen: Math.max(...xs.map(i => i.detected)),
      ...playbook(title, type),
      ...(chg ? { changeId: chg.id } : {}), owner: pick(rr, activeGeo().people)
    });
  }
  out.sort((a, b) => b.open - a.open || b.incidents.length - a.incidents.length);
  memo = { db, problems: out };
  return out;
}

/* workaround + permanent fix by what the cause says */
function playbook(title: string, type: Incident['type']): { workaround: string; fix: string } {
  const t = title.toLowerCase();
  if (/optic|sfp|patch-cord/.test(t)) return { workaround: 'Move traffic to the parallel span; swap the optic from a spare lot and clean the patch', fix: 'Replace every optic from the affected lot under a vendor field notice; inspect the ODF jumpers' };
  if (/pdu|breaker|loss of power/.test(t)) return { workaround: 'Reset the outlet / breaker after checking the cabinet load; the device rides on its other cord', fix: 'Re-balance the cabinet across phases and both sides; replace the PDU if trips recur' };
  if (/psu|power supply/.test(t)) return { workaround: 'Run on the healthy supply; avoid maintenance on the other PDU side', fix: 'Swap the failed PSU under RMA; track PSU failures by model and batch' };
  if (/power budget|over budget/.test(t)) return { workaround: 'Cap or move the newest load out of the cabinet', fix: 'Raise the cabinet circuit rating or spread equipment across racks before installs' };
  if (/ups|bypass/.test(t)) return { workaround: 'Keep the UPS in maintenance bypass only inside an approved window', fix: 'Replace the failing module / battery string; repeat the autonomy test' };
  if (/growth|port fill|utilisation|exhaust/.test(t)) return { workaround: 'Re-balance traffic onto parallel spans or free ports', fix: 'Add capacity (upgrade or new span / leaf) before the forecast threshold' };
  if (/radius|authentication/.test(t)) return { workaround: 'Fail over to the secondary RADIUS server', fix: 'Fix certificate / shared-secret drift and add RADIUS health monitoring' };
  if (/bgp|ospf|adjacency/.test(t)) return { workaround: 'Hold traffic on the stable path; dampen the flapping session', fix: 'Correct timers / MTU and the underlying physical fault' };
  if (/unreachable/.test(t)) return { workaround: 'Reach the device over out-of-band and power-cycle via the smart PDU', fix: 'Replace the failing hardware; add a second uplink where single-homed' };
  if (/tray|odf|cable/.test(t)) return { workaround: 'Move circuits to the diverse route', fix: 'Repair or replace the trunk; add a second tray route' };
  if (type === 'Cooling') return { workaround: 'Keep the spare unit running; portable cooling on standby', fix: 'Repair the unit and review the maintenance interval' };
  return { workaround: 'Follow the runbook for this alarm type', fix: 'Root cause and permanent fix to be confirmed' };
}

/* ---------------------------------------------------------------- resilience tests */

export function resilienceTests(db: Db, dcId: string, edge: EdgeStatus): ResilienceTest[] {
  const dc = db.datacenters.find(d => d.id === dcId); if (!dc || dc.status === 'planned') return [];
  const now = db.now;
  const mk = (test: ResilienceTest['test'], intervalDays: number, last: number | null, result: ResilienceTest['result'], note: string): ResilienceTest => {
    const next = (last ?? now) + intervalDays * DAY;
    const state: ResilienceTest['state'] = result === 'Fail' ? 'failed' : last === null || next < now ? 'overdue' : next - now < 21 * DAY ? 'due' : 'ok';
    return { id: `${dcId}-RT-${test.replace(/\W+/g, '').slice(0, 10)}`, dcId, test, last, result, next: last === null ? now : next, state, note };
  };
  const r = (k: string) => mulberry32(seedOf(`${dcId}:rt:${k}`));
  const ups = dc.power.ups;
  const out = [
    mk('Generator start + transfer', 30, dc.power.dg.lastTest, dc.power.dg.result, `${dc.power.dg.kva} kVA set · ${dc.power.dg.result === 'Pass' ? 'started and took load within 10 s' : 'did not take load'}`),
    mk('UPS battery autonomy', 182, now - intBetween(r('ups'), 30, 200) * DAY, ups.some(u => u.batteryMin < 15) ? 'Partial' : 'Pass', `${ups.length} modules · shortest ${Math.min(...ups.map(u => u.batteryMin))} min at load`),
    mk('ATS transfer', 182, now - intBetween(r('ats'), 20, 210) * DAY, 'Pass', dc.power.feeds.filter(f => f.type === 'AC').length > 1 ? 'Feed A → B and back, no drop' : 'Utility → generator only (one feed)'),
    mk('Cooling unit failover', 91, now - intBetween(r('cool'), 10, 110) * DAY, 'Pass', `${dc.cooling.redundancy} design · spare unit took the load`),
    mk('Backhaul failover', 91, now - intBetween(r('bh'), 10, 120) * DAY, edge.state === 'isolated' ? 'Fail' : 'Pass', `${edge.total} edge links · traffic moved to the parallel path`),
    mk('Site isolation (DR runbook)', 365, chance(r('dr'), 0.2) ? null : now - intBetween(r('dr'), 60, 420) * DAY, 'Pass', 'Services fail over to the paired site; runbook reviewed')
  ];
  out.forEach(t => { if (t.last === null) { t.result = 'Not run'; t.note = 'Never run at this site'; } });
  return out;
}

/* ---------------------------------------------------------------- colocation orders */

export function colocationOrders(db: Db, q: { dcId?: string; customerId?: string }): { xc: CrossConnectOrder[]; hands: RemoteHandsTicket[] } {
  if (db.persona !== 'colocation') return { xc: [], hands: [] };
  const now = db.now, ppl = activeGeo().people;
  const xc: CrossConnectOrder[] = [], hands: RemoteHandsTicket[] = [];
  const STATES: CrossConnectOrder['state'][] = ['Requested', 'Approved', 'Patched', 'Tested', 'Handed over'];
  for (const s of db.services.filter(s => s.type === 'Cross-connect' && (!q.dcId || s.dcId === q.dcId) && (!q.customerId || s.customerId === q.customerId))) {
    const rr = mulberry32(seedOf(`${s.id}:xc`));
    const ordered = now - intBetween(rr, 20, 400) * DAY;
    const rk = db.datacenters.find(d => d.id === s.dcId)?.racks.find(r => r.tenantId === s.customerId);
    xc.push({ id: `XC-${String(seedOf(s.id) % 90000 + 10000)}`, dcId: s.dcId, customerId: s.customerId, from: rk ? `${rk.name} (tenant cabinet)` : 'Tenant cabinet', to: `${s.neId.replace(`${s.dcId}-`, '')} ${s.ifName}`, media: chance(rr, 0.7) ? 'SMF LC' : chance(rr, 0.5) ? 'MMF LC' : 'Cat6A', state: 'Handed over', ordered, due: ordered + 5 * DAY, serviceId: s.id });
  }
  /* new orders in flight: one or two per site with tenants */
  const sites = db.datacenters.filter(d => (!q.dcId || d.id === q.dcId) && d.status !== 'planned');
  for (const dc of sites) {
    const tenants = [...new Set(dc.racks.filter(r => r.tenantId && (!q.customerId || r.tenantId === q.customerId)).map(r => r.tenantId!))];
    tenants.forEach((t, i) => {
      const rr = mulberry32(seedOf(`${dc.id}:${t}:orders`));
      const rk = dc.racks.find(r => r.tenantId === t)!;
      if (chance(rr, 0.35)) {
        const ordered = now - intBetween(rr, 1, 9) * DAY;
        xc.push({ id: `XC-${String(seedOf(dc.id + t) % 90000 + 10000)}`, dcId: dc.id, customerId: t, from: `${rk.name} (tenant cabinet)`, to: pick(rr, ['Carrier POP · MMR panel 3', 'Cloud on-ramp · MMR panel 7', 'Peering fabric · MMR panel 2', 'Other tenant · cage cross-connect']), media: 'SMF LC', state: STATES[intBetween(rr, 0, 3)], ordered, due: ordered + 5 * DAY });
      }
      const n = intBetween(rr, 0, 2);
      for (let k = 0; k < n; k++) {
        const opened = now - intBetween(rr, 1, 160) * HOUR;
        const st: RemoteHandsTicket['state'] = now - opened > 48 * HOUR ? 'Done' : chance(rr, 0.5) ? 'In progress' : 'Open';
        hands.push({ id: `RH-${String(seedOf(`${dc.id}${t}${k}`) % 90000 + 10000)}`, dcId: dc.id, customerId: t, task: pick(rr, ['Power-cycle a server (outlet reboot)', 'Re-seat a transceiver and check light', 'Swap a failed disk from tenant spares', 'Photograph cabinet rear for audit', 'Patch a new cross-connect into the tenant panel', 'Escort a vendor engineer to the cage']),
          state: st, opened, minutes: st === 'Done' ? intBetween(rr, 15, 75) : st === 'In progress' ? intBetween(rr, 5, 30) : 0, engineer: pick(rr, ppl) });
      }
      void i;
    });
  }
  return { xc: xc.sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state) || b.ordered - a.ordered), hands: hands.sort((a, b) => b.opened - a.opened) };
}
