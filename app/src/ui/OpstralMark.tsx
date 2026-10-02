/* Opstral brand mark — the official logo SVG (user-supplied, 867×818). Strokes use
   currentColor (brand lime via --opstral-lime); node centres use --opstral-hole so they
   match the surface behind them, like the black centres in the original. */
const TRACES = [
  ['M267 704H479.678C485.05 704 490.196 701.839 493.958 698.003L568.494 621.997C572.255 618.161 577.401 616 582.773 616H746', 25],
  ['M57 440H276.158L321.399 508H404', 25], ['M57 348L471 348', 25], ['M100 539H179', 20], ['M103 622H335', 25],
  ['M501 539H754', 25], ['M678 281L754 281', 20], ['M428 428H773', 25], ['M115 271H313', 20],
  ['M103 197H205.52C210.94 197 216.128 194.8 219.896 190.905L267.104 142.096C270.872 138.2 276.06 136 281.48 136H424.211C430.101 136 435.692 138.597 439.493 143.098L479.007 189.902C482.808 194.403 488.399 197 494.289 197H746', 25]
] as const;
const NODES = [
  [225.5, 702.5, 46.5, 20], [373.5, 620.5, 36.5, 20], [467.5, 537.5, 46.5, 20], [792.5, 537.5, 36.5, 20], [810.5, 426.5, 46.5, 20],
  [388.5, 426.5, 36.5, 20], [348.5, 270.5, 39, 15], [500.5, 346.5, 46.5, 20], [647.5, 279.5, 36.5, 20], [774.5, 279.5, 46.5, 20],
  [631.5, 102.5, 46.5, 20], [75.5, 269.5, 46.5, 20], [223.5, 537.5, 36.5, 20], [56.5, 543.5, 46.5, 20]
] as const;

export function OpstralMark({ size = 16 }: { size?: number }) {
  // Same geometry at every size; at icon sizes the strokes are thickened so the mark
  // keeps the logo's visual weight instead of rendering as hairlines.
  const k = size <= 24 ? 1.7 : size <= 48 ? 1.3 : 1;
  return (
    <svg width={size} height={size} viewBox="-20 -20 907 858" fill="none" stroke="currentColor" aria-hidden="true">
      {TRACES.map(([d, w], i) => <path key={i} d={d} strokeWidth={w * k} strokeLinecap={w === 25 ? 'round' : undefined} />)}
      <path d="M428 12C637.974 12 809 189.287 809 409C809 628.713 637.974 806 428 806C218.026 806 47 628.713 47 409C47 189.287 218.026 12 428 12Z" strokeWidth={24 * k} />
      {NODES.map(([cx, cy, r, w], i) => <circle key={i} cx={cx} cy={cy} r={r} strokeWidth={w * k} fill="var(--opstral-hole, var(--surface))" />)}
    </svg>
  );
}

/* The one "Ask Opstral AI" button — Opstral charcoal + lime, NST button sizing. */
export function OpstralBtn({ onClick, title, children = 'Ask Opstral AI' }: { onClick: () => void; title?: string; children?: string }) {
  return <button type="button" className="nst-btn nst-btn--sm opstral-btn" title={title} onClick={onClick}><OpstralMark size={18} />{children}</button>;
}

/* Small in-page marker for AI-originated content (panel icon, worklog, recommendation). */
export function OpstralBadge({ size = 15 }: { size?: number; className?: string }) {
  return <span className="opstral-badge" style={{ width: size + 5, height: size + 5 }}><OpstralMark size={size} /></span>;
}
