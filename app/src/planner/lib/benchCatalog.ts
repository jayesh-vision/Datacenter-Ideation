/* Benchmark catalogue: which reference values each Benchmarks tab holds, the measures a planner can add there, the unit each
   measure is read in and the "applies to" fields the engine actually matches it on. One value per measure and case: the planner looks
   values up by exact case (engine.ts bmFind and the direct finds), so two active values for the same case would make the answer depend
   on list order — saveBenchmark refuses that. Retired values stay in the library but are never read. */
import type * as T from '../p2b/types';
import { METRIC_INFO, metricDetail, metricKey } from './labels';
import { evaluate, type EstateActuals, type Evaluation } from './engine';
import type { PlannerData } from './plannerData';
import { OPEN_PLAN_STATUSES } from './ruleCatalog';

export type BenchView = 'cost' | 'efficiency' | 'lead' | 'sizing';
export type BenchDim = keyof T.PlannerBenchmark['appliesTo'];

/** Tab → the categories it holds (also the category a new value gets). */
export const VIEW_CATEGORIES: Record<BenchView, T.PlannerBenchmark['category'][]> = {
  cost: ['cost'], efficiency: ['performance', 'sustainability'], lead: ['leadtime'], sizing: ['sizing', 'staffing'],
};
export const VIEW_ADD: Record<BenchView, { button: string; title: string; sub: string; empty: string }> = {
  cost: { button: 'Add cost value', title: 'Add a cost value', sub: 'A price or cost rate the CapEx and OpEx estimates read.', empty: 'Add the first cost value' },
  efficiency: { button: 'Add efficiency value', title: 'Add an efficiency value', sub: 'PUE for a cooling choice in a climate, or a water / carbon factor.', empty: 'Add the first efficiency value' },
  lead: { button: 'Add lead time', title: 'Add a lead time', sub: 'Equipment lead time, build duration or a logistics / migration timing the schedule reads.', empty: 'Add the first lead time' },
  sizing: { button: 'Add sizing value', title: 'Add a sizing or staffing value', sub: 'A rule of thumb that turns IT load into space, plant margins and people.', empty: 'Add the first sizing value' },
};
export const viewOf = (b: Pick<T.PlannerBenchmark, 'category'>): BenchView => (Object.keys(VIEW_CATEGORIES) as BenchView[]).find(v => VIEW_CATEGORIES[v].includes(b.category)) ?? 'sizing';

/** The "applies to" fields the engine matches each measure on (exact match), and whether a value must name them. */
export const MEASURE_DIMS: Record<string, { dims: BenchDim[]; required?: boolean; note: string }> = {
  capexPerKw: { dims: ['dcTypeKey'], required: true, note: 'Read for plans of this site type.' },
  itCapexPerRack: { dims: ['dcTypeKey'], note: 'Read for plans of this site type; a value with no site type is the default for every other type.' },
  pue: { dims: ['coolingType', 'climate'], required: true, note: 'Read for plans with this cooling at a site in this climate.' },
  staffPerMw: { dims: ['tier'], required: true, note: 'Read for plans of this tier.' },
  tariff: { dims: ['regionId'], required: true, note: 'Read for plans in this region.' },
  designDryBulbC: { dims: ['climate'], required: true, note: 'Read for sites in this climate.' },
  designWetBulbC: { dims: ['climate'], required: true, note: 'Read for sites in this climate.' },
  floorLoadingKgPerRack: { dims: ['coolingType'], note: 'Read for racks with this cooling; a value with no cooling is the default.' },
};
export const dimsOf = (metric: string) => MEASURE_DIMS[metricKey(metric)] ?? { dims: [] as BenchDim[], note: 'One value for every plan.' };

/** Families where a planner may add a new item: the schedule reads `leadWeeks:<item>` for any bill-of-materials line with that lead item. */
export const OPEN_FAMILIES: Record<string, { label: string; placeholder: string; note: string }> = {
  leadWeeks: { label: 'Equipment item', placeholder: 'e.g. Busway (1600 A)', note: 'Used when a plan\'s bill of materials has an item with this lead-time name.' },
};

export const activeBenchmarks = (all: T.PlannerBenchmark[]) => all.filter(b => !b.isDeleted && !b.retiredAt && b.pending?.kind !== 'new');
/** Who approves changes to confirmed values. */
export const BENCH_APPROVER_ROLE = 'Capacity Planner';
/** Fields whose change on a confirmed value needs approval. */
export const APPROVAL_FIELDS: (keyof T.PlannerBenchmark)[] = ['value', 'low', 'high', 'unit', 'appliesTo', 'source', 'sourceDate', 'indicative', 'label'];
/* compared as the user sees them: applies-to by its fields (not key order), the as-of date by day */
const norm = (k: keyof T.PlannerBenchmark, v: unknown) => (k === 'appliesTo' ? caseKey('', (v ?? {}) as T.PlannerBenchmark['appliesTo']) : k === 'sourceDate' ? String(v ?? '').slice(0, 10) : JSON.stringify(v ?? null));
export const changedFields = (a: Partial<T.PlannerBenchmark>, b: Partial<T.PlannerBenchmark>) => APPROVAL_FIELDS.filter(k => norm(k, a[k]) !== norm(k, b[k]));
/** A save needs approval when it changes a confirmed value or confirms one (new or indicative). */
export const needsApproval = (old: T.PlannerBenchmark | null | undefined, next: Partial<T.PlannerBenchmark>) =>
  !old ? next.indicative === false : changedFields(old, next).length > 0 && (!old.indicative || next.indicative === false);

/** One case of one measure: metric + the applies-to fields it names (empty fields dropped, sorted). */
export function caseKey(metric: string, appliesTo: T.PlannerBenchmark['appliesTo'] = {}) {
  return `${metric}|${Object.entries(appliesTo).filter(([, v]) => v).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(',')}`;
}
/** Another active value for the same measure and case (the one a save would collide with). */
export function duplicateOf(all: T.PlannerBenchmark[], b: Pick<T.PlannerBenchmark, 'metric' | 'appliesTo'> & { id?: string }) {
  const k = caseKey(b.metric, b.appliesTo);
  return activeBenchmarks(all).find(x => x.id !== b.id && caseKey(x.metric, x.appliesTo) === k);
}

/** The tab's main measure: listed first and preselected in its add form. */
const VIEW_MAIN: Record<BenchView, string> = { cost: 'capexPerKw', efficiency: 'pue', lead: 'leadWeeks', sizing: 'staffPerMw' };
export interface Measure { metric: string; family: string; name: string; familyName: string; unit: string; category: T.PlannerBenchmark['category']; use?: string }
/** The measures a tab offers: every measure the library already holds for its categories (one per full metric), grouped by family. */
export function measuresFor(view: BenchView, all: T.PlannerBenchmark[]): Measure[] {
  const out = new Map<string, Measure>();
  for (const b of all) {
    if (!VIEW_CATEGORIES[view].includes(b.category) || out.has(b.metric)) continue;
    const family = metricKey(b.metric), info = METRIC_INFO[b.metric] ?? METRIC_INFO[family];
    const detail = metricDetail(b.metric);
    const name = METRIC_INFO[b.metric]?.name ?? (detail ? b.label.replace(/^Lead time · /, '') : info?.name ?? b.label);
    out.set(b.metric, { metric: b.metric, family, name, familyName: METRIC_INFO[family]?.name ?? b.label, unit: b.unit, category: b.category, use: info?.use });
  }
  const lead = VIEW_MAIN[view];
  return [...out.values()].sort((a, b) => Number(b.family === lead) - Number(a.family === lead) || a.familyName.localeCompare(b.familyName) || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ effect of a value change on open plans */
export interface PlanFigures { capex: number; opexMonthly: number; late: number; hard: number; warn: number }
export interface BenchImpactRow { plan: T.PlannerPlan; before: PlanFigures; after: PlanFigures }
export const planFigures = (ev: Evaluation): PlanFigures => ({ capex: ev.estimate.capexTotal, opexMonthly: ev.estimate.opexMonthly, late: ev.schedule.filter(s => s.late).length, hard: ev.hardFails, warn: ev.softWarns });
/** Open plans (Draft / In review / Rejected / On hold) evaluated with today's values and with the changed set; only plans whose CapEx,
 *  OpEx, late items or rule results move are returned. Approved plans keep their baseline. */
export function benchImpact(plans: T.PlannerPlan[], templates: T.PlannerTemplate[], before: T.PlannerBenchmark[], after: T.PlannerBenchmark[], actualsOf: (p: T.PlannerPlan) => EstateActuals, data: PlannerData): { rows: BenchImpactRow[]; checked: number } {
  const open = plans.filter(p => OPEN_PLAN_STATUSES.includes(p.status) && !p.isDeleted);
  const rows: BenchImpactRow[] = [];
  for (const p of open) {
    const a = planFigures(evaluate(p, null, templates, before, actualsOf(p), data)), b = planFigures(evaluate(p, null, templates, after, actualsOf(p), data));
    if (JSON.stringify(a) !== JSON.stringify(b)) rows.push({ plan: p, before: a, after: b });
  }
  return { rows, checked: open.length };
}

/* ------------------------------------------------------------------ CSV export / import */
export const CSV_COLUMNS = ['id', 'measure', 'name', 'category', 'unit', 'site_type', 'tier', 'cooling', 'climate', 'region', 'low', 'typical', 'high', 'source', 'as_of', 'confidence', 'version', 'status'] as const;
const DIM_COL: Record<BenchDim, (typeof CSV_COLUMNS)[number]> = { dcTypeKey: 'site_type', tier: 'tier', coolingType: 'cooling', climate: 'climate', regionId: 'region' };
const esc = (v: unknown) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const benchStatus = (b: T.PlannerBenchmark) => (b.retiredAt ? 'retired' : b.pending ? 'awaiting approval' : 'active');
export function benchCsv(rows: T.PlannerBenchmark[]) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const b of rows) lines.push([b.id, b.metric, b.label, b.category, b.unit, b.appliesTo.dcTypeKey, b.appliesTo.tier, b.appliesTo.coolingType, b.appliesTo.climate, b.appliesTo.regionId, b.low, b.value, b.high, b.source, (b.sourceDate ?? '').slice(0, 10), b.indicative ? 'indicative' : 'confirmed', b.version ?? 1, benchStatus(b)].map(esc).join(','));
  return lines.join('\n');
}
/** RFC 4180-ish: quoted fields, doubled quotes, CR LF or LF. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cell = '', q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) out.push(row); row = []; } else cell += c;
  }
  row.push(cell); if (row.some(x => x.trim())) out.push(row);
  return out;
}
export type ImportKind = 'new' | 'changed' | 'unchanged' | 'rejected';
export interface ImportRow { line: number; kind: ImportKind; approval: boolean; message: string; target?: T.PlannerBenchmark; record?: T.PlannerBenchmark }
export interface Vocab { dcTypes: { key: string; name: string }[]; tiers: readonly string[]; cooling: Record<string, string>; climate: Record<string, string>; regions: { id: string; name: string }[] }
/** Dry run of a CSV against the library: every line becomes new / changed / unchanged / rejected with the reason. Nothing is saved. */
export function planImport(text: string, library: T.PlannerBenchmark[], view: BenchView, v: Vocab, now: string): { rows: ImportRow[]; error?: string } {
  const grid = parseCsv(text);
  if (!grid.length) return { rows: [], error: 'The file is empty.' };
  const head = grid[0].map(h => h.trim().toLowerCase());
  const miss = ['measure', 'source'].filter(c => !head.includes(c));
  if (miss.length) return { rows: [], error: `Missing column${miss.length > 1 ? 's' : ''}: ${miss.join(', ')}. Export the tab first to get the layout.` };
  const col = (r: string[], c: string) => (head.indexOf(c) >= 0 ? (r[head.indexOf(c)] ?? '').trim() : '');
  const measures = new Map(library.map(b => [b.metric, b]));
  const pick = (val: string, opts: { id: string; label: string }[]) => opts.find(o => o.id.toLowerCase() === val.toLowerCase() || o.label.toLowerCase() === val.toLowerCase())?.id;
  const dimOpts: Record<BenchDim, { id: string; label: string }[]> = {
    dcTypeKey: v.dcTypes.map(d => ({ id: d.key, label: d.name })), tier: v.tiers.map(t => ({ id: t, label: t })),
    coolingType: Object.entries(v.cooling).map(([id, label]) => ({ id, label })), climate: Object.entries(v.climate).map(([id, label]) => ({ id, label })), regionId: v.regions.map(r => ({ id: r.id, label: r.name })),
  };
  const seen = new Map<string, number>();
  const rows: ImportRow[] = [];
  grid.slice(1).forEach((r, i) => {
    const line = i + 2, reject = (message: string) => rows.push({ line, kind: 'rejected', approval: false, message });
    const metric = col(r, 'measure');
    const family = metricKey(metric), like = measures.get(metric) ?? (OPEN_FAMILIES[family] ? library.find(b => metricKey(b.metric) === family) : undefined);
    if (!metric) return reject('No measure.');
    if (!like) return reject(`Unknown measure "${metric}": export the tab to see the measures it holds.`);
    if (!VIEW_CATEGORIES[view].includes(like.category)) return reject(`"${metric}" belongs to another tab.`);
    const unit = col(r, 'unit');
    if (unit && unit !== like.unit) return reject(`Unit ${unit} — this measure is read in ${like.unit}.`);
    const dims = dimsOf(metric), appliesTo: T.PlannerBenchmark['appliesTo'] = {};
    for (const d of Object.keys(DIM_COL) as BenchDim[]) {
      const raw = col(r, DIM_COL[d]); if (!raw) continue;
      if (!dims.dims.includes(d)) return reject(`${DIM_COL[d].replace('_', ' ')} does not apply to this measure (the planner reads one value for ${dims.dims.length ? dims.dims.join(' / ') : 'every plan'}).`);
      const id = pick(raw, dimOpts[d]); if (!id) return reject(`Unknown ${DIM_COL[d].replace('_', ' ')} "${raw}".`);
      (appliesTo as Record<string, string>)[d] = id;
    }
    if (dims.required) { const m = dims.dims.filter(d => !(appliesTo as Record<string, string>)[d]); if (m.length) return reject(`Say which ${m.map(d => DIM_COL[d].replace('_', ' ')).join(' and ')} it applies to.`); }
    const num = (c: string) => { const s = col(r, c).replace(/[, ]/g, ''); if (!s) return undefined; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
    const low = num('low'), value = num('typical'), high = num('high');
    if ([low, value, high].some(n => Number.isNaN(n))) return reject('Low / typical / high must be plain numbers.');
    if (value === undefined && (low === undefined || high === undefined)) return reject('Give a typical value, or a low and a high.');
    const ord = [low, value, high].filter((x): x is number => x !== undefined);
    if (ord.some((x, k) => k > 0 && x < ord[k - 1])) return reject('Low ≤ typical ≤ high.');
    const source = col(r, 'source'); if (!source) return reject('No source.');
    const asOf = col(r, 'as_of'); if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return reject(`As of "${asOf}" — use YYYY-MM-DD.`);
    const conf = col(r, 'confidence').toLowerCase(); if (conf && !['indicative', 'confirmed'].includes(conf)) return reject('Confidence must be indicative or confirmed.');
    const key = caseKey(metric, appliesTo);
    if (seen.has(key)) return reject(`Same measure and case as line ${seen.get(key)}.`);
    seen.set(key, line);
    const id = col(r, 'id');
    const target = (id && library.find(b => b.id === id && !b.isDeleted)) || activeBenchmarks(library).find(b => caseKey(b.metric, b.appliesTo) === key);
    if (target?.retiredAt) return reject(`${target.id} is retired; restore it first.`);
    if (target?.pending) return reject(`${target.id} has a change awaiting approval.`);
    const next: Partial<T.PlannerBenchmark> = { metric, label: col(r, 'name') || target?.label || like.label, category: like.category, unit: like.unit, appliesTo, low, value, high, source,
      sourceDate: asOf ? `${asOf}T00:00:00.000Z` : target?.sourceDate ?? now, indicative: conf ? conf === 'indicative' : target?.indicative ?? true };
    if (target) {
      if (caseKey(target.metric, target.appliesTo) !== key && duplicateOf(library, { id: target.id, metric, appliesTo })) return reject('Another value already covers this case.');
      const ch = changedFields(target, next);
      if (!ch.length) return void rows.push({ line, kind: 'unchanged', approval: false, message: `${target.id} v${target.version ?? 1}`, target });
      return void rows.push({ line, kind: 'changed', approval: needsApproval(target, next), message: `${target.id}: ${ch.join(', ')}`, target, record: { ...target, ...next } as T.PlannerBenchmark });
    }
    rows.push({ line, kind: 'new', approval: needsApproval(null, next), message: `${next.label}${Object.keys(appliesTo).length ? ` · ${Object.values(appliesTo).join(' · ')}` : ''}`, record: next as T.PlannerBenchmark });
  });
  return { rows };
}
