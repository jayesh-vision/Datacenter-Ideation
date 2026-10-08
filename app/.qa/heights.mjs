// Side-by-side panels on the command center must share one height.
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto('http://localhost:5181/', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const rows = await p.evaluate(() => [...document.querySelectorAll('.cmd-trio')].map(g => {
    const kids = [...g.children].map(c => c.getBoundingClientRect());
    const tops = new Map(); kids.forEach(r => { const k = Math.round(r.top); tops.set(k, [...(tops.get(k) ?? []), Math.round(r.height)]); });
    return { cls: g.className, rows: [...tops.values()] };
  }));
  const scroll = await p.evaluate(() => { const el = document.querySelector('.cmd-fill .board'); return el ? { scrollable: el.scrollHeight > el.clientHeight + 2, h: el.clientHeight, content: el.scrollHeight } : null; });
  const runway = await p.locator('text=What is left').count();
  console.log(w, JSON.stringify(rows), 'board', JSON.stringify(scroll), 'whatIsLeft', runway);
  await p.screenshot({ path: `.qa/out/heights_${w}.png`, fullPage: true });
  await p.close();
}
await b.close();
