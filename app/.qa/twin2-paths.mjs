// Realistic twin: Power path / Cable paths quick chips (13-Oct-2026). usage: node .qa/twin2-paths.mjs  (W=1280 for the narrow layout)
import { chromium } from 'playwright';
const W = Number(process.env.W ?? 1440);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
const settle = (ms = 1800) => p.waitForTimeout(ms);
const shot = async n => { for (let k = 0; k < 3; k++) { try { await p.locator('.twin').screenshot({ path: `.qa/out/t2paths_${n}_${W}.png`, timeout: 12000 }); return; } catch { await p.waitForTimeout(800); } } };
let bad = 0; const ok = (m, c) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) bad++; };
const persona = process.env.P ?? 'network', dc = process.env.DC ?? 'MH-DC-001';
await p.goto(`http://localhost:5181/datacenters/${dc}?tab=overview&twin=realistic&persona=${persona}&geo=in`, { waitUntil: 'networkidle' });
await p.waitForSelector('[data-twin2] canvas', { timeout: 40000 }); await settle(2600);
await p.locator('[data-twin2-floor="0"]').click(); await settle();
ok('chips shown at floor level', await p.locator('[data-twin2-chip]').count() === 2);
await p.locator('[data-twin2-chip="power"]').click(); await settle(2200); await shot('floor_power');
ok('power legend', await p.locator('[data-twin2-paths-legend]').count() === 1);
ok('UPS labels in the scene', await p.locator('.t2-path').count() > 0);
await p.locator('[data-twin2-chip="cables"]').click(); await settle(1600); await shot('floor_both');
await p.locator('[data-twin2-chip="power"]').click(); await settle(1200); await shot('floor_cables');
await p.locator('[data-twin2-chip="power"]').click(); await settle(600);
const rack = p.locator('[data-twin2-rack]').first(); await rack.click(); await settle(2600); await shot('rack_both');
ok('PDU labels for the open rack', await p.locator('.t2-path', { hasText: 'PDU-A' }).count() === 1);
/* pick a device from the panel */
const dev = p.locator('[data-twin="panel"] [data-twin-ne]').first(); if (await dev.count()) { await dev.click(); await settle(2600); await shot('device_cables'); ok('far-end labels for the device', await p.locator('.t2-path', { hasText: '→' }).count() > 0); }
ok('no page errors', !errs.length); if (errs.length) console.log(errs.slice(0, 3));
await b.close(); process.exit(bad ? 1 : 0);
