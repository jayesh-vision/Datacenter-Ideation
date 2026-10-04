import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem('dco.persona', 'network'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5181/datacenters', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  const folded = await p.evaluate(() => ({ cards: document.querySelectorAll('.dcl-region').length, over: document.documentElement.scrollWidth > innerWidth }));
  await p.screenshot({ path: `.qa/out/dcl2_${w}_folded.png`, clip: { x: 236, y: 60, width: w - 236, height: 470 } });
  await p.click('.dcl-regsec-h'); await p.waitForTimeout(300);
  const open = await p.evaluate(() => ({ cards: document.querySelectorAll('.dcl-region').length, stored: localStorage.getItem('dco.dcl.regions'), over: document.documentElement.scrollWidth > innerWidth, clipped: [...document.querySelectorAll('.dco-tile, .dcl-region, .dcl-regsec-h')].filter(e => e.scrollWidth > e.clientWidth + 1).length }));
  await p.screenshot({ path: `.qa/out/dcl2_${w}_open.png`, clip: { x: 236, y: 60, width: w - 236, height: 700 } });
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1200);
  console.log(w, JSON.stringify({ folded, open, afterReload: await p.locator('.dcl-region').count(), errs: errs.length }));
  await ctx.close();
}
await b.close();
