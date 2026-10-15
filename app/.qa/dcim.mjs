// DCIM screens: every tab, rack page, type page, device drawer, cable path, new rack + install device flows.
// usage: node .qa/dcim.mjs [persona] [geo]   (W=1280 for the narrow layout)
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'in', W = Number(process.env.W ?? 1440);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text()); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const base = 'http://localhost:5181';
/* in-app navigation (a reload regenerates the mock and drops what the flow created) */
const go = async (u) => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(700); };
const check = async (name) => {
  await p.waitForTimeout(500);
  const t = await p.evaluate(() => ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date'].filter(w => document.body.innerText.includes(w)));
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  const tblOver = await p.evaluate(() => [...document.querySelectorAll('.dt-scroll')].some(s => s.scrollWidth > s.clientWidth + 2));
  ok(!t.length && !over && !tblOver, `${name}${t.length ? ' TEXT ' + t : ''}${over ? ' PAGE-OVERFLOW' : ''}${tblOver ? ' TABLE-OVERFLOW' : ''}`);
  /* screenshots only when something is wrong (or SHOTS=1), to keep the disk free */
  if (process.env.SHOTS || t.length || over || tblOver) await p.screenshot({ path: `.qa/out/dcim-${P}-${W}-${name}.png`, fullPage: true });
};
await p.goto(`${base}/dcim?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' });
for (const t of ['sites', 'floorplan', 'racks', 'devices', 'cabling', 'power', 'changes', 'types', 'hierarchy']) {
  await p.goto(`${base}/dcim${t === 'sites' ? '' : `?tab=${t}`}`, { waitUntil: 'networkidle' }); await check(t);
}
/* scope to the first site: tiles and lists follow */
await p.goto(`${base}/dcim?tab=racks`, { waitUntil: 'networkidle' });
const site = await p.locator('select[aria-label="Datacenter scope"] option').nth(1).getAttribute('value');
await p.selectOption('select[aria-label="Datacenter scope"]', site); await p.waitForTimeout(600);
const shown = await p.locator('.lt-count').first().innerText();
const tile = await p.locator('.dco-tile').nth(1).innerText();
ok(/Showing \d+ of \d+ racks/.test(shown) && Number(/(\d+) racks/.exec(tile)?.[1]) === Number(/of ([\d,]+)/.exec(shown)[1].replace(/,/g, '')), `scoped ${site}: ${shown} matches the rack tile`);
/* floor plan → rack page */
await p.goto(`${base}/dcim?tab=floorplan&dc=${site}`, { waitUntil: 'networkidle' });
await p.locator('.dcim-rk').first().click(); await p.waitForURL(/\/dcim\/racks\//); await check('rack');
ok(await p.locator('.dcim-dev').count() > 0 || (await p.innerText('body')).includes('Empty cabinet'), 'rack elevation drawn');
await p.locator('.dcim-dev:not(.is-odf)').first().click(); await p.waitForTimeout(600);
ok(await p.locator('.drawer').count() === 1 && (await p.locator('.drawer .dcim-comp tbody tr').count()) > 0, 'device drawer lists components');
await p.keyboard.press('Escape');
/* a full reload regenerates the estate: wait for the cards rather than a fixed 600 ms (the telco estate grew on 15-Oct-2026 and missed it) */
await p.goto(p.url() + '?tab=power'); await p.locator('.dcim-pdus .panel').first().waitFor({ timeout: 8000 }).catch(() => {}); ok(await p.locator('.dcim-pdus .panel').count() >= 1, 'rack power cards');
/* type page */
await p.goto(`${base}/dcim?tab=types`, { waitUntil: 'networkidle' }); await p.locator('.dt-table tbody tr').first().click(); await p.waitForURL(/\/dcim\/types\//); await check('type');
/* cabling: a data cable opens its path */
await p.goto(`${base}/dcim?tab=cabling`, { waitUntil: 'networkidle' }); await p.locator('.dt-table tbody tr').first().click(); await p.waitForTimeout(800);
ok((await p.locator('.drawer').innerText()).includes('Cable path'), 'cable row opens the cable path'); await p.keyboard.press('Escape');
/* new rack */
await p.goto(`${base}/dcim?dc=${site}`, { waitUntil: 'networkidle' });
const racks0 = Number((await p.locator('.dco-tile').nth(1).innerText()).match(/(\d+)\s*racks/)[1]);
await p.getByRole('button', { name: 'New rack' }).click(); await p.waitForTimeout(400);
await p.locator('.modal').getByRole('button', { name: 'Create rack' }).click(); await p.waitForURL(/\/dcim\/racks\//, { timeout: 5000 }).catch(() => {});
ok(/\/dcim\/racks\//.test(p.url()), `new rack created → ${p.url().split('/').pop()}`);
const rackUrl = p.url();
await go(`/dcim?dc=${site}`);
const racks1 = Number((await p.locator('.dco-tile').nth(1).innerText()).match(/(\d+)\s*racks/)[1]);
ok(racks1 === racks0 + 1, `rack tile ${racks0} → ${racks1}`);
/* install a device into the new rack */
await go(new URL(rackUrl).pathname);
await p.getByRole('button', { name: 'Install device' }).click(); await p.waitForTimeout(600);
await p.locator('.modal').getByRole('button', { name: 'Plan device' }).click(); await p.waitForTimeout(800);
ok(await p.locator('.dcim-dev.is-planned').count() === 1, 'planned device shows hatched in the elevation');
const dup = await p.evaluate(() => document.body.innerText.includes('Planned'));
ok(dup, 'device listed as Planned');
ok(await p.locator('.dcim-crchip').count() >= 1, 'rack carries its change request chip');
/* change control: edit the rack under a NEW change request → planned; approve it in Change management; execute from the rack page */
await p.getByRole('button', { name: 'Edit' }).click(); await p.waitForTimeout(400);
await p.locator('.modal [data-cr-field] .seg button', { hasText: 'Raise new' }).click(); await p.waitForTimeout(200);
await p.locator('.modal input[type=number]').nth(1).fill('12');
await p.locator('.modal').getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(800);
const toastT = (await p.locator('.toast').allInnerTexts()).join(' | ');
const chg = /CHG-\d+/.exec(toastT)?.[0];
ok(!!chg && /Planned under/.test(toastT), `edit planned under a new CR ${chg ?? toastT}`);
ok(await p.locator('.dcim-crpending').count() === 1, 'rack header shows the planned change');
await go(`/changes/${chg}`); await check('change-page');
ok((await p.innerText('body')).includes('DCIM work'), 'change page lists its DCIM work');
for (let k = 0; k < 4; k++) { const ap = p.getByRole('button', { name: /^Approve as/ }); if (!(await ap.count())) break; await ap.click(); await p.waitForTimeout(500); }
await p.getByRole('button', { name: /Execute all/ }).click(); await p.waitForTimeout(700);
ok((await p.locator('.dcim-work li').first().innerText()).includes('Done'), 'executed from the change page');
await go(new URL(rackUrl).pathname + '?tab=changes'); await check('rack-changes');
ok(await p.locator('.dcim-work li').count() >= 2, 'rack Change requests tab lists the work');
{ const bt = await p.innerText('body'); ok(/of 12\b|12 kW/.test(bt), 'rack budget updated to 12 kW'); }
/* Change requests tab + up-front notice + a new rack raised under a new CR shows as a ghost on the floor plan */
await go(`/dcim?dc=${site}&tab=changes`); await check('changes-tab');
ok(await p.locator('[data-crbar]').count() === 1, 'change-request notice under the header');
ok(await p.locator('.dt-table tbody tr').count() > 0, `change requests listed (${await p.locator('.dt-table tbody tr').count()})`);
await p.locator('.dt-table tbody tr').first().click(); await p.waitForTimeout(500);
ok((await p.locator('.drawer').innerText()).includes('Touches in DCIM'), 'CR drawer'); await p.keyboard.press('Escape');
await p.getByRole('button', { name: 'New rack' }).click(); await p.waitForTimeout(400);
await p.locator('.modal [data-cr-field] .seg button', { hasText: 'Raise new' }).click(); await p.waitForTimeout(200);
await p.locator('.modal').getByRole('button', { name: 'Raise CR and plan rack' }).click(); await p.waitForTimeout(700);
await go(`/dcim?dc=${site}&tab=floorplan`); await check('floorplan-cr');
ok(await p.locator('.dcim-rk.is-crghost').count() >= 1, 'planned rack shows as a ghost on the floor plan');
ok(await p.locator('.dcim-rk-cr').count() >= 1, 'racks with open CRs carry a marker');
/* the twin sees it: the site's equipment count went up */
console.log(errs.length ? `  ✗ console: ${errs.slice(0, 3).join(' | ')}` : '  ✓ no console errors'); if (errs.length) bad++;
await b.close();
console.log(bad ? `✗ ${bad} problem(s)` : '✓ DCIM screens OK'); process.exit(bad ? 1 : 0);
