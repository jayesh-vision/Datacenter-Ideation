/* Security Ops → OT security (IEC 62443 zones and conduits: target vs achieved security level, the facility controllers and their findings),
   Physical security (defence-in-depth layers per datacenter with EN 50600-2-5 style protection classes, the access-rights review) and
   Data sources (every sensor → OTel collector → OCSF table in ClickHouse: coverage, volume, retention, health). */
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import type { SecPhysLayer, SecSource } from '../../api/types';
import { Chip, Panel } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { DcLink, Meter } from '../../ui/status';
import { fmtAgo, fmtDate, fmtNum } from '../../lib/format';
import type { SecProps } from './SecOps';
import { DomainTag, SEVS, SevChip, StateChip, pct } from './common';

/* ---------------------------------------------------------------- OT */
export function OtView({ v, q, set, go, dcId }: SecProps) {
  const apply = useParamPatch();
  const otf = q('otf'), search = q('q');
  const short = v.otZones.filter(z => z.slA < z.slT);
  const creds = v.otAssets.reduce((s, a) => s + a.defaultCreds, 0), reach = v.otAssets.filter(a => a.reachableFromIt).length;
  const rows = v.otAssets.filter(a => (!otf || (otf === 'creds' ? a.defaultCreds > 0 : otf === 'reach' ? a.reachableFromIt : otf === 'risk' ? a.risk === 'Critical' || a.risk === 'High' : true))
    && (!search || `${a.name} ${a.kind} ${a.vendor} ${a.dcId} ${a.protocols.join(' ')}`.toLowerCase().includes(search.toLowerCase())));
  const otDet = v.detections.filter(d => d.domain === 'Facility OT');
  const zoneName = new Map(v.otZones.map(z => [z.id, z.name.replace(/ \(.*$/, '')]));
  return (
    <div className="so-stack">
      <section className="vw-card-section so-otsum">
        <span><small>Zones below target</small><b className={short.length ? 'is-bad' : ''}>{short.length} of {v.otZones.length}</b><em>achieved SL-A &lt; target SL-T</em></span>
        <span><small>Controllers with default credentials</small><b className={creds ? 'is-bad' : ''}>{fmtNum(creds)}</b><em>IEC 62443-3-3 SR 1.5</em></span>
        <span><small>Reachable from IT outside a conduit</small><b className={reach ? 'is-warn' : ''}>{fmtNum(reach)}</b><em>SR 5.1 network segmentation</em></span>
        <span><small>OT detections, 14 days</small><b>{fmtNum(otDet.length)}</b><em>{otDet.filter(d => d.state !== 'Closed').length} open · ATT&CK for ICS</em></span>
        <button type="button" className="ent-link" onClick={() => go('attack', { mx: 'ICS' })}>ICS coverage →</button>
      </section>
      <Panel title="Zones and conduits" icon={I.Network} count={v.otZones.length} sub={dcId ? undefined : 'Every datacenter · the zones furthest below target first'} info="IEC 62443-3-2: the plant split into zones of like risk, each with a target security level (SL-T, 1–4) and the level its controls achieve (SL-A). Conduits are the only paths in and out (the OT firewall from IT management, a read-only path to DCIM).">
        <div className="so-zones">{[...v.otZones].sort((a, b) => (a.slA - a.slT) - (b.slA - b.slT)).slice(0, dcId ? 99 : 15).map(z => (
          <div key={z.id} className={`so-zone${z.slA < z.slT ? ' is-short' : ''}`}>
            <span className="so-zone-h"><b>{z.name}</b>{!dcId && <DcLink id={z.dcId} />}</span>
            <span className="so-sl"><span><small>Target</small><b>SL {z.slT}</b></span><span className="so-sl-bar">{[1, 2, 3, 4].map(n => <i key={n} className={n <= z.slA ? 'is-a' : n <= z.slT ? 'is-t' : ''} />)}</span><span><small>Achieved</small><b>SL {z.slA}</b></span></span>
            <small>{z.systems} · {fmtNum(z.assets)} units</small>
            <ul>{z.conduits.map(c => <li key={c.to}><I.ArrowLeftRight size={12} />{c.to} via {c.via} · {c.rules} rules{c.open ? <b className="so-bad"> · {c.open} any-any</b> : ''}</li>)}</ul>
            {z.findings.length ? <ul className="so-zone-f">{z.findings.map(f => <li key={f}>{f}</li>)}</ul> : <p className="vw-label">No finding.</p>}
          </div>))}</div>
        {!dcId && v.otZones.length > 15 && <p className="vw-label">Showing the 15 zones furthest below target; pick a datacenter at the top to see all of its zones.</p>}
      </Panel>
      <section className="vw-card-section dcim-table">
        <DataTable rows={rows} pageSize={25} defaultSort={{ key: 'r', dir: 'asc' }}
          toolbar={<ListToolbar shown={rows.length} total={v.otAssets.length} noun="controllers" onApply={apply} search={{ value: search, onChange: x => set({ q: x }), placeholder: 'Controller, vendor, protocol, datacenter' }}
            filters={[{ id: 'otf', label: 'Finding', quick: true, value: otf, anyLabel: 'Any', onChange: x => set({ otf: x }), options: [{ id: 'risk', label: 'High or critical risk', count: v.otAssets.filter(a => a.risk === 'Critical' || a.risk === 'High').length }, { id: 'creds', label: 'Default credentials', count: v.otAssets.filter(a => a.defaultCreds).length }, { id: 'reach', label: 'Reachable from IT', count: reach }] }]} />}
          cols={[
            { key: 'n', header: 'Controller', wrap: true, sort: a => a.name, render: a => <span className="cell-2"><b>{a.name}</b><small>{a.kind} · {a.vendor} · firmware <span className="mono">{a.firmware}</span></small></span> },
            { key: 'z', header: 'Zone', wrap: true, sort: a => a.zoneId, render: a => <span className="cell-2"><span>{zoneName.get(a.zoneId)}</span><small>{a.dcId}</small></span> },
            { key: 'p', header: 'Protocols', wrap: true, render: a => <span className="row wrap" style={{ gap: 4 }}>{a.protocols.map(x => <Chip key={x} tone={/Modbus|BACnet|v2c|RTSP/.test(x) ? 'warning' : 'neutral'} size="xs">{x}</Chip>)}</span> },
            { key: 'u', header: 'Units', sort: a => a.units, render: a => fmtNum(a.units) },
            { key: 'c', header: 'Findings', wrap: true, render: a => { const f = [...(a.defaultCreds ? [<span key="c" className="so-bad">{fmtNum(a.defaultCreds)} default credential{a.defaultCreds === 1 ? '' : 's'}</span>] : []), ...(a.reachableFromIt ? [<span key="r" className="so-bad">reachable from IT outside the conduit</span>] : []), ...(a.cleartext ? [<span key="p">cleartext protocol</span>] : [])]; return f.length ? <span className="cell-2">{f}</span> : <span className="vw-label">—</span>; } },
            { key: 'r', header: 'Risk', sort: a => SEVS.indexOf(a.risk), render: a => <SevChip s={a.risk} /> },
            { key: 'l', header: 'Last seen', sort: a => a.lastSeen, render: a => fmtAgo(a.lastSeen, v.now) }
          ]} />
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- physical */
const LAYER_TONE: Record<SecPhysLayer['state'], 'success' | 'warning' | 'error'> = { OK: 'success', Degraded: 'warning', Breach: 'error' };
export function PhysicalView({ v, go, dcId }: SecProps) {
  const det = v.detections.filter(d => d.domain === 'Physical');
  const open = det.filter(d => d.state !== 'Closed');
  const kinds = [...det.reduce((m, d) => m.set(d.title, (m.get(d.title) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const LAYERS: SecPhysLayer['layer'][] = ['Perimeter', 'Building', 'Data hall', 'Cage', 'Rack'];
  return (
    <div className="dl-dash">
      <Panel className="dl-span-8" title="Layers of defence" icon={I.Layers} count={v.physical.length} sub="Perimeter → building → data hall → cage → rack; protection class rises inwards"
        info="Defence in depth per datacenter, protection classes 1–4 in the EN 50600-2-5 style. A layer is Breach when a door in it is forced or has an open high-severity exception, Degraded when a door is held open or an exception of its kind is open. Click a datacenter for its Access & security tab.">
        <table className="so-layers"><thead><tr><th>Datacenter</th>{LAYERS.map(l => <th key={l}>{l}<small>class {({ Perimeter: 1, Building: 2, 'Data hall': 3, Cage: 4, Rack: 4 })[l]}</small></th>)}<th>Open</th></tr></thead>
          <tbody>{[...v.physical].sort((a, b) => b.high - a.high || b.open - a.open).map(p => (
            <tr key={p.dcId}><td><Link className="ent-link mono" to={`/datacenters/${p.dcId}?tab=access`}>{p.dcId}</Link></td>
              {p.layers.map(l => <td key={l.layer} title={`${l.controls} · ${l.note}`}><Chip tone={LAYER_TONE[l.state]} size="xs" dot>{l.state}</Chip></td>)}
              <td className={p.high ? 'so-bad' : ''}>{p.open}{p.high ? ` · ${p.high} high` : ''}</td></tr>))}</tbody></table>
      </Panel>
      <Panel className="dl-span-4" title="Physical detections" icon={I.DoorClosedLocked} count={det.length} sub={`${open.length} open · from access control and CCTV`} actions={<button type="button" className="ent-link" onClick={() => go('detections', { dom: 'Physical' })}>All →</button>}
        info="Each one is a security exception raised by the access-control system (the same records as the datacenter's Access & security tab), mapped to ISO 27001 A.7 physical controls.">
        <ul className="so-kinds">{kinds.map(([k, n]) => <li key={k}><span>{k}</span><b>{n}</b></li>)}</ul>
        <b className="dcim-sub-h">Open now</b>
        <ul className="ipam-find">{open.slice(0, 6).map(d => <li key={d.id}><button type="button" onClick={() => go('detections', { det: d.id })}><SevChip s={d.severity} /><span className="cell-2"><b>{d.summary}</b><small>{d.dcId} · {fmtAgo(d.at, v.now)}</small></span><StateChip s={d.state} /></button></li>)}</ul>
      </Panel>
      {dcId && v.physical[0] && <Panel className="dl-span-12" title={`${dcId}: controls per layer`} icon={I.ShieldCheck}>
        <div className="so-layer-cards">{v.physical[0].layers.map(l => <div key={l.layer} className={`so-lc is-${LAYER_TONE[l.state]}`}><span><b>{l.layer}</b><Chip tone={LAYER_TONE[l.state]} size="xs" dot>{l.state}</Chip></span><small>Protection class {l.protectionClass}</small><p>{l.controls}</p><em>{l.note}</em></div>)}</div>
      </Panel>}
      <Panel className="dl-span-12" title="Access-rights review" icon={I.IdCard} info="ISO 27001 A.5.18 access rights: badges issued, unused for 90 days and expired but still active per datacenter, with the next quarterly review. CCTV is kept 90 days.">
        <DataTable compact rows={v.physical.map(p => ({ ...p, id: p.dcId }))} pageSize={30} cols={[
          { key: 'd', header: 'Datacenter', render: p => <DcLink id={p.dcId} tab="access" /> },
          { key: 'b', header: 'Badges', sort: p => p.badges, render: p => fmtNum(p.badges) },
          { key: 'u', header: 'Unused 90 days', sort: p => p.unused90, render: p => fmtNum(p.unused90) },
          { key: 'e', header: 'Expired, still active', sort: p => p.expiredActive, render: p => <span className={p.expiredActive ? 'so-bad' : ''}>{fmtNum(p.expiredActive)}</span> },
          { key: 'r', header: 'Next review', sort: p => p.nextReview, render: p => <span className={p.nextReview < v.now ? 'so-bad' : ''}>{fmtDate(p.nextReview)}</span> },
          { key: 'x', header: 'Exceptions, 24 h', sort: p => p.exceptions, render: p => `${p.exceptions} (${p.open} open)` },
          { key: 'c', header: 'Physical + cyber', sort: p => p.correlated, render: p => p.correlated ? <span className="so-bad">{p.correlated} correlated</span> : <span className="vw-label">—</span> }
        ]} />
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- data sources */
const ST_TONE: Record<SecSource['state'], 'success' | 'warning' | 'error'> = { Healthy: 'success', Lagging: 'warning', Silent: 'error' };
export function SourcesView({ all }: SecProps) {
  const s = all.sources;
  const eps = s.reduce((a, x) => a + x.eps, 0), gb = s.reduce((a, x) => a + x.gbDay, 0);
  return (
    <div className="so-stack">
      <section className="vw-card-section so-pipe">
        {[{ i: I.Radio, b: `${all.sensors.length - 2} sensors`, s: 'Device AAA, syslog, configs, Redfish, osquery, Falco, Trivy, Suricata, Zeek, NetFlow, OT sensor, PACS, VMS' },
          { i: I.Combine, b: 'OTel collectors', s: 'syslog · filelog · SNMP · NetFlow · webhook · OTLP receivers; normalise to OCSF, enrich from DCIM / IPAM' },
          { i: I.Database, b: 'ClickHouse', s: `OCSF tables · ${fmtNum(eps)} events/s · ${fmtNum(Math.round(gb))} GB/day raw · 30 d hot, then S3` },
          { i: I.ScanSearch, b: `${all.rules.length} Sigma rules`, s: 'Materialized views for single events, scheduled SQL for windows and correlations' },
          { i: I.Workflow, b: 'Cases & playbooks', s: 'NIST SP 800-61 cases, SOAR steps, Datacenter context' }].map((x, i, xs) => (
          <div key={x.b} className="so-pipe-s"><span className="so-pipe-i"><x.i size={18} /></span><b>{x.b}</b><small>{x.s}</small>{i < xs.length - 1 && <I.ChevronRight size={16} className="so-pipe-a" />}</div>))}
      </section>
      <section className="vw-card-section dcim-table">
        <DataTable rows={s} pageSize={30} toolbar={<ListToolbar shown={s.length} total={s.length} noun="data sources" />} cols={[
          { key: 'n', header: 'Source', wrap: true, sort: x => x.name, render: x => <span className="cell-2"><b>{x.name}</b><small>{all.sensors.find(y => y.id === x.sensor)?.kind} · {x.collector}</small></span> },
          { key: 'd', header: 'Domain', sort: x => x.domain, render: x => <DomainTag d={x.domain} /> },
          { key: 'o', header: 'OCSF classes → table', wrap: true, render: x => <span className="cell-2"><span>{x.ocsf.join(', ')}</span><small className="mono">{x.table}</small></span> },
          { key: 'c', header: 'Coverage', sort: x => pct(x.covered, x.expected), render: x => <span className="cell-2"><Meter pct={pct(x.covered, x.expected)} width={90} label={`${pct(x.covered, x.expected)}%`} color={pct(x.covered, x.expected) >= 95 ? 'var(--primaryColor400)' : 'var(--vw-color-orange-300)'} /><small>{fmtNum(x.covered)} of {fmtNum(x.expected)}</small></span> },
          { key: 'v', header: 'Volume', sort: x => x.eps, render: x => <span className="cell-2"><span>{fmtNum(x.eps)} /s</span><small>{x.gbDay} GB/day</small></span> },
          { key: 'r', header: 'Retention', render: x => <span className="cell-2"><span>{x.hotDays} d hot</span><small>{x.coldDays} d on S3</small></span> },
          { key: 's', header: 'Health', sort: x => x.state, render: x => <span className="cell-2"><Chip tone={ST_TONE[x.state]} size="xs" dot>{x.state}</Chip><small>last event {fmtAgo(x.lastEvent, all.now)}</small></span> },
          { key: 'g', header: 'Gap', wrap: true, render: x => x.gap ? <span className={x.state !== 'Healthy' ? 'so-bad' : ''}>{x.gap}</span> : <span className="vw-label">—</span> }
        ]} />
      </section>
      <p className="vw-label so-note">The two context sources (change & ticket context, asset context) are ClickHouse dictionaries refreshed from Change management, DCIM and IPAM; rules join them at query time.</p>
    </div>
  );
}
