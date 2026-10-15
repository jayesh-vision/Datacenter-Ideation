/* Project plan tab (15-Oct-2026, user: "adjust project plan … from the plan drill-down"). The phases and dates the plan is built on, with an
   "Adjust" mode: rename a phase, move its go-live, change its IT kW, density or cooling, split / merge / remove / add phases and move the
   target go-live — and see the effect live before saving: design IT, racks and halls, late items and order-by dates, the capacity ladder,
   CapEx and its timing by year, NPV / payback and the rule checks, against the plan as it is. Saving goes through `usePlanEdit` (in place on
   a draft, withdraw first in review, a revision once approved). Below: the Schedule board / timeline (plan/schedule.tsx), drawn from the
   draft while adjusting. Live phases stay as they are. */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { Btn, Chip, Menu, Panel } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import { datedPhases, type Evaluation } from '../../../planner/lib/engine';
import { COOLING_LABEL, fromDateInput, toDateInput } from '../../../planner/lib/wizardModel';
import { useDraftEvaluation } from '../../../planner/lib/usePlanner';
import { clockMs } from '../../../planner/compat/clock';
import { NumInput, SelectInput, TextInput, date, kw, money, num } from '../common';
import { PhaseLadder } from '../pack/drawings';
import { ScheduleTab, useSchedule } from './schedule';
import { usePlanEdit, landOn } from './edit/policy';
import { EditNote } from './edit/EditNote';
import type { TabProps } from './tabs';

const COOLING: T.PlannerCoolingType[] = ['air-crah', 'air-economiser', 'chilled-water', 'in-row', 'rear-door', 'liquid-to-chip', 'immersion'];
const WEEK = 7 * 864e5;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const addDays = (iso: string, d: number) => new Date(new Date(iso).getTime() + d * 864e5).toISOString();
const wkBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / WEEK);
const shiftText = (w: number) => (w === 0 ? 'same day' : `${w > 0 ? '+' : '−'}${Math.abs(w)} wk`);

/** Racks and halls of a phase from its own density and hall load (falling back to the plan's). Same rule as the wizard's PhaseEditor. */
function derived(ph: T.PlannerPhase, ev?: Evaluation): { racks: number; halls: number } {
  const d = Number(ph.params?.densityKwPerRack ?? ev?.params['densityKwPerRack']?.value ?? 12) || 12;
  const h = Number(ph.params?.hallDesignKw ?? ev?.params['hallDesignKw']?.value ?? 1500) || 1500;
  return { racks: ph.itKw > 0 ? Math.ceil(ph.itKw / d) : 0, halls: ph.itKw > 0 ? Math.max(1, Math.ceil(ph.itKw / h)) : 0 };
}
const sortPh = (ps: T.PlannerPhase[]) => [...ps].sort((a, b) => a.goLive.localeCompare(b.goLive));
const newId = () => `PH-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** What changed between the plan and the draft, one phrase per change (also the audit / revision note). */
function changesOf(before: T.PlannerPlan, phases: T.PlannerPhase[], target: string): string[] {
  const out: string[] = [];
  const was = new Map(datedPhases(before).map(p => [p.id, p]));
  for (const p of sortPh(phases)) {
    const o = was.get(p.id);
    if (!o) { out.push(`added ${p.name} (${kw(p.itKw)}, live ${date(p.goLive)})`); continue; }
    if (o.name !== p.name) out.push(`renamed ${o.name} to ${p.name}`);
    if (o.goLive.slice(0, 10) !== p.goLive.slice(0, 10) && !(before.phases.length === 0 && p.goLive.slice(0, 10) === target.slice(0, 10))) out.push(`${p.name} go-live ${date(o.goLive)} → ${date(p.goLive)} (${shiftText(wkBetween(o.goLive, p.goLive))})`);
    if (o.itKw !== p.itKw) out.push(`${p.name} ${kw(o.itKw)} → ${kw(p.itKw)}`);
    const od = o.params?.densityKwPerRack, nd = p.params?.densityKwPerRack;
    if (od !== nd) out.push(`${p.name} density ${od ?? 'as plan'} → ${nd ?? 'as plan'}${nd !== undefined ? ' kW / rack' : ''}`);
    const oc = o.params?.coolingType, nc = p.params?.coolingType;
    if (oc !== nc) out.push(`${p.name} cooling ${oc ? COOLING_LABEL[oc as T.PlannerCoolingType] : 'as plan'} → ${nc ? COOLING_LABEL[nc as T.PlannerCoolingType] : 'as plan'}`);
  }
  for (const o of was.values()) if (!phases.some(p => p.id === o.id)) out.push(`removed ${o.name}`);
  if (before.targetGoLive.slice(0, 10) !== target.slice(0, 10)) out.push(`target go-live ${date(before.targetGoLive)} → ${date(target)}`);
  return out;
}

/** One figure before → after, with the direction coloured when it is good or bad. */
function Delta({ label, before, after, worse, fmt = String, info }: { label: string; before: number; after: number; worse?: 'up' | 'down'; fmt?: (n: number) => ReactNode; info?: string }) {
  const changed = Math.abs(after - before) > 1e-6;
  const bad = changed && worse && (worse === 'up' ? after > before : after < before);
  return (
    <div className={`pn-delta${changed ? ' is-changed' : ''}`} title={info}>
      <small>{label}</small>
      <b className={changed ? (bad ? 'pn-bad' : worse ? 'pn-ok' : undefined) : undefined}>{fmt(after)}</b>
      <em>{changed ? <>was {fmt(before)}</> : 'no change'}</em>
    </div>
  );
}

export function ProjectPlanTab({ plan, ev, data, overrides }: TabProps & { overrides?: Record<string, number | string | boolean> }) {
  const nav = useNavigate();
  const { policy, commit } = usePlanEdit(plan);
  const [editing, setEditing] = useState(false);
  const [phases, setPhases] = useState<T.PlannerPhase[]>([]);
  const [target, setTarget] = useState(plan.targetGoLive);
  const [moveWith, setMoveWith] = useState(true);
  const [saving, setSaving] = useState(false);
  const shown = useMemo(() => datedPhases(plan), [plan]);
  const implicit = plan.phases.length === 0;
  const synced = Math.abs(plan.phases.reduce((a, p) => a + p.itKw, 0) - plan.designPowerKw) < 0.5;
  const canEdit = policy.mode !== 'read-only';

  const start = () => { setPhases(shown.map(p => ({ ...p }))); setTarget(plan.targetGoLive); setMoveWith(true); setEditing(true); };
  const cancel = () => setEditing(false);

  // the draft the engine evaluates (phases as edited; the design IT follows the phases when it did before)
  const draft = useMemo<T.PlannerPlan | undefined>(() => {
    if (!editing) return undefined;
    const sum = phases.reduce((a, p) => a + p.itKw, 0);
    return { ...plan, phases, targetGoLive: target, designPowerKw: synced || implicit ? sum : plan.designPowerKw };
  }, [editing, phases, target, plan, synced, implicit]);
  const asIs = useMemo(() => (editing ? plan : undefined), [editing, plan]);
  const before = useDraftEvaluation(asIs, overrides);
  const after = useDraftEvaluation(draft, overrides);
  const changes = useMemo(() => (editing ? changesOf(plan, phases, target) : []), [editing, plan, phases, target]);
  // schedules with Delivery's purchase orders laid over them, as the Schedule board and the tab badge count them
  const schedB = useSchedule(asIs, before); const schedA = useSchedule(draft, after);

  /* ---- edits */
  const upd = (id: string, p: Partial<T.PlannerPhase>) => setPhases(ps => ps.map(x => { if (x.id !== id) return x; const n = { ...x, ...p }; return { ...n, ...derived(n, ev) }; }));
  const setParam = (ph: T.PlannerPhase, key: string, v: number | string | undefined) => { const params = { ...(ph.params ?? {}) }; if (v === undefined || v === '') delete params[key]; else params[key] = v; upd(ph.id, { params: Object.keys(params).length ? params : undefined }); };
  const split = (ph: T.PlannerPhase) => setPhases(ps => {
    const a = Math.round(ph.itKw / 2), b = ph.itKw - a;
    const one = { ...ph, name: `${ph.name} (1)`, itKw: a }, two: T.PlannerPhase = { ...ph, id: newId(), name: `${ph.name} (2)`, itKw: b, goLive: addDays(ph.goLive, 91), status: 'Planned' };
    return ps.flatMap(x => (x.id === ph.id ? [{ ...one, ...derived(one, ev) }, { ...two, ...derived(two, ev) }] : [x]));
  });
  const merge = (ph: T.PlannerPhase) => setPhases(ps => {
    const s = sortPh(ps); const i = s.findIndex(x => x.id === ph.id); const nx = s[i + 1]; if (!nx) return ps;
    const m = { ...ph, name: `${ph.name} + ${nx.name}`, itKw: ph.itKw + nx.itKw, goLive: nx.goLive > ph.goLive ? nx.goLive : ph.goLive };
    return ps.filter(x => x.id !== nx.id).map(x => (x.id === ph.id ? { ...m, ...derived(m, ev) } : x));
  });
  const remove = (ph: T.PlannerPhase) => setPhases(ps => ps.filter(x => x.id !== ph.id));
  const add = () => setPhases(ps => { const s = sortPh(ps); const last = s[s.length - 1]; const p: T.PlannerPhase = { id: newId(), name: `Phase ${ps.length + 1}`, goLive: last ? addDays(last.goLive, 365) : target, itKw: last?.itKw ?? Math.max(0, plan.designPowerKw), racks: 0, halls: 0, status: 'Planned' }; return [...ps, { ...p, ...derived(p, ev) }]; });
  const moveTarget = (iso: string) => {
    const d = Math.round((new Date(iso).getTime() - new Date(target).getTime()) / 864e5);
    if (moveWith && d) setPhases(ps => ps.map(p => (p.status === 'Live' ? p : { ...p, goLive: addDays(p.goLive, d) })));
    setTarget(iso);
  };

  /* ---- checks on the draft */
  const sorted = sortPh(editing ? phases : shown);
  const problems = editing ? [
    ...(!phases.length ? ['Keep at least one phase.'] : []),
    ...phases.filter(p => !p.name.trim()).map(() => 'Every phase needs a name.'),
    ...phases.filter(p => !(p.itKw > 0) && plan.scope !== 'network').map(p => `${p.name || 'A phase'} has no IT load.`),
  ] : [];
  const lastGo = sorted[sorted.length - 1]?.goLive;
  const afterTarget = editing && lastGo && lastGo.slice(0, 10) > target.slice(0, 10);

  const save = async () => {
    if (!draft || problems.length || !changes.length) return;
    setSaving(true);
    const patch: Partial<T.PlannerPlan> = {};
    if (target.slice(0, 10) !== plan.targetGoLive.slice(0, 10)) patch.targetGoLive = target;
    // a plan without phases keeps none when its one implicit step just follows the target
    const stillImplicit = implicit && phases.length === 1 && phases[0].id === shown[0]?.id && phases[0].itKw === shown[0]?.itKw && !phases[0].params && phases[0].name === shown[0]?.name && phases[0].goLive.slice(0, 10) === target.slice(0, 10);
    if (changes.some(c => !c.startsWith('target go-live')) && !stillImplicit) { patch.phases = phases; if (draft.designPowerKw !== plan.designPowerKw) patch.designPowerKw = draft.designPowerKw; }
    const what = `Project plan: ${changes.slice(0, 3).join('; ')}${changes.length > 3 ? ` and ${changes.length - 3} more` : ''}`;
    const r = await commit(patch, what);
    setSaving(false);
    if (!r.ok) return;
    setEditing(false);
    const url = landOn(plan, r, 'schedule');
    if (url) nav(url);
  };

  /* ---- live effect */
  const effect = editing && before && after ? (() => {
    const lb = schedB.filter(x => x.late), la = schedA.filter(x => x.late);
    const key = (x: { item: string; phase: string }) => `${x.item}|${x.phase}`;
    const newly = la.filter(x => !lb.some(y => key(y) === key(x)));
    const fixed = lb.filter(x => !la.some(y => key(y) === key(x)));
    const now = clockMs();
    const soon = (e: typeof schedA) => e.filter(x => x.kind !== 'gate' && !x.late && x.source !== 'stock' && x.source !== 'site' && x.status !== 'ordered' && new Date(x.orderBy).getTime() - now < 13 * WEEK).length;
    const firstOrder = (e: typeof schedA) => e.filter(x => x.kind === 'equipment' && x.source !== 'stock' && x.source !== 'site' && x.status !== 'ordered').map(x => x.orderBy).sort()[0];
    const fo = { b: firstOrder(schedB), a: firstOrder(schedA) };
    // the build years (up to the last go-live, before or after); later years are IT refreshes, which move with the go-live too
    const lastYear = Math.max(...[...datedPhases(plan), ...phases].map(p => new Date(p.goLive).getUTCFullYear()));
    const years = [...new Set([...(before.estimate.cashflow ?? []), ...(after.estimate.cashflow ?? [])].filter(y => y.capex > 0 && y.year <= lastYear).map(y => y.year))].sort().slice(0, 8);
    const capexIn = (e: Evaluation, y: number) => e.estimate.cashflow?.find(c => c.year === y)?.capex ?? 0;
    const maxY = Math.max(1, ...years.map(y => Math.max(capexIn(before, y), capexIn(after, y))));
    const lastB = before.ladder[before.ladder.length - 1], lastA = after.ladder[after.ladder.length - 1];
    return { lb, la, newly, fixed, soon: { b: soon(schedB), a: soon(schedA) }, fo, years, capexIn, maxY, lastB, lastA };
  })() : undefined;

  return (
    <div className="col" style={{ gap: 14 }}>
      <Panel title="Phases and dates" icon={I.CalendarRange} className={editing ? 'pn-pp is-editing' : 'pn-pp'}
        sub={editing ? 'Adjusting — nothing is saved until you save below' : `${plural(sorted.length, 'phase')} · ${kw(sorted.reduce((a, p) => a + p.itKw, 0))} · needed by ${date(plan.targetGoLive)}`}
        info="The phases the plan is built and ordered by: each phase's go-live drives its order-by dates, its share of the CapEx and the capacity ladder. Adjust them here and see the effect before saving."
        actions={editing ? <Btn size="sm" variant="ghost" icon={I.X} onClick={cancel}>Discard</Btn> : canEdit ? <Btn size="sm" icon={I.Pencil} onClick={start}>Adjust the project plan</Btn> : undefined}>
        {(!canEdit || editing) && <EditNote policy={policy} tab="schedule" />}
        {!editing ? (
          <table className="nst-table pn-pp-table"><thead><tr><th>Phase</th><th>Go-live</th><th>IT load</th><th>Density</th><th>Cooling</th><th>Racks · halls</th><th>Status</th></tr></thead>
            <tbody>{sorted.map(p => <tr key={p.id}><td><b className="strong-num">{p.name}</b></td><td className="nowrap">{date(p.goLive)}</td><td className="num">{kw(p.itKw)}</td>
              <td className="num">{typeof p.params?.densityKwPerRack === 'number' ? `${p.params.densityKwPerRack} kW` : <span className="vw-label">as plan{Number(ev.params.densityKwPerRack?.value) > 0 ? ` (${String(ev.params.densityKwPerRack?.value)} kW)` : ''}</span>}</td>
              <td>{typeof p.params?.coolingType === 'string' ? COOLING_LABEL[p.params.coolingType as T.PlannerCoolingType] : <span className="vw-label">as plan</span>}</td>
              <td className="num">{num(p.racks)} · {num(p.halls)}</td><td><Chip tone={p.status === 'Live' ? 'success' : p.status === 'In delivery' ? 'info' : 'neutral'} size="xs" dot>{p.status}</Chip></td></tr>)}
              <tr className="pn-pp-target"><td><b className="strong-num">Needed by</b></td><td className="nowrap">{date(plan.targetGoLive)}</td><td colSpan={5} className="vw-label">{implicit ? 'one step at the target date (no separate phases)' : lastGo && lastGo.slice(0, 10) > plan.targetGoLive.slice(0, 10) ? <span className="pn-warn">the last phase goes live after this date</span> : 'every phase is live by then'}</td></tr></tbody></table>
        ) : (<>
          <table className="nst-table pn-pp-table is-edit"><thead><tr><th>Phase</th><th>Go-live</th><th>IT load</th><th>Density</th><th>Cooling</th><th>Racks · halls</th><th aria-label="Actions" /></tr></thead>
            <tbody>{sortPh(phases).map((p, i, s) => { const live = p.status === 'Live'; const o = shown.find(x => x.id === p.id); return (
              <tr key={p.id} className={!o ? 'is-new' : ''}>
                <td className="is-name">{live ? <span className="cell-2"><b className="strong-num">{p.name}</b><small>live, kept as it is</small></span> : <TextInput value={p.name} onChange={v => upd(p.id, { name: v })} />}</td>
                <td className="is-date">{live ? date(p.goLive) : <span className="cell-2"><TextInput type="date" value={toDateInput(p.goLive)} onChange={v => upd(p.id, { goLive: fromDateInput(v, p.goLive) })} />{o && o.goLive.slice(0, 10) !== p.goLive.slice(0, 10) && <small>{shiftText(wkBetween(o.goLive, p.goLive))} · was {date(o.goLive)}</small>}</span>}</td>
                <td className="is-kw">{live ? kw(p.itKw) : <span className="cell-2"><NumInput value={p.itKw} min={0} step={10} unit="kW" onChange={v => v !== undefined && upd(p.id, { itKw: v })} />{o && o.itKw !== p.itKw && <small>was {kw(o.itKw)}</small>}</span>}</td>
                <td className="is-dens">{live ? '—' : <NumInput value={typeof p.params?.densityKwPerRack === 'number' ? p.params.densityKwPerRack : undefined} min={1} max={200} unit="kW" placeholder={`${ev.params.densityKwPerRack?.value ?? 'plan'}`} onChange={v => setParam(p, 'densityKwPerRack', v)} />}</td>
                <td className="is-cool">{live ? '—' : <SelectInput value={typeof p.params?.coolingType === 'string' ? p.params.coolingType : ''} options={[{ id: '', label: 'As plan' }, ...COOLING.map(c => ({ id: c, label: COOLING_LABEL[c] }))]} onChange={v => setParam(p, 'coolingType', v || undefined)} />}</td>
                <td className="num nowrap">{num(p.racks)} · {num(p.halls)}</td>
                <td className="is-act">{!live && <Menu items={[
                  { label: 'Split in two', icon: I.Split, onClick: () => split(p), disabled: p.itKw < 2 },
                  ...(i < s.length - 1 && s[i + 1].status !== 'Live' ? [{ label: `Merge with ${s[i + 1].name}`, icon: I.Merge, onClick: () => merge(p) }] : []),
                  { label: 'Remove', icon: I.Trash2, danger: true, sep: true, disabled: phases.length < 2, onClick: () => remove(p) },
                ]} trigger={open => <Btn size="sm" variant="ghost" icon={I.MoreHorizontal} onClick={open} title={`Split, merge or remove ${p.name}`} />} />}</td>
              </tr>); })}
              <tr className="pn-pp-target"><td><b className="strong-num">Needed by</b></td><td className="is-date"><span className="cell-2"><TextInput type="date" value={toDateInput(target)} onChange={v => v && moveTarget(fromDateInput(v, target))} />{target.slice(0, 10) !== plan.targetGoLive.slice(0, 10) && <small>{shiftText(wkBetween(plan.targetGoLive, target))} · was {date(plan.targetGoLive)}</small>}</span></td>
                <td colSpan={5}><label className="pn-check"><input type="checkbox" checked={moveWith} onChange={e => setMoveWith(e.target.checked)} />Move the phases with the target date</label></td></tr>
            </tbody></table>
          <div className="pn-pp-tools"><Btn size="sm" icon={I.Plus} onClick={add}>Add a phase</Btn>
            <span className="vw-label">{synced || implicit ? `Design IT follows the phases: ${kw(phases.reduce((a, p) => a + p.itKw, 0))}` : `Design IT stays ${kw(plan.designPowerKw)} (the phases are set separately for this plan type)`}</span></div>
          {(problems.length > 0 || afterTarget) && <p className={`note ${problems.length ? 'note--bad' : 'note--warn'}`}><I.TriangleAlert size={15} /><span>{[...new Set(problems)].join(' ')}{afterTarget ? `${problems.length ? ' ' : ''}The last phase goes live on ${date(lastGo)}, after the needed-by date ${date(target)}.` : ''}</span></p>}
        </>)}
      </Panel>

      {editing && effect && before && after && (
        <Panel title="Effect of your changes" icon={I.Activity} className="pn-pp-effect" info="The plan as it is against the plan with your changes, worked out by the same engine: nothing is saved yet.">
          {!changes.length ? <p className="vw-label" style={{ margin: 0 }}>No change yet. Move a date, change a load or split a phase to see what it does to orders, capacity and cost.</p> : <>
            <div className="pn-deltas">
              <Delta label="Design IT" before={before.sizing.itKw} after={after.sizing.itKw} fmt={kw} />
              <Delta label="Racks" before={before.sizing.racks} after={after.sizing.racks} fmt={n => num(n)} />
              <Delta label="Late items" before={effect.lb.length} after={effect.la.length} worse="up" info="Items that cannot arrive by their phase's go-live at their lead time" />
              <Delta label="To order in 90 days" before={effect.soon.b} after={effect.soon.a} worse="up" />
              <Delta label="CapEx" before={before.estimate.capexTotal} after={after.estimate.capexTotal} worse="up" fmt={n => money(n)} />
              <Delta label="NPV" before={before.estimate.npvUsd ?? 0} after={after.estimate.npvUsd ?? 0} worse="down" fmt={n => money(n)} />
              <Delta label="Payback (months)" before={before.estimate.paybackMonths ?? 0} after={after.estimate.paybackMonths ?? 0} worse="up" fmt={n => (n ? String(n) : 'none')} />
              <Delta label="Failing rules" before={before.hardFails} after={after.hardFails} worse="up" />
            </div>
            <div className="pn-pp-grid">
              <div>
                <h4 className="pn-h4">Lead times and order-by</h4>
                <ul className="pn-attn-list is-compact">
                  {effect.fo.a && <li className="is-info"><i /><span className="cell-2"><b>First order by {date(effect.fo.a)}</b><small>{effect.fo.b && effect.fo.b !== effect.fo.a ? `was ${date(effect.fo.b)} (${shiftText(wkBetween(effect.fo.b, effect.fo.a))})` : 'unchanged'}</small></span></li>}
                  {effect.newly.slice(0, 5).map(x => <li key={`n${x.item}${x.phase}`} className="is-bad"><i /><span className="cell-2"><b>Now late: {x.item.replace(/^Permit · /, '')}</b><small>{x.phase} · order by {date(x.orderBy)} · {x.leadWeeks} wk lead</small></span></li>)}
                  {effect.newly.length > 5 && <li className="is-bad"><i /><span className="cell-2"><b>{effect.newly.length - 5} more now late</b></span></li>}
                  {effect.fixed.slice(0, 5).map(x => <li key={`f${x.item}${x.phase}`} className="is-ok"><i /><span className="cell-2"><b>No longer late: {x.item.replace(/^Permit · /, '')}</b><small>{x.phase}</small></span></li>)}
                  {!effect.newly.length && !effect.fixed.length && <li className="is-info"><i /><span className="cell-2"><b>{effect.la.length ? `${plural(effect.la.length, 'item')} still late, as before` : 'Every order can still arrive in time'}</b></span></li>}
                </ul>
                <h4 className="pn-h4">CapEx by year, until the last go-live</h4>
                {effect.years.length ? <ul className="pn-capyears">{effect.years.map(y => { const b = effect.capexIn(before, y), a = effect.capexIn(after, y); return (
                  <li key={y}><span>{y}</span><span className="pn-capbars"><i className="is-was" style={{ width: `${(b / effect.maxY) * 100}%` }} /><i className="is-now" style={{ width: `${(a / effect.maxY) * 100}%` }} /></span><b className={Math.abs(a - b) > 1 ? 'strong-num' : undefined}>{money(a)}</b><small>{Math.abs(a - b) > 1 ? `was ${money(b)}` : ''}</small></li>); })}</ul>
                  : <p className="vw-label">No cash flow for this plan type.</p>}
                <p className="pn-legend"><i className="is-was" />as it is <i className="is-now" />with your changes</p>
              </div>
              <div>
                <h4 className="pn-h4">Capacity ladder with your changes</h4>
                {after.ladder.length ? <PhaseLadder rows={after.ladder} growthPctPerYear={plan.demand.growthPctPerYear} height={230} /> : <p className="vw-label">No ladder for this plan type.</p>}
                {effect.lastA && effect.lastB && <p className="pn-foot vw-label">At the end: {kw(effect.lastA.installedKw)} installed (was {kw(effect.lastB.installedKw)}), {kw(effect.lastA.headroomKw)} usable headroom (was {kw(effect.lastB.headroomKw)}){effect.lastA.bindingConstraint !== 'none' ? `; ${effect.lastA.bindingConstraint} binds first` : ''}.</p>}
              </div>
            </div>
          </>}
        </Panel>
      )}

      {editing && <div className="pn-commit" role="region" aria-label="Save the project plan">
        <span className="pn-commit-what">{changes.length ? <><b>{plural(changes.length, 'change')}</b> · {changes.slice(0, 2).join(' · ')}{changes.length > 2 ? ` · and ${changes.length - 2} more` : ''}</> : <span className="vw-label">No change yet</span>}</span>
        <span className="pn-commit-act"><Btn onClick={cancel}>Discard</Btn><Btn variant="filled" icon={policy.mode === 'revision' ? I.GitBranch : policy.mode === 'withdraw-first' ? I.Undo2 : I.Check} disabled={saving || !changes.length || problems.length > 0} onClick={() => void save()} title={policy.note || undefined}>{saving ? 'Saving…' : policy.commitLabel}</Btn></span>
      </div>}

      {editing && after && draft ? <>
        <h3 className="pn-section-h"><I.CalendarClock size={16} />Schedule with your changes</h3>
        <ScheduleTab plan={draft} ev={after} data={data} />
      </> : <ScheduleTab plan={plan} ev={ev} data={data} />}
    </div>
  );
}
