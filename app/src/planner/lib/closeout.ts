/**
 * Delivery feedback and completion.
 *
 * Delivery is the source of truth for the build (user, 14-Oct-2026): the plan's project, purchase
 * orders, work orders with their change requests and commissioning are Delivery's records, read
 * through the Delivery handle (compat/delivery/handoff). `closeoutChecks` is the completion gate,
 * read live: purchase orders received, work orders done, change requests implemented, L1–L5
 * passed and the handover ready (or signed), plus the approval conditions. Checks on the records
 * the planner keeps (the plan type's own records: planned racks and devices, waves, test
 * protocols, its change requests) are set by the handover itself, so they are listed but do not
 * hold the completion back (`atHandover`).
 *
 * Completing the plan and signing the handover are one act: "Complete plan" in the planner signs
 * the handover in Delivery, and a handover signed in Delivery completes the plan
 * (`completeFromHandover`, called by the bridge): the planner's records are set to what was
 * delivered, the holds are consumed and the close-out is written with the checklist.
 */
import type * as T from '../p2b/types';
import type { PlannerData } from './plannerData';
import { modelFor, type CloseoutCheck } from './scopes';
import { moveReservations, type Store } from './reservations';
import { deliveryFor, type DeliveryRef } from '../compat/delivery/handoff';

const CR_DONE = (c: T.ChangeRequest) => c.status === 'Implemented' || c.status === 'Closed';
const list = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(', ')} and ${xs.length - 4} more` : xs.join(', '));

/* ------------------------------------------------------------------ completion gate */

export function closeoutChecks(plan: T.PlannerPlan, data: PlannerData, template?: T.PlannerTemplate, delivery: DeliveryRef | null = deliveryFor(plan.plnId)): CloseoutCheck[] {
  const out: CloseoutCheck[] = [];
  const done = plan.status === 'Completed';
  out.push({ key: 'status', label: 'Plan is in delivery', ok: plan.status === 'Executing' || done, detail: plan.status === 'Executing' ? 'Handed over to Delivery; the build runs there.' : done ? 'Completed.' : `The plan is ${plan.status.toLowerCase()}; only an executing plan can be completed.` });
  if (!delivery) {
    out.push({ key: 'delivery', label: 'Delivery project', ok: false, detail: 'Delivery has no project for this plan, so delivery cannot be confirmed.' });
  } else {
    const pos = delivery.purchaseOrders.filter(o => o.state !== 'Delivered');
    out.push({ key: 'pos', label: 'Purchase orders received', ok: !pos.length, detail: !delivery.purchaseOrders.length ? 'No purchase order: nothing is bought for this plan.' : pos.length ? `Not received: ${list(pos.map(o => `${o.id} (${o.state.toLowerCase()})`))}` : `${delivery.purchaseOrders.length} purchase order(s) received on site.` });
    const wos = delivery.workOrders.filter(w => w.state !== 'Done');
    out.push({ key: 'workorders', label: 'Work orders done', ok: !wos.length, detail: wos.length ? `Open: ${list(wos.map(w => `${w.id} (${w.state.toLowerCase()})`))}` : `${delivery.workOrders.length} work order(s) done.` });
    const crs = delivery.workOrders.filter(w => w.changeState !== 'Implemented');
    out.push({ key: 'changes', label: 'Change requests implemented', ok: !crs.length, detail: crs.length ? `Not implemented: ${list(crs.map(w => `${w.changeId} (${w.changeState.toLowerCase()})`))}` : `${delivery.workOrders.length} change request(s) implemented.` });
    const tests = delivery.tests.filter(t => t.state !== 'Passed');
    out.push({ key: 'commissioning', label: 'Commissioning L1–L5 passed', ok: !tests.length, detail: tests.length ? `Not passed: ${tests.map(t => `L${t.level} ${t.name.toLowerCase()}`).slice(0, 3).join(', ')}${tests.length > 3 ? '…' : ''}` : 'Every level passed, up to the integrated systems test.' });
    out.push({ key: 'handover', label: 'Handover to operations', ok: delivery.handedOver || delivery.canHandover, detail: delivery.handedOver ? `Signed in Delivery (${delivery.projectId}).` : delivery.canHandover ? `Ready: completing the plan signs the handover of ${delivery.projectId} in Delivery.` : 'Needs every work order done and L5 passed.' });
  }
  if ((plan.conditions ?? []).length) {
    const open = (plan.conditions ?? []).filter(c => c.status !== 'Closed');
    out.push({ key: 'conditions', label: 'Approval conditions closed', ok: !open.length, detail: open.length ? `Open: ${list(open.map(c => c.text))}` : 'Every condition is closed with evidence.' });
  }
  /* records the planner keeps for the plan type: the handover sets them */
  const own = data.changeRequests.filter(c => c.plannerPlanId === plan.id);
  if (own.length) { const open = own.filter(c => !CR_DONE(c)); out.push({ key: 'plan-changes', label: 'Plan-type change requests implemented', ok: !open.length, atHandover: true, detail: open.length ? `Open: ${list(open.map(c => `${c.id} (${c.status})`))}` : `${own.length} implemented.` }); }
  if ((plan.waves ?? []).length) {
    const open = (plan.waves ?? []).filter(w => w.status !== 'Closed' && w.status !== 'Cancelled');
    out.push({ key: 'waves', label: 'Waves closed', ok: !open.length, atHandover: true, detail: open.length ? `Open: ${list(open.map(w => `${w.name} (${w.status})`))}` : `${plan.waves!.length} wave(s) closed.` });
  }
  /* "holds consumed" is what completion itself does, so it is not a check here */
  /* the plan type's own checks; one it shares with the list above (its waves) is already there */
  for (const c of modelFor(plan.scope).closeout?.(plan, data) ?? []) if (c.key !== 'holds-consumed' && !out.some(o => o.key === c.key)) out.push({ ...c, atHandover: true });
  void template;
  return out;
}
/** Ready to complete: every check green, except those the handover sets. */
export const closeoutReady = (checks: CloseoutCheck[]) => checks.length > 0 && checks.every(c => c.ok || c.atHandover);

/** What was delivered: capacity, actual spend (Delivery's) and measured draw where the plan's racks exist. */
export function closeoutFigures(plan: T.PlannerPlan, data: PlannerData, delivery: DeliveryRef | null = deliveryFor(plan.plnId)): { deliveredKw: number; actualCapex: number; measuredKw?: number } {
  const rackIds = new Set([...(plan.artefacts?.plannedRackIds ?? []), ...(plan.artefacts?.reservedRackIds ?? []), ...(plan.placement?.racks ?? []).map(x => x.rackId), ...data.rackReservations.filter(r => r.plannerPlanId === plan.id).map(x => x.rackId)]);
  const racks = data.racks.filter(x => x.plannerPlanId === plan.id || rackIds.has(x.id));
  const measured = racks.reduce((s, x) => s + (x.currentPowerKw || 0), 0);
  return { deliveredKw: plan.baseline?.designPowerKw ?? plan.designPowerKw, actualCapex: delivery?.actualUsd ?? 0, measuredKw: racks.length ? Math.round(measured * 10) / 10 : undefined };
}

/* ------------------------------------------------------------------ handover → completion */

/** The planner's records as delivered: planned racks and devices in service, stock units installed, the hall live, test protocols
 *  accepted, the plan type's change requests implemented and windows completed. Returns what changed, for the audit. */
export function applyHandover(store: Store, plan: T.PlannerPlan, at: string): string[] {
  const a = plan.artefacts; const notes: string[] = [];
  const mine = (r: Record<string, unknown>, ids: string[] = []) => r.plannerPlanId === plan.id || ids.includes(String(r.id));
  let n = 0;
  for (const r of store.list('racks')) if (mine(r, [...(a?.plannedRackIds ?? []), ...(a?.reservedRackIds ?? [])]) && (r.status === 'Planned' || r.status === 'Reserved')) { store.update('racks', String(r.id), { status: 'Active', updatedAt: at }); n++; }
  if (n) notes.push(`${n} rack(s) in service`);
  n = 0;
  for (const d of store.list('devices')) if (mine(d, [...(a?.plannedDeviceIds ?? []), ...(a?.reservedDeviceIds ?? [])]) && (d.status === 'Planned' || ['Ordered', 'Received', 'Staged'].includes(String(d.lifecycleState)))) {
    store.update('devices', String(d.id), d.rackId ? { status: 'Active', lifecycleState: 'Active', updatedAt: at } : { lifecycleState: 'Installed', notes: `Installed under ${plan.plnId}`, updatedAt: at }); n++;
  }
  if (n) notes.push(`${n} device(s) installed`);
  for (const id of [String(plan.params.targetHallId ?? ''), ...(a?.createdSite?.hallIds ?? [])].filter(Boolean)) { const h = store.get('halls', id); if (h && h.status !== 'Live') { store.update('halls', id, { status: 'Live', updatedAt: at }); notes.push(`${String(h.name)} live`); } }
  n = 0;
  for (const t of store.list('atps')) if (mine(t, a?.atpIds) && t.status !== 'Accepted') { store.update('atps', String(t.id), { status: 'Accepted', updatedAt: at }); n++; }
  if (n) notes.push(`${n} test protocol(s) accepted`);
  for (const c of store.list('changeRequests')) if (mine(c) && !['Implemented', 'Closed', 'Rejected', 'Cancelled', 'RolledBack'].includes(String(c.status))) store.update('changeRequests', String(c.id), { status: 'Implemented', updatedAt: at });
  for (const w of store.list('maintenanceWindows')) if (mine(w) && w.status !== 'Completed' && w.status !== 'Cancelled') store.update('maintenanceWindows', String(w.id), { status: 'Completed', updatedAt: at });
  return notes;
}

/** Complete the plan after its handover was signed: delivered state, waves closed, holds consumed, the close-out written. */
export function completeFromHandover(store: Store, plan: T.PlannerPlan, data: () => PlannerData, template: T.PlannerTemplate | undefined, actor: string, at: string, notes?: string): { patch: Partial<T.PlannerPlan>; summary: string } {
  const applied = applyHandover(store, plan, at);
  const waves = plan.waves?.map(w => (w.status === 'Cancelled' || w.status === 'Rolled back' ? w : { ...w, status: 'Closed' as const }));
  const after = { ...plan, ...(waves ? { waves } : {}), status: 'Executing' as const };
  const d = data();
  const delivery = deliveryFor(plan.plnId);
  const checklist = closeoutChecks(after, d, template, delivery);
  const fig = closeoutFigures(after, d, delivery);
  const consumed = moveReservations(store, plan.id, 'Consumed', { at });
  const closeout: T.PlannerCloseout = { completedAt: at, completedBy: actor, deliveredKw: fig.deliveredKw, actualCapex: fig.actualCapex, checklist, notes, measuredKw: fig.measuredKw, measuredAt: fig.measuredKw !== undefined ? at : undefined };
  return {
    patch: { status: 'Completed', closeout, ...(waves ? { waves } : {}), phases: plan.phases.map(p => ({ ...p, status: 'Live' as const })) },
    summary: `Completed by the handover to operations${delivery ? ` of ${delivery.projectId}` : ''}: ${fig.deliveredKw} kW delivered${applied.length ? `; ${applied.join(', ')}` : ''}; ${consumed} capacity hold(s) consumed.`,
  };
}
