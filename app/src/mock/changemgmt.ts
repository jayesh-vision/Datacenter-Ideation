/* Change management (13-Oct-2026, P2B merge phase 6). One register over every change to the estate: operations changes and maintenance
   windows (db.changes, the same records the incidents, RCA and maintenance plans point at) and the delivery change requests each work
   order carries (mock/delivery.ts). Nothing here is stored: class, approvals, freezes, conflicts, policy checks and reviews are derived.
   - Class: emergency flag → Emergency; a title that matches a standard template (pre-approved, low risk) → Standard; else Normal.
   - Approval matrix: Standard = pre-approved; Normal = change manager (+ site lead from Medium, + CAB at High); Emergency = ECAB, then a
     post-implementation review within 5 days.
   - Freezes: a site with an open Critical incident holds non-emergency changes until it is resolved; peak-season and year-end freezes
     estate-wide (the geography's own calendar).
   - Conflicts: overlapping windows at the same site on the same devices. Policies: rollback plan, freeze, maintenance hours for high risk,
     single points of failure, overlaps, overdue reviews. */
import type { Change, ChangeApprovalStep, ChangeFreeze, ChangePolicy, ChangeRecord, ChangeRegister, ChangeViolation, StandardTemplate } from '../api/types';
import type { Db } from './generate';
import { activeGeo } from './geo';
import { deliveryProjects } from './delivery';
import { sitePhys } from './physical';
import { sitePm } from './maintenance';
import { DAY, HOUR } from './seed';

const TEMPLATES: (Omit<StandardTemplate, 'uses' | 'lastUsed' | 'success'> & { match: RegExp })[] = [
  { id: 'STD-01', name: 'Replace a transceiver (SFP / QSFP)', description: 'Swap a failing optic on a redundant link; traffic stays on the other path.', risk: 'Low', checks: 'Link is redundant · spare on site · light levels after swap', match: /SFP|optic|transceiver/i },
  { id: 'STD-02', name: 'Replace a hot-swap PSU or fan', description: 'Change a failed power supply or fan module while the device runs on its other unit.', risk: 'Low', checks: 'Other PSU on a live PDU side · RMA part on site', match: /PSU|power supply|fan module/i },
  { id: 'STD-03', name: 'Preventive maintenance (OEM schedule)', description: 'Planned PM on UPS, generator, cooling or fire systems per the maintenance plan.', risk: 'Low', checks: 'Redundant unit carries the load · vendor engineer booked', match: /preventive|PM\b|inspection|battery test|load bank|filter|DG test|generator test/i },
  { id: 'STD-04', name: 'Firmware / OS patch in the vendor\'s recommended release', description: 'Patch one node of a redundant pair to the approved golden release.', risk: 'Low', checks: 'Pair partner healthy · release on the approved list', match: /firmware|patch|golden release|driver/i },
  { id: 'STD-05', name: 'Patch a cross-connect', description: 'Add or move a patch cord on the ODF / meet-me panels for a new or moved service.', risk: 'Low', checks: 'Free ports reserved · cable ID labelled', match: /cross-connect|re-patch|patch cord/i },
  { id: 'STD-06', name: 'Install a rack or a device in reserved space', description: 'Rack and stack into reserved U with both power sides and structured cabling.', risk: 'Low', checks: 'U reserved in DCIM · PDU budget below 80%', match: /install .*rack|rack[- ]and[- ]stack|racks? & PDUs|install & cable/i }
];
const short = (s: string) => s.replace(/^[A-Z]{2}-DC-\d{3}-/, '');

let cache: ChangeRegister | null = null, cacheDb: Db | null = null;
const approvalsDone = new Map<string, number>();       // change id → matrix steps approved by hand
export const clearChangeMgmt = () => { cache = null; };
export const resetChangeMgmt = () => { approvalsDone.clear(); cache = null; };
export const stepsApproved = (id: string) => approvalsDone.get(id) ?? 0;
export const approveStep = (id: string) => { approvalsDone.set(id, stepsApproved(id) + 1); cache = null; };

export function changeRegister(db: Db): ChangeRegister {
  if (cache && cacheDb === db) return cache;
  cacheDb = db; cache = build(db); return cache;
}

function matrix(cls: ChangeRecord['cls'], risk: Change['risk'], status: Change['status'], id: string, created: number, approver?: string): ChangeApprovalStep[] {
  const ppl = activeGeo().people;
  if (cls === 'Standard') return [{ role: 'Standard template', who: 'Pre-approved', decision: 'Pre-approved', at: created }];
  const roles: [string, string][] = cls === 'Emergency' ? [['Emergency CAB (duty manager)', ppl[1] ?? 'Duty manager']]
    : [['Change manager', ppl[0] ?? 'Change manager'], ...(risk !== 'Low' ? [['Site lead', ppl[3] ?? 'Site lead'] as [string, string]] : []), ...(risk === 'High' ? [['Change advisory board', 'CAB (weekly)'] as [string, string]] : [])];
  const done = ['Approved', 'In progress', 'Completed', 'Rolled back'].includes(status);
  const by = stepsApproved(id);
  return roles.map(([role, who], i) => ({ role, who: done && i === roles.length - 1 && approver ? approver : who,
    decision: status === 'Rejected' && i === Math.min(by, roles.length - 1) ? 'Rejected' : done || i < by ? 'Approved' : status === 'Pending approval' && i === by ? 'Pending' : 'Waiting',
    at: done || i < by ? created + (i + 1) * 6 * HOUR : undefined }));
}

function build(db: Db): ChangeRegister {
  const now = db.now;
  const geo = activeGeo();
  /* ---- freezes */
  const freezes: ChangeFreeze[] = [];
  for (const i of db.incidents.filter(x => x.sev === 1 && x.status !== 'Resolved' && x.status !== 'Closed'))
    freezes.push({ id: `FRZ-${i.id}`, scope: 'Site', dcId: i.dcId, title: `${i.dcId} on hold: ${i.id} is open`, reason: `${i.title}. Non-emergency changes at the site wait until the Critical incident is resolved.`, from: i.detected, to: null, allows: 'Emergency only', source: 'Incident' });
  const y = new Date(now).getFullYear();
  const cal: [string, string, number, number][] = geo.id === 'in'
    ? [['Festive peak (Diwali)', 'Peak traffic and retail load; banks and e-commerce customers ask for no changes.', Date.UTC(y, 10, 5), Date.UTC(y, 10, 12)], ['Year-end freeze', 'Financial year-end close for banking customers and reduced staffing.', Date.UTC(y, 11, 22), Date.UTC(y + 1, 0, 2)]]
    : [['Thanksgiving & Black Friday', 'Peak retail traffic; e-commerce customers ask for no changes.', Date.UTC(y, 10, 25), Date.UTC(y, 11, 1)], ['Year-end freeze', 'Holiday staffing and customers\' year-end close.', Date.UTC(y, 11, 22), Date.UTC(y + 1, 0, 2)]];
  cal.forEach(([title, reason, from, to], k) => freezes.push({ id: `FRZ-CAL-${k + 1}`, scope: 'Estate', title, reason, from, to, allows: 'Standard and emergency', source: 'Calendar' }));
  const freezeOf = (dcId: string, a: number, b: number, cls: ChangeRecord['cls']) => cls === 'Emergency' ? undefined
    : freezes.find(f => (f.scope === 'Estate' || f.dcId === dcId) && a < (f.to ?? Infinity) && b > f.from && !(f.allows === 'Standard and emergency' && cls === 'Standard'));

  /* ---- the records: operations + maintenance, then delivery change requests */
  const spofNes = new Map<string, Set<string>>();
  const spofOf = (dcId: string) => { let s = spofNes.get(dcId); if (!s) { s = new Set((sitePhys(db, dcId)?.spofs ?? []).filter(x => x.domain === 'Power' && x.neIds.length < 6).flatMap(x => x.neIds)); spofNes.set(dcId, s); } return s; };
  const recs: ChangeRecord[] = [];
  for (const c of db.changes) {
    const tpl = TEMPLATES.find(t => t.match.test(c.title));
    const cls: ChangeRecord['cls'] = c.emergency ? 'Emergency' : tpl && c.risk === 'Low' ? 'Standard' : 'Normal';
    recs.push({ id: c.id, source: c.kind === 'Maintenance' ? 'Maintenance' : 'Operations', cls, kind: c.kind, title: c.title, dcId: c.dcId, scope: c.scope, risk: c.risk, status: c.status, windowStart: c.windowStart, windowEnd: c.windowEnd,
      requester: c.requester, approver: c.approver, rollback: c.rollback, created: c.created, incidentId: c.incidentId, template: cls === 'Standard' ? tpl?.id : undefined,
      approvals: matrix(cls, c.risk, c.status, c.id, c.created, c.approver), conflicts: [], violations: [], pir: { state: 'Not needed' } });
  }
  for (const v of deliveryProjects(db)) for (const w of v.workOrders) {
    const status: Change['status'] = w.state === 'Done' ? 'Completed' : w.state === 'In progress' ? 'In progress' : w.changeState === 'Approved' ? 'Approved' : w.changeState === 'Pending approval' ? 'Pending approval' : 'Draft';
    const risk: Change['risk'] = w.kind === 'Electrical' || w.kind === 'Civil' ? 'High' : w.kind === 'Commissioning' || w.kind === 'Migration' || w.kind === 'Mechanical' ? 'Medium' : 'Low';
    const tpl = TEMPLATES.find(t => t.match.test(w.title));
    const cls: ChangeRecord['cls'] = tpl && risk === 'Low' ? 'Standard' : 'Normal';
    recs.push({ id: w.changeId, source: 'Delivery', cls, kind: 'Change', title: `${w.title} (${v.project.name})`, dcId: w.dcId, scope: w.rackIds, risk, status, windowStart: w.start, windowEnd: w.end,
      requester: v.project.manager, rollback: w.kind === 'Electrical' ? 'Isolate and leave on the existing supply path; re-energise from the old feed' : 'Revert to the state before the work order; nothing in service depends on it yet',
      created: Math.min(w.start - 10 * DAY, now), projectId: v.project.id, woId: w.id, template: cls === 'Standard' ? tpl?.id : undefined,
      approvals: matrix(cls, risk, status, w.changeId, Math.min(w.start - 10 * DAY, now)), conflicts: [], violations: [], pir: { state: 'Not needed' } });
  }
  /* preventive maintenance carried out in the last 12 weeks (the plant maintenance plan's last-done dates): completed standard windows */
  for (const d of db.datacenters) for (const t of sitePm(db, d.id) ?? []) {
    if (!t.lastDone || now - t.lastDone > 84 * DAY || t.lastDone > now) continue;
    recs.push({ id: `PMW-${t.id.replace(`${d.id}-`, `${d.id.replace(/-DC-/, '')}-`)}`, source: 'Maintenance', cls: 'Standard', kind: 'Maintenance', title: `${t.task} — ${t.asset}`, dcId: d.id, scope: [], risk: 'Low', status: 'Completed',
      windowStart: t.lastDone, windowEnd: t.lastDone + 3 * HOUR, requester: t.owner, approver: 'Pre-approved', rollback: 'Return the unit to service on its normal settings; the redundant unit carries the load', created: t.lastDone - 7 * DAY,
      template: 'STD-03', approvals: [{ role: 'Standard template', who: 'Pre-approved', decision: 'Pre-approved', at: t.lastDone - 7 * DAY }], conflicts: [], violations: [], pir: { state: 'Not needed' } });
  }
  /* ---- conflicts, freezes, policies, reviews */
  const open = (r: ChangeRecord) => !['Completed', 'Rolled back', 'Rejected'].includes(r.status);
  for (const r of recs) {
    r.conflicts = recs.filter(o => o.id !== r.id && o.dcId === r.dcId && open(o) && open(r) && o.windowStart < r.windowEnd && r.windowStart < o.windowEnd && o.scope.some(s => r.scope.includes(s))).map(o => o.id);
    /* freezes protect the live estate: building work on a site not yet in service, or civil works, is not held */
    const live = db.datacenters.find(d => d.id === r.dcId)?.status === 'on-air';
    const civil = r.source === 'Delivery' && /construction|shell|civil|permits/i.test(r.title);
    const f = open(r) && live && !civil ? freezeOf(r.dcId, r.windowStart, r.windowEnd, r.cls) : undefined;
    r.freeze = f?.id;
    const vio: ChangeViolation[] = [];
    if (!r.rollback || r.rollback.trim().length < 3) vio.push({ policy: 'POL-01', enforcement: 'Block', text: 'No rollback plan' });
    if (f) vio.push({ policy: 'POL-02', enforcement: 'Block', text: `Inside the freeze "${f.title}"` });
    const h = new Date(r.windowStart).getHours();
    if (r.risk === 'High' && r.cls !== 'Emergency' && r.source !== 'Delivery' && h >= 6 && h < 22) vio.push({ policy: 'POL-03', enforcement: 'Warn', text: `High-risk window starts at ${String(h).padStart(2, '0')}:00, outside 22:00–06:00` });
    const sp = r.scope.filter(s => spofOf(r.dcId).has(s));
    if (sp.length && r.cls !== 'Standard') vio.push({ policy: 'POL-04', enforcement: 'Warn', text: `Touches a single point of failure (${sp.map(short).join(', ')})` });
    if (r.conflicts.length) vio.push({ policy: 'POL-05', enforcement: 'Warn', text: `Overlaps ${r.conflicts.join(', ')} on the same devices` });
    if (r.cls === 'Emergency' && (r.status === 'Completed' || r.status === 'Rolled back')) {
      const due = r.windowEnd + 5 * DAY;
      r.pir = { state: now - r.windowEnd > 3 * DAY ? 'Done' : now > due ? 'Overdue' : 'Due', due };
      if (r.pir.state === 'Overdue') vio.push({ policy: 'POL-06', enforcement: 'Warn', text: 'Post-implementation review overdue' });
    } else if (r.status === 'Rolled back') r.pir = { state: now - r.windowEnd > 7 * DAY ? 'Done' : 'Due', due: r.windowEnd + 5 * DAY };
    r.violations = vio;
    /* a completed change that an incident's leading hypothesis cites is not a success: it caused the incident (and needs a review) */
    const caused = r.status === 'Completed' ? db.incidents.find(i => i.rca[0]?.evidence.some(e => e.ref === r.id)) : undefined;
    if (caused) { r.causedIncident = caused.id; r.pir = { state: caused.status === 'Closed' ? 'Done' : 'Due', due: r.windowEnd + 5 * DAY }; }
    r.outcome = caused ? 'Caused an incident' : r.status === 'Completed' ? 'Successful' : r.status === 'Rolled back' ? 'Rolled back' : r.status === 'Rejected' ? 'Rejected' : undefined;
  }
  recs.sort((a, b) => b.windowStart - a.windowStart);
  /* ---- catalogues */
  const templates: StandardTemplate[] = TEMPLATES.map(({ match: _m, ...t }) => {
    const used = recs.filter(r => r.template === t.id);
    const closed = used.filter(r => r.outcome === 'Successful' || r.outcome === 'Rolled back' || r.outcome === 'Caused an incident');
    return { ...t, uses: used.length, lastUsed: used.length ? Math.max(...used.map(r => r.windowStart)) : undefined, success: closed.length ? Math.round((closed.filter(r => r.outcome === 'Successful').length / closed.length) * 100) : 100 };
  });
  const POL: [string, string, string, 'Block' | 'Warn'][] = [
    ['POL-01', 'Rollback plan required', 'Every change states how it is reversed if verification fails.', 'Block'],
    ['POL-02', 'Respect change freezes', 'No normal change inside a freeze; standard changes only in a calendar freeze; emergencies always allowed.', 'Block'],
    ['POL-03', 'High risk in maintenance hours', 'High-risk operations changes start between 22:00 and 06:00 local time.', 'Warn'],
    ['POL-04', 'Single points of failure', 'Work on a device that has lost redundancy needs a tested rollback and the site lead.', 'Warn'],
    ['POL-05', 'No overlapping work on the same devices', 'Two open windows on the same device at the same time.', 'Warn'],
    ['POL-06', 'Review emergencies', 'An emergency change gets a post-implementation review within five days.', 'Warn']
  ];
  const policies: ChangePolicy[] = POL.map(([id, name, rule, enforcement]) => ({ id, name, rule, enforcement, violations: recs.filter(r => r.violations.some(v => v.policy === id)).length }));
  /* ---- 12 weeks of implemented changes */
  const wk0 = now - 12 * 7 * DAY;
  const weeks = Array.from({ length: 12 }, (_, k) => {
    const a = wk0 + k * 7 * DAY, b = a + 7 * DAY;
    const done = recs.filter(r => (r.status === 'Completed' || r.status === 'Rolled back') && r.windowEnd >= a && r.windowEnd < b);
    return { start: a, standard: done.filter(r => r.cls === 'Standard').length, normal: done.filter(r => r.cls === 'Normal').length, emergency: done.filter(r => r.cls === 'Emergency').length, failed: done.filter(r => r.status === 'Rolled back' || r.outcome === 'Caused an incident').length };
  });
  return { changes: recs, freezes, templates, policies, weeks };
}
