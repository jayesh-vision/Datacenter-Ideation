import { useEffect, useMemo, useRef, useState } from 'react';
import * as I from 'lucide-react';
import type { Sel, TwinLayout } from './layout';

/* Find anything in the building (04-Nov-2026, user: "a collapsible search … building, rack, equipment, room, floor, power device"):
   one icon in the view tools that opens a box; results = floors, rooms, racks, equipment (name, role, model, serial, address)
   and plant (UPS, rectifier, batteries, cooling units, the generator); picking one flies the view there. Plant opens its room in the
   schematic twin; the realistic twin passes its selectable plant units (`plant` + `onUnit`), so a hit opens the unit itself. */
type Kind = 'Floor' | 'Room' | 'Rack' | 'Equipment' | 'Power' | 'Cooling';
interface Hit { key: string; kind: Kind; title: string; sub: string; hay: string; sel: Sel; unit?: string }
export interface SearchUnit { key: string; kind: 'cooling' | 'ups' | 'rectifier' | 'battery' | 'dg'; title: string; type: string; status: string; floorIdx: number; roomId: string | null }
const ICON: Record<Kind, typeof I.Box> = { Floor: I.Layers, Room: I.DoorOpen, Rack: I.Server, Equipment: I.Cpu, Power: I.Zap, Cooling: I.Fan };
const ORDER: Kind[] = ['Floor', 'Room', 'Rack', 'Equipment', 'Power', 'Cooling'];
const MAX = 40;

function index(L: TwinLayout, dcId: string, plant?: SearchUnit[]): Hit[] {
  const out: Hit[] = [];
  const none: Sel = { floor: null, room: null, rack: null, ne: null };
  for (const f of L.floors) out.push({ key: `f${f.idx}`, kind: 'Floor', title: f.name, sub: `${f.rooms.length} rooms`, hay: f.name, sel: { ...none, floor: f.idx } });
  for (const r of L.rooms) {
    const at = { ...none, floor: r.floorIdx, room: r.id };
    out.push({ key: `r${r.id}`, kind: 'Room', title: r.name, sub: `${r.floorName} · ${r.kind === 'power' ? `${r.power.length} plant units` : `${r.racks.length} racks`}`, hay: `${r.name} ${r.floorName}`, sel: at });
    for (const k of r.racks) {
      out.push({ key: `k${k.rack.id}`, kind: 'Rack', title: k.rack.name, sub: `${k.rack.role} · ${r.name} · ${r.floorName}`, hay: `${k.rack.name} ${k.rack.id} ${k.rack.role}`, sel: { ...at, rack: k.rack.id } });
      for (const n of k.nes) {
        const name = n.name.replace(`${dcId}-`, '');
        out.push({ key: `n${n.id}`, kind: 'Equipment', title: name, sub: `${n.role} · ${n.vendor} ${n.model} · ${k.rack.name} U${n.u}`, hay: `${n.name} ${n.role} ${n.vendor} ${n.model} ${n.serial} ${n.ip}`, sel: { ...at, rack: k.rack.id, ne: n.id } });
      }
    }
    if (plant) continue;
    for (const p of r.power) out.push({ key: `p${r.id}${p.label}`, kind: 'Power', title: p.label, sub: `${p.kind === 'ups' ? 'UPS' : p.kind === 'rectifier' ? 'Rectifier' : 'Battery bank'} · ${r.name} · ${r.floorName}`, hay: `${p.label} ${p.kind}`, sel: at });
    for (const c of r.cooling) out.push({ key: `c${c.unit.id}`, kind: 'Cooling', title: c.unit.name, sub: `${c.unit.type} · ${c.unit.status} · ${r.name}`, hay: `${c.unit.name} ${c.unit.type} cooling`, sel: at });
  }
  if (plant) {
    for (const u of plant) {
      const r = u.roomId ? L.rooms.find(x => x.id === u.roomId) : undefined;
      out.push({ key: `u${u.key}`, kind: u.kind === 'cooling' ? 'Cooling' : 'Power', title: u.title, sub: `${u.type} · ${u.status}${r ? ` · ${r.name} · ${r.floorName}` : ' · outside the building'}`,
        hay: `${u.title} ${u.type} ${u.kind}${u.kind === 'dg' ? ' diesel generator genset' : ''}`, sel: { floor: u.floorIdx, room: u.roomId, rack: null, ne: null }, unit: u.key });
    }
    return out;
  }
  if (L.dg) out.push({ key: 'dg', kind: 'Power', title: 'DG set', sub: 'Diesel generator · outside the building', hay: 'DG diesel generator genset', sel: none });
  return out;
}

export function TwinSearch({ L, dcId, onGo, plant, onUnit }: { L: TwinLayout; dcId: string; onGo: (s: Sel) => void; plant?: SearchUnit[]; onUnit?: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cur, setCur] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  const all = useMemo(() => index(L, dcId, plant), [L, dcId, plant]);
  const hits = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const rank = (h: Hit) => (h.title.toLowerCase().startsWith(words[0]) ? 0 : 1) * 10 + ORDER.indexOf(h.kind);
    return all.filter(h => { const s = h.hay.toLowerCase(); return words.every(w => s.includes(w)); }).sort((a, b) => rank(a) - rank(b)).slice(0, MAX);
  }, [all, q]);
  useEffect(() => { setCur(0); }, [q]);
  useEffect(() => { if (open) inp.current?.focus(); }, [open]);
  const close = () => { setOpen(false); setQ(''); };
  const go = (h: Hit) => { if (h.unit && onUnit) onUnit(h.unit); else onGo(h.sel); close(); };
  if (!open) return <button type="button" className="nst-icon-btn twin-reset" title="Search this datacenter" aria-label="Search this datacenter" data-twin="search" onClick={() => setOpen(true)}><I.Search size={15} /></button>;
  return (
    <div className="twin-search" data-twin="search-box">
      <I.Search size={14} />
      <input ref={inp} value={q} placeholder="Rack, device, serial, room, UPS…" aria-label="Search this datacenter"
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.stopPropagation(); close(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); setCur(c => Math.min(c + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setCur(c => Math.max(c - 1, 0)); }
          else if (e.key === 'Enter' && hits[cur]) go(hits[cur]);
        }} />
      <button type="button" className="twin-search-x" aria-label="Close search" onClick={close}><I.X size={14} /></button>
      {q.trim() && (
        <ul className="twin-search-list" role="listbox">
          {hits.length === 0 && <li className="twin-search-none">Nothing in this datacenter matches “{q.trim()}”.</li>}
          {hits.map((h, i) => { const Ic = ICON[h.kind]; return (
            <li key={h.key} role="option" aria-selected={i === cur}>
              <button type="button" className={i === cur ? 'is-cur' : ''} data-twin-hit={h.key} onMouseEnter={() => setCur(i)} onClick={() => go(h)}>
                <Ic size={14} /><span><b>{h.title}</b><small>{h.sub}</small></span><em>{h.kind}</em>
              </button>
            </li>
          ); })}
        </ul>
      )}
    </div>
  );
}
