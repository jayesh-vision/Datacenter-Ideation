/* Containment hierarchy: region → datacenter → floor → hall → row → rack, with racks, devices and rack power rolled up at
   every level. Search opens the branches that match; a datacenter or hall opens its floor plan, a rack its rack page. */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { geoNow, getDcim, useQuery } from '../../api';
import type { DcimRack } from '../../api/types';
import { Loading } from '../../shell/page';
import { Btn, Panel, SearchBox } from '../../ui/kit';
import { fmtKw, fmtNum } from '../../lib/format';
import { DcimStatusChip } from './common';

interface Node { id: string; level: 'region' | 'site' | 'floor' | 'hall' | 'row' | 'rack'; label: string; sub?: string; to?: string; kids: Node[]; racks: number; devices: number; kw: number; status?: DcimRack['status'] }
const ICON = { region: I.Globe, site: I.Building2, floor: I.Layers, hall: I.LayoutGrid, row: I.Rows3, rack: I.Server } as const;

export function Hierarchy({ dcId }: { dcId: string }) {
  const nav = useNavigate();
  const { data } = useQuery(() => getDcim({ dcId: dcId || undefined }), [dcId]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const tree = useMemo(() => {
    if (!data) return [];
    const rackBy = new Map(data.racks.map(r => [r.id, r]));
    const roll = (n: Node) => { if (n.kids.length) { n.kids.forEach(roll); n.racks = n.kids.reduce((a, k) => a + k.racks, 0); n.devices = n.kids.reduce((a, k) => a + k.devices, 0); n.kw = n.kids.reduce((a, k) => a + k.kw, 0); } return n; };
    const regions = geoNow().regions;
    return regions.map(rg => roll({
      id: rg.id, level: 'region', label: rg.name, kids: data.sites.filter(s => s.regionId === rg.id).map(s => ({
        id: s.id, level: 'site', label: s.id, sub: `${s.city} · ${s.type} · ${s.tier}`, to: `/dcim?tab=floorplan&dc=${s.id}`, racks: 0, devices: 0, kw: 0,
        kids: [...new Set(data.halls.filter(h => h.dcId === s.id).map(h => h.floor))].map(f => ({
          id: `${s.id}|${f}`, level: 'floor', label: f, racks: 0, devices: 0, kw: 0,
          kids: data.halls.filter(h => h.dcId === s.id && h.floor === f).map(h => ({
            id: h.id, level: 'hall', label: h.name, sub: h.kind, to: `/dcim?tab=floorplan&dc=${s.id}&hall=${h.id}`, racks: 0, devices: 0, kw: 0,
            kids: data.rows.filter(r => r.hallId === h.id).map(r => ({
              id: r.id, level: 'row', label: r.name, sub: r.containment === 'Cold aisle' ? `cold aisle with ${r.facesRow}` : undefined, racks: 0, devices: 0, kw: 0,
              kids: r.racks.map(id => { const rk = rackBy.get(id)!; return { id, level: 'rack', label: rk.name, sub: `${rk.role} · ${rk.usedU}/${rk.heightU} U`, to: `/dcim/racks/${encodeURIComponent(id)}`, kids: [], racks: 1, devices: rk.devices, kw: rk.drawKw, status: rk.status } as Node; })
            }))
          }))
        }))
      })), racks: 0, devices: 0, kw: 0
    })).filter(n => n.kids.length);
  }, [data]);
  if (!data) return <Loading />;

  /* search: keep the branches that lead to a match, open them */
  const match = (n: Node): boolean => `${n.label} ${n.sub ?? ''}`.toLowerCase().includes(q.toLowerCase());
  const keep = (n: Node): Node | null => {
    if (!q) return n;
    if (match(n)) return n;
    const kids = n.kids.map(keep).filter(Boolean) as Node[];
    return kids.length ? { ...n, kids } : null;
  };
  const shown = tree.map(keep).filter(Boolean) as Node[];
  const isOpen = (n: Node) => (q ? n.level !== 'rack' : open.has(n.id) || (n.level === 'region' && !open.has(`-${n.id}`)));
  const toggle = (n: Node) => setOpen(s => { const x = new Set(s); if (n.level === 'region') { const k = `-${n.id}`; x.has(k) ? x.delete(k) : x.add(k); } else { x.has(n.id) ? x.delete(n.id) : x.add(n.id); } return x; });
  const all: Node[] = []; const walk = (n: Node) => { all.push(n); n.kids.forEach(walk); }; tree.forEach(walk);
  const row = (n: Node, depth: number): ReactNode => {
    const Ico = ICON[n.level];
    const o = n.kids.length > 0 && isOpen(n);
    return (
      <div key={n.id}>
        <div className={`dcim-tree-row lvl-${n.level}`} style={{ paddingLeft: 12 + depth * 22 }}>
          <button type="button" className="dcim-tree-tw" onClick={() => toggle(n)} disabled={!n.kids.length} aria-label={o ? 'Collapse' : 'Expand'}>{n.kids.length ? <I.ChevronRight size={14} style={{ transform: o ? 'rotate(90deg)' : undefined }} /> : null}</button>
          <Ico size={15} className="dcim-tree-ico" />
          {n.to ? <button type="button" className="ent-link dcim-tree-l" onClick={() => nav(n.to!)}>{n.label}</button> : <span className="dcim-tree-l">{n.label}</span>}
          {n.sub && <small className="vw-label">{n.sub}</small>}
          <span className="dcim-tree-n">
            {n.status && n.status !== 'Active' && <DcimStatusChip s={n.status} />}
            {n.level !== 'rack' && <span>{fmtNum(n.racks)} rack{n.racks === 1 ? '' : 's'}</span>}
            <span>{fmtNum(n.devices)} device{n.devices === 1 ? '' : 's'}</span>
            <span>{fmtKw(Math.round(n.kw * 10) / 10)}</span>
          </span>
        </div>
        {o && n.kids.map(k => row(k, depth + 1))}
      </div>
    );
  };
  return (
    <Panel title="Facility hierarchy" icon={I.Network} count={all.length} info="Region → datacenter → floor → hall → row → rack, with racks, devices and measured rack power rolled up at each level. Search opens the matching branches."
      actions={<>
        <SearchBox value={q} onChange={setQ} placeholder="Find a site, hall, row or rack" width={260} />
        <Btn icon={I.ChevronsUpDown} onClick={() => setOpen(new Set(all.filter(n => n.level !== 'row' && n.level !== 'rack').map(n => n.id)))}>Expand</Btn>
        <Btn icon={I.ChevronsDownUp} onClick={() => setOpen(new Set(tree.map(n => `-${n.id}`)))}>Collapse</Btn>
      </>}>
      <div className="dcim-tree">{shown.length ? shown.map(n => row(n, 0)) : <p className="vw-label" style={{ padding: 12 }}>Nothing matches “{q}”.</p>}</div>
    </Panel>
  );
}
