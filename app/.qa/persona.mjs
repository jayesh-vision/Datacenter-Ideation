// Persona switch QA: load key screens under each persona, check for errors, overflow, NaN/undefined,
// take screenshots, and exercise the top-bar dropdown once. Run from app/: node <this file>
import { chromium } from 'playwright';




const BASE = 'http://localhost:5181';
const OUT = '.qa/out/persona';
const PERSONAS = ['network', 'colocation', 'cloud', 'enterprise'];
const ROUTES = [
  ['cc', '/'], ['dcs', '/datacenters'], ['assets', '/datacenters/MH-DC-001?tab=assets'], ['customers', '/datacenters/MH-DC-001?tab=customers'],
  ['equipment', '/datacenters/MH-DC-001?tab=elements'], ['topology', '/datacenters/MH-DC-001?tab=topology'], ['metrics', '/datacenters/MH-DC-001?tab=metrics'],
  ['twin', '/datacenters/MH-DC-001?tab=overview'], ['incidents', '/incidents'], ['alerts', '/alerts'], ['facilities', '/facilities?dc=MH-DC-001']
];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const summary = [];
for (const persona of PERSONAS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(p => { try { localStorage.setItem('dco.persona', p); localStorage.setItem('dco.site.header', 'compact'); } catch {} }, persona);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });
  for (const [name, route] of ROUTES) {
    const t0 = Date.now();
    await page.goto(BASE + route, { waitUntil: 'load' });
    await page.waitForTimeout(name === 'twin' ? 4500 : 1400);
    const r = await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        over: document.documentElement.scrollWidth > innerWidth,
        nan: (body.match(/\bNaN\b|undefined|\[object/g) || []).length,
        personaLabel: document.querySelector('.persona-btn b')?.textContent ?? '',
        h1: document.querySelector('h1')?.textContent?.trim().slice(0, 60) ?? '',
        pills: [...document.querySelectorAll('.pill')].map(p => p.childNodes[0].textContent).join('|'),
        rows: document.querySelectorAll('.dt-table tbody tr').length,
        twinRacks: document.querySelectorAll('[data-twin-floor]').length
      };
    });
    const ms = Date.now() - t0;
    summary.push({ persona, name, ms, ...r, errors: errors.length });
    await page.screenshot({ path: `${OUT}_${persona}_${name}.png`, fullPage: name !== 'twin' && name !== 'alerts' && name !== 'incidents' });
  }
  // device pages: first row of the equipment tab + a host/tenant row if present
  await page.goto(BASE + '/datacenters/MH-DC-001?tab=elements', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  const hrefs = await page.$$eval('.dt-table tbody tr a', as => as.map(a => a.getAttribute('href')).filter(Boolean).slice(0, 40));
  const pickNe = hrefs.find(h => /TN-|CMP-|ESX-|GPU-|STO-|SAN-/.test(h)) ?? hrefs[0];
  if (pickNe) {
    await page.goto(BASE + pickNe, { waitUntil: 'load' }); await page.waitForTimeout(1200);
    for (const tab of ['impact', 'hardware']) { await page.locator(`[role=tab]:has-text("${tab === 'impact' ? 'Impact' : 'Hardware'}")`).first().click().catch(() => {}); await page.waitForTimeout(500); }
    const r = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth, nan: (document.body.innerText.match(/\bNaN\b|undefined/g) || []).length, h1: document.querySelector('h1')?.textContent?.trim().slice(0, 50) ?? '' }));
    summary.push({ persona, name: 'ne:' + pickNe.split('/').pop(), ...r, errors: errors.length });
    await page.screenshot({ path: `${OUT}_${persona}_ne.png`, fullPage: true });
  }
  // first open incident
  await page.goto(BASE + '/incidents', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  await page.locator('.dt-table tbody tr').first().click().catch(() => {}); await page.waitForTimeout(1200);
  const inc = await page.evaluate(() => ({ url: location.pathname, over: document.documentElement.scrollWidth > innerWidth, nan: (document.body.innerText.match(/\bNaN\b|undefined/g) || []).length }));
  summary.push({ persona, name: 'incident', ...inc, errors: errors.length });
  await page.screenshot({ path: `${OUT}_${persona}_incident.png`, fullPage: true });
  if (errors.length) console.log(persona, 'ERRORS', [...new Set(errors)].slice(0, 6));
  await ctx.close();
}

// dropdown interaction: network -> cloud -> colocation on the Datacenters list
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('dco.persona', 'network'); } catch {} });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/datacenters', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  const before = await page.evaluate(() => ({ label: document.querySelector('.persona-btn b')?.textContent, svcHeader: [...document.querySelectorAll('.dt-table th')].map(t => t.textContent.trim()).join('|') }));
  await page.click('.persona-btn'); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}_dropdown_open.png`, clip: { x: 240, y: 0, width: 900, height: 360 } });
  const opts = await page.$$eval('.persona-opt', es => es.map(e => e.textContent));
  await page.click('.persona-opt:has-text("Cloud DC")');
  const t0 = Date.now(); await page.waitForFunction(() => document.querySelector('.persona-btn b')?.textContent === 'Cloud DC' && !document.querySelector('.persona-btn:disabled'), null, { timeout: 15000 }); await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({ label: document.querySelector('.persona-btn b')?.textContent, svcHeader: [...document.querySelectorAll('.dt-table th')].map(t => t.textContent.trim()).join('|'), stored: localStorage.getItem('dco.persona') }));
  console.log('dropdown', JSON.stringify({ before, opts: opts.length, after, switchMs: Date.now() - t0, errors }));
  await page.screenshot({ path: `${OUT}_dropdown_after.png`, clip: { x: 240, y: 0, width: 1200, height: 500 } });
  // switch while on a device page -> should land on /datacenters
  await page.goto(BASE + '/ne/MH-DC-001-PE-T4-01', { waitUntil: 'load' }); await page.waitForTimeout(1000);
  await page.click('.persona-btn'); await page.click('.persona-opt:has-text("Colocation")'); await page.waitForTimeout(2500);
  console.log('after switch on device page ->', await page.evaluate(() => location.pathname + ' / ' + document.querySelector('.persona-btn b')?.textContent));
  await ctx.close();
}
await browser.close();
console.table(summary.map(s => ({ persona: s.persona, screen: s.name, ms: s.ms, over: s.over, nan: s.nan, err: s.errors, label: s.personaLabel, rows: s.rows, racks: s.twinRacks, pills: (s.pills || '').slice(0, 70) })));
