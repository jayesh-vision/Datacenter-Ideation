import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDatacenters, useQuery } from '../api';
import type { DcSummary } from '../api/types';
import { usePage, Loading, useSentinel } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { SearchBox, Seg } from '../ui/kit';
import { Meter } from '../ui/status';
import { ROLLOUT } from '../lib/vocab';
import { fmtNum } from '../lib/format';
import '../styles/datacenters.css';

const REGIONS = [{ id: 'north', name: 'North' }, { id: 'east', name: 'East' }, { id: 'west', name: 'West' }, { id: 'south', name: 'South' }];
const ACCENT = 'var(--primaryColor500)', BAD = 'var(--vw-color-red-500)';
type View = 'all' | 'incidents' | 'facility' | 'edge' | 'clear';

/* Operational list of live datacenters: what is wrong at each site right
   now (incidents, alarms, network, power, cooling) and who it touches.
   Rollout and inventory views live outside this operations module. */
export function Datacenters() {
  const nav = useNavigate();
  const ask = useSentinel();
  const [sp, setSp] = useSearchParams();
  const region = sp.get('region') ?? '', q = sp.get('q') ?? '', view = (sp.get('view') ?? 'all') as View;
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v && v !== 'all' ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  usePage([{ label: 'Datacenters' }]);
  const { data } = useQuery(getDatacenters, []);
  const live = useMemo(() => (data ?? []).filter(d => d.status !== 'planned'), [data]);
  const rows = useMemo(() => live.filter(d => (!region || d.regionId === region)
    && (view === 'all' || (view === 'incidents' ? d.openIncidents > 0 : view === 'facility' ? d.facilityIssues.length > 0 : view === 'edge' ? d.edge.state !== 'redundant' : d.openIncidents === 0 && !d.facilityIssues.length && d.edge.state === 'redundant'))
    && (!q || `${d.name} ${d.city} ${d.state} ${d.address}`.toLowerCase().includes(q.toLowerCase()))), [live, region, view, q]);
  if (!data) return <Loading />;

  const cols: Col<DcSummary>[] = [
    { key: 'name', header: 'Datacenter', sort: d => d.name, render: d => (
      <span className="cell-2"><span className="vw-card-activity-label">{d.name}</span><small title={d.state}>{d.city} · {d.tier}{d.status !== 'on-air' ? ` · ${ROLLOUT[d.status].label}` : ''}</small></span>
    ) },
    { key: 'inc', header: 'Open incidents', sort: d => (d.worstSev ? 10 - d.worstSev : 0) * 100 + d.openIncidents, render: d => d.openIncidents
      ? <span className="vw-flex vw-items-center vw-gap-sm"><span className="dcl-num">{d.openIncidents}</span>{d.worstSev > 0 && <span className={`vw-chip ${d.worstSev === 1 ? 'vw-chip--error' : d.worstSev === 2 ? 'vw-chip--warning' : 'vw-chip--neutral'} dcl-chip`}>SEV{d.worstSev}</span>}</span>
      : <span className="vw-label">None</span> },
    { key: 'alarms', header: 'Alarms', align: 'right', sort: d => d.critAlerts * 1000 + d.activeAlerts, render: d => <span className="cell-2" style={{ alignItems: 'flex-end' }}><span className="dcl-num">{d.activeAlerts}</span><small style={{ color: d.critAlerts ? BAD : undefined }}>{d.critAlerts ? `${d.critAlerts} critical` : 'none critical'}</small></span> },
    { key: 'net', header: 'Network', sort: d => d.linksDown * 10 + d.unreachable, render: d => {
      const bits = [d.linksDown ? `${d.linksDown} link${d.linksDown === 1 ? '' : 's'} down` : '', d.unreachable ? `${d.unreachable} device${d.unreachable === 1 ? '' : 's'} unreachable` : ''].filter(Boolean);
      const edge = d.edge.state === 'isolated' ? <small style={{ color: BAD }}>Edge isolated · 0/{d.edge.total} up</small>
        : d.edge.state === 'redundancy-lost' ? <small className="dcl-warn" title="At least one link leaving the site is down; traffic is on the remaining paths">Edge redundancy lost · {d.edge.up}/{d.edge.total} up</small>
        : <small>Edge {d.edge.up}/{d.edge.total} up</small>;
      return <span className="cell-2">{bits.length ? bits.map(x => <span key={x}>{x}</span>) : <span className="vw-label">All up</span>}{edge}</span>;
    } },
    { key: 'load', header: 'Power · cooling', sort: d => Math.max(d.powerKw / d.powerCapKw * 100, d.coolPct), render: d => { const p = Math.round((d.powerKw / d.powerCapKw) * 100); return (
      <span className="dcl-load">
        <span><span className="vw-label">Power</span><Meter pct={p} color={p >= 85 ? BAD : ACCENT} width={48} /></span>
        <span><span className="vw-label">Cooling</span><Meter pct={d.coolPct} color={d.coolPct >= 85 ? BAD : ACCENT} width={48} /></span>
      </span>
    ); } },
    { key: 'fac', header: 'Facility', sort: d => d.facilityIssues.length, render: d => d.facilityIssues.length
      ? <span className="dcl-issue" title={d.facilityIssues.join(' · ')}><I.TriangleAlert size={13} />{d.facilityIssues[0]}{d.facilityIssues.length > 1 ? ` +${d.facilityIssues.length - 1}` : ''}</span>
      : <span className="vw-label">Normal</span> },
    { key: 'svc', header: 'Services', align: 'right', sort: d => d.servicesDegraded * 1000 + d.services, render: d => <span className="cell-2" style={{ alignItems: 'flex-end' }}><span className="dcl-num">{d.services} <span className="vw-label">· {d.customers} customers</span></span><small style={{ color: d.servicesDegraded ? BAD : undefined }}>{d.servicesDegraded ? `${d.servicesDegraded} degraded` : 'all active'}</small></span> }
  ];

  const tally = (xs: DcSummary[]) => ({ n: xs.length, inc: xs.reduce((a, d) => a + d.openIncidents, 0), hot: xs.filter(d => d.worstSev > 0 && d.worstSev <= 2).length, alarms: xs.reduce((a, d) => a + d.activeAlerts, 0), fac: xs.filter(d => d.facilityIssues.length).length });
  const all = tally(live);

  return (
    <div className="page">
      <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
        <div className="vw-flex vw-flex-col">
          <h1 className="vw-page-title">Datacenters</h1>
          <p className="vw-page-description" style={{ margin: '2px 0 0' }}>{all.n} live datacenters · {all.inc} open incidents · {all.alarms} active alarms · {all.fac} with a facility issue</p>
        </div>
        <button type="button" className="nst-btn nst-btn--sm nst-btn--filled" onClick={() => ask('Which datacenter needs attention first?')}><I.Sparkles size={15} />Ask Opstral AI</button>
      </div>

      <div className="dcl-regions">
        {REGIONS.map(r => {
          const t = tally(live.filter(d => d.regionId === r.id));
          const on = region === r.id;
          return (
            <button key={r.id} type="button" aria-pressed={on} className={`vw-card-section vw-card--clickable dcl-region${on ? ' is-on' : ''}`} onClick={() => set('region', on ? '' : r.id)}>
              <div className="vw-flex vw-justify-between vw-items-center"><span className="vw-card-metric-label">{r.name} region</span><span className="vw-label">{t.n} sites</span></div>
              <div className="vw-flex vw-items-baseline vw-gap-sm"><span className="vw-card-metric-lg">{t.inc}</span><span className="vw-label">open incidents</span></div>
              <div className={`vw-card-variance ${t.hot ? 'is-negative' : 'is-neutral'}`}>{t.hot ? `${t.hot} site${t.hot > 1 ? 's' : ''} with SEV1/2` : 'No SEV1/2'} · {t.alarms} alarms</div>
            </button>
          );
        })}
      </div>

      <p className="vw-footer-meta dcl-scope-note"><I.Info size={13} />Counts cover each site, its edge links (backhaul and uplinks) and what it depends on. Alarms from downstream PoPs and sites ({fmtNum(live.reduce((a, d) => a + d.downstreamExcluded, 0))} now) are not counted against a datacenter. <a href="/alerts?scope=downstream" onClick={e => { e.preventDefault(); nav('/alerts?scope=downstream'); }}>View them</a></p>
      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} onRow={d => nav(`/datacenters/${d.id}`)} defaultSort={{ key: 'inc', dir: 'desc' }} pageSize={30}
          toolbar={
            <div className="toolbar" style={{ width: '100%' }}>
              <span className="dt-count">{rows.length} of {live.length}</span>
              <SearchBox value={q} onChange={v => set('q', v)} placeholder="Datacenter, city, state" width={260} />
              <Seg size="sm" value={view} onChange={v => set('view', v)} options={[
                { id: 'all', label: `All ${live.length}` }, { id: 'incidents', label: `With incidents ${live.filter(d => d.openIncidents).length}` },
                { id: 'facility', label: `Facility issue ${all.fac}` }, { id: 'edge', label: `Edge redundancy lost ${live.filter(d => d.edge.state !== 'redundant').length}` }, { id: 'clear', label: `Clear ${live.filter(d => !d.openIncidents && !d.facilityIssues.length && d.edge.state === 'redundant').length}` }
              ]} />
              {(region || q || view !== 'all') && <button type="button" className="panel-link" onClick={() => setSp(new URLSearchParams(), { replace: true })}><I.X size={13} />Clear filters</button>}
              <span className="grow" />
              <span className="vw-label">{fmtNum(rows.reduce((a, d) => a + d.services, 0))} services</span>
            </div>
          } />
      </section>
    </div>
  );
}
