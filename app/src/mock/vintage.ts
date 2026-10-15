/* Equipment vintage (15-Oct-2026, user: "for the server refresh scenario no equipment is matching in any data center").
   A real estate is not all bought last year. This module ages the generated estate, deterministically, and is the single place the
   generator (model names), the asset lifecycle read model (install dates, warranty, vendor dates, rack age and condition) and through
   them DCIM, the device pages, the lifecycle / support / spares views, compliance and the planner all read from:
   - Hardware was bought over roughly the last eight years. The previous generation of servers (about 15–30% of a site's servers) and
     of switches (10–20% of its switches: leaf / ToR and front-end Ethernet; data-centre spines, InfiniBand and OOB stay current) is still racked
     at every live site: the vendor's previous model of the same family (PowerEdge R740 / R640 → R760, ProLiant DL380 / DL360 Gen10 →
     DL380 Gen11, SYS-220U / SYS-120U → SYS-121H, Nexus 9372PX / 3172PQ → Nexus 93180YC, Arista 7050QX / 7050SX → 7050SX3,
     QFX5100 → QFX5120, NVIDIA SN4600C → SN5600, Arista 7260CX3 → 7060DX5), bought five to eight years ago. Only the model name and
     OS change: the device keeps its slot, its U, its draw and its ports, so every count and every rack / power figure holds. The
     lowest-numbered devices of a role are the old ones (the site's first build-out, or the kit moved in with it).
   - Previous-generation kit is older than most sites (they were commissioned 0.5–4 years ago): it was moved in from older sites when
     they were consolidated, which is why its purchase date can be earlier than the site's commissioning date. Current kit was bought
     at or after commissioning, except about a quarter that was also moved in (bought up to 4.5 years ago). GPU nodes are under three
     years old.
   - Vendor dates: every previous-generation model is past end of sale; the old switch models are also past end of support. Current
     models stay on sale for years (end of support = end of sale + 5 years).
   - Warranty: 3 or 5 years from purchase (GPU and storage 3), so most old kit is out of warranty; half the previous-generation
     devices are no longer on a support contract (the operator stopped renewing it on kit due for refresh).
   - Racks: about one rack in ten at a live site (42U racks first) is the old 600 × 1000 mm type (shallower, bought with the first build-out);
     about half the sites have one or two racks marked damaged at audit. GPU / liquid racks are never old or damaged. */
import type { Datacenter, NetworkElement, Rack, RackLife } from '../api/types';
import { mulberry32, seedOf, between, chance, intBetween } from '../lib/rng';

const DAY = 864e5, YEAR = 365 * DAY;

/* ------------------------------------------------------------------ models */
export interface LegacyModel { model: string; os?: string; eosDays: number; supportDays: number; family: string }
/** Previous-generation model of a current one: by current model, then size (servers) or layer (switches). Days are relative to the mock clock. */
const PREV: Record<string, (n: Pick<NetworkElement, 'layer' | 'uSize'>) => LegacyModel> = {
  'PowerEdge R760': n => (n.uSize ?? 1) >= 2 ? L('PowerEdge R740', -1000, 820, 'PowerEdge R760') : L('PowerEdge R640', -1100, 700, 'PowerEdge R760'),
  'ProLiant DL380 Gen11': n => (n.uSize ?? 1) >= 2 ? L('ProLiant DL380 Gen10', -900, 900, 'ProLiant DL380 Gen11') : L('ProLiant DL360 Gen10', -950, 880, 'ProLiant DL380 Gen11'),
  'SYS-121H': n => (n.uSize ?? 1) >= 2 ? L('SYS-220U-TNR', -620, 1000, 'SYS-121H') : L('SYS-120U-TNR', -600, 1020, 'SYS-121H'),
  'Nexus 93180YC': n => n.layer === 'leaf' ? L('Nexus 9372PX', -2700, -900, 'Nexus 93180YC', 'NX-OS 9.3(12)') : L('Nexus 3172PQ', -2400, -570, 'Nexus 93180YC', 'NX-OS 9.3(12)'),
  '7050SX3-48YC': n => n.layer === 'leaf' ? L('7050QX-32S', -2300, -500, '7050SX3-48YC', 'EOS 4.28.10M') : L('7050SX-64', -2500, -700, '7050SX3-48YC', 'EOS 4.28.10M'),
  'QFX5120-48Y': () => L('QFX5100-48S', -1900, -150, 'QFX5120-48Y', 'Junos 21.4R3-S6'),
  'Spectrum-4 SN5600': () => L('Spectrum-3 SN4600C', -300, 1500, 'Spectrum-4 SN5600', 'Cumulus 5.4'),
  '7060DX5-64S': () => L('7260CX3-64', -700, 1100, '7060DX5-64S', 'EOS 4.28.10M'),
};
function L(model: string, eosDays: number, supportDays: number, family: string, os?: string): LegacyModel { return { model, os, eosDays, supportDays, family }; }
/** Every previous-generation model by name (vendor dates for the lifecycle catalogue). */
export const LEGACY_MODELS: Record<string, LegacyModel> = Object.fromEntries(
  Object.values(PREV).flatMap(f => [f({ layer: 'leaf', uSize: 1 }), f({ layer: 'access', uSize: 1 }), f({ layer: 'leaf', uSize: 2 }), f({ layer: 'access', uSize: 2 })]).map(m => [m.model, m]));
export const isLegacyModel = (model: string) => !!LEGACY_MODELS[model];
/** Older hosts run the previous OS release. */
const OLD_HOST_OS: Record<string, string> = { 'ESXi 8.0u2': 'ESXi 7.0u3', 'RHEL 9.3': 'RHEL 8.8', 'Ubuntu 22.04': 'Ubuntu 20.04' };

const planned = (n: NetworkElement) => n.discovery === 'not-discovered' && n.ndReason === 'planned';
const num = (id: string) => Number(id.match(/(\d+)$/)?.[1] ?? 0);
const oldest = (a: NetworkElement, b: NetworkElement) => num(a.id) - num(b.id) || a.id.localeCompare(b.id);

/** Turn part of a site's installed servers and switches into the previous generation (in place; called by the generator per site).
    Uses its own seed per site, never the generator's stream, so nothing else in the estate moves. */
export function agePreviousGeneration(dcId: string, siteStatus: string, nes: NetworkElement[]) {
  if (siteStatus === 'planned') return;
  const r = mulberry32(seedOf(`${dcId}:vintage`));
  const sRate = between(r, 0.15, 0.3), wRate = between(r, 0.1, 0.2);
  const live = nes.filter(n => !planned(n) && n.role !== 'Tenant gear');
  const servers = live.filter(n => n.role === 'Server' && PREV[n.model]).sort(oldest);
  const switches = nes.filter(n => n.role === 'Switch').length;
  const sw = live.filter(n => n.role === 'Switch' && PREV[n.model]).sort(oldest);
  const nS = servers.length ? Math.max(1, Math.round(servers.length * sRate)) : 0;
  const nW = sw.length ? Math.min(Math.ceil(sw.length / 2), Math.max(1, Math.round(switches * wRate))) : 0;
  for (const n of [...servers.slice(0, nS), ...sw.slice(0, nW)]) {
    const m = PREV[n.model](n);
    n.model = m.model;
    n.os = m.os ?? OLD_HOST_OS[n.os] ?? n.os;
  }
}

/** Operator servers of a telco / colocation site (15-Oct-2026, mock/generate.ts `addOperatorServers`): the same share of previous-generation
    servers as any site (the same per-site draw as `agePreviousGeneration`), taken in build order — the management servers and application
    servers of the first build-out, then the first NFV hosts — rather than by trailing number (the servers are numbered per function). */
export function ageOperatorServers(dcId: string, siteStatus: string, servers: NetworkElement[]) {
  if (siteStatus === 'planned' || !servers.length) return;
  const sRate = between(mulberry32(seedOf(`${dcId}:vintage`)), 0.15, 0.3);
  const live = servers.filter(n => !planned(n) && PREV[n.model]);
  for (const n of live.slice(0, Math.max(1, Math.round(live.length * sRate)))) {
    const m = PREV[n.model](n);
    n.model = m.model;
    n.os = m.os ?? OLD_HOST_OS[n.os] ?? n.os;
  }
}

/* ------------------------------------------------------------------ purchase dates */
/** When a device was bought (= installed in the estate). Seeded on the device id. */
export function purchasedAt(n: Pick<NetworkElement, 'id' | 'model' | 'role'>, commissioned: number, now: number): number {
  const r = mulberry32(seedOf(`${n.id}:bought`));
  if (isLegacyModel(n.model)) return Math.round(now - between(r, 5, 8) * YEAR);
  /* platforms already past end of sale that were never replaced (FortiGate 3700F, ASR 9006): bought four to seven years ago */
  if (OLD_PLATFORMS.includes(n.model)) return Math.round(now - between(r, 4, 7) * YEAR);
  const latest = now - 30 * DAY;
  if (n.role === 'GPU') return Math.round(Math.max(now - between(r, 0.3, 2.8) * YEAR, Math.min(commissioned, latest - 60 * DAY)));
  const siteAge = (now - commissioned) / YEAR;
  if (chance(r, 0.25) && siteAge < 4.2) return Math.round(now - between(r, siteAge + 0.1, 4.5) * YEAR);   // moved in
  return Math.round(commissioned + r() * Math.max(0, latest - commissioned));
}
export const OLD_PLATFORMS = ['FortiGate 3700F', 'ASR 9006'];
/** Warranty years from purchase. */
export function warrantyYears(n: Pick<NetworkElement, 'id' | 'role'>): number {
  if (n.role === 'GPU' || n.role === 'Storage') return 3;
  return chance(mulberry32(seedOf(`${n.id}:warranty`)), 0.4) ? 5 : 3;
}
/** Previous-generation kit whose support contract the operator stopped renewing. */
export const contractLapsed = (n: Pick<NetworkElement, 'id' | 'model'>) => isLegacyModel(n.model) && chance(mulberry32(seedOf(`${n.id}:amc`)), 0.5);

/* ------------------------------------------------------------------ racks */
export type RackVintage = RackLife;
const DAMAGE = ['Frame twisted: the front door no longer closes (found at audit)', 'Rear door hinge broken, door removed', 'Base corroded after a chilled-water leak',
  'Side panel and earth bond missing after a move', 'Mounting rails bent by an overweight install'];
/** Rack type, age and condition for every rack of a site. `holdsDeep` = racks with GPU / liquid gear (never the old shallow type). */
export function rackVintage(dc: Datacenter, now: number, holdsDeep: (rack: Rack) => boolean): RackVintage[] {
  const r = mulberry32(seedOf(`${dc.id}:rack-vintage`));
  const commissioned = dc.commissionedOn ?? now - 300 * DAY;
  const live = dc.status !== 'planned';
  /* only racks in service (drawing power) can be old or damaged; GPU / liquid / storage racks are never the old shallow type */
  /* the operator-server racks added 15-Oct-2026 (telco NFV / colocation management racks) are current racks bought for them and stay out
     of the draw, so every other rack keeps its type and condition */
  const eligible = (rk: Rack) => live && rk.drawKw > 0 && !rk.liquid && rk.density !== 'ai' && !holdsDeep(rk) && !rk.opServers;
  const pool = dc.racks.filter(eligible);
  /* about one rack in ten (at least one at a live site), 42U racks first: the first build-out in rack order */
  const order = [...pool].sort((a, b) => Number(b.heightU === 42) - Number(a.heightU === 42));
  const nOld = pool.length ? Math.min(Math.ceil(pool.length * 0.6), Math.max(1, Math.round(dc.racks.filter(rk => !rk.opServers).length * between(r, 0.08, 0.14)))) : 0;
  const old = new Set(order.slice(0, nOld).map(rk => rk.id));
  const nDamaged = live && pool.length >= 4 && chance(r, 0.55) ? (pool.length >= 16 && chance(r, 0.4) ? 2 : 1) : 0;
  const damaged = new Map<string, string>();
  for (let i = 0; i < nDamaged; i++) { const rk = pool[intBetween(r, 0, pool.length - 1)]; if (!damaged.has(rk.id)) damaged.set(rk.id, DAMAGE[intBetween(r, 0, DAMAGE.length - 1)]); }
  return dc.racks.map(rk => {
    const rr = mulberry32(seedOf(`${rk.id}:rack-bought`));
    const isOld = old.has(rk.id);
    const installed = isOld ? Math.round(now - between(rr, 7, 10) * YEAR) : Math.round(commissioned - between(rr, 0.1, 0.5) * YEAR);
    const base = isOld ? { manufacturer: 'Rittal', model: `TS8 ${rk.heightU}U 600 × 1000`, depthMm: 1000, mountingDepthMm: 860 } : { manufacturer: 'Rittal', model: `TS IT ${rk.heightU}U 600 × 1200`, depthMm: 1200, mountingDepthMm: 1070 };
    const note = damaged.get(rk.id);
    return { rackId: rk.id, ...base, heightU: rk.heightU, installed, old: isOld, condition: note ? 'Damaged' : 'Good', note };
  });
}
