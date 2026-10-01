import { chromium } from 'playwright';
const base = process.env.BASE ?? 'https://datacenter-ideation.vercel.app';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/arcgis|tile|Failed to load resource/.test(m.text())) errs.push(m.text()); });
for (const r of ['/', '/datacenters/MH-DC-001', '/ne/MH-DC-001-PE-T4-01?tab=alerts', '/incidents/INC-0001', '/topology', '/capacity']) {
  await p.goto(base + r, { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  const h = await p.evaluate(() => document.querySelector('h1, .vw-page-title, .ent-title h1')?.textContent?.trim() ?? '(no heading)');
  console.log(r, '→', h.slice(0, 60));
}
await p.goto(base + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(800); await p.screenshot({ path: '.qa/out/prod.png' });
console.log(errs.length ? errs : 'no console errors'); await b.close();
