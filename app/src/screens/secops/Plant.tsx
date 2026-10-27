/* Security Ops → OT security, Physical security and Data sources.
   27-Oct-2026 review (user: "too much data … user needs to scroll down and down"): OT and Physical open with one analytics strip (tiles with an
   info icon, each a filter) and then ONE view at a time behind a switch — OT: Zones (estate = one row per datacenter, a datacenter = its zone
   cards) · Controllers; Physical: Layers · Exceptions · Access review. OT = IEC 62443 zones and conduits (target SL-T vs achieved SL-A);
   physical = defence in depth with EN 50600-2-5 style protection classes; data sources = sensor → OTel → OCSF table in ClickHouse. */
import * as I from 'lucide-react';
import type { SecOtZone, SecPhysLayer, SecSource } from '../../api/types';
import { Chip, Panel, Tabs } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { Facts, SoftMeter, Split, StatGrid, StatTile, type Part } from '../../ui/Analytics';

/* at most three bar parts from a count map, biggest first, the rest folded into "Other" */
const top3 = (m: Map<string, number>, tone: Part['tone'] = 'info'): Part[] => { const xs = [...m].sort((a, b) => b[1] - a[1]); const head = xs.slice(0, 2).map(([k, n]) => ({ key: k, label: k, n, tone })); const rest = xs.slice(2).reduce((a, [, n]) => a + n, 0); return rest ? [...head, { key: '_o', label: 'Other', n: rest, tone: 'neutral' }] : head; };
const countBy = <T,>(xs: T[], f: (x: T) => string, w: (x: T) => number = () => 1) => xs.reduce((m, x) => m.set(f(x), (m.get(f(x)) ?? 0) + w(x)), new Map<string, number>());
const KIND_SHORT: Record<string, string> = { 'UPS NMC': 'UPS cards', 'PDU fleet': 'Rack PDUs', 'Cooling controller': 'Cooling', 'Power controller': 'Power', VMS: 'Cameras', 'PACS controller': 'Access control', 'Fire panel': 'Fire', BMS: 'BMS', Monitoring: 'DCIM' };
import { DcLink, Meter } from '../../ui/status';
import { fmtAgo, fmtDate, fmtDateTime, fmtNum } from '../../lib/format';
import type { SecProps } from './SecOps';
import { DomainTag, SEVS, SevChip, StateChip, pct } from './common';

/* ---------------------------------------------------------------- OT */
const ZONE_KEYS: [string, string][] = [['EL', 'Electrical'], ['ME', 'Mechanical'], ['FS', 'Fire & life safety'], ['PS', 'Physical security'], ['MON', 'DCIM & monitoring']];
const SlChip = ({ z }: { z?: SecOtZone }) => !z ? <span className="vw-label">—</span>
  : <span className={`so-sl-chip${z.slA < z.slT ? ' is-short' : ''}`} title={`${z.name}: achieved SL ${z.slA} of target SL ${z.slT}${z.findings.length ? ' · ' + z.findings.join(' · ') : ''}`}><b>SL {z.slA}</b><small>of {z.slT}</small></span>;

export function OtView({ v, q, set, go, dcId }: SecProps) {
  const apply = useParamPatch();
  const view = q('otv') || 'zones';
  const otf = q('otf'), search = q('q');
  const short = v.otZones.filter(z => z.slA < z.slT);
  const creds = v.otAssets.reduce((s, a) => s + a.defaultCreds, 0), reach = v.otAssets.filter(a => a.reachableFromIt).length;
  const units = v.otAssets.reduce((s, a) => s + a.units, 0), clear = v.otAssets.filter(a => a.cleartext).length;
  const otDet = v.detections.filter(d => d.domain === 'Facility OT'), otOpen = otDet.filter(d => d.state !== 'Closed');
  const risk = (r: string) => v.otAssets.filter(a => a.risk === r).length;
  const rows = v.otAssets.filter(a => (!otf || (otf === 'creds' ? a.defaultCreds > 0 : otf === 'reach' ? a.reachableFromIt : otf === 'risk' ? a.risk === 'Critical' || a.risk === 'High' : true))
    && (!search || `${a.name} ${a.kind} ${a.vendor} ${a.dcId} ${a.protocols.join(' ')}`.toLowerCase().includes(search.toLowerCase())));
  const zoneName = new Map(v.otZones.map(z => [z.id, z.name.replace(/ \(.*$/, '')]));
  const sites = [...new Set(v.otZones.map(z => z.dcId))].map(dc => ({ id: dc, zones: v.otZones.filter(z => z.dcId === dc) }))
    .map(s => ({ ...s, short: s.zones.filter(z => z.slA < z.slT).length, findings: s.zones.reduce((n, z) => n + z.findings.length, 0) }))
    .sort((a, b) => b.short - a.short || b.findings - a.findings);
  const toCtl = (f: string) => set({ otv: 'controllers', otf: f });
  const kindN = (xs: typeof v.otAssets, w: (a: typeof v.otAssets[number]) => number) => top3(countBy(xs.filter(a => w(a) > 0), a => KIND_SHORT[a.kind] ?? a.kind, w), 'orange');
  const icsAll = v.techniques.filter(t => t.matrix === 'ICS'), icsCov = icsAll.filter(t => t.rules).length;
  return (
    <>
      <Tabs value={view} onChange={x => set({ otv: x === 'zones' ? '' : x, otf: '', q: '' })} tabs={[{ id: 'zones', label: 'Zones & conduits', count: v.otZones.length }, { id: 'controllers', label: 'Controllers', count: v.otAssets.length }]} />
      <StatGrid fit>
        <StatTile label="Zones below target" value={short.length} sub={`of ${v.otZones.length} zones`} subTone={short.length ? 'warn' : undefined} onClick={() => set({ otv: '' })}
          info="IEC 62443-3-2 zones (electrical, mechanical, fire, physical security, DCIM) whose achieved security level SL-A is below the target SL-T set for them. Click for the zones view.">
          <Split parts={[{ key: 's', label: 'Below target', n: short.length, tone: 'orange' }, { key: 'o', label: 'At target', n: v.otZones.length - short.length, tone: 'info' }]} />
        </StatTile>
        <StatTile label="Default credentials" value={fmtNum(creds)} sub="controllers" subTone={creds ? 'bad' : undefined} onClick={() => toCtl('creds')} info="UPS cards, PDUs, cooling controllers and cameras still on the vendor's factory account (IEC 62443-3-3 SR 1.5). Click to list them.">
          <Split parts={kindN(v.otAssets, a => a.defaultCreds)} />
        </StatTile>
        <StatTile label="Reachable from IT" value={fmtNum(reach)} sub="outside a conduit" subTone={reach ? 'warn' : undefined} onClick={() => toCtl('reach')} info="Controllers an IT network can reach without passing the OT firewall or data diode (IEC 62443-3-3 SR 5.1 segmentation). Click to list them.">
          <Split parts={kindN(v.otAssets, a => (a.reachableFromIt ? 1 : 0))} />
        </StatTile>
        <StatTile label="Controllers by risk" value={fmtNum(v.otAssets.length)} sub={`${fmtNum(units)} units`} onClick={() => toCtl('risk')} info="Every facility controller (or fleet, e.g. a site's rack PDUs) by risk: Critical = default credentials and reachable from IT, High = default credentials or a firmware flaw to act on.">
          <Split parts={[{ key: 'c', label: 'Critical', n: risk('Critical'), tone: 'error' }, { key: 'h', label: 'High', n: risk('High'), tone: 'orange' }, { key: 'o', label: 'Medium / low', n: risk('Medium') + risk('Low'), tone: 'info' }]} />
        </StatTile>
        <StatTile label="OT detections" value={fmtNum(otOpen.length)} sub={`open of ${otDet.length}`} onClick={() => go('detections', { dom: 'Facility OT' })} info="Detections from the passive OT sensor (Modbus / BACnet writes, default-credential logins, new hosts, setpoint and alarm changes), mapped to ATT&CK for ICS. Click for the queue.">
          <Split parts={[{ key: 'c', label: 'Critical', n: otDet.filter(d => d.severity === 'Critical').length, tone: 'error' }, { key: 'h', label: 'High', n: otDet.filter(d => d.severity === 'High').length, tone: 'orange' }, { key: 'o', label: 'Medium / low', n: otDet.filter(d => d.severity === 'Medium' || d.severity === 'Low').length, tone: 'info' }]} />
        </StatTile>
        <StatTile label="ICS coverage" value={`${pct(icsCov, icsAll.length)}%`} sub={`${icsCov} of ${icsAll.length} techniques`} onClick={() => go('attack', { mx: 'ICS' })} info="Share of the ATT&CK for ICS techniques in scope that an enabled rule detects. Click for the coverage view.">
          <SoftMeter pct={pct(icsCov, icsAll.length)} tone={pct(icsCov, icsAll.length) >= 60 ? 'info' : 'warning'} />
          <Facts items={[{ n: icsAll.length - icsCov, label: 'techniques without a rule', tone: icsAll.length - icsCov ? 'warn' : undefined }, { n: clear, label: 'controllers on a cleartext protocol' }]} />
        </StatTile>
      </StatGrid>


      {view === 'zones' && !dcId && <section className="vw-card-section dcim-table">
        <table className="so-ztab"><thead><tr><th>Datacenter</th>{ZONE_KEYS.map(([, n]) => <th key={n}>{n}</th>)}<th>Below target</th><th>Findings</th><th /></tr></thead>
          <tbody>{sites.map(s => (
            <tr key={s.id} onClick={() => set({ dc: s.id })}>
              <td><span className="mono ent-link">{s.id}</span></td>
              {ZONE_KEYS.map(([k]) => <td key={k}><SlChip z={s.zones.find(z => z.id === `${s.id}-${k}`)} /></td>)}
              <td className={s.short ? 'so-bad' : ''}>{s.short ? `${s.short} zone${s.short === 1 ? '' : 's'}` : '—'}</td>
              <td>{s.findings || '—'}</td><td><I.ChevronRight size={14} className="ipam-chev" /></td>
            </tr>))}</tbody></table>
        <p className="vw-label so-tnote">SL = IEC 62443 security level achieved, "of" = the zone's target. Hover a cell for its findings.</p>
      </section>}

      {view === 'zones' && dcId && <div className="so-zones">{v.otZones.map(z => (
        <div key={z.id} className={`so-zone${z.slA < z.slT ? ' is-short' : ''}`}>
          <span className="so-zone-h"><b>{z.name}</b><SlChip z={z} /></span>
          <span className="so-sl"><span className="so-sl-bar">{[1, 2, 3, 4].map(n => <i key={n} className={n <= z.slA ? 'is-a' : n <= z.slT ? 'is-t' : ''} />)}</span></span>
          <small>{z.systems} · {fmtNum(z.assets)} units</small>
          <ul>{z.conduits.map(c => <li key={c.to}><I.ArrowLeftRight size={12} />{c.to} via {c.via} · {c.rules} rules{c.open ? <b className="so-bad"> · {c.open} any-any</b> : ''}</li>)}</ul>
          {z.findings.length ? <ul className="so-zone-f">{z.findings.map(f => <li key={f}>{f}</li>)}</ul> : <p className="vw-label">No finding.</p>}
        </div>))}</div>}

      {view === 'controllers' && <section className="vw-card-section dcim-table">
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
      </section>}
    </>
  );
}

/* ---------------------------------------------------------------- physical */
const LAYER_TONE: Record<SecPhysLayer['state'], 'success' | 'warning' | 'error'> = { OK: 'success', Degraded: 'warning', Breach: 'error' };
const LAYERS: SecPhysLayer['layer'][] = ['Perimeter', 'Building', 'Data hall', 'Cage', 'Rack'];
const LAYER_CLASS: Record<SecPhysLayer['layer'], number> = { Perimeter: 1, Building: 2, 'Data hall': 3, Cage: 4, Rack: 4 };
export function PhysicalView({ v, q, set, go, dcId }: SecProps) {
  const apply = useParamPatch();
  const view = q('pv') || 'layers';
  const det = v.detections.filter(d => d.domain === 'Physical');
  const open = det.filter(d => d.state !== 'Closed');
  const breach = v.physical.filter(p => p.layers.some(l => l.state === 'Breach')), degraded = v.physical.filter(p => !breach.includes(p) && p.layers.some(l => l.state === 'Degraded'));
  const expired = v.physical.reduce((s, p) => s + p.expiredActive, 0), unused = v.physical.reduce((s, p) => s + p.unused90, 0), badges = v.physical.reduce((s, p) => s + p.badges, 0);
  const overdue = v.physical.filter(p => p.nextReview < v.now).length, corr = v.physical.reduce((s, p) => s + p.correlated, 0);
  const pst = q('pst'), search = q('q');
  const rows = det.filter(d => (!pst || (pst === 'open' ? d.state !== 'Closed' : d.severity === pst)) && (!search || `${d.title} ${d.summary} ${d.dcId} ${d.actor ?? ''}`.toLowerCase().includes(search.toLowerCase())));
  const site = dcId ? v.physical[0] : undefined;
  const inUse = badges - unused - expired;
  return (
    <>
      <Tabs value={view} onChange={x => set({ pv: x === 'layers' ? '' : x, pst: '', q: '' })} tabs={[{ id: 'layers', label: 'Layers of defence' }, { id: 'exceptions', label: 'Exceptions', count: det.length }, { id: 'review', label: 'Access review' }]} />
      <StatGrid cols={5} fit>
        <StatTile label="Layers holding" value={v.physical.length - breach.length - degraded.length} sub={`of ${v.physical.length} all OK`} onClick={() => set({ pv: '' })}
          info="Per datacenter, the five layers of defence (perimeter → building → data hall → cage → rack). A layer is Breach when a door in it was forced or has an open high-severity exception, Degraded when a door is held open or an exception of its kind is open.">
          <Split parts={[{ key: 'b', label: 'Breach', n: breach.length, tone: 'error' }, { key: 'd', label: 'Degraded', n: degraded.length, tone: 'orange' }, { key: 'o', label: 'All OK', n: v.physical.length - breach.length - degraded.length, tone: 'info' }]} />
        </StatTile>
        <StatTile label="Open exceptions" value={fmtNum(open.length)} sub={`${det.length} in 24 h`} onClick={() => set({ pv: 'exceptions', pst: 'open' })} info="Security exceptions the access-control system raised (tailgating, forced or held doors, denials, unescorted visitors…) that are not closed. They are the same records as each datacenter's Access & security tab.">
          <Split parts={SEVS.slice(1).map(s => ({ key: s, label: s, n: open.filter(d => d.severity === s).length, tone: s === 'High' ? 'orange' as const : 'info' as const }))} onPick={k => set({ pv: 'exceptions', pst: k })} />
        </StatTile>
        <StatTile label="Physical + cyber" value={corr} sub="correlated" subTone={corr ? 'bad' : undefined} onClick={() => go('detections', { dom: 'Cross-domain' })} info="Detections that join a badge-in with a logical action on equipment in the same room (rule SR-060): the strongest sign of an insider or a misused visit.">
          <Split parts={[{ key: 'c', label: 'In a case', n: open.filter(d => d.caseId).length, tone: 'orange' }, { key: 'i', label: 'Investigating', n: open.filter(d => !d.caseId && d.state === 'Investigating').length, tone: 'info' }, { key: 'n', label: 'New', n: open.filter(d => d.state === 'New').length, tone: 'info' }]} />
        </StatTile>
        <StatTile label="Expired badges active" value={expired} sub={`of ${fmtNum(badges)} badges`} subTone={expired ? 'bad' : undefined} onClick={() => set({ pv: 'review' })} info="Badges past their end date that the access-control system still accepts (ISO 27001 A.5.18). Found by the quarterly access-rights review.">
          <Split parts={[{ key: 'e', label: 'Expired, active', n: expired, tone: 'error' }, { key: 'u', label: 'Unused 90 days', n: unused, tone: 'orange' }, { key: 'k', label: 'In use', n: inUse, tone: 'info' }]} />
        </StatTile>
        <StatTile label="Reviews overdue" value={overdue} sub={`of ${v.physical.length} datacenters`} subTone={overdue ? 'warn' : undefined} onClick={() => set({ pv: 'review' })} info="The quarterly access-rights review per datacenter: who holds a badge, which zones it opens and whether it is still needed. Overdue = the next review date has passed.">
          <Split parts={[{ key: 'o', label: 'Overdue', n: overdue, tone: 'orange' }, { key: 't', label: 'On time', n: v.physical.length - overdue, tone: 'info' }]} />
          <Facts items={[{ n: '90 d', label: 'CCTV · 1 y access log kept' }]} />
        </StatTile>
      </StatGrid>


      {view === 'layers' && site && <div className="so-layer-cards">{site.layers.map(l => <div key={l.layer} className={`so-lc is-${LAYER_TONE[l.state]}`}><span><b>{l.layer}</b><Chip tone={LAYER_TONE[l.state]} size="xs" dot>{l.state}</Chip></span><small>Protection class {l.protectionClass}</small><p>{l.controls}</p><em>{l.note}</em></div>)}</div>}
      {view === 'layers' && !site && <section className="vw-card-section dcim-table">
        <table className="so-ztab"><thead><tr><th>Datacenter</th>{LAYERS.map(l => <th key={l}>{l}<small>class {LAYER_CLASS[l]}</small></th>)}<th>Open exceptions</th><th /></tr></thead>
          <tbody>{[...v.physical].sort((a, b) => b.high - a.high || b.open - a.open).map(p => (
            <tr key={p.dcId} onClick={() => set({ dc: p.dcId })}><td><span className="mono ent-link">{p.dcId}</span></td>
              {p.layers.map(l => <td key={l.layer} title={`${l.controls} · ${l.note}`}><Chip tone={LAYER_TONE[l.state]} size="xs" dot>{l.state}</Chip></td>)}
              <td className={p.high ? 'so-bad' : ''}>{p.open ? `${p.open}${p.high ? ` · ${p.high} high` : ''}` : '—'}</td><td><I.ChevronRight size={14} className="ipam-chev" /></td></tr>))}</tbody></table>
        <p className="vw-label so-tnote">Protection class rises inwards (EN 50600-2-5 style). Hover a cell for the controls in that layer.</p>
      </section>}
      {view === 'layers' && site && <Panel title="Open exceptions here" icon={I.DoorClosedLocked} count={open.length}>
        {open.length ? <ul className="ipam-find">{open.map(d => <li key={d.id}><button type="button" onClick={() => go('detections', { det: d.id })}><SevChip s={d.severity} /><span className="cell-2"><b>{d.summary}</b><small>{fmtAgo(d.at, v.now)}</small></span><StateChip s={d.state} /></button></li>)}</ul> : <p className="vw-label">Nothing open at {dcId}.</p>}
      </Panel>}

      {view === 'exceptions' && <section className="vw-card-section dcim-table">
        <DataTable rows={rows} pageSize={25} defaultSort={{ key: 'at', dir: 'desc' }} onRow={d => go('detections', { det: d.id })}
          toolbar={<ListToolbar shown={rows.length} total={det.length} noun="exceptions" onApply={apply} search={{ value: search, onChange: x => set({ q: x }), placeholder: 'Door, person, datacenter' }}
            filters={[{ id: 'pst', label: 'Show', quick: true, value: pst, anyLabel: 'All', onChange: x => set({ pst: x }), options: [{ id: 'open', label: 'Open', count: open.length }, ...SEVS.slice(1).map(s => ({ id: s, label: s, count: det.filter(d => d.severity === s).length }))] }]} />}
          cols={[
            { key: 'at', header: 'When', sort: d => d.at, render: d => <span className="cell-2"><span className="nowrap">{fmtAgo(d.at, v.now)}</span><small>{fmtDateTime(d.at)}</small></span> },
            { key: 's', header: 'Severity', sort: d => SEVS.indexOf(d.severity), render: d => <SevChip s={d.severity} /> },
            { key: 'k', header: 'Exception', wrap: true, sort: d => d.title, render: d => <span className="cell-2"><b>{d.title}</b><small>{d.asset}</small></span> },
            { key: 'p', header: 'Person', wrap: true, render: d => d.actor ?? <span className="vw-label">—</span> },
            { key: 'd', header: 'Datacenter', sort: d => d.dcId, render: d => <DcLink id={d.dcId} tab="access" /> },
            { key: 'st', header: 'State', sort: d => d.state, render: d => <span className="cell-2"><StateChip s={d.state} /><small>{d.caseId ?? d.assignee ?? ''}</small></span> }
          ]} />
      </section>}

      {view === 'review' && <section className="vw-card-section dcim-table">
        <DataTable rows={v.physical.map(p => ({ ...p, id: p.dcId }))} pageSize={30} defaultSort={{ key: 'e', dir: 'desc' }} cols={[
          { key: 'd', header: 'Datacenter', render: p => <DcLink id={p.dcId} tab="access" /> },
          { key: 'b', header: 'Badges issued', sort: p => p.badges, render: p => fmtNum(p.badges) },
          { key: 'u', header: 'Unused 90 days', sort: p => p.unused90, render: p => fmtNum(p.unused90) },
          { key: 'e', header: 'Expired, still active', sort: p => p.expiredActive, render: p => <span className={p.expiredActive ? 'so-bad' : ''}>{fmtNum(p.expiredActive)}</span> },
          { key: 'r', header: 'Next review', sort: p => p.nextReview, render: p => <span className={p.nextReview < v.now ? 'so-bad' : ''}>{fmtDate(p.nextReview)}{p.nextReview < v.now ? ' · overdue' : ''}</span> },
          { key: 'x', header: 'Exceptions, 24 h', sort: p => p.exceptions, render: p => `${p.exceptions} (${p.open} open)` },
          { key: 'c', header: 'Physical + cyber', sort: p => p.correlated, render: p => p.correlated ? <span className="so-bad">{p.correlated} correlated</span> : <span className="vw-label">—</span> }
        ]} />
      </section>}
    </>
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
