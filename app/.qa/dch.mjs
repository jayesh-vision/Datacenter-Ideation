import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  for (const id of ['KA-DC-008', 'DL-DC-009', 'GJ-DC-013']) {
    await p.goto(`http://localhost:5181/datacenters/${id}?tab=attention`, { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
    const r = await p.evaluate(() => ({ cut: [...document.querySelectorAll('.dch-kpi-note, .dch-kpi-h .vw-card-metric-label, .dch-name')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent), over: document.documentElement.scrollWidth > innerWidth + 2, kpiH: [...new Set([...document.querySelectorAll('.dch-kpi')].map(e => Math.round(e.getBoundingClientRect().height)))] }));
    console.log(w, id, JSON.stringify(r), errs.length ? errs : '');
    if (id !== 'GJ-DC-013') await p.screenshot({ path: `.qa/out/dch_${id}_${w}.png`, clip: { x: 236, y: 60, width: w - 236, height: 420 } });
  }
  await p.close();
}
await b.close();
