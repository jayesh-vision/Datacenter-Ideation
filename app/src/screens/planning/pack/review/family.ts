/* The plan family's own analysis in the review document: every section the family adds to the plan pack (site plan and handover,
   placement and schedules, plant as-is / to-be and cut-ins, paths and the interconnect plan, old to new, waves, runbook, ports, consents,
   inventory, exit plan, compliance, closure) — exactly what the portal shows. Each section's React view is rendered to static markup
   (every table row, no paging; drawings at the export width) and read back into review blocks: panels become sub-sections, tables
   become tables (long ones are cut in the document and given in full as a workbook sheet), notes become callouts, key-value lists,
   figures and lists keep their form. Drawings and charts are left out here; the drawing sheets carry them. */
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type * as T from '../../../../planner/p2b/types';
import type { Evaluation } from '../../../../planner/lib/engine';
import type { PlannerData } from '../../../../planner/lib/plannerData';
import { DataTableAllRows } from '../../../../ui/DataTable';
import { DrawWidth } from '../../charts/chartKit';
import { uiFor } from '../../scopes/registry';
import '../../scopes/all';
import { decode, SHEET_W } from './svg';
import type { Block, Cell, ReviewSheet, Tone } from './model';

export interface FamilyPart { id: string; title: string; summary?: string; blocks: Block[] }

/* ------------------------------------------------------------------ a small HTML reader (React's static markup is well formed) */
interface El { tag: string; cls: string; attrs: Record<string, string>; children: Node[] }
type Node = El | string;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
export function parseHtml(html: string): El {
  const root: El = { tag: '#root', cls: '', attrs: {}, children: [] };
  const stack: El[] = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|[^<]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) { const t = m[1].toLowerCase(); for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === t) { stack.length = i; break; } continue; }
    if (m[2]) {
      const attrs: Record<string, string> = {};
      for (const a of (m[3] ?? '').matchAll(/([^\s=>/]+)(?:="([^"]*)")?/g)) attrs[a[1]] = decode(a[2] ?? '');
      const el: El = { tag: m[2].toLowerCase(), cls: attrs.class ?? '', attrs, children: [] };
      top.children.push(el);
      if (!m[4] && !VOID.has(el.tag)) stack.push(el);
      continue;
    }
    top.children.push(decode(m[0]));
  }
  return root;
}
const has = (e: El, c: string) => (` ${e.cls} `).includes(` ${c} `);
const els = (e: El) => e.children.filter((x): x is El => typeof x !== 'string');
function find(e: El, pred: (x: El) => boolean): El | undefined { for (const c of els(e)) { if (pred(c)) return c; const f = find(c, pred); if (f) return f; } return undefined; }
function findAll(e: El, pred: (x: El) => boolean, out: El[] = []): El[] { for (const c of els(e)) { if (pred(c)) out.push(c); else findAll(c, pred, out); } return out; }
const SKIP = (e: El) => e.tag === 'svg' || e.tag === 'button' || e.tag === 'input' || e.tag === 'select' || e.tag === 'textarea' || has(e, 'info-tip') || has(e, 'dt-pager') || has(e, 'dt-toolbar') || has(e, 'pc-legend') || has(e, 'sr-only');
const INLINE_SEP = new Set(['div', 'p', 'li', 'small', 'b', 'span', 'i', 'strong', 'em', 'a', 'code']);
/** Visible text: icons, buttons and tooltips left out; two-line cells joined with " · ". */
export function text(n: Node): string {
  if (typeof n === 'string') return n;
  if (SKIP(n)) return '';
  if (n.tag === 'br') return ' ';
  if (has(n, 'cell-2')) return n.children.map(text).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ');
  return n.children.map(c => { const t = text(c); return typeof c !== 'string' && INLINE_SEP.has(c.tag) && t ? ` ${t} ` : t; }).join('').replace(/\s+/g, ' ').trim();
}
function toneOf(e: El | undefined): Tone | undefined {
  if (!e) return undefined;
  const cls = [e, ...findAll(e, () => true)].map(x => x.cls).join(' ');
  if (/vw-chip--error|pn-bad|pk-late|note--bad/.test(cls)) return 'bad';
  if (/vw-chip--warning|vw-chip--orange|pn-warn|note--warn/.test(cls)) return 'warn';
  if (/vw-chip--success|pn-ok|note--good/.test(cls)) return 'ok';
  return undefined;
}
const NUMERIC = /^[-+−]?[₹$]?\s?\d[\d.,]*\s?(%|kW|MW|MVA|kVA|kWh|MWh|wk|weeks?|h|min|U|Gbps|G|Cr|L|M|B|K|k|m²|°C)?$/;

/* ------------------------------------------------------------------ markup → blocks */
interface Out { parts: FamilyPart[]; sheets: ReviewSheet[] }
const MAX_ROWS = 40;
function tableBlock(t: El, title: string | undefined, sheetName: string, out: Out): Block | undefined {
  const head = find(t, x => x.tag === 'thead');
  const headCells = head ? findAll(head, x => x.tag === 'th') : [];
  const bodyRows = findAll(t, x => x.tag === 'tbody').flatMap(b => els(b).filter(r => r.tag === 'tr'));
  const footRows = findAll(t, x => x.tag === 'tfoot').flatMap(b => els(b).filter(r => r.tag === 'tr'));
  const width = Math.max(headCells.length, ...bodyRows.map(r => els(r).reduce((a, c) => a + Number(c.attrs.colspan ?? 1), 0)));
  if (!width || !bodyRows.length) return undefined;
  const rowCells = (r: El): Cell[] => {
    const cells: Cell[] = [];
    for (const c of els(r).filter(x => x.tag === 'td' || x.tag === 'th')) {
      const tx = text(c); const span = Number(c.attrs.colspan ?? 1);
      const numeric = ((has(c, 'num') || !!find(c, x => has(x, 'num'))) && /\d/.test(tx) && tx.length < 24) || NUMERIC.test(tx);
      cells.push({ text: tx || '—', tone: toneOf(c), num: numeric || undefined });
      for (let k = 1; k < span; k++) cells.push({ text: '' });
    }
    while (cells.length < width) cells.push({ text: '' });
    return cells.slice(0, width);
  };
  let rows = bodyRows.map(rowCells).filter(r => r.some(c => c.text && c.text !== '—'));
  if (!rows.length) return undefined;
  // a two-column table with no header row is a list of label and value
  if (!headCells.length && width === 2 && rows.length <= MAX_ROWS) return { kind: 'kv', rows: rows.map(r => ({ label: r[0].text, value: r[1].text, tone: r[1].tone })) };
  let columns = Array.from({ length: width }, (_, i) => ({ label: headCells[i] ? text(headCells[i]) : '', num: (rows.some(r => r[i].num) && rows.every(r => r[i].num || r[i].text === '—' || r[i].text === '')) || undefined }));
  // drop columns with nothing in them (expand toggles, action buttons)
  const keep = columns.map((c, i) => !!c.label || rows.some(r => r[i].text && r[i].text !== '—'));
  columns = columns.filter((_, i) => keep[i]).map(c => ({ ...c, label: c.label || ' ' }));
  rows = rows.map(r => r.filter((_, i) => keep[i]));
  const total = footRows.length ? rowCells(footRows[0]).filter((_, i) => keep[i]) : undefined;
  let note: string | undefined;
  if (rows.length > MAX_ROWS) {
    out.sheets.push({ name: sheetName, columns: columns.map(c => ({ label: c.label.trim() || 'Column', num: c.num })), rows: rows.map(r => r.map(c => (c.text === '—' ? null : c.text))) });
    note = `The first ${MAX_ROWS} of ${rows.length} rows; every row is in the workbook, sheet "${sheetName}".`;
    rows = rows.slice(0, MAX_ROWS);
  }
  return { kind: 'table', title, columns, rows, total, note };
}

function walk(e: El, part: FamilyPart, out: Out, ctx: { pending?: string; sheetBase: string; tiles?: Extract<Block, { kind: 'figures' }> }) {
  for (const c of e.children) {
    if (typeof c === 'string') { const t = c.replace(/\s+/g, ' ').trim(); if (t.length > 2) part.blocks.push({ kind: 'para', text: t }); continue; }
    if (SKIP(c) || has(c, 'pc-draw') || has(c, 'pc-chart')) continue;
    if (!has(c, 'dco-tile')) ctx.tiles = undefined;
    if (c.tag === 'table') { const b = tableBlock(c, ctx.pending, `${ctx.sheetBase}${ctx.pending ? ` · ${ctx.pending}` : ''}`.slice(0, 60), out); if (b) part.blocks.push(b); ctx.pending = undefined; continue; }
    if (has(c, 'note')) {
      const b = find(c, x => x.tag === 'b'); const all = text(c); const title = b ? text(b) : '';
      const rest = title ? all.replace(title, '').replace(/^\s*[·:]\s*/, '').trim() : all;
      const tone: Tone = has(c, 'note--bad') ? 'bad' : has(c, 'note--warn') ? 'warn' : has(c, 'note--good') ? 'ok' : 'info';
      if (all) part.blocks.push(title ? { kind: 'callout', tone, title, text: rest || undefined } : { kind: 'callout', tone, title: rest });
      continue;
    }
    if (c.tag === 'dl' && has(c, 'kv')) { const rows = els(c).map(it => ({ label: text(find(it, x => x.tag === 'dt') ?? it), value: text(find(it, x => x.tag === 'dd') ?? it), tone: toneOf(find(it, x => x.tag === 'dd')) })).filter(r => r.value); if (rows.length) part.blocks.push({ kind: 'kv', rows, columns: rows.length > 4 ? 2 : 1 }); continue; }
    if (has(c, 'pn-kv')) { const rows = els(c).map(it => { const [k, v] = els(it); return { label: k ? text(k) : '', value: v ? text(v) : '', tone: toneOf(v) }; }).filter(r => r.label && r.value); if (rows.length) part.blocks.push({ kind: 'kv', rows, columns: has(c, 'is-one') ? 1 : rows.length > 4 ? 2 : 1 }); continue; }
    if (has(c, 'pn-figs')) { const items = els(c).map(f => { const [k, v] = els(f); return { label: k ? text(k) : '', value: v ? text(v) : '' }; }).filter(x => x.label && x.value); if (items.length) part.blocks.push({ kind: 'figures', items }); continue; }
    if (has(c, 'dco-tile')) {
      const sub = find(c, x => has(x, 'dco-sub'));
      const item = { label: text(find(c, x => has(x, 'dco-l')) ?? c), value: text(find(c, x => has(x, 'dco-num')) ?? c), sub: sub ? text(sub) || undefined : undefined, tone: toneOf(sub) };
      if (ctx.tiles) ctx.tiles.items.push(item); else { ctx.tiles = { kind: 'figures', items: [item] }; part.blocks.push(ctx.tiles); }
      continue;
    }
    if (c.tag === 'ul' || c.tag === 'ol') { const items = els(c).filter(x => x.tag === 'li').map(text).filter(Boolean); if (items.length) part.blocks.push({ kind: 'list', items, ordered: c.tag === 'ol' }); continue; }
    if (has(c, 'pn-sub') || c.tag === 'h4' || c.tag === 'h5') { const t = text(els(c)[0] ?? c); if (t) ctx.pending = t; continue; }
    if (c.tag === 'p') { const t = text(c); if (t) part.blocks.push({ kind: 'para', text: t }); continue; }
    // a row of chips only: one line
    if (els(c).length > 1 && els(c).every(x => has(x, 'vw-chip'))) { const t = els(c).map(text).filter(Boolean).join(' · '); if (t) part.blocks.push({ kind: 'para', text: t }); continue; }
    walk(c, part, out, ctx);
  }
}

/** Every family pack section of the plan as sub-sections (one per panel) and the full long tables as workbook sheets. */
export function familyParts(plan: T.PlannerPlan, ev: Evaluation, data: PlannerData, template: T.PlannerTemplate | undefined, benchmarks: T.PlannerBenchmark[]): { parts: FamilyPart[]; sheets: ReviewSheet[] } {
  const out: Out = { parts: [], sheets: [] };
  const seen = new Set<string>();
  for (const sec of uiFor(plan.scope).packSections ?? []) {
    let html = '';
    try {
      const view = sec.render({ plan, ev, data, template, benchmarks }) as ReactNode;
      html = renderToStaticMarkup(createElement(DataTableAllRows.Provider, { value: true }, createElement(DrawWidth.Provider, { value: SHEET_W }, createElement('div', null, view))));
    } catch { continue; }
    const root = parseHtml(html);
    const panels = findAll(root, x => x.tag === 'section' && has(x, 'panel'));
    const units = panels.length ? panels : [root];
    units.forEach((u, k) => {
      const h3 = panels.length ? find(u, x => x.tag === 'h3') : undefined;
      const title = (h3 ? text({ ...h3, children: h3.children.filter(x => typeof x === 'string' || !has(x, 'count')) }) : '') || sec.label;
      const part: FamilyPart = { id: `${sec.key}${units.length > 1 ? `-${k + 1}` : ''}`, title, blocks: [] };
      const body = panels.length ? find(u, x => has(x, 'panel-body')) ?? u : u;
      const head = panels.length ? find(u, x => has(x, 'panel-head')) : undefined;
      const sub = head ? findAll(head, x => has(x, 'vw-label') || has(x, 'panel-sub') || has(x, 'sub')).map(text).filter(Boolean).join(' · ') : '';
      walk(body, part, out, { sheetBase: title });
      const foot = panels.length ? find(u, x => has(x, 'panel-foot')) : undefined;
      if (foot) { const t = text(foot); if (t) part.blocks.push({ kind: 'para', text: t }); }
      part.blocks = part.blocks.filter(b => !(b.kind === 'para' && /^(loading|nothing to show)/i.test(b.text)));
      // a table another family section already shows (the cut-in table sits in two sections) is given once
      part.blocks = part.blocks.filter(b => { if (b.kind !== 'table') return true; const sig = `${b.columns.map(c => c.label).join('|')}#${b.rows.slice(0, 3).map(r => r.map(x => x.text).join('|')).join('#')}`; if (seen.has(sig)) return false; seen.add(sig); return true; });
      if (part.blocks.length) out.parts.push({ ...part, summary: sub || undefined });
    });
  }
  return out;
}

/** Title of the analysis section for the plan's family. */
export function familyTitle(scope: T.PlannerScope): string {
  switch (scope) {
    case 'plant': return 'Plant upgrade: as-is, to-be and cut-ins';
    case 'network': return 'Interconnect: paths, circuits and cut-over';
    case 'migration': return 'Migration and site exit';
    case 'server-refresh': case 'network-refresh': case 'rack-replace': return 'Replacement: old to new, waves and cut-over';
    case 'new-dc': case 'expansion': case 'portfolio': case 'edge': return 'Site plan, acceptance and handover';
    default: return 'Placement on the site';
  }
}
