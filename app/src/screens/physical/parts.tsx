/* Physical last mile (12-Oct-2026, user): shared views of how power, cooling and cables reach a device.
   CablePathView = one link hop by hop · PowerChain = PSU → outlet → PDU → UPS → feed · RackPowerDrawer = a cabinet's
   PDUs, breaker banks and outlet map · WhatIfCard = "if this fails" · SpofList = single points of failure. */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { getCablePath, getSitePhysical, getWhatIf, useQuery } from '../../api';
import type { CableHop, CablePath, Datacenter, PhysState, PowerCord, RackPdu, SitePhysical, Spof } from '../../api/types';
import { Chip, Drawer, Empty, Info } from '../../ui/kit';
import { QuickSelect } from '../../ui/ListToolbar';
import { NeLink, SeverityChip } from '../../ui/status';
import { Loading } from '../../shell/page';
import { fmtNum } from '../../lib/format';
import '../../styles/physical.css';

export const STATE_TONE: Record<PhysState, 'success' | 'warning' | 'error' | 'neutral'> = { ok: 'success', warn: 'warning', bad: 'error', off: 'neutral' };
const HOP_ICON: Record<CableHop['kind'], I.LucideIcon> = { port: I.EthernetPort, optic: I.Radio, cord: I.Cable, panel: I.LayoutGrid, trunk: I.Spline, jumper: I.Shuffle, osp: I.Route };
const HOP_KIND: Record<CableHop['kind'], string> = { port: 'Port', optic: 'Optic', cord: 'Patch cord', panel: 'Patch panel', trunk: 'Trunk cable', jumper: 'Cross-connect', osp: 'Outside plant' };
const PATH_KIND: Record<CablePath['kind'], string> = { 'in-rack': 'In-rack cable', structured: 'Structured cabling via the ODF', 'inter-site': 'Leaves the site on outside-plant fibre' };
const short = (id: string, dcId: string) => id.replace(`${dcId}-`, '');

/* ---------------------------------------------------------------- cable path */

export function CablePathView({ path, compact }: { path: CablePath; compact?: boolean }) {
  return (
    <div className={`cp${compact ? ' is-compact' : ''}`}>
      <div className={`note note--${path.state === 'ok' ? 'good' : path.state === 'bad' ? 'bad' : 'warn'} cp-verdict`}>
        {path.state === 'ok' ? <I.CheckCircle2 size={15} /> : <I.Crosshair size={15} />}
        <span><b>{PATH_KIND[path.kind]}</b> · {path.verdict}{path.lengthM ? ` · about ${fmtNum(path.lengthM)} m inside buildings` : ''}</span>
      </div>
      <ol className="cp-hops">
        {path.hops.map((h, i) => {
          const Ico = HOP_ICON[h.kind];
          return (
            <li key={`${h.id}-${i}`} className={`cp-hop is-${h.state}${path.suspect === i ? ' is-suspect' : ''}`} data-hop={h.kind}>
              <span className="cp-ico"><Ico size={14} /></span>
              <span className="cp-body">
                <small>{HOP_KIND[h.kind]}{h.where ? ` · ${h.where}` : ''}</small>
                <b>{h.neId && h.kind === 'port' ? <NeLink id={h.neId} tab="physical">{h.label}</NeLink> : h.label}</b>
                {h.sub && <span className="muted">{h.sub}</span>}
                {h.note && <span className={`cp-note ${h.state === 'bad' ? 'bad' : 'warn'}`}><I.TriangleAlert size={12} />{h.note}</span>}
              </span>
              {h.state !== 'ok' && <Chip tone={STATE_TONE[h.state]} size="xs">{path.suspect === i ? 'Check first' : h.state === 'bad' ? 'Fault' : 'Watch'}</Chip>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function CablePathDrawer({ linkId, onClose }: { linkId: string | null; onClose: () => void }) {
  const { data } = useQuery(() => (linkId ? getCablePath(linkId) : Promise.resolve(null)), [linkId]);
  if (!linkId) return null;
  return (
    <Drawer open onClose={onClose} width={560} title={<span>Cable path <span className="mono faint">{linkId}</span></span>}
      sub={data ? <span className="mono">{data.aNe} {data.aIf} ⇄ {data.zNe} {data.zIf}</span> : 'Loading'}>
      {!data ? <Loading /> : <CablePathView path={data} />}
    </Drawer>
  );
}

/* ---------------------------------------------------------------- power chain */

export interface ChainStep { kind: string; id: string; name: string; sub?: string; state: PhysState; note?: string }
const STEP_ICON: Record<string, I.LucideIcon> = { psu: I.PlugZap, outlet: I.Plug, pdu: I.PanelTop, ups: I.BatteryCharging, rectifier: I.BatteryCharging, feed: I.UtilityPole };
const STEP_LABEL: Record<string, string> = { psu: 'Power supply', outlet: 'Outlet · breaker', pdu: 'Rack PDU', ups: 'UPS', rectifier: 'DC plant', feed: 'Utility feed' };
export function PowerChain({ steps }: { steps: ChainStep[] }) {
  return (
    <div className="pc">
      {steps.map((s, i) => {
        const Ico = STEP_ICON[s.kind] ?? I.Zap;
        return (
          <div key={s.id + i} className="pc-cell">
            <div className={`pc-step is-${s.state}`} title={s.note}>
              <span className="pc-h"><Ico size={13} /><small>{STEP_LABEL[s.kind] ?? s.kind}</small></span>
              <b>{s.name}</b>
              {s.sub && <span className="pc-sub">{s.sub}</span>}
              {s.note && <span className={`pc-note ${s.state === 'bad' ? 'bad' : 'warn'}`}>{s.note}</span>}
            </div>
            {i < steps.length - 1 && <I.ChevronRight size={14} className="pc-arrow" />}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- rack power */

const CORD_LABEL: Record<PowerCord['state'], string> = { live: 'Live', 'on-battery': 'On UPS battery', 'psu-failed': 'PSU failed', 'no-power': 'No power', standby: 'Standby' };
const CORD_TONE: Record<PowerCord['state'], PhysState> = { live: 'ok', 'on-battery': 'warn', 'psu-failed': 'bad', 'no-power': 'bad', standby: 'off' };
const PDU_STATE: Record<RackPdu['state'], { label: string; s: PhysState }> = { ok: { label: 'Normal', s: 'ok' }, warn: { label: 'Attention', s: 'warn' }, tripped: { label: 'Tripped', s: 'bad' }, 'on-battery': { label: 'On UPS battery', s: 'warn' } };
export const pduState = (p: RackPdu) => PDU_STATE[p.state];

export function PduCard({ p, cords, onOutlet, active }: { p: RackPdu; cords: PowerCord[]; onOutlet?: (c: PowerCord | null) => void; active?: string | null }) {
  const st = PDU_STATE[p.state];
  const byOutlet = new Map(cords.filter(c => c.pduId === p.id).map(c => [c.outlet, c]));
  const pct = p.capacityKw ? (p.loadKw / p.capacityKw) * 100 : 0;
  return (
    <div className={`pdu is-${st.s}`} data-pdu={p.id}>
      <div className="pdu-h">
        <span><b>{p.name}</b><small>{p.model}</small></span>
        <Chip tone={STATE_TONE[st.s]} size="xs">{st.label}</Chip>
      </div>
      <div className="pdu-load"><span className="dco-meter"><i style={{ width: `${Math.min(100, pct)}%` }} className={pct >= 80 ? 'is-warn' : ''} /></span><b>{p.loadKw} kW</b><small>of {p.capacityKw} kW</small></div>
      <div className="pdu-up"><I.CornerLeftUp size={12} />fed from <b>{p.upstreamName}</b> · {p.feedId}</div>
      {p.note && <div className={`pdu-note ${st.s === 'bad' ? 'bad' : 'warn'}`}>{p.note}</div>}
      <div className="pdu-banks">
        {p.banks.map(b => (
          <div key={b.id} className={`pdu-bank is-${b.state}`}>
            <span className="pdu-bank-h"><b>{b.name}</b><small>outlets {b.from}–{b.to} · {b.loadA} / {b.breakerA} A</small></span>
            <span className="pdu-outlets">
              {Array.from({ length: b.to - b.from + 1 }, (_, k) => b.from + k).map(o => {
                const c = byOutlet.get(o);
                const cls = !c ? 'is-free' : `is-${CORD_TONE[c.state]}`;
                return <button key={o} type="button" className={`pdu-o ${cls}${active && c && c.neId === active ? ' is-on' : ''}`} title={c ? `Outlet ${o} · ${c.neId} ${c.psu} · ${CORD_LABEL[c.state]}${c.drawW ? ` · ${c.drawW} W` : ''}` : `Outlet ${o} · free`}
                  onMouseEnter={() => onOutlet?.(c ?? null)} onClick={() => onOutlet?.(c ?? null)}>{o}</button>;
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RackPowerDrawer({ dc, rackId, onClose }: { dc: Datacenter; rackId: string | null; onClose: () => void }) {
  const { data } = useQuery(() => (rackId ? getSitePhysical(dc.id) : Promise.resolve(null)), [dc.id, rackId]);
  const [hover, setHover] = useState<string | null>(null);
  if (!rackId) return null;
  const rk = dc.racks.find(r => r.id === rackId);
  return (
    <Drawer open onClose={onClose} width={720} title={<span>{rk?.name ?? rackId} · power distribution</span>} sub={rk ? `${rk.floor} · ${rk.room} · ${rk.drawKw} kW of ${rk.budgetKw} kW per side` : ''}>
      {!data || !rk ? <Loading /> : <RackPower phys={data} dc={dc} rackId={rackId} hover={hover} setHover={setHover} />}
    </Drawer>
  );
}

function RackPower({ phys, dc, rackId, hover, setHover }: { phys: SitePhysical; dc: Datacenter; rackId: string; hover: string | null; setHover: (s: string | null) => void }) {
  const rk = dc.racks.find(r => r.id === rackId)!;
  const pdus = phys.pdus.filter(p => p.rackId === rackId);
  const cords = phys.cords.filter(c => pdus.some(p => p.id === c.pduId));
  const devs = [...new Set(cords.map(c => c.neId))];
  const failPct = rk.budgetKw ? Math.round((rk.drawKw / rk.budgetKw) * 100) : 0;
  const rc = phys.rackCooling.find(r => r.rackId === rackId);
  const unit = dc.cooling.units.find(u => u.id === rc?.primaryId);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className={`note ${failPct >= 100 ? 'note--bad' : failPct >= 80 ? 'note--warn' : 'note--good'}`}>
        {failPct >= 80 ? <I.ShieldAlert size={15} /> : <I.ShieldCheck size={15} />}
        <span>{failPct >= 100 ? `If one side fails the other must carry ${rk.drawKw} kW, above its ${rk.budgetKw} kW rating: it would trip too.` : failPct >= 80 ? `If one side fails the other runs at ${failPct}% of its rating: no margin for growth.` : `Either side can carry the whole cabinet alone (${failPct}% of one side's rating).`}</span>
      </div>
      <div className="pdu-grid">{pdus.map(p => <PduCard key={p.id} p={p} cords={cords} active={hover} onOutlet={c => setHover(c?.neId ?? null)} />)}</div>
      <table className="nst-table ne-mini">
        <thead><tr><th>Device</th><th>Cords</th><th className="is-right">Draw</th><th>Feed</th></tr></thead>
        <tbody>{devs.map(id => {
          const cs = cords.filter(c => c.neId === id);
          const on = cs.filter(c => c.state === 'live' || c.state === 'on-battery');
          const sides = new Set(on.map(c => c.pduId.slice(-1)));
          return (
            <tr key={id} className={hover === id ? 'is-hl' : ''} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
              <td><NeLink id={id} tab="physical">{short(id, dc.id)}</NeLink></td>
              <td><span className="row wrap" style={{ gap: 4 }}>{cs.map(c => <Chip key={c.psu} tone={STATE_TONE[CORD_TONE[c.state]]} size="xs" title={CORD_LABEL[c.state]}>{c.psu} → {c.pduId.split('-').slice(-2).join('-')}/{c.outlet}</Chip>)}</span></td>
              <td className="is-right num">{fmtNum(on.reduce((a, c) => a + c.drawW, 0))} W</td>
              <td>{!on.length ? <Chip tone="error" size="xs">Down</Chip> : sides.size >= 2 ? <Chip tone="success" size="xs">A + B</Chip> : <Chip tone="warning" size="xs">{[...sides][0]} only</Chip>}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <div className="faint" style={{ fontSize: 12.5 }}>Cooled by {unit ? <b>{unit.name}</b> : 'room cooling'}{rc?.cduId ? <> · liquid loop <b>{rc.cduId.replace(`${dc.id}-`, '')}</b> ({Math.round(rc.liquidPct * 100)}% of the heat)</> : null} · inlet {rk.tempC}°C</div>
    </div>
  );
}

/* ---------------------------------------------------------------- what-if */

export function WhatIfCard({ dc, phys, initial }: { dc: Datacenter; phys: SitePhysical; initial?: string }) {
  const opts = useMemo(() => [
    ...dc.power.feeds.map(f => ({ id: f.id, label: `${f.source} (${f.id})` })),
    ...dc.power.ups.map(u => ({ id: u.id, label: `${u.name} · ${(dc.power.ups.indexOf(u) + 1) % 2 === 0 ? 'A' : 'B'} side` })),
    { id: 'side:A', label: 'Every A-side PDU' }, { id: 'side:B', label: 'Every B-side PDU' },
    ...dc.cooling.units.filter(u => u.type !== 'CDU').map(u => ({ id: u.id, label: `${u.name} · ${u.zone}` })),
    ...phys.pdus.map(p => ({ id: p.id, label: `${dc.racks.find(r => r.id === p.rackId)?.name} ${p.name}` })),
    ...phys.trunks.map(t => ({ id: t.id, label: `Trunk ${short(t.id, dc.id)} · ${t.route}` }))
  ], [dc, phys]);
  const [asset, setAsset] = useState(initial ?? dc.power.ups[1]?.id ?? dc.power.ups[0]?.id ?? '');
  const { data } = useQuery(() => getWhatIf(dc.id, asset), [dc.id, asset]);
  const lists: [string, string[], 'bad' | 'warn'][] = data ? [['Lose power or every link', data.down, 'bad'], ['Stay up on one cord', data.singleFed, 'warn'], ['Racks that heat up', data.hotRacks.map(r => dc.racks.find(x => x.id === r)?.name ?? r), 'warn'], ['PDUs pushed above 80%', data.overloaded.map(p => short(p, dc.id)), 'warn']] : [];
  return (
    <div className="wi">
      <div className="wi-pick"><span className="vw-label">If this fails</span><QuickSelect f={{ id: 'asset', label: 'Asset', value: asset, onChange: setAsset, options: opts }} /></div>
      {!data ? <Loading /> : (
        <>
          <div className={`note ${data.down.length ? 'note--bad' : data.singleFed.length || data.hotRacks.length || data.overloaded.length ? 'note--warn' : 'note--good'}`} data-whatif>
            {data.down.length ? <I.ZapOff size={15} /> : <I.ShieldCheck size={15} />}<span><b>{data.label}:</b> {data.text}{data.services ? ` · ${fmtNum(data.services)} services of ${fmtNum(data.customers)} customers affected` : ''}</span>
          </div>
          <div className="wi-lists">
            {lists.filter(([, xs]) => xs.length).map(([t, xs, tone]) => (
              <div key={t} className="wi-list"><span className="vw-label">{t} <b className={tone}>{xs.length}</b></span>
                <span className="row wrap" style={{ gap: 4 }}>{xs.slice(0, 18).map(x => x.startsWith(dc.id) ? <NeLink key={x} id={x} tab="physical">{short(x, dc.id)}</NeLink> : <span key={x} className="mono wi-tag">{x}</span>)}{xs.length > 18 && <span className="faint">+{xs.length - 18} more</span>}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- SPOF list */

const DOMAIN_ICON: Record<Spof['domain'], I.LucideIcon> = { Power: I.Zap, Cooling: I.Fan, Cabling: I.Cable, Backhaul: I.Route };
export function SpofList({ spofs, empty, link, onPick, active }: { spofs: Spof[]; empty?: ReactNode; link?: boolean; onPick?: (s: Spof) => void; active?: string | null }) {
  if (!spofs.length) return <div className="panel-body">{empty ?? <Empty icon={I.ShieldCheck} title="No single point of failure found" />}</div>;
  return (
    <div className="spof-list">
      {spofs.map(s => {
        const Ico = DOMAIN_ICON[s.domain];
        const body = (
          <>
            <span className={`spof-ico is-${s.severity}`}><Ico size={15} /></span>
            <span className="spof-b">
              <span className="row" style={{ gap: 8 }}><b>{s.title}</b></span>
              <span className="muted">{s.detail}</span>
              <span className="spof-fix"><I.Wrench size={12} />{s.fix}</span>
            </span>
            <span className="spof-r">
              <SeverityChip s={s.severity} size="xs" />
              <small>{fmtNum(s.neIds.length)} device{s.neIds.length === 1 ? '' : 's'}{s.services ? ` · ${fmtNum(s.services)} service${s.services === 1 ? '' : 's'}` : ''}</small>
            </span>
          </>
        );
        return link ? <Link key={s.id} to={s.to} className="spof" data-spof={s.id}>{body}</Link>
          : <button key={s.id} type="button" className={`spof${active === s.id ? ' is-on' : ''}`} data-spof={s.id} onClick={() => onPick?.(s)}>{body}</button>;
      })}
    </div>
  );
}

export function SpofInfo() {
  return <Info text="A single point of failure is one component whose loss takes devices, racks or links down even though the design is meant to be redundant: a device on one live power cord, a cabinet whose surviving PDU cannot carry it, a site that has lost its spare UPS or cooling unit, uplinks that share one cable route, backhaul through one building entry." />;
}
