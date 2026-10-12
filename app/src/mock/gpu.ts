/* AI & GPU layer of the mock estate.

   Cloud, enterprise and NeoCloud estates run GPU nodes, 8 accelerators each, one model per pod: NVIDIA B200 / H200 /
   H100 / A100 for training, L40S / T4 for inference, and Intel Gaudi 3 / Data Center GPU Max (lib/gpuSpec.ts, SITE_PLAN below). This module adds what an AI
   operations team actually watches, on top of the generic host record:
     - per-GPU telemetry (DCGM-style): utilisation, HBM, temperature, power vs TDP, clocks, throttle
       reason, ECC (correctable / uncorrectable), row-remap state, NVLink errors, last Xid;
     - clusters (pods of up to 32 nodes) on a rail-optimised InfiniBand fabric, and the JOBS on them:
       one bad GPU in a 64-node training job stalls all 512 GPUs, so impact is counted per job;
     - liquid cooling (CDU loops) on the newest GPU halls;
     - colocation: tenant AI cages — tenant-owned GPUs, so the operator sees power, coolant and inlet only.
   Telco estates host no GPU fleet. Everything is seeded per entity (no shared random stream), so the
   rest of the estate is generated exactly as before.

   Phases, called from generate():
     A  buildGpuFleet      before services: fleet, clusters, jobs, CDUs, AI cages (colo racks)
     A2 addGpuServices     cloud: each job is a 'GPU cluster' service sold per GPU
     B  injectGpuFaults    after alerts/scenarios: Xid 79, ECC, NVLink, CDU flow, InfiniBand, power cap
     C  addGpuChange / buildGpuIncidents  after changes / incidents */

import type { AiCage, Cdu, CoolingUnit, Customer, Datacenter, Gpu, GpuCluster, GpuJob, GpuModel, GpuNode, Incident, NetworkElement, Persona, Service } from '../api/types';
import { mulberry32, seedOf, pick, intBetween, between, chance, type Rnd } from '../lib/rng';
import { PERSONA_BY_ID } from './personas';
import { DAY, HOUR, MIN, NOW } from './seed';
import { dcAt, money } from './geo';
import { fmtMoney } from '../lib/format';
import { gpuSpec } from '../lib/gpuSpec';

export interface GpuState { nodes: Map<string, GpuNode>; clusters: GpuCluster[]; jobs: GpuJob[]; cdus: Cdu[]; cages: AiCage[]; ratePerGpuHour: number; driverStd: string }
/* the parts of Db this module touches (kept structural to avoid an import cycle with generate.ts) */
interface DbLike {
  now: number; datacenters: Datacenter[]; nes: NetworkElement[]; neById: Map<string, NetworkElement>; services: Service[]; customers: Customer[];
  alerts: { id: string; code: string; neId?: string; dcId: string; rackId?: string; title: string; severity: string; state: string; incidentId?: string; start: number }[];
  incidents: Incident[]; changes: { id: string; dcId: string; title: string }[]; seq: { inc: number; chg: number };
  gpu?: GpuState;
}

export const GPU_RATE = { cloud: 175000, enterprise: 85000, neocloud: 150000 } as const;  // ₹ per GPU per month (cloud list price · enterprise chargeback · neocloud reserved rate)
export const LIQUID_SITES = () => [dcAt(22), dcAt(20), dcAt(23)];                       // newest halls: H200, direct-to-chip liquid cooling
const DRIFT_SITES = () => [dcAt(10), dcAt(11), dcAt(21)];                         // still on the previous driver branch
const DRIVER_STD = '550.127.05', DRIVER_OLD = '535.183.01';
/* which accelerator each pod runs, by site position (pod k takes entry k, the last entry repeats). The newest, liquid halls
   run H200 and B200; fault stories (Xid, ECC, NVLink) sit on NVIDIA training pods; T4 / L40S pods serve inference only. */
const B200: GpuModel = 'B200 SXM 192 GB', H200: GpuModel = 'H200 SXM 141 GB', H100: GpuModel = 'H100 SXM 80 GB', A100: GpuModel = 'A100 SXM 80 GB',
  L40S: GpuModel = 'L40S PCIe 48 GB', T4: GpuModel = 'T4 PCIe 16 GB', GAUDI3: GpuModel = 'Gaudi 3 OAM 128 GB', MAX: GpuModel = 'Max 1550 OAM 128 GB';
const SITE_PLAN: Record<number, GpuModel[]> = {
  1: [H100, H100, A100, L40S], 2: [H100, A100, L40S], 3: [H100, GAUDI3, A100], 4: [A100, L40S], 5: [H100, A100, GAUDI3, T4], 6: [GAUDI3, GAUDI3, H100],
  7: [A100, T4, L40S], 8: [H100, A100, L40S, T4], 9: [H100, H100, A100, L40S, T4], 10: [A100, L40S], 11: [H100, MAX, A100, L40S], 12: [T4, L40S],
  14: [GAUDI3, H100, L40S], 15: [L40S, A100], 16: [L40S, H100, H100, T4], 17: [A100, MAX, T4], 18: [T4, L40S], 19: [MAX, A100],
  20: [H200, H200, H200, B200, B200], 21: [H100, A100, GAUDI3, L40S], 22: [H200, H200, B200, B200, H200], 23: [H200, B200, H200, B200], 24: [H100, L40S]
};
const planFor = (dcId: string, liquid: boolean): GpuModel[] => {
  for (let i = 1; i <= 24; i++) if (dcAt(i) === dcId) return SITE_PLAN[i] ?? [liquid ? H200 : H100];
  return [liquid ? H200 : H100];
};
/* a node runs the previous driver branch only where its model has one (NVIDIA) */
export const isDrift = (n: Pick<GpuNode, 'driver' | 'model'>) => !!gpuSpec(n.model).driverOld && n.driver === gpuSpec(n.model).driverOld;
/* price of one GPU-hour of this job: the persona's H100 rate scaled to the model's list price */
export const jobRate = (st: GpuState, j: Pick<GpuJob, 'clusterId'>) => st.ratePerGpuHour * gpuSpec(st.clusters.find(c => c.id === j.clusterId)?.model ?? H100).rateX;
const r0 = (n: number) => Math.round(n), r1 = (n: number) => Math.round(n * 10) / 10;
const rngOf = (id: string, salt: number): Rnd => mulberry32(seedOf(id) ^ salt);
const short = (id: string) => id.replace(/^[A-Z]{2}-DC-\d{3}-/, '');

/* ------------------------------------------------------------------ phase A */

export function buildGpuFleet(persona: Persona, datacenters: Datacenter[], nes: NetworkElement[], customers: Customer[]): GpuState {
  const state: GpuState = { nodes: new Map(), clusters: [], jobs: [], cdus: [], cages: [], ratePerGpuHour: money(persona === 'enterprise' ? GPU_RATE.enterprise : persona === 'neocloud' ? GPU_RATE.neocloud : GPU_RATE.cloud) / 730, driverStd: DRIVER_STD };
  if (persona === 'colocation') { buildCages(state, datacenters, customers); return state; }
  if (persona !== 'cloud' && persona !== 'enterprise' && persona !== 'neocloud') return state;

  let jobSeq = 4100;
  for (const dc of datacenters) {
    if (dc.status === 'planned') continue;
    const gpuNes = nes.filter(n => n.dcId === dc.id && n.role === 'GPU' && n.discovery !== 'not-discovered').sort((a, b) => a.id.localeCompare(b.id));
    if (!gpuNes.length) continue;
    const liquid = LIQUID_SITES().includes(dc.id);
    const plan0 = planFor(dc.id, liquid);
    /* GPU racks in liquid halls are high-density, direct-to-chip cooled */
    const gpuRacks = [...new Set(gpuNes.map(n => n.rackId))];
    gpuRacks.forEach(id => { const rk = dc.racks.find(r => r.id === id); if (rk) { rk.density = 'ai'; rk.liquid = liquid; } });

    /* pods of up to 32 nodes */
    for (let k = 0; k * 32 < gpuNes.length; k++) {
      const members = gpuNes.slice(k * 32, (k + 1) * 32);
      const firstRack = dc.racks.find(r => r.id === members[0].rackId);
      const model = plan0[Math.min(k, plan0.length - 1)], spec = gpuSpec(model);
      const cl: GpuCluster = { id: `${dc.id}-POD-${k + 1}`, name: `AI-POD-${k + 1}`, dcId: dc.id, room: firstRack ? `${firstRack.floor} · ${firstRack.room}` : '', scheduler: persona === 'cloud' ? 'Kubernetes' : 'Slurm',
        fabric: `${spec.fabric} · ${members.length} nodes`, model, vendor: spec.vendor, cooling: liquid ? 'liquid' : 'air', nodes: members.map(n => n.id) };
      if (persona === 'neocloud') cl.scheduler = 'Kubernetes';
      state.clusters.push(cl);

      /* node availability: unreachable hosts have failed; a few are drained, in RMA or in burn-in */
      const avail: NetworkElement[] = [];
      for (const n of members) {
        const rr = rngOf(n.id, 0x6a1);
        /* the host record takes the pod's server model, keeping its OEM (an Intel baseboard replaces a DGX) */
        const oem = spec.servers[n.vendor] ? n.vendor : 'SUPERMICRO';
        n.vendor = oem === 'NVIDIA' && spec.vendor === 'Intel' ? 'INTEL' : oem; n.model = spec.servers[oem]; n.os = oem === 'NVIDIA' && spec.vendor === 'NVIDIA' ? spec.os : spec.os === 'DGX OS 6' || spec.os === 'DGX OS 7' ? 'Ubuntu 22.04' : spec.os;
        const old = DRIFT_SITES().includes(dc.id) && chance(rr, 0.7);
        const node: GpuNode = { neId: n.id, dcId: dc.id, rackId: n.rackId, clusterId: cl.id, model, vendor: spec.vendor, server: `${n.vendor === 'INTEL' ? 'Intel' : n.vendor === 'SUPERMICRO' ? 'Supermicro' : n.vendor === 'DELL' ? 'Dell' : 'NVIDIA'} ${n.model}`, gpus: [], state: 'idle', cooling: liquid ? 'liquid' : 'air', driver: old && spec.driverOld ? spec.driverOld : spec.driver,
          firmware: spec.firmware, powerKw: 0, health: 'healthy', ib: Array.from({ length: 8 }, (_, i) => ({ rail: i, state: 'up' as const, errors: intBetween(rr, 0, 12) })), series: { util: [], tempC: [], powerKw: [] } };
        const roll = rr();
        if (n.icmp.state === 'critical') { node.state = 'failed'; node.health = 'failed'; node.note = 'Host not responding — out of the scheduler'; }
        else if (roll < 0.012) { node.state = 'failed'; node.health = 'failed'; node.rma = `RMA-${String(seedOf(n.id) % 9000 + 1000)}`; node.note = `GPU${intBetween(rr, 0, 7)} replaced under ${node.rma}; awaiting part`; }
        else if (roll < 0.035) { node.state = 'drained'; node.note = 'Cordoned for firmware update'; }
        else if (roll < 0.05) { node.state = 'burn-in'; node.note = 'Returned from repair — 24 h burn-in'; }
        else avail.push(n);
        state.nodes.set(n.id, node);
      }

      /* jobs: a large training run, a few fine-tunes, inference; ~10% kept as hot spares */
      const rj = rngOf(cl.id, 0x10b);
      const pool = [...avail];
      const take = (k2: number) => pool.splice(0, Math.min(k2, pool.length));
      const spare = Math.max(1, Math.round(avail.length * 0.1));
      const plan: GpuJob['kind'][] = [];
      if (avail.length >= 6) plan.push('training');
      while (plan.length < 8) plan.push(plan.length % 3 === 1 ? 'inference' : 'fine-tuning');
      if (spec.use === 'inference') plan.forEach((_, i) => { plan[i] = 'inference'; });
      const owners = ownerPool(customers, cl.id);
      for (const kind of plan) {
        const room = pool.length - spare; if (room <= 0) break;
        const n = kind === 'training' ? Math.max(2, Math.floor(avail.length * 0.6)) : kind === 'fine-tuning' ? intBetween(rj, 2, 4) : intBetween(rj, 1, 2);
        const nodes = take(Math.min(n, room));
        if (!nodes.length) break;
        const owner = kind === 'training' ? owners.premium[jobSeq % owners.premium.length] : owners.all[jobSeq % owners.all.length];
        const baseline = kind === 'training' ? intBetween(rj, 850, 2400) : kind === 'fine-tuning' ? intBetween(rj, 300, 900) : intBetween(rj, 40, 120);
        const cp = kind === 'inference' ? 0 : kind === 'training' ? 60 : 30;
        const job: GpuJob = {
          id: `JOB-${++jobSeq}`, name: jobName(persona, kind, owner, rj), kind, clusterId: cl.id, dcId: dc.id, customerId: owner.id, nodes: nodes.map(x => x.id), gpus: nodes.length * 8, state: 'running',
          started: NOW - intBetween(rj, kind === 'training' ? 2 * 24 : 3, kind === 'training' ? 19 * 24 : 6 * 24) * HOUR, lastCheckpoint: cp ? NOW - intBetween(rj, 4, cp - 2) * MIN : 0, checkpointMin: cp,
          stepMs: baseline, baselineMs: baseline, mfu: kind === 'inference' ? 0 : r1(between(rj, 38, 52))
        };
        state.jobs.push(job);
        nodes.forEach(x => { const nd = state.nodes.get(x.id)!; nd.state = 'in-job'; nd.jobId = job.id; });
      }
    }

    /* liquid halls: one CDU loop per three GPU racks */
    if (liquid) {
      const rooms = [...new Set(gpuRacks.map(id => dc.racks.find(r => r.id === id)!).map(r => `${r.floor} · ${r.room}`))];
      let cduN = 0;
      for (const room of rooms) {
        const racks = gpuRacks.filter(id => { const r = dc.racks.find(x => x.id === id)!; return `${r.floor} · ${r.room}` === room; });
        const loops = Math.max(2, Math.ceil(racks.length / 3));
        for (let i = 0; i < loops; i++) {
          const served = racks.filter((_, j) => j % loops === i);
          if (!served.length) continue;
          addCdu(state, dc, `CDU-${++cduN}`, room, served);
        }
      }
    }
  }

  /* per-GPU telemetry from what each node is doing */
  const neById = new Map(nes.map(n => [n.id, n]));
  for (const node of state.nodes.values()) {
    const ne = neById.get(node.neId)!;
    const job = node.jobId ? state.jobs.find(j => j.id === node.jobId) : undefined;
    node.gpus = Array.from({ length: 8 }, (_, i) => gpuTelemetry(node, i, job, ne));
    if (node.state === 'failed' && !node.rma) node.gpus.forEach(g => { g.util = 0; g.powerW = 0; g.memUsedGb = 0; });
    if (node.rma && node.vendor !== 'NVIDIA') node.note = node.note!.replace(/^GPU(\d)/, 'Card $1');
    if (node.rma) { const bad = node.gpus[Number(node.note!.match(/(?:GPU|Card )(\d)/)![1])]; bad.health = 'failed'; bad.util = 0; bad.powerW = 0; bad.memUsedGb = 0; const at = NOW - intBetween(rngOf(node.neId, 0x51), 30, 120) * HOUR; bad.xid = node.vendor === 'NVIDIA' ? { code: 79, at, text: 'GPU has fallen off the bus' } : null; node.health = 'failed'; }
    syncNode(node, ne);
  }
  return state;
}

function gpuTelemetry(node: GpuNode, i: number, job: GpuJob | undefined, ne: NetworkElement): Gpu {
  const rr = rngOf(`${node.neId}#${i}`, 0x9b);
  const spec = gpuSpec(node.model), memGb = spec.memGb, tdp = spec.tdpW;
  const busy = node.state === 'in-job' || node.state === 'burn-in';
  const util = !busy ? intBetween(rr, 0, 2) : job?.kind === 'inference' ? intBetween(rr, 48, 82) : node.state === 'burn-in' ? 100 : intBetween(rr, 88, 99);
  const air = node.cooling === 'air';
  const tempC = busy ? (air ? intBetween(rr, 62, 76) : intBetween(rr, 46, 61)) : (air ? intBetween(rr, 33, 40) : intBetween(rr, 28, 34));
  const g: Gpu = {
    idx: i, serial: `${ne.serial}-G${i}`, util, memGb, memUsedGb: busy ? r0(memGb * between(rr, job?.kind === 'inference' ? 0.55 : 0.8, 0.96)) : 0,
    tempC, hbmC: tempC + intBetween(rr, 4, 9), powerW: busy ? r0(tdp * (0.25 + 0.72 * util / 100) * between(rr, 0.96, 1.0)) : intBetween(rr, spec.idleW[0], spec.idleW[1]), tdpW: tdp,
    clockMhz: busy ? intBetween(rr, spec.clock[0], spec.clock[1]) : 345, throttle: 'none', sbe: chance(rr, 0.12) ? intBetween(rr, 1, 24) : 0, dbe: 0, remapPending: false, nvlinkErr: chance(rr, 0.05) ? intBetween(rr, 1, 9) : 0, xid: null, health: 'healthy',
    smActive: 0, smOccupancy: 0, tensorActive: 0, memCopyUtil: 0, dramActive: 0, energyKwh24: 0, memClockMhz: 0, pstate: 'P8', fanPct: 0, retiredPages: 0, pcieReplay: 0, pcieRxGbs: 0, pcieTxGbs: 0, nvlinkRxGbs: 0, nvlinkTxGbs: 0
  };
  /* the profiling counters DCGM adds on top: how much of the busy time is real work */
  const training = job?.kind !== 'inference';
  g.smActive = busy ? r0(util * between(rr, 0.82, 0.97)) : 0;
  g.smOccupancy = busy ? r0(g.smActive * between(rr, 0.55, 0.8)) : 0;
  g.tensorActive = busy ? r0(g.smActive * (training ? between(rr, 0.55, 0.75) : between(rr, 0.25, 0.45))) : 0;
  g.memCopyUtil = busy ? intBetween(rr, training ? 35 : 15, training ? 70 : 40) : 0;
  g.dramActive = busy ? intBetween(rr, 30, 65) : 0;
  g.memClockMhz = busy ? spec.memClockMhz : spec.memIdleMhz;
  g.pstate = busy ? 'P0' : 'P8';
  g.fanPct = node.cooling === 'air' ? (busy ? intBetween(rr, 48, 82) : intBetween(rr, 28, 36)) : 0;
  g.retiredPages = chance(rr, 0.04) ? intBetween(rr, 1, 3) : 0;
  g.pcieReplay = chance(rr, 0.03) ? intBetween(rr, 1, 40) : 0;
  g.pcieRxGbs = busy ? r1(between(rr, training ? 4 : 8, training ? 12 : 22)) : r1(between(rr, 0, 0.3));
  g.pcieTxGbs = busy ? r1(between(rr, 1, training ? 6 : 12)) : r1(between(rr, 0, 0.2));
  g.nvlinkRxGbs = busy && training ? r0(between(rr, 140, 260)) : busy ? r0(between(rr, 5, 40)) : 0;
  g.nvlinkTxGbs = busy && training ? r0(g.nvlinkRxGbs * between(rr, 0.85, 1.1)) : busy ? r0(between(rr, 5, 40)) : 0;
  g.energyKwh24 = r1((g.powerW * 24) / 1000 * between(rr, 0.9, 1.0));
  if (!spec.link) { g.nvlinkErr = 0; g.nvlinkRxGbs = 0; g.nvlinkTxGbs = 0; }   // PCIe cards: no scale-up link
  return g;
}

/* keep the host record (modules, temperature, health) consistent with the GPU layer */
function syncNode(node: GpuNode, ne: NetworkElement) {
  node.powerKw = r1(2.1 + node.gpus.reduce((a, g) => a + g.powerW, 0) / 1000);
  const worst = node.gpus.some(g => g.health === 'failed') ? 'failed' : node.gpus.some(g => g.health === 'degraded') ? 'degraded' : 'healthy';
  if (node.health !== 'failed' || worst === 'failed') node.health = node.state === 'failed' ? 'failed' : worst;
  ne.modules = ne.modules.map(m => {
    const k = /^GPU(\d)$/.exec(m.slot); if (!k) return m;
    const g = node.gpus[Number(k[1])];
    return { ...m, name: node.model, tempC: g.tempC, state: g.health === 'failed' ? 'Fault' : 'OK' };
  });
  ne.tempC = Math.max(ne.tempC, Math.round(Math.max(...node.gpus.map(g => g.tempC)) - 30));
}

function addCdu(state: GpuState, dc: Datacenter, name: string, room: string, racks: string[]) {
  const rr = rngOf(`${dc.id}-${name}`, 0xcd);
  const load = racks.reduce((a, id) => a + (dc.racks.find(r => r.id === id)?.drawKw ?? 0), 0);
  const cap = Math.max(120, Math.ceil((load * 1.6) / 50) * 50);
  const nominal = Math.round(cap * 1.45 / 10) * 10;
  const cdu: Cdu = { id: `${dc.id}-${name}`, dcId: dc.id, name, room, racks, capacityKw: cap, loadKw: r1(load), supplyC: r1(between(rr, 24.5, 27)), returnC: 0, flowLpm: r0(nominal * between(rr, 0.92, 1.0)), flowNominal: nominal, pump: chance(rr, 0.5) ? 'A' : 'B', state: 'ok' };
  cdu.returnC = r1(cdu.supplyC + 6 + (load / cap) * 5);
  state.cdus.push(cdu);
  const unit: CoolingUnit = { id: cdu.id, name, type: 'CDU', zone: room, capacityKw: cap, loadPct: Math.round((load / cap) * 100), supplyC: cdu.supplyC, returnC: cdu.returnC, status: 'Operational' };
  dc.cooling.units.push(unit);
}

/* colocation: a few cabinets of AI-heavy tenants become liquid-cooled AI cages */
function buildCages(state: GpuState, datacenters: Datacenter[], customers: Customer[]) {
  const aiTenant = (id?: string) => { const c = customers.find(x => x.id === id); return !!c && /Hyperscaler|SaaS|Media|Enterprise/.test(c.segment); };
  for (const dcId of [dcAt(20), dcAt(22), dcAt(23), dcAt(2)]) {
    const dc = datacenters.find(d => d.id === dcId); if (!dc) continue;
    const rr = rngOf(dcId, 0xa1c);
    const tenantRacks = dc.racks.filter(r => r.owner === 'tenant' && r.tenantId);
    const picks = [...tenantRacks.filter(r => aiTenant(r.tenantId)), ...tenantRacks.filter(r => !aiTenant(r.tenantId))].slice(0, 3);
    if (!picks.length) continue;
    picks.forEach((rk, i) => {
      const kw = pick(rr, [40, 48, 60] as const);
      rk.role = 'AI cage'; rk.density = 'ai'; rk.liquid = true; rk.budgetKw = kw; rk.contractedKw = kw;
      rk.drawKw = r1(kw * (dcId === dcAt(20) && i === 0 ? 0.96 : between(rr, 0.62, 0.86)));
      rk.tempC = r1(between(rr, 22, 25));
    });
    const room = `${picks[0].floor} · ${picks[0].room}`;
    addCdu(state, dc, 'CDU-1', room, picks.map(r => r.id));
    const cdu = state.cdus[state.cdus.length - 1];
    picks.forEach(rk => state.cages.push({ rackId: rk.id, dcId, name: rk.name, room: `${rk.floor} · ${rk.room}`, tenantId: rk.tenantId!, contractedKw: rk.contractedKw!, drawKw: rk.drawKw, cduId: cdu.id, inletC: rk.tempC, state: rk.drawKw / rk.contractedKw! >= 0.9 ? 'warn' : 'ok', note: rk.drawKw / rk.contractedKw! >= 0.9 ? `Drawing ${Math.round((rk.drawKw / rk.contractedKw!) * 100)}% of the contracted power` : undefined }));
  }
}

function ownerPool(customers: Customer[], seed: string) {
  const all = [...customers].sort((a, b) => (seedOf(a.id + seed) % 97) - (seedOf(b.id + seed) % 97));
  const premium = all.filter(c => c.premium);
  return { all, premium: premium.length ? premium : all };
}
function jobName(persona: Persona, kind: GpuJob['kind'], owner: Customer, rr: Rnd) {
  const slug = owner.name.toLowerCase().replace(/&/g, '').split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
  if (persona === 'enterprise') {
    const T = { training: ['fraud-model-train', 'credit-risk-train', 'demand-forecast-train', 'aml-graph-train'], 'fine-tuning': ['kyc-doc-llm-ft', 'service-copilot-ft', 'policy-qa-ft'], inference: ['customer-assistant-llm', 'doc-ocr-serve', 'aml-scoring', 'voice-bot-asr'] } as const;
    return `${slug}-${pick(rr, T[kind])}`;
  }
  const T = { training: ['llm-pretrain-70b', 'llm-pretrain-34b', 'diffusion-train', 'recsys-train'], 'fine-tuning': ['llama3-8b-ft', 'mistral-7b-ft', 'vit-finetune', 'whisper-ft'], inference: ['chat-serve', 'rag-serve', 'embed-serve', 'vision-serve'] } as const;
  return `${slug}-${pick(rr, T[kind])}`;
}

/* ----------------------------------------------------------------- phase A2 */

/* each job is a service riding every node of the job, sized in GPUs:
   cloud — a 'GPU cluster' an account buys at list price; enterprise — an 'AI platform' charge-back to the business unit */
export function addGpuServices(persona: Persona, state: GpuState, services: Service[], customers: Customer[], nextSeq: () => number) {
  if (persona !== 'cloud' && persona !== 'enterprise' && persona !== 'neocloud') return;
  const cloud = persona === 'cloud', neo = persona === 'neocloud';
  const def = PERSONA_BY_ID[persona];
  for (const job of state.jobs) {
    const cust = customers.find(c => c.id === job.customerId)!;
    const rr = rngOf(job.id, 0x5e);
    const sla = cust.premium ? def.sla.premium : def.sla.standard;
    const s: Service = {
      id: `SVC-${neo ? (job.kind === 'training' ? 'RC' : 'OD') : cloud ? 'GP' : 'AI'}-${nextSeq()}`, type: neo ? (job.kind === 'training' ? 'Reserved cluster' : 'On-demand GPUs') : cloud ? 'GPU cluster' : 'AI platform', customerId: cust.id, dcId: job.dcId, neId: job.nodes[0], ifName: `${job.nodes.length}-node ${job.kind} job`, path: [...job.nodes], linkIds: [],
      bandwidthMbps: 400000, utilPct: r1(between(rr, 70, 89)), status: 'Active', slaTarget: sla,
      uptime30d: Math.round(Math.min(99.999, chance(rr, 0.1) ? sla - between(rr, 0.02, 0.3) : sla + between(rr, 0.001, (100 - sla) * 0.9)) * 100) / 100, growthPct: r1(between(rr, 2, 9)),
      revenueMonthly: Math.round(job.gpus * money(GPU_RATE[neo ? 'neocloud' : cloud ? 'cloud' : 'enterprise']) * gpuSpec(state.clusters.find(c => c.id === job.clusterId)!.model).rateX), critical: cust.premium, qty: job.gpus, unit: 'GPU'
    };
    services.push(s); job.serviceId = s.id;
  }
  for (const c of customers) c.revenueMonthly = services.filter(s => s.customerId === c.id).reduce((a, s) => a + s.revenueMonthly, 0);
}

/* ------------------------------------------------------------------ phase B */

type AddAlert = (a: { neId?: string; dcId: string; rackId?: string; severity: 'critical' | 'major' | 'minor' | 'warning'; title: string; description: string; source: 'Environment' | 'Interface' | 'Power' | 'Cooling'; type: string; start: number; state: 'active'; fault?: { id: string; where: string } }) => { id: string };

export function injectGpuFaults(db: DbLike, persona: Persona, addAlert: AddAlert) {
  const st = db.gpu; if (!st) return;
  const now = db.now;
  const nvidia = (j: GpuJob) => st.clusters.find(c => c.id === j.clusterId)?.vendor === 'NVIDIA';
  const job = (dcId: string, kind: GpuJob['kind'] = 'training') => st.jobs.filter(j => j.dcId === dcId && j.kind === kind && j.nodes.length >= 2 && nvidia(j)).sort((a, b) => b.gpus - a.gpus)[0];
  const svcOf = (j: GpuJob) => db.services.filter(s => s.status !== 'Disabled' && j.nodes.some(n => s.neId === n || s.path.includes(n)));
  const resync = (id: string) => syncNode(st.nodes.get(id)!, db.neById.get(id)!);

  if (persona === 'colocation') {
    /* the cage loop in Chennai has lost flow — tenant inlets are warming */
    const cdu = st.cdus.find(c => c.dcId === dcAt(22));
    if (cdu) {
      cdu.flowLpm = r0(cdu.flowNominal * 0.71); cdu.supplyC = 31.8; cdu.returnC = 41.6; cdu.state = 'warn'; cdu.pump = 'B'; cdu.note = 'Pump A tripped; standby pump B running at reduced flow';
      const u = db.datacenters.find(d => d.id === cdu.dcId)!.cooling.units.find(x => x.id === cdu.id)!; u.supplyC = cdu.supplyC; u.returnC = cdu.returnC; u.status = 'Maintenance';
      st.cages.filter(c => c.cduId === cdu.id).forEach(c => { c.inletC = 28.4; c.state = 'warn'; c.note = 'Coolant supply 31.8°C — tenant GPUs will throttle above 32°C'; const rk = db.datacenters.find(d => d.id === c.dcId)!.racks.find(r => r.id === c.rackId)!; rk.tempC = 28.4; });
      addAlert({ dcId: cdu.dcId, severity: 'major', title: 'CDU Flow Low', description: `${cdu.name} (${cdu.room}): flow ${cdu.flowLpm} of ${cdu.flowNominal} L/min, supply ${cdu.supplyC}°C — pump A tripped, standby pump B at reduced flow`, source: 'Cooling', type: 'Cooling', start: now - 72 * MIN, state: 'active' });
    }
    return;
  }
  if (persona !== 'cloud' && persona !== 'enterprise' && persona !== 'neocloud') return;

  /* F1 — a GPU fell off the bus in the biggest training job in Bengaluru: every GPU in the job waits */
  const j1 = job(dcAt(20));
  if (j1) {
    const n = j1.nodes[Math.min(2, j1.nodes.length - 1)], node = st.nodes.get(n)!, g = node.gpus[3];
    const since = now - 38 * MIN;
    g.health = 'failed'; g.util = 0; g.powerW = 0; g.memUsedGb = 0; g.xid = { code: 79, at: since, text: 'GPU has fallen off the bus' }; g.pcieReplay = 1260; g.pstate = 'P8'; g.smActive = 0; g.tensorActive = 0; g.nvlinkRxGbs = 0; g.nvlinkTxGbs = 0;
    j1.nodes.forEach(id => { if (id !== n) st.nodes.get(id)!.gpus.forEach(x => { x.util = intBetween(rngOf(`${id}#${x.idx}`, 0x77), 0, 3); x.powerW = intBetween(rngOf(`${id}#${x.idx}`, 0x78), 95, 130); x.clockMhz = 345; }); resync(id); });
    node.gpus.forEach(x => { if (x !== g) { x.util = 0; x.powerW = 88; x.clockMhz = 345; } });
    g.clockMhz = 0;
    Object.assign(j1, { state: 'stalled', since, lastCheckpoint: since - 52 * MIN, cause: `GPU3 on ${short(n)} fell off the bus (Xid 79)`, causeNeId: n });
    resync(n);
    addAlert({ neId: n, dcId: j1.dcId, severity: 'critical', title: 'GPU Fallen Off Bus (Xid 79)', description: `GPU3 on ${short(n)} dropped off PCIe; ${j1.name} (${j1.gpus} GPUs) stopped at step barrier — every rank waiting`, source: 'Environment', type: 'GPU', start: since, state: 'active' });
    svcOf(j1).forEach(s => { s.status = 'Down'; });
  }
  /* F2 — uncorrectable ECC: the job still runs, but the GPU needs a reset (row remap pending) */
  const j2 = [dcAt(3), dcAt(8), dcAt(2)].map(d => job(d)).find(Boolean);
  if (j2) {
    const n = j2.nodes[Math.min(1, j2.nodes.length - 1)], g = st.nodes.get(n)!.gpus[5];
    const since = now - 125 * MIN;
    Object.assign(g, { dbe: 1, remapPending: true, health: 'degraded', sbe: g.sbe + 212, retiredPages: g.retiredPages + 2, xid: { code: 48, at: since, text: 'Double-bit (uncorrectable) ECC error' } });
    Object.assign(j2, { state: 'at-risk', since, cause: `GPU5 on ${short(n)}: uncorrectable ECC, row remap pending — next fault crashes the job`, causeNeId: n });
    resync(n);
    addAlert({ neId: n, dcId: j2.dcId, severity: 'major', title: 'GPU Uncorrectable ECC (Xid 48)', description: `GPU5 on ${short(n)}: double-bit ECC error, row remap pending — GPU reset needed; drain at the next checkpoint`, source: 'Environment', type: 'GPU', start: since, state: 'active' });
  }
  /* F3 — NVLink errors in Hyderabad make one node a straggler: the whole job runs at its pace */
  const j3 = job(dcAt(23));
  if (j3) {
    const n = j3.nodes[0], g = st.nodes.get(n)!.gpus[1];
    const since = now - 190 * MIN;
    Object.assign(g, { nvlinkErr: 1840, health: 'degraded', xid: { code: 74, at: since, text: 'NVLink error — link 4 CRC/replay errors' }, nvlinkRxGbs: 96, nvlinkTxGbs: 88 });
    Object.assign(j3, { state: 'slowed', since, stepMs: r0(j3.baselineMs * 1.22), mfu: r1(j3.mfu / 1.22), cause: `NVLink errors on ${short(n)} GPU1 — the job steps at the straggler's pace`, causeNeId: n });
    resync(n);
    addAlert({ neId: n, dcId: j3.dcId, severity: 'major', title: 'NVLink Errors (Xid 74)', description: `GPU1 on ${short(n)}: NVLink 4 replay errors 1,840 in 3 h; all-reduce on ${j3.name} 22% slower`, source: 'Environment', type: 'GPU', start: since, state: 'active' });
    svcOf(j3).forEach(s => { if (s.status === 'Active') s.status = 'Degraded'; });
  }
  /* F4 — CDU flow low in the Chennai GPU hall: liquid-cooled GPUs hit hardware slowdown */
  const j4 = job(dcAt(22));
  const cdu4 = j4 && st.cdus.find(c => c.dcId === dcAt(22) && j4.nodes.some(n => c.racks.includes(st.nodes.get(n)!.rackId)));
  if (j4 && cdu4) {
    const since = now - 85 * MIN;
    Object.assign(cdu4, { flowLpm: r0(cdu4.flowNominal * 0.62), supplyC: 33.4, returnC: 44.9, state: 'bad', pump: 'B', note: 'Pump A seized; standby pump B alone cannot hold design flow' });
    const u = db.datacenters.find(d => d.id === cdu4.dcId)!.cooling.units.find(x => x.id === cdu4.id)!; Object.assign(u, { supplyC: cdu4.supplyC, returnC: cdu4.returnC, loadPct: Math.min(99, u.loadPct + 14) });
    const fault = { id: cdu4.id, where: `${cdu4.room} · ${cdu4.name} loop` };
    const hot = j4.nodes.filter(n => cdu4.racks.includes(st.nodes.get(n)!.rackId));
    hot.forEach(n => {
      st.nodes.get(n)!.gpus.forEach(g => { const rr = rngOf(`${n}#${g.idx}`, 0x88); Object.assign(g, { tempC: intBetween(rr, 86, 89), throttle: 'hw-slowdown', clockMhz: intBetween(rr, 1180, 1340), health: 'degraded' }); g.hbmC = g.tempC + 6; });
      resync(n);
      addAlert({ neId: n, dcId: j4.dcId, fault, severity: 'major', title: 'GPU Thermal Slowdown', description: `${short(n)}: GPUs at 86–89°C, clocks cut to ~1.2 GHz — coolant supply ${cdu4.supplyC}°C from ${cdu4.name}`, source: 'Environment', type: 'Thermal', start: since + 6 * MIN, state: 'active' });
    });
    Object.assign(j4, { state: 'slowed', since, stepMs: r0(j4.baselineMs * 1.31), mfu: r1(j4.mfu / 1.31), cause: `${hot.length} nodes in thermal slowdown — ${cdu4.name} flow at 62%`, causeNeId: hot[0] });
    addAlert({ dcId: cdu4.dcId, severity: 'major', title: 'CDU Flow Low', description: `${cdu4.name} (${cdu4.room}): flow ${cdu4.flowLpm} of ${cdu4.flowNominal} L/min, supply ${cdu4.supplyC}°C — pump A seized, pump B alone`, source: 'Cooling', type: 'Cooling', start: since, state: 'active' });
    svcOf(j4).forEach(s => { if (s.status === 'Active') s.status = 'Degraded'; });
  }
  /* F5 — an InfiniBand rail flapping in Gorakhpur slows collectives */
  const j5 = job(dcAt(5), 'fine-tuning') ?? job(dcAt(5));
  if (j5) {
    const n = j5.nodes[0], node = st.nodes.get(n)!;
    const since = now - 54 * MIN;
    node.ib[3] = { rail: 3, state: 'flapping', errors: 4812 };
    Object.assign(j5, { state: 'slowed', since, stepMs: r0(j5.baselineMs * 1.12), mfu: r1(j5.mfu / 1.12), cause: `InfiniBand rail 3 flapping on ${short(n)}`, causeNeId: n });
    addAlert({ neId: n, dcId: j5.dcId, severity: 'major', title: 'InfiniBand Link Flapping', description: `${short(n)} ib3 (rail 3): 14 state changes in 30 min, 4,812 symbol errors — collectives retrying`, source: 'Interface', type: 'Network', start: since, state: 'active' });
    svcOf(j5).forEach(s => { if (s.status === 'Active') s.status = 'Degraded'; });
  }
  /* F6 — Delhi GPU rack near its breaker: nodes power-capped (the site is also on UPS battery) */
  const dc9 = db.datacenters.find(d => d.id === dcAt(9));
  const rk9 = dc9?.racks.find(r => r.density === 'ai' && [...st.nodes.values()].some(n => n.rackId === r.id && n.state === 'in-job'));
  if (dc9 && rk9) {
    rk9.drawKw = r1(rk9.budgetKw * 0.94);
    [...st.nodes.values()].filter(n => n.rackId === rk9.id && n.state === 'in-job').forEach(n => { n.gpus.forEach(g => { g.powerW = Math.min(g.powerW, 550); g.throttle = 'power-cap'; g.clockMhz = Math.min(g.clockMhz, 1650); }); resync(n.neId); });
    addAlert({ dcId: dc9.id, rackId: rk9.id, severity: 'warning', title: 'GPU Rack Power Capped', description: `${rk9.name} drawing ${rk9.drawKw} of ${rk9.budgetKw} kW — GPUs capped at 550 W to stay under the breaker`, source: 'Power', type: 'Rack', start: now - 6 * HOUR, state: 'active' });
  }
  /* F7 — an inference service in Kolkata has held its GPUs idle for 6 hours (no alarm: it is waste, not a fault) */
  const j7 = job(dcAt(16), 'inference');
  if (j7) {
    j7.nodes.forEach(id => { st.nodes.get(id)!.gpus.forEach(g => { g.util = intBetween(rngOf(`${id}#${g.idx}`, 0x7f), 1, 4); g.powerW = intBetween(rngOf(`${id}#${g.idx}`, 0x80), 90, 120); }); resync(id); });
    Object.assign(j7, { state: 'idle', since: now - 6 * HOUR - 10 * MIN, cause: 'Allocated but under 5% utilisation for 6 hours — no traffic since the 07:10 deploy' });
  }
  /* background: a handful of air-cooled GPUs running hot */
  for (const node of st.nodes.values()) {
    if (node.cooling !== 'air' || node.state !== 'in-job' || node.health !== 'healthy') continue;
    const rr = rngOf(node.neId, 0x401);
    if (!chance(rr, 0.02)) continue;
    const g = node.gpus[intBetween(rr, 0, 7)];
    Object.assign(g, { tempC: intBetween(rr, 83, 85), throttle: 'thermal', clockMhz: intBetween(rr, 1590, 1680) }); g.hbmC = g.tempC + 5;
    resync(node.neId);
    addAlert({ neId: node.neId, dcId: node.dcId, severity: 'minor', title: 'GPU Temperature High', description: `GPU${g.idx} at ${g.tempC}°C — software thermal throttling (clocks ${g.clockMhz} MHz)`, source: 'Environment', type: 'Thermal', start: now - intBetween(rr, 20, 300) * MIN, state: 'active' });
  }
}

/* ------------------------------------------------------------------ phase C */

export function addGpuChange(db: DbLike & { changes: unknown[] }, persona: Persona) {
  const st = db.gpu; if (!st || (persona !== 'cloud' && persona !== 'enterprise' && persona !== 'neocloud')) return;
  const old = [...st.nodes.values()].filter(n => isDrift(n));
  if (!old.length) return;
  const dc = DRIFT_SITES().find(d => old.some(n => n.dcId === d))!;
  const scope = old.filter(n => n.dcId === dc).map(n => n.neId);
  (db.changes as Record<string, unknown>[]).push({ id: `CHG-${++db.seq.chg}`, kind: 'Change', title: `Roll out GPU driver ${st.driverStd} to ${dc} AI pod (${scope.length} nodes on ${DRIVER_OLD})`, dcId: dc, scope, risk: 'Medium', status: 'Pending approval',
    windowStart: db.now + 3 * DAY + 2 * HOUR, windowEnd: db.now + 3 * DAY + 6 * HOUR, requester: 'Sarah Chen', rollback: `Reinstall ${DRIVER_OLD} from the node image; uncordon`, created: db.now - DAY });
}

type IncFns = { impactOf: (scope: { neIds?: string[]; dcIds?: string[]; pathIds?: string[] }) => { services: Service[]; customers: Customer[]; premium: Customer[]; revenue: number }; responseSla: Record<number, number>; resolveSla: Record<number, number> };
export function buildGpuIncidents(db: DbLike, persona: Persona, fx: IncFns) {
  const st = db.gpu; if (!st || (persona !== 'cloud' && persona !== 'enterprise' && persona !== 'neocloud')) return;
  const V = PERSONA_BY_ID[persona].vocab;
  let k = 0;
  const mk = (p: { title: string; type: Incident['type']; sev: 1 | 2 | 3 | 4; status: Incident['status']; owner: string; dcId: string; detected: number; ack?: number; alertTitles: string[]; affected: Incident['affected']; rca: Incident['rca']; actions: Omit<Incident['actions'][number], 'id' | 'status'>[]; neIds: string[]; summary: string; job?: GpuJob }) => {
    const alerts = db.alerts.filter(a => a.dcId === p.dcId && p.alertTitles.includes(a.title) && a.state !== 'cleared' && (!a.neId || p.neIds.includes(a.neId) || p.alertTitles.length === 1 || a.title === 'CDU Flow Low'));
    const im = fx.impactOf({ pathIds: p.neIds });
    const id = `INC-${String(++db.seq.inc).padStart(4, '0')}`;
    const inc: Incident = {
      id, title: p.title, type: p.type, sev: p.sev, pri: p.sev, status: p.status, owner: p.owner, reportedBy: 'DCGM / GPU telemetry', dcId: p.dcId, detected: p.detected, acknowledged: p.ack,
      responseSlaMin: fx.responseSla[p.sev], resolveSlaMin: fx.resolveSla[p.sev], alertIds: alerts.map(a => a.id), affected: p.affected, rca: p.rca,
      actions: p.actions.map((a, i) => ({ ...a, id: `A${i + 1}`, status: 'pending' })), changeIds: [],
      worklog: [{ at: p.detected, who: 'Monitoring', text: 'Raised from correlated GPU telemetry (DCGM health, Xid, fabric counters).', kind: 'system' }, ...(p.ack ? [{ at: p.ack, who: p.owner, text: `Acknowledged; ${p.owner} engaged.`, kind: 'human' as const }] : [])],
      impact: { services: im.services.length, customers: im.customers.length, premium: im.premium.length, revenueAtRisk: im.revenue, level: im.premium.length >= 2 || p.sev <= 2 ? 'High' : im.services.length ? 'Medium' : 'Low', summary: p.summary },
      similar: null, verification: [{ check: 'Job resumed and step time back to baseline', ok: null }, { check: 'Faulty GPU / node out of the scheduler', ok: null }, { check: 'DCGM diagnostics clean on the returned node', ok: null }]
    };
    alerts.forEach(a => { a.incidentId = id; });
    if (p.job) p.job.incidentId = id;
    db.incidents.push(inc); k++;
    return inc;
  };
  const spareOf = (j: GpuJob) => [...st.nodes.values()].find(n => n.clusterId === j.clusterId && n.state === 'idle' && n.health === 'healthy');
  const ownerName = (j: GpuJob) => db.customers.find(c => c.id === j.customerId)?.name ?? j.customerId;
  const rateH = (j: GpuJob) => fmtMoney(Math.round(j.gpus * jobRate(st, j)));

  const j1 = st.jobs.find(j => j.state === 'stalled');
  if (j1) {
    const n = j1.causeNeId!, spare = spareOf(j1);
    mk({ title: `GPU fell off the bus on ${short(n)} — ${j1.name} stalled (${j1.gpus} GPUs)`, type: 'GPU', sev: 2, status: 'Investigating', owner: 'Priya Nair', dcId: j1.dcId, detected: j1.since! + 2 * MIN, ack: j1.since! + 9 * MIN, alertTitles: ['GPU Fallen Off Bus (Xid 79)'], neIds: [n], job: j1,
      affected: [{ kind: 'NE', id: n, label: `${short(n)} GPU3` }, { kind: 'Customer', id: j1.customerId, label: ownerName(j1) }],
      rca: [{ cause: `GPU3 on ${short(n)} lost its PCIe link (Xid 79) — GPU or baseboard hardware fault`, confidence: 78, evidence: [{ label: `Xid 79 on GPU3 at ${new Date(j1.since!).toTimeString().slice(0, 5)}`, ref: n }, { label: 'GPU3 absent from nvidia-smi; other 7 GPUs healthy', ref: n }, { label: 'No power or thermal event on the rack in the last hour', ref: j1.dcId }] },
        { cause: 'Driver hang after an ECC error storm', confidence: 15, evidence: [{ label: 'Correctable ECC count on GPU3 rose 3× this week', ref: n }] }, { cause: 'Power transient on the node', confidence: 7, evidence: [{ label: 'PSUs report clean input', ref: n }] }],
      actions: [{ step: `Cordon ${short(n)} in the scheduler`, owner: 'GPU ops', expected: 'No new work lands on the node', rollback: 'Uncordon', verify: 'Node shows SchedulingDisabled', disruptive: false },
        { step: `Restart ${j1.name} from its last checkpoint on spare node ${spare ? short(spare.neId) : '(none free — shrink to N-1 nodes)'}`, owner: `${ownerName(j1)} · ML platform`, expected: `Training resumes; ${Math.round((j1.since! - j1.lastCheckpoint) / MIN)} min of steps re-run`, rollback: 'Keep job paused', verify: 'Step time within 5% of baseline', disruptive: true },
        { step: `Run DCGM diagnostics (level 3) on ${short(n)}`, owner: 'GPU ops', expected: 'Confirms GPU3 hardware fault', rollback: 'n/a', verify: 'Diagnostic report attached', disruptive: false },
        { step: 'Open RMA for GPU3 if diagnostics fail; reseat the riser first', owner: 'Vendor management', expected: 'Replacement GPU in 3 days', rollback: 'n/a', verify: 'RMA reference recorded', disruptive: false }],
      summary: `${j1.gpus} GPUs of ${ownerName(j1)}'s ${j1.kind} job are idle behind one failed GPU — about ${rateH(j1)} of GPU time every hour, plus ${Math.round((j1.since! - j1.lastCheckpoint) / MIN)} minutes of training since the last checkpoint to redo.` });
  }
  const j4 = st.jobs.find(j => j.state === 'slowed' && /CDU/.test(j.cause ?? ''));
  if (j4) {
    const hot = j4.nodes.filter(n => st.nodes.get(n)!.gpus.some(g => g.throttle === 'hw-slowdown'));
    const cdu = st.cdus.find(c => c.state === 'bad')!;
    mk({ title: `${cdu.name} flow low — ${hot.length} GPU nodes in thermal slowdown`, type: 'Cooling', sev: 2, status: 'Open', owner: 'Anil Kulkarni', dcId: j4.dcId, detected: j4.since! + 3 * MIN, ack: j4.since! + 14 * MIN, alertTitles: ['CDU Flow Low', 'GPU Thermal Slowdown'], neIds: hot, job: j4,
      affected: [{ kind: 'Facility', id: cdu.id, label: cdu.name }, ...hot.slice(0, 3).map(n => ({ kind: 'NE' as const, id: n, label: short(n) }))],
      rca: [{ cause: `${cdu.name} pump A seized; standby pump B alone holds 62% of design flow`, confidence: 81, evidence: [{ label: `Flow ${cdu.flowLpm} of ${cdu.flowNominal} L/min`, ref: cdu.dcId }, { label: `Coolant supply ${cdu.supplyC}°C (design 25–27°C)`, ref: cdu.dcId }, { label: `${hot.length} nodes on this loop hit hardware slowdown within 6 min`, ref: hot[0] }] },
        { cause: 'Blocked strainer on the secondary loop', confidence: 14, evidence: [{ label: 'Differential pressure rising over 3 days', ref: cdu.dcId }] }, { cause: 'Facility water supply temperature high', confidence: 5, evidence: [{ label: 'Primary loop within limits', ref: cdu.dcId }] }],
      actions: [{ step: `Cap GPUs on the ${cdu.name} loop at 550 W`, owner: 'GPU ops', expected: 'GPU temperatures under 83°C; slowdown clears', rollback: 'Remove the power cap', verify: 'No hw-slowdown on any GPU', disruptive: false },
        { step: `Start the spare pump skid on ${cdu.name}`, owner: 'Facility ops', expected: 'Flow back above 90% of design', rollback: 'Stop the skid', verify: `${cdu.name} flow ≥ ${Math.round(cdu.flowNominal * 0.9)} L/min`, disruptive: true },
        { step: 'Replace pump A; clean the secondary strainer', owner: 'Facility ops', expected: 'Redundant pumping restored', rollback: 'n/a', verify: 'Pump A running, ΔP normal', disruptive: false }],
      summary: `${j4.name} is running ${Math.round((j4.stepMs / j4.baselineMs - 1) * 100)}% slower — every step waits for the throttled nodes. The loop serves ${cdu.racks.length} GPU racks.` });
  }
  const j3 = st.jobs.find(j => j.state === 'slowed' && /NVLink/.test(j.cause ?? ''));
  if (j3) {
    const n = j3.causeNeId!;
    mk({ title: `NVLink errors on ${short(n)} — ${j3.name} running 22% slower`, type: 'GPU', sev: 3, status: 'Open', owner: 'Rahul Deshpande', dcId: j3.dcId, detected: j3.since! + 20 * MIN, alertTitles: ['NVLink Errors (Xid 74)'], neIds: [n], job: j3,
      affected: [{ kind: 'NE', id: n, label: `${short(n)} GPU1` }],
      rca: [{ cause: 'Degraded NVLink 4 on GPU1 — baseboard connector or NVSwitch port', confidence: 72, evidence: [{ label: '1,840 replay errors in 3 h on link 4 only', ref: n }, { label: 'Step time +22% since the first Xid 74', ref: n }] }, { cause: 'Firmware issue on the NVSwitch tray', confidence: 28, evidence: [{ label: 'Same firmware on healthy nodes', ref: n }] }],
      actions: [{ step: `Drain ${short(n)} at the next checkpoint and swap in a spare`, owner: 'GPU ops', expected: 'Job back to baseline speed', rollback: 'Re-add node', verify: 'Step time within 5% of baseline', disruptive: true },
        { step: 'Reseat the HGX baseboard; run NVLink bandwidth test', owner: 'Field engineer', expected: 'Link 4 error-free', rollback: 'n/a', verify: 'nvbandwidth all links at line rate', disruptive: false }],
      summary: `One node with a faulty NVLink holds back ${j3.gpus} GPUs: the job steps at the pace of its slowest rank.` });
  }
  const j2 = st.jobs.find(j => j.state === 'at-risk');
  if (j2) {
    const n = j2.causeNeId!;
    mk({ title: `Uncorrectable ECC on ${short(n)} GPU5 — reset needed before ${j2.name} crashes`, type: 'GPU', sev: 3, status: 'Investigating', owner: 'Priya Nair', dcId: j2.dcId, detected: j2.since! + 5 * MIN, ack: j2.since! + 18 * MIN, alertTitles: ['GPU Uncorrectable ECC (Xid 48)'], neIds: [n], job: j2,
      affected: [{ kind: 'NE', id: n, label: `${short(n)} GPU5` }],
      rca: [{ cause: 'HBM row failure on GPU5 — remap pending until the GPU is reset', confidence: 88, evidence: [{ label: 'Xid 48 (double-bit ECC) then row remap pending', ref: n }, { label: 'Correctable errors 212 in 2 h', ref: n }] }],
      actions: [{ step: `Let ${j2.name} reach its next checkpoint (every ${j2.checkpointMin} min)`, owner: `${ownerName(j2)} · ML platform`, expected: 'No lost work', rollback: 'n/a', verify: 'Checkpoint written', disruptive: false },
        { step: `Drain ${short(n)}, reset GPU5 to apply the row remap, run diagnostics`, owner: 'GPU ops', expected: 'Remap applied; GPU healthy', rollback: 'Keep node drained', verify: 'Remap pending = no; DCGM level 3 pass', disruptive: true }],
      summary: `The job is still running, but a second uncorrectable error on GPU5 would crash all ${j2.gpus} GPUs back to the last checkpoint.` });
  }
  void V; void k;
}

/* ------------------------------------------------------------------ queries */

export const isGpuPersona = (p: Persona) => p === 'cloud' || p === 'enterprise' || p === 'colocation' || p === 'neocloud';

/* ---------------------------------------------------------- 24 h history */

/* One sample per hour for the last 24 h per node, consistent with where the node is now: a job that
   stalled an hour ago was at full tilt before; an idle allocation has been idle since 07:10. Called after
   the faults are injected so the history ends on the current reading. */
export function buildGpuHistory(db: DbLike) {
  const st = db.gpu; if (!st) return;
  const now = db.now;
  for (const node of st.nodes.values()) {
    const rr = rngOf(node.neId, 0x5e1);
    const job = node.jobId ? st.jobs.find(j => j.id === node.jobId) : undefined;
    const cur = { util: Math.round(node.gpus.reduce((a, g) => a + g.util, 0) / 8), tempC: Math.max(...node.gpus.map(g => g.tempC)), powerKw: node.powerKw };
    const before = node.state === 'in-job' ? { util: job?.kind === 'inference' ? 64 : 93, tempC: node.cooling === 'air' ? 72 : 57, powerKw: 2.1 + 8 * 0.55 } : node.state === 'burn-in' ? { util: 100, tempC: node.cooling === 'air' ? 76 : 60, powerKw: 2.1 + 8 * 0.68 } : { util: 1, tempC: node.cooling === 'air' ? 36 : 31, powerKw: 2.1 + 8 * 0.075 };
    const since = job?.since ?? (node.rma ? now - 60 * HOUR : undefined);
    const util: number[] = [], tempC: number[] = [], powerKw: number[] = [];
    for (let h = 0; h < 24; h++) {
      const at = now - (23 - h) * HOUR;
      const after = since !== undefined && at >= since;
      const base = after || h === 23 ? cur : before;
      util.push(Math.max(0, Math.min(100, r0(base.util + (base.util > 5 ? between(rr, -4, 4) : between(rr, 0, 1.5))))));
      tempC.push(r0(base.tempC + between(rr, -2, 2)));
      powerKw.push(r1(base.powerKw * between(rr, 0.96, 1.03)));
    }
    util[23] = cur.util; tempC[23] = cur.tempC; powerKw[23] = cur.powerKw;
    node.series = { util, tempC, powerKw };
  }
}
