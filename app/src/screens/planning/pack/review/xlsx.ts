/* The review pack's data workbook (exceljs, loaded on demand): one worksheet per ReviewSheet, in the document's order, with a bold
   shaded header row frozen at the top, an auto filter, column widths from the builder's hints or the content, and number formats
   (money in whole units of the geography's currency, quantities with grouping). Money columns carry the currency in their header. */
import type { ReviewDoc, ReviewSheet } from './model';

/** Excel's sheet-name rules: at most 31 characters, none of []:*?/\ , unique in the workbook. */
export function sheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  let n = base, k = 2;
  while (used.has(n.toLowerCase())) { const suf = ` (${k++})`; n = base.slice(0, 31 - suf.length) + suf; }
  used.add(n.toLowerCase()); base = n;
  return base;
}

function width(sh: ReviewSheet, i: number): number {
  const c = sh.columns[i];
  if (c.width) return Math.max(6, Math.min(70, c.width));
  const lens = sh.rows.slice(0, 500).map(r => { const v = r[i]; return v === null || v === undefined ? 0 : typeof v === 'number' ? Math.min(16, v.toLocaleString('en-US').length) : String(v).length; });
  const max = Math.max(c.label.length, ...lens, 4);
  return Math.max(8, Math.min(60, max + 2));
}

/** The workbook bytes (.xlsx). */
export async function buildReviewXlsx(doc: ReviewDoc): Promise<Uint8Array> {
  const mod = await import('exceljs') as unknown as { default?: typeof import('exceljs') } & typeof import('exceljs');
  const ExcelJS = (mod.default ?? mod) as typeof import('exceljs');
  const wb = new ExcelJS.Workbook();
  const m = doc.meta;
  wb.creator = m.generatedBy; wb.lastModifiedBy = m.generatedBy; wb.title = `${m.plnId} ${m.title} · data`; wb.subject = `Plan review pack data, ${m.docNumber}, revision ${m.revision}`;
  wb.company = 'DCO planner'; wb.keywords = `${m.plnId} ${m.docNumber}`;
  const gen = new Date(m.generatedAt); if (!Number.isNaN(gen.getTime())) { wb.created = gen; wb.modified = gen; }
  const used = new Set<string>();
  for (const sh of doc.sheets) {
    const ws = wb.addWorksheet(sheetName(sh.name, used), { views: [{ state: 'frozen', ySplit: 1, xSplit: 0 }], properties: { defaultRowHeight: 16 } });
    ws.columns = sh.columns.map((c, i) => ({ header: c.label, key: `c${i}`, width: width(sh, i) }));
    for (const r of sh.rows) ws.addRow(r.map(v => (v === null || v === undefined ? null : v)));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FF0F172A' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    head.alignment = { vertical: 'middle', wrapText: true };
    head.height = 30;
    head.border = { bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } };
    sh.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.money) col.numFmt = '#,##0';
      else if (c.num) {
        const ints = sh.rows.every(r => typeof r[i] !== 'number' || Number.isInteger(r[i]));
        col.numFmt = ints ? '#,##0' : '#,##0.0#';
      }
      if (c.num || c.money) { col.alignment = { horizontal: 'right' }; ws.getCell(1, i + 1).alignment = { horizontal: 'right', vertical: 'middle', wrapText: true }; }
    });
    if (sh.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sh.columns.length } };
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
