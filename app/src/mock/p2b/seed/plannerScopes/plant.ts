/* Planner seed · plant family (see src/modules/planner/lib/scopes/plant.ts and lib/plantModel.ts).
   Inputs, rules and benchmarks for plant upgrades, and the scope data of the seeded Dallas plan
   (PLN-0003): plant lines sized against the site's real UPS and cooling records, and its cut-ins. */
import type * as T from '../../../../planner/p2b/types';
import type { Seed } from '../ctx';
import type { ScopeSeed } from './types';

const P = (key: string, label: string, aspect: T.PlannerAspect, type: T.PlannerParamDef['type'], extra: Partial<T.PlannerParamDef> = {}): T.PlannerParamDef => ({ key, label, aspect, type, ...extra });
const RULE = (id: string, aspect: T.PlannerAspect, severity: T.PlannerRuleSeverity, title: string, check: string, extra: Partial<T.PlannerRuleDef> = {}): T.PlannerRuleDef => ({ id, aspect, severity, title, check, ...extra });

export const plantSeed: ScopeSeed = {
  params: {
    plant: [
      // The old single "what is being added" select is replaced by the plant lines; kept out of every step.
      P('plantItems', 'Systems in scope (from the plant lines)', 'it', 'text', { help: 'Set by the plant lines; not an input' }),
      P('plantDesignMarginPct', 'Design margin on UPS, transformers and feeds', 'power', 'number', { unit: '%', default: 10, min: 0, max: 30, help: 'Headroom kept above the committed load; UPS are rarely run above about 90% of usable capacity' }),
      P('generatorRecordedAs', 'Generator ratings in the records are', 'power', 'select', { options: ['Standby (ESP)', 'Prime (PRP)'], default: 'Standby (ESP)', help: 'Tier III and IV need prime or continuous ratings; a standby rating counts at 90%' }),
      P('generatorStartSec', 'Generator start to ready', 'power', 'number', { unit: 's', default: 10, min: 5, max: 60 }),
      P('transferSec', 'Transfer switch time', 'power', 'number', { unit: 's', default: 5, min: 0, max: 30 }),
      P('upsFrameSpareSlots', 'Spare module slots in the UPS frame', 'power', 'number', { min: 0, max: 16, help: 'From the frame nameplate or a vendor survey; the UPS records do not hold it' }),
      P('cutInWindowHours', 'Cut-in window length', 'resilience', 'number', { unit: 'h', default: 6, min: 2, max: 24, help: 'Used to propose windows on change nights' }),
      P('protectionStudyDone', 'Short-circuit and protection study done', 'compliance', 'bool', { default: false }),
      P('arcFlashLabels', 'Arc-flash study and labels updated', 'compliance', 'bool', { default: false }),
      P('fgasCertifiedContractor', 'Refrigerant handled by an F-gas certified contractor', 'compliance', 'bool', { default: false }),
      P('craneLiftPlan', 'Crane, lift plan and structural check', 'risk', 'bool', { default: false }),
      P('loadBankDays', 'Load bank hire for L4 and L5 tests', 'commissioning', 'number', { unit: 'days', default: 5, min: 1, max: 30 }),
      P('costContingencyPct', 'Cost contingency', 'finance', 'number', { unit: '%', default: 10, min: 0, max: 40, help: 'Added to the bill of materials; schedule buffer is separate' }),
    ],
  },
  // Plant works are estimated bottom-up from the bill; space, IT and site-revenue inputs do not apply.
  exclude: { plant: ['revenuePerKwMonth', 'leaseUsdPerM2Year', 'itCapexPerRack', 'capexPerKw', 'inletSetpointC', 'reservePct', 'staffPerMw', 'sparesPct'] },
  rules: [
    { scopes: ['plant'], rule: RULE('R-PLT-01', 'power', 'hard', 'UPS carries the committed and planned load at the target redundancy', 'plant-ups', { standard: 'Uptime Institute tier definitions; organisation design standard' }) },
    { scopes: ['plant'], rule: RULE('R-PLT-02', 'power', 'hard', 'Each utility side and transformer path carries the facility load', 'plant-feeds', { standard: 'Organisation design standard' }) },
    { scopes: ['plant'], rule: RULE('R-PLT-03', 'power', 'soft', 'Generators carry the facility load with the largest set lost and 25% margin', 'plant-generators', { standard: 'Organisation design standard' }) },
    { scopes: ['plant'], rule: RULE('R-PLT-04', 'cooling', 'hard', 'Chillers and room cooling carry the heat load with one unit lost', 'plant-cooling', { standard: 'Organisation design standard' }) },
    { scopes: ['plant'], rule: RULE('R-PLT-05', 'resilience', 'hard', 'Every cut-in leaves enough capacity for the live load', 'plant-cutin-capacity', { standard: 'Concurrent maintainability (Uptime Tier III)' }) },
    { scopes: ['plant'], rule: RULE('R-PLT-06', 'resilience', 'soft', 'Cut-ins below N+1 have a transfer method, mitigation and temporary plant', 'plant-cutin-mitigation') },
    { scopes: ['plant'], rule: RULE('R-PLT-07', 'schedule', 'soft', 'Cut-in windows clear of other windows and changes at the site', 'plant-cutin-clash') },
    { scopes: ['plant'], rule: RULE('R-PLT-08', 'power', 'hard', 'UPS frames have spare slots for the new modules', 'plant-frame-slots') },
    { scopes: ['plant'], rule: RULE('R-PLT-09', 'power', 'hard', 'Battery runtime covers generator start and transfer', 'plant-battery-runtime', { standard: 'Organisation design standard (minimum 5 minutes)' }) },
    { scopes: ['plant'], rule: RULE('R-PLT-10', 'compliance', 'hard', 'Short-circuit and protection study done for the new plant', 'plant-protection-study', { standard: 'IEC 60909 / IEEE 551' }) },
    { scopes: ['plant'], rule: RULE('R-PLT-11', 'compliance', 'soft', 'Arc-flash study and labels updated', 'plant-arc-flash', { standard: 'NFPA 70E / IEEE 1584' }) },
    { scopes: ['plant'], rule: RULE('R-PLT-12', 'compliance', 'hard', 'Emissions permit for added generators', 'plant-emissions-permit') },
    { scopes: ['plant'], rule: RULE('R-PLT-13', 'compliance', 'soft', 'Refrigerant handled under F-gas rules', 'plant-fgas', { standard: 'EU F-gas Regulation / EPA Section 608' }) },
    { scopes: ['plant'], rule: RULE('R-PLT-14', 'risk', 'soft', 'Crane and lift plan for heavy plant', 'plant-lift-plan') },
    { scopes: ['plant'], rule: RULE('R-PLT-15', 'finance', 'soft', 'Cost per kW of plant added within the benchmark band', 'plant-cost-benchmark', { standard: 'Organisation benchmark set' }) },
  ],
  // Greenfield plant sizing, space, IT, staffing and revenue rules do not apply to a plant upgrade.
  dropRules: { plant: ['R-PWR-01', 'R-PWR-02', 'R-PWR-03', 'R-COOL-01', 'R-COOL-02', 'R-COOL-03', 'R-SPC-01', 'R-SPC-02', 'R-NET-01', 'R-NET-02', 'R-SUS-01', 'R-FIN-01', 'R-FIN-02', 'R-SCH-02', 'R-OPS-01'] },
  aspects: { plant: { operations: 'skipped' } },
  approval: { plant: ['Facility manager', 'Electrical authority (facilities sign-off)', 'Finance (by amount)'] },
  outputs: { plant: ['Basis of design (as-is, to-be, cut-ins, studies)', 'Single-line diagram, as-is and to-be', 'Cut-in sequence and method statements', 'Bill of materials and budget', 'Schedule and gates', 'Commissioning plan (L3 to L5)', 'Risk and permit registers'] },
  benchmarks: [
    { metric: 'plantCostPerKw:UPS', label: 'UPS module, supplied', category: 'cost', unit: 'USD/kW', value: 350, low: 280, high: 450, source: 'Vendor price book 2026 (Eaton, Schneider, Vertiv)' },
    { metric: 'plantCostPerKw:Battery', label: 'UPS battery strings per kW for 10 minutes', category: 'cost', unit: 'USD/kW', value: 60, low: 40, high: 90, source: 'Vendor price book 2026 (VRLA and lithium-ion)' },
    { metric: 'plantCostPerKw:Generator', label: 'Diesel generator set with enclosure', category: 'cost', unit: 'USD/kW', value: 450, low: 380, high: 600, source: 'Vendor price book 2026' },
    { metric: 'plantCostPerKw:Transformer', label: 'Transformer per kVA', category: 'cost', unit: 'USD/kVA', value: 62, low: 45, high: 90, source: 'Vendor price book 2026' },
    { metric: 'plantCostPerKw:Switchgear', label: 'Switchgear line-up', category: 'cost', unit: 'USD/line-up', value: 250000, low: 180000, high: 400000, source: 'Vendor price book 2026' },
    { metric: 'plantCostPerKw:Chiller', label: 'Chiller per kW of cooling', category: 'cost', unit: 'USD/kW', value: 400, low: 320, high: 520, source: 'Vendor price book 2026' },
    { metric: 'plantCostPerKw:Dry cooler', label: 'Dry cooler per kW of heat rejection', category: 'cost', unit: 'USD/kW', value: 180, low: 140, high: 240, source: 'Vendor price book 2026' },
    { metric: 'plantCostPerKw:CRAH', label: 'Air handler per kW of cooling', category: 'cost', unit: 'USD/kW', value: 340, low: 280, high: 420, source: 'Vendor price book 2026' },
    { metric: 'plantCostPerKw:CDU', label: 'Coolant distribution unit per kW', category: 'cost', unit: 'USD/kW', value: 350, low: 300, high: 450, source: 'Vendor price book 2026' },
    { metric: 'capexPerKwAdded:plant', label: 'Plant upgrade works per kW of plant added (installed, all-in)', category: 'cost', unit: 'USD/kW', value: 520, low: 380, high: 800, source: 'Organisation benchmark, last five plant upgrades' },
    { metric: 'leadWeeks:Battery strings', label: 'UPS battery strings', category: 'leadtime', unit: 'weeks', value: 10, low: 6, high: 14, source: 'Supplier lead times 2026' },
    { metric: 'leadWeeks:Rental plant (mobilisation)', label: 'Rental generator or chiller mobilisation', category: 'leadtime', unit: 'weeks', value: 1, low: 1, high: 2, source: 'Rental framework agreement' },
  ],
  enrich(S: Seed, plans: T.PlannerPlan[]) {
    // PLN-0003 · Dallas HDC-1: two UPS modules matching the installed frames (one per path) and a fourth chiller matching the
    // installed ones. The load the plan supports is what those works really enable at N+1, with heat rejection, generators and
    // feeds included — not a round number.
    const p = plans.find(x => x.plnId === 'PLN-0003');
    if (!p?.dataCenterId) return;
    const dc = p.dataCenterId;
    const live = (s: string) => s !== 'Failed' && s !== 'Planned' && s !== 'Retired';
    const nAt = (xs: number[]) => (xs.length > 1 ? xs.reduce((a, x) => a + x, 0) - Math.max(...xs) : 0);
    const feeds = S.utilityFeeds.filter(f => f.dataCenterId === dc);
    const sideOf = (feedId?: string) => feeds.find(f => f.id === feedId)?.redundancyRole ?? '';
    const ups = S.upsUnits.filter(u => u.dataCenterId === dc && live(u.status)).sort((a, b) => sideOf(a.feedId).localeCompare(sideOf(b.feedId)) || a.name.localeCompare(b.name));
    const upsA = ups.find(u => sideOf(u.feedId) === 'A-side') ?? ups[0];
    const upsB = ups.find(u => sideOf(u.feedId) === 'B-side') ?? ups[1] ?? ups[0];
    const chillers = S.chillers.filter(c => c.dataCenterId === dc && live(c.status));
    const gens = S.generators.filter(g => g.dataCenterId === dc && live(g.status));
    const zones = S.coolingZones.filter(z => z.dataCenterId === dc);
    const rackDraw = S.racks.filter(r => r.dataCenterId === dc).reduce((a, r) => a + (r.currentPowerKw || 0), 0);
    const itLoad = Math.max(rackDraw, ups.reduce((a, u) => a + (u.loadKw || 0), 0));
    const held = S.capacityReservations.filter(h => h.dataCenterId === dc && h.unit === 'kW' && (h.state === 'Reserved' || h.state === 'Committed')).reduce((a, h) => a + h.quantity, 0);
    const pipeline = plans.filter(x => x.id !== p.id && x.dataCenterId === dc && (x.status === 'Approved' || x.status === 'Executing') && !['plant', 'network', 'migration', 'rack-replace'].includes(x.scope)).reduce((a, x) => a + x.designPowerKw, 0);
    const committed = itLoad + held + pipeline;
    const moduleKw = ups.find(u => u.moduleKw)?.moduleKw ?? (ups.length ? Math.max(...ups.map(u => u.capacityKw)) : 1000);
    const chillerKw = chillers.length ? Math.max(...chillers.map(c => c.capacityKw)) : 1500;
    const make = ups.find(u => u.manufacturer)?.manufacturer;
    // IT each system supports after the works (same rules as lib/plantModel.ts: 10% design margin, 1.1 heat and 1.1 margin on
    // cooling, prime = 90% of a standby generator rating at Tier III and 25% generator margin, PUE from the plan).
    const pue = Number(p.params.pueTarget ?? 1.4) || 1.4;
    const tier3 = /III|IV/.test(String(p.params.tier ?? 'Tier III'));
    const supports = [
      nAt([...ups.map(u => u.capacityKw), moduleKw, moduleKw]) / 1.1,
      chillers.length ? nAt([...chillers.map(c => c.capacityKw), chillerKw]) / (1.1 * 1.1) : Infinity,
      gens.length ? nAt(gens.map(g => g.capacityKw * (tier3 ? 0.9 : 1))) / (pue * 1.25) : Infinity,
      zones.reduce((a, z) => { const u = S.cracUnits.filter(c => c.coolingZoneId === z.id && live(c.status) && c.capacityKw > 0).map(c => c.capacityKw); return a + Math.min(z.coolingCapacityKw || Infinity, nAt(u)); }, 0) / 1.1 || Infinity,
    ];
    const enabled = Math.max(0, Math.min(...supports) - committed);
    // A little below the computed limit so measured loads and rounding do not tip a check; at least the 100 kW a stage needs.
    const designKw = Math.max(100, Math.floor((enabled * 0.95) / 100) * 100);
    const lines: T.PlannerPlantLine[] = [
      { id: 'PL-1', system: 'UPS', action: 'add', targetAssetId: upsA?.id, targetAssetLabel: upsA?.name, model: make ? `${make} module` : 'UPS power module (frame make)', manufacturer: make, ratingKw: moduleKw, qty: 1, stage: 1, notes: 'Module 4 into the A-path frame' },
      { id: 'PL-2', system: 'UPS', action: 'add', targetAssetId: upsB?.id, targetAssetLabel: upsB?.name, model: make ? `${make} module` : 'UPS power module (frame make)', manufacturer: make, ratingKw: moduleKw, qty: 1, stage: 1, notes: 'Module 5 into the B-path frame' },
      { id: 'PL-3', system: 'Chiller', action: 'add', model: chillers[0]?.model ?? 'Air-cooled chiller', ratingKw: chillerKw, qty: 1, stage: 2, notes: chillers.length ? `Chiller 4, matches ${chillers[0].name}` : 'Chiller with its primary pump' },
    ];
    // The cut-in change and window already raised for the first UPS step (by the delivery project) are reused.
    const chg = S.changeRequests.find(c => c.plannerPlanId === p.id && c.type === 'PowerUpgrade');
    const mw = S.maintenanceWindows.find(w => w.plannerPlanId === p.id);
    const g1 = 'Generator on standby, change freeze on the site, rollback rehearsed the day before';
    const cutIns: T.PlannerCutInStep[] = [
      { id: 'CI-1', order: 1, stage: 1, title: `Connect a module to ${upsA?.name ?? 'the A-path UPS'}`, isolatedAssetIds: upsA ? [upsA.id] : [], isolatedLabel: upsA?.name ?? '', transfer: 'Transfer to B path', windowStart: mw?.scheduledStart ?? '', windowEnd: mw?.scheduledEnd ?? '', mitigation: g1, rollback: 'Remove the module from the frame, close the output breaker, return the A path to service', connectsLineIds: ['PL-1'], changeRequestId: chg?.id, maintenanceWindowId: mw?.id, status: chg ? 'Scheduled' : 'Planned' },
      { id: 'CI-2', order: 2, stage: 1, title: `Connect a module to ${upsB?.name ?? 'the B-path UPS'}`, isolatedAssetIds: upsB ? [upsB.id] : [], isolatedLabel: upsB?.name ?? '', transfer: 'Transfer to B path', windowStart: '', windowEnd: '', mitigation: `${g1}; the A path already has its new module`, rollback: 'Remove the module from the frame, close the output breaker, return the B path to service', connectsLineIds: ['PL-2'], status: 'Planned' },
      { id: 'CI-3', order: 3, stage: 2, title: 'Tie the new chiller into the chilled-water header', isolatedAssetIds: chillers[0] ? [chillers[0].id] : [], isolatedLabel: chillers[0]?.name ?? 'none (valves pre-installed)', transfer: 'None', windowStart: '', windowEnd: '', mitigation: chillers.length ? 'Remaining chillers carry the load; valves pre-installed on the header' : 'Tie-in on valves pre-installed on the header; no chiller taken out of service', rollback: 'Close the tie-in valves and drain the new branch', connectsLineIds: ['PL-3'], status: 'Planned' },
    ];
    p.plantLines = lines; p.cutIns = cutIns;
    p.designPowerKw = designKw;
    const sorted = [...p.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
    const first = Math.floor(designKw / 2 / 100) * 100;
    p.phases = sorted.map((ph, i) => ({ ...ph, itKw: sorted.length === 1 ? designKw : i === 0 ? first : i === 1 ? designKw - first : 0 }));
    p.intent = `Add two ${Math.round(moduleKw)} kW UPS modules (${ups.length} installed, N+1) and a ${chillers.length + 1}${chillers.length === 2 ? 'rd' : 'th'} ${Math.round(chillerKw)} kW chiller so Dallas HDC-1 keeps N+1 as IT load grows by about ${(designKw / 1000).toFixed(1)} MW from ${(itLoad / 1000).toFixed(1)} MW today; beyond that the generators set the limit.`;
    p.params = { ...p.params, plantDesignMarginPct: 10, upsFrameSpareSlots: 2, protectionStudyDone: true, arcFlashLabels: true, fgasCertifiedContractor: true, craneLiftPlan: true, costContingencyPct: 15, cutInWindowHours: 6, loadBankDays: 5, plantItems: 'UPS, Chiller' };
    p.paramSources = { ...p.paramSources, plantDesignMarginPct: 'template', upsFrameSpareSlots: 'document', protectionStudyDone: 'document', arcFlashLabels: 'document', fgasCertifiedContractor: 'user', craneLiftPlan: 'user', costContingencyPct: 'user', cutInWindowHours: 'template', loadBankDays: 'template', plantItems: 'user' };
    // The approved baseline records the same scope.
    if (p.baseline) p.baseline = { ...p.baseline, designPowerKw: p.designPowerKw, phases: p.phases.map(ph => ({ ...ph })), params: { ...p.params } };
  },
};
