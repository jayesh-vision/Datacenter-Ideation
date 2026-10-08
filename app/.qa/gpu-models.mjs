// GPU models & vendors (08-Oct-2026): models tab, vendor cards, model filter on nodes, node drawer hardware row — 1440 and 1280.
// usage: node .qa/gpu-models.mjs [persona]
import { chromium } from 'playwright';
const persona = process.argv[2] ?? 'neocloud';
const b = await chromium.launch(); let fail = 0;
const ok = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fail++; };
for (const W of [1440, 1280]) {
  const p = await b.newPage({ viewport: { width: W, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const open = async r => { await p.goto(`http://localhost:5181${r}${r.includes('?') ? '&' : '?'}persona=${persona}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(700); };
  const over = () => p.evaluate(() => ({ page: document.documentElement.scrollWidth > innerWidth + 2, tables: [...document.querySelectorAll('.dt-scroll')].filter(s => s.scrollWidth > s.clientWidth + 2).length, bad: ['NaN', 'undefined', '[object'].filter(w => document.body.innerText.includes(w)) }));
  await open('/gpu?gtab=models');
  const rows = await p.locator('.dt tbody tr').count();
  ok(`${W} models tab lists models (${rows})`, rows >= 6);
  const vendors = await p.locator('.gpu-vendor-card').count(); ok(`${W} vendor cards (${vendors})`, vendors === 2);
  const txt = await p.locator('.page').innerText();
  ok(`${W} NVIDIA + Intel models named`, ['H100', 'H200', 'A100', 'T4', 'L40S', 'Gaudi 3', 'Max 1550'].every(m => txt.includes(m)));
  let o = await over(); ok(`${W} models: no overflow / bad text`, !o.page && !o.tables && !o.bad.length);
  await p.screenshot({ path: `.qa/out/gpu-models-${W}.png`, fullPage: true });
  await p.locator('.gpu-vendor-card', { hasText: 'Intel' }).click(); await p.waitForTimeout(300);
  ok(`${W} Intel card filters the table`, (await p.locator('.dt tbody tr').count()) === 2);
  await p.locator('.dt tbody tr').first().click(); await p.waitForTimeout(700);
  ok(`${W} model row opens nodes filtered`, p.url().includes('gtab=nodes') && p.url().includes('gmodel='));
  const vt = await p.locator('.dt tbody tr .gpu-vendor').allInnerTexts(); ok(`${W} filtered nodes are Intel (${vt.length})`, vt.length > 0 && vt.every(x => x === 'Intel'));
  o = await over(); ok(`${W} nodes: no overflow`, !o.page && !o.tables && !o.bad.length);
  await p.screenshot({ path: `.qa/out/gpu-models-nodes-${W}.png` });
  await p.locator('.dt tbody tr').first().click(); await p.waitForTimeout(900);
  const hw = await p.locator('[data-gpu-hw]').innerText().catch(() => '');
  ok(`${W} drawer shows vendor, model, server, telemetry`, /Intel/.test(hw) && /Server/.test(hw) && /Telemetry/.test(hw));
  await p.screenshot({ path: `.qa/out/gpu-models-drawer-${W}.png` });
  ok(`${W} no page errors`, !errs.length); if (errs.length) console.log(errs.slice(0, 3));
  await p.close();
}
console.log(fail ? `${fail} FAILED` : 'ALL PASS'); await b.close(); process.exit(fail ? 1 : 0);
