/* Planner templates: modules feed the plan and plans stay pinned to the module versions they were approved with
   (npx tsx --tsconfig tsconfig.app.json --import ./.qa/lib/css-hook.mjs .qa/template-pin-check.ts [persona] [geo]).
   A new version of the power commissioning checklist (one more L2 test) and of the basis-of-design document (a section left out,
   one added) is published in memory: a plan pinned to the old versions keeps its test plans and document, the same plan unpinned
   takes the new ones, and moduleDrift names both. */
import { setGeo, setPersona } from '../src/mock/server';
import * as S from '../src/mock/server';
import { evaluate } from '../src/planner/lib/engine';
import { buildBasisOfDesign, buildBom, buildInitiation } from '../src/planner/lib/outputs';
import { contentOf } from '../src/planner/lib/templateCatalog';
import { moduleDrift } from '../src/planner/lib/governance';
import { plannerDataFromSnapshot } from '../src/planner/lib/plannerData';
import type * as T from '../src/planner/p2b/types';
const persona = (process.argv[2] ?? 'neocloud') as Parameters<typeof setPersona>[0]; const geo = (process.argv[3] ?? 'us') as Parameters<typeof setGeo>[0];
setGeo(geo); setPersona(persona);
const st = S.plannerStore(); const snap: Record<string, unknown> = {}; for (const e of st.entities()) snap[e] = st.getAllRaw(e);
const data = plannerDataFromSnapshot(snap);
const tpls = st.getAllRaw('plannerTemplates') as unknown as T.PlannerTemplate[]; const bms = st.getAllRaw('plannerBenchmarks') as unknown as T.PlannerBenchmark[];
let bad = 0; const fail = (m: string) => { bad++; console.log('FAIL', m); }; const ok = (m: string) => console.log('ok  ', m);
const plan = (st.getAllRaw('plannerPlans') as unknown as T.PlannerPlan[]).find(p => p.moduleVersions?.['TPL-CHK-CX-POWER'] && p.templateVersion !== undefined);
if (!plan) { console.log('FAIL no plan pinned to the power commissioning checklist'); process.exit(1); }
const out = (p: T.PlannerPlan, ts: T.PlannerTemplate[]) => { const ev = evaluate(p, null, ts, bms, undefined, data); const t = ts.find(x => x.id === p.templateId);
  return { atps: buildInitiation(p, ev, t, buildBom(p, ev, bms)).atps ?? [], bod: buildBasisOfDesign(p, ev, t, 'X').map(s => s.title.replace(/^\d+\.\s*/, '')) }; };
const before = out(plan, tpls);
ok(`${plan.plnId} (${plan.status}): ${before.atps.length} test plans, ${before.bod.length} document sections`);
const bump = (id: string, change: (t: T.PlannerTemplate) => Partial<T.PlannerTemplate>) => tpls.map(t => (t.id === id ? { ...t, ...change(t), version: t.version + 1, history: [...(t.history ?? []), { version: t.version, at: '', by: 'qa', content: contentOf(t) }] } : t));
let next = bump('TPL-CHK-CX-POWER', t => ({ items: [...(t.items ?? []), 'L2 SAT | Thermal scan of every busway joint | IR camera | No joint above 60 °C'] }));
const tplAfter = next;
next = bump('TPL-DOC-BOD', t => ({ items: [...(t.items ?? []).filter(i => i !== 'Sustainability'), 'Lessons from the last build'] })).map(t => (t.id === 'TPL-CHK-CX-POWER' ? tplAfter.find(x => x.id === t.id)! : t));
const pinned = out(plan, next), free = out({ ...plan, templateVersion: undefined, moduleVersions: undefined }, next);
JSON.stringify(pinned) === JSON.stringify(before) ? ok('pinned plan keeps its test plans and document') : fail('pinned plan moved with the new module versions');
const l2 = (a: typeof before.atps) => a.filter(x => x.system === 'Power' && x.level === 'L2 SAT').reduce((n, x) => n + x.steps.length, 0);
l2(free.atps) > l2(before.atps) ? ok(`unpinned: power L2 tests ${l2(before.atps)} → ${l2(free.atps)}`) : fail('unpinned plan did not take the new checklist');
!free.bod.includes('Sustainability') && free.bod.includes('Lessons from the last build') ? ok('unpinned: document drops Sustainability, adds the new section') : fail(`unpinned document: ${free.bod.join(', ')}`);
const d = moduleDrift(plan, next); d.length === 2 ? ok(`drift: ${d.map(x => `${x.name} v${x.from} → v${x.to}`).join('; ')}`) : fail(`drift ${JSON.stringify(d)}`);
console.log(bad ? `pin: ${bad} FAILED` : 'pin ok'); process.exit(bad ? 1 : 0);
