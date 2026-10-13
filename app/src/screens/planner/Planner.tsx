/* Planner hub (Plan & Build, 13-Oct-2026: P2B merge phase 4). Every design plan with its verdict against the estate, the scope
   templates and the reference values the engine uses. Tabs `?tab=plans|templates|benchmarks`. */
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getPlanner, useQuery } from '../../api';
import type { PlanEval, PlannerPlan, PlanScope, PlanStatus } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Panel, Tabs } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { Facts, SoftMeter, Split, StatGrid, StatTile } from '../../ui/Analytics';
import { fmtDate, fmtKw, fmtMoney, fmtNum } from '../../lib/format';
import '../../styles/dcim.css';
import '../../styles/planner.css';
import '../../styles/ipam.css';

export type Row = PlannerPlan & { eval: PlanEval };
export const SCOPE_LABEL: Record<PlanScope, string> = { 'rack-expansion': 'Rack expansion', 'ai-pod': 'AI / GPU pod', 'new-hall': 'New hall', 'new-site': 'New datacenter', 'plant-upgrade': 'Plant upgrade', refresh: 'Equipment refresh' };
export const SCOPE_ICON: Record<PlanScope, I.LucideIcon> = { 'rack-expansion': I.Server, 'ai-pod': I.Cpu, 'new-hall': I.LayoutGrid, 'new-site': I.Building2, 'plant-upgrade': I.Zap, refresh: I.RefreshCcw };
export const STATUS_TONE: Record<PlanStatus, 'neutral' | 'info' | 'success' | 'warning' | 'purple' | 'error'> = { Draft: 'neutral', 'In review': 'info', Approved: 'success', Executing: 'warning', Delivered: 'purple', Rejected: 'error' };
export const VERDICT: Record<PlanEval['verdict']['state'], { tone: 'success' | 'warning' | 'error'; label: string }> = { ready: { tone: 'success', label: 'Fits' }, warn: { tone: 'warning', label: 'To resolve' }, blocked: { tone: 'error', label: 'Blocked' } };
const ORDER: PlanStatus[] = ['Draft', 'In review', 'Approved', 'Executing', 'Delivered', 'Rejected'];

export function Planner() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const apply = useParamPatch();
  const tab = (sp.get('tab') as 'plans' | 'templates' | 'benchmarks') || 'plans';
  const q = sp.get('q') ?? '', st = sp.get('st') ?? '', scope = sp.get('scope') ?? '', vd = sp.get('vd') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  usePage([{ label: 'Plan & Build' }, { label: 'Planner', to: '/planner' }]);
  const { data, reload } = useQuery(getPlanner, []);
  const rows = useMemo(() => (data?.plans ?? []).filter(p => (!st || p.status === st) && (!scope || p.scope === scope) && (!vd || p.eval.verdict.state === vd) && (!q || `${p.id} ${p.name} ${p.dcId} ${p.city ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [data, q, st, scope, vd]);
  if (!data) return <Loading />;
  const ps = data.plans;
  const active = ps.filter(p => p.status !== 'Delivered' && p.status !== 'Rejected');
  const addKw = active.reduce((a, p) => a + p.eval.itKw, 0);
  const capex = active.reduce((a, p) => a + p.eval.capexTotal, 0);
  const waiting = ps.filter(p => p.status === 'In review');
  const blocked = active.filter(p => p.eval.verdict.state === 'blocked');
  const next = [...ps.filter(p => p.status === 'Executing' || p.status === 'Approved')].sort((a, b) => a.eval.finish - b.eval.finish)[0];
  const cols: Col<Row>[] = [
    { key: 'n', header: 'Plan', sort: p => p.id, wrap: true, render: p => <span className="cell-2"><span className="vw-card-activity-label">{p.name}</span><small><span className="mono">{p.id}</span> · {p.source}</small></span> },
    { key: 's', header: 'Scope', sort: p => p.scope, render: p => { const Ic = SCOPE_ICON[p.scope]; return <span className="row nowrap" style={{ gap: 6 }}><Ic size={14} className="muted" />{SCOPE_LABEL[p.scope]}</span>; } },
    { key: 'w', header: 'Where', sort: p => p.dcId, render: p => <span className="cell-2"><span className="mono">{p.dcId}</span><small>{p.city ?? ''}</small></span> },
    { key: 'it', header: 'Adds', sort: p => p.eval.itKw, render: p => <span className="cell-2"><span className="nowrap">{p.scope === 'plant-upgrade' ? `+${fmtKw(p.plantKw ?? 0)} ${p.plant}` : fmtKw(p.eval.itKw)}</span><small className="nowrap">{p.racks ? `${p.racks} racks × ${p.kwPerRack} kW` : p.scope === 'refresh' ? 'device swap' : 'plant'}</small></span> },
    { key: 'c', header: 'CapEx', sort: p => p.eval.capexTotal, render: p => <span className="cell-2"><span className="rev-amt">{fmtMoney(p.eval.capexTotal)}</span><small className="nowrap">{p.eval.irr !== null ? `IRR ${p.eval.irr}%` : 'cost only'}</small></span> },
    { key: 'f', header: 'Finish', sort: p => p.eval.finish, render: p => <span className="cell-2"><span className="nowrap">{fmtDate(p.eval.finish)}</span><small className="nowrap" style={{ color: p.eval.lateDays ? 'var(--vw-color-red-600)' : undefined }}>{p.eval.lateDays ? `${Math.ceil(p.eval.lateDays / 7)} w late` : `target ${fmtDate(p.target)}`}</small></span> },
    { key: 'v', header: 'Check', sort: p => ['blocked', 'warn', 'ready'].indexOf(p.eval.verdict.state), render: p => <Chip tone={VERDICT[p.eval.verdict.state].tone} dot>{VERDICT[p.eval.verdict.state].label}</Chip> },
    { key: 'st', header: 'Status', sort: p => ORDER.indexOf(p.status), render: p => <Chip tone={STATUS_TONE[p.status]} dot>{p.status}</Chip> }
  ];

  return (
    <div className="page dcim planner">
      <PageHead title="Planner" sub="Design plans sized at their redundancy, checked against what each site really has, costed and scheduled — from a rack expansion to a new datacenter"
        actions={<Btn variant="filled" icon={I.Plus} onClick={() => nav('/planner/new')}>New plan</Btn>} />
      <StatGrid>
        <StatTile label="Plans" value={ps.length} sub={`${active.length} open`} onClick={() => set('tab', '')}
          info="Every design plan by status: Draft → In review → Approved → Executing → Delivered. Rejected plans return to draft.">
          <Split parts={[{ key: 'Draft', label: 'Draft', n: ps.filter(p => p.status === 'Draft').length, tone: 'neutral' as const }, { key: 'In review', label: 'In review', n: waiting.length, tone: 'info' as const }, { key: 'Approved', label: 'Approved & executing', n: ps.filter(p => p.status === 'Approved' || p.status === 'Executing').length, tone: 'neutral' as const }].filter(x => x.n)} onPick={k => set('st', k === 'Approved' ? '' : k)} />
        </StatTile>
        <StatTile label="IT capacity planned" value={fmtKw(Math.round(addKw))} sub="in open plans" info="IT load the open plans add (design load: racks × kW per rack, or the extra draw of a refresh). Plant upgrades raise the ceiling instead.">
          <Split parts={[{ key: 'g', label: 'Grow in place', n: active.filter(p => p.scope === 'rack-expansion' || p.scope === 'ai-pod').reduce((a, p) => a + p.eval.itKw, 0), tone: 'info' as const }, { key: 'b', label: 'Build new', n: active.filter(p => p.scope === 'new-hall' || p.scope === 'new-site').reduce((a, p) => a + p.eval.itKw, 0), tone: 'neutral' as const }, { key: 'r', label: 'Refresh', n: active.filter(p => p.scope === 'refresh').reduce((a, p) => a + p.eval.itKw, 0), tone: 'neutral' as const }].filter(x => x.n).map(x => ({ ...x, display: fmtKw(Math.round(x.n)) }))} />
          <Facts items={[{ n: fmtNum(active.reduce((a, p) => a + p.racks, 0)), label: 'racks' }, { n: active.filter(p => p.scope === 'plant-upgrade').length, label: 'plant upgrades' }]} />
        </StatTile>
        <StatTile label="CapEx in open plans" value={fmtMoney(capex)} sub={`${fmtMoney(waiting.reduce((a, p) => a + p.eval.capexTotal, 0))} awaiting approval`} info="Total CapEx of open plans (incl. contingency and, where the business model sells compute, the compute itself).">
          <Split parts={[{ key: 'r', label: 'In review', n: waiting.reduce((a, p) => a + p.eval.capexTotal, 0), tone: 'info' as const, display: fmtMoney(waiting.reduce((a, p) => a + p.eval.capexTotal, 0)) }, { key: 'a', label: 'Approved & executing', n: active.filter(p => p.status === 'Approved' || p.status === 'Executing').reduce((a, p) => a + p.eval.capexTotal, 0), tone: 'neutral' as const, display: fmtMoney(active.filter(p => p.status === 'Approved' || p.status === 'Executing').reduce((a, p) => a + p.eval.capexTotal, 0)) }, { key: 'd', label: 'Draft', n: active.filter(p => p.status === 'Draft').reduce((a, p) => a + p.eval.capexTotal, 0), tone: 'neutral' as const, display: fmtMoney(active.filter(p => p.status === 'Draft').reduce((a, p) => a + p.eval.capexTotal, 0)) }].filter(x => x.n)} legend />
        </StatTile>
        <StatTile label="Blocked" value={blocked.length} sub={`of ${active.length} open plans`} subTone={blocked.length ? 'bad' : undefined} onClick={() => set('vd', vd === 'blocked' ? '' : 'blocked')} active={vd === 'blocked'}
          info="Open plans with a check that fails against the site (floor positions, utility intake, density) — they cannot be submitted until the plan or a scenario fixes it.">
          <SoftMeter pct={active.length ? (blocked.length / active.length) * 100 : 0} tone={blocked.length ? 'error' : 'success'} />
          <Facts items={[{ n: active.filter(p => p.eval.verdict.state === 'warn').length, label: 'to resolve', tone: 'warn', onClick: () => set('vd', 'warn') }]} />
        </StatTile>
        <StatTile label="Waiting for approval" value={waiting.length} sub={waiting[0] ? `next: ${waiting[0].approvals.find(a => a.decision === 'Pending')?.role ?? ''}` : 'none'} onClick={() => set('st', st === 'In review' ? '' : 'In review')} active={st === 'In review'}
          info="Plans in review; the approval chain follows the CapEx (site lead, then head of DC operations above 1 crore, then the CFO above 10 crore in India; the same in dollars in the USA).">
          <SoftMeter pct={ps.length ? (waiting.length / ps.length) * 100 : 0} tone="info" />
        </StatTile>
        <StatTile label="Next delivery" value={next ? fmtDate(next.eval.finish) : '—'} sub={next ? next.name : 'nothing in flight'} onClick={() => next && nav(`/planner/${next.id}`)}
          info="The approved or executing plan that finishes first, by its schedule (lead times from the benchmarks).">
          <SoftMeter pct={next ? 60 : 0} tone="info" />
        </StatTile>
      </StatGrid>
      <Tabs value={tab} onChange={v => set('tab', v === 'plans' ? '' : v)} tabs={[{ id: 'plans', label: 'Plans', count: ps.length }, { id: 'templates', label: 'Templates', count: data.templates.length }, { id: 'benchmarks', label: 'Benchmarks', count: data.benchmarks.length }]} />
      {tab === 'plans' && <section className="vw-card-section dcim-table">
        <DataTable rows={rows} cols={cols} pageSize={30} defaultSort={{ key: 'st', dir: 'asc' }} onRow={p => nav(`/planner/${p.id}`)}
          toolbar={<ListToolbar shown={rows.length} total={ps.length} noun="plans" onApply={apply} onRefresh={reload} search={{ value: q, onChange: v => set('q', v), placeholder: 'Plan, site, city' }}
            filters={[
              { id: 'st', label: 'Status', quick: true, value: st, anyLabel: 'Any status', onChange: v => set('st', v), options: ORDER.map(s => ({ id: s, label: s, count: ps.filter(p => p.status === s).length })).filter(x => x.count) },
              { id: 'scope', label: 'Scope', quick: true, value: scope, anyLabel: 'Any scope', onChange: v => set('scope', v), options: (Object.keys(SCOPE_LABEL) as PlanScope[]).map(s => ({ id: s, label: SCOPE_LABEL[s], count: ps.filter(p => p.scope === s).length })).filter(x => x.count) },
              { id: 'vd', label: 'Check', value: vd, anyLabel: 'Any result', onChange: v => set('vd', v), options: (['blocked', 'warn', 'ready'] as const).map(x => ({ id: x, label: VERDICT[x].label, count: ps.filter(p => p.eval.verdict.state === x).length })) }
            ]} />} />
      </section>}
      {tab === 'templates' && <div className="pl-templates">{data.templates.map(t => { const Ic = SCOPE_ICON[t.scope]; return (
        <Panel key={t.scope} title={t.name} icon={Ic} sub={t.group} actions={<Btn icon={I.Plus} onClick={() => nav(`/planner/new?scope=${t.scope}`)}>Use</Btn>}>
          <p className="pl-tpl-d">{t.description}</p>
          <div className="row wrap" style={{ gap: 6 }}>{Object.entries(t.defaults).map(([k, v]) => <Chip key={k} tone="neutral" size="xs">{k} {String(v)}</Chip>)}</div>
          <p className="vw-label" style={{ margin: '8px 0 0' }}>{t.checks.length ? `Checks: ${t.checks.join(' · ')}` : 'Sized from scratch: no site to check against'}</p>
        </Panel>
      ); })}</div>}
      {tab === 'benchmarks' && <section className="vw-card-section dcim-table">
        <DataTable rows={data.benchmarks.map(b => ({ ...b, id: b.key }))} pageSize={40} defaultSort={{ key: 'g', dir: 'asc' }} cols={[
          { key: 'g', header: 'Area', sort: b => b.group, render: b => <Chip tone="neutral" size="xs">{b.group}</Chip> },
          { key: 'l', header: 'Reference', sort: b => b.label, render: b => <b>{b.label}</b> },
          { key: 'v', header: 'Value used', wrap: true, render: b => <span className="mono pl-bench-v">{b.value}</span> },
          { key: 's', header: 'Source', wrap: true, render: b => <span className="vw-label">{b.source}</span> }]} />
      </section>}
    </div>
  );
}
