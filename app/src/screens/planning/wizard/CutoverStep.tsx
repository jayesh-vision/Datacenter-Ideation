/* Generic cut-over waves for plan types without their own wave editor: each wave is a phase (what moves, when, how much, how).
   Replacements, migrations and liquid retrofits use their family's wave editor. Ported from P2B's CutoverStep. */
import * as I from 'lucide-react';
import { Btn, Chip } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import { fromDateInput, phaseDerived, toDateInput, type StepProps } from '../../../planner/lib/wizardModel';
import { NumInput, SelectInput, TextInput, kw, num } from '../common';
import { Sub } from '../parts';
import { Tbl, Tiles } from './panelKit';

const WAVE_KINDS = ['Lift and shift', 'Re-platform', 'Replicate and swing', 'Decommission in place'];
const STATUS: T.PlannerPhase['status'][] = ['Planned', 'Approved', 'In delivery', 'Live'];
const RULES = ['Rehearsed cut-over per wave', 'Rollback tested before the window', 'Change freeze during the window', 'Source racks powered down only after validation', 'Data disposal certified before release'];

export function CutoverPanel({ draft, patch, ev, estate, setParam, readOnly }: StepProps) {
  const source = estate.dataCenters.find(d => d.id === draft.dataCenterId);
  const racksAtSource = source ? estate.racks.filter(r => r.dataCenterId === source.id) : [];
  const drawn = racksAtSource.reduce((a, r) => a + (r.currentPowerKw ?? 0), 0);
  const total = draft.phases.reduce((a, p) => a + p.itKw, 0);
  const remainder = draft.designPowerKw - total;
  const sorted = [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const kindOf = (p: T.PlannerPhase) => String(draft.params[`wave:${p.id}`] ?? WAVE_KINDS[0]);
  const update = (id: string, p: Partial<T.PlannerPhase>) => patch({ phases: draft.phases.map(x => (x.id === id ? { ...x, ...p, ...(p.itKw !== undefined ? phaseDerived(p.itKw, ev) : {}) } : x)) });
  const add = () => {
    const last = sorted[sorted.length - 1];
    const goLive = last ? new Date(new Date(last.goLive).getTime() + 90 * 864e5).toISOString() : draft.targetGoLive;
    const itKw = Math.max(0, remainder);
    patch({ phases: [...draft.phases, { id: `W-${Date.now().toString(36)}`, name: `Wave ${draft.phases.length + 1}`, goLive, itKw, ...phaseDerived(itKw, ev), status: 'Planned' }] });
  };
  return (<>
    <Tiles items={[
      { label: 'Source site', value: source?.name ?? 'Not selected', sub: source ? `${num(racksAtSource.length)} racks, ${kw(drawn)} drawn` : 'Pick the source site in Requirements', tone: source ? undefined : 'bad' },
      { label: 'Load to move', value: kw(draft.designPowerKw), sub: source && drawn ? `${Math.round((draft.designPowerKw / drawn) * 100)}% of what is drawn today` : undefined },
      { label: 'Phased in waves', value: kw(total), tone: remainder === 0 ? 'ok' : 'warn', sub: remainder === 0 ? 'All load assigned to a wave' : remainder > 0 ? `${kw(remainder)} unassigned` : `${kw(-remainder)} over` },
      { label: 'Freed at source', value: source ? kw(Math.min(drawn, total)) : '—', sub: source ? `${kw(Math.max(0, source.designPowerKw - drawn + Math.min(drawn, total)))} free after the last wave` : undefined },
    ]} />
    <Sub extra={!readOnly && <Btn size="sm" icon={I.Plus} onClick={add}>Add a wave</Btn>}>Waves</Sub>
    <Tbl head={['Wave', 'Approach', 'Cut-over window', 'IT kW moved', 'Racks', 'Status', '']} empty="No waves yet. Add the first wave to start the cut-over plan.">
      {sorted.map(p => (
        <tr key={p.id}>
          <td style={{ minWidth: 150 }}><TextInput value={p.name} disabled={readOnly} onChange={v => update(p.id, { name: v })} /></td>
          <td style={{ minWidth: 170 }}><SelectInput value={kindOf(p)} disabled={readOnly} options={WAVE_KINDS.map(k => ({ id: k, label: k }))} onChange={v => setParam(`wave:${p.id}`, v, 'user')} /></td>
          <td style={{ minWidth: 140 }}><TextInput type="date" value={toDateInput(p.goLive)} disabled={readOnly} onChange={v => update(p.id, { goLive: fromDateInput(v, p.goLive) })} /></td>
          <td style={{ minWidth: 110 }}><NumInput value={p.itKw} min={0} step={10} disabled={readOnly} onChange={v => v !== undefined && update(p.id, { itKw: v })} /></td>
          <td className="num">{num(p.racks)}</td>
          <td style={{ minWidth: 120 }}><SelectInput value={p.status} disabled={readOnly} options={STATUS.map(s => ({ id: s, label: s }))} onChange={v => update(p.id, { status: v })} /></td>
          <td>{!readOnly && <Btn size="sm" variant="ghost" icon={I.Trash2} title="Remove the wave" onClick={() => patch({ phases: draft.phases.filter(x => x.id !== p.id) })} />}</td>
        </tr>
      ))}
    </Tbl>
    <Sub>Rules of the road</Sub>
    <div className="pn-row">{RULES.map(r => <Chip key={r} tone="neutral">{r}</Chip>)}</div>
  </>);
}
