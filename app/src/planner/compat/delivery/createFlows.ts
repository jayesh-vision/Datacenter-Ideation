/* P2B delivery create flows (programme from a blueprint, project from a template), writing to the planner store. Our Delivery
   module then shows the executing plan as a delivery project with its work orders, purchase orders and tests. */
import { db } from '../db';
import type * as T from '../../p2b/types';
import { TEMPLATE_REGISTRY } from '../../p2b/delivery/projectTemplates';
import { buildProgrammeRecords, getBlueprint } from '../../p2b/delivery/programBlueprints';
import type { ProjectTemplate, ProgramStatus, ProgramType, RAGValue } from '../../p2b/enums';

const now = () => new Date().toISOString();
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'Planner', createdById: 'planner' });
let n = 0;
const sid = (p: string) => `${p}-${Date.now().toString(36).toUpperCase()}${(++n).toString(36).toUpperCase()}`;
const addDays = (iso: string, d: number) => new Date(new Date(iso).getTime() + d * 864e5).toISOString();

export interface NewProgramInput { name: string; type: ProgramType; objective: string; ownerName: string; budget: number; status: ProgramStatus; startDate: string; endDate: string }
export function useCreateProgram() {
  return async (input: NewProgramInput) => { const id = sid('PROG'); db.create('programs', { id, progId: id, ...env(), ...input, projectCount: 0 }); return id; };
}
export interface NewGreenfieldInput { blueprintKey: string; name: string; ownerName: string; dataCenterId?: string; startISO?: string; budget?: number; objective?: string; durationFactor?: number }
export function useCreateProgramFromBlueprint() {
  return async (input: NewGreenfieldInput): Promise<{ programId: string; projectCount: number } | null> => {
    const bp = getBlueprint(input.blueprintKey); if (!bp) return null;
    const built = buildProgrammeRecords({ blueprint: bp, name: input.name, ownerName: input.ownerName, dataCenterId: input.dataCenterId, startISO: input.startISO ?? now(), budget: input.budget ?? bp.defaultBudget, programStatus: 'Active', objective: input.objective, durationFactor: input.durationFactor }, { id: sid, meta: env });
    db.create('programs', built.program as unknown as Record<string, unknown>);
    for (const p of built.projects) db.create('projects', p as unknown as Record<string, unknown>);
    for (const m of built.milestones) db.create('milestones', m as unknown as Record<string, unknown>);
    return { programId: built.program.id, projectCount: built.projects.length };
  };
}
export interface NewProjectInput { name: string; programId: string; template: ProjectTemplate; managerName: string; dataCenterId?: string; plannedStart: string; plannedEnd: string; budget: number; rag?: RAGValue; detail?: Record<string, unknown> }
export function useCreateProjectFromTemplate() {
  return async (input: NewProjectInput) => {
    const def = TEMPLATE_REGISTRY[input.template];
    const projId = sid('PROJ');
    db.create('projects', { id: projId, projId, ...env(), programId: input.programId, name: input.name, status: 'Planning', rag: input.rag ?? 'Green', managerName: input.managerName, dataCenterId: input.dataCenterId, plannedStart: input.plannedStart, plannedEnd: input.plannedEnd, percentComplete: 0, budget: input.budget, actualSpend: 0, template: input.template } as unknown as Record<string, unknown>);
    const span = Math.max(1, new Date(input.plannedEnd).getTime() - new Date(input.plannedStart).getTime());
    (def?.milestones ?? []).forEach((name, k, ms) => { const id = sid('MS'); db.create('milestones', { id, msId: id, ...env(), projectId: projId, name, dueDate: addDays(input.plannedStart, Math.round((span / 864e5) * ((k + 1) / (ms.length + 1)))), status: 'Not Started', rag: 'Grey' }); });
    return projId;
  };
}
export type { T };
