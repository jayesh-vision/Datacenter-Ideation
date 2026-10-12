import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ListToolbar } from '../ui/ListToolbar';
import * as I from 'lucide-react';
import { clockNow, getCustomer, useQuery, vocabNow } from '../api';
import type { Customer, Service } from '../api/types';
import { usePage, Loading, useSentinel } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { Btn, Chip, Info, Panel, Empty } from '../ui/kit';
import { DcLink, IncLink, IncidentChip, Meter, NeLink, ServiceChip, SevChip } from '../ui/status';
import { Facts, SoftMeter, Split, StatGrid, StatTile, type Tone } from '../ui/Analytics';
import { BarList } from '../charts/BarList';
import { fmtAgo, fmtDur, fmtMoney, fmtQty } from '../lib/format';
import { TYPE_TONE } from './Services';
import { NotFound } from './NotFound';
import { CREDIT, DomainTag, LOSS, impactOf, inr, lc, perHr, perMo, stateText } from './revenue/parts';
import '../styles/plan.css';
import '../styles/customer.css';
import { OpstralBtn } from '../ui/OpstralMark';

type Row = Service & { customer: Customer };

export function CustomerDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const ask = useSentinel();
  const { data, loading, reload } = useQuery(() => getCustomer(id), [id]);
  const [cq, setCq] = useState(''), [cst, setCst] = useState(''), [cdc, setCdc] = useState('');
  const V = vocabNow();
  usePage([{ label: V.customers, to: '/customers' }, { label: data?.customer.name ?? id }]);
  if (loading && !data) return <Loading />;
  if (!data) return <NotFound what="Customer" />;
  const { customer: c, services, incidents, revenue: rv, hits } = data;
  const W = V.money, now = clockNow();
  const live = services.filter(s => s.status !== 'Disabled');
  const belowSla = live.filter(s => s.uptime30d < s.slaTarget);
  const hot = live.filter(s => s.utilPct >= 90);
  const dcs = [...new Set(services.map(s => s.dcId))];
  const down = rv?.down ?? 0, degraded = rv?.degraded ?? 0, exposed = rv?.exposed ?? 0, impacted = down + degraded + exposed;
  const losing = !!rv && rv.rate + rv.lost + rv.credits > 0;
  const worst = hits[0];
  /* one verdict for the whole account: losing now, running on a fault, behind on SLA, or normal */
  const state: 'critical' | 'attention' | 'ok' = down + degraded > 0 ? 'critical' : exposed > 0 || belowSla.length > 0 || c.exposed > 0 ? 'attention' : 'ok';
  const stateLabel = down ? 'Service down' : degraded ? 'Degraded' : exposed ? 'At risk' : belowSla.length ? 'Below SLA' : c.exposed ? 'On an incident path' : 'Normal';
  const initials = c.name.split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  const amInitials = c.accountManager.split(' ').map(w => w[0]).slice(0, 2).join('');
  const weakest = live.length ? live.reduce((a, s) => (s.uptime30d - s.slaTarget < a.uptime30d - a.slaTarget ? s : a), live[0]) : undefined;
  const slaMetPct = live.length ? Math.round(((live.length - belowSla.length) / live.length) * 100) : 100;
  const peak = live.length ? Math.round(Math.max(...live.map(s => s.utilPct))) : 0;
  const byType = Object.entries(live.reduce<Record<string, number>>((a, s) => { a[s.type] = (a[s.type] ?? 0) + s.revenueMonthly; return a; }, {})).sort((a, b) => Number(a[0] === 'Other') - Number(b[0] === 'Other') || b[1] - a[1]);
  const impactedIds = new Set(services.filter(s => s.status === 'Down' || s.status === 'Degraded').map(s => s.dcId));
  hits.forEach(h => impactedIds.add(h.issue.dcId));
  const footprint = dcs.map(id => { const l = live.filter(s => s.dcId === id); return { id, n: l.length, mrr: l.reduce((a, s) => a + s.revenueMonthly, 0), hit: impactedIds.has(id) }; }).sort((a, b) => Number(b.hit) - Number(a.hit) || b.mrr - a.mrr);
  const quiet = incidents.filter(i => !hits.some(h => h.issue.id === i.id));
  const shown = services.filter(s => (!cst || s.status === cst) && (!cdc || s.dcId === cdc) && (!cq || `${s.id} ${s.type} ${s.neId}`.toLowerCase().includes(cq.toLowerCase())));

  const cols: Col<Row>[] = [
    { key: 'id', header: `${V.service} ID`, render: s => <span className="mono strong">{s.id}</span>, sort: s => s.id },
    { key: 'type', header: 'Type', render: s => <Chip tone={(TYPE_TONE[s.type] ?? 'neutral')} size="xs">{s.type}</Chip>, sort: s => s.type },
    { key: 'dc', header: 'Datacenter', render: s => <DcLink id={s.dcId} />, sort: s => s.dcId },
    { key: 'ne', header: V.handoff, render: s => <span className="cell-2"><NeLink id={s.neId} tab="services">{s.neId.replace(`${s.dcId}-`, '')}</NeLink><small className="mono">{s.ifName}</small></span> },
    { key: 'status', header: 'Status', render: s => <ServiceChip s={s.status} size="xs" /> },
    { key: 'bw', header: 'Size', align: 'right', render: s => <span className="num">{fmtQty(s.qty, s.unit)}</span>, sort: s => s.qty },
    { key: 'util', header: 'Utilisation', render: s => <Meter pct={s.utilPct} width={60} />, sort: s => s.utilPct },
    { key: 'sla', header: 'SLA / uptime', align: 'right', render: s => <span className="num">{s.slaTarget}% / <span className={s.uptime30d < s.slaTarget ? 'bad' : ''}>{s.uptime30d}%</span></span>, sort: s => s.uptime30d - s.slaTarget }
  ];

  return (
    <div className="page cd">
      {/* identity: who this is, how they stand right now, who owns the relationship */}
      <section className="vw-card-section cd-head">
        <div className="cd-top">
          <span className="cd-avatar" aria-hidden="true">{initials}</span>
          <div className="cd-id">
            <div className="cd-name-row">
              <h1 className="cd-name">{c.name}<Info text={`Who this ${V.customer.toLowerCase()} is and how they stand now. The state is the worst of their ${V.services.toLowerCase()}: down, degraded, running on a critical fault, below SLA over 30 days or on an open incident's path. The verdict line names the main cause.`} /></h1>
              <Chip tone="neutral">{c.segment}</Chip>
              {c.premium && <Chip tone="info">{V.premium}</Chip>}
              <span className={`cd-state is-${state}`}><i />{stateLabel}</span>
            </div>
            <div className="vw-label cd-sub"><span className="mono">{c.id}</span><span><I.MapPin size={13} />{c.city}, {c.state}</span><span><I.FileText size={13} />{c.plan}</span></div>
          </div>
          <div className="cd-actions">
            <Btn icon={I.ArrowLeft} onClick={() => nav(-1)}>Back</Btn>
            <OpstralBtn onClick={() => ask(incidents[0] ? `Who is impacted by ${incidents[0].id}?` : `What services depend on ${services[0]?.neId ?? ''}?`)} />
          </div>
        </div>
        <dl className="cd-meta">
          <div><dt>Account manager</dt><dd><span><span className="cd-am">{amInitials}</span>{c.accountManager}</span><small>{c.premium ? `${V.premium} account` : 'Standard account'}</small></dd></div>
          <div><dt>SLA commitment</dt><dd>{weakest ? `${Math.max(...live.map(s => s.slaTarget))}% uptime` : '—'}<small>{c.premium ? 'proactive notice' : 'standard'}</small></dd></div>
          <div><dt>Footprint</dt><dd title={dcs.join(', ')}>{dcs.length} datacenter{dcs.length === 1 ? '' : 's'}<small>{live.length} {V.services.toLowerCase()}</small></dd></div>
          <div><dt>{W.base}</dt><dd className="num">{inr(c.revenueMonthly)}<small>{inr(c.revenueMonthly * 12)} a year</small></dd></div>
          <div><dt>{V.capacityLabel}</dt><dd className="num">{fmtQty(live.filter(s => s.unit === V.primaryUnit).reduce((a, s) => a + s.qty, 0), V.primaryUnit)}<small>provisioned</small></dd></div>
        </dl>
        <div className={`cd-verdict is-${state}`}>
          {state === 'ok' ? <I.CircleCheck size={16} /> : <I.ShieldAlert size={16} />}
          <span>
            {losing && worst ? <><b>{stateText({ down, degraded, exposed: 0 })}.</b> Losing {perHr(rv!.rate)}, {inr(impactOf(rv!))} so far. Main cause: {worst.issue.title} at {worst.issue.dcId}.</>
              : exposed && worst ? <><b>{exposed} {V.services.toLowerCase()} running on a critical fault.</b> {worst.issue.title} at {worst.issue.dcId}. Nothing is lost yet, {perMo(rv!.mrrExposed)} is at stake.</>
              : belowSla.length ? <><b>{belowSla.length} {V.services.toLowerCase()} below the SLA target over 30 days.</b> No active fault now{rv?.creditsLocked ? <>, {inr(rv.creditsLocked)} of {lc(W.credits)} already owed</> : null}.</>
              : c.exposed ? <><b>{c.exposed} {V.services.toLowerCase()} sit on the path of an open incident.</b> Still running normally.</>
              : <><b>All {V.services.toLowerCase()} are running normally.</b> No open issue touches this {V.customer.toLowerCase()}.</>}
            {c.premium && state !== 'ok' ? <> Notify {c.accountManager}: {V.premium.toLowerCase()} terms require proactive notification.</> : null}
          </span>
          {worst && <Link to={worst.issue.to} className="nst-btn nst-btn--sm nst-btn--ghost cd-verdict-go">{worst.issue.incident ? worst.issue.id : 'Open the fault'}<I.ArrowRight size={14} /></Link>}
        </div>
      </section>

      <StatGrid>
        <StatTile label={V.services} value={live.length} sub={services.length > live.length ? `of ${services.length}` : 'in service'} info={`${V.services} on this account that are not disabled, by status: Down, Degraded or Active. The fact counts the distinct ${V.service.toLowerCase()} types.`}>
          <Split parts={[{ key: 'down', label: 'Down', n: live.filter(s => s.status === 'Down').length, tone: 'error' as Tone }, { key: 'deg', label: 'Degraded', n: live.filter(s => s.status === 'Degraded').length, tone: 'orange' as Tone }, { key: 'ok', label: 'Active', n: live.filter(s => s.status === 'Active').length, tone: 'info' as Tone }]} />
          <Facts items={[{ n: [...new Set(live.map(s => s.type))].length, label: `${V.service.toLowerCase()} types` }]} />
        </StatTile>
        <StatTile label="Impacted now" value={impacted} sub={`of ${live.length}`} subTone={down + degraded ? 'bad' : exposed ? 'warn' : undefined} info={`${V.services} charged to an open issue: down or degraded (losing now) or exposed (still running, but on a critical fault). The fact counts the open issues hitting this ${V.customer.toLowerCase()}.`}>
          <Split parts={[{ key: 'down', label: 'Down', n: down, tone: 'error' }, { key: 'deg', label: 'Degraded', n: degraded, tone: 'orange' }, { key: 'exp', label: 'Exposed', n: exposed, tone: 'warning' }]} />
          <Facts items={[{ n: hits.length, label: `open issue${hits.length === 1 ? '' : 's'}`, tone: hits.length ? 'warn' : undefined }]} />
        </StatTile>
        <StatTile label="SLA · 30 d" value={weakest ? `${weakest.uptime30d}%` : '—'} sub={weakest ? `of ${weakest.slaTarget}%` : undefined} subTone={belowSla.length ? 'bad' : undefined} info={`30-day uptime of the ${V.service.toLowerCase()} furthest from its SLA target, against that target. The meter is the share of ${V.services.toLowerCase()} meeting their target; ${lc(W.credits)} owed are the tiers already locked in by the shortfall.`}>
          <SoftMeter pct={slaMetPct} tone={slaMetPct >= 95 ? 'info' : slaMetPct >= 85 ? 'warning' : 'error'} />
          <Facts items={[{ n: `${slaMetPct}%`, label: 'meeting SLA' }, { n: belowSla.length, label: 'below target', tone: belowSla.length ? 'warn' : undefined }, { n: inr(rv?.creditsLocked ?? 0), label: 'credits owed' }]} />
        </StatTile>
        <StatTile label="Utilisation" value={`${c.avgUtil}%`} sub="average" subTone={c.avgUtil >= 85 ? 'warn' : undefined} info={`Average utilisation across this ${V.customer.toLowerCase()}'s ${V.services.toLowerCase()}, with the highest single ${V.service.toLowerCase()} and how many run at 90% or more of their contracted size. Running hot is not counted as a loss.`}>
          <SoftMeter pct={c.avgUtil} tone={c.avgUtil >= 85 ? 'error' : c.avgUtil >= 75 ? 'warning' : 'info'} />
          <Facts items={[{ n: `${peak}%`, label: 'highest' }, { n: hot.length, label: 'at 90% or more', tone: hot.length ? 'warn' : undefined }]} />
        </StatTile>
        <StatTile label={W.noun} value={inr(c.revenueMonthly)} sub="a month" info={`${W.base} for this ${V.customer.toLowerCase()}, split by ${V.service.toLowerCase()} type (largest first, smaller types folded into Other).`}>
          <Split other={inr} parts={byType.map(([k, n]) => ({ key: k, label: k, n, tone: 'info' as Tone, display: inr(n) }))} />
        </StatTile>
        <StatTile label={W.impact} value={losing ? perHr(rv!.rate) : exposed ? inr(rv!.mrrExposed) : inr(0)} sub={losing ? 'now' : exposed ? 'at stake' : 'no impact'} subTone={losing ? 'bad' : exposed ? 'warn' : undefined} info={`What open issues cost this ${V.customer.toLowerCase()}: the hourly loss now (or the monthly ${lc(W.noun)} at stake on a critical fault), ${lc(W.lost)} so far and ${lc(W.credits)} triggered, plus the time to the next credit step.`}>
          <Split parts={[{ key: 'lost', label: W.lost, n: rv?.lost ?? 0, tone: 'error', display: inr(rv?.lost ?? 0) }, { key: 'cr', label: W.credits, n: rv?.credits ?? 0, tone: 'orange', display: inr(rv?.credits ?? 0) }]} />
          <Facts items={[rv && rv.nextCliffMin !== null ? { n: fmtDur(rv.nextCliffMin), label: 'to the next credit', tone: rv.nextCliffMin <= 60 ? 'bad' : 'warn' } : { n: inr(rv ? impactOf(rv) : 0), label: 'so far' }]} />
        </StatTile>
      </StatGrid>

      <div className="grid cd-grid">
        <Panel title={`What is impacting this ${V.customer.toLowerCase()}`} count={hits.length + quiet.length} icon={I.Siren} flush info={`Open issues this ${V.customer.toLowerCase()}'s ${V.services.toLowerCase()} are charged to, most costly first, then open incidents on their delivery path with no impact yet. Click a row to open the issue or incident.`}>
          {hits.length + quiet.length ? (
            <table className="nst-table dt-table cd-hits"><thead><tr><th>Issue</th><th>{V.services} hit</th><th>{W.impact}</th><th>Tracked by</th></tr></thead>
              <tbody>
                {hits.map(h => (
                  <tr key={h.issue.id} className="is-click" onClick={() => nav(h.issue.to)}>
                    <td className="is-wrap"><span className="cell-2"><span className="strong" style={{ fontWeight: 500 }}>{h.issue.title}</span><small>{h.issue.dcId}{h.issue.where !== h.issue.dcId ? ` · ${h.issue.where}` : ''} · began {fmtAgo(h.issue.since, now)}</small><span className="rev-flags"><DomainTag d={h.issue.domain} /></span></span></td>
                    <td><span className="cell-2"><span className="nowrap">{stateText(h)}</span><small className="nowrap">{inr(h.mrr)} a month</small></span></td>
                    <td>{h.rate + h.lost + h.credits > 0
                      ? <span className="cell-2"><span className="num rev-amt nowrap rev-bad">{perHr(h.rate)}</span><small className="nowrap">{inr(impactOf(h))} so far</small></span>
                      : <span className="cell-2"><span className="num nowrap">{perMo(h.mrrExposed)}</span><small className="nowrap">at stake</small></span>}</td>
                    <td>{h.issue.incident ? <span className="cell-2"><span className="row nowrap" style={{ gap: 6 }}><IncLink id={h.issue.incident.id} /><SevChip n={h.issue.incident.sev} size="xs" /></span><small className="nowrap">{h.issue.incident.owner}</small></span> : <span className="vw-chip vw-chip--warning">No incident</span>}</td>
                  </tr>))}
                {quiet.map(i => (
                  <tr key={i.id} className="is-click" onClick={() => nav(`/incidents/${i.id}`)}>
                    <td className="is-wrap"><span className="cell-2"><span className="strong" style={{ fontWeight: 500 }}>{i.title}</span><small>{i.dcId} · on the delivery path</small></span></td>
                    <td><span className="faint">running</span></td>
                    <td><span className="faint">no impact</span></td>
                    <td><span className="cell-2"><span className="row nowrap" style={{ gap: 6 }}><IncLink id={i.id} /><SevChip n={i.sev} size="xs" /></span><small className="nowrap"><IncidentChip s={i.status} size="xs" /></small></span></td>
                  </tr>))}
              </tbody></table>
          ) : <Empty icon={I.CheckCircle2} title="Nothing is impacting them">No open incident or active fault sits on this {V.customer.toLowerCase()}'s {V.services.toLowerCase()}.</Empty>}
        </Panel>
        <Panel title="Where they are served" icon={I.Building2} sub={`Monthly ${lc(W.noun)} by datacenter · impacted sites first`} info={`Monthly ${lc(W.noun)} of live ${V.services.toLowerCase()} per datacenter. Sites with an impacted ${V.service.toLowerCase()} are coloured and listed first. Click a bar to open that datacenter's ${V.customers.toLowerCase()} tab.`}>
          <BarList limit={6} items={footprint.map(f => ({ key: f.id, label: f.id, sublabel: `${f.n} ${(f.n === 1 ? V.service : V.services).toLowerCase()}`, value: f.mrr, display: fmtMoney(f.mrr), secondary: f.hit ? 'impacted' : undefined, color: f.hit ? (losing ? LOSS : CREDIT) : 'var(--vw-color-slate-400)', onClick: () => nav(`/datacenters/${f.id}?tab=customers`) }))} />
          {footprint.length > 6 && <span className="vw-label cd-more">+{footprint.length - 6} more datacenters · filter the list below</span>}
        </Panel>
      </div>

      <Panel title={V.services} count={services.length} icon={I.Waypoints} flush info={`Every ${V.service.toLowerCase()} on the account with its datacenter, handoff point, status, size, utilisation and 30-day uptime against its SLA target. Click a row to open the ${V.service.toLowerCase()}.`}>
        <DataTable rows={shown} cols={cols} onRow={s => nav(`/services/${s.id}`)} defaultSort={{ key: 'util', dir: 'desc' }}
          toolbar={
            <ListToolbar shown={shown.length} total={services.length} onRefresh={reload}
              search={{ value: cq, onChange: setCq, placeholder: `${V.service} ID, type, device` }}
              filters={[
                { id: 'st', label: 'Status', quick: true, value: cst, anyLabel: 'Any status', onChange: setCst, options: [...new Set(services.map(s => s.status))].map(x => ({ id: x, label: x, count: services.filter(s => s.status === x).length })) },
                { id: 'dc', label: 'Datacenter', quick: true, value: cdc, anyLabel: 'Any datacenter', onChange: setCdc, options: dcs.map(x => ({ id: x, label: x, count: services.filter(s => s.dcId === x).length })) }
              ]} />
          } />
      </Panel>
    </div>
  );
}
