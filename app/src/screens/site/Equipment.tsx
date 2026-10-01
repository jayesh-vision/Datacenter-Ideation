import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { getInterfaces, getLink, getLinks, getNetworkElements, useQuery } from '../../api';
import type { CableCore } from '../../api/types';
import { Drawer, Empty, IconBtn, Chip, KV } from '../../ui/kit';
import { LinkStateChip, NeLink, ServiceChip, SvcLink, CustLink, Meter } from '../../ui/status';
import { fmtBw } from '../../lib/format';
import type { SiteData } from './Site';
import { useWidth } from '../../charts/core';

const STRAND: Record<string, string> = {
  Blue: 'var(--vw-color-blue-500)', Orange: 'var(--vw-color-orange-500)', Green: 'var(--vw-color-emerald-500)', Brown: 'var(--vw-color-amber-700)', Slate: 'var(--vw-color-slate-500)',
  White: 'var(--vw-color-slate-300)', Red: 'var(--vw-color-red-500)', Black: 'var(--vw-color-slate-800)', Yellow: 'var(--vw-color-yellow-500)', Violet: 'var(--vw-color-violet-500)',
  Rose: 'var(--vw-color-rose-400)', Aqua: 'var(--vw-color-cyan-400)'
};
const P_H = 22, P_GAP = 5, TOP = 40;

/* INV-05 — cable view: incoming cores → equipment → outgoing cores, from the
   site's cabling ledger (DC-INV-008/009, DC-NET-004). */
export function Equipment({ data }: { data: SiteData }) {
  const { dc } = data;
  const nav = useNavigate();
  const { data: nes } = useQuery(() => getNetworkElements({ dcId: dc.id }), [dc.id]);
  const [zoomSet, setZoom] = useState<number | null>(null);
  const [boxRef, boxW] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<CableCore | null>(null);
  const [full, setFull] = useState(false);
  const ledger = dc.cabling.ledger;
  const connected = ledger.filter(c => c.state === 'connected');
  const direct = ledger.filter(c => c.state === 'direct');
  const free = ledger.filter(c => c.state === 'free');
  const equip = useMemo(() => {
    const m = new Map<string, CableCore[]>();
    connected.forEach(c => m.set(c.neId!, [...(m.get(c.neId!) ?? []), c]));
    return [...m.entries()].map(([id, conns]) => ({ id, conns, ne: nes?.find(n => n.id === id) }));
  }, [connected, nes]);

  /* diagram geometry */
  const W = 1040, inX = 18, portW = 82, outX = W - 18 - portW, eqW = 280, eqX = (W - eqW) / 2;
  const portY = (p: number) => TOP + (p - 1) * (P_H + P_GAP);
  const portsH = TOP + ledger.length * (P_H + P_GAP) + 10;
  let cy = TOP;
  const boxes = equip.map(e => { const h = 40 + e.conns.length * 28 + 6; const y = cy; cy += h + 18; return { ...e, y, h }; });
  const H = Math.max(portsH, cy + 10);
  const fit = boxW ? Math.min(1, Math.max(0.5, (boxW - 34) / W)) : 1;
  const zoom = zoomSet ?? fit;
  const curve = (x1: number, y1: number, x2: number, y2: number) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;

  const diagram = (
    <div ref={boxRef} className={`cable-scroll${full ? ' is-full' : ''}`}>
      <svg width={W * zoom} height={H * zoom} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cable diagram">
        <rect x={inX} y={6} width={portW} height={24} rx={6} className="cd-head" /><text x={inX + portW / 2} y={22} textAnchor="middle" className="cd-head-t">IN-FDMS</text>
        <rect x={outX} y={6} width={portW} height={24} rx={6} className="cd-head is-out" /><text x={outX + portW / 2} y={22} textAnchor="middle" className="cd-head-t is-out">OUT-FDMS</text>
        {/* wires first so ports sit on top */}
        {direct.map(c => <path key={`d${c.port}`} d={`M${inX + portW},${portY(c.port) + P_H / 2} L${outX},${portY(c.outPort!) + P_H / 2}`} stroke="var(--vw-color-slate-400)" strokeWidth={1.6} fill="none" />)}
        {boxes.map(b => b.conns.map((c, k) => {
          const ry = b.y + 40 + k * 28 + 11;
          const col = STRAND[c.strand ?? 'Slate'];
          return (
            <g key={`w${c.port}`} className={sel?.port === c.port ? 'cd-wire is-sel' : 'cd-wire'} onClick={() => setSel(c)}>
              <path d={curve(inX + portW, portY(c.port) + P_H / 2, eqX + 8, ry)} stroke={col} strokeWidth={1.8} fill="none" />
              <path d={curve(eqX + eqW - 8, ry, outX, portY(c.outPort!) + P_H / 2)} stroke={col} strokeWidth={1.8} fill="none" />
            </g>
          );
        }))}
        {ledger.map(c => {
          const used = c.state !== 'free';
          return (
            <g key={c.port} className="cd-port" onClick={() => used && setSel(c)}>
              <rect x={inX} y={portY(c.port)} width={portW} height={P_H} rx={5} className={used ? 'is-used' : ''} />
              <text x={inX + portW / 2} y={portY(c.port) + 15} textAnchor="middle">Port-{c.port}</text>
              <rect x={outX} y={portY(c.port)} width={portW} height={P_H} rx={5} className={ledger.some(x => x.outPort === c.port && x.state !== 'free') ? 'is-used is-out' : ''} />
              <text x={outX + portW / 2} y={portY(c.port) + 15} textAnchor="middle">Port-{c.port}</text>
            </g>
          );
        })}
        {boxes.map(b => (
          <g key={b.id} className="cd-eq" onClick={() => nav(`/ne/${b.id}`)}>
            <rect x={eqX} y={b.y} width={eqW} height={b.h} rx={10} />
            <text x={eqX + eqW / 2} y={b.y + 24} textAnchor="middle" className="cd-eq-t">{b.id.replace(`${dc.id}-`, '')}</text>
            {b.conns.map((c, k) => (
              <g key={c.port}>
                <rect x={eqX + 8} y={b.y + 40 + k * 28} width={104} height={22} rx={5} className="cd-if" />
                <text x={eqX + 60} y={b.y + 40 + k * 28 + 15} textAnchor="middle" className="cd-if-t">{c.inIf}</text>
                <rect x={eqX + eqW - 112} y={b.y + 40 + k * 28} width={104} height={22} rx={5} className="cd-if" />
                <text x={eqX + eqW - 60} y={b.y + 40 + k * 28 + 15} textAnchor="middle" className="cd-if-t">{c.outIf}</text>
              </g>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row between wrap">
        <div className="row wrap" style={{ gap: 10 }}><h3 className="cable-title">Cable view</h3><span className="muted" style={{ fontSize: 13.5 }}>{connected.length + direct.length} of {ledger.length} incoming cores patched across {equip.length} equipment, from the site's cabling ledger</span></div>
        <Chip tone="info">Ledger data</Chip>
      </div>
      <section className="card">
        <div className="cable-head">
          <div>
            <b className="mono" style={{ fontSize: 17 }}>{dc.id}</b>
            <div className="muted" style={{ fontSize: 12.5 }}>{dc.city}, {dc.state} · Datacenter · {dc.cabling.cable} · {dc.locationId}</div>
          </div>
        </div>
        <div className="cable-chips">
          {[['Total', ledger.length, 'info'], ['Connected', connected.length, 'success'], ['Free', free.length, 'error'], ['Equipment', equip.length, 'purple'], ['Direct', direct.length, 'warning']].map(([l, v, t]) => (
            <span key={l as string} className={`cable-chip tone-text-${t}`}><b className="num">{v}</b>{l}</span>
          ))}
        </div>
        {!ledger.length || dc.status === 'planned' && !connected.length ? <Empty icon={I.Cable} title="No cores patched yet">The cabling ledger fills in as equipment is installed.</Empty> : (
          <div className="cable-grid">
            <div className="cable-col">
              <div className="cable-col-head">
                <div><b>Cable diagram</b><small>IN-FDMS · Equipment · OUT-FDMS</small></div>
                <div className="row" style={{ gap: 6 }}>
                  <div className="zoom"><button type="button" onClick={() => setZoom(Math.max(0.5, +(zoom - 0.1).toFixed(2)))} aria-label="Zoom out"><I.Minus size={14} /></button><span className="num">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom(Math.min(1.5, +(zoom + 0.1).toFixed(2)))} aria-label="Zoom in"><I.Plus size={14} /></button><button type="button" onClick={() => setZoom(null)} aria-label="Fit to width" title="Fit to width"><I.Scan size={13} /></button></div>
                  <IconBtn icon={full ? I.Minimize2 : I.Maximize2} title={full ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => setFull(f => !f)} />
                </div>
              </div>
              {diagram}
              <div className="cable-legend">{Object.entries(STRAND).filter(([k]) => ledger.some(c => c.strand === k)).map(([k, v]) => <span key={k}><i style={{ background: v }} />{k}</span>)}<span><i style={{ background: 'var(--vw-color-slate-400)' }} />Direct</span></div>
            </div>
            <div className="cable-col">
              <div className="cable-col-head"><div><b>Equipment</b><small>{equip.length} installed</small></div></div>
              <div className="eq-list">
                {equip.map(e => (
                  <div key={e.id} className="eq-card">
                    <button type="button" className="eq-card-head" onClick={() => nav(`/ne/${e.id}`)}>
                      <span className="eq-ico"><I.Shuffle size={16} /></span>
                      <span style={{ flex: 1, minWidth: 0 }}><b className="mono ellipsis">{e.id}</b><small>{e.ne ? `${e.ne.role} · ${e.ne.model}` : '—'} · {e.conns.length} connection{e.conns.length === 1 ? '' : 's'}</small></span>
                      <I.ChevronRight size={16} className="faint" />
                    </button>
                    <div className="eq-ports">
                      {e.conns.map(c => (
                        <button key={c.port} type="button" className="eq-port" onClick={() => setSel(c)}>
                          <span className="mono">{c.inIf}</span><span className="eq-port-to">← IN (Port-{c.port}) <i style={{ background: STRAND[c.strand ?? 'Slate'] }} /></span>
                          <span className="mono">{c.outIf}</span><span className="eq-port-to">→ OUT (Port-{c.outPort})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="cable-col">
              <div className="cable-col-head"><div><b>In → out mapping</b><small>{connected.length + direct.length} / {ledger.length} used</small></div></div>
              <div className="map-list">
                {[...ledger].sort((a, b) => (a.state === 'free' ? 1 : 0) - (b.state === 'free' ? 1 : 0) || a.port - b.port).map(c => (
                  <button key={c.port} type="button" className={`map-row${c.state === 'free' ? ' is-free' : ''}${sel?.port === c.port ? ' is-sel' : ''}`} onClick={() => c.state !== 'free' && setSel(c)} disabled={c.state === 'free'}>
                    <span className="map-port">Port-{c.port}</span>
                    {c.state === 'free' ? <span className="map-t"><b>Port-{c.port} — Not connected</b><small>Available for patching</small></span> : (
                      <span className="map-t">
                        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}><b>Port-{c.port}</b><I.ArrowRight size={12} className="faint" /><span className={`map-chip${c.state === 'direct' ? ' is-direct' : ''}`}>{c.state === 'direct' ? 'Direct' : c.neId!.replace(`${dc.id}-`, '')}</span><I.ArrowRight size={12} className="faint" /><b>Port-{c.outPort}</b></span>
                        <small><i className="site-dot" style={{ background: STRAND[c.strand ?? 'Slate'] }} />{c.strand} strand{c.state === 'connected' ? ` · ${c.inIf} → ${c.outIf}` : ' · pass-through'}</small>
                      </span>
                    )}
                    {c.state === 'free' ? <span className="free-tag">FREE</span> : <I.ChevronRight size={15} className="faint" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
      <CoreDrawer core={sel} dcId={dc.id} cable={dc.cabling.cable} onClose={() => setSel(null)} />
    </div>
  );
}

/* physical → logical: core → port → interface → protocol adjacency → services */
function CoreDrawer({ core, dcId, cable, onClose }: { core: CableCore | null; dcId: string; cable: string; onClose: () => void }) {
  const neId = core?.neId;
  const { data: ifs } = useQuery(() => (neId ? getInterfaces(neId) : Promise.resolve([])), [neId]);
  const { data: links } = useQuery(() => (neId ? getLinks({ neId }) : Promise.resolve([])), [neId]);
  const it = ifs?.find(i => i.name === core?.inIf);
  const riding = (links ?? []).filter(l => (l.aNe === neId && l.aIf === core?.inIf) || (l.zNe === neId && l.zIf === core?.inIf));
  const lldp = riding.find(l => l.protocol === 'LLDP');
  const { data: ld } = useQuery(() => (lldp ? getLink(lldp.id) : Promise.resolve(null)), [lldp?.id]);
  if (!core) return null;
  return (
    <Drawer open={!!core} onClose={onClose} width={520} title={`Core ${core.port} · ${core.strand ?? ''} strand`} sub={`${cable} · physical → logical trace`}>
      <div className="trace">
        <div className="trace-step"><span className="trace-ico"><I.Cable size={15} /></span><div><b>IN-FDMS Port-{core.port}</b><small>{core.state === 'direct' ? `Direct pass-through to OUT-FDMS Port-${core.outPort}` : `Patched to equipment, returns on OUT-FDMS Port-${core.outPort}`}</small></div></div>
        {core.state === 'direct' ? <div className="note note--info"><I.Info size={15} />Direct cores carry no active equipment at this site — the logical trace continues at the far-end site.</div> : <>
          <div className="trace-step"><span className="trace-ico"><I.Router size={15} /></span><div><b><NeLink id={neId!}>{neId!.replace(`${dcId}-`, '')}</NeLink> · {core.inIf}</b><small>{it ? `${it.type} · ${it.description || 'no description'}` : 'Loading interface…'}</small></div></div>
          {it && <KV cols={3} items={[['State', <LinkStateChip key="s" s={it.state === 'up' ? 'up' : it.state === 'down' ? 'down' : 'standby'} />], ['Utilisation', <Meter key="u" pct={it.utilPct} width={60} />], ['Rx power', it.optics ? `${it.optics.rxDbm} dBm` : '—']]} />}
          <div className="trace-step"><span className="trace-ico"><I.Waypoints size={15} /></span><div><b>Protocol adjacencies on this port</b><small>{riding.length ? `${riding.length} link record${riding.length === 1 ? '' : 's'}` : 'No adjacency — port carries server / CPE traffic or is unpatched downstream'}</small></div></div>
          {riding.length > 0 && <div className="trace-links">{riding.map(l => <span key={l.id} className="row between"><span className="row" style={{ gap: 8 }}><Chip tone="purple" size="xs">{l.protocol}</Chip><span className="mono" style={{ fontSize: 12.5 }}>→ {(l.aNe === neId ? l.zNe : l.aNe)} {(l.aNe === neId ? l.zIf : l.aIf)}</span></span><LinkStateChip s={l.state} /></span>)}</div>}
          {ld && <>
            <div className="trace-step"><span className="trace-ico"><I.Users size={15} /></span><div><b>Services riding the span</b><small>{ld.services.length ? `${ld.services.length} service${ld.services.length === 1 ? '' : 's'} · ${fmtBw(ld.link.capacityMbps)} at ${ld.link.utilPct}%` : 'Infrastructure traffic only'}</small></div></div>
            {ld.services.map(s => <div key={s.id} className="trace-svc"><SvcLink id={s.id} /><span className="ellipsis"><CustLink id={s.customerId}>{s.customer.name}</CustLink> · {s.type}</span><ServiceChip s={s.status} size="xs" /></div>)}
            <Link to={`/ne/${neId}?tab=links`} className="panel-link" onClick={onClose}>Open links & capacity forecast<I.ChevronRight size={14} /></Link>
          </>}
        </>}
      </div>
    </Drawer>
  );
}
