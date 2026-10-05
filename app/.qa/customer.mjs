// Customer page: header, tiles and impact section — no cut text, no overflow, equal cards. usage: node .qa/customer.mjs [persona] [shots]
import { chromium } from 'playwright';
const persona = process.argv[2] ?? 'network', shots = process.argv[3] === 'shots';
const b = await chromium.launch(); let fail = 0;
for (const W of [1440, 1280]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 900 } });
  await ctx.addInitScript(p => { try { localStorage.setItem('dco.persona', p); } catch {} }, persona);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  // three customers reached the way a user does: from datacenters with different conditions
  for (const dc of ['MH-DC-001', 'DL-DC-009', 'KL-DC-024']) {
    await p.goto(`http://localhost:5181/datacenters/${dc}?tab=customers`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
    const row = await p.$('.dt-table tbody tr'); if (!row) continue;
    await row.click(); await p.waitForURL(/\/customers\//); await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const cut = [];
      document.querySelectorAll('.cd-name, .cd-sub > span, .cd-meta dt, .cd-meta dd, .cd-meta dd small, .cd-state, .dco-tile .dco-num, .dco-tile .dco-sub, .dco-tile .dco-l, .dco-tile .dco-facts > span, .dco-kv em, .dco-kv b').forEach(e => { if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) cut.push(`${e.className || e.tagName}:"${e.textContent.slice(0, 36)}"`); });
      const g = [...document.querySelectorAll('.cd-grid > *')].map(e => Math.round(e.getBoundingClientRect().height));
      return { cut, g, tiles: [...document.querySelectorAll('.dco-tile')].map(e => Math.round(e.getBoundingClientRect().height)), over: document.documentElement.scrollWidth > innerWidth + 2, tables: [...document.querySelectorAll('.dt-scroll, .cd-hits')].filter(s => s.scrollWidth > (s.classList.contains('cd-hits') ? s.parentElement.clientWidth : s.clientWidth) + 2).length,
        text: ['NaN', 'undefined', 'Infinity', '[object'].filter(w => document.body.innerText.includes(w)), head: !!document.querySelector('.cd-head .cd-verdict') };
    });
    const bad = [r.cut.length && `cut ${r.cut.slice(0, 5).join(' | ')}`, r.over && 'page overflow', r.tables && 'table overflow', r.text.length && `text ${r.text}`, !r.head && 'no header', Math.max(...r.tiles) - Math.min(...r.tiles) > 1 && `tiles ${r.tiles}`, W >= 1280 && Math.abs(r.g[0] - r.g[1]) > 2 && `panels ${r.g}`, errs.length && `error ${errs[0]}`].filter(Boolean);
    if (bad.length) { fail++; console.log(`  FAIL ${persona} ${dc}@${W}: ${bad.join(' ; ')}`); }
    if (shots) await p.screenshot({ path: `.qa/out/cust-${persona}-${dc}-${W}.png`, clip: { x: 0, y: 0, width: W, height: 900 } });
    errs.length = 0;
  }
  await ctx.close();
}
await b.close();
console.log(fail ? `customer ${persona}: ${fail} FAILED` : `customer ${persona}: ok`); process.exit(fail ? 1 : 0);
