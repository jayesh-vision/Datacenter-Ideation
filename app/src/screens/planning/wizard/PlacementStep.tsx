/* Rack and pod plan types: the placement panel on the Space step. Racks are checked on their U map, feeds, PDUs, weight and cooling
   zone; pods on contiguous free grid positions. The panels live with the in-site family (scopes/inSite); this entry point keeps the
   generic Space panel working for them. */
import type { StepProps } from '../../../planner/lib/wizardModel';
import { RackSpacePanel } from '../scopes/inSite/RackPanels';
import { PodSpacePanel } from '../scopes/inSite/PodPanels';

export function PlacementPanel(props: StepProps) {
  return props.draft.scope === 'pod' ? <PodSpacePanel {...props} /> : <RackSpacePanel {...props} />;
}
