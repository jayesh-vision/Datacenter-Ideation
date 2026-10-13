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
import { CATALOGUE, chooseOption, isFreeStock, type CatalogueOption, type ItemKind } from './catalogue';
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
/** Weeks before go-live an item is needed on site (installation and commissioning time). */
const NEED_WEEKS: Partial<Record<ItemKind, number>> = { 'hv-transformer': 30, transformer: 30, switchgear: 24, generator: 26, ups: 20, chiller: 20, 'dry-cooler': 20, cdu: 14, crah: 14, fanwall: 14, inrow: 14, reardoor: 14, pdu: 12, rack: 10, containment: 10, leaf: 10, spine: 10, core: 10, optics: 8, fibre: 8, dac: 6, 'gpu-server': 4, server: 4, storage: 4 };
/** Items bought once for the whole site (with the first phase). */
const FIRST_PHASE_ONLY: ItemKind[] = ['hv-transformer', 'utility', 'core', 'firewall', 'bms'];

export function sourceBom(plan: T.PlannerPlan, ev: Evaluation, bom: Bom, ctx: SourcingContext): SourcedBom {
  const warnings: string[] = []; const usedDevices = new Set<string>(); const usedRacks = new Set<string>(); const plannedHold = new Set<string>();
  const now = clockMs();
  const onSite = EXISTING_SITE.includes(plan.scope) && !!plan.dataCenterId;
  const dc = ctx.dataCenters.find(d => d.id === plan.dataCenterId);
  const phases = datedPhases(plan);
  const totalKw = phases.reduce((a, ph) => a + ph.itKw, 0) || 1;
  const contingencyPct = Number(ev.params['contingencyPct']?.value ?? 15) || 0;
  const holdWeeks = Number(ev.params['stockHoldWeeks']?.value ?? 12) || 12;
  const vendorRec = (name: string) => ctx.vendors.find(v => v.name === name);
  const contractFor = (vendorId?: string) => ctx.contracts.filter(c => c.vendorId === vendorId && c.status === 'Active' && new Date(c.endDate).getTime() > now && PURCHASE_CONTRACTS.includes(c.type)).sort((a, b) => (a.type === 'Framework' ? -1 : 1) - (b.type === 'Framework' ? -1 : 1))[0];
  const holdsData = ctx.data ? { capacityReservations: ctx.data.capacityReservations } : undefined;

  // ── Site capacity, decided once per plan ──
  const site = ev.ctx.site;
  const added = plan.scope === 'plant' ? 0 : ev.sizing.itKw;
  const decisions: NonNullable<SourcedBom['decisions']> = {};
  let upsCovered = false, coolCovered = false, plantCovered = false;
  if (onSite && added > 0) {
    const upsStage = site?.stages.find(s => s.key === 'ups');
    if (upsStage) { upsCovered = upsStage.headroomItKw >= added; decisions.ups = `${upsStage.label} at ${upsStage.redundancy}: ${Math.round(upsStage.headroomItKw)} kW free after load, holds and approved plans; ${upsCovered ? 'covers' : 'does not cover'} the ${Math.round(added)} kW added`; }
    else {
      const units = ctx.upsUnits.filter(u => u.dataCenterId === plan.dataCenterId && u.status !== 'Failed');
      if (units.length) { const red = units[0].redundancy ?? 'N+1'; const usable = usableAt(red, units.map(u => ({ capacityKw: u.capacityKw }))); const load = units.reduce((a, u) => a + (u.loadKw || 0), 0); upsCovered = usable - load >= added; decisions.ups = `UPS at ${red}: ${Math.round(usable - load)} kW usable free; ${upsCovered ? 'covers' : 'does not cover'} the ${Math.round(added)} kW added`; }
    }
    if (site?.cooling.zones.length) { coolCovered = site.cooling.headroomKw >= added * 1.1; decisions.cooling = `Cooling with the largest unit lost per zone: ${Math.round(site.cooling.headroomKw)} kW free; ${coolCovered ? 'covers' : 'does not cover'} ${Math.round(added * 1.1)} kW (× 1.1)`; }
    if (site && plan.scope !== 'plant') { plantCovered = site.headroomItKw >= added; decisions.plant = `Site plant: ${Math.round(site.headroomItKw)} kW IT free (binding: ${site.binding?.label ?? 'none'}); ${plantCovered ? 'covers' : 'does not cover'} the ${Math.round(added)} kW added`; }
    if (!upsCovered && decisions.ups) warnings.push(`UPS is short at ${dc?.name ?? 'the site'}: raise a plant plan for UPS rather than buying it inside this plan`);
  }
  const hallId = plan.params.targetHallId as string | undefined;
  const freePositions = onSite && plan.scope !== 'rack-replace' ? ctx.racks.filter(r => r.dataCenterId === plan.dataCenterId && (!hallId || r.hallId === hallId) && (r.status === 'Planned' || r.status === 'Reserved') && r.currentPowerKw === 0) : [];
  const itLines = ev.estimate.it?.lines ?? [];

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
    const cat = CATALOGUE[raw.kind];
    let line: BomItem = raw; let option: CatalogueOption | undefined; let substituted: string | undefined;
    if (cat) {
      const preferred = raw.model ?? REPLACEMENT_MODEL(plan, raw.kind);
      const pick = chooseOption(raw.kind, line0GoLive(), ctx.assetModels, ctx.vendors, preferred);
      option = pick.option;
      if (pick.skipped.length) { substituted = pick.skipped.map(x => `${x.model} (${x.reason})`).join(', '); warnings.push(`${cat.label}: skipped ${substituted}; using ${option.model}`); }
      const isIt = raw.kind === 'gpu-server' || raw.kind === 'server' || raw.kind === 'storage';
      const itLine = isIt ? itLines.find(l => l.kind === raw.kind && (raw.item.toLowerCase().includes(l.className.toLowerCase()) || itLines.filter(x => x.kind === raw.kind).length === 1)) ?? itLines.find(l => l.kind === raw.kind) : undefined;
      if (isIt && raw.unit === 'rack') {
        // Per-rack IT lines become server units of the same model and price as the estimate.
        const perRack = itLine?.perRack ?? 1; const model = itLine?.model ?? option.model; const price = itLine?.unitPrice ?? option.unitPrice;
        option = CATALOGUE[raw.kind].options.find(o => o.model === model) ?? option;
        const qty = raw.qty * perRack;
        line = { ...raw, item: `${cat.label}s`, spec: `${model}, ${perRack} per rack in ${raw.qty} rack${raw.qty === 1 ? '' : 's'}`, qty, unit: 'each', unitCost: price, total: qty * price, manufacturer: option.manufacturer, model };
      } else if (isIt && itLine && (!raw.model || raw.model === itLine.model)) {
        option = CATALOGUE[raw.kind].options.find(o => o.model === itLine.model) ?? option;
        line = { ...raw, unitCost: itLine.unitPrice, total: raw.qty * itLine.unitPrice, manufacturer: option.manufacturer, model: itLine.model, spec: raw.spec.includes(itLine.model) ? raw.spec : `${itLine.model} · ${raw.spec}` };
      } else if (option.unitPrice && (cat.stockable || raw.kind === 'rack')) {
        line = { ...raw, unitCost: option.unitPrice, total: raw.qty * option.unitPrice, manufacturer: option.manufacturer, model: option.model, spec: raw.spec.includes(option.model) ? raw.spec : `${option.model} · ${raw.spec}` };
      } else line = { ...raw, manufacturer: raw.manufacturer === 'To tender' ? option.manufacturer : raw.manufacturer };
    }
    const allocations: Allocation[] = []; let remaining = line.qty;
    // 1. Site capacity (a plant upgrade adds the very plant it would otherwise reuse, so only rack positions count there).
    if (onSite && cat?.siteCapacity && remaining > 0 && (plan.scope !== 'plant' || cat.siteCapacity === 'positions')) {
      if (cat.siteCapacity === 'positions' && freePositions.length) {
        const take = freePositions.filter(r => !usedRacks.has(r.id)).slice(0, remaining);
        take.forEach(r => usedRacks.add(r.id));
        if (take.length) { allocations.push({ source: 'site', qty: take.length, unitCost: 0, rackIds: take.map(r => r.id), note: `${take.length} planned or reserved rack position${take.length === 1 ? '' : 's'} at ${dc?.name ?? 'the site'}` }); remaining -= take.length; }
      }
      if (cat.siteCapacity === 'ups' && line.kind === 'ups' && upsCovered) { allocations.push({ source: 'site', qty: remaining, unitCost: 0, note: decisions.ups ?? 'existing UPS has headroom' }); remaining = 0; }
      if (cat.siteCapacity === 'cooling' && coolCovered) { allocations.push({ source: 'site', qty: remaining, unitCost: 0, note: decisions.cooling ?? 'existing cooling has headroom' }); remaining = 0; }
      if (cat.siteCapacity === 'plant' && plantCovered) { allocations.push({ source: 'site', qty: remaining, unitCost: 0, note: decisions.plant ?? 'site plant has headroom' }); remaining = 0; }
    }
    const parts = remaining > 0 ? split({ ...line, qty: remaining }) : [];
    for (const part of parts) {
      let left = part.qty;
      const lt = leadWeeksFor(line.leadItem ?? '', [], 0).leadWeeks;
      const lead = line.leadWeeks ?? lt;
      const dates = datesFor(line.kind, part.phase, lead);
      // 2. Stock, held only within the hold window before the need date.
      if (cat?.stockable && option?.device && left > 0) {
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
      // 3. Procurement (or an agreement for the grid connection).
      if (left > 0) {
        if (cat?.agreement) { allocations.push({ source: 'procure', qty: left, unitCost: line.unitCost, agreement: true, vendorName: option?.vendor, phaseId: part.phase?.id, needBy: dates.needBy, note: 'Grid connection agreement with the network operator, paid in milestones (not a purchase order)' }); continue; }
        const v = option ? vendorRec(option.vendor) : undefined;
        const c = contractFor(v?.id);
        if (option && !v) warnings.push(`${line.item}: no vendor record for ${option.vendor}`);
        if (v && !c) warnings.push(`${line.item}: ${v.name} has no active supply or framework contract; buy on a one-off order`);
        allocations.push({ source: 'procure', qty: left, unitCost: line.unitCost, vendorId: v?.id, vendorName: v?.name ?? option?.vendor ?? 'To tender', contractId: c?.id, leadWeeks: lead, phaseId: part.phase?.id, needBy: dates.needBy, orderBy: dates.orderBy, note: c ? `${v?.name} under ${c.type.toLowerCase()} contract ${c.ctrId}` : v ? `${v.name}, one-off order` : 'To tender' });
      }
    }
    const fromSite = allocations.filter(a => a.source === 'site').reduce((a, x) => a + x.qty, 0);
    const fromStock = allocations.filter(a => a.source === 'stock').reduce((a, x) => a + x.qty, 0);
    const toBuy = allocations.filter(a => a.source === 'procure').reduce((a, x) => a + x.qty, 0);
    return { ...line, model: option?.model ?? line.model, vendorName: option?.vendor, allocations, fromSite, fromStock, toBuy, buyCost: Math.round(toBuy * line.unitCost), avoidedCost: Math.round((fromSite + fromStock) * line.unitCost), substituted };
  });

  // Purchase orders: one per vendor per phase, under the vendor's supply or framework contract.
  const byKey = new Map<string, VendorOrder>();
  const agreements: NonNullable<SourcedBom['agreements']> = [];
  for (const l of lines) for (const a of l.allocations.filter(x => x.source === 'procure')) {
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
  return {
    lines, total: lines.reduce((a, l) => a + l.total, 0), buyTotal: lines.reduce((a, l) => a + l.buyCost, 0) - agreementValue, stockValue: lines.reduce((a, l) => a + (l.fromStock * l.unitCost), 0), siteValue: lines.reduce((a, l) => a + (l.fromSite * l.unitCost), 0),
    vendors, stockDeviceIds: [...usedDevices], siteRackIds: [...usedRacks], warnings: [...new Set(warnings)], plannedHoldDeviceIds: [...plannedHold], agreements, decisions,
  };
}

/** Replacement plans name the model to use; others take the catalogue preference. */
function REPLACEMENT_MODEL(plan: T.PlannerPlan, kind: string): string | undefined {
  if (kind === 'rack' && plan.params.rackModel) return String(plan.params.rackModel);
  if (plan.params.replacementModel && (plan.scope === 'server-refresh' || plan.scope === 'network-refresh')) return String(plan.params.replacementModel);
  return undefined;
}
