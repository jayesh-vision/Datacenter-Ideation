// usage: node .qa/el.mjs "/route" ".selector" out-name
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Number(process.env.W ?? 1440), height: 900 } });
await p.goto('http://localhost:5181' + process.argv[2], { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
await p.locator(process.argv[3]).first().screenshot({ path: `.qa/out/${process.argv[4]}.png` }); await b.close();
