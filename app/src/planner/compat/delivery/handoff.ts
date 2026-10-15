/* Delivery is the source of truth for how an approved plan is built (user, 14-Oct-2026). Once a plan is handed over, its project
   (PRJ-n = PLN-n), purchase orders, work orders with their change requests, commissioning L1–L5, permits and design documents are
   Delivery's records (mock/delivery.ts derives them from the plan and its sourced bill of materials). The planner keeps only what
   Delivery does not own (capacity, stock and rack holds, IP space, the plan-type's own records) and reads Delivery through this handle,
   which the mock registers at start-up (a real backend would register its client; nothing here imports mock/). Money is in the
   planner's US dollars, dates are ISO strings. */

export interface DeliveryPo { id: string; supplier: string; item: string; contract?: string; totalUsd: number; due: string; leadWeeks: number; state: 'Draft' | 'Ordered' | 'In transit' | 'Delivered' | 'Late' }
export interface DeliveryWo { id: string; title: string; kind: string; crew: string; start: string; end: string; state: 'Planned' | 'Awaiting change' | 'Ready' | 'In progress' | 'Done'; changeId: string; changeState: 'Draft' | 'Pending approval' | 'Approved' | 'Implemented' }
export interface DeliveryRef {
  projectId: string; state: 'Mobilising' | 'In progress' | 'Commissioning' | 'Handover' | 'Delivered'; health: 'on track' | 'at risk' | 'late'; manager: string;
  start: string; finish: string; progress: number; plannedProgress: number; budgetUsd: number; earnedUsd: number; actualUsd: number; cpi: number; spi: number;
  purchaseOrders: DeliveryPo[]; workOrders: DeliveryWo[];
  tests: { level: number; name: string; state: 'Passed' | 'Failed' | 'Scheduled' | 'Not started'; due: string }[];
  permits: { id: string; name: string; authority: string; due: string; state: string }[];
  docs: { id: string; title: string; kind: string; state: string }[];
  /** Every work order done and L1–L5 passed: the handover can be signed. */ canHandover: boolean;
  /** The handover to operations was signed (the plan is completed). */ handedOver: boolean;
}
export interface DeliveryLink {
  /** Delivery's view of a plan (null when the plan is not in Delivery: not approved yet, or cancelled). */
  project(plnId: string): DeliveryRef | null;
  /** Sign the handover to operations; Delivery then completes the plan (bridge.completeFromDelivery). */
  handover(plnId: string, who: string, notes?: string): void;
}

let link: DeliveryLink | null = null;
export function registerDelivery(l: DeliveryLink) { link = l; }
export const deliveryFor = (plnId: string): DeliveryRef | null => link?.project(plnId) ?? null;
export function deliveryHandover(plnId: string, who: string, notes?: string) {
  if (!link) throw new Error('Delivery is not available');
  link.handover(plnId, who, notes);
}
/** Delivery's project id for a plan (PRJ-n = PLN-n). */
export const deliveryProjectId = (plnId: string) => plnId.replace(/^PLN-/, 'PRJ-');

/* What execution records about the hand-over (declaration merging adds optional fields only). */
declare module '../../p2b/types' {
  interface PlannerArtefacts {
    /** Delivery's project for the plan. */ deliveryProjectId?: string;
    /** Delivery's permits and design documents at the hand-over (ids). */
    deliveryDocIds?: string[];
    /** The sourcing decision handed to Delivery: what came from the site, stock and vendors. */
    sourcing?: { siteQty: number; stockQty: number; buyQty: number; siteUsd: number; stockUsd: number; buyUsd: number; vendors: number; plannedHolds: number };
  }
}
