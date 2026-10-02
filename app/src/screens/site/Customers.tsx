import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getServices, useQuery } from '../../api';
import { DataTable, type Col } from '../../ui/DataTable';
import { Panel, SearchBox, Seg } from '../../ui/kit';
import { BarList } from '../../charts/BarList';
import { SummaryStrip } from './SummaryStrip';
import { fmtBw, fmtNum } from '../../lib/format';
import type { SiteData } from './Site';

type Row = { id: string; name: string; segment: string; premium: boolean; services: number; types: string[]; bwMbps: number; degraded: number; slaTarget: number; uptime: number; belowSla: number };
type View = 'all' | 'risk' | 'premium';

/* Customers served from this datacenter — who depends on the site and
   whose services are currently degraded or below SLA. */
export function Customers({ data }: { data: SiteData }) {
  const { dc } = data;
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '', view = (sp.get('cview') ?? 'all') as View;
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v && v !== 'all' ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const { data: svcs } = useQuery(() => getServices({ dcId: dc.id }), [dc.id]);

  const rows = useMemo<Row[]>(() => {
    const by = new Map<string, Row>();
    for (const s of svcs ?? []) {
      const c = s.customer;
      const r = by.get(c.id) ?? { id: c.id, name: c.name, segment: c.segment, premium: c.premium, services: 0, types: [], bwMbps: 0, degraded: 0, slaTarget: 0, uptime: 100, belowSla: 0 };
      r.services++; r.bwMbps += s.bandwidthMbps;
      if (!r.types.includes(s.type)) r.types.push(s.type);
      if (s.status === 'Degraded' || s.status === 'Down') r.degraded++;
      r.slaTarget = Math.max(r.slaTarget, s.slaTarget); r.uptime = Math.min(r.uptime, s.uptime30d);
      if (s.uptime30d < s.slaTarget) r.belowSla++;
      by.set(c.id, r);
    }
    return [...by.values()];
  }, [svcs]);
  const shown = rows.filter(r => (view === 'all' || (view === 'risk' ? r.degraded > 0 || r.belowSla > 0 : r.premium)) && (!q || `${r.name} ${r.id} ${r.segment}`.toLowerCase().includes(q.toLowerCase())));
  if (!svcs) return null;

  const atRisk = rows.filter(r => r.degraded > 0 || r.belowSla > 0);
  const segs = Object.entries(rows.reduce<Record<string, number>>((a, r) => { a[r.segment] = (a[r.segment] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const types = Object.entries((svcs ?? []).reduce<Record<string, number>>((a, s) => { a[s.type] = (a[s.type] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);

  const cols: Col<Row>[] = [
    { key: 'name', header: 'Customer', wrap: true, sort: r => r.name, render: r => <span className="cell-2"><span className="strong" style={{ fontWeight: 500 }}>{r.name}</span><small>{r.id} · {r.segment}</small></span> },
    { key: 'tier', header: 'Tier', width: 88, sort: r => (r.premium ? 0 : 1), render: r => <span className={`vw-chip ${r.premium ? 'vw-chip--info' : 'vw-chip--neutral'} cmd-chip`}>{r.premium ? 'Premium' : 'Standard'}</span> },
    { key: 'svc', header: 'Services', width: 140, wrap: true, sort: r => r.services, render: r => <span className="cell-2"><span className="num">{r.services}</span><small>{r.types.join(' · ')}</small></span> },
    { key: 'bw', header: 'Bandwidth', width: 96, align: 'right', sort: r => r.bwMbps, render: r => <span className="num">{fmtBw(r.bwMbps)}</span> },
    { key: 'sla', header: 'SLA · 30 d', width: 104, sort: r => r.uptime - r.slaTarget, render: r => <span className="cell-2"><span className="num" style={{ color: r.uptime < r.slaTarget ? 'var(--vw-color-red-600)' : undefined }}>{r.uptime}%</span><small>target {r.slaTarget}%</small></span> },
    { key: 'state', header: 'Status', width: 112, sort: r => -(r.degraded * 10 + r.belowSla), render: r => r.degraded ? <span className="vw-chip vw-chip--error cmd-chip">{r.degraded} degraded</span> : r.belowSla ? <span className="vw-chip vw-chip--warning cmd-chip">Below SLA</span> : <span className="vw-chip vw-chip--neutral cmd-chip">Normal</span> }
  ];

  return (
    <div className="col" style={{ gap: 16 }}>
      <SummaryStrip items={[
        { key: 'all', label: 'Customers served', value: rows.length, sub: `${rows.filter(r => r.premium).length} premium`, onClick: () => set('cview', ''), active: view === 'all' },
        { key: 'svc', label: 'Services from this DC', value: fmtNum(svcs.length), sub: fmtBw(svcs.reduce((a, s) => a + s.bandwidthMbps, 0)) + ' provisioned' },
        { key: 'risk', label: 'Customers at risk', value: atRisk.length, sub: 'degraded or below SLA', tone: atRisk.length ? 'warn' : undefined, onClick: () => set('cview', 'risk'), active: view === 'risk' },
        { key: 'prem', label: 'Premium affected', value: atRisk.filter(r => r.premium).length, sub: `of ${rows.filter(r => r.premium).length} premium`, tone: atRisk.some(r => r.premium) ? 'bad' : undefined, onClick: () => set('cview', 'premium'), active: view === 'premium' }
      ]} />
      <div className="grid cust-grid">
        <section className="card">
          <DataTable rows={shown} cols={cols} pageSize={15} defaultSort={{ key: 'state', dir: 'desc' }} onRow={r => nav(`/customers/${r.id}`)}
            toolbar={<div className="toolbar" style={{ width: '100%' }}>
              <Seg size="sm" value={view} onChange={v => set('cview', v)} options={[{ id: 'all', label: `All ${rows.length}` }, { id: 'risk', label: `At risk ${atRisk.length}` }, { id: 'premium', label: `Premium ${rows.filter(r => r.premium).length}` }]} />
              <span className="grow" />
              <SearchBox value={q} onChange={v => set('q', v)} placeholder="Customer, ID, segment" width={220} />
            </div>} />
        </section>
        <div className="col" style={{ gap: 16 }}>
          <Panel title="By segment" icon={I.Building}><BarList items={segs.map(([k, v]) => ({ key: k, label: k, value: v, display: String(v) }))} /></Panel>
          <Panel title="By service type" icon={I.Layers}><BarList items={types.map(([k, v]) => ({ key: k, label: k, value: v, display: String(v) }))} /></Panel>
        </div>
      </div>
    </div>
  );
}
