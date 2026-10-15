/* UI of the network family of plan types (engine: planner/lib/scopes/network.ts, networkModel.ts). Registers the wizard's site picker
   and network / delivery panels, the plan pack sections and the plan page's "Paths and circuits" tab. */
import { networkOf } from '../../../../planner/lib/scopes/network';
import { registerScopeUi } from '../registry';
import { NetworkDeliveryPanel, NetworkPanel, NetworkSitePicker, NetworkView, PathsTable } from './NetworkPanels';

registerScopeUi('network', {
  sitePicker: NetworkSitePicker,
  panels: { network: NetworkPanel, delivery: NetworkDeliveryPanel },
  packSections: [
    { key: 'net-paths', label: 'Paths and diversity', count: p => `${p.plan.paths?.length ?? 0} paths`, render: p => { const an = networkOf(p.ev); return an ? <PathsTable an={an} /> : null; } },
    { key: 'net-cutover', label: 'Interconnect plan', render: p => <NetworkView {...p} /> },
  ],
  detailTabs: [{ key: 'network', label: 'Paths', badge: p => networkOf(p.ev)?.paths.filter(x => x.problems.length).length || undefined, render: p => <NetworkView {...p} /> }],
});
