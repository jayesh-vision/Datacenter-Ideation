/* Custom site types in the planner engine (npx tsx --tsconfig tsconfig.app.json --import ./.qa/lib/css-hook.mjs .qa/sitetype-check.ts [persona] [geo]).
   A published custom type based on the AI / HPC GPU factory joins the catalogue; the same plan on it evaluates, reads the base type's
   CapEx benchmark (no value of its own), and takes its own PUE target / capacity limits; a draft or a deleted one is not in the catalogue;
   the built-in plans evaluate exactly as before (no custom type changes anything that does not use it). */
import { setGeo, setPersona } from '../src/mock/server';
import * as S from '../src/mock/server';
import { evaluate } from '../src/planner/lib/engine';
import { plannerDataFromSnapshot } from '../src/planner/lib/plannerData';
import { DC_TYPE_CATALOG, benchForType, capacityThresholds, customDcType, dcTypeProfile, pueTargetFor, syncSiteTypes } from '../src/planner/p2b/dcTypes';
import type * as T from '../src/planner/p2b/types';
const persona = (process.argv[2] ?? 'neocloud') as Parameters<typeof setPersona>[0]; const geo = (process.argv[3] ?? 'us') as Parameters<typeof setGeo>[0];
setGeo(geo); setPersona(persona);
const st = S.plannerStore(); const snap: Record<string, unknown> = {}; for (const e of st.entities()) snap[e] = st.getAllRaw(e);
const data = plannerDataFromSnapshot(snap);
const tpls = st.getAllRaw('plannerTemplates') as unknown as T.PlannerTemplate[]; const bms = st.getAllRaw('plannerBenchmarks') as unknown as T.PlannerBenchmark[];
const plans = st.getAllRaw('plannerPlans') as unknown as T.PlannerPlan[];
let bad = 0; const fail = (m: string) => { bad++; console.log('FAIL', m); }; const ok = (m: string) => console.log('ok  ', m);
const sig = (ev: ReturnType<typeof evaluate>) => JSON.stringify([ev.estimate.capexTotal, ev.estimate.opexMonthly, ev.sizing.itKw, ev.sizing.racks, ev.schedule.length, ev.findings.map(r => `${r.rule.id}:${r.status}`)]);
const before = plans.map(p => sig(evaluate(p, null, tpls, bms, undefined, data)));
DC_TYPE_CATALOG.length === 17 ? ok('17 built-in site types') : fail(`catalogue starts with ${DC_TYPE_CATALOG.length}`);
const spec = { ...customDcType(dcTypeProfile('ai-gpu-factory')!, 'QA sovereign AI', 'SAI', []), pueTarget: 1.11, capacity: { rackPowerWarnPct: 88, rackPowerBlockPct: 96, coolingHeadroomMinPct: 9 } };
const base = tpls.find(t => t.kind === 'profile' && t.dcTypeKey === 'ai-gpu-factory')!;
const rec = { ...base, id: 'TPL-QA-ST', tplId: 'TPL-QA-ST', name: spec.name, dcTypeKey: spec.key, siteType: spec, status: 'draft' } as T.PlannerTemplate;
syncSiteTypes([...tpls, rec]); dcTypeProfile(spec.key) ? fail('a draft joined the catalogue') : ok('a draft is not in the catalogue');
const pub = { ...rec, status: 'published' } as T.PlannerTemplate; const all = [...tpls, pub];
syncSiteTypes(all);
dcTypeProfile(spec.key)?.name === 'QA sovereign AI' ? ok(`published: ${spec.key} in the catalogue (${DC_TYPE_CATALOG.length})`) : fail('published type missing');
pueTargetFor(spec.key) === 1.11 && capacityThresholds(spec.key).rackPowerBlockPct === 96 ? ok('its PUE target and capacity limits are read') : fail('own values not read');
const bm = benchForType(bms, 'capexPerKw', spec.key);
bm?.appliesTo.dcTypeKey === 'ai-gpu-factory' ? ok(`CapEx per kW falls back to the GPU factory's value (${bm.value})`) : fail(`no CapEx benchmark: ${JSON.stringify(bm?.appliesTo)}`);
const p0 = plans.find(p => p.dcTypeKey === 'ai-gpu-factory') ?? plans.find(p => p.scope === 'new-dc')!;
const evB = evaluate(p0, null, all, bms, undefined, data), evC = evaluate({ ...p0, dcTypeKey: spec.key }, null, all, bms, undefined, data);
Number.isFinite(evC.estimate.capexTotal) && evC.estimate.capexTotal > 0 ? ok(`${p0.plnId} on the custom type evaluates: CapEx ${Math.round(evC.estimate.capexTotal / 1e6)} M (base type ${Math.round(evB.estimate.capexTotal / 1e6)} M)`) : fail('custom plan has no CapEx');
evC.findings.some(r => /undefined|NaN/.test(r.detail)) ? fail('rule text has undefined / NaN') : ok(`${evC.findings.length} rule results, no undefined / NaN`);
const after = plans.map(p => sig(evaluate(p, null, all, bms, undefined, data)));
after.every((s, i) => s === before[i]) ? ok(`${plans.length} existing plans evaluate exactly as before`) : fail(`${after.filter((s, i) => s !== before[i]).length} existing plans moved`);
syncSiteTypes([...tpls, { ...pub, isDeleted: true }]); DC_TYPE_CATALOG.length === 17 ? ok('deleted: back to 17') : fail('deleted type still listed');
syncSiteTypes([...tpls, { ...pub, status: 'deprecated' }]); dcTypeProfile(spec.key)?.retired ? ok('retired: kept for its plans, marked retired') : fail('retired handling');
console.log(bad ? `site types: ${bad} FAILED` : 'site types engine ok'); process.exit(bad ? 1 : 0);
