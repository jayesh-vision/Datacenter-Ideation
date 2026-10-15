/* Requirements block for migrations: decommission or consolidation, and the source site's whole inventory with what happens to
   each item. kW and racks are derived from it, never typed. */
import { useState } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip, Seg } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import { fmtKw } from '../../../../planner/lib/engine';
import { APPROACHES, APPROACH_TEXT, DISPOSITION_LABEL, MODE_LABEL, migrationOf, modeOf, toDispositions, type InvRow, type MigrationMode, type RecordType } from '../../../../planner/lib/migrationCore';
import type { StepProps } from '../../../../planner/lib/wizardModel';
import { Sub } from '../../parts';
import { SelectInput } from '../../common';
import { Hint, Quiet, Tbl, Tiles } from '../replace/shared';

const TYPES: { t: RecordType; label: string }[] = [{ t: 'device', label: 'Devices' }, { t: 'rack', label: 'Racks' }, { t: 'service', label: 'Services' }, { t: 'circuit', label: 'Circuits' }, { t: 'subnet', label: 'Subnets' }, { t: 'vlan', label: 'VLANs' }, { t: 'contract', label: 'Site contracts' }, { t: 'plant', label: 'Plant' }];

export function MigrationInventory({ draft, ev, patch, readOnly }: StepProps) {
  const [type, setType] = useState<RecordType>('device');
  const a = ev ? migrationOf(ev) : undefined;
  if (!draft.dataCenterId) return null;
  if (!a?.ready) return <div style={{ marginTop: 12 }}><Quiet>{a?.reason ?? 'Loading the site inventory…'}</Quiet></div>;
  const mode = modeOf(draft);
  const confirmed = (draft.dispositions ?? []).length > 0;
  const saveRows = (rows: InvRow[]) => { const u = rows.filter(r => r.recordType === 'device' && r.disposition === 'move').reduce((s, r) => s + r.u, 0); patch({ dispositions: toDispositions(rows), designPowerKw: Math.round(a.kwLeaving), params: { ...draft.params, racksToMove: u ? Math.ceil(u / 34) : 0, migrationMode: mode } }); };
  const setMode = (m: MigrationMode) => patch({ params: { ...draft.params, migrationMode: m }, peerDataCenterId: m === 'decommission' ? undefined : draft.peerDataCenterId, dispositions: [], waves: (draft.waves ?? []).filter(w => w.status !== 'Planned'), phases: [] });
  const setRow = (r: InvRow, d: T.PlannerDisposition) => saveRows(a.rows.map(x => (x.key === r.key ? { ...x, disposition: d } : x)));
  const setApproach = (svc: string, v: string) => patch({ params: { ...draft.params, [`approach:${svc}`]: v } });
  const shownType = a.rows.some(r => r.recordType === type) ? type : (TYPES.find(x => a.rows.some(r => r.recordType === x.t))?.t ?? 'device');
  const rows = a.rows.filter(r => r.recordType === shownType);
  const missingPermits = a.permits.filter(p => !p.onPlan);
  const addPermits = () => { const target = new Date(a.exitDate).getTime(); patch({ permits: [...draft.permits, ...missingPermits.map((p, i) => ({ id: `PM-M${draft.permits.length + i + 1}`, name: p.name, authority: p.authority, leadWeeks: p.leadWeeks, neededBefore: new Date(target - 14 * 864e5).toISOString(), status: 'Not started' as const }))] }); };
  const counts = TYPES.map(x => [x, a.rows.filter(r => r.recordType === x.t).length] as const).filter(([, n]) => n > 0);
  return (
    <div className="col" style={{ gap: 10, marginTop: 14 }}>
      <Sub>What happens to the site</Sub>
      <div>{readOnly ? <Chip tone="info">{MODE_LABEL[mode]}</Chip> : <Seg<MigrationMode> value={mode} onChange={setMode} options={[{ id: 'decommission', label: MODE_LABEL.decommission }, { id: 'consolidation', label: MODE_LABEL.consolidation }]} />}</div>
      <Hint>{mode === 'decommission' ? 'Everything at the site is retired, disposed of or handed back; services end here or are moved by their owners.' : `Live equipment and services move to ${a.target ? `${a.target.name} (${a.distanceKm} km)` : 'the target site picked above'}; the source site is then retired.`}</Hint>
      <Tiles items={[
        { label: 'Load leaving', value: fmtKw(a.kwLeaving), sub: 'measured on the live devices' },
        { label: 'Load moving', value: fmtKw(a.kwMoving), sub: mode === 'consolidation' ? `about ${a.racksMoving} racks (${a.uMoving} U)` : 'nothing moves' },
        { label: 'Items at the site', value: a.rows.length, sub: counts.map(([x, n]) => `${n} ${x.label.toLowerCase()}`).join(', ') },
        { label: 'Dispositions', value: confirmed ? 'Confirmed' : 'Proposed', tone: confirmed ? 'ok' : 'warn', sub: confirmed ? `${(draft.dispositions ?? []).length} saved` : 'confirm them below' },
      ]} />
      <Sub extra={!readOnly && <span className="row" style={{ gap: 8 }}>{!confirmed && <Btn size="sm" icon={I.Check} onClick={() => saveRows(a.rows)}>Confirm the inventory</Btn>}{missingPermits.length > 0 && <Btn size="sm" icon={I.Plus} onClick={addPermits}>Add {missingPermits.length} compliance step{missingPermits.length === 1 ? '' : 's'} to the permits</Btn>}</span>}>Inventory</Sub>
      <div><Seg<RecordType> size="sm" value={shownType} onChange={setType} options={counts.map(([x, n]) => ({ id: x.t, label: `${x.label} ${n}` }))} /></div>
      <Tbl maxHeight={380}>
        <thead><tr><th>Item</th><th>Detail</th>{shownType === 'device' && <th>Draw</th>}<th>What happens</th>{shownType === 'service' && <th>How it moves</th>}{shownType === 'service' && <th>Down</th>}</tr></thead>
        <tbody>{rows.map(r => { const sp = a.services.find(s => s.service.id === r.recordId); return (
          <tr key={r.key}>
            <td><span className="row" style={{ gap: 4, flexWrap: 'wrap' }}><span className="strong">{r.label}</span>{r.critical && <Chip tone="error" size="xs">Critical</Chip>}{r.dataBearing && <Chip tone="neutral" size="xs">Data</Chip>}</span></td>
            <td style={{ whiteSpace: 'normal' }}><span className="vw-label" style={{ fontSize: 12.5 }}>{r.detail}</span></td>
            {shownType === 'device' && <td className="num">{r.kw ? `${Math.round(r.kw * 1000)} W` : '—'}</td>}
            <td><span className="row" style={{ gap: 6 }}><SelectInput value={r.disposition} disabled={readOnly} style={{ width: 190 }} options={r.allowed.filter(d => mode === 'consolidation' || (d !== 'move' && d !== 're-terminate')).map(d => ({ id: d, label: DISPOSITION_LABEL[d] }))} onChange={v => setRow(r, v)} />{!r.fromPlan && <span className="vw-label" style={{ fontSize: 11.5 }}>proposed</span>}</span></td>
            {shownType === 'service' && <td>{sp && <SelectInput value={sp.approach} style={{ width: 190 }} disabled={readOnly || r.disposition === 'retire'} options={APPROACHES.filter(x => x !== 'Retire').map(x => ({ id: x, label: x }))} onChange={v => setApproach(r.recordId, v)} />}{sp && <div className="vw-label" style={{ fontSize: 11.5, maxWidth: 240, whiteSpace: 'normal' }}>{APPROACH_TEXT[sp.approach]}</div>}</td>}
            {shownType === 'service' && <td className="num" style={{ color: sp && sp.downtimeH > a.window ? 'var(--vw-color-red-600)' : undefined }}>{sp ? `${sp.downtimeH} h` : '—'}</td>}
          </tr>
        ); })}</tbody>
      </Tbl>
      {shownType === 'service' && <Hint>Downtime per approach from migration runbook actuals; lift and shift adds travel at 60 km/h. The cut-over window is {a.window} h.</Hint>}
    </div>
  );
}
