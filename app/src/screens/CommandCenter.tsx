import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getCommandCenter, useQuery } from '../api';
import { usePage, Loading, useSentinel } from '../shell/page';
import { Panel, Chip, Drawer, Seg } from '../ui/kit';
import { StackBar } from '../ui/status';
import { Sparkline } from '../charts/Sparkline';
import { DcMap, type DcPin } from './overview/DcMap';
import { ROLLOUT } from '../lib/vocab';
import { fmtAgo, fmtDow, fmtDur, fmtINR, fmtNum, fmtShortDate, fmtTime } from '../lib/format';
import { DAY } from '../mock/seed';
import '../styles/command.css';

/* One restrained palette (NST): neutral structure, brand blue as the only
   accent, red/amber reserved for things that need attention. */
const C = { accent: 'var(--primaryColor500)', soft: 'var(--primaryColor200)', track: 'var(--vw-color-slate-200)', muted: 'var(--vw-color-slate-400)', bad: 'var(--vw-color-red-500)', warn: 'var(--vw-color-amber-500)' };

type CC = NonNullable<ReturnType<typeof useQuery<Awaited<ReturnType<typeof getCommandCenter>>>>['data']>;

/* The command center answers, in order: what is happening, where, who is
   affected, why, what is left, what happens next, what to do (blueprint §1). */
export function CommandCenter() {
  usePage([{ label: 'Command center' }]);
  const { data } = useQuery(getCommandCenter, []);
  if (!data) return <Loading label="Correlating the estate" />;
  return (
    <div className="page cmd">
      <Situation d={data} />
      <div className="grid cmd-where">
        <WhereMap d={data} />
        <ImpactBoard d={data} />
      </div>
      <div className="grid cmd-triad">
        <Exposure d={data} />
        <Causes d={data} />
        <Recommendations d={data} />
      </div>
      <NextSevenDays d={data} />
    </div>
  );
}

/* ------------------------------------------------------------ situation */

/* Estate-health gauge drawn with NST tokens; value in Poppins light like
   .vw-card-metric-* so it reads as a metric, not a graphic. */
function HealthGauge({ value }: { value: number }) {
  const size = 132, r = size / 2 - 10, cx = size / 2, cy = size / 2 + 2;
  const pt = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const arc = (from: number, to: number) => { const [x1, y1] = pt(from), [x2, y2] = pt(to); return `M${x1},${y1} A${r},${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2},${y2}`; };
  const v = Math.max(0, Math.min(100, value));
  const c = v >= 60 ? C.accent : C.bad;
  return (
    <svg width={size} height={size * 0.82} viewBox={`0 0 ${size} ${size * 0.82}`} role="img" aria-label={`Estate health ${value} of 100`}>
      <path d={arc(135, 405)} fill="none" style={{ stroke: 'var(--vw-color-slate-100)' }} strokeWidth={9} strokeLinecap="round" />
      {v > 0 && <path d={arc(135, 135 + (270 * v) / 100)} fill="none" style={{ stroke: c }} strokeWidth={9} strokeLinecap="round" />}
      <text x={cx} y={cy + 9} textAnchor="middle" style={{ fontSize: 'var(--vw-font-value-xxl)', fontWeight: 300, fill: 'var(--vw-color-gray-900)', fontFamily: 'var(--fontFamily)' }}>{value}</text>
      <text x={cx} y={cy + 27} textAnchor="middle" style={{ fontSize: 'var(--vw-font-label-sm)', fill: 'var(--vw-color-gray-500)', fontFamily: 'var(--fontFamily)' }}>of 100</text>
    </svg>
  );
}

const SIG_ICON: Record<string, I.LucideIcon> = { open: I.Siren, sla: I.AlarmClock, alm: I.BellRing, links: I.Unlink, svc: I.Waypoints, avail: I.Activity, power: I.Zap, slam: I.ArrowLeftRight };

function Situation({ d }: { d: CC }) {
  const nav = useNavigate();
  const ask = useSentinel();
  const now = clockNow();
  const p = d.pulse, s = d.situation;
  const [only1, setOnly1] = useState<'all' | 'sev1'>('all');
  const [wall, setWall] = useState(false);
  const lane = useRef<HTMLDivElement>(null);
  const bandChip = s.band === 'Healthy' ? 'success' : s.band === 'Watch' ? 'warning' : 'error';
  const crit = only1 === 'sev1' ? d.critical.filter(i => i.sev === 1) : d.critical;
  const n1 = d.critical.filter(i => i.sev === 1).length, n2 = d.critical.length - n1;
  const [lead, ...rest] = s.headline.split(' · ');
  /* NST KPI: neutral metric, state carried by the variance line */
  const sig: { k: string; v: string; u?: string; l: string; note: string; tone: 'positive' | 'negative' | 'neutral'; to: string }[] = [
    { k: 'open', v: String(p.open), l: 'Open incidents', note: `${n1} SEV1 · ${n2} SEV2`, tone: 'neutral', to: '/incidents' },
    { k: 'sla', v: String(p.breaching), l: 'Past SLA', note: p.breaching ? `of ${p.open} open` : 'none overdue', tone: p.breaching ? 'negative' : 'neutral', to: '/incidents?view=breaching' },
    { k: 'alm', v: String(p.critMajor), l: 'Major+ alarms', note: 'critical and major', tone: 'neutral', to: '/alerts?sev=critical' },
    { k: 'links', v: String(p.linksDown), l: 'Links down', note: `of ${fmtNum(s.lldp)} physical`, tone: 'neutral', to: '/alerts?q=Link%20Down' },
    { k: 'svc', v: String(p.servicesDegraded), l: 'Services degraded', note: `of ${fmtNum(s.services)} services`, tone: 'neutral', to: '/services?status=Degraded' },
    { k: 'avail', v: `${p.availability}%`, l: 'Availability', note: `${p.unreachable} unreachable`, tone: 'neutral', to: '/alerts?q=Unreachable' },
    { k: 'power', v: String(p.facilityAlarms), l: 'Facility alarms', note: 'power and cooling', tone: p.facilityAlarms ? 'negative' : 'neutral', to: '/alerts?source=Power' },
    { k: 'slam', v: String(p.activeChanges), l: 'Changes in progress', note: 'open now', tone: 'neutral', to: '/changes?status=In%20progress' }
  ];
  const scroll = (dir: number) => lane.current?.scrollBy({ left: dir * 340, behavior: 'smooth' });
  return (
    <>
      <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm cmd-head">
        <div className="vw-flex vw-flex-col">
          <h1 className="vw-page-title">Command center</h1>
          <p className="vw-page-description cmd-fresh"><i className="live-dot" />{fmtDow(now)} {fmtShortDate(now)} · {fmtTime(now)} · {p.liveDcs} live datacenters · snapshot 1 min ago</p>
        </div>
        <div className="vw-flex vw-gap-sm">
          <button type="button" className="nst-btn nst-btn--sm" onClick={() => setWall(true)}><I.LayoutGrid size={15} />Datacenter overview<span className="vw-chip vw-chip--neutral cmd-btn-chip">{d.dcMap.length}</span></button>
          <button type="button" className="nst-btn nst-btn--sm nst-btn--filled" onClick={() => ask('What is at risk in the estate right now?')}><I.Sparkles size={15} />Ask Sentinel</button>
        </div>
      </div>

      <section className="vw-card-section cmd-status">
        <div className="cmd-gauge">
          <span className="vw-card-metric-label">Estate health</span>
          <HealthGauge value={d.shi} />
          <span className={`vw-chip vw-chip--${bandChip} is-strong`}>{s.band}</span>
          <span className="vw-footer-meta cmd-gauge-note">Average of the four areas</span>
          <span className="vw-footer-meta cmd-gauge-note" title="Site, edge links and dependencies count; alarms from downstream PoPs and sites do not">Scope: sites + edge + dependencies</span>
        </div>
        <div className="cmd-status-main">
          <div className="vw-flex vw-flex-col" style={{ gap: 6 }}>
            <div className="vw-card-title-lg">{lead}</div>
            <div className="vw-card-description cmd-sub">{rest.map((t, i) => <span key={i}>{t}</span>)}</div>
          </div>
          <div className="cmd-areas" role="list">
            {d.domains.map(x => {
              const st = x.state;
              return (
                <Link key={x.key} to={x.to} role="listitem" className={`vw-card-child vw-card--clickable cmd-area is-${st}`} title={`${x.measure} — open the worklist`}>
                  <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
                    <span className="vw-card-activity-label">{x.label}</span>
                    <span className="cmd-area-go">
                      {st === 'critical' ? <span className="vw-chip vw-chip--error cmd-chip">Critical</span> : st === 'attention' ? <span className="vw-chip vw-chip--warning cmd-chip">Needs attention</span> : <span className="vw-chip vw-chip--neutral cmd-chip">Normal</span>}
                      <I.ChevronRight size={15} />
                    </span>
                  </div>
                  <div className="cmd-area-score">
                    <span className="vw-card-metric-md">{x.value}%</span>
                    <div className="bar"><i style={{ width: `${x.value}%`, background: st === 'critical' ? C.bad : st === 'attention' ? C.warn : C.accent }} /></div>
                  </div>
                  <span className="vw-label">{x.measure}</span>
                  <span className="vw-card-description cmd-area-detail">{x.detail}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <div className="cmd-kpis">
        {sig.map(x => { const Ic = SIG_ICON[x.k]; return (
          <button key={x.k} type="button" className="vw-card-section vw-card--clickable cmd-kpi" onClick={() => nav(x.to)}>
            <div className="vw-flex vw-justify-between vw-items-start"><span className="vw-card-metric-label">{x.l}</span><Ic size={16} className="cmd-kpi-ic" /></div>
            <div className="vw-card-metric-lg">{x.v}</div>
            <div className={`vw-card-variance is-${x.tone}`}>{x.note}</div>
          </button>
        ); })}
      </div>

      <section className="vw-card-section cmd-crit">
        <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm cmd-crit-head">
          <div className="vw-flex vw-items-center vw-gap-sm">
            <span className="vw-card-title">Critical now</span>
            {n1 > 0 && <span className="vw-chip vw-chip--error is-strong">{n1} SEV1</span>}
            {n2 > 0 && <span className="vw-chip vw-chip--warning is-strong">{n2} SEV2</span>}
            {!d.critical.length && <span className="vw-chip vw-chip--neutral">No SEV1 or SEV2 open</span>}
          </div>
          {d.critical.length > 0 && (
            <div className="vw-flex vw-items-center vw-gap-sm">
              <Seg size="sm" value={only1} onChange={setOnly1} options={[{ id: 'all', label: 'SEV1 + SEV2' }, { id: 'sev1', label: 'SEV1 only' }]} />
              <button type="button" className="nst-icon-btn" aria-label="Scroll left" onClick={() => scroll(-1)}><I.ChevronLeft size={16} /></button>
              <button type="button" className="nst-icon-btn" aria-label="Scroll right" onClick={() => scroll(1)}><I.ChevronRight size={16} /></button>
              <Link to="/incidents?view=sev1" className="nst-btn nst-btn--sm nst-btn--ghost">All critical<I.ArrowRight size={14} /></Link>
            </div>
          )}
        </div>
        {crit.length > 0 && (
          <div className="cmd-lane" ref={lane}>
            {crit.map(i => {
              const left = i.sla.resolveLeft, used = Math.max(0, Math.min(100, ((i.resolveSlaMin - left) / i.resolveSlaMin) * 100));
              const late = left < 0;
              return (
                <Link key={i.id} to={`/incidents/${i.id}`} className="vw-card-section vw-card--accent vw-card--clickable cmd-inc">
                  <div className="vw-card-accent" style={{ background: i.sev === 1 ? C.bad : C.warn }} />
                  {/* fixed slots: every card has the same rows at the same heights */}
                  <div className="ci-head">
                    <span className={`vw-chip ${i.sev === 1 ? 'vw-chip--error' : 'vw-chip--warning'} is-strong cmd-chip`}>SEV{i.sev}</span>
                    <span className="vw-card-activity-label">{i.id}</span>
                    <span className="vw-chip vw-chip--neutral cmd-chip">{i.type}</span>
                    <span className="vw-footer-meta ci-age">{fmtAgo(i.detected, now)}</span>
                  </div>
                  <div className="vw-card-title-sm ci-title" title={i.title}>{i.title}</div>
                  <span className="vw-label ci-where"><I.MapPin size={12} />{i.dcId} · {i.city}</span>
                  <div className="ci-cause" title={`${i.cause} (${i.confidence}% confidence)`}>
                    <span className="vw-label">Likely cause · {i.confidence}%</span>
                    <span className="vw-value ci-clamp1">{i.cause}</span>
                  </div>
                  <div className="ci-impact">
                    <div><span className="vw-card-metric-sm">{i.impact.services}</span><span className="vw-label">services</span></div>
                    <div><span className="vw-card-metric-sm">{i.impact.premium}</span><span className="vw-label">premium</span></div>
                    <div><span className="vw-card-metric-sm">{i.impact.services ? fmtINR(i.impact.revenueAtRisk) : '—'}</span><span className="vw-label">per month</span></div>
                  </div>
                  <div className="ci-sla">
                    <div className="ci-sla-row">
                      <span className={`vw-card-variance ${late ? 'is-negative' : 'is-neutral'}`}>{late ? `Overdue ${fmtDur(-left)}` : `${fmtDur(left)} to SLA`}</span>
                      <span className="vw-footer-meta ci-owner" title={`${i.status} · ${i.owner}`}>{i.status} · {i.owner}</span>
                    </div>
                    <div className="bar" style={{ height: 4 }}><i style={{ width: `${late ? 100 : used}%`, background: late ? C.bad : C.accent }} /></div>
                  </div>
                  <div className="vw-card-child-shaded ci-next" title={i.nextAction ?? undefined}>
                    <span className="vw-label">{!i.nextAction ? 'Next action' : i.awaitingApproval > 0 ? `${i.awaitingApproval} step${i.awaitingApproval > 1 ? 's need' : ' needs'} approval` : 'Next action'}</span>
                    <span className="vw-value ci-clamp2">{i.nextAction ?? 'All actions complete — run closure checks'}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <EstateWall d={d} open={wall} onClose={() => setWall(false)} />
    </>
  );
}

/* ---------------------------------------------------------------- where */

function WhereMap({ d }: { d: CC }) {
  const nav = useNavigate();
  const pins = useMemo<DcPin[]>(() => d.dcMap.map(x => ({
    id: x.id, lat: x.lat, lng: x.lng, label: x.id, sub: `${x.city} · ${ROLLOUT[x.status].label} · health ${x.status === 'planned' ? '—' : x.health} · ${x.incidents} open incident${x.incidents === 1 ? '' : 's'} · ${x.alerts} alarms`,
    color: x.status === 'planned' ? C.muted : x.worstSev && x.worstSev <= 2 ? C.bad : x.incidents || x.critAlerts ? C.warn : C.accent,
    size: 12 + Math.round(Math.sqrt(x.ne) * 0.9), pulse: x.worstSev > 0 && x.worstSev <= 2, dim: x.status === 'planned', badge: x.incidents || undefined
  })), [d.dcMap]);
  const hot = d.dcMap.filter(x => x.worstSev && x.worstSev <= 2).length;
  return (
    <Panel title="Where it is happening" sub={`${d.dcMap.length} live datacenters · ring = site state, halo = SEV1/2 incident running, badge = open incidents`} icon={I.MapPinned}
      actions={<span className="row" style={{ gap: 6 }}><Chip tone="neutral" size="xs">{hot} sites with SEV1/2</Chip><Link to="/datacenters" className="panel-link">Datacenters<I.ChevronRight size={14} /></Link></span>} flush>
      <div style={{ position: 'relative', padding: '0 0 0' }}>
        <DcMap pins={pins} onPick={id => nav(`/datacenters/${id}`)} height={520} />
        <div className="map-regions">
          {d.regions.map(r => (
            <button key={r.id} type="button" className="map-region" onClick={() => nav(`/datacenters?region=${r.id}`)}>
              <b>{r.name}</b>
              <span className="sub">{r.dcs} sites · {r.alerts} alarms</span>
              <span className="inc" style={{ color: r.worstSev && r.worstSev <= 2 ? 'var(--vw-color-red-600)' : 'var(--vw-color-gray-700)' }}>{r.incidents} inc</span>
            </button>
          ))}
        </div>
        <div className="map-legend">
          <span><i style={{ '--c': C.accent } as React.CSSProperties} />Healthy</span>
          <span><i style={{ '--c': C.warn } as React.CSSProperties} />Incidents / critical alarms</span>
          <span><i style={{ '--c': C.bad } as React.CSSProperties} />SEV1/2 running</span>
                  </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------ what / impact */

function SlaCell({ left, total, breaching }: { left: number; total: number; breaching: boolean }) {
  const used = Math.max(0, Math.min(100, ((total - left) / total) * 100));
  const cls = breaching || left < 0 ? 'is-breach' : left < total * 0.25 ? 'is-warn' : 'is-ok';
  const color = cls === 'is-breach' ? C.bad : C.accent;
  return (
    <div className={`slaw ${cls}`}>
      <span>{left < 0 ? `Overdue ${fmtDur(-left)}` : `${fmtDur(left)} left`}</span>
      <div className="bar"><i style={{ width: `${left < 0 ? 100 : used}%`, background: color }} /></div>
    </div>
  );
}

function ImpactBoard({ d }: { d: CC }) {
  return (
    <Panel className="cmd-fill" title="What is happening" sub="Open incidents ranked by severity and customer impact" icon={I.Siren} count={d.pulse.open}
      actions={<Link to="/incidents" className="panel-link">All incidents<I.ChevronRight size={14} /></Link>} flush>
      <div className="board">
        {d.topIncidents.map(i => (
          <Link key={i.id} to={`/incidents/${i.id}`} className="board-row">
            <span className={`vw-chip ${i.sev === 1 ? 'vw-chip--error' : i.sev === 2 ? 'vw-chip--warning' : 'vw-chip--neutral'} is-strong cmd-chip`}>SEV{i.sev}</span>
            <div style={{ minWidth: 0 }}>
              <div className="t">{i.title}</div>
              <div className="m"><span className="mono">{i.id}</span><span>·</span><span>{i.dcId}</span><span>·</span><span>{i.owner}</span><span>·</span><span>{i.status}</span></div>
              <div className="imp">{i.impact.services ? <>{i.impact.services} services · <b>{i.impact.premium} premium</b> · {fmtINR(i.impact.revenueAtRisk)}/mo at risk</> : <span className="faint">no customer service on the affected scope</span>}</div>
            </div>
            <SlaCell left={i.sla.resolveLeft} total={i.resolveSlaMin} breaching={i.sla.breaching} />
          </Link>
        ))}
      </div>
      <div className="panel-foot" style={{ marginTop: 'auto' }}>
        <span>{d.pulse.breaching} past SLA · mean time to resolve {fmtDur(d.pulse.mttrMin)} over 30 days</span>
        <Link to="/incidents?view=breaching" className="panel-link">Breaching worklist<I.ChevronRight size={14} /></Link>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------- who / why / act */

function Exposure({ d }: { d: CC }) {
  const st = d.svcStatus;
  const maxRev = Math.max(1, ...d.exposedCustomers.map(c => c.revenue));
  return (
    <Panel title="Who is affected" sub="Customer exposure from degraded services" icon={I.Users}
      actions={<Link to="/customers?exposed=1" className="panel-link">Customers<I.ChevronRight size={14} /></Link>}>
      <div className="expo-top"><span className="big">{fmtINR(d.situation.revenueAtRisk)}</span><span className="sub">/ month of service revenue on degraded paths</span></div>
      <div className="col" style={{ gap: 6, marginTop: 10 }}>
        <StackBar height={8} parts={[{ value: st.Active, color: C.soft, label: 'Active' }, { value: st.Degraded, color: C.warn, label: 'Degraded' }, { value: st.Down, color: C.bad, label: 'Down' }, { value: st.Disabled, color: C.track, label: 'Disabled' }]} />
        <div className="row between" style={{ fontSize: 11.5, color: 'var(--ink-500)' }}><span><b className="num" style={{ color: 'var(--ink-800)' }}>{fmtNum(st.Active)}</b> active</span><span><b className="num" style={{ color: 'var(--ink-800)' }}>{st.Degraded}</b> degraded</span><span><b className="num" style={{ color: 'var(--ink-800)' }}>{st.Down}</b> down</span><span><b className="num">{st.Disabled}</b> disabled</span></div>
      </div>
      <div className="cmd-label" style={{ marginTop: 14 }}>Exposed customers <span className="n">{d.situation.exposedPremium} premium</span></div>
      <div className="expo-list">
        {d.exposedCustomers.map(c => (
          <Link key={c.id} to={`/customers/${c.id}`} className="expo-row">
            <div style={{ minWidth: 0 }}>
              <div className="n"><span>{c.name}</span>{c.premium && <Chip tone="neutral" size="xs">Premium</Chip>}</div>
              <div className="s">{c.services} service{c.services === 1 ? '' : 's'} degraded · SLA {c.minSla}% · {c.segment}</div>
              <div className="bar" style={{ height: 4, marginTop: 5, width: `${Math.max(8, (c.revenue / maxRev) * 100)}%` }}><i style={{ width: '100%', background: c.premium ? C.accent : C.soft }} /></div>
            </div>
            <div className="r">{fmtINR(c.revenue)}<small>per month</small></div>
          </Link>
        ))}
        {!d.exposedCustomers.length && <div className="wk-empty">No customer currently rides a degraded service.</div>}
      </div>
    </Panel>
  );
}

function Causes({ d }: { d: CC }) {
  const max = Math.max(1, ...d.causes.map(c => c.n));
  return (
    <Panel title="Why" sub="Root-cause families behind the open incidents" icon={I.Microscope}
      actions={<Link to="/incidents" className="panel-link">RCA workspaces<I.ChevronRight size={14} /></Link>}>
      <div>
        {d.causes.map(c => (
          <div className="cause" key={c.label}>
            <div className="l">{c.label}{c.hot > 0 && <span className="hot">{c.hot} SEV1/2</span>}</div>
            <div className="v">{c.n}</div>
            <div className="track"><i style={{ width: `${(c.n / max) * 100}%`, background: C.accent }} /></div>
            <div className="c"><span>avg confidence {c.confidence}%</span><span>·</span>{c.ids.map(id => <Link key={id} to={`/incidents/${id}`} className="ent-link">{id}</Link>)}</div>
          </div>
        ))}
      </div>
      <div className="vw-card-child-shaded cmd-note" style={{ marginTop: 12 }}>
        <I.ArrowLeftRight size={14} style={{ marginTop: 2, flexShrink: 0 }} />
        <span><b className="num">{d.changeImplicated.length}</b> of {d.pulse.open} open incidents had a change or maintenance close inside the 72 h before detection — {d.changeImplicated.slice(0, 3).map((id, k) => <span key={id}>{k > 0 && ', '}<Link to={`/incidents/${id}`} className="ent-link">{id}</Link></span>)}.</span>
      </div>
    </Panel>
  );
}

const REC_ICON: Record<string, { icon: I.LucideIcon; tone: string; cta: string }> = {
  approve: { icon: I.ShieldCheck, tone: 'tone-neutral', cta: 'Review & approve' }, run: { icon: I.Play, tone: 'tone-neutral', cta: 'Open action plan' }, change: { icon: I.ArrowLeftRight, tone: 'tone-neutral', cta: 'Open change' },
  rma: { icon: I.PackageSearch, tone: 'tone-neutral', cta: 'Open incident' }, discover: { icon: I.Radar, tone: 'tone-neutral', cta: 'Open site' }, plan: { icon: I.TrendingUp, tone: 'tone-neutral', cta: 'Open capacity' }
};
function Recommendations({ d }: { d: CC }) {
  const ask = useSentinel();
  return (
    <Panel title="What to do next" sub="Sentinel's ranked actions — disruptive steps stay approval-gated (DC-AI-006/007)" icon={I.Sparkles}
      actions={<button type="button" className="panel-link" onClick={() => ask('What should we do first?')}>Ask why<I.ChevronRight size={14} /></button>}>
      <div>
        {d.recommendations.map((r, k) => {
          const m = REC_ICON[r.kind] ?? REC_ICON.run;
          return (
            <div className="rec" key={r.ref + k}>
              <span className={`ico ${m.tone}`}><m.icon size={16} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="rank">#{k + 1} · {r.kind === 'approve' ? 'needs approval' : r.kind === 'change' ? 'pending change' : r.kind}</div>
                <div className="t">{r.title}</div>
                <div className="w">{r.why}</div>
                {r.benefit && <div className="b"><I.ArrowUpRight size={12} />{r.benefit}</div>}
              </div>
              <Link to={r.to} className="nst-btn nst-btn--xs">{m.cta}</Link>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------- next 7 days / runway */

function NextSevenDays({ d }: { d: CC }) {
  const now = clockNow();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const t0 = new Date(now); t0.setHours(0, 0, 0, 0);
  const start = t0.getTime();
  const cols = useMemo(() => {
    const byDay: Record<number, CC['upcoming']> = { [-1]: [] };
    for (let i = 0; i < 7; i++) byDay[i] = [];
    d.upcoming.forEach(e => { const k = e.overdue ? -1 : Math.floor((e.at - start) / DAY); if (byDay[k]) byDay[k].push(e); });
    return byDay;
  }, [d.upcoming, start]);
  const KIND: Record<string, I.LucideIcon> = { deadline: I.AlarmClock, maintenance: I.Wrench, change: I.ArrowLeftRight, test: I.BatteryCharging, plan: I.TrendingUp, forecast: I.Activity };
  const total = d.upcoming.length;
  return (
    <Panel title="What happens next" sub="Resolution deadlines, change and maintenance windows, DG tests and forecast threshold crossings" icon={I.CalendarRange} count={total}
      actions={<Link to="/changes" className="panel-link">Change calendar<I.ChevronRight size={14} /></Link>}>
      <div className="wk">
        {[-1, 0, 1, 2, 3, 4, 5, 6].map(k => {
          const evs = cols[k] ?? [];
          const open = expanded.has(k);
          const shown = open ? evs : evs.slice(0, 4);
          const day = start + k * DAY;
          return (
            <div key={k} className={`wk-day${k === 0 ? ' is-today' : ''}${k === -1 ? ' is-overdue' : ''}`}>
              <div className="h">{k === -1 ? 'Overdue' : k === 0 ? 'Today' : k === 1 ? 'Tomorrow' : fmtDow(day)}<small>{k === -1 ? evs.length : fmtShortDate(day)}</small></div>
              {shown.map((e, i) => { const Ic = KIND[e.kind] ?? I.Dot; return (
                <Link key={i} to={e.to} className={`wk-ev tone-${e.tone}`} title={`${e.label} — ${e.sub}`}>
                  <span className="k"><Ic size={10} style={{ verticalAlign: -1, marginRight: 4 }} />{k === -1 ? 'overdue' : fmtTime(e.at)} · {e.kind === 'deadline' ? 'SLA due' : e.kind === 'forecast' ? '85% crossing' : e.kind === 'test' ? 'DG test' : e.kind}</span>
                  <b>{e.label.replace(' resolution due', '').replace(' · maintenance window', '').replace(' · change window', '').replace(' DG monthly test due', '').replace(' target date', '').replace(' crosses 85%', '')}</b>
                  <span>{e.sub}</span>
                </Link>
              ); })}
              {evs.length > 4 && <button type="button" className="wk-more" onClick={() => setExpanded(s => { const n = new Set(s); open ? n.delete(k) : n.add(k); return n; })}>{open ? 'Show less' : `+${evs.length - 4} more`}</button>}
              {!evs.length && <div className="wk-empty">—</div>}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}


/* ------------------------------------------------------------ estate wall */

function EstateWall({ d, open, onClose }: { d: CC; open: boolean; onClose: () => void }) {
  const [sort, setSort] = useState<'risk' | 'name'>('risk');
  const [only, setOnly] = useState<'all' | 'incidents' | 'clear'>('all');
  const tiles = useMemo(() => [...d.dcMap].filter(x => only === 'all' || (only === 'incidents' ? x.incidents > 0 : x.incidents === 0)).sort((a, b) => sort === 'name' ? a.id.localeCompare(b.id) : (a.worstSev || 9) - (b.worstSev || 9) || b.incidents - a.incidents || (a.status === 'planned' ? 1 : 0) - (b.status === 'planned' ? 1 : 0) || a.health - b.health), [d.dcMap, sort, only]);
  const now = clockNow();
  return (
    <Drawer open={open} onClose={onClose} width={1120}
      title={<span className="row" style={{ gap: 8 }}><I.LayoutGrid size={18} />Datacenter overview</span>}
      sub={`${d.dcMap.length} live datacenters · health, 24 h load, power and cooling · updated ${fmtAgo(now - 60000, now)}`}
      head={
        <div className="wall-head" style={{ marginTop: 12 }}>
          <div className="seg is-sm">
            <button type="button" className={only === 'all' ? 'is-active' : ''} onClick={() => setOnly('all')}>All {d.dcMap.length}</button>
            <button type="button" className={only === 'incidents' ? 'is-active' : ''} onClick={() => setOnly('incidents')}>With incidents {d.dcMap.filter(x => x.incidents > 0).length}</button>
            <button type="button" className={only === 'clear' ? 'is-active' : ''} onClick={() => setOnly('clear')}>No incidents {d.dcMap.filter(x => x.incidents === 0).length}</button>
          </div>
          <div className="seg is-sm"><button type="button" className={sort === 'risk' ? 'is-active' : ''} onClick={() => setSort('risk')}>Worst first</button><button type="button" className={sort === 'name' ? 'is-active' : ''} onClick={() => setSort('name')}>By name</button></div>
        </div>
      }>
      <div className="wall">
        {tiles.map(x => {
          const planned = x.status === 'planned';
          const hot = x.worstSev > 0 && x.worstSev <= 2;
          return (
            <Link key={x.id} to={`/datacenters/${x.id}`} onClick={onClose} className={`tile${hot ? ' is-hot' : ''}`}>
              <div className="top"><span className="id">{x.id}</span><span title={ROLLOUT[x.status].label} style={{ width: 8, height: 8, borderRadius: 4, background: ROLLOUT[x.status].color, flexShrink: 0 }} /></div>
              <div className="city">{x.city} · {x.tier}</div>
              <div className="mid">
                <span className="score" style={{ color: planned ? 'var(--ink-400)' : x.health < 60 ? C.bad : 'var(--vw-color-gray-900)' }}>{planned ? '—' : x.health}<small>health</small></span>
                {!planned && <span className="spark"><Sparkline values={x.load24h} color={C.accent} height={22} /></span>}
              </div>
              <div className="bars">
                <div><span>cooling <b>{x.coolPct}%</b></span><span className="bar"><i style={{ width: `${x.coolPct}%`, background: x.facilityIssue ? C.warn : C.accent }} /></span></div>
                <div><span>power <b>{planned ? '—' : `${x.powerPct}%`}</b></span><span className="bar"><i style={{ width: `${x.powerPct}%`, background: x.powerPct >= 85 ? C.bad : C.accent }} /></span></div>
              </div>
              <div className="foot">
                {planned ? <span className="tpill is-plan">planned · {x.ne} NE</span> : <>
                  {x.incidents > 0 ? <span className={`tpill ${x.worstSev && x.worstSev <= 2 ? 'is-inc' : 'is-plan'}`}>{x.incidents} inc{x.worstSev ? ` · SEV${x.worstSev}` : ''}</span> : <span className="tpill is-ok">no incidents</span>}
                  {x.critAlerts > 0 ? <span className="tpill is-alm">{x.critAlerts} crit alm</span> : x.alerts > 0 ? <span className="tpill is-plan">{x.alerts} alm</span> : null}
                </>}
              </div>
            </Link>
          );
        })}
      </div>
    </Drawer>
  );
}
