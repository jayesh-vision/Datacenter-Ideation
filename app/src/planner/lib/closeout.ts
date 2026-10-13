/**
 * Delivery feedback and completion.
 *
 * `planRecords` finds the platform records a plan created (by `plannerPlanId` and the ids in
 * the plan's artefacts — never by parsing notes). `deliveryView` turns them into what the plan's
 * Delivery tab shows: progress and RAG, actual against baseline spend, purchase orders and
 * overdue order-by dates, change requests and windows per wave, acceptance tests and permits.
 *
 * `closeoutChecks` is the completion gate: every check is read live from the platform, and a
 * check only appears when the plan has records of that kind (a plan without projects is not
 * asked for a handover certificate). The family adds its own checks (`ScopeModel.closeout`).
 * "Complete plan" is allowed only when every check is green.
 */
import type * as T from '../p2b/types';
import type { PlannerData } from './plannerData';
import { modelFor, type CloseoutCheck } from './scopes';

const PROJECT_DONE = (p: T.Project) => p.status === 'Completed' || p.percentComplete >= 100;
const CR_DONE = (c: T.ChangeRequest) => c.status === 'Implemented' || c.status === 'Closed';
const HOTO_SIGNED = (h: T.Hoto) => h.status === 'Accepted' || h.status === 'Accepted with conditions';

export interface PlanRecords {
  program?: T.Program; projects: T.Project[]; purchaseOrders: T.PurchaseOrder[]; changeRequests: T.ChangeRequest[]; windows: T.MaintenanceWindow[];
  atps: T.Atp[]; hotos: T.Hoto[]; permits: T.Permit[]; milestones: T.Milestone[]; reservations: T.CapacityReservation[]; rackReservations: T.RackReservation[];
}

/** Records that belong to the plan: tagged with its id, or listed in its artefacts. */
export function planRecords(plan: T.PlannerPlan, data: PlannerData): PlanRecords {
  const a = plan.artefacts;
  const mine = <R extends { id: string; plannerPlanId?: string }>(rows: R[], ids?: string[]) => { const set = new Set(ids ?? []); return rows.filter(r => r.plannerPlanId === plan.id || set.has(r.id)); };
  const programId = a?.programId ?? plan.programId;
  const program = programId ? data.programs.find(p => p.id === programId) : undefined;
  // Projects of the programme count only when the programme itself belongs to the plan.
  const projects = data.projects.filter(p => p.plannerPlanId === plan.id || (a?.projectIds ?? []).includes(p.id) || (program?.plannerPlanId === plan.id && p.programId === program.id));
  const projectIds = new Set(projects.map(p => p.id));
  const changeRequests = mine(data.changeRequests, [...(a?.changeRequestIds ?? []), ...(a?.changeRequestId ? [a.changeRequestId] : [])]);
  return {
    program, projects,
    purchaseOrders: mine(data.purchaseOrders, a?.purchaseOrderIds),
    changeRequests,
    windows: mine(data.maintenanceWindows, a?.maintenanceWindowIds),
    atps: data.atps.filter(x => x.plannerPlanId === plan.id || (a?.atpIds ?? []).includes(x.id) || projectIds.has(x.projectId)),
    hotos: data.hotos.filter(h => projectIds.has(h.projectId)),
    permits: mine(data.permits, a?.permitIds),
    milestones: data.milestones.filter(m => projectIds.has(m.projectId)),
    reservations: data.capacityReservations.filter(r => r.plannerPlanId === plan.id),
    rackReservations: data.rackReservations.filter(r => r.plannerPlanId === plan.id),
  };
}

/* ------------------------------------------------------------------ delivery view */

export interface DeliveryView {
  records: PlanRecords;
  pctComplete?: number; rag?: T.Project['rag'];
  baselineCapex?: number; projectSpend: number; poSpend: number; actualSpend: number; committed: number; variancePct?: number;
  poByStatus: Record<string, number>; overduePos: T.PurchaseOrder[];
  waves: { wave: T.PlannerWave; change?: T.ChangeRequest; window?: T.MaintenanceWindow; atp?: T.Atp }[];
  atpByStatus: Record<string, number>; permitsOpen: T.Permit[];
  lateMilestones: T.Milestone[];
}
const countBy = <R>(rows: R[], f: (r: R) => string) => rows.reduce<Record<string, number>>((m, r) => { const k = f(r); m[k] = (m[k] ?? 0) + 1; return m; }, {});

export function deliveryView(plan: T.PlannerPlan, data: PlannerData, nowMs: number): DeliveryView {
  const r = planRecords(plan, data);
  const budget = r.projects.reduce((s, p) => s + (p.budget || 0), 0);
  const pctComplete = r.projects.length ? Math.round(budget > 0 ? r.projects.reduce((s, p) => s + p.percentComplete * (p.budget || 0), 0) / budget : r.projects.reduce((s, p) => s + p.percentComplete, 0) / r.projects.length) : undefined;
  const rag: T.Project['rag'] | undefined = r.projects.some(p => p.rag === 'Red') ? 'Red' : r.projects.some(p => p.rag === 'Amber') ? 'Amber' : r.projects.length ? 'Green' : undefined;
  const projectSpend = r.projects.reduce((s, p) => s + (p.actualSpend || 0), 0);
  const poSpend = r.purchaseOrders.reduce((s, p) => s + (p.actualSpend || 0), 0);
  const actualSpend = projectSpend + poSpend;
  const committed = r.purchaseOrders.filter(p => p.status !== 'Draft').reduce((s, p) => s + (p.approvedBudget || p.plannedCost || 0), 0);
  const baselineCapex = plan.baseline?.capexTotal;
  const overduePos = r.purchaseOrders.filter(p => p.status === 'Draft' && p.orderBy && new Date(p.orderBy).getTime() < nowMs);
  const waves = (plan.waves ?? []).map(w => ({ wave: w, change: w.changeRequestId ? data.changeRequests.find(c => c.id === w.changeRequestId) : undefined, window: w.maintenanceWindowId ? data.maintenanceWindows.find(m => m.id === w.maintenanceWindowId) : undefined, atp: w.atpId ? data.atps.find(x => x.id === w.atpId) : undefined }));
  return {
    records: r, pctComplete, rag, baselineCapex, projectSpend, poSpend, actualSpend, committed,
    variancePct: baselineCapex ? Math.round(((actualSpend + Math.max(0, committed - poSpend)) / baselineCapex - 1) * 1000) / 10 : undefined,
    poByStatus: countBy(r.purchaseOrders, p => p.status), overduePos, waves,
    atpByStatus: countBy(r.atps, a => a.status), permitsOpen: r.permits.filter(p => p.status !== 'Approved'),
    lateMilestones: r.milestones.filter(m => m.status !== 'Completed' && new Date(m.dueDate).getTime() < nowMs),
  };
}

/* ------------------------------------------------------------------ completion gate */

export function closeoutChecks(plan: T.PlannerPlan, data: PlannerData, template?: T.PlannerTemplate): CloseoutCheck[] {
  const r = planRecords(plan, data);
  const out: CloseoutCheck[] = [];
  const list = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(', ')} and ${xs.length - 4} more` : xs.join(', '));
  out.push({ key: 'status', label: 'Plan is in delivery', ok: plan.status === 'Executing', detail: plan.status === 'Executing' ? 'Execution finished; delivery records exist.' : `The plan is ${plan.status.toLowerCase()}; only an executing plan can be completed.` });
  if (r.projects.length) {
    const open = r.projects.filter(p => !PROJECT_DONE(p));
    out.push({ key: 'projects', label: 'Projects closed or 100% complete', ok: !open.length, detail: open.length ? `Open: ${list(open.map(p => `${p.id} ${p.percentComplete}%`))}` : `${r.projects.length} project(s) complete.` });
    const unsigned = r.projects.filter(p => !r.hotos.some(h => h.projectId === p.id && HOTO_SIGNED(h)));
    out.push({ key: 'hoto', label: 'Handover to operations signed', ok: !unsigned.length, detail: unsigned.length ? `No signed handover for ${list(unsigned.map(p => p.id))}.` : 'Every project has a signed handover.' });
  }
  if (r.purchaseOrders.length) {
    const open = r.purchaseOrders.filter(p => p.status !== 'Received');
    out.push({ key: 'pos', label: 'Purchase orders received', ok: !open.length, detail: open.length ? `Not received: ${list(open.map(p => `${p.id} (${p.status})`))}` : `${r.purchaseOrders.length} purchase order(s) received.` });
  }
  const cxRequired = (template?.requiredAspects ?? []).some(a => a.aspect === 'commissioning' && a.depth !== 'skipped');
  if (r.atps.length) {
    const open = r.atps.filter(a => a.status !== 'Accepted');
    out.push({ key: 'atps', label: 'Acceptance tests accepted', ok: !open.length, detail: open.length ? `Not accepted: ${list(open.map(a => `${a.id} (${a.status})`))}` : `${r.atps.length} test(s) accepted.` });
  } else if (cxRequired && r.projects.length) {
    out.push({ key: 'atps', label: 'Acceptance tests accepted', ok: false, detail: 'The plan type requires commissioning, but no acceptance test is linked to the plan or its projects.' });
  }
  if (r.changeRequests.length) {
    const open = r.changeRequests.filter(c => !CR_DONE(c));
    out.push({ key: 'changes', label: 'Change requests implemented or closed', ok: !open.length, detail: open.length ? `Open: ${list(open.map(c => `${c.id} (${c.status})`))}` : `${r.changeRequests.length} change(s) implemented.` });
  }
  if ((plan.conditions ?? []).length) {
    const open = (plan.conditions ?? []).filter(c => c.status !== 'Closed');
    out.push({ key: 'conditions', label: 'Approval conditions closed', ok: !open.length, detail: open.length ? `Open: ${list(open.map(c => c.text))}` : 'Every condition is closed with evidence.' });
  }
  if ((plan.waves ?? []).length) {
    const open = (plan.waves ?? []).filter(w => w.status !== 'Closed' && w.status !== 'Cancelled');
    out.push({ key: 'waves', label: 'Waves closed', ok: !open.length, detail: open.length ? `Open: ${list(open.map(w => `${w.name} (${w.status})`))}` : `${plan.waves!.length} wave(s) closed.` });
  }
  if (!r.projects.length && !r.purchaseOrders.length && !r.changeRequests.length) out.push({ key: 'records', label: 'Delivery records found', ok: false, detail: 'No project, purchase order or change request is linked to this plan, so delivery cannot be confirmed.' });
  for (const c of modelFor(plan.scope).closeout?.(plan, data) ?? []) out.push(c);
  return out;
}
export const closeoutReady = (checks: CloseoutCheck[]) => checks.length > 0 && checks.every(c => c.ok);

/** What was delivered: capacity, actual spend and measured draw where the plan's racks exist. */
export function closeoutFigures(plan: T.PlannerPlan, data: PlannerData): { deliveredKw: number; actualCapex: number; measuredKw?: number } {
  const r = planRecords(plan, data);
  const rackIds = new Set([...(plan.artefacts?.plannedRackIds ?? []), ...(plan.artefacts?.reservedRackIds ?? []), ...(plan.placement?.racks ?? []).map(x => x.rackId), ...r.rackReservations.map(x => x.rackId)]);
  const racks = data.racks.filter(x => x.plannerPlanId === plan.id || rackIds.has(x.id));
  const measured = racks.reduce((s, x) => s + (x.currentPowerKw || 0), 0);
  return {
    deliveredKw: plan.baseline?.designPowerKw ?? plan.designPowerKw,
    actualCapex: r.projects.reduce((s, p) => s + (p.actualSpend || 0), 0) + r.purchaseOrders.reduce((s, p) => s + (p.actualSpend || 0), 0),
    measuredKw: racks.length ? Math.round(measured * 10) / 10 : undefined,
  };
}
