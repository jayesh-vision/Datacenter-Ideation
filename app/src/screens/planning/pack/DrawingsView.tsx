/* Drawings: one framed sheet per drawing with a title block (number, title, scale, revision, date), each built from the plan's sizing. */
import type { ReactNode } from 'react';
import * as I from 'lucide-react';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation } from '../../../planner/lib/engine';
import { printPlanArea, type DrawingSheet, type SheetKind } from '../../../planner/lib/packModel';
import { Btn, Empty, Panel } from '../../../ui/kit';
import { date } from '../common';
import { SheetContent } from './sheetContent';
import { FAMILY_KINDS } from './familyDrawKit';
import '../../../styles/planning-drawings.css';

function Sheet({ sheet, day, rev, wide, children }: { sheet: DrawingSheet; day: string; rev: string; wide?: boolean; children: ReactNode }) {
  const cells: [string, string][] = [['Drawing', sheet.number], ['Title', sheet.title], ['Scale', 'NTS'], ['Rev', rev], ['Date', day]];
  return (
    <figure className={`plan-print-sheet pk-sheet${wide ? ' is-wide' : ''}`}>
      <div className="pk-sheet-body">{children}</div>
      <figcaption className="pk-sheet-tb">{cells.map(([k, v], i) => <div key={k} className={i === 1 ? 'is-grow' : undefined}><span>{k}</span><b className={i === 0 ? 'mono' : undefined}>{v}</b></div>)}</figcaption>
    </figure>
  );
}

export function DrawingsView({ plan, ev, sheets }: { plan: T.PlannerPlan; ev: Evaluation; sheets: DrawingSheet[] }) {
  // Building and typical hall sit side by side when both are drawn; every other sheet (and either of those alone) is full width,
  // so no sheet leaves an empty slot beside it.
  const pair = sheets.some(x => x.kind === 'building') && sheets.some(x => x.kind === 'hall');
  const wide = (k: SheetKind) => !(pair && (k === 'building' || k === 'hall')) || FAMILY_KINDS.includes(k);
  if (!sheets.length) return <Panel><Empty icon={I.DraftingCompass} title="No drawings for this plan type">This plan has no building, hall, power, network or phasing content to draw.</Empty></Panel>;
  return (
    <Panel icon={I.DraftingCompass} title="Drawing set" count={sheets.length} sub="Schematic, not to scale; hover a shape for its figures" info="Numbered sheets by discipline (A architecture, E electrical, M mechanical, N network, G general), each drawn from the plan's sizing and its family's analysis of the site. A sheet with nothing to draw is left out."
      actions={<Btn size="sm" icon={I.Printer} onClick={printPlanArea}>Print drawings</Btn>}>
      <div className="plan-print-area plan-print-landscape">
        <div className="pk-sheets plan-print-grid">{sheets.map(sh => <Sheet key={sh.number} sheet={sh} day={date(plan.updatedAt)} rev={plan.revision ?? 'A'} wide={wide(sh.kind)}><SheetContent kind={sh.kind} plan={plan} ev={ev} /></Sheet>)}</div>
      </div>
    </Panel>
  );
}
