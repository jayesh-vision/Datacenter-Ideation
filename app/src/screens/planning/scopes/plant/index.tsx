/* UI of the plant family of plan types (engine: planner/lib/scopes/plant.ts, plantModel.ts). Registers the wizard's site picker and
   power / cooling / delivery panels, the plan pack sections and the plan page's "Plant and cut-ins" tab. */
import { plantOf } from '../../../../planner/lib/scopes/plant';
import { registerScopeUi } from '../registry';
import { CutInTable, PlantCoolingPanel, PlantDeliveryPanel, PlantPowerPanel, PlantSitePicker, PlantView } from './PlantPanels';

registerScopeUi('plant', {
  sitePicker: PlantSitePicker,
  panels: { power: PlantPowerPanel, cooling: PlantCoolingPanel, delivery: PlantDeliveryPanel },
  packSections: [
    { key: 'plant-asis', label: 'As-is and to-be', count: p => `${p.plan.plantLines?.length ?? 0} lines`, render: p => <PlantView {...p} /> },
    { key: 'plant-cutins', label: 'Cut-in sequence', count: p => `${p.plan.cutIns?.length ?? 0} steps`, render: p => { const an = plantOf(p.ev); return an ? <CutInTable an={an} /> : null; } },
  ],
  detailTabs: [{ key: 'plant', label: 'Plant and cut-ins', badge: p => plantOf(p.ev)?.cutIns.filter(c => !c.ok).length || undefined, render: p => <PlantView {...p} /> }],
});
