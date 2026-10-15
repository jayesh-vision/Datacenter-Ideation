/* What the plan creates, as one line per output with its state and links to the dcos-ops screens that show the records.
   Delivery is the source of truth for the build (user, 14-Oct-2026): once the plan is approved, its programme or project, purchase
   orders, work orders (each with a change request), commissioning tests, permits and design documents live in Delivery as PRJ-n
   (PRJ-n = PLN-n). Subnets and VLANs link to IP & Network, racks and devices to DCIM, a new site to its datacenter page. */
import type * as T from '../../../planner/p2b/types';
import type { DeliveryProjectView } from '../../../api/types';
import { VEHICLE_LABEL, vendorOrders, type ArtefactStatus, type PlanPackData } from '../../../planner/lib/packModel';
import { fmtMoney } from '../../../lib/format';
import { money } from '../common';

export interface RecordLink { label: string; to: string }
export interface RecordLine { key: string; label: string; detail: string; status: ArtefactStatus; links: RecordLink[] }

/** The plan's Delivery project: the one execution recorded, else PRJ-n for PLN-n. */
export const projectOf = (plan: Pick<T.PlannerPlan, 'id' | 'artefacts'>) => (plan.artefacts as { deliveryProjectId?: string } | undefined)?.deliveryProjectId ?? plan.id.replace('PLN-', 'PRJ-');
export const projectUrl = (plan: Pick<T.PlannerPlan, 'id' | 'artefacts'>, tab?: 'workorders' | 'procurement' | 'commissioning' | 'permits' | 'history') => `/delivery/projects/${projectOf(plan)}${tab ? `?tab=${tab}` : ''}`;

/** A planner money string ("$2.3M", "$450k") in the geography's money. Engine texts are written in USD. */
export const usdText = (s: string) => s.replace(/\$(-?\d+(?:\.\d+)?)([BMkK]?)/g, (_, n: string, u: string) => money(Number(n) * (u === 'B' ? 1e9 : u === 'M' ? 1e6 : u === 'k' || u === 'K' ? 1e3 : 1)));

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
/** First few record links, then "+N more" to the list that holds the rest. */
function some(ids: string[], to: (id: string) => string, rest: RecordLink | undefined, max = 2): RecordLink[] {
  const out = ids.slice(0, max).map(id => ({ label: id, to: to(id) }));
  if (ids.length > max && rest) out.push({ label: `+${ids.length - max} more`, to: rest.to });
  return out;
}

export function recordLines(plan: T.PlannerPlan, pack: PlanPackData, dv: DeliveryProjectView | null | undefined, dcIds: Set<string>): RecordLine[] {
  const a = plan.artefacts;
  const prj = projectOf(plan);
  const pre: ArtefactStatus = plan.status === 'Approved' ? 'approved' : plan.status === 'Executing' || plan.status === 'Completed' ? 'none' : 'ready';
  const not: ArtefactStatus = a ? 'none' : pre;
  const { bom, ip, init, applies, sourced } = pack;
  const dc = plan.dataCenterId;
  const dcq = dc ? `&dc=${encodeURIComponent(dc)}` : '';
  const created = (links: RecordLink[]) => ({ status: 'created' as const, links });
  const lines: RecordLine[] = [];

  /* the build family: a new site, acceptance tests, site work orders, child plans */
  if (plan.scope === 'new-dc' || (plan.scope === 'expansion' && !dc) || a?.createdSite) {
    const cs = a?.createdSite;
    const siteId = cs?.dataCenterId;
    lines.push({ key: 'site', label: 'Site records', detail: cs ? `${siteId ? 'Datacenter, ' : ''}${plural(cs.buildingIds?.length ?? 0, 'building')}, ${plural(cs.hallIds?.length ?? 0, 'hall')} (planned)` : `${plan.scope === 'new-dc' ? 'Datacenter, one building per phase' : 'Building on the campus'}, halls per phase, all planned`,
      ...(cs ? created(siteId ? [siteId && dcIds.has(siteId) ? { label: siteId, to: `/datacenters/${siteId}` } : { label: 'Floors and halls in DCIM', to: '/dcim?tab=hierarchy' }] : []) : { status: not, links: [] }) });
  }
  if (init.atps?.length || dv?.tests.length) {
    const n = dv?.tests.length ?? init.atps?.length ?? 0;
    lines.push({ key: 'atps', label: 'Commissioning tests', detail: dv ? `${plural(n, 'test')}, L1 factory witness to L5 integrated systems test · ${dv.tests.filter(t => t.state === 'Passed').length} passed` : `${plural(n, 'test')} with their steps`,
      ...(dv ? created([{ label: `${prj} commissioning`, to: projectUrl(plan, 'commissioning') }]) : a?.atpIds?.length ? created([{ label: plural(a.atpIds.length, 'test'), to: projectUrl(plan, 'commissioning') }]) : { status: not, links: [] }) });
  }
  if (init.vehicle === 'portfolio') {
    lines.push({ key: 'children', label: 'Child plans', detail: init.childPlans?.length ? plural(init.childPlans.length, 'child plan') : 'No allocation yet',
      ...(a?.childPlanIds?.length ? created(a.childPlanIds.slice(0, 4).map(id => ({ label: id, to: `/planning/plans/${id}` }))) : { status: (init.childPlans?.length ? not : 'na') as ArtefactStatus, links: [] }) });
  }

  /* bill of materials and purchase orders */
  const bomTotal = sourced?.total ?? bom.total;
  lines.push({ key: 'bom', label: 'Bill of materials', detail: `${plural(bom.lines.length, 'line')} · ${money(bomTotal)}`,
    ...(dv && bom.lines.length ? created([{ label: `Ordered in ${prj}`, to: projectUrl(plan, 'procurement') }]) : a?.bomId ? created([{ label: a.bomId, to: projectUrl(plan, 'procurement') }]) : { status: bom.lines.length ? not : 'na', links: [] }) });
  if (dv) {
    const value = dv.pos.reduce((s, p) => s + p.total, 0);
    const late = dv.pos.filter(p => p.state === 'Late').length;
    lines.push({ key: 'po', label: 'Purchase orders', detail: dv.pos.length ? `${plural(dv.pos.length, 'order')} · ${fmtMoney(value)}${late ? ` · ${late} late` : ''} · ${plural(new Set(dv.pos.map(p => p.supplier)).size, 'supplier')}` : 'Nothing to buy',
      ...(dv.pos.length ? created([{ label: plural(dv.pos.length, 'purchase order'), to: projectUrl(plan, 'procurement') }]) : { status: 'na' as const, links: [] }) });
  } else if (sourced) {
    const orders = vendorOrders(sourced);
    lines.push({ key: 'po', label: 'Purchase orders', detail: orders.length ? `${plural(orders.length, 'vendor order')} · ${money(orders.reduce((s, o) => s + o.value, 0))}${orders.some(o => !o.contractId) ? ` · ${orders.filter(o => !o.contractId).length} without contract` : ''}` : 'Nothing to buy',
      ...(a?.purchaseOrderIds.length ? created([{ label: plural(a.purchaseOrderIds.length, 'purchase order'), to: projectUrl(plan, 'procurement') }]) : { status: orders.length ? not : 'na', links: [] }) });
  } else {
    lines.push({ key: 'po', label: 'Long-lead purchase orders', detail: init.orders.length ? `${plural(init.orders.length, 'order')} · ${money(init.orders.reduce((s, o) => s + o.value, 0))}` : 'No long-lead items',
      ...(a?.purchaseOrderIds.length ? created([{ label: plural(a.purchaseOrderIds.length, 'purchase order'), to: projectUrl(plan, 'procurement') }]) : { status: init.orders.length ? not : 'na', links: [] }) });
  }

  /* stock and rack positions: what sourcing would take before execution, what was reserved after; racks the work orders install into */
  const stockIds = a?.reservedDeviceIds ?? [];
  if (sourced || stockIds.length) {
    const n = a ? stockIds.length : sourced?.stockDeviceIds.length ?? 0;
    lines.push({ key: 'stock', label: 'Stock reserved', detail: n ? `${plural(n, 'device')}${sourced ? ` · ${money(sourced.stockValue)}` : ''}` : 'Nothing in stock matches',
      ...(stockIds.length ? created(stockIds.length === 1 ? [{ label: stockIds[0], to: `/ne/${stockIds[0]}` }] : [{ label: plural(stockIds.length, 'device'), to: `/dcim?tab=devices${dcq}` }]) : { status: (n ? not : 'na') as ArtefactStatus, links: [] }) });
  }
  const rackIds = [...new Set([...(a?.reservedRackIds ?? []), ...(a?.plannedRackIds ?? []), ...(dv?.workOrders.flatMap(w => w.rackIds) ?? [])])];
  const rackPlanned = sourced?.siteRackIds.length ?? 0;
  if (rackIds.length || rackPlanned) {
    lines.push({ key: 'racks', label: 'Racks and positions', detail: rackIds.length ? `${plural(rackIds.length, 'rack')} in the work orders and holds` : plural(rackPlanned, 'position'),
      ...(rackIds.length ? created(some(rackIds, id => `/dcim/racks/${id}`, { label: '', to: `/dcim?tab=racks${dcq}` })) : { status: not, links: [] }) });
  }

  /* addresses */
  if (!applies.ip) lines.push({ key: 'ip', label: 'Subnets and VLANs', detail: 'Not part of this plan type', status: 'na', links: [] });
  else if (!ip.items.length) lines.push({ key: 'ip', label: 'Subnets and VLANs', detail: ip.aggregate, status: 'na', links: [] });
  else {
    const made = (a?.subnetIds.length ?? 0) + (a?.vlanIds.length ?? 0) > 0;
    lines.push({ key: 'ip', label: 'Subnets and VLANs', detail: `${plural(ip.items.length, 'prefix', 'prefixes')} in ${ip.aggregate} · ${plural(ip.vlans.length, 'VLAN')}`,
      ...(made ? created([{ label: plural(a!.subnetIds.length, 'subnet'), to: `/ipam?tab=prefixes${dcq}` }, ...(a!.vlanIds.length ? [{ label: plural(a!.vlanIds.length, 'VLAN'), to: `/ipam?tab=vlans${dcq}` }] : [])]) : { status: not, links: [] }) });
  }

  /* permits and design documents (Delivery's Permits & design tab) */
  if (dv) {
    lines.push({ key: 'permits', label: 'Permits', detail: dv.permits.length ? `${plural(dv.permits.length, 'permit')} · ${dv.permits.filter(p => p.state === 'Granted').length} granted` : 'No permits for this work', ...(dv.permits.length ? created([{ label: plural(dv.permits.length, 'permit'), to: projectUrl(plan, 'permits') }]) : { status: 'na' as const, links: [] }) });
    lines.push({ key: 'docs', label: 'Design documents', detail: dv.docs.map(d => d.kind).join(', ') || 'None', ...(dv.docs.length ? created([{ label: plural(dv.docs.length, 'document'), to: projectUrl(plan, 'permits') }]) : { status: 'na' as const, links: [] }) });
  } else {
    lines.push({ key: 'permits', label: 'Permits to file', detail: init.permits.length ? plural(init.permits.length, 'permit') : 'No permits listed',
      ...(a?.permitIds.length ? created([{ label: plural(a.permitIds.length, 'permit'), to: projectUrl(plan, 'permits') }]) : { status: init.permits.length ? not : 'na', links: [] }) });
    lines.push({ key: 'docs', label: 'Design documents', detail: init.designDocs.map(d => d.name).join(', '),
      ...(a?.designDocIds.length ? created([{ label: plural(a.designDocIds.length, 'document'), to: projectUrl(plan, 'permits') }]) : { status: not, links: [] }) });
  }

  /* the delivery vehicle and its work orders with their change requests */
  if (init.vehicle !== 'portfolio') {
    const label = init.vehicle === 'change' ? 'Change request' : VEHICLE_LABEL[init.vehicle];
    const detail = init.vehicle === 'change' ? (init.change?.title ?? init.name) : `${init.blueprintName ? `${init.blueprintName} blueprint · ` : init.projects[0]?.template ? `${init.projects[0].template} template · ` : ''}${plural(init.projects.length, 'project')} · ${money(init.budget)}`;
    const cr = dv?.workOrders.map(w => w.changeId) ?? [];
    lines.push({ key: 'vehicle', label, detail: dv ? `${detail} · ${dv.project.state}, ${dv.project.health}` : detail,
      ...(dv ? created(init.vehicle === 'change' && cr.length ? some(cr, id => `/changes/${id}`, { label: '', to: projectUrl(plan, 'workorders') }) : [{ label: prj, to: projectUrl(plan) }])
        : a?.programId || a?.changeRequestId ? created([]) : { status: not, links: [] }) });
  }
  if (dv) {
    const open = dv.workOrders.filter(w => w.state !== 'Done').length;
    lines.push({ key: 'wo', label: 'Work orders and change requests', detail: dv.workOrders.length ? `${plural(dv.workOrders.length, 'work order')}, each with its change request · ${open} open` : 'No field work',
      ...(dv.workOrders.length ? created([{ label: plural(dv.workOrders.length, 'work order'), to: projectUrl(plan, 'workorders') }, ...some(dv.workOrders.map(w => w.changeId), id => `/changes/${id}`, undefined, 1)]) : { status: 'na' as const, links: [] }) });
  } else {
    lines.push({ key: 'wo', label: 'Work orders and change requests', detail: init.workOrders?.length ? `${plural(init.workOrders.length, 'site work order')} · ${init.workOrder.process}` : `Field work split into crew windows, each with a change request · ${init.workOrder.process}`, status: not, links: [] });
  }
  return lines;
}
