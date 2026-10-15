/* The last step (what blocks submission, what the plan produces, who approves it) and the live estimate rail shown beside every step. */
import { useMemo } from 'react';
import * as I from 'lucide-react';
import { Chip, Info } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation } from '../../../planner/lib/engine';
import { blockers, fmtParam, paramDefsFor, type StepKey, type StepProps } from '../../../planner/lib/wizardModel';
import * as G from '../../../planner/lib/governance';
import { buildPack, sourcingReady, sourcingSplit, vendorOrders, VEHICLE_LABEL, type PlanPackData } from '../../../planner/lib/packModel';
import { useSourcingContext } from '../../../planner/lib/usePlanner';
import { ASPECT_LABEL, SCOPE_LABEL, SOURCE_LABEL, SourceChip, date, kw, money, num } from '../common';
import { Tbl } from './panelKit';
import { Sub, Sec, Figs, KvList, SoftMeterCell } from '../parts';
import { StepHead } from './steps';

const plural = (n: number, w: string) => `${num(n)} ${w}${n === 1 ? '' : 's'}`;
/** What the plan pack holds, counted (the wizard's preview of the plan page's Plan pack). Money in the geography's currency. */
function packRows(pack: PlanPackData): { label: string; detail: string; applies: boolean; icon: I.LucideIcon }[] {
  const { bom, ip, bod, init, applies, sheets, sourced } = pack;
  const orders = sourced ? vendorOrders(sourced).length : init.orders.length;
  const split = sourced ? sourcingSplit(sourced) : [];
  const src = split.filter(x => x.lines).map(x => `${x.lines} ${x.source === 'site' ? 'from spare site capacity' : x.source === 'stock' ? `from stock (${money(x.value)})` : `to buy (${money(x.value)})`}`);
  return [
    { label: 'Plan document', detail: plural(bod.length, 'section'), applies: true, icon: I.FileText },
    { label: 'Bill of materials', detail: bom.lines.length ? `${plural(bom.lines.length, 'line')} · ${money(sourced?.total ?? bom.total)}` : 'no items for this plan', applies: bom.lines.length > 0, icon: I.ListTree },
    ...(sourced && src.length ? [{ label: 'Sourcing', detail: src.join(' · '), applies: true, icon: I.Boxes }] : []),
    { label: 'IP and network plan', detail: applies.ip && ip.items.length ? `${plural(ip.items.length, 'prefix')} in ${ip.aggregate} · ${plural(ip.vlans.length, 'VLAN')}` : applies.ip ? ip.aggregate : 'not part of this plan type', applies: applies.ip && ip.items.length > 0, icon: I.Network },
    { label: 'Drawings', detail: sheets.length ? plural(sheets.length, 'sheet') : 'nothing to draw', applies: sheets.length > 0, icon: I.DraftingCompass },
    { label: 'Build initiation', detail: [VEHICLE_LABEL[init.vehicle], init.projects.length ? plural(init.projects.length, 'project') : '', init.childPlans ? plural(init.childPlans.length, 'child plan') : plural(orders, 'purchase order'), init.atps?.length ? plural(init.atps.length, 'acceptance test') : ''].filter(Boolean).join(' · '), applies: true, icon: I.Rocket },
  ];
}

export function ReviewStep({ draft, ev, template, data, goTo, estate, templates, benchmarks, actions }: StepProps) {
  const defs = useMemo(() => paramDefsFor(ev, templates, draft.dcTypeKey), [ev, templates, draft.dcTypeKey]);
  const departures = useMemo(() => Object.entries(ev?.params ?? {}).filter(([k, v]) => (v.source === 'user' || v.source === 'ai' || v.source === 'document') && defs.has(k)), [ev, defs]);
  const sourcingCtx = useSourcingContext();
  const sourcing = sourcingReady(sourcingCtx) ? sourcingCtx : undefined;
  const list = blockers(draft, ev, template, data);
  const bad = list.filter(b => b.level === 'bad'), warn = list.filter(b => b.level === 'warn');
  const amt = ev ? G.approvalAmount(ev) : { amountUsd: 0, itUsd: 0 };
  const path = G.buildApprovalPath(template, amt.amountUsd, amt.itUsd);
  const site = estate.dataCenters.find(d => d.id === draft.dataCenterId)?.name ?? draft.newSiteName ?? estate.campuses.find(c => c.id === draft.campusId)?.name ?? estate.regions.find(r => r.id === draft.regionId)?.name ?? '—';
  const produces = useMemo(() => (ev ? packRows(buildPack(draft, ev, template, benchmarks, site, sourcing)) : []), [draft, ev, template, benchmarks, site, sourcing]);
  const step = (k: StepKey) => <button type="button" className="pn-fix" onClick={() => goTo(k)}>Go to step<I.ArrowRight size={13} /></button>;
  const verdict = bad.length ? 'is-blocked' : warn.length ? 'is-warn' : 'is-ready';
  return (
    <div className="pn-stack">
      <StepHead title="Review and submit" text="What approvers will see: the plan, its figures, the rules it passes and what it produces. Anything blocking is listed first." />
      <div className={`pn-verdict ${verdict}`}>
        <span className="pn-verdict-ico">{bad.length ? <I.OctagonX size={20} /> : warn.length ? <I.TriangleAlert size={20} /> : <I.CheckCircle2 size={20} />}</span>
        <div><b>{bad.length ? `${bad.length} item${bad.length === 1 ? '' : 's'} block submission` : warn.length ? 'Ready to submit' : 'Ready to submit'}</b><p>{bad.length ? 'Fix each one below; the link takes you to the step.' : warn.length ? `${warn.length} item${warn.length === 1 ? '' : 's'} for the approvers to acknowledge.` : 'Every rule passes and every input has a source.'}</p></div>
      </div>
      {list.length > 0 && <Sec icon={I.ListChecks} title="Checklist" sub="What blocks submission, then what approvers will see as notes" tone={bad.length ? 'bad' : 'warn'}>
        <ul className="pn-list">{list.map((b, i) => <li key={i}><Chip tone={b.level === 'bad' ? 'error' : 'warning'} size="xs" dot>{b.level === 'bad' ? 'Blocks' : 'Note'}</Chip><span className="cell-2"><b style={{ fontWeight: 400 }}>{b.text}</b></span>{step(b.step)}</li>)}</ul>
      </Sec>}
      {ev && <div className="pn-reviewfigs"><Figs items={[['CapEx', money(ev.estimate.capexTotal)], ['OpEx per month', money(ev.estimate.opexMonthly)], ['IT capacity', kw(draft.designPowerKw)], ['PUE', String(ev.sizing.pue.value)], ['Payback', ev.estimate.paybackMonths == null ? '—' : `${ev.estimate.paybackMonths} months`], ['Readiness', `${ev.readinessPct}%`]]} /></div>}
      <div className="pn-two">
        <Sec title="The plan" icon={I.FileText}>
          <KvList one items={[['Plan type', SCOPE_LABEL[draft.scope]], ['Template', `${template?.name ?? '—'}${template ? ` v${template.version}` : ''}`], ['Where', site], ['Needed by', date(draft.targetGoLive)], ['Phases', String(draft.phases.length)], ['Racks / halls', ev ? `${num(ev.sizing.racks)} / ${num(ev.sizing.halls)}` : '—'], ['Workload', `${draft.demand.gpuPct}% GPU · ${draft.demand.computePct}% compute · ${draft.demand.storagePct}% storage`], ['Owner', draft.ownerName]]} />
        </Sec>
        <Sec title="Who approves it" icon={I.ShieldCheck} sub={`Routed on ${money(amt.amountUsd)}${amt.itUsd ? ` (incl. ${money(amt.itUsd)} owned IT)` : ''} · band ${path.band.label}${path.band.businessCaseRequired ? ' · business case required' : ''}`}>
          {path.approvals.length ? <ol className="pn-chainlist is-tall">{path.approvals.map((a, i) => { const who = G.peopleWithRole(a.role); const own = who.some(p => p.name === draft.requestedBy || p.name === actions.actor); return <li key={i}><i>{i + 1}</i><span className="cell-2"><b>{a.step} · {a.role}</b><small>{a.basis}</small><small className="pn-approvers"><I.Users size={12} />{who.length ? `Can approve: ${who.map(p => p.name).join(', ')}` : 'Nobody holds this role yet'}{own ? ' (not you or the requester: segregation of duties)' : ''}</small></span></li>; })}</ol> : <p className="vw-label">No approval step for this plan type.</p>}
          {template?.executesAs && <p className="vw-label" style={{ margin: '10px 0 0', fontSize: 12.5 }}>Once approved it runs as a <b className="strong">{template.executesAs}</b> in Delivery.</p>}
        </Sec>
      </div>
      <div className="pn-two">
        <Sec title="Departures from the template" icon={I.GitCompareArrows} sub={departures.length ? `${departures.length} input${departures.length === 1 ? '' : 's'} set differently from ${template?.name ?? 'the template'}` : 'Every input is the template default or comes from your requirements'}>
          {departures.length > 0 ? <div className="pn-departs"><Tbl head={['Input', 'This plan', 'Source']} maxHeight={330}>{departures.map(([k, v]) => { const d = defs.get(k)!; return <tr key={k}><td>{d.label}</td><td><span className="cell-2"><b className="strong" style={{ fontWeight: 500 }}>{fmtParam(k, v.value, d.unit)}</b><small>template {fmtParam(k, d.default, d.unit)}</small></span></td><td><SourceChip s={v.source} note={v.note} /></td></tr>; })}</Tbl></div>
            : <p className="vw-label" style={{ margin: 0 }}>Nothing departs from the standard design.</p>}
        </Sec>
        <Sec title="What the plan produces" icon={I.PackageOpen} sub="The plan pack on the plan page, as it stands now">
          <ul className="pn-produces">{produces.map(o => { const Ico = o.icon; return <li key={o.label} className={o.applies ? '' : 'is-off'}><Ico size={14} /><b>{o.label}</b><span>{o.detail}</span></li>; })}</ul>
          {(template?.outputs ?? []).length > 0 && <><Sub>Outputs named by the plan type</Sub><div className="row wrap" style={{ gap: 6 }}>{template!.outputs.map(o => <Chip key={o} tone="neutral" size="xs">{o}</Chip>)}</div></>}
        </Sec>
      </div>
      {ev && <Sec icon={I.LayoutGrid} title="Inputs by area" sub="How much of each area is confirmed rather than left on the template default">
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Area</th><th>Depth</th><th>Confirmed</th><th>Still on defaults</th><th>Checks</th></tr></thead><tbody>{ev.aspects.map(a => <tr key={a.aspect}><td>{ASPECT_LABEL[a.aspect]}</td><td>{a.depth}</td><td><SoftMeterCell pct={a.total ? (a.answered / a.total) * 100 : 100} /></td><td className="num">{a.defaults ?? 0}</td><td>{a.findings.some(f => f.status === 'fail') ? <Chip tone="error" size="xs" dot>fail</Chip> : a.findings.some(f => f.status === 'warn') ? <Chip tone="warning" size="xs" dot>warn</Chip> : <Chip tone="success" size="xs" dot>pass</Chip>}</td></tr>)}</tbody></table>
      </Sec>}
    </div>
  );
}

const SRC_DOT: Partial<Record<T.PlannerParamSource, string>> = { user: 'user', requirement: 'req', template: 'def', benchmark: 'bm', actual: 'bm', document: 'bm', ai: 'bm' };
function Row({ label, value, source, note, tone }: { label: string; value: React.ReactNode; source?: T.PlannerParamSource; note?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return <div className="pn-rail-row" title={note}><span>{source && <i className={`pn-sdot s-${SRC_DOT[source] ?? 'def'}`} title={SOURCE_LABEL[source]} />}{label}</span><b className={tone ?? ''}>{value}</b></div>;
}
function Ring({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r, col = pct >= 80 ? 'var(--vw-color-emerald-500)' : pct >= 50 ? 'var(--vw-color-amber-500)' : 'var(--vw-color-red-500)';
  return <svg width="64" height="64" viewBox="0 0 64 64" className="pn-ring"><circle cx="32" cy="32" r={r} fill="none" stroke="var(--vw-color-slate-100)" strokeWidth="6" /><circle cx="32" cy="32" r={r} fill="none" stroke={col} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 32 32)" /><text x="32" y="36" textAnchor="middle">{pct}%</text></svg>;
}
export function LiveEstimate({ draft, ev }: { draft: T.PlannerPlan; ev?: Evaluation }) {
  return (
    <aside className="pn-rail vw-card-section">
      <div className="pn-rail-head"><h3>Live estimate<Info text="Re-evaluated on every change: sizing, cost, rules and readiness of the draft as it is now. The dot beside a figure says where its inputs come from (blue = entered, violet = requirements, teal = benchmark or actual, grey = template default)." /></h3>{ev && <Chip tone={ev.hardFails ? 'error' : ev.softWarns ? 'warning' : 'success'} size="xs" dot>{ev.hardFails ? `${ev.hardFails} fail` : ev.softWarns ? `${ev.softWarns} warn` : 'Clean'}</Chip>}</div>
      {!ev ? <p className="vw-label">Evaluating…</p> : <>
        <div className="pn-rail-ready"><Ring pct={ev.readinessPct} /><div><b>Readiness</b><small>{ev.defaultsCount ? `${ev.defaultsCount} input${ev.defaultsCount === 1 ? '' : 's'} still on template defaults` : 'Every input has a source'}</small></div></div>
        <div className="pn-rail-big">
          <div><span>CapEx</span><b>{money(ev.estimate.capexTotal)}</b><small>{money(ev.estimate.capexPerKw)} / kW</small></div>
          <div><span>IT power</span><b>{kw(ev.sizing.itKw)}</b><small>{num(ev.sizing.racks)} racks</small></div>
        </div>
        {ev.ctx.site && <Row label={`Free at ${ev.ctx.site.dc.code}`} value={kw(ev.ctx.site.headroomItKw)} source="actual" note={`${ev.ctx.site.binding?.label ?? 'no stage'} binds; live draw ${kw(ev.ctx.site.itLoadKw)}, holds ${kw(ev.ctx.site.reservedKw)}`} />}
        {ev.sizing.facility && <Row label="Facility load" value={`${ev.sizing.facility.mva} MVA`} note={`${kw(ev.sizing.facility.facilityKw)} = IT × peak PUE ${ev.sizing.facility.peakPue}`} source={ev.sizing.pue.source} />}
        <Row label="Halls / buildings" value={`${ev.sizing.halls} / ${ev.sizing.buildings}`} source={ev.params.hallDesignKw?.source ?? 'template'} />
        <Row label="OpEx / month" value={money(ev.estimate.opexMonthly)} source={ev.sizing.pue.source} note={`${money(ev.estimate.costPerKwMonth)} per kW-month`} />
        <Row label="PUE" value={String(ev.sizing.pue.value)} source={ev.sizing.pue.source} note={ev.sizing.pue.note} />
        <Row label="Payback" value={ev.estimate.paybackMonths == null ? '—' : `${ev.estimate.paybackMonths} mo`} source={ev.params.revenuePerKwMonth?.source} note={ev.estimate.paybackBasis} tone={ev.estimate.paybackMonths == null ? 'warn' : ev.estimate.paybackMonths > 96 ? 'warn' : 'ok'} />
        {ev.estimate.npvUsd !== undefined && <Row label="NPV / IRR" value={`${money(ev.estimate.npvUsd)} / ${ev.estimate.irrPct == null ? '—' : `${ev.estimate.irrPct}%`}`} note={`at ${ev.estimate.discountPct}% hurdle rate`} tone={ev.estimate.npvUsd >= 0 ? 'ok' : 'warn'} />}
        <div className="pn-rail-checks"><span className={ev.hardFails ? 'bad' : ''}><b>{ev.hardFails}</b>hard fails</span><span className={ev.softWarns ? 'warn' : ''}><b>{ev.softWarns}</b>warnings</span><span><b>{ev.findings.length}</b>rules</span></div>
        {ev.bindingConstraint !== 'none' && <p style={{ margin: '10px 0 0' }}><Chip tone="warning" size="xs">{ev.bindingConstraint} binds first</Chip></p>}
        <p className="vw-label" style={{ margin: '10px 0 0', fontSize: 11.5 }}>{ev.resolved?.template.name ?? 'No template'} · {draft.phases.length} phase{draft.phases.length === 1 ? '' : 's'}</p>
      </>}
    </aside>
  );
}
