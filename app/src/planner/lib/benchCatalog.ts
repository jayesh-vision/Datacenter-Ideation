/* Benchmark catalogue: which reference values each Benchmarks tab holds, the measures a planner can add there, the unit each
   measure is read in and the "applies to" fields the engine actually matches it on. One value per measure and case: the planner looks
   values up by exact case (engine.ts bmFind and the direct finds), so two active values for the same case would make the answer depend
   on list order — saveBenchmark refuses that. Retired values stay in the library but are never read. */
import type * as T from '../p2b/types';
import { METRIC_INFO, metricDetail, metricKey } from './labels';

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

export const activeBenchmarks = (all: T.PlannerBenchmark[]) => all.filter(b => !b.isDeleted && !b.retiredAt);

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
