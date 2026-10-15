/* Shared parts of the Planner screens (Plan & Build, 13-Oct-2026): the planner's engine works in US dollars and ISO dates; these
   helpers show them in the geography's money and date style, with the app's chips, inputs and toasts. */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import * as Ic from 'lucide-react';
import { geoNow } from '../../api';
import type * as T from '../../planner/p2b/types';
import type { Finding, ParamValue } from '../../planner/lib/engine';
import { fmtKw as fmtKwEngine } from '../../planner/lib/engine';
import { onNotify, type Note } from '../../planner/compat/notify';
import { Chip, Modal, Btn, CheckBox } from '../../ui/kit';
import { fmtDate as fmtDay, fmtMoney } from '../../lib/format';
import type { Tone } from '../../lib/tone';

/* ---- money and dates */
export const USD_RATE = 50;
export const fromUsd = (usd: number) => (geoNow().id === 'us' ? usd : usd * USD_RATE);
/** a planner figure (USD) in the geography's money, short form (K / M) */
export const money = (usd: number | undefined | null) => (usd === undefined || usd === null ? '—' : fmtMoney(fromUsd(usd)));
export const kw = (n: number) => fmtKwEngine(n);
export const date = (iso?: string | null) => (iso ? fmtDay(new Date(iso).getTime()) : '—');
export const num = (n: number, d = 0) => n.toLocaleString(geoNow().currency.locale, { maximumFractionDigits: d });
export const pct = (n: number) => `${Math.round(n)}%`;

/* ---- vocabulary */
export const STATUS_TONE: Record<T.PlannerPlanStatus, Tone> = { Draft: 'neutral', 'In review': 'info', Approved: 'success', Executing: 'warning', Completed: 'purple', Rejected: 'error', 'On hold': 'orange', Cancelled: 'neutral' };
export const PlanStatusChip = ({ s, size = 'sm' }: { s: T.PlannerPlanStatus; size?: 'sm' | 'xs' }) => <Chip tone={STATUS_TONE[s]} size={size} dot>{s}</Chip>;
export const TEMPLATE_TONE: Record<T.PlannerTemplate['status'], Tone> = { draft: 'neutral', published: 'success', deprecated: 'warning' };
export const TemplateStatusChip = ({ s }: { s: T.PlannerTemplate['status'] }) => <Chip tone={TEMPLATE_TONE[s]} dot>{s === 'deprecated' ? 'Retired' : s[0].toUpperCase() + s.slice(1)}</Chip>;
export const SOURCE_LABEL: Record<T.PlannerParamSource, string> = { user: 'Entered', requirement: 'From requirements', template: 'Template default', benchmark: 'Benchmark', actual: 'Estate actual', document: 'From document', ai: 'Proposed' };
const SOURCE_SHORT: Record<T.PlannerParamSource, string> = { user: 'Entered', requirement: 'Requirements', template: 'Default', benchmark: 'Benchmark', actual: 'Actual', document: 'Document', ai: 'Proposed' };
export const SourceChip = ({ s, note, short }: { s?: T.PlannerParamSource; note?: string; short?: boolean }) => (s ? <Chip tone={s === 'template' ? 'neutral' : s === 'user' || s === 'requirement' ? 'info' : 'cyan'} size="xs" title={`${SOURCE_LABEL[s]}${note ? ` · ${note}` : ''}`}>{short ? SOURCE_SHORT[s] : SOURCE_LABEL[s]}</Chip> : null);
export const SCOPE_LABEL: Record<T.PlannerScope, string> = {
  rack: 'Rack placement', pod: 'Pod, row or cage', hall: 'Hall fit-out', retrofit: 'Liquid retrofit', plant: 'Plant upgrade', network: 'Network uplift', expansion: 'Site expansion', 'new-dc': 'New datacenter',
  portfolio: 'Regional portfolio', migration: 'Migration or decommission', edge: 'Edge rollout', 'server-refresh': 'Server refresh', 'network-refresh': 'Network device refresh', 'rack-replace': 'Rack replacement',
};
export const SCOPE_ICON: Record<T.PlannerScope, LucideIcon> = {
  rack: Ic.Server, pod: Ic.Rows3, hall: Ic.Warehouse, retrofit: Ic.Droplets, plant: Ic.Zap, network: Ic.Network, migration: Ic.ArrowRightLeft,
  'server-refresh': Ic.RefreshCw, 'network-refresh': Ic.Router, 'rack-replace': Ic.Replace, expansion: Ic.Building, 'new-dc': Ic.Building2, portfolio: Ic.Map, edge: Ic.RadioTower,
};
export const SCOPE_GROUP: Record<T.PlannerScope, 'On an existing site' | 'Replace or refresh' | 'New capacity'> = {
  rack: 'On an existing site', pod: 'On an existing site', hall: 'On an existing site', retrofit: 'On an existing site', plant: 'On an existing site', network: 'On an existing site', migration: 'On an existing site',
  'server-refresh': 'Replace or refresh', 'network-refresh': 'Replace or refresh', 'rack-replace': 'Replace or refresh', expansion: 'New capacity', 'new-dc': 'New capacity', edge: 'New capacity', portfolio: 'New capacity',
};
export const ASPECT_LABEL: Record<T.PlannerAspect, string> = { space: 'Space and layout', power: 'Power', cooling: 'Cooling', network: 'Network', it: 'Compute, storage and GPU', fire: 'Fire and life safety', security: 'Security', sustainability: 'Sustainability', resilience: 'Resilience', operations: 'Operations', supply: 'Supply chain', schedule: 'Schedule', finance: 'Finance', compliance: 'Compliance and permits', commissioning: 'Commissioning', migration: 'Migration', risk: 'Risk' };
export const FINDING_TONE: Record<Finding['status'], Tone> = { pass: 'success', fail: 'error', warn: 'warning', 'n/a': 'neutral' };
export const fmtValue = (v: ParamValue | undefined, unit?: string) => (v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'number' ? `${num(v, 2)}${unit ? ` ${unit}` : ''}` : String(v));

/* ---- findings (rule checks) as a list */
/** `rich` adds the rule id, the measured value, the standard or source with its threshold, and a "declared, not measured" chip (Rules tab). */
export function FindingList({ findings, empty = 'No rules apply here.', rich }: { findings: Finding[]; empty?: string; rich?: boolean }) {
  const order = { fail: 0, warn: 1, pass: 2, 'n/a': 3 };
  const rows = [...findings].sort((a, b) => order[a.status] - order[b.status]);
  if (!rows.length) return <p className="vw-label">{empty}</p>;
  return (
    <ul className={`pn-findings${rich ? ' is-rich' : ''}`}>{rows.map(f => (
      <li key={f.rule.id}>
        <Chip tone={FINDING_TONE[f.status]} size="xs">{f.status === 'n/a' ? 'N/A' : f.status[0].toUpperCase() + f.status.slice(1)}</Chip>
        {rich ? <span className="cell-2">
          <span className="pn-find-head"><b>{f.rule.title}</b><span className="mono vw-label">{f.rule.id}</span>{f.value && <Chip tone="neutral" size="xs">{f.value}</Chip>}{/^Declared/i.test(f.detail) && <Chip tone="warning" size="xs" outline>declared, not measured</Chip>}</span>
          <small>{f.detail}</small>
          {(f.rule.standard || f.rule.source || f.rule.threshold !== undefined) && <small className="pn-find-src">{[f.rule.standard ?? f.rule.source, f.rule.threshold !== undefined ? `threshold ${f.rule.threshold}` : ''].filter(Boolean).join(' · ')}</small>}
        </span> : <span className="cell-2"><b>{f.rule.title}</b><small>{f.detail}</small></span>}
        <Chip tone={f.rule.severity === 'hard' ? 'error' : 'warning'} size="xs" outline>{f.rule.severity === 'hard' ? 'Must' : 'Should'}</Chip>
      </li>
    ))}</ul>
  );
}

/* ---- inputs on our .input / .select classes */
export function NumInput({ value, onChange, min, max, step, unit, placeholder, disabled, style }: { value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; unit?: string; placeholder?: string; disabled?: boolean; style?: React.CSSProperties }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => { setText(t => (t !== '' && Number(t) === value ? t : value === undefined ? '' : String(value))); }, [value]);
  const el = <input type="number" className="input" value={text} min={min} max={max} step={step} placeholder={placeholder} disabled={disabled} style={unit ? { flex: 1, minWidth: 0 } : style}
    onChange={e => { setText(e.target.value); const n = Number(e.target.value); onChange(e.target.value === '' || !Number.isFinite(n) ? undefined : n); }} />;
  return unit ? <span className="pn-unit" style={style}>{el}<small>{unit}</small></span> : el;
}
export function SelectInput<V extends string>({ value, onChange, options, placeholder, disabled, style }: { value: V | undefined; onChange: (v: V) => void; options: { id: V; label: string }[]; placeholder?: string; disabled?: boolean; style?: React.CSSProperties }) {
  return <select className="select" value={value ?? ''} disabled={disabled} style={style} onChange={e => onChange(e.target.value as V)}>{(value === undefined || placeholder) && <option value="" disabled={value !== undefined}>{placeholder ?? '—'}</option>}{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>;
}
export const TextInput = ({ value, onChange, placeholder, disabled, type = 'text', style }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; type?: string; style?: React.CSSProperties }) =>
  <input type={type} className="input" value={value} placeholder={placeholder} disabled={disabled} style={style} onChange={e => onChange(e.target.value)} />;
export const TextArea = ({ value, onChange, placeholder, rows = 3, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; disabled?: boolean }) =>
  <textarea className="input pn-textarea" rows={rows} value={value} placeholder={placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} />;

/* ---- a modal that asks for a reason before an action (withdraw, hold, cancel, reject) */
export interface ReasonRequest { title: string; description?: ReactNode; okText: string; danger?: boolean; needsReason: boolean; placeholder?: string; onOk: (reason: string) => void }
export function ReasonModal({ req, onClose }: { req: ReasonRequest | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => { setReason(''); }, [req]);
  const short = !!req?.needsReason && reason.trim().length < 5;
  return (
    <Modal open={!!req} onClose={onClose} title={req?.title ?? ''} width={480}
      foot={<div className="row" style={{ justifyContent: 'flex-end' }}><Btn onClick={onClose}>Keep as it is</Btn><Btn variant={req?.danger ? 'danger' : 'filled'} disabled={short} onClick={() => { req?.onOk(reason.trim()); onClose(); }}>{req?.okText}</Btn></div>}>
      {req?.description && <p className="vw-label" style={{ margin: '0 0 10px' }}>{req.description}</p>}
      {req?.needsReason && <TextArea value={reason} onChange={setReason} placeholder={req.placeholder ?? 'Reason (kept in the plan history)'} />}
    </Modal>
  );
}

/* ---- the planner's notifications in the app's toast */
export function PlannerToasts() {
  const [n, setN] = useState<Note | null>(null);
  useEffect(() => onNotify(setN), []);
  useEffect(() => { if (!n) return; const h = setTimeout(() => setN(null), n.kind === 'success' ? 5000 : 8000); return () => clearTimeout(h); }, [n]);
  if (!n) return null;
  const bad = n.kind === 'warning' || n.kind === 'error';
  return createPortal(
    <div className="toasts" aria-live="polite"><div className="toast" data-kind={n.kind}>
      <span className={`toast-ico ${bad ? 'tone-warn' : 'tone-success'}`}>{bad ? <TriangleAlert size={15} /> : <Check size={15} />}</span>
      <div style={{ flex: 1, minWidth: 0 }}><b>{bad ? (n.kind === 'error' ? 'Not done' : 'Check this') : 'Done'}</b><span>{n.text}</span></div>
      <button type="button" onClick={() => setN(null)} className="toast-x" aria-label="Dismiss"><X size={14} /></button>
    </div></div>, document.body);
}

/** The kit's CheckBox with its label shown next to it (the kit only gives the label to screen readers); the text toggles it too. */
export function CheckLabel({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <label className="row" style={{ gap: 8, cursor: 'pointer', fontSize: 13, alignItems: 'center', display: 'inline-flex' }}><CheckBox on={on} label={label} onChange={onChange} /><span>{label}</span></label>;
}
