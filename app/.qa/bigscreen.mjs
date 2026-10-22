// Big screens / TVs: no horizontal overflow, nothing stretched, screenshots at 1920 / 2560 / 3840 (22-Oct-2026)
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5181';
const widths = (process.env.WS || '1920,2560,3840').split(',').map(Number);
const routes = (process.argv[2] || '/|cc,/datacenters|dcs,/datacenters/VA-DC-001|site,/facilities|fac,/gpu|gpu,/revenue|rev,/alerts|alerts,/incidents|inc,/changes|chg,/capacity|cap,/dcim|dcim,/planning|plan').split(',');
const b = await chromium.launch(); const bad = [];
for (const w of widths) {
  const p = await b.newPage({ viewport: { width: w, height: Math.round(w * 9 / 16) } });
  for (const rr of routes) {
    const [r, n] = rr.split('|');
    await p.goto(`${BASE}${r}${r.includes('?') ? '&' : '?'}persona=neocloud&geo=us`, { waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForFunction(() => !document.body.innerText.includes('Loading…'), null, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(900);
    const m = await p.evaluate(() => {
      const page = document.querySelector('.page'); const main = document.querySelector('main') || document.body;
      const pr = page?.getBoundingClientRect(), mr = main.getBoundingClientRect();
      return { hOver: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, pageW: Math.round(pr?.width ?? 0), mainW: Math.round(mr.width), left: Math.round((pr?.left ?? 0) - mr.left), right: Math.round(mr.right - (pr?.right ?? 0)) };
    });
    console.log(w, n.padEnd(6), JSON.stringify(m));
    if (m.hOver) bad.push(`${w} ${n}: horizontal overflow`);
    await p.screenshot({ path: `.qa/out/big-${w}-${n}.png` });
  }
  await p.close();
}
await b.close(); console.log(bad.length ? 'FAIL\n' + bad.join('\n') : 'OK');
