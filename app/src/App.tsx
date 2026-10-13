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
import { Dcim } from './screens/dcim/Dcim';
import { RackPage } from './screens/dcim/RackPage';
import { TypePage } from './screens/dcim/TypePage';
import { Ipam } from './screens/ipam/Ipam';
import { Capacity } from './screens/Capacity';
import { Planner } from './screens/planner/Planner';
import { PlanPage } from './screens/planner/PlanPage';
import { PlanWizard } from './screens/planner/PlanWizard';
import { Delivery } from './screens/delivery/Delivery';
import { ProjectPage } from './screens/delivery/ProjectPage';
import { Compliance } from './screens/admin/Compliance';
import { Customization } from './screens/admin/Customization';

/* Estate → Datacenter → Infrastructure → Connectivity → Services → Customers
   → Events → Impact → Diagnosis → Recommended action */
/* /topology?dc=X → that datacenter's Topology tab; without a site, the Datacenters list */
function TopologyRedirect() { const dc = new URLSearchParams(useLocation().search).get('dc'); return <Navigate to={dc ? `/datacenters/${dc}?tab=topology` : '/datacenters'} replace />; }
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
          <Route path="planner" element={<Planner />} />
          <Route path="planner/new" element={<PlanWizard />} />
          <Route path="planner/:id" element={<PlanPage />} />
          <Route path="ipam" element={<Ipam />} />
          <Route path="dcim" element={<Dcim />} />
          <Route path="dcim/racks/:id" element={<RackPage />} />
          <Route path="dcim/types/:id" element={<TypePage />} />
          <Route path="compliance" element={<Compliance />} />
          <Route path="customization" element={<Customization />} />
          <Route path="data-model" element={<DataModel />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
