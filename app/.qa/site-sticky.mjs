import { chromium } from 'playwright';
const b = await chromium.launch(); let fail = 0;
for (const W of [1280, 1440]) for (const [tab, mode] of [['elements', 'compact'], ['customers', 'compact'], ['metrics', 'compact'], ['elements', 'expanded']]) {
  const p = await b.newPage({ viewport: { width: W, height: 900 } });
  await p.addInitScript(m => { try { localStorage.setItem('dco.site.header', m); } catch {} }, mode);
  await p.goto(`http://localhost:5181/datacenters/TX-DC-022?tab=${tab}&persona=neocloud&geo=us`, { waitUntil: 'load' }); await p.waitForTimeout(1800);
  await p.mouse.wheel(0, 1600); await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const top = document.querySelector('.topbar').getBoundingClientRect().bottom;
    const st = document.querySelector('.site-sticky').getBoundingClientRect();
    const bar = document.querySelector('.site-sticky .dch-bar'), pills = document.querySelector('.site-sticky .pills').getBoundingClientRect();
    const tb = document.querySelector('.dt > .dt-toolbar')?.getBoundingClientRect();
    return { scrolled: Math.round(scrollY || document.scrollingElement.scrollTop), stTop: Math.round(st.top), top: Math.round(top), stBottom: Math.round(st.bottom), bar: !!bar, pillsTop: Math.round(pills.top), tbTop: tb ? Math.round(tb.top) : null, over: document.documentElement.scrollWidth - innerWidth };
  });
  const ok = Math.abs(r.stTop - r.top) <= 1 && (mode === 'expanded' || r.bar) && (r.tbTop === null || r.tbTop >= r.stBottom - 1) && r.over <= 0;
  if (!ok) fail++;
  console.log(W, tab, mode, ok ? 'ok' : 'FAIL', JSON.stringify(r));
  if (W === 1280 && tab === 'elements' && mode === 'compact') await p.screenshot({ path: '.qa/out/site-sticky.png' });
  await p.close();
}
await b.close(); console.log(fail ? `${fail} FAILED` : 'site sticky: ok');
