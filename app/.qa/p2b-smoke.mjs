// Planner (P2B port) smoke: load each route, report page errors, NaN/undefined text and page overflow; screenshots on failure or SHOTS=1.
// usage: node .qa/p2b-smoke.mjs [persona] [geo] [route…]   (W=1280)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'in', W = Number(process.env.W ?? 1440);
const routes = process.argv.slice(4).length ? process.argv.slice(4) : ['/planning', '/planning/plans', '/planning/templates', '/planning/benchmarks', '/planning/new'];
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text().slice(0, 300)); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
await p.goto(`http://localhost:5181/planning?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' });
for (const r of routes) {
  errs.length = 0;
  await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, r); await p.waitForTimeout(1800);
  const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.body.innerText.includes(w)));
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  const name = r.replace(/[/?=&]/g, '_');
  ok(!t.length && !over && !errs.length, `${r}${t.length ? ' TEXT ' + t : ''}${over ? ' OVERFLOW' : ''}${errs.length ? ' ERR ' + errs.slice(0, 2).join(' | ') : ''}`);
  if (process.env.SHOTS || t.length || over || errs.length) await p.screenshot({ path: `.qa/out/p2b-${P}-${W}${name}.png`, fullPage: true });
}
await b.close();
console.log(bad ? `${bad} problem(s)` : 'all clear');
process.exit(bad ? 1 : 0);
