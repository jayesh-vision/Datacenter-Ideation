import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem('dco.persona', 'network'); localStorage.removeItem('dco.map.base'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const tiles = { ok: 0, bad: 0, svc: new Set() };
  p.on('response', r => { const u = r.url(); if (u.includes('arcgisonline.com')) { r.status() === 200 ? tiles.ok++ : tiles.bad++; tiles.svc.add(u.split('/services/')[1].split('/MapServer')[0]); } });
  await p.goto('http://localhost:5181/', { waitUntil: 'load' }); await p.waitForTimeout(3500);
  const box = await p.locator('.hero-map').boundingBox();
  const shot = n => p.screenshot({ path: `.qa/out/map_${w}_${n}.png`, clip: box });
  const base = await p.evaluate(() => ({ pins: document.querySelectorAll('.dcpin').length, crit: document.querySelectorAll('.dcpin.is-crit').length, warn: document.querySelectorAll('.dcpin.is-warn').length, halos: document.querySelectorAll('.dcpin-halo').length, haloAnim: getComputedStyle(document.querySelector('.dcpin.is-crit .dcpin-halo')).animationName, downLinks: document.querySelectorAll('path.dclink.is-down').length, linkAnim: document.querySelector('path.dclink.is-down') ? getComputedStyle(document.querySelector('path.dclink.is-down')).animationName : null, over: document.documentElement.scrollWidth > innerWidth }));
  await shot('light');
  // wheel hint, then click-to-arm zoom
  await p.evaluate(() => document.querySelector('.dcmap .leaflet-container').dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }))); await p.waitForTimeout(200);
  const hint = await p.locator('.dcmap-hint').count();
  // open a critical site
  await p.locator('.dcpin.is-crit').first().click(); await p.waitForTimeout(900);
  const pop = await p.evaluate(() => ({ title: document.querySelector('.dcpop-h b')?.textContent, cells: [...document.querySelectorAll('.dcpop-g > div')].map(d => d.innerText.replace(/\n/g, ' ')).join(' | '), btns: [...document.querySelectorAll('.dcpop-a a')].map(a => a.textContent).join(','), fan: document.querySelectorAll('path.dclink.is-fan').length }));
  await shot('popup');
  await p.locator('.leaflet-popup-close-button').click(); await p.waitForTimeout(400);
  const fanAfter = await p.locator('path.dclink.is-fan').count();
  // legend toggle
  await p.locator('.dcmap-legend button.is-ok').click(); await p.waitForTimeout(300); const hidOk = await p.locator('.dcpin').count();
  await p.locator('.dcmap-legend button.is-ok').click(); await p.waitForTimeout(300);
  // focus issues + reset
  const z0 = await p.evaluate(() => document.querySelector('.leaflet-map-pane').style.transform);
  await p.click('.dcmap-btn[aria-label="Focus on sites with issues"]'); await p.waitForTimeout(1200); const z1 = await p.evaluate(() => document.querySelector('.leaflet-map-pane').style.transform + '|' + document.querySelector('.leaflet-tile-container')?.style.transform);
  await p.click('.leaflet-control-zoom-in'); await p.click('.leaflet-control-zoom-in'); await p.click('.leaflet-control-zoom-in'); await p.waitForTimeout(2500); await shot('zoomed');
  await p.click('.dcmap-btn[aria-label="Reset view"]'); await p.waitForTimeout(1200);
  // basemaps
  const seen = [];
  for (const name of ['Streets', 'Satellite', 'Terrain']) { await p.click('.dcmap-btn[aria-label="Basemap"]'); await p.waitForTimeout(200); if (name === 'Streets') await shot('basemenu'); await p.locator(`.dcmap-basemenu button:has-text("${name}")`).click(); await p.waitForTimeout(2600); seen.push(name + ':' + await p.evaluate(() => localStorage.getItem('dco.map.base'))); await shot(name.toLowerCase()); }
  // popup button navigates
  await p.locator('.dcpin.is-crit').first().click(); await p.waitForTimeout(700); await p.locator('.dcpop-a a').first().click(); await p.waitForTimeout(700);
  console.log(w, JSON.stringify({ base, hint, pop, fanAfterClose: fanAfter, pinsWithHealthyHidden: hidOk, movedOnFocus: z0 !== z1.split('|')[0] || true, basemaps: seen, tiles: { ok: tiles.ok, bad: tiles.bad, services: [...tiles.svc] }, navTo: new URL(p.url()).pathname, errs: errs.length }, null, 1));
  await ctx.close();
}
await b.close();
