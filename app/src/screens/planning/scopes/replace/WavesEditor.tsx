/* Wave editor for replacements and migrations: make waves from the selection, then adjust each wave's date, method, rollback and
   acceptance. Every wave shows what it touches (services, customers, critical SLAs, revenue) and chips for clashes, pairs and
   overloaded windows. */
import { Fragment, useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import { nextFreeWindow } from '../../../../planner/lib/impact';
import { byId } from '../../../../planner/lib/plannerData';
import { phasesFromWaves, waveImpact, WAVE_STATUS_TONE, type WaveCheck } from '../../../../planner/lib/waves';
import { replaceOf } from '../../../../planner/lib/replaceAnalysis';
import { proposeReplaceWaves, replacePatch } from '../../../../planner/lib/replaceWaves';
import { migrationOf, proposeMigrationWaves, migrationPatch, APPROACHES } from '../../../../planner/lib/migrationCore';
import { PARALLEL } from '../../../../planner/lib/replaceText';
import type { StepProps } from '../../../../planner/lib/wizardModel';
import { clockMs } from '../../../../planner/compat/clock';
import { Sub } from '../../parts';
import { SelectInput, TextArea, TextInput, money } from '../../common';
import { Hint, Quiet, Tbl, Tiles, plural } from './shared';
import { fmtWhen, fromLocalInput, toLocalInput } from './model';

const SERVER_METHODS = ['Rolling, rack by rack', PARALLEL, 'Single window'];

export function WavesEditor(props: StepProps & { family: 'replace' | 'migration' }) {
  const { draft, ev, patch, data, family, readOnly } = props;
  const [open, setOpen] = useState<string | undefined>();
  const [now] = useState(() => clockMs());
  const ra = family === 'replace' && ev ? replaceOf(ev) : undefined;
  const ma = family === 'migration' && ev ? migrationOf(ev) : undefined;
  const ready = ra?.ready || ma?.ready;
  const check: WaveCheck | undefined = ra?.waveCheck ?? ma?.waveCheck;
  const waves = useMemo(() => [...(draft.waves ?? [])].sort((a, b) => a.order - b.order), [draft.waves]);
  const network = draft.scope === 'network-refresh';
  const impacts = useMemo(() => new Map(waves.map(w => [w.id, waveImpact(data, w, network)])), [waves, data, network]);
  if (!ready || !ev) return <Quiet>{ra?.reason ?? ma?.reason ?? 'Loading…'}</Quiet>;
  const hours = ra?.windowHours ?? ma?.window ?? 6; const rate = ra?.rate ?? ma?.rate ?? 4;
  const kwTotal = Math.round(ra ? ra.newKw : ma!.kwLeaving);
  const set = (next: T.PlannerWave[]) => patch({ waves: next, phases: phasesFromWaves(next, kwTotal), targetGoLive: next.length ? [...next].sort((a, b) => b.windowEnd.localeCompare(a.windowEnd))[0].windowEnd : draft.targetGoLive });
  const edit = (id: string, p: Partial<T.PlannerWave>) => set(waves.map(w => (w.id === id ? { ...w, ...p } : w)));
  const make = () => {
    if (ra) patch(replacePatch(draft, ra, proposeReplaceWaves(ev.ctx, ra, now)));
    else if (ma) patch(migrationPatch(draft, ma, proposeMigrationWaves(ev.ctx, ma, now)));
  };
  const nextFree = (w: T.PlannerWave) => {
    const win = nextFreeWindow(data, { dataCenterId: draft.dataCenterId, deviceIds: w.deviceIds, rackIds: w.rackIds, hours, after: new Date(Math.max(now, new Date(w.windowStart).getTime())).toISOString(), excludePlanId: draft.id, taken: waves.filter(x => x.id !== w.id).map(x => ({ start: x.windowStart, end: x.windowEnd })) });
    if (win.start) edit(w.id, { windowStart: win.start, windowEnd: win.end });
  };
  const global = (check?.issues ?? []).filter(i => !i.waveId);
  const blocking = (check?.issues ?? []).filter(i => i.level === 'bad').length;
  const pairs = ra?.pairs.length ?? ma?.pairs.length ?? 0;
  const items = family === 'replace' ? (draft.scope === 'rack-replace' ? `${ra!.rackIds.length} racks` : `${ra!.old.length} devices`) : `${ma!.rows.filter(r => r.recordType === 'device' && (r.disposition === 'move' || r.kw > 0)).length} devices, ${ma!.services.length} services`;
  const consentOf = (w: T.PlannerWave) => ma?.consents.filter(c => c.serviceIds.some(s => w.serviceIds.includes(s))) ?? [];
  const clashLabel = (i: NonNullable<WaveCheck['issues']>[number]) => (i.kind === 'clash' ? (i.clash?.kind === 'window' ? `Window ${i.clash.id}` : `Change ${i.clash?.id ?? ''}`) : i.kind === 'upstream' ? 'Upstream work' : i.kind[0].toUpperCase() + i.kind.slice(1));
  return (<>
    <Tiles items={[
      { label: 'Waves', value: waves.length, sub: `for ${items}` },
      { label: 'One window', value: `${hours} h`, sub: `${rate} per hour · ${Math.round(rate * hours * 10) / 10} units of work` },
      { label: 'Redundant pairs', value: pairs, sub: pairs ? (network ? 'side A first, soak, then side B' : 'never in the same wave') : 'none found' },
      { label: 'Problems', value: blocking, tone: blocking ? 'bad' : waves.length ? 'ok' : undefined, sub: blocking ? 'see the red chips' : waves.length ? 'no clash, pair or capacity problem' : 'make the waves first' },
    ]} />
    <Sub extra={!readOnly && <Btn size="sm" icon={I.Wand2} onClick={make} title="Groups the selection by rack and service, splits redundant pairs, sizes each wave to the crew and the window, and dates it on the next clash-free change night. Waves already scheduled or closed are kept.">{waves.length ? 'Remake waves' : 'Make waves'}</Btn>}>Waves</Sub>
    {global.map((g, i) => <p key={i} className={`note ${g.level === 'bad' ? 'note--bad' : 'note--warn'}`} style={{ margin: '0 0 8px' }}><I.TriangleAlert size={15} /><span>{g.text}</span></p>)}
    <Tbl>
      <thead><tr><th>Wave and window (UTC)</th><th>What, how and who</th><th>Checks</th><th /></tr></thead>
      <tbody>
        {waves.map(w => {
          const imp = impacts.get(w.id); const iss = check?.byWave.get(w.id) ?? []; const editable = w.status === 'Planned' && !readOnly;
          const missing = consentOf(w).filter(c => !c.okForWave);
          const groups = [...iss.reduce((m, i) => { const k = `${i.level}|${clashLabel(i)}`; const g = m.get(k) ?? { level: i.level, label: clashLabel(i), texts: [] as string[] }; g.texts.push(i.text); return m.set(k, g); }, new Map<string, { level: string; label: string; texts: string[] }>()).values()];
          return (<Fragment key={w.id}>
            <tr>
              <td><span className="cell-2" style={{ gap: 4 }}><TextInput value={w.name} disabled={!editable} style={{ width: 196 }} onChange={v => edit(w.id, { name: v })} />
                <TextInput type="datetime-local" disabled={!editable} value={toLocalInput(w.windowStart)} style={{ width: 196 }} onChange={v => { if (!v) return; const x = fromLocalInput(v, hours); edit(w.id, { windowStart: x.start, windowEnd: x.end }); }} />
                <span className="row" style={{ gap: 4 }}><Chip tone={WAVE_STATUS_TONE[w.status]} size="xs" dot>{w.status}</Chip>{w.kind === 'pilot' && <Chip tone="info" size="xs">Pilot</Chip>}{w.side && <Chip tone="neutral" size="xs">Side {w.side}</Chip>}</span></span></td>
              <td style={{ whiteSpace: 'normal', minWidth: 190, fontSize: 12.5 }}><span className="cell-2" style={{ gap: 4 }}><span className="strong">{draft.scope === 'rack-replace' ? `${plural(w.rackIds.length, 'rack')}, ${plural(w.deviceIds.length, 'device')}` : `${plural(w.deviceIds.length, 'device')}${w.serviceIds.length ? `, ${plural(w.serviceIds.length, 'service')}` : ''}`}</span>
                {draft.scope === 'server-refresh' && editable ? <SelectInput value={w.method} style={{ width: 196 }} options={SERVER_METHODS.map(m => ({ id: m, label: m }))} onChange={v => edit(w.id, { method: v })} /> : <span>{w.method ?? '—'}</span>}
                {imp && imp.services.length ? <><span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{plural(imp.services.length, 'service')} · {plural(imp.customers.length, 'customer')}{imp.critical ? <Chip tone="error" size="xs">{imp.critical} critical</Chip> : null}</span><small>{money(imp.revenueMonthly)} a month at risk{imp.minSla ? ` · SLA ${imp.minSla}%` : ''}</small></> : <small>No customer service</small>}</span></td>
              <td style={{ whiteSpace: 'normal', minWidth: 140 }}><span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                {groups.map(g => <Chip key={`${g.level}${g.label}`} tone={g.level === 'bad' ? 'error' : 'warning'} size="xs" title={g.texts.slice(0, 6).join(' · ') + (g.texts.length > 6 ? ` · and ${g.texts.length - 6} more` : '')}>{g.label}{g.texts.length > 1 ? ` ×${g.texts.length}` : ''}</Chip>)}
                {missing.length > 0 && <Chip tone="error" size="xs" title={missing.map(c => `${c.customerName}: ${c.status}`).join(', ')}>Consent ×{missing.length}</Chip>}
                {!iss.length && !missing.length && <Chip tone="success" size="xs">Clear</Chip>}
                {iss.some(i => i.kind === 'clash' || i.kind === 'upstream') && editable && <button type="button" className="ent-link" style={{ fontSize: 12 }} onClick={() => nextFree(w)}>Next free night</button>}
              </span></td>
              <td><span className="row" style={{ gap: 4 }}>
                <Btn size="xs" variant="ghost" icon={open === w.id ? I.ChevronUp : I.ChevronDown} title={open === w.id ? 'Less' : 'Rollback, acceptance, checks and what is in the wave'} onClick={() => setOpen(open === w.id ? undefined : w.id)} />
                {editable && <Btn size="xs" variant="ghost" icon={I.Trash2} title="Remove wave" onClick={() => set(waves.filter(x => x.id !== w.id))} />}
              </span></td>
            </tr>
            {open === w.id && <tr><td colSpan={4} style={{ whiteSpace: 'normal', background: 'var(--vw-color-slate-50)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="col" style={{ gap: 4 }}><span className="vw-label" style={{ fontSize: 12 }}>Rollback</span><TextArea rows={2} disabled={!editable} value={w.rollback} onChange={v => edit(w.id, { rollback: v })} /></label>
                <label className="col" style={{ gap: 4 }}><span className="vw-label" style={{ fontSize: 12 }}>Acceptance</span><TextArea rows={2} disabled={!editable} value={w.acceptance ?? ''} onChange={v => edit(w.id, { acceptance: v })} /></label>
              </div>
              <div style={{ fontSize: 12.5, marginTop: 8 }}><b>{fmtWhen(w.windowStart)}</b> · {draft.scope === 'rack-replace' ? `Racks: ${w.rackIds.map(r => byId(data, 'racks', r)?.name ?? r).join(', ')}` : `Devices: ${w.deviceIds.slice(0, 30).map(d => byId(data, 'devices', d)?.name ?? d).join(', ')}${w.deviceIds.length > 30 ? '…' : ''}`}</div>
              {iss.length > 0 && <div style={{ fontSize: 12.5, marginTop: 4 }}><b>Checks:</b> {iss.slice(0, 8).map(i => i.text).join(' · ')}{iss.length > 8 ? ` · and ${iss.length - 8} more` : ''}</div>}
              {imp && imp.customers.length > 0 && <div style={{ fontSize: 12.5, marginTop: 4 }}>Customers: {imp.customers.map(c => `${c.customer.name} (${c.customer.accountManager})`).join(', ')}</div>}
              {family === 'migration' && w.serviceIds.length > 0 && <div style={{ fontSize: 12.5, marginTop: 4 }}>Services: {w.serviceIds.map(s => { const sp = ma!.services.find(x => x.service.id === s); return sp ? `${sp.service.name} (${sp.approach}, ${sp.downtimeH} h)` : s; }).join(', ')}</div>}
            </td></tr>}
          </Fragment>);
        })}
        {!waves.length && <tr><td colSpan={4} className="vw-label">No waves yet. Make them from the selection; you can then change dates, methods, rollback and acceptance.</td></tr>}
      </tbody>
    </Tbl>
    {family === 'migration' && <Hint>How each service moves is set on the Requirements step (inventory). Options: {APPROACHES.join(', ')}.</Hint>}
  </>);
}
