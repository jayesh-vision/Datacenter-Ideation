/* Access & security audit: the log reconciles with the doors and the totals (npx tsx .qa/access-check.ts [persona] ; GEO=us) */
import * as S from '../src/mock/server';
const personas = process.argv[2] ? [process.argv[2]] : ['network', 'colocation', 'cloud', 'enterprise', 'neocloud'];
let bad = 0; const fail = (m: string) => { bad++; console.log('FAIL', m); };
if (process.env.GEO) S.setGeo(process.env.GEO as 'in' | 'us');
for (const p of personas) {
  S.setPersona(p as never);
  for (const dc of S.datacenters()) {
    const a = S.siteAccess(dc.id), s = S.siteSafety(dc.id);
    if (!a || !s) { fail(`${p} ${dc.id} missing`); continue; }
    for (const d of s.access) {
      const mine = a.events.filter(e => e.doorId === d.id);
      if (mine.length !== d.events24h) fail(`${p} ${dc.id} ${d.name} events ${mine.length} ≠ ${d.events24h}`);
      if (mine.filter(e => e.result === 'Denied').length !== d.denied24h) fail(`${p} ${dc.id} ${d.name} denied`);
    }
    if (a.events.some(e => e.at < a.from || e.at > a.to)) fail(`${p} ${dc.id} event outside window`);
    if (a.totals.denied24h !== s.access.reduce((x, d) => x + d.denied24h, 0)) fail(`${p} ${dc.id} denied total`);
    if (a.totals.onSite !== Object.values(a.totals.onSiteByType).reduce((x, n) => x + (n ?? 0), 0)) fail(`${p} ${dc.id} on site by type`);
    if (a.hourly.reduce((x, h) => x + h.denied, 0) !== a.totals.denied24h) fail(`${p} ${dc.id} hourly denied`);
    if (a.hourly.reduce((x, h) => x + h.in, 0) !== a.totals.entries24h) fail(`${p} ${dc.id} hourly in`);
    if (new Set(a.events.map(e => e.id)).size !== a.events.length) fail(`${p} ${dc.id} duplicate event ids`);
    if (JSON.stringify(a).match(/NaN|undefined/)) fail(`${p} ${dc.id} NaN/undefined`);
    for (const v of a.visits) if (v.onSite && v.exited) fail(`${p} ${dc.id} ${v.id} on site but exited`);
  }
  const all = S.datacenters().map(d => S.siteAccess(d.id)!);
  console.log(p, 'sites', all.length, 'on site', all.reduce((x, a) => x + a.totals.onSite, 0), 'events', all.reduce((x, a) => x + a.events.length, 0), 'exceptions', all.reduce((x, a) => x + a.exceptions.length, 0), 'open', all.reduce((x, a) => x + a.totals.open, 0));
}
console.log(bad ? `${bad} failures` : 'access-check OK');
process.exit(bad ? 1 : 0);
