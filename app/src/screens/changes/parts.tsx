import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, createChange, getDatacenters, getNetworkElements, previewChangeImpact, setChangeStatus, useQuery, defaultDcId } from '../../api';
import type { Change, ChangeStatus } from '../../api/types';
import { Btn, Chip, Field, Info, KV, SearchBox, CheckBox } from '../../ui/kit';

export const RISK_TONE = { Low: 'success', Medium: 'warning', High: 'error' } as const;
import { DcLink, IncLink, NeLink } from '../../ui/status';
import { fmtDateTime, fmtMoney } from '../../lib/format';
import { fmtHm } from '../ops/shared';

/* Reusable parts of the former Changes & maintenance screen (kept for Change management, P2B merge phase 6). */
export function Transitions({ c }: { c: Change }) {
  const go = (to: ChangeStatus) => setChangeStatus(c.id, to);
  const b: React.ReactNode[] = [];
  if (c.status === 'Draft') b.push(<Btn key="s" variant="filled" onClick={() => go('Pending approval')}>Submit for approval</Btn>);
  if (c.status === 'Pending approval') b.push(<Btn key="r" variant="danger-subtle" onClick={() => go('Rejected')}>Reject</Btn>, <Btn key="a" variant="filled" icon={I.ShieldCheck} onClick={() => go('Approved')}>Approve</Btn>);
  if (c.status === 'Approved') b.push(<Btn key="st" variant="filled" icon={I.Play} onClick={() => go('In progress')}>Start implementation</Btn>);
  if (c.status === 'In progress') b.push(<Btn key="rb" icon={I.Undo2} onClick={() => go('Rolled back')}>Roll back</Btn>, <Btn key="c" variant="filled" icon={I.Check} onClick={() => go('Completed')}>Complete & verify</Btn>);
  return b.length ? <>{b}</> : <span className="faint" style={{ fontSize: 12.5 }}>No further transitions — {c.status.toLowerCase()}.</span>;
}

export function ChangeBody({ c }: { c: Change }) {
  const { data: im } = useQuery(() => previewChangeImpact(c.scope, c.dcId, c.id), [c.id, c.scope.join(',')]);
  return (
    <div className="col" style={{ gap: 18 }}>
      <KV cols={2} items={[
        ['Kind', c.kind], ['Datacenter', <DcLink id={c.dcId} />], ['Window', <span className="num">{fmtDateTime(c.windowStart)} → {fmtDateTime(c.windowEnd).slice(12)}</span>], ['Duration', fmtHm((c.windowEnd - c.windowStart) / 60000)],
        ['Requester', c.requester], ['Approver', c.approver ?? '—'], ['Rollback plan', c.rollback], ['Linked incident', c.incidentId ? <IncLink id={c.incidentId} /> : '—']
      ]} />
      <div><div className="ops-label">Scope</div>{c.scope.length ? <div className="row wrap" style={{ gap: 6 }}>{c.scope.map(s => <NeLink key={s} id={s} />)}</div> : <span className="muted" style={{ fontSize: 13 }}>Facility systems only — no network element in scope.</span>}</div>
      <ImpactPreview im={im} self={c.id} />
    </div>
  );
}

type Impact = Awaited<ReturnType<typeof previewChangeImpact>>;
export function ImpactPreview({ im: raw, self }: { im?: Impact; self?: string }) {
  const im = raw && { ...raw, conflicts: raw.conflicts.filter(x => x.id !== self) };
  if (!im) return <div className="faint" style={{ fontSize: 13 }}><span className="spinner" style={{ verticalAlign: -3, marginRight: 8 }} />Mapping dependencies…</div>;
  return (
    <div className="impact-box">
      <div className="row between"><div className="ops-label" style={{ margin: 0 }}>Dependency impact<Info text="What the scoped devices carry (links, services, customers, premium customers, monthly revenue) plus overlapping windows and open incidents on the same devices. Score = 6 per device + 3 per service + 8 per premium customer + 10 per overlap + 15 per open incident, max 100; 55+ High, 25+ Medium." /></div><span className="row" style={{ gap: 8 }}><span className="faint" style={{ fontSize: 12 }}>risk score <b className="num">{im.score}</b>/100</span><Chip size="xs" tone={RISK_TONE[im.risk]}>{im.risk} risk</Chip></span></div>
      <div className="bar" style={{ height: 6 }}><i style={{ width: `${im.score}%`, background: im.risk === 'High' ? 'var(--vw-color-red-500)' : im.risk === 'Medium' ? 'var(--vw-color-amber-500)' : 'var(--vw-color-emerald-500)' }} /></div>
      <div className="grid g-3 impact-stats">
        <div><span>Network elements</span><b className="num">{im.nes}</b></div><div><span>Physical links</span><b className="num">{im.links}</b></div><div><span>Services</span><b className="num">{im.services}</b></div>
        <div><span>Customers</span><b className="num">{im.customers}</b></div><div><span>Premium customers</span><b className={`num ${im.premium ? 'bad' : ''}`}>{im.premium}</b></div><div><span>Revenue on scope / mo</span><b className="num">{fmtMoney(im.revenue)}</b></div>
      </div>
      {im.conflicts.length > 0 && <div className="note note--warn"><I.CalendarX size={14} /><span>Overlaps {im.conflicts.map(x => x.id).join(', ')} on the same devices.</span></div>}
      {im.openInc.length > 0 && <div className="note note--bad"><I.Siren size={14} /><span>Open incident on scope: {im.openInc.map(x => <IncLink key={x.id} id={x.id} />)} — coordinate with the incident owner.</span></div>}
      {!im.conflicts.length && !im.openInc.length && <div className="note note--good"><I.CircleCheck size={14} /><span>No conflicting window or open incident on this scope.</span></div>}
    </div>
  );
}

const toLocal = (t: number) => { const d = new Date(t); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export function NewChange({ kind, onDone }: { kind: 'change' | 'maintenance'; onDone: (id: string) => void }) {
  const now = clockNow();
  const start0 = new Date(now + 2 * 86400000); start0.setHours(22, 0, 0, 0);
  const [dcId, setDc] = useState(defaultDcId());
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [ws, setWs] = useState(toLocal(start0.getTime()));
  const [we, setWe] = useState(toLocal(start0.getTime() + 4 * 3600000));
  const [rollback, setRb] = useState('');
  const { data: dcs } = useQuery(getDatacenters, []);
  const { data: nes } = useQuery(() => getNetworkElements({ dcId }), [dcId]);
  const { data: im } = useQuery(() => previewChangeImpact(scope, dcId), [dcId, scope.join(',')]);
  const cands = (nes ?? []).filter(n => n.discovery !== 'not-discovered' && (!q || `${n.id} ${n.model} ${n.ip}`.toLowerCase().includes(q.toLowerCase())));
  const valid = title.trim().length > 4 && new Date(we).getTime() > new Date(ws).getTime() && rollback.trim().length > 2;
  const submit = async () => {
    const id = await createChange({ kind: kind === 'maintenance' ? 'Maintenance' : 'Change', title: title.trim(), dcId, scope, windowStart: new Date(ws).getTime(), windowEnd: new Date(we).getTime(), rollback: rollback.trim() });
    onDone(id);
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="grid g-2">
        <Field label="Datacenter" required><select className="select" style={{ width: '100%' }} value={dcId} onChange={e => { setDc(e.target.value); setScope([]); }}>{(dcs ?? []).map(d => <option key={d.id} value={d.id}>{d.id} · {d.city}</option>)}</select></Field>
        <Field label="Title" required><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === 'maintenance' ? 'e.g. UPS battery string replacement' : 'e.g. Replace SFP on xe-0/0/3'} /></Field>
        <Field label="Window start" required><input className="input" type="datetime-local" value={ws} onChange={e => setWs(e.target.value)} /></Field>
        <Field label="Window end" required error={new Date(we).getTime() <= new Date(ws).getTime() ? 'End must be after start' : undefined}><input className="input" type="datetime-local" value={we} onChange={e => setWe(e.target.value)} /></Field>
      </div>
      <Field label={`Scope — network elements (${scope.length} selected)`} hint="Only discovered devices can be scoped; facility work can leave this empty.">
        <div className="scope-pick">
          <SearchBox value={q} onChange={setQ} placeholder={`Search ${dcId} devices`} />
          {scope.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{scope.map(s => <button key={s} type="button" className="vw-chip vw-chip--info chip-xs scope-chip" onClick={() => setScope(scope.filter(x => x !== s))}>{s.replace(`${dcId}-`, '')}<I.X size={11} /></button>)}</div>}
          <div className="scope-list">{cands.slice(0, 60).map(n => (
            <label key={n.id} className="scope-row"><CheckBox on={scope.includes(n.id)} onChange={v => setScope(v ? [...scope, n.id] : scope.filter(x => x !== n.id))} label={n.id} />
              <span className="mono" style={{ flex: 1 }}>{n.id.replace(`${dcId}-`, '')}</span><span className="faint">{n.role} · {n.model}</span></label>))}
            {cands.length > 60 && <div className="faint" style={{ padding: 8, fontSize: 12 }}>{cands.length - 60} more — refine the search</div>}
          </div>
        </div>
      </Field>
      <Field label="Rollback plan" required><textarea className="input" rows={2} value={rollback} onChange={e => setRb(e.target.value)} placeholder="How the change is reversed if verification fails" /></Field>
      <ImpactPreview im={im} />
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><Link to="/changes" className="nst-btn nst-btn--sm">Cancel</Link><Btn variant="filled" icon={I.Send} disabled={!valid} onClick={submit}>Submit for approval</Btn></div>
    </div>
  );
}

