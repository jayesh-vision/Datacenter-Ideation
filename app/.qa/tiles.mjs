import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } }); await ctx.addInitScript(() => localStorage.setItem('dco.persona', 'network'));
  const p = await ctx.newPage();
  for (const [name, r] of [['datacenters', '/datacenters'], ['alerts', '/alerts'], ['incidents', '/incidents'], ['changes', '/changes']]) {
    await p.goto('http://localhost:5181' + r, { waitUntil: 'load' }); await p.waitForTimeout(1200);
    const m = await p.evaluate(() => { const T = [...document.querySelectorAll('.dco-tile')]; const top = T[0].getBoundingClientRect().top; const rel = (el) => el ? Math.round(el.getBoundingClientRect().top - top) : null;
      return { tileH: [...new Set(T.map(t => Math.round(t.getBoundingClientRect().height)))].join('/'), bar: [...new Set(T.map(t => rel(t.querySelector('.dco-bar, .dco-meter'))))].join('/'), detail: [...new Set(T.map(t => rel(t.querySelector('.dco-detail'))))].join('/'), overflowing: T.filter(t => { const d = t.querySelector('.dco-detail'); return d.scrollHeight > d.clientHeight + 1; }).map(t => t.querySelector('.dco-l').textContent) }; });
    console.log(w, name.padEnd(12), JSON.stringify(m));
    if (w === 1440) await p.screenshot({ path: `.qa/out/tiles_${name}.png`, clip: { x: 236, y: 60, width: w - 236, height: 340 } });
  }
  await ctx.close();
}
await b.close();
