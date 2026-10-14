/* Environment & safety (Phase 2, 12-Oct-2026, user): fire detection and suppression per room, leak-detection rope under
   cooling units and liquid racks, and physical access points with their last 24 h. A read model derived per site from the
   rooms, cooling units, CDUs, tenants and changes; it raises no alarms of its own, so the alarm counts everywhere stay as they are.
   What it does show is the latent risk an operator cares about: inspections due or overdue, an agent below its refill level,
   a door held open for an approved maintenance window. */
import type { AccessPoint, Datacenter, FireZone, LeakZone, PhysState, SiteSafety } from '../api/types';
import type { Db } from './generate';
import { mulberry32, seedOf, intBetween, between, pick, chance } from '../lib/rng';
import { activeGeo } from './geo';
import { DAY, HOUR, MIN } from './seed';
import { buildAccess, clearAccess, setAccess } from './access';

const cache = new Map<string, SiteSafety>();
let cacheDb: Db | null = null;
export function clearSafety() { cache.clear(); cacheDb = null; clearAccess(); }

export function siteSafety(db: Db, dcId: string): SiteSafety | null {
  if (cacheDb !== db) { cache.clear(); clearAccess(); cacheDb = db; }
  const hit = cache.get(dcId); if (hit) return hit;
  const dc = db.datacenters.find(d => d.id === dcId); if (!dc) return null;
  const s = build(db, dc); cache.set(dcId, s); return s;
}


function build(db: Db, dc: Datacenter): SiteSafety {
  const now = db.now, planned = dc.status === 'planned';
  const people = activeGeo().people;
  const zones = dc.floors.flatMap(f => f.rooms.map(rm => ({ floor: f.name, room: rm, key: `${f.name} · ${rm}` })));
  /* a quarterly fire inspection that is already booked (a Maintenance change) counts as scheduled, not overdue */
  const fireChange = db.changes.find(c => c.dcId === dc.id && /fire/i.test(c.title));
  const inProgress = db.changes.filter(c => c.dcId === dc.id && c.status === 'In progress');

  const fire: FireZone[] = zones.map((z, i) => {
    const rr = mulberry32(seedOf(`${dc.id}:fire:${z.key}`));
    const gas = !/plant|ups|battery|noc/i.test(z.room);
    const last = now - intBetween(rr, 10, 96) * DAY;
    const next = last + 91 * DAY;
    const agent = gas ? intBetween(rr, 96, 100) : 100;
    const f: FireZone = {
      id: `${dc.id}-FZ-${String(i + 1).padStart(2, '0')}`, dcId: dc.id, zone: z.key, detection: gas ? 'VESDA aspirating' : 'Point smoke + heat', detector: 'Normal',
      obscurationPct: gas ? Math.round(between(rr, 0.002, 0.012) * 1000) / 1000 : 0, suppression: gas ? (chance(rr, 0.7) ? 'Novec 1230 gas' : 'Inert gas (IG-541)') : 'Pre-action sprinkler',
      agentPct: agent, release: planned ? 'Manual only' : 'Armed (auto)', lastInspection: last, nextInspection: next, state: 'ok'
    };
    if (planned) { f.state = 'off'; f.note = 'Site not handed over: release set to manual'; return f; }
    /* one gas cylinder bank per estate-ish below the 95% refill line; overdue inspections where nothing is booked */
    if (gas && chance(rr, 0.06)) { f.agentPct = intBetween(rr, 88, 94); f.state = 'warn'; f.note = `Agent at ${f.agentPct}% of fill (refill below 95%)`; }
    if (next < now) { f.state = fireChange ? 'ok' : 'warn'; f.note = fireChange ? `Inspection booked: ${fireChange.id}` : `Quarterly inspection overdue by ${Math.round((now - next) / DAY)} days`; }
    return f;
  });

  /* leak rope: under every room's cooling units, and along liquid-cooled rows / CDU manifolds */
  const leak: LeakZone[] = [];
  const cdus = db.gpu?.cdus.filter(c => c.dcId === dc.id) ?? [];
  zones.forEach(z => {
    const units = dc.cooling.units.filter(u => u.zone === z.key && u.type !== 'CDU');
    const rr = mulberry32(seedOf(`${dc.id}:leak:${z.key}`));
    if (units.length) leak.push({ id: `${dc.id}-LK-${String(leak.length + 1).padStart(2, '0')}`, dcId: dc.id, zone: z.key, covers: `Under ${units.map(u => u.name).join(', ')}`, lengthM: units.length * intBetween(rr, 6, 10), state: 'Dry', lastTest: now - intBetween(rr, 15, 170) * DAY });
    const liquid = dc.racks.filter(r => r.liquid && r.floor === z.floor && r.room === z.room);
    const zc = cdus.filter(c => c.room === z.key);
    if (liquid.length || zc.length) leak.push({ id: `${dc.id}-LK-${String(leak.length + 1).padStart(2, '0')}`, dcId: dc.id, zone: z.key, covers: `${zc.length ? `${zc.map(c => c.name).join(', ')} manifold · ` : ''}${liquid.length} liquid rack${liquid.length === 1 ? '' : 's'}`, lengthM: 4 + liquid.length * 3, state: 'Dry', lastTest: now - intBetween(rr, 10, 90) * DAY });
  });

  /* access control: the building entry, one door per room, cage doors for tenant cabinets */
  const access: AccessPoint[] = [];
  const tenants = [...new Set(dc.racks.filter(r => r.owner === 'tenant' && r.tenantId).map(r => r.tenantId!))];
  const mk = (name: string, zone: string, kind: AccessPoint['kind'], reader: AccessPoint['reader'], busy: number, tenantId?: string) => {
    const rr = mulberry32(seedOf(`${dc.id}:door:${name}`));
    const cust = tenantId ? db.customers.find(c => c.id === tenantId) : undefined;
    const ev = planned ? 0 : intBetween(rr, Math.round(busy * 0.6), busy);
    const den = planned ? 0 : chance(rr, 0.25) ? intBetween(rr, 1, 3) : 0;
    access.push({ id: `${dc.id}-DR-${String(access.length + 1).padStart(2, '0')}`, dcId: dc.id, name, zone, kind, reader, state: 'Secured', events24h: ev, denied24h: den,
      last: { at: now - intBetween(rr, 2, 240) * MIN, who: cust ? `${cust.name} badge` : pick(rr, people), ok: !(den && chance(rr, 0.3)) }, ...(tenantId ? { tenantId } : {}) });
  };
  mk('Main entrance · mantrap', 'Ground · Lobby', 'Building entry', 'Card + biometric', 160);
  zones.forEach(z => mk(`${z.room} door`, z.key, /plant|ups|battery/i.test(z.room) ? 'Plant room door' : /meet|mmr/i.test(z.room) ? 'Meet-me room door' : 'Data hall door', /plant|ups|battery/i.test(z.room) ? 'Card + PIN' : 'Card + biometric', 40));
  tenants.slice(0, 12).forEach(t => { const rk = dc.racks.find(r => r.tenantId === t)!; mk(`Cage · ${db.customers.find(c => c.id === t)?.name ?? t}`, `${rk.floor} · ${rk.room}`, 'Cage door', 'Card + PIN', 12, t); });
  /* a maintenance window in progress: the room's door is propped open under that change */
  for (const c of inProgress) {
    const unit = dc.cooling.units.find(u => c.title.includes(u.name));
    const door = unit && access.find(a => a.zone === unit.zone && a.kind !== 'Cage door');
    if (door) { door.state = 'Held open'; door.note = `Held open for ${c.id} (${c.title}) · approved, escorted`; door.last = { at: c.windowStart + 12 * MIN, who: c.requester, ok: true }; }
  }
  /* the 24 h counts and last read of every door come from the access log (mock/access.ts), so both views agree */
  setAccess(dc.id, buildAccess(db, dc, access));
  void HOUR;
  const st = (x: PhysState) => x;
  return {
    dcId: dc.id, fire, leak, access,
    totals: { fireZones: fire.length, armed: fire.filter(f => f.release === 'Armed (auto)').length, inspectionsDue: fire.filter(f => st(f.state) === 'warn').length, leakZones: leak.length, dry: leak.filter(l => l.state === 'Dry').length,
      doors: access.length, secured: access.filter(a => a.state === 'Secured').length, denied24h: access.reduce((a, x) => a + x.denied24h, 0) }
  };
}
