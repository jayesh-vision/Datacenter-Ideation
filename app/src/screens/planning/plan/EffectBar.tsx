/* Shared by the plan-page editors of equipment / racks / waves (EquipmentEditor.tsx) and risks / permits (RisksPermits.tsx):
   - `EffectStrip`: the figures the editor moves (devices, racks, kW, waves, clashes, rule fails…), "before → after" while a change is pending;
   - `ChangeBar`: pinned under the editor while something is not saved — what changes against the current plan, the effect, Discard,
     Review and the commit button labelled by the edit rule (usePlanEdit: Save / Withdraw and save / Draft revision B). Withdraw-first and
     revision always go through the review dialog first (they change the plan's status or open a new revision);
   - `usePending`: the editor's working copy, kept per plan while the user moves between tabs (lost on reload, guarded by beforeunload). */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip, Modal } from '../../../ui/kit';
import type { EditPolicy } from './edit/policy';
import '../../../styles/planning-equipment.css';

export interface Effect {
  key: string; label: string; before: number; after: number;
  /** how to print a value (default: whole number) */
  fmt?: (v: number) => string;
  /** which direction is better: more problems is worse ('down' is good), more devices is neutral (undefined) */
  good?: 'up' | 'down';
  /** one line under the value */
  sub?: string;
}
const show = (e: Effect, v: number) => (e.fmt ? e.fmt(v) : String(Math.round(v * 10) / 10));
/** a figure moves when its printed value changes (1.21 MW → 1.22 MW printed "1.2 MW" twice is not a move) */
const moves = (e: Effect) => show(e, e.before) !== show(e, e.after);
const toneOf = (e: Effect): 'bad' | 'good' | undefined => {
  if (!e.good || !moves(e)) return undefined;
  const up = e.after > e.before;
  return (up && e.good === 'up') || (!up && e.good === 'down') ? 'good' : 'bad';
};

/** The editor's figures; a figure the pending change moves shows its new value and "was …" under it. */
export function EffectStrip({ effects, dirty }: { effects: Effect[]; dirty: boolean }) {
  if (!effects.length) return null;
  return (
    <div className="peq-fx" role="group" aria-label={dirty ? 'Effect of your changes' : 'This plan today'}>
      {effects.map(e => { const moved = dirty && moves(e); const t = toneOf(e); return (
        <div key={e.key} className={`peq-fx-i${moved ? ' is-moved' : ''}`} data-key={e.key} title={e.sub ? `${e.label}: ${e.sub}` : e.label}>
          <small>{e.label}</small>
          <b className={`num${moved && t ? ` is-${t}` : ''}`}>{show(e, e.after)}</b>
          {moved ? <em className="peq-fx-was">was {show(e, e.before)}</em> : e.sub && <em>{e.sub}</em>}
        </div>); })}
    </div>
  );
}

/** "Devices 12 → 14" chips for the bar. */
function EffectChips({ effects }: { effects: Effect[] }) {
  const moved = effects.filter(moves);
  if (!moved.length) return <span className="vw-label">No effect on the figures</span>;
  return <>{moved.slice(0, 5).map(e => { const t = toneOf(e); return <Chip key={e.key} size="xs" tone={t === 'bad' ? 'error' : t === 'good' ? 'success' : 'neutral'}>{e.label} {show(e, e.before)} → {show(e, e.after)}</Chip>; })}{moved.length > 5 && <span className="vw-label">+{moved.length - 5} more</span>}</>;
}

export function ChangeBar({ policy, changes, effects, busy, onDiscard, onCommit, extra }: {
  policy: EditPolicy; changes: string[]; effects: Effect[]; busy?: boolean; onDiscard: () => void; onCommit: () => void;
  /** an extra line in the review dialog (e.g. which register rule applies) */
  extra?: ReactNode;
}) {
  const [review, setReview] = useState(false);
  if (!changes.length) return null;
  const direct = policy.mode === 'in-place';
  const commitIcon = policy.mode === 'revision' ? I.GitBranch : policy.mode === 'withdraw-first' ? I.Undo2 : I.Check;
  const go = () => { setReview(false); onCommit(); };
  const moved = effects.filter(moves);
  return (<>
    <div className="peq-bar" role="region" aria-label="Changes not saved">
      <div className="peq-bar-main">
        <b><I.PencilLine size={15} aria-hidden />{changes.length} change{changes.length === 1 ? '' : 's'} not saved</b>
        <span className="peq-bar-fx"><EffectChips effects={effects} /></span>
      </div>
      <div className="peq-bar-act">
        <Btn variant="ghost" disabled={busy} onClick={onDiscard}>Discard</Btn>
        <Btn icon={I.ListChecks} disabled={busy} onClick={() => setReview(true)}>Review</Btn>
        <Btn variant="filled" icon={commitIcon} disabled={busy || policy.mode === 'read-only'} onClick={() => (direct ? onCommit() : setReview(true))}>{busy ? 'Saving…' : policy.commitLabel}</Btn>
      </div>
    </div>
    <Modal open={review} onClose={() => setReview(false)} width={620} title="Review the change" sub={policy.note || 'Saved straight onto this draft and recorded in its history.'}
      foot={<><Btn variant="ghost" onClick={() => setReview(false)}>Keep editing</Btn><Btn variant="filled" icon={commitIcon} disabled={busy || policy.mode === 'read-only'} onClick={go}>{policy.commitLabel}</Btn></>}>
      <div className="peq-review">
        <h4>What changes against the plan</h4>
        <ul className="peq-review-list">{changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        {effects.length > 0 && <>
          <h4>Effect</h4>
          <table className="nst-table peq-review-fx"><thead><tr><th>Figure</th><th>Now</th><th>After</th></tr></thead>
            <tbody>{effects.map(e => { const t = toneOf(e); return <tr key={e.key} className={moves(e) ? undefined : 'is-same'}><td>{e.label}</td><td className="num">{show(e, e.before)}</td><td className={`num${t ? ` is-${t}` : ''}`}>{show(e, e.after)}</td></tr>; })}</tbody>
          </table>
          {!moved.length && <p className="vw-label" style={{ margin: '6px 0 0' }}>None of these figures moves.</p>}
        </>}
        {extra}
      </div>
    </Modal>
  </>);
}

/* ---------------------------------------------------------------- working copy kept across tab switches */
const PENDING = new Map<string, unknown>();

/** The editor's working copy for this plan (`undefined` = nothing pending); survives switching tabs, cleared on save / discard. */
export function usePending<V>(key: string): [V | undefined, (v: V | undefined | ((cur: V | undefined) => V | undefined)) => void] {
  const [val, setVal] = useState<{ key: string; v: V | undefined }>(() => ({ key, v: PENDING.get(key) as V | undefined }));
  const cur = val.key === key ? val.v : (PENDING.get(key) as V | undefined);
  const set = useCallback((v: V | undefined | ((c: V | undefined) => V | undefined)) => {
    setVal(prev => {
      const base = prev.key === key ? prev.v : (PENDING.get(key) as V | undefined);
      const next = typeof v === 'function' ? (v as (c: V | undefined) => V | undefined)(base) : v;
      if (next === undefined) PENDING.delete(key); else PENDING.set(key, next);
      return { key, v: next };
    });
  }, [key]);
  return [cur, set];
}

/** Ask before closing the tab while something is not saved. */
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [dirty]);
}
