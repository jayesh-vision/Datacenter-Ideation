import { SEV_TONE, sevLabel } from '../lib/vocab';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getDatacenters, getIncidents, useQuery, vocabNow } from '../api';
import type { Incident } from '../api/types';
import { usePage, PageHead, Loading } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { ListToolbar, useParamPatch } from '../ui/ListToolbar';
import { Fresh, IncidentChip, SevChip } from '../ui/status';
import { fmtDate, fmtDateTime, fmtMoney, fmtTime } from '../lib/format';
import { downloadCsv, fmtHm, slaText } from './ops/shared';
import { Facts, SoftMeter, Split, StatGrid, StatTile, type Tone } from '../ui/Analytics';
import '../styles/revenue.css';

type Row = Incident & { sla: { breaching: boolean; resolveLeft: number; responseBreached: boolean; responseMin: number }; revenue: { rank: number; rate: number; impact: number; atRisk: number; exposed: number; potentialRate: number; cliffMin: number | null; underPrioritised: boolean } | null };
type View = 'open' | 'sev1' | 'high' | 'breaching' | 'all';
export const TYPE_ICON: Record<Incident['type'], I.LucideIcon> = { Network: I.Network, Power: I.Zap, Cooling: I.Snowflake, Rack: I.Server, Capacity: I.Gauge, Security: I.ShieldAlert, GPU: I.Cpu };
const isOpen = (i: Incident) => i.status === 'Open' || i.status === 'Investigating' || i.status === 'Mitigated';

/* Incident list (DC-OPS-001/002): KPI roll-up, views and SLA clocks. */
export function Incidents() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const applyParams = useParamPatch();
  const view = (sp.get('view') ?? 'open') as View, dc = sp.get('dc') ?? '', q = sp.get('q') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  usePage([{ label: 'Operate' }, { label: 'Incidents' }], dc ? { dcId: dc } : {});
  const { data: all, reload } = useQuery(() => getIncidents({}), []);
  const { data: dcs } = useQuery(getDatacenters, []);
  const now = clockNow();

  const scoped = useMemo(() => ((all ?? []) as Row[]).filter(i => (!dc || i.dcId === dc) && (!q || `${i.id} ${i.title} ${i.owner} ${i.dcId}`.toLowerCase().includes(q.toLowerCase()))), [all, dc, q]);
  const rows = useMemo(() => scoped.filter(i => view === 'all' ? true : view === 'sev1' ? isOpen(i) && i.sev === 1 : view === 'high' ? isOpen(i) && i.sev === 2 : view === 'breaching' ? i.sla.breaching : isOpen(i)), [scoped, view]);
  if (!all || !dcs) return <Loading />;

  const open = scoped.filter(isOpen);
  const res30 = scoped.filter(i => i.resolved && i.resolved > now - 30 * 86400000);
  const mttr = res30.length ? res30.reduce((a, i) => a + (i.resolved! - i.detected), 0) / res30.length / 60000 : 0;
  const met = res30.filter(i => (i.resolved! - i.detected) / 60000 <= i.resolveSlaMin).length;
  const slaPct = res30.length ? Math.round((met / res30.length) * 100) : 100;

  const cols: Col<Row>[] = [
    { key: 'status', header: 'Status', width: 112, render: i => <IncidentChip s={i.status} />, sort: i => ['Open', 'Investigating', 'Mitigated', 'Resolved', 'Closed'].indexOf(i.status) },
    { key: 'id', header: 'ID', width: 86, render: i => <span className="mono strong">{i.id}</span>, sort: i => Number(i.id.slice(4)) },
    { key: 'title', header: 'Title', render: i => <span className="cell-2"><span className="strong" style={{ fontWeight: 500 }}>{i.title}</span><small>{i.dcId} · {i.impact.services ? `${i.impact.services} services · ${i.impact.customers} customers` : 'no customer service affected'}</small></span>, wrap: true },
    { key: 'type', header: 'Type', width: 60, render: i => { const Ic = TYPE_ICON[i.type]; return <span className={`type-ico t-${i.type.toLowerCase()}`} title={i.type} aria-label={i.type}><Ic size={13} /></span>; }, sort: i => i.type },
    { key: 'sev', header: 'Severity', width: 96, render: i => <SevChip n={i.sev} size="xs" />, sort: i => -(i.sev * 10 + i.pri) },
    { key: 'sla', header: 'SLA', width: 128, render: i => (isOpen(i) ? <span className={`num nowrap ${i.sla.resolveLeft < 0 ? 'bad strong' : i.sla.breaching ? 'warn' : ''}`}>{slaText(i.sla.resolveLeft)}{i.sla.resolveLeft >= 0 && i.sla.responseBreached && <small className="bad" style={{ display: 'block', fontSize: 11 }}>response breached</small>}</span> : <span className="muted num">{i.resolved ? `MTTR ${fmtHm((i.resolved - i.detected) / 60000)}` : '—'}</span>), sort: i => (isOpen(i) ? i.sla.resolveLeft : 1e9) },
    /* what the incident is costing: the hourly loss and the total so far, or what is riding on it */
    { key: 'rev', header: vocabNow().money.noun, sort: i => (i.revenue ? i.revenue.impact + i.revenue.rate * 1e3 + i.revenue.exposed / 1e4 : -1), render: i => { const r = isOpen(i) ? i.revenue : null; return !r ? <span className="faint">—</span>
      : r.rate + r.impact > 0 ? <span className="cell-2"><span className="num nowrap rev-amt rev-bad">{fmtMoney(r.rate)}/h</span><small className="nowrap" title={r.underPrioritised ? `Ranks #${r.rank} by impact — review its priority` : undefined}>{fmtMoney(r.impact)} so far</small></span>
      : <span className="cell-2"><span className="num nowrap">{fmtMoney(r.exposed)}/mo</span><small className="nowrap">at stake</small></span>; } },
    { key: 'owner', header: 'Owner', width: 118, wrap: true, render: i => <span className="strong" style={{ fontWeight: 400 }}>{i.owner}</span>, sort: i => i.owner },
    { key: 'det', header: 'Detected', width: '15%', hideBelow: 1340, render: i => <span className="cell-2"><span className="num">{fmtDate(i.detected)}</span><small className="num">{fmtTime(i.detected)}</small></span>, sort: i => i.detected }
  ];
  const exportCsv = () => downloadCsv(`incidents-${view}.csv`, [['ID', 'Status', 'Title', 'Type', 'Severity', 'Priority', 'Datacenter', 'Owner', 'Detected', 'Resolved', 'SLA', 'Losing per hour', 'Impact so far', 'Monthly at stake'],
    ...rows.map(i => [i.id, i.status, i.title, i.type, sevLabel(i.sev), `P${i.pri}`, i.dcId, i.owner, fmtDateTime(i.detected), i.resolved ? fmtDateTime(i.resolved) : '', isOpen(i) ? slaText(i.sla.resolveLeft) : '', i.revenue?.rate ?? 0, i.revenue?.impact ?? 0, i.revenue?.exposed ?? 0])]);

  return (
    <div className="page">
      <PageHead title="Incidents" sub="Correlated operational incidents with SLA clocks, impact and owner." actions={<Fresh>Live · SLA clocks tick from detection</Fresh>} />
      <IncidentAnalytics open={open} res30={res30} mttr={mttr} met={met} slaPct={slaPct} view={view} onView={v => set('view', v === 'open' ? '' : v)} />
      <section className="card">
        <DataTable rows={rows} cols={cols} onRow={i => nav(`/incidents/${i.id}`)} defaultSort={{ key: 'id', dir: 'desc' }} pageSize={25}
          toolbar={
            <ListToolbar onApply={applyParams} shown={rows.length} total={scoped.length} onRefresh={reload}
              search={{ value: q, onChange: v => set('q', v), placeholder: 'ID, title, owner, datacenter' }}
              actions={[{ label: 'Export CSV', icon: I.Download, onClick: exportCsv }]}
              filters={[
                { id: 'view', label: 'View', quick: true, value: view, defaultValue: 'open', onChange: v => set('view', v === 'open' ? '' : v), options: [
                  { id: 'open', label: 'Open', count: scoped.filter(isOpen).length }, { id: 'sev1', label: 'Critical open', count: scoped.filter(i => isOpen(i) && i.sev === 1).length },
                  { id: 'high', label: 'High open', count: scoped.filter(i => isOpen(i) && i.sev === 2).length },
                  { id: 'breaching', label: 'Breaching SLA', count: scoped.filter(i => i.sla.breaching).length }, { id: 'all', label: 'All incidents', count: scoped.length }] },
                { id: 'dc', label: 'Datacenter', quick: true, value: dc, anyLabel: 'Any datacenter', onChange: v => set('dc', v), options: dcs.map(d => ({ id: d.id, label: `${d.id} · ${d.city}` })) }
              ]} />
          } />
      </section>
    </div>
  );
}

/* analytics strip: how much is open, how it stands against SLA, what kind, how fast we close, who is hit */
const TYPE_TONE: Record<string, Tone> = { Network: 'info', Power: 'purple', Cooling: 'cyan', Rack: 'orange', Capacity: 'warning', Security: 'neutral', GPU: 'info' };
function IncidentAnalytics({ open, res30, mttr, met, slaPct, view, onView }: { open: Row[]; res30: Row[]; mttr: number; met: number; slaPct: number; view: string; onView: (v: string) => void }) {
  const V = vocabNow();
  const breached = open.filter(i => i.sla.breaching);
  const atRisk = open.filter(i => !i.sla.breaching && i.sla.resolveLeft < i.resolveSlaMin * 0.25);
  const unack = open.filter(i => !i.acknowledged).length;
  const types = ['Network', 'GPU', 'Power', 'Cooling', 'Rack', 'Capacity', 'Security'];
  const svc = open.reduce((a, i) => a + i.impact.services, 0), cust = open.reduce((a, i) => a + i.impact.customers, 0), prem = open.reduce((a, i) => a + i.impact.premium, 0);
  return (
    <StatGrid>
      <StatTile label="Open incidents" value={open.length} sub={`${open.filter(i => i.sev <= 2).length} critical / high`} subTone={open.some(i => i.sev === 1) ? 'bad' : undefined} onClick={() => onView('open')} active={view === 'open'} info="Incidents in Open, Investigating or Mitigated status, split by severity. Click the tile for the Open view; click Critical or High in the legend for that severity only.">
        <Split parts={[1, 2, 3, 4].map(n => ({ key: `s${n}`, label: sevLabel(n), n: open.filter(i => i.sev === n).length, tone: SEV_TONE[n] }))} onPick={k => k === 's1' ? onView('sev1') : k === 's2' && onView('high')} active={view === 'sev1' ? 's1' : view === 'high' ? 's2' : undefined} />
      </StatTile>
      <StatTile label="SLA clock" value={breached.length} sub="past SLA" subTone={breached.length ? 'bad' : undefined} onClick={() => onView('breaching')} active={view === 'breaching'} info="Open incidents past SLA: resolution time used up, or the response time missed. Due soon = less than a quarter of the resolution SLA left. Click to list the breaching incidents.">
        <Split parts={[{ key: 'b', label: 'Breached', n: breached.length, tone: 'error' }, { key: 'r', label: 'Due soon', n: atRisk.length, tone: 'warning' }, { key: 'ok', label: 'On track', n: open.length - breached.length - atRisk.length, tone: 'success' }]} />
      </StatTile>
      <StatTile label="Progress" value={`${open.length ? Math.round((open.filter(i => i.status !== 'Open').length / open.length) * 100) : 100}%`} sub="being worked" info="Share of open incidents that have moved past Open into Investigating or Mitigated. The fact counts open incidents nobody has acknowledged yet.">
        <Split parts={[{ key: 'o', label: 'Open', n: open.filter(i => i.status === 'Open').length, tone: 'error' }, { key: 'i', label: 'Investigating', n: open.filter(i => i.status === 'Investigating').length, tone: 'warning' }, { key: 'm', label: 'Mitigated', n: open.filter(i => i.status === 'Mitigated').length, tone: 'info' }]} />
        <Facts items={[{ n: unack, label: 'not acknowledged', tone: unack ? 'warn' : undefined }]} />
      </StatTile>
      <StatTile label="By type" value={types.filter(t => open.some(i => i.type === t)).length} sub="types open" info="How many incident types (Network, GPU, Power, Cooling, Rack, Capacity, Security) have an open incident right now, and how the open incidents split between them.">
        <Split parts={types.map(t => ({ key: t, label: t, n: open.filter(i => i.type === t).length, tone: TYPE_TONE[t] })).filter(p => p.n)} />
      </StatTile>
      <StatTile label="Resolution · 30 days" value={fmtHm(mttr)} sub="MTTR" info="Mean time to resolve (detected to resolved) for incidents resolved in the last 30 days. The meter is the share of those that were resolved inside their resolution SLA.">
        <SoftMeter pct={slaPct} tone={slaPct >= 90 ? 'success' : slaPct >= 75 ? 'warning' : 'error'} />
        <Facts items={[{ n: `${slaPct}%`, label: 'within SLA', tone: slaPct < 90 ? 'warn' : undefined }, { n: `${met}/${res30.length}`, label: 'resolved in time' }]} />
      </StatTile>
      <StatTile label={`${V.customer} impact`} value={svc} sub={`${V.services.toLowerCase()} affected`} info={`${V.services} on the affected scope of open incidents, summed across incidents, by impact level (High = Critical or two or more ${V.premium.toLowerCase()} ${V.customers.toLowerCase()} hit). The fact counts ${V.premium.toLowerCase()} and all ${V.customers.toLowerCase()} affected.`}>
        <Split parts={[{ key: 'h', label: 'High', n: open.filter(i => i.impact.level === 'High').length, tone: 'error' }, { key: 'm', label: 'Medium', n: open.filter(i => i.impact.level === 'Medium').length, tone: 'warning' }, { key: 'l', label: 'Low', n: open.filter(i => i.impact.level === 'Low').length, tone: 'neutral' }]} />
        <Facts items={[{ n: prem, label: `${V.premium.toLowerCase()} · ${cust} total`, tone: prem ? 'bad' : undefined }]} />
      </StatTile>
    </StatGrid>
  );
}
