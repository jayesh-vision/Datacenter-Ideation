// Plan pack › Drawings: every sheet of every plan (or the ids given) — page errors, NaN/undefined, overflow, empty sheets, SVG text
// that overlaps other text or runs outside its sheet; element screenshot per sheet into OUT (default .qa/out/drawings).
// usage: node .qa/p2b-drawings.mjs [persona] [geo] [PLN-…,PLN-…]   (W=1440)
import { chromium } from 'playwright';
import fs from 'node:fs';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'us', only = process.argv[4]?.split(','), W = Number(process.env.W ?? 1440);
const OUT = process.env.OUT ?? '.qa/out/drawings'; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: W, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text().slice(0, 300)); });
const go = async u => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(900); };
await p.goto(`http://localhost:5181/planning/plans?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
const ids = only ?? Array.from({ length: 15 }, (_, i) => `PLN-${String(i + 1).padStart(4, '0')}`);
let bad = 0;
for (const id of ids) {
  await go(`/planning/plans/${id}?tab=pack&sec=drawings`);
  const sheets = await p.locator('.pk-sheet').count();
  const info = await p.evaluate(() => {
    const out = [];
    for (const sh of document.querySelectorAll('.pk-sheet')) {
      const num = sh.querySelector('.pk-sheet-tb b')?.textContent ?? '?'; const title = sh.querySelectorAll('.pk-sheet-tb b')[1]?.textContent ?? '';
      const empty = !!sh.querySelector('.pk-draw-empty, .pc-empty');
      const box = sh.getBoundingClientRect();
      // overlapping text: pairs of <text> boxes in the same svg that intersect by more than 2px
      const over = [];
      for (const svg of sh.querySelectorAll('svg')) {
        const ts = [...svg.querySelectorAll('text')].filter(t => t.textContent.trim()).map(t => ({ t: t.textContent.trim(), r: t.getBoundingClientRect() }));
        for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) { const a = ts[i].r, c = ts[j].r; const ix = Math.min(a.right, c.right) - Math.max(a.left, c.left), iy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top); if (ix > 2 && iy > 2) over.push(`${ts[i].t.slice(0, 30)} ⟂ ${ts[j].t.slice(0, 30)}`); }
        for (const t of ts) if (t.r.right > box.right + 1 || t.r.left < box.left - 1) over.push(`outside: ${t.t.slice(0, 40)}`);
      }
      const txt = sh.innerText; const badTxt = ['NaN', 'undefined', 'Infinity', 'Invalid Date', '[object'].filter(w => txt.includes(w));
      out.push({ num, title, empty, over: over.slice(0, 6), nOver: over.length, badTxt, h: Math.round(box.height) });
    }
    return { out, manifest: [...document.querySelectorAll('.pk .vw-chip')].map(c => c.textContent).filter(t => /not generated|Drawings/.test(t)), overflow: document.documentElement.scrollWidth > innerWidth + 2 };
  });
  console.log(`${id} · ${sheets} sheets${info.overflow ? ' OVERFLOW' : ''}${errs.length ? ' ERR ' + errs.slice(0, 2).join(' | ') : ''}`);
  console.log(`   manifest: ${info.manifest.join(' | ')}`);
  for (let i = 0; i < info.out.length; i++) {
    const s = info.out[i]; const flag = s.empty || s.nOver || s.badTxt.length;
    if (flag) bad++;
    console.log(`   ${flag ? '✗' : '·'} ${s.num} ${s.title} h=${s.h}${s.empty ? ' EMPTY' : ''}${s.badTxt.length ? ' TEXT ' + s.badTxt : ''}${s.nOver ? ` OVERLAP ${s.nOver}: ${s.over.join(' ; ')}` : ''}`);
    if (!process.env.NOSHOT) await p.locator('.pk-sheet').nth(i).screenshot({ path: `${OUT}/${s.num}.png` });
  }
  if (errs.length || info.overflow) bad++;
  errs.length = 0;
}
await b.close();
console.log(bad ? `${bad} problem(s)` : 'all sheets clear'); process.exit(bad ? 1 : 0);
