import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getDatacenters, getNetworkElement, getTopology, useQuery, defaultDcId } from '../api';
import { usePage, PageHead, Loading } from '../shell/page';
import { useSize } from '../charts/core';
import { Btn, Chip, Drawer, Empty, KV, Seg, Toggle } from '../ui/kit';
import { HealthChip, Legend, SevDot } from '../ui/status';
import { scoreColor, utilColor } from '../lib/vocab';
import { fmtAgo } from '../lib/format';
import './ops/shared';

type Base = 'health' | 'reach' | 'util' | 'alarms';
type Node = Awaited<ReturnType<typeof getTopology>>['nodes'][number];
const LAYERS: { id: Node['layer']; label: string }[] = [{ id: 'core', label: 'Core' }, { id: 'spine', label: 'Spine' }, { id: 'leaf', label: 'Leaf / TOR' }, { id: 'access', label: 'Access' }];
const G = 'var(--vw-color-emerald-500)', A = 'var(--vw-color-orange-500)', R = 'var(--vw-color-red-500)';

/* Layered, dependency-aware topology for one site (DC-NET-010). */
export function Topology() {
  const [sp, setSp] = useSearchParams();
  const dc = sp.get('dc') ?? defaultDcId();
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  usePage([{ label: 'Operate' }, { label: 'Topology' }, { label: dc }], { dcId: dc });
  const { data: dcs } = useQuery(getDatacenters, []);
  if (!dcs) return <Loading />;
  const dcRow = dcs.find(d => d.id === dc);

  return (
    <div className="page">
      <PageHead title="Network topology" sub={`Layered physical (LLDP) topology for ${dc}${dcRow ? ` · ${dcRow.city}` : ''}. Hover a node to trace its neighbours; click for detail.`}
        actions={<>
          <select className="select" value={dc} onChange={e => set('dc', e.target.value)} aria-label="Datacenter">{dcs.filter(d => d.discovered > 0).map(d => <option key={d.id} value={d.id}>{d.id} · {d.city}</option>)}</select>
          <Link to={`/datacenters/${dc}?tab=topology`} className="nst-btn nst-btn--sm"><I.Building2 size={15} />Site profile</Link>
        </>} />
      <TopologyView key={dc} dc={dc} />
    </div>
  );
}

/* The topology body (controls, canvas, node drawer) for one datacenter — used by the
   Topology page and by the datacenter page's Topology tab. Base layer lives in ?layer. */
export function TopologyView({ dc }: { dc: string }) {
  const [sp, setSp] = useSearchParams();
  const base = (sp.get('layer') ?? 'health') as Base;
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const [badges, setBadges] = useState(true);
  const [links, setLinks] = useState(true);
  const [pick, setPick] = useState<string | null>(null);
  const { data: topo } = useQuery(() => getTopology(dc), [dc]);
  if (!topo) return <Loading label="Loading topology" />;
  if (!topo.nodes.length) return <section className="card"><Empty icon={I.Network} title="No topology yet">{dc} has no discovered network elements, so there is no LLDP topology to draw.</Empty></section>;
  const unreach = topo.nodes.filter(n => !n.reach).length;

  return (
    <>
      <section className="card topo-bar">
        <div className="row wrap" style={{ gap: 12 }}>
          <span className="ops-label" style={{ margin: 0 }}>Base layer</span>
          <Seg<Base> value={base} onChange={v => set('layer', v === 'health' ? '' : v)} options={[{ id: 'health', label: 'Node health', icon: I.Heart }, { id: 'reach', label: 'Reachability', icon: I.Radar }, { id: 'util', label: 'Peak utilisation', icon: I.Activity }, { id: 'alarms', label: 'Alarm load', icon: I.BellRing }]} />
          <span className="topo-sep" />
          <label className="row" style={{ gap: 8, fontSize: 13 }}><Toggle on={badges} onChange={setBadges} label="Alarm badges" />Alarm badges</label>
          <label className="row" style={{ gap: 8, fontSize: 13 }}><Toggle on={links} onChange={setLinks} label="Links" />Links</label>
        </div>
        <div className="row wrap topo-counts">
          <span className="ops-label" style={{ margin: 0 }}>In view</span>
          {LAYERS.map(L => <Chip key={L.id} tone="neutral" size="xs">{L.label} <b className="num">{topo.nodes.filter(n => n.layer === L.id).length}</b></Chip>)}
          <Chip tone={unreach ? 'error' : 'success'} size="xs">Unreachable <b className="num">{unreach}</b></Chip>
          <Chip tone="info" size="xs">Backhaul <b className="num">{topo.external.length}</b></Chip>
          {topo.hosts > 0 && <Chip tone="neutral" size="xs" title="Compute, storage and GPU hosts hang off their ToR switches and are not drawn">Hosts behind ToR <b className="num">{topo.hosts - topo.tenantGear}</b></Chip>}
          {topo.tenantGear > 0 && <Chip tone="neutral" size="xs" title="Tenant-owned equipment is not polled and is not part of the operator fabric">Tenant equipment <b className="num">{topo.tenantGear}</b></Chip>}
        </div>
      </section>
      <TopoCanvas topo={topo} dc={dc} base={base} badges={badges} links={links} pick={pick} setPick={setPick} />
      <Drawer open={!!pick} onClose={() => setPick(null)} width={460} title={pick ? <span className="mono">{pick.replace(`${dc}-`, '')}</span> : ''} sub={pick ?? ''}
        foot={pick && <><Btn onClick={() => setPick(null)}>Close</Btn><Link className="nst-btn nst-btn--sm nst-btn--filled" to={`/ne/${encodeURIComponent(pick)}`}>Open network element<I.ArrowRight size={15} /></Link></>}>
        {pick && <NodeSummary id={pick} />}
      </Drawer>
    </>
  );
}

function NodeSummary({ id }: { id: string }) {
  const { data } = useQuery(() => getNetworkElement(id), [id]);
  if (!data) return <Loading />;
  const { ne, alerts, links, services, interfaces } = data;
  const now = clockNow();
  const act = alerts.filter(a => a.state !== 'cleared');
  const byP: Record<string, { up: number; other: number }> = {};
  links.forEach(l => { byP[l.protocol] ??= { up: 0, other: 0 }; l.state === 'up' ? byP[l.protocol].up++ : byP[l.protocol].other++; });
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row wrap" style={{ gap: 8 }}><HealthChip s={ne.health}>Health {Math.round(ne.healthScore)}</HealthChip><Chip size="sm" tone="neutral">{ne.role} · {ne.layer}</Chip>{ne.icmp.state === 'critical' && <Chip tone="error">Unreachable</Chip>}</div>
      <KV cols={2} items={[['Vendor / model', `${ne.vendor} ${ne.model}`], ['IP address', <span className="num">{ne.ip}</span>], ['Rack', ne.rackId.replace(`${ne.dcId}-`, '')], ['CPU · Mem · Temp', <span className="num">{ne.cpu}% · {ne.mem}% · {ne.tempC}°C</span>],
        ['Interfaces up', <span className="num">{interfaces.filter(i => i.state === 'up').length}/{interfaces.length}</span>], ['Services', <span className="num">{services.length}</span>]]} />
      <div><div className="ops-label">Links by protocol</div><div className="row wrap" style={{ gap: 6 }}>{Object.entries(byP).map(([p, v]) => <Chip key={p} size="xs" tone={v.other ? 'warning' : 'success'}>{p} {v.up} up{v.other ? ` · ${v.other} down/idle` : ''}</Chip>)}{!links.length && <span className="faint">No links</span>}</div></div>
      <div><div className="ops-label">Active alarms ({act.length})</div>{act.length ? <div className="col" style={{ gap: 6 }}>{act.slice(0, 6).map(a => <Link key={a.id} to={`/ne/${encodeURIComponent(id)}?tab=alerts`} className={`alert-row sev-${a.severity}`}><SevDot s={a.severity} /><span style={{ flex: 1, minWidth: 0 }}><b>{a.title}</b><small>{a.code}{a.ifName ? ` · ${a.ifName}` : ''} · {fmtAgo(a.start, now)}</small></span></Link>)}</div> : <span className="faint" style={{ fontSize: 13 }}>None</span>}</div>
    </div>
  );
}

function TopoCanvas({ topo, dc, base, badges, links, pick, setPick }: { topo: Awaited<ReturnType<typeof getTopology>>; dc: string; base: Base; badges: boolean; links: boolean; pick: string | null; setPick: (id: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const [ref, size] = useSize<HTMLDivElement>();
  const W = Math.max(640, size.width);

  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number; r: number }>();
    const nb = new Map<string, string[]>();
    topo.edges.forEach(e => { nb.set(e.a, [...(nb.get(e.a) ?? []), e.z]); nb.set(e.z, [...(nb.get(e.z) ?? []), e.a]); });
    const padX = 40, top = 54, bands: { id: string; label: string; y: number; count: number }[] = [];
    let y = top;
    for (const L of LAYERS) {
      let ns = topo.nodes.filter(n => n.layer === L.id);
      /* barycentre ordering against already-placed layers to cut crossings */
      if (L.id !== 'core') ns = ns.map(n => { const xs = (nb.get(n.id) ?? []).map(m => pos.get(m)?.x).filter((v): v is number => v !== undefined); return { n, k: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : W / 2 }; }).sort((a, b) => a.k - b.k).map(x => x.n);
      else ns = [...ns].sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'Router' ? -1 : 1));
      const r = L.id === 'access' ? 8 : 12;
      const minGap = L.id === 'access' ? 30 : L.id === 'leaf' ? 46 : 64;
      const perRow = Math.max(1, Math.floor((W - padX * 2) / minGap));
      const rows = Math.max(1, Math.ceil(ns.length / perRow));
      bands.push({ id: L.id, label: L.label, y, count: ns.length });
      for (let ri = 0; ri < rows; ri++) {
        const chunk = ns.slice(ri * perRow, (ri + 1) * perRow);
        const gap = (W - padX * 2) / Math.max(1, chunk.length);
        chunk.forEach((n, i) => pos.set(n.id, { x: padX + gap * (i + 0.5), y: y + 22 + ri * 46, r }));
      }
      y += 22 + rows * 46 + 34;
    }
    const showLabels = new Map<string, boolean>();
    for (const L of LAYERS) { const ns = topo.nodes.filter(n => n.layer === L.id); const perRow = Math.max(1, Math.floor((W - 80) / (L.id === 'access' ? 30 : L.id === 'leaf' ? 46 : 64))); const gap = (W - 80) / Math.min(ns.length || 1, perRow); ns.forEach(n => showLabels.set(n.id, gap >= 78)); }
    return { pos, H: y, bands, nb, showLabels };
  }, [topo, W]);

  if (!layout) return null;
  const color = (n: Node) => base === 'health' ? (n.reach ? scoreColor(n.health) : R) : base === 'reach' ? (n.reach ? G : R) : base === 'util' ? utilColor(n.util) : n.alarms === 0 ? G : n.alarms <= 2 ? A : R;
  const ext = new Map<string, number>(); topo.external.forEach(e => ext.set(e.local, (ext.get(e.local) ?? 0) + 1));
  const extDown = new Map<string, number>(); topo.external.filter(e => e.state === 'down').forEach(e => extDown.set(e.local, (extDown.get(e.local) ?? 0) + 1));
  const hi = hover ? new Set([hover, ...(layout.nb.get(hover) ?? [])]) : null;
  const legend = base === 'health' ? [{ label: '≥80', color: G }, { label: '60–79', color: A }, { label: '<60 / unreachable', color: R }]
    : base === 'reach' ? [{ label: 'Reachable', color: G }, { label: 'Unreachable', color: R }]
      : base === 'util' ? [{ label: '<75%', color: G }, { label: '75–84%', color: 'var(--vw-color-amber-500)' }, { label: '≥85%', color: R }]
        : [{ label: 'No alarms', color: G }, { label: '1–2', color: A }, { label: '3+', color: R }];
  return (
    <section className="card topo-canvas">
        <div ref={ref} style={{ width: '100%' }}>
          {size.width > 0 && (
            <svg width={W} height={layout.H} role="img" aria-label={`Topology of ${dc}`}>
              {layout.bands.map(b => <text key={b.id} x={16} y={b.y} className="topo-band">{b.label.toUpperCase()} · {b.count}</text>)}
              {links && topo.edges.map(e => {
                const a = layout.pos.get(e.a), z = layout.pos.get(e.z); if (!a || !z) return null;
                const on = hi ? hi.has(e.a) && hi.has(e.z) && (e.a === hover || e.z === hover) : false;
                const down = e.state === 'down';
                return <line key={e.id} x1={a.x} y1={a.y} x2={z.x} y2={z.y} className={`topo-edge${down ? ' is-down' : ''}${on ? ' is-on' : ''}${hi && !on ? ' is-dim' : ''}`} />;
              })}
              {topo.nodes.filter(n => n.layer === 'core' && ext.get(n.id)).map(n => {
                const p = layout.pos.get(n.id)!;
                return <g key={`x${n.id}`} className="topo-ext"><line x1={p.x} y1={p.y - p.r} x2={p.x} y2={p.y - 30} className={extDown.get(n.id) ? 'is-down' : ''} /><text x={p.x + 4} y={p.y - 32}>↗ {ext.get(n.id)} backhaul{extDown.get(n.id) ? ` · ${extDown.get(n.id)} down` : ''}</text></g>;
              })}
              {topo.nodes.map(n => {
                const p = layout.pos.get(n.id)!;
                const dim = hi && !hi.has(n.id);
                return (
                  <g key={n.id} className={`topo-node${dim ? ' is-dim' : ''}${pick === n.id ? ' is-pick' : ''}`} transform={`translate(${p.x},${p.y})`} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => setPick(n.id)}>
                    <title>{`${n.name}\n${n.role} · health ${n.health} · ${n.alarms} alarms · peak ${Math.round(n.util)}%${n.hosts ? ` · ${n.hosts} hosts` : ''}${n.reach ? '' : ' · UNREACHABLE'}`}</title>
                    <circle r={p.r + 6} className="hit" />
                    <circle r={p.r} fill={color(n)} />
                    {badges && n.alarms > 0 && <g transform={`translate(${p.r * 0.75},${-p.r * 0.75})`}><circle r={7} className="topo-badge" /><text className="topo-badge-t" textAnchor="middle" dy={3}>{n.alarms > 9 ? '9+' : n.alarms}</text></g>}
                    {(layout.showLabels.get(n.id) || hover === n.id || pick === n.id) && <text y={p.r + 13} textAnchor="middle" className={`topo-label${hover === n.id || pick === n.id ? ' is-strong' : ''}`}>{n.name.replace(`${dc}-`, '')}</text>}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
        <div className="topo-foot"><Legend items={legend} /><span className="faint">· {dc} · {topo.nodes.length} discovered NE · {topo.edges.length} physical links ({topo.edges.filter(e => e.state === 'down').length} down, red dashed) · click a node for detail</span></div>
      </section>
  );
}
