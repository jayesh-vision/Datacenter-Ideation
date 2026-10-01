import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1280, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  for (const r of ['/services', '/services/SVC-L3-1807', '/customers', '/customers/CUST-1202', '/capacity', '/capacity?tab=power', '/capacity?tab=space', '/capacity?tab=network', '/capacity?tab=financial&dc=MH-DC-001', '/facilities', '/facilities?dc=MH-DC-003&tab=cooling', '/facilities?dc=MH-DC-003&tab=maintenance']) {
    await p.goto('http://localhost:5181' + r, { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
    const o = await p.evaluate(() => [...document.querySelectorAll('.dt-scroll, .panel-body.is-flush, .path')].filter(e => e.scrollWidth > e.clientWidth + 2).map(e => `${e.closest('section')?.querySelector('h3')?.textContent ?? e.className} +${e.scrollWidth - e.clientWidth}`));
    if (o.length) console.log(w, r, o.join(' ; '));
  }
}
await b.close(); console.log('done');
