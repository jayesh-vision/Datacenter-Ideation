/* The plan page's tab row: as many tabs as fit on one line, the rest under "More" (an executing plan has up to 15 tabs and the row
   overflowed at 1440 px). The active tab is always shown in the row. */
import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Menu } from '../../../ui/kit';

export interface TabDef<T extends string> { id: T; label: string; count?: number }
const MORE_W = 92;

export function PlanTabs<T extends string>({ tabs, value, onChange }: { tabs: TabDef<T>[]; value: T; onChange: (t: T) => void }) {
  const row = useRef<HTMLDivElement | null>(null), probe = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(tabs.length);
  const key = tabs.map(t => `${t.id}:${t.count ?? ''}`).join('|');
  useLayoutEffect(() => {
    const el = row.current, pr = probe.current; if (!el || !pr) return;
    const calc = () => {
      const widths = [...pr.children].map(c => (c as HTMLElement).offsetWidth);
      const avail = el.clientWidth;
      const total = widths.reduce((a, w) => a + w, 0);
      if (total <= avail) { setFit(widths.length); return; }
      let n = 0, acc = MORE_W; while (n < widths.length && acc + widths[n] <= avail) { acc += widths[n]; n++; }
      setFit(Math.max(1, n));
    };
    calc();
    const ro = new ResizeObserver(calc); ro.observe(el); return () => ro.disconnect();
  }, [key]);
  const active = tabs.findIndex(t => t.id === value);
  let shown = tabs.slice(0, fit);
  if (fit < tabs.length && active >= fit) shown = [...tabs.slice(0, Math.max(0, fit - 1)), tabs[active]];
  const hidden = tabs.filter(t => !shown.includes(t));
  const btn = (t: TabDef<T>, live = true) => (
    <button key={t.id} data-id={live ? t.id : undefined} role={live ? 'tab' : undefined} aria-selected={live ? value === t.id : undefined} tabIndex={live ? undefined : -1} className={`tab${live && value === t.id ? ' is-active' : ''}`} onClick={live ? () => onChange(t.id) : undefined}>
      {t.label}{t.count !== undefined && <span className="count">{t.count}</span>}
    </button>
  );
  return (
    <div className="pn-tabbar" ref={row}>
      <div className="tabs" role="tablist">
        {shown.map(t => btn(t))}
        {hidden.length > 0 && <Menu align="right" items={hidden.map(t => ({ label: t.count !== undefined ? `${t.label} (${t.count})` : t.label, onClick: () => onChange(t.id) }))}
          trigger={open => <button type="button" className="tab pn-tab-more" data-more={hidden.map(t => t.id).join(',')} onClick={open} aria-haspopup="menu">More<span className="count">{hidden.length}</span><ChevronDown size={14} /></button>} />}
      </div>
      <div className="pn-tab-probe-wrap" aria-hidden><div className="pn-tab-probe" ref={probe}>{tabs.map(t => btn(t, false))}</div></div>
    </div>
  );
}
