// Change management: tabs, change pages, the old ?id= deep link, approve a pending change through its matrix.
// usage: node .qa/changes.mjs [persona] [geo]   (W=1280)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'network', G = process.argv[3] ?? 'in', W = Number(process.env.W ?? 1440);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text()); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const go = async (u) => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(800); };
const check = async (name) => {
  await p.waitForTimeout(300);
  const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.body.innerText.includes(w)));
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  const tblOver = await p.evaluate(() => [...document.querySelectorAll('.dt-scroll')].some(s => s.scrollWidth > s.clientWidth + 2));
  ok(!t.length && !over && !tblOver, `${name}${t.length ? ' TEXT ' + t : ''}${over ? ' PAGE-OVERFLOW' : ''}${tblOver ? ' TABLE-OVERFLOW' : ''}`);
  if (process.env.SHOTS || t.length || over || tblOver) await p.screenshot({ path: `.qa/out/cm-${P}-${W}-${name}.png`, fullPage: true });
};
await p.goto(`http://localhost:5181/changes?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' });
for (const t of ['overview', 'changes', 'approvals', 'calendar', 'freezes', 'standard', 'policies']) { await go(`/changes${t === 'overview' ? '' : `?tab=${t}`}`); await check(t); }
/* every operations change + a delivery CR + a PM window */
await go('/changes?tab=changes&src=Operations'); const ops = (await p.locator('.dt-table tbody tr b.mono').allInnerTexts()).slice(0, 12);
await go('/changes?tab=changes&src=Delivery'); const dl = (await p.locator('.dt-table tbody tr b.mono').allInnerTexts()).slice(0, 2);
await go('/changes?tab=changes&src=Maintenance'); const pm = (await p.locator('.dt-table tbody tr b.mono').allInnerTexts()).slice(0, 1);
for (const id of [...ops, ...dl, ...pm]) for (const t of ['overview', 'approvals', 'checks', 'review', 'history']) { await go(`/changes/${encodeURIComponent(id)}${t === 'overview' ? '' : `?tab=${t}`}`); await check(`${id}-${t}`); }
/* old deep link */
await go(`/changes?id=${ops[0]}`); await p.waitForTimeout(500); ok(p.url().includes(`/changes/${ops[0]}`), 'old ?id= link opens the change page');
/* approve a pending operations change through its matrix */
await go('/changes?tab=approvals'); const pend = (await p.locator('.dt-table tbody tr b.mono').allInnerTexts()).find(x => /^CHG-/.test(x));
if (pend) { await go(`/changes/${pend}`); for (let i = 0; i < 4; i++) { const btn = p.getByRole('button', { name: /^Approve as/ }); if (!(await btn.count()) || await btn.isDisabled()) break; await btn.click(); await p.waitForTimeout(700); }
  const body = await p.innerText('body'); ok(/Approved|Blocked by policy/.test(body), `${pend}: ${/Blocked by policy/.test(body) ? 'blocked by policy (cannot approve)' : 'approved through the matrix'}`); }
await go('/changes?new=change'); ok(await p.locator('.drawer').count() === 1, 'raise-a-change form opens');
console.log(errs.length ? `  ✗ console: ${errs.slice(0, 3).join(' | ')}` : '  ✓ no console errors'); if (errs.length) bad++;
await b.close(); console.log(bad ? `✗ ${bad} problem(s)` : '✓ Change management OK'); process.exit(bad ? 1 : 0);
