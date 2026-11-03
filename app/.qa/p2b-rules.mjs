/* Planner → Benchmarks → Rules CRUD (node .qa/p2b-rules.mjs [persona] [geo]; W=1280|1440): configure a rule's limit (effect on open plans
   shown before saving, history after), override it in one template (Overrides chip), create a rule from the check catalogue in a template,
   then remove it from every template; no overflow, no console errors. In-app navigation only (a reload regenerates the mock). */
import { chromium } from 'playwright';
const [persona = 'neocloud', geo = 'us'] = process.argv.slice(2); const W = +(process.env.W || 1440); const BASE = process.env.BASE || 'http://localhost:5181';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
let bad = 0; const fail = m => { bad++; console.log('FAIL', m); }; const ok = m => console.log('ok  ', m);
const shot = async n => { if (process.env.SHOTS) await p.screenshot({ path: `.qa/out/rules-${n}.png` }); };
const drawer = () => p.locator('.drawer').last();
const count = async () => +(await p.locator('.pn-lib-bar button', { hasText: /Rules · \d+/ }).innerText()).match(/\d+/)[0];
await p.goto(`${BASE}/planning?tab=benchmarks&view=rules&persona=${persona}&geo=${geo}`); await p.waitForSelector('.pn-lib-bar'); await p.waitForTimeout(500);
const n0 = await count(); ok(`rules tab: ${n0} rules`);
(await p.locator('.pn-lib-bar button', { hasText: 'New rule' }).count()) ? ok('New rule button') : fail('no New rule button');
/* 1 · configure the fuel rule's limit */
await p.locator('input[placeholder^="Rule, id"]').fill('fuel'); await p.waitForTimeout(300);
await p.locator('.dt tbody tr').first().click(); await p.waitForSelector('.drawer .pn-bm-form');
const limit = drawer().locator('.pn-bm-form section').nth(1).locator('input[type=number]').first();
const was = await limit.inputValue(); await limit.fill('72');
await p.waitForSelector('.pn-rule-impact, .drawer >> text=No open plan uses', { timeout: 20000 }).catch(() => {});
const imp = await drawer().locator('.pn-rule-impact').innerText().catch(() => '(no impact block)');
ok(`limit ${was} → 72; effect: ${imp.replace(/\s+/g, ' ')}`);
await shot('impact');
await drawer().locator('input[placeholder^="e.g. Board"]').fill('QA: longer autonomy');
const saveBtn = drawer().locator('button', { hasText: /^Save/ }); const saveTxt = await saveBtn.innerText();
await saveBtn.click(); await p.waitForTimeout(600);
const row = await p.locator('.dt tbody tr').first().innerText();
row.includes('72') ? ok(`saved (${saveTxt}); row shows 72`) : fail(`row after save: ${row.slice(0, 120)}`);
await p.locator('.dt tbody tr').first().click(); await p.waitForSelector('.drawer .pn-bm-form');
const h = await drawer().locator('.pn-bm-hist li').count(); h >= 1 ? ok(`history ${h} line(s)`) : fail('no rule history');
/* 2 · override in the first template */
const scope = drawer().locator('.pn-rule-scope select').first(); await scope.selectOption('own');
await drawer().locator('.pn-rule-scope').first().locator('button', { hasText: 'Must' }).click();
await drawer().locator('button', { hasText: /^Save/ }).click(); await p.waitForTimeout(600);
const nT = await drawer().count() ? 'drawer open' : 'closed';
(await p.locator('.dt tbody tr').first().locator('text=Overrides').count()) ? ok('override saved: Overrides chip') : fail(`no Overrides chip (${nT})`);
/* 3 · new rule from the check catalogue */
await p.locator('input[placeholder^="Rule, id"]').fill(''); await p.waitForTimeout(200);
await p.locator('.pn-lib-bar button', { hasText: 'New rule' }).click(); await p.waitForSelector('.drawer .pn-bm-form');
const cs = drawer().locator('select').first();
const val = await cs.locator('option', { hasText: 'Payback' }).first().getAttribute('value').catch(() => null) ?? await cs.locator('option:not([disabled])').first().getAttribute('value');
await cs.selectOption(val);
const add = drawer().locator('label', { hasText: 'Add to a template' }).locator('select');
if (!(await drawer().locator('.pn-rule-where tbody tr').count())) await add.selectOption({ index: 1 });
const tplN = await drawer().locator('.pn-rule-where tbody tr').count();
await p.waitForSelector('.pn-rule-impact, .drawer >> text=No open plan uses', { timeout: 20000 }).catch(() => {});
await shot('new');
const create = drawer().locator('button', { hasText: 'Create rule' });
(await create.isDisabled()) ? fail(`Create disabled: ${await drawer().locator('text=To save').innerText().catch(() => '')}`) : await create.click();
await p.waitForTimeout(600);
const n1 = await count(); n1 === n0 + 1 ? ok(`new rule ${val} in ${tplN} template(s): ${n0} → ${n1}`) : fail(`count ${n0} → ${n1}`);
/* 4 · remove it from every template */
await p.locator('input[placeholder^="Rule, id"]').fill('R-CUS'); await p.waitForTimeout(300);
await p.locator('.dt tbody tr').first().click(); await p.waitForSelector('.drawer .pn-bm-form');
await drawer().locator('button', { hasText: 'Remove from every template' }).click(); await p.locator('textarea').last().fill('QA clean-up of the test rule');
await p.locator('button', { hasText: 'Remove rule' }).click(); await p.waitForTimeout(600);
(await count()) === n0 ? ok('removed from every template') : fail(`count after remove ${await count()}`);
/* layout */
await p.locator('input[placeholder^="Rule, id"]').fill('fuel'); await p.waitForTimeout(300);
await p.locator('.dt tbody tr').first().click(); await p.waitForSelector('.drawer .pn-bm-form');
const ov = await p.evaluate(() => { const d = document.querySelector('.drawer'); return [...d.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== 'visible' && !['SELECT', 'INPUT'].includes(e.tagName)).length + (document.documentElement.scrollWidth > innerWidth + 1 ? 100 : 0); });
ov === 0 ? ok('no overflow') : fail(`overflow ${ov}`);
await shot('edit');
const real = errs.filter(e => !/favicon|DevTools|Download the React/.test(e));
real.length ? fail(`console: ${real.slice(0, 3).join(' | ')}`) : ok('no console errors');
await b.close(); console.log(bad ? `rules: ${bad} FAILED` : 'rules ok'); process.exit(bad ? 1 : 0);
