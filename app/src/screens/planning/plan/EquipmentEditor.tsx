/* Plan page: edit what a replace, migration or in-site plan touches — the affected equipment and racks, the inventory and its
   dispositions, the placement, and the waves and their windows — without going back to the wizard (user, 15-Oct-2026: "provide
   additional options in the plan drill-down … equipment and racks").
   The editor works on a local copy of the plan and reuses the wizard's own panels on it (AffectedAssets, the replace / migration
   WavesEditor through their wave panels, MigrationInventory, the in-site placement / equipment / class / retrofit panels), so the rules
   and the figures are the wizard's. The copy is re-evaluated on every change: the strip on top and the pinned change bar show the effect
   (devices, racks, kW, waves, clashes, problems, CapEx, rule fails) before anything is saved. Saving goes through the plan-page edit rule
   (usePlanEdit): in place on a draft, withdraw-first in review, a revision (Rev B) on an approved / executing plan — the editor then lands
   on the revision, on this same tab. Read-only plans show the plan pack's read views (no disabled forms) with the reason.
   Registered as the family's "equipment" detail tab in scopes/{replace,migration,inSite}/index.tsx. */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { Panel, Seg } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import * as G from '../../../planner/lib/governance';
import type { Evaluation, ParamValue } from '../../../planner/lib/engine';
import type { StepKey, StepProps } from '../../../planner/lib/wizardModel';
import type { PlannerData } from '../../../planner/lib/plannerData';
import { byId } from '../../../planner/lib/plannerData';
import { useActuals, useDraftEvaluation, useEstate, usePlannerActions, useTemplates } from '../../../planner/lib/usePlanner';
import { replaceOf } from '../../../planner/lib/replaceAnalysis';
import { migrationOf, DISPOSITION_LABEL } from '../../../planner/lib/migrationCore';
import { selectedIds } from '../../../planner/lib/replaceCore';
import { message } from '../../../planner/compat/notify';
import type { PlanViewProps } from '../scopes/types';
import { AffectedAssets } from '../wizard/AffectedAssets';
import { ReplaceItPanel, ReplaceSpacePanel, ReplaceWavesPanel } from '../scopes/replace/Panels';
import { OldToNew, WaveSchedule } from '../scopes/replace/PackSections';
import { MigrationInventory } from '../scopes/migration/Inventory';
import { MigrationWavesPanel } from '../scopes/migration/Panels';
import { InventoryRegister } from '../scopes/migration/PackSections';
import { RackItPanel, RackSpacePanel } from '../scopes/inSite/RackPanels';
import { PodSpacePanel } from '../scopes/inSite/PodPanels';
import { HallItPanel } from '../scopes/inSite/HallPanels';
import { RetrofitMigrationPanel, RetrofitSpacePanel } from '../scopes/inSite/RetrofitPanels';
import { PlacementSection, WavesSection } from '../scopes/inSite/PackSections';
import { analysisOf } from '../scopes/inSite/helpers';
import { Tbl } from '../scopes/replace/shared';
import { fmtWhen } from '../scopes/replace/model';
import { kw, money, num } from '../common';
import { usePlanEdit, landOn } from './edit/policy';
import { EditNote } from './edit/EditNote';
import { ChangeBar, EffectStrip, useLeaveGuard, usePending, type Effect } from './EffectBar';

export type EquipmentFamily = 'replace' | 'migration' | 'in-site';
const TAB = 'equipment';
const TITLE: Record<EquipmentFamily, string> = { replace: 'Equipment and waves', migration: 'Inventory and waves', 'in-site': 'Racks and equipment' };
const HINT: Record<EquipmentFamily, string> = { replace: 'Change what is replaced, how, and the waves it runs in.', migration: 'Change what happens to each item at the site, how services move, and the waves.', 'in-site': 'Change the racks, the placement or what goes in them.' };

interface Section {
  id: string; label: string; icon: I.LucideIcon; info: string;
  /** the wizard panel, on the local copy */
  edit: (p: StepProps) => ReactNode;
  /** what a read-only plan shows instead (the plan pack's read view) */
  view: (p: PlanViewProps) => ReactNode;
}

/* ------------------------------------------------------------------ sections per plan type */
function sectionsFor(plan: T.PlannerPlan, family: EquipmentFamily): Section[] {
  const waves: Section['icon'] = I.CalendarRange;
  if (family === 'replace') {
    const racks = plan.scope === 'rack-replace';
    return [
      { id: 'affected', label: racks ? 'Racks replaced' : 'Equipment replaced', icon: racks ? I.Server : I.HardDrive, info: 'Every eligible item at the site; tick what the plan replaces. Items another plan or an open change holds are locked with the reason.',
        edit: p => <AffectedAssets {...p} />, view: p => <AffectedAssets {...readProps(p)} /> },
      { id: 'oldnew', label: 'Old to new', icon: I.ArrowRightLeft, info: racks ? 'How each rack is swapped (in place, side by side, swing rack) and how the racks fit before and after.' : 'What replaces each old model, at what ratio, and what happens to the old kit; who is affected and the business case.',
        edit: p => (racks ? <ReplaceSpacePanel {...p} /> : <ReplaceItPanel {...p} />), view: p => <OldToNew {...p} /> },
      { id: 'waves', label: 'Waves and windows', icon: waves, info: 'The change windows the work is split into: make them from the selection, move a window (or jump to the next clash-free night), set the method, rollback and acceptance. Consent and notification follow the waves.',
        edit: p => <ReplaceWavesPanel {...p} />, view: p => <WaveSchedule {...p} /> },
    ];
  }
  if (family === 'migration') return [
    { id: 'inventory', label: 'Inventory', icon: I.Boxes, info: 'Everything recorded at the site being emptied and what happens to each item; how each service moves. Load and racks moving follow from it.',
      edit: p => <MigrationInventory {...p} />, view: p => <InventoryRegister {...p} /> },
    { id: 'waves', label: 'Waves and windows', icon: waves, info: 'The cut-over windows: make them from the inventory, move a window, set rollback and acceptance. Customer consent follows the waves.',
      edit: p => <MigrationWavesPanel {...p} />, view: p => <WaveSchedule {...p} /> },
  ];
  switch (plan.scope) {
    case 'rack': return [
      { id: 'placement', label: 'Placement', icon: I.Server, info: 'The candidate racks with their U block, feeds, PDU outlets, weight and cooling zone; accept or release each.', edit: p => <RackSpacePanel {...p} />, view: p => <PlacementSection {...p} /> },
      { id: 'kit', label: 'Equipment per rack', icon: I.HardDrive, info: 'The models that go into each rack (DCIM catalogue); rack units, density and design power follow.', edit: p => <RackItPanel {...p} />, view: p => <EquipmentRead {...p} /> },
    ];
    case 'pod': return [{ id: 'placement', label: 'Placement', icon: I.Grid3x3, info: 'Contiguous free positions for the pod in each hall; accept one option or release it.', edit: p => <PodSpacePanel {...p} />, view: p => <PlacementSection {...p} /> }];
    case 'hall': return [{ id: 'classes', label: 'Rack classes', icon: I.Layers, info: 'How many racks of each class the hall gets, at what kW and how they are cooled; the hall design load follows.', edit: p => <HallItPanel {...p} />, view: p => <ClassesRead {...p} /> }];
    case 'retrofit': return [
      { id: 'racks', label: 'Racks converted', icon: I.Server, info: 'The racks of the hall converted to liquid cooling, their target kW and readiness. Changing them proposes the waves again.', edit: p => <RetrofitSpacePanel {...p} />, view: p => <PlacementSection {...p} /> },
      { id: 'waves', label: 'Waves and windows', icon: waves, info: 'Drain, works and repopulate waves with their windows, swing racks and clashes.', edit: p => <RetrofitMigrationPanel {...p} />, view: p => <WavesSection {...p} /> },
    ];
    default: return [];
  }
}
/** A plan-view props object handed to AffectedAssets in read mode (it reads StepProps). */
function readProps(p: PlanViewProps): StepProps {
  return { draft: p.plan, template: p.template, why: {}, patch: () => undefined, setParam: () => undefined, resetParam: () => undefined, ev: p.ev, templates: [], benchmarks: p.benchmarks, estate: { regions: [], campuses: [], dataCenters: [] } as unknown as StepProps['estate'], actuals: { sampleSites: 0 } as StepProps['actuals'], actions: undefined as unknown as StepProps['actions'], data: p.data, persist: () => p.plan, saved: true, goTo: () => undefined, issues: [], readOnly: true };
}
function EquipmentRead({ plan, data }: PlanViewProps) {
  const lines = plan.inSite?.equipment ?? [];
  return <Tbl><thead><tr><th>Model</th><th>Qty per rack</th></tr></thead><tbody>
    {lines.map((l, i) => { const m = data.assetModels.find(x => x.id === l.assetModelId); return <tr key={i}><td>{m ? `${m.category} · ${m.manufacturer} ${m.model}` : l.assetModelId}</td><td className="num">{l.qty}</td></tr>; })}
    {!lines.length && <tr><td colSpan={2} className="vw-label">No equipment listed: the placement uses the declared rack units and density.</td></tr>}
  </tbody></Tbl>;
}
function ClassesRead({ ev }: PlanViewProps) {
  const h = analysisOf(ev)?.hall;
  return <Tbl><thead><tr><th>Class</th><th>Racks</th><th>kW each</th><th>Cooling</th></tr></thead><tbody>
    {(h?.classes ?? []).map((c, i) => <tr key={i}><td>{c.name}</td><td className="num">{num(c.racks)}</td><td className="num">{kw(c.kw)}</td><td>{c.cooling === 'liquid' ? 'Liquid to chip' : 'Air'}</td></tr>)}
    {!h?.classes.length && <tr><td colSpan={4} className="vw-label">No rack classes.</td></tr>}
  </tbody></Tbl>;
}

/* ------------------------------------------------------------------ the figures an edit moves */
interface Fig { devices?: number; racks?: number; kw?: number; waves?: number; clashes?: number; problems?: number; capex: number; fails: number }
function figuresOf(plan: T.PlannerPlan, ev: Evaluation | undefined, family: EquipmentFamily): Fig | undefined {
  if (!ev) return undefined;
  const live = (plan.waves ?? []).filter(w => w.status !== 'Cancelled').length;
  const base = { capex: ev.estimate.capexTotal, fails: ev.hardFails };
  if (family === 'replace') {
    const a = replaceOf(ev); if (!a?.ready) return { ...base, waves: live };
    const iss = a.waveCheck.issues;
    return { ...base, devices: a.old.length, racks: a.rackIds.length, kw: a.oldKw, waves: live, clashes: iss.filter(i => i.kind === 'clash' || i.kind === 'upstream').length, problems: iss.filter(i => i.level === 'bad').length };
  }
  if (family === 'migration') {
    const a = migrationOf(ev); if (!a?.ready) return { ...base, waves: live };
    const iss = a.waveCheck.issues; const moving = a.mode === 'consolidation';
    return { ...base, devices: a.rows.filter(r => r.recordType === 'device' && (moving ? r.disposition === 'move' : true)).length, racks: moving ? a.racksMoving : a.rows.filter(r => r.recordType === 'rack').length, kw: moving ? a.kwMoving : a.kwLeaving, waves: live, clashes: iss.filter(i => i.kind === 'clash' || i.kind === 'upstream').length, problems: iss.filter(i => i.level === 'bad').length };
  }
  const a = analysisOf(ev); if (!a) return base;
  const perRack = (plan.inSite?.equipment ?? []).reduce((s, l) => s + l.qty, 0);
  const fails = Object.values(a.checks).filter(c => c.status === 'fail').length;
  return {
    ...base, racks: a.racks, kw: a.addedKw,
    devices: plan.scope === 'rack' && perRack ? perRack * Math.max(1, a.racks) : plan.scope === 'retrofit' ? a.retrofit?.gpuServers : undefined,
    waves: plan.scope === 'retrofit' ? a.retrofit?.waves.length ?? live : undefined,
    problems: fails,
  };
}

function effectsOf(plan: T.PlannerPlan, before: Fig | undefined, after: Fig | undefined, family: EquipmentFamily): Effect[] {
  if (!before || !after) return [];
  const mig = family === 'migration'; const cons = mig && plan.params.migrationMode === 'consolidation';
  const rows: (Effect | undefined)[] = [
    before.devices !== undefined || after.devices !== undefined ? { key: 'devices', label: mig ? (cons ? 'Devices moving' : 'Devices leaving') : plan.scope === 'retrofit' ? 'GPU servers' : 'Devices', before: before.devices ?? 0, after: after.devices ?? 0, fmt: v => num(v) } : undefined,
    before.racks !== undefined || after.racks !== undefined ? { key: 'racks', label: mig && cons ? 'Racks to move' : 'Racks', before: before.racks ?? 0, after: after.racks ?? 0, fmt: v => num(v) } : undefined,
    before.kw !== undefined || after.kw !== undefined ? { key: 'kw', label: family === 'replace' ? 'Load affected' : mig ? (cons ? 'Load moving' : 'Load leaving') : 'IT load added', before: before.kw ?? 0, after: after.kw ?? 0, fmt: v => kw(Math.round(v * 10) / 10) } : undefined,
    before.waves !== undefined || after.waves !== undefined ? { key: 'waves', label: 'Waves', before: before.waves ?? 0, after: after.waves ?? 0 } : undefined,
    family !== 'in-site' ? { key: 'clashes', label: 'Clashes', before: before.clashes ?? 0, after: after.clashes ?? 0, good: 'down' } : undefined,
    { key: 'problems', label: family === 'in-site' ? 'Checks failing' : 'Wave problems', before: before.problems ?? 0, after: after.problems ?? 0, good: 'down' },
    { key: 'capex', label: 'CapEx', before: before.capex, after: after.capex, fmt: v => money(v) },
    { key: 'fails', label: 'Rule fails', before: before.fails, after: after.fails, good: 'down' },
  ];
  return rows.filter((x): x is Effect => !!x);
}

/* ------------------------------------------------------------------ what changes, in words */
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const names = (ids: string[], name: (id: string) => string, max = 4) => ids.slice(0, max).map(name).join(', ') + (ids.length > max ? ` and ${ids.length - max} more` : '');
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function describeChanges(plan: T.PlannerPlan, draft: T.PlannerPlan, data: PlannerData): string[] {
  const out: string[] = []; const done = new Set<string>();
  // selection (replace)
  if (['server-refresh', 'network-refresh', 'rack-replace'].includes(plan.scope)) {
    const a = new Set(selectedIds(plan)), b = new Set(selectedIds(draft));
    const add = [...b].filter(x => !a.has(x)), rem = [...a].filter(x => !b.has(x));
    const racks = plan.scope === 'rack-replace'; const word = racks ? 'rack' : 'device';
    const nm = (id: string) => (racks ? byId(data, 'racks', id)?.name : byId(data, 'devices', id)?.name) ?? id;
    if (add.length) out.push(`Adds ${plural(add.length, word)}: ${names(add, nm)}`);
    if (rem.length) out.push(`Removes ${plural(rem.length, word)}: ${names(rem, nm)}`);
    if (add.length || rem.length) done.add('params');
  }
  if (plan.scope === 'rack-replace') {
    const dm = (x: T.PlannerPlan) => { try { return (JSON.parse(String(x.params.selectionCriteria ?? '{}')) as { damagedRackIds?: string[] }).damagedRackIds ?? []; } catch { return []; } };
    const a = new Set(dm(plan)), b = new Set(dm(draft)); const nm = (id: string) => byId(data, 'racks', id)?.name ?? id;
    const on = [...b].filter(x => !a.has(x)), off = [...a].filter(x => !b.has(x));
    if (on.length) out.push(`Marks ${names(on, nm)} damaged`);
    if (off.length) out.push(`${names(off, nm)} no longer marked damaged`);
  }
  // migration: mode, dispositions, approaches
  if (plan.scope === 'migration') {
    if (plan.params.migrationMode !== draft.params.migrationMode) { out.push(`Mode: ${String(plan.params.migrationMode ?? 'decommission')} → ${String(draft.params.migrationMode)}`); }
    const was = new Map((plan.dispositions ?? []).map(d => [`${d.recordType}:${d.recordId}`, d]));
    const now = draft.dispositions ?? [];
    if (!was.size && now.length) out.push(`Confirms the inventory (${plural(now.length, 'item')})`);
    else {
      const moved = now.filter(d => { const w = was.get(`${d.recordType}:${d.recordId}`); return w && w.disposition !== d.disposition; });
      const by = new Map<string, T.PlannerDispositionRow[]>(); for (const d of moved) by.set(d.disposition, [...(by.get(d.disposition) ?? []), d]);
      for (const [k, rows] of by) out.push(`${plural(rows.length, 'item')} now ${DISPOSITION_LABEL[k as T.PlannerDisposition] ?? k}: ${names(rows.map(r => r.label), x => x, 3)}`);
      if (was.size && !now.length) out.push('Inventory back to proposed (dispositions cleared)');
    }
    const ap = Object.keys({ ...plan.params, ...draft.params }).filter(k => k.startsWith('approach:') && plan.params[k] !== draft.params[k]);
    if (ap.length) out.push(`How ${plural(ap.length, 'service')} move${ap.length === 1 ? 's' : ''}: ${names(ap, k => `${byId(data, 'services', k.slice(9))?.name ?? k.slice(9)} → ${String(draft.params[k])}`, 3)}`);
    done.add('dispositions'); done.add('params');
  }
  // waves
  if (!same(plan.waves, draft.waves)) {
    const a = new Map((plan.waves ?? []).map(w => [w.id, w])), b = new Map((draft.waves ?? []).map(w => [w.id, w]));
    const add = [...b.values()].filter(w => !a.has(w.id)), rem = [...a.values()].filter(w => !b.has(w.id));
    if (add.length && rem.length && add.length + rem.length > 2) out.push(`Waves remade: ${plural(rem.length, 'wave')} → ${plural(add.length, 'wave')}`);
    else { if (add.length) out.push(`Adds ${names(add.map(w => w.name), x => x)}`); if (rem.length) out.push(`Removes ${names(rem.map(w => w.name), x => x)}`); }
    for (const w of b.values()) {
      const o = a.get(w.id); if (!o) continue;
      if (o.windowStart !== w.windowStart) out.push(`${w.name} moves ${fmtWhen(o.windowStart)} → ${fmtWhen(w.windowStart)}`);
      if (o.name !== w.name) out.push(`${o.name} renamed ${w.name}`);
      const f = [o.method !== w.method && 'method', o.rollback !== w.rollback && 'rollback', o.acceptance !== w.acceptance && 'acceptance'].filter(Boolean);
      if (f.length) out.push(`${w.name}: ${f.join(', ')} changed`);
    }
    done.add('waves'); done.add('phases'); done.add('targetGoLive');
  }
  // in-site
  if (!same(plan.placement, draft.placement)) {
    const ra = new Set((plan.placement?.racks ?? []).map(r => r.rackId)), rb = new Set((draft.placement?.racks ?? []).map(r => r.rackId));
    const add = [...rb].filter(x => !ra.has(x)), rem = [...ra].filter(x => !rb.has(x)); const nm = (id: string) => byId(data, 'racks', id)?.name ?? id;
    if (add.length) out.push(`Accepts ${plural(add.length, 'rack')}: ${names(add, nm)}`);
    if (rem.length) out.push(`Releases ${plural(rem.length, 'rack')}: ${names(rem, nm)}`);
    const pa = plan.placement?.positions?.length ?? 0, pb = draft.placement?.positions?.length ?? 0;
    if (!add.length && !rem.length) out.push(pb ? `Placement: ${plural(pb, 'position')}${pa ? ` (was ${num(pa)})` : ''}` : 'Placement released');
    done.add('placement');
  }
  if (!same(plan.inSite?.equipment, draft.inSite?.equipment)) out.push(`Equipment per rack: ${(draft.inSite?.equipment ?? []).map(l => `${l.qty} × ${data.assetModels.find(m => m.id === l.assetModelId)?.model ?? l.assetModelId}`).join(', ') || 'none'}`);
  if (!same(plan.inSite?.classes, draft.inSite?.classes)) out.push(`Rack classes: ${(draft.inSite?.classes ?? []).map(c => `${c.racks} × ${c.kw} kW ${c.name}`).join(', ') || 'from the workload mix'}`);
  if (!same(plan.inSite?.retrofit, draft.inSite?.retrofit)) {
    const a = new Map((plan.inSite?.retrofit ?? []).map(r => [r.rackId, r])), b = new Map((draft.inSite?.retrofit ?? []).map(r => [r.rackId, r]));
    const add = [...b.keys()].filter(x => !a.has(x)), rem = [...a.keys()].filter(x => !b.has(x)); const nm = (id: string) => byId(data, 'racks', id)?.name ?? id;
    if (add.length) out.push(`Converts ${plural(add.length, 'more rack')}: ${names(add, nm)}`);
    if (rem.length) out.push(`No longer converts ${names(rem, nm)}`);
    const tgt = [...b.values()].filter(r => a.has(r.rackId) && (a.get(r.rackId)!.targetKw !== r.targetKw || a.get(r.rackId)!.readiness !== r.readiness));
    if (tgt.length) out.push(`Target or readiness changed on ${names(tgt.map(r => r.rackId), nm)}`);
  }
  if (!same(plan.inSite, draft.inSite)) done.add('inSite');
  if (!same(plan.mapping, draft.mapping)) { out.push(`Old-to-new mapping: ${(draft.mapping ?? []).map(m => `${m.count} × ${m.oldModel} → ${m.newUnits} × ${m.newModel}`).join(', ') || 'cleared'}`); done.add('mapping'); }
  if (!same(plan.consents, draft.consents)) { out.push('Consent and notification register updated'); done.add('consents'); }
  if (!same(plan.permits, draft.permits)) { out.push(`Permits: ${plural((draft.permits ?? []).length - (plan.permits ?? []).length, 'compliance step')} added`); done.add('permits'); }
  if (plan.designPowerKw !== draft.designPowerKw) out.push(`Design power ${kw(plan.designPowerKw)} → ${kw(draft.designPowerKw)}`);
  if (plan.targetGoLive !== draft.targetGoLive && !done.has('targetGoLive')) out.push('Target go-live moved');
  if (!out.length) for (const c of G.diffPlan(plan, G.wizardPatch(plan, draft))) out.push(`${c.field.replace(/^param /, '')}: ${String(c.from ?? '—')} → ${String(c.to ?? '—')}`.slice(0, 160));
  return out;
}

/** What saving writes: the wizard-owned fields that differ, ignoring the list filters (AffectedAssets keeps its quick filters in
    params.selectionCriteria; filtering the list on the plan page is not a change to the plan, marking a rack damaged is). */
function patchOf(plan: T.PlannerPlan, draft: T.PlannerPlan): Partial<T.PlannerPlan> {
  const p = G.wizardPatch(plan, draft);
  // the list filters are not a change; racks marked damaged are (they are the plan's record of why a rack is replaced)
  const damaged = (v: unknown) => { try { return JSON.stringify((JSON.parse(String(v ?? '{}')) as { damagedRackIds?: string[] }).damagedRackIds ?? []); } catch { return '[]'; } };
  const strip = (o?: Record<string, unknown>) => { const c: Record<string, unknown> = { ...(o ?? {}) }; if (c.selectionCriteria !== undefined) c.selectionCriteria = damaged(c.selectionCriteria); return c; };
  if (p.params && same(strip(plan.params), strip(draft.params))) delete p.params;
  if (p.paramSources && same(strip(plan.paramSources), strip(draft.paramSources))) delete p.paramSources;
  return p;
}

/* ------------------------------------------------------------------ the editor */
export function EquipmentEditor(props: PlanViewProps & { family: EquipmentFamily }) {
  const { plan, data, template, benchmarks, family } = props;
  const nav = useNavigate();
  const { policy, commit } = usePlanEdit(plan);
  const readOnly = policy.mode === 'read-only';
  const [pending, setPending] = usePending<T.PlannerPlan>(`eq:${plan.id}:${plan.updatedAt}`);
  const draft = pending ?? plan;
  const changes = useMemo(() => (pending ? describeChanges(plan, pending, data) : []), [plan, pending, data]);
  const dirty = !!pending && Object.keys(patchOf(plan, pending)).length > 0;
  useLeaveGuard(dirty);
  const before = useDraftEvaluation(plan);
  const afterOwn = useDraftEvaluation(dirty ? pending : undefined);
  const after = dirty ? afterOwn : before;
  const templates = useTemplates(); const estate = useEstate(); const actuals = useActuals(plan.dcTypeKey); const actions = usePlannerActions();
  const sections = useMemo(() => sectionsFor(plan, family), [plan, family]);
  const [secState, setSec] = useState<string | undefined>();
  const sec = sections.find(s => s.id === secState) ?? sections[0];
  const [busy, setBusy] = useState(false);

  const patch = useCallback((p: Partial<T.PlannerPlan>) => { if (!readOnly) setPending(cur => ({ ...(cur ?? plan), ...p })); }, [plan, readOnly, setPending]);
  const setParam = useCallback((key: string, value: ParamValue, source: T.PlannerParamSource = 'user') => patch({ params: { ...draft.params, [key]: value }, paramSources: { ...draft.paramSources, [key]: source } }), [patch, draft]);
  const resetParam = useCallback((key: string) => { const params = { ...draft.params }, paramSources = { ...draft.paramSources }; delete params[key]; delete paramSources[key]; patch({ params, paramSources }); }, [patch, draft]);
  const goTo = (key: StepKey) => { const want = key === 'requirements' ? sections[0]?.id : String(key).includes('migration') || String(key).includes('delivery') ? 'waves' : undefined; if (want && sections.some(s => s.id === want)) setSec(want); };
  const fx = effectsOf(plan, figuresOf(plan, before, family), figuresOf(draft, after, family), family);

  const wavesCleared = dirty && family !== 'in-site' && (plan.waves ?? []).some(w => w.status === 'Planned') && !(draft.waves ?? []).some(w => w.status === 'Planned') && sections.some(s => s.id === 'waves');
  if (!sections.length || !sec) return null;
  const step: StepProps = { draft, template, why: {}, patch, setParam, resetParam, ev: after, templates, benchmarks, estate, actuals, actions, data, persist: () => draft, saved: true, goTo, issues: [], readOnly };
  const what = `Equipment and waves: ${changes.slice(0, 2).join('; ')}${changes.length > 2 ? ` and ${changes.length - 2} more` : ''}`;
  const save = async () => {
    if (!pending) return;
    setBusy(true);
    const r = await commit(patchOf(plan, pending), what).finally(() => setBusy(false));
    if (!r.ok) { message.error(r.reason); return; }
    setPending(undefined);
    const to = landOn(plan, r, TAB);
    if (to) nav(to);
    else if (policy.mode === 'in-place') message.success(`Saved: ${changes[0] ?? 'equipment and waves'}${changes.length > 1 ? ` and ${changes.length - 1} more` : ''}`);
  };
  return (
    <div className="col peq" style={{ gap: 14 }} data-editor="equipment">
      <EditNote policy={policy} tab={TAB} />
      {policy.mode === 'in-place' && !dirty && <p className="peq-hint"><I.MousePointerClick size={14} aria-hidden />{HINT[family]} The figures show the effect before you save.</p>}
      <EffectStrip effects={fx} dirty={dirty} />
      {wavesCleared && <p className="note note--warn"><I.TriangleAlert size={15} /><span>The new {family === 'migration' ? 'inventory' : 'selection'} clears the planned waves. {sec.id === 'waves' ? 'Make them again below' : <button type="button" className="ent-link" onClick={() => setSec('waves')}>Make them again on Waves and windows</button>} before saving, or the plan saves without waves.</span></p>}
      <Panel icon={sec.icon} title={TITLE[family]} info={sec.info}
        actions={sections.length > 1 ? <Seg<string> size="sm" value={sec.id} onChange={setSec} options={sections.map(s => ({ id: s.id, label: s.label }))} /> : undefined}>
        <div className="peq-body">{readOnly ? sec.view(props) : sec.edit(step)}</div>
      </Panel>
      {!readOnly && <ChangeBar policy={policy} changes={dirty ? changes : []} effects={fx} busy={busy} onDiscard={() => setPending(undefined)} onCommit={() => void save()} />}
    </div>
  );
}
