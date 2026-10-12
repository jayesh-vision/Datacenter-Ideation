/* Physical last-mile model reconciles with the estate (mock/physical.ts).
   usage: npx tsx .qa/physical-check.ts [persona…]   (GEO=us for the USA) */
import * as S from '../src/mock/server';
import { dcAt } from '../src/mock/geo';
const personas = (process.argv.slice(2).length ? process.argv.slice(2) : ['network', 'colocation', 'cloud', 'enterprise', 'neocloud']) as any[];
if (process.env.GEO === 'us') S.setGeo('us');
let bad = 0;
const fail = (m: string) => { bad++; console.log('  ✗', m); };
for (const p of personas) {
  S.setPersona(p);
  const db: any = S.raw();
  const t0 = Date.now();
  let spofs = 0, paths = 0, pathBad = 0;
  const kinds: Record<string, number> = {};
  for (const dc of db.datacenters) {
    const s = S.sitePhysical(dc.id)!;
    /* power: Σ PDU load = rack draw; every installed device has cords */
    for (const rk of dc.racks) {
      const kw = s.pdus.filter(x => x.rackId === rk.id).reduce((a, x) => a + x.loadKw, 0);
      if (Math.abs(kw - rk.drawKw) > 0.25 + rk.drawKw * 0.02) fail(`${rk.id} PDU load ${kw.toFixed(1)} ≠ rack draw ${rk.drawKw}`);
    }
    for (const n of db.nes.filter((n: any) => n.dcId === dc.id && !(n.discovery === 'not-discovered' && n.ndReason === 'planned')))
      if (!s.cords.some(c => c.neId === n.id)) fail(`${n.id} has no power cord`);
    /* outlets unique per PDU */
    const seen = new Set<string>();
    for (const c of s.cords) { const k = `${c.pduId}:${c.outlet}`; if (seen.has(k)) fail(`outlet reused ${k}`); seen.add(k); }
    /* cabling: every LLDP link end in this site has a path */
    const lldp = db.links.filter((l: any) => l.protocol === 'LLDP' && db.neById.get(l.aNe).dcId === dc.id);
    for (const l of lldp) { const cp = S.cablePath(l.id); paths++; if (!cp) { fail(`no path ${l.id}`); continue; } kinds[cp.kind] = (kinds[cp.kind] ?? 0) + 1; if (cp.state !== 'ok') pathBad++; if (l.state === 'down' && cp.state === 'ok') fail(`${l.id} down but path clean`); }
    /* panels never over-filled */
    for (const pp of s.panels) if (pp.used > pp.ports) fail(`${pp.id} ${pp.used}/${pp.ports}`);
    for (const x of s.pdus) for (const b of x.banks) if (b.loadA > b.breakerA) fail(`${b.id} ${b.loadA} A on a ${b.breakerA} A breaker`);
    spofs += s.spofs.length;
  }
  /* stories */
  const d1 = dcAt(1), s1 = S.sitePhysical(d1)!;
  const hero = S.heroNeId();
  const x3 = db.links.find((l: any) => l.protocol === 'LLDP' && ((l.aNe === hero && l.aIf === 'xe-0/0/3') || (l.zNe === hero && l.zIf === 'xe-0/0/3')));
  const cp3 = x3 && S.cablePath(x3.id);
  if (!cp3 || cp3.kind !== 'inter-site' || cp3.suspect === null || !/core 7/.test(JSON.stringify(cp3.hops))) fail(`hero xe-0/0/3 path: ${cp3?.kind} suspect ${cp3?.suspect} core7 ${/core 7/.test(JSON.stringify(cp3?.hops))}`);
  const lost = db.alerts.find((a: any) => a.title === 'Host Power Lost');
  if (lost) { const dp = S.devicePhysical(lost.neId)!; if (dp.verdict.state !== 'bad' || !dp.power.some(x => x.cord.outlet === 14 && x.cord.state === 'no-power')) fail(`host power lost story ${dp.verdict.text}`); }
  const trip = db.alerts.find((a: any) => /PDU-A Breaker Trip/.test(a.title));
  if (trip) { const x = s1.pdus.find(q => q.rackId === trip.rackId && q.side === 'A')!; if (x.state !== 'tripped') fail('PDU-A trip story'); if (!s1.spofs.some(q => q.id.endsWith('SPOF-TRIP'))) fail('trip spof'); }
  const s9 = S.sitePhysical(dcAt(9))!;
  if (!s9.pdus.some(q => q.state === 'on-battery' && q.side === 'A') || s9.pdus.some(q => q.state === 'on-battery' && q.side === 'B')) fail('UPS-2 on battery should be the A side only');
  const s3 = S.sitePhysical(dcAt(3))!;
  const wi = S.whatIf(d1, db.datacenters.find((d: any) => d.id === d1).power.ups[0].id)!;
  console.log(`${p.padEnd(10)} ${Date.now() - t0} ms · paths ${paths} ${JSON.stringify(kinds)} · not clean ${pathBad} · SPOFs ${spofs} · DC3 zones ${s3.zones.map(z => z.state).join(',')} · whatIf UPS-1 @${d1}: ${wi.text}`);
}
console.log(bad ? `${bad} problem(s)` : 'physical model reconciles');
process.exit(bad ? 1 : 0);
