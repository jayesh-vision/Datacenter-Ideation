import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './shell/Layout';
import { CommandCenter } from './screens/CommandCenter';
import { Datacenters } from './screens/Datacenters';
import { Site } from './screens/site/Site';
import { NetworkElement } from './screens/ne/NetworkElement';
import { Alerts } from './screens/Alerts';
import { Incidents } from './screens/Incidents';
import { IncidentDetail } from './screens/IncidentDetail';
import { Changes } from './screens/changes/Changes';
import { ChangePage } from './screens/changes/ChangePage';
import { ServiceDetail } from './screens/ServiceDetail';
import { CustomerDetail } from './screens/CustomerDetail';
import { Facilities } from './screens/Facilities';
import { Revenue } from './screens/Revenue';
import { GpuPage } from './screens/Gpu';
import { NotFound } from './screens/NotFound';
import { DataModel } from './screens/DataModel';
import { Help } from './screens/Help';
import { Dcim } from './screens/dcim/Dcim';
import { RackPage } from './screens/dcim/RackPage';
import { TypePage } from './screens/dcim/TypePage';
import { Ipam } from './screens/ipam/Ipam';
import { Capacity } from './screens/Capacity';
import { lazy, Suspense, type ReactNode } from 'react';
import { Delivery } from './screens/delivery/Delivery';
import { ProjectPage } from './screens/delivery/ProjectPage';
import { ProgrammePage } from './screens/delivery/ProgrammePage';
import { WorkOrderPage } from './screens/delivery/WorkOrderPage';
import { WorkOrders } from './screens/workorders/WorkOrders';
import { InstancePage } from './screens/workorders/InstancePage';
import { Compliance } from './screens/admin/Compliance';
import { Customization } from './screens/admin/Customization';
import { SecOps } from './screens/secops/SecOps';

/* Estate → Datacenter → Infrastructure → Connectivity → Services → Customers
   → Events → Impact → Diagnosis → Recommended action */
/* /topology?dc=X → that datacenter's Topology tab; without a site, the Datacenters list */
function TopologyRedirect() { const dc = new URLSearchParams(useLocation().search).get('dc'); return <Navigate to={dc ? `/datacenters/${dc}?tab=topology` : '/datacenters'} replace />; }
/* Planner = the P2B planner, ported as is (13-Oct-2026, user: "rebuild the planner like P2B"); its pages load on demand */
const PlannerHub = lazy(() => import('./screens/planning/Planner').then(m => ({ default: m.Planner })));
const PlannerWizard = lazy(() => import('./screens/planning/PlanWizard').then(m => ({ default: m.PlanWizard })));
const PlannerPlan = lazy(() => import('./screens/planning/PlanPage').then(m => ({ default: m.PlanPage })));
const PlannerReview = lazy(() => import('./screens/planning/pack/review/ReviewPage').then(m => ({ default: m.ReviewPage })));
const lazyEl = (el: ReactNode) => <Suspense fallback={<div className="loading"><span className="spinner" />Loading…</div>}>{el}</Suspense>;
function OldPlan() { const id = useLocation().pathname.split('/')[2]; return <Navigate to={id && id !== 'new' ? `/planning/plans/${id}` : id === 'new' ? '/planning/new' : '/planning'} replace />; }
/* /planning/templates/:id deep link → the Templates tab with that template's drawer open */
function TemplateLink() { const id = useLocation().pathname.split('/')[3]; return <Navigate to={`/planning?tab=templates&template=${encodeURIComponent(id ?? '')}`} replace />; }
function Keep({ to }: { to: string }) { const l = useLocation(); return <Navigate to={`${to}${l.search}`} replace />; }

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CommandCenter />} />
          <Route path="datacenters" element={<Datacenters />} />
          {/* Estate, Locations and Reconciliation are inventory / build concerns,
              parked outside this operations module; old links land on Datacenters. */}
          <Route path="inventory/datacenters" element={<Keep to="/datacenters" />} />
          <Route path="inventory/*" element={<Navigate to="/datacenters" replace />} />
          <Route path="inventory" element={<Navigate to="/datacenters" replace />} />
          <Route path="reconciliation" element={<Navigate to="/datacenters" replace />} />
          <Route path="datacenters/:id" element={<Site />} />
          <Route path="ne/:id" element={<NetworkElement />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="incidents/:id" element={<IncidentDetail />} />
          <Route path="changes" element={<Changes />} />
          <Route path="changes/:id" element={<ChangePage />} />
          {/* Topology lives only as a tab on the datacenter page (user, 05-Oct-2026); old links land on that tab */}
          <Route path="topology" element={<TopologyRedirect />} />
          {/* Service and customer catalogues are service operations; only impact drill-downs remain */}
          <Route path="services" element={<Navigate to="/incidents" replace />} />
          <Route path="services/:id" element={<ServiceDetail />} />
          <Route path="customers" element={<Navigate to="/incidents" replace />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          {/* Capacity planning is back under Plan & Build (P2B merge, 13-Oct-2026); current pressure stays in Facilities */}
          <Route path="capacity" element={<Capacity />} />
          <Route path="facilities" element={<Facilities />} />
          {/* AI & GPU operations (user, 05-Oct-2026) */}
          <Route path="gpu" element={<GpuPage />} />
          {/* Money view of operations: what each open issue costs (user, 05-Oct-2026) */}
          <Route path="revenue" element={<Revenue />} />
          {/* Data model explorer: entities and relationships (user, 12-Oct-2026) */}
          <Route path="delivery" element={<Delivery />} />
          <Route path="delivery/projects/:id" element={<ProjectPage />} />
          <Route path="delivery/programmes/:id" element={<ProgrammePage />} />
          <Route path="delivery/work-orders/:id" element={<WorkOrderPage />} />
          <Route path="workorders" element={<WorkOrders />} />
          <Route path="workorders/instances/:id" element={<InstancePage />} />
          <Route path="planning" element={lazyEl(<PlannerHub />)} />
          <Route path="planning/new" element={lazyEl(<PlannerWizard />)} />
          <Route path="planning/plans/:planId/edit" element={lazyEl(<PlannerWizard />)} />
          <Route path="planning/plans/:planId" element={lazyEl(<PlannerPlan />)} />
          <Route path="planning/plans/:planId/review" element={lazyEl(<PlannerReview />)} />
          <Route path="planning/plans" element={<Navigate to="/planning?tab=plans" replace />} />
          <Route path="planning/templates" element={<Navigate to="/planning?tab=templates" replace />} />
          <Route path="planning/templates/:templateId" element={<TemplateLink />} />
          <Route path="planning/benchmarks" element={<Navigate to="/planning?tab=benchmarks" replace />} />
          <Route path="planner" element={<Navigate to="/planning" replace />} />
          <Route path="planner/*" element={<OldPlan />} />
          <Route path="ipam" element={<Ipam />} />
          <Route path="dcim" element={<Dcim />} />
          <Route path="dcim/racks/:id" element={<RackPage />} />
          <Route path="dcim/types/:id" element={<TypePage />} />
          <Route path="secops" element={<SecOps />} />
          <Route path="compliance" element={<Compliance />} />
          <Route path="customization" element={<Customization />} />
          <Route path="data-model" element={<DataModel />} />
          <Route path="help" element={<Help />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
