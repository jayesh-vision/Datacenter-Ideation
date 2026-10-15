/* Plan pack sections for the replace family: old-to-new list, wave schedule, cut-over runbook generated from the waves, ports and
   patching, consent and notification, closure checklist. */
import { Chip } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import { replaceOf, type ReplaceAnalysis } from '../../../../planner/lib/replaceAnalysis';
import { replaceCloseout } from '../../../../planner/lib/replaceClose';
import { byId, type PlannerData } from '../../../../planner/lib/plannerData';
import { swapMethodOf } from '../../../../planner/lib/replaceRack';
import { WAVE_STATUS_TONE } from '../../../../planner/lib/waves';
import type { PlanViewProps } from '../types';
import { ConsentRegister } from './Consents';
import { fmtWhen } from './model';
import { Checklist, Quiet, Tbl, inDelivery, waveScope } from './shared';

const name = (data: PlannerData, id?: string) => byId(data, 'devices', id)?.name ?? byId(data, 'racks', id)?.name ?? id ?? '—';
const Need = ({ a }: { a?: ReplaceAnalysis }) => <Quiet>{a?.reason ?? 'Nothing selected yet.'}</Quiet>;
const waveOf = (plan: T.PlannerPlan, id: string) => (plan.waves ?? []).find(w => w.deviceIds.includes(id) || w.rackIds.includes(id));
const sortedWaves = (plan: T.PlannerPlan) => [...(plan.waves ?? [])].sort((a, b) => a.order - b.order);

export function OldToNew({ plan, ev, data }: PlanViewProps) {
  const a = replaceOf(ev); if (!a?.ready) return <Need a={a} />;
  if (a.scope === 'rack-replace') return (
    <Tbl>
      <thead><tr><th>Old rack</th><th>Type</th><th>New rack</th><th>Method</th><th>New position</th><th>Devices</th><th>Wave</th></tr></thead>
      <tbody>{a.rackIds.map(id => { const r = byId(data, 'racks', id); const m = swapMethodOf(plan, id); const free = a.rack?.freePositions[id]?.[0]; return <tr key={id}><td><span className="strong">{r?.name ?? id}</span></td><td>{byId(data, 'rackTypes', r?.rackTypeId)?.model ?? '—'}</td><td>{a.rack?.newType?.model ?? '—'}</td><td>{m}</td><td>{m === 'Next free position in the row' ? free?.name ?? 'None free: in place' : 'Same position'}</td><td className="num">{a.old.filter(d => d.rackId === id).length}</td><td>{waveOf(plan, id)?.name ?? '—'}</td></tr>; })}</tbody>
    </Tbl>
  );
  if (!a.units.length) return <Quiet>Nothing selected yet.</Quiet>;
  return (
    <Tbl>
      <thead><tr><th>Old device</th><th>Serial</th><th>Rack · U</th><th>New unit</th><th>Goes to</th><th>Keeps</th><th>Old one</th><th>Wave</th></tr></thead>
      <tbody>{a.units.flatMap(u => u.oldIds.map((id, i) => { const d = byId(data, 'devices', id); const m = a.mapping.find(x => x.id === u.mapId); return (
        <tr key={id}><td><span className="mono">{d?.name ?? id}</span></td><td>{d?.serial ?? '—'}</td><td>{byId(data, 'racks', d?.rackId)?.name ?? '—'} · U{d?.position ?? '—'}</td><td>{i === 0 ? `${u.id} · ${u.model}` : <span className="vw-label">with {u.id}</span>}</td><td>{i === 0 ? `${byId(data, 'racks', u.rackId)?.name ?? 'No position'} · U${u.startU ?? '—'}` : ''}</td><td>{i === 0 ? [u.keepHostname, u.keepIp4, u.keepOob && `OOB ${u.keepOob}`].filter(Boolean).join(', ') || '—' : ''}</td><td>{m?.disposition ? m.disposition[0].toUpperCase() + m.disposition.slice(1) : '—'}</td><td>{waveOf(plan, id)?.name ?? '—'}</td></tr>
      ); }))}</tbody>
    </Tbl>
  );
}

export function WaveSchedule({ plan, data }: PlanViewProps) {
  const waves = sortedWaves(plan);
  if (!waves.length) return <Quiet>No waves yet.</Quiet>;
  return (
    <Tbl>
      <thead><tr><th>Wave</th><th>Window</th><th>Scope</th><th>Method</th><th>Change</th><th>Window record</th><th>Test</th><th>Status</th></tr></thead>
      <tbody>{waves.map(w => <tr key={w.id}><td><span className="strong">{w.name}</span></td><td>{fmtWhen(w.windowStart)}</td><td>{waveScope(w)}</td><td style={{ whiteSpace: 'normal', fontSize: 12.5 }}>{w.method ?? '—'}</td><td>{w.changeRequestId ? <span className="mono">{w.changeRequestId}</span> : '—'}</td><td>{w.maintenanceWindowId ?? '—'}</td><td>{w.atpId ? `${w.atpId} (${data.atps.find(x => x.id === w.atpId)?.status ?? '—'})` : '—'}</td><td><Chip tone={WAVE_STATUS_TONE[w.status]} size="xs" dot>{w.status}</Chip></td></tr>)}</tbody>
    </Tbl>
  );
}

/** One wave of a runbook: title, window and its steps. */
export function RunbookCard({ w, steps, foot }: { w: T.PlannerWave; steps: [string, string][]; foot?: string }) {
  return (
    <div className="pn-card" style={{ cursor: 'default', gap: 8 }}>
      <span className="row between" style={{ gap: 10, flexWrap: 'wrap' }}><b>{w.name}</b><span className="vw-label" style={{ fontSize: 12 }}>{fmtWhen(w.windowStart)} → {fmtWhen(w.windowEnd)}</span></span>
      <Tbl><tbody>{steps.map(([k, v]) => <tr key={k}><td style={{ width: 120, verticalAlign: 'top' }}><span className="strong">{k}</span></td><td style={{ whiteSpace: 'normal' }}>{v || '—'}</td></tr>)}</tbody></Tbl>
      {foot && <span className="vw-label" style={{ fontSize: 12 }}>{foot}</span>}
    </div>
  );
}

/** The cut-over runbook, step by step for each wave, generated from the waves themselves. */
export function Runbook({ plan, ev, data }: PlanViewProps) {
  const a = replaceOf(ev);
  const waves = sortedWaves(plan);
  if (!waves.length) return <Quiet>No waves yet.</Quiet>;
  const scope = plan.scope;
  return (<div className="col" style={{ gap: 12 }}>{waves.map(w => {
    const steps: [string, string][] = [
      ['T−7 days', `Change ${w.changeRequestId ?? '(raised at execution)'} approved by the change board; customers on the notification list told the window.`],
      ['T−2 days', scope === 'network-refresh' ? 'Configuration backup taken and the translated configuration loaded and compared in the lab.' : scope === 'server-refresh' ? 'New units staged, firmware and BIOS on the baseline, 24 h burn-in started.' : 'New racks and power strips delivered and inspected; free positions checked; labels printed.'],
      ['T−0, start', `Confirm with the service desk and the monitoring team; freeze other work on ${w.rackIds.map(r => name(data, r)).slice(0, 4).join(', ')}${w.rackIds.length > 4 ? '…' : ''}.`],
      ['Work', w.method ?? ''],
      ['Half time', 'Decision point: on track, or start the rollback so the window is not overrun.'],
      ['Acceptance', w.acceptance ?? ''],
      ['Rollback', w.rollback],
      ['After', scope === 'server-refresh' ? 'Old servers wiped, bagged and sealed for the disposal vendor (chain of custody); records updated by "Close wave".' : scope === 'network-refresh' ? `Old switches stay racked until the ${a?.soakDays ?? 7}-day soak ends; then removed, wiped and "Close wave".` : 'Old racks removed and recycled; rack elevation, feeds and reservations updated by "Close wave".'],
    ];
    return <RunbookCard key={w.id} w={w} steps={steps} foot={scope === 'rack-replace' ? `Racks: ${w.rackIds.map(r => name(data, r)).join(', ')}` : `Devices: ${w.deviceIds.map(d => name(data, d)).join(', ')}`} />;
  })}</div>);
}

export function PortsAndPatching({ plan, ev, data }: PlanViewProps) {
  const a = replaceOf(ev); if (!a?.ready) return <Need a={a} />;
  if (a.ports) {
    const waves = sortedWaves(plan);
    return (<div className="col" style={{ gap: 12 }}>
      {a.ports.farEnd.length > 0 && <p style={{ margin: 0, fontSize: 12.5 }}><b>Far-end changes:</b> {a.ports.farEnd.map(r => `${name(data, r.deviceId)} ${r.oldPort} → ${r.newPort} (${r.farDeviceId ? `${name(data, r.farDeviceId)} ${r.farPort ?? ''}` : 'spine port not recorded'})`).join(' · ')}</p>}
      {(waves.length ? waves : [undefined]).map(w => {
        const devs = a.ports!.devices.filter(d => !w || w.deviceIds.includes(d.deviceId));
        if (!devs.length) return null;
        return (<div key={w?.id ?? 'all'} className="col" style={{ gap: 6 }}><span className="strong">{w?.name ?? 'All switches'}</span>
          <Tbl>
            <thead><tr><th>Switch</th><th>Old port</th><th>New port</th><th>Speed</th><th>Far end</th><th>Optic</th></tr></thead>
            <tbody>{devs.flatMap(d => d.rows.map(r => <tr key={`${d.deviceId}${r.oldPort}`}><td className="mono">{name(data, d.deviceId)}</td><td className="mono">{r.oldPort} ({r.oldCls})</td><td className="mono">{r.newPort ?? 'None'} {r.newCls ? `(${r.newCls})` : ''}</td><td className="num">{(r.newSpeed ?? 0) / 1000}G</td><td>{r.farDeviceId ? `${name(data, r.farDeviceId)} ${r.farPort ?? ''}` : '—'}</td><td>{r.optic}</td></tr>))}</tbody>
          </Tbl></div>);
      })}
    </div>);
  }
  if (a.nic) return (<div className="col" style={{ gap: 8 }}><p style={{ margin: 0, fontSize: 12.5 }}>{a.nic.detail}</p>
    <Tbl><thead><tr><th>New unit</th><th>Rack · U</th><th>Primary</th><th>Out of band</th><th>Kept from</th></tr></thead>
      <tbody>{a.units.map(u => <tr key={u.id}><td>{u.id} · {u.model}</td><td>{name(data, u.rackId)} · U{u.startU ?? '—'}</td><td className="mono">{u.keepIp4 ?? '—'}</td><td className="mono">{u.keepOob ?? '—'}</td><td className="mono">{name(data, u.oldIds[0])}</td></tr>)}</tbody></Tbl></div>);
  const xc = a.rack?.xconnects ?? [];
  return (<Tbl><thead><tr><th>Cross-connect</th><th>Circuit</th><th>Device</th><th>Speed</th></tr></thead>
    <tbody>{xc.map(t => <tr key={t.termination.id}><td>{t.termination.xconnectId ?? '—'}</td><td>{t.circuit?.cid ?? t.termination.circuitId}</td><td className="mono">{name(data, t.termination.deviceId)}</td><td className="num">{(t.termination.portSpeedMbps ?? 0) / 1000}G</td></tr>)}{!xc.length && <tr><td colSpan={4} className="vw-label">No cross-connects end in the racks.</td></tr>}</tbody></Tbl>);
}

export function PeopleSection({ plan, ev }: PlanViewProps) {
  const a = replaceOf(ev); if (!a?.ready) return <Need a={a} />;
  if (a.rack) return <ConsentRegister rows={a.rack.consents} readOnly firstWave={c => { const ids = a.rack!.tenants.find(t => t.key === c.customerRef)?.rackIds ?? []; return (plan.waves ?? []).filter(w => w.rackIds.some(x => ids.includes(x))).map(w => w.windowStart).sort()[0]; }} />;
  return (<Tbl>
    <thead><tr><th>Customer</th><th>Account manager</th><th>Services</th><th>Waves</th></tr></thead>
    <tbody>{a.impact.customers.map(c => <tr key={c.customer.id}><td><span className="row" style={{ gap: 6 }}><span className="strong">{c.customer.name}</span>{c.customer.premium && <Chip tone="purple" size="xs">Premium</Chip>}</span></td><td>{c.customer.accountManager}</td><td style={{ whiteSpace: 'normal', fontSize: 12.5 }}>{c.services.map(s => `${s.name}${s.critical ? ' (critical)' : ''}`).join(', ')}</td><td style={{ whiteSpace: 'normal', fontSize: 12.5 }}>{(plan.waves ?? []).filter(w => c.services.some(s => w.serviceIds.includes(s.id))).map(w => `${w.name} ${fmtWhen(w.windowStart)}`).join('; ') || '—'}</td></tr>)}
      {!a.impact.customers.length && <tr><td colSpan={4} className="vw-label">No customer service runs on the selected equipment.</td></tr>}</tbody>
  </Tbl>);
}

export function ClosureChecklist({ plan, data }: PlanViewProps) {
  return <Checklist checks={replaceCloseout(plan, data)} atHandover={inDelivery(plan)} />;
}
