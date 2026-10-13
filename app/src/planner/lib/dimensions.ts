/**
 * Dimensions — how a plan template turns into wizard steps.
 *
 * A template lists the aspects it requires (full or brief). Aspects are grouped into
 * dimensions the planner thinks in (Space and building, Power, Cooling …); each dimension
 * becomes one wizard step that shows only the template's inputs for those aspects.
 * Every input appears in exactly one place: requirement inputs on the Requirements step,
 * the rest on their dimension step.
 *
 * deriveFromRequirements() fills the dimension inputs from what the user asked for
 * (capacity, workload mix, tier, climate, site type), so each step opens pre-filled.
 */
import type * as T from '../p2b/types';
import { DC_TYPE_CATALOG } from '../p2b/dcTypes';
import type { ParamValue } from './engine';

export type DimensionKey = 'space' | 'power' | 'cooling' | 'network' | 'it' | 'firesec' | 'sustainability' | 'operations' | 'delivery' | 'migration' | 'cost' | 'permits';
export interface Dimension { key: DimensionKey; label: string; question: string; aspects: T.PlannerAspect[]; group: 'Design' | 'Delivery' | 'Business' }

export const DIMENSIONS: Dimension[] = [
  { key: 'space', label: 'Space and building', question: 'How many racks, halls, floors and buildings?', aspects: ['space'], group: 'Design' },
  { key: 'power', label: 'Power and resilience', question: 'How is power delivered, and how much can fail?', aspects: ['power', 'resilience'], group: 'Design' },
  { key: 'cooling', label: 'Cooling', question: 'How is the heat removed?', aspects: ['cooling'], group: 'Design' },
  { key: 'network', label: 'Network', question: 'How is everything connected inside and out?', aspects: ['network'], group: 'Design' },
  { key: 'it', label: 'Compute and IT', question: 'What equipment goes in the racks, and who owns it?', aspects: ['it'], group: 'Design' },
  { key: 'firesec', label: 'Fire and security', question: 'How is the site protected?', aspects: ['fire', 'security'], group: 'Design' },
  { key: 'sustainability', label: 'Sustainability', question: 'What efficiency and energy targets apply?', aspects: ['sustainability'], group: 'Design' },
  { key: 'operations', label: 'Operations', question: 'Who runs it, and what spares are kept?', aspects: ['operations'], group: 'Delivery' },
  { key: 'delivery', label: 'Phasing and delivery', question: 'When does capacity land, and can the equipment arrive in time?', aspects: ['schedule', 'supply', 'commissioning'], group: 'Delivery' },
  { key: 'migration', label: 'Migration waves', question: 'What moves, when, and in which window?', aspects: ['migration'], group: 'Delivery' },
  { key: 'cost', label: 'Cost', question: 'What does it cost to build and run?', aspects: ['finance'], group: 'Business' },
  { key: 'permits', label: 'Permits and risks', question: 'What approvals are needed, and what could go wrong?', aspects: ['compliance', 'risk'], group: 'Business' },
];

export interface DimensionUse { dim: Dimension; depth: 'full' | 'summary' }
/** Dimensions a template requires, in order, with the deepest depth of their aspects. */
export function dimensionsFor(template: T.PlannerTemplate | undefined): DimensionUse[] {
  if (!template) return [];
  const depthOf = (a: T.PlannerAspect) => template.requiredAspects.find(x => x.aspect === a)?.depth ?? 'skipped';
  return DIMENSIONS.flatMap(dim => {
    const depths = dim.aspects.map(depthOf);
    if (depths.every(d => d === 'skipped')) return [];
    return [{ dim, depth: depths.includes('full') ? 'full' as const : 'summary' as const }];
  });
}

/* ------------------------------------------------------------------ requirements */
export type RequirementField = 'affected' | 'capacityKw' | 'rackCount' | 'densityKwPerRack' | 'siteCount' | 'kwPerSite' | 'dciGbpsRequired' | 'racksToMove' | 'goLive' | 'workload' | 'growth' | 'tenancy' | 'tier';
/** What the Requirements step asks for each scope — the user's needs, in their words. */
export const REQUIREMENTS: Record<T.PlannerScope, RequirementField[]> = {
  'new-dc': ['capacityKw', 'goLive', 'workload', 'growth', 'tenancy', 'tier'],
  expansion: ['capacityKw', 'goLive', 'workload', 'growth', 'tenancy', 'tier'],
  portfolio: ['capacityKw', 'goLive', 'workload', 'growth', 'tier'],
  hall: ['capacityKw', 'densityKwPerRack', 'goLive', 'workload', 'tenancy'],
  retrofit: ['densityKwPerRack', 'goLive', 'workload'],
  plant: ['capacityKw', 'goLive', 'tier'],
  pod: ['rackCount', 'densityKwPerRack', 'goLive', 'workload', 'tenancy'],
  rack: ['rackCount', 'densityKwPerRack', 'goLive'],
  // Edge: the sites (and each site's load) are picked on Requirements; the count and total follow from them.
  edge: ['goLive', 'tier'],
  network: ['dciGbpsRequired', 'goLive'],
  migration: ['goLive'],
  'server-refresh': ['affected', 'goLive'],
  'network-refresh': ['affected', 'goLive'],
  'rack-replace': ['affected', 'goLive'],
};
/** Parameter keys owned by the Requirements step; dimension steps show them read-only. */
export function requirementParamKeys(scope: T.PlannerScope): string[] {
  const map: Partial<Record<RequirementField, string>> = { rackCount: 'rackCount', densityKwPerRack: 'densityKwPerRack', siteCount: 'siteCount', kwPerSite: 'kwPerSite', dciGbpsRequired: 'dciGbpsRequired', racksToMove: 'racksToMove', tier: 'tier' };
  return REQUIREMENTS[scope].map(f => map[f]).filter((k): k is string => !!k);
}
/** Capacity in kW implied by the scope's requirement inputs. */
export function capacityFromRequirements(plan: T.PlannerPlan): number {
  const n = (k: string) => Number(plan.params[k] ?? 0);
  if (plan.scope === 'rack' || plan.scope === 'pod') return Math.round(n('rackCount') * n('densityKwPerRack'));
  if (plan.scope === 'edge') return Math.round(n('siteCount') * n('kwPerSite'));
  return plan.designPowerKw;
}

/* ------------------------------------------------------------------ derivation */
export interface Derived { key: string; value: ParamValue; why: string }
const isUserOwned = (plan: T.PlannerPlan, key: string) => ['user', 'ai', 'document', 'actual'].includes(plan.paramSources[key] ?? '');

/**
 * Inputs implied by the requirements, for keys the planner has not set themselves.
 * Rules of thumb, stated in `why`, so the planner sees the reasoning on each step.
 */
export function deriveFromRequirements(plan: T.PlannerPlan, template: T.PlannerTemplate | undefined, benchmarks: T.PlannerBenchmark[], regionId?: string): Derived[] {
  const out: Derived[] = [];
  const keys = new Set((template?.params ?? []).map(p => p.key));
  const profile = DC_TYPE_CATALOG.find(p => p.key === plan.dcTypeKey);
  const tier = String(plan.params.tier ?? profile?.defaultTier ?? 'Tier III');
  const kw = plan.designPowerKw;
  const set = (key: string, value: ParamValue, why: string) => { if (keys.has(key) && !isUserOwned(plan, key) && value !== undefined && !(typeof value === 'number' && !Number.isFinite(value))) out.push({ key, value, why }); };
  const { gpuPct, computePct, storagePct } = plan.demand;

  // Density from the workload mix and the site type's range.
  let density = Number(plan.params.densityKwPerRack ?? 0);
  if (!isUserOwned(plan, 'densityKwPerRack') && !requirementParamKeys(plan.scope).includes('densityKwPerRack')) {
    // GPU racks: the site type's mid-range, capped at a practical 80 kW; compute and storage racks draw the same anywhere.
    const [lo, hi] = profile?.kwPerRack ?? [6, 20];
    const gpuKw = profile?.highDensity ? Math.min(80, Math.round((lo + hi) / 2)) : 40, computeKw = Math.min(15, Math.max(6, Math.round((lo + hi) / 2))), storageKw = Math.min(8, Math.max(4, lo));
    density = Math.round((gpuPct * gpuKw + computePct * computeKw + storagePct * storageKw) / 100);
    set('densityKwPerRack', density, `${gpuPct}% GPU at ${gpuKw} kW, ${computePct}% compute at ${computeKw} kW, ${storagePct}% storage at ${storageKw} kW`);
  }
  // Hall size: one hall for a hall or retrofit; otherwise the site type's standard hall.
  if (plan.scope === 'hall' || plan.scope === 'retrofit') set('hallDesignKw', Math.max(100, kw), 'one hall carries the whole requirement');
  else if (profile) set('hallDesignKw', profile.highDensity ? 2500 : profile.segment === 'Telco' ? 600 : kw >= 20000 ? 2000 : 1500, `standard hall for this site type (${profile.name})`);
  // Building stack: more floors for big campuses.
  if (kw >= 20000) { set('floorsPerBuilding', 3, 'large campus: three data hall floors per building'); set('hallsPerFloor', 3, 'three halls per floor'); }
  else if (kw > 0) { set('floorsPerBuilding', 2, 'two data hall floors per building'); set('hallsPerFloor', kw < 3000 ? 2 : 3, kw < 3000 ? 'two halls per floor' : 'three halls per floor'); }
  // Resilience from the tier.
  set('redundancy', tier === 'Tier IV' ? '2N' : tier === 'Tier III' ? (kw >= 5000 ? '2N' : 'N+1') : 'N+1', `${tier} needs ${tier === 'Tier II' ? 'one spare path' : 'concurrently maintainable power'}`);
  set('coolingRedundancy', tier === 'Tier IV' ? '2N' : 'N+1', `${tier} cooling redundancy`);
  set('generatorFuelHours', tier === 'Tier IV' ? 72 : 48, `${tier} fuel autonomy`);
  // Cooling from density and climate.
  const d = density || Number(plan.params.densityKwPerRack ?? 12);
  const cooling: T.PlannerCoolingType = d > 30 ? 'liquid-to-chip' : d > 20 ? 'rear-door' : plan.climate === 'cold' || plan.climate === 'temperate' ? 'air-economiser' : 'chilled-water';
  set('coolingType', cooling, d > 30 ? `${d} kW per rack is above the 30 kW air limit` : d > 20 ? `${d} kW per rack needs close-coupled cooling` : `${plan.climate} climate allows ${cooling === 'air-economiser' ? 'free cooling' : 'chilled water'}`);
  set('inletSetpointC', cooling === 'liquid-to-chip' ? 30 : 24, cooling === 'liquid-to-chip' ? 'liquid halls allow a warmer inlet' : 'ASHRAE recommended inlet');
  const pue = benchmarks.find(b => b.metric === 'pue' && b.appliesTo.coolingType === cooling && b.appliesTo.climate === plan.climate) ?? benchmarks.find(b => b.metric === 'pue' && b.appliesTo.coolingType === cooling);
  if (pue?.value) set('pueTarget', pue.value, `benchmark for this cooling in a ${plan.climate} climate`);
  // Network from the GPU share.
  set('oversubscription', gpuPct >= 40 ? 2 : 3, gpuPct >= 40 ? 'GPU clusters need a near non-blocking fabric' : 'standard 3:1 for general compute');
  set('uplinkGbps', gpuPct >= 40 ? '800' : '400', gpuPct >= 40 ? '800G uplinks for GPU traffic' : '400G uplinks');
  set('carrierCount', tier === 'Tier IV' ? 3 : 2, `${tier} carrier diversity`);
  // IT ownership from tenancy.
  set('operatorOwnedIt', plan.demand.tenancy === 'single', plan.demand.tenancy === 'single' ? 'single tenant: the operator buys the IT' : 'multi-tenant: tenants bring their own IT');
  // Staffing and cost from benchmarks.
  const staff = benchmarks.find(b => b.metric === 'staffPerMw' && b.appliesTo.tier === tier) ?? benchmarks.find(b => b.metric === 'staffPerMw');
  if (staff?.value) set('staffPerMw', staff.value, `benchmark for ${tier}`);
  const capex = benchmarks.find(b => b.metric === 'capexPerKw' && b.appliesTo.dcTypeKey === plan.dcTypeKey);
  if (capex?.value) set('capexPerKw', capex.value, `benchmark for ${profile?.name ?? 'this site type'}`);
  const tariff = benchmarks.find(b => b.metric.startsWith('tariff') && b.appliesTo.regionId === (regionId ?? plan.regionId));
  if (tariff?.value) set('tariffUsdPerKwh', tariff.value, 'regional energy price');
  // Rack classes: nominal kW per class from the site type's band (the engine scales them so racks × kW add up to the load).
  const [klo, khi] = profile?.kwPerRack ?? [6, 20];
  if (gpuPct > 0) set('gpuRackKw', profile?.highDensity ? Math.min(80, Math.round((klo + khi) / 2)) : cooling === 'liquid-to-chip' ? 60 : cooling === 'rear-door' ? 40 : 25, profile?.highDensity ? `${profile.name}: mid-band GPU rack, capped at 80 kW` : cooling === 'liquid-to-chip' ? 'liquid-cooled GPU racks run full at about 60 kW' : cooling === 'rear-door' ? 'GPU racks under rear doors run at about 40 kW' : 'air-cooled GPU racks are part-filled to about 25 kW');
  if (computePct > 0) set('computeRackKw', Math.min(15, Math.max(6, Math.round((klo + khi) / 2))), 'typical dual-socket server rack');
  if (storagePct > 0) set('storageRackKw', Math.min(8, Math.max(4, klo)), 'storage arrays draw little per rack');
  // UPS modules sized to the hall load.
  const hallLoad = plan.scope === 'hall' || plan.scope === 'retrofit' ? kw : profile?.highDensity ? 2500 : profile?.segment === 'Telco' ? 600 : kw >= 20000 ? 2000 : 1500;
  set('upsModuleKw', hallLoad >= 2000 ? 1250 : hallLoad >= 800 ? 500 : hallLoad >= 150 ? 250 : 40, `modules sized for a ${hallLoad.toLocaleString('en-US')} kW hall`);
  // WAN capacity from the workload: GPU training needs little, general compute and storage more.
  if (kw > 0 && ['new-dc', 'expansion', 'portfolio'].includes(plan.scope)) { const g = gpuPct / 100; set('dciGbpsRequired', Math.max(100, Math.ceil(((kw / 1000) * (g * 2 + (1 - g) * 10)) / 100) * 100), `${Math.round(g * 2 + (1 - g) * 10)} Gbps per MW for this workload mix (GPU training needs little WAN)`); }
  // IT is priced in the estimate from the catalogue quantity model (catalogue.itQuantities), the same one the bill and sourcing use.
  const revenue = gpuPct >= 40 ? 420 : plan.demand.tenancy === 'multi' ? 180 : 150;
  set('revenuePerKwMonth', revenue, gpuPct >= 40 ? 'GPU capacity price per kW-month' : plan.demand.tenancy === 'multi' ? 'colocation price per kW-month' : 'internal chargeback per kW-month');
  set('commissioningLevel', plan.scope === 'rack' ? '3' : plan.scope === 'pod' || plan.scope === 'retrofit' ? '4' : '5', 'commissioning depth for this kind of plan');
  return out;
}

/** Apply derived inputs to a plan, marking each with the requirement source. */
export function applyDerived(plan: T.PlannerPlan, derived: Derived[]): T.PlannerPlan {
  if (!derived.length) return plan;
  const params = { ...plan.params }; const paramSources = { ...plan.paramSources };
  for (const d of derived) { params[d.key] = d.value; paramSources[d.key] = 'requirement'; }
  return { ...plan, params, paramSources };
}
