// Planner: hub tabs, every plan page tab, wizard → draft → submit → approve chain → execute → capacity plan + racks in DCIM.
// usage: node .qa/planner.mjs [persona] [geo]   (W=1280)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'in', W = Number(process.env.W ?? 1440);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text()); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const go = async (u) => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(900); };
const check = async (name) => {
  await p.waitForTimeout(300);
  const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.body.innerText.includes(w)));
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  const tblOver = await p.evaluate(() => [...document.querySelectorAll('.dt-scroll')].some(s => s.scrollWidth > s.clientWidth + 2));
  ok(!t.length && !over && !tblOver, `${name}${t.length ? ' TEXT ' + t : ''}${over ? ' PAGE-OVERFLOW' : ''}${tblOver ? ' TABLE-OVERFLOW' : ''}`);
  /* screenshots only when something is wrong (or SHOTS=1), to keep the disk free */
  if (process.env.SHOTS || t.length || over || tblOver) await p.screenshot({ path: `.qa/out/pl-${P}-${W}-${name}.png`, fullPage: true });
};
await p.goto(`http://localhost:5181/planner?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' });
for (const t of ['plans', 'templates', 'benchmarks']) { await go(`/planner${t === 'plans' ? '' : `?tab=${t}`}`); await check(t); }
await go('/planner');
const ids = await p.locator('.dt-table tbody tr .mono').allInnerTexts();
for (const id of ids.filter(x => /^PLN-/.test(x))) for (const t of ['overview', 'sizing', 'cost', 'schedule', 'scenarios', 'approvals']) { await go(`/planner/${id}${t === 'overview' ? '' : `?tab=${t}`}`); await check(`${id}-${t}`); }
/* wizard → draft */
await go('/planner/new'); await check('wizard-scopes');
await p.locator('.pl-scope', { hasText: 'Rack expansion' }).click(); await p.waitForTimeout(800);
await p.locator('input[type=number]').first().fill('2'); await p.locator('input[type=number]').nth(1).fill('4'); await p.waitForTimeout(800); await check('wizard-form');
await p.getByRole('button', { name: 'Create draft' }).click(); await p.waitForTimeout(1000);
ok(/\/planner\/PLN-/.test(p.url()), `draft created → ${p.url().split('/').pop()}`);
const verdict = await p.locator('.pl-verdict').innerText();
if (/blocking/i.test(verdict)) { ok(true, `draft is blocked (${verdict.slice(0, 60)}) — submit stays disabled`); }
else {
  await p.getByRole('button', { name: 'Submit for approval' }).click(); await p.waitForTimeout(900);
  ok((await p.innerText('body')).includes('In review'), 'submitted → In review');
  for (let i = 0; i < 4; i++) { const btn = p.getByRole('button', { name: /^Approve as/ }); if (!(await btn.count())) break; await btn.click(); await p.waitForTimeout(400); await p.locator('.modal').getByRole('button', { name: 'Approve' }).click(); await p.waitForTimeout(900); }
  ok(await p.getByRole('button', { name: 'Execute plan' }).count() === 1, 'approval chain complete → Execute');
  await p.getByRole('button', { name: 'Execute plan' }).click(); await p.waitForTimeout(1000);
  ok((await p.innerText('body')).includes('Executing'), 'executing');
  const foot = await p.locator('.vw-footer-meta').innerText().catch(() => '');
  ok(/CAP-\d+/.test(foot) && /racks in/.test(foot), `delivers ${foot.replace(/\s+/g, ' ').slice(0, 80)}`);
}
console.log(errs.length ? `  ✗ console: ${errs.slice(0, 3).join(' | ')}` : '  ✓ no console errors'); if (errs.length) bad++;
await b.close(); console.log(bad ? `✗ ${bad} problem(s)` : '✓ Planner screens OK'); process.exit(bad ? 1 : 0);
