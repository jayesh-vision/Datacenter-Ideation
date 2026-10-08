// Realistic digital twin (site Overview, ?twin=realistic): headless WebGL via SwiftShader, view switch,
// drill via the panel's DOM controls, floor picker and overlays, several sites and personas.
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0; const ok = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fails++; };
const W = Number(process.env.W ?? 1440);
const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
const settle = async (ms = 1600) => { await p.waitForTimeout(ms); };
const shot = async (name) => { for (let k = 0; k < 3; k++) { try { await p.locator('.twin').screenshot({ path: `.qa/out/twin2_${name}_${W}.png`, timeout: 8000 }); return; } catch { await p.waitForTimeout(600); } } };
const check = async (label) => {
  await p.waitForSelector('.twin-canvas canvas, .twin-nogl', { timeout: 30000 }).catch(() => {});
  const r = await p.evaluate(() => ({ bad: ['NaN', 'undefined', 'Infinity', '[object'].filter(w => document.body.innerText.includes(w)), over: document.documentElement.scrollWidth > window.innerWidth + 2, canvas: !!document.querySelector('.twin-canvas canvas'), level: document.querySelector('.twin-canvas')?.getAttribute('data-twin-level-now'), t2: !!document.querySelector('[data-twin2]') }));
  ok(`${label}: canvas=${r.canvas} level=${r.level} realistic=${r.t2} text-ok=${!r.bad.length} no-overflow=${!r.over}`, r.canvas && r.t2 && !r.bad.length && !r.over);
  return r;
};
const open = async (url) => { await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForSelector('.twin-canvas canvas', { timeout: 30000 }); await settle(2200); };

// default view stays the schematic twin; the switch is on the tab row
await open('http://localhost:5181/datacenters/MH-DC-001');
ok('default view is the schematic twin', await p.locator('[data-twin2]').count() === 0 && await p.locator('.twin').count() === 1);
ok('view switch present above the twin', await p.locator('.twin-host-bar .site-view-switch .seg button').count() === 2);
const pillsBox = await p.locator('.site-sticky .pills').boundingBox(); const bar = await p.locator('.twin-host-bar').boundingBox();
ok(`tabs stay on one row (h ${Math.round(pillsBox.height)}) and the host bar is slim (h ${Math.round(bar.height)})`, pillsBox.height < 60 && bar.height < 40);
await p.locator('.site-view-switch .seg button', { hasText: 'Realistic' }).click(); await p.waitForSelector('[data-twin2] canvas', { timeout: 30000 }); await settle(2600);
ok('URL carries twin=realistic', p.url().includes('twin=realistic'));
let r = await check('building'); ok('level building', r.level === 'building'); await shot('building');
ok('floor labels in the scene', await p.locator('[data-twin2-floor]').count() === 2);
ok('legend shown', await p.locator('[data-twin2-legend] span').count() >= 4);
ok('overlay picker hidden at building level', await p.locator('.t2-overlay-left .seg').count() === 1);
// panel = same panel as the schematic twin
const stripNe = (await p.locator('.pill', { hasText: 'Equipment' }).locator('.count').innerText()).replace(/,/g, '');
const panelNe = (await p.locator('.twin-side .twin-stats > div').nth(3).locator('.vw-card-metric-md').innerText()).replace(/,/g, '');
ok(`panel devices ${panelNe} = Equipment tab ${stripNe}`, panelNe === stripNe);
// drill: floor via scene label, room via panel, rack, device
await p.locator('[data-twin2-floor="0"]').click(); await settle(); r = await check('floor'); ok('level floor', r.level === 'floor'); await shot('floor');
ok('overlay picker shown at floor level', await p.locator('.t2-overlay-left .seg').count() === 2);
for (const l of ['Temperature', 'Rack power', 'Connectivity']) { await p.locator('.t2-overlay-left .seg button', { hasText: l }).click(); await settle(900); await shot('floor_' + l.toLowerCase().replace(/\s/g, '')); }
await p.locator('.t2-overlay-left .seg button', { hasText: 'Health' }).click(); await settle(400);
await p.locator('[data-twin-room]').first().click(); await settle(); r = await check('room'); ok('level room', r.level === 'room'); await shot('room');
ok('Whole floor button shown inside a room', await p.locator('[data-twin2="whole-floor"]').count() === 1);
const rackCount = await p.locator('[data-twin-rack]').count(); ok(`room lists racks (${rackCount})`, rackCount > 0);
await p.locator('[data-twin-rack]').first().click(); await settle(2000); r = await check('rack'); ok('level rack', r.level === 'rack'); await shot('rack');
ok('selected rack has a scene label', await p.locator('[data-twin2-rack]').count() >= 1);
const eqCount = await p.locator('[data-twin-ne]').count(); ok(`rack lists equipment (${eqCount})`, eqCount > 0);
if (eqCount) { await p.locator('[data-twin-ne]').first().click(); await settle(2000); r = await check('equipment'); ok('level equipment', r.level === 'equipment'); await shot('equipment'); ok('equipment panel links to NE page', await p.locator('.twin-side a[href^="/ne/"]').count() > 0); }
ok('panel path shows 5 steps at equipment level', await p.locator('[data-twin="panel-path"] [data-twin-crumb]:not([data-twin-crumb="back"])').count() === 5);
await p.locator('[data-twin-crumb="back"]').click(); await settle(1400); r = await check('panel back → rack'); ok('panel back goes to rack', r.level === 'rack');
// floor picker on the canvas
await p.locator('.t2-overlay-left .seg').first().locator('button', { hasText: 'Building' }).click(); await settle(1800); r = await check('picker → building'); ok('floor picker returns to building', r.level === 'building');
await p.locator('.t2-overlay-left .seg').first().locator('button').nth(2).click(); await settle(1600); r = await check('picker → floor 2'); ok('floor picker opens the second floor', r.level === 'floor');
// reset + expand
await p.locator('[data-twin="fullscreen"]').click(); await settle(1200); ok('expanded view fills the content area', await p.locator('.twin.is-full').count() === 1); await shot('full');
await p.keyboard.press('Escape'); await settle(600); ok('Esc leaves expanded view', await p.locator('.twin.is-full').count() === 0);
await p.locator('[data-twin="reset"]').click(); await settle(); r = await check('reset → building'); ok('reset returns to building', r.level === 'building');
// plant room (power)
await p.locator('[data-twin-floor="0"]').click(); await settle(900); const plant = p.locator('[data-twin-room*="Plant"]'); ok('plant room listed', await plant.count() === 1); await plant.click(); await settle(1800); await shot('plant');
// switch back keeps the selection path working in the schematic twin
await p.locator('.site-view-switch .seg button', { hasText: 'Schematic' }).click(); await settle(2200);
ok('switch back shows the schematic twin', await p.locator('[data-twin2]').count() === 0 && await p.locator('.twin-canvas canvas').count() === 1);
// remembered choice: new load without the param opens the realistic view
await p.locator('.site-view-switch .seg button', { hasText: 'Realistic' }).click(); await settle(1500);
await open('http://localhost:5181/datacenters/MH-DC-002'); ok('choice remembered on another site', await p.locator('[data-twin2]').count() === 1);
// tall site, 7 floors
await open('http://localhost:5181/datacenters/DL-DC-009?twin=realistic'); await check('DL-DC-009 tall building'); ok('7 floor labels', await p.locator('[data-twin2-floor]').count() === 7); await shot('tall');
await p.locator('[data-twin-floor="3"]').click(); await settle(1800); await check('DL-DC-009 floor 4'); await shot('tall_floor');
// biggest site room
await open('http://localhost:5181/datacenters/KA-DC-020?twin=realistic'); await p.locator('[data-twin-floor="0"]').click(); await settle(900); await p.locator('[data-twin-room]').first().click(); await settle(2000); await check('KA-DC-020 room'); await shot('ka_room');
const t0 = Date.now(); for (let i = 0; i < 20; i++) { await p.mouse.move(400 + i * 10, 400 + i * 5); await p.waitForTimeout(16); } ok(`KA room pointer loop ${(Date.now() - t0)} ms (software GL, post-effects; budget 30 s)`, Date.now() - t0 < 30000);
// planned site (ghost racks) and colocation persona (tenant gear)
await open('http://localhost:5181/datacenters/GJ-DC-013?twin=realistic'); await check('GJ-DC-013 planned'); await shot('planned');
await open('http://localhost:5181/datacenters/KA-DC-020?twin=realistic&persona=colocation'); await p.locator('[data-twin-floor="0"]').click(); await settle(900); await p.locator('[data-twin-room]').first().click(); await settle(1200); await p.locator('[data-twin-rack]').first().click(); await settle(2000); await check('colocation rack'); await shot('colo_rack');
await open('http://localhost:5181/datacenters/MH-DC-001?twin=realistic&persona=network');
console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 8).join('\n') : 'no console errors'); if (errs.length) fails++;
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
