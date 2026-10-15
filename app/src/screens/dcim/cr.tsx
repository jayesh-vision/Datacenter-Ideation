/* DCIM change control (15-Oct-2026, user: "every DCIM change should be tagged with a CR created in Change management").
   `useCrField` is the "Change request" section every DCIM form carries; `useCrGate` wraps one-click actions (disconnect, swap, release,
   retire, status) in a small dialog with the same section. Three ways to authorise an edit:
   - Standard change: pre-approved record work (patch cords, space holds, port labels, hot-swap PSU / fan) — raised and closed with the edit;
   - an open change request at the site: approved / in progress = applied now; not yet approved = saved as planned work under it;
   - a new change request raised from here (Pending approval): the edit waits as planned work and runs from DCIM once approved. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { cancelDcimWork, clockNow, executeDcimWork, getDcimCrOptions, useQuery } from '../../api';
import type { DcimCr, DcimRunResult, DcimWorkItem } from '../../api/types';
import { Btn, Chip, Field, Modal, Seg } from '../../ui/kit';
import { fmtDateTime } from '../../lib/format';

type Mode = 'standard' | 'use' | 'raise';
const pad = (n: number) => String(n).padStart(2, '0');
const toLocal = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/* the next maintenance window: 22:00 tonight, or tomorrow when it is already late */
const nextWindow = () => { const d = new Date(clockNow()); d.setMinutes(0, 0, 0); if (d.getHours() >= 20) d.setDate(d.getDate() + 1); d.setHours(22); return d.getTime(); };

export function useCrField(dcId: string, std: boolean, open = true) {
  const { data: opts } = useQuery(() => (open && dcId ? getDcimCrOptions(dcId) : Promise.resolve([])), [dcId, open]);
  const [mode, setMode] = useState<Mode>(std ? 'standard' : 'use');
  const [pick, setPick] = useState('');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(() => toLocal(nextWindow()));
  const [hours, setHours] = useState(4);
  const [rollback, setRollback] = useState('Reverse the DCIM change and return the records to their state before the window');
  useEffect(() => { if (open) { setMode(std ? 'standard' : 'use'); setPick(''); setTitle(''); setStart(toLocal(nextWindow())); setHours(4); } }, [open, dcId, std]);
  const list = opts ?? [];
  /* with nothing open at the site, "use" has nothing to offer: raise one instead */
  const m: Mode = mode === 'standard' && !std ? 'use' : mode === 'use' && opts && !list.length ? 'raise' : mode;
  const sel = list.find(o => o.id === pick) ?? list.find(o => o.applies === 'now' && !o.blocked) ?? list[0];
  const value: DcimCr | null = m === 'standard' ? { standard: true }
    : m === 'use' ? (sel ? { changeId: sel.id } : null)
    : rollback.trim().length >= 3 && hours > 0 ? { raise: { title: title.trim() || undefined, windowStart: new Date(start).getTime(), hours, rollback: rollback.trim() } } : null;
  const blocked = m === 'use' && sel?.applies === 'now' ? sel.blocked : undefined;
  const ok = !!value && !blocked;
  /* what pressing the button will do, said in the form */
  const effect = m === 'standard' ? 'Applied now under a standard change (pre-approved), recorded in Change management.'
    : m === 'use' ? (sel ? (sel.applies === 'now' ? `Applied now under ${sel.id} (${sel.status.toLowerCase()}).` : `Saved as planned work under ${sel.id}; it runs from DCIM once ${sel.id} is approved.`) : '')
    : 'A new change request goes to Change management for approval; the edit is saved as planned work and runs from DCIM once approved.';
  const node: ReactNode = (
    <section className="dcim-cr" data-cr-field>
      <div className="dcim-cr-head"><b><I.GitPullRequestArrow size={14} />Change request</b>
        <Seg size="sm" value={m} onChange={v => setMode(v)} options={[...(std ? [{ id: 'standard' as Mode, label: 'Standard change' }] : []), { id: 'use' as Mode, label: `Open CR${opts ? ` (${list.length})` : ''}` }, { id: 'raise' as Mode, label: 'Raise new' }]} />
      </div>
      {m === 'standard' && <p className="dcim-cr-note"><Chip tone="success" size="xs">Pre-approved</Chip>Low-risk record work under the standard templates in Change management.</p>}
      {m === 'use' && (list.length ? <>
        <select className="select" value={sel?.id ?? ''} onChange={e => setPick(e.target.value)} aria-label="Change request">
          {list.some(o => o.applies === 'now') && <optgroup label="Approved: applies now">{list.filter(o => o.applies === 'now').map(o => <option key={o.id} value={o.id}>{o.id} · {o.title}{o.blocked ? ' (on hold)' : ''}</option>)}</optgroup>}
          {list.some(o => o.applies === 'staged') && <optgroup label="Awaiting approval: saved as planned work">{list.filter(o => o.applies === 'staged').map(o => <option key={o.id} value={o.id}>{o.id} · {o.title} ({o.status.toLowerCase()})</option>)}</optgroup>}
        </select>
        {sel && <p className="dcim-cr-note"><Chip size="xs" tone={sel.applies === 'now' ? 'success' : 'warning'}>{sel.status}</Chip>{sel.cls} · {sel.source} · window {fmtDateTime(sel.windowStart)}<Link className="ent-link" to={`/changes/${encodeURIComponent(sel.id)}`} target="_blank">Open</Link></p>}
      </> : <p className="dcim-cr-note">{opts ? 'No open change request at this site.' : 'Loading change requests…'}</p>)}
      {m === 'raise' && <div className="dcim-form">
        <Field label="Title" hint="Blank = the edit itself" style={{ gridColumn: '1 / -1' }}><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Q4 expansion: new GPU rack in Hall A" /></Field>
        <Field label="Window starts"><input className="input" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="Duration (hours)" error={hours <= 0 || hours > 72 ? '1–72 h' : undefined}><input className="input" type="number" min={1} max={72} value={hours} onChange={e => setHours(Number(e.target.value))} /></Field>
        <Field label="Rollback plan" required style={{ gridColumn: '1 / -1' }} error={rollback.trim().length < 3 ? 'Required' : undefined}><input className="input" value={rollback} onChange={e => setRollback(e.target.value)} /></Field>
      </div>}
      {blocked ? <p className="dcim-err"><I.OctagonX size={13} /> {sel!.id} is on hold: {blocked}</p> : effect && <p className="dcim-cr-effect"><I.Info size={13} />{effect}</p>}
    </section>
  );
  return { value, ok, node };
}

/* the toast line after a gated edit */
export function crOutcome(r: DcimRunResult, done: string): [string, string, { to: string; label: string }] {
  return r.staged
    ? [`Planned under ${r.changeId}`, `${done} — saved as planned work. It runs from DCIM once ${r.changeId} is approved.`, { to: `/changes/${encodeURIComponent(r.changeId)}`, label: `Open ${r.changeId}` }]
    : [done, `Recorded under ${r.changeId}.`, { to: `/changes/${encodeURIComponent(r.changeId)}`, label: `Open ${r.changeId}` }];
}

/* one-click actions: ask for the change request, then run */
type Ask = { title: string; sub?: string; dcId: string; std: boolean; verb: string; run: (cr: DcimCr) => Promise<DcimRunResult>; done: string; onDone?: (r: DcimRunResult) => void };
export function useCrGate(toast: { show: (t: string, b?: string, l?: { to: string; label: string }) => void }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [err, setErr] = useState('');
  const cr = useCrField(ask?.dcId ?? '', !!ask?.std, !!ask);
  const node = useMemo(() => ask ? (
    <Modal open onClose={() => setAsk(null)} width={560} title={ask.title} sub={ask.sub}
      foot={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn variant="filled" icon={I.GitPullRequestArrow} disabled={!cr.ok} onClick={() => cr.value && ask.run(cr.value).then(r => { setAsk(null); toast.show(...crOutcome(r, ask.done)); ask.onDone?.(r); }).catch(e => setErr(String(e?.message ?? e)))}>{ask.verb}</Btn></>}>
      {cr.node}
      {err && <p className="dcim-err" style={{ marginTop: 10 }}>{err}</p>}
    </Modal>) : null, [ask, cr.node, cr.ok, cr.value, err, toast]);
  return { open: (a: Ask) => { setErr(''); setAsk(a); }, node };
}

/* the CR a record was last changed under */
export function CrChip({ id, title }: { id?: string; title?: string }) {
  if (!id) return null;
  return <Link className="dcim-crchip" to={`/changes/${encodeURIComponent(id)}`} title={title ?? `Last changed under ${id}`} onClick={e => e.stopPropagation()}><I.GitPullRequestArrow size={12} />{id}</Link>;
}

/* the toast after a gated form: planned work names its CR; applied work says what changed, under which CR */
export function showCr(toast: { show: (t: string, b?: string, l?: { to: string; label: string }) => void }, t: string, r?: DcimRunResult, body?: string) {
  if (r?.staged) toast.show(...crOutcome(r, t));
  else toast.show(t, [r ? `Recorded under ${r.changeId}.` : '', body ?? ''].filter(Boolean).join(' '), r ? { to: `/changes/${encodeURIComponent(r.changeId)}`, label: `Open ${r.changeId}` } : undefined);
}

/* DCIM work items under their CRs: planned work runs here once its CR is approved */
const ITEM_TONE = { Planned: 'warning', Done: 'success', Failed: 'error', Cancelled: 'neutral' } as const;
export function CrWorkList({ items, compact }: { items: DcimWorkItem[]; compact?: boolean }) {
  const [err, setErr] = useState<Record<string, string>>({});
  const go = (p: Promise<unknown>, id: string) => p.then(() => setErr(e => ({ ...e, [id]: '' }))).catch(e => setErr(x => ({ ...x, [id]: String(e?.message ?? e) })));
  return (
    <ul className={`dcim-work${compact ? ' is-compact' : ''}`}>
      {items.map(it => {
        const live = it.cr && (it.cr.status === 'Approved' || it.cr.status === 'In progress');
        const open = it.state === 'Planned' || it.state === 'Failed';
        return (
          <li key={it.id} data-work={it.id}>
            <span className="cell-2"><b>{it.label}</b>
              <small><CrChip id={it.changeId} title={it.cr?.title} />{it.cr ? ` ${it.cr.status}` : ''}{it.state === 'Done' && it.doneAt ? ` · done ${fmtDateTime(it.doneAt)}` : ` · planned ${fmtDateTime(it.created)}`}</small>
              {(err[it.id] || it.error) && <small className="dcim-err">{err[it.id] || it.error}</small>}
            </span>
            <Chip size="xs" tone={ITEM_TONE[it.state]} dot>{it.state}</Chip>
            {open && <span className="dcim-work-acts">
              <Btn size="xs" variant="filled" icon={I.Play} disabled={!live || !!it.cr?.blocked} title={!live ? `${it.changeId} is ${it.cr?.status.toLowerCase() ?? 'unknown'}: approve it in Change management first` : it.cr?.blocked} onClick={() => go(executeDcimWork(it.id), it.id)}>Execute</Btn>
              <Btn size="xs" icon={I.X} title="Cancel this planned work" onClick={() => go(cancelDcimWork(it.id), it.id)}>Cancel</Btn>
            </span>}
          </li>
        );
      })}
    </ul>
  );
}
