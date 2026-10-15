/* Planner → Plans: every plan with its status, site, size, cost and readiness; filters are URL-backed (?status=&scope=&q=). */
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { DataTable, type Col } from '../../ui/DataTable';
import { Btn, Empty, Menu } from '../../ui/kit';
import { usePlannerActions } from '../../planner/lib/usePlanner';
import * as G from '../../planner/lib/governance';
import type * as T from '../../planner/p2b/types';
import type { PlanRow } from './Planner';
import { SoftMeterCell } from './parts';
import { PlanStatusChip, ReasonModal, SCOPE_LABEL, date, kw, money, type ReasonRequest } from './common';

const STATUSES: T.PlannerPlanStatus[] = ['Draft', 'In review', 'Approved', 'Executing', 'Completed', 'Rejected', 'On hold', 'Cancelled'];

export function PlansTab({ rows }: { rows: PlanRow[] }) {
  const [sp] = useSearchParams();
  const apply = useParamPatch();
  const nav = useNavigate();
  const actions = usePlannerActions();
  const [ask, setAsk] = useState<ReasonRequest | null>(null);
  const q = sp.get('q') ?? '', status = sp.get('status') ?? '', scope = sp.get('scope') ?? '';
  /* newest change first (the Updated column, which also sorts, is hidden on narrower screens) */
  const shown = [...rows].sort((a, b) => b.plan.updatedAt.localeCompare(a.plan.updatedAt)).filter(r => (!status || r.plan.status === status) && (!scope || r.plan.scope === scope) && (!q || `${r.plan.plnId} ${r.plan.title} ${r.site} ${r.plan.ownerName}`.toLowerCase().includes(q.toLowerCase())));
  const cnt = (f: (r: PlanRow) => boolean) => rows.filter(f).length;
  const cols: Col<PlanRow>[] = [
    { key: 'id', header: 'Plan', sort: r => r.plan.plnId, render: r => <span className="cell-2 pn-plan-cell"><b>{r.plan.title}</b><small><span className="mono">{r.plan.plnId}</span>{r.plan.revision && r.plan.revision !== 'A' ? ` · rev ${r.plan.revision}` : ''}<span className="pn-narrow-only"> · {SCOPE_LABEL[r.plan.scope]} · <span className="pn-nowrap">updated {date(r.plan.updatedAt)}</span></span></small></span>, wrap: true },
    { key: 'scope', header: 'Plan type', sort: r => r.plan.scope, render: r => SCOPE_LABEL[r.plan.scope], hideBelow: 1500 },
    { key: 'site', header: 'Site', sort: r => r.site, render: r => <span className="pn-nowrap">{r.site}</span> },
    { key: 'status', header: 'Status', sort: r => r.plan.status, render: r => <PlanStatusChip s={r.plan.status} /> },
    { key: 'kw', header: 'IT power', sort: r => r.plan.designPowerKw, render: r => <span className="num">{kw(r.plan.designPowerKw)}</span> },
    { key: 'capex', header: 'CapEx', sort: r => r.capex, render: r => <span className="num">{money(r.plan.baseline?.capexTotal ?? r.capex)}</span> },
    { key: 'go', header: 'Needed by', sort: r => r.plan.targetGoLive, render: r => <span className="pn-nowrap">{date(r.plan.targetGoLive)}</span> },
    { key: 'rules', header: 'Rules', sort: r => r.ev.hardFails * 100 + r.ev.softWarns, render: r => <span className={r.ev.hardFails ? 'strong' : ''} style={{ color: r.ev.hardFails ? 'var(--vw-color-red-600)' : r.ev.softWarns ? 'var(--vw-color-amber-700)' : undefined }}>{r.ev.hardFails ? `${r.ev.hardFails} fail` : r.ev.softWarns ? `${r.ev.softWarns} warn` : 'Pass'}</span> },
    { key: 'ready', header: 'Readiness', sort: r => r.ev.readinessPct, render: r => <SoftMeterCell pct={r.ev.readinessPct} /> },
    { key: 'owner', header: 'Owner', sort: r => r.plan.ownerName, render: r => r.plan.ownerName, hideBelow: 1500 },
    { key: 'upd', header: 'Updated', sort: r => r.plan.updatedAt, render: r => <span className="pn-nowrap">{date(r.plan.updatedAt)}</span>, hideBelow: 1500 },
    { key: 'a', header: '', render: r => <Menu items={[
      { label: 'Open', icon: I.Eye, onClick: () => nav(`/planning/plans/${r.plan.id}`) },
      { label: G.isEditable(r.plan) ? 'Edit in wizard' : 'View in wizard', icon: I.Pencil, onClick: () => nav(`/planning/plans/${r.plan.id}/edit`) },
      { label: 'Delete draft', icon: I.Trash2, danger: true, disabled: !G.canDelete(r.plan), sep: true, onClick: () => setAsk({ title: `Delete ${r.plan.plnId}?`, description: `"${r.plan.title}" is removed from the planner; it stays in the audit trail.`, okText: 'Delete', danger: true, needsReason: false, onOk: () => actions.deletePlan(r.plan) }) },
    ]} /> },
  ];
  return (
    <section className="vw-card-section dcl-table pn-plans">
      <DataTable rows={shown} cols={cols} pageSize={25} onRow={r => nav(`/planning/plans/${r.plan.id}`)}
        empty={<Empty icon={I.ClipboardList} title="No plans match" action={<span className="row" style={{ gap: 8 }}>{(status || scope || q) && <Btn onClick={() => apply({ status: '', scope: '', q: '' })}>Clear filters</Btn>}<Btn variant="filled" icon={I.Plus} onClick={() => nav('/planning/new')}>New plan</Btn></span>}>{status || scope ? `No plan is ${[status && `in status ${status}`, scope && `of type ${SCOPE_LABEL[scope as T.PlannerScope] ?? scope}`].filter(Boolean).join(' and ')}${q ? ` matching “${q}”` : ''}. Clear a filter or start a new plan.` : 'Clear the search or start a new plan.'}</Empty>}
        toolbar={<ListToolbar shown={shown.length} total={rows.length} noun="plans" onApply={apply} search={{ value: q, onChange: v => apply({ q: v }), placeholder: 'Plan, site, owner' }}
          filters={[
            { id: 'status', label: 'Status', quick: true, value: status, anyLabel: 'Any status', onChange: v => apply({ status: v }), options: STATUSES.filter(s => s === status || cnt(r => r.plan.status === s)).map(s => ({ id: s, label: s, count: cnt(r => r.plan.status === s) })) },
            { id: 'scope', label: 'Plan type', quick: true, value: scope, anyLabel: 'Any plan type', onChange: v => apply({ scope: v }), options: (Object.keys(SCOPE_LABEL) as T.PlannerScope[]).filter(s => s === scope || cnt(r => r.plan.scope === s)).map(s => ({ id: s, label: SCOPE_LABEL[s], count: cnt(r => r.plan.scope === s) })) },
          ]} />} />
      <ReasonModal req={ask} onClose={() => setAsk(null)} />
    </section>
  );
}
