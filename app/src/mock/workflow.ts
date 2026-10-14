/* Work orders and processes (14-Oct-2026, P2B gap fill step B). P2B's 12 process definitions (P01 site onboarding … P12 access request)
   with their lanes and steps, run over OUR records: every delivery work order is a P10 work-order instance, contractor visits are P12
   access requests, open changes P05, open incidents P04, maintenance changes P11, the firmware / decommission / hall fit-out / cage
   projects P07 / P08 / P02 / P03, plans in review P06, sites being built P01. A running instance waits on its current step; a user step
   is a task (candidate role = the lane) that can be claimed and completed with its form; completing a P10 step moves the delivery work
   order itself. Past steps get seeded timings, so cycle time, SLA, waiting time and bottlenecks are computed, not typed in.
   Derived per call (cheap); the user's moves live in an overlay cleared on regeneration. */
import type { WfEvent, WfField, WfInstance, WfKpis, WfProcess, WfStep, WfTask, WorkOrder, WorkOrderDetail } from '../api/types';
import type { Db } from './generate';
import { activeGeo } from './geo';
import { mulberry32, seedOf, between } from '../lib/rng';
import { deliveryProjects, setWorkOrderAssignment, setWorkOrderState, advanceWorkOrder } from './delivery';
import { changeRegister } from './changemgmt';

const H = 3600e3, DAY = 24 * H;
const U = (id: string, name: string, lane: string, hours: number, x: Partial<WfStep> = {}): WfStep => ({ id, name, lane, kind: 'user', hours, ...x });
const A = (id: string, name: string, lane: string, hours: number, x: Partial<WfStep> = {}): WfStep => ({ id, name, lane, kind: 'auto', hours, ...x });
const D = (id: string, name: string, lane: string, hours: number, x: Partial<WfStep> = {}): WfStep => ({ id, name, lane, kind: 'decision', hours, ...x });

type Def = Omit<WfProcess, 'running' | 'completed' | 'slaHours'>;
export const PROCESSES: Def[] = [
  { pid: 'P01', key: 'site-onboarding', name: 'Site onboarding', owner: 'Platform', description: 'Brings a new or existing site under management: register, import and validate records, enrol collectors, discover, reconcile, walk the floor and sign the cut-over.', lanes: ['DCOS', 'Platform collectors', 'Field'],
    steps: [U('reg', 'Register site', 'DCOS', 8), A('imp', 'Import records', 'Platform collectors', 4), U('val', 'Validate import', 'DCOS', 16), A('enr', 'Enrol collectors', 'Platform collectors', 8), A('disc', 'Run discovery', 'Platform collectors', 24), A('hlth', 'Check collector health', 'Platform collectors', 2), U('rec', 'Three-way reconcile', 'DCOS', 24), U('walk', 'Audit walk', 'Field', 40), U('exc', 'Resolve exceptions', 'DCOS', 24, { branch: true }), U('base', 'Baseline site', 'DCOS', 8), U('sign', 'Sign cut-over', 'DCOS', 8)] },
  { pid: 'P02', key: 'hall-fitout', name: 'Hall fit-out', owner: 'Delivery', description: 'Takes a hall from approved design to released capacity: design review, PO approval, receipt and staging, install, provisioning, commissioning L1–L5, handover.', lanes: ['Design', 'Procurement', 'Field', 'Commissioning', 'Operations'],
    steps: [U('dr', 'Design review', 'Design', 40), U('po', 'Approve POs', 'Procurement', 24), U('rcv', 'Receive & stage', 'Field', 80), U('exp', 'Expedite with vendor', 'Procurement', 24, { branch: true }), U('ins', 'Install racks, power & cabling', 'Field', 240), A('prov', 'Provision devices', 'Operations', 24), U('cx', 'Commissioning L1–L5', 'Commissioning', 160), U('fix', 'Fix defects', 'Field', 40, { branch: true }), U('ho', 'Handover sign-off', 'Operations', 16), A('rel', 'Release capacity', 'Operations', 2)] },
  { pid: 'P03', key: 'customer-onboarding', name: 'Customer onboarding', owner: 'Sales', description: 'From signed contract to billed service: placement approved against capacity, capacity reserved, equipment installed, access granted, go-live, metering.', lanes: ['Sales', 'Capacity', 'Field', 'Security', 'Billing'],
    steps: [U('scope', 'Confirm contract scope', 'Sales', 16), D('place', 'Placement approval', 'Capacity', 24), U('rev', 'Revise placement', 'Sales', 16, { branch: true }), A('res', 'Reserve capacity', 'Capacity', 2), U('inst', 'Install customer equipment', 'Field', 80), U('acc', 'Grant access', 'Security', 8), U('live', 'Go-live sign-off', 'Sales', 8), A('meter', 'Start metering', 'Billing', 2)] },
  { pid: 'P04', key: 'major-incident', name: 'Major incident', owner: 'Operations', description: 'A facility or network incident from detection to review: correlate, assess impact, acknowledge, escalate, ticket, notify customers, find the cause, remediate, close, review.', lanes: ['NOC', 'Facility', 'ITSM', 'Customer management'],
    steps: [A('corr', 'Correlate alarms', 'NOC', 0.25), D('imp', 'Assess impact', 'NOC', 0.25), U('ack', 'Acknowledge incident', 'NOC', 0.25), U('esc', 'Escalate to duty manager', 'NOC', 0.5, { branch: true }), A('tkt', 'Open ITSM ticket', 'ITSM', 0.1), U('notify', 'Notify affected customers', 'Customer management', 1), U('rca', 'Root cause analysis', 'Facility', 4), U('appr', 'Approve disruptive step', 'Customer management', 1, { branch: true }), U('fix', 'Execute remediation', 'Facility', 4), U('close', 'Closure checks', 'NOC', 1), A('res', 'Resolve & update ticket', 'ITSM', 0.25), U('pir', 'Post-incident review', 'Customer management', 72)] },
  { pid: 'P05', key: 'change', name: 'Change', owner: 'Governance', description: 'A change request end to end: complete the request, preview impact, set the risk and approval path, approve, schedule the window, implement (or roll back), verify, close.', lanes: ['Requester', 'Approvers', 'Field', 'NOC'],
    steps: [U('req', 'Complete change request', 'Requester', 8), A('prev', 'Impact preview', 'NOC', 0.5), D('risk', 'Risk & approval path', 'Approvers', 1), U('appr', 'Approve change', 'Approvers', 24), U('sched', 'Schedule window', 'NOC', 8), U('start', 'Start implementation', 'Field', 2), U('impl', 'Implement change', 'Field', 8), U('rb', 'Roll back', 'Field', 4, { branch: true }), U('ver', 'Verify service', 'NOC', 2), U('close', 'Complete & close', 'Requester', 8)] },
  { pid: 'P06', key: 'capacity-expansion', name: 'Capacity expansion', owner: 'Capacity', description: 'When a forecast crosses a threshold: what-if options, the design authority chooses, the approval limit routes the budget, a programme is created and the design baselined.', lanes: ['Capacity', 'Finance', 'Design authority'],
    steps: [A('opt', 'Options & what-if', 'Capacity', 8), U('choose', 'Choose option', 'Design authority', 40), D('lim', 'Approval limit', 'Finance', 1), U('budget', 'Approve budget', 'Finance', 80), U('rework', 'Rework options', 'Capacity', 40, { branch: true }), A('prog', 'Create programme', 'Capacity', 2), U('base', 'Baseline design', 'Design authority', 24)] },
  { pid: 'P07', key: 'firmware-campaign', name: 'Firmware campaign', owner: 'Network', description: 'Remediates a posture finding across the fleet in waves: plan the waves, approve each, push firmware, recover by hand where needed, verify, close the finding.', lanes: ['Network', 'Change', 'Field'],
    steps: [U('plan', 'Plan waves', 'Network', 24), U('appr', 'Approve wave', 'Change', 24), A('push', 'Push firmware', 'Network', 4), U('rec', 'Hands-on recovery', 'Field', 8, { branch: true }), U('ver', 'Verify wave', 'Field', 8), U('close', 'Close finding', 'Network', 8)] },
  { pid: 'P08', key: 'decommission', name: 'Decommission', owner: 'Operations', description: 'Retires equipment safely: review, blocking checks (live services, open changes, holds), cease services, wipe and certify, remove under custody, dispose, close contracts.', lanes: ['Operations', 'Tenant', 'Security', 'Field', 'Finance'],
    steps: [U('rev', 'Review request', 'Operations', 16), A('chk', 'Blocking checks', 'Operations', 1), U('blk', 'Resolve blockers', 'Tenant', 40, { branch: true }), U('cease', 'Cease services', 'Tenant', 40), U('wipe', 'Wipe & certify', 'Security', 24), U('rm', 'Remove under custody', 'Field', 16), U('disp', 'Dispose / recycle', 'Field', 40), U('fin', 'Close contracts', 'Finance', 24)] },
  { pid: 'P09', key: 'reconciliation', name: 'Reconciliation', owner: 'Platform', description: 'Resolves one difference between the record and discovery: classify, the hall owner decides, confirm by a walk, update the record, write the audit entry.', lanes: ['DCOS', 'Hall owner', 'Field'],
    steps: [A('cls', 'Classify difference', 'DCOS', 1), U('dec', 'Decide', 'Hall owner', 24), U('walk', 'Confirm by walk', 'Field', 24, { branch: true }), A('upd', 'Update record', 'DCOS', 1), A('aud', 'Write audit entry', 'DCOS', 0.1)] },
  { pid: 'P10', key: 'work-order', name: 'Work order', owner: 'Field operations', description: 'The field work-order loop: skill and permit from the work type, assign and accept, request and confirm the kit, start, complete with evidence, record serials, return parts, verify, close.', lanes: ['Dispatcher', 'Technician', 'Requester', 'Supply chain'],
    steps: [D('skill', 'Required skill & permit', 'Dispatcher', 1), U('assign', 'Assign technician', 'Dispatcher', 8), U('accept', 'Accept', 'Technician', 4), A('kit', 'Request kit', 'Supply chain', 24), U('kitok', 'Confirm kit received', 'Technician', 8), U('start', 'Start work', 'Technician', 24), U('done', 'Complete with evidence', 'Technician', 40), U('serial', 'Record serials and quantities', 'Technician', 4), U('ret', 'Return unused or faulty parts', 'Technician', 8, { branch: true }), U('ver', 'Verify work', 'Requester', 16), U('close', 'Close work order', 'Dispatcher', 4)] },
  { pid: 'P11', key: 'maintenance-mode', name: 'Maintenance mode', owner: 'Facilities', description: 'Planned plant maintenance: confirm the redundancy impact, approve the window (or reschedule), enter maintenance mode, the vendor maintains, exit and record the results.', lanes: ['Facility', 'Approvers', 'Vendor'],
    steps: [U('imp', 'Confirm redundancy impact', 'Facility', 8), U('appr', 'Approve window', 'Approvers', 24), U('resched', 'Reschedule', 'Facility', 8, { branch: true }), U('enter', 'Enter maintenance mode', 'Facility', 1), U('perf', 'Perform maintenance', 'Vendor', 8), U('exit', 'Exit maintenance mode', 'Facility', 1), U('rec', 'Record results', 'Facility', 8)] },
  { pid: 'P12', key: 'access-request', name: 'Access request', owner: 'Security', description: 'Controls a physical visit: the request, security approves the zones, check in, the host escorts the visit (extension if needed), check out.', lanes: ['Host', 'Security', 'Tenant'],
    steps: [U('sub', 'Submit visit request', 'Tenant', 2), U('zones', 'Approve zones', 'Security', 8), U('in', 'Check in', 'Security', 1), U('visit', 'Escorted visit', 'Host', 8), U('ext', 'Approve extension', 'Security', 1, { branch: true }), U('out', 'Check out', 'Security', 1)] },
];
const main = (d: Def) => d.steps.filter(s => !s.branch);
const def = (pid: string) => PROCESSES.find(p => p.pid === pid)!;
/* the lanes the signed-in user acts in (a delivery lead who also dispatches and approves) */
export const MY_LANES = ['Dispatcher', 'Requester', 'Approvers', 'Change', 'Design authority', 'Operations', 'Capacity', 'Host', 'Hall owner', 'Network'];

/* a task's form, from what the step does */
function formFor(s: WfStep): WfField[] {
  if (/^approve|approval|decide|choose/i.test(s.name)) return [{ key: 'decision', label: 'Decision', type: 'select', options: /choose/i.test(s.name) ? ['Option A', 'Option B', 'Option C'] : ['Approve', 'Reject'], required: true }, { key: 'comment', label: 'Comment', type: 'text' }];
  if (/assign/i.test(s.name)) return [{ key: 'technician', label: 'Technician', type: 'select', options: activeGeo().people.slice(4, 10), required: true }, { key: 'note', label: 'Instructions', type: 'text' }];
  if (/serial/i.test(s.name)) return [{ key: 'serials', label: 'Serials installed', type: 'text', required: true }, { key: 'qty', label: 'Quantity used', type: 'number', required: true }];
  if (/verify|check|confirm|validate|sign/i.test(s.name)) return [{ key: 'ok', label: 'Confirmed', type: 'check', required: true }, { key: 'note', label: 'Notes', type: 'text' }];
  if (/complete with evidence|perform|implement|install|walk|remediation|visit/i.test(s.name)) return [{ key: 'evidence', label: 'Evidence / result', type: 'text', required: true }, { key: 'ok', label: 'Done as planned', type: 'check' }];
  return [{ key: 'note', label: 'Notes', type: 'text' }];
}

interface Overlay { adv: Map<string, number>; events: Map<string, WfEvent[]>; claims: Map<string, string>; retried: Set<string>; extra: { pid: string; businessKey: string; title: string; dcId: string; started: number; link?: string }[];
  assign: Map<string, { crewKind: WorkOrder['crewKind']; crew: string; technician?: string }>; ticks: Map<string, Set<string>>; signoff: Map<string, NonNullable<WorkOrderDetail['signoff']>>; failure: Map<string, NonNullable<WorkOrderDetail['failure']>>; log: Map<string, { at: number; who: string; text: string }[]> }
const ov: Overlay = { adv: new Map(), events: new Map(), claims: new Map(), retried: new Set(), extra: [], assign: new Map(), ticks: new Map(), signoff: new Map(), failure: new Map(), log: new Map() };
export const resetWorkflow = () => { ov.adv.clear(); ov.events.clear(); ov.claims.clear(); ov.retried.clear(); ov.extra.length = 0; ov.assign.clear(); ov.ticks.clear(); ov.signoff.clear(); ov.failure.clear(); ov.log.clear(); };

/* people per lane: two holders each, stable per geography */
const holders = (lane: string) => { const ppl = activeGeo().people; const k = seedOf(lane) % Math.max(1, ppl.length - 1); return [ppl[k], ppl[(k + 3) % ppl.length]].filter(Boolean) as string[]; };

/* ---------------------------------------------------------------- instances */
interface Seed { pid: string; businessKey: string; title: string; dcId: string; started: number; at: number; link?: string; incident?: string; done?: boolean }
function build(db: Db, s: Seed): WfInstance {
  const d = def(s.pid), steps = main(d), now = db.now, r = mulberry32(seedOf(`wf:${s.pid}:${s.businessKey}`));
  const id = `WF-${s.pid}-${s.businessKey}`;
  const base = s.done ? steps.length : Math.min(steps.length - 1, Math.max(0, s.at));
  const extra = ov.adv.get(id) ?? 0;
  const idx = Math.min(steps.length, base + extra);
  /* seeded timings for the steps done before the overlay, compressed so they end before now */
  const took = steps.slice(0, base).map(st => Math.max(0.05, st.hours * between(r, 0.35, 1.6)));
  const sum = took.reduce((a, x) => a + x, 0) * H;
  const f = s.started + sum > now - (s.done ? 0 : 2 * H) ? Math.max(0.05, (now - s.started - (s.done ? 0 : 2 * H)) / Math.max(1, sum)) : 1;
  let t = s.started;
  const hist: WfEvent[] = steps.slice(0, base).map((st, i) => { t += took[i] * H * f; return { stepId: st.id, step: st.name, lane: st.lane, who: st.kind === 'user' ? holders(st.lane)[i % 2] : 'System', at: t, tookHours: Math.round(took[i] * f * 10) / 10 }; });
  hist.push(...(ov.events.get(id) ?? []));
  const last = hist.length ? hist[hist.length - 1].at : s.started;
  const done = idx >= steps.length;
  const cur = steps[Math.min(idx, steps.length - 1)];
  const incident = !done && s.incident && !ov.retried.has(id) && extra === 0 ? s.incident : undefined;
  const due = s.started + steps.reduce((a, x) => a + x.hours, 0) * H;
  return { id, pid: d.pid, key: d.key, process: d.name, businessKey: s.businessKey, title: s.title, dcId: s.dcId, started: s.started, due, ended: done ? last : undefined,
    state: done ? 'Completed' : incident ? 'Incident' : 'Running', stepIndex: idx, stepId: cur.id, step: done ? 'Completed' : cur.name, lane: cur.lane, waitingSince: last,
    overdue: !done && now - last > cur.hours * H, history: hist, link: s.link, incidentText: incident };
}

function seeds(db: Db): Seed[] {
  const now = db.now, out: Seed[] = [];
  const vs = deliveryProjects(db);
  /* P10 work orders + P12 contractor visits */
  for (const v of vs) for (const w of v.workOrders) {
    if (w.state === 'Planned' && w.start > now + 21 * DAY) continue;
    const at = w.state === 'Done' ? 99 : w.state === 'In progress' ? 6 : w.state === 'Ready' ? 4 : w.state === 'Awaiting change' ? 3 : w.state === 'Failed' ? 6 : 1;
    out.push({ pid: 'P10', businessKey: w.id, title: w.title, dcId: w.dcId, started: Math.min(now - 2 * H, w.start - 10 * DAY), at, done: w.state === 'Done', link: `/delivery/work-orders/${w.id}`,
      incident: w.state === 'Awaiting change' && w.kit === 'Partial' ? 'Request kit: the supply-chain platform rejected the reservation (stock below the reorder level)' : undefined });
    if (w.crewKind === 'Contractor' && (w.state === 'In progress' || w.state === 'Done' || (w.state === 'Ready' && w.start < now + 7 * DAY)))
      out.push({ pid: 'P12', businessKey: `${w.id}-V`, title: `${w.crew} · ${w.title}`, dcId: w.dcId, started: Math.min(now - 3 * H, w.start - 3 * DAY), at: w.state === 'Done' ? 99 : w.state === 'In progress' ? 3 : 1, done: w.state === 'Done', link: `/delivery/work-orders/${w.id}` });
  }
  /* P05 changes (operations + maintenance), P11 maintenance windows */
  const reg = changeRegister(db);
  let pmDone = 0;
  for (const c of [...reg.changes].sort((x, y) => y.windowStart - x.windowStart)) {
    if (c.source === 'Delivery') continue;
    if (c.source === 'Maintenance' && ['Completed', 'Rolled back', 'Rejected'].includes(c.status) && ++pmDone > 20) continue;
    const at = c.status === 'Draft' ? 0 : c.status === 'Pending approval' ? 3 : c.status === 'Approved' ? 4 : c.status === 'In progress' ? 6 : 99;
    const done = ['Completed', 'Rolled back', 'Rejected'].includes(c.status);
    if (done && c.windowEnd < now - (c.source === 'Maintenance' ? 30 : 90) * DAY) continue;
    out.push({ pid: c.source === 'Maintenance' ? 'P11' : 'P05', businessKey: c.id, title: c.title, dcId: c.dcId, started: Math.min(now - H, c.created), at: c.source === 'Maintenance' ? (c.status === 'In progress' ? 4 : c.status === 'Approved' ? 2 : 1) : at, done, link: `/changes/${c.id}` });
  }
  /* P04 incidents (critical and high) */
  for (const i of db.incidents) {
    if (i.sev > 2) continue;
    const done = i.status === 'Resolved' || i.status === 'Closed';
    out.push({ pid: 'P04', businessKey: i.id, title: i.title, dcId: i.dcId, started: i.detected, at: i.status === 'Open' ? (i.acknowledged ? 5 : 2) : i.status === 'Investigating' ? 5 : i.status === 'Mitigated' ? 7 : 99, done, link: `/incidents/${i.id}` });
  }
  /* projects that run a whole process */
  for (const v of vs) {
    const p = v.project, t = p.template ?? '';
    const pick = /Firmware/.test(t) ? 'P07' : /Decommission/.test(t) ? 'P08' : p.scope === 'new-hall' ? 'P02' : /cage|cluster/i.test(p.name) ? 'P03' : '';
    if (!pick) continue;
    const n = main(def(pick)).length;
    out.push({ pid: pick, businessKey: p.id, title: p.name, dcId: p.dcId, started: Math.min(now - 2 * H, p.start - 7 * DAY), at: p.state === 'Delivered' ? 99 : Math.max(1, Math.min(n - 1, Math.round(p.progress * n))), done: p.state === 'Delivered', link: `/delivery/projects/${p.id}`,
      incident: pick === 'P07' && p.state !== 'Delivered' ? 'Push firmware: 2 devices did not come back after the reload (BDR-02, FW-02); hands-on recovery needed' : undefined });
  }
  /* P01 sites being built, P06 plans in review */
  for (const dc of db.datacenters.filter(d => d.status !== 'on-air')) out.push({ pid: 'P01', businessKey: dc.id, title: `${dc.id} · ${dc.city}`, dcId: dc.id, started: now - 40 * DAY, at: dc.status === 'planned' ? 1 : 4, link: `/datacenters/${dc.id}` });
  /* history: a few completed runs per process over the last quarter, so the KPIs have a base */
  const live = db.datacenters.filter(d => d.status === 'on-air');
  for (const d of PROCESSES) {
    const r = mulberry32(seedOf(`wfhist:${d.pid}`));
    const k = d.pid === 'P10' || d.pid === 'P05' ? 4 : 6;
    for (let i = 0; i < k; i++) { const dc = live[Math.floor(r() * live.length)] ?? db.datacenters[0]; out.push({ pid: d.pid, businessKey: `H${String(i + 1).padStart(2, '0')}`, title: `${d.name} · ${dc.id} (closed)`, dcId: dc.id, started: now - Math.round(between(r, 12, 110)) * DAY, at: 99, done: true }); }
  }
  for (const x of ov.extra) out.push({ ...x, at: 0 });
  return out;
}
/* cached per data version: delivery views and the change register are themselves cached objects, the overlay has a revision */
const sig = () => `${[...ov.adv].join(',')}|${[...ov.events.values()].reduce((a, e) => a + e.length, 0)}|${ov.retried.size}|${ov.extra.length}`;
let iCache: { dv: unknown; reg: unknown; sig: string; now: number; list: WfInstance[] } | null = null;
export function instances(db: Db): WfInstance[] {
  const dv = deliveryProjects(db), reg = changeRegister(db);
  const k = sig();
  if (iCache && iCache.dv === dv && iCache.reg === reg && iCache.sig === k && iCache.now === db.now) return iCache.list;
  const list = seeds(db).map(s => build(db, s));
  iCache = { dv, reg, sig: k, now: db.now, list };
  return list;
}

export function processes(db: Db): WfProcess[] {
  const is = instances(db);
  return PROCESSES.map(d => ({ ...d, steps: d.steps.map(s => ({ ...s, form: s.kind === 'user' ? formFor(s) : undefined })), running: is.filter(i => i.pid === d.pid && i.state !== 'Completed').length, completed: is.filter(i => i.pid === d.pid && i.state === 'Completed').length, slaHours: main(d).reduce((a, s) => a + s.hours, 0) }));
}

export function tasks(db: Db): WfTask[] {
  return instances(db).filter(i => i.state === 'Running').flatMap(i => {
    const st = main(def(i.pid))[i.stepIndex]; if (!st || st.kind !== 'user') return [];
    const tid = `${i.id}:${st.id}`;
    const cands = [...holders(st.lane), ...(MY_LANES.includes(st.lane) ? [ME_NAME()] : [])];
    const seeded = seedOf(tid) % 3 === 0 ? holders(st.lane)[0] : undefined;
    return [{ id: tid, instanceId: i.id, pid: i.pid, process: i.process, title: i.title, step: st.name, stepId: st.id, lane: st.lane, candidates: [...new Set(cands)], assignee: ov.claims.get(tid) ?? seeded, created: i.waitingSince, due: i.waitingSince + st.hours * H, overdue: i.overdue, dcId: i.dcId, businessKey: i.businessKey, form: formFor(st), link: i.link }];
  });
}
let meName = 'Jayesh Verma';
export const setWorkflowUser = (n: string) => { meName = n; };
const ME_NAME = () => meName;

export function claimTask(db: Db, tid: string, who: string) {
  const t = tasks(db).find(x => x.id === tid); if (!t) throw new Error('The task is no longer open');
  if (!t.candidates.includes(who)) throw new Error(`Only the ${t.lane.toLowerCase()} lane can take this task`);
  ov.claims.set(tid, who);
}
export function completeTask(db: Db, tid: string, data: Record<string, string | boolean | number>, who: string) {
  const t = tasks(db).find(x => x.id === tid); if (!t) throw new Error('The task is no longer open');
  if (t.assignee && t.assignee !== who) throw new Error(`${t.assignee} has claimed this task`);
  if (!t.candidates.includes(who)) throw new Error(`Only the ${t.lane.toLowerCase()} lane can complete this task`);
  for (const f of t.form) if (f.required && (data[f.key] === undefined || data[f.key] === '' || data[f.key] === false)) throw new Error(`${f.label} is required`);
  const i = instances(db).find(x => x.id === t.instanceId)!;
  /* a P10 step that is the work itself moves the delivery work order */
  if (t.pid === 'P10' && (t.stepId === 'start' || t.stepId === 'done')) advanceWorkOrder(db, t.businessKey, who);
  if (data.decision === 'Reject') ov.log.set(t.businessKey, [...(ov.log.get(t.businessKey) ?? []), { at: db.now, who, text: `${t.step}: rejected${data.comment ? ` (${data.comment})` : ''}` }]);
  ov.events.set(i.id, [...(ov.events.get(i.id) ?? []), { stepId: t.stepId, step: t.step, lane: t.lane, who, at: db.now, tookHours: Math.round(((db.now - i.waitingSince) / H) * 10) / 10, data }]);
  ov.adv.set(i.id, (ov.adv.get(i.id) ?? 0) + 1);
  ov.claims.delete(tid);
  /* the next automatic steps run straight away */
  let n = instances(db).find(x => x.id === i.id)!;
  for (let k = 0; k < 4 && n.state === 'Running' && main(def(n.pid))[n.stepIndex]?.kind !== 'user'; k++) {
    const st = main(def(n.pid))[n.stepIndex];
    ov.events.set(n.id, [...(ov.events.get(n.id) ?? []), { stepId: st.id, step: st.name, lane: st.lane, who: 'System', at: db.now, tookHours: 0 }]);
    ov.adv.set(n.id, (ov.adv.get(n.id) ?? 0) + 1);
    n = instances(db).find(x => x.id === i.id)!;
  }
  return n;
}
export function retryInstance(db: Db, id: string, who: string) {
  const i = instances(db).find(x => x.id === id); if (!i) throw new Error('Unknown instance');
  if (i.state !== 'Incident') throw new Error('Nothing to retry');
  ov.retried.add(id);
  ov.events.set(id, [...(ov.events.get(id) ?? []), { stepId: i.stepId, step: `${i.step} (retried)`, lane: i.lane, who, at: db.now, tookHours: Math.round(((db.now - i.waitingSince) / H) * 10) / 10 }]);
  ov.adv.set(id, (ov.adv.get(id) ?? 0) + 1);
}

export function kpis(db: Db): WfKpis {
  const is = instances(db);
  const perProcess = PROCESSES.map(d => { const done = is.filter(i => i.pid === d.pid && i.state === 'Completed'); const sla = main(d).reduce((a, s) => a + s.hours, 0);
    const cyc = done.map(i => ((i.ended ?? i.started) - i.started) / H);
    return { pid: d.pid, name: d.name, completed: done.length, running: is.filter(i => i.pid === d.pid && i.state !== 'Completed').length, avgCycleHours: cyc.length ? Math.round((cyc.reduce((a, x) => a + x, 0) / cyc.length) * 10) / 10 : 0, slaPct: cyc.length ? Math.round((cyc.filter(c => c <= sla).length / cyc.length) * 100) : 0, slaHours: sla }; });
  const perTask: WfKpis['perTask'] = [];
  const heat: WfKpis['heat'] = [];
  for (const d of PROCESSES) {
    const row: WfKpis['heat'][number] = { pid: d.pid, process: d.name, cells: [] };
    for (const st of main(d)) {
      const ev = is.filter(i => i.pid === d.pid).flatMap(i => i.history.filter(h => h.stepId === st.id));
      const w = ev.map(e => e.tookHours).sort((a, b) => a - b);
      const avg = w.length ? w.reduce((a, x) => a + x, 0) / w.length : null;
      row.cells.push({ step: st.name, avgWait: avg == null ? null : Math.round(avg * 10) / 10 });
      if (st.kind === 'user' && w.length) perTask.push({ pid: d.pid, process: d.name, step: st.name, lane: st.lane, n: w.length, avgWait: Math.round(avg! * 10) / 10, p90: w[Math.min(w.length - 1, Math.floor(w.length * 0.9))], onTimePct: Math.round((w.filter(x => x <= st.hours).length / w.length) * 100) });
    }
    heat.push(row);
  }
  const sites = new Map<string, { dcId: string; running: number; completed: number }>();
  for (const i of is) { const x = sites.get(i.dcId) ?? { dcId: i.dcId, running: 0, completed: 0 }; i.state === 'Completed' ? x.completed++ : x.running++; sites.set(i.dcId, x); }
  return { perProcess, perTask: perTask.sort((a, b) => b.avgWait / Math.max(0.1, b.n) - a.avgWait / Math.max(0.1, a.n)), bySite: [...sites.values()].sort((a, b) => b.running - a.running), heat };
}

/* ---------------------------------------------------------------- the work order itself (delivery) */
const CHECKS: Record<WorkOrder['kind'], string[]> = {
  Install: ['Method statement and permit-to-work approved', 'Rack position, U and power outlets confirmed against DCIM', 'Devices racked, labelled and both PSUs on A and B', 'Cabled to the patch panel; labels match the cable schedule', 'Powered up; management address reachable'],
  Cabling: ['Cable schedule issued for construction', 'Trunks pulled and dressed in the tray', 'Fibre cleaned, scoped and terminated', 'Every link tested (loss within budget)', 'Labels on both ends; as-built marked up'],
  Electrical: ['Isolation plan agreed with facilities', 'Lock-out / tag-out in place', 'Busway / PDU installed and torque-checked', 'Insulation and continuity tested', 'Energised in sequence; load verified'],
  Mechanical: ['Isolation of the cooling loop agreed', 'Units placed and levelled', 'Pipework pressure-tested', 'Controls connected to the BMS', 'Duty / standby changeover tested'],
  Commissioning: ['Test scripts approved', 'Witness booked', 'Load banks connected', 'Each test step run and recorded', 'Snags logged'],
  Migration: ['Rollback plan and window approved', 'Customer notified', 'Workloads drained', 'Moved and re-cabled', 'Services verified by the owner'],
  Civil: ['Site induction for every operative', 'Safe system of work approved', 'Works done to the drawings', 'Inspection signed by the engineer', 'Area left clean and safe'],
  Decommission: ['No live service on the device (checked)', 'Data wiped and certified', 'Removed under custody (serials recorded)', 'Rack space and cables released in DCIM', 'Asset sent for recycling'],
};
const BACKOUT: Record<WorkOrder['kind'], string> = {
  Install: 'Leave the devices powered off and unpatched; release the reserved U; no service is affected.', Cabling: 'Unpatch the new links; the existing paths stay in service.', Electrical: 'Re-energise from the existing supply; the new busway stays isolated.',
  Mechanical: 'Return the loop to the existing units; the new units stay isolated.', Commissioning: 'Stop the test, remove the load banks, restore normal running.', Migration: 'Move the workloads back to the source; keep the target in standby.',
  Civil: 'Make the area safe and stop work; reschedule with the contractor.', Decommission: 'Re-rack and re-cable the device; restore its services from the change record.',
};
export function workOrderDetail(db: Db, woId: string): WorkOrderDetail | null {
  const v = deliveryProjects(db).find(x => x.workOrders.some(w => w.id === woId)); if (!v) return null;
  const wo = v.workOrders.find(w => w.id === woId)!;
  const ticks = ov.ticks.get(woId) ?? new Set<string>();
  const done = wo.state === 'Done';
  const checklist = CHECKS[wo.kind].map((text, i) => { const id = `c${i + 1}`; const on = done || ticks.has(id) || (wo.state === 'In progress' && i < 2); return { id, text, done: on, by: on ? (done ? v.project.manager : 'Site lead') : undefined }; });
  const is = instances(db);
  const visit = is.find(i => i.pid === 'P12' && i.businessKey === `${woId}-V`) ?? is.find(i => i.pid === 'P12' && i.businessKey === woId);
  const access: WorkOrderDetail['access'] = visit ? { state: visit.state === 'Completed' ? 'Checked out' : visit.stepIndex >= 3 ? 'Checked in' : visit.stepIndex >= 2 ? 'Approved' : 'Requested', zones: wo.rackIds.length ? `${wo.rackIds.length} racks in the hall` : 'Work area and route', instanceId: visit.id }
    : { state: wo.crewKind === 'Contractor' ? 'Not requested' : 'Not needed', zones: '' };
  const reg = changeRegister(db).changes.find(c => c.woId === woId || c.id === wo.changeId);
  const a = ov.assign.get(woId);
  return {
    wo, project: v.project, checklist, backout: BACKOUT[wo.kind], technician: a?.technician ?? (wo.crewKind === 'Own technicians' ? activeGeo().people[(seedOf(woId) % 5) + 4] : undefined), access,
    signoff: ov.signoff.get(woId) ?? (done ? { doneBy: wo.crew, confirmedBy: v.project.manager, witness: false, notes: 'Completed as planned', at: wo.end } : undefined), failure: ov.failure.get(woId),
    pos: v.pos.filter(o => o.due <= wo.start + 7 * DAY || /Racks|UPS|CDU|CRAH|GPU|Server|Equipment|Manifold/.test(o.item)),
    process: is.find(i => i.pid === 'P10' && i.businessKey === woId), change: reg ? { id: reg.id, status: reg.status, cls: reg.cls, risk: reg.risk } : { id: wo.changeId, status: wo.changeState, cls: 'Normal', risk: 'Medium' },
    history: [...v.history.filter(h => h.text.includes(woId)), ...(ov.log.get(woId) ?? [])].sort((x, y) => y.at - x.at)
  };
}
const wlog = (woId: string, who: string, text: string, at: number) => ov.log.set(woId, [...(ov.log.get(woId) ?? []), { at, who, text }]);
export function assignWorkOrder(db: Db, woId: string, x: { crewKind: WorkOrder['crewKind']; crew: string; technician?: string }, who: string) {
  const d = workOrderDetail(db, woId); if (!d) throw new Error('Unknown work order');
  if (d.wo.state === 'Done') throw new Error('The work order is done');
  if (!x.crew.trim()) throw new Error('Name the crew or the contractor');
  ov.assign.set(woId, { crewKind: x.crewKind, crew: x.crew.trim(), technician: x.technician });
  setWorkOrderAssignment(db, woId, { crewKind: x.crewKind, crew: x.crew.trim() });
  wlog(woId, who, `Assigned to ${x.crew.trim()}${x.technician ? ` (${x.technician})` : ''}`, db.now);
}
export function tickCheck(db: Db, woId: string, itemId: string, who: string) {
  const d = workOrderDetail(db, woId); if (!d) throw new Error('Unknown work order');
  if (d.wo.state !== 'In progress') throw new Error('Tick the checklist while the work is in progress');
  const s = ov.ticks.get(woId) ?? new Set<string>(); s.has(itemId) ? s.delete(itemId) : s.add(itemId); ov.ticks.set(woId, s);
  wlog(woId, who, `Checklist: ${d.checklist.find(c => c.id === itemId)?.text}`, db.now);
}
export function requestAccess(db: Db, woId: string, zones: string, who: string) {
  const d = workOrderDetail(db, woId); if (!d) throw new Error('Unknown work order');
  if (d.access.instanceId) throw new Error('Access is already requested');
  ov.extra.push({ pid: 'P12', businessKey: woId, title: `${d.wo.crew} · ${d.wo.title}`, dcId: d.wo.dcId, started: db.now, link: `/delivery/work-orders/${woId}` });
  wlog(woId, who, `Site access requested for ${d.wo.crew}: ${zones || 'work area'}`, db.now);
}
export function signOffWorkOrder(db: Db, woId: string, x: { confirmedBy: string; witness: boolean; notes: string }, who: string) {
  const d = workOrderDetail(db, woId); if (!d) throw new Error('Unknown work order');
  if (d.wo.state !== 'In progress') throw new Error('Only work in progress can be signed off');
  const open = d.checklist.filter(c => !c.done); if (open.length) throw new Error(`${open.length} checklist item${open.length === 1 ? '' : 's'} still open`);
  advanceWorkOrder(db, woId, who);
  ov.signoff.set(woId, { doneBy: d.wo.crew, confirmedBy: x.confirmedBy || who, witness: x.witness, notes: x.notes, at: db.now });
  wlog(woId, who, `Signed off as complete${x.witness ? ' (customer witnessed)' : ''}`, db.now);
}
export function failWorkOrder(db: Db, woId: string, reason: string, who: string) {
  const d = workOrderDetail(db, woId); if (!d) throw new Error('Unknown work order');
  if (d.wo.state !== 'In progress') throw new Error('Only work in progress can fail');
  if (!reason.trim()) throw new Error('Say what went wrong');
  setWorkOrderState(db, woId, 'Failed', who, `${woId} failed: ${reason.trim()}; back-out plan applied`);
  ov.failure.set(woId, { reason: reason.trim(), at: db.now, by: who });
  wlog(woId, who, `Recorded as failed: ${reason.trim()}`, db.now);
}
export function retryWorkOrder(db: Db, woId: string, who: string) {
  const d = workOrderDetail(db, woId); if (!d) throw new Error('Unknown work order');
  if (d.wo.state !== 'Failed') throw new Error('Only a failed work order can be retried');
  setWorkOrderState(db, woId, 'Ready', who, `${woId} re-planned after the failure`);
  ov.failure.delete(woId); ov.ticks.delete(woId);
  wlog(woId, who, 'Re-planned: ready to start again', db.now);
}
