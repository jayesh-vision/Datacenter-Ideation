import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownRight, ArrowUpRight, Check, ChevronRight, Minus, MoreHorizontal, Search, Trash2, X, type LucideIcon } from 'lucide-react';
import type { Tone } from '../lib/tone';
import { Sparkline } from '../charts/Sparkline';

export function Chip({ tone = 'neutral', children, dot, size = 'sm', outline, title, solid }: { tone?: Tone; children: ReactNode; dot?: boolean; size?: 'sm' | 'xs' | 'md'; outline?: boolean; title?: string; solid?: boolean }) {
  return (
    <span className={`vw-chip vw-chip--${tone}${solid ? '-solid' : ''} ${size === 'md' ? '' : `chip-${size}`}${outline ? ' is-outline' : ''}`} title={title}>
      {dot && <i className="chip-dot" />}{children}
    </span>
  );
}

type BtnVariant = 'filled' | 'outline' | 'gray' | 'ghost' | 'action' | 'danger' | 'danger-subtle';
export function Btn({ variant = 'outline', size = 'sm', icon: I, children, onClick, disabled, block, title, type = 'button', iconRight: IR, className = '' }: {
  variant?: BtnVariant; size?: 'xs' | 'sm' | 'md' | 'lg'; icon?: LucideIcon; iconRight?: LucideIcon; children?: ReactNode; onClick?: (e: React.MouseEvent) => void; disabled?: boolean; block?: boolean; title?: string; type?: 'button' | 'submit'; className?: string;
}) {
  const v = variant === 'outline' ? '' : ` nst-btn--${variant}`;
  const s = size === 'xs' ? 14 : size === 'sm' ? 15 : 16;
  return (
    <button type={type} className={`nst-btn nst-btn--${size}${v}${children ? '' : ' nst-btn--icon'}${block ? ' is-block' : ''} ${className}`} onClick={onClick} disabled={disabled} title={title} aria-label={!children ? title : undefined}>
      {I && <I size={s} />}{children}{IR && <IR size={s} />}
    </button>
  );
}

export function IconBtn({ icon: I, title, onClick, active, size = 16 }: { icon: LucideIcon; title: string; onClick?: (e: React.MouseEvent) => void; active?: boolean; size?: number }) {
  return <button type="button" className={`nst-icon-btn${active ? ' is-active' : ''}`} onClick={onClick} title={title} aria-label={title}><I size={size} /></button>;
}

export function Panel({ title, sub, icon: I, count, actions, children, flush, foot, className = '', style }: {
  title?: ReactNode; sub?: ReactNode; icon?: ComponentType<{ size?: number; className?: string }>; count?: number | string; actions?: ReactNode; children: ReactNode; flush?: boolean; foot?: ReactNode; className?: string; style?: CSSProperties;
}) {
  return (
    <section className={`panel vw-card-section ${className}`} style={style}>
      {(title || actions) && (
        <div className="panel-head">
          <div style={{ minWidth: 0 }}>
            <h3>{I && <I size={16} className="muted" />}{title}{count !== undefined && <span className="count">{count}</span>}</h3>
            {sub && <div className="sub">{sub}</div>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={`panel-body${flush ? ' is-flush' : ''}`}>{children}</div>
      {foot && <div className="panel-foot">{foot}</div>}
    </section>
  );
}

export function PanelLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button type="button" className="panel-link" onClick={onClick}>{children}<ChevronRight size={14} /></button>;
}

export function Kpi({ label, value, unit, delta, deltaGood = 'up', basis, icon: I, tone = 'info', onClick, spark, sparkColor, active, accent }: {
  label: string; value: ReactNode; unit?: string; delta?: number | null; deltaGood?: 'up' | 'down'; basis?: ReactNode; icon?: LucideIcon; tone?: Tone;
  onClick?: () => void; spark?: number[]; sparkColor?: string; active?: boolean; accent?: string;
}) {
  const good = delta === null || delta === undefined ? null : deltaGood === 'up' ? delta >= 0 : delta <= 0;
  return (
    <div className={`kpi vw-card-section${onClick ? ' is-click' : ''}${active ? ' is-active' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}>
      {accent && <span className="kpi-accent" style={{ background: accent }} />}
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        {I && <span className={`kpi-ico tone-${tone}`}><I size={16} /></span>}
      </div>
      <div className="kpi-main">
        <span className="kpi-value">{value}</span>{unit && <span className="kpi-unit">{unit}</span>}
        {delta !== undefined && delta !== null && Number.isFinite(delta) && (
          <span className={`kpi-delta ${good ? 'good' : 'bad'}`}>{delta === 0 ? <Minus size={13} /> : delta > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}</span>
        )}
      </div>
      {spark && <div className="kpi-spark"><Sparkline values={spark} color={sparkColor ?? '#1C81EF'} height={26} /></div>}
      {basis && <div className="kpi-basis">{basis}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number; icon?: LucideIcon }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(t => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab${value === t.id ? ' is-active' : ''}`} onClick={() => onChange(t.id)}>
          {t.icon && <t.icon size={15} />}{t.label}{t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange, size }: { options: { id: T; label: string; icon?: LucideIcon; title?: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' }) {
  return (
    <div className={`seg${size === 'sm' ? ' is-sm' : ''}`} role="radiogroup">
      {options.map(o => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? 'is-active' : ''} onClick={() => onChange(o.id)} title={o.title}>
          {o.icon && <o.icon size={14} />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', width, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number; autoFocus?: boolean }) {
  return (
    <label className="search" style={width ? { width } : undefined}>
      <Search size={15} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear"><X size={14} /></button>}
    </label>
  );
}

export function Field({ label, hint, required, error, children, style }: { label: ReactNode; hint?: ReactNode; required?: boolean; error?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <label className="field" style={style}>
      <span className="field-label">{label}{required && <span className="req">*</span>}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) =>
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle${on ? ' is-on' : ''}`} onClick={e => { e.stopPropagation(); onChange(!on); }} />;

export const CheckBox = ({ on, mixed, onChange, label }: { on: boolean; mixed?: boolean; onChange: (v: boolean) => void; label?: string }) =>
  <button type="button" role="checkbox" aria-checked={mixed ? 'mixed' : on} aria-label={label} className={`check${on ? ' is-on' : ''}${mixed ? ' is-mixed' : ''}`} onClick={e => { e.stopPropagation(); onChange(!on); }}>
    {mixed ? <Minus size={12} strokeWidth={3} /> : on ? <Check size={12} strokeWidth={3} /> : null}
  </button>;

export function Avatar({ name, initials, hue = 210, size = 32, status }: { name?: string; initials: string; hue?: number; size?: number; status?: string }) {
  return (
    <span className="av" title={name} style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: `hsl(${hue} 55% 46%)` }}>
      {initials}{status && <i className="av-dot" style={{ background: status }} />}
    </span>
  );
}

export function Bar({ value, color, max = 100, height = 6 }: { value: number; color?: string; max?: number; height?: number }) {
  return <div className="bar" style={{ height }}><i style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} /></div>;
}

export function Empty({ icon: I, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><span className="empty-ico"><I size={22} /></span><b>{title}</b>{children && <div>{children}</div>}{action && <div style={{ marginTop: 8 }}>{action}</div>}</div>;
}

export function KV({ items, cols = 4 }: { items: [ReactNode, ReactNode][]; cols?: number }) {
  return <dl className="kv" style={{ '--cols': cols } as CSSProperties}>{items.map(([k, v], i) => <div className="kv-item" key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

export function Drawer({ open, onClose, title, sub, children, foot, width = 560, head }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; foot?: ReactNode; width?: number; head?: ReactNode }) {
  useEsc(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" style={{ '--w': `${width}px` } as CSSProperties} role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}><h2>{title}</h2>{sub && <div className="sub">{sub}</div>}{head}</div>
          <IconBtn icon={X} title="Close" onClick={onClose} />
        </div>
        <div className="drawer-body">{children}</div>
        {foot && <div className="drawer-foot">{foot}</div>}
      </aside>
    </>, document.body);
}

export function Modal({ open, onClose, title, sub, children, foot, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; foot?: ReactNode; width?: number }) {
  useEsc(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" style={{ '--w': `${width}px` } as CSSProperties} role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div style={{ flex: 1 }}><h2>{title}</h2>{sub && <div className="sub">{sub}</div>}</div>
          <IconBtn icon={X} title="Close" onClick={onClose} />
        </div>
        <div className="drawer-body">{children}</div>
        {foot && <div className="drawer-foot">{foot}</div>}
      </div>
    </>, document.body);
}

function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [open, onClose]);
}

export interface MenuItem { label: string; icon?: LucideIcon; onClick: () => void; danger?: boolean; disabled?: boolean; sep?: boolean }
export function Menu({ items, trigger, align = 'right' }: { items: MenuItem[]; trigger?: (open: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }} onClick={e => e.stopPropagation()}>
      {trigger ? trigger(() => setOpen(o => !o)) : <IconBtn icon={MoreHorizontal} title="Actions" onClick={() => setOpen(o => !o)} />}
      {open && (
        <div className="menu" style={{ top: 'calc(100% + 6px)', [align]: 0 } as CSSProperties}>
          {items.map((it, i) => (
            <div key={i}>
              {it.sep && <div className="menu-sep" />}
              <button type="button" className={`menu-item${it.danger ? ' is-danger' : ''}`} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>
                {it.icon && <it.icon size={15} />}{it.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return <div className="col" style={{ gap: 2 }}><span className="muted" style={{ fontSize: 12 }}>{label}</span><span className="num strong" style={{ fontSize: 18 }}>{value}</span>{sub && <span className="muted" style={{ fontSize: 11.5 }}>{sub}</span>}</div>;
}

/* Delete with guard rails: blocked while something depends on the item, and
   then offers the reversible option instead. */
export function ConfirmDelete({ open, onClose, what, name, blockers, onDelete, onDeactivate, deactivateLabel = 'Deactivate instead' }: {
  open: boolean; onClose: () => void; what: string; name: string; blockers: string[]; onDelete: () => void; onDeactivate?: () => void; deactivateLabel?: string;
}) {
  const blocked = blockers.length > 0;
  return (
    <Modal open={open} onClose={onClose} width={480} title={blocked ? `${name} is in use` : `Delete ${what}?`}
      foot={<><Btn onClick={onClose}>Cancel</Btn>{blocked ? onDeactivate && <Btn variant="filled" onClick={() => { onDeactivate(); onClose(); }}>{deactivateLabel}</Btn> : <Btn variant="danger" icon={Trash2} onClick={() => { onDelete(); onClose(); }}>Delete</Btn>}</>}>
      {blocked ? (
        <div className="col" style={{ gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>It can't be deleted while other records depend on it, because that would break their history:</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-800)' }}>{blockers.map(b => <li key={b}>{b}</li>)}</ul>
          {onDeactivate && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Deactivating hides it from new work and keeps everything that already uses it.</p>}
        </div>
      ) : <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}><b>{name}</b> isn't used anywhere. Deleting it removes it permanently.</p>}
    </Modal>
  );
}
