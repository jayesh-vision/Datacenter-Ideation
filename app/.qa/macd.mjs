// MACD screens (node .qa/macd.mjs [persona] [geo]; W=1280): every sub-menu renders with no NaN / undefined / overflow, the board and a
// request page open, then New request → submit → feasible → (quote) → start → work done → verified, ending Completed.
import { chromium } from 'playwright';
const [persona = 'neocloud', geo = 'us'] = process.argv.slice(2);
const W = Number(process.env.W ?? 1440), BASE = process.env.BASE ?? 'http://localhost:5181';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text()); });
let bad = 0; const fail = m => { bad++; console.log('FAIL', m); };
const Q = `persona=${persona}&geo=${geo}`;
const check = async name => {
  const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.querySelector('.page')?.innerText.includes(w)));
  if (t.length) fail(`${name}: text ${t}`);
  if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)) fail(`${name}: horizontal overflow`);
  const tb = await p.evaluate(() => [...document.querySelectorAll('.dt-scroll, .mc-board')].some(e => e.scrollWidth > e.clientWidth + 2));
  if (tb) fail(`${name}: table overflow`);
  if (errs.length) { fail(`${name}: ${errs.join(' | ').slice(0, 200)}`); errs.length = 0; }
};
for (const t of ['', 'requests', 'board', 'schedule', 'catalog']) {
  await p.goto(`${BASE}/macd?${t ? `tab=${t}&` : ''}${Q}`, { waitUntil: 'networkidle' }); await p.waitForSelector('.page-head'); await p.waitForTimeout(400);
  await check(t || 'overview');
}
await p.goto(`${BASE}/macd?tab=requests&${Q}`, { waitUntil: 'networkidle' }); await p.waitForSelector('.dt tbody tr');
await p.click('.dt tbody tr'); await p.waitForSelector('.mc-track'); await check('request page');
/* end to end */
await p.goto(`${BASE}/macd?new=1&cat=MAC-A01&${Q}`, { waitUntil: 'networkidle' }); await p.waitForSelector('.mc-form'); await p.waitForFunction(() => document.querySelectorAll('.mc-form select')[2]?.options.length > 3); await p.waitForTimeout(300);
const rk = await p.$$eval('.mc-form select', ss => { const s = ss[2]; const o = [...s.options].find(x => { const m = x.text.match(/· (\d+) U free · ([\d.]+)\/([\d.]+) kW/); return m && +m[1] >= 8 && +m[2] < +m[3] * 0.5; }); return o?.value; });
if (!rk) fail('no rack with room'); else {
  await p.selectOption('.mc-form select >> nth=2', rk); await p.waitForSelector('.mc-preview'); await p.waitForTimeout(300); await check('new request');
  await p.click('text=Submit request'); await p.waitForURL(/\/macd\/requests\//); await p.waitForSelector('.mc-track');
  const step = async (label, modal) => { await p.click(`.page-head button:has-text("${label}")`); if (modal) { await p.waitForSelector('.modal'); await p.click(`.modal button:has-text("${modal}")`); } await p.waitForTimeout(400); };
  const stage = () => p.$eval('.mc-steps li.is-now span, .mc-steps li:last-child span', e => e.textContent);
  await step(await p.$('.page-head button:has-text("send the quote")') ? 'send the quote' : 'schedule it');
  if (await p.$('.page-head button:has-text("accepted the quote")')) await step('accepted the quote');
  if (await p.$('.page-head button:has-text("Start the work"):disabled')) fail('start disabled: ' + await p.$eval('.mc-note', e => e.textContent).catch(() => ''));
  await step('Start the work'); await step('Work done', 'Work done'); await step('Verified, close');
  const done = await p.$eval('.mc-track', e => e.innerText.includes('Closed'));
  if (!done) fail(`e2e not closed (${await stage()})`);
  await check('after e2e');
  const hist = await p.$eval('.mc-hist', e => e.innerText.split('\n').length);
  console.log(`e2e ${p.url().split('/').pop().split('?')[0]} in ${rk}: ${hist} history lines`);
}
await b.close();
console.log(bad ? `${bad} failures` : `MACD screens ok (${persona} ${geo} W=${W})`);
process.exit(bad ? 1 : 0);
