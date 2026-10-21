/* Phase 2 views (12-Oct-2026, user): fire / leak / access panels for Facilities → Environment, the preventive-maintenance plan for
   Facilities → Maintenance, and asset lifecycle (warranty, support, end of life, RMA, spares) for the device Hardware tab and the
   datacenter Assets tab. Data: mock/safety.ts, mock/maintenance.ts, mock/lifecycle.ts. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getDeviceLifecycle, getSiteLifecycle, getSitePm, getSiteSafety, useQuery } from '../../api';
import type { AssetLife, LifeState, PmState, PmTask, RmaCase, SparePart } from '../../api/types';
import { Chip, Empty, Panel } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar } from '../../ui/ListToolbar';
import { NeLink } from '../../ui/status';
import { Loading } from '../../shell/page';
import { fmtAgo, fmtDate, fmtNum } from '../../lib/format';
import '../../styles/physical.css';

const DAY = 86_400_000;
const until = (t: number, now: number) => { const d = Math.round((t - now) / DAY); return d === 0 ? 'today' : d > 0 ? `in ${d} d` : `${-d} d ago`; };

/* ---------------------------------------------------------------- safety */

export function SafetyPanels({ dcId }: { dcId: string }) {
  const { data } = useQuery(() => getSiteSafety(dcId), [dcId]);
  const now = clockNow();
  if (!data) return <Loading />;
  const t = data.totals;
  return (
    <>
      <div className="grid g-2 fac-eq">
        <Panel title="Fire detection & suppression" icon={I.Flame} count={data.fire.length} sub={`${t.armed} of ${t.fireZones} zones armed · ${t.inspectionsDue ? `${t.inspectionsDue} need attention` : 'inspections current'}`} flush
          info="One row per room: the detection system (VESDA aspirating smoke detection in data halls, point smoke + heat elsewhere) and its reading, the suppression system with its agent level (refill below 95%) and release mode (armed = automatic release), and the quarterly inspection. Amber = agent low or inspection overdue.">
          <table className="nst-table dt-table" data-safety="fire">
            <thead><tr><th>Zone</th><th>Detection</th><th>Suppression</th><th>Next inspection</th></tr></thead>
            <tbody>{data.fire.map(f => (
              <tr key={f.id}>
                <td className="is-wrap"><b className="strong">{f.zone}</b></td>
                <td><span className="cell-2"><span>{f.detection}</span><small>{f.detector}{f.detection.startsWith('VESDA') ? ` · ${f.obscurationPct}% obs/m` : ''}</small></span></td>
                <td><span className="cell-2"><span>{f.suppression}</span><small className={f.agentPct < 95 ? 'warn' : f.release !== 'Armed (auto)' ? 'muted' : ''}>{f.suppression === 'Pre-action sprinkler' ? 'valve set' : `agent ${f.agentPct}%`} · {f.release === 'Armed (auto)' ? 'armed' : f.release.toLowerCase()}</small></span></td>
                <td><span className="cell-2"><span className={f.state === 'warn' && f.nextInspection < now ? 'warn' : ''}>{fmtDate(f.nextInspection)}</span><small className={f.state === 'warn' ? 'warn' : ''}>{f.note ?? until(f.nextInspection, now)}</small></span></td>
              </tr>))}</tbody>
          </table>
        </Panel>
        <Panel title="Leak detection" icon={I.Droplets} count={data.leak.length} sub={`${t.dry} of ${t.leakZones} zones dry`} flush
          info="Leak-detection rope runs under every cooling unit and along liquid-cooled rows and CDU manifolds. Each zone shows what it guards, its length, the state (Dry, Leak, Cable fault) and when it was last tested with a wet test.">
          {data.leak.length ? (
            <table className="nst-table dt-table" data-safety="leak">
              <thead><tr><th>Zone</th><th>Guards</th><th className="is-right">Rope</th><th>State</th><th>Tested</th></tr></thead>
              <tbody>{data.leak.map(l => (
                <tr key={l.id}><td className="is-wrap">{l.zone}</td><td className="is-wrap">{l.covers}</td><td className="is-right num">{l.lengthM} m</td>
                  <td><Chip tone={l.state === 'Dry' ? 'success' : 'error'} size="xs">{l.state}</Chip></td><td className="num nowrap">{fmtAgo(l.lastTest, now)}</td></tr>))}</tbody>
            </table>
          ) : <div className="panel-body"><Empty icon={I.Droplets} title="No leak-detection zones" /></div>}
        </Panel>
      </div>
      <Panel title="Access control" actions={<Link className="panel-link" to={`/datacenters/${dcId}?tab=access`}>Access log &amp; security audit</Link>} icon={I.DoorClosed} count={data.access.length} flush sub={`${t.secured} of ${t.doors} doors secured · ${t.denied24h} denied badge reads in 24 h`}
        info="Every controlled door: the building mantrap, each room door and tenant cage doors, with the reader type, door state (Secured, Held open, Forced), badge events and denied reads in the last 24 hours and the last person through. A door held open for an approved maintenance window is amber.">
        <table className="nst-table dt-table" data-safety="access">
          <thead><tr><th>Door</th><th>Zone</th><th>Reader</th><th>State</th><th className="is-right">Events 24 h</th><th className="is-right">Denied</th><th>Last through</th></tr></thead>
          <tbody>{data.access.map(a => (
            <tr key={a.id}>
              <td className="is-wrap"><span className="cell-2"><b className="strong">{a.name}</b><small>{a.kind}</small></span></td>
              <td className="is-wrap">{a.zone}</td><td>{a.reader}</td>
              <td><span className="cell-2"><Chip tone={a.state === 'Secured' ? 'success' : a.state === 'Held open' ? 'warning' : 'error'} size="xs">{a.state}</Chip>{a.note && <small className="warn">{a.note}</small>}</span></td>
              <td className="is-right num">{fmtNum(a.events24h)}</td><td className={`is-right num ${a.denied24h ? 'warn' : 'faint'}`}>{a.denied24h}</td>
              <td><span className="cell-2"><span>{a.last.who}</span><small>{fmtAgo(a.last.at, now)}{a.last.ok ? '' : ' · denied'}</small></span></td>
            </tr>))}</tbody>
        </table>
      </Panel>
    </>
  );
}

/* ---------------------------------------------------------------- PM plan */

const PM_LABEL: Record<PmState, string> = { 'in-progress': 'In progress', overdue: 'Overdue', due: 'Due this week', scheduled: 'Scheduled', upcoming: 'Due this month', done: 'Up to date' };
const PM_TONE: Record<PmState, 'info' | 'error' | 'warning' | 'neutral' | 'success'> = { 'in-progress': 'info', overdue: 'error', due: 'warning', scheduled: 'info', upcoming: 'neutral', done: 'success' };
type PmRow = PmTask & { id: string };

export function PmPlan({ dcId }: { dcId: string }) {
  const { data } = useQuery(() => getSitePm(dcId), [dcId]);
  const now = clockNow();
  const [q, setQ] = useState('');
  const [st, setSt] = useState('open');
  const [kind, setKind] = useState('');
  const all = data ?? [];
  const rows = useMemo(() => all.filter(t => (st === 'all' || (st === 'open' ? t.state !== 'done' : t.state === st)) && (!kind || t.kind === kind) && (!q || `${t.asset} ${t.task} ${t.owner}`.toLowerCase().includes(q.toLowerCase()))), [all, q, st, kind]);
  if (!data) return <Loading />;
  const cnt = (s: PmState) => all.filter(t => t.state === s).length;
  const cols: Col<PmRow>[] = [
    { key: 'asset', header: 'Asset', render: t => <span className="cell-2"><b className="strong">{t.asset}</b><small>{t.kind}</small></span>, sort: t => t.asset },
    { key: 'task', header: 'Task', wrap: true, render: t => <span className="cell-2"><span>{t.task}</span><small>every {t.intervalDays >= 365 ? `${Math.round(t.intervalDays / 365)} year` : t.intervalDays >= 180 ? '6 months' : t.intervalDays >= 90 ? '3 months' : 'month'}</small></span> },
    { key: 'last', header: 'Last done', render: t => <span className="num nowrap">{fmtDate(t.lastDone)}</span>, sort: t => t.lastDone },
    { key: 'due', header: 'Next due', render: t => <span className="cell-2"><span className={`num nowrap ${t.state === 'overdue' ? 'bad' : ''}`}>{fmtDate(t.nextDue)}</span><small>{until(t.nextDue, now)}</small></span>, sort: t => t.nextDue },
    { key: 'state', header: 'State', render: t => <span className="cell-2"><Chip tone={PM_TONE[t.state]} size="xs">{PM_LABEL[t.state]}</Chip>{t.changeId && <Link className="ent-link mono" to={`/changes?id=${t.changeId}`} onClick={e => e.stopPropagation()}>{t.changeId}</Link>}</span>, sort: t => ['in-progress', 'overdue', 'due', 'scheduled', 'upcoming', 'done'].indexOf(t.state) },
    { key: 'owner', header: 'Owner', render: t => t.owner },
    { key: 'impact', header: 'While it is out', wrap: true, render: t => t.impact ? <small className="muted">{t.impact}</small> : <span className="faint">—</span> }
  ];
  return (
    <section className="vw-card-section" style={{ padding: 0, overflow: 'clip' }} data-pm>
      <div className="panel-h" style={{ padding: '14px 18px 4px', display: 'flex', alignItems: 'center', gap: 12 }}><span className="row" style={{ gap: 8, flexWrap: 'wrap' }}><I.ClipboardCheck size={16} /><b className="strong" style={{ fontSize: 15 }}>Preventive maintenance plan</b>
        <span className="faint" style={{ fontSize: 12.5 }}>{cnt('overdue')} overdue · {cnt('due')} due this week · {cnt('in-progress') + cnt('scheduled')} booked · {all.length} tasks</span></span>
        {/* booking = a Maintenance change in Change management (user, 21-Oct-2026: every screen gets its own raise action) */}
        <Link className="nst-btn nst-btn-sm" to="/changes?new=maintenance" style={{ marginLeft: 'auto', textDecoration: 'none' }}><I.CalendarPlus size={14} /> Schedule maintenance</Link></div>
      <DataTable rows={rows as PmRow[]} cols={cols} pageSize={25} defaultSort={{ key: 'state', dir: 'asc' }}
        toolbar={<ListToolbar shown={rows.length} total={all.length} noun="tasks" search={{ value: q, onChange: setQ, placeholder: 'Asset, task, owner' }}
          filters={[
            { id: 'st', label: 'State', quick: true, value: st, defaultValue: 'open', onChange: setSt, options: [{ id: 'open', label: 'Needs action or booked', count: all.filter(t => t.state !== 'done').length }, { id: 'overdue', label: 'Overdue', count: cnt('overdue') }, { id: 'due', label: 'Due this week', count: cnt('due') }, { id: 'upcoming', label: 'Due this month', count: cnt('upcoming') }, { id: 'all', label: 'All tasks', count: all.length }] },
            { id: 'kind', label: 'Asset type', quick: true, value: kind, anyLabel: 'Any asset type', onChange: setKind, options: [...new Set(all.map(t => t.kind))].map(k => ({ id: k, label: k, count: all.filter(t => t.kind === k).length })) }
          ]} />} />
    </section>
  );
}

/* ---------------------------------------------------------------- lifecycle */

export const LIFE_TONE: Record<LifeState, 'success' | 'warning' | 'error' | 'neutral' | 'orange'> = { Covered: 'success', Expiring: 'warning', 'Out of warranty': 'orange', 'End of support': 'error', 'Tenant-owned': 'neutral', Planned: 'neutral' };
const RMA_TONE: Record<RmaCase['status'], 'neutral' | 'info' | 'warning' | 'success'> = { Opened: 'neutral', 'Part shipped': 'info', 'Engineer booked': 'warning', 'Replaced · verifying': 'success' };

export function DeviceLifecycle({ neId }: { neId: string }) {
  const { data } = useQuery(() => getDeviceLifecycle(neId), [neId]);
  const now = clockNow();
  if (!data) return null;
  const l = data.life;
  return (
    <Panel title="Lifecycle & support" icon={I.ShieldCheck} sub={l.note} actions={<Chip tone={LIFE_TONE[l.state]} size="xs">{l.state}</Chip>}
      info="Install date, warranty end, the support contract (level and expiry) and the vendor's end-of-sale and end-of-support dates for this model, plus any RMA case open for a failed part and whether a spare is on site. Expiring = contract ends within 90 days or vendor support within a year.">
      <div className="phys-cool" data-life>
        <div><small>Installed</small><b>{l.state === 'Planned' ? '—' : fmtDate(l.installed)}</b><small>{l.vendor} {l.model}</small></div>
        <div><small>Warranty</small><b className={l.warrantyEnd < now ? 'warn' : ''}>{l.warrantyEnd < now ? 'Ended' : 'Until'} {fmtDate(l.warrantyEnd)}</b><small>{until(l.warrantyEnd, now)}</small></div>
        <div><small>Support contract</small><b>{l.contract ? `${l.contract.level}` : l.state === 'Tenant-owned' ? 'Tenant\'s own' : 'None'}</b><small>{l.contract ? `${l.contract.id} · ${l.contract.expires < now ? 'lapsed' : 'to'} ${fmtDate(l.contract.expires)}` : '—'}</small></div>
        <div><small>Vendor end of support</small><b className={l.endOfSupport < now ? 'bad' : l.endOfSupport - now < 365 * DAY ? 'warn' : ''}>{fmtDate(l.endOfSupport)}</b><small>end of sale {fmtDate(l.endOfSale)}</small></div>
      </div>
      {data.rmas.length > 0 && <div className="col" style={{ gap: 6, marginTop: 12 }}>
        <span className="vw-label">RMA</span>
        {data.rmas.map(r => <div key={r.id} className="fac-pdu-row" style={{ cursor: 'default' }}><b className="mono">{r.id}</b><Chip tone={RMA_TONE[r.status]} size="xs">{r.status}</Chip><small className="muted">{r.slot} · {r.part} · vendor case {r.ref} · {r.status === 'Replaced · verifying' ? 'swapped' : `ETA ${until(r.eta, now)}`}{r.spareOnSite ? ' · spare on site' : ' · waiting for the part'}</small></div>)}
      </div>}
    </Panel>
  );
}

type LifeRow = AssetLife & { id: string };
export function SiteLifecycle({ dcId }: { dcId: string }) {
  const { data } = useQuery(() => getSiteLifecycle(dcId), [dcId]);
  const now = clockNow();
  const [view, setView] = useState('risk');
  const [q, setQ] = useState('');
  const assets = useMemo(() => (data?.assets ?? []).filter(a => a.state !== 'Planned').map(a => ({ ...a, id: a.neId })), [data]);
  const rows = useMemo(() => assets.filter(a => (view === 'all' || (view === 'risk' ? a.state !== 'Covered' && a.state !== 'Tenant-owned' : a.state === view)) && (!q || `${a.neId} ${a.vendor} ${a.model} ${a.contract?.id ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [assets, view, q]);
  if (!data) return <Loading />;
  const t = data.totals;
  const cols: Col<LifeRow>[] = [
    { key: 'ne', header: 'Device', render: a => <span className="cell-2"><NeLink id={a.neId} tab="hardware">{a.neId.replace(`${dcId}-`, '')}</NeLink><small>{a.vendor} {a.model}</small></span>, sort: a => a.neId },
    { key: 'state', header: 'State', render: a => <Chip tone={LIFE_TONE[a.state]} size="xs">{a.state}</Chip>, sort: a => ['End of support', 'Out of warranty', 'Expiring', 'Covered', 'Tenant-owned'].indexOf(a.state) },
    { key: 'why', header: 'Why', wrap: true, render: a => <small className="muted">{a.note}</small> },
    { key: 'warranty', header: 'Warranty', render: a => <span className={`num nowrap ${a.warrantyEnd < now ? 'warn' : ''}`}>{fmtDate(a.warrantyEnd)}</span>, sort: a => a.warrantyEnd },
    { key: 'contract', header: 'Contract', render: a => a.contract ? <span className="cell-2"><span>{a.contract.level}</span><small className="mono">{a.contract.id} · {fmtDate(a.contract.expires)}</small></span> : <span className="faint">—</span>, sort: a => a.contract?.expires ?? 0 },
    { key: 'eos', header: 'End of support', render: a => <span className={`num nowrap ${a.endOfSupport < now ? 'bad' : ''}`}>{fmtDate(a.endOfSupport)}</span>, sort: a => a.endOfSupport }
  ];
  return (
    <>
      <div className="grid g-2 mx-row">
        <Panel title="RMA cases" icon={I.PackageOpen} count={data.rmas.length} flush sub={`${t.openRma} open · parts swapped under vendor cases`}
          info="Return-merchandise cases for failed parts (power supplies, disks, controllers, GPU boards): the device and slot, the vendor case, where the case is and when the replacement is expected. A spare on site means the swap can happen today.">
          {data.rmas.length ? <table className="nst-table dt-table" data-life="rma"><thead><tr><th>Case</th><th>Device · part</th><th>Status</th><th>ETA</th></tr></thead>
            <tbody>{data.rmas.map(r => <tr key={r.id}><td><span className="cell-2"><b className="mono">{r.id}</b><small className="mono">{r.ref}</small></span></td>
              <td className="is-wrap"><span className="cell-2"><NeLink id={r.neId} tab="hardware">{r.neId.replace(`${dcId}-`, '')}</NeLink><small>{r.slot} · {r.part}</small></span></td>
              <td><Chip tone={RMA_TONE[r.status]} size="xs">{r.status}</Chip></td><td><span className="cell-2"><span className="num nowrap">{r.status === 'Replaced · verifying' ? 'done' : until(r.eta, now)}</span><small>{r.spareOnSite ? 'spare on site' : 'part in transit'}</small></span></td></tr>)}</tbody></table>
            : <div className="panel-body"><Empty icon={I.PackageCheck} title="No open RMA cases" /></div>}
        </Panel>
        <Panel title="Spares on site" icon={I.Boxes} count={data.spares.length} flush sub={`${t.sparesLow} part${t.sparesLow === 1 ? '' : 's'} below the minimum`}
          info="Field-replaceable spares kept at the site per part family (power supplies, fans, optics, disks, GPU boards): on hand, reserved for open RMA cases and the minimum the site should hold. Low = available below the minimum; Out = nothing available.">
          <table className="nst-table dt-table" data-life="spares"><thead><tr><th>Part</th><th className="is-right">On hand</th><th className="is-right">Reserved</th><th className="is-right">Min</th><th>State</th></tr></thead>
            <tbody>{data.spares.slice(0, 8).map((s: SparePart) => <tr key={s.id}><td><span className="cell-2"><span>{s.part}</span><small>{s.fits}</small></span></td><td className="is-right num">{s.onHand}</td><td className="is-right num">{s.reserved || '—'}</td><td className="is-right num">{s.min}</td>
              <td><Chip tone={s.state === 'ok' ? 'success' : s.state === 'low' ? 'warning' : 'error'} size="xs">{s.state === 'ok' ? 'OK' : s.state === 'low' ? 'Low' : 'Out'}</Chip></td></tr>)}</tbody></table>
          {data.spares.length > 8 && <div className="faint" style={{ fontSize: 12, padding: '8px 18px' }}>+{data.spares.length - 8} more part families{data.spares.slice(8).some(x => x.state !== 'ok') ? '' : ', all at or above the minimum'}</div>}
        </Panel>
      </div>
      <section className="vw-card-section" style={{ padding: 0, overflow: 'clip' }} data-life="assets">
        <div className="panel-h" style={{ padding: '14px 18px 4px' }}><span className="row" style={{ gap: 8 }}><I.ShieldCheck size={16} /><b className="strong" style={{ fontSize: 15 }}>Warranty & support</b>
          <span className="faint" style={{ fontSize: 12.5 }}>{t.covered} covered · {t.expiring} expiring · {t.outOfWarranty} out of warranty · {t.endOfSupport} past vendor support{t.tenant ? ` · ${t.tenant} tenant-owned` : ''}</span></span></div>
        <DataTable rows={rows as LifeRow[]} cols={cols} pageSize={20} defaultSort={{ key: 'state', dir: 'asc' }}
          toolbar={<ListToolbar shown={rows.length} total={assets.length} noun="devices" search={{ value: q, onChange: setQ, placeholder: 'Device, vendor, model, contract' }}
            filters={[{ id: 'v', label: 'State', quick: true, value: view, defaultValue: 'risk', onChange: setView, options: [{ id: 'risk', label: 'Needs attention', count: assets.filter(a => a.state !== 'Covered' && a.state !== 'Tenant-owned').length },
              ...(['End of support', 'Out of warranty', 'Expiring', 'Covered', 'Tenant-owned'] as LifeState[]).filter(s => assets.some(a => a.state === s)).map(s => ({ id: s, label: s, count: assets.filter(a => a.state === s).length })), { id: 'all', label: 'All devices', count: assets.length }] }]} />} />
      </section>
    </>
  );
}
