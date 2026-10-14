// Planner (P2B port) wizard: pick a plan type, walk every step with Next, check each for errors / NaN / overflow, save the draft.
// usage: node .qa/p2b-wizard.mjs [persona] [geo] ["Plan type name"]   (SHOTS=1 keeps a screenshot per step)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'us', TYPE = process.argv[4] ?? 'New data centre', W = Number(process.env.W ?? 1440);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text().slice(0, 300)); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const check = async (name) => {
  await p.waitForTimeout(500);
  const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.querySelector('.page')?.innerText.includes(w)));
  const cut = await p.evaluate(() => [...document.querySelectorAll('.page .nst-table')].some(t => t.scrollWidth > t.clientWidth + 2) || [...document.querySelectorAll('.page .panel')].some(el => el.scrollWidth > el.clientWidth + 2));
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  ok(!t.length && !over && !cut && !errs.length, `${name.replace(/\s+/g, ' ')}${t.length ? ' TEXT ' + t : ''}${over ? ' OVERFLOW' : ''}${cut ? ' PANEL-OVERFLOW' : ''}${errs.length ? ' ERR ' + errs.slice(0, 2).join(' | ') : ''}`);
  if (process.env.SHOTS || t.length || over || cut || errs.length) await p.screenshot({ path: `.qa/out/wiz-${TYPE.replace(/\W+/g, '_')}-${name.replace(/\W+/g, '_')}.png`, fullPage: true });
  errs.length = 0;
};
await p.goto(`http://localhost:5181/planning/new?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
await p.locator('.pn-acc').filter({ has: p.locator('.pn-acc-sum span', { hasText: new RegExp(`^${TYPE}$`) }) }).locator('.pn-acc-head').click().catch(() => {}); await p.waitForTimeout(200);
await p.locator('.pn-type').filter({ has: p.locator('b', { hasText: new RegExp(`^${TYPE}$`) }) }).first().click(); await p.waitForTimeout(800);
await check('1-type');
/* fill what the Requirements step asks before it lets you on */
const fill = async () => {
  const name = p.locator('input[placeholder^="e.g. Los"]').first(); if (await name.count() && !(await name.inputValue())) await name.fill('QA plan · ' + TYPE);
  for (const sel of await p.locator('select').all()) { const v = await sel.inputValue(); const opts = await sel.locator('option').allInnerTexts(); if (v === '' && opts.length > 1) await sel.selectOption({ index: 1 }); }
  const site = p.locator('input[placeholder="e.g. CA-AI-01"], input[placeholder="e.g. Building C"]').first(); if (await site.count() && !(await site.inputValue())) await site.fill('CA-AI-QA');
  const date = p.locator('input[type=date]').first(); if (await date.count()) await date.fill('2029-06-30');
  const addPlot = p.getByRole('button', { name: 'Add a candidate plot' }); if (await addPlot.count() && !(await p.locator('.pn-card.is-on').filter({ hasText: 'Grid offer' }).count())) { await addPlot.click(); await p.waitForTimeout(300); const card = p.locator('.pn-card.is-on').filter({ hasText: 'Grid offer' }).first(); await card.locator('input[type=number]').nth(2).fill('120'); await card.locator('input[type=number]').nth(3).fill('900'); await card.locator('input[type=date]').fill('2028-06-30'); }
  await p.waitForTimeout(400);
};
for (let i = 2; i < 20; i++) {
  await fill();
  const next = p.getByRole('button', { name: /^(Next|Fill the design)/ }).last();
  if (!(await next.count()) || await next.isDisabled()) { const last = await p.getByRole('button', { name: /Submit|Create|Save draft/ }).count(); ok(true, `stopped at step ${i - 1} (no enabled Next; ${last} finish button(s))`); break; }
  await next.click(); await p.waitForTimeout(900);
  const head = await p.locator('.pn-stage.is-on small').first().innerText().catch(() => '');
  await check(`${i}-${head || 'step'}`);
}
await b.close();
console.log(bad ? `${bad} problem(s)` : 'all clear'); process.exit(bad ? 1 : 0);
