// Plan review pack + reviewer portal (/planning/plans/:id/review).
//  1. per plan: the review page renders (cover, numbered sections, contents rail, drawing sheets), no NaN / undefined / raw ISO dates,
//     no page or table overflow, no page errors; the PDF / workbook / ZIP download from the review page (name, size, signature, contents).
//  2. flow on one plan: Send for review from the plan page (reviewers, email preview with the link, record) → note + Approvals panel →
//     review page: comment on a section, reply, resolve → hub "needs attention" for the reviewer → decide the next step from the review page.
// usage: node .qa/p2b-review.mjs [persona] [geo] [PLN ids comma-separated]   (W=1280|1440, SHOTS=1 for screenshots, FLOW=0 to skip the flow)
import { chromium } from 'playwright';
import fs from 'node:fs';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'us', W = Number(process.env.W ?? 1440);
const IDS = (process.argv[4] ?? 'PLN-0001,PLN-0002,PLN-0003,PLN-0009,PLN-0013,PLN-0006').split(',');
const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const ctx = await b.newContext({ viewport: { width: W, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text().slice(0, 300)); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; return c; };
const go = async u => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(900); };
const shot = async name => { fs.mkdirSync('.qa/out', { recursive: true }); await p.screenshot({ path: `.qa/out/review-${name}.png`, fullPage: false }); };
await p.goto(`http://localhost:5181/planning?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);

/* ---------------------------------------------------------------- 1. every plan: the document and the files */
const sig = { pdf: '%PDF', xlsx: 'PK', zip: 'PK' };
for (const id of IDS) {
  // a fresh load per plan (the PDF builder is heavy; a long run in one page gets slow)
  await p.goto(`http://localhost:5181/planning/plans/${id}/review?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' }); await p.waitForSelector('.rv-doc', { timeout: 30000 }).catch(() => undefined); await p.waitForTimeout(600);
  if (!ok(await p.locator('.rv-doc').count() === 1, `${id} review page renders`)) continue;
  const info = await p.evaluate(() => {
    const doc = document.querySelector('.rv-doc'); const text = doc.innerText;
    return {
      sections: document.querySelectorAll('.rv-sec:not(.is-sub)').length, subs: document.querySelectorAll('.rv-sec.is-sub').length,
      rail: document.querySelectorAll('.rv-rail li').length, sheets: document.querySelectorAll('.rv-sheet').length, figures: document.querySelectorAll('.rv-figure').length,
      tables: document.querySelectorAll('.rv-table').length, empty: [...document.querySelectorAll('.rv-sec')].filter(s => s.querySelectorAll(':scope > :not(.rv-sec-head)').length === 0 && !(s.nextElementSibling?.classList.contains('is-sub'))).map(s => s.id),
      words: ['NaN', 'undefined', 'Infinity', '[object', 'Invalid Date', 'null'].filter(w => new RegExp(`\\b${w.replace('[', '\\[')}`).test(text)),
      iso: (text.match(/\d{4}-\d\d-\d\dT\d\d:\d\d/g) ?? []).slice(0, 2),
      svgEmpty: [...document.querySelectorAll('.rv-svg')].filter(e => !e.querySelector('svg')).length,
      over: document.documentElement.scrollWidth > window.innerWidth + 2,
      tblOver: [...document.querySelectorAll('.rv-tablewrap')].filter(e => e.scrollWidth > e.clientWidth + 2).map(e => e.closest('section')?.id),
      title: document.querySelector('.rv-title')?.textContent, doc: document.querySelector('.rv-docno')?.textContent,
    };
  });
  console.log(`${id} · ${info.doc} · ${info.sections} sections + ${info.subs} sub-sections · ${info.tables} tables · ${info.figures} figures · ${info.sheets} drawing sheets · rail ${info.rail}`);
  ok(info.sections >= 5 && info.rail >= 5, `${id} numbered sections and contents rail`);
  ok(!info.empty.length, `${id} no empty sections${info.empty.length ? ': ' + info.empty.join(', ') : ''}`);
  ok(!info.words.length && !info.iso.length, `${id} no raw values${info.words.length || info.iso.length ? ': ' + [...info.words, ...info.iso].join(', ') : ''}`);
  ok(!info.svgEmpty, `${id} every drawing drawn`);
  ok(!info.over && !info.tblOver.length, `${id} no page / table overflow at ${W}${info.tblOver.length ? ': ' + info.tblOver.join(', ') : ''}`);
  ok(!errs.length, `${id} no page errors${errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''}`); errs.length = 0;
  if (process.env.SHOTS) await shot(`${id}-${W}`);
  // the pack files from the review page
  for (const [f, label] of [['pdf', 'Review pack.pdf'], ['xlsx', 'Data.xlsx'], ['zip', 'Review pack.zip']]) {
    const row = p.locator('.rv-files li', { hasText: label }); const btn = row.getByRole('button', { name: /Download/ });
    if (!(await btn.count())) { ok(false, `${id} ${f} download button`); continue; }
    const dl = p.waitForEvent('download', { timeout: 90000 }).catch(() => null);
    await btn.click(); const d = await dl;
    if (!ok(!!d, `${id} ${f} downloads`)) continue;
    const buf = fs.readFileSync(await d.path());
    const head = buf.subarray(0, 4).toString('latin1');
    const extra = f === 'pdf' ? `${(buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length} pages` : f === 'zip' ? `${(buf.toString('latin1').match(/PK\x01\x02/g) ?? []).length} entries` : `${(buf.toString('latin1').match(/xl\/worksheets\/sheet\d+\.xml/g) ?? []).length / 2} sheets`;
    ok(d.suggestedFilename() === `${id}-${info.doc?.split(' ')[0].split('-')[2] ?? 'A'} ${label}` && head.startsWith(sig[f]) && buf.length > 2000, `${id} ${d.suggestedFilename()} ${(buf.length / 1024).toFixed(0)} KB · ${extra}`);
  }
}

/* ---------------------------------------------------------------- 2. the review flow on one plan */
if (process.env.FLOW !== '0') {
  // a plan in review if there is one, else a draft that can be submitted
  await p.goto(`http://localhost:5181/planning?persona=${P}&geo=${G}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  let FID = process.env.FLOW_ID;
  if (!FID) for (let i = 1; i <= 15 && !FID; i++) { const id = `PLN-${String(i).padStart(4, '0')}`; await go(`/planning/plans/${id}`); if ((await p.locator('.page-head').innerText()).includes('In review')) FID = id; }
  FID ??= 'PLN-0004';
  console.log(`flow on ${FID}`);
  await go(`/planning/plans/${FID}`);
  await p.locator('.page-head').getByRole('button', { name: 'Send for review' }).click(); await p.waitForTimeout(1500);
  const modal = p.locator('.modal');
  ok(await modal.count() === 1, 'Send for review opens');
  const picked = await modal.locator('.rv-pick [role=checkbox][aria-checked=true]').count();
  ok(picked >= 1, `${picked} reviewer(s) picked by default (one per approval step)`);
  await modal.locator('textarea').first().fill('Please review the design basis and the cost before Friday.');
  await modal.getByRole('radio', { name: 'Link only' }).click(); await p.waitForTimeout(300);
  await modal.getByRole('radio', { name: 'ZIP package' }).click(); await p.waitForTimeout(4000);
  const mail = await modal.locator('.rv-mail').innerText();
  ok(/Decision requested|Comments requested/.test(mail) && mail.includes(`/planning/plans/${FID}/review`) && mail.includes('Please review the design basis'), 'email preview: subject, message and the review link');
  ok(/Review pack\.zip/.test(mail) && /\d+ (KB|MB)/.test(await modal.locator('.rv-mail-att').innerText()), `email preview: ZIP attachment with its size (${(await modal.locator('.rv-mail-att').innerText()).replace(/\s+/g, ' ')})`);
  ok((await modal.innerText()).includes('no email leaves the app'), 'note: no email is sent');
  if (process.env.SHOTS) await shot('send');
  await modal.getByRole('button', { name: /Record and send|Submit and send/ }).click(); await p.waitForTimeout(1200);
  ok(await p.locator('.modal').count() === 0, 'request recorded');
  const note = await p.locator('.page .note', { hasText: 'Review REV-' }).count();
  ok(note === 1, 'plan page note: review sent, link to the review page');
  await go(`/planning/plans/${FID}?tab=approvals`);
  ok((await p.locator('.panel', { hasText: 'Review requests' }).innerText()).includes('REV-'), 'Approvals tab lists the review request');
  await go(`/planning/plans/${FID}?tab=history`);
  ok((await p.innerText('.page')).includes('review requested') || (await p.innerText('.page')).includes('Review REV-'), 'history records the request');

  // comment, reply, resolve
  await go(`/planning/plans/${FID}/review`); await p.waitForSelector('.rv-doc'); await p.waitForTimeout(600);
  ok((await p.locator('.rv-people li').count()) >= 1, 'review status lists the reviewers');
  const secBtn = p.locator('.rv-sec:not(.is-sub) .rv-cbtn').nth(1);
  await secBtn.click(); await p.waitForTimeout(400);
  const target = await p.locator('.rv-side-foot b').innerText();
  await p.locator('.rv-side-foot textarea').fill('Check the UPS autonomy against the generator start time.');
  await p.locator('.rv-side-foot').getByRole('button', { name: 'Comment' }).click(); await p.waitForTimeout(600);
  ok((await p.locator('.rv-thread').count()) >= 1 && (await p.locator('.rv-thread').first().innerText()).includes('UPS autonomy'), `comment on ${target} shows in its thread`);
  ok((await secBtn.innerText()).trim() === '1', 'section heading counts the open comment');
  await p.locator('.rv-thread').first().getByRole('button', { name: 'Reply' }).click();
  await p.locator('.rv-reply textarea').fill('Generator starts in 12 s; autonomy is fine.');
  await p.locator('.rv-reply').getByRole('button', { name: 'Reply' }).click(); await p.waitForTimeout(500);
  ok((await p.locator('.rv-thread').first().locator('.rv-c').count()) === 2, 'reply threads under the comment');
  await p.locator('.rv-thread').first().getByRole('button', { name: 'Resolve' }).click(); await p.waitForTimeout(500);
  ok((await p.locator('.rv-thread.is-resolved').count()) === 1, 'thread resolved');
  if (process.env.SHOTS) await shot('comments');

  // the reviewer's hub: sign in as the holder of the next step, who was asked to review
  const sw = p.locator('.panel', { hasText: 'Decision' }).getByRole('button', { name: /^Sign in as/ });
  if (await sw.count()) { const who = (await sw.first().innerText()).replace('Sign in as ', ''); await sw.first().click(); await p.waitForTimeout(500); console.log(`  · signed in as ${who}`); }
  await go('/planning'); await p.waitForTimeout(800);
  const attn = await p.locator('.pn-attn').innerText().catch(() => '');
  ok(/Your review|In review/.test(attn) && attn.includes(FID), 'hub "needs action" shows the review for the reviewer');

  // decide from the review page (same modal and rules as the Approvals tab)
  await go(`/planning/plans/${FID}/review`); await p.waitForSelector('.rv-doc'); await p.waitForTimeout(500);
  const dec = p.locator('.panel', { hasText: 'Decision' }).getByRole('button', { name: /^Decide:/ });
  if (await dec.count()) {
    const before = await p.locator('.rv-steps li.is-done').count();
    await dec.click(); await p.waitForTimeout(500);
    await p.locator('.modal').getByRole('button', { name: 'Record decision' }).click(); await p.waitForTimeout(1200);
    ok((await p.locator('.rv-steps li.is-done').count()) === before + 1, 'decision recorded from the review page; the path moves on');
    ok((await p.locator('.rv-people').innerText()).includes('Decided'), 'reviewer shown as decided');
  } else ok(false, 'decide button for the role holder');
  ok(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''}`);
}
await b.close();
console.log(bad ? `${bad} problem(s)` : 'all clear'); process.exit(bad ? 1 : 0);
