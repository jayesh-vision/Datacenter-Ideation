/**
 * Seed · planner templates, benchmarks, plans, scenarios and feedback.
 *
 * The planner proposes nothing from code: every default, rule and reference value is a
 * template or a benchmark record here, with a source and a date. Plans cover every scope
 * from a single rack placement to a 50 MW greenfield site, in every status, so the wizard,
 * the scenario studio and the AI panels have real material to show.
 */
import type { Seed } from './ctx';
import { CAMPUS_CLIMATE, ASH_CAMPUS_INTAKE_KW } from './realism';
import { seedPlanGovernance } from './plannerGovernance';
import * as T from '../../../planner/p2b/types';
import { DC_TYPE_CATALOG } from '../../../planner/p2b/dcTypes';
import { SCOPE_SEEDS, familyAspects, familyApproval, familyDropRules, familyExclude, familyOutputs, familyParams, familyRules } from './plannerScopes';

const ASPECTS: T.PlannerAspect[] = ['space', 'power', 'cooling', 'network', 'it', 'fire', 'security', 'sustainability', 'resilience', 'operations', 'supply', 'schedule', 'finance', 'compliance', 'commissioning', 'migration', 'risk'];
const P = (key: string, label: string, aspect: T.PlannerAspect, type: T.PlannerParamDef['type'], extra: Partial<T.PlannerParamDef> = {}): T.PlannerParamDef => ({ key, label, aspect, type, ...extra });

/** Core parameter set every plan template shares; scope templates narrow it. */
export const CORE_PARAMS: T.PlannerParamDef[] = [
  P('densityKwPerRack', 'Design density', 'space', 'number', { unit: 'kW/rack', default: 12, min: 2, max: 120, help: 'Average IT load per rack at full fit-out' }),
  P('hallDesignKw', 'Hall design load', 'space', 'number', { unit: 'kW', default: 1500, min: 100, max: 6000, help: 'IT load one hall is designed to carry' }),
  P('hallsPerFloor', 'Halls per floor', 'space', 'number', { default: 3, min: 1, max: 8, help: 'Data halls side by side on one floor' }),
  P('floorsPerBuilding', 'Floors per building', 'space', 'number', { default: 2, min: 1, max: 6, help: 'Data hall floors stacked in one building' }),
  P('supportSpaceRatio', 'Gross area per m² of white space', 'space', 'number', { unit: 'm²', default: 2.4, min: 1.5, max: 4, help: 'Adds plant rooms, corridors, loading, offices and plant yard to the white space' }),
  P('whiteSpaceM2PerRack', 'White space per rack', 'space', 'number', { unit: 'm²', default: 2.6, min: 1.8, max: 4, help: 'Includes aisles and containment' }),
  P('floorLoadingKgPerRack', 'Floor loading', 'space', 'number', { unit: 'kg/rack', default: 1200, min: 600, max: 2500 }),
  P('tier', 'Target tier', 'resilience', 'select', { options: ['Tier II', 'Tier III', 'Tier IV'], default: 'Tier III' }),
  P('redundancy', 'Power redundancy', 'power', 'select', { options: ['N', 'N+1', '2N', '2N+1'], default: '2N' }),
  P('feedVoltage', 'Utility intake', 'power', 'select', { options: ['400', '11000', '33000', '132000'], default: '33000', unit: 'V' }),
  P('upsRuntimeMin', 'UPS runtime to generator', 'power', 'number', { unit: 'min', default: 12, min: 5, max: 60 }),
  P('generatorFuelHours', 'Generator fuel on site', 'power', 'number', { unit: 'h', default: 48, min: 8, max: 96 }),
  P('coolingType', 'Cooling type', 'cooling', 'select', { options: ['air-crah', 'air-economiser', 'chilled-water', 'in-row', 'rear-door', 'liquid-to-chip', 'immersion'], default: 'chilled-water' }),
  P('coolingRedundancy', 'Cooling redundancy', 'cooling', 'select', { options: ['N', 'N+1', '2N'], default: 'N+1' }),
  P('inletSetpointC', 'Inlet setpoint', 'cooling', 'number', { unit: '°C', default: 24, min: 18, max: 32 }),
  P('pueTarget', 'PUE target', 'sustainability', 'number', { default: 1.3, min: 1.05, max: 2, derived: 'benchmark for cooling type and climate' }),
  P('renewableSharePct', 'Renewable energy share', 'sustainability', 'number', { unit: '%', default: 60, min: 0, max: 100 }),
  P('racksPerLeafPair', 'Racks per leaf pair', 'network', 'number', { default: 16, min: 4, max: 40 }),
  P('uplinksPerLeaf', 'Uplinks per leaf', 'network', 'number', { default: 4, min: 2, max: 8 }),
  P('uplinkGbps', 'Uplink speed', 'network', 'select', { options: ['100', '400', '800'], default: '400', unit: 'Gbps' }),
  P('oversubscription', 'Oversubscription', 'network', 'number', { default: 3, min: 1, max: 8, help: 'Access to uplink ratio' }),
  P('carrierCount', 'Carriers', 'network', 'number', { default: 3, min: 1, max: 8 }),
  P('operatorOwnedIt', 'Operator owns the IT', 'it', 'bool', { default: true }),
  P('refreshYears', 'IT refresh cycle', 'it', 'number', { unit: 'years', default: 5, min: 3, max: 8 }),
  P('suppressionType', 'Fire suppression', 'fire', 'select', { options: ['Clean agent gas', 'Pre-action water', 'Water mist', 'Hybrid'], default: 'Clean agent gas' }),
  P('securityZones', 'Security zones', 'security', 'number', { default: 4, min: 2, max: 6, help: 'Perimeter, lobby, hall, cage, plant' }),
  P('staffPerMw', 'Operations staff per MW', 'operations', 'number', { unit: 'FTE/MW', default: 0.8, min: 0.2, max: 3 }),
  P('sparesPct', 'Spares held', 'operations', 'number', { unit: '% of installed', default: 3, min: 1, max: 10 }),
  P('contingencyPct', 'Schedule contingency', 'schedule', 'number', { unit: '%', default: 15, min: 0, max: 50 }),
  P('capexPerKw', 'CapEx per kW (excl. land, IT)', 'finance', 'number', { unit: 'USD/kW', default: 3400, min: 1500, max: 8000, derived: 'benchmark for site type' }),
  P('itCapexPerRack', 'IT CapEx per rack', 'finance', 'number', { unit: 'USD/rack', default: 180000, min: 20000, max: 900000 }),
  P('tariffUsdPerKwh', 'Energy tariff', 'finance', 'number', { unit: 'USD/kWh', default: 0.11, min: 0.03, max: 0.4 }),
  P('maintenancePctCapex', 'Plant maintenance', 'finance', 'number', { unit: '% of plant CapEx / year', default: 2.5, min: 1, max: 6 }),
  P('leaseUsdPerM2Year', 'Property cost', 'finance', 'number', { unit: 'USD/m²/year', default: 180, min: 0, max: 900 }),
  P('revenuePerKwMonth', 'Revenue or chargeback', 'finance', 'number', { unit: 'USD/kW/month', default: 160, min: 0, max: 600 }),
  P('reservePct', 'Capacity reserve policy', 'finance', 'number', { unit: '%', default: 15, min: 0, max: 30 }),
  P('commissioningLevel', 'Commissioning level required', 'commissioning', 'select', { options: ['3', '4', '5'], default: '5' }),
];

/** Inputs only some plan types ask for: how much is wanted is expressed differently per scope. */
export const SCOPE_PARAMS: Partial<Record<T.PlannerScope, T.PlannerParamDef[]>> = {
  rack: [P('rackCount', 'Racks needed', 'space', 'number', { default: 1, min: 1, max: 4 }), P('rackUnitsNeeded', 'Rack units per rack', 'space', 'number', { unit: 'U', default: 10, min: 1, max: 52 }), P('portsPerRack', 'Network ports per rack', 'network', 'number', { default: 4, min: 1, max: 96 })],
  pod: [P('rackCount', 'Racks needed', 'space', 'number', { default: 24, min: 4, max: 80 }), P('rackUnitsNeeded', 'Rack units per rack', 'space', 'number', { unit: 'U', default: 42, min: 10, max: 52 }), P('cageRequired', 'Caged area', 'security', 'bool', { default: true })],
  edge: [P('siteCount', 'Number of sites', 'space', 'number', { default: 10, min: 1, max: 500 }), P('kwPerSite', 'IT load per site', 'space', 'number', { unit: 'kW', default: 40, min: 5, max: 500 })],
  network: [P('dciGbpsRequired', 'Interconnect capacity needed', 'network', 'number', { unit: 'Gbps', default: 800, min: 100, max: 12800 }), P('diversePaths', 'Diverse fibre paths', 'network', 'number', { default: 2, min: 1, max: 4 })],
  migration: [P('racksToMove', 'Racks to move', 'migration', 'number', { default: 15, min: 1, max: 2000 }), P('cutoverWindowHours', 'Cut-over window', 'migration', 'number', { unit: 'h', default: 6, min: 1, max: 72 }), P('dataDisposal', 'Certified data disposal', 'migration', 'bool', { default: true })],
  retrofit: [P('liquidRacks', 'Racks moving to liquid cooling', 'cooling', 'number', { default: 20, min: 1, max: 400 })],
  plant: [P('plantItems', 'What is being added', 'power', 'select', { options: ['UPS modules', 'Generators', 'Chillers', 'Transformers', 'Mixed'], default: 'Mixed' })],
  'server-refresh': [
    P('replacementModel', 'Replace with', 'it', 'select', { options: ['PowerEdge R760', 'ProLiant DL380 Gen11', 'PowerEdge XE9680', 'DGX H100', 'SYS-821GE GPU SuperServer', 'FlashArray //X70', 'AFF A400'], default: 'PowerEdge R760', help: 'Current model from the approved catalogue' }),
    P('consolidationRatio', 'Old servers per new server', 'it', 'number', { default: 2, min: 1, max: 6, help: 'Newer servers do the work of several old ones' }),
    P('oldEquipment', 'Old equipment', 'migration', 'select', { options: ['Certified disposal', 'Keep as spares', 'Resell'], default: 'Certified disposal' }),
    P('migrationApproach', 'How workloads move', 'migration', 'select', { options: ['Rolling, rack by rack', 'Parallel run, then switch', 'Single window'], default: 'Rolling, rack by rack' }),
    P('racksPerWave', 'Racks per change window', 'migration', 'number', { default: 4, min: 1, max: 40 }),
  ],
  'network-refresh': [
    P('replacementModel', 'Replace with', 'network', 'select', { options: ['7050X3-48YC8', 'QFX5120-48Y', 'Nexus 9336C-FX2', 'Catalyst 9300-48P', 'ASR 9006', 'MX480', 'PA-5450'], default: '7050X3-48YC8', help: 'Current model from the approved catalogue' }),
    P('opticsReusePct', 'Optics reused', 'network', 'number', { unit: '%', default: 60, min: 0, max: 100, help: 'Share of existing transceivers that fit the new switches' }),
    P('oldEquipment', 'Old equipment', 'migration', 'select', { options: ['Certified disposal', 'Keep as spares', 'Resell'], default: 'Certified disposal' }),
    P('racksPerWave', 'Devices per change window', 'migration', 'number', { default: 6, min: 1, max: 40 }),
  ],
  'rack-replace': [
    P('rackModel', 'New rack', 'space', 'select', { options: ['NetShelter SX 48U', 'VR3300 42U', 'TS IT 45U'], default: 'NetShelter SX 48U' }),
    P('replacePdus', 'Replace rack power strips', 'power', 'bool', { default: true }),
    P('reRack', 'Re-rack the existing equipment', 'migration', 'bool', { default: true, help: 'Off means the equipment is replaced too (plan a server refresh)' }),
    P('oldEquipment', 'Old racks', 'migration', 'select', { options: ['Certified disposal', 'Keep as spares', 'Resell'], default: 'Certified disposal' }),
    P('racksPerWave', 'Racks per change window', 'migration', 'number', { default: 2, min: 1, max: 20 }),
  ],
};
/** Site-wide inputs that do not apply to a plan type working inside an existing site, or that it estimates bottom-up. */
const SCOPE_EXCLUDE: Partial<Record<T.PlannerScope, string[]>> = {
  rack: ['feedVoltage', 'upsRuntimeMin', 'generatorFuelHours', 'coolingRedundancy', 'inletSetpointC', 'racksPerLeafPair', 'uplinksPerLeaf', 'oversubscription', 'carrierCount', 'uplinkGbps', 'capexPerKw', 'maintenancePctCapex', 'leaseUsdPerM2Year', 'reservePct', 'revenuePerKwMonth', 'contingencyPct', 'whiteSpaceM2PerRack', 'refreshYears', 'securityZones'],
  pod: ['feedVoltage', 'upsRuntimeMin', 'generatorFuelHours', 'carrierCount', 'capexPerKw', 'leaseUsdPerM2Year', 'reservePct'],
  hall: ['feedVoltage', 'generatorFuelHours', 'carrierCount', 'leaseUsdPerM2Year'],
  retrofit: ['feedVoltage', 'generatorFuelHours', 'leaseUsdPerM2Year', 'whiteSpaceM2PerRack'],
  plant: ['revenuePerKwMonth', 'leaseUsdPerM2Year', 'itCapexPerRack'],
  network: ['capexPerKw', 'maintenancePctCapex', 'leaseUsdPerM2Year', 'reservePct', 'itCapexPerRack', 'revenuePerKwMonth'],
  migration: ['capexPerKw', 'revenuePerKwMonth', 'reservePct', 'maintenancePctCapex', 'leaseUsdPerM2Year', 'whiteSpaceM2PerRack'],
  'server-refresh': ['feedVoltage', 'upsRuntimeMin', 'generatorFuelHours', 'coolingRedundancy', 'inletSetpointC', 'hallDesignKw', 'carrierCount', 'capexPerKw', 'maintenancePctCapex', 'leaseUsdPerM2Year', 'reservePct', 'revenuePerKwMonth', 'renewableSharePct', 'pueTarget', 'racksPerLeafPair', 'uplinksPerLeaf', 'oversubscription', 'whiteSpaceM2PerRack', 'densityKwPerRack', 'itCapexPerRack', 'staffPerMw', 'sparesPct', 'coolingType', 'tier', 'redundancy', 'floorLoadingKgPerRack', 'operatorOwnedIt'],
  'network-refresh': ['feedVoltage', 'upsRuntimeMin', 'generatorFuelHours', 'coolingRedundancy', 'inletSetpointC', 'hallDesignKw', 'carrierCount', 'capexPerKw', 'maintenancePctCapex', 'leaseUsdPerM2Year', 'reservePct', 'revenuePerKwMonth', 'renewableSharePct', 'pueTarget', 'racksPerLeafPair', 'uplinksPerLeaf', 'oversubscription', 'whiteSpaceM2PerRack', 'densityKwPerRack', 'itCapexPerRack', 'staffPerMw', 'sparesPct', 'coolingType', 'tier', 'redundancy', 'floorLoadingKgPerRack', 'operatorOwnedIt', 'refreshYears'],
  'rack-replace': ['feedVoltage', 'upsRuntimeMin', 'generatorFuelHours', 'coolingRedundancy', 'inletSetpointC', 'hallDesignKw', 'carrierCount', 'capexPerKw', 'maintenancePctCapex', 'leaseUsdPerM2Year', 'reservePct', 'revenuePerKwMonth', 'renewableSharePct', 'pueTarget', 'racksPerLeafPair', 'uplinksPerLeaf', 'oversubscription', 'whiteSpaceM2PerRack', 'densityKwPerRack', 'itCapexPerRack', 'staffPerMw', 'sparesPct', 'coolingType', 'tier', 'operatorOwnedIt', 'refreshYears'],
};
/** Building inputs only apply where we build: halls per floor, floors, support space. */
const BUILDING_KEYS = ['hallsPerFloor', 'floorsPerBuilding', 'supportSpaceRatio'];
const BUILDS = (scope: T.PlannerScope) => scope === 'new-dc' || scope === 'expansion' || scope === 'portfolio';
/** A plan template carries only the inputs for the areas it covers, plus its own scope inputs. */
export function paramsForScope(scope: T.PlannerScope, aspects: Partial<Record<T.PlannerAspect, T.PlannerAspectDepth>>): T.PlannerParamDef[] {
  const covered = (a: T.PlannerAspect) => aspects[a] && aspects[a] !== 'skipped';
  const exclude = [...(SCOPE_EXCLUDE[scope] ?? []), ...familyExclude(scope)];
  const core = CORE_PARAMS.filter(p => covered(p.aspect) && (BUILDS(scope) || !BUILDING_KEYS.includes(p.key)) && !((scope === 'rack' || scope === 'pod' || scope === 'edge') && p.key === 'hallDesignKw') && !exclude.includes(p.key));
  // Family inputs replace core or scope inputs with the same key.
  const fam = familyParams(scope);
  const scoped = (SCOPE_PARAMS[scope] ?? []).filter(p => covered(p.aspect) || p.aspect === 'space');
  return [...[...core, ...scoped].filter(p => !fam.some(f => f.key === p.key)), ...fam];
}

const RULE = (id: string, aspect: T.PlannerAspect, severity: T.PlannerRuleSeverity, title: string, check: string, extra: Partial<T.PlannerRuleDef> = {}): T.PlannerRuleDef => ({ id, aspect, severity, title, check, ...extra });
export const CORE_RULES: T.PlannerRuleDef[] = [
  RULE('R-PWR-01', 'power', 'hard', 'Utility feeds cover design load with margin', 'feeds-cover-load', { threshold: 1.1, standard: 'Organisation design standard' }),
  RULE('R-PWR-02', 'power', 'hard', 'UPS or DC plant sized for the redundancy pattern', 'ups-redundancy', { standard: 'Uptime Institute tier definitions' }),
  RULE('R-PWR-03', 'power', 'soft', 'Generators cover full load with 25% margin', 'generator-margin', { threshold: 1.25, standard: 'Organisation design standard' }),
  RULE('R-PWR-04', 'power', 'soft', 'Generator fuel for at least 24 hours (48 for Tier IV)', 'fuel-hours', { threshold: 24 }),
  RULE('R-COOL-01', 'cooling', 'hard', 'Cooling capacity covers IT load with one unit lost', 'cooling-n1', { threshold: 1.1, standard: 'Organisation design standard' }),
  RULE('R-COOL-02', 'cooling', 'hard', 'Liquid cooling above 30 kW per rack', 'liquid-above-density', { threshold: 30, standard: 'Organisation design standard' }),
  RULE('R-COOL-03', 'cooling', 'soft', 'Inlet setpoint within the recommended envelope (18 to 27 °C)', 'inlet-envelope', { threshold: 27, standard: 'ASHRAE thermal guidelines (recommended envelope)' }),
  RULE('R-SPC-01', 'space', 'hard', 'Hall design load within the type band', 'hall-load-band', { standard: 'Site type profile' }),
  RULE('R-SPC-02', 'space', 'soft', 'Floor loading sufficient for liquid-cooled racks', 'floor-loading', { threshold: 1400 }),
  RULE('R-NET-01', 'network', 'hard', 'Two diverse carrier entries', 'carrier-diversity', { threshold: 2, standard: 'Organisation design standard' }),
  RULE('R-NET-02', 'network', 'soft', 'Oversubscription at or below 3:1 for GPU halls', 'oversub-gpu', { threshold: 3 }),
  RULE('R-RES-01', 'resilience', 'hard', 'Redundancy pattern matches the target tier', 'tier-redundancy', { standard: 'Uptime Institute tier definitions' }),
  RULE('R-SUS-01', 'sustainability', 'soft', 'PUE target within the benchmark band for the cooling type and climate', 'pue-benchmark', { standard: 'Organisation benchmark set' }),
  RULE('R-FIN-01', 'finance', 'soft', 'CapEx per kW within the benchmark band', 'capex-benchmark', { standard: 'Organisation benchmark set' }),
  RULE('R-FIN-02', 'finance', 'soft', 'Payback under 8 years', 'payback', { threshold: 96 }),
  RULE('R-SCH-01', 'schedule', 'hard', 'Long-lead equipment ordered before the need date', 'lead-times', { standard: 'Supplier lead-time benchmarks' }),
  RULE('R-SCH-02', 'schedule', 'hard', 'No fit-out before the civil shell milestone', 'civil-before-fitout'),
  RULE('R-OPS-01', 'operations', 'soft', 'Staffing within the benchmark for the tier', 'staffing', { standard: 'Organisation benchmark set' }),
  RULE('R-CMP-01', 'compliance', 'hard', 'Every permit obtained before the gate that needs it', 'permits-before-gates'),
  RULE('R-CMS-01', 'commissioning', 'hard', 'Power and cooling reach the required commissioning level before go-live', 'commissioning-level'),
  RULE('R-RSK-01', 'risk', 'soft', 'Every high-impact risk has an owner and a mitigation', 'risk-owners'),
];

const SCOPES: { scope: T.PlannerScope; name: string; description: string; executesAs: T.PlannerTemplate['executesAs']; blueprintKey?: string; aspects: Partial<Record<T.PlannerAspect, T.PlannerAspectDepth>>; approval: string[] }[] = [
  { scope: 'rack', name: 'Rack placement', description: 'Place one rack of equipment: which rack, outlets, ports, VLAN and addresses.', executesAs: 'change', aspects: { space: 'full', power: 'summary', cooling: 'summary', network: 'full', it: 'full', security: 'summary', finance: 'summary', schedule: 'summary' }, approval: ['Capacity planner'] },
  { scope: 'pod', name: 'Pod, row or cage', description: '10 to 60 racks for a team or tenant: row position, containment, PDUs, leaves, cage fencing.', executesAs: 'project', aspects: { space: 'full', power: 'full', cooling: 'full', network: 'full', it: 'full', security: 'full', finance: 'full', schedule: 'full', commissioning: 'summary', risk: 'summary' }, approval: ['Capacity planner', 'Facility manager'] },
  { scope: 'hall', name: 'Hall fit-out', description: 'Open a hall: layout, density classes, cooling, PDUs, trunks, fabric, commissioning levels.', executesAs: 'project', blueprintKey: 'greenfield-dc', aspects: Object.fromEntries(ASPECTS.map(a => [a, a === 'migration' ? 'skipped' : 'full'])), approval: ['Design authority', 'Finance (by amount)'] },
  { scope: 'retrofit', name: 'Densification or liquid retrofit', description: 'Bring 30 to 100 kW racks into an air-cooled hall: CDUs, manifolds, floor loading, uprates, phased moves.', executesAs: 'project', aspects: { space: 'full', power: 'full', cooling: 'full', network: 'summary', it: 'full', fire: 'full', finance: 'full', schedule: 'full', migration: 'full', commissioning: 'full', risk: 'full' }, approval: ['Design authority', 'Facility manager'] },
  { scope: 'plant', name: 'Plant upgrade', description: 'Add UPS modules, chillers, generators or transformers; plan the works without losing redundancy.', executesAs: 'project', aspects: { power: 'full', cooling: 'full', resilience: 'full', supply: 'full', schedule: 'full', finance: 'full', compliance: 'full', commissioning: 'full', risk: 'full', operations: 'summary' }, approval: ['Facility manager', 'Finance (by amount)'] },
  { scope: 'network', name: 'Network uplift', description: 'Fabric upgrade, optics, DCI capacity, carrier diversity, IP and VLAN plan.', executesAs: 'project', aspects: { network: 'full', it: 'summary', supply: 'full', schedule: 'full', finance: 'full', resilience: 'full', risk: 'summary' }, approval: ['Network architect', 'Finance (by amount)'] },
  { scope: 'expansion', name: 'Site expansion', description: 'A new building or hall block on an existing campus, sharing plant and utility capacity.', executesAs: 'programme', blueprintKey: 'greenfield-dc', aspects: Object.fromEntries(ASPECTS.map(a => [a, a === 'migration' ? 'summary' : 'full'])), approval: ['Design authority', 'Finance (by amount)', 'Executive'] },
  { scope: 'new-dc', name: 'New data centre', description: 'A greenfield site from intent to programme: site, type, tier, phases, plant, halls, network, staffing, cost, permits.', executesAs: 'programme', blueprintKey: 'greenfield-dc', aspects: Object.fromEntries(ASPECTS.map(a => [a, a === 'migration' ? 'skipped' : 'full'])), approval: ['Design authority', 'Finance (by amount)', 'Executive'] },
  { scope: 'portfolio', name: 'Regional portfolio', description: 'Where to put capacity first across several sites, DCI between them, shared spares and staff.', executesAs: 'portfolio', aspects: { space: 'summary', power: 'summary', network: 'full', resilience: 'full', operations: 'full', finance: 'full', schedule: 'full', risk: 'full' }, approval: ['Executive'] },
  { scope: 'migration', name: 'Migration, consolidation or decommission', description: 'What moves where and when, cut-over windows, freed capacity, disposal.', executesAs: 'programme', aspects: { space: 'summary', network: 'full', it: 'full', security: 'full', finance: 'full', schedule: 'full', migration: 'full', compliance: 'full', risk: 'full' }, approval: ['Operations lead', 'Finance (by amount)'] },
  { scope: 'server-refresh', name: 'Server refresh or replacement', description: 'Replace ageing, out-of-warranty or faulty servers with current models, wave by wave, and retire the old ones.', executesAs: 'project', aspects: { it: 'full', migration: 'full', supply: 'full', finance: 'full', schedule: 'full', space: 'summary', power: 'summary', network: 'summary', risk: 'summary', compliance: 'summary' }, approval: ['Capacity planner', 'Finance (by amount)'] },
  { scope: 'network-refresh', name: 'Network device refresh', description: 'Replace end-of-life switches, routers or firewalls with current models; reuse optics where they fit.', executesAs: 'project', aspects: { network: 'full', migration: 'full', supply: 'full', finance: 'full', schedule: 'full', it: 'summary', security: 'summary', risk: 'summary' }, approval: ['Network architect', 'Finance (by amount)'] },
  { scope: 'rack-replace', name: 'Rack replacement', description: 'Swap old or under-powered racks and their power strips, re-racking the equipment in planned windows.', executesAs: 'project', aspects: { space: 'full', power: 'full', migration: 'full', finance: 'full', schedule: 'full', supply: 'summary', cooling: 'summary', risk: 'summary' }, approval: ['Capacity planner', 'Facility manager'] },
  { scope: 'edge', name: 'Edge rollout', description: 'Many small identical sites stamped from one template with local variations.', executesAs: 'programme', blueprintKey: 'modular-pod', aspects: { space: 'summary', power: 'full', cooling: 'full', network: 'full', security: 'full', supply: 'full', schedule: 'full', finance: 'full', compliance: 'full', risk: 'summary' }, approval: ['Design authority', 'Finance (by amount)'] },
];

export function seedPlanner(S: Seed): void {
  const planner = S.byRole('Capacity Planner');
  const org = { level: 'org' as const, label: 'Organisation standard' };
  const tpl = (t: Omit<T.PlannerTemplate, 'id' | 'tplId' | keyof T.BaseEntity> & { id?: string }): T.PlannerTemplate => {
    const id = t.id ?? S.nid('TPL');
    const rec: T.PlannerTemplate = { ...t, id, tplId: id, ...S.meta(planner) };
    S.plannerTemplates.push(rec); return rec;
  };

  // ── site type profiles: one template per catalogue entry ──
  const profileIds: Record<string, string> = {};
  for (const p of DC_TYPE_CATALOG) {
    const liquid = p.physical.liquidCooling === 'standard';
    const density = p.kwPerRack ? Math.round((p.kwPerRack[0] + p.kwPerRack[1]) / 2) : 8;
    const t = tpl({
      id: `TPL-PROFILE-${p.key}`, kind: 'profile', name: p.name, description: p.description, version: 3, status: 'published', ownerName: planner.name, dcTypeKey: p.key, appliesTo: org,
      params: [
        P('densityKwPerRack', 'Design density', 'space', 'number', { unit: 'kW/rack', default: density, min: p.kwPerRack?.[0] ?? 2, max: Math.max(p.kwPerRack?.[1] ?? 20, density) }),
        P('hallDesignKw', 'Hall design load', 'space', 'number', { unit: 'kW', default: p.highDensity ? 2500 : p.segment === 'Telco' ? 600 : 1500 }),
        P('tier', 'Target tier', 'resilience', 'select', { options: ['Tier II', 'Tier III', 'Tier IV'], default: p.defaultTier === 'Tier I' ? 'Tier II' : p.defaultTier }),
        P('redundancy', 'Power redundancy', 'power', 'select', { options: ['N', 'N+1', '2N', '2N+1'], default: p.physical.redundancy }),
        P('coolingType', 'Cooling type', 'cooling', 'select', { options: ['air-crah', 'air-economiser', 'chilled-water', 'in-row', 'rear-door', 'liquid-to-chip', 'immersion'], default: liquid ? 'liquid-to-chip' : p.physical.coolingUnits[0] === 'InRow' ? 'in-row' : p.physical.coolingUnits[0] === 'RDHx' ? 'rear-door' : p.physical.coolingUnits[0] === 'CRAH' ? 'chilled-water' : 'air-crah' }),
        P('feedVoltage', 'Utility intake', 'power', 'select', { options: ['400', '11000', '33000', '132000'], default: String(p.physical.feedVoltage >= 100000 ? 132000 : p.physical.feedVoltage >= 20000 ? 33000 : p.physical.feedVoltage >= 1000 ? 11000 : 400), unit: 'V' }),
        P('pueTarget', 'PUE target', 'sustainability', 'number', { default: p.pueTarget, derived: 'profile target' }),
        P('capexPerKw', 'CapEx per kW (excl. land, IT)', 'finance', 'number', { unit: 'USD/kW', default: p.highDensity ? 4200 : p.multiTenant ? 3000 : p.segment === 'Telco' ? 2600 : p.key === 'edge-micro-dc' ? 5200 : 3400, derived: 'benchmark for site type' }),
        P('operatorOwnedIt', 'Operator owns the IT', 'it', 'bool', { default: !p.multiTenant }),
      ],
      rules: [], requiredAspects: [], outputs: ['Basis of design'], approvalPath: [], blueprintKey: p.build.blueprintKey, labels: ['profile', p.segment.toLowerCase(), p.key],
    });
    profileIds[p.key] = t.id;
  }

  // ── aspect modules ──
  const aspectModule = (id: string, name: string, aspect: T.PlannerAspect, description: string, params: T.PlannerParamDef[], rules: T.PlannerRuleDef[]) => tpl({ id, kind: 'aspect', name, description, version: 2, status: 'published', ownerName: S.byRole('Facilities Director').name, appliesTo: org, params, rules, requiredAspects: [{ aspect, depth: 'full' }], outputs: [], approvalPath: [], labels: ['aspect', aspect] });
  aspectModule('TPL-ASP-POWER-2N', 'Power · 2N', 'power', 'Two independent power paths from utility to rack; either path carries the full load.', CORE_PARAMS.filter(p => p.aspect === 'power').map(p => p.key === 'redundancy' ? { ...p, default: '2N' } : p), CORE_RULES.filter(r => r.aspect === 'power'));
  aspectModule('TPL-ASP-POWER-N1', 'Power · N+1', 'power', 'One shared path with one spare module at each stage; concurrently maintainable.', CORE_PARAMS.filter(p => p.aspect === 'power').map(p => p.key === 'redundancy' ? { ...p, default: 'N+1' } : p), CORE_RULES.filter(r => r.aspect === 'power'));
  aspectModule('TPL-ASP-COOL-AIR', 'Cooling · air with economiser', 'cooling', 'Hot-aisle containment, CRAH units on chilled water, free cooling when the climate allows.', CORE_PARAMS.filter(p => p.aspect === 'cooling').map(p => p.key === 'coolingType' ? { ...p, default: 'air-economiser' } : p), CORE_RULES.filter(r => r.aspect === 'cooling'));
  aspectModule('TPL-ASP-COOL-LIQUID', 'Cooling · liquid-to-chip', 'cooling', 'CDUs per row, facility water loop, rear-door backup for the rest of the rack; required above 30 kW per rack.', CORE_PARAMS.filter(p => p.aspect === 'cooling').map(p => p.key === 'coolingType' ? { ...p, default: 'liquid-to-chip' } : p.key === 'inletSetpointC' ? { ...p, default: 28 } : p), CORE_RULES.filter(r => r.aspect === 'cooling'));
  aspectModule('TPL-ASP-NET-LEAF-SPINE', 'Network · leaf-spine fabric', 'network', 'Two leaves per rack pair, spines sized to the uplinks, cores to the carriers; OOB on every device.', CORE_PARAMS.filter(p => p.aspect === 'network'), CORE_RULES.filter(r => r.aspect === 'network'));
  aspectModule('TPL-ASP-SEC-3ZONE', 'Security · three zones', 'security', 'Perimeter, hall and cage; two factors into the hall; cameras on every entry.', CORE_PARAMS.filter(p => p.aspect === 'security'), []);
  aspectModule('TPL-ASP-FIRE-GAS', 'Fire · clean agent gas', 'fire', 'Very early smoke detection with clean-agent suppression per hall; pre-action water in plant rooms.', CORE_PARAMS.filter(p => p.aspect === 'fire'), []);

  // ── rule sets and benchmark sets ──
  tpl({ id: 'TPL-RULES-CAPACITY', kind: 'ruleset', name: 'Capacity policy', description: 'Warn at 85% rack power, block at 90%, cooling headroom floor 10%, reserve 15%.', version: 4, status: 'published', ownerName: planner.name, appliesTo: org, params: [CORE_PARAMS.find(p => p.key === 'reservePct')!], rules: CORE_RULES.filter(r => ['finance', 'space'].includes(r.aspect)), requiredAspects: [], outputs: [], approvalPath: [], labels: ['rules'] });
  tpl({ id: 'TPL-RULES-DESIGN', kind: 'ruleset', name: 'Design standard 2026', description: 'The organisation engineering standard: power, cooling, network and resilience rules with their sources.', version: 2, status: 'published', ownerName: S.byRole('Facilities Director').name, appliesTo: org, params: [], rules: CORE_RULES, requiredAspects: [], outputs: [], approvalPath: [], labels: ['rules'] });
  tpl({ id: 'TPL-RULES-EU', kind: 'ruleset', name: S.geo === 'us' ? 'Regional variant · USA' : 'Regional variant · India', description: S.geo === 'us' ? 'ASHRAE 90.4 energy reporting, EPA AIM Act refrigerant limits, 30 °C inlet allowed for liquid halls.' : 'BEE energy and PUE reporting, refrigerant phase-down under the Kigali amendment, 30 °C inlet allowed for liquid halls.', version: 1, status: 'published', ownerName: S.byRole('Facilities Director').name, appliesTo: { level: 'region', refId: S.siteByKey('FRA') ? S.campuses.find(c => c.id === S.siteByKey('FRA')!.campusId)?.regionId : S.regions[0]?.id, label: S.regions.find(r => r.id === (S.siteByKey('FRA') ? S.campuses.find(c => c.id === S.siteByKey('FRA')!.campusId)?.regionId : S.regions[0]?.id))?.name ?? 'Region' }, inheritsFrom: 'TPL-RULES-DESIGN', params: [{ ...CORE_PARAMS.find(p => p.key === 'inletSetpointC')!, default: 27, max: 30 }], rules: [RULE('R-EU-01', 'sustainability', 'hard', 'Annual energy and PUE reporting enabled', 'reporting-enabled', { standard: S.geo === 'us' ? 'ASHRAE 90.4 / state energy reporting' : 'BEE Energy Conservation Act (designated consumer reporting)' })], requiredAspects: [], outputs: [], approvalPath: [], labels: ['rules', 'region'] });
  tpl({ id: 'TPL-BENCH-2026', kind: 'benchmarkset', name: 'Benchmark set 2026', description: 'Cost, PUE, staffing, lead-time and sizing reference values with sources and dates; indicative until confirmed by actuals.', version: 1, status: 'published', ownerName: planner.name, appliesTo: org, params: [], rules: [], requiredAspects: [], outputs: [], approvalPath: [], labels: ['benchmarks'] });

  // ── demand profiles ──
  const demandTpl = (id: string, name: string, description: string, gpu: number, compute: number, storage: number, phases: { name: string; sharePct: number; monthsFromStart: number }[]) =>
    tpl({ id, kind: 'demand', name, description, version: 1, status: 'published', ownerName: planner.name, appliesTo: org, params: [], rules: [], requiredAspects: [], outputs: [], approvalPath: [], labels: ['demand'], demand: { gpuPct: gpu, computePct: compute, storagePct: storage, phases } });
  demandTpl('TPL-DEMAND-GPU', 'GPU-heavy (AI training)', '70% GPU, 20% compute, 10% storage; three phases over 24 months.', 70, 20, 10, [{ name: 'Phase 1', sharePct: 34, monthsFromStart: 0 }, { name: 'Phase 2', sharePct: 33, monthsFromStart: 12 }, { name: 'Phase 3', sharePct: 33, monthsFromStart: 24 }]);
  demandTpl('TPL-DEMAND-GENERAL', 'General compute', '20% GPU, 60% compute, 20% storage; two phases.', 20, 60, 20, [{ name: 'Phase 1', sharePct: 50, monthsFromStart: 0 }, { name: 'Phase 2', sharePct: 50, monthsFromStart: 12 }]);
  demandTpl('TPL-DEMAND-STORAGE', 'Storage-heavy', '5% GPU, 35% compute, 60% storage; one phase.', 5, 35, 60, [{ name: 'Phase 1', sharePct: 100, monthsFromStart: 0 }]);
  demandTpl('TPL-DEMAND-COLO', 'Colocation mix', 'Tenant-owned gear: 10% GPU, 70% compute, 20% storage; four quarterly phases.', 10, 70, 20, [{ name: 'Q1', sharePct: 25, monthsFromStart: 0 }, { name: 'Q2', sharePct: 25, monthsFromStart: 3 }, { name: 'Q3', sharePct: 25, monthsFromStart: 6 }, { name: 'Q4', sharePct: 25, monthsFromStart: 9 }]);

  // ── plan templates per scope ──
  for (const sc of SCOPES) {
    const aspects = { ...sc.aspects, ...familyAspects(sc.scope) };
    const drop = familyDropRules(sc.scope); const fam = familyRules(sc.scope);
    const rules = [...CORE_RULES.filter(r => aspects[r.aspect] && aspects[r.aspect] !== 'skipped' && !drop.includes(r.id) && !fam.some(f => f.id === r.id)), ...fam];
    tpl({
      id: `TPL-PLAN-${sc.scope}`, kind: 'plan', name: sc.name, description: sc.description, version: 2, status: 'published', ownerName: planner.name, scope: sc.scope, appliesTo: org,
      params: paramsForScope(sc.scope, aspects), rules, requiredAspects: ASPECTS.map(a => ({ aspect: a, depth: aspects[a] ?? 'skipped' })),
      outputs: familyOutputs(sc.scope) ?? (sc.scope === 'rack' ? ['Placement note', 'Change request'] : ['Basis of design', 'Capacity plan', 'Bill of materials and budget', 'Business case', 'Schedule', 'Risk and permit registers']),
      approvalPath: familyApproval(sc.scope) ?? sc.approval, executesAs: sc.executesAs, blueprintKey: sc.blueprintKey, labels: ['plan', sc.scope],
    });
  }
  // a site-level variant that inherits the GPU hall template
  tpl({ id: 'TPL-PLAN-hall-gpu-fra', kind: 'plan', name: 'GPU hall, 2 MW, liquid-cooled · Frankfurt standard', description: 'Frankfurt variant of the hall fit-out for AI racks: 40 to 60 kW per rack, 2N power, liquid-to-chip, 30 °C inlet allowed by the EU variant.', version: 1, status: 'published', ownerName: S.siteStaff('FRA').name, scope: 'hall', dcTypeKey: 'ai-gpu-factory', appliesTo: { level: 'site', refId: S.dataCenters.find(d => d.code.startsWith('FRA'))?.id, label: 'Frankfurt campus' }, inheritsFrom: 'TPL-PLAN-hall',
    params: [{ ...CORE_PARAMS.find(p => p.key === 'densityKwPerRack')!, default: 48, min: 40, max: 60 }, { ...CORE_PARAMS.find(p => p.key === 'hallDesignKw')!, default: 2000 }, { ...CORE_PARAMS.find(p => p.key === 'coolingType')!, default: 'liquid-to-chip' }, { ...CORE_PARAMS.find(p => p.key === 'inletSetpointC')!, default: 30, max: 32 }, { ...CORE_PARAMS.find(p => p.key === 'floorLoadingKgPerRack')!, default: 1500 }, { ...CORE_PARAMS.find(p => p.key === 'capexPerKw')!, default: 3800 }, { ...CORE_PARAMS.find(p => p.key === 'redundancy')!, default: '2N' }],
    rules: [], requiredAspects: ASPECTS.map(a => ({ aspect: a, depth: 'full' })), outputs: ['Basis of design', 'Capacity plan', 'Bill of materials and budget', 'Business case'], approvalPath: ['Design authority', 'Finance (by amount)'], executesAs: 'project', labels: ['plan', 'hall', 'gpu', 'frankfurt'] });

  // ── document and checklist templates ──
  const docTpl = (id: string, name: string, description: string, items: string[]) => tpl({ id, kind: 'document', name, description, version: 1, status: 'published', ownerName: planner.name, appliesTo: org, params: [], rules: [], requiredAspects: [], outputs: [name], approvalPath: [], labels: ['document'], items });
  docTpl('TPL-DOC-BOD', 'Basis of design', 'The design intent and the rules applied.', ['Purpose and demand', 'Site and climate', 'Tier and redundancy', 'Space and layout', 'Power chain', 'Cooling and environment', 'Network architecture', 'Fire, life safety and security', 'Sustainability targets', 'Standards applied', 'Assumptions and sources']);
  docTpl('TPL-DOC-CAP', 'Capacity plan', 'Phase ladder, reserve policy and forecast crossings.', ['Phase ladder', 'Reserve policy', 'Binding constraint per phase', 'Forecast crossings', 'Capacity released per phase']);
  docTpl('TPL-DOC-BC', 'Business case', 'Options compared, preferred scenario, cost and payback.', ['Options considered', 'Preferred scenario', 'CapEx by category', 'OpEx run rate', 'Cost per kW and per rack', 'Revenue and payback', 'Approvals and conditions']);
  docTpl('TPL-DOC-RISK', 'Risk and permit registers', 'Risks with owners; permits with lead times.', ['Risk register', 'Permit register', 'Mitigation actions']);
  const checkTpl = (id: string, name: string, description: string, items: string[]) => tpl({ id, kind: 'checklist', name, description, version: 1, status: 'published', ownerName: S.byRole('Commissioning Engineer').name, appliesTo: org, params: [], rules: [], requiredAspects: [], outputs: [], approvalPath: [], labels: ['checklist'], items });
  checkTpl('TPL-CHK-DESIGN', 'Design review gate', 'What the design authority checks before approval.', ['All hard rules pass', 'Every parameter has a source', 'Phases meet the demand dates', 'Long-lead items ordered in time', 'Permits identified with lead times', 'Cost within benchmark band or justified', 'Top risks owned']);
  checkTpl('TPL-CHK-GOLIVE', 'Go-live readiness', 'What must be true before a hall takes service.', ['Commissioning level 5 on power and cooling', 'Network acceptance passed', 'Monitoring live for every device', 'Alarm baseline clean', 'Spares stocked', 'Staff trained', 'Handover pack complete', 'Capacity released']);

  // ── benchmarks ──
  const bm = (metric: string, label: string, category: T.PlannerBenchmark['category'], unit: string, v: { value?: number; low?: number; high?: number }, appliesTo: T.PlannerBenchmark['appliesTo'], source: string, indicative = true) => {
    const id = S.nid('BM');
    S.plannerBenchmarks.push({ id, bmId: id, ...S.meta(planner), metric, label, category, unit, ...v, appliesTo, source, sourceDate: S.daysAgo(S.int(20, 200)), indicative });
  };
  const capex: [string, number, number, number][] = [['hyperscale-dc', 2800, 3200, 3800], ['hyperscale-campus', 2600, 3000, 3500], ['ai-gpu-factory', 3800, 4200, 4800], ['enterprise-dc', 3000, 3400, 4000], ['wholesale-colo', 2600, 3000, 3400], ['retail-colo', 2900, 3300, 3800], ['carrier-hotel', 2800, 3200, 3700], ['modular-pod', 2500, 2900, 3400], ['edge-micro-dc', 4200, 5200, 6500], ['server-room', 2000, 2600, 3200], ['ixp', 2700, 3100, 3600], ['central-office', 2200, 2600, 3000], ['network-pop', 2400, 2800, 3300], ['regional-edge-dc', 2800, 3200, 3700], ['mtso', 2300, 2700, 3100], ['national-core-nfvi', 2600, 3000, 3500], ['aggregation-pop', 2300, 2700, 3200]];
  for (const [k, lo, v, hi] of capex) bm('capexPerKw', 'CapEx per kW (plant and fit-out, excl. land and IT)', 'cost', 'USD/kW', { value: v, low: lo, high: hi }, { dcTypeKey: k }, 'Organisation benchmark 2026, calibrated on the last three builds');
  const pue: [T.PlannerCoolingType, string, number, number][] = [['air-crah', 'temperate', 1.45, 1.65], ['air-economiser', 'cold', 1.15, 1.3], ['air-economiser', 'temperate', 1.2, 1.4], ['air-economiser', 'hot-dry', 1.3, 1.5], ['chilled-water', 'temperate', 1.3, 1.5], ['chilled-water', 'hot-humid', 1.4, 1.65], ['chilled-water', 'cold', 1.2, 1.4], ['in-row', 'temperate', 1.3, 1.45], ['rear-door', 'temperate', 1.2, 1.35], ['liquid-to-chip', 'temperate', 1.1, 1.25], ['liquid-to-chip', 'hot-humid', 1.15, 1.3], ['liquid-to-chip', 'cold', 1.08, 1.2], ['immersion', 'temperate', 1.05, 1.15]];
  for (const [c, cl, lo, hi] of pue) bm('pue', 'Achievable PUE', 'performance', 'ratio', { low: lo, high: hi, value: Math.round(((lo + hi) / 2) * 100) / 100 }, { coolingType: c, climate: cl }, 'Organisation benchmark set 2026 (industry survey ranges)');
  bm('staffPerMw', 'Operations staff per MW', 'staffing', 'FTE/MW', { low: 0.5, high: 1.2, value: 0.8 }, { tier: 'Tier III' }, 'Organisation benchmark 2026');
  bm('staffPerMw', 'Operations staff per MW', 'staffing', 'FTE/MW', { low: 0.8, high: 1.6, value: 1.1 }, { tier: 'Tier IV' }, 'Organisation benchmark 2026');
  bm('staffCostFte', 'Loaded cost per FTE', 'cost', 'USD/year', { value: 96000, low: 70000, high: 130000 }, {}, 'HR benchmark 2026');
  bm('itCapexPerRack', 'IT CapEx per rack (GPU)', 'cost', 'USD/rack', { value: 650000, low: 450000, high: 900000 }, { dcTypeKey: 'ai-gpu-factory' }, 'Procurement actuals, last 4 orders');
  bm('itCapexPerRack', 'IT CapEx per rack (general compute)', 'cost', 'USD/rack', { value: 180000, low: 120000, high: 260000 }, {}, 'Procurement actuals, last 12 orders');
  bm('maintenancePctCapex', 'Plant maintenance as % of plant CapEx', 'cost', '%/year', { value: 2.5, low: 1.8, high: 3.5 }, {}, 'Facility contracts 2025');
  /* industrial tariff per region of our geography (India ≈ ₹6.5–8.5 per kWh, USA ≈ 7–11 ¢) */
  S.regions.forEach((r, i) => { const base = S.geo === 'us' ? 0.09 : 0.15; const v = Math.round(base * (1 + ((i % 4) - 1.5) * 0.08) * 1000) / 1000; bm('tariff', 'Industrial electricity tariff', 'cost', 'USD/kWh', { value: v, low: Math.round(v * 0.8 * 1000) / 1000, high: Math.round(v * 1.3 * 1000) / 1000 }, { regionId: r.id }, S.geo === 'us' ? 'Utility contracts 2026' : 'State electricity board HT tariffs 2026'); });
  const lead: [string, number, number][] = [['Transformer (33 kV)', 40, 60], ['Generator (2.5 MVA)', 30, 50], ['UPS (1 MW module)', 20, 30], ['Chiller', 25, 40], ['CRAH / CDU', 14, 22], ['Switchgear', 24, 36], ['PDU', 8, 14], ['Racks and containment', 6, 10], ['Spine / leaf switches', 8, 16], ['Optics (400G)', 6, 14], ['GPU servers', 16, 30], ['General servers', 6, 12], ['Fibre trunks', 4, 8]];
  for (const [item, lo, hi] of lead) bm(`leadWeeks:${item}`, `Lead time · ${item}`, 'leadtime', 'weeks', { low: lo, high: hi, value: Math.round((lo + hi) / 2) }, {}, 'Supplier quotes and procurement actuals 2026', false);
  for (const fam of SCOPE_SEEDS) for (const b of fam.benchmarks ?? []) bm(b.metric, b.label, b.category, b.unit, { value: b.value, low: b.low, high: b.high }, b.appliesTo ?? {}, b.source, b.indicative ?? true);
  bm('whiteSpaceM2PerRack', 'White space per rack', 'sizing', 'm²', { value: 2.6, low: 2.2, high: 3.2 }, {}, 'Design standard');
  bm('floorLoadingKgPerRack', 'Floor loading, liquid-cooled rack', 'sizing', 'kg', { value: 1500, low: 1200, high: 1800 }, { coolingType: 'liquid-to-chip' }, 'Design standard');
  bm('floorLoadingKgPerRack', 'Floor loading, air-cooled rack', 'sizing', 'kg', { value: 1000, low: 800, high: 1200 }, {}, 'Design standard');
  bm('generatorMargin', 'Generator capacity over design load', 'sizing', 'ratio', { value: 1.25 }, {}, 'Design standard', false);
  bm('coolingMargin', 'Cooling capacity over IT load (with one unit lost)', 'sizing', 'ratio', { value: 1.1 }, {}, 'Design standard', false);
  bm('liquidThresholdKw', 'Density above which liquid cooling is required', 'sizing', 'kW/rack', { value: 30 }, {}, 'Design standard', false);
  bm('racksPerLeafPair', 'Racks per leaf pair', 'sizing', 'racks', { value: 16, low: 8, high: 24 }, {}, 'Network design standard');
  bm('carbonKgPerKwh', 'Grid carbon intensity', 'sustainability', 'kg CO2/kWh', { value: 0.38, low: 0.2, high: 0.6 }, {}, 'Grid operator factors 2025');
  bm('wue', 'Water usage effectiveness', 'sustainability', 'L/kWh', { value: 0.4, low: 0.1, high: 1.8 }, {}, 'Industry survey');
  bm('durationWeeks:hall', 'Hall fit-out duration', 'leadtime', 'weeks', { low: 14, high: 24, value: 18 }, {}, 'Delivery actuals, last 6 halls', false);
  bm('durationWeeks:new-dc', 'Greenfield to first hall ready for service', 'leadtime', 'weeks', { low: 90, high: 130, value: 104 }, {}, 'Delivery actuals, last 3 builds', false);
  bm('durationWeeks:expansion', 'Expansion building to ready for service', 'leadtime', 'weeks', { low: 60, high: 90, value: 72 }, {}, 'Delivery actuals, last 2 expansions', false);

  // ── plans and scenarios ──
  const dcByCode = (prefix: string) => S.siteByKey(prefix);
  const campusOf = (prefix: string) => S.campuses.find(c => dcByCode(prefix)?.campusId === c.id);
  const regionOf = (campus?: T.Campus) => campus?.regionId;
  let pi = 0;
  const approvalDraws = new Map<string, number[]>();
  const plan = (p: Omit<T.PlannerPlan, 'id' | 'plnId' | keyof T.BaseEntity | 'paramSources' | 'approvals' | 'wizardStep'> & { paramSources?: Record<string, T.PlannerParamSource>; approvals?: T.PlannerApproval[]; wizardStep?: number }, scenarios: { name: string; description: string; overrides: Record<string, number | string | boolean>; preferred?: boolean }[]) => {
    const id = S.nid('PLN'); pi++;
    // Scope inputs that express "how much" for plan types that are not sized in kW alone.
    { const d = Number(p.params.densityKwPerRack ?? 10); const add = (k: string, v: number) => { if (p.params[k] === undefined) p.params = { ...p.params, [k]: v }; };
      if (p.scope === 'rack' || p.scope === 'pod') add('rackCount', Math.max(1, Math.round(p.designPowerKw / d)));
      if (p.scope === 'edge') { const perSite = Number(p.params.hallDesignKw ?? 40); add('kwPerSite', perSite); add('siteCount', Math.max(1, Math.round(p.designPowerKw / perSite))); }
      if (p.scope === 'migration') add('racksToMove', Math.max(1, Math.round(p.designPowerKw / d)));
      if (p.scope === 'network') add('dciGbpsRequired', 800); }
    // Older parameter: halls per building becomes floors × halls per floor.
    if (p.params.hallsPerBuilding !== undefined) { const h = Number(p.params.hallsPerBuilding); const floors = h >= 6 ? 3 : h >= 2 ? 2 : 1; p.params = { ...p.params, floorsPerBuilding: floors, hallsPerFloor: Math.ceil(h / floors) }; delete p.params.hallsPerBuilding; if (p.paramSources?.hallsPerBuilding) { p.paramSources = { ...p.paramSources, floorsPerBuilding: p.paramSources.hallsPerBuilding, hallsPerFloor: p.paramSources.hallsPerBuilding }; delete p.paramSources.hallsPerBuilding; } }
    const sources: Record<string, T.PlannerParamSource> = { ...Object.fromEntries(Object.keys(p.params).map((k, i) => [k, (['template', 'user', 'benchmark', 'actual', 'ai'] as T.PlannerParamSource[])[(i + pi) % 5]])), ...(p.paramSources ?? {}) };
    // Approvals follow the template's path and are written by the governance pass below; the two
    // draws the old fixed approvals took are kept so the random stream after them does not shift.
    const draws = !p.approvals && p.status !== 'Draft' && p.status !== 'In review' ? [S.int(5, 60), S.int(2, 40)] : [];
    approvalDraws.set(id, draws);
    const approvals: T.PlannerApproval[] = [];
    const rec: T.PlannerPlan = { ...p, id, plnId: id, ...S.meta(planner), paramSources: sources, approvals, wizardStep: p.wizardStep ?? 10 };
    S.plannerPlans.push(rec);
    scenarios.forEach((sc) => { const sid = S.nid('SCN'); S.plannerScenarios.push({ id: sid, scnId: sid, ...S.meta(planner), planId: id, name: sc.name, description: sc.description, overrides: sc.overrides, preferred: !!sc.preferred }); if (sc.preferred) rec.preferredScenarioId = sid; });
    return rec;
  };
  const phase = (id: string, name: string, monthsAhead: number, itKw: number, density: number, hallKw: number, status: T.PlannerPhase['status']): T.PlannerPhase => ({ id, name, goLive: S.daysAhead(Math.round(monthsAhead * 30.4)), itKw, racks: Math.ceil(itKw / density), halls: Math.ceil(itKw / hallKw), status });
  const risk = (i: number, title: string, domain: T.PlannerRisk['domain'], probability: T.PlannerRisk['probability'], impact: T.PlannerRisk['impact'], mitigation: string, source: T.PlannerParamSource = 'template', evidence?: string): T.PlannerRisk => ({ id: `R${i}`, title, domain, probability, impact, owner: S.person(i + 4).name, mitigation, source, evidence });
  const permit = (i: number, name: string, authority: string, leadWeeks: number, weeksAhead: number, status: T.PlannerPermit['status']): T.PlannerPermit => ({ id: `PM${i}`, name, authority, leadWeeks, neededBefore: S.daysAhead(weeksAhead * 7), status });

  const fra = campusOf('FRA'), ash = campusOf('ASH'), dal = campusOf('DAL'), sin = campusOf('SIN'), syd = campusOf('SYD'), dub = campusOf('DUB'), gru = campusOf('GRU');

  // 1 · the flagship: 50 MW AI campus in Frankfurt, in review, three scenarios
  plan({
    title: 'Frankfurt AI campus · 50 MW', scope: 'new-dc', status: 'In review', templateId: 'TPL-PLAN-new-dc', dcTypeKey: 'ai-gpu-factory', campusId: fra?.id, regionId: regionOf(fra), newSiteName: 'FRA-AI1', climate: 'temperate',
    intent: 'Plan a new 50 MW data centre for AI training workloads near Frankfurt, first phase live within 24 months, Tier III, liquid-cooled GPU halls, 2N power.', ownerName: planner.name, requestedBy: 'Quanta AI Labs (anchor customer)', designPowerKw: 50000, targetGoLive: S.daysAhead(730),
    demand: { gpuPct: 70, computePct: 20, storagePct: 10, densityKwPerRack: 48, tenancy: 'single', growthPctPerYear: 18 },
    phases: [phase('P1', 'Phase 1 · Building A', 24, 17000, 48, 2000, 'Planned'), phase('P2', 'Phase 2 · Building B', 36, 16500, 48, 2000, 'Planned'), phase('P3', 'Phase 3 · Building C', 48, 16500, 48, 2000, 'Planned')],
    params: { densityKwPerRack: 48, hallDesignKw: 2000, hallsPerBuilding: 9, tier: 'Tier III', redundancy: '2N', feedVoltage: '132000', upsRuntimeMin: 12, generatorFuelHours: 48, coolingType: 'liquid-to-chip', coolingRedundancy: 'N+1', inletSetpointC: 30, pueTarget: 1.18, renewableSharePct: 80, racksPerLeafPair: 12, uplinksPerLeaf: 4, uplinkGbps: '400', oversubscription: 2, carrierCount: 4, operatorOwnedIt: true, refreshYears: 4, suppressionType: 'Clean agent gas', securityZones: 5, staffPerMw: 0.7, sparesPct: 3, contingencyPct: 15, capexPerKw: 4200, itCapexPerRack: 1350000, tariffUsdPerKwh: 0.16, maintenancePctCapex: 2.5, leaseUsdPerM2Year: 0, revenuePerKwMonth: 420, reservePct: 15, commissioningLevel: '5', whiteSpaceM2PerRack: 2.8, floorLoadingKgPerRack: 1500 },
    paramSources: { densityKwPerRack: 'user', capexPerKw: 'benchmark', pueTarget: 'ai', tariffUsdPerKwh: 'benchmark', inletSetpointC: 'template', hallDesignKw: 'template', staffPerMw: 'actual' },
    risks: [risk(1, 'Utility connection of 60 MVA slips beyond month 20', 'Supplier', 'Medium', 'High', 'Sign the grid agreement at master-plan gate; stage a 20 MVA interim feed.', 'ai', 'Dallas HDC-1 grid connection slipped 14 weeks in 2025'), risk(2, 'Transformer lead time 60 weeks', 'Supplier', 'High', 'High', 'Order at programme approval; dual-source.', 'benchmark'), risk(3, 'CDU vendor capacity for 1,000+ racks', 'Supplier', 'Medium', 'Medium', 'Frame agreement with two CDU vendors.', 'template'), risk(4, 'Water permit for liquid cooling make-up', 'Regulatory', 'Low', 'High', 'Closed-loop design with dry coolers; apply month 2.', 'template'), risk(5, 'GPU server delivery misaligned with hall readiness', 'Supplier', 'Medium', 'Medium', 'Stagger server orders per hall; staging hall in Building A.', 'ai', 'Ashburn GPU-1 held 2 halls of servers for 7 weeks in 2026')],
    permits: [permit(1, 'Planning and zoning', 'City of Frankfurt', 26, 8, 'Applied'), permit(2, 'Grid connection agreement', 'Transmission operator', 40, 12, 'In review'), permit(3, 'Environmental (noise, water)', 'Regional authority', 20, 30, 'Not started'), permit(4, 'Building permit', 'City of Frankfurt', 16, 34, 'Not started'), permit(5, 'Generator emissions', 'Regional authority', 12, 70, 'Not started')],
    aiAssisted: true, revenuePerKwMonth: 420, tariffUsdPerKwh: 0.16,
  }, [
    { name: 'A · Tier III, liquid, 3 phases', description: 'The template proposal: three 16 to 17 MW buildings, liquid-to-chip, 2N power.', overrides: {}, preferred: true },
    { name: 'B · Tier IV, 2 phases', description: 'Fault-tolerant plant, two 25 MW buildings, faster to full capacity but higher CapEx.', overrides: { tier: 'Tier IV', redundancy: '2N+1', capexPerKw: 4900, hallsPerBuilding: 13, generatorFuelHours: 72 } },
    { name: 'C · Air-cooled first hall', description: 'Open the first hall air-cooled at 25 kW per rack for early revenue; liquid from phase 2.', overrides: { densityKwPerRack: 25, coolingType: 'air-economiser', inletSetpointC: 24, pueTarget: 1.28, capexPerKw: 3600 } },
  ]);

  // 2 · hall fit-out, approved and linked to an existing programme
  const ashDc = dcByCode('ASH-DC1');
  plan({
    title: 'Ashburn DC-1 · Hall 3 fit-out · 2 MW', scope: 'hall', status: 'Approved', templateId: 'TPL-PLAN-hall', dcTypeKey: 'enterprise-dc', campusId: ash?.id, dataCenterId: ashDc?.id, regionId: regionOf(ash), climate: 'temperate',
    intent: 'Open Hall 3 for the enterprise private cloud expansion: 2 MW, 12 kW racks, chilled water, N+1.', ownerName: planner.name, requestedBy: 'Platform engineering', designPowerKw: 2000, targetGoLive: S.daysAhead(150),
    demand: { gpuPct: 10, computePct: 70, storagePct: 20, densityKwPerRack: 12, tenancy: 'single', growthPctPerYear: 12 },
    phases: [phase('P1', 'Rows A to D', 5, 1000, 12, 2000, 'In delivery'), phase('P2', 'Rows E to H', 9, 1000, 12, 2000, 'Approved')],
    params: { targetHallId: S.halls.find(h => h.dataCenterId === ashDc?.id && h.status === 'Shell')?.id ?? '', densityKwPerRack: 12, hallDesignKw: 2000, hallsPerBuilding: 6, tier: 'Tier III', redundancy: 'N+1', feedVoltage: '33000', upsRuntimeMin: 15, generatorFuelHours: 48, coolingType: 'chilled-water', coolingRedundancy: 'N+1', inletSetpointC: 24, pueTarget: 1.38, renewableSharePct: 55, racksPerLeafPair: 16, uplinksPerLeaf: 4, uplinkGbps: '100', oversubscription: 3, carrierCount: 3, operatorOwnedIt: true, refreshYears: 5, suppressionType: 'Clean agent gas', securityZones: 4, staffPerMw: 0.8, sparesPct: 3, contingencyPct: 10, capexPerKw: 3400, itCapexPerRack: 180000, tariffUsdPerKwh: 0.09, maintenancePctCapex: 2.5, leaseUsdPerM2Year: 0, revenuePerKwMonth: 150, reservePct: 15, commissioningLevel: '5', whiteSpaceM2PerRack: 2.6, floorLoadingKgPerRack: 1000 },
    risks: [risk(1, 'PDU delivery slipping (12 units at customs)', 'Supplier', 'High', 'Medium', 'Expedite; borrow 4 PDUs from Hall 2 spares.', 'actual', 'PO-2201 ETA moved twice'), risk(2, 'Trunk cabling vendor availability in November', 'Supplier', 'Medium', 'Low', 'Book the crew now.', 'template')],
    permits: [permit(1, 'Electrical works permit', 'County', 6, 4, 'Approved'), permit(2, 'Fire marshal inspection', 'County fire marshal', 4, 18, 'Applied')],
    aiAssisted: true, revenuePerKwMonth: 150, tariffUsdPerKwh: 0.09,
  }, [{ name: 'Template proposal', description: '2 MW chilled water, 12 kW racks.', overrides: {}, preferred: true }, { name: 'Dense rows E to H', description: 'Rows E to H at 20 kW with rear-door cooling for the analytics cluster.', overrides: { densityKwPerRack: 16, coolingType: 'rear-door', capexPerKw: 3700 } }]);

  // 3 · plant upgrade, executing
  const dalDc = dcByCode('DAL-HDC1') ?? dcByCode('DAL');
  const dalItMw = Math.round(S.racks.filter(r => r.dataCenterId === dalDc?.id).reduce((a, r) => a + r.currentPowerKw, 0) / 100) / 10;
  const dalUps = S.upsUnits.filter(u => u.dataCenterId === dalDc?.id); const dalChillers = S.chillers.filter(c => c.dataCenterId === dalDc?.id);
  plan({
    title: 'Dallas HDC-1 · UPS and chiller expansion', scope: 'plant', status: 'Executing', templateId: 'TPL-PLAN-plant', dcTypeKey: 'hyperscale-dc', campusId: dal?.id, dataCenterId: dalDc?.id, regionId: regionOf(dal), climate: 'hot-dry',
    intent: `Add two 1 MW UPS modules (${dalUps.length} installed today, N+1) and a fourth ${dalChillers[0]?.capacityKw ?? 1400} kW chiller so Dallas HDC-1 keeps N+1 as IT load grows from ${dalItMw} MW today to 4 MW, when Hall 3 opens.`, ownerName: S.byRole('Facilities Director').name, requestedBy: 'Facility operations', designPowerKw: 4000, targetGoLive: S.daysAhead(120),
    demand: { gpuPct: 30, computePct: 50, storagePct: 20, densityKwPerRack: 15, tenancy: 'single', growthPctPerYear: 20 },
    phases: [phase('P1', `UPS modules ${dalUps.length + 1} and ${dalUps.length + 2}`, 2, 2000, 15, 2500, 'In delivery'), phase('P2', `Chiller ${dalChillers.length + 1} and pumps`, 4, 2000, 15, 2500, 'Approved')],
    params: { densityKwPerRack: 15, hallDesignKw: 2500, hallsPerBuilding: 8, tier: 'Tier III', redundancy: 'N+1', feedVoltage: '33000', upsRuntimeMin: 10, generatorFuelHours: 48, coolingType: 'chilled-water', coolingRedundancy: 'N+1', inletSetpointC: 25, pueTarget: 1.32, renewableSharePct: 40, racksPerLeafPair: 16, uplinksPerLeaf: 4, uplinkGbps: '400', oversubscription: 3, carrierCount: 3, operatorOwnedIt: true, refreshYears: 5, suppressionType: 'Pre-action water', securityZones: 4, staffPerMw: 0.6, sparesPct: 4, contingencyPct: 20, capexPerKw: 900, itCapexPerRack: 0, tariffUsdPerKwh: 0.08, maintenancePctCapex: 2.5, leaseUsdPerM2Year: 0, revenuePerKwMonth: 140, reservePct: 15, commissioningLevel: '5', whiteSpaceM2PerRack: 2.6, floorLoadingKgPerRack: 1000 },
    risks: [risk(1, 'Redundancy at N during UPS cut-over windows', 'Facility', 'High', 'High', 'Two 4-hour windows at night with the generator on standby; freeze changes.', 'template'), risk(2, 'Chiller lead time 32 weeks', 'Supplier', 'Medium', 'High', 'Ordered at approval; delivery confirmed.', 'benchmark')],
    permits: [permit(1, 'Electrical permit', 'County', 6, 2, 'Approved'), permit(2, 'Refrigerant handling', 'State environmental agency', 8, 10, 'Approved')],
    programId: S.programs.find(pr => pr.name.startsWith('DC4 '))?.id, aiAssisted: false, revenuePerKwMonth: 140, tariffUsdPerKwh: 0.08,
  }, [{ name: 'Approved scope', description: 'Two UPS modules and one chiller.', overrides: {}, preferred: true }]);

  // 4 · rack placement, draft
  plan({
    title: 'Acme Financial · 8 kW dual-feed rack', scope: 'rack', status: 'Draft', templateId: 'TPL-PLAN-rack', dcTypeKey: 'retail-colo', campusId: fra?.id, dataCenterId: dcByCode('FRA-COLO1')?.id, regionId: regionOf(fra), climate: 'temperate',
    intent: 'Place one 8 kW rack for Acme Financial in the Frankfurt colo, dual feed, two 25G uplinks, VLAN 240.', ownerName: S.byRole('Network Engineer').name, requestedBy: 'Acme Financial', designPowerKw: 8, targetGoLive: S.daysAhead(21),
    demand: { gpuPct: 0, computePct: 80, storagePct: 20, densityKwPerRack: 8, tenancy: 'multi', growthPctPerYear: 5 },
    phases: [phase('P1', 'Install', 0.7, 8, 8, 1000, 'Planned')],
    params: { densityKwPerRack: 8, hallDesignKw: 1000, hallsPerBuilding: 4, tier: 'Tier III', redundancy: '2N', feedVoltage: '400', upsRuntimeMin: 12, generatorFuelHours: 48, coolingType: 'chilled-water', coolingRedundancy: 'N+1', inletSetpointC: 24, pueTarget: 1.4, renewableSharePct: 60, racksPerLeafPair: 16, uplinksPerLeaf: 2, uplinkGbps: '100', oversubscription: 3, carrierCount: 3, operatorOwnedIt: false, refreshYears: 5, suppressionType: 'Clean agent gas', securityZones: 4, staffPerMw: 0.8, sparesPct: 3, contingencyPct: 10, capexPerKw: 3300, itCapexPerRack: 0, tariffUsdPerKwh: 0.16, maintenancePctCapex: 2.5, leaseUsdPerM2Year: 0, revenuePerKwMonth: 185, reservePct: 15, commissioningLevel: '3', whiteSpaceM2PerRack: 2.6, floorLoadingKgPerRack: 1000 },
    risks: [], permits: [], aiAssisted: true, wizardStep: 4, revenuePerKwMonth: 185, tariffUsdPerKwh: 0.16,
  }, [{ name: 'Best fit · Hall 1 row E', description: 'Placement optimiser: row E rack 3, PDU-A outlet 14 and PDU-B outlet 14, leaf pair E1/E2 ports 17.', overrides: {}, preferred: true }]);

  // 5 · pod, approved
  plan({
    title: 'Singapore NC-1 · 24-rack analytics pod', scope: 'pod', status: 'Approved', templateId: 'TPL-PLAN-pod', dcTypeKey: 'national-core-nfvi', campusId: sin?.id, dataCenterId: dcByCode('SIN-NC1')?.id, regionId: regionOf(sin), climate: 'hot-humid',
    intent: '24 racks at 10 kW for the regional analytics platform, in-row cooling, own cage.', ownerName: planner.name, requestedBy: 'Data platform', designPowerKw: 240, targetGoLive: S.daysAhead(75),
    demand: { gpuPct: 25, computePct: 55, storagePct: 20, densityKwPerRack: 10, tenancy: 'single', growthPctPerYear: 15 },
    phases: [phase('P1', 'Pod install', 2.5, 240, 10, 600, 'Approved')],
    params: { densityKwPerRack: 10, hallDesignKw: 600, hallsPerBuilding: 4, tier: 'Tier III', redundancy: '2N', feedVoltage: '11000', upsRuntimeMin: 15, generatorFuelHours: 48, coolingType: 'in-row', coolingRedundancy: 'N+1', inletSetpointC: 24, pueTarget: 1.42, renewableSharePct: 30, racksPerLeafPair: 12, uplinksPerLeaf: 4, uplinkGbps: '100', oversubscription: 3, carrierCount: 2, operatorOwnedIt: true, refreshYears: 5, suppressionType: 'Clean agent gas', securityZones: 4, staffPerMw: 0.8, sparesPct: 3, contingencyPct: 10, capexPerKw: 3000, itCapexPerRack: 220000, tariffUsdPerKwh: 0.14, maintenancePctCapex: 2.5, leaseUsdPerM2Year: 0, revenuePerKwMonth: 170, reservePct: 15, commissioningLevel: '4', whiteSpaceM2PerRack: 2.4, floorLoadingKgPerRack: 1000 },
    risks: [risk(1, 'In-row units on 20-week lead time', 'Supplier', 'Medium', 'Medium', 'Ordered; interim spot cooling available.', 'benchmark')], permits: [permit(1, 'Cage works notification', 'Building management', 2, 3, 'Approved')], aiAssisted: true, revenuePerKwMonth: 170, tariffUsdPerKwh: 0.14,
  }, [{ name: 'Approved', description: '24 racks, in-row N+1.', overrides: {}, preferred: true }]);

  // 6 · decommission, completed
  plan({
    title: 'Dublin SR-1 · server room decommission', scope: 'migration', status: 'Completed', templateId: 'TPL-PLAN-migration', dcTypeKey: 'server-room', campusId: dub?.id, dataCenterId: dcByCode('DUB-SR1')?.id, regionId: regionOf(dub), climate: 'cold',
    intent: 'Migrate the 40 workloads out of the Dublin server room to the Dublin CO site and retire the room by year end.', ownerName: S.byRole('Program Manager').name, requestedBy: 'IT operations', designPowerKw: 60, targetGoLive: S.daysAgo(20),
    demand: { gpuPct: 0, computePct: 70, storagePct: 30, densityKwPerRack: 4, tenancy: 'single', growthPctPerYear: 0 },
    phases: [phase('P1', 'Wave 1 · non-critical', -4, 30, 4, 100, 'Live'), phase('P2', 'Wave 2 · critical with cut-over', -1, 30, 4, 100, 'Live')],
    params: { densityKwPerRack: 4, hallDesignKw: 100, hallsPerBuilding: 1, tier: 'Tier II', redundancy: 'N', feedVoltage: '400', upsRuntimeMin: 10, generatorFuelHours: 8, coolingType: 'air-crah', coolingRedundancy: 'N', inletSetpointC: 24, pueTarget: 1.8, renewableSharePct: 70, racksPerLeafPair: 16, uplinksPerLeaf: 2, uplinkGbps: '100', oversubscription: 4, carrierCount: 1, operatorOwnedIt: true, refreshYears: 6, suppressionType: 'Pre-action water', securityZones: 2, staffPerMw: 1, sparesPct: 2, contingencyPct: 10, capexPerKw: 400, itCapexPerRack: 0, tariffUsdPerKwh: 0.17, maintenancePctCapex: 2, leaseUsdPerM2Year: 300, revenuePerKwMonth: 0, reservePct: 10, commissioningLevel: '3', whiteSpaceM2PerRack: 2.6, floorLoadingKgPerRack: 800 },
    risks: [risk(1, 'Critical ERP cut-over window overrun', 'Facility', 'Medium', 'High', 'Rehearsed cut-over; rollback plan tested.', 'template')], permits: [], aiAssisted: false, revenuePerKwMonth: 0, tariffUsdPerKwh: 0.17,
  }, [{ name: 'Two waves', description: 'Executed as planned.', overrides: {}, preferred: true }]);

  // 7 · edge rollout, in review
  plan({
    title: 'EU edge rollout · 12 micro sites', scope: 'edge', status: 'In review', templateId: 'TPL-PLAN-edge', dcTypeKey: 'edge-micro-dc', campusId: fra?.id, regionId: regionOf(fra), newSiteName: 'EU-EDGE-01…12', climate: 'temperate',
    intent: 'Twelve 40 kW edge micro sites across Germany and Ireland for latency-sensitive services, identical template, local power variations.', ownerName: planner.name, requestedBy: 'Edge services', designPowerKw: 480, targetGoLive: S.daysAhead(240),
    demand: { gpuPct: 20, computePct: 70, storagePct: 10, densityKwPerRack: 8, tenancy: 'single', growthPctPerYear: 25 },
    phases: [phase('P1', 'Sites 1 to 4', 5, 160, 8, 40, 'Planned'), phase('P2', 'Sites 5 to 8', 7, 160, 8, 40, 'Planned'), phase('P3', 'Sites 9 to 12', 8, 160, 8, 40, 'Planned')],
    params: { densityKwPerRack: 8, hallDesignKw: 40, hallsPerBuilding: 1, tier: 'Tier II', redundancy: 'N+1', feedVoltage: '400', upsRuntimeMin: 30, generatorFuelHours: 24, coolingType: 'air-crah', coolingRedundancy: 'N+1', inletSetpointC: 25, pueTarget: 1.55, renewableSharePct: 60, racksPerLeafPair: 8, uplinksPerLeaf: 2, uplinkGbps: '100', oversubscription: 4, carrierCount: 2, operatorOwnedIt: true, refreshYears: 5, suppressionType: 'Clean agent gas', securityZones: 2, staffPerMw: 0.3, sparesPct: 6, contingencyPct: 20, capexPerKw: 5200, itCapexPerRack: 150000, tariffUsdPerKwh: 0.17, maintenancePctCapex: 3, leaseUsdPerM2Year: 240, revenuePerKwMonth: 260, reservePct: 10, commissioningLevel: '3', whiteSpaceM2PerRack: 2.2, floorLoadingKgPerRack: 800 },
    risks: [risk(1, 'Local power availability differs per site', 'Facility', 'High', 'Medium', 'Site survey before order; two power variants in the template.', 'ai', '3 of 12 surveyed sites have single-phase supply only'), risk(2, 'Planning permission for roof-top generators', 'Regulatory', 'Medium', 'Medium', 'Battery-only variant for sites without generator permission.', 'template')],
    permits: [permit(1, 'Site-specific electrical permits (12)', 'Local authorities', 8, 16, 'Not started')], aiAssisted: true, revenuePerKwMonth: 260, tariffUsdPerKwh: 0.17,
  }, [{ name: 'Generator variant', description: 'Generator on every site.', overrides: {}, preferred: true }, { name: 'Battery-only variant', description: 'No generator; 4-hour battery.', overrides: { generatorFuelHours: 0, upsRuntimeMin: 240, capexPerKw: 4600 } }]);

  // 8 · liquid retrofit, draft (AI-assisted, half-way through the wizard)
  plan({
    title: 'Sydney MTSO-1 · liquid retrofit for GPU racks', scope: 'retrofit', status: 'Draft', templateId: 'TPL-PLAN-retrofit', dcTypeKey: 'mtso', campusId: syd?.id, dataCenterId: dcByCode('SYD')?.id, regionId: regionOf(syd), climate: 'temperate',
    intent: 'Bring 20 GPU racks at 40 kW into Hall 1 with CDUs and rear-door units without disturbing the telco core.', ownerName: planner.name, requestedBy: 'Platform engineering', designPowerKw: 800, targetGoLive: S.daysAhead(200),
    demand: { gpuPct: 90, computePct: 10, storagePct: 0, densityKwPerRack: 40, tenancy: 'single', growthPctPerYear: 30 },
    phases: [phase('P1', 'Rows C and D', 6.5, 800, 40, 1200, 'Planned')],
    params: { densityKwPerRack: 40, hallDesignKw: 1200, hallsPerBuilding: 3, tier: 'Tier III', redundancy: '2N', feedVoltage: '11000', upsRuntimeMin: 12, generatorFuelHours: 48, coolingType: 'liquid-to-chip', coolingRedundancy: 'N+1', inletSetpointC: 28, pueTarget: 1.2, renewableSharePct: 45, racksPerLeafPair: 10, uplinksPerLeaf: 4, uplinkGbps: '400', oversubscription: 2, carrierCount: 3, operatorOwnedIt: true, refreshYears: 4, suppressionType: 'Clean agent gas', securityZones: 4, staffPerMw: 0.8, sparesPct: 4, contingencyPct: 20, capexPerKw: 2200, itCapexPerRack: 1350000, tariffUsdPerKwh: 0.13, maintenancePctCapex: 3, leaseUsdPerM2Year: 0, revenuePerKwMonth: 0, reservePct: 15, commissioningLevel: '5', whiteSpaceM2PerRack: 3, floorLoadingKgPerRack: 1100 },
    risks: [risk(1, 'Floor loading 1,100 kg below liquid-rack need', 'Facility', 'High', 'High', 'Structural survey; spreader plates or relocate to slab area.', 'ai', 'Rule R-SPC-02 fails at 1,100 kg')], permits: [], aiAssisted: true, wizardStep: 6, revenuePerKwMonth: 0, tariffUsdPerKwh: 0.13,
  }, [{ name: 'Rows C and D', description: '20 racks, two CDUs N+1.', overrides: {}, preferred: true }, { name: 'Rear-door only', description: 'Rear-door units without CDU loops, capped at 30 kW per rack.', overrides: { densityKwPerRack: 30, coolingType: 'rear-door', inletSetpointC: 24, pueTarget: 1.3 } }]);

  // 9 · network uplift, approved
  plan({
    title: 'Ashburn to Frankfurt DCI · 400G uplift', scope: 'network', status: 'Approved', templateId: 'TPL-PLAN-network', dcTypeKey: 'enterprise-dc', campusId: ash?.id, dataCenterId: ashDc?.id, peerDataCenterId: dcByCode('FRA-COLO1')?.id, regionId: regionOf(ash), climate: 'temperate',
    intent: 'Upgrade the DCI between Ashburn DC-1 and Frankfurt COLO-1 from 2 × 100G to 2 × 400G with a third diverse path.', ownerName: S.byRole('Network Engineer').name, requestedBy: 'Network architecture', designPowerKw: 0, targetGoLive: S.daysAhead(90),
    demand: { gpuPct: 0, computePct: 100, storagePct: 0, densityKwPerRack: 0, tenancy: 'single', growthPctPerYear: 35 },
    phases: [phase('P1', 'Optics and circuits', 3, 0, 1, 1, 'Approved')],
    params: { densityKwPerRack: 0, hallDesignKw: 0, hallsPerBuilding: 0, tier: 'Tier III', redundancy: '2N', feedVoltage: '33000', upsRuntimeMin: 12, generatorFuelHours: 48, coolingType: 'chilled-water', coolingRedundancy: 'N+1', inletSetpointC: 24, pueTarget: 1.38, renewableSharePct: 55, racksPerLeafPair: 16, uplinksPerLeaf: 4, uplinkGbps: '400', oversubscription: 2, carrierCount: 3, operatorOwnedIt: true, refreshYears: 5, suppressionType: 'Clean agent gas', securityZones: 4, staffPerMw: 0.8, sparesPct: 3, contingencyPct: 10, capexPerKw: 0, itCapexPerRack: 0, tariffUsdPerKwh: 0.09, maintenancePctCapex: 0, leaseUsdPerM2Year: 0, revenuePerKwMonth: 0, reservePct: 15, commissioningLevel: '4', whiteSpaceM2PerRack: 0, floorLoadingKgPerRack: 0 },
    risks: [risk(1, 'Third path shares a duct with path A for 2 km', 'Network', 'Medium', 'High', 'Carrier to prove diversity with KMZ route files before acceptance.', 'template')], permits: [], aiAssisted: false, revenuePerKwMonth: 0, tariffUsdPerKwh: 0.09,
  }, [{ name: 'Two carriers plus one', description: 'Approved design.', overrides: {}, preferred: true }]);

  // 10 · campus expansion, draft (AI-assisted, early)
  const ashDcs = S.dataCenters.filter(d => d.campusId === ash?.id);
  const ashCommittedMw = Math.round(ashDcs.reduce((a, d) => a + d.designPowerKw * (DC_TYPE_CATALOG.find(x => x.key === d.dcTypeKey)?.pueTarget ?? 1.4), 0) / 100) / 10;
  const ashHeadMw = Math.round((ASH_CAMPUS_INTAKE_KW / 1000 - ashCommittedMw) * 10) / 10;
  plan({
    title: 'Ashburn campus · Building C · 20 MW', scope: 'expansion', status: 'Draft', templateId: 'TPL-PLAN-expansion', dcTypeKey: 'hyperscale-dc', campusId: ash?.id, regionId: regionOf(ash), newSiteName: 'ASH-DC2', climate: 'temperate',
    intent: 'Forecast says Ashburn runs out of power in 11 months; add a 20 MW building on the existing campus sharing the substation.', ownerName: planner.name, requestedBy: 'Capacity planning', designPowerKw: 20000, targetGoLive: S.daysAhead(540),
    demand: { gpuPct: 40, computePct: 45, storagePct: 15, densityKwPerRack: 20, tenancy: 'single', growthPctPerYear: 22 },
    phases: [phase('P1', 'Halls 1 to 4', 18, 10000, 20, 2500, 'Planned'), phase('P2', 'Halls 5 to 8', 26, 10000, 20, 2500, 'Planned')],
    params: { densityKwPerRack: 20, hallDesignKw: 2500, hallsPerBuilding: 8, tier: 'Tier III', redundancy: '2N', feedVoltage: '132000', upsRuntimeMin: 12, generatorFuelHours: 48, coolingType: 'air-economiser', coolingRedundancy: 'N+1', inletSetpointC: 26, pueTarget: 1.25, renewableSharePct: 60, racksPerLeafPair: 16, uplinksPerLeaf: 4, uplinkGbps: '400', oversubscription: 3, carrierCount: 4, operatorOwnedIt: true, refreshYears: 5, suppressionType: 'Clean agent gas', securityZones: 5, staffPerMw: 0.6, sparesPct: 3, contingencyPct: 15, capexPerKw: 3200, itCapexPerRack: 260000, tariffUsdPerKwh: 0.09, maintenancePctCapex: 2.5, leaseUsdPerM2Year: 0, revenuePerKwMonth: 140, reservePct: 15, commissioningLevel: '5', whiteSpaceM2PerRack: 2.6, floorLoadingKgPerRack: 1000 },
    risks: [risk(1, `Campus intake leaves ${ashHeadMw} MW, enough for phase 1 only`, 'Facility', 'High', 'High', 'Utility uprate request submitted; phase 2 depends on it.', 'actual', `Ashburn campus intake ${ASH_CAMPUS_INTAKE_KW / 1000} MW per side (utility feeds); existing buildings are entitled to ${ashCommittedMw} MW of facility load (design IT × PUE); Building C needs 12.5 MW for phase 1 and 25 MW at full build at PUE 1.25`)], permits: [permit(1, 'Utility uprate', 'Dominion Energy', 52, 60, 'Applied'), permit(2, 'Building permit', 'Loudoun County', 20, 30, 'Not started')], aiAssisted: true, wizardStep: 5, revenuePerKwMonth: 140, tariffUsdPerKwh: 0.09,
  }, [{ name: 'Two phases', description: 'Eight halls over two phases.', overrides: {}, preferred: true }, { name: 'Three phases, slower', description: 'Match the utility uprate date.', overrides: { contingencyPct: 25 } }]);

  // 11 · regional portfolio, draft
  plan({
    title: 'LATAM capacity portfolio 2027', scope: 'portfolio', status: 'Draft', templateId: 'TPL-PLAN-portfolio', dcTypeKey: 'regional-edge-dc', campusId: gru?.id, regionId: regionOf(gru), climate: 'hot-humid',
    intent: 'Decide whether 2027 growth in LATAM goes into São Paulo expansion or a second site in Santiago, and the DCI between them.', ownerName: S.byRole('Executive').name, requestedBy: 'Regional leadership', designPowerKw: 6000, targetGoLive: S.daysAhead(420),
    demand: { gpuPct: 15, computePct: 65, storagePct: 20, densityKwPerRack: 10, tenancy: 'multi', growthPctPerYear: 28 },
    phases: [phase('P1', 'São Paulo Hall 3 (new)', 10, 3000, 10, 1500, 'Planned'), phase('P2', 'Santiago site', 14, 3000, 10, 1500, 'Planned')],
    params: { densityKwPerRack: 10, hallDesignKw: 1500, hallsPerBuilding: 4, tier: 'Tier III', redundancy: 'N+1', feedVoltage: '33000', upsRuntimeMin: 12, generatorFuelHours: 48, coolingType: 'chilled-water', coolingRedundancy: 'N+1', inletSetpointC: 25, pueTarget: 1.45, renewableSharePct: 75, racksPerLeafPair: 16, uplinksPerLeaf: 4, uplinkGbps: '100', oversubscription: 3, carrierCount: 3, operatorOwnedIt: false, refreshYears: 5, suppressionType: 'Clean agent gas', securityZones: 4, staffPerMw: 0.9, sparesPct: 3, contingencyPct: 20, capexPerKw: 3200, itCapexPerRack: 0, tariffUsdPerKwh: 0.1, maintenancePctCapex: 2.5, leaseUsdPerM2Year: 120, revenuePerKwMonth: 165, reservePct: 15, commissioningLevel: '4', whiteSpaceM2PerRack: 2.6, floorLoadingKgPerRack: 1000 },
    risks: [risk(1, 'Currency exposure on imported plant', 'Finance', 'Medium', 'Medium', 'Hedge at order; local sourcing for racks and cabling.', 'template')], permits: [], aiAssisted: true, wizardStep: 2, revenuePerKwMonth: 165, tariffUsdPerKwh: 0.1,
  }, [{ name: 'São Paulo first', description: 'Expand São Paulo, Santiago in 2028.', overrides: {}, preferred: true }, { name: 'Santiago first', description: 'New site first for latency to Chile and Argentina.', overrides: { capexPerKw: 3500, contingencyPct: 25 } }]);

  // 12 · a rejected plan, for completeness
  plan({
    title: 'Dublin CO · 5 MW expansion (rejected)', scope: 'expansion', status: 'Rejected', templateId: 'TPL-PLAN-expansion', dcTypeKey: 'central-office', campusId: dub?.id, dataCenterId: dcByCode('DUB-CO1')?.id, regionId: regionOf(dub), climate: 'cold',
    intent: 'Add 5 MW to the Dublin central office for enterprise hosting.', ownerName: planner.name, requestedBy: 'Sales', designPowerKw: 5000, targetGoLive: S.daysAhead(300),
    demand: { gpuPct: 10, computePct: 70, storagePct: 20, densityKwPerRack: 10, tenancy: 'multi', growthPctPerYear: 10 },
    phases: [phase('P1', 'Hall 2', 10, 5000, 10, 1500, 'Planned')],
    params: { densityKwPerRack: 10, hallDesignKw: 1500, hallsPerBuilding: 4, tier: 'Tier III', redundancy: 'N+1', feedVoltage: '11000', upsRuntimeMin: 12, generatorFuelHours: 24, coolingType: 'air-economiser', coolingRedundancy: 'N+1', inletSetpointC: 24, pueTarget: 1.22, renewableSharePct: 70, racksPerLeafPair: 16, uplinksPerLeaf: 4, uplinkGbps: '100', oversubscription: 3, carrierCount: 2, operatorOwnedIt: false, refreshYears: 5, suppressionType: 'Clean agent gas', securityZones: 4, staffPerMw: 0.8, sparesPct: 3, contingencyPct: 15, capexPerKw: 4100, itCapexPerRack: 0, tariffUsdPerKwh: 0.17, maintenancePctCapex: 2.5, leaseUsdPerM2Year: 260, revenuePerKwMonth: 120, reservePct: 15, commissioningLevel: '5', whiteSpaceM2PerRack: 2.6, floorLoadingKgPerRack: 1000 },
    risks: [risk(1, 'Grid capacity in Dublin constrained until 2028', 'Regulatory', 'High', 'High', 'None available; plan rejected.', 'actual', 'Utility notice of connection moratorium')], permits: [permit(1, 'Grid connection', 'Distribution operator', 60, 20, 'Expired')], approvals: [{ step: 'Design review', role: 'Design authority', person: S.byRole('Facilities Director').name, decision: 'Approved', at: S.daysAgo(40) }, { step: 'Budget approval', role: 'Finance', person: S.person(2).name, decision: 'Rejected', at: S.daysAgo(30), conditions: 'Payback above 8 years at the current tariff and no grid connection date' }], aiAssisted: true, revenuePerKwMonth: 120, tariffUsdPerKwh: 0.17,
  }, [{ name: 'Submitted', description: 'Rejected on payback and grid.', overrides: {}, preferred: true }]);

  // ── learning loop: feedback on AI suggestions ──
  // ── replacement plans on the previous-generation fleet (seeded by fleet.ts) ──
  /* our fleet has other models: the P2B model names a category, and the site's most common operator-owned model of that category is refreshed */
  const legacyAt = (dc: T.DataCenter | undefined, model: string) => {
    const at = S.devices.filter(d => dc && d.dataCenterId === dc.id && d.rackId && d.ownerTeam !== 'Tenant' && d.lifecycleState === 'Active');
    const exact = at.filter(d => d.model === model); if (exact.length) return exact;
    const cat = /R7|server/i.test(model) ? 'Server' : 'Switch';
    const counts = new Map<string, number>(); for (const d of at.filter(x => x.category === cat)) counts.set(d.model ?? '', (counts.get(d.model ?? '') ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return top ? at.filter(d => d.category === cat && d.model === top).slice(0, 48) : [];
  };
  const replacePlan = (o: { title: string; scope: T.PlannerScope; status: T.PlannerPlanStatus; code: string; devices: T.Device[]; model?: string; intent: string; owner: string; extra: Record<string, number | string | boolean>; weeks: number; unitCost: number; unitsOf: (n: number) => number; racksOnly?: boolean }) => {
    const dc = dcByCode(o.code); if (!dc || !o.devices.length) return;
    const cmp = S.campuses.find(c => c.id === dc.campusId);
    const racks = [...new Set(o.devices.map(d => d.rackId!))];
    const affected = o.racksOnly ? racks.length : o.devices.length;
    const units = o.unitsOf(affected);
    const newKw = Math.max(1, Math.round((o.devices.reduce((a, d) => a + (d.powerDrawW ?? 400), 0) / 1000) * (o.racksOnly ? 1 : 0.7)));
    plan({
      title: o.title, scope: o.scope, status: o.status, templateId: `TPL-PLAN-${o.scope}`, dcTypeKey: dc.dcTypeKey ?? 'enterprise-dc', campusId: dc.campusId, dataCenterId: dc.id, regionId: regionOf(cmp), climate: CAMPUS_CLIMATE[S.dcCampus.get(dc.id) ?? ''] ?? 'temperate',
      intent: o.intent, ownerName: o.owner, requestedBy: o.owner, designPowerKw: newKw, targetGoLive: S.daysAhead(o.weeks * 7),
      demand: { gpuPct: 0, computePct: 80, storagePct: 20, densityKwPerRack: 8, tenancy: 'single', growthPctPerYear: 0 },
      phases: [phase('W1', 'Wave 1', o.weeks / 8, Math.ceil(newKw / 2), 8, 1000, 'Planned'), phase('W2', 'Wave 2', o.weeks / 4.3, newKw - Math.ceil(newKw / 2), 8, 1000, 'Planned')],
      params: { affectedIds: (o.racksOnly ? racks : o.devices.map(d => d.id)).join(','), affectedCount: affected, affectedRacks: racks.length, affectedDevices: o.devices.length, affectedKw: Math.round(o.devices.reduce((a, d) => a + (d.powerDrawW ?? 400), 0) / 1000), replacementUnits: units, replacementUnitCost: o.unitCost, tariffUsdPerKwh: 0.12, contingencyPct: 10, ...o.extra },
      paramSources: { affectedIds: 'user', replacementModel: 'user' },
      risks: [risk(40, 'Workload cut-over overruns the change window', 'Facility', 'Medium', 'Medium', 'Rehearse the first wave; keep rollback racks powered for 48 hours')], permits: [], aiAssisted: false, wizardStep: 4,
    }, [{ name: 'As planned', description: 'Selected devices, catalogue model, waves as entered.', overrides: {}, preferred: true }]);
  };
  replacePlan({ title: 'Ashburn DC-1 · R740 server refresh', scope: 'server-refresh', status: 'In review', code: 'ASH-DC1', devices: legacyAt(dcByCode('ASH-DC1'), 'PowerEdge R740'), intent: 'Replace the PowerEdge R740 fleet in Ashburn DC-1: out of warranty, past end of life, six faulty. Consolidate 2:1 onto R760.', owner: S.byRole('Capacity Planner').name, extra: { replacementModel: 'PowerEdge R760', consolidationRatio: 2, oldEquipment: 'Certified disposal', migrationApproach: 'Rolling, rack by rack', racksPerWave: 4 }, weeks: 16, unitCost: 14000, unitsOf: n => Math.ceil(n / 2) });
  replacePlan({ title: 'Dublin CO-1 · Nexus 3172 leaf refresh', scope: 'network-refresh', status: 'Draft', code: 'DUB-CO1', devices: legacyAt(dcByCode('DUB-CO1'), 'Nexus 3172PQ'), intent: 'Replace end-of-life Nexus 3172PQ leaves in Dublin CO-1 with Arista 7050X3; reuse optics where they fit.', owner: S.byRole('Network Engineer').name, extra: { replacementModel: '7050X3-48YC8', opticsReusePct: 60, oldEquipment: 'Certified disposal', racksPerWave: 6 }, weeks: 12, unitCost: 38000, unitsOf: n => n });
  replacePlan({ title: 'Frankfurt Colo · 42U rack replacement, row B', scope: 'rack-replace', status: 'Draft', code: 'FRA-COLO1', devices: legacyAt(dcByCode('FRA-COLO1'), 'QFX5100-48S'), intent: 'Swap the old 42U racks holding the QFX5100 leaves for 48U racks with metered A and B power strips.', owner: S.byRole('Facilities Director').name, extra: { rackModel: 'NetShelter SX 48U', replacePdus: true, reRack: true, oldEquipment: 'Certified disposal', racksPerWave: 2 }, weeks: 10, unitCost: 3800 + 2800, unitsOf: n => n, racksOnly: true });

  const caps = ['intent-to-profile', 'sizing-assistant', 'phasing-optimiser', 'cost-estimator', 'risk-predictor', 'compliance-check', 'placement-optimiser', 'document-extraction'];
  const plans = S.plannerPlans;
  for (let i = 0; i < 36; i++) {
    const id = S.nid('FB');
    S.plannerFeedback.push({ id, fbId: id, ...S.meta(S.person(i % 6)), capability: S.cycle(caps, i), planId: S.cycle(plans, i * 5).id, accepted: i % 7 !== 3 && i % 11 !== 5, note: i % 9 === 0 ? 'Benchmark too high for this region' : undefined, at: S.daysAgo(S.int(1, 120)) });
  }
  // Approvals by template path and amount band, approval history, pinned template versions, baselines and the executing plan's artefacts.
  seedPlanGovernance(S, approvalDraws);
  // Each family fills the scope data of its demo plans (waves, paths, plant lines, placements…).
  for (const fam of SCOPE_SEEDS) fam.enrich?.(S, S.plannerPlans);
}
