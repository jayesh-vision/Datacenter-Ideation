/* Template lifecycle for Planner → Templates. A published template is never edited in place: "Edit" opens a draft that is its next
   version (`versionOf`), the live version keeps serving plans until the draft is published, and publishing copies the draft onto the
   live record (same id, so plans, variants and the wizard keep pointing at it) after storing the old content in `history`. Plans
   pinned to an older version (templateVersion, set at submission / approval) are evaluated against that stored content
   (`pinnedTemplates`, used by evaluate). Publishing a new version of a template that plans or variants use needs a second template
   approver; a brand-new or unused template publishes directly. */
import type * as T from '../p2b/types';
import { evaluate, type EstateActuals } from './engine';
import type { PlannerData } from './plannerData';
import { OPEN_PLAN_STATUSES } from './ruleCatalog';
import { planFigures, type PlanFigures } from './benchCatalog';
import { STEP_ROLE } from './governance';

export const TEMPLATE_APPROVER_ROLE = 'Capacity Planner';
export const CONTENT_KEYS = ['name', 'description', 'ownerName', 'params', 'rules', 'requiredAspects', 'outputs', 'approvalPath', 'executesAs', 'blueprintKey', 'appliesTo', 'inheritsFrom', 'demand', 'items', 'scope', 'dcTypeKey', 'labels'] as const satisfies readonly (keyof T.PlannerTemplateContent)[];
export const ASPECT_ORDER: T.PlannerAspect[] = ['space', 'power', 'cooling', 'network', 'it', 'fire', 'security', 'sustainability', 'resilience', 'operations', 'supply', 'schedule', 'finance', 'compliance', 'commissioning', 'migration', 'risk'];
/** Kinds a user can create here. Site types are the engine's sizing catalogue (code), so they are edited, not created. */
export const NEW_KINDS: { kind: T.PlannerTemplateKind; label: string; sub: string }[] = [
  { kind: 'plan', label: 'Plan type', sub: 'The questions, rules and approvers of one kind of plan. Starts from an existing plan type of the same family.' },
  { kind: 'aspect', label: 'Aspect module', sub: 'A reusable design for one area (power 2N, liquid cooling …) with its inputs and rules.' },
  { kind: 'ruleset', label: 'Rule set', sub: 'A group of rules, for example a regional variant.' },
  { kind: 'demand', label: 'Demand profile', sub: 'Workload mix (GPU / compute / storage) and phasing.' },
  { kind: 'document', label: 'Document', sub: 'The sections of a document the plan produces.' },
  { kind: 'checklist', label: 'Checklist', sub: 'Items checked before a gate.' },
];
/** Steps a template's approval path can name (governance maps each to a role; "Finance (by amount)" follows the CapEx band). */
export const APPROVAL_STEPS = [...Object.keys(STEP_ROLE).filter(k => k !== 'Finance'), 'Finance (by amount)'];
export const EXECUTES_AS: NonNullable<T.PlannerTemplate['executesAs']>[] = ['change', 'project', 'programme', 'portfolio'];

const clone = <X>(x: X): X => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
export function contentOf(t: T.PlannerTemplate): T.PlannerTemplateContent {
  return Object.fromEntries(CONTENT_KEYS.map(k => [k, clone(t[k])])) as unknown as T.PlannerTemplateContent;
}
export const sameContent = (a: T.PlannerTemplate, b: T.PlannerTemplate) => CONTENT_KEYS.every(k => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

/** Templates the planner and the lists see: no deleted records and no draft versions (those live beside their published template). */
export const liveTemplates = (all: T.PlannerTemplate[]) => all.filter(t => !t.isDeleted && !t.versionOf);
export const draftVersionOf = (t: T.PlannerTemplate, all: T.PlannerTemplate[]) => all.find(x => x.versionOf === t.id && !x.isDeleted);

export { pinnedTemplates } from './engine';

/** Plans and templates that depend on a template: every plan whose chain includes it (site types: plans of that type), variants. */
export function dependents(t: T.PlannerTemplate, all: T.PlannerTemplate[], plans: T.PlannerPlan[]) {
  const byId = new Map(all.map(x => [x.id, x]));
  const inChain = (id: string) => { const seen = new Set<string>(); let c = byId.get(id); while (c && !seen.has(c.id)) { if (c.id === t.id) return true; seen.add(c.id); c = c.inheritsFrom ? byId.get(c.inheritsFrom) : undefined; } return false; };
  const ps = plans.filter(p => !p.isDeleted && (inChain(p.templateId) || (t.kind === 'profile' && !!t.dcTypeKey && p.dcTypeKey === t.dcTypeKey)));
  const open = ps.filter(p => OPEN_PLAN_STATUSES.includes(p.status));
  const variants = liveTemplates(all).filter(x => x.inheritsFrom === t.id);
  return { plans: ps, open, live: ps.filter(p => !open.includes(p) && p.status !== 'Cancelled'), variants };
}
/** A new version of a template in use goes to a second template approver; a new or unused template publishes directly. */
export function needsPublishApproval(draft: T.PlannerTemplate, all: T.PlannerTemplate[], plans: T.PlannerPlan[]) {
  const live = draft.versionOf ? all.find(x => x.id === draft.versionOf) : undefined;
  if (!live) return false;
  const d = dependents(live, all, plans); return d.plans.length > 0 || d.variants.length > 0;
}

/** Problems that stop a draft from being saved or published. */
export function templateErrors(t: T.PlannerTemplate, all: T.PlannerTemplate[]): string[] {
  const e: string[] = [];
  if (!t.name.trim()) e.push('Give it a name.');
  const clash = liveTemplates(all).find(x => x.id !== t.id && x.id !== t.versionOf && x.kind === t.kind && x.name.trim().toLowerCase() === t.name.trim().toLowerCase());
  if (clash) e.push(`Another ${t.kind === 'plan' ? 'plan type' : 'template'} is already called “${clash.name}”.`);
  for (const p of t.params) {
    if (p.type === 'number') {
      if (p.min !== undefined && p.max !== undefined && p.min > p.max) e.push(`${p.label}: the lowest allowed value is above the highest.`);
      if (typeof p.default === 'number' && ((p.min !== undefined && p.default < p.min) || (p.max !== undefined && p.default > p.max))) e.push(`${p.label}: the default is outside the allowed range.`);
    }
    if (p.type === 'select' && p.default !== undefined && p.default !== '' && !(p.options ?? []).includes(String(p.default))) e.push(`${p.label}: the default is not one of the options.`);
  }
  if (t.kind === 'plan' && !t.requiredAspects.some(a => a.depth === 'full')) e.push('A plan type covers at least one area in full.');
  if (t.demand) { const s = t.demand.gpuPct + t.demand.computePct + t.demand.storagePct; if (Math.round(s) !== 100) e.push(`The workload mix adds up to ${s}%, not 100%.`); const ph = t.demand.phases.reduce((a, p) => a + p.sharePct, 0); if (t.demand.phases.length && Math.round(ph) !== 100) e.push(`The phases add up to ${ph}%, not 100%.`); }
  if ((t.kind === 'document' || t.kind === 'checklist') && !(t.items ?? []).some(i => i.trim())) e.push(`A ${t.kind} needs at least one ${t.kind === 'checklist' ? 'item' : 'section'}.`);
  return e;
}

/* ------------------------------------------------------------------ what changed between two versions, in words */
export interface TplChange { area: string; what: string; from?: string; to?: string }
const pv = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));
export function templateDiff(a: T.PlannerTemplateContent, b: T.PlannerTemplateContent, names: (id?: string) => string = id => id ?? '—', aspectLabel: (x: T.PlannerAspect) => string = x => x): TplChange[] {
  const out: TplChange[] = [];
  const simple: [string, string, (x: T.PlannerTemplateContent) => string][] = [
    ['name', 'Name', x => x.name], ['description', 'Description', x => x.description], ['ownerName', 'Owner', x => x.ownerName], ['appliesTo', 'Applies to', x => x.appliesTo?.label],
    ['executesAs', 'Becomes a', x => pv(x.executesAs)], ['inheritsFrom', 'Inherits from', x => names(x.inheritsFrom)], ['labels', 'Labels', x => (x.labels ?? []).join(', ')],
  ];
  for (const [, label, f] of simple) if (f(a) !== f(b)) out.push({ area: 'Details', what: label, from: f(a) || '—', to: f(b) || '—' });
  const depth = (x: T.PlannerTemplateContent, s: T.PlannerAspect) => x.requiredAspects.find(r => r.aspect === s)?.depth ?? 'skipped';
  const DEPTH: Record<string, string> = { full: 'In full', summary: 'Brief', skipped: 'Skipped' };
  for (const s of ASPECT_ORDER) if (depth(a, s) !== depth(b, s)) out.push({ area: 'Wizard areas', what: aspectLabel(s), from: DEPTH[depth(a, s)], to: DEPTH[depth(b, s)] });
  if (a.approvalPath.join('|') !== b.approvalPath.join('|')) out.push({ area: 'Approval path', what: 'Steps', from: a.approvalPath.join(' → ') || 'None', to: b.approvalPath.join(' → ') || 'None' });
  const added = <X>(xs: X[], ys: X[]) => ys.filter(y => !xs.includes(y));
  for (const o of added(a.outputs, b.outputs)) out.push({ area: 'Outputs', what: o, to: 'Added' });
  for (const o of added(b.outputs, a.outputs)) out.push({ area: 'Outputs', what: o, from: 'Removed' });
  const pa = new Map(a.params.map(p => [p.key, p])), pb = new Map(b.params.map(p => [p.key, p]));
  const range = (p: T.PlannerParamDef) => (p.type === 'select' ? (p.options ?? []).join(', ') : p.type === 'number' ? `${pv(p.min)} – ${pv(p.max)}` : '');
  for (const [k, p] of pb) { const o = pa.get(k);
    if (!o) { out.push({ area: 'Inputs', what: p.label, to: `Set here · default ${pv(p.default)}${p.unit ? ` ${p.unit}` : ''}` }); continue; }
    if (JSON.stringify(o.default) !== JSON.stringify(p.default)) out.push({ area: 'Inputs', what: `${p.label} default`, from: pv(o.default), to: pv(p.default) });
    if (range(o) !== range(p)) out.push({ area: 'Inputs', what: `${p.label} ${p.type === 'select' ? 'options' : 'allowed range'}`, from: range(o), to: range(p) });
    if (o.label !== p.label || (o.help ?? '') !== (p.help ?? '')) out.push({ area: 'Inputs', what: `${o.label} wording`, from: o.label, to: p.label });
  }
  for (const [k, o] of pa) if (!pb.has(k)) out.push({ area: 'Inputs', what: o.label, from: 'Set here', to: 'Inherited or default' });
  const ra = new Map(a.rules.map(r => [r.id, r])), rb = new Map(b.rules.map(r => [r.id, r]));
  for (const [id, r] of rb) { const o = ra.get(id); if (!o) out.push({ area: 'Rules', what: r.title, to: 'Added' }); else if (JSON.stringify(o) !== JSON.stringify(r)) out.push({ area: 'Rules', what: r.title, from: `${o.severity === 'hard' ? 'Must' : 'Should'}${o.threshold !== undefined ? ` · ${o.threshold}` : ''}`, to: `${r.severity === 'hard' ? 'Must' : 'Should'}${r.threshold !== undefined ? ` · ${r.threshold}` : ''}` }); }
  for (const [id, o] of ra) if (!rb.has(id)) out.push({ area: 'Rules', what: o.title, from: 'Removed' });
  const mix = (x: T.PlannerTemplateContent) => (x.demand ? `${x.demand.gpuPct} / ${x.demand.computePct} / ${x.demand.storagePct} %` : '—');
  const phases = (x: T.PlannerTemplateContent) => (x.demand?.phases ?? []).map(p => `${p.name} ${p.sharePct}% @${p.monthsFromStart}m`).join(', ');
  if (mix(a) !== mix(b)) out.push({ area: 'Demand', what: 'GPU / compute / storage', from: mix(a), to: mix(b) });
  if (phases(a) !== phases(b)) out.push({ area: 'Demand', what: 'Phases', from: phases(a) || '—', to: phases(b) || '—' });
  for (const i of added(a.items ?? [], b.items ?? [])) out.push({ area: 'Items', what: i, to: 'Added' });
  for (const i of added(b.items ?? [], a.items ?? [])) out.push({ area: 'Items', what: i, from: 'Removed' });
  return out;
}

/** Every input any template defines, once (the engine reads these keys; a new key would be read by nothing). */
export function paramCatalog(all: T.PlannerTemplate[]): T.PlannerParamDef[] {
  const m = new Map<string, T.PlannerParamDef>();
  for (const t of liveTemplates(all)) for (const p of t.params) if (!m.has(p.key)) m.set(p.key, p);
  return [...m.values()];
}
export const outputCatalog = (all: T.PlannerTemplate[]) => [...new Set(liveTemplates(all).flatMap(t => t.outputs))].sort();

/** Open plans on this template's chain, estimated with today's template and with the draft's content. */
export interface TplImpactRow { plan: T.PlannerPlan; before: PlanFigures; after: PlanFigures }
export function templateImpact(plans: T.PlannerPlan[], all: T.PlannerTemplate[], liveId: string, content: T.PlannerTemplateContent, benchmarks: T.PlannerBenchmark[], actualsOf: (p: T.PlannerPlan) => EstateActuals, data: PlannerData): { rows: TplImpactRow[]; checked: number } {
  const before = liveTemplates(all);
  const live = before.find(t => t.id === liveId); if (!live) return { rows: [], checked: 0 };
  const after = before.map(t => (t.id === liveId ? { ...t, ...clone(content) } : t));
  const open = dependents(live, before, plans).open;
  const rows: TplImpactRow[] = [];
  for (const p of open) {
    if (p.templateId === liveId && p.templateVersion !== undefined) continue; /* pinned: keeps its version */
    const a = planFigures(evaluate(p, null, before, benchmarks, actualsOf(p), data)), b = planFigures(evaluate(p, null, after, benchmarks, actualsOf(p), data));
    if (JSON.stringify(a) !== JSON.stringify(b)) rows.push({ plan: p, before: a, after: b });
  }
  return { rows, checked: open.length };
}
