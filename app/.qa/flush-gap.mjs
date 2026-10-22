// Tables inside scrolling flush panels: the header must sit at the top of its panel (no sticky offset gap) (22-Oct-2026)
import { chromium } from 'playwright';
const W = +(process.env.W || 1440), BASE = process.env.BASE || 'http://localhost:5181';
const routes = (process.argv[2] || '/capacity,/capacity?tab=power,/capacity?tab=economics,/facilities,/revenue,/changes,/incidents,/dcim?tab=racks,/compliance,/gpu?gtab=fabric,/delivery?tab=projects,/help').split(',');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const bad = [];
for (const r of routes) {
  await p.goto(`${BASE}${r}${r.includes('?') ? '&' : '?'}persona=neocloud&geo=us`, { waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(700);
  const g = await p.evaluate(() => [...document.querySelectorAll('table thead')].map(t => { const th = t.querySelector('th'); if (!th) return null; const tb = t.closest('table'); const gap = th.getBoundingClientRect().top - tb.getBoundingClientRect().top; return gap > 2 ? `${Math.round(gap)}px in ${tb.closest('.panel')?.querySelector('h3,.panel-title')?.textContent?.slice(0, 40)}` : null; }).filter(Boolean));
  console.log(r, g.join(' | ') || 'ok'); g.forEach(x => bad.push(`${r}: ${x}`));
}
await b.close(); console.log(bad.length ? 'FAIL' : 'OK');
