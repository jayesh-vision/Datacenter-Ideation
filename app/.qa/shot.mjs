// usage: node .qa/shot.mjs /route[:name] ...   → .qa/out/<name>.png (full page) + console errors
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(process.env.W ?? 1440), height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text()); });
for (const arg of process.argv.slice(2)) {
  const [route, name] = arg.split('|');
  errs.length = 0;
  await p.goto('http://localhost:5181' + route, { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
  const file = `.qa/out/${name ?? route.replace(/[^a-z0-9]+/gi, '_')}.png`;
  await p.screenshot({ path: file, fullPage: process.env.FULL !== '0' });
  const bad = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.body.innerText.includes(w)));
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  console.log(file, bad.length ? 'TEXT:' + bad : '', over ? 'H-OVERFLOW' : '', errs.length ? 'ERR: ' + errs.slice(0, 2).join(' | ').slice(0, 300) : '');
}
await b.close();
