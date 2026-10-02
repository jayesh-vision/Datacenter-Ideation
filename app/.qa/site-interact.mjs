import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
const ok = (n, c) => console.log(c ? 'PASS' : 'FAIL', n);
await p.goto('http://localhost:5181/datacenters/MH-DC-001', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500); // default tab is the 3D twin
ok('default tab overview', (await p.locator('.pill.is-active').innerText()).startsWith('Overview'));
// header: operations KPIs, discovery moved to the actions menu
ok('header shows 8 operations KPIs', await p.locator('.dch-kpi').count() === 8);
// operations scope: no discovery action, no finance tabs, equipment = installed devices
await p.locator('.dch-actions button[aria-label="Actions"]').click(); ok('no Run discovery action', await p.locator('.menu-item', { hasText: 'Run discovery' }).count() === 0); await p.locator('.dch-actions button[aria-label="Actions"]').click();
ok('no Capex / Opex tabs', await p.locator('.pill', { hasText: /^Capex|^Opex/ }).count() === 0);
const eqCount = Number((await p.locator('.pill', { hasText: 'Equipment' }).locator('.count').innerText()).replace(/,/g, ''));
ok(`equipment tab counts installed devices (${eqCount} of 179)`, eqCount === 131);
await p.locator('.pill', { hasText: 'Attention' }).click(); await p.waitForTimeout(800);
ok('attention has no inventory widgets', await p.locator('text=/Record vs network|Why not discovered|Configuration drift|Commissioning readiness/').count() === 0);
{ const hs = (await p.locator('.panel h3').allInnerTexts()).map(t => t.split('\n')[0]); ok(`attention shows ops panels (${hs.join(', ')})`, ['Open incidents', 'Alarms in datacenter scope', 'Facility', 'Edge links', 'Monitoring gaps', 'Changes & maintenance', 'Operational risks'].every(h => hs.includes(h))); }
await p.locator('.dch-kpi[data-kpi="inc"]').click(); await p.waitForTimeout(800); ok('incidents KPI → incidents for this DC', p.url().includes('/incidents?dc=MH-DC-001'));
await p.goto('http://localhost:5181/datacenters/MH-DC-001?tab=elements&view=unmonitored', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
ok('equipment filter: not monitored', (await p.locator('.dt-count').innerText()).startsWith('Showing 28'));
await p.locator('tbody tr').first().click(); await p.waitForTimeout(300); ok('row → NE', p.url().includes('/ne/'));
await p.goto('http://localhost:5181/datacenters/MH-DC-001?tab=equipment', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
await p.locator('.map-row', { hasText: 'PE-T4-01' }).nth(1).click(); await p.waitForTimeout(700);
ok('core drawer services', (await p.locator('.drawer').innerText()).includes('Services riding the span'));
await p.screenshot({ path: '.qa/out/siteE-drawer.png' });
await p.goto('http://localhost:5181/datacenters/MH-DC-001?tab=timeline', { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
const n0 = await p.locator('.tl li').count(); await p.locator('.tl-filter', { hasText: 'Incidents' }).click(); await p.waitForTimeout(200);
ok('timeline filter', (await p.locator('.tl li').count()) < n0);
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors'); await b.close();
