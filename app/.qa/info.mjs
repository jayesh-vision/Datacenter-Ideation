// Info icons (12-Oct-2026): every listed screen has "i" icons; hovering one shows a bubble inside the
// viewport; clicking one that sits inside a link does not navigate. usage: node .qa/info.mjs [persona]
import { chromium } from 'playwright';
const persona = process.argv[2] ?? 'neocloud';
const routes = [
  '/', '/datacenters', '/alerts', '/incidents', '/changes', '/revenue', '/facilities', '/facilities?tab=cooling', '/gpu',
  '/incidents/INC-0002', '/datacenters/MH-DC-001?tab=attention', '/datacenters/MH-DC-001?tab=metrics', '/datacenters/MH-DC-001?tab=details', '/datacenters/MH-DC-001?tab=assets',
  '/datacenters/MH-DC-001?tab=customers', '/datacenters/MH-DC-001?tab=revenue'
];
const b = await chromium.launch();
let bad = 0;
for (const w of [1440, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  for (const r of routes) {
    const url = `http://localhost:5181${r}${r.includes('?') ? '&' : '?'}persona=${persona}`;
    await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
    const n = await p.locator('.info-tip').count();
    const res = { route: r, icons: n, bubbles: 0, offscreen: 0, navigated: false };
    const sample = Math.min(n, 6);
    for (let i = 0; i < sample; i++) {
      const el = p.locator('.info-tip').nth(Math.floor((i * n) / sample));
      await el.scrollIntoViewIfNeeded(); await el.hover(); await p.waitForTimeout(80);
      const pop = p.locator('[data-info-pop]');
      if (await pop.count()) {
        res.bubbles++;
        const bx = await pop.boundingBox();
        if (bx && (bx.x < 0 || bx.y < 0 || bx.x + bx.width > w || bx.y + bx.height > 900)) res.offscreen++;
      }
      await p.mouse.move(0, 0); await p.waitForTimeout(40);
    }
    // click the first icon that sits inside a link: the url must not change
    const inLink = p.locator('a .info-tip').first();
    if (await inLink.count()) { const before = p.url(); await inLink.click(); await p.waitForTimeout(150); res.navigated = p.url() !== before; await p.mouse.move(0, 0); }
    const ok = n > 0 && res.bubbles === sample && !res.offscreen && !res.navigated;
    if (!ok) bad++;
    console.log(w, ok ? 'ok ' : 'BAD', JSON.stringify(res));
  }
  await p.close();
}
await b.close();
console.log(bad ? `${bad} problem(s)` : 'all good');
process.exit(bad ? 1 : 0);
