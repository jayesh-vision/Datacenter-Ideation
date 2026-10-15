// Planner wizard · "What is being replaced" (15-Oct-2026): for each replace plan type, start a new plan at a few sites and check the
// list shows every eligible item with reason badges, the quick-filter counts are non-zero, a quick filter narrows the list to rows with
// that badge, "Select the N shown" / Clear work, nothing overflows. Also opens the demo plans (PLN-0013…0015) in the wizard.
// usage: node .qa/p2b-affected.mjs [persona] [geo] [dc,dc,…]   (W=1280; SHOTS=1 keeps screenshots in .qa/out; PLANS=PLN-0013,… opens demo plans; BASE=http://localhost:5182 if vite moved)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'us', W = Number(process.env.W ?? 1440);
const SITES = (process.argv[4] ?? '').split(',').filter(Boolean);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text().slice(0, 300)); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const base = process.env.BASE ?? `http://localhost:5181`;
await p.goto(`${base}/planning?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
const sites = SITES.length ? SITES : await p.evaluate(() => []);
const snap = async () => p.evaluate(() => {
  const aff = document.querySelector('.pn-aff'); if (!aff) return null;
  const q = [...aff.querySelectorAll('.pn-aff-q')].map(x => ({ label: x.querySelector('button span')?.textContent ?? '', n: Number((x.querySelector('em')?.textContent ?? '0').replace(/\D/g, '')), on: x.classList.contains('is-on') }));
  const rows = [...aff.querySelectorAll('.pn-aff-tbl tbody tr')].filter(r => r.querySelectorAll('td').length > 1);
  const badges = rows.map(r => [...r.querySelectorAll('.pn-aff-badges .vw-chip')].map(c => c.textContent));
  return { q, rows: rows.length, badges, pager: aff.querySelector('.pn-aff-pager .vw-label')?.textContent ?? '', sum: aff.querySelector('.pn-aff-sum')?.textContent ?? '', head: aff.querySelector('.pn-sub')?.textContent ?? '',
    tblOver: [...aff.querySelectorAll('.pn-tbl')].some(t => t.scrollWidth > t.clientWidth + 2), pageOver: document.documentElement.scrollWidth > window.innerWidth + 2,
    bad: ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => aff.innerText.includes(w)) };
});
const open = async (url) => { await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
  for (let i = 0; i < 2 && !(await p.locator('.pn-aff').count()); i++) { const next = p.getByRole('button', { name: /^Next/ }).last(); if (await next.count() && !(await next.isDisabled())) { await next.click(); await p.waitForTimeout(900); } }
  for (let i = 0; i < 8 && !(await p.locator('.pn-aff').count()); i++) { const back = p.getByRole('button', { name: /^Back$/ }).last(); if (await back.count() && !(await back.isDisabled())) { await back.click(); await p.waitForTimeout(700); } }
  await p.locator('.pn-aff').scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(300); };
for (const scope of ['server-refresh', 'network-refresh', 'rack-replace']) for (const dc of sites) {
  await open(`${base}/planning/new?template=TPL-PLAN-${scope}&scope=${scope}&dc=${dc}`);
  const s = await snap(); const tag = `${scope} @ ${dc}`;
  if (!s) { ok(false, `${tag}: no list`); continue; }
  const rack = scope === 'rack-replace';
  const due = s.q.filter(x => x.n > 0).map(x => `${x.label} ${x.n}`).join(' · ');
  const allRows = Number((s.pager.match(/of ([\d,]+)/)?.[1] ?? String(s.rows)).replace(/,/g, ''));
  ok(s.q.every(x => !x.on), `${tag}: no quick filter on by default`);
  ok(allRows > 0 && s.q.some(x => x.n > 0), `${tag}: ${allRows} rows · ${due || 'no reason counts'}`);
  ok(s.badges.slice(0, Math.min(3, Math.max(...s.q.map(x => x.n)))).every(bs => bs.length > 0), `${tag}: the first rows carry badges (${s.badges[0]?.join(', ')})`);
  ok(!s.tblOver && !s.pageOver && !s.bad.length && !errs.length, `${tag}: layout${s.tblOver ? ' TABLE-OVERFLOW' : ''}${s.pageOver ? ' PAGE-OVERFLOW' : ''}${s.bad.length ? ' TEXT ' + s.bad : ''}${errs.length ? ' ERR ' + errs.join(' | ') : ''}`); errs.length = 0;
  if (process.env.SHOTS) await p.locator('.pn-aff').screenshot({ path: `.qa/out/aff-${P}-${G}-${scope}-${dc}-${W}.png` });
  // a quick filter narrows the list to rows that carry its badge, then "Select the N shown" and Clear
  const qi = s.q.findIndex(x => x.n > 0 && x.n < allRows) >= 0 ? s.q.findIndex(x => x.n > 0 && x.n < allRows) : s.q.findIndex(x => x.n > 0);
  if (qi >= 0) {
    await p.locator('.pn-aff-q button').nth(qi).click(); await p.waitForTimeout(400);
    const f = await snap(); const shown = Number((f.pager.match(/of ([\d,]+)/)?.[1] ?? String(f.rows)).replace(/,/g, ''));
    ok(f.q[qi].on && shown === s.q[qi].n && f.badges.every(bs => bs.length > 0), `${tag}: "${s.q[qi].label}" on → ${shown} rows (count ${s.q[qi].n})`);
    const sel = p.getByRole('button', { name: /^Select the/ });
    if (await sel.isDisabled()) { const held = await p.locator('.pn-aff-tbl tbody .pn-warn').allInnerTexts(); ok(held.length > 0, `${tag}: every row shown is held (${[...new Set(held)].join('; ').slice(0, 120)})`); await p.locator('.pn-aff-q button').nth(qi).click(); await p.waitForTimeout(300); continue; }
    await sel.click(); await p.waitForTimeout(500);
    const after = await snap(); const n = Number((after.sum.match(/Selected ([\d,]+)/)?.[1] ?? '0').replace(/,/g, ''));
    ok(n > 0, `${tag}: select shown → ${after.sum.slice(0, 110)}`);
    await p.getByRole('button', { name: /^Clear$/ }).click(); await p.waitForTimeout(400);
    const cl = await snap(); ok(/Selected 0/.test(cl.sum), `${tag}: Clear → ${cl.sum.slice(0, 40)}`);
    await p.locator('.pn-aff-q button').nth(qi).click(); await p.waitForTimeout(300);
  }
  void rack;
}
// the demo plans in the wizard
const plans = await p.evaluate(async () => [...document.querySelectorAll('a')].map(a => a.getAttribute('href')).filter(h => /\/planning\/plans\/PLN/.test(h ?? '')));
for (const id of (process.env.PLANS ?? '').split(',').filter(Boolean)) {
  await open(`${base}/planning/plans/${id}/edit`);
  const s = await snap(); if (!s) { ok(false, `${id}: no list`); continue; }
  const n = Number((s.sum.match(/Selected ([\d,]+)/)?.[1] ?? '0').replace(/,/g, ''));
  ok(n > 0 && s.badges.slice(0, n).every(bs => bs.length > 0) && !s.tblOver && !s.pageOver && !s.bad.length, `${id}: ${await p.locator('.page-head h1, h1').first().innerText().catch(() => '')} · ${s.sum.slice(0, 120)} · first row ${s.badges[0]?.join(', ')} · quick ${s.q.filter(x => x.on).map(x => x.label).join('+') || 'none'}`);
  if (process.env.SHOTS) await p.locator('.pn-aff').screenshot({ path: `.qa/out/aff-${P}-${G}-${id}-${W}.png` });
}
void plans;
await b.close();
console.log(bad ? `${bad} problem(s)` : 'all clear'); process.exit(bad ? 1 : 0);
