/* The review document in the portal: a ReviewDoc (pack/review/model.ts, the same content the PDF, workbook and ZIP carry) rendered
   in the app kit as a clean, printable document — cover with the verdict and headline figures, numbered sections of blocks (paragraphs,
   key/value lists, tables with totals, lists, callouts, figure tiles, drawings inline as figures), the approval sheet with sign-off boxes,
   and the drawing register followed by the drawing sheets with their title blocks. `ReviewContents` is the contents rail beside it. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as I from 'lucide-react';
import type { Block, ReviewApprovalStep, ReviewDoc, ReviewDrawing, ReviewSection, Tone } from './model';
import { date } from '../../common';
import '../../../../styles/planning-pack.css';
import '../../../../styles/planning-review.css';

const NOTE: Record<Tone, string> = { ok: 'note--good', warn: 'note--warn', bad: 'note--bad', info: 'note--info', neutral: 'rv-note-neutral' };
const NOTE_ICON: Record<Tone, I.LucideIcon> = { ok: I.CircleCheck, warn: I.TriangleAlert, bad: I.OctagonAlert, info: I.Info, neutral: I.FileText };
/* dates and short codes never wrap inside a table cell */
const SHORT = /^([A-Z][a-z]{2} \d{1,2}, \d{4}|\d{4}-\d\d-\d\d|[A-Z]{2,5}-\d{2,5}(-[A-Z0-9]+)?)$/;
const tc = (t?: Tone) => (t && t !== 'neutral' ? ` rv-t-${t}` : '');

/** A section of the document as the contents rail and the comments see it (level 2 = a sub-section numbered "4.1"). */
export interface DocSectionRef { id: string; number: string; title: string; label: string; level: number; parent?: string }
const levelOf = (number: string) => (number ? number.split('.').length : 1);
/** The builder stamps ISO times; the document shows them as a date and a time. */
export const stamp = (s: string) => (/^\d{4}-\d\d-\d\dT/.test(s) ? `${date(s)} ${new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}` : s);
const day = (s: string) => (/^\d{4}-\d\d-\d\dT/.test(s) ? date(s) : s);
const APPROVAL_ID = 'approval';
const isRegister = (s: ReviewSection) => s.id === 'drawings' || s.id === 'register' || /^A$/i.test(s.number) || /drawing register/i.test(s.title);

/** The sections in reading order, with the approval sheet and the drawing register added when the document carries the data but no
 *  section for them (so every renderer shows the same parts). */
export function docSections(doc: ReviewDoc): ReviewSection[] {
  const out = [...doc.sections];
  if (!out.some(s => s.id === APPROVAL_ID || /approval sheet/i.test(s.title)) && (doc.approvals.length || doc.ask.decision)) {
    out.unshift({ id: APPROVAL_ID, number: '1', title: 'Approval sheet', blocks: [
      ...(doc.approvals.length ? [{ kind: 'table', columns: [{ label: 'Step', num: true }, { label: 'Role' }, { label: 'Approver' }, { label: 'Decision' }, { label: 'Date' }, { label: 'Comment' }],
        rows: doc.approvals.map(a => [{ text: String(a.step), num: true }, { text: a.role }, { text: a.approver ?? '—' }, { text: a.decision, tone: decisionTone(a.decision) }, { text: a.at ?? '—' }, { text: [a.comment, ...(a.conditions ?? []).map(c => `Condition: ${c}`)].filter(Boolean).join(' · ') || '—' }]) } as Block] : []),
      ...(doc.ask.decision ? [{ kind: 'callout', tone: 'info', title: 'Decision asked', text: doc.ask.decision } as Block] : []),
      ...(doc.ask.changesSinceLast?.length ? [{ kind: 'list', items: doc.ask.changesSinceLast } as Block] : []),
    ] });
  }
  if (doc.drawings.length && !out.some(isRegister)) {
    out.push({ id: 'drawings', number: 'A', title: 'Drawing register', blocks: [{ kind: 'table', columns: [{ label: 'Number' }, { label: 'Title' }, { label: 'Discipline' }, { label: 'Revision' }], rows: doc.drawings.map(d => [{ text: d.number }, { text: d.title }, { text: d.discipline }, { text: d.revision }]) }] });
  }
  return out;
}
export const sectionLabel = (s: Pick<ReviewSection, 'number' | 'title'>) => (/^[A-Z]$/.test(s.number) ? `Appendix ${s.number} ${s.title}` : `${s.number} ${s.title}`);
export function sectionRefs(doc: ReviewDoc): DocSectionRef[] {
  const out: DocSectionRef[] = [{ id: 'cover', number: '', title: 'Cover', label: 'Cover', level: 1 }];
  let parent: string | undefined;
  for (const s of docSections(doc)) { const level = levelOf(s.number); if (level === 1) parent = s.id; out.push({ id: s.id, number: s.number, title: s.title, label: sectionLabel(s), level, parent: level > 1 ? parent : undefined }); }
  return out;
}

function decisionTone(d: string): Tone { return /reject/i.test(d) ? 'bad' : /condition/i.test(d) ? 'warn' : /approv/i.test(d) ? 'ok' : /pending/i.test(d) ? 'warn' : 'neutral'; }

/** A drawing's SVG, built once per drawing (the builder may render React off-screen). */
function useSvg(d: ReviewDrawing | undefined): string {
  return useMemo(() => { if (!d) return ''; try { return d.svg(); } catch { return ''; } }, [d]);
}
function Svg({ d, className }: { d: ReviewDrawing; className?: string }) {
  const s = useSvg(d);
  if (!s) return <div className="rv-svg-missing">Drawing {d.number} could not be drawn.</div>;
  return <div className={`rv-svg ${className ?? ''}`} style={{ aspectRatio: `${d.width} / ${d.height}` }} role="img" aria-label={`${d.number} ${d.title}`} dangerouslySetInnerHTML={{ __html: s }} />;
}

function BlockView({ b, sec, n, drawings }: { b: Block; sec: ReviewSection; n: number; drawings: Map<string, ReviewDrawing> }) {
  switch (b.kind) {
    case 'para': return <p className="rv-p">{b.text}</p>;
    case 'list': { const L = b.ordered ? 'ol' : 'ul'; return <L className="rv-list">{b.items.map((x, i) => <li key={i}>{x}</li>)}</L>; }
    case 'callout': { const Ic = NOTE_ICON[b.tone]; return <div className={`note ${NOTE[b.tone]} rv-callout`}><Ic size={15} /><div><b>{b.title}</b>{b.text && <span>{b.text}</span>}</div></div>; }
    case 'kv': return (
      <dl className={`rv-kv${b.columns === 2 ? ' is-2' : ''}`}>{b.rows.map((r, i) => <div key={`${r.label}-${i}`}><dt>{r.label}</dt><dd><span className={tc(r.tone).trim() || undefined}>{r.value}</span>{r.source && <small>{r.source}</small>}</dd></div>)}</dl>
    );
    case 'figures': return <div className="rv-figs">{b.items.map((f, i) => <div key={`${f.label}-${i}`} className={`rv-fig-tile${f.tone && f.tone !== 'neutral' ? ` is-${f.tone}` : ''}`}><span>{f.label}</span><b>{f.value}</b>{f.sub && <small>{f.sub}</small>}</div>)}</div>;
    case 'table': {
      return (
        <div className="rv-tbl">
          {b.title && <div className="rv-caption">Table {sec.number}.{n} · {b.title}</div>}
          <div className="rv-tablewrap"><table className={`rv-table${b.columns.length >= 8 ? ' is-dense' : ''}`}>
            <thead><tr>{b.columns.map((c, i) => <th key={i} className={c.num ? 'num' : undefined} style={c.width ? { width: `${c.width}%` } : undefined}>{c.label}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`${c.num || b.columns[j]?.num ? `num${c.text.split(' ').length > 2 || c.text.length > 24 ? ' wrap' : ''}` : ''}${tc(c.tone)}${SHORT.test(c.text) ? ' nowrap' : ''}`.trim() || undefined}>{c.tone && c.tone !== 'neutral' && !c.num ? <span className={`rv-tone${c.text.length <= 24 ? ' nowrap' : ''}`}><span className={`rv-dot is-${c.tone}`} />{c.text}</span> : c.text}</td>)}</tr>)}</tbody>
            {b.total && <tfoot><tr>{b.total.map((c, j) => <td key={j} className={c.num || b.columns[j]?.num ? 'num' : undefined}>{c.text}</td>)}</tr></tfoot>}
          </table></div>
          {b.note && <small className="rv-tnote">{b.note}</small>}
        </div>
      );
    }
    case 'figure': {
      const d = drawings.get(b.drawingId); if (!d) return null;
      return <figure className="rv-figure"><Svg d={d} /><figcaption>Figure {sec.number}.{n} · {b.caption ?? d.title} <span className="mono">({d.number})</span></figcaption></figure>;
    }
  }
}

function SignOff({ steps }: { steps: ReviewApprovalStep[] }) {
  if (!steps.length) return null;
  return (
    <div className="rv-signoff">{steps.map(a => (
      <div key={a.step} className="rv-sign">
        <div className="rv-sign-head"><span>Step {a.step}</span><b>{a.role}</b></div>
        <div className="rv-sign-row"><span>Name</span><b>{a.approver ?? ''}</b></div>
        <div className="rv-sign-row"><span>Decision</span><b className={tc(decisionTone(a.decision)).trim() || undefined}>{a.decision === 'Pending' ? '' : a.decision}</b></div>
        <div className="rv-sign-row"><span>Signature</span><b /></div>
        <div className="rv-sign-row"><span>Date</span><b>{a.decision === 'Pending' ? '' : a.at ?? ''}</b></div>
      </div>
    ))}</div>
  );
}

export interface ReviewDocViewProps {
  doc: ReviewDoc;
  /** open / all comments per section id; shows a comment button on every section heading when `onComment` is given */
  comments?: Record<string, { open: number; total: number }>;
  onComment?: (s: DocSectionRef) => void;
  /** the section whose comments are shown beside the document (highlighted) */
  focus?: string;
}

export function ReviewDocView({ doc, comments, onComment, focus }: ReviewDocViewProps) {
  const m = doc.meta;
  const sections = useMemo(() => docSections(doc), [doc]);
  const drawings = useMemo(() => new Map(doc.drawings.map(d => [d.id, d])), [doc.drawings]);
  const head = (s: { id: string; number: string; title: string }, label: string): ReactNode => {
    const c = comments?.[s.id];
    return onComment ? <button type="button" className={`rv-cbtn${c?.open ? ' has-open' : ''}`} title={c?.total ? `${c.open} open of ${c.total} comments on ${label}` : `Comment on ${label}`} aria-label={`Comments on ${label}`} onClick={() => onComment({ ...s, label, level: levelOf(s.number) })}><I.MessageSquare size={14} />{c?.total ? <span>{c.open || c.total}</span> : <span className="rv-cbtn-add">Comment</span>}</button> : null;
  };
  const block: [string, string | undefined][] = [
    ['Plan', m.plnId], ['Revision', m.revision], ['Document', m.docNumber], ['Status', m.status],
    ['Plan type', m.scopeLabel], ['Site', m.site], ['Owner', m.owner], ['Requested by', m.requestedBy],
    ['Needed by', m.neededBy], ['Template', m.templateName ? `${m.templateName}${m.templateVersion ? ` ${/^v/i.test(m.templateVersion) ? m.templateVersion : `v${m.templateVersion}`}` : ''}` : undefined], ['Generated', `${stamp(m.generatedAt)} by ${m.generatedBy}`], ['Currency', `${m.currency} · ${m.geography}`],
  ];
  const VIc = NOTE_ICON[m.verdict.tone];
  return (
    <article className="rv-doc plan-print-area" aria-label={`${m.docNumber} review pack`}>
      <header id="rv-sec-cover" className={`rv-cover${focus === 'cover' ? ' is-focus' : ''}`} data-sec="cover">
        <div className="rv-cover-top"><span className="rv-kicker">Plan review pack</span><span className="rv-docno mono">{m.docNumber} · Rev {m.revision}</span>{head({ id: 'cover', number: '', title: 'Cover' }, 'Cover')}</div>
        <h1 className="rv-title">{m.title}</h1>
        <p className="rv-subtitle">{m.scopeLabel} · {m.site}</p>
        <div className={`note ${NOTE[m.verdict.tone]} rv-verdict`}><VIc size={16} /><span>{m.verdict.text}</span></div>
        {m.headline.length > 0 && <div className="rv-figs is-cover">{m.headline.map((f, i) => <div key={`${f.label}-${i}`} className={`rv-fig-tile${f.tone && f.tone !== 'neutral' ? ` is-${f.tone}` : ''}`}><span>{f.label}</span><b>{f.value}</b>{f.sub && <small>{f.sub}</small>}</div>)}</div>}
        <div className="pk-titleblock rv-tb">{block.filter(([, v]) => v).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      </header>

      {sections.map(s => {
        const label = sectionLabel(s);
        // tables and figures are numbered per section, in reading order (only titled tables and drawn figures take a number)
        let t = 0, f = 0;
        const nums = s.blocks.map(b => (b.kind === 'table' ? (b.title ? ++t : 0) : b.kind === 'figure' ? (drawings.has(b.drawingId) ? ++f : 0) : 0));
        const reg = isRegister(s);
        const sub = levelOf(s.number) > 1;
        const approval = s.id === APPROVAL_ID || /approval sheet/i.test(s.title);
        const H = sub ? 'h3' : 'h2';
        return (
          <section key={s.id} id={`rv-sec-${s.id}`} data-sec={s.id} className={`rv-sec${sub ? ' is-sub' : ''}${focus === s.id ? ' is-focus' : ''}${reg ? ' is-appendix' : ''}`}>
            <div className="rv-sec-head"><H><span className="rv-num">{/^[A-Z]$/.test(s.number) ? `Appendix ${s.number}` : s.number}</span>{s.title}</H>{head(s, label)}</div>
            {s.summary && <p className="rv-lead">{s.summary}</p>}
            {s.blocks.map((b, i) => approval && b.kind === 'table' && /^sign-?off/i.test(b.title ?? '')
              ? <div key={i} className="rv-tbl"><div className="rv-caption">Table {s.number}.{nums[i]} · {b.title}</div><SignOff steps={doc.approvals} /></div>
              : <BlockView key={i} b={b} sec={s} n={nums[i]} drawings={drawings} />)}
            {approval && !s.blocks.some(b => b.kind === 'table' && /^sign-?off/i.test(b.title ?? '')) && <SignOff steps={doc.approvals} />}
            {reg && doc.drawings.length > 0 && <div className="rv-sheets">{doc.drawings.map(d => <DrawingSheet key={d.id} d={d} date={m.generatedAt} />)}</div>}
          </section>
        );
      })}
      <footer className="rv-foot">{m.docNumber} · Rev {m.revision} · generated {stamp(m.generatedAt)} by {m.generatedBy} · money in {m.currency}. Figures are indicative until the plan is approved; sources are listed in the assumptions section.</footer>
    </article>
  );
}

function DrawingSheet({ d, date }: { d: ReviewDrawing; date: string }) {
  const svg = useSvg(d);
  const plain = svg.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const notes = (d.notes ?? []).filter(n => !plain.includes(n.replace(/\s+/g, ' ').slice(0, 40)));
  const cells: [string, string][] = [['Drawing', d.number], ['Title', d.title], ['Discipline', d.discipline], ['Scale', 'NTS'], ['Rev', d.revision], ['Date', day(date)]];
  return (
    <figure id={`rv-dwg-${d.id}`} className="rv-sheet plan-print-sheet">
      <div className="rv-sheet-body"><Svg d={d} /></div>
      {/* notes the drawing does not carry itself (the builder's sheets print their notes inside the SVG) */}
      {notes.length ? <ul className="rv-sheet-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
      <figcaption className="pk-sheet-tb rv-sheet-tb">{cells.map(([k, v], i) => <div key={k} className={i === 1 ? 'is-grow' : undefined}><span>{k}</span><b className={i === 0 ? 'mono' : undefined}>{v}</b></div>)}</figcaption>
    </figure>
  );
}

/** Which section is in view (the one whose top passed a line just under the sticky header). */
export function useActiveSection(ids: string[], offset = 140): string | undefined {
  const [active, setActive] = useState<string | undefined>(ids[0]);
  const key = ids.join('|');
  useEffect(() => {
    let raf = 0;
    const run = () => { raf = 0; let cur = ids[0]; for (const id of ids) { const el = document.getElementById(`rv-sec-${id}`); if (el && el.getBoundingClientRect().top - offset <= 0) cur = id; } setActive(cur); };
    const on = () => { if (!raf) raf = requestAnimationFrame(run); };
    run(); window.addEventListener('scroll', on, { passive: true, capture: true });
    return () => { window.removeEventListener('scroll', on, { capture: true }); if (raf) cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, offset]);
  return active;
}
export const jumpTo = (id: string) => document.getElementById(`rv-sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/** The contents rail: every section with its number, the open comment count, the one in view highlighted. */
export function ReviewContents({ refs, active, comments, onJump }: { refs: DocSectionRef[]; active?: string; comments?: Record<string, { open: number; total: number }>; onJump?: (id: string) => void }) {
  // sub-sections show under the section being read; the others stay folded
  const openParent = refs.find(r => r.id === active)?.parent ?? active;
  const shown = refs.filter(r => r.level === 1 || r.parent === openParent);
  const subOpen = (id: string) => refs.filter(r => r.parent === id).reduce((a, r) => a + (comments?.[r.id]?.open ?? 0), 0);
  return (
    <nav className="rv-rail" aria-label="Contents">
      <div className="rv-rail-h">Contents</div>
      <ol>{shown.map(r => <li key={r.id} className={r.level > 1 ? 'is-sub' : undefined}><button type="button" className={active === r.id || (r.level === 1 && openParent === r.id && active !== r.id) ? (active === r.id ? 'is-active' : 'is-parent') : undefined} onClick={() => (onJump ?? jumpTo)(r.id)}>
        <span className="rv-rail-n">{r.number}</span><span className="rv-rail-t">{r.title}</span>{(() => { const o = (comments?.[r.id]?.open ?? 0) + (r.level === 1 && openParent !== r.id ? subOpen(r.id) : 0); return o ? <span className="rv-rail-c" title={`${o} open comment${o === 1 ? '' : 's'}`}>{o}</span> : null; })()}
      </button></li>)}</ol>
    </nav>
  );
}
