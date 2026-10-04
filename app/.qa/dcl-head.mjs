import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [persona, w] of [['network', 1440], ['network', 1280], ['cloud', 1440]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(p => localStorage.setItem('dco.persona', p), persona);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5181/datacenters', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  const m = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth, tiles: document.querySelectorAll('.dco-tile').length, clipped: [...document.querySelectorAll('.dco-tile, .dcl-region')].filter(e => e.scrollWidth > e.clientWidth + 1).length, regionH: [...document.querySelectorAll('.dcl-region')].map(e => Math.round(e.getBoundingClientRect().height)).join('/'), tileH: [...new Set([...document.querySelectorAll('.dco-tile')].map(e => Math.round(e.getBoundingClientRect().height)))].join('/'), nan: (document.body.innerText.match(/NaN|undefined/g) || []).length }));
  console.log(persona, w, JSON.stringify(m), errs.length ? errs[0] : '');
  await p.screenshot({ path: `.qa/out/dcl_${persona}_${w}.png`, clip: { x: 236, y: 60, width: w - 236, height: 560 } });
  if (persona === 'network' && w === 1440) { await p.locator('.dcl-region').first().click(); await p.waitForTimeout(300); console.log(' region click ->', new URL(p.url()).searchParams.get('region')); await p.locator('.dcr-focus').first().click(); await p.waitForTimeout(800); console.log(' focus ->', new URL(p.url()).pathname); }
  await ctx.close();
}
await b.close();
