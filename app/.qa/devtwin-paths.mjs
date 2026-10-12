// Device 3D view: Power / Cables chips in the rack view (13-Oct-2026). usage: node .qa/devtwin-paths.mjs [neId] [persona]
import { chromium } from 'playwright';
const ne = process.argv[2] ?? 'MH-DC-001-PE-T4-01', persona = process.argv[3] ?? 'network', W = Number(process.env.W ?? 1440);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
let bad = 0; const ok = (m, c) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) bad++; };
await p.goto(`http://localhost:5181/ne/${ne}?tab=twin&persona=${persona}&geo=in`, { waitUntil: 'networkidle' });
await p.waitForSelector('[data-devtwin-stage] canvas', { timeout: 40000 }); await p.waitForTimeout(2500);
await p.locator('[data-devtwin-chip="power"]').click(); await p.waitForTimeout(3500);
ok('switched to the rack view', (await p.locator('[data-devtwin]').getAttribute('data-devtwin')) === 'rack');
ok('power card', await p.locator('[data-devtwin-pathcard]', { hasText: 'Power into' }).count() === 1);
await p.locator('[data-devtwin-stage]').screenshot({ path: `.qa/out/devpaths_power_${short(ne)}_${W}.png` });
await p.locator('[data-devtwin-chip="cables"]').click(); await p.waitForTimeout(2500);
await p.locator('.dt3-seg button', { hasText: '3/4' }).click(); await p.waitForTimeout(2500);
ok('cables card', await p.locator('[data-devtwin-pathcard]', { hasText: 'Cables' }).count() === 1);
await p.locator('[data-devtwin-stage]').screenshot({ path: `.qa/out/devpaths_both_${short(ne)}_${W}.png` });
ok('no page errors', !errs.length); if (errs.length) console.log(errs.slice(0, 3));
await b.close(); process.exit(bad ? 1 : 0);
function short(s) { return s.replace(/^[A-Z]{2}-DC-\d{3}-/, ''); }
