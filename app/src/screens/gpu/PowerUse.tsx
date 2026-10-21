import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { getPowerEconomics, useQuery } from '../../api';
import type { GpuJobPowerEcon, PlacementHint, PowerEconomics } from '../../api/types';
import { Loading } from '../../shell/page';
import { SummaryStrip } from '../site/SummaryStrip';
import { Panel, Seg, Chip } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { CustLink, DcLink, IncLink, Meter, SeverityChip } from '../../ui/status';
import { fmtKw, fmtMoney, fmtNum } from '../../lib/format';
import { fmtRate } from '../capacity/PowerEconomics';
import '../../styles/power-econ.css';

/* Power use, round 2 (21-Oct-2026, deck items 3–5): energy and power cost per job and per tenant, power findings against the
   contract, and where the next job should land. All read from mock/power-econ.ts through getPowerEconomics. */

const STATE_WORD: Record<GpuJobPowerEcon['state'], string> = { running: 'Running', slowed: 'Slowed', stalled: 'Stalled', 'at-risk': 'At risk', idle: 'Idle allocation' };

/* ---- GPU Fleet → Cooling & power: energy and cost by job and tenant */
export function GpuJobPower({ dcId }: { dcId?: string }) {
  const nav = useNavigate();
  const { data: e } = useQuery(() => getPowerEconomics(dcId), [dcId]);
  const [view, setView] = useState<'jobs' | 'tenants'>('jobs');
  if (!e) return <Loading />;
  const g = e.gpu;
  if (!g) return null;
  const capped = g.jobs.filter(j => j.cappedGpus > 0);
  const idle = g.jobs.filter(j => j.wasted);
  const capSaves = capped.reduce((a, j) => a + j.capSavesKw, 0), capCostH = capped.reduce((a, j) => a + j.slowdownCostH, 0);
  const idleCostDay = idle.reduce((a, j) => a + j.powerCostDay, 0);
  return (
    <Panel title="Energy and power cost by job" icon={I.ReceiptText} flush
      sub={`${fmtNum(g.jobs.length)} jobs · ${fmtNum(g.tenants.length)} ${g.tenants.length === 1 ? 'tenant' : 'tenants'} · power is ${g.powerSharePct ?? 0}% of what the fleet earns`}
      info="Each job's nodes and their node power, with the site's PUE applied, × the site tariff = what the job costs in power per day, against what its GPUs earn at the model's price. An idle allocation is billed and draws power but does no work. A power cap saves kilowatts on the capped GPUs; if the job is slowed by it, the GPU time lost per hour is shown beside the saving. Click a job for its tenant."
      actions={<Seg size="sm" value={view} onChange={setView} options={[{ id: 'jobs', label: 'By job' }, { id: 'tenants', label: 'By tenant' }]} />}>
      {(capped.length > 0 || idle.length > 0) && (
        <div className="pe-callouts">
          {capped.length > 0 && <div className="pe-callout"><I.Gauge size={15} /><span><b>Power cap trade-off:</b> {capped.length === 1 ? `${capped[0].name} at ${capped[0].dcId}` : `${capped.length} jobs`} run{capped.length === 1 ? 's' : ''} with {fmtNum(capped.reduce((a, j) => a + j.cappedGpus, 0))} capped GPUs. The cap saves <b>{fmtKw(capSaves)}</b>{capCostH ? <> and costs <b className="pe-bad">{fmtMoney(capCostH)}/h</b> of GPU time — lift it</> : ' with no slowdown measured — keep it'}.</span></div>}
          {idle.length > 0 && <div className="pe-callout"><I.PowerOff size={15} /><span><b>Idle allocations:</b> {idle.length} job{idle.length === 1 ? '' : 's'} hold{idle.length === 1 ? 's' : ''} {fmtNum(idle.reduce((a, j) => a + j.gpus, 0))} GPUs doing nothing — <b>{fmtMoney(idleCostDay)}/day</b> of power for no work, while the tenant is billed {fmtMoney(idle.reduce((a, j) => a + j.earningDay, 0))}/day.</span></div>}
        </div>
      )}
      {view === 'jobs' ? (
        <DataTable rows={g.jobs} pageSize={12} defaultSort={{ key: 'cost', dir: 'desc' }} onRow={j => nav(`/customers/${j.customerId}`)} cols={[
          { key: 'job', header: 'Job', sort: j => j.name, render: j => <span className="cell-2"><span className="gpu-strong">{j.name}</span><small>{j.kind} · {j.dcId} {j.cluster} · {j.model}</small></span> },
          { key: 'owner', header: 'Tenant', sort: j => j.owner, render: j => <span className="cell-2"><span>{j.owner}</span>{j.premium && <small>premium</small>}</span> },
          { key: 'state', header: 'State', sort: j => j.state, render: j => <span className={`pe-state is-${j.state}`}><i />{STATE_WORD[j.state]}{j.incidentId && <> · <IncLink id={j.incidentId} /></>}</span> },
          { key: 'gpus', header: 'GPUs', sort: j => j.gpus, render: j => <span className="num">{fmtNum(j.gpus)}</span> },
          { key: 'kw', header: 'Power', sort: j => j.facilityKw, render: j => <span className="cell-2"><span className="num">{fmtKw(j.nodeKw)}</span><small>{fmtKw(j.facilityKw)} with PUE</small></span> },
          { key: 'kwh', header: 'kWh / day', sort: j => j.kwhDay, render: j => <span className="num">{fmtNum(j.kwhDay)}</span> },
          { key: 'cost', header: 'Power / day', sort: j => j.powerCostDay, render: j => <span className={`num${j.wasted ? ' bad' : ''}`}>{fmtMoney(j.powerCostDay)}</span> },
          { key: 'earn', header: 'Earns / day', sort: j => j.earningDay, render: j => <span className="num">{fmtMoney(j.earningDay)}</span> },
          { key: 'share', header: 'Power share', sort: j => j.powerSharePct ?? -1, render: j => j.powerSharePct === null ? <span className="faint">—</span> : <span className="pe-sharecell"><span className="pe-share"><i style={{ width: `${Math.min(100, j.powerSharePct)}%`, background: j.powerSharePct >= 30 ? 'var(--vw-color-red-400)' : j.powerSharePct >= 15 ? 'var(--vw-color-amber-400)' : 'var(--primaryColor400)' }} /></span><span className="num nowrap">{j.powerSharePct}%</span></span> },
          { key: 'cap', header: 'Power cap', sort: j => j.cappedGpus, render: j => j.cappedGpus ? <span className="cell-2"><span className="num">{j.cappedGpus} GPUs · saves {fmtKw(j.capSavesKw)}</span><small className={j.slowdownCostH ? 'pe-bad' : ''}>{j.slowdownCostH ? `costs ${fmtMoney(j.slowdownCostH)}/h` : 'no slowdown'}</small></span> : <span className="faint">—</span> }
        ]} />
      ) : (
        <DataTable rows={g.tenants.map(t => ({ ...t, id: t.customerId }))} pageSize={12} defaultSort={{ key: 'cost', dir: 'desc' }} onRow={t => nav(`/customers/${t.customerId}`)} cols={[
          { key: 'name', header: 'Tenant', sort: t => t.name, render: t => <span className="cell-2"><CustLink id={t.customerId}>{t.name}</CustLink>{t.premium && <small>premium</small>}</span> },
          { key: 'jobs', header: 'Jobs', sort: t => t.jobs, render: t => <span className="num">{t.jobs}</span> },
          { key: 'gpus', header: 'GPUs', sort: t => t.gpus, render: t => <span className="num">{fmtNum(t.gpus)}</span> },
          { key: 'kw', header: 'Power', sort: t => t.nodeKw, render: t => <span className="num">{fmtKw(t.nodeKw)}</span> },
          { key: 'kwh', header: 'kWh / day', sort: t => t.kwhDay, render: t => <span className="num">{fmtNum(t.kwhDay)}</span> },
          { key: 'cost', header: 'Power / day', sort: t => t.powerCostDay, render: t => <span className="num">{fmtMoney(t.powerCostDay)}</span> },
          { key: 'earn', header: 'Billed / day', sort: t => t.earningDay, render: t => <span className="num">{fmtMoney(t.earningDay)}</span> },
          { key: 'share', header: 'Power share', sort: t => t.powerSharePct ?? -1, render: t => <span className="num">{t.powerSharePct !== null ? `${t.powerSharePct}%` : '—'}</span> },
          { key: 'idle', header: 'Idle power / day', sort: t => t.idleCostDay, render: t => <span className={`num${t.idleCostDay ? ' bad' : ' faint'}`}>{t.idleCostDay ? fmtMoney(t.idleCostDay) : '—'}</span> }
        ]} />
      )}
    </Panel>
  );
}

/* ---- Capacity → Power economics: findings against the contract, each with its alarm and incident */
export function PowerFindings({ e }: { e: PowerEconomics }) {
  const nav = useNavigate();
  if (!e.anomalies.length) return null;
  const total = e.anomalies.reduce((a, x) => a + x.exposure, 0);
  return (
    <Panel title="Power findings against the contracts" icon={I.TriangleAlert} count={e.anomalies.length} flush
      sub={`${fmtMoney(total)} of exposure · each finding raised an alarm; the costliest opened an incident`}
      info="Checks of the live meter against each site's power contract: a colocation block drawn to 85% or more (overage bills at 1.5× the block rate), a new 12-month demand peak above the take-or-pay floor (the demand charge ratchets for a year), a draw more than 12% above the 24 h mean with no change in progress and no job started, and a block more than 30% idle. The generator raises one alarm per finding and an incident for the costliest contract finding. Click a row to open the site's power path.">
      <table className="nst-table dt-table pe-findings"><thead><tr><th>Finding</th><th>Datacenter</th><th>Exposure</th><th>Evidence</th><th>Alarm · incident</th></tr></thead>
        <tbody>{e.anomalies.map(a => (
          <tr key={a.id} className="is-click" onClick={() => nav(a.to)}>
            <td><span className="cell-2"><span className="row" style={{ gap: 8 }}><SeverityChip s={a.severity} size="xs" /><span className="gpu-strong">{a.title}</span></span><small className="pe-wrap">{a.detail}</small></span></td>
            <td><DcLink id={a.dcId} /></td>
            <td><span className="cell-2"><span className="num">{fmtMoney(a.exposure)}</span><small>{a.exposureLabel}</small></span></td>
            <td><span className="pe-evidence">{a.evidence.map(x => <span key={x.label}><small>{x.label}</small><b className="num">{x.value}</b></span>)}</span></td>
            <td onClick={ev => ev.stopPropagation()}><span className="cell-2">{a.alertId ? <a className="ent-link mono" href={`/alerts?q=${encodeURIComponent(a.title)}`}>{a.alertId}</a> : <span className="faint">—</span>}{a.incidentId ? <small><IncLink id={a.incidentId} /></small> : <small className="faint">alarm only</small>}</span></td>
          </tr>
        ))}</tbody></table>
    </Panel>
  );
}

/* ---- GPU Fleet → Where to place: pods ranked for the next job */
const SIZES = [8, 32, 64, 128, 256] as const;
export function Placement({ dcId }: { dcId?: string }) {
  const nav = useNavigate();
  const { data: e } = useQuery(() => getPowerEconomics(dcId), [dcId]);
  const [model, setModel] = useState('');
  const [size, setSize] = useState<number>(64);
  const g = e?.gpu;
  const models = useMemo(() => [...new Set((g?.placement ?? []).map(p => p.model))].sort(), [g]);
  if (!e) return <Loading />;
  if (!g) return null;
  const rows = g.placement.filter(p => (!model || p.model === model)).map(p => ({ ...p, id: p.clusterId, fits: p.freeGpus >= size && p.fit !== 'no' }));
  const fitting = rows.filter(r => r.fits);
  const best = fitting[0];
  const paid = fitting.filter(r => r.paidIdleKw > 0);
  const freeTotal = rows.reduce((a, r) => a + r.freeGpus, 0);
  const fitWord = (f: PlacementHint['fit']) => (f === 'good' ? 'Good fit' : f === 'tight' ? 'Tight' : 'Not now');
  return (
    <div className="col" style={{ gap: 16 }}>
      <section className="vw-card-section pe-place-ask">
        <div className="pe-place-q"><I.MapPinned size={18} /><b>Where should the next job go?</b><span className="muted">Pods with free GPUs, ranked by rack, cooling and contract headroom and the marginal power cost of a GPU-hour</span></div>
        <div className="pe-place-ctl">
          <label>GPUs needed<Seg size="sm" value={String(size)} onChange={v => setSize(Number(v))} options={SIZES.map(n => ({ id: String(n), label: String(n) }))} /></label>
          <label>Model<select className="select" value={model} onChange={ev => setModel(ev.target.value)} aria-label="GPU model"><option value="">Any model</option>{models.map(m => <option key={m} value={m}>{m}</option>)}</select></label>
        </div>
      </section>
      <SummaryStrip items={[
        { key: 'fit', label: 'Pods that fit', value: `${fitting.length} of ${rows.length}`, sub: `${fmtNum(size)} GPUs${model ? ` · ${model}` : ''}`, info: 'Pods with at least the GPUs asked for free on healthy nodes, whose cooling is not in fault.' },
        { key: 'best', label: 'Best placement', value: best ? `${best.dcId} · ${best.name}` : '—', sub: best ? `${best.model} · ${fmtRate(best.marginalCostPerGpuHour, 3)} per GPU-h in power` : 'nothing fits this ask', info: 'The first fitting pod: good fit before tight, power already paid for before not, then the lowest marginal power cost per GPU-hour, then the most free GPUs.' },
        { key: 'paid', label: 'On power already paid', value: `${paid.length} pods`, sub: paid.length ? `${fmtKw(paid.reduce((a, r) => a + r.paidIdleKw, 0))} committed and idle there` : 'every fitting pod adds capacity cost', info: 'Pods at a colocation site whose block is partly idle, or a utility site still under its take-or-pay floor: the next kilowatt there costs energy only.' },
        { key: 'free', label: 'Free GPUs', value: fmtNum(freeTotal), sub: `across ${rows.length} pods${model ? ` of ${model}` : ''}`, info: 'Healthy nodes with no job, × 8 GPUs.' },
        { key: 'cheap', label: 'Cheapest power', value: fitting.length ? fmtRate(Math.min(...fitting.map(r => r.marginalCostPerGpuHour)), 3) : '—', sub: fitting.length ? `to ${fmtRate(Math.max(...fitting.map(r => r.marginalCostPerGpuHour)), 3)} per GPU-hour` : '', info: 'Marginal power cost of one more GPU-hour in a fitting pod: the pod\'s kW per busy GPU × site PUE × tariff.' }
      ]} />
      <Panel title="Pods ranked for this placement" icon={I.ListOrdered} flush
        info="Fit: Good = free GPUs with rack, cooling and contracted headroom; Tight = one of those is short (racks over 90% of budget, cooling degraded, less contracted headroom than the added load); Not now = no free healthy nodes or a cooling loop in fault. Rows that cannot take the GPUs asked for are greyed. Click a pod to open its cluster.">
        <DataTable rows={rows} pageSize={15} onRow={p => nav(`/gpu?dc=${p.dcId}&gtab=clusters`)} rowClass={p => (p.fits ? '' : 'pe-dim')} cols={[
          { key: 'rank', header: '#', render: p => <span className="num faint">{rows.indexOf(p) + 1}</span> },
          { key: 'pod', header: 'Pod', sort: p => `${p.dcId} ${p.name}`, render: p => <span className="cell-2 nowrap"><span className="gpu-strong">{p.dcId} · {p.name}{p.cooling === 'liquid' && <I.Droplets size={12} style={{ marginLeft: 6, verticalAlign: -1 }} />}</span><small>{p.model} · {p.scheduler}</small></span> },
          { key: 'fit', header: 'Fit', sort: p => p.fit, render: p => <Chip tone={p.fit === 'good' ? 'success' : p.fit === 'tight' ? 'warning' : 'error'} size="xs">{fitWord(p.fit)}</Chip> },
          { key: 'free', header: 'Free GPUs', sort: p => p.freeGpus, render: p => <span className={`num${p.freeGpus < size ? ' pe-bad' : ''}`}>{fmtNum(p.freeGpus)}</span> },
          { key: 'rack', header: 'Rack power', sort: p => p.rackLoadPct, render: p => <Meter pct={p.rackLoadPct} width={56} warnAt={90} label={`${p.rackLoadPct}% · ${fmtKw(p.rackHeadroomKw)} free`} /> },
          { key: 'cool', header: 'Cooling', sort: p => p.coolingHeadroomPct, render: p => <span className="cell-2"><span className={p.coolingState === 'ok' ? '' : p.coolingState === 'warn' ? 'gpu-warn' : 'gpu-bad'}>{p.coolingState === 'ok' ? 'Normal' : p.coolingState === 'warn' ? 'Degraded' : 'Fault'}</span><small>{p.coolingHeadroomPct}% headroom · {p.cooling}</small></span> },
          { key: 'site', header: 'Contracted headroom', sort: p => p.siteHeadroomKw, render: p => <span className="cell-2"><span className="num">{fmtKw(p.siteHeadroomKw)}</span>{p.paidIdleKw > 0 ? <small className="pe-good">{fmtKw(p.paidIdleKw)} already paid</small> : <small>adds capacity cost</small>}</span> },
          { key: 'marg', header: 'Power / GPU-h', sort: p => p.marginalCostPerGpuHour, render: p => <span className="cell-2"><span className="num">{fmtRate(p.marginalCostPerGpuHour, 3)}</span><small>PUE {p.pue} · {fmtRate(p.tariff, p.tariff < 1 ? 3 : 2)}/kWh</small></span> },
          { key: 'why', header: 'Why', render: p => <span className="pe-wrap small">{p.why.join(' · ')}</span> }
        ]} />
      </Panel>
    </div>
  );
}
