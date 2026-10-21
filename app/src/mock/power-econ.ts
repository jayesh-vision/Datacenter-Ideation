/* Power economics (21-Oct-2026, user: "build the power economics screens" after the neocloud pitch deck review).
   The deck sells power as a cost line and a contract risk (slides 14–16: committed MW, take-or-pay, idle megawatts, cost per
   sold MW, power and cooling per GPU-hour) but has no screen behind it. This read model puts numbers on those words using
   what the estate already knows — every site's live power split (IT, cooling, lighting = facility load), its peak, its PUE,
   the GPU fleet's node power and the GPU rate card — plus two things the estate cannot know and a customer would supply:
   · a TARIFF per state (published industrial averages, local currency, marked illustrative on screen), and
   · a POWER CONTRACT per site, seeded on the site id: committed kW (the utility connection or the colocation power block),
     a take-or-pay floor, a yearly escalator, the term end. Cloud and NeoCloud rent part of their estate in colocation, where
     the whole committed block is billed per kW-month whether drawn or not — the deck's "paying for idle megawatts".
   Round 2 (deck items 3–5): energy and cost per JOB and per TENANT (and what a power cap saves against the GPU time it costs),
   power ANOMALIES against the contract (the generator raises an alarm for each and an incident for the worst, see
   `raisePowerContractAlerts`), and PLACEMENT hints — which pod has free GPUs with rack, cooling and contracted headroom at the
   lowest marginal power cost.
   Derived only: nothing generated changes, every fingerprint holds (the network persona raises no power alarms, so its data
   stays byte-identical). Money is in the geography's currency (tariffs are real local prices, so they are NOT run through money()). */
import type { GpuJobPowerEcon, GpuPodPowerEcon, GpuPowerEcon, GpuTenantPowerEcon, Incident, Persona, PlacementHint, PowerAnomaly, PowerEconomics, SitePowerEcon } from '../api/types';
import type { Db } from './generate';
import { activeGeo, person } from './geo';
import { gpuName } from '../lib/gpuSpec';
import { jobRate } from './gpu';
import { fmtKw, fmtMoney } from '../lib/format';

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000, MONTH_DAYS = 30.4, MONTH = 30.4 * DAY;
const r1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/* a stable 0..1 draw per (site, field) — never the generator's stream */
const draw = (s: string) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return ((x >>> 0) % 100_000) / 100_000; };

/* Industrial electricity: energy price per kWh and the demand charge per kW-month, by state.
   USA: EIA Electric Power Monthly, average industrial retail price by state (2024) — $/kWh; demand charges typical of large
   C&I tariffs. India: HT industrial tariffs incl. duties as published by the state DISCOMs (FY 2024-25) — ₹/kWh; fixed /
   demand charge per kVA-month. Both are averages: a real customer supplies its tariff sheet. */
const US_TARIFF: Record<string, [number, string]> = {
  VA: [0.072, 'Dominion Energy'], TX: [0.062, 'Oncor · ERCOT'], CA: [0.19, 'Silicon Valley Power'], IL: [0.078, 'ComEd'], AZ: [0.071, 'Arizona Public Service'],
  GA: [0.068, 'Georgia Power'], NJ: [0.115, 'PSE&G'], WA: [0.058, 'Grant County PUD'], OR: [0.064, 'Portland General Electric'], CO: [0.082, 'Xcel Energy'],
  OH: [0.074, 'AEP Ohio'], FL: [0.088, 'Florida Power & Light'], UT: [0.064, 'Rocky Mountain Power'], NC: [0.069, 'Duke Energy']
};
const IN_TARIFF: Record<string, [number, string]> = {
  MH: [8.6, 'MSEDCL'], UP: [8.0, 'UPPCL'], KA: [7.3, 'BESCOM'], DL: [8.9, 'BSES Rajdhani'], AP: [7.4, 'APEPDCL'], HR: [7.9, 'DHBVN'], PB: [7.2, 'PSPCL'],
  GJ: [6.9, 'Torrent Power'], MP: [7.6, 'MPPKVVCL'], RJ: [7.8, 'JVVNL'], WB: [8.2, 'CESC'], OD: [6.5, 'TPCODL'], BR: [8.3, 'SBPDCL'], TN: [7.9, 'TANGEDCO'], TS: [7.7, 'TSSPDCL'], KL: [7.1, 'KSEB']
};
const GEO = {
  us: { tariffs: US_TARIFF, defTariff: 0.08, defSupplier: 'Local utility', demandRate: 14, coloRate: 145, coloNames: ['Equinix', 'Digital Realty', 'QTS', 'CyrusOne', 'Vantage'],
    tariffSource: 'EIA Electric Power Monthly, average industrial price by state (2024)', demandSource: 'Demand charge $14 per kW-month, typical of large commercial & industrial tariffs', coloSource: 'Wholesale colocation $145 per committed kW-month all-in, energy metered at the site tariff' },
  in: { tariffs: IN_TARIFF, defTariff: 7.8, defSupplier: 'State DISCOM', demandRate: 420, coloRate: 7800, coloNames: ['STT GDC', 'Sify', 'NTT', 'Nxtra', 'CtrlS'],
    tariffSource: 'State DISCOM HT industrial tariffs incl. duties (FY 2024-25)', demandSource: 'Fixed / demand charge ₹420 per kVA-month, typical HT industrial tariff', coloSource: 'Wholesale colocation ₹7,800 per committed kW-month all-in, energy metered at the site tariff' }
} as const;
/* colocation overage: power above the committed block is billed at this multiple of the block rate */
const OVERAGE_X = 1.5;
/* a monthly average draw (history12m) sits about this far under the month's peak */
const PEAK_OVER_MEAN = 1.06;

const earningNode = (idleJobs: Set<string>) => (n: { state: string; jobId?: string }) => n.state === 'in-job' && !!n.jobId && !idleJobs.has(n.jobId);

/* ---- sites: tariff, contract, bill, idle, sold */
function buildSites(db: Db, persona: Persona, dcId?: string): SitePowerEcon[] {
  const g = GEO[activeGeo().id];
  const dcs = db.datacenters.filter(d => (!dcId || d.id === dcId) && d.status !== 'planned');
  const gpu = db.gpu;
  const idleJobs = new Set(gpu?.jobs.filter(j => j.state === 'idle').map(j => j.id) ?? []);
  const earning = earningNode(idleJobs);
  const gpuNodes = [...(gpu?.nodes.values() ?? [])];
  return dcs.map(d => {
    const st = d.id.slice(0, 2);
    const [tariff, utility] = g.tariffs[st] ?? [g.defTariff, g.defSupplier];
    const it = d.power.split[0]?.kw ?? 0, now = d.power.split.reduce((a, s) => a + s.kw, 0);
    const pue = it ? Math.round((now / it) * 100) / 100 : 0;
    const peak = Math.max(now, d.power.peakKw || 0, ...(d.power.load24h ?? []));
    /* GPU clouds rent part of the estate in colocation (NeoCloud about half, cloud a quarter); everyone else buys from the utility */
    const colo = persona === 'neocloud' ? draw(`${d.id}|colo`) < 0.5 : persona === 'cloud' ? draw(`${d.id}|colo`) < 0.25 : false;
    /* utility: the connection is sized for the design capacity (a little above it); colocation: power is bought in tranches as
       the halls fill, so the committed block sits 10–45% above today's peak, never above the design capacity */
    const committedKw = colo
      ? Math.min(Math.ceil((peak * (1.1 + 0.35 * draw(`${d.id}|committed`))) / 100) * 100, Math.ceil(d.power.capacityKw / 100) * 100)
      : Math.ceil((d.power.capacityKw * (1 + 0.15 * draw(`${d.id}|committed`))) / 100) * 100;
    const floorPct = colo ? 100 : Math.round(60 + 25 * draw(`${d.id}|floor`));
    const floorKw = Math.round((committedKw * floorPct) / 100);
    const escalatorPct = r1(colo ? 2.5 + 1.5 * draw(`${d.id}|esc`) : 2 + 2.5 * draw(`${d.id}|esc`));
    const termEnd = db.now + Math.round((6 + 42 * draw(`${d.id}|term`)) * MONTH);
    const demandRate = colo ? g.coloRate : g.demandRate;
    const mwhDay = (now * 24) / 1000;
    const energyCostMonth = now * 24 * MONTH_DAYS * tariff;
    const billedKw = colo ? committedKw : Math.max(peak, floorKw);
    const capacityCostMonth = billedKw * demandRate;
    const idleKw = Math.max(0, billedKw - peak);
    const idleCostMonth = idleKw * demandRate;
    const gpuOn = gpuNodes.filter(n => n.dcId === d.id);
    const gpuKw = gpuOn.reduce((a, n) => a + n.powerKw, 0);
    /* sold = IT power customers are billed for right now */
    const soldKw = gpuOn.filter(earning).reduce((a, n) => a + n.powerKw, 0) + d.racks.filter(r => r.owner === 'tenant' && r.contractedKw).reduce((a, r) => a + (r.contractedKw ?? 0), 0);
    const billMonth = energyCostMonth + capacityCostMonth;
    return {
      id: d.id, city: d.city, state: d.state, status: d.status, kind: colo ? 'colocation' : 'utility',
      supplier: colo ? g.coloNames[Math.floor(draw(`${d.id}|colo-name`) * g.coloNames.length)] : utility,
      tariff, demandRate, committedKw, floorPct, floorKw, escalatorPct, termEnd,
      peakKw: Math.round(peak), nowKw: Math.round(now), itKw: Math.round(it), pue, headroomKw: Math.round(committedKw - peak), idleKw: Math.round(idleKw),
      mwhDay: r1(mwhDay), energyCostMonth: Math.round(energyCostMonth), capacityCostMonth: Math.round(capacityCostMonth), idleCostMonth: Math.round(idleCostMonth), billMonth: Math.round(billMonth),
      soldKw: Math.round(soldKw), costPerSoldMwMonth: soldKw > 0 ? Math.round((billMonth / soldKw) * 1000) : null, costPerItMwMonth: it > 0 ? Math.round((billMonth / it) * 1000) : 0,
      gpuKw: r1(gpuKw)
    };
  });
}

/* ---- anomalies against the contract (deck item 4). The same rules run in the generator (alarm + incident) and in the view, so
   a finding on screen always has its alarm beside it. */
const ANOMALY_TITLE: Record<PowerAnomaly['kind'], string> = {
  'block-near-limit': 'Committed Power Block Near Limit', 'demand-ratchet': 'Demand Peak Above Contract Floor', 'unexplained-rise': 'Unexplained Power Rise', 'idle-block': 'Idle Committed Power'
};
export const anomalyAlertCode = (dcId: string, kind: PowerAnomaly['kind']) => `PWR-${dcId}-${kind.toUpperCase().replace(/-/g, '')}`;
function buildAnomalies(db: Db, sites: SitePowerEcon[]): PowerAnomaly[] {
  const out: PowerAnomaly[] = [];
  const inProgress = new Set(db.changes.filter(c => c.status === 'In progress').map(c => c.dcId));
  const recentJobs = (dcId: string) => (db.gpu?.jobs ?? []).filter(j => j.dcId === dcId && j.started > db.now - DAY);
  for (const s of sites) {
    const d = db.datacenters.find(x => x.id === s.id)!;
    const alert = (kind: PowerAnomaly['kind']) => db.alerts.find(a => a.code === anomalyAlertCode(s.id, kind) && a.state !== 'cleared');
    const push = (a: Omit<PowerAnomaly, 'id' | 'dcId' | 'title' | 'alertId' | 'incidentId' | 'to'>) => {
      const al = alert(a.kind);
      out.push({ id: `${s.id}:${a.kind}`, dcId: s.id, title: ANOMALY_TITLE[a.kind], ...a, alertId: al?.id, incidentId: al?.incidentId, to: `/facilities?dc=${s.id}&tab=power` });
    };
    if (s.kind === 'colocation') {
      const share = s.peakKw / s.committedKw;
      if (share >= 0.85) {
        const trancheYear = 100 * s.demandRate * 12;
        push({ kind: 'block-near-limit', severity: share >= 0.9 ? 'major' : 'minor', exposure: Math.round(trancheYear), exposureLabel: 'next 100 kW tranche per year',
          detail: `Peak ${fmtKw(s.peakKw)} is ${Math.round(share * 100)}% of the ${fmtKw(s.committedKw)} block at ${s.supplier}; power above the block bills at ${OVERAGE_X}× the block rate. Growth of ${fmtKw(s.committedKw - s.peakKw)} fills it.`,
          evidence: [{ label: 'Committed block', value: fmtKw(s.committedKw) }, { label: 'Peak today', value: fmtKw(s.peakKw) }, { label: 'Block rate', value: `${fmtMoney(s.demandRate)} / kW-month` }, { label: 'Overage rate', value: `${fmtMoney(s.demandRate * OVERAGE_X)} / kW-month` }] });
      }
      if (s.idleKw / s.committedKw >= 0.3) push({ kind: 'idle-block', severity: 'warning', exposure: s.idleCostMonth * 12, exposureLabel: 'per year for power not drawn',
        detail: `${fmtKw(s.idleKw)} of the ${fmtKw(s.committedKw)} block is never drawn (${Math.round((s.idleKw / s.committedKw) * 100)}%); the block bills in full at ${fmtMoney(s.demandRate)} per kW-month.`,
        evidence: [{ label: 'Idle committed', value: fmtKw(s.idleKw) }, { label: 'Cost per month', value: fmtMoney(s.idleCostMonth) }] });
    } else {
      const prior = Math.round(Math.max(...d.power.history12m.slice(0, 11)) * PEAK_OVER_MEAN);
      if (s.peakKw > s.floorKw && s.peakKw > prior * 1.02) {
        const exposure = Math.round((s.peakKw - prior) * s.demandRate * 12);
        push({ kind: 'demand-ratchet', severity: exposure > s.billMonth * 0.5 ? 'major' : 'minor', exposure, exposureLabel: 'demand charge for the next 12 months',
          detail: `New 12-month demand peak ${fmtKw(s.peakKw)} (previous ${fmtKw(prior)}), above the ${s.floorPct}% take-or-pay floor of ${fmtKw(s.floorKw)}; ${s.supplier} bills the demand charge on the 12-month peak, so this peak sets the charge until next year.`,
          evidence: [{ label: 'Peak today', value: fmtKw(s.peakKw) }, { label: 'Previous 12-month peak', value: fmtKw(prior) }, { label: 'Take-or-pay floor', value: `${fmtKw(s.floorKw)} (${s.floorPct}%)` }, { label: 'Demand charge', value: `${fmtMoney(s.demandRate)} / kW-month` }] });
      }
    }
    const mean = avg(d.power.load24h ?? []);
    if (mean && s.nowKw > mean * 1.12 && !inProgress.has(s.id) && recentJobs(s.id).length === 0) {
      const rise = s.nowKw - mean;
      push({ kind: 'unexplained-rise', severity: 'minor', exposure: Math.round(rise * s.tariff * 24 * MONTH_DAYS), exposureLabel: 'per month if it holds',
        detail: `Facility draw ${fmtKw(s.nowKw)} is ${Math.round((rise / mean) * 100)}% above the 24 h mean of ${fmtKw(Math.round(mean))} with no change in progress and no job started at the site.`,
        evidence: [{ label: 'Draw now', value: fmtKw(s.nowKw) }, { label: '24 h mean', value: fmtKw(Math.round(mean)) }] });
    }
  }
  return out.sort((a, b) => b.exposure - a.exposure);
}

/* ---- the whole view */
export function powerEconomics(db: Db, persona: Persona, dcId?: string): PowerEconomics {
  const g = GEO[activeGeo().id];
  const dcs = db.datacenters.filter(d => (!dcId || d.id === dcId) && d.status !== 'planned');
  const sites = buildSites(db, persona, dcId);
  const anomalies = buildAnomalies(db, sites);
  const gpu = db.gpu;
  const idleJobs = new Set(gpu?.jobs.filter(j => j.state === 'idle').map(j => j.id) ?? []);
  const earning = earningNode(idleJobs);
  const gpuNodes = [...(gpu?.nodes.values() ?? [])];

  const sum = (f: (s: SitePowerEcon) => number) => sites.reduce((a, s) => a + f(s), 0);
  const billMonth = sum(s => s.billMonth), energyCostMonth = sum(s => s.energyCostMonth), kwhMonth = sum(s => s.mwhDay) * 1000 * MONTH_DAYS;
  const soldKw = sum(s => s.soldKw), itKw = sum(s => s.itKw);
  const totals: PowerEconomics['totals'] = {
    billMonth, energyCostMonth, capacityCostMonth: sum(s => s.capacityCostMonth), idleCostMonth: sum(s => s.idleCostMonth),
    committedKw: sum(s => s.committedKw), peakKw: sum(s => s.peakKw), idleKw: sum(s => s.idleKw), soldKw, mwhDay: r1(sum(s => s.mwhDay)),
    blendedTariff: kwhMonth ? energyCostMonth / kwhMonth : g.defTariff,
    costPerSoldMwMonth: soldKw > 0 ? Math.round((billMonth / soldKw) * 1000) : null, costPerItMwMonth: itKw > 0 ? Math.round((billMonth / itKw) * 1000) : 0,
    colocationSites: sites.filter(s => s.kind === 'colocation').length
  };

  /* ---- GPU: what a GPU-hour costs in power, against what it earns */
  let gpuEcon: GpuPowerEcon | null = null;
  if (gpu && gpuNodes.some(n => dcs.some(d => d.id === n.dcId))) {
    const siteBy = new Map(sites.map(s => [s.id, s]));
    const cust = new Map(db.customers.map(c => [c.id, c]));
    const price = (clusterId: string) => jobRate(gpu, { clusterId });
    const pods: GpuPodPowerEcon[] = gpu.clusters.filter(c => siteBy.has(c.dcId)).map(c => {
      const s = siteBy.get(c.dcId)!;
      const ns = c.nodes.map(id => gpu.nodes.get(id)!).filter(Boolean);
      const gpus = ns.length * 8, inJob = ns.filter(earning).length * 8;
      const nodeKw = ns.reduce((a, n) => a + n.powerKw, 0);
      const facKwh = nodeKw * s.pue;                               // one hour of the pod, with the building's share
      const costPerGpuHour = gpus ? (facKwh * s.tariff) / gpus : 0;
      const costPerSold = inJob ? (facKwh * s.tariff) / inJob : null;
      const p = price(c.id);
      const idleKw = ns.filter(n => !earning(n) && n.state !== 'failed' && n.state !== 'drained').reduce((a, n) => a + n.powerKw, 0);
      return {
        clusterId: c.id, name: c.name, dcId: c.dcId, model: gpuName(c.model), vendor: c.vendor, cooling: c.cooling,
        gpus, inJob, nodeKw: r1(nodeKw), kwPerGpu: gpus ? Math.round((nodeKw / gpus) * 100) / 100 : 0, pue: s.pue, tariff: s.tariff,
        costPerGpuHour, costPerSoldGpuHour: costPerSold, price: p, powerSharePct: costPerSold !== null && p ? Math.round((costPerSold / p) * 1000) / 10 : null,
        leftPerGpuHour: costPerSold !== null ? p - costPerSold : null,
        earningDay: Math.round(inJob * p * 24), powerCostDay: Math.round(facKwh * s.tariff * 24), idlePowerCostDay: Math.round(idleKw * s.pue * s.tariff * 24)
      };
    }).sort((a, b) => (b.powerSharePct ?? -1) - (a.powerSharePct ?? -1) || b.gpus - a.gpus);
    const gpus = pods.reduce((a, p) => a + p.gpus, 0), inJobGpus = pods.reduce((a, p) => a + p.inJob, 0);
    const nodeKw = pods.reduce((a, p) => a + p.nodeKw, 0), facilityKw = pods.reduce((a, p) => a + p.nodeKw * p.pue, 0);
    const powerCostDay = pods.reduce((a, p) => a + p.powerCostDay, 0), earningDay = pods.reduce((a, p) => a + p.earningDay, 0);
    const costPerGpuHour = gpus ? powerCostDay / 24 / gpus : 0, costPerSoldGpuHour = inJobGpus ? powerCostDay / 24 / inJobGpus : null;
    const avgPrice = inJobGpus ? earningDay / 24 / inJobGpus : 0;
    const bySite = new Map<string, GpuPodPowerEcon[]>();
    pods.forEach(p => bySite.set(p.dcId, [...(bySite.get(p.dcId) ?? []), p]));
    const clusterBy = new Map(gpu.clusters.map(c => [c.id, c]));

    /* per job: the nodes it holds, their power with the building's share, what it earns, and the power-cap trade-off */
    const jobs: GpuJobPowerEcon[] = gpu.jobs.filter(j => siteBy.has(j.dcId)).map(j => {
      const s = siteBy.get(j.dcId)!, c = clusterBy.get(j.clusterId);
      const ns = j.nodes.map(id => gpu.nodes.get(id)!).filter(Boolean);
      const kw = ns.reduce((a, n) => a + n.powerKw, 0), fac = kw * s.pue;
      const p = price(j.clusterId);
      const capped = ns.flatMap(n => n.gpus.filter(x => x.throttle === 'power-cap'));
      const slow = j.state === 'slowed' ? 1 - j.baselineMs / j.stepMs : 0;
      const owner = cust.get(j.customerId);
      return {
        id: j.id, name: j.name, kind: j.kind, state: j.state, owner: owner?.name ?? j.customerId, customerId: j.customerId, premium: !!owner?.premium, dcId: j.dcId, cluster: c?.name ?? j.clusterId, model: c ? gpuName(c.model) : '',
        gpus: j.gpus, nodeKw: r1(kw), facilityKw: r1(fac), kwhDay: Math.round(fac * 24), powerCostDay: Math.round(fac * s.tariff * 24), earningDay: Math.round(j.gpus * p * 24),
        costPerGpuHour: j.gpus ? (fac * s.tariff) / j.gpus : 0, price: p, powerSharePct: p && j.gpus ? Math.round(((fac * s.tariff) / j.gpus / p) * 1000) / 10 : null,
        wasted: j.state === 'idle', cappedGpus: capped.length, capSavesKw: r1(capped.reduce((a, x) => a + Math.max(0, x.tdpW - x.powerW), 0) / 1000),
        slowdownCostH: capped.length && slow > 0 ? Math.round(j.gpus * p * slow) : 0, incidentId: j.incidentId
      };
    }).sort((a, b) => b.powerCostDay - a.powerCostDay);
    const tenantsBy = new Map<string, GpuTenantPowerEcon>();
    for (const j of jobs) {
      const t = tenantsBy.get(j.customerId) ?? { customerId: j.customerId, name: j.owner, premium: j.premium, jobs: 0, gpus: 0, nodeKw: 0, kwhDay: 0, powerCostDay: 0, earningDay: 0, powerSharePct: null, idleCostDay: 0 };
      t.jobs++; t.gpus += j.gpus; t.nodeKw = r1(t.nodeKw + j.nodeKw); t.kwhDay += j.kwhDay; t.powerCostDay += j.powerCostDay; t.earningDay += j.earningDay; if (j.wasted) t.idleCostDay += j.powerCostDay;
      tenantsBy.set(j.customerId, t);
    }
    const tenants = [...tenantsBy.values()].map(t => ({ ...t, powerSharePct: t.earningDay ? Math.round((t.powerCostDay / t.earningDay) * 1000) / 10 : null })).sort((a, b) => b.powerCostDay - a.powerCostDay);

    /* placement: where the next job should land */
    const FIT_RANK = { good: 0, tight: 1, no: 2 } as const;
    const placement: PlacementHint[] = gpu.clusters.filter(c => siteBy.has(c.dcId)).map(c => {
      const s = siteBy.get(c.dcId)!, d = dcs.find(x => x.id === c.dcId)!;
      const ns = c.nodes.map(id => gpu.nodes.get(id)!).filter(Boolean);
      const free = ns.filter(n => n.state === 'idle' && !n.jobId && n.health === 'healthy');
      const rackIds = new Set(ns.map(n => n.rackId));
      const racks = d.racks.filter(r => rackIds.has(r.id));
      const rackHeadroomKw = r1(racks.reduce((a, r) => a + Math.max(0, r.budgetKw - r.drawKw), 0));
      const rackLoadPct = racks.length ? Math.round(Math.max(...racks.map(r => (r.drawKw / r.budgetKw) * 100))) : 0;
      let coolingState: PlacementHint['coolingState'] = 'ok', coolingHeadroomPct = Math.max(0, Math.round(100 - (d.cooling.loadKw / d.cooling.capacityKw) * 100));
      if (c.cooling === 'liquid') {
        const cdu = gpu.cdus.find(x => x.dcId === c.dcId && x.racks.some(r => rackIds.has(r)));
        if (cdu) { coolingState = cdu.state; coolingHeadroomPct = Math.max(0, Math.round(100 - (cdu.loadKw / cdu.capacityKw) * 100)); }
      } else if (d.cooling.units.some(u => u.status !== 'Operational' && racks.some(r => r.room === u.zone))) coolingState = 'warn';
      const busy = ns.filter(n => n.state === 'in-job');
      const kwPerGpu = busy.length ? busy.reduce((a, n) => a + n.powerKw, 0) / (busy.length * 8) : ns.length ? Math.max(0.5, (ns.reduce((a, n) => a + n.powerKw, 0) / (ns.length * 8)) * 2) : 0.7;
      const marginal = kwPerGpu * s.pue * s.tariff;
      const needKw = free.reduce((a, n) => a + Math.max(0, kwPerGpu * 8 - n.powerKw), 0);
      const why: string[] = [];
      let fit: PlacementHint['fit'] = 'good';
      const tight = () => { if (fit !== 'no') fit = 'tight'; };
      if (!free.length) { fit = 'no'; why.push('no free healthy nodes'); }
      if (coolingState === 'bad') { fit = 'no'; why.push('cooling loop in fault'); } else if (coolingState === 'warn') { tight(); why.push('cooling degraded in the room'); }
      if (rackLoadPct >= 90) { tight(); why.push(`racks at ${rackLoadPct}% of budget`); }
      if (s.headroomKw < needKw) { tight(); why.push(`${fmtKw(s.headroomKw)} contracted headroom for ${fmtKw(Math.round(needKw))} of load`); }
      if (s.kind === 'colocation' && s.idleKw > 0) why.push(`${fmtKw(s.idleKw)} of the block is already paid for`);
      if (s.kind === 'utility' && s.peakKw < s.floorKw) why.push(`${fmtKw(s.floorKw - s.peakKw)} under the take-or-pay floor: more load costs energy only`);
      if (!why.length) why.push('free GPUs with rack, cooling and contract headroom');
      return {
        clusterId: c.id, name: c.name, dcId: c.dcId, model: gpuName(c.model), vendor: c.vendor, cooling: c.cooling, scheduler: c.scheduler,
        freeGpus: free.length * 8, freeNodes: free.length, rackHeadroomKw, rackLoadPct, coolingHeadroomPct, coolingState,
        siteHeadroomKw: s.headroomKw, paidIdleKw: s.kind === 'colocation' ? s.idleKw : Math.max(0, s.floorKw - s.peakKw), tariff: s.tariff, pue: s.pue, marginalCostPerGpuHour: marginal, fit, why
      };
    }).sort((a, b) => FIT_RANK[a.fit] - FIT_RANK[b.fit] || (b.paidIdleKw > 0 ? 1 : 0) - (a.paidIdleKw > 0 ? 1 : 0) || a.marginalCostPerGpuHour - b.marginalCostPerGpuHour || b.freeGpus - a.freeGpus);

    gpuEcon = {
      gpus, inJobGpus, nodeKw: r1(nodeKw), facilityKw: Math.round(facilityKw), powerCostDay, idlePowerCostDay: pods.reduce((a, p) => a + p.idlePowerCostDay, 0),
      costPerGpuHour, costPerSoldGpuHour, avgPrice, powerSharePct: costPerSoldGpuHour !== null && avgPrice ? Math.round((costPerSoldGpuHour / avgPrice) * 1000) / 10 : null, earningDay,
      deck: { kwPerGpu: 1.2, pue: 1.46, tariff: totals.blendedTariff, costPerGpuHour: 1.2 * 1.46 * totals.blendedTariff },
      pods, jobs, tenants, placement,
      sites: [...bySite.entries()].map(([id, ps]) => {
        const s = siteBy.get(id)!;
        const g2 = ps.reduce((a, p) => a + p.gpus, 0), ij = ps.reduce((a, p) => a + p.inJob, 0), kw = ps.reduce((a, p) => a + p.nodeKw, 0), cd = ps.reduce((a, p) => a + p.powerCostDay, 0);
        return { dcId: id, gpus: g2, inJob: ij, nodeKw: r1(kw), pue: s.pue, tariff: s.tariff, costPerGpuHour: g2 ? cd / 24 / g2 : 0, costPerSoldGpuHour: ij ? cd / 24 / ij : null, powerCostDay: cd, earningDay: ps.reduce((a, p) => a + p.earningDay, 0) };
      }).sort((a, b) => b.powerCostDay - a.powerCostDay)
    };
  }

  return { anomalies, sites: sites.sort((a, b) => b.idleCostMonth - a.idleCostMonth || b.billMonth - a.billMonth), totals, sources: { tariff: g.tariffSource, demand: g.demandSource, colocation: g.coloSource }, gpu: gpuEcon };
}

/* a GPU site's power facts for other screens (the datacenter page, Opstral AI) */
export const siteOf = (e: PowerEconomics, dcId: string) => e.sites.find(s => s.id === dcId);

/* ---- generator phase (after every other alarm and incident, so nothing else moves): one alarm per power finding, one incident
   for the costliest contract finding. Not for the network persona (its data stays byte-identical). */
type AlertAdder = (a: { dcId: string; severity: 'critical' | 'major' | 'minor' | 'warning'; title: string; description: string; source: 'Power'; type: string; start: number; state: 'active'; code: string; scope: 'site'; category: 'Facility' }) => { id: string; start: number; incidentId?: string };
export function raisePowerContractAlerts(db: Db, persona: Persona, addAlert: AlertAdder, sla: { response: Record<number, number>; resolve: Record<number, number> }) {
  if (persona === 'network') return;
  const sites = buildSites(db, persona);
  const anomalies = buildAnomalies(db, sites);
  const raised = anomalies.map(a => ({ a, al: addAlert({ dcId: a.dcId, severity: a.severity, title: a.title, description: a.detail, source: 'Power', type: 'Power', start: db.now - (a.kind === 'unexplained-rise' ? 35 : 140) * MIN, state: 'active', code: anomalyAlertCode(a.dcId, a.kind), scope: 'site', category: 'Facility' }) }));
  const top = raised.find(r => r.a.kind === 'block-near-limit' || r.a.kind === 'demand-ratchet');
  if (!top) return;
  const { a, al } = top; const s = sites.find(x => x.id === a.dcId)!; const d = db.datacenters.find(x => x.id === a.dcId)!;
  const detected = al.start;
  const recent = (db.gpu?.jobs ?? []).filter(j => j.dcId === a.dcId && j.started > db.now - 3 * DAY).sort((x, y) => y.started - x.started);
  const nodeKwOf = (ids: string[]) => ids.reduce((x, id) => x + (db.gpu?.nodes.get(id)?.powerKw ?? 0), 0);
  const recentKw = recent.reduce((acc, j) => acc + nodeKwOf(j.nodes), 0);
  const infer = (db.gpu?.jobs ?? []).filter(j => j.dcId === a.dcId && j.kind === 'inference');
  const inferKw = infer.reduce((acc, j) => acc + nodeKwOf(j.nodes), 0);
  const cool = d.cooling.units.filter(u => u.loadPct >= 85);
  const alt = sites.filter(x => x.id !== a.dcId && x.idleKw > 200 && (db.gpu ? [...db.gpu.nodes.values()].some(n => n.dcId === x.id && n.state === 'idle' && !n.jobId) : false)).sort((x, y) => y.idleKw - x.idleKw)[0];
  const owner = person('Rohan Mehta');
  const id = `INC-${String(++db.seq.inc).padStart(4, '0')}`;
  const colo = a.kind === 'block-near-limit';
  const inc: Incident = {
    id, title: colo ? `${a.dcId} is drawing ${Math.round((s.peakKw / s.committedKw) * 100)}% of its ${fmtKw(s.committedKw)} power block — overage exposure` : `New demand peak at ${a.dcId} sets the demand charge for 12 months (${fmtMoney(a.exposure)})`,
    type: 'Power', sev: 3, pri: 3, status: 'Investigating', owner, reportedBy: 'EPMS meter · power contract check', dcId: a.dcId, detected, acknowledged: detected + 12 * MIN,
    responseSlaMin: sla.response[3], resolveSlaMin: sla.resolve[3], alertIds: [al.id],
    affected: [{ kind: 'Facility', id: `${a.dcId}-POWER`, label: `${a.dcId} power supply · ${s.supplier}` }, ...(recent[0] ? [{ kind: 'Service' as const, id: recent[0].serviceId ?? recent[0].id, label: `${recent[0].name} (${recent[0].gpus} GPUs)` }] : [])],
    rca: [
      ...(recent.length ? [{ cause: `${recent.length} GPU job${recent.length === 1 ? '' : 's'} started in the last 3 days at ${a.dcId} added about ${fmtKw(Math.round(recentKw * s.pue))} of facility load and pushed the draw over the ${colo ? 'block' : 'previous peak'}`, confidence: 68,
        evidence: [...recent.slice(0, 3).map(j => ({ label: `${j.name} · ${j.gpus} GPUs started ${Math.round((db.now - j.started) / HOUR)} h ago`, ref: j.nodes[0], at: j.started })), { label: `Peak ${fmtKw(s.peakKw)} against ${colo ? `block ${fmtKw(s.committedKw)}` : `previous peak ${a.evidence[1]?.value ?? ''}`}`, ref: a.dcId }] }] : []),
      { cause: cool.length ? `${cool.length} cooling unit${cool.length === 1 ? '' : 's'} at ≥85% load through the afternoon added facility overhead (PUE ${s.pue})` : `Cooling overhead at PUE ${s.pue} magnifies every IT kilowatt`, confidence: recent.length ? 22 : 60, evidence: cool.slice(0, 2).map(u => ({ label: `${u.name} at ${u.loadPct}% load`, ref: a.dcId })) },
      { cause: `Meter or billing error at ${s.supplier}`, confidence: 10, evidence: [{ label: 'EPMS reading and supplier interval data to be compared', ref: a.dcId }] }
    ],
    actions: [
      { id: 'A1', step: `Cap the ${infer.length} inference job${infer.length === 1 ? '' : 's'} at ${a.dcId} (${fmtKw(Math.round(inferKw))}) to 70% TDP in the 14:00–18:00 peak window`, owner: 'GPU ops', expected: `Peak falls by about ${fmtKw(Math.round(inferKw * 0.3 * s.pue))}; inference latency within SLO`, rollback: 'Lift the cap', verify: 'EPMS peak below the threshold for two days', disruptive: false, status: 'pending' },
      { id: 'A2', step: alt ? `Place new jobs at ${alt.id}: ${fmtKw(alt.idleKw)} of ${alt.kind === 'colocation' ? 'its block' : 'its floor'} is already paid for` : 'Hold new job placements at this site until the block is uplifted', owner: 'Capacity planning', expected: 'No further growth at this site this month', rollback: 'n/a', verify: 'Scheduler placement hints updated', disruptive: false, status: 'pending' },
      { id: 'A3', step: `Ask ${s.supplier} to confirm the peak against the EPMS meter and quote ${colo ? 'a block uplift' : 'a floor reset'} ahead of the ${new Date(s.termEnd).getFullYear()} renewal`, owner: 'Facilities · commercial', expected: colo ? `Next 100 kW tranche priced; overage at ${OVERAGE_X}× avoided` : 'Demand charge basis confirmed', rollback: 'n/a', verify: 'Supplier confirmation attached', disruptive: false, status: 'pending' }
    ],
    changeIds: [], worklog: [
      { at: detected, who: 'Monitoring', text: `Raised from the EPMS meter against the power contract: ${a.detail}`, kind: 'system' },
      { at: detected + 12 * MIN, who: owner, text: `Acknowledged; exposure ${fmtMoney(a.exposure)} ${a.exposureLabel}.`, kind: 'human' }
    ],
    impact: { services: 0, customers: 0, premium: 0, revenueAtRisk: a.exposure, level: 'Medium', summary: `No service is affected; the exposure is commercial: ${fmtMoney(a.exposure)} ${a.exposureLabel} at ${s.supplier}.` },
    similar: null, verification: [{ check: 'Peak demand below the threshold for two consecutive days', ok: null }, { check: 'Supplier reading matches the EPMS meter', ok: null }, { check: colo ? 'Block uplift or placement moves agreed' : 'Demand charge basis confirmed in writing', ok: null }]
  };
  al.incidentId = id;
  db.incidents.push(inc);
}
