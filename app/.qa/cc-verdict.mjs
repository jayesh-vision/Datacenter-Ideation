// Command center hero, left column: gauge drawn whole, title row on one line, facts strip with no cut text.
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const persona of ['colocation', 'network', 'neocloud']) for (const w of [1440, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto(`http://localhost:5181/?geo=in&persona=${persona}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const L = document.querySelector('.hero-left'), g = L.querySelector('.hero-verdict > svg').getBoundingClientRect();
    const top = L.querySelector('.hero-verdict-top'), tr = [...top.children].map(c => Math.round(c.getBoundingClientRect().top));
    const cut = [...L.querySelectorAll('.hero-fact-l, .hero-fact-n, .hero-line, .hero-weak')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent);
    const facts = [...L.querySelectorAll('.hero-fact')].map(f => f.innerText.replace(/\n/g, ' '));
    const fh = [...new Set([...L.querySelectorAll('.hero-fact')].map(f => Math.round(f.getBoundingClientRect().height)))];
    return { gauge: [Math.round(g.width), Math.round(g.height)], titleOneRow: new Set(tr).size === 1, cut, facts, factH: fh, line: L.querySelector('.hero-line').innerText, heroH: Math.round(document.querySelector('.hero').getBoundingClientRect().height) };
  });
  console.log(persona, w, JSON.stringify(r));
  await p.locator('.hero-left').screenshot({ path: `.qa/out/cc_verdict_${persona}_${w}.png` });
  await p.close();
}
await b.close();
