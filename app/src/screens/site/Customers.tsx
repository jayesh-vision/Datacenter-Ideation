import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getServices, useQuery, usePersona } from '../../api';
import { DataTable, type Col } from '../../ui/DataTable';
import { Panel, SearchBox, Seg } from '../../ui/kit';
import { BarList } from '../../charts/BarList';
import { SummaryStrip } from './SummaryStrip';
import { fmtNum, fmtQty } from '../../lib/format';
import { SevDot } from '../../ui/status';
import type { ImpactCause } from '../../api/types';
import type { SiteData } from './Site';

type Cause = ImpactCause & { svcs: number };
type Row = { id: string; name: string; segment: string; premium: boolean; services: number; types: string[]; qty: number; degraded: number; down: number; impacted: number; causes: Cause[]; slaTarget: number; uptime: number; belowSla: number };
const SEV_RANK = { critical: 0, major: 1, minor: 2, warning: 3 } as const;
const risky = (r: Row) => r.degraded > 0 || r.belowSla > 0 || r.impacted > 0;
type View = 'all' | 'risk' | 'premium';

/* Who depends on this datacenter (customers, tenants, accounts or business
   units, by persona), who is impacted right now, and WHY: each row names the
   active fault on its own services' path (device, interface, link, rack or
   site), so a fault on 3 of 10 servers in a rack implicates only the
   customers on those 3. */
export function Customers({ data }: { data: SiteData }) {
  const { dc } = data;
  const { vocab } = usePersona();
  const [allCauses, setAllCauses] = useState(false);
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '', view = (sp.get('cview') ?? 'all') as View, cause = sp.get('cause') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v && v !== 'all' ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const { data: svcs } = useQuery(() => getServices({ dcId: dc.id }), [dc.id]);

  const rows = useMemo<Row[]>(() => {
    const by = new Map<string, Row>();
    for (const s of svcs ?? []) {
      const c = s.customer;
      const r = by.get(c.id) ?? { id: c.id, name: c.name, segment: c.segment, premium: c.premium, services: 0, types: [], qty: 0, degraded: 0, down: 0, impacted: 0, causes: [], slaTarget: 0, uptime: 100, belowSla: 0 };
      r.services++; if (s.unit === vocab.primaryUnit) r.qty += s.qty;
      if (!r.types.includes(s.type)) r.types.push(s.type);
      if (s.status === 'Degraded' || s.status === 'Down') r.degraded++;
      if (s.status === 'Down') r.down++;
      if (s.causes.length && s.status !== 'Disabled') {
        r.impacted++;
        for (const c of s.causes) { const e = r.causes.find(x => x.code === c.code); if (e) e.svcs++; else r.causes.push({ ...c, svcs: 1 }); }
      }
      r.slaTarget = Math.max(r.slaTarget, s.slaTarget); r.uptime = Math.min(r.uptime, s.uptime30d);
      if (s.uptime30d < s.slaTarget) r.belowSla++;
      by.set(c.id, r);
    }
    const out = [...by.values()];
    out.forEach(r => r.causes.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.svcs - a.svcs));
    return out;
  }, [svcs, vocab.primaryUnit]);
  /* the causes behind this site's impact, each with the customers it hits */
  const byCause = useMemo(() => {
    const m = new Map<string, { c: Cause; rows: Row[]; svcs: number }>();
    rows.forEach(r => r.causes.forEach(c => { const e = m.get(c.code) ?? { c, rows: [], svcs: 0 }; e.rows.push(r); e.svcs += c.svcs; m.set(c.code, e); }));
    return [...m.values()].sort((a, b) => SEV_RANK[a.c.severity] - SEV_RANK[b.c.severity] || b.rows.length - a.rows.length);
  }, [rows]);
  const shown = rows.filter(r => (view === 'all' || (view === 'risk' ? risky(r) : r.premium)) && (!cause || r.causes.some(c => c.code === cause)) && (!q || `${r.name} ${r.id} ${r.segment}`.toLowerCase().includes(q.toLowerCase())));
  if (!svcs) return null;

  const atRisk = rows.filter(risky);
  const activeCause = byCause.find(x => x.c.code === cause);
  const segs = Object.entries(rows.reduce<Record<string, number>>((a, r) => { a[r.segment] = (a[r.segment] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const types = Object.entries((svcs ?? []).reduce<Record<string, number>>((a, s) => { a[s.type] = (a[s.type] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);

  const cols: Col<Row>[] = [
    { key: 'name', header: vocab.customer, width: 200, wrap: true, sort: r => r.name, render: r => <span className="cell-2"><span className="strong" style={{ fontWeight: 500 }}>{r.name}{r.premium && <span className="vw-chip vw-chip--info cmd-chip cust-tier">{vocab.premium}</span>}</span><small>{r.id} · {r.segment}</small></span> },
    { key: 'svc', header: vocab.services, width: 150, wrap: true, sort: r => r.services, render: r => <span className="cell-2"><span className="num">{r.services}{r.qty ? <span className="faint"> · {fmtQty(r.qty, vocab.primaryUnit)}</span> : null}</span><small>{r.types.join(' · ')}</small></span> },
    { key: 'why', header: 'Why at risk', wrap: true, sort: r => (r.causes[0] ? SEV_RANK[r.causes[0].severity] : r.belowSla ? 8 : 9), render: r => <WhyCell r={r} total={r.services} unit={vocab.services.toLowerCase()} /> },
    { key: 'sla', header: 'SLA · 30 d', width: 104, sort: r => r.uptime - r.slaTarget, render: r => <span className="cell-2"><span className="num" style={{ color: r.uptime < r.slaTarget ? 'var(--vw-color-red-600)' : undefined }}>{r.uptime}%</span><small>target {r.slaTarget}%</small></span> },
    { key: 'state', header: 'Status', width: 108, sort: r => r.down * 1000 + r.degraded * 100 + r.impacted * 10 + r.belowSla, render: r => r.down ? <span className="vw-chip vw-chip--error cmd-chip">{r.down} down</span> : r.degraded ? <span className="vw-chip vw-chip--error cmd-chip">{r.degraded} degraded</span> : r.impacted ? <span className="vw-chip vw-chip--warning cmd-chip">At risk</span> : r.belowSla ? <span className="vw-chip vw-chip--warning cmd-chip">Below SLA</span> : <span className="vw-chip vw-chip--neutral cmd-chip">Normal</span> }
  ];

  return (
    <div className="col" style={{ gap: 16 }}>
      <SummaryStrip items={[
        { key: 'all', label: `${vocab.customers} served`, value: rows.length, sub: `${rows.filter(r => r.premium).length} ${vocab.premium.toLowerCase()}`, onClick: () => set('cview', ''), active: view === 'all' },
        { key: 'svc', label: `${vocab.services} from this DC`, value: fmtNum(svcs.length), sub: fmtQty(svcs.filter(s => s.unit === vocab.primaryUnit).reduce((a, s) => a + s.qty, 0), vocab.primaryUnit) + ' provisioned' },
        { key: 'risk', label: `${vocab.customers} at risk`, value: atRisk.length, sub: byCause.length ? `${byCause.length} active cause${byCause.length === 1 ? '' : 's'}` : 'degraded or below SLA', tone: atRisk.length ? 'warn' : undefined, onClick: () => set('cview', 'risk'), active: view === 'risk' },
        { key: 'prem', label: `${vocab.premium} affected`, value: atRisk.filter(r => r.premium).length, sub: `of ${rows.filter(r => r.premium).length} ${vocab.premium.toLowerCase()}`, tone: atRisk.some(r => r.premium) ? 'bad' : undefined, onClick: () => set('cview', 'premium'), active: view === 'premium' }
      ]} />
      <div className="grid cust-grid">
        <section className="card">
          <DataTable rows={shown} cols={cols} pageSize={15} defaultSort={{ key: 'state', dir: 'desc' }} onRow={r => nav(`/customers/${r.id}`)}
            toolbar={<div className="toolbar" style={{ width: '100%' }}>
              <Seg size="sm" value={view} onChange={v => set('cview', v)} options={[{ id: 'all', label: `All ${rows.length}` }, { id: 'risk', label: `At risk ${atRisk.length}` }, { id: 'premium', label: `${vocab.premium} ${rows.filter(r => r.premium).length}` }]} />
              {activeCause && <button type="button" className="vw-chip vw-chip--warning cmd-chip cust-cause-chip" onClick={() => set('cause', '')} title="Clear cause filter"><SevDot s={activeCause.c.severity} />{activeCause.c.title} · {activeCause.c.where}<I.X size={12} /></button>}
              <span className="grow" />
              <SearchBox value={q} onChange={v => set('q', v)} placeholder={vocab.searchHint} width={220} />
            </div>} />
        </section>
        <div className="col" style={{ gap: 16 }}>
          {byCause.length > 0 && (
            <Panel title="What is impacting them" icon={I.TriangleAlert} sub={`${byCause.length} active fault${byCause.length === 1 ? '' : 's'} on ${vocab.customer.toLowerCase()} paths · click to filter`}>
              <div className="cust-causes">
                {(allCauses ? byCause : byCause.slice(0, 6)).map(x => (
                  <button key={x.c.code} type="button" className={`cust-cause${cause === x.c.code ? ' is-on' : ''}`} onClick={() => set('cause', cause === x.c.code ? '' : x.c.code)}>
                    <span className="cust-cause-h"><SevDot s={x.c.severity} /><b>{x.c.title}</b></span>
                    <span className="cust-cause-w">{x.c.where} · {KIND[x.c.kind]}</span>
                    <span className="cust-cause-n">{x.rows.length} {(x.rows.length === 1 ? vocab.customer : vocab.customers).toLowerCase()} · {x.svcs} {vocab.services.toLowerCase()}</span>
                    <span className="cust-cause-who">{x.rows.slice(0, 3).map(r => r.name).join(', ')}{x.rows.length > 3 ? ` +${x.rows.length - 3}` : ''}</span>
                  </button>
                ))}
                {byCause.length > 6 && <button type="button" className="panel-link" onClick={() => setAllCauses(v => !v)}>{allCauses ? 'Show fewer' : `Show all ${byCause.length} faults`}</button>}
              </div>
            </Panel>
          )}
          <Panel title="By segment" icon={I.Building}><BarList items={segs.map(([k, v]) => ({ key: k, label: k, value: v, display: String(v) }))} /></Panel>
          <Panel title={`By ${vocab.service.toLowerCase()} type`} icon={I.Layers}><BarList items={types.map(([k, v]) => ({ key: k, label: k, value: v, display: String(v) }))} /></Panel>
        </div>
      </div>
    </div>
  );
}

const KIND: Record<ImpactCause['kind'], string> = { device: 'device fault', interface: 'port fault', link: 'link fault', rack: 'rack fault', site: 'site facility', utilisation: 'capacity' };

/* the reason a row is at risk: worst cause first, where it is, how much of the customer's load it hits */
function WhyCell({ r, total, unit }: { r: Row; total: number; unit: string }) {
  const c = r.causes[0];
  if (!c) return r.belowSla ? <span className="cell-2"><span className="cust-why-t">SLA missed over 30 days</span><small>no active fault now</small></span> : <span className="faint">—</span>;
  return (
    <span className="cell-2 cust-why">
      <span className="cust-why-t"><SevDot s={c.severity} />{c.title}{c.related ? <span className="faint" style={{ fontWeight: 400 }}> +{c.related} related</span> : null}</span>
      <small>{c.where} · {r.impacted} of {total} {unit}{r.causes.length > 1 ? ` · +${r.causes.length - 1} more cause${r.causes.length > 2 ? 's' : ''}` : ''}</small>
    </span>
  );
}
