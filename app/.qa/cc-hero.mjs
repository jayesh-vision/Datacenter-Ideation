// Command center hero: three columns (health · map · datacenter cards) share one height,
// the datacenter column scrolls vertically, nothing is cut, no horizontal overflow.
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto('http://localhost:5181/?geo=us&persona=neocloud', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const cols = [...document.querySelector('.hero').children].map(c => { const r = c.getBoundingClientRect(); return [c.className.split(' ').pop(), Math.round(r.width), Math.round(r.height)]; });
    const list = document.querySelector('.hero-dcs-list');
    const cards = list.querySelectorAll('.cmd-inc').length;
    const cut = [...list.querySelectorAll('.ci-dc-name, .vw-label')].filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis').length;
    const hs = [...list.querySelectorAll('.cmd-inc')].map(c => Math.round(c.getBoundingClientRect().height));
    const visible = Math.round((list.clientHeight / (hs[0] + 8)) * 10) / 10;
    return { cols, cardH: [...new Set(hs)].join('/'), visible, scrollable: list.scrollHeight > list.clientHeight, cards, cut, over: document.documentElement.scrollWidth > innerWidth + 2 };
  });
  const filt = {};
  for (const lbl of ['Critical', 'High', 'All']) {
    await p.locator('.hero-dcs-filter button', { hasText: lbl }).click(); await p.waitForTimeout(150);
    filt[lbl] = await p.evaluate(() => [...document.querySelectorAll('.hero-dcs-list .cmd-inc .ci-head .vw-chip:first-child')].map(e => e.textContent).join(',') || document.querySelector('.hero-dcs-list').textContent.slice(0, 60));
  }
  const gone = await p.evaluate(() => ({ vitals: !!document.querySelector('.vitals'), critNow: !!document.querySelector('.cmd-crit') }));
  console.log(w, JSON.stringify(r), JSON.stringify(gone), JSON.stringify(filt));
  await p.screenshot({ path: `.qa/out/cc_hero_${w}.png` });
  // map search: open, type a city, Enter → site card for the match
  await p.locator('.dcmap-btn[aria-label="Search datacenters"]').click();
  const q = await p.evaluate(() => document.querySelector('.dcmap-find-txt span')?.textContent.split(' · ')[1] ?? '');
  await p.fill('.dcmap-find input', q); await p.waitForTimeout(300);
  const hits = await p.locator('.dcmap-find-list > button').count();
  await p.screenshot({ path: `.qa/out/cc_search_${w}.png` });
  const first = await p.locator('.dcmap-find-list > button b').first().textContent();
  await p.keyboard.press('Enter'); await p.waitForTimeout(900);
  const card = await p.evaluate(() => document.querySelector('.dcmap .dcpop .dcpop-id b')?.textContent);
  const none = await (async () => { await p.locator('.dcmap-btn[aria-label="Search datacenters"]').click(); await p.fill('.dcmap-find input', 'zzzz'); return p.locator('.dcmap-find-empty').count(); })();
  console.log('  search', JSON.stringify({ q, hits, first, card, ok: first === card, empty: none }));
  await p.screenshot({ path: `.qa/out/cc_search_pick_${w}.png` });
  await p.close();
}
await b.close();
