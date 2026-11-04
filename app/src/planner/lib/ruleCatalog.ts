/* Rule catalogue for Planner → Benchmarks → Rules. A rule is a check the engine knows (engine.ts evaluateRules + the family scope
   checks: the logic is code, never configured) carried by one or more templates with its own settings: name, area, must / should pass,
   limit, standard. Templates inherit rules down their chain and a nearer template's copy with the same id overrides (resolveTemplate),
   so a per-template override is simply a differing copy. Users configure rules (settings, which templates carry them) and add new rules
   from the catalogue of checks; they never write check logic. ruleImpact re-evaluates the open plans with the changed templates so the
   drawer can say which plans would start or stop failing before anything is saved. */
import type * as T from '../p2b/types';
import { evaluate, type EstateActuals } from './engine';
import type { PlannerData } from './plannerData';
import { RULE_PLAIN } from './labels';
import { RACK_BLOCK_PCT } from './placement';

/** The checks that compare against a configurable limit, what the limit means and the value used when a rule sets none. */
export const LIMIT_INFO: Record<string, { label: string; unit: string; dflt: number; dir: 'min' | 'max'; note?: string }> = {
  'generator-margin': { label: 'Generator capacity over design load', unit: '×', dflt: 1.25, dir: 'min' },
  'fuel-hours': { label: 'Fuel on site', unit: 'hours', dflt: 24, dir: 'min', note: 'Tier IV always needs 48 hours.' },
  'cooling-n1': { label: 'Cooling over IT load with one unit lost', unit: '×', dflt: 1.1, dir: 'min' },
  'liquid-above-density': { label: 'Rack density above which liquid cooling is required', unit: 'kW / rack', dflt: 30, dir: 'max' },
  'inlet-envelope': { label: 'Highest inlet set point', unit: '°C', dflt: 27, dir: 'max' },
  'floor-loading': { label: 'Floor loading needed for liquid-cooled racks', unit: 'kg / rack', dflt: 1400, dir: 'min' },
  'carrier-diversity': { label: 'Fewest carrier entries', unit: 'carriers', dflt: 2, dir: 'min' },
  'oversub-gpu': { label: 'Highest fabric oversubscription on GPU-heavy plans', unit: ': 1', dflt: 3, dir: 'max' },
  payback: { label: 'Longest payback', unit: 'months', dflt: 96, dir: 'max' },
  'bom-reconciliation': { label: 'Largest gap between the bill of materials and the CapEx estimate', unit: '%', dflt: 15, dir: 'max' },
  'ins-rack-power': { label: 'Rack power at which placement is blocked', unit: '% of budget', dflt: RACK_BLOCK_PCT, dir: 'max', note: 'Placement warns 5 points below it.' },
};
export const RULE_TEMPLATE_KINDS: T.PlannerTemplateKind[] = ['plan', 'ruleset', 'aspect', 'profile'];

export interface RuleCarrier { template: T.PlannerTemplate; rule: T.PlannerRuleDef }
export interface RuleEntry { id: string; rule: T.PlannerRuleDef; carriers: RuleCarrier[]; differs: boolean }
const sig = (r: T.PlannerRuleDef) => JSON.stringify([r.title, r.aspect, r.severity, r.threshold ?? null, r.standard ?? null, r.source ?? null]);

/** Every rule once, with the templates that carry it (their own copies) and whether those copies differ (overrides). */
export function ruleIndex(templates: T.PlannerTemplate[]): RuleEntry[] {
  const by = new Map<string, RuleEntry>();
  for (const t of templates) if (!t.versionOf && !t.isDeleted) for (const r of t.rules) {
    const e = by.get(r.id) ?? { id: r.id, rule: r, carriers: [], differs: false };
    e.carriers.push({ template: t, rule: r }); by.set(r.id, e);
  }
  for (const e of by.values()) {
    /* the shared definition = the most common copy; the others are overrides */
    const n = new Map<string, number>(); e.carriers.forEach(c => n.set(sig(c.rule), (n.get(sig(c.rule)) ?? 0) + 1));
    const top = [...n].sort((a, b) => b[1] - a[1])[0][0];
    e.rule = e.carriers.find(c => sig(c.rule) === top)!.rule; e.differs = n.size > 1;
  }
  return [...by.values()];
}
export const isOverride = (e: RuleEntry, c: RuleCarrier) => sig(c.rule) !== sig(e.rule);

/** Every check rules use today, with the plain sentence, its area and the templates whose rules use it (where it is known to work). */
export interface CheckEntry { check: string; plain: string; aspect: T.PlannerAspect; usedIn: T.PlannerTemplate[]; rules: string[] }
export function checkCatalog(templates: T.PlannerTemplate[]): CheckEntry[] {
  const by = new Map<string, CheckEntry>();
  for (const t of templates) if (!t.versionOf && !t.isDeleted) for (const r of t.rules) {
    const c = by.get(r.check) ?? { check: r.check, plain: RULE_PLAIN[r.check] ?? r.title, aspect: r.aspect, usedIn: [], rules: [] };
    if (!c.usedIn.includes(t)) c.usedIn.push(t); if (!c.rules.includes(r.id)) c.rules.push(r.id); by.set(r.check, c);
  }
  return [...by.values()].sort((a, b) => a.aspect.localeCompare(b.aspect) || a.plain.localeCompare(b.plain));
}

/** Next free id for a rule added here: R-CUS-01, R-CUS-02 … */
export function nextRuleId(templates: T.PlannerTemplate[]) {
  const used = new Set(templates.flatMap(t => t.rules.map(r => r.id)));
  for (let i = 1; ; i++) { const id = `R-CUS-${String(i).padStart(2, '0')}`; if (!used.has(id)) return id; }
}

/** The templates as they would be after setting (rule) or removing (null) the rule in each named template. */
export function withRule(templates: T.PlannerTemplate[], ruleId: string, edits: Record<string, T.PlannerRuleDef | null>): T.PlannerTemplate[] {
  return templates.map(t => {
    if (!(t.id in edits)) return t;
    const e = edits[t.id], has = t.rules.some(r => r.id === ruleId);
    const rules = e === null ? t.rules.filter(r => r.id !== ruleId) : has ? t.rules.map(r => (r.id === ruleId ? e : r)) : [...t.rules, e];
    return { ...t, rules };
  });
}

/** Plans re-checked when a rule changes: the ones still being worked on. Approved, executing and completed plans keep their baseline. */
export const OPEN_PLAN_STATUSES: T.PlannerPlan['status'][] = ['Draft', 'In review', 'Rejected', 'On hold'];
export type RuleStatus = 'pass' | 'fail' | 'warn' | 'n/a' | 'absent';
export interface ImpactRow { plan: T.PlannerPlan; before: RuleStatus; after: RuleStatus; detail?: string }
/** This rule's result on every open plan before and after the change (absent = no template in the plan's chain carries it). */
export function ruleImpact(plans: T.PlannerPlan[], before: T.PlannerTemplate[], after: T.PlannerTemplate[], ruleId: string, benchmarks: T.PlannerBenchmark[], actualsOf: (p: T.PlannerPlan) => EstateActuals, data: PlannerData): ImpactRow[] {
  const rows: ImpactRow[] = [];
  const res = (p: T.PlannerPlan, tpls: T.PlannerTemplate[]) => { const f = evaluate(p, null, tpls, benchmarks, actualsOf(p), data).findings.find(x => x.rule.id === ruleId); return { s: (f?.status ?? 'absent') as RuleStatus, d: f?.detail }; };
  for (const p of plans) {
    if (!OPEN_PLAN_STATUSES.includes(p.status) || p.isDeleted) continue;
    const chain = new Set<string>(); let t = after.find(x => x.id === p.templateId);
    while (t && !chain.has(t.id)) { chain.add(t.id); t = t.inheritsFrom ? after.find(x => x.id === t!.inheritsFrom) : undefined; }
    const touched = [...chain].some(id => { const a = before.find(x => x.id === id), b = after.find(x => x.id === id); return a !== b; });
    if (!touched) continue;
    const b = res(p, before), a = res(p, after);
    rows.push({ plan: p, before: b.s, after: a.s, detail: a.d ?? b.d });
  }
  return rows;
}
