import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getCommandCenter, useQuery, vocabNow } from '../api';
import { usePage, Loading, useSentinel } from '../shell/page';
import { Panel, Chip, Drawer, Seg } from '../ui/kit';
import { StackBar } from '../ui/status';
import { Sparkline } from '../charts/Sparkline';
import { DcMap, type DcPin } from './overview/DcMap';
import { ROLLOUT, sevChipCls, sevLabel } from '../lib/vocab';
import { fmtAgo, fmtDow, fmtDur, fmtMoney, fmtNum, fmtShortDate, fmtTime } from '../lib/format';
import '../styles/command.css';
import '../styles/revenue.css';
import { lc } from './revenue/parts';
import { MoneyIcon } from '../ui/Money';
import { DcCard } from './ops/DcCard';
import { OpstralBadge, OpstralBtn } from '../ui/OpstralMark';

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
        <ImpactBoard d={data} />
        <Recommendations d={data} />
      </div>
      <div className="grid cmd-triad">
        <Exposure d={data} />
        <Causes d={data} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ situation */

/* Estate-health gauge drawn with NST tokens; value in Poppins light like
   .vw-card-metric-* so it reads as a metric, not a graphic. */
function HealthGauge({ value, band }: { value: number; band: string }) {
  const size = 124, r = size / 2 - 10, cx = size / 2, cy = size / 2 + 3;
  const pt = (deg: number, rr = r) => [cx + rr * Math.cos((deg * Math.PI) / 180), cy + rr * Math.sin((deg * Math.PI) / 180)];
  const arc = (from: number, to: number) => { const [x1, y1] = pt(from), [x2, y2] = pt(to); return `M${x1},${y1} A${r},${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2},${y2}`; };
  const v = Math.max(0, Math.min(100, value));
  const c = band === 'Healthy' ? 'var(--vw-color-emerald-500)' : band === 'Watch' ? 'var(--vw-color-amber-500)' : 'var(--vw-color-red-500)';
  return (
    <svg width={size} height={size * 0.8} viewBox={`0 0 ${size} ${size * 0.8}`} role="img" aria-label={`Operations health ${value} of 100, ${band}`}>
      <path d={arc(135, 405)} fill="none" style={{ stroke: 'var(--vw-color-slate-100)' }} strokeWidth={10} strokeLinecap="round" />
      {v > 0 && <path d={arc(135, 135 + (270 * v) / 100)} fill="none" style={{ stroke: c }} strokeWidth={10} strokeLinecap="round" />}
      {[0, 25, 50, 75, 100].map(t => { const a = 135 + 2.7 * t; const [x1, y1] = pt(a, r - 10), [x2, y2] = pt(a, r - 14); return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: 'var(--vw-color-slate-300)' }} strokeWidth={1.5} />; })}
      <text x={cx} y={cy + 10} textAnchor="middle" style={{ fontSize: 'var(--vw-font-value-xxl)', fontWeight: 300, fill: 'var(--vw-color-gray-900)', fontFamily: 'var(--fontFamily)' }}>{value}</text>
      <text x={cx} y={cy + 24} textAnchor="middle" style={{ fontSize: 'var(--vw-font-label-sm)', fill: 'var(--vw-color-gray-500)', fontFamily: 'var(--fontFamily)' }}>of 100</text>
    </svg>
  );
}

const AREA_ICON: Record<string, I.LucideIcon> = { response: I.Siren, network: I.Network, power: I.Zap, cooling: I.Thermometer };

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
  const scroll = (dir: number) => lane.current?.scrollBy({ left: dir * 340, behavior: 'smooth' });
  const pins = useMemo<DcPin[]>(() => d.dcMap.map(x => ({
    id: x.id, lat: x.lat, lng: x.lng, city: x.city, tier: x.tier, kind: x.worstSev && x.worstSev <= 2 ? 'crit' : x.incidents || x.critAlerts || x.facilityIssue ? 'warn' : 'ok',
    size: 12 + Math.round(Math.sqrt(x.ne) * 0.9), incidents: x.incidents, worstSev: x.worstSev, breaching: x.breaching, alerts: x.alerts, critAlerts: x.critAlerts,
    powerPct: x.powerPct, coolPct: x.coolPct, services: x.services, facilityIssue: x.facilityIssue
  })), [d.dcMap]);
  return (
    <>
      <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm cmd-head">
        <div className="vw-flex vw-flex-col">
          <h1 className="vw-page-title">Command center</h1>
          <p className="vw-page-description cmd-fresh"><i className="live-dot" />{fmtDow(now)} {fmtShortDate(now)} · {fmtTime(now)} · {p.liveDcs} live datacenters · snapshot 1 min ago</p>
        </div>
        <div className="vw-flex vw-gap-sm">
          <button type="button" className="nst-btn nst-btn--sm" onClick={() => setWall(true)}><I.LayoutGrid size={15} />Datacenter overview<span className="vw-chip vw-chip--neutral cmd-btn-chip">{d.dcMap.length}</span></button>
          <OpstralBtn onClick={() => ask('What is at risk in the estate right now?')} />
        </div>
      </div>

      {/* hero: health verdict + the live estate map — one surface */}
      <section className="vw-card-section hero">
        <div className="hero-left">
          <div className="hero-verdict">
            <HealthGauge value={d.shi} band={s.band} />
            <div className="hero-verdict-txt">
              <span className="vw-card-metric-label cmd-gauge-label">Operations health
                <span className="cmd-info" tabIndex={0} title="Average of the four areas below. Counts each datacenter site, its edge links and its dependencies; downstream PoP and site alarms are excluded."><I.Info size={13} /></span>
              </span>
              <span className={`vw-chip vw-chip--${bandChip} is-strong`} style={{ alignSelf: 'flex-start' }}>{s.band}</span>
              <p className="hero-line">{s.n1 ? <><b className="hot">{s.n1} critical</b> and </> : null}<b>{s.n2} high</b> incidents open across <b>{s.critSites} datacenters</b></p>
              <span className="vw-label">{s.exposedPremium} {vocabNow().premium.toLowerCase()} {vocabNow().customers.toLowerCase()} affected · {p.breaching} incidents past SLA · weakest area: {s.weakest.label}</span>
            </div>
          </div>
          <div className="hero-areas" role="list">
            {d.domains.map(x => {
              const Ic = AREA_ICON[x.key] ?? I.Activity;
              const st = x.state;
              return (
                <Link key={x.key} to={x.to} role="listitem" className={`hero-area is-${st}`} title={`${x.measure} — open the worklist`}>
                  <span className="hero-area-ic"><Ic size={16} /></span>
                  <span className="hero-area-main">
                    <span className="hero-area-top"><b>{x.label}</b><span className={`ops-state is-${st}`}><i />{st === 'critical' ? 'Critical' : st === 'attention' ? 'Attention' : 'Normal'}</span></span>
                    <span className="hero-area-detail" title={x.detail}>{x.detail}</span>
                  </span>
                  <span className="hero-area-score"><span className="vw-card-metric-md">{x.value}%</span><span className="bar"><i style={{ width: `${x.value}%`, background: st === 'critical' ? C.bad : st === 'attention' ? C.warn : C.accent }} /></span></span>
                </Link>
              );
            })}
          </div>
        </div>
        <div className="hero-map">
          <DcMap pins={pins} links={d.dcLinks} onNav={nav} height={430} />
          <div className="hero-map-head">
            <span className="vw-card-activity-label">Live estate</span>
            <span className="vw-label">{d.dcMap.length} datacenters · {d.dcMap.filter(x => x.worstSev && x.worstSev <= 2).length} with critical / high · {d.dcLinks.filter(l => l.down).length} backhaul down</span>
          </div>
        </div>
      </section>

      {/* vitals: one strip, each metric with its 24 h trend */}
      <section className="vw-card-section vitals">
        {[
          { k: 'open', l: 'Open incidents', v: String(p.open), note: `${p.breaching} past SLA`, bad: p.breaching > 0, t: d.trends.open, to: '/incidents' },
          { k: 'alm', l: 'Major+ alarms', v: String(p.critMajor), note: 'critical and major', t: d.trends.critMajor, to: '/alerts?sev=critical' },
          { k: 'links', l: 'Links down', v: String(p.linksDown), note: `of ${fmtNum(s.lldp)} physical`, t: d.trends.linksDown, to: '/alerts?q=Link%20Down' },
          { k: 'svc', l: `${vocabNow().services} degraded`, v: String(p.servicesDegraded), note: `of ${fmtNum(s.services)}`, t: d.trends.services, to: '/incidents' },
          { k: 'avail', l: 'Availability', v: `${p.availability}%`, note: `${p.unreachable} unreachable`, t: d.trends.availability, to: '/alerts?q=Unreachable' },
          { k: 'power', l: 'IT + facility power', v: `${fmtNum(d.trends.powerKw[23])} kW`, note: `${p.facilityAlarms} facility alarms`, bad: p.facilityAlarms > 0, t: d.trends.powerKw, to: '/facilities' }
        ].map(x => (
          <Link key={x.k} to={x.to} className="vital">
            <span className="vw-card-metric-label">{x.l}</span>
            <span className="vital-row"><span className="vw-card-metric-lg">{x.v}</span><span className="vital-spark"><Sparkline values={x.t} color={x.bad ? 'var(--vw-color-red-500)' : 'var(--primaryColor500)'} height={30} /></span></span>
            <span className={`vw-card-variance ${x.bad ? 'is-negative' : 'is-neutral'} vital-note`}>{x.note} · 24 h</span>
          </Link>
        ))}
      </section>

      <RevenueBand d={d} />

      <section className="vw-card-section cmd-crit">
        <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm cmd-crit-head">
          <div className="vw-flex vw-items-center vw-gap-sm">
            <span className="vw-card-title">Critical now</span>
            {n1 > 0 && <span className="vw-chip vw-chip--error is-strong">{n1} Critical</span>}
            {n2 > 0 && <span className="vw-chip vw-chip--warning is-strong">{n2} High</span>}
            {!d.critical.length && <span className="vw-chip vw-chip--neutral">No critical or high incidents open</span>}
          </div>
          {d.critical.length > 0 && (
            <div className="vw-flex vw-items-center vw-gap-sm">
              <Seg size="sm" value={only1} onChange={setOnly1} options={[{ id: 'all', label: 'Critical + High' }, { id: 'sev1', label: 'Critical only' }]} />
              <button type="button" className="nst-icon-btn" aria-label="Scroll left" onClick={() => scroll(-1)}><I.ChevronLeft size={16} /></button>
              <button type="button" className="nst-icon-btn" aria-label="Scroll right" onClick={() => scroll(1)}><I.ChevronRight size={16} /></button>
              <Link to="/incidents?view=sev1" className="nst-btn nst-btn--sm nst-btn--ghost">All critical<I.ArrowRight size={14} /></Link>
            </div>
          )}
        </div>
        {crit.length > 0 && (
          <div className="cmd-lane" ref={lane}>
            {crit.map(i => <DcCard key={i.id} now={now} site={{ id: i.dcId, city: i.city, state: i.state, tier: i.tier, siteOpen: i.siteOpen }} inc={i} />)}
          </div>
        )}
      </section>
      <EstateWall d={d} open={wall} onClose={() => setWall(false)} />
    </>
  );
}

/* one slim line of money under the vitals: what is being lost, what it has cost, what is at stake */
function RevenueBand({ d }: { d: CC }) {
  const r = d.revenue, W = vocabNow().money;
  const cliff = r.sla.nextCliff;
  return (
    <Link to="/revenue" className="vw-card-section rev-band" title={`Open ${lc(W.impact)}`}>
      <span className="rev-band-h"><span className="rev-band-ic"><MoneyIcon size={16} /></span><b>{W.impact}</b></span>
      <span className="rev-band-item"><span className="vw-label">Losing now</span><b className="num" style={{ color: r.total.rate ? '#b21313' : undefined }}>{fmtMoney(r.total.rate)}/h</b></span>
      <span className="rev-band-item"><span className="vw-label">Impact so far</span><b className="num">{fmtMoney(r.total.lost + r.total.credits)}</b></span>
      <span className="rev-band-item"><span className="vw-label">At stake</span><b className="num">{fmtMoney(r.total.mrrExposed)}/mo</b></span>
      <span className="rev-band-item"><span className="vw-label">Next credit step</span><b className="num">{cliff ? `${fmtMoney(cliff.amount)} in ${fmtDur(cliff.inMin)}` : 'none pending'}</b></span>
      <span className="rev-band-item rev-band-top" title={r.top?.title ?? r.stake?.title}><span className="vw-label">{r.top ? 'Costing the most' : r.stake ? 'Most at stake' : 'Open issues'}</span><b>{r.top ? (r.top.incident ? r.top.id : r.top.dcId) : r.stake ? (r.stake.incident ? r.stake.id : r.stake.dcId) : 'none'}</b></span>
      <span className="rev-band-go">Open<I.ArrowRight size={14} /></span>
    </Link>
  );
}

/* ---------------------------------------------------------------- where */

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
    <Panel className="cmd-fill" title="What is happening" sub={`Open incidents ranked by severity and ${vocabNow().customer.toLowerCase()} impact`} icon={I.Siren} count={d.pulse.open}
      actions={<Link to="/incidents" className="panel-link">All incidents<I.ChevronRight size={14} /></Link>} flush>
      <div className="board">
        {d.topIncidents.map(i => (
          <Link key={i.id} to={`/incidents/${i.id}`} className="board-row">
            <span className={`vw-chip ${sevChipCls(i.sev)} is-strong cmd-chip`}>{sevLabel(i.sev)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="t">{i.title}</div>
              <div className="m"><span className="mono">{i.id}</span><span>·</span><span>{i.dcId}</span><span>·</span><span>{i.owner}</span><span>·</span><span>{i.status}</span></div>
              <div className="imp">{i.impact.services ? <>{i.impact.services} {vocabNow().services.toLowerCase()} · {i.impact.customers} {vocabNow().customers.toLowerCase()} · <b>{i.impact.premium} {vocabNow().premium.toLowerCase()}</b></> : <span className="faint">no {vocabNow().customer.toLowerCase()} {vocabNow().service.toLowerCase()} on the affected scope</span>}</div>
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
  return (
    <Panel title="Who is affected" sub={`${vocabNow().customer} exposure from degraded ${vocabNow().services.toLowerCase()}`} icon={I.Users}
      actions={<Link to="/incidents" className="panel-link">Incidents<I.ChevronRight size={14} /></Link>}>
      <div className="expo-top"><span className="big">{d.situation.exposedServices}</span><span className="sub">{vocabNow().services.toLowerCase()} degraded · {d.exposedCustomers.length} {vocabNow().customers.toLowerCase()} affected</span></div>
      <div className="col" style={{ gap: 6, marginTop: 10 }}>
        <StackBar height={8} parts={[{ value: st.Active, color: C.soft, label: 'Active' }, { value: st.Degraded, color: C.warn, label: 'Degraded' }, { value: st.Down, color: C.bad, label: 'Down' }, { value: st.Disabled, color: C.track, label: 'Disabled' }]} />
        <div className="row between" style={{ fontSize: 11.5, color: 'var(--ink-500)' }}><span><b className="num" style={{ color: 'var(--ink-800)' }}>{fmtNum(st.Active)}</b> active</span><span><b className="num" style={{ color: 'var(--ink-800)' }}>{st.Degraded}</b> degraded</span><span><b className="num" style={{ color: 'var(--ink-800)' }}>{st.Down}</b> down</span><span><b className="num">{st.Disabled}</b> disabled</span></div>
      </div>
      <div className="cmd-label" style={{ marginTop: 14 }}>Exposed {vocabNow().customers.toLowerCase()} <span className="n">{d.situation.exposedPremium} {vocabNow().premium.toLowerCase()}</span></div>
      <div className="expo-list">
        {d.exposedCustomers.map(c => (
          <Link key={c.id} to={`/customers/${c.id}`} className="expo-row">
            <div style={{ minWidth: 0 }}>
              <div className="n"><span>{c.name}</span>{c.premium && <Chip tone="neutral" size="xs">{vocabNow().premium}</Chip>}</div>
              <div className="s">{c.services} {vocabNow().service.toLowerCase()}{c.services === 1 ? '' : 's'} degraded · SLA {c.minSla}% · {c.segment}</div>
            </div>
            <div className="r">{c.services}<small>degraded</small></div>
          </Link>
        ))}
        {!d.exposedCustomers.length && <div className="wk-empty">No {vocabNow().customer.toLowerCase()} currently rides a degraded {vocabNow().service.toLowerCase()}.</div>}
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
            <div className="l">{c.label}{c.hot > 0 && <span className="hot">{c.hot} critical / high</span>}</div>
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
    <Panel title="What to do next" sub="Opstral AI's ranked actions — disruptive steps stay approval-gated (DC-AI-006/007)" icon={OpstralBadge}
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
                  {x.incidents > 0 ? <span className={`tpill ${x.worstSev && x.worstSev <= 2 ? 'is-inc' : 'is-plan'}`}>{x.incidents} inc{x.worstSev ? ` · ${sevLabel(x.worstSev)}` : ''}</span> : <span className="tpill is-ok">no incidents</span>}
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
