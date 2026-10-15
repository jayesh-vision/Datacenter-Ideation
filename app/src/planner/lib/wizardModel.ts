/* Wizard model — which steps a scope shows, the props every step receives, and the pure
   helpers that turn an intent reading, a template or an estate site into draft changes. */
import type * as T from '../p2b/types';
import { DC_TYPE_CATALOG } from '../p2b/dcTypes';
import { fmtKw, type Evaluation, type ParamValue } from './engine';
import type { IntentReading } from './ai';
import type { Estate } from './usePlanner';
import type { EstateActuals } from './engine';
import type { usePlannerActions } from './usePlanner';
import { DIMENSIONS, REQUIREMENTS, dimensionsFor, type DimensionKey } from './dimensions';
import type { PlannerData } from './plannerData';
import { modelFor } from './scopes';
import { clockMs } from '../compat/clock';

export type StepKey = 'type' | 'requirements' | `dim:${DimensionKey}` | 'scenarios' | 'review';
export interface StepDef { key: StepKey; label: string; hint: string; group: 'Set up' | 'Design' | 'Delivery' | 'Business' | 'Decide'; depth?: 'full' | 'summary' }

/** The wizard is fixed by the plan template: set-up steps, one step per required dimension, then decide. */
export function stepsFor(template: T.PlannerTemplate | undefined): StepDef[] {
  const dims: StepDef[] = dimensionsFor(template).map(({ dim, depth }) => ({ key: `dim:${dim.key}` as StepKey, label: dim.label, hint: dim.question, group: dim.group, depth }));
  return [
    { key: 'type', label: 'Plan type', hint: 'What you are planning', group: 'Set up' },
    { key: 'requirements', label: 'Requirements', hint: 'What you need, where and when', group: 'Set up' },
    ...dims,
    { key: 'scenarios', label: 'Scenarios', hint: 'Compare options', group: 'Decide' },
    { key: 'review', label: 'Review and submit', hint: 'Deliverables and approvals', group: 'Decide' },
  ];
}
export const hasPermits = (scope: T.PlannerScope) => scope !== 'rack' && scope !== 'pod';

export interface StepProps {
  draft: T.PlannerPlan;
  /** The plan template this wizard is built from (resolved leaf). */
  template?: T.PlannerTemplate;
  /** Why each requirement-derived input has its value. */
  why: Record<string, string>;
  /** Merge a partial into the draft. */
  patch: (p: Partial<T.PlannerPlan>) => void;
  /** Set one parameter with its source. */
  setParam: (key: string, value: ParamValue, source?: T.PlannerParamSource) => void;
  /** Remove a parameter so the template default applies again. */
  resetParam: (key: string) => void;
  ev?: Evaluation;
  templates: T.PlannerTemplate[];
  benchmarks: T.PlannerBenchmark[];
  estate: Estate;
  actuals: EstateActuals;
  actions: ReturnType<typeof usePlannerActions>;
  /** Platform data (site baselines, devices, services…); collections are empty until loaded. */
  data: PlannerData;
  /** Persist the draft now (scenarios need a saved plan). Returns the saved record. */
  persist: () => T.PlannerPlan;
  /** The plan exists in the store already. */
  saved: boolean;
  /** Jump to a step by key (used by the review checklist). */
  goTo: (key: StepKey) => void;
  /** Validation problems on the current step (shown inline; Next is blocked while there are any). */
  issues?: StepIssue[];
  /** The plan is locked (in review, approved, executing…): the wizard only shows it. */
  readOnly?: boolean;
}

/* ------------------------------------------------------------------ per-step validation */

/** One problem on a step, tied to a field so the step can show it next to the input. */
export interface StepIssue { field: string; text: string }
const DAY = 864e5;

/** Longest procurement lead time in the evaluation (items bought, not taken from stock or the site). */
export function longestLead(ev?: Evaluation): { item: string; weeks: number } | undefined {
  const items = (ev?.schedule ?? []).filter(x => x.kind === 'equipment' && x.source !== 'stock' && x.source !== 'site' && x.leadWeeks > 0);
  return items.reduce<{ item: string; weeks: number } | undefined>((m, x) => (!m || x.leadWeeks > m.weeks ? { item: x.item, weeks: x.leadWeeks } : m), undefined);
}

/** The earliest needed-by date the plan can meet: today plus the longest order-to-go-live span of the equipment it buys (lead
 *  time, buffer and install), rounded up to the first of the next month. Undefined when nothing has to be bought. */
export function earliestGoLive(ev: Evaluation | undefined, targetGoLive: string, nowMs: number): string | undefined {
  const t = Date.parse(targetGoLive);
  const items = (ev?.schedule ?? []).filter(x => x.kind === 'equipment' && x.source !== 'stock' && x.source !== 'site' && x.leadWeeks > 0 && Number.isFinite(Date.parse(x.orderBy)));
  if (!items.length || !Number.isFinite(t)) return undefined;
  const span = Math.max(...items.map(x => t - Date.parse(x.orderBy)), ...items.map(x => x.leadWeeks * 7 * DAY));
  const d = new Date(nowMs + span + 7 * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

/** What must be fixed on a step before Next. Generic checks only; families add theirs through `blockers`. */
export function stepIssues(key: StepKey, draft: T.PlannerPlan, ev: Evaluation | undefined, templates: T.PlannerTemplate[], nowMs: number): StepIssue[] {
  const out: StepIssue[] = [];
  if (key === 'type') {
    if (!draft.templateId) out.push({ field: 'templateId', text: 'Pick a plan type.' });
    return out;
  }
  if (key === 'requirements') {
    if (!draft.title.trim()) out.push({ field: 'title', text: 'Give the plan a name.' });
    const site = siteMissing(draft); if (site) out.push({ field: 'site', text: site + '.' });
    const fields = REQUIREMENTS[draft.scope] ?? [];
    if (draft.scope !== 'network' && fields.some(f => f === 'capacityKw' || f === 'rackCount' || f === 'siteCount') && draft.designPowerKw <= 0) out.push({ field: 'capacity', text: 'The IT capacity is zero.' });
    const target = new Date(draft.targetGoLive).getTime();
    if (!Number.isFinite(target)) out.push({ field: 'targetGoLive', text: 'Give the date it is needed by.' });
    else if (target <= nowMs) out.push({ field: 'targetGoLive', text: 'The date is in the past.' });
    else {
      const lead = longestLead(ev);
      if (lead && target < nowMs + lead.weeks * 7 * DAY) out.push({ field: 'targetGoLive', text: `${lead.item} takes ${lead.weeks} weeks to arrive, so the earliest date is ${new Date(nowMs + lead.weeks * 7 * DAY).toISOString().slice(0, 10)}.` });
    }
    if (fields.includes('workload') && draft.demand.gpuPct + draft.demand.computePct + draft.demand.storagePct !== 100) out.push({ field: 'workload', text: 'The workload mix must add up to 100%.' });
    return out;
  }
  if (key.startsWith('dim:')) {
    const dim = DIMENSIONS.find(d => `dim:${d.key}` === key);
    const defs = paramDefsFor(ev, templates, draft.dcTypeKey);
    for (const [k, v] of Object.entries(draft.params)) {
      const def = defs.get(k); if (!def || !dim?.aspects.includes(def.aspect) || typeof v !== 'number') continue;
      if (def.min !== undefined && v < def.min) out.push({ field: k, text: `${def.label}: ${v}${def.unit ? ` ${def.unit}` : ''} is below the minimum ${def.min}.` });
      if (def.max !== undefined && v > def.max) out.push({ field: k, text: `${def.label}: ${v}${def.unit ? ` ${def.unit}` : ''} is above the maximum ${def.max}.` });
    }
  }
  return out;
}

/** Parameter definitions this plan can see: the resolved plan template chain, with the site-type profile's defaults on top. Nothing from other templates. */
export function paramDefsFor(ev: Evaluation | undefined, templates: T.PlannerTemplate[], dcTypeKey: string): Map<string, T.PlannerParamDef> {
  const out = new Map<string, T.PlannerParamDef>();
  for (const p of ev?.resolved?.params ?? []) out.set(p.key, p);
  const profile = templates.find(t => t.kind === 'profile' && t.dcTypeKey === dcTypeKey);
  for (const p of profile?.params ?? []) if (out.has(p.key)) out.set(p.key, { ...out.get(p.key)!, default: p.default });
  return out;
}

export const CLIMATE_LABEL: Record<T.PlannerPlan['climate'], string> = { cold: 'Cold', temperate: 'Temperate', 'hot-dry': 'Hot and dry', 'hot-humid': 'Hot and humid' };
export const CLIMATES = Object.keys(CLIMATE_LABEL) as T.PlannerPlan['climate'][];
export const COOLING_LABEL: Record<T.PlannerCoolingType, string> = { 'air-crah': 'Air (CRAH)', 'air-economiser': 'Air with economiser', 'chilled-water': 'Chilled water', 'in-row': 'In-row', 'rear-door': 'Rear-door heat exchanger', 'liquid-to-chip': 'Liquid-to-chip', immersion: 'Immersion' };

/** Climate guess from a place name mentioned in the intent. */
export function climateFromHint(hint?: string): T.PlannerPlan['climate'] | undefined {
  if (!hint) return undefined;
  const h = hint.toLowerCase();
  if (/dallas|texas|singapore|s[aã]o paulo|brazil/.test(h)) return 'hot-humid';
  if (/frankfurt|dublin|germany|ireland|ashburn|virginia|sydney|australia/.test(h)) return 'temperate';
  return undefined;
}

export const SCOPE_DESCRIPTION: Record<T.PlannerScope, string> = {
  rack: 'Place one rack of equipment: which rack, outlets, ports, VLAN and addresses.',
  pod: '10 to 60 racks for a team or tenant: row position, containment, PDUs, leaves, cage fencing.',
  hall: 'Open a hall: layout, density classes, cooling, PDUs, trunks, fabric, commissioning levels.',
  retrofit: 'Bring 30 to 100 kW racks into an air-cooled hall: CDUs, manifolds, floor loading, phased moves.',
  plant: 'Add UPS modules, chillers, generators or transformers without losing redundancy.',
  network: 'Fabric upgrade, optics, DCI capacity, carrier diversity, IP and VLAN plan.',
  expansion: 'A new building or hall block on an existing campus, sharing plant and utility capacity.',
  'new-dc': 'A greenfield site from intent to programme: site, type, tier, phases, plant, halls, cost, permits.',
  portfolio: 'Where to put capacity first across several sites, DCI between them, shared spares and staff.',
  migration: 'What moves where and when, cut-over windows, freed capacity, disposal.',
  edge: 'Many small identical sites stamped from one template with local variations.',
  'server-refresh': 'Replace ageing, out-of-warranty or faulty servers with current models, wave by wave.',
  'network-refresh': 'Replace end-of-life switches, routers or firewalls with current models.',
  'rack-replace': 'Swap old or under-powered racks and their power strips, re-racking the equipment.',
};

/** The draft changes an accepted intent reading produces. */
export function applyIntent(draft: T.PlannerPlan, r: IntentReading, text: string, estate: Estate, templates: T.PlannerTemplate[]): Partial<T.PlannerPlan> {
  const params = { ...draft.params }; const sources = { ...draft.paramSources };
  if (r.tier) { params.tier = r.tier; sources.tier = 'ai'; }
  if (r.cooling) { params.coolingType = r.cooling; sources.coolingType = 'ai'; }
  if (r.density) { params.densityKwPerRack = r.density; sources.densityKwPerRack = 'ai'; }
  const hint = r.campusHint?.toLowerCase();
  const resolved = r.dataCenterId ? estate.dataCenters.find(d => d.id === r.dataCenterId) : undefined;
  const campus = resolved ? estate.campuses.find(c => c.id === resolved.campusId) : hint ? estate.campuses.find(c => `${c.name} ${c.city} ${c.country}`.toLowerCase().includes(hint)) : undefined;
  const dc = resolved ?? (campus ? estate.dataCenters.find(d => d.campusId === campus.id && d.status === 'Operational') ?? estate.dataCenters.find(d => d.campusId === campus.id) : undefined);
  const useExisting = !!campus && r.scope !== 'new-dc' && r.scope !== 'portfolio';
  // An existing site fixes the site type and tier: the intent reading must not contradict the site.
  const site = useExisting ? dc : undefined;
  if (site?.tier) { params.tier = site.tier; sources.tier = 'actual'; }
  const templateId = templates.find(t => t.kind === 'plan' && t.status === 'published' && t.scope === r.scope && !t.inheritsFrom)?.id ?? draft.templateId;
  const climate = (useExisting ? r.climate : undefined) ?? climateFromHint(r.campusHint) ?? draft.climate;
  const goLive = r.months ? new Date(clockMs() + r.months * 30.4 * 864e5).toISOString() : draft.targetGoLive;
  const title = draft.title || titleFromReading(r, text);
  return {
    intent: text, aiAssisted: true, dcTypeKey: site?.dcTypeKey ?? r.dcTypeKey, scope: r.scope, designPowerKw: r.kw ?? draft.designPowerKw, targetGoLive: goLive, climate, templateId, title,
    campusId: campus?.id ?? draft.campusId, regionId: campus?.regionId ?? draft.regionId, dataCenterId: useExisting ? dc?.id ?? draft.dataCenterId : undefined,
    newSiteName: !useExisting && campus ? `${campus.city.toUpperCase().slice(0, 3)}-NEW` : draft.newSiteName,
    params, paramSources: sources,
    demand: { ...draft.demand, densityKwPerRack: r.density ?? draft.demand.densityKwPerRack, gpuPct: r.dcTypeKey === 'ai-gpu-factory' ? Math.max(draft.demand.gpuPct, 70) : draft.demand.gpuPct, computePct: r.dcTypeKey === 'ai-gpu-factory' ? Math.min(draft.demand.computePct, 20) : draft.demand.computePct, storagePct: r.dcTypeKey === 'ai-gpu-factory' ? 10 : draft.demand.storagePct },
  };
}

export function titleFromReading(r: IntentReading, text: string): string {
  const where = r.campusHint ? ` · ${r.campusHint[0].toUpperCase()}${r.campusHint.slice(1)}` : '';
  const size = r.kw ? ` · ${r.kw >= 1000 ? `${Math.round(r.kw / 100) / 10} MW` : `${r.kw} kW`}` : '';
  const base = r.profile.name;
  const t = `${base}${where}${size}`;
  return t.length > 8 ? t : text.slice(0, 60);
}

/** Default permits a scope normally needs, dated against the target go-live. */
export function defaultPermits(scope: T.PlannerScope, targetGoLive: string): T.PlannerPermit[] {
  const target = new Date(targetGoLive).getTime();
  const at = (weeksBefore: number) => new Date(target - weeksBefore * 7 * 864e5).toISOString();
  const P = (i: number, name: string, authority: string, leadWeeks: number, weeksBefore: number): T.PlannerPermit => ({ id: `PM-${i}`, name, authority, leadWeeks, neededBefore: at(weeksBefore), status: 'Not started' });
  switch (scope) {
    case 'new-dc': return [P(1, 'Planning permission', 'Local planning authority', 26, 60), P(2, 'Grid connection agreement', 'Transmission operator', 40, 48), P(3, 'Environmental (noise, water, emissions)', 'Regional environment agency', 20, 44), P(4, 'Fire safety certificate', 'Fire authority', 8, 6)];
    case 'expansion': return [P(1, 'Building permit', 'Local planning authority', 16, 40), P(2, 'Grid capacity uplift', 'Distribution operator', 30, 36), P(3, 'Fire safety certificate', 'Fire authority', 8, 6)];
    case 'portfolio': return [P(1, 'Grid capacity reservation', 'Transmission operator', 30, 52)];
    case 'hall': case 'retrofit': return [P(1, 'Fire safety certificate', 'Fire authority', 8, 6), P(2, 'Electrical installation sign-off', 'Certified inspector', 4, 3)];
    case 'plant': return [P(1, 'Generator emissions permit', 'Regional environment agency', 12, 16), P(2, 'Electrical installation sign-off', 'Certified inspector', 4, 3)];
    case 'edge': return [P(1, 'Site lease and access agreements', 'Landlords', 10, 20), P(2, 'Local electrical sign-off', 'Certified inspector', 4, 3)];
    case 'migration': return [P(1, 'Data disposal certification', 'Information security', 4, 4)];
    case 'network': return [P(1, 'Wayleave for diverse fibre route', 'Municipal authority', 12, 16)];
    default: return [];
  }
}

/** Racks and halls a phase needs at the effective density and hall size. */
export function phaseDerived(itKw: number, ev?: Evaluation): { racks: number; halls: number } {
  const density = Math.max(1, Number(ev?.params['densityKwPerRack']?.value ?? 12));
  const hallKw = Math.max(1, Number(ev?.params['hallDesignKw']?.value ?? 1500));
  return { racks: itKw > 0 ? Math.ceil(itKw / density) : 0, halls: itKw > 0 ? Math.max(1, Math.ceil(itKw / hallKw)) : 0 };
}

/** Scopes without a phasing step still need one phase for the schedule and the ladder. */
export function ensureSinglePhase(draft: T.PlannerPlan, ev?: Evaluation): T.PlannerPhase[] {
  if (draft.designPowerKw <= 0) return draft.phases;
  const d = phaseDerived(draft.designPowerKw, ev);
  if (draft.phases.length === 1 && draft.phases[0].itKw === draft.designPowerKw && draft.phases[0].goLive === draft.targetGoLive) return draft.phases;
  if (draft.phases.length > 1) return draft.phases;
  return [{ id: 'PH-1', name: 'Go-live', goLive: draft.targetGoLive, itKw: draft.designPowerKw, racks: d.racks, halls: d.halls, status: 'Planned' }];
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
export const toDateInput = (iso: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
export const fromDateInput = (v: string, fallback: string) => (v ? new Date(`${v}T00:00:00Z`).toISOString() : fallback);

export const BLOCK_LABEL: Record<string, string> = { ok: 'Ready', warn: 'Attention', bad: 'Blocked' };

export const INTENT_EXAMPLES = [
  'Plan a new 50 MW AI data centre in Frankfurt for 2028, Tier III, liquid cooled',
  'Add 40 racks at 30 kW in Ashburn Hall 3',
  'Upgrade the UPS at Dallas',
  '400G DCI between Ashburn and Frankfurt',
  'Decommission the Dublin central office',
];

export interface Blocker { level: 'bad' | 'warn'; text: string; step: StepKey }

/** What stops a submission (bad) or needs a named reason (warn). Shared by the review step and the page so the submit button agrees with the checklist. */
export function blockers(draft: T.PlannerPlan, ev?: Evaluation, template?: T.PlannerTemplate, data?: PlannerData): Blocker[] {
  const out: Blocker[] = [];
  const steps = new Set(stepsFor(template).map(s => s.key));
  const phaseStep: StepKey = steps.has('dim:migration') ? 'dim:migration' : steps.has('dim:delivery') ? 'dim:delivery' : 'requirements';
  const ruleStep = (aspect: T.PlannerAspect): StepKey => { const d = dimensionsFor(template).find(x => x.dim.aspects.includes(aspect)); return d ? (`dim:${d.dim.key}` as StepKey) : 'review'; };
  const permitStep: StepKey = steps.has('dim:permits') ? 'dim:permits' : 'review';
  if (!draft.templateId) out.push({ level: 'bad', text: 'No plan type selected', step: 'type' });
  if (!draft.title.trim()) out.push({ level: 'bad', text: 'The plan has no title', step: 'requirements' });
  const missingSite = siteMissing(draft); if (missingSite) out.push({ level: 'bad', text: `Where: ${missingSite.toLowerCase()}`, step: 'requirements' });
  if (draft.designPowerKw <= 0 && draft.scope !== 'network') out.push({ level: 'bad', text: 'IT capacity is zero', step: 'requirements' });
  if (new Date(draft.targetGoLive).getTime() <= Date.parse(new Date(clockMs()).toISOString().slice(0, 10))) out.push({ level: 'bad', text: 'The needed-by date is in the past', step: 'requirements' });
  const phased = draft.phases.reduce((a, p) => a + p.itKw, 0);
  if (draft.phases.length === 0 && draft.designPowerKw > 0) out.push({ level: 'bad', text: 'No phases or waves defined', step: phaseStep });
  else if (draft.phases.length && phased !== draft.designPowerKw) out.push({ level: 'bad', text: `Phases sum to ${fmtKw(phased)}, not the ${fmtKw(draft.designPowerKw)} required`, step: phaseStep });
  for (const f of ev?.findings ?? []) if (f.status === 'fail') out.push({ level: 'bad', text: `${f.rule.title}: ${f.detail}`, step: ruleStep(f.rule.aspect) });
  if (ev && ev.softWarns) out.push({ level: 'warn', text: `${ev.softWarns} rule warning${ev.softWarns === 1 ? '' : 's'} to acknowledge in the review`, step: 'review' });
  if (hasPermits(draft.scope) && steps.has('dim:permits') && draft.permits.length === 0) out.push({ level: 'warn', text: 'No permits listed for this plan', step: permitStep });
  if (draft.risks.some(r => r.impact === 'High' && (!r.owner || !r.mitigation))) out.push({ level: 'warn', text: 'High-impact risks without an owner or a mitigation', step: permitStep });
  if (draft.demand.gpuPct + draft.demand.computePct + draft.demand.storagePct !== 100) out.push({ level: 'bad', text: 'Workload mix does not sum to 100%', step: 'requirements' });
  // The plan type's family adds its own (site fit, waves, consent, paths…).
  for (const b of modelFor(draft.scope).blockers?.(draft, ev, data ?? ev?.ctx.data) ?? []) out.push({ ...b, step: (steps.has(b.step as StepKey) ? b.step : 'review') as StepKey });
  return out;
}

/** A parameter value in plain words, with its unit. */
export function fmtParam(key: string, value: unknown, unit?: string): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (key === 'coolingType') return COOLING_LABEL[value as T.PlannerCoolingType] ?? String(value);
  if (key === 'feedVoltage') return `${Number(value) / 1000} kV`;
  if (key === 'uplinkGbps') return `${value} Gbps`;
  if (key === 'commissioningLevel') return `Level ${value}`;
  if (typeof value === 'number') return `${value.toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`;
  return String(value);
}

/** Workload mix a site type usually starts from. */
export function mixForSiteType(key: string): Pick<T.PlannerDemand, 'gpuPct' | 'computePct' | 'storagePct' | 'tenancy'> {
  const p = DC_TYPE_CATALOG.find(x => x.key === key);
  if (!p) return { gpuPct: 20, computePct: 60, storagePct: 20, tenancy: 'single' };
  if (p.key === 'ai-gpu-factory') return { gpuPct: 70, computePct: 20, storagePct: 10, tenancy: 'single' };
  if (p.multiTenant) return { gpuPct: 10, computePct: 70, storagePct: 20, tenancy: 'multi' };
  if (p.segment === 'Telco') return { gpuPct: 0, computePct: 80, storagePct: 20, tenancy: 'single' };
  return { gpuPct: 20, computePct: 60, storagePct: 20, tenancy: 'single' };
}


/** How a plan type chooses where it happens. */
export type SiteMode = 'existing' | 'two-sites' | 'migration' | 'campus' | 'new' | 'region';
export const SITE_MODE: Record<T.PlannerScope, SiteMode> = {
  rack: 'existing', pod: 'existing', hall: 'existing', retrofit: 'existing', plant: 'existing',
  network: 'two-sites', migration: 'migration', expansion: 'campus', 'new-dc': 'new', edge: 'new', portfolio: 'region',
  'server-refresh': 'existing', 'network-refresh': 'existing', 'rack-replace': 'existing',
};
/** What is still missing for the site to be complete, or undefined when it is. */
export function siteMissing(draft: T.PlannerPlan): string | undefined {
  const model = modelFor(draft.scope);
  if (model.siteMissing) { const own = model.siteMissing(draft); if (own !== null) return own; }
  switch (SITE_MODE[draft.scope]) {
    case 'existing': return !draft.dataCenterId ? 'Pick the data centre' : ['server-refresh', 'network-refresh', 'rack-replace'].includes(draft.scope) && !draft.params.affectedIds ? 'Select what is being replaced' : (draft.scope === 'hall' || draft.scope === 'retrofit') && !draft.params.targetHallId ? 'Pick the hall' : undefined;
    case 'two-sites': return !draft.dataCenterId || !draft.peerDataCenterId ? 'Pick both ends of the link' : undefined;
    case 'migration': return !draft.dataCenterId ? 'Pick the site being emptied' : undefined;
    case 'campus': return !draft.campusId ? 'Pick the campus to expand' : !draft.newSiteName?.trim() ? 'Name the new building' : undefined;
    case 'new': return !draft.newSiteName?.trim() ? 'Name the new site' : !draft.regionId ? 'Pick the region' : undefined;
    case 'region': return !draft.regionId ? 'Pick the region' : undefined;
  }
}
