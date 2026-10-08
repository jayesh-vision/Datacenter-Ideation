import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getGpuNode, useQuery } from '../../../api';
import { Seg } from '../../../ui/kit';
import type { NeData } from '../NetworkElement';
import { buildScene, viewsFor } from './scenes';
import { KIND_LABEL, STATE_LABEL, type Kind, type Part, type PState, type Scene, type View } from './model';
import '../../../styles/devtwin.css';

/* Device digital twin (08-Oct-2026, user): a pictorial, live view of one piece of equipment — front panel or
   rear I/O, the inside (silicon, memory, power, cooling), one accelerator for GPU servers, and the rack it sits in.
   Colours say what a part is (compute · power · cooling · network · memory · storage · management); the outline
   and fill say how it is (fault red, attention amber, disabled dashed, idle grey). Click any part to inspect it. */
const KINDS: Kind[] = ['compute', 'power', 'cooling', 'network', 'memory', 'storage', 'mgmt'];

export function DeviceTwin({ d }: { d: NeData }) {
  const ne = d.ne;
  const [sp, setSp] = useSearchParams();
  const { data: g } = useQuery(() => (ne.role === 'GPU' ? getGpuNode(ne.id) : Promise.resolve(null)), [ne.id]);
  const gpu = g?.node ?? null;
  const views = viewsFor(ne, !!gpu);
  const want = sp.get('tview') as View | null;
  const view: View = views.some(v => v.id === want) ? want! : ne.role === 'GPU' ? 'inside' : views[0].id;
  const chip = Math.min(7, Math.max(0, Number(sp.get('gpu') ?? 0) || 0));
  const [sel, setSel] = useState<string | null>(null);
  const set = (patch: Record<string, string | null>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v === null ? n.delete(k) : n.set(k, v))); setSp(n, { replace: true }); setSel(null); };
  const scene = useMemo(() => buildScene(view, { d, gpu, chip }), [view, d, gpu, chip]);
  const part = scene.parts.find(p => p.id === sel) ?? null;
  const issues = dedupe(scene.parts.filter(p => p.state === 'bad' || p.state === 'warn'));
  const kinds = KINDS.filter(k => scene.parts.some(p => p.kind === k));

  return (
    <section className="card dt" data-devtwin={view}>
      <div className="dt-head">
        <div className="dt-title"><b>{scene.title}</b><span className="vw-label">{scene.caption}</span></div>
        <Seg size="sm" value={view} onChange={v => set({ tview: v })} options={views} />
      </div>
      <div className="dt-chips">{scene.chips.map(c => <span key={c} className="dt-chip">{c}</span>)}
        {view === 'chip' && gpu && <span className="dt-gpus" role="group" aria-label="Pick a GPU">{gpu.gpus.map(x => (
          <button key={x.idx} type="button" className={`dt-gpu-pick${x.idx === chip ? ' is-on' : ''} s-${x.health === 'failed' ? 'bad' : x.health === 'degraded' || x.throttle !== 'none' ? 'warn' : 'ok'}`} onClick={() => set({ gpu: String(x.idx) })} aria-pressed={x.idx === chip}>GPU {x.idx}</button>))}</span>}
      </div>
      <div className="dt-body">
        <div className="dt-stage">
          <Canvas scene={scene} sel={sel} onSel={setSel} />
          <div className="dt-legend" data-devtwin-legend>
            <span className="vw-label">Click a part to inspect it</span>
            {kinds.map(k => <span key={k}><i className={`k-${k}`} />{KIND_LABEL[k]}</span>)}
            <span><i className="s-bad" />Fault</span><span><i className="s-warn" />Attention</span><span><i className="s-off" />Disabled / empty</span>
          </div>
        </div>
        <aside className="dt-insp" data-devtwin-inspector>
          {part?.info ? <Inspector p={part} onChip={k => set({ tview: 'chip', gpu: String(k) })} onClose={() => setSel(null)} /> : <Summary d={d} issues={issues} onSel={setSel} scene={scene} />}
        </aside>
      </div>
    </section>
  );
}

const dedupe = (ps: Part[]) => { const seen = new Set<string>(); return ps.filter(p => { const k = p.info?.title ?? p.id; if (seen.has(k)) return false; seen.add(k); return true; }); };

function Canvas({ scene, sel, onSel }: { scene: Scene; sel: string | null; onSel: (id: string | null) => void }) {
  return (
    <svg className="dt-svg" viewBox={`0 0 ${scene.w} ${scene.h}`} role="img" aria-label={scene.title} onClick={() => onSel(null)}>
      <defs>
        {['cool', 'hot', 'net'].map(c => <marker key={c} id={`dt-ah-${c}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" className={`dt-ah ${c}`} /></marker>)}
      </defs>
      {scene.groups.map((g, i) => (
        <g key={i} className={`dt-group${g.kind ? ` k-${g.kind}` : ''}${g.dashed ? ' is-dashed' : ''}${g.dark ? ' is-dark' : ''}`}>
          <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={g.r ?? 12} />
          {g.label && <text x={g.x + 14} y={g.y + 18} className="dt-group-t">{g.label}</text>}
        </g>
      ))}
      {scene.deco}
      {scene.parts.map(p => <PartG key={p.id} p={p} on={p.id === sel} onSel={onSel} />)}
      {scene.over && <g className="dt-over">{scene.over}</g>}
    </svg>
  );
}

function PartG({ p, on, onSel }: { p: Part; on: boolean; onSel: (id: string) => void }) {
  const cls = `dt-part k-${p.kind} s-${p.state}${on ? ' is-sel' : ''}${p.me ? ' is-me' : ''}${p.glow ? ' is-glow' : ''}${p.info ? ' is-click' : ''}`;
  const act = (e: React.SyntheticEvent) => { e.stopPropagation(); if (p.info) onSel(p.id); };
  const title = p.info ? `${p.info.title} · ${STATE_LABEL[p.state]}` : p.label;
  const common = { className: cls, onClick: act, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') act(e); }, tabIndex: p.info ? 0 : -1, role: p.info ? 'button' : undefined, 'aria-label': title, 'data-part': p.id };
  if (p.shape === 'circle') {
    const r = p.w / 2, cx = p.x + r, cy = p.y + r;
    return <g {...common}><title>{title}</title><circle cx={cx} cy={cy} r={r} className="dt-body-s" />
      {p.label ? <text x={cx} y={cy + 4} className="dt-t is-sm" textAnchor="middle">{p.label}</text> : <><circle cx={cx} cy={cy} r={r * 0.28} className="dt-hub" />{[0, 60, 120].map(a => <line key={a} className="dt-blade" x1={cx + Math.cos(a * Math.PI / 180) * r * 0.78} y1={cy + Math.sin(a * Math.PI / 180) * r * 0.78} x2={cx - Math.cos(a * Math.PI / 180) * r * 0.78} y2={cy - Math.sin(a * Math.PI / 180) * r * 0.78} />)}</>}</g>;
  }
  if (p.shape === 'led') return <g {...common}><title>{title}</title><circle cx={p.x + 5} cy={p.y + 5} r={5} className="dt-led" />{p.label && <text x={p.x + 14} y={p.y + 9} className="dt-t is-led">{p.label}</text>}</g>;
  const small = p.h < 34 || p.w < 44;
  return (
    <g {...common}>
      <title>{title}</title>
      <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.shape === 'port' ? 3 : Math.min(10, p.h / 4)} className="dt-body-s" />
      {p.fill !== undefined && p.fill > 0 && p.h >= 18 && <rect x={p.x + 3} y={p.y + p.h - 6} width={Math.max(0, (p.w - 6) * Math.min(1, p.fill))} height={3} rx={1.5} className="dt-fill" />}
      {p.shape === 'port' && <circle cx={p.x + p.w - 5} cy={p.y + 5} r={2.6} className="dt-led" />}
      {p.label && !(p.shape === 'port' && p.w < 40) && <text x={p.x + p.w / 2} y={p.y + (p.sub && !small ? p.h / 2 - 3 : p.h / 2 + 4)} className={`dt-t${small ? ' is-sm' : ''}`} textAnchor="middle">{p.label}</text>}
      {p.sub && !small && p.h >= 44 && <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 14} className="dt-t is-sub" textAnchor="middle">{clip(p.sub, Math.floor(p.w / 6.4))}</text>}
    </g>
  );
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);

const TONE: Record<PState, string> = { ok: 'vw-chip--success', warn: 'vw-chip--warning', bad: 'vw-chip--error', off: 'vw-chip--neutral', idle: 'vw-chip--neutral' };
export function Inspector({ p, onChip, onClose }: { p: Part; onChip: (k: number) => void; onClose: () => void }) {
  const i = p.info!;
  return (
    <div className="dt-insp-in">
      <div className="dt-insp-h"><span className={`dt-kind k-${i.kind}`}>{KIND_LABEL[i.kind]}</span><span className={`vw-chip ${TONE[i.state]} cmd-chip`}>{STATE_LABEL[i.state]}</span><span className="grow" />
        <button type="button" className="nst-icon-btn" aria-label="Close" onClick={onClose}><I.X size={14} /></button></div>
      <b className="dt-insp-t">{i.title}</b>
      <dl className="dt-kv">{i.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {i.note && <div className={`note ${i.state === 'bad' ? 'note--bad' : 'note--warn'}`}><I.Wrench size={14} /><span>{i.note}</span></div>}
      <div className="row wrap" style={{ gap: 8 }}>
        {i.chip !== undefined && <button type="button" className="nst-btn nst-btn--sm" onClick={() => onChip(i.chip!)}><I.Cpu size={14} />Open accelerator view</button>}
        {i.to && <Link className="nst-btn nst-btn--sm" to={i.to.href}><I.ArrowRight size={14} />{i.to.label}</Link>}
      </div>
    </div>
  );
}

export function Summary({ d, issues, onSel, scene }: { d: NeData; issues: Part[]; onSel: (id: string) => void; scene: Scene }) {
  const counts = KINDS.map(k => ({ k, n: scene.parts.filter(p => p.kind === k).length })).filter(x => x.n);
  return (
    <div className="dt-insp-in">
      <span className="vw-card-metric-label">This view</span>
      <b className="dt-insp-t">{d.ne.vendor} {d.ne.model}</b>
      <dl className="dt-kv">{counts.map(x => <div key={x.k}><dt>{KIND_LABEL[x.k]}</dt><dd>{x.n} part{x.n === 1 ? '' : 's'}</dd></div>)}</dl>
      <span className="vw-card-metric-label">{issues.length ? `Needs attention · ${issues.length}` : 'Health'}</span>
      {issues.length ? <ul className="dt-issues">{issues.slice(0, 8).map(p => (
        <li key={p.id}><button type="button" onClick={() => onSel(p.id)}><i className={`s-${p.state}`} /><span>{p.info?.title ?? p.label}</span><small>{STATE_LABEL[p.state]}</small></button></li>))}</ul>
        : <span className="dt-ok"><I.CircleCheck size={15} />Every part in this view reports healthy.</span>}
      <span className="vw-label">Select any part — a port, a power supply, a fan, a GPU — to see its live readings.</span>
    </div>
  );
}
