import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as I from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { fmtNum } from '../lib/format';

/* lists whose filters live in the URL: apply several changes in ONE navigation
   (sequential setSearchParams calls in one tick would overwrite each other) */
export function useParamPatch() {
  const [sp, setSp] = useSearchParams();
  return (patch: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
}

/* One toolbar for every list/grid (user's platform reference):
     Showing N of M · search · quick-filter dropdowns ········ refresh · filter · ⋮
   Quick filters are searchable dropdowns. The filter icon opens a Filters panel
   (categories left, the chosen category's options right, Reset to default /
   Apply filters); it is blue while the panel is open and badged when any filter
   differs from its default. */

export interface ListFilter {
  id: string; label: string; value: string; onChange: (v: string) => void;
  options: { id: string; label: string; count?: number }[];
  /** value meaning "no filter"; default '' */
  defaultValue?: string;
  /** label of the "no filter" option, e.g. "Any severity"; omit when every option is a real choice (views) */
  anyLabel?: string;
  /** show inline next to the search box (at most two per list) */
  quick?: boolean;
}

export function ListToolbar({ shown, total, noun, search, filters = [], onRefresh, actions = [], onApply, layout, children, tools }: {
  shown: number; total: number; noun?: string;
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
  filters?: ListFilter[]; onRefresh?: () => void;
  actions?: { label: string; icon?: I.LucideIcon; onClick: () => void }[];
  /** URL-backed filters: receives every changed filter at once (filter id = URL param, default value = removed) */
  onApply?: (patch: Record<string, string>) => void;
  /** list ⇄ tiles switch, shown next to the filter icon on lists that have a tile view */
  layout?: { value: 'list' | 'tiles'; onChange: (v: 'list' | 'tiles') => void };
  /** extra inline content after the quick filters (e.g. an active cause chip) */
  children?: ReactNode;
  /** extra icon buttons on the right, before refresh (e.g. reset view, full screen) */
  tools?: ReactNode;
}) {
  const [panel, setPanel] = useState(false);
  const [spin, setSpin] = useState(false);
  const [menu, setMenu] = useState(false);
  const active = filters.filter(f => f.value !== (f.defaultValue ?? '')).length;
  const quick = filters.filter(f => f.quick).slice(0, 2);
  const refresh = () => { setSpin(true); onRefresh?.(); setTimeout(() => setSpin(false), 600); };
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const f = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f);
  }, [menu]);

  return (
    <div className="lt">
      <span className="lt-count">Showing {fmtNum(shown)} of {fmtNum(total)}{noun ? ` ${noun}` : ''}</span>
      {search && (
        <label className="lt-search">
          <I.Search size={16} />
          <input value={search.value} onChange={e => search.onChange(e.target.value)} placeholder={search.placeholder} aria-label="Search" />
          {search.value && <button type="button" className="lt-x" onClick={() => search.onChange('')} aria-label="Clear search"><I.X size={14} /></button>}
        </label>
      )}
      {quick.map(f => <QuickSelect key={f.id} f={f} />)}
      {children}
      <span className="lt-grow" />
      {tools}
      <button type="button" className="nst-icon-btn lt-icon" title="Refresh" aria-label="Refresh" onClick={refresh}><I.RefreshCw size={16} className={spin ? 'lt-spin' : ''} /></button>
      {filters.length > 0 && (
        <button type="button" className={`nst-icon-btn lt-icon${panel || active ? ' is-on' : ''}`} title="Filters" aria-label="Filters" aria-expanded={panel} onClick={() => setPanel(p => !p)}>
          <I.Filter size={16} />{active > 0 && <span className="lt-badge">{active}</span>}
        </button>
      )}
      {layout && (
        <div className="lt-view" role="group" aria-label="View">
          <button type="button" className={layout.value === 'list' ? 'is-on' : ''} aria-pressed={layout.value === 'list'} title="List view" aria-label="List view" onClick={() => layout.onChange('list')}><I.List size={16} /></button>
          <button type="button" className={layout.value === 'tiles' ? 'is-on' : ''} aria-pressed={layout.value === 'tiles'} title="Tile view" aria-label="Tile view" onClick={() => layout.onChange('tiles')}><I.LayoutGrid size={16} /></button>
        </div>
      )}
      {actions.length > 0 && (
        <div className="lt-menu-wrap" ref={menuRef}>
          <button type="button" className="nst-icon-btn lt-icon" title="More actions" aria-label="More actions" onClick={() => setMenu(m => !m)}><I.MoreVertical size={16} /></button>
          {menu && <div className="lt-menu">{actions.map(a => <button key={a.label} type="button" onClick={() => { setMenu(false); a.onClick(); }}>{a.icon && <a.icon size={15} />}{a.label}</button>)}</div>}
        </div>
      )}
      {panel && <FilterPanel filters={filters} onApply={onApply} onClose={() => setPanel(false)} />}
    </div>
  );
}

/* Filters panel: staged changes, applied together */
function FilterPanel({ filters, onClose, onApply }: { filters: ListFilter[]; onClose: () => void; onApply?: (patch: Record<string, string>) => void }) {
  const [stage, setStage] = useState<Record<string, string>>(() => Object.fromEntries(filters.map(f => [f.id, f.value])));
  const [cur, setCur] = useState(filters[0]?.id);
  const f = filters.find(x => x.id === cur) ?? filters[0];
  const apply = () => {
    const changed = filters.filter(x => stage[x.id] !== x.value);
    if (onApply) { if (changed.length) onApply(Object.fromEntries(changed.map(x => [x.id, stage[x.id] === (x.defaultValue ?? '') ? '' : stage[x.id]]))); }
    else changed.forEach(x => x.onChange(stage[x.id]));
    onClose();
  };
  const reset = () => setStage(Object.fromEntries(filters.map(x => [x.id, x.defaultValue ?? ''])));
  return (
    <div className="lt-panel" role="dialog" aria-label="Filters">
      <div className="lt-panel-h"><b>Filters</b><button type="button" className="nst-icon-btn" onClick={onClose} aria-label="Close filters"><I.X size={16} /></button></div>
      <div className="lt-panel-b">
        <nav className="lt-cats">
          {filters.map(x => (
            <button key={x.id} type="button" className={x.id === f.id ? 'is-on' : ''} onClick={() => setCur(x.id)}>
              {x.label}{stage[x.id] !== (x.defaultValue ?? '') && <i className="lt-dot" />}
            </button>
          ))}
        </nav>
        <div className="lt-field">
          <span className="lt-field-l">{f.label}</span>
          <QuickSelect f={{ ...f, value: stage[f.id], onChange: v => setStage(s => ({ ...s, [f.id]: v })) }} block />
        </div>
      </div>
      <div className="lt-panel-f">
        <button type="button" className="nst-btn nst-btn--sm" onClick={reset}>Reset to default</button>
        <button type="button" className="nst-btn nst-btn--sm nst-btn--filled" onClick={apply}>Apply filters</button>
      </div>
    </div>
  );
}

/* searchable dropdown: "Severity ▾" → [search] Any severity / Critical / … */
export function QuickSelect({ f, block }: { f: ListFilter; block?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h); window.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('keydown', k); };
  }, [open]);
  const def = f.defaultValue ?? '';
  const opts = useMemo(() => [...(f.anyLabel ? [{ id: def, label: f.anyLabel }] : []), ...f.options.filter(o => o.id !== def || !f.anyLabel)], [f.options, f.anyLabel, def]);
  const shown = opts.filter(o => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  const sel = opts.find(o => o.id === f.value);
  const set = f.value !== def;
  const text = block ? (sel?.label ?? f.anyLabel ?? 'Any') : set || !f.anyLabel ? (sel?.label ?? f.label) : f.label;
  return (
    <div className={`qs${block ? ' is-block' : ''}`} ref={ref}>
      <button type="button" className={`qs-btn${open ? ' is-open' : ''}${set && !block ? ' is-set' : ''}`} onClick={() => { setOpen(o => !o); setQ(''); }} aria-haspopup="listbox" aria-expanded={open}>
        <span className="qs-txt">{text}{!block && !f.anyLabel && 'count' in (sel ?? {}) && sel?.count !== undefined ? <span className="qs-n">{sel.count}</span> : null}</span>
        <I.ChevronDown size={15} />
      </button>
      {open && (
        <div className="qs-pop" role="listbox">
          {opts.length > 6 && <label className="qs-search"><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search" /><I.Search size={15} /></label>}
          <div className="qs-list">
            {shown.map(o => (
              <button key={o.id || '_any'} type="button" role="option" aria-selected={o.id === f.value} className={o.id === f.value ? 'is-on' : ''} onClick={() => { f.onChange(o.id); setOpen(false); }}>
                <span>{o.label}</span>{'count' in o && o.count !== undefined && <span className="qs-c">{o.count}</span>}
              </button>
            ))}
            {!shown.length && <span className="qs-none">No match</span>}
          </div>
        </div>
      )}
    </div>
  );
}
