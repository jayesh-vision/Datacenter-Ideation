/* Opstral brand mark — circuit globe (ring, traces, nodes). Colour comes from
   currentColor; node centres use --opstral-hole (background colour) so they read as "holes". */
export function OpstralMark({ size = 16 }: { size?: number }) {
  const node = (cx: number, cy: number, r = 1.7) => <circle cx={cx} cy={cy} r={r} fill="var(--opstral-hole, var(--surface))" stroke="currentColor" strokeWidth={1.3} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10.4" />
      <path d="M3.4 7.2h3.4l1.4-1.6h4.2l1 1.1h7.2" />
      <path d="M2.6 10.4h6.6M14.6 10.4h4.2" />
      <path d="M2 13.6h6.8l1.2 1.2h5.4" />
      <path d="M2.8 16.6h8.2M13.4 16.6h7.2" />
      <path d="M5.6 19.4h3.2l1.6-1.6h8.8" />
      {node(16.8, 4.2)}{node(3.4, 10.4)}{node(10.6, 10.4, 1.4)}{node(13.4, 13.6, 1.5)}{node(20.4, 13.6)}{node(2.2, 16.6)}{node(12.4, 16.6, 1.4)}{node(5.8, 19.4)}{node(19.6, 10.4, 1.3)}
    </svg>
  );
}

/* The one "Ask Opstral AI" button — Opstral charcoal + lime, NST button sizing. */
export function OpstralBtn({ onClick, title, children = 'Ask Opstral AI' }: { onClick: () => void; title?: string; children?: string }) {
  return <button type="button" className="nst-btn nst-btn--sm opstral-btn" title={title} onClick={onClick}><OpstralMark size={18} />{children}</button>;
}

/* Small in-page marker for AI-originated content (panel icon, worklog, recommendation). */
export function OpstralBadge({ size = 15 }: { size?: number }) {
  return <span className="opstral-badge" style={{ width: size + 5, height: size + 5 }}><OpstralMark size={size} /></span>;
}
