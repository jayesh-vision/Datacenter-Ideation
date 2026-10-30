/* GPU capacity as a product (30-Oct-2026, user: RunPod / Vast.ai show how GPUs are SOLD; we only watched the hardware).
   Derived per data version from db.gpu, the jobs and the customers — nothing generated changes, so every fingerprint holds.
   - A node in a job is sold as one INSTANCE of its model's instance type: reserved when the customer holds a committed
     contract (premium), otherwise on-demand, or spot (interruptible) for about half of the on-demand inference work.
   - A spare node is AVAILABLE only once it is fit to sell: burn-in passed, benchmark ≥ 95% of the model's reference and
     30-day reliability ≥ 99%; otherwise it is held back. Drained = hold, failed / RMA = out of service, burn-in = under test.
   - Spot instances reclaimed in the last 24 h are listed as interruptions (reserved customer, firmware drain, node failure).
   Money stays the flat GPU-hour rate (tier pricing comes from the BSS catalogue — to discuss). */
import type { Customer, GpuInstance, GpuJob, GpuMarket, GpuMarketCustomer, GpuModel, GpuNode, GpuOccupancyRow, GpuPreemption, GpuReadiness, GpuReadyStatus, GpuSellTier, Persona } from '../api/types';
import type { Db } from './generate';
import { jobRate } from './gpu';
import { GPU_BENCH, gpuSpec, instanceType } from '../lib/gpuSpec';
import { mulberry32, seedOf, intBetween, between, chance, type Rnd } from '../lib/rng';

const HOUR = 3600000, DAY = 24 * HOUR;
const rngOf = (id: string, salt: number): Rnd => mulberry32(seedOf(id) ^ salt);
const r1 = (n: number) => Math.round(n * 10) / 10, r2 = (n: number) => Math.round(n * 100) / 100;

/* is this estate's GPU capacity sold by the hour? (enterprise charges business units back: no tiers, no instances) */
export const sellsGpus = (p: Persona) => p === 'cloud' || p === 'neocloud';

/* fit to sell: burn-in, acceptance benchmark against the model's reference, 30-day reliability — seeded on the node id, read from its telemetry */
export function readinessOf(n: GpuNode, now: number): GpuReadiness {
  const rr = rngOf(n.neId, 0x5e11);
  const ref = GPU_BENCH[n.model];
  const throttled = n.gpus.some(g => g.throttle !== 'none'), degraded = n.health === 'degraded' || n.gpus.some(g => g.health !== 'healthy');
  const railsDown = n.ib.filter(p => p.state !== 'up').length;
  /* a few idle nodes came back from a swap with a weak re-test, or have been flaky this month: they are held back from sale */
  const weakRetest = n.state === 'idle' && n.health === 'healthy' && chance(rr, 0.12);
  const flaky = n.state === 'idle' && n.health === 'healthy' && chance(rr, 0.06);
  let score = degraded || throttled ? between(rr, 68, 92) : weakRetest ? between(rr, 88, 94.4) : between(rr, 96, 102.5);
  if (railsDown) score -= 3 * railsDown;
  score = r1(Math.max(0, score));
  const busHit = railsDown ? 1 - 0.09 * railsDown : 1;
  const bench = { score, hbmTbs: r2(ref.hbmTbs * Math.min(1.02, score / 100)), hbmRef: ref.hbmTbs, busGbs: Math.round(ref.busGbs * Math.min(1.02, score / 100) * busHit), busRef: ref.busGbs, at: now - intBetween(rr, 2, 60) * DAY };
  const burnIn = n.state === 'burn-in' ? { result: 'running' as const, at: now - intBetween(rr, 2, 20) * HOUR, hours: 24 } : { result: 'pass' as const, at: bench.at - intBetween(rr, 0, 3) * DAY, hours: 24 };
  const bad = n.health === 'failed' || n.state === 'failed' || !!n.rma;
  const reliability = r2(bad ? between(rr, 97, 99) : flaky ? between(rr, 98.2, 98.9) : between(rr, 99.3, 100));
  const interruptions30d = (bad ? 1 : 0) + (n.state === 'drained' ? 1 : 0) + (flaky ? intBetween(rr, 2, 4) : chance(rr, 0.2) ? 1 : 0);
  const why: string[] = [];
  if (bad) why.push(n.rma ? `Open ${n.rma}` : 'Node failed');
  if (n.state === 'burn-in') why.push('24 h burn-in running');
  if (n.state === 'drained') why.push(n.note ?? 'Cordoned');
  if (score < 95) why.push(`Benchmark ${score}% of reference${railsDown ? ` · ${railsDown} rail${railsDown > 1 ? 's' : ''} down` : throttled ? ' · throttled' : degraded ? ' · degraded GPU' : ''}`);
  if (reliability < 99) why.push(`Reliability ${reliability}% · ${interruptions30d} interruptions in 30 d`);
  const status: GpuReadyStatus = bad ? 'Out of service' : n.state === 'burn-in' ? 'Burn-in' : n.state === 'drained' ? 'Hold' : n.state === 'idle' && (score < 95 || reliability < 99) ? 'Held back' : 'Sellable';
  const grade = status !== 'Sellable' || score < 95 || reliability < 99 ? 'C' : score >= 98 && reliability >= 99.8 && interruptions30d === 0 ? 'A' : 'B';
  if (status === 'Sellable' && n.state === 'in-job' && score < 95) why.push('Below reference while sold: swap at the next checkpoint');
  return { status, grade, burnIn, bench, reliability, interruptions30d, why };
}

/* how a job's nodes are sold: committed customers hold reserved capacity; pay-as-you-go work is on-demand, inference partly spot */
export const tierOf = (j: GpuJob, premium: boolean): GpuSellTier => premium ? 'reserved' : j.kind === 'inference' && chance(rngOf(j.id, 0x5907), 0.55) ? 'spot' : 'on-demand';

export function buildMarket(db: Db, persona: Persona, nodesAll: GpuNode[], ready: Map<string, GpuReadiness>, now: number, dcId?: string): GpuMarket | null {
  const st = db.gpu;
  if (!st || !sellsGpus(persona) || !nodesAll.length) return null;
  const cust = new Map(db.customers.map(c => [c.id, c]));
  const inScope = (id: string) => !dcId || id === dcId;
  const name = (id: string) => cust.get(id)?.name ?? id;

  /* instances: one per node in a job, numbered over the whole estate so ids do not move with the scope */
  const tiers = new Map<string, GpuSellTier>();
  const instances: GpuInstance[] = [];
  let seq = 0;
  for (const j of st.jobs) {
    const tier = tierOf(j, !!cust.get(j.customerId)?.premium);
    tiers.set(j.id, tier);
    for (const neId of j.nodes) {
      seq++;
      const n = st.nodes.get(neId); if (!n || !inScope(n.dcId)) continue;
      const rate = 8 * jobRate(st, j);
      instances.push({ id: `INST-${String(100000 + seq).slice(1)}`, neId, dcId: n.dcId, clusterId: n.clusterId, jobId: j.id, customerId: j.customerId, model: n.model, tier, type: instanceType(n.model), state: 'running',
        started: j.started, ratePerHour: Math.round(rate), gpuHours: Math.round(8 * (now - j.started) / HOUR), preemptible: tier === 'spot', jobState: j.state, incidentId: j.incidentId });
    }
  }

  /* interruptions in the last 24 h: spot capacity reclaimed for a reserved customer, or lost to a drain / failure, per pod */
  const preemptions: GpuPreemption[] = [];
  for (const cl of st.clusters) {
    if (!inScope(cl.dcId)) continue;
    const jobs = st.jobs.filter(j => j.clusterId === cl.id);
    const spot = jobs.filter(j => tiers.get(j.id) === 'spot'), reserved = jobs.filter(j => tiers.get(j.id) === 'reserved');
    if (!spot.length) continue;
    const rr = rngOf(cl.id, 0x9e3);
    const k = chance(rr, 0.5) ? (chance(rr, 0.35) ? 2 : 1) : 0;
    const drained = cl.nodes.map(id => st.nodes.get(id)!).filter(n => n.state === 'drained'), failed = cl.nodes.map(id => st.nodes.get(id)!).filter(n => n.state === 'failed' && !n.rma);
    for (let i = 0; i < k; i++) {
      const s = spot[i % spot.length];
      const pick = i === 0 && reserved.length ? 'reserved' : drained.length ? 'drained' : failed.length ? 'failed' : reserved.length ? 'reserved' : '';
      if (!pick) break;
      const node = pick === 'reserved' ? st.nodes.get(reserved[0].nodes[intBetween(rr, 0, reserved[0].nodes.length - 1)])! : pick === 'drained' ? drained[0] : failed[0];
      const at = now - intBetween(rr, 1, 23) * HOUR - intBetween(rr, 0, 59) * 60000;
      preemptions.push({ id: `PRE-${cl.id.replace(/-POD-/, '-')}-${i + 1}`, at, instanceId: `INST-${String(100000 + seq + preemptions.length + 1).slice(1)}`, neId: node.neId, dcId: cl.dcId, clusterId: cl.id, customerId: s.customerId, model: node.model,
        reason: pick === 'reserved' ? `Capacity reclaimed for ${name(reserved[0].customerId)} (reserved)` : pick === 'drained' ? 'Node cordoned for the firmware update' : 'Node failed (GPU fell off the bus)',
        takenBy: pick === 'reserved' ? reserved[0].customerId : undefined, gpuHoursLost: r1(8 * between(rr, 0.05, 0.5)), notified: pick !== 'failed' || chance(rr, 0.5) });
    }
  }
  preemptions.sort((a, b) => b.at - a.at);

  /* occupancy per group */
  const instByNode = new Map(instances.map(i => [i.neId, i]));
  const rateOf = (m: GpuModel) => st.ratePerGpuHour * gpuSpec(m).rateX;
  const row = (key: string, label: string, ns: GpuNode[], extra: Partial<GpuOccupancyRow> = {}): GpuOccupancyRow => {
    const tier = (t: GpuSellTier) => ns.filter(n => instByNode.get(n.neId)?.tier === t).length * 8;
    const reserved = tier('reserved'), onDemand = tier('on-demand'), spot = tier('spot');
    const available = ns.filter(n => ready.get(n.neId)?.status === 'Sellable' && n.state === 'idle').length * 8;
    const heldBack = ns.filter(n => ready.get(n.neId)?.status === 'Held back').length * 8;
    const sold = reserved + onDemand + spot, sellable = sold + available;
    const unsold = ns.filter(n => ready.get(n.neId)?.status === 'Sellable' && n.state === 'idle').reduce((a, n) => a + 8 * rateOf(n.model) * 24, 0);
    return { key, label, installed: ns.length * 8, reserved, onDemand, spot, available, heldBack, out: ns.length * 8 - sold - available - heldBack, sold, sellable,
      occupancyPct: sellable ? Math.round((sold / sellable) * 100) : 0, soldOut: sellable > 0 && available === 0, unsoldPerDay: Math.round(unsold),
      interruptions24h: preemptions.filter(p => ns.some(n => n.neId === p.neId)).length, ...extra };
  };
  const byModel = [...new Set(nodesAll.map(n => n.model))].map(m => row(m, m, nodesAll.filter(n => n.model === m), { model: m, vendor: gpuSpec(m).vendor })).sort((a, b) => b.installed - a.installed);
  const placeKind = dcId ? 'pod' : 'site';
  const byPlace = dcId
    ? st.clusters.filter(c => c.dcId === dcId).map(c => row(c.id, c.name, nodesAll.filter(n => n.clusterId === c.id), { clusterId: c.id, dcId, model: c.model, vendor: c.vendor, sub: `${gpuSpec(c.model).vendor} ${gpuSpec(c.model).short} · ${c.room}` }))
    : [...new Set(nodesAll.map(n => n.dcId))].sort().map(id => row(id, id, nodesAll.filter(n => n.dcId === id), { dcId: id, sub: `${new Set(nodesAll.filter(n => n.dcId === id).map(n => gpuSpec(n.model).short)).size} models` }));
  const all = row('all', 'All', nodesAll);

  /* 24 h: a node whose mean utilisation was above 5% in that hour was sold then */
  const inService = nodesAll.filter(n => n.state === 'in-job' || n.state === 'idle');
  const series = Array.from({ length: 24 }, (_, h) => inService.length ? Math.round((inService.filter(n => (n.series.util[h] ?? 0) >= 5).length / inService.length) * 100) : 0);

  const customers: GpuMarketCustomer[] = [...new Set(instances.map(i => i.customerId))].map(id => {
    const on = instances.filter(i => i.customerId === id);
    return { customerId: id, name: name(id), premium: !!cust.get(id)?.premium, instances: on.length, gpus: on.length * 8, reserved: on.filter(i => i.tier === 'reserved').length, onDemand: on.filter(i => i.tier === 'on-demand').length, spot: on.filter(i => i.tier === 'spot').length,
      ratePerHour: on.reduce((a, i) => a + i.ratePerHour, 0), sites: [...new Set(on.map(i => i.dcId))].sort(), hurt: on.filter(i => i.jobState !== 'running').length };
  }).sort((a, b) => b.gpus - a.gpus);

  const readiness: Record<GpuReadyStatus, number> = { Sellable: 0, 'Held back': 0, 'Burn-in': 0, Hold: 0, 'Out of service': 0 };
  nodesAll.forEach(n => { readiness[ready.get(n.neId)!.status]++; });
  return {
    installed: all.installed, sold: all.sold, reserved: all.reserved, onDemand: all.onDemand, spot: all.spot, available: all.available, heldBack: all.heldBack, out: all.out, sellable: all.sellable,
    occupancyPct: all.occupancyPct, unsoldPerDay: all.unsoldPerDay, soldOut: byModel.filter(r => r.soldOut).length, interruptions24h: preemptions.length, gpuHoursLost24h: r1(preemptions.reduce((a, p) => a + p.gpuHoursLost, 0)),
    series, byModel, byPlace, placeKind, instances, preemptions, customers, readiness
  };
}

export type { Customer };
