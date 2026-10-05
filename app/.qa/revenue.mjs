// Revenue impact: page, tabs, drawer, datacenter tab, incident panel — at 1440 and 1280, optional persona.
// usage: node .qa/revenue.mjs [persona] [shots]
import { chromium } from 'playwright';
const persona = process.argv[2] ?? 'network', shots = process.argv[3] === 'shots';
const b = await chromium.launch();
let fail = 0;
const bad = (m) => { fail++; console.log('  FAIL', m); };
for (const W of [1440, 1280]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 900 } });
  await ctx.addInitScript(p => { try { localStorage.setItem('dco.persona', p); } catch {} }, persona);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text()); });
  const open = async (route) => { await p.goto('http://localhost:5181' + route, { waitUntil: 'networkidle' }); await p.waitForTimeout(600); };
  const checks = async (name) => {
    const r = await p.evaluate(() => {
      const out = { text: ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.body.innerText.includes(w)), over: document.documentElement.scrollWidth > window.innerWidth + 2, tables: [], cut: [] };
      document.querySelectorAll('.dt-scroll').forEach(s => { if (s.scrollWidth > s.clientWidth + 2) out.tables.push(`${s.scrollWidth}>${s.clientWidth}`); });
      document.querySelectorAll('.dco-tile .dco-num, .dco-tile .dco-sub, .dco-tile .dco-facts > span, .dco-kv em, .dco-kv b, .rev-hero-figs b, .rev-hero-figs .vw-label, .rev-hero-note, .rev-hero-sub, .rev-fig b, .rev-fig .vw-label, .rev-kv b, .sum-value, .sum-sub, .rev-band-item b, .rev-rack-v').forEach(e => { if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) out.cut.push(`${e.className.split(' ')[0]}:"${e.textContent.slice(0, 40)}"`); });
      return out;
    });
    if (r.text.length) bad(`${name}@${W} text ${r.text}`);
    if (r.over) bad(`${name}@${W} page overflows horizontally`);
    if (r.tables.length) bad(`${name}@${W} table overflow ${r.tables}`);
    if (r.cut.length) bad(`${name}@${W} cut text ${r.cut.slice(0, 6).join(' | ')}`);
    if (errs.length) { bad(`${name}@${W} console ${errs[0].slice(0, 200)}`); errs.length = 0; }
    if (shots) await p.screenshot({ path: `.qa/out/rev-${persona}-${name}-${W}.png`, fullPage: true });
  };
  await open('/revenue'); await checks('issues');
  // heroes line up
  const hs = await p.$$eval('.rev-hero', els => els.map(e => Math.round(e.getBoundingClientRect().height)));
  if (hs.length !== 2 || Math.abs(hs[0] - hs[1]) > 1) bad(`heroes@${W} heights ${hs}`);
  const tiles = await p.$$eval('.dco-tile', els => els.map(e => Math.round(e.getBoundingClientRect().height)));
  if (tiles.length !== 6 || new Set(tiles).size !== 1) bad(`tiles@${W} ${tiles}`);
  // drawer
  const rows = await p.$$('.dt-table tbody tr');
  if (rows.length) { await rows[0].click(); await p.waitForTimeout(300); if (!(await p.$('.drawer .rev-curve svg'))) bad(`drawer@${W} did not open with a curve`); await checks('drawer'); await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
  // tile → filter
  await p.click('.dco-tile:nth-child(3)'); await p.waitForTimeout(250);
  if (!p.url().includes('rview=stake')) bad(`tile filter@${W} ${p.url()}`);
  for (const t of ['customers', 'datacenters', 'trends', 'exposure']) { await open(`/revenue?tab=${t}`); await checks(t); }
  await open('/revenue?tab=trends');
  const th = await p.$$eval('.rev-trends > *', els => els.map(e => Math.round(e.getBoundingClientRect().height)));
  if (W >= 1280 && Math.abs(th[0] - th[1]) > 2) bad(`trend panels@${W} ${th}`);
  // method drawer
  await open('/revenue'); await p.click('text=How it is calculated'); await p.waitForTimeout(250); if (!(await p.$('.drawer .rev-method'))) bad('method drawer'); await p.keyboard.press('Escape');
  // datacenter tab
  for (const dc of ['MH-DC-001', 'DL-DC-009']) { await open(`/datacenters/${dc}?tab=revenue`); await checks(`site-${dc}`); if (!(await p.$('.sum-strip'))) bad(`site ${dc} no strip`); }
  // lists and command center
  await open('/datacenters'); await checks('dc-list');
  await open('/incidents'); await checks('inc-list');
  await open('/'); await checks('command'); if (!(await p.$('.rev-band'))) bad('command band missing');
  // incident with revenue
  await open('/incidents/INC-0002'); await checks('inc-0002'); if (!(await p.$('.rev-inc'))) bad('INC-0002 has no revenue panel');
  await ctx.close();
}
await b.close();
console.log(fail ? `revenue ${persona}: ${fail} FAILED` : `revenue ${persona}: ok`);
process.exit(fail ? 1 : 0);
