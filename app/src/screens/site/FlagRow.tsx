import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/* One-line chip row that shows as many chips as fit and folds the rest into "+N more".
   Chip widths are measured once with everything rendered, then reused on resize. */
export function FlagRow({ items, more, empty }: { items: { key: string; node: ReactNode }[]; more: (n: number) => ReactNode; empty?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const widths = useRef<number[]>([]);
  const sig = items.map(i => i.key).join('|');
  const [n, setN] = useState(items.length);
  const [measured, setMeasured] = useState('');

  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    if (measured !== sig) { widths.current = [...el.children].map(c => (c as HTMLElement).offsetWidth); setMeasured(sig); }
    const fit = () => {
      const cs = getComputedStyle(el);
      const w = widths.current, cw = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), gap = 6, moreW = 84;
      let used = 0, k = 0;
      for (; k < w.length; k++) {
        const next = used + (k ? gap : 0) + w[k];
        const needMore = k < w.length - 1;
        if (next + (needMore ? gap + moreW : 0) > cw) break;
        used = next;
      }
      setN(k);
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [sig, measured]);

  if (!items.length) return <div ref={box} className="dch-bar-flags">{empty}</div>;
  const shown = measured === sig ? items.slice(0, n) : items;
  return <div ref={box} className="dch-bar-flags">{shown.map(i => <span key={i.key} className="dch-flag-wrap">{i.node}</span>)}{measured === sig && n < items.length && more(items.length - n)}</div>;
}
