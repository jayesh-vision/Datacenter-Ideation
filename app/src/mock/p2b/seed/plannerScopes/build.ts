/* Planner seed · build family (see src/modules/planner/lib/scopes/build.ts).
   Inputs, rules and benchmarks for new data centres, site expansions, regional portfolios and edge
   rollouts; commissioning checklist templates; and the scope data of the demo plans:
   PLN-0001 (Frankfurt new site: feasibility and three candidate plots), PLN-0007 (EU edge: twelve
   real edge locations in Germany and Ireland with power variants and waves), PLN-0010 and PLN-0012
   (campus expansions with their uprates and building names) and PLN-0011 (LATAM allocation). */
import type * as T from '../../../../planner/p2b/types';
import type { Seed } from '../ctx';
import type { ScopeSeed } from './types';
import { edgePermitsFor, EDGE_VARIANTS } from '../../../../planner/lib/buildEdge';

const P = (key: string, label: string, aspect: T.PlannerAspect, type: T.PlannerParamDef['type'], extra: Partial<T.PlannerParamDef> = {}): T.PlannerParamDef => ({ key, label, aspect, type, ...extra });
const RULE = (id: string, aspect: T.PlannerAspect, severity: T.PlannerRuleSeverity, title: string, check: string, extra: Partial<T.PlannerRuleDef> = {}): T.PlannerRuleDef => ({ id, aspect, severity, title, check, ...extra });

/** Commissioning checklists: "level | step | method | expected result" (copied into ATP steps on execution). */
const CX_CHECKLISTS: { id: string; name: string; description: string; items: string[] }[] = [
  { id: 'TPL-CHK-CX-POWER', name: 'Commissioning · power', description: 'Factory, site, pre-functional and functional tests of the power chain.', items: [
    'L1 FAT | UPS module factory test | Load bank at 100% for 4 h at the factory | Rated output held, efficiency within the datasheet',
    'L1 FAT | Generator factory test | Load bank steps 25, 50, 75 and 100% | Voltage and frequency within ISO 8528 class G3',
    'L2 SAT | Switchgear and transformer installation check | Visual, torque and insulation resistance | Readings within the manufacturer limits',
    'L3 Pre-functional | UPS start-up and battery discharge | Discharge at full load to cut-off | Runtime at or above the design runtime',
    'L4 Functional | UPS transfer to battery | Open the mains breaker | Load holds on battery with no drop',
    'L4 Functional | Generator auto-start | Simulate mains failure | Genset online in under 15 s',
    'L4 Functional | Static transfer switch failover | Drop source A | Load transfers to source B without interruption',
  ] },
  { id: 'TPL-CHK-CX-COOLING', name: 'Commissioning · cooling', description: 'Factory, site, pre-functional and functional tests of the cooling plant.', items: [
    'L1 FAT | Chiller or CDU factory test | Witness the performance test | Capacity and approach temperature as specified',
    'L2 SAT | Pipework pressure test | Hydrostatic test at 1.5 × working pressure for 2 h | No pressure drop and no leaks',
    'L3 Pre-functional | Flushing and water quality | Flush and sample the loop | Water quality within the CDU specification',
    'L4 Functional | Cooling with one unit lost | Stop the largest unit at design load | Inlet temperatures stay within the setpoint band',
    'L4 Functional | Pump changeover | Fail the duty pump | Standby pump takes over and flow is restored in under 30 s',
  ] },
  { id: 'TPL-CHK-CX-CONTROLS', name: 'Commissioning · controls and monitoring', description: 'BMS and DCIM points, alarm routing and sequences of operation.', items: [
    'L2 SAT | BMS and DCIM points | Point-to-point check of every sensor and meter | Every point reads and alarms correctly',
    'L3 Pre-functional | Alarm routing | Trigger each alarm class | The alarm reaches the NOC and the on-call engineer',
    'L4 Functional | Sequences of operation | Run each written sequence | Plant follows the written sequence',
  ] },
  { id: 'TPL-CHK-CX-NETWORK', name: 'Commissioning · network', description: 'Cabling certification, fabric and carrier failover.', items: [
    'L2 SAT | Fibre and copper certification | OTDR and copper certification of every link | Loss within budget and results filed',
    'L4 Functional | Fabric failover | Fail a spine and a leaf uplink | Traffic reroutes with no loss beyond the convergence target',
    'L4 Functional | Carrier diversity | Fail carrier A | Traffic carried by carrier B',
  ] },
  { id: 'TPL-CHK-CX-IST', name: 'Commissioning · integrated systems test (L5)', description: 'The whole site under load: go-live needs this accepted.', items: [
    'L5 IST | Loss of utility at full load | Open the incomer with load banks at design load | Generators carry the load; IT and cooling temperatures stay in band',
    'L5 IST | Black building restart | Restore power after a full outage | Plant restarts in sequence without manual action',
    'L5 IST | Fire alarm cause and effect | Trigger the fire alarm in each zone | Suppression, shutdowns and notifications as designed',
  ] },
  { id: 'TPL-CHK-EDGE-SAT', name: 'Edge site acceptance (SAT)', description: 'What each edge site must pass before it takes service.', items: [
    'L2 SAT | Power failover | Open the mains supply at full load | Battery carries the load; the genset starts where fitted',
    'L2 SAT | Cooling with one unit lost | Stop one cooling unit | Inlet temperature stays within the setpoint band',
    'L2 SAT | Remote monitoring | Trigger power, temperature, door and leak alarms | Every alarm reaches the NOC',
    'L2 SAT | Physical security | Badge in, force the door, check the cameras | Access logged, intrusion alarm raised, cameras recording',
    'L4 Functional | WAN failover | Fail access circuit A | Traffic carried by circuit B and SD-WAN',
  ] },
];

export const buildSeed: ScopeSeed = {
  params: {
    'new-dc': [
      P('siteAreaRatio', 'Plot area per m² of building footprint', 'space', 'number', { default: 1.8, min: 1.2, max: 4, help: 'Adds the generator yard, substation, roads, parking and setbacks to the building footprints' }),
      P('candidateWeights', 'Candidate scorecard weights', 'risk', 'text', { default: '30,25,20,15,10', help: 'Time to power, CapEx and land, energy cost, latency, risk (comma separated)' }),
    ],
    expansion: [P('campusSharedFte', 'Campus roles already in place', 'operations', 'number', { unit: 'FTE', default: 4, min: 0, max: 30, help: 'NOC, security and site management the campus already staffs; not hired again' })],
    portfolio: [
      P('dciGbpsPerMw', 'Interconnect per MW', 'network', 'number', { unit: 'Gbps/MW', default: 20, min: 1, max: 400, help: 'Interconnect capacity between two sites per MW of the smaller one' }),
      P('planningHorizonYears', 'Planning horizon', 'schedule', 'number', { unit: 'years', default: 5, min: 2, max: 10 }),
    ],
    edge: [
      P('defaultVariant', 'Power variant for new sites', 'power', 'select', { options: EDGE_VARIANTS.map(v => v.label), default: EDGE_VARIANTS[0].label, help: 'Each site can have its own variant on Requirements' }),
      P('accessCircuitsPerSite', 'Access circuits per site', 'network', 'number', { default: 2, min: 1, max: 4, help: 'Diverse carrier circuits at each site' }),
      P('sitesPerFieldTech', 'Sites per field technician', 'operations', 'number', { default: 8, min: 2, max: 30, help: 'Unmanned sites: one technician covers this many sites' }),
      P('initialFillPct', 'Load at go-live', 'operations', 'number', { unit: '% of site capacity', default: 60, min: 10, max: 100, help: 'Start of each site\'s load forecast' }),
    ],
  },
  exclude: { edge: ['racksPerLeafPair', 'uplinksPerLeaf', 'oversubscription', 'feedVoltage', 'carrierCount', 'staffPerMw'] },
  rules: [
    { rule: RULE('R-SITE-01', 'space', 'hard', 'Buildings fit the buildable plot', 'site-footprint', { standard: 'Site feasibility' }), scopes: ['new-dc'] },
    { rule: RULE('R-SITE-02', 'power', 'hard', 'Facility load within the grid offer', 'grid-offer', { standard: 'Grid connection offer' }), scopes: ['new-dc'] },
    { rule: RULE('R-SITE-03', 'schedule', 'hard', 'Grid energised before phase 1 power-on', 'grid-energisation', { standard: 'Grid connection offer' }), scopes: ['new-dc'] },
    { rule: RULE('R-SITE-04', 'sustainability', 'hard', 'Water demand within the supply', 'water-supply', { standard: 'Site feasibility' }), scopes: ['new-dc'] },
    { rule: RULE('R-SITE-05', 'compliance', 'soft', 'Plot zoned for a data centre', 'zoning', { standard: 'Local planning' }), scopes: ['new-dc'] },
    { rule: RULE('R-SITE-06', 'risk', 'soft', 'At least two candidate sites compared', 'candidates-compared', { standard: 'Organisation site selection policy' }), scopes: ['new-dc'] },
    { rule: RULE('R-CMP-02', 'compliance', 'hard', 'Every permit decided before the project it gates starts', 'permit-gates', { standard: 'Programme gating' }), scopes: ['new-dc', 'expansion', 'edge'] },
    { rule: RULE('R-EXP-01', 'power', 'hard', 'Campus intake carries every phase (with uprates energised by then)', 'campus-headroom', { standard: 'Organisation design standard' }), scopes: ['expansion'] },
    { rule: RULE('R-EXP-02', 'space', 'soft', 'Kind of site suits the load', 'site-kind', { standard: 'Site type profile' }), scopes: ['expansion'] },
    { rule: RULE('R-POR-01', 'schedule', 'hard', 'Capacity allocated to sites and years', 'allocation-defined'), scopes: ['portfolio'] },
    { rule: RULE('R-POR-02', 'power', 'hard', 'Each allocation fits the site\'s real headroom or brings its own build', 'allocation-headroom', { standard: 'Site baselines' }), scopes: ['portfolio'] },
    { rule: RULE('R-POR-03', 'schedule', 'soft', 'Forecast demand plus reserve met every year', 'allocation-gap'), scopes: ['portfolio'] },
    { rule: RULE('R-POR-04', 'schedule', 'hard', 'Each allocation can be live by its date', 'allocation-lead', { standard: 'Delivery duration benchmarks' }), scopes: ['portfolio'] },
    { rule: RULE('R-EDGE-01', 'power', 'hard', 'Each site\'s supply carries its power variant', 'edge-variant-fit', { standard: 'Organisation edge standard' }), scopes: ['edge'] },
  ],
  dropRules: {
    expansion: ['R-PWR-01'],
    edge: ['R-PWR-01'],
    portfolio: ['R-PWR-01', 'R-PWR-02', 'R-PWR-03', 'R-PWR-04', 'R-SPC-01', 'R-SPC-02'],
  },
  aspects: {
    expansion: { migration: 'skipped' },
    portfolio: { compliance: 'summary', supply: 'summary' },
    edge: { commissioning: 'summary', operations: 'summary' },
  },
  outputs: {
    'new-dc': ['Basis of design', 'Site feasibility and candidate scorecard', 'Capacity plan', 'Bill of materials and budget', 'IP and network plan', 'Programme per phase with permit gates', 'Commissioning test plan (L1 to L5 per phase)', 'Business case', 'Risk and permit registers'],
    expansion: ['Basis of design', 'Campus intake and shared plant', 'Capacity plan', 'Incremental bill of materials', 'IP and network plan', 'Programme per hall block with permit gates', 'Commissioning test plan (L1 to L5 per phase)', 'Business case', 'Risk and permit registers'],
    portfolio: ['Demand curve and allocation', 'Gap list', 'Interconnect demand', 'Child plans', 'Business case', 'Risk and permit registers'],
    edge: ['Site list and power variants', 'Bill of materials per wave', 'IP and network plan per site', 'Programme per wave with site work orders', 'Site acceptance tests', 'Permits per site', 'Basis of design'],
  },
  benchmarks: [
    { metric: 'leadWeeks:Prefabricated enclosure', label: 'Lead time · Prefabricated enclosure', category: 'leadtime', unit: 'weeks', low: 12, high: 20, value: 16, source: 'Supplier quotes 2026 (micro data centre enclosures)', indicative: false },
    { metric: 'leadWeeks:DNO connection', label: 'Lead time · DNO connection', category: 'leadtime', unit: 'weeks', low: 12, high: 26, value: 18, source: 'Distribution operator connection offers 2025 to 2026 (Germany, Ireland)' },
    { metric: 'leadWeeks:Small generator', label: 'Lead time · Small generator', category: 'leadtime', unit: 'weeks', low: 8, high: 14, value: 10, source: 'Supplier quotes 2026 (compact gensets up to 250 kVA)', indicative: false },
    { metric: 'leadWeeks:Small UPS', label: 'Lead time · Small UPS', category: 'leadtime', unit: 'weeks', low: 6, high: 12, value: 8, source: 'Supplier quotes 2026 (modular UPS up to 100 kW)', indicative: false },
    { metric: 'leadWeeks:Edge network kit', label: 'Lead time · Edge network kit', category: 'leadtime', unit: 'weeks', low: 6, high: 10, value: 8, source: 'Network vendor lead times 2026', indicative: false },
    { metric: 'leadWeeks:Access circuits', label: 'Lead time · Access circuits', category: 'leadtime', unit: 'weeks', low: 8, high: 16, value: 12, source: 'Carrier provisioning actuals (circuits ordered to activated)' },
    { metric: 'leadWeeks:Grid uprate', label: 'Lead time · Grid uprate', category: 'leadtime', unit: 'weeks', low: 52, high: 104, value: 78, source: 'Utility uprate requests 2024 to 2026' },
    { metric: 'edgeSupplyKva:3-phase', label: 'Edge supply assumed, 3-phase (100 A at 400 V)', category: 'sizing', unit: 'kVA', value: 69, source: 'Standard small commercial connection; replaced by the survey value' },
    { metric: 'edgeSupplyKva:1-phase', label: 'Edge supply assumed, 1-phase (100 A at 230 V)', category: 'sizing', unit: 'kVA', value: 23, source: 'Standard single-phase connection; replaced by the survey value' },
    { metric: 'price:edgeUpsPerKw', label: 'Modular UPS (edge), per kW', category: 'cost', unit: 'USD/kW', value: 450, low: 350, high: 600, source: 'Vendor price book 2026' },
    { metric: 'price:liIonBatteryPerKwh', label: 'Lithium-ion battery, per kWh', category: 'cost', unit: 'USD/kWh', value: 450, low: 350, high: 600, source: 'Vendor price book 2026' },
    { metric: 'price:compactGensetPerKva', label: 'Compact diesel genset, per kVA', category: 'cost', unit: 'USD/kVA', value: 320, low: 250, high: 420, source: 'Vendor price book 2026' },
    { metric: 'price:atsPerSite', label: 'Automatic transfer switch, per site', category: 'cost', unit: 'USD', value: 8000, source: 'Vendor price book 2026' },
    { metric: 'price:dxCoolingPerKw', label: 'Direct-expansion cooling (edge), per kW of unit', category: 'cost', unit: 'USD/kW', value: 950, low: 700, high: 1200, source: 'Vendor price book 2026' },
    { metric: 'price:enclosureFireKit', label: 'Enclosure fire kit (detection and suppression)', category: 'cost', unit: 'USD', value: 18000, low: 15000, high: 30000, source: 'Vendor price book 2026' },
    { metric: 'price:enclosureSecurityKit', label: 'Enclosure security kit (access, cameras, intrusion)', category: 'cost', unit: 'USD', value: 22000, low: 15000, high: 30000, source: 'Vendor price book 2026' },
    { metric: 'price:remoteMonitoringKit', label: 'Remote monitoring kit, per site', category: 'cost', unit: 'USD', value: 6000, source: 'Vendor price book 2026' },
    { metric: 'price:dnoConnection3ph', label: 'DNO connection, 3-phase', category: 'cost', unit: 'USD', value: 30000, low: 15000, high: 60000, source: 'Connection offers 2025 to 2026' },
    { metric: 'price:dnoConnection1ph', label: 'DNO connection, 1-phase', category: 'cost', unit: 'USD', value: 8000, low: 4000, high: 15000, source: 'Connection offers 2025 to 2026' },
    { metric: 'price:edgeRouterFirewall', label: 'Edge router and firewall', category: 'cost', unit: 'USD', value: 14000, low: 9000, high: 22000, source: 'Network vendor price book 2026' },
    { metric: 'price:sdwanAppliance', label: 'SD-WAN appliance with LTE', category: 'cost', unit: 'USD', value: 4500, source: 'Network vendor price book 2026' },
    { metric: 'price:accessCircuitMonthly', label: 'Access circuit, per month (when no circuit is priced in the platform)', category: 'cost', unit: 'USD/month', value: 1800, source: 'Carrier quotes 2026' },
    { metric: 'price:edgeInstallPerSite', label: 'Edge site installation and integration', category: 'cost', unit: 'USD', value: 28000, low: 18000, high: 40000, source: 'Installer framework rates 2026' },
    { metric: 'capexFactor:expansion', label: 'Expansion cost against a new site (shared land, intake, security)', category: 'cost', unit: 'ratio', value: 0.85, low: 0.75, high: 0.95, source: 'Last two campus expansions against the greenfield benchmark' },
    { metric: 'capexFactor:hall', label: 'Hall fit-out cost against a new site', category: 'cost', unit: 'ratio', value: 0.55, source: 'Delivery actuals, last 6 halls' },
    { metric: 'durationWeeks:pod', label: 'Pod or row to ready for service', category: 'leadtime', unit: 'weeks', low: 10, high: 20, value: 14, source: 'Delivery actuals', indicative: false },
    { metric: 'kwPerGpu', label: 'IT load per GPU (server share included)', category: 'sizing', unit: 'kW', value: 1.2, source: 'H100-class servers: 8 GPUs at about 10 kW per server' },
    { metric: 'kwPerServer', label: 'IT load per general server', category: 'sizing', unit: 'kW', value: 0.6, source: 'Fleet average draw (DCIM)' },
    { metric: 'kwPerStorageTb', label: 'IT load per TB of storage', category: 'sizing', unit: 'kW', value: 0.01, source: 'All-flash arrays: about 0.6 kW per 60 TB shelf' },
  ],
  enrich(S: Seed, plans: T.PlannerPlan[]) {
    const planner = S.byRole('Commissioning Engineer');
    // Templates: blueprints and the commissioning checklists.
    const tpl = (id: string) => S.plannerTemplates.find(t => t.id === id);
    const exp = tpl('TPL-PLAN-expansion'); if (exp) exp.blueprintKey = 'campus-expansion';
    const edge = tpl('TPL-PLAN-edge'); if (edge) edge.blueprintKey = 'edge-wave';
    // A new site builds the way its site type builds (an AI factory with the AI blueprint, a hyperscale site with the campus blueprint).
    const nd = tpl('TPL-PLAN-new-dc'); if (nd) delete nd.blueprintKey;
    for (const c of CX_CHECKLISTS) if (!tpl(c.id)) S.plannerTemplates.push({ id: c.id, tplId: c.id, ...S.meta(planner), kind: 'checklist', name: c.name, description: c.description, version: 1, status: 'published', ownerName: planner.name, appliesTo: { level: 'org', label: 'Organisation standard' }, params: [], rules: [], requiredAspects: [], outputs: [], approvalPath: [], labels: ['checklist', 'commissioning'], items: c.items });

    const byPln = (id: string) => plans.find(p => p.plnId === id);
    const months = (m: number) => S.daysAhead(Math.round(m * 30.4));
    const weeksAgo = (w: number) => S.daysAgo(w * 7);

    // ── PLN-0001 · Frankfurt new site: three candidate plots, the first chosen; permit filing dates.
    const fra = byPln('PLN-0001');
    if (fra) {
      const reg = fra.regionId;
      fra.candidates = [
        { id: 'C1', name: 'Frankfurt-Seckbach plot', latitude: 50.148, longitude: 8.725, regionId: reg, climate: 'temperate', plotHa: 18, buildableHa: 12, zoning: 'Zoned for data centre', gridOfferMva: 80, gridEnergisation: months(17), gridFirm: true, waterM3PerDay: 400, fibreRoutes: 3, kmToPop: 9, floodZone: false, seismicZone: false, landCostUsd: 38_000_000, tariffUsdPerKwh: 0.16, incentives: 'District heating heat-reuse grant', chosen: true, notes: 'Grid offer from the transmission operator, firm, 110 kV.' },
        { id: 'C2', name: 'Hanau-Wolfgang plot', latitude: 50.117, longitude: 8.957, regionId: reg, climate: 'temperate', plotHa: 22, buildableHa: 15, zoning: 'Zoned for data centre', gridOfferMva: 100, gridEnergisation: months(26), gridFirm: true, waterM3PerDay: 300, fibreRoutes: 2, kmToPop: 24, floodZone: false, seismicZone: false, landCostUsd: 26_000_000, tariffUsdPerKwh: 0.155, notes: 'Larger offer but energised two years out.' },
        { id: 'C3', name: 'Dietzenbach plot', latitude: 50.009, longitude: 8.789, regionId: reg, climate: 'temperate', plotHa: 14, buildableHa: 8, zoning: 'Rezoning needed', gridOfferMva: 60, gridEnergisation: months(20), gridFirm: false, waterM3PerDay: 250, fibreRoutes: 2, kmToPop: 14, floodZone: true, seismicZone: false, landCostUsd: 21_000_000, tariffUsdPerKwh: 0.16, notes: 'Cheapest land; part of the plot is in the Rodau flood zone.' },
      ];
      const pm = (re: RegExp) => fra.permits.find(x => re.test(x.name));
      const planning = pm(/planning/i); if (planning) { planning.appliedAt = weeksAgo(20); planning.gatesProjectKey = 'site-construction'; }
      const grid = pm(/grid/i); if (grid) { grid.appliedAt = weeksAgo(30); grid.gatesProjectKey = 'liquid-plant'; }
      const building = pm(/building/i); if (building) building.gatesProjectKey = 'site-construction';
      const env = pm(/environment/i); if (env) env.gatesProjectKey = 'liquid-plant';
      const gen = pm(/generator/i); if (gen) gen.gatesProjectKey = 'liquid-plant';
      const id = S.nid('SCN');
      S.plannerScenarios.push({ id, scnId: id, ...S.meta(S.byRole('Capacity Planner')), planId: fra.id, name: 'D · Candidate B, Hanau', description: 'The Hanau plot: cheaper land and a larger grid offer, but energised two years out, so phase 1 needs interim generation or a later date.', overrides: { candidateId: 'C2', tariffUsdPerKwh: 0.155 }, preferred: false });
    }

    // ── PLN-0007 · EU edge: twelve planned or in-progress access sites in Germany and Ireland.
    const eu = byPln('PLN-0007');
    if (eu) {
      const pick = (country: string) => S.edgeLocations.filter(l => l.country === country && (l.status === 'planned' || l.status === 'in-progress'))
        .sort((a, b) => Number(b.kind === 'site') - Number(a.kind === 'site') || Number(b.status === 'planned') - Number(a.status === 'planned') || a.id.localeCompare(b.id)).slice(0, 6);
      const locs = [...pick('Germany'), ...pick('Ireland')];
      const waveDates = [months(9), months(11), months(13)];
      // Three sites have single-phase supply only (survey); two may not have a generator (planning).
      const single = new Set([2, 7, 10]); const noGen = new Set([4, 9]);
      eu.sites = locs.map((l, i) => {
        const variant = single.has(i) ? '1ph-battery' : noGen.has(i) || l.blocker === 'regulatory' ? '3ph-battery' : '3ph-genset';
        const wave = i < 4 ? 1 : i < 8 ? 2 : 3;
        return { id: `ES${i + 1}`, name: l.name, ref: { kind: 'edgeLocation' as const, id: l.id }, variant, itKw: variant === '1ph-battery' ? 10 : 40, goLive: waveDates[wave - 1], wave, route: 'edge' as const, status: 'Accepted' as const, supplyKva: variant === '1ph-battery' ? 23 : 110, city: l.city, country: l.country, latitude: l.latitude, longitude: l.longitude, notes: variant === '1ph-battery' ? 'Single-phase supply only (survey): 10 kW site' : variant === '3ph-battery' ? 'No generator permission expected: battery only' : undefined };
      });
      eu.phases = waveDates.map((d, w) => { const rows = eu.sites!.filter(r => r.wave === w + 1); const kw = rows.reduce((a, r) => a + r.itKw, 0); return { id: `W${w + 1}`, name: `Wave ${w + 1} · ${rows.length} sites`, goLive: d, itKw: kw, halls: rows.length, racks: rows.reduce((a, r) => a + Math.ceil(r.itKw / 8), 0), status: 'Planned' as const }; });
      eu.designPowerKw = eu.sites.reduce((a, r) => a + r.itKw, 0);
      eu.targetGoLive = waveDates[2];
      eu.params = { ...eu.params, siteCount: eu.sites.length, kwPerSite: 40, defaultVariant: EDGE_VARIANTS[0].label, accessCircuitsPerSite: 2, sitesPerFieldTech: 6 };
      eu.permits = edgePermitsFor(eu, S.now);
      const sc = S.plannerScenarios.find(s => s.planId === eu.id && /battery/i.test(s.name));
      if (sc) sc.overrides = { noGenerators: true };
    }

    // ── PLN-0010 · Ashburn Building C: the Dominion uprate (tied to phase 2) and the building permit gating the shell.
    const ash = byPln('PLN-0010');
    if (ash) {
      const up = ash.permits.find(x => /uprate/i.test(x.name)); if (up) { up.upliftKw = 30000; up.appliedAt = weeksAgo(20); up.gatesPhaseId = 'P2'; up.gatesProjectKey = 'mep'; }
      const bp = ash.permits.find(x => /building/i.test(x.name)); if (bp) bp.gatesProjectKey = 'shell';
    }
    // ── PLN-0012 · Dublin (rejected): the new building on DUB-CO1 needs a name.
    const dub = byPln('PLN-0012');
    if (dub && !dub.newSiteName) dub.newSiteName = 'DUB-CO1 Building 2';

    // ── PLN-0011 · LATAM: São Paulo campus expansion behind a grid uprate, then a new site in Santiago.
    const lat = byPln('PLN-0011');
    if (lat) {
      const gru = S.siteByKey('GRU');
      lat.candidates = [{ id: 'C1', name: 'Santiago (Quilicura) plot', latitude: -33.36, longitude: -70.73, regionId: lat.regionId, climate: 'temperate', plotHa: 6, buildableHa: 4, zoning: 'Zoned for data centre', gridOfferMva: 12, gridEnergisation: months(20), gridFirm: true, waterM3PerDay: 120, fibreRoutes: 2, kmToPop: 11, floodZone: false, seismicZone: true, landCostUsd: 7_500_000, tariffUsdPerKwh: 0.12, notes: 'Seismic zone: base isolation in the structure.' }];
      if (gru) lat.params = { ...lat.params, candidateSiteIds: gru.id };
      const campus = S.campuses.find(c => c.id === gru?.campusId);
      lat.sites = [
        { id: 'A1', name: `${campus?.name ?? 'São Paulo'} expansion`, ref: { kind: 'campus', id: gru?.campusId }, itKw: 3000, goLive: months(19), route: 'expansion', status: 'Accepted', notes: 'Behind a grid uprate: the campus intake is already fully committed', latitude: campus?.latitude, longitude: campus?.longitude },
        { id: 'A2', name: 'Santiago (Quilicura) plot (new site)', ref: { kind: 'candidate', id: 'C1' }, itKw: 3000, goLive: months(28), route: 'new-dc', status: 'Accepted', latitude: -33.36, longitude: -70.73 },
      ];
      lat.phases = [
        { id: 'P1', name: 'São Paulo campus expansion', goLive: months(19), itKw: 3000, halls: 2, racks: 300, status: 'Planned' },
        { id: 'P2', name: 'Santiago new site', goLive: months(28), itKw: 3000, halls: 2, racks: 300, status: 'Planned' },
      ];
      lat.permits = [...lat.permits, { id: 'PM-A1', name: 'Grid uprate · São Paulo campus', authority: 'Enel Distribuição São Paulo', leadWeeks: 52, neededBefore: months(14), status: 'Not started', siteRef: 'A1', upliftKw: 5000 }, { id: 'PM-A2', name: 'Grid connection agreement · Santiago', authority: 'Coordinador Eléctrico Nacional', leadWeeks: 40, neededBefore: months(16), status: 'Not started', siteRef: 'A2' }];
      const sc = S.plannerScenarios.find(s => s.planId === lat.id && /santiago first/i.test(s.name));
      if (sc) sc.overrides = { ...sc.overrides, siteAllocation: JSON.stringify([{ ...lat.sites[1], goLive: months(25) }, { ...lat.sites[0], goLive: months(31) }]) };
    }
  },
};
