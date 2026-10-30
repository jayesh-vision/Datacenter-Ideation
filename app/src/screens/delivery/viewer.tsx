/* File tiles and the document viewer (30-Oct-2026, user: "documents design like this also open the viewers of this documents").
   Every file a project holds opens here, rendered from the record it came from — a purchase order shows its lines, a permit approval its
   reference and validity, a drawing its sheet with the title block, a schedule or snag list as a grid, an archive as its contents. A file
   the user attached keeps only its name and size in the prototype, so it says so. Keys: library ids `DOC-nnnn-<key>` (mock/delivery-docs.ts
   projectLibrary), `pfile:<permit>:<label>` for a permit's files and `dfile:<doc>:<label>` for a design document's. */
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDeliveryProject, useQuery } from '../../api';
import type { DeliveryProjectView, DesignDoc, DlFile } from '../../api/types';
import { IconBtn } from '../../ui/kit';
import { fmtDate, fmtMoney, fmtNum } from '../../lib/format';
import { mulberry32, seedOf } from '../../lib/rng';

export interface ViewItem { key: string; projectId: string; title: string; file: DlFile; to?: string; ref?: string }
export const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
const KIND: Record<string, { label: string; color: string }> = {
  pdf: { label: 'PDF', color: 'var(--vw-color-red-500)' }, docx: { label: 'DOC', color: 'var(--vw-color-blue-500)' }, doc: { label: 'DOC', color: 'var(--vw-color-blue-500)' },
  xlsx: { label: 'XLS', color: 'var(--vw-color-green-600)' }, csv: { label: 'CSV', color: 'var(--vw-color-green-600)' }, zip: { label: 'ZIP', color: 'var(--vw-color-orange-500)' },
  dwg: { label: 'DWG', color: 'var(--vw-color-purple-500)' }, png: { label: 'IMG', color: 'var(--vw-color-cyan-600)' }, jpg: { label: 'IMG', color: 'var(--vw-color-cyan-600)' }
};
export const kindOf = (name: string) => KIND[extOf(name)] ?? { label: (extOf(name) || 'FILE').slice(0, 4).toUpperCase(), color: 'var(--vw-color-slate-500)' };

/** a file-type glyph: a page with a folded corner, coloured by type, PDF / DOC / XLS label (docx pages show lines instead) */
export function FileGlyph({ name, size = 56 }: { name: string; size?: number }) {
  const k = kindOf(name); const doc = k.label === 'DOC';
  return (
    <svg width={size * 0.8} height={size} viewBox="0 0 40 50" aria-hidden="true" className="dd-glyph">
      <path d="M4 0h22l14 14v32a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill={k.color} />
      <path d="M26 0l14 14H30a4 4 0 0 1-4-4z" fill="#fff" opacity=".45" />
      {doc ? <g fill="#fff">{[22, 27, 32, 37].map((y, i) => <rect key={y} x="10" y={y} width={i === 3 ? 13 : 20} height="2.6" rx="1.3" />)}</g>
        : <text x="20" y="34" textAnchor="middle" fontSize={k.label.length > 3 ? 8.5 : 10.5} fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">{k.label}</text>}
    </svg>
  );
}

/* ---- the viewer */
export function DocViewer({ items, index, onIndex, onClose, view }: { items: ViewItem[]; index: number; onIndex: (i: number) => void; onClose: () => void; view?: DeliveryProjectView }) {
  const it = items[index];
  const { data: fetched } = useQuery(() => getDeliveryProject(it?.projectId ?? ''), [it?.projectId]);
  const data = view && view.project.id === it?.projectId ? view : fetched;
  useEffect(() => {
    /* capture phase: Esc closes the viewer only, not the drawer it was opened from */
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1); if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1); };
    addEventListener('keydown', h, true); return () => removeEventListener('keydown', h, true);
  }, [index, items.length, onClose, onIndex]);
  if (!it) return null;
  return createPortal(
    <div className="dv-wrap" role="dialog" aria-modal="true" aria-label={it.file.name}>
      <header className="dv-head">
        <FileGlyph name={it.file.name} size={30} />
        <div className="dv-title"><b title={it.file.name}>{it.file.name}</b><small>{it.title} · {it.file.label} · {fmtKbV(it.file.kb)} · {fmtDate(it.file.at)} · {it.file.by}</small></div>
        <span className="dv-count">{index + 1} of {items.length}</span>
        <IconBtn icon={I.ChevronLeft} title="Previous file (←)" onClick={() => index > 0 && onIndex(index - 1)} />
        <IconBtn icon={I.ChevronRight} title="Next file (→)" onClick={() => index < items.length - 1 && onIndex(index + 1)} />
        {it.to && <Link className="dv-rec" to={it.to} onClick={onClose}><I.ExternalLink size={14} /> Open record</Link>}
        <IconBtn icon={I.Printer} title="Print" onClick={() => window.print()} />
        <IconBtn icon={I.X} title="Close (Esc)" onClick={onClose} />
      </header>
      <div className="dv-body" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        {data ? <Render it={it} v={data} /> : <div className="dv-paper"><p className="muted">Loading…</p></div>}
      </div>
    </div>, document.body);
}
const fmtKbV = (kb: number) => kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${fmtNum(kb)} KB`;

/* what a key points at */
function source(it: ViewItem, v: DeliveryProjectView) {
  const pre = `DOC-${v.project.id.slice(4)}-`;
  if (it.key.startsWith('pfile:')) { const [, id] = it.key.split(':'); return { kind: 'permit-file' as const, permit: v.permits.find(p => p.id === id) }; }
  if (it.key.startsWith('dfile:')) { const [, id] = it.key.split(':'); return { kind: 'doc-file' as const, doc: v.docs.find(d => d.id === id) }; }
  const k = it.key.startsWith(pre) ? it.key.slice(pre.length) : it.key;
  const m = /^(po|grn|pmt|dd|rams|done|co)-(.+?)(?:-cad)?$/.exec(k);
  if (m) return { kind: m[1] as 'po' | 'grn' | 'pmt' | 'dd' | 'rams' | 'done' | 'co', id: m[2] };
  const cx = /^(cx|snag)(\d)$/.exec(k); if (cx) return { kind: cx[1] as 'cx' | 'snag', id: cx[2] };
  return { kind: k as 'plan' | 'appr' | 'charter' | 'ho' | 'om' | 'rec' | string, id: '' };
}

function Render({ it, v }: { it: ViewItem; v: DeliveryProjectView }) {
  const ext = extOf(it.file.name); const s = source(it, v); const p = v.project;
  const doc = s.kind === 'doc-file' ? s.doc : s.kind === 'dd' ? v.docs.find(d => d.id === (s as { id: string }).id) : undefined;
  if (/^U\d+$/.test(it.key.split('-').pop() ?? '') && it.key.startsWith('DOC-')) return <NoPreview it={it} why="This file was attached by hand. The prototype records its name and size; its contents are not stored, so there is nothing to show." />;
  if (doc && (ext === 'dwg' || (ext === 'pdf' && DRAWN.includes(doc.kind)))) return <Drawing doc={doc} v={v} cad={ext === 'dwg'} rev={revOf(it.file.name) ?? doc.rev} />;
  if (ext === 'xlsx' || ext === 'csv') return <Sheet it={it} v={v} doc={doc} />;
  if (ext === 'zip') return <Archive it={it} v={v} />;
  if (ext !== 'pdf') return <NoPreview it={it} why="No preview for this file type in the prototype." />;
  const paper = paperFor(it, v, s, doc);
  return paper ? <Paper {...paper} project={p.name} /> : <NoPreview it={it} why="The prototype has no preview for this file." />;
}
const DRAWN: DesignDoc['kind'][] = ['Single-line diagram', 'Cooling P&ID', 'Floor layout', 'As-built'];
const revOf = (name: string) => /_R([A-Z])\.[a-z]+$/.exec(name)?.[1];

function NoPreview({ it, why }: { it: ViewItem; why: string }) {
  return <div className="dv-paper dv-none"><FileGlyph name={it.file.name} size={84} /><h3>{it.file.name}</h3><p className="muted">{fmtKbV(it.file.kb)} · added {fmtDate(it.file.at)} by {it.file.by}</p><p>{why}</p></div>;
}

/* ---- paper documents */
type Block = { t: 'p'; text: ReactNode } | { t: 'h'; text: string } | { t: 'table'; head: string[]; rows: ReactNode[][]; foot?: ReactNode[] } | { t: 'list'; items: ReactNode[]; check?: boolean } | { t: 'sign'; who: [string, string, string][] };
interface PaperDoc { kind: string; heading: string; issuer: string; meta: [string, ReactNode][]; blocks: Block[]; stamp?: { text: string; tone: 'ok' | 'bad' | 'info' } }
function Paper({ kind, heading, issuer, meta, blocks, stamp, project }: PaperDoc & { project: string }) {
  return (
    <article className="dv-paper">
      <div className="dv-letter"><div><b>{issuer}</b><small>{kind}</small></div>{stamp && <span className={`dv-stamp is-${stamp.tone}`}>{stamp.text}</span>}</div>
      <h2 className="dv-h">{heading}</h2>
      <dl className="dv-meta">{meta.map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{x}</dd></div>)}</dl>
      {blocks.map((b, i) => b.t === 'p' ? <p key={i}>{b.text}</p> : b.t === 'h' ? <h4 key={i}>{b.text}</h4>
        : b.t === 'list' ? <ul key={i} className={b.check ? 'dv-check' : ''}>{b.items.map((x, j) => <li key={j}>{b.check && <I.SquareCheck size={14} />}{x}</li>)}</ul>
        : b.t === 'sign' ? <div key={i} className="dv-sign">{b.who.map(([r, n, d]) => <div key={r}><span className="dv-sigline">{n}</span><small>{r} · {d}</small></div>)}</div>
        : <table key={i} className="dv-table"><thead><tr>{b.head.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>{b.foot && <tfoot><tr>{b.foot.map((c, k) => <td key={k}>{c}</td>)}</tr></tfoot>}</table>)}
      <footer className="dv-foot"><span>{project}</span><span>Page 1 of 1</span></footer>
    </article>
  );
}

function paperFor(it: ViewItem, v: DeliveryProjectView, s: ReturnType<typeof source>, doc?: DesignDoc): PaperDoc | null {
  const p = v.project; const site = p.dcId; const id = 'id' in s ? s.id : '';
  const po = (s.kind === 'po' || s.kind === 'grn') ? v.pos.find(o => o.id === id) : undefined;
  if (s.kind === 'po' && po) {
    const lines = po.lines?.length ? po.lines : [{ item: po.item, qty: po.qty }];
    const unit = Math.round(po.total / Math.max(1, lines.reduce((a, l) => a + l.qty, 0)));
    return { kind: 'Purchase order', heading: `Purchase order ${po.id}`, issuer: p.manager, stamp: { text: po.state === 'Delivered' ? 'Received' : po.state, tone: po.state === 'Late' ? 'bad' : po.state === 'Delivered' ? 'ok' : 'info' },
      meta: [['Supplier', po.supplier], ['Ordered', fmtDate(po.ordered)], ['Delivery due', fmtDate(po.due)], ['Deliver to', site], ['Lead time', `${po.leadWeeks} weeks`], ['Contract', po.contract ?? 'Framework terms']],
      blocks: [{ t: 'table', head: ['Line', 'Item', 'Qty', 'Unit price', 'Amount'], rows: lines.map((l, i) => [String(i + 1), l.item, fmtNum(l.qty), fmtMoney(unit), fmtMoney(unit * l.qty)]), foot: ['', 'Total', '', '', fmtMoney(po.total)] },
        { t: 'p', text: `Deliver to ${site}, goods-in, against project ${p.id}. Quote ${po.id} on every delivery note and invoice.` }, { t: 'sign', who: [['Raised by', p.manager, fmtDate(po.ordered)], ['Supplier acceptance', po.supplier, fmtDate(po.ordered + 2 * 864e5)]] }] };
  }
  if (s.kind === 'grn' && po) return { kind: 'Goods receipt note', heading: `Goods receipt — ${po.id}`, issuer: `${site} goods-in`, stamp: { text: 'Received in full', tone: 'ok' },
    meta: [['Purchase order', po.id], ['Supplier', po.supplier], ['Received', fmtDate(po.due)], ['Received by', p.manager]],
    blocks: [{ t: 'table', head: ['Item', 'Ordered', 'Received', 'Condition'], rows: (po.lines?.length ? po.lines : [{ item: po.item, qty: po.qty }]).map(l => [l.item, fmtNum(l.qty), fmtNum(l.qty), 'Good']) }, { t: 'p', text: 'Packaging inspected, serial numbers recorded against the delivery note, kit moved to the build store.' }] };
  const pm = s.kind === 'permit-file' ? s.permit : s.kind === 'pmt' ? v.permits.find(x => x.id === id) : undefined;
  if (pm) {
    const label = s.kind === 'permit-file' ? it.key.split(':').slice(2).join(':') : 'Approval certificate';
    if (/refusal/i.test(label)) return { kind: 'Decision notice', heading: `Refusal — ${pm.name}`, issuer: pm.authority, stamp: { text: 'Refused', tone: 'bad' }, meta: [['Reference', pm.ref ?? '—'], ['Applicant', p.manager], ['Site', site], ['Date', fmtDate(it.file.at)]], blocks: [{ t: 'p', text: `The application is refused for the following reason: ${pm.notes ?? 'see the attached notes'}.` }, { t: 'p', text: 'The applicant may re-file once the points above are addressed.' }] };
    if (/approval/i.test(label)) return { kind: 'Approval certificate', heading: pm.name, issuer: pm.authority, stamp: { text: pm.state === 'Expired' ? 'Expired' : 'Approved', tone: pm.state === 'Expired' ? 'bad' : 'ok' },
      meta: [['Reference', pm.ref ?? '—'], ['Permit type', pm.type], ['Granted to', `${p.manager}, for project ${p.id}`], ['Site', site], ['Granted', pm.granted ? fmtDate(pm.granted) : '—'], ['Valid until', pm.expires ? fmtDate(pm.expires) : 'Does not lapse']],
      blocks: [{ t: 'p', text: `${pm.authority} approves "${pm.name}" for the works described in project ${p.id} — ${p.name}, at ${site}, as shown in the submission drawings on file.` },
        { t: 'h', text: 'Conditions' }, { t: 'list', items: [pm.notes ?? 'Works to be carried out as per the approved drawings.', 'Any change to the approved scope needs a fresh application.', ...(pm.expires ? [`Renew before ${fmtDate(pm.expires)}.`] : [])] },
        { t: 'sign', who: [['Issuing officer', pm.authority, pm.granted ? fmtDate(pm.granted) : '—']] }] };
    return { kind: label, heading: `${label} — ${pm.name}`, issuer: p.manager, stamp: { text: 'Filed', tone: 'info' },
      meta: [['To', pm.authority], ['Reference', pm.ref ?? 'on filing'], ['Applicant', pm.owner], ['Site', site], ['Filed', pm.submitted ? fmtDate(pm.submitted) : fmtDate(it.file.at)], ['Needed by', fmtDate(pm.due)]],
      blocks: [{ t: 'p', text: `Application for ${pm.name.toLowerCase()} for project ${p.id} — ${p.name}.` }, { t: 'h', text: 'Enclosed' }, { t: 'list', items: [...v.docs.filter(d => d.issued || d.state === 'In review').slice(0, 4).map(d => `${d.kind} ${d.number} rev ${d.rev}`), 'Site plan and ownership documents', 'Fee receipt'] }, { t: 'sign', who: [['Applicant', pm.owner, pm.submitted ? fmtDate(pm.submitted) : '—']] }] };
  }
  if (doc) return { kind: doc.kind, heading: `${doc.kind} — ${p.name}`, issuer: `${doc.discipline} design`, stamp: { text: doc.state, tone: doc.state === 'Draft' || doc.state === 'In review' ? 'info' : 'ok' },
    meta: [['Document', doc.number], ['Revision', revOf(it.file.name) ?? doc.rev], ['Author', doc.author], ['Reviewer', doc.reviewer], ['Issued', doc.issued ? fmtDate(doc.issued) : 'not issued'], ['Site', site]],
    blocks: doc.kind === 'Method statement' ? [{ t: 'h', text: 'Scope' }, { t: 'p', text: p.name }, { t: 'h', text: 'Sequence' }, { t: 'list', items: v.workOrders.slice(0, 6).map(w => `${w.title} — ${w.crew} (${fmtDate(w.start)})`) }, { t: 'h', text: 'Controls' }, { t: 'list', items: ['Permit-to-work and change request approved before any work', 'Live areas: escorted access, no work on both power sides at once', 'Back-out plan agreed with operations'] }]
      : [{ t: 'h', text: '1. Purpose' }, { t: 'p', text: `Basis of design for ${p.name} at ${site}.` }, { t: 'h', text: '2. Design criteria' }, { t: 'table', head: ['Item', 'Value'], rows: [['Budget', fmtMoney(p.budget)], ['Target date', fmtDate(p.target)], ['Work orders', String(v.workOrders.length)], ['Commissioning', 'L1–L5'], ['Permits', String(v.permits.length)]] }, { t: 'h', text: '3. References' }, { t: 'list', items: v.docs.filter(d => d.id !== doc.id).map(d => `${d.number} — ${d.kind}`) }] };
  const wo = (s.kind === 'rams' || s.kind === 'done') ? v.workOrders.find(w => w.id === id) : undefined;
  if (s.kind === 'rams' && wo) return { kind: 'Risk assessment and method statement', heading: `RAMS — ${wo.title}`, issuer: wo.crew, stamp: { text: 'Approved', tone: 'ok' },
    meta: [['Work order', wo.id], ['Change request', wo.changeId], ['Crew', `${wo.crew} (${wo.crewKind.toLowerCase()})`], ['Window', `${fmtDate(wo.start)} – ${fmtDate(wo.end)}`], ['Site', site], ['Racks', wo.rackIds.length ? wo.rackIds.join(', ') : '—']],
    blocks: [{ t: 'h', text: 'Hazards and controls' }, { t: 'table', head: ['Hazard', 'Risk', 'Control'], rows: hazards(wo.kind).map(h => [h[0], h[1], h[2]]) }, { t: 'h', text: 'Method' }, { t: 'list', items: ['Sign in at security; collect the permit-to-work', `Confirm ${wo.changeId} is approved and the window is open`, `Carry out: ${wo.title}`, 'Test, label and photograph the work', 'Clear the area and sign off with the site engineer'] }, { t: 'sign', who: [['Prepared by', wo.crew, fmtDate(wo.start - 5 * 864e5)], ['Approved by', p.manager, fmtDate(wo.start - 4 * 864e5)]] }] };
  if (s.kind === 'done' && wo) return { kind: 'Completion sign-off', heading: `Completion — ${wo.id}`, issuer: wo.crew, stamp: { text: 'Complete', tone: 'ok' },
    meta: [['Work order', wo.id], ['Title', wo.title], ['Completed', fmtDate(wo.end)], ['Change request', `${wo.changeId} (implemented)`]],
    blocks: [{ t: 'list', check: true, items: ['Work done as per the method statement', 'Labels and records updated (DCIM)', 'Area clean, waste removed', 'No alarms raised during the window', 'Photos attached to the work order'] }, { t: 'sign', who: [['Crew lead', wo.crew, fmtDate(wo.end)], ['Site engineer', p.manager, fmtDate(wo.end)]] }] };
  const t = s.kind === 'cx' ? v.tests.find(x => String(x.level) === id) : undefined;
  if (t) return { kind: 'Commissioning test certificate', heading: `L${t.level} — ${t.name}`, issuer: t.witness, stamp: { text: 'Passed', tone: 'ok' },
    meta: [['Level', `L${t.level}`], ['Scope', t.scope], ['Witness', t.witness], ['Date', fmtDate(t.due)], ['Project', p.id], ['Site', site]],
    blocks: [{ t: 'p', text: `The ${t.scope.toLowerCase()} described above was tested to the L${t.level} script and met its acceptance criteria.` }, { t: 'table', head: ['Check', 'Result'], rows: ['Pre-test inspection', 'Functional test', 'Alarms and monitoring', 'Records and labelling'].map(c => [c, 'Pass']) }, { t: 'sign', who: [['Witness', t.witness, fmtDate(t.due)], ['Project manager', p.manager, fmtDate(t.due)]] }] };
  const co = s.kind === 'co' ? v.changeOrders.find(c => c.id === id) : undefined;
  if (co) return { kind: 'Change order', heading: `${co.id} — ${co.title}`, issuer: co.raisedBy, stamp: { text: co.state, tone: co.state === 'Approved' ? 'ok' : co.state === 'Rejected' ? 'bad' : 'info' },
    meta: [['Raised', fmtDate(co.raisedAt)], ['Budget change', `${co.budgetDelta >= 0 ? '+' : ''}${fmtMoney(co.budgetDelta)}`], ['Schedule change', `${co.scheduleDays >= 0 ? '+' : ''}${co.scheduleDays} days`], ['Approver', co.approver], ['Decision', co.decidedAt ? `${co.state} ${fmtDate(co.decidedAt)}` : 'Pending']],
    blocks: [{ t: 'h', text: 'Reason' }, { t: 'p', text: co.reason }, ...(co.note ? [{ t: 'h' as const, text: 'Decision note' }, { t: 'p' as const, text: co.note }] : []), { t: 'sign', who: [['Raised by', co.raisedBy, fmtDate(co.raisedAt)], ...(co.decidedAt ? [[co.approver, co.decidedBy ?? co.approver, fmtDate(co.decidedAt)] as [string, string, string]] : [])] }] };
  const facts: [string, ReactNode][] = [['Project', p.id], ['Site', site], ['Manager', p.manager], ['Budget', fmtMoney(p.budget)], ['Start', fmtDate(p.start)], ['Target', fmtDate(p.target)]];
  if (s.kind === 'appr' || s.kind === 'charter' || s.kind === 'plan') return { kind: s.kind === 'charter' ? 'Project charter' : 'Approval record', heading: s.kind === 'charter' ? `Project charter — ${p.name}` : `Plan approval — ${p.planId}`, issuer: s.kind === 'charter' ? p.manager : 'Investment committee', stamp: { text: 'Approved', tone: 'ok' },
    meta: facts, blocks: [{ t: 'h', text: 'Scope' }, { t: 'p', text: p.name }, { t: 'h', text: 'Deliverables' }, { t: 'list', items: [`${v.workOrders.length} work orders`, `${v.pos.length} purchase orders`, `${v.permits.length} permits`, 'Commissioning L1–L5 and handover to operations'] }, ...(v.plan?.approvals?.length ? [{ t: 'table' as const, head: ['Step', 'Role', 'Decision', 'Date'], rows: v.plan.approvals.map(a => [a.step, a.role, a.decision, a.at ? fmtDate(a.at) : '—']) }] : [])] };
  if (s.kind === 'ho') return { kind: 'Handover certificate', heading: `Handover to operations — ${p.name}`, issuer: p.manager, stamp: { text: 'Handed over', tone: 'ok' }, meta: facts,
    blocks: [{ t: 'list', check: true, items: ['All work orders complete', 'Commissioning L1–L5 passed', 'As-built records issued', 'O&M manuals and warranties handed over', 'Spares delivered to the site store'] }, { t: 'sign', who: [['Delivery', p.manager, fmtDate(p.finish)], ['Operations', 'Site operations lead', fmtDate(p.finish)]] }] };
  return null;
}
const hazards = (kind: string): [string, string, string][] => [
  ...(kind === 'Electrical' ? [['Live busbars and tap-offs', 'High', 'Isolate one side only; LOTO; insulated tools; arc-flash PPE'] as [string, string, string]] : []),
  ...(kind === 'Mechanical' ? [['Pressurised coolant lines', 'Medium', 'Depressurise and drain the loop section; drip trays; leak test'] as [string, string, string]] : []),
  ...(kind === 'Cabling' || kind === 'Install' ? [['Laser light from live optics', 'Medium', 'Never look into a fibre; dust caps on; power meter checks'] as [string, string, string], ['Manual handling of kit', 'Medium', 'Two-person lift above 20 kg; server lift'] as [string, string, string]] : []),
  ['Work in a live data hall', 'Medium', 'Escorted access; no work on both A and B feeds of a rack'], ['Fire and smoke detection', 'Low', 'Hot-work permit; detection zones isolated only by the fire officer']];

/* ---- drawings: one sheet with the title block, drawn from the project's own racks / feeds */
function Drawing({ doc, v, cad, rev }: { doc: DesignDoc; v: DeliveryProjectView; cad: boolean; rev: string }) {
  const p = v.project; const r = mulberry32(seedOf(doc.id));
  const racks = [...new Set(v.workOrders.flatMap(w => w.rackIds))].slice(0, 24);
  const body = doc.kind === 'Single-line diagram' ? <Sld /> : doc.kind === 'Cooling P&ID' ? <Pid /> : <Layout racks={racks} n={8 + Math.floor(r() * 8)} />;
  return (
    <div className={`dv-sheet${cad ? ' is-cad' : ''}`}>
      <svg viewBox="0 0 1000 640" className="dv-svg">
        <rect x="10" y="10" width="980" height="620" fill="none" className="dv-frame" />
        <g transform="translate(30 30)">{body}</g>
        <g transform="translate(640 520)" className="dv-tb">
          <rect width="340" height="100" />
          <line x1="0" y1="34" x2="340" y2="34" /><line x1="0" y1="67" x2="340" y2="67" /><line x1="170" y1="34" x2="170" y2="100" /><line x1="270" y1="67" x2="270" y2="100" />
          <text x="8" y="22" className="dv-tb-b">{doc.kind}{doc.state === 'As-built' ? ' — AS-BUILT' : ''}</text>
          <text x="8" y="54">{p.id} · {p.dcId}</text><text x="178" y="54">{doc.number}</text>
          <text x="8" y="88">Drawn {doc.author} · checked {doc.reviewer}</text><text x="278" y="88">Rev {rev}</text>
        </g>
        {(doc.state === 'Draft' || doc.state === 'In review') && <text x="500" y="330" textAnchor="middle" className="dv-water">{doc.state.toUpperCase()}</text>}
      </svg>
      <p className="dv-cap">{cad ? 'CAD source — preview of sheet 1' : `Sheet 1 of ${doc.sheets}`} · {doc.discipline} · {doc.issued ? `issued ${fmtDate(doc.issued)}` : 'not issued'}</p>
    </div>
  );
}
const Box = ({ x, y, w = 110, h = 40, t }: { x: number; y: number; w?: number; h?: number; t: string }) => <g><rect x={x} y={y} width={w} height={h} className="dv-box" /><text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle">{t}</text></g>;
function Sld() {
  return <g className="dv-ln">
    <Box x={60} y={10} t="Utility feed A" /><Box x={400} y={10} t="Utility feed B" /><Box x={740} y={10} t="Generator" />
    <line x1="115" y1="50" x2="115" y2="100" /><line x1="455" y1="50" x2="455" y2="100" /><line x1="795" y1="50" x2="795" y2="100" />
    <Box x={60} y={100} t="TX-1 11/0.4 kV" /><Box x={400} y={100} t="TX-2 11/0.4 kV" /><Box x={740} y={100} t="ATS" />
    <line x1="115" y1="140" x2="115" y2="190" /><line x1="455" y1="140" x2="455" y2="190" /><line x1="795" y1="140" x2="795" y2="170" /><line x1="115" y1="170" x2="795" y2="170" strokeDasharray="6 4" />
    <line x1="40" y1="190" x2="880" y2="190" className="dv-bus" /><text x="40" y="182">LV switchboard</text>
    {[0, 1, 2, 3].map(i => <g key={i}><line x1={115 + i * 200} y1="190" x2={115 + i * 200} y2="240" /><Box x={60 + i * 200} y={240} t={`UPS-${i + 1}`} /><line x1={115 + i * 200} y1="280" x2={115 + i * 200} y2="330" /><Box x={60 + i * 200} y={330} t={`${i % 2 ? 'B' : 'A'}-side busway`} /></g>)}
    {[0, 1, 2, 3].flatMap(b => [0, 1].map(j => <g key={`${b}${j}`}><line x1={85 + b * 200 + j * 60} y1="370" x2={85 + b * 200 + j * 60} y2="420" /><Box x={60 + b * 200 + j * 60} y={420} w={50} h={30} t={`PDU ${b * 2 + j + 1}`} /></g>))}
  </g>;
}
function Pid() {
  return <g className="dv-ln">
    <Box x={20} y={40} w={130} h={60} t="Chiller / dry cooler" /><Box x={330} y={40} w={120} h={60} t="CDU-1" /><Box x={630} y={40} w={120} h={60} t="CDU-2" />
    <path d="M150 60 H330 M150 80 H330" /><path d="M450 60 H630 M450 80 H630" className="dv-ret" />
    {[0, 1, 2, 3].map(i => <g key={i}><circle cx={220 + i * 150} cy={200} r={18} className="dv-box" /><text x={220 + i * 150} y={204} textAnchor="middle">P{i + 1}</text><line x1={220 + i * 150} y1={100} x2={220 + i * 150} y2={182} /></g>)}
    <path d="M60 300 H880" /><path d="M60 330 H880" className="dv-ret" /><text x="60" y="292">Facility water supply</text><text x="60" y="350">Return</text>
    {[0, 1, 2, 3, 4, 5, 6].map(i => <g key={i}><Box x={70 + i * 120} y={380} w={90} h={50} t={`Rack ${String.fromCharCode(65 + Math.floor(i / 4))}${(i % 4) + 1}`} /><line x1={95 + i * 120} y1={300} x2={95 + i * 120} y2={380} /><line x1={135 + i * 120} y1={330} x2={135 + i * 120} y2={380} className="dv-ret" /></g>)}
  </g>;
}
function Layout({ racks, n }: { racks: string[]; n: number }) {
  const per = Math.max(6, Math.min(12, Math.ceil(Math.max(racks.length, n * 2) / 2)));
  return <g className="dv-ln">
    <rect x="0" y="0" width="900" height="460" className="dv-room" /><text x="10" y="-6">Data hall — general arrangement</text>
    {[0, 1].map(pair => <g key={pair} transform={`translate(40 ${50 + pair * 200})`}>
      <rect x="0" y="40" width={per * 60} height="40" className="dv-aisle" /><text x={per * 30} y="65" textAnchor="middle">Cold aisle</text>
      {[0, 1].map(row => Array.from({ length: per }, (_, i) => { const k = pair * 2 * per + row * per + i; const label = racks[k] ?? `${String.fromCharCode(65 + pair * 2 + row)}${String(i + 1).padStart(2, '0')}`; return <g key={`${row}-${i}`}><rect x={i * 60 + 4} y={row ? 80 : 0} width="52" height="40" className={racks[k] ? 'dv-rack is-new' : 'dv-rack'} /><text x={i * 60 + 30} y={(row ? 80 : 0) + 24} textAnchor="middle" className="dv-sm">{label.slice(-6)}</text></g>; }))}
    </g>)}
    <text x="40" y="450" className="dv-sm">Shaded racks: in this project's work orders</text>
  </g>;
}

/* ---- spreadsheets */
function Sheet({ it, v, doc }: { it: ViewItem; v: DeliveryProjectView; doc?: DesignDoc }) {
  const p = v.project; const r = mulberry32(seedOf(it.key));
  const snag = /snag/i.test(it.file.name);
  const t = snag ? v.tests.find(x => it.file.name.includes(`_L${x.level}_`)) : undefined;
  const head = snag ? ['#', 'Item', 'Location', 'Raised by', 'Severity', 'Status'] : ['Cable id', 'From', 'To', 'Type', 'Length (m)', 'Route'];
  const racks = [...new Set(v.workOrders.flatMap(w => w.rackIds))]; const R = (i: number) => racks[i % Math.max(1, racks.length)] ?? `${p.dcId}-R${String(i + 1).padStart(2, '0')}`;
  const rows = snag ? Array.from({ length: Math.max(1, t?.snags ?? 3) }, (_, i) => [String(i + 1), ['Label missing on PDU outlet', 'Cable bend radius too tight', 'Blanking panels missing', 'Door seal damaged', 'Alarm point not mapped in BMS'][i % 5], R(i), t?.witness ?? p.manager, ['Minor', 'Major', 'Minor'][i % 3], 'Open'])
    : Array.from({ length: 14 }, (_, i) => [`${p.dcId}-C${String(i + 1).padStart(4, '0')}`, `${R(i)} / PP-1 port ${i + 1}`, `ODF-1 / ${1 + Math.floor(i / 12)}-${(i % 12) + 1}`, ['OM4 MPO-12', 'OS2 LC duplex', 'Cat6A'][Math.floor(r() * 3)], String(8 + Math.floor(r() * 60)), r() < 0.5 ? 'Tray route 1' : 'Tray route 2']);
  return (
    <div className="dv-xls">
      <div className="dv-xls-bar"><span className="dv-xls-tab is-on">{snag ? 'Snags' : 'Cables'}</span><span className="dv-xls-tab">Notes</span><small className="muted">{doc ? `${doc.number} rev ${doc.rev}` : it.title}</small></div>
      <div className="dv-xls-grid"><table><thead><tr><th />{head.map((h, i) => <th key={h}>{String.fromCharCode(65 + i)}</th>)}</tr></thead>
        <tbody><tr><td className="dv-rn">1</td>{head.map(h => <td key={h} className="dv-hd">{h}</td>)}</tr>{rows.map((row, i) => <tr key={i}><td className="dv-rn">{i + 2}</td>{row.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
    </div>
  );
}

/* ---- archives */
function Archive({ it, v }: { it: ViewItem; v: DeliveryProjectView }) {
  const p = v.project; const n = it.file.name;
  const list: [string, number][] = /plan-pack/.test(n) ? [[`${p.planId}_plan.pdf`, 2400], [`${p.planId}_bill-of-materials.xlsx`, 180], [`${p.planId}_cost.xlsx`, 120], [`${p.planId}_schedule.pdf`, 640], ...v.docs.map(d => [`drawings/${d.number}.pdf`, 900] as [string, number]), ['README.txt', 2]]
    : /O-and-M/.test(n) ? v.pos.map(o => [`manuals/${o.supplier.replace(/\W+/g, '-')}_O-and-M.pdf`, 4200] as [string, number]).concat(v.pos.map(o => [`warranties/${o.id}_warranty.pdf`, 220] as [string, number]))
    : /as-built/.test(n) ? v.docs.map(d => [`${d.number}_as-built.pdf`, 1600] as [string, number]).concat([['test-certificates.pdf', 3200], ['cable-schedule.xlsx', 240]])
    : /submission/.test(n) ? v.docs.filter(d => d.kind !== 'Method statement').map(d => [`${d.number}_R${d.rev}.pdf`, 1100] as [string, number]).concat([['site-plan.pdf', 2600]])
    : [['contents.pdf', it.file.kb]];
  const uniq = [...new Map(list.map(x => [x[0], x])).values()];
  return (
    <div className="dv-paper dv-zip">
      <div className="dv-letter"><div><b>{n}</b><small>Archive · {uniq.length} files · {fmtKbV(it.file.kb)}</small></div></div>
      <ul>{uniq.map(([f, kb]) => <li key={f}><FileGlyph name={f} size={22} /><span>{f}</span><small>{fmtKbV(kb)}</small></li>)}</ul>
    </div>
  );
}
