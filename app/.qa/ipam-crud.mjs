// IP & Network CRUD: create / edit / delete VRF, VLAN, IP address, ASN, IP range, aggregate; refused deletes.  usage: node .qa/ipam-crud.mjs [persona] [geo]
import { chromium } from 'playwright';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'us';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const base = 'http://localhost:5181';
const go = async (u) => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(700); };
const fill = async (label, v) => { const f = p.locator('.modal .field', { hasText: label }).first(); const sel = f.locator('select'); if (await sel.count()) await sel.selectOption(v); else await f.locator('input, textarea').first().fill(String(v)); };
const toast = async () => (await p.locator('.toast').allInnerTexts()).join(' | ');
const submit = async () => { await p.locator('.modal .nst-btn--filled').click(); await p.waitForTimeout(600); return { err: (await p.locator('.modal .dcim-err').allInnerTexts()).join(' '), open: await p.locator('.modal').count() }; };
await p.goto(`${base}/ipam?persona=${P}&geo=${G}&dc=${G === 'us' ? 'VA-DC-001' : 'MH-DC-001'}&tab=vrfs`, { waitUntil: 'networkidle' }); await p.locator('.dt-table tbody tr').first().waitFor();
/* VRF */
await p.getByRole('button', { name: 'New VRF' }).click(); await fill('Name', 'VRF-QA'); await fill('Route distinguisher', '64500:777');
let r = await submit(); ok(!r.open && /VRF created/.test(await toast()), `create VRF ${r.err}`);
await p.locator('.lt input').first().fill('VRF-QA'); await p.waitForTimeout(400); ok((await p.innerText('.dt-table')).includes('VRF-QA'), 'VRF listed'); await p.locator('.lt input').first().fill('');
await p.getByRole('button', { name: 'New VRF' }).click(); await fill('Name', 'VRF-QA2'); await fill('Route distinguisher', '64500:777');
r = await submit(); ok(r.open && /already the RD/.test(r.err), `duplicate RD refused: ${r.err}`); await p.keyboard.press('Escape');
const used = p.locator('.dt-table tbody tr', { hasText: 'MGMT-' }).first(); await used.locator('button[title="Delete"]').click(); await p.locator('.modal .nst-btn--filled').click(); await p.waitForTimeout(500);
ok(/cannot be deleted/.test(await p.locator('.modal .dcim-err').innerText().catch(() => '')), 'VRF in use cannot be deleted'); await p.keyboard.press('Escape');
/* VLAN: create, edit, delete */
await go(`/ipam?dc=VA-DC-001&tab=vlans`);
await p.getByRole('button', { name: 'New VLAN' }).click(); await fill('VLAN id', '3901'); await fill('Name', 'QA_VLAN');
r = await submit(); ok(!r.open, `create VLAN ${r.err}`);
await p.locator('.lt input').first().fill('QA_VLAN'); await p.waitForTimeout(400);
await p.locator('.dt-table tbody tr').first().locator('button[title="Edit"]').click(); await fill('Name', 'QA_VLAN_EDIT'); r = await submit(); ok(!r.open && (await p.innerText('.dt-table')).includes('QA_VLAN_EDIT'), `edit VLAN ${r.err}`);
await p.locator('.lt input').first().fill('QA_VLAN_EDIT'); await p.waitForTimeout(400);
await p.locator('.dt-table tbody tr').first().locator('button[title="Delete"]').click(); await p.locator('.modal .nst-btn--filled').click(); await p.waitForTimeout(500);
ok(!(await p.innerText('.dt-table')).includes('QA_VLAN_EDIT'), 'delete VLAN');
/* IP address */
await go(`/ipam?dc=VA-DC-001&tab=addresses`);
await p.getByRole('button', { name: 'New IP address' }).click(); await p.waitForTimeout(300);
const pfx = await p.locator('.modal .field', { hasText: 'Prefix' }).locator('option').nth(1).getAttribute('value');
const pfxTxt = await p.locator('.modal .field', { hasText: 'Prefix' }).locator('option').nth(1).innerText(); await fill('Prefix', pfx);
const net = pfxTxt.split(' ')[0]; const [ip, mask] = net.split('/'); const o = ip.split('.').map(Number);
await fill('Address', `${o[0]}.${o[1]}.${o[2]}.${o[3] + 2 ** (32 - Number(mask)) - 2}`); await fill('DNS name', 'qa.host.internal');
r = await submit(); ok(!r.open, `create IP address in ${net} ${r.err}`);
await p.getByRole('button', { name: 'New IP address' }).click(); await fill('Prefix', pfx); await fill('Address', ip);
r = await submit(); ok(r.open && /network address|already/.test(r.err), `network address refused: ${r.err}`); await p.keyboard.press('Escape');
/* ASN */
await go(`/ipam?dc=VA-DC-001&tab=asns`); await p.getByRole('button', { name: 'New ASN' }).click(); await fill('ASN', '65333'); r = await submit(); ok(!r.open, `create ASN ${r.err}`);
/* IP range + gateway group */
await go(`/ipam?dc=VA-DC-001&tab=services&sv=ranges`); await p.getByRole('button', { name: 'New IP range' }).click(); await fill('Prefix', pfx);
await fill('Start address', `${o[0]}.${o[1]}.${o[2]}.${o[3] + 2}`); await fill('End address', `${o[0]}.${o[1]}.${o[2]}.${o[3] + 5}`); r = await submit(); ok(!r.open, `create IP range ${r.err}`);
/* aggregate */
await go(`/ipam?dc=VA-DC-001`); await p.locator('.panel', { hasText: 'Aggregates' }).getByRole('button', { name: 'New' }).click(); await fill('Aggregate (CIDR)', '198.18.0.0/15'); await fill('Registry (RIR)', 'RFC 1918');
r = await submit(); ok(!r.open && (await p.innerText('body')).includes('198.18.0.0/15'), `create aggregate ${r.err}`);
await p.screenshot({ path: '.qa/out/ipam-crud.png' });
ok(!errs.length, errs.length ? `errors ${errs.slice(0, 2)}` : 'no page errors');
await b.close(); console.log(bad ? `✗ ${bad} problem(s)` : '✓ IPAM CRUD OK'); process.exit(bad ? 1 : 0);
