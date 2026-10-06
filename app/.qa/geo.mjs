// Geography switch: ?geo=us re-labels the whole estate (sites, regions, customers, people, currency), the top-bar
// switch works and is remembered, and the India telco anchors come back. usage: node .qa/geo.mjs [shots]
import { chromium } from 'playwright';
const shots = process.argv[2] === 'shots';
const b = await chromium.launch(); let fail = 0; const bad = m => { fail++; console.log('  FAIL', m); };
const INDIAN = /\b(MH|UP|KA|DL|TS|KL|GJ|MP|RJ|WB|OD|BR|HR|PB|AP)-DC-\d{3}\b|Pune|Mumbai|Bengaluru|Chennai|Maharashtra|₹|Priya Nair|Kavita Rao/;
for (const W of [1440, 1280]) {
  for (const persona of ['network', 'cloud', 'colocation', 'enterprise']) {
    if (W === 1280 && persona !== 'network') continue;
    const ctx = await b.newContext({ viewport: { width: W, height: 900 } });
    await ctx.addInitScript(p => { try { localStorage.setItem('dco.persona', p); localStorage.setItem('dco.site.header', 'compact'); } catch {} }, persona);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text()); });
    const open = async r => { await p.goto('http://localhost:5181' + r, { waitUntil: 'networkidle' }); await p.waitForTimeout(700); };
    const check = async name => {
      const r = await p.evaluate(() => ({ text: document.body.innerText, over: document.documentElement.scrollWidth > innerWidth + 2, top: (() => { const t = document.querySelector('.topbar'); if (!t) return 0; const kids = [...t.children]; const last = kids[kids.length - 1].getBoundingClientRect(); return Math.round(last.right - innerWidth); })(), geo: document.querySelector('.geo .persona-txt b')?.textContent }));
      const m = r.text.match(INDIAN); if (m) bad(`${persona}/${name}@${W} still Indian: "${m[0]}"`);
      if (['command', 'datacenters', 'revenue', 'gpu'].includes(name) && !r.text.includes('$')) bad(`${persona}/${name}@${W} no dollar figures`);
      if (r.over) bad(`${persona}/${name}@${W} page overflow`);
      if (r.top > 0) bad(`${persona}/${name}@${W} top bar overflows by ${r.top}px`);
      if (r.geo !== 'United States') bad(`${persona}/${name}@${W} geography label ${r.geo}`);
      if (errs.length) { bad(`${persona}/${name}@${W} error ${errs[0].slice(0, 160)}`); errs.length = 0; }
      if (shots) await p.screenshot({ path: `.qa/out/geo-us-${persona}-${name}-${W}.png`, fullPage: name !== 'command' });
    };
    await open('/?geo=us'); await check('command');
    const pins = await p.$$eval('.leaflet-marker-icon', e => e.length); if (pins < 20) bad(`${persona} map pins ${pins}`);
    await open('/datacenters'); await check('datacenters');
    if (!(await p.evaluate(() => document.body.innerText.includes('Northeast')))) bad(`${persona} regions not US`);
    await open('/revenue'); await check('revenue');
    await open('/incidents/INC-0001'); await check('inc1');
    if (!(await p.evaluate(() => document.body.innerText.includes('VA-DC-001')))) bad(`${persona} INC-0001 not at the US hero site`);
    await open('/facilities'); await check('facilities');
    if (!p.url().includes('VA-DC-001') && !(await p.evaluate(() => document.body.innerText.includes('VA-DC-001')))) bad(`${persona} facilities default is not VA-DC-001`);
    if (persona !== 'network') { await open('/gpu'); await check('gpu'); }
    await open('/datacenters/VA-DC-001?tab=customers&cview=risk'); await check('site-customers');
    if (persona === 'network' && W === 1440) {
      /* the top-bar switch: back to India from a US site page, remembered across a reload */
      await p.click('.geo .persona-btn'); await p.click('.geo .persona-opt:has-text("India")'); await p.waitForTimeout(2500);
      const t = await p.evaluate(() => ({ url: location.pathname, text: document.body.innerText, label: document.querySelector('.geo .persona-txt b')?.textContent }));
      if (t.label !== 'India') bad(`switch label ${t.label}`);
      if (!t.text.includes('MH-DC-001') || !t.text.includes('₹')) bad(`switch back to India did not relabel (${t.url})`);
      await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1200);
      if ((await p.$eval('.geo .persona-txt b', e => e.textContent)) !== 'India') bad('geography not remembered after reload');
      await p.goto('http://localhost:5181/datacenters/MH-DC-001?tab=attention', { waitUntil: 'load' }); await p.waitForTimeout(1500);
      if (!(await p.evaluate(() => document.body.innerText.includes('MH-DC-001')))) bad('India hero site missing');
      await p.goto('http://localhost:5181/?geo=us', { waitUntil: 'load' }); await p.waitForTimeout(1500);
      if ((await p.$eval('.geo .persona-txt b', e => e.textContent)) !== 'United States') bad('?geo=us in the URL did not win over the remembered India');
    }
    await ctx.close();
  }
}
await b.close(); console.log(fail ? `geo: ${fail} FAILED` : 'geo: ok'); process.exit(fail ? 1 : 0);
