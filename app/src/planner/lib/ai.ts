/**
 * Planner AI — grounded capabilities. Each function states what it is grounded on
 * (estate records, delivery history, templates and benchmarks) and returns proposals with a
 * source, a confidence and evidence the planner can check: the records it read, by id, with
 * the values it used. Nothing here executes; the planner accepts or rejects, and the feedback
 * collection records the outcome.
 *
 * Every capability is scope-aware. A proposal only appears when it can change something the
 * plan type decides: a server refresh is never asked to add a carrier, a migration is never
 * offered plant sizing, and whole-site cost benchmarks are only used for whole-site plans.
 */
import type * as T from '../p2b/types';
import { DC_TYPE_CATALOG, dcTypeProfile, type DcTypeProfile } from '../p2b/dcTypes';
import { evaluate, WHOLE_SITE_SCOPES, type EstateActuals, type Evaluation, fmtUsd, fmtKw, r0, r1 } from './engine';
import { FAMILY_OF } from './scopes/types';
import type { SiteBaseline } from './site';
import { clockMs } from '../compat/clock';

export interface Evidence { label: string; to?: string }
/** `param` names the plan input the proposal sets (when it sets one). */
export interface Proposal<V = unknown> { capability: string; title: string; value: V; confidence: number; reason: string; source: T.PlannerParamSource; evidence: Evidence[]; param?: string }

/* ------------------------------------------------------------ scope classes */
/** Plans that add racks or IT load (density, cooling type and liquid choices are theirs to make). */
const ADDS_RACKS: T.PlannerScope[] = ['rack', 'pod', 'hall', 'retrofit', 'new-dc', 'expansion', 'portfolio', 'edge'];
/** Plans that design a site's cooling plant and PUE. */
const DESIGNS_SITE: T.PlannerScope[] = ['new-dc', 'expansion', 'portfolio', 'edge'];
/** Plans that bring a new carrier entry into being (a new site) or design inter-site paths. */
const OWNS_CARRIERS: T.PlannerScope[] = ['new-dc', 'expansion', 'edge', 'network'];
const isInSite = (scope: T.PlannerScope) => FAMILY_OF[scope] === 'in-site' || FAMILY_OF[scope] === 'replace' || FAMILY_OF[scope] === 'plant';
const siteLink = (dc?: T.DataCenter): Evidence => dc ? { label: `${dc.code} (${dc.id})`, to: `/datacenters/${dc.id}` } : { label: 'Site not chosen yet' };

/* ------------------------------------------------------------ intent → profile */
export interface IntentReading {
  dcTypeKey: string; profile: DcTypeProfile; confidence: number; mw?: number; kw?: number; racks?: number; scope: T.PlannerScope;
  campusHint?: string; hallHint?: string; months?: number; tier?: string; cooling?: T.PlannerCoolingType; density?: number; purpose: string; reasons: string[];
  /** Existing site the intent resolves to (in-site plan types), with its type, tier and climate taken from the record. */
  dataCenterId?: string; siteCode?: string; climate?: T.PlannerPlan['climate']; campusId?: string;
}
const KEY: [RegExp, string, string][] = [
  [/\b(ai|gpu|training|inference|llm|accelerator)\b/i, 'ai-gpu-factory', 'mentions AI or GPU workloads'],
  [/\b(hyperscale|cloud region|availability zone|az)\b/i, 'hyperscale-dc', 'mentions hyperscale or cloud region'],
  [/\b(colo|colocation|tenant|cage|wholesale)\b/i, 'wholesale-colo', 'mentions colocation or tenants'],
  [/\b(retail colo|cabinet|cross-?connect)\b/i, 'retail-colo', 'mentions cabinets or cross-connects'],
  [/\b(edge|micro|far edge|latency)\b/i, 'edge-micro-dc', 'mentions edge or latency'],
  [/\b(server room|closet|comms room)\b/i, 'server-room', 'mentions a server room'],
  [/\b(pod|container|modular|prefab)\b/i, 'modular-pod', 'mentions a modular pod'],
  [/\b(carrier hotel|meet-?me|interconnect)\b/i, 'carrier-hotel', 'mentions interconnection'],
  [/\b(ixp|exchange point|peering)\b/i, 'ixp', 'mentions peering'],
  [/\b(central office|co\b|exchange building)\b/i, 'central-office', 'mentions a central office'],
  [/\b(pop\b|point of presence)\b/i, 'network-pop', 'mentions a point of presence'],
  [/\b(mtso|mobile switching)\b/i, 'mtso', 'mentions mobile switching'],
  [/\b(nfvi|core network|5g core)\b/i, 'national-core-nfvi', 'mentions a telco core'],
  [/\b(enterprise|private cloud|corporate)\b/i, 'enterprise-dc', 'mentions enterprise hosting'],
];
/** Climate of the campuses the estate has (used when the intent names a place). */
const CLIMATE_BY_CITY: Record<string, T.PlannerPlan['climate']> = { ashburn: 'temperate', virginia: 'temperate', dallas: 'hot-dry', texas: 'hot-dry', frankfurt: 'temperate', germany: 'temperate', dublin: 'cold', ireland: 'cold', singapore: 'hot-humid', sydney: 'temperate', australia: 'temperate', 'são paulo': 'hot-humid', 'sao paulo': 'hot-humid', brazil: 'hot-humid' };
export const climateForCity = (city?: string): T.PlannerPlan['climate'] | undefined => (city ? CLIMATE_BY_CITY[city.toLowerCase()] : undefined);
/** Plan types that work inside one existing site: its type, tier and climate are facts, not choices. */
const EXISTING_SITE_SCOPES: T.PlannerScope[] = ['rack', 'pod', 'hall', 'retrofit', 'plant', 'network', 'migration', 'server-refresh', 'network-refresh', 'rack-replace'];

/**
 * Read a free-text intent. With the estate, an intent that names an existing site (or a campus,
 * for a plan type that works inside one site) is resolved to that site, and the site type, tier
 * and climate come from its record instead of from keywords in the text.
 */
export function readIntent(text: string, estate?: { campuses: T.Campus[]; dataCenters: T.DataCenter[] }): IntentReading {
  const t = text.trim();
  const reasons: string[] = [];
  let key = 'enterprise-dc'; let conf = 45;
  for (const [re, k, why] of KEY) if (re.test(t)) { key = k; conf = 82; reasons.push(why); break; }
  const mw = /(\d+(?:\.\d+)?)\s*mw\b/i.exec(t)?.[1]; const kw = /(\d+(?:\.\d+)?)\s*kw\b/i.exec(t)?.[1]; const racks = /(\d+)\s*racks?\b/i.exec(t)?.[1];
  const perRack = /(\d+(?:\.\d+)?)\s*kw\s*(?:per|\/|a)?\s*rack/i.exec(t)?.[1] ?? (racks && kw ? kw : undefined);
  const sizeKw = mw ? Number(mw) * 1000 : racks && perRack ? Number(racks) * Number(perRack) : kw && !racks ? Number(kw) : racks ? Number(racks) * 10 : undefined;
  if (racks && !perRack && !mw) reasons.push(`${racks} racks at 10 kW assumed`); else if (racks && perRack) reasons.push(`${racks} racks × ${perRack} kW`);
  if (sizeKw && sizeKw >= 20000 && key === 'enterprise-dc') { key = 'hyperscale-dc'; reasons.push('20 MW or more reads as hyperscale'); conf = Math.max(conf, 70); }
  const nRacks = racks ? Number(racks) : 0;
  const scope: T.PlannerScope = /\bnew (data ?cent|site|dc|campus)\b/i.test(t) ? 'new-dc' : /\b(decommission|migrat|consolidat)/i.test(t) ? 'migration' : /\b(refresh|replace)\b.*\b(server|r\d{3}|dl\d{3}|poweredge|proliant)/i.test(t) ? 'server-refresh' : /\b(refresh|replace)\b.*\b(switch|leaf|leaves|nexus|router|firewall)/i.test(t) ? 'network-refresh' : nRacks ? (nRacks <= 4 ? 'rack' : nRacks <= 60 ? 'pod' : 'hall') : /\b(retrofit|densif)/i.test(t) ? 'retrofit' : /\b(ups|chiller|generator|plant)\b/i.test(t) && !/new data cent/i.test(t) ? 'plant' : /\b(dci|uplink|fabric|carrier|400g|100g)\b/i.test(t) ? 'network' : /\b(edge)\b/i.test(t) && /\b(\d+)\s*(?:\w+\s+)?(sites|locations|pops?)\b/i.test(t) ? 'edge' : /\b(portfolio|region(al)? plan|which site)\b/i.test(t) ? 'portfolio' : /\b(expan|new building|building [a-z])\b/i.test(t) ? 'expansion' : /\bnew (data ?cent|site|dc)\b/i.test(t) || (sizeKw ?? 0) >= 5000 ? 'new-dc' : (sizeKw ?? 0) >= 500 ? 'hall' : (sizeKw ?? 0) > 20 || (racks && Number(racks) > 1) ? 'pod' : 'rack';
  const campusHint = /\b(ashburn|dallas|frankfurt|dublin|singapore|sydney|s[aã]o paulo|virginia|texas|germany|ireland|australia|brazil)\b/i.exec(t)?.[1];
  const months = /(\d+)\s*months?\b/i.exec(t)?.[1]; const years = /(\d+)\s*years?\b/i.exec(t)?.[1]; const year = /\b(20\d\d)\b/.exec(t)?.[1];
  const tier = /tier\s*(i{1,3}|iv|[1-4])/i.exec(t)?.[1];
  let tierNorm = tier ? ({ '1': 'Tier I', '2': 'Tier II', '3': 'Tier III', '4': 'Tier IV', i: 'Tier I', ii: 'Tier II', iii: 'Tier III', iv: 'Tier IV' } as Record<string, string>)[tier.toLowerCase()] : undefined;
  const cooling: T.PlannerCoolingType | undefined = /immersion/i.test(t) ? 'immersion' : /liquid|direct.to.chip|dlc/i.test(t) ? 'liquid-to-chip' : /rear.?door/i.test(t) ? 'rear-door' : /free.?cool|economi[sz]er/i.test(t) ? 'air-economiser' : undefined;
  const density = perRack;
  const hallHint = /\bhall\s*([A-Z0-9]+)/i.exec(t)?.[1];
  if (tierNorm) reasons.push(`asks for ${tierNorm}`);
  if (cooling) reasons.push(`asks for ${cooling.replace(/-/g, ' ')}`);
  let climate = climateForCity(campusHint);
  let dataCenterId: string | undefined; let siteCode: string | undefined; let campusId: string | undefined;

  // Resolve the site from the estate: a named site first, then the campus.
  if (estate) {
    const hint = campusHint?.toLowerCase();
    const campus = hint ? estate.campuses.find(c => `${c.name} ${c.city} ${c.country}`.toLowerCase().includes(hint)) : undefined;
    campusId = campus?.id;
    const live = (d: T.DataCenter) => d.status !== 'Retired';
    const named = estate.dataCenters.filter(live).find(d => {
      const tail = d.name.split(' ').slice(-1)[0]; // e.g. HDC-1
      return new RegExp(`\\b(${d.code.replace(/[-]/g, '[- ]?')}|${tail.replace('-', '[- ]?')})\\b`, 'i').test(t) && (!campus || d.campusId === campus.id);
    });
    const pool = campus ? estate.dataCenters.filter(d => d.campusId === campus.id && live(d)) : [];
    const site = named ?? (EXISTING_SITE_SCOPES.includes(scope) && pool.length ? [...pool].filter(d => d.status === 'Operational').sort((a, b) => b.designPowerKw - a.designPowerKw)[0] ?? pool[0] : undefined);
    if (site && EXISTING_SITE_SCOPES.includes(scope)) {
      const prof = dcTypeProfile(site.dcTypeKey);
      dataCenterId = site.id; siteCode = site.code;
      if (prof && prof.key !== key) reasons.push(`${site.code} is a ${prof.name.toLowerCase()} (${site.tier}): the site type comes from its record, not from words in the request`);
      else reasons.push(`resolved to ${site.code} (${site.tier})`);
      if (tierNorm && tierNorm !== site.tier) reasons.push(`the request mentions ${tierNorm}, but ${site.code} is ${site.tier}; a plan inside the site cannot change the site's tier`);
      key = site.dcTypeKey ?? key; tierNorm = site.tier; conf = Math.max(conf, named ? 88 : 72);
      if (!named) reasons.push(`no site was named; ${site.code} is the largest operating site on the ${campus?.city ?? ''} campus — change it on the next step if needed`.replace('  ', ' '));
    } else if (campus && scope === 'expansion' && conf < 80 && pool.length) {
      // A new building on the campus: default to the campus's dominant type by design power.
      const byType = new Map<string, number>(); for (const d of pool) byType.set(d.dcTypeKey ?? '', (byType.get(d.dcTypeKey ?? '') ?? 0) + d.designPowerKw);
      const dominant = [...byType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (dominant) { key = dominant; reasons.push(`the ${campus.city} campus is mostly ${dcTypeProfile(dominant)?.name.toLowerCase() ?? dominant} by design power; change the type if the new building differs`); }
    }
    if (campus && !climate) climate = climateForCity(campus.city);
  }
  const profile = DC_TYPE_CATALOG.find(p => p.key === key) ?? DC_TYPE_CATALOG[0];
  return { dcTypeKey: key, profile, confidence: conf, mw: mw ? Number(mw) : undefined, kw: sizeKw, racks: nRacks || undefined, scope, campusHint, hallHint, months: months ? Number(months) : years ? Number(years) * 12 : year ? Math.max(6, (Number(year) - new Date(clockMs()).getFullYear()) * 12) : undefined, tier: tierNorm, cooling, density: density ? Number(density) : undefined, purpose: t.slice(0, 160), reasons, dataCenterId, siteCode, climate, campusId };
}

/* ------------------------------------------------------------ estate actuals */
export interface ActualsInput { dataCenters: T.DataCenter[]; racks: T.Rack[]; coolingZones: T.CoolingZone[]; programs: T.Program[]; projects: T.Project[] }
/**
 * What this estate really does for sites of the same type: the strongest grounding the planner has.
 * CapEx per kW only counts delivered whole-site programmes (closed greenfield builds), divided by the
 * design load they delivered; an in-flight or partial programme is not a cost actual.
 */
export function estateActuals(dcTypeKey: string, input: ActualsInput): EstateActuals {
  const sites = input.dataCenters.filter(d => d.dcTypeKey === dcTypeKey && d.status === 'Operational');
  const ids = new Set(sites.map(s => s.id));
  const racks = input.racks.filter(r => ids.has(r.dataCenterId) && r.currentPowerKw > 0);
  const kwPerRack = racks.length ? r1(racks.reduce((a, r) => a + r.currentPowerKw, 0) / racks.length) : undefined;
  const itKw = racks.reduce((a, r) => a + r.currentPowerKw, 0);
  const coolKw = input.coolingZones.filter(z => ids.has(z.dataCenterId)).reduce((a, z) => a + z.currentLoadKw, 0);
  // cooling power ≈ heat removed ÷ COP (≈3.5) plus UPS, distribution and lighting losses (≈7%)
  const pue = itKw > 0 ? Math.round(Math.min(2.2, Math.max(1.08, 1 + (coolKw / itKw) * 0.28 + 0.07)) * 100) / 100 : undefined;
  const designKw = sites.reduce((a, s) => a + s.designPowerKw, 0);
  const delivered = deliveredBuilds(dcTypeKey, input.programs, input.projects, input.dataCenters);
  const capexPerKw = delivered.length ? r0(delivered.reduce((a, d) => a + d.capexPerKw, 0) / delivered.length) : undefined;
  const util = designKw ? r0((itKw / designKw) * 100) : undefined;
  const fitouts = input.projects.filter(p => p.dataCenterId && ids.has(p.dataCenterId) && p.status === 'Completed' && p.template === 'Hall Fit-out');
  const fitoutWeeks = fitouts.length ? r0(fitouts.reduce((a, p) => a + (new Date(p.plannedEnd).getTime() - new Date(p.plannedStart).getTime()) / (7 * 864e5), 0) / fitouts.length) : undefined;
  return { kwPerRack, pue, capexPerKw, powerUtilPct: util, fitoutWeeks, sampleSites: sites.length, sampleRacks: racks.length };
}
/** Closed greenfield programmes of this site type, with their cost per design kW. */
function deliveredBuilds(dcTypeKey: string, programs: T.Program[], projects: T.Project[], dataCenters: T.DataCenter[]): { name: string; capexPerKw: number; id: string }[] {
  return programs.filter(p => p.type === 'Greenfield Build' && p.status === 'Closed').map(p => {
    const site = dataCenters.find(d => projects.some(x => x.programId === p.id && x.dataCenterId === d.id));
    return site && site.dcTypeKey === dcTypeKey && site.designPowerKw > 0 ? { id: p.id, name: `${p.name} (${p.id}) · ${fmtUsd(p.budget)} for ${fmtKw(site.designPowerKw)} at ${site.code}`, capexPerKw: r0(p.budget / site.designPowerKw) } : null;
  }).filter((x): x is { name: string; capexPerKw: number; id: string } => !!x && x.capexPerKw > 300);
}

/* ------------------------------------------------------------ sizing assistant */
/** Rack draw at the plan's own site (for in-site plans), as evidence the planner can open. */
function siteRackActuals(ev: Evaluation): { site: SiteBaseline; kwPerRack: number; racks: number } | undefined {
  const site = ev.ctx.site; const data = ev.ctx.data;
  if (!site || !data) return undefined;
  const live = data.racks.filter(r => r.dataCenterId === site.dc.id && r.currentPowerKw > 0);
  return live.length ? { site, kwPerRack: r1(live.reduce((a, r) => a + r.currentPowerKw, 0) / live.length), racks: live.length } : undefined;
}
export function sizingProposals(plan: T.PlannerPlan, ev: Evaluation, actuals: EstateActuals, benchmarks: T.PlannerBenchmark[]): Proposal<number | string>[] {
  const out: Proposal<number | string>[] = [];
  const density = Number(ev.params['densityKwPerRack']?.value ?? 0);
  if (ev.sizing.itKw === 0 && plan.scope !== 'network') return out;
  const scope = plan.scope;
  // Density against what racks really draw: the plan's own site when there is one, else live sites of the type.
  if (ADDS_RACKS.includes(scope) && density) {
    const own = isInSite(scope) ? siteRackActuals(ev) : undefined;
    const kwPerRack = own?.kwPerRack ?? actuals.kwPerRack; const n = own?.racks ?? actuals.sampleRacks ?? 0;
    const where = own ? `${own.racks} live racks at ${own.site.dc.code} average ${own.kwPerRack} kW` : `${actuals.sampleRacks ?? 0} live racks at ${actuals.sampleSites} ${plan.dcTypeKey} site(s) average ${actuals.kwPerRack} kW`;
    const ev1: Evidence[] = own ? [siteLink(own.site.dc), { label: 'Rack draw from DCIM', to: '/facility/racks' }] : [{ label: `${actuals.sampleSites} live site(s) of type ${plan.dcTypeKey}`, to: '/datacenters' }];
    if (kwPerRack && n >= 10) {
      const ratio = kwPerRack / density;
      if (ratio < 0.45 && plan.dcTypeKey !== 'ai-gpu-factory') out.push({ capability: 'sizing-assistant', param: 'densityKwPerRack', title: 'Design density is far above what racks here draw', value: r0(Math.max(kwPerRack * 1.4, density * 0.7)), confidence: 70, reason: `${where} against ${density} kW planned. Planning at about 1.4 times the measured draw keeps headroom without stranding power. Keep ${density} kW if the new equipment is known to be denser.`, source: 'actual', evidence: ev1 });
      else if (ratio > 1.15) out.push({ capability: 'sizing-assistant', param: 'densityKwPerRack', title: 'Racks already draw more than the planned density', value: r0(kwPerRack * 1.1), confidence: 66, reason: `${where}, more than the ${density} kW planned; racks at the planned density may run out of power early.`, source: 'actual', evidence: ev1 });
    }
  }
  // PUE is a design choice only for plans that design a site's plant.
  if (DESIGNS_SITE.includes(scope) && actuals.pue && ev.sizing.pue.source !== 'actual' && Math.abs(actuals.pue - ev.sizing.pue.value) >= 0.08) out.push({ capability: 'sizing-assistant', param: 'pueTarget', title: `PUE ${ev.sizing.pue.value} planned, about ${actuals.pue} achieved today`, value: actuals.pue, confidence: 60, reason: actuals.pue > ev.sizing.pue.value ? `Live ${plan.dcTypeKey} sites in this estate run at about ${actuals.pue} (estimated from cooling-zone load against rack draw). The target is better than that; keep it only with a named efficiency measure.` : `Live ${plan.dcTypeKey} sites already run at about ${actuals.pue}; the plan could commit to that figure.`, source: 'actual', evidence: [{ label: `${actuals.sampleSites} live site(s): cooling-zone load and rack draw`, to: '/capacity/pue' }] });
  // Liquid cooling above the density threshold, for plans that put new racks in.
  const liquidThreshold = benchmarks.find(b => b.metric === 'liquidThresholdKw')?.value ?? 30;
  if (ADDS_RACKS.includes(scope) && density > liquidThreshold && !['liquid-to-chip', 'immersion', 'rear-door'].includes(ev.sizing.cooling.type)) out.push({ capability: 'sizing-assistant', param: 'coolingType', title: 'Switch to liquid cooling for this density', value: 'liquid-to-chip', confidence: 86, reason: `${density} kW per rack is above the ${liquidThreshold} kW threshold in the design standard, where air cooling usually stops being practical.`, source: 'template', evidence: [{ label: `Design standard rule R-COOL-02 (threshold ${liquidThreshold} kW per rack)`, to: '/planning/templates' }] });
  if (DESIGNS_SITE.includes(scope) && ev.sizing.cooling.type === 'air-crah' && ['cold', 'temperate'].includes(plan.climate) && ev.sizing.itKw >= 500) {
    const bm = benchmarks.filter(b => b.metric === 'pue' && b.appliesTo.climate === plan.climate && (b.appliesTo.coolingType === 'air-crah' || b.appliesTo.coolingType === 'air-economiser'));
    const crah = bm.find(b => b.appliesTo.coolingType === 'air-crah'); const eco = bm.find(b => b.appliesTo.coolingType === 'air-economiser');
    out.push({ capability: 'sizing-assistant', param: 'coolingType', title: 'Use economiser cooling in this climate', value: 'air-economiser', confidence: 68, reason: `A ${plan.climate} climate allows free cooling for much of the year.${crah && eco ? ` The benchmark PUE is ${crah.low} to ${crah.high} with CRAH units and ${eco.low} to ${eco.high} with an economiser.` : ''}`, source: 'benchmark', evidence: [{ label: 'PUE benchmarks by cooling type and climate', to: '/planning/benchmarks' }] });
  }
  // Carrier diversity: only where the plan creates a site entry or designs the paths between sites.
  if (OWNS_CARRIERS.includes(scope) && ev.sizing.network.carriers < 2) {
    const data = ev.ctx.data; const dc = ev.ctx.site?.dc;
    const here = data && dc ? data.circuits.filter(c => c.status === 'Active' && data.circuitTerminations.some(t => t.circuitId === c.id && t.dataCenterId === dc.id)) : [];
    const provs = [...new Set(here.map(c => data?.providers.find(p => p.id === c.providerId)?.name ?? c.providerId))];
    out.push({ capability: 'sizing-assistant', param: 'carrierCount', title: scope === 'network' ? 'Use a second carrier for the new paths' : 'Add a second carrier entry', value: 2, confidence: 84, reason: `${scope === 'network' ? 'With one carrier, a single carrier fault takes down every path.' : 'A single carrier entry is a single point of failure for every service at the site.'}${provs.length ? ` Active circuits at ${dc?.code} today use ${provs.join(', ')}.` : ''}`, source: 'template', evidence: [{ label: 'Design standard rule R-NET-01' }, ...(here.slice(0, 3).map(c => ({ label: `${c.cid} (${c.id})`, to: `/circuits/${c.id}` })))] });
  }
  return out;
}

/* ------------------------------------------------------------ phasing optimiser */
export interface PhasingProposal { phases: { name: string; goLive: string; itKw: number }[]; reason: string; confidence: number; evidence: Evidence[] }
export function phasingProposal(plan: T.PlannerPlan, ev: Evaluation, demandTemplate?: T.PlannerTemplate | null, estateHeadroomKw?: number): PhasingProposal | null {
  if (plan.designPowerKw < 1000 || !['new-dc', 'expansion', 'hall', 'edge', 'portfolio'].includes(plan.scope)) return null;
  const late = ev.schedule.filter(s => s.late && s.kind === 'equipment');
  const target = new Date(plan.targetGoLive).getTime();
  const minLead = Math.max(0, ...late.map(l => l.leadWeeks)) * 7 * 864e5;
  const firstLive = late.length ? new Date(clockMs() + minLead + 8 * 7 * 864e5) : new Date(target);
  const shares = demandTemplate?.demand?.phases ?? [{ name: 'Phase 1', sharePct: 34, monthsFromStart: 0 }, { name: 'Phase 2', sharePct: 33, monthsFromStart: 12 }, { name: 'Phase 3', sharePct: 33, monthsFromStart: 24 }];
  const phases = shares.map(s => ({ name: s.name, goLive: new Date(firstLive.getTime() + s.monthsFromStart * 30.4 * 864e5).toISOString(), itKw: r0((plan.designPowerKw * s.sharePct) / 100) }));
  const where = plan.scope === 'expansion' ? 'campus intake headroom' : 'site headroom';
  const reason = late.length ? `${late.map(l => `${l.item} (${l.leadWeeks} weeks)`).join(', ')} cannot arrive before ${new Date(target).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} on the current lead-time benchmarks, so the first phase moves to ${firstLive.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}; later phases follow the ${demandTemplate?.name ?? 'default'} demand profile.` : `Lead times fit the target date. Phases follow the ${demandTemplate?.name ?? 'default'} demand profile so capacity lands shortly before demand${estateHeadroomKw !== undefined ? ` (${where} today ${fmtKw(estateHeadroomKw)} of IT)` : ''}.`;
  return { phases, reason, confidence: late.length ? 72 : 60, evidence: [{ label: 'Lead-time benchmarks', to: '/planning/benchmarks' }, ...(demandTemplate ? [{ label: `Demand profile ${demandTemplate.name}`, to: '/planning/templates' }] : [])] };
}

/* ------------------------------------------------------------ cost calibration */
export interface CostCalibration { capexPerKwBenchmark?: number; capexPerKwActual?: number; capexPerKwPlan: number; verdict: string; adjustment?: number; confidence: number; evidence: Evidence[]; comparables: { name: string; capexPerKw: number }[]; applies: boolean }
/**
 * Whole-site plans only: the estimate per kW against the benchmark band for the site type and
 * against delivered whole-site programmes (budget ÷ the design kW they delivered). Plans inside a
 * site are estimated bottom-up from their bill of materials; a whole site's cost per kW says
 * nothing about them, so no calibration is offered.
 */
export function costCalibration(plan: T.PlannerPlan, ev: Evaluation, actuals: EstateActuals, projects: T.Project[], dataCenters: T.DataCenter[]): CostCalibration {
  const plan$ = ev.estimate.capexPerKw; const band = ev.estimate.benchmarkBand;
  if (!WHOLE_SITE_SCOPES.includes(plan.scope) || ev.sizing.itKw === 0) {
    return { capexPerKwPlan: plan$, verdict: ev.sizing.itKw === 0 ? 'This plan adds no IT load, so a cost per kW does not apply. The estimate is the bill of materials and labour.' : `Cost benchmarks per kW are for whole sites and do not apply to a ${plan.scope.replace('-', ' ')} plan. The estimate is built bottom-up from the bill of materials.`, confidence: 0, evidence: [], comparables: [], applies: false };
  }
  const comps = deliveredBuilds(plan.dcTypeKey, ev.ctx.data?.programs ?? [], projects, dataCenters).slice(0, 4);
  let verdict = band ? '' : `No benchmark band is recorded for ${plan.dcTypeKey}.`; let adjustment: number | undefined; let conf = 50;
  if (band && plan$) {
    if (plan$ < band.low * 0.85) { verdict = `The estimate of ${fmtUsd(plan$)} per kW is below the benchmark band of ${fmtUsd(band.low)} to ${fmtUsd(band.high)}, so it may be under-funded.`; adjustment = band.low; conf = 66; }
    else if (plan$ > band.high * 1.1) { verdict = `The estimate of ${fmtUsd(plan$)} per kW is above the benchmark band of ${fmtUsd(band.low)} to ${fmtUsd(band.high)}; check the tier and redundancy choices.`; adjustment = band.high; conf = 64; }
    else { verdict = `The estimate of ${fmtUsd(plan$)} per kW is inside the benchmark band of ${fmtUsd(band.low)} to ${fmtUsd(band.high)}.`; conf = 72; }
  }
  verdict += comps.length ? ` Delivered builds of this type cost ${comps.map(c => fmtUsd(c.capexPerKw)).join(', ')} per kW.` : ' No delivered build of this type is recorded yet, so the band is the only reference.';
  if (comps.length) conf = Math.min(85, conf + 8);
  return { capexPerKwBenchmark: band?.low !== undefined ? r0((band.low + band.high) / 2) : undefined, capexPerKwActual: actuals.capexPerKw, capexPerKwPlan: plan$, verdict, adjustment, confidence: conf, evidence: [...(band ? [{ label: band.source, to: '/planning/benchmarks' }] : []), ...comps.map(c => ({ label: c.name, to: `/delivery/programs/${c.id}` }))], comparables: comps.map(c => ({ name: c.name, capexPerKw: c.capexPerKw })), applies: true };
}

/* ------------------------------------------------------------ risk predictor */
export function predictRisks(plan: T.PlannerPlan, ev: Evaluation, history: { risks: T.RiskItem[]; projects: T.Project[] }): T.PlannerRisk[] {
  const out: T.PlannerRisk[] = [];
  const have = new Set(plan.risks.map(r => r.title.toLowerCase()));
  const add = (title: string, domain: T.PlannerRisk['domain'], probability: T.PlannerRisk['probability'], impact: T.PlannerRisk['impact'], mitigation: string, evidence: string) => { if (![...have].some(h => h.includes(title.toLowerCase().slice(0, 18)))) out.push({ id: `AI-${out.length + 1}`, title, domain, probability, impact, owner: plan.ownerName, mitigation, source: 'ai', evidence }); };
  const late = ev.schedule.filter(s => s.late && s.kind === 'equipment');
  for (const l of late.slice(0, 3)) add(`${l.item} lead time (${l.leadWeeks} weeks) misses the phase date`, 'Supplier', 'High', 'High', 'Order at approval, dual-source where possible, or move the phase date.', `Lead-time benchmark ${l.leadWeeks} weeks; needed by ${new Date(l.needBy).toLocaleDateString('en-US')}`);
  // Headroom at the plan's own site, from the platform records.
  const site = ev.ctx.site; const binding = site?.binding;
  const added = plan.scope === 'plant' || plan.scope === 'migration' || plan.scope === 'network' ? 0 : plan.scope === 'server-refresh' || plan.scope === 'network-refresh' ? Math.max(0, plan.designPowerKw - (Number(plan.params.affectedKw) || 0)) : plan.scope === 'rack-replace' ? 0 : plan.designPowerKw;
  if (site && binding && added > 0 && site.headroomItKw < added) add(`${site.dc.code} has ${fmtKw(site.headroomItKw)} of IT headroom for ${fmtKw(added)}`, 'Facility', 'High', 'High', `Free capacity at the ${binding.label.toLowerCase()} stage first, or phase the load.`, `${binding.label} at ${site.dc.code} (${site.dc.id}): usable ${fmtKw(binding.usableKw)}, load ${fmtKw(binding.loadKw)}${binding.units.length ? ` across ${binding.units.slice(0, 4).map(u => u.id).join(', ')}` : ''}`);
  const slipped = history.projects.filter(p => p.rag === 'Red' || p.status === 'At Risk' || p.status === 'Blocked');
  if (slipped.length && ['new-dc', 'expansion', 'hall'].includes(plan.scope)) add('Delivery slip on construction-dependent phases', 'Commissioning', slipped.length > 3 ? 'High' : 'Medium', 'High', 'Track the civil milestone as a hard dependency; hold 15% schedule contingency or more.', `${slipped.length} of ${history.projects.length} projects are red, at risk or blocked: ${slipped.slice(0, 3).map(p => p.id).join(', ')}${slipped.length > 3 ? ' and more' : ''}`);
  const supplier = history.risks.filter(r => r.category === 'Vendor' && r.status !== 'Closed');
  if (supplier.length >= 3 && FAMILY_OF[plan.scope] !== 'migration') add('Vendor concentration on long-lead items', 'Supplier', 'Medium', 'High', 'Frame agreements with two vendors per equipment class.', `${supplier.length} open vendor risks on current projects: ${supplier.slice(0, 3).map(r => r.id).join(', ')}`);
  if (ADDS_RACKS.includes(plan.scope) && (ev.sizing.cooling.liquidRequired || ['liquid-to-chip', 'immersion'].includes(ev.sizing.cooling.type))) add('Leaks on liquid cooling loops', 'Facility', 'Medium', 'High', 'Leak detection on every loop, a closed-loop design and commissioning to level 5 on the CDUs.', `Cooling type ${ev.sizing.cooling.type}${ev.sizing.cooling.liquidRequired ? ' (required by density)' : ''}`);
  if (plan.scope === 'new-dc' || plan.scope === 'expansion') add('Utility connection later than the master plan assumes', 'Regulatory', 'Medium', 'High', 'Sign the grid agreement before the master-plan gate and size an interim feed for phase 1.', ev.ctx.campus ? `Campus intake ${fmtKw(ev.ctx.campus.perSideKw)} per side; committed ${fmtKw(ev.ctx.campus.committedFacilityKw)}; headroom ${fmtKw(ev.ctx.campus.facilityHeadroomKw)} of facility load` : 'A common cause of slips on greenfield builds');
  if (plan.scope === 'migration') add('Cut-over window overrun on critical workloads', 'Facility', 'Medium', 'High', 'Rehearse the cut-over, test the rollback and freeze changes for the window.', 'Migration plan type');
  if (ADDS_RACKS.includes(plan.scope) && ev.estimate.paybackMonths !== null && ev.estimate.paybackMonths > 96) add('Payback beyond 8 years at the entered revenue', 'Finance', 'High', 'Medium', 'Raise the price per kW, phase the CapEx or revisit the tier.', `Payback ${ev.estimate.paybackMonths} months in the current estimate`);
  return out;
}

/* ------------------------------------------------------------ placement optimiser (rack and pod scopes) */
/** Superseded by the in-site placement engine (lib/placement.ts); kept for callers that still use it. Blocked racks are returned disabled with score 0. */
export interface PlacementCandidate { rack: T.Rack; hallName: string; score: number; reasons: string[]; disabled?: boolean }
export function placementCandidates(plan: T.PlannerPlan, racks: T.Rack[], halls: T.Hall[], needKw: number, needU: number): PlacementCandidate[] {
  const hallName = new Map(halls.map(h => [h.id, h.name]));
  const block = dcTypeProfile(plan.dcTypeKey)?.capacity.rackPowerBlockPct ?? 90;
  return racks.filter(r => r.dataCenterId === plan.dataCenterId && r.status === 'Active').map(r => {
    const freeKw = r.maxPowerKw - r.currentPowerKw; const freeU = r.availableU;
    const reasons: string[] = [];
    let score = 0; let blocked = false;
    if (freeKw >= needKw) { score += 40; reasons.push(`${r1(freeKw)} kW free`); } else { blocked = true; reasons.push(`only ${r1(Math.max(0, freeKw))} kW free`); }
    if (freeU >= needU) { score += 30; reasons.push(`${freeU} U free`); } else { blocked = true; reasons.push(`only ${freeU} U free`); }
    if (r.redundancy === '2N' || r.redundancy === '2N+1') { score += 15; reasons.push('dual feed'); }
    const afterPct = r.maxPowerKw ? ((r.currentPowerKw + needKw) / r.maxPowerKw) * 100 : 100;
    if (afterPct <= 80) { score += 15; reasons.push(`${r0(afterPct)}% after placement`); } else if (afterPct <= block) { score += 5; reasons.push(`${r0(afterPct)}% after placement (warning band)`); } else { blocked = true; reasons.push(`${r0(afterPct)}% after placement, above the ${block}% limit`); }
    return { rack: r, hallName: hallName.get(r.hallId) ?? r.hallId, score: blocked ? 0 : score, reasons, disabled: blocked };
  }).sort((a, b) => Number(!!a.disabled) - Number(!!b.disabled) || b.score - a.score).slice(0, 5);
}

/* ------------------------------------------------------------ document extraction (simulated on text) */
export interface Extracted { field: string; value: string | number; unit?: string; confidence: number; snippet: string }
export function extractFromText(text: string): Extracted[] {
  const out: Extracted[] = [];
  const grab = (re: RegExp, field: string, unit?: string, conf = 80) => { const m = re.exec(text); if (m) out.push({ field, value: Number.isNaN(Number(m[1])) ? m[1] : Number(m[1]), unit, confidence: conf, snippet: m[0] }); };
  grab(/(\d+(?:\.\d+)?)\s*(?:mva|mw)\b[^.]*?(?:available|offer|connection)/i, 'utilityAvailableMw', 'MW', 78);
  grab(/(?:tariff|price)[^.\d]*(\d+(?:\.\d+)?)\s*(?:usd|\$|eur|€)?\s*(?:per|\/)\s*kwh/i, 'tariffUsdPerKwh', 'USD/kWh', 82);
  grab(/(\d+)\s*weeks?\s*lead/i, 'leadWeeks', 'weeks', 76);
  grab(/(\d+(?:,\d{3})*)\s*(?:m²|m2|sqm|square met)/i, 'areaM2', 'm²', 70);
  grab(/lease[^.\d]*(\d+(?:\.\d+)?)\s*(?:usd|\$|eur|€)?\s*(?:per|\/)\s*(?:m²|m2|sqm)/i, 'leaseUsdPerM2Year', 'USD/m²/year', 72);
  grab(/(\d+(?:\.\d+)?)\s*kw\s*(?:per|\/)\s*rack/i, 'densityKwPerRack', 'kW/rack', 84);
  grab(/pue[^.\d]*(\d\.\d+)/i, 'pueTarget', 'ratio', 80);
  grab(/(\d+)\s*(?:v|kv)\b[^.]*?(?:feed|intake|supply)/i, 'feedVoltage', 'V', 60);
  return out;
}

/* ------------------------------------------------------------ copilot */
export interface Answer { title: string; lines: string[]; confidence: number; evidence: Evidence[]; followups: string[] }
const BUILD_QUESTIONS = ['What is the binding constraint?', 'What changes if we go Tier IV?', 'What does it cost per kW against the benchmark?', 'Which risks matter most?', 'When must the long-lead items be ordered?', 'Compare all scenarios', 'What differs from the standard template?'];
const SITE_QUESTIONS = ['What is the binding constraint at the site?', 'What does it cost?', 'Which risks matter most?', 'Which rules fail?', 'What is the schedule?', 'What differs from the standard template?'];
/** Suggested questions that make sense for the plan type. */
export function copilotSuggestions(plan: T.PlannerPlan): string[] {
  return FAMILY_OF[plan.scope] === 'build' ? BUILD_QUESTIONS : SITE_QUESTIONS;
}
/** Kept for callers that do not know the plan; prefer `copilotSuggestions(plan)`. */
export const COPILOT_SUGGESTIONS = BUILD_QUESTIONS;

export function answerQuestion(q: string, plan: T.PlannerPlan, ev: Evaluation, scenarios: { scenario: T.PlannerScenario; ev: Evaluation }[], actuals: EstateActuals): Answer {
  const s = q.toLowerCase();
  const E = (title: string, lines: string[], confidence: number, evidence: Evidence[] = [], followups: string[] = []): Answer => ({ title, lines, confidence, evidence, followups });
  const planLink = { label: `${plan.title} (${plan.plnId})`, to: `/planning/plans/${plan.id}` };
  const family = FAMILY_OF[plan.scope];
  const build = family === 'build';
  const site = ev.ctx.site;
  const next = build ? BUILD_QUESTIONS : SITE_QUESTIONS;
  if (/tier iv|tier 4|fault.tolerant/.test(s)) {
    if (!build && plan.scope !== 'hall') {
      return E('Tier of the site', [site ? `${site.dc.code} is ${site.dc.tier}. A ${plan.scope.replace('-', ' ')} plan works inside the site and does not change its tier.` : 'This plan works inside an existing site and does not change its tier.', 'To raise the site\'s tier, plan the plant and distribution changes as a plant upgrade.'], 80, [site ? siteLink(site.dc) : planLink], next.slice(0, 2));
    }
    const alt = scenarios.find(x => String(x.ev.params['tier']?.value) === 'Tier IV');
    const lines = alt ? [`Scenario "${alt.scenario.name}" models Tier IV: CapEx ${fmtUsd(alt.ev.estimate.capexTotal)} against ${fmtUsd(ev.estimate.capexTotal)} (${r0(((alt.ev.estimate.capexTotal - ev.estimate.capexTotal) / Math.max(1, ev.estimate.capexTotal)) * 100)}% more).`, `Payback ${alt.ev.estimate.paybackMonths ?? '—'} months against ${ev.estimate.paybackMonths ?? '—'}.`, `Plant: ${alt.ev.sizing.plant.filter(x => x.kind === 'ups').length} UPS systems and ${alt.ev.sizing.plant.find(x => x.kind === 'generator')?.count ?? 0} generators.`] : ['There is no Tier IV scenario yet. Tier IV needs 2N+1 power and fault-tolerant cooling; at this size that typically adds 15 to 20% to plant CapEx, but only a scenario gives the figure for this plan.', 'Add a scenario with tier = Tier IV and redundancy = 2N+1 to see it.'];
    return E('Going to Tier IV', lines, alt ? 80 : 55, [planLink, { label: 'Uptime Institute tier definitions (design standard)' }], ['What is the binding constraint?', 'Compare all scenarios']);
  }
  if (/binding|constraint|runs? out|exhaust|headroom/.test(s)) {
    if (!build && site) {
      const b = site.binding;
      const lines = [b ? `${b.label} binds first at ${site.dc.code}: usable ${fmtKw(b.usableKw)}${b.facility ? ' of facility load' : ''}, load today ${fmtKw(b.loadKw)}, leaving ${fmtKw(Math.max(0, site.headroomItKw))} of IT headroom (${b.basis.toLowerCase()}).` : `No power stage is recorded at ${site.dc.code}.`,
        `IT load today ${fmtKw(site.itLoadKw)}; held by other plans and changes ${fmtKw(site.reservedKw + site.pipelineKw)}${site.pipeline.length ? ` (${site.pipeline.map(p => p.plnId).join(', ')})` : ''}.`,
        `Cooling: ${fmtKw(site.cooling.usableKw)} usable with one unit lost per zone, ${fmtKw(site.cooling.loadKw)} load.`];
      return E('Binding constraint at the site', lines, 78, [siteLink(site.dc), ...(b?.units.slice(0, 3).map(u => ({ label: `${u.name} (${u.id}): ${fmtKw(u.capacityKw)}` })) ?? [])], ['What does it cost?', 'Which risks matter most?']);
    }
    const row = ev.ladder.find(l => l.bindingConstraint !== 'none') ?? ev.ladder[0];
    return E('Binding constraint', row ? [`${row.bindingConstraint === 'none' ? 'No dimension binds' : `${row.bindingConstraint[0].toUpperCase()}${row.bindingConstraint.slice(1)} binds first`} at ${row.phase.name}: ${fmtKw(row.installedKw)} installed, ${fmtKw(row.committedKw)} committed, ${fmtKw(row.reserveKw)} reserve, ${fmtKw(row.headroomKw)} usable headroom.`, row.crossesWarningMonth !== undefined ? `At ${plan.demand.growthPctPerYear}% growth a year the warning threshold is crossed about ${row.crossesWarningMonth} months from now, if growth holds.` : 'Growth is entered as zero, so no crossing is forecast.', `Cooling capacity ${fmtKw(ev.sizing.cooling.capacityKw)} for ${fmtKw(ev.sizing.itKw)} IT; ${ev.sizing.cooling.units} units at ${ev.sizing.cooling.redundancy}.`, ...(ev.ctx.campus ? [`Campus intake: ${fmtKw(ev.ctx.campus.perSideKw)} per side, ${fmtKw(ev.ctx.campus.committedFacilityKw)} committed to existing buildings, ${fmtKw(ev.ctx.campus.facilityHeadroomKw)} free.`] : [])] : ['No phases are defined yet.'], 76, [planLink, { label: 'Capacity ladder', to: `/planning/plans/${plan.id}?tab=capacity` }], ['What does it cost per kW against the benchmark?', 'Which risks matter most?']);
  }
  if (/cost|per kw|benchmark|expensive|cheap|budget/.test(s)) {
    const b = ev.estimate.benchmarkBand;
    const opexEnergy = ev.estimate.opex.find(l => l.item === 'Energy')?.amount ?? 0;
    if (!WHOLE_SITE_SCOPES.includes(plan.scope)) {
      return E('Cost', [`CapEx ${fmtUsd(ev.estimate.capexTotal)}, built bottom-up from the bill of materials and labour for this plan.`, 'Whole-site benchmarks per kW do not apply to this plan type, so none is used.', `OpEx change ${fmtUsd(ev.estimate.opexMonthly)} a month${opexEnergy ? `, of which energy ${fmtUsd(opexEnergy)}` : ''}.`], 74, [planLink, { label: 'Cost tab', to: `/planning/plans/${plan.id}?tab=cost` }], ['Which risks matter most?', 'What is the schedule?']);
    }
    return E('Cost per kW', [`Plant and fit-out ${fmtUsd(ev.estimate.capexPerKw)} per kW, total CapEx ${fmtUsd(ev.estimate.capexTotal)}${ev.estimate.capex.some(l => l.item.startsWith('IT')) ? ' including IT' : ''}.`, b ? `Benchmark band ${fmtUsd(b.low)} to ${fmtUsd(b.high)} (${b.source}).` : 'No benchmark is recorded for this site type.', actuals.capexPerKw ? `Delivered builds of this type cost ${fmtUsd(actuals.capexPerKw)} per kW.` : 'No delivered build of this type is recorded yet to compare with.', `OpEx ${fmtUsd(ev.estimate.opexMonthly)} a month, ${fmtUsd(ev.estimate.costPerKwMonth)} per kW-month; energy is ${r0((opexEnergy / Math.max(1, ev.estimate.opexMonthly)) * 100)}% of it.`], 78, [planLink, { label: 'Benchmarks', to: '/planning/benchmarks' }], ['What changes if we go Tier IV?', 'What differs from the standard template?']);
  }
  if (/risk|slip|fail|danger/.test(s) && !/rule/.test(s)) {
    const rank = (r: T.PlannerRisk) => (r.impact === 'High' ? 2 : r.impact === 'Medium' ? 1 : 0);
    const top = [...plan.risks].sort((a, b) => rank(b) - rank(a)).slice(0, 4);
    const fails = ev.findings.filter(f => f.status === 'fail');
    return E('What could go wrong', [...(top.length ? top.map(r => `${r.title} (${r.probability} probability, ${r.impact} impact): ${r.mitigation}`) : ['No risks are recorded on the plan yet.']), ...(fails.length ? [`${fails.length} hard rule(s) fail: ${fails.map(f => f.rule.title).join('; ')}.`] : ['No hard rule fails in this evaluation.'])], 72, [planLink, { label: 'Risk register', to: `/planning/plans/${plan.id}?tab=risks` }], next.filter(x => /schedule|rules|scenarios/i.test(x)).slice(0, 2));
  }
  if (/schedule|when|lead time|order/.test(s)) {
    const late = ev.schedule.filter(x => x.late);
    const firstEq = ev.schedule.filter(x => x.kind === 'equipment').slice(0, 3);
    return E('Schedule and lead times', [late.length ? `${late.length} item(s) cannot be ordered in time on the current dates: ${late.map(l => l.item).join(', ')}.` : 'No long-lead item is late on the current dates.', ...firstEq.map(i => `${i.item}: order by ${new Date(i.orderBy).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} for ${new Date(i.needBy).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} (${i.leadWeeks} weeks${i.source === 'stock' ? ', from stock' : ''}).`)], 74, [planLink, { label: 'Lead-time benchmarks', to: '/planning/benchmarks' }], ['Which risks matter most?']);
  }
  if (/compare|scenario|option/.test(s)) {
    return E('Scenarios compared', scenarios.length ? scenarios.map(x => `${x.scenario.name}: ${fmtKw(x.ev.sizing.itKw)}, CapEx ${fmtUsd(x.ev.estimate.capexTotal)}${build ? ` (${fmtUsd(x.ev.estimate.capexPerKw)}/kW)` : ''}, OpEx ${fmtUsd(x.ev.estimate.opexMonthly)}/month${build ? `, PUE ${x.ev.sizing.pue.value}` : ''}, payback ${x.ev.estimate.paybackMonths ?? '—'} months, ${x.ev.hardFails} hard fail(s).`) : ['This plan has no scenarios yet.'], 80, [planLink, { label: 'What-if studio', to: `/planning/plans/${plan.id}?tab=scenarios` }], next.slice(0, 2));
  }
  if (/differ|standard|template|default|changed/.test(s)) {
    const diffs = Object.entries(ev.params).filter(([, v]) => v.source === 'user' || v.source === 'ai').slice(0, 8);
    return E('Departures from the template', diffs.length ? diffs.map(([k, v]) => `${k} = ${String(v.value)} (${v.source === 'ai' ? 'AI proposal accepted' : 'entered by the planner'})`) : ['Every parameter is the template default.'], 86, [planLink, { label: ev.resolved?.template.name ?? 'Template', to: '/planning/templates' }], ['Which rules fail?']);
  }
  if (/rule|comply|complian|pass/.test(s)) {
    const bad = ev.findings.filter(f => f.status !== 'pass' && f.status !== 'n/a');
    const na = ev.findings.filter(f => f.status === 'n/a');
    return E('Rules and standards', [...(bad.length ? bad.map(f => `${f.status === 'fail' ? 'Fails' : 'Warns'}: ${f.rule.title}. ${f.detail}${f.rule.standard ? ` (${f.rule.standard})` : ''}`) : ['No rule fails or warns in this evaluation.']), ...(na.length ? [`${na.length} rule(s) could not be checked or do not apply: ${na.slice(0, 4).map(f => f.rule.id).join(', ')}${na.length > 4 ? ' and more' : ''}.`] : [])], 86, [planLink, { label: 'Rule sets', to: '/planning/templates' }], ['Which risks matter most?']);
  }
  // Summary in the plan type's own terms.
  const head = build
    ? `${plan.title}: ${fmtKw(ev.sizing.itKw)} IT in ${ev.sizing.halls} hall(s) across ${ev.sizing.buildings} building(s), ${ev.sizing.racks.toLocaleString('en-US')} racks at ${ev.params['densityKwPerRack']?.value ?? '—'} kW.`
    : family === 'replace' ? `${plan.title}: ${String(plan.params.affectedCount ?? plan.params.affectedDevices ?? '—')} item(s) in ${String(plan.params.affectedRacks ?? '—')} rack(s) at ${site?.dc.code ?? 'the site'}, replaced with ${String(plan.params.replacementModel ?? plan.params.rackModel ?? 'the catalogue model')}.`
    : family === 'migration' ? `${plan.title}: ${String(plan.params.racksToMove ?? '—')} rack(s) leaving ${site?.dc.code ?? 'the site'}.`
    : plan.scope === 'network' ? `${plan.title}: ${String(plan.params.dciGbpsRequired ?? '—')} Gbps over ${String(plan.params.diversePaths ?? '—')} path(s).`
    : plan.scope === 'plant' ? `${plan.title}: plant works at ${site?.dc.code ?? 'the site'} for ${fmtKw(plan.designPowerKw)} of IT load.`
    : `${plan.title}: ${fmtKw(ev.sizing.itKw)} IT in ${ev.sizing.racks.toLocaleString('en-US')} rack(s) at ${site?.dc.code ?? 'the site'}.`;
  return E('Plan summary', [head, `CapEx ${fmtUsd(ev.estimate.capexTotal)}, OpEx ${fmtUsd(ev.estimate.opexMonthly)} a month${build ? `, PUE ${ev.sizing.pue.value}` : ''}, payback ${ev.estimate.paybackMonths ?? '—'} months.`, `${ev.hardFails} hard fail(s), ${ev.softWarns} warning(s), readiness ${ev.readinessPct}%.`], 66, [planLink, ...(site ? [siteLink(site.dc)] : [])], next.slice(0, 4));
}

/* ------------------------------------------------------------ learning loop */
export interface CapabilityAccuracy { capability: string; label: string; total: number; accepted: number; pct: number }
const CAP_LABEL: Record<string, string> = { 'intent-to-profile': 'Intent to profile', 'sizing-assistant': 'Sizing assistant', 'phasing-optimiser': 'Phasing optimiser', 'cost-estimator': 'Cost calibration', 'risk-predictor': 'Risk predictor', 'compliance-check': 'Standards check', 'placement-optimiser': 'Placement optimiser', 'document-extraction': 'Document extraction', copilot: 'Plan copilot' };
export function accuracy(feedback: T.PlannerFeedback[]): CapabilityAccuracy[] {
  const by = new Map<string, { t: number; a: number }>();
  for (const f of feedback) { const e = by.get(f.capability) ?? { t: 0, a: 0 }; e.t++; if (f.accepted) e.a++; by.set(f.capability, e); }
  return [...by.entries()].map(([c, e]) => ({ capability: c, label: CAP_LABEL[c] ?? c, total: e.t, accepted: e.a, pct: r0((e.a / e.t) * 100) })).sort((a, b) => b.total - a.total);
}
export { evaluate };
