/* UI for the build family of plan types (new datacenter, site expansion, regional portfolio, edge rollout; see planner/lib/scopes/
   build.ts): the campus and region pickers, the Requirements blocks, the Power step panel and the plan pack sections. */
import { registerScopeUi } from '../registry';
import { analysisOf } from './model';
import { BuildPowerPanel, BuildRequirements, BuildSitePicker, CommissioningSection, SitePlanSection } from './BuildViews';

registerScopeUi('build', {
  sitePicker: BuildSitePicker,
  requirements: BuildRequirements,
  panels: { power: BuildPowerPanel },
  packSections: [
    {
      key: 'site-plan', label: 'Site plan', render: p => <SitePlanSection {...p} />,
      count: ({ plan, ev }) => { const a = analysisOf(ev); return plan.scope === 'edge' ? `${a?.edge?.sites.length ?? 0}` : plan.scope === 'portfolio' ? `${a?.portfolio?.rows.length ?? 0}` : plan.scope === 'new-dc' ? `${plan.candidates?.length ?? 0}` : `${a?.campus?.rows.length ?? 0}`; },
    },
    { key: 'commissioning', label: 'Acceptance and handover', render: p => <CommissioningSection {...p} /> },
  ],
});
