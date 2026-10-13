// Compliance + Customization: every tab, a violation opens its record, add a field and a tag. usage: node .qa/admin.mjs [persona] [geo]
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'in', W = Number(process.env.W ?? 1440);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text()); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const go = async (u) => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(800); };
const check = async (name) => {
  await p.waitForTimeout(300);
  const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.body.innerText.includes(w)));
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  const tblOver = await p.evaluate(() => [...document.querySelectorAll('.dt-scroll')].some(s => s.scrollWidth > s.clientWidth + 2));
  ok(!t.length && !over && !tblOver, `${name}${t.length ? ' TEXT ' + t : ''}${over ? ' PAGE-OVERFLOW' : ''}${tblOver ? ' TABLE-OVERFLOW' : ''}`);
  if (process.env.SHOTS || t.length || over || tblOver) await p.screenshot({ path: `.qa/out/adm-${P}-${W}-${name}.png`, fullPage: true });
};
await p.goto(`http://localhost:5181/compliance?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' });
for (const t of ['posture', 'controls', 'policies', 'violations', 'audit']) { await go(`/compliance${t === 'posture' ? '' : `?tab=${t}`}`); await check(`compliance-${t}`); }
await go('/compliance?tab=violations'); const from = p.url(); await p.locator('.dt-table tbody tr').first().click(); await p.waitForTimeout(800);
ok(p.url() !== from, `violation opens its record → ${new URL(p.url()).pathname}`);
for (const t of ['fields', 'tags']) { await go(`/customization${t === 'fields' ? '' : '?tab=tags'}`); await check(`custom-${t}`);
  const n0 = await p.locator('.dt-table tbody tr').count(); await p.getByRole('button', { name: t === 'fields' ? 'New field' : 'New tag' }).click(); await p.waitForTimeout(300);
  await p.locator('.modal input').first().fill(`QA ${t}`); await p.locator('.modal').getByRole('button', { name: 'Add' }).click(); await p.waitForTimeout(800);
  ok(await p.locator('.dt-table tbody tr').count() === n0 + 1, `${t}: added one`); }
console.log(errs.length ? `  ✗ console: ${errs.slice(0, 3).join(' | ')}` : '  ✓ no console errors'); if (errs.length) bad++;
await b.close(); console.log(bad ? `✗ ${bad} problem(s)` : '✓ Admin screens OK'); process.exit(bad ? 1 : 0);
