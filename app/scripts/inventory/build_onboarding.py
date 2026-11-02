"""SynapseDC customer onboarding template (colocation or NeoCloud): the minimum a customer must send to onboard a datacenter.
Nine data sheets instead of the full import template's 35: everything the platform discovers itself (ports, links, optics, modules,
live readings) or takes from integrations later (BMS points, sensors, access control, ITSM, warranty) is left out.

usage (from app/):
  npx tsx scripts/inventory/export_backup.ts colocation in /tmp/colo.json MH-DC-001,MH-DC-002
  python scripts/inventory/build_onboarding.py out.xlsx /tmp/colo.json      (needs openpyxl)
  NeoCloud: export neocloud instead; the workbook then has no tenant columns and adds GPU_Clusters + GPU_Nodes.
Without the json the sheets are empty (blank template; a 3rd argument `neocloud` picks that variant)."""
import sys, json, datetime as D
from collections import Counter, defaultdict
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.comments import Comment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter as col

OUT = sys.argv[1]
SRC = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None
PERSONA = SRC['_meta'][0][0] if SRC else (sys.argv[3] if len(sys.argv) > 3 else 'colocation')
NEO = PERSONA == 'neocloud'
MAXR = 3000
NAVY, BLUE, GREY, AMBER, GREEN = '1F3A5F', '2B6CB0', '5B6B80', 'B7791F', '2F855A'
F = lambda c: PatternFill('solid', fgColor=c)
THIN = Side(style='thin', color='D5DCE6'); BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

# ------------------------------------------------------------------ lookups (dropdowns)
LOOK = {
    'site_status': ['Live', 'Being built', 'Planned'],
    'tier': ['Tier I', 'Tier II', 'Tier III', 'Tier IV'],
    'room_type': ['Data hall', 'AI hall', 'Meet-me room', 'Network room', 'NOC', 'Plant room'],
    'cooling_method': ['Air', 'Liquid', 'Hybrid'],
    'cabinet_purpose': ['Tenant cabinet', 'AI cage', 'Private cage', 'Meet-me room', 'Core network', 'Access network', 'Operator servers', 'ODF / patching'],
    'owner': ['operator', 'tenant'],
    'yn': ['Y', 'N'],
    'plant_type': ['Utility feed', 'UPS', 'Generator', 'Rectifier', 'Battery bank'],
    'capacity_unit': ['kW', 'kVA'],
    'redundancy': ['Active', 'Standby', 'N', 'N+1', '2N', '2N+1'],
    'pdu_side': ['A', 'B'],
    'cooling_type': ['CRAH', 'CRAC', 'In-row', 'Rear-door', 'CDU', 'Chiller'],
    'device_role': ['Router', 'Switch', 'Firewall', 'DWDM', 'Server', 'Storage', 'Console server', 'Load balancer'],
    'segment': ['Hyperscaler', 'Cloud', 'Carrier', 'BFSI', 'Enterprise', 'Media', 'Government', 'Healthcare', 'Retail', 'Other'],
    'service_type': ['Cabinet lease', 'Private cage', 'Power circuit', 'Cross-connect', 'Remote hands'],
    'service_unit': ['cabinets', 'kW', 'Mbps', 'hours'],
}

# ------------------------------------------------------------------ sheets: (key, need, kind, lookup / ref, description, mapping)
# need: R = required, C = required in some cases (see the description), O = optional
SHEETS = {
 'Sites': ('One row per datacenter.', [
    ('site_id', 'R', 'text', '', 'Your unique, stable code for the site. Recommended: <state>-DC-<nnn>, e.g. MH-DC-001.', 'Datacenter.id'),
    ('site_name', 'R', 'text', '', 'Name your teams and customers use.', 'Datacenter.name'),
    ('status', 'R', 'list', 'site_status', 'Live = in service; Being built = under construction or commissioning; Planned = not started.', 'Datacenter.status'),
    ('tier', 'R', 'list', 'tier', 'Uptime / TIA-942 rating (design or certified).', 'Datacenter.tier'),
    ('state', 'R', 'text', '', 'State or union territory.', 'Datacenter.state'),
    ('city', 'R', 'text', '', '', 'Datacenter.city'),
    ('address', 'R', 'text', '', 'Street address or campus name.', 'Datacenter.address'),
    ('latitude', 'R', 'number', '', 'Decimal degrees (map pin).', 'Datacenter.lat'),
    ('longitude', 'R', 'number', '', 'Decimal degrees.', 'Datacenter.lng'),
    ('commissioned_on', 'C', 'date', '', 'Required when status = Live. YYYY-MM-DD.', 'Datacenter.commissionedOn'),
    ('it_capacity_kw', 'R', 'number', '', 'Design IT load the site can carry (kW).', 'Datacenter.power.capacityKw'),
    ('cooling_capacity_kw', 'R', 'number', '', 'Installed cooling capacity (kW of heat).', 'Datacenter.cooling.capacityKw'),
    ('design_pue', 'O', 'number', '', 'Design or last measured PUE, e.g. 1.5.', 'Datacenter.power.pue'),
 ]),
 'Rooms': ('Every room that holds cabinets or plant, with the floor it is on.', [
    ('room_id', 'R', 'text', '', 'Unique code, e.g. MH-DC-001-F0-R1.', 'Room id'),
    ('site_id', 'R', 'ref', 'Sites', 'Site the room is in.', 'Datacenter.floors'),
    ('floor_name', 'R', 'text', '', 'e.g. Ground, 1st floor.', 'Floor.name'),
    ('floor_level', 'R', 'integer', '', '0 = ground, 1 = first floor, -1 = basement.', 'Floor index'),
    ('room_name', 'R', 'text', '', 'e.g. Hall A, Meet-me room.', 'Rack.room'),
    ('room_type', 'R', 'list', 'room_type', '', 'Room kind'),
    ('cooling_method', 'R', 'list', 'cooling_method', 'Air, liquid (direct-to-chip / CDU) or both.', 'Room cooling'),
 ]),
 'Cabinets': ('Every cabinet / rack, operator and tenant. For tenant cabinets you do not list what is inside.', [
    ('cabinet_id', 'R', 'text', '', 'Unique code, e.g. MH-DC-001-RACK-C.', 'Rack.id'),
    ('site_id', 'R', 'ref', 'Sites', '', 'Rack.dcId'),
    ('room_id', 'R', 'ref', 'Rooms', 'Room the cabinet stands in.', 'Rack.floor / room'),
    ('cabinet_name', 'R', 'text', '', 'Label on the cabinet.', 'Rack.name'),
    ('purpose', 'R', 'list', 'cabinet_purpose', '', 'Rack.role'),
    ('height_u', 'R', 'integer', '', 'Usable rack units, e.g. 42 or 45.', 'Rack.heightU'),
    ('power_budget_kw', 'R', 'number', '', 'Power the cabinet is designed / allowed to draw (kW).', 'Rack.budgetKw'),
    ('owner', 'R', 'list', 'owner', 'operator = your own equipment; tenant = leased to a customer.', 'Rack.owner'),
    ('customer_id', 'C', 'ref', 'Customers', 'Required when owner = tenant.', 'Rack.tenantId'),
    ('contracted_kw', 'C', 'number', '', 'Required when owner = tenant: power in the customer contract (kW).', 'Rack.contractedKw'),
    ('liquid_cooled', 'R', 'list', 'yn', 'Y when the cabinet is on a CDU loop.', 'Rack.liquid'),
    ('cdu_id', 'C', 'ref', 'Cooling_Units', 'Required when liquid_cooled = Y: the CDU from Cooling_Units.', 'GpuCdu.racks'),
    ('tenant_u_used', 'O', 'integer', '', 'Tenant cabinets: rack units in use, if you know them (space reporting).', 'Rack.usedU'),
 ]),
 'Power_Plant': ('Utility feeds, UPS modules, generators and DC plant (rectifiers, battery banks) per site.', [
    ('asset_id', 'R', 'text', '', 'Unique code, e.g. MH-DC-001-UPS-1.', 'PowerFeed / Ups / Dg id'),
    ('site_id', 'R', 'ref', 'Sites', '', 'Datacenter.power'),
    ('asset_type', 'R', 'list', 'plant_type', '', 'power.feeds / ups / dg / battery'),
    ('name', 'R', 'text', '', 'Name on the single-line diagram, e.g. UPS-1, Utility feed A.', 'name / source'),
    ('capacity', 'R', 'number', '', 'Rated capacity.', 'capacityKw / kva'),
    ('capacity_unit', 'R', 'list', 'capacity_unit', 'kW, or kVA for generators.', ''),
    ('redundancy', 'R', 'list', 'redundancy', 'Feeds: Active / Standby. UPS: the redundancy of the UPS system (N+1, 2N).', 'Ups.redundancy / feed state'),
    ('autonomy_min', 'C', 'integer', '', 'Required for UPS, generators and battery banks: minutes of backup (battery runtime or fuel).', 'Ups.batteryMin / Dg.runtimeH'),
    ('last_test_on', 'O', 'date', '', 'Last load / discharge test (generators, battery banks).', 'Dg.lastTest / battery.lastTest'),
 ]),
 'Rack_PDUs': ('The two power strips (A and B) in every cabinet and the UPS that feeds each one.', [
    ('pdu_id', 'R', 'text', '', 'Unique code, e.g. MH-DC-001-RACK-C-PDU-A.', 'RackPdu.id'),
    ('cabinet_id', 'R', 'ref', 'Cabinets', '', 'RackPdu.rackId'),
    ('side', 'R', 'list', 'pdu_side', 'A or B power path.', 'RackPdu.side'),
    ('capacity_kw', 'R', 'number', '', 'Rated capacity of the strip (kW).', 'RackPdu.capacityKw'),
    ('fed_from', 'R', 'ref', 'Power_Plant', 'UPS (or rectifier) asset_id that feeds this strip.', 'RackPdu.upstreamId'),
    ('model', 'O', 'text', '', 'e.g. Switched rack PDU 3-ph 32 A.', 'RackPdu.model'),
 ]),
 'Cooling_Units': ('Every cooling unit serving the rooms: CRAH / CRAC / in-row / rear-door, and CDUs for liquid cabinets.', [
    ('unit_id', 'R', 'text', '', 'Unique code, e.g. MH-DC-001-CRAH-11.', 'CoolingUnit.id'),
    ('site_id', 'R', 'ref', 'Sites', '', 'Datacenter.cooling.units'),
    ('room_id', 'R', 'ref', 'Rooms', 'Room the unit serves.', 'CoolingUnit.zone'),
    ('name', 'R', 'text', '', '', 'CoolingUnit.name'),
    ('unit_type', 'R', 'list', 'cooling_type', '', 'CoolingUnit.type'),
    ('capacity_kw', 'R', 'number', '', 'Rated cooling capacity (kW).', 'CoolingUnit.capacityKw'),
    ('supply_setpoint_c', 'O', 'number', '', 'Supply air / water set point (°C).', 'CoolingUnit.supplyC'),
 ]),
 'Devices': ('Your OWN equipment only (routers, switches, firewalls, servers). Tenant equipment is not listed. Ports, links, optics and modules are discovered once monitoring is connected.', [
    ('device_id', 'R', 'text', '', 'Unique code; the hostname is fine when it is unique.', 'NetworkElement.id'),
    ('site_id', 'R', 'ref', 'Sites', '', 'NetworkElement.dcId'),
    ('hostname', 'R', 'text', '', 'As configured on the device.', 'NetworkElement.name'),
    ('role', 'R', 'list', 'device_role', '', 'NetworkElement.role'),
    ('vendor', 'R', 'text', '', 'e.g. Juniper, Cisco, Arista, Dell.', 'NetworkElement.vendor'),
    ('model', 'R', 'text', '', 'e.g. MX204, PowerEdge R760.', 'NetworkElement.model'),
    ('serial_number', 'R', 'text', '', 'Must be unique: discovery matches it.', 'NetworkElement.serial'),
    ('management_ip', 'R', 'text', '', 'Address the collector polls (SNMP / gNMI / Redfish).', 'NetworkElement.ip'),
    ('cabinet_id', 'R', 'ref', 'Cabinets', '', 'NetworkElement.rackId'),
    ('u_position', 'R', 'integer', '', 'Lowest rack unit the device occupies.', 'NetworkElement.u'),
    ('u_size', 'R', 'integer', '', 'Height in rack units.', 'NetworkElement.uSize'),
    ('os_version', 'O', 'text', '', 'Software release (filled by discovery if blank).', 'NetworkElement.os'),
 ]),
 'Customers': ('Every customer (tenant) with a contract at these sites.', [
    ('customer_id', 'R', 'text', '', 'Your CRM / billing account id.', 'Customer.id'),
    ('customer_name', 'R', 'text', '', '', 'Customer.name'),
    ('segment', 'R', 'list', 'segment', '', 'Customer.segment'),
    ('premium', 'R', 'list', 'yn', 'Y for customers with a premium SLA or key-account status; they are flagged first in every impact view.', 'Customer.premium'),
    ('account_manager', 'O', 'text', '', 'Name of the account owner.', 'Customer.accountManager'),
 ]),
 'Services': ('Every contracted service: cabinet leases, power circuits, cross-connects, remote-hands allowances. Revenue impact and SLA credits are calculated from these.', [
    ('service_id', 'R', 'text', '', 'Contract / order line id from billing.', 'Service.id'),
    ('customer_id', 'R', 'ref', 'Customers', '', 'Service.customerId'),
    ('site_id', 'R', 'ref', 'Sites', '', 'Service.dcId'),
    ('service_type', 'R', 'list', 'service_type', '', 'Service.type'),
    ('cabinet_id', 'R', 'ref', 'Cabinets', 'The customer cabinet; for a cross-connect, the meet-me room cabinet it lands in.', 'Service path'),
    ('location_detail', 'O', 'text', '', 'Panel and port of a cross-connect, or the PDU pair of a power circuit.', 'Service.ifName'),
    ('quantity', 'R', 'number', '', 'How much is contracted, in the unit below.', 'Service.qty'),
    ('unit', 'R', 'list', 'service_unit', 'cabinets / kW / Mbps / hours.', 'Service.unit'),
    ('sla_target_pct', 'R', 'number', '', 'Availability target in the contract, e.g. 99.99.', 'Service.slaTarget'),
    ('monthly_charge_inr', 'R', 'number', '', 'Monthly recurring charge in ₹ (no currency sign).', 'Service.revenueMonthly'),
 ]),
}
ORDER = list(SHEETS)
if NEO:
    LOOK.update({
        'cabinet_purpose': ['GPU pod', 'Compute', 'Storage', 'Core network', 'Access network', 'Network', 'ODF / patching'],
        'device_role': ['GPU server', 'Server', 'Storage', 'Switch', 'Router', 'Firewall', 'Console server'],
        'segment': ['AI lab', 'SaaS', 'Fintech', 'Healthcare', 'Pharma', 'Automotive', 'Media', 'Retail', 'Education', 'Government', 'Enterprise', 'Other'],
        'service_type': ['Reserved cluster', 'On-demand GPUs', 'Storage volume', 'CPU instances'],
        'service_unit': ['GPU', 'TB', 'vCPU'],
        'gpu_model': ['B200 SXM 192 GB', 'H200 SXM 141 GB', 'H100 SXM 80 GB', 'A100 SXM 80 GB', 'L40S PCIe 48 GB', 'T4 PCIe 16 GB', 'Gaudi 3 OAM 128 GB', 'Max 1550 OAM 128 GB'],
        'gpu_vendor': ['NVIDIA', 'Intel'],
        'scheduler': ['Kubernetes', 'Slurm'],
        'fabric_type': ['InfiniBand NDR 400G', 'InfiniBand HDR 200G', 'InfiniBand XDR 800G', 'Ethernet RoCE 400G', 'Ethernet RoCE 100G'],
        'gpu_cooling': ['Air', 'Liquid'],
    })
    desc, cols = SHEETS['Cabinets']
    SHEETS['Cabinets'] = ('Every cabinet / rack: GPU pods, storage, compute, network and patching.', [c for c in cols if c[0] not in ('owner', 'customer_id', 'contracted_kw', 'tenant_u_used')])
    desc, cols = SHEETS['Devices']
    cols = list(cols); cols.insert(11, ('in_service', 'R', 'list', 'yn', 'Y = handed over to operations and monitored. N = racked but still in burn-in / not yet commissioned (no GPU_Nodes row yet).', 'OpsState in-service / unmonitored'))
    SHEETS['Devices'] = ('All your racked equipment: GPU servers, CPU servers, storage, switches, routers, firewalls. Ports, links, optics, GPUs inside a server and modules are discovered once monitoring is connected.', cols)
    SHEETS['GPU_Clusters'] = ('One row per GPU cluster (pod): one GPU model, one scheduler, one scale-out fabric.', [
        ('cluster_id', 'R', 'text', '', 'Unique code, e.g. MH-DC-001-POD-1.', 'GpuCluster.id'),
        ('site_id', 'R', 'ref', 'Sites', '', 'GpuCluster.dcId'),
        ('room_id', 'R', 'ref', 'Rooms', 'Hall the cluster stands in.', 'GpuCluster.room'),
        ('cluster_name', 'R', 'text', '', 'Name your teams use, e.g. AI-POD-1.', 'GpuCluster.name'),
        ('gpu_model', 'R', 'list', 'gpu_model', 'One model per cluster.', 'GpuCluster.model'),
        ('gpu_vendor', 'R', 'list', 'gpu_vendor', 'Decides the telemetry source (NVIDIA DCGM, Intel hl-smi / XPU Manager).', 'GpuSpec.vendor'),
        ('scheduler', 'R', 'list', 'scheduler', 'Where jobs are scheduled.', 'GpuCluster.scheduler'),
        ('fabric_type', 'R', 'list', 'fabric_type', 'GPU-to-GPU scale-out network between nodes.', 'GpuCluster.fabric'),
        ('rails_or_ports', 'O', 'integer', '', 'InfiniBand: rails per node (usually 8). Ethernet: fabric ports per node.', 'GpuCluster.fabric'),
        ('cooling', 'R', 'list', 'gpu_cooling', 'Liquid = direct-to-chip on a CDU (the cabinets then name the CDU).', 'GpuCluster.cooling'),
    ])
    SHEETS['GPU_Nodes'] = ('One row per GPU server in service (in_service = Y in Devices), with the cluster it belongs to and the service it is sold under. The GPUs inside are discovered.', [
        ('device_id', 'R', 'ref', 'Devices', 'The GPU server from Devices (role = GPU server).', 'GpuNode.neId'),
        ('site_id', 'R', 'ref', 'Sites', 'Same site as its cluster.', 'GpuNode.dcId'),
        ('cluster_id', 'R', 'ref', 'GPU_Clusters', '', 'GpuNode.clusterId'),
        ('gpu_count', 'R', 'integer', '', 'GPUs in the server, usually 8.', 'GpuNode.gpus.length'),
        ('service_id', 'C', 'ref', 'Services', 'Required when the node is sold: the Reserved cluster / On-demand GPUs service it runs. Blank = free capacity or a spare.', 'Service.path (job nodes)'),
        ('driver_version', 'O', 'text', '', 'GPU driver installed (filled by telemetry if blank).', 'GpuNode.driver'),
        ('firmware', 'O', 'text', '', 'VBIOS / firmware (filled by telemetry if blank).', 'GpuNode.firmware'),
    ])
    SHEETS['Customers'] = ('Every customer renting GPUs, storage or CPU capacity at these sites.', SHEETS['Customers'][1])
    SHEETS['Services'] = ('Every contracted service: reserved clusters, on-demand GPUs, storage volumes, CPU instances. Revenue impact, SLA credits and GPU occupancy are calculated from these.', [
        ('service_id', 'R', 'text', '', 'Contract / order line id from billing.', 'Service.id'),
        ('customer_id', 'R', 'ref', 'Customers', '', 'Service.customerId'),
        ('site_id', 'R', 'ref', 'Sites', '', 'Service.dcId'),
        ('service_type', 'R', 'list', 'service_type', 'Reserved cluster = a committed term; On-demand GPUs = billed by use.', 'Service.type'),
        ('cluster_id', 'C', 'ref', 'GPU_Clusters', 'Required for GPU services. Which nodes run it is set on GPU_Nodes.service_id.', 'Service.path'),
        ('device_id', 'C', 'ref', 'Devices', 'Required for storage volumes and CPU instances: the storage system or host it is delivered on.', 'Service.neId'),
        ('quantity', 'R', 'number', '', 'GPU services: GPUs (= the GPUs on its nodes). Storage: TB. CPU: vCPU.', 'Service.qty'),
        ('unit', 'R', 'list', 'service_unit', 'GPU / TB / vCPU.', 'Service.unit'),
        ('sla_target_pct', 'R', 'number', '', 'Availability target in the contract, e.g. 99.9.', 'Service.slaTarget'),
        ('monthly_charge_inr', 'R', 'number', '', 'Monthly recurring charge in ₹ (no currency sign).', 'Service.revenueMonthly'),
    ])
    ORDER = ['Sites', 'Rooms', 'Cabinets', 'Power_Plant', 'Rack_PDUs', 'Cooling_Units', 'Devices', 'GPU_Clusters', 'Customers', 'Services', 'GPU_Nodes']

# ------------------------------------------------------------------ sample rows from the export (export_backup.ts column order)
rows = {k: [] for k in ORDER}
def put(_sheet, **kw):
    rows[_sheet].append([kw.get(c[0]) for c in SHEETS[_sheet][1]])
META = None
if SRC:
    META = SRC['_meta'][0]
    day = lambda v: D.date.fromisoformat(v) if isinstance(v, str) and len(v) == 10 else v
    STATUS = {'on-air': 'Live', 'in-progress': 'Being built', 'planned': 'Planned'}
    PURPOSE = {'Core': 'Core network', 'Access': 'Access network', 'GPU': 'GPU pod'}
    ROLE = {'GPU': 'GPU server'} if NEO else {}
    for s in SRC['Sites']:
        name = s[1] if s[1] != s[0] else f'{s[10]} ({s[0]})'
        put('Sites', site_id=s[0], site_name=name, status=STATUS.get(s[4], s[4]), tier=s[5], state=s[8], city=s[9], address=s[10], latitude=s[11], longitude=s[12],
            commissioned_on=day(s[13]), it_capacity_kw=s[14], cooling_capacity_kw=s[16], design_pue=s[15])
    floor = {f[1]: f for f in SRC['Floors']}
    for r in SRC['Rooms']:
        f = floor[r[1]]
        put('Rooms', room_id=r[2], site_id=r[0], floor_name=f[2], floor_level=f[3], room_name=r[3], room_type=r[4], cooling_method=r[8])
    tenantU = Counter()
    for d in SRC['Devices']:
        if d[15] == 'tenant': tenantU[d[11]] += d[13] or 1
    rackOf = {d[0]: d[11] for d in SRC['Devices']}
    for r in SRC['Racks']:
        ten = r[9] == 'tenant'
        put('Cabinets', cabinet_id=r[0], site_id=r[1], room_id=r[2], cabinet_name=r[3], purpose=PURPOSE.get(r[6], r[6]), height_u=r[7], power_budget_kw=r[8], owner=r[9],
            customer_id=r[10] if ten else None, contracted_kw=r[11] if ten else None, liquid_cooled=r[13], cdu_id=r[14], tenant_u_used=tenantU[r[0]] if ten and tenantU[r[0]] else None)
    for f in SRC['Power_Feeds']:
        if f[2] != 'AC': continue
        put('Power_Plant', asset_id=f[0], site_id=f[1], asset_type='Utility feed', name=f[3], capacity=f[5], capacity_unit='kW', redundancy=f[6])
    for u in SRC['UPS']:
        put('Power_Plant', asset_id=u[0], site_id=u[1], asset_type='UPS', name=u[3], capacity=u[7], capacity_unit='kW', redundancy=u[8], autonomy_min=u[9])
    for g in SRC['Generators']:
        put('Power_Plant', asset_id=g[0], site_id=g[1], asset_type='Generator', name=g[2], capacity=g[3], capacity_unit='kVA', redundancy='N', autonomy_min=round(g[5] * 60) if g[5] else None, last_test_on=day(g[6]))
    for p in SRC['DC_Plant']:
        if p[3] == 'Rectifier': put('Power_Plant', asset_id=p[0], site_id=p[1], asset_type='Rectifier', name=p[4], capacity=p[8], capacity_unit='kW', redundancy='N+1')
        else: put('Power_Plant', asset_id=p[0], site_id=p[1], asset_type='Battery bank', name=p[4], capacity=round(p[5] * p[6] / 1000, 1), capacity_unit='kW', redundancy='N', autonomy_min=round(p[9] * 60) if p[9] else None, last_test_on=day(p[10]))
    plantIds = {p[0] for p in rows['Power_Plant']}
    for p in SRC['Rack_PDUs']:
        put('Rack_PDUs', pdu_id=p[0], cabinet_id=p[2], side=p[3], capacity_kw=p[9], fed_from=p[11] if p[11] in plantIds else None, model=p[5])
    for c in SRC['Cooling_Units']:
        put('Cooling_Units', unit_id=c[0], site_id=c[1], room_id=c[2], name=c[3], unit_type=c[4], capacity_kw=c[7], supply_setpoint_c=c[8])
    for d in SRC['Devices']:
        if d[15] != 'operator' or d[14] == 'Planned': continue
        put('Devices', device_id=d[0], site_id=d[1], hostname=d[2], role=ROLE.get(d[3], d[3]), vendor=d[5].title() if d[5] and d[5].isupper() else d[5], model=d[6], serial_number=d[8],
            management_ip=d[9], cabinet_id=d[11], u_position=d[12], u_size=d[13], in_service=d[17], os_version=d[7])
    for c in SRC['Customers']:
        put('Customers', customer_id=c[0], customer_name=c[1], segment=c[2], premium=c[6], account_manager=c[7])
    if NEO:
        import re
        for g in SRC['GPU_Clusters']:
            fab = g[5].split(' · ')[0]; m = re.match(r'Ethernet (\d+G) RoCE', fab)
            fab = f'Ethernet RoCE {m.group(1)}' if m else fab
            n = re.search(r'(\d+) (rails|ports)', g[5])
            put('GPU_Clusters', cluster_id=g[0], site_id=g[1], room_id=g[2], cluster_name=g[3], gpu_model=g[6], gpu_vendor='Intel' if g[6].startswith(('Gaudi', 'Max')) else 'NVIDIA',
                scheduler=g[4], fabric_type=fab, rails_or_ports=int(n.group(1)) if n else None, cooling=g[7].title())
        svcOf, clOf = {}, {g[0]: g[1] for g in SRC['GPU_Nodes']}
        siteOf = {d[0]: d[1] for d in SRC['Devices']}
        for s in SRC['Services']:
            for i in (s[7] or '').split(';'):
                if i: svcOf[i] = s[0]
        for g in SRC['GPU_Nodes']:
            put('GPU_Nodes', device_id=g[0], site_id=siteOf[g[0]], cluster_id=g[1], gpu_count=g[4], service_id=svcOf.get(g[0]), driver_version=g[7], firmware=g[8])
        for s in SRC['Services']:
            gpu = s[9] == 'GPU'; ids = [i for i in (s[7] or '').split(';') if i]
            put('Services', service_id=s[0], customer_id=s[1], site_id=s[3], service_type=s[2], cluster_id=clOf[ids[0]] if gpu else None, device_id=None if gpu else s[4],
                quantity=s[8], unit=s[9], sla_target_pct=s[11], monthly_charge_inr=s[12])
    else:
        for s in SRC['Services']:
            put('Services', service_id=s[0], customer_id=s[1], site_id=s[3], service_type=s[2], cabinet_id=rackOf.get(s[4]), location_detail=s[5], quantity=s[8], unit=s[9], sla_target_pct=s[11], monthly_charge_inr=s[12])

# ------------------------------------------------------------------ workbook
wb = Workbook()
HEAD = {'R': F(NAVY), 'C': F(AMBER), 'O': F(GREY)}
NEED = {'R': 'Required', 'C': 'Required in some cases', 'O': 'Optional'}
key_col = {}
def rng(sheet, key): return f"'{sheet}'!${key_col[sheet][key]}$2:${key_col[sheet][key]}${MAXR}"

ws = wb.active; ws.title = 'README'
sm = wb.create_sheet('Checks')
for name in ORDER:
    desc, cols = SHEETS[name]
    sh = wb.create_sheet(name); key_col[name] = {}
    for ci, (k, need, kind, look, d, _m) in enumerate(cols, start=1):
        c = sh.cell(1, ci, k); c.font = Font(bold=True, color='FFFFFF'); c.fill = HEAD[need]; c.border = BOX
        c.alignment = Alignment(vertical='center')
        c.comment = Comment(f'{NEED[need]} · {kind}{" · " + ", ".join(LOOK[look]) if kind == "list" else ""}{" · an id from " + look if kind == "ref" else ""}\n{d}'.strip(), 'SynapseDC', width=320, height=110)
        key_col[name][k] = col(ci)
        w = max(len(k) + 4, 14)
        for r in rows[name][:200]:
            v = r[ci - 1]
            if v is not None: w = max(w, min(len(str(v)) + 2, 46))
        sh.column_dimensions[col(ci)].width = w
    for r in rows[name]:
        sh.append(r)
    for ri in range(2, len(rows[name]) + 2):
        for ci, (k, need, kind, *_x) in enumerate(cols, start=1):
            c = sh.cell(ri, ci); c.border = BOX
            if kind == 'date' and c.value: c.number_format = 'yyyy-mm-dd'
            if k == 'monthly_charge_inr': c.number_format = '#,##0'
    sh.freeze_panes = 'B2'; sh.row_dimensions[1].height = 22
    sh.auto_filter.ref = f'A1:{col(len(cols))}{max(2, len(rows[name]) + 1)}'

# lookups + dropdowns
lk = wb.create_sheet('Lookups')
look_rng = {}
for ci, (k, vals) in enumerate(LOOK.items(), start=1):
    c = lk.cell(1, ci, k); c.font = Font(bold=True, color='FFFFFF'); c.fill = F(NAVY)
    for ri, v in enumerate(vals, start=2): lk.cell(ri, ci, v)
    look_rng[k] = f"Lookups!${col(ci)}$2:${col(ci)}${len(vals) + 1}"
    lk.column_dimensions[col(ci)].width = max(16, max(len(v) for v in vals) + 2)
for name in ORDER:
    sh = wb[name]
    for k, need, kind, look, *_x in SHEETS[name][1]:
        if kind == 'list':
            dv = DataValidation(type='list', formula1=look_rng[look], allow_blank=need != 'R', showErrorMessage=True, errorTitle='Pick from the list', error=f'Allowed: {", ".join(LOOK[look])}')
            sh.add_data_validation(dv); dv.add(f'{key_col[name][k]}2:{key_col[name][k]}{MAXR}')
        elif kind in ('number', 'integer'):
            dv = DataValidation(type='decimal' if kind == 'number' else 'whole', operator='greaterThanOrEqual', formula1='-1000000' if k in ('latitude', 'longitude', 'floor_level') else '0', allow_blank=True, showErrorMessage=True, error='A plain number, no units.')
            sh.add_data_validation(dv); dv.add(f'{key_col[name][k]}2:{key_col[name][k]}{MAXR}')

# field guide
fg = wb.create_sheet('Field_Guide')
for ci, h in enumerate(['Sheet', 'Column', 'Need', 'Type', 'Allowed values', 'What to enter', 'Example', 'Platform field'], start=1):
    c = fg.cell(1, ci, h); c.font = Font(bold=True, color='FFFFFF'); c.fill = F(NAVY)
for name in ORDER:
    for ci, (k, need, kind, look, d, m) in enumerate(SHEETS[name][1]):
        ex = next((r[ci] for r in rows[name] if r[ci] not in (None, '')), '')
        if isinstance(ex, D.date): ex = ex.isoformat()
        fg.append([name, k, NEED[need], kind, ', '.join(LOOK[look]) if kind == 'list' else (f'an id from {look}' if kind == 'ref' else ''), d, str(ex), m])
        fg.cell(fg.max_row, 3).font = Font(bold=need == 'R', color={'R': NAVY, 'C': AMBER, 'O': GREY}[need])
        for i in (5, 6): fg.cell(fg.max_row, i).alignment = Alignment(wrap_text=True, vertical='top')
for ci, w in enumerate([15, 22, 22, 9, 36, 60, 26, 30], start=1): fg.column_dimensions[col(ci)].width = w
fg.freeze_panes = 'C2'; fg.auto_filter.ref = f'A1:H{fg.max_row}'

# ------------------------------------------------------------------ checks (formulas)
sm.sheet_view.showGridLines = False
sm['A1'] = 'Checks'; sm['A1'].font = Font(size=16, bold=True, color=NAVY)
sm['A2'] = 'Counts per site and the checks the platform runs on import. Every check must say OK before you send the workbook.'; sm['A2'].font = Font(italic=True, color=GREY)
NS = max(4, len(rows['Sites']))
for ci in range(1, NS + 3):
    v = 'Count' if ci == 1 else ('Total' if ci == NS + 2 else f"=IF('Sites'!A{ci}=\"\",\"(site {ci - 1})\",'Sites'!A{ci})")
    c = sm.cell(4, ci, v); c.font = Font(bold=True, color='FFFFFF'); c.fill = F(NAVY); c.border = BOX
SC = lambda j: f'{col(2 + j)}$4'
wrap = lambda j, f: f"=IF('Sites'!$A${j + 2}=\"\",\"\",{f})"
cnt = lambda sheet, extra='': (lambda j: wrap(j, f"COUNTIFS({rng(sheet, 'site_id')},{SC(j)}{extra})"))
summ = lambda sheet, val, extra='': (lambda j: wrap(j, f"SUMIFS({rng(sheet, val)},{rng(sheet, 'site_id')},{SC(j)}{extra})"))
measures = [
    ('Rooms', cnt('Rooms')),
    ('Cabinets', cnt('Cabinets')),
    *([] if NEO else [('  tenant cabinets', cnt('Cabinets', f",{rng('Cabinets', 'owner')},\"tenant\""))]),
    ('  liquid-cooled cabinets', cnt('Cabinets', f",{rng('Cabinets', 'liquid_cooled')},\"Y\"")),
    ('Cabinet power budget (kW)', summ('Cabinets', 'power_budget_kw')),
    ('Site IT capacity (kW)', summ('Sites', 'it_capacity_kw')),
    *([] if NEO else [('Contracted tenant power (kW)', summ('Cabinets', 'contracted_kw'))]),
    ('UPS modules', cnt('Power_Plant', f",{rng('Power_Plant', 'asset_type')},\"UPS\"")),
    ('Cooling units', cnt('Cooling_Units')),
    ('Operator devices', cnt('Devices')),
    ('Services', cnt('Services')),
    ('Monthly recurring charge (₹)', summ('Services', 'monthly_charge_inr')),
]
if NEO:
    measures[2:2] = [('  GPU pod cabinets', cnt('Cabinets', f",{rng('Cabinets', 'purpose')},\"GPU pod\""))]
    i = [m[0] for m in measures].index('Operator devices')
    measures[i] = ('Devices', cnt('Devices'))
    measures[i + 1:i + 1] = [
        ('  GPU servers in service', cnt('Devices', f",{rng('Devices', 'role')},\"GPU server\",{rng('Devices', 'in_service')},\"Y\"")),
        ('GPU clusters', cnt('GPU_Clusters')),
        ('GPU nodes', cnt('GPU_Nodes')),
        ('GPUs installed', summ('GPU_Nodes', 'gpu_count')),
        ('GPUs sold (GPU services)', summ('Services', 'quantity', f",{rng('Services', 'unit')},\"GPU\"")),
    ]
r0 = 5
for i, (label, fn) in enumerate(measures):
    r = r0 + i; sm.cell(r, 1, label).border = BOX
    for j in range(NS):
        c = sm.cell(r, 2 + j, fn(j)); c.border = BOX; c.number_format = '#,##0'
    c = sm.cell(r, 2 + NS, f'=SUM({col(2)}{r}:{col(1 + NS)}{r})'); c.border = BOX; c.font = Font(bold=True); c.number_format = '#,##0'
_lab = [m[0] for m in measures]
BUD, CAP = r0 + _lab.index('Cabinet power budget (kW)'), r0 + _lab.index('Site IT capacity (kW)')

def uniq(sheet, key):
    R = rng(sheet, key)
    return f'=IF(SUMPRODUCT(({R}<>"")*(COUNTIF({R},{R})>1))=0,"OK","FIX: duplicate {key}")'
def ref(sheet, key, target, tkey, label=None):
    R, T = rng(sheet, key), rng(target, tkey)
    return f'=IF(SUMPRODUCT(({R}<>"")*(COUNTIF({T},{R})=0))=0,"OK","FIX: unknown {label or key}")'
cab, pdu = lambda k: rng('Cabinets', k), lambda k: rng('Rack_PDUs', k)
checks = [
    ('Site ids are unique', uniq('Sites', 'site_id'), 'Every alarm, incident and revenue figure is keyed on the site id.'),
    ('Cabinet ids are unique', uniq('Cabinets', 'cabinet_id'), ''),
    ('Device ids are unique', uniq('Devices', 'device_id'), ''),
    ('Device serial numbers are unique', uniq('Devices', 'serial_number'), 'Discovery matches the serial it polls against this one.'),
    ('Service ids are unique', uniq('Services', 'service_id'), ''),
    ('Rooms point at a known site', ref('Rooms', 'site_id', 'Sites', 'site_id'), ''),
    ('Cabinets point at a known room', ref('Cabinets', 'room_id', 'Rooms', 'room_id'), 'The floor plan and 3D layout place cabinets by room.'),
    ('Devices sit in a known cabinet', ref('Devices', 'cabinet_id', 'Cabinets', 'cabinet_id'), ''),
    ('Power strips sit in a known cabinet', ref('Rack_PDUs', 'cabinet_id', 'Cabinets', 'cabinet_id'), ''),
    ('Power strips are fed from a known UPS / rectifier', ref('Rack_PDUs', 'fed_from', 'Power_Plant', 'asset_id', 'fed_from'), 'The power path from utility to cabinet is traced through it.'),
    ('Every cabinet has an A and a B strip', f"=IF(SUMPRODUCT(({cab('cabinet_id')}<>\"\")*((COUNTIFS({pdu('cabinet_id')},{cab('cabinet_id')},{pdu('side')},\"A\")=0)+(COUNTIFS({pdu('cabinet_id')},{cab('cabinet_id')},{pdu('side')},\"B\")=0)))=0,\"OK\",\"CHECK: cabinet with one power side\")", 'A cabinet on one side only is a single point of failure.'),
    *([] if NEO else [('Tenant cabinets name a customer and contracted kW', f"=IF(COUNTIFS({cab('owner')},\"tenant\",{cab('customer_id')},\"\")+COUNTIFS({cab('owner')},\"tenant\",{cab('contracted_kw')},\"\")=0,\"OK\",\"FIX: tenant cabinet missing customer or kW\")", 'Power over contract is measured against it.')]),
    *([] if NEO else [('Tenant cabinets name a known customer', ref('Cabinets', 'customer_id', 'Customers', 'customer_id', 'customer_id'), '')]),
    ('Liquid cabinets name a known CDU', f"=IF(SUMPRODUCT(({cab('liquid_cooled')}=\"Y\")*(COUNTIF({rng('Cooling_Units', 'unit_id')},{cab('cdu_id')})=0))=0,\"OK\",\"FIX: liquid cabinet without a known CDU\")", 'A CDU fault is traced to the cabinets it cools.'),
    ('Services name a known customer', ref('Services', 'customer_id', 'Customers', 'customer_id'), 'Revenue impact adds up only if every service has a customer.'),
    *([] if NEO else [('Services name a known cabinet', ref('Services', 'cabinet_id', 'Cabinets', 'cabinet_id'), 'A fault on the cabinet, its power or cooling is charged to the services in it.')]),
    ('Every customer has at least one service', f"=IF(SUMPRODUCT(({rng('Customers', 'customer_id')}<>\"\")*(COUNTIF({rng('Services', 'customer_id')},{rng('Customers', 'customer_id')})=0))=0,\"OK\",\"CHECK: customer without a service\")", ''),
    ('Live sites have a commissioning date', f"=IF(COUNTIFS({rng('Sites', 'status')},\"Live\",{rng('Sites', 'commissioned_on')},\"\")=0,\"OK\",\"FIX: Live site without commissioned_on\")", ''),
    ('Cabinet budgets fit the site IT capacity', f'=IF(SUMPRODUCT(({col(2)}{BUD}:{col(1 + NS)}{BUD}<>"")*({col(2)}{BUD}:{col(1 + NS)}{BUD}>{col(2)}{CAP}:{col(1 + NS)}{CAP}))=0,"OK","CHECK: cabinets exceed IT capacity")', 'Capacity views compare the two.'),
]
if NEO:
    gn, gc, sv = lambda k: rng('GPU_Nodes', k), lambda k: rng('GPU_Clusters', k), lambda k: rng('Services', k)
    i = [c[0] for c in checks].index('Services name a known customer')
    checks[i:i] = [
        ('GPU cluster ids are unique', uniq('GPU_Clusters', 'cluster_id'), ''),
        ('GPU clusters stand in a known room', ref('GPU_Clusters', 'room_id', 'Rooms', 'room_id'), ''),
        ('GPU nodes are listed once', uniq('GPU_Nodes', 'device_id'), ''),
        ('GPU nodes are GPU servers in Devices', f"=IF(SUMPRODUCT(({gn('device_id')}<>\"\")*(COUNTIFS({rng('Devices', 'device_id')},{gn('device_id')},{rng('Devices', 'role')},\"GPU server\")=0))=0,\"OK\",\"FIX: GPU node not a GPU server in Devices\")", 'Its rack, power and cooling path come from the device row.'),
        ('Every GPU server in service has a GPU_Nodes row', f"=IF(COUNTA('GPU_Nodes'!$A$2:$A${MAXR})=COUNTIFS({rng('Devices', 'role')},\"GPU server\",{rng('Devices', 'in_service')},\"Y\"),\"OK\",\"FIX: GPU_Nodes and in-service GPU servers differ\")", 'GPU telemetry, jobs and occupancy are counted per node.'),
        ('GPU nodes belong to a known cluster at their site', f"=IF(SUMPRODUCT(({gn('cluster_id')}<>\"\")*(COUNTIFS({gc('cluster_id')},{gn('cluster_id')},{gc('site_id')},{gn('site_id')})=0))=0,\"OK\",\"FIX: node cluster unknown or at another site\")", ''),
        ('GPU nodes are sold under a known GPU service', f"=IF(SUMPRODUCT(({gn('service_id')}<>\"\")*(COUNTIFS({sv('service_id')},{gn('service_id')},{sv('unit')},\"GPU\")=0))=0,\"OK\",\"FIX: node names an unknown or non-GPU service\")", 'Occupancy = GPUs sold ÷ GPUs available to sell.'),
        ('GPU services name a known cluster', f"=IF(SUMPRODUCT(({sv('unit')}=\"GPU\")*(COUNTIF({gc('cluster_id')},{sv('cluster_id')})=0))=0,\"OK\",\"FIX: GPU service without a known cluster\")", 'A fault on any node of the cluster is charged to the job it hurts.'),
        ('GPU service quantity = GPUs on its nodes', f"=IF(SUMPRODUCT(({sv('unit')}=\"GPU\")*({sv('quantity')}<>SUMIFS({gn('gpu_count')},{gn('service_id')},{sv('service_id')})))=0,\"OK\",\"FIX: GPU service quantity differs from its nodes\")", 'Revenue and GPU time lost are computed per node.'),
        ('Storage / CPU services name a known device', f"=IF(SUMPRODUCT(({sv('service_id')}<>\"\")*({sv('unit')}<>\"GPU\")*(COUNTIF({rng('Devices', 'device_id')},{sv('device_id')})=0))=0,\"OK\",\"FIX: service without a known device\")", ''),
    ]
r = r0 + len(measures) + 2
sm.cell(r, 1, 'Checks before sending').font = Font(size=12, bold=True, color=BLUE)
r += 1
for ci, h in enumerate(['Check', 'Result', 'Why it matters'], start=1):
    c = sm.cell(r, ci, h); c.font = Font(bold=True, color='FFFFFF'); c.fill = F(NAVY)
for label, f, why in checks:
    r += 1
    sm.cell(r, 1, label).border = BOX; c = sm.cell(r, 2, f); c.border = BOX; c.font = Font(bold=True, color=GREEN); sm.cell(r, 3, why).border = BOX
sm.column_dimensions['A'].width = 48
for j in range(NS + 1): sm.column_dimensions[col(2 + j)].width = 16
sm.column_dimensions[col(3 + NS)].width = 60

# ------------------------------------------------------------------ README
ws.sheet_view.showGridLines = False
sample = META and META[3]
L = [
    (f'SynapseDC · Datacenter onboarding template · {"NeoCloud (GPU cloud)" if NEO else "Colocation"} · India', 'h1'),
    (f'Filled in with two sample datacenters ({sample}) end to end, as a worked example. Replace the sample rows with your own sites (or keep them for reference and delete them before sending).' if sample else 'Blank template.', 'sub'),
    (f'Version 1.0 · {D.date.today().strftime("%d-%b-%Y")}', 'sub'),
    ('', None),
    ('What this workbook is for', 'h2'),
    (('The minimum SynapseDC needs from you to onboard a GPU cloud datacenter: the sites, their halls and cabinets, the power and cooling plant, every racked device, the GPU clusters and the GPU servers in them, and the customers with the GPU, storage and CPU services they rent. With it, every alarm can be placed on the floor plan, traced through the power and cooling path to the GPU nodes, and turned into the jobs, customers and revenue it affects; GPU occupancy (sold vs available) is counted from the nodes and services.' if NEO else
      'The minimum SynapseDC needs from you to onboard a colocation datacenter: the sites, their rooms and cabinets, the power and cooling plant, your own equipment, and the customers with the services they buy. With it, every alarm can be placed on the floor plan, traced through the power and cooling path, and turned into the customers, services and revenue it affects.'), 'p'),
    ('', None),
    ('How to fill it', 'h2'),
    ('1. Fill the sheets in tab order: a sheet only points at ids from the sheets before it (' + ' → '.join(n.replace('_', ' ') for n in ORDER) + ').', 'p'),
    ('2. Row 1 holds the column keys. Do not rename, reorder or delete columns. Hover over a header for what to enter; Field_Guide lists every column with an example.', 'p'),
    ('3. Header colours: dark blue = required · amber = required in some cases (the note says when) · grey = optional.', 'p'),
    ('4. Columns with fixed values have a dropdown. Dates are YYYY-MM-DD. Numbers are plain, without units or currency signs.', 'p'),
    ('5. Ids must be unique and must not change later: the platform keys alarms, incidents and revenue on them.', 'p'),
    ('6. Open the Checks sheet when you finish. The counts per site must match what you expect and every check must say OK.', 'p'),
    ('', None),
    ('What we do NOT ask for, and why', 'h2'),
    *([('The GPUs inside each server (serials, UUIDs, memory, NVLink / NVSwitch), DCGM / hl-smi telemetry, Xid and ECC events, job and pod details from the scheduler: read from the servers and the scheduler (Kubernetes / Slurm) once connected.', 'p')] if NEO else
      [('Tenant equipment inside leased cabinets: you do not see it, and the platform does not need it.', 'p')]),
    ('Ports, interfaces, links' + (' (incl. InfiniBand / RoCE rails)' if NEO else '') + ', optics, line cards and firmware: discovered from your equipment once the collector is connected (SNMP / gNMI / LLDP / Redfish).', 'p'),
    ('Live readings (power draw, UPS load, battery state, temperatures, humidity, CDU flow), alarms and events: they stream in from the BMS, EPMS and devices.', 'p'),
    ('Sensors, BMS points, access-control doors and CCTV: taken from the BMS / access-control integration, captured in the facility integration survey.', 'p'),
    ('Integration endpoints, collector placement and firewall rules: the facility integration survey, one per datacenter, sent separately.', 'p'),
    ('', None),
    ('Useful later (not needed to go live)', 'h2'),
    ('Fire and leak-detection zones, patch panels and trunk cables, warranty and support contracts, spares, the preventive-maintenance plan and the on-call rota' + (', GPU benchmark / burn-in results and instance pricing tiers' if NEO else '') + '. We will ask for them once the sites are live.', 'p'),
    ('', None),
    ('Sheets', 'h2'),
]
for t, kind in L:
    ws.append([t]); c = ws.cell(ws.max_row, 1)
    if kind == 'h1': c.font = Font(size=18, bold=True, color=NAVY)
    elif kind == 'sub': c.font = Font(size=10, italic=True, color=GREY)
    elif kind == 'h2': c.font = Font(size=12, bold=True, color=BLUE)
    elif kind == 'p': c.alignment = Alignment(wrap_text=True, vertical='top'); ws.row_dimensions[ws.max_row].height = 32
ws.append(['Sheet', 'What goes in it', 'Required columns', 'Sample rows'])
hr = ws.max_row
for i in range(1, 5): ws.cell(hr, i).font = Font(bold=True, color='FFFFFF'); ws.cell(hr, i).fill = F(NAVY)
for name in ORDER:
    desc, cols = SHEETS[name]
    ws.append([name, desc, sum(1 for c in cols if c[1] == 'R'), len(rows[name])])
    ws.cell(ws.max_row, 1).hyperlink = f"#'{name}'!A1"; ws.cell(ws.max_row, 1).font = Font(color=BLUE, underline='single')
    for i in range(1, 5): ws.cell(ws.max_row, i).border = BOX; ws.cell(ws.max_row, i).alignment = Alignment(wrap_text=True, vertical='top')
for name, d in [('Checks', 'Counts per site and the import checks (formulas).'), ('Field_Guide', 'Every column: need, type, allowed values, example.'), ('Lookups', 'Values behind the dropdowns.')]:
    ws.append([name, d, '', '']); ws.cell(ws.max_row, 1).hyperlink = f"#'{name}'!A1"; ws.cell(ws.max_row, 1).font = Font(color=BLUE, underline='single')
    for i in range(1, 5): ws.cell(ws.max_row, i).border = BOX
ws.column_dimensions['A'].width = 18; ws.column_dimensions['B'].width = 100; ws.column_dimensions['C'].width = 17; ws.column_dimensions['D'].width = 13
for rr in range(1, hr): ws.merge_cells(start_row=rr, start_column=1, end_row=rr, end_column=4)

order = ['README'] + ORDER + ['Checks', 'Field_Guide', 'Lookups']
wb._sheets = [wb[n] for n in order]
wb['README'].sheet_properties.tabColor = NAVY; wb['Checks'].sheet_properties.tabColor = GREEN
wb.active = 0
wb.save(OUT)
print('saved', OUT, {k: len(v) for k, v in rows.items()})
