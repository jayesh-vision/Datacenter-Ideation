// IP & Network screens: every tab, scope, prefix drawer + address map, reserve next IP, carve a prefix.
// usage: node .qa/ipam.mjs [persona] [geo]   (W=1280)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'in', W = Number(process.env.W ?? 1440);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text()); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const go = async (u) => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(900); };
const check = async (name) => {
  await p.waitForTimeout(400);
  const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.body.innerText.includes(w)));
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  const tblOver = await p.evaluate(() => [...document.querySelectorAll('.dt-scroll')].some(s => s.scrollWidth > s.clientWidth + 2));
  ok(!t.length && !over && !tblOver, `${name}${t.length ? ' TEXT ' + t : ''}${over ? ' PAGE-OVERFLOW' : ''}${tblOver ? ' TABLE-OVERFLOW' : ''}`);
  /* screenshots only when something is wrong (or SHOTS=1), to keep the disk free */
  if (process.env.SHOTS || t.length || over || tblOver) await p.screenshot({ path: `.qa/out/ipam-${P}-${W}-${name}.png`, fullPage: true });
};
await p.goto(`http://localhost:5181/ipam?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' });
for (const t of ['overview', 'prefixes', 'addresses', 'vrfs', 'vlans', 'asns', 'services']) { await go(`/ipam${t === 'overview' ? '' : `?tab=${t}`}`); await check(t); }
await go('/ipam?tab=services&sv=apps'); await check('services-apps');
/* scope */
const site = await p.locator('select[aria-label="Datacenter scope"] option').nth(1).getAttribute('value');
await go(`/ipam?tab=prefixes&dc=${site}`); await check('prefixes-site');
/* open a management /24 and reserve the next address */
await go(`/ipam?tab=prefixes&dc=${site}&role=Management`);
await p.locator('.ipam-tree tbody tr').nth(1).click(); await p.waitForTimeout(700);
ok(await p.locator('.drawer .ipam-cell').count() > 0, 'prefix drawer shows the address map');
const before = await p.locator('.drawer .kv').innerText();
const usedB = Number(/Usage\s*(\d+) of/.exec(before)?.[1]);
await p.locator('.drawer').getByRole('button', { name: 'Reserve next IP' }).click(); await p.waitForTimeout(900);
const after = await p.locator('.drawer .kv').innerText();
const usedA = Number(/Usage\s*(\d+) of/.exec(after)?.[1]);
ok(usedA === usedB + 1, `reserve next IP: used ${usedB} → ${usedA}`);
await p.keyboard.press('Escape');
/* carve from the site fabric container */
await go(`/ipam?tab=prefixes&dc=${site}&q=site%20fabric`);
await p.locator('.ipam-tree tbody tr').first().click(); await p.waitForTimeout(600);
const kidsB = await p.locator('.drawer .dcim-comp tbody tr').count();
await p.locator('.drawer').getByRole('button', { name: 'Carve a prefix' }).click(); await p.waitForTimeout(400);
await p.locator('.modal').getByRole('button', { name: 'Reserve block' }).click(); await p.waitForTimeout(900);
ok((await p.locator('.drawer').innerText()).includes('Reserved'), 'carved prefix opens as Reserved');
console.log(errs.length ? `  ✗ console: ${errs.slice(0, 3).join(' | ')}` : '  ✓ no console errors'); if (errs.length) bad++;
void kidsB;
await b.close();
console.log(bad ? `✗ ${bad} problem(s)` : '✓ IPAM screens OK'); process.exit(bad ? 1 : 0);
