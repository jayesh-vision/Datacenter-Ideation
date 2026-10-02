// Expanded twin view fills the application content area; header and left menu stay visible.
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
let fails = 0; const ok = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fails++; };
const box = sel => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }, sel);
await p.goto('http://localhost:5181/datacenters/MH-DC-001', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.twin-canvas canvas', { timeout: 30000 }); await p.waitForFunction(() => (document.querySelector('.twin-canvas')?.getBoundingClientRect().height ?? 0) > 100, null, { timeout: 30000 }); await p.waitForTimeout(800);
let before = await box('.twin-canvas'); for (let k = 0; k < 20 && (!before || before.h < 100); k++) { await p.waitForTimeout(300); before = await box('.twin-canvas'); }
await p.locator('[data-twin="fullscreen"]').click(); await p.waitForTimeout(1200);
const twin = await box('.twin.is-full'), rail = await box('.rail'), top = await box('.topbar'), canvas = await box('.twin-canvas');
ok('no native browser full screen', await p.evaluate(() => !document.fullscreenElement));
ok(`header still visible (topbar ${top?.h}px)`, !!top && top.h > 0 && twin.y >= top.y + top.h - 1);
ok(`left menu still visible (rail ${rail?.w}px)`, !!rail && rail.w > 0 && twin.x >= rail.x + rail.w - 1);
ok(`fills the content area to the window edges (${twin.w}×${twin.h})`, twin.x + twin.w >= 1439 && twin.y + twin.h >= 899);
ok(`canvas enlarged (${before.h} → ${canvas.h} px tall)`, canvas.h > before.h + 150);
ok('panel still visible', await p.locator('.twin.is-full [data-twin="panel"]').isVisible());
await p.locator('[data-twin-floor="0"]').click(); await p.waitForTimeout(1200);
ok('navigation works while expanded', (await p.locator('.twin-canvas').getAttribute('data-twin-level-now')) === 'floor');
await p.screenshot({ path: '.qa/out/twin_expanded.png' });
await p.locator('.rail-foot button').click(); await p.waitForTimeout(600);
const twin2 = await box('.twin.is-full'), rail2 = await box('.rail');
ok(`follows a collapsed menu (rail ${rail2.w}px, twin starts at ${twin2.x})`, Math.abs(twin2.x - (rail2.x + rail2.w)) <= 2);
await p.locator('.rail-foot button').click(); await p.waitForTimeout(400);
await p.keyboard.press('Escape'); await p.waitForTimeout(600);
ok('Esc exits expanded view', await p.locator('.twin.is-full').count() === 0);
console.log(errs.length ? errs : 'no page errors'); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await b.close();
