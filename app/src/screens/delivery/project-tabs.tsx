/* Project page tabs added 14-Oct-2026 (P2B gap fill step A): Schedule (Gantt of milestones and work orders), Cost (curve, change
   orders, commitments) and the change-order / risk forms. */
import { useEffect, useState } from 'react';
import * as I from 'lucide-react';
import { addProjectRisk, advanceWorkOrder, clockNow, decideChangeOrder, raiseChangeOrder } from '../../api';
import { Link } from 'react-router-dom';
import { StageTracker } from './dash';
import { RiskList } from './ProgrammePage';
import { WO_TONE } from './Delivery';
import type { DeliveryProjectView, RiskCategory } from '../../api/types';
import { Btn, Chip, Field, Modal, Panel } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { fmtDate, fmtMoney } from '../../lib/format';
import { currencySymbol } from '../../lib/format';
import { CostCurve, Gantt, type GanttRow } from './parts';

export function Schedule({ v }: { v: DeliveryProjectView }) {
  const now = clockNow();
  const ms: GanttRow[] = v.milestones.map((m, i) => ({ id: `m${i}`, group: 'Milestones', label: m.name, sub: `${fmtDate(m.start)} – ${fmtDate(m.end)}`, start: m.start, end: m.end,
    tone: m.state === 'done' ? 'done' : m.longLead ? 'lead' : m.state === 'active' ? (m.end < now ? 'late' : 'active') : v.project.waitsOn?.length ? 'wait' : 'next' }));
  const wo: GanttRow[] = v.workOrders.map(w => ({ id: w.id, group: 'Work orders', label: w.title, sub: `${w.id} · ${w.crew} · ${w.state}`, start: w.start, end: w.end,
    tone: w.state === 'Done' ? 'done' : w.state === 'In progress' ? (w.end < now ? 'late' : 'active') : v.project.waitsOn?.length ? 'wait' : w.state === 'Awaiting change' ? 'late' : 'next', note: w.kit !== 'Ready' && w.state !== 'Done' ? `kit ${w.kit.toLowerCase()}` : undefined }));
  const blocked = v.workOrders.filter(w => w.state === 'Awaiting change' || (w.state !== 'Done' && w.kit !== 'Ready' && w.start < now + 14 * 864e5));
  return (
    <div className="dl-stack">
      <Panel title="Schedule" icon={I.GanttChart} info="Milestones from the schedule and the work orders split into crew windows, against today and the target date. Long-lead orders (amber) are placed at approval; hatched = waiting on a programme gate.">
        <Gantt rows={[...ms, ...wo]} target={v.project.target} />
      </Panel>
      {blocked.length > 0 && <Panel title="Blockers" icon={I.OctagonAlert} count={blocked.length} info="Work orders that cannot start on time: their change is not approved or their kit is not on site.">
        <ul className="ipam-find">{blocked.map(w => <li key={w.id}><span className="cell-2" style={{ padding: '8px 4px' }}><b>{w.id} · {w.title}</b><small>{w.state === 'Awaiting change' ? `${w.changeId} ${w.changeState.toLowerCase()}` : `kit ${w.kit.toLowerCase()}`} · window {fmtDate(w.start)}</small></span></li>)}</ul>
      </Panel>}
    </div>
  );
}

export function CostTab({ v, onRaise, run }: { v: DeliveryProjectView; onRaise: () => void; run: (f: () => Promise<unknown>, ok: string, body?: string) => void }) {
  const p = v.project;
  const [reject, setReject] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const committed = v.pos.reduce((a, o) => a + o.total, 0), paid = v.pos.filter(o => o.state === 'Delivered').reduce((a, o) => a + o.total, 0);
  return (
    <div className="dl-stack">
      <div className="dl-figs">
        <span><small>Baseline budget</small><b>{fmtMoney(p.budget)}</b></span>
        <span><small>Approved budget</small><b>{fmtMoney(p.budgetApproved)}</b><em>{p.budgetApproved !== p.budget ? `${p.budgetApproved > p.budget ? '+' : ''}${fmtMoney(p.budgetApproved - p.budget)} change orders` : 'no change'}</em></span>
        <span><small>Committed (POs)</small><b>{fmtMoney(committed)}</b><em>{fmtMoney(paid)} received</em></span>
        <span><small>Earned · spent</small><b>{fmtMoney(p.earned)} · {fmtMoney(p.actual)}</b><em className={p.cpi < 0.95 ? 'is-bad' : ''}>CPI {p.cpi}</em></span>
        <span><small>Finish</small><b>{fmtDate(p.finish)}</b><em>{p.finish !== p.baselineFinish ? `baseline ${fmtDate(p.baselineFinish)}` : 'on baseline'}</em></span>
      </div>
      <Panel title="Cost over time" icon={I.TrendingUp} info="Planned value = approved budget spread over the schedule; earned = budget × progress; actual = spend to date.">
        <CostCurve pts={v.costCurve} />
      </Panel>
      <Panel title="Change orders" icon={I.FileDiff} count={v.changeOrders.length} flush actions={p.state !== 'Delivered' && <Btn size="sm" icon={I.Plus} onClick={onRaise}>Raise change order</Btn>}
        info="A change in scope that moves the budget or the finish. Up to 5% of the budget = the project manager decides; up to 15% = the programme sponsor; above = the investment committee. Approved ones add to the approved budget and push the finish.">
        <DataTable rows={v.changeOrders} pageSize={10} empty={<p className="vw-label" style={{ padding: 16 }}>No change orders. Raise one when the scope, the cost or the dates change.</p>} cols={[
          { key: 'n', header: 'Change order', wrap: true, render: c => <span className="cell-2"><b>{c.title}</b><small><span className="mono">{c.id}</span> · {c.reason}</small></span> },
          { key: 'b', header: 'Budget', sort: c => c.budgetDelta, render: c => <span className="rev-amt">{c.budgetDelta >= 0 ? '+' : ''}{fmtMoney(c.budgetDelta)}</span> },
          { key: 'd', header: 'Schedule', render: c => <span className="nowrap">{c.scheduleDays >= 0 ? '+' : ''}{c.scheduleDays} days</span> },
          { key: 'a', header: 'Decided by', render: c => <span className="cell-2"><span>{c.approver}</span><small>{c.decidedBy ? `${c.decidedBy} · ${fmtDate(c.decidedAt!)}${c.note ? ` · ${c.note}` : ''}` : `raised by ${c.raisedBy} · ${fmtDate(c.raisedAt)}`}</small></span> },
          { key: 's', header: 'State', render: c => <Chip tone={c.state === 'Approved' ? 'success' : c.state === 'Rejected' ? 'error' : 'warning'} dot>{c.state}</Chip> },
          { key: 'x', header: '', render: c => c.state === 'Submitted' ? <span className="row" style={{ gap: 4 }}><Btn size="sm" variant="filled" onClick={() => run(() => decideChangeOrder(c.id, 'Approved', ''), `${c.id} approved`, 'The approved budget and the finish date move.')}>Approve</Btn><Btn size="sm" onClick={() => { setReject(c.id); setNote(''); }}>Reject</Btn></span> : null }]} />
      </Panel>
      <Modal open={!!reject} onClose={() => setReject(null)} title={`Reject ${reject}`} sub="Say why, so the project can re-plan." foot={<><Btn onClick={() => setReject(null)}>Cancel</Btn><Btn variant="filled" disabled={!note.trim()} onClick={() => { const id = reject!; setReject(null); run(() => decideChangeOrder(id, 'Rejected', note), `${id} rejected`); }}>Reject</Btn></>}>
        <Field label="Reason" required><input className="input" value={note} onChange={e => setNote(e.target.value)} autoFocus /></Field>
      </Modal>
    </div>
  );
}

export function ChangeOrderModal({ open, pid, budget, onClose, onDone }: { open: boolean; pid: string; budget: number; onClose: () => void; onDone: (t: string) => void }) {
  const [title, setTitle] = useState(''); const [reason, setReason] = useState(''); const [amt, setAmt] = useState(0); const [days, setDays] = useState(0); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setTitle(''); setReason(''); setAmt(0); setDays(0); setErr(''); } }, [open]);
  if (!open) return null;
  const share = budget ? Math.abs(amt) / budget : 0;
  const who = share <= 0.05 ? 'the project manager' : share <= 0.15 ? 'the programme sponsor' : 'the investment committee';
  const go = () => raiseChangeOrder(pid, { title, reason, budgetDelta: amt, scheduleDays: days }).then(c => onDone(`${c.id} raised for ${c.approver.toLowerCase()}`)).catch(e => setErr(String(e.message ?? e)));
  return (
    <Modal open onClose={onClose} title="Raise a change order" sub={`Moves the approved budget (${fmtMoney(budget)}) or the finish date. This one goes to ${who}.`}
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Send} disabled={!title.trim() || !reason.trim()} onClick={go}>Submit</Btn></>}>
      <div className="dcim-form">
        <Field label="What changes" required style={{ gridColumn: '1 / -1' }}><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Two extra racks in row C" autoFocus /></Field>
        <Field label="Why" required style={{ gridColumn: '1 / -1' }}><input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. The customer extended the cage" /></Field>
        <Field label={`Budget change (${currencySymbol()})`} hint={`${Math.round(share * 1000) / 10}% of the budget; negative = a saving`}><input className="input" type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} /></Field>
        <Field label="Schedule change (days)" hint="Negative = earlier"><input className="input" type="number" value={days} onChange={e => setDays(Number(e.target.value))} /></Field>
        {err && <p className="dcim-err" style={{ gridColumn: '1 / -1' }}>{err}</p>}
      </div>
    </Modal>
  );
}

const CATS: RiskCategory[] = ['Supply', 'Permit', 'Cost', 'Schedule', 'Quality', 'Safety', 'Resource'];
export function RiskModal({ open, pid, onClose, onDone }: { open: boolean; pid: string; onClose: () => void; onDone: (t: string) => void }) {
  const [title, setTitle] = useState(''); const [cat, setCat] = useState<RiskCategory>('Schedule'); const [l, setL] = useState(3); const [im, setIm] = useState(3); const [mit, setMit] = useState(''); const [owner, setOwner] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setTitle(''); setMit(''); setOwner(''); setL(3); setIm(3); setErr(''); } }, [open]);
  if (!open) return null;
  const go = () => addProjectRisk(pid, { title, category: cat, likelihood: l, impact: im, mitigation: mit, owner }).then(() => onDone('Risk raised')).catch(e => setErr(String(e.message ?? e)));
  const Scale = ({ v, set, label }: { v: number; set: (n: number) => void; label: string }) => <Field label={label}><div className="dl-scale">{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" className={n === v ? 'is-on' : ''} onClick={() => set(n)}>{n}</button>)}</div></Field>;
  return (
    <Modal open onClose={onClose} title="Raise a risk" sub={`Score ${l * im} of 25 (likelihood × impact)`} foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" disabled={!title.trim()} onClick={go}>Raise risk</Btn></>}>
      <div className="dcim-form">
        <Field label="Risk" required style={{ gridColumn: '1 / -1' }}><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Crane access blocked by roadworks" autoFocus /></Field>
        <Field label="Category"><select className="select" value={cat} onChange={e => setCat(e.target.value as RiskCategory)}>{CATS.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Owner"><input className="input" value={owner} onChange={e => setOwner(e.target.value)} placeholder="You, if blank" /></Field>
        <Scale v={l} set={setL} label="Likelihood" /><Scale v={im} set={setIm} label="Impact" />
        <Field label="Mitigation" style={{ gridColumn: '1 / -1' }}><input className="input" value={mit} onChange={e => setMit(e.target.value)} placeholder="What reduces it" /></Field>
        {err && <p className="dcim-err" style={{ gridColumn: '1 / -1' }}>{err}</p>}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- project hero + overview dashboard (14-Oct-2026 redesign) */
export function ProjectHero({ v }: { v: DeliveryProjectView }) {
  const p = v.project, r = 34, c = 2 * Math.PI * r;
  const late = Math.round((p.finish - p.target) / 864e5);
  return (
    <section className="dl-hero">
      <div className="dl-hero-ring"><svg width={84} height={84}><circle cx={42} cy={42} r={r} className="dl-ring-bg" /><circle cx={42} cy={42} r={r} className={`dl-ring-fg is-${p.health === 'late' ? 'red' : p.health === 'at risk' ? 'amber' : 'green'}`} strokeDasharray={`${c * p.progress} ${c}`} transform="rotate(-90 42 42)" /></svg>
        <span><b>{Math.round(p.progress * 100)}%</b><small>done</small></span></div>
      <div className="dl-hero-f dl-hero-wt"><small>Work against the plan</small>
        <span className="dl-pp-track"><i className="dl-pp-done" style={{ width: `${p.progress * 100}%` }} /><b className="dl-pp-time" style={{ left: `${p.plannedProgress * 100}%` }} /></span>
        <em className={p.spi < 0.95 ? 'is-bad' : ''}>plan {Math.round(p.plannedProgress * 100)}% by today · SPI {p.spi}</em></div>
      <div className="dl-hero-f"><small>Budget</small><b>{fmtMoney(p.budgetApproved)}</b><em className={p.cpi < 0.95 ? 'is-bad' : ''}>{fmtMoney(p.actual)} spent · CPI {p.cpi}</em></div>
      <div className="dl-hero-f"><small>Finish</small><b>{fmtDate(p.finish)}</b><em className={late > 0 ? 'is-bad' : ''}>{late > 0 ? `${late} days after the target` : `target ${fmtDate(p.target)}`}</em></div>
      <div className="dl-hero-f"><small>Work orders</small><b>{p.openWorkOrders} open</b><em>of {p.workOrders} · {v.pos.filter(o => o.state !== 'Delivered').length} orders open</em></div>
      <div className="dl-hero-f"><small>Commissioning</small><b>{p.cxLevel ? `L${p.cxLevel} passed` : 'Not started'}</b><em>{p.snags} snags open</em></div>
    </section>
  );
}

export function ProjectDashboard({ v, onTab, run }: { v: DeliveryProjectView; onTab: (t: string) => void; run: (f: () => Promise<unknown>, ok: string, body?: string) => void }) {
  const p = v.project, now = clockNow();
  const open = v.workOrders.filter(w => w.state !== 'Done').sort((a, b) => a.start - b.start);
  const nextMs = v.milestones.find(m => m.state !== 'done');
  const nextTest = v.tests.find(t => t.state !== 'Passed');
  const blockers = [
    ...(p.waitsOn ?? []).map(w => ({ k: `g${w}`, t: `Waits on ${w} at the programme gate`, s: 'The work cannot start before it is delivered', to: `/delivery/projects/${w}` })),
    ...v.workOrders.filter(w => w.state === 'Awaiting change').map(w => ({ k: w.id, t: `${w.id} waits for ${w.kit !== 'Ready' ? `its kit (${w.kit.toLowerCase()})` : `${w.changeId}`}`, s: `${w.title} · window ${fmtDate(w.start)}`, to: '' })),
    ...v.pos.filter(o => o.state === 'Late').map(o => ({ k: o.id, t: `${o.item} is late`, s: `${o.supplier} · now due ${fmtDate(o.due)}`, to: '' })),
    ...v.permits.filter(x => x.state !== 'Granted' && x.due - now < 42 * 864e5).map(x => ({ k: x.id, t: `${x.name} not granted yet`, s: `${x.authority} · needed ${fmtDate(x.due)}`, to: '' })),
  ];
  const po = (s: string) => v.pos.filter(o => o.state === s).length;
  const nextPo = v.pos.filter(o => o.state !== 'Delivered').sort((a, b) => a.due - b.due).slice(0, 3);
  const dates: [string, number | undefined, string?][] = [['Start', p.start], ['Next milestone', nextMs?.end, nextMs?.name], ['Next test', nextTest?.due, nextTest ? `L${nextTest.level} ${nextTest.name}` : undefined], ['Target', p.target], ['Forecast finish', p.finish, p.finish > p.baselineFinish ? `baseline ${fmtDate(p.baselineFinish)}` : undefined]];
  return (
    <div className="dl-dash">
      <Panel className="dl-span-8" title="Where the project is" icon={I.Compass} info="The project's stage, what it is doing now and what it waits on.">
        <StageTracker p={p} />
        <div className="dl-now">
          <span><small>Now</small><b>{p.waitsOn?.length ? 'Waiting at the programme gate' : open.find(w => w.state === 'In progress')?.title ?? (open[0] ? `Next: ${open[0].title}` : p.state === 'Delivered' ? 'Handed over to operations' : 'Commissioning')}</b></span>
          <span><small>Manager</small><b>{p.manager}</b></span>
          <span><small>Site</small><b>{p.dcId}</b></span>
          <span><small>From</small><b>{p.planId ? <Link className="ent-link" to={`/planning/plans/${p.planId}`}>{p.planId}</Link> : p.template}</b></span>
          {p.programmeId && <span><small>Programme</small><b><Link className="ent-link" to={`/delivery/programmes/${p.programmeId}`}>{p.programmeId}</Link></b></span>}
        </div>
      </Panel>
      <Panel className="dl-span-4" title="Key dates" icon={I.CalendarDays}>
        <ul className="dl-dates">{dates.filter(d => d[1]).map(([l, t, n]) => <li key={l} className={t! < now ? 'is-past' : ''}><small>{l}</small><b>{fmtDate(t!)}</b>{n && <em title={n}>{n}</em>}</li>)}</ul>
      </Panel>
      <Panel className="dl-span-6 dl-h-fill" title="Open work" icon={I.HardHat} count={open.length} actions={<button type="button" className="ent-link" onClick={() => onTab('workorders')}>All →</button>} info="The next work orders by window; start or complete them here.">
        <ul className="dl-work">{open.slice(0, 6).map(w => <li key={w.id}><span className="cell-2"><Link className="ent-link" to={`/delivery/work-orders/${w.id}`}><b>{w.title}</b></Link><small><span className="mono">{w.id}</span> · {w.crew} · {fmtDate(w.start)} – {fmtDate(w.end)}</small></span>
          <Chip tone={WO_TONE[w.state]} size="xs" dot>{w.state}</Chip>
          {!p.waitsOn?.length && p.state !== 'Mobilising' && <Btn size="sm" onClick={() => run(() => advanceWorkOrder(w.id), `${w.id} ${w.state === 'In progress' ? 'completed' : 'started'}`)}>{w.state === 'In progress' ? 'Complete' : 'Start'}</Btn>}</li>)}
          {!open.length && <li><p className="vw-label" style={{ margin: 0 }}>All work orders are done.</p></li>}</ul>
      </Panel>
      <Panel className="dl-span-6 dl-h-fill" title="Blockers" icon={I.OctagonAlert} count={blockers.length} info="What stops work from starting on time: a programme gate, a change or kit not ready, a late order, a permit close to its date.">
        <ul className="ipam-find">{blockers.map(b => <li key={b.k}><span className="cell-2" style={{ padding: '8px 4px' }}>{b.to ? <Link className="ent-link" to={b.to}><b>{b.t}</b></Link> : <b>{b.t}</b>}<small>{b.s}</small></span></li>)}
          {!blockers.length && <li><p className="vw-label" style={{ margin: 0 }}>Nothing is blocking the work.</p></li>}</ul>
      </Panel>
      <Panel className="dl-span-4" title="Milestones" icon={I.Flag} sub={`${v.milestones.filter(m => m.state === 'done').length} of ${v.milestones.length} done`} actions={<button type="button" className="ent-link" onClick={() => onTab('schedule')}>Schedule →</button>}>
        <ol className="dl-ms">{v.milestones.map(m => <li key={m.name} className={`is-${m.state}${m.state === 'active' && m.end < now ? ' is-late' : ''}`}><i /><span className="cell-2"><b>{m.name}</b><small>{fmtDate(m.start)} – {fmtDate(m.end)}{m.longLead ? ' · long lead' : ''}</small></span></li>)}</ol>
      </Panel>
      <Panel className="dl-span-4" title="Procurement and materials" icon={I.Package} sub={`${v.pos.length} purchase orders · ${fmtMoney(v.pos.reduce((a, o) => a + o.total, 0))}`} actions={<button type="button" className="ent-link" onClick={() => onTab('procurement')}>All →</button>}>
        {v.pos.length ? <>
          <span className="dl-mat-bar dl-mat-big"><i className="is-d" style={{ flex: po('Delivered') }} /><i className="is-t" style={{ flex: po('In transit') }} /><i className="is-o" style={{ flex: po('Ordered') + po('Draft') }} /><i className="is-l" style={{ flex: po('Late') }} /></span>
          <div className="dl-c-legend"><span><i className="dl-sw is-md" />{po('Delivered')} delivered</span><span><i className="dl-sw is-mt" />{po('In transit')} in transit</span><span><i className="dl-sw is-mo" />{po('Ordered')} on order</span><span><i className="dl-sw is-f" />{po('Late')} late</span></div>
          <ul className="dl-dates" style={{ marginTop: 10 }}>{nextPo.map(o => <li key={o.id}><small>{o.state}</small><b>{fmtDate(o.due)}</b><em title={o.item}>{o.item}</em></li>)}</ul>
        </> : <p className="vw-label">No purchase orders: the work needs no new equipment.</p>}
      </Panel>
      <Panel className="dl-span-4" title="Commissioning" icon={I.ClipboardCheck} sub={p.cxLevel ? `L${p.cxLevel} of 5 passed` : 'Not started'} actions={<button type="button" className="ent-link" onClick={() => onTab('commissioning')}>Tests →</button>}>
        <ol className="dl-cx">{v.tests.map(t => <li key={t.level} className={`is-${t.state.toLowerCase().replace(' ', '-')}`}><span className="dl-cx-l">L{t.level}</span><span className="cell-2"><b>{t.name}</b><small>{t.state} · {fmtDate(t.due)}{t.snags ? ` · ${t.snags} snags` : ''}</small></span></li>)}</ol>
      </Panel>
      <Panel className="dl-span-6" title="Cost" icon={I.TrendingUp} actions={<button type="button" className="ent-link" onClick={() => onTab('cost')}>Cost and change orders →</button>} info="Planned value against earned value and actual cost, with the budget and the forecast at completion.">
        <CostCurve pts={v.costCurve} height={200} bac={p.budgetApproved} eac={p.actual && p.earned ? p.budgetApproved / (p.earned / p.actual) : p.budgetApproved} />
      </Panel>
      <Panel className="dl-span-6 dl-h-fill" title="Top risks" icon={I.ShieldAlert} count={v.risks.filter(r => r.state !== 'Closed').length} actions={<button type="button" className="ent-link" onClick={() => onTab('risks')}>Register →</button>}>
        <RiskList risks={v.risks.filter(r => r.state !== 'Closed').sort((a, b) => b.likelihood * b.impact - a.likelihood * a.impact).slice(0, 5)} />
      </Panel>
    </div>
  );
}
