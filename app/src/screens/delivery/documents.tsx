/* Permits, design documents and the project document library (30-Oct-2026, user: "check DCOS's Permits and Design … implement like this",
   "also implement documents sections for the projects"). Shared by Delivery → Permits / Design and the project page's Documents tab:
   list columns, a drawer per permit / document (dates, validity, files, the next step), New permit / New document /
   Attach forms. Data and moves: mock/delivery.ts + mock/delivery-docs.ts. */
import { useState, type ReactNode } from 'react';
import { DocViewer, FileGlyph, extOf, kindOf, type ViewItem } from './viewer';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { addDesignDoc, addPermit, attachDeliveryFile, clockNow, designDocAction, editPermit, geoNow, permitAction } from '../../api';
import type { DeliveryProject, DeliveryProjectView, DesignDiscipline, DesignDoc, DlFile, Permit, PermitType, ProjectDocCategory, ProjectDocument } from '../../api/types';
import { Btn, Chip, Drawer, Field, KV, Modal, Panel } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar } from '../../ui/ListToolbar';
import { fmtDate, fmtNum } from '../../lib/format';
import { DOC_RANK, permitNow } from './order';

const DAY = 864e5;
/* drawings have sheets; a design basis, method statement or cable schedule is one document (user, 30-Oct-2026: "why the column Sheets?") */
const isDrawing = (d: DesignDoc) => d.kind === 'Single-line diagram' || d.kind === 'Cooling P&ID' || d.kind === 'Floor layout' || d.kind === 'As-built';
const plural = (n: number, w: string) => `${fmtNum(n)} ${w}${n === 1 ? '' : 's'}`;
const activeGeoPeople = () => geoNow().people.slice(0, 12);
export const PERMIT_TYPES: PermitType[] = ['Planning / zoning', 'Building', 'Environmental', 'Electrical', 'Fire / life safety', 'Utility connection', 'Occupancy', 'Right of way', 'Decommission'];
export const DISCIPLINES: DesignDiscipline[] = ['Architectural', 'Structural', 'Electrical', 'Mechanical', 'Network', 'Civil'];
const DOC_KINDS: DesignDoc['kind'][] = ['Design basis', 'Single-line diagram', 'Cooling P&ID', 'Floor layout', 'Cable schedule', 'Method statement'];
export const PERMIT_TONE: Record<Permit['state'], 'success' | 'info' | 'warning' | 'error' | 'neutral'> = { Granted: 'success', Submitted: 'info', 'To submit': 'warning', Rejected: 'error', Expired: 'error', 'Not needed': 'neutral' };
export const DOC_TONE: Record<DesignDoc['state'], 'success' | 'info' | 'neutral'> = { 'Issued for construction': 'success', 'As-built': 'success', 'In review': 'info', Draft: 'neutral' };
const CATEGORIES: ProjectDocCategory[] = ['Plan and approval', 'Contracts and orders', 'Permits', 'Design', 'Method statements and safety', 'Test and commissioning', 'Change control', 'Handover', 'Other'];

export const fmtKb = (kb: number) => kb >= 1024 ? `${(kb / 1024).toFixed(kb >= 10240 ? 0 : 1)} MB` : `${fmtNum(kb)} KB`;
export const daysLeft = (t: number) => Math.ceil((t - clockNow()) / DAY);
/** granted and within 60 days of lapsing */
export const expiringSoon = (p: Permit) => p.state === 'Granted' && !!p.expires && daysLeft(p.expires) >= 0 && daysLeft(p.expires) <= 60;
/** not granted and needed within 30 days (or already past its date) */
export const neededSoon = (p: Permit) => (p.state === 'To submit' || p.state === 'Submitted' || p.state === 'Rejected') && daysLeft(p.due) <= 30;

export function Validity({ p }: { p: Permit }) {
  if (p.state !== 'Granted' && p.state !== 'Expired') return <span className="muted">—</span>;
  if (!p.expires) return <span className="cell-2 dd-fcell"><span>Does not lapse</span><small>granted {p.granted ? fmtDate(p.granted) : '—'}</small></span>;
  const n = daysLeft(p.expires);
  return <span className="cell-2 dd-fcell">{n < 0 ? <Chip tone="error" size="xs" dot>Expired</Chip> : n <= 60 ? <Chip tone="warning" size="xs" dot>{n} d left</Chip> : <span className="nowrap">to {fmtDate(p.expires)}</span>}<small className="nowrap">{n < 0 ? `on ${fmtDate(p.expires)}` : n <= 60 ? `to ${fmtDate(p.expires)}` : `${Math.round(n / 30.44)} months left`}</small></span>;
}

/* ---- list columns */
export function permitCols(projName?: (id: string) => ReactNode): Col<Permit>[] {
  return [
    { key: 'n', header: 'Permit', sort: p => p.name, wrap: true, render: p => <span className="cell-2"><b>{p.name}</b><small>{p.type}</small></span> },
    { key: 'a', header: 'Authority', sort: p => p.authority, wrap: true, render: p => <span className="cell-2"><span>{p.authority}</span><small className="mono nowrap">{p.ref ?? 'not filed'}</small></span> },
    ...(projName ? [{ key: 'p', header: 'Project', sort: (p: Permit) => p.projectId, wrap: true, render: (p: Permit) => projName(p.projectId) }] : []),
    { key: 'd', header: 'Needed by', sort: p => p.due, render: p => { const n = daysLeft(p.due); const late = p.state !== 'Granted' && p.state !== 'Not needed' && p.state !== 'Expired'; return <span className="cell-2"><span className="nowrap">{fmtDate(p.due)}</span><small className="nowrap" style={late && n <= 30 ? { color: n < 0 ? 'var(--vw-color-red-600)' : 'var(--vw-color-orange-700)' } : undefined}>{late ? (n < 0 ? `${-n} d past` : `in ${n} d`) : p.submitted ? `filed ${fmtDate(p.submitted)}` : ''}</small></span>; } },
    { key: 'v', header: 'Validity', sort: p => p.expires ?? Number.MAX_SAFE_INTEGER, render: p => <Validity p={p} /> },
    { key: 'f', header: 'Files', sort: p => p.files.length, render: p => <span className="row" style={{ gap: 4 }}><I.Paperclip size={13} className="muted" />{p.files.length}</span> },
    { key: 'o', header: 'Owner', sort: p => p.owner, render: p => <span className="nowrap">{p.owner}</span> },
    { key: 's', header: 'State', sort: p => p.state, render: p => <Chip tone={PERMIT_TONE[p.state]} dot>{p.state}</Chip> }
  ];
}
export function docCols(projName?: (id: string) => ReactNode): Col<DesignDoc>[] {
  return [
    { key: 't', header: 'Document', sort: d => d.kind, wrap: true, render: d => <span className="cell-2"><b>{d.kind}</b><small className="mono dd-num">{d.number}</small></span> },
    { key: 'di', header: 'Discipline', sort: d => d.discipline, render: d => <Chip tone="neutral" size="xs">{d.discipline}</Chip> },
    { key: 'r', header: 'Rev', sort: d => d.rev, render: d => <span className="mono">{d.rev}</span> },
    ...(projName ? [{ key: 'p', header: 'Project', sort: (d: DesignDoc) => d.projectId, wrap: true, render: (d: DesignDoc) => projName(d.projectId) }] : []),
    { key: 'sh', header: 'Files', sort: d => d.files.length, render: d => <span className="cell-2"><span className="nowrap">{plural(d.files.length, 'file')}</span>{isDrawing(d) && <small className="nowrap">{plural(d.sheets, 'drawing sheet')}</small>}</span> },
    { key: 'a', header: 'Author · reviewer', sort: d => d.author, render: d => <span className="cell-2"><span className="nowrap">{d.author}</span><small className="nowrap">{d.reviewer}</small></span> },
    { key: 'u', header: 'Issued / updated', sort: d => d.issued ?? d.updated, render: d => <span className="cell-2"><span className="nowrap">{fmtDate(d.issued ?? d.updated)}</span><small>{d.issued ? 'issued' : 'updated'}</small></span> },
    { key: 's', header: 'State', sort: d => d.state, render: d => <Chip tone={DOC_TONE[d.state]} dot>{d.state}</Chip> }
  ];
}

/* ---- files */
export function FileList({ files, empty = 'No files yet.', owner }: { files: DlFile[]; empty?: string; owner: { kind: 'permit' | 'doc'; id: string; projectId: string; title: string } }) {
  const [at, setAt] = useState(-1);
  if (!files.length) return <p className="vw-label">{empty}</p>;
  const items: ViewItem[] = files.map(f => ({ key: `${owner.kind === 'permit' ? 'pfile' : 'dfile'}:${owner.id}:${f.label}`, projectId: owner.projectId, title: owner.title, file: f }));
  return <>
    <ul className="dd-files">{files.map((f, i) => (
      <li key={i}><button type="button" className="dd-fbtn" onClick={() => setAt(i)} title="Open in the viewer"><FileGlyph name={f.name} size={24} /><span className="dd-fcell"><span className="dd-fname">{f.name}{f.label.startsWith('Superseded') ? <Chip tone="neutral" size="xs">Superseded</Chip> : f.label.startsWith('Current') ? <Chip tone="success" size="xs">Current</Chip> : null}</span><small>{f.label} · {fmtKb(f.kb)} · {fmtDate(f.at)} · {f.by}</small></span><I.Eye size={15} className="dd-feye" /></button></li>))}</ul>
    {at >= 0 && <DocViewer items={items} index={at} onIndex={setAt} onClose={() => setAt(-1)} />}
  </>;
}

/* the project's document library: file tiles (or a list), search, Show (category), sort, file type; every file opens in the viewer */
const SORTS = { new: 'Newest first', old: 'Oldest first', az: 'Name A–Z', big: 'Largest first' } as const;
export function FileLibrary({ files, projectId, view }: { files: ProjectDocument[]; projectId: string; view?: DeliveryProjectView }) {
  const [q, setQ] = useState(''); const [cat, setCat] = useState<ProjectDocCategory | ''>(''); const [sort, setSort] = useState<keyof typeof SORTS>('new'); const [type, setType] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>(() => { try { return (localStorage.getItem('dco.dl.files') as 'grid' | 'list') || 'grid'; } catch { return 'grid'; } });
  const [at, setAt] = useState(-1); const [sel, setSel] = useState('');
  const setL = (l: 'grid' | 'list') => { setLayout(l); try { localStorage.setItem('dco.dl.files', l); } catch { /* storage blocked */ } };
  const types = [...new Set(files.map(f => kindOf(f.file.name).label))].sort();
  const rows = files.filter(f => (!cat || f.category === cat) && (!type || kindOf(f.file.name).label === type) && (!q || `${f.title} ${f.file.name} ${f.ref ?? ''} ${f.file.by}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => sort === 'new' ? b.file.at - a.file.at : sort === 'old' ? a.file.at - b.file.at : sort === 'az' ? a.file.name.localeCompare(b.file.name) : b.file.kb - a.file.kb);
  const items: ViewItem[] = rows.map(f => ({ key: f.id, projectId, title: f.title, file: f.file, to: f.to, ref: f.ref }));
  const tb = (
    <ListToolbar shown={rows.length} total={files.length} noun="documents" search={{ value: q, onChange: setQ, placeholder: 'Title, file name, reference' }}
        layout={{ value: layout === 'grid' ? 'tiles' : 'list', onChange: v => setL(v === 'tiles' ? 'grid' : 'list') }}
        filters={[
          { id: 'cat', label: 'Category', quick: true, value: cat, anyLabel: 'All files', onChange: v => setCat(v as ProjectDocCategory | ''), options: CATEGORIES.filter(c => files.some(f => f.category === c)).map(c => ({ id: c, label: c, count: files.filter(f => f.category === c).length })) },
          { id: 'type', label: 'File type', quick: true, value: type, anyLabel: 'Any type', onChange: setType, options: types.map(t => ({ id: t, label: t, count: files.filter(f => kindOf(f.file.name).label === t).length })) },
          { id: 'sort', label: 'Sort', value: sort, defaultValue: 'new', onChange: v => setSort(v as keyof typeof SORTS), options: Object.entries(SORTS).map(([id, label]) => ({ id, label })) }]} />
  );
  const open = (id: string) => { setSel(id); setAt(rows.findIndex(r => r.id === id)); };
  return (
    <div className="dd-lib">
      {layout === 'grid' ? <><div className="dt-toolbar">{tb}</div>{!rows.length ? <p className="vw-label" style={{ padding: 16 }}>No files match.</p> : <div className="dd-tiles">{rows.map(f => (
            <div key={f.id} className={`dd-tile${sel === f.id ? ' is-sel' : ''}`} role="button" tabIndex={0} onClick={() => open(f.id)} onKeyDown={e => { if (e.key === 'Enter') open(f.id); }} title={`${f.title}\n${f.file.name}`}>
              <FileGlyph name={f.file.name} size={58} />
              <b className="dd-tile-name">{f.title}</b>
              <small>{fmtDate(f.file.at)} · {fmtKb(f.file.kb)}</small>
            </div>))}</div>}</>
        : <DataTable rows={rows} pageSize={15} onRow={f => open(f.id)} toolbar={tb} empty={<p className="vw-label" style={{ padding: 16 }}>No files match.</p>} cols={[
            { key: 't', header: 'Document', sort: f => f.title, wrap: true, render: f => <span className="row" style={{ gap: 10, alignItems: 'flex-start' }}><FileGlyph name={f.file.name} size={26} /><span className="cell-2"><b>{f.title}</b><small className="dd-fname">{f.file.name}</small></span></span> },
            { key: 'c', header: 'Category', sort: f => f.category, render: f => <Chip tone={f.uploaded ? 'info' : 'neutral'} size="xs">{f.category}</Chip> },
            { key: 'r', header: 'Reference', sort: f => f.ref ?? '', render: f => f.to ? <Link className="ent-link mono" to={f.to} onClick={e => e.stopPropagation()}>{f.ref ?? 'record'}</Link> : <span className="mono">{f.ref ?? '—'}</span> },
            { key: 'a', header: 'Added', sort: f => f.file.at, render: f => <span className="cell-2"><span className="nowrap">{fmtDate(f.file.at)}</span><small className="nowrap">{f.file.by}</small></span> },
            { key: 'k', header: 'Size', sort: f => f.file.kb, render: f => <span className="nowrap">{fmtKb(f.file.kb)} · {extOf(f.file.name).toUpperCase()}</span> }]} />}
      {at >= 0 && <DocViewer view={view} items={items} index={at} onIndex={i => { setAt(i); setSel(rows[i]?.id ?? ''); }} onClose={() => setAt(-1)} />}
    </div>
  );
}
function AttachModal({ target, title, onClose, onDone, library }: { target: { kind: 'permit' | 'doc' | 'project'; id: string }; title: string; onClose: () => void; onDone: (t: string) => void; library?: boolean }) {
  const [file, setFile] = useState<{ name: string; kb: number } | null>(null);
  const [label, setLabel] = useState(library ? '' : 'Correspondence');
  const [cat, setCat] = useState<ProjectDocCategory>('Other');
  const [err, setErr] = useState('');
  const go = () => file && attachDeliveryFile(target, { name: file.name, kb: file.kb, label, title: label || file.name, category: cat }).then(() => onDone(`${file.name} attached`)).catch(e => setErr(String(e.message ?? e)));
  return (
    <Modal open onClose={onClose} title={`Attach to ${title}`} sub="Prototype: the file's name and size are recorded; its contents are not stored." foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" disabled={!file} onClick={go}>Attach</Btn></>}>
      <div className="dcim-form">
        <Field label="File" required style={{ gridColumn: '1 / -1' }}><input className="input" type="file" onChange={e => { const f = e.target.files?.[0]; setFile(f ? { name: f.name, kb: f.size / 1024 } : null); }} /></Field>
        {library ? <>
          <Field label="Title" style={{ gridColumn: '1 / -1' }}><input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Site survey report" /></Field>
          <Field label="Category" style={{ gridColumn: '1 / -1' }}><select className="select" value={cat} onChange={e => setCat(e.target.value as ProjectDocCategory)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
        </> : <Field label="What it is" style={{ gridColumn: '1 / -1' }}><select className="select" value={label} onChange={e => setLabel(e.target.value)}>{['Correspondence', 'Inspection report', 'Supporting drawings', 'Fee receipt', 'Markup', 'Calculation', 'Other'].map(c => <option key={c}>{c}</option>)}</select></Field>}
        {err && <p className="dcim-err" style={{ gridColumn: '1 / -1' }}>{err}</p>}
      </div>
    </Modal>
  );
}

const isoDay = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : '');
const fromDay = (s: string) => (s ? new Date(`${s}T12:00:00`).getTime() : 0);

/* ---- permit drawer: dates, validity, files, the next step, edit */
export function PermitDrawer({ permit: p, project, onClose, toast }: { permit: Permit; project?: Pick<DeliveryProject, 'id' | 'name' | 'dcId'>; onClose: () => void; toast: (t: string, b?: string) => void }) {
  const [mode, setMode] = useState<'' | 'grant' | 'reject' | 'edit' | 'attach'>('');
  const [ref, setRef] = useState(p.ref ?? ''); const [note, setNote] = useState(''); const [exp, setExp] = useState(isoDay(p.expires)); const [owner, setOwner] = useState(p.owner); const [due, setDue] = useState(isoDay(p.due)); const [notes, setNotes] = useState(p.notes ?? '');
  const [err, setErr] = useState('');
  const run = (f: () => Promise<unknown>, ok: string) => { setErr(''); f().then(t => { toast(ok, typeof t === 'string' ? t : undefined); setMode(''); }).catch(e => setErr(String(e.message ?? e))); };
  const steps: [string, number | undefined, boolean][] = [['Needed by', p.due, true], ['Filed', p.submitted, !!p.submitted], ['Granted', p.granted, !!p.granted], ['Valid to', p.expires, !!p.expires]];
  const actions = <>
    {(p.state === 'To submit' || p.state === 'Rejected') && <Btn variant="filled" icon={I.Send} onClick={() => run(() => permitAction(p.id, 'submit', {}), p.state === 'Rejected' ? 'Permit re-filed' : 'Permit filed')}>{p.state === 'Rejected' ? 'Re-file' : 'File with authority'}</Btn>}
    {p.state === 'Submitted' && <><Btn variant="filled" icon={I.BadgeCheck} onClick={() => setMode('grant')}>Record grant</Btn><Btn icon={I.Ban} onClick={() => setMode('reject')}>Record refusal</Btn></>}
    {(p.state === 'Expired' || expiringSoon(p)) && <Btn variant="filled" icon={I.RotateCw} onClick={() => run(() => permitAction(p.id, 'renew', {}), 'Renewal filed')}>File renewal</Btn>}
    {p.state === 'To submit' && <Btn onClick={() => run(() => permitAction(p.id, 'not-needed', {}), 'Marked not needed')}>Not needed</Btn>}
    <Btn icon={I.Pencil} onClick={() => setMode('edit')}>Edit</Btn>
    <Btn icon={I.Paperclip} onClick={() => setMode('attach')}>Attach</Btn>
  </>;
  return (
    <Drawer open onClose={onClose} width={600} title={p.name} sub={<><Chip tone={PERMIT_TONE[p.state]} dot>{p.state}</Chip> <span className="muted">{p.type} · {p.authority}</span></>} foot={<div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{actions}</div>}>
      <div className="dd-drawer">
        <ol className="dd-steps">{steps.map(([l, t, on]) => <li key={l} className={on ? 'is-on' : ''}><span className="dd-dot" /><b>{l}</b><small>{t ? fmtDate(t) : '—'}</small></li>)}</ol>
        <KV cols={2} items={[['Reference', <span className="mono">{p.ref ?? 'not filed yet'}</span>], ['Validity', <Validity p={p} />], ['Project', project ? <Link className="ent-link" to={`/delivery/projects/${project.id}?tab=permits`}>{project.name}</Link> : p.projectId], ['Site', project?.dcId ?? '—'], ['Owner', p.owner], ['Permit id', <span className="mono">{p.id}</span>]]} />
        {p.notes && <p className="dd-note"><I.MessageSquareText size={14} /> {p.notes}</p>}
        {mode === 'grant' && <section className="dd-form"><h4>Record the grant</h4><div className="dcim-form">
          <Field label="Authority reference"><input className="input mono" value={ref} onChange={e => setRef(e.target.value)} /></Field>
          <Field label="Valid to" hint="Blank = the usual validity for this type"><input className="input" type="date" value={exp} onChange={e => setExp(e.target.value)} /></Field>
          <Field label="Conditions" style={{ gridColumn: '1 / -1' }}><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Re-inspection after the hall is commissioned" /></Field>
        </div><div className="row" style={{ gap: 8 }}><Btn variant="filled" onClick={() => run(() => permitAction(p.id, 'grant', { ref, expires: fromDay(exp) || undefined, note }), 'Grant recorded')}>Save grant</Btn><Btn onClick={() => setMode('')}>Cancel</Btn></div></section>}
        {mode === 'reject' && <section className="dd-form"><h4>Record the refusal</h4><Field label="Why the authority refused it" required><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Fire separation drawings incomplete" autoFocus /></Field>
          <div className="row" style={{ gap: 8 }}><Btn variant="filled" disabled={!note.trim()} onClick={() => run(() => permitAction(p.id, 'reject', { note }), 'Refusal recorded')}>Save refusal</Btn><Btn onClick={() => setMode('')}>Cancel</Btn></div></section>}
        {mode === 'edit' && <section className="dd-form"><h4>Edit</h4><div className="dcim-form">
          <Field label="Authority reference"><input className="input mono" value={ref} onChange={e => setRef(e.target.value)} /></Field>
          <Field label="Owner"><select className="select" value={owner} onChange={e => setOwner(e.target.value)}>{[...new Set([p.owner, ...activeGeoPeople()])].map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Needed by"><input className="input" type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
          <Field label="Valid to"><input className="input" type="date" value={exp} disabled={!p.granted} onChange={e => setExp(e.target.value)} /></Field>
          <Field label="Notes" style={{ gridColumn: '1 / -1' }}><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        </div><div className="row" style={{ gap: 8 }}><Btn variant="filled" onClick={() => run(() => editPermit(p.id, { ref, owner, due: fromDay(due) || undefined, expires: p.granted ? fromDay(exp) : undefined, notes }), 'Permit updated')}>Save</Btn><Btn onClick={() => setMode('')}>Cancel</Btn></div></section>}
        {err && <p className="dcim-err">{err}</p>}
        <h4 className="dd-h">Files <small className="muted">{p.files.length}</small></h4>
        <FileList files={p.files} owner={{ kind: 'permit', id: p.id, projectId: p.projectId, title: p.name }} empty="Nothing filed yet: the application and its drawings appear here once the permit is filed." />
      </div>
      {mode === 'attach' && <AttachModal target={{ kind: 'permit', id: p.id }} title={p.name} onClose={() => setMode('')} onDone={t => { setMode(''); toast(t); }} />}
    </Drawer>
  );
}

/* ---- design document drawer */
export function DocDrawer({ doc: d, project, onClose, toast }: { doc: DesignDoc; project?: Pick<DeliveryProject, 'id' | 'name' | 'dcId'>; onClose: () => void; toast: (t: string, b?: string) => void }) {
  const [mode, setMode] = useState<'' | 'issue' | 'revise' | 'attach'>('');
  const [reviewer, setReviewer] = useState(d.reviewer); const [note, setNote] = useState(''); const [err, setErr] = useState('');
  const run = (f: () => Promise<unknown>, ok: string) => { setErr(''); f().then(t => { toast(ok, typeof t === 'string' ? t : undefined); setMode(''); }).catch(e => setErr(String(e.message ?? e))); };
  const steps: [string, boolean][] = [['Draft', true], ['In review', d.state !== 'Draft'], ['Issued for construction', d.state === 'Issued for construction' || d.state === 'As-built'], ['As-built', d.state === 'As-built']];
  return (
    <Drawer open onClose={onClose} width={600} title={`${d.kind} · rev ${d.rev}`} sub={<><Chip tone={DOC_TONE[d.state]} dot>{d.state}</Chip> <span className="mono muted">{d.number}</span></>}
      foot={<div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {d.state === 'Draft' && <Btn variant="filled" icon={I.Send} onClick={() => run(() => designDocAction(d.id, 'review', { reviewer }), 'Sent for review')}>Send for review</Btn>}
        {d.state === 'In review' && <Btn variant="filled" icon={I.BadgeCheck} onClick={() => setMode('issue')}>Issue for construction</Btn>}
        {d.state === 'Issued for construction' && <Btn icon={I.GitBranch} onClick={() => setMode('revise')}>New revision</Btn>}
        <Btn icon={I.Paperclip} onClick={() => setMode('attach')}>Attach</Btn>
      </div>}>
      <div className="dd-drawer">
        <ol className="dd-steps">{steps.map(([l, on]) => <li key={l} className={on ? 'is-on' : ''}><span className="dd-dot" /><b>{l}</b><small>{l === 'Issued for construction' && d.issued ? fmtDate(d.issued) : l === d.state ? fmtDate(d.updated) : ''}</small></li>)}</ol>
        <KV cols={2} items={[['Discipline', d.discipline], [isDrawing(d) ? 'Drawing sheets' : 'Files', isDrawing(d) ? String(d.sheets) : String(d.files.length)], ['Author', d.author], ['Reviewer', d.reviewer], ['Project', project ? <Link className="ent-link" to={`/delivery/projects/${project.id}?tab=permits`}>{project.name}</Link> : d.projectId], ['Updated', fmtDate(d.updated)]]} />
        {d.notes && <p className="dd-note"><I.MessageSquareText size={14} /> {d.notes}</p>}
        {mode === 'issue' && <section className="dd-form"><h4>Issue for construction (rev {d.rev} → {String.fromCharCode(d.rev.charCodeAt(0) + 1)})</h4><div className="dcim-form">
          <Field label="Reviewed by"><select className="select" value={reviewer} onChange={e => setReviewer(e.target.value)}>{[...new Set([d.reviewer, ...activeGeoPeople()])].filter(x => x !== d.author).map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Note"><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" /></Field></div>
          <div className="row" style={{ gap: 8 }}><Btn variant="filled" onClick={() => run(() => designDocAction(d.id, 'issue', { reviewer, note }), 'Issued for construction')}>Issue</Btn><Btn onClick={() => setMode('')}>Cancel</Btn></div></section>}
        {mode === 'revise' && <section className="dd-form"><h4>Open revision {String.fromCharCode(d.rev.charCodeAt(0) + 1)}</h4><Field label="What changes" required><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Row C moved for the busway tap-offs" autoFocus /></Field>
          <div className="row" style={{ gap: 8 }}><Btn variant="filled" disabled={!note.trim()} onClick={() => run(() => designDocAction(d.id, 'revise', { note }), 'Revision opened')}>Open revision</Btn><Btn onClick={() => setMode('')}>Cancel</Btn></div></section>}
        {err && <p className="dcim-err">{err}</p>}
        <h4 className="dd-h">Revisions and files <small className="muted">{d.files.length}</small></h4>
        <FileList files={d.files} owner={{ kind: 'doc', id: d.id, projectId: d.projectId, title: `${d.kind} ${d.number}` }} />
      </div>
      {mode === 'attach' && <AttachModal target={{ kind: 'doc', id: d.id }} title={`${d.kind} ${d.number}`} onClose={() => setMode('')} onDone={t => { setMode(''); toast(t); }} />}
    </Drawer>
  );
}

/* ---- new permit / new design document */
const AUTH: Record<'in' | 'us', Record<PermitType, string>> = {
  in: { 'Planning / zoning': 'Municipal corporation', Building: 'Municipal corporation', Environmental: 'State pollution control board', Electrical: 'Chief Electrical Inspector (CEIG)', 'Fire / life safety': 'State fire services (Fire NOC)', 'Utility connection': 'State distribution company', Occupancy: 'Municipal corporation', 'Right of way': 'Municipal corporation', Decommission: 'Environment agency' },
  us: { 'Planning / zoning': 'County planning department', Building: 'County building department', Environmental: 'State environmental agency', Electrical: 'Electrical inspector (AHJ)', 'Fire / life safety': 'Fire marshal (AHJ)', 'Utility connection': 'Electric utility', Occupancy: 'County building department', 'Right of way': 'City public works', Decommission: 'State environmental agency' }
};
export function NewPermitModal({ projects, pid, geo = geoNow().id as 'in' | 'us', onClose, onDone }: { projects: Pick<DeliveryProject, 'id' | 'name' | 'manager' | 'state'>[]; pid?: string; geo?: 'in' | 'us'; onClose: () => void; onDone: (t: string) => void }) {
  const open = projects.filter(p => p.state !== 'Delivered');
  const [proj, setProj] = useState(pid ?? open[0]?.id ?? ''); const [type, setType] = useState<PermitType>('Building');
  const [name, setName] = useState(''); const [auth, setAuth] = useState(AUTH[geo].Building); const [due, setDue] = useState(isoDay(clockNow() + 60 * DAY));
  const [owner, setOwner] = useState(projects.find(p => p.id === (pid ?? open[0]?.id))?.manager ?? ''); const [err, setErr] = useState('');
  const go = () => addPermit(proj, { name, type, authority: auth, due: fromDay(due), owner }).then(() => onDone(`${name} added`)).catch(e => setErr(String(e.message ?? e)));
  return (
    <Modal open onClose={onClose} title="New permit" sub="It starts as To file; file it with the authority from the permit." foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" disabled={!name.trim() || !proj || !due} onClick={go}>Add permit</Btn></>}>
      <div className="dcim-form">
        {!pid && <Field label="Project" required style={{ gridColumn: '1 / -1' }}><select className="select" value={proj} onChange={e => { setProj(e.target.value); setOwner(projects.find(p => p.id === e.target.value)?.manager ?? owner); }}>{open.map(p => <option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}</select></Field>}
        <Field label="Permit" required style={{ gridColumn: '1 / -1' }}><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Fire safety approval for hall 3" autoFocus /></Field>
        <Field label="Type"><select className="select" value={type} onChange={e => { const t = e.target.value as PermitType; setType(t); setAuth(AUTH[geo][t]); }}>{PERMIT_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Authority" required><input className="input" value={auth} onChange={e => setAuth(e.target.value)} /></Field>
        <Field label="Needed by" required><input className="input" type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
        <Field label="Owner"><select className="select" value={owner} onChange={e => setOwner(e.target.value)}>{[...new Set([owner, ...activeGeoPeople()])].filter(Boolean).map(x => <option key={x}>{x}</option>)}</select></Field>
        {err && <p className="dcim-err" style={{ gridColumn: '1 / -1' }}>{err}</p>}
      </div>
    </Modal>
  );
}
export function NewDocModal({ projects, pid, onClose, onDone }: { projects: Pick<DeliveryProject, 'id' | 'name' | 'manager' | 'state'>[]; pid?: string; onClose: () => void; onDone: (t: string) => void }) {
  const open = projects.filter(p => p.state !== 'Delivered'); const people = activeGeoPeople();
  const [proj, setProj] = useState(pid ?? open[0]?.id ?? ''); const [kind, setKind] = useState<DesignDoc['kind']>('Floor layout'); const [disc, setDisc] = useState<DesignDiscipline>('Architectural');
  const [title, setTitle] = useState(''); const [author, setAuthor] = useState(people[3] ?? ''); const [reviewer, setReviewer] = useState(people[5] ?? ''); const [err, setErr] = useState('');
  const DEF: Partial<Record<DesignDoc['kind'], DesignDiscipline>> = { 'Single-line diagram': 'Electrical', 'Cooling P&ID': 'Mechanical', 'Floor layout': 'Architectural', 'Cable schedule': 'Network' };
  const go = () => addDesignDoc(proj, { kind, discipline: disc, title, author, reviewer }).then(() => onDone(`${kind} added as a draft`)).catch(e => setErr(String(e.message ?? e)));
  return (
    <Modal open onClose={onClose} title="New design document" sub="It starts as a draft at revision A; send it for review, then issue it for construction." foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" disabled={!proj || author === reviewer} onClick={go}>Add document</Btn></>}>
      <div className="dcim-form">
        {!pid && <Field label="Project" required style={{ gridColumn: '1 / -1' }}><select className="select" value={proj} onChange={e => setProj(e.target.value)}>{open.map(p => <option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}</select></Field>}
        <Field label="Type"><select className="select" value={kind} onChange={e => { const k = e.target.value as DesignDoc['kind']; setKind(k); if (DEF[k]) setDisc(DEF[k]!); }}>{DOC_KINDS.map(k => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Discipline"><select className="select" value={disc} onChange={e => setDisc(e.target.value as DesignDiscipline)}>{DISCIPLINES.map(k => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Title" style={{ gridColumn: '1 / -1' }}><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder={`Blank = ${kind}`} /></Field>
        <Field label="Author"><select className="select" value={author} onChange={e => setAuthor(e.target.value)}>{people.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Reviewer" error={author === reviewer ? 'Someone other than the author' : undefined}><select className="select" value={reviewer} onChange={e => setReviewer(e.target.value)}>{people.map(x => <option key={x}>{x}</option>)}</select></Field>
        {err && <p className="dcim-err" style={{ gridColumn: '1 / -1' }}>{err}</p>}
      </div>
    </Modal>
  );
}

/* ---- the project page's Documents tab: permits, design documents and the project's document library */
export function ProjectDocuments({ project, permits, docs, files, toast, view }: { project: DeliveryProject; permits: Permit[]; docs: DesignDoc[]; files: ProjectDocument[]; toast: (t: string, b?: string) => void; view?: DeliveryProjectView }) {
  const [pm, setPm] = useState(''); const [dd, setDd] = useState(''); const [form, setForm] = useState<'' | 'permit' | 'doc' | 'attach'>('');
  const geo = geoNow().id as 'in' | 'us';
  const open = project.state !== 'Delivered';
  const permit = permits.find(x => x.id === pm), doc = docs.find(x => x.id === dd);
  const proj = { id: project.id, name: project.name, dcId: project.dcId };
  return (
    <div className="dd-proj">
      <Panel title="Permits" icon={I.Stamp} flush sub={permits.length ? `${permits.filter(p => p.state === 'Granted').length} of ${permits.length} granted${permits.some(neededSoon) ? ` · ${permits.filter(neededSoon).length} needed within 30 days` : ''}` : undefined}
        info="Permits this project needs from the authorities: type, reference once filed, the date the work needs it by, validity once granted, and the files on record. Click a permit to file it, record the decision or attach files."
        actions={<>{open && <Btn size="sm" icon={I.Plus} onClick={() => setForm('permit')}>New permit</Btn>}<Link className="panel-link" to="/delivery?tab=permits">Permit register</Link></>}>
        {permits.length ? <DataTable rows={[...permits].sort(permitNow)} pageSize={10} onRow={x => setPm(x.id)} cols={permitCols()} /> : <p className="vw-label" style={{ padding: 16 }}>No permit needed for this scope.</p>}
      </Panel>
      <Panel title="Design documents" icon={I.DraftingCompass} flush sub={`${docs.filter(d => d.state === 'Issued for construction' || d.state === 'As-built').length} of ${docs.length} issued · ${plural(docs.filter(isDrawing).reduce((a, d) => a + d.sheets, 0), 'drawing sheet')}`}
        info="The design set the work is built to: drawing number, discipline, revision, author and reviewer. Work proceeds on documents issued for construction; earlier revisions are kept as superseded files."
        actions={<>{open && <Btn size="sm" icon={I.Plus} onClick={() => setForm('doc')}>New document</Btn>}<Link className="panel-link" to="/delivery?tab=design">Design register</Link></>}>
        <DataTable rows={[...docs].sort((a, b) => DOC_RANK[a.state] - DOC_RANK[b.state] || b.updated - a.updated)} pageSize={10} onRow={x => setDd(x.id)} cols={docCols()} />
      </Panel>
      <Panel title="Project documents" icon={I.FolderOpen} flush sub={`${files.length} documents · ${fmtKb(files.reduce((a, f) => a + f.file.kb, 0))}`}
        info="Every record the project produced, newest first: the approved plan pack, purchase orders and goods receipts, permit approvals, issued drawings, method statements and completion sign-offs, test certificates, change orders and the handover pack, plus files attached by hand."
        actions={<Btn size="sm" icon={I.Upload} onClick={() => setForm('attach')}>Attach document</Btn>}
        >
        <FileLibrary files={files} projectId={project.id} view={view} />
      </Panel>
      {permit && <PermitDrawer permit={permit} project={proj} onClose={() => setPm('')} toast={toast} />}
      {doc && <DocDrawer doc={doc} project={proj} onClose={() => setDd('')} toast={toast} />}
      {form === 'permit' && <NewPermitModal projects={[project]} pid={project.id} geo={geo} onClose={() => setForm('')} onDone={t => { setForm(''); toast(t); }} />}
      {form === 'doc' && <NewDocModal projects={[project]} pid={project.id} onClose={() => setForm('')} onDone={t => { setForm(''); toast(t); }} />}
      {form === 'attach' && <AttachModal library target={{ kind: 'project', id: project.id }} title={project.name} onClose={() => setForm('')} onDone={t => { setForm(''); toast(t); }} />}
    </div>
  );
}
