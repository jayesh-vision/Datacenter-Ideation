/* DCIM → Change requests (15-Oct-2026, user: "any change request raised from operations or via Change management should be highlighted in
   DCIM … so the user can check what is coming and execute it from DCIM"). Every CR at the site(s) — operations, maintenance, delivery
   (from planner plans) and DCIM — with the racks and devices it touches and its DCIM work; approved work runs from here. Plans still in
   review are listed underneath, before they reach Change management. */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, executeDcimChange, getDcimChangeBoard, getDcimWorkOf, useQuery } from '../../api';
import type { DcimCrRow } from '../../api/types';
import { Btn, Chip, Drawer, KV, Panel } from '../../ui/kit';
import { ChangeChip, DcLink } from '../../ui/status';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { SummaryStrip } from '../site/SummaryStrip';
import { fmtDateTime } from '../../lib/format';
import { useToast } from '../ops/shared';
import { CLASS_TONE } from '../changes/Changes';
import { CrWorkList } from './cr';

const DAY = 86_400_000;
type View = '' | 'ready' | 'approval' | 'progress' | 'soon' | 'done' | 'all';
const VIEW_LABEL: Record<Exclude<View, ''>, string> = { ready: 'Ready to run', approval: 'Awaiting approval', progress: 'In progress', soon: 'Next 14 days', done: 'Closed (30 days)', all: 'All' };
const SRC_TONE = { Operations: 'info', Maintenance: 'cyan', Delivery: 'purple', DCIM: 'neutral', MACD: 'info' } as const;
const isOpen = (r: DcimCrRow) => r.view !== 'done' && r.view !== 'closed';

export function DcimChangesTab({ dcId }: { dcId: string }) {
  const [sp, setSp] = useSearchParams();
  const apply = useParamPatch();
  const toast = useToast();
  const { data } = useQuery(() => getDcimChangeBoard({ dcId: dcId || undefined }), [dcId]);
  const [open, setOpen] = useState<string | null>(null);
  const view = (sp.get('cv') ?? '') as View, src = sp.get('csrc') ?? '', q = sp.get('q') ?? '';
  const setP = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const rows = data?.rows ?? [];
  const now = clockNow();
  const inView = (r: DcimCrRow, v: View) => v === 'all' ? true : v === '' ? isOpen(r) : v === 'soon' ? isOpen(r) && r.windowStart >= now - DAY && r.windowStart <= now + 14 * DAY : v === 'done' ? !isOpen(r) : r.view === v;
  const shown = useMemo(() => rows.filter(r => inView(r, view) && (!src || r.source === src) && (!q || `${r.id} ${r.title} ${r.racks.map(x => x.name).join(' ')}`.toLowerCase().includes(q.toLowerCase()))), [rows, view, src, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = (v: View) => rows.filter(r => inView(r, v)).length;
  const planned = rows.reduce((a, r) => a + r.work.planned + r.work.failed, 0);
  const cols: Col<DcimCrRow>[] = [
    { key: 'id', header: 'Change request', sort: r => r.id, render: r => <span className="cell-2"><span className="mono vw-card-activity-label">{r.id}</span><small className="dcim-cr-title">{r.title}</small></span> },
    { key: 'src', header: 'Source', sort: r => r.source, render: r => <span className="cell-2"><Chip size="xs" tone={SRC_TONE[r.source]}>{r.source}</Chip><small>{r.planId ? <Link className="ent-link mono" to={`/planning/plans/${r.planId}`} onClick={e => e.stopPropagation()}>{r.planId}</Link> : r.incidentId ? <span className="mono">{r.incidentId}</span> : <Chip size="xs" tone={CLASS_TONE[r.cls]}>{r.cls}</Chip>}</small></span> },
    ...(!dcId ? [{ key: 'dc', header: 'Datacenter', sort: (r: DcimCrRow) => r.dcId, render: (r: DcimCrRow) => <span className="mono">{r.dcId}</span> }] : []),
    { key: 'touch', header: 'Touches in DCIM', sort: r => r.racks.length * 1000 + r.devices, render: r => r.racks.length || r.devices ? <span className="cell-2"><span>{r.racks.slice(0, 2).map(x => x.name).join(', ')}{r.racks.length > 2 ? ` +${r.racks.length - 2}` : ''}{!r.racks.length ? '—' : ''}</span><small>{r.racks.length} rack{r.racks.length === 1 ? '' : 's'}{r.devices ? ` · ${r.devices} device${r.devices === 1 ? '' : 's'}` : ''}</small></span> : <span className="vw-label">site-wide</span> },
    { key: 'w', header: 'Window', sort: r => r.windowStart, render: r => <span className="cell-2"><span className="nowrap">{fmtDateTime(r.windowStart)}</span><small>{r.windowStart > now ? `in ${Math.max(1, Math.round((r.windowStart - now) / DAY))} d` : r.windowEnd > now ? 'running now' : 'past'}</small></span> },
    { key: 'st', header: 'Status', sort: r => r.status, render: r => <span className="cell-2"><ChangeChip s={r.status} /><small>{r.blocked ? <span className="dcim-err">on hold</span> : r.next ? `waiting: ${r.next}` : r.risk + ' risk'}</small></span> },
    { key: 'work', header: 'DCIM work', sort: r => r.work.planned * 100 + r.work.total, render: r => r.work.total ? <span className="cell-2"><span>{r.work.done} of {r.work.total} done</span><small className={r.work.failed ? 'dcim-err' : undefined}>{r.work.failed ? `${r.work.failed} failed` : r.work.planned ? `${r.work.planned} planned` : 'complete'}</small></span> : <span className="vw-label">none recorded</span> },
    { key: 'act', header: '', render: r => r.view === 'ready' && !r.blocked
      ? <Btn size="sm" variant="filled" icon={I.Play} onClick={e => { e.stopPropagation(); executeDcimChange(r.id).then(x => toast.show(`${x.filter(y => y.ok).length} of ${x.length} DCIM items done under ${r.id}`, x.filter(y => !y.ok).map(y => y.message).join(' · ') || 'Racks, devices and cables are updated.')); }}>Execute</Btn>
      : <Link className="ent-link" to={`/changes/${encodeURIComponent(r.id)}`} onClick={e => e.stopPropagation()}>Open</Link> }
  ];
  if (!data) return null;
  const pick = (v: View) => setP('cv', view === v ? '' : v);
  return (<>
    <SummaryStrip items={[
      { key: 'ready', label: 'Ready to run', value: n('ready'), sub: `${planned} item${planned === 1 ? '' : 's'} planned`, tone: n('ready') ? 'warn' : undefined, onClick: () => pick('ready'), active: view === 'ready', info: 'Approved (or in-progress) change requests with DCIM work still to do. Execute runs the planned edits in DCIM.' },
      { key: 'approval', label: 'Awaiting approval', value: n('approval'), sub: 'draft · pending', onClick: () => pick('approval'), active: view === 'approval', info: 'Change requests not yet approved. Their DCIM work stays planned until Change management approves them.' },
      { key: 'progress', label: 'In progress', value: n('progress'), sub: 'approved', onClick: () => pick('progress'), active: view === 'progress', info: 'Approved or running change requests with no DCIM work left to run here (field work, delivery, operations).' },
      { key: 'soon', label: 'Next 14 days', value: n('soon'), sub: 'window opens', onClick: () => pick('soon'), active: view === 'soon', info: 'Open change requests whose window starts in the next 14 days (or started today).' },
      { key: 'plans', label: 'Plans in review', value: data.plans.length, sub: 'no CR yet', onClick: () => document.querySelector('.dcim-plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), info: 'Planner plans for this scope still in draft or review: capacity, rack or device changes coming before they reach Change management.' },
      { key: 'done', label: 'Closed', value: n('done'), sub: 'last 30 days', onClick: () => pick('done'), active: view === 'done', info: 'Change requests completed, rolled back or rejected in the last 30 days.' }
    ]} />
    <section className="vw-card-section dcim-table">
      <DataTable rows={shown} cols={cols} pageSize={25} onRow={r => setOpen(r.id)} defaultSort={{ key: 'w', dir: 'asc' }} rowClass={r => (r.view === 'ready' ? 'is-ready' : '')}
        empty={<p className="vw-label" style={{ padding: 16 }}>No change request in this view{dcId ? ` at ${dcId}` : ''}.</p>}
        toolbar={<ListToolbar shown={shown.length} total={rows.length} noun="change requests" onApply={apply} search={{ value: q, onChange: v => setP('q', v), placeholder: 'CR, title, rack' }}
          actions={[{ label: 'Open Change management', icon: I.GitPullRequestArrow, onClick: () => window.location.assign(`/changes${dcId ? `?dc=${dcId}` : ''}`) }]}
          filters={[
            { id: 'cv', label: 'View', quick: true, value: view, anyLabel: `Open (${n('')})`, onChange: v => setP('cv', v), options: (Object.keys(VIEW_LABEL) as Exclude<View, ''>[]).map(v => ({ id: v, label: VIEW_LABEL[v], count: n(v) })) },
            { id: 'csrc', label: 'Source', quick: true, value: src, anyLabel: 'Any source', onChange: v => setP('csrc', v), options: (['Operations', 'Maintenance', 'Delivery', 'DCIM', 'MACD'] as const).map(s => ({ id: s, label: s, count: rows.filter(r => r.source === s).length })) }
          ]} />} />
    </section>
    <Panel title="Plans in review" icon={I.ClipboardList} count={data.plans.length} className="dcim-plans" info="Planner plans for this scope that are not approved yet. Once approved, Delivery raises their change requests and they appear in the list above.">
      {data.plans.length ? <ul className="dcim-work">{data.plans.map(p => <li key={p.id}><span className="cell-2"><b>{p.title}</b><small><span className="mono">{p.id}</span> · {p.scope} · <DcLink id={p.dcId} /></small></span><Chip size="xs" tone="warning" dot>{p.status}</Chip><Link className="ent-link" to={`/planning/plans/${p.id}`}>Open plan</Link></li>)}</ul>
        : <p className="vw-label">No plan in draft or review{dcId ? ` at ${dcId}` : ''}.</p>}
    </Panel>
    <CrDrawer row={rows.find(r => r.id === open) ?? null} onClose={() => setOpen(null)} />
    {toast.node}
  </>);
}

function CrDrawer({ row, onClose }: { row: DcimCrRow | null; onClose: () => void }) {
  const { data: work } = useQuery(() => (row ? getDcimWorkOf(row.id) : Promise.resolve([])), [row?.id]);
  const toast = useToast();
  if (!row) return null;
  const todo = (work ?? []).filter(w => w.state === 'Planned' || w.state === 'Failed').length;
  const live = row.status === 'Approved' || row.status === 'In progress';
  return (
    <Drawer open onClose={onClose} width={620} title={<span className="mono">{row.id}</span>} sub={row.title}
      foot={<>
        <Link className="nst-btn nst-btn--sm" to={`/changes/${encodeURIComponent(row.id)}`}>Open in Change management</Link>
        {todo > 0 && <Btn variant="filled" icon={I.Play} disabled={!live || !!row.blocked} title={!live ? 'Approve the change request first' : row.blocked} onClick={() => executeDcimChange(row.id).then(x => toast.show(`${x.filter(y => y.ok).length} of ${x.length} DCIM items done`, x.filter(y => !y.ok).map(y => y.message).join(' · ') || undefined))}>Execute all ({todo})</Btn>}
      </>}>
      <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: 'wrap' }}><ChangeChip s={row.status} /><Chip tone={CLASS_TONE[row.cls]}>{row.cls}</Chip><Chip tone={SRC_TONE[row.source]}>{row.source}</Chip><Chip tone={row.risk === 'High' ? 'warning' : 'neutral'}>{row.risk} risk</Chip></div>
      {row.blocked && <p className="pl-verdict is-blocked"><I.OctagonX size={16} />On hold: {row.blocked}</p>}
      <KV cols={2} items={[['Datacenter', <DcLink id={row.dcId} />], ['Window', `${fmtDateTime(row.windowStart)} → ${fmtDateTime(row.windowEnd)}`], ['Requested by', row.requester], ['Waiting for', row.next ?? (live ? 'nothing: approved' : '—')],
        ...(row.planId ? [['Plan', <Link className="ent-link mono" to={`/planning/plans/${row.planId}`}>{row.planId}</Link>] as [string, React.ReactNode]] : [])]} />
      <b className="dcim-sub-h">Touches in DCIM</b>
      {row.racks.length ? <div className="row wrap" style={{ gap: 6 }}>{row.racks.map(r => <Link key={r.id} className="dcim-crchip is-rack" to={`/dcim/racks/${encodeURIComponent(r.id)}`}><I.Server size={12} />{r.name}</Link>)}{row.devices > 0 && <span className="vw-label">{row.devices} device{row.devices === 1 ? '' : 's'}</span>}</div> : <p className="vw-label">No rack or device named: a site-wide change.</p>}
      <b className="dcim-sub-h">DCIM work ({work?.length ?? 0})</b>
      {work?.length ? <CrWorkList items={work} /> : <p className="vw-label">No DCIM edit recorded under this change request yet. Any DCIM form can add work to it: pick it under “Open CR”.</p>}
      {toast.node}
    </Drawer>
  );
}
