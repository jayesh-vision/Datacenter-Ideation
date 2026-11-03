/* Planner → Benchmarks CRUD (node .qa/p2b-benchmarks.mjs [persona] [geo]; W=1280|1440): every tab has its own add button and drawer
   offering only that tab's measures with a fixed unit; the duplicate guard blocks a second value for the same case; a new lead-time item is
   added and listed; an edit saves v2 with history; retire hides it, Status → Retired lists it, restore brings it back; no overflow. */
import { chromium } from 'playwright';
const [persona = 'neocloud', geo = 'us'] = process.argv.slice(2); const W = +(process.env.W || 1440); const BASE = process.env.BASE || 'http://localhost:5181';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
let bad = 0; const fail = m => { bad++; console.log('FAIL', m); }; const ok = m => console.log('ok  ', m);
const url = v => `${BASE}/planning?tab=benchmarks&persona=${persona}&geo=${geo}${v ? `&view=${v}` : ''}`;
const drawer = () => p.locator('.drawer').last();
const shot = async n => { if (process.env.SHOTS) await p.screenshot({ path: `.qa/out/bm-${n}.png`, fullPage: false }); };
const EXPECT = { '': 'Add cost value', efficiency: 'Add efficiency value', lead: 'Add lead time', sizing: 'Add sizing value' };
for (const [v, label] of Object.entries(EXPECT)) {
  await p.goto(url(v)); await p.waitForSelector('.pn-lib-bar');
  const btn = p.locator('.pn-lib-bar button', { hasText: label });
  if (!(await btn.count())) { fail(`${v || 'cost'}: no "${label}" button`); continue; }
  await btn.click(); await p.waitForSelector('.drawer .pn-bm-form');
  const opts = await drawer().locator('select').first().locator('option').allInnerTexts();
  const unit = await drawer().locator('.pn-bm-unit b').innerText();
  ok(`${v || 'cost'}: "${label}" → ${opts.length} measures, unit ${unit}`);
  if (v === 'lead' && !opts.some(o => /Lead time|Transformer|Chiller/.test(o))) fail('lead: no equipment lead times offered');
  if (v === '' && opts.some(o => /PUE|Lead time/.test(o))) fail('cost: offers other tabs\' measures');
  const first = { '': 'USD/kW', efficiency: 'ratio', lead: 'weeks', sizing: 'FTE/MW' }[v]; if (unit !== first) fail(`${v || 'cost'}: starts on unit ${unit}, expected ${first}`);
  await shot(`add-${v || 'cost'}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
}
/* duplicate guard: Build cost per kW for a site type that already has one */
await p.goto(url('')); await p.waitForSelector('.pn-lib-bar');
await p.locator('.pn-lib-bar button', { hasText: 'Add cost value' }).click(); await p.waitForSelector('.drawer .pn-bm-form');
const sel = drawer().locator('select').first();
const capex = await sel.locator('option', { hasText: 'Build cost per kW' }).first().getAttribute('value');
await sel.selectOption(capex);
const site = drawer().locator('.pn-bm-form section').nth(1).locator('select').first();
await site.selectOption({ index: 1 });
await drawer().locator('input[type=number]').nth(1).fill('3333');
await drawer().locator('.pn-bm-form section').nth(3).locator('input').first().fill('QA quote');
await p.waitForTimeout(150);
const warn = await drawer().locator('.pn-bm-note.is-warn').count(), saveDis = await drawer().locator('button', { hasText: 'Add value' }).isDisabled();
warn && saveDis ? ok('duplicate guard: warning shown, Add disabled') : fail(`duplicate guard warn=${warn} disabled=${saveDis}`);
await shot('dup');
await drawer().locator('.pn-bm-note.is-warn button').click(); await p.waitForTimeout(300);
(await drawer().locator('.drawer-head, h2, h3').first().innerText()).length ? ok('Open that value → existing value opened') : fail('open existing');
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
/* new lead-time item */
await p.goto(url('lead')); await p.waitForSelector('.pn-lib-bar');
const before = await p.locator('.pn-lib-bar button', { hasText: /Lead times · \d+/ }).innerText();
await p.locator('.pn-lib-bar button', { hasText: 'Add lead time' }).click(); await p.waitForSelector('.drawer .pn-bm-form');
await drawer().locator('select').first().selectOption('new:leadWeeks');
await drawer().locator('input[placeholder^="e.g. Busway"]').fill('Busway (1600 A)');
const nums = drawer().locator('input[type=number]'); await nums.nth(0).fill('10'); await nums.nth(1).fill('14'); await nums.nth(2).fill('20');
await drawer().locator('input[placeholder^="e.g. Supplier"]').fill('QA supplier quote');
await drawer().locator('button', { hasText: 'Add value' }).click(); await p.waitForTimeout(500);
const after = await p.locator('.pn-lib-bar button', { hasText: /Lead times · \d+/ }).innerText();
const listed = await p.getByText('Busway (1600 A)').count();
listed && before !== after ? ok(`new lead item added (${before} → ${after})`) : fail(`new lead item listed=${listed} ${before} → ${after}`);
/* edit → v2 + history */
await p.getByText('Busway (1600 A)').first().click(); await p.waitForSelector('.drawer .pn-bm-form');
await drawer().locator('input[type=number]').nth(1).fill('15');
await drawer().locator('button', { hasText: 'Save new version' }).click(); await p.waitForTimeout(400);
await p.getByText('Busway (1600 A)').first().click(); await p.waitForSelector('.drawer .pn-bm-form');
const hist = await drawer().locator('.pn-bm-hist li').count(); const ver = await drawer().locator('.mono', { hasText: 'v2' }).count();
hist >= 2 && ver ? ok(`edit saved as v2, history ${hist} entries`) : fail(`history ${hist} v2=${ver}`);
await shot('history');
/* retire → hidden → Status Retired → restore */
await drawer().locator('button', { hasText: 'Retire' }).click(); await p.waitForSelector('.modal textarea, textarea');
await p.locator('textarea').last().fill('QA: superseded by supplier quote');
await p.locator('button', { hasText: 'Retire value' }).click(); await p.waitForTimeout(500);
(await p.getByText('Busway (1600 A)').count()) === 0 ? ok('retired value hidden') : fail('retired value still listed');
/* in-app navigation: a reload regenerates the mock (runtime edits are lost) */
const nav = async u => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u.replace(BASE, '')); await p.waitForTimeout(400); };
await nav(url('lead') + '&state=retired');
(await p.getByText('Busway (1600 A)').count()) ? ok('Status → Retired lists it') : fail('retired list');
await p.getByText('Busway (1600 A)').first().click(); await p.waitForSelector('.drawer .pn-bm-form');
await drawer().locator('button', { hasText: 'Restore' }).click(); await p.waitForTimeout(400);
await nav(url('lead'));
(await p.getByText('Busway (1600 A)').count()) ? ok('restored') : fail('restore');
/* layout */
await p.locator('.pn-lib-bar button', { hasText: 'Add lead time' }).click(); await p.waitForSelector('.drawer .pn-bm-form');
const ov = await p.evaluate(() => { const d = document.querySelector('.drawer'); return d ? [...d.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== 'visible' && !['SELECT', 'INPUT'].includes(e.tagName)).length + (document.documentElement.scrollWidth > innerWidth + 1 ? 100 : 0) : -1; });
ov === 0 ? ok('no overflow') : fail(`overflow ${ov}`);
const real = errs.filter(e => !/favicon|DevTools|Download the React/.test(e));
real.length ? fail(`console: ${real.slice(0, 3).join(' | ')}`) : ok('no console errors');
await b.close(); console.log(bad ? `benchmarks: ${bad} FAILED` : 'benchmarks ok'); process.exit(bad ? 1 : 0);
