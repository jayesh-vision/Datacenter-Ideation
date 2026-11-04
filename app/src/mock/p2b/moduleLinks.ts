/* Which modules the seeded plan types are built from (PlannerTemplate.modules). P2B's seed left aspect modules, rule sets and demand
   profiles unattached: every plan type carried its own copies of the same inputs and rules. Here a plan type uses a module when it
   already carries ALL of that module's rules and inputs (one module per area, the one whose defaults match best), and the copies
   that are identical to the module's are then dropped from the plan type, so the module becomes their source. Differing copies stay
   on the plan type as its overrides. Every plan therefore resolves to exactly the same inputs and rules as before (same values,
   same results); only where they come from changes. The GPU hall variant also uses the GPU-heavy demand profile (wizard default).
   Checklists and documents: the five commissioning checklists are marked with their test system and used by the plan types whose
   builds get commissioning test plans (new datacenter, site expansion), the edge acceptance checklist by edge rollout; every plan
   type uses the "Basis of design" document, whose sections become the planner's 14 standard sections in its order. So the test plans
   and the document come out as before (the document's sections are now numbered without gaps). Plans pinned to a template version
   are pinned to the module versions it was built from. */
import type * as T from '../../planner/p2b/types';
import { moduleVersionsOf, resolveTemplate } from '../../planner/lib/engine';
import { BOD_SECTIONS } from '../../planner/lib/outputs';
import type { AtpSystem } from '../../planner/p2b/enums';

const CX: [string, AtpSystem][] = [['TPL-CHK-CX-POWER', 'Power'], ['TPL-CHK-CX-COOLING', 'Cooling'], ['TPL-CHK-CX-CONTROLS', 'Controls'], ['TPL-CHK-CX-NETWORK', 'Network'], ['TPL-CHK-CX-IST', 'Integrated']];
const EDGE_SAT = 'TPL-CHK-EDGE-SAT', BOD = 'TPL-DOC-BOD';

const AREA = (m: T.PlannerTemplate) => (m.kind === 'ruleset' ? `ruleset:${m.id}` : m.labels.find(l => l !== 'aspect') ?? m.id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function linkSeedModules(templates: T.PlannerTemplate[], plans: T.PlannerPlan[]) {
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
  /* checklists and documents */
  const byId = new Map(templates.map(t => [t.id, t]));
  for (const [id, sys] of CX) { const c = byId.get(id); if (c) c.atpSystem = sys; }
  const sat = byId.get(EDGE_SAT); if (sat) { sat.atpSystem = 'Integrated'; sat.perSite = true; }
  const bod = byId.get(BOD); if (bod) bod.items = BOD_SECTIONS.map(([, n]) => n);
  for (const p of templates.filter(t => t.kind === 'plan' && !t.isDeleted && !t.inheritsFrom)) {
    const add = [...(bod ? [BOD] : []), ...(p.scope === 'new-dc' || p.scope === 'expansion' ? CX.map(([id]) => id).filter(id => byId.has(id)) : []), ...(p.scope === 'edge' && sat ? [EDGE_SAT] : [])];
    if (add.length) p.modules = [...(p.modules ?? []), ...add];
  }
  for (const pl of plans) if (pl.templateVersion !== undefined) pl.moduleVersions = moduleVersionsOf(pl.templateId, templates);
  for (const pl of plans) if (pl.baseline) pl.baseline.moduleVersions = moduleVersionsOf(pl.baseline.templateId, templates);
}
