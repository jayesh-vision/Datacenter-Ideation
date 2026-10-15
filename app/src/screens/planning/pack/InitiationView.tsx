/* Build initiation: what approval creates in Delivery — the vehicle (programme, project or change), its projects back-scheduled from the
   phase go-lives (late starts flagged), purchase orders, reserved stock and rack positions, permits, design documents, work orders and
   acceptance tests. Before approval each record shows when it will be created; after, it links to the Delivery project that holds it. */
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import type * as T from '../../../planner/p2b/types';
import type { DeliveryProjectView } from '../../../api/types';
import type { Initiation, InitAtp, InitChildPlan, InitProject } from '../../../planner/lib/outputs';
import type { SourcedBom, VendorOrder } from '../../../planner/lib/sourcing';
import { VEHICLE_LABEL, vendorOrders } from '../../../planner/lib/packModel';
import { Chip, Empty, Panel } from '../../../ui/kit';
import { DataTable, type Col } from '../../../ui/DataTable';
import { KvList } from '../parts';
import { SCOPE_LABEL, date, kw, money } from '../common';
import { projectOf, projectUrl, usdText } from './records';

type Order = Initiation['orders'][number] & { id: string };
type Doc = Initiation['designDocs'][number] & { id: string };
type Permit = T.PlannerPermit & { rid: string; id: string };

/** The record a line became (link) or when it will be created. */
const Rec = ({ to, label, pending }: { to?: string; label?: string; pending: string }) => (to && label ? <Link className="ent-link mono nowrap" to={to}>{label}</Link> : <span className="vw-label">{pending}</span>);

export function InitiationView({ plan, init, sourced, recorded, dv }: { plan: T.PlannerPlan; init: Initiation; sourced?: SourcedBom; recorded?: VendorOrder[]; dv?: DeliveryProjectView | null }) {
  const a = plan.artefacts;
  const prj = projectOf(plan);
  const executed = !!a || plan.status === 'Executing' || plan.status === 'Completed';
  const pending = dv ? 'In Delivery' : executed ? 'Not created' : 'On approval';
  const isChange = init.vehicle === 'change';
  const stockCount = a ? a.reservedDeviceIds?.length ?? 0 : sourced?.stockDeviceIds.length ?? 0;
  const rackCount = a ? a.reservedRackIds?.length ?? 0 : sourced?.siteRackIds.length ?? 0;
  const phased = init.projects.some(p => p.planPhaseId && !p.shared) && new Set(init.projects.map(p => p.planPhaseId)).size > 1;
  const toPrj = dv ? projectUrl(plan) : undefined;

  const projectRows = useMemo(() => init.projects.map((p, i) => ({ ...p, id: `${p.uid ?? p.name}-${i}` })), [init.projects]);
  const projectCols: Col<InitProject & { id: string }>[] = [
    { key: 'name', header: 'Project', wrap: true, render: r => <span className="row wrap" style={{ gap: 6 }}><span className="pk-b">{phased ? r.name.split(' — ').slice(-1)[0] : r.name}</span>{r.commissioning && <Chip tone="info" size="xs">Commissioning</Chip>}</span> },
    ...(phased ? [{ key: 'phase', header: 'Phase', render: (r: InitProject) => (r.shared ? <Chip tone="neutral" size="xs">Runs once</Chip> : r.phaseName ?? '—') }] : []),
    { key: 'start', header: 'Start', sort: r => r.start, render: r => (r.late ? <span className="num pk-late" title="Back-scheduled from the phase go-live on blueprint durations, this project should already have started">{date(r.start)} · late</span> : <span className="num">{date(r.start)}</span>) },
    { key: 'end', header: 'End', render: r => <span className="num">{date(r.end)}</span> },
    { key: 'budget', header: 'Budget', sort: r => r.budget, render: r => <span className="num" title={r.budgetBasis ? usdText(r.budgetBasis) : undefined}>{money(r.budget)}</span> },
    { key: 'gate', header: 'Gate', wrap: true, render: r => <span className="row wrap" style={{ gap: 4 }}><Chip tone="neutral" size="xs">{r.gate}</Chip>{(r.gatedBy ?? []).map(x => <Chip key={x} tone="warning" size="xs" title="Permit that must be granted before the project starts">{x}</Chip>)}</span> },
    { key: 'll', header: 'Long lead', render: r => (r.longLead ? <Chip tone="warning" size="xs">Long-lead items</Chip> : null) },
    { key: 'rec', header: 'Record', render: () => <Rec to={toPrj} label={prj} pending={pending} /> },
  ];
  const childRows = useMemo(() => (init.childPlans ?? []).map(c => ({ ...c, id: c.rowId })), [init.childPlans]);
  const childCols: Col<InitChildPlan & { id: string }>[] = [
    { key: 'title', header: 'Child plan', wrap: true, render: r => <span className="pk-b">{r.title}</span> },
    { key: 'scope', header: 'Type', render: r => SCOPE_LABEL[r.scope] ?? r.scope },
    { key: 'kw', header: 'IT capacity', render: r => <span className="num">{kw(r.itKw)}</span> },
    { key: 'live', header: 'Live', render: r => <span className="num">{date(r.goLive)}</span> },
    { key: 'budget', header: 'Budget envelope', render: r => <span className="num">{money(r.budget)}</span> },
    { key: 'rec', header: 'Record', render: r => { const id = plan.sites?.find(x => x.id === r.rowId)?.childPlanId; return <Rec to={id ? `/planning/plans/${id}` : undefined} label={id} pending={executed ? 'Not created' : 'On approval'} />; } },
  ];
  const orders = useMemo(() => (sourced ? recorded ?? vendorOrders(sourced) : []), [sourced, recorded]);
  const vendorRows = useMemo(() => orders.map((o, i) => ({ ...o, id: `${o.vendorName}-${o.phaseId ?? ''}-${i}` })), [orders]);
  const vendorCols: Col<VendorOrder & { id: string }>[] = [
    { key: 'vendor', header: 'Vendor', render: r => <span className="pk-b">{r.vendorName}</span> },
    { key: 'contract', header: 'Contract', render: r => (r.contractId ? r.contractLabel : <Chip tone="warning" size="xs">No contract</Chip>) },
    ...(orders.some(o => o.phaseName) ? [{ key: 'phase', header: 'Phase', render: (r: VendorOrder) => r.phaseName ?? '—' }] : []),
    { key: 'lines', header: 'Lines', render: r => <span className="num">{r.lines.length}</span> },
    { key: 'value', header: 'Value', sort: r => r.value, render: r => <span className="num">{money(r.value)}</span> },
    { key: 'lead', header: 'Longest lead', sort: r => r.leadWeeks, render: r => (r.leadWeeks ? <span className={`num${r.leadWeeks >= 40 ? ' pk-late' : ''}`}>{r.leadWeeks} wk</span> : <span className="vw-label">—</span>) },
    { key: 'po', header: 'Purchase order', render: () => <Rec to={dv ? projectUrl(plan, 'procurement') : undefined} label={dv ? `${prj} orders` : undefined} pending={pending} /> },
  ];
  const orderRows = useMemo<Order[]>(() => init.orders.map((o, i) => ({ ...o, id: `${o.item}-${o.needBy}-${i}` })), [init.orders]);
  const orderCols: Col<Order>[] = [
    { key: 'item', header: 'Item', wrap: true, render: r => <span className="pk-b">{r.item}</span> },
    { key: 'cat', header: 'Category', render: r => (r.category === 'Mixed' ? 'Several' : r.category) },
    { key: 'value', header: 'Value', sort: r => r.value, render: r => <span className="num">{money(r.value)}</span> },
    { key: 'ob', header: 'Order by', sort: r => r.orderBy, render: r => <span className={`num${r.late ? ' pk-late' : ''}`}>{date(r.orderBy)}</span> },
    { key: 'nb', header: 'Need by', render: r => <span className="num">{date(r.needBy)}</span> },
    { key: 'late', header: 'Timing', render: r => (r.late ? <Chip tone="error" size="xs" dot>Late</Chip> : <Chip tone="success" size="xs" dot>On time</Chip>) },
    ...(sourced ? [] : [{ key: 'po', header: 'Purchase order', render: () => <Rec to={dv ? projectUrl(plan, 'procurement') : undefined} label={dv ? `${prj} orders` : undefined} pending={pending} /> }]),
  ];
  const permitRows = useMemo<Permit[]>(() => init.permits.map((p, i) => ({ ...p, rid: p.id, id: `${p.id}-${i}` })), [init.permits]);
  const permitCols: Col<Permit>[] = [
    { key: 'name', header: 'Permit', wrap: true, render: r => <span className="cell-2"><span className="pk-b">{r.name}</span><small>{r.authority}</small></span> },
    { key: 'lead', header: 'Lead time', render: r => <span className="num">{r.leadWeeks} wk</span> },
    { key: 'need', header: 'Needed before', render: r => <span className="num">{date(r.neededBefore)}</span> },
    { key: 'status', header: 'Status', render: r => <Chip tone={r.status === 'Approved' ? 'success' : r.status === 'Expired' ? 'error' : r.status === 'Not started' ? 'neutral' : 'info'} size="xs" dot>{r.status}</Chip> },
    ...(init.permitGates?.length ? [{ key: 'gates', header: 'Gates', wrap: true, render: (r: Permit) => { const g = init.permitGates?.find(x => x.permit.id === r.rid); return g?.projectName ? <span className="row" style={{ gap: 6 }} title={g.reason}><Chip tone={g.ok ? 'success' : 'error'} size="xs">{g.ok ? 'In time' : 'Late'}</Chip><span>{g.projectName.split(' — ').slice(-2).join(' — ')}</span></span> : <span className="vw-label" title={g?.reason}>Not linked</span>; } }] : []),
    { key: 'rec', header: 'Record', render: () => <Rec to={dv ? projectUrl(plan, 'permits') : undefined} label={dv ? `${prj} permits` : undefined} pending={pending} /> },
  ];
  const docRows = useMemo<Doc[]>(() => init.designDocs.map((d, i) => ({ ...d, id: `${d.name}-${i}` })), [init.designDocs]);
  const docCols: Col<Doc>[] = [
    { key: 'name', header: 'Document', wrap: true, render: r => <span className="pk-b">{r.name}</span> },
    { key: 'type', header: 'Stage', render: r => r.type },
    { key: 'disc', header: 'Discipline', render: r => r.discipline },
    { key: 'rec', header: 'Record', render: () => <Rec to={dv ? projectUrl(plan, 'permits') : undefined} label={dv ? `${prj} design` : undefined} pending={pending} /> },
  ];
  const atpRows = useMemo(() => (init.atps ?? []).map(t => ({ ...t, id: t.uid })), [init.atps]);
  const atpCols: Col<InitAtp & { id: string }>[] = [
    { key: 'name', header: 'Acceptance test', wrap: true, render: r => <span className="pk-b">{r.name}</span> },
    { key: 'level', header: 'Level', render: r => <Chip tone="info" size="xs">{r.level}</Chip> },
    { key: 'system', header: 'System', render: r => r.system },
    ...(atpRows.some(r => r.phaseName) ? [{ key: 'phase', header: 'Phase', render: (r: InitAtp) => r.phaseName ?? '—' }] : []),
    { key: 'steps', header: 'Steps', render: r => <span className="num">{r.steps.length}</span> },
    { key: 'rec', header: 'Record', render: () => <Rec to={dv ? projectUrl(plan, 'commissioning') : undefined} label={dv ? `${prj} commissioning` : undefined} pending={pending} /> },
  ];

  const vehicle: [ReactNode, ReactNode][] = [
    ['Created as', VEHICLE_LABEL[init.vehicle]], ['Name', init.name],
    ...(isChange ? [] : [['Blueprint', init.blueprintName ?? (init.projects[0]?.template ? `${init.projects[0].template} template` : 'No blueprint for this plan type')] as [ReactNode, ReactNode]]),
    ['Budget', money(init.budget)],
    ...(init.budgetSplit?.length ? [['Budget split', init.budgetSplit.map(b => `${b.category} ${money(b.amount)}`).join(' · ')] as [ReactNode, ReactNode]] : []),
    ...(isChange && init.change ? [['Change type', init.change.type] as [ReactNode, ReactNode]] : []),
    ['Record', dv ? (isChange && dv.workOrders[0] ? <Link className="ent-link mono" to={`/changes/${dv.workOrders[0].changeId}`}>{dv.workOrders[0].changeId}</Link> : <Link className="ent-link mono" to={projectUrl(plan)}>{prj}</Link>) : <span className="vw-label">{pending}</span>],
  ];
  const work: [ReactNode, ReactNode][] = dv
    ? [['Work orders', <Link className="ent-link" to={projectUrl(plan, 'workorders')}>{dv.workOrders.length} in {prj}</Link>], ['Open', String(dv.workOrders.filter(w => w.state !== 'Done').length)], ['Change requests', dv.workOrders.length ? <span className="row wrap" style={{ gap: 8 }}>{dv.workOrders.slice(0, 3).map(w => <Link key={w.id} className="ent-link mono" to={`/changes/${w.changeId}`}>{w.changeId}</Link>)}{dv.workOrders.length > 3 && <span className="vw-label">+{dv.workOrders.length - 3} more</span>}</span> : 'None'], ['State', `${dv.project.state} · ${dv.project.health}`]]
    : [['Process', init.workOrder.process], ['Work orders', init.workOrders?.length ? `${init.workOrders.length}, one per site` : 'Field work split into crew windows'], ['Change requests', 'One per work order'], ['Starts', 'When the plan is approved']];

  return (
    <div className="col" style={{ gap: 14 }}>
      {dv && <p className="note note--info"><I.Info size={15} /><span>The build is in Delivery as <Link className="ent-link mono" to={projectUrl(plan)}>{prj}</Link> ({dv.project.state.toLowerCase()}, {dv.project.health}). Each record below links to where it is kept.</span></p>}
      {!dv && !executed && <p className="note note--info"><I.Info size={15} /><span>Nothing below exists yet. Approving the plan creates these records in Delivery with the figures shown.</span></p>}
      {!dv && executed && <p className="note note--warn"><I.TriangleAlert size={15} /><span>This plan was executed before its build records were tracked in Delivery.</span></p>}
      <div className="pn-two">
        <Panel icon={I.FolderKanban} title={VEHICLE_LABEL[init.vehicle]} info="How the build is run: a programme of projects, a single project, or a change request for small work."><KvList items={vehicle} one /></Panel>
        <Panel icon={I.ClipboardList} title="Work orders and change requests" info="Field work is split into crew windows; each work order carries its own change request."><KvList items={work} one /></Panel>
      </div>
      {(init.notes ?? []).map(n => <p key={n} className="note note--warn"><I.TriangleAlert size={15} /><span>{usdText(n)}</span></p>)}
      {init.vehicle === 'portfolio' && (
        <Panel flush icon={I.GitBranch} title="Child plans" count={childRows.length} actions={<span className="vw-label">one per allocation row</span>}>
          {childRows.length ? <DataTable rows={childRows} cols={childCols} pageSize={500} /> : <Empty icon={I.GitBranch} title="No allocation yet">The child plans follow from the allocation rows.</Empty>}
        </Panel>
      )}
      {!isChange && init.vehicle !== 'portfolio' && (
        <Panel flush icon={I.Layers} title="Projects and gates" count={projectRows.length} info="Back-scheduled from each phase go-live on the blueprint's durations; a start already in the past is flagged late." actions={phased ? <span className="vw-label">one set per phase</span> : undefined}>
          {projectRows.length ? <DataTable rows={projectRows} cols={projectCols} pageSize={500} /> : <Empty icon={I.Layers} title="No projects laid out">No blueprint matches this plan type, so no projects are laid out in advance.</Empty>}
        </Panel>
      )}
      {sourced && (
        <Panel flush icon={I.ShoppingCart} title="Purchase orders" count={orders.length} actions={<span className="vw-label">One per vendor · {money(orders.reduce((s, o) => s + o.value, 0))}</span>}>
          {vendorRows.length ? <DataTable rows={vendorRows} cols={vendorCols} pageSize={500} /> : <Empty icon={I.ShoppingCart} title="Nothing to buy">Everything comes from stock or spare site capacity.</Empty>}
        </Panel>
      )}
      {(sourced || stockCount > 0 || rackCount > 0) && (
        <Panel icon={I.Boxes} title="Reserved from stock and site" actions={<span className="vw-label">{a ? 'Reserved on execution' : 'Reserved when the build starts'}</span>}>
          <KvList items={[
            ['Stock reserved', stockCount ? <span className="row wrap" style={{ gap: 8 }}>{stockCount} device{stockCount === 1 ? '' : 's'}{sourced ? ` · ${money(sourced.stockValue)}` : ''}<Link className="ent-link" to={`/dcim?tab=devices${plan.dataCenterId ? `&dc=${plan.dataCenterId}` : ''}`}>Devices in DCIM</Link></span> : <span className="vw-label">{a ? 'None reserved' : 'Nothing in stock matches'}</span>],
            ...(rackCount ? [['Rack positions', <span className="row wrap" style={{ gap: 8 }}>{rackCount} position{rackCount === 1 ? '' : 's'}<Link className="ent-link" to={`/dcim?tab=racks${plan.dataCenterId ? `&dc=${plan.dataCenterId}` : ''}`}>Racks in DCIM</Link></span>] as [ReactNode, ReactNode]] : []),
          ]} />
        </Panel>
      )}
      <Panel flush icon={I.PackageCheck} title={sourced ? 'Long-lead items to order' : 'Long-lead purchase orders'} count={orderRows.length} actions={<span className="vw-label">{init.orders.filter(o => o.late).length} late to order</span>}>
        {orderRows.length ? <DataTable rows={orderRows} cols={orderCols} pageSize={500} /> : <Empty icon={I.PackageCheck} title="No long-lead equipment">No long-lead equipment in this plan.</Empty>}
      </Panel>
      {atpRows.length > 0 && (
        <Panel flush icon={I.ClipboardCheck} title="Acceptance tests" count={atpRows.length} info="Acceptance test procedures with their steps, from the commissioning checklist templates; run as L1–L5 in Delivery.">
          <DataTable rows={atpRows} cols={atpCols} pageSize={500} maxHeight={420} />
        </Panel>
      )}
      <>
        <Panel flush icon={I.Stamp} title="Permits to file" count={permitRows.length}>
          {permitRows.length ? <DataTable rows={permitRows} cols={permitCols} pageSize={500} /> : <Empty icon={I.Stamp} title="No permits">No permits are listed for this plan.</Empty>}
        </Panel>
        <Panel flush icon={I.FileStack} title="Design documents to create" count={docRows.length}>
          {docRows.length ? <DataTable rows={docRows} cols={docCols} pageSize={500} /> : <Empty icon={I.FileText} title="No design documents" />}
        </Panel>
      </>
    </div>
  );
}
