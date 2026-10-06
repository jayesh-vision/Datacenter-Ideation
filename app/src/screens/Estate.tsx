import { Fragment, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getEstate, useQuery, geoNow } from '../api';
import { usePage, PageHead, Loading } from '../shell/page';
import { Panel, PanelLink, Seg } from '../ui/kit';
import { Legend, Meter, StackBar } from '../ui/status';
import { ROLLOUT, ROLLOUT_ORDER } from '../lib/vocab';
import { fmtNum } from '../lib/format';
import { CircleMap, type Bubble } from './overview/CircleMap';
import type { RolloutStatus } from '../api/types';
import '../styles/overview.css';

type Est = NonNullable<Awaited<ReturnType<typeof getEstate>>>;
type CircleRow = Est['circles'][number];

const BLOCKER: Record<string, { label: string; note: string; icon: I.LucideIcon; c: string }> = {
  power: { label: 'Power issue', note: 'Battery backup below threshold', icon: I.Zap, c: 'var(--vw-color-red-400)' },
  fiber: { label: 'Fiber issue', note: 'Fiber cut on feeder route', icon: I.Cable, c: 'var(--vw-color-red-400)' },
  commissioning: { label: 'Commissioning hold', note: 'Site acceptance testing incomplete', icon: I.ClipboardCheck, c: 'var(--vw-color-red-400)' },
  supply: { label: 'Supply delay', note: 'Equipment delivery delayed', icon: I.Truck, c: 'var(--vw-color-red-400)' },
  lease: { label: 'Lease issue', note: 'Landlord access restriction', icon: I.FileText, c: 'var(--vw-color-amber-400)' },
  civil: { label: 'Civil work issue', note: 'Shelter / tower base pending', icon: I.HardHat, c: 'var(--vw-color-amber-400)' },
  regulatory: { label: 'Regulatory hold', note: 'Municipal approval pending', icon: I.ShieldAlert, c: 'var(--vw-color-amber-400)' }
};
const ROLE_C: Record<string, string> = { Router: 'var(--primaryColor500)', Switch: 'var(--vw-color-teal-500)', DWDM: 'var(--vw-color-purple-500)', Firewall: 'var(--vw-color-pink-500)', Access: 'var(--vw-color-cyan-500)', eNodeB: 'var(--vw-color-amber-500)', gNodeB: 'var(--vw-color-orange-500)' };
const PROTO_C: Record<string, string> = { LLDP: 'var(--vw-color-purple-500)', OSPF: 'var(--primaryColor500)', BGP: 'var(--vw-color-cyan-500)', ISIS: 'var(--vw-color-slate-500)', LSP: 'var(--vw-color-teal-500)' };
const PASSIVE: [string, string, string][] = [['fiberSpans', 'Fiber spans', 'var(--vw-color-cyan-500)'], ['odf', 'ODF', 'var(--primaryColor500)'], ['racks', 'Racks', 'var(--vw-color-slate-500)'], ['powerPlant', 'Power plant', 'var(--vw-color-amber-500)'], ['splices', 'Splice closures', 'var(--vw-color-purple-500)'], ['patchCords', 'Patch cords', 'var(--vw-color-teal-500)'], ['ducts', 'Ducts', 'var(--vw-color-orange-500)']];
const band = (p: number) => (p >= 78 ? 'var(--vw-color-emerald-600)' : p >= 72 ? 'var(--vw-color-emerald-300)' : p >= 65 ? 'var(--vw-color-amber-300)' : 'var(--vw-color-orange-400)');

/* INV-06 — estate-wide hierarchy, circles, aggregated inventory, geography. */
export function Estate() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const sel = sp.get('circle') ?? '';
  const setSel = (c: string) => { const n = new URLSearchParams(sp); c ? n.set('circle', c) : n.delete('circle'); setSp(n, { replace: true }); };
  const [colour, setColour] = useState<'onair' | 'build' | 'failed'>('onair');
  usePage([{ label: 'Location', to: '/inventory' }, { label: 'Estate' }]);
  const { data: est } = useQuery(getEstate, []);

  const bubbles = useMemo<Bubble[]>(() => (est?.circles ?? []).map(c => {
    const color = colour === 'onair' ? band(c.onAirPct) : colour === 'build' ? `color-mix(in srgb, var(--vw-color-amber-500) ${Math.min(100, 25 + c.status['in-progress'] * 2)}%, white)` : c.status.failed ? `color-mix(in srgb, var(--vw-color-red-500) ${Math.min(100, 35 + c.status.failed * 9)}%, white)` : 'var(--vw-color-slate-300)';
    return { id: c.id, lat: c.lat, lng: c.lng, r: 6 + Math.sqrt(c.total) * 1.25, color, selected: c.id === sel, tip: `${c.name} · ${c.total} locations · ${c.onAirPct}% on-air · ${c.status['in-progress']} in build · ${c.status.failed} failed` };
  }), [est, colour, sel]);

  if (!est) return <Loading />;
  const kind = (k: string) => est.kinds.find(x => x.kind === k)!;
  const card = (title: string, total: number, st: Record<RolloutStatus, number>, to: string, legend: string[] = []) => (
    <button type="button" className="card est-card" onClick={() => nav(to)}>
      <h4>{title}</h4>
      <div className="big">{fmtNum(total)}<small>locations</small></div>
      <div className="sub">{Math.round((st['on-air'] / total) * 100)}% on-air · {st.failed} failed</div>
      <StackBar parts={ROLLOUT_ORDER.map(s => ({ value: st[s], color: ROLLOUT[s].color, label: ROLLOUT[s].label }))} />
      {legend.length ? <Legend items={legend.map((l, i) => ({ label: l, color: ['var(--vw-color-purple-500)', 'var(--primaryColor500)', 'var(--vw-color-teal-500)'][i] }))} /> : <Legend items={ROLLOUT_ORDER.map(s => ({ label: <><b className="num" style={{ fontWeight: 500 }}>{fmtNum(st[s])}</b> {ROLLOUT[s].label.toLowerCase()}</>, color: ROLLOUT[s].color }))} />}
    </button>
  );
  const selC = est.circles.find(c => c.id === sel);
  const scope = selC ? selC.status : est.statusAll;
  const scopeTotal = selC ? selC.total : est.total;
  const logical = Object.values(est.proto).reduce((a, b) => a + b, 0);

  return (
    <div className="page">
      <PageHead title="Estate inventory" sub={`${fmtNum(est.total)} locations across ${est.circles.length} circles and ${est.regions.length} regions — datacenters, PoPs and sites with rollout status, discovery coverage and aggregated inventory.`}
        actions={<PanelLink onClick={() => nav('/inventory/datacenters')}>All datacenters</PanelLink>} />
      <div className="est-cards">
        {card('Total locations', est.total, est.statusAll, '/inventory/locations', [`${kind('datacenter').total} datacenters`, `${kind('pop').total} PoP locations`, `${fmtNum(kind('site').total)} sites`])}
        {card('Datacenters', kind('datacenter').total, kind('datacenter').status, '/inventory/datacenters')}
        {card('PoP locations', kind('pop').total, kind('pop').status, '/inventory/locations?kind=pop')}
        {card('Sites', kind('site').total, kind('site').status, '/inventory/locations?kind=site')}
      </div>

      <div className="grid est-g-top">
        <Panel title="Network hierarchy" sub="Datacenters at the core; PoPs and sites by circle · click a circle" icon={I.Network}>
          <Hierarchy est={est} sel={sel} onPick={c => setSel(c === sel ? '' : c)} />
          <Legend items={[{ label: 'Datacenters', color: 'var(--vw-color-purple-500)' }, { label: 'PoP locations, by circle', color: 'var(--primaryColor500)' }, { label: 'Sites, by circle', color: 'var(--vw-color-teal-500)' }]} />
        </Panel>
        <Panel title="Coverage by circle" sub="Ranked by total · open a circle for rollout blockers and aggregated inventory" icon={I.MapPinned} flush>
          <div className="circle-scroll">
            <table className="nst-table circle-tbl">
              <thead><tr><th>Circle</th><th className="is-right">DC</th><th className="is-right">PoP</th><th className="is-right">Sites</th><th className="is-right">Total</th><th>On-air</th><th className="is-right">Failed</th></tr></thead>
              <tbody>
                {est.circles.map(c => (
                  <Fragment key={c.id}>
                    <tr className={`is-click${c.id === sel ? ' is-open' : ''}`} onClick={() => setSel(c.id === sel ? '' : c.id)}>
                      <td><span className="row" style={{ gap: 8 }}><I.ChevronRight size={14} style={{ transform: c.id === sel ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} className="faint" /><b className="strong nowrap">{c.name}</b></span></td>
                      <td className="is-right num">{c.dc}</td><td className="is-right num">{c.pop}</td><td className="is-right num">{c.sites}</td><td className="is-right num strong">{c.total}</td>
                      <td><Meter pct={c.onAirPct} width={64} color={band(c.onAirPct)} /></td>
                      <td className={`is-right num ${c.status.failed ? 'bad' : 'faint'}`}>{c.status.failed}</td>
                    </tr>
                    {c.id === sel && <tr className="exp"><td colSpan={7}><CircleDetail c={c} onGo={to => nav(to)} /></td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="Inventory across the estate" sub="Everything this module tracks against these locations — active, logical and passive" icon={I.Boxes}>
        <div className="inv3">
          <div className="card inv-card" style={{ '--ic': 'var(--primaryColor200)' } as React.CSSProperties}>
            <span className="row"><span className="kpi-ico tone-info"><I.Server size={16} /></span><span className="muted">Active inventory</span></span>
            <span className="row"><b className="v">{fmtNum(est.neTotal)}</b></span>
            <p>Physical elements across the estate · {fmtNum(est.discTotal)} verified on the network ({Math.round((est.discTotal / est.neTotal) * 100)}%)</p>
            <StackBar parts={Object.entries(est.roles).map(([k, v]) => ({ value: v, color: ROLE_C[k] ?? 'var(--vw-color-slate-400)', label: k }))} />
            <div className="inv-chips">{Object.entries(est.roles).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="inv-chip"><i style={{ background: ROLE_C[k] }} />{k}<b>{fmtNum(v)}</b></span>)}</div>
          </div>
          <div className="card inv-card" style={{ '--ic': 'var(--vw-color-purple-200)' } as React.CSSProperties}>
            <span className="row"><span className="kpi-ico tone-purple"><I.Waypoints size={16} /></span><span className="muted">Logical inventory</span></span>
            <span className="row"><b className="v">{fmtNum(logical + est.services)}</b></span>
            <p>{fmtNum(logical)} protocol links and {fmtNum(est.services)} provisioned services</p>
            <StackBar parts={Object.entries(est.proto).map(([k, v]) => ({ value: v, color: PROTO_C[k], label: k }))} />
            <div className="inv-chips">
              {Object.entries(est.proto).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="inv-chip"><i style={{ background: PROTO_C[k] }} />{k}<b>{fmtNum(v)}</b></span>)}
              {Object.entries(est.svcTypes).map(([k, v]) => <button key={k} type="button" className="inv-chip" style={{ cursor: 'pointer' }} onClick={() => nav(`/services?type=${encodeURIComponent(k)}`)}><I.Waypoints size={11} />{k}<b>{fmtNum(v)}</b></button>)}
            </div>
          </div>
          <div className="card inv-card" style={{ '--ic': 'var(--vw-color-orange-200)' } as React.CSSProperties}>
            <span className="row"><span className="kpi-ico tone-orange"><I.Cable size={16} /></span><span className="muted">Passive inventory</span></span>
            <span className="row"><b className="v">{fmtNum(Object.values(est.passive).reduce((a, b) => a + b, 0))}</b></span>
            <p>Physical plant across {PASSIVE.length} categories</p>
            <StackBar parts={PASSIVE.map(([k, l, c]) => ({ value: est.passive[k] ?? 0, color: c, label: l }))} />
            <div className="inv-chips">{PASSIVE.map(([k, l, c]) => <span key={k} className="inv-chip"><i style={{ background: c }} />{l}<b>{fmtNum(est.passive[k] ?? 0)}</b></span>)}</div>
          </div>
        </div>
      </Panel>

      <Panel title="Sites by geography" sub="One bubble per circle, sized by location count" icon={I.Map}
        actions={<><span className="muted" style={{ fontSize: 12.5 }}>Colour by</span><Seg size="sm" value={colour} onChange={setColour} options={[{ id: 'onair', label: 'On-air rate' }, { id: 'build', label: 'Sites in build' }, { id: 'failed', label: 'Failed builds' }]} /></>}>
        <div className="geo">
          <div className="geo-map">
            <CircleMap bubbles={bubbles} onPick={id => setSel(id === sel ? '' : id)} />
            <div className="map-legend">
              {colour === 'onair' ? [['≥ 78%', band(80)], ['72 – 77%', band(74)], ['65 – 71%', band(68)], ['< 65%', band(50)]].map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)
                : <span><i style={{ background: colour === 'build' ? 'var(--vw-color-amber-500)' : 'var(--vw-color-red-500)' }} />Darker = more {colour === 'build' ? 'locations in build' : 'failed builds'}</span>}
            </div>
          </div>
          <div className="geo-side">
            <select className="select" value={sel} onChange={e => setSel(e.target.value)} aria-label="Circle">
              <option value="">All {geoNow().label} — every circle</option>
              {est.circles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="row between"><b className="strong">{selC ? selC.name : `All ${geoNow().label}`}</b><span className="muted" style={{ fontSize: 12.5 }}>{selC ? `${selC.dc} DC · ${selC.pop} PoP · ${selC.sites} sites` : `${est.circles.length} circles`}</span></div>
            <div><span className="num strong" style={{ fontSize: 24 }}>{fmtNum(scopeTotal)}</span> <span className="muted">locations · {Math.round((scope['on-air'] / scopeTotal) * 100)}% on-air</span></div>
            <StackBar height={12} parts={ROLLOUT_ORDER.map(s => ({ value: scope[s], color: ROLLOUT[s].color, label: ROLLOUT[s].label }))} />
            <div className="geo-stat">
              {ROLLOUT_ORDER.map(s => (
                <button key={s} type="button" onClick={() => nav(`/inventory/locations?status=${s}${sel ? `&circle=${sel}` : ''}`)}>
                  <span><i style={{ background: ROLLOUT[s].color }} />{ROLLOUT[s].label}</span><b>{fmtNum(scope[s])}</b>
                </button>
              ))}
            </div>
            {selC ? (
              <div className="col" style={{ gap: 6 }}>
                <span className="dsec">Discovery coverage</span>
                <Meter pct={(selC.discovered / Math.max(1, selC.ne)) * 100} width={180} label={`${fmtNum(selC.discovered)} / ${fmtNum(selC.ne)} NE`} color="var(--primaryColor500)" />
                <PanelLink onClick={() => nav(`/inventory/locations?circle=${selC.id}`)}>Open {selC.total} locations</PanelLink>
              </div>
            ) : (
              <table className="nst-table geo-circ">
                <tbody>{est.circles.slice(0, 8).map(c => <tr key={c.id} onClick={() => setSel(c.id)}><td>{c.name}</td><td className="is-right num">{c.total}</td><td style={{ width: 120 }}><Meter pct={c.onAirPct} width={56} color={band(c.onAirPct)} /></td></tr>)}</tbody>
              </table>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function CircleDetail({ c, onGo }: { c: CircleRow; onGo: (to: string) => void }) {
  const bl = Object.entries(c.blockers).sort((a, b) => b[1] - a[1]);
  return (
    <div className="col" style={{ gap: 12 }}>
      <div><b className="strong" style={{ fontSize: 13 }}>Alert summary</b><div className="muted" style={{ fontSize: 12 }}>Blocked, delayed and at-risk locations in this circle</div></div>
      {bl.length ? (
        <div className="blk-grid">
          {bl.map(([k, n]) => {
            const b = BLOCKER[k];
            return (
              <button key={k} type="button" className="blk" style={{ '--bc': b.c } as React.CSSProperties} onClick={() => onGo(`/inventory/locations?circle=${c.id}&blocker=${k}`)}>
                <span className="kpi-ico tone-error" style={{ width: 28, height: 28 }}><b.icon size={14} /></span>
                <span style={{ minWidth: 0 }}><b>{b.label}</b><small>{b.note}</small></span>
                <span className="num">{n}</span>
              </button>
            );
          })}
        </div>
      ) : <div className="note note--good"><I.CheckCircle2 size={14} />No rollout blockers in this circle.</div>}
      <div className="row between"><span><b className="strong" style={{ fontSize: 13 }}>Aggregated inventory</b><div className="muted" style={{ fontSize: 12 }}>Total across every site, PoP and datacenter in this circle</div></span><button type="button" className="panel-link" onClick={() => onGo(`/inventory/locations?circle=${c.id}`)}>Open {c.total} locations<I.ChevronRight size={14} /></button></div>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="inv-chip"><I.Server size={12} />Active NE<b>{fmtNum(c.ne)}</b></span>
        <span className="inv-chip"><I.Radar size={12} />Discovered<b>{fmtNum(c.discovered)}</b></span>
        <span className="inv-chip"><I.Cable size={12} />Passive items<b>{fmtNum(c.passive)}</b></span>
        <span className="inv-chip"><I.Construction size={12} />In build<b>{c.status['in-progress']}</b></span>
        <span className="inv-chip"><I.CalendarClock size={12} />Planned<b>{c.status.planned}</b></span>
      </div>
    </div>
  );
}

/* radial hierarchy: centre = datacenters, spoke per circle (PoP inner, sites outer) */
function Hierarchy({ est, sel, onPick }: { est: Est; sel: string; onPick: (c: string) => void }) {
  const W = 560, H = 470, cx = W / 2, cy = H / 2 - 6;
  const top = est.circles.slice(0, 8);
  const rest = est.circles.slice(8);
  const spokes = [...top.map(c => ({ id: c.id, label: c.id, pop: c.pop, sites: c.sites })), { id: '', label: 'OTH', pop: rest.reduce((a, c) => a + c.pop, 0), sites: rest.reduce((a, c) => a + c.sites, 0) }];
  const dcs = est.kinds.find(k => k.kind === 'datacenter')!.total;
  return (
    <svg className="hier" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Network hierarchy">
      {spokes.map((s, i) => {
        const a = (i / spokes.length) * Math.PI * 2 - Math.PI / 2;
        const p1 = [cx + Math.cos(a) * 112, cy + Math.sin(a) * 112], p2 = [cx + Math.cos(a) * 190, cy + Math.sin(a) * 190];
        const on = sel && s.id === sel;
        return (
          <g key={s.label} className="n" onClick={() => s.id && onPick(s.id)} opacity={sel && !on ? 0.45 : 1}>
            <title>{s.id ? `${s.label}: ${s.pop} PoPs · ${s.sites} sites` : `${rest.length} smaller circles: ${s.pop} PoPs · ${s.sites} sites`}</title>
            <line x1={cx} y1={cy} x2={p2[0]} y2={p2[1]} stroke="#D7DEE7" strokeWidth={1.2} />
            <circle cx={p1[0]} cy={p1[1]} r={19} fill="#fff" stroke="#1C81EF" strokeWidth={on ? 2.6 : 1.6} />
            <text x={p1[0]} y={p1[1] + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0F172A" fontFamily="Inter">{s.pop}</text>
            <text x={p1[0]} y={p1[1] - 25} textAnchor="middle" fontSize={10} fill="#64748B" fontFamily="Poppins" fontWeight={500}>{s.label}</text>
            <circle cx={p2[0]} cy={p2[1]} r={23} fill="#fff" stroke="#14B8A6" strokeWidth={on ? 2.8 : 1.8} />
            <text x={p2[0]} y={p2[1] + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0F172A" fontFamily="Inter">{s.sites}</text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={50} fill="#F5F3FF" stroke="#8B5CF6" strokeWidth={2} />
      <text x={cx} y={cy + 2} textAnchor="middle" fontSize={22} fontWeight={600} fill="#4C1D95" fontFamily="Inter">{dcs}</text>
      <text x={cx} y={cy + 19} textAnchor="middle" fontSize={10.5} fill="#7C3AED" fontFamily="Poppins">Datacenters</text>
    </svg>
  );
}
