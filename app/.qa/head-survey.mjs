import { chromium } from 'playwright';
const R = (process.env.R || '/|/revenue|/datacenters|/facilities|/gpu|/alerts|/incidents|/changes|/macd|/macd?tab=requests|/macd?tab=board|/macd?tab=schedule|/macd?tab=catalog|/secops|/security-sources|/planning|/planning?tab=plans|/capacity|/capacity?tab=power|/ipam|/dcim|/dcim?tab=racks|/delivery|/workorders|/compliance|/customization|/help|/data-model').split('|');
const b = await chromium.launch();
for (const w of (process.env.W || '1440,1280').split(',').map(Number)) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  for (const r of R) {
    await p.goto(`http://localhost:5181${r}${r.includes('?') ? '&' : '?'}persona=neocloud&geo=us`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => !document.body.innerText.includes('Loading…'), null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(300);
    const m = await p.evaluate(() => {
      const h = document.querySelector('.page > .page-head'); if (!h) return null;
      const t = h.querySelector('h1')?.getBoundingClientRect(); const a = h.querySelector('.page-actions')?.getBoundingClientRect();
      if (!a || !t) return { noActions: true, h: Math.round(h.getBoundingClientRect().height) };
      return { h: Math.round(h.getBoundingClientRect().height), wrapped: a.top > t.bottom - 2, aH: Math.round(a.height) };
    });
    if (m && (m.wrapped || m.aH > 44)) console.log(w, r, JSON.stringify(m));
  }
  await p.close();
}
await b.close();
