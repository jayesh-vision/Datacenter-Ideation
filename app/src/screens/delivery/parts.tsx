/* Delivery shared parts (14-Oct-2026, P2B gap fill step A): Gantt, cost curve, RAG, programme / project forms. Our design, not P2B's. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, createDeliveryProject, createProgramme, getDcim, getDelivery, getDeliveryTemplates, getProgrammes, useQuery } from '../../api';
import type { CostPoint, DeliveryTemplate, ProgrammeType, ProgrammeView } from '../../api/types';
import { Btn, Chip, Field, Modal } from '../../ui/kit';
import { fmtDate, fmtMoney } from '../../lib/format';
import { TimeChart } from '../../charts/TimeChart';
import { SERIES } from '../../charts/core';

export const RAG_TONE = { green: 'success', amber: 'warning', red: 'error' } as const;
export const RAG_LABEL = { green: 'On track', amber: 'At risk', red: 'Late' } as const;
export const PROG_ICON: Record<ProgrammeType, I.LucideIcon> = { 'Site expansion': I.Building, 'Greenfield build': I.Building2, 'Network modernisation': I.Network, 'Refresh wave': I.RefreshCcw, Resilience: I.ShieldCheck };
const DAY = 864e5;
const errOf = (e: unknown) => String((e as Error)?.message ?? e);

/* ---------------------------------------------------------------- Gantt: rows of bars on a shared time axis, today line, month ticks */
export interface GanttRow { id: string; label: string; sub?: string; start: number; end: number; tone: 'done' | 'active' | 'next' | 'late' | 'wait' | 'lead'; group?: string; onClick?: () => void; note?: string }
export function Gantt({ rows, finish, target }: { rows: GanttRow[]; finish?: number; target?: number }) {
  const now = clockNow();
  if (!rows.length) return <p className="vw-label">Nothing scheduled.</p>;
  const t0 = Math.min(...rows.map(r => r.start), now) - 7 * DAY, t1 = Math.max(...rows.map(r => r.end), now, finish ?? 0, target ?? 0) + 7 * DAY;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * 100;
  const months: number[] = [];
  const d = new Date(t0); d.setDate(1); d.setHours(0, 0, 0, 0);
  const stepM = (t1 - t0) / DAY > 540 ? 3 : (t1 - t0) / DAY > 240 ? 2 : 1;
  for (let m = new Date(d); m.getTime() < t1; m.setMonth(m.getMonth() + stepM)) if (m.getTime() > t0) months.push(m.getTime());
  let lastGroup = '';
  return (
    <div className="dl-gantt">
      <div className="dl-g-axis"><span />
        <span className="dl-g-track">{months.map(m => <em key={m} style={{ left: `${x(m)}%` }}>{new Date(m).toLocaleString('en-US', { month: 'short' })}{new Date(m).getMonth() === 0 || m === months[0] ? ` ${String(new Date(m).getFullYear()).slice(2)}` : ''}</em>)}</span></div>
      {rows.map(r => { const head = r.group && r.group !== lastGroup ? r.group : ''; lastGroup = r.group ?? lastGroup; return (
        <div key={r.id}>
          {head && <div className="dl-g-group">{head}</div>}
          <div className={`dl-g-row${r.onClick ? ' is-click' : ''}`} onClick={r.onClick} role={r.onClick ? 'button' : undefined} tabIndex={r.onClick ? 0 : undefined}>
            <span className="dl-g-l"><b title={r.label}>{r.label}</b>{r.sub && <small>{r.sub}</small>}</span>
            <span className="dl-g-track">
              {months.map(m => <i key={m} className="dl-g-tick" style={{ left: `${x(m)}%` }} />)}
              <span className={`dl-g-bar is-${r.tone}`} style={{ left: `${x(r.start)}%`, width: `${Math.max(0.6, x(r.end) - x(r.start))}%` }} title={`${r.label} · ${fmtDate(r.start)} – ${fmtDate(r.end)}${r.note ? ` · ${r.note}` : ''}`}>{r.note && <small>{r.note}</small>}</span>
              <b className="dl-g-now" style={{ left: `${x(now)}%` }} />
            </span>
          </div>
        </div>); })}
      <div className="dl-g-axis dl-g-foot"><span />
        <span className="dl-g-track">
          <em className="is-now" style={{ left: `${x(now)}%` }}>today</em>
          {target && <em className="is-target" style={{ left: `${x(target)}%` }}>target {fmtDate(target)}</em>}
        </span></div>
      <div className="dl-g-legend">{([['done', 'Done'], ['active', 'In progress'], ['next', 'Upcoming'], ['lead', 'Long-lead order'], ['wait', 'Waiting on a gate'], ['late', 'Late']] as const).map(([k, l]) => <span key={k}><i className={`dl-g-bar is-${k}`} />{l}</span>)}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- cost curve: planned value, earned value, actual cost (shared TimeChart) */
export function CostCurve({ pts, height = 220, bac, eac }: { pts: CostPoint[]; height?: number; bac?: number; eac?: number }) {
  if (pts.length < 2) return <p className="vw-label">Not enough of the schedule has run yet.</p>;
  const lab = (t: number) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric' });
  return (
    <div className="dl-chart">
      <TimeChart height={height} labels={pts.map(p => lab(p.t))} fullLabels={pts.map(p => fmtDate(p.t))} format={v => fmtMoney(v)} yMin={0}
        target={bac ? { value: bac, label: 'Budget' } : undefined}
        series={[
          { key: 'pv', label: 'Planned value', color: '#94A3B8', kind: 'line', dashed: true, values: pts.map(p => p.pv) },
          { key: 'ev', label: 'Earned value', color: SERIES[0], kind: 'line', values: pts.map(p => p.ev) },
          { key: 'ac', label: 'Actual cost', color: '#F59E0B', kind: 'line', values: pts.map(p => p.ac) },
        ]} />
      {eac != null && bac != null && <p className={`dl-chart-note${eac > bac * 1.005 ? ' is-bad' : ''}`}>Forecast at completion <b>{fmtMoney(eac)}</b> · {eac > bac * 1.005 ? `${fmtMoney(eac - bac)} over the budget` : 'within the budget'}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- new programme (with the greenfield blueprint) */
const TYPES: ProgrammeType[] = ['Site expansion', 'Greenfield build', 'Network modernisation', 'Refresh wave', 'Resilience'];
export function NewProgrammeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const { data: d } = useQuery(() => (open ? getDelivery() : Promise.resolve(null)), [open]);
  const { data: progs } = useQuery(() => (open ? getProgrammes() : Promise.resolve([] as ProgrammeView[])), [open]);
  const { data: sites } = useQuery(() => (open ? getDcim() : Promise.resolve(null)), [open]);
  const [type, setType] = useState<ProgrammeType>('Site expansion');
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [sponsor, setSponsor] = useState(''); const [pick, setPick] = useState<string[]>([]);
  const [bp, setBp] = useState(true); const [site, setSite] = useState(''); const [start, setStart] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setName(''); setDesc(''); setSponsor(''); setPick([]); setErr(''); setBp(true); setSite(''); setStart(new Date(clockNow() + 14 * DAY).toISOString().slice(0, 10)); } }, [open]);
  if (!open) return null;
  const taken = new Set((progs ?? []).flatMap(g => g.programme.projectIds));
  const free = (d?.projects ?? []).filter(p => !taken.has(p.id) && p.state !== 'Delivered');
  const planned = (sites?.sites ?? []).filter(s => s.status !== 'on-air');
  const greenfield = type === 'Greenfield build' && bp;
  const st = site || planned[0]?.id || '';
  const go = () => createProgramme({ name, type, description: desc, sponsor, manager: '', projectIds: greenfield ? [] : pick, blueprint: greenfield ? { dcId: st, site: st, start: new Date(start).getTime() } : undefined })
    .then(id => { onClose(); nav(`/delivery/programmes/${id}`); }).catch(e => setErr(errOf(e)));
  return (
    <Modal open onClose={onClose} width={680} title="New programme" sub="A programme groups projects that deliver one outcome; projects can wait on the ones before them."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.FolderPlus} disabled={!name.trim() || (greenfield && !st)} onClick={go}>Create programme</Btn></>}>
      <div className="dl-types">{TYPES.map(t => { const Ic = PROG_ICON[t]; return (
        <button key={t} type="button" className={`dl-type${type === t ? ' is-on' : ''}`} onClick={() => setType(t)}><Ic size={16} /><b>{t}</b></button>); })}</div>
      <div className="dcim-form" style={{ marginTop: 12 }}>
        <Field label="Name" required><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={greenfield ? 'e.g. Phoenix campus build' : 'e.g. Hall 4 expansion'} autoFocus /></Field>
        <Field label="Sponsor" hint="Approves change orders above 5%"><input className="input" value={sponsor} onChange={e => setSponsor(e.target.value)} placeholder="You, if blank" /></Field>
        <Field label="What it delivers" style={{ gridColumn: '1 / -1' }}><input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="One line on the outcome" /></Field>
        {type === 'Greenfield build' && <Field label="Start from" style={{ gridColumn: '1 / -1' }}><label className="ipam-check"><input type="checkbox" checked={bp} onChange={e => setBp(e.target.checked)} /><span>The greenfield blueprint: 6 phases (feasibility → construction → MEP and plant → network backbone → white space → first hall and RFS), each gated on the ones before it; generators, chillers and switchgear are ordered at kick-off.</span></label></Field>}
        {greenfield ? <>
          <Field label="Site" required hint="A planned or building site"><select className="select" value={st} onChange={e => setSite(e.target.value)}>{planned.map(s => <option key={s.id} value={s.id}>{s.id} · {s.city} ({s.status === 'planned' ? 'planned' : 'building'})</option>)}</select></Field>
          <Field label="Kick-off"><input className="input" type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
        </> : <Field label={`Projects (${pick.length})`} hint="Projects not in another programme; you can add more later" style={{ gridColumn: '1 / -1' }}>
          <div className="dcim-fits" style={{ gridTemplateColumns: '1fr' }}>{free.map(p => <label key={p.id} className={pick.includes(p.id) ? 'is-on' : ''}><input type="checkbox" checked={pick.includes(p.id)} onChange={e => setPick(x => (e.target.checked ? [...x, p.id] : x.filter(y => y !== p.id)))} /><span className="mono">{p.id}</span> {p.name}</label>)}
            {!free.length && <span className="vw-label">Every project is already in a programme.</span>}</div>
        </Field>}
        {err && <p className="dcim-err" style={{ gridColumn: '1 / -1' }}>{err}</p>}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- new project wizard: template → details */
const TPL_ICON = (k: string) => ((I as unknown as Record<string, I.LucideIcon>)[k] ?? I.FolderKanban);
export function NewProjectWizard({ open, onClose, programmeId }: { open: boolean; onClose: () => void; programmeId?: string }) {
  const nav = useNavigate();
  const { data: tpls } = useQuery(() => (open ? getDeliveryTemplates() : Promise.resolve([] as DeliveryTemplate[])), [open]);
  const { data: sites } = useQuery(() => (open ? getDcim() : Promise.resolve(null)), [open]);
  const { data: progs } = useQuery(() => (open ? getProgrammes() : Promise.resolve([] as ProgrammeView[])), [open]);
  const [step, setStep] = useState(0); const [tk, setTk] = useState(''); const [name, setName] = useState(''); const [dc, setDc] = useState(''); const [qty, setQty] = useState(1);
  const [start, setStart] = useState(''); const [mgr, setMgr] = useState(''); const [prog, setProg] = useState(''); const [deps, setDeps] = useState<string[]>([]); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setStep(0); setTk(''); setName(''); setDc(''); setErr(''); setMgr(''); setProg(programmeId ?? ''); setDeps([]); setStart(new Date(clockNow() + 7 * DAY).toISOString().slice(0, 10)); } }, [open, programmeId]);
  const t = (tpls ?? []).find(x => x.key === tk);
  const live = useMemo(() => (sites?.sites ?? []).filter(s => s.status === 'on-air'), [sites]);
  if (!open) return null;
  const site = dc || live[0]?.id || '';
  const g = (progs ?? []).find(x => x.programme.id === prog);
  const go = () => createDeliveryProject({ template: tk, name: name || `${site} · ${t?.name}`, dcId: site, start: new Date(start).getTime(), qty, manager: mgr, programmeId: prog || undefined, dependsOn: deps })
    .then(id => { onClose(); nav(`/delivery/projects/${id}`); }).catch(e => setErr(errOf(e)));
  return (
    <Modal open onClose={onClose} width={720} title="New project" sub={step === 0 ? 'Step 1 of 2 · pick a template: it sets the phases, the work orders, the purchase orders and the tests' : `Step 2 of 2 · ${t?.name}`}
      foot={step === 0 ? <><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" iconRight={I.ArrowRight} disabled={!t} onClick={() => { setQty(t!.defaultQty ?? 1); setStep(1); }}>Next</Btn></>
        : <><Btn icon={I.ArrowLeft} onClick={() => setStep(0)}>Back</Btn><span style={{ flex: 1 }} /><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.FolderPlus} onClick={go}>Create project</Btn></>}>
      {step === 0 ? <div className="dl-tpls">{(tpls ?? []).map(x => { const Ic = TPL_ICON(x.icon); return (
        <button key={x.key} type="button" className={`dl-tpl${tk === x.key ? ' is-on' : ''}`} onClick={() => setTk(x.key)}>
          <span className="dl-tpl-top"><span className="dl-tpl-ico"><Ic size={17} /></span><b>{x.name}</b>{tk === x.key && <I.CircleCheck size={16} className="dl-tpl-ok" />}</span>
          <small>{x.description}</small>
          <span className="dl-tpl-meta"><span><I.CalendarRange size={12} />{x.weeks} weeks</span><span><I.ListChecks size={12} />{x.phases.length} phases</span><span><I.Wallet size={12} />from {fmtMoney(x.budgetFrom)}</span></span>
        </button>); })}</div>
        : <div className="dcim-form">
          <Field label="Name" hint={`Blank = ${site} · ${t?.name}`} style={{ gridColumn: '1 / -1' }}><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
          <Field label="Datacenter" required><select className="select" value={site} onChange={e => setDc(e.target.value)}>{live.map(s => <option key={s.id} value={s.id}>{s.id} · {s.city}</option>)}</select></Field>
          <Field label={`How many ${t?.unit ?? 'units'}`}><input className="input" type="number" min={1} max={500} value={qty} onChange={e => setQty(Number(e.target.value))} /></Field>
          <Field label="Start"><input className="input" type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
          <Field label="Project manager"><input className="input" value={mgr} onChange={e => setMgr(e.target.value)} placeholder="You, if blank" /></Field>
          <Field label="Programme" hint="Optional"><select className="select" value={prog} onChange={e => { setProg(e.target.value); setDeps([]); }}><option value="">None</option>{(progs ?? []).filter(x => x.programme.status === 'Active').map(x => <option key={x.programme.id} value={x.programme.id}>{x.programme.name}</option>)}</select></Field>
          {g && <Field label="Waits on" hint="Its work cannot start before these are delivered"><div className="dcim-fits" style={{ gridTemplateColumns: '1fr', maxHeight: 120 }}>{g.projects.map(p => <label key={p.id} className={deps.includes(p.id) ? 'is-on' : ''}><input type="checkbox" checked={deps.includes(p.id)} onChange={e => setDeps(x => (e.target.checked ? [...x, p.id] : x.filter(y => y !== p.id)))} />{p.name}</label>)}</div></Field>}
          <div className="dl-tpl-phases" style={{ gridColumn: '1 / -1' }}><span className="vw-label">Phases</span>{t?.phases.map((ph, i) => <Chip key={ph} tone="neutral" size="xs">{i + 1}. {ph}</Chip>)}</div>
          {err && <p className="dcim-err" style={{ gridColumn: '1 / -1' }}>{err}</p>}
        </div>}
    </Modal>
  );
}
