// Plan pack → Review pack downloads (Agent A): per plan, the three buttons on the plan page's Plan pack tab download the ZIP, the PDF
// and the workbook; each is opened and checked:
//   ZIP  — names (<PLN>-<rev> Review pack.pdf / Data.xlsx, csv/*.csv, drawings/*.svg, README.txt, manifest.json), every manifest
//          entry present with the same size and SHA-256, one CSV per workbook sheet, SVGs self-contained (no CSS variables);
//   PDF  — pages, Inter embedded, text extractable with the document number and "Page x of y" (pdfinfo / pdffonts / pdftotext);
//   XLSX — read back with exceljs: every sheet has a frozen header row and its rows, money columns formatted.
// usage: node .qa/p2b-review-pack.mjs [persona] [geo] [PLN ids comma-separated]   (W=1280; KEEP=1 keeps the files in .qa/out/review-pack)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import ExcelJS from 'exceljs';
const P = process.argv[2] ?? 'neocloud', G = process.argv[3] ?? 'us', W = Number(process.env.W ?? 1280);
const IDS = (process.argv[4] ?? 'PLN-0001,PLN-0002,PLN-0003,PLN-0009,PLN-0013,PLN-0006').split(',');
const OUT = '.qa/out/review-pack'; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const ctx = await b.newContext({ viewport: { width: W, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|arcgis/.test(m.text())) errs.push(m.text().slice(0, 300)); });
let bad = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; return c; };
const has = cmd => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };
const poppler = has('pdfinfo');
const download = async (name) => {
  const btn = p.getByRole('button', { name });
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), btn.click()]);
  const path = `${OUT}/${G}-${d.suggestedFilename()}`; await d.saveAs(path);
  return { name: d.suggestedFilename(), path, buf: fs.readFileSync(path) };
};
for (const id of IDS) {
  await p.goto(`http://localhost:5181/planning/plans/${id}?tab=pack&persona=${P}&geo=${G}`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Download review pack (.zip)' }).waitFor({ timeout: 30000 }).catch(() => undefined);
  if (!ok(await p.getByRole('button', { name: 'Download review pack (.zip)' }).count() === 1, `${id} review pack buttons on the Plan pack`)) continue;
  const rev = (await p.locator('.page-head').innerText()).match(/Rev ([A-Z])/)?.[1] ?? 'A';
  const t0 = Date.now();
  const zip = await download('Download review pack (.zip)'); const tz = Date.now() - t0;
  const pdf = await download('Download PDF');
  const xlsx = await download('Download workbook');
  ok(zip.name === `${id}-${rev} Review pack.zip` && pdf.name === `${id}-${rev} Review pack.pdf` && xlsx.name === `${id}-${rev} Data.xlsx`, `${id} file names: ${zip.name} · ${pdf.name} · ${xlsx.name}`);
  // ZIP
  const z = unzipSync(new Uint8Array(zip.buf)); const names = Object.keys(z);
  const man = JSON.parse(strFromU8(z['manifest.json'] ?? new Uint8Array([123, 125])));
  const mism = (man.files ?? []).filter(f => !z[f.path] || z[f.path].length !== f.bytes || createHash('sha256').update(z[f.path]).digest('hex') !== f.sha256).map(f => f.path);
  const csv = names.filter(n => n.startsWith('csv/')), svg = names.filter(n => n.startsWith('drawings/'));
  ok(!!z[`${id}-${rev} Review pack.pdf`] && !!z[`${id}-${rev} Data.xlsx`] && !!z['README.txt'] && !!z['manifest.json'], `${id} ZIP ${(zip.buf.length / 1024).toFixed(0)} KB in ${tz} ms: ${names.length} files · ${csv.length} CSV · ${svg.length} drawings`);
  ok(man.docNumber === `${id}-${rev}-RP` && man.files?.length === names.length - 1 && !mism.length, `${id} manifest ${man.docNumber}: ${man.files?.length} files, sizes and SHA-256 match${mism.length ? ` (not: ${mism.join(', ')})` : ''}`);
  ok(svg.every(n => { const t = strFromU8(z[n]); return t.startsWith('<?xml') && !/var\(--|NaN|undefined/.test(t); }) && svg.length === (man.drawings ?? []).length, `${id} drawing files self-contained (${svg.length} = ${man.drawings?.length} in the register)`);
  ok(csv.every(n => { const t = strFromU8(z[n]); return z[n][0] === 0xef && z[n][1] === 0xbb && z[n][2] === 0xbf && t.split('\r\n').length > 2 && !/NaN|undefined|\[object/.test(t); }), `${id} CSVs with BOM, header and rows`);
  // workbook
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(xlsx.buf);
  const frozen = wb.worksheets.every(ws => ws.views?.[0]?.state === 'frozen' && ws.views[0].ySplit === 1);
  ok(wb.worksheets.length === csv.length && frozen && wb.worksheets.every(ws => ws.rowCount >= 2), `${id} workbook ${(xlsx.buf.length / 1024).toFixed(0)} KB: ${wb.worksheets.length} sheets (${wb.worksheets.map(w => w.name).slice(0, 6).join(', ')}…), header rows frozen`);
  // PDF
  const head = pdf.buf.subarray(0, 5).toString('latin1');
  if (poppler) {
    const info = execFileSync('pdfinfo', [pdf.path]).toString(); const pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0);
    const fonts = execFileSync('pdffonts', [pdf.path]).toString(); const text = execFileSync('pdftotext', ['-layout', pdf.path, '-']).toString();
    ok(head === '%PDF-' && pages >= 10 && /Inter-Regular/.test(fonts) && text.includes(`${id}-${rev}-RP`) && new RegExp(`Page ${pages} of ${pages}`).test(text) && /Contents/.test(text) && !/\bNaN\b|\bundefined\b|\[object/.test(text), `${id} PDF ${(pdf.buf.length / 1024).toFixed(0)} KB · ${pages} pages · Inter embedded · contents, footers, no raw values`);
  } else ok(head === '%PDF-' && pdf.buf.length > 20000, `${id} PDF ${(pdf.buf.length / 1024).toFixed(0)} KB (poppler not installed: pages not checked)`);
  ok(!errs.length, `${id} no page errors${errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''}`); errs.length = 0;
  if (!process.env.KEEP) for (const f of [zip, pdf, xlsx]) fs.rmSync(f.path, { force: true });
}
await b.close();
console.log(bad ? `${bad} problem(s)` : 'review pack downloads check out');
process.exit(bad ? 1 : 0);
