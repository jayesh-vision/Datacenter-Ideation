import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('dco.persona', 'network'));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  for (const [name, r] of [['datacenters', '/datacenters'], ['alerts', '/alerts'], ['incidents', '/incidents'], ['changes', '/changes']]) {
    await p.goto('http://localhost:5181' + r, { waitUntil: 'load' }); await p.waitForTimeout(1300);
    const m = await p.evaluate(() => ({ tiles: document.querySelectorAll('.dco-tile').length, h: [...new Set([...document.querySelectorAll('.dco-tile')].map(e => Math.round(e.getBoundingClientRect().height)))].join('/'), clipped: [...document.querySelectorAll('.dco-tile')].filter(e => e.scrollWidth > e.clientWidth + 1).length, over: document.documentElement.scrollWidth > innerWidth, nan: (document.querySelector('.dco-card')?.innerText.match(/NaN|undefined|Infinity/g) || []).length }));
    console.log(w, name.padEnd(12), JSON.stringify(m));
    if (w === 1440) await p.screenshot({ path: `.qa/out/an_${name}.png`, clip: { x: 236, y: 60, width: w - 236, height: 400 } });
  }
  if (w === 1440) {
    await p.goto('http://localhost:5181/alerts', { waitUntil: 'load' }); await p.waitForTimeout(1200);
    await p.locator('.dco-pill:has-text("Major")').click(); await p.waitForTimeout(300); console.log(' alerts pill ->', new URL(p.url()).search);
    await p.goto('http://localhost:5181/incidents', { waitUntil: 'load' }); await p.waitForTimeout(1200);
    await p.locator('.dco-tile:has-text("SLA clock")').click(); await p.waitForTimeout(300); console.log(' incidents tile ->', new URL(p.url()).search, await p.locator('.lt-count').textContent());
    await p.goto('http://localhost:5181/changes', { waitUntil: 'load' }); await p.waitForTimeout(1200);
    await p.locator('.dco-tile:has-text("Awaiting approval")').click(); await p.waitForTimeout(300); console.log(' changes tile ->', new URL(p.url()).search, await p.locator('.lt-count').textContent());
  }
  if (errs.length) console.log('ERR', errs.slice(0, 2));
  await ctx.close();
}
await b.close();
