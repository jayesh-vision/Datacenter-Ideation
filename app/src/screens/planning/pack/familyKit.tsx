/* Drawing primitives for the family drawing sheets: IEC-style electrical and mechanical symbols (utility source, breaker,
   transformer, generator, UPS, chiller, air handler, CDU), a state tag (NEW, REMOVED, ISOLATED…) and the numbered notes block
   under a drawing. Everything is plain SVG on the planner chart tokens; hover tips go through the shared floating ChartTip. */
import type { ReactNode } from 'react';
import { C } from '../charts/chartKit';
import { EQ_STYLE, type EqState } from './familyDrawKit';

type P = { x: number; y: number; state?: EqState };
const stroke = (s: EqState = 'existing') => EQ_STYLE[s];

/** Utility source: circle with a sine wave. (x, y) = centre. */
export function SrcSym({ x, y, state }: P) {
  const st = stroke(state); const r = 13;
  return <g><circle cx={x} cy={y} r={r} fill={st.fill} stroke={st.stroke} strokeWidth={1.4} strokeDasharray={st.dash} /><path d={`M${x - 7},${y} q3.5,-7 7,0 t7,0`} fill="none" stroke={st.stroke} strokeWidth={1.3} /></g>;
}
/** Circuit breaker: small square on the line. */
export const Breaker = ({ x, y, color = C.slateDark }: { x: number; y: number; color?: string }) => <rect x={x - 4} y={y - 4} width={8} height={8} fill={C.surface} stroke={color} strokeWidth={1.2} />;
/** Two-winding transformer: two overlapping circles, top one at y. */
export function TxSym({ x, y, state }: P) {
  const st = stroke(state);
  return <g fill="none" stroke={st.stroke} strokeWidth={1.4} strokeDasharray={st.dash}><circle cx={x} cy={y} r={10} fill={st.fill} /><circle cx={x} cy={y + 13} r={10} /></g>;
}
/** Generator: circle with G. */
export function GenSym({ x, y, state }: P) {
  const st = stroke(state);
  return <g><circle cx={x} cy={y} r={13} fill={st.fill} stroke={st.stroke} strokeWidth={1.4} strokeDasharray={st.dash} /><text x={x} y={y} dy="0.36em" textAnchor="middle" fontSize={12} fontWeight={600} fill={st.stroke}>G</text></g>;
}
/** UPS: box split by a diagonal, AC in, DC out. (x, y) = top centre. */
export function UpsSym({ x, y, state, w = 34, h = 26 }: P & { w?: number; h?: number }) {
  const st = stroke(state); const l = x - w / 2;
  return <g><rect x={l} y={y} width={w} height={h} fill={st.fill} stroke={st.stroke} strokeWidth={1.4} strokeDasharray={st.dash} /><line x1={l} y1={y + h} x2={l + w} y2={y} stroke={st.stroke} strokeWidth={1} />
    <path d={`M${l + 4},${y + 8} q2.5,-5 5,0 t5,0`} fill="none" stroke={st.stroke} strokeWidth={1.1} />
    <g stroke={st.stroke} strokeWidth={1.1}><line x1={l + w - 15} y1={y + h - 9} x2={l + w - 4} y2={y + h - 9} /><line x1={l + w - 15} y1={y + h - 5} x2={l + w - 4} y2={y + h - 5} strokeDasharray="2 1.5" /></g></g>;
}
/** Chiller / dry cooler: box with a fan circle on top. (x, y) = top centre. */
export function ChillerSym({ x, y, state }: P) {
  const st = stroke(state); const w = 36, h = 24, l = x - w / 2;
  return <g><rect x={l} y={y} width={w} height={h} rx={2} fill={st.fill} stroke={st.stroke} strokeWidth={1.4} strokeDasharray={st.dash} /><circle cx={x} cy={y + h / 2} r={7} fill="none" stroke={st.stroke} strokeWidth={1.1} /><path d={`M${x - 5},${y + h / 2 - 5} L${x + 5},${y + h / 2 + 5} M${x + 5},${y + h / 2 - 5} L${x - 5},${y + h / 2 + 5}`} stroke={st.stroke} strokeWidth={1} /></g>;
}
/** Air handler (CRAH / CRAC / in-row): box with a coil zig-zag and a fan. (x, y) = top centre. */
export function CrahSym({ x, y, state, liquid }: P & { liquid?: boolean }) {
  const st = stroke(state); const w = 36, h = 24, l = x - w / 2;
  return <g><rect x={l} y={y} width={w} height={h} rx={2} fill={st.fill} stroke={st.stroke} strokeWidth={1.4} strokeDasharray={st.dash} />
    {liquid
      ? <><path d={`M${l + 5},${y + 7} h${w - 10} M${l + 5},${y + h - 7} h${w - 10}`} stroke={st.stroke} strokeWidth={1.1} /><path d={`M${x - 4},${y + 7} l4,10 l4,-10`} fill="none" stroke={st.stroke} strokeWidth={1} /></>
      : <><path d={`M${l + 4},${y + h / 2} l3,-5 l3,10 l3,-10 l3,10 l3,-5`} fill="none" stroke={st.stroke} strokeWidth={1} /><circle cx={l + w - 10} cy={y + h / 2} r={5} fill="none" stroke={st.stroke} strokeWidth={1} /></>}
  </g>;
}
/** State tag above-right of a symbol (NEW, REMOVED…). (x, y) = left baseline. */
export function StateTag({ x, y, state, text }: { x: number; y: number; state: EqState; text?: string }) {
  const st = EQ_STYLE[state]; const t = text ?? st.tag; if (!t) return null;
  const w = t.length * 5.6 + 8;
  return <g><rect x={x} y={y - 9} width={w} height={12} rx={2} fill={st.stroke} /><text x={x + w / 2} y={y - 3} dy="0.35em" textAnchor="middle" fontSize={8} fontWeight={600} letterSpacing={0.4} fill={C.surface}>{t}</text></g>;
}
/** Cross through a removed unit. */
export const Struck = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => <g stroke={C.red} strokeWidth={1.5}><line x1={x} y1={y} x2={x + w} y2={y + h} /><line x1={x + w} y1={y} x2={x} y2={y + h} /></g>;
/** Hatch pattern definition (use fill={`url(#id)`}). */
export const Hatch = ({ id, color, gap = 5 }: { id: string; color: string; gap?: number }) => <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1={0} y1={0} x2={0} y2={gap} stroke={color} strokeWidth={1.2} /></pattern>;

/** Numbered drawing notes under a sheet. */
export function DrawNotes({ items }: { items: ReactNode[] }) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return <ol className="fd-notes">{list.map((t, i) => <li key={i}>{t}</li>)}</ol>;
}
