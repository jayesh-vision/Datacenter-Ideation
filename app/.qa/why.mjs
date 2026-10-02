import { chromium } from 'playwright';
const b = await chromium.launch();
for (const persona of ['cloud', 'enterprise', 'colocation', 'network']) for (const w of [1440, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript(p => { localStorage.setItem('dco.persona', p); localStorage.setItem('dco.site.header', 'compact'); }, persona);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5181/datacenters/MH-DC-001?tab=customers', { waitUntil: 'load' }); await p.waitForTimeout(1600);
  const r = await p.evaluate(() => ({
    over: document.documentElement.scrollWidth > innerWidth,
    clipped: [...document.querySelectorAll('.dt-table td')].filter(e => e.scrollWidth > e.clientWidth + 2).length,
    causes: [...document.querySelectorAll('.cust-cause')].map(e => e.innerText.replace(/\n/g, ' | ')),
    why: [...document.querySelectorAll('.dt-table tbody tr')].slice(0, 6).map(tr => tr.children[0].innerText.split('\n')[0] + ' => ' + tr.children[2].innerText.replace(/\n/g, ' / ') + ' [' + tr.children[4].innerText + ']')
  }));
  if (w === 1440) { console.log('\n#', persona, JSON.stringify({ over: r.over, clipped: r.clipped, errs: errs.length })); r.causes.forEach(c => console.log('  cause:', c)); r.why.forEach(c => console.log('  row:', c)); }
  else console.log('#', persona, '1280', JSON.stringify({ over: r.over, clipped: r.clipped }));
  await p.screenshot({ path: `.qa/out/why_${persona}_${w}.png`, fullPage: true });
  if (w === 1440 && r.causes.length) { await p.click('.cust-cause'); await p.waitForTimeout(300); console.log('  filtered rows:', await p.$$eval('.dt-table tbody tr', t => t.length), 'url cause=', new URL(p.url()).searchParams.get('cause')); }
  await ctx.close();
}
await b.close();
