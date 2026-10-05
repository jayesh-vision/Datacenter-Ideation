import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getRevenue, useQuery, usePersona } from '../api';
import type { RevCustomer, RevDc, RevExposure, RevIssue, RevenueView } from '../api/types';
import { usePage, PageHead, Loading, useSentinel } from '../shell/page';
import { Btn, Panel, Tabs } from '../ui/kit';
import { DataTable, type Col } from '../ui/DataTable';
import { ListToolbar, useParamPatch } from '../ui/ListToolbar';
import { DcLink, Fresh } from '../ui/status';
import { Facts, SoftMeter, Split, StatGrid, StatTile, type Tone } from '../ui/Analytics';
import { TimeChart } from '../charts/TimeChart';
import { BarList } from '../charts/BarList';
import { fmtAgo, fmtDur, fmtShortDate } from '../lib/format';
import { OpstralBtn } from '../ui/OpstralMark';
import { CostCurve, CREDIT, DOMAIN, DomainTag, IssueDrawer, IssueTable, MethodDrawer, impactOf, inr, lc, perHr, perMo, stateText } from './revenue/parts';
import { downloadCsv } from './ops/shared';

type TabId = 'issues' | 'customers' | 'datacenters' | 'trends' | 'exposure';
const TAB_KEYS = ['rview', 'dom', 'rdc', 'q', 'cview', 'kind'];

/* Revenue impact: what every open datacenter issue is costing, which one costs the most,
   who it hits, and where the next failure would cost the most. */
export function Revenue() {
  const [sp, setSp] = useSearchParams();
  const ask = useSentinel();
  const { vocab: V } = usePersona();
  const W = V.money;
  const tab = (['issues', 'customers', 'datacenters', 'trends', 'exposure'].includes(sp.get('tab') ?? '') ? sp.get('tab') : 'issues') as TabId;
  usePage([{ label: W.impact }], {});
  const { data: v, reload } = useQuery(() => getRevenue({}), []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [method, setMethod] = useState(false);
  if (!v) return <Loading />;

  const go = (t: TabId, patch: Record<string, string> = {}) => { const n = new URLSearchParams(sp); TAB_KEYS.forEach(k => n.delete(k)); t === 'issues' ? n.delete('tab') : n.set('tab', t); Object.entries(patch).forEach(([k, val]) => n.set(k, val)); setSp(n, { replace: true }); };
  const rview = sp.get('rview') ?? 'all';
  const t = v.total;
  const losing = v.issues.filter(i => i.rate + i.lost + i.credits > 0);
  const stake = [...v.issues].filter(i => i.mrrExposed > 0).sort((a, b) => b.mrrExposed - a.mrrExposed);
  const downRate = Math.round(t.mrrDown / 730), degRate = Math.max(0, t.rate - downRate);
  const impact = t.lost + t.credits;
  const hist = [...v.byDomain].sort((a, b) => b.hist30 - a.hist30);
  const topDom = hist[0];
  const custHit = v.customers.filter(c => c.down + c.degraded + c.exposed > 0).length;
  const open = openId ? v.issues.find(i => i.id === openId) ?? null : null;

  return (
    <div className="page rev">
      <PageHead title={W.impact} sub="What every open datacenter issue is costing, which one costs the most, and what is still at stake."
        actions={<>
          <Fresh>Live</Fresh>
          <Btn icon={I.Calculator} onClick={() => setMethod(true)}>How it is calculated</Btn>
          <OpstralBtn onClick={() => ask('Which issue is costing the most revenue?')} />
        </>} />

      <StatGrid>
        <StatTile label="Losing now" value={inr(t.rate)} sub="per hour" subTone={t.rate ? 'bad' : undefined} onClick={() => go('issues', { rview: 'losing' })} active={tab === 'issues' && rview === 'losing'}>
          <Split parts={[{ key: 'down', label: 'Down', n: downRate, tone: 'error', display: perHr(downRate) }, { key: 'deg', label: 'Degraded', n: degRate, tone: 'orange', display: perHr(degRate) }]} />
          <Facts items={[{ n: t.down + t.degraded, label: `${V.services.toLowerCase()} · ${losing.length} issue${losing.length === 1 ? '' : 's'}` }]} />
        </StatTile>
        <StatTile label="Impact so far" value={inr(impact)} onClick={() => go('issues', { rview: 'losing' })}>
          <Split parts={[{ key: 'lost', label: W.lost, n: t.lost, tone: 'error', display: inr(t.lost) }, { key: 'cr', label: W.credits, n: t.credits, tone: 'orange', display: inr(t.credits) }]} />
          <Facts items={[{ n: inr(t.forecast24), label: 'by +24 h', tone: t.forecast24 > impact ? 'warn' : undefined }]} />
        </StatTile>
        <StatTile label="At stake" value={inr(t.mrrExposed)} sub="a month" subTone={t.mrrExposed ? 'warn' : undefined} onClick={() => go('issues', { rview: 'stake' })} active={tab === 'issues' && rview === 'stake'}>
          <Split other={inr} parts={v.byDomain.filter(d => d.mrrExposed > 0).sort((a, b) => b.mrrExposed - a.mrrExposed).map(d => ({ key: d.domain, label: d.domain, n: d.mrrExposed, tone: 'info' as Tone, display: inr(d.mrrExposed) }))} />
          <Facts items={[{ n: perHr(t.potentialRate), label: 'if they fail' }]} />
        </StatTile>
        <StatTile label={`${W.credits} owed`} value={inr(t.credits + v.sla.creditsLocked)} onClick={() => go('customers', { cview: 'owed' })} active={tab === 'customers'}>
          <Split parts={[{ key: 'open', label: 'Open issues', n: t.credits, tone: 'orange', display: inr(t.credits) }, { key: 'locked', label: 'Locked in · 30 d', n: v.sla.creditsLocked, tone: 'info', display: inr(v.sla.creditsLocked) }]} />
          <Facts items={[v.sla.nextCliff ? { n: inr(v.sla.nextCliff.amount), label: `more in ${fmtDur(v.sla.nextCliff.inMin)}`, tone: v.sla.nextCliff.inMin <= 60 ? 'bad' : 'warn' } : { n: 'None', label: 'pending' }]} />
        </StatTile>
        <StatTile label="Costliest cause · 30 d" value={topDom && topDom.hist30 ? topDom.domain : '—'} sub={topDom && v.trend.total ? `${Math.round((topDom.hist30 / v.trend.total) * 100)}%` : 'no impact'} onClick={() => go('trends')} active={tab === 'trends'}>
          <Split other={inr} parts={hist.filter(d => d.hist30 > 0).map(d => ({ key: d.domain, label: d.domain, n: d.hist30, tone: 'info' as Tone, display: inr(d.hist30) }))} />
        </StatTile>
        <StatTile label="Within SLA · 30 d" value={`${v.sla.withinPct}%`} sub={`of ${inr(v.base.mrr)}`} subTone={v.sla.withinPct < 90 ? 'warn' : undefined} onClick={() => go('customers', { cview: 'owed' })}>
          <SoftMeter pct={v.sla.withinPct} tone={v.sla.withinPct >= 95 ? 'info' : v.sla.withinPct >= 85 ? 'warning' : 'error'} />
          <Facts items={[{ n: v.sla.below, label: `${V.services.toLowerCase()} below SLA`, tone: v.sla.below ? 'warn' : undefined }, { n: custHit, label: `${V.customers.toLowerCase()} hit now` }]} />
        </StatTile>
      </StatGrid>

      <div className="rev-heroes">
        <IssueHero kind="cost" issue={losing[0]} view={v} onOpen={setOpenId} />
        <IssueHero kind="stake" issue={stake[0]} view={v} onOpen={setOpenId} />
      </div>

      <Tabs value={tab} onChange={id => go(id)} tabs={[
        { id: 'issues', label: 'Issues', icon: I.Siren, count: v.issues.length || undefined },
        { id: 'customers', label: V.customers, icon: I.Users, count: custHit || undefined },
        { id: 'datacenters', label: 'Datacenters', icon: I.Building2, count: v.byDc.filter(d => impactOf(d) + d.mrrExposed > 0).length || undefined },
        { id: 'trends', label: 'Causes & trend', icon: I.ChartColumn },
        { id: 'exposure', label: 'One failure away', icon: I.ShieldAlert, count: v.exposures.length || undefined }
      ]} />

      {tab === 'issues' && <IssueTable view={v} onOpen={i => setOpenId(i.id)} />}
      {tab === 'customers' && <CustomerTable v={v} onRefresh={reload} />}
      {tab === 'datacenters' && <DcTable v={v} onRefresh={reload} />}
      {tab === 'trends' && <Trends v={v} />}
      {tab === 'exposure' && <ExposureTable v={v} onRefresh={reload} />}

      <IssueDrawer issue={open} view={v} onClose={() => setOpenId(null)} />
      <MethodDrawer open={method} onClose={() => setMethod(false)} view={v} />
    </div>
  );
}

/* ---------------------------------------------------- the two answers up top */

/* "Which issue costs the most?" has two answers: the one losing the most now, and the one with
   the most riding on it. Same slots in both cards so they line up. */
function IssueHero({ kind, issue: i, view: v, onOpen }: { kind: 'cost' | 'stake'; issue?: RevIssue; view: RevenueView; onOpen: (id: string) => void }) {
  const { vocab: V } = usePersona();
  const W = V.money;
  const head = kind === 'cost' ? 'Costing the most right now' : 'Most at stake';
  if (!i) return (
    <section className="vw-card-section rev-hero is-quiet">
      <div className="rev-hero-h"><span className="vw-card-metric-label">{head}</span></div>
      <div className="rev-hero-quiet"><I.CircleCheck size={20} /><div><b>{kind === 'cost' ? `No open issue is losing ${lc(W.noun)}` : `No ${lc(W.noun)} is riding on a critical fault`}</b><span className="vw-label">{kind === 'cost' ? `Every ${V.service.toLowerCase()} on a faulted path is still running.` : 'Power, cooling and edge paths are carrying their load with redundancy.'}</span></div></div>
    </section>
  );
  const cost = kind === 'cost';
  const figs = cost
    ? [{ l: 'Losing now', v: perHr(i.rate), bad: true }, { l: 'Impact so far', v: inr(impactOf(i)) }, { l: 'If it runs 24 h more', v: inr(i.forecast24) }]
    : [{ l: 'Riding on it', v: perMo(i.mrrExposed), bad: false }, { l: 'If it fails', v: perHr(i.potentialRate) }, { l: `Credits after ${v.method.outageHours} h`, v: inr(i.potentialCredits) }];
  const note = cost
    ? (i.nextCliff ? <><b className={i.nextCliff.inMin <= 60 ? 'rev-bad' : ''}>{inr(i.nextCliff.amount)}</b> more {lc(W.credits)} in {fmtDur(i.nextCliff.inMin)}</> : <>Restoring now avoids <b>{inr(Math.max(0, i.forecast24 - impactOf(i)))}</b></>)
    : <>{i.exposed} {V.services.toLowerCase()} still running · nothing lost yet</>;
  return (
    <section className={`vw-card-section vw-card--accent rev-hero is-${kind}`}>
      <div className="vw-card-accent" style={{ background: cost ? 'var(--vw-color-red-500)' : 'var(--vw-color-amber-500)' }} />
      <div className="rev-hero-h">
        <span className="vw-card-metric-label">{head}</span>
        <span className="rev-hero-meta"><DomainTag d={i.domain} />{i.incident && <span className={`vw-chip ${i.incident.sev === 1 ? 'vw-chip--error' : i.incident.sev === 2 ? 'vw-chip--warning' : 'vw-chip--neutral'} is-strong cmd-chip`}>SEV{i.incident.sev}</span>}</span>
      </div>
      <button type="button" className="rev-hero-title" onClick={() => onOpen(i.id)} title="Open the cost breakdown">{i.title}</button>
      <span className="vw-label rev-hero-sub">{i.incident ? `${i.id} · ` : ''}{i.dcId}{i.where !== i.dcId ? ` · ${i.where}` : ''} · began {fmtAgo(i.since, v.now)}{i.changeId ? ` · after ${i.changeId}` : ''}</span>
      <div className="rev-hero-body">
        <div className="rev-hero-figs">{figs.map(f => <div key={f.l}><span className="vw-label">{f.l}</span><b className={`num${f.bad ? ' rev-bad' : ''}`}>{f.v}</b></div>)}</div>
        <div className="rev-hero-chart"><CostCurve curve={i.curve} now={v.now} height={96} compact /></div>
      </div>
      <div className="rev-hero-foot">
        <span className="vw-label rev-hero-note">{note}</span>
        <button type="button" className="nst-btn nst-btn--sm nst-btn--ghost" onClick={() => onOpen(i.id)}>Cost breakdown<I.ArrowRight size={14} /></button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- customers */

type CView = 'impacted' | 'owed' | 'premium' | 'all';
function CustomerTable({ v, onRefresh }: { v: RevenueView; onRefresh: () => void }) {
  const nav = useNavigate();
  const { vocab: V } = usePersona();
  const W = V.money;
  const [sp, setSp] = useSearchParams();
  const applyParams = useParamPatch();
  const hit = (c: RevCustomer) => c.down + c.degraded + c.exposed > 0, owed = (c: RevCustomer) => c.credits + c.creditsLocked > 0;
  const def: CView = v.customers.some(hit) ? 'impacted' : 'all';
  const view = (sp.get('cview') ?? def) as CView, seg = sp.get('seg') ?? '', q = sp.get('q') ?? '';
  const set = (k: string, val: string) => { const n = new URLSearchParams(sp); val ? n.set(k, val) : n.delete(k); setSp(n, { replace: true }); };
  const rows = useMemo(() => v.customers.filter(c => (view === 'all' || (view === 'impacted' ? hit(c) : view === 'owed' ? owed(c) : c.premium)) && (!seg || c.segment === seg) && (!q || `${c.name} ${c.id} ${c.segment} ${c.accountManager}`.toLowerCase().includes(q.toLowerCase()))), [v.customers, view, seg, q]);
  const segs = [...new Set(v.customers.map(c => c.segment))].sort();
  const cols: Col<RevCustomer>[] = [
    { key: 'name', header: V.customer, wrap: true, sort: c => c.name, render: c => <span className="cell-2"><span className="strong" style={{ fontWeight: 500 }}>{c.name}{c.premium && <span className="vw-chip vw-chip--info cmd-chip cust-tier">{V.premium}</span>}</span><small>{c.id} · {c.segment}</small></span> },
    { key: 'mrr', header: 'Monthly', hideBelow: 1360, sort: c => c.mrr, render: c => <span className="cell-2"><span className="num nowrap">{inr(c.mrr)}</span><small className="nowrap">{c.services} {V.services.toLowerCase()}</small></span> },
    { key: 'hit', header: 'Impacted now', wrap: true, sort: c => c.down * 1e6 + c.degraded * 1e3 + c.exposed, render: c => (hit(c) ? <span className="cell-2 rev-why"><span className="nowrap">{stateText(c)}</span><small title={c.cause}>{c.cause}</small></span> : <span className="faint">—</span>) },
    { key: 'rate', header: 'Losing now', sort: c => c.rate, render: c => (c.rate ? <span className="num rev-amt nowrap rev-bad">{perHr(c.rate)}</span> : <span className="faint">—</span>) },
    { key: 'impact', header: 'Impact so far', sort: c => impactOf(c), render: c => (impactOf(c) ? <span className="cell-2"><span className="num rev-amt nowrap">{inr(impactOf(c))}</span><small className={`nowrap${c.nextCliffMin !== null && c.nextCliffMin <= 60 ? ' rev-bad' : ''}`}>{c.nextCliffMin !== null ? `next step in ${fmtDur(c.nextCliffMin)}` : `${inr(c.credits)} credits`}</small></span> : <span className="faint">—</span>) },
    { key: 'sla', header: 'SLA · 30 d', sort: c => c.uptime - c.slaTarget, render: c => <span className="cell-2"><span className="nowrap"><span className={`num${c.uptime < c.slaTarget ? ' rev-bad' : ''}`}>{c.uptime}%</span><span className="faint"> of {c.slaTarget}%</span></span><small className="nowrap">{c.creditsLocked ? `${inr(c.creditsLocked)} locked in` : 'no credits owed'}</small></span> }
  ];
  return (
    <section className="card">
      <DataTable rows={rows} cols={cols} pageSize={15} onRow={c => nav(`/customers/${c.id}`)} defaultSort={{ key: 'impact', dir: 'desc' }}
        toolbar={
          <ListToolbar onApply={applyParams} shown={rows.length} total={v.customers.length} onRefresh={onRefresh}
            search={{ value: q, onChange: val => set('q', val), placeholder: V.searchHint }}
            actions={[{ label: 'Export CSV', icon: I.Download, onClick: () => downloadCsv('revenue-impact-customers.csv', [[V.customer, 'Segment', 'Monthly', 'Down', 'Degraded', 'Exposed', 'Losing per hour', W.lost, W.credits, 'Locked in 30 d', 'Account manager'], ...rows.map(c => [c.name, c.segment, c.mrr, c.down, c.degraded, c.exposed, c.rate, c.lost, c.credits, c.creditsLocked, c.accountManager])]) }]}
            filters={[
              { id: 'cview', label: 'View', quick: true, value: view, defaultValue: def, onChange: val => set('cview', val), options: [
                { id: 'impacted', label: 'Impacted now', count: v.customers.filter(hit).length }, { id: 'owed', label: `Owed ${lc(W.credits)}`, count: v.customers.filter(owed).length },
                { id: 'premium', label: V.premium, count: v.customers.filter(c => c.premium).length }, { id: 'all', label: `All ${V.customers.toLowerCase()}`, count: v.customers.length }] },
              { id: 'seg', label: 'Segment', quick: true, value: seg, anyLabel: 'Any segment', onChange: val => set('seg', val), options: segs.map(s => ({ id: s, label: s, count: v.customers.filter(c => c.segment === s).length })) }
            ]} />
        } />
    </section>
  );
}

/* ----------------------------------------------------------- datacenters */

function DcTable({ v, onRefresh }: { v: RevenueView; onRefresh: () => void }) {
  const nav = useNavigate();
  const { vocab: V } = usePersona();
  const [q, setQ] = useState('');
  const [view, setView] = useState('all');
  const hot = (d: RevDc) => impactOf(d) + d.rate + d.mrrExposed > 0;
  const rows = v.byDc.filter(d => (view === 'all' || hot(d)) && (!q || `${d.id} ${d.city} ${d.state}`.toLowerCase().includes(q.toLowerCase())));
  const maxMrr = Math.max(1, ...v.byDc.map(d => d.mrr)), maxHist = Math.max(1, ...v.byDc.map(d => d.hist30));
  const cols: Col<RevDc>[] = [
    { key: 'dc', header: 'Datacenter', sort: d => d.id, render: d => <span className="cell-2"><DcLink id={d.id} tab="revenue" /><small className="nowrap">{d.city} · {d.tier}</small></span> },
    { key: 'mrr', header: 'Monthly hosted', sort: d => d.mrr, render: d => <span className="cell-2 rev-impact"><span className="num nowrap">{inr(d.mrr)}</span><span className="rev-bar"><i style={{ width: `${(d.mrr / maxMrr) * 100}%`, background: 'var(--vw-color-slate-400)' }} /></span><small className="nowrap">{d.services} {V.services.toLowerCase()}</small></span> },
    { key: 'risk', header: 'Down or degraded', sort: d => d.mrrDown + d.mrrDegraded, render: d => (d.mrrDown + d.mrrDegraded ? <span className="num nowrap">{perMo(d.mrrDown + d.mrrDegraded)}</span> : <span className="faint">—</span>) },
    { key: 'rate', header: 'Losing now', sort: d => d.rate, render: d => (d.rate ? <span className="num rev-amt nowrap rev-bad">{perHr(d.rate)}</span> : <span className="faint">—</span>) },
    { key: 'impact', header: 'Impact so far', sort: d => impactOf(d), render: d => (impactOf(d) ? <span className="num rev-amt nowrap">{inr(impactOf(d))}</span> : <span className="faint">—</span>) },
    { key: 'stake', header: 'At stake', sort: d => d.mrrExposed, render: d => (d.mrrExposed ? <span className="cell-2"><span className="num nowrap">{perMo(d.mrrExposed)}</span><small className="nowrap">{Math.round((d.mrrExposed / Math.max(1, d.mrr)) * 100)}% of the site</small></span> : <span className="faint">—</span>) },
    { key: 'hist', header: 'Impact · 30 d', sort: d => d.hist30, render: d => <span className="cell-2 rev-impact"><span className="num nowrap">{inr(d.hist30)}</span><span className="rev-bar"><i style={{ width: `${(d.hist30 / maxHist) * 100}%`, background: 'var(--primaryColor500)' }} /></span></span> },
    { key: 'top', header: 'Costliest issue', wrap: true, sort: d => d.issues, render: d => (d.issues ? <span className="cell-2 rev-why"><span>{d.topIssue}</span><small>{d.issues} open issue{d.issues === 1 ? '' : 's'}</small></span> : <span className="faint">none open</span>) }
  ];
  return (
    <section className="card">
      <DataTable rows={rows} cols={cols} pageSize={25} onRow={d => nav(`/datacenters/${d.id}?tab=revenue`)} defaultSort={{ key: 'impact', dir: 'desc' }}
        toolbar={
          <ListToolbar shown={rows.length} total={v.byDc.length} onRefresh={onRefresh} search={{ value: q, onChange: setQ, placeholder: 'Datacenter, city' }}
            filters={[{ id: 'view', label: 'View', quick: true, value: view, defaultValue: 'all', onChange: setView, options: [{ id: 'all', label: 'All datacenters', count: v.byDc.length }, { id: 'hot', label: 'Impacted or at stake', count: v.byDc.filter(hot).length }] }]} />
        } />
    </section>
  );
}

/* ---------------------------------------------------------- causes & trend */

function Trends({ v }: { v: RevenueView }) {
  const { vocab: V } = usePersona();
  const W = V.money;
  const doms = [...v.byDomain].sort((a, b) => b.hist30 - a.hist30);
  const labels = v.trend.days.map(d => fmtShortDate(d));
  const share = (n: number) => (v.trend.total ? `${Math.round((n / v.trend.total) * 100)}%` : '0%');
  return (
    <div className="grid rev-trends">
      <Panel title={`Daily ${lc(W.impact)} · 30 days`} icon={I.ChartColumn} sub="Resolved incidents, credits locked in and what is open today, by kind of issue">
        <TimeChart labels={labels.map((l, k) => (k % 3 === 2 || k === 29 ? l.slice(0, 6) : ''))} fullLabels={labels} height={250} format={n => inr(n)}
          series={doms.map(d => ({ key: d.domain, label: d.domain, color: DOMAIN[d.domain].color, kind: 'bar' as const, stack: 'impact', values: v.trend.series[d.domain] }))} />
        <div className="rev-kv">
          <div><span className="vw-label">30-day impact</span><b className="num">{inr(v.trend.total)}</b></div>
          <div><span className="vw-label">{W.lost}</span><b className="num">{inr(v.trend.lost)}</b></div>
          <div><span className="vw-label">{W.credits}</span><b className="num">{inr(v.trend.credits)}</b></div>
          <div><span className="vw-label">Per incident</span><b className="num">{inr(v.trend.avgPerIncident)}</b></div>
          <div><span className="vw-label">{v.trend.worstDay ? `Worst · ${fmtShortDate(v.trend.worstDay.at)}` : 'Worst day'}</span><b className="num">{v.trend.worstDay ? inr(v.trend.worstDay.amount) : '—'}</b></div>
        </div>
      </Panel>
      <div className="col" style={{ gap: 16 }}>
        <Panel title="Which kind of issue costs the most" icon={I.Scale} sub="Share of the 30-day impact">
          <BarList items={doms.map(d => ({ key: d.domain, label: d.domain, sublabel: d.issues ? `${d.issues} open` : undefined, value: d.hist30, display: inr(d.hist30), secondary: share(d.hist30), color: DOMAIN[d.domain].color }))} />
        </Panel>
        <Panel title="What moves the number" icon={I.Lightbulb}>
          <ul className="rev-levers">
            <li><span className="rev-lever-ic"><I.Timer size={15} /></span><span><b>{perHr(v.total.rate)}</b> stops the moment the open issues are restored. Every hour off the recovery time is worth that.</span></li>
            <li><span className="rev-lever-ic"><I.AlarmClock size={15} /></span><span>{v.sla.cliff60.services ? <><b>{inr(v.sla.cliff60.amount)}</b> of {lc(W.credits)} triggers within the next hour across {v.sla.cliff60.services} {V.services.toLowerCase()}.</> : <>No {lc(W.credits).replace(/s$/, '')} step is due in the next hour.</>}</span></li>
            <li><span className="rev-lever-ic"><I.ArrowLeftRight size={15} /></span><span>{v.changeInduced.issues ? <><b>{v.changeInduced.issues}</b> open issue{v.changeInduced.issues === 1 ? '' : 's'} began shortly after a change at the same site{v.changeInduced.impact ? <>, <b>{v.changeInduced.share}%</b> of today's impact</> : null}.</> : <>No open issue follows a recent change.</>}</span></li>
            <li><span className="rev-lever-ic"><I.ShieldAlert size={15} /></span><span><b>{perMo(v.total.mrrExposed)}</b> is running on a critical fault. Nothing is lost yet. A failure costs <b>{perHr(v.total.potentialRate)}</b>.</span></li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- one failure away */

const EXP: Record<RevExposure['kind'], { icon: I.LucideIcon; label: string }> = {
  power: { icon: I.Zap, label: 'Power' }, cooling: { icon: I.Snowflake, label: 'Cooling' }, edge: { icon: I.Cable, label: 'Edge links' }, device: { icon: I.Server, label: 'Device' }, rack: { icon: I.Rows3, label: 'Rack' }
};
export function ExposureTable({ v, onRefresh, hideDc }: { v: RevenueView; onRefresh?: () => void; hideDc?: boolean }) {
  const nav = useNavigate();
  const { vocab: V } = usePersona();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const rows = v.exposures.filter(e => (!kind || e.kind === kind) && (!q || `${e.dcId} ${e.what} ${e.why}`.toLowerCase().includes(q.toLowerCase())));
  const max = Math.max(1, ...v.exposures.map(e => e.mrr));
  const cols: Col<RevExposure>[] = [
    { key: 'what', header: 'What is one failure away', wrap: true, sort: e => e.what, render: e => { const Ic = EXP[e.kind].icon; return <span className="rev-exp"><span className="rev-exp-ic"><Ic size={15} /></span><span className="cell-2"><span className="strong" style={{ fontWeight: 500 }}>{e.what}</span><small>{e.why}</small></span></span>; } },
    ...(hideDc ? [] : [{ key: 'dc', header: 'Datacenter', sort: (e: RevExposure) => e.dcId, render: (e: RevExposure) => <DcLink id={e.dcId} tab="revenue" /> }]),
    { key: 'kind', header: 'Kind', sort: e => e.kind, render: e => <span className="nowrap">{EXP[e.kind].label}</span> },
    { key: 'mrr', header: 'Riding on it', sort: e => e.mrr, render: e => <span className="cell-2 rev-impact"><span className="num nowrap">{perMo(e.mrr)}</span><span className="rev-bar"><i style={{ width: `${(e.mrr / max) * 100}%`, background: CREDIT }} /></span><small className="nowrap">{e.share}% of the site</small></span> },
    { key: 'rate', header: 'If it fails', sort: e => e.rate, render: e => <span className="num rev-amt nowrap">{perHr(e.rate)}</span> },
    { key: 'who', header: 'Who it would hit', sort: e => e.services, render: e => <span className="cell-2"><span className="num nowrap">{e.services} {V.services.toLowerCase()}</span><small className="nowrap">{e.customers} {V.customers.toLowerCase()}{e.premium ? ` · ${e.premium} ${V.premium.toLowerCase()}` : ''}</small></span> }
  ];
  return (
    <section className="card">
      <DataTable rows={rows} cols={cols} pageSize={15} onRow={e => nav(e.to)} defaultSort={{ key: 'rate', dir: 'desc' }}
        empty={<div className="rev-empty"><I.ShieldCheck size={18} />Nothing here is one failure away. Redundancy is intact.</div>}
        toolbar={
          <ListToolbar shown={rows.length} total={v.exposures.length} noun="exposures" onRefresh={onRefresh} search={{ value: q, onChange: setQ, placeholder: 'Datacenter, element' }}
            filters={[{ id: 'kind', label: 'Kind', quick: true, value: kind, anyLabel: 'Any kind', onChange: setKind, options: (Object.keys(EXP) as RevExposure['kind'][]).map(k => ({ id: k, label: EXP[k].label, count: v.exposures.filter(e => e.kind === k).length })).filter(o => o.count) }]} />
        } />
    </section>
  );
}
