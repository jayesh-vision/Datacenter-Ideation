/**
 * Capacity reservations ledger — what an approved plan holds at its site.
 *
 *   approval    → Reserved   (capacityReservations + rackReservations, with plan id and expiry)
 *   execution   → Committed  (linked to the plan's change request; no expiry while delivery runs)
 *   completion  → Consumed   (the capacity is now live load)
 *   cancel, superseded revision, rejection after approval → Released
 *
 * The family decides what is held (`ScopeModel.reservations` / `rackUnits`). When a family
 * returns nothing for a plan that adds load at an existing site, one PowerChain hold of the
 * added kW is written on the site so two plans cannot both use the same headroom.
 * `site.ts` subtracts Reserved and Committed holds of other plans from the headroom.
 *
 * Pure functions over a small `Store` so the same code runs on MockDB and in smoke scripts.
 */
import type * as T from '../p2b/types';
import type { Evaluation } from './engine';
import type { PlannerData } from './plannerData';
import { planAddedKw } from './site';
import { modelFor, type RackUnitRequest, type ReservationRequest } from './scopes';

/** Minimal persistence the governance libraries need (MockDB in the app, a map in scripts). */
export interface Store {
  list(entity: string): Record<string, unknown>[];
  get(entity: string, id: string): Record<string, unknown> | undefined;
  create(entity: string, rec: Record<string, unknown>): void;
  update(entity: string, id: string, patch: Record<string, unknown>): void;
}

/** Next sequential id PREFIX-0001 in a list of records. */
export function nextSeq(rows: { id?: unknown }[], prefix: string): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = rows.reduce<number>((m, r) => { const x = re.exec(String(r.id ?? '')); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

/** Holds expire 60 days after the target go-live unless execution commits them. */
export const RESERVATION_GRACE_DAYS = 60;
export function reservationExpiry(plan: T.PlannerPlan): string {
  return new Date(new Date(plan.targetGoLive).getTime() + RESERVATION_GRACE_DAYS * 864e5).toISOString();
}

export interface ReservationPlan { capacity: ReservationRequest[]; racks: RackUnitRequest[]; fallback: boolean; note: string }

/** What the plan should hold: the family's requests, or the site-level fallback. */
export function reservationRequests(plan: T.PlannerPlan, ev: Evaluation, data: PlannerData): ReservationPlan {
  const model = modelFor(plan.scope);
  const capacity = model.reservations?.(plan, ev, data) ?? [];
  const racks = model.rackUnits?.(plan, ev, data) ?? [];
  const added = planAddedKw(plan);
  if (!capacity.length && !racks.length && added > 0 && plan.dataCenterId && data.dataCenters.some(d => d.id === plan.dataCenterId)) {
    return {
      capacity: [{ resourceType: 'PowerChain', resourceId: plan.dataCenterId, quantity: added, unit: 'kW', label: `${plan.plnId} · ${plan.title}: ${added} kW IT load held on the site power chain`, dataCenterId: plan.dataCenterId }],
      racks: [], fallback: true,
      note: 'The plan type does not name individual UPS, PDU or cooling zones yet, so the added IT load is held on the whole site.',
    };
  }
  return { capacity, racks, fallback: false, note: capacity.length || racks.length ? '' : added > 0 ? 'No existing site to hold capacity at (new site or campus).' : 'The plan adds no IT load, so nothing is held.' };
}

const isActive = (r: Record<string, unknown>) => r.status !== 'Released' && r.state !== 'Consumed';

/** Write the plan's holds as Reserved (idempotent: holds the plan already has are kept). */
export function writeReservations(store: Store, plan: T.PlannerPlan, req: ReservationPlan, meta: Record<string, unknown>, actor: string): { reservationIds: string[]; rackReservationIds: string[] } {
  const existing = store.list('capacityReservations').filter(r => r.plannerPlanId === plan.id && isActive(r));
  const existingRack = store.list('rackReservations').filter(r => r.plannerPlanId === plan.id && r.status === 'Active');
  const expiresAt = reservationExpiry(plan);
  const reservationIds = existing.map(r => String(r.id));
  const rackReservationIds = existingRack.map(r => String(r.id));
  if (!existing.length) {
    for (const q of req.capacity) {
      const id = nextSeq(store.list('capacityReservations') as { id?: unknown }[], 'RSV');
      store.create('capacityReservations', { ...meta, id, rsvId: id, resourceType: q.resourceType, resourceId: q.resourceId, state: 'Reserved', quantity: q.quantity, unit: q.unit, expiresAt: q.expiresAt ?? expiresAt, status: 'Active', plannerPlanId: plan.id, dataCenterId: q.dataCenterId ?? plan.dataCenterId, label: q.label });
      reservationIds.push(id);
    }
  }
  if (!existingRack.length) {
    for (const r of req.racks) {
      const id = nextSeq(store.list('rackReservations') as { id?: unknown }[], 'RSVN');
      store.create('rackReservations', { ...meta, id, rsvnId: id, rackId: r.rackId, units: r.units, reservedBy: actor, description: `${plan.plnId}: ${r.description}`, status: 'Active', plannerPlanId: plan.id, expiresAt });
      rackReservationIds.push(id);
    }
  }
  return { reservationIds, rackReservationIds };
}

export type ReservationMove = 'Committed' | 'Consumed' | 'Released';

/** Move every active hold of the plan to the next state. Returns how many records changed. */
export function moveReservations(store: Store, planId: string, to: ReservationMove, opts: { changeRequestId?: string; reason?: string; at: string }): number {
  let n = 0;
  for (const r of store.list('capacityReservations')) {
    if (r.plannerPlanId !== planId || !isActive(r)) continue;
    if (to === 'Committed' && r.state === 'Committed') continue;
    const patch: Record<string, unknown> = { updatedAt: opts.at };
    if (to === 'Committed') { patch.state = 'Committed'; patch.expiresAt = undefined; if (opts.changeRequestId) patch.changeRequestId = opts.changeRequestId; }
    if (to === 'Consumed') { patch.state = 'Consumed'; patch.expiresAt = undefined; }
    if (to === 'Released') { patch.state = 'Available'; patch.status = 'Released'; }
    if (opts.reason) patch.label = `${String(r.label ?? '')}${r.label ? ' · ' : ''}${to}: ${opts.reason}`;
    store.update('capacityReservations', String(r.id), patch); n++;
  }
  for (const r of store.list('rackReservations')) {
    if (r.plannerPlanId !== planId || r.status !== 'Active') continue;
    if (to === 'Committed') { store.update('rackReservations', String(r.id), { expiresAt: undefined, updatedAt: opts.at }); n++; continue; }
    // Installed (consumed) or given up (released): the units are no longer held by the plan.
    store.update('rackReservations', String(r.id), { status: 'Released', updatedAt: opts.at, description: `${String(r.description ?? '')} · ${to === 'Consumed' ? 'installed' : 'released'}${opts.reason ? `: ${opts.reason}` : ''}` }); n++;
  }
  return n;
}

/** Summary of a plan's holds for the UI. */
export function planHolds(data: Pick<PlannerData, 'capacityReservations' | 'rackReservations'>, planId: string) {
  const cap = data.capacityReservations.filter(r => r.plannerPlanId === planId);
  const racks = data.rackReservations.filter(r => r.plannerPlanId === planId);
  const kw = cap.filter(r => r.unit === 'kW' && r.status !== 'Released' && (r.state === 'Reserved' || r.state === 'Committed')).reduce((a, r) => a + r.quantity, 0);
  return { cap, racks, kwHeld: kw, units: racks.filter(r => r.status === 'Active').reduce((a, r) => a + r.units.length, 0) };
}
