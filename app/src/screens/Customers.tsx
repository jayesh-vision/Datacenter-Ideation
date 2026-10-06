import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { moneyIcon } from '../ui/Money';
import { getCustomers, useQuery } from '../api';
import type { Customer } from '../api/types';
import { usePage, PageHead, Loading } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { Chip, Kpi, SearchBox } from '../ui/kit';
import { Meter } from '../ui/status';
import { fmtMoney } from '../lib/format';
import '../styles/plan.css';

type Row = Customer & { services: number; dcs: number; avgUtil: number; minUptime: number; exposed: number };
const SEGMENTS: Customer['segment'][] = ['Enterprise', 'Carrier', 'Government', 'BFSI', 'Healthcare', 'Media'];

/* DC-NET-007/008 — who consumes the estate, and who is exposed right now */
export function Customers() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const seg = sp.get('segment') ?? '', prem = sp.get('premium') ?? '', exp = sp.get('exposed') ?? '', q = sp.get('q') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  usePage([{ label: 'Services' }, { label: 'Customers' }]);
  const { data: all } = useQuery(getCustomers, []);
  const rows = useMemo(() => (all ?? []).filter(c => (!seg || c.segment === seg) && (!prem || c.premium) && (!exp || c.exposed > 0) && (!q || `${c.name} ${c.id} ${c.city}`.toLowerCase().includes(q.toLowerCase()))), [all, seg, prem, exp, q]);
  if (!all) return <Loading />;
  const exposed = all.filter(c => c.exposed > 0);
  const rev = all.reduce((a, c) => a + c.revenueMonthly, 0);

  const cols: Col<Row>[] = [
    { key: 'name', header: 'Customer', render: c => <span className="cell-2"><b className="strong">{c.name}</b><small className="mono">{c.id} · {c.city} · AM {c.accountManager}</small></span>, sort: c => c.name },
    { key: 'seg', header: 'Segment · plan', render: c => <span className="cell-2"><span className="row" style={{ gap: 6 }}>{c.segment}{c.premium && <Chip tone="purple" size="xs">Premium</Chip>}</span><small>{c.plan}</small></span>, sort: c => c.segment },
    { key: 'svc', header: 'Services', align: 'right', render: c => <span className="cell-2 num" style={{ alignItems: 'flex-end' }}>{c.services}<small>{c.dcs} DCs</small></span>, sort: c => c.services },
    { key: 'util', header: 'Avg util', render: c => <Meter pct={c.avgUtil} width={56} />, sort: c => c.avgUtil },
    { key: 'up', header: 'Min uptime', align: 'right', render: c => <span className={`num ${c.minUptime < 99.5 ? 'warn' : ''}`}>{c.services ? `${c.minUptime}%` : '—'}</span>, sort: c => c.minUptime },
    { key: 'exp', header: 'Exposed', align: 'right', render: c => c.exposed ? <Chip tone="error" size="xs">{c.exposed} service{c.exposed > 1 ? 's' : ''}</Chip> : <span className="faint">—</span>, sort: c => c.exposed },
    { key: 'rev', header: 'Revenue/mo', align: 'right', render: c => <span className="num">{fmtMoney(c.revenueMonthly)}</span>, sort: c => c.revenueMonthly },
  ];

  return (
    <div className="page">
      <PageHead title="Customers" sub="Customer portfolio across the estate with live service exposure. A customer is exposed when one of its services is degraded or sits on the scope of an open incident." />
      <div className="kpis">
        <Kpi label="Customers" value={all.length} icon={I.Users} tone="info" basis={`${all.filter(c => c.premium).length} premium · ${SEGMENTS.length} segments`} onClick={() => setSp(new URLSearchParams(), { replace: true })} />
        <Kpi label="Exposed now" value={exposed.length} icon={I.ShieldAlert} tone="error" basis={`${exposed.filter(c => c.premium).length} premium · ${exposed.reduce((a, c) => a + c.exposed, 0)} services`} onClick={() => set('exposed', exp ? '' : '1')} active={!!exp} />
        <Kpi label="Recurring revenue" value={fmtMoney(rev)} unit="/ mo" icon={moneyIcon()} tone="purple" basis={`${fmtMoney(rev * 12)} annualised`} />
        <Kpi label="Revenue exposed" value={fmtMoney(exposed.reduce((a, c) => a + c.revenueMonthly, 0))} unit="/ mo" icon={I.TriangleAlert} tone="warning" basis="monthly revenue of exposed customers" />
      </div>
      <section className="card">
        <DataTable rows={rows} cols={cols} onRow={c => nav(`/customers/${c.id}`)} defaultSort={{ key: 'rev', dir: 'desc' }} pageSize={40}
          toolbar={
            <div className="toolbar" style={{ width: '100%' }}>
              <span className="dt-count">Showing {rows.length} of {all.length}</span>
              <SearchBox value={q} onChange={v => set('q', v)} placeholder="Name, id, city" width={260} />
              <select className="select" value={seg} onChange={e => set('segment', e.target.value)} aria-label="Segment"><option value="">All segments</option>{SEGMENTS.map(s => <option key={s}>{s}</option>)}</select>
              <label className="row" style={{ gap: 6, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={!!prem} onChange={e => set('premium', e.target.checked ? '1' : '')} />Premium only</label>
              <label className="row" style={{ gap: 6, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={!!exp} onChange={e => set('exposed', e.target.checked ? '1' : '')} />Exposed only</label>
              {(seg || prem || exp || q) && <button type="button" className="panel-link" onClick={() => setSp(new URLSearchParams(), { replace: true })}><I.X size={13} />Clear filters</button>}
            </div>
          } />
      </section>
    </div>
  );
}
