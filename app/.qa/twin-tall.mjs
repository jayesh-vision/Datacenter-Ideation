import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const cases = [['network', 'DL-DC-009'], ['colocation', 'KA-DC-020'], ['cloud', 'TN-DC-022'], ['enterprise', 'HR-DC-011'], ['cloud', 'MH-DC-001']];
for (const [persona, dc] of cases) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(p => { localStorage.setItem('dco.persona', p); localStorage.setItem('dco.site.header', 'compact'); }, persona);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:5181/datacenters/${dc}?tab=overview`, { waitUntil: 'load' });
  await p.waitForSelector('.twin-canvas canvas', { timeout: 20000 }); await p.waitForTimeout(7000);
  const r = await p.evaluate(() => ({ floors: document.querySelectorAll('[data-twin-floor]').length, att: [...document.querySelectorAll('[data-twin-att]')].map(e => e.innerText.replace(/\n/g, ' · ')).slice(0, 5), callouts: document.querySelectorAll('.twin-label.is-att').length, floorAlerts: document.querySelectorAll('.twin-label.is-floor[class*=is-att]').length, over: document.documentElement.scrollWidth > innerWidth }));
  console.log(`\n# ${persona} ${dc}`, JSON.stringify({ floors: r.floors, callouts: r.callouts, floorAlerts: r.floorAlerts, over: r.over, errs: errs.length }));
  r.att.forEach(a => console.log('  att:', a));
  await p.screenshot({ path: `.qa/out/tall_${persona}_${dc}.png`, clip: { x: 240, y: 190, width: 1200, height: 620 } });
  const first = p.locator('[data-twin-att]').first();
  if (await first.count()) { await first.click(); await p.waitForTimeout(2500); console.log('  click first ->', await p.evaluate(() => document.querySelector('[data-twin=panel-path] [aria-current]')?.textContent)); await p.screenshot({ path: `.qa/out/tall_${persona}_${dc}_drill.png`, clip: { x: 240, y: 190, width: 1200, height: 620 } }); }
  if (errs.length) console.log('  ERR', errs.slice(0, 2));
  await ctx.close();
}
await b.close();
