import { chromium } from 'playwright';
const LISTS = [['datacenters', '/datacenters'], ['alerts', '/alerts'], ['incidents', '/incidents'], ['changes', '/changes'], ['equipment', '/datacenters/MH-DC-001?tab=elements'], ['customers', '/datacenters/MH-DC-001?tab=customers'], ['ne-hw', '/ne/MH-DC-001-PE-T4-01', 'Hardware'], ['customer', '/customers/CUST-1202']];
const b = await chromium.launch();
for (const w of [1440, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem('dco.persona', 'network'); localStorage.setItem('dco.site.header', 'compact'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  for (const [name, r, tab] of LISTS) {
    await p.goto('http://localhost:5181' + r, { waitUntil: 'load' }); await p.waitForTimeout(1200);
    if (tab) { await p.locator(`[role=tab]:has-text("${tab}")`).first().click(); await p.waitForTimeout(600); }
    const align = await p.evaluate(() => { const ys = [...document.querySelectorAll('.dco-tile')].map(t => { const v = t.querySelector(':scope > .dco-split .dco-bar, :scope > .dco-meter'); return v ? Math.round(v.getBoundingClientRect().top) : null; }); return ys.length ? { bars: [...new Set(ys)].join('/') } : {}; });
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6)); await p.waitForTimeout(400);
    const s = await p.evaluate(() => { const tb = document.querySelector('.dt > .dt-toolbar'); const th = document.querySelector('.dt-table thead th'); const top = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--top-h')); return { scrolled: Math.round(scrollY), toolbarTop: tb ? Math.round(tb.getBoundingClientRect().top) : null, headTop: th ? Math.round(th.getBoundingClientRect().top) : null, tbH: tb ? Math.round(tb.getBoundingClientRect().height) : null, topH: top, over: document.documentElement.scrollWidth > innerWidth }; });
    console.log(w, name.padEnd(12), JSON.stringify({ ...align, ...s }));
    if (w === 1440 && ['alerts', 'incidents'].includes(name)) await p.screenshot({ path: `.qa/out/sticky_${name}.png`, clip: { x: 236, y: 0, width: w - 236, height: 300 } });
  }
  if (errs.length) console.log('ERR', errs.slice(0, 2));
  await ctx.close();
}
await b.close();
