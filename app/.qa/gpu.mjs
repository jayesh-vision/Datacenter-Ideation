// AI & GPU: page per persona, tabs, drawers, datacenter tab, menu visibility — 1440 and 1280.
// usage: node .qa/gpu.mjs [persona] [shots]
import { chromium } from 'playwright';
const persona = process.argv[2] ?? 'cloud', shots = process.argv[3] === 'shots';
const b = await chromium.launch(); let fail = 0;
const bad = m => { fail++; console.log('  FAIL', m); };
for (const W of [1440, 1280]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 900 } });
  await ctx.addInitScript(p => { try { localStorage.setItem('dco.persona', p); localStorage.setItem('dco.site.header', 'compact'); } catch {} }, persona);
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text()); });
  const open = async r => { await p.goto('http://localhost:5181' + r, { waitUntil: 'networkidle' }); await p.waitForTimeout(600); };
  const check = async name => {
    const r = await p.evaluate(() => {
      const cut = [];
      document.querySelectorAll('.dco-tile .dco-num, .dco-tile .dco-sub, .dco-tile .dco-l, .dco-tile .dco-facts > span, .dco-kv em, .dco-kv b, .gpu-hero-figs b, .gpu-hero-figs .vw-label, .gpu-cl-id b, .rev-fig b, .gpu-cdu-h b').forEach(e => { if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) cut.push(`${e.className.split(' ')[0]}:"${e.textContent.slice(0, 40)}"`); });
      return { cut, over: document.documentElement.scrollWidth > innerWidth + 2, tables: [...document.querySelectorAll('.dt-scroll')].filter(s => s.scrollWidth > s.clientWidth + 2).map(s => `${s.scrollWidth}>${s.clientWidth}`), text: ['NaN', 'undefined', 'Infinity', '[object'].filter(w => document.body.innerText.includes(w)) };
    });
    if (r.cut.length) bad(`${name}@${W} cut ${r.cut.slice(0, 5).join(' | ')}`);
    if (r.over) bad(`${name}@${W} page overflow`);
    if (r.tables.length) bad(`${name}@${W} table overflow ${r.tables}`);
    if (r.text.length) bad(`${name}@${W} text ${r.text}`);
    if (errs.length) { bad(`${name}@${W} error ${errs[0].slice(0, 200)}`); errs.length = 0; }
    if (shots) await p.screenshot({ path: `.qa/out/gpu-${persona}-${name}-${W}.png`, fullPage: true });
  };
  await open('/');
  const rail = await p.$$eval('.rail-link span', e => e.map(x => x.textContent));
  const showsGpu = rail.includes('GPU Fleet');
  if ((persona === 'network') === showsGpu) bad(`menu item GPU Fleet ${showsGpu ? 'shown' : 'missing'} for ${persona}`);
  await open('/gpu'); await check('page');
  if (persona === 'cloud' || persona === 'enterprise' || persona === 'neocloud') {
    const tiles = await p.$$eval('.dco-tile', e => e.map(x => Math.round(x.getBoundingClientRect().height)));
    if (Math.max(...tiles) - Math.min(...tiles) > 1) bad(`tiles@${W} ${tiles}`);
    const hs = await p.$$eval('.gpu-hero', e => e.map(x => Math.round(x.getBoundingClientRect().height)));
    if (hs.length !== 2 || Math.abs(hs[0] - hs[1]) > 1) bad(`heroes@${W} ${hs}`);
    await p.click('.gpu-heat button.gpu-node'); await p.waitForTimeout(500);
    if (!(await p.$('.drawer .gpu-gpus'))) bad('node drawer'); await check('node-drawer'); await p.keyboard.press('Escape');
    for (const t of ['jobs', 'nodes', 'occupancy', 'telemetry', 'cooling', 'fabric']) { await open(`/gpu?gtab=${t}`); await check(t); if (t === 'telemetry' && !(await p.$('.gpu-lead'))) bad(`${persona}@${W} telemetry tab has no leaders`);
      if (t === 'occupancy') { const has = !!(await p.$('.gpu-occ')); if (has !== (persona !== 'enterprise')) bad(`${persona}@${W} occupancy tab ${has ? 'shown' : 'missing'}`); if (has) { await open('/gpu?gtab=occupancy&oview=interruptions'); await check('interruptions'); await open('/gpu?gtab=nodes&gview=held'); await check('nodes-held'); if (!(await p.$('.dt-table tbody tr'))) bad(`${persona}@${W} no held-back nodes`); } } }
    /* the device page of a GPU node shows its DCGM detail; the equipment list shows the GPU strip */
    await open('/gpu?gtab=nodes'); await p.waitForSelector('.dt-table tbody tr .mono', { timeout: 15000 }); const first = await p.$eval('.dt-table tbody tr .mono', e => e.textContent);
    await open(`/ne/KA-DC-020-${first}?tab=gpus`); await p.waitForSelector('.gpu-gpus', { timeout: 8000 }).catch(() => bad(`${persona}@${W} device page has no GPU tab`)); await check('device-gpus');
    await open('/datacenters/KA-DC-020?tab=elements&role=GPU'); await p.waitForSelector('.gpu-strip', { timeout: 8000 }).catch(() => bad(`${persona}@${W} equipment list has no GPU strip`)); await check('equipment');
    await open('/gpu?gtab=jobs'); await p.click('.dt-table tbody tr'); await p.waitForTimeout(300);
    if (!(await p.$('.drawer .gpu-jobnodes'))) bad('job drawer'); await check('job-drawer'); await p.keyboard.press('Escape');
    for (const dc of ['KA-DC-020', 'TN-DC-022']) { await open(`/datacenters/${dc}?tab=gpu`); await p.waitForSelector('.dco-tile', { timeout: 5000 }).catch(() => {}); await check(`site-${dc}`); if (!(await p.$('.dco-tile'))) bad(`${dc} gpu tab empty`); }
    await open('/incidents'); await check('incidents');
  }
  if (persona === 'colocation') { if (!(await p.$('.gpu-cdu'))) bad('no CDU cards'); await open('/datacenters/TN-DC-022?tab=gpu'); await p.waitForSelector('.dco-tile', { timeout: 5000 }).catch(() => bad('colo site tab empty')); await check('site-TN-DC-022'); }
  if (persona === 'network') { await open('/datacenters/MH-DC-001'); const tabs = await p.$$eval('.pill', e => e.map(x => x.textContent)); if (tabs.some(t => t.includes('GPU Fleet'))) bad('telco site shows the GPU Fleet tab'); }
  await ctx.close();
}
await b.close();
console.log(fail ? `gpu ${persona}: ${fail} FAILED` : `gpu ${persona}: ok`); process.exit(fail ? 1 : 0);
