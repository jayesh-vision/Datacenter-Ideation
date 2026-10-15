/* Network uplift wizard panels and plan views: both ends and the circuits between them today (keep, upgrade or cease), the demand and
   the services riding it, the interconnect paths with end-port pickers, survivability and diversity, the point-to-point addresses,
   the fabric uplift inside one site, and the dated cut-over schedule. */
import * as I from 'lucide-react';
import { Btn, Chip, Field, Seg } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import { DISPOSITION_OF, LINK_TYPES, NETWORK_KINDS, freePorts, networkKindOf, type ExistingCircuit, type NetworkAnalysis } from '../../../../planner/lib/networkModel';
import { networkOf } from '../../../../planner/lib/scopes/network';
import { climateFromHint, fromDateInput, toDateInput, type StepProps } from '../../../../planner/lib/wizardModel';
import type { Evaluation } from '../../../../planner/lib/engine';
import type { PlanViewProps } from '../types';
import { NumInput, SelectInput, TextInput, date, money, num } from '../../common';
import { Sub } from '../../parts';
import { Note, Pair, ParamGrid, Tbl, Tiles } from '../../wizard/panelKit';
import { DciPaths } from './drawings';
import '../../../../styles/planning-scopes.css';

const gb = (g: number) => (g >= 1000 ? `${Math.round(g / 100) / 10} Tbps` : `${Math.round(g * 10) / 10} Gbps`);
const ACTION_LABEL = { keep: 'Keep', upgrade: 'Upgrade', cease: 'Cease', undecided: 'Not decided' } as const;
const ENCRYPTION: NonNullable<T.PlannerNetworkPath['encryption']>[] = ['MACsec', 'Optical (OTNsec)', 'IPsec', 'None'];
const nextId = (ids: string[]) => { let n = ids.length + 1; while (ids.includes(`PATH-${n}`)) n++; return `PATH-${n}`; };

/** Requirements: DCI between two sites or a fabric uplift inside one; the ends and the circuits between them. */
export function NetworkSitePicker(props: StepProps) {
  const { draft, patch, data, ev, readOnly } = props;
  const an = networkOf(ev); const kind = networkKindOf(draft);
  const sites = data.dataCenters.filter(d => d.status !== 'Retired').sort((a, b) => a.code.localeCompare(b.code));
  const opts = sites.map(d => ({ id: d.id, label: `${d.code} · ${d.name}` }));
  const pickA = (id: string) => { const dc = data.dataCenters.find(d => d.id === id); const campus = data.campuses.find(c => c.id === dc?.campusId); patch({ dataCenterId: id, campusId: dc?.campusId, regionId: campus?.regionId ?? draft.regionId, dcTypeKey: dc?.dcTypeKey ?? draft.dcTypeKey, climate: climateFromHint(campus?.city) ?? draft.climate, newSiteName: undefined }); };
  const setKind = (v: string) => { if (!readOnly) patch({ params: { ...draft.params, networkKind: v }, paramSources: { ...draft.paramSources, networkKind: 'user' }, peerDataCenterId: v.startsWith('Fabric') ? undefined : draft.peerDataCenterId }); };
  return (
    <div className="pn-col">
      <div><Seg<string> size="sm" value={String(draft.params.networkKind ?? NETWORK_KINDS[0])} options={NETWORK_KINDS.map(k => ({ id: k, label: k }))} onChange={setKind} /></div>
      {kind === 'dci' ? (<>
        <Note>An interconnect joins two live sites. Both ends are carried through the paths, the bill (optics, ports, cross-connects per end), the addresses and the circuits created.</Note>
        <div className="pn-grid-2b">
          <Field label="A end" required><SelectInput value={draft.dataCenterId} placeholder="Pick a site" disabled={readOnly} options={opts.filter(o => o.id !== draft.peerDataCenterId)} onChange={pickA} /></Field>
          <Field label="Z end" required><SelectInput value={draft.peerDataCenterId} placeholder="Pick a site" disabled={readOnly} options={opts.filter(o => o.id !== draft.dataCenterId)} onChange={v => patch({ peerDataCenterId: v })} /></Field>
        </div>
        {an && (an.a.dc || an.z.dc) && <div className="pn-grid-2b">{[an.a, an.z].map(e => <EndCard key={e.side} an={an} side={e.side} />)}</div>}
        {an?.ready && <ExistingCircuits {...props} an={an} />}
      </>) : (<>
        <Note>A fabric uplift raises leaf-to-spine capacity inside one site. The current leaves and spines are read from the devices.</Note>
        <div style={{ maxWidth: 420 }}><Field label="Site" required><SelectInput value={draft.dataCenterId} placeholder="Pick a site" disabled={readOnly} options={opts} onChange={pickA} /></Field></div>
      </>)}
    </div>
  );
}

function EndCard({ an, side }: { an: NetworkAnalysis; side: 'A' | 'Z' }) {
  const e = side === 'A' ? an.a : an.z;
  if (!e.dc) return <div className="pn-end"><div className="pn-end-head"><I.Building2 size={15} /><b>{side} end</b></div><small>Not set</small></div>;
  return (
    <div className="pn-end">
      <div className="pn-end-head"><I.Building2 size={15} /><b>{side} · {e.dc.code}</b>{e.colo && <Chip tone="info" size="xs">Colocation: cross-connects</Chip>}<Chip tone={e.transitPools.length ? 'neutral' : 'error'} size="xs">{e.transitPools[0] ? `Transit ${e.transitPools[0].cidr}` : 'No transit pool'}</Chip></div>
      <small>{e.dc.name} · routers {e.routers.slice(0, 3).map(r => `${r.name} (${r.model ?? '—'})`).join(', ') || 'none recorded'}</small>
    </div>
  );
}

/** Existing A–Z circuits and what the plan does with each (keep / upgrade / cease). */
function ExistingCircuits({ draft, patch, an, readOnly }: StepProps & { an: NetworkAnalysis }) {
  const setAction = (c: ExistingCircuit, v: 'keep' | 'upgrade' | 'cease') => {
    const rows = (draft.dispositions ?? []).filter(d => !(d.recordType === 'circuit' && d.recordId === c.circuit.id));
    patch({ dispositions: [...rows, { recordType: 'circuit', recordId: c.circuit.id, label: c.circuit.cid, disposition: DISPOSITION_OF[v] }] });
  };
  return (<div>
    <Sub>Circuits between the sites today</Sub>
    <Tbl head={['Circuit', 'Carrier', 'Capacity', 'Used', 'Monthly', 'Contract end', 'Diversity group', 'Plan', 'Early termination']} empty={`No circuits recorded between ${an.a.dc?.code ?? 'A'} and ${an.z.dc?.code ?? 'Z'}.`}>
      {an.circuits.map(c => (
        <tr key={c.circuit.id}>
          <td><span className="pn-row" style={{ gap: 6 }}><span className="strong mono">{c.circuit.cid}</span>{!c.farEndKnown && <Chip tone="warning" size="xs">Far end not recorded</Chip>}</span></td>
          <td>{c.provider?.name ?? '—'}</td><td className="num">{gb(c.capacityGbps)}</td>
          <td className="num">{c.measuredGbps !== undefined ? `${gb(c.measuredGbps)} (${c.utilisationPct}%)` : '—'}</td>
          <td className="num">{money(c.monthlyUsd)}</td><td>{c.contractEnd ? date(c.contractEnd) : '—'}</td><td>{c.circuit.diversityGroup ?? '—'}</td>
          <td style={{ minWidth: 120 }}><SelectInput value={c.action === 'undecided' ? undefined : c.action} placeholder="Decide" disabled={readOnly} options={(['keep', 'upgrade', 'cease'] as const).map(v => ({ id: v, label: ACTION_LABEL[v] }))} onChange={v => setAction(c, v)} /></td>
          <td className="is-wrap" style={{ fontSize: 12.5 }}>{c.etcUsd ? <Chip tone="warning" size="xs">{money(c.etcUsd)}</Chip> : null} {c.etcNote}</td>
        </tr>
      ))}
    </Tbl>
  </div>);
}

/** Demand now and at the sizing year against the capacity planned (one measure, one axis). */
function DemandChart({ an }: { an: NetworkAnalysis }) {
  const d = an.demand; if (!d) return null;
  const rows: [string, number, string][] = [['Services over A–Z, now', d.servicesGbps, `${d.services.length} services`], [`Services at year ${d.years}`, d.servicesAtN, 'each at its own growth'], ['Measured on today’s circuits', d.measuredGbps, 'interface utilisation'], [`Measured at year ${d.years}`, d.measuredAtN, `${d.growthPct}% a year`], ['Design figure', d.designGbps, d.overridden ? 'entered, overrides the derived need' : 'derived'], ['Capacity planned', an.capacityGbps + an.keptGbps, `${an.paths.length} new path${an.paths.length === 1 ? '' : 's'}${an.keptGbps ? ' + kept' : ''}`]];
  const max = Math.max(1, ...rows.map(r => r[1])); const W = 680, LX = 200, BH = 16, GAP = 10, H = rows.length * (BH + GAP) + 6;
  return (
    <div className="pn-draw">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label="Demand and capacity in Gbps">
        {rows.map(([label, v, note], i) => { const y = 3 + i * (BH + GAP); const w = Math.max(2, ((W - LX - 110) * v) / max); const cap = i === rows.length - 1; return (
          <g key={label}><title>{`${label}: ${gb(v)} (${note})`}</title>
            <text x={LX - 8} y={y + 12} fontSize={11.5} textAnchor="end" fill="var(--vw-color-slate-800)">{label}</text>
            <rect x={LX} y={y} width={w} height={BH} rx={4} fill={cap ? 'var(--primaryColor600)' : 'var(--vw-color-blue-200)'} />
            <text x={LX + w + 6} y={y + 12} fontSize={11.5} fill="var(--vw-color-slate-500)">{gb(v)}</text>
          </g>
        ); })}
      </svg>
    </div>
  );
}

/** Services riding the interconnect today, with their customer (what a cut-over or a lost path touches). */
function ServicesTable({ an, data }: { an: NetworkAnalysis; data: StepProps['data'] }) {
  const d = an.demand; if (!d) return null;
  if (!d.services.length) return <Note>No service on the platform runs over both sites, and no WAN service (VPN, leased line, backup) passes the end routers, so the link carries no recorded service today: the demand is the measured traffic on the current circuits{d.declaredGbps ? ' or the figure declared on the plan' : ''}.</Note>;
  const cust = (id?: string) => data.customers.find(c => c.id === id)?.name ?? '—';
  return (
    <Tbl head={['Service', 'Customer', 'Now', `At year ${d.years}`, 'Seen at']} maxHeight={240}>
      {d.services.map(s => <tr key={s.service.id}><td>{s.service.name}</td><td>{cust(s.service.customerRef)}</td><td className="num">{gb(s.gbps)}</td><td className="num">{gb(s.atYearN)}</td><td>{s.via}</td></tr>)}
    </Tbl>
  );
}

/** Network step: DCI inputs, demand, paths with end-port pickers, survivability and diversity, addresses (or the fabric uplift). */
export function NetworkPanel(props: StepProps) {
  const { draft, patch, ev, data, readOnly } = props;
  const an = networkOf(ev); const kind = networkKindOf(draft);
  if (kind === 'fabric') return <FabricPanel {...props} />;
  if (!an?.ready) return <Note>{an?.reason ?? 'Pick both ends in Requirements.'}</Note>;
  const paths = draft.paths ?? [];
  const set = (id: string, p: Partial<T.PlannerNetworkPath>) => patch({ paths: paths.map(x => (x.id === id ? { ...x, ...p } : x)) });
  const add = () => { const id = nextId(paths.map(x => x.id)); patch({ paths: [...paths, { id, name: `Path ${paths.length + 1}`, providerName: '', sharedRiskGroups: [], linkType: 'Leased wavelength', capacityGbps: paths[0]?.capacityGbps ?? 400, monthlyUsd: 0, installUsd: 0, termMonths: 36, diversityGroup: `${an.a.dc?.code}·${an.z.dc?.code}·DCI`, encryption: 'MACsec', aDeviceId: an.a.routers[paths.length % Math.max(1, an.a.routers.length)]?.id, zDeviceId: an.z.routers[paths.length % Math.max(1, an.z.routers.length)]?.id }] }); };
  const routerOpts = (side: 'A' | 'Z') => (side === 'A' ? an.a : an.z).routers.map(r => ({ id: r.id, label: `${r.name} · ${r.model ?? ''}` }));
  const portOpts = (deviceId: string | undefined, g: number) => [{ id: '', label: 'Any free port' }, ...freePorts(data, deviceId, g).map(p => ({ id: p.name, label: `${p.name} · ${p.speedGbps}G` }))];
  const s = an.survivability; const d = an.diversity;
  return (<>
    <ParamGrid {...props} keys={['protection', 'protectedSharePct', 'latencyBudgetMs', 'encryptionRequired', 'demandYears', 'demandOverrideReason', 'diversityWaiver']} />
    <Sub>Demand</Sub>
    <DemandChart an={an} />
    <Note>{an.demand?.basis}.{an.demand?.overridden && !an.demand.reason ? ' The capacity in Requirements differs from the derived need: give a reason above.' : ''}</Note>
    <ServicesTable an={an} data={data} />
    <div style={{ marginTop: 12 }}><Tiles items={[
      { label: 'With one path lost', value: s ? gb(s.remainingGbps) : '—', tone: s ? (s.ok ? 'ok' : 'bad') : undefined, sub: s ? `for ${gb(s.protectedGbps)} protected` : undefined },
      { label: 'Diversity', value: d ? (d.ok ? 'Diverse' : d.waived ? 'Waived' : 'Shared risk') : '—', tone: d ? (d.ok ? 'ok' : d.waived ? 'warn' : 'bad') : undefined, sub: d?.shared[0] ?? d?.detail },
      { label: 'Monthly change', value: money(ev!.estimate.opexMonthly), sub: `${money(an.newMonthlyUsd)} new, ${money(an.ceasedMonthlyUsd)} ceased` },
      { label: 'One-off cost', value: money(ev!.estimate.capexTotal), sub: an.etcUsd ? `includes ${money(an.etcUsd)} early termination` : 'install, optics, ports, cross-connects' },
    ]} /></div>
    <Sub extra={!readOnly && <Btn size="sm" icon={I.Plus} onClick={add}>Add a path</Btn>}>Paths</Sub>
    {paths.map(p => {
      const r = an.paths.find(x => x.path.id === p.id);
      return (
        <div key={p.id} className="pn-card2">
          <div className="pn-card2-head">
            <span style={{ width: 130 }}><TextInput value={p.name} disabled={readOnly} onChange={v => set(p.id, { name: v })} /></span>
            <span style={{ width: 170 }}><SelectInput value={p.providerId} placeholder="Carrier" disabled={readOnly} options={data.providers.map(x => ({ id: x.id, label: x.name }))} onChange={v => set(p.id, { providerId: v, providerName: data.providers.find(x => x.id === v)?.name ?? '' })} /></span>
            <span style={{ width: 220 }}><SelectInput value={p.linkType} disabled={readOnly} options={LINK_TYPES.map(t => ({ id: t, label: t }))} onChange={v => set(p.id, { linkType: v })} /></span>
            <span style={{ width: 140 }}><NumInput value={p.capacityGbps} min={1} unit="Gbps" disabled={readOnly} onChange={v => set(p.id, { capacityGbps: v ?? 0 })} /></span>
            {r && <Chip tone={r.problems.length ? 'error' : 'success'} size="xs" dot>{r.problems.length ? `${r.problems.length} problem${r.problems.length === 1 ? '' : 's'}` : 'Checks pass'}</Chip>}
            <span className="grow" />
            {!readOnly && <Btn size="sm" variant="ghost" icon={I.Trash2} title="Remove the path" onClick={() => patch({ paths: paths.filter(x => x.id !== p.id) })} />}
          </div>
          <div className="pn-card2-body is-2">
            <Field label="Route id"><TextInput value={p.routeId ?? ''} disabled={readOnly} onChange={v => set(p.id, { routeId: v || undefined })} /></Field>
            <Field label="Shared-risk groups" hint="Ducts, landing stations, cable systems; comma separated"><TextInput value={p.sharedRiskGroups.join(', ')} disabled={readOnly} onChange={v => set(p.id, { sharedRiskGroups: v.split(',').map(x => x.trim()).filter(Boolean) })} /></Field>
            <Field label="Route length" hint={r?.distanceSource}><NumInput value={p.distanceKm} min={0} unit="km" placeholder={r ? String(r.distanceKm) : undefined} disabled={readOnly} onChange={v => set(p.id, { distanceKm: v })} /></Field>
            <Field label="Round-trip latency" hint={r?.latencySource}><NumInput value={p.latencyMs} min={0} step={0.1} unit="ms" placeholder={r ? String(r.latencyMsRtt) : undefined} disabled={readOnly} onChange={v => set(p.id, { latencyMs: v })} /></Field>
            <Pair label="A-end device and port" hint={r?.a.detail}><SelectInput value={p.aDeviceId} placeholder="Router" disabled={readOnly} options={routerOpts('A')} onChange={v => set(p.id, { aDeviceId: v, aPortName: undefined })} /><SelectInput value={p.aPortName ?? ''} disabled={readOnly} options={portOpts(p.aDeviceId, p.capacityGbps)} onChange={v => set(p.id, { aPortName: v || undefined })} /></Pair>
            <Pair label="Z-end device and port" hint={r?.z.detail}><SelectInput value={p.zDeviceId} placeholder="Router" disabled={readOnly} options={routerOpts('Z')} onChange={v => set(p.id, { zDeviceId: v, zPortName: undefined })} /><SelectInput value={p.zPortName ?? ''} disabled={readOnly} options={portOpts(p.zDeviceId, p.capacityGbps)} onChange={v => set(p.id, { zPortName: v || undefined })} /></Pair>
            <Pair label="Charges (USD)" hint="Monthly, one-off, term"><NumInput value={p.monthlyUsd} min={0} unit="/mo" disabled={readOnly} onChange={v => set(p.id, { monthlyUsd: v ?? 0 })} /><NumInput value={p.installUsd} min={0} unit="once" disabled={readOnly} onChange={v => set(p.id, { installUsd: v ?? 0 })} /><NumInput value={p.termMonths} min={1} unit="mo" disabled={readOnly} onChange={v => set(p.id, { termMonths: v ?? 36 })} /></Pair>
            <Pair label="Replaces and encryption"><SelectInput value={p.replacesCircuitId ?? ''} disabled={readOnly} options={[{ id: '', label: 'New capacity' }, ...an.circuits.map(c => ({ id: c.circuit.id, label: `${c.circuit.cid} · ${c.capacityGbps}G` }))]} onChange={v => set(p.id, { replacesCircuitId: v || undefined })} /><SelectInput value={p.encryption ?? 'None'} disabled={readOnly} options={ENCRYPTION.map(v => ({ id: v, label: v }))} onChange={v => set(p.id, { encryption: v })} /></Pair>
          </div>
          {r && <div className={`pn-card2-foot${r.problems.length ? ' is-bad' : ''}`}>{r.problems.length ? r.problems.join('; ') : `${r.optic.model} at both ends; ${r.reachNote}; ${r.reachClass} delivery.`}</div>}
        </div>
      );
    })}
    {!paths.length && <Note>No paths yet. Add one per carrier or fibre route; two on different carriers and routes is the usual minimum.</Note>}
    <Sub>Addresses and routing</Sub>
    <IpTable an={an} />
  </>);
}


function IpTable({ an }: { an: NetworkAnalysis }) {
  const items = an.ip?.items ?? [];
  return (<>
    <Tbl head={['Path', 'Prefix', 'From pool', 'A / Z address', 'BGP']} empty="Add paths to allocate point-to-point addresses.">
      {items.map((i, k) => <tr key={k}><td>{an.paths.find(x => x.path.id === i.pathId)?.path.name ?? i.pathId}{i.end !== 'link' ? ` · ${i.end} end` : ''}</td><td>{i.cidr ? <span className="mono">{i.cidr}</span> : <Chip tone="error" size="xs">Not allocated</Chip>}</td><td className="mono">{i.poolCidr ?? '—'}</td><td className="mono">{i.aAddr ? `${i.aAddr} / ${i.zAddr}` : '—'}</td><td>{i.bgp.kind}</td></tr>)}
    </Tbl>
    {an.ip?.warnings.map(w => <Note key={w}>{w}.</Note>)}
  </>);
}

function FabricPanel(props: StepProps) {
  const an = networkOf(props.ev); const f = an?.fabric;
  return (<>
    <ParamGrid {...props} keys={['fabricTargetGbps', 'fabricUplinksPerLeaf', 'fabricTargetOversub']} />
    {!f ? <Note>{an?.reason ?? 'Pick the site.'}</Note> : (<>
      <div style={{ marginTop: 12 }}><Tiles items={[
        { label: 'Fabric today', value: `${num(f.leaves.length)} leaves`, sub: `${f.spines.length} spines · ${f.currentUplinks} × ${f.currentUplinkGbps}G per leaf` },
        { label: 'Oversubscription', value: `${f.oversubNow}:1 → ${f.oversubAfter}:1`, tone: f.oversubAfter <= f.targetOversub ? 'ok' : 'bad', sub: `target ${f.targetOversub}:1` },
        { label: 'Switches replaced', value: num(f.leavesToReplace.length + f.spinesToReplace.length), sub: `${f.leavesToReplace.length} leaves, ${f.spinesToReplace.length} spines below ${f.targetGbps}G` },
        { label: 'Spine ports', value: `${f.spinePortsAfter} / ${f.uplinkPortsNeeded}`, tone: f.spinePortsAfter >= f.uplinkPortsNeeded ? 'ok' : 'bad', sub: `${f.spinesNeeded} new spine${f.spinesNeeded === 1 ? '' : 's'}` },
      ]} /></div>
      {f.notes.map(n => <Note key={n}>{n}.</Note>)}
    </>)}
  </>);
}

/** Delivery: the cut-over date and the dated order and gate list (dated whatever the kW). */
export function NetworkDeliveryPanel(props: StepProps) {
  const { draft, patch, ev, readOnly } = props;
  const setCutover = (iso: string) => patch({ targetGoLive: iso, phases: draft.phases.length ? draft.phases.map((p, i, all) => (i === all.length - 1 ? { ...p, goLive: iso } : p)) : [{ id: 'PH-1', name: 'Cut-over', goLive: iso, itKw: 0, racks: 0, halls: 0, status: 'Planned' }] });
  const cut = [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).pop()?.goLive ?? draft.targetGoLive;
  return (<>
    <div style={{ maxWidth: 260 }}><Field label="Cut-over date"><TextInput type="date" value={toDateInput(cut)} disabled={readOnly} onChange={v => setCutover(fromDateInput(v, cut))} /></Field></div>
    <div style={{ marginTop: 14 }}><ParamGrid {...props} keys={['cutoverWindowHours', 'ceaseSoakDays', 'earlyTerminationPct', 'crossConnectNrcUsd', 'crossConnectMrcUsd', 'orgAsn', 'dciP2pPool', 'demarcSpanKm']} /></div>
    <Sub>Orders and gates</Sub>
    <ScheduleTable ev={ev} />
  </>);
}
function ScheduleTable({ ev }: { ev?: Evaluation }) {
  const items = ev?.schedule ?? [];
  return (
    <Tbl head={['Item', 'Lead', 'Order by', 'Needed by', 'Status']} empty="Nothing to order or pass yet.">
      {items.map((s, i) => <tr key={i}><td title={s.note}>{s.item}</td><td className="num">{s.kind === 'gate' ? '—' : `${s.leadWeeks} wk`}</td><td>{s.kind === 'gate' ? '—' : date(s.orderBy)}</td><td>{date(s.needBy)}</td><td>{s.kind === 'gate' ? <Chip tone="neutral" size="xs" dot>Gate</Chip> : s.late ? <Chip tone="error" size="xs" dot>Late</Chip> : <Chip tone="success" size="xs" dot>On time</Chip>}</td></tr>)}
    </Tbl>
  );
}

/** Plan page tab and pack section: ends, circuits, paths, demand, addresses and the cut-over. */
export function NetworkView({ ev, data }: PlanViewProps) {
  const an = networkOf(ev);
  if (!an) return <Note>The plan has not been evaluated yet.</Note>;
  if (an.kind === 'fabric') return <div className="pn-col">{an.fabric && <Tiles items={[
    { label: 'Leaves', value: num(an.fabric.leaves.length), sub: `${an.fabric.leavesToReplace.length} replaced` },
    { label: 'Spines', value: num(an.fabric.spines.length), sub: `${an.fabric.spinesNeeded} new` },
    { label: 'Oversubscription', value: `${an.fabric.oversubNow}:1 → ${an.fabric.oversubAfter}:1`, tone: an.fabric.ok ? 'ok' : 'bad', sub: `target ${an.fabric.targetOversub}:1` },
    { label: 'Uplinks per leaf', value: `${an.fabric.uplinksPerLeaf} × ${an.fabric.targetGbps}G` },
  ]} />}<ScheduleTable ev={ev} /></div>;
  const s = an.survivability, d = an.diversity;
  return (
    <div className="pn-col">
      <div className="pn-grid-2b"><EndCard an={an} side="A" /><EndCard an={an} side="Z" /></div>
      <Tiles items={[
        { label: 'Capacity planned', value: gb(an.capacityGbps + an.keptGbps), sub: `${an.paths.length} new path${an.paths.length === 1 ? '' : 's'}${an.keptGbps ? `, ${gb(an.keptGbps)} kept` : ''}` },
        { label: 'With one path lost', value: s ? gb(s.remainingGbps) : '—', tone: s ? (s.ok ? 'ok' : 'bad') : undefined, sub: s ? `for ${gb(s.protectedGbps)} protected` : undefined },
        { label: 'Diversity', value: d ? (d.ok ? 'Diverse' : d.waived ? 'Waived' : 'Shared risk') : '—', tone: d ? (d.ok ? 'ok' : d.waived ? 'warn' : 'bad') : undefined, sub: d?.shared[0] ?? d?.detail },
        { label: 'Services carried', value: num(an.demand?.services.length ?? 0), sub: an.demand ? (an.demand.services.length ? `${gb(an.demand.servicesGbps)} today` : 'none recorded across the sites') : undefined },
      ]} />
      {an.paths.length + an.circuits.length > 0 && <div><Sub>Path diagram</Sub><DciPaths an={an} /></div>}
      <div><Sub>Paths and diversity</Sub><PathsTable an={an} /></div>
      <div><Sub>Demand against capacity</Sub><DemandChart an={an} /><ServicesTable an={an} data={data} /></div>
      <div><Sub>Addresses and routing</Sub><IpTable an={an} /></div>
      <div><Sub>Orders and gates</Sub><ScheduleTable ev={ev} /></div>
    </div>
  );
}

export function PathsTable({ an }: { an: NetworkAnalysis }) {
  return (
    <Tbl head={['Path', 'Carrier', 'Type', 'Capacity', 'RTT', 'Route / shared risk', 'A end', 'Z end', 'Monthly', 'Circuit', 'Checks']} empty="No paths yet.">
      {an.paths.map(x => (
        <tr key={x.path.id}><td className="strong nowrap">{x.path.name}</td><td>{x.provider?.name ?? x.path.providerName}</td><td>{x.path.linkType}</td><td className="num">{x.path.capacityGbps}G</td><td className="num">{x.latencyMsRtt} ms</td><td>{x.path.routeId ?? '—'} · {x.path.sharedRiskGroups.join(', ') || '—'}</td><td>{x.a.device?.name ?? '—'} {x.a.port ?? (x.a.lineCard ? '(line card)' : '')}</td><td>{x.z.device?.name ?? '—'} {x.z.port ?? (x.z.lineCard ? '(line card)' : '')}</td><td className="num">{money(x.path.monthlyUsd)}</td><td className="mono">{x.path.circuitId ?? '—'}</td><td title={x.problems.join('; ') || undefined}>{x.problems.length ? <Chip tone="error" size="xs" dot>{x.problems.length} problem{x.problems.length === 1 ? '' : 's'}</Chip> : <Chip tone="success" size="xs" dot>Pass</Chip>}</td></tr>
      ))}
    </Tbl>
  );
}
