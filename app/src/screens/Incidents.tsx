import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getDatacenters, getIncidents, useQuery } from '../api';
import type { Incident } from '../api/types';
import { usePage, PageHead, Loading } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { Btn, SearchBox, Tabs } from '../ui/kit';
import { Fresh, IncidentChip, PriChip, SevChip } from '../ui/status';
import { fmtDateTime } from '../lib/format';
import { OpsKpi, downloadCsv, fmtHm, slaText } from './ops/shared';

type Row = Incident & { sla: { breaching: boolean; resolveLeft: number; responseBreached: boolean; responseMin: number } };
type View = 'open' | 'sev1' | 'breaching' | 'all';
export const TYPE_ICON: Record<Incident['type'], I.LucideIcon> = { Network: I.Network, Power: I.Zap, Cooling: I.Snowflake, Rack: I.Server, Capacity: I.Gauge, Security: I.ShieldAlert };
const isOpen = (i: Incident) => i.status === 'Open' || i.status === 'Investigating' || i.status === 'Mitigated';

/* Incident list (DC-OPS-001/002): KPI roll-up, views and SLA clocks. */
export function Incidents() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const view = (sp.get('view') ?? 'open') as View, dc = sp.get('dc') ?? '', q = sp.get('q') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  usePage([{ label: 'Operate' }, { label: 'Incidents' }], dc ? { dcId: dc } : {});
  const { data: all, reload } = useQuery(() => getIncidents({}), []);
  const { data: dcs } = useQuery(getDatacenters, []);
  const now = clockNow();

  const scoped = useMemo(() => ((all ?? []) as Row[]).filter(i => (!dc || i.dcId === dc) && (!q || `${i.id} ${i.title} ${i.owner} ${i.dcId}`.toLowerCase().includes(q.toLowerCase()))), [all, dc, q]);
  const rows = useMemo(() => scoped.filter(i => view === 'all' ? true : view === 'sev1' ? isOpen(i) && i.sev === 1 : view === 'breaching' ? i.sla.breaching : isOpen(i)), [scoped, view]);
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
    { key: 'type', header: 'Type', width: 96, render: i => { const Ic = TYPE_ICON[i.type]; return <span className="row" style={{ gap: 8 }}><span className={`type-ico t-${i.type.toLowerCase()}`}><Ic size={13} /></span>{i.type}</span>; }, sort: i => i.type },
    { key: 'sev', header: 'Sev', width: 62, render: i => <SevChip n={i.sev} size="xs" />, sort: i => -i.sev },
    { key: 'pri', header: 'Pri', width: 52, render: i => <PriChip n={i.pri} size="xs" />, sort: i => -i.pri },
    { key: 'sla', header: 'SLA', width: 128, render: i => (isOpen(i) ? <span className={`num nowrap ${i.sla.resolveLeft < 0 ? 'bad strong' : i.sla.breaching ? 'warn' : ''}`}>{slaText(i.sla.resolveLeft)}{i.sla.resolveLeft >= 0 && i.sla.responseBreached && <small className="bad" style={{ display: 'block', fontSize: 11 }}>response breached</small>}</span> : <span className="muted num">{i.resolved ? `MTTR ${fmtHm((i.resolved - i.detected) / 60000)}` : '—'}</span>), sort: i => (isOpen(i) ? i.sla.resolveLeft : 1e9) },
    { key: 'owner', header: 'Owner', width: 118, wrap: true, render: i => <span className="strong" style={{ fontWeight: 400 }}>{i.owner}</span>, sort: i => i.owner },
    { key: 'det', header: 'Detected', width: '15%', render: i => <span className="num nowrap">{fmtDateTime(i.detected)}</span>, sort: i => i.detected }
  ];
  const exportCsv = () => downloadCsv(`incidents-${view}.csv`, [['ID', 'Status', 'Title', 'Type', 'Severity', 'Priority', 'Datacenter', 'Owner', 'Detected', 'Resolved', 'SLA'],
    ...rows.map(i => [i.id, i.status, i.title, i.type, `SEV${i.sev}`, `P${i.pri}`, i.dcId, i.owner, fmtDateTime(i.detected), i.resolved ? fmtDateTime(i.resolved) : '', isOpen(i) ? slaText(i.sla.resolveLeft) : ''])]);

  return (
    <div className="page">
      <PageHead title="Incidents" sub="Correlated operational incidents with SLA clocks, impact and owner." actions={<Fresh>Live · SLA clocks tick from detection</Fresh>} />
      <div className="kpis">
        <OpsKpi label="Open incidents" value={open.length} sub={`${open.filter(i => i.sev === 1).length} SEV1 · ${open.filter(i => i.sev === 2).length} SEV2 · ${open.filter(i => i.status === 'Mitigated').length} mitigated`} onClick={() => set('view', '')} active={view === 'open'} />
        <OpsKpi label="SLA breaching" value={scoped.filter(i => i.sla.breaching).length} tone="bad" sub="response or resolution target missed" onClick={() => set('view', 'breaching')} active={view === 'breaching'} />
        <OpsKpi label="Mean time to resolve" value={fmtHm(mttr)} sub={`${res30.length} resolved in the last 30 days`} />
        <OpsKpi label="SLA compliance" value={`${slaPct}%`} tone={slaPct < 90 ? 'warn' : undefined} sub={`${met} of ${res30.length} resolved within target`} />
      </div>
      <section className="card">
        <DataTable rows={rows} cols={cols} onRow={i => nav(`/incidents/${i.id}`)} defaultSort={{ key: 'id', dir: 'desc' }} pageSize={25}
          toolbar={<div className="ops-strip">
            <Tabs<View> value={view} onChange={v => set('view', v === 'open' ? '' : v)} tabs={[
              { id: 'open', label: 'Open', count: scoped.filter(isOpen).length }, { id: 'sev1', label: 'SEV1', count: scoped.filter(i => isOpen(i) && i.sev === 1).length },
              { id: 'breaching', label: 'Breaching', count: scoped.filter(i => i.sla.breaching).length }, { id: 'all', label: 'All', count: scoped.length }]} />
            <span className="grow" />
            <select className="select" value={dc} onChange={e => set('dc', e.target.value)} aria-label="Datacenter"><option value="">All datacenters ({dcs.length})</option>{dcs.map(d => <option key={d.id} value={d.id}>{d.id} · {d.city}</option>)}</select>
            <SearchBox value={q} onChange={v => set('q', v)} placeholder="Search incidents…" width={220} />
            <Btn icon={I.Download} onClick={exportCsv}>Export</Btn>
            <Btn icon={I.RefreshCw} title="Refresh" onClick={reload} />
          </div>} />
      </section>
    </div>
  );
}
