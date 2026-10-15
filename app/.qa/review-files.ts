/* Review pack files in node: build the PDF, the workbook and the ZIP for plans and check them (PDF pages and fonts via poppler when
   installed, the workbook read back with exceljs, the ZIP listed with its manifest checksums verified).
   usage: npx tsx --tsconfig tsconfig.app.json --import ./.qa/lib/css-hook.mjs .qa/review-files.ts [persona] [geo] [PLN-0001 …]
   OUT=dir (default .qa/out/review-files); PAGES=1 also renders every PDF page to PNG with pdftoppm. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import ExcelJS from 'exceljs';
import { allPlans, docFor, setup } from './lib/reviewNode';
import { setPdfFontLoader } from '../src/screens/planning/pack/review/pdf';
import { buildReviewZip, packFileName } from '../src/screens/planning/pack/review/zip';

const [persona = 'neocloud', geo = 'us', ...ids] = process.argv.slice(2);
setup(persona, geo);
const NM = resolve('node_modules/@expo-google-fonts/inter');
const nm = (p: string) => new Uint8Array(readFileSync(`${NM}/${p}`));
setPdfFontLoader(async () => ({ normal: nm('400Regular/Inter_400Regular.ttf'), bold: nm('600SemiBold/Inter_600SemiBold.ttf'), italics: nm('400Regular_Italic/Inter_400Regular_Italic.ttf'), bolditalics: nm('600SemiBold_Italic/Inter_600SemiBold_Italic.ttf') }));
const out = resolve(process.env.OUT ?? '.qa/out/review-files');
mkdirSync(out, { recursive: true });
// In the browser pdfmake's file system is its virtual one, so the drawings' SVG text finds the fonts by name; in node pdfkit opens them
// from the working directory, so the QA works from a folder holding the same four files.
const fontDir = `${out}/fonts`; mkdirSync(fontDir, { recursive: true });
for (const [f, p] of [['Inter-Regular.ttf', '400Regular/Inter_400Regular.ttf'], ['Inter-SemiBold.ttf', '600SemiBold/Inter_600SemiBold.ttf'], ['Inter-Italic.ttf', '400Regular_Italic/Inter_400Regular_Italic.ttf'], ['Inter-SemiBoldItalic.ttf', '600SemiBold_Italic/Inter_600SemiBold_Italic.ttf']]) writeFileSync(`${fontDir}/${f}`, nm(p));
process.chdir(fontDir);
const has = (cmd: string) => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };
const list = ids.length ? ids : allPlans().map(p => p.plnId).sort();
let bad = 0;
for (const id of list) {
  const problems: string[] = [];
  const doc = docFor(id);
  const t0 = Date.now();
  const { zip, files } = await buildReviewZip(doc);
  const ms = Date.now() - t0;
  const base = `${out}/${geo}-${id}`;
  writeFileSync(`${base}.zip`, zip);
  const entries = unzipSync(zip);
  const pdf = entries[packFileName(doc, 'pdf')], xlsx = entries[packFileName(doc, 'xlsx')];
  if (!pdf) problems.push('no PDF in the zip'); else writeFileSync(`${base}.pdf`, pdf);
  if (!xlsx) problems.push('no workbook in the zip'); else writeFileSync(`${base}.xlsx`, xlsx);
  // manifest: every listed file is in the zip with the same size and checksum
  const manifest = JSON.parse(strFromU8(entries['manifest.json'] ?? new Uint8Array())) as { files: { path: string; bytes: number; sha256: string }[] };
  for (const f of manifest.files ?? []) {
    const e = entries[f.path]; if (!e) { problems.push(`manifest lists missing ${f.path}`); continue; }
    if (e.length !== f.bytes) problems.push(`${f.path}: size ${e.length} ≠ manifest ${f.bytes}`);
    if (createHash('sha256').update(e).digest('hex') !== f.sha256) problems.push(`${f.path}: checksum mismatch`);
  }
  if (!entries['README.txt']) problems.push('no README.txt');
  const csvs = Object.keys(entries).filter(k => k.startsWith('csv/')), svgs = Object.keys(entries).filter(k => k.startsWith('drawings/'));
  if (csvs.length !== doc.sheets.length) problems.push(`${csvs.length} CSVs for ${doc.sheets.length} sheets`);
  if (svgs.length !== doc.drawings.length) problems.push(`${svgs.length} drawings for ${doc.drawings.length} sheets`);
  for (const k of svgs) { const t = strFromU8(entries[k]); if (/var\(--|NaN|undefined/.test(t)) problems.push(`${k}: unresolved token / NaN`); }
  // workbook read back
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(xlsx) as unknown as ArrayBuffer);
  if (wb.worksheets.length !== doc.sheets.length) problems.push(`workbook has ${wb.worksheets.length} sheets for ${doc.sheets.length}`);
  wb.worksheets.forEach((ws, i) => {
    const sh = doc.sheets[i]; if (!sh) return;
    if (ws.rowCount !== sh.rows.length + 1) problems.push(`sheet ${ws.name}: ${ws.rowCount - 1} rows for ${sh.rows.length}`);
    const v = ws.views?.[0] as { state?: string; ySplit?: number } | undefined; if (v?.state !== 'frozen' || v.ySplit !== 1) problems.push(`sheet ${ws.name}: header not frozen`);
    sh.columns.forEach((c, j) => { if (c.money && ws.getColumn(j + 1).numFmt !== '#,##0') problems.push(`sheet ${ws.name}: money column ${c.label} without format`); });
  });
  // PDF: pages, fonts embedded, text extractable
  let pages = 0;
  if (pdf && has('pdfinfo')) {
    const info = execFileSync('pdfinfo', [`${base}.pdf`]).toString(); pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0);
    const fonts = execFileSync('pdffonts', [`${base}.pdf`]).toString();
    if (!/Inter/.test(fonts) || /no\s+no\s+no/.test(fonts.split('\n').filter(l => /Inter/.test(l)).join('\n').replace(/yes/g, 'YES'))) problems.push('fonts not embedded');
    const text = execFileSync('pdftotext', ['-layout', `${base}.pdf`, '-']).toString();
    writeFileSync(`${base}.txt`, text);
    for (const re of [/\bNaN\b/, /\bundefined\b/, /\[object /]) if (re.test(text)) problems.push(`PDF text has ${re.source}`);
    if (!text.includes(doc.meta.docNumber)) problems.push('PDF text lacks the document number');
    if (!/Page 2 of \d+/.test(text)) problems.push('no "Page x of y" footer');
    // no heading or table caption as the last line of a page (contents lines end with a page number)
    text.split('\f').forEach((pg, i) => { const last = pg.split('\n').filter(l => /[A-Za-z0-9]/.test(l) && !/review pack · generated/.test(l)).pop() ?? ''; if (/^\s*(\d+\.\d+|Table \d+\.\d+)\s/.test(last) && !/\d\s*$/.test(last)) problems.push(`page ${i + 1} ends with a heading: ${last.trim().slice(0, 60)}`); });
    // no blank page
    text.split('\f').slice(0, -1).forEach((pg, i) => { if (pg.split('\n').filter(l => /[A-Za-z0-9]/.test(l)).length <= 2) problems.push(`page ${i + 1} is blank`); });
    if (process.env.PAGES) execFileSync('pdftoppm', ['-r', '60', '-png', `${base}.pdf`, `${base}-p`]);
  }
  if (problems.length) bad++;
  console.log(`${id} ${files.length + 2} files · zip ${(zip.length / 1024).toFixed(0)} KB · pdf ${pdf ? (pdf.length / 1024).toFixed(0) : 0} KB, ${pages} pages · xlsx ${xlsx ? (xlsx.length / 1024).toFixed(0) : 0} KB, ${doc.sheets.length} sheets · ${csvs.length} csv · ${svgs.length} svg · ${ms} ms${problems.length ? `\n   ${problems.join('\n   ')}` : ''}`);
}
console.log(bad ? `${bad} plan(s) with problems` : 'all review packs check out');
process.exit(bad ? 1 : 0);
