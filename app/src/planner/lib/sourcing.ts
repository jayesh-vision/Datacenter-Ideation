/**
 * Sourcing — resolves every bill-of-materials line against what the company already has.
 *
 * Order for each line:
 *  1. Spare capacity at an existing site, decided once per plan (not line by line): UPS headroom
 *     at its redundancy, cooling headroom per zone with the largest unit lost, site plant headroom,
 *     and empty planned or reserved rack positions (only for plans that work inside a live site).
 *  2. Stock: devices of the chosen model that are Staged or Received, not racked and not held by
 *     anyone — at the same site first, then the central depot, then other sites (transfer). Stock is
 *     held only within `stockHoldWeeks` of the need date; an earlier need is planned as a later hold.
 *  3. Procurement: the preferred catalogue model that is not near end of life, from its vendor,
 *     under that vendor's Supply or Framework contract (never a support or SLA contract), with the
 *     lead time from the benchmarks. Purchase orders are grouped per vendor and per phase, each with
 *     the phase's need-by and order-by dates.
 *
 * A grid connection is not bought on a purchase order: it is a connection agreement with the
 * network operator, paid in milestones, and is listed separately.
 *
 * IT lines use the engine's quantity model (catalogue.itQuantities), so a server has the same
 * model and price in the estimate, the bill of materials and the purchase orders.
 */
import type * as T from '../p2b/types';
import { datedPhases, leadWeeksFor, type Evaluation } from './engine';
import type { Bom, BomItem } from './outputs';
import type { PlannerData } from './plannerData';
import { usableAt } from './site';
import { CATALOGUE, chooseOption, isFreeStock, optionOf, type CatalogueOption, type ItemKind } from './catalogue';
import { NEED_WEEKS, priceContext, priceLine } from './materials';
import { clockMs } from '../compat/clock';

export interface SourcingContext { devices: T.Device[]; vendors: T.Vendor[]; contracts: T.Contract[]; assetModels: T.AssetModel[]; racks: T.Rack[]; upsUnits: T.UPS[]; coolingZones: T.CoolingZone[]; dataCenters: T.DataCenter[]; /** Full platform data when available (reservations, purchase orders). */ data?: PlannerData }
export type SourceKind = 'site' | 'stock' | 'procure';
export interface Allocation {
  source: SourceKind; qty: number; note: string; unitCost: number; vendorId?: string; vendorName?: string; contractId?: string; deviceIds?: string[]; rackIds?: string[]; leadWeeks?: number;
  /** Phase the quantity is for, and its dates. */ phaseId?: string; needBy?: string; orderBy?: string;
  /** Stock planned but not held yet: hold from this date (need-by minus the hold window). */ holdFrom?: string; deferred?: boolean;
  /** Not a purchase order (grid connection agreement). */ agreement?: boolean;
}
export interface SourcedLine extends BomItem { model?: string; vendorName?: string; allocations: Allocation[]; fromSite: number; fromStock: number; toBuy: number; buyCost: number; avoidedCost: number; substituted?: string }
export interface VendorOrder { vendorId?: string; vendorName: string; contractId?: string; contractLabel: string; lines: SourcedLine[]; value: number; leadWeeks: number; phaseId?: string; phaseName?: string; needBy?: string; orderBy?: string }
export interface SourcedBom {
  lines: SourcedLine[]; total: number; buyTotal: number; stockValue: number; siteValue: number; vendors: VendorOrder[]; stockDeviceIds: string[]; siteRackIds: string[]; warnings: string[];
  /** Stock to hold later (need date beyond the hold window). */ plannedHoldDeviceIds?: string[];
  /** Grid connection and other agreements: paid in milestones, not purchase orders. */ agreements?: { item: string; value: number; note: string; phaseId?: string }[];
  /** How site capacity was decided for the plan (once, not per line). */ decisions?: { ups?: string; cooling?: string; plant?: string };
}

const EXISTING_SITE: T.PlannerScope[] = ['rack', 'pod', 'hall', 'retrofit', 'plant', 'server-refresh', 'network-refresh', 'rack-replace'];
const PURCHASE_CONTRACTS: T.Contract['type'][] = ['Supply', 'Framework'];
const WEEK = 7 * 864e5;
/** Items bought once for the whole site (with the first phase). */
const FIRST_PHASE_ONLY: ItemKind[] = ['hv-transformer', 'utility', 'core', 'firewall', 'bms'];

/** The purchase contract a vendor holds (a framework before a supply contract; never a support or SLA contract). */
export function purchaseContract(contracts: T.Contract[], vendorId?: string): T.Contract | undefined {
  const now = clockMs();
  return contracts.filter(c => c.vendorId === vendorId && c.status === 'Active' && new Date(c.endDate).getTime() > now && PURCHASE_CONTRACTS.includes(c.type)).sort((a, b) => (a.type === 'Framework' ? -1 : 1) - (b.type === 'Framework' ? -1 : 1))[0];
}

/** Spare capacity at the plan's site, decided once per plan (not line by line). */
export interface SiteCapacity { onSite: boolean; ups: boolean; cooling: boolean; plant: boolean; freePositions: T.Rack[]; decisions: NonNullable<SourcedBom['decisions']>; warnings: string[] }
export function siteCapacity(plan: T.PlannerPlan, ev: Evaluation, ctx: SourcingContext): SiteCapacity {
  const onSite = EXISTING_SITE.includes(plan.scope) && !!plan.dataCenterId;
  const dc = ctx.dataCenters.find(d => d.id === plan.dataCenterId);
  const site = ev.ctx.site;
  const added = plan.scope === 'plant' ? 0 : ev.sizing.itKw;
  const decisions: NonNullable<SourcedBom['decisions']> = {}; const warnings: string[] = [];
  let ups = false, cooling = false, plant = false;
  if (onSite && added > 0) {
    const upsStage = site?.stages.find(s => s.key === 'ups');
    if (upsStage) { ups = upsStage.headroomItKw >= added; decisions.ups = `${upsStage.label} at ${upsStage.redundancy}: ${Math.round(upsStage.headroomItKw)} kW free after load, holds and approved plans; ${ups ? 'covers' : 'does not cover'} the ${Math.round(added)} kW added`; }
    else {
      const units = ctx.upsUnits.filter(u => u.dataCenterId === plan.dataCenterId && u.status !== 'Failed');
      if (units.length) { const red = units[0].redundancy ?? 'N+1'; const usable = usableAt(red, units.map(u => ({ capacityKw: u.capacityKw }))); const load = units.reduce((a, u) => a + (u.loadKw || 0), 0); ups = usable - load >= added; decisions.ups = `UPS at ${red}: ${Math.round(usable - load)} kW usable free; ${ups ? 'covers' : 'does not cover'} the ${Math.round(added)} kW added`; }
    }
    if (site?.cooling.zones.length) { cooling = site.cooling.headroomKw >= added * 1.1; decisions.cooling = `Cooling with the largest unit lost per zone: ${Math.round(site.cooling.headroomKw)} kW free; ${cooling ? 'covers' : 'does not cover'} ${Math.round(added * 1.1)} kW (× 1.1)`; }
    if (site && plan.scope !== 'plant') { plant = site.headroomItKw >= added; decisions.plant = `Site plant: ${Math.round(site.headroomItKw)} kW IT free (binding: ${site.binding?.label ?? 'none'}); ${plant ? 'covers' : 'does not cover'} the ${Math.round(added)} kW added`; }
    if (!ups && decisions.ups) warnings.push(`UPS is short at ${dc?.name ?? 'the site'}: raise a plant plan for UPS rather than buying it inside this plan`);
  }
  const hallId = plan.params.targetHallId as string | undefined;
  const freePositions = onSite && plan.scope !== 'rack-replace' ? ctx.racks.filter(r => r.dataCenterId === plan.dataCenterId && (!hallId || r.hallId === hallId) && (r.status === 'Planned' || r.status === 'Reserved') && r.currentPowerKw === 0) : [];
  return { onSite, ups, cooling, plant, freePositions, decisions, warnings };
}

/** What a line could come from (for the Materials tab's source choice): spare site capacity, free stock of its model, or buying. */
export interface SourceAvailability { site: { qty: number; note: string }; stock: { qty: number; note: string } }
export function sourceAvailability(plan: T.PlannerPlan, ev: Evaluation, line: BomItem, ctx: SourcingContext, cap = siteCapacity(plan, ev, ctx)): SourceAvailability {
  const cat = CATALOGUE[line.kind];
  const dc = ctx.dataCenters.find(d => d.id === plan.dataCenterId)?.name ?? 'the site';
  let site = { qty: 0, note: cap.onSite ? 'not something the site has spare' : 'the plan does not use an existing site' };
  if (cap.onSite && cat?.siteCapacity && (plan.scope !== 'plant' || cat.siteCapacity === 'positions')) {
    if (cat.siteCapacity === 'positions') site = { qty: cap.freePositions.length, note: cap.freePositions.length ? `${cap.freePositions.length} planned or reserved rack position${cap.freePositions.length === 1 ? '' : 's'} free at ${dc}` : `no free rack positions at ${dc}` };
    else if (cat.siteCapacity === 'ups') site = line.kind === 'ups' && cap.ups ? { qty: line.qty, note: cap.decisions.ups ?? 'existing UPS has headroom' } : { qty: 0, note: cap.decisions.ups ?? 'no UPS headroom' };
    else if (cat.siteCapacity === 'cooling') site = cap.cooling ? { qty: line.qty, note: cap.decisions.cooling ?? 'existing cooling has headroom' } : { qty: 0, note: cap.decisions.cooling ?? 'no cooling headroom' };
    else if (cat.siteCapacity === 'plant') site = cap.plant ? { qty: line.qty, note: cap.decisions.plant ?? 'site plant has headroom' } : { qty: 0, note: cap.decisions.plant ?? 'no plant headroom' };
  }
  const option = optionOf(line.model);
  const holds = ctx.data ? { capacityReservations: ctx.data.capacityReservations } : undefined;
  const pool = cat?.stockable && option?.device ? ctx.devices.filter(d => d.model === option.model && isFreeStock(d, holds, plan.id)) : [];
  const atSite = pool.filter(d => d.dataCenterId && d.dataCenterId === plan.dataCenterId).length, depot = pool.filter(d => !d.dataCenterId).length;
  const stock = { qty: pool.length, note: !cat?.stockable ? 'not held in stock' : pool.length ? [atSite && `${atSite} spare at the site`, depot && `${depot} in the central depot`, pool.length - atSite - depot && `${pool.length - atSite - depot} at other sites`].filter(Boolean).join(', ') : `no free ${option?.model ?? line.item} in stock` };
  return { site, stock };
}

export function sourceBom(plan: T.PlannerPlan, ev: Evaluation, bom: Bom, ctx: SourcingContext): SourcedBom {
  const usedDevices = new Set<string>(); const usedRacks = new Set<string>(); const plannedHold = new Set<string>();
  const now = clockMs();
  const cap = siteCapacity(plan, ev, ctx);
  const warnings: string[] = [...cap.warnings, ...(bom.materials?.warnings ?? [])];
  const { onSite, decisions, freePositions } = cap;
  const upsCovered = cap.ups, coolCovered = cap.cooling, plantCovered = cap.plant;
  const dc = ctx.dataCenters.find(d => d.id === plan.dataCenterId);
  const phases = datedPhases(plan);
  const totalKw = phases.reduce((a, ph) => a + ph.itKw, 0) || 1;
  const contingencyPct = Number(ev.params['contingencyPct']?.value ?? 15) || 0;
  const holdWeeks = Number(ev.params['stockHoldWeeks']?.value ?? 12) || 12;
  const vendorRec = (name: string) => ctx.vendors.find(v => v.name === name);
  const holdsData = ctx.data ? { capacityReservations: ctx.data.capacityReservations } : undefined;
  const pc = { ...priceContext(plan, ev), models: ctx.assetModels, vendors: ctx.vendors };

  /** Split a quantity over the phases by kW (largest remainder); lines with a phase keep it. */
  const split = (line: BomItem): { phase: T.PlannerPhase | undefined; qty: number }[] => {
    if (line.phaseId) return [{ phase: phases.find(ph => ph.id === line.phaseId) ?? phases[0], qty: line.qty }];
    if (phases.length <= 1 || FIRST_PHASE_ONLY.includes(line.kind)) return [{ phase: phases[0], qty: line.qty }];
    const raw = phases.map(ph => ({ phase: ph, exact: (line.qty * ph.itKw) / totalKw }));
    const base = raw.map(x => ({ ...x, qty: Math.floor(x.exact) }));
    let left = line.qty - base.reduce((a, x) => a + x.qty, 0);
    for (const x of [...base].sort((a, b) => (b.exact - b.qty) - (a.exact - a.qty))) { if (left <= 0) break; x.qty++; left--; }
    return base.filter(x => x.qty > 0).map(x => ({ phase: x.phase, qty: x.qty }));
  };
  const datesFor = (kind: ItemKind, phase: T.PlannerPhase | undefined, lead: number) => {
    const gl = new Date(phase?.goLive ?? line0GoLive()).getTime();
    const needBy = gl - (NEED_WEEKS[kind] ?? 8) * WEEK;
    const buffer = Math.round((lead * contingencyPct) / 100);
    return { needBy: new Date(needBy).toISOString(), orderBy: new Date(needBy - (lead + buffer) * WEEK).toISOString() };
  };
  function line0GoLive() { return phases[0]?.goLive ?? plan.targetGoLive; }

  const lines: SourcedLine[] = bom.lines.map(raw => {
    /* a carrier's installation charge or circuit (leased wave, dark fibre lease) is bought from that carrier, never a catalogue line system
       (29-Oct-2026: Delivery ordered "36 × WaveLogic 5 line system" from Ciena for a 36-month Tata wavelength) */
    const carrier = raw.kind === 'dci' && /^(Carrier (installation|service)|Dark fibre (installation|lease))/.test(raw.item);
    const cat = carrier ? undefined : CATALOGUE[raw.kind];
    // Lines come priced from buildBom (materials.priceLine); a bill built elsewhere is priced here the same way.
    const line: BomItem = carrier ? { ...raw, model: undefined, vendorName: raw.manufacturer } : raw.priced ? raw : priceLine(plan, raw, pc);
    const option: CatalogueOption | undefined = cat ? optionOf(line.model) ?? chooseOption(raw.kind, line0GoLive(), ctx.assetModels, ctx.vendors).option : undefined;
    const substituted = line.substituted;
    if (substituted && cat) warnings.push(`${cat.label}: skipped ${substituted}; using ${option?.model ?? line.model}`);
    const force = line.forceSource;
    const allocations: Allocation[] = []; let remaining = line.qty;
    // 1. Site capacity (a plant upgrade adds the very plant it would otherwise reuse, so only rack positions count there).
    const siteOk = onSite && !!cat?.siteCapacity && (plan.scope !== 'plant' || cat.siteCapacity === 'positions');
    if (force === 'site' && !siteOk) warnings.push(`${line.item}: spare site capacity was asked for, but ${onSite ? 'the site has none of this kind' : 'the plan does not use an existing site'}; sourced as usual`);
    if (siteOk && remaining > 0 && force !== 'stock' && force !== 'buy') {
      if (cat!.siteCapacity === 'positions' && freePositions.length) {
        const take = freePositions.filter(r => !usedRacks.has(r.id)).slice(0, remaining);
        take.forEach(r => usedRacks.add(r.id));
        if (take.length) { allocations.push({ source: 'site', qty: take.length, unitCost: 0, rackIds: take.map(r => r.id), note: `${take.length} planned or reserved rack position${take.length === 1 ? '' : 's'} at ${dc?.name ?? 'the site'}` }); remaining -= take.length; }
      }
      if (cat!.siteCapacity === 'ups' && line.kind === 'ups' && upsCovered) { allocations.push({ source: 'site', qty: remaining, unitCost: 0, note: decisions.ups ?? 'existing UPS has headroom' }); remaining = 0; }
      if (cat!.siteCapacity === 'cooling' && coolCovered) { allocations.push({ source: 'site', qty: remaining, unitCost: 0, note: decisions.cooling ?? 'existing cooling has headroom' }); remaining = 0; }
      if (cat!.siteCapacity === 'plant' && plantCovered) { allocations.push({ source: 'site', qty: remaining, unitCost: 0, note: decisions.plant ?? 'site plant has headroom' }); remaining = 0; }
      if (force === 'site' && remaining > 0) warnings.push(`${line.item}: spare site capacity covers ${line.qty - remaining} of ${line.qty}; the rest is sourced as usual`);
    }
    const parts = remaining > 0 ? split({ ...line, qty: remaining }) : [];
    let stockShort = 0;
    for (const part of parts) {
      let left = part.qty;
      const lt = leadWeeksFor(line.leadItem ?? '', [], 0).leadWeeks;
      const lead = line.leadWeeks ?? lt;
      const dates = datesFor(line.kind, part.phase, lead);
      // 2. Stock, held only within the hold window before the need date.
      if (cat?.stockable && option?.device && left > 0 && force !== 'buy') {
        const pool = ctx.devices.filter(d => d.model === option!.model && isFreeStock(d, holdsData, plan.id) && !usedDevices.has(d.id) && !plannedHold.has(d.id));
        const ranked = [...pool.filter(d => d.dataCenterId === plan.dataCenterId), ...pool.filter(d => !d.dataCenterId), ...pool.filter(d => d.dataCenterId && d.dataCenterId !== plan.dataCenterId)];
        const take = ranked.slice(0, left);
        if (take.length) {
          const holdFrom = new Date(new Date(dates.needBy).getTime() - holdWeeks * WEEK);
          const deferred = holdFrom.getTime() > now;
          take.forEach(d => (deferred ? plannedHold : usedDevices).add(d.id));
          const atSite = take.filter(d => d.dataCenterId && d.dataCenterId === plan.dataCenterId).length, depot = take.filter(d => !d.dataCenterId).length, transfer = take.length - atSite - depot;
          allocations.push({ source: 'stock', qty: take.length, unitCost: 0, deviceIds: take.map(d => d.id), phaseId: part.phase?.id, needBy: dates.needBy, holdFrom: holdFrom.toISOString(), deferred,
            note: [atSite && `${atSite} spare at the site`, depot && `${depot} from the central depot`, transfer && `${transfer} transferred from other sites`].filter(Boolean).join(', ') + (deferred ? `; hold from ${holdFrom.toISOString().slice(0, 10)} (${holdWeeks} weeks before need)` : '') });
          left -= take.length;
        }
      }
      if (force === 'stock') stockShort += left;
      // 3. Procurement (or an agreement for the grid connection).
      if (left > 0) {
        if (cat?.agreement) { allocations.push({ source: 'procure', qty: left, unitCost: line.unitCost, agreement: true, vendorName: option?.vendor, phaseId: part.phase?.id, needBy: dates.needBy, note: 'Grid connection agreement with the network operator, paid in milestones (not a purchase order)' }); continue; }
        const vName = line.vendorName ?? option?.vendor;
        const v = vName ? vendorRec(vName) : undefined;
        const c = purchaseContract(ctx.contracts, v?.id);
        if (vName && !v) warnings.push(`${line.item}: no vendor record for ${vName}`);
        if (v && !c) warnings.push(`${line.item}: ${v.name} has no active supply or framework contract; buy on a one-off order`);
        allocations.push({ source: 'procure', qty: left, unitCost: line.unitCost, vendorId: v?.id, vendorName: v?.name ?? vName ?? 'To tender', contractId: c?.id, leadWeeks: lead, phaseId: part.phase?.id, needBy: dates.needBy, orderBy: dates.orderBy, note: c ? `${v?.name} under ${c.type.toLowerCase()} contract ${c.ctrId}` : v ? `${v.name}, one-off order` : 'To tender' });
      }
    }
    if (force === 'stock' && stockShort > 0) warnings.push(`${line.item}: stock was asked for, but only ${line.qty - stockShort - (line.qty - remaining)} of ${remaining} are free; ${stockShort} bought`);
    if (force === 'stock' && !(cat?.stockable && option?.device)) warnings.push(`${line.item}: not something held in stock; bought`);
    const fromSite = allocations.filter(a => a.source === 'site').reduce((a, x) => a + x.qty, 0);
    const fromStock = allocations.filter(a => a.source === 'stock').reduce((a, x) => a + x.qty, 0);
    const toBuy = allocations.filter(a => a.source === 'procure').reduce((a, x) => a + x.qty, 0);
    return { ...line, model: line.model ?? option?.model, vendorName: line.vendorName ?? option?.vendor, allocations, fromSite, fromStock, toBuy, buyCost: Math.round(toBuy * line.unitCost), avoidedCost: Math.round((fromSite + fromStock) * (line.listUnitCost ?? line.unitCost)), substituted };
  });

  // Purchase orders: one per vendor per phase, under the vendor's supply or framework contract.
  const byKey = new Map<string, VendorOrder>();
  const agreements: NonNullable<SourcedBom['agreements']> = [];
  /* monthly service charges (circuits) are a commitment billed by the carrier, not something ordered */
  for (const l of lines.filter(x => !x.monthly)) for (const a of l.allocations.filter(x => x.source === 'procure')) {
    if (a.agreement) { agreements.push({ item: l.item, value: Math.round(a.qty * a.unitCost), note: a.note, phaseId: a.phaseId }); continue; }
    const vName = a.vendorName ?? 'To tender'; const key = `${vName}|${a.phaseId ?? ''}`;
    const ph = phases.find(x => x.id === a.phaseId);
    const vo = byKey.get(key) ?? { vendorId: a.vendorId, vendorName: vName, contractId: a.contractId, contractLabel: a.contractId ? (ctx.contracts.find(c => c.id === a.contractId)?.ctrId ?? a.contractId) : 'no supply contract', lines: [], value: 0, leadWeeks: 0, phaseId: a.phaseId, phaseName: ph?.name, needBy: a.needBy, orderBy: a.orderBy };
    if (!vo.lines.includes(l)) vo.lines.push(l);
    vo.value += Math.round(a.qty * a.unitCost); vo.leadWeeks = Math.max(vo.leadWeeks, a.leadWeeks ?? 0);
    if (a.needBy && (!vo.needBy || a.needBy < vo.needBy)) vo.needBy = a.needBy;
    if (a.orderBy && (!vo.orderBy || a.orderBy < vo.orderBy)) vo.orderBy = a.orderBy;
    byKey.set(key, vo);
  }
  const vendors = [...byKey.values()].sort((a, b) => (a.orderBy ?? '').localeCompare(b.orderBy ?? '') || b.value - a.value);
  const agreementValue = agreements.reduce((a, x) => a + x.value, 0);
  // The total is the bill's (monthly service charges such as carrier circuits are not CapEx); the split by source counts every order.
  return {
    lines, total: lines.filter(l => !l.monthly).reduce((a, l) => a + l.total, 0), buyTotal: lines.reduce((a, l) => a + l.buyCost, 0) - agreementValue, stockValue: lines.reduce((a, l) => a + (l.fromStock * (l.listUnitCost ?? l.unitCost)), 0), siteValue: lines.reduce((a, l) => a + (l.fromSite * (l.listUnitCost ?? l.unitCost)), 0),
    vendors, stockDeviceIds: [...usedDevices], siteRackIds: [...usedRacks], warnings: [...new Set(warnings)], plannedHoldDeviceIds: [...plannedHold], agreements, decisions,
  };
}
