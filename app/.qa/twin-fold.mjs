import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
for (const w of [1440, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem('dco.persona', 'cloud'); localStorage.setItem('dco.site.header', 'compact'); localStorage.removeItem('dco.twin.folded'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5181/datacenters/MH-DC-001?tab=overview', { waitUntil: 'load' });
  await p.waitForSelector('[data-twin-floor]', { timeout: 20000 }); await p.waitForTimeout(3000);
  await p.click('[data-twin-floor="0"]'); await p.waitForTimeout(1200);
  const rooms = await p.$$eval('[data-twin-room]', es => es.map(e => e.dataset.twinRoom)); await p.click(`[data-twin-room="${rooms[1]}"]`); await p.waitForTimeout(1500);
  const racksTop = async () => Math.round((await p.locator('[data-twin=racks]').boundingBox())?.y ?? -1);
  const before = await racksTop();
  await p.click('.twin-card >> nth=0 >> .twin-fold'); await p.waitForTimeout(200);
  await p.click('.twin-card:has-text("Cooling units") .twin-fold'); await p.waitForTimeout(300);
  const after = await racksTop();
  await p.locator('[data-twin=panel]').screenshot({ path: `.qa/out/fold_${w}.png` });
  // go to another room: folded state persists
  await p.click('[data-twin-crumb=back]'); await p.waitForTimeout(1000); await p.click(`[data-twin-room="${rooms[0]}"]`); await p.waitForTimeout(1500);
  const persisted = await p.evaluate(() => ({ summaryFolded: document.querySelector('.twin-card')?.classList.contains('is-folded'), coolingFolded: [...document.querySelectorAll('.twin-card')].find(c => c.textContent.includes('Cooling units'))?.classList.contains('is-folded'), pathVisible: !!document.querySelector('[data-twin=panel-path]') }));
  console.log(w, JSON.stringify({ racksTopBefore: before, racksTopAfter: after, ...persisted, over: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), errs: errs.length }));
  await ctx.close();
}
await b.close();
