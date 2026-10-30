/* Read model for the AI & GPU screens: roll-ups, per-job cost of lost GPU time, clusters with a
   per-node heat map, nodes, cooling loops, GPU racks and the InfiniBand rails. Derived only from
   db.gpu, the alarms and the services, so it matches every other screen. */

import type { AiCage, Cdu, Gpu, GpuCluster, GpuInstance, GpuJob, GpuMarket, GpuNode, GpuReadiness, Persona } from '../api/types';
import type { Db } from './generate';
import { isDrift, jobRate } from './gpu';
import { gpuSpec } from '../lib/gpuSpec';
import { buildMarket, readinessOf } from './gpu-market';

const HOUR = 3600000;
export type Worst = 'ok' | 'warn' | 'bad';
export interface GpuJobRow extends GpuJob {
  owner: string; premium: boolean; cluster: string; gpuModel: string; slowdownPct: number;
  /* GPU time being lost now (₹/h), lost so far (₹), work to redo since the last checkpoint (₹), at stake if an at-risk job crashes (₹) */
  wasteRate: number; wasteSoFar: number; redo: number; atStake: number;
  incidentSev?: number; incidentStatus?: string;
}
/* one accelerator model in scope: how many, where, how busy and how healthy */
export interface GpuModelRow { model: GpuNode['model']; vendor: GpuNode['vendor']; nodes: number; gpus: number; inJob: number; util: number; degraded: number; failed: number; sites: string[]; clusters: number; powerKw: number }
export interface GpuNodeRow extends GpuNode { cluster: string; job?: string; jobState?: string; owner?: string; util: number; maxTemp: number; throttled: number; xid?: Gpu['xid']; worst: Worst; alerts: number; rackName: string; room: string; drift: boolean; ready: GpuReadiness; instance?: GpuInstance }
export interface GpuClusterRow extends GpuCluster { gpus: number; inJob: number; spare: number; out: number; healthy: number; degraded: number; failed: number; jobs: number; util: number; powerKw: number; worst: Worst; cells: { neId: string; state: GpuNode['state']; worst: Worst; jobId?: string; g: { h: Gpu['health']; u: number; t: number; th: Gpu['throttle'] }[] }[] }
export interface GpuRackRow { id: string; name: string; dcId: string; room: string; drawKw: number; budgetKw: number; liquid: boolean; nodes: number; maxTemp: number; cdu?: string; state: Worst }
/* DCGM-level view of the whole fleet (or one site): distributions, 24 h history, error leaders */
export interface GpuTelemetry {
  utilHist: { label: string; n: number }[]; tempHist: { label: string; n: number }[];
  series: { util: number[]; power: number[]; hottest: number[] };       // 24 h: fleet mean utilisation %, total node power kW, hottest GPU °C
  energyMwh24: number; powerKwNow: number; avgPowerW: number; avgTdpPct: number;
  pstate: { P0: number; P8: number; other: number }; fanAvg: number;
  tensorAvg: number; smAvg: number;                                      // in jobs
  xid24: number[];                                                        // Xid events per hour, last 24 h
  ecc: { sbe: number; dbe: number; retired: number; remap: number };
  leaders: { hottest: Leader[]; pcie: Leader[]; nvlink: Leader[]; sbe: Leader[]; idle: Leader[] };
  fields: { field: string; what: string }[];
}
export interface Leader { neId: string; dcId: string; gpu: number; value: number; unit: string; job?: string }
export interface GpuView {
  kind: 'fleet' | 'cages' | 'none'; dcId?: string; now: number; rate: number; rateLabel: string; sites: { id: string; nodes: number; cages: number }[];
  fleet: {
    nodes: number; gpus: number; nodeState: Record<GpuNode['state'], number>; gpuHealth: Record<Gpu['health'], number>;
    inJobGpus: number; spareGpus: number; outGpus: number; allocatedPct: number; utilInJobs: number;
    throttle: { thermal: number; hw: number; power: number }; hottest: number; xid: { code: number; text: string; n: number }[]; sbe: number; dbe: number; remapPending: number;
    driftNodes: number; driverStd: string; rmaOpen: number; burnIn: number; liquidNodes: number; powerKw: number; models: GpuModelRow[];
  };
  jobsSummary: { running: number; slowed: number; stalled: number; atRisk: number; idle: number; total: number; gpus: number };
  waste: { rate: number; stalled: number; slowed: number; idle: number; soFar: number; redo: number; atStake: number };
  jobs: GpuJobRow[]; clusters: GpuClusterRow[]; nodes: GpuNodeRow[]; cdus: (Cdu & { util: number })[]; racks: GpuRackRow[];
  rails: { clusterId: string; cluster: string; dcId: string; rails: { rail: number; up: number; flapping: number; down: number; errors: number }[] }[];
  cages: (AiCage & { tenant: string; premium: boolean; pct: number; revenue: number })[];
  cageTotals: { cages: number; contractedKw: number; drawKw: number; tenants: number; revenue: number; liquid: number };
  telemetry: GpuTelemetry | null;
  market: GpuMarket | null;                 // how the GPUs are sold (null where capacity is not rented by the hour)
}

const xidText: Record<number, string> = { 79: 'Fell off the bus', 74: 'NVLink error', 48: 'Uncorrectable ECC', 63: 'Row remap', 94: 'Contained ECC', 95: 'Uncontained ECC' };

export function gpuView(db: Db, persona: Persona, dcId?: string): GpuView {
  const st = db.gpu;
  const now = db.now;
  const inScope = (id: string) => !dcId || id === dcId;
  const rate = st?.ratePerGpuHour ?? 0;
  const empty: GpuView = {
    kind: 'none', dcId, now, rate, rateLabel: '', sites: [],
    fleet: { nodes: 0, gpus: 0, nodeState: { 'in-job': 0, idle: 0, drained: 0, failed: 0, 'burn-in': 0 }, gpuHealth: { healthy: 0, degraded: 0, failed: 0 }, inJobGpus: 0, spareGpus: 0, outGpus: 0, allocatedPct: 0, utilInJobs: 0, throttle: { thermal: 0, hw: 0, power: 0 }, hottest: 0, xid: [], sbe: 0, dbe: 0, remapPending: 0, driftNodes: 0, driverStd: st?.driverStd ?? '', rmaOpen: 0, burnIn: 0, liquidNodes: 0, powerKw: 0, models: [] },
    jobsSummary: { running: 0, slowed: 0, stalled: 0, atRisk: 0, idle: 0, total: 0, gpus: 0 }, waste: { rate: 0, stalled: 0, slowed: 0, idle: 0, soFar: 0, redo: 0, atStake: 0 },
    jobs: [], clusters: [], nodes: [], cdus: [], racks: [], rails: [], cages: [], cageTotals: { cages: 0, contractedKw: 0, drawKw: 0, tenants: 0, revenue: 0, liquid: 0 }, telemetry: null, market: null
  };
  if (!st) return empty;
  const dcById = new Map(db.datacenters.map(d => [d.id, d]));
  const cust = new Map(db.customers.map(c => [c.id, c]));
  const cdus = st.cdus.filter(c => inScope(c.dcId)).map(c => ({ ...c, util: Math.round((c.loadKw / c.capacityKw) * 100) }));

  /* colocation: tenant AI cages only */
  if (persona === 'colocation') {
    const cages = st.cages.filter(c => inScope(c.dcId)).map(c => {
      const t = cust.get(c.tenantId);
      const revenue = db.services.filter(s => s.dcId === c.dcId && s.customerId === c.tenantId && s.unit === 'kW' && s.ifName.startsWith(`${c.name} `)).reduce((a, s) => a + s.revenueMonthly, 0);
      return { ...c, tenant: t?.name ?? c.tenantId, premium: !!t?.premium, pct: Math.round((c.drawKw / c.contractedKw) * 100), revenue };
    });
    const sites = [...new Set(st.cages.map(c => c.dcId))].sort().map(id => ({ id, nodes: 0, cages: st.cages.filter(c => c.dcId === id).length }));
    return { ...empty, kind: cages.length || !dcId ? 'cages' : 'none', rateLabel: '', sites, cdus, cages,
      cageTotals: { cages: cages.length, contractedKw: cages.reduce((a, c) => a + c.contractedKw, 0), drawKw: Math.round(cages.reduce((a, c) => a + c.drawKw, 0) * 10) / 10, tenants: new Set(cages.map(c => c.tenantId)).size, revenue: cages.reduce((a, c) => a + c.revenue, 0), liquid: cages.length } };
  }
  if (!st.nodes.size) return empty;

  const nodesAll = [...st.nodes.values()].filter(n => inScope(n.dcId));
  if (!nodesAll.length) return { ...empty, kind: 'none', rateLabel: persona === 'enterprise' ? 'charge-back' : 'list price' };
  const jobById = new Map(st.jobs.map(j => [j.id, j]));
  const clusterById = new Map(st.clusters.map(c => [c.id, c]));
  const incById = new Map(db.incidents.map(i => [i.id, i]));
  const liveAlerts = db.alerts.filter(a => a.state !== 'cleared' && a.neId && st.nodes.has(a.neId));
  const alertsOn = new Map<string, number>(); liveAlerts.forEach(a => alertsOn.set(a.neId!, (alertsOn.get(a.neId!) ?? 0) + 1));

  /* fit to sell + how each node is sold (gpu-market.ts) */
  const ready = new Map(nodesAll.map(n => [n.neId, readinessOf(n, now)]));
  const market = buildMarket(db, persona, nodesAll, ready, now, dcId);
  const instByNode = new Map((market?.instances ?? []).map(i => [i.neId, i]));
  const worstOf = (n: GpuNode): Worst => (n.health === 'failed' || n.state === 'failed' ? 'bad' : n.health === 'degraded' || n.gpus.some(g => g.throttle !== 'none') || n.ib.some(p => p.state !== 'up') ? 'warn' : 'ok');
  const nodes: GpuNodeRow[] = nodesAll.map(n => {
    const j = n.jobId ? jobById.get(n.jobId) : undefined;
    const rk = dcById.get(n.dcId)?.racks.find(r => r.id === n.rackId);
    const xid = n.gpus.map(g => g.xid).filter(Boolean).sort((a, b) => b!.at - a!.at)[0] ?? undefined;
    return { ...n, cluster: clusterById.get(n.clusterId)?.name ?? '', job: j?.name, jobState: j?.state, owner: j ? cust.get(j.customerId)?.name : undefined,
      util: Math.round(n.gpus.reduce((a, g) => a + g.util, 0) / 8), maxTemp: Math.max(...n.gpus.map(g => g.tempC)), throttled: n.gpus.filter(g => g.throttle !== 'none').length, xid,
      worst: worstOf(n), alerts: alertsOn.get(n.neId) ?? 0, rackName: rk?.name ?? n.rackId, room: rk ? `${rk.floor} · ${rk.room}` : '', drift: isDrift(n), ready: ready.get(n.neId)!, instance: instByNode.get(n.neId) };
  });

  /* jobs and the GPU time they are losing */
  const jobs: GpuJobRow[] = st.jobs.filter(j => inScope(j.dcId)).map(j => {
    const c = cust.get(j.customerId);
    const slow = j.state === 'slowed' ? 1 - j.baselineMs / j.stepMs : 0;
    const perH = j.gpus * jobRate(st, j);
    const hrs = j.since ? (now - j.since) / HOUR : 0;
    const wasteRate = j.state === 'stalled' || j.state === 'idle' ? perH : j.state === 'slowed' ? perH * slow : 0;
    const redo = j.state === 'stalled' && j.since ? perH * ((j.since - j.lastCheckpoint) / HOUR) : 0;
    const atStake = j.state === 'at-risk' ? perH * (j.checkpointMin / 60) : 0;
    const inc = j.incidentId ? incById.get(j.incidentId) : undefined;
    return { ...j, owner: c?.name ?? j.customerId, premium: !!c?.premium, cluster: clusterById.get(j.clusterId)?.name ?? '', gpuModel: `${clusterById.get(j.clusterId)?.vendor ?? ''} ${gpuSpec(clusterById.get(j.clusterId)?.model ?? 'H100 SXM 80 GB').short}`.trim(), slowdownPct: Math.round(slow * 100), wasteRate: Math.round(wasteRate), wasteSoFar: Math.round(wasteRate * hrs), redo: Math.round(redo), atStake: Math.round(atStake), incidentSev: inc?.sev, incidentStatus: inc?.status };
  }).sort((a, b) => b.wasteRate - a.wasteRate || b.atStake - a.atStake || b.gpus - a.gpus);

  const clusters: GpuClusterRow[] = st.clusters.filter(c => inScope(c.dcId)).map(c => {
    const ns = c.nodes.map(id => st.nodes.get(id)!);
    const gs = ns.flatMap(n => n.gpus);
    const inJob = ns.filter(n => n.state === 'in-job');
    const cells = ns.map(n => ({ neId: n.neId, state: n.state, worst: worstOf(n), jobId: n.jobId, g: n.gpus.map(g => ({ h: g.health, u: g.util, t: g.tempC, th: g.throttle })) }));
    const worst: Worst = cells.some(x => x.worst === 'bad' && x.state !== 'failed') || jobs.some(j => j.clusterId === c.id && j.state === 'stalled') ? 'bad' : cells.some(x => x.worst !== 'ok') ? 'warn' : 'ok';
    return { ...c, gpus: ns.length * 8, inJob: inJob.length * 8, spare: ns.filter(n => n.state === 'idle').length * 8, out: ns.filter(n => n.state !== 'in-job' && n.state !== 'idle').length * 8,
      healthy: gs.filter(g => g.health === 'healthy').length, degraded: gs.filter(g => g.health === 'degraded').length, failed: gs.filter(g => g.health === 'failed').length,
      jobs: st.jobs.filter(j => j.clusterId === c.id).length, util: inJob.length ? Math.round(inJob.flatMap(n => n.gpus).reduce((a, g) => a + g.util, 0) / (inJob.length * 8)) : 0,
      powerKw: Math.round(ns.reduce((a, n) => a + n.powerKw, 0) * 10) / 10, worst, cells };
  }).sort((a, b) => ({ bad: 0, warn: 1, ok: 2 })[a.worst] - ({ bad: 0, warn: 1, ok: 2 })[b.worst] || b.gpus - a.gpus);

  const gpus = nodesAll.flatMap(n => n.gpus);
  const inJobNodes = nodesAll.filter(n => n.state === 'in-job');
  const nodeState = { 'in-job': 0, idle: 0, drained: 0, failed: 0, 'burn-in': 0 } as Record<GpuNode['state'], number>;
  nodesAll.forEach(n => { nodeState[n.state]++; });
  const xidCount = new Map<number, number>();
  gpus.forEach(g => { if (g.xid && g.xid.at > now - 24 * HOUR) xidCount.set(g.xid.code, (xidCount.get(g.xid.code) ?? 0) + 1); });
  const inService = (nodeState['in-job'] + nodeState.idle) * 8;
  const models: GpuModelRow[] = [...new Set(nodesAll.map(n => n.model))].map(m => {
    const on = nodesAll.filter(n => n.model === m), g = on.flatMap(n => n.gpus), busy = on.filter(n => n.state === 'in-job');
    return { model: m, vendor: gpuSpec(m).vendor, nodes: on.length, gpus: g.length, inJob: busy.length * 8, util: busy.length ? Math.round(busy.flatMap(n => n.gpus).reduce((a, x) => a + x.util, 0) / (busy.length * 8)) : 0,
      degraded: g.filter(x => x.health === 'degraded').length, failed: g.filter(x => x.health === 'failed').length, sites: [...new Set(on.map(n => n.dcId))], clusters: new Set(on.map(n => n.clusterId)).size, powerKw: Math.round(on.reduce((a, n) => a + n.powerKw, 0)) };
  }).sort((a, b) => b.gpus - a.gpus);

  const racks: GpuRackRow[] = [...new Set(nodesAll.map(n => n.rackId))].map(id => {
    const n0 = nodesAll.find(n => n.rackId === id)!; const rk = dcById.get(n0.dcId)!.racks.find(r => r.id === id)!;
    const on = nodesAll.filter(n => n.rackId === id);
    const pct = rk.drawKw / rk.budgetKw;
    const cdu = st.cdus.find(c => c.racks.includes(id));
    return { id, name: rk.name, dcId: rk.dcId, room: `${rk.floor} · ${rk.room}`, drawKw: rk.drawKw, budgetKw: rk.budgetKw, liquid: !!rk.liquid, nodes: on.length, maxTemp: Math.max(...on.flatMap(n => n.gpus.map(g => g.tempC))), cdu: cdu?.name, state: (pct >= 0.9 || cdu?.state === 'bad' ? 'bad' : pct >= 0.8 || cdu?.state === 'warn' ? 'warn' : 'ok') as Worst };
  }).sort((a, b) => b.drawKw / b.budgetKw - a.drawKw / a.budgetKw);

  const rails = st.clusters.filter(c => inScope(c.dcId)).map(c => ({ clusterId: c.id, cluster: c.name, dcId: c.dcId, rails: Array.from({ length: 8 }, (_, r) => {
    const ports = c.nodes.map(id => st.nodes.get(id)!).filter(n => n.state !== 'failed').map(n => n.ib[r]);
    return { rail: r, up: ports.filter(p => p.state === 'up').length, flapping: ports.filter(p => p.state === 'flapping').length, down: ports.filter(p => p.state === 'down').length, errors: ports.reduce((a, p) => a + p.errors, 0) };
  }) }));

  const sites = [...new Set([...st.nodes.values()].map(n => n.dcId))].sort().map(id => ({ id, nodes: [...st.nodes.values()].filter(n => n.dcId === id).length, cages: 0 }));
  const sum = (f: (j: GpuJobRow) => number, pred: (j: GpuJobRow) => boolean = () => true) => jobs.filter(pred).reduce((a, j) => a + f(j), 0);
  return {
    kind: 'fleet', dcId, now, rate: Math.round(rate * 100) / 100, rateLabel: persona === 'enterprise' ? 'charge-back' : 'list price', sites,
    fleet: {
      nodes: nodesAll.length, gpus: gpus.length, nodeState, gpuHealth: { healthy: gpus.filter(g => g.health === 'healthy').length, degraded: gpus.filter(g => g.health === 'degraded').length, failed: gpus.filter(g => g.health === 'failed').length },
      inJobGpus: nodeState['in-job'] * 8, spareGpus: nodeState.idle * 8, outGpus: (nodeState.drained + nodeState.failed + nodeState['burn-in']) * 8, allocatedPct: inService ? Math.round((nodeState['in-job'] * 8 / inService) * 100) : 0,
      utilInJobs: inJobNodes.length ? Math.round(inJobNodes.flatMap(n => n.gpus).reduce((a, g) => a + g.util, 0) / (inJobNodes.length * 8)) : 0,
      throttle: { thermal: gpus.filter(g => g.throttle === 'thermal').length, hw: gpus.filter(g => g.throttle === 'hw-slowdown').length, power: gpus.filter(g => g.throttle === 'power-cap').length },
      hottest: Math.max(...gpus.map(g => g.tempC)), xid: [...xidCount.entries()].map(([code, n]) => ({ code, n, text: xidText[code] ?? `Xid ${code}` })).sort((a, b) => b.n - a.n),
      sbe: gpus.reduce((a, g) => a + g.sbe, 0), dbe: gpus.reduce((a, g) => a + g.dbe, 0), remapPending: gpus.filter(g => g.remapPending).length,
      driftNodes: nodesAll.filter(n => isDrift(n)).length, driverStd: st.driverStd, rmaOpen: nodesAll.filter(n => n.rma).length, burnIn: nodeState['burn-in'],
      liquidNodes: nodesAll.filter(n => n.cooling === 'liquid').length, powerKw: Math.round(nodesAll.reduce((a, n) => a + n.powerKw, 0)), models
    },
    jobsSummary: { running: jobs.filter(j => j.state === 'running').length, slowed: jobs.filter(j => j.state === 'slowed').length, stalled: jobs.filter(j => j.state === 'stalled').length, atRisk: jobs.filter(j => j.state === 'at-risk').length, idle: jobs.filter(j => j.state === 'idle').length, total: jobs.length, gpus: sum(j => j.gpus) },
    waste: { rate: sum(j => j.wasteRate), stalled: sum(j => j.wasteRate, j => j.state === 'stalled'), slowed: sum(j => j.wasteRate, j => j.state === 'slowed'), idle: sum(j => j.wasteRate, j => j.state === 'idle'), soFar: sum(j => j.wasteSoFar + j.redo), redo: sum(j => j.redo), atStake: sum(j => j.atStake) },
    jobs, clusters, nodes, cdus, racks, rails, cages: [], cageTotals: empty.cageTotals, telemetry: buildTelemetry(nodesAll, jobById, now), market
  };
}

export const DCGM_FIELDS: { field: string; what: string }[] = [
  { field: 'DCGM_FI_DEV_GPU_UTIL', what: 'GPU utilisation %' }, { field: 'DCGM_FI_PROF_SM_ACTIVE', what: 'Streaming-multiprocessor active %' }, { field: 'DCGM_FI_PROF_SM_OCCUPANCY', what: 'Warps resident per SM %' },
  { field: 'DCGM_FI_PROF_PIPE_TENSOR_ACTIVE', what: 'Tensor-core pipe active %' }, { field: 'DCGM_FI_DEV_MEM_COPY_UTIL', what: 'Memory copy engine %' }, { field: 'DCGM_FI_PROF_DRAM_ACTIVE', what: 'HBM bandwidth active %' },
  { field: 'DCGM_FI_DEV_FB_USED / FB_TOTAL', what: 'Framebuffer memory used / total' }, { field: 'DCGM_FI_DEV_GPU_TEMP / MEMORY_TEMP', what: 'GPU and HBM temperature °C' }, { field: 'DCGM_FI_DEV_POWER_USAGE', what: 'Board power W' },
  { field: 'DCGM_FI_DEV_TOTAL_ENERGY_CONSUMPTION', what: 'Energy since boot (shown per 24 h)' }, { field: 'DCGM_FI_DEV_SM_CLOCK / MEM_CLOCK', what: 'SM and memory clock MHz' }, { field: 'DCGM_FI_DEV_PSTATE', what: 'Performance state (P0 busy … P8 idle)' },
  { field: 'DCGM_FI_DEV_FAN_SPEED', what: 'Fan %' }, { field: 'DCGM_FI_DEV_CLOCK_THROTTLE_REASONS', what: 'Why clocks are reduced (thermal, power cap, HW slowdown)' }, { field: 'DCGM_FI_DEV_ECC_SBE_VOL_TOTAL / DBE', what: 'Correctable / uncorrectable ECC errors' },
  { field: 'DCGM_FI_DEV_RETIRED_PAGES · ROW_REMAP_PENDING', what: 'Memory pages retired, remap waiting for a reset' }, { field: 'DCGM_FI_DEV_PCIE_REPLAY_COUNTER', what: 'PCIe link retries' }, { field: 'DCGM_FI_PROF_PCIE_RX_BYTES / TX_BYTES', what: 'PCIe traffic GB/s' },
  { field: 'DCGM_FI_DEV_NVLINK_*_ERROR_COUNT_TOTAL', what: 'NVLink CRC / replay errors' }, { field: 'DCGM_FI_PROF_NVLINK_RX_BYTES / TX_BYTES', what: 'NVLink traffic GB/s' }, { field: 'DCGM_FI_DEV_XID_ERRORS', what: 'Last Xid (driver error code)' }
];

function buildTelemetry(nodes: GpuNode[], jobById: Map<string, GpuJob>, now: number): GpuTelemetry {
  const gpus = nodes.flatMap(n => n.gpus.map(g => ({ g, n })));
  const bucket = (v: number, edges: number[]) => edges.findIndex((e, i) => v < e || i === edges.length - 1);
  const uEdges = [10, 30, 50, 70, 90, 101], uLabels = ['0–10%', '10–30%', '30–50%', '50–70%', '70–90%', '90–100%'];
  const tEdges = [40, 60, 70, 80, 85, 200], tLabels = ['< 40°C', '40–60°C', '60–70°C', '70–80°C', '80–85°C', '≥ 85°C'];
  const utilHist = uLabels.map(label => ({ label, n: 0 })), tempHist = tLabels.map(label => ({ label, n: 0 }));
  gpus.forEach(({ g }) => { utilHist[bucket(g.util, uEdges)].n++; tempHist[bucket(g.tempC, tEdges)].n++; });
  const h24 = Array.from({ length: 24 }, (_, h) => h);
  const series = {
    util: h24.map(h => nodes.length ? Math.round(nodes.reduce((a, n) => a + (n.series.util[h] ?? 0), 0) / nodes.length) : 0),
    power: h24.map(h => Math.round(nodes.reduce((a, n) => a + (n.series.powerKw[h] ?? 0), 0))),
    hottest: h24.map(h => nodes.length ? Math.max(...nodes.map(n => n.series.tempC[h] ?? 0)) : 0)
  };
  const inJob = gpus.filter(x => x.n.state === 'in-job');
  const xid24 = h24.map(() => 0);
  gpus.forEach(({ g }) => { if (g.xid && g.xid.at > now - 24 * 3600000) xid24[Math.min(23, Math.max(0, 23 - Math.floor((now - g.xid.at) / 3600000)))]++; });
  const lead = (f: (g: Gpu) => number, unit: string, pred: (g: Gpu) => boolean = g => f(g) > 0, asc = false): Leader[] =>
    gpus.filter(x => pred(x.g)).sort((a, b) => (asc ? f(a.g) - f(b.g) : f(b.g) - f(a.g))).slice(0, 5).map(({ g, n }) => ({ neId: n.neId, dcId: n.dcId, gpu: g.idx, value: f(g), unit, job: n.jobId ? jobById.get(n.jobId)?.name : undefined }));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    utilHist, tempHist, series,
    energyMwh24: Math.round(gpus.reduce((a, x) => a + x.g.energyKwh24, 0) / 100) / 10, powerKwNow: Math.round(nodes.reduce((a, n) => a + n.powerKw, 0)),
    avgPowerW: Math.round(avg(gpus.map(x => x.g.powerW))), avgTdpPct: Math.round(avg(gpus.map(x => (x.g.powerW / x.g.tdpW) * 100))),
    pstate: { P0: gpus.filter(x => x.g.pstate === 'P0').length, P8: gpus.filter(x => x.g.pstate === 'P8').length, other: gpus.filter(x => x.g.pstate === 'P2').length },
    fanAvg: Math.round(avg(gpus.filter(x => x.n.cooling === 'air').map(x => x.g.fanPct))),
    tensorAvg: Math.round(avg(inJob.map(x => x.g.tensorActive))), smAvg: Math.round(avg(inJob.map(x => x.g.smActive))),
    xid24,
    ecc: { sbe: gpus.reduce((a, x) => a + x.g.sbe, 0), dbe: gpus.reduce((a, x) => a + x.g.dbe, 0), retired: gpus.reduce((a, x) => a + x.g.retiredPages, 0), remap: gpus.filter(x => x.g.remapPending).length },
    leaders: { hottest: lead(g => g.tempC, '°C'), pcie: lead(g => g.pcieReplay, 'replays'), nvlink: lead(g => g.nvlinkErr, 'errors'), sbe: lead(g => g.sbe, 'SBE'), idle: gpus.filter(x => x.n.state === 'in-job' && x.g.util < 5).slice(0, 5).map(({ g, n }) => ({ neId: n.neId, dcId: n.dcId, gpu: g.idx, value: g.util, unit: '%', job: n.jobId ? jobById.get(n.jobId)?.name : undefined })) },
    fields: DCGM_FIELDS
  };
}
