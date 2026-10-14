/* Physical access & security audit (14-Oct-2026, user: "add entry/exit inside the datacenter … the security audit").
   A read model derived per site from the access points safety.ts builds (mantrap, room doors, tenant cage doors), the people
   of this geography, the site's changes and tenants. It produces the last 24 h of badge events as an access-control system
   (Lenel / Genetec / Honeywell style) would export them: every entry and exit, every denial and its reason, the visit it
   belongs to (who, which company, on whose authority, escorted by whom) and the exceptions a security team audits
   (tailgating, forced or held doors, anti-passback, repeated denials, after-hours entry, unescorted visitors, overstays,
   visitor badges not returned). It writes each door's events24h / denied24h / last, so Facilities → Environment and this
   tab show the same numbers. It raises no alarms; nothing generated changes, so every fingerprint holds. */
import type { AccessEvent, AccessPersonType, AccessPoint, AccessReview, AccessVisit, Datacenter, SecException, SiteAccess } from '../api/types';
import type { Db } from './generate';
import { mulberry32, seedOf, intBetween, pick, chance, type Rnd } from '../lib/rng';
import { activeGeo } from './geo';
import { DAY, HOUR, MIN } from './seed';

const cache = new Map<string, SiteAccess>();
export function clearAccess() { cache.clear(); }
export const accessOf = (dcId: string) => cache.get(dcId) ?? null;
export const setAccess = (dcId: string, a: SiteAccess) => { cache.set(dcId, a); };

/* first / last names for people who are not on the operator's roster (contractors, visitors, tenants, couriers) */
const NAMES = {
  in: { first: ['Arjun', 'Kavita', 'Rahul', 'Sneha', 'Imran', 'Pooja', 'Vikram', 'Neha', 'Sanjay', 'Divya', 'Manoj', 'Ritu', 'Faisal', 'Anil', 'Meera', 'Karthik', 'Swati', 'Deepak', 'Harish', 'Lakshmi'],
    last: ['Sharma', 'Iyer', 'Khan', 'Patil', 'Reddy', 'Nair', 'Gupta', 'Das', 'Joshi', 'Menon', 'Singh', 'Rao', 'Kulkarni', 'Bose', 'Pillai', 'Shetty'] },
  us: { first: ['Jason', 'Megan', 'Carlos', 'Ashley', 'Ryan', 'Nicole', 'Kevin', 'Brittany', 'Andre', 'Hannah', 'Tyler', 'Jessica', 'Omar', 'Lauren', 'Derek', 'Priya', 'Sean', 'Rachel', 'Victor', 'Amanda'],
    last: ['Garcia', 'Nguyen', 'Thompson', 'Ramirez', 'Hughes', 'Foster', 'Coleman', 'Price', 'Russell', 'Ward', 'Bailey', 'Rivera', 'Hayes', 'Murphy', 'Sanders', 'Bryant'] }
};
const FIRMS = {
  in: { guards: 'Raksha Security Services', electrical: 'Sterling & Wilson', mechanical: 'Blue Star', ups: 'Vertiv service', dg: 'Cummins service', courier: ['Blue Dart', 'Delhivery'], cleaning: 'Spotless Facility Services' },
  us: { guards: 'Patriot Guard Services', electrical: 'Rosendin Electric', mechanical: 'Southland Industries', ups: 'Vertiv service', dg: 'Cummins service', courier: ['FedEx', 'UPS Freight'], cleaning: 'Brightline Facility Services' }
};

export function buildAccess(db: Db, dc: Datacenter, doors: AccessPoint[]): SiteAccess {
  const now = db.now, from = now - DAY, live = dc.status !== 'planned';
  const geo = activeGeo().id === 'us' ? 'us' : 'in';
  const roster = activeGeo().people, firms = FIRMS[geo], names = NAMES[geo];
  const rr = mulberry32(seedOf(`${dc.id}:access`));
  const used = new Set<string>(roster);
  const newName = (r: Rnd) => { for (let i = 0; i < 40; i++) { const n = `${pick(r, names.first)} ${pick(r, names.last)}`; if (!used.has(n)) { used.add(n); return n; } } return `${pick(r, names.first)} ${pick(r, names.last)}`; };
  const midnight = (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const at = (day: number, h: number, m = 0) => midnight + day * DAY + h * HOUR + m * MIN;
  const siteNo = dc.id.replace(/\D/g, '').slice(-3);

  const entry = doors.find(d => d.kind === 'Building entry')!;
  const roomDoors = doors.filter(d => d.kind !== 'Building entry' && d.kind !== 'Cage door');
  const halls = roomDoors.filter(d => d.kind === 'Data hall door' || d.kind === 'Meet-me room door');
  const plantRooms = roomDoors.filter(d => d.kind === 'Plant room door');
  /* sites whose plant sits outside the listed rooms: the audited "restricted" doors are the halls */
  const plant = plantRooms.length ? plantRooms : roomDoors.slice(-2);
  const cages = doors.filter(d => d.kind === 'Cage door');
  const doorOfZone = (zone: string) => roomDoors.find(d => d.zone === zone);

  const visits: AccessVisit[] = [], events: AccessEvent[] = [], exceptions: SecException[] = [];
  let badgeSeq = 0;
  const badgeFor = (type: AccessPersonType) => type === 'Visitor' ? `V-${siteNo}-${String(++badgeSeq).padStart(3, '0')}` : type === 'Contractor' || type === 'Delivery' ? `C-${siteNo}${String(++badgeSeq).padStart(3, '0')}` : `E-${String(seedOf(`${dc.id}:${badgeSeq++}`) % 90000 + 10000)}`;
  const ev = (v: AccessVisit | null, door: AccessPoint, t: number, dir: 'In' | 'Out', extra: Partial<AccessEvent> = {}, who?: { person: string; company: string; type: AccessPersonType; badge: string }) => {
    if (t < from || t >= now) return;
    const p = v ?? who!;
    events.push({ id: '', dcId: dc.id, at: t, doorId: door.id, door: door.name, zone: door.zone, dir, ...(v ? { visitId: v.id, ref: v.ref } : {}), person: p.person, company: p.company, type: p.type, badge: p.badge, method: door.reader, result: 'Granted', ...extra });
  };
  /* one visit = mantrap in → for each zone: door in … door out → mantrap out (cage doors are card-in only, like most cage readers) */
  const visit = (r: Rnd, o: { person: string; company: string; type: AccessPersonType; purpose: string; start: number; end: number; zones: AccessPoint[]; ref?: string; host?: string; escort?: string; badgeKind?: AccessVisit['badgeKind'] }) => {
    if (o.start > now || o.end < from) return null;
    const onSite = o.end > now;
    const v: AccessVisit = { id: `${dc.id}-VIS-${String(visits.length + 1).padStart(3, '0')}`, dcId: dc.id, person: o.person, company: o.company, type: o.type, badge: badgeFor(o.type),
      badgeKind: o.badgeKind ?? (o.type === 'Visitor' ? 'Visitor' : o.type === 'Contractor' || o.type === 'Delivery' ? 'Contractor' : 'Permanent'), purpose: o.purpose,
      ...(o.ref ? { ref: o.ref } : {}), ...(o.host ? { host: o.host } : {}), ...(o.escort ? { escort: o.escort } : {}), entered: o.start, ...(onSite ? {} : { exited: o.end }), zones: o.zones.map(z => z.zone), onSite, where: 'Lobby' };
    visits.push(v);
    ev(v, entry, o.start, 'In');
    const span = o.end - o.start, n = o.zones.length;
    o.zones.forEach((z, i) => {
      const a = o.start + (span * i) / n + intBetween(r, 4, 12) * MIN, b = o.start + (span * (i + 1)) / n - intBetween(r, 4, 12) * MIN;
      ev(v, z, a, 'In');
      if (z.kind !== 'Cage door') ev(v, z, b, 'Out');
      if (a <= now) v.where = z.zone;
      if (b <= now && i === n - 1) v.where = 'Lobby';
    });
    ev(v, entry, o.end, 'Out');
    return v;
  };

  if (live) {
    /* security guards: two per 12 h shift (07:00 / 19:00), patrolling the halls and plant rooms */
    const guards = [newName(rr), newName(rr), newName(rr), newName(rr)];
    [[-1, 7], [-1, 19], [0, 7], [0, 19]].forEach(([d, h], k) => {
      const pair = k % 2 ? guards.slice(2) : guards.slice(0, 2);
      pair.forEach((g, j) => visit(rr, { person: g, company: firms.guards, type: 'Security', purpose: `${h === 7 ? 'Day' : 'Night'} shift · patrol`, start: at(d, h, -intBetween(rr, 5, 15)), end: at(d, h + 12, intBetween(rr, 5, 20)),
        zones: j ? [...plant].slice(0, 3) : halls.slice(0, 3) }));
    });
    /* operator staff: field technicians on 12 h shifts and the site engineers on days */
    const staff = roster.slice().sort((a, b) => seedOf(`${dc.id}:${a}`) - seedOf(`${dc.id}:${b}`));
    const techs = staff.slice(0, 4), engineers = staff.slice(4, 4 + Math.min(5, 2 + Math.round(dc.racks.length / 60)));
    [[-1, 8], [-1, 20], [0, 8], [0, 20]].forEach(([d, h], k) => {
      const t = techs[k % 4];
      visit(rr, { person: t, company: 'Site operations', type: 'Staff', purpose: `Field technician · ${h === 8 ? 'day' : 'night'} shift`, start: at(d, h, -intBetween(rr, 2, 20)), end: at(d, h + 12, intBetween(rr, 0, 25)),
        zones: [pick(rr, halls), ...(chance(rr, 0.6) ? [pick(rr, halls)] : []), ...(plant.length && chance(rr, 0.5) ? [pick(rr, plant)] : [])].filter((z, i, a) => z && a.indexOf(z) === i) });
    });
    engineers.forEach(e => [-1, 0].forEach(d => visit(rr, { person: e, company: 'Site operations', type: 'Staff', purpose: 'Site engineer', start: at(d, 8, intBetween(rr, 30, 75)), end: at(d, 17, intBetween(rr, 15, 80)),
      zones: [pick(rr, halls), ...(plant.length ? [pick(rr, plant)] : [])].filter((z, i, a) => z && a.indexOf(z) === i) })));

    /* contractors working a change: a crew of two, escorted by a site engineer, in the room the change touches */
    const zoneOf = (title: string, scope: string[]) => {
      const unit = dc.cooling.units.find(u => title.includes(u.name)); if (unit) { const d = doorOfZone(unit.zone); if (d) return d; }
      const ne = scope.map(id => db.neById.get(id)).find(Boolean); const rk = ne && dc.racks.find(r => r.id === ne.rackId);
      if (rk) { const d = doorOfZone(`${rk.floor} · ${rk.room}`); if (d) return d; }
      return /power|ups|feed|dg|generator|battery|ats/i.test(title) && plant.length ? plant[0] : halls[0];
    };
    const crewOf = (title: string) => /ups|battery/i.test(title) ? firms.ups : /dg|generator/i.test(title) ? firms.dg : /power|feed|ats|electrical/i.test(title) ? firms.electrical : /cool|crah|crac|chiller|cdu/i.test(title) ? firms.mechanical : 'Network field services';
    const overstay = chance(rr, 0.35);
    db.changes.filter(c => c.dcId === dc.id && ['In progress', 'Completed', 'Approved'].includes(c.status) && c.windowStart < now && c.windowEnd > from - 2 * HOUR).forEach((c, k) => {
      const z = zoneOf(c.title, c.scope), co = crewOf(c.title), esc = engineers[k % Math.max(1, engineers.length)] ?? techs[0];
      const end = c.status === 'In progress' ? Math.max(c.windowEnd, now + HOUR) : c.windowEnd + (overstay && k === 0 ? intBetween(rr, 70, 110) : intBetween(rr, 10, 30)) * MIN;
      const crew = [newName(rr), newName(rr)];
      const vs = crew.map(p => visit(rr, { person: p, company: co, type: 'Contractor', purpose: c.title, ref: c.id, escort: esc, host: esc, start: c.windowStart - intBetween(rr, 20, 40) * MIN, end, zones: [z] }));
      if (overstay && k === 0 && vs[0] && c.status === 'Completed' && end <= now)
        exceptions.push({ id: '', dcId: dc.id, at: c.windowEnd + 60 * MIN, kind: 'Overstay', severity: 'Low', status: 'Closed', doorId: z.id, door: z.name, person: crew[0], company: co, ref: c.id, owner: esc,
          detail: `Crew stayed ${Math.round((end - c.windowEnd) / MIN)} min after the ${c.id} window closed`, outcome: 'Rollback check ran long; site engineer confirmed and extended the escort' });
    });
    /* hands on site for an open incident: the on-call field technician / facility engineer badges in after the alarm */
    db.incidents.filter(i => i.dcId === dc.id && !['Resolved', 'Closed'].includes(i.status) && ['Power', 'Cooling', 'Rack', 'Network', 'GPU'].includes(i.type) && i.detected > from - 6 * HOUR).forEach((inc, k) => {
      const facility = inc.type === 'Power' || inc.type === 'Cooling';
      const z = facility && plantRooms.length ? plantRooms[0] : zoneOf(inc.title, inc.affected.filter(a => a.kind === 'NE').map(a => a.id));
      const who = staff[(9 + k) % staff.length];
      visit(rr, { person: who, company: 'Site operations', type: 'Staff', purpose: `${facility ? 'Facility engineer' : 'Field technician'} · responding to ${inc.id}`, ref: inc.id, badgeKind: 'Permanent',
        start: Math.max(inc.detected + intBetween(rr, 18, 40) * MIN, from + 10 * MIN), end: inc.status === 'Mitigated' ? Math.min(now - 20 * MIN, inc.detected + 4 * HOUR) : now + 2 * HOUR, zones: [z] });
    });
    /* a planned-maintenance vendor visit and couriers at the loading bay */
    if (plant.length && chance(rr, 0.7)) visit(rr, { person: newName(rr), company: pick(rr, [firms.ups, firms.dg]), type: 'Contractor', purpose: 'Planned maintenance · quarterly service', ref: `PM-${siteNo}-${intBetween(rr, 100, 499)}`, escort: engineers[0], host: engineers[0], start: at(0, 9, intBetween(rr, 0, 40)), end: at(0, 12, intBetween(rr, 0, 50)), zones: [pick(rr, plant)] });
    for (let i = 0, n = intBetween(rr, 1, 3); i < n; i++) {
      const start = at(i % 2 ? -1 : 0, intBetween(rr, 10, 16), intBetween(rr, 0, 50));
      visit(rr, { person: newName(rr), company: pick(rr, firms.courier), type: 'Delivery', purpose: pick(rr, ['Spares delivery (RMA)', 'Optics delivery', 'Consumables']), host: techs[0], start, end: start + intBetween(rr, 12, 25) * MIN, zones: [] });
    }
    visits.filter(v => v.type === 'Delivery' && v.onSite).forEach(v => { v.where = 'Loading bay'; });
    visit(rr, { person: newName(rr), company: firms.cleaning, type: 'Contractor', purpose: 'Cleaning · white space', host: techs[0], escort: techs[0], start: at(0, 6, intBetween(rr, 0, 30)), end: at(0, 9, intBetween(rr, 0, 30)), zones: halls.slice(0, 2) });

    /* visitors: a customer audit or a site tour, hosted and escorted by a site engineer */
    const custs = db.customers.filter(c => c.premium);
    const vn = chance(rr, 0.75) ? intBetween(rr, 1, 3) : 0;
    const unescorted = chance(rr, 0.2);
    for (let i = 0; i < vn; i++) {
      const cust = pick(rr, custs.length ? custs : db.customers), host = engineers[i % Math.max(1, engineers.length)] ?? techs[0];
      const d = chance(rr, 0.5) ? 0 : -1, start = at(d, intBetween(rr, 10, 14), intBetween(rr, 0, 45));
      const v = visit(rr, { person: newName(rr), company: cust.name, type: 'Visitor', purpose: pick(rr, ['Customer audit', 'Site tour', 'Compliance walk-through', 'Capacity review']), host, escort: host, start, end: start + intBetween(rr, 70, 150) * MIN, zones: [pick(rr, halls)] });
      if (v && i === 0 && unescorted && v.exited) {
        const gap = intBetween(rr, 8, 25);
        exceptions.push({ id: '', dcId: dc.id, at: v.exited - (gap + 6) * MIN, kind: 'Unescorted visitor', severity: 'Medium', status: v.exited > now - 6 * HOUR ? 'Under review' : 'Closed', doorId: entry.id, door: entry.name, person: v.person, company: v.company, owner: host,
          detail: `Escort ${host} badged out ${gap} min before the visitor`, evidence: `CCTV ${siteNo}-LOBBY-02`, ...(v.exited > now - 6 * HOUR ? {} : { outcome: 'Visitor was waiting in the lobby; host reminded of the escort rule' }) });
      }
      if (v && i === 0 && chance(rr, 0.25) && v.exited) exceptions.push({ id: '', dcId: dc.id, at: v.exited + 15 * MIN, kind: 'Badge not returned', severity: 'Low', status: 'Open', doorId: entry.id, door: entry.name, person: v.person, company: v.company, owner: host,
        detail: `Visitor badge ${v.badge} not handed back at the security desk; badge disabled`, ref: v.badge });
    }
    /* tenants (colocation): cage visits */
    cages.forEach(cg => { if (!chance(rr, 0.4)) return; const d = chance(rr, 0.5) ? 0 : -1, start = at(d, intBetween(rr, 9, 17), intBetween(rr, 0, 50));
      visit(rr, { person: newName(rr), company: cg.name.replace('Cage · ', ''), type: 'Tenant', purpose: pick(rr, ['Cage work · server install', 'Cage work · cabling', 'Hardware swap']), host: techs[0], start, end: start + intBetween(rr, 45, 240) * MIN, zones: [doorOfZone(cg.zone) ?? halls[0], cg] }); });

    /* denials: wrong zone, expired badge, PIN / biometric mismatch, anti-passback */
    const ppl = visits.filter(v => v.type !== 'Security');
    doors.forEach(dr => {
      const dr2 = mulberry32(seedOf(`${dc.id}:deny:${dr.id}`));
      if (!chance(dr2, dr.kind === 'Building entry' ? 0.6 : 0.25)) return;
      for (let i = 0, n = intBetween(dr2, 1, 3); i < n; i++) {
        const v = pick(dr2, ppl.length ? ppl : visits); if (!v) return;
        const t = Math.min(now - MIN, Math.max(from + HOUR, v.entered + intBetween(dr2, 10, 120) * MIN));
        const reason = dr.kind === 'Building entry' ? pick(dr2, ['Badge expired', 'Anti-passback: no exit recorded', 'Biometric mismatch']) : dr.kind === 'Cage door' ? pick(dr2, ['Wrong PIN', 'Not on cage access list']) : dr.kind === 'Plant room door' ? pick(dr2, ['Not authorised for zone', 'Wrong PIN']) : pick(dr2, ['Not authorised for zone', 'Biometric mismatch']);
        ev(v, dr, t, 'In', { result: 'Denied', reason });
        if (reason.startsWith('Anti-passback')) exceptions.push({ id: '', dcId: dc.id, at: t, kind: 'Anti-passback', severity: 'Low', status: 'Closed', doorId: dr.id, door: dr.name, person: v.person, company: v.company, owner: guards[0],
          detail: 'Badge refused: the system saw no exit for the previous entry', outcome: 'Previous exit was through the fire door during the drill; guard reset the badge' });
      }
    });
    /* repeated denials: one person tries a door they are not cleared for three times within minutes */
    const target = plant[0] ?? halls[halls.length - 1];
    const vis = visits.find(v => v.type === 'Visitor' || v.type === 'Contractor');
    if (target && vis && chance(rr, 0.35)) {
      const t0 = Math.min(now - 30 * MIN, vis.entered + 35 * MIN);
      if (t0 > from) {
        [0, 2, 4].forEach(m => ev(vis, target, t0 + m * MIN, 'In', { result: 'Denied', reason: 'Not authorised for zone' }));
        exceptions.push({ id: '', dcId: dc.id, at: t0 + 4 * MIN, kind: 'Repeated denials', severity: 'Medium', status: now - t0 < 4 * HOUR ? 'Open' : 'Closed', doorId: target.id, door: target.name, person: vis.person, company: vis.company, owner: guards[2] ?? guards[0],
          detail: `3 refused attempts in 4 min at ${target.name} (${vis.type.toLowerCase()} badge not cleared for this zone)`, evidence: `CCTV ${siteNo}-${target.id.slice(-4)}`, ...(now - t0 < 4 * HOUR ? {} : { outcome: 'Wrong door: was looking for the hall; escort briefed' }) });
      }
    }
    /* tailgating at the mantrap (two people on one badge) */
    const cv = visits.filter(v => v.type === 'Contractor' && v.entered > from);
    if (cv.length && chance(rr, 0.4)) {
      const v = pick(rr, cv), recent = now - v.entered < 8 * HOUR;
      exceptions.push({ id: '', dcId: dc.id, at: v.entered, kind: 'Tailgating', severity: 'High', status: recent ? 'Under review' : 'Closed', doorId: entry.id, door: entry.name, person: v.person, company: v.company, ref: v.ref, owner: guards[0],
        detail: 'Mantrap weight / occupancy sensor counted 2 people on one badge', evidence: `CCTV ${siteNo}-MANTRAP-01`, ...(recent ? {} : { outcome: 'Second person was the escorted colleague; badged retroactively, crew briefed' }) });
    }
    /* a forced door (alarm on a door opened without a valid badge) */
    if (plant.length && chance(rr, 0.15)) {
      const t = at(0, 2, intBetween(rr, 0, 50)) > now ? at(-1, 2, intBetween(rr, 0, 50)) : at(0, 2, intBetween(rr, 0, 50)), d = plant[plant.length - 1];
      exceptions.push({ id: '', dcId: dc.id, at: t, kind: 'Door forced', severity: 'High', status: 'Closed', doorId: d.id, door: d.name, owner: guards[2] ?? guards[0],
        detail: 'Door contact opened without a badge read', evidence: `CCTV ${siteNo}-${d.id.slice(-4)}`, outcome: 'Guard on site in 4 min; DG technician used the mechanical override key, key log updated' });
    }
    /* after-hours entry to a plant room with no approved change */
    if (plant.length && chance(rr, 0.2)) {
      const t = at(0, 1, intBetween(rr, 0, 59)) > now ? at(-1, 23, intBetween(rr, 0, 30)) : at(0, 1, intBetween(rr, 0, 59)), d = pick(rr, plant), who = techs[1];
      if (t > from) {
        ev(null, d, t, 'In', {}, { person: who, company: 'Site operations', type: 'Staff', badge: `E-${String(seedOf(who) % 90000 + 10000)}` });
        ev(null, d, t + intBetween(rr, 10, 25) * MIN, 'Out', {}, { person: who, company: 'Site operations', type: 'Staff', badge: `E-${String(seedOf(who) % 90000 + 10000)}` });
        exceptions.push({ id: '', dcId: dc.id, at: t, kind: 'After-hours entry', severity: 'Medium', status: 'Under review', doorId: d.id, door: d.name, person: who, company: 'Site operations', owner: engineers[0] ?? techs[0],
          detail: `Entry to ${d.name} between 22:00 and 06:00 with no approved change or ticket`, evidence: `CCTV ${siteNo}-${d.id.slice(-4)}` });
      }
    }
  }
  /* doors held open for an approved maintenance window (safety.ts marks them) */
  doors.filter(d => d.state === 'Held open').forEach(d => exceptions.push({ id: '', dcId: dc.id, at: d.last.at, kind: 'Door held open', severity: 'Low', status: 'Open', doorId: d.id, door: d.name, person: d.last.who, owner: d.last.who,
    detail: d.note ?? 'Door propped open', ref: d.note?.match(/CHG-\d+/)?.[0], evidence: 'Guard posted at the door' }));

  events.sort((a, b) => b.at - a.at).forEach((e, i) => { e.id = `${dc.id}-EV-${String(events.length - i).padStart(4, '0')}`; });
  exceptions.sort((a, b) => b.at - a.at).forEach((x, i) => { x.id = `SEC-${siteNo}-${String(exceptions.length - i).padStart(3, '0')}`; });

  /* the doors' own 24 h counts and last read come from this log */
  doors.forEach(d => {
    const mine = events.filter(e => e.doorId === d.id);
    d.events24h = mine.length; d.denied24h = mine.filter(e => e.result === 'Denied').length;
    const last = mine[0];
    if (last && d.state !== 'Held open') d.last = { at: last.at, who: last.type === 'Tenant' ? `${last.company} badge` : last.person, ok: last.result === 'Granted' };
  });

  const hourly = Array.from({ length: 24 }, (_, i) => { const t0 = from + i * HOUR; const es = events.filter(e => e.doorId === entry.id && e.at >= t0 && e.at < t0 + HOUR);
    return { at: t0, in: es.filter(e => e.dir === 'In' && e.result === 'Granted').length, out: es.filter(e => e.dir === 'Out').length, denied: events.filter(e => e.result === 'Denied' && e.at >= t0 && e.at < t0 + HOUR).length }; });

  const onSite = visits.filter(v => v.onSite);
  const byType: Partial<Record<AccessPersonType, number>> = {};
  onSite.forEach(v => { byType[v.type] = (byType[v.type] ?? 0) + 1; });
  const entryEv = events.filter(e => e.doorId === entry.id);
  const denied = events.filter(e => e.result === 'Denied');
  const v24 = visits.filter(v => v.type === 'Visitor' && v.entered >= from);
  const totals: SiteAccess['totals'] = {
    onSite: onSite.length, onSiteByType: byType, entries24h: entryEv.filter(e => e.dir === 'In' && e.result === 'Granted').length, exits24h: entryEv.filter(e => e.dir === 'Out').length,
    denied24h: denied.length, deniedDoors: new Set(denied.map(e => e.doorId)).size, events24h: events.length,
    open: exceptions.filter(x => x.status !== 'Closed').length, high: exceptions.filter(x => x.status !== 'Closed' && x.severity === 'High').length,
    visitors24h: v24.length, unescorted: exceptions.filter(x => x.kind === 'Unescorted visitor').length, doors: doors.length, secured: doors.filter(d => d.state === 'Secured').length, heldOpen: doors.filter(d => d.state === 'Held open').length
  };
  return { dcId: dc.id, live, from, to: now, visits, events, exceptions, doors, review: review(dc, live, rr, now, roster), hourly, totals };
}

/* the quarterly access-rights recertification an auditor asks for (ISO 27001 A.5.18 / SOC 2 CC6.2 / TIA-942 physical security) */
function review(dc: Datacenter, live: boolean, r: Rnd, now: number, roster: string[]): AccessReview {
  const staff = live ? intBetween(r, 18, 30) + Math.round(dc.racks.length / 25) : 4;
  const byType: AccessReview['byType'] = [
    { type: 'Staff', n: staff }, { type: 'Security', n: live ? intBetween(r, 8, 12) : 2 }, { type: 'Contractor', n: live ? intBetween(r, 10, 26) : 6 },
    ...(dc.racks.some(x => x.owner === 'tenant') ? [{ type: 'Tenant' as AccessPersonType, n: intBetween(r, 20, 45) }] : [])
  ];
  const badges = byType.reduce((a, b) => a + b.n, 0);
  const unused90 = live ? intBetween(r, 0, 6) : 0, expiredActive = live && chance(r, 0.35) ? intBetween(r, 1, 3) : 0;
  const lastReview = now - intBetween(r, 20, 110) * DAY, nextReview = lastReview + 91 * DAY;
  const findings: AccessReview['findings'] = [];
  findings.push(nextReview < now ? { text: `Quarterly access review overdue by ${Math.round((now - nextReview) / DAY)} days`, tone: 'bad' } : (() => { const d = Math.round((nextReview - now) / DAY); return d <= 14 ? { text: `Quarterly access review due ${d < 1 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}`, tone: 'warn' as const } : { text: `Quarterly access review done; next due in ${d} days`, tone: 'ok' as const }; })());
  findings.push(expiredActive ? { text: `${expiredActive} contractor badge${expiredActive === 1 ? '' : 's'} still active after the contract ended`, tone: 'bad' } : { text: 'No contractor badge outlives its contract', tone: 'ok' });
  findings.push(unused90 ? { text: `${unused90} badge${unused90 === 1 ? '' : 's'} not used for 90 days (candidates to revoke)`, tone: 'warn' } : { text: 'Every active badge used in the last 90 days', tone: 'ok' });
  findings.push({ text: 'Plant rooms and meet-me rooms: two-factor readers (card + PIN / biometric)', tone: 'ok' });
  return { badges, byType, unused90, expiredActive, lastReview, nextReview, reviewer: roster[seedOf(dc.id) % roster.length], cctvDays: 90, logDays: 365, findings };
}
