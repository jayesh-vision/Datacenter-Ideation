// Digital twin (site Overview): renders headless WebGL via SwiftShader, drills via DOM controls, checks panel vs KPI strip.
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0; const ok = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fails++; };
const W = Number(process.env.W ?? 1440);
const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
const settle = async (ms = 1400) => { await p.waitForTimeout(ms); };
const shot = async (name) => { for (let k = 0; k < 3; k++) { try { await p.locator('.twin').screenshot({ path: `.qa/out/twin_${name}_${W}.png`, timeout: 8000 }); return; } catch { await p.waitForTimeout(600); } } };
const check = async (label) => {
  await p.waitForSelector('.twin-canvas canvas, .twin-nogl', { timeout: 30000 }).catch(() => {});
  const r = await p.evaluate(() => ({ bad: ['NaN', 'undefined', 'Infinity', '[object'].filter(w => document.body.innerText.includes(w)), over: document.documentElement.scrollWidth > window.innerWidth + 2, canvas: !!document.querySelector('.twin-canvas canvas'), level: document.querySelector('.twin-canvas')?.getAttribute('data-twin-level-now') }));
  ok(`${label}: canvas=${r.canvas} level=${r.level} text-ok=${!r.bad.length} no-overflow=${!r.over}`, r.canvas && !r.bad.length && !r.over);
  return r;
};
await p.goto('http://localhost:5181/datacenters/MH-DC-001', { waitUntil: 'networkidle' }); await p.waitForSelector('.twin-canvas canvas', { timeout: 30000 }); await settle(1800);
ok('Overview is the default tab', await p.locator('.pill.is-active').innerText() === 'Overview');
ok('Overview is the first pill', (await p.locator('.pill').first().innerText()) === 'Overview');
let r = await check('building'); ok('level building', r.level === 'building'); await shot('building');
// panel vs strip
const stripNe = (await p.locator('.pill', { hasText: 'Equipment' }).locator('.count').innerText()).replace(/,/g, '');
const panelNe = (await p.locator('.twin-side .twin-stats > div').nth(3).locator('.vw-card-metric-md').innerText()).replace(/,/g, '');
ok(`panel devices ${panelNe} = Equipment tab ${stripNe}`, panelNe === stripNe);
// layers
for (const l of ['Power', 'Thermal', 'Connectivity', 'Health']) { await p.locator('.twin-tools .seg button', { hasText: l }).click(); await settle(700); await shot('layer_' + l.toLowerCase()); }
// drill floor
await p.locator('[data-twin-floor="0"]').click(); await settle(); r = await check('floor'); ok('level floor', r.level === 'floor'); await shot('floor');
await p.locator('[data-twin-room]').first().click(); await settle(); r = await check('room'); ok('level room', r.level === 'room'); await shot('room');
await p.locator('.twin-tools .seg button', { hasText: 'Thermal' }).click(); await settle(600); await shot('room_thermal');
await p.locator('.twin-tools .seg button', { hasText: 'Health' }).click(); await settle(300);
const rackCount = await p.locator('[data-twin-rack]').count(); ok(`room lists racks (${rackCount})`, rackCount > 0);
await p.locator('[data-twin-rack]').first().click(); await settle(1600); r = await check('rack'); ok('level rack', r.level === 'rack'); await shot('rack');
const eqCount = await p.locator('[data-twin-ne]').count(); ok(`rack lists equipment (${eqCount})`, eqCount > 0);
if (eqCount) { await p.locator('[data-twin-ne]').first().click(); await settle(1600); r = await check('equipment'); ok('level equipment', r.level === 'equipment'); await shot('equipment');
  ok('equipment panel links to NE page', await p.locator('.twin-side a[href^="/ne/"]').count() > 0); }
// panel path: back up one level at a time via the panel, then the full path
ok('panel path shows 5 steps at equipment level', await p.locator('[data-twin="panel-path"] [data-twin-crumb]:not([data-twin-crumb="back"])').count() === 5);
ok('current level bold in panel path', await p.locator('[data-twin="panel-path"] b[aria-current="location"]').count() === 1);
await p.locator('[data-twin-crumb="back"]').click(); await settle(1400); r = await check('panel back → rack'); ok('panel back goes to rack', r.level === 'rack');
await p.locator('[data-twin="panel-path"] [data-twin-crumb="1"]').click(); await settle(1400); r = await check('panel path → floor'); ok('panel path step 1 goes to floor', r.level === 'floor');
ok('panel path has back at floor level', await p.locator('[data-twin-crumb="back"]').count() === 1);
await p.keyboard.press('Tab'); // keyboard reachability smoke
await p.locator('[data-twin="panel-path"] [data-twin-crumb="0"]').click(); await settle(1400); r = await check('panel path → building'); ok('panel path step 0 goes to building', r.level === 'building');
ok('no back affordance at building level', await p.locator('[data-twin-crumb="back"]').count() === 0);
ok('building-level panel path is just Building', (await p.locator('[data-twin="panel-path"]').innerText()).trim() === 'Building');
await p.locator('[data-twin-floor="0"]').click(); await settle(900); await p.locator('[data-twin-room]').first().click(); await settle(900); await p.locator('[data-twin-rack]').first().click(); await settle(900);
if (await p.locator('[data-twin-ne]').count()) { await p.locator('[data-twin-ne]').first().click(); await settle(1200); }
// no navigation above the canvas: only layer toggle + reset on the canvas
ok('no canvas breadcrumb or level buttons', await p.locator('.twin-bar, [data-twin="crumbs"], [data-twin-level]').count() === 0);
ok('canvas overlay has layers + reset', await p.locator('.twin-canvas .twin-tools .seg').count() === 1 && await p.locator('.twin-canvas [data-twin="reset"]').count() === 1);
// reset view returns to building from deep level
await p.locator('[data-twin="reset"]').click(); await settle(); r = await check('reset → building'); ok('reset returns to building', r.level === 'building');
// plant room (power)
await p.locator('[data-twin-floor="0"]').click(); await settle(600); const plant = p.locator('[data-twin-room*="Plant"]'); ok('plant room listed', await plant.count() === 1); await plant.click(); await settle(); await shot('plant');
// biggest site
await p.goto('http://localhost:5181/datacenters/KA-DC-020?tab=overview', { waitUntil: 'networkidle' }); await settle(2500); await check('KA-DC-020 building'); await shot('ka_building');
await p.locator('[data-twin-floor="0"]').click(); await settle(); await p.locator('[data-twin-room]').first().click(); await settle(); await check('KA-DC-020 room'); await shot('ka_room');
const t0 = Date.now(); for (let i = 0; i < 20; i++) { await p.mouse.move(400 + i * 10, 400 + i * 5); await p.waitForTimeout(16); } ok(`KA room pointer loop ${(Date.now() - t0)} ms (software GL; budget 12 s)`, Date.now() - t0 < 12000);
// planned site
await p.goto('http://localhost:5181/datacenters/GJ-DC-013?tab=overview', { waitUntil: 'networkidle' }); await settle(2200); await check('GJ-DC-013 planned'); ok('planned note shown', (await p.locator('.twin-note').first().innerText()).includes('Planned')); await shot('planned');
// small site
await p.goto('http://localhost:5181/datacenters/MH-DC-004?tab=overview', { waitUntil: 'networkidle' }); await settle(2000); await check('MH-DC-004 small'); await shot('small');
console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 5).join('\n') : 'no console errors'); if (errs.length) fails++;
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
