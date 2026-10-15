/* Asset lifecycle, support and spares (Phase 2, 12-Oct-2026, user). A read model derived per site:
   - every installed device gets a purchase / install date, a warranty end (3 or 5 years from purchase), the vendor's end-of-sale /
     end-of-support dates for its model (one date per model, so every device of a model agrees) and a support contract. The estate's
     age (previous-generation models, purchase dates up to eight years back, kit moved in from older sites, lapsed contracts on old kit,
     old and damaged racks) comes from mock/vintage.ts (15-Oct-2026);
   - every rack gets its type, purchase date and condition (old 600 × 1000 racks, racks marked damaged at audit);
   - every module in Fault (PSU, disk, controller, GPU) and every GPU node already marked for RMA gets an RMA case;
   - spares on site per part family, with what is reserved for open RMAs.
   Nothing in the generated estate changes. */
import type { AssetLife, Datacenter, NetworkElement, RmaCase, SiteLifecycle, SparePart } from '../api/types';
import type { Db } from './generate';
import { mulberry32, seedOf, intBetween, chance } from '../lib/rng';
import { dcAt } from './geo';
import { LEGACY_MODELS, contractLapsed, purchasedAt, rackVintage, warrantyYears } from './vintage';
import { DAY, HOUR } from './seed';

const cache = new Map<string, SiteLifecycle>();
let cacheDb: Db | null = null;
export function clearLifecycle() { cache.clear(); cacheDb = null; }
export function siteLifecycle(db: Db, dcId: string): SiteLifecycle | null {
  if (cacheDb !== db) { cache.clear(); cacheDb = db; }
  const hit = cache.get(dcId); if (hit) return hit;
  const dc = db.datacenters.find(d => d.id === dcId); if (!dc) return null;
  const s = build(db, dc); cache.set(dcId, s); return s;
}

const YEAR = 365 * DAY;
/* vendor lifecycle per model. Current platforms are years from end of sale (1000–1800 days); older ones are not:
   the FortiGate 3700F is past end of support, the ASR 9006 leaves support within a year, and every previous-generation model
   (mock/vintage.ts) is past end of sale, the old switch families also past end of support. */
const CATALOGUE: Record<string, number> = { 'FortiGate 3700F': -2010, 'ASR 9006': -1500 };
export function modelDates(model: string, now: number) {
  const old = LEGACY_MODELS[model];
  if (old) return { endOfSale: now + old.eosDays * DAY, endOfSupport: now + old.supportDays * DAY };
  const r = mulberry32(seedOf(`eol:${model}`));
  const eos = now + (CATALOGUE[model] ?? intBetween(r, 1000, 1800)) * DAY;
  return { endOfSale: eos, endOfSupport: eos + 5 * YEAR };
}
const optic = (n: { speedMbps: number; optics?: { model: string } }) => n.optics?.model;

function build(db: Db, dc: Datacenter): SiteLifecycle {
  const now = db.now;
  const nes = db.nes.filter(n => n.dcId === dc.id);
  const commissioned = dc.commissionedOn ?? now - 300 * DAY;
  const contracts = new Map<string, AssetLife['contract']>();
  const contractOf = (vendor: string, n: NetworkElement) => {
    const level: NonNullable<AssetLife['contract']>['level'] = n.layer === 'core' || n.layer === 'spine' || n.role === 'GPU' || n.role === 'Storage' ? '24×7×4' : n.role === 'Server' ? 'NBD' : '8×5 NBD';
    const key = `${vendor}|${level}`;
    if (!contracts.has(key)) {
      const r = mulberry32(seedOf(`${dc.id}:contract:${key}`));
      contracts.set(key, { id: `AMC-${dc.id.slice(0, 2)}-${String(seedOf(key + dc.id) % 90000 + 10000)}`, level, expires: now + intBetween(r, -20, 720) * DAY });
    }
    return contracts.get(key)!;
  };
  const assets: AssetLife[] = nes.map(n => {
    const md = modelDates(n.model, now);
    const isPlanned = n.discovery === 'not-discovered' && n.ndReason === 'planned';
    const tenant = n.role === 'Tenant gear';
    const installed = isPlanned ? now : purchasedAt(n, commissioned, now);
    const warrantyEnd = installed + warrantyYears(n) * YEAR;
    const base = { neId: n.id, dcId: dc.id, vendor: n.vendor, model: n.model, installed, warrantyEnd, endOfSale: md.endOfSale, endOfSupport: md.endOfSupport };
    if (isPlanned) return { ...base, contract: null, state: 'Planned' as const, note: 'Not installed yet' };
    if (tenant) return { ...base, contract: null, state: 'Tenant-owned' as const, note: 'Support is the tenant\'s' };
    /* no vendor contract on a model the vendor no longer supports, nor on old kit whose contract was not renewed */
    const c = contractLapsed(n) || md.endOfSupport < now ? null : contractOf(n.vendor, n);
    const covered = (c && c.expires > now) || warrantyEnd > now;
    const state: AssetLife['state'] = md.endOfSupport < now ? 'End of support'
      : !covered ? 'Out of warranty'
      : (c && c.expires > now && c.expires - now < 90 * DAY) || md.endOfSupport - now < YEAR ? 'Expiring' : 'Covered';
    const note = state === 'End of support' ? `Vendor support ended ${new Date(md.endOfSupport).toISOString().slice(0, 10)}`
      : state === 'Out of warranty' ? `Warranty ended ${new Date(warrantyEnd).toISOString().slice(0, 10)} and ${c && c.expires <= now ? `contract ${c.id} lapsed` : contractLapsed(n) ? 'the support contract was not renewed (previous generation)' : 'no contract'}`
      : state === 'Expiring' ? (c && c.expires - now < 90 * DAY ? `Contract ${c.id} ends in ${Math.max(0, Math.round((c.expires - now) / DAY))} days` : `End of support in ${Math.round((md.endOfSupport - now) / DAY)} days`)
      : `${c?.level ?? 'Warranty'} cover`;
    return { ...base, contract: c, state, note };
  });

  /* RMA cases: faulted modules + GPU nodes the GPU layer already sent to RMA */
  const rmas: RmaCase[] = [];
  /* the module is still reporting Fault, so the swap has not happened yet: at most an engineer is booked */
  const PHASE: RmaCase['status'][] = ['Opened', 'Part shipped', 'Engineer booked'];
  for (const n of nes) for (const m of n.modules.filter(m => m.state === 'Fault' && !/^SHELF$/.test(m.slot) && !/^GPU\d/.test(m.slot))) {
    const r = mulberry32(seedOf(`${n.id}:${m.slot}:rma`));
    const opened = now - intBetween(r, 2, 70) * HOUR;
    rmas.push({ id: `RMA-${String(seedOf(n.id + m.slot) % 90000 + 10000)}`, neId: n.id, dcId: dc.id, part: m.name, slot: m.slot, vendor: n.vendor, opened, ref: `${n.vendor.slice(0, 3).toUpperCase()}-${String(seedOf(m.serial) % 9000000 + 1000000)}`,
      status: PHASE[Math.min(2, Math.floor((now - opened) / (18 * HOUR)))], eta: 0, spareOnSite: false });
  }
  for (const g of db.gpu ? [...db.gpu.nodes.values()].filter(x => x.dcId === dc.id && x.rma) : []) {
    const n = db.neById.get(g.neId)!;
    const r = mulberry32(seedOf(`${g.neId}:gpurma`));
    const opened = now - intBetween(r, 6, 90) * HOUR;
    rmas.push({ id: g.rma!, neId: g.neId, dcId: dc.id, part: `${g.model} board`, slot: (g.note?.match(/(?:GPU|Card) ?(\d)/)?.[0] ?? 'GPU').replace(' ', ''), vendor: g.vendor, opened, ref: `${g.vendor.slice(0, 3).toUpperCase()}-${String(seedOf(g.neId) % 9000000 + 1000000)}`,
      status: (['Opened', 'Part shipped', 'Engineer booked', 'Replaced · verifying'] as RmaCase['status'][])[Math.min(3, Math.floor((now - opened) / (24 * HOUR)))], eta: 0, spareOnSite: false });
    void n;
  }

  /* spares: part families the site's installed base uses */
  const fam = new Map<string, { fits: string; count: number }>();
  const add = (part: string, fits: string, k = 1) => { const e = fam.get(part) ?? { fits, count: 0 }; e.count += k; fam.set(part, e); };
  for (const n of nes) {
    if (n.role === 'Tenant gear' || (n.discovery === 'not-discovered' && n.ndReason === 'planned')) continue;
    const psus = n.modules.filter(m => /^(PSU|PEM)/.test(m.slot)).length || 2;
    add(`${n.vendor} power supply`, `${n.vendor} ${n.role === 'Server' || n.role === 'Storage' || n.role === 'GPU' ? 'servers' : 'network'}`, psus);
    if (n.modules.some(m => /^FAN/.test(m.slot))) add(`${n.vendor} fan module`, n.vendor);
    if (n.modules.some(m => /^DISK/.test(m.slot))) add('NVMe 3.84 TB', 'servers', 4);
    for (const it of db.ifaces.get(n.id) ?? []) { const o = optic(it); if (o) add(o, 'optics'); }
  }
  for (const g of db.gpu ? [...db.gpu.nodes.values()].filter(x => x.dcId === dc.id) : []) add(`${g.model} board`, 'GPU nodes', g.gpus.length);
  const spares: SparePart[] = [...fam.entries()].map(([part, f]) => {
    const r = mulberry32(seedOf(`${dc.id}:spare:${part}`));
    const min = Math.max(1, Math.ceil(f.count / (/board$/.test(part) ? 300 : /optic|SFP|QSFP|OSFP/i.test(part) ? 60 : 40)));
    let onHand = dc.status === 'planned' ? 0 : chance(r, 0.12) ? 0 : intBetween(r, min, min + (/board$/.test(part) ? 1 : 4));
    /* the hero incident's action plan swaps the SFP on xe-0/0/3 for a spare from lot 24A: there is one */
    if (dc.id === dcAt(1) && part === 'SFP-10G-LR') onHand = Math.max(onHand, 3);
    return { id: `${dc.id}-SP-${String(seedOf(part) % 9000 + 1000)}`, dcId: dc.id, part, fits: f.fits, onHand, min, reserved: 0, state: 'ok' as const };
  });
  for (const c of rmas) {
    const sp = spares.find(s => s.part === c.part || (c.part === 'Power supply' && s.part === `${c.vendor} power supply`) || (/Power supply/.test(c.part) && s.part === `${c.vendor} power supply`) || (c.part.startsWith('NVMe') && s.part.startsWith('NVMe')));
    if (sp && sp.onHand - sp.reserved > 0) { sp.reserved++; c.spareOnSite = true; }
    c.eta = c.status === 'Replaced · verifying' ? now : c.spareOnSite ? now + 4 * HOUR : now + intBetween(mulberry32(seedOf(c.id)), 2, 5) * DAY;
  }
  for (const s of spares) s.state = s.onHand - s.reserved <= 0 ? 'out' : s.onHand - s.reserved < s.min ? 'low' : 'ok';
  spares.sort((a, b) => ({ out: 0, low: 1, ok: 2 })[a.state] - ({ out: 0, low: 1, ok: 2 })[b.state] || a.part.localeCompare(b.part));
  const live = assets.filter(a => a.state !== 'Planned');
  /* racks: type, purchase date and condition (GPU / liquid / storage racks are never the old shallow type) */
  const deep = new Set(nes.filter(n => n.role === 'GPU' || n.role === 'Storage').map(n => n.rackId));
  const racks = rackVintage(dc, now, rk => deep.has(rk.id));
  return {
    dcId: dc.id, assets, rmas, spares, racks,
    totals: { devices: live.length, covered: live.filter(a => a.state === 'Covered').length, expiring: live.filter(a => a.state === 'Expiring').length, outOfWarranty: live.filter(a => a.state === 'Out of warranty').length,
      endOfSupport: live.filter(a => a.state === 'End of support').length, tenant: live.filter(a => a.state === 'Tenant-owned').length, openRma: rmas.filter(r => r.status !== 'Replaced · verifying').length, sparesLow: spares.filter(s => s.state !== 'ok').length,
      oldRacks: racks.filter(r => r.old).length, damagedRacks: racks.filter(r => r.condition === 'Damaged').length }
  };
}
