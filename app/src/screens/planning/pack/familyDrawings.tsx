/* The family drawing sheets of the plan pack (plant, network, in-site, replace, migration): picks the drawing for a sheet kind and
   feeds it from the family's analysis on the evaluation. packModel.drawingSheets() decides which sheets exist; this file draws them. */
import type * as T from '../../../planner/p2b/types';
import type { Evaluation } from '../../../planner/lib/engine';
import type { SheetKind } from '../../../planner/lib/packModel';
import type { PlantAnalysis } from '../../../planner/lib/plantModel';
import type { NetworkAnalysis } from '../../../planner/lib/networkModel';
import type { InSiteAnalysis } from '../../../planner/lib/inSiteAnalysis';
import { CutInSequence, PlantSingleLine } from '../scopes/plant/drawings';
import { DciCutover, DciPaths } from '../scopes/network/drawings';
import { HallGridSheet, HallMep, LiquidLoops, RackElevationSheet } from '../scopes/inSite/drawings';
import { WaveTimeline } from '../scopes/replace/drawings';

export function FamilySheet({ kind, plan, ev }: { kind: SheetKind; plan: T.PlannerPlan; ev: Evaluation }) {
  const plant = ev.scope?.plant as PlantAnalysis | undefined;
  const net = ev.scope?.network as NetworkAnalysis | undefined;
  const ins = ev.scope?.inSite as InSiteAnalysis | undefined;
  switch (kind) {
    case 'plant-as-is': return plant ? <PlantSingleLine an={plant} mode="as-is" /> : null;
    case 'plant-to-be': return plant ? <PlantSingleLine an={plant} mode="to-be" /> : null;
    case 'cut-ins': return plant ? <CutInSequence an={plant} /> : null;
    case 'dci-paths': return net ? <DciPaths an={net} /> : null;
    case 'dci-cutover': return net ? <DciCutover an={net} plan={plan} schedule={ev.schedule} /> : null;
    case 'rack-elevation': return <RackElevationSheet plan={plan} ev={ev} />;
    case 'hall-grid': return <HallGridSheet plan={plan} ev={ev} />;
    case 'hall-mep': return <HallMep ev={ev} />;
    case 'liquid': return ins?.retrofit ? <LiquidLoops r={ins.retrofit} /> : null;
    case 'waves': return <WaveTimeline plan={plan} ev={ev} />;
    default: return null;
  }
}
