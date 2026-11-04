/* Which modules the seeded plan types are built from (PlannerTemplate.modules). P2B's seed left aspect modules, rule sets and demand
   profiles unattached: every plan type carried its own copies of the same inputs and rules. Here a plan type uses a module when it
   already carries ALL of that module's rules and inputs (one module per area, the one whose defaults match best), and the copies
   that are identical to the module's are then dropped from the plan type, so the module becomes their source. Differing copies stay
   on the plan type as its overrides. Every plan therefore resolves to exactly the same inputs and rules as before (same values,
   same results); only where they come from changes. The GPU hall variant also uses the GPU-heavy demand profile (wizard default). */
import type * as T from '../../planner/p2b/types';
import { resolveTemplate } from '../../planner/lib/engine';

const AREA = (m: T.PlannerTemplate) => (m.kind === 'ruleset' ? `ruleset:${m.id}` : m.labels.find(l => l !== 'aspect') ?? m.id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function linkSeedModules(templates: T.PlannerTemplate[]) {
  const mods = templates.filter(t => (t.kind === 'aspect' || t.kind === 'ruleset') && !t.isDeleted);
  /* rule sets that inherit (regional variants) are a choice for the site, not a shared part: only root rule sets are linked */
  const roots = mods.filter(m => !m.inheritsFrom);
  for (const p of templates.filter(t => t.kind === 'plan' && !t.isDeleted && !t.inheritsFrom)) {
    const r = resolveTemplate(p.id, templates); if (!r) continue;
    const rules = new Map(r.rules.map(x => [x.id, x])), params = new Map(r.params.map(x => [x.key, x]));
    const best = new Map<string, { m: T.PlannerTemplate; score: number }>();
    for (const m of roots) {
      if (!m.rules.length && !m.params.length) continue;
      if (!m.rules.every(x => rules.has(x.id)) || !m.params.every(x => params.has(x.key))) continue;
      const score = m.params.filter(x => same(params.get(x.key)!.default, x.default)).length + m.rules.filter(x => same(rules.get(x.id), x)).length;
      const a = AREA(m), cur = best.get(a); if (!cur || score > cur.score) best.set(a, { m, score });
    }
    const use = [...best.values()].map(b => b.m);
    if (!use.length) continue;
    p.modules = use.map(m => m.id);
    const fromMods = (key: 'rules' | 'params') => use.flatMap(m => m[key] as (T.PlannerRuleDef | T.PlannerParamDef)[]);
    p.rules = p.rules.filter(x => !fromMods('rules').some(y => same(y, x)));
    p.params = p.params.filter(x => !fromMods('params').some(y => same(y, x)));
  }
  const gpu = templates.find(t => t.kind === 'demand' && t.id === 'TPL-DEMAND-GPU');
  for (const v of templates.filter(t => t.kind === 'plan' && t.inheritsFrom && t.labels.includes('gpu'))) if (gpu) v.modules = [...(v.modules ?? []), gpu.id];
}
