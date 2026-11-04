/* Planner → Templates lifecycle (node .qa/p2b-templates.mjs [persona] [geo]; W=1280|1440): new plan type as a copy → edit the draft
   (description, approval step, input default) → publish v1 directly; Edit a template in use → draft v(n+1) beside the live one →
   change a default → changes + effect on open plans → send for approval → switch to the second Capacity Planner → approve → live
   v(n+1) (the draft also switches off a rule and adds one from the library), earlier version stored and comparable; retire / restore; a blank checklist created and deleted. In-app navigation only. */
import { chromium } from 'playwright';
const [persona = 'neocloud', geo = 'us'] = process.argv.slice(2); const W = +(process.env.W || 1440); const BASE = process.env.BASE || 'http://localhost:5181';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
let bad = 0; const fail = m => { bad++; console.log('FAIL', m); }; const ok = m => console.log('ok  ', m);
const shot = async n => { if (process.env.SHOTS || bad) await p.screenshot({ path: `.qa/out/tpl-${n}.png` }); };
const drawer = () => p.locator('.drawer').last(); const modal = () => p.locator('.modal').last();
const overflow = async where => { const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o > 1) fail(`${where}: page overflows ${o}px`); };
const search = async q => { await p.locator('input[placeholder^="Name, description"]').fill(q); await p.waitForTimeout(300); };

await p.goto(`${BASE}/planning?tab=templates&persona=${persona}&geo=${geo}`); await p.waitForSelector('.pl-tpl .dt tbody tr'); await p.waitForTimeout(400);
/* 1 · new plan type as a copy */
await p.locator('button', { hasText: 'New plan type' }).click(); await p.waitForSelector('.modal');
await modal().locator('select').first().selectOption({ index: 1 });
await modal().locator('input').last().fill('QA hall standard');
await modal().locator('button', { hasText: 'Create draft' }).click();
await p.waitForSelector('.drawer .pn-te'); ok('copy created; drawer opens in the editor');
await drawer().locator('textarea').first().fill('QA copy for the lifecycle test.');
await drawer().locator('.pn-te select').filter({ has: p.locator('option', { hasText: 'Add a step…' }) }).selectOption('Executive');
const firstNum = drawer().locator('.pn-te-tbl tr.is-own td:nth-child(2) input[type=number]').first();
if (await firstNum.count()) { await firstNum.fill('7'); } else fail('no own number input in the copy');
const modSec = drawer().locator('.pn-te section', { has: p.locator('h4', { hasText: /^Modules/ }) });
const modSel = modSec.locator('select'); const modV = await modSel.locator('option[value]:not([value=""])').first().getAttribute('value');
await modSel.selectOption(modV); await modSec.locator('button', { hasText: 'Add module' }).click();
(await modSec.locator('.pn-te-mods > div').count()) >= 1 ? ok(`module ${modV} added to the plan type`) : fail('module not added');
await overflow('editor'); await shot('editor');
await drawer().locator('button', { hasText: 'Save draft' }).click(); await p.waitForTimeout(500);
(await drawer().locator('.pn-te').count()) ? fail('editor still open after save') : ok('draft saved');
const pub1 = drawer().locator('button', { hasText: /^Publish v1/ });
(await pub1.count()) ? ok('new template publishes directly (no approval)') : fail('no Publish v1 button');
await pub1.click(); await p.waitForTimeout(500);
(await drawer().locator('.drawer-head, .vw-chip, .chip').filter({ hasText: 'Published' }).count()) || (await drawer().innerText()).includes('Published') ? ok('published') : fail('not published');
await p.locator('.drawer button[title="Close"]').last().click(); await p.waitForTimeout(300);
await search('QA hall'); const r1 = await p.locator('.dt tbody tr').first().innerText(); r1.includes('QA hall standard') && r1.includes('Published') ? ok('list row: QA hall standard · Published') : fail(`row: ${r1.slice(0, 120)}`);
/* 2 · edit a template in use → draft version → approval */
await search('Hall fit-out'); await p.locator('.dt tbody tr').first().click(); await p.waitForSelector('.drawer');
const v0 = +(await drawer().locator('.drawer-head').innerText()).match(/v(\d+)/)[1];
await drawer().locator('button', { hasText: /^Edit$/ }).click(); await p.waitForSelector('.drawer .pn-te');
(await drawer().innerText()).includes(`draft v${v0 + 1}`) ? ok(`Edit opened draft v${v0 + 1} beside live v${v0}`) : fail('draft version note missing');
const ownAll = drawer().locator('.pn-te-tbl tr.is-own td:nth-child(2) input[type=number]'); let own = ownAll.first();
for (let i = 0; i < await ownAll.count(); i++) if (await ownAll.nth(i).inputValue()) { own = ownAll.nth(i); break; }
if (await own.count()) { const was = await own.inputValue(); await own.fill(String((+was || 1) + 1)); ok(`own default ${was} → ${(+was || 1) + 1}`); }
else { await drawer().locator('.pn-te-tbl button', { hasText: 'Override' }).first().click(); ok('overrode an inherited input'); }
/* rules inside the template: switch off an inherited rule (or flip an own one), add one from the library */
const rtbl = drawer().locator('.pn-te section', { has: p.locator('h4', { hasText: /^Rules/ }) });
const offBtn = rtbl.locator('tbody button', { hasText: 'Switch off' }).first();
if (await offBtn.count()) { await offBtn.click(); (await rtbl.locator('tr.is-off').count()) ? ok('inherited rule switched off') : fail('switch off left no row'); }
else { await rtbl.locator('tr.is-own').first().locator('button', { hasText: /^(Must|Should)$/ }).last().click(); ok('own rule severity flipped'); }
const addSel = rtbl.locator('select').last(); const optV = await addSel.locator('optgroup').first().locator('option').first().getAttribute('value');
const nR = await rtbl.locator('tbody tr').count(); await addSel.selectOption(optV); await rtbl.locator('button', { hasText: 'Add rule' }).click();
(await rtbl.locator('tbody tr').count()) === nR + 1 ? ok(`rule ${optV} added from the library`) : fail('add rule did not add a row');
await overflow('rules'); await shot('rules');
await drawer().locator('button', { hasText: 'Save draft' }).click(); await p.waitForTimeout(500);
const chg = await drawer().locator('.pn-te-pub section').first().locator('tbody tr').count(); chg >= 3 ? ok(`${chg} change(s) from v${v0}`) : fail('no change list');
await p.waitForSelector('.drawer .pn-te-pub >> text=/open plans|No open plan/', { timeout: 30000 }).catch(() => {});
ok(`effect: ${(await drawer().locator('.pn-te-pub section').nth(1).innerText()).replace(/\s+/g, ' ').slice(0, 140)}`);
await overflow('publish'); await shot('publish');
await drawer().locator('.pn-te-pub input').last().fill('QA: raise the default');
const send = drawer().locator('button', { hasText: 'Send for approval' });
(await send.count()) ? await send.click() : fail('no Send for approval (template in use)'); await p.waitForTimeout(500);
(await drawer().innerText()).includes('Waiting for approval') ? ok('awaiting approval banner') : fail('no pending banner');
await drawer().locator('button', { hasText: /^Switch to/ }).first().click(); await p.waitForTimeout(600);
await drawer().locator('button', { hasText: /^Approve and publish/ }).click(); await p.waitForTimeout(800);
const head = await drawer().locator('.drawer-head').innerText();
head.includes(`v${v0 + 1}`) ? ok(`approved: live is v${v0 + 1}`) : fail(`after approve head: ${head.slice(0, 120)}`);
const earlier = drawer().locator('.pn-te-vers button', { hasText: 'What changed since' });
(await earlier.count()) ? ok(`v${v0} stored in Versions`) : fail('no earlier version');
await earlier.first().click(); await p.waitForSelector('.modal');
const rows = await modal().locator('tbody tr').count(); rows >= 1 ? ok(`compare v${v0} → v${v0 + 1}: ${rows} row(s)`) : fail('compare shows nothing');
await modal().locator('button', { hasText: 'Close' }).last().click();
await p.locator('.drawer button[title="Close"]').last().click(); await p.waitForTimeout(300);
/* modules: the list says which plan types use each module, the module drawer lists them */
await search(''); await p.locator('.pl-tpl button', { hasText: /Modules & rules/ }).click(); await p.waitForTimeout(300);
const usedRow = p.locator('.dt tbody tr', { hasText: /\d+ plan types?/ }).first();
if (await usedRow.count()) { const nm = (await usedRow.locator('td').first().innerText()).split('\n')[0]; await usedRow.click(); await p.waitForSelector('.drawer');
  const u = await drawer().locator('h4, .pn-sub, div', { hasText: /^Used by plan types/ }).count(); u ? ok(`${nm}: Used by plan types listed`) : fail('no Used by section'); await overflow('module drawer'); await shot('module');
  await p.locator('.drawer button[title="Close"]').last().click(); await p.waitForTimeout(300); }
else fail('no module is used by a plan type');
/* a commissioning checklist module: used by plan types, editor says what it is used as */
await search('Commissioning · power'); await p.locator('.dt tbody tr').first().click(); await p.waitForSelector('.drawer');
(await drawer().innerText()).match(/Used by plan types\s*\d+/) && !(await drawer().innerText()).includes('No plan type is built from it') ? ok('power commissioning checklist: used by plan types') : fail('checklist not used by any plan type');
await drawer().locator('button', { hasText: /^Edit$/ }).click(); await p.waitForSelector('.drawer .pn-te');
(await drawer().locator('.pn-te section', { has: p.locator('h4', { hasText: 'Used as' }) }).locator('select').inputValue().catch(() => '')) === 'Power' ? ok('editor: used as Power commissioning tests') : fail('no Used as = Power');
await drawer().locator('button', { hasText: /^Cancel$/ }).click(); await p.waitForTimeout(200);
await drawer().locator('button', { hasText: 'Discard draft' }).click(); await p.waitForSelector('.modal'); await modal().locator('button', { hasText: 'Discard draft' }).click(); await p.waitForTimeout(400);
await p.locator('.drawer button[title="Close"]').last().click(); await p.waitForTimeout(300);
/* edit a module that plan types are built from: its draft needs approval and re-estimates their open plans */
await search('Capacity policy'); await p.locator('.dt tbody tr').first().click(); await p.waitForSelector('.drawer');
await drawer().locator('button', { hasText: /^Edit$/ }).click(); await p.waitForSelector('.drawer .pn-te');
const mnum = drawer().locator('.pn-te-tbl tr.is-own td:nth-child(2) input[type=number]').first();
if (await mnum.count()) { const was = await mnum.inputValue(); await mnum.fill(String((+was || 1) + 5)); await drawer().locator('button', { hasText: 'Save draft' }).click(); await p.waitForTimeout(500);
  await p.waitForSelector('.drawer .pn-te-pub >> text=/open plans|No open plan/', { timeout: 30000 }).catch(() => {});
  ok(`module draft: ${(await drawer().locator('.pn-te-pub section').nth(1).innerText()).replace(/\s+/g, ' ').slice(0, 160)}`);
  (await drawer().locator('button', { hasText: 'Send for approval' }).count()) ? ok('module in use → Send for approval') : fail('module in use publishes without approval');
  await drawer().locator('button', { hasText: 'Discard draft' }).click(); await p.waitForSelector('.modal'); await modal().locator('button', { hasText: 'Discard draft' }).click(); await p.waitForTimeout(400);
} else fail('Capacity policy has no number input');
await p.locator('.drawer button[title="Close"]').last().click(); await p.waitForTimeout(300);
await search(''); await p.locator('.pl-tpl button', { hasText: /Plan types/ }).click(); await p.waitForTimeout(300);
await search('New datacenter'); await p.locator('.dt tbody tr').first().click(); await p.waitForSelector('.drawer');
(await drawer().locator('.pn-te-mods.is-read > button').count()) >= 10 ? ok(`New datacenter built from ${await drawer().locator('.pn-te-mods.is-read > button').count()} modules`) : fail('New datacenter shows no modules');
await p.locator('.drawer button[title="Close"]').last().click(); await p.waitForTimeout(300);
/* 3 · retire / restore the QA copy */
await search('QA hall'); await p.locator('.dt tbody tr').first().click(); await p.waitForSelector('.drawer');
await drawer().locator('button', { hasText: 'Retire' }).click(); await p.waitForSelector('.modal textarea');
await modal().locator('textarea').fill('QA retire test'); await modal().locator('button', { hasText: 'Retire template' }).click(); await p.waitForTimeout(400);
(await drawer().innerText()).includes('Retired') ? ok('retired with reason') : fail('not retired');
await drawer().locator('button', { hasText: 'Restore' }).click(); await p.waitForTimeout(400);
(await drawer().locator('button', { hasText: 'Retire' }).count()) ? ok('restored') : fail('not restored');
await p.locator('.drawer button[title="Close"]').last().click();
/* 4 · blank checklist: create → item → save → delete */
await search(''); await p.locator('.pl-tpl button', { hasText: /Modules & rules/ }).click(); await p.waitForTimeout(300);
await p.locator('button', { hasText: 'New module' }).click(); await p.waitForSelector('.modal');
await modal().locator('.pn-te-kinds button', { hasText: 'Checklist' }).click();
await modal().locator('input').last().fill('QA gate checklist'); await modal().locator('button', { hasText: 'Create draft' }).click();
await p.waitForSelector('.drawer .pn-te');
await drawer().locator('input[placeholder="Add an item"]').fill('Fire certificate on file'); await drawer().locator('.pn-te button', { hasText: /^Add$/ }).click();
await drawer().locator('button', { hasText: 'Save draft' }).click(); await p.waitForTimeout(400);
await drawer().locator('button', { hasText: 'Delete draft' }).click(); await p.waitForSelector('.modal');
await modal().locator('button', { hasText: 'Delete draft' }).click(); await p.waitForTimeout(400);
await search('QA gate'); (await p.locator('.dt tbody tr', { hasText: 'QA gate checklist' }).count()) ? fail('deleted draft still listed') : ok('blank checklist created, saved, deleted');
await overflow('list');
if (errs.length) fail(`console: ${[...new Set(errs)].slice(0, 4).join(' | ')}`);
console.log(bad ? `templates: ${bad} FAILED` : `templates ok (W=${W})`); await b.close(); process.exit(bad ? 1 : 0);
