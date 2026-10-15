/* Build review documents in node (no browser): the same inputs the portal hook gathers, read from the mock store.
   Used by .qa/review-doc.ts and .qa/review-files.ts. Run with: npx tsx --import ./.qa/lib/css-hook.mjs <script> */
import * as S from '../../src/mock/server';
import { evaluate } from '../../src/planner/lib/engine';
import { plannerDataFromSnapshot } from '../../src/planner/lib/plannerData';
import { storeSourcing } from '../../src/planner/lib/usePlanner';
import { deliveryFor } from '../../src/planner/compat/delivery/handoff';
import { projectOf } from '../../src/screens/planning/pack/records';
import { buildReviewDoc } from '../../src/screens/planning/pack/review/build';
import type { ReviewDoc } from '../../src/screens/planning/pack/review/model';
import type * as T from '../../src/planner/p2b/types';

export function setup(persona = 'neocloud', geo = 'us') {
  S.setGeo(geo as Parameters<typeof S.setGeo>[0]); S.setPersona(persona as Parameters<typeof S.setPersona>[0]);
}
export function allPlans(): T.PlannerPlan[] { return (S.plannerStore().getAllRaw('plannerPlans') as unknown as T.PlannerPlan[]).filter(p => !p.isDeleted); }
export function docFor(plnId: string): ReviewDoc {
  const st = S.plannerStore();
  const snap: Record<string, unknown> = {}; for (const e of st.entities()) snap[e] = st.getAllRaw(e);
  const data = plannerDataFromSnapshot(snap);
  const tpls = st.getAllRaw('plannerTemplates') as unknown as T.PlannerTemplate[];
  const bms = st.getAllRaw('plannerBenchmarks') as unknown as T.PlannerBenchmark[];
  const scns = st.getAllRaw('plannerScenarios') as unknown as T.PlannerScenario[];
  const plans = allPlans();
  const plan = plans.find(p => p.plnId === plnId || p.id === plnId);
  if (!plan) throw new Error(`no plan ${plnId}`);
  const sid = plan.status === 'In review' ? plan.reviewScenarioId ?? plan.preferredScenarioId : plan.approvedScenarioId ?? plan.preferredScenarioId;
  const scenario = scns.find(s => s.id === sid) ?? null;
  const ev = evaluate(plan, scenario, tpls, bms, undefined, data);
  const template = ev.resolved?.template ?? tpls.find(t => t.id === plan.templateId);
  const dcs = (st.getAllRaw('dataCenters') as unknown as T.DataCenter[]);
  const campuses = (st.getAllRaw('campuses') as unknown as T.Campus[]);
  const site = dcs.find(d => d.id === plan.dataCenterId); const campus = campuses.find(c => c.id === plan.campusId);
  const siteName = site?.name ?? (plan.newSiteName ? `${plan.newSiteName}${campus ? ` · ${campus.name}` : ''}` : undefined) ?? campus?.name ?? 'New site';
  const delivery = ['Approved', 'Executing', 'Completed'].includes(plan.status) ? S.deliveryProject(projectOf(plan)) ?? null : null;
  return buildReviewDoc({ plan, ev, template, benchmarks: bms, data, siteName, sourcing: storeSourcing(), delivery, scheduleOrders: deliveryFor(plan.plnId)?.purchaseOrders, scenario, plans, generatedBy: 'QA', generatedAt: '2026-10-15T09:00:00.000Z' });
}

/** The document as plain text (for reading and for NaN / undefined / raw-key checks). */
export function docText(doc: ReviewDoc): string {
  const L: string[] = [];
  const m = doc.meta;
  L.push(`# ${m.docNumber} ${m.title}`, `${m.plnId} rev ${m.revision} · ${m.status} · ${m.scopeLabel} · ${m.site} · owner ${m.owner} · requested by ${m.requestedBy} · needed by ${m.neededBy} · ${m.currency} · ${m.templateName} ${m.templateVersion}`);
  L.push(`VERDICT [${m.verdict.tone}] ${m.verdict.text}`, m.headline.map(h => `${h.label}: ${h.value}${h.sub ? ` (${h.sub})` : ''}`).join(' | '));
  for (const s of doc.sections) {
    L.push('', `${'#'.repeat(Math.min(4, s.number.split('.').length + 1))} ${s.number} ${s.title} [${s.id}]`); if (s.summary) L.push(`_${s.summary}_`);
    for (const b of s.blocks) {
      switch (b.kind) {
        case 'para': L.push(b.text); break;
        case 'kv': L.push(...b.rows.map(r => `- ${r.label}: ${r.value}${r.source ? ` [${r.source}]` : ''}${r.tone ? ` {${r.tone}}` : ''}`)); break;
        case 'table': L.push(`TABLE ${b.title ?? ''} (${b.rows.length} rows)`, `| ${b.columns.map(c => c.label).join(' | ')} |`, ...b.rows.map(r => `| ${r.map(c => c.text + (c.tone ? `{${c.tone}}` : '')).join(' | ')} |`), ...(b.total ? [`| ${b.total.map(c => c.text).join(' | ')} | (total)`] : []), ...(b.note ? [`note: ${b.note}`] : [])); break;
        case 'list': L.push(...b.items.map(x => `* ${x}`)); break;
        case 'callout': L.push(`> [${b.tone}] ${b.title}${b.text ? `: ${b.text}` : ''}`); break;
        case 'figures': L.push(b.items.map(x => `[${x.label}: ${x.value}${x.sub ? ` / ${x.sub}` : ''}]`).join(' ')); break;
        case 'figure': L.push(`FIGURE ${b.drawingId}: ${b.caption ?? ''}`); break;
      }
    }
  }
  L.push('', `DRAWINGS ${doc.drawings.map(d => `${d.number} ${d.title} (${d.discipline})`).join('; ')}`);
  L.push(`SHEETS ${doc.sheets.map(s => `${s.name} ${s.rows.length}×${s.columns.length}`).join('; ')}`);
  L.push(`ASK ${doc.ask.decision}`, ...(doc.ask.changesSinceLast ?? []).map(x => `CHANGE ${x}`));
  return L.join('\n');
}

/** Problems a reviewer would notice: NaN, undefined, [object …], Infinity, raw engine keys (camelCase words), empty sections / tables. */
export function lint(doc: ReviewDoc): string[] {
  const out: string[] = [];
  const txt = docText(doc);
  for (const re of [/\bNaN\b/, /\bundefined\b/, /\[object /, /Infinity/, /\bnull\b/, /\bRule_\w+/]) { const m = txt.match(new RegExp(`.{0,60}${re.source}.{0,40}`, 'g')); if (m) out.push(...m.slice(0, 5).map(x => `${re.source}: ${x}`)); }
  const raw = txt.match(/(?<![\w./-])[a-z]+[A-Z][a-zA-Z]+(?![\w(])/g)?.filter(w => !/^(iPhone|eGRID|rPDU|iBGP|eBGP|kWh|kVA|mVA|macOS|dB|pH)$/.test(w));
  if (raw?.length) out.push(`camelCase words: ${[...new Set(raw)].slice(0, 15).join(', ')}`);
  for (const s of doc.sections) if (!s.blocks.length && !doc.sections.some(x => x.number.startsWith(`${s.number}.`))) out.push(`empty section ${s.number} ${s.title}`);
  for (const s of doc.sections) for (const b of s.blocks) if (b.kind === 'table') { if (!b.rows.length) out.push(`empty table in ${s.number}: ${b.title}`); for (const r of b.rows) if (r.length !== b.columns.length) { out.push(`row width ${r.length} ≠ ${b.columns.length} in ${s.number} ${b.title ?? ''}`); break; } }
  for (const sh of doc.sheets) for (const r of sh.rows) { if (r.length !== sh.columns.length) { out.push(`sheet ${sh.name}: row width ${r.length} ≠ ${sh.columns.length}`); break; } if (r.some(v => typeof v === 'number' && !Number.isFinite(v))) { out.push(`sheet ${sh.name}: non-finite number`); break; } }
  return out;
}
