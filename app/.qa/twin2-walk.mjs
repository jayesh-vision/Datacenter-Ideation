import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = Number(process.env.W ?? 1440);
const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
const shot = async (n) => { for (let k = 0; k < 4; k++) { try { await p.locator('.twin').screenshot({ path: `.qa/out/t2b_${n}_${W}.png`, timeout: 15000 }); return; } catch { await p.waitForTimeout(500); } } console.log('shot failed', n); };
const ok = (n, c) => console.log(c ? 'PASS' : 'FAIL', n);
const wait = (ms = 2200) => p.waitForTimeout(ms);
const shown = (sel) => p.waitForFunction(s => { const e = document.querySelector(s); return e && e.closest('.t2-label').style.display !== 'none'; }, sel, { timeout: 25000 }).then(() => true, () => false);
const tap = async (sel) => { await shown(sel); await p.locator(sel).first().click({ force: true }); };
await p.goto(`http://localhost:5181/datacenters/MH-DC-001?twin=realistic&persona=${process.argv[2] ?? 'neocloud'}&geo=in`, { waitUntil: 'networkidle' });
await p.waitForSelector('.twin-canvas canvas', { timeout: 30000 }); await wait(2500);
await p.locator('.twin-side [data-twin-floor="0"]').click({ force: true }); await wait();
await p.locator('.twin-side [data-twin-room]').first().click({ force: true }); await wait();
const nRacks = await p.locator('.twin-side [data-twin-rack]').count();
const nLabels = await p.locator('[data-twin2-rack]').count();
ok(`room: ${nLabels} rack labels for ${nRacks} racks`, nLabels === nRacks);
await shot('room');
// rack label click
const lab = p.locator('[data-twin2-rack]').nth(2); const id = await lab.getAttribute('data-twin2-rack');
await lab.click(); await wait(2500);
ok(`rack label click opens ${id}`, (await p.locator('.twin-canvas').getAttribute('data-twin-level-now')) === 'rack' && (await p.locator('[data-twin="panel-path"]').innerText()).includes(id.replace('MH-DC-001-', '')));
await shot('rack');
// plant room → UPS
await p.locator('[data-twin2="whole-floor"]').click({ force: true }); await wait();
const plant = p.locator('.twin-side [data-twin-room*="Plant"]'); await plant.click({ force: true }); await wait();
const units = await p.locator('[data-twin2-unit]').evaluateAll(els => els.map(e => e.getAttribute('data-twin2-unit')));
ok(`plant room unit labels: ${units.join(' | ')}`, units.length >= 4);
await shot('plant');
for (const k of units.filter(u => /UPS-2|Battery|Rectifier/i.test(u))) {
  await tap(`[data-twin2-unit="${k}"]`); await p.waitForSelector('[data-twin2-unit-card]'); await wait(3000);
  const card = await p.locator('[data-twin2-unit-card]').innerText().catch(() => '');
  ok(`unit ${k} → card: ${card.replace(/\n/g, ' / ')}`, card.length > 0);
  await shot('unit_' + k.replace(/[^a-z0-9]/gi, '_').slice(-20));
  await p.locator('.t2-card-x').click({ force: true }); await wait(2400);
}
// DG from the building view
await p.locator('.t2-overlay-left .seg').first().locator('button', { hasText: 'Building' }).click({ force: true }); await wait(3000);
if (await shown('[data-twin2-unit="dg"]')) { await tap('[data-twin2-unit="dg"]'); await wait(3000); ok('DG card', await p.locator('[data-twin2-unit-card]').count() === 1); await shot('dg'); await p.locator('.t2-card-x').click({ force: true }); await wait(1500); } else console.log('DG label not in frame');
// CRAH behind the racks
await p.locator('.twin-side [data-twin-room]').first().click({ force: true }); await wait();
const ck = await p.locator('[data-twin2-unit^="c:"]').first().getAttribute('data-twin2-unit');
await tap('[data-twin2-unit^="c:"]'); await wait(3500); ok(`CRAH ${ck} card`, await p.locator('[data-twin2-unit-card]').count() === 1); await shot('crah');
await p.locator('.t2-card-x').click({ force: true }); await wait(1500); await shot('room_after');
// walk mode
await p.locator('[data-twin2-walk]').click({ force: true }); await wait(2500);
await shot('walk_start');
await p.locator('.twin-canvas canvas').hover();
await p.keyboard.down('w'); await wait(1200); await p.keyboard.up('w'); await wait(600);
await shot('walk_fwd');
const box = await p.locator('.twin-canvas canvas').boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 250, box.y + box.height / 2, { steps: 8 }); await p.mouse.up(); await wait(800);
await shot('walk_look');
ok('still walking after drag', (await p.locator('[data-twin2-walk]').getAttribute('aria-pressed')) === 'true');
await p.keyboard.press('Escape'); await wait(1500);
ok('Esc stops walking', (await p.locator('[data-twin2-walk]').getAttribute('aria-pressed')) === 'false');
const r = await p.evaluate(() => ({ bad: ['NaN', 'undefined', 'Infinity'].filter(w => document.body.innerText.includes(w)), over: document.documentElement.scrollWidth > window.innerWidth + 2 }));
ok(`text ok ${!r.bad.length}, no overflow ${!r.over}`, !r.bad.length && !r.over);
ok(`console errors: ${errs.length} ${errs.slice(0, 3).join(' | ')}`, !errs.length);
await b.close();
