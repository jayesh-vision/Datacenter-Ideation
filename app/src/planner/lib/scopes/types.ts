/**
 * Scope models — one module per family of plan types.
 *
 * The engine, the output builders, the wizard and execution are generic. Everything that is
 * specific to a family of plan types lives in that family's ScopeModel and is called through
 * the hooks below. A hook that is not defined falls back to the generic behaviour, so a family
 * only implements what differs. Families:
 *
 *   in-site    rack, pod, hall, retrofit           capacity added inside a live site
 *   plant      plant                               UPS, generators, chillers… added to a live site
 *   network    network                             DCI / WAN uplift between two sites
 *   build      new-dc, expansion, portfolio, edge  sites and buildings that do not exist yet
 *   replace    server-refresh, network-refresh, rack-replace
 *   migration  migration                           move, consolidate or decommission a site
 */
import type * as T from '../../p2b/types';
import type * as E from '../../p2b/enums';
import type { EstateActuals, Estimate, Evaluation, Finding, LadderRow, ParamValue, ScheduleItem, Sizing, Sourced } from '../engine';
import type { Bom, BomItem, BodSection, Initiation, IpPlan } from '../outputs';
import type { PlannerData } from '../plannerData';
import type { CampusBaseline, SiteBaseline } from '../site';
import type { SourcedBom } from '../sourcing';

export type ScopeFamily = 'in-site' | 'plant' | 'network' | 'build' | 'replace' | 'migration';
export const FAMILY_OF: Record<T.PlannerScope, ScopeFamily> = {
  rack: 'in-site', pod: 'in-site', hall: 'in-site', retrofit: 'in-site', plant: 'plant', network: 'network',
  'new-dc': 'build', expansion: 'build', portfolio: 'build', edge: 'build',
  'server-refresh': 'replace', 'network-refresh': 'replace', 'rack-replace': 'replace', migration: 'migration',
};

/** What every hook receives. `data` and the baselines are missing until the platform data has loaded. */
export interface ScopeCtx {
  plan: T.PlannerPlan; scenario?: T.PlannerScenario | null;
  params: Record<string, Sourced<ParamValue>>;
  templates: T.PlannerTemplate[]; benchmarks: T.PlannerBenchmark[]; actuals?: EstateActuals;
  data?: PlannerData;
  /** The plan's own site (existing-site scopes, migration source). */
  site?: SiteBaseline;
  /** The other end (network) or the target (migration consolidation). */
  peerSite?: SiteBaseline;
  /** The campus behind an expansion. */
  campus?: CampusBaseline;
}
export interface CheckResult { status: Finding['status']; detail: string; value?: string }
/** A wizard blocker; `step` is a wizard step key such as 'requirements' or 'dim:space'. */
export interface ScopeBlocker { level: 'bad' | 'warn'; text: string; step: string }
/** Capacity a plan holds once approved. Written by governance (Reserved at approval, Committed at execution, Consumed at completion, Released on cancel). */
export interface ReservationRequest { resourceType: E.ResourceType; resourceId: string; quantity: number; unit: string; label: string; dataCenterId?: string; expiresAt?: string }
/** Units held in a rack (written as a RackReservation). */
export interface RackUnitRequest { rackId: string; units: number[]; description: string }
/** One line of the completion checklist. */
export interface CloseoutCheck { key: string; label: string; ok: boolean; detail: string; /** Set by the handover to operations (records the handover updates); does not hold the completion back. */ atHandover?: boolean }

/** Context handed to execution hooks. Every create goes through `create` so ids land in the artefacts. */
export interface ExecCtx {
  plan: T.PlannerPlan; ev: Evaluation; template?: T.PlannerTemplate; bom: Bom; sourced?: SourcedBom; data: PlannerData; actor: string;
  /** Base fields for a new record (customer, timestamps, author). */
  meta(): Record<string, unknown>;
  /** Unique id with a prefix (time-based), for line records that are never referenced by people. */
  id(prefix: string): string;
  /** Next sequential id in a collection, e.g. seq('changeRequests', 'CHG') → CHG-0043. Use for records people refer to. */
  seq(entity: string, prefix: string): string;
  create(entity: string, rec: Record<string, unknown>): string;
  update(entity: string, id: string, patch: Record<string, unknown>): void;
  /** Run a named step once per execution; a step already done in an earlier (failed) run is skipped. */
  step(key: string, fn: () => Promise<void> | void): Promise<void>;
  /** Mutable artefacts; push the ids of what you create into the matching arrays. */
  artefacts: T.PlannerArtefacts;
  /** Plan patch written with the final status (e.g. waves with their change ids). */
  planPatch: Partial<T.PlannerPlan>;
  warn(message: string): void;
  startProcess(key: string, businessKey: string, record: { recordType: T.ProcessRecordType; recordId: string; dataCenterId?: string; title: string; variables?: Record<string, unknown> }): Promise<{ id: string } | undefined>;
  createProgramFromBlueprint(input: { blueprintKey: string; name: string; ownerName: string; dataCenterId?: string; budget?: number; objective?: string; durationFactor?: number; startDate?: string }): Promise<{ programId?: string } | undefined>;
  createProgram(input: { name: string; type: E.ProgramType; objective: string; ownerName: string; budget: number; status: E.ProgramStatus; startDate: string; endDate: string }): Promise<string>;
  createProject(input: { name: string; programId: string; template: E.ProjectTemplate; managerName: string; dataCenterId?: string; plannedStart: string; plannedEnd: string; budget: number; detail?: Record<string, unknown> }): Promise<string | undefined>;
}

export interface BomAdder { (line: Omit<BomItem, 'id' | 'total' | 'partNumber'> & { partNumber?: string }): void }

export interface ScopeModel {
  family: ScopeFamily;
  /* ---------------------------------------------------------------- engine */
  /** Replace or adjust the generic sizing (e.g. no site plant for work inside a live site). */
  size?(c: ScopeCtx, generic: Sizing): Sizing;
  ladder?(c: ScopeCtx, sizing: Sizing, generic: LadderRow[]): LadderRow[];
  estimate?(c: ScopeCtx, sizing: Sizing, generic: Estimate): Estimate;
  schedule?(c: ScopeCtx, sizing: Sizing, generic: ScheduleItem[]): ScheduleItem[];
  /** Answer a rule check this family owns, or undefined to use the generic check. */
  check?(c: ScopeCtx, rule: T.PlannerRuleDef, ev: Evaluation): CheckResult | undefined;
  /** Family results the UI and outputs read (placement solution, plant delta, wave analysis…), stored on `ev.scope`. */
  analyse?(c: ScopeCtx, ev: Evaluation): Record<string, unknown>;
  /* ---------------------------------------------------------------- outputs */
  /** Emit bill-of-materials lines. Return true when the family's lines are the whole bill (skip the generic lines). */
  bom?(ev: Evaluation, add: BomAdder): boolean;
  ipPlan?(ev: Evaluation, generic: IpPlan): IpPlan;
  bod?(ev: Evaluation, sections: BodSection[], template?: T.PlannerTemplate): BodSection[];
  initiation?(ev: Evaluation, template: T.PlannerTemplate | undefined, bom: Bom, generic: Initiation): Initiation;
  /* ---------------------------------------------------------------- wizard */
  blockers?(draft: T.PlannerPlan, ev?: Evaluation, data?: PlannerData): ScopeBlocker[];
  /** What is missing for the site to be complete; null defers to the generic check. */
  siteMissing?(draft: T.PlannerPlan): string | undefined | null;
  /** Draft changes when the plan type is chosen (requirement defaults, scope data). */
  seedDraft?(draft: T.PlannerPlan): Partial<T.PlannerPlan>;
  /* ---------------------------------------------------------------- governance and execution */
  /** Capacity the plan holds from approval. */
  reservations?(plan: T.PlannerPlan, ev: Evaluation, data: PlannerData): ReservationRequest[];
  rackUnits?(plan: T.PlannerPlan, ev: Evaluation, data: PlannerData): RackUnitRequest[];
  /** Create the delivery vehicle instead of the generic programme/project/change. */
  executeVehicle?(x: ExecCtx): Promise<void>;
  /** Family records after the generic ones (waves → changes and windows, circuits, planned devices…). */
  execute?(x: ExecCtx): Promise<void>;
  /** Extra completion checks, read live from the platform. */
  closeout?(plan: T.PlannerPlan, data: PlannerData): CloseoutCheck[];
}
