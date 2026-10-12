import type { ReactNode } from 'react';
import { Info } from '../../ui/kit';

export type StripItem = { key: string; label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'warn'; onClick?: () => void; active?: boolean; info?: string };

/* Slim one-card summary for a datacenter tab — replaces a row of KPI cards so the tab
   content gets the room. Clickable items act as filters (aria-pressed = active). */
export function SummaryStrip({ items }: { items: StripItem[] }) {
  return (
    <section className="vw-card-section sum-strip" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map(i => {
        const Tag = i.onClick ? 'button' : 'div';
        return (
          <Tag key={i.key} type={i.onClick ? 'button' : undefined} onClick={i.onClick} aria-pressed={i.onClick ? !!i.active : undefined}
            className={`sum-item${i.tone ? ` is-${i.tone}` : ''}${i.onClick ? ' is-clickable' : ''}${i.active ? ' is-active' : ''}`}>
            <span className="vw-label sum-label">{i.label}{i.info && <Info text={i.info} />}</span>
            <span className="sum-row"><span className="sum-value">{i.value}</span>{i.sub && <span className="sum-sub" title={typeof i.sub === 'string' ? i.sub : undefined}>{i.sub}</span>}</span>
          </Tag>
        );
      })}
    </section>
  );
}
