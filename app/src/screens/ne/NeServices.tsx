import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import type { ServiceType } from '../../api/types';
import { Chip } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { CustLink, Meter, ServiceChip, SvcLink } from '../../ui/status';
import { fmtBw, fmtINR } from '../../lib/format';
import type { NeData } from './NetworkElement';
import { NoTelemetry } from './common';

type S = NeData['services'][number];
const FAMILIES: { t: ServiceType; label: string }[] = [{ t: 'IRV', label: 'IRV' }, { t: 'Leased Line', label: 'Leased Line' }, { t: 'L2VPN', label: 'L2VPN' }, { t: 'L3VPN', label: 'L3VPN' }, { t: 'Other', label: 'Others' }];
const TYPE_TONE: Record<ServiceType, 'info' | 'purple' | 'cyan' | 'neutral' | 'orange'> = { IRV: 'neutral', 'Leased Line': 'orange', L2VPN: 'purple', L3VPN: 'info', Other: 'cyan' };
const AT_RISK = 88;

export function NeServices({ d }: { d: NeData }) {
  const nav = useNavigate();
  if (d.ne.discovery === 'not-discovered') return <NoTelemetry ne={d.ne} what="services" />;
  const svcs = d.services;
  if (!svcs.length) return <section className="card"><div className="empty"><span className="empty-ico"><I.Waypoints size={22} /></span><b>No services terminate on this element</b><div>{d.ne.role === 'Switch' ? 'Switches carry infrastructure traffic; services are handed off on PE routers.' : 'This element carries transit traffic only.'} Services that traverse it are listed on its links.</div></div></section>;
  const live = svcs.filter(s => s.status !== 'Disabled');
  const sla = live.length ? live.reduce((a, s) => a + Math.min(100, (s.uptime30d / s.slaTarget) * 100), 0) / live.length : 0;
  const custs = new Map(svcs.map(s => [s.customerId, s.customer]));
  /* at risk = degraded, hot, or riding a path that is hot / in an open incident */
  const linkById = new Map(d.links.map(l => [l.id, l]));
  const incLinks = new Set(d.incidents.filter(i => ['Open', 'Investigating', 'Mitigated'].includes(i.status)).flatMap(i => i.affected.filter(a => a.kind === 'Link').map(a => a.id)));
  const pathRisk = (s: S) => s.linkIds.some(id => incLinks.has(id) || (linkById.get(id)?.utilPct ?? 0) >= 85 || linkById.get(id)?.state === 'down');
  const atRisk = live.filter(s => s.status === 'Degraded' || s.status === 'Down' || s.utilPct >= 90 || pathRisk(s));
  const riskyLinks = [...new Set(atRisk.flatMap(s => s.linkIds.filter(id => incLinks.has(id) || (linkById.get(id)?.utilPct ?? 0) >= 85)))].map(id => linkById.get(id)!).filter(Boolean);
  const hot = live.filter(s => s.utilPct >= AT_RISK);
  const top = [...custs.values()].map(c => { const cs = svcs.filter(s => s.customerId === c.id); return { c, cs, rev: cs.reduce((a, s) => a + s.revenueMonthly, 0), bw: cs.reduce((a, s) => a + s.bandwidthMbps, 0), util: Math.round(cs.reduce((a, s) => a + s.utilPct, 0) / cs.length) }; })
    .sort((a, b) => Number(b.c.premium) - Number(a.c.premium) || b.rev - a.rev).slice(0, 5);
  const fam = FAMILIES.map(f => { const cs = svcs.filter(s => s.type === f.t); return { ...f, cs, growth: cs.length ? Math.round((cs.reduce((a, s) => a + s.growthPct, 0) / cs.length) * 10) / 10 : 0 }; });
  const growthTop = [...fam].filter(f => f.cs.length).sort((a, b) => b.growth - a.growth).slice(0, 2);
  const lowUp = [...live].sort((a, b) => (a.uptime30d - a.slaTarget) - (b.uptime30d - b.slaTarget))[0];
  const avgUtil = live.length ? Math.round(live.reduce((a, s) => a + s.utilPct, 0) / live.length * 10) / 10 : 0;
  const upsell = top.find(t => t.util >= 75) ?? top[0];

  const cols: Col<S>[] = [
    { key: 'id', header: 'Service', render: s => <span className="cell-2" style={{ alignItems: 'flex-start', gap: 3 }}><SvcLink id={s.id} /><Chip tone={TYPE_TONE[s.type]} size="xs">{s.type}</Chip></span>, sort: s => s.id },
    { key: 'cust', header: 'Customer', render: s => <span className="cell-2"><CustLink id={s.customerId}>{s.customer.name}</CustLink><small className="mono">{s.ifName}</small></span>, sort: s => s.customer.name },
    { key: 'st', header: 'Status', render: s => <span className="row" style={{ gap: 4 }}><ServiceChip s={s.status} size="xs" />{s.status !== 'Disabled' && pathRisk(s) && <Chip tone="error" size="xs" title="Rides a hot or incident-affected path">At risk</Chip>}</span>, sort: s => s.status },
    { key: 'util', header: 'Bandwidth · utilisation', render: s => <span className="cell-2"><Meter pct={s.utilPct} width={56} /><small className="num">{fmtBw(s.bandwidthMbps)}</small></span>, sort: s => s.utilPct },
    { key: 'up', header: 'Uptime / SLA', align: 'right', render: s => <span className="cell-2 num" style={{ alignItems: 'flex-end' }}><span className={s.uptime30d < s.slaTarget ? 'bad' : ''}>{s.uptime30d}%</span><small>target {s.slaTarget}%</small></span>, sort: s => s.uptime30d - s.slaTarget }
  ];

  return (
    <>
      <div className="ne-fam">
        {fam.map(f => (
          <div key={f.t} className="card ne-fam-card">
            <div className="row between"><b>{f.label}</b><b className="num" style={{ fontSize: 18 }}>{f.cs.length}</b></div>
            <span className="muted" style={{ fontSize: 12 }}>{f.cs.length} service{f.cs.length === 1 ? '' : 's'}</span>
            <dl>
              <div><dt>Active</dt><dd>{f.cs.filter(s => s.status === 'Active').length}</dd></div>
              <div><dt>Degraded</dt><dd className={f.cs.some(s => s.status === 'Degraded') ? 'warn' : ''}>{f.cs.filter(s => s.status === 'Degraded').length}</dd></div>
              <div><dt>Down / disabled</dt><dd>{f.cs.filter(s => s.status === 'Down' || s.status === 'Disabled').length}</dd></div>
              <div><dt>SLA target</dt><dd>{f.cs.length ? `${Math.max(...f.cs.map(s => s.slaTarget))}%` : '—'}</dd></div>
            </dl>
          </div>
        ))}
      </div>
      <div className="kpis">
        <div className="kpi vw-card-section ne-topline c-blue"><span className="kpi-label">Total service instances</span><span className="kpi-value">{svcs.length}</span><span className="kpi-basis">across {fam.filter(f => f.cs.length).length} service families</span></div>
        <div className="kpi vw-card-section ne-topline c-green"><span className="kpi-label">Average SLA compliance</span><span className="kpi-value">{sla.toFixed(2)}%</span><span className="kpi-basis">30-day uptime against each service's target</span></div>
        <div className="kpi vw-card-section ne-topline c-purple"><span className="kpi-label">Active customers</span><span className="kpi-value">{new Set(live.map(s => s.customerId)).size}</span><span className="kpi-basis">with at least one live service · {[...custs.values()].filter(c => c.premium).length} premium</span></div>
        <div className="kpi vw-card-section ne-topline c-red"><span className="kpi-label">Services at risk</span><span className="kpi-value">{atRisk.length}</span><span className="kpi-basis">degraded, above 90%, or on a hot / incident path</span></div>
      </div>
      <div className="grid g-main-side" style={{ alignItems: 'start' }}>
        <div className="col" style={{ gap: 16 }}>
          <section className="card">
            <DataTable rows={svcs} cols={cols} onRow={s => nav(`/services/${s.id}`)} pageSize={20} defaultSort={{ key: 'id', dir: 'asc' }}
              toolbar={<div className="toolbar" style={{ width: '100%' }}><span className="ne-fc-label" style={{ margin: 0 }}>All service instances</span><span className="grow" /><span className="dt-count">{svcs.length} instances</span></div>} />
          </section>
          <section className="card">
            <div className="panel-head"><div className="row" style={{ gap: 10 }}><span className="kpi-ico tone-info"><I.Users size={15} /></span><div><h3>Top 5 premium customers</h3><div className="sub">Highest revenue on this device, premium plans first</div></div></div></div>
            <div className="panel-body col" style={{ gap: 10 }}>
              {top.map((t, i) => (
                <div key={t.c.id} className="ne-cust">
                  <div className="row" style={{ gap: 10 }}><span className="ne-rank">#{i + 1}</span><div style={{ minWidth: 0 }}><div className="row" style={{ gap: 8 }}><CustLink id={t.c.id}><b>{t.c.name}</b></CustLink><Chip tone="neutral" size="xs">{t.c.id}</Chip>{t.c.premium && <Chip tone="purple" size="xs">Premium</Chip>}</div><span className="muted" style={{ fontSize: 12 }}>{t.c.city}, {t.c.state}</span></div></div>
                  <dl className="ne-cust-m">
                    <div><dt>Service plan</dt><dd>{t.c.plan}</dd></div>
                    <div><dt>Bandwidth</dt><dd className="num">{fmtBw(t.bw)}</dd></div>
                    <div><dt>Utilisation</dt><dd><Meter pct={t.util} width={56} /></dd></div>
                    <div><dt>Services here</dt><dd><CustLink id={t.c.id}>{t.cs.length} service{t.cs.length === 1 ? '' : 's'}</CustLink> · {fmtINR(t.rev)}/mo</dd></div>
                  </dl>
                </div>
              ))}
              <div className="ne-cust-foot"><div><dt>Avg. utilisation</dt><dd>{avgUtil}%</dd></div><div><dt>Total services</dt><dd>{live.length} active</dd></div><div><dt>Revenue on device</dt><dd>{fmtINR(svcs.reduce((a, s) => a + s.revenueMonthly, 0))}/mo</dd></div></div>
            </div>
          </section>
        </div>
        <div className="col" style={{ gap: 12 }}>
          <Insight title="Next 30 days" sub="Growth forecast by family">
            {growthTop.map(f => <InsightItem key={f.t} title={`${f.label} services`} badge={`+${Math.round(f.growth * 3 * 10) / 10}% / qtr`} tone="info">Average +{f.growth}%/mo across {f.cs.length} instances{f.cs.some(s => s.utilPct >= 75) ? `; ${f.cs.filter(s => s.utilPct >= 75).length} above 75% need a capacity review` : '; headroom is adequate'}.</InsightItem>)}
          </Insight>
          <Insight title="Quality insights" sub="Service health">
            {lowUp && lowUp.uptime30d < lowUp.slaTarget
              ? <InsightItem title={`${lowUp.id} below SLA`} tone="warning" badge={`${lowUp.uptime30d}%`}>{lowUp.customer.name} {lowUp.type} is under its {lowUp.slaTarget}% target over 30 days. Check the path on its links.</InsightItem>
              : <InsightItem title="All services within SLA" tone="success">Every live instance meets its 30-day uptime target.</InsightItem>}
          </Insight>
          <Insight title="Capacity alerts" sub={`${new Set([...hot, ...atRisk].map(s => s.customerId)).size} customers at risk`} hot={hot.length + riskyLinks.length > 0}>
            {riskyLinks.map(l => { const on = atRisk.filter(s => s.linkIds.includes(l.id)); const local = l.aNe === d.ne.id ? l.aIf : l.zIf; return <InsightItem key={l.id} title={`${on.length} services ride ${local}`} tone="error" badge={`${l.utilPct}%`}>{l.role} link{incLinks.has(l.id) ? ' is in an open incident' : ' is above the 85% warning line'} — {on.filter(s => s.customer.premium).length} premium customers ({[...new Set(on.filter(s => s.customer.premium).map(s => s.customer.name))].slice(0, 3).join(', ')}).</InsightItem>; })}
            {hot.slice(0, 3).map(s => <InsightItem key={s.id} title={`${s.customer.name} · ${s.id}`} tone="error" badge={`${s.utilPct}%`}>Above the {AT_RISK}% utilisation threshold on {fmtBw(s.bandwidthMbps)}.</InsightItem>)}
            {!hot.length && !riskyLinks.length && <InsightItem title="No customers at risk">Every service instance is under the {AT_RISK}% utilisation threshold.</InsightItem>}
          </Insight>
          <Insight title="Behaviour insights" sub="Customer patterns">
            <InsightItem title={`Top ${top.length} revenue contributors`}>{top.filter(t => t.c.premium).length} on premium plans; combined {fmtINR(top.reduce((a, t) => a + t.rev, 0))}/mo on this device.</InsightItem>
            {lowUp && <InsightItem title={`${lowUp.customer.name} — churn watch`}>Lowest uptime margin here ({lowUp.uptime30d}% vs {lowUp.slaTarget}%). Schedule an account review.</InsightItem>}
          </Insight>
          <Insight title="AI recommendations" sub="Priority actions · deterministic from this device's data">
            <InsightItem title="1. Capacity">{riskyLinks.length ? `Re-route ${atRisk.length} services off ${riskyLinks.map(l => (l.aNe === d.ne.id ? l.aIf : l.zIf)).join(', ')} and raise a capacity plan for the span.` : hot.length ? `Upgrade or re-route ${hot.length} service${hot.length > 1 ? 's' : ''} above ${AT_RISK}% before month end.` : 'No immediate capacity action required.'}</InsightItem>
            {upsell && <InsightItem title="2. Upsell opportunity">Offer {upsell.c.name} a bandwidth upgrade — {upsell.util}% average utilisation across {upsell.cs.length} service{upsell.cs.length > 1 ? 's' : ''}.</InsightItem>}
            {lowUp && <InsightItem title="3. Retention action">Call {lowUp.customer.name} about {lowUp.id}; uptime {lowUp.uptime30d}% against {lowUp.slaTarget}%.</InsightItem>}
          </Insight>
        </div>
      </div>
    </>
  );
}

function Insight({ title, sub, hot, children }: { title: string; sub: string; hot?: boolean; children: React.ReactNode }) {
  return <section className={`card ne-ins${hot ? ' is-hot' : ''}`}><div className="ne-ins-head"><b>{title}</b><span>{sub}</span></div><div className="ne-ins-body">{children}</div></section>;
}
function InsightItem({ title, badge, tone = 'neutral', children }: { title: string; badge?: string; tone?: 'info' | 'warning' | 'error' | 'success' | 'neutral'; children: React.ReactNode }) {
  return <div className="ne-ins-item"><div className="row between" style={{ alignItems: 'flex-start' }}><b>{title}</b>{badge && <Chip tone={tone} size="xs">{badge}</Chip>}</div><p>{children}</p></div>;
}
