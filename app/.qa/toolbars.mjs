import { chromium } from 'playwright';
const ROUTES = [['datacenters', '/datacenters'], ['alerts', '/alerts'], ['incidents', '/incidents'], ['changes', '/changes'],
  ['equipment', '/datacenters/MH-DC-001?tab=elements'], ['customers', '/datacenters/MH-DC-001?tab=customers'],
  ['ne-hw', '/ne/MH-DC-001-PE-T4-01', 'Hardware'], ['ne-links', '/ne/MH-DC-001-PE-T4-01', 'Links'], ['ne-impact', '/ne/MH-DC-001-PE-T4-01', 'Impact'], ['customer', '/customers/CUST-1202']];
const b = await chromium.launch();
for (const w of [1440, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem('dco.persona', 'network'); localStorage.setItem('dco.site.header', 'compact'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const out = [];
  for (const [name, r, tab] of ROUTES) {
    await p.goto('http://localhost:5181' + r, { waitUntil: 'load' }); await p.waitForTimeout(1200);
    if (tab) { await p.locator(`[role=tab]:has-text("${tab}")`).first().click(); await p.waitForTimeout(700); }
    const m = await p.evaluate(() => {
      const lt = document.querySelector('.lt'); if (!lt) return { missing: true };
      const box = e => e ? Math.round(e.getBoundingClientRect().left - lt.getBoundingClientRect().left) : null;
      const right = lt.getBoundingClientRect().right;
      const icons = [...lt.querySelectorAll(':scope > .lt-icon, :scope > .lt-menu-wrap')].map(e => Math.round(right - e.getBoundingClientRect().right));
      const ths = [...document.querySelectorAll('.dt-table th')].map(t => getComputedStyle(t).textAlign);
      const tds = [...(document.querySelector('.dt-table tbody tr')?.children ?? [])].map(t => getComputedStyle(t).textAlign);
      return { count: box(lt.querySelector('.lt-count')), search: box(lt.querySelector('.lt-search')), quick: lt.querySelectorAll('.qs').length, iconsFromRight: icons, wraps: lt.getBoundingClientRect().height > 50,
        aligned: [...ths, ...tds].every(a => a === 'left' || a === 'start'), page: document.documentElement.scrollWidth > innerWidth, tableOver: [...document.querySelectorAll('.dt-scroll')].some(s => s.scrollWidth > s.clientWidth + 2) };
    });
    out.push(`${name.padEnd(11)} ${JSON.stringify(m)}`);
    if (w === 1440) await p.screenshot({ path: `.qa/out/tb_${name}.png`, clip: { x: 236, y: 0, width: w - 236, height: 560 } });
  }
  console.log(`\n# ${w}`); out.forEach(x => console.log(x)); if (errs.length) console.log('ERR', errs.slice(0, 3));
  await ctx.close();
}
/* interactions on Alerts: quick select search, filter panel apply/reset */
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:5181/alerts', { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.locator('.lt .qs-btn').first().click(); await p.waitForTimeout(200);
  await p.screenshot({ path: '.qa/out/tb_quick_open.png', clip: { x: 236, y: 240, width: 1204, height: 420 } });
  await p.locator('.qs-list button:has-text("Critical")').click(); await p.waitForTimeout(400);
  console.log('quick sev ->', new URL(p.url()).searchParams.get('sev'), 'shown', await p.locator('.lt-count').textContent());
  await p.click('.lt-icon[aria-label=Filters]'); await p.waitForTimeout(300);
  await p.click('.lt-cats button:has-text("Datacenter")'); await p.click('.lt-field .qs-btn'); await p.waitForTimeout(200);
  await p.fill('.lt-field .qs-search input', 'MH-DC-001'); await p.waitForTimeout(150);
  await p.locator('.lt-field .qs-list button').first().click();
  await p.screenshot({ path: '.qa/out/tb_panel.png', clip: { x: 236, y: 240, width: 1204, height: 460 } });
  await p.click('.lt-panel button:has-text("Apply filters")'); await p.waitForTimeout(600);
  console.log('panel apply ->', new URL(p.url()).search, 'badge', await p.locator('.lt-badge').textContent());
  await p.click('.lt-icon[aria-label=Filters]'); await p.click('.lt-panel button:has-text("Reset to default")'); await p.click('.lt-panel button:has-text("Apply filters")'); await p.waitForTimeout(600);
  console.log('reset ->', new URL(p.url()).search || '(none)', 'badge', await p.locator('.lt-badge').count());
}
await b.close();
