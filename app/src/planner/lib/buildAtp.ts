/**
 * Commissioning test plans (ATPs) for site builds, from the checklist templates.
 *
 * A checklist template lists its steps as "level | step | method | expected result". Each
 * plan phase gets one ATP per system and level found in the templates (L1 factory tests to L5
 * integrated systems test), linked to that phase's commissioning project; go-live of the
 * phase needs every L5 accepted. Each edge site gets one "Edge SAT" from its own template,
 * linked to its wave's acceptance project.
 */
import type * as T from '../p2b/types';
import type { AtpSystem, CxLevel } from '../p2b/enums';
import type { InitAtp, InitProject } from './outputs';
import { resolveTemplate } from './engine';

export const CX_TEMPLATES: { system: AtpSystem; id: string }[] = [
  { system: 'Power', id: 'TPL-CHK-CX-POWER' }, { system: 'Cooling', id: 'TPL-CHK-CX-COOLING' }, { system: 'Controls', id: 'TPL-CHK-CX-CONTROLS' },
  { system: 'Network', id: 'TPL-CHK-CX-NETWORK' }, { system: 'Integrated', id: 'TPL-CHK-CX-IST' },
];
export const EDGE_SAT_TEMPLATE = 'TPL-CHK-EDGE-SAT';
const LEVELS: CxLevel[] = ['L1 FAT', 'L2 SAT', 'L3 Pre-functional', 'L4 Functional', 'L5 IST'];

/** Steps of a checklist template, by level. Items not in "level | step | method | expected" form are skipped. */
export function checklistSteps(t: T.PlannerTemplate | undefined): { level: CxLevel; description: string; method: string; expected: string }[] {
  return (t?.items ?? []).map(s => s.split('|').map(x => x.trim())).filter(x => x.length >= 4 && LEVELS.includes(x[0] as CxLevel)).map(x => ({ level: x[0] as CxLevel, description: x[1], method: x[2], expected: x[3] }));
}

/** The commissioning checklists the plan's template is built from (modules with an ATP system), in the order it lists them. */
export const cxChecklists = (plan: T.PlannerPlan, templates: T.PlannerTemplate[], perSite = false) =>
  (resolveTemplate(plan.templateId, templates)?.modules ?? []).filter(m => m.kind === 'checklist' && m.atpSystem && !!m.perSite === perSite);
/** One ATP per system and level for every plan phase, on that phase's commissioning project. */
export function phaseAtpPlan(plan: T.PlannerPlan, projects: InitProject[], templates: T.PlannerTemplate[]): InitAtp[] {
  const out: InitAtp[] = [];
  const phaseIds = [...new Set(projects.filter(p => p.planPhaseId).map(p => p.planPhaseId!))];
  const phases = plan.phases.length ? [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)) : phaseIds.map(id => ({ id, name: 'Go-live' } as T.PlannerPhase));
  for (const ph of phases) {
    const cx = projects.find(p => p.commissioning && p.planPhaseId === ph.id && !p.shared) ?? projects.find(p => p.commissioning);
    for (const m of cxChecklists(plan, templates)) {
      const t = { system: m.atpSystem!, id: m.id };
      const steps = checklistSteps(m);
      for (const level of LEVELS) {
        const ss = steps.filter(s => s.level === level); if (!ss.length) continue;
        out.push({ uid: `${ph.id}:${t.system}:${level}`, planPhaseId: ph.id, phaseName: ph.name, projectUid: cx?.uid, name: `${ph.name} · ${t.system} ${level}`, system: t.system, level, steps: ss.map(s => ({ description: s.description, method: s.method, expected: s.expected })), template: t.id });
      }
    }
  }
  return out;
}

/** One site acceptance test per edge site, on its wave's acceptance project. */
export function edgeAtpPlan(plan: T.PlannerPlan, projects: InitProject[], templates: T.PlannerTemplate[]): InitAtp[] {
  const sat = cxChecklists(plan, templates, true)[0];
  const steps = checklistSteps(sat);
  if (!sat || !steps.length) return [];
  const phases = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  return (plan.sites ?? []).filter(r => r.ref.kind === 'edgeLocation' || r.ref.kind === 'candidate').map(r => {
    const ph = phases[(r.wave ?? 1) - 1];
    const cx = projects.find(p => p.commissioning && p.planPhaseId === ph?.id) ?? projects.find(p => p.commissioning);
    return { uid: `${r.id}:sat`, planPhaseId: ph?.id, phaseName: ph?.name, projectUid: cx?.uid, name: `Edge SAT · ${r.name}`, system: 'Integrated' as AtpSystem, level: steps[0].level, siteRef: r.id, steps: steps.map(s => ({ description: s.description, method: s.method, expected: s.expected })), template: sat.id };
  });
}
