/* The review package (one ZIP a reviewer can file or forward):
     <PLN>-<rev> Review pack.pdf      the review document (pdf.ts)
     <PLN>-<rev> Data.xlsx            the data workbook (xlsx.ts)
     csv/<sheet>.csv                  every workbook sheet as CSV (UTF-8 with BOM, so Excel shows ₹ and °C)
     drawings/<number> <title>.svg    every drawing sheet, framed with its title block (svg.ts)
     README.txt                       contents, how to review, versions
     manifest.json                    document number, revision, generated, every file with its size and SHA-256
   Plus the download actions the plan pack and the portal use (PDF, workbook, ZIP). Everything heavy loads on demand. */
import { strToU8, zipSync, type Zippable } from 'fflate';
import type { ReviewDoc, ReviewSheet } from './model';
import { framedSheetSvg } from './svg';

export type PackFileKind = 'pdf' | 'xlsx' | 'zip';
const MIME: Record<PackFileKind, string> = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: 'application/zip' };
/** File names as the brief and the portal name them: "<PLN>-<rev> Review pack.pdf", "<PLN>-<rev> Data.xlsx", "<PLN>-<rev> Review pack.zip". */
export const packFileName = (doc: ReviewDoc, f: PackFileKind) => `${doc.meta.plnId}-${doc.meta.revision} ${f === 'xlsx' ? 'Data' : 'Review pack'}.${f}`;
/** A file name safe on Windows, macOS and Linux. */
export const safeName = (s: string) => s.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

/* ------------------------------------------------------------------ CSV */
const csvCell = (v: string | number | null) => { if (v === null || v === undefined) return ''; const s = String(v); return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const sheetCsv = (sh: ReviewSheet) => '﻿' + [sh.columns.map(c => c.label), ...sh.rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/* ------------------------------------------------------------------ hashing */
async function sha256(u8: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return '';
  const h = new Uint8Array(await subtle.digest('SHA-256', u8 as unknown as ArrayBuffer));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/* ------------------------------------------------------------------ README */
function readme(doc: ReviewDoc, files: { path: string; bytes: number }[], pdfName: string, xlsxName: string): string {
  const m = doc.meta;
  const top = doc.sections.filter(s => !s.number.includes('.'));
  const L = [
    `${m.title}`,
    `${m.plnId}, revision ${m.revision} · ${m.scopeLabel} · ${m.site}`,
    `Document ${m.docNumber} · status ${m.status} · generated ${m.generatedAt.slice(0, 16).replace('T', ' ')} UTC by ${m.generatedBy}`,
    '',
    'VERDICT',
    `  ${m.verdict.text}`,
    '',
    'WHAT YOU ARE ASKED TO DECIDE',
    `  ${doc.ask.decision}`,
    ...(doc.ask.changesSinceLast?.length ? ['', 'CHANGES SINCE THE PREVIOUS REVISION OR ROUND', ...doc.ask.changesSinceLast.map(x => `  - ${x}`)] : []),
    '',
    'HOW TO REVIEW',
    `  1. Read "${pdfName}": the cover gives the verdict and the headline figures, section 1 the approval path and`,
    '     what is asked of you, section 2 the executive summary. The contents page links every section.',
    '  2. Check the design basis, the capacity and the cost sections against your area; every input and its source',
    '     is listed under "Assumptions and sources".',
    `  3. Use "${xlsxName}" (or the csv folder) for the full bill of materials, IP plan, schedule, cash flow and rule checks.`,
    '  4. The drawings folder holds every drawing sheet as a vector file with its title block (open in a browser).',
    '  5. Record your decision and comments on the plan\'s review page in the portal (the link is in the review email),',
    '     or return the signed approval sheet (section 1) to the plan owner.',
    '',
    'CONTENTS OF THE DOCUMENT',
    ...top.map(s => `  ${s.number === 'A' ? 'Appendix A' : s.number.padStart(2)}  ${s.title}`),
    '',
    'FILES',
    ...files.map(f => `  ${f.path.padEnd(64)} ${kb(f.bytes).padStart(8)}`),
    '  manifest.json (sizes and SHA-256 checksums of every file above)',
    '',
    'VERSIONS',
    `  Plan ${m.plnId} revision ${m.revision}; template ${m.templateName ?? '—'} ${m.templateVersion ?? ''}`.trimEnd(),
    `  Money in ${m.currency} (${m.geography}); figures are indicative until the plan is approved.`,
    '  Produced by the DCO planner from the plan, its evaluation, the estate records and, once approved, Delivery.',
    '',
  ];
  return L.join('\r\n');
}

/* ------------------------------------------------------------------ the package */
export interface PackageFile { path: string; bytes: number; sha256: string }
/** The ZIP bytes and its file list. */
export async function buildReviewZip(doc: ReviewDoc): Promise<{ zip: Uint8Array; files: PackageFile[] }> {
  const [{ buildReviewPdf }, { buildReviewXlsx }] = await Promise.all([import('./pdf'), import('./xlsx')]);
  const [pdf, xlsx] = await Promise.all([buildReviewPdf(doc), buildReviewXlsx(doc)]);
  const m = doc.meta;
  const pdfName = packFileName(doc, 'pdf'), xlsxName = packFileName(doc, 'xlsx');
  const entries: [string, Uint8Array][] = [[pdfName, pdf], [xlsxName, xlsx]];
  const usedCsv = new Set<string>();
  doc.sheets.forEach((sh, i) => {
    let n = `csv/${String(i + 1).padStart(2, '0')} ${safeName(sh.name)}.csv`; let k = 2;
    while (usedCsv.has(n)) n = `csv/${String(i + 1).padStart(2, '0')} ${safeName(sh.name)} (${k++}).csv`;
    usedCsv.add(n); entries.push([n, strToU8(sheetCsv(sh))]);
  });
  const day = m.generatedAt.slice(0, 10);
  doc.drawings.forEach((d, k) => {
    const framed = framedSheetSvg({ svg: d.svg(), width: d.width, height: d.height }, { number: d.number, title: d.title, discipline: d.discipline, revision: d.revision, date: day, project: m.plnId, projectTitle: m.title, docNumber: m.docNumber, sheet: `${k + 1} of ${doc.drawings.length}`, status: m.status, drawnBy: 'DCO planner' });
    entries.push([`drawings/${safeName(`${d.number} ${d.title}`)}.svg`, strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n${framed.svg}\n`)]);
  });
  const files: PackageFile[] = [];
  for (const [path, data] of entries) files.push({ path, bytes: data.length, sha256: await sha256(data) });
  const readmeU8 = strToU8(readme(doc, files, pdfName, xlsxName));
  files.push({ path: 'README.txt', bytes: readmeU8.length, sha256: await sha256(readmeU8) });
  const manifest = {
    docNumber: m.docNumber, plan: m.plnId, revision: m.revision, title: m.title, status: m.status, planType: m.scopeLabel, site: m.site,
    generatedAt: m.generatedAt, generatedBy: m.generatedBy, currency: m.currency, template: m.templateName ? `${m.templateName} ${m.templateVersion ?? ''}`.trim() : undefined,
    verdict: m.verdict, sections: doc.sections.filter(s => !s.number.includes('.')).map(s => ({ number: s.number, title: s.title })),
    drawings: doc.drawings.map(d => ({ number: d.number, title: d.title, discipline: d.discipline, revision: d.revision })),
    files: files.map(f => ({ path: f.path, bytes: f.bytes, sha256: f.sha256 })),
  };
  const tree: Zippable = {};
  const mtime = Number.isNaN(new Date(m.generatedAt).getTime()) ? new Date() : new Date(m.generatedAt);
  for (const [path, data] of entries) tree[path] = [data, { level: /\.(pdf|xlsx)$/.test(path) ? 0 : 6, mtime }];
  tree['README.txt'] = [readmeU8, { level: 6, mtime }];
  tree['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6, mtime }];
  return { zip: zipSync(tree), files };
}

/* ------------------------------------------------------------------ download actions */
/** Build one file of the pack as a Blob (the portal attaches these to the review email, with their real sizes). */
export async function buildPackFile(doc: ReviewDoc, f: PackFileKind): Promise<Blob> {
  const bytes = f === 'pdf' ? await (await import('./pdf')).buildReviewPdf(doc) : f === 'xlsx' ? await (await import('./xlsx')).buildReviewXlsx(doc) : (await buildReviewZip(doc)).zip;
  return new Blob([bytes as unknown as BlobPart], { type: MIME[f] });
}
export function saveBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
/** Build and download one file of the pack. Returns its size in bytes. */
export async function downloadPackFile(doc: ReviewDoc, f: PackFileKind): Promise<number> {
  const blob = await buildPackFile(doc, f);
  saveBlob(packFileName(doc, f), blob);
  return blob.size;
}
export const downloadReviewZip = (doc: ReviewDoc) => downloadPackFile(doc, 'zip');
export const downloadReviewPdf = (doc: ReviewDoc) => downloadPackFile(doc, 'pdf');
export const downloadReviewXlsx = (doc: ReviewDoc) => downloadPackFile(doc, 'xlsx');
