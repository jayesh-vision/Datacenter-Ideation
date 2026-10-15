/* Wizard result panels for migrations, consolidations and decommissions. */
import { Chip } from '../../../../ui/kit';
import { fmtKw } from '../../../../planner/lib/engine';
import { DISPOSITION_LABEL, migrationOf, type MigrationAnalysis } from '../../../../planner/lib/migrationCore';
import { byId } from '../../../../planner/lib/plannerData';
import type { StepProps } from '../../../../planner/lib/wizardModel';
import { Sub } from '../../parts';
import { date, money } from '../../common';
import { WavesEditor } from '../replace/WavesEditor';
import { ConsentRegister } from '../replace/Consents';
import { Hint, Issues, Quiet, Tbl, Tiles } from '../replace/shared';

function useM(p: StepProps): MigrationAnalysis | undefined { return p.ev ? migrationOf(p.ev) : undefined; }
function Wait({ a, goTo }: { a?: MigrationAnalysis; goTo: StepProps['goTo'] }) {
  return <Quiet>{a?.ready ? <>Pick the site being emptied on <button type="button" className="ent-link" onClick={() => goTo('requirements')}>Requirements</button>.</> : a?.reason ?? 'Loading…'}</Quiet>;
}

export function MigrationSpacePanel(p: StepProps) {
  const a = useM(p); if (!a?.ready || !a.source) return <Wait a={a} goTo={p.goTo} />;
  if (a.mode === 'decommission') return (<Tiles items={[
    { label: 'Racks at the source', value: a.rows.filter(r => r.recordType === 'rack').length, sub: 'retired or handed back' },
    { label: 'Load freed', value: fmtKw(a.kwLeaving), sub: 'leaves the estate' },
    { label: 'Target', value: 'None', sub: 'decommission: nothing moves' },
    { label: 'Exit', value: date(a.exitDate), sub: 'last wave plus plant decommission and handback' },
  ]} />);
  const peer = p.ev!.ctx.peerSite;
  return (<>
    <Tiles items={[
      { label: 'Target', value: a.target?.code ?? 'Not chosen', sub: a.target ? `${a.target.name}, ${a.distanceKm} km` : 'pick it on Requirements', tone: a.target ? undefined : 'bad' },
      { label: 'Racks needed', value: a.racksMoving, sub: `${a.uMoving} U moving · ${peer ? peer.halls.reduce((s, h) => s + h.freePositions, 0) : '—'} free positions` },
      { label: 'Load moving', value: fmtKw(a.kwMoving), sub: peer ? `${fmtKw(peer.headroomItKw)} headroom (${peer.binding?.label ?? 'site'})` : undefined, tone: peer && a.kwMoving > peer.headroomItKw ? 'bad' : 'ok' },
      { label: 'Cooling headroom', value: peer ? fmtKw(peer.cooling.headroomKw) : '—', tone: peer && a.kwMoving > peer.cooling.headroomKw ? 'bad' : undefined },
    ]} />
    <Sub>Target fit per wave (cumulative)</Sub>
    <Tbl>
      <thead><tr><th>Wave</th><th>kW so far</th><th>Racks so far</th><th>Check</th></tr></thead>
      <tbody>{a.targetFit.map(t => <tr key={t.waveId}><td>{t.waveName}</td><td className="num">{t.cumKw} / {t.kwHeadroom}</td><td className="num">{t.cumRacks} / {t.positions}</td><td style={{ whiteSpace: 'normal' }}>{t.ok ? <Chip tone="success" size="xs">Fits</Chip> : <Issues items={t.issues} />}</td></tr>)}
        {!a.targetFit.length && <tr><td colSpan={4} className="vw-label">Make the waves to check the target wave by wave.</td></tr>}</tbody>
    </Tbl>
    <Hint>Positions, kW and cooling come from the target site's baseline; capacity is reserved there when the plan is approved.</Hint>
  </>);
}

export function MigrationNetworkPanel(p: StepProps) {
  const a = useM(p); if (!a?.ready || !a.source) return <Wait a={a} goTo={p.goTo} />;
  return (<>
    <Sub>Circuits</Sub>
    <Tbl>
      <thead><tr><th>Circuit</th><th>Provider</th><th>A month</th><th>Contract end</th><th>Action</th><th>Cease date</th><th>Early termination</th></tr></thead>
      <tbody>{a.circuits.map(c => <tr key={c.circuit.id}><td><span className="strong mono">{c.circuit.cid}</span></td><td>{byId(p.data, 'providers', c.circuit.providerId)?.name ?? '—'}</td><td className="num">{money(c.monthlyUsd)}</td><td>{date(c.circuit.contractEnd)}</td><td>{c.action === 'cease' ? 'Cease' : 'Re-terminate'}</td><td>{date(c.ceaseDate)}</td><td className="num" style={{ color: c.penaltyUsd ? 'var(--vw-color-amber-700)' : undefined }}>{c.penaltyUsd ? `${money(c.penaltyUsd)} (${c.monthsLeft} mo)` : '—'}</td></tr>)}
        {!a.circuits.length && <tr><td colSpan={7} className="vw-label">No circuits end at the site.</td></tr>}</tbody>
    </Tbl>
    <Sub>Addresses released at {a.source.code}</Sub>
    <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>{a.ip.subnets.map(s => s.cidr).join(', ') || 'No subnets'} · VLANs {a.ip.vlans.map(v => v.vlanNumber).join(', ') || 'none'} · {a.ip.addresses} addresses. Subnets become Deprecated (state Available) and VLANs Unused when the last wave closes.</p>
    {a.mode === 'consolidation' && (<>
      <Sub>Prefixes at {a.target?.code ?? 'the target'}</Sub>
      <Tbl><thead><tr><th>Replaces</th><th>New prefix</th><th>Carved from</th></tr></thead>
        <tbody>{a.ip.target.map(t => <tr key={t.source}><td className="mono">{t.source}</td><td className="mono">{t.cidr ?? <span style={{ color: 'var(--vw-color-red-600)' }}>No room</span>}</td><td className="mono">{t.parent ?? '—'}</td></tr>)}{!a.ip.target.length && <tr><td colSpan={3} className="vw-label">No prefixes needed.</td></tr>}</tbody></Tbl>
      <Issues items={a.ip.warnings} />
    </>)}
  </>);
}

export function MigrationItPanel(p: StepProps) {
  const a = useM(p); if (!a?.ready || !a.source) return <Wait a={a} goTo={p.goTo} />;
  const dev = a.rows.filter(r => r.recordType === 'device');
  const by = [...new Set(dev.map(r => r.disposition))];
  return (<>
    {by.length > 0 && <Tiles items={by.slice(0, 4).map(d => ({ label: DISPOSITION_LABEL[d], value: dev.filter(r => r.disposition === d).length, sub: `${fmtKw(dev.filter(r => r.disposition === d).reduce((s, r) => s + r.kw, 0))} drawn` }))} />}
    <Sub>How each service moves</Sub>
    <Tbl>
      <thead><tr><th>Service</th><th>Customer</th><th>Approach</th><th>Downtime</th><th>Revenue</th></tr></thead>
      <tbody>{a.services.map(s => <tr key={s.service.id}><td><span className="row" style={{ gap: 6 }}><span className="strong">{s.service.name}</span>{s.critical && <Chip tone="error" size="xs">Critical</Chip>}</span></td><td>{s.customer?.name ?? '—'}</td><td>{s.approach}</td><td className="num" style={{ color: s.downtimeH > a.window ? 'var(--vw-color-red-600)' : undefined }}>{s.downtimeH} h</td><td className="num">{money(s.service.revenueMonthly)} a month</td></tr>)}
        {!a.services.length && <tr><td colSpan={5} className="vw-label">No services at the site.</td></tr>}</tbody>
    </Tbl>
  </>);
}

export function MigrationSecurityPanel(p: StepProps) {
  const a = useM(p); if (!a?.ready || !a.source) return <Wait a={a} goTo={p.goTo} />;
  const bearing = a.rows.filter(r => r.recordType === 'device' && r.dataBearing);
  const certs = p.data.disposalCertificates.filter(c => c.plannerPlanId === p.draft.id);
  const plant = a.rows.filter(r => r.recordType === 'plant');
  return (<>
    <Tiles items={[
      { label: 'Data-bearing devices', value: bearing.length, sub: `${bearing.filter(r => r.disposition === 'move').length} move, ${bearing.filter(r => r.disposition !== 'move').length} sanitised` },
      { label: 'Method', value: 'NIST 800-88', sub: 'purge, or destroy when a drive fails purge' },
      { label: 'Certificates', value: `${certs.filter(c => c.status === 'Issued').length} of ${certs.length}`, sub: 'issued by the disposal vendor' },
      { label: 'Plant to decommission', value: plant.length, sub: plant.map(r => r.label.split(' ')[0]).join(', ') || 'none recorded' },
    ]} />
    <Hint>Chain of custody: drives stay in the locked room until collected in sealed, numbered bags; serials are checked against the certificate list and signed by both sides at each wave. Equipment that moves travels sealed with an escort.</Hint>
  </>);
}

export function MigrationDeliveryPanel(p: StepProps) {
  const a = useM(p); if (!a?.ready || !a.source) return <Wait a={a} goTo={p.goTo} />;
  const items = p.ev!.schedule;
  return (<>
    <Sub>Dates that gate the waves</Sub>
    <Tbl>
      <thead><tr><th>Step</th><th>Do by</th><th>Needed by</th><th>For</th><th /></tr></thead>
      <tbody>{items.map((s, i) => <tr key={i}><td style={{ whiteSpace: 'normal' }}>{s.item}{s.note && <span className="vw-label" style={{ fontSize: 12 }}> · {s.note}</span>}</td><td style={{ whiteSpace: "nowrap" }}>{date(s.orderBy)}</td><td style={{ whiteSpace: "nowrap" }}>{date(s.needBy)}</td><td>{s.phase}</td><td><Chip tone={s.late ? 'error' : 'success'} size="xs" dot>{s.late ? 'Late' : 'In time'}</Chip></td></tr>)}
        {!items.length && <tr><td colSpan={5} className="vw-label">Make the waves first.</td></tr>}</tbody>
    </Tbl>
  </>);
}

export function MigrationWavesPanel(p: StepProps) {
  const a = useM(p); if (!a?.ready || !a.source) return <Wait a={a} goTo={p.goTo} />;
  return (<>
    <WavesEditor {...p} family="migration" />
    <Sub>Customer consent</Sub>
    <ConsentRegister rows={a.consents} readOnly={p.readOnly}
      onChange={rows => p.patch({ consents: rows.map(({ customerRef, customerName, serviceIds, noticeDays, notifiedAt, consentAt, status, accountManager, notes }) => ({ customerRef, customerName, serviceIds, noticeDays, notifiedAt, consentAt, status, accountManager, notes })) })}
      firstWave={c => a.consents.find(x => x.customerRef === c.customerRef)?.firstWave} />
  </>);
}
