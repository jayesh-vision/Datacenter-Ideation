import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './shell/Layout';
import { CommandCenter } from './screens/CommandCenter';
import { Datacenters } from './screens/Datacenters';
import { Site } from './screens/site/Site';
import { NetworkElement } from './screens/ne/NetworkElement';
import { Alerts } from './screens/Alerts';
import { Incidents } from './screens/Incidents';
import { IncidentDetail } from './screens/IncidentDetail';
import { Changes } from './screens/Changes';
import { ServiceDetail } from './screens/ServiceDetail';
import { CustomerDetail } from './screens/CustomerDetail';
import { Facilities } from './screens/Facilities';
import { Revenue } from './screens/Revenue';
import { GpuPage } from './screens/Gpu';
import { NotFound } from './screens/NotFound';

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
          {/* Topology lives only as a tab on the datacenter page (user, 05-Oct-2026); old links land on that tab */}
          <Route path="topology" element={<TopologyRedirect />} />
          {/* Service and customer catalogues are service operations; only impact drill-downs remain */}
          <Route path="services" element={<Navigate to="/incidents" replace />} />
          <Route path="services/:id" element={<ServiceDetail />} />
          <Route path="customers" element={<Navigate to="/incidents" replace />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          {/* Capacity planning is parked for Plan & Build; current pressure lives in Facilities */}
          <Route path="capacity" element={<Navigate to="/facilities" replace />} />
          <Route path="facilities" element={<Facilities />} />
          {/* AI & GPU operations (user, 05-Oct-2026) */}
          <Route path="gpu" element={<GpuPage />} />
          {/* Money view of operations: what each open issue costs (user, 05-Oct-2026) */}
          <Route path="revenue" element={<Revenue />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
