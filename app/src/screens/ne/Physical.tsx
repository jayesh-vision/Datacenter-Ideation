/* Device "Power & cabling" tab (12-Oct-2026, user: "how will power come to this device, how is the network cable attached"):
   every power supply traced to its PDU outlet, UPS and utility feed; the cooling that serves its cabinet; every cabled port
   with its optic, patch panels, trunks and far end; and the single points of failure it sits behind. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDatacenter, getDevicePhysical, useQuery } from '../../api';
import { Chip, Panel } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar } from '../../ui/ListToolbar';
import { LinkStateChip, NeLink } from '../../ui/status';
import { Loading } from '../../shell/page';
import { fmtBw } from '../../lib/format';
import { CablePathDrawer, PowerChain, RackPowerDrawer, SpofList, SpofInfo, STATE_TONE } from '../physical/parts';
import type { NeData } from './NetworkElement';

type Cable = NonNullable<Awaited<ReturnType<typeof getDevicePhysical>>>['cables'][number] & { id: string };
const KIND_LABEL = { 'in-rack': 'In-rack', structured: 'Via ODF', 'inter-site': 'Outside plant' } as const;

export function Physical({ d }: { d: NeData }) {
  const { ne } = d;
  const { data } = useQuery(() => getDevicePhysical(ne.id), [ne.id]);
  const { data: site } = useQuery(() => getDatacenter(ne.dcId), [ne.dcId]);
  const [open, setOpen] = useState<string | null>(null);
  const [rack, setRack] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [view, setView] = useState('all');
  const cables: Cable[] = useMemo(() => (data?.cables ?? []).map(c => ({ ...c, id: c.linkId })), [data]);
  const rows = useMemo(() => cables.filter(c => (view === 'all' || (view === 'issue' ? c.state !== 'ok' : c.kind === view)) && (!q || `${c.ifName} ${c.farNe} ${c.farIf} ${c.via} ${c.optic ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [cables, q, view]);
  if (!data) return <Loading />;
  const { power, verdict, cooling } = data;
  const opaque = ne.role === 'Tenant gear';
  /* supplies on the same PDU share everything upstream of the outlet: one chain per PDU */
  const groups = [...new Set(power.map(p => p.pdu.id))].map(id => {
    const ps = power.filter(p => p.pdu.id === id), f = ps[0];
    const psuStep = ps.length === 1 ? f.chain[0] : { ...f.chain[0], name: ps.map(p => p.cord.psu).join(' · '), sub: `${ps.length} supplies`, state: ps.some(p => p.chain[0].state === 'bad') ? 'bad' as const : f.chain[0].state };
    const outStep = ps.length === 1 ? f.chain[1] : { ...f.chain[1], name: `${f.pdu.name} outlets ${ps.map(p => p.cord.outlet).join(', ')}`, sub: [...new Set(ps.map(p => p.chain[1].sub))].join(' · '), state: ps.some(p => p.chain[1].state === 'bad') ? 'bad' as const : ps.some(p => p.chain[1].state === 'warn') ? 'warn' as const : 'ok' as const };
    return { key: id, side: f.pdu.side, psus: ps.map(p => p.cord.psu), cords: ps.map(p => p.cord), steps: [psuStep, outStep, ...f.chain.slice(2)] };
  });

  const cols: Col<Cable>[] = [
    { key: 'if', header: 'Port', render: c => <span className="cell-2"><span className="mono strong">{c.ifName}</span><small>{fmtBw(c.speedMbps)}</small></span>, sort: c => c.ifName },
    { key: 'optic', header: 'Optic', wrap: true, render: c => c.optic ? <span className="cell-2"><span className="mono">{c.optic}</span>{c.rxDbm !== null && <small className={c.rxDbm < -10 ? 'bad' : c.rxDbm < -8 ? 'warn' : ''}>Rx {c.rxDbm} dBm</small>}</span> : <span className="faint">{c.speedMbps <= 1000 ? 'RJ45 copper' : 'DAC'}</span> },
    { key: 'kind', header: 'Route', render: c => <span className="cell-2"><span>{KIND_LABEL[c.kind]}</span><small>{c.route === '—' ? `${c.hops} segment${c.hops === 1 ? '' : 's'}` : `${c.hops} segments · ${c.route}`}</small></span>, sort: c => c.kind },
    { key: 'via', header: 'Patching', wrap: true, render: c => <span className="mono ph-via">{c.via}</span> },
    { key: 'far', header: 'Far end', wrap: true, render: c => <span className="cell-2"><NeLink id={c.farNe} tab="physical" /><small className="mono">{c.farIf}</small></span>, sort: c => c.farNe },
    { key: 'state', header: 'Cable', render: c => <span className="cell-2"><span className="row" style={{ gap: 6 }}><LinkStateChip s={c.linkState} />{c.state !== 'ok' && <Chip tone={STATE_TONE[c.state]} size="xs">{c.state === 'bad' ? 'Fault' : 'Check'}</Chip>}</span>{c.state !== 'ok' && <small>{c.verdict}</small>}</span>, sort: c => (c.state === 'ok' ? 2 : c.state === 'warn' ? 1 : 0) }
  ];

  return (
    <>
      <div className="col" style={{ gap: 16 }}>
        <Panel title="Power path" icon={I.PlugZap} sub={verdict.text}
          info="Each power supply of this device traced upstream: the PDU outlet and breaker bank it plugs into, the rack PDU (A or B side), the UPS module or −48 V plant behind that PDU, and the utility feed. Odd supplies go to the A side, even to the B side; a device stays up while at least one supply has power."
          actions={<button type="button" className="panel-link" onClick={() => setRack(ne.rackId)}>Rack {data.rack.name} PDUs<I.ChevronRight size={14} /></button>}>
          <div className={`note note--${verdict.state === 'ok' ? 'good' : verdict.state === 'bad' ? 'bad' : verdict.state === 'off' ? 'info' : 'warn'}`} style={{ marginBottom: 12 }} data-power-verdict>
            {verdict.state === 'ok' ? <I.ShieldCheck size={15} /> : <I.ShieldAlert size={15} />}<span>{verdict.text}</span>
          </div>
          {power.length ? groups.map(g => (
            <div key={g.key} className="phys-psu" data-psu={g.psus.join(',')}>
              <div className="phys-psu-h"><b>{g.psus.join(' · ')}</b>{g.cords.map(c => <Chip key={c.psu} tone={c.state === 'live' ? 'success' : c.state === 'on-battery' ? 'warning' : 'error'} size="xs">{g.cords.length > 1 ? `${c.psu} ` : ''}{c.state === 'live' ? `Live · ${c.drawW} W` : c.state === 'on-battery' ? `On UPS battery · ${c.drawW} W` : c.state === 'psu-failed' ? 'Supply failed' : 'No power at the outlet'}</Chip>)}
                <span className="faint" style={{ fontSize: 12.5 }}>{g.side} side{opaque ? ' · tenant power order' : ''}</span></div>
              <PowerChain steps={g.steps} />
            </div>
          )) : <p className="vw-card-description" style={{ margin: 0 }}>Planned: power cords are assigned when the device is installed.</p>}
        </Panel>
        <div className={data.spofs.length ? 'grid g-2' : 'col'} style={{ gap: 16 }}>
        <Panel title="Cooling" icon={I.Fan} sub={`${cooling.zone.floor} · ${cooling.zone.state === 'n+1' ? `${cooling.site.redundancy} holds` : cooling.zone.state === 'short' ? 'running cooling below the heat load' : cooling.zone.hotRooms.length ? `${cooling.zone.hotRooms.join(', ')} running hot` : 'no spare unit'}`}
          info="What keeps this device's cabinet cool: the nearest CRAH / CRAC unit and the others on the floor (they share the under-floor air), the site's heat balance (as on Facilities → Cooling), the liquid loop for liquid-cooled racks, the cabinet inlet temperature and whether the floor still has a spare unit if one more fails.">
          <div className="phys-cool">
            <div><small>Cabinet inlet</small><b className={cooling.rack.tempC > 27 ? 'bad' : ''}>{cooling.rack.tempC}°C</b><small>{cooling.rack.name} · ASHRAE limit 27°C</small></div>
            <div><small>Nearest unit</small><b>{cooling.units.find(u => u.id === cooling.primaryId)?.name ?? '—'}</b><small>{(() => { const u = cooling.units.find(x => x.id === cooling.primaryId); return u ? `${u.type} · ${u.status}${u.status === 'Operational' ? ` · ${u.loadPct}%` : ''}` : ''; })()}</small></div>
            <div><small>Site cooling</small><b>{cooling.site.runningKw} kW running</b><small>{cooling.site.heatKw} kW heat · {cooling.site.afterLossKw} kW if one more unit is lost</small></div>
            {cooling.cdu && <div><small>Liquid loop</small><b>{cooling.cdu.name}</b><small>{Math.round(cooling.rack.liquidPct * 100)}% of the heat · {cooling.cdu.flowLpm} of {cooling.cdu.flowNominal} L/min</small></div>}
          </div>
          <div className="row wrap" style={{ gap: 4, marginTop: 10 }}>{cooling.units.map(u => <Chip key={u.id} tone={u.status === 'Operational' ? 'neutral' : u.status === 'Failed' ? 'error' : 'warning'} size="xs" title={`${u.zone} · ${u.capacityKw} kW`}>{u.name}{u.status !== 'Operational' ? ` · ${u.status}` : ''}</Chip>)}</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 10 }}><Link className="ent-link" to={`/facilities?dc=${ne.dcId}&tab=cooling`}>Cooling detail</Link></div>
        </Panel>
        {data.spofs.length > 0 && (
          <Panel title={<>Single points of failure<SpofInfo /></>} icon={I.ShieldAlert} count={data.spofs.length} sub="Risks this device sits behind" flush>
            <SpofList spofs={data.spofs} link />
          </Panel>
        )}
        </div>
      </div>

      {!cables.length ? <Panel title="Cabling" icon={I.Cable}><p className="vw-card-description" style={{ margin: 0 }}>{opaque ? 'Tenant-owned gear: the tenant patches inside the cabinet; the operator records only the cross-connects it hands off.' : 'No cabled ports recorded for this device yet.'}</p></Panel> : (
      <section className="vw-card-section" style={{ padding: 0, overflow: 'clip' }}>
        <DataTable rows={rows} cols={cols} pageSize={40} defaultSort={{ key: 'state', dir: 'asc' }} onRow={c => setOpen(c.linkId)}
          toolbar={
            <ListToolbar shown={rows.length} total={cables.length} noun="cables"
              search={{ value: q, onChange: setQ, placeholder: 'Port, far end, panel, optic' }}
              filters={[{ id: 'view', label: 'Route', quick: true, value: view, defaultValue: 'all', onChange: setView, options: [
                { id: 'all', label: 'All cables', count: cables.length }, { id: 'issue', label: 'Needs a check', count: cables.filter(c => c.state !== 'ok').length },
                { id: 'in-rack', label: 'In-rack', count: cables.filter(c => c.kind === 'in-rack').length }, { id: 'structured', label: 'Via ODF', count: cables.filter(c => c.kind === 'structured').length }, { id: 'inter-site', label: 'Outside plant', count: cables.filter(c => c.kind === 'inter-site').length }] }]} />
          } />
      </section>)}
      <CablePathDrawer linkId={open} onClose={() => setOpen(null)} />
      {site && <RackPowerDrawer dc={site.dc} rackId={rack} onClose={() => setRack(null)} />}
    </>
  );
}
