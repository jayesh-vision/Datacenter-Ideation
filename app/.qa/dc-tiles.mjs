import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem('dco.persona', 'network'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5181/datacenters', { waitUntil: 'load' }); await p.waitForTimeout(1400);
  const pos = await p.evaluate(() => { const r = e => Math.round(e.getBoundingClientRect().left); return { filter: r(document.querySelector('.lt-icon[aria-label=Filters]')), view: r(document.querySelector('.lt-view')), rows: document.querySelectorAll('.dt-table tbody tr').length }; });
  await p.click('.lt-view button[aria-label="Tile view"]'); await p.waitForTimeout(500);
  const m = await p.evaluate(() => { const T = [...document.querySelectorAll('.dcl-tiles .cmd-inc')]; const tops = [...new Set(T.map(t => Math.round(t.getBoundingClientRect().top)))]; return { tiles: T.length, perRow: T.filter(t => Math.round(t.getBoundingClientRect().top) === tops[0]).length, heights: [...new Set(T.map(t => Math.round(t.getBoundingClientRect().height)))].join('/'), widths: [...new Set(T.map(t => Math.round(t.getBoundingClientRect().width)))].join('/'), withInc: document.querySelectorAll('.dcl-tiles a[href^="/incidents/"]').length, quiet: T.length - document.querySelectorAll('.dcl-tiles a[href^="/incidents/"]').length, over: document.documentElement.scrollWidth > innerWidth, stored: localStorage.getItem('dco.dcl.layout'), table: document.querySelectorAll('.dt-table').length, clipped: T.filter(t => t.scrollWidth > t.clientWidth + 1).length }; });
  console.log(w, JSON.stringify({ pos, ...m, errs: errs.length }));
  await p.screenshot({ path: `.qa/out/dctiles_${w}.png`, fullPage: true });
  if (w === 1440) {
    await p.locator('.lt .qs-btn').first().click(); await p.locator('.qs-list button:has-text("Facility issue")').click(); await p.waitForTimeout(400);
    console.log(' filter Facility issue ->', await p.locator('.dcl-tiles .cmd-inc').count(), 'tiles ·', await p.locator('.lt-count').textContent());
    await p.fill('.lt-search input', 'zzz'); await p.waitForTimeout(300); console.log(' no match ->', await p.locator('.dcl-tiles-empty').count());
    await p.fill('.lt-search input', ''); await p.goto('http://localhost:5181/datacenters', { waitUntil: 'load' }); await p.waitForTimeout(1200);
    console.log(' after reload still tiles:', await p.locator('.dcl-tiles').count() === 1);
    await p.evaluate(() => window.scrollTo(0, 900)); await p.waitForTimeout(300); console.log(' toolbar pinned at', await p.evaluate(() => Math.round(document.querySelector('.dt > .dt-toolbar').getBoundingClientRect().top)));
    await p.locator('.dcl-tiles .ci-dc').first().click(); await p.waitForTimeout(600); console.log(' header click ->', new URL(p.url()).pathname);
    await p.goBack(); await p.waitForTimeout(800); await p.locator('.dcl-tiles a[href^="/incidents/"]').first().click(); await p.waitForTimeout(600); console.log(' body click ->', new URL(p.url()).pathname);
    await p.goto('http://localhost:5181/datacenters', { waitUntil: 'load' }); await p.waitForTimeout(1000); await p.click('.lt-view button[aria-label="List view"]'); await p.waitForTimeout(300); console.log(' back to list rows:', await p.locator('.dt-table tbody tr').count());
    await p.goto('http://localhost:5181/', { waitUntil: 'load' }); await p.waitForTimeout(1500);
    console.log(' command center cards:', JSON.stringify(await p.evaluate(() => { const T = [...document.querySelectorAll('.cmd-lane .cmd-inc')]; return { n: T.length, h: [...new Set(T.map(t => Math.round(t.getBoundingClientRect().height)))].join('/') }; })));
    await p.locator('.cmd-crit').screenshot({ path: '.qa/out/dctiles_cc.png' });
  }
  await ctx.close();
}
await b.close();
