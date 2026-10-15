// DCIM rack elevation: drag a device to free units → move under a CR; device drawer "Open rack". usage: node .qa/dcim-drag.mjs [persona] [geo]
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'us';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
await p.goto(`http://localhost:5181/dcim?persona=${P}&geo=${G}&tab=racks`, { waitUntil: 'networkidle' });
/* a rack with free space at the top: the first operator rack whose devices leave room */
await p.locator('.dt-table tbody tr').first().waitFor();
await p.locator('.dt-table tbody tr').nth(2).click(); await p.waitForURL(/\/dcim\/racks\//);
await p.locator('.dcim-dev[draggable="true"]').first().waitFor({ timeout: 8000 });
const dev = p.locator('.dcim-dev[draggable="true"]').first();
const name = (await dev.locator('span').first().innerText()).trim();
const rails = await p.locator('.dcim-elev-rails').boundingBox();
/* aim just above the highest block (device or held space): the first free unit there */
const tops = await p.locator('.dcim-elev-rails .dcim-dev').evaluateAll(els => els.map(e => e.getBoundingClientRect().top));
const y = Math.min(...tops) - rails.y - 8; console.log('  target y', Math.round(y), 'of', Math.round(rails.height));
await dev.dragTo(p.locator('.dcim-elev-rails'), { targetPosition: { x: rails.width / 2, y: Math.max(2, y) } });
await p.waitForTimeout(500);
const modal = await p.locator('.modal').innerText().catch(() => '');
ok(/^Move /.test(modal.trim()) && modal.includes('Change request'), `drag ${name} to the top opens the move dialog: ${modal.split('\n')[0]}`);
if (modal) { await p.locator('.modal').getByRole('button', { name: 'Move device' }).click(); await p.waitForTimeout(800);
  const t = (await p.locator('.toast').allInnerTexts()).join(' | '); ok(/moved to|Planned under/.test(t), `moved under a CR: ${t.slice(0, 90)}`); }
/* drawer → Open rack (same rack): the drawer closes */
await p.locator('.dcim-dev').first().click(); await p.waitForTimeout(500);
await p.locator('.drawer').getByRole('button', { name: 'Open rack' }).click(); await p.waitForTimeout(500);
ok(await p.locator('.drawer').count() === 0, 'Open rack closes the drawer on the rack page');
/* from the Devices tab: Open rack navigates */
await p.goto(`http://localhost:5181/dcim?tab=devices`, { waitUntil: 'networkidle' }); await p.locator('.dt-table tbody tr').first().click(); await p.waitForTimeout(600);
await p.locator('.drawer').getByRole('button', { name: 'Open rack' }).click(); await p.waitForTimeout(700);
ok(/\/dcim\/racks\//.test(p.url()) && await p.locator('.drawer').count() === 0, `Open rack from the device list → ${p.url().split('/').pop()}`);
ok(!errs.length, errs.length ? `errors: ${errs.slice(0, 2)}` : 'no page errors');
await b.close(); process.exit(bad ? 1 : 0);
