/**
 * Edge rollout — many small sites, each sized on its own.
 *
 * Every site is a row in `plan.sites` (an edge location from the estate, or a new location)
 * with a power variant: "3-phase + genset", "3-phase + 4 h battery" or "1-phase + 4 h battery".
 * A variant fixes the supply, the backup (generator or battery) and so the plant, the rules and
 * the bill of materials. Nothing here aggregates the sites into one plant: rules run per site
 * and report the worst site of each variant.
 *
 * Unit prices and lead times are benchmarks (seeded by the build family) so the planner can
 * calibrate them; the access circuits are priced from the circuits in the platform.
 */
import type * as T from '../p2b/types';
import type { Evaluation, ParamValue, ScheduleItem, Sourced } from './engine';
import type { BomAdder } from './scopes/types';
import type { PlannerData } from './plannerData';
import { priceOf } from './catalogue';
import { clockMs } from '../compat/clock';

type P = Record<string, Sourced<ParamValue>>;
const num = (p: P, k: string, d = 0) => { const v = p[k]?.value; return typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d; };
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const WEEK = 7 * 864e5;

export interface EdgeVariant {
  key: string; label: string; supply: '3-phase' | '1-phase'; generator: boolean;
  /** Backup runtime on battery at full load, hours (generator variants ride through to the genset). */
  batteryHours?: number;
  /** Benchmark giving the supply assumed when the survey has not recorded one. */
  supplyBenchmark: string; note: string;
}
export const EDGE_VARIANTS: EdgeVariant[] = [
  { key: '3ph-genset', label: '3-phase + genset', supply: '3-phase', generator: true, supplyBenchmark: 'edgeSupplyKva:3-phase', note: 'Three-phase supply, UPS ride-through to a compact diesel genset with automatic transfer.' },
  { key: '3ph-battery', label: '3-phase + 4 h battery', supply: '3-phase', generator: false, batteryHours: 4, supplyBenchmark: 'edgeSupplyKva:3-phase', note: 'Three-phase supply where a generator is not allowed: four hours of lithium-ion battery.' },
  { key: '1ph-battery', label: '1-phase + 4 h battery', supply: '1-phase', generator: false, batteryHours: 4, supplyBenchmark: 'edgeSupplyKva:1-phase', note: 'Single-phase supply only: small site, four hours of lithium-ion battery, no generator.' },
];
export const variantOf = (v?: string): EdgeVariant => EDGE_VARIANTS.find(x => x.key === v || x.label === v) ?? EDGE_VARIANTS[0];

const bm = (benchmarks: T.PlannerBenchmark[], metric: string, d: number) => { const b = benchmarks.find(x => x.metric === metric); return b?.value ?? b?.high ?? d; };
/** Standard ratings the vendors sell. */
const GENSET_KVA = [20, 30, 45, 60, 80, 100, 130, 150, 200, 250];
const DX_UNIT_KW = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80];
const UPS_MODULE_KW = 10;
const ceilTo = (xs: number[], v: number) => xs.find(x => x >= v) ?? Math.ceil(v / 10) * 10;
const RECHARGE_HOURS = 8;
const POWER_FACTOR = 0.95;

/** The sites of an edge plan: the rows that are edge locations or new locations. */
export function edgeRows(plan: T.PlannerPlan): T.PlannerSiteRow[] {
  return (plan.sites ?? []).filter(s => s.ref.kind === 'edgeLocation' || s.ref.kind === 'candidate');
}

export interface EdgeSiteSize {
  row: T.PlannerSiteRow; variant: EdgeVariant; itKw: number; racks: number; facilityKw: number;
  supplyKva: number; supplySource: 'survey' | 'benchmark'; needKva: number;
  upsModules: number; upsKw: number; upsUsableKw: number; batteryKwh: number; runtimeMin: number;
  gensetKva: number; fuelHours: number;
  coolingUnits: number; coolingUnitKw: number;
  wave: number; goLive: string;
}
/** One site at its variant: supply, UPS (N+1 modules), battery, genset and cooling (1+1). */
export function sizeEdgeSite(row: T.PlannerSiteRow, p: P, benchmarks: T.PlannerBenchmark[], pue: number, defaultVariant?: string): EdgeSiteSize {
  // A scenario can take the generators out (no generator permission anywhere): genset sites go to battery.
  const chosen = variantOf(row.variant ?? defaultVariant);
  const v = p['noGenerators']?.value === true && chosen.generator ? variantOf('3ph-battery') : chosen;
  const itKw = Math.max(0, row.itKw);
  const density = Math.max(1, num(p, 'densityKwPerRack', 8));
  const facilityKw = itKw * pue;
  const runtimeMin = v.batteryHours ? v.batteryHours * 60 : Math.max(5, num(p, 'upsRuntimeMin', 15));
  // Usable energy: 90% depth of discharge and inverter losses.
  const batteryKwh = r1((itKw * runtimeMin) / 60 / 0.9);
  const rechargeKw = v.batteryHours ? batteryKwh / RECHARGE_HOURS : 0;
  const needKva = r1((facilityKw + rechargeKw) / POWER_FACTOR);
  const supplyKva = row.supplyKva ?? bm(benchmarks, v.supplyBenchmark, v.supply === '1-phase' ? 23 : 69);
  const upsModules = Math.ceil(itKw / UPS_MODULE_KW) + 1;
  const gensetKva = v.generator ? ceilTo(GENSET_KVA, (facilityKw * 1.25) / 0.8) : 0;
  const coolingUnitKw = ceilTo(DX_UNIT_KW, itKw * 1.1);
  const phases = (row.wave ?? 1);
  return {
    row, variant: v, itKw, racks: itKw > 0 ? Math.ceil(itKw / density) : 0, facilityKw: r1(facilityKw),
    supplyKva, supplySource: row.supplyKva ? 'survey' : 'benchmark', needKva,
    upsModules, upsKw: upsModules * UPS_MODULE_KW, upsUsableKw: (upsModules - 1) * UPS_MODULE_KW, batteryKwh, runtimeMin,
    gensetKva, fuelHours: v.generator ? num(p, 'generatorFuelHours', 24) : 0,
    coolingUnits: 2, coolingUnitKw, wave: phases, goLive: row.goLive,
  };
}

export interface EdgeVariantGroup { variant: EdgeVariant; sites: EdgeSiteSize[]; itKw: number }
export interface EdgeAnalysis { sites: EdgeSiteSize[]; groups: EdgeVariantGroup[]; waves: { wave: number; phase?: T.PlannerPhase; sites: EdgeSiteSize[]; itKw: number }[]; pue: number }
export function edgeAnalysis(plan: T.PlannerPlan, p: P, benchmarks: T.PlannerBenchmark[], pue: number): EdgeAnalysis {
  const def = String(p['defaultVariant']?.value ?? EDGE_VARIANTS[0].label);
  const sites = edgeRows(plan).map(r => sizeEdgeSite(r, p, benchmarks, pue, def));
  const groups = EDGE_VARIANTS.map(v => ({ variant: v, sites: sites.filter(s => s.variant.key === v.key), itKw: sites.filter(s => s.variant.key === v.key).reduce((a, s) => a + s.itKw, 0) })).filter(g => g.sites.length);
  const phases = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const waveNos = [...new Set(sites.map(s => s.wave))].sort((a, b) => a - b);
  const waves = waveNos.map(w => ({ wave: w, phase: phases[w - 1], sites: sites.filter(s => s.wave === w), itKw: sites.filter(s => s.wave === w).reduce((a, s) => a + s.itKw, 0) }));
  return { sites, groups, waves, pue };
}

/* ------------------------------------------------------------------ rules per variant */
export interface EdgeRuleResult { status: 'pass' | 'fail' | 'warn' | 'n/a'; detail: string; value?: string }
const worst = (sites: EdgeSiteSize[], bad: (s: EdgeSiteSize) => boolean) => sites.filter(bad);
const names = (xs: EdgeSiteSize[]) => xs.slice(0, 4).map(s => s.row.name).join(', ') + (xs.length > 4 ? ` and ${xs.length - 4} more` : '');
/** Per-variant answer to a power or cooling rule, naming the sites that fail. */
export function edgeRule(check: string, a: EdgeAnalysis, p: P): EdgeRuleResult | undefined {
  if (!a.sites.length) return { status: 'n/a', detail: 'No sites chosen yet' };
  const per = (fn: (g: EdgeVariantGroup) => string) => a.groups.map(fn).join('; ');
  switch (check) {
    case 'feeds-cover-load': case 'edge-variant-fit': {
      const bad = worst(a.sites, s => s.needKva > s.supplyKva);
      return { status: bad.length ? 'fail' : 'pass', detail: bad.length ? `${bad.length} site(s) need more than their supply: ${bad.slice(0, 3).map(s => `${s.row.name} needs ${s.needKva} kVA on ${s.supplyKva} kVA ${s.variant.supply}${s.supplySource === 'benchmark' ? ' (assumed, not surveyed)' : ''}`).join('; ')}. Lower the site load, upgrade the supply or change the variant.` : per(g => `${g.variant.label}: ${g.sites.length} site(s), largest need ${Math.max(...g.sites.map(s => s.needKva))} kVA within supply`), value: `${a.sites.length - bad.length}/${a.sites.length}` };
    }
    case 'ups-redundancy': {
      const bad = worst(a.sites, s => s.upsUsableKw < s.itKw);
      return { status: bad.length ? 'fail' : 'pass', detail: bad.length ? `UPS short at ${names(bad)}` : per(g => `${g.variant.label}: ${g.sites[0].upsModules} × ${UPS_MODULE_KW} kW modules (N+1) per ${g.sites[0].itKw} kW site`) };
    }
    case 'generator-margin': {
      const gens = a.sites.filter(s => s.variant.generator);
      if (!gens.length) return { status: 'n/a', detail: 'Battery-only variants: no generator by design' };
      const bad = worst(gens, s => s.gensetKva * 0.8 < s.facilityKw * 1.25);
      return { status: bad.length ? 'warn' : 'pass', detail: bad.length ? `Genset below 125% of facility load at ${names(bad)}` : `${gens.length} genset site(s): ${[...new Set(gens.map(s => `${s.gensetKva} kVA for ${s.facilityKw} kW`))].join(', ')}` };
    }
    case 'fuel-hours': {
      const gens = a.sites.filter(s => s.variant.generator); const batt = a.sites.filter(s => !s.variant.generator);
      const need = 24; const fuel = num(p, 'generatorFuelHours', 24);
      const battOk = batt.every(s => (s.variant.batteryHours ?? 0) >= 4);
      const status = (gens.length && fuel < need) || !battOk ? 'warn' : 'pass';
      return { status, detail: [gens.length ? `${gens.length} genset site(s) with ${fuel} h of fuel (${need} h expected)` : '', batt.length ? `${batt.length} battery site(s) with ${batt[0].variant.batteryHours} h of battery` : ''].filter(Boolean).join('; ') };
    }
    case 'cooling-n1': {
      const bad = worst(a.sites, s => s.coolingUnitKw < s.itKw * 1.1);
      return { status: bad.length ? 'fail' : 'pass', detail: bad.length ? `Cooling short with one unit lost at ${names(bad)}` : per(g => `${g.variant.label}: 2 × ${g.sites[0].coolingUnitKw} kW units per site, one carries the load`) };
    }
    case 'carrier-diversity': {
      const c = num(p, 'accessCircuitsPerSite', 2);
      return { status: c >= 2 ? 'pass' : 'fail', detail: `${c} diverse access circuit(s) per site × ${a.sites.length} sites` };
    }
    case 'oversub-gpu': return { status: 'n/a', detail: 'Edge sites have a top-of-rack pair, not a leaf-spine fabric' };
    case 'hall-load-band': return { status: 'n/a', detail: 'Edge enclosures are sized per site (see the site list)' };
    case 'staffing': return { status: 'n/a', detail: `Unmanned sites: field cover of one technician per ${num(p, 'sitesPerFieldTech', 8)} sites (declared), not staff per MW` };
    default: return undefined;
  }
}

/* ------------------------------------------------------------------ bill of materials */
/** Average monthly price of an active internet circuit of edge size (up to 1 Gbps) in the platform, or undefined. */
export function accessCircuitMonthly(data?: PlannerData): { usd: number; sample: number } | undefined {
  const xs = (data?.circuits ?? []).filter(c => c.status === 'Active' && c.purpose === 'Internet' && (c.commitRateMbps ?? 0) > 0 && (c.commitRateMbps ?? 0) <= 1000 && (c.monthlyCostUsd ?? 0) > 0);
  if (!xs.length) return undefined;
  return { usd: r0(xs.reduce((a, c) => a + (c.monthlyCostUsd ?? 0), 0) / xs.length), sample: xs.length };
}

/** Lines per wave and variant (needed for that wave), each with its site list. */
export function edgeBomLines(_plan: T.PlannerPlan, ev: Evaluation, a: EdgeAnalysis, add: BomAdder): void {
  const b = ev.ctx.benchmarks; const p = ev.params;
  const price = (metric: string, d: number) => bm(b, metric, d);
  const circuits = accessCircuitMonthly(ev.ctx.data);
  const perSiteCircuits = num(p, 'accessCircuitsPerSite', 2);
  const ownIt = p['operatorOwnedIt']?.value !== false;
  for (const w of a.waves) {
    const needBy = w.phase ? new Date(new Date(w.phase.goLive).getTime() - 6 * WEEK).toISOString() : undefined;
    for (const v of EDGE_VARIANTS) {
      const ss = w.sites.filter(s => s.variant.key === v.key); if (!ss.length) continue;
      const n = ss.length; const where = ss.map(s => s.row.name).join(', ');
      const tag = `Wave ${w.wave} · ${v.label}`;
      const common = { phaseId: w.phase?.id, needBy, siteRef: where, manufacturer: 'To tender' } as const;
      const sum = (f: (s: EdgeSiteSize) => number) => ss.reduce((acc, s) => acc + f(s), 0);
      add({ ...common, kind: 'enclosure', category: 'Racks and containment', item: 'Prefabricated enclosure', spec: `${tag}: weatherproof micro data centre, fire rated`, qty: n, unit: 'site', unitCost: priceOf('EcoStruxure modular enclosure') ?? 85000, leadItem: 'Prefabricated enclosure', manufacturer: 'Schneider' });
      add({ ...common, kind: 'utility', category: 'Power', item: 'DNO connection', spec: `${tag}: ${v.supply} supply, ${Math.max(...ss.map(s => s.supplyKva))} kVA`, qty: n, unit: 'site', unitCost: price(v.supply === '1-phase' ? 'price:dnoConnection1ph' : 'price:dnoConnection3ph', v.supply === '1-phase' ? 8000 : 30000), leadItem: 'DNO connection', manufacturer: 'Local distribution operator' });
      add({ ...common, kind: 'ups-small', category: 'Power', item: 'UPS per site', spec: `${tag}: ${ss[0].upsModules} × ${UPS_MODULE_KW} kW modules (N+1)`, qty: sum(s => s.upsKw), unit: 'kW', unitCost: price('price:edgeUpsPerKw', 450), leadItem: 'Small UPS' });
      add({ ...common, kind: 'ups-small', category: 'Power', item: 'Lithium-ion battery', spec: `${tag}: ${ss[0].runtimeMin >= 60 ? `${r1(ss[0].runtimeMin / 60)} h` : `${ss[0].runtimeMin} min`} at full load, priced by kWh`, qty: sum(s => s.batteryKwh), unit: 'kWh', unitCost: price('price:liIonBatteryPerKwh', 450), leadItem: 'Small UPS' });
      if (v.generator) {
        add({ ...common, kind: 'generator-small', category: 'Power', item: 'Generator per site', spec: `${tag}: compact diesel genset ${ss[0].gensetKva} kVA, ${ss[0].fuelHours} h fuel`, qty: sum(s => s.gensetKva), unit: 'kVA', unitCost: price('price:compactGensetPerKva', 320), leadItem: 'Small generator' });
        add({ ...common, kind: 'generator-small', category: 'Power', item: 'Automatic transfer switch', spec: `${tag}: mains to genset`, qty: n, unit: 'site', unitCost: price('price:atsPerSite', 8000), leadItem: 'Small generator' });
      }
      add({ ...common, kind: 'cooling-small', category: 'Cooling', item: 'Cooling per site', spec: `${tag}: 2 × ${ss[0].coolingUnitKw} kW direct-expansion units (1+1)`, qty: sum(s => s.coolingUnits * s.coolingUnitKw), unit: 'kW', unitCost: price('price:dxCoolingPerKw', 950), leadItem: 'Prefabricated enclosure' });
      add({ ...common, kind: 'suppression', category: 'Fire and security', item: 'Enclosure fire kit', spec: `${tag}: detection and integrated clean-agent suppression`, qty: n, unit: 'site', unitCost: price('price:enclosureFireKit', 18000) });
      add({ ...common, kind: 'access', category: 'Fire and security', item: 'Enclosure security kit', spec: `${tag}: access control, two cameras, intrusion alarm`, qty: n, unit: 'site', unitCost: price('price:enclosureSecurityKit', 22000) });
      add({ ...common, kind: 'bms', category: 'Monitoring', item: 'Remote monitoring kit', spec: `${tag}: power, temperature, door and leak sensors to the NOC`, qty: n, unit: 'site', unitCost: price('price:remoteMonitoringKit', 6000) });
      add({ ...common, kind: 'rack', category: 'Racks and containment', item: 'Rack', spec: `${tag}: 42U inside the enclosure`, qty: sum(s => s.racks), unit: 'each', unitCost: priceOf('VR3300 42U') ?? 3200, leadItem: 'Racks and containment', manufacturer: 'Vertiv' });
      add({ ...common, kind: 'rack-pdu', category: 'Power', item: 'Rack power strips', spec: `${tag}: two per rack, metered`, qty: sum(s => s.racks) * 2, unit: 'each', unitCost: priceOf('Geist rPDU 3-phase') ?? 1400, leadItem: 'PDU', manufacturer: 'Vertiv' });
      // The catalogue has no branch firewall or SD-WAN model yet, so these are priced from the edge benchmarks (kind 'install' keeps the price through sourcing).
      add({ ...common, kind: 'install', category: 'Network', item: 'Edge router and firewall', spec: `${tag}: two per site (redundant pair), branch class`, qty: n * 2, unit: 'each', unitCost: price('price:edgeRouterFirewall', 14000), leadItem: 'Edge network kit', manufacturer: 'Palo Alto Networks', model: 'PA-400 series' });
      add({ ...common, kind: 'leaf', category: 'Network', item: 'Top-of-rack switch pair', spec: `${tag}: two per site`, qty: n * 2, unit: 'each', unitCost: priceOf('Catalyst 9300-48P') ?? 9000, leadItem: 'Edge network kit', manufacturer: 'Cisco', model: 'Catalyst 9300-48P' });
      add({ ...common, kind: 'install', category: 'Network', item: 'SD-WAN appliance', spec: `${tag}: one per site, with out-of-band LTE`, qty: n, unit: 'each', unitCost: price('price:sdwanAppliance', 4500), leadItem: 'Edge network kit', manufacturer: 'Fortinet', model: 'FortiGate 100F' });
      add({ ...common, kind: 'dci', category: 'Network', item: 'Access circuit', spec: `${tag}: ${perSiteCircuits} diverse circuits per site, billed monthly${circuits ? ` (average of ${circuits.sample} active 1 Gbps internet circuits in the platform)` : ' (no priced circuits in the platform: benchmark)'}`, qty: n * perSiteCircuits, unit: 'circuit / month', unitCost: circuits?.usd ?? price('price:accessCircuitMonthly', 1800), leadItem: 'Access circuits', manufacturer: 'Carrier', monthly: true });
      add({ ...common, kind: 'install', category: 'Power', item: 'Installation and integration', spec: `${tag}: place, connect, power on and test`, qty: n, unit: 'site', unitCost: price('price:edgeInstallPerSite', 28000) });
      if (ownIt) add({ ...common, kind: 'server', category: 'Compute and storage', item: 'Compute racks', spec: `${tag}: servers per rack at ${num(p, 'densityKwPerRack', 8)} kW`, qty: sum(s => s.racks), unit: 'rack', unitCost: num(p, 'itCapexPerRack', 150000), leadItem: 'General servers' });
    }
  }
}

/* ------------------------------------------------------------------ schedule per wave */
/** Long-lead items per wave: enclosure, DNO connection, small genset and UPS, network kit, circuits. */
export function edgeSchedule(plan: T.PlannerPlan, a: EdgeAnalysis, p: P, benchmarks: T.PlannerBenchmark[], now = clockMs()): ScheduleItem[] {
  const contingency = 1 + num(p, 'contingencyPct', 15) / 100;
  const ordered = ['Approved', 'Executing', 'Completed'].includes(plan.status);
  const out: ScheduleItem[] = [];
  for (const w of a.waves) {
    if (!w.phase) continue;
    const goLive = new Date(w.phase.goLive).getTime();
    const add = (item: string, bmName: string, weeksBefore: number, note: string) => {
      const b = benchmarks.find(x => x.metric === `leadWeeks:${bmName}`);
      const weeks = r0((b?.high ?? b?.value ?? 12) * contingency);
      const needBy = goLive - weeksBefore * WEEK; const orderBy = needBy - weeks * WEEK;
      out.push({ item: `${item} · wave ${w.wave}`, leadWeeks: weeks, needBy: new Date(needBy).toISOString(), orderBy: new Date(orderBy).toISOString(), late: !ordered && orderBy < now, phase: w.phase!.name, phaseId: w.phase!.id, kind: 'equipment', source: 'procure', note });
    };
    const n = w.sites.length;
    add('Prefabricated enclosures', 'Prefabricated enclosure', 6, `${n} enclosures, delivered before install`);
    add('DNO connections', 'DNO connection', 6, `${n} supplies energised before install`);
    if (w.sites.some(s => s.variant.generator)) add('Compact gensets', 'Small generator', 5, `${w.sites.filter(s => s.variant.generator).length} genset sites`);
    add('UPS and batteries', 'Small UPS', 5, `${n} sites`);
    add('Edge network kit', 'Edge network kit', 4, `${n * 2} routers and firewalls, ${n * 2} switches, ${n} SD-WAN`);
    add('Access circuits', 'Access circuits', 3, `${n * num(p, 'accessCircuitsPerSite', 2)} circuits live before acceptance`);
    out.push({ item: `Site acceptance (SAT) · wave ${w.wave}`, leadWeeks: 0, needBy: new Date(goLive - WEEK).toISOString(), orderBy: new Date(goLive - WEEK).toISOString(), late: false, phase: w.phase.name, phaseId: w.phase.id, kind: 'gate', note: `${n} sites accepted before go-live` });
  }
  return out;
}

/* ------------------------------------------------------------------ permits per site and variant */
/** What each site needs filed: lease or landlord consent, the DNO connection, and planning for a genset. */
export function edgePermitsFor(plan: T.PlannerPlan, now = clockMs()): T.PlannerPermit[] {
  const phases = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const out: T.PlannerPermit[] = [];
  for (const r of edgeRows(plan)) {
    const v = variantOf(r.variant);
    const goLive = new Date(phases[(r.wave ?? 1) - 1]?.goLive ?? r.goLive ?? plan.targetGoLive).getTime() || now;
    const at = (weeksBefore: number) => new Date(goLive - weeksBefore * WEEK).toISOString();
    const base = { siteRef: r.id, gatesPhaseId: phases[(r.wave ?? 1) - 1]?.id, status: 'Not started' as const };
    out.push({ ...base, id: `PM-${r.id}-L`, name: `Lease and landlord consent · ${r.name}`, authority: 'Landlord', leadWeeks: 12, neededBefore: at(22), gatesProjectKey: 'power-drop' });
    out.push({ ...base, id: `PM-${r.id}-D`, name: `DNO connection offer · ${r.name}`, authority: r.country === 'Ireland' ? 'ESB Networks' : r.country === 'Germany' ? 'Local Verteilnetzbetreiber' : 'Distribution operator', leadWeeks: 12, neededBefore: at(22), gatesProjectKey: 'power-drop' });
    if (v.generator) out.push({ ...base, id: `PM-${r.id}-G`, name: `Planning permit for the genset · ${r.name}`, authority: 'Local planning authority', leadWeeks: 13, neededBefore: at(6), gatesProjectKey: 'install' });
  }
  return out;
}

/* ------------------------------------------------------------------ per-site ladder */
export interface EdgeLadderRow { site: EdgeSiteSize; installedKw: number; day1Kw: number; month12Kw: number; month24Kw: number; crossesMonth?: number; status: 'ok' | 'tight' | 'full' }
/** Each site's load forecast: an initial fill, then the plan's growth; flags the month a site passes 85%. */
export function edgeLadder(plan: T.PlannerPlan, a: EdgeAnalysis, p: P): EdgeLadderRow[] {
  const fill = num(p, 'initialFillPct', 60) / 100; const g = plan.demand.growthPctPerYear / 100;
  return a.sites.map(s => {
    const at = (m: number) => r1(s.itKw * fill * Math.pow(1 + g, m / 12));
    const cross = g > 0 && fill > 0 ? r1(Math.log(0.85 / fill) / Math.log(1 + g) * 12) : undefined;
    const m24 = at(24);
    return { site: s, installedKw: s.itKw, day1Kw: at(0), month12Kw: at(12), month24Kw: m24, crossesMonth: cross !== undefined && cross >= 0 ? cross : undefined, status: m24 > s.itKw ? 'full' : m24 > s.itKw * 0.85 ? 'tight' : 'ok' };
  });
}
