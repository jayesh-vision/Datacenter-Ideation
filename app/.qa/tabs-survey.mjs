// Page-level tab bars: is each pinned under the top bar after scrolling? (22-Oct-2026)
import { chromium } from 'playwright';
const W = +(process.env.W || 1440), BASE = process.env.BASE || 'http://localhost:5181';
const routes = (process.argv[2] || '/facilities,/revenue,/changes,/alerts,/incidents,/capacity,/ipam,/dcim?tab=racks,/delivery?tab=projects,/workorders,/compliance,/customization,/help,/gpu,/incidents/INC-0001,/changes/CHG-2001,/ne/BDR-01,/datacenters/VA-DC-001,/planning?tab=plans,/planning/plans/PLN-0002,/delivery/projects/PRJ-0002,/customers').split(',');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const bad = [];
for (const r of routes) {
  await p.goto(`${BASE}${r}${r.includes('?') ? '&' : '?'}persona=neocloud&geo=us`, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForFunction(() => !document.body.innerText.includes('Loading…'), null, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(500);
  await p.evaluate(() => window.scrollTo(0, Math.min(1500, document.documentElement.scrollHeight - innerHeight - 10))); await p.waitForTimeout(350);
  const m = await p.evaluate(() => {
    const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
    const tabs = [...document.querySelectorAll('.page .tabs, .page .site-subtabs')].filter(t => !t.closest('.panel, .drawer, .modal, .card, .vw-card-section, [role=dialog]'));
    if (!tabs.length) return { none: true, sy: scrollY };
    const t = tabs[0].closest('.gpu-tabbar, .pn-tabrow') || tabs[0]; const r = t.getBoundingClientRect();
    const chain = []; let e = t; while (e && e !== document.body) { chain.push(e.className && typeof e.className === 'string' ? e.className.split(' ')[0] : e.tagName); e = e.parentElement; }
    const ths = [...document.querySelectorAll('.dt-table thead th, .dt > .dt-toolbar')].map(e => e.getBoundingClientRect()).filter(x => x.bottom > top + 1 && x.top < innerHeight && x.height > 0).sort((a, b) => a.top - b.top);
    return { top: Math.round(top), tabTop: Math.round(r.top), tabBottom: Math.round(r.bottom), sy: Math.round(scrollY), first: ths.length ? Math.round(ths[0].top) : null, chain: chain.slice(0, 5).join(' < '), overflow: t.scrollWidth > t.clientWidth + 1 };
  });
  console.log(r, JSON.stringify(m));
  if (m.none) continue;
  if (m.sy > 200 && Math.abs(m.tabTop - m.top) > 1) bad.push(`${r}: tab bar not pinned (${m.tabTop} vs ${m.top})`);
  if (m.first !== null && m.first >= m.tabTop && m.first < m.tabBottom - 1) bad.push(`${r}: list header under the tab bar`);
  if (m.overflow) bad.push(`${r}: tabs overflow`);
}
await b.close(); console.log(bad.length ? 'FAIL\n' + bad.join('\n') : 'OK');
