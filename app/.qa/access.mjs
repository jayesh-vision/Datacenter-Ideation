// Datacenter → Access tab: strip filters, door filter, person + exception drawers (node .qa/access.mjs [persona] [geo] [dc]; W=1280)
import { chromium } from 'playwright';
const [per = 'neocloud', geo = 'us', dc = 'IL-DC-009'] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Number(process.env.W ?? 1440), height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
await p.goto(`http://localhost:5181/datacenters/${dc}?tab=access&persona=${per}&geo=${geo}`, { waitUntil: 'networkidle' }); await p.waitForSelector('.acc-log');
const count = async () => Number((await p.textContent('.acc-log .lt-count')).match(/Showing ([\d,]+)/)[1].replace(/,/g, ''));
const all = await count();
await p.click('.sum-item:has-text("Denied")'); await p.waitForTimeout(300);
const den = await count(); ok(p.url().includes('ares=Denied'), 'denied filter in URL');
ok(den === await p.locator('.acc-log tbody tr.acc-denied').count() || den > 20, 'denied rows highlighted');
const denTile = Number((await p.textContent('.sum-item:has-text("Denied") .sum-value')).trim()); ok(den === denTile, `denied list ${den} = tile ${denTile}`);
await p.click('.acc-door-list li:first-child button'); await p.waitForTimeout(300);
const doorN = Number(await p.textContent('.acc-door-list li:first-child .acc-d-n .num')); ok(await count() === doorN, `door filter ${await count()} = door reads ${doorN}`);
await p.click('.acc-door-list li:first-child button'); await p.waitForTimeout(300); ok(await count() === all, 'door filter cleared');
await p.click('.acc-people li:first-child button'); await p.waitForTimeout(300); ok(await p.locator('.acc-trail li').count() > 0, 'visit drawer lists badge reads');
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
await p.click('.acc-exc .seg button:last-child').catch(() => {}); await p.click('.panel:has-text("Security exceptions") .seg button:last-child'); await p.waitForTimeout(200);
if (await p.locator('.acc-exc li').count()) { await p.click('.acc-exc li:first-child button'); await p.waitForTimeout(300); ok(await p.locator('.acc-detail').count() === 1, 'exception drawer'); await p.keyboard.press('Escape'); }
await p.click('.acc-log tbody tr:first-child'); await p.waitForTimeout(300); ok(await p.locator('.acc-trail').count() > 0, 'row opens visit');
ok(!errs.length, errs.join(' | '));
console.log(bad ? `${bad} failures` : `access OK (${per} ${geo} ${dc}: ${all} reads, ${den} denied)`); await b.close(); process.exit(bad ? 1 : 0);
