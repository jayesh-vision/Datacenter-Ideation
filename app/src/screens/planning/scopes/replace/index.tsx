/* UI for the replace family of plan types (server refresh, network device refresh, rack replacement; see planner/lib/scopes/
   replace.ts): result panels that replace the plant, fabric and IT panels, plan pack sections and the "Waves and closure" tab. */
import * as I from 'lucide-react';
import { Panel } from '../../../../ui/kit';
import { registerScopeUi } from '../registry';
import { replaceOf } from '../../../../planner/lib/replaceAnalysis';
import { ReplaceDeliveryPanel, ReplaceItPanel, ReplaceNetworkPanel, ReplacePowerPanel, ReplaceSpacePanel, ReplaceWavesPanel } from './Panels';
import { ClosureChecklist, OldToNew, PeopleSection, PortsAndPatching, Runbook, WaveSchedule } from './PackSections';
import { WavesTab } from './WavesTab';

registerScopeUi('replace', {
  panels: { space: ReplaceSpacePanel, power: ReplacePowerPanel, network: ReplaceNetworkPanel, it: ReplaceItPanel, delivery: ReplaceDeliveryPanel, migration: ReplaceWavesPanel },
  packSections: [
    { key: 'oldnew', label: 'Old to new', count: p => String(p.plan.scope === 'rack-replace' ? replaceOf(p.ev)?.rackIds.length ?? 0 : replaceOf(p.ev)?.old.length ?? 0), render: p => <Panel icon={I.ArrowRightLeft} title="Old to new" info="Each old device (or rack) and what replaces it: the new unit, where it goes, the addresses it keeps, what happens to the old one and its wave."><OldToNew {...p} /></Panel> },
    { key: 'waves', label: 'Wave schedule', count: p => String((p.plan.waves ?? []).length), render: p => <Panel icon={I.CalendarRange} title="Wave schedule" info="The change windows the work is split into, with the change request, maintenance window and acceptance test each one gets at execution."><WaveSchedule {...p} /></Panel> },
    { key: 'runbook', label: 'Cut-over runbook', render: p => <Panel icon={I.ListOrdered} title="Cut-over runbook" info="Step by step for each wave, generated from the wave itself: preparation, the work, the half-time decision, acceptance, rollback and what follows."><Runbook {...p} /></Panel> },
    { key: 'ports', label: 'Ports and patching', render: p => <Panel icon={I.Cable} title="Ports and patching" info="The patch list per wave: old port to new port, speed, far end and optic (switches), the addresses each new server keeps, or the cross-connects to re-patch (racks)."><PortsAndPatching {...p} /></Panel> },
    { key: 'people', label: 'Consent and notification', count: p => String(p.plan.scope === 'rack-replace' ? replaceOf(p.ev)?.rack?.consents.length ?? 0 : replaceOf(p.ev)?.impact.customers.length ?? 0), render: p => <Panel icon={I.Users} title="Consent and notification" info="Who must be told or must agree before each wave: tenants of the racks (with their notice period) or the customers whose services run on the equipment."><PeopleSection {...p} /></Panel> },
    { key: 'closure', label: 'Closure checklist', render: p => <Panel icon={I.ListChecks} title="Closure checklist" sub="Read live from the platform" info="What must be true before the plan can be completed; each check reads the platform records."><ClosureChecklist {...p} /></Panel> },
  ],
  detailTabs: [{ key: 'waves', label: 'Waves and closure', badge: p => (p.plan.waves ?? []).filter(w => w.status !== 'Closed' && w.status !== 'Cancelled').length || undefined, render: p => <WavesTab {...p} family="replace" /> }],
});
