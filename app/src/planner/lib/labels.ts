/* Plain-language labels for the Templates and Benchmarks tabs. The engine keys (capexPerKw,
   liquid-to-chip, leadWeeks:…) never reach the screen; these maps translate them. */
import type * as T from '../p2b/types';

export const COOLING_LABEL: Record<T.PlannerCoolingType, string> = {
  'air-crah': 'Air (CRAH)', 'air-economiser': 'Air with free cooling', 'chilled-water': 'Chilled water', 'in-row': 'In-row', 'rear-door': 'Rear-door heat exchanger', 'liquid-to-chip': 'Liquid to chip', immersion: 'Immersion',
};
export const COOLING_ORDER: T.PlannerCoolingType[] = ['air-crah', 'air-economiser', 'chilled-water', 'in-row', 'rear-door', 'liquid-to-chip', 'immersion'];
export const CLIMATE_LABEL: Record<string, string> = { cold: 'Cold', temperate: 'Temperate', 'hot-dry': 'Hot and dry', 'hot-humid': 'Hot and humid' };
export const CLIMATE_ORDER = ['cold', 'temperate', 'hot-dry', 'hot-humid'];

/** What each benchmark metric means, in one line, and how the planner uses it. */
export const METRIC_INFO: Record<string, { name: string; use: string }> = {
  capexPerKw: { name: 'Build cost per kW', use: 'Plant and fit-out cost for each kW of IT load, excluding land and IT equipment.' },
  itCapexPerRack: { name: 'IT equipment per rack', use: 'Servers, storage and switches in one rack, when the operator owns the IT.' },
  maintenancePctCapex: { name: 'Yearly maintenance', use: 'Service contracts as a share of plant cost per year.' },
  staffCostFte: { name: 'Cost of one engineer', use: 'Fully loaded yearly cost of one full-time engineer.' },
  tariff: { name: 'Energy price', use: 'Price of electricity per kWh in the region.' },
  pue: { name: 'PUE', use: 'Total facility power divided by IT power. Lower is better; 1.0 is perfect.' },
  staffPerMw: { name: 'Engineers per MW', use: 'Operations staff needed for each MW of IT load.' },
  whiteSpaceM2PerRack: { name: 'Floor space per rack', use: 'White space each rack needs, including aisles.' },
  floorLoadingKgPerRack: { name: 'Floor loading per rack', use: 'Weight the floor must carry under a loaded rack.' },
  generatorMargin: { name: 'Generator margin', use: 'Generators are sized to this multiple of the IT load.' },
  coolingMargin: { name: 'Cooling margin', use: 'Cooling is sized to this multiple of the IT load.' },
  liquidThresholdKw: { name: 'Liquid cooling threshold', use: 'Above this kW per rack, air cooling is no longer practical.' },
  racksPerLeafPair: { name: 'Racks per switch pair', use: 'Racks served by one pair of leaf switches.' },
  carbonKgPerKwh: { name: 'Grid carbon intensity', use: 'Carbon emitted per kWh drawn from the grid.' },
  wue: { name: 'WUE', use: 'Litres of water used per kWh of IT energy.' },
  leadWeeks: { name: 'Lead time', use: 'Weeks from order to delivery on site.' },
  durationWeeks: { name: 'Build duration', use: 'Weeks from start to the first hall ready for service.' },
};
export const metricKey = (metric: string) => metric.split(':')[0];
export const metricDetail = (metric: string) => metric.split(':')[1] ?? '';

/** Short, readable source: drop parentheses and long tails. */
export const shortSource = (s: string) => { const t = s.replace(/\s*\(.*?\)\s*/g, ' ').trim(); return t.length > 42 ? `${t.slice(0, 40)}…` : t; };
export const fmtMonthYear = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—');
export const fmtVal = (n?: number, digits = 2) => (n === undefined ? '—' : Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: digits }));

/** Rule check keys turned into one plain sentence of what is checked. */
export const RULE_PLAIN: Record<string, string> = {
  'feeds-cover-load': 'Utility feeds can carry the full load with margin.',
  'ups-redundancy': 'UPS capacity matches the chosen redundancy.',
  'generator-margin': 'Generators can carry the load with margin.',
  'fuel-hours': 'Enough fuel on site for the tier.',
  'cooling-n1': 'Cooling still covers the load with one unit lost.',
  'liquid-above-density': 'Racks above the threshold use liquid cooling.',
  'inlet-envelope': 'Inlet temperature stays inside the recommended range.',
  'hall-load-band': 'Hall size fits the band for this site type.',
  'floor-loading': 'The floor can carry liquid-cooled racks.',
  'carrier-diversity': 'At least two separate carriers enter the site.',
  'oversub-gpu': 'Network oversubscription is low enough for GPU work.',
  'tier-redundancy': 'Power redundancy matches the tier.',
  'pue-benchmark': 'PUE target is inside the benchmark range.',
  'capex-benchmark': 'Cost per kW is inside the benchmark range.',
  payback: 'Payback is within eight years.',
  'lead-times': 'Long-lead equipment can arrive before it is needed.',
  'civil-before-fitout': 'Fit-out waits for the building to be ready.',
  staffing: 'Staffing per MW is inside the benchmark range.',
  'permits-before-gates': 'Permits can be obtained before their gate.',
  'commissioning-level': 'Commissioning depth fits the scope.',
  'risk-owners': 'Every high-impact risk has an owner and a mitigation.',
  'reporting-enabled': 'Energy and PUE reporting is switched on.',
};
