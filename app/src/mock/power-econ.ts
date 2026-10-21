/* Power economics (21-Oct-2026, user: "build the power economics screens" after the neocloud pitch deck review).
   The deck sells power as a cost line and a contract risk (slides 14–16: committed MW, take-or-pay, idle megawatts, cost per
   sold MW, power and cooling per GPU-hour) but has no screen behind it. This read model puts numbers on those words using
   what the estate already knows — every site's live power split (IT, cooling, lighting = facility load), its peak, its PUE,
   the GPU fleet's node power and the GPU rate card — plus two things the estate cannot know and a customer would supply:
   · a TARIFF per state (published industrial averages, local currency, marked illustrative on screen), and
   · a POWER CONTRACT per site, seeded on the site id: committed kW (the utility connection or the colocation power block),
     a take-or-pay floor, a yearly escalator, the term end. Cloud and NeoCloud rent part of their estate in colocation, where
     the whole committed block is billed per kW-month whether drawn or not — the deck's "paying for idle megawatts".
   Derived only: nothing generated changes, every fingerprint holds. Money is in the geography's currency (tariffs are real
   local prices, so they are NOT run through money()). */
import type { GpuPodPowerEcon, GpuPowerEcon, Persona, PowerEconomics, SitePowerEcon } from '../api/types';
import type { Db } from './generate';
import { activeGeo } from './geo';
import { gpuName } from '../lib/gpuSpec';
import { jobRate } from './gpu';

const DAY = 86_400_000, MONTH_DAYS = 30.4, MONTH = 30.4 * DAY;
const r1 = (n: number) => Math.round(n * 10) / 10;
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

export function powerEconomics(db: Db, persona: Persona, dcId?: string): PowerEconomics {
  const g = GEO[activeGeo().id];
  const dcs = db.datacenters.filter(d => (!dcId || d.id === dcId) && d.status !== 'planned');
  const gpu = db.gpu;
  /* the GPU nodes that earn now: in a job that is not idle */
  const idleJobs = new Set(gpu?.jobs.filter(j => j.state === 'idle').map(j => j.id) ?? []);
  const earning = (n: { state: string; jobId?: string }) => n.state === 'in-job' && !!n.jobId && !idleJobs.has(n.jobId);
  const gpuNodes = [...(gpu?.nodes.values() ?? [])];

  const sites: SitePowerEcon[] = dcs.map(d => {
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
    gpuEcon = {
      gpus, inJobGpus, nodeKw: r1(nodeKw), facilityKw: Math.round(facilityKw), powerCostDay, idlePowerCostDay: pods.reduce((a, p) => a + p.idlePowerCostDay, 0),
      costPerGpuHour, costPerSoldGpuHour, avgPrice, powerSharePct: costPerSoldGpuHour !== null && avgPrice ? Math.round((costPerSoldGpuHour / avgPrice) * 1000) / 10 : null, earningDay,
      deck: { kwPerGpu: 1.2, pue: 1.46, tariff: totals.blendedTariff, costPerGpuHour: 1.2 * 1.46 * totals.blendedTariff },
      pods,
      sites: [...bySite.entries()].map(([dcId, ps]) => {
        const s = siteBy.get(dcId)!;
        const g2 = ps.reduce((a, p) => a + p.gpus, 0), ij = ps.reduce((a, p) => a + p.inJob, 0), kw = ps.reduce((a, p) => a + p.nodeKw, 0), cd = ps.reduce((a, p) => a + p.powerCostDay, 0);
        return { dcId, gpus: g2, inJob: ij, nodeKw: r1(kw), pue: s.pue, tariff: s.tariff, costPerGpuHour: g2 ? cd / 24 / g2 : 0, costPerSoldGpuHour: ij ? cd / 24 / ij : null, powerCostDay: cd, earningDay: ps.reduce((a, p) => a + p.earningDay, 0) };
      }).sort((a, b) => b.powerCostDay - a.powerCostDay)
    };
  }

  return { sites: sites.sort((a, b) => b.idleCostMonth - a.idleCostMonth || b.billMonth - a.billMonth), totals, sources: { tariff: g.tariffSource, demand: g.demandSource, colocation: g.coloSource }, gpu: gpuEcon };
}

/* a GPU site's power facts for other screens (the datacenter page, Opstral AI) */
export const siteOf = (e: PowerEconomics, dcId: string) => e.sites.find(s => s.id === dcId);
