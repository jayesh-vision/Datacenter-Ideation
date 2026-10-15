/* Dimension panels of the in-site plan types: each picks the panel for the plan's type (rack, pod, hall, retrofit), or the generic one. */
import type { ReactNode } from 'react';
import type { DimensionKey } from '../../../../planner/lib/dimensions';
import type { StepProps } from '../../../../planner/lib/wizardModel';
import { DIMENSION_PANEL } from '../../wizard/DimensionPanels';
import { RackCoolingPanel, RackDeliveryPanel, RackItPanel, RackNetworkPanel, RackPowerPanel, RackSpacePanel } from './RackPanels';
import { PodCoolingPanel, PodNetworkPanel, PodPowerPanel, PodSecurityPanel, PodSpacePanel } from './PodPanels';
import { HallCoolingPanel, HallItPanel, HallNetworkPanel, HallPowerPanel, HallSpacePanel } from './HallPanels';
import { RetrofitCoolingPanel, RetrofitFirePanel, RetrofitMigrationPanel, RetrofitNetworkPanel, RetrofitPowerPanel, RetrofitSpacePanel } from './RetrofitPanels';

type Panel = (p: StepProps) => ReactNode;
const BY_TYPE: Record<string, Partial<Record<DimensionKey, Panel>>> = {
  rack: { space: RackSpacePanel, power: RackPowerPanel, cooling: RackCoolingPanel, network: RackNetworkPanel, it: RackItPanel, delivery: RackDeliveryPanel },
  pod: { space: PodSpacePanel, power: PodPowerPanel, cooling: PodCoolingPanel, network: PodNetworkPanel, firesec: PodSecurityPanel },
  hall: { space: HallSpacePanel, power: HallPowerPanel, cooling: HallCoolingPanel, network: HallNetworkPanel, it: HallItPanel },
  retrofit: { space: RetrofitSpacePanel, power: RetrofitPowerPanel, cooling: RetrofitCoolingPanel, network: RetrofitNetworkPanel, migration: RetrofitMigrationPanel, firesec: RetrofitFirePanel },
};
function Pick({ dim, ...props }: StepProps & { dim: DimensionKey }) {
  const Own = BY_TYPE[props.draft.scope]?.[dim] ?? DIMENSION_PANEL[dim];
  return <Own {...props} />;
}
export function InSiteSpace(p: StepProps) { return <Pick {...p} dim="space" />; }
export function InSitePower(p: StepProps) { return <Pick {...p} dim="power" />; }
export function InSiteCooling(p: StepProps) { return <Pick {...p} dim="cooling" />; }
export function InSiteNetwork(p: StepProps) { return <Pick {...p} dim="network" />; }
export function InSiteIt(p: StepProps) { return <Pick {...p} dim="it" />; }
export function InSiteDelivery(p: StepProps) { return <Pick {...p} dim="delivery" />; }
export function InSiteMigration(p: StepProps) { return <Pick {...p} dim="migration" />; }
export function InSiteFireSec(p: StepProps) { return <Pick {...p} dim="firesec" />; }
