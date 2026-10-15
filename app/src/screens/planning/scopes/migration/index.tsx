/* UI for the migration family of plan types (see planner/lib/scopes/migration.ts): the inventory and mode on Requirements, result
   panels, plan pack sections and the "Waves and closure" tab. */
import * as I from 'lucide-react';
import { Panel } from '../../../../ui/kit';
import { registerScopeUi } from '../registry';
import { migrationOf } from '../../../../planner/lib/migrationCore';
import { MigrationInventory } from './Inventory';
import { MigrationDeliveryPanel, MigrationItPanel, MigrationNetworkPanel, MigrationSecurityPanel, MigrationSpacePanel, MigrationWavesPanel } from './Panels';
import { Compliance, ExitPlan, InventoryRegister, MigrationClosure, MigrationConsents, MigrationRunbook } from './PackSections';
import { WaveSchedule } from '../replace/PackSections';
import { WavesTab } from '../replace/WavesTab';

registerScopeUi('migration', {
  requirements: p => <MigrationInventory {...p} />,
  panels: { space: MigrationSpacePanel, network: MigrationNetworkPanel, it: MigrationItPanel, firesec: MigrationSecurityPanel, delivery: MigrationDeliveryPanel, migration: MigrationWavesPanel },
  packSections: [
    { key: 'inventory', label: 'Inventory', count: p => String(migrationOf(p.ev)?.rows.length ?? 0), render: p => <Panel icon={I.Boxes} title="Inventory" info="Everything recorded at the site being emptied (devices, racks, services, circuits, addresses, contracts, plant) and what happens to each."><InventoryRegister {...p} /></Panel> },
    { key: 'waves', label: 'Wave schedule', count: p => String((p.plan.waves ?? []).length), render: p => <Panel icon={I.CalendarRange} title="Wave schedule" info="The cut-over windows the move is split into, with the change request, maintenance window and acceptance test each one gets at execution."><WaveSchedule {...p} /></Panel> },
    { key: 'runbook', label: 'Cut-over runbook', render: p => <Panel icon={I.ListOrdered} title="Cut-over runbook" info="Step by step for each wave: consent and change before, how each service moves, acceptance, rollback and what follows."><MigrationRunbook {...p} /></Panel> },
    { key: 'consents', label: 'Consent register', count: p => String(migrationOf(p.ev)?.consents.length ?? 0), render: p => <Panel icon={I.Users} title="Consent register" info="Customers whose services move or end, their notice period, where their consent stands and whether the notice ends before their first wave."><MigrationConsents {...p} /></Panel> },
    { key: 'exit', label: 'Circuits, contracts, addresses', render: p => <Panel icon={I.LogOut} title="Circuits, contracts, addresses" info="The exit plan: circuits to cease or re-terminate (with early termination cost), site contracts and their notice, and the addresses released."><ExitPlan {...p} /></Panel> },
    { key: 'compliance', label: 'Compliance', count: p => String(migrationOf(p.ev)?.permits.length ?? 0), render: p => <Panel icon={I.ShieldCheck} title="Compliance" info="Regulatory and contractual steps a site exit needs, and whether each is on the plan's permits."><Compliance {...p} /></Panel> },
    { key: 'closure', label: 'Closure checklist', render: p => <Panel icon={I.ListChecks} title="Closure checklist" sub="Read live from the platform" info="What must be true before the plan can be completed and the site retired; each check reads the platform records."><MigrationClosure {...p} /></Panel> },
  ],
  detailTabs: [{ key: 'waves', label: 'Waves and closure', badge: p => (p.plan.waves ?? []).filter(w => w.status !== 'Closed' && w.status !== 'Cancelled').length || undefined, render: p => <WavesTab {...p} family="migration" /> }],
});
