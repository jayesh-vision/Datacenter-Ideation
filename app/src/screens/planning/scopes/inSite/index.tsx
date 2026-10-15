/* UI of the in-site family of plan types: rack, pod, hall, retrofit (engine: planner/lib/scopes/inSite.ts, inSiteAnalysis.ts).
   Registers the wizard panels and site picker, the plan pack sections and the plan page's "Site fit" tab. */
import { registerScopeUi } from '../registry';
import { InSiteCooling, InSiteDelivery, InSiteFireSec, InSiteIt, InSiteMigration, InSiteNetwork, InSitePower, InSiteSpace } from './Panels';
import { InSiteSitePicker } from './InSiteSitePicker';
import { PlacementSection, SchedulesSection, SiteFitTab, WavesSection } from './PackSections';
import { analysisOf } from './helpers';

registerScopeUi('in-site', {
  panels: { space: InSiteSpace, power: InSitePower, cooling: InSiteCooling, network: InSiteNetwork, it: InSiteIt, delivery: InSiteDelivery, migration: InSiteMigration, firesec: InSiteFireSec },
  sitePicker: InSiteSitePicker,
  packSections: [
    { key: 'insite-placement', label: 'Placement', count: p => { const a = analysisOf(p.ev); return String(a?.rack?.accepted.length ?? a?.pod?.chosen?.positions.length ?? a?.hall?.positions.length ?? a?.retrofit?.rows.length ?? 0); }, render: p => <PlacementSection {...p} /> },
    { key: 'insite-schedules', label: 'Schedules', render: p => <SchedulesSection {...p} /> },
    { key: 'insite-waves', label: 'Waves', count: p => String(analysisOf(p.ev)?.retrofit?.waves.length ?? 0), render: p => <WavesSection {...p} /> },
  ],
  detailTabs: [
    { key: 'site-fit', label: 'Site fit', badge: p => { const a = analysisOf(p.ev); const n = a ? Object.values(a.checks).filter(c => c.status === 'fail').length : 0; return n || undefined; }, render: p => <SiteFitTab {...p} /> },
  ],
});
