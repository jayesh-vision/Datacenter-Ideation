/* Work orders shared parts (14-Oct-2026, P2B gap fill step B): swimlane process diagram, step track, task form. Our own drawing
   (HTML boxes on a lane grid), not a BPMN viewer. */
import { useEffect, useState } from 'react';
import * as I from 'lucide-react';
import { claimWfTask, completeWfTask } from '../../api';
import type { WfInstance, WfProcess, WfTask } from '../../api/types';
import { Btn, Chip } from '../../ui/kit';
import { fmtDateTime } from '../../lib/format';

export const KIND_ICON = { user: I.User, auto: I.Cog, decision: I.GitFork } as const;
export const hrs = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h * 10) / 10} h` : `${Math.round((h / 24) * 10) / 10} d`);

/* swimlane: one row per lane, steps placed left to right in process order; done = filled, current = ringed, side branches dashed */
export function Swimlane({ p, inst }: { p: WfProcess; inst?: WfInstance }) {
  const mainIds = p.steps.filter(s => !s.branch).map(s => s.id);
  const doneIds = new Set(inst?.history.map(h => h.stepId) ?? []);
  const cur = inst && inst.state !== 'Completed' ? inst.stepId : undefined;
  const cols = p.steps.length;
  return (
    <div className="wf-lanes" style={{ ['--cols' as string]: cols }}>
      {p.lanes.map(l => (
        <div key={l} className="wf-lane">
          <span className="wf-lane-l">{l}</span>
          <div className="wf-lane-row">{p.steps.map((s, i) => s.lane !== l ? <span key={s.id} className="wf-cell" /> : (() => { const Ic = KIND_ICON[s.kind]; const st = cur === s.id ? (inst?.state === 'Incident' ? 'is-incident' : 'is-cur') : doneIds.has(s.id) ? 'is-done' : inst?.state === 'Completed' && !s.branch ? 'is-done' : ''; return (
            <span key={s.id} className={`wf-cell wf-step ${st}${s.branch ? ' is-branch' : ''}`} title={`${i + 1}. ${s.name} · ${s.kind === 'user' ? 'task' : s.kind === 'auto' ? 'automatic' : 'decision'} · target ${hrs(s.hours)}${s.branch ? ' · only when needed' : ''}`}>
              <span className="wf-step-n">{st === 'is-done' ? <I.Check size={11} /> : mainIds.indexOf(s.id) + 1 || '↺'}</span>
              <span className="wf-step-t"><Ic size={11} />{s.name}</span>
            </span>); })())}</div>
        </div>
      ))}
      <div className="wf-legend"><span><i className="is-done" />Done</span><span><i className="is-cur" />Current step</span><span><i className="is-incident" />Failed step</span><span><i className="is-branch" />Only when needed</span><span><I.User size={11} /> task</span><span><I.Cog size={11} /> automatic</span><span><I.GitFork size={11} /> decision</span></div>
    </div>
  );
}

/* horizontal step track for one instance (compact, for the work order page) */
export function StepTrack({ p, inst }: { p: WfProcess; inst: WfInstance }) {
  const steps = p.steps.filter(s => !s.branch);
  return (
    <ol className="wf-track">{steps.map((s, k) => { const cls = inst.state === 'Completed' || k < inst.stepIndex ? 'is-done' : k === inst.stepIndex ? (inst.state === 'Incident' ? 'is-incident' : 'is-cur') : ''; const h = inst.history.find(x => x.stepId === s.id); return (
      <li key={s.id} className={cls} title={h ? `${s.name}: ${h.who} · ${fmtDateTime(h.at)} · took ${hrs(h.tookHours)}` : s.name}>
        <span className="wf-track-dot">{cls === 'is-done' ? <I.Check size={11} /> : k + 1}</span><small>{s.name}</small>
      </li>); })}</ol>
  );
}

/* a task with its form: claim, then complete */
export function TaskCard({ t, me, onDone }: { t: WfTask; me: string; onDone: (msg: string, err?: boolean) => void }) {
  const [data, setData] = useState<Record<string, string | boolean | number>>({});
  useEffect(() => { setData({}); }, [t.id]);
  const mine = t.assignee === me, canAct = t.candidates.includes(me);
  const set = (k: string, v: string | boolean | number) => setData(d => ({ ...d, [k]: v }));
  const missing = t.form.filter(f => f.required && (data[f.key] === undefined || data[f.key] === '' || data[f.key] === false));
  const complete = () => completeWfTask(t.id, data).then(() => onDone(`${t.step} completed`, false)).catch(e => onDone(String(e.message ?? e), true));
  return (
    <div className="wf-task">
      <div className="wf-task-head"><span className="wf-task-ico"><I.ClipboardList size={16} /></span><span className="cell-2"><b>{t.step}</b><small>{t.process} · <span className="mono">{t.businessKey}</span> · {t.lane} lane</small></span>
        {t.overdue ? <Chip tone="error" size="xs" dot>Overdue</Chip> : <Chip tone="neutral" size="xs">due {fmtDateTime(t.due)}</Chip>}</div>
      <p className="wf-task-title">{t.title}</p>
      <div className="wf-task-who"><span><small>Assigned to</small><b>{t.assignee ?? 'Unassigned'}</b></span><span><small>Who can take it</small><b>{t.candidates.join(', ')}</b></span><span><small>Waiting since</small><b>{fmtDateTime(t.created)}</b></span></div>
      {!canAct ? <p className="note note--info"><I.Info size={14} /><span>Only the {t.lane.toLowerCase()} lane can work this task.</span></p>
        : !mine ? <div className="row" style={{ gap: 8 }}><Btn variant="filled" icon={I.Hand} onClick={() => claimWfTask(t.id).then(() => onDone(`${t.step} claimed`, false)).catch(e => onDone(String(e.message ?? e), true))}>{t.assignee ? `Take over from ${t.assignee}` : 'Claim'}</Btn><span className="vw-label">Claim it to fill in the form.</span></div>
        : <div className="wf-form">
          {t.form.map(f => <label key={f.key} className={`wf-f${f.type === 'check' ? ' is-check' : ''}`}>
            {f.type !== 'check' && <span>{f.label}{f.required && <em>*</em>}</span>}
            {f.type === 'select' ? <select className="select" value={String(data[f.key] ?? '')} onChange={e => set(f.key, e.target.value)}><option value="">Pick…</option>{f.options?.map(o => <option key={o}>{o}</option>)}</select>
              : f.type === 'check' ? <><input type="checkbox" checked={!!data[f.key]} onChange={e => set(f.key, e.target.checked)} /><span>{f.label}{f.required && <em>*</em>}</span></>
              : f.type === 'number' ? <input className="input" type="number" value={String(data[f.key] ?? '')} onChange={e => set(f.key, Number(e.target.value))} />
              : <input className="input" value={String(data[f.key] ?? '')} onChange={e => set(f.key, e.target.value)} />}
          </label>)}
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}><span className="vw-label">{missing.length ? `${missing.length} required field${missing.length === 1 ? '' : 's'} left` : 'Ready to complete'}</span><Btn variant="filled" icon={I.CheckCheck} disabled={missing.length > 0} onClick={complete}>Complete task</Btn></div>
        </div>}
    </div>
  );
}
