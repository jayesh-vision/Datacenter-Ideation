// Planner (P2B port) governance flow on a seeded plan: submit → decide each step (switching to a role holder) → execute → Delivery.
// usage: node .qa/p2b-flow.mjs [persona] [geo] [PLN id]
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'us', ID = process.argv[4] ?? 'PLN-0004';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const body = () => p.innerText('.page');
await p.goto(`http://localhost:5181/planning/plans/${ID}?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
const sub = p.getByRole('button', { name: /Submit for review|Resubmit/ });
if (await sub.count()) {
  if (await sub.isDisabled()) { console.log(`  · submit disabled (${await sub.getAttribute('title')})`); } else { await sub.click(); await p.waitForTimeout(900); ok((await body()).includes('In review'), 'submitted → In review'); }
}
for (let i = 0; i < 5; i++) {
  const dec = p.getByRole('button', { name: /^Decide:/ }); if (!(await dec.count())) break;
  await dec.click(); await p.waitForTimeout(500);
  const sw = p.locator('.modal .note button');
  if (await sw.count()) { await sw.first().click(); await p.waitForTimeout(500); }
  const rec = p.locator('.modal').getByRole('button', { name: 'Record decision' });
  ok(await rec.count() === 1, `step ${i + 1}: can record a decision`);
  if (!(await rec.count())) { console.log((await p.locator('.modal').innerText()).slice(0, 300)); break; }
  await rec.click(); await p.waitForTimeout(900);
}
ok((await body()).includes('Approved'), 'approval path complete → Approved');
const run = p.getByRole('button', { name: 'Start the build' });
ok(await run.count() === 1 && !(await run.isDisabled()), 'Start the build enabled');
if (await run.count()) { await run.click(); await p.waitForTimeout(2500); ok((await body()).includes('Executing'), 'executing'); }
await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, '/delivery'); await p.waitForTimeout(1200);
ok((await p.innerText('body')).includes(ID.replace('PLN-', 'PRJ-')), `project ${ID.replace('PLN-', 'PRJ-')} in Delivery`);
await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, '/capacity?tab=reservations'); await p.waitForTimeout(1200);
ok((await p.innerText('body')).includes('Planner hold'), 'planner holds on Capacity');
ok(!errs.length, `no page errors${errs.length ? ': ' + errs[0].slice(0, 200) : ''}`);
await b.close(); console.log(bad ? `${bad} problem(s)` : 'all clear'); process.exit(bad ? 1 : 0);
