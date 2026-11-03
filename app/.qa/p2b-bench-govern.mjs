/* Planner → Benchmarks phase C (node .qa/p2b-bench-govern.mjs [persona] [geo]; W=1280|1440): editing a confirmed value goes for approval
   (notice bar, chip, banner; the requester cannot approve, a second Capacity Planner can; history keeps request + approval), the effect on open
   plans is shown before saving, CSV export → edited file → dry-run import (new / changed / unchanged / rejected) → apply. In-app only. */
import { chromium } from 'playwright';
import fs from 'node:fs';
const [persona = 'neocloud', geo = 'us'] = process.argv.slice(2); const W = +(process.env.W || 1440); const BASE = process.env.BASE || 'http://localhost:5181';
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
let bad = 0; const fail = m => { bad++; console.log('FAIL', m); }; const ok = m => console.log('ok  ', m);
const shot = async n => { if (process.env.SHOTS) await p.screenshot({ path: `.qa/out/govern-${n}.png` }); };
const drawer = () => p.locator('.drawer').last();
const nav = async q => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, `/planning?tab=benchmarks&persona=${persona}&geo=${geo}${q}`); await p.waitForTimeout(500); };
await p.goto(`${BASE}/planning?tab=benchmarks&persona=${persona}&geo=${geo}`); await p.waitForSelector('.pn-lib-bar'); await p.waitForTimeout(400);
/* 1 · a confirmed lead time → Send for approval */
await nav('&view=lead');
await p.locator('input[placeholder^="Value, site"]').fill('Chiller'); await p.waitForTimeout(300);
await p.locator('.pn-lib .dt tbody tr, .pn-lib [class*=lead] >> text=Chiller').first().click(); await p.waitForSelector('.drawer .pn-bm-form');
const typ = drawer().locator('input[type=number]').nth(1); const was = await typ.inputValue(); await typ.fill(String(+was + 6));
await p.waitForTimeout(1500);
const send = drawer().locator('button', { hasText: 'Send for approval' });
(await send.count()) ? ok(`confirmed value ${was} → ${+was + 6}: "Send for approval"`) : fail('no Send for approval on a confirmed value');
const eff = await drawer().locator('h4', { hasText: 'Effect on open plans' }).locator('xpath=..').innerText().catch(() => '');
ok(`effect: ${eff.split('\n').slice(1, 2).join(' ').slice(0, 120)}`);
await drawer().locator('input[placeholder^="e.g. New supplier"]').fill('QA: longer chiller lead');
await shot('send'); await send.click(); await p.waitForTimeout(500);
const barTxt = await p.locator('.pn-bm-bar').innerText().catch(() => '');
/1 value change awaiting approval/.test(barTxt) ? ok('notice bar: 1 change awaiting approval') : fail(`notice bar "${barTxt.slice(0, 80)}"`);
await p.locator('.pn-bm-bar button', { hasText: 'Review' }).click(); await p.waitForTimeout(400);
await p.getByText('Chiller').first().click(); await p.waitForSelector('.drawer .pn-bm-form');
(await drawer().locator('.pn-bm-note.is-info').count()) ? ok('banner shows the proposed change') : fail('no pending banner');
const sw = drawer().locator('button', { hasText: /^Switch to/ });
(await sw.count()) && !(await drawer().locator('button', { hasText: /^Approve as/ }).count()) ? ok('requester cannot approve; switch offered') : fail('requester could approve');
await shot('pending'); await sw.first().click(); await p.waitForTimeout(200);
await drawer().locator('button', { hasText: /^Approve as/ }).click(); await p.waitForTimeout(500);
await nav('&view=lead'); await p.locator('input[placeholder^="Value, site"]').fill('Chiller'); await p.waitForTimeout(300);
await p.getByText('Chiller').first().click(); await p.waitForSelector('.drawer .pn-bm-form');
const v2 = await drawer().locator('input[type=number]').nth(1).inputValue(); const hist = await drawer().locator('.pn-bm-hist li').allInnerTexts();
v2 === String(+was + 6) && hist.some(h => /approved/i.test(h)) && hist.some(h => /requested/i.test(h)) ? ok(`approved → typical ${v2}, history: ${hist.length} lines`) : fail(`after approval typical ${v2}, history ${hist.join(' / ').slice(0, 150)}`);
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
/* 2 · an indicative build cost → effect on plans, saved directly */
await nav('');
await p.locator('.pn-lib .dt tbody tr', { hasText: 'GPU factory' }).first().click(); await p.waitForSelector('.drawer .pn-bm-form');
const t2 = drawer().locator('input[type=number]').nth(1); await t2.fill(String(+(await t2.inputValue()) + 400)); await p.waitForTimeout(2500);
const eff2 = await drawer().locator('h4', { hasText: 'Effect on open plans' }).locator('xpath=..').innerText().catch(() => '');
ok(`capex +400: ${eff2.replace(/\s+/g, ' ').slice(20, 200)}`);
await shot('effect');
(await drawer().locator('button', { hasText: 'Save new version' }).count()) ? ok('indicative value saves directly') : fail('indicative value asks for approval');
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
/* 3 · CSV export → edit → import dry run → apply */
await p.locator('.pn-lib-tb button[aria-label], .pn-lib-tb .lt-more, .pn-lib-tb button:has(svg.lucide-ellipsis-vertical)').last().click().catch(() => {});
const dlP = p.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await p.getByText(/^Export \d+ values \(CSV\)/).click().catch(() => {});
const dl = await dlP;
if (!dl) { fail('no CSV download (menu not found)'); } else {
  const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, ''); const lines = csv.trim().split('\n');
  ok(`export: ${lines.length - 1} rows, header ${lines[0].slice(0, 60)}…`);
  const head = lines[0].split(','); const iT = head.indexOf('typical');
  const plain = lines.map((l, i) => (i > 0 && !l.includes('"') ? i : -1)).filter(i => i > 0);
  const [i1, i2, i3] = plain;
  const row = lines[i1].split(','); row[iT] = String(+row[iT] + 100); lines[i1] = row.join(',');
  const badUnit = lines[i2].split(','); badUnit[head.indexOf('unit')] = 'USD/MW'; badUnit[0] = ''; lines[i2] = badUnit.join(',');
  lines.push(lines[i3]); // duplicate case
  const nw = new Array(head.length).fill(''); nw[head.indexOf('measure')] = 'itCapexPerRack'; nw[head.indexOf('site_type')] = 'hyperscale-dc'; nw[head.indexOf('typical')] = '210000'; nw[head.indexOf('source')] = 'QA quotes'; nw[head.indexOf('confidence')] = 'indicative'; lines.push(nw.join(','));
  fs.writeFileSync('.qa/out/bm-import.csv', lines.join('\n'));
  await p.locator('.pn-lib-tb button:has(svg.lucide-ellipsis-vertical)').last().click().catch(() => {});
  const fc = p.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
  await p.getByText('Import values from CSV…').click().catch(() => {});
  const ch = await fc; if (!ch) fail('no file chooser'); else {
    await ch.setFiles('.qa/out/bm-import.csv'); await p.waitForSelector('.pn-imp-tiles');
    const tiles = (await p.locator('.pn-imp-tiles button').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join(' | ');
    /1 New/.test(tiles) && /1 Changed/.test(tiles) && /2 Rejected/.test(tiles) ? ok(`dry run: ${tiles}`) : fail(`dry run: ${tiles}`);
    await shot('import');
    await p.locator('.pn-imp-tiles button', { hasText: 'Rejected' }).click(); console.log('   rejected:', (await p.locator('.pn-imp-list tbody tr').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join(' / '));
    await p.locator('button', { hasText: /^Apply \d+ line/ }).click(); await p.waitForTimeout(600);
    (await p.locator('.pn-imp-tiles').count()) === 0 ? ok('applied') : fail('import modal still open');
  }
}
const real = errs.filter(e => !/favicon|DevTools|Download the React/.test(e));
real.length ? fail(`console: ${real.slice(0, 3).join(' | ')}`) : ok('no console errors');
await b.close(); console.log(bad ? `govern: ${bad} FAILED` : 'govern ok'); process.exit(bad ? 1 : 0);
