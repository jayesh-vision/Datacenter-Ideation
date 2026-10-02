import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { CheckBox, Empty } from './kit';

export interface Col<T> {
  key: string; header: ReactNode; render: (row: T) => ReactNode;
  /** width hint — only used by compact tables; full grids size columns to their content */
  sort?: (row: T) => number | string; align?: 'right'; width?: number | string; wrap?: boolean;
  /** hide the column when the viewport is narrower than this (px) — lets a wide table keep its key columns readable */
  hideBelow?: number;
}

function useViewportWidth() {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 9999 : window.innerWidth));
  useEffect(() => { const f = () => setW(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return w;
}

export function DataTable<T extends { id: string }>({
  rows, cols: allCols, onRow, pageSize = 25, defaultSort, selectable, selected, onSelect, toolbar, bulkbar, maxHeight, empty, rowClass, compact
}: {
  rows: T[]; cols: Col<T>[]; onRow?: (r: T) => void; pageSize?: number; defaultSort?: { key: string; dir: 'asc' | 'desc' };
  selectable?: boolean; selected?: Set<string>; onSelect?: (s: Set<string>) => void; toolbar?: ReactNode; bulkbar?: ReactNode;
  maxHeight?: number | string; empty?: ReactNode; rowClass?: (r: T) => string; compact?: boolean;
}) {
  const vw = useViewportWidth();
  const cols = allCols.filter(c => !c.hideBelow || vw >= c.hideBelow);
  const [sort, setSort] = useState(defaultSort ?? null);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows.length]);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find(x => x.key === sort.key);
    if (!c?.sort) return rows;
    const f = c.sort;
    return [...rows].sort((a, b) => { const x = f(a), y = f(b); const r = x < y ? -1 : x > y ? 1 : 0; return sort.dir === 'asc' ? r : -r; });
  }, [rows, sort, cols]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const p = Math.min(page, pages - 1);
  const view = sorted.slice(p * pageSize, (p + 1) * pageSize);
  const sel = selected ?? new Set<string>();
  const allOn = view.length > 0 && view.every(r => sel.has(r.id));
  const someOn = view.some(r => sel.has(r.id));

  return (
    <div className={`dt${compact ? ' is-compact' : ''}`}>
      {toolbar && <div className="dt-toolbar">{toolbar}</div>}
      {bulkbar && sel.size > 0 && <div className="dt-bulkbar">{bulkbar}</div>}
      <div className="dt-scroll" style={maxHeight ? { maxHeight } : undefined}>
        <table className="nst-table dt-table">
          <thead>
            <tr>
              {selectable && <th style={{ width: 40 }}><CheckBox on={allOn} mixed={!allOn && someOn} label="Select page" onChange={v => { const n = new Set(sel); view.forEach(r => (v ? n.add(r.id) : n.delete(r.id))); onSelect?.(n); }} /></th>}
              {cols.map(c => (
                <th key={c.key} className={c.align === 'right' ? 'is-right' : ''} style={compact ? { width: c.width } : undefined}>
                  {c.sort ? (
                    <button type="button" className={`dt-sort${sort?.key === c.key ? ' is-active' : ''}`} onClick={() => setSort(s => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' }))}>
                      {c.header}<ArrowDown size={12} style={{ transform: sort?.key === c.key && sort.dir === 'asc' ? 'rotate(180deg)' : undefined }} />
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map(r => (
              <tr key={r.id} className={`${onRow ? 'is-click' : ''}${sel.has(r.id) ? ' is-selected' : ''} ${rowClass?.(r) ?? ''}`} onClick={() => onRow?.(r)}>
                {selectable && <td onClick={e => e.stopPropagation()}><CheckBox on={sel.has(r.id)} label="Select row" onChange={v => { const n = new Set(sel); v ? n.add(r.id) : n.delete(r.id); onSelect?.(n); }} /></td>}
                {cols.map(c => <td key={c.key} className={`${c.align === 'right' ? 'is-right' : ''}${c.wrap ? ' is-wrap' : ''}`}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (empty ?? <Empty icon={Inbox} title="Nothing matches">Try clearing a filter or widening the period.</Empty>)}
      </div>
      {rows.length > pageSize && (
        <div className="dt-pager">
          <span>{p * pageSize + 1}–{Math.min(sorted.length, (p + 1) * pageSize)} of {sorted.length.toLocaleString('en-IN')}</span>
          <div className="row">
            <button type="button" className="nst-icon-btn" disabled={p === 0} onClick={() => setPage(p - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
            <span>Page {p + 1} / {pages}</span>
            <button type="button" className="nst-icon-btn" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
