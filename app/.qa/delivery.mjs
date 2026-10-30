// Delivery: hub tabs, every project page tab, and the flow approve → execute → receive POs → work orders → L1–L5 → handover.
// usage: node .qa/delivery.mjs [persona] [geo]   (W=1280)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'in', W = Number(process.env.W ?? 1440);
const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text()); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const go = async (u) => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(800); };
const check = async (name) => {
  await p.waitForTimeout(300);
  const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.body.innerText.includes(w)));
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  const tblOver = await p.evaluate(() => [...document.querySelectorAll('.dt-scroll')].some(s => s.scrollWidth > s.clientWidth + 2));
  ok(!t.length && !over && !tblOver, `${name}${t.length ? ' TEXT ' + t : ''}${over ? ' PAGE-OVERFLOW' : ''}${tblOver ? ' TABLE-OVERFLOW' : ''}`);
  /* screenshots only when something is wrong (or SHOTS=1), to keep the disk free */
  if (process.env.SHOTS || t.length || over || tblOver) await p.screenshot({ path: `.qa/out/dl-${P}-${W}-${name}.png`, fullPage: true });
};
await p.goto(`http://localhost:5181/delivery?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' });
for (const t of ['overview', 'projects', 'workorders', 'commissioning', 'permits', 'design', 'todo']) { await go(`/delivery${t === 'overview' ? '' : `?tab=${t}`}`); await check(t); }
await go('/delivery?tab=projects');
const ids = (await p.locator('.dt-table tbody tr .mono').allInnerTexts()).filter(x => /^PRJ-/.test(x));
for (const id of ids) for (const t of ['milestones', 'workorders', 'procurement', 'commissioning', 'permits', 'history']) { await go(`/delivery/projects/${id}${t === 'milestones' ? '' : `?tab=${t}`}`); await check(`${id}-${t}`); }
/* flow: the approved plan → execute → project in progress */
/* the planner moved to /planning (13-Oct-2026) and "Execute plan" became "Start the build" (hands the plan to Delivery) */
await go('/planning?tab=plans&status=Approved'); const approved = (await p.locator('.dt-table tbody tr .mono').allInnerTexts()).filter(x => /^PLN-/.test(x));
/* the hall fit-out has field work (work orders); the list is sorted newest first, so pick it rather than the first row */
const pl = approved.find(x => x === 'PLN-0002') ?? approved[0];
if (pl) {
  await go(`/planning/plans/${pl}`); await p.getByRole('button', { name: 'Start the build' }).click(); await p.waitForTimeout(2500);
  const prj = pl.replace('PLN-', 'PRJ-');
  await go(`/delivery/projects/${prj}?tab=procurement`);
  ok((await p.innerText('body')).includes('In progress'), `${prj} in progress after execute`);
  while (await p.getByRole('button', { name: 'Receive' }).count()) { await p.getByRole('button', { name: 'Receive' }).first().click(); await p.waitForTimeout(500); }
  ok(!(await p.getByRole('button', { name: 'Receive' }).count()), 'every PO received');
  await go(`/delivery/projects/${prj}?tab=workorders`);
  for (let i = 0; i < 20; i++) { const btn = p.locator('.dt-table tbody tr button', { hasText: /Start|Complete/ }); if (!(await btn.count())) break; await btn.first().click(); await p.waitForTimeout(500); }
  const states = await p.locator('.dt-table tbody tr').allInnerTexts();
  ok(states.every(s => /Done/.test(s)) || states.some(s => /Planned/.test(s)), `work orders advanced (${states.filter(s => /Done/.test(s)).length}/${states.length} done)`);
  for (let l = 1; l <= 5; l++) { const btn = p.getByRole('button', { name: new RegExp(`Run L${l} test`) }); if (!(await btn.count())) break; await btn.click(); await p.waitForTimeout(600); }
  const ho = p.getByRole('button', { name: 'Hand over to operations' });
  if (await ho.count()) { await ho.click(); await p.waitForTimeout(800); ok((await p.innerText('body')).includes('Delivered'), 'handed over → Delivered');
    await go(`/planning/plans/${pl}`); ok((await p.innerText('.page')).includes('Completed'), 'planner plan completed by the handover'); }
  else ok(states.some(s => /Planned/.test(s)), 'handover waits for planned work orders (dates ahead)');
} else ok(true, 'no approved plan in this persona');
console.log(errs.length ? `  ✗ console: ${errs.slice(0, 3).join(' | ')}` : '  ✓ no console errors'); if (errs.length) bad++;
await b.close(); console.log(bad ? `✗ ${bad} problem(s)` : '✓ Delivery screens OK'); process.exit(bad ? 1 : 0);
