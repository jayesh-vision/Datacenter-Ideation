// Capacity screens: every tab, scope, reservations filter, plan modal. usage: node .qa/capacity.mjs [persona] [geo]  (W=1280)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'in', W = Number(process.env.W ?? 1440);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text()); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const go = async (u) => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(900); };
const check = async (name) => {
  await p.waitForTimeout(300);
  const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.body.innerText.includes(w)));
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  const tblOver = await p.evaluate(() => [...document.querySelectorAll('.dt-scroll')].some(s => s.scrollWidth > s.clientWidth + 2));
  ok(!t.length && !over && !tblOver, `${name}${t.length ? ' TEXT ' + t : ''}${over ? ' PAGE-OVERFLOW' : ''}${tblOver ? ' TABLE-OVERFLOW' : ''}`);
  /* screenshots only when something is wrong (or SHOTS=1), to keep the disk free */
  if (process.env.SHOTS || t.length || over || tblOver) await p.screenshot({ path: `.qa/out/cap-${P}-${W}-${name}.png`, fullPage: true });
};
await p.goto(`http://localhost:5181/capacity?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' });
for (const t of ['overview', 'power', 'space', 'network', 'compute', 'reservations', 'energy', 'financial']) { await go(`/capacity${t === 'overview' ? '' : `?tab=${t}`}`); await check(t); }
const site = await p.locator('select[aria-label="Datacenter"] option').nth(1).getAttribute('value');
await go(`/capacity?tab=reservations&dc=${site}`); await check('reservations-site');
const n = Number(/of ([\d,]+) holds/.exec(await p.locator('.lt-count').innerText())?.[1].replace(/,/g, '') ?? -1);
ok(n >= 0, `site holds listed (${n})`);
await go('/capacity'); await p.getByRole('button', { name: 'Raise capacity plan' }).click(); await p.waitForTimeout(400);
ok(await p.locator('.modal').count() === 1, 'plan modal opens'); await p.keyboard.press('Escape');
ok(await p.locator('.rail a[href="/capacity"], nav a[href="/capacity"]').count() > 0, 'Capacity in the menu');
console.log(errs.length ? `  ✗ console: ${errs.slice(0, 3).join(' | ')}` : '  ✓ no console errors'); if (errs.length) bad++;
await b.close(); console.log(bad ? `✗ ${bad} problem(s)` : '✓ Capacity screens OK'); process.exit(bad ? 1 : 0);
