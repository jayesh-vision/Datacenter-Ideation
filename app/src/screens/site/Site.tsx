import { Suspense, lazy, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDatacenter, getIncidents, useQuery, clockNow, usePersona } from '../../api';
import { usePage, Loading, useSentinel } from '../../shell/page';
import { Btn, Chip } from '../../ui/kit';
import { RolloutChip, Fresh } from '../../ui/status';
import { fmtAgo, fmtNum } from '../../lib/format';
import { NotFound } from '../NotFound';
import { Attention } from './Attention';
import { Metrics } from './Metrics';
import { Customers } from './Customers';
import { Assets } from './Assets';
import { SiteRevenue } from './Revenue';
import { Elements } from './Elements';
import { Details } from './Details';
import { Timeline } from './Timeline';
import { FlagRow } from './FlagRow';
import { TopologyView } from '../Topology';
const Twin = lazy(() => import('./twin/Twin'));
import '../../styles/site.css';
import { OpstralBtn } from '../../ui/OpstralMark';

export type SiteData = NonNullable<Awaited<ReturnType<typeof getDatacenter>>>;
/* Operations tabs. Capex/Opex (finance) and discovery/reconciliation
   (inventory) belong to Plan & Build / Inventory, not here. */
type Tab = 'overview' | 'attention' | 'topology' | 'metrics' | 'customers' | 'revenue' | 'assets' | 'elements' | 'details' | 'timeline';
const TABS: { id: Tab; label: string }[] = [
  /* Cabling ('equipment') is hidden per the user (02-Oct-2026); component kept, old ?tab=equipment links fall back to Overview */
  { id: 'overview', label: 'Overview' }, { id: 'attention', label: 'Attention' }, { id: 'topology', label: 'Topology' }, { id: 'metrics', label: 'Metrics' }, { id: 'customers', label: 'Customers' }, { id: 'revenue', label: 'Revenue' },
  { id: 'assets', label: 'Assets' }, { id: 'elements', label: 'Equipment' }, { id: 'details', label: 'Power & space' }, { id: 'timeline', label: 'Ops log' }
];

const FLAG_LABEL: Record<string, string> = { inc: 'incidents', alm: 'alarms', edge: 'edge', net: 'faults', pwr: 'power', cool: 'cooling', pue: 'PUE', svc: 'svc degraded' };

/* Datacenter page (operations): identity + operational KPIs, the 3D twin,
   what needs attention, installed equipment, power & space, cabling, ops log. */
export function Site() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const ask = useSentinel();
  usePage([{ label: 'Datacenters', to: '/datacenters' }, { label: id }], { dcId: id });
  const { vocab } = usePersona();
  const { data, loading } = useQuery(() => getDatacenter(id), [id]);
  const { data: incs } = useQuery(() => getIncidents({ dcId: id, status: 'open' }), [id]);
  /* header collapse — per-viewer convenience, collapsed by default to give the tabs room */
  const [compact, setCompact] = useState(() => { try { return localStorage.getItem('dco.site.header') !== 'expanded'; } catch { return true; } });
  const toggleHead = () => setCompact(c => { try { localStorage.setItem('dco.site.header', c ? 'expanded' : 'compact'); } catch { /* storage blocked */ } return !c; });
  if (loading && !data) return <Loading label="Loading site" />;
  if (!data) return <NotFound what="Datacenter" />;
  const { dc, summary: s } = data;
  const tab: Tab = TABS.some(t => t.id === sp.get('tab')) ? (sp.get('tab') as Tab) : 'overview';
  const go = (t: Tab) => { const n = new URLSearchParams(sp); n.set('tab', t); ['role', 'disc', 'q', 'kind', 'view', 'cview', 'cause', 'layer', 'rview', 'dom', 'rdc', 'seg'].forEach(k => n.delete(k)); setSp(n, { replace: true }); };
  const now = clockNow();
  const staleCol = dc.collectors.filter(c => c.state !== 'up');


  /* operations KPIs for this site — each opens the place to act on it */
  const planned = dc.status === 'planned';
  const open = incs ?? [];
  const n1 = open.filter(i => i.sev === 1).length, n2 = open.filter(i => i.sev === 2).length;
  const past = open.filter(i => i.sla.breaching).length;
  const pwrPct = s.powerCapKw ? Math.round((s.powerKw / s.powerCapKw) * 100) : 0;
  const upsBad = dc.power.ups.filter(u => u.state !== 'Online');
  const feedsBad = dc.power.feeds.filter(f => f.status === 'Alarm');
  const unitsRun = dc.cooling.units.filter(u => u.status === 'Operational').length;
  const unitsFailed = dc.cooling.units.filter(u => u.status === 'Failed');
  const maxTemp = Math.max(...dc.cooling.sensors.map(z => z.tempC));
  const siteState: 'critical' | 'attention' | 'ok' = n1 || upsBad.some(u => u.state === 'On battery' || u.state === 'Fault') || s.edge.state === 'isolated' ? 'critical'
    : s.openIncidents || s.critAlerts || s.linksDown || s.unreachable || unitsFailed.length || feedsBad.length || s.edge.state !== 'redundant' ? 'attention' : 'ok';
  type K = { k: string; l: string; v: string; note: string; tone: 'neutral' | 'negative' | 'warn'; icon: I.LucideIcon; to: string };
  const kpis: K[] = [
    { k: 'inc', l: 'Incidents', v: String(s.openIncidents), note: s.openIncidents ? [n1 ? `${n1} SEV1` : '', n2 ? `${n2} SEV2` : '', past ? `${past} past SLA` : ''].filter(Boolean).join(' · ') || 'SEV3/4 only' : 'none open', tone: n1 || past ? 'negative' : 'neutral', icon: I.Siren, to: `/incidents?dc=${dc.id}` },
    { k: 'alm', l: 'Active alarms', v: String(s.activeAlerts), note: s.critAlerts ? `${s.critAlerts} critical` : 'none critical', tone: s.critAlerts ? 'negative' : 'neutral', icon: I.BellRing, to: `/alerts?dc=${dc.id}` },
    { k: 'edge', l: 'Edge links', v: `${s.edge.up}/${s.edge.total}`, note: s.edge.state === 'redundant' ? 'all up · redundant' : s.edge.state === 'isolated' ? 'site isolated' : 'redundancy lost', tone: s.edge.state === 'isolated' ? 'negative' : s.edge.state === 'redundancy-lost' ? 'warn' : 'neutral', icon: I.Cable, to: `/datacenters/${dc.id}?tab=topology` },
    { k: 'net', l: 'Network faults', v: String(s.linksDown + s.unreachable), note: [s.linksDown ? `${s.linksDown} link${s.linksDown === 1 ? '' : 's'} down` : '', s.unreachable ? `${s.unreachable} unreachable` : ''].filter(Boolean).join(' · ') || 'all links up', tone: s.linksDown || s.unreachable ? 'warn' : 'neutral', icon: I.Network, to: `/alerts?dc=${dc.id}&q=Down` },
    { k: 'pwr', l: 'Power load', v: `${pwrPct}%`, note: upsBad.length ? `${upsBad[0].name} ${upsBad[0].state.toLowerCase()}` : feedsBad.length ? `${feedsBad.length} feed lost` : `UPS ${dc.power.ups.length}/${dc.power.ups.length} online`, tone: upsBad.length ? 'negative' : feedsBad.length || pwrPct >= 85 ? 'warn' : 'neutral', icon: I.Zap, to: `/facilities?dc=${dc.id}` },
    { k: 'cool', l: 'Cooling load', v: `${s.coolPct}%`, note: unitsFailed.length ? `${unitsFailed[0].name} failed` : `${unitsRun}/${dc.cooling.units.length} units · ${maxTemp}°C`, tone: unitsFailed.length || maxTemp > 27 ? 'negative' : 'neutral', icon: I.Thermometer, to: `/facilities?dc=${dc.id}&tab=cooling` },
    { k: 'pue', l: 'PUE', v: s.pue.toFixed(2), note: 'facility ÷ IT load', tone: 'neutral', icon: I.Gauge, to: `/facilities?dc=${dc.id}` },
    { k: 'svc', l: vocab.services, v: fmtNum(s.services), note: s.servicesDegraded ? `${s.servicesDegraded} degraded` : `${s.customers} ${vocab.customers.toLowerCase()}`, tone: s.servicesDegraded ? 'warn' : 'neutral', icon: I.Waypoints, to: `/datacenters/${dc.id}?tab=customers` }
  ];

  const stateLabel = planned ? 'Planned' : siteState === 'critical' ? 'Critical' : siteState === 'attention' ? 'Needs attention' : 'Normal';
  const flagged = kpis.filter(x => x.tone !== 'neutral');
  const collapseBtn = <button type="button" className="nst-btn nst-btn--sm nst-btn--icon dch-toggle" title={compact ? 'Show site details and KPIs' : 'Collapse site header'} aria-expanded={!compact} onClick={toggleHead}>{compact ? <I.ChevronDown size={16} /> : <I.ChevronUp size={16} />}</button>;

  return (
    <div className="page site">
      {compact ? (
      <section className="vw-card-section dch-bar">
        <span className="dch-bar-ic"><I.Building2 size={16} /></span>
        <h1 className="dch-bar-name" title={`${dc.address}, ${dc.city}, ${dc.state}`}>{dc.name}</h1>
        <RolloutChip s={dc.status} />
        <span className={`dch-state dch-bar-state is-${planned ? 'ok' : siteState}`}><i />{stateLabel}</span>
        {planned ? <div className="dch-bar-flags"><span className="vw-footer-meta">site not live</span></div> : <FlagRow
          items={[
            ...flagged.map(x => ({ key: x.k, node: <Link to={x.to} className={`vw-chip ${x.tone === 'negative' ? 'vw-chip--error' : 'vw-chip--warning'} dch-flag`} title={`${x.l}: ${x.v} · ${x.note}`}><x.icon size={13} /><b>{x.k === 'svc' ? String(s.servicesDegraded) : x.v}</b> {FLAG_LABEL[x.k]}</Link> })),
            ...(staleCol.length ? [{ key: 'stale', node: <span className="vw-chip vw-chip--warning dch-flag" title={`${staleCol.map(c => c.name).join(', ')} stale — telemetry older than the 15-minute freshness SLA`}><I.TriangleAlert size={13} />collector stale</span> }] : [])
          ]}
          more={k => <button type="button" className="vw-chip vw-chip--neutral dch-flag" title="Show all site KPIs" onClick={toggleHead}>+{k} more</button>}
          empty={<span className="vw-footer-meta"><I.CircleCheck size={13} /> all KPIs normal</span>} />}
        {!planned && <span className="dch-bar-fresh" title="Latest telemetry from this site's collectors"><Fresh>{fmtAgo(Math.max(...dc.collectors.map(c => c.lastSeen)), now)}</Fresh></span>}
        <div className="dch-bar-actions">
          <Btn icon={I.Network} title="Topology" onClick={() => go('topology')} disabled={!s.discovered} />
          <Btn icon={I.Zap} title="Facilities" onClick={() => nav(`/facilities?dc=${dc.id}`)} />
          <Btn icon={I.ArrowLeftRight} title="Changes & maintenance" onClick={() => nav(`/changes?dc=${dc.id}`)} />
          <OpstralBtn title="Ask Opstral AI about this datacenter" onClick={() => ask(`What is at risk in ${dc.id}?`)}>Opstral AI</OpstralBtn>
          {collapseBtn}
        </div>
      </section>
      ) : <>
      <section className="vw-card-section dch">
        <div className="dch-top">
          <span className="vw-card-icon-lg dch-ic"><I.Building2 size={22} /></span>
          <div className="dch-id">
            <div className="dch-name-row">
              <h1 className="dch-name">{dc.name}</h1>
              <RolloutChip s={dc.status} />
              <Chip tone="neutral">{dc.tier}</Chip>
              <Chip tone="neutral">{dc.category}</Chip>
            </div>
            <div className="vw-card-description dch-sub">
              <span title={`${dc.lat.toFixed(3)}°N ${dc.lng.toFixed(3)}°E`}><I.MapPin size={13} />{dc.address}, {dc.city}, {dc.state}</span>
              <span>{dc.zone} zone</span>
            </div>
            <div className="vw-footer-meta dch-col" title="Telemetry collectors">
              <span>Collectors</span>
              {planned ? <span>none assigned</span> : dc.collectors.map(c => <span key={c.id}><i style={{ background: c.state === 'up' ? 'var(--vw-color-emerald-500)' : 'var(--vw-color-amber-500)' }} />{c.name.replace('Collector ', '')} · {fmtAgo(c.lastSeen, now)}</span>)}
            </div>
          </div>
          <div className="dch-health">
            <span className="vw-card-metric-label">Site status</span>
            <span className={`dch-state is-${planned ? 'ok' : siteState}`}><i />{stateLabel}</span>
            <span className="vw-footer-meta" title="Average health score of the site's discovered devices">{planned ? 'not live' : `device health ${s.healthScore}/100`}</span>
          </div>
          <div className="dch-actions">
            <Btn icon={I.Network} onClick={() => go('topology')} disabled={!s.discovered}>Topology</Btn>
            <Btn icon={I.Zap} onClick={() => nav(`/facilities?dc=${dc.id}`)}>Facilities</Btn>
            <Btn icon={I.ArrowLeftRight} onClick={() => nav(`/changes?dc=${dc.id}`)}>Changes</Btn>
            <OpstralBtn title="Ask Opstral AI about this datacenter" onClick={() => ask(`What is at risk in ${dc.id}?`)}>Opstral AI</OpstralBtn>
          </div>
          {collapseBtn}
        </div>
        {staleCol.length > 0 && <div className="note note--warn"><I.TriangleAlert size={15} />{staleCol.map(c => c.name).join(', ')} stale — telemetry for part of this site is older than the 15-minute freshness SLA.</div>}
      </section>

      <div className="dch-kpis">
        {kpis.map(x => (
          <Link key={x.k} to={x.to} className={`vw-card-section vw-card--clickable dch-kpi is-${x.tone}`} data-kpi={x.k}>
            <div className="dch-kpi-h"><span className="vw-card-metric-label">{x.l}</span><x.icon size={15} /></div>
            <span className="vw-card-metric-lg">{planned && x.k !== 'pue' ? '—' : x.v}</span>
            <span className={`vw-card-variance ${x.tone === 'negative' ? 'is-negative' : 'is-neutral'} dch-kpi-note`} title={x.note}>{planned ? 'site not live' : x.note}</span>
          </Link>
        ))}
      </div>
      </>}

      <div className="pills" role="tablist">
          {TABS.map(t => {
            const n = t.id === 'attention' ? s.openIncidents + s.critAlerts : t.id === 'elements' ? s.installed : t.id === 'customers' ? s.customers : undefined;
            return <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`pill${tab === t.id ? ' is-active' : ''}`} onClick={() => go(t.id)}>{t.id === 'customers' ? vocab.customers : t.id === 'revenue' ? vocab.money.noun : t.label}{n ? <span className="count">{n}</span> : null}</button>;
          })}
      </div>

      {tab === 'overview' && <Suspense fallback={<Loading label="Loading Data center view" />}><Twin dcId={dc.id} /></Suspense>}
      {tab === 'attention' && <Attention data={data} />}
      {tab === 'topology' && <TopologyView key={dc.id} dc={dc.id} />}
      {tab === 'metrics' && <Metrics data={data} />}
      {tab === 'customers' && <Customers data={data} />}
      {tab === 'revenue' && <SiteRevenue data={data} />}
      {tab === 'assets' && <Assets data={data} />}
      {tab === 'elements' && <Elements dcId={dc.id} />}
      {tab === 'details' && <Details data={data} />}
      {tab === 'timeline' && <Timeline data={data} />}
    </div>
  );
}
