/* buildReviewDoc: the plan's review document (model.ts), filled ONCE from the plan, its evaluation, the plan pack (bill of materials
   with sourcing, IP plan, basis of design, initiation, drawing sheets), the approval path, the estate baseline and, once the plan is in
   Delivery, the Delivery project. The PDF, the workbook, the ZIP package and the portal review page all render this one object.
   Rules: sentence case, numbers with units, money in the geography's formatter (planner figures are USD → `money`), no engine keys,
   no empty sections (a section with nothing for the plan type is left out and the rest renumbered). Section ids are stable (comments
   key on them); numbers are not. Sub-sections are sections of their own numbered "4.1", "4.2" (level = dots + 1). */
import type * as T from '../../../../planner/p2b/types';
import type { Evaluation, Finding, ScheduleItem, ScheduleOrder } from '../../../../planner/lib/engine';
import { WHOLE_SITE_SCOPES, withDeliveryOrders } from '../../../../planner/lib/engine';
import type { PlannerData } from '../../../../planner/lib/plannerData';
import type { SourcingContext, VendorOrder } from '../../../../planner/lib/sourcing';
import type { DeliveryProjectView } from '../../../../api/types';
import { geoNow } from '../../../../api';
import * as G from '../../../../planner/lib/governance';
import { blockers, COOLING_LABEL } from '../../../../planner/lib/wizardModel';
import { DC_TYPE_CATALOG } from '../../../../planner/p2b/dcTypes';
import { PACK_SECTIONS, SOURCE_LABEL as SOURCING_LABEL, VEHICLE_LABEL, avoidedCost, buildPack, contractByVendor, packManifest, sourcedAsBom, sourcingSplit, vendorOrders, type DrawingSheet, type PlanPackData } from '../../../../planner/lib/packModel';
import { ASPECT_LABEL, SCOPE_LABEL, SOURCE_LABEL, date, fromUsd, kw, money, num, pct } from '../../common';
import { projectOf, recordLines, usdText } from '../records';
import { familyParts, familyTitle } from './family';
import { renderSheetSvg } from './svg';
import type { Block, Cell, ReviewApprovalStep, ReviewDoc, ReviewDrawing, ReviewMeta, ReviewSection, ReviewSheet, Tone } from './model';

/* ================================================================== input */
export interface ReviewInput {
  plan: T.PlannerPlan; ev: Evaluation; template?: T.PlannerTemplate; benchmarks: T.PlannerBenchmark[]; data: PlannerData; siteName: string;
  /** Catalogue, vendors and stock: the bill of materials is sourced (site / stock / buy) when they are loaded. */
  sourcing?: SourcingContext;
  /** Orders execution recorded (Delivery's purchase orders), for an executed plan. */
  recorded?: VendorOrder[];
  /** The Delivery project once the plan is approved / executing / completed. */
  delivery?: DeliveryProjectView | null;
  /** Delivery's purchase orders in the schedule's shape (laid over the schedule like the Schedule tab does). */
  scheduleOrders?: ScheduleOrder[];
  /** The scenario the figures are for (the one under review / approved), when not the base case. */
  scenario?: T.PlannerScenario | null;
  /** Every plan (revision chain: the parent's baseline gives "changes since the previous revision"). */
  plans?: T.PlannerPlan[];
  generatedBy?: string; generatedAt?: string;
}

/* ================================================================== helpers */
const c = (text: string | number | undefined | null, tone?: Tone): Cell => ({ text: text === undefined || text === null || text === '' ? '—' : String(text), tone });
const n = (text: string | number | undefined | null, tone?: Tone): Cell => ({ ...c(text, tone), num: true });
const plural = (k: number, one: string, many = `${one}s`) => `${num(k)} ${k === 1 ? one : many}`;
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pctText = (v: number) => `${Math.round(v)}%`;
const monthYear = (iso?: string) => (iso && !Number.isNaN(new Date(iso).getTime()) ? new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—');
const isoDay = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
const usd = (v: number | undefined | null) => (v === undefined || v === null || !Number.isFinite(v) ? null : Math.round(fromUsd(v)));
const findingTone = (s: Finding['status']): Tone => (s === 'fail' ? 'bad' : s === 'warn' ? 'warn' : s === 'pass' ? 'ok' : 'neutral');
const FINDING_TEXT: Record<Finding['status'], string> = { fail: 'Fail', warn: 'Warning', pass: 'Pass', 'n/a': 'Not applicable' };
const RISK_SCORE = { Low: 1, Medium: 2, High: 3 } as const;
const DECISION_TONE: Record<T.PlannerApproval['decision'], Tone> = { Pending: 'warn', Approved: 'ok', 'Approved with conditions': 'ok', Rejected: 'bad' };
const BIND_TEXT: Record<string, string> = {
  power: 'power: usable headroom falls under 10% of installed capacity after the committed load and the reserve',
  cooling: 'cooling: installed cooling does not cover the committed load with margin',
  space: 'space: the halls planned for the phase cannot hold the committed load',
  grid: 'the grid: the phases install more IT than the grid intake can supply at the peak PUE',
  ports: 'ports: the fabric runs out of access ports before power does',
  none: 'nothing: power, cooling, space and the grid all keep headroom through every phase',
};
/** Sections are pushed with a placeholder number and numbered at the end (sub-sections follow their parent). */
interface Draft { id: string; title: string; summary?: string; blocks: Block[]; subs: { id: string; title: string; summary?: string; blocks: Block[] }[] }
const hasContent = (b: Block[]) => b.some(x => x.kind === 'para' ? !!x.text : x.kind === 'kv' ? x.rows.length > 0 : x.kind === 'table' ? x.rows.length > 0 : x.kind === 'list' ? x.items.length > 0 : x.kind === 'figures' ? x.items.length > 0 : true);
function kv(rows: ([string, string | number | undefined | null] | [string, string | number | undefined | null, string | undefined] | [string, string | number | undefined | null, string | undefined, Tone | undefined])[], columns?: 1 | 2): Block {
  return { kind: 'kv', columns, rows: rows.filter(r => r[1] !== undefined && r[1] !== null && r[1] !== '' && r[1] !== '—').map(r => ({ label: r[0], value: String(r[1]), source: r[2], tone: r[3] })) };
}
const sourceOf = (ev: Evaluation, k: string) => (ev.params[k] ? SOURCE_LABEL[ev.params[k].source] : undefined);
function pv(ev: Evaluation, k: string, unit = ''): string | undefined {
  const x = ev.params[k]?.value;
  if (x === undefined || x === '') return undefined;
  if (typeof x === 'boolean') return x ? 'Yes' : 'No';
  return `${typeof x === 'number' ? num(x, 2) : String(x)}${unit}`;
}

/* ================================================================== the document */
export function buildReviewDoc(i: ReviewInput): ReviewDoc {
  const { plan, ev, template, benchmarks, siteName } = i;
  const s = ev.sizing, e = ev.estimate;
  const geo = geoNow();
  const pack = buildPack(plan, ev, template, benchmarks, siteName, i.sourcing);
  const generatedAt = i.generatedAt ?? new Date().toISOString();
  const rev = plan.revision ?? 'A';
  const docNumber = `${plan.plnId}-${rev}-RP`;
  const bom0Total = pack.sourced?.total ?? pack.bom.total;
  const sched: ScheduleItem[] = i.scheduleOrders?.length ? withDeliveryOrders(ev.schedule, i.scheduleOrders, plan.phases.map(p => p.name)) : ev.schedule;
  const late = sched.filter(x => x.late);
  const fails = ev.findings.filter(f => f.status === 'fail'), warns = ev.findings.filter(f => f.status === 'warn');
  const openConds = (plan.conditions ?? []).filter(x => x.status === 'Open');
  const blockingConds = G.openBlockingConditions(plan);
  const submitBlockers = ['Draft', 'Rejected'].includes(plan.status) ? blockers(plan, ev, template, i.data).filter(b => b.level === 'bad') : [];
  const scenarioName = i.scenario?.name;

  /* ---------------------------------------------------------------- drawings (shared by figures and Appendix A) */
  const discipline: Record<string, string> = { A: 'Architectural', E: 'Electrical', M: 'Mechanical', N: 'Network', G: 'General' };
  const drawings: ReviewDrawing[] = pack.sheets.map(sh => drawingOf(sh, plan, ev, rev, discipline));
  const fig = (kind: string, caption?: string): Block[] => { const d = drawings.find(x => x.id === kind); return d ? [{ kind: 'figure', drawingId: d.id, caption: caption ?? `${d.number} ${d.title}` }] : []; };

  /* ---------------------------------------------------------------- approvals */
  const amount = G.approvalAmount(ev);
  const path = plan.approvals.length ? G.orderedSteps(plan.approvals) : G.buildApprovalPath(template, amount.amountUsd, amount.itUsd).approvals;
  const submitted = plan.approvals.length > 0;
  const holders = (role: string) => G.peopleWithRole(role).filter(p => p.name !== plan.requestedBy && p.name !== plan.submittedBy).map(p => p.name);
  const approvals: ReviewApprovalStep[] = path.map((a, k) => ({
    step: k + 1, role: `${a.step}${a.role && a.role !== a.step ? ` (${a.role})` : ''}`,
    approver: a.person ? `${a.person}${a.onBehalfOf ? ` for ${a.onBehalfOf}` : ''}` : holders(a.role).join(' or ') || undefined,
    decision: submitted ? a.decision : 'Not submitted', at: a.at ? date(a.at) : undefined,
    comment: a.reason ?? (a.decision === 'Pending' && a.basis ? noRuleIds(usdText(a.basis.split(';')[0])) : undefined),
    conditions: a.conditions ? a.conditions.split(/;\s*/).filter(Boolean) : undefined,
  }));
  const next = G.nextPendingStep(plan);

  /* ---------------------------------------------------------------- verdict + headline */
  const verdict: ReviewMeta['verdict'] = fails.length
    ? { tone: 'bad', text: `Blocked: ${plural(fails.length, 'hard rule')} fail${fails.length === 1 ? 's' : ''}: ${fails.slice(0, 3).map(f => `${lowerFirst(f.rule.title)} (${f.rule.id})`).join('; ')}${fails.length > 3 ? `; and ${fails.length - 3} more` : ''}. ${fails.length === 1 && fails[0].detail.length < 160 ? `${usdText(fails[0].detail).replace(/\.$/, '')}. ` : 'Section "Rule checks" gives each finding. '}Fix before approval.` }
    : blockingConds.length ? { tone: 'bad', text: `Blocked for the build: ${plural(blockingConds.length, 'approval condition')} must be closed (${blockingConds.map(x => x.text).slice(0, 2).join('; ')}).` }
    : submitBlockers.length ? { tone: 'bad', text: `Not ready to submit: ${submitBlockers.slice(0, 3).map(b => b.text).join('; ')}.` }
    : warns.length || late.length || openConds.length ? { tone: 'warn', text: `Ready with conditions: ${[warns.length ? plural(warns.length, 'soft rule warning') : '', late.length ? `${plural(late.length, 'item')} late against the needed-by date` : '', openConds.length ? plural(openConds.length, 'open condition') : ''].filter(Boolean).join(', ')}. Acknowledge them in the decision.` }
    : { tone: 'ok', text: 'Ready: every rule passes, nothing is late and no condition is open.' };
  const statusLine = plan.status === 'In review' && next ? `In review: waiting for ${next.step}` : plan.status;
  const headline: ReviewMeta['headline'] = [
    { label: 'IT capacity', value: kw(s.itKw), sub: s.racks ? `${num(s.racks)} racks${s.halls ? ` · ${plural(s.halls, 'hall')}` : ''}` : e.capacityEnabledKw ? `${kw(e.capacityEnabledKw)} made usable` : 'no new racks' },
    { label: 'CapEx', value: money(plan.baseline?.capexTotal ?? e.capexTotal), sub: plan.baseline ? 'approved baseline' : e.capexPerKw ? `${money(e.capexPerKw)} per kW` : undefined },
    { label: 'OpEx a month', value: money(e.opexMonthly), sub: `PUE ${s.pue.value}` },
    { label: 'Payback', value: e.paybackMonths == null ? 'None' : `${e.paybackMonths} months`, sub: e.npvUsd !== undefined ? `NPV ${money(e.npvUsd)}${e.irrPct != null ? ` · IRR ${e.irrPct}%` : ''}` : undefined, tone: e.paybackMonths == null || e.paybackMonths > 96 ? 'warn' : undefined },
    { label: 'Go-live', value: date(plan.targetGoLive), sub: late.length ? `${plural(late.length, 'item')} late` : 'orders on time', tone: late.length ? 'bad' : undefined },
    { label: 'Readiness', value: pct(ev.readinessPct), sub: ev.defaultsCount ? `${num(ev.defaultsCount)} inputs on defaults` : 'inputs confirmed', tone: ev.readinessPct < 50 ? 'warn' : undefined },
    { label: 'Rule checks', value: fails.length ? `${fails.length} fail` : warns.length ? `${warns.length} warning${warns.length === 1 ? '' : 's'}` : 'All pass', sub: `${num(ev.findings.filter(f => f.status !== 'n/a').length)} checked`, tone: fails.length ? 'bad' : warns.length ? 'warn' : 'ok' },
  ];

  const meta: ReviewMeta = {
    plnId: plan.plnId, title: plan.title, revision: rev, status: statusLine, scopeLabel: template?.name ?? SCOPE_LABEL[plan.scope], site: siteName,
    owner: plan.ownerName, requestedBy: plan.requestedBy, neededBy: date(plan.targetGoLive), generatedAt, generatedBy: i.generatedBy ?? plan.ownerName,
    currency: geo.currency.code, geography: geo.id === 'us' ? 'United States' : 'India', templateName: template?.name, templateVersion: template ? `v${template.version}` : undefined,
    docNumber, headline, verdict,
  };

  /* ---------------------------------------------------------------- sections */
  const out: Draft[] = [];
  const sec = (id: string, title: string, blocks: Block[], summary?: string) => { const d: Draft = { id, title, summary, blocks, subs: [] }; out.push(d); return d; };
  const sub = (d: Draft, id: string, title: string, blocks: Block[], summary?: string) => { if (hasContent(blocks)) d.subs.push({ id: `${d.id}.${id}`, title, summary, blocks }); };

  /* 1 approval sheet */
  {
    const d = sec('approval', 'Approval sheet', [], 'Who decides, in what order, and what this round asks of them.');
    const round = G.currentRound(plan);
    d.blocks.push(kv([
      ['Approval round', submitted ? `Round ${round}${plan.status === 'In review' ? ', open' : ''}` : 'Not submitted yet: the path below is the one submission creates'],
      ['Submitted', plan.submittedAt ? `${date(plan.submittedAt)} by ${plan.submittedBy ?? plan.requestedBy}` : undefined],
      ['Routed on', `${money(plan.approvalAmountUsd ?? amount.amountUsd)} CapEx${amount.itUsd ? ` incl. ${money(amount.itUsd)} owned IT` : ''}`],
      ['Authority band', noRuleIds(usdText(plan.approvalBand ?? G.bandLabel(G.bandFor(amount.amountUsd))))],
      ['Scenario under review', scenarioName ?? 'Base case'],
      ['Next decision', plan.status === 'In review' && next ? `${next.step} (${next.role})` : undefined],
    ], 2));
    d.blocks.push({ kind: 'table', title: 'Approval path', columns: [{ label: 'Step', num: true, width: 6 }, { label: 'Role', width: 22 }, { label: 'Approver', width: 20 }, { label: 'Decision', width: 14 }, { label: 'Date', width: 11 }, { label: 'Comment and conditions', width: 27 }],
      rows: approvals.map(a => [n(a.step), c(a.role), c(a.approver ?? 'Not assigned'), c(a.decision, submitted ? DECISION_TONE[a.decision as T.PlannerApproval['decision']] : 'neutral'), c(a.at), c([a.comment, ...(a.conditions ?? []).map(x => `Condition: ${x}`)].filter(Boolean).join(' · ') || undefined)]),
      note: 'Steps are decided in order. The requester cannot approve, and one person decides at most one step in a round.' });
    d.blocks.push({ kind: 'callout', tone: 'info', title: 'Decision asked of the reviewer', text: askText(plan, ev, scenarioName) });
    d.blocks.push({ kind: 'table', title: 'Sign-off', columns: [{ label: 'Step', width: 24 }, { label: 'Name', width: 22 }, { label: 'Decision', width: 18 }, { label: 'Signature', width: 22 }, { label: 'Date', width: 14 }],
      rows: approvals.map(a => [c(a.role), c(a.decision === 'Pending' || a.decision === 'Not submitted' ? ' ' : a.approver), c(a.decision === 'Pending' || a.decision === 'Not submitted' ? 'Approve / approve with conditions / reject' : a.decision), c(' '), c(a.decision === 'Pending' || a.decision === 'Not submitted' ? ' ' : a.at)]) });
    const conds = plan.conditions ?? [];
    if (conds.length) d.blocks.push({ kind: 'table', title: 'Conditions of approval', columns: [{ label: 'Condition' }, { label: 'Owner' }, { label: 'Due' }, { label: 'Blocks the build' }, { label: 'Status' }],
      rows: conds.map(x => [c(x.text), c(x.owner), c(date(x.dueDate)), c(x.blocksExecution ? 'Yes' : 'No'), c(x.status === 'Closed' ? `Closed ${date(x.closedAt)}${x.evidence ? `: ${x.evidence}` : ''}` : 'Open', x.status === 'Closed' ? 'ok' : x.blocksExecution ? 'bad' : 'warn')]) });
    const changes = changesSince(i);
    if (changes.length) d.blocks.push({ kind: 'list', items: changes });
    const rounds = plan.approvalHistory ?? [];
    if (rounds.length) d.blocks.push({ kind: 'table', title: 'Earlier approval rounds', columns: [{ label: 'Round', num: true }, { label: 'Submitted' }, { label: 'Outcome' }, { label: 'Decisions' }],
      rows: rounds.map(r => [n(r.round), c(`${date(r.submittedAt)} by ${r.submittedBy}`), c(r.outcome, r.outcome === 'Approved' ? 'ok' : r.outcome === 'Rejected' ? 'bad' : 'neutral'), c(r.approvals.map(a => `${a.step}: ${a.decision}${a.person ? ` (${a.person})` : ''}${a.reason ? ` · ${a.reason}` : ''}`).join('; '))]) });
  }

  /* 2 executive summary */
  {
    const where = plan.dataCenterId ? `at ${siteName}` : plan.newSiteName ? `on a new site, ${plan.newSiteName}` : `in ${siteName}`;
    const what = `${sentence(SCOPE_LABEL[plan.scope].toLowerCase())} ${where}: ${kw(s.itKw)} of IT${s.racks ? ` in ${num(s.racks)} racks` : ''}${s.halls ? ` across ${plural(s.halls, 'hall')}` : ''}${plan.phases.length > 1 ? `, in ${plan.phases.length} phases` : ''}, live by ${monthYear(plan.targetGoLive)}.`;
    const binding = ev.ladder.find(l => l.bindingConstraint !== 'none');
    const why = ev.ctx.site ? `${ev.ctx.site.dc.name} can take ${kw(Math.max(0, ev.ctx.site.headroomItKw))} more IT today${ev.ctx.site.binding ? ` (${ev.ctx.site.binding.label.toLowerCase()} binds)` : ''}; live IT load is ${kw(ev.ctx.site.itLoadKw)} with ${kw(ev.ctx.site.reservedKw)} held.` : '';
    const risks = [...plan.risks].sort((a, b) => RISK_SCORE[b.probability] * RISK_SCORE[b.impact] - RISK_SCORE[a.probability] * RISK_SCORE[a.impact]).slice(0, 4);
    const d = sec('summary', 'Executive summary', [
      ...(plan.intent ? [{ kind: 'para' as const, text: usdText(plan.intent) }] : []),
      { kind: 'para', text: `What is built and where: ${what}` },
      ...(why ? [{ kind: 'para' as const, text: `Why now: ${why} Demand grows ${plan.demand.growthPctPerYear}% a year; ${binding ? `the binding constraint is ${BIND_TEXT[binding.bindingConstraint]} (from ${binding.phase.name}).` : 'nothing binds through the phases.'}` }] : binding ? [{ kind: 'para' as const, text: `Capacity: the binding constraint is ${BIND_TEXT[binding.bindingConstraint]} (from ${binding.phase.name}).` }] : []),
      { kind: 'figures', items: headline },
      { kind: 'callout', tone: verdict.tone, title: verdict.tone === 'ok' ? 'Ready for decision' : verdict.tone === 'warn' ? 'Ready with conditions' : 'Not ready', text: verdict.text },
      ...(risks.length ? [{ kind: 'table' as const, title: 'Top risks', columns: [{ label: 'Risk' }, { label: 'Probability' }, { label: 'Impact' }, { label: 'Mitigation' }, { label: 'Owner' }], rows: risks.map(r => [c(r.title), c(r.probability, r.probability === 'High' ? 'bad' : r.probability === 'Medium' ? 'warn' : undefined), c(r.impact, r.impact === 'High' ? 'bad' : r.impact === 'Medium' ? 'warn' : undefined), c(usdText((r as { mitigation?: string }).mitigation ?? '')), c(r.owner)]) }] : []),
      { kind: 'callout', tone: 'info', title: 'Decision asked', text: askText(plan, ev, scenarioName) },
    ]);
    void d;
  }

  /* 3 scope and requirements */
  {
    const profile = DC_TYPE_CATALOG.find(p => p.key === plan.dcTypeKey);
    const d = sec('scope', 'Scope and requirements', []);
    sub(d, 'requirements', 'Requirements', [kv([
      ['Plan type', template?.name ?? SCOPE_LABEL[plan.scope]], ['Kind of site', profile?.name], ['IT capacity', kw(s.itKw)],
      ['Workload mix', `${plan.demand.gpuPct}% GPU, ${plan.demand.computePct}% compute, ${plan.demand.storagePct}% storage`],
      ['Tenancy', plan.demand.tenancy === 'multi' ? 'Multi-tenant' : 'Single tenant'], ['Growth', `${plan.demand.growthPctPerYear}% a year`],
      ['Tier', pv(ev, 'tier'), sourceOf(ev, 'tier')], ['Climate', sentence(plan.climate.replace('-', ' '))], ['Needed by', date(plan.targetGoLive)],
      ['Requested by', plan.requestedBy], ['Owner', plan.ownerName],
    ], 2)]);
    const site = ev.ctx.site;
    if (site) sub(d, 'site', `Site and baseline: ${site.dc.name}`, [
      kv([['Live IT load', kw(site.itLoadKw)], ['Rack draw', kw(site.rackDrawKw)], ['Racks', `${num(site.activeRacks)} active of ${num(site.racks)}`], ['Holds', `${kw(site.reservedKw)} (${plural(site.holds.length, 'hold')})`],
        ['Approved plans not yet held', site.pipelineKw ? `${kw(site.pipelineKw)} (${site.pipeline.map(x => x.plnId).join(', ')})` : 'None'], ['IT headroom today', kw(Math.max(0, site.headroomItKw)), undefined, site.headroomItKw > 0 ? undefined : 'bad'],
        ['Binding stage', site.binding?.label], ['Site PUE', `${site.pue} (${site.pueSource})`], ['Free rack positions', num(site.halls.reduce((a, h) => a + h.freePositions, 0))], ['Cooling headroom', kw(site.cooling.headroomKw)]], 2),
      { kind: 'table', title: 'Power chain today', columns: [{ label: 'Stage' }, { label: 'Redundancy' }, { label: 'Usable', num: true }, { label: 'Load', num: true }, { label: 'IT headroom', num: true }],
        rows: site.stages.map(st => [c(st.label), c(st.redundancy), n(kw(st.usableKw)), n(kw(st.loadKw)), n(st.headroomItKw < 0 ? `${kw(-st.headroomItKw)} short` : kw(st.headroomItKw), st.headroomItKw <= 0 ? 'bad' : undefined)]) },
      ...(site.holds.length ? [{ kind: 'table' as const, title: 'Capacity held at the site', columns: [{ label: 'Hold' }, { label: 'State' }, { label: 'IT', num: true }, { label: 'Expires' }], rows: mergeHolds(site.holds).slice(0, 25).map(h => [c(h.label), c(h.state), n(kw(h.kw)), c(date(h.expiresAt))]), note: mergeHolds(site.holds).length > 25 ? `The first 25 of ${mergeHolds(site.holds).length} holds.` : undefined }] : []),
      ...(site.warnings.length ? [{ kind: 'callout' as const, tone: 'warn' as Tone, title: 'Site data notes', text: site.warnings.join(' ') }] : []),
    ]);
    if (ev.ctx.peerSite) sub(d, 'peer', `Other end: ${ev.ctx.peerSite.dc.name}`, [kv([['Live IT load', kw(ev.ctx.peerSite.itLoadKw)], ['IT headroom today', kw(Math.max(0, ev.ctx.peerSite.headroomItKw))], ['Binding stage', ev.ctx.peerSite.binding?.label]], 2)]);
    const phases = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
    if (phases.length) sub(d, 'phases', 'Phases', [{ kind: 'table', columns: [{ label: 'Phase' }, { label: 'Go-live' }, { label: 'IT', num: true }, { label: 'Racks', num: true }, { label: 'Halls', num: true }, { label: 'Status' }],
      rows: phases.map(p => { const pd = s.phaseDesign?.find(x => x.phaseId === p.id); return [c(p.name), c(date(p.goLive)), n(kw(p.itKw)), n(num(pd?.racks ?? p.racks)), n(num(pd?.halls ?? p.halls)), c(p.status)]; }),
      total: [c('Total'), c(''), n(kw(phases.reduce((a, p) => a + p.itKw, 0))), n(num(phases.reduce((a, p) => a + (s.phaseDesign?.find(x => x.phaseId === p.id)?.racks ?? p.racks), 0))), n(num(phases.reduce((a, p) => a + (s.phaseDesign?.find(x => x.phaseId === p.id)?.halls ?? p.halls), 0))), c('')] }]);
    const departures = Object.entries(ev.params).filter(([k, v]) => (v.source === 'user' || v.source === 'ai' || v.source === 'document') && ev.resolved?.params.find(p => p.key === k)?.default !== v.value);
    if (departures.length) sub(d, 'departures', 'Inputs changed from the template', [{ kind: 'table', columns: [{ label: 'Input' }, { label: 'Value', num: true }, { label: 'Template default', num: true }, { label: 'Set by' }],
      rows: departures.map(([k, v]) => { const def = ev.resolved?.params.find(p => p.key === k); return [c(def?.label ?? labelOfKey(k)), n(fmtParam(v.value, def?.unit)), n(def?.default !== undefined ? fmtParam(def.default, def.unit) : '—'), c(SOURCE_LABEL[v.source])]; }),
      note: 'Approvers read these first: every input whose value is not the template default.' }]);
  }

  /* 4 design basis */
  {
    const d = sec('design', 'Design basis', [], 'How the plan is sized, from the requirements and the template, with the drawings that show it.');
    const bod = pack.bod.map(b => ({ ...b, text: b.text && usdText(b.text), rows: b.rows.map(r => ({ ...r, value: usdText(r.value) })) }));
    const bodRows = (id: string) => bod.find(b => b.id === id);
    const bodKv = (id: string) => { const b = bodRows(id); return b ? kv(b.rows.map(r => [r.label, r.value, r.source] as [string, string, string | undefined])) : undefined; };
    // building and space
    const space = bodKv('space');
    if (space || drawings.some(x => x.id === 'building' || x.id === 'hall' || x.id === 'hall-grid')) sub(d, 'space', 'Space and building', [...(space ? [space] : []), ...fig('building'), ...fig('hall'), ...fig('hall-grid'), ...fig('rack-elevation')]);
    // power chain
    if (s.power?.length || s.plant.length) sub(d, 'power', `Power chain at ${pv(ev, 'redundancy') ?? 'its redundancy'}`, [
      ...(s.facility ? [kv([['IT load', kw(s.itKw)], ['Design PUE', `${s.pue.value}${s.facility ? `, peak ${s.facility.peakPue} on the design day` : ''}`], ['Facility load', kw(s.facility.facilityKw)], ['Apparent power', s.facility.mva >= 1 ? `${s.facility.mva} MVA` : `${num(s.facility.kva)} kVA`], ['Power factor', String(s.facility.powerFactor)], ['UPS runtime', pv(ev, 'upsRuntimeMin', ' min'), sourceOf(ev, 'upsRuntimeMin')], ['Fuel on site', pv(ev, 'generatorFuelHours', ' h'), sourceOf(ev, 'generatorFuelHours')]], 2)] : []),
      ...(s.power?.length ? [{ kind: 'table' as const, title: 'Power chain checked at redundancy', columns: [{ label: 'Stage' }, { label: 'Redundancy' }, { label: 'Units' }, { label: 'Usable at redundancy', num: true }, { label: 'Must carry', num: true }, { label: 'Check' }, { label: 'Basis' }],
        rows: s.power.map(p => [c(p.label), c(p.redundancy), c(`${p.count} × ${p.unit}`), n(kw(p.usableKw)), n(kw(p.needKw)), c(p.ok ? 'Pass' : 'Short', p.ok ? 'ok' : 'bad'), c(usdText(p.basis))]) }] : []),
      ...(s.plant.length ? [{ kind: 'table' as const, title: 'Plant', columns: [{ label: 'Item' }, { label: 'Unit rating', num: true }, { label: 'Count', num: true }, { label: 'Per path', num: true }, { label: 'Installed', num: true }, { label: 'Redundancy' }],
        rows: s.plant.map(p => [c([p.name, p.model, p.note].filter(Boolean).join(' · ')), n(p.unitKva ? `${num(p.unitKva)} kVA` : kw(p.capacityKw)), n(num(p.count)), n(p.perPath !== undefined ? num(p.perPath) : '—'), n(kw(p.capacityKw * p.count)), c(p.redundancy)]) }] : []),
      ...fig('single-line'), ...fig('plant-as-is'), ...fig('plant-to-be'), ...fig('hall-mep'),
    ]);
    // cooling
    const hr = s.cooling.heatRejection;
    if (s.cooling.capacityKw > 0 || s.cooling.units > 0) sub(d, 'cooling', 'Cooling and heat rejection', [kv([
      ['Cooling type', COOLING_LABEL[s.cooling.type as T.PlannerCoolingType] ?? sentence(s.cooling.type), sourceOf(ev, 'coolingType')],
      ['CDUs', s.cooling.cdu ? `${s.cooling.cdu.units} × ${kw(s.cooling.cdu.unitKw)} (${s.cooling.cdu.perHall} per hall)` : undefined],
      [s.cooling.air.label, s.cooling.air.units ? `${s.cooling.air.units} × ${kw(s.cooling.air.unitKw)}` : undefined],
      ['Heat to liquid / air', `${kw(s.cooling.liquidKw)} / ${kw(s.cooling.airKw)}`], ['Redundancy', pv(ev, 'coolingRedundancy') ?? s.cooling.redundancy, sourceOf(ev, 'coolingRedundancy')],
      ['Inlet setpoint', pv(ev, 'inletSetpointC', ' °C'), sourceOf(ev, 'inletSetpointC')], ['Design day', `${hr.designDryBulbC} °C dry bulb, ${hr.designWetBulbC} °C wet bulb`, hr.source],
      ...hr.streams.map(st => [st.label, `${kw(st.heatKw)} at ${st.loopC} °C to ${st.method}${st.trimPct ? `, ${st.trimPct}% mechanical on the design day` : ''}`] as [string, string]),
      [hr.coolers?.kind === 'adiabatic cooler' ? 'Adiabatic coolers' : 'Dry coolers', hr.coolers ? `${hr.coolers.units} × ${kw(hr.coolers.unitKw)}` : undefined],
      ['Chillers', hr.chillers ? `${hr.chillers.units} × ${kw(hr.chillers.unitKw)} for ${kw(hr.chillers.trimKw)}` : undefined], ['PUE', String(s.pue.value), SOURCE_LABEL[s.pue.source]],
    ]), ...fig('liquid')]);
    // network
    if (s.network.leaves || s.network.carriers || s.network.dciGbps) sub(d, 'network', 'Network', [kv([
      ['Leaves / spines / cores', `${s.network.leaves} / ${s.network.spines} / ${s.network.cores}`], ['Uplinks', `${num(s.network.uplinks)} × ${s.network.uplinkGbps} Gbps`], ['Access ports', num(s.network.accessPorts)],
      ['Racks per leaf pair', pv(ev, 'racksPerLeafPair'), sourceOf(ev, 'racksPerLeafPair')], ['Oversubscription', pv(ev, 'oversubscription', ':1'), sourceOf(ev, 'oversubscription')],
      ['Carriers', String(s.network.carriers)], ['WAN and interconnect', s.network.dciGbps ? `${num(s.network.dciGbps)} Gbps` : undefined, s.network.dciSource],
    ]), ...fig('topology'), ...fig('dci-paths')]);
    // rack classes
    if (s.rackClasses.length) sub(d, 'racks', 'Rack classes', [{ kind: 'table', columns: [{ label: 'Class' }, { label: 'Racks', num: true }, { label: 'kW per rack', num: true }, { label: 'Load', num: true }, { label: 'Share', num: true }, { label: 'Cooling' }],
      rows: s.rackClasses.map(k => [c(k.name), n(num(k.racks)), n(num(k.kw, 1)), n(kw(k.kw * k.racks)), n(pctText(k.sharePct)), c(k.liquid ? `Liquid to chip, ${k.capturePct}% to water` : k.rearDoor ? 'Rear-door heat exchanger' : 'Air')]),
      total: [c('Total'), n(num(s.rackClasses.reduce((a, k) => a + k.racks, 0))), c(''), n(kw(s.rackClasses.reduce((a, k) => a + k.racks * k.kw, 0))), c(''), c('')] }]);
    // fire, security, sustainability, operations
    const fire = bodKv('firesec'); if (fire) sub(d, 'fire', 'Fire, life safety and security', [fire]);
    const sus = bodKv('sustainability'); if (sus) sub(d, 'sustainability', 'Sustainability', [sus]);
    if (s.staffing.fte > 0 || s.spares.lines > 0) sub(d, 'operations', 'Operations, staffing and spares', [
      kv([['Operations staff', `${num(s.staffing.fte, 1)} FTE, ${s.staffing.shifts} shifts`, SOURCE_LABEL[s.staffing.source]], ['Per MW', `${s.staffing.perMw} FTE`], ['How', s.staffing.basis], ['Spares', `${plural(s.spares.lines, 'line')}, ${money(s.spares.valueUsd)}`], ['Spares held', pv(ev, 'sparesPct', '%'), sourceOf(ev, 'sparesPct')]]),
      ...((s.staffing.plan ?? []).length ? [{ kind: 'table' as const, title: 'Staffing by phase', columns: [{ label: 'Phase' }, { label: 'Seats', num: true }, { label: 'FTE', num: true }, { label: 'Key hires by' }, { label: 'Technicians by' }], rows: s.staffing.plan!.map(x => [c(x.name), n(x.seats), n(num(x.fte, 1)), c(monthYear(x.keyHireBy)), c(monthYear(x.techHireBy))]) }] : []),
    ]);
    if ((s.phaseDesign ?? []).length > 1) sub(d, 'phase-design', 'Phases as design units', [{ kind: 'table', columns: [{ label: 'Phase' }, { label: 'Go-live' }, { label: 'IT', num: true }, { label: 'Density', num: true }, { label: 'Cooling' }, { label: 'Racks', num: true }, { label: 'Halls', num: true }, { label: 'Phase record' }],
      rows: s.phaseDesign!.map(ph => [c(ph.name), c(monthYear(ph.goLive)), n(kw(ph.itKw)), n(`${ph.density} kW`), c(COOLING_LABEL[ph.coolingType] ?? ph.coolingType), n(num(ph.racks)), n(ph.halls), c(ph.mismatch ? `Says ${ph.storedRacks} racks, ${ph.storedHalls} halls` : 'Agrees', ph.mismatch ? 'warn' : undefined)]) }]);
    if ((s.warnings ?? []).length) d.blocks.push({ kind: 'callout', tone: 'warn', title: 'Design notes', text: s.warnings!.map(usdText).join(' ') });
  }

  /* the family's own analysis (what the plan pack's family sections show) */
  const fam = familyParts(plan, ev, i.data, template, benchmarks);
  if (fam.parts.length) {
    const d = sec('analysis', familyTitle(plan.scope), [], 'The plan type\'s own analysis of the site, as the plan pack shows it.');
    for (const p of fam.parts) sub(d, p.id, p.title, p.blocks, p.summary);
  }

  /* 5 capacity */
  if (ev.ladder.length || ev.ctx.site) {
    const b = ev.bindingConstraint; const binding = ev.ladder.find(l => l.bindingConstraint !== 'none');
    const head = (v: number | undefined, inst: number): Cell => (v === undefined ? n('—') : n(v < 0 ? `${kw(-v)} short` : kw(v), v < inst * 0.1 ? 'bad' : undefined));
    sec('capacity', 'Capacity', [
      ...(ev.ladder.length ? [
        kv([['Reserve policy', pv(ev, 'reservePct', '%'), sourceOf(ev, 'reservePct')], ['Demand growth', `${plan.demand.growthPctPerYear}% a year`], ['Committed load', ev.ladder[0]?.committedBasis ? usdText(ev.ladder[0].committedBasis) : undefined]]),
        { kind: 'callout' as const, tone: (b === 'none' ? 'ok' : b === 'space' || b === 'ports' ? 'warn' : 'bad') as Tone, title: b === 'none' ? 'Nothing binds' : `Binding constraint: ${b}${binding ? ` (from ${binding.phase.name})` : ''}`,
          text: `${sentence(BIND_TEXT[b])}.${binding ? ` At ${binding.phase.name}: ${kw(binding.installedKw)} installed, ${kw(binding.committedKw)} committed, ${kw(binding.reserveKw)} reserve, ${kw(binding.headroomKw)} usable headroom${binding.crossesWarningMonth !== undefined ? `; at ${plan.demand.growthPctPerYear}% growth the 85% warning threshold is crossed about ${binding.crossesWarningMonth} months from now` : ''}.` : ''}` },
        { kind: 'table' as const, title: 'Capacity ladder and headroom by dimension (IT kW)', columns: [{ label: 'Phase' }, { label: 'Go-live' }, { label: 'Installed', num: true }, { label: 'Committed', num: true }, { label: 'Reserve', num: true }, { label: 'Power', num: true }, { label: 'Cooling', num: true }, { label: 'Space', num: true }, { label: 'Grid', num: true }, { label: 'Binds' }],
          rows: ev.ladder.map(r => [c(r.phase.name), c(date(r.phase.goLive)), n(kw(r.installedKw)), n(kw(r.committedKw)), n(kw(r.reserveKw)), head(r.headrooms?.power, r.installedKw), head(r.headrooms?.cooling, r.installedKw), head(r.headrooms?.space, r.installedKw), head(r.headrooms?.grid, r.installedKw), c(r.bindingConstraint === 'none' ? 'Nothing' : sentence(r.bindingConstraint), r.bindingConstraint === 'none' ? 'ok' : 'warn')]),
          note: 'Headroom left in each dimension after the committed load and the reserve; flagged when under 10% of installed capacity.' },
        ...fig('phasing'),
      ] : []),
    ], 'Installed capacity as each phase goes live against what is committed, the reserve and the headroom left.');
  }

  /* 6 cost and business case */
  {
    const d = sec('cost', 'Cost and business case', [], `CapEx ${money(e.capexTotal)}, OpEx ${money(e.opexMonthly)} a month${e.npvUsd !== undefined ? `, NPV ${money(e.npvUsd)}` : ''}.`);
    const hurdle = e.discountPct ?? 8; const band = e.benchmarkBand;
    const inBand = band ? e.capexPerKw >= band.low * 0.8 && e.capexPerKw <= band.high * 1.05 : undefined;
    d.blocks.push({ kind: 'figures', items: [
      { label: 'CapEx', value: money(e.capexTotal), sub: e.capexPerRack ? `${money(e.capexPerRack)} per rack all-in` : e.basis === 'bottom-up' ? 'priced bottom-up from the bill' : 'from the benchmarks' },
      { label: 'Fit-out per kW', value: e.capexPerKw ? money(e.capexPerKw) : '—', sub: band ? `benchmark ${money(band.low)} to ${money(band.high)}` : 'no benchmark for this plan type', tone: inBand === false ? 'warn' : undefined },
      { label: 'Contingency', value: money(e.contingencyUsd ?? 0), sub: 'its own line, on the works' },
      { label: 'OpEx a month', value: money(e.opexMonthly), sub: `${money(e.opexAnnual)} a year at steady state` },
      { label: 'NPV', value: e.npvUsd === undefined ? '—' : money(e.npvUsd), sub: `at a ${hurdle}% hurdle rate`, tone: e.npvUsd === undefined ? undefined : e.npvUsd >= 0 ? 'ok' : 'bad' },
      { label: 'IRR', value: e.irrPct == null ? '—' : `${e.irrPct}%`, sub: e.irrPct == null ? 'the cash flow never turns positive' : e.irrPct >= hurdle ? 'above the hurdle rate' : 'below the hurdle rate', tone: e.irrPct == null ? 'warn' : e.irrPct >= hurdle ? 'ok' : 'warn' },
      { label: 'Payback', value: e.paybackMonths == null ? 'None' : `${e.paybackMonths} months`, sub: e.paybackFacilityMonths !== undefined ? `facility only: ${e.paybackFacilityMonths === null ? 'none' : `${e.paybackFacilityMonths} months`}` : undefined, tone: e.paybackMonths == null || e.paybackMonths > 96 ? 'warn' : undefined },
      { label: 'Depreciation', value: money(e.depreciationAnnual ?? 0), sub: 'a year once every phase is live' },
    ] });
    if (plan.baseline) d.blocks.push({ kind: 'callout', tone: 'info', title: 'Approved baseline', text: `${money(plan.baseline.capexTotal)} CapEx and ${money(plan.baseline.opexMonthly)} OpEx a month, frozen ${date(plan.baseline.at)} on ${plan.baseline.scenarioName ?? 'the base case'}. The figures in this document are the live evaluation.` });
    if ((e.notes ?? []).length) d.blocks.push({ kind: 'callout', tone: 'warn', title: 'Read with the figures', text: e.notes!.map(usdText).join(' ') });
    const byItem = (lines: { item: string; amount: number; basis: string; source: T.PlannerParamSource }[] | undefined) => { const m = new Map<string, { item: string; amount: number; basis: string; source: T.PlannerParamSource; parts: number }>(); for (const l of lines ?? []) { const r = m.get(l.item); if (r) { r.amount += l.amount; r.parts++; } else m.set(l.item, { ...l, parts: 1 }); } return [...m.values()].sort((a, b) => b.amount - a.amount); };
    const capex = byItem(e.capex), opex = byItem(e.opex), ben = byItem(e.benefitLines);
    const lineTable = (title: string, rows: ReturnType<typeof byItem>, total: number, unit = ''): Block => ({ kind: 'table', title, columns: [{ label: 'Line', width: 34 }, { label: 'Basis', width: 38 }, { label: 'Source', width: 12 }, { label: `Amount${unit}`, num: true, width: 10 }, { label: 'Share', num: true, width: 6 }],
      rows: rows.map(r => [c(r.item), c(usdText(r.basis) + (r.parts > 1 ? ` (${r.parts} lines)` : '')), c(SOURCE_LABEL[r.source]), n(money(r.amount)), n(total ? pctText((r.amount / total) * 100) : '—')]), total: [c('Total'), c(''), c(''), n(money(total)), n('100%')] });
    if (capex.length) sub(d, 'capex', 'CapEx by line', [lineTable('CapEx by line', capex, e.capexTotal)]);
    if (opex.length) sub(d, 'opex', 'OpEx by line', [lineTable('OpEx by line, a year', opex, e.opexAnnual), { kind: 'para', text: `${num(e.energyMwhYear)} MWh a year at PUE ${s.pue.value}; ${num(ev.sustainability.carbonTYear)} t CO2 a year with ${ev.sustainability.renewableSharePct}% renewables.` }]);
    if (ben.length) sub(d, 'benefits', 'Benefits a year', [lineTable('Benefits a year', ben, e.benefitAnnual ?? 0)]);
    const cf = e.cashflow ?? [];
    if (cf.length) {
      const hasDep = cf.some(y => y.depreciation), hasTax = cf.some(y => y.tax), hasBen = cf.some(y => y.benefit);
      sub(d, 'cashflow', 'Cash flow', [
        kv([['NPV', e.npvUsd === undefined ? undefined : money(e.npvUsd)], ['IRR', e.irrPct == null ? 'None: the cash flow never turns positive' : `${e.irrPct}%`], ['Hurdle rate', `${hurdle}%`], ['Payback', e.paybackMonths == null ? 'None' : `${e.paybackMonths} months`], ['Facility-only payback', e.paybackFacilityMonths === undefined ? undefined : e.paybackFacilityMonths === null ? 'None' : `${e.paybackFacilityMonths} months`], ['Basis', usdText(e.paybackBasis)]], 2),
        { kind: 'table', title: 'Cash flow by year', columns: [{ label: 'Year' }, { label: 'CapEx', num: true }, { label: 'Revenue', num: true }, ...(hasBen ? [{ label: 'Benefits', num: true }] : []), { label: 'OpEx', num: true }, ...(hasDep ? [{ label: 'Depreciation', num: true }] : []), ...(hasTax ? [{ label: 'Tax', num: true }] : []), { label: 'Net cash', num: true }, { label: 'Cumulative', num: true }],
          rows: cf.map(y => [c(y.label), n(money(y.capex)), n(money(y.revenue)), ...(hasBen ? [n(money(y.benefit))] : []), n(money(y.opex)), ...(hasDep ? [n(money(y.depreciation ?? 0))] : []), ...(hasTax ? [n(money(y.tax ?? 0))] : []), n(money(y.net), y.net < 0 ? 'bad' : undefined), n(money(y.cumulative), y.cumulative < 0 ? 'bad' : 'ok')]) },
      ]);
    }
    if (plan.baseline) { const b = plan.baseline; const dv = i.delivery; sub(d, 'baseline', 'Approved baseline, now and actual', [{ kind: 'table', columns: [{ label: 'Figure' }, { label: 'Baseline', num: true }, { label: 'Now', num: true }, { label: 'Actual', num: true }],
      rows: [[c('CapEx'), n(money(b.capexTotal)), n(money(e.capexTotal)), n(plan.closeout ? money(plan.closeout.actualCapex) : dv ? moneyGeo(dv.pos.reduce((a, p) => a + (p.state === 'Delivered' ? p.total : 0), 0)) + ' received' : '—')],
        [c('OpEx a month'), n(money(b.opexMonthly)), n(money(e.opexMonthly)), n(plan.closeout?.actualOpexMonthly ? money(plan.closeout.actualOpexMonthly) : '—')],
        [c('IT capacity'), n(kw(b.designPowerKw)), n(kw(plan.designPowerKw)), n(plan.closeout ? kw(plan.closeout.deliveredKw) : '—')],
        [c('Go-live'), n(date(b.targetGoLive)), n(date(plan.targetGoLive)), n(plan.closeout ? date(plan.closeout.completedAt) : '—')],
        [c('Bill of materials'), n(money(b.bomTotal)), n(money(bom0Total)), n('—')],
        [c('Rules'), n(`${b.hardFails} fail, ${b.softWarns} warn`), n(`${ev.hardFails} fail, ${ev.softWarns} warn`), n('—')]],
      note: `Frozen ${date(b.at)} by ${b.by} on ${b.scenarioName ?? 'the base case'}, template v${b.templateVersion}. A change after approval needs a revision with its own approval round.` }]); }
    const recon = ev.reconciliation;
    if (recon && WHOLE_SITE_SCOPES.includes(plan.scope)) sub(d, 'reconciliation', 'Estimate against the bill of materials', [
      { kind: 'table', columns: [{ label: 'Estimate line' }, { label: 'Estimate', num: true }, { label: 'Bill of materials', num: true }, { label: 'Bill categories' }],
        rows: recon.rows.map(r => [c(r.item), n(money(r.estimate)), n(r.categories.length ? money(r.bom) : 'Not in the bill'), c(r.categories.join(', ') || '—')]),
        total: [c('Reconciled total against the estimate'), n(money(recon.estimateTotal)), n(money(recon.reconciledTotal)), c(`${recon.gapPct > 0 ? '+' : ''}${recon.gapPct}%`, Math.abs(recon.gapPct) <= 15 ? 'ok' : 'warn')],
        note: 'Whole-site plans are estimated from benchmarks; the bill prices the same categories bottom-up. Land, shell, design and contingency have no bill counterpart. A gap above 15% raises a warning (R-FIN-04).' },
    ]);
    sub(d, 'inputs', 'Benchmark band and business case inputs', [kv([
      ['Benchmark band', band ? `${money(band.low)} to ${money(band.high)} per kW` : undefined, band?.source], ['Fit-out CapEx per kW', pv(ev, 'capexPerKw') ? money(Number(ev.params.capexPerKw.value)) : undefined, sourceOf(ev, 'capexPerKw')],
      ['Shell and core', ev.params.shellCostPerM2 ? `${money(Number(ev.params.shellCostPerM2.value))} per m²` : undefined, sourceOf(ev, 'shellCostPerM2')], ['Land', ev.params.landCostUsd ? money(Number(ev.params.landCostUsd.value)) : undefined, sourceOf(ev, 'landCostUsd')],
      ['Cost contingency', pv(ev, 'costContingencyPct', '%'), sourceOf(ev, 'costContingencyPct')], ['Tariff', ev.params.tariffUsdPerKwh ? `${money(Number(ev.params.tariffUsdPerKwh.value) * 1000)} per MWh` : undefined, sourceOf(ev, 'tariffUsdPerKwh')],
      ['Revenue or charge-back', ev.params.revenuePerKwMonth ? `${money(Number(ev.params.revenuePerKwMonth.value))} per kW a month` : undefined, sourceOf(ev, 'revenuePerKwMonth')], ['Target fill', pv(ev, 'targetFillPct', '%'), sourceOf(ev, 'targetFillPct')],
      ['Fill ramp', pv(ev, 'fillRampMonths', ' months'), sourceOf(ev, 'fillRampMonths')], ['Anchor contract', ev.params.anchorKw ? kw(Number(ev.params.anchorKw.value)) : undefined, sourceOf(ev, 'anchorKw')], ['Pre-let', pv(ev, 'preLetPct', '%'), sourceOf(ev, 'preLetPct')],
      ['IT draw of sold capacity', pv(ev, 'itDrawPct', '%'), sourceOf(ev, 'itDrawPct')], ['Hurdle rate', pv(ev, 'hurdlePct', '%'), sourceOf(ev, 'hurdlePct')], ['Tax rate', pv(ev, 'taxRatePct', '%'), sourceOf(ev, 'taxRatePct')],
      ['Operator owns the IT', pv(ev, 'operatorOwnedIt'), sourceOf(ev, 'operatorOwnedIt')], ['IT refresh', pv(ev, 'refreshYears', ' years'), sourceOf(ev, 'refreshYears')],
      ['Revenue a year (steady state)', e.revenueAnnual ? money(e.revenueAnnual) : undefined], ['Energy recovered from tenants', e.energyRecoveredAnnual ? money(e.energyRecoveredAnnual) : undefined],
    ], 2)]);
  }

  /* 7 bill of materials and sourcing */
  const bom = pack.sourced ? sourcedAsBom(pack.bom, pack.sourced) : pack.bom;
  if (bom.lines.length) {
    const sourced = pack.sourced;
    const orders = sourced ? i.recorded ?? vendorOrders(sourced) : [];
    const contract = sourced ? contractByVendor(sourced) : new Map<string, string>();
    const d = sec('bom', 'Bill of materials and sourcing', [], `${plural(bom.lines.length, 'line')}, ${money(bom.total)}${pack.bom.monthlyTotal ? ` plus ${money(pack.bom.monthlyTotal)} a month in services` : ''}. The full bill with every line is in the workbook (sheet "Bill of materials").`);
    const estimate = ['new-dc', 'expansion', 'hall', 'portfolio'].includes(plan.scope);
    d.blocks.push({ kind: 'para', text: estimate ? `The bill of materials covers ${pack.bom.coveragePct}% of the plant and IT estimate (${money(pack.bom.capexCompared)}); land, shell and services are not in it. Unit costs are indicative list prices until the items are tendered.` : `This plan type is estimated bottom-up, so the bill of materials is the better figure; the CapEx estimate is ${money(e.capexTotal)}. Unit costs are indicative list prices until the items are tendered.` });
    sub(d, 'categories', 'Summary by category', [{ kind: 'table', columns: [{ label: 'Category' }, { label: 'Lines', num: true }, { label: 'Value', num: true }, { label: 'Share', num: true }],
      rows: bom.byCategory.map(k => [c(k.category), n(k.lines), n(money(k.total)), n(bom.total ? pctText((k.total / bom.total) * 100) : '—')]), total: [c('Total'), n(bom.lines.filter(l => !l.monthly).length), n(money(bom.total)), n('100%')] }]);
    if (sourced) {
      const split = sourcingSplit(sourced); const avoided = avoidedCost(sourced);
      sub(d, 'sourcing', 'Where the items come from', [
        { kind: 'para', text: 'Each line is matched first against spare capacity at the site, then against stock that nobody holds, and only then bought from the catalogue vendor under its contract.' },
        { kind: 'table', columns: [{ label: 'Source' }, { label: 'Lines', num: true }, { label: 'Value', num: true }], rows: split.map(x => [c(SOURCING_LABEL[x.source]), n(x.lines), n(money(x.value))]), total: [c('Avoided cost (site capacity and stock at list price)'), c(''), n(money(avoided), avoided ? 'ok' : undefined)] },
        kv([['Stock reserved', (() => { const a = plan.artefacts; const k = a ? a.reservedDeviceIds?.length ?? 0 : sourced.stockDeviceIds.length; return k ? `${plural(k, 'device')}, ${money(sourced.stockValue)} (${a ? 'reserved on execution' : 'reserved when the build starts'})` : a ? 'None reserved' : 'Nothing in stock matches'; })()],
          ['Rack positions', (() => { const a = plan.artefacts; const k = a ? a.reservedRackIds?.length ?? 0 : sourced.siteRackIds.length; return k ? `${plural(k, 'position')} at the site` : undefined; })()],
          ['Stock held later', sourced.plannedHoldDeviceIds?.length ? `${plural(sourced.plannedHoldDeviceIds.length, 'device')}, held nearer the need date` : undefined],
          ['Agreements (paid in milestones)', sourced.agreements?.length ? sourced.agreements.map(a => `${a.item} ${money(a.value)}`).join('; ') : undefined]]),
        ...(sourced.warnings.length ? [{ kind: 'callout' as const, tone: 'warn' as Tone, title: `Sourcing notes (${sourced.warnings.length})`, text: sourced.warnings.map(usdText).join(' · ') }] : []),
        ...(sourced.decisions && Object.values(sourced.decisions).some(Boolean) ? [kv(Object.entries(sourced.decisions).filter(([, v]) => !!v).map(([k, v]) => [sentence(k === 'ups' ? 'UPS' : k), usdText(String(v))] as [string, string]))] : []),
      ]);
      if (orders.length) sub(d, 'orders', 'Vendor orders', [{ kind: 'table', columns: [{ label: 'Vendor' }, { label: 'Contract' }, ...(orders.some(o => o.phaseName) ? [{ label: 'Phase' }] : []), { label: 'Lines', num: true }, { label: 'Value', num: true }, { label: 'Longest lead', num: true }, { label: 'Order by' }],
        rows: orders.map(o => [c(o.vendorName), c(o.contractId ? o.contractLabel : 'No contract', o.contractId ? undefined : 'warn'), ...(orders.some(x => x.phaseName) ? [c(o.phaseName)] : []), n(o.lines.length), n(money(o.value)), n(o.leadWeeks ? `${o.leadWeeks} wk` : '—', o.leadWeeks >= 40 ? 'warn' : undefined), c(date(o.orderBy))]),
        total: [c('Total'), c(''), ...(orders.some(o => o.phaseName) ? [c('')] : []), n(orders.reduce((a, o) => a + o.lines.length, 0)), n(money(orders.reduce((a, o) => a + o.value, 0))), c(''), c('')], note: 'One purchase order per vendor and phase, raised by Delivery when the build starts.' }]);
      void contract;
    }
    // the planner's own changes to the bill (plan page Materials tab), against the bill the sizing proposed
    const mc = ev.materials;
    if (mc?.changes.length) {
      const st = (x?: { qty: number; unit: string; model?: string; vendor?: string }) => (x ? `${num(x.qty)} ${x.unit}${x.model ? ` × ${x.model}` : ''}${x.vendor ? `, ${x.vendor}` : ''}` : '—');
      sub(d, 'changes', "Changes to the planner's proposal", [{ kind: 'para', text: `The planner changed ${plural(mc.changes.length, 'line')} of the bill the sizing proposed: ${money(mc.proposalTotal)} proposed, ${money(mc.total)} in this bill. The difference is one CapEx line (Bill of materials changes) in the estimate.` },
        { kind: 'table', columns: [{ label: 'Line' }, { label: 'Change' }, { label: 'Proposed' }, { label: 'In this bill' }, { label: 'Difference', num: true }],
          rows: mc.changes.map(x => [c(x.item), c(x.what.join(', ')), c(st(x.before)), c(x.what.includes('removed') ? 'removed' : st(x.after)), n(money(x.deltaUsd), x.deltaUsd > 0 ? 'warn' : undefined)]),
          total: [c('Total'), c(''), n(money(mc.proposalTotal)), n(money(mc.total)), n(money(mc.delta))] }]);
    }
    const longLead = bom.lines.filter(l => (l.leadWeeks ?? 0) >= 40);
    if (longLead.length) sub(d, 'long-lead', 'Long-lead items (40 weeks or more)', [{ kind: 'table', columns: [{ label: 'Item' }, { label: 'Model or specification' }, { label: 'Quantity', num: true }, { label: 'Value', num: true }, { label: 'Lead time', num: true }],
      rows: longLead.map(l => [c(l.item), c((l as { model?: string }).model ?? l.spec), n(`${num(l.qty)} ${l.unit}`), n(money(l.total)), n(`${l.leadWeeks} wk`, 'warn')]) }]);
    const top = [...bom.lines].filter(l => !l.monthly).sort((a, b) => b.total - a.total).slice(0, 15);
    sub(d, 'top-lines', 'Largest lines', [{ kind: 'table', columns: [{ label: 'Item' }, { label: 'Category' }, { label: 'Model or specification' }, { label: 'Quantity', num: true }, { label: 'Unit cost', num: true }, { label: 'Total', num: true }],
      rows: top.map(l => [c(l.item), c(l.category), c((l as { model?: string }).model ?? l.spec), n(`${num(l.qty)} ${l.unit}`), n(money(l.unitCost)), n(money(l.total))]), note: bom.lines.length > top.length ? `The ${top.length} largest of ${bom.lines.length} lines; every line is in the workbook.` : undefined }]);
  }

  /* 8 schedule */
  if (sched.length || plan.phases.length) {
    const d = sec('schedule', 'Schedule', [], late.length ? `${plural(late.length, 'item')} cannot arrive by its need date at its lead time.` : 'Every order and permit can be in place by its need date.');
    const gates = sched.filter(x => x.kind === 'gate');
    const equip = sched.filter(x => x.kind === 'equipment');
    const permits = sched.filter(x => x.kind === 'permit');
    if (late.length) d.blocks.push({ kind: 'callout', tone: 'bad', title: `Late items (${late.length})`, text: late.slice(0, 8).map(x => `${x.item} (${x.phase}): order by ${date(x.orderBy)}, needed ${date(x.needBy)}`).join('; ') + (late.length > 8 ? `; and ${late.length - 8} more` : '') + '.' });
    const phases = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
    if (phases.length) sub(d, 'phases', 'Phases and gates', [{ kind: 'table', columns: [{ label: 'Phase' }, { label: 'Go-live' }, { label: 'IT', num: true }, { label: 'Gates and milestones' }],
      rows: phases.map(p => [c(p.name), c(date(p.goLive)), n(kw(p.itKw)), c(gates.filter(g => g.phaseId === p.id || g.phase === p.name).map(g => `${g.item} ${date(g.needBy)}`).join('; ') || '—')]) }]);
    const row = (x: ScheduleItem): Cell[] => [c(x.item), c(x.phase), n(x.leadWeeks ? `${x.leadWeeks} wk` : '—'), c(date(x.orderBy), x.late ? 'bad' : undefined), c(date(x.needBy)), c(x.late ? 'Late' : x.status === 'ordered' ? 'Ordered' : x.source === 'stock' ? 'From stock' : 'On time', x.late ? 'bad' : 'ok'), c(x.orders?.map(o => o.id).join(', ') || x.poId)];
    const cols = [{ label: 'Item' }, { label: 'Phase' }, { label: 'Lead', num: true }, { label: 'Order by' }, { label: 'Need by' }, { label: 'Timing' }, { label: 'Purchase order' }];
    if (equip.length) sub(d, 'orders', 'Long-lead order-by dates', [{ kind: 'table', columns: cols, rows: [...equip].sort((a, b) => a.orderBy.localeCompare(b.orderBy)).slice(0, 30).map(row), note: equip.length > 30 ? `The first 30 of ${equip.length} by order date; the full schedule is in the workbook.` : undefined }]);
    if (permits.length) sub(d, 'permits', 'Permits on the schedule', [{ kind: 'table', columns: cols.slice(0, 6), rows: permits.map(x => row(x).slice(0, 6)) }]);
    d.blocks.push(...fig('waves'), ...fig('cut-ins'), ...fig('dci-cutover'));
    if (drawings.some(x => x.id === 'lead-times')) d.blocks.push({ kind: 'para', text: `Every item from order to need date is drawn on sheet ${drawings.find(x => x.id === 'lead-times')!.number} (Appendix A).` });
  }

  /* 9 network and IP plan */
  if (pack.applies.ip && pack.ip.items.length) {
    const ip = pack.ip; const usedPct = ip.totalAddresses ? Math.round((ip.usedAddresses / ip.totalAddresses) * 1000) / 10 : 0;
    const isNew = (ip.containers ?? []).some(x => x.isNew);
    sec('network', 'Network and IP plan', [
      kv([[isNew ? 'New site container' : 'Site container', ip.aggregate], ['Prefixes', `${num(ip.items.length)} in ${plural(new Set(ip.items.map(x => x.scope)).size, 'scope')}`], ['VLANs', num(ip.vlans.length)], ['ASN ranges', num(ip.asns.length)],
        ['Addresses used', ip.totalAddresses ? `${usedPct}% (${num(ip.usedAddresses)} of ${num(ip.totalAddresses)})` : undefined, undefined, usedPct > 80 ? 'warn' : undefined]], 2),
      ...((ip.warnings ?? []).length ? [{ kind: 'callout' as const, tone: 'warn' as Tone, title: `Allocation notes (${ip.warnings!.length})`, text: `${ip.warnings!.slice(0, 4).join('; ')}${ip.warnings!.length > 4 ? `; and ${ip.warnings!.length - 4} more like these (all in the workbook, sheet "IP plan notes")` : ''}.` }] : []),
      { kind: 'table', title: 'Prefixes', columns: [{ label: 'Scope' }, { label: 'Purpose' }, { label: 'Name' }, { label: 'CIDR' }, { label: 'Usable hosts', num: true }, { label: 'VLAN', num: true }, { label: 'Gateway' }],
        rows: ip.items.slice(0, 40).map(x => [c(x.scope), c(x.purpose === 'OOB' ? 'Out of band' : x.purpose), c(x.name), c(x.cidr), n(num(x.hosts)), n(x.vlan ?? '—'), c(x.gateway)]), note: ip.items.length > 40 ? `The first 40 of ${ip.items.length} prefixes; every prefix is in the workbook.` : 'Nothing is written to IP & Network until the build starts.' },
      ...(ip.asns.length ? [{ kind: 'table' as const, title: 'Routing (BGP autonomous systems)', columns: [{ label: 'Role' }, { label: 'ASN' }], rows: ip.asns.map(a => [c(a.role), c(a.asn)]) }] : []),
      ...(ip.vlans.length ? [{ kind: 'table' as const, title: 'VLANs', columns: [{ label: 'VLAN', num: true }, { label: 'Name' }, { label: 'Purpose' }, { label: 'Scope' }], rows: ip.vlans.slice(0, 30).map(v => [n(v.number), c(v.name), c(v.purpose === 'OOB' ? 'Out of band' : v.purpose), c(v.scope)]), note: ip.vlans.length > 30 ? `The first 30 of ${ip.vlans.length}; all are in the workbook.` : undefined }] : []),
    ], 'Prefixes, VLANs and private ASNs allocated from IP & Network, clear of everything in use and of other open plans.');
  }

  /* 10 risks, permits and conditions */
  if (plan.risks.length || plan.permits.length || (plan.conditions ?? []).length) {
    const gates = pack.init.permitGates ?? [];
    sec('risks', 'Risks, permits and approval conditions', [
      ...(plan.risks.length ? [{ kind: 'table' as const, title: 'Risk register', columns: [{ label: 'Risk' }, { label: 'Area' }, { label: 'Probability' }, { label: 'Impact' }, { label: 'Mitigation' }, { label: 'Owner' }],
        rows: [...plan.risks].sort((a, b) => RISK_SCORE[b.probability] * RISK_SCORE[b.impact] - RISK_SCORE[a.probability] * RISK_SCORE[a.impact]).map(r => [c(r.title), c(r.domain), c(r.probability, r.probability === 'High' ? 'bad' : r.probability === 'Medium' ? 'warn' : undefined), c(r.impact, r.impact === 'High' ? 'bad' : r.impact === 'Medium' ? 'warn' : undefined), c(usdText((r as { mitigation?: string }).mitigation ?? '')), c(r.owner)]) }] : []),
      ...(plan.permits.length ? [{ kind: 'table' as const, title: 'Permits', columns: [{ label: 'Permit' }, { label: 'Authority' }, { label: 'Lead', num: true }, { label: 'Needed before' }, { label: 'Status' }, { label: 'Gates' }],
        rows: plan.permits.map(p => { const g = gates.find(x => x.permit.id === p.id); return [c(p.name), c(p.authority), n(`${p.leadWeeks} wk`), c(date(p.neededBefore)), c(p.status, p.status === 'Approved' ? 'ok' : p.status === 'Expired' ? 'bad' : undefined), c(g?.projectName ? `${g.ok ? 'In time' : 'Late'}: ${g.projectName.split(' — ').slice(-2).join(' — ')}` : g ? usdText(g.reason) : '—', g ? (g.ok ? 'ok' : 'bad') : undefined)]; }) }] : []),
      ...((plan.conditions ?? []).length ? [{ kind: 'table' as const, title: 'Approval conditions', columns: [{ label: 'Condition' }, { label: 'Owner' }, { label: 'Due' }, { label: 'Blocks the build' }, { label: 'Status' }],
        rows: (plan.conditions ?? []).map(x => [c(x.text), c(x.owner), c(date(x.dueDate)), c(x.blocksExecution ? 'Yes' : 'No'), c(x.status, x.status === 'Closed' ? 'ok' : x.blocksExecution ? 'bad' : 'warn')]) }] : []),
    ]);
  }

  /* 11 rule checks */
  if (ev.findings.length) {
    const order = { fail: 0, warn: 1, pass: 2, 'n/a': 3 };
    const fs = [...ev.findings].sort((a, b) => order[a.status] - order[b.status] || a.rule.aspect.localeCompare(b.rule.aspect));
    sec('rules', 'Rule checks', [
      { kind: 'figures', items: [{ label: 'Checked', value: num(ev.findings.length) }, { label: 'Hard fails', value: num(fails.length), tone: fails.length ? 'bad' : 'ok', sub: 'block submission' }, { label: 'Warnings', value: num(warns.length), tone: warns.length ? 'warn' : 'ok', sub: 'acknowledged in the review' }, { label: 'Pass', value: num(ev.findings.filter(f => f.status === 'pass').length), sub: `${num(ev.findings.filter(f => f.status === 'n/a').length)} not applicable` }] },
      { kind: 'table', columns: [{ label: 'Rule', width: 10 }, { label: 'Check', width: 25 }, { label: 'Area', width: 11 }, { label: 'Value', width: 10 }, { label: 'Standard and threshold', width: 13 }, { label: 'Result', width: 31 }],
        rows: fs.map(f => [c(`${f.rule.id} (${f.rule.severity === 'hard' ? 'must' : 'should'})`), c(f.rule.title), c(ASPECT_LABEL[f.rule.aspect]), c(f.value ? usdText(f.value) : undefined), c([f.rule.standard ?? f.rule.source, f.rule.threshold !== undefined ? `threshold ${num(f.rule.threshold, 2)}` : ''].filter(Boolean).join(', ') || undefined), c(`${FINDING_TEXT[f.status]}${f.detail ? `: ${usdText(f.detail)}` : ''}`, findingTone(f.status))]),
        note: 'A must (hard) rule that fails blocks submission; a should (soft) rule that warns is acknowledged in the decision.' },
    ], `Every rule of the template chain${ev.resolved ? ` (${ev.resolved.chain.map(x => x.name).join(' → ')})` : ''}: hard rules must pass before submission, soft rules are acknowledged in the review.`);
  }

  /* 12 delivery and build initiation */
  {
    const init = pack.init; const dv = i.delivery;
    const d = sec('delivery', 'Delivery and build initiation', [], dv ? `In Delivery as ${dv.project.id} (${dv.project.state.toLowerCase()}, ${dv.project.health}).` : 'What approval creates in Delivery. Nothing below exists until the build starts.');
    const lines = recordLines(plan, pack, dv, new Set(i.data.dataCenters?.map(x => x.id) ?? []));
    sub(d, 'creates', 'What this plan creates', [{ kind: 'table', columns: [{ label: 'Output' }, { label: 'What' }, { label: 'Records' }, { label: 'State' }],
      rows: lines.map(l => [c(l.label), c(usdText(l.detail)), c(l.links.map(x => x.label).join(', ') || undefined), c(RECORD_STATE[l.status], l.status === 'created' ? 'ok' : l.status === 'none' ? 'warn' : 'neutral')]) },
      ...manifestBlocks(template, pack)]);
    sub(d, 'vehicle', VEHICLE_LABEL[init.vehicle], [kv([['Created as', VEHICLE_LABEL[init.vehicle]], ['Name', init.name], ['Blueprint', init.vehicle === 'change' ? undefined : init.blueprintName ?? (init.projects[0]?.template ? `${init.projects[0].template} template` : undefined)],
      ['Budget', money(init.budget)], ['Budget split', init.budgetSplit?.length ? init.budgetSplit.map(b => `${b.category} ${money(b.amount)}`).join(' · ') : undefined], ['Change type', init.change?.type],
      ['Work orders', init.workOrders?.length ? `${init.workOrders.length}, one per site` : `Field work split into crew windows (${init.workOrder.process})`], ['Change requests', 'One per work order'],
      ['Record', dv ? `${projectOf(plan)} in Delivery` : 'Created on approval']]),
      ...(init.notes ?? []).map(t => ({ kind: 'callout' as const, tone: 'warn' as Tone, title: 'Schedule note', text: usdText(t) }))]);
    if (init.projects.length) sub(d, 'projects', 'Projects and gates', [{ kind: 'table', columns: [{ label: 'Project' }, { label: 'Phase' }, { label: 'Start' }, { label: 'End' }, { label: 'Budget', num: true }, { label: 'Gate' }],
      rows: init.projects.map(p => [c(`${p.name.split(' — ').slice(-1)[0]}${p.commissioning ? ' (commissioning)' : ''}`), c(p.shared ? 'Runs once' : p.phaseName ?? '—'), c(`${date(p.start)}${p.late ? ' (late)' : ''}`, p.late ? 'bad' : undefined), c(date(p.end)), n(money(p.budget)), c([p.gate, ...(p.gatedBy ?? []).map(x => `permit: ${x}`)].join('; '))]),
      note: 'Back-scheduled from each phase go-live on the blueprint durations; a start already in the past is flagged late.' }]);
    if (init.childPlans?.length) sub(d, 'children', 'Child plans', [{ kind: 'table', columns: [{ label: 'Child plan' }, { label: 'Type' }, { label: 'IT', num: true }, { label: 'Live' }, { label: 'Budget envelope', num: true }],
      rows: init.childPlans.map(x => [c(x.title), c(SCOPE_LABEL[x.scope]), n(kw(x.itKw)), c(date(x.goLive)), n(money(x.budget))]) }]);
    if (init.orders.length) sub(d, 'long-lead', pack.sourced ? 'Long-lead items to order' : 'Long-lead purchase orders', [{ kind: 'table', columns: [{ label: 'Item' }, { label: 'Category' }, { label: 'Value', num: true }, { label: 'Order by' }, { label: 'Need by' }, { label: 'Timing' }],
      rows: init.orders.map(o => [c(o.item), c(o.category === 'Mixed' ? 'Several' : o.category), n(money(o.value)), c(date(o.orderBy), o.late ? 'bad' : undefined), c(date(o.needBy)), c(o.late ? 'Late' : 'On time', o.late ? 'bad' : 'ok')]) }]);
    if (init.atps?.length && !fam.parts.some(p => /acceptance tests/i.test(p.title))) sub(d, 'tests', 'Acceptance tests', [{ kind: 'table', columns: [{ label: 'Acceptance test' }, { label: 'Level' }, { label: 'System' }, { label: 'Phase' }, { label: 'Steps', num: true }],
      rows: init.atps.slice(0, 40).map(t => [c(t.name), c(t.level), c(t.system), c(t.phaseName), n(t.steps.length)]), note: init.atps.length > 40 ? `The first 40 of ${init.atps.length}; all are in the workbook with their steps.` : 'Run as L1 to L5 in Delivery.' }]);
    if (init.designDocs.length) sub(d, 'documents', 'Design documents to create', [{ kind: 'table', columns: [{ label: 'Document' }, { label: 'Stage' }, { label: 'Discipline' }], rows: init.designDocs.map(x => [c(x.name), c(x.type), c(x.discipline)]) }]);
    if (dv) sub(d, 'live', `Delivery project ${dv.project.id}`, [
      kv([['State', dv.project.state], ['Health', dv.project.health], ['Purchase orders', `${dv.pos.filter(p => p.state === 'Delivered').length} of ${dv.pos.length} received${dv.pos.some(p => p.state === 'Late') ? `, ${dv.pos.filter(p => p.state === 'Late').length} late` : ''}`],
        ['Work orders', `${dv.workOrders.filter(w => w.state === 'Done').length} of ${dv.workOrders.length} done`], ['Commissioning', `${dv.tests.filter(t => t.state === 'Passed').length} of ${dv.tests.length} tests passed`], ['Permits', `${dv.permits.filter(p => p.state === 'Granted').length} of ${dv.permits.length} granted`]], 2),
      ...(dv.pos.length ? [{ kind: 'table' as const, title: 'Purchase orders in Delivery', columns: [{ label: 'Order' }, { label: 'Supplier' }, { label: 'Value', num: true }, { label: 'Due' }, { label: 'State' }],
        rows: dv.pos.map(p => [c(p.id), c(p.supplier), n(moneyGeo(p.total)), c(p.due ? date(new Date(p.due).toISOString()) : undefined), c(p.state, p.state === 'Late' ? 'bad' : p.state === 'Delivered' ? 'ok' : undefined)]) }] : []),
      ...(dv.workOrders.length ? [{ kind: 'table' as const, title: 'Work orders and change requests', columns: [{ label: 'Work order' }, { label: 'Title' }, { label: 'State' }, { label: 'Change request' }],
        rows: dv.workOrders.map(w => [c(w.id), c((w as { title?: string }).title), c(w.state, w.state === 'Done' ? 'ok' : undefined), c(w.changeId)]) }] : []),
    ]);
  }

  /* 13 assumptions and sources */
  {
    const defs = ev.resolved?.params ?? [];
    const rows = Object.entries(ev.params).map(([k, v]) => ({ k, v, def: defs.find(p => p.key === k) })).filter(x => x.def || x.v.source !== 'template').sort((a, b) => (a.def?.label ?? a.k).localeCompare(b.def?.label ?? b.k));
    const bmUsed = benchmarks.filter(b => Object.values(ev.params).some(p => p.source === 'benchmark' && (p.note ?? '').includes(b.metric)) || sched.some(x => b.metric === `leadWeeks:${(x as { leadItem?: string }).leadItem}`));
    const leadUsed = benchmarks.filter(b => b.metric.startsWith('leadWeeks:') && sched.some(x => x.item.toLowerCase().includes(b.metric.slice(10).split(' ')[0].toLowerCase())));
    const bms = [...new Map([...bmUsed, ...leadUsed].map(b => [b.id, b])).values()];
    const count = (src: T.PlannerParamSource) => Object.values(ev.params).filter(p => p.source === src).length;
    sec('assumptions', 'Assumptions and sources', [
      { kind: 'para', text: `${num(Object.keys(ev.params).length)} inputs: ${(['user', 'requirement', 'benchmark', 'actual', 'document', 'template'] as T.PlannerParamSource[]).map(src => `${num(count(src))} ${SOURCE_LABEL[src].toLowerCase()}`).join(', ')}. Readiness ${pct(ev.readinessPct)}: the share of inputs confirmed by the planner, the requirements, a benchmark, an estate actual or a document.` },
      { kind: 'table', title: 'Inputs', columns: [{ label: 'Input', width: 34 }, { label: 'Value', num: true, width: 18 }, { label: 'Source', width: 18 }, { label: 'Note', width: 30 }],
        rows: rows.map(x => [c(x.def?.label ?? labelOfKey(x.k)), n(fmtParam(x.v.value, x.def?.unit)), c(SOURCE_LABEL[x.v.source], x.v.source === 'template' ? 'neutral' : undefined), c(x.v.note ? usdText(x.v.note) : undefined)]) },
      ...(ev.aspects.length ? [{ kind: 'table' as const, title: 'Readiness by area', columns: [{ label: 'Area' }, { label: 'Depth' }, { label: 'Answered', num: true }, { label: 'Readiness', num: true }], rows: ev.aspects.map(a => [c(ASPECT_LABEL[a.aspect]), c(sentence(a.depth)), n(`${a.answered} of ${a.total}`), n(pct(a.pct), a.pct >= 80 ? 'ok' : a.pct >= 50 ? undefined : 'warn')]) }] : []),
      ...(bms.length ? [{ kind: 'table' as const, title: 'Benchmarks used', columns: [{ label: 'Benchmark' }, { label: 'Value', num: true }, { label: 'Range', num: true }, { label: 'Source' }], rows: bms.map(b => [c(benchLabel(b)), n(b.value !== undefined ? num(b.value, 2) : '—'), n(b.low !== undefined || b.high !== undefined ? `${b.low !== undefined ? num(b.low, 2) : '—'} to ${b.high !== undefined ? num(b.high, 2) : '—'}` : '—'), c(b.source)]) }] : []),
      { kind: 'para', text: `Template ${template ? `${template.name} v${template.version}` : plan.templateId}${ev.resolved ? `, inheriting ${ev.resolved.chain.map(x => `${x.name} v${x.version}`).join(' → ')}` : ''}. Money in ${geo.currency.code}${geo.id === 'us' ? '' : ' (planner figures converted from USD at the planning rate)'}; figures are indicative until the plan is approved.` },
    ]);
  }

  /* Appendix A drawing register */
  if (drawings.length) sec('drawings', 'Drawing register', [{ kind: 'table', columns: [{ label: 'Drawing number' }, { label: 'Title' }, { label: 'Discipline' }, { label: 'Revision' }, { label: 'Scale' }],
    rows: drawings.map(x => [c(x.number), c(x.title), c(x.discipline), c(x.revision), c('NTS')]) }, { kind: 'para', text: 'The sheets follow as landscape pages. Each is drawn from the plan\'s sizing and its family\'s analysis of the site; schematic, not to scale.' }]);

  /* ---------------------------------------------------------------- numbering (no empty sections) */
  // a column with nothing in any row (a rule with no measured value, a cost line with no source) is left out
  for (const d of out) for (const x of [d, ...d.subs]) x.blocks = x.blocks.map(pruneColumns);
  const sections: ReviewSection[] = [];
  let k = 0;
  for (const d of out) {
    if (!hasContent(d.blocks) && !d.subs.length) continue;
    const appendix = d.id === 'drawings';
    const number = appendix ? 'A' : String(++k);
    sections.push({ id: d.id, number, title: d.title, summary: d.summary, blocks: d.blocks });
    d.subs.forEach((x, j) => sections.push({ id: x.id, number: `${number}.${j + 1}`, title: x.title, summary: x.summary, blocks: x.blocks }));
  }

  return { meta, sections, drawings, sheets: [...buildSheets(i, pack, sched, approvals), ...fam.sheets], approvals, ask: { decision: askText(plan, ev, scenarioName), changesSinceLast: changesSince(i) } };
}

/* ================================================================== pieces */
/** Decision-table rule ids (Rule_al_4) are engine references, not words for a reviewer. */
const noRuleIds = (t: string) => t.replace(/\s*·\s*Rule_\w+/g, '').replace(/\s*\bRule_\w+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
/** A planned device holds its rack position (0 kW) and its typical draw: one line per device, the position and the model joined. */
function mergeHolds(holds: { label: string; state: string; kw: number; expiresAt?: string }[]) {
  const by = new Map<string, { label: string; state: string; kw: number; expiresAt?: string; details: string[] }>();
  for (const h of holds) {
    const m = /^(.*?)(?:\s+in\s+(.+)|\s+\((.+)\))$/.exec(h.label);
    const key = m ? m[1] : h.label; const detail = m ? (m[2] ? `in ${m[2]}` : m[3]) : '';
    const cur = by.get(key);
    if (cur) { cur.kw += h.kw; if (detail) cur.details.push(detail); cur.expiresAt ??= h.expiresAt; }
    else by.set(key, { label: key, state: h.state, kw: h.kw, expiresAt: h.expiresAt, details: detail ? [detail] : [] });
  }
  return [...by.values()].map(x => ({ ...x, label: x.details.length ? `${x.label} ${x.details.join(', ')}` : x.label }));
}
const blank = (c?: Cell) => !c || !c.text.trim() || c.text === '—';
function pruneColumns(b: Block): Block {
  if (b.kind !== 'table' || b.columns.length <= 3 || /sign-off/i.test(b.title ?? '')) return b;
  const keep = b.columns.map((_, i) => !b.rows.every(r => blank(r[i])) || (b.total && !blank(b.total[i])));
  if (keep.every(Boolean)) return b;
  return { ...b, columns: b.columns.filter((_, i) => keep[i]), rows: b.rows.map(r => r.filter((_, i) => keep[i])), total: b.total?.filter((_, i) => keep[i]) };
}
const RECORD_STATE = { ready: 'Ready to generate', approved: 'Created when executed', created: 'Created', none: 'Not created', na: 'Not part of this plan type' } as const;
const moneyGeo = (geoAmount: number) => money(geoNow().id === 'us' ? geoAmount : geoAmount / 50);
function labelOfKey(k: string): string { if (/Ids$/.test(k)) return `${labelOfKey(k.slice(0, -3))} records`; if (/Id$/.test(k)) return labelOfKey(k.slice(0, -2)); return sentence(k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\bpct\b/i, '%').replace(/\busd\b/i, 'USD').replace(/\bkw\b/i, 'kW').toLowerCase().replace(/ kw\b/g, ' kW').replace(/\busd\b/g, 'USD').replace(/\bit\b/g, 'IT').replace(/\bups\b/g, 'UPS').replace(/\bpue\b/g, 'PUE')); }
function fmtParam(v: number | string | boolean, unit?: string) { return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'number' ? `${num(v, 2)}${unit ? ` ${unit}` : ''}` : humanJson(String(v)); }
/** Structured inputs are stored as JSON (selection criteria, lists): shown as words, never as raw JSON. */
function humanJson(s: string): string {
  const ids = s.split(',').map(x => x.trim()).filter(Boolean);
  if (ids.length > 2 && !/^[[{]/.test(s.trim()) && !/\s/.test(s.replace(/,\s*/g, ','))) return `${ids.length}: ${ids.slice(0, 3).join(', ')}${ids.length > 3 ? ` and ${ids.length - 3} more` : ''}`;
  if (!/^[[{]/.test(s.trim())) return s;
  try {
    const v = JSON.parse(s) as unknown;
    const one = (x: unknown): string => (Array.isArray(x) ? (x.length ? x.map(one).join(', ') : 'none') : x && typeof x === 'object' ? `${Object.keys(x).length} fields` : typeof x === 'string' ? x.replace(/-/g, ' ') : String(x));
    if (Array.isArray(v)) return v.length ? (v.every(x => typeof x !== 'object') ? v.map(one).join(', ') : `${v.length} entries`) : 'None';
    if (v && typeof v === 'object') { const parts = Object.entries(v as Record<string, unknown>).filter(([, x]) => !(Array.isArray(x) && !x.length) && x !== '' && x !== null && x !== undefined).map(([k, x]) => `${labelOfKey(k).toLowerCase()} ${one(x)}`); return parts.length ? sentence(parts.join('; ')) : 'None'; }
    return String(v);
  } catch { return s; }
}
function benchLabel(b: T.PlannerBenchmark) { const m = b.metric.startsWith('leadWeeks:') ? `Lead time, ${b.metric.slice(10)} (weeks)` : labelOfKey(b.metric); const a = Object.values(b.appliesTo ?? {}).filter(Boolean).join(', '); return a ? `${m} · ${a}` : m; }

function askText(plan: T.PlannerPlan, ev: Evaluation, scenarioName?: string): string {
  const amount = money(plan.approvalAmountUsd ?? ev.estimate.capexTotal);
  const what = `${plan.plnId} revision ${plan.revision ?? 'A'}${scenarioName ? ` (${scenarioName})` : ''}: ${kw(ev.sizing.itKw)} for ${amount} CapEx, live by ${date(plan.targetGoLive)}`;
  switch (plan.status) {
    case 'Draft': case 'Rejected': return `Review the plan before it is submitted: ${what}. Comment on anything that should change; the approval path below runs once it is submitted.`;
    case 'In review': { const nx = G.nextPendingStep(plan); return `Approve, approve with conditions, or reject ${what}.${nx ? ` The next decision is ${nx.step} (${nx.role}).` : ''} A rejection or conditions need a reason; conditions get an owner and a due date.`; }
    case 'Approved': return `Approved. Confirm the build can start: ${what}. Open blocking conditions stop the build until they are closed with evidence.`;
    case 'Executing': return `In delivery. Review progress against the approved baseline: ${what}.`;
    case 'Completed': return `Completed. For the record: ${what}.`;
    default: return `For information: ${what} (${plan.status.toLowerCase()}).`;
  }
}

/** What changed since the previous revision (its frozen baseline) or the previous round. */
function changesSince(i: ReviewInput): string[] {
  const { plan, ev } = i;
  const parent = plan.revisionOf ? i.plans?.find(p => p.id === plan.revisionOf) : undefined;
  const label = (k: string) => ev.resolved?.params.find(p => p.key === k)?.label ?? labelOfKey(k);
  const out: string[] = [];
  if (parent?.baseline) {
    const rows = G.baselineDelta(parent.baseline, plan, ev, label).filter(r => r.changed);
    out.push(`Revision ${plan.revision ?? ''} of ${parent.plnId} (baseline frozen ${date(parent.baseline.at)}): ${rows.length ? `${plural(rows.length, 'figure')} changed` : 'no frozen figure changed yet'}.`);
    out.push(...rows.slice(0, 12).map(r => `${r.label}: ${usdText(r.before)} → ${usdText(r.after)}`));
  }
  const last = [...(plan.approvalHistory ?? [])].sort((a, b) => b.round - a.round)[0];
  if (last) {
    out.push(`Previous round ${last.round} (${date(last.submittedAt)}): ${last.outcome.toLowerCase()}${last.approvals.find(a => a.reason) ? `; ${last.approvals.filter(a => a.reason).map(a => `${a.step}: ${a.reason}`).join('; ')}` : ''}.`);
  }
  return out;
}

function manifestBlocks(template: T.PlannerTemplate | undefined, pack: PlanPackData): Block[] {
  const m = packManifest(template, [], pack.sheets);
  if (!m.length) return [];
  const label = new Map<string, string>(PACK_SECTIONS.map(x => [x.value, x.label]));
  return [{ kind: 'table', title: 'Outputs the plan type delivers', columns: [{ label: 'Output' }, { label: 'In this pack' }],
    rows: m.map(x => [c(x.output), c(x.section ? `${label.get(x.section) ?? x.sectionLabel ?? x.section}` : 'Not generated yet', x.section ? 'ok' : 'warn')]) }];
}

function drawingOf(sh: DrawingSheet, plan: T.PlannerPlan, ev: Evaluation, rev: string, discipline: Record<string, string>): ReviewDrawing {
  const disc = sh.number.split('-').slice(-2, -1)[0] ?? 'G';
  let cache: ReturnType<typeof renderSheetSvg> | undefined;
  const get = () => (cache ??= renderSheetSvg(sh.kind, plan, ev, sh.number));
  return {
    id: sh.kind, number: sh.number, title: sh.title, discipline: discipline[disc] ?? 'General', revision: rev,
    svg: () => get().svg,
    get width() { return get().width; },
    get height() { return get().height; },
    get notes() { return get().notes; },
  };
}

/* ================================================================== workbook sheets (and CSVs) */
function buildSheets(i: ReviewInput, pack: PlanPackData, sched: ScheduleItem[], approvals: ReviewApprovalStep[]): ReviewSheet[] {
  const { plan, ev } = i; const e = ev.estimate; const cur = geoNow().currency.code;
  const M = (label: string) => ({ label: `${label} (${cur})`, num: true, money: true });
  const N = (label: string) => ({ label, num: true });
  const S = (label: string, width?: number) => ({ label, width });
  const out: ReviewSheet[] = [];
  out.push({ name: 'Summary', columns: [S('Item', 30), S('Value', 60)], rows: [
    ['Plan', plan.plnId], ['Title', plan.title], ['Revision', plan.revision ?? 'A'], ['Status', plan.status], ['Plan type', i.template?.name ?? SCOPE_LABEL[plan.scope]], ['Site', i.siteName],
    ['Owner', plan.ownerName], ['Requested by', plan.requestedBy], ['Needed by', isoDay(plan.targetGoLive)], ['IT capacity (kW)', Math.round(ev.sizing.itKw)], ['Racks', ev.sizing.racks], ['Halls', ev.sizing.halls],
    [`CapEx (${cur})`, usd(e.capexTotal)], [`OpEx a month (${cur})`, usd(e.opexMonthly)], [`NPV (${cur})`, usd(e.npvUsd)], ['IRR (%)', e.irrPct ?? null], ['Payback (months)', e.paybackMonths ?? null],
    ['PUE', ev.sizing.pue.value], ['Readiness (%)', ev.readinessPct], ['Hard rule fails', ev.hardFails], ['Soft rule warnings', ev.softWarns], ['Currency', cur],
  ] });
  const sourced = pack.sourced;
  if (sourced) {
    const contract = contractByVendor(sourced);
    out.push({ name: 'Bill of materials', columns: [N('Line'), S('Category', 18), S('Item', 26), S('Model', 22), S('Specification', 34), N('Quantity'), S('Unit', 8), N('From site'), N('From stock'), N('To buy'), M('Unit cost'), M('Total'), M('Buy cost'), M('Avoided cost'), S('Vendor', 22), S('Contract', 22), N('Lead weeks'), S('Part number', 14), S('Manufacturer', 18), S('Sourcing notes', 50)],
      rows: sourced.lines.map((l, k) => { const buy = l.allocations.find(a => a.source === 'procure'); return [k + 1, l.category, l.item, l.model ?? '', l.spec, l.qty, l.unit, l.fromSite, l.fromStock, l.toBuy, usd(l.unitCost), usd(l.total), usd(l.buyCost), usd(l.avoidedCost), buy?.vendorName ?? '', buy ? contract.get(buy.vendorName ?? '') ?? 'no contract' : '', l.leadWeeks ?? null, l.partNumber, l.manufacturer, l.allocations.map(a => `${a.source === 'procure' ? 'Buy' : a.source === 'stock' ? 'Stock' : 'Site'} ${a.qty}: ${usdText(a.note)}`).join('; ')]; }) });
    const orders = i.recorded ?? vendorOrders(sourced);
    if (orders.length) out.push({ name: 'Vendor orders', columns: [S('Vendor', 26), S('Contract', 26), S('Phase', 16), N('Lines'), M('Value'), N('Longest lead (weeks)'), S('Order by', 12), S('Need by', 12)],
      rows: orders.map(o => [o.vendorName, o.contractId ? o.contractLabel : 'No contract', o.phaseName ?? '', o.lines.length, usd(o.value), o.leadWeeks || null, isoDay(o.orderBy), isoDay(o.needBy)]) });
  } else if (pack.bom.lines.length) {
    out.push({ name: 'Bill of materials', columns: [N('Line'), S('Category', 18), S('Item', 26), S('Specification', 34), N('Quantity'), S('Unit', 8), M('Unit cost'), M('Total'), N('Lead weeks'), S('Part number', 14), S('Manufacturer', 18)],
      rows: pack.bom.lines.map((l, k) => [k + 1, l.category, l.item, l.spec, l.qty, l.unit, usd(l.unitCost), usd(l.total), l.leadWeeks ?? null, l.partNumber, l.manufacturer]) });
  }
  if (pack.applies.ip && pack.ip.items.length) {
    out.push({ name: 'IP plan', columns: [S('Scope', 14), S('Purpose', 12), S('Name', 28), S('CIDR', 18), N('Usable hosts'), N('VLAN'), S('Gateway', 16), S('Notes', 36)], rows: pack.ip.items.map(x => [x.scope, x.purpose === 'OOB' ? 'Out of band' : x.purpose, x.name, x.cidr, x.hosts, x.vlan ?? null, x.gateway ?? '', x.notes]) });
    if (pack.ip.vlans.length) out.push({ name: 'VLANs', columns: [N('VLAN'), S('Name', 28), S('Purpose', 14), S('Scope', 14)], rows: pack.ip.vlans.map(v => [v.number, v.name, v.purpose, v.scope]) });
    if ((pack.ip.warnings ?? []).length) out.push({ name: 'IP plan notes', columns: [N('Note'), S('Allocation note', 100)], rows: pack.ip.warnings!.map((w, k) => [k + 1, w]) });
    if (pack.ip.asns.length) out.push({ name: 'ASNs', columns: [S('Role', 28), S('ASN', 30)], rows: pack.ip.asns.map(a => [a.role, a.asn]) });
  }
  if (sched.length) out.push({ name: 'Schedule', columns: [S('Item', 34), S('Kind', 10), S('Phase', 16), N('Lead weeks'), N('Buffer weeks'), S('Order by', 12), S('Need by', 12), S('Late', 6), S('Source', 10), S('Purchase orders', 20), S('Note', 40)],
    rows: sched.map(x => [x.item, sentence(x.kind), x.phase, x.leadWeeks, x.bufferWeeks ?? null, isoDay(x.orderBy), isoDay(x.needBy), x.late ? 'Yes' : 'No', x.source ?? '', x.orders?.map(o => o.id).join(', ') ?? x.poId ?? '', usdText(x.note ?? '')]) });
  if (e.capex.length) out.push({ name: 'CapEx', columns: [S('Category', 18), S('Line', 34), M('Amount'), S('Basis', 60), S('Source', 16)], rows: e.capex.map(l => [l.category, l.item, usd(l.amount), usdText(l.basis), SOURCE_LABEL[l.source]]) });
  if (e.opex.length) out.push({ name: 'OpEx', columns: [S('Category', 18), S('Line', 34), M('Amount a year'), S('Basis', 60), S('Source', 16)], rows: e.opex.map(l => [l.category, l.item, usd(l.amount), usdText(l.basis), SOURCE_LABEL[l.source]]) });
  if ((e.cashflow ?? []).length) out.push({ name: 'Cash flow', columns: [S('Year', 10), M('CapEx'), M('Revenue'), M('Benefits'), M('OpEx'), M('Depreciation'), M('Tax'), M('Net cash'), M('Cumulative'), M('Discounted')],
    rows: e.cashflow!.map(y => [y.label, usd(y.capex), usd(y.revenue), usd(y.benefit), usd(y.opex), usd(y.depreciation ?? 0), usd(y.tax ?? 0), usd(y.net), usd(y.cumulative), usd(y.discounted)]) });
  if (ev.ladder.length) out.push({ name: 'Capacity', columns: [S('Phase', 18), S('Go-live', 12), N('Installed kW'), N('Committed kW'), N('Reserve kW'), N('Power headroom kW'), N('Cooling headroom kW'), N('Space headroom kW'), N('Grid headroom kW'), N('Racks'), N('Halls'), S('Binds', 10)],
    rows: ev.ladder.map(r => [r.phase.name, isoDay(r.phase.goLive), r.installedKw, r.committedKw, r.reserveKw, r.headrooms?.power ?? null, r.headrooms?.cooling ?? null, r.headrooms?.space ?? null, r.headrooms?.grid ?? null, r.racks, r.halls, r.bindingConstraint === 'none' ? 'Nothing' : sentence(r.bindingConstraint)]) });
  if (ev.findings.length) out.push({ name: 'Rule checks', columns: [S('Rule', 12), S('Check', 36), S('Area', 18), S('Must or should', 10), S('Value', 16), N('Threshold'), S('Standard or source', 24), S('Result', 12), S('Detail', 60)],
    rows: ev.findings.map(f => [f.rule.id, f.rule.title, ASPECT_LABEL[f.rule.aspect], f.rule.severity === 'hard' ? 'Must' : 'Should', f.value ? usdText(f.value) : '', f.rule.threshold ?? null, f.rule.standard ?? f.rule.source ?? '', FINDING_TEXT[f.status], usdText(f.detail)]) });
  if (plan.risks.length) out.push({ name: 'Risks', columns: [S('Risk', 40), S('Area', 14), S('Probability', 10), S('Impact', 10), S('Mitigation', 50), S('Owner', 18)], rows: plan.risks.map(r => [r.title, r.domain, r.probability, r.impact, usdText((r as { mitigation?: string }).mitigation ?? ''), r.owner]) });
  if (plan.permits.length) out.push({ name: 'Permits', columns: [S('Permit', 34), S('Authority', 28), N('Lead weeks'), S('Needed before', 12), S('Status', 12), S('Filed', 12)], rows: plan.permits.map(p => [p.name, p.authority, p.leadWeeks, isoDay(p.neededBefore), p.status, isoDay(p.appliedAt)]) });
  if (pack.init.projects.length) out.push({ name: 'Projects', columns: [S('Project', 50), S('Phase', 16), S('Start', 12), S('End', 12), M('Budget'), S('Gate', 30), S('Late', 6), S('Budget basis', 50)],
    rows: pack.init.projects.map(p => [p.name, p.shared ? 'Runs once' : p.phaseName ?? '', isoDay(p.start), isoDay(p.end), usd(p.budget), [p.gate, ...(p.gatedBy ?? [])].join('; '), p.late ? 'Yes' : 'No', usdText(p.budgetBasis ?? '')]) });
  if (pack.init.atps?.length) out.push({ name: 'Acceptance tests', columns: [S('Test', 40), S('Level', 14), S('System', 16), S('Phase', 16), N('Step'), S('Step description', 50), S('Method', 20), S('Expected', 40)],
    rows: pack.init.atps.flatMap(t => t.steps.map((st, k) => [t.name, t.level, t.system, t.phaseName ?? '', k + 1, st.description, st.method, st.expected])) });
  const defs = ev.resolved?.params ?? [];
  out.push({ name: 'Inputs', columns: [S('Input', 34), S('Key', 22), S('Value', 18), S('Unit', 10), S('Source', 18), S('Template default', 16), S('Note', 50)],
    rows: Object.entries(ev.params).map(([k, v]) => { const d = defs.find(p => p.key === k); return [d?.label ?? labelOfKey(k), k, typeof v.value === 'boolean' ? (v.value ? 'Yes' : 'No') : typeof v.value === 'string' ? humanJson(v.value) : v.value, d?.unit ?? '', SOURCE_LABEL[v.source], d?.default === undefined ? '' : String(d.default), usdText(v.note ?? '')]; }) });
  out.push({ name: 'Approvals', columns: [N('Step'), S('Role', 34), S('Approver', 28), S('Decision', 18), S('Date', 12), S('Comment', 50)], rows: approvals.map(a => [a.step, a.role, a.approver ?? '', a.decision, a.at ?? '', [a.comment, ...(a.conditions ?? [])].filter(Boolean).join(' · ')]) });
  if (pack.sheets.length) out.push({ name: 'Drawing register', columns: [S('Drawing number', 18), S('Title', 40), S('Discipline', 14), S('Revision', 8)], rows: pack.sheets.map(sh => [sh.number, sh.title, ({ A: 'Architectural', E: 'Electrical', M: 'Mechanical', N: 'Network', G: 'General' } as Record<string, string>)[sh.number.split('-').slice(-2, -1)[0]] ?? 'General', plan.revision ?? 'A']) });
  return out;
}
