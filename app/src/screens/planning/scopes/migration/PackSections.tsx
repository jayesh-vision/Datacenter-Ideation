/* Plan pack sections for migrations: inventory register, cut-over runbook, consent register, exit plan (circuits, contracts,
   addresses), compliance and the closure checklist. The wave schedule is the replace family's. */
import { Chip } from '../../../../ui/kit';
import { DISPOSITION_LABEL, migrationCloseout, migrationOf } from '../../../../planner/lib/migrationCore';
import { byId } from '../../../../planner/lib/plannerData';
import type { PlanViewProps } from '../types';
import { Sub } from '../../parts';
import { date, money } from '../../common';
import { ConsentRegister } from '../replace/Consents';
import { RunbookCard } from '../replace/PackSections';
import { Checklist, Quiet, Tbl, inDelivery } from '../replace/shared';

const TYPE_LABEL: Record<string, string> = { device: 'Device', rack: 'Rack', service: 'Service', circuit: 'Circuit', subnet: 'Subnet', vlan: 'VLAN', contract: 'Site contract', plant: 'Plant' };

export function InventoryRegister({ ev }: PlanViewProps) {
  const a = migrationOf(ev); if (!a?.ready) return <Quiet>{a?.reason ?? 'Not available.'}</Quiet>;
  if (!a.rows.length) return <Quiet>Nothing recorded at the site.</Quiet>;
  return (<Tbl maxHeight={520}>
    <thead><tr><th>Type</th><th>Item</th><th>Detail</th><th>What happens</th><th>Confirmed</th></tr></thead>
    <tbody>{a.rows.map(r => <tr key={r.key}><td>{TYPE_LABEL[r.recordType] ?? r.recordType}</td><td><span className="strong">{r.label}</span></td><td style={{ whiteSpace: 'normal', fontSize: 12.5 }}>{r.detail}</td><td>{DISPOSITION_LABEL[r.disposition]}</td><td>{r.fromPlan ? 'Yes' : <span className="vw-label">Proposed</span>}</td></tr>)}</tbody>
  </Tbl>);
}

export function MigrationRunbook({ plan, ev, data }: PlanViewProps) {
  const a = migrationOf(ev); const waves = [...(plan.waves ?? [])].sort((x, y) => x.order - y.order);
  if (!waves.length) return <Quiet>No waves yet.</Quiet>;
  return (<div className="col" style={{ gap: 12 }}>{waves.map(w => {
    const svcs = a?.services.filter(s => w.serviceIds.includes(s.service.id)) ?? [];
    const cons = a?.consents.filter(c => c.serviceIds.some(s => w.serviceIds.includes(s))) ?? [];
    const steps: [string, string][] = [
      ['Before', `Consent: ${cons.map(c => `${c.customerName} (${c.status})`).join(', ') || 'nobody affected'}. Change ${w.changeRequestId ?? '(raised at execution)'} approved.${svcs.some(s => s.approach === 'Replicate and swing') ? ' Replication in sync and lag under the agreed limit.' : ''}`],
      ['Work', `${w.method ?? ''}${svcs.length ? `. ${svcs.map(s => `${s.service.name}: ${s.approach}, about ${s.downtimeH} h down`).join('; ')}` : ''}`],
      ['Acceptance', w.acceptance ?? ''],
      ['Rollback', w.rollback],
      ['After', `${w.deviceIds.length} devices out of ${a?.source?.code ?? 'the source'}; data-bearing ones sealed for the disposal vendor.${(w.circuitIds ?? []).length ? ` Circuits ${(w.circuitIds ?? []).map(c => byId(data, 'circuits', c)?.cid ?? c).join(', ')} ceased with the carrier.` : ''} Records updated by "Close wave".`],
    ];
    return <RunbookCard key={w.id} w={w} steps={steps} />;
  })}</div>);
}

export function MigrationConsents({ ev }: PlanViewProps) {
  const a = migrationOf(ev); if (!a?.ready) return <Quiet>{a?.reason ?? 'Not available.'}</Quiet>;
  return <ConsentRegister rows={a.consents} readOnly firstWave={c => a.consents.find(x => x.customerRef === c.customerRef)?.firstWave} />;
}

export function ExitPlan({ ev, data }: PlanViewProps) {
  const a = migrationOf(ev); if (!a?.ready) return <Quiet>{a?.reason ?? 'Not available.'}</Quiet>;
  return (<div className="col" style={{ gap: 4 }}>
    <Sub>Circuits</Sub>
    <Tbl><thead><tr><th>Circuit</th><th>Provider</th><th>Action</th><th>Date</th><th>Cost</th></tr></thead>
      <tbody>{a.circuits.map(c => <tr key={c.circuit.id}><td className="mono">{c.circuit.cid}</td><td>{byId(data, 'providers', c.circuit.providerId)?.name ?? '—'}</td><td>{c.action === 'cease' ? 'Cease' : 'Re-terminate'}</td><td>{date(c.ceaseDate)}</td><td className="num">{c.penaltyUsd ? money(c.penaltyUsd) : '—'}</td></tr>)}{!a.circuits.length && <tr><td colSpan={5} className="vw-label">No circuits.</td></tr>}</tbody></Tbl>
    <Sub>Site contracts</Sub>
    <Tbl><thead><tr><th>Contract</th><th>Vendor</th><th>Ends</th><th>Notice</th><th>Serve by</th><th>A year</th></tr></thead>
      <tbody>{a.contracts.map(c => <tr key={c.contract.id}><td>{c.contract.type} <span className="mono">{c.contract.ctrId}</span></td><td>{c.vendor?.name ?? '—'}</td><td>{date(c.contract.endDate)}</td><td>{c.contract.noticeDays ?? '—'} days</td><td style={{ color: c.late ? 'var(--vw-color-red-600)' : undefined }}>{c.endsBeforeExit ? 'Ends before the exit' : c.serveBy ? date(c.serveBy) : 'Unknown'}</td><td className="num">{money(c.annualUsd)}</td></tr>)}
        {!a.contracts.length && <tr><td colSpan={6} className="vw-label">No lease or site contract is recorded for {a.source?.code ?? 'the site'}; check the lease terms.</td></tr>}</tbody></Tbl>
    <Sub>Addresses</Sub>
    <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>Release {a.ip.subnets.map(s => s.cidr).join(', ') || 'none'}; VLANs {a.ip.vlans.map(v => v.vlanNumber).join(', ') || 'none'}.{a.ip.target.length ? ` New at ${a.target?.code ?? 'the target'}: ${a.ip.target.map(t => `${t.cidr ?? 'no room'} for ${t.source}`).join(', ')}.` : ''}</p>
  </div>);
}

export function Compliance({ ev }: PlanViewProps) {
  const a = migrationOf(ev); if (!a?.ready) return <Quiet>{a?.reason ?? 'Not available.'}</Quiet>;
  if (!a.permits.length) return <Quiet>No compliance steps apply.</Quiet>;
  return (<Tbl><thead><tr><th>Step</th><th>Authority</th><th>Why</th><th>On the plan</th></tr></thead>
    <tbody>{a.permits.map(p => <tr key={p.name}><td><span className="strong">{p.name}</span></td><td>{p.authority}</td><td style={{ whiteSpace: 'normal' }}>{p.why}</td><td><Chip tone={p.onPlan ? 'success' : 'warning'} size="xs" dot>{p.onPlan ? 'Yes' : 'Missing'}</Chip></td></tr>)}</tbody></Tbl>);
}

export function MigrationClosure({ plan, data }: PlanViewProps) {
  return <Checklist checks={migrationCloseout(plan, data)} atHandover={inDelivery(plan)} />;
}
