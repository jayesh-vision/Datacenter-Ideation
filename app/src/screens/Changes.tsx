import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, createChange, getChanges, getDatacenters, getNetworkElements, previewChangeImpact, setChangeStatus, useQuery } from '../api';
import type { Change, ChangeStatus } from '../api/types';
import { usePage, PageHead, Loading } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { Btn, Chip, Drawer, Field, KV, SearchBox, CheckBox } from '../ui/kit';
import { ListToolbar, useParamPatch } from '../ui/ListToolbar';
import { ChangeChip, DcLink, IncLink, NeLink } from '../ui/status';
import { fmtDateTime, fmtINR } from '../lib/format';
import { fmtHm } from './ops/shared';
import { Facts, MiniBars, SoftMeter, Split, StatGrid, StatTile, type Tone } from '../ui/Analytics';
import { fmtDur } from '../lib/format';

type Kind = 'all' | 'change' | 'maintenance';
const STATUSES: ChangeStatus[] = ['Draft', 'Pending approval', 'Approved', 'In progress', 'Completed', 'Rolled back', 'Rejected'];
const RISK_TONE = { Low: 'success', Medium: 'warning', High: 'error' } as const;

/* Change & maintenance (DC-OPS-005/007, WF-06): dependency-aware impact
   preview, approval and implementation transitions. */
export function Changes() {
  const [sp, setSp] = useSearchParams();
  const applyParams = useParamPatch();
  const kind = (sp.get('kind') ?? 'all') as Kind, status = sp.get('status') ?? '', q = sp.get('q') ?? '', openId = sp.get('id'), isNew = sp.get('new') as 'change' | 'maintenance' | null;
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
  usePage([{ label: 'Operate' }, { label: 'Changes & maintenance' }]);
  const { data: all, reload } = useQuery(() => getChanges({}), []);
  const now = clockNow();
  const rows = useMemo(() => (all ?? []).filter(c => (kind === 'all' || c.kind.toLowerCase() === kind) && (!status || c.status === status) && (!q || `${c.id} ${c.title} ${c.dcId} ${c.requester}`.toLowerCase().includes(q.toLowerCase()))), [all, kind, status, q]);
  if (!all) return <Loading />;
  const sel = all.find(c => c.id === openId);

  const cols: Col<Change>[] = [
    { key: 'id', header: 'ID', width: '9%', render: c => <span className="cell-2"><span className="mono strong">{c.id}</span>{c.emergency && <small className="bad">Emergency</small>}</span>, sort: c => Number(c.id.slice(4)) },
    { key: 'title', header: 'Title', render: c => <span className="cell-2"><span className="strong" style={{ fontWeight: 500 }}>{c.title}</span><small>{c.scope.length ? `${c.scope.length} device${c.scope.length > 1 ? 's' : ''} in scope` : 'Facility scope'}{c.incidentId ? ` · ${c.incidentId}` : ''}</small></span>, wrap: true },
    { key: 'dc', header: 'Datacenter', width: '10%', render: c => <DcLink id={c.dcId} />, sort: c => c.dcId },
    { key: 'kind', header: 'Kind', width: '11%', render: c => <Chip size="xs" tone={c.kind === 'Change' ? 'info' : 'cyan'}>{c.kind}</Chip>, sort: c => c.kind },
    { key: 'risk', header: 'Risk', width: '8%', render: c => <Chip size="xs" tone={RISK_TONE[c.risk]}>{c.risk}</Chip>, sort: c => ['Low', 'Medium', 'High'].indexOf(c.risk) },
    { key: 'status', header: 'Status', width: '12%', render: c => <ChangeChip s={c.status} size="xs" />, sort: c => STATUSES.indexOf(c.status) },
    { key: 'win', header: 'Window', width: '14%', render: c => <span className="cell-2 num nowrap">{fmtDateTime(c.windowStart)}<small>{fmtHm((c.windowEnd - c.windowStart) / 60000)} · {c.windowStart > now ? `in ${fmtHm((c.windowStart - now) / 60000)}` : c.windowEnd > now ? 'window open' : `${fmtHm((now - c.windowEnd) / 60000)} ago`}</small></span>, sort: c => c.windowStart },
    { key: 'who', header: 'Requester / approver', width: '14%', render: c => <span className="cell-2">{c.requester}<small>{c.approver ?? 'awaiting approver'}</small></span> }
  ];
  return (
    <div className="page">
      <PageHead title="Changes & maintenance" sub="Change and maintenance windows with dependency-aware impact; approve, implement, close or roll back."
        actions={<><Btn icon={I.Wrench} onClick={() => set({ new: 'maintenance', id: '' })}>Schedule maintenance</Btn><Btn variant="filled" icon={I.Plus} onClick={() => set({ new: 'change', id: '' })}>New change</Btn></>} />
      <ChangeAnalytics all={all} now={now} status={status} onStatus={v => set({ status: status === v ? '' : v })} />
      <section className="card">
        <DataTable rows={rows} cols={cols} onRow={c => set({ id: c.id, new: '' })} defaultSort={{ key: 'win', dir: 'desc' }}
          toolbar={
            <ListToolbar onApply={applyParams} shown={rows.length} total={all.length} onRefresh={reload}
              search={{ value: q, onChange: v => set({ q: v }), placeholder: 'ID, title, datacenter' }}
              filters={[
                { id: 'kind', label: 'Kind', quick: true, value: kind, defaultValue: 'all', onChange: v => set({ kind: v === 'all' ? '' : v }), options: [{ id: 'all', label: 'All kinds', count: all.length }, { id: 'change', label: 'Changes', count: all.filter(c => c.kind === 'Change').length }, { id: 'maintenance', label: 'Maintenance', count: all.filter(c => c.kind === 'Maintenance').length }] },
                { id: 'status', label: 'Status', quick: true, value: status, anyLabel: 'Any status', onChange: v => set({ status: v }), options: STATUSES.map(s => ({ id: s, label: s, count: all.filter(c => c.status === s).length })) }
              ]} />
          } />
      </section>
      <Drawer open={!!sel} onClose={() => set({ id: '' })} width={600} title={sel ? <span className="row" style={{ gap: 8 }}><span className="mono">{sel.id}</span><ChangeChip s={sel.status} /></span> : ''} sub={sel?.title}
        foot={sel && <Transitions c={sel} />}>
        {sel && <ChangeBody c={sel} />}
      </Drawer>
      <Drawer open={!!isNew} onClose={() => set({ new: '' })} width={620} title={isNew === 'maintenance' ? 'Schedule maintenance' : 'New change'} sub="Scope drives the live impact preview; risk is computed, not chosen.">
        {isNew && <NewChange kind={isNew} onDone={id => set({ new: '', id })} />}
      </Drawer>
    </div>
  );
}

function Transitions({ c }: { c: Change }) {
  const go = (to: ChangeStatus) => setChangeStatus(c.id, to);
  const b: React.ReactNode[] = [];
  if (c.status === 'Draft') b.push(<Btn key="s" variant="filled" onClick={() => go('Pending approval')}>Submit for approval</Btn>);
  if (c.status === 'Pending approval') b.push(<Btn key="r" variant="danger-subtle" onClick={() => go('Rejected')}>Reject</Btn>, <Btn key="a" variant="filled" icon={I.ShieldCheck} onClick={() => go('Approved')}>Approve</Btn>);
  if (c.status === 'Approved') b.push(<Btn key="st" variant="filled" icon={I.Play} onClick={() => go('In progress')}>Start implementation</Btn>);
  if (c.status === 'In progress') b.push(<Btn key="rb" icon={I.Undo2} onClick={() => go('Rolled back')}>Roll back</Btn>, <Btn key="c" variant="filled" icon={I.Check} onClick={() => go('Completed')}>Complete & verify</Btn>);
  return b.length ? <>{b}</> : <span className="faint" style={{ fontSize: 12.5 }}>No further transitions — {c.status.toLowerCase()}.</span>;
}

function ChangeBody({ c }: { c: Change }) {
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
function ImpactPreview({ im: raw, self }: { im?: Impact; self?: string }) {
  const im = raw && { ...raw, conflicts: raw.conflicts.filter(x => x.id !== self) };
  if (!im) return <div className="faint" style={{ fontSize: 13 }}><span className="spinner" style={{ verticalAlign: -3, marginRight: 8 }} />Mapping dependencies…</div>;
  return (
    <div className="impact-box">
      <div className="row between"><div className="ops-label" style={{ margin: 0 }}>Dependency impact</div><span className="row" style={{ gap: 8 }}><span className="faint" style={{ fontSize: 12 }}>risk score <b className="num">{im.score}</b>/100</span><Chip size="xs" tone={RISK_TONE[im.risk]}>{im.risk} risk</Chip></span></div>
      <div className="bar" style={{ height: 6 }}><i style={{ width: `${im.score}%`, background: im.risk === 'High' ? 'var(--vw-color-red-500)' : im.risk === 'Medium' ? 'var(--vw-color-amber-500)' : 'var(--vw-color-emerald-500)' }} /></div>
      <div className="grid g-3 impact-stats">
        <div><span>Network elements</span><b className="num">{im.nes}</b></div><div><span>Physical links</span><b className="num">{im.links}</b></div><div><span>Services</span><b className="num">{im.services}</b></div>
        <div><span>Customers</span><b className="num">{im.customers}</b></div><div><span>Premium customers</span><b className={`num ${im.premium ? 'bad' : ''}`}>{im.premium}</b></div><div><span>Revenue on scope / mo</span><b className="num">{fmtINR(im.revenue)}</b></div>
      </div>
      {im.conflicts.length > 0 && <div className="note note--warn"><I.CalendarX size={14} /><span>Overlaps {im.conflicts.map(x => x.id).join(', ')} on the same devices.</span></div>}
      {im.openInc.length > 0 && <div className="note note--bad"><I.Siren size={14} /><span>Open incident on scope: {im.openInc.map(x => <IncLink key={x.id} id={x.id} />)} — coordinate with the incident owner.</span></div>}
      {!im.conflicts.length && !im.openInc.length && <div className="note note--good"><I.CircleCheck size={14} /><span>No conflicting window or open incident on this scope.</span></div>}
    </div>
  );
}

const toLocal = (t: number) => { const d = new Date(t); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

function NewChange({ kind, onDone }: { kind: 'change' | 'maintenance'; onDone: (id: string) => void }) {
  const now = clockNow();
  const start0 = new Date(now + 2 * 86400000); start0.setHours(22, 0, 0, 0);
  const [dcId, setDc] = useState('MH-DC-001');
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

/* analytics strip: what is in flight, what waits on an approver, what lands this week, how risky, how it went */
const ST_TONE: Partial<Record<ChangeStatus, Tone>> = { Draft: 'neutral', 'Pending approval': 'warning', Approved: 'info', 'In progress': 'purple' };
function ChangeAnalytics({ all, now, status, onStatus }: { all: Change[]; now: number; status: string; onStatus: (s: string) => void }) {
  const DAY = 86400000;
  const live = all.filter(c => !['Completed', 'Rolled back', 'Rejected'].includes(c.status));
  const pending = all.filter(c => c.status === 'Pending approval');
  const oldest = pending.length ? Math.min(...pending.map(c => c.created)) : 0;
  const week = all.filter(c => c.windowStart >= now - 6 * 3600000 && c.windowStart < now + 7 * DAY && !['Completed', 'Rolled back', 'Rejected'].includes(c.status));
  const days = Array.from({ length: 7 }, (_, d) => week.filter(c => Math.floor((c.windowStart - (now - 6 * 3600000)) / DAY) === d).length);
  const done30 = all.filter(c => (c.status === 'Completed' || c.status === 'Rolled back') && c.windowEnd > now - 30 * DAY);
  const ok = done30.filter(c => c.status === 'Completed').length, rb = done30.length - ok;
  const rate = done30.length ? Math.round((ok / done30.length) * 100) : 100;
  const linked = all.filter(c => c.incidentId).length;
  return (
    <StatGrid>
      <StatTile label="In the pipeline" value={live.length} sub="changes not yet closed">
        <Split parts={(['Draft', 'Pending approval', 'Approved', 'In progress'] as ChangeStatus[]).map(st => ({ key: st, label: st === 'Pending approval' ? 'Pending' : st, n: all.filter(c => c.status === st).length, tone: ST_TONE[st]! }))} onPick={onStatus} active={status} />
      </StatTile>
      <StatTile label="Awaiting approval" value={pending.length} sub={oldest ? `oldest ${fmtDur((now - oldest) / 60000)}` : 'none waiting'} subTone={pending.length ? 'warn' : undefined} onClick={() => onStatus('Pending approval')} active={status === 'Pending approval'}>
        <Split parts={[{ key: 'High', label: 'High', n: pending.filter(c => c.risk === 'High').length, tone: 'error' }, { key: 'Medium', label: 'Medium', n: pending.filter(c => c.risk === 'Medium').length, tone: 'warning' }, { key: 'Low', label: 'Low', n: pending.filter(c => c.risk === 'Low').length, tone: 'success' }]} />
        <Facts items={[{ n: pending.filter(c => c.emergency).length, label: 'emergency' }]} />
      </StatTile>
      <StatTile label="Next 7 days" value={week.length} sub="windows scheduled">
        <Split parts={[{ key: 'c', label: 'Change', n: week.filter(c => c.kind === 'Change').length, tone: 'info' }, { key: 'm', label: 'Maintenance', n: week.filter(c => c.kind === 'Maintenance').length, tone: 'cyan' }]} />
        <MiniBars values={days} labels={['Today', '+6 d']} tone="info" />
      </StatTile>
      <StatTile label="Risk of open work" value={live.filter(c => c.risk === 'High').length} sub="high risk" subTone={live.some(c => c.risk === 'High') ? 'bad' : undefined}>
        <Split parts={[{ key: 'High', label: 'High', n: live.filter(c => c.risk === 'High').length, tone: 'error' }, { key: 'Medium', label: 'Medium', n: live.filter(c => c.risk === 'Medium').length, tone: 'warning' }, { key: 'Low', label: 'Low', n: live.filter(c => c.risk === 'Low').length, tone: 'success' }]} />
      </StatTile>
      <StatTile label="Outcome · 30 days" value={`${rate}%`} sub="succeeded first time">
        <SoftMeter pct={rate} tone={rate >= 90 ? 'success' : rate >= 75 ? 'warning' : 'error'} />
        <Facts items={[{ n: ok, label: 'completed', onClick: () => onStatus('Completed') }, { n: rb, label: 'rolled back', tone: rb ? 'bad' : undefined, onClick: () => onStatus('Rolled back') }]} />
      </StatTile>
      <StatTile label="Change vs maintenance" value={all.length} sub="on record">
        <Split parts={[{ key: 'c', label: 'Change', n: all.filter(c => c.kind === 'Change').length, tone: 'info' }, { key: 'm', label: 'Maintenance', n: all.filter(c => c.kind === 'Maintenance').length, tone: 'cyan' }]} />
        <Facts items={[{ n: linked, label: 'raised from incidents' }, { n: live.filter(c => c.windowStart <= now && c.windowEnd >= now).length, label: live.filter(c => c.windowStart <= now && c.windowEnd >= now).length === 1 ? 'window open now' : 'windows open now' }]} />
      </StatTile>
    </StatGrid>
  );
}
