// ui_kits/admin-console/components.jsx
// Reusable Aurora components. Load after React + Babel.

const Icon = ({ name, size = 16, weight = 'regular', style }) => (
  <i className={`ph${weight === 'regular' ? '' : `-${weight}`} ph-${name}`} style={{ fontSize: size, lineHeight: 1, ...style }} />
);

const Button = ({ children, size = 'md', variant = 'filled', leftIcon, rightIcon, disabled, onClick, style }) => {
  const sizes = {
    lg: { h: 56, r: 16, px: 24, py: 16, fs: 16, lh: 24, fw: 600, gap: 8, icon: 20 },
    md: { h: 40, r: 12, px: 16, py: 8,  fs: 16, lh: 24, fw: 500, gap: 6, icon: 16 },
    sm: { h: 32, r: 8,  px: 8,  py: 6,  fs: 14, lh: 20, fw: 500, gap: 4, icon: 16 },
    xs: { h: 28, r: 8,  px: 8,  py: 4,  fs: 12, lh: 18, fw: 500, gap: 4, icon: 12 },
  }[size];
  const variants = {
    filled:     { bg: '#1C81EF', color: '#fff',    border: 'transparent', hover: '#4290ED', press: '#1767BE' },
    outline:    { bg: '#fff',    color: '#252525', border: '#E9E9E9',     hover: '#4290ED', press: '#1767BE' },
    gray:       { bg: '#F4F4F4', color: '#252525', border: 'transparent', hover: '#E9E9E9', press: '#E3E3E3' },
    borderless: { bg: 'transparent', color: '#252525', border: 'transparent', hover: '#F4F4F4', press: '#E9E9E9' },
    action:     { bg: 'transparent', color: '#1C81EF', border: 'transparent', hover: '#F4F4F4', press: '#E9E9E9' },
    red:        { bg: '#FF2020', color: '#fff',    border: 'transparent', hover: '#E21818', press: '#C01212' },
  }[variant];
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);

  const bg = disabled ? '#E3E3E3' : press ? variants.press : hover ? variants.hover : variants.bg;
  const color = disabled ? '#A8A8A8' : variants.color;
  const border = disabled ? 'transparent' : (hover && variant === 'outline') ? variants.hover : variants.border;

  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)} onMouseUp={() => setPress(false)}
      style={{
        height: sizes.h, borderRadius: sizes.r, padding: `${sizes.py}px ${sizes.px}px`,
        background: bg, color, border: `1px solid ${border}`,
        font: `${sizes.fw} ${sizes.fs}px/${sizes.lh}px Inter, system-ui, sans-serif`,
        display: 'inline-flex', alignItems: 'center', gap: sizes.gap,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {leftIcon && <Icon name={leftIcon} size={sizes.icon} />}
      {children}
      {rightIcon && <Icon name={rightIcon} size={sizes.icon} />}
    </button>
  );
};

const Field = ({ label, value, onChange, placeholder, hint, error, suffix, prefix, type = 'text', style }) => {
  const [focus, setFocus] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const borderColor = error ? '#B21313' : focus ? '#1C81EF' : hover ? '#4290ED' : '#E9E9E9';
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {label && <span style={{ font: '500 14px/20px Inter', color: '#252525' }}>{label}</span>}
      <div
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 32, borderRadius: 8, border: `1px solid ${borderColor}`,
          padding: '6px 8px', background: '#fff', transition: 'border-color 150ms',
        }}
      >
        {prefix && <span style={{ color: '#7C7C7C', font: '400 14px/20px Inter' }}>{prefix}</span>}
        <input
          type={type} value={value} onChange={onChange} placeholder={placeholder}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: '400 14px/20px Inter', color: '#252525', minWidth: 0 }}
        />
        {suffix && <span style={{ color: '#7C7C7C', font: '400 14px/20px Inter' }}>{suffix}</span>}
      </div>
      {(hint || error) && (
        <span style={{ font: '400 12px/18px Inter', color: error ? '#B91C1C' : '#7C7C7C' }}>{error || hint}</span>
      )}
    </label>
  );
};

const Chip = ({ tone = 'neutral', children, style }) => {
  const tones = {
    success: { bg: '#D1FAE5', fg: '#047857' },
    danger:  { bg: '#FEE2E2', fg: '#B91C1C' },
    warn:    { bg: '#FFEDD5', fg: '#C2410C' },
    caution: { bg: '#FEF9C5', fg: '#A16207' },
    info:    { bg: '#DBEAFE', fg: '#1D4EB8' },
    teal:    { bg: '#CFFAFE', fg: '#0E7490' },
    neutral: { bg: '#F4F4F4', fg: '#515151' },
  }[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: 22, borderRadius: 999,
      padding: '2px 8px', background: tones.bg, color: tones.fg,
      font: '500 12px/18px Inter', whiteSpace: 'nowrap', ...style,
    }}>{children}</span>
  );
};

const Checkbox = ({ checked, indeterminate, onChange, disabled, label }) => (
  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer' }}>
    <span style={{
      width: 18, height: 18, borderRadius: 4,
      background: disabled ? '#E3E3E3' : (checked || indeterminate) ? '#1C81EF' : '#fff',
      border: disabled ? 'none' : `1px solid ${checked || indeterminate ? '#1C81EF' : '#E9E9E9'}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 150ms',
    }}
    onClick={() => !disabled && onChange && onChange(!checked)}
    >
      {checked && !indeterminate && <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4 L4 7 L9 1" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      {indeterminate && <span style={{ width: 8, height: 1.5, background: '#fff', borderRadius: 1 }} />}
    </span>
    {label && <span style={{ font: '400 14px/20px Inter', color: disabled ? '#A8A8A8' : '#252525' }}>{label}</span>}
  </label>
);

const Radio = ({ checked, onChange, disabled, label, value }) => (
  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer' }}>
    <span
      onClick={() => !disabled && onChange && onChange(value)}
      style={{
        width: 18, height: 18, borderRadius: '50%',
        background: disabled ? '#E3E3E3' : '#fff',
        border: `1px solid ${!disabled && checked ? '#1C81EF' : '#E3E3E3'}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 150ms',
      }}
    >
      {checked && (
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: disabled ? '#A8A8A8' : '#1C81EF' }} />
      )}
    </span>
    {label && <span style={{ font: '400 14px/20px Inter', color: disabled ? '#A8A8A8' : '#252525' }}>{label}</span>}
  </label>
);

const Toggle = ({ on, onChange, disabled, label }) => (
  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer' }}>
    <span
      onClick={() => !disabled && onChange && onChange(!on)}
      style={{
        width: 28, height: 16, borderRadius: 999, padding: 2, boxSizing: 'border-box',
        background: disabled ? '#E3E3E3' : on ? '#1C81EF' : '#E3E3E3',
        display: 'inline-flex', justifyContent: on ? 'flex-end' : 'flex-start',
        transition: 'all 200ms ease-out',
      }}
    >
      <span style={{ width: 12, height: 12, borderRadius: 999, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,.1)' }} />
    </span>
    {label && <span style={{ font: '400 14px/20px Inter', color: disabled ? '#A8A8A8' : '#252525' }}>{label}</span>}
  </label>
);

const Tooltip = ({ title, body, children, side = 'bottom' }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        <span style={{
          position: 'absolute', left: '50%', top: 'calc(100% + 10px)', transform: 'translateX(-50%)',
          background: '#252525', color: '#fff', borderRadius: 8, padding: 12, width: 240, zIndex: 50,
          boxShadow: '0 2px 2px -1px rgba(10,13,18,.04), 0 4px 6px -2px rgba(10,13,18,.03), 0 12px 16px -4px rgba(10,13,18,.08)',
          pointerEvents: 'none',
        }}>
          {title && <div style={{ font: '700 12px/18px Inter' }}>{title}</div>}
          <div style={{ font: '500 12px/18px Inter', marginTop: title ? 2 : 0 }}>{body}</div>
          <span style={{ position: 'absolute', left: '50%', top: -6, transform: 'translateX(-50%) rotate(45deg)', width: 12, height: 12, background: '#252525', borderRadius: 2 }} />
        </span>
      )}
    </span>
  );
};

const Tabs = ({ tabs, value, onChange }) => (
  <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid #E9E9E9' }}>
    {tabs.map(t => {
      const active = t.value === value;
      return (
        <button key={t.value} onClick={() => onChange && onChange(t.value)}
          style={{
            padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${active ? '#1C81EF' : 'transparent'}`,
            color: active ? '#1C81EF' : '#515151',
            font: `${active ? 500 : 400} 14px/20px Inter`,
            marginBottom: -1,
          }}>{t.label}</button>
      );
    })}
  </div>
);

const Stepper = ({ steps, current }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
    {steps.map((s, i) => {
      const done = i < current;
      const active = i === current;
      return (
        <React.Fragment key={i}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 90 }}>
            <div style={{
              width: 20, height: 20, borderRadius: 999,
              background: (done || active) ? '#1C81EF' : '#fff',
              border: (done || active) ? 'none' : '1px solid #E3E3E3',
              color: (done || active) ? '#fff' : '#A8A8A8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              font: '600 12px/18px Inter',
            }}>
              {done ? <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4 L4 7 L9 1" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg> : i + 1}
            </div>
            <div style={{ font: `${active ? 500 : 400} 12px/18px Inter`, color: (done || active) ? '#252525' : '#A8A8A8' }}>{s}</div>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 20, display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '100%', height: 2, background: done ? '#1C81EF' : '#E3E3E3' }} />
            </div>
          )}
        </React.Fragment>
      );
    })}
  </div>
);

const Card = ({ children, padding = 16, style }) => (
  <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E9E9E9', padding, ...style }}>{children}</div>
);

// ─── Table ───────────────────────────────────────────────────────────────────
// columns: [{ key, label, width?, primary?, render? }]
//   key = '__select'  → renders a Checkbox (pass onToggleAll / onToggleRow)
//   key = '__actions' → renders a kebab menu; row must have __actions: [{label, onClick, danger?}]
// rows: array of objects with an `id` field
// selectedIds: string[] of selected row ids
//
// Example:
//   <Table
//     columns={[
//       { key: '__select', label: '', width: '32px' },
//       { key: 'status',   label: 'Status', width: '92px', render: (v) => <Chip tone="success">{v}</Chip> },
//       { key: 'name',     label: 'Name', primary: true },
//       { key: '__actions', label: '', width: '22px' },
//     ]}
//     rows={data}
//     selectedIds={selected}
//     onToggleAll={() => toggleAll()}
//     onToggleRow={(id) => toggleRow(id)}
//   />

const TableRow = ({ row, columns, template, selected, onToggleRow }) => {
  const [hovered, setHovered] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const bg = selected ? '#F0F7FE' : hovered ? '#FAFAFA' : '#fff';

  const tdBase = {
    padding: '10px 8px',
    font: '400 13px/20px Inter, system-ui, sans-serif',
    color: '#515151',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    minWidth: 0, display: 'flex', alignItems: 'center',
  };

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: template, background: bg, borderBottom: '1px solid #F1F1F1', position: 'relative', transition: 'background 100ms' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
    >
      {columns.map((col) => {

        if (col.key === '__select') return (
          <div key="__select" style={tdBase}>
            <Checkbox checked={selected} onChange={() => onToggleRow && onToggleRow(row.id)} />
          </div>
        );

        if (col.key === '__actions') return (
          <div key="__actions" style={{ ...tdBase, justifyContent: 'center', position: 'relative' }}>
            <span
              onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
              style={{ color: '#A8A8A8', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px', transition: 'color 100ms' }}
              onMouseEnter={e => e.currentTarget.style.color = '#252525'}
              onMouseLeave={e => e.currentTarget.style.color = menuOpen ? '#252525' : '#A8A8A8'}
            >⋮</span>
            {menuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', width: 140, zIndex: 50,
                background: '#fff', borderRadius: 10, border: '1px solid #E9E9E9',
                boxShadow: '0 2px 2px -1px rgba(10,13,18,.04), 0 4px 6px -2px rgba(10,13,18,.03), 0 12px 16px -4px rgba(10,13,18,.08)',
                padding: 4,
              }}>
                {(row.__actions || []).map((action, ai) => (
                  <div key={ai}
                    onClick={() => { action.onClick && action.onClick(row); setMenuOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, font: '400 13px/20px Inter', color: action.danger ? '#E53535' : '#252525', cursor: 'pointer', transition: 'background 100ms' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F4F4F4'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    {action.icon && <Icon name={action.icon} size={14} />}
                    {action.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

        return (
          <div key={col.key} style={{ ...tdBase, color: col.primary ? '#252525' : '#515151' }}>
            {col.render ? col.render(row[col.key], row) : row[col.key]}
          </div>
        );
      })}
    </div>
  );
};

const Table = ({ columns, rows = [], selectedIds = [], onToggleRow, onToggleAll }) => {
  const template = columns.map(c => c.width || '1fr').join(' ');
  const allSelected = rows.length > 0 && rows.every(r => selectedIds.includes(r.id));
  const someSelected = !allSelected && rows.some(r => selectedIds.includes(r.id));

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E9E9E9', overflow: 'hidden', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: template, background: '#FCFCFC', borderBottom: '1px solid #E9E9E9' }}>
        {columns.map(col => (
          <div key={col.key} style={{ padding: '10px 8px', font: '500 12px/20px Inter, system-ui, sans-serif', color: '#7C7C7C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, display: 'flex', alignItems: 'center' }}>
            {col.key === '__select' && onToggleAll
              ? <Checkbox checked={allSelected} indeterminate={someSelected} onChange={onToggleAll} />
              : col.key === '__actions' ? null : col.label}
          </div>
        ))}
      </div>
      {/* Rows */}
      {rows.map(row => (
        <TableRow key={row.id} row={row} columns={columns} template={template}
          selected={selectedIds.includes(row.id)} onToggleRow={onToggleRow} />
      ))}
    </div>
  );
};

const ActionMenuItem = ({ icon, label, onClick, danger }) => {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: 8, borderRadius: 8,
        background: hover ? '#F4F4F4' : '#FFF',
        cursor: 'pointer',
        transition: 'background 100ms',
        color: danger ? '#EF4444' : '#1F2937',
        font: '400 14px/20px Inter, system-ui, sans-serif',
        userSelect: 'none',
      }}
    >
      {icon && <Icon name={icon} size={20} style={{ color: danger ? '#EF4444' : '#1F2937', flexShrink: 0 }} />}
      {label}
    </div>
  );
};

// ActionMenu
// items: [{ icon?, label, onClick, danger?, divider? }]
//   Pass { divider: true } as an item to render a separator line.
//
// Example:
//   <ActionMenu items={[
//     { icon: 'eye',           label: 'Preview',   onClick: () => {} },
//     { icon: 'pencil-simple', label: 'Edit',      onClick: () => {} },
//     { divider: true },
//     { icon: 'trash',         label: 'Delete',    onClick: () => {}, danger: true },
//   ]} />

const ActionMenu = ({ items = [], style }) => (
  <div style={{
    borderRadius: 12,
    border: '1px solid #E9E9E9',
    background: '#FFF',
    boxShadow: '0 2px 9px 0 rgba(0,0,0,0.10)',
    padding: 4,
    minWidth: 160,
    ...style,
  }}>
    {items.map((item, i) =>
      item.divider
        ? <div key={i} style={{ height: 1, background: '#E9E9E9', margin: '4px 0' }} />
        : <ActionMenuItem key={i} {...item} />
    )}
  </div>
);

// TextArea — description field with character counter + resizable handle
// Props:
//   value, onChange, placeholder, maxLength (default 200)
//   label, hint, error, disabled, style
//
// Example:
//   <TextArea label="Description" placeholder="Add a description…" maxLength={200}
//     value={val} onChange={e => setVal(e.target.value)} />

const TextArea = ({ label, value = '', onChange, placeholder, hint, error, disabled, maxLength = 200, style }) => {
  const [focused, setFocused] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [height, setHeight] = React.useState(140);
  const wrapRef = React.useRef(null);

  const borderColor = error ? '#B21313' : focused ? '#1C81EF' : hovered ? '#9CA3AF' : '#E9E9E9';
  const boxShadow   = error && focused ? '0 0 0 3px #FEE2E2' : !error && focused ? '0 0 0 3px #DBEAFE' : 'none';
  const over        = value.length >= maxLength;

  function startResize(e) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    function onMove(ev) { setHeight(Math.max(80, startH + ev.clientY - startY)); }
    function onUp()     { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {label && <span style={{ font: '500 12px/18px Inter', color: '#515151' }}>{label}</span>}
      <div
        ref={wrapRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', flexDirection: 'column',
          height, borderRadius: 8,
          border: `1px solid ${disabled ? '#E9E9E9' : borderColor}`,
          background: disabled ? '#F9FAFB' : '#fff',
          boxShadow: disabled ? 'none' : boxShadow,
          transition: 'border-color 150ms, box-shadow 150ms',
        }}
      >
        <textarea
          value={value} onChange={onChange} placeholder={placeholder}
          disabled={disabled} maxLength={maxLength}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            flex: 1, border: 'none', outline: 'none', resize: 'none',
            padding: '8px 8px 0', background: 'transparent',
            font: '400 14px/20px Inter, system-ui, sans-serif',
            color: disabled ? '#D1D5DB' : '#111827',
            minHeight: 0, overflow: 'auto',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '4px 8px 6px', flexShrink: 0 }}>
          <span style={{ font: '400 12px/18px Inter', color: over ? '#EF4444' : '#9CA3AF', fontWeight: over ? 500 : 400 }}>
            {value.length}/{maxLength}
          </span>
          {!disabled && (
            <span
              onMouseDown={startResize}
              style={{ cursor: 'se-resize', color: '#D1D5DB', display: 'flex', alignItems: 'center', userSelect: 'none' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M5 13L13 5M9.5 13L13 9.5"/>
              </svg>
            </span>
          )}
        </div>
      </div>
      {(hint || error) && (
        <span style={{ font: '400 12px/18px Inter', color: error ? '#B91C1C' : '#9CA3AF' }}>{error || hint}</span>
      )}
    </div>
  );
};

// ─── Timeline ────────────────────────────────────────────────────────────────
// heading: string
// subtext: string (optional)
// items: Array<{ title: string | Array<{ text, bold? }>, subtext: string }>
//
// Example:
//   <Timeline
//     heading="Timeline"
//     subtext="Major updates and changes made to the site"
//     items={[
//       {
//         title: [
//           { text: 'Site status changed from ', bold: false },
//           { text: '\u201cSurvey completed\u201d',   bold: true  },
//           { text: ' to ',                           bold: false },
//           { text: '\u201cUnder construction\u201d', bold: true  },
//         ],
//         subtext: '2:00 PM, 08 Apr 25',
//       },
//     ]}
//   />

const TimelineItem = ({ title, subtext, isLast }) => {
  const renderTitle = (t) => {
    if (typeof t === 'string') return t;
    return t.map((seg, i) => (
      <span key={i} style={{ fontWeight: seg.bold ? 600 : 400 }}>{seg.text}</span>
    ));
  };
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%',
          background: '#1C81EF',
          border: '3px solid #EFF6FF',
          boxSizing: 'border-box',
          flexShrink: 0, marginTop: 1,
        }} />
        {!isLast && (
          <div style={{ width: 1.5, flex: 1, background: '#EFF6FF', minHeight: 16 }} />
        )}
      </div>
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 20 }}>
        <div style={{ font: '400 12px/18px Inter', color: '#111827' }}>{renderTitle(title)}</div>
        <div style={{ font: '400 12px/18px Inter', color: '#6B7280', marginTop: 2 }}>{subtext}</div>
      </div>
    </div>
  );
};

const Timeline = ({ heading, subtext, items = [] }) => (
  <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #E9E9E9', padding: 16 }}>
    <div style={{ marginBottom: 20 }}>
      <div style={{ font: '500 16px/24px Inter', color: '#111827' }}>{heading}</div>
      {subtext && <div style={{ font: '400 12px/18px Inter', color: '#6B7280', marginTop: 2 }}>{subtext}</div>}
    </div>
    <div>
      {items.map((item, i) => (
        <TimelineItem key={i} title={item.title} subtext={item.subtext} isLast={i === items.length - 1} />
      ))}
    </div>
  </div>
);

Object.assign(window, { Icon, Button, Field, Chip, Checkbox, Radio, Toggle, Tooltip, Tabs, Stepper, Card, Table, TableRow, ActionMenu, ActionMenuItem, TextArea, TimelineItem, Timeline });
