import { chromium } from 'playwright';
const b = await chromium.launch();
const CASES = [['network', 'MH-DC-001'], ['network', 'DL-DC-009'], ['network', 'MH-DC-003'], ['cloud', 'MH-DC-001']];
for (const w of [1440, 1280]) for (const [persona, dc] of CASES) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } }); await ctx.addInitScript(p => localStorage.setItem('dco.persona', p), persona);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const out = [];
  for (const tab of ['power', 'cooling', 'environment', 'maintenance']) {
    await p.goto(`http://localhost:5181/facilities?dc=${dc}${tab === 'power' ? '' : `&tab=${tab}`}`, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const m = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth, nan: (document.querySelector('.page').innerText.match(/NaN|undefined|Infinity/g) || []).length,
      tiles: [...new Set([...document.querySelectorAll('.dco-tile')].map(t => Math.round(t.getBoundingClientRect().height)))].join('/'), tileOverflow: [...document.querySelectorAll('.dco-detail')].filter(d => d.scrollHeight > d.clientHeight + 1).length,
      ppNodes: document.querySelectorAll('.pp-node').length, ppEdges: document.querySelectorAll('.pp-edge').length, clipped: [...document.querySelectorAll('.pp-node, .rt-step, .cu, .zn, .rk-tile, .lc-stats > div')].filter(e => e.scrollWidth > e.clientWidth + 1).length,
      tblOver: [...document.querySelectorAll('.dt-scroll, .panel-body.is-flush')].filter(s => s.scrollWidth > s.clientWidth + 2).length }));
    out.push(`${tab}:${JSON.stringify(m)}`);
    if (w === 1440) await p.screenshot({ path: `.qa/out/fac_${persona}_${dc}_${tab}.png`, fullPage: true });
    if (w === 1280 && tab === 'power' && dc === 'MH-DC-001' && persona === 'network') await p.screenshot({ path: `.qa/out/fac1280_power.png`, fullPage: true });
  }
  console.log(`\n# ${w} ${persona} ${dc}${errs.length ? ' ERR ' + errs[0] : ''}`); out.forEach(x => console.log(' ', x));
  if (w === 1440 && dc === 'MH-DC-001' && persona === 'network') { await p.goto('http://localhost:5181/facilities?dc=MH-DC-001', { waitUntil: 'load' }); await p.waitForTimeout(1200); await p.hover('.pp-node:has-text("UPS-1")'); await p.waitForTimeout(300); console.log('  hover UPS-1 -> dimmed nodes', await p.locator('.pp-node.is-dim').count(), 'lit edges', await p.locator('.pp-edge.is-lit').count()); await p.locator('.panel:has(.pp)').screenshot({ path: '.qa/out/fac_hover.png' }); }
  await ctx.close();
}
await b.close();
