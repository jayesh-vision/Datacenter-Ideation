// Plan-page editors of equipment / racks / waves and risks / permits (plan/EquipmentEditor.tsx, plan/RisksPermits.tsx) under the
// plan-page edit rule (plan/edit/policy.ts): draft = in place, in review = withdraw first, approved = revision B (lands on B, the
// approved plan untouched), on hold = read only (no forms). Checks errors, NaN / undefined, horizontal overflow at W (default 1440).
// usage: node .qa/p2b-plan-edit-eq.mjs [persona] [geo]      (SHOTS=1 keeps a screenshot per step in .qa/out/eq-*.png)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'us', W = Number(process.env.W ?? 1440);
const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text().slice(0, 300)); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const shot = async name => { if (process.env.SHOTS) await p.screenshot({ path: `.qa/out/eq-${G}-${W}-${name}.png`, fullPage: true }); };
const check = async name => {
  await p.waitForTimeout(300);
  const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.querySelector('.page')?.innerText.includes(w)));
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  ok(!t.length && !over && !errs.length, `${name}${t.length ? ' TEXT ' + t : ''}${over ? ' OVERFLOW' : ''}${errs.length ? ' ERR ' + errs.slice(0, 2).join(' | ') : ''}`);
  if (t.length || over || errs.length) await p.screenshot({ path: `.qa/out/eq-fail-${name.replace(/\W+/g, '_')}.png`, fullPage: true });
  errs.length = 0; await shot(name.replace(/\W+/g, '_'));
};
const fx = key => p.locator(`.peq-fx-i[data-key="${key}"] > b`).first().innerText().then(t => t.split(/\s+/).pop()).catch(() => '');
const status = () => p.locator('.page').first().innerText().then(t => (t.match(/\b(Draft|In review|Approved|Executing|On hold|Rejected)\b/) ?? [])[1]);
const open = async (id, tab) => { await p.goto(`http://localhost:5181/planning/plans/${id}?tab=${tab}`, { waitUntil: 'networkidle' }); await p.waitForSelector(tab === 'overview' ? '.page h1' : '[data-editor]', { timeout: 15000 }); await p.waitForTimeout(800); };
const bar = () => p.locator('.peq-bar');
const barBtn = label => bar().getByRole('button', { name: label, exact: true });
const modalBtn = label => p.locator('.modal .drawer-foot').getByRole('button', { name: label, exact: true });

await p.goto(`http://localhost:5181/?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' });

// ---- A. draft (in place): network refresh PLN-0014 — tick one more device, save
console.log('A. draft PLN-0014 equipment, in place');
await open('PLN-0014', 'equipment');
await check('PLN-0014 equipment');
ok(!(await p.locator('.pn-editnote').count()), 'no banner on a draft');
const d0 = Number(await fx('devices'));
await p.locator('.pn-aff-tbl tbody tr:not(.is-selected) button[role=checkbox]').first().click(); await p.waitForTimeout(700);
ok(await bar().isVisible(), 'change bar shows the pending change');
ok((await p.locator('.peq-fx-i.is-moved[data-key="devices"]').count()) === 1, `strip shows devices before → after (${await fx('devices')})`);
ok(await barBtn('Save').isVisible(), 'commit label "Save"');
await check('PLN-0014 pending');
await barBtn('Save').click(); await p.waitForTimeout(900);
ok(!(await bar().count()), 'bar gone after save');
ok(Number(await fx('devices')) === d0 + 1, `devices ${d0} → ${await fx('devices')}`);
ok((await status()) === 'Draft', 'still Draft');
// waves: make them, save
await p.locator('.peq .seg button', { hasText: 'Waves and windows' }).click(); await p.waitForTimeout(500);
const w0 = Number(await fx('waves'));
await p.getByRole('button', { name: /^(Make|Remake) waves$/ }).click(); await p.waitForTimeout(900);
ok(await bar().isVisible(), `waves made: bar shows (${await bar().locator('.peq-bar-fx').innerText().catch(() => '')})`);
await check('PLN-0014 waves pending');
await barBtn('Save').click(); await p.waitForTimeout(900);
ok(Number(await fx('waves')) > 0 && !(await bar().count()), `waves ${w0} → ${await fx('waves')} saved`);

// ---- B. in review (withdraw first): server refresh PLN-0013 — untick one device
console.log('B. in review PLN-0013 equipment, withdraw first');
await open('PLN-0013', 'equipment');
ok((await p.locator('.pn-editnote').getAttribute('data-mode')) === 'withdraw-first', 'banner says withdraw first');
const b0 = Number(await fx('devices'));
await p.locator('.pn-aff-tbl tbody tr.is-selected button[role=checkbox]').first().click(); await p.waitForTimeout(700);
ok(await barBtn('Withdraw and save').isVisible(), 'commit label "Withdraw and save"');
await barBtn('Withdraw and save').click(); await p.waitForTimeout(400);
ok(await p.locator('.modal').isVisible(), 'withdraw goes through the review dialog');
await check('PLN-0013 review dialog');
await modalBtn('Withdraw and save').click(); await p.waitForTimeout(1200);
ok((await status()) === 'Draft', `PLN-0013 withdrawn to Draft (${await status()})`);
ok(Number(await fx('devices')) === b0 - 1, `devices ${b0} → ${await fx('devices')}`);

// ---- C. approved (revision): hall PLN-0002 — one more rack in the first class
console.log('C. approved PLN-0002 racks, revision');
await open('PLN-0002', 'equipment');
ok((await p.locator('.pn-editnote').getAttribute('data-mode')) === 'revision', 'banner says revision');
const r0 = Number(await fx('racks'));
const inp = p.locator('.peq-body table tbody tr').first().locator('input[type=number]').first();
const v0 = Number(await inp.inputValue()); await inp.fill(String(v0 + 1)); await p.waitForTimeout(900);
ok(Number(await fx('racks')) === r0 + 1, `racks ${r0} → ${await fx('racks')}`);
ok(await barBtn('Draft revision B').isVisible(), 'commit label "Draft revision B"');
await check('PLN-0002 pending');
await barBtn('Draft revision B').click(); await p.waitForTimeout(400);
await modalBtn('Draft revision B').click(); await p.waitForTimeout(1500);
ok(/PLN-0002-B\?tab=equipment/.test(p.url()), `landed on the revision, same tab (${p.url().replace(/^.*plans\//, '')})`);
ok((await p.locator('.page').innerText()).includes('Rev B') || (await p.locator('.page').innerText()).includes('Revision B'), 'header shows revision B');
ok(Number(await fx('racks')) === r0 + 1, `revision B has ${await fx('racks')} racks`);
await check('PLN-0002-B equipment');
await p.goBack(); await p.waitForTimeout(1200);
ok(Number(await fx('racks')) === r0, `PLN-0002 untouched (${await fx('racks')} racks)`);
ok(await p.locator('.pn-editnote a', { hasText: 'PLN-0002-B' }).count() > 0, 'banner links the open revision');

// ---- D. migration draft PLN-0006: change one disposition
console.log('D. migration PLN-0006 inventory');
await open('PLN-0006', 'equipment');
await check('PLN-0006 inventory');
const sel = p.locator('.peq-body table tbody tr').first().locator('select').first();
const opts = await sel.locator('option').evaluateAll(os => os.map(o => o.value).filter(Boolean));
const cur = await sel.inputValue(); const other = opts.find(o => o !== cur);
if (other) {
  await sel.selectOption(other); await p.waitForTimeout(900);
  ok(await bar().isVisible(), `disposition ${cur} → ${other}: ${await bar().locator('.peq-bar-fx').innerText().catch(() => '')}`);
  await barBtn('Save').click(); await p.waitForTimeout(900);
  ok(!(await bar().count()), 'inventory saved');
} else ok(false, 'no other disposition to pick');
await p.locator('.peq .seg button', { hasText: 'Waves and windows' }).click(); await p.waitForTimeout(600);
await check('PLN-0006 waves');

// ---- E. in-site: rack PLN-0004, pod PLN-0005, retrofit PLN-0008 open clean
for (const id of ['PLN-0004', 'PLN-0005', 'PLN-0008', 'PLN-0015']) {
  console.log(`E. ${id} equipment`);
  await open(id, 'equipment'); await check(`${id} equipment`);
  for (const s of await p.locator('.peq .seg button').all()) { await s.click(); await p.waitForTimeout(500); await check(`${id} ${await s.innerText()}`); }
}

// ---- F. risks & permits
console.log('F. risks & permits');
await open('PLN-0004', 'risks'); await check('PLN-0004 risks');
const rk0 = await p.locator('ul[aria-label=Risks] > li').count();
await p.getByRole('button', { name: 'Add a risk' }).click(); await p.waitForTimeout(300);
await p.locator('.drawer input.input').first().fill('Crane access to the loading bay'); await check('PLN-0004 risk drawer');
await p.locator('.drawer-foot').getByRole('button', { name: 'Add' }).click(); await p.waitForTimeout(500);
ok(await barBtn('Save').isVisible(), 'risk added: bar with Save');
await barBtn('Save').click(); await p.waitForTimeout(800);
ok((await p.locator('ul[aria-label=Risks] > li').count()) === rk0 + 1 && !(await bar().count()), 'draft: risk saved in place');

await open('PLN-0002', 'risks'); await check('PLN-0002 risks');
const pm = p.locator('ul[aria-label=Permits] > li:not(.is-gone)').filter({ hasNot: p.locator('text=Granted') }).first();
if (await pm.count()) {
  await pm.click(); await p.waitForTimeout(300);
  await p.locator('.drawer select').first().selectOption('Approved'); await p.locator('.drawer-foot').getByRole('button', { name: 'Apply' }).click(); await p.waitForTimeout(500);
  ok(await barBtn('Save').isVisible(), 'approved: a status update saves straight (living register)');
  await barBtn('Save').click(); await p.waitForTimeout(900);
  ok(/PLN-0002\?tab=risks/.test(p.url()) && !/PLN-0002-B/.test(p.url()), 'stayed on PLN-0002');
}
await p.getByRole('button', { name: 'Add a permit' }).click(); await p.waitForTimeout(300);
await p.locator('.drawer input.input').first().fill('Crane lift permit'); await p.locator('.drawer-foot').getByRole('button', { name: 'Add' }).click(); await p.waitForTimeout(500);
const lbl = await bar().getByRole('button', { name: /revision B/ }).innerText().catch(() => '');
ok(/Draft revision B|Save to revision B/.test(lbl), `approved: adding a permit goes to a revision ("${lbl}")`);
await bar().getByRole('button', { name: /revision B/ }).click(); await p.waitForTimeout(400); await check('PLN-0002 permit review');
await p.locator('.modal .drawer-foot').getByRole('button', { name: /revision B/ }).click(); await p.waitForTimeout(1500);
ok(/PLN-0002-B\?tab=risks/.test(p.url()) && (await p.locator('ul[aria-label=Permits]').innerText()).includes('Crane lift permit'), 'revision B carries the new permit');

// ---- G. in review + on hold (read only)
console.log('G. in review risks + on hold read-only');
await open('PLN-0001', 'risks');
await p.locator('ul[aria-label=Risks] > li').first().click(); await p.waitForTimeout(300);
await p.locator('.drawer textarea').first().fill('Book the crane and the road closure now.'); await p.locator('.drawer-foot').getByRole('button', { name: 'Apply' }).click(); await p.waitForTimeout(500);
ok(await barBtn('Withdraw and save').isVisible(), 'in review: "Withdraw and save"');
await barBtn('Withdraw and save').click(); await modalBtn('Withdraw and save').click(); await p.waitForTimeout(1200);
ok((await status()) === 'Draft', 'PLN-0001 withdrawn and saved');
await open('PLN-0013', 'overview');
await p.getByRole('button', { name: 'Actions' }).click(); await p.getByRole('menuitem', { name: 'Put on hold' }).or(p.getByRole('button', { name: 'Put on hold' })).first().click(); await p.waitForTimeout(300);
await p.locator('.modal textarea').fill('Budget review'); await p.locator('.modal .drawer-foot button').last().click(); await p.waitForTimeout(900);
for (const [label, sel2] of [['equipment', '[data-id="equipment"]'], ['risks', '[data-id="risks"]']]) {
  const t = p.locator(sel2); if (await t.count()) await t.click(); else { await p.locator('.pn-tab-more').click(); await p.locator('.pn-tabbar .menu .menu-item').filter({ hasText: label === 'risks' ? 'Risks' : 'Equipment' }).first().click(); }
  await p.waitForTimeout(800);
  ok((await p.locator('.pn-editnote').getAttribute('data-mode').catch(() => '')) === 'read-only', `on hold ${label}: read-only banner`);
  const forms = await p.locator('[data-editor] .peq-body input:not([type=search]):not([placeholder*="Name"]), [data-editor] .peq-body select:not(.pn-aff-pick select)').count();
  ok(!(await bar().count()) && (label === 'risks' ? !(await p.getByRole('button', { name: 'Add a risk' }).count()) : true), `on hold ${label}: no change bar${label === 'risks' ? ', no add buttons' : ''}`);
  if (label === 'equipment') ok(!(await p.locator('[data-editor] .peq-body button[role=checkbox]').count()), `on hold equipment: no checkboxes (${forms} filter inputs)`);
  await check(`PLN-0013 on hold ${label}`);
}
await b.close();
console.log(bad ? `${bad} problem(s)` : 'all clear'); process.exit(bad ? 1 : 0);
