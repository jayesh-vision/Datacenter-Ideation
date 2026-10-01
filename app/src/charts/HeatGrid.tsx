import { useState } from 'react';

export interface HeatRow { key: string; label: string; cells: (number | null)[] }

/* rows × time buckets; each cell prints its value so color is never the only
   carrier (relief for the sub-3:1 tints) */
export function HeatGrid({ rows, columns, fullColumns, tone, format, legend }: {
  rows: HeatRow[];
  columns: string[];
  fullColumns?: string[];
  tone: (v: number) => { bg: string; fg: string };
  format: (v: number) => string;
  legend: { label: string; bg: string }[];
}) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  return (
    <div className="hg">
      <div className="hg-scroll">
        <table className="hg-table">
          <thead>
            <tr>
              <th />
              {columns.map((c, i) => <th key={i} className={hover?.c === i ? 'is-hover' : ''} title={fullColumns?.[i]}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.key}>
                <th className={hover?.r === ri ? 'is-hover' : ''}>{row.label}</th>
                {row.cells.map((v, ci) => {
                  const t = v === null ? { bg: '#F8FAFC', fg: '#CBD5E1' } : tone(v);
                  return (
                    <td key={ci} onMouseEnter={() => setHover({ r: ri, c: ci })} onMouseLeave={() => setHover(null)}
                      title={`${row.label} · ${fullColumns?.[ci] ?? columns[ci]}: ${v === null ? 'no service' : format(v)}`}>
                      <span style={{ background: t.bg, color: t.fg }} className={hover?.r === ri && hover?.c === ci ? 'is-hover' : ''}>{v === null ? '—' : format(v)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ch-legend hg-legend">
        {legend.map(l => <span key={l.label}><i style={{ background: l.bg }} />{l.label}</span>)}
      </div>
    </div>
  );
}
