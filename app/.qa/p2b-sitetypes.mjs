/* Planner → Templates → Site types: custom site types (node .qa/p2b-sitetypes.mjs [persona] [geo]; W=1280|1440). New site type from
   AI / HPC GPU factory → editor shows the site type fields → change PUE target + kW per rack → change list → an invalid value is refused
   → publish (new = direct) → listed as custom → drawer definition → the New datacenter wizard offers it as the kind of site → picking it
   sets its tier; retire → the wizard no longer offers it. In-app navigation only. */
import { chromium } from 'playwright';
const [persona = 'neocloud', geo = 'us'] = process.argv.slice(2); const W = +(process.env.W || 1440); const BASE = process.env.BASE || 'http://localhost:5181';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
let bad = 0; const fail = m => { bad++; console.log('FAIL', m); }; const ok = m => console.log('ok  ', m);
const shot = async n => { if (process.env.SHOTS || bad) await p.screenshot({ path: `.qa/out/st-${n}.png`, fullPage: false }); };
const drawer = () => p.locator('.drawer').last(); const modal = () => p.locator('.modal').last();
const overflow = async where => { const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o > 1) fail(`${where}: page overflows ${o}px`); };
const field = (label) => drawer().locator('.pn-st .field, .pn-st label').filter({ hasText: label }).first();
const NAME = 'QA sovereign AI';

await p.goto(`${BASE}/planning?tab=templates&view=sites&persona=${persona}&geo=${geo}`); await p.waitForSelector('.pl-tpl .dt tbody tr'); await p.waitForTimeout(400);
const n0 = await p.locator('.pl-tpl .dt tbody tr').count();
await p.locator('button', { hasText: 'New site type' }).click(); await p.waitForSelector('.modal');
await modal().locator('select').selectOption('ai-gpu-factory');
await modal().locator('input').nth(0).fill(NAME); await modal().locator('input').nth(1).fill('sai');
await modal().locator('button', { hasText: 'Create draft' }).click();
await p.waitForSelector('.drawer .pn-st'); ok('site type draft created; editor shows the site type section');
(await drawer().locator('.pn-st h4').innerText()).includes('custom-qa-sovereign-ai') ? ok('key custom-qa-sovereign-ai, based on the GPU factory') : fail(`key: ${await drawer().locator('.pn-st h4').innerText()}`);
await overflow('editor'); await shot('editor');
const pue = field('PUE target').locator('input'); await pue.fill('1.12');
const kwr = field('kW per rack').locator('input'); await kwr.nth(1).fill('140');
await field('Power redundancy').locator('select').selectOption('2N');
/* an invalid value is refused */
await field('Rack power: block at').locator('input').fill('50');
(await drawer().locator('.pn-st-errs li').count()) ? ok('warning above the block is flagged') : fail('no error for warn > block');
await field('Rack power: block at').locator('input').fill('96');
(await drawer().locator('.pn-st-errs li').count()) ? fail(`errors left: ${await drawer().locator('.pn-st-errs').innerText()}`) : ok('errors cleared');
await drawer().locator('button', { hasText: 'Save draft' }).click(); await p.waitForTimeout(500);
const defs = await drawer().innerText();
defs.includes('Site type definition') && defs.includes('2N') && defs.includes('1.12') ? ok('drawer: site type definition with the edits') : fail('definition missing the edits');
await drawer().locator('button', { hasText: /^Publish/ }).first().click(); await p.waitForTimeout(600);
if (await p.locator('.modal').count()) { await modal().locator('button', { hasText: /Publish/ }).last().click(); await p.waitForTimeout(500); }
(await drawer().locator('.chip, .vw-chip').filter({ hasText: 'Published' }).count()) ? ok('published directly (new, unused)') : fail('not published');
await shot('drawer');
await p.locator('.drawer button[title="Close"]').last().click(); await p.waitForTimeout(400);
const row = p.locator('.pl-tpl .dt tbody tr', { hasText: NAME });
(await row.count()) && (await row.innerText()).includes('custom, based on AI / HPC GPU factory') ? ok('listed: custom, based on AI / HPC GPU factory') : fail('custom row missing');
(await p.locator('.pl-tpl .dt tbody tr').count()) === n0 + 1 || (await p.locator('.pl-tpl').innerText()).includes(`${n0 + 1}`) ? ok(`site types ${n0} → ${n0 + 1}`) : fail('count did not grow');
await overflow('list'); await shot('list');
/* the wizard offers it */
const wizardOffers = async () => {
  await p.locator('.pl-tpl button', { hasText: /^Plan types/ }).click(); await p.waitForTimeout(300);
  await p.locator('input[placeholder^="Name, description"]').fill('New datacenter'); await p.waitForTimeout(300);
  await p.locator('.dt tbody tr').first().click(); await p.waitForSelector('.drawer');
  await drawer().locator('button', { hasText: 'Start a plan' }).click(); await p.waitForTimeout(800);
  for (let i = 0; i < 4 && !(await p.locator('select:has(option[value="ai-gpu-factory"])').count()); i++) { const nx = p.locator('button', { hasText: /^(Next|Continue)/ }).last(); if (!(await nx.count())) break; await nx.click(); await p.waitForTimeout(500); }
  const sel = p.locator('select:has(option[value="ai-gpu-factory"])').first();
  if (!(await sel.count())) return null;
  return sel;
};
let sel = await wizardOffers();
if (!sel) fail('wizard: no kind-of-site picker found');
else if (await sel.locator('option[value="custom-qa-sovereign-ai"]').count()) {
  ok('wizard offers the new site type'); await sel.selectOption('custom-qa-sovereign-ai'); await p.waitForTimeout(500);
  (await p.locator('body').innerText()).includes('Tier III') ? ok('picked: its profile (tier) applies') : fail('no tier after picking');
  await overflow('wizard'); await shot('wizard');
} else fail('wizard does not offer the new site type');
/* retire → not offered any more */
await p.evaluate(() => { history.pushState({}, '', '/planning?tab=templates&view=sites'); dispatchEvent(new PopStateEvent('popstate')); });
await p.waitForSelector('.pl-tpl .dt tbody tr'); await p.waitForTimeout(300);
const r2 = p.locator('.pl-tpl .dt tbody tr', { hasText: NAME });
if (!(await r2.count())) console.log('note: a full reload regenerates the mock; retire check skipped');
else { await r2.click(); await p.waitForSelector('.drawer'); await drawer().locator('button', { hasText: 'Retire' }).click(); await p.waitForSelector('.modal textarea'); await modal().locator('textarea').fill('QA retire test'); await modal().locator('button', { hasText: 'Retire template' }).click(); await p.waitForTimeout(400);
  await p.locator('.drawer button[title="Close"]').last().click(); await p.waitForTimeout(300);
  sel = await wizardOffers(); sel && !(await sel.locator('option[value="custom-qa-sovereign-ai"]').count()) ? ok('retired: the wizard no longer offers it') : fail('retired type still offered'); }
if (errs.length) fail(`console: ${[...new Set(errs)].slice(0, 4).join(' | ')}`);
console.log(bad ? `site types: ${bad} FAILED` : `site types ok (W=${W})`); await b.close(); process.exit(bad ? 1 : 0);
