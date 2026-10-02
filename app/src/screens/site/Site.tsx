import { Suspense, lazy } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDatacenter, getIncidents, useQuery, clockNow } from '../../api';
import { usePage, Loading, useSentinel } from '../../shell/page';
import { Btn, Chip } from '../../ui/kit';
import { RolloutChip, Fresh } from '../../ui/status';
import { fmtAgo, fmtNum } from '../../lib/format';
import { NotFound } from '../NotFound';
import { Attention } from './Attention';
import { Metrics } from './Metrics';
import { Customers } from './Customers';
import { Assets } from './Assets';
import { Elements } from './Elements';
import { Details } from './Details';
import { Equipment } from './Equipment';
import { Timeline } from './Timeline';
const Twin = lazy(() => import('./twin/Twin'));
import '../../styles/site.css';

export type SiteData = NonNullable<Awaited<ReturnType<typeof getDatacenter>>>;
/* Operations tabs. Capex/Opex (finance) and discovery/reconciliation
   (inventory) belong to Plan & Build / Inventory, not here. */
type Tab = 'overview' | 'attention' | 'metrics' | 'customers' | 'assets' | 'elements' | 'details' | 'equipment' | 'timeline';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'attention', label: 'Attention' }, { id: 'metrics', label: 'Metrics' }, { id: 'customers', label: 'Customers' },
  { id: 'assets', label: 'Assets' }, { id: 'elements', label: 'Equipment' }, { id: 'details', label: 'Power & space' }, { id: 'equipment', label: 'Cabling' }, { id: 'timeline', label: 'Ops log' }
];

/* Datacenter page (operations): identity + operational KPIs, the 3D twin,
   what needs attention, installed equipment, power & space, cabling, ops log. */
export function Site() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const ask = useSentinel();
  usePage([{ label: 'Datacenters', to: '/datacenters' }, { label: id }], { dcId: id });
  const { data, loading } = useQuery(() => getDatacenter(id), [id]);
  const { data: incs } = useQuery(() => getIncidents({ dcId: id, status: 'open' }), [id]);
  if (loading && !data) return <Loading label="Loading site" />;
  if (!data) return <NotFound what="Datacenter" />;
  const { dc, summary: s } = data;
  const tab: Tab = TABS.some(t => t.id === sp.get('tab')) ? (sp.get('tab') as Tab) : 'overview';
  const go = (t: Tab) => { const n = new URLSearchParams(sp); n.set('tab', t); ['role', 'disc', 'q', 'kind', 'view', 'cview'].forEach(k => n.delete(k)); setSp(n, { replace: true }); };
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
    { k: 'edge', l: 'Edge links', v: `${s.edge.up}/${s.edge.total}`, note: s.edge.state === 'redundant' ? 'all up · redundant' : s.edge.state === 'isolated' ? 'site isolated' : 'redundancy lost', tone: s.edge.state === 'isolated' ? 'negative' : s.edge.state === 'redundancy-lost' ? 'warn' : 'neutral', icon: I.Cable, to: `/topology?dc=${dc.id}` },
    { k: 'net', l: 'Network faults', v: String(s.linksDown + s.unreachable), note: [s.linksDown ? `${s.linksDown} link${s.linksDown === 1 ? '' : 's'} down` : '', s.unreachable ? `${s.unreachable} unreachable` : ''].filter(Boolean).join(' · ') || 'all links up', tone: s.linksDown || s.unreachable ? 'warn' : 'neutral', icon: I.Network, to: `/alerts?dc=${dc.id}&q=Down` },
    { k: 'pwr', l: 'Power load', v: `${pwrPct}%`, note: upsBad.length ? `${upsBad[0].name} ${upsBad[0].state.toLowerCase()}` : feedsBad.length ? `${feedsBad.length} feed lost` : `UPS ${dc.power.ups.length}/${dc.power.ups.length} online`, tone: upsBad.length ? 'negative' : feedsBad.length || pwrPct >= 85 ? 'warn' : 'neutral', icon: I.Zap, to: `/facilities?dc=${dc.id}` },
    { k: 'cool', l: 'Cooling load', v: `${s.coolPct}%`, note: unitsFailed.length ? `${unitsFailed[0].name} failed` : `${unitsRun}/${dc.cooling.units.length} units · ${maxTemp}°C`, tone: unitsFailed.length || maxTemp > 27 ? 'negative' : 'neutral', icon: I.Thermometer, to: `/facilities?dc=${dc.id}&tab=cooling` },
    { k: 'pue', l: 'PUE', v: s.pue.toFixed(2), note: 'facility ÷ IT load', tone: 'neutral', icon: I.Gauge, to: `/facilities?dc=${dc.id}` },
    { k: 'svc', l: 'Services', v: fmtNum(s.services), note: s.servicesDegraded ? `${s.servicesDegraded} degraded` : `${s.customers} customers`, tone: s.servicesDegraded ? 'warn' : 'neutral', icon: I.Waypoints, to: `/services?dc=${dc.id}` }
  ];

  return (
    <div className="page site">
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
            <span className={`dch-state is-${planned ? 'ok' : siteState}`}><i />{planned ? 'Planned' : siteState === 'critical' ? 'Critical' : siteState === 'attention' ? 'Needs attention' : 'Normal'}</span>
            <span className="vw-footer-meta" title="Average health score of the site's discovered devices">{planned ? 'not live' : `device health ${s.healthScore}/100`}</span>
          </div>
          <div className="dch-actions">
            <Btn icon={I.Network} onClick={() => nav(`/topology?dc=${dc.id}`)} disabled={!s.discovered}>Topology</Btn>
            <Btn icon={I.Zap} onClick={() => nav(`/facilities?dc=${dc.id}`)}>Facilities</Btn>
            <Btn icon={I.ArrowLeftRight} onClick={() => nav(`/changes?dc=${dc.id}`)}>Changes</Btn>
            <Btn variant="filled" icon={I.Sparkles} title="Ask Opstral AI about this datacenter" onClick={() => ask(`What is at risk in ${dc.id}?`)}>Opstral AI</Btn>
          </div>
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

      <div className="row between wrap" style={{ gap: 12 }}>
        <div className="pills" role="tablist">
          {TABS.map(t => {
            const n = t.id === 'attention' ? s.openIncidents + s.critAlerts : t.id === 'elements' ? s.installed : t.id === 'customers' ? s.customers : undefined;
            return <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`pill${tab === t.id ? ' is-active' : ''}`} onClick={() => go(t.id)}>{t.label}{n ? <span className="count">{n}</span> : null}</button>;
          })}
        </div>
        {dc.status === 'planned' ? <span className="fresh">No collector assigned · record data only</span> : <Fresh>Telemetry as of {fmtAgo(Math.max(...dc.collectors.map(c => c.lastSeen)), now)}</Fresh>}
      </div>

      {tab === 'overview' && <Suspense fallback={<Loading label="Loading 3D view" />}><Twin dcId={dc.id} /></Suspense>}
      {tab === 'attention' && <Attention data={data} />}
      {tab === 'metrics' && <Metrics data={data} />}
      {tab === 'customers' && <Customers data={data} />}
      {tab === 'assets' && <Assets data={data} />}
      {tab === 'elements' && <Elements dcId={dc.id} />}
      {tab === 'details' && <Details data={data} />}
      {tab === 'equipment' && <Equipment data={data} />}
      {tab === 'timeline' && <Timeline data={data} />}
    </div>
  );
}
