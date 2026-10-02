import { chromium } from 'playwright';
const ROUTES = [['datacenters', '/datacenters'], ['alerts', '/alerts'], ['incidents', '/incidents'], ['changes', '/changes'], ['facilities', '/facilities?dc=MH-DC-001'],
  ['equipment', '/datacenters/MH-DC-001?tab=elements'], ['customers', '/datacenters/MH-DC-001?tab=customers'], ['assets', '/datacenters/MH-DC-001?tab=assets'], ['metrics', '/datacenters/MH-DC-001?tab=metrics'],
  ['attention', '/datacenters/MH-DC-001?tab=attention'], ['ne-hw', '/ne/MH-DC-001-PE-T4-01?tab=hardware'], ['ne-links', '/ne/MH-DC-001-PE-T4-01?tab=links'], ['ne-impact', '/ne/MH-DC-001-PE-T4-01?tab=impact'],
  ['incident', '/incidents/INC-0001'], ['customer', '/customers/CUST-1202']];
const persona = process.argv[2] ?? 'network';
const b = await chromium.launch();
for (const w of [1440, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(p => { localStorage.setItem('dco.persona', p); localStorage.setItem('dco.site.header', 'compact'); }, persona);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const bad = [];
  for (const [name, r] of ROUTES) {
    await p.goto('http://localhost:5181' + r, { waitUntil: 'load' }); await p.waitForTimeout(1300);
    if (r.includes('tab=') && r.startsWith('/ne/')) { const t = new URL('http://x' + r).searchParams.get('tab'); await p.locator(`[role=tab]:has-text("${t === 'hardware' ? 'Hardware' : t === 'links' ? 'Links' : 'Impact'}")`).first().click().catch(() => {}); await p.waitForTimeout(600); }
    const m = await p.evaluate(() => ({
      page: document.documentElement.scrollWidth > innerWidth,
      tables: [...document.querySelectorAll('.dt-scroll')].map(s => s.scrollWidth - s.clientWidth).filter(x => x > 2),
      nst: [...document.querySelectorAll('table.nst-table')].filter(t => t.closest('.dt-scroll') === null && t.scrollWidth > (t.parentElement?.clientWidth ?? 9e9) + 2).length,
      n: document.querySelectorAll('table').length
    }));
    if (m.page || m.tables.length || m.nst) bad.push(`${name}: page=${m.page} tableOverflow=${JSON.stringify(m.tables)} nst=${m.nst}`);
    if (w === 1440 && ['alerts', 'incidents', 'equipment', 'customers', 'datacenters', 'changes'].includes(name)) await p.screenshot({ path: `.qa/out/grid_${persona}_${name}.png`, clip: { x: 0, y: 0, width: w, height: 900 } });
    if (w === 1280 && bad.length && bad[bad.length - 1].startsWith(name)) await p.screenshot({ path: `.qa/out/grid1280_${persona}_${name}.png`, fullPage: false });
  }
  console.log(persona, w, bad.length ? '\n  ' + bad.join('\n  ') : 'all clean', errs.length ? 'ERR ' + errs[0] : '');
  await ctx.close();
}
await b.close();
