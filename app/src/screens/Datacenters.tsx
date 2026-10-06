import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, geoNow, getAlerts, getDatacenters, getIncidents, useQuery, vocabNow } from '../api';
import type { DcSummary, Severity } from '../api/types';
import { usePage, Loading, useSentinel } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { ListToolbar, useParamPatch } from '../ui/ListToolbar';
import { Meter } from '../ui/status';
import { ROLLOUT, SEVERITY } from '../lib/vocab';
import { fmtMoney, fmtNum } from '../lib/format';
import '../styles/datacenters.css';
import { OpstralBtn } from '../ui/OpstralMark';
import { DcCard } from './ops/DcCard';
import { Facts, SOFT, SoftMeter, Split, StatGrid, StatTile, type Tone } from '../ui/Analytics';

const REGIONS = () => geoNow().regions;
const ACCENT = 'var(--primaryColor500)', BAD = 'var(--vw-color-red-500)';
type View = 'all' | 'incidents' | 'facility' | 'edge' | 'clear';

/* Operational list of live datacenters: what is wrong at each site right
   now (incidents, alarms, network, power, cooling) and who it touches.
   Rollout and inventory views live outside this operations module. */
export function Datacenters() {
  const nav = useNavigate();
  const ask = useSentinel();
  const [sp, setSp] = useSearchParams();
  const applyParams = useParamPatch();
  const region = sp.get('region') ?? '', q = sp.get('q') ?? '', view = (sp.get('view') ?? 'all') as View;
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v && v !== 'all' ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  usePage([{ label: 'Datacenters' }]);
  const { data, reload } = useQuery(getDatacenters, []);
  /* region cards fold away (collapsed by default, remembered per browser) */
  const [layout, setLayout] = useState<'list' | 'tiles'>(() => { try { return localStorage.getItem('dco.dcl.layout') === 'tiles' ? 'tiles' : 'list'; } catch { return 'list'; } });
  const setLayoutPersist = (v: 'list' | 'tiles') => { setLayout(v); try { localStorage.setItem('dco.dcl.layout', v); } catch { /* storage blocked */ } };
  const now = clockNow();
  const [regOpen, setRegOpen] = useState(() => { try { return localStorage.getItem('dco.dcl.regions') === 'open'; } catch { return false; } });
  const { data: alarms } = useQuery(() => getAlerts({ state: 'open', scope: 'dc' }), []);
  const { data: incs } = useQuery(() => getIncidents({ status: 'open' }), []);
  const live = useMemo(() => (data ?? []).filter(d => d.status !== 'planned'), [data]);
  const rows = useMemo(() => live.filter(d => (!region || d.regionId === region)
    && (view === 'all' || (view === 'incidents' ? d.openIncidents > 0 : view === 'facility' ? d.facilityIssues.length > 0 : view === 'edge' ? d.edge.state !== 'redundant' : d.openIncidents === 0 && !d.facilityIssues.length && d.edge.state === 'redundant'))
    && (!q || `${d.name} ${d.city} ${d.state} ${d.address}`.toLowerCase().includes(q.toLowerCase()))), [live, region, view, q]);
  if (!data || !alarms || !incs) return <Loading />;

  const cols: Col<DcSummary>[] = [
    { key: 'name', header: 'Datacenter', sort: d => d.name, render: d => (
      <span className="cell-2"><span className="vw-card-activity-label">{d.name}</span><small title={d.state}>{d.city} · {d.tier}{d.status !== 'on-air' ? ` · ${ROLLOUT[d.status].label}` : ''}</small></span>
    ) },
    { key: 'inc', header: 'Open incidents', sort: d => (d.worstSev ? 10 - d.worstSev : 0) * 100 + d.openIncidents, render: d => d.openIncidents
      ? <span className="vw-flex vw-items-center vw-gap-sm"><span className="dcl-num">{d.openIncidents}</span>{d.worstSev > 0 && <span className={`vw-chip ${d.worstSev === 1 ? 'vw-chip--error' : d.worstSev === 2 ? 'vw-chip--warning' : 'vw-chip--neutral'} dcl-chip`}>SEV{d.worstSev}</span>}</span>
      : <span className="vw-label">None</span> },
    { key: 'alarms', header: 'Alarms', align: 'right', sort: d => d.critAlerts * 1000 + d.activeAlerts, render: d => <span className="cell-2" style={{ alignItems: 'flex-end' }}><span className="dcl-num">{d.activeAlerts}</span><small className="nowrap" style={{ color: d.critAlerts ? BAD : undefined }}>{d.critAlerts ? `${d.critAlerts} critical` : 'none critical'}</small></span> },
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
    { key: 'svc', header: vocabNow().services, align: 'right', sort: d => d.servicesDegraded * 1000 + d.services, render: d => <span className="cell-2" style={{ alignItems: 'flex-end' }}><span className="dcl-num nowrap">{d.services} <span className="vw-label">· {d.customers} {vocabNow().customers.toLowerCase()}</span></span><small className="nowrap" style={{ color: d.servicesDegraded ? BAD : undefined }}>{d.servicesDegraded ? `${d.servicesDegraded} degraded` : 'all active'}</small></span> },
    /* money view of the same site: what it hosts, what it is losing per hour, or what rides on a critical fault */
    { key: 'rev', header: vocabNow().money.noun, sort: d => d.revRate * 1e6 + d.revExposed / 1e3 + d.mrr / 1e9, render: d => (d.mrr
      ? <Link to={`/datacenters/${d.id}?tab=revenue`} className="cell-2 dcl-rev" onClick={e => e.stopPropagation()} title={`Open ${d.id} · ${vocabNow().money.impact}`}>
        <span className="dcl-num nowrap">{fmtMoney(d.mrr)}<span className="vw-label"> /mo</span></span>
        <small className="nowrap" style={{ color: d.revRate ? BAD : d.revExposed ? '#926e00' : undefined }}>{d.revRate ? `losing ${fmtMoney(d.revRate)}/h` : d.revExposed ? `${fmtMoney(d.revExposed)} at stake` : 'no impact'}</small>
      </Link>
      : <span className="vw-label">—</span>) }
  ];

  const tally = (xs: DcSummary[]) => ({ n: xs.length, inc: xs.reduce((a, d) => a + d.openIncidents, 0), hot: xs.filter(d => d.worstSev > 0 && d.worstSev <= 2).length, alarms: xs.reduce((a, d) => a + d.activeAlerts, 0), fac: xs.filter(d => d.facilityIssues.length).length });
  const all = tally(live);

  const V = vocabNow();
  const toggleReg = () => setRegOpen(o => { try { localStorage.setItem('dco.dcl.regions', o ? 'collapsed' : 'open'); } catch { /* storage blocked */ } return !o; });
  return (
    <div className="page">
      <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
        <div className="vw-flex vw-flex-col">
          <h1 className="vw-page-title">Datacenters</h1>
          <p className="vw-page-description" style={{ margin: '2px 0 0' }}>Live operational state of every datacenter, its edge links and the {V.customers.toLowerCase()} it serves</p>
        </div>
        <OpstralBtn onClick={() => ask('Which datacenter needs attention first?')} />
      </div>

      <EstateOverview live={live} alarms={alarms} incs={incs} onView={v => set('view', v)} />

      <section className={`vw-card-section dcl-regsec${regOpen ? '' : ' is-folded'}`}>
        <button type="button" className="dcl-regsec-h" onClick={toggleReg} aria-expanded={regOpen}>
          <I.ChevronDown size={16} className="dcl-fold" />
          <span className="dcl-regsec-t">Regions</span>
          <span className="dcl-regsec-sum">{REGIONS().map(r => { const ss = live.filter(d => d.regionId === r.id).map(stateOf); const w: SiteState = ss.includes('critical') ? 'critical' : ss.includes('attention') ? 'attention' : 'normal'; return <span key={r.id} className={`vw-chip vw-chip--${STATE_META[w].tone} dco-pill`}><i className="chip-dot" />{r.name} · {ss.length} sites</span>; })}</span>
          <span className="dcl-regsec-hint">{regOpen ? 'Collapse' : 'Expand'}</span>
        </button>
        {regOpen && <>
      <div className="dcl-regions">
        {REGIONS().map(r => <RegionCard key={r.id} name={r.name} sites={live.filter(d => d.regionId === r.id)} incs={incs} on={region === r.id} onClick={() => set('region', region === r.id ? '' : r.id)} onSite={id => nav(`/datacenters/${id}`)} />)}
      </div>

      <p className="vw-footer-meta dcl-scope-note"><I.Info size={13} />Counts cover each site, its edge links (backhaul and uplinks) and what it depends on. Alarms from downstream PoPs and sites ({fmtNum(live.reduce((a, d) => a + d.downstreamExcluded, 0))} now) are not counted against a datacenter. <a href="/alerts?scope=downstream" onClick={e => { e.preventDefault(); nav('/alerts?scope=downstream'); }}>View them</a></p>
        </>}
      </section>
      <section className="vw-card-section dcl-table">
        {(() => {
          const toolbar = (
            <ListToolbar layout={{ value: layout, onChange: setLayoutPersist }} onApply={applyParams} shown={rows.length} total={live.length} onRefresh={reload}
              search={{ value: q, onChange: v => set('q', v), placeholder: 'Datacenter, city, state' }}
              filters={[
                { id: 'view', label: 'Condition', quick: true, value: view, defaultValue: 'all', onChange: v => set('view', v), options: [
                  { id: 'all', label: 'All datacenters', count: live.length }, { id: 'incidents', label: 'With incidents', count: live.filter(d => d.openIncidents).length },
                  { id: 'facility', label: 'Facility issue', count: all.fac }, { id: 'edge', label: 'Edge redundancy lost', count: live.filter(d => d.edge.state !== 'redundant').length },
                  { id: 'clear', label: 'Clear', count: live.filter(d => !d.openIncidents && !d.facilityIssues.length && d.edge.state === 'redundant').length }] },
                { id: 'region', label: 'Region', quick: true, value: region, anyLabel: 'Any region', onChange: v => set('region', v), options: [...new Set(live.map(d => d.regionId))].map(r => ({ id: r, label: r[0].toUpperCase() + r.slice(1), count: live.filter(d => d.regionId === r).length })) }
              ]} />
          );
          if (layout === 'list') return <DataTable rows={rows} cols={cols} onRow={d => nav(`/datacenters/${d.id}`)} defaultSort={{ key: 'inc', dir: 'desc' }} pageSize={30} toolbar={toolbar} />;
          const rank = (d: DcSummary) => (d.worstSev ? 10 - d.worstSev : 0) * 100 + d.openIncidents + (stateOf(d) !== 'normal' ? 0.5 : 0);
          return (
            <div className="dt">
              <div className="dt-toolbar">{toolbar}</div>
              <div className="dcl-tiles">
                {[...rows].sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name)).map(d => {
                  const worst = incs.filter(i => i.dcId === d.id).sort((a, b) => a.sev - b.sev || Number(b.sla.breaching) - Number(a.sla.breaching) || a.sla.resolveLeft - b.sla.resolveLeft)[0];
                  const site = { id: d.id, city: d.city, state: d.state, tier: d.tier, siteOpen: d.openIncidents };
                  if (worst) return <DcCard key={d.id} now={now} site={site} inc={{ ...worst, cause: worst.rca[0]?.cause ?? 'Under investigation', confidence: worst.rca[0]?.confidence ?? 0, nextAction: worst.actions.find(a => a.status !== 'done' && a.status !== 'rejected')?.step ?? null, awaitingApproval: worst.actions.filter(a => a.disruptive && (a.status === 'pending' || a.status === 'awaiting-approval')).length }} />;
                  const net = [d.linksDown ? `${d.linksDown} link${d.linksDown === 1 ? '' : 's'} down` : '', d.unreachable ? `${d.unreachable} device${d.unreachable === 1 ? '' : 's'} unreachable` : ''].filter(Boolean).join(' · ');
                  const fac = d.facilityIssues[0];
                  return <DcCard key={d.id} now={now} site={site} quiet={{ state: stateOf(d) === 'normal' ? 'normal' : 'attention', alarms: d.activeAlerts, critAlarms: d.critAlerts, services: d.services, degraded: d.servicesDegraded, customers: d.customers,
                    powerPct: d.powerCapKw ? Math.round((d.powerKw / d.powerCapKw) * 100) : 0, coolPct: d.coolPct, noteLabel: fac ? 'Facility' : 'Network & edge',
                    note: fac ? d.facilityIssues.join(' · ') : `${net || 'All links up'} · edge ${d.edge.up}/${d.edge.total} up${d.edge.state === 'redundant' ? '' : d.edge.state === 'isolated' ? ' — isolated' : ' — redundancy lost'}` }} />;
                })}
                {!rows.length && <div className="dcl-tiles-empty">No datacenter matches these filters.</div>}
              </div>
            </div>
          );
        })()}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------ analytics */

type SiteState = 'critical' | 'attention' | 'normal';
const STATE_META: Record<SiteState, { label: string; color: string; tone: Tone }> = {
  critical: { label: 'Critical', color: SOFT.error, tone: 'error' }, attention: { label: 'Needs attention', color: SOFT.warning, tone: 'warning' }, normal: { label: 'Normal', color: SOFT.success, tone: 'success' }
};
/* same rule as the datacenter page's site status */
const stateOf = (d: DcSummary): SiteState => d.worstSev === 1 || d.facilityIssues.some(f => /on battery|fault/i.test(f)) || d.edge.state === 'isolated' ? 'critical'
  : d.openIncidents || d.critAlerts || d.linksDown || d.unreachable || d.facilityIssues.length || d.edge.state !== 'redundant' ? 'attention' : 'normal';
const SEV_TONE: Record<number, Tone> = { 1: 'error', 2: 'orange', 3: 'warning', 4: 'neutral' };
const ALM_TONE: Record<Severity, Tone> = { critical: 'error', major: 'orange', minor: 'warning', warning: 'neutral' };
type Inc = Awaited<ReturnType<typeof getIncidents>>[number];
type Alm = Awaited<ReturnType<typeof getAlerts>>[number];

function EstateOverview({ live, alarms, incs, onView }: { live: DcSummary[]; alarms: Alm[]; incs: Inc[]; onView: (v: string) => void }) {
  const V = vocabNow();
  const st = live.map(stateOf);
  const cnt = (s: SiteState) => st.filter(x => x === s).length;
  const sev = (n: number) => incs.filter(i => i.sev === n).length;
  const past = incs.filter(i => i.sla.breaching).length;
  const asev = (s: Severity) => alarms.filter(a => a.severity === s).length;
  const unack = alarms.filter(a => a.state === 'active').length;
  const powKw = live.reduce((a, d) => a + d.powerKw, 0), capKw = live.reduce((a, d) => a + d.powerCapKw, 0), powPct = capKw ? Math.round((powKw / capKw) * 100) : 0;
  const fac = live.filter(d => d.facilityIssues.length);
  const hotPower = live.filter(d => d.powerCapKw && d.powerKw / d.powerCapKw >= 0.75).length;
  const edgeLost = live.filter(d => d.edge.state === 'redundancy-lost').length, isolated = live.filter(d => d.edge.state === 'isolated').length;
  const linksDown = live.reduce((a, d) => a + d.linksDown, 0), unreach = live.reduce((a, d) => a + d.unreachable, 0);
  const svc = live.reduce((a, d) => a + d.services, 0), deg = live.reduce((a, d) => a + d.servicesDegraded, 0);
  const custHit = live.filter(d => d.servicesDegraded).length;
  return (
    <StatGrid>
      <StatTile label="Site status" value={live.length} sub="live datacenters">
        <Split parts={(['critical', 'attention', 'normal'] as SiteState[]).map(s => ({ key: s, label: STATE_META[s].label, n: cnt(s), tone: STATE_META[s].tone }))} />
      </StatTile>
      <StatTile label="Open incidents" value={incs.length} sub={past ? `${past} past SLA` : 'all within SLA'} subTone={past ? 'bad' : undefined}>
        <Split parts={[1, 2, 3, 4].map(n => ({ key: `s${n}`, label: `SEV${n}`, n: sev(n), tone: SEV_TONE[n] }))} />
      </StatTile>
      <StatTile label="Active alarms" value={fmtNum(alarms.length)} sub={`${fmtNum(unack)} unacked`}>
        <Split parts={(['critical', 'major', 'minor', 'warning'] as Severity[]).map(s => ({ key: s, label: SEVERITY[s].label, n: asev(s), tone: ALM_TONE[s] }))} />
      </StatTile>
      <StatTile label="Power & facility" value={`${powPct}%`} sub={`of ${fmtNum(Math.round(capKw))} kW`}>
        <SoftMeter pct={powPct} tone={powPct >= 85 ? 'error' : powPct >= 75 ? 'warning' : 'info'} />
        <Facts items={[{ n: fac.length, label: `facility issue${fac.length === 1 ? '' : 's'}`, tone: fac.length ? 'bad' : undefined, onClick: () => onView('facility') }, { n: hotPower, label: `site${hotPower === 1 ? '' : 's'} at ≥75% power` }]} />
      </StatTile>
      <StatTile label="Edge redundancy" value={live.length - edgeLost - isolated} sub={`of ${live.length} redundant`}>
        <Split parts={[{ key: 'red', label: 'Full', n: live.length - edgeLost - isolated, tone: 'success' }, { key: 'lost', label: 'Partial', n: edgeLost, tone: 'warning' }, { key: 'iso', label: 'Isolated', n: isolated, tone: 'error' }]} onPick={k => k !== 'red' && onView('edge')} />
        <Facts items={[{ n: linksDown, label: 'links down' }, { n: unreach, label: 'devices unreachable' }]} />
      </StatTile>
      <StatTile label={`${V.customer} impact`} value={deg} sub={`of ${fmtNum(svc)} degraded`}>
        <SoftMeter pct={svc ? Math.max(2, (deg / svc) * 100) : 0} tone={deg ? 'warning' : 'success'} />
        <Facts items={[{ n: custHit, label: `site${custHit === 1 ? '' : 's'} affected` }]} />
      </StatTile>
    </StatGrid>
  );
}

function RegionCard({ name, sites, incs, on, onClick, onSite }: { name: string; sites: DcSummary[]; incs: Inc[]; on: boolean; onClick: () => void; onSite: (id: string) => void }) {
  const states = sites.map(d => ({ d, s: stateOf(d) }));
  const worst = [...states].sort((a, b) => ['critical', 'attention', 'normal'].indexOf(a.s) - ['critical', 'attention', 'normal'].indexOf(b.s) || (a.d.worstSev || 9) - (b.d.worstSev || 9) || b.d.critAlerts - a.d.critAlerts)[0];
  const rState: SiteState = worst?.s ?? 'normal';
  const inc = sites.reduce((a, d) => a + d.openIncidents, 0), hot = sites.filter(d => d.worstSev && d.worstSev <= 2).length;
  const alarms = sites.reduce((a, d) => a + d.activeAlerts, 0), crit = sites.reduce((a, d) => a + d.critAlerts, 0);
  const pk = sites.reduce((a, d) => a + d.powerKw, 0), cap = sites.reduce((a, d) => a + d.powerCapKw, 0), pp = cap ? Math.round((pk / cap) * 100) : 0;
  const why = worst && worst.s !== 'normal' ? (worst.d.facilityIssues[0] ?? incs.filter(i => i.dcId === worst.d.id).sort((a, b) => a.sev - b.sev)[0]?.title.replace(`${worst.d.id}-`, '').replace(` in ${worst.d.id}`, '') ?? (worst.d.edge.state !== 'redundant' ? 'Edge redundancy lost' : `${worst.d.critAlerts} critical alarms`)) : null;
  return (
    <div role="button" tabIndex={0} aria-pressed={on} className={`vw-card-section vw-card--clickable dcl-region is-${rState}${on ? ' is-on' : ''}`} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter') onClick(); }}>
      <div className="dcr-h">
        <span className="dcr-name">{name} region</span>
        <span className={`dcr-state is-${rState}`}><i />{STATE_META[rState].label}</span>
      </div>
      <div className="dcr-dots" aria-label="Sites by status">
        {states.map(({ d, s }) => <button key={d.id} type="button" className="dcr-dot" style={{ background: STATE_META[s].color }} title={`${d.name} · ${d.city} · ${STATE_META[s].label}`} onClick={e => { e.stopPropagation(); onSite(d.id); }} />)}
        <span className="dcr-n">{sites.length} sites</span>
      </div>
      <div className="dcr-stats">
        <div><span className="dco-l">Incidents</span><b>{inc}</b><small className={hot ? 'bad' : ''}>{hot ? `${hot} SEV1/2` : 'no SEV1/2'}</small></div>
        <div><span className="dco-l">Alarms</span><b>{alarms}</b><small className={crit ? 'bad' : ''}>{crit ? `${crit} critical` : 'none critical'}</small></div>
        <div><span className="dco-l">Power</span><b>{pp}%</b><span className="dco-meter is-sm"><i style={{ width: `${pp}%`, background: pp >= 85 ? SOFT.error : SOFT.info }} /></span></div>
      </div>
      {why ? (
        <button type="button" className={`dcr-focus is-${worst.s}`} onClick={e => { e.stopPropagation(); onSite(worst.d.id); }} title="Open this datacenter">
          <I.TriangleAlert size={13} /><span><b>{worst.d.name}</b> · {why}</span><I.ChevronRight size={14} />
        </button>
      ) : <span className="dcr-focus is-normal"><I.CircleCheck size={13} /><span>All sites normal</span></span>}
    </div>
  );
}
