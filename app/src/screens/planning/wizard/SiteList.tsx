/* Picking a live site for the generic site picker: a searchable list of the sites with what they can still take (IT headroom after
   live draw, holds and approved plans; free rack positions; what binds first), and the chosen site as a card with a capacity bar
   (drawn · held · approved plans · this plan · free) and the baseline figures. Figures come from planner/lib/site.ts siteBaseline. */
import { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { Chip, SearchBox } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import { dcTypeName } from '../../../planner/p2b/dcTypes';
import { siteBaseline, type SiteBaseline } from '../../../planner/lib/site';
import type { PlannerData } from '../../../planner/lib/plannerData';
import type { Estate } from '../../../planner/lib/usePlanner';
import { Figs } from '../parts';
import { kw, num } from '../common';

export interface SiteRow { dc: T.DataCenter; city?: string; base?: SiteBaseline; freeKw: number; freePositions: number }

export function useSiteRows(estate: Estate, data: PlannerData, excludePlanId?: string): SiteRow[] {
  return useMemo(() => estate.dataCenters.map(dc => {
    const base = data.ready ? siteBaseline(data, dc.id, { excludePlanId }) : undefined;
    return { dc, city: estate.campuses.find(c => c.id === dc.campusId)?.city, base, freeKw: Math.max(0, base?.headroomItKw ?? 0), freePositions: base ? base.halls.reduce((a, h) => a + h.freePositions, 0) : 0 };
  }).sort((a, b) => a.dc.code.localeCompare(b.dc.code, undefined, { numeric: true })), [estate, data, excludePlanId]);
}

/** Selectable list of live sites with the figures that matter for placing new load. */
export function SiteList({ rows, value, onPick, needKw, disabled }: { rows: SiteRow[]; value?: string; onPick: (id: string) => void; needKw: number; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const list = rows.filter(r => !q || `${r.dc.code} ${r.dc.name} ${r.city ?? ''} ${dcTypeName(r.dc.dcTypeKey ?? '')}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="pn-sitelist">
      <div className="pn-sitelist-bar"><SearchBox value={q} onChange={setQ} placeholder="Search by code, name, city or kind of site" width={340} /><span className="vw-label">{list.length === rows.length ? `${rows.length} live sites` : `${list.length} of ${rows.length} sites`}{needKw > 0 ? ` · this plan needs ${kw(needKw)}` : ''}</span></div>
      <div className="pn-tbl" style={{ maxHeight: 260 }}>
        <table className="nst-table">
          <thead><tr><th aria-label="Selected" /><th>Site</th><th>Kind and tier</th><th>IT headroom</th><th>Free positions</th><th>Binds first</th></tr></thead>
          <tbody>
            {list.map(r => { const sel = r.dc.id === value; const fits = needKw <= 0 || r.freeKw >= needKw; return (
              <tr key={r.dc.id} className={`is-clickable${sel ? ' is-selected' : ''}`} onClick={() => !disabled && onPick(r.dc.id)} aria-selected={sel}>
                <td>{sel ? <I.CircleCheck size={16} className="pn-sitelist-on" /> : <I.Circle size={16} className="muted" />}</td>
                <td><span className="cell-2"><b style={{ fontWeight: 500 }}>{r.dc.name === r.dc.code ? r.dc.name : `${r.dc.code} · ${r.dc.name}`}</b><small>{r.city ?? '—'}{r.dc.status !== 'Operational' ? ` · ${r.dc.status}` : ''}</small></span></td>
                <td>{dcTypeName(r.dc.dcTypeKey ?? '') || '—'} · {r.dc.tier}</td>
                <td className={`num${fits ? '' : ' pn-bad'}`} style={{ whiteSpace: 'nowrap' }}>{kw(r.freeKw)}{!fits && <small className="vw-label"> · {kw(needKw - r.freeKw)} short</small>}</td>
                <td className="num">{num(r.freePositions)}</td>
                <td>{r.base?.binding ? <Chip tone="neutral" size="xs">{r.base.binding.label}</Chip> : <span className="vw-label">—</span>}</td>
              </tr>); })}
            {!list.length && <tr><td colSpan={6} className="vw-label">No site matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The chosen site: what is drawn, held and promised today, what this plan adds, and the baseline figures. */
export function SiteCard({ row, needKw, label, compact }: { row: SiteRow; needKw: number; label: string; compact?: boolean }) {
  const b = row.base;
  if (!b) return null;
  const used = b.itLoadKw + b.reservedKw + b.pipelineKw;
  const cap = Math.max(1, used + Math.max(0, b.headroomItKw), used + needKw);
  const fits = needKw <= 0 || b.headroomItKw >= needKw;
  const w = (v: number) => `${Math.max(0, (v / cap) * 100)}%`;
  const segs = [
    { k: 'drawn', v: b.itLoadKw, label: 'Drawn today' },
    { k: 'held', v: b.reservedKw, label: 'Held' },
    { k: 'pipe', v: b.pipelineKw, label: 'Approved plans' },
    { k: fits ? 'plan' : 'plan is-short', v: needKw, label: 'This plan' },
  ].filter(s => s.v > 0);
  return (
    <div className="pn-sitecard">
      <div className="pn-sitecard-head">
        <span className="pn-sitecard-id"><small>{label}</small><b>{row.dc.name === row.dc.code ? row.dc.name : `${row.dc.code} · ${row.dc.name}`}</b><span className="vw-label">{row.city ?? ''}{b.binding ? ` · ${b.binding.label} binds first` : ''}</span></span>
        <span className="row wrap" style={{ gap: 6 }}><Chip tone="neutral" size="xs">{dcTypeName(row.dc.dcTypeKey ?? '') || 'Kind not set'}</Chip><Chip tone="neutral" size="xs">{row.dc.tier}</Chip>{needKw > 0 && <Chip tone={fits ? 'success' : 'error'} size="xs" dot>{fits ? 'Has room for this plan' : `${kw(needKw - b.headroomItKw)} short`}</Chip>}</span>
      </div>
      <div className="pn-capbar" role="img" aria-label={`${kw(used)} of ${kw(cap)} used or promised${needKw ? `, this plan adds ${kw(needKw)}` : ''}`}>{segs.map(s => <i key={s.k} className={`is-${s.k}`} style={{ width: w(s.v) }} title={`${s.label}: ${kw(s.v)}`} />)}</div>
      <div className="pn-capbar-legend">{segs.map(s => <span key={s.k}><i className={`is-${s.k}`} />{s.label} <b className="num">{kw(s.v)}</b></span>)}<span><i className="is-free" />Free <b className="num">{kw(Math.max(0, b.headroomItKw - needKw))}</b></span></div>
      {compact ? <p className="pn-sitecard-facts">{kw(b.headroomItKw)} IT headroom · {num(row.freePositions)} free rack positions in {b.halls.length} halls</p> : <Figs items={[['IT headroom', kw(b.headroomItKw)], ['Live draw', kw(b.itLoadKw)], ['Held', kw(b.reservedKw)], ['Approved plans', kw(b.pipelineKw)], ['Free rack positions', `${num(row.freePositions)} in ${b.halls.length} halls`]]} />}
      {b.warnings.length > 0 && <p className="note note--warn" style={{ margin: '8px 0 0' }}><I.TriangleAlert size={15} /><span>{b.warnings.join('; ')}</span></p>}
    </div>
  );
}
