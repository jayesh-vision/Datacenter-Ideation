// Realistic twin: device popup + focused cabling / power trace (13-Oct-2026). usage: P=persona DC=site node .qa/twin2-trace.mjs
import { chromium } from 'playwright';
const W = Number(process.env.W ?? 1440), persona = process.env.P ?? 'neocloud', dc = process.env.DC ?? 'TN-DC-022';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
const settle = (ms = 2000) => p.waitForTimeout(ms);
const shot = async n => { for (let k = 0; k < 3; k++) { try { await p.locator('.twin').screenshot({ path: `.qa/out/t2trace_${n}_${W}.png`, timeout: 12000 }); return; } catch { await p.waitForTimeout(800); } } };
let bad = 0; const ok = (m, c) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) bad++; };
await p.goto(`http://localhost:5181/datacenters/${dc}?tab=overview&twin=realistic&persona=${persona}&geo=in`, { waitUntil: 'networkidle' });
await p.waitForSelector('[data-twin2] canvas', { timeout: 40000 }); await settle(2600);
await p.locator('[data-twin2-floor="0"]').click(); await settle();
await p.locator('[data-twin2-rack]').first().click(); await settle(2600);
await p.locator('[data-twin="panel"] [data-twin-ne]').first().click(); await settle(2800);
ok('popup opens for the device', await p.locator('[data-twin2-popup]').count() === 1);
await shot('popup');
await p.locator('[data-pop-action="cables"]').click(); await settle(3500);
ok('cabling trace open', await p.locator('[data-twin2-trace="cables"]').count() === 1);
await shot('cables_all');
const first = p.locator('[data-trace-cable]').first(); if (await first.count()) { await first.click(); await settle(2500); await shot('cables_one'); }
await p.locator('[data-twin2-trace] .seg button', { hasText: 'Power' }).click(); await settle(3000);
ok('power trace open', await p.locator('[data-twin2-trace="power"]').count() === 1);
await shot('power');
await p.locator('[data-twin2-trace-close]').click(); await settle(2500);
ok('back to the twin', await p.locator('[data-twin2] canvas').count() >= 1 && await p.locator('[data-twin2-trace]').count() === 0);
ok('no page errors', !errs.length); if (errs.length) console.log(errs.slice(0, 3));
await b.close(); process.exit(bad ? 1 : 0);
