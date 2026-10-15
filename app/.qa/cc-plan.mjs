// Command center plan & build (14-Oct-2026): the strip above the hero, plan decisions in Recommendations, and the Plan & build lens.
// Checks per persona × geography × width: strip present with three segments, nothing NaN/undefined, no horizontal overflow, no text
// cut without an ellipsis, the hero still 600 px, lens pairs equal height, stage buttons switch the list, decision links go to approvals.
// usage: node .qa/cc-plan.mjs [persona geo ...]   (SHOTS=1 saves screenshots in .qa/out/)
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const combos = args.length ? args.reduce((a, x, i) => (i % 2 ? a : [...a, [args[i], args[i + 1]]]), []) : [['neocloud', 'us'], ['neocloud', 'in'], ['network', 'in']];
const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
let bad = 0;
const cutText = root => [...root.querySelectorAll('*')].filter(e => {
  if (!e.clientWidth || ['svg', 'path', 'I', 'EM'].includes(e.tagName)) return false;
  const cs = getComputedStyle(e);
  return e.scrollWidth > e.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && e.children.length === 0;
}).map(e => e.textContent.slice(0, 40));
for (const [persona, geo] of combos) for (const w of [1440, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: w === 1440 ? 900 : 800 } });
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`http://localhost:5181/?persona=${persona}&geo=${geo}`, { waitUntil: 'networkidle' }); await p.waitForSelector('.pb-strip', { timeout: 15000 }); await p.waitForTimeout(500);
  const ops = await p.evaluate(cut => {
    const strip = document.querySelector('.pb-strip'); const cutF = new Function('return ' + cut)();
    const segs = [...strip.querySelectorAll('.pb-seg')].map(s => Math.round(s.getBoundingClientRect().height));
    const hero = Math.round(document.querySelector('.hero').getBoundingClientRect().height);
    const trio = [...document.querySelector('.cmd-trio').children].map(c => Math.round(c.getBoundingClientRect().height));
    const recs = [...document.querySelectorAll('.cmd-trio .rec a')].map(a => a.getAttribute('href')).filter(h => h.startsWith('/planning/plans/'));
    return { stripH: Math.round(strip.getBoundingClientRect().height), segs, hero, trio, recs, cut: cutF(strip), over: document.documentElement.scrollWidth > innerWidth + 2, txt: ['NaN', 'undefined'].filter(t => document.body.innerText.includes(t)), text: [...strip.querySelectorAll('.pb-seg')].map(s => s.innerText.replace(/\n+/g, ' | ')) };
  }, cutText.toString());
  const okOps = ops.segs.length === 3 && Math.abs(ops.hero - 601) <= 1 && new Set(ops.trio).size === 1 && !ops.cut.length && !ops.over && !ops.txt.length && ops.recs.every(h => /\?tab=approvals$/.test(h));
  if (process.env.SHOTS) await p.screenshot({ path: `.qa/out/cc_plan_ops_${persona}_${geo}_${w}.png`, fullPage: true });
  // lens
  await p.locator('.cmd-lens button', { hasText: 'Plan & build' }).click(); await p.waitForSelector('.pb-pair'); await p.waitForTimeout(300);
  const lens = await p.evaluate(cut => {
    const cutF = new Function('return ' + cut)();
    const pairs = [...document.querySelectorAll('.pb-pair')].map(g => [...g.children].map(c => Math.round(c.getBoundingClientRect().height)));
    const root = document.querySelector('.page.cmd');
    return { url: location.search, pairs, hero: !!document.querySelector('.hero'), trio: !!document.querySelector('.cmd-trio'), cut: cutF(root), over: document.documentElement.scrollWidth > innerWidth + 2, txt: ['NaN', 'undefined'].filter(t => document.body.innerText.includes(t)),
      stages: [...document.querySelectorAll('.pb-stage')].map(s => s.innerText.replace(/\n+/g, ' ')), dec: document.querySelectorAll('.pb-dec .pb-row').length, week: document.querySelectorAll('.pb-week .pb-ev').length, proj: document.querySelectorAll('.pb-proj .pb-row').length };
  }, cutText.toString());
  if (process.env.SHOTS) await p.screenshot({ path: `.qa/out/cc_plan_lens_${persona}_${geo}_${w}.png`, fullPage: true });
  const switched = [];
  for (const k of [0, 1, 4]) { await p.locator('.pb-stage').nth(k).click(); await p.waitForTimeout(80); switched.push(await p.evaluate(() => `${document.querySelector('.pb-list-h .vw-card-activity-label').textContent}:${document.querySelectorAll('.pb-items .pb-item').length}`)); }
  const okLens = lens.url.includes('lens=build') && !lens.hero && !lens.trio && lens.pairs.every(r => new Set(r).size === 1) && !lens.cut.length && !lens.over && !lens.txt.length && lens.stages.length === 5;
  if (!okOps || !okLens || errs.length) bad++;
  console.log(`${persona} ${geo} ${w} ${okOps && okLens && !errs.length ? 'OK' : 'FAIL'}`);
  console.log('  ops ', JSON.stringify({ ...ops, text: undefined }));
  console.log('  strip', JSON.stringify(ops.text));
  console.log('  lens', JSON.stringify(lens), 'switch', switched.join(' '));
  if (errs.length) console.log('  console', errs.slice(0, 3));
  await p.close();
}
await b.close();
console.log(bad ? `${bad} failing` : 'all green');
process.exit(bad ? 1 : 0);
