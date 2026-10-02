import { Link, useNavigate, useParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getService, useQuery } from '../api';
import { usePage, PageHead, Loading, useSentinel } from '../shell/page';
import { Btn, Chip, Kpi, Panel, Empty } from '../ui/kit';
import { CustLink, DcLink, IncLink, IncidentChip, LinkStateChip, Meter, NeLink, ServiceChip, SevChip, SeverityChip, Fresh } from '../ui/status';
import { fmtAgo, fmtBw, fmtINR, fmtMonth } from '../lib/format';
import { monthsTo, dateAfterMonths, project } from '../lib/forecast';
import { ForecastChart } from './plan/charts';
import { TYPE_TONE } from './Services';
import { NotFound } from './NotFound';
import '../styles/plan.css';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SVC_LIMIT = 90;

/* WF-07 — service / customer risk: path trace, exposure, forecast, action */
export function ServiceDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const ask = useSentinel();
  const { data, loading } = useQuery(() => getService(id), [id]);
  usePage([{ label: 'Network services', to: '/services' }, { label: id }], { serviceId: id, dcId: data?.service.dcId, neId: data?.service.neId });
  if (loading && !data) return <Loading />;
  if (!data) return <NotFound what="Service" />;
  const { service: s, customer: c, ne, dc, rack, handoff, links, alerts, incidents } = data;
  const now = clockNow();
  const bh = links[0];
  const remote = bh ? (bh.aNe === ne.id ? bh.zNe : bh.aNe) : undefined;
  const remoteDc = remote?.split('-').slice(0, 3).join('-');
  const m90 = monthsTo(s.utilPct, s.growthPct, SVC_LIMIT);
  const hist = Array.from({ length: 6 }, (_, i) => Math.round((s.utilPct / Math.pow(1 + s.growthPct / 100, 5 - i)) * 10) / 10);
  const fc = project(s.utilPct, s.growthPct, 12);
  const d0 = new Date(now);
  const labels = Array.from({ length: 18 }, (_, i) => { const d = new Date(d0.getFullYear(), d0.getMonth() - 5 + i, 1); return `${MON[d.getMonth()]}${d.getMonth() === 0 || i === 0 ? ` ${String(d.getFullYear()).slice(2)}` : ''}`; });
  const slaGap = Math.round((s.uptime30d - s.slaTarget) * 100) / 100;

  /* deterministic recommendation (mock AI, DC-AI-006) */
  const rec = (() => {
    if (s.status === 'Disabled') return { tone: 'neutral', title: 'No action — service disabled', why: 'The service is administratively disabled; no traffic or SLA exposure.', act: null as null | { label: string; to: string } };
    if (bh?.state === 'down') return { tone: 'error', title: 'Re-route onto the protected path', why: `Backhaul ${bh.aIf} is down; the service is running on its standby LSP with no further redundancy.`, act: { label: 'Open link', to: `/ne/${ne.id}?tab=links&if=${encodeURIComponent(bh.aNe === ne.id ? bh.aIf : bh.zIf)}` } };
    if (incidents.length) return { tone: 'error', title: `Follow ${incidents[0].id} action plan and notify ${c.name}`, why: `${incidents[0].title}. ${c.premium ? 'Premium customer — proactive notification is required by the SLA.' : ''}`, act: { label: `Open ${incidents[0].id}`, to: `/incidents/${incidents[0].id}` } };
    if (s.utilPct >= SVC_LIMIT || m90 <= 3) return { tone: 'warning', title: `Upgrade bandwidth from ${fmtBw(s.bandwidthMbps)}`, why: s.utilPct >= SVC_LIMIT ? `Utilisation ${s.utilPct}% is above the ${SVC_LIMIT}% service threshold.` : `At +${s.growthPct}%/mo it crosses ${SVC_LIMIT}% in ~${Math.max(1, Math.round(m90))} months.`, act: { label: 'Customer view', to: `/customers/${c.id}` } };
    if (bh && bh.forecastMonths <= 6) return { tone: 'warning', title: 'Raise a capacity plan for the backhaul span', why: `${bh.aNe} ${bh.aIf} is at ${bh.utilPct}% and crosses 85% ${bh.forecastMonths === 0 ? 'already' : `around ${fmtMonth(bh.forecastDate!)}`}; this service shares it.`, act: { label: 'Capacity · network', to: '/capacity?tab=network' } };
    if (slaGap < 0) return { tone: 'warning', title: 'Review service credit exposure', why: `30-day uptime ${s.uptime30d}% is ${Math.abs(slaGap)} pts below the ${s.slaTarget}% target.`, act: { label: 'Customer view', to: `/customers/${c.id}` } };
    return { tone: 'success', title: 'No action required', why: Number.isFinite(m90) ? `Healthy — ${Math.round(m90)} months of headroom before ${SVC_LIMIT}% at +${s.growthPct}%/mo.` : 'Healthy — no growth trend.', act: null };
  })();

  return (
    <div className="page">
      <PageHead title={<span className="mono">{s.id}</span>} chips={<><ServiceChip s={s.status} /><Chip tone={TYPE_TONE[s.type]}>{s.type}</Chip>{s.critical && <Chip tone="purple">Premium</Chip>}</>}
        sub={<><CustLink id={c.id}>{c.name}</CustLink> · {c.plan} · delivered from <DcLink id={s.dcId} /> ({dc.city})</>}
        actions={<Btn icon={I.Sparkles} onClick={() => ask(`What services depend on ${bh?.id ?? ne.id}?`)}>Ask Opstral AI</Btn>} />

      <div className="kpis kpis-5">
        <Kpi label="Bandwidth" value={fmtBw(s.bandwidthMbps)} icon={I.Gauge} tone="info" basis={`handoff ${s.ifName}`} />
        <Kpi label="Utilisation" value={s.utilPct} unit="%" icon={I.Activity} tone={s.utilPct >= SVC_LIMIT ? 'error' : s.utilPct >= 75 ? 'warning' : 'success'} basis={`threshold ${SVC_LIMIT}%`} />
        <Kpi label="30-day uptime" value={s.uptime30d} unit="%" icon={I.ShieldCheck} tone={slaGap < 0 ? 'error' : 'success'} basis={<>SLA target {s.slaTarget}% · <span className={slaGap < 0 ? 'bad' : 'good'}>{slaGap >= 0 ? '+' : ''}{slaGap} pts</span></>} />
        <Kpi label="Revenue / month" value={fmtINR(s.revenueMonthly)} icon={I.IndianRupee} tone="purple" basis={`${fmtINR(s.revenueMonthly * 12)} a year`} />
        <Kpi label="Growth" value={`+${s.growthPct}`} unit="%/mo" icon={I.TrendingUp} tone="cyan" basis={Number.isFinite(m90) ? (m90 === 0 ? `already above ${SVC_LIMIT}%` : `${SVC_LIMIT}% around ${fmtMonth(dateAfterMonths(now, m90))}`) : 'flat'} />
      </div>

      <Panel title="Service path" sub="Customer handoff → provider edge → backhaul → far end. Every hop opens its record." icon={I.Route} actions={<Fresh>telemetry · updated 1 min ago</Fresh>}>
        <div className="path">
          <div className="path-node">
            <span className="path-k"><I.Building size={14} />Customer</span>
            <CustLink id={c.id}>{c.name}</CustLink>
            <small>{c.id} · {c.segment} · {c.city}</small>
          </div>
          <PathEdge label={fmtBw(s.bandwidthMbps)} />
          <div className="path-node">
            <span className="path-k"><I.Plug size={14} />Handoff interface</span>
            <span className="mono strong">{s.ifName}</span>
            <small>{handoff?.type ?? '—'} · {handoff?.state ?? '—'} · {handoff ? `${handoff.utilPct}% util` : ''}</small>
          </div>
          <PathEdge />
          <div className="path-node">
            <span className="path-k"><I.Router size={14} />Provider edge</span>
            <NeLink id={ne.id} />
            <small>{ne.vendor} {ne.model} · {rack.name} · U{ne.u} · <DcLink id={ne.dcId} /></small>
            <small>Health <b className="num">{Math.round(ne.healthScore)}</b> · {alerts.filter(a => a.neId === ne.id).length} alarms on path</small>
          </div>
          <PathEdge label={bh ? `${bh.protocol} · ${bh.role}` : 'no backhaul'} hot={bh ? bh.state === 'down' || bh.utilPct >= 85 : false} />
          {bh ? (
            <div className={`path-node${bh.state === 'down' || bh.utilPct >= 85 ? ' is-hot' : ''}`}>
              <span className="path-k"><I.Cable size={14} />Backhaul link</span>
              <span className="row" style={{ gap: 8 }}><Link className="ent-link mono" to={`/ne/${ne.id}?tab=links&if=${encodeURIComponent(bh.aNe === ne.id ? bh.aIf : bh.zIf)}`}>{bh.aNe === ne.id ? bh.aIf : bh.zIf}</Link><LinkStateChip s={bh.state} /></span>
              <Meter pct={bh.utilPct} width={90} />
              <small>{fmtBw(bh.capacityMbps)} · +{bh.growthPct}%/mo · 85% {bh.forecastMonths === 0 ? 'already crossed' : bh.forecastDate ? `≈ ${fmtMonth(bh.forecastDate)}` : 'not forecast'}</small>
            </div>
          ) : <div className="path-node"><span className="path-k">Backhaul</span><small>Local service — no backhaul span</small></div>}
          <PathEdge />
          <div className="path-node">
            <span className="path-k"><I.Server size={14} />Far end</span>
            {remote ? <><NeLink id={remote} /><small><DcLink id={remoteDc!} /> · {bh ? (bh.aNe === ne.id ? bh.zIf : bh.aIf) : ''}</small></> : <small>—</small>}
          </div>
        </div>
      </Panel>

      <div className="grid g-2-1">
        <Panel title="Capacity outlook" sub={`Service utilisation at +${s.growthPct}%/mo against the ${SVC_LIMIT}% service threshold`} icon={I.TrendingUp}>
          <ForecastChart labels={labels} history={[...hist, ...Array(12).fill(null)]} forecast={[...Array(5).fill(null), ...fc]} nowIndex={5} warn={SVC_LIMIT} crit={100} height={240} />
          <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
            <Chip tone="info" size="xs">actual (6 months, back-computed from trend)</Chip><Chip tone="purple" size="xs">forecast 12 months</Chip>
            <Chip tone={m90 <= 6 ? 'warning' : 'success'} size="xs">{Number.isFinite(m90) ? (m90 === 0 ? `above ${SVC_LIMIT}% now` : `${SVC_LIMIT}% in ~${Math.max(1, Math.round(m90))} months`) : 'no exhaustion'}</Chip>
          </div>
        </Panel>
        <section className={`card rec-card tone-b-${rec.tone}`}>
          <div className="rec-head"><I.Sparkles size={15} />Recommended action</div>
          <b>{rec.title}</b>
          <p>{rec.why}</p>
          <div className="faint" style={{ fontSize: 11.5 }}>Evidence: service telemetry, backhaul forecast, open incidents and SLA ledger for {s.id}.</div>
          {rec.act && <Btn variant="filled" iconRight={I.ArrowRight} onClick={() => nav(rec.act!.to)}>{rec.act.label}</Btn>}
        </section>
      </div>

      <div className="grid g-2">
        <Panel title="Alerts on the path" count={alerts.length} icon={I.BellRing} flush>
          {alerts.length ? (
            <table className="nst-table dt-table"><thead><tr><th>Severity</th><th>Alert</th><th>Source</th><th className="is-right">Raised</th></tr></thead>
              <tbody>{alerts.map(a => (
                <tr key={a.id} className="is-click" onClick={() => nav(a.neId ? `/ne/${a.neId}?tab=alerts` : `/datacenters/${a.dcId}?tab=attention`)}>
                  <td><SeverityChip s={a.severity} size="xs" /></td><td className="is-wrap"><span className="cell-2"><b className="strong">{a.title}</b><small className="mono">{a.code} · {a.neId ?? a.dcId}{a.ifName ? ` ${a.ifName}` : ''}</small></span></td><td>{a.source}</td><td className="is-right num">{fmtAgo(a.start, now)}</td>
                </tr>))}</tbody></table>
          ) : <Empty icon={I.CheckCircle2} title="No active alerts on this path" />}
        </Panel>
        <Panel title="Open incidents affecting this service" count={incidents.length} icon={I.Siren} flush>
          {incidents.length ? (
            <table className="nst-table dt-table"><thead><tr><th>Incident</th><th>Sev</th><th>Status</th><th>Owner</th></tr></thead>
              <tbody>{incidents.map(i => (
                <tr key={i.id} className="is-click" onClick={() => nav(`/incidents/${i.id}`)}>
                  <td className="is-wrap"><span className="cell-2"><IncLink id={i.id} /><small>{i.title}</small></span></td><td><SevChip n={i.sev} size="xs" /></td><td><IncidentChip s={i.status} size="xs" /></td><td>{i.owner}</td>
                </tr>))}</tbody></table>
          ) : <Empty icon={I.CheckCircle2} title="No open incident touches this service" />}
        </Panel>
      </div>
    </div>
  );
}

function PathEdge({ label, hot }: { label?: string; hot?: boolean }) {
  return <div className={`path-edge${hot ? ' is-hot' : ''}`}><span>{label ?? ''}</span><i /><I.ChevronRight size={14} /></div>;
}
