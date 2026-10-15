/* Editors shared by the wizard and the plan page: phases (simple), permits and risks. */
import * as I from 'lucide-react';
import { Btn, Chip } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import { defaultPermits, fromDateInput, phaseDerived, toDateInput } from '../../../planner/lib/wizardModel';
import type { Evaluation } from '../../../planner/lib/engine';
import { Sub, KvList } from '../parts';
import { NumInput, SelectInput, TextInput, kw, num } from '../common';
import '../../../styles/planning-scopes.css';

/* ------------------------------------------------------------------ editors shared with the plan page */
const PHASE_STATUS: T.PlannerPhase['status'][] = ['Planned', 'Approved', 'In delivery', 'Live'];
export function PhasesEditor({ draft, ev, onChange, readOnly, wave }: { draft: T.PlannerPlan; ev?: Evaluation; onChange: (p: T.PlannerPhase[]) => void; readOnly?: boolean; wave?: boolean }) {
  const phases = [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const total = phases.reduce((a, p) => a + p.itKw, 0);
  const upd = (id: string, p: Partial<T.PlannerPhase>) => onChange(draft.phases.map(x => (x.id === id ? { ...x, ...p, ...phaseDerived(p.itKw ?? x.itKw, ev) } : x)));
  const add = () => { const left = Math.max(0, draft.designPowerKw - total); onChange([...draft.phases, { id: `P${draft.phases.length + 1}-${Date.now().toString(36)}`, name: `${wave ? 'Wave' : 'Phase'} ${draft.phases.length + 1}`, goLive: draft.targetGoLive, itKw: left, status: 'Planned', ...phaseDerived(left, ev) }]); };
  const word = wave ? 'Waves' : 'Phases';
  return <>
    <Sub extra={<span className="row" style={{ gap: 8 }}><Chip tone={total === draft.designPowerKw ? 'success' : 'error'} dot>{kw(total)} of {kw(draft.designPowerKw)}</Chip>{!readOnly && <Btn size="sm" icon={I.Plus} onClick={add}>Add {wave ? 'a wave' : 'a phase'}</Btn>}</span>}>{word}</Sub>
    {phases.length ? <table className="nst-table pn-phases" style={{ width: '100%' }}><thead><tr><th>{wave ? 'Wave' : 'Phase'}</th><th>Go-live</th><th>IT kW</th><th>Racks</th><th>Halls</th><th>Status</th><th></th></tr></thead><tbody>
      {phases.map(p => <tr key={p.id}><td><TextInput value={p.name} disabled={readOnly} onChange={v => upd(p.id, { name: v })} /></td><td><TextInput type="date" value={toDateInput(p.goLive)} disabled={readOnly} onChange={v => upd(p.id, { goLive: fromDateInput(v, p.goLive) })} /></td><td><NumInput value={p.itKw} min={0} disabled={readOnly} onChange={v => v !== undefined && upd(p.id, { itKw: v })} /></td><td className="num">{num(p.racks)}</td><td className="num">{num(p.halls)}</td><td><SelectInput value={p.status} disabled={readOnly} options={PHASE_STATUS.map(s => ({ id: s, label: s }))} onChange={v => upd(p.id, { status: v })} /></td><td>{!readOnly && draft.phases.length > 1 && <Btn size="sm" variant="ghost" icon={I.Trash2} onClick={() => onChange(draft.phases.filter(x => x.id !== p.id))} />}</td></tr>)}
    </tbody></table> : <p className="vw-label">No {word.toLowerCase()} yet.</p>}
    <p className="vw-label" style={{ margin: '8px 0 0', fontSize: 12 }}>{word} must add up to the design power; racks and halls follow from the density and hall load of the plan.</p>
  </>;
}

const PERMIT_STATUS: T.PlannerPermit['status'][] = ['Not started', 'Applied', 'In review', 'Approved', 'Expired'];
export function PermitsEditor({ permits, target, onChange, readOnly, scope }: { permits: T.PlannerPermit[]; target: string; onChange: (p: T.PlannerPermit[]) => void; readOnly?: boolean; scope?: T.PlannerScope }) {
  const upd = (id: string, p: Partial<T.PlannerPermit>) => onChange(permits.map(x => (x.id === id ? { ...x, ...p } : x)));
  // The permits this plan type normally needs, dated against the go-live; those already listed (by name) are skipped.
  const have = new Set(permits.map(p => p.name.trim().toLowerCase()));
  const standard = scope ? defaultPermits(scope, target).filter(p => !have.has(p.name.toLowerCase())) : [];
  const stamp = Date.now().toString(36);
  return <>
    <Sub extra={!readOnly && <span className="row" style={{ gap: 6 }}>{standard.length > 0 && <Btn size="sm" icon={I.ListPlus} title={standard.map(p => p.name).join(', ')} onClick={() => onChange([...permits, ...standard.map((p, i) => ({ ...p, id: `PM-${stamp}-${i}` }))])}>Add {standard.length} standard permit{standard.length === 1 ? '' : 's'}</Btn>}<Btn size="sm" icon={I.Plus} onClick={() => onChange([...permits, { id: `PM-${stamp}`, name: '', authority: '', leadWeeks: 8, neededBefore: target, status: 'Not started' }])}>Add a permit</Btn></span>}>Permits and consents</Sub>
    {permits.length ? <table className="nst-table pn-phases pn-permits" style={{ width: '100%' }}><thead><tr><th>Permit</th><th>Authority</th><th>Lead time</th><th>Needed before</th><th>Status</th><th></th></tr></thead><tbody>
      {permits.map(p => <tr key={p.id}><td><TextInput value={p.name} placeholder="e.g. Building permit" disabled={readOnly} onChange={v => upd(p.id, { name: v })} /></td><td><TextInput value={p.authority} placeholder="Who grants it" disabled={readOnly} onChange={v => upd(p.id, { authority: v })} /></td><td><NumInput value={p.leadWeeks} min={0} unit="wk" disabled={readOnly} onChange={v => v !== undefined && upd(p.id, { leadWeeks: v })} /></td><td><TextInput type="date" value={toDateInput(p.neededBefore)} disabled={readOnly} onChange={v => upd(p.id, { neededBefore: fromDateInput(v, p.neededBefore) })} /></td><td><SelectInput value={p.status} disabled={readOnly} options={PERMIT_STATUS.map(s => ({ id: s, label: s }))} onChange={v => upd(p.id, { status: v })} /></td><td>{!readOnly && <Btn size="sm" variant="ghost" icon={I.Trash2} onClick={() => onChange(permits.filter(x => x.id !== p.id))} />}</td></tr>)}
    </tbody></table> : <p className="vw-label">No permits listed. A permit decided after the project it gates starts fails the compliance rule.</p>}
  </>;
}

const DOMAINS: T.PlannerRisk['domain'][] = ['Facility', 'Network', 'Supplier', 'Commissioning', 'Regulatory', 'Finance', 'Security'];
const LEVELS: ('Low' | 'Medium' | 'High')[] = ['Low', 'Medium', 'High'];
export function RisksEditor({ risks, owner, onChange, readOnly }: { risks: T.PlannerRisk[]; owner: string; onChange: (r: T.PlannerRisk[]) => void; readOnly?: boolean }) {
  const upd = (id: string, p: Partial<T.PlannerRisk>) => onChange(risks.map(x => (x.id === id ? { ...x, ...p } : x)));
  const tone = (r: T.PlannerRisk) => (r.impact === 'High' && r.probability !== 'Low' ? 'error' : r.impact === 'High' || r.probability === 'High' ? 'warning' : 'neutral');
  return <>
    <Sub extra={!readOnly && <Btn size="sm" icon={I.Plus} onClick={() => onChange([...risks, { id: `R${risks.length + 1}-${Date.now().toString(36)}`, title: '', domain: 'Facility', probability: 'Medium', impact: 'Medium', owner, mitigation: '', source: 'user' }])}>Add a risk</Btn>}>Risk register</Sub>
    {risks.length ? <table className="nst-table pn-phases pn-risks" style={{ width: '100%' }}><thead><tr><th>Risk</th><th>Area</th><th>Probability</th><th>Impact</th><th>Owner</th><th>Mitigation</th><th></th></tr></thead><tbody>
      {risks.map(r => <tr key={r.id}><td><span className="cell-2"><TextInput value={r.title} placeholder="What could go wrong" disabled={readOnly} onChange={v => upd(r.id, { title: v })} />{r.evidence && <small className="vw-label">{r.evidence}</small>}</span></td><td><SelectInput value={r.domain} disabled={readOnly} options={DOMAINS.map(d => ({ id: d, label: d }))} onChange={v => upd(r.id, { domain: v })} /></td><td><SelectInput value={r.probability} disabled={readOnly} options={LEVELS.map(l => ({ id: l, label: l }))} onChange={v => upd(r.id, { probability: v })} /></td><td><span className="row" style={{ gap: 6 }}><SelectInput value={r.impact} disabled={readOnly} options={LEVELS.map(l => ({ id: l, label: l }))} onChange={v => upd(r.id, { impact: v })} /><Chip tone={tone(r)} size="xs" dot>{tone(r) === 'error' ? 'Top' : tone(r) === 'warning' ? 'Watch' : 'Low'}</Chip></span></td><td><TextInput value={r.owner} disabled={readOnly} onChange={v => upd(r.id, { owner: v })} /></td><td><TextInput value={r.mitigation} placeholder="What is done about it" disabled={readOnly} onChange={v => upd(r.id, { mitigation: v })} /></td><td>{!readOnly && <Btn size="sm" variant="ghost" icon={I.Trash2} onClick={() => onChange(risks.filter(x => x.id !== r.id))} />}</td></tr>)}
    </tbody></table> : <p className="vw-label">No risks yet. High-impact risks need an owner and a mitigation before submission.</p>}
    {risks.length > 0 && <KvList items={[['Top risks', String(risks.filter(r => tone(r) === 'error').length)], ['Without an owner or mitigation', String(risks.filter(r => !r.owner || !r.mitigation).length)]]} />}
  </>;
}
