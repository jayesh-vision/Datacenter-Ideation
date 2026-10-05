import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 1280]) for (const full of [false, true]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5181/', { waitUntil: 'load' }); await p.waitForTimeout(2500);
  if (full) { await p.click('.dcmap-btn[aria-label="Expand map"]'); await p.waitForTimeout(800); }
  const res = [];
  const n = await p.locator('.dcpin').count();
  for (let i = 0; i < n; i += 4) {
    if (await p.locator('.dcpop').count()) { await p.click('.dcpop-x'); await p.waitForTimeout(150); }
    await p.locator('.dcpin').nth(i).click({ force: true }); await p.waitForTimeout(250);
    res.push(await p.evaluate(() => { const c = document.querySelector('.dcpop'), m = document.querySelector('.dcmap'); if (!c) return 'none'; const r = c.getBoundingClientRect(), mr = m.getBoundingClientRect();
      const inside = r.top >= mr.top && r.bottom <= mr.bottom && r.left >= mr.left && r.right <= mr.right;
      const cut = [...c.querySelectorAll('b, span, small, button')].filter(e => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > r.right + 0.5 || e.getBoundingClientRect().bottom > r.bottom + 0.5).map(e => e.textContent.trim());
      const x = c.querySelector('.dcpop-x').getBoundingClientRect(), chip = c.querySelector('.dcpop-chip').getBoundingClientRect();
      const heads = [...document.querySelectorAll('.hero-map-head, .dcmap-fulltitle')].filter(h => getComputedStyle(h).display !== 'none').map(h => h.getBoundingClientRect());
      const overHead = heads.some(h => r.left < h.right && r.right > h.left && r.top < h.bottom && r.bottom > h.top);
      return { id: c.querySelector('.dcpop-id b').textContent, inside, cut, overHead, xOverlapsChip: x.left < chip.right && x.right > chip.left && x.top < chip.bottom && x.bottom > chip.top }; }));
  }
  const bad = res.filter(r => r === 'none' || !r.inside || r.cut.length || r.xOverlapsChip || r.overHead);
  if (w === 1440 && !full) await p.screenshot({ path: '.qa/out/mapcard.png', clip: await p.locator('.hero-map').boundingBox() });
  await p.click('.dcpop-x'); await p.waitForTimeout(200); const closed = await p.locator('.dcpop').count() === 0;
  await p.locator('.dcpin').first().click({ force: true }); await p.waitForTimeout(200); await p.locator('.dcpop-a .nst-btn--filled').click(); await p.waitForTimeout(600);
  console.log(w, full ? 'expanded' : 'normal', `checked ${res.length} sites`, 'problems', JSON.stringify(bad), 'closeBtn', closed, 'nav', new URL(p.url()).pathname, 'errs', errs.length);
  await p.close();
}
await b.close();
