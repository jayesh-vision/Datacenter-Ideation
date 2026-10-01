import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
const ok = (n, c) => console.log(c ? 'PASS' : 'FAIL', n);
const W = t => p.waitForTimeout(t ?? 250);
await p.goto('http://localhost:5181/incidents/INC-0001', { waitUntil: 'networkidle' }); await W(500);
ok('resolve disabled initially', await p.locator('button:has-text("Resolve")').isDisabled());
// walk every action to done
for (let guard = 0; guard < 40; guard++) {
  const btn = p.locator('.steps button', { hasText: /^(Request approval|Approve|Run|Mark done)$/ }).first();
  if (!(await btn.count())) break;
  await btn.click(); await W(200);
}
ok('all actions done', await p.locator('.steps .step.st-done').count() === 5);
await p.locator('button:has-text("Run closure checks")').click(); await W(300);
ok('closure checks passed', await p.locator('.checks li.ok').count() === 3);
ok('resolve enabled', !(await p.locator('button:has-text("Resolve")').isDisabled()));
await p.locator('button:has-text("Resolve")').click(); await W(500);
ok('status resolved', (await p.locator('.inc-head').innerText()).includes('Resolved'));
await p.screenshot({ path: '.qa/out/inc1-resolved.png', fullPage: true });
// worklog + feedback
await p.goto('http://localhost:5181/incidents/INC-0002', { waitUntil: 'networkidle' }); await W(400);
await p.locator('.wl-add input').fill('DG start attempted manually'); await p.locator('.wl-add button').click(); await W(300);
ok('worklog added', (await p.locator('.wl').innerText()).includes('DG start attempted'));
await p.locator('.hyp').nth(1).locator('button:has-text("Reject")').click(); await W(300);
ok('hypothesis rejected', await p.locator('.hyp.is-rejected').count() === 1);
await p.locator('button:has-text("Raise emergency change")').click(); await W(300);
ok('emergency change toast', (await p.locator('.toast').innerText()).includes('Emergency change'));
// correlate two alerts
await p.goto('http://localhost:5181/alerts?q=Link%20Down', { waitUntil: 'networkidle' }); await W(400);
const rows = p.locator('tbody tr'); await rows.nth(0).locator('.check').click(); await rows.nth(1).locator('.check').click(); await W(150);
await p.locator('button:has-text("Correlate into incident")').click(); await W(700);
ok('new incident opened: ' + p.url().split('/').pop(), /\/incidents\/INC-\d+$/.test(p.url()));
ok('new incident has 2 alerts', (await p.locator('text=Correlated alerts').locator('..').locator('..').innerText()).includes('2'));
// change approve
await p.goto('http://localhost:5181/changes?id=CHG-2002', { waitUntil: 'networkidle' }); await W(400);
await p.locator('.drawer-foot button:has-text("Approve")').click(); await W(300);
ok('change approved', (await p.locator('.drawer-head').innerText()).includes('Approved'));
// new change
await p.goto('http://localhost:5181/changes?new=change', { waitUntil: 'networkidle' }); await W(400);
await p.locator('.drawer input').nth(0).fill('Replace SFP on PE-T4-01 xe-0/0/3');
await p.locator('.scope-row').first().click(); await W(400);
await p.locator('.drawer textarea').fill('Re-insert original optic');
await W(300);
const svc = await p.locator('.impact-stats').first().innerText();
ok('impact updates with scope: ' + svc.replace(/\n/g, ' ').slice(0, 60), !/Services\s*0/.test(svc));
await p.locator('button:has-text("Submit for approval")').click(); await W(500);
ok('new change opened', /id=CHG-\d+/.test(p.url()));
// topology click
await p.goto('http://localhost:5181/topology', { waitUntil: 'networkidle' }); await W(500);
await p.locator('.topo-node').first().click(); await W(500);
ok('node drawer', await p.locator('.drawer a:has-text("Open network element")').count() === 1);
await p.screenshot({ path: '.qa/out/topo-drawer.png' });
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no console errors'); await b.close();
