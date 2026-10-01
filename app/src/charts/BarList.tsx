export interface BarItem {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  display?: string;
  secondary?: string;
  color?: string;
  onClick?: () => void;
}

/* Ranked list: name and value share the top line, the bar runs full width
   underneath. Labels never truncate, so it holds up in a narrow side panel
   as well as a wide one. */
export function BarList({ items, max, limit, color = '#1C81EF', marker }: {
  items: BarItem[]; max?: number; limit?: number; color?: string;
  marker?: { value: number; label: string };
}) {
  const shown = limit ? items.slice(0, limit) : items;
  const top = max ?? Math.max(1, ...shown.map(i => i.value), marker?.value ?? 0);
  if (!shown.length) return <div className="ch-empty">Nothing to rank in this scope.</div>;
  return (
    <ul className="bl">
      {shown.map(it => {
        const body = (
          <>
            <span className="bl-top">
              <span className="bl-name">{it.label}{it.sublabel && <span className="bl-sub">{it.sublabel}</span>}</span>
              <span className="bl-value">{it.display ?? it.value}{it.secondary && <span className="bl-secondary">{it.secondary}</span>}</span>
            </span>
            <span className="bl-track">
              <span className="bl-fill" style={{ width: `${Math.max(it.value > 0 ? 1 : 0, (it.value / top) * 100)}%`, background: it.color ?? color }} />
              {marker && <span className="bl-marker" style={{ left: `${(marker.value / top) * 100}%` }} title={marker.label} />}
            </span>
          </>
        );
        return (
          <li key={it.key}>
            {it.onClick
              ? <button type="button" className="bl-row is-click" onClick={it.onClick}>{body}</button>
              : <div className="bl-row">{body}</div>}
          </li>
        );
      })}
      {marker && <li className="bl-marker-legend"><i />{marker.label}</li>}
    </ul>
  );
}
