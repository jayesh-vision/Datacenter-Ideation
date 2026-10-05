import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1600, 1440, 1280, 1100]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } }); await p.addInitScript(() => localStorage.setItem('dco.persona', 'network'));
  for (const [name, r] of [['datacenters', '/datacenters'], ['facilities', '/facilities?dc=MH-DC-001'], ['alerts', '/alerts'], ['incidents', '/incidents'], ['changes', '/changes']]) {
    await p.goto('http://localhost:5181' + r, { waitUntil: 'load' }); await p.waitForTimeout(1300);
    const m = await p.evaluate(() => { const T = [...document.querySelectorAll('.dco-tile')]; const top = T[0].getBoundingClientRect().top; const rel = s => [...new Set(T.map(t => { const e = t.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top - top) : '-'; }))].join('/');
      return { h: [...new Set(T.map(t => Math.round(t.getBoundingClientRect().height)))].join('/'), bar: rel('.dco-bar, .dco-meter'), facts: rel('.dco-facts'), overflow: T.filter(t => { const d = t.querySelector('.dco-detail'); return d.scrollHeight > d.clientHeight + 1; }).map(t => t.querySelector('.dco-l').textContent), cut: [...document.querySelectorAll('.dco-kv em, .dco-facts > span, .dco-sub')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim()),
        /* vertical: every line must sit fully inside its tile's detail box */
        clippedV: T.flatMap(t => { const d = t.querySelector('.dco-detail').getBoundingClientRect(); return [...t.querySelectorAll('.dco-detail .dco-kv > span, .dco-detail .dco-facts > span, .dco-detail .dco-rank > span, .dco-detail .dco-bars')].filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().bottom > d.bottom + 0.5).map(e => t.querySelector('.dco-l').textContent + ': ' + e.textContent.trim().slice(0, 30)); }) }; });
    console.log(w, name.padEnd(11), JSON.stringify(m));
    if (w === 1440) await p.locator('.dco-card').screenshot({ path: `.qa/out/calm_${name}.png` });
  }
  await p.close();
}
await b.close();
