// Sweep every route at 1440 and 1280: console errors, bad text, horizontal overflow, clipped KPI labels.
import { chromium } from 'playwright';
const ROUTES = ['/', '/datacenters', '/datacenters?region=west', '/datacenters?view=facility', '/datacenters/MH-DC-001?tab=overview', '/datacenters/KA-DC-020?tab=overview',
  '/datacenters/MH-DC-001', '/datacenters/MH-DC-001?tab=attention', '/datacenters/MH-DC-001?tab=elements', '/datacenters/MH-DC-001?tab=details', '/datacenters/MH-DC-001?tab=equipment', '/datacenters/MH-DC-001?tab=timeline',
  '/datacenters/GJ-DC-013', '/datacenters/KA-DC-020?tab=details', '/datacenters/DL-DC-009',
  '/ne/MH-DC-001-PE-T4-01', '/ne/MH-DC-001-PE-T4-01?tab=hardware', '/ne/MH-DC-001-PE-T4-01?tab=links', '/ne/MH-DC-001-PE-T4-01?tab=services', '/ne/MH-DC-001-PE-T4-01?tab=alerts', '/ne/KA-DC-020-AGG-R03', '/ne/GJ-DC-013-PE-T4-01',
  '/alerts', '/incidents', '/incidents/INC-0001', '/incidents/INC-0002', '/incidents/INC-0003', '/incidents/INC-0030', '/changes', '/changes?id=CHG-2002', '/topology', '/topology?dc=KA-DC-020',
  '/services', '/services/SVC-L3-1807', '/customers', '/capacity', '/capacity?tab=power', '/capacity?tab=space', '/capacity?tab=network', '/capacity?tab=compute', '/capacity?tab=financial', '/facilities', '/facilities?dc=DL-DC-009', '/facilities?dc=MH-DC-003&tab=cooling', '/nope', '/ne/NOPE', '/datacenters/NOPE'];
// datacenter pages open on the 3D Overview tab, which renders continuously — don't wait for network idle there
const isTwin = r => r.includes('tab=overview') || /^\/datacenters\/[A-Z]{2}-DC-\d{3}$/.test(r);
const b = await chromium.launch();
let problems = 0;
for (const width of [1440, 1280]) {
  const p = await b.newPage({ viewport: { width, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  for (const r of ROUTES) {
    errs.length = 0;
    await p.goto('http://localhost:5181' + r, { waitUntil: isTwin(r) ? 'domcontentloaded' : 'networkidle', timeout: 60000 }); await p.waitForTimeout(isTwin(r) ? 2500 : 450);
    const res = await p.evaluate(() => {
      const t = document.body.innerText;
      const bad = ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date', 'Under construction'].filter(w => t.includes(w));
      const over = document.documentElement.scrollWidth > window.innerWidth + 2;
      const clipped = [...document.querySelectorAll('.kpi-label')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent);
      return { bad, over, clipped };
    });
    const msg = [res.bad.length ? `TEXT ${res.bad}` : '', res.over ? 'H-OVERFLOW' : '', res.clipped.length ? `CLIPPED ${res.clipped.join(' | ')}` : '', errs.length ? `ERR ${errs[0].slice(0, 200)}` : ''].filter(Boolean).join(' · ');
    if (msg) { problems++; console.log(`[${width}] ${r} → ${msg}`); }
  }
  await p.close();
}
console.log(problems ? `${problems} problem routes` : 'ALL CLEAN'); await b.close();
