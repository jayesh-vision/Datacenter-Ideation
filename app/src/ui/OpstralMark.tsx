/* Opstral brand mark — circuit globe (ring, traces, nodes). Colour comes from
   currentColor; node centres use --opstral-ink so they read as "holes". */
export function OpstralMark({ size = 16 }: { size?: number }) {
  const node = (cx: number, cy: number, r = 1.7) => <circle cx={cx} cy={cy} r={r} fill="var(--opstral-ink)" stroke="currentColor" strokeWidth={1.3} />;
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
