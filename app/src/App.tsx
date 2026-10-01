import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './shell/Layout';
import { CommandCenter } from './screens/CommandCenter';
import { Estate } from './screens/Estate';
import { Datacenters } from './screens/Datacenters';
import { Locations } from './screens/Locations';
import { Reconciliation } from './screens/Reconciliation';
import { Site } from './screens/site/Site';
import { NetworkElement } from './screens/ne/NetworkElement';
import { Alerts } from './screens/Alerts';
import { Incidents } from './screens/Incidents';
import { IncidentDetail } from './screens/IncidentDetail';
import { Changes } from './screens/Changes';
import { Topology } from './screens/Topology';
import { Services } from './screens/Services';
import { ServiceDetail } from './screens/ServiceDetail';
import { Customers } from './screens/Customers';
import { CustomerDetail } from './screens/CustomerDetail';
import { Capacity } from './screens/Capacity';
import { Facilities } from './screens/Facilities';
import { NotFound } from './screens/NotFound';

/* Estate → Datacenter → Infrastructure → Connectivity → Services → Customers
   → Events → Impact → Diagnosis → Recommended action */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CommandCenter />} />
          <Route path="inventory" element={<Estate />} />
          <Route path="inventory/datacenters" element={<Datacenters />} />
          <Route path="inventory/locations" element={<Locations />} />
          <Route path="reconciliation" element={<Reconciliation />} />
          <Route path="datacenters/:id" element={<Site />} />
          <Route path="ne/:id" element={<NetworkElement />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="incidents/:id" element={<IncidentDetail />} />
          <Route path="changes" element={<Changes />} />
          <Route path="topology" element={<Topology />} />
          <Route path="services" element={<Services />} />
          <Route path="services/:id" element={<ServiceDetail />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="capacity" element={<Capacity />} />
          <Route path="facilities" element={<Facilities />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
