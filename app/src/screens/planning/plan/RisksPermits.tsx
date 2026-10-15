/* Plan page "Risks & permits" tab (user, 15-Oct-2026: "a clean Risks & permits editor"): the permits and the risk register as quiet lists
   (no grid of inputs), each item opened in a drawer to change it, added from the plan type's standard permits or by hand, removed with
   undo. Edits collect in a working copy; the strip on top and the pinned change bar show what changes against the plan and the effect
   (permits late, last decision against the go-live, top risks, items without owner or mitigation, rule fails from a re-evaluation)
   before anything is saved through the plan-page edit rule (usePlanEdit).
   The register is a living record once a plan is approved: a TRACKING update (a permit's status or applied date; a risk's probability,
   impact, owner or mitigation) saves straight onto the approved / executing plan (`usePlanEdit(plan, { living: true })`), while a
   STRUCTURAL change (adding or removing a permit or a risk, a permit's name, authority, lead time or needed-before date, a risk's title
   or area) drafts a revision like any other edit. When a revision is already open, the change is applied onto the revision's own
   register (by item id), so its earlier edits are kept. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { Btn, Chip, Drawer, Field, Panel } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import { defaultPermits, fromDateInput, toDateInput } from '../../../planner/lib/wizardModel';
import { useDraftEvaluation, usePlans } from '../../../planner/lib/usePlanner';
import { clockMs } from '../../../planner/compat/clock';
import { message } from '../../../planner/compat/notify';
import { NumInput, SelectInput, TextArea, TextInput, date } from '../common';
import { usePlanEdit, landOn, type EditPolicy } from './edit/policy';
import { EditNote } from './edit/EditNote';
import { ChangeBar, EffectStrip, useLeaveGuard, usePending, type Effect } from './EffectBar';

const TAB = 'risks';
const WEEK = 7 * 864e5;
interface Reg { permits: T.PlannerPermit[]; risks: T.PlannerRisk[] }
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/* ------------------------------------------------------------------ what is tracking and what is structural */
const PERMIT_TRACK = new Set<string>(['status', 'appliedAt']);
const RISK_TRACK = new Set<string>(['probability', 'impact', 'owner', 'mitigation']);
const PERMIT_STATUS: T.PlannerPermit['status'][] = ['Not started', 'Applied', 'In review', 'Approved', 'Expired'];
const DOMAINS: T.PlannerRisk['domain'][] = ['Facility', 'Network', 'Supplier', 'Commissioning', 'Regulatory', 'Finance', 'Security'];
const LEVELS: T.PlannerRisk['impact'][] = ['Low', 'Medium', 'High'];
const LV = { Low: 1, Medium: 2, High: 3 } as const;
const changedKeys = <X extends object>(a: X, b: X) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));

interface Diff { changes: string[]; structural: boolean }
function diffOf(plan: Reg, reg: Reg): Diff {
  const out: string[] = []; let structural = false;
  const pa = new Map(plan.permits.map(p => [p.id, p])), pb = new Map(reg.permits.map(p => [p.id, p]));
  for (const p of reg.permits) {
    const o = pa.get(p.id);
    if (!o) { out.push(`Adds permit ${p.name || '(unnamed)'}${p.authority ? ` from ${p.authority}` : ''}, ${p.leadWeeks} weeks`); structural = true; continue; }
    const ks = changedKeys(o, p);
    for (const k of ks) {
      if (!PERMIT_TRACK.has(k)) structural = true;
      if (k === 'status') out.push(`${p.name}: ${o.status} → ${p.status}`);
      else if (k === 'appliedAt') out.push(`${p.name}: applied ${p.appliedAt ? date(p.appliedAt) : '—'}`);
      else if (k === 'leadWeeks') out.push(`${p.name}: lead time ${o.leadWeeks} → ${p.leadWeeks} weeks`);
      else if (k === 'neededBefore') out.push(`${p.name}: needed before ${date(o.neededBefore)} → ${date(p.neededBefore)}`);
      else if (k === 'name') out.push(`Permit ${o.name || '(unnamed)'} renamed ${p.name}`);
      else if (k === 'authority') out.push(`${p.name}: authority ${o.authority || '—'} → ${p.authority || '—'}`);
      else out.push(`${p.name}: ${k} changed`);
    }
  }
  for (const o of plan.permits) if (!pb.has(o.id)) { out.push(`Removes permit ${o.name || '(unnamed)'}`); structural = true; }
  const ra = new Map(plan.risks.map(r => [r.id, r])), rb = new Map(reg.risks.map(r => [r.id, r]));
  for (const r of reg.risks) {
    const o = ra.get(r.id);
    if (!o) { out.push(`Adds risk ${r.title || '(untitled)'} (${r.probability} probability, ${r.impact} impact)`); structural = true; continue; }
    const ks = changedKeys(o, r);
    if (ks.some(k => !RISK_TRACK.has(k))) structural = true;
    if (ks.includes('probability') || ks.includes('impact')) out.push(`${r.title}: rated ${o.probability} / ${o.impact} → ${r.probability} / ${r.impact}`);
    if (ks.includes('owner')) out.push(`${r.title}: owner ${o.owner || '—'} → ${r.owner || '—'}`);
    if (ks.includes('mitigation')) out.push(`${r.title}: mitigation ${o.mitigation ? 'updated' : 'added'}`);
    if (ks.includes('title')) out.push(`Risk ${o.title || '(untitled)'} renamed ${r.title}`);
    if (ks.includes('domain')) out.push(`${r.title}: area ${o.domain} → ${r.domain}`);
  }
  for (const o of plan.risks) if (!rb.has(o.id)) { out.push(`Removes risk ${o.title || '(untitled)'}`); structural = true; }
  return { changes: out, structural };
}

/** The user's edits (mine vs base) applied onto another register (an open revision's), item by item. */
function applyOnto(base: Reg, mine: Reg, onto: Reg): Reg {
  const merge = <X extends { id: string }>(b: X[], m: X[], o: X[]): X[] => {
    const bm = new Map(b.map(x => [x.id, x])), mm = new Map(m.map(x => [x.id, x]));
    const out = o.filter(x => !(bm.has(x.id) && !mm.has(x.id))).map(x => {
      const was = bm.get(x.id), now = mm.get(x.id); if (!was || !now) return x;
      const next = { ...x } as Record<string, unknown>;
      for (const k of changedKeys(was, now)) next[k] = (now as Record<string, unknown>)[k];
      return next as X;
    });
    for (const x of m) if (!bm.has(x.id) && !out.some(y => y.id === x.id)) out.push(x);
    return out;
  };
  return { permits: merge(base.permits, mine.permits, onto.permits), risks: merge(base.risks, mine.risks, onto.risks) };
}

/* ------------------------------------------------------------------ reading a permit and a risk */
interface PermitRead { tone: 'success' | 'error' | 'warning' | 'neutral' | 'info'; line: string; late: boolean; decision?: number }
function readPermit(p: T.PlannerPermit, now: number): PermitRead {
  const need = Date.parse(p.neededBefore); const applyBy = need - p.leadWeeks * WEEK;
  if (p.status === 'Approved') return { tone: 'success', line: '', late: false };
  if (p.status === 'Expired') return { tone: 'error', line: 'expired: apply again', late: true };
  if (p.status === 'Not started') {
    const decision = now + p.leadWeeks * WEEK; const late = decision > need;
    return { tone: late ? 'error' : applyBy - now < 4 * WEEK ? 'warning' : 'neutral', line: late ? `late: a decision now lands ${date(new Date(decision).toISOString())}` : `apply by ${date(new Date(applyBy).toISOString())}`, late, decision };
  }
  const from = p.appliedAt ? Date.parse(p.appliedAt) : now; const decision = from + p.leadWeeks * WEEK; const late = decision > need;
  return { tone: late ? 'error' : 'info', line: `decision about ${date(new Date(decision).toISOString())}${late ? ', after it is needed' : ''}`, late, decision };
}
const riskTone = (r: T.PlannerRisk) => (r.impact === 'High' && r.probability !== 'Low' ? 'high' : r.impact === 'High' || r.probability === 'High' ? 'mid' : 'low');
const RISK_WORD = { high: 'Top', mid: 'Watch', low: 'Low' } as const;
const RISK_CHIP = { high: 'error', mid: 'warning', low: 'neutral' } as const;

function figures(reg: Reg, now: number) {
  const reads = reg.permits.map(p => readPermit(p, now));
  const decisions = reads.map(r => r.decision).filter((x): x is number => x !== undefined);
  return {
    permits: reg.permits.length, granted: reg.permits.filter(p => p.status === 'Approved').length, late: reads.filter(r => r.late).length,
    last: decisions.length ? Math.max(...decisions) : 0,
    top: reg.risks.filter(r => riskTone(r) === 'high').length, open: reg.risks.filter(r => !r.owner?.trim() || !r.mitigation?.trim()).length,
  };
}

/* ------------------------------------------------------------------ the tab */
type Editing = { kind: 'permit'; item: T.PlannerPermit; isNew: boolean } | { kind: 'risk'; item: T.PlannerRisk; isNew: boolean };

export function RisksPermits({ plan }: { plan: T.PlannerPlan }) {
  const nav = useNavigate();
  const plans = usePlans();
  const full = usePlanEdit(plan);
  const live = usePlanEdit(plan, { living: true });
  const [pending, setPending] = usePending<Reg>(`rp:${plan.id}:${plan.updatedAt}`);
  const base: Reg = useMemo(() => ({ permits: plan.permits ?? [], risks: plan.risks ?? [] }), [plan.permits, plan.risks]);
  const reg = pending ?? base;
  const diff = useMemo(() => (pending ? diffOf(base, pending) : { changes: [], structural: false }), [base, pending]);
  const dirty = diff.changes.length > 0;
  useLeaveGuard(dirty);
  const [now] = useState(() => clockMs());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const canTrack = live.policy.mode !== 'read-only';
  const canStructure = full.policy.mode !== 'read-only';
  const active = diff.structural ? full : live;
  const evBefore = useDraftEvaluation(plan);
  const draft = useMemo(() => (dirty ? { ...plan, ...reg } : undefined), [dirty, plan, reg]);
  const evAfter = useDraftEvaluation(draft) ?? evBefore;

  const fb = figures(base, now), fa = figures(reg, now);
  const day = (v: number) => (v ? date(new Date(v).toISOString()) : '—');
  const effects: Effect[] = [
    { key: 'permits', label: 'Permits', before: fb.permits, after: fa.permits },
    { key: 'granted', label: 'Granted', before: fb.granted, after: fa.granted, good: 'up' },
    { key: 'late', label: 'Late', before: fb.late, after: fa.late, good: 'down', sub: 'after the need date' },
    { key: 'last', label: 'Last decision', before: fb.last, after: fa.last, fmt: day, sub: `go-live ${date(plan.targetGoLive)}` },
    { key: 'top', label: 'Top risks', before: fb.top, after: fa.top, good: 'down' },
    { key: 'open', label: 'Risk gaps', before: fb.open, after: fa.open, good: 'down', sub: 'no owner or mitigation' },
    ...(evBefore && evAfter ? [{ key: 'fails', label: 'Rule fails', before: evBefore.hardFails, after: evAfter.hardFails, good: 'down' as const, sub: `${evAfter.softWarns} warning${evAfter.softWarns === 1 ? '' : 's'}` }] : []),
  ];

  // the banner: what saving will do; on an approved plan both rules are said at once until a change picks one
  const note: EditPolicy = !dirty && full.policy.mode !== live.policy.mode
    ? { ...full.policy, note: `${full.policy.note} A permit's status or a risk's rating, owner and mitigation are a live register: those updates save straight to this plan.` }
    : active.policy;
  const set = (next: Reg) => setPending(same(next, base) ? undefined : next);
  const apply = (e: Editing) => {
    if (e.kind === 'permit') set({ ...reg, permits: e.isNew ? [...reg.permits, e.item] : reg.permits.map(x => (x.id === e.item.id ? e.item : x)) });
    else set({ ...reg, risks: e.isNew ? [...reg.risks, e.item] : reg.risks.map(x => (x.id === e.item.id ? e.item : x)) });
    setEditing(null);
  };
  const remove = (e: Editing) => {
    if (e.kind === 'permit') set({ ...reg, permits: reg.permits.filter(x => x.id !== e.item.id) });
    else set({ ...reg, risks: reg.risks.filter(x => x.id !== e.item.id) });
    setEditing(null);
  };
  const undoRemove = (kind: 'permit' | 'risk', id: string) => {
    if (kind === 'permit') { const p = base.permits.find(x => x.id === id); if (p) set({ ...reg, permits: [...reg.permits, p] }); }
    else { const r = base.risks.find(x => x.id === id); if (r) set({ ...reg, risks: [...reg.risks, r] }); }
  };
  const stamp = () => Date.now().toString(36);
  const standard = useMemo(() => { const have = new Set(reg.permits.map(p => p.name.trim().toLowerCase())); return defaultPermits(plan.scope, plan.targetGoLive).filter(p => !have.has(p.name.toLowerCase())); }, [reg.permits, plan.scope, plan.targetGoLive]);
  const addStandard = () => { const s = stamp(); set({ ...reg, permits: [...reg.permits, ...standard.map((p, i) => ({ ...p, id: `PM-${s}-${i}` }))] }); };

  const save = async () => {
    if (!pending) return;
    setBusy(true);
    let mine: Reg = pending;
    const tgt = active.policy.mode === 'revision' && active.policy.target?.id ? plans.find(p => p.id === active.policy.target!.id) : undefined;
    if (tgt) mine = applyOnto(base, pending, { permits: tgt.permits ?? [], risks: tgt.risks ?? [] });
    const patch: Partial<T.PlannerPlan> = {};
    if (!same(base.permits, pending.permits)) patch.permits = mine.permits;
    if (!same(base.risks, pending.risks)) patch.risks = mine.risks;
    const what = `Risks and permits: ${diff.changes.slice(0, 2).join('; ')}${diff.changes.length > 2 ? ` and ${diff.changes.length - 2} more` : ''}`;
    const r = await active.commit(patch, what).finally(() => setBusy(false));
    if (!r.ok) { message.error(r.reason); return; }
    setPending(undefined);
    const to = landOn(plan, r, TAB);
    if (to) nav(to);
    else if (active.policy.mode === 'in-place') message.success(`Saved: ${diff.changes[0]}${diff.changes.length > 1 ? ` and ${diff.changes.length - 1} more` : ''}`);
  };

  const removedPermits = base.permits.filter(p => !reg.permits.some(x => x.id === p.id));
  const removedRisks = base.risks.filter(r => !reg.risks.some(x => x.id === r.id));
  const state = <X extends { id: string }>(x: X, list: X[]) => { const o = list.find(y => y.id === x.id); return !o ? ' is-new' : !same(o, x) ? ' is-edited' : ''; };
  const permits = [...reg.permits].sort((a, b) => a.neededBefore.localeCompare(b.neededBefore));
  const risks = [...reg.risks].sort((a, b) => LV[b.impact] * LV[b.probability] - LV[a.impact] * LV[a.probability]);
  return (
    <div className="col peq" style={{ gap: 14 }} data-editor="risks">
      <EditNote policy={note} tab={TAB} />
      <EffectStrip effects={effects} dirty={dirty} />
      <div className="peq-rp">
        <Panel icon={I.Stamp} title="Permits and consents" count={reg.permits.length} info="Every permit the work needs, who grants it, how long the decision takes and when it is needed. Apply-by = needed-before less the lead time; a decision after the need date fails the compliance rule."
          actions={canStructure ? <span className="row" style={{ gap: 6 }}>{standard.length > 0 && <Btn size="sm" icon={I.ListPlus} title={standard.map(p => p.name).join(', ')} onClick={addStandard}>Add {standard.length} standard</Btn>}<Btn size="sm" icon={I.Plus} onClick={() => setEditing({ kind: 'permit', isNew: true, item: { id: `PM-${stamp()}`, name: '', authority: '', leadWeeks: 8, neededBefore: plan.targetGoLive, status: 'Not started' } })}>Add a permit</Btn></span> : undefined}>
          {permits.length || removedPermits.length ? <ul className="peq-reg" aria-label="Permits">
            {permits.map(p => { const r = readPermit(p, now); return (
              <li key={p.id} className={`${canTrack ? 'is-click' : ''}${state(p, base.permits)}`} data-id={p.id} onClick={canTrack ? () => setEditing({ kind: 'permit', isNew: false, item: p }) : undefined} role={canTrack ? 'button' : undefined} tabIndex={canTrack ? 0 : undefined} onKeyDown={canTrack ? e => { if (e.key === 'Enter') setEditing({ kind: 'permit', isNew: false, item: p }); } : undefined}>
                <span className="peq-score is-permit" title={`${p.leadWeeks} weeks to a decision`}>{p.leadWeeks}w</span>
                <span className="peq-reg-main"><b>{p.name || 'Unnamed permit'}</b><small>{p.authority || 'Authority not set'} · {p.leadWeeks} weeks to decide · needed before {date(p.neededBefore)}</small></span>
                <span className="peq-reg-side"><Chip tone={p.status === 'Approved' ? 'success' : p.status === 'Expired' ? 'error' : p.status === 'Not started' ? 'neutral' : 'info'} size="xs" dot>{p.status === 'Approved' ? 'Granted' : p.status}</Chip>{r.line && <small className={r.late ? 'pn-bad' : r.tone === 'warning' ? 'pn-warn' : undefined}>{r.line}</small>}</span>
              </li>); })}
            {removedPermits.map(p => <li key={p.id} className="is-gone"><span className="peq-score is-permit">{p.leadWeeks}w</span><span className="peq-reg-main"><b>{p.name}</b><small>removed</small></span><span className="peq-reg-side"><Btn size="xs" variant="ghost" icon={I.Undo2} onClick={() => undoRemove('permit', p.id)}>Undo</Btn></span></li>)}
          </ul> : <p className="vw-label" style={{ margin: 0 }}>No permits listed. A permit decided after the work it gates starts fails the compliance rule.</p>}
        </Panel>
        <Panel icon={I.ShieldAlert} title="Risk register" count={reg.risks.length} info="What could go wrong, how likely and how bad, who owns it and what is done about it. Top = high impact and not unlikely; high-impact risks need an owner and a mitigation before submission."
          actions={canStructure ? <Btn size="sm" icon={I.Plus} onClick={() => setEditing({ kind: 'risk', isNew: true, item: { id: `R-${stamp()}`, title: '', domain: 'Facility', probability: 'Medium', impact: 'Medium', owner: plan.ownerName, mitigation: '', source: 'user' } })}>Add a risk</Btn> : undefined}>
          {risks.length || removedRisks.length ? <ul className="peq-reg" aria-label="Risks">
            {risks.map(r => { const t = riskTone(r); return (
              <li key={r.id} className={`${canTrack ? 'is-click' : ''}${state(r, base.risks)}`} data-id={r.id} onClick={canTrack ? () => setEditing({ kind: 'risk', isNew: false, item: r }) : undefined} role={canTrack ? 'button' : undefined} tabIndex={canTrack ? 0 : undefined} onKeyDown={canTrack ? e => { if (e.key === 'Enter') setEditing({ kind: 'risk', isNew: false, item: r }); } : undefined}>
                <span className={`peq-score is-${t}`} title={`Probability ${r.probability} × impact ${r.impact}`}>{LV[r.probability] * LV[r.impact]}</span>
                <span className="peq-reg-main"><b>{r.title || 'Untitled risk'}</b><small>{r.domain} · {r.owner ? `owner ${r.owner}` : <span className="pn-warn">no owner</span>}{r.evidence ? ` · ${r.evidence}` : ''}</small><small className="peq-mit"><I.ShieldCheck size={12} aria-hidden />{r.mitigation || <span className="pn-warn">No mitigation recorded</span>}</small></span>
                <span className="peq-reg-side"><Chip tone={RISK_CHIP[t]} size="xs" dot>{RISK_WORD[t]}</Chip><small>{r.probability} probability · {r.impact} impact</small></span>
              </li>); })}
            {removedRisks.map(r => <li key={r.id} className="is-gone"><span className="peq-score is-low">–</span><span className="peq-reg-main"><b>{r.title}</b><small>removed</small></span><span className="peq-reg-side"><Btn size="xs" variant="ghost" icon={I.Undo2} onClick={() => undoRemove('risk', r.id)}>Undo</Btn></span></li>)}
          </ul> : <p className="vw-label" style={{ margin: 0 }}>No risks yet. High-impact risks need an owner and a mitigation before submission.</p>}
        </Panel>
      </div>
      {canTrack && <ChangeBar policy={active.policy} changes={diff.changes} effects={effects} busy={busy} onDiscard={() => setPending(undefined)} onCommit={() => void save()}
        extra={full.policy.mode !== live.policy.mode ? <p className="vw-label" style={{ margin: '10px 0 0', fontSize: 12 }}>{diff.structural ? 'This change adds, removes or re-dates items, so it goes through a revision.' : 'Only status, rating, owner or mitigation change: the live register is updated on this plan.'}</p> : undefined} />}
      {editing && <ItemDrawer editing={editing} structural={canStructure} goLive={plan.targetGoLive} now={now} onClose={() => setEditing(null)} onApply={apply} onRemove={remove} />}
    </div>
  );
}

/* ------------------------------------------------------------------ the drawer */
function ItemDrawer({ editing, structural, goLive, now, onClose, onApply, onRemove }: { editing: Editing; structural: boolean; goLive: string; now: number; onClose: () => void; onApply: (e: Editing) => void; onRemove: (e: Editing) => void }) {
  const [e, setE] = useState<Editing>(editing);
  const permit = e.kind === 'permit';
  const upP = (p: Partial<T.PlannerPermit>) => setE(x => (x.kind === 'permit' ? { ...x, item: { ...x.item, ...p } } : x));
  const upR = (p: Partial<T.PlannerRisk>) => setE(x => (x.kind === 'risk' ? { ...x, item: { ...x.item, ...p } } : x));
  const valid = e.kind === 'permit' ? !!e.item.name.trim() && e.item.leadWeeks >= 0 : !!e.item.title.trim();
  const changed = !same(e.item, editing.item);
  const ro = (label: string, v: string) => <Field label={label}><span className="peq-ro">{v || '—'}</span></Field>;
  const title = e.isNew ? (permit ? 'Add a permit' : 'Add a risk') : permit ? (e.item as T.PlannerPermit).name || 'Permit' : (e.item as T.PlannerRisk).title || 'Risk';
  return (
    <Drawer open onClose={onClose} width={520} title={title} sub={!structural ? 'Only the status, rating, owner and mitigation can change on this plan now; the rest needs a revision.' : e.isNew ? 'Added to your changes; nothing is saved until you save from the bar.' : 'Your edit joins the pending changes; the bar shows the effect before you save.'}
      foot={<>{!e.isNew && structural && <Btn variant="ghost" icon={I.Trash2} className="peq-drawer-del" onClick={() => onRemove(e)}>Remove</Btn>}<Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Check} disabled={!valid || (!changed && !e.isNew)} onClick={() => onApply(e)}>{e.isNew ? 'Add' : 'Apply'}</Btn></>}>
      {e.kind === 'permit' ? (
        <div className="peq-form">
          {structural ? <Field label="Permit" required><TextInput value={e.item.name} placeholder="e.g. Building permit" onChange={v => upP({ name: v })} /></Field> : ro('Permit', e.item.name)}
          {structural ? <Field label="Granted by"><TextInput value={e.item.authority} placeholder="Who grants it" onChange={v => upP({ authority: v })} /></Field> : ro('Granted by', e.item.authority)}
          {structural ? <Field label="Lead time"><NumInput value={e.item.leadWeeks} min={0} unit="wk" onChange={v => v !== undefined && upP({ leadWeeks: v })} /></Field> : ro('Lead time', `${e.item.leadWeeks} weeks`)}
          {structural ? <Field label="Needed before"><TextInput type="date" value={toDateInput(e.item.neededBefore)} onChange={v => upP({ neededBefore: fromDateInput(v, e.item.neededBefore) })} /></Field> : ro('Needed before', date(e.item.neededBefore))}
          <Field label="Status"><SelectInput value={e.item.status} options={PERMIT_STATUS.map(s => ({ id: s, label: s === 'Approved' ? 'Granted (approved)' : s }))} onChange={v => upP({ status: v, ...(v !== 'Not started' && !e.item.appliedAt ? { appliedAt: new Date(now).toISOString() } : {}) })} /></Field>
          {e.item.status !== 'Not started' ? <Field label="Applied on"><TextInput type="date" value={e.item.appliedAt ? toDateInput(e.item.appliedAt) : ''} onChange={v => upP({ appliedAt: v ? fromDateInput(v, e.item.appliedAt ?? new Date(now).toISOString()) : undefined })} /></Field> : <span />}
          <p className="peq-form-note">{(() => { const r = readPermit(e.item, now); const l = r.line || 'granted'; return `${l[0].toUpperCase()}${l.slice(1)}.${Date.parse(e.item.neededBefore) > Date.parse(goLive) ? ` Needed after the go-live (${date(goLive)}).` : ''}`; })()}</p>
        </div>
      ) : (
        <div className="peq-form">
          {structural ? <Field label="Risk" required style={{ gridColumn: '1 / -1' }}><TextInput value={e.item.title} placeholder="What could go wrong" onChange={v => upR({ title: v })} /></Field> : <div className="is-wide">{ro('Risk', e.item.title)}</div>}
          {structural ? <Field label="Area"><SelectInput value={e.item.domain} options={DOMAINS.map(d => ({ id: d, label: d }))} onChange={v => upR({ domain: v })} /></Field> : ro('Area', e.item.domain)}
          <Field label="Owner"><TextInput value={e.item.owner} onChange={v => upR({ owner: v })} /></Field>
          <Field label="Probability"><SelectInput value={e.item.probability} options={LEVELS.map(l => ({ id: l, label: l }))} onChange={v => upR({ probability: v })} /></Field>
          <Field label="Impact"><SelectInput value={e.item.impact} options={LEVELS.map(l => ({ id: l, label: l }))} onChange={v => upR({ impact: v })} /></Field>
          <Field label="Mitigation" style={{ gridColumn: '1 / -1' }}><TextArea rows={3} value={e.item.mitigation} placeholder="What is done about it" onChange={v => upR({ mitigation: v })} /></Field>
          {e.item.evidence && <p className="peq-form-note">Flagged by the planner: {e.item.evidence}</p>}
          <p className="peq-form-note">Priority: {RISK_WORD[riskTone(e.item)].toLowerCase()} (top = high impact and not unlikely){riskTone(e.item) === 'high' && (!e.item.owner || !e.item.mitigation) ? '. A top risk needs an owner and a mitigation before submission.' : '.'}</p>
        </div>
      )}
    </Drawer>
  );
}
