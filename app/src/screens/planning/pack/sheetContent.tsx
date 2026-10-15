/* The drawing on one sheet of the plan pack, by sheet kind: the generic drawings (building, hall, single-line, topology, phasing, lead
   times) from the sizing, the family sheets from the family's analysis. Shared by the Drawings section and the review pack's SVG export
   (`review/svg.ts`, which renders it off-screen at a fixed width), so the exported sheet is the portal sheet. */
import type * as T from '../../../planner/p2b/types';
import type { Evaluation } from '../../../planner/lib/engine';
import type { SheetKind } from '../../../planner/lib/packModel';
import { BuildingStack, HallLayout, LeadTimes, PhaseLadder, SingleLine, Topology } from './drawings';
import { FamilySheet } from './familyDrawings';
import { FAMILY_KINDS } from './familyDrawKit';

/** `full`: draw every row (no scrolling lead-time chart), for export. */
export function SheetContent({ kind, plan, ev, full }: { kind: SheetKind; plan: T.PlannerPlan; ev: Evaluation; full?: boolean }) {
  if (FAMILY_KINDS.includes(kind)) return <FamilySheet kind={kind} plan={plan} ev={ev} />;
  const s = ev.sizing;
  switch (kind) {
    case 'building': return <BuildingStack sizing={s} />;
    case 'hall': return <HallLayout sizing={s} densityKwPerRack={Number(ev.params['densityKwPerRack']?.value ?? 0)} liquid={s.cooling.liquidRequired || ['liquid-to-chip', 'immersion'].includes(s.cooling.type)} height={full ? 360 : undefined} />;
    case 'single-line': return <SingleLine sizing={s} redundancy={String(ev.params['redundancy']?.value ?? '2N')} height={full ? 320 : undefined} />;
    case 'topology': return <Topology network={s.network} racks={s.racks} height={full ? 300 : undefined} />;
    case 'phasing': return <PhaseLadder rows={ev.ladder} growthPctPerYear={plan.demand.growthPctPerYear} height={full ? 300 : undefined} />;
    case 'lead-times': return <LeadTimes items={ev.schedule} goLive={[...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive))[0]?.goLive ?? plan.targetGoLive} maxHeight={full ? 100000 : undefined} />;
    default: return null;
  }
}
