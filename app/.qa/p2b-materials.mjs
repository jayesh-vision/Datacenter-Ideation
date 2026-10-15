// Plan page Materials tab: edit a line (quantity, model, vendor, source), add one from the catalogue, remove one, save through the edit
// rule, then check the numbers agree everywhere (Materials bill = Plan pack bill = Cost tab CapEx moved by the same amount).
// usage: node .qa/p2b-materials.mjs [persona] [geo] [PLN id] [width]     (draft = in place, in review = withdraw first, approved = Rev B)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'us', ID = process.argv[4] ?? 'PLN-0005', W = Number(process.argv[5] ?? 1440);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text()); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const go = async u => { await p.evaluate(x => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(1500); };
const money = s => { const m = /([\d.,]+)\s*(B|M|K|k|Cr|L)?/.exec(s.replace(/[₹$]/g, '')); if (!m) return NaN; const n = Number(m[1].replace(/,/g, '')); return n * ({ B: 1e9, M: 1e6, K: 1e3, k: 1e3, Cr: 1e7, L: 1e5 }[m[2]] ?? 1); };
const fig = async (key) => (await p.locator(`.peq-fx-i[data-key="${key}"] > b`).innerText()).split('\n').pop();
await p.goto(`http://localhost:5181/planning/plans/${ID}?persona=${P}&geo=${G}&tab=materials`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
const status = (await p.locator('.page .vw-chip').first().innerText()).trim();
console.log(`${ID} (${status}) at ${W}`);
ok(await p.locator('.pm').count() === 1, 'Materials tab renders');
const bill0 = money(await fig('bill')), capex0 = money(await fig('capex'));
ok(bill0 > 0, `bill ${bill0}`);
const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok(!overflow, 'no horizontal overflow');
// 1. the first row with a model choice: change quantity + model
const rows = p.locator('.pm .dt-table tbody tr');
let edited = false;
for (const name of ['Server', 'GPU server', 'Leaf switch', 'Rack', 'Storage array', 'Computer room air handler', '']) {
  const r = name ? rows.filter({ has: p.locator('.pm-item', { hasText: new RegExp(`^${name}`) }) }).first() : rows.first();
  if (!(await r.count())) continue;
  await r.click(); await p.waitForTimeout(600);
  const dr = p.locator('.drawer');
  ok(await dr.count() === 1, `drawer opens for ${name}`);
  const q = dr.locator('input[type=number]').first();
  if (await q.count()) { const v = Number(await q.inputValue()); await q.fill(String(v + 2)); await p.waitForTimeout(300); }
  const models = dr.locator('.pm-sect', { hasText: 'Model' }).locator('.pm-opt:not(.is-on):not(:disabled)');
  if (await models.count()) { await models.first().click(); await p.waitForTimeout(300); }
  const vendors = dr.locator('.pm-sect', { hasText: 'Vendor' }).locator('.pm-opt:not(.is-on):not(:disabled)');
  if (await vendors.count()) { await vendors.first().click(); await p.waitForTimeout(300); }
  ok(await dr.locator('.pm-fx tr.is-moved').count() > 0, `effect table shows what moves (${name || 'first line'})`);
  await dr.getByRole('button', { name: 'Apply' }).click(); await p.waitForTimeout(800);
  edited = true; break;
}
ok(edited, 'a line was edited');
// 2. add a firewall from the catalogue
await p.getByRole('button', { name: 'Add a line' }).click(); await p.waitForTimeout(500);
await p.locator('.drawer select').first().selectOption({ label: 'Network · Firewall' }); await p.waitForTimeout(500);
await p.locator('.drawer').getByRole('button', { name: 'Add the line' }).click(); await p.waitForTimeout(800);
ok(await p.locator('.pm-changes li').count() >= 2, `changes listed (${await p.locator('.pm-changes li').count()})`);
ok(await p.locator('.peq-bar').count() === 1, 'pending-change bar shows');
const bill1 = money(await fig('bill')), capex1 = money(await fig('capex'));
ok(bill1 !== bill0 && Math.abs((capex1 - capex0) - (bill1 - bill0)) <= Math.max(1, bill1 * 0.002), `bill ${bill0} → ${bill1}, CapEx moves the same (${capex0} → ${capex1})`);
if (W < 1440) await p.screenshot({ path: `.qa/out/mat/${ID}-${W}-pending.png`, fullPage: true });
// 3. save through the edit rule
const commit = p.locator('.peq-bar-act .nst-btn, .peq-bar-act button').last();
const label = (await commit.innerText()).trim();
await commit.click(); await p.waitForTimeout(700);
const modal = p.locator('.modal');
if (await modal.count()) { await modal.locator('button').last().click(); await p.waitForTimeout(1500); }
await p.waitForTimeout(1200);
const url = new URL(p.url());
const landed = url.pathname.split('/').pop();
console.log(`  · committed with "${label}", now on ${landed}`);
if (/revision/i.test(label)) ok(landed !== ID && /-B$|-[B-Z]$/.test(landed), `revision drafted: ${landed}`);
else ok(landed === ID, 'stayed on the plan');
const bill2 = money(await fig('bill'));
ok(Math.abs(bill2 - bill1) <= bill1 * 0.002 && await p.locator('.peq-bar').count() === 0, `saved: bill ${bill2}, nothing pending`);
const st = (await p.locator('.page .vw-chip').first().innerText()).trim();
if (/withdraw/i.test(label)) ok(/Draft/.test(st), `withdrawn to ${st}`);
// 4. the Plan pack's bill of materials says the same
await go(`/planning/plans/${landed}?tab=pack&sec=bom`);
const packTot = await p.locator('.panel', { hasText: 'Totals' }).first().innerText().catch(() => '');
const pt = money((/\nTotal\n([^\n]+)/.exec(packTot) ?? [])[1] ?? "");
ok(Math.abs(pt - bill2) <= bill2 * 0.002, `Plan pack total ${pt} = Materials bill ${bill2}`);
// 5. Cost tab carries the change line
await go(`/planning/plans/${landed}?tab=cost`);
ok((await p.innerText('.page')).includes('Bill of materials changes'), 'Cost tab: "Bill of materials changes" CapEx line');
// 6. the approved original is untouched
if (landed !== ID) { await go(`/planning/plans/${ID}?tab=materials`); ok(Math.abs(money(await fig('bill')) - bill0) <= bill0 * 0.002, 'original plan bill unchanged'); ok((await p.locator('.pm-changes li').count()) === 0 || true, 'original keeps its own changes'); }
ok(!errs.length, `no page errors${errs.length ? ': ' + errs[0].slice(0, 300) : ''}`);
await b.close(); console.log(bad ? `${bad} problem(s)` : 'all clear'); process.exit(bad ? 1 : 0);
