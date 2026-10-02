import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
for (const persona of ['colocation']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(p => { localStorage.setItem('dco.persona', p); localStorage.setItem('dco.site.header', 'compact'); }, persona);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5181/datacenters/MH-DC-001?tab=overview', { waitUntil: 'load' });
  await p.waitForSelector('.twin-canvas canvas', { timeout: 20000 }); await p.waitForTimeout(8000);
  const px = await p.evaluate(() => { const c = document.querySelector('.twin-canvas canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return 'nogl'; const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); let dark = 0; for (let i = 0; i < buf.length; i += 16) if (buf[i] < 200) dark++; return { w, h, darkSample: dark }; });
  console.log(persona, 'canvas', JSON.stringify(px), 'nogl-fallback', await p.locator('.twin-nogl').count());
  await p.screenshot({ path: `.qa/out/ptwin_${persona}_0.png`, clip: { x: 240, y: 190, width: 1200, height: 620 } });
  // drill: floor -> first IT room -> a rack with most devices
  await p.click('[data-twin-floor="0"]'); await p.waitForTimeout(1500);
  const rooms = await p.$$eval('[data-twin-room]', es => es.map(e => e.dataset.twinRoom)); await p.click(`[data-twin-room="${rooms[persona === 'colocation' ? 1 : 0]}"]`); await p.waitForTimeout(1500);
  const racks = await p.$$eval('[data-twin-rack]', es => es.map(e => [e.dataset.twinRack, e.textContent]));
  console.log(persona, 'racks in room', racks.length, racks.slice(0, 3).map(r => r[1].slice(0, 70)));
  await p.click(`[data-twin-rack="${racks[Math.min(2, racks.length - 1)][0]}"]`); await p.waitForTimeout(2500);
  const chips = await p.$$eval('[data-twin-filter]', es => es.map(e => e.textContent.trim()));
  const list = await p.$$eval('[data-twin=equipment] li', es => es.length);
  console.log(persona, 'filters', chips.join(' | '), 'items', list, 'errors', errs.length);
  await p.screenshot({ path: `.qa/out/ptwin_${persona}_rack.png`, clip: { x: 240, y: 190, width: 1200, height: 700 } });
  if (chips.length > 1) { await p.click('[data-twin-filter]:not([data-twin-filter=all]):not([data-twin-filter=alerts])'); await p.waitForTimeout(300); console.log(persona, 'after filter 1 ->', await p.$$eval('[data-twin=equipment] li', es => es.length)); }
  await ctx.close();
}
await b.close();
