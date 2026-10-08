// Command center lower row: What is happening · Who is affected · What to do next — 30/40/30, equal height, no cut text, no Why panel.
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [geo, persona] of [['in', 'network'], ['us', 'neocloud']]) for (const w of [1440, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto(`http://localhost:5181/?geo=${geo}&persona=${persona}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const g = document.querySelector('.cmd-trio');
    const cols = [...g.children].map(c => { const r = c.getBoundingClientRect(); return [c.querySelector('.panel-title, h3, .vw-card-title')?.textContent?.slice(0, 22), Math.round(r.width), Math.round(r.height), Math.round(r.top)]; });
    const hero = [...document.querySelector('.hero').children].map(c => Math.round(c.getBoundingClientRect().width));
    const overflowX = [...g.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible' && e.clientWidth > 0 && !['SVG','svg','path'].includes(e.tagName)).length;
    const why = !![...document.querySelectorAll('.panel')].find(x => /^Why/.test(x.textContent.trim()));
    const btns = [...g.querySelectorAll('.rec .nst-btn')].map(x => { const r = x.getBoundingClientRect(), pr = x.closest('.panel').getBoundingClientRect(); return r.right <= pr.right + 1; }).every(Boolean);
    const rev = !!document.querySelector('.rev-band'); return { rev, cols, hero, overflowX, why, btnsInside: btns, over: document.documentElement.scrollWidth > innerWidth + 2, txt: ['NaN', 'undefined'].filter(t => document.body.innerText.includes(t)) };
  });
  console.log(geo, persona, w, JSON.stringify(r));
  await p.evaluate(() => document.querySelector('.cmd-trio').scrollIntoView({ block: 'start' })); await p.waitForTimeout(200);
  await p.screenshot({ path: `.qa/out/cc_trio_${persona}_${w}.png` });
  await p.close();
}
await b.close();
