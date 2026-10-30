import type { CxTest, DeliveryProject, DesignDoc, Permit, ProgrammeView, PurchaseOrder, WorkOrder } from '../../api/types';

/* "What matters now" order for every Delivery list (30-Oct-2026, user: "the first 5 rows matter most in the demo"): work under way and
   needing attention first, then what starts next, then what is done. A column header still re-sorts. */
export const ACTIVE: DeliveryProject['state'][] = ['In progress', 'Commissioning', 'Handover'];
const STATE_RANK = (s: DeliveryProject['state']) => (ACTIVE.includes(s) ? 0 : s === 'Mobilising' ? 1 : 2);
const HEALTH_RANK: Record<DeliveryProject['health'], number> = { late: 0, 'at risk': 1, 'on track': 2 };
/* live work first, the most troubled and the biggest first; then what starts next (soonest first); delivered last (latest first) */
export const byNow = (a: DeliveryProject, b: DeliveryProject) => STATE_RANK(a.state) - STATE_RANK(b.state)
  || (STATE_RANK(a.state) === 0 ? HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || b.budget - a.budget : STATE_RANK(a.state) === 1 ? a.start - b.start : b.finish - a.finish);
const RAG_RANK = { red: 0, amber: 1, green: 2 } as const;
export const progNow = (a: ProgrammeView, b: ProgrammeView) => (a.projects.some(p => ACTIVE.includes(p.state)) ? 0 : 1) - (b.projects.some(p => ACTIVE.includes(p.state)) ? 0 : 1)
  || RAG_RANK[a.rag] - RAG_RANK[b.rag] || b.budget - a.budget;
const WO_RANK: Record<WorkOrder['state'], number> = { 'In progress': 0, 'Awaiting change': 1, Ready: 2, Failed: 1, Planned: 3, Done: 4 } as Record<WorkOrder['state'], number>;
export const woNow = (a: WorkOrder, b: WorkOrder) => (WO_RANK[a.state] ?? 3) - (WO_RANK[b.state] ?? 3) || (a.state === 'Done' ? b.end - a.end : a.start - b.start);
/* tests coming up first (soonest), then later ones, then those passed (latest first) */
const TEST_RANK: Record<CxTest['state'], number> = { Failed: 0, Scheduled: 0, 'Not started': 1, Passed: 2 };
export const testNow = (a: CxTest, b: CxTest) => TEST_RANK[a.state] - TEST_RANK[b.state] || (a.state === 'Passed' ? b.due - a.due : a.due - b.due);
/* permits still to get first (filed, then to file, soonest first), granted last */
const PERMIT_RANK: Record<Permit['state'], number> = { Expired: 0, Submitted: 0, 'To submit': 1, 'Not needed': 3, Granted: 2 };
export const permitNow = (a: Permit, b: Permit) => PERMIT_RANK[a.state] - PERMIT_RANK[b.state] || (a.state === 'Granted' ? b.due - a.due : a.due - b.due);
export const DOC_RANK: Record<DesignDoc['state'], number> = { 'In review': 0, 'Issued for construction': 1, Draft: 2, 'As-built': 3 };

/* orders that need chasing first (late, on the way, placed, not yet placed), delivered last */
export const PO_RANK: Record<PurchaseOrder['state'], number> = { Late: 0, 'In transit': 1, Ordered: 2, Draft: 3, Delivered: 4 };
export const poNow = (a: PurchaseOrder, b: PurchaseOrder) => PO_RANK[a.state] - PO_RANK[b.state] || (a.state === 'Delivered' ? b.due - a.due : a.due - b.due);
