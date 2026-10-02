import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { createPortal } from 'react-dom';
import { search } from '../api';

type Row = { kind: string; label: string; sub: string; to: string };
const ICON: Record<string, I.LucideIcon> = { Datacenter: I.Building2, 'Network element': I.Router, Service: I.Waypoints, Customer: I.Users, Incident: I.Siren, Alert: I.BellRing, Change: I.ArrowLeftRight, Go: I.Zap };
const QUICK: Row[] = [
  { kind: 'Go', label: 'MH-DC-001 · Pune Data Park', sub: 'In-progress datacenter with open reconciliation', to: '/datacenters/MH-DC-001' },
  { kind: 'Go', label: 'MH-DC-001-PE-T4-01 · Alerts & diagnostics', sub: 'Flapping backhaul with AI root-cause', to: '/ne/MH-DC-001-PE-T4-01?tab=alerts' },
  { kind: 'Go', label: 'INC-0001 · RCA workspace', sub: 'Optical degradation incident', to: '/incidents/INC-0001' },
  { kind: 'Go', label: 'Facilities', sub: 'Power chain, UPS, DG, cooling and environment', to: '/facilities' },
  { kind: 'Go', label: 'Datacenters', sub: 'Operational state of every live datacenter', to: '/datacenters' }
];

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [res, setRes] = useState<Row[]>(QUICK);
  const nav = useNavigate();
  useEffect(() => {
    if (q.trim().length < 2) { setRes(QUICK); return; }
    let live = true;
    search(q).then(r => { if (live) { setRes(r); setIdx(0); } });
    return () => { live = false; };
  }, [q]);
  if (!open) return null;
  const go = (to: string) => { onClose(); setQ(''); nav(to); };
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal palette" role="dialog" aria-label="Search">
        <div className="palette-head">
          <I.Search size={18} className="muted" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Site, NE name / IP / serial, service, customer, INC / ALM / CHG id…"
            onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(res.length - 1, i + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); } if (e.key === 'Enter' && res[idx]) go(res[idx].to); if (e.key === 'Escape') onClose(); }} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-body">
          {q.trim().length < 2 && <div className="palette-label">Jump to</div>}
          {res.map((r, i) => {
            const Ic = ICON[r.kind] ?? I.Circle;
            return (
              <button key={i} type="button" className={`palette-item${i === idx ? ' is-active' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => go(r.to)}>
                <span className="kpi-ico tone-neutral"><Ic size={15} /></span>
                <span style={{ minWidth: 0, flex: 1 }}><b>{r.label}</b><small className="ellipsis">{r.kind !== 'Go' ? `${r.kind} · ` : ''}{r.sub}</small></span>
                {i === idx && <I.ArrowRight size={15} className="muted" />}
              </button>
            );
          })}
          {!res.length && <div className="empty">No match for “{q}”.</div>}
        </div>
      </div>
    </>, document.body);
}
