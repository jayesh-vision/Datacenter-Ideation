/* Planner (P2B port) data check: every demo plan evaluates on our estate with finite figures; prints a table per plan.
   usage: npx tsx .qa/p2b-check.ts [persona] [geo] */
import { setGeo, setPersona } from '../src/mock/server';
import * as S from '../src/mock/server';
import { evaluate } from '../src/planner/lib/engine';
import { plannerDataFromSnapshot } from '../src/planner/lib/plannerData';
import type * as T from '../src/planner/p2b/types';
const persona = (process.argv[2] ?? 'neocloud') as Parameters<typeof setPersona>[0];
const geo = (process.argv[3] ?? 'in') as Parameters<typeof setGeo>[0];
setGeo(geo); setPersona(persona);
const st = S.plannerStore();
const snap: Record<string, unknown> = {}; for (const e of st.entities()) snap[e] = st.getAllRaw(e);
const data = plannerDataFromSnapshot(snap);
const tpls = st.getAllRaw('plannerTemplates') as unknown as T.PlannerTemplate[];
const bms = st.getAllRaw('plannerBenchmarks') as unknown as T.PlannerBenchmark[];
const scns = st.getAllRaw('plannerScenarios') as unknown as T.PlannerScenario[];
let bad = 0;
for (const p of st.getAllRaw('plannerPlans') as unknown as T.PlannerPlan[]) {
  const sc = scns.find(s => s.id === p.preferredScenarioId) ?? null;
  const ev = evaluate(p, sc, tpls, bms, undefined, data);
  const capex = ev.estimate.capexTotal;
  const nums = [capex, ev.sizing.itKw, ev.estimate.opexMonthly];
  const fin = nums.every(n => Number.isFinite(n));
  if (!fin) bad++;
  if (process.env.V) for (const f of ev.findings.filter(f => f.status === 'fail')) console.log(`      FAIL ${f.rule.id} ${f.rule.title}: ${f.detail}`);
  console.log(`${p.plnId} ${p.scope.padEnd(16)} ${p.status.padEnd(10)} ${String(p.dataCenterId ?? '-').padEnd(10)} it=${ev.sizing.itKw} capex=${Math.round(capex)} hard=${ev.hardFails} warn=${ev.softWarns} ${p.title}`);
}
console.log(bad ? `${bad} plan(s) with non-finite figures` : 'all plans evaluate');
