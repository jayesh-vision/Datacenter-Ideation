// Planner (P2B port): every plan × every tab (incl. the plan type's own tabs) — page errors, NaN/undefined, page overflow.
// usage: node .qa/p2b-plans.mjs [persona] [geo] [PLN-…]   (SHOTS=1 for screenshots)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'us', only = process.argv[4], W = Number(process.env.W ?? 1440);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text().slice(0, 300)); });
let bad = 0, n = 0;
const go = async u => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(700); };
await p.goto(`http://localhost:5181/planning/plans?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
const ids = only ? [only] : Array.from({ length: 15 }, (_, i) => `PLN-${String(i + 1).padStart(4, '0')}`);
for (const id of ids) {
  await go(`/planning/plans/${id}`);
  const tabs = await p.locator('.tabs [role=tab], .tabs button').evaluateAll(els => els.map(e => e.getAttribute('data-id') ?? e.textContent.trim()));
  const keys = await p.evaluate(() => [...document.querySelectorAll('.tabs button, .tabs [role=tab]')].map(b => b.textContent.trim()));
  for (let i = 0; i < keys.length; i++) {
    errs.length = 0;
    await p.locator('.tabs button, .tabs [role=tab]').nth(i).click(); await p.waitForTimeout(500);
    const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.querySelector('.page')?.innerText.includes(w)));
    const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    n++;
    if (t.length || over || errs.length) { bad++; console.log(`  ✗ ${id} ${keys[i]}${t.length ? ' TEXT ' + t : ''}${over ? ' OVERFLOW' : ''}${errs.length ? ' ERR ' + errs.slice(0, 2).join(' | ') : ''}`); await p.screenshot({ path: `.qa/out/plan-${id}-${keys[i].replace(/\W+/g, '_')}.png`, fullPage: true }); }
    else if (process.env.SHOTS) await p.screenshot({ path: `.qa/out/plan-${id}-${keys[i].replace(/\W+/g, '_')}.png`, fullPage: true });
  }
  void tabs;
}
await b.close();
console.log(`${n} plan tabs checked · ${bad ? `${bad} problem(s)` : 'all clear'}`); process.exit(bad ? 1 : 0);
