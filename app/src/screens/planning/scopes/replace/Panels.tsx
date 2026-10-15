/* Wizard result panels for server refresh, network refresh and rack replacement. They replace the generic plant, fabric, cooling
   and IT panels: the work happens inside racks that exist. */
import { useState } from 'react';
import { Chip } from '../../../../ui/kit';
import { fmtKw } from '../../../../planner/lib/engine';
import { replaceOf, type ReplaceAnalysis } from '../../../../planner/lib/replaceAnalysis';
import { byId } from '../../../../planner/lib/plannerData';
import { outageHours, SWAP_METHODS, SWAP_TEXT, type SwapMethod } from '../../../../planner/lib/replaceRack';
import type { StepProps } from '../../../../planner/lib/wizardModel';
import { Sub } from '../../parts';
import { SelectInput, date, money } from '../../common';
import { ReplacementPanel as ReplaceMapping } from '../../wizard/ReplacementPanel';
import { WavesEditor } from './WavesEditor';
import { ConsentRegister } from './Consents';
import { fmtWhen } from './model';
import { Hint, Issues, Quiet, Tbl, Tiles } from './shared';

const tone = (ok: boolean, warn?: boolean) => (ok ? (warn ? 'warning' : 'success') : 'error') as 'success' | 'warning' | 'error';

function useA(p: StepProps): ReplaceAnalysis | undefined { return p.ev ? replaceOf(p.ev) : undefined; }
function Wait({ a, goTo }: { a?: ReplaceAnalysis; goTo: StepProps['goTo'] }) {
  if (!a?.ready) return <Quiet>{a?.reason ?? 'Loading…'}</Quiet>;
  return <Quiet>Nothing selected yet. <button type="button" className="ent-link" onClick={() => goTo('requirements')}>Select what is being replaced</button>.</Quiet>;
}

/* ------------------------------------------------------------------ racks before and after */
function RackRows({ a }: { a: ReplaceAnalysis }) {
  return (
    <Tbl>
      <thead><tr><th>Rack</th><th>Out / in</th><th>kW before → after</th><th>Rating</th><th>U · kg</th><th>Check</th></tr></thead>
      <tbody>{a.rackRows.map(r => (
        <tr key={r.rack.id}>
          <td><span className="strong">{r.rack.name}</span></td><td className="num">{r.out.length} / {r.inn.length}</td>
          <td><span className="cell-2"><span className="num">{r.kwBefore} → <b>{r.kwAfter}</b></span><small>peak {r.kwPeakAfter}{r.inn.some(u => u.parallel) ? ` · side by side ${r.kwOverlap}` : ''}</small></span></td>
          <td><span className="cell-2"><span className="num">{r.rack.maxPowerKw} kW</span><small>{r.feedRatingKw ? `one feed (80%) ${r.feedRatingKw} kW${r.feedPctAfter !== undefined ? ` · ${r.feedPctAfter}%` : ''}` : 'no feeds'}</small></span></td>
          <td><span className="cell-2"><span className="num">{r.uBefore} → {r.uAfter} / {r.heightU} U</span><small>{r.kgBefore} → {r.kgAfter}{r.maxKg ? ` / ${r.maxKg}` : ''} kg</small></span></td>
          <td style={{ whiteSpace: 'normal', minWidth: 120 }}>{r.issues.length ? <Issues items={r.issues} warn={r.level !== 'bad'} /> : <Chip tone="success" size="xs">Fits</Chip>}</td>
        </tr>
      ))}</tbody>
    </Tbl>
  );
}

export function ReplacePowerPanel(p: StepProps) {
  const a = useA(p);
  if (!a?.ready || (!a.old.length && !a.rackIds.length)) return <Wait a={a} goTo={p.goTo} />;
  if (a.scope === 'rack-replace') {
    const o = a.rack?.outlets ?? [];
    return (<>
      <Tiles items={[
        { label: 'Racks', value: a.rackIds.length, sub: `${fmtKw(a.oldKw)} drawn by ${a.old.length} devices` },
        { label: 'Rating before → after', value: `${fmtKw(o.reduce((s, x) => s + x.ratingBeforeKw, 0))} → ${fmtKw(o.reduce((s, x) => s + x.ratingAfterKw, 0))}`, sub: 'lower of the strips and 80% of one feed' },
        { label: 'Over today', value: o.filter(x => x.drawKw > x.ratingBeforeKw).length, tone: o.some(x => x.drawKw > x.ratingAfterKw) ? 'bad' : 'ok', sub: `${o.filter(x => x.drawKw > x.ratingAfterKw).length} still over after` },
        { label: 'Outlets short', value: o.filter(x => !x.ok).length, tone: o.some(x => !x.ok) ? 'bad' : 'ok', sub: 'per side, C13 and C19' },
      ]} />
      <Sub>Power and outlets per rack</Sub>
      <Tbl>
        <thead><tr><th>Rack</th><th>Draw</th><th>Rating before → after</th><th>Outlets per side (need / have)</th><th>Feeds</th><th>Check</th></tr></thead>
        <tbody>{o.map(x => (
          <tr key={x.rackId}>
            <td><span className="strong">{byId(p.data, 'racks', x.rackId)?.name ?? x.rackId}</span></td><td className="num">{x.drawKw} kW</td><td className="num">{x.ratingBeforeKw} → <b>{x.ratingAfterKw}</b> kW</td>
            <td><span className="cell-2"><span className="num">C13 {x.perSideC13} / {x.haveC13}</span><small>C19 {x.perSideC19} / {x.haveC19}</small></span></td>
            <td style={{ fontSize: 12.5, whiteSpace: 'normal' }}>{x.feeds.map(f => `${f.name} ${f.voltage} V ${f.amperage} A`).join(', ') || 'None recorded'}</td>
            <td><Chip tone={tone(x.ok && x.drawKw <= x.ratingAfterKw)} size="xs">{!x.ok ? 'Outlets short' : x.drawKw > x.ratingAfterKw ? 'Over rating' : 'Fits'}</Chip></td>
          </tr>
        ))}</tbody>
      </Tbl>
      <Hint>Power ports are counted from each device's power-port records; big PSUs and power entry modules need C19. Strip outlets come from the strip datasheet (benchmark).</Hint>
    </>);
  }
  const over = a.rackRows.filter(r => r.level === 'bad');
  return (<>
    <Tiles items={[
      { label: 'Load today', value: fmtKw(a.oldKw), sub: 'measured on the selected devices' },
      { label: 'Load after', value: fmtKw(a.newKw), sub: `${fmtKw(a.peakKw)} at peak` },
      { label: 'Change', value: `${a.deltaKw > 0 ? '+' : ''}${a.deltaKw} kW`, tone: a.deltaKw > 0 ? 'warn' : 'ok' },
      { label: 'Racks over a limit', value: over.length, tone: over.length ? 'bad' : 'ok', sub: `of ${a.rackRows.length} racks touched` },
    ]} />
    <Sub>Each rack before and after the swap</Sub>
    <RackRows a={a} />
    {a.scope === 'network-refresh' && <Hint>The old switch stays powered beside the new one until the soak ends, so the side-by-side figure is checked against one feed too.</Hint>}
  </>);
}

export function ReplaceSpacePanel(p: StepProps) {
  const a = useA(p);
  if (!a?.ready || (!a.old.length && !a.rackIds.length)) return <Wait a={a} goTo={p.goTo} />;
  if (a.scope !== 'rack-replace') return (<>
    <Tiles items={[
      { label: 'Racks touched', value: a.rackRows.length },
      { label: 'New units placed', value: `${a.units.filter(u => u.placed).length} of ${a.units.length}`, tone: a.units.every(u => u.placed) ? 'ok' : 'bad' },
      { label: 'Moved to another rack', value: a.units.filter(u => u.placed && !u.oldIds.some(id => byId(p.data, 'devices', id)?.rackId === u.rackId)).length, sub: 'no room or power in the home rack' },
      { label: 'U freed', value: a.rackRows.reduce((s, r) => s + Math.max(0, r.uBefore - r.uAfter), 0), sub: 'released when each wave closes' },
    ]} />
    <Sub>Space and weight per rack</Sub>
    <RackRows a={a} />
  </>);
  const r = a.rack!;
  const setMethod = (rackId: string, m: SwapMethod) => p.patch({ params: { ...p.draft.params, [`swap:${rackId}`]: m } });
  return (<>
    <Tiles items={[
      { label: 'New rack', value: r.newType?.model ?? 'Not in catalogue', sub: r.newType ? `${r.newType.uHeight} U, ${r.newType.outerWidthMm} × ${r.newType.outerDepthMm} mm` : 'pick a catalogue rack', tone: r.newType ? undefined : 'bad' },
      { label: 'Recommended', value: r.recommend.type?.model ?? '—', sub: r.recommend.why, tone: r.recommend.type && r.recommend.type.id !== r.newType?.id ? 'warn' : undefined },
      { label: 'Fit problems', value: r.fit.filter(f => !f.ok).length, tone: r.fit.some(f => !f.ok) ? 'bad' : 'ok', sub: `${r.fit.filter(f => f.warnings.length).length} with warnings` },
      { label: 'Devices re-racked', value: a.old.filter(d => d.category !== 'PDU').length, sub: `${a.old.filter(d => d.category === 'PDU').length} old power strips replaced` },
    ]} />
    <Sub>Each rack: fit and swap method</Sub>
    <Tbl>
      <thead><tr><th>Rack</th><th>Swap method</th><th>Outage per device</th><th>Floor</th><th>Fit</th></tr></thead>
      <tbody>{a.rackIds.map(id => {
        const rk = byId(p.data, 'racks', id); const f = r.fit.find(x => x.rackId === id); const m = r.methods[id]; const n = a.old.filter(d => d.rackId === id && d.category !== 'PDU').length; const free = r.freePositions[id] ?? [];
        const opts = SWAP_METHODS.filter(x => x !== 'Next free position in the row' || free.length || m === x).map(x => ({ id: x, label: x === 'Next free position in the row' ? `${x} (${free.length} free)` : x }));
        return (
          <tr key={id}>
            <td><span className="cell-2"><span className="strong">{rk?.name ?? id}</span><small>{[byId(p.data, 'rows', rk?.rowId)?.name, rk?.owner, `${n} device${n === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</small></span></td>
            <td style={{ whiteSpace: 'normal' }}><span className="cell-2"><SelectInput value={m} disabled={p.readOnly} style={{ width: 220 }} options={opts} onChange={v => setMethod(id, v as SwapMethod)} /><small style={{ maxWidth: 260 }}>{SWAP_TEXT[m]}</small></span></td>
            <td className="num">{outageHours(m, n, a.rate)} h</td>
            <td className="num">{f ? `${f.floorKgSqm}${f.floorLimit ? ` / ${f.floorLimit}` : ''} kg/m²` : '—'}</td>
            <td style={{ whiteSpace: 'normal' }}>{f && <><Issues items={f.issues} /><Issues items={f.warnings} warn /></>}{f && f.ok && !f.warnings.length && <Chip tone="success" size="xs">Fits</Chip>}</td>
          </tr>
        );
      })}</tbody>
    </Tbl>
  </>);
}

/* ------------------------------------------------------------------ network and server ports */
export function ReplaceNetworkPanel(p: StepProps) {
  const a = useA(p); const [dev, setDev] = useState<string | undefined>();
  if (!a?.ready || !a.old.length) return <Wait a={a} goTo={p.goTo} />;
  if (a.scope === 'rack-replace') return <Quiet>Rack replacements keep the network as it is; cross-connects to re-patch are listed on the migration waves step.</Quiet>;
  if (a.scope === 'server-refresh') {
    const n = a.nic!;
    return (<>
      <Tiles items={[
        { label: 'Port fit', value: n.status === 'n/a' ? 'Not checked' : n.status === 'pass' ? 'Fits' : n.status === 'warn' ? 'Check' : 'Short', tone: n.status === 'fail' ? 'bad' : n.status === 'warn' ? 'warn' : n.status === 'pass' ? 'ok' : undefined, sub: `${n.leafIds.length} leaf switches serve these servers` },
        { label: 'Data ports freed', value: n.perClass.reduce((s, x) => s + x.freed, 0) },
        { label: 'Data ports needed', value: n.perClass.reduce((s, x) => s + x.needed, 0) },
        { label: 'Addresses kept', value: a.units.filter(u => u.keepIp4).length, sub: 'primary and OOB of the first old server per unit' },
      ]} />
      <Hint>{n.detail}</Hint>
      <Sub>Ports by type</Sub>
      <Tbl>
        <thead><tr><th>Port type</th><th>Freed by old servers</th><th>Needed by new servers</th><th>Free on the leaves</th></tr></thead>
        <tbody>{n.perClass.map(x => <tr key={x.cls}><td>{x.cls}</td><td className="num">{x.freed}</td><td className="num">{x.needed}</td><td className="num">{x.leafFree ?? '—'}</td></tr>)}</tbody>
      </Tbl>
    </>);
  }
  const pm = a.ports!; const d = pm.devices.find(x => x.deviceId === dev) ?? pm.devices[0];
  return (<>
    <ReplaceMapping {...p} />
    <Sub>Port map</Sub>
    <Tiles items={[
      { label: 'Used ports', value: pm.used, sub: pm.assumed ? `${pm.assumed} switches without cable or NMS records: every enabled port counted` : 'from cables and NMS interfaces', tone: pm.assumed ? 'warn' : undefined },
      { label: 'Without a match', value: pm.incompatible, tone: pm.incompatible ? 'bad' : 'ok' },
      { label: 'Far-end changes', value: pm.farEnd.length, sub: 'uplinks changing speed at the spine', tone: pm.farEnd.length ? 'warn' : undefined },
      { label: 'Optics', value: `${pm.optics.reduce((s, o) => s + o.reuse, 0)} reused · ${pm.optics.reduce((s, o) => s + o.buy, 0) + pm.farOptics.reduce((s, o) => s + o.buy, 0)} new`, sub: `${pm.dac.reduce((s, o) => s + o.reuse + o.buy, 0)} DAC kept apart` },
    ]} />
    <div style={{ marginTop: 10 }}><Tbl>
      <thead><tr><th>Optic class</th><th>Reused</th><th>New</th></tr></thead>
      <tbody>{pm.optics.map(o => <tr key={o.cls}><td>{o.cls}</td><td className="num">{o.reuse}</td><td className="num">{o.buy}</td></tr>)}{pm.farOptics.map(o => <tr key={`f${o.cls}`}><td>{o.cls} at the far end</td><td className="num">0</td><td className="num">{o.buy}</td></tr>)}</tbody>
    </Tbl></div>
    <Sub extra={<SelectInput value={d?.deviceId} style={{ width: 260 }} options={pm.devices.map(x => ({ id: x.deviceId, label: `${byId(p.data, 'devices', x.deviceId)?.name ?? x.deviceId}${x.incompatible.length ? ' · problems' : ''}` }))} onChange={setDev} />}>Patch list</Sub>
    {d && <Tbl>
      <thead><tr><th>Old port</th><th>Type</th><th>New port</th><th>Type · speed</th><th>Far end</th><th>Optic</th><th>Note</th></tr></thead>
      <tbody>{d.rows.map(r => <tr key={r.oldPort}><td className="mono">{r.oldPort}</td><td>{r.oldCls} {r.oldSpeed / 1000}G</td><td className="mono">{r.newPort ?? <span style={{ color: 'var(--vw-color-red-600)' }}>None</span>}</td><td>{r.newCls ? `${r.newCls} ${(r.newSpeed ?? 0) / 1000}G` : '—'}</td><td>{r.farDeviceId ? `${byId(p.data, 'devices', r.farDeviceId)?.name ?? r.farDeviceId} ${r.farPort ?? ''}` : '—'}</td><td>{r.optic}</td><td style={{ whiteSpace: 'normal', fontSize: 12.5 }}>{r.note}</td></tr>)}</tbody>
    </Tbl>}
    <Hint>New ports from {d?.source === 'templates' ? 'the DCIM component templates' : d?.source === 'datasheet' ? 'the vendor datasheet profile (no trusted DCIM templates for the model)' : 'nowhere: no profile'}; old ports from {d?.basis === 'cable' ? 'cable records' : d?.basis === 'nms' ? 'NMS interfaces that are up' : 'every enabled interface (no cable or interface records)'}.</Hint>
  </>);
}

/* ------------------------------------------------------------------ IT: mapping, impact and business case */
export function ReplaceItPanel(p: StepProps) {
  const a = useA(p);
  if (!a?.ready || !a.old.length) return <Wait a={a} goTo={p.goTo} />;
  const b = a.business; const est = p.ev!.estimate;
  return (<>
    {a.scope !== 'rack-replace' && <ReplaceMapping {...p} />}
    <Sub>Who is affected</Sub>
    <Tiles items={[
      { label: 'Services', value: a.impact.services.length, sub: `${a.impact.critical} critical`, tone: a.impact.critical ? 'warn' : undefined },
      { label: 'Customers', value: a.impact.customers.length, sub: `${a.impact.customers.filter(c => c.customer.premium).length} premium` },
      { label: 'Revenue on the kit', value: money(a.impact.revenueMonthly), sub: 'a month' },
      { label: 'Tightest SLA', value: a.impact.minSla ? `${a.impact.minSla}%` : '—', sub: a.critical.services.length ? 'critical: parallel run needed' : undefined },
    ]} />
    <Sub>Business case</Sub>
    <Tbl><tbody>
      <tr><td>One-off cost</td><td className="num"><b>{money(est.capexTotal)}</b></td><td style={{ whiteSpace: 'normal', fontSize: 12.5 }}>bill of materials plus {money(est.contingencyUsd ?? 0)} contingency{b.resaleCredit ? `, less ${money(b.resaleCredit)} resale` : ''}</td></tr>
      {b.benefitLines.map(l => <tr key={l.item}><td>{l.item}</td><td className="num" style={{ color: l.amount < 0 ? 'var(--vw-color-red-600)' : undefined }}>{money(l.amount)} a year</td><td style={{ whiteSpace: 'normal', fontSize: 12.5 }}>{l.basis}</td></tr>)}
      <tr><td>Payback</td><td className="num"><b>{est.paybackMonths == null ? '—' : `${est.paybackMonths} months`}</b></td><td style={{ whiteSpace: 'normal', fontSize: 12.5 }}>{est.paybackBasis}</td></tr>
    </tbody></Tbl>
    {b.notes.map(n => <Hint key={n}>{n}</Hint>)}
  </>);
}

/* ------------------------------------------------------------------ delivery: what each wave needs and when */
export function ReplaceDeliveryPanel(p: StepProps) {
  const a = useA(p);
  if (!a?.ready || (!a.old.length && !a.rackIds.length)) return <Wait a={a} goTo={p.goTo} />;
  if (!a.needs.length) return <Quiet>Make the waves on the migration waves step; each wave's equipment is then dated here.</Quiet>;
  return (<>
    <Tiles items={a.supply.map(s => ({ label: s.model, value: `${s.stock} stock · ${s.procure} buy`, sub: s.procure ? `${s.leadWeeks} weeks to buy (${s.leadItem})` : 'all from stock: transfer time only' }))} />
    <Sub>Per wave</Sub>
    <Tbl>
      <thead><tr><th>Wave</th><th>Equipment</th><th>Qty</th><th>Source</th><th>Order by</th><th>On site by</th><th>Needed by</th><th /></tr></thead>
      <tbody>{a.needs.map((n, i) => <tr key={i}><td>{n.waveName}</td><td>{n.model}</td><td className="num">{n.qty}</td><td style={{ fontSize: 12.5, whiteSpace: 'normal' }}>{n.note}</td><td>{date(n.orderBy)}</td><td>{date(n.arrives)}</td><td>{date(n.needBy)}</td><td><Chip tone={n.late ? 'error' : 'success'} size="xs" dot>{n.late ? 'Late' : 'In time'}</Chip></td></tr>)}</tbody>
    </Tbl>
    <Hint>Needed by is the window less the staging and burn-in time. Stock needs only its transfer; purchases take the benchmark lead time.</Hint>
  </>);
}

/* ------------------------------------------------------------------ waves */
export function ReplaceWavesPanel(p: StepProps) {
  const a = useA(p);
  if (!a?.ready || (!a.old.length && !a.rackIds.length)) return <Wait a={a} goTo={p.goTo} />;
  const r = a.rack;
  const waves = p.draft.waves ?? [];
  return (<>
    <WavesEditor {...p} family="replace" />
    {r && (<>
      <Sub>Tenant consent</Sub>
      <ConsentRegister rows={r.consents} readOnly={p.readOnly} onChange={rows => p.patch({ consents: rows })} firstWave={c => { const ids = r.tenants.find(t => t.key === c.customerRef)?.rackIds ?? []; return waves.filter(w => w.rackIds.some(x => ids.includes(x))).map(w => w.windowStart).sort()[0]; }} />
      {r.xconnects.length > 0 && <><Sub>Cross-connects to re-patch</Sub><p style={{ margin: 0, fontSize: 12.5 }}>{r.xconnects.map(t => `${t.termination.xconnectId ?? '—'} (${t.circuit?.cid ?? t.termination.circuitId}, ${byId(p.data, 'devices', t.termination.deviceId)?.name ?? t.termination.deviceId})`).join(' · ')}</p></>}
      {r.reservations.length > 0 && <Hint>Rack reservations carried to the new racks: {r.reservations.map(x => `${byId(p.data, 'racks', x.rackId)?.name ?? x.rackId} U${x.units[0]}–${x.units[x.units.length - 1]} for ${x.tenant ?? x.reservedBy}`).join(' · ')}</Hint>}
    </>)}
    {!r && a.impact.customers.length > 0 && (<>
      <Sub>Customers to notify</Sub>
      <Tbl>
        <thead><tr><th>Customer</th><th>Account manager</th><th>Services</th><th>First wave</th></tr></thead>
        <tbody>{a.impact.customers.map(c => { const fw = waves.filter(w => c.services.some(s => w.serviceIds.includes(s.id))).sort((x, y) => x.windowStart.localeCompare(y.windowStart))[0]; return <tr key={c.customer.id}><td><span className="row" style={{ gap: 6 }}><span className="strong">{c.customer.name}</span>{c.customer.premium && <Chip tone="purple" size="xs">Premium</Chip>}</span></td><td>{c.customer.accountManager}</td><td className="num">{c.services.length}{c.critical ? ` (${c.critical} critical)` : ''}</td><td>{fw ? `${fw.name} · ${fmtWhen(fw.windowStart)}` : '—'}</td></tr>; })}</tbody>
      </Tbl>
    </>)}
  </>);
}
