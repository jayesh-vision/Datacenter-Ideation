/* Planned plant maintenance (Phase 2, 12-Oct-2026, user): the preventive-maintenance plan of every UPS, battery bank, generator,
   cooling unit, CDU, fire system and the LV switchgear / PDUs, with the interval, the last time it was done, when it is due and the
   change that books it. Dates the site record already holds (DG and battery tests, fire inspections) are reused, and a Maintenance
   change that names the asset (DG load-bank test, CRAH-11 compressor, UPS-2 battery string, fire-suppression inspection) marks the
   task scheduled or in progress. The impact line is the what-if of taking that asset out (mock/physical.ts). */
import type { Datacenter, PmState, PmTask } from '../api/types';
import type { Db } from './generate';
import { mulberry32, seedOf, intBetween, chance, pick } from '../lib/rng';
import { activeGeo } from './geo';
import { DAY } from './seed';
import { siteSafety } from './safety';
import { whatIf } from './physical';

const cache = new Map<string, PmTask[]>();
let cacheDb: Db | null = null;
export function clearMaintenance() { cache.clear(); cacheDb = null; }
export function sitePm(db: Db, dcId: string): PmTask[] | null {
  if (cacheDb !== db) { cache.clear(); cacheDb = db; }
  const hit = cache.get(dcId); if (hit) return hit;
  const dc = db.datacenters.find(d => d.id === dcId); if (!dc) return null;
  const s = build(db, dc); cache.set(dcId, s); return s;
}

function build(db: Db, dc: Datacenter): PmTask[] {
  if (dc.status === 'planned') return [];
  const now = db.now, out: PmTask[] = [];
  const people = activeGeo().people;
  const changes = db.changes.filter(c => c.dcId === dc.id && c.kind === 'Maintenance' && c.status !== 'Completed' && c.status !== 'Rolled back');
  const add = (assetId: string, asset: string, kind: PmTask['kind'], task: string, intervalDays: number, lastDone?: number, match?: RegExp) => {
    const r = mulberry32(seedOf(`${dc.id}:pm:${assetId}:${task}`));
    let last = lastDone ?? now - intBetween(r, 5, Math.round(intervalDays * 0.95)) * DAY;
    /* a few tasks slip: done well past their interval */
    if (lastDone === undefined && chance(r, 0.04)) last = now - Math.round(intervalDays * (1.1 + r() * 0.4)) * DAY;
    const nextDue = last + intervalDays * DAY;
    const chg = match ? changes.find(c => match.test(c.title)) : undefined;
    const state: PmState = chg ? (chg.status === 'In progress' ? 'in-progress' : 'scheduled') : nextDue < now ? 'overdue' : nextDue - now < 7 * DAY ? 'due' : nextDue - now < 30 * DAY ? 'upcoming' : 'done';
    out.push({ id: `${dc.id}-PM-${String(out.length + 1).padStart(3, '0')}`, dcId: dc.id, assetId, asset, kind, task: chg ? `${chg.title} (booked in place of: ${task.toLowerCase()})` : task, intervalDays, lastDone: last, nextDue: chg ? chg.windowStart : nextDue, state,
      owner: chg?.requester ?? pick(r, people), ...(chg ? { changeId: chg.id } : {}) });
  };
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const u of dc.power.ups) {
    add(u.id, u.name, 'UPS', 'Quarterly inspection and thermal scan', 91, undefined, new RegExp(`^(?!.*battery).*${esc(u.name)}\\b`, 'i'));
    add(u.id, u.name, 'Battery', 'Battery string impedance test', 182, undefined, new RegExp(`battery.*${esc(u.name)}\\b`, 'i'));
  }
  add(`${dc.id}-DG`, `DG set ${dc.power.dg.kva} kVA`, 'Generator', 'Monthly on-load run', 30, dc.power.dg.lastTest);
  add(`${dc.id}-DG`, `DG set ${dc.power.dg.kva} kVA`, 'Generator', 'Annual load-bank test', 365, undefined, /DG load-bank/i);
  add(`${dc.id}-BATT-01`, 'Battery bank BATT-01', 'Battery', 'Discharge test (−48 V plant)', 182, dc.power.battery.lastTest);
  for (const u of dc.cooling.units) {
    if (u.type === 'CDU') add(u.id, u.name, 'CDU', 'Coolant quality and filter change', 91);
    else add(u.id, u.name, 'Cooling', 'Filter change and coil clean', 91, undefined, new RegExp(`${esc(u.name)}\\b`));
  }
  for (const c of db.gpu?.cdus.filter(x => x.dcId === dc.id) ?? []) if (!dc.cooling.units.some(u => u.id === c.id)) add(c.id, c.name, 'CDU', 'Coolant quality and filter change', 91);
  const saf = siteSafety(db, dc.id)!;
  for (const f of saf.fire) add(f.id, `Fire system · ${f.zone}`, 'Fire', `${f.suppression === 'Pre-action sprinkler' ? 'Sprinkler valve' : 'Gas suppression'} inspection`, 91, f.lastInspection, /fire/i);
  add(`${dc.id}-LV`, 'LV switchboard + ATS', 'Electrical', 'Annual thermography and ATS transfer test', 365);
  add(`${dc.id}-PDU`, `Rack PDUs (${dc.racks.length * 2})`, 'Electrical', 'Annual PDU thermography', 365);

  /* what taking the asset out would do (UPS → its PDUs, cooling unit → its floor) */
  for (const t of out) {
    if (t.kind !== 'UPS' && t.kind !== 'Cooling' && t.kind !== 'Battery') continue;
    const w = whatIf(db, dc.id, t.assetId);
    if (w) t.impact = t.kind === 'Cooling' ? (w.hotRacks.length ? `${w.hotRacks.length} racks lose cooling margin while it is off` : 'Floor keeps its spare while it is off')
      : `${w.singleFed.length} devices on one cord${w.down.length ? `, ${w.down.length} lose power` : ''} while it is in bypass`;
  }
  const rank: Record<PmState, number> = { 'in-progress': 0, overdue: 1, due: 2, scheduled: 3, upcoming: 4, done: 5 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || a.nextDue - b.nextDue);
}
