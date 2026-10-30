"""DCO inventory import template: one sheet per entity of the DCO data model (app/src/api/types.ts),
a field dictionary, lookups with dropdown validation, a reconciliation summary, and two example
RackBank datacenters (illustrative data). Usage: python build_template.py <out.xlsx>"""
import sys, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.comments import Comment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.utils import get_column_letter as col

OUT = sys.argv[1]
D = dt.date

# ---------------------------------------------------------------- lookups (allowed values = system enums)
LOOK = {
    'business_model': ['colocation', 'neocloud', 'cloud', 'enterprise', 'network'],
    'site_status': ['on-air', 'in-progress', 'planned', 'failed'],
    'tier': ['Tier II', 'Tier III', 'Tier IV'],
    'site_category': ['Central', 'Regional', 'Edge'],
    'redundancy': ['N', 'N+1', '2N'],
    'room_type': ['Data hall', 'AI hall', 'Meet-me room', 'Network room', 'Plant room', 'UPS room', 'Battery room', 'NOC'],
    'containment': ['Cold aisle', 'Hot aisle', 'None'],
    'cooling_method': ['Air', 'Liquid', 'Hybrid'],
    'rack_role': ['Core', 'Meet-me room', 'Network', 'Aggregation', 'Compute', 'Storage', 'GPU', 'Tenant', 'AI cage'],
    'owner': ['operator', 'tenant'],
    'density': ['standard', 'ai'],
    'yes_no': ['Y', 'N'],
    'feed_type': ['AC', 'DC'],
    'feed_role': ['Active', 'Standby'],
    'plant_kind': ['Rectifier', 'Battery bank'],
    'test_result': ['Pass', 'Fail'],
    'cooling_type': ['CRAH', 'CRAC', 'CDU'],
    'sensor_kind': ['Temperature + humidity', 'Leak', 'Smoke'],
    'device_role': ['Router', 'Switch', 'DWDM', 'Firewall', 'Access', 'Server', 'Storage', 'GPU', 'Tenant gear'],
    'layer': ['core', 'spine', 'leaf', 'access'],
    'lifecycle': ['Ready', 'Planned', 'Maintenance', 'Decommissioning'],
    'if_admin': ['up', 'admin-down', 'reserved'],
    'link_role': ['Fabric', 'Uplink', 'Backhaul', 'Peering', 'Access'],
    'protocol': ['LLDP', 'OSPF', 'BGP', 'ISIS', 'LSP'],
    'gpu_model': ['B200 SXM 192 GB', 'H200 SXM 141 GB', 'H100 SXM 80 GB', 'A100 SXM 80 GB', 'L40S PCIe 48 GB', 'T4 PCIe 16 GB', 'Gaudi 3 OAM 128 GB', 'Max 1550 OAM 128 GB'],
    'gpu_vendor': ['NVIDIA', 'Intel'],
    'scheduler': ['Kubernetes', 'Slurm'],
    'air_liquid': ['air', 'liquid'],
    'service_type': ['Cabinet lease', 'Power circuit', 'Cross-connect', 'Remote hands', 'Reserved cluster', 'On-demand GPUs', 'CPU instances',
                     'VM', 'Storage volume', 'Managed DB', 'GPU cluster', 'Kubernetes', 'IRV', 'Leased Line', 'L2VPN', 'L3VPN',
                     'Core application', 'Database', 'Collaboration', 'Analytics', 'Backup & DR', 'AI platform', 'Other'],
    'service_unit': ['cabinets', 'kW', 'Mbps', 'hours', 'GPU', 'vCPU', 'TB', 'users'],
    'collector_protocol': ['SNMP', 'gNMI', 'Redfish', 'DCGM exporter', 'Modbus TCP', 'BACnet', 'Syslog'],
    'collector_domain': ['Network', 'Facility', 'Compute', 'GPU'],
    'pdu_side': ['A', 'B'],
    'pdu_kind': ['AC', 'DC'],
    'panel_kind': ['LC duplex', 'MPO', 'RJ45'],
    'panel_role': ['rack', 'odf'],
    'link_end': ['A', 'Z'],
    'tray_route': ['Tray route 1', 'Tray route 2'],
    'detection': ['VESDA aspirating', 'Point smoke + heat'],
    'suppression': ['Novec 1230 gas', 'Inert gas (IG-541)', 'Pre-action sprinkler'],
    'release_mode': ['Armed (auto)', 'Manual only', 'Isolated'],
    'door_kind': ['Building entry', 'Data hall door', 'Cage door', 'Plant room door', 'Meet-me room door'],
    'reader': ['Card + biometric', 'Card + PIN', 'Card'],
    'support_level': ['24×7×4', 'NBD', '8×5 NBD', 'None'],
    'pm_kind': ['UPS', 'Battery', 'Generator', 'Cooling', 'CDU', 'Fire', 'Electrical'],
    'oncall_role': ['NOC shift lead', 'Network engineer', 'Facility engineer', 'Field technician', 'Duty manager', 'AI infrastructure engineer'],
}

# ---------------------------------------------------------------- sheet specs
# (key, required Y/N/C(onditional), type, lookup or allowed, maps to (types.ts), description); source: I = import, F = formula/derived
S = {}
S['Sites'] = ('Datacenter + Location', 'One row per datacenter.', [
    ('site_id', 'Y', 'text', '', 'Datacenter.id / Location.id', 'Unique site code, format XX-DC-NNN (XX = state code). Every other sheet points to it.'),
    ('site_name', 'Y', 'text', '', 'Datacenter.name', 'Display name.'),
    ('operator', 'N', 'text', '', '(reference only)', 'Owning company. Not shown in the tool today.'),
    ('business_model', 'Y', 'list', 'business_model', 'Persona', 'Sets vocabulary and rack contents: colocation, neocloud (GPU as a service), cloud, enterprise, network (telco).'),
    ('status', 'Y', 'list', 'site_status', 'Datacenter.status', 'on-air = live; in-progress = being built; planned; failed.'),
    ('tier', 'Y', 'list', 'tier', 'Datacenter.tier', 'Uptime tier.'),
    ('category', 'Y', 'list', 'site_category', 'Datacenter.category', 'Central / Regional / Edge.'),
    ('region', 'Y', 'text', '', 'Region.name / Datacenter.regionId', 'For example West, South, North, East, Central.'),
    ('state', 'Y', 'text', '', 'Datacenter.state', 'State or province.'),
    ('city', 'Y', 'text', '', 'Datacenter.city', 'City.'),
    ('address', 'Y', 'text', '', 'Datacenter.address', 'Postal address.'),
    ('latitude', 'Y', 'decimal', '', 'Datacenter.lat', 'Decimal degrees (WGS84). Places the pin on the estate map.'),
    ('longitude', 'Y', 'decimal', '', 'Datacenter.lng', 'Decimal degrees (WGS84).'),
    ('commissioned_on', 'N', 'date', '', 'Datacenter.commissionedOn', 'Date the site went live.'),
    ('it_capacity_kw', 'Y', 'decimal', '', 'Datacenter.power.capacityKw', 'Design IT load (kW) the site is built for.'),
    ('design_pue', 'N', 'decimal', '', 'Datacenter.power.pue', 'Design PUE. Live PUE comes from the BMS.'),
    ('cooling_capacity_kw', 'Y', 'decimal', '', 'Datacenter.cooling.capacityKw', 'Total installed cooling capacity (kW).'),
    ('cooling_redundancy', 'Y', 'list', 'redundancy', 'Datacenter.cooling.redundancy', 'N / N+1 / 2N.'),
    ('timezone', 'N', 'text', '', '(reference only)', 'IANA timezone, for example Asia/Kolkata.'),
])
S['Floors'] = ('Datacenter.floors[]', 'One row per floor.', [
    ('site_id', 'Y', 'ref', 'Sites', 'Datacenter.id', 'Must exist in Sites.'),
    ('floor_id', 'Y', 'text', '', '(key)', 'Unique within the workbook, for example MP-DC-001-F0.'),
    ('floor_name', 'Y', 'text', '', 'Datacenter.floors[].name', 'As staff call it: Ground, 1st floor…'),
    ('level', 'Y', 'integer', '', '(order in the 3D twin)', '0 = ground, 1 = first floor…, −1 = basement.'),
])
S['Rooms'] = ('Datacenter.floors[].rooms[]', 'One row per room / hall.', [
    ('site_id', 'Y', 'ref', 'Sites', 'Datacenter.id', ''),
    ('floor_id', 'Y', 'ref', 'Floors', '(key)', 'Must exist in Floors.'),
    ('room_id', 'Y', 'text', '', '(key)', 'Unique within the workbook.'),
    ('room_name', 'Y', 'text', '', 'Datacenter.floors[].rooms[] / Rack.room', 'Shown in the twin, the racks list and alarm locations.'),
    ('room_type', 'Y', 'list', 'room_type', '(twin layout)', 'Plant / UPS / battery rooms hold the power plant; halls hold racks.'),
    ('area_sqm', 'N', 'decimal', '', '(reference only)', 'Floor area.'),
    ('rack_rows', 'N', 'integer', '', '(twin layout)', 'Number of rack rows; racks face each other in pairs.'),
    ('containment', 'N', 'list', 'containment', '(twin layout)', 'Aisle containment.'),
    ('cooling_method', 'N', 'list', 'cooling_method', 'Rack.liquid', 'Air, Liquid or Hybrid.'),
])
S['Racks'] = ('Rack', 'One row per cabinet, including tenant cabinets and AI cages.', [
    ('rack_id', 'Y', 'text', '', 'Rack.id', 'Unique, for example MP-DC-001-A01.'),
    ('site_id', 'Y', 'ref', 'Sites', 'Rack.dcId', ''),
    ('room_id', 'Y', 'ref', 'Rooms', 'Rack.floor / Rack.room', 'Floor and room come from the Rooms row.'),
    ('rack_name', 'Y', 'text', '', 'Rack.name', 'Label on the cabinet (shown on the 3D twin).'),
    ('row', 'N', 'text', '', '(twin layout)', 'Row letter or number.'),
    ('position', 'N', 'integer', '', '(twin layout)', 'Position in the row, 1…n.'),
    ('role', 'Y', 'list', 'rack_role', 'Rack.role', 'What the cabinet is for.'),
    ('height_u', 'Y', 'integer', '', 'Rack.heightU', 'Usable rack units (42, 45, 48…).'),
    ('power_budget_kw', 'Y', 'decimal', '', 'Rack.budgetKw', 'Provisioned power (kW). Live draw comes from the PDUs.'),
    ('owner', 'Y', 'list', 'owner', 'Rack.owner', 'operator, or tenant (a leased cabinet: the operator sees power and environment only).'),
    ('tenant_customer_id', 'C', 'ref', 'Customers', 'Rack.tenantId', 'Required when owner = tenant.'),
    ('contracted_kw', 'C', 'decimal', '', 'Rack.contractedKw', 'Required when owner = tenant: the power the tenant has bought.'),
    ('density', 'N', 'list', 'density', 'Rack.density', 'ai = high-density GPU rack or AI cage.'),
    ('liquid_cooled', 'N', 'list', 'yes_no', 'Rack.liquid', 'Y = direct liquid cooling.'),
    ('cdu_id', 'C', 'ref', 'CDUs', 'AiCage.cduId / Cdu.racks', 'Required when liquid_cooled = Y.'),
    ('pdu_feed_a', 'N', 'ref', 'Power_Feeds', '(power path)', 'Feed powering the A-side PDU.'),
    ('pdu_feed_b', 'N', 'ref', 'Power_Feeds', '(power path)', 'Feed powering the B-side PDU.'),
    ('used_u (calc)', 'F', 'formula', '', 'Rack.usedU', 'Calculated: the sum of u_size of the devices in this rack. Don\'t type it.'),
])
S['Power_Feeds'] = ('Datacenter.power.feeds[] (PowerFeed)', 'Utility, DG and DC-plant feeds.', [
    ('feed_id', 'Y', 'text', '', 'PowerFeed.id', 'Unique, for example MP-DC-001-AC-1.'),
    ('site_id', 'Y', 'ref', 'Sites', 'Datacenter.id', ''),
    ('type', 'Y', 'list', 'feed_type', 'PowerFeed.type', 'AC or DC.'),
    ('source', 'Y', 'text', '', 'PowerFeed.source', 'For example "Utility feed A", "Rectifier RECT-01".'),
    ('rating', 'Y', 'text', '', 'PowerFeed.rating', 'For example "630 A · 415 V" or "48 V · 2400 A".'),
    ('capacity_kw', 'Y', 'decimal', '', 'PowerFeed.capacityKw', ''),
    ('normal_role', 'N', 'list', 'feed_role', '(ATS story)', 'Active, or Standby (picked up by the ATS).'),
    ('utility_account', 'N', 'text', '', '(reference only)', 'Utility connection / account number.'),
])
S['UPS'] = ('Datacenter.power.ups[] (UpsUnit)', 'One row per UPS module or system.', [
    ('ups_id', 'Y', 'text', '', 'UpsUnit.id', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'Datacenter.id', ''),
    ('room_id', 'N', 'ref', 'Rooms', '(twin placement)', 'Room the UPS stands in (shown and clickable in the realistic twin).'),
    ('name', 'Y', 'text', '', 'UpsUnit.name', 'For example UPS-1.'),
    ('vendor', 'N', 'text', '', '(reference only)', ''),
    ('model', 'N', 'text', '', '(reference only)', ''),
    ('serial', 'N', 'text', '', '(reference only)', ''),
    ('capacity_kw', 'Y', 'decimal', '', 'UpsUnit.capacityKw', ''),
    ('redundancy', 'Y', 'list', 'redundancy', 'UpsUnit.redundancy', ''),
    ('battery_autonomy_min', 'Y', 'integer', '', 'UpsUnit.batteryMin', 'Design autonomy at full load (minutes).'),
])
S['Generators'] = ('Datacenter.power.dg', 'Diesel generator sets.', [
    ('dg_id', 'Y', 'text', '', '(key)', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'Datacenter.id', ''),
    ('name', 'Y', 'text', '', '(label)', ''),
    ('kva', 'Y', 'decimal', '', 'power.dg.kva', 'Rating (kVA).'),
    ('fuel_tank_litres', 'N', 'decimal', '', '(fuel hours)', ''),
    ('runtime_h_full_load', 'Y', 'decimal', '', 'power.dg.runtimeH', 'Hours on a full tank at full load.'),
    ('last_test_date', 'N', 'date', '', 'power.dg.lastTest', ''),
    ('last_test_result', 'N', 'list', 'test_result', 'power.dg.result', ''),
])
S['DC_Plant'] = ('Datacenter.power.battery + rectifier', '48 V DC plant: rectifiers and battery banks.', [
    ('plant_id', 'Y', 'text', '', '(key)', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'Datacenter.id', ''),
    ('room_id', 'N', 'ref', 'Rooms', '(twin placement)', ''),
    ('kind', 'Y', 'list', 'plant_kind', '(rectifier / battery)', ''),
    ('name', 'Y', 'text', '', '(label)', 'For example RECT-01, BATT-01.'),
    ('volts', 'C', 'decimal', '', 'power.battery.volts', 'Battery banks: nominal voltage.'),
    ('ah', 'C', 'decimal', '', 'power.battery.ah', 'Battery banks: capacity (Ah).'),
    ('rated_output', 'C', 'text', '', 'PowerFeed.rating (DC)', 'Rectifiers: for example "48 V · 2400 A".'),
    ('capacity_kw', 'C', 'decimal', '', 'PowerFeed.capacityKw (DC)', 'Rectifiers: DC output (kW).'),
    ('autonomy_h', 'C', 'decimal', '', 'power.battery.runtimeH', 'Battery banks: design autonomy (hours).'),
    ('last_test_date', 'N', 'date', '', 'power.battery.lastTest', ''),
])
S['Cooling_Units'] = ('Datacenter.cooling.units[] (CoolingUnit)', 'CRAH, CRAC and CDU units.', [
    ('unit_id', 'Y', 'text', '', 'CoolingUnit.id', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'Datacenter.id', ''),
    ('room_id', 'Y', 'ref', 'Rooms', 'CoolingUnit.zone', 'The zone is "<floor> · <room>".'),
    ('name', 'Y', 'text', '', 'CoolingUnit.name', 'For example CRAH-11.'),
    ('type', 'Y', 'list', 'cooling_type', 'CoolingUnit.type', ''),
    ('vendor', 'N', 'text', '', '(reference only)', ''),
    ('model', 'N', 'text', '', '(reference only)', ''),
    ('capacity_kw', 'Y', 'decimal', '', 'CoolingUnit.capacityKw', 'Rated cooling capacity.'),
    ('design_supply_c', 'N', 'decimal', '', 'CoolingUnit.supplyC (setpoint)', 'Supply air / coolant setpoint.'),
])
S['CDUs'] = ('Cdu', 'Liquid-cooling loops (only for liquid-cooled racks).', [
    ('cdu_id', 'Y', 'text', '', 'Cdu.id', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'Cdu.dcId', ''),
    ('room_id', 'Y', 'ref', 'Rooms', 'Cdu.room', ''),
    ('name', 'Y', 'text', '', 'Cdu.name', ''),
    ('capacity_kw', 'Y', 'decimal', '', 'Cdu.capacityKw', ''),
    ('nominal_flow_lpm', 'Y', 'decimal', '', 'Cdu.flowNominal', 'Design coolant flow (litres per minute).'),
    ('design_supply_c', 'N', 'decimal', '', 'Cdu.supplyC (setpoint)', ''),
    ('racks_served (calc)', 'F', 'formula', '', 'Cdu.racks', 'Calculated from Racks.cdu_id.'),
])
S['Sensors'] = ('Datacenter.cooling.sensors[] (EnvSensor)', 'Environment sensors.', [
    ('sensor_id', 'Y', 'text', '', 'EnvSensor.id', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'Datacenter.id', ''),
    ('room_id', 'Y', 'ref', 'Rooms', 'EnvSensor.zone', ''),
    ('kind', 'Y', 'list', 'sensor_kind', 'EnvSensor (temp / humidity / smoke / leak)', ''),
    ('position', 'N', 'text', '', '(reference only)', 'For example "Cold aisle 1, rack A03".'),
    ('bms_point', 'N', 'text', '', '(collector mapping)', 'BMS / Modbus / BACnet point name, so live readings can be matched.'),
])
S['Devices'] = ('NetworkElement', 'Every racked device: network, servers, storage, GPU nodes, and opaque tenant gear blocks.', [
    ('device_id', 'Y', 'text', '', 'NetworkElement.id', 'Unique, for example MP-DC-001-BDR-01.'),
    ('site_id', 'Y', 'ref', 'Sites', 'NetworkElement.dcId', ''),
    ('hostname', 'Y', 'text', '', 'NetworkElement.name', 'As configured on the device (used to match SNMP / LLDP).'),
    ('role', 'Y', 'list', 'device_role', 'NetworkElement.role', 'Tenant gear = an opaque block of customer equipment (never polled).'),
    ('layer', 'Y', 'list', 'layer', 'NetworkElement.layer', 'core / spine / leaf / access. For hosts use access.'),
    ('vendor', 'Y', 'text', '', 'NetworkElement.vendor', 'Tenant gear: "Tenant".'),
    ('model', 'Y', 'text', '', 'NetworkElement.model', ''),
    ('os_version', 'N', 'text', '', 'NetworkElement.os', ''),
    ('serial', 'C', 'text', '', 'NetworkElement.serial', 'Required for operator devices; must be unique.'),
    ('mgmt_ip', 'C', 'ip', '', 'NetworkElement.ip', 'Required for monitored devices.'),
    ('mac', 'N', 'text', '', 'NetworkElement.mac', ''),
    ('rack_id', 'Y', 'ref', 'Racks', 'NetworkElement.rackId', ''),
    ('u_position', 'Y', 'integer', '', 'NetworkElement.u', 'Lowest U the device occupies (1 = bottom).'),
    ('u_size', 'Y', 'integer', '', 'NetworkElement.uSize', 'Height in U.'),
    ('lifecycle', 'Y', 'list', 'lifecycle', 'NetworkElement.lifecycle', 'Planned = reserved rack space, not installed.'),
    ('owner', 'Y', 'list', 'owner', 'OpsState tenant-owned', ''),
    ('tenant_customer_id', 'C', 'ref', 'Customers', 'NetworkElement.tenantId', 'Required when owner = tenant.'),
    ('monitored', 'Y', 'list', 'yes_no', 'OpsState in-service / unmonitored', 'N = in the rack but not polled.'),
    ('collector_id', 'C', 'ref', 'Collectors', 'NetworkElement.collector', 'Required when monitored = Y.'),
    ('wan_edge', 'N', 'list', 'yes_no', 'NetworkElement.isPe', 'Y = border / PE router carrying the site\'s backhaul.'),
])
S['Modules'] = ('NetworkElement.modules[]', 'Optional: line cards, PSUs, fans, supervisors.', [
    ('device_id', 'Y', 'ref', 'Devices', 'NetworkElement.id', ''),
    ('slot', 'Y', 'text', '', 'modules[].slot', 'For example "FPC 0", "PSU 1".'),
    ('name', 'Y', 'text', '', 'modules[].name', 'Part description.'),
    ('serial', 'N', 'text', '', 'modules[].serial', ''),
])
S['Interfaces'] = ('Interface', 'Physical ports in use or reserved (including host NICs). Spare ports can be left out.', [
    ('device_id', 'Y', 'ref', 'Devices', 'Interface.neId', ''),
    ('if_name', 'Y', 'text', '', 'Interface.name', 'As the device names it (et-0/0/1, Ethernet1/1, swp1, ib0…).'),
    ('type', 'Y', 'text', '', 'Interface.type', 'For example 100GE, 400G NDR, 1GE.'),
    ('speed_mbps', 'Y', 'integer', '', 'Interface.speedMbps', ''),
    ('admin_state', 'Y', 'list', 'if_admin', 'Interface.state', 'up, admin-down or reserved. Operational up / down comes live.'),
    ('description', 'N', 'text', '', 'Interface.description', ''),
    ('optic_model', 'N', 'text', '', 'Interface.optics.model', 'Transceiver part.'),
])
S['Links'] = ('Link', 'One row per cable or circuit between two interfaces.', [
    ('link_id', 'Y', 'text', '', 'Link.id', ''),
    ('a_device_id', 'Y', 'ref', 'Devices', 'Link.aNe', ''),
    ('a_if_name', 'Y', 'text', '', 'Link.aIf', 'Must exist in Interfaces for a_device_id.'),
    ('z_device_id', 'Y', 'ref', 'Devices', 'Link.zNe', 'May be at another site (backhaul).'),
    ('z_if_name', 'Y', 'text', '', 'Link.zIf', ''),
    ('role', 'Y', 'list', 'link_role', 'Link.role', 'Fabric (inside a fabric), Uplink, Backhaul (leaves the site), Peering, Access (to a host / customer).'),
    ('protocol', 'N', 'list', 'protocol', 'Link.protocol', 'Default LLDP (physical). Add BGP / OSPF rows for routing adjacencies if needed.'),
    ('capacity_mbps', 'Y', 'integer', '', 'Link.capacityMbps', ''),
    ('cable_id', 'N', 'text', '', 'Link.physical.cable', 'Cross-connect jumper or cable label. The full patching of each end goes in Cable_Paths.'),
    ('strand', 'N', 'text', '', 'Link.physical.strand', 'Fibre strand or pair.'),
    ('a_patch_port', 'N', 'text', '', 'Link.physical.aPort', 'Older exports only: superseded by Cable_Paths.'),
    ('z_patch_port', 'N', 'text', '', 'Link.physical.zPort', 'Older exports only: superseded by Cable_Paths.'),
    ('carrier_circuit_id', 'C', 'text', '', '(reference only)', 'Backhaul: the carrier\'s circuit ID.'),
])
S['Rack_PDUs'] = ('RackPdu', 'Two per cabinet, A side and B side. −48 V fuse panels (BDFB) for DC-powered gear count as DC PDUs.', [
    ('pdu_id', 'Y', 'text', '', 'RackPdu.id', 'Unique, for example MP-DC-001-A01-PDU-A.'),
    ('site_id', 'Y', 'ref', 'Sites', 'RackPdu.dcId', ''),
    ('rack_id', 'Y', 'ref', 'Racks', 'RackPdu.rackId', ''),
    ('side', 'Y', 'list', 'pdu_side', 'RackPdu.side', 'A or B. Each side should be rated for the whole cabinet, so the cabinet survives the loss of either side.'),
    ('kind', 'Y', 'list', 'pdu_kind', 'RackPdu.kind', 'AC rack PDU, or DC fuse panel fed from the rectifier plant.'),
    ('model', 'N', 'text', '', 'RackPdu.model', 'Vendor and model, for example "Raritan PX3-5902V".'),
    ('volts', 'Y', 'decimal', '', 'RackPdu.volts', '230, 400 (3-phase) or 48 (DC).'),
    ('phases', 'Y', 'integer', '', 'RackPdu.phases', '1 or 3.'),
    ('rating_a', 'Y', 'decimal', '', 'RackPdu.ratingA', 'Input breaker rating per phase (A).'),
    ('capacity_kw', 'Y', 'decimal', '', 'RackPdu.capacityKw', 'What one side can carry. The tool checks the cabinet\'s draw against it for failover.'),
    ('outlets', 'Y', 'integer', '', 'RackPdu.outlets', 'Number of outlets (C13 / C19).'),
    ('upstream_id', 'Y', 'ref', 'UPS / DC_Plant', 'RackPdu.upstreamId', 'The UPS module (AC) or rectifier (DC) feeding this PDU: this is how a UPS fault is traced to devices.'),
    ('feed_id', 'Y', 'ref', 'Power_Feeds', 'RackPdu.feedId', 'Utility feed behind that UPS.'),
])
S['Power_Connections'] = ('PowerCord', 'One row per power cord: which PDU outlet each device power supply plugs into.', [
    ('device_id', 'Y', 'ref', 'Devices', 'PowerCord.neId', ''),
    ('psu_slot', 'Y', 'text', '', 'PowerCord.psu', 'As the device names it (PSU1, PEM0). Tenant gear: Feed A / Feed B.'),
    ('pdu_id', 'Y', 'ref', 'Rack_PDUs', 'PowerCord.pduId', 'A PDU in the same rack as the device.'),
    ('outlet', 'Y', 'integer', '', 'PowerCord.outlet', 'Outlet number on that PDU.'),
    ('breaker_bank', 'N', 'text', '', 'PowerCord.bankId', 'Phase or bank (L1, L2, L3). Leave blank to derive it from the outlet.'),
    ('psu_rated_w', 'N', 'decimal', '', '(reference only)', 'Nameplate rating of the supply.'),
])
S['Patch_Panels'] = ('PatchPanel', 'Every patch panel and ODF panel.', [
    ('panel_id', 'Y', 'text', '', 'PatchPanel.id', 'Unique, for example MP-DC-001-A01-PP-F1.'),
    ('site_id', 'Y', 'ref', 'Sites', 'PatchPanel.dcId', ''),
    ('rack_id', 'Y', 'ref', 'Racks', 'PatchPanel.rackId', ''),
    ('name', 'Y', 'text', '', 'PatchPanel.name', 'Label on the panel.'),
    ('kind', 'Y', 'list', 'panel_kind', 'PatchPanel.kind', 'LC duplex (fibre), MPO (high-density fibre) or RJ45 (copper).'),
    ('role', 'Y', 'list', 'panel_role', 'PatchPanel.role', 'rack = top of a cabinet; odf = in the site\'s patching / main distribution rack.'),
    ('ports', 'Y', 'integer', '', 'PatchPanel.ports', ''),
])
S['Trunk_Cables'] = ('Trunk', 'Permanent cables between a cabinet patch panel and the ODF (or between two ODFs).', [
    ('trunk_id', 'Y', 'text', '', 'Trunk.id', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'Trunk.dcId', ''),
    ('a_panel_id', 'Y', 'ref', 'Patch_Panels', 'Trunk.aPanel', ''),
    ('z_panel_id', 'Y', 'ref', 'Patch_Panels', 'Trunk.zPanel', ''),
    ('kind', 'Y', 'text', '', 'Trunk.kind', 'For example "MPO-24 OM4 trunk" or "Cat6A 24-cable bundle".'),
    ('pairs', 'Y', 'integer', '', 'Trunk.pairs', 'Duplex pairs (fibre) or cables (copper).'),
    ('route', 'Y', 'list', 'tray_route', 'Trunk.route', 'Tray route. Two diverse routes let dual-homed devices survive one cut tray.'),
    ('length_m', 'N', 'decimal', '', 'Trunk.lengthM', ''),
])
S['Cable_Paths'] = ('CablePath (one row per link end)', 'How each end of a link is patched. An in-rack cable needs only the patch cord.', [
    ('link_id', 'Y', 'ref', 'Links', 'CablePath.linkId', ''),
    ('end', 'Y', 'list', 'link_end', '(A / Z end)', 'A = the a_device of the link, Z = the z_device.'),
    ('device_id', 'Y', 'ref', 'Devices', 'CableHop (port)', ''),
    ('patch_cord_id', 'N', 'text', '', 'CableHop (cord)', 'Label on the patch cord or DAC / AOC cable.'),
    ('panel_id', 'C', 'ref', 'Patch_Panels', 'CableHop (panel)', 'Required when the cable leaves the cabinet: the cabinet\'s patch panel.'),
    ('panel_port', 'C', 'integer', '', 'CableHop (panel)', ''),
    ('trunk_id', 'C', 'ref', 'Trunk_Cables', 'CableHop (trunk)', 'Trunk from that panel to the ODF.'),
    ('odf_panel_id', 'C', 'ref', 'Patch_Panels', 'CableHop (panel)', 'ODF panel where the trunk lands; the cross-connect jumper is patched here.'),
    ('odf_port', 'C', 'integer', '', 'CableHop (panel)', ''),
    ('osp_core', 'C', 'integer', '', 'CableHop (osp)', 'Backhaul only: core of the outside-plant cable on the ODF.'),
])
S['Cooling_Coverage'] = ('RackCooling', 'Optional: the cooling unit nearest each rack. Without it the system uses the units in the rack\'s room.', [
    ('rack_id', 'Y', 'ref', 'Racks', 'RackCooling.rackId', ''),
    ('primary_unit_id', 'Y', 'ref', 'Cooling_Units', 'RackCooling.primaryId', 'The CRAH / CRAC this rack depends on first.'),
    ('cdu_id', 'C', 'ref', 'CDUs', 'RackCooling.cduId', 'Liquid-cooled racks.'),
])
S['GPU_Clusters'] = ('GpuCluster', 'Only for GPU estates.', [
    ('cluster_id', 'Y', 'text', '', 'GpuCluster.id', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'GpuCluster.dcId', ''),
    ('room_id', 'Y', 'ref', 'Rooms', 'GpuCluster.room', ''),
    ('name', 'Y', 'text', '', 'GpuCluster.name', ''),
    ('scheduler', 'Y', 'list', 'scheduler', 'GpuCluster.scheduler', ''),
    ('fabric', 'Y', 'text', '', 'GpuCluster.fabric', 'For example "InfiniBand NDR 400G, rail-optimised".'),
    ('gpu_model', 'Y', 'list', 'gpu_model', 'GpuCluster.model', 'One model per cluster.'),
    ('cooling', 'Y', 'list', 'air_liquid', 'GpuCluster.cooling', ''),
    ('node_count (calc)', 'F', 'formula', '', 'GpuCluster.nodes', 'Calculated from GPU_Nodes.'),
])
S['GPU_Nodes'] = ('GpuNode', 'One row per GPU server in service; it must also be in Devices with role = GPU. A GPU host that is racked but not yet commissioned into a cluster (lifecycle Planned / Ready, monitored N) has no row yet.', [
    ('device_id', 'Y', 'ref', 'Devices', 'GpuNode.neId', ''),
    ('cluster_id', 'Y', 'ref', 'GPU_Clusters', 'GpuNode.clusterId', ''),
    ('gpu_model', 'Y', 'list', 'gpu_model', 'GpuNode.model', 'Must match the cluster.'),
    ('gpu_vendor', 'Y', 'list', 'gpu_vendor', 'GpuNode.vendor', ''),
    ('gpu_count', 'Y', 'integer', '', 'GpuNode.gpus.length', 'Usually 8.'),
    ('server_model', 'Y', 'text', '', 'GpuNode.server', ''),
    ('cooling', 'Y', 'list', 'air_liquid', 'GpuNode.cooling', ''),
    ('driver', 'N', 'text', '', 'GpuNode.driver', 'Installed driver version.'),
    ('firmware', 'N', 'text', '', 'GpuNode.firmware', ''),
])
S['Customers'] = ('Customer', 'Customers or tenants served from these sites.', [
    ('customer_id', 'Y', 'text', '', 'Customer.id', ''),
    ('name', 'Y', 'text', '', 'Customer.name', ''),
    ('segment', 'Y', 'text', '', 'Customer.segment', 'For example BFSI, Media, AI / ML, Healthcare.'),
    ('city', 'Y', 'text', '', 'Customer.city', 'Billing city.'),
    ('state', 'Y', 'text', '', 'Customer.state', ''),
    ('plan', 'Y', 'text', '', 'Customer.plan', 'Contract or plan name.'),
    ('premium', 'Y', 'list', 'yes_no', 'Customer.premium', 'Y = premium SLA (counted on the Command center).'),
    ('account_manager', 'N', 'text', '', 'Customer.accountManager', ''),
    ('monthly_revenue (calc)', 'F', 'formula', '', 'Customer.revenueMonthly', 'Calculated: the sum of this customer\'s Services. Don\'t type it.'),
])
S['Services'] = ('Service', 'What each customer buys and where it is delivered. This drives impact and revenue at risk.', [
    ('service_id', 'Y', 'text', '', 'Service.id', ''),
    ('customer_id', 'Y', 'ref', 'Customers', 'Service.customerId', ''),
    ('type', 'Y', 'list', 'service_type', 'Service.type', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'Service.dcId', ''),
    ('device_id', 'C', 'ref', 'Devices', 'Service.neId', 'The device the service is delivered on (port, GPU node, MMR switch…).'),
    ('if_name', 'N', 'text', '', 'Service.ifName', 'Hand-off port for circuits and cross-connects.'),
    ('rack_ids', 'C', 'text', '', 'Service path (racks)', 'Cabinet leases / power circuits: rack ids, separated by ";".'),
    ('gpu_node_ids', 'C', 'text', '', 'Service.path (job nodes)', 'GPU services: GPU node device ids, separated by ";".'),
    ('qty', 'Y', 'decimal', '', 'Service.qty', ''),
    ('unit', 'Y', 'list', 'service_unit', 'Service.unit', ''),
    ('bandwidth_mbps', 'N', 'integer', '', 'Service.bandwidthMbps', 'Circuits and cross-connects.'),
    ('sla_target_pct', 'Y', 'decimal', '', 'Service.slaTarget', 'For example 99.95.'),
    ('monthly_revenue', 'Y', 'decimal', '', 'Service.revenueMonthly', 'Monthly charge in the site currency (₹).'),
    ('critical', 'Y', 'list', 'yes_no', 'Service.critical', 'Y = business-critical for the customer.'),
    ('start_date', 'N', 'date', '', '(reference only)', ''),
])
S['Collectors'] = ('Datacenter.collectors[]', 'Monitoring sources the system will receive live data from.', [
    ('collector_id', 'Y', 'text', '', 'collectors[].id', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'Datacenter.id', ''),
    ('name', 'Y', 'text', '', 'collectors[].name', ''),
    ('protocol', 'Y', 'list', 'collector_protocol', '(integration)', ''),
    ('domain', 'Y', 'list', 'collector_domain', '(integration)', 'Network, Facility (BMS / EPMS), Compute (BMC), GPU (DCGM).'),
    ('host_ip', 'N', 'ip', '', '(integration)', ''),
    ('covers', 'N', 'text', '', '(integration)', 'What it polls.'),
])
S['Fire_Systems'] = ('FireZone', 'Fire detection and suppression, one row per protected room.', [
    ('zone_id', 'Y', 'text', '', 'FireZone.id', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'FireZone.dcId', ''),
    ('room_id', 'Y', 'ref', 'Rooms', 'FireZone.zone', ''),
    ('detection', 'Y', 'list', 'detection', 'FireZone.detection', 'VESDA (aspirating) in data halls; point smoke + heat elsewhere.'),
    ('suppression', 'Y', 'list', 'suppression', 'FireZone.suppression', ''),
    ('release_mode', 'Y', 'list', 'release_mode', 'FireZone.release', 'Armed (auto) in normal operation.'),
    ('last_inspection', 'Y', 'date', '', 'FireZone.lastInspection', 'Quarterly inspection; the tool flags it overdue after 91 days.'),
    ('panel_point', 'N', 'text', '', '(collector mapping)', 'Fire-panel / BMS point for live detector state.'),
])
S['Leak_Detection'] = ('LeakZone', 'Leak-detection rope zones under cooling units, CDUs and liquid racks.', [
    ('zone_id', 'Y', 'text', '', 'LeakZone.id', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'LeakZone.dcId', ''),
    ('room_id', 'Y', 'ref', 'Rooms', 'LeakZone.zone', ''),
    ('guards', 'Y', 'text', '', 'LeakZone.covers', 'What the rope runs under (CRAH-11, CDU-01 manifold…).'),
    ('length_m', 'N', 'decimal', '', 'LeakZone.lengthM', ''),
    ('last_test', 'N', 'date', '', 'LeakZone.lastTest', 'Last wet test.'),
])
S['Access_Points'] = ('AccessPoint', 'Every access-controlled door: building entry, room doors, tenant cage doors.', [
    ('door_id', 'Y', 'text', '', 'AccessPoint.id', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'AccessPoint.dcId', ''),
    ('name', 'Y', 'text', '', 'AccessPoint.name', ''),
    ('room_id', 'N', 'ref', 'Rooms', 'AccessPoint.zone', ''),
    ('kind', 'Y', 'list', 'door_kind', 'AccessPoint.kind', ''),
    ('reader', 'Y', 'list', 'reader', 'AccessPoint.reader', ''),
    ('tenant_customer_id', 'C', 'ref', 'Customers', 'AccessPoint.tenantId', 'Cage doors: the tenant whose badges open it.'),
])
S['Support_Contracts'] = ('AssetLife.contract', 'Vendor support / AMC contracts.', [
    ('contract_id', 'Y', 'text', '', 'contract.id', ''),
    ('site_id', 'Y', 'ref', 'Sites', '(scope)', ''),
    ('vendor', 'Y', 'text', '', '(vendor)', ''),
    ('level', 'Y', 'list', 'support_level', 'contract.level', '24×7×4 = 4-hour on-site response; NBD = next business day.'),
    ('start', 'N', 'date', '', '(reference only)', ''),
    ('expires', 'Y', 'date', '', 'contract.expires', 'The tool flags devices whose contract ends within 90 days.'),
])
S['Asset_Lifecycle'] = ('AssetLife', 'Per device: install date, warranty and which contract covers it.', [
    ('device_id', 'Y', 'ref', 'Devices', 'AssetLife.neId', ''),
    ('installed', 'Y', 'date', '', 'AssetLife.installed', ''),
    ('warranty_end', 'Y', 'date', '', 'AssetLife.warrantyEnd', ''),
    ('contract_id', 'N', 'ref', 'Support_Contracts', 'AssetLife.contract', 'Blank = warranty only.'),
])
S['Model_Lifecycle'] = ('modelDates()', 'Vendor end-of-sale / end-of-support dates per model (one row per model).', [
    ('vendor', 'Y', 'text', '', 'AssetLife.vendor', ''),
    ('model', 'Y', 'text', '', 'AssetLife.model', 'Exactly as in Devices.model.'),
    ('end_of_sale', 'Y', 'date', '', 'AssetLife.endOfSale', ''),
    ('end_of_support', 'Y', 'date', '', 'AssetLife.endOfSupport', 'Past this date the device is flagged End of support.'),
])
S['Spares'] = ('SparePart', 'Field-replaceable spares held on site.', [
    ('site_id', 'Y', 'ref', 'Sites', 'SparePart.dcId', ''),
    ('part', 'Y', 'text', '', 'SparePart.part', 'Part family, for example "DELL power supply", "SFP-10G-LR", "H200 SXM 141 GB board".'),
    ('fits', 'N', 'text', '', 'SparePart.fits', ''),
    ('on_hand', 'Y', 'integer', '', 'SparePart.onHand', ''),
    ('min_level', 'Y', 'integer', '', 'SparePart.min', 'The tool flags Low when the free count falls below it.'),
])
S['PM_Plan'] = ('PmTask', 'Preventive-maintenance plan of the plant (UPS, batteries, DG, cooling, CDU, fire, switchgear).', [
    ('task_id', 'Y', 'text', '', 'PmTask.id', ''),
    ('site_id', 'Y', 'ref', 'Sites', 'PmTask.dcId', ''),
    ('asset_id', 'Y', 'text', '', 'PmTask.assetId', 'UPS, cooling unit, fire zone, DG… id from the sheets above.'),
    ('kind', 'Y', 'list', 'pm_kind', 'PmTask.kind', ''),
    ('task', 'Y', 'text', '', 'PmTask.task', ''),
    ('interval_days', 'Y', 'integer', '', 'PmTask.intervalDays', ''),
    ('last_done', 'Y', 'date', '', 'PmTask.lastDone', 'Next due = last done + interval.'),
    ('owner', 'N', 'text', '', 'PmTask.owner', ''),
])
S['On_Call'] = ('OnCall', 'On-call rota: who answers per region and role.', [
    ('region', 'Y', 'text', '', 'Region.name', 'Region as in Sites.region.'),
    ('role', 'Y', 'list', 'oncall_role', 'OnCall.role', ''),
    ('name', 'Y', 'text', '', 'OnCall.name', ''),
    ('tier', 'Y', 'integer', '', 'OnCall.tier', '1, 2 or 3.'),
    ('escalate_after_min', 'Y', 'integer', '', 'OnCall.escalateAfterMin', 'Minutes before an unacknowledged page escalates.'),
    ('phone', 'N', 'text', '', '(paging)', ''),
])
ORDER = list(S.keys())

# ---------------------------------------------------------------- example data (illustrative, two RackBank sites)
import json
BACKUP = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None
if BACKUP:
    S['Snapshot_Alerts'] = ('Alert (snapshot, not imported)', 'Alarms at the time of the backup. Live data: kept for the record, not for import.', [(k, 'N', 'text', '', m, '') for k, m in [
        ('alert_id', 'Alert.id'), ('site_id', 'Alert.dcId'), ('severity', 'Alert.severity'), ('state', 'Alert.state'), ('title', 'Alert.title'), ('source', 'Alert.source'), ('category', 'Alert.category'),
        ('scope', 'Alert.scope'), ('device_or_node', 'Alert.neId / node'), ('if_name', 'Alert.ifName'), ('link_or_rack', 'Alert.linkId / rackId'), ('raised_at', 'Alert.start'), ('incident_id', 'Alert.incidentId')]])
    S['Snapshot_Incidents'] = ('Incident (snapshot, not imported)', 'Incidents at the time of the backup.', [(k, 'N', 'text', '', m, '') for k, m in [
        ('incident_id', 'Incident.id'), ('site_id', 'Incident.dcId'), ('severity', 'Incident.sev'), ('status', 'Incident.status'), ('type', 'Incident.type'), ('title', 'Incident.title'), ('owner', 'Incident.owner'),
        ('detected_at', 'Incident.detected'), ('resolved_at', 'Incident.resolved'), ('alarms', 'Incident.alertIds'), ('services_hit', 'impact.services'), ('customers_hit', 'impact.customers'), ('revenue_at_risk', 'impact.revenueAtRisk')]])
    S['Snapshot_Changes'] = ('Change (snapshot, not imported)', 'Changes and maintenance windows at the time of the backup.', [(k, 'N', 'text', '', m, '') for k, m in [
        ('change_id', 'Change.id'), ('site_id', 'Change.dcId'), ('kind', 'Change.kind'), ('title', 'Change.title'), ('status', 'Change.status'), ('risk', 'Change.risk'), ('window_start', 'Change.windowStart'),
        ('window_end', 'Change.windowEnd'), ('requester', 'Change.requester'), ('approver', 'Change.approver'), ('scope', 'Change.scope')]])
    S['Snapshot_RMA'] = ('RmaCase (snapshot, not imported)', 'Open RMA cases at the time of the backup.', [(k, 'N', 'text', '', m, '') for k, m in [
        ('rma_id', 'RmaCase.id'), ('site_id', 'RmaCase.dcId'), ('device_id', 'RmaCase.neId'), ('slot', 'RmaCase.slot'), ('part', 'RmaCase.part'), ('vendor_case', 'RmaCase.ref'), ('status', 'RmaCase.status'), ('opened', 'RmaCase.opened'), ('spare_on_site', 'RmaCase.spareOnSite')]])
    S['Snapshot_Problems'] = ('Problem (snapshot, not imported)', 'Problem records grouping recurring incidents.', [(k, 'N', 'text', '', m, '') for k, m in [
        ('problem_id', 'Problem.id'), ('title', 'Problem.title'), ('type', 'Problem.type'), ('state', 'Problem.state'), ('incidents', 'Problem.incidents'), ('open', 'Problem.open'), ('sites', 'Problem.sites'), ('workaround', 'Problem.workaround'), ('fix', 'Problem.fix'), ('owner', 'Problem.owner')]])
    S['Snapshot_Orders'] = ('CrossConnectOrder + RemoteHandsTicket (snapshot)', 'Colocation cross-connect orders and remote-hands tickets.', [(k, 'N', 'text', '', m, '') for k, m in [
        ('order_id', 'id'), ('kind', 'Cross-connect / Remote hands'), ('site_id', 'dcId'), ('customer_id', 'customerId'), ('detail', 'route or task'), ('state', 'state'), ('opened', 'ordered / opened'), ('due_or_minutes', 'due / minutes')]])
    ORDER = list(S.keys())
    META = BACKUP.pop('_meta')[0]
    SAMPLE = META[3] if len(META) > 3 and META[3] else ''  # a per-datacenter sample names its sites
    rows = {k: [[(D.fromisoformat(v) if isinstance(v, str) and len(v) == 10 and v[4:5] == '-' and v[7:8] == '-' and v[:4].isdigit() else v) for v in r] for r in BACKUP.get(k, [])] for k in ORDER}
else:
    SAMPLE = ''
    rows = {k: [] for k in ORDER}
    A = rows

    A['Sites'] = [
        ['MP-DC-001', 'RackBank Indore DC1', 'RackBank Datacenters (sample)', 'colocation', 'on-air', 'Tier III', 'Central', 'Central', 'Madhya Pradesh', 'Indore',
         'Plot 12, Sample IT Park, Indore 452010 (illustrative)', 22.7196, 75.8577, D(2022, 3, 15), 1200, 1.45, 1500, 'N+1', 'Asia/Kolkata'],
        ['TN-DC-002', 'RackBank Chennai AI-1', 'RackBank Datacenters (sample)', 'neocloud', 'on-air', 'Tier III', 'Regional', 'South', 'Tamil Nadu', 'Chennai',
         'Survey 45, Sample Industrial Estate, Chennai 600058 (illustrative)', 13.1143, 80.1548, D(2025, 1, 20), 2000, 1.25, 2400, 'N+1', 'Asia/Kolkata'],
    ]
    A['Floors'] = [
        ['MP-DC-001', 'MP-DC-001-F0', 'Ground', 0], ['MP-DC-001', 'MP-DC-001-F1', '1st floor', 1],
        ['TN-DC-002', 'TN-DC-002-F0', 'Ground', 0], ['TN-DC-002', 'TN-DC-002-F1', '1st floor', 1],
    ]
    A['Rooms'] = [
        ['MP-DC-001', 'MP-DC-001-F0', 'MP-DC-001-MMR', 'Meet-me room', 'Meet-me room', 60, 1, 'None', 'Air'],
        ['MP-DC-001', 'MP-DC-001-F0', 'MP-DC-001-PLANT', 'Plant room', 'Plant room', 140, None, 'None', 'Air'],
        ['MP-DC-001', 'MP-DC-001-F1', 'MP-DC-001-HALLA', 'Hall A', 'Data hall', 420, 2, 'Cold aisle', 'Air'],
        ['MP-DC-001', 'MP-DC-001-F1', 'MP-DC-001-HALLB', 'Hall B (AI cages)', 'AI hall', 260, 2, 'Hot aisle', 'Liquid'],
        ['TN-DC-002', 'TN-DC-002-F0', 'TN-DC-002-MMR', 'Meet-me room', 'Meet-me room', 50, 1, 'None', 'Air'],
        ['TN-DC-002', 'TN-DC-002-F0', 'TN-DC-002-PLANT', 'Plant room', 'Plant room', 180, None, 'None', 'Air'],
        ['TN-DC-002', 'TN-DC-002-F1', 'TN-DC-002-NET', 'Network & storage room', 'Network room', 120, 1, 'Cold aisle', 'Air'],
        ['TN-DC-002', 'TN-DC-002-F1', 'TN-DC-002-GPU1', 'GPU hall 1', 'AI hall', 380, 2, 'Hot aisle', 'Liquid'],
    ]

    # racks: (site, room, name, row, pos, role, U, budget, owner, tenant, contracted, density, liquid, cdu, feedA, feedB)
    def rk(site, room, name, row, pos, role, U, kw, owner='operator', tenant=None, ckw=None, density='standard', liquid='N', cdu=None):
        return [f'{site}-{name}', site, f'{site}-{room}', name, row, pos, role, U, kw, owner, tenant, ckw, density, liquid, cdu, f'{site}-AC-1', f'{site}-AC-2', None]
    M, T = 'MP-DC-001', 'TN-DC-002'
    A['Racks'] = [
        rk(M, 'MMR', 'MMR-R01', 'M', 1, 'Core', 45, 12),
        rk(M, 'MMR', 'MMR-R02', 'M', 2, 'Meet-me room', 45, 6),
        rk(M, 'HALLA', 'A01', 'A', 1, 'Aggregation', 45, 10),
        rk(M, 'HALLA', 'A02', 'A', 2, 'Tenant', 42, 8, 'tenant', 'CUST-001', 6),
        rk(M, 'HALLA', 'A03', 'A', 3, 'Tenant', 42, 8, 'tenant', 'CUST-001', 6),
        rk(M, 'HALLA', 'A04', 'B', 1, 'Tenant', 42, 10, 'tenant', 'CUST-002', 8),
        rk(M, 'HALLA', 'A05', 'B', 2, 'Tenant', 42, 8, 'tenant', 'CUST-003', 6),
        rk(M, 'HALLA', 'A06', 'B', 3, 'Tenant', 42, 8, 'tenant', 'CUST-003', 6),
        rk(M, 'HALLB', 'B01', 'C', 1, 'AI cage', 48, 50, 'tenant', 'CUST-004', 40, 'ai', 'Y', f'{M}-CDU-01'),
        rk(M, 'HALLB', 'B02', 'C', 2, 'AI cage', 48, 50, 'tenant', 'CUST-004', 40, 'ai', 'Y', f'{M}-CDU-01'),
        rk(M, 'HALLB', 'B03', 'D', 1, 'AI cage', 48, 50, 'tenant', 'CUST-004', 40, 'ai', 'Y', f'{M}-CDU-01'),
        rk(M, 'HALLB', 'B04', 'D', 2, 'AI cage', 48, 50, 'tenant', 'CUST-004', 40, 'ai', 'Y', f'{M}-CDU-01'),
        rk(T, 'MMR', 'MMR-R01', 'M', 1, 'Core', 45, 12),
        rk(T, 'NET', 'NET-R01', 'N', 1, 'Network', 45, 15),
        rk(T, 'NET', 'NET-R02', 'N', 2, 'Network', 45, 15),
        rk(T, 'NET', 'STG-R01', 'N', 3, 'Storage', 45, 20),
        rk(T, 'GPU1', 'GPU-R01', 'G', 1, 'GPU', 48, 60, density='ai', liquid='Y', cdu=f'{T}-CDU-01'),
        rk(T, 'GPU1', 'GPU-R02', 'G', 2, 'GPU', 48, 60, density='ai', liquid='Y', cdu=f'{T}-CDU-01'),
        rk(T, 'GPU1', 'GPU-R03', 'H', 1, 'GPU', 48, 60, density='ai', liquid='Y', cdu=f'{T}-CDU-02'),
        rk(T, 'GPU1', 'GPU-R04', 'H', 2, 'GPU', 48, 60, density='ai', liquid='Y', cdu=f'{T}-CDU-02'),
    ]
    A['Power_Feeds'] = [
        [f'{M}-AC-1', M, 'AC', 'Utility feed A (MPPKVVCL 33 kV)', '1250 A · 415 V', 800, 'Active', 'MPW-33KV-0001 (sample)'],
        [f'{M}-AC-2', M, 'AC', 'Utility feed B (MPPKVVCL 33 kV)', '1250 A · 415 V', 800, 'Standby', 'MPW-33KV-0002 (sample)'],
        [f'{M}-DC-1', M, 'DC', 'Rectifier RECT-01', '48 V · 2400 A', 115, 'Active', None],
        [f'{T}-AC-1', T, 'AC', 'Utility feed A (TANGEDCO 110 kV)', '2000 A · 415 V', 1300, 'Active', 'TNE-110KV-0001 (sample)'],
        [f'{T}-AC-2', T, 'AC', 'Utility feed B (TANGEDCO 110 kV)', '2000 A · 415 V', 1300, 'Standby', 'TNE-110KV-0002 (sample)'],
        [f'{T}-DC-1', T, 'DC', 'Rectifier RECT-01', '48 V · 1600 A', 77, 'Active', None],
    ]
    A['UPS'] = [
        [f'{M}-UPS-{i}', M, f'{M}-PLANT', f'UPS-{i}', 'Vertiv', 'Liebert EXL S1 500', f'VTV-EXL-{4100 + i}', 500, 'N+1', 15] for i in (1, 2, 3)
    ] + [
        [f'{T}-UPS-{i}', T, f'{T}-PLANT', f'UPS-{i}', 'Schneider Electric', 'Galaxy VX 750', f'SE-GVX-{7700 + i}', 750, 'N+1', 10] for i in (1, 2, 3, 4)
    ]
    A['Generators'] = [
        [f'{M}-DG-1', M, 'DG-1', 1500, 5000, 12, D(2026, 9, 28), 'Pass'],
        [f'{M}-DG-2', M, 'DG-2', 1500, 5000, 12, D(2026, 9, 28), 'Pass'],
        [f'{T}-DG-1', T, 'DG-1', 2250, 8000, 14, D(2026, 10, 2), 'Pass'],
        [f'{T}-DG-2', T, 'DG-2', 2250, 8000, 14, D(2026, 10, 2), 'Pass'],
    ]
    A['DC_Plant'] = [
        [f'{M}-RECT-01', M, f'{M}-PLANT', 'Rectifier', 'RECT-01', None, None, '48 V · 2400 A', 115, None, D(2026, 8, 14)],
        [f'{M}-BATT-01', M, f'{M}-PLANT', 'Battery bank', 'BATT-01', 48, 2000, None, None, 4, D(2026, 8, 14)],
        [f'{T}-RECT-01', T, f'{T}-PLANT', 'Rectifier', 'RECT-01', None, None, '48 V · 1600 A', 77, None, D(2026, 7, 30)],
        [f'{T}-BATT-01', T, f'{T}-PLANT', 'Battery bank', 'BATT-01', 48, 1500, None, None, 3, D(2026, 7, 30)],
    ]
    A['Cooling_Units'] = [
        [f'{M}-CRAH-01', M, f'{M}-MMR', 'CRAH-01', 'CRAH', 'Stulz', 'CyberAir 3PRO', 60, 18],
        [f'{M}-CRAH-11', M, f'{M}-HALLA', 'CRAH-11', 'CRAH', 'Vertiv', 'Liebert PDX', 120, 18],
        [f'{M}-CRAH-12', M, f'{M}-HALLA', 'CRAH-12', 'CRAH', 'Vertiv', 'Liebert PDX', 120, 18],
        [f'{M}-CRAH-13', M, f'{M}-HALLA', 'CRAH-13', 'CRAH', 'Vertiv', 'Liebert PDX', 120, 18],
        [f'{M}-CDU-01', M, f'{M}-HALLB', 'CDU-01', 'CDU', 'CoolIT', 'CHx750', 750, 32],
        [f'{M}-CRAH-21', M, f'{M}-HALLB', 'CRAH-21', 'CRAH', 'Vertiv', 'Liebert PDX', 120, 20],
        [f'{T}-CRAH-01', T, f'{T}-MMR', 'CRAH-01', 'CRAH', 'Stulz', 'CyberAir 3PRO', 60, 18],
        [f'{T}-CRAH-11', T, f'{T}-NET', 'CRAH-11', 'CRAH', 'Stulz', 'CyberAir 3PRO', 120, 18],
        [f'{T}-CRAH-12', T, f'{T}-NET', 'CRAH-12', 'CRAH', 'Stulz', 'CyberAir 3PRO', 120, 18],
        [f'{T}-CDU-01', T, f'{T}-GPU1', 'CDU-01', 'CDU', 'Vertiv', 'Liebert XDU1350', 1350, 30],
        [f'{T}-CDU-02', T, f'{T}-GPU1', 'CDU-02', 'CDU', 'Vertiv', 'Liebert XDU1350', 1350, 30],
        [f'{T}-CRAH-21', T, f'{T}-GPU1', 'CRAH-21', 'CRAH', 'Stulz', 'CyberAir 3PRO', 150, 20],
    ]
    A['CDUs'] = [
        [f'{M}-CDU-01', M, f'{M}-HALLB', 'CDU-01', 750, 1100, 32, None],
        [f'{T}-CDU-01', T, f'{T}-GPU1', 'CDU-01', 1350, 1900, 30, None],
        [f'{T}-CDU-02', T, f'{T}-GPU1', 'CDU-02', 1350, 1900, 30, None],
    ]
    sens = []
    for site, room, pos in [(M, 'MMR', 'MMR centre'), (M, 'PLANT', 'UPS row'), (M, 'HALLA', 'Cold aisle 1'), (M, 'HALLA', 'Cold aisle 2'), (M, 'HALLB', 'Cage row C'),
                            (T, 'MMR', 'MMR centre'), (T, 'PLANT', 'UPS row'), (T, 'NET', 'Cold aisle 1'), (T, 'GPU1', 'Row G'), (T, 'GPU1', 'Row H')]:
        n = len([s for s in sens if s[1] == site]) + 1
        sens.append([f'{site}-ENV-{n:02d}', site, f'{site}-{room}', 'Temperature + humidity', pos, f'BMS.{room}.TH{n:02d}'])
    for site, room, kind, pos in [(M, 'HALLB', 'Leak', 'Under CDU-01'), (M, 'PLANT', 'Smoke', 'Battery area'), (T, 'GPU1', 'Leak', 'CDU manifold'), (T, 'PLANT', 'Smoke', 'Battery area')]:
        n = len([s for s in sens if s[1] == site]) + 1
        sens.append([f'{site}-ENV-{n:02d}', site, f'{site}-{room}', kind, pos, f'BMS.{room}.{kind[:2].upper()}{n:02d}'])
    A['Sensors'] = sens

    A['Collectors'] = [
        [f'COL-{M}-NET', M, 'Indore network poller', 'SNMP', 'Network', '10.10.0.10', 'Routers, firewalls, switches (SNMP v3 + LLDP)'],
        [f'COL-{M}-BMS', M, 'Indore BMS gateway', 'Modbus TCP', 'Facility', '10.10.0.20', 'UPS, rectifier, DG, CRAH, CDU, sensors'],
        [f'COL-{T}-NET', T, 'Chennai network poller', 'gNMI', 'Network', '10.20.0.10', 'Border, firewalls, IB / Ethernet / OOB fabric'],
        [f'COL-{T}-BMS', T, 'Chennai BMS gateway', 'BACnet', 'Facility', '10.20.0.20', 'UPS, rectifier, DG, CRAH, CDU, sensors'],
        [f'COL-{T}-BMC', T, 'Chennai BMC poller', 'Redfish', 'Compute', '10.20.0.30', 'Server / GPU node BMCs (PSU, fans, temperatures)'],
        [f'COL-{T}-DCGM', T, 'Chennai DCGM exporter', 'DCGM exporter', 'GPU', '10.20.0.40', 'Per-GPU telemetry (util, temp, ECC, Xid, NVLink)'],
    ]

    # devices: build with automatic U stacking per rack
    devs, ifs, links, mods = [], [], [], []
    nextU = {}
    ser = [1000]
    def dev(site, host, role, layer, vendor, model, osv, rack, usize, owner='operator', tenant=None, monitored='Y', coll=None, wan='N', ip=None, life='Ready'):
        rid = f'{site}-{rack}'
        u = nextU.get(rid, 1); nextU[rid] = u + usize
        ser[0] += 7
        did = f'{site}-{host}'
        serial = None if owner == 'tenant' else f'{vendor[:3].upper()}{site[:2]}{ser[0]:06d}'
        mac = None if owner == 'tenant' else f'3c:fd:fe:{(ser[0] >> 8) & 255:02x}:{ser[0] & 255:02x}:{len(devs) & 255:02x}'
        devs.append([did, site, host if owner == 'operator' else host, role, layer, vendor, model, osv, serial, ip, mac, rid, u, usize, life, owner, tenant, monitored, coll if monitored == 'Y' else None, wan])
        return did
    def iface(d, name, typ, mbps, desc='', optic=None, admin='up'):
        ifs.append([d, name, typ, mbps, admin, desc, optic])
    def link(a, ai, z, zi, role, mbps, cable=None, strand=None, ap=None, zp=None, circuit=None, aty=None, zty=None, aopt=None, zopt=None):
        lid = f'LNK-{len(links) + 1:04d}'
        links.append([lid, a, ai, z, zi, role, 'LLDP', mbps, cable, strand, ap, zp, circuit])
        t = {1000: '1GE', 10000: '10GE', 100000: '100GE', 400000: '400G NDR'}
        iface(a, ai, aty or t.get(mbps, f'{mbps // 1000}G'), mbps, f'to {z.split("-", 3)[-1]} {zi}', aopt)
        iface(z, zi, zty or t.get(mbps, f'{mbps // 1000}G'), mbps, f'to {a.split("-", 3)[-1]} {ai}', zopt)

    # --- MP-DC-001 Indore: colocation (operator network + tenant cabinets + AI cages)
    cn, cb = f'COL-{M}-NET', f'COL-{M}-BMS'
    m_bdr = [dev(M, f'BDR-0{i}', 'Router', 'core', 'Juniper', 'MX304', 'Junos 23.2R2', 'MMR-R01', 2, coll=cn, wan='Y', ip=f'10.10.1.{i}') for i in (1, 2)]
    m_fw = [dev(M, f'FW-0{i}', 'Firewall', 'core', 'Fortinet', 'FortiGate 3700F', 'FortiOS 7.4.4', 'MMR-R01', 3, coll=cn, ip=f'10.10.1.{10 + i}') for i in (1, 2)]
    m_mmr = [dev(M, f'MMR-SW-0{i}', 'Switch', 'access', 'Arista', '7050SX3-48YC8', 'EOS 4.31.2F', 'MMR-R02', 1, coll=cn, ip=f'10.10.1.{20 + i}') for i in (1, 2)]
    m_agg = [dev(M, f'AGG-0{i}', 'Switch', 'spine', 'Arista', '7280R3-48YC8', 'EOS 4.31.2F', 'A01', 1, coll=cn, ip=f'10.10.1.{30 + i}') for i in (1, 2)]
    m_oob = dev(M, 'OOB-01', 'Switch', 'access', 'Cisco', 'Catalyst 9300-48T', 'IOS XE 17.9.4', 'A01', 1, coll=cn, ip='10.10.1.40')
    tenants_m = [('A02', 'CUST-001', 30), ('A03', 'CUST-001', 24), ('A04', 'CUST-002', 34), ('A05', 'CUST-003', 20), ('A06', 'CUST-003', 18),
                 ('B01', 'CUST-004', 40), ('B02', 'CUST-004', 40), ('B03', 'CUST-004', 40), ('B04', 'CUST-004', 40)]
    m_ten = {}
    for rack, cust, u in tenants_m:
        m_ten[rack] = dev(M, f'TEN-{rack}', 'Tenant gear', 'access', 'Tenant', 'Tenant equipment (opaque)', None, rack, u, owner='tenant', tenant=cust, monitored='N')
    for i, b in enumerate(m_bdr):
        for s, n in [('FPC 0', 'MPC10E 10x400GE'), ('PSU 0', 'JPSU-2200-AC'), ('PSU 1', 'JPSU-2200-AC'), ('RE 0', 'RE-X6-64G')]:
            mods.append([b, s, n, f'JN{M[:2]}{i}{len(mods):05d}'])
    # backhaul to Chennai is added after TN devices exist
    for i in (0, 1):
        link(m_bdr[i], 'et-0/0/0', m_fw[i], 'port1', 'Uplink', 100000, f'{M}-MMR-PC-{i + 1:02d}', None, None, None, None, aopt='QSFP28-100G-LR4', zopt='QSFP28-100G-SR4')
        link(m_fw[i], 'port9', m_agg[i], 'Ethernet49/1', 'Uplink', 100000, f'{M}-TRK-HA-{i + 1:02d}', f'{i * 2 + 1}-{i * 2 + 2}', f'MMR-ODF-01:{i * 2 + 1}', f'A01-ODF:{i * 2 + 1}', None, aopt='QSFP28-100G-SR4', zopt='QSFP28-100G-SR4')
        link(m_agg[i], 'Ethernet50/1', m_mmr[i], 'Ethernet49/1', 'Uplink', 100000, f'{M}-TRK-HA-{i + 3:02d}', f'{i * 2 + 5}-{i * 2 + 6}', f'A01-ODF:{i * 2 + 5}', f'MMR-ODF-01:{i * 2 + 5}', None)
    link(m_bdr[0], 'et-0/0/1', m_bdr[1], 'et-0/0/1', 'Fabric', 100000, f'{M}-MMR-PC-05')
    link(m_agg[0], 'Ethernet51/1', m_agg[1], 'Ethernet51/1', 'Fabric', 100000, f'{M}-A01-PC-01')
    for k, d in enumerate([*m_bdr, *m_fw, *m_mmr, *m_agg]):
        link(m_oob, f'GigabitEthernet1/0/{k + 1}', d, 'mgmt0' if 'FW' not in d else 'mgmt', 'Access', 1000)
    # tenant cross-connects: MMR switch port → tenant cabinet (the tenant's gear is opaque; the hand-off port is ours)
    for k, (rack, cust, _) in enumerate(tenants_m[:5]):
        iface(m_mmr[k % 2], f'Ethernet{k + 1}', '10GE', 10000, f'XC to {cust} cabinet {rack}', 'SFP-10G-LR')
    for p in (1, 2):
        iface(m_bdr[0], f'et-0/0/{p + 3}', '100GE', 100000, 'Spare, reserved for CUST-004 backhaul', None, 'reserved')

    # --- TN-DC-002 Chennai: GPU cloud (neocloud bill of materials)
    tn, tc = f'COL-{T}-NET', f'COL-{T}-BMC'
    t_bdr = [dev(T, f'BDR-0{i}', 'Router', 'core', 'Juniper', 'MX304', 'Junos 23.2R2', 'MMR-R01', 2, coll=tn, wan='Y', ip=f'10.20.1.{i}') for i in (1, 2)]
    t_fw = [dev(T, f'FW-0{i}', 'Firewall', 'core', 'Palo Alto Networks', 'PA-5450', 'PAN-OS 11.1.4', 'MMR-R01', 5, coll=tn, ip=f'10.20.1.{10 + i}') for i in (1, 2)]
    t_ibs = [dev(T, f'IB-SPINE-0{i}', 'Switch', 'spine', 'NVIDIA', 'Quantum-2 QM9700', 'MLNX-OS 3.11.2016', 'NET-R01', 1, coll=tn, ip=f'10.20.1.{20 + i}') for i in (1, 2)]
    t_ets = [dev(T, f'ETH-SPINE-0{i}', 'Switch', 'spine', 'NVIDIA', 'Spectrum-4 SN5600', 'Cumulus Linux 5.9', 'NET-R01', 2, coll=tn, ip=f'10.20.1.{30 + i}') for i in (1, 2)]
    t_ibl = [dev(T, f'IB-LEAF-0{i}', 'Switch', 'leaf', 'NVIDIA', 'Quantum-2 QM9700', 'MLNX-OS 3.11.2016', 'NET-R02', 1, coll=tn, ip=f'10.20.1.{40 + i}') for i in (1, 2)]
    t_etl = [dev(T, f'ETH-LEAF-0{i}', 'Switch', 'leaf', 'Arista', '7060DX5-64S', 'EOS 4.32.1F', 'NET-R02', 2, coll=tn, ip=f'10.20.1.{50 + i}') for i in (1, 2)]
    t_oob = dev(T, 'OOB-01', 'Switch', 'access', 'NVIDIA', 'SN2201', 'Cumulus Linux 5.9', 'NET-R02', 1, coll=tn, ip='10.20.1.60')
    t_stg = [dev(T, f'STG-00{i}', 'Storage', 'access', 'VAST Data', 'Ceres DF-3015', 'VAST OS 5.1', 'STG-R01', 2, coll=tc, ip=f'10.20.3.{i}') for i in (1, 2)]
    t_cpu = [dev(T, f'CPU-000{i}', 'Server', 'access', 'Dell', 'PowerEdge R760', 'Ubuntu 22.04 LTS', 'STG-R01', 2, coll=tc, ip=f'10.20.4.{i}') for i in (1, 2)]
    t_gpu = []
    for r in range(4):
        for j in range(2):
            n = r * 2 + j + 1
            t_gpu.append(dev(T, f'GPU-{n:03d}', 'GPU', 'access', 'Supermicro', 'SYS-821GE-TNHR (H200, liquid)', 'Ubuntu 22.04 LTS', f'GPU-R0{r + 1}', 8, coll=tc, ip=f'10.20.2.{n}'))
    for i in (0, 1):
        link(t_bdr[i], 'et-0/0/0', t_fw[i], 'ethernet1/1', 'Uplink', 100000, f'{T}-MMR-PC-{i + 1:02d}', aopt='QSFP28-100G-LR4', zopt='QSFP28-100G-SR4')
        for s in (0, 1):
            link(t_fw[i], f'ethernet1/{s + 3}', t_ets[s], f'swp{i + 1}', 'Uplink', 100000, f'{T}-TRK-NET-{i * 2 + s + 1:02d}', f'{(i * 2 + s) * 2 + 1}-{(i * 2 + s) * 2 + 2}', f'MMR-ODF-01:{(i * 2 + s) * 2 + 1}', f'NET-ODF:{(i * 2 + s) * 2 + 1}')
    link(t_bdr[0], 'et-0/0/1', t_bdr[1], 'et-0/0/1', 'Fabric', 100000, f'{T}-MMR-PC-05')
    for s in (0, 1):
        for l in (0, 1):
            link(t_ets[s], f'swp{10 + l}', t_etl[l], f'Ethernet{57 + s}/1', 'Fabric', 400000, None, aty='400GE', zty='400GE')
            for k in range(2):
                link(t_ibs[s], f'IB1/{l * 2 + k + 1}', t_ibl[l], f'IB1/{33 + s * 2 + k}', 'Fabric', 400000, None, aopt='OSFP-400G-DR4', zopt='OSFP-400G-DR4')
    # GPU nodes: rail-optimised, ib0..ib7 alternate across the two IB leafs; two 100G front-end ports; BMC on OOB
    for n, g in enumerate(t_gpu):
        for rail in range(8):
            leaf = t_ibl[rail % 2]
            link(g, f'ib{rail}', leaf, f'IB1/{n * 4 + rail // 2 + 1}', 'Access', 400000, f'{T}-GPU-IB-{n + 1:02d}-{rail}', aopt='OSFP-400G-SR4', zopt='OSFP-400G-SR4')
        for e in (0, 1):
            link(g, f'eth{e}', t_etl[e], f'Ethernet{n + 1}/1', 'Access', 100000, aty='100GE')
    for n, h in enumerate([*t_stg, *t_cpu]):
        for e in (0, 1):
            link(h, f'eth{e}', t_etl[e], f'Ethernet{20 + n}/1', 'Access', 100000)
    for k, d in enumerate([*t_bdr, *t_fw, *t_ibs, *t_ets, *t_ibl, *t_etl, *t_stg, *t_cpu, *t_gpu]):
        link(t_oob, f'swp{k + 1}', d, 'mgmt0', 'Access', 1000)
    # inter-site backhaul (counts as edge for both sites)
    link(m_bdr[0], 'et-0/0/2', t_bdr[0], 'et-0/0/2', 'Backhaul', 100000, 'CARRIER-IDR-MAA-01', None, 'MMR-ODF-01:23', 'MMR-ODF-01:23', 'AIRTEL-NLD-100G-55821 (sample)', aopt='QSFP28-100G-ZR', zopt='QSFP28-100G-ZR')
    link(m_bdr[1], 'et-0/0/2', t_bdr[1], 'et-0/0/2', 'Backhaul', 100000, 'CARRIER-IDR-MAA-02', None, 'MMR-ODF-01:24', 'MMR-ODF-01:24', 'TATA-NLD-100G-90114 (sample)', aopt='QSFP28-100G-ZR', zopt='QSFP28-100G-ZR')
    for i, b in enumerate(t_bdr):
        for s, n in [('FPC 0', 'MPC10E 10x400GE'), ('PSU 0', 'JPSU-2200-AC'), ('PSU 1', 'JPSU-2200-AC'), ('RE 0', 'RE-X6-64G')]:
            mods.append([b, s, n, f'JN{T[:2]}{i}{len(mods):05d}'])
    for g in t_gpu[:2]:
        for s, n in [('PSU 1', '3000 W Titanium'), ('PSU 2', '3000 W Titanium'), ('BMC', 'AST2600')]:
            mods.append([g, s, n, f'SMC{len(mods):07d}'])

    A['Devices'], A['Interfaces'], A['Links'], A['Modules'] = devs, ifs, links, mods
    A['GPU_Clusters'] = [[f'{T}-CL-01', T, f'{T}-GPU1', 'Chennai H200 pod 1', 'Slurm', 'InfiniBand NDR 400G, rail-optimised', 'H200 SXM 141 GB', 'liquid', None]]
    A['GPU_Nodes'] = [[g, f'{T}-CL-01', 'H200 SXM 141 GB', 'NVIDIA', 8, 'Supermicro SYS-821GE-TNHR', 'liquid', '550.90.07', 'BMC 01.03.12'] for g in t_gpu]

    A['Customers'] = [
        ['CUST-001', 'Nimbus Analytics Pvt Ltd (sample)', 'Technology', 'Indore', 'Madhya Pradesh', 'Colo Standard 3 yr', 'N', 'Ritu Sharma', None],
        ['CUST-002', 'Kaveri FinServ Ltd (sample)', 'BFSI', 'Mumbai', 'Maharashtra', 'Colo Premium 5 yr', 'Y', 'Ritu Sharma', None],
        ['CUST-003', 'Shakti Games Studio (sample)', 'Gaming', 'Bengaluru', 'Karnataka', 'Colo Standard 2 yr', 'N', 'Arjun Mehta', None],
        ['CUST-004', 'Indus AI Labs (sample)', 'AI / ML', 'Bengaluru', 'Karnataka', 'AI cage + reserved cluster', 'Y', 'Arjun Mehta', None],
        ['CUST-005', 'Medisphere Health (sample)', 'Healthcare', 'Chennai', 'Tamil Nadu', 'On-demand GPU', 'N', 'Karthik Iyer', None],
        ['CUST-006', 'BharatStream Media (sample)', 'Media', 'Chennai', 'Tamil Nadu', 'CPU + storage', 'N', 'Karthik Iyer', None],
    ]
    sv = []
    def svc(cust, typ, site, qty, unit, rev, sla=99.95, crit='N', dev_=None, ifn=None, racks=None, gpus=None, bw=None, start=D(2025, 4, 1)):
        sv.append([f'SVC-{len(sv) + 1:04d}', cust, typ, site, dev_, ifn, racks, gpus, qty, unit, bw, sla, rev, crit, start])
    svc('CUST-001', 'Cabinet lease', M, 2, 'cabinets', 170000, racks=f'{M}-A02;{M}-A03')
    svc('CUST-001', 'Power circuit', M, 12, 'kW', 108000, racks=f'{M}-A02;{M}-A03')
    svc('CUST-001', 'Cross-connect', M, 1, 'Mbps', 6000, dev_=m_mmr[0], ifn='Ethernet1', bw=10000)
    svc('CUST-002', 'Cabinet lease', M, 1, 'cabinets', 95000, 99.99, 'Y', racks=f'{M}-A04')
    svc('CUST-002', 'Power circuit', M, 8, 'kW', 72000, 99.99, 'Y', racks=f'{M}-A04')
    svc('CUST-002', 'Cross-connect', M, 1, 'Mbps', 6000, 99.99, 'Y', dev_=m_mmr[1], ifn='Ethernet2', bw=10000)
    svc('CUST-002', 'Remote hands', M, 10, 'hours', 25000, 99.9)
    svc('CUST-003', 'Cabinet lease', M, 2, 'cabinets', 170000, racks=f'{M}-A05;{M}-A06')
    svc('CUST-003', 'Power circuit', M, 12, 'kW', 108000, racks=f'{M}-A05;{M}-A06')
    svc('CUST-004', 'Cabinet lease', M, 4, 'cabinets', 1800000, 99.99, 'Y', racks=';'.join(f'{M}-B0{i}' for i in range(1, 5)))
    svc('CUST-004', 'Power circuit', M, 160, 'kW', 1440000, 99.99, 'Y', racks=';'.join(f'{M}-B0{i}' for i in range(1, 5)))
    svc('CUST-004', 'Reserved cluster', T, 32, 'GPU', 4800000, 99.9, 'Y', dev_=t_gpu[0], gpus=';'.join(t_gpu[:4]), start=D(2025, 6, 1))
    svc('CUST-005', 'On-demand GPUs', T, 16, 'GPU', 2400000, 99.5, 'N', dev_=t_gpu[4], gpus=';'.join(t_gpu[4:6]), start=D(2025, 9, 1))
    svc('CUST-006', 'CPU instances', T, 128, 'vCPU', 320000, 99.9, 'N', dev_=t_cpu[0], start=D(2025, 3, 1))
    svc('CUST-006', 'Storage volume', T, 200, 'TB', 400000, 99.9, 'N', dev_=t_stg[0], start=D(2025, 3, 1))
    A['Services'] = sv

    # --- physical last mile: rack PDUs + cords, patch panels, trunks, cable paths, cooling coverage
    racks = {r[0]: r for r in A['Racks']}
    ups_of = {site: [u[0] for u in A['UPS'] if u[1] == site] for site in (M, T)}
    pdus, cords, panels, trunks, paths, cover = [], [], [], [], [], []
    for i, r in enumerate(A['Racks']):
        rid, site, kw = r[0], r[1], r[8]
        rating = next(x for x in [(7.4, 230, 1, 32, 'Raritan PX3 1-ph 32 A', 24), (11, 400, 3, 16, 'Raritan PX3 3-ph 16 A', 24), (22, 400, 3, 32, 'Raritan PX3 3-ph 32 A', 36), (43.6, 400, 3, 63, 'Raritan PX4 3-ph 63 A', 48), (86, 400, 3, 125, 'Starline busway tap-off 125 A', 48)] if x[0] >= kw) if kw <= 86 else (86, 400, 3, 125, 'Starline busway tap-off 125 A', 48)
        ua, ub = ups_of[site][1::2], ups_of[site][0::2]
        for side, ups, feed in (('A', ua, r[15]), ('B', ub, r[16])):
            pdus.append([f'{rid}-PDU-{side}', site, rid, side, 'AC', rating[4], rating[1], rating[2], rating[3], kw, rating[5], ups[i % len(ups)], feed])
    nxt = {}
    for d in A['Devices']:
        did, rid, role, owner = d[0], d[11], d[3], d[15]
        slots = ['Feed A', 'Feed B'] if owner == 'tenant' else ['PSU1', 'PSU2', 'PSU3', 'PSU4'] if role == 'GPU' else ['PSU1', 'PSU2']
        for k, slot in enumerate(slots):
            pid = f'{rid}-PDU-{"A" if k % 2 == 0 else "B"}'
            o = nxt.get(pid, 0) + 1; nxt[pid] = o
            cords.append([did, slot, pid, o, None, 3000 if role == 'GPU' else 1100 if role in ('Server', 'Storage') else 750 if owner == 'operator' else None])
    rack_of = {d[0]: d[11] for d in A['Devices']}
    odf_rack = {M: f'{M}-MMR-R01', T: f'{T}-MMR-R01'}
    pp_use, odf_use, trk_use, osp = {}, {M: 0, T: 0}, {}, {M: 0, T: 0}
    per_dev = {}
    for l in A['Links']:
        lid, a, z = l[0], l[1], l[3]
        for end, dv, other in (('A', a, z), ('Z', z, a)):
            site, rid = dv[:9], rack_of[dv]
            cord = f'{rid}-PC-{len(paths) + 1:04d}'
            if rack_of[other] == rid:
                paths.append([lid, end, dv, cord, None, None, None, None, None, None]); continue
            k = per_dev.get(dv, 0); per_dev[dv] = k + 1
            route = f'Tray route {k % 2 + 1}'
            pid = tid = pport = None
            if rid != odf_rack[site]:
                pp_use[rid] = pp_use.get(rid, 0) + 1; n = pp_use[rid]
                pid, pport = f'{rid}-PP-F{(n - 1) // 24 + 1}', (n - 1) % 24 + 1
                tid = f'{rid}-TRK-{k % 2 + 1}'; trk_use[tid] = (trk_use.get(tid, (0, route, rid, pid))[0] + 1, route, rid, pid)
            odf_use[site] += 1; on = odf_use[site]
            core = None
            if other[:9] != site: osp[site] += 1; core = osp[site]
            paths.append([lid, end, dv, cord, pid, pport, tid, f'{odf_rack[site]}-ODF-{(on - 1) // 24 + 1}', (on - 1) % 24 + 1, core])
    for rid, n in pp_use.items():
        for j in range((n - 1) // 24 + 1): panels.append([f'{rid}-PP-F{j + 1}', rid[:9], rid, f'PP-F{j + 1}', 'LC duplex', 'rack', 24])
    for site, n in odf_use.items():
        for j in range((n - 1) // 24 + 1): panels.append([f'{odf_rack[site]}-ODF-{j + 1}', site, odf_rack[site], f'ODF-{j + 1}', 'LC duplex', 'odf', 24])
    for tid, (n, route, rid, pid) in trk_use.items():
        trunks.append([tid, rid[:9], pid, f'{odf_rack[rid[:9]]}-ODF-1', 'MPO-24 OM4 trunk', 12 * ((n - 1) // 12 + 1), route, 35 if racks[rid][2].endswith(('MMR', 'NET')) else 60])
    for r in A['Racks']:
        units = [u for u in A['Cooling_Units'] if u[2] == r[2] and u[4] != 'CDU'] or [u for u in A['Cooling_Units'] if u[1] == r[1] and u[4] != 'CDU']
        cover.append([r[0], units[r[5] % len(units)][0] if units else None, r[14]])
    A['Rack_PDUs'], A['Power_Connections'], A['Patch_Panels'], A['Trunk_Cables'], A['Cable_Paths'], A['Cooling_Coverage'] = pdus, cords, panels, trunks, paths, cover

    # --- safety, lifecycle, maintenance, on-call (illustrative)
    rooms = [r for r in A['Rooms']]
    fz, lk, ap = [], [], []
    for r in rooms:
        site, rid, rname, rtype = r[0], r[2], r[3], r[4]
        plant = rtype in ('Plant room', 'UPS room', 'Battery room', 'NOC')
        fz.append([f'{rid}-FZ', site, rid, 'Point smoke + heat' if plant else 'VESDA aspirating', 'Pre-action sprinkler' if plant else 'Novec 1230 gas', 'Armed (auto)', D(2026, 8, 20), f'FIRE.{rid[-5:]}'])
        units = [u for u in A['Cooling_Units'] if u[2] == rid]
        if units: lk.append([f'{rid}-LK', site, rid, 'Under ' + ', '.join(u[3] for u in units), 8 * len(units), D(2026, 7, 15)])
        ap.append([f'{rid}-DR', site, f'{rname} door', rid, 'Plant room door' if plant else 'Meet-me room door' if rtype == 'Meet-me room' else 'Data hall door', 'Card + PIN' if plant else 'Card + biometric', None])
    for site in (M, T): ap.insert(0, [f'{site}-DR-ENTRY', site, 'Main entrance · mantrap', None, 'Building entry', 'Card + biometric', None])
    for rack, cust, _ in tenants_m: ap.append([f'{M}-{rack}-CAGE', M, f'Cage {rack}', f'{M}-HALLB' if rack.startswith('B') else f'{M}-HALLA', 'Cage door', 'Card + PIN', cust])
    A['Fire_Systems'], A['Leak_Detection'], A['Access_Points'] = fz, lk, ap
    vendors = sorted({(d[1], d[5]) for d in A['Devices'] if d[15] == 'operator'})
    A['Support_Contracts'] = [[f'AMC-{site[:2]}-{i + 1:03d}', site, v, '24×7×4' if v in ('Juniper', 'NVIDIA', 'Supermicro', 'VAST Data') else 'NBD', D(2025, 4, 1), D(2027, 3, 31)] for i, (site, v) in enumerate(vendors)]
    cid = {(c[1], c[2]): c[0] for c in A['Support_Contracts']}
    A['Asset_Lifecycle'] = [[d[0], D(2025, 3, 1) if d[1] == T else D(2022, 3, 15), D(2028, 3, 1) if d[1] == T else D(2025, 3, 15), cid.get((d[1], d[5]))] for d in A['Devices'] if d[15] == 'operator']
    A['Model_Lifecycle'] = sorted({(d[5], d[6]) for d in A['Devices'] if d[15] == 'operator'})
    A['Model_Lifecycle'] = [[v, m, D(2029, 6, 30), D(2034, 6, 30)] for v, m in A['Model_Lifecycle']]
    A['Spares'] = [[M, 'Juniper power supply', 'Border routers', 2, 1], [M, 'QSFP28-100G-LR4', 'optics', 4, 2], [M, 'SFP-10G-LR', 'optics', 6, 2],
                   [T, 'OSFP-400G-SR4', 'optics', 8, 4], [T, 'Supermicro power supply', 'GPU nodes', 4, 2], [T, 'H200 SXM 141 GB board', 'GPU nodes', 1, 1], [T, 'NVMe 7.68 TB', 'storage', 6, 2]]
    pm = []
    def pmr(site, asset, kind, task, every, last): pm.append([f'{site}-PM-{len(pm) + 1:03d}', site, asset, kind, task, every, last, 'Facility team'])
    for u in A['UPS']: pmr(u[1], u[0], 'UPS', 'Quarterly inspection and thermal scan', 91, D(2026, 8, 12)); pmr(u[1], u[0], 'Battery', 'Battery string impedance test', 182, D(2026, 5, 5))
    for g in A['Generators']: pmr(g[1], g[0], 'Generator', 'Monthly on-load run', 30, g[6]); pmr(g[1], g[0], 'Generator', 'Annual load-bank test', 365, D(2026, 2, 10))
    for c in A['Cooling_Units']: pmr(c[1], c[0], 'CDU' if c[4] == 'CDU' else 'Cooling', 'Coolant quality and filter change' if c[4] == 'CDU' else 'Filter change and coil clean', 91, D(2026, 7, 28))
    for f in fz: pmr(f[1], f[0], 'Fire', 'Quarterly fire-system inspection', 91, f[6])
    A['PM_Plan'] = pm
    A['On_Call'] = [[reg, role, name, tier, esc, None] for reg, people in (('Central', ['Ritu Sharma', 'Arjun Mehta', 'Neha Gupta', 'Imran Khan', 'Suresh Rao']), ('South', ['Karthik Iyer', 'Divya Menon', 'Prakash Nair', 'Lakshmi Raman', 'Suresh Rao']))
                    for (role, tier, esc), name in zip([('NOC shift lead', 1, 15), ('Network engineer', 2, 30), ('Facility engineer', 2, 30), ('Field technician', 2, 60), ('Duty manager', 3, 60)], people)]

# ---------------------------------------------------------------- workbook
NAVY, BLUE, GREY, AMBER, GREEN = '1F3A5F', '2E6BD9', 'E7ECF3', 'FCE8C3', 'DDF2E3'
thin = Side(style='thin', color='C9D2DE')
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
F_REQ = PatternFill('solid', fgColor=NAVY); F_OPT = PatternFill('solid', fgColor='5B6B80'); F_CON = PatternFill('solid', fgColor='B7791F'); F_CALC = PatternFill('solid', fgColor='2F855A')
F_CALC_CELL = PatternFill('solid', fgColor=GREEN)
wb = Workbook()

# README
ws = wb.active; ws.title = 'README'
ws.sheet_view.showGridLines = False
lines = [
    ((('SynapseDC · Sample data for two datacenters · ' if SAMPLE else 'DCO · Datacenter data backup · ') + {'network': 'Network operator', 'colocation': 'Colocation', 'cloud': 'Cloud', 'enterprise': 'Enterprise', 'neocloud': 'NeoCloud'}[META[0]] + ' · ' + {'in': 'India', 'us': 'USA'}[META[1]] + (f' · {SAMPLE}' if SAMPLE else '')) if BACKUP else 'DCO · Datacenter inventory import template', 'h1'),
    *([(f'A complete, end-to-end export of {SAMPLE} as the platform holds them (data clock {META[2]} UTC): the two sites, their floors, rooms, racks, power and cooling plant, every device with its ports, the cables between them, GPU clusters, the customers served there and their services, plus the physical, safety, lifecycle and maintenance records. Only links whose two ends are in these sites and only customers who buy something there are included. Use it as the worked example for the import template: every sheet is filled exactly the way the customer should fill it for their own datacenters, the Summary sheet shows what the platform will then display. Snapshot_* sheets keep the alarms, incidents and changes of that moment for the record; they are not imported.' if SAMPLE else f'Backup of the complete mock estate as the tool holds it (data clock {META[2]} UTC). Same layout as the import template, so it can be re-imported as is. Snapshot_* sheets keep the alarms, incidents and changes of that moment for the record; they are not imported.', 'p')] if BACKUP else []),
    ('Version 1.0 · 12-Oct-2026 · matches the DCO data model (app/src/api/types.ts)', 'sub'),
    ('', None),
    ('What this workbook is for', 'h2'),
    ('Use it to collect everything the DCO platform needs to know about a customer\'s datacenters BEFORE monitoring is switched on: sites, floors, rooms, racks, power and cooling plant, sensors, every racked device, its ports and cables, GPU clusters, customers and the services they buy, and the monitoring sources.', 'p'),
    *([] if BACKUP else [('The two example sites (RackBank Indore DC1 = colocation with AI cages, RackBank Chennai AI-1 = GPU cloud) are ILLUSTRATIVE sample data. Replace them, or keep them as a reference and delete before import.', 'p')]),
    ('', None),
    ('How to fill it', 'h2'),
    ('1. Fill the sheets in tab order. A sheet can only point at IDs that exist in the sheets before it (Sites → Floors → Rooms → Racks → … → Services).', 'p'),
    ('2. Row 1 holds the import keys. Don\'t rename, reorder or delete columns. Hover over a header for its meaning; the Field_Dictionary sheet lists every field.', 'p'),
    ('3. Header colours: dark blue = required · amber = required in some cases (see the note) · grey = optional · green = calculated by a formula (don\'t type it).', 'p'),
    ('4. Columns with a fixed set of values have a dropdown (from the Lookups sheet). Dates use YYYY-MM-DD. Numbers are plain, with no units in the cell. Lists inside a cell use ";".', 'p'),
    ('5. IDs must be unique and stable: the system keys every alarm, incident and revenue figure on them. Recommended: site XX-DC-NNN, then <site>-<object> (MP-DC-001-A01).', 'p'),
    ('6. Check the Summary sheet when you finish. Every count must match what the customer expects, and the checks column must say OK.', 'p'),
    ('', None),
    ('What to ask the customer for (and where it usually lives)', 'h2'),
    ('Sites, floors, rooms: facility master list, floor plans (DCIM or CAD).  ·  Racks: DCIM rack elevations or the space-and-power schedule.  ·  Power and cooling plant: single-line diagram, BMS / EPMS asset register, maintenance contracts.', 'p'),
    ('Devices, modules: CMDB or DCIM asset export (hostname, serial, rack, U).  ·  Interfaces, links: cabling schedule or patch-panel / ODF records, plus LLDP exports for verification.  ·  GPU clusters: scheduler config (Slurm partitions / Kubernetes node pools).', 'p'),
    ('Customers, services: CRM or billing (contract, monthly charge, SLA, premium flag).  ·  Collectors: the NOC\'s monitoring design (SNMP / gNMI pollers, BMS gateway, Redfish, DCGM exporter).', 'p'),
    ('', None),
    ('What NOT to put here (it arrives live from the collectors)', 'h2'),
    ('Current power draw, UPS load %, battery state, temperatures, humidity, CDU flow, interface up / down, utilisation, errors, optics levels, CPU / memory, GPU telemetry (DCGM), alarms, incidents and job state. The template carries only the static master data those readings attach to.', 'p'),
    ('', None),
    ('Sheet order and the system object each one fills', 'h2'),
]
for t, kind in lines:
    ws.append([t])
    c = ws.cell(ws.max_row, 1)
    if kind == 'h1': c.font = Font(name='Calibri', size=18, bold=True, color=NAVY)
    elif kind == 'sub': c.font = Font(size=10, italic=True, color='5B6B80')
    elif kind == 'h2': c.font = Font(size=12, bold=True, color=BLUE)
    elif kind == 'p': c.alignment = Alignment(wrap_text=True, vertical='top'); ws.row_dimensions[ws.max_row].height = 32
ws.append(['Sheet', 'System object', 'What goes in it', 'Example rows'])
hr = ws.max_row
for i in range(1, 5):
    ws.cell(hr, i).font = Font(bold=True, color='FFFFFF'); ws.cell(hr, i).fill = F_REQ
for name in ORDER:
    obj, what, _ = S[name]
    ws.append([name, obj, what, len(rows[name])])
    ws.cell(ws.max_row, 1).hyperlink = f'#\'{name}\'!A1'; ws.cell(ws.max_row, 1).font = Font(color=BLUE, underline='single')
    for i in range(1, 5): ws.cell(ws.max_row, i).border = BOX; ws.cell(ws.max_row, i).alignment = Alignment(wrap_text=True, vertical='top')
for name in ('Summary', 'Field_Dictionary', 'Lookups'):
    ws.append([name, '—', {'Summary': 'Counts per site and the reconciliation checks (formulas).', 'Field_Dictionary': 'Every column: required, type, allowed values, the system field it maps to.', 'Lookups': 'Allowed values behind the dropdowns.'}[name], ''])
    ws.cell(ws.max_row, 1).hyperlink = f'#\'{name}\'!A1'; ws.cell(ws.max_row, 1).font = Font(color=BLUE, underline='single')
    for i in range(1, 5): ws.cell(ws.max_row, i).border = BOX
ws.column_dimensions['A'].width = 22; ws.column_dimensions['B'].width = 38; ws.column_dimensions['C'].width = 90; ws.column_dimensions['D'].width = 13
for r in range(1, hr):
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)

# Summary (placed before data sheets, formulas reference them)
sm = wb.create_sheet('Summary')

# Lookups
lk = wb.create_sheet('Lookups')
for ci, (k, vals) in enumerate(LOOK.items(), start=1):
    lk.cell(1, ci, k).font = Font(bold=True, color='FFFFFF'); lk.cell(1, ci).fill = F_REQ
    for ri, v in enumerate(vals, start=2): lk.cell(ri, ci, v)
    lk.column_dimensions[col(ci)].width = max(14, max(len(str(v)) for v in vals + [k]) + 2)
    wb.defined_names[f'L_{k}'] = DefinedName(f'L_{k}', attr_text=f"Lookups!${col(ci)}$2:${col(ci)}${len(vals) + 1}")
lk.freeze_panes = 'A2'

# data sheets
MAXR = max(2000, max(len(v) for v in rows.values()) + 50)
key_col = {}
for name in ORDER:
    obj, what, spec = S[name]
    sh = wb.create_sheet(name)
    for ci, (k, req, typ, lookup, maps, desc) in enumerate(spec, start=1):
        label = k + (' *' if req == 'Y' else '')
        c = sh.cell(1, ci, label)
        c.font = Font(bold=True, color='FFFFFF'); c.alignment = Alignment(vertical='center', wrap_text=True); c.border = BOX
        c.fill = {'Y': F_REQ, 'N': F_OPT, 'C': F_CON, 'F': F_CALC}[req]
        note = f'{desc}\n\nRequired: ' + {'Y': 'yes', 'N': 'no', 'C': 'in some cases', 'F': 'calculated'}[req] + f'\nType: {typ}' + (f' (from {lookup})' if lookup else '') + f'\nSystem field: {maps}'
        cm = Comment(note.strip(), 'DCO template'); cm.width = 320; cm.height = 160; c.comment = cm
        if typ == 'list':
            dv = DataValidation(type='list', formula1=f'=L_{lookup}', allow_blank=True, showErrorMessage=True, errorTitle='Not an allowed value', error=f'Pick a value from the list (Lookups → {lookup}).')
            sh.add_data_validation(dv); dv.add(f'{col(ci)}2:{col(ci)}{MAXR}')
    for r in rows[name]:
        sh.append(r)
    for ci, (k, req, typ, *_r) in enumerate(spec, start=1):
        if typ == 'date':
            for r in range(2, len(rows[name]) + 2): sh.cell(r, ci).number_format = 'yyyy-mm-dd'
    sh.freeze_panes = 'B2'
    sh.auto_filter.ref = f'A1:{col(len(spec))}{max(2, len(rows[name]) + 1)}'
    sh.row_dimensions[1].height = 30
    for ci, (k, *_rest) in enumerate(spec, start=1):
        vals = [len(str(k)) + 3] + [len(str(r[ci - 1])) for r in rows[name][:200] if ci - 1 < len(r) and r[ci - 1] is not None]
        sh.column_dimensions[col(ci)].width = min(48, max(10, max(vals) + 2))
    key_col[name] = {k.split(' ')[0]: col(ci) for ci, (k, *_r) in enumerate(spec, start=1)}

def rng(sheet, key):
    c = key_col[sheet][key]
    return f"'{sheet}'!${c}$2:${c}${MAXR}"

# formulas for the calculated columns
rs = wb['Racks']; c_used = key_col['Racks']['used_u']
for r in range(2, len(rows['Racks']) + 2):
    rs[f'{c_used}{r}'] = f"=SUMIF({rng('Devices', 'rack_id')},A{r},{rng('Devices', 'u_size')})"; rs[f'{c_used}{r}'].fill = F_CALC_CELL
cs = wb['Customers']; c_rev = key_col['Customers']['monthly_revenue']
for r in range(2, len(rows['Customers']) + 2):
    cs[f'{c_rev}{r}'] = f"=SUMIF({rng('Services', 'customer_id')},A{r},{rng('Services', 'monthly_revenue')})"; cs[f'{c_rev}{r}'].fill = F_CALC_CELL; cs[f'{c_rev}{r}'].number_format = '#,##0'
cd = wb['CDUs']; c_rk = key_col['CDUs']['racks_served']
for r in range(2, len(rows['CDUs']) + 2):
    cd[f'{c_rk}{r}'] = f"=COUNTIF({rng('Racks', 'cdu_id')},A{r})"; cd[f'{c_rk}{r}'].fill = F_CALC_CELL
gc = wb['GPU_Clusters']; c_nc = key_col['GPU_Clusters']['node_count']
for r in range(2, len(rows['GPU_Clusters']) + 2):
    gc[f'{c_nc}{r}'] = f"=COUNTIF({rng('GPU_Nodes', 'cluster_id')},A{r})"; gc[f'{c_nc}{r}'].fill = F_CALC_CELL
wb['Services'][f"{key_col['Services']['monthly_revenue']}1"].number_format = '#,##0'
for r in range(2, len(rows['Services']) + 2): wb['Services'][f"{key_col['Services']['monthly_revenue']}{r}"].number_format = '#,##0'

# Summary: per-site counts + checks
sm.sheet_view.showGridLines = False
sm['A1'] = 'Summary and reconciliation checks'; sm['A1'].font = Font(size=16, bold=True, color=NAVY)
sm['A2'] = 'Every figure is a formula over the data sheets. Check it with the customer: these are the numbers the platform will show.'; sm['A2'].font = Font(italic=True, color='5B6B80')
NS = max(6, len(rows['Sites']))  # site columns on the Summary (the first six rows of Sites)
sites = list(range(NS))
for ci, h in enumerate(['Measure'] + [None] * NS + ['Total'], start=1):
    c = sm.cell(4, ci, h if h else f"=IF('Sites'!A{ci}=\"\",\"(site {ci - 1})\",'Sites'!A{ci})"); c.font = Font(bold=True, color='FFFFFF'); c.fill = F_REQ; c.border = BOX
SC = lambda j: f'{col(2 + j)}$4'
def wrap(j, f): return f'=IF(\'Sites\'!$A${j + 2}="","",{f})'
def site_count(sheet, key='site_id'):
    return lambda j: wrap(j, f"COUNTIF({rng(sheet, key)},{SC(j)})")
def dev_count(role=None, owner=None):
    def f(j):
        cond = f"{rng('Devices', 'site_id')},{SC(j)}"
        if role: cond += f",{rng('Devices', 'role')},\"{role}\""
        if owner: cond += f",{rng('Devices', 'owner')},\"{owner}\""
        return wrap(j, f'COUNTIFS({cond})')
    return f
def site_sum(sheet, val):
    return lambda j: wrap(j, f"SUMIF({rng(sheet, 'site_id')},{SC(j)},{rng(sheet, val)})")
def net(j):
    return wrap(j, '+'.join(f"COUNTIFS({rng('Devices', 'site_id')},{SC(j)},{rng('Devices', 'role')},\"{x}\")" for x in ('Router', 'Firewall', 'Switch')))
measures = [
    ('Floors', site_count('Floors')), ('Rooms', site_count('Rooms')), ('Racks', site_count('Racks')),
    ('  of which tenant cabinets', lambda j: wrap(j, f"COUNTIFS({rng('Racks', 'site_id')},{SC(j)},{rng('Racks', 'owner')},\"tenant\")")),
    ('  of which AI / high-density', lambda j: wrap(j, f"COUNTIFS({rng('Racks', 'site_id')},{SC(j)},{rng('Racks', 'density')},\"ai\")")),
    ('Rack power budget (kW)', site_sum('Racks', 'power_budget_kw')),
    ('Site IT capacity (kW)', site_sum('Sites', 'it_capacity_kw')),
    ('Devices (all)', dev_count()), ('  operator devices', dev_count(owner='operator')), ('  tenant gear blocks', dev_count(owner='tenant')),
    ('  GPU nodes', dev_count('GPU')), ('  network (routers, firewalls, switches)', net),
    ('UPS units', site_count('UPS')), ('UPS capacity (kW)', site_sum('UPS', 'capacity_kw')), ('Generators', site_count('Generators')),
    ('Cooling units', site_count('Cooling_Units')), ('Cooling unit capacity (kW)', site_sum('Cooling_Units', 'capacity_kw')), ('Sensors', site_count('Sensors')),
    ('Collectors', site_count('Collectors')), ('Services', site_count('Services')), ('Services monthly revenue (₹)', site_sum('Services', 'monthly_revenue')),
]
r0 = 5
for i, (label, fn) in enumerate(measures):
    r = r0 + i
    sm.cell(r, 1, label).border = BOX
    for j in sites:
        c = sm.cell(r, 2 + j, fn(j)); c.border = BOX; c.number_format = '#,##0'
    tc = sm.cell(r, 2 + NS, f'=SUM({col(2)}{r}:{col(1 + NS)}{r})'); tc.border = BOX; tc.font = Font(bold=True); tc.number_format = '#,##0'
r = r0 + len(measures) + 2
sm.cell(r, 1, 'Checks').font = Font(size=12, bold=True, color=BLUE)
r += 1
for ci, h in enumerate(['Check', 'Result', 'Why it matters'], start=1):
    c = sm.cell(r, ci, h); c.font = Font(bold=True, color='FFFFFF'); c.fill = F_REQ
ND, NR = len(rows['Devices']) + 1, len(rows['Racks']) + 1
checks = [
    ('Every device sits in a rack that exists', f"=IF(SUMPRODUCT(--(COUNTIF({rng('Racks', 'rack_id')},'Devices'!$L$2:$L${ND})=0))=0,\"OK\",\"FIX: unknown rack_id\")", 'The twin and rack views place devices by rack_id.'),
    ('No rack is over-filled (used U ≤ height U)', f"=IF(SUMPRODUCT(--('Racks'!${c_used}$2:${c_used}${NR}>'Racks'!$H$2:$H${NR}))=0,\"OK\",\"FIX: rack over capacity\")", 'used_u is calculated from Devices.'),
    ('Device IDs are unique', f"=IF(SUMPRODUCT(--(COUNTIF('Devices'!$A$2:$A${ND},'Devices'!$A$2:$A${ND})>1))=0,\"OK\",\"FIX: duplicate device_id\")", 'Alarms and incidents key on the device ID.'),
    ('Operator serial numbers are unique', f"=IF(SUMPRODUCT(('Devices'!$I$2:$I${ND}<>\"\")*(COUNTIF('Devices'!$I$2:$I${ND},'Devices'!$I$2:$I${ND})>1))=0,\"OK\",\"FIX: duplicate serial\")", 'Discovery matches the polled serial against this one.'),
    ('Tenant racks name a tenant and contracted kW', f"=IF(COUNTIFS('Racks'!$J$2:$J${NR},\"tenant\",'Racks'!$K$2:$K${NR},\"\")+COUNTIFS('Racks'!$J$2:$J${NR},\"tenant\",'Racks'!$L$2:$L${NR},\"\")=0,\"OK\",\"FIX: tenant rack missing data\")", 'Colocation power-over-contract is measured against it.'),
    ('Liquid racks name a CDU', f"=IF(COUNTIFS('Racks'!$N$2:$N${NR},\"Y\",'Racks'!$O$2:$O${NR},\"\")=0,\"OK\",\"FIX: liquid rack without CDU\")", 'A CDU fault is traced to the racks it feeds.'),
    ('Rack budget fits site IT capacity', f'=IF(SUMPRODUCT(--({col(2)}{r0 + 5}:{col(1 + NS)}{r0 + 5}>{col(2)}{r0 + 6}:{col(1 + NS)}{r0 + 6}))=0,"OK","CHECK: racks exceed IT capacity")', 'Power and space views compare the two.'),
    ('GPU nodes = GPU devices in service', f"=IF(COUNTA('GPU_Nodes'!$A$2:$A${MAXR})=COUNTIFS({rng('Devices', 'role')},\"GPU\",{rng('Devices', 'monitored')},\"Y\"),\"OK\",\"FIX: GPU_Nodes and Devices differ\")", 'Each GPU node in service needs a rack position and a telemetry record; hosts not yet commissioned into a cluster have none.'),
    ('Every installed device has a power connection', f"=IF(SUMPRODUCT(('Devices'!$O$2:$O${ND}<>\"Planned\")*('Devices'!$A$2:$A${ND}<>\"\")*(COUNTIF({rng('Power_Connections', 'device_id')},'Devices'!$A$2:$A${ND})=0))=0,\"OK\",\"FIX: device without a power cord\")", 'Without it the power path, single-fed devices and UPS / PDU what-ifs cannot be traced.'),
    ('Power cords point at a known PDU', f"=IF(SUMPRODUCT(({rng('Power_Connections', 'pdu_id')}<>\"\")*(COUNTIF({rng('Rack_PDUs', 'pdu_id')},{rng('Power_Connections', 'pdu_id')})=0))=0,\"OK\",\"FIX: unknown pdu_id\")", 'The outlet map and failover check group cords by PDU.'),
    ('Every rack has an A and a B PDU', f"=IF(SUMPRODUCT(('Racks'!$A$2:$A${NR}<>\"\")*((COUNTIFS({rng('Rack_PDUs', 'rack_id')},'Racks'!$A$2:$A${NR},{rng('Rack_PDUs', 'side')},\"A\")=0)+(COUNTIFS({rng('Rack_PDUs', 'rack_id')},'Racks'!$A$2:$A${NR},{rng('Rack_PDUs', 'side')},\"B\")=0)))=0,\"OK\",\"CHECK: rack with one power side\")", 'A cabinet with one side is a single point of failure for everything in it.'),
    ('Cable paths name a known link', f"=IF(SUMPRODUCT(({rng('Cable_Paths', 'link_id')}<>\"\")*(COUNTIF({rng('Links', 'link_id')},{rng('Cable_Paths', 'link_id')})=0))=0,\"OK\",\"FIX: unknown link_id\")", 'Each cable path belongs to one link end.'),
    ('Every operator device has warranty / support data', f"=IF(SUMPRODUCT(('Devices'!$P$2:$P${ND}=\"operator\")*('Devices'!$O$2:$O${ND}<>\"Planned\")*(COUNTIF({rng('Asset_Lifecycle', 'device_id')},'Devices'!$A$2:$A${ND})=0))=0,\"OK\",\"CHECK: device without lifecycle row\")", 'Warranty, contract and end-of-support flags need it.'),
    ('Every room has a fire system', f"=IF(SUMPRODUCT(('Rooms'!$C$2:$C${len(rows['Rooms']) + 1}<>\"\")*(COUNTIF({rng('Fire_Systems', 'room_id')},'Rooms'!$C$2:$C${len(rows['Rooms']) + 1})=0))=0,\"OK\",\"CHECK: room without fire protection\")", 'Fire detection / suppression and its inspection plan are tracked per room.'),
    ('Customer revenue = sum of services', f"=IF(ROUND(SUM('Customers'!${c_rev}$2:${c_rev}${MAXR})-SUM({rng('Services', 'monthly_revenue')}),0)=0,\"OK\",\"FIX: a service names an unknown customer\")", 'Revenue impact adds up only if every service has a customer.'),
]
for label, f, why in checks:
    r += 1
    sm.cell(r, 1, label).border = BOX; c = sm.cell(r, 2, f); c.border = BOX; c.font = Font(bold=True, color='2F855A'); sm.cell(r, 3, why).border = BOX
sm.column_dimensions['A'].width = 46
for j in range(NS + 1): sm.column_dimensions[col(2 + j)].width = 15

# Field dictionary
fd = wb.create_sheet('Field_Dictionary')
fh = ['Sheet', 'Column', 'Required', 'Type', 'Allowed values', 'System field (types.ts)', 'Description', 'Example']
for ci, h in enumerate(fh, start=1):
    c = fd.cell(1, ci, h); c.font = Font(bold=True, color='FFFFFF'); c.fill = F_REQ
for name in ORDER:
    for ci, (k, req, typ, lookup, maps, desc) in enumerate(S[name][2]):
        ex = next((r[ci] for r in rows[name] if ci < len(r) and r[ci] not in (None, '')), '')
        allowed = ', '.join(LOOK[lookup]) if typ == 'list' else (f'an ID from {lookup}' if typ == 'ref' else '')
        fd.append([name, k, {'Y': 'Required', 'N': 'Optional', 'C': 'Conditional', 'F': 'Calculated'}[req], typ, allowed, maps, desc, str(ex) if ex != '' else ''])
        fd.cell(fd.max_row, 7).alignment = Alignment(wrap_text=True, vertical='top'); fd.cell(fd.max_row, 5).alignment = Alignment(wrap_text=True, vertical='top')
for ci, w in enumerate([16, 24, 12, 10, 40, 34, 60, 28], start=1): fd.column_dimensions[col(ci)].width = w
fd.freeze_panes = 'C2'; fd.auto_filter.ref = f'A1:H{fd.max_row}'

# order: README, Summary, data sheets..., Field_Dictionary, Lookups
order = ['README', 'Summary'] + ORDER + ['Field_Dictionary', 'Lookups']
wb._sheets = [wb[n] for n in order]
for n in ORDER: wb[n].sheet_properties.tabColor = '2E6BD9'
wb['README'].sheet_properties.tabColor = NAVY; wb['Summary'].sheet_properties.tabColor = '2F855A'
wb.save(OUT)
print('saved', OUT, {k: len(v) for k, v in rows.items()})
