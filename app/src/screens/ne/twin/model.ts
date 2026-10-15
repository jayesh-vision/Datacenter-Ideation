/* Device digital twin — the parts model (08-Oct-2026, user: "a digital twin or pictorial representation of each
   equipment on its details page"). Every view is a list of parts on an SVG canvas; each part carries a kind (the
   colour family), a live state from the device's telemetry, and what the inspector shows when it is clicked.
   Builders per device family live in scenes.tsx; this file holds the shared vocabulary and helpers. */
import type { ReactNode } from 'react';
import type { Interface, NetworkElement } from '../../../api/types';

export type Kind = 'compute' | 'power' | 'cooling' | 'network' | 'memory' | 'storage' | 'mgmt';
export type PState = 'ok' | 'warn' | 'bad' | 'off' | 'idle';
export type View = 'face' | 'inside' | 'rack' | 'chip';

export interface Info {
  title: string; kind: Kind; state: PState; rows: [string, ReactNode][];
  note?: string; to?: { href: string; label: string }; chip?: number;   // chip = open the accelerator view on GPU n
}
export interface Part {
  id: string; kind: Kind; x: number; y: number; w: number; h: number;
  label?: string; sub?: string; state: PState; shape?: 'rect' | 'circle' | 'port' | 'led';
  fill?: number;            // 0..1 bar along the bottom (utilisation / memory used)
  glow?: boolean; me?: boolean; info?: Info; nav?: string;
}
export interface Group { x: number; y: number; w: number; h: number; label?: string; kind?: Kind; dashed?: boolean; r?: number; dark?: boolean }
export interface Scene { w: number; h: number; title: string; caption: string; chips: string[]; groups: Group[]; parts: Part[]; deco?: ReactNode; over?: ReactNode }   // deco under the parts, over on top (not clickable)

export const KIND_LABEL: Record<Kind, string> = { compute: 'Compute', power: 'Power', cooling: 'Cooling', network: 'Network', memory: 'Memory', storage: 'Storage', mgmt: 'Management' };
export const STATE_LABEL: Record<PState, string> = { ok: 'Healthy', warn: 'Needs attention', bad: 'Fault', off: 'Disabled / empty', idle: 'Idle / no data' };

export const modState = (s?: string): PState => (s === 'Fault' ? 'bad' : s === 'Empty' ? 'off' : s === 'OK' ? 'ok' : 'idle');
export const ifState = (i: Interface): PState =>
  i.state === 'down' ? 'bad' : i.state === 'admin-down' ? 'off' : i.state === 'reserved' ? 'idle' : i.crcErrors > 50 || i.flaps24h > 3 || i.inErrors > 500 ? 'warn' : 'ok';
export const worstOf = (xs: PState[]): PState => (xs.includes('bad') ? 'bad' : xs.includes('warn') ? 'warn' : xs.length && xs.every(x => x === 'off' || x === 'idle') ? 'idle' : 'ok');
export const fmtSpeed = (m: number) => (m >= 1000000 ? `${m / 1000000}T` : m >= 1000 ? `${m / 1000}G` : `${m}M`);

/* the silicon inside a device, by model — what the "inside" view names (public datasheets) */
export function siliconOf(ne: NetworkElement): { asic: string; asicSub: string; cpu: string } {
  const m = `${ne.vendor} ${ne.model}`;
  const pick = (asic: string, asicSub: string, cpu = 'Control-plane CPU') => ({ asic, asicSub, cpu });
  if (/QM9700|Quantum-2/.test(m)) return pick('NVIDIA Quantum-2', '25.6 Tb/s · 64 × 400G NDR', 'Intel Atom C3758 (management)');
  if (/SN5600|Spectrum-4/.test(m)) return pick('NVIDIA Spectrum-4', '51.2 Tb/s · 64 × 800G', 'Intel Xeon D (Cumulus)');
  if (/SN4600C|Spectrum-3/.test(m)) return pick('NVIDIA Spectrum-3', '6.4 Tb/s · 64 × 100G', 'Intel Atom (Cumulus)');
  if (/7260CX3/.test(m)) return pick('Broadcom Tomahawk 2', '6.4 Tb/s · 64 × 100G', 'Intel Atom (EOS)');
  if (/7050QX|7050SX-64/.test(m)) return pick('Broadcom Trident 2', '1.28 Tb/s · 48 × 10G + 4 × 40G', 'AMD G-series (EOS)');
  if (/9372PX/.test(m)) return pick('Cisco ALE + Broadcom Trident 2', '1.44 Tb/s · 48 × 10G + 6 × 40G', 'Intel Xeon (NX-OS)');
  if (/3172PQ/.test(m)) return pick('Broadcom Trident 2', '1.44 Tb/s · 48 × 10G + 6 × 40G', 'Intel Celeron (NX-OS)');
  if (/QFX5100/.test(m)) return pick('Broadcom Trident 2', '1.44 Tb/s · 48 × 10G + 6 × 40G', 'Intel Xeon (Junos)');
  if (/SN2201/.test(m)) return pick('NVIDIA Spectrum', '1G / 100G management fabric', 'Intel Atom (Cumulus)');
  if (/7060DX5/.test(m)) return pick('Broadcom Tomahawk 4', '25.6 Tb/s · 64 × 400G', 'AMD Ryzen embedded (EOS)');
  if (/7800R3/.test(m)) return pick('Broadcom Jericho2', 'deep-buffer · 9.6 Tb/s per line card', 'Supervisor CPU (EOS)');
  if (/7050SX3/.test(m)) return pick('Broadcom Trident 3', '2.0 Tb/s · 48 × 10G + 8 × 100G', 'Intel Atom (EOS)');
  if (/9364D/.test(m)) return pick('Cisco Cloud Scale LS6400GX', '25.6 Tb/s · 64 × 400G', 'Intel Xeon D (NX-OS)');
  if (/93180/.test(m)) return pick('Cisco Cloud Scale LS1800FX', '3.6 Tb/s · 48 × 25G + 6 × 100G', 'Intel Xeon D (NX-OS)');
  if (/QFX5120/.test(m)) return pick('Broadcom Trident 3', '2.0 Tb/s · 48 × 25G + 8 × 100G', 'Intel Xeon D (Junos)');
  if (/MX304/.test(m)) return pick('Juniper Trio 6 PFE', '4.8 Tb/s · MACsec-capable', 'Routing Engine · Intel Xeon D');
  if (/MX204/.test(m)) return pick('Juniper Trio EA PFE', '400 Gb/s', 'Routing Engine · Intel Xeon D');
  if (/NCS 540/.test(m)) return pick('Broadcom Qumran-2c', '300 Gb/s · timing-capable', 'Route processor · Intel Atom');
  if (/ACX7100/.test(m)) return pick('Broadcom Jericho2', '4.8 Tb/s', 'Routing Engine · Intel Xeon D');
  if (/7250 IXR/.test(m)) return pick('Nokia FP-class forwarding', '800 Gb/s', 'CPM · control processor');
  if (/FortiGate/.test(m)) return pick('Fortinet NP7 × 4', 'security processors · 600 Gb/s firewall', 'CP9 content processor + Xeon');
  if (/6500/.test(m)) return pick('Ciena WaveLogic 5e', 'coherent DSP · up to 800G per wave', 'Shelf processor');
  if (/1830/.test(m)) return pick('Nokia PSE-V coherent DSP', 'up to 600G per wave', 'Shelf controller (EC)');
  return pick('Forwarding ASIC', 'packet processing', 'Control-plane CPU');
}
export function hostCpuOf(model: string): string {
  if (/DGX B200/.test(model)) return 'Intel Xeon Platinum 8570';
  if (/DGX H/.test(model)) return 'Intel Xeon Platinum 8480C';
  if (/DGX A100|AS-4124|XE8545/.test(model)) return 'AMD EPYC 7763';
  if (/Gaudi|Max 1550|XE9640|SYS-821GV|SYS-822GA/.test(model)) return 'Intel Xeon Platinum 8480+';
  if (/R740|R640|Gen10|SYS-120U|SYS-220U/.test(model)) return 'Intel Xeon Gold 6248R';
  if (/R760|SYS-121H|DL380/.test(model)) return 'Intel Xeon Gold 6430';
  return 'Intel Xeon Platinum 8468';
}
