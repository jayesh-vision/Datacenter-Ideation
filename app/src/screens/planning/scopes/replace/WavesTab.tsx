/* Plan page tab "Waves and closure": close each wave once it is done (the records follow: old equipment out, new equipment active,
   services repointed, racks and holds updated, a disposal certificate), mark certificates issued, and see the closure checklist read
   live. Migrations also record the final meter reading and retire the site when everything else is green. */
import { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip, Field, Modal, Panel } from '../../../../ui/kit';
import { SummaryStrip } from '../../../site/SummaryStrip';
import type * as T from '../../../../planner/p2b/types';
import { closeWave, issueCertificate, replaceCloseout, type RecordChanges } from '../../../../planner/lib/replaceClose';
import { closeMigrationWave, migrationCloseout, retireSite } from '../../../../planner/lib/migrationCore';
import { WAVE_STATUS_TONE } from '../../../../planner/lib/waves';
import { usePlannerActions } from '../../../../planner/lib/usePlanner';
import { message } from '../../../../planner/compat/notify';
import { CheckLabel, NumInput, TextArea, TextInput, date, num } from '../../common';
import type { PlanViewProps } from '../types';
import { extraRecords, fmtWhen, idFor, nowIso, useApplyChanges } from './model';
import { Link } from 'react-router-dom';
import { Checklist, Tbl, deliveryProjectOf, inDelivery, waveScope } from './shared';
import { WaveTimeline } from './drawings';

interface CloseForm { downtime?: number; notes: string; cert: string; atp: boolean }
const EMPTY: CloseForm = { notes: '', cert: '', atp: false };

export function WavesTab({ plan, ev, data, family }: PlanViewProps & { family: 'replace' | 'migration' }) {
  const apply = useApplyChanges(); const actions = usePlannerActions();
  const [closing, setClosing] = useState<T.PlannerWave | undefined>();
  const [form, setForm] = useState<CloseForm>(EMPTY);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [meter, setMeter] = useState<number | undefined>(typeof plan.params.finalMeterReadingKwh === 'number' ? plan.params.finalMeterReadingKwh : undefined);
  const [retiring, setRetiring] = useState(false);
  const [at] = useState(nowIso);
  const waves = [...(plan.waves ?? [])].sort((a, b) => a.order - b.order);
  const live = waves.filter(w => w.status !== 'Cancelled');
  const certs = data.disposalCertificates.filter(c => c.plannerPlanId === plan.id);
  const checks = family === 'replace' ? replaceCloseout(plan, data) : migrationCloseout(plan, data);
  const executing = plan.status === 'Executing';
  /** Records that follow the work (meter reading, site retirement) can still be set after the handover completed the plan. */
  const recordable = executing || plan.status === 'Completed';
  const handover = inDelivery(plan); const prj = deliveryProjectOf(plan);
  const atHand = handover ? checks.filter(c => !c.ok).length : 0;
  const input = (when: string, ids: (e: string, p: string) => string) => ({ at: when, by: actions.actor, actualDowntimeMin: form.downtime, notes: form.notes || undefined, certificateRef: form.cert.trim() || undefined, atpAccepted: form.atp, idFor: ids, extra: extraRecords() });
  const preview: RecordChanges | undefined = useMemo(() => {
    if (!closing) return undefined;
    const q = input(at, (_e, p) => `${p}-new`);
    return family === 'replace' ? closeWave(plan, closing.id, data, q) : closeMigrationWave(plan, closing.id, data, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing, form, plan, data, family, at]);
  const confirm = () => {
    if (!closing) return;
    const q = input(nowIso(), idFor);
    const res = family === 'replace' ? closeWave(plan, closing.id, data, q) : closeMigrationWave(plan, closing.id, data, q);
    if (res.errors.length) { message.error(res.errors.join('; ')); return; }
    if (!apply(plan, res, `${closing.name} closed`).ok) return;
    message.success(`${closing.name} closed: ${res.summary.join('; ')}`);
    for (const w of res.warnings) message.warning(w);
    setClosing(undefined); setForm(EMPTY);
  };
  const issue = (c: T.DisposalCertificate) => {
    const ref = refs[c.id]?.trim(); if (!ref) { message.error('Enter the vendor certificate reference.'); return; }
    if (apply(plan, issueCertificate(c, ref, nowIso()), `Certificate ${c.certId} issued`).ok) message.success(`Certificate ${c.certId} issued.`);
  };
  const retire = family === 'migration' ? retireSite(plan, data, at) : undefined;
  const doRetire = () => { const res = retireSite(plan, data, nowIso()); setRetiring(false); if (res.errors.length) { message.error(res.errors.join('; ')); return; } if (apply(plan, res, 'Site retired').ok) message.success(res.summary.join('; ')); };
  const recordMeter = () => { if (meter === undefined) return; if (apply(plan, { creates: [], updates: [], plan: { params: { ...plan.params, finalMeterReadingKwh: meter } }, errors: [], warnings: [], summary: [`Final meter reading ${num(meter)} kWh`], tasks: [] }, 'Final meter reading').ok) message.success('Final meter reading recorded.'); };
  const closed = live.filter(w => w.status === 'Closed').length;
  const issued = certs.filter(c => c.status === 'Issued').length;
  const done = checks.filter(c => c.ok).length;

  return (
    <div className="col" style={{ gap: 14 }}>
      <SummaryStrip items={[
        { key: 'waves', label: 'Waves closed', value: `${closed} of ${live.length}`, sub: live.length && closed === live.length ? 'all done' : executing ? 'close each when done' : undefined, info: 'A wave is closed after its window: the records follow what was done (old equipment out, new equipment active, services repointed).' },
        { key: 'certs', label: 'Certificates issued', value: `${issued} of ${certs.length}`, tone: certs.some(c => c.status !== 'Issued') ? 'warn' : undefined, sub: certs.length ? (issued === certs.length ? 'chain of custody complete' : 'waiting for the vendor') : 'none yet', info: 'Disposal certificates from the vendor for wiped or destroyed equipment, one per wave with disposal.' },
        { key: 'checks', label: 'Closure checks', value: `${done} of ${checks.length}`, sub: checks.length && done === checks.length ? 'all done' : handover ? `${atHand} set at the handover` : 'all needed to complete', info: 'Read live from the platform records; the plan can be completed only when every check is done.' },
        { key: 'plan', label: 'Plan', value: plan.status, sub: executing ? 'waves can be closed' : plan.status === 'Approved' ? 'start the build first' : undefined, info: 'Waves are closed while the plan is executing.' },
      ]} />
      {(plan.waves ?? []).length > 0 && <Panel icon={I.CalendarRange} title="Wave plan" info="Every wave on a dated axis, coloured by what it does, with its window, what it touches and its change; today and the plan's target or exit date. Hover a wave for its method."><WaveTimeline plan={plan} ev={ev} /></Panel>}
      <Panel flush icon={I.Waves} title="Waves" count={waves.length} info="Each wave of the plan with its window, change, acceptance test and status. Closing a wave updates the platform records and creates a disposal certificate where equipment is disposed of."
        foot={<span className="vw-label" style={{ fontSize: 12 }}>{handover ? <>Close each wave as it is done. When <Link className="ent-link mono" to={`/delivery/projects/${prj}`}>{prj}</Link> is handed over to operations in Delivery, the waves still open are closed and the plan is completed.</> : plan.status === 'Completed' ? 'The plan was completed: every wave was closed at the handover.' : 'Waves are closed while the plan is executing.'}</span>}>
        <Tbl>
          <thead><tr><th>Wave</th><th>Window</th><th>Scope</th><th>Change</th><th>Test</th><th>Status</th><th>Closed</th><th /></tr></thead>
          <tbody>{waves.map(w => { const atp = w.atpId ? data.atps.find(x => x.id === w.atpId) : undefined; return (
            <tr key={w.id}>
              <td><span className="strong">{w.name}</span></td><td>{fmtWhen(w.windowStart)}</td><td>{waveScope(w)}</td>
              <td>{w.changeRequestId ? <span className="mono">{w.changeRequestId}</span> : '—'}{w.maintenanceWindowId && <span className="vw-label"> · {w.maintenanceWindowId}</span>}</td>
              <td>{atp ? <Chip tone={atp.status === 'Accepted' ? 'success' : 'warning'} size="xs">{atp.id} · {atp.status}</Chip> : '—'}</td>
              <td><Chip tone={WAVE_STATUS_TONE[w.status]} size="xs" dot>{w.status}</Chip></td>
              <td>{w.closedAt ? `${date(w.closedAt)} by ${w.closedBy}${w.actualDowntimeMin !== undefined ? ` · ${w.actualDowntimeMin} min down` : ''}` : '—'}</td>
              <td>{w.status !== 'Closed' && w.status !== 'Cancelled' && <Btn size="sm" disabled={!executing} title={executing ? undefined : 'Waves are closed while the plan is executing'} onClick={() => { setForm(EMPTY); setClosing(w); }}>Close wave</Btn>}</td>
            </tr>
          ); })}{!waves.length && <tr><td colSpan={8} className="vw-label">No waves on this plan.</td></tr>}</tbody>
        </Tbl>
      </Panel>
      <Panel flush icon={I.FileBadge} title="Disposal certificates" count={certs.length} info="Certificates of data sanitisation or disposal for the equipment each wave retires; mark one issued with the vendor's reference.">
        <Tbl>
          <thead><tr><th>Certificate</th><th>Wave</th><th>Method</th><th>Items</th><th>Collected</th><th>Status</th><th>Reference</th></tr></thead>
          <tbody>{certs.map(c => <tr key={c.id}><td className="mono">{c.certId}</td><td>{waves.find(w => w.id === c.plannerWaveId)?.name ?? c.plannerWaveId ?? '—'}</td><td>{c.method}</td><td className="num">{c.items.length}</td><td>{c.collectedAt ? date(c.collectedAt) : '—'}</td><td><Chip tone={c.status === 'Issued' ? 'success' : 'warning'} size="xs" dot>{c.status}</Chip></td>
            <td>{c.status === 'Issued' ? <span className="mono">{c.reference}</span> : <span className="row" style={{ gap: 6 }}><TextInput value={refs[c.id] ?? ''} placeholder="Vendor reference" style={{ width: 170 }} onChange={v => setRefs({ ...refs, [c.id]: v })} /><Btn size="sm" disabled={!refs[c.id]?.trim()} onClick={() => issue(c)}>Mark issued</Btn></span>}</td></tr>)}
            {!certs.length && <tr><td colSpan={7} className="vw-label">A certificate is created when a wave with disposal is closed.</td></tr>}</tbody>
        </Tbl>
      </Panel>
      <Panel flush icon={I.ListChecks} title="Closure checklist" sub="Read live from the platform" count={`${done}/${checks.length}`} info="What must be true before the plan can be completed: every wave closed, records updated, certificates issued and, for a migration, the site emptied and retired."
        foot={family === 'migration' ? (
          <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5 }}>Final meter reading</span>
            <NumInput value={meter} min={0} unit="kWh" style={{ width: 190 }} onChange={setMeter} />
            <Btn size="sm" disabled={meter === undefined || !recordable} onClick={recordMeter}>Record</Btn>
            <span style={{ flex: 1 }} />
            {!!retire?.errors.length && <span className="vw-label" style={{ fontSize: 12 }}>Retiring is allowed when every other check is done.</span>}
            <Btn size="sm" variant="danger" disabled={!recordable || !!retire?.errors.length} onClick={() => setRetiring(true)}>Retire site</Btn>
          </div>
        ) : undefined}>
        <Checklist checks={checks} atHandover={handover} />
      </Panel>

      <Modal open={!!closing} onClose={() => setClosing(undefined)} title={closing ? `Close ${closing.name}` : ''} sub={closing ? fmtWhen(closing.windowStart) : undefined} width={640}
        foot={<div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><Btn onClick={() => setClosing(undefined)}>Keep it open</Btn><Btn variant="filled" disabled={!!preview?.errors.length} onClick={confirm}>Close wave</Btn></div>}>
        {closing && (<div className="col" style={{ gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Actual downtime"><NumInput value={form.downtime} min={0} unit="minutes" onChange={v => setForm({ ...form, downtime: v })} /></Field>
            <Field label="Disposal certificate reference" hint="Leave empty when the vendor has not issued it yet"><TextInput value={form.cert} onChange={v => setForm({ ...form, cert: v })} /></Field>
          </div>
          <Field label="Notes"><TextArea rows={2} value={form.notes} onChange={v => setForm({ ...form, notes: v })} /></Field>
          {closing.atpId && <CheckLabel on={form.atp} onChange={v => setForm({ ...form, atp: v })} label={`The acceptance test ${closing.atpId} was witnessed and passed`} />}
          {preview && (<div className="col" style={{ gap: 6, fontSize: 12.5 }}>
            {preview.errors.map(e => <p key={e} className="note note--bad" style={{ margin: 0 }}><I.TriangleAlert size={15} /><span>{e}</span></p>)}
            {preview.summary.length > 0 && <div><b>What changes:</b> {preview.summary.join('; ')}.</div>}
            {preview.updates.length + preview.creates.length > 0 && <div className="vw-label">{preview.updates.length} records updated, {preview.creates.length} created.</div>}
            {preview.tasks.length > 0 && <div><b>Also do:</b> {preview.tasks.join('; ')}.</div>}
          </div>)}
        </div>)}
      </Modal>
      <Modal open={retiring} onClose={() => setRetiring(false)} title="Retire the site?" width={480}
        foot={<div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><Btn onClick={() => setRetiring(false)}>Not yet</Btn><Btn variant="danger" onClick={doRetire}>Retire site</Btn></div>}>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>The datacenter and its racks are set to Retired. This is the last step of the plan.</p>
      </Modal>
    </div>
  );
}
