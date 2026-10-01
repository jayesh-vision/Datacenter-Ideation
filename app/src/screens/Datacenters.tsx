import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDatacenters, getEstate, useQuery } from '../api';
import type { DcSummary } from '../api/types';
import { usePage, PageHead, Loading, useSentinel } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { Chip, Menu, SearchBox } from '../ui/kit';
import { Legend, Meter, RolloutChip, StackBar } from '../ui/status';
import { REGION_TONE, ROLLOUT, ROLLOUT_ORDER } from '../lib/vocab';
import { fmtNum } from '../lib/format';

/* INV-01 — Datacenters, filtered list: regional roll-up cards filter the
   table; every row opens the site profile. Filters live in the URL. */
export function Datacenters() {
  const nav = useNavigate();
  const ask = useSentinel();
  const [sp, setSp] = useSearchParams();
  const region = sp.get('region') ?? '', status = sp.get('status') ?? '', q = sp.get('q') ?? '', cov = sp.get('cov') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  usePage([{ label: 'Location', to: '/inventory' }, { label: 'Datacenters — filtered list' }]);
  const { data: dcs } = useQuery(getDatacenters, []);
  const { data: est } = useQuery(getEstate, []);

  const rows = useMemo(() => (dcs ?? []).filter(d => (!region || d.regionId === region) && (!status || d.status === status) && (!cov || (cov === 'gap' ? d.coveragePct < 100 : d.drifted > 0))
    && (!q || `${d.name} ${d.city} ${d.address} ${d.state}`.toLowerCase().includes(q.toLowerCase()))), [dcs, region, status, q, cov]);

  if (!dcs || !est) return <Loading />;
  const cols: Col<DcSummary>[] = [
    { key: 'status', header: 'Status', render: d => <RolloutChip s={d.status} />, sort: d => ROLLOUT_ORDER.indexOf(d.status) },
    { key: 'name', header: 'Name', render: d => <span className="mono strong">{d.name}</span>, sort: d => d.name },
    { key: 'cat', header: 'Category', render: d => <Chip tone="warning" size="xs">{d.category}</Chip> },
    { key: 'type', header: 'Site type', render: d => <span className="cell-2">Datacenter<small>{d.tier}</small></span> },
    { key: 'addr', header: 'Address', render: d => <span className="cell-2"><span className="nowrap">{d.address}</span><small>{d.city} · {d.state}</small></span>, sort: d => d.city },
    { key: 'ne', header: 'NE', align: 'right', render: d => <span className="num">{d.ne}</span>, sort: d => d.ne },
    { key: 'disc', header: 'Discovered', align: 'right', render: d => <span className="num">{d.discovered}</span>, sort: d => d.discovered },
    { key: 'cov', header: 'Coverage', render: d => <Meter pct={d.coveragePct} color={d.coveragePct === 100 ? 'var(--vw-color-emerald-500)' : 'var(--vw-color-amber-400)'} />, sort: d => d.coveragePct },
    { key: 'drift', header: 'Drifted', align: 'right', render: d => <span className={`num ${d.drifted ? 'warn' : 'faint'}`}>{d.drifted}</span>, sort: d => d.drifted },
    { key: 'alarms', header: 'Alarms', align: 'right', render: d => <span className="cell-2 num" style={{ alignItems: 'flex-end' }}>{d.activeAlerts}{d.critAlerts > 0 && <small className="bad">{d.critAlerts} critical</small>}</span>, sort: d => d.critAlerts * 1000 + d.activeAlerts },
    { key: 'inc', header: 'Incidents', align: 'right', render: d => <span className={`num ${d.openIncidents ? 'bad' : 'faint'}`}>{d.openIncidents}</span>, sort: d => d.openIncidents },
    { key: 'act', header: '', width: 44, render: d => (
      <Menu items={[
        { label: 'Open site profile', icon: I.Building2, onClick: () => nav(`/datacenters/${d.id}`) },
        { label: 'Attention & reconciliation', icon: I.TriangleAlert, onClick: () => nav(`/datacenters/${d.id}?tab=attention`) },
        { label: 'Network elements', icon: I.Router, onClick: () => nav(`/datacenters/${d.id}?tab=elements`) },
        { label: 'Site equipment & cabling', icon: I.Cable, onClick: () => nav(`/datacenters/${d.id}?tab=equipment`) },
        { label: 'Topology', icon: I.Network, onClick: () => nav(`/topology?dc=${d.id}`) },
        { label: `Ask Sentinel: what is at risk?`, icon: I.Sparkles, onClick: () => ask(`What is at risk in ${d.id}?`), sep: true }
      ]} />
    ) }
  ];

  return (
    <div className="page">
      <PageHead title="Datacenters" sub="Every datacenter in the estate with rollout status, discovery coverage and live operational load. Pick a region to filter; open a row for the site profile." />
      <div className="grid g-4">
        {est.regions.map(r => {
          const st = r.status, n = r.locations;
          const active = region === r.id;
          return (
            <button key={r.id} type="button" className={`card rollup${active ? ' is-active' : ''}`} style={{ '--rc': REGION_TONE[r.id] } as React.CSSProperties} onClick={() => set('region', active ? '' : r.id)} aria-pressed={active}>
              <h4>{r.name} region</h4>
              <div className="big">{n}<small>locations</small></div>
              <div className="sub">{n ? Math.round((st['on-air'] / n) * 100) : 0}% on-air · {st.failed} failed</div>
              <StackBar parts={ROLLOUT_ORDER.map(s => ({ value: st[s], color: ROLLOUT[s].color, label: ROLLOUT[s].label }))} />
              <Legend items={ROLLOUT_ORDER.map(s => ({ label: <><b className="num" style={{ fontWeight: 500 }}>{st[s]}</b> {ROLLOUT[s].label.toLowerCase()}</>, color: ROLLOUT[s].color }))} />
            </button>
          );
        })}
      </div>
      <section className="card">
        <DataTable rows={rows} cols={cols} onRow={d => nav(`/datacenters/${d.id}`)} defaultSort={{ key: 'name', dir: 'asc' }} pageSize={30}
          toolbar={
            <div className="toolbar" style={{ width: '100%' }}>
              <span className="dt-count">Showing {rows.length} of {dcs.length}</span>
              <SearchBox value={q} onChange={v => set('q', v)} placeholder="Name, location ID, city" width={300} />
              <select className="select" value={status} onChange={e => set('status', e.target.value)} aria-label="Status">
                <option value="">All statuses</option>{ROLLOUT_ORDER.map(s => <option key={s} value={s}>{ROLLOUT[s].label}</option>)}
              </select>
              <select className="select" value={cov} onChange={e => set('cov', e.target.value)} aria-label="Discovery">
                <option value="">Any discovery state</option><option value="gap">Coverage below 100%</option><option value="drift">Has drifted records</option>
              </select>
              {(region || status || q || cov) && <button type="button" className="panel-link" onClick={() => setSp(new URLSearchParams(), { replace: true })}><I.X size={13} />Clear filters</button>}
              <span className="grow" />
              <span className="faint" style={{ fontSize: 12 }}>{fmtNum(rows.reduce((a, d) => a + d.ne, 0))} NE · {fmtNum(rows.reduce((a, d) => a + d.discovered, 0))} discovered</span>
            </div>
          } />
      </section>
    </div>
  );
}
