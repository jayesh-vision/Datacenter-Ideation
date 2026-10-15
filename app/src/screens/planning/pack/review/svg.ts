/* Drawing sheets as self-contained SVG for the review pack (portal page, PDF, ZIP). Each sheet is the SAME React drawing the plan pack
   shows (`SheetContent`), rendered to static markup at a fixed width (`DrawWidth`), then made standalone:
   - every `var(--vw-color-*)` becomes its hex value (the live token in the browser, else the generated map in tokens.ts);
   - the HTML around the drawing (legend, caption, drawing notes, phase chips) is redrawn as SVG under the drawing, so the file
     carries everything the portal sheet shows;
   - ids (hatch patterns) are prefixed per sheet, so many sheets can sit in one page or one PDF;
   - text is set in Inter (embedded by the PDF; any sans-serif elsewhere).
   `framedSheetSvg` adds the drawing frame and title block for the ZIP's `drawings/*.svg` and the PDF's landscape drawing pages. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type * as T from '../../../../planner/p2b/types';
import type { Evaluation } from '../../../../planner/lib/engine';
import type { SheetKind } from '../../../../planner/lib/packModel';
import { DrawWidth } from '../../charts/chartKit';
import { SheetContent } from '../sheetContent';
import { VW_COLORS } from './tokens';

/** Width every sheet is drawn at (px = SVG user units). Close to the portal's sheet width at 1440, landscape friendly. */
export const SHEET_W = 1040;
export const FONT = 'Inter, Poppins, Helvetica, Arial, sans-serif';
const INK = '#0f172a', SLATE = '#64748b', SLATE_DARK = '#334155', LINE = '#cbd5e1';

/* ------------------------------------------------------------------ tokens */
let live: CSSStyleDeclaration | null | undefined;
function token(name: string): string {
  if (live === undefined) live = typeof document !== 'undefined' && typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
  const v = live?.getPropertyValue(`--${name}`).trim();
  return v || VW_COLORS[name] || '#64748b';
}
/** Replace every CSS variable with its value (unknown ones with a neutral slate). */
export const resolveVars = (s: string) => s.replace(/var\(--([a-z0-9-]+)(?:,\s*([^)]+))?\)/gi, (_, n: string, fb?: string) => (VW_COLORS[n] || live?.getPropertyValue(`--${n}`).trim() ? token(n) : fb?.trim() || token(n)));

/* ------------------------------------------------------------------ markup helpers */
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };
export const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m));
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
/** Top-level <svg>…</svg> blocks of a markup string, in order (nested svgs stay inside their parent). */
function svgBlocks(html: string): string[] {
  const out: string[] = []; const re = /<svg\b|<\/svg>/g; let depth = 0, start = -1, m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0] === '<svg') { if (depth++ === 0) start = m.index; }
    else if (--depth === 0 && start >= 0) { out.push(html.slice(start, m.index + 6)); start = -1; }
  }
  return out;
}
/** Inner HTML of every element with the class (non-nested elements of the same tag). */
function byClass(html: string, cls: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  return [...html.matchAll(re)].map(m => m[1]);
}

/* ------------------------------------------------------------------ text layout */
/** Average glyph width of Inter at a font size (the drawings use the same rule). */
export const textWidth = (s: string, fs: number) => s.length * fs * 0.55;
export function wrapText(s: string, width: number, fs: number): string[] {
  const max = Math.max(8, Math.floor(width / (fs * 0.55)));
  const words = s.split(/\s+/); const lines: string[] = []; let cur = '';
  for (const w of words) { if (!cur) cur = w; else if ((cur + ' ' + w).length <= max) cur += ' ' + w; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  return lines;
}

/* ------------------------------------------------------------------ one sheet */
interface LegendItem { kind: string; color: string; label: string }
export interface SheetSvg { svg: string; width: number; height: number; notes: string[]; empty?: string }

/** Parse a rendered sheet: the drawing svgs, legend, captions, notes, chips, empty state. */
function parse(html: string) {
  const legend: LegendItem[] = [];
  for (const block of byClass(html, 'pc-legend', 'div')) {
    for (const m of block.matchAll(/<span[^>]*>\s*<i class="is-([a-z]+)"(?: style="([^"]*)")?[^>]*><\/i>([\s\S]*?)<\/span>/g)) {
      const style = decode(m[2] ?? '');
      const color = /(?:border-top-color|background|color)\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim() ?? SLATE;
      legend.push({ kind: m[1], color: resolveVars(color), label: strip(m[3]) });
    }
  }
  const captions = byClass(html, 'pc-caption', 'p').map(strip).filter(Boolean);
  const notes = byClass(html, 'fd-notes', 'ol').flatMap(ol => [...ol.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(m => strip(m[1]))).filter(Boolean);
  const chips = byClass(html, 'pc-chips', 'div').flatMap(d => [...d.matchAll(/title="([^"]*)"/g)].map(m => decode(m[1])));
  const emptyBlock = byClass(html, 'pc-empty', 'div')[0];
  const empty = emptyBlock !== undefined ? strip(emptyBlock.replace(/<\/b>/, '. </b>')) : undefined;
  return { svgs: svgBlocks(html), legend, captions, notes, chips, empty };
}

/** Make one drawing svg standalone: resolved colours, prefixed ids, explicit size, no CSS width. */
function clean(svg: string, prefix: string): { inner: string; vb: [number, number, number, number]; w?: number; h?: number; attrs: string } {
  const open = /^<svg\b([^>]*)>/.exec(svg)!;
  const attrs = open[1];
  const vbm = /viewBox="([^"]+)"/.exec(attrs);
  const vb = (vbm ? vbm[1].split(/[\s,]+/).map(Number) : [0, 0, SHEET_W, 300]) as [number, number, number, number];
  const w = Number(/\swidth="([\d.]+)"/.exec(attrs)?.[1]) || undefined;
  const h = Number(/\sheight="([\d.]+)"/.exec(attrs)?.[1]) || undefined;
  let inner = svg.slice(open[0].length, -6);
  // ids → per-sheet ids (React's useId gives «r0»-style ids, which also collide between sheets)
  const ids = new Map<string, string>();
  for (const m of inner.matchAll(/\sid="([^"]+)"/g)) ids.set(m[1], `${prefix}-${m[1].replace(/[^A-Za-z0-9_-]/g, '')}`);
  for (const [from, to] of ids) {
    const e = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    inner = inner.replace(new RegExp(`id="${e}"`, 'g'), `id="${to}"`).replace(new RegExp(`url\\(#${e}\\)`, 'g'), `url(#${to})`).replace(new RegExp(`href="#${e}"`, 'g'), `href="#${to}"`);
  }
  inner = resolveVars(decodeAttrEntities(inner));
  return { inner, vb, w, h, attrs };
}
/** React writes `«` style ids and quotes in attributes as entities; keep the markup XML-safe but readable. */
const decodeAttrEntities = (s: string) => s.replace(/&#x27;/g, "'");

function legendSvg(items: LegendItem[], x0: number, y0: number, width: number): { svg: string; height: number } {
  if (!items.length) return { svg: '', height: 0 };
  const fs = 11, rowH = 18; let x = x0, y = y0 + 12; const parts: string[] = [];
  for (const it of items) {
    const w = 18 + textWidth(it.label, fs) + 16;
    if (x > x0 && x + w > x0 + width) { x = x0; y += rowH; }
    const c = esc(it.color);
    const sw = it.kind === 'line' ? `<line x1="${x}" y1="${y - 4}" x2="${x + 14}" y2="${y - 4}" stroke="${c}" stroke-width="2.4"/>`
      : it.kind === 'dash' ? `<line x1="${x}" y1="${y - 4}" x2="${x + 14}" y2="${y - 4}" stroke="${c}" stroke-width="2" stroke-dasharray="4 2.5"/>`
      : it.kind === 'hatch' ? `<rect x="${x}" y="${y - 9}" width="14" height="10" fill="#ffffff" stroke="${c}"/><path d="M${x + 2},${y + 1} l6,-10 M${x + 7},${y + 1} l6,-10" stroke="${c}" stroke-width="1"/>`
      : it.kind === 'diamond' ? `<path d="M${x + 7},${y - 10} l6,6 l-6,6 l-6,-6 z" fill="${c}"/>`
      : `<rect x="${x}" y="${y - 9}" width="14" height="10" rx="2" fill="${c}"/>`;
    parts.push(`${sw}<text x="${x + 19}" y="${y}" font-size="${fs}" fill="${SLATE_DARK}">${esc(it.label)}</text>`);
    x += w;
  }
  return { svg: `<g>${parts.join('')}</g>`, height: y - y0 + 8 };
}
function linesSvg(lines: { text: string; numbered?: number; muted?: boolean }[], x0: number, y0: number, width: number): { svg: string; height: number } {
  if (!lines.length) return { svg: '', height: 0 };
  const fs = 10.5, lh = 14.5; let y = y0 + 11; const parts: string[] = [];
  for (const l of lines) {
    const indent = l.numbered ? 18 : 0;
    const rows = wrapText(l.text, width - indent, fs);
    rows.forEach((r, i) => {
      if (i === 0 && l.numbered) parts.push(`<text x="${x0}" y="${y}" font-size="${fs}" fill="${SLATE}">${l.numbered}.</text>`);
      parts.push(`<text x="${x0 + indent}" y="${y}" font-size="${fs}" fill="${l.muted ? SLATE : SLATE_DARK}">${esc(r)}</text>`);
      y += lh;
    });
    y += 2;
  }
  return { svg: `<g>${parts.join('')}</g>`, height: y - y0 - 4 };
}

const memo = new WeakMap<Evaluation, Map<string, SheetSvg>>();
/**
 * Render one sheet kind of a plan to a self-contained SVG string (drawing, legend, caption, notes), `SHEET_W` wide.
 * Pure markup: works in the browser and in node (react-dom/server). Memoised per evaluation and kind.
 */
export function renderSheetSvg(kind: SheetKind, plan: T.PlannerPlan, ev: Evaluation, idPrefix: string = kind): SheetSvg {
  let m = memo.get(ev); if (!m) { m = new Map(); memo.set(ev, m); }
  const key = `${plan.id}|${plan.updatedAt}|${kind}|${idPrefix}`;
  const hit = m.get(key); if (hit) return hit;
  let html = '';
  try { html = renderToStaticMarkup(createElement(DrawWidth.Provider, { value: SHEET_W }, createElement(SheetContent, { kind, plan, ev, full: true }))); }
  catch (e) { html = `<div class="pc-empty"><b>Drawing could not be rendered</b><span>${esc((e as Error).message)}</span></div>`; }
  const p = parse(html);
  const W = SHEET_W, pad = 4; let y = pad; const body: string[] = [];
  const prefix = `d-${idPrefix.replace(/[^A-Za-z0-9_-]/g, '')}`;
  p.svgs.forEach((raw, i) => {
    const c = clean(raw, `${prefix}-${i}`);
    const [, , vw, vh] = c.vb;
    // explicit-size drawings keep their size (centred), fluid ones fill the width
    const scale = c.w && c.w <= W ? c.w / vw : W / vw;
    const dw = vw * scale, dh = (c.h && c.w && c.w <= W ? c.h : vh * scale);
    body.push(`<svg x="${((W - dw) / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(1)}" viewBox="${c.vb.join(' ')}" overflow="hidden">${c.inner}</svg>`);
    y += dh + (i < p.svgs.length - 1 ? 0 : 10);
  });
  if (!p.svgs.length && p.empty) {
    body.push(`<rect x="0" y="${y}" width="${W}" height="80" rx="6" fill="#f8fafc" stroke="${LINE}" stroke-dasharray="4 3"/><text x="${W / 2}" y="${y + 45}" text-anchor="middle" font-size="13" fill="${SLATE}">${esc(p.empty)}</text>`);
    y += 92;
  }
  const lg = legendSvg(p.legend, pad, y, W - 2 * pad); if (lg.height) { body.push(lg.svg); y += lg.height + 6; }
  const notes = [...p.chips.map(t => ({ text: t, muted: true })), ...p.captions.map(t => ({ text: t, muted: true })), ...p.notes.map((t, i) => ({ text: t, numbered: i + 1 }))];
  if (p.notes.length) { body.push(`<text x="${pad}" y="${y + 10}" font-size="10" font-weight="600" letter-spacing="0.4" fill="${SLATE}">NOTES</text>`); y += 14; }
  const ln = linesSvg(notes, pad, y, W - 2 * pad); if (ln.height) { body.push(ln.svg); y += ln.height + 6; }
  const H = Math.ceil(y + pad);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" fill="${INK}">${body.join('')}</svg>`;
  const res: SheetSvg = { svg, width: W, height: H, notes: [...p.captions, ...p.notes], empty: p.svgs.length ? undefined : p.empty };
  m.set(key, res);
  return res;
}

/* ------------------------------------------------------------------ framed sheet (ZIP files, PDF drawing pages) */
export interface TitleBlock { number: string; title: string; discipline: string; revision: string; date: string; project: string; projectTitle: string; docNumber: string; sheet: string; status: string; drawnBy: string }
/** Landscape frame (A-series 1.414:1 by default; the PDF passes its page area's ratio) with the drawing scaled into it and a title block
 *  along the bottom. */
export function framedSheetSvg(drawingSvg: { svg: string; width: number; height: number }, tb: TitleBlock, aspect = Math.SQRT2): { svg: string; width: number; height: number } {
  const W = 1190, H = Math.round(W / aspect), m = 18, tbH = 74;
  const areaW = W - 2 * m - 16, areaH = H - 2 * m - tbH - 16;
  const s = Math.min(areaW / drawingSvg.width, areaH / drawingSvg.height, 1.25);
  const dw = drawingSvg.width * s, dh = drawingSvg.height * s;
  const dx = m + 8 + (areaW - dw) / 2, dy = m + 8 + (areaH - dh) / 2;
  const inner = drawingSvg.svg.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>$/, '');
  const ty = H - m - tbH;
  // title block cells: [label, value, width share]
  const cells: [string, string, number][] = [
    ['Project', `${tb.project} · ${tb.projectTitle}`, 0.3], ['Drawing title', tb.title, 0.26], ['Drawing no.', tb.number, 0.13], ['Discipline', tb.discipline, 0.09],
    ['Rev', tb.revision, 0.045], ['Date', tb.date, 0.085], ['Sheet', tb.sheet, 0.09],
  ];
  const tw = W - 2 * m; let x = m; const tbParts: string[] = [];
  cells.forEach(([k, v, share], i) => {
    const w = tw * share;
    if (i) tbParts.push(`<line x1="${x}" y1="${ty}" x2="${x}" y2="${ty + tbH / 2}" stroke="${SLATE_DARK}" stroke-width="0.8"/>`);
    const max = Math.max(4, Math.floor((w - 12) / (11 * 0.56)));
    const val = v.length > max ? `${v.slice(0, max - 1)}…` : v;
    tbParts.push(`<text x="${x + 6}" y="${ty + 12}" font-size="7.5" letter-spacing="0.5" fill="${SLATE}">${esc(k.toUpperCase())}</text><text x="${x + 6}" y="${ty + 29}" font-size="11" font-weight="600" fill="${INK}">${esc(val)}</text>`);
    x += w;
  });
  const lower = `<line x1="${m}" y1="${ty + tbH / 2}" x2="${W - m}" y2="${ty + tbH / 2}" stroke="${SLATE_DARK}" stroke-width="0.8"/>`
    + `<text x="${m + 6}" y="${ty + tbH / 2 + 13}" font-size="7.5" letter-spacing="0.5" fill="${SLATE}">STATUS · SCALE · DOCUMENT</text>`
    + `<text x="${m + 6}" y="${ty + tbH / 2 + 28}" font-size="10" fill="${SLATE_DARK}">${esc(`${tb.status} · Schematic, not to scale (NTS) · ${tb.docNumber} · prepared by ${tb.drawnBy}`)}</text>`
    + `<text x="${W - m - 6}" y="${ty + tbH / 2 + 28}" text-anchor="end" font-size="9" fill="${SLATE}">Figures are indicative until the plan is approved.</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" fill="${INK}">`
    + `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`
    + `<rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="none" stroke="${SLATE_DARK}" stroke-width="1.2"/>`
    + `<svg x="${dx.toFixed(1)}" y="${dy.toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(1)}" viewBox="0 0 ${drawingSvg.width} ${drawingSvg.height}">${inner}</svg>`
    + `<rect x="${m}" y="${ty}" width="${W - 2 * m}" height="${tbH}" fill="#ffffff" stroke="${SLATE_DARK}" stroke-width="1.2"/>${tbParts.join('')}${lower}</svg>`;
  return { svg, width: W, height: H };
}
