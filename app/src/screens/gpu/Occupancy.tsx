/* GPU Fleet → Occupancy (30-Oct-2026, user: RunPod / Vast.ai sell GPU time; we only watched the hardware).
   How the installed GPUs are sold right now: by model and by site (or pod), the last 24 h, then the instances customers are
   running (reserved · on-demand · spot), the spot instances taken back in the last 24 h and the customers behind them.
   Everything comes from GpuView.market (mock/gpu-market.ts); money is the flat GPU-hour rate. */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import type { GpuInstance, GpuMarket, GpuOccupancyRow, GpuPreemption, GpuReadiness, GpuSellTier } from '../../api/types';
import type { GpuView } from '../../mock/gpu-view';
import { usePersona } from '../../api';
import { SummaryStrip } from '../site/SummaryStrip';
import { Chip, Panel, Seg } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar } from '../../ui/ListToolbar';
import { CustLink, IncLink, Meter } from '../../ui/status';
import { Split } from '../../ui/Analytics';
import { TimeChart } from '../../charts/TimeChart';
import { gpuName, gpuSpec } from '../../lib/gpuSpec';
import { fmtAgo, fmtMoney, fmtNum } from '../../lib/format';
import { downloadCsv } from '../ops/shared';
import { StateChip, VendorTag } from '../Gpu';

const short = (id: string) => id.replace(/^[A-Z]{2}-DC-\d{3}-/, '');
const perH = (n: number) => `${fmtMoney(n)}/h`;
export const TIER_LABEL: Record<GpuSellTier, string> = { reserved: 'Reserved', 'on-demand': 'On-demand', spot: 'Spot' };
const TIER_TONE = { reserved: 'info', 'on-demand': 'cyan', spot: 'purple' } as const;
export const TierChip = ({ t }: { t: GpuSellTier }) => <Chip tone={TIER_TONE[t]} size="xs">{TIER_LABEL[t]}</Chip>;
const READY_TONE: Record<GpuReadiness['status'], 'success' | 'warning' | 'neutral' | 'error'> = { Sellable: 'success', 'Held back': 'warning', 'Burn-in': 'neutral', Hold: 'neutral', 'Out of service': 'error' };
export const ReadyChip = ({ r }: { r: GpuReadiness }) => <Chip tone={READY_TONE[r.status]} size="xs" title={r.why.join(' · ') || undefined}>{r.status}</Chip>;

type View = 'instances' | 'interruptions' | 'customers';

export function Occupancy({ v, onNode }: { v: GpuView; onNode: (id: string) => void }) {
  const m = v.market;
  const { vocab: V } = usePersona();
  const [sp, setSp] = useSearchParams();
  const view = ((['instances', 'interruptions', 'customers'] as View[]).includes(sp.get('oview') as View) ? sp.get('oview') : 'instances') as View;
  const set = (k: string, x: string) => { const n = new URLSearchParams(sp); x ? n.set(k, x) : n.delete(k); setSp(n, { replace: true }); };
  const [filterTier, setTier] = useState<string>('');
  if (!m) return null;
  const soldOutModels = m.byModel.filter(r => r.soldOut);
  const held = m.heldBack;
  const hours = Array.from({ length: 24 }, (_, h) => `${String((new Date(v.now).getHours() - 23 + h + 48) % 24).padStart(2, '0')}:00`);
  const goHeld = () => { const n = new URLSearchParams(sp); n.set('gtab', 'nodes'); n.set('gview', 'held'); n.delete('oview'); setSp(n, { replace: true }); };
  return (
    <div className="col gpu-occ" style={{ gap: 16 }}>
      <SummaryStrip items={[
        { key: 'occ', label: 'Occupancy', value: `${m.occupancyPct}%`, sub: `${fmtNum(m.sold)} of ${fmtNum(m.sellable)} sellable sold`, info: 'GPUs sold (in a reserved, on-demand or spot instance) ÷ GPUs that can be sold (sold + available). Held-back, drained, failed and burn-in nodes are not sellable and do not count.' },
        { key: 'sale', label: 'For sale now', value: fmtNum(m.available), sub: m.available ? `${fmtMoney(m.unsoldPerDay)}/day not earned` : 'nothing left to sell', tone: m.available > m.sellable * 0.2 ? 'warn' : undefined, info: 'Healthy spare GPUs that passed burn-in, benchmark and reliability, with no customer on them. The money is what they would earn at the GPU-hour rate over 24 h.' },
        { key: 'sold', label: 'Sold', value: fmtNum(m.sold), sub: `${fmtNum(m.reserved)} res · ${fmtNum(m.onDemand)} od · ${fmtNum(m.spot)} spot`, info: `GPUs in customer instances by tier: reserved = ${V.premium.toLowerCase()} customers with a committed contract, on-demand = pay as you go, spot = interruptible capacity that is reclaimed when a reserved customer needs it.` },
        { key: 'held', label: 'Held back', value: fmtNum(held), sub: held ? `${m.readiness['Held back']} spare nodes below the bar` : 'every spare node fit to sell', tone: held ? 'warn' : undefined, onClick: goHeld, info: 'Spare GPUs kept off the market: the node re-tested below 95% of its model\'s benchmark reference or its 30-day reliability is under 99%. Click opens those nodes.' },
        { key: 'out', label: 'Sold out', value: soldOutModels.length, sub: soldOutModels.length ? soldOutModels.map(r => gpuSpec(r.model!).short).join(', ') : 'every model has capacity', tone: soldOutModels.length ? 'warn' : undefined, info: 'Models with no GPU left for sale in this scope. A customer asking for one of them waits or takes another model.' },
        { key: 'int', label: 'Interruptions · 24 h', value: m.interruptions24h, sub: m.interruptions24h ? `${m.gpuHoursLost24h} GPU-h of work lost` : 'no spot instance taken back', tone: m.interruptions24h ? 'warn' : undefined, onClick: () => set('oview', 'interruptions'), active: view === 'interruptions', info: 'Spot instances reclaimed in the last 24 h (for a reserved customer, a firmware drain or a node failure) and the work their customers lost since the last checkpoint. Click lists them.' }
      ]} />

      <div className="gpu-occ-grid">
        <Panel title="Occupancy by model" icon={I.Cpu} flush info="One row per accelerator model: how its GPUs split between sold tiers, available for sale, held back and out of service; occupancy = sold ÷ sellable. Sold out = none left for sale. Click a row for its nodes.">
          <OccTable rows={m.byModel} kind="model" compact onRow={r => { const n = new URLSearchParams(sp); n.set('gtab', 'nodes'); n.set('gmodel', r.model!); n.delete('oview'); setSp(n, { replace: true }); }} />
        </Panel>
        <Panel title="Last 24 hours" icon={I.Activity} info="Share of in-service GPUs that were sold in each of the last 24 hours (a node whose utilisation was above 5% in that hour was sold), ending on the current reading.">
          <TimeChart labels={hours} height={200} yMin={0} yMax={100} format={x => `${Math.round(x)}%`} series={[{ key: 'occ', label: 'Occupied %', color: 'var(--primaryColor500)', kind: 'area', values: m.series }]} legend={false} />
          <div className="gpu-occ-facts"><span><em>Lowest</em><b className="num">{Math.min(...m.series)}%</b></span><span><em>Highest</em><b className="num">{Math.max(...m.series)}%</b></span><span><em>Now</em><b className="num">{m.series[23]}%</b></span></div>
        </Panel>
      </div>

      <Panel title={m.placeKind === 'site' ? 'Occupancy by datacenter' : 'Occupancy by pod'} icon={m.placeKind === 'site' ? I.Building2 : I.LayoutGrid} flush info={m.placeKind === 'site' ? 'The same split per datacenter. Click a row to scope GPU Fleet to that site.' : 'The same split per pod (cluster) at this site. Click a row for the pod\'s nodes.'}>
        <OccTable rows={m.byPlace} kind={m.placeKind} onRow={r => { const n = new URLSearchParams(sp); if (m.placeKind === 'site') { n.set('dc', r.dcId!); n.set('gtab', 'occupancy'); } else { n.set('gtab', 'clusters'); n.delete('oview'); } setSp(n, { replace: true }); }} />
      </Panel>

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Seg value={view} onChange={x => set('oview', x === 'instances' ? '' : x)} options={[{ id: 'instances', label: `Instances · ${m.instances.length}` }, { id: 'interruptions', label: `Interruptions · ${m.preemptions.length}` }, { id: 'customers', label: `${V.customers} · ${m.customers.length}` }]} />
        <span className="vw-label">Rates are the flat GPU-hour rate; tier prices (reserved · on-demand · spot) come from the BSS catalogue — to discuss.</span>
      </div>
      {view === 'instances' && <Instances m={m} v={v} tier={filterTier} setTier={setTier} onNode={onNode} />}
      {view === 'interruptions' && <Interruptions m={m} v={v} onNode={onNode} />}
      {view === 'customers' && <Customers m={m} />}
    </div>
  );
}

function OccTable({ rows, kind, compact, onRow }: { rows: GpuOccupancyRow[]; kind: 'model' | 'site' | 'pod'; compact?: boolean; onRow: (r: GpuOccupancyRow) => void }) {
  const cols: Col<GpuOccupancyRow & { id: string }>[] = [
    { key: 'what', header: kind === 'model' ? 'Model' : kind === 'site' ? 'Datacenter' : 'Pod', sort: r => r.label, render: r => <span className="cell-2"><span className="nowrap gpu-strong">{kind === 'model' ? <><VendorTag v={r.vendor!} /> {gpuSpec(r.model!).short}</> : r.label}</span><small className="nowrap">{kind === 'model' ? r.model : r.sub}</small></span> },
    { key: 'inst', header: 'Installed', sort: r => r.installed, render: r => <span className="num">{fmtNum(r.installed)}</span> },
    { key: 'split', header: 'How they are used', render: r => <span className="gpu-occ-split"><Split legend={false} parts={[
      { key: 'r', label: 'Reserved', n: r.reserved, tone: 'info' }, { key: 'o', label: 'On-demand', n: r.onDemand, tone: 'cyan' }, { key: 's', label: 'Spot', n: r.spot, tone: 'purple' },
      { key: 'a', label: 'For sale', n: r.available, tone: 'neutral' }, { key: 'h', label: 'Held back', n: r.heldBack, tone: 'warning' }, { key: 'x', label: 'Out of service', n: r.out, tone: 'error' }]} /></span> },
    { key: 'occ', header: 'Occupancy', sort: r => r.occupancyPct, render: r => <Meter pct={r.occupancyPct} width={64} label={`${r.occupancyPct}%`} /> },
    { key: 'sold', header: 'Sold', sort: r => r.sold, render: r => <span className="cell-2"><span className="num">{fmtNum(r.sold)}</span><small className="nowrap" title="reserved · on-demand · spot">{fmtNum(r.reserved)} · {fmtNum(r.onDemand)} · {fmtNum(r.spot)}</small></span> },
    { key: 'avail', header: 'For sale', sort: r => r.available, render: r => (r.soldOut ? <Chip tone="warning" size="xs">Sold out</Chip> : <span className="cell-2"><span className="num">{fmtNum(r.available)}</span><small className="nowrap">{fmtMoney(r.unsoldPerDay)} / day</small></span>) },
    ...(compact ? [] : [
      { key: 'held', header: 'Held back', sort: (r: GpuOccupancyRow) => r.heldBack, render: (r: GpuOccupancyRow) => <span className={`num${r.heldBack ? ' gpu-warn' : ' faint'}`}>{r.heldBack || '—'}</span> },
      { key: 'int', header: 'Interruptions 24 h', hideBelow: 1360, sort: (r: GpuOccupancyRow) => r.interruptions24h, render: (r: GpuOccupancyRow) => <span className={`num${r.interruptions24h ? '' : ' faint'}`}>{r.interruptions24h || '—'}</span> }] as Col<GpuOccupancyRow & { id: string }>[])
  ];
  return <DataTable rows={rows.map(r => ({ ...r, id: r.key }))} cols={cols} onRow={onRow} pageSize={rows.length > 12 ? 12 : undefined} />;
}

const Legend = () => <span className="gpu-legend gpu-occ-legend">{(['reserved', 'on-demand', 'spot'] as GpuSellTier[]).map(t => <span key={t}><TierChip t={t} /></span>)}<span><i style={{ background: 'var(--vw-color-slate-200)' }} />For sale</span><span><i style={{ background: 'var(--vw-color-amber-300)' }} />Held back</span><span><i style={{ background: 'var(--vw-color-red-300)' }} />Out of service</span></span>;

type InstR = GpuInstance & { owner: string; premium: boolean };
function Instances({ m, v, tier, setTier, onNode }: { m: GpuMarket; v: GpuView; tier: string; setTier: (t: string) => void; onNode: (id: string) => void }) {
  const { vocab: V } = usePersona();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '', state = sp.get('istate') ?? '';
  const set = (k: string, x: string) => { const n = new URLSearchParams(sp); x ? n.set(k, x) : n.delete(k); setSp(n, { replace: true }); };
  const owner = useMemo(() => new Map(m.customers.map(c => [c.customerId, c])), [m]);
  const rows = useMemo<InstR[]>(() => m.instances.map(i => ({ ...i, owner: owner.get(i.customerId)?.name ?? i.customerId, premium: !!owner.get(i.customerId)?.premium }))
    .filter(i => (!tier || i.tier === tier) && (!state || (state === 'hurt' ? i.jobState !== 'running' : state === 'spot' ? i.preemptible : true)) && (!q || `${i.id} ${i.owner} ${i.neId} ${i.dcId} ${i.type}`.toLowerCase().includes(q.toLowerCase()))), [m, owner, tier, state, q]);
  const cols: Col<InstR>[] = [
    { key: 'id', header: 'Instance', sort: i => i.id, render: i => <span className="cell-2"><span className="mono gpu-strong nowrap">{i.id}</span><small className="nowrap">{i.type}</small></span> },
    { key: 'owner', header: V.customer, wrap: true, sort: i => i.owner, render: i => <span className="cell-2"><CustLink id={i.customerId}>{i.owner}</CustLink>{i.premium && <small>{V.premium}</small>}</span> },
    { key: 'tier', header: 'Tier', sort: i => i.tier, render: i => <TierChip t={i.tier} /> },
    { key: 'node', header: 'Node', sort: i => i.neId, render: i => <span className="cell-2"><span className="mono nowrap">{short(i.neId)}</span><small className="nowrap">{v.dcId ? '' : `${i.dcId} · `}{v.clusters.find(c => c.id === i.clusterId)?.name ?? ''}</small></span> },
    { key: 'since', header: 'Running since', sort: i => i.started, render: i => <span className="cell-2"><span className="nowrap">{fmtAgo(i.started, v.now)}</span><small className="nowrap">{fmtNum(i.gpuHours)} GPU-hours</small></span> },
    { key: 'rate', header: 'Rate', sort: i => i.ratePerHour, render: i => <span className="num nowrap">{perH(i.ratePerHour)}</span> },
    { key: 'job', header: 'Workload', sort: i => i.jobState, render: i => <span className="row nowrap" style={{ gap: 6 }}><StateChip s={i.jobState} />{i.incidentId && <IncLink id={i.incidentId} />}</span> }
  ];
  return (
    <section className="card">
      <DataTable rows={rows} cols={cols} onRow={i => onNode(i.neId)} pageSize={20} defaultSort={{ key: 'since', dir: 'asc' }}
        toolbar={<ListToolbar shown={rows.length} total={m.instances.length} noun="instances" search={{ value: q, onChange: x => set('q', x), placeholder: `Instance, ${V.customer.toLowerCase()}, node` }}
          actions={[{ label: 'Export CSV', icon: I.Download, onClick: () => downloadCsv('gpu-instances.csv', [['Instance', V.customer, 'Tier', 'Type', 'Node', 'Datacenter', 'Started', 'GPU-hours', 'Rate/h', 'Workload', 'Incident'], ...rows.map(i => [i.id, i.owner, TIER_LABEL[i.tier], i.type, i.neId, i.dcId, new Date(i.started).toISOString(), i.gpuHours, i.ratePerHour, i.jobState, i.incidentId ?? ''])]) }]}
          filters={[
            { id: 'tier', label: 'Tier', quick: true, value: tier, anyLabel: 'Any tier', onChange: setTier, options: (['reserved', 'on-demand', 'spot'] as GpuSellTier[]).map(t => ({ id: t, label: TIER_LABEL[t], count: m.instances.filter(i => i.tier === t).length })) },
            { id: 'istate', label: 'Show', quick: true, value: state, anyLabel: 'All instances', onChange: x => set('istate', x), options: [{ id: 'hurt', label: 'Hit by a fault', count: m.instances.filter(i => i.jobState !== 'running').length }, { id: 'spot', label: 'Interruptible', count: m.instances.filter(i => i.preemptible).length }] }
          ]}><Legend /></ListToolbar>} />
    </section>
  );
}

type PreR = GpuPreemption & { id: string; owner: string; taker?: string };
function Interruptions({ m, v, onNode }: { m: GpuMarket; v: GpuView; onNode: (id: string) => void }) {
  const { vocab: V } = usePersona();
  const owner = new Map(m.customers.map(c => [c.customerId, c.name]));
  const rows: PreR[] = m.preemptions.map(p => ({ ...p, owner: owner.get(p.customerId) ?? p.customerId, taker: p.takenBy ? owner.get(p.takenBy) ?? p.takenBy : undefined }));
  const cols: Col<PreR>[] = [
    { key: 'at', header: 'When', sort: p => p.at, render: p => <span className="nowrap">{fmtAgo(p.at, v.now)}</span> },
    { key: 'inst', header: 'Spot instance', sort: p => p.instanceId, render: p => <span className="cell-2"><span className="mono gpu-strong nowrap">{p.instanceId}</span><small className="nowrap">8× {gpuSpec(p.model).short}</small></span> },
    { key: 'owner', header: V.customer, wrap: true, sort: p => p.owner, render: p => <CustLink id={p.customerId}>{p.owner}</CustLink> },
    { key: 'node', header: 'Node', sort: p => p.neId, render: p => <span className="cell-2"><span className="mono nowrap">{short(p.neId)}</span><small className="nowrap">{v.dcId ? '' : `${p.dcId} · `}{v.clusters.find(c => c.id === p.clusterId)?.name ?? ''}</small></span> },
    { key: 'why', header: 'Why', wrap: true, sort: p => p.reason, render: p => <span className="cell-2"><span>{p.reason}</span>{p.taker && <small>now running for <CustLink id={p.takenBy!}>{p.taker}</CustLink></small>}</span> },
    { key: 'lost', header: 'Work lost', sort: p => p.gpuHoursLost, render: p => <span className="num nowrap">{p.gpuHoursLost} GPU-h</span> },
    { key: 'ntf', header: 'Customer notified', sort: p => (p.notified ? 1 : 0), render: p => (p.notified ? <Chip tone="success" size="xs">Yes</Chip> : <Chip tone="warning" size="xs">No</Chip>) }
  ];
  return (
    <section className="card">
      {rows.length ? <DataTable rows={rows} cols={cols} onRow={p => onNode(p.neId)} pageSize={20} defaultSort={{ key: 'at', dir: 'desc' }} /> : <p className="vw-label" style={{ padding: 16, margin: 0 }}>No spot instance was taken back in the last 24 hours.</p>}
    </section>
  );
}

function Customers({ m }: { m: GpuMarket }) {
  const { vocab: V } = usePersona();
  type C = GpuMarket['customers'][number] & { id: string };
  const rows: C[] = m.customers.map(c => ({ ...c, id: c.customerId }));
  const cols: Col<C>[] = [
    { key: 'name', header: V.customer, wrap: true, sort: c => c.name, render: c => <span className="cell-2"><CustLink id={c.customerId}>{c.name}</CustLink>{c.premium && <small>{V.premium}</small>}</span> },
    { key: 'inst', header: 'Instances', sort: c => c.instances, render: c => <span className="num">{c.instances}</span> },
    { key: 'gpus', header: 'GPUs', sort: c => c.gpus, render: c => <span className="num">{fmtNum(c.gpus)}</span> },
    { key: 'mix', header: 'Tier mix', render: c => <span className="gpu-occ-split"><Split legend={false} parts={[{ key: 'r', label: 'Reserved', n: c.reserved, tone: 'info' }, { key: 'o', label: 'On-demand', n: c.onDemand, tone: 'cyan' }, { key: 's', label: 'Spot', n: c.spot, tone: 'purple' }]} /></span> },
    { key: 'rate', header: 'Rate', sort: c => c.ratePerHour, render: c => <span className="num nowrap">{perH(c.ratePerHour)}</span> },
    { key: 'sites', header: 'Datacenters', wrap: true, render: c => <span className="row wrap" style={{ gap: 4 }}>{c.sites.map(s => <Link key={s} className="ent-link mono" to={`/gpu?dc=${s}&gtab=occupancy`} onClick={e => e.stopPropagation()}>{s}</Link>)}</span> },
    { key: 'hurt', header: 'Hit by a fault', sort: c => c.hurt, render: c => <span className={`num${c.hurt ? ' gpu-bad' : ' faint'}`}>{c.hurt ? `${c.hurt} instance${c.hurt > 1 ? 's' : ''}` : '—'}</span> }
  ];
  return <section className="card"><DataTable rows={rows} cols={cols} pageSize={20} defaultSort={{ key: 'gpus', dir: 'desc' }} /></section>;
}

export const gpuModelName = gpuName;
