// Device digital twin, 3D (08-Oct-2026): every mode of one device per family renders (WebGL canvas), no console errors,
// no overflow, the summary lists issues and opens the inspector — 1440 and 1280. Slow under software GL.
import { chromium } from 'playwright';
const CASES = [['neocloud', 'KA-DC-020-GPU-035'], ['neocloud', 'UP-DC-006-GPU-001'], ['neocloud', 'MH-DC-001-IB-SPINE-01'], ['network', 'MH-DC-001-PE-T4-01'],
  ['network', 'MH-DC-001-FW-01'], ['network', 'MH-DC-001-OLA-01'], ['neocloud', 'MH-DC-002-STG-001'], ['cloud', 'MH-DC-001-CMP-0001'], ['colocation', 'MH-DC-001-TN-001']];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); let fail = 0;
const ok = (n, c) => { if (!c) { console.log('FAIL', n); fail++; } };
for (const W of (process.env.W ? [Number(process.env.W)] : [1440, 1280])) {
  const p = await b.newPage({ viewport: { width: W, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  for (const [persona, id] of CASES) {
    await p.goto(`http://localhost:5181/ne/${id}?tab=twin&persona=${persona}`, { waitUntil: 'networkidle' });
    const c = await p.waitForSelector('[data-devtwin-stage] canvas', { timeout: 40000 }).catch(() => null);
    if (!c) { ok(`${W} ${id} canvas missing`, false); continue; }
    await p.waitForTimeout(id.includes('GPU') ? 1500 : 600);
    const modes = await p.locator('.dt-head .seg button').allInnerTexts();
    for (let v = 0; v < modes.length; v++) {
      await p.locator('.dt-head .seg button').nth(v).click(); await p.waitForTimeout(900);
      const r = await p.evaluate(() => ({ canvas: !!document.querySelector('[data-devtwin-stage] canvas'), over: document.documentElement.scrollWidth > innerWidth + 2, bad: ['NaN', 'undefined', '[object'].filter(w => document.querySelector('[data-devtwin]').textContent.includes(w)) }));
      ok(`${W} ${id} ${modes[v]}: canvas ${r.canvas} over ${r.over} bad ${r.bad}`, r.canvas && !r.over && !r.bad.length);
    }
    const issue = p.locator('.dt-issues button').first();
    if (await issue.count()) { await issue.click(); ok(`${W} ${id} issue opens the inspector`, (await p.locator('[data-devtwin-inspector] .dt-insp-t').innerText()).length > 0); }
    console.log(W, id, modes.join(' · '));
  }
  ok(`${W} no console errors ${errs.slice(0, 2)}`, !errs.length);
  await p.close();
}
console.log(fail ? `${fail} FAILED` : 'ALL PASS'); await b.close(); process.exit(fail ? 1 : 0);
