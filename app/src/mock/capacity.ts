/* Capacity additions (13-Oct-2026, P2B merge phase 3), derived from the estate: what is held against capacity, GPU headroom and
   site energy. Holds: a planned device holds its rack units and the typical draw of its type (Reserved); a colocation tenant's
   contracted power above what the cabinet draws is sold but not drawn (Committed); an approved / executing capacity plan adds
   capacity (Pipeline); a submitted plan is Requested; GPU nodes allocated to a job that is idle are Reserved. Energy: facility load
   = the site's power split, PUE = facility ÷ IT, carbon = facility energy × the national grid factor of the geography. */
import type { CapacityHold, Datacenter, GpuCapacity, SiteEnergy } from '../api/types';
import type { Db } from './generate';
import { dcimModel } from './dcim';
import { activeGeo } from './geo';
import { p2bStore } from './p2b';

const r1 = (n: number) => Math.round(n * 10) / 10;
/* grid emission factors (kg CO2 per kWh): India CEA CO2 baseline database v19 (FY 2022-23) 0.716; USA EPA eGRID 2022 national 0.371 */
export const GRID = { in: { kg: 0.716, source: 'CEA CO₂ baseline database v19 (FY 2022-23), all-India grid' }, us: { kg: 0.371, source: 'EPA eGRID 2022, US national average' } } as const;

export function capacityHolds(db: Db, dcs: Datacenter[], withPlanner = true): CapacityHold[] {
  const ids = new Set(dcs.map(d => d.id));
  const dm = dcimModel(db);
  const out: CapacityHold[] = [];
  for (const n of db.nes) {
    if (!ids.has(n.dcId) || !(n.discovery === 'not-discovered' && n.ndReason === 'planned')) continue;
    const t = dm.typeById.get(`${n.vendor} ${n.model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    const rk = dm.rackById.get(n.rackId);
    out.push({ id: `${n.id}:u`, dcId: n.dcId, kind: 'Planned device', resource: 'Space', qty: n.uSize ?? 1, unit: 'U', state: 'Reserved', label: `${n.name} in ${rk?.name ?? n.rackId} U${n.u}`, ref: n.id, to: `/dcim/racks/${encodeURIComponent(n.rackId)}` });
    if (t?.typicalW) out.push({ id: `${n.id}:kw`, dcId: n.dcId, kind: 'Planned device', resource: 'Power', qty: r1(t.typicalW / 1000), unit: 'kW', state: 'Reserved', label: `${n.name} (${t.model}, typical ${t.typicalW} W)`, ref: n.id, to: `/dcim/racks/${encodeURIComponent(n.rackId)}` });
  }
  const cust = new Map(db.customers.map(c => [c.id, c.name]));
  for (const d of dcs) for (const r of d.racks) if (r.owner === 'tenant' && r.contractedKw && r.contractedKw > r.drawKw)
    out.push({ id: `${r.id}:contract`, dcId: d.id, kind: 'Tenant contract', resource: 'Power', qty: r1(r.contractedKw - r.drawKw), unit: 'kW', state: 'Committed', label: `${cust.get(r.tenantId ?? '') ?? 'Tenant'} · ${r.name}: ${r.contractedKw} kW contracted, ${r.drawKw} kW drawn`, ref: r.id, to: `/dcim/racks/${encodeURIComponent(r.id)}` });
  for (const p of db.plans) if (ids.has(p.dcId) && p.status !== 'Delivered')
    out.push({ id: p.id, dcId: p.dcId, kind: 'Capacity plan', resource: p.dimension, qty: p.amount, unit: p.unit, state: p.status === 'Submitted' ? 'Requested' : 'Pipeline', label: `${p.title} (${p.status.toLowerCase()})`, ref: p.id, to: `/capacity?dc=${p.dcId}` });
  /* holds an approved planner plan wrote (P2B port): Reserved at approval, Committed at execution, until consumed or released */
  if (withPlanner) for (const h of p2bStore(db).getAllRaw('capacityReservations') as unknown as { id: string; plannerPlanId?: string; dataCenterId?: string; resourceType: string; quantity: number; unit: string; state: string; status: string; label?: string }[]) {
    if (!h.plannerPlanId || !h.dataCenterId || !ids.has(h.dataCenterId) || h.status === 'Released' || h.state === 'Consumed' || h.state === 'Available') continue;
    out.push({ id: h.id, dcId: h.dataCenterId, kind: 'Planner hold', resource: h.resourceType === 'Cooling' ? 'Cooling' : h.resourceType === 'Rack' ? 'Space' : h.resourceType === 'Subnet' || h.resourceType === 'VLAN' ? 'Ports' : 'Power', qty: h.quantity, unit: h.unit, state: h.state === 'Committed' ? 'Committed' : 'Reserved', label: h.label ?? h.id, ref: h.plannerPlanId, to: `/planning/plans/${h.plannerPlanId}` });
  }
  if (db.gpu) {
    const idleJobs = new Set(db.gpu.jobs.filter(j => j.state === 'idle').map(j => j.id));
    const byJob = new Map<string, number>();
    for (const n of db.gpu.nodes.values()) if (ids.has(n.dcId) && n.jobId && idleJobs.has(n.jobId)) byJob.set(`${n.dcId}|${n.jobId}`, (byJob.get(`${n.dcId}|${n.jobId}`) ?? 0) + n.gpus.length);
    for (const [k, g] of byJob) { const [dcId, jobId] = k.split('|'); const j = db.gpu.jobs.find(x => x.id === jobId)!; out.push({ id: `${k}:gpu`, dcId, kind: 'GPU allocation', resource: 'GPU', qty: g, unit: 'GPU', state: 'Reserved', label: `${j.name ?? jobId}: allocated and idle`, ref: jobId, to: `/gpu?dc=${dcId}` }); }
  }
  return out;
}

export function gpuCapacity(db: Db, dcs: Datacenter[]): GpuCapacity | null {
  if (!db.gpu) return null;
  const ids = new Set(dcs.map(d => d.id));
  const idleJobs = new Set(db.gpu.jobs.filter(j => j.state === 'idle').map(j => j.id));
  const nodes = [...db.gpu.nodes.values()].filter(n => ids.has(n.dcId));
  if (!nodes.length) return null;
  const g = (f: (n: typeof nodes[number]) => boolean) => nodes.filter(f).reduce((a, n) => a + n.gpus.length, 0);
  const models = [...new Set(nodes.map(n => n.model))];
  return {
    gpus: g(() => true), inJob: g(n => n.state === 'in-job' && !(n.jobId && idleJobs.has(n.jobId))), allocatedIdle: g(n => !!n.jobId && idleJobs.has(n.jobId)), free: g(n => n.state === 'idle' && !n.jobId), out: g(n => n.state === 'failed' || n.state === 'drained' || n.state === 'burn-in'),
    byModel: models.map(m => ({ model: m, gpus: g(n => n.model === m), inJob: g(n => n.model === m && n.state === 'in-job'), free: g(n => n.model === m && n.state === 'idle' && !n.jobId) })).sort((a, b) => b.gpus - a.gpus)
  };
}

export function siteEnergy(dcs: Datacenter[]): { sites: SiteEnergy[]; kgPerKwh: number; source: string } {
  const f = GRID[activeGeo().id];
  return {
    kgPerKwh: f.kg, source: f.source,
    sites: dcs.map(d => {
      const it = d.power.split[0]?.kw ?? 0; // the first split line is the IT / equipment load in every persona
      const fac = d.power.split.reduce((a, s) => a + s.kw, 0);
      const cool = d.power.split.find(s => /cool/i.test(s.label))?.kw ?? 0;
      return { id: d.id, city: d.city, itKw: r1(it), facilityKw: r1(fac), pue: it ? Math.round((fac / it) * 100) / 100 : 0, coolingKw: r1(cool), mwhDay: r1((fac * 24) / 1000), tco2Day: r1((fac * 24 * f.kg) / 1000), liquidRacks: d.racks.filter(r => r.liquid).length };
    })
  };
}
