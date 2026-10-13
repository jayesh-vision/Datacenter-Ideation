/* Plan pack view model: what applies to this plan type, the artefact strip, drawing sheets, export helpers. No components here. */
import type * as T from '../p2b/types';
import { fmtUsd, type Evaluation } from './engine';
import { buildBasisOfDesign, buildBom, buildInitiation, buildIpPlan, toCsv, type Bom, type BodSection, type Initiation, type IpPlan } from './outputs';
import { sourceBom, type SourceKind, type SourcedBom, type SourcingContext, type VendorOrder } from './sourcing';

export type PackSection = 'document' | 'bom' | 'ip' | 'drawings' | 'initiation';
export const PACK_SECTIONS: { value: PackSection; label: string }[] = [
  { value: 'document', label: 'Plan document' },
  { value: 'bom', label: 'Bill of materials' },
  { value: 'ip', label: 'IP and network plan' },
  { value: 'drawings', label: 'Drawings' },
  { value: 'initiation', label: 'Build initiation' },
];

export const VEHICLE_LABEL: Record<Initiation['vehicle'], string> = { programme: 'Programme', project: 'Project', change: 'Change request', portfolio: 'Portfolio' };

/** Aspects the plan type covers (anything not skipped). With no template every aspect counts as covered. */
export function covers(template: T.PlannerTemplate | undefined, aspect: T.PlannerAspect): boolean {
  if (!template) return true;
  return template.requiredAspects.some(a => a.aspect === aspect && a.depth !== 'skipped');
}

import { REPLACE_SCOPES } from './outputs';
const BUILDING_SCOPES: T.PlannerScope[] = ['new-dc', 'expansion', 'portfolio'];

/** Which parts of the pack apply to this plan type. */
export function packApplicability(plan: T.PlannerPlan, ev: Evaluation, template: T.PlannerTemplate | undefined) {
  const s = ev.sizing;
  // Replacement plans keep the existing addresses, fabric and plant; they produce an old-to-new list instead.
  const replace = REPLACE_SCOPES.includes(plan.scope);
  const network = !replace && covers(template, 'network') && (s.network.leaves + s.network.spines + s.network.cores > 0 || plan.scope === 'network');
  return {
    ip: network,
    building: BUILDING_SCOPES.includes(plan.scope) && s.halls > 0,
    hall: !replace && covers(template, 'space') && s.racks > 0 && plan.scope !== 'network' && plan.scope !== 'migration',
    singleLine: !replace && covers(template, 'power') && s.plant.length > 0,
    topology: network,
    phasing: ev.ladder.length > 0,
    leadTimes: ev.schedule.length > 0,
  };
}
export type PackApplicability = ReturnType<typeof packApplicability>;

/* ------------------------------------------------------------------ drawings */
export type SheetKind = 'building' | 'hall' | 'single-line' | 'topology' | 'phasing' | 'lead-times';
export interface DrawingSheet { kind: SheetKind; number: string; title: string }

export function drawingSheets(plan: T.PlannerPlan, applies: PackApplicability): DrawingSheet[] {
  const list: { kind: SheetKind; disc: 'A' | 'E' | 'N' | 'G'; title: string; on: boolean }[] = [
    { kind: 'building', disc: 'A', title: 'Building and floor plan', on: applies.building },
    { kind: 'hall', disc: 'A', title: 'Typical data hall layout', on: applies.hall },
    { kind: 'single-line', disc: 'E', title: 'Electrical single-line', on: applies.singleLine },
    { kind: 'topology', disc: 'N', title: 'Network topology', on: applies.topology },
    { kind: 'phasing', disc: 'G', title: 'Phasing', on: applies.phasing },
    { kind: 'lead-times', disc: 'G', title: 'Lead times', on: applies.leadTimes },
  ];
  const seq: Record<string, number> = {};
  return list.filter(d => d.on).map(d => {
    seq[d.disc] = (seq[d.disc] ?? 0) + 1;
    return { kind: d.kind, title: d.title, number: `${plan.plnId}-${d.disc}-${String(seq[d.disc]).padStart(3, '0')}` };
  });
}

/* ------------------------------------------------------------------ sourcing */
/** Sourcing needs the catalogue models, vendors and stock loaded; until then the pack shows the plain bill of materials. */
export function sourcingReady(ctx: SourcingContext | undefined): ctx is SourcingContext {
  return !!ctx && ctx.vendors.length > 0 && ctx.assetModels.length > 0 && ctx.devices.length > 0;
}

/** Devices this plan already reserved count as available to it again, so an executed plan shows the same split. */
function contextForPlan(plan: T.PlannerPlan, ctx: SourcingContext): SourcingContext {
  const mine = new Set(plan.artefacts?.reservedDeviceIds ?? []);
  const tag = `Reserved for ${plan.plnId}`;
  if (!mine.size && !ctx.devices.some(d => String(d.notes ?? '').startsWith(tag))) return ctx;
  return { ...ctx, devices: ctx.devices.map(d => (mine.has(d.id) || String(d.notes ?? '').startsWith(tag) ? { ...d, notes: '' } : d)) };
}

export const SOURCE_LABEL: Record<SourceKind, string> = { site: 'From spare capacity at the site', stock: 'From stock', procure: 'To buy' };
export const SOURCE_SHORT: Record<SourceKind, string> = { site: 'Site', stock: 'Stock', procure: 'Buy' };

export interface SourcingSplit { source: SourceKind; value: number; lines: number }
/** Value and number of lines per source (a line split across sources counts in each). */
export function sourcingSplit(s: SourcedBom): SourcingSplit[] {
  return [
    { source: 'site', value: s.siteValue, lines: s.lines.filter(l => l.fromSite > 0).length },
    { source: 'stock', value: s.stockValue, lines: s.lines.filter(l => l.fromStock > 0).length },
    { source: 'procure', value: s.buyTotal, lines: s.lines.filter(l => l.toBuy > 0).length },
  ];
}
/** Purchase orders execution raises: one per vendor with something to pay for. */
export const vendorOrders = (s: SourcedBom): VendorOrder[] => s.vendors.filter(v => v.value > 0);
export const avoidedCost = (s: SourcedBom) => s.lines.reduce((a, l) => a + l.avoidedCost, 0);

/** Bill-of-materials view of the sourced lines (models and prices resolved), with category totals. */
export function sourcedAsBom(bom: Bom, s: SourcedBom): Bom {
  const cats = new Map<Bom['byCategory'][number]['category'], { total: number; lines: number }>();
  const bought = s.lines.filter(l => !l.monthly);
  for (const l of bought) { const c = cats.get(l.category) ?? { total: 0, lines: 0 }; c.total += l.total; c.lines += 1; cats.set(l.category, c); }
  // Monthly service charges (circuits) are not bought, so they stay out of the total.
  return { ...bom, lines: s.lines, total: bought.reduce((a, l) => a + l.total, 0), byCategory: [...cats.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.total - a.total) };
}

/** One line for the review step, e.g. "4 lines from stock ($2.3M), 14 to buy from 5 vendors ($5.3M)". */
export function sourcingSentence(s: SourcedBom): string {
  const [site, stock, buy] = sourcingSplit(s);
  const n = vendorOrders(s).length;
  const parts = [
    site.lines ? `${site.lines} from spare site capacity` : '',
    stock.lines ? `${stock.lines} from stock (${fmtUsd(stock.value)})` : '',
    buy.lines ? `${buy.lines} to buy from ${n} vendor${n === 1 ? '' : 's'} (${fmtUsd(buy.value)})` : '',
  ].filter(Boolean);
  return parts.length ? `Of ${s.lines.length} lines: ${parts.join(', ')}` : 'nothing to source';
}

/** Contract shown against a vendor: its contract reference or "no contract". */
export function contractByVendor(s: SourcedBom): Map<string, string> {
  return new Map(s.vendors.map(v => [v.vendorName, v.contractId ? v.contractLabel : 'no contract']));
}

/** Bill of materials with the sourcing split, as CSV. */
export function sourcedBomCsv(s: SourcedBom): string {
  const contract = contractByVendor(s);
  return toCsv([
    ['Line', 'Category', 'Item', 'Model', 'Specification', 'Quantity', 'Unit', 'From site', 'From stock', 'To buy', 'Unit cost USD', 'Total USD', 'Buy cost USD', 'Avoided cost USD', 'Vendor', 'Contract', 'Lead weeks', 'Part number', 'Manufacturer', 'Sourcing notes'],
    ...s.lines.map((l, i) => {
      const buy = l.allocations.find(a => a.source === 'procure');
      return [i + 1, l.category, l.item, l.model, l.spec, l.qty, l.unit, l.fromSite, l.fromStock, l.toBuy, l.unitCost, l.total, l.buyCost, l.avoidedCost, buy?.vendorName ?? '', buy ? contract.get(buy.vendorName ?? '') ?? 'no contract' : '', l.leadWeeks, l.partNumber, l.manufacturer, l.allocations.map(a => `${SOURCE_SHORT[a.source]} ${a.qty}: ${a.note}`).join('; ')];
    }),
  ]);
}

/* ------------------------------------------------------------------ whole pack */
export interface PlanPackData { bom: Bom; ip: IpPlan; bod: BodSection[]; init: Initiation; applies: PackApplicability; sheets: DrawingSheet[]; sourced?: SourcedBom }

export function buildPack(plan: T.PlannerPlan, ev: Evaluation, template: T.PlannerTemplate | undefined, benchmarks: T.PlannerBenchmark[], siteName: string, sourcing?: SourcingContext): PlanPackData {
  const bom = buildBom(plan, ev, benchmarks);
  const applies = packApplicability(plan, ev, template);
  const sourced = sourcingReady(sourcing) && bom.lines.length ? sourceBom(plan, ev, bom, contextForPlan(plan, sourcing)) : undefined;
  return { bom, ip: buildIpPlan(plan, ev), bod: buildBasisOfDesign(plan, ev, template, siteName), init: buildInitiation(plan, ev, template, bom), applies, sheets: drawingSheets(plan, applies), sourced };
}

/** One-line summary per output, for the wizard review step. */
export function packSummary(pack: PlanPackData): { label: string; detail: string; applies: boolean }[] {
  const { bom, ip, bod, init, applies, sheets, sourced } = pack;
  const orders = sourced ? vendorOrders(sourced).length : init.orders.length;
  const bomTotal = sourced?.total ?? bom.total;
  return [
    { label: 'Plan document', detail: `${bod.length} section${bod.length === 1 ? '' : 's'}`, applies: true },
    { label: 'Bill of materials', detail: bom.lines.length ? `${bom.lines.length} lines, ${fmtUsd(bomTotal)}` : 'no items for this plan', applies: bom.lines.length > 0 },
    ...(sourced ? [{ label: 'Sourcing', detail: sourcingSentence(sourced), applies: true }] : []),
    { label: 'IP and network plan', detail: applies.ip && ip.items.length ? `${ip.items.length} prefixes in ${ip.aggregate}, ${ip.vlans.length} VLANs` : applies.ip ? ip.aggregate : 'not part of this plan type', applies: applies.ip && ip.items.length > 0 },
    { label: 'Drawings', detail: `${sheets.length} sheet${sheets.length === 1 ? '' : 's'}`, applies: sheets.length > 0 },
    { label: 'Build initiation', detail: [VEHICLE_LABEL[init.vehicle], init.projects.length ? `${init.projects.length} project${init.projects.length === 1 ? '' : 's'}` : '', init.childPlans ? `${init.childPlans.length} child plan${init.childPlans.length === 1 ? '' : 's'}` : `${orders} purchase order${orders === 1 ? '' : 's'}`, init.atps?.length ? `${init.atps.length} acceptance tests` : ''].filter(Boolean).join(' · '), applies: true },
  ];
}

/* ------------------------------------------------------------------ manifest */
/** Which pack section carries each output the plan template lists (its `outputs` manifest). */
const OUTPUT_SECTION: [RegExp, string][] = [
  [/candidate|feasib|site list|power variant|campus intake|shared plant|demand curve|allocation|gap list|interconnect demand/i, 'site-plan'],
  [/commissioning|acceptance|test plan|child plans/i, 'commissioning'],
  [/bill of materials|budget/i, 'bom'],
  [/\bIP\b|network plan/i, 'ip'],
  [/programme|schedule|work orders|permits per site|change request/i, 'initiation'],
  [/drawing|layout/i, 'drawings'],
  [/basis of design|business case|capacity plan|risk|permit register|placement note|runbook/i, 'document'],
];
export interface ManifestLine { output: string; section?: string; sectionLabel?: string; family: boolean }
/** The template's pack manifest, each output with the section that holds it (or none yet). Families add sections. */
export function packManifest(template: T.PlannerTemplate | undefined, extra: { key: string; label: string }[]): ManifestLine[] {
  const builtIn = new Map<string, string>(PACK_SECTIONS.map(x => [x.value, x.label]));
  const fam = new Map(extra.map(x => [x.key, x.label]));
  return (template?.outputs ?? []).map(output => {
    const key = OUTPUT_SECTION.find(([re]) => re.test(output))?.[1];
    const label = key ? fam.get(key) ?? builtIn.get(key) : undefined;
    return { output, section: label ? key : undefined, sectionLabel: label, family: !!key && fam.has(key) };
  });
}

/* ------------------------------------------------------------------ artefact strip */
export type ArtefactStatus = 'ready' | 'approved' | 'created' | 'none' | 'na';
export interface ArtefactLine { key: string; label: string; detail: string; status: ArtefactStatus; links: { label: string; to: string }[] }

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** What execution creates, with its state: ready before approval, created (with record links) after execution. */
export function artefactLines(plan: T.PlannerPlan, pack: PlanPackData): ArtefactLine[] {
  const a = plan.artefacts;
  // Plans executed before the pack existed have no artefact record: show those lines as not created.
  const pre: ArtefactStatus = plan.status === 'Approved' ? 'approved' : plan.status === 'Executing' || plan.status === 'Completed' ? 'none' : 'ready';
  const { bom, ip, init, applies, sourced } = pack;
  const ids = (list: string[] | undefined, to: string, what: string) => (list && list.length ? { status: 'created' as const, links: [{ label: list.length === 1 ? list[0] : `${plural(list.length, what)}`, to }] } : { status: (a ? 'none' : pre) as ArtefactStatus, links: [] });

  const programId = a?.programId ?? plan.programId;
  const instanceId = a?.processInstanceId ?? plan.processInstanceId;
  const vehicleLine: ArtefactLine = init.vehicle === 'change'
    ? { key: 'vehicle', label: 'Change request', detail: init.change ? `${init.change.title}` : init.name, ...(a?.changeRequestId ? { status: 'created', links: [{ label: a.changeRequestId, to: `/changes?id=${encodeURIComponent(a.changeRequestId)}` }] } : { status: a ? 'none' : pre, links: [] }) }
    : { key: 'vehicle', label: VEHICLE_LABEL[init.vehicle], detail: `${init.vehicle === 'project' && init.projects[0]?.template ? `${init.projects[0].template} template · ` : init.blueprintName ? `${init.blueprintName} blueprint · ` : ''}${plural(init.projects.length, 'project')} · ${fmtUsd(init.budget)}`, ...(programId ? { status: 'created', links: [{ label: programId, to: `/delivery/programs/${programId}` }] } : { status: a ? 'none' : pre, links: [] }) };

  const ipLine: ArtefactLine = applies.ip && !ip.items.length
    ? { key: 'ip', label: 'Subnets and VLANs', detail: ip.aggregate, status: 'na', links: [] }
    : applies.ip
    ? (() => {
      const created = (a?.subnetIds.length ?? 0) + (a?.vlanIds.length ?? 0) > 0;
      return { key: 'ip', label: 'Subnets and VLANs', detail: `${plural(ip.items.length, 'prefix', 'prefixes')} in ${ip.aggregate} · ${plural(ip.vlans.length, 'VLAN')}`, status: created ? 'created' : a ? 'none' : pre, links: created ? [{ label: `${plural(a!.subnetIds.length, 'subnet')}, ${plural(a!.vlanIds.length, 'VLAN')}`, to: '/ipam/subnets' }] : [] };
    })()
    : { key: 'ip', label: 'Subnets and VLANs', detail: 'Not part of this plan type', status: 'na', links: [] };

  const poLine: ArtefactLine = sourced
    ? (() => {
      const orders = vendorOrders(sourced);
      return { key: 'po', label: 'Purchase orders', detail: orders.length ? `${plural(orders.length, 'vendor order')} · ${fmtUsd(orders.reduce((s, o) => s + o.value, 0))}${orders.some(o => !o.contractId) ? ` · ${orders.filter(o => !o.contractId).length} without contract` : ''}` : 'Nothing to buy', ...(orders.length || a?.purchaseOrderIds.length ? ids(a?.purchaseOrderIds, '/procurement', 'purchase order') : { status: 'na' as const, links: [] }) };
    })()
    : { key: 'po', label: 'Long-lead purchase orders', detail: init.orders.length ? `${plural(init.orders.length, 'order')} · ${fmtUsd(init.orders.reduce((s, o) => s + o.value, 0))}` : 'No long-lead items', ...(init.orders.length || a?.purchaseOrderIds.length ? ids(a?.purchaseOrderIds, '/procurement', 'purchase order') : { status: 'na' as const, links: [] }) };

  // Stock and rack positions: what sourcing would take before execution, what was reserved after.
  const stockIds = a?.reservedDeviceIds ?? [];
  const stockPlanned = sourced?.stockDeviceIds.length ?? 0;
  const rackIds = a?.reservedRackIds ?? [];
  const rackPlanned = sourced?.siteRackIds.length ?? 0;
  const reservedLines: ArtefactLine[] = [];
  if (sourced || stockIds.length) {
    const n = a ? stockIds.length : stockPlanned;
    reservedLines.push({
      key: 'stock', label: 'Stock reserved',
      detail: n ? `${plural(n, 'device')}${sourced ? ` · ${fmtUsd(sourced.stockValue)}` : ''}` : 'Nothing in stock matches',
      ...(stockIds.length ? { status: 'created' as const, links: [{ label: stockIds.length === 1 ? stockIds[0] : plural(stockIds.length, 'device'), to: stockIds.length === 1 ? `/facility/devices/${stockIds[0]}` : '/facility/devices' }] } : { status: (n ? (a ? 'none' : pre) : 'na') as ArtefactStatus, links: [] }),
    });
  }
  if (rackIds.length || rackPlanned) {
    const n = a ? rackIds.length : rackPlanned;
    reservedLines.push({
      key: 'racks', label: 'Rack positions reserved', detail: plural(n, 'position'),
      ...(rackIds.length ? { status: 'created' as const, links: [{ label: rackIds.length === 1 ? rackIds[0] : plural(rackIds.length, 'rack'), to: rackIds.length === 1 ? `/facility/racks/${rackIds[0]}` : '/facility/racks' }] } : { status: (a ? 'none' : pre) as ArtefactStatus, links: [] }),
    });
  }

  // Records the build family creates: the site itself, acceptance tests, site work orders, child plans.
  const extraLines: ArtefactLine[] = [];
  if (plan.scope === 'new-dc' || (plan.scope === 'expansion' && !plan.dataCenterId) || a?.createdSite) {
    const cs = a?.createdSite;
    extraLines.push({ key: 'site', label: 'Site records', detail: cs ? `${cs.dataCenterId ? 'Data centre, ' : ''}${plural(cs.buildingIds?.length ?? 0, 'building')}, ${plural(cs.hallIds?.length ?? 0, 'hall')} (Planned)` : `${plan.scope === 'new-dc' ? 'Data centre, one building per phase' : 'Building on the campus'}, halls per phase, all Planned`, ...(cs?.dataCenterId ? { status: 'created' as const, links: [{ label: cs.dataCenterId, to: `/facility/dc/${cs.dataCenterId}` }] } : cs ? { status: 'created' as const, links: [] } : { status: (a ? 'none' : pre) as ArtefactStatus, links: [] }) });
  }
  if (init.atps?.length) extraLines.push({ key: 'atps', label: 'Acceptance tests', detail: `${plural(init.atps.length, 'test')} with their steps`, ...ids(a?.atpIds, '/commissioning', 'test') });
  if (init.workOrders?.length) extraLines.push({ key: 'site-wo', label: 'Site work orders', detail: plural(init.workOrders.length, 'work order'), ...(a?.workOrderIds?.length ? { status: 'created' as const, links: [{ label: plural(a.workOrderIds.length, 'work order'), to: '/workorders' }] } : { status: (a ? 'none' : pre) as ArtefactStatus, links: [] }) });
  if (init.vehicle === 'portfolio') extraLines.push({ key: 'children', label: 'Child plans', detail: init.childPlans?.length ? plural(init.childPlans.length, 'child plan') : 'No allocation yet', ...(a?.childPlanIds?.length ? { status: 'created' as const, links: a.childPlanIds.slice(0, 4).map(id => ({ label: id, to: `/planning/plans/${id}` })) } : { status: (init.childPlans?.length ? (a ? 'none' : pre) : 'na') as ArtefactStatus, links: [] }) });

  return [
    ...extraLines,
    { key: 'bom', label: 'Bill of materials', detail: `${plural(bom.lines.length, 'line')} · ${fmtUsd(sourced?.total ?? bom.total)}`, ...(a?.bomId ? { status: 'created', links: [{ label: a.bomId, to: '/procurement' }] } : { status: a ? 'none' : bom.lines.length ? pre : 'na', links: [] }) },
    poLine,
    ...reservedLines,
    ipLine,
    { key: 'permits', label: 'Permits to file', detail: init.permits.length ? plural(init.permits.length, 'permit') : 'No permits listed', ...(init.permits.length || a?.permitIds.length ? ids(a?.permitIds, '/delivery/permits', 'permit') : { status: 'na' as const, links: [] }) },
    { key: 'docs', label: 'Design documents', detail: init.designDocs.map(d => d.name).join(', '), ...ids(a?.designDocIds, '/delivery/design', 'document') },
    ...(init.vehicle === 'portfolio' ? [] : [vehicleLine]),
    { key: 'wo', label: 'Work order', detail: init.workOrder.process, ...(instanceId ? { status: 'created', links: [{ label: instanceId, to: `/workorders/instances/${instanceId}` }] } : { status: a ? 'none' : pre, links: [] }) },
  ];
}

/* ------------------------------------------------------------------ export helpers */
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Print only the `.plan-print-area` on screen (see print.css). */
export function printPlanArea(): void {
  const root = document.documentElement;
  root.classList.add('plan-printing');
  const done = () => { root.classList.remove('plan-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  // Safari returns from print() before the dialog closes and may not fire afterprint.
  setTimeout(done, 60000);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface DocHeader { title: string; planId: string; revision: string; status: string; date: string; owner: string; approvers: string[]; site: string; planType: string }

/** Standalone basis-of-design HTML for download (inline CSS, no app dependencies). */
export function bodHtml(h: DocHeader, sections: BodSection[]): string {
  const css = 'body{font-family:Poppins,Segoe UI,Arial,sans-serif;color:#0f172a;max-width:880px;margin:32px auto;padding:0 24px;font-size:13px;line-height:1.5}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px;padding-bottom:4px;border-bottom:1px solid #cbd5e1}table{width:100%;border-collapse:collapse}td{padding:4px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}td.l{width:38%;color:#475569}.src{font-size:11px;color:#64748b;margin-left:6px}.tb{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #94a3b8;margin:12px 0 8px}.tb div{padding:6px 8px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1}.tb span{display:block;font-size:10px;text-transform:uppercase;color:#64748b;letter-spacing:.4px}p{margin:0 0 8px}footer{margin-top:32px;font-size:11px;color:#64748b}';
  const cell = (k: string, v: string) => `<div><span>${esc(k)}</span>${esc(v)}</div>`;
  const tb = [cell('Plan', h.planId), cell('Revision', h.revision), cell('Status', h.status), cell('Date', h.date), cell('Owner', h.owner), cell('Site', h.site), cell('Plan type', h.planType), cell('Approvers', h.approvers.join(' → ') || '—')].join('');
  const body = sections.map(s => `<h2>${esc(s.title)}</h2>${s.text ? `<p>${esc(s.text)}</p>` : ''}${s.rows.length ? `<table>${s.rows.map(r => `<tr><td class="l">${esc(r.label)}</td><td>${esc(r.value)}${r.source ? `<span class="src">${esc(r.source)}</span>` : ''}</td></tr>`).join('')}</table>` : ''}`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(h.planId)} Basis of design</title><style>${css}</style></head><body><h1>${esc(h.title)}</h1><div>Basis of design</div><div class="tb">${tb}</div>${body}<footer>Generated from the planner on ${esc(h.date)}. Figures are indicative until the plan is approved.</footer></body></html>`;
}
