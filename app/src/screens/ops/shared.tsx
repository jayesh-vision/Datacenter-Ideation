import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { fmtDur } from '../../lib/format';
import '../../styles/ops.css';

/* Local toast for ops screens (the shell has no global toast bus). */
export function useToast() {
  const [t, setT] = useState<{ title: string; body?: string; link?: { to: string; label: string } } | null>(null);
  useEffect(() => { if (!t) return; const h = setTimeout(() => setT(null), 6000); return () => clearTimeout(h); }, [t]);
  const show = useCallback((title: string, body?: string, link?: { to: string; label: string }) => setT({ title, body, link }), []);
  const node: ReactNode = t ? createPortal(
    <div className="toasts" aria-live="polite">
      <div className="toast">
        <span className="toast-ico tone-success"><Check size={15} /></span>
        <div style={{ flex: 1, minWidth: 0 }}><b>{t.title}</b>{t.body && <span>{t.body}</span>}{t.link && <Link to={t.link.to} onClick={() => setT(null)}>{t.link.label} →</Link>}</div>
        <button type="button" onClick={() => setT(null)} className="toast-x" aria-label="Dismiss"><X size={14} /></button>
      </div>
    </div>, document.body) : null;
  return { show, node };
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* SLA text from minutes left: "2h 19m left" / "Overdue 1h 20m" */
export const slaText = (left: number) => (left >= 0 ? `${fmtHm(left)} left` : `Overdue ${fmtHm(-left)}`);
export const fmtHm = (min: number) => { const m = Math.round(Math.abs(min)); const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), r = m % 60; return d ? `${d}d ${h}h` : h ? `${h}h ${r}m` : `${r}m`; };
export { fmtDur };

/* evidence / affected refs → route */
export function refTo(ref: string | undefined, alertNe?: (code: string) => string | undefined): string | null {
  if (!ref) return null;
  if (/^ALM-\d+/.test(ref)) { const ne = alertNe?.(ref); return ne ? `/ne/${encodeURIComponent(ne)}?tab=alerts` : `/alerts?q=${ref}`; }
  if (/^CHG-\d+/.test(ref)) return `/changes?id=${ref}`;
  if (/^INC-\d+/.test(ref)) return `/incidents/${ref}`;
  if (/^LNK-\d+/.test(ref)) return `/alerts?q=${ref}`;
  if (/^[A-Z]{2}-DC-\d{3}$/.test(ref)) return `/datacenters/${ref}`;
  if (/^[A-Z]{2}-DC-\d{3}-RACK-/.test(ref)) return `/datacenters/${ref.slice(0, 9)}?tab=details`;
  if (/^[A-Z]{2}-DC-\d{3}-(UPS|CRAH|AC|COL)/.test(ref) || /^COL-/.test(ref)) return `/facilities?dc=${ref.replace(/^COL-/, '').slice(0, 9)}`;
  if (/^[A-Z]{2}-DC-\d{3}-[A-Z0-9-]+:/.test(ref)) { const [ne, ifn] = ref.split(':'); return `/ne/${encodeURIComponent(ne)}?tab=hardware&if=${encodeURIComponent(ifn)}`; }
  if (/^[A-Z]{2}-DC-\d{3}-/.test(ref)) return `/ne/${encodeURIComponent(ref)}`;
  return null;
}

export function OpsKpi({ label, value, sub, tone, onClick, active, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'warn' | 'good'; onClick?: () => void; active?: boolean; icon?: ReactNode }) {
  return (
    <div className={`kpi vw-card-section${onClick ? ' is-click' : ''}${active ? ' is-active' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}>
      <div className="kpi-head"><span className="kpi-label">{label}</span>{icon}</div>
      <div className="kpi-main"><span className={`kpi-value ${tone ?? ''}`}>{value}</span></div>
      {sub && <div className="kpi-basis">{sub}</div>}
    </div>
  );
}
