import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDatacenters, getServices, useQuery } from '../api';
import type { Service, Customer, ServiceType, ServiceStatus } from '../api/types';
import { usePage, PageHead, Loading } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { Chip, Kpi, SearchBox } from '../ui/kit';
import { CustLink, DcLink, Meter, NeLink, ServiceChip } from '../ui/status';
import { fmtBw, fmtMoney, fmtNum } from '../lib/format';
import '../styles/plan.css';

type Row = Service & { customer: Customer };
export const FAMILIES: ServiceType[] = ['IRV', 'Leased Line', 'L2VPN', 'L3VPN', 'Other'];
export const TYPE_TONE: Partial<Record<ServiceType, 'info' | 'purple' | 'cyan' | 'orange' | 'neutral'>> = { IRV: 'neutral', 'Leased Line': 'orange', L2VPN: 'purple', L3VPN: 'info', Other: 'cyan' };
const STATUSES: ServiceStatus[] = ['Active', 'Degraded', 'Down', 'Disabled'];
export const atRisk = (s: Service) => s.status === 'Degraded' || s.status === 'Down' || s.utilPct >= 90;

/* INV-07 at estate level — service instances, SLA, customer exposure (DC-INV-012, DC-NET-006/007) */
export function Services() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const type = sp.get('type') ?? '', status = sp.get('status') ?? '', dc = sp.get('dc') ?? '', prem = sp.get('premium') ?? '', q = sp.get('q') ?? '', risk = sp.get('risk') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  usePage([{ label: 'Services' }, { label: 'Network services' }]);
  const { data: all } = useQuery(() => getServices({}), []);
  const { data: dcs } = useQuery(getDatacenters, []);

  const rows = useMemo(() => (all ?? []).filter(s => (!type || s.type === type) && (!status || s.status === status) && (!dc || s.dcId === dc) && (!prem || s.critical) && (!risk || atRisk(s))
    && (!q || `${s.id} ${s.customer.name} ${s.neId} ${s.ifName}`.toLowerCase().includes(q.toLowerCase()))), [all, type, status, dc, prem, q, risk]);
  if (!all || !dcs) return <Loading />;

  const live = all.filter(s => s.status !== 'Disabled');
  const slaMet = live.filter(s => s.uptime30d >= s.slaTarget).length;
  const avgSla = live.length ? live.reduce((a, s) => a + s.uptime30d, 0) / live.length : 0;
  const customers = new Set(live.map(s => s.customerId)).size;
  const risky = all.filter(atRisk);
  const scope = rows;

  const cols: Col<Row>[] = [
    { key: 'id', header: 'Service', render: s => <span className="cell-2" style={{ gap: 3 }}><b className="mono strong">{s.id}</b><span><Chip tone={(TYPE_TONE[s.type] ?? 'neutral')} size="xs">{s.type}</Chip></span></span>, sort: s => s.id },
    { key: 'cust', header: 'Customer', render: s => <span className="cell-2"><CustLink id={s.customerId}>{s.customer.name}</CustLink><small>{s.customer.segment}{s.critical ? ' · premium' : ''}</small></span>, sort: s => s.customer.name },
    { key: 'ne', header: 'Datacenter · NE · handoff', render: s => <span className="cell-2"><span><DcLink id={s.dcId} /> · <NeLink id={s.neId} tab="services">{s.neId.replace(`${s.dcId}-`, '')}</NeLink></span><small className="mono">{s.ifName}</small></span>, sort: s => s.neId },
    { key: 'status', header: 'Status', render: s => <ServiceChip s={s.status} size="xs" />, sort: s => STATUSES.indexOf(s.status) },
    { key: 'util', header: 'Utilisation', render: s => <span className="cell-2"><Meter pct={s.utilPct} width={44} /><small>of {fmtBw(s.bandwidthMbps)}</small></span>, sort: s => s.utilPct },
    { key: 'up', header: 'SLA / 30-d uptime', align: 'right', render: s => <span className="cell-2 num" style={{ alignItems: 'flex-end' }}><span className={s.uptime30d < s.slaTarget ? 'bad' : ''}>{s.uptime30d}%</span><small>target {s.slaTarget}%</small></span>, sort: s => s.uptime30d - s.slaTarget },
    { key: 'rev', header: 'Rev / mo', align: 'right', render: s => <span className="num">{fmtMoney(s.revenueMonthly)}</span>, sort: s => s.revenueMonthly }
  ];

  return (
    <div className="page">
      <PageHead title="Network services" sub="Every provisioned service instance, the infrastructure it rides on and its customer exposure. Open a service to trace its path from customer handoff to backhaul." />
      <div className="kpis">
        <Kpi label="Total service instances" value={fmtNum(all.length)} icon={I.Waypoints} tone="info" basis={`across ${FAMILIES.length} service families · ${new Set(all.map(s => s.dcId)).size} datacenters`} onClick={() => setSp(new URLSearchParams(), { replace: true })} />
        <Kpi label="Average SLA compliance" value={avgSla.toFixed(2)} unit="%" icon={I.ShieldCheck} tone="success" basis={`rolling 30 days · ${slaMet} of ${live.length} at or above target`} />
        <Kpi label="Active customers" value={customers} icon={I.Users} tone="purple" basis="with at least one live service" onClick={() => nav('/customers')} />
        <Kpi label="Services at risk" value={risky.length} icon={I.TriangleAlert} tone="error" basis="degraded, down or ≥ 90% utilised" onClick={() => set('risk', risk ? '' : '1')} active={!!risk} />
      </div>
      <div className="fam-grid">
        {FAMILIES.map(f => {
          const xs = all.filter(s => s.type === f);
          const active = type === f;
          return (
            <button key={f} type="button" className={`card fam-card${active ? ' is-active' : ''}`} onClick={() => set('type', active ? '' : f)} aria-pressed={active}>
              <div className="row between"><b>{f}</b><span className="num fam-n">{xs.length}</span></div>
              <span className="muted" style={{ fontSize: 12 }}>{xs.length} services · {new Set(xs.map(s => s.customerId)).size} customers</span>
              <dl className="fam-dl">
                <div><dt>Active</dt><dd className="num">{xs.filter(s => s.status === 'Active').length}</dd></div>
                <div><dt>Degraded</dt><dd className={`num ${xs.some(s => s.status === 'Degraded') ? 'warn' : ''}`}>{xs.filter(s => s.status === 'Degraded').length}</dd></div>
                <div><dt>Down</dt><dd className={`num ${xs.some(s => s.status === 'Down') ? 'bad' : ''}`}>{xs.filter(s => s.status === 'Down').length}</dd></div>
                <div><dt>Avg util</dt><dd className="num">{xs.length ? Math.round(xs.reduce((a, s) => a + s.utilPct, 0) / xs.length) : 0}%</dd></div>
              </dl>
            </button>
          );
        })}
      </div>
      <section className="card">
        <DataTable rows={rows} cols={cols} onRow={s => nav(`/services/${s.id}`)} defaultSort={{ key: 'util', dir: 'desc' }} pageSize={25}
          toolbar={
            <div className="toolbar" style={{ width: '100%' }}>
              <span className="dt-count">Showing {fmtNum(rows.length)} of {fmtNum(all.length)}</span>
              <SearchBox value={q} onChange={v => set('q', v)} placeholder="Service ID, customer, NE, interface" width={280} />
              <select className="select" value={status} onChange={e => set('status', e.target.value)} aria-label="Status"><option value="">All statuses</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
              <select className="select" value={dc} onChange={e => set('dc', e.target.value)} aria-label="Datacenter"><option value="">All datacenters</option>{dcs.filter(d => d.services > 0).map(d => <option key={d.id} value={d.id}>{d.id} · {d.city}</option>)}</select>
              <label className="row" style={{ gap: 6, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={!!prem} onChange={e => set('premium', e.target.checked ? '1' : '')} />Premium only</label>
              {(type || status || dc || prem || q || risk) && <button type="button" className="panel-link" onClick={() => setSp(new URLSearchParams(), { replace: true })}><I.X size={13} />Clear filters</button>}
              <span className="grow" />
              <span className="faint" style={{ fontSize: 12 }}>{fmtMoney(scope.reduce((a, s) => a + s.revenueMonthly, 0))} / mo in view</span>
            </div>
          } />
      </section>
    </div>
  );
}
