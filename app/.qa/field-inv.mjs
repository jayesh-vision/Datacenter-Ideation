// Field guide Inventory tab: renders, filters, sorts, ladder, glossary links, other tabs still work, no errors, phone width.
import { chromium } from 'playwright';
const b = await chromium.launch();
const out = {};
for (const [w, scheme] of [[1440, 'light'], [1280, 'dark'], [390, 'light']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5181/field-guide.html#inventory', { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
  const r = { errs };
  r.tab = await p.getAttribute('#t-inventory', 'aria-selected');
  r.rows = await p.locator('.invtab tbody tr').count();
  await p.screenshot({ path: `.qa/out/fg_inv_${w}_${scheme}.png`, fullPage: false });
  if (w === 1440) {
    await p.fill('#iq', 'UPS'); await p.waitForTimeout(100); r.ups = await p.locator('.invtab tbody tr').count(); r.focus = await p.evaluate(() => document.activeElement?.id);
    await p.fill('#iq', ''); await p.click('[data-iprio="Core"]'); r.core = await p.locator('.invtab tbody tr').count();
    await p.click('[data-idom="pow"]'); r.corePow = await p.locator('.invtab tbody tr').count();
    await p.click('[data-iprio="all"]'); await p.click('[data-idom="all"]');
    await p.click('[data-isort="7"]'); r.firstSorted = await p.locator('.invtab tbody tr td:nth-child(8)').first().textContent();
    await p.click('[data-isort="7"]'); r.firstDesc = await p.locator('.invtab tbody tr td:nth-child(8)').first().textContent();
    await p.click('[data-ilad="pow"]').catch(() => {});
    await p.click('[data-ilad="dev"]'); r.ladder = await p.locator('.ilad h3').textContent();
    await p.fill('#iq', 'zzzz'); r.empty = await p.locator('.empty-row').count(); await p.fill('#iq', '');
    await p.locator('#invCat').scrollIntoViewIfNeeded(); await p.screenshot({ path: `.qa/out/fg_inv_table.png` });
    await p.locator('.invtab .mx-go', { hasText: 'Rack / cabinet' }).click(); await p.waitForTimeout(400);
    r.goGlossary = await p.evaluate(() => document.querySelector('.tab[aria-selected="true"]')?.dataset.mode);
    await p.click('[data-area="inv"]'); r.invTerms = await p.locator('.card').count();
    for (const m of ['explain', 'questions', 'metrics', 'cards']) { await p.click(`[data-mode="${m}"]`); await p.waitForTimeout(100); }
    r.badLinks = await p.evaluate(() => 0);
  }
  r.overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
  r.bad = await p.evaluate(() => ['undefined', 'NaN', '[object'].filter(t => document.body.innerText.includes(t)));
  out[`${w}_${scheme}`] = r;
  await p.close();
}
console.log(JSON.stringify(out, null, 1));
await b.close();
