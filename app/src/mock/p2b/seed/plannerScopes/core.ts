/* Planner seed · engine core (agent B): the generic inputs the physics, cost, finance and sourcing
   models read, the rules they answer and the reference values behind them. Families can replace any
   of these per plan type in their own seed. See src/modules/planner/lib/engine.ts and finance.ts. */
import type * as T from '../../../../planner/p2b/types';
import type { BenchmarkSeed, ScopeSeed } from './types';

const P = (key: string, label: string, aspect: T.PlannerAspect, type: T.PlannerParamDef['type'], extra: Partial<T.PlannerParamDef> = {}): T.PlannerParamDef => ({ key, label, aspect, type, ...extra });

/* ── power and plant ── */
const POWER: T.PlannerParamDef[] = [
  P('gridOfferMva', 'Grid capacity offered', 'power', 'number', { unit: 'MVA per path', min: 0, max: 600, help: 'Firm import capacity in the grid offer. With 2N or N+1 each supply path must carry the whole facility load. Leave empty until the network operator has made an offer; the check then fails on the site type assumption.' }),
  P('peakPueFactor', 'Peak PUE allowance', 'power', 'number', { default: 0.05, min: 0, max: 0.5, help: 'Added to the design PUE for the hottest day: plant is sized on IT × (PUE + allowance).' }),
  P('powerFactor', 'Power factor', 'power', 'number', { default: 0.95, min: 0.8, max: 1, help: 'Converts kW to kVA for feeds and transformers.' }),
  P('transformerKva', 'MV/LV transformer size', 'power', 'select', { options: ['1600', '2000', '2500', '3150'], default: '2500', unit: 'kVA', help: 'N+1 adds one spare unit; 2N doubles the set.' }),
  P('upsModuleKw', 'UPS module size', 'power', 'number', { unit: 'kW', min: 20, max: 2000, derived: 'site type: 1,250 kW for large halls, 500 kW enterprise, 250 kW small rooms', help: 'UPS is sized as modules per hall per side.' }),
  P('generatorKva', 'Generator size', 'power', 'select', { options: ['500', '1000', '2000', '2500', '3000'], default: '3000', unit: 'kVA standby', help: 'Rated at 0.8 power factor; sized on the facility load with margin, N+1 or 2N by tier.' }),
];
/* ── cooling ── */
const COOLING: T.PlannerParamDef[] = [
  P('liquidCapturePct', 'Heat captured by liquid', 'cooling', 'number', { unit: '%', default: 75, min: 40, max: 98, help: 'Share of a liquid-cooled rack\'s heat taken by the CDUs; the rest needs air units.' }),
];
/* ── space and building ── */
const CLASSES: T.PlannerParamDef[] = [
  P('gpuRackKw', 'GPU rack load', 'space', 'number', { unit: 'kW', min: 10, max: 150, derived: 'site type density band', help: 'Nominal load of a GPU rack; scaled so all classes add up to the design load.' }),
  P('computeRackKw', 'Compute rack load', 'space', 'number', { unit: 'kW', min: 3, max: 40, derived: 'site type density band' }),
  P('storageRackKw', 'Storage rack load', 'space', 'number', { unit: 'kW', min: 2, max: 20, derived: 'site type density band' }),
];
const BUILDING: T.PlannerParamDef[] = [
  P('plantM2PerMw', 'Plant rooms per MW', 'space', 'number', { unit: 'm² per facility MW', default: 600, min: 200, max: 1500, help: 'Electrical rooms, UPS and battery rooms, mechanical rooms and galleries inside the building.' }),
  P('yardM2PerMw', 'Plant yard per MW', 'space', 'number', { unit: 'm² per facility MW', default: 250, min: 50, max: 800, help: 'Generators, transformers and heat rejection outside the building.' }),
  P('minHallM2', 'Smallest workable hall', 'space', 'number', { unit: 'm²', default: 250, min: 100, max: 2000, help: 'Below this a hall cannot hold rows, containment and CDUs sensibly.' }),
];
/* ── finance ── */
const LAND_SHELL: T.PlannerParamDef[] = [
  P('landCostUsd', 'Land cost', 'finance', 'number', { unit: 'USD', min: 0, help: 'Purchase price of the plot (0 if already owned).' }),
  P('shellCostPerM2', 'Shell and core cost', 'finance', 'number', { unit: 'USD per m² gross', default: 1800, min: 600, max: 5000, help: 'Building structure, envelope and core; the CapEx per kW covers MEP and fit-out only.' }),
];
const FINANCE: T.PlannerParamDef[] = [
  P('costContingencyPct', 'Cost contingency', 'finance', 'number', { unit: '% of works', default: 10, min: 0, max: 30, help: 'Risk allowance on MEP, fit-out and shell; shown as its own line.' }),
  P('hurdlePct', 'Hurdle rate', 'finance', 'number', { unit: '%', default: 8, min: 0, max: 25, help: 'Discount rate for NPV; the IRR is compared with it.' }),
  P('taxRatePct', 'Tax rate', 'finance', 'number', { unit: '%', default: 25, min: 0, max: 45 }),
  P('horizonYears', 'Business case horizon', 'finance', 'number', { unit: 'years', default: 15, min: 5, max: 30 }),
];
const REVENUE: T.PlannerParamDef[] = [
  P('fillRampMonths', 'Months to target fill', 'finance', 'number', { unit: 'months', default: 18, min: 0, max: 60, help: 'Capacity sold rises in a straight line from go-live (plus any pre-let) to the target fill.' }),
  P('targetFillPct', 'Target fill', 'finance', 'number', { unit: '%', default: 85, min: 30, max: 100 }),
  P('itDrawPct', 'IT draw of sold capacity', 'finance', 'number', { unit: '%', default: 70, min: 20, max: 100, help: 'Energy follows what the IT really draws, not the contracted kW.' }),
  P('anchorKw', 'Anchor contract', 'finance', 'number', { unit: 'kW', min: 0, help: 'Capacity signed by an anchor customer; counts as committed from go-live.' }),
  P('preLetPct', 'Pre-let share of each phase', 'finance', 'number', { unit: '%', min: 0, max: 100, help: 'Share sold before go-live.' }),
  P('mepLifeYears', 'MEP depreciation life', 'finance', 'number', { unit: 'years', default: 18, min: 10, max: 25 }),
  P('shellLifeYears', 'Shell depreciation life', 'finance', 'number', { unit: 'years', default: 30, min: 20, max: 50 }),
];
/* ── network, operations, supply ── */
const WAN: T.PlannerParamDef[] = [
  P('dciGbpsRequired', 'WAN and interconnect capacity', 'network', 'number', { unit: 'Gbps', min: 0, max: 50000, derived: 'from the workload: about 2 Gbps per MW for GPU training, 10 for general compute', help: 'Priced from the company\'s own circuits ($ per Gbps per month).' }),
];
const OPS: T.PlannerParamDef[] = [
  P('mwPerShiftSeat', 'MW per round-the-clock seat', 'operations', 'number', { unit: 'MW', default: 8, min: 2, max: 30, help: 'Each 24/7 seat needs 5.2 FTE (shifts, leave, training).' }),
  P('dayRolesPerMw', 'Day roles per MW', 'operations', 'number', { unit: 'FTE/MW', default: 0.15, min: 0, max: 1, help: 'Engineers, planners and managers working days; site manager and chief engineer added from 5 MW.' }),
];
const SUPPLY: T.PlannerParamDef[] = [
  P('stockHoldWeeks', 'Hold stock within', 'supply', 'number', { unit: 'weeks of need', default: 12, min: 2, max: 52, help: 'Stock is reserved only this close to the need date; earlier needs are planned as later holds so warranty does not run on idle kit.' }),
];

const BUILD_ALL = [...POWER, ...COOLING, ...CLASSES, ...BUILDING, ...LAND_SHELL, ...FINANCE, ...REVENUE, ...WAN, ...OPS, ...SUPPLY];
const BENCH: BenchmarkSeed[] = [
  { metric: 'leadWeeks:HV substation', label: 'Lead time · HV substation and grid transformers', category: 'leadtime', unit: 'weeks', low: 78, high: 156, value: 110, source: 'Transmission operator connection timelines and transformer maker quotes 2026 (18 to 36 months)', indicative: false },
  { metric: 'leadWeeks:Dry cooler', label: 'Lead time · Dry or adiabatic cooler', category: 'leadtime', unit: 'weeks', low: 16, high: 26, value: 20, source: 'Supplier quotes 2026', indicative: false },
  { metric: 'designDryBulbC', label: 'Design dry-bulb, cold climate', category: 'sizing', unit: '°C', value: 27, appliesTo: { climate: 'cold' }, source: 'ASHRAE 0.4% cooling design day (Stockholm, Dublin)' },
  { metric: 'designWetBulbC', label: 'Design wet-bulb, cold climate', category: 'sizing', unit: '°C', value: 18, appliesTo: { climate: 'cold' }, source: 'ASHRAE 0.4% evaporation design day (Stockholm, Dublin)' },
  { metric: 'designDryBulbC', label: 'Design dry-bulb, temperate climate', category: 'sizing', unit: '°C', value: 32, appliesTo: { climate: 'temperate' }, source: 'ASHRAE 0.4% cooling design day (Frankfurt, Ashburn)' },
  { metric: 'designWetBulbC', label: 'Design wet-bulb, temperate climate', category: 'sizing', unit: '°C', value: 21, appliesTo: { climate: 'temperate' }, source: 'ASHRAE 0.4% evaporation design day (Frankfurt, Ashburn)' },
  { metric: 'designDryBulbC', label: 'Design dry-bulb, hot and dry climate', category: 'sizing', unit: '°C', value: 43, appliesTo: { climate: 'hot-dry' }, source: 'ASHRAE 0.4% cooling design day (Phoenix, Riyadh)' },
  { metric: 'designWetBulbC', label: 'Design wet-bulb, hot and dry climate', category: 'sizing', unit: '°C', value: 23, appliesTo: { climate: 'hot-dry' }, source: 'ASHRAE 0.4% evaporation design day (Phoenix, Riyadh)' },
  { metric: 'designDryBulbC', label: 'Design dry-bulb, hot and humid climate', category: 'sizing', unit: '°C', value: 36, appliesTo: { climate: 'hot-humid' }, source: 'ASHRAE 0.4% cooling design day (Singapore, Houston)' },
  { metric: 'designWetBulbC', label: 'Design wet-bulb, hot and humid climate', category: 'sizing', unit: '°C', value: 28, appliesTo: { climate: 'hot-humid' }, source: 'ASHRAE 0.4% evaporation design day (Singapore, Houston)' },
  { metric: 'shellCostPerM2', label: 'Shell and core per m² gross', category: 'cost', unit: 'USD/m²', low: 1200, high: 2600, value: 1800, source: 'Cost consultant benchmark 2026 (Europe and North America)' },
  { metric: 'plantM2PerMw', label: 'Plant rooms per facility MW', category: 'sizing', unit: 'm²/MW', low: 400, high: 900, value: 600, source: 'Design standard: electrical, battery and mechanical rooms and galleries' },
  { metric: 'usdPerGbpsMonth', label: 'WAN and interconnect price', category: 'cost', unit: 'USD/Gbps/month', low: 150, high: 650, value: 250, source: 'Carrier price book 2026; replaced by the average of recorded circuits when present' },
  { metric: 'crossConnectUsdMonth', label: 'Carrier cross-connect', category: 'cost', unit: 'USD/month', low: 300, high: 700, value: 450, source: 'Colocation price lists 2026' },
  { metric: 'hireLeadMonths:key', label: 'Hiring lead · site manager, engineers, shift leads', category: 'staffing', unit: 'months', low: 6, high: 9, value: 9, source: 'HR benchmark 2026: recruit, train, write SOPs before go-live' },
  { metric: 'hireLeadMonths:tech', label: 'Hiring lead · technicians', category: 'staffing', unit: 'months', low: 2, high: 4, value: 3, source: 'HR benchmark 2026' },
  { metric: 'hurdlePct', label: 'Hurdle rate (WACC plus risk)', category: 'cost', unit: '%', low: 7, high: 12, value: 8, source: 'Corporate finance policy 2026' },
  { metric: 'depreciationYears:mep', label: 'Depreciation life · MEP plant', category: 'cost', unit: 'years', low: 15, high: 20, value: 18, source: 'Accounting policy' },
  { metric: 'depreciationYears:shell', label: 'Depreciation life · building shell', category: 'cost', unit: 'years', low: 25, high: 40, value: 30, source: 'Accounting policy' },
];

const ALL_SCOPES: T.PlannerScope[] = ['rack', 'pod', 'hall', 'retrofit', 'plant', 'network', 'expansion', 'new-dc', 'portfolio', 'migration', 'edge', 'server-refresh', 'network-refresh', 'rack-replace'];

export const coreSeed: ScopeSeed = {
  // IT is priced from the catalogue quantity model (servers per rack × model price), not a price per rack.
  exclude: Object.fromEntries(ALL_SCOPES.map(s => [s, ['itCapexPerRack']])) as ScopeSeed['exclude'],
  params: {
    'new-dc': BUILD_ALL,
    expansion: BUILD_ALL,
    portfolio: [...POWER.filter(p => ['gridOfferMva', 'peakPueFactor', 'powerFactor'].includes(p.key)), ...LAND_SHELL, ...FINANCE, ...REVENUE, ...WAN, ...OPS],
    hall: [...COOLING, ...CLASSES, ...FINANCE, ...REVENUE.filter(p => !['shellLifeYears'].includes(p.key)), ...SUPPLY],
    pod: [...COOLING, ...CLASSES, ...FINANCE.filter(p => p.key !== 'horizonYears'), ...SUPPLY],
    retrofit: [...COOLING, ...FINANCE, ...SUPPLY],
    plant: [...POWER.filter(p => ['peakPueFactor', 'powerFactor', 'transformerKva', 'upsModuleKw', 'generatorKva'].includes(p.key)), ...FINANCE, ...SUPPLY],
    edge: [...FINANCE, ...SUPPLY],
    network: [...FINANCE, ...SUPPLY],
    migration: [...FINANCE.filter(p => p.key !== 'costContingencyPct')],
    'server-refresh': [...FINANCE.filter(p => p.key !== 'costContingencyPct'), ...SUPPLY],
    'network-refresh': [...FINANCE.filter(p => p.key !== 'costContingencyPct'), ...SUPPLY],
    'rack-replace': [...FINANCE.filter(p => p.key !== 'costContingencyPct'), ...SUPPLY],
  },
  rules: [
    { rule: { id: 'R-SPC-03', aspect: 'space', severity: 'soft', title: 'Every hall is large enough for rows, containment and CDUs', check: 'hall-min-size', standard: 'Organisation design standard' }, scopes: ['new-dc', 'expansion'] },
    { rule: { id: 'R-FIN-04', aspect: 'finance', severity: 'soft', title: 'Bill of materials reconciles with the estimate within 15%', check: 'bom-reconciliation', threshold: 15, standard: 'Investment governance' }, scopes: ['new-dc', 'expansion', 'portfolio'] },
  ],
  benchmarks: BENCH,
};
