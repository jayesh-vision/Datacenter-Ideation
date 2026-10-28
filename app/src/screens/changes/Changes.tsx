/* Change management (13-Oct-2026, P2B merge phase 6; replaces "Changes & maintenance"). One register over operations changes,
   maintenance windows and delivery change requests, with class, approval matrix, freezes, conflicts, policies and reviews
   (mock/changemgmt.ts). Tabs `?tab=`; the old deep link `/changes?id=` opens `/changes/:id`; `?new=change|maintenance` opens the form. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, decideChange, getChangeRegister, useQuery } from '../../api';
import type { ChangeClass, ChangeRecord } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Drawer, Panel, Seg, Tabs } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { Facts, MiniBars, SoftMeter, Split, StatGrid, StatTile } from '../../ui/Analytics';
import { ChangeChip, DcLink } from '../../ui/status';
import { fmtDate, fmtDateTime, fmtNum } from '../../lib/format';
import { fmtHm, useToast } from '../ops/shared';
import { NewChange, RISK_TONE } from './parts';
import '../../styles/dcim.css';
import '../../styles/planner.css';
import '../../styles/ipam.css';
import '../../styles/changes.css';
import { ChangeOverview } from './ChangeOverview';

type Tab = 'overview' | 'changes' | 'approvals' | 'calendar' | 'freezes' | 'standard' | 'policies';
export const CLASS_TONE: Record<ChangeClass, 'cyan' | 'info' | 'error'> = { Standard: 'cyan', Normal: 'info', Emergency: 'error' };
const OPEN = (c: ChangeRecord) => !['Completed', 'Rolled back', 'Rejected'].includes(c.status);
const DAY = 864e5;

export function Changes() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const apply = useParamPatch();
  const tab = (sp.get('tab') as Tab) || (sp.get('dc') || sp.get('status') ? 'changes' : 'overview');   // site / status links land on the list
  const q = sp.get('q') ?? '', src = sp.get('src') ?? '', cls = sp.get('cls') ?? '', st = sp.get('status') ?? '', pol = sp.get('pol') ?? '', dc = sp.get('dc') ?? '';
  const isNew = sp.get('new') as 'change' | 'maintenance' | null;
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
  /* the old drawer deep link (/changes?id=CHG-…) keeps working: it opens the change page */
  useEffect(() => { const id = sp.get('id'); if (id) nav(`/changes/${encodeURIComponent(id)}`, { replace: true }); }, [sp, nav]);
  usePage([{ label: 'Operate' }, { label: 'Change management', to: '/changes' }]);
  const { data: r, reload } = useQuery(getChangeRegister, []);
  const toast = useToast();
  const now = clockNow();
  const rows = useMemo(() => (r?.changes ?? []).filter(c => (!src || c.source === src) && (!cls || c.cls === cls) && (!dc || c.dcId === dc) && (!st || (st === 'open' ? OPEN(c) : c.status === st)) && (!pol || c.violations.some(v => v.policy === pol))
    && (!q || `${c.id} ${c.title} ${c.dcId} ${c.requester}`.toLowerCase().includes(q.toLowerCase()))), [r, q, src, cls, st, pol, dc]);
  if (!r) return <Loading />;
  const all = r.changes, open = all.filter(OPEN);
  const pending = all.filter(c => c.status === 'Pending approval');
  const week = open.filter(c => c.windowStart >= now - 6 * 3600e3 && c.windowStart < now + 7 * DAY);
  const days = Array.from({ length: 7 }, (_, d) => week.filter(c => Math.floor((c.windowStart - (now - 6 * 3600e3)) / DAY) === d).length);
  const last4 = all.filter(c => (c.status === 'Completed' || c.status === 'Rolled back') && c.windowEnd > now - 28 * DAY && c.windowEnd <= now);
  const failed4 = last4.filter(c => c.outcome !== 'Successful').length;
  const rate = last4.length ? Math.round(((last4.length - failed4) / last4.length) * 100) : 100;
  const blocked = open.filter(c => c.violations.some(v => v.enforcement === 'Block'));
  const decide = (c: ChangeRecord, ok: boolean) => decideChange(c.id, ok).then(() => toast.show(ok ? `${c.id}: ${c.approvals.find(a => a.decision === 'Pending')?.role} approved` : `${c.id} rejected`)).catch(e => toast.show('Not done', String(e.message ?? e)));
  const cols: Col<ChangeRecord>[] = [
    { key: 'id', header: 'Change', sort: c => c.id, wrap: true, render: c => <span className="cell-2"><b className="mono">{c.id}</b><small>{c.title}</small></span> },
    { key: 'cls', header: 'Class', sort: c => c.cls, render: c => <span className="cell-2"><Chip tone={CLASS_TONE[c.cls]} size="xs">{c.cls}</Chip><small>{c.source}</small></span> },
    { key: 'dc', header: 'Site', sort: c => c.dcId, render: c => <DcLink id={c.dcId} /> },
    { key: 'risk', header: 'Risk', sort: c => ['Low', 'Medium', 'High'].indexOf(c.risk), render: c => <Chip tone={RISK_TONE[c.risk]} size="xs">{c.risk}</Chip> },
    { key: 'win', header: 'Window', sort: c => c.windowStart, render: c => <span className="cell-2"><span className="nowrap">{fmtDateTime(c.windowStart)}</span><small className="nowrap">{fmtHm((c.windowEnd - c.windowStart) / 60000)}</small></span> },
    { key: 'chk', header: 'Checks', sort: c => c.violations.length, render: c => c.violations.length ? <span className="cell-2"><Chip tone={c.violations.some(v => v.enforcement === 'Block') ? 'error' : 'warning'} dot size="xs">{c.violations.length} {c.violations.some(v => v.enforcement === 'Block') ? 'blocking' : 'warning'}</Chip><small className="dcim-note" title={c.violations.map(v => v.text).join(' · ')}>{c.violations[0].text}</small></span> : <span className="vw-label">clear</span> },
    { key: 'st', header: 'Status', sort: c => c.status, render: c => <span className="cell-2"><ChangeChip s={c.status} size="xs" />{c.outcome === 'Caused an incident' && <small style={{ color: 'var(--vw-color-red-600)' }}>caused {c.causedIncident}</small>}</span> }
  ];
  const sites = [...new Set(all.map(c => c.dcId))].sort();

  return (
    <div className="page dcim planner head-1line">
      <PageHead title="Change management" sub="Every change to the estate: operations changes, maintenance windows and the change request behind each delivery work order — classed, approved through the matrix, checked against freezes and policies, reviewed after"
        actions={<><Btn icon={I.Wrench} onClick={() => set({ new: 'maintenance' })}>Schedule maintenance</Btn><Btn variant="filled" icon={I.Plus} onClick={() => set({ new: 'change' })}>Raise a change</Btn></>} />
      <StatGrid>
        <StatTile label="In the pipeline" value={open.length} sub="not yet closed" onClick={() => set({ tab: 'changes', status: 'open' })} info="Changes not completed, rolled back or rejected, by class: standard (pre-approved template), normal (approval matrix) and emergency (ECAB, reviewed after).">
          <Split parts={(['Normal', 'Standard', 'Emergency'] as const).map((k, i) => ({ key: k, label: k, n: open.filter(c => c.cls === k).length, tone: (k === 'Emergency' ? 'error' : i === 0 ? 'info' : 'neutral') as 'error' | 'info' | 'neutral' })).filter(x => x.n)} onPick={k => set({ tab: 'changes', status: 'open', cls: k })} />
        </StatTile>
        <StatTile label="Awaiting approval" value={pending.length} sub={pending.length ? `oldest ${fmtHm((now - Math.min(...pending.map(c => c.created))) / 60000)}` : 'none waiting'} subTone={pending.length ? 'warn' : undefined} onClick={() => set({ tab: 'approvals' })} info="Changes whose current approval step is waiting for a decision.">
          <Split parts={(['High', 'Medium', 'Low'] as const).map(k => ({ key: k, label: k, n: pending.filter(c => c.risk === k).length, tone: (k === 'High' ? 'error' : k === 'Medium' ? 'warning' : 'neutral') as 'error' | 'warning' | 'neutral' })).filter(x => x.n)} />
        </StatTile>
        <StatTile label="Next 7 days" value={week.length} sub="windows" onClick={() => set({ tab: 'calendar' })} info="Open windows starting between six hours ago and a week from now; a column per day.">
          <MiniBars values={days} labels={['Today', '+6 d']} tone="info" />
        </StatTile>
        <StatTile label="Change success · 4 weeks" value={`${rate}%`} sub={`${last4.length} implemented`} subTone={rate < 90 ? 'warn' : undefined} onClick={() => set({ tab: 'changes', status: 'Completed' })} info="Changes implemented in the last 28 days that neither rolled back nor caused an incident (a completed change an incident's leading hypothesis cites counts as failed).">
          <SoftMeter pct={rate} tone={rate >= 95 ? 'success' : rate >= 85 ? 'warning' : 'error'} />
          <Facts items={[{ n: failed4, label: 'failed', tone: failed4 ? 'bad' : undefined }]} />
        </StatTile>
        <StatTile label="Freezes" value={r.freezes.filter(f => (f.to ?? Infinity) > now).length} sub="active or coming" onClick={() => set({ tab: 'freezes' })} info="A site with an open Critical incident holds non-emergency changes; peak-season and year-end freezes apply to the estate.">
          <Split parts={[{ key: 's', label: 'Site (incident)', n: r.freezes.filter(f => f.source === 'Incident').length, tone: 'orange' as const }, { key: 'e', label: 'Estate (calendar)', n: r.freezes.filter(f => f.source === 'Calendar').length, tone: 'neutral' as const }].filter(x => x.n)} />
          <Facts items={[{ n: open.filter(c => c.freeze).length, label: 'changes inside a freeze', tone: open.some(c => c.freeze) ? 'warn' : undefined }]} />
        </StatTile>
        <StatTile label="Policy checks" value={blocked.length} sub={`blocked · ${open.filter(c => c.violations.length && !c.violations.some(v => v.enforcement === 'Block')).length} warnings`} subTone={blocked.length ? 'bad' : undefined} onClick={() => set({ tab: 'policies' })} info="Open changes that break a blocking policy (rollback plan, freeze) cannot be approved; warnings show on the change.">
          <SoftMeter pct={open.length ? (open.filter(c => !c.violations.length).length / open.length) * 100 : 100} tone="success" />
        </StatTile>
      </StatGrid>
      <Tabs value={tab} onChange={v => set({ tab: v === 'overview' ? '' : v, q: '', src: '', cls: '', status: '', pol: '' })} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'changes', label: 'Changes', count: all.length }, { id: 'approvals', label: 'Approvals', count: pending.length }, { id: 'calendar', label: 'Calendar' }, { id: 'freezes', label: 'Freezes', count: r.freezes.length }, { id: 'standard', label: 'Standard changes', count: r.templates.length }, { id: 'policies', label: 'Policies', count: r.policies.length }]} />

      {tab === 'overview' && <ChangeOverview r={r} now={now} go={set} />}
      {tab === 'changes' && <section className="vw-card-section dcim-table">
        <DataTable rows={rows} cols={cols} pageSize={30} defaultSort={{ key: 'win', dir: 'desc' }} onRow={c => nav(`/changes/${encodeURIComponent(c.id)}`)}
          toolbar={<ListToolbar shown={rows.length} total={all.length} noun="changes" onApply={apply} onRefresh={reload} search={{ value: q, onChange: v => set({ q: v }), placeholder: 'ID, title, site, requester' }}
            filters={[
              { id: 'status', label: 'Status', quick: true, value: st, anyLabel: 'Any status', onChange: v => set({ status: v }), options: [{ id: 'open', label: 'Open (not closed)', count: open.length }, ...(['Draft', 'Pending approval', 'Approved', 'In progress', 'Completed', 'Rolled back', 'Rejected'] as const).map(s => ({ id: s, label: s, count: all.filter(c => c.status === s).length })).filter(x => x.count)] },
              { id: 'src', label: 'Source', quick: true, value: src, anyLabel: 'Any source', onChange: v => set({ src: v }), options: (['Operations', 'Maintenance', 'Delivery', 'DCIM', 'MACD'] as const).map(s => ({ id: s, label: s, count: all.filter(c => c.source === s).length })) },
              { id: 'cls', label: 'Class', value: cls, anyLabel: 'Any class', onChange: v => set({ cls: v }), options: (['Standard', 'Normal', 'Emergency'] as const).map(s => ({ id: s, label: s, count: all.filter(c => c.cls === s).length })) },
              { id: 'dc', label: 'Site', value: dc, anyLabel: 'Any site', onChange: v => set({ dc: v }), options: sites.map(s => ({ id: s, label: s, count: all.filter(c => c.dcId === s).length })) },
              { id: 'pol', label: 'Policy', value: pol, anyLabel: 'Any', onChange: v => set({ pol: v }), options: r.policies.filter(p => p.violations).map(p => ({ id: p.id, label: p.name, count: p.violations })) }
            ]} />} />
      </section>}
      {tab === 'approvals' && <section className="vw-card-section dcim-table">
        <DataTable rows={pending} pageSize={30} defaultSort={{ key: 'win', dir: 'asc' }} onRow={c => nav(`/changes/${encodeURIComponent(c.id)}`)} empty={<p className="vw-label" style={{ padding: 16 }}>Nothing waiting for a decision.</p>} cols={[
          ...cols.filter(c => ['id', 'cls', 'risk', 'win', 'chk'].includes(c.key)),
          { key: 'step', header: 'Waiting for', render: c => { const s = c.approvals.find(a => a.decision === 'Pending'); return <span className="cell-2"><b>{s?.role ?? '—'}</b><small>{s?.who} · step {c.approvals.findIndex(a => a.decision === 'Pending') + 1} of {c.approvals.length}</small></span>; } },
          { key: 'act', header: '', render: c => c.source === 'Delivery' ? <Link className="ent-link" to={`/delivery/projects/${c.projectId}?tab=workorders`} onClick={e => e.stopPropagation()}>via work order</Link>
            : <span className="row nowrap" style={{ gap: 6 }} onClick={e => e.stopPropagation()}><Btn size="sm" onClick={() => decide(c, false)}>Reject</Btn><Btn size="sm" variant="filled" disabled={c.violations.some(v => v.enforcement === 'Block')} onClick={() => decide(c, true)}>Approve</Btn></span> }]} />
      </section>}
      {tab === 'calendar' && <Calendar changes={all} freezes={r.freezes} now={now} onOpen={id => nav(`/changes/${encodeURIComponent(id)}`)} />}
      {tab === 'freezes' && <section className="vw-card-section dcim-table"><DataTable rows={r.freezes} pageSize={20} cols={[
        { key: 't', header: 'Freeze', wrap: true, render: f => <span className="cell-2"><b>{f.title}</b><small>{f.reason}</small></span> },
        { key: 's', header: 'Scope', render: f => f.scope === 'Estate' ? 'Whole estate' : <DcLink id={f.dcId!} /> },
        { key: 'w', header: 'When', render: f => <span className="cell-2"><span className="nowrap">{fmtDate(f.from)}</span><small className="nowrap">{f.to ? `to ${fmtDate(f.to)}` : 'until the incident is resolved'}</small></span> },
        { key: 'a', header: 'Allows', render: f => f.allows },
        { key: 'n', header: 'Changes inside', render: f => fmtNum(open.filter(c => c.freeze === f.id).length) }]} /></section>}
      {tab === 'standard' && <section className="vw-card-section dcim-table"><DataTable rows={r.templates} pageSize={20} cols={[
        { key: 'n', header: 'Standard change', wrap: true, render: t => <span className="cell-2"><b>{t.name}</b><small>{t.description}</small></span> },
        { key: 'c', header: 'Pre-checks', wrap: true, render: t => <span className="vw-label">{t.checks}</span> },
        { key: 'u', header: 'Used', sort: t => t.uses, render: t => <span className="cell-2"><span>{fmtNum(t.uses)}</span><small>{t.lastUsed ? `last ${fmtDate(t.lastUsed)}` : 'not used yet'}</small></span> },
        { key: 's', header: 'Success', sort: t => t.success, render: t => `${t.success}%` }]} /></section>}
      {tab === 'policies' && <section className="vw-card-section dcim-table"><DataTable rows={r.policies} pageSize={20} onRow={p => set({ tab: 'changes', pol: p.id })} cols={[
        { key: 'n', header: 'Policy', wrap: true, render: p => <span className="cell-2"><b>{p.name}</b><small>{p.rule}</small></span> },
        { key: 'e', header: 'Enforcement', render: p => <Chip tone={p.enforcement === 'Block' ? 'error' : 'warning'} size="xs">{p.enforcement}</Chip> },
        { key: 'v', header: 'Changes breaking it', sort: p => p.violations, render: p => p.violations ? <span style={{ color: 'var(--vw-color-red-600)' }}>{p.violations}</span> : <span className="vw-label">0</span> }]} /></section>}
      <Drawer open={!!isNew} onClose={() => set({ new: '' })} width={620} title={isNew === 'maintenance' ? 'Schedule maintenance' : 'Raise a change'} sub="Scope drives the live impact preview; risk is computed, not chosen. A title that matches a standard template is pre-approved.">
        {isNew && <NewChange kind={isNew} onDone={id => { set({ new: '' }); nav(`/changes/${encodeURIComponent(id)}`); }} />}
      </Drawer>
      {toast.node}
    </div>
  );
}

function Calendar({ changes, freezes, now, onOpen }: { changes: ChangeRecord[]; freezes: { id: string; scope: string; dcId?: string; title: string; from: number; to: number | null }[]; now: number; onOpen: (id: string) => void }) {
  const [off, setOff] = useState(0);
  const [mode, setMode] = useState<'all' | 'open'>('open');
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0); const day0 = d0.getTime() - ((d0.getDay() + 6) % 7) * DAY + off * 7 * DAY;
  const days = Array.from({ length: 7 }, (_, i) => day0 + i * DAY);
  const inWeek = changes.filter(c => c.windowStart < day0 + 7 * DAY && c.windowEnd > day0 && (mode === 'all' || OPEN(c) || c.source !== 'Maintenance'));
  const sites = [...new Set(inWeek.map(c => c.dcId))].sort();
  return (
    <Panel title={`${fmtDate(day0)} – ${fmtDate(day0 + 6 * DAY)}`} icon={I.CalendarDays} info="Change and maintenance windows per site and day; amber cells are inside a freeze. Click a window to open it."
      actions={<span className="row" style={{ gap: 8 }}><Seg size="sm" value={mode} onChange={setMode} options={[{ id: 'open', label: 'Changes' }, { id: 'all', label: 'Incl. completed PM' }]} /><Btn icon={I.ChevronLeft} onClick={() => setOff(o => o - 1)}>Previous</Btn><Btn onClick={() => setOff(0)}>This week</Btn><Btn iconRight={I.ChevronRight} onClick={() => setOff(o => o + 1)}>Next</Btn></span>}>
      {sites.length ? <div className="cm-cal" style={{ gridTemplateColumns: `120px repeat(7, minmax(0, 1fr))` }}>
        <span className="cm-h" />{days.map(d => <span key={d} className={`cm-h${d <= now && now < d + DAY ? ' is-today' : ''}`}>{fmtDate(d).replace(/,? \d{4}$/, '').replace(/-\d{4}$/, '')}</span>)}
        {sites.map(s => [<span key={s} className="cm-site mono">{s}</span>, ...days.map(d => {
          const fz = freezes.some(f => (f.scope === 'Estate' || f.dcId === s) && d < (f.to ?? Infinity) && d + DAY > f.from);
          const cs = inWeek.filter(c => c.dcId === s && c.windowStart < d + DAY && c.windowEnd > d);
          return <span key={`${s}${d}`} className={`cm-cell${fz ? ' is-frozen' : ''}`}>{cs.slice(0, 3).map(c => <button key={c.id} type="button" className={`cm-ev cls-${c.cls.toLowerCase()}`} onClick={() => onOpen(c.id)} title={`${c.id} · ${c.title}`}><b className="mono">{c.windowStart >= d ? new Date(c.windowStart).toTimeString().slice(0, 5) : 'cont.'} {c.id}</b><small>{c.title}</small></button>)}{cs.length > 3 && <small className="vw-label">+{cs.length - 3} more</small>}</span>;
        })])}
      </div> : <p className="vw-label">No windows this week.</p>}
    </Panel>
  );
}
