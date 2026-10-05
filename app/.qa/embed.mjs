// Iframe embedding: ?shell=false hides the menu and header, survives navigation inside the frame; ?shell=true restores.
// usage: node .qa/embed.mjs <host.html path>
import { chromium } from 'playwright';
const b = await chromium.launch(); let fail = 0; const bad = m => { fail++; console.log('  FAIL', m); };
const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file://' + process.argv[2]); await p.waitForTimeout(2500);
const f = p.frames().find(x => x.url().includes('5181'));
const chrome = async () => f.evaluate(() => ({ rail: !!document.querySelector('.rail'), top: !!document.querySelector('.topbar'), left: Math.round(document.querySelector('.main').getBoundingClientRect().left), title: document.querySelector('.page-head h1, h1')?.textContent }));
let c = await chrome(); console.log('incidents', JSON.stringify(c));
if (c.rail || c.top || c.left !== 0) bad('menu or header visible with shell=false');
// navigate inside the frame by clicking a row → incident page; menu stays hidden
await f.click('.dt-table tbody tr'); await f.waitForTimeout(1200);
c = await chrome(); console.log('after click', f.url(), JSON.stringify(c)); if (c.rail || c.top) bad('menu came back after in-app navigation');
// sticky header pins to the top of the frame
await f.goto('http://localhost:5181/alerts'); await f.waitForTimeout(1500);
await f.evaluate(() => window.scrollTo(0, 900)); await f.waitForTimeout(300);
const th = await f.evaluate(() => Math.round(document.querySelector('.dt-toolbar').getBoundingClientRect().top)); console.log('alerts toolbar top after scroll', th); if (th > 2) bad(`toolbar not pinned at top (${th})`);
c = await chrome(); if (c.rail || c.top) bad('menu visible on /alerts without the param (should be remembered)');
// the full-screen map fills the frame
await f.goto('http://localhost:5181/'); await f.waitForTimeout(2500);
await f.click('.dcmap [aria-label*="xpand"], .dcmap button[title*="xpand"]').catch(() => bad('no map expand button'));
await f.waitForTimeout(600);
const m = await f.evaluate(() => { const r = document.querySelector('.dcmap.is-full')?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), innerWidth, innerHeight] : null; });
console.log('map full', m); if (!m || m[0] !== 0 || m[1] !== 0 || Math.abs(m[2] - m[4]) > 2) bad('expanded map does not fill the frame');
await f.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
// shell=true brings them back
await f.goto('http://localhost:5181/revenue?shell=true'); await f.waitForTimeout(1500);
c = await chrome(); console.log('shell=true', JSON.stringify(c)); if (!c.rail || !c.top) bad('shell=true did not restore the menu and header');
if (errs.length) bad('errors ' + errs.join(' | '));
await p.screenshot({ path: '.qa/out/embed-host.png' });
await b.close(); console.log(fail ? `embed: ${fail} FAILED` : 'embed: ok'); process.exit(fail ? 1 : 0);
