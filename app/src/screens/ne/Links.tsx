import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ListToolbar } from '../../ui/ListToolbar';
import * as I from 'lucide-react';
import { clockNow, getLink, useQuery } from '../../api';
import type { LinkState, Protocol } from '../../api/types';
import { Chip, Drawer, Panel } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { CustLink, LinkStateChip, Meter, NeLink, ServiceChip, SvcLink } from '../../ui/status';
import { fmtBw, fmtMonth, fmtNum } from '../../lib/format';
import { CRIT, WARN } from '../../lib/forecast';
import type { NeData } from './NetworkElement';
import { NoTelemetry, linkIf } from './common';
import { ForecastChart } from './ForecastChart';
import { Loading } from '../../shell/page';

type L = NeData['links'][number];
const CARDS: { p: Protocol; icon: I.LucideIcon; tone: string; rows: [string, (s: LinkState) => boolean, string][] }[] = [
  { p: 'OSPF', icon: I.Share2, tone: 'success', rows: [['Active links', s => s === 'up', 'good'], ['Down links', s => s === 'down', 'bad'], ['Init state', s => s === 'init', 'bad']] },
  { p: 'BGP', icon: I.Repeat, tone: 'purple', rows: [['Established', s => s === 'up', 'purple'], ['Idle', s => s === 'idle', 'bad'], ['Active', s => s === 'down', 'warn']] },
  { p: 'LLDP', icon: I.Link2, tone: 'info', rows: [['Neighbours up', s => s === 'up', 'info'], ['Neighbours down', s => s === 'down', 'bad'], ['Unknown', s => s !== 'up' && s !== 'down', 'faint']] },
  { p: 'LSP', icon: I.Activity, tone: 'error', rows: [['Active LSP', s => s === 'up', 'good'], ['Standby LSP', s => s === 'standby', 'warn'], ['Down LSP', s => s === 'down', 'bad']] },
  { p: 'ISIS', icon: I.TriangleAlert, tone: 'warning', rows: [['Up links', s => s === 'up', 'good'], ['Down links', s => s === 'down', 'bad'], ['Init state', s => s === 'init', 'warn']] }
];
export const riskOf = (l: L) => (l.utilPct >= WARN || l.forecastMonths <= 6 ? { label: 'At risk', tone: 'error' as const } : l.forecastMonths <= 12 ? { label: 'Watch', tone: 'warning' as const } : { label: 'Healthy', tone: 'success' as const });

export function Links({ d }: { d: NeData }) {
  const { ne } = d;
  const [sp, setSp] = useSearchParams();
  const [proto, setProto] = useState<Protocol>('LLDP');
  const [open, setOpen] = useState<string | null>(null);
  const [lq, setLq] = useState(''), [lst, setLst] = useState(''), [lrole, setLrole] = useState('');
  const countdown = useMemo(() => d.links.filter(l => l.protocol === 'LLDP' && (l.role === 'Backhaul' || l.role === 'Uplink')).sort((a, b) => a.forecastMonths - b.forecastMonths), [d.links]);
  const pre = sp.get('if');
  const sel = countdown.find(l => linkIf(l, ne.id).local === pre) ?? countdown[0];
  if (ne.discovery === 'not-discovered') return <NoTelemetry ne={ne} what="links" />;
  const all = d.links.filter(l => l.protocol === proto);
  const rows = all.filter(l => (!lst || l.state === lst) && (!lrole || l.role === lrole) && (!lq || `${linkIf(l, ne.id).local} ${linkIf(l, ne.id).peerNe} ${linkIf(l, ne.id).peerIf} ${l.id}`.toLowerCase().includes(lq.toLowerCase())));

  const cols: Col<L>[] = [
    { key: 'if', header: 'Local interface', render: l => <span className="mono strong">{linkIf(l, ne.id).local}</span>, sort: l => linkIf(l, ne.id).local },
    { key: 'peer', header: 'Peer', render: l => <span className="cell-2"><NeLink id={linkIf(l, ne.id).peerNe} /><small className="mono">{linkIf(l, ne.id).peerIf}</small></span>, sort: l => linkIf(l, ne.id).peerNe },
    { key: 'role', header: 'Role', render: l => <Chip tone={l.role === 'Backhaul' ? 'error' : l.role === 'Uplink' ? 'info' : 'neutral'} size="xs">{l.role}</Chip>, sort: l => l.role },
    { key: 'cap', header: 'Capacity', align: 'right', render: l => <span className="num">{fmtBw(l.capacityMbps)}</span>, sort: l => l.capacityMbps },
    { key: 'util', header: 'Utilisation', render: l => (l.state === 'up' ? <Meter pct={l.utilPct} width={64} /> : <span className="faint">—</span>), sort: l => l.utilPct },
    { key: 'fc', header: 'Crosses 85%', render: l => <span className="num nowrap">{l.state !== 'up' ? '—' : l.forecastMonths === 0 ? <span className="bad">Now</span> : l.forecastDate && l.forecastMonths < 36 ? fmtMonth(l.forecastDate) : '> 3 years'}</span>, sort: l => l.forecastMonths },
    { key: 'state', header: 'State', render: l => <LinkStateChip s={l.state} />, sort: l => l.state },
    { key: 'id', header: 'Link', render: l => <span className="mono faint">{l.id}</span> }
  ];

  return (
    <>
      <Panel title="Protocol adjacencies" sub="Pick a protocol to list its links; down and init sessions are what need an operator">
        <div className="ne-proto">
          {CARDS.map(c => {
            const ls = d.links.filter(l => l.protocol === c.p);
            return (
              <button key={c.p} type="button" className={`ne-proto-card${proto === c.p ? ' is-active' : ''}`} onClick={() => setProto(c.p)} aria-pressed={proto === c.p}>
                <div className="row" style={{ gap: 10 }}><span className="vw-card-icon-sm ne-dep-ic"><c.icon size={15} /></span><span><b>{c.p}</b><small>{ls.length} link{ls.length === 1 ? '' : 's'}</small></span></div>
                {c.rows.map(([label, f, cls]) => { const n = ls.filter(l => f(l.state)).length; return <div key={label} className="row between ne-proto-row"><span>{label}</span><b className={`num ${n ? cls : 'faint'}`}>{n}</b></div>; })}
              </button>
            );
          })}
        </div>
      </Panel>

      <section className="vw-card-section" style={{ padding: 0, overflow: 'hidden' }}>
        <DataTable rows={rows} cols={cols} onRow={l => setOpen(l.id)} pageSize={20} defaultSort={{ key: 'state', dir: 'asc' }}
          toolbar={
            <ListToolbar shown={rows.length} total={all.length} noun={`${proto} links`}
              search={{ value: lq, onChange: setLq, placeholder: 'Interface, peer, link ID' }}
              filters={[
                { id: 'state', label: 'State', quick: true, value: lst, anyLabel: 'Any state', onChange: setLst, options: [...new Set(all.map(l => l.state))].map(x => ({ id: x, label: x[0].toUpperCase() + x.slice(1), count: all.filter(l => l.state === x).length })) },
                { id: 'role', label: 'Role', quick: true, value: lrole, anyLabel: 'Any role', onChange: setLrole, options: [...new Set(all.map(l => l.role))].map(x => ({ id: x, label: x, count: all.filter(l => l.role === x).length })) }
              ]} />
          } />
      </section>

      {countdown.length > 0 && sel && (
        <section className="vw-card-section ne-fc">
          <div className="ne-fc-head">
            <span className="vw-card-icon-md ne-dep-ic"><I.TrendingUp size={18} /></span>
            <div style={{ flex: 1 }}><span className="vw-card-title-sm">Link saturation watch</span><span className="vw-label" style={{ display: 'block' }}>Backhaul and uplinks on this device, soonest to cross the 85% warning line first · trend of the last 6 monthly peaks</span></div>
          </div>
          <div className="ne-fc-body">
            <div className="ne-fc-list">
              <div className="ne-fc-label">{countdown.length} backhaul / uplink{countdown.length === 1 ? '' : 's'}</div>
              {countdown.map(l => {
                const k = linkIf(l, ne.id), r = riskOf(l), on = l.id === sel.id;
                return (
                  <button key={l.id} type="button" className={`ne-fc-item${on ? ' is-active' : ''}`} onClick={() => { const n = new URLSearchParams(sp); n.set('if', k.local); setSp(n, { replace: true }); }}>
                    <div className="row between"><span className="mono strong">{k.local}</span><span className="row" style={{ gap: 4 }}>{l.role === 'Backhaul' && <Chip tone="neutral" size="xs">Backhaul</Chip>}<Chip tone={r.tone} size="xs">{r.label}</Chip></span></div>
                    <dl>
                      <div><dt>Bandwidth utilisation</dt><dd className={l.utilPct >= WARN ? 'bad' : l.utilPct >= 75 ? 'warn' : 'good'}>{l.utilPct}%</dd></div>
                      <div><dt>Active sessions</dt><dd>{fmtNum(l.sessions)}</dd></div>
                      <div><dt>Crosses 85%</dt><dd>{l.forecastMonths === 0 ? 'Crossed' : l.forecastDate && l.forecastMonths < 60 ? fmtMonth(l.forecastDate) : '> 5 years'}</dd></div>
                      <div><dt>Trend</dt><dd>+{l.growthPct}%/mo</dd></div>
                    </dl>
                  </button>
                );
              })}
            </div>
            <div className="ne-fc-chart">
              <div className="row between" style={{ marginBottom: 6 }}>
                <h4><span className="mono">{linkIf(sel, ne.id).local}</span> <span className="muted" style={{ fontWeight: 400 }}>→ {linkIf(sel, ne.id).peerNe}</span></h4>
                <button type="button" className="panel-link" onClick={() => setOpen(sel.id)}>Trace link<I.ChevronRight size={14} /></button>
              </div>
              <ForecastChart history={sel.history} growth={sel.growthPct} now={clockNow()} height={340} />
              <p className="ne-fc-note">
                {sel.utilPct >= WARN ? <>Already above the {WARN}% warning line{Number.isFinite(sel.critMonths) && sel.critMonths > 0 ? <>; at +{sel.growthPct}%/mo it reaches the {CRIT}% critical line in ~<b>{Math.max(1, Math.round(sel.critMonths))} month{Math.round(sel.critMonths) > 1 ? 's' : ''}</b></> : null}. </> : sel.forecastDate ? <>At +{sel.growthPct}%/mo this link reaches {WARN}% around <b>{fmtMonth(sel.forecastDate)}</b>{Number.isFinite(sel.critMonths) && sel.critMonths < 60 ? <> and {CRIT}% in ~{Math.max(1, Math.round(sel.critMonths))} months</> : null}. </> : null}
                Capacity {fmtBw(sel.capacityMbps)} · {fmtNum(sel.sessions)} active sessions.
              </p>
            </div>
          </div>
        </section>
      )}
      <LinkDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}

/* physical → interfaces → protocols → services (DC-NET-004) */
export function LinkDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useQuery(() => (id ? getLink(id) : Promise.resolve(null)), [id]);
  if (!id) return null;
  const l = data?.link;
  const phys = l?.physical ?? data?.siblings.find(x => x.protocol === 'LLDP')?.physical ?? null;
  return (
    <Drawer open onClose={onClose} width={580} title={<span className="mono">{id}</span>} sub={l ? `${l.protocol} · ${l.role} · ${fmtBw(l.capacityMbps)}` : 'Loading'}>
      {!data || !l ? <Loading /> : (
        <div className="col" style={{ gap: 16 }}>
          <div className="ne-trace">
            <div className="ne-trace-step"><span className="kpi-ico tone-neutral"><I.Cable size={15} /></span><div><small>Physical{l.protocol !== 'LLDP' ? ' (LLDP span this session rides)' : ''}</small>{phys ? <b className="mono">{phys.cable} · {phys.strand} strand</b> : <b>No cable record in the ledger</b>}{phys && <span className="muted mono">{phys.aPort} ⇄ {phys.zPort}</span>}</div></div>
            <div className="ne-trace-step"><span className="kpi-ico tone-info"><I.Router size={15} /></span><div><small>Interfaces</small>
              <span className="row wrap" style={{ gap: 6 }}><NeLink id={data.a.id} tab="hardware" /><span className="mono">{l.aIf}</span><I.ArrowLeftRight size={13} className="faint" /><NeLink id={data.z.id} tab="hardware" /><span className="mono">{l.zIf}</span></span>
              {data.aIf?.optics && <span className="muted">A-end Rx {data.aIf.optics.rxDbm} dBm · {data.aIf.inErrors} in-errors{data.zIf?.optics ? ` · Z-end Rx ${data.zIf.optics.rxDbm} dBm` : ''}</span>}
            </div></div>
            <div className="ne-trace-step"><span className="kpi-ico tone-purple"><I.Share2 size={15} /></span><div><small>Protocols on this span</small><span className="row wrap" style={{ gap: 6 }}>{data.siblings.map(s => <span key={s.id} className="row" style={{ gap: 4 }}><Chip tone="neutral" size="xs">{s.protocol}</Chip><LinkStateChip s={s.state} /></span>)}</span></div></div>
            <div className="ne-trace-step"><span className="kpi-ico tone-success"><I.Waypoints size={15} /></span><div><small>Services & customers</small><b>{data.services.length} services · {new Set(data.services.map(s => s.customerId)).size} customers</b></div></div>
          </div>
          <div className="row" style={{ gap: 16 }}><span className="muted" style={{ fontSize: 12.5 }}>Utilisation</span><Meter pct={l.utilPct} width={140} /><span className="muted" style={{ fontSize: 12.5 }}>+{l.growthPct}%/mo · {l.forecastMonths === 0 ? 'above 85% now' : l.forecastDate && l.forecastMonths < 60 ? `85% by ${fmtMonth(l.forecastDate)}` : 'no exhaustion in 5 years'}</span></div>
          {data.services.length > 0 && (
            <table className="nst-table ne-mini">
              <thead><tr><th>Service</th><th>Customer</th><th>Status</th><th className="is-right">Bandwidth</th></tr></thead>
              <tbody>{data.services.map(s => <tr key={s.id}><td><SvcLink id={s.id} /></td><td><CustLink id={s.customerId}>{s.customer.name}</CustLink>{s.customer.premium && <Chip tone="purple" size="xs">Premium</Chip>}</td><td><ServiceChip s={s.status} size="xs" /></td><td className="is-right num">{fmtBw(s.bandwidthMbps)}</td></tr>)}</tbody>
            </table>
          )}
          {data.alerts.length > 0 && <div className="col" style={{ gap: 6 }}><b className="strong" style={{ fontSize: 13 }}>Alerts on this span</b>{data.alerts.map(a => <div key={a.id} className="row" style={{ gap: 8, fontSize: 12.5 }}><Chip tone={a.severity === 'critical' ? 'error' : a.severity === 'major' ? 'warning' : 'orange'} size="xs">{a.severity}</Chip><span className="mono">{a.code}</span><span>{a.title}</span></div>)}</div>}
        </div>
      )}
    </Drawer>
  );
}
