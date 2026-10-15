/* The review pack as one vector PDF (pdfmake, loaded on demand): cover with the verdict and headline figures, contents with page
   numbers, every section of the ReviewDoc (numbered headings, key-value blocks, tables that break across pages with their header row
   repeated, callouts, figures as embedded vector SVG), then Appendix A: the drawing register and each drawing sheet as a landscape
   page with its title block. A4; header with the document number and revision, footer with page x of y. Text is real text in Inter
   (embedded subset), so it can be selected and searched; drawings stay vector. */
import type { PdfMake } from 'pdfmake';
import type { Block, Cell, ReviewDoc, ReviewSection, Tone } from './model';
import { framedSheetSvg } from './svg';

/* ------------------------------------------------------------------ fonts and library */
export interface PdfFontFiles { normal: Uint8Array; bold: Uint8Array; italics: Uint8Array; bolditalics: Uint8Array }
let fontLoader: (() => Promise<PdfFontFiles>) | undefined;
/** Node (QA) passes its own loader (font files from node_modules); the browser fetches the bundled assets (pdfFonts.ts). */
export const setPdfFontLoader = (f: () => Promise<PdfFontFiles>) => { fontLoader = f; };
const FONT_FILES = { normal: 'Inter-Regular.ttf', bold: 'Inter-SemiBold.ttf', italics: 'Inter-Italic.ttf', bolditalics: 'Inter-SemiBoldItalic.ttf' } as const;
function toBase64(u8: Uint8Array): string {
  const B = (globalThis as { Buffer?: { from(u: Uint8Array): { toString(enc: string): string } } }).Buffer;
  if (B) return B.from(u8).toString('base64');
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
let ready: Promise<PdfMake> | undefined;
function pdfMake(): Promise<PdfMake> {
  ready ??= (async () => {
    const mod = await import('pdfmake') as unknown as { default?: PdfMake } & PdfMake;
    const pm = (mod.default ?? mod) as PdfMake;
    const files = await (fontLoader ?? (await import('./pdfFonts')).loadPdfFonts)();
    (Object.keys(FONT_FILES) as (keyof PdfFontFiles)[]).forEach(k => pm.virtualfs.writeFileSync(FONT_FILES[k], toBase64(files[k]), 'base64'));
    pm.setFonts({ Inter: { ...FONT_FILES } });
    // everything is inline: no URL or file is ever read while the PDF is built
    pm.setUrlAccessPolicy?.(() => false);
    pm.setLocalAccessPolicy?.(() => false);
    return pm;
  })();
  ready.catch(() => { ready = undefined; });
  return ready;
}

/* ------------------------------------------------------------------ look */
const INK = '#0f172a', BODY = '#1e293b', SLATE = '#64748b', SLATE7 = '#334155', LINE = '#e2e8f0', RULE = '#94a3b8', HEAD = '#f1f5f9', WASH = '#f8fafc', BRAND = '#1d4ed8';
const TONE: Record<Tone, string> = { ok: '#047857', warn: '#b45309', bad: '#b91c1c', info: '#1d4ed8', neutral: '#475569' };
const TINT: Record<Tone, string> = { ok: '#ecfdf5', warn: '#fffbeb', bad: '#fef2f2', info: '#eff6ff', neutral: '#f8fafc' };
const A4 = { w: 595.28, h: 841.89 };
const M = { l: 46, t: 62, r: 46, b: 54 };
const CW = A4.w - M.l - M.r; // portrait content width
type Node = Record<string, unknown> | string;
interface PbNode { headlineLevel?: number; startPosition?: { top: number; pageInnerHeight: number } }

/* ------------------------------------------------------------------ blocks */
interface Ctx { doc: ReviewDoc; top: string; tables: number; figures: number; tableN: () => string; figureN: () => string }
const cellText = (c: Cell) => (c.text === '' ? ' ' : c.text);
/** Column widths in points: every column at least as wide as its longest word (header and cells, so nothing breaks mid-word), numbers
 *  at their full width, the rest of the line shared by the builder's hints (percent) or by the typical cell length. */
function widths(cols: { label: string; num?: boolean; width?: number }[], rows: Cell[][], fs: number, avail = CW, total?: Cell[]): number[] {
  if (total) rows = [...rows, total];
  const pad = 8; const room = avail - pad * cols.length;
  const longestWord = (t: string) => Math.max(0, ...t.split(/[\s/]+/).map(w => Math.min(w.length, 28)));
  const min = cols.map((c, i) => {
    const cells = rows.map(r => r[i]?.text ?? '');
    const head = longestWord(c.label) * fs * 0.62;
    const body = (c.num ? Math.max(0, ...cells.map(t => t.length)) * 0.64 : Math.max(0, ...cells.map(longestWord)) * 0.6) * fs;
    return Math.max(head, body, fs * 2.4) + 2;
  });
  const want = cols.map((c, i) => {
    if (c.width) return Math.max(min[i], (c.width / 100) * room);
    if (c.num) return min[i];
    const lens = rows.map(r => (r[i]?.text ?? '').length).sort((a, b) => a - b);
    const p80 = lens[Math.floor(lens.length * 0.85)] ?? 0;
    return Math.max(min[i], Math.min(p80, 60) * fs * 0.55);
  });
  const sumMin = min.reduce((a, b) => a + b, 0), sumWant = want.reduce((a, b) => a + b, 0);
  if (sumMin >= room) return min.map(m => (m / sumMin) * room);
  if (sumWant <= room) {
    // grow the text columns into the spare room, in proportion to what they want
    const textWant = want.reduce((a, w, i) => a + (cols[i].num ? 0 : w), 0) || 1; const spare = room - sumWant;
    return want.map((w, i) => (cols[i].num && textWant > 1 ? w : w + (spare * (cols[i].num ? 0 : w)) / textWant));
  }
  const extra = room - sumMin; const over = want.map((w, i) => w - min[i]); const sumOver = over.reduce((a, b) => a + b, 0) || 1;
  return min.map((m, i) => m + (extra * over[i]) / sumOver);
}
const tableLayout = (totalRow: boolean) => ({
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 ? 0.8 : i === node.table.body.length ? 0.8 : totalRow && i === node.table.body.length - 1 ? 0.6 : 0.35),
  vLineWidth: () => 0,
  hLineColor: (i: number) => (i <= 1 ? RULE : LINE),
  fillColor: (row: number, node: { table: { body: unknown[] } }) => (row === 0 ? HEAD : totalRow && row === node.table.body.length - 1 ? WASH : null),
  paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 2.6, paddingBottom: () => 2.6,
});
function tableNode(b: Extract<Block, { kind: 'table' }>, ctx: Ctx): Node[] {
  const many = b.columns.length;
  const fs = many >= 9 ? 7 : many >= 7 ? 7.6 : 8.2;
  const head = b.columns.map(c => ({ text: c.label, bold: true, color: SLATE7, fontSize: fs - 0.2, alignment: c.num ? 'right' : 'left' }));
  const body = b.rows.map(r => r.map((cell, i) => ({ text: cellText(cell), alignment: b.columns[i]?.num || cell.num ? 'right' : 'left', color: cell.tone && cell.tone !== 'neutral' ? TONE[cell.tone] : BODY, bold: cell.tone === 'bad' })));
  const total = b.total ? [b.total.map((cell, i) => ({ text: cellText(cell), bold: true, alignment: b.columns[i]?.num || cell.num ? 'right' : 'left', color: cell.tone && cell.tone !== 'neutral' ? TONE[cell.tone] : INK }))] : [];
  const sign = b.title ? /^sign-off$/i.test(b.title) : false;
  const out: Node[] = [];
  if (b.title) out.push({ text: [{ text: `Table ${ctx.tableN()}  `, bold: true, color: SLATE7 }, { text: b.title, color: SLATE7 }], fontSize: 8.4, margin: [0, 8, 0, 4], headlineLevel: 3 });
  out.push({
    table: { headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: true, widths: widths(b.columns, b.rows, fs, CW, b.total), body: [head, ...body, ...total], ...(sign ? { heights: (r: number) => (r === 0 ? 14 : 30) } : {}) },
    layout: tableLayout(!!b.total), fontSize: fs, lineHeight: 1.18, margin: [0, b.title ? 0 : 6, 0, b.note ? 2 : 8],
  });
  if (b.note) out.push({ text: b.note, fontSize: 7.4, color: SLATE, italics: true, margin: [0, 2, 0, 8] });
  return out;
}
function kvNode(b: Extract<Block, { kind: 'kv' }>): Node {
  const cell = (r: (typeof b.rows)[number]) => [
    { text: r.label, color: SLATE, fontSize: 8.4 },
    { text: [{ text: r.value, color: r.tone && r.tone !== 'neutral' ? TONE[r.tone] : BODY, bold: r.tone === 'bad' }, ...(r.source ? [{ text: `  ${r.source}`, color: SLATE, fontSize: 7.2 }] : [])], fontSize: 8.6 },
  ];
  const two = b.columns === 2 && b.rows.length > 3;
  const body: unknown[][] = [];
  if (two) { const half = Math.ceil(b.rows.length / 2); for (let i = 0; i < half; i++) { const a = b.rows[i], c = b.rows[i + half]; body.push([...cell(a), ...(c ? cell(c) : [{ text: '' }, { text: '' }])]); } }
  else b.rows.forEach(r => body.push(cell(r)));
  return { table: { widths: two ? ['17%', '33%', '17%', '33%'] : ['32%', '68%'], body, dontBreakRows: true }, layout: { hLineWidth: (i: number, n: { table: { body: unknown[] } }) => (i === 0 || i === n.table.body.length ? 0 : 0.35), vLineWidth: () => 0, hLineColor: () => LINE, paddingLeft: (i: number) => (i % 2 === 0 ? 0 : 6), paddingRight: () => 6, paddingTop: () => 2.4, paddingBottom: () => 2.4 }, margin: [0, 4, 0, 8] };
}
function calloutNode(b: Extract<Block, { kind: 'callout' }>): Node {
  return { table: { widths: ['*'], body: [[{ stack: [{ text: b.title, bold: true, color: TONE[b.tone], fontSize: 9 }, ...(b.text ? [{ text: b.text, color: BODY, fontSize: 8.6, margin: [0, 2, 0, 0] }] : [])], fillColor: TINT[b.tone] }]], dontBreakRows: true },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 2.4 : 0), vLineColor: () => TONE[b.tone], paddingLeft: () => 9, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 }, margin: [0, 4, 0, 9] };
}
function figuresNode(items: Extract<Block, { kind: 'figures' }>['items'], per = 4): Node {
  const rows: unknown[][] = [];
  for (let i = 0; i < items.length; i += per) {
    const r: Node[] = items.slice(i, i + per).map(x => ({ stack: [{ text: x.label.toUpperCase(), fontSize: 6.8, color: SLATE, characterSpacing: 0.4 }, { text: x.value, fontSize: 13, bold: true, color: x.tone && x.tone !== 'neutral' ? TONE[x.tone] : INK, margin: [0, 2, 0, 1] }, ...(x.sub ? [{ text: x.sub, fontSize: 7.2, color: SLATE }] : [])] }));
    while (r.length < per) r.push({ stack: [{ text: '' }] });
    rows.push(r);
  }
  return { table: { widths: Array(per).fill('*'), body: rows, dontBreakRows: true }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => LINE, vLineColor: () => LINE, paddingLeft: () => 8, paddingRight: () => 6, paddingTop: () => 6, paddingBottom: () => 6 }, margin: [0, 4, 0, 10] };
}
function figureNode(b: Extract<Block, { kind: 'figure' }>, ctx: Ctx): Node[] {
  const d = ctx.doc.drawings.find(x => x.id === b.drawingId);
  if (!d) return [];
  return [{ stack: [
    { svg: d.svg(), fit: [CW, 380], alignment: 'center' },
    { text: [{ text: `Figure ${ctx.figureN()}  `, bold: true }, { text: b.caption ?? `${d.number} ${d.title}` }, { text: `  (sheet ${d.number} in Appendix A)`, color: SLATE }], fontSize: 7.8, color: SLATE7, alignment: 'center', margin: [0, 4, 0, 0] },
  ], unbreakable: true, margin: [0, 6, 0, 12] }];
}
function blockNodes(b: Block, ctx: Ctx): Node[] {
  switch (b.kind) {
    case 'para': return [{ text: b.text, margin: [0, 0, 0, 6] }];
    case 'kv': return b.rows.length ? [kvNode(b)] : [];
    case 'table': return b.rows.length ? tableNode(b, ctx) : [];
    case 'list': return b.items.length ? [{ [b.ordered ? 'ol' : 'ul']: b.items, margin: [0, 2, 0, 8], fontSize: 8.8 }] : [];
    case 'callout': return [calloutNode(b)];
    case 'figures': return b.items.length ? [figuresNode(b.items)] : [];
    case 'figure': return figureNode(b, ctx);
  }
}

/* ------------------------------------------------------------------ document */
function cover(doc: ReviewDoc): Node[] {
  const m = doc.meta;
  const gen = new Date(m.generatedAt);
  const genText = Number.isNaN(gen.getTime()) ? m.generatedAt : `${gen.toISOString().slice(0, 10)} ${gen.toISOString().slice(11, 16)} UTC`;
  const facts: [string, string | undefined][] = [
    ['Plan', `${m.plnId}, revision ${m.revision}`], ['Document', m.docNumber], ['Status', m.status], ['Plan type', m.scopeLabel], ['Site', m.site],
    ['Owner', m.owner], ['Requested by', m.requestedBy], ['Needed by', m.neededBy], ['Template', m.templateName ? `${m.templateName} ${m.templateVersion ?? ''}`.trim() : undefined],
    ['Generated', `${genText} by ${m.generatedBy}`], ['Money', `${m.currency} (${m.geography})`],
  ];
  const rows = facts.filter(([, v]) => v);
  return [
    { canvas: [{ type: 'rect', x: 0, y: 0, w: CW, h: 4, color: BRAND }], margin: [0, 0, 0, 22] },
    { text: 'PLAN REVIEW PACK', fontSize: 9, bold: true, color: BRAND, characterSpacing: 1.6 },
    { text: m.title, fontSize: 22, bold: true, color: INK, margin: [0, 8, 0, 6], lineHeight: 1.1 },
    { text: `${m.plnId}  ·  Revision ${m.revision}  ·  ${m.scopeLabel}  ·  ${m.site}`, fontSize: 10.5, color: SLATE7, margin: [0, 0, 0, 16] },
    { table: { widths: ['22%', '78%'], body: rows.map(([k, v]) => [{ text: k, color: SLATE, fontSize: 9 }, { text: v!, color: INK, fontSize: 9.6 }]) },
      layout: { hLineWidth: (i: number, n: { table: { body: unknown[] } }) => (i === 0 || i === n.table.body.length ? 0.8 : 0.35), vLineWidth: () => 0, hLineColor: (i: number, n: { table: { body: unknown[] } }) => (i === 0 || i === n.table.body.length ? RULE : LINE), paddingLeft: () => 0, paddingTop: () => 3.4, paddingBottom: () => 3.4 }, margin: [0, 0, 0, 14] },
    calloutNode({ kind: 'callout', tone: m.verdict.tone, title: m.verdict.tone === 'ok' ? 'Verdict: ready for decision' : m.verdict.tone === 'warn' ? 'Verdict: ready with conditions' : m.verdict.tone === 'bad' ? 'Verdict: not ready' : 'Verdict', text: m.verdict.text }),
    { text: 'Headline figures', fontSize: 9, bold: true, color: SLATE7, margin: [0, 10, 0, 2] },
    figuresNode(m.headline, 4),
    { text: 'Decision asked', fontSize: 9, bold: true, color: SLATE7, margin: [0, 6, 0, 3] },
    { text: doc.ask.decision, fontSize: 9.4, color: BODY },
    { text: 'Figures are indicative until the plan is approved; every input and its source is listed under "Assumptions and sources".', fontSize: 7.4, color: SLATE, italics: true, margin: [0, 12, 0, 0] },
  ];
}

function sectionNodes(s: ReviewSection, ctx: Ctx): Node[] {
  const level = s.number.split('.').length;
  if (level === 1) { ctx.top = s.number; ctx.tables = 0; ctx.figures = 0; }
  const out: Node[] = [];
  out.push(level === 1
    ? { text: [{ text: `${s.number === 'A' ? 'Appendix A' : s.number}`, color: BRAND }, { text: `   ${s.title}` }], fontSize: 16, bold: true, color: INK, margin: [0, 0, 0, 3], tocItem: true, tocStyle: { bold: true, fontSize: 9.6 }, tocMargin: [0, 7, 0, 1], tocNumberStyle: { bold: true, fontSize: 9.6 }, headlineLevel: 1, id: `sec-${s.id}` }
    : { text: [{ text: `${s.number}`, color: BRAND }, { text: `   ${s.title}` }], fontSize: 11.2, bold: true, color: INK, margin: [0, 12, 0, 4], tocItem: true, tocStyle: { fontSize: 8.8, color: SLATE7 }, tocMargin: [16, 1.6, 0, 0], tocNumberStyle: { fontSize: 8.8, color: SLATE7 }, headlineLevel: 2, id: `sec-${s.id}` });
  if (level === 1) out.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: CW, y2: 0, lineWidth: 0.8, lineColor: RULE }], margin: [0, 2, 0, 8] });
  if (s.summary) out.push({ text: s.summary, color: SLATE7, fontSize: level === 1 ? 9.6 : 9, italics: level === 1, margin: [0, 0, 0, 8] });
  for (const b of s.blocks) out.push(...blockNodes(b, ctx));
  return out;
}

/** The PDF bytes for a review document. */
export async function buildReviewPdf(doc: ReviewDoc): Promise<Uint8Array> {
  const pm = await pdfMake();
  const m = doc.meta;
  const ctx: Ctx = { doc, top: '', tables: 0, figures: 0, tableN: () => `${ctx.top}.${++ctx.tables}`, figureN: () => `${ctx.top}.${++ctx.figures}` };
  const body: Node[] = [];
  doc.sections.forEach(s => body.push(...sectionNodes(s, ctx)));
  // Appendix A: one landscape page per drawing sheet, framed with its title block
  const gen = new Date(m.generatedAt); const day = Number.isNaN(gen.getTime()) ? m.generatedAt : gen.toISOString().slice(0, 10);
  const LW = A4.h - M.l - M.r, LH = A4.w - M.t - M.b - 22;
  doc.drawings.forEach((d, k) => {
    const framed = framedSheetSvg({ svg: d.svg(), width: d.width, height: d.height }, { number: d.number, title: d.title, discipline: d.discipline, revision: d.revision, date: day, project: m.plnId, projectTitle: m.title, docNumber: m.docNumber, sheet: `${k + 1} of ${doc.drawings.length}`, status: m.status, drawnBy: 'DCO planner' }, LW / LH);
    body.push({ text: [{ text: `A.${k + 1}`, color: BRAND }, { text: `   ${d.number}  ${d.title}` }], fontSize: 9, bold: true, color: INK, pageBreak: 'before', pageOrientation: 'landscape', tocItem: true, tocStyle: { fontSize: 8.4, color: SLATE }, tocMargin: [16, 1.2, 0, 0], tocNumberStyle: { fontSize: 8.4, color: SLATE }, margin: [0, 0, 0, 4] });
    body.push({ svg: framed.svg, fit: [LW, LH], alignment: 'center' });
  });

  const def = {
    pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [M.l, M.t, M.r, M.b],
    info: { title: `${m.plnId} ${m.title} · review pack`, author: m.generatedBy, subject: `Plan review pack, ${m.docNumber}, revision ${m.revision}`, keywords: `${m.plnId} ${m.docNumber} review`, creator: 'DCO planner', producer: 'DCO planner (pdfmake)' },
    defaultStyle: { font: 'Inter', fontSize: 9.2, lineHeight: 1.28, color: BODY },
    header: (page: number, _count: number, size: { width: number }) => (page === 1 ? null : {
      margin: [M.l, 24, M.r, 0],
      stack: [
        { columns: [{ text: [{ text: m.docNumber, bold: true, color: SLATE7 }, { text: `   ${m.title}`, color: SLATE }], fontSize: 7.4 }, { text: `Revision ${m.revision}  ·  ${m.status}`, alignment: 'right', fontSize: 7.4, color: SLATE, width: 'auto' }] },
        { canvas: [{ type: 'line', x1: 0, y1: 4, x2: size.width - M.l - M.r, y2: 4, lineWidth: 0.5, lineColor: LINE }] },
      ],
    }),
    footer: (page: number, count: number) => ({
      margin: [M.l, 18, M.r, 0],
      columns: [
        { text: `${m.plnId} review pack · generated ${day} by ${m.generatedBy} · money in ${m.currency} · indicative until approved`, fontSize: 7, color: SLATE },
        { text: `Page ${page} of ${count}`, alignment: 'right', fontSize: 7.4, color: SLATE7, bold: true, width: 'auto' },
      ],
    }),
    content: [
      ...cover(doc),
      { toc: { title: { text: 'Contents', fontSize: 16, bold: true, color: INK, margin: [0, 0, 0, 10] }, numberStyle: { fontSize: 9 } }, pageBreak: 'before' },
      ...body,
    ],
    // keep a sub-section heading or a table caption with what follows it
    // a top-level section starts a page (unless it already does); a sub-section heading or a table caption never ends one
    pageBreakBefore: (node: PbNode, q: { getFollowingNodesOnPage: () => PbNode[]; getPreviousNodesOnPage: () => PbNode[] }) => {
      if (!node.headlineLevel) return false;
      const body = (n: PbNode) => !!n.startPosition && n.startPosition.top >= M.t - 0.5 && n.startPosition.top < M.t + n.startPosition.pageInnerHeight - 0.5;
      if (node.headlineLevel === 1) return q.getPreviousNodesOnPage().some(n => body(n) && n.startPosition!.top < node.startPosition!.top - 1);
      // pdfmake asks once per node, so judge by room left: a heading or caption in the last lines of a page moves to the next
      const sp = node.startPosition; if (!sp) return false;
      return sp.top > M.t + sp.pageInnerHeight - (node.headlineLevel === 2 ? 90 : 60);
    },
  };
  const out = pm.createPdf(def);
  return await out.getBuffer();
}
