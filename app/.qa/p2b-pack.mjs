// Plan pack (plan page ?tab=pack): every plan × every pack section — page errors, NaN/undefined, page or table overflow; CSV downloads
// (bill of materials, IP plan) and the record links of "What this plan creates" open a real screen.
// usage: node .qa/p2b-pack.mjs [persona] [geo] [PLN-…]   (W=1280, SHOTS=1 for screenshots)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'us', only = process.argv[4], W = Number(process.env.W ?? 1280);
const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}); const ctx = await b.newContext({ viewport: { width: W, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text().slice(0, 300)); });
let bad = 0, n = 0; const links = new Map();
const go = async u => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(700); };
const check = async (label) => {
  const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.querySelector('.page')?.innerText.includes(w)));
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  const tbl = await p.evaluate(() => [...document.querySelectorAll('.pk .dt-scroll')].filter(e => e.scrollWidth > e.clientWidth + 2).length);
  n++;
  if (t.length || over || tbl || errs.length) { bad++; console.log(`  ✗ ${label}${t.length ? ' TEXT ' + t : ''}${over ? ' OVERFLOW' : ''}${tbl ? ` TABLE-OVERFLOW ${tbl}` : ''}${errs.length ? ' ERR ' + errs.slice(0, 2).join(' | ') : ''}`); await p.screenshot({ path: `.qa/out/pack-${label.replace(/\W+/g, '_')}.png`, fullPage: true }); }
  else if (process.env.SHOTS) await p.screenshot({ path: `.qa/out/pack-${label.replace(/\W+/g, '_')}.png`, fullPage: true });
  errs.length = 0;
};
const csv = async (label, name) => {
  const btn = p.getByRole('button', { name: 'Download CSV' });
  if (!(await btn.count())) return;
  const [d] = await Promise.all([p.waitForEvent('download'), btn.first().click()]);
  const path = await d.path(); const fs = await import('node:fs'); const text = fs.readFileSync(path, 'utf8'); const rows = text.split('\n');
  const ok = d.suggestedFilename() === name && rows.length > 1 && rows.every(r => r.split(',').length >= 5) && !/NaN|undefined/.test(text);
  if (!ok) { bad++; console.log(`  ✗ ${label} CSV ${d.suggestedFilename()} rows=${rows.length} ${rows[0]?.slice(0, 80)}`); } else console.log(`    ${label} ${d.suggestedFilename()} ${rows.length - 1} rows · ${rows[0].split(',').length} columns`);
};
await p.goto(`http://localhost:5181/planning/plans?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
const ids = only ? [only] : Array.from({ length: 15 }, (_, i) => `PLN-${String(i + 1).padStart(4, '0')}`);
for (const id of ids) {
  await go(`/planning/plans/${id}?tab=pack`); await p.waitForTimeout(400);
  if (!(await p.locator('.pk-nav').count())) { bad++; console.log(`  ✗ ${id} no plan pack`); continue; }
  const strip = await p.evaluate(() => [...document.querySelectorAll('.pk .panel')][0]?.querySelectorAll('tbody tr').length ?? 0);
  for (const a of await p.locator('.pk .panel').first().locator('a').evaluateAll(as => as.map(a => a.getAttribute('href')))) links.set(a, id);
  const secs = await p.locator('.pk-nav-btn').evaluateAll(els => els.map(e => e.textContent.trim()));
  console.log(`${id} · ${strip} outputs · ${secs.join(' | ')}`);
  for (let i = 0; i < secs.length; i++) {
    await p.locator('.pk-nav-btn').nth(i).click(); await p.waitForTimeout(450);
    await check(`${id} ${secs[i]}`);
    if (/^Bill of materials/.test(secs[i])) await csv(`${id} BOM`, `${id}-bom.csv`);
    if (/^IP and network plan/.test(secs[i])) await csv(`${id} IP`, `${id}-ip-plan.csv`);
  }
}
// every record link opens a real screen (no "not found")
for (const [href, id] of links) {
  await go(href); await p.waitForTimeout(500);
  const nf = await p.evaluate(() => /not found|doesn't exist|no such/i.test(document.querySelector('.page')?.innerText.slice(0, 400) ?? ''));
  if (nf || errs.length) { bad++; console.log(`  ✗ link ${href} from ${id}${nf ? ' NOT FOUND' : ''}${errs.length ? ' ERR ' + errs[0] : ''}`); }
  errs.length = 0;
}
console.log(`${links.size} record links opened`);
await b.close();
console.log(`${n} pack sections checked · ${bad ? `${bad} problem(s)` : 'all clear'}`); process.exit(bad ? 1 : 0);
