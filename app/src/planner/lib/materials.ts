/**
 * Materials — the bill of materials as the plan buys it.
 *
 *  1. Pricing (`priceLine`): every line is resolved to an approved catalogue model and priced the way sourcing always priced it
 *     (per-rack IT lines become server units of the estimate's model and price, stockable kit and racks take the model's price-book
 *     price). It runs in `buildBom`, so the bill, the estimate reconciliation (Cost tab), the Plan pack, the review pack, the vendor
 *     orders and Delivery's purchase orders all read the same priced lines (they used to differ: the pack priced, the Cost tab did not).
 *  2. Overrides (`applyOverrides`): the planner's edits kept on the plan (`plan.materialOverrides`, keyed by a stable line key):
 *     quantity, another approved model of the same kind (same rating for plant; per-rack IT quantities follow the model's draw and
 *     height), the vendor (the maker or an authorised channel: price premium and lead-time difference), the source (applied by
 *     sourcing), removal, and lines added from the catalogue.
 *  3. Effect (`materialsEffect`): the bill against the planner's own proposal (the same bill without overrides) — line by line, with
 *     the cost difference — which the engine adds to the estimate as one CapEx line and lays over the order schedule (lead times,
 *     order-by dates, items removed or added).
 */
import type * as T from '../p2b/types';
import type { Bom, BomCategory, BomItem } from './outputs';
import { CATALOGUE, chooseOption, optionOf, sellersOf, type CatalogueOption, type ItLine, type ItemKind } from './catalogue';
import { datedPhases, type Evaluation, type ScheduleItem } from './engine';
import { clockMs } from '../compat/clock';

const r0 = (n: number) => Math.round(n);
const WEEK = 7 * 864e5;

/* ================================================================== line keys */
/** A line's stable key: what it is (kind and name), the phase and the site it is for. Positional ids (B1, B2…) move when the sizing adds a
 *  line; the key does not. */
export const lineKey = (l: Pick<BomItem, 'kind' | 'item' | 'phaseId' | 'siteRef'>) => [l.kind, l.item, l.phaseId ?? '', l.siteRef ?? ''].join('|');
/** Give every line its key (a repeated key gets `#2`, `#3`…). */
export function keyLines(lines: BomItem[]): void {
  const seen = new Map<string, number>();
  for (const l of lines) { const k = lineKey(l); const n = (seen.get(k) ?? 0) + 1; seen.set(k, n); l.key = n > 1 ? `${k}#${n}` : k; }
}

/* ================================================================== pricing */
const IT_KINDS: ItemKind[] = ['gpu-server', 'server', 'storage'];
/** Replacement plans name the model to use; others take the catalogue preference. */
export function replacementModel(plan: T.PlannerPlan, kind: string): string | undefined {
  if (kind === 'rack' && plan.params.rackModel) return String(plan.params.rackModel);
  if (plan.params.replacementModel && (plan.scope === 'server-refresh' || plan.scope === 'network-refresh')) return String(plan.params.replacementModel);
  return undefined;
}
/** True when the line's unit price is the catalogue model's price (IT, stockable kit, racks); plant and services keep the bill's own
 *  sized price and only take the model's maker. */
export const pricedFromCatalogue = (kind: ItemKind) => IT_KINDS.includes(kind) || !!CATALOGUE[kind]?.stockable || kind === 'rack';

export interface PriceContext { itLines: ItLine[]; usableU?: number; models: T.AssetModel[]; vendors: T.Vendor[]; neededBy: string }
export function priceContext(plan: T.PlannerPlan, ev: Evaluation): PriceContext {
  const data = ev.ctx?.data;
  return { itLines: ev.estimate?.it?.lines ?? [], usableU: ev.estimate?.it?.usableU, models: data?.assetModels ?? [], vendors: data?.vendors ?? [], neededBy: datedPhases(plan)[0]?.goLive ?? plan.targetGoLive };
}
/** One bill line resolved to its catalogue model and priced (pure; already priced lines come back unchanged). */
export function priceLine(plan: T.PlannerPlan, raw: BomItem, pc: PriceContext): BomItem {
  if (raw.priced) return raw;
  const cat = CATALOGUE[raw.kind];
  if (!cat) return { ...raw, priced: true };
  let line: BomItem = raw;
  const preferred = raw.model ?? replacementModel(plan, raw.kind);
  const pick = chooseOption(raw.kind, pc.neededBy, pc.models, pc.vendors, preferred);
  let option = pick.option;
  const substituted = pick.skipped.length ? pick.skipped.map(x => `${x.model} (${x.reason})`).join(', ') : undefined;
  const isIt = IT_KINDS.includes(raw.kind);
  const itLine = isIt ? pc.itLines.find(l => l.kind === raw.kind && (raw.item.toLowerCase().includes(l.className.toLowerCase()) || pc.itLines.filter(x => x.kind === raw.kind).length === 1)) ?? pc.itLines.find(l => l.kind === raw.kind) : undefined;
  if (isIt && raw.unit === 'rack') {
    // Per-rack IT lines become server units of the same model and price as the estimate.
    const perRack = itLine?.perRack ?? 1; const model = itLine?.model ?? option.model; const price = itLine?.unitPrice ?? option.unitPrice;
    option = cat.options.find(o => o.model === model) ?? option;
    const qty = raw.qty * perRack;
    line = { ...raw, item: `${cat.label}s`, spec: `${model}, ${perRack} per rack in ${raw.qty} rack${raw.qty === 1 ? '' : 's'}`, qty, unit: 'each', unitCost: price, total: qty * price, manufacturer: option.manufacturer, model,
      perRack: { racks: raw.qty, rackKw: itLine?.rackKw ?? 0, usableU: pc.usableU ?? 38, perRack } };
  } else if (isIt && itLine && (!raw.model || raw.model === itLine.model)) {
    option = cat.options.find(o => o.model === itLine.model) ?? option;
    line = { ...raw, unitCost: itLine.unitPrice, total: raw.qty * itLine.unitPrice, manufacturer: option.manufacturer, model: itLine.model, spec: raw.spec.includes(itLine.model) ? raw.spec : `${itLine.model} · ${raw.spec}` };
  } else if (option.unitPrice && (cat.stockable || raw.kind === 'rack')) {
    line = { ...raw, unitCost: option.unitPrice, total: raw.qty * option.unitPrice, manufacturer: option.manufacturer, model: option.model, spec: raw.spec.includes(option.model) ? raw.spec : `${option.model} · ${raw.spec}` };
  } else line = { ...raw, manufacturer: raw.manufacturer === 'To tender' ? option.manufacturer : raw.manufacturer, model: raw.model ?? option.model };
  /* a model the catalogue does not carry (a router line card named by the network family) is bought from its maker, not from the
     catalogue's default vendor for the kind (29-Oct-2026: a Juniper MPC10E line card was ordered from Arista) */
  const ownModel = !!raw.model && line.model === raw.model && !cat.options.some(o => o.model === raw.model) && raw.manufacturer && raw.manufacturer !== 'To tender';
  /* the estate writes makers in capitals (JUNIPER): name the vendor as its vendor record does */
  const maker = ownModel ? ((pc.vendors ?? []) as { name: string }[]).find(v => v.name.toLowerCase().startsWith(raw.manufacturer.toLowerCase()))?.name ?? raw.manufacturer.replace(/\b([A-Z])([A-Z]+)\b/g, (_, a: string, b: string) => a + b.toLowerCase()) : undefined;
  return { ...line, vendorName: maker ?? option.vendor, substituted, priced: true };
}

/* ================================================================== models a line may swap to */
export interface ModelChoice { option: CatalogueOption; blocked?: string; current: boolean }
/** Approved catalogue models of the line's kind it may swap to: same rating for plant (a UPS module or a generator is sized), every
 *  model for IT, network and passive kit. A model near end of life or from an inactive vendor is listed with the reason, not offered. */
export function modelChoices(line: Pick<BomItem, 'kind' | 'model'>, models: T.AssetModel[], vendors: T.Vendor[], neededBy: string): ModelChoice[] {
  const k = CATALOGUE[line.kind]; if (!k || k.agreement) return [];
  const cur = optionOf(line.model) ?? k.options[0];
  const horizon = new Date(neededBy).getTime() + 2 * 365 * 864e5;
  return k.options.filter(o => (o.ratingKw ?? 0) === (cur.ratingKw ?? 0) && (o.ratingKva ?? 0) === (cur.ratingKva ?? 0)).map(o => {
    const am = models.find(m => m.model === o.model); const v = vendors.find(x => x.name === o.vendor);
    const blocked = am?.eolDate && new Date(am.eolDate).getTime() < horizon ? `end of life ${new Date(am.eolDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : v && v.status !== 'Active' ? `${o.vendor} is not an active vendor` : undefined;
    return { option: o, blocked, current: o.model === cur.model };
  });
}
/** Units per rack for an IT model in a rack of `rackKw`: the model's draw and height (the DCIM asset model wins), as itQuantities does. */
export function perRackFor(o: CatalogueOption, rackKw: number, usableU: number, models: T.AssetModel[]): { perRack: number; typicalW: number; heightU: number; limitedBy: 'power' | 'space' } {
  const am = models.find(m => m.model === o.model);
  const typicalW = Math.max(100, am?.typicalPowerW || o.typicalW || 800); const heightU = Math.max(1, am?.heightU || o.heightU || 2);
  const byPower = Math.floor((rackKw * 1000) / typicalW); const bySpace = Math.floor(usableU / heightU);
  return { perRack: Math.max(1, Math.min(byPower, bySpace)), typicalW, heightU, limitedBy: byPower <= bySpace ? 'power' : 'space' };
}

/* ================================================================== overrides */
/** Lead-time benchmark per kind, for lines added from the catalogue. */
export const LEAD_ITEM: Partial<Record<ItemKind, string>> = {
  'gpu-server': 'GPU servers', server: 'General servers', storage: 'General servers', leaf: 'Spine / leaf switches', spine: 'Spine / leaf switches', core: 'Spine / leaf switches', firewall: 'Spine / leaf switches', oob: 'Spine / leaf switches',
  optics: 'Optics (400G)', dac: 'Optics (400G)', fibre: 'Fibre trunks', patch: 'Fibre trunks', rack: 'Racks and containment', containment: 'Racks and containment', cage: 'Racks and containment',
  'rack-pdu': 'PDU', pdu: 'PDU', ups: 'UPS (1 MW module)', 'ups-small': 'Small UPS', generator: 'Generator (2.5 MVA)', 'generator-small': 'Small generator', transformer: 'Transformer (33 kV)', 'hv-transformer': 'HV substation',
  switchgear: 'Switchgear', chiller: 'Chiller', 'dry-cooler': 'Dry cooler', crah: 'CRAH / CDU', cdu: 'CRAH / CDU', inrow: 'CRAH / CDU', reardoor: 'CRAH / CDU', fanwall: 'CRAH / CDU', enclosure: 'Prefabricated enclosure',
};
/** Category a kind's added line goes under. */
export const KIND_CATEGORY: Record<ItemKind, BomCategory> = {
  'gpu-server': 'Compute and storage', server: 'Compute and storage', storage: 'Compute and storage', leaf: 'Network', spine: 'Network', core: 'Network', firewall: 'Network', oob: 'Network', optics: 'Network', dci: 'Network',
  rack: 'Racks and containment', containment: 'Racks and containment', cage: 'Racks and containment', enclosure: 'Racks and containment', fitout: 'Racks and containment', move: 'Racks and containment', floor: 'Cooling',
  'rack-pdu': 'Power', ups: 'Power', 'ups-small': 'Power', generator: 'Power', 'generator-small': 'Power', transformer: 'Power', 'hv-transformer': 'Power', switchgear: 'Power', pdu: 'Power', utility: 'Power', install: 'Power',
  crah: 'Cooling', cdu: 'Cooling', inrow: 'Cooling', reardoor: 'Cooling', chiller: 'Cooling', 'cooling-small': 'Cooling', sfn: 'Cooling', 'dry-cooler': 'Cooling', fanwall: 'Cooling',
  fibre: 'Cabling', dac: 'Cabling', patch: 'Cabling', suppression: 'Fire and security', vesda: 'Fire and security', access: 'Fire and security', disposal: 'Fire and security', bms: 'Monitoring',
};
/** Kinds the planner can add from the catalogue (priced per unit; services and grid agreements are not added by hand). */
export const ADDABLE_KINDS: ItemKind[] = (Object.keys(CATALOGUE) as ItemKind[]).filter(k => !CATALOGUE[k].agreement && CATALOGUE[k].options.some(o => o.unitPrice > 0));

export interface OverrideContext extends PriceContext { lead: (leadItem: string) => number | undefined }
/** What an override did to its line, kept on the line for the change summary. */
export interface AppliedOverride { qty?: boolean; model?: boolean; vendor?: boolean; source?: boolean; added?: boolean; warnings: string[] }

/** Apply the plan's overrides to the priced proposal; returns the lines the plan buys (removed ones dropped) and notes for overrides that
 *  no longer apply (their line is gone, the vendor no longer sells the swapped model). */
export function applyOverrides(lines: BomItem[], overrides: T.PlannerMaterialOverride[] | undefined, oc: OverrideContext): { lines: BomItem[]; stale: T.PlannerMaterialOverride[]; warnings: string[] } {
  if (!overrides?.length) return { lines, stale: [], warnings: [] };
  const byKey = new Map(overrides.map(o => [o.key, o]));
  const out: BomItem[] = []; const warnings: string[] = []; const used = new Set<string>();
  for (const l of lines) {
    const o = l.key ? byKey.get(l.key) : undefined;
    if (!o) { out.push(l); continue; }
    used.add(o.key);
    if (o.removed) continue;
    out.push(overrideLine(l, o, oc, warnings));
  }
  for (const o of overrides.filter(x => x.added && !x.removed)) {
    used.add(o.key);
    const added = addedLine(o, oc);
    if (added) out.push(overrideLine(added, { ...o, model: undefined, qty: undefined }, oc, warnings));
  }
  return { lines: out, stale: overrides.filter(o => !used.has(o.key)), warnings };
}
function overrideLine(l: BomItem, o: T.PlannerMaterialOverride, oc: OverrideContext, warnings: string[]): BomItem {
  const applied: AppliedOverride = { warnings: [] };
  let line: BomItem = { ...l };
  const cat = CATALOGUE[l.kind];
  if (o.model && o.model !== l.model && cat) {
    const next = cat.options.find(x => x.model === o.model); const prev = optionOf(l.model) ?? cat.options[0];
    if (!next) applied.warnings.push(`${o.model} is not an approved ${cat.label.toLowerCase()} model`);
    else {
      applied.model = true;
      const unitCost = pricedFromCatalogue(l.kind) ? next.unitPrice : r0(l.unitCost * (prev.unitPrice ? next.unitPrice / prev.unitPrice : 1));
      let qty = line.qty; let spec = l.model && l.spec.includes(l.model) ? l.spec.split(l.model).join(next.model) : `${next.model} · ${l.spec}`;
      if (l.perRack) {
        // Per-rack IT: the new model's draw and height decide how many fit in each rack.
        const pr = perRackFor(next, l.perRack.rackKw, l.perRack.usableU, oc.models);
        qty = l.perRack.racks * pr.perRack;
        spec = `${next.model}, ${pr.perRack} per rack in ${l.perRack.racks} rack${l.perRack.racks === 1 ? '' : 's'}`;
        line.perRack = { ...l.perRack, perRack: pr.perRack };
      }
      line = { ...line, model: next.model, manufacturer: next.manufacturer, unitCost, qty, spec, vendorName: next.vendor, substituted: undefined };
    }
  }
  if (o.qty !== undefined && o.qty >= 0 && o.qty !== line.qty) { applied.qty = true; line.qty = r0(o.qty); }
  if (o.vendor && o.vendor !== line.vendorName) {
    const s = sellersOf(l.kind, line.model).find(x => x.vendor === o.vendor);
    if (!s) applied.warnings.push(`${o.vendor} does not sell ${line.model ?? l.item}; bought from ${line.vendorName ?? 'the maker'}`);
    else {
      applied.vendor = true;
      const base = line.leadWeeks ?? (l.leadItem ? oc.lead(l.leadItem) : undefined);
      line = { ...line, vendorName: s.vendor, chosenVendor: s.vendor, listUnitCost: line.unitCost, unitCost: r0(line.unitCost * (1 + s.premiumPct / 100)), leadWeeks: base !== undefined ? Math.max(1, base + s.leadDeltaWeeks) : undefined, leadDelta: s.leadDeltaWeeks };
    }
  }
  if (o.source && o.source !== 'auto') { applied.source = true; line.forceSource = o.source; }
  if (o.added) applied.added = true;
  line.total = r0(line.qty * line.unitCost);
  line.applied = applied;
  warnings.push(...applied.warnings.map(w => `${l.item}: ${w}`));
  return line;
}
function addedLine(o: T.PlannerMaterialOverride, oc: OverrideContext): BomItem | undefined {
  const kind = o.kind as ItemKind; const cat = CATALOGUE[kind]; if (!cat || !o.added) return undefined;
  const opt = (o.model && cat.options.find(x => x.model === o.model)) || chooseOption(kind, oc.neededBy, oc.models, oc.vendors).option;
  const leadItem = LEAD_ITEM[kind];
  const qty = Math.max(0, r0(o.qty ?? 1));
  return {
    id: o.key, key: o.key, kind, category: (o.added.category as BomCategory) || KIND_CATEGORY[kind], item: o.item || cat.label, spec: o.added.spec || opt.model, qty, unit: o.added.unit || 'each',
    unitCost: opt.unitPrice, total: qty * opt.unitPrice, leadItem, leadWeeks: leadItem ? oc.lead(leadItem) : undefined, partNumber: o.key, manufacturer: opt.manufacturer, model: opt.model, vendorName: opt.vendor,
    phaseId: o.added.phaseId, priced: true, note: 'Added by the planner from the catalogue',
  };
}

/* ================================================================== the change against the proposal */
export interface LineState { qty: number; unit: string; model?: string; unitCost: number; total: number; leadWeeks?: number; vendor?: string; source?: T.PlannerMaterialSource }
export interface MaterialChange {
  key: string; item: string; kind: ItemKind; category: string; what: ('quantity' | 'model' | 'vendor' | 'source' | 'removed' | 'added')[];
  before?: LineState; after?: LineState; deltaUsd: number; override: T.PlannerMaterialOverride;
}
export interface MaterialsEffect { proposalTotal: number; total: number; delta: number; changes: MaterialChange[]; stale: T.PlannerMaterialOverride[]; warnings: string[] }
const state = (l: BomItem): LineState => ({ qty: l.qty, unit: l.unit, model: l.model, unitCost: l.unitCost, total: l.monthly ? 0 : l.total, leadWeeks: l.leadWeeks, vendor: l.vendorName, source: l.forceSource });
/** The bill against the proposal, one row per override that applies. */
export function compareBoms(proposal: Bom, bom: Bom, overrides: T.PlannerMaterialOverride[] | undefined, stale: T.PlannerMaterialOverride[] = [], warnings: string[] = []): MaterialsEffect {
  const prop = new Map(proposal.lines.map(l => [l.key ?? l.id, l])); const cur = new Map(bom.lines.map(l => [l.key ?? l.id, l]));
  const changes: MaterialChange[] = [];
  for (const o of overrides ?? []) {
    if (stale.includes(o)) continue;
    const b = prop.get(o.key); const a = cur.get(o.key);
    const what: MaterialChange['what'] = [];
    if (o.added && !o.removed) what.push('added');
    else if (o.removed) what.push('removed');
    else if (a?.applied) { if (a.applied.model) what.push('model'); if (a.applied.qty || (a.perRack && b && a.qty !== b.qty)) what.push('quantity'); if (a.applied.vendor) what.push('vendor'); if (a.applied.source) what.push('source'); }
    if (!what.length) continue;
    const ref = a ?? b;
    changes.push({ key: o.key, item: ref?.item ?? o.item, kind: (ref?.kind ?? o.kind) as ItemKind, category: ref?.category ?? o.added?.category ?? '', what, before: b ? state(b) : undefined, after: a ? state(a) : undefined, deltaUsd: (a && !a.monthly ? a.total : 0) - (b && !b.monthly ? b.total : 0), override: o });
  }
  return { proposalTotal: proposal.total, total: bom.total, delta: bom.total - proposal.total, changes, stale, warnings };
}

/* ================================================================== estimate and schedule */
/** The estimate line that carries the planner's bill changes (the reconciliation knows the bill already holds it). */
export const MATERIAL_CHANGES_ITEM = 'Bill of materials changes';
export function materialsEstimateLine(fx: MaterialsEffect): { category: string; item: string; amount: number; basis: string; source: T.PlannerParamSource } {
  const parts = fx.changes.slice(0, 3).map(c => `${c.item} ${c.what.join(' and ')}`);
  return { category: 'CapEx', item: MATERIAL_CHANGES_ITEM, amount: r0(fx.delta), basis: `${fx.changes.length} line${fx.changes.length === 1 ? '' : 's'} changed against the planner's proposal on the Materials tab${parts.length ? `: ${parts.join('; ')}${fx.changes.length > 3 ? '…' : ''}` : ''}`, source: 'user' };
}

/** Weeks before go-live an item is needed on site (installation and commissioning time); sourcing uses the same table. */
export const NEED_WEEKS: Partial<Record<ItemKind, number>> = { 'hv-transformer': 30, transformer: 30, switchgear: 24, generator: 26, ups: 20, chiller: 20, 'dry-cooler': 20, cdu: 14, crah: 14, fanwall: 14, inrow: 14, reardoor: 14, pdu: 12, rack: 10, containment: 10, leaf: 10, spine: 10, core: 10, optics: 8, fibre: 8, dac: 6, 'gpu-server': 4, server: 4, storage: 4 };

/** The order schedule with the planner's bill changes laid over it. A schedule line orders the bill lines with its lead-time benchmark
 *  (`leadItem`; family schedules name the line after it) in its phase: when all of them were removed it goes, a vendor's lead time moves
 *  its order-by date (the slowest line governs), "buy" turns a stock transfer back into an order, a swapped model renames it, and a line
 *  added with a lead time no schedule line carries gets its own order line. */
export function scheduleWithMaterials(items: ScheduleItem[], plan: T.PlannerPlan, proposal: Bom, bom: Bom, lead: (leadItem: string) => { leadWeeks: number; bufferWeeks: number }, stockOf: (model: string) => number = () => 0): ScheduleItem[] {
  const now = clockMs();
  const groupOf = (it: ScheduleItem) => it.leadItem ?? it.item;
  const linesFor = (b: Bom, it: ScheduleItem) => b.lines.filter(l => l.leadItem === groupOf(it) && (!l.phaseId || !it.phaseId || l.phaseId === it.phaseId));
  const out: ScheduleItem[] = [];
  for (const it of items) {
    if (it.kind !== 'equipment') { out.push(it); continue; }
    const before = linesFor(proposal, it);
    if (!before.length) { out.push(it); continue; }
    const lines = linesFor(bom, it);
    if (!lines.length) continue;
    const changed = lines.filter(l => l.applied && !l.applied.added);
    if (!changed.length) { out.push(it); continue; }
    let next: ScheduleItem = { ...it };
    const notes: string[] = [];
    for (const sw of changed.filter(l => l.applied?.model && l.model)) {
      const old = before.find(p => p.key === sw.key)?.model;
      if (old && next.item.includes(old)) next.item = next.item.split(old).join(sw.model!);
      notes.push(`${sw.item.toLowerCase()} now ${sw.model}`);
    }
    // a swapped model the stock does not hold has to be bought, as does a line the planner asked to buy
    const swappedShort = (next.source === 'stock' || next.source === 'mixed') && changed.some(l => l.applied?.model && l.model && stockOf(l.model) < l.qty);
    const buyAll = lines.every(l => l.forceSource === 'buy') || swappedShort;
    // a vendor's lead time counts only for what is bought (a stock transfer keeps its own)
    const delta = next.source === 'stock' && !buyAll ? 0 : Math.max(...lines.map(l => l.leadDelta ?? 0));
    if (delta !== 0 || (buyAll && next.source !== 'procure')) {
      // stock was a transfer only: buying takes the lines' own lead time (vendor difference included); else the vendor moves the lead
      const fromStock = buyAll && next.source === 'stock';
      const leadWeeks = Math.max(1, fromStock ? Math.max(...lines.map(l => l.leadWeeks ?? lead(groupOf(it)).leadWeeks)) : next.leadWeeks + delta);
      const buffer = fromStock ? lead(groupOf(it)).bufferWeeks : next.bufferWeeks ?? 0;
      const orderBy = new Date(new Date(next.needBy).getTime() - (leadWeeks + buffer) * WEEK).toISOString();
      if (buyAll && next.source !== 'procure') { next.source = 'procure'; next.note = `${leadWeeks} weeks${buffer ? ` + ${buffer} weeks buffer` : ''}`; notes.push(swappedShort ? 'the new model is not in stock, so it is bought' : 'bought, not taken from stock'); }
      if (delta) { const v = lines.find(l => l.leadDelta === delta)?.chosenVendor; notes.push(`${v ?? 'vendor'} ${delta > 0 ? `+${delta}` : `−${-delta}`} weeks`); }
      next = { ...next, leadWeeks, bufferWeeks: buffer, orderBy };
      if (next.status === 'to order' || next.status === 'late' || next.status === 'stock' || !next.status) { next.late = new Date(orderBy).getTime() < now; next.status = next.late ? 'late' : 'to order'; }
    }
    if (changed.some(l => l.forceSource === 'stock') && next.source !== 'stock') notes.push('stock asked for');
    if (notes.length) next.note = `${next.note ? `${next.note}; ` : ''}planner's change: ${notes.join(', ')}`;
    out.push(next);
  }
  // Added lines whose lead time no schedule line orders.
  const phases = datedPhases(plan);
  for (const l of bom.lines.filter(x => x.applied?.added && x.leadItem)) {
    const ph = phases.find(p => p.id === l.phaseId) ?? phases[0]; if (!ph) continue;
    if (out.some(it => it.kind === 'equipment' && groupOf(it) === l.leadItem && (!it.phaseId || it.phaseId === ph.id))) continue;
    const lt = lead(l.leadItem!); const leadWeeks = l.leadWeeks ?? lt.leadWeeks;
    const needBy = new Date(ph.goLive).getTime() - (NEED_WEEKS[l.kind] ?? 8) * WEEK;
    const orderBy = needBy - (leadWeeks + lt.bufferWeeks) * WEEK;
    const late = orderBy < now;
    out.push({ item: `${l.item}${l.model ? ` (${l.model})` : ''}`, leadItem: l.leadItem, leadWeeks, bufferWeeks: lt.bufferWeeks, needBy: new Date(needBy).toISOString(), orderBy: new Date(orderBy).toISOString(), late, phase: ph.name, phaseId: ph.id, kind: 'equipment', source: 'procure', status: late ? 'late' : 'to order', note: `added by the planner: ${leadWeeks} weeks${lt.bufferWeeks ? ` + ${lt.bufferWeeks} weeks buffer` : ''}` });
  }
  return out.sort((a, b) => a.orderBy.localeCompare(b.orderBy));
}

/* ================================================================== editing helpers (UI) */
/** The override for a line after an edit; undefined when the edit brings the line back to the proposal. */
export function normaliseOverride(o: T.PlannerMaterialOverride, proposal?: BomItem): T.PlannerMaterialOverride | undefined {
  if (o.added) return o.removed ? undefined : o;
  if (o.removed) return { key: o.key, kind: o.kind, item: o.item, removed: true, reason: o.reason, by: o.by, at: o.at };
  const n: T.PlannerMaterialOverride = { key: o.key, kind: o.kind, item: o.item, reason: o.reason, by: o.by, at: o.at };
  if (o.model && o.model !== proposal?.model) n.model = o.model;
  if (o.qty !== undefined && (o.qty !== proposal?.qty || n.model)) n.qty = o.qty;
  if (o.vendor && o.vendor !== proposal?.vendorName) n.vendor = o.vendor;
  if (o.source && o.source !== 'auto') n.source = o.source;
  return n.model || n.qty !== undefined || n.vendor || n.source ? n : undefined;
}
/** Replace (or drop) one override in a list. */
export function setOverride(list: T.PlannerMaterialOverride[], key: string, next: T.PlannerMaterialOverride | undefined): T.PlannerMaterialOverride[] {
  const rest = list.filter(o => o.key !== key);
  return next ? [...rest, next] : rest;
}
/** Next key for a line added from the catalogue. */
export const nextAddKey = (list: T.PlannerMaterialOverride[]) => `ADD-${list.reduce((m, o) => { const x = /^ADD-(\d+)$/.exec(o.key); return x ? Math.max(m, Number(x[1])) : m; }, 0) + 1}`;
/** One short sentence for the audit or revision note, e.g. "Materials: 2 lines changed, 1 added (+$1.2M)". */
export function changeSentence(changes: MaterialChange[], fmt: (n: number) => string): string {
  const added = changes.filter(c => c.what.includes('added')).length, removed = changes.filter(c => c.what.includes('removed')).length, changed = changes.length - added - removed;
  const delta = changes.reduce((a, c) => a + c.deltaUsd, 0);
  const parts = [changed && `${changed} line${changed === 1 ? '' : 's'} changed`, added && `${added} added`, removed && `${removed} removed`].filter(Boolean);
  return `Materials: ${parts.join(', ') || 'back to the proposal'}${delta ? ` (${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))})` : ''}`;
}
