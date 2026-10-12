/* Power cords and cables in the device's "In the rack" 3D view (13-Oct-2026, user: show which PSU plugs into which PDU and
   which cable leaves which port). Power: every device power supply in the cabinet gets a cord to its PDU outlet on the rear
   A (blue) / B (orange) strip at the outlet's height; this device's cords are thick and labelled. Cables: this device's ports
   run to the patch panel at the top of the cabinet front and up into the tray, or loop to the far device for in-rack cables.
   Geometry follows RackView (devices.tsx): rack depth 1.07 m, devices 0.8 m deep from the front rails, PDUs at the rear. */
import type { ReactElement } from 'react';
import { Line } from '@react-three/drei';
import type { PowerCord, RackPdu } from '../../../api/types';
import type { DevicePhysicalView } from '../../site/twin2/paths';
import { Caption, U, RACK_W } from './kit';

export interface RackPathData { power: boolean; cables: boolean; dp: DevicePhysicalView | null; pdus: RackPdu[]; cords: PowerCord[] }
const SIDE = { A: '#2F80ED', B: '#F2994A' } as const;
const BAD = '#FF4D4F', WARN = '#F5B82E', HOT = '#22D3EE', DCC = '#10B981';
const NO_RAY = () => null;
const short = (id: string) => id.replace(/^[A-Z]{2}-DC-\d{3}-/, '');

export function RackPaths({ pd, H, D, RW, nes, meId }: { pd: RackPathData; H: number; D: number; RW: number; nes: { id: string; u: number; uSize: number }[]; meId: string }) {
  const W = RACK_W;
  const front = D / 2 - 0.08;          // front rail plane: device fronts sit here
  const rear = front - 0.8;             // device rear faces
  const stripZ = -D / 2 + 0.06 + 0.031;
  const pos = new Map(nes.map(n => [n.id, n]));
  const out: ReactElement[] = [];
  if (pd.power) {
    const pduBy = new Map(pd.pdus.map(p => [p.id, p]));
    const perNe = new Map<string, PowerCord[]>();
    pd.cords.forEach(c => perNe.set(c.neId, [...(perNe.get(c.neId) ?? []), c]));
    for (const [neId, cs] of perNe) {
      const n = pos.get(neId); if (!n) continue;
      const me = neId === meId;
      const yc = (n.u - 1) * U + (n.uSize * U) / 2;
      const zr = rear + (me ? 0.38 : 0);
      cs.forEach((c, k) => {
        const p = pduBy.get(c.pduId); if (!p) return;
        const sx = p.side === 'A' ? -1 : 1;
        const xs = sx * (RW / 2 - 0.06);
        const yo = 0.06 + ((Math.max(1, c.outlet) - 1) / Math.max(1, p.outlets - 1)) * (H - 0.12);
        const xp = (W / 2 - 0.06 - k * 0.06) * (k % 2 === 0 ? -1 : 1) * 0.9;
        const col = c.state === 'psu-failed' || c.state === 'no-power' ? BAD : c.state === 'on-battery' ? WARN : p.kind === 'DC' ? DCC : SIDE[p.side];
        out.push(<Line key={`pc${neId}${c.psu}`} points={[[xp, yc, zr], [xp, yc, zr - 0.06], [xs * 0.85, (yc + yo) / 2, (zr - 0.06 + stripZ) / 2], [xs, yo, stripZ]]}
          color={col} lineWidth={me ? 3.5 : 1.4} transparent opacity={me ? 1 : 0.5} dashed={c.state !== 'live'} dashSize={0.03} gapSize={0.02} raycast={NO_RAY} toneMapped={false} />);
        if (me) out.push(<Caption key={`pcl${c.psu}`} p={[xs * 1.6, yo + 0.1 + k * 0.16, stripZ - 0.08]} text={`${c.psu} → ${p.name}/${c.outlet}`} sub={`${c.state === 'live' ? `${c.drawW} W` : c.state.replace('-', ' ')} · ${p.upstreamName}`} size={0.055} />);
      });
    }
    /* what feeds the two strips */
    for (const p of pd.pdus.filter(x => x.kind === 'AC')) {
      const sx = p.side === 'A' ? -1 : 1;
      out.push(<Caption key={`pdu${p.id}`} p={[sx * (RW / 2 + 0.22), H + 0.4, stripZ]} text={`${p.name} ← ${p.upstreamName}`} sub={`${p.loadKw} of ${p.capacityKw} kW${p.state === 'tripped' ? ' · tripped' : p.state === 'on-battery' ? ' · on battery' : ''}`} size={0.055} />);
      out.push(<Line key={`fd${p.id}`} points={[[sx * (RW / 2 - 0.06), H, stripZ], [sx * (RW / 2 - 0.06), H + 0.3, stripZ], [sx * (RW / 2 - 0.06), H + 0.3, -0.2]]} color={p.state === 'tripped' ? BAD : p.state === 'on-battery' ? WARN : SIDE[p.side]} lineWidth={3} dashed={p.state !== 'ok' && p.state !== 'warn'} dashSize={0.04} gapSize={0.02} raycast={NO_RAY} toneMapped={false} />);
    }
  }
  if (pd.cables && pd.dp) {
    const me = pos.get(meId);
    if (me) {
      const yMe = (me.u - 1) * U + (me.uSize * U) / 2;
      const zf = front + 0.38 + 0.005; // this device is pulled forward 0.38 m in RackView
      const panelY = H - U * 0.5, panelZ = front + 0.02;
      const out1 = pd.dp.cables.slice(0, 24);
      out1.forEach((c, i) => {
        const px = -W / 2 + 0.04 + (i % 12) * ((W - 0.08) / 11);
        const col = c.state === 'bad' ? BAD : c.state === 'warn' ? WARN : HOT;
        const far = pos.get(c.farNe);
        if (c.kind === 'in-rack' && far) {
          const yF = (far.u - 1) * U + (far.uSize * U) / 2;
          out.push(<Line key={`cl${c.linkId}`} points={[[px, yMe, zf], [px, yMe, zf + 0.08], [px, yF, front + 0.08], [px, yF, front + 0.005]]} color={col} lineWidth={2.5} dashed={c.state === 'bad'} dashSize={0.03} gapSize={0.02} raycast={NO_RAY} toneMapped={false} />);
        } else {
          const qx = -W / 2 + 0.03 + (i % 24) * ((W - 0.06) / 23);
          out.push(<Line key={`cl${c.linkId}`} points={[[px, yMe, zf], [px, yMe, zf + 0.06 + (i % 4) * 0.01], [qx, panelY, panelZ + 0.07], [qx, panelY, panelZ + 0.01]]} color={col} lineWidth={2.2} dashed={c.state === 'bad'} dashSize={0.03} gapSize={0.02} raycast={NO_RAY} toneMapped={false} />);
        }
        if (i < 4) out.push(<Caption key={`cc${c.linkId}`} p={[W / 2 + 0.55, yMe + 0.4 - i * 0.2, zf + 0.12]} text={`${c.ifName} → ${short(c.farNe)}`} sub={c.kind === 'in-rack' ? 'in-rack cord' : c.via} size={0.048} />);
      });
      /* the cabinet patch panel and the trunk leaving through the roof into the fibre tray */
      out.push(<mesh key="pp" position={[0, panelY, panelZ]} raycast={NO_RAY}><boxGeometry args={[W, U * 0.9, 0.02]} /><meshStandardMaterial color="#1F2633" metalness={0.4} roughness={0.5} /></mesh>);
      out.push(<Line key="trk" points={[[0.12, H, panelZ - 0.05], [0.12, H + 0.45, panelZ - 0.05], [0.12, H + 0.45, -0.25]]} color="#14B8A6" lineWidth={4} raycast={NO_RAY} toneMapped={false} />);
      const ext = pd.dp.cables.find(c => c.kind !== 'in-rack');
      if (ext) out.push(<Caption key="ppl" p={[-W / 2 - 0.3, panelY + 0.22, panelZ + 0.05]} text="Patch panel → trunk → ODF" sub={ext.via} size={0.048} />);
    }
  }
  return <group>{out}</group>;
}
