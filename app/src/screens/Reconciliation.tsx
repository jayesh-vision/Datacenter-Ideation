import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { assignRecon, getAudit, getDatacenters, getReconciliation, resolveRecon, runDiscovery, useQuery, clockNow, CURRENT_USER } from '../api';
import type { AuditEntry, NetworkElement, ReconTask } from '../api/types';
import { usePage, PageHead, Loading } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { Btn, Chip, Drawer, KV, Kpi, Modal, SearchBox, Tabs } from '../ui/kit';
import { DcLink, DiscoveryChip, NeLink } from '../ui/status';
import { ND_REASON } from '../lib/vocab';
import { fmtAgo, fmtDate, fmtDateTime, fmtNum } from '../lib/format';
import '../styles/overview.css';

type Task = ReconTask & { ne: NetworkElement };
const KIND: Record<ReconTask['kind'], { label: string; tone: 'error' | 'warning' | 'orange' }> = {
  'not-discovered': { label: 'Not discovered', tone: 'error' }, drift: { label: 'Configuration drift', tone: 'warning' }, 'duplicate-serial': { label: 'Duplicate serial', tone: 'orange' }
};
const DECISION: Record<NonNullable<ReconTask['decision']>, string> = {
  'accept-observed': 'Accepted observed values', 'keep-record': 'Kept inventory record', retire: 'Record retired', 'collector-assigned': 'Collector assigned — discovered', 'not-applicable': 'Marked not applicable'
};
const ASSIGNEES = ['Priya Nair', 'Rahul Deshpande', 'Arjun Mehta', 'Meera Iyer', 'Anil Kulkarni'];

/* WF-02 inventory drift: detect → classify → validate → task → update → audit → close. */
export function Reconciliation() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'audit' ? 'audit' : 'worklist';
  const f = { dc: sp.get('dc') ?? '', kind: sp.get('kind') ?? '', status: sp.get('status') ?? '', reason: sp.get('reason') ?? '', q: sp.get('q') ?? '' };
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [who, setWho] = useState(ASSIGNEES[0]);
  const [busy, setBusy] = useState(false);
  usePage([{ label: 'Inventory', to: '/inventory' }, { label: 'Reconciliation' }], f.dc ? { dcId: f.dc } : {});
  const { data: tasks } = useQuery(() => getReconciliation({}), []);
  const { data: dcs } = useQuery(getDatacenters, []);
  const { data: audit } = useQuery(() => getAudit(), []);

  const rows = useMemo(() => (tasks ?? []).filter(t => (f.status ? t.status === f.status : t.status !== 'Resolved') && (!f.dc || t.dcId === f.dc) && (!f.kind || t.kind === f.kind || (f.kind === 'drift' && t.kind === 'duplicate-serial'))
    && (!f.reason || t.ne.ndReason === f.reason) && (!f.q || `${t.neId} ${t.ne.serial} ${t.ne.ip} ${t.id}`.toLowerCase().includes(f.q.toLowerCase()))), [tasks, f.dc, f.kind, f.status, f.reason, f.q]);
  if (!tasks || !dcs || !audit) return <Loading />;

  const scoped = tasks.filter(t => (!f.dc || t.dcId === f.dc));
  const open = scoped.filter(t => t.status !== 'Resolved');
  const nd = open.filter(t => t.kind === 'not-discovered');
  const byReason = (r: string) => nd.filter(t => t.ne.ndReason === r).length;
  const now = clockNow();
  const cur = openId ? tasks.find(t => t.id === openId) : undefined;
  const decide = async (d: NonNullable<ReconTask['decision']>) => { if (!cur) return; setBusy(true); await resolveRecon(cur.id, d); setBusy(false); };
  const dcNd = f.dc ? nd.filter(t => t.ne.ndReason === 'no-collector' || t.ne.ndReason === 'collector-unavailable').length : 0;

  const cols: Col<Task>[] = [
    { key: 'id', header: 'Task', render: t => <span className="cell-2"><span className="mono strong">{t.id}</span><small>{fmtDate(t.created)}</small></span>, sort: t => t.id },
    { key: 'ne', header: 'Network element', render: t => <span className="cell-2"><NeLink id={t.neId} /><small>{t.ne.role} · {t.ne.vendor} {t.ne.model}</small></span>, sort: t => t.neId },
    { key: 'dc', header: 'Site', render: t => <DcLink id={t.dcId} />, sort: t => t.dcId },
    { key: 'kind', header: 'Gap', render: t => <Chip tone={KIND[t.kind].tone} size="xs">{KIND[t.kind].label}</Chip>, sort: t => t.kind },
    { key: 'what', header: 'Detail', wrap: true, render: t => t.kind === 'not-discovered' ? <span className="muted">{ND_REASON[t.ne.ndReason ?? 'planned']}</span> : <span className="muted">{t.ne.drift?.map(d => d.attr).join(', ')}</span> },
    { key: 'st', header: 'Status', render: t => <Chip tone={t.status === 'Resolved' ? 'success' : t.status === 'In progress' ? 'info' : 'neutral'} size="xs">{t.status}</Chip>, sort: t => t.status },
    { key: 'who', header: 'Assignee', render: t => t.assignee ?? <span className="faint">Unassigned</span>, sort: t => t.assignee ?? '' },
    { key: 'age', header: 'Age', align: 'right', render: t => <span className="num muted">{fmtAgo(t.created, now).replace(' ago', '')}</span>, sort: t => -t.created }
  ];
  const acols: Col<AuditEntry>[] = [
    { key: 'at', header: 'Time', render: a => <span className="num nowrap">{fmtDateTime(a.at)}</span>, sort: a => a.at },
    { key: 'actor', header: 'Actor', render: a => a.actor, sort: a => a.actor },
    { key: 'obj', header: 'Object', render: a => (/^[A-Z]{2}-DC-\d{3}-/.test(a.object) ? <NeLink id={a.object} /> : <span className="mono strong">{a.object}</span>), sort: a => a.object },
    { key: 'f', header: 'Field', render: a => a.field },
    { key: 'chg', header: 'Previous → new', render: a => <span className="row nowrap" style={{ gap: 6 }}><span className="mono diff-prev">{a.prev}</span><I.ArrowRight size={12} className="faint" /><span className="mono strong">{a.next}</span></span> },
    { key: 'src', header: 'Source · decision', wrap: true, render: a => <span className="cell-2"><span>{a.source}</span><small>{a.note ?? '—'}</small></span>, sort: a => a.source }
  ];

  return (
    <div className="page">
      <PageHead title="Inventory reconciliation" sub="Recorded vs discovered inventory. Classify each gap, validate the source, decide, and every decision lands in the audit trail (WF-02, DC-INV-005/006/016)."
        actions={<>
          <select className="select" value={f.dc} onChange={e => set('dc', e.target.value)} aria-label="Site"><option value="">All sites</option>{dcs.filter(d => tasks.some(t => t.dcId === d.id)).map(d => <option key={d.id} value={d.id}>{d.id} · {d.city}</option>)}</select>
          {f.dc && <Btn icon={I.Radar} disabled={busy} onClick={async () => { setBusy(true); await runDiscovery(f.dc); setBusy(false); }} title="Re-poll collectors for this site">Run discovery{dcNd ? ` (${dcNd} waiting on collector)` : ''}</Btn>}
        </>} />

      <div className="kpis kpis-6">
        <Kpi label="Open gaps" value={fmtNum(open.length)} icon={I.GitCompareArrows} tone="info" basis={`${open.filter(t => t.status === 'In progress').length} in progress`} onClick={() => { set('kind', ''); }} active={!f.kind && !f.reason} />
        <Kpi label="Not discovered" value={nd.length} icon={I.SearchX} tone="error" basis="On record, never seen by discovery" onClick={() => { const n = new URLSearchParams(sp); n.set('kind', 'not-discovered'); n.delete('reason'); setSp(n, { replace: true }); }} active={f.kind === 'not-discovered' && !f.reason} />
        <Kpi label="Planned · not installed" value={byReason('planned')} icon={I.CalendarClock} tone="neutral" basis="Expected — no action until install" onClick={() => { const n = new URLSearchParams(sp); n.set('kind', 'not-discovered'); n.set('reason', 'planned'); setSp(n, { replace: true }); }} active={f.reason === 'planned'} />
        <Kpi label="No / unavailable collector" value={byReason('no-collector') + byReason('collector-unavailable')} icon={I.RadioTower} tone="orange" basis={`${byReason('no-collector')} none assigned · ${byReason('collector-unavailable')} collector down`} onClick={() => { const n = new URLSearchParams(sp); n.set('kind', 'not-discovered'); n.set('reason', 'no-collector'); setSp(n, { replace: true }); }} active={f.reason === 'no-collector'} />
        <Kpi label="Configuration drift" value={open.filter(t => t.kind === 'drift').length} icon={I.GitBranch} tone="warning" basis="Observed ≠ record" onClick={() => set('kind', 'drift')} active={f.kind === 'drift'} />
        <Kpi label="Duplicate serials" value={open.filter(t => t.kind === 'duplicate-serial').length} icon={I.Copy} tone="orange" basis="Same serial on two records" onClick={() => set('kind', 'duplicate-serial')} active={f.kind === 'duplicate-serial'} />
      </div>

      <Tabs value={tab} onChange={v => set('tab', v === 'worklist' ? '' : v)} tabs={[{ id: 'worklist', label: 'Worklist', count: rows.length }, { id: 'audit', label: 'Audit trail', count: audit.length }]} />

      {tab === 'worklist' ? (
        <section className="card">
          <DataTable rows={rows} cols={cols} pageSize={25} selectable selected={sel} onSelect={setSel} onRow={t => setOpenId(t.id)} defaultSort={{ key: 'age', dir: 'asc' }}
            bulkbar={<><b>{sel.size} selected</b><Btn size="xs" icon={I.UserPlus} onClick={() => setAssignOpen(true)}>Assign to…</Btn><Btn size="xs" variant="ghost" onClick={() => setSel(new Set())}>Clear</Btn></>}
            toolbar={
              <div className="toolbar" style={{ width: '100%' }}>
                <span className="dt-count">{fmtNum(rows.length)} gaps</span>
                <SearchBox value={f.q} onChange={v => set('q', v)} placeholder="NE, serial, IP, task id" width={240} />
                <select className="select" value={f.kind} onChange={e => set('kind', e.target.value)} aria-label="Gap type"><option value="">All gap types</option><option value="not-discovered">Not discovered</option><option value="drift">Drift (incl. duplicates)</option><option value="duplicate-serial">Duplicate serial</option></select>
                {f.kind === 'not-discovered' && <select className="select" value={f.reason} onChange={e => set('reason', e.target.value)} aria-label="Reason"><option value="">Any reason</option>{Object.entries(ND_REASON).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
                <select className="select" value={f.status} onChange={e => set('status', e.target.value)} aria-label="Status"><option value="">Open &amp; in progress</option><option value="Open">Open</option><option value="In progress">In progress</option><option value="Resolved">Resolved</option></select>
                {(f.kind || f.status || f.q || f.reason) && <button type="button" className="panel-link" onClick={() => { const n = new URLSearchParams(); if (f.dc) n.set('dc', f.dc); setSp(n, { replace: true }); }}><I.X size={13} />Clear</button>}
              </div>
            } />
        </section>
      ) : (
        <section className="card">
          <DataTable rows={audit} cols={acols} pageSize={25} defaultSort={{ key: 'at', dir: 'desc' }} toolbar={<span className="dt-count">{audit.length} audited inventory changes · source, previous value, new value, actor and decision</span>} />
        </section>
      )}

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title={`Assign ${sel.size} gap${sel.size === 1 ? '' : 's'}`} width={420}
        foot={<><Btn onClick={() => setAssignOpen(false)}>Cancel</Btn><Btn variant="filled" onClick={async () => { await assignRecon([...sel], who); setSel(new Set()); setAssignOpen(false); }}>Assign</Btn></>}>
        <label className="field"><span className="field-label">Assignee</span>
          <select className="select" value={who} onChange={e => setWho(e.target.value)}>{[...ASSIGNEES, CURRENT_USER].map(p => <option key={p}>{p}</option>)}</select>
        </label>
        <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>Open tasks move to In progress.</p>
      </Modal>

      <Drawer open={!!cur} onClose={() => setOpenId(null)} width={560} title={<span className="mono">{cur?.neId}</span>} sub={cur ? `${cur.id} · ${KIND[cur.kind].label} · ${cur.dcId}` : ''}
        foot={cur && <><Btn icon={I.ExternalLink} onClick={() => nav(`/ne/${cur.neId}`)}>Open network element</Btn><Btn onClick={() => setOpenId(null)}>Close</Btn></>}>
        {cur && <TaskBody t={cur} busy={busy} decide={decide} onTwin={id => nav(`/ne/${id}`)} now={now} />}
      </Drawer>
    </div>
  );
}

function TaskBody({ t, busy, decide, onTwin, now }: { t: Task; busy: boolean; decide: (d: NonNullable<ReconTask['decision']>) => void; onTwin: (id: string) => void; now: number }) {
  const ne = t.ne;
  const opts: { d: NonNullable<ReconTask['decision']>; icon: I.LucideIcon; label: string; sub: string }[] = t.kind === 'not-discovered'
    ? [{ d: 'collector-assigned', icon: I.RadioTower, label: 'Assign collector & re-discover', sub: 'Device is installed; poll it from the site collector' },
      { d: 'not-applicable', icon: I.CircleSlash, label: 'Not applicable', sub: 'Passive or unmanaged — exclude from coverage' },
      { d: 'retire', icon: I.Archive, label: 'Retire the record', sub: 'Asset is not on site; move to decommissioning' }]
    : [{ d: 'accept-observed', icon: I.CheckCheck, label: 'Accept observed values', sub: 'Update the inventory record from discovery' },
      { d: 'keep-record', icon: I.Undo2, label: 'Keep the record', sub: 'Record is right; correct the device in the field' }];
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row wrap" style={{ gap: 8 }}><DiscoveryChip s={ne.discovery} /><Chip tone={t.status === 'Resolved' ? 'success' : t.status === 'In progress' ? 'info' : 'neutral'} size="sm">{t.status}</Chip>{t.assignee && <Chip tone="neutral" size="sm"><I.User size={12} />{t.assignee}</Chip>}</div>
      <KV cols={3} items={[['Vendor · model', `${ne.vendor} ${ne.model}`], ['Serial', <span className="mono">{ne.serial}</span>], ['IP', <span className="mono">{ne.ip}</span>],
        ['Rack · U', `${ne.rackId.split('-').slice(-1)[0]} · U${ne.u}`], ['Lifecycle', ne.lifecycle], ['Collector', ne.collector ?? '—'], ['Last seen', ne.lastSeen ? fmtAgo(ne.lastSeen, now) : 'Never'], ['Opened', fmtDate(t.created)], ['Source', t.kind === 'not-discovered' ? 'Planned inventory' : 'SNMP / LLDP discovery']]} />
      {t.kind === 'not-discovered' ? (
        <div className={`note ${ne.ndReason === 'planned' ? 'note--info' : 'note--warn'}`}><I.Info size={14} /><span><b>{ND_REASON[ne.ndReason ?? 'planned']}.</b> {ne.ndReason === 'planned' ? 'The record exists ahead of installation; nothing to fix until the device is racked.' : ne.ndReason === 'collector-unavailable' ? 'A collector is assigned but not reporting, so this device cannot be confirmed.' : ne.ndReason === 'not-applicable' ? 'Excluded from discovery coverage.' : 'No collector polls this device yet — assign one, then reconcile.'}</span></div>
      ) : (
        <>
          <div className="dsec">Record vs observed</div>
          {ne.drift?.length ? (
            <table className="diff"><thead><tr><th>Attribute</th><th>Inventory record</th><th>Observed on network</th></tr></thead>
              <tbody>{ne.drift.map(d => <tr key={d.attr}><td style={{ fontFamily: 'Poppins' }}>{d.attr}</td><td className="rec">{d.record}</td><td className="obs">{d.observed}</td></tr>)}</tbody></table>
          ) : <div className="note note--good"><I.CheckCircle2 size={14} />Record and network agree.</div>}
          {ne.duplicateSerialOf && <div className="note note--warn"><I.Copy size={14} /><span>Serial also recorded on <button type="button" className="panel-link" onClick={() => onTwin(ne.duplicateSerialOf!)}>{ne.duplicateSerialOf}</button> — confirm which device carries it.</span></div>}
        </>
      )}
      <div className="dsec">{t.status === 'Resolved' ? 'Decision' : 'Decide'}</div>
      {t.status === 'Resolved' ? (
        <div className="note note--good"><I.CheckCircle2 size={14} /><span><b>{DECISION[t.decision!]}</b> by {t.assignee}. Logged to the audit trail with previous and new values.</span></div>
      ) : (
        <div className="decide">
          {opts.map(o => <button key={o.d} type="button" disabled={busy} onClick={() => decide(o.d)}><span className="kpi-ico tone-info"><o.icon size={15} /></span><span><b>{o.label}</b><small>{o.sub}</small></span></button>)}
        </div>
      )}
    </div>
  );
}
