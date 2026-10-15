// Planner family UI (in-site, plant, network): open each demo plan in the wizard and walk every step (family site picker, family
// panels, generic placement / phasing / cut-over panels), then open the plan page and its family tab. Checks errors, NaN / undefined,
// horizontal overflow at W (default 1280).
// usage: node .qa/p2b-families.mjs [persona] [geo] [PLN-0002,PLN-0004,…]   (SHOTS=1 keeps a screenshot per step)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'us', W = Number(process.env.W ?? 1280);
const IDS = (process.argv[4] ?? 'PLN-0002,PLN-0004,PLN-0005,PLN-0008,PLN-0003,PLN-0009').split(',');
const TAB = { 'in-site': 'Site fit', plant: 'Plant', network: 'Paths' };
const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text().slice(0, 300)); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const check = async (name) => {
  await p.waitForTimeout(400);
  const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.querySelector('.page')?.innerText.includes(w)));
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  const cut = await p.evaluate(() => [...document.querySelectorAll('.page .pn-sec-body, .page .panel, .page .pn-tbl')].filter(el => el.scrollWidth > el.clientWidth + 2).map(el => (el.querySelector('thead')?.innerText.replace(/\s+/g, ' ').slice(0, 40)) ?? el.querySelector('h3, .panel-title')?.textContent ?? el.className).slice(0, 2));
  ok(!t.length && !over && !cut.length && !errs.length, `${name}${t.length ? ' TEXT ' + t : ''}${over ? ' OVERFLOW' : ''}${cut.length ? ' SCROLLS ' + cut.join(', ') : ''}${errs.length ? ' ERR ' + errs.slice(0, 2).join(' | ') : ''}`);
  if (process.env.SHOTS || t.length || over || errs.length) await p.screenshot({ path: `.qa/out/fam-${name.replace(/\W+/g, '_')}.png`, fullPage: true });
  errs.length = 0;
};
for (const id of IDS) {
  console.log(id);
  await p.goto(`http://localhost:5181/planning/plans/${id}/edit?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  // walk every step through the stepper (a demo draft may not pass Requirements' checks, so Next is not used): each stage, then each step dot
  const stages = await p.locator('.pn-stages > .pn-stage').count();
  let n = 0;
  for (let g = 0; g < stages; g++) {
    const st = p.locator('.pn-stages > .pn-stage').nth(g);
    if (await st.evaluate(el => el.tagName === 'BUTTON' && !el.disabled)) { await st.click(); await p.waitForTimeout(600); }
    const dots = await p.locator('.pn-stage.is-on .pn-stage-dots button').count();
    for (let k = 0; k < Math.max(1, dots); k++) {
      if (dots) { await p.locator('.pn-stage.is-on .pn-stage-dots button').nth(k).click(); await p.waitForTimeout(600); }
      const head = await p.locator('.pn-stage.is-on small').first().innerText().catch(() => '');
      await check(`${id} ${++n}-${head || 'step'}`);
    }
  }
  await p.goto(`http://localhost:5181/planning/plans/${id}?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  await check(`${id} plan page`);
  for (const label of Object.values(TAB)) {
    const tab = p.locator('.tabs button, [role=tab]').filter({ hasText: new RegExp(`^${label}`) }).first();
    if (await tab.count()) { await tab.click(); await p.waitForTimeout(600); await check(`${id} tab ${label}`); }
  }
}
await b.close();
console.log(bad ? `${bad} problem(s)` : 'all clear'); process.exit(bad ? 1 : 0);
