/**
 * DCOS — enum catalog (Data Dictionary §9).
 * Pattern: `export const X = [...] as const; export type X = typeof X[number];`
 */
export const LIFECYCLE_STATUS = ['Active', 'Inactive', 'Released'] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUS)[number];

export const FACILITY_STATUS = ['Planned', 'Construction', 'Operational', 'Decommissioning', 'Retired'] as const;
export type FacilityStatus = (typeof FACILITY_STATUS)[number];

export const DC_TIERS = ['Tier I', 'Tier II', 'Tier III', 'Tier IV'] as const;
export type DCTier = (typeof DC_TIERS)[number];

// ── Data centre classification (see DCOS-DataCentre-Types-Spec) ──
// Segment splits the taxonomy into the non-telco (enterprise / commercial / IT) and
// telco (network-site) worlds. Type keys are the stable identifiers used on a DataCenter;
// the full per-type profile (size, power, density, cooling, redundancy, coverage) lives
// in `dcTypes.ts` so seed, onboarding and every facility surface read one catalogue.
export const DC_SEGMENT = ['Enterprise', 'Telco'] as const;
export type DcSegment = (typeof DC_SEGMENT)[number];

export const DC_TYPE_KEYS = [
  // Enterprise — smallest → largest footprint
  'edge-micro-dc', 'server-room', 'modular-pod', 'enterprise-dc', 'retail-colo', 'wholesale-colo',
  'carrier-hotel', 'hyperscale-dc', 'hyperscale-campus', 'ai-gpu-factory',
  // Telco — smallest → largest footprint (cell site / street cabinet / far-edge MEC are out of scope)
  'central-office', 'aggregation-pop', 'network-pop', 'regional-edge-dc', 'mtso', 'national-core-nfvi', 'ixp',
] as const;
export type DcTypeKey = (typeof DC_TYPE_KEYS)[number];

/** How well DCOS supports a data centre type today. */
export const DC_TYPE_COVERAGE = ['Full', 'Strong', 'Partial', 'Gap'] as const;
export type DcTypeCoverage = (typeof DC_TYPE_COVERAGE)[number];

/** Platform capability gaps that would close a type's coverage (spec §"What would close the telco / colo gaps"). */
export const DC_CAPABILITY_GAPS = ['multi-tenancy', 'dc-power-plant', 'optical-transport', 'service-inventory'] as const;
export type DcCapabilityGap = (typeof DC_CAPABILITY_GAPS)[number];

export const CONTAINMENT = ['Hot-Aisle', 'Cold-Aisle', 'None'] as const;
export type Containment = (typeof CONTAINMENT)[number];

export const POWER_REDUNDANCY = ['N', 'N+1', '2N', '2N+1'] as const;
export type PowerRedundancy = (typeof POWER_REDUNDANCY)[number];

export const RACK_PURPOSE = ['Compute', 'Storage', 'Network', 'GPU', 'Mixed'] as const;
export type RackPurpose = (typeof RACK_PURPOSE)[number];

export const RACK_STATUS = ['Planned', 'Active', 'Full', 'Reserved', 'Retired'] as const;
export type RackStatus = (typeof RACK_STATUS)[number];

export const ASSET_CATEGORY = ['Server', 'Storage', 'Switch', 'Router', 'PDU', 'UPS', 'GPU-Node', 'Firewall', 'Other'] as const;
export type AssetCategory = (typeof ASSET_CATEGORY)[number];

export const ASSET_LIFECYCLE = ['Ordered', 'Received', 'Staged', 'Installed', 'Active', 'Maintenance', 'Retired', 'Disposed'] as const;
export type AssetLifecycle = (typeof ASSET_LIFECYCLE)[number];

export const ASSET_STATUS = ['Active', 'Inactive', 'Faulty', 'Maintenance'] as const;
export type AssetStatus = (typeof ASSET_STATUS)[number];

export const CAPACITY_STATE = ['Available', 'Reserved', 'Committed', 'Consumed'] as const;
export type CapacityState = (typeof CAPACITY_STATE)[number];

export const CAPACITY_SCOPE = ['Rack', 'Hall', 'DataCenter'] as const;
export type CapacityScope = (typeof CAPACITY_SCOPE)[number];

export const EQUIPMENT_STATUS = ['Operational', 'Degraded', 'Maintenance', 'Failed', 'Planned', 'Retired'] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUS)[number];

export const RESOURCE_TYPE = ['Rack', 'Subnet', 'VLAN', 'Asset', 'PowerChain', 'Cooling'] as const;
export type ResourceType = (typeof RESOURCE_TYPE)[number];

export const SUBNET_PURPOSE = ['Management', 'Production', 'Storage', 'OOB', 'Transit'] as const;
export type SubnetPurpose = (typeof SUBNET_PURPOSE)[number];

export const IP_STATUS = ['Allocated', 'Reserved', 'Available', 'Conflict'] as const;
export type IPStatus = (typeof IP_STATUS)[number];

export const NETWORK_OBJ_STATUS = ['Active', 'Reserved', 'Unused'] as const;
export type NetworkObjStatus = (typeof NETWORK_OBJ_STATUS)[number];

export const CHANGE_TYPE = ['RackDeploy', 'VLANProvision', 'PowerUpgrade', 'ServerRelocation', 'NetworkMigration', 'Decommission', 'ConfigPush'] as const;
export type ChangeType = (typeof CHANGE_TYPE)[number];

export const CHANGE_STATUS = ['Draft', 'Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress', 'Implemented', 'Closed', 'Rejected', 'Cancelled', 'RolledBack'] as const;
export type ChangeStatus = (typeof CHANGE_STATUS)[number];

export const RISK_LEVEL = ['Low', 'Medium', 'High', 'Critical'] as const;
export type RiskLevel = (typeof RISK_LEVEL)[number];

export const POLICY_CATEGORY = ['Power', 'Cooling', 'IPReserve', 'Redundancy', 'Placement'] as const;
export type PolicyCategory = (typeof POLICY_CATEGORY)[number];

export const ENFORCEMENT = ['Block', 'Warn', 'Audit'] as const;
export type Enforcement = (typeof ENFORCEMENT)[number];

export const APPROVAL_DECISION = ['Pending', 'Approved', 'Rejected', 'Delegated'] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISION)[number];

export const SEVERITY = ['SEV1', 'SEV2', 'SEV3', 'SEV4'] as const;
export type Severity = (typeof SEVERITY)[number];

export const INCIDENT_STATUS = ['Open', 'Investigating', 'Mitigated', 'Resolved', 'Closed'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUS)[number];

// Priority is distinct from severity (severity = technical blast radius;
// priority = business urgency once impact is weighed). P1 = drop-everything.
export const INCIDENT_PRIORITY = ['P1', 'P2', 'P3', 'P4'] as const;
export type IncidentPriority = (typeof INCIDENT_PRIORITY)[number];

// Worklog entry kinds for the incident timeline.
export const WORKLOG_KIND = ['Note', 'StatusChange', 'Assignment', 'Escalation', 'Resolution'] as const;
export type WorklogKind = (typeof WORKLOG_KIND)[number];

// Planned maintenance windows (change-driven or standalone).
export const MAINTENANCE_STATUS = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUS)[number];

export const COMPLIANCE_STANDARD = ['ISO 27001', 'SOC 2', 'PCI DSS', 'NIST'] as const;
export type ComplianceStandard = (typeof COMPLIANCE_STANDARD)[number];

// ── Compliance / OPA policy-as-code ──
export const CONTROL_TYPE = ['Automated', 'Manual'] as const;
export type ControlType = (typeof CONTROL_TYPE)[number];

export const CONTROL_STATUS = ['Compliant', 'InProgress', 'NonCompliant', 'NotAssessed'] as const;
export type ControlStatus = (typeof CONTROL_STATUS)[number];

export const DECISION_OUTCOME = ['allow', 'deny', 'warn'] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOME)[number];

// ── DCIM: device types, components, cabling ──
export const COMPONENT_KIND = ['interface', 'console', 'console-server', 'power-port', 'power-outlet', 'front-port', 'rear-port', 'module-bay', 'device-bay'] as const;
export type ComponentKind = (typeof COMPONENT_KIND)[number];

export const INTERFACE_TYPE = ['Virtual', '1000BASE-T', '10GBASE-T', '10GBASE-X SFP+', '25GBASE-X SFP28', '40GBASE-X QSFP+', '100GBASE-X QSFP28', '400GBASE-X QSFP-DD'] as const;
export type InterfaceType = (typeof INTERFACE_TYPE)[number];

export const POE_TYPE = ['None', 'IEEE 802.3af', 'IEEE 802.3at', 'IEEE 802.3bt'] as const;
export type PoeType = (typeof POE_TYPE)[number];

export const RF_ROLE = ['None', 'Uplink', 'Bridge', 'Access Point'] as const;
export type RfRole = (typeof RF_ROLE)[number];

export const CONSOLE_TYPE = ['RJ-45', 'Serial (DB9)', 'USB Type A', 'USB Type C', 'Virtual'] as const;
export type ConsoleType = (typeof CONSOLE_TYPE)[number];

export const POWER_PORT_TYPE = ['AC', 'DC', 'IEC C14', 'IEC C20', 'Redundant'] as const;
export type PowerPortType = (typeof POWER_PORT_TYPE)[number];

export const POWER_OUTLET_TYPE = ['AC', 'DC', 'IEC C13', 'IEC C19'] as const;
export type PowerOutletType = (typeof POWER_OUTLET_TYPE)[number];

export const FEED_LEG = ['A', 'B', 'C'] as const;
export type FeedLeg = (typeof FEED_LEG)[number];

export const WEIGHT_UNIT = ['kg', 'lb', 'g'] as const;
export type WeightUnit = (typeof WEIGHT_UNIT)[number];

export const MODULE_BAY_POSITION = ['Front', 'Rear', 'Slot-1', 'Slot-2', 'Slot-3', 'Slot-4'] as const;
export type ModuleBayPosition = (typeof MODULE_BAY_POSITION)[number];

export const IF_DUPLEX = ['auto', 'half', 'full'] as const;
export type IfDuplex = (typeof IF_DUPLEX)[number];

export const IF_MODE = ['Access', 'Tagged', 'Tagged-All'] as const;
export type IfMode = (typeof IF_MODE)[number];

export const DEVICE_FACE = ['front', 'rear'] as const;
export type DeviceFace = (typeof DEVICE_FACE)[number];

export const POWER_SUPPLY = ['AC', 'DC'] as const;
export type PowerSupply = (typeof POWER_SUPPLY)[number];

export const POWER_PHASE = ['Single-phase', 'Three-phase'] as const;
export type PowerPhase = (typeof POWER_PHASE)[number];

export const POWER_FEED_TYPE = ['Primary', 'Redundant'] as const;
export type PowerFeedType = (typeof POWER_FEED_TYPE)[number];

export const POWER_FEED_STATUS = ['Active', 'Planned', 'Offline', 'Failed'] as const;
export type PowerFeedStatus = (typeof POWER_FEED_STATUS)[number];

export const CABLE_STATUS = ['Active', 'Planned', 'Decommissioning'] as const;
export type CableStatus = (typeof CABLE_STATUS)[number];

export const CABLE_TYPE = ['Cat6', 'Cat6a', 'MMF-OM4', 'SMF-OS2', 'DAC', 'Power-C13', 'Power-C19'] as const;
export type CableType = (typeof CABLE_TYPE)[number];

export const DCIM_DEVICE_ROLE = ['Core Router', 'Spine', 'Leaf/ToR', 'Firewall', 'Server', 'Storage', 'PDU', 'Patch Panel', 'Other'] as const;
export type DcimDeviceRole = (typeof DCIM_DEVICE_ROLE)[number];

export const PLATFORM = ['Junos', 'EOS', 'NX-OS', 'IOS-XR', 'Linux', 'Other'] as const;
export type Platform = (typeof PLATFORM)[number];

// ── DCIM closure: fidelity enums ──
export const AIRFLOW = ['front-to-rear', 'rear-to-front', 'left-to-right', 'right-to-left', 'side-to-rear', 'passive'] as const;
export type Airflow = (typeof AIRFLOW)[number];

export const RACK_WIDTH = [19, 21, 23] as const; // rail width in inches (NetBox 10/19/21/23 enum)
export type RackWidth = (typeof RACK_WIDTH)[number];

export const SUBDEVICE_ROLE = ['parent', 'child'] as const; // device-type parent/child status
export type SubdeviceRole = (typeof SUBDEVICE_ROLE)[number];

export const POE_MODE = ['pd', 'pse'] as const; // powered-device vs power-sourcing-equipment
export type PoeMode = (typeof POE_MODE)[number];

export const VDC_STATUS = ['active', 'planned', 'offline'] as const;
export type VdcStatus = (typeof VDC_STATUS)[number];

export const RESERVATION_STATUS = ['Active', 'Released'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUS)[number];

export const DEMAND_TYPE = ['ComputeExpansion', 'GPUExpansion', 'StorageGrowth', 'NetworkUpgrade', 'EdgeDeployment'] as const;
export type DemandType = (typeof DEMAND_TYPE)[number];

// ── Planning: a Plan is the front-of-funnel intent that, once approved, spawns a Change or a Project ──
export const PLAN_TYPE = ['New Rollout', 'Capacity Expansion', 'Network Change', 'Reallocation/Migration', 'Decommission Program', 'Facility Build'] as const;
export type PlanType = (typeof PLAN_TYPE)[number];
export const PLAN_STATUS = ['Draft', 'Submitted', 'In Review', 'Approved', 'Executing', 'Completed', 'Rejected', 'Cancelled'] as const;
export type PlanStatus = (typeof PLAN_STATUS)[number];
// A plan executes into operational work (Change), a single build-out (Project),
// or — for greenfield facility builds — a whole Programme of sequenced projects.
export const PLAN_EXEC_PATH = ['Change', 'Project', 'Programme'] as const;
export type PlanExecPath = (typeof PLAN_EXEC_PATH)[number];
export const PROJECT_TEMPLATE = [
  'Greenfield DC Build', 'Hall Fit-out', 'Rack Deployment', 'Capacity Expansion', 'Network Refresh', 'Migration Wave', 'Decommission Program',
  // Facility & construction templates
  'Facility Master Planning', 'Site Construction', 'Building Fit-out', 'MEP & Plant Installation',
  // Plan types that work inside live sites
  'Plant Upgrade Works', 'DCI / WAN Uplift', 'Server Refresh', 'Rack Replacement', 'Liquid Retrofit', 'Edge Site Rollout',
] as const;
export type ProjectTemplate = (typeof PROJECT_TEMPLATE)[number];

// ── Circuits (carrier / WAN connectivity) ──
export const CIRCUIT_STATUS = ['Planned', 'Provisioning', 'Active', 'Offline', 'Decommissioned'] as const;
export type CircuitStatus = (typeof CIRCUIT_STATUS)[number];

export const CIRCUIT_PURPOSE = ['Internet', 'DC Interconnect', 'Cloud On-ramp', 'Customer', 'Management'] as const;
export type CircuitPurpose = (typeof CIRCUIT_PURPOSE)[number];

// ── IPAM (full) ──
export const PREFIX_STATUS = ['Container', 'Active', 'Reserved', 'Deprecated'] as const;
export type PrefixStatus = (typeof PREFIX_STATUS)[number];
export const FHRP_PROTOCOL = ['VRRP', 'HSRP', 'GLBP', 'CARP'] as const;
export type FhrpProtocol = (typeof FHRP_PROTOCOL)[number];
export const SERVICE_PROTOCOL = ['TCP', 'UDP', 'SCTP'] as const;
export type ServiceProtocol = (typeof SERVICE_PROTOCOL)[number];

export const ROLE = ['CapacityPlanner', 'NetworkEngineer', 'FacilityManager', 'DeliveryManager', 'ChangeApprover', 'NOCOperator', 'FieldTechnician', 'ComplianceAuditor', 'Executive', 'Administrator'] as const;
export type Role = (typeof ROLE)[number];

export const RAG_VALUES = ['Red', 'Amber', 'Green', 'Grey'] as const;
export type RAGValue = (typeof RAG_VALUES)[number];

export const PRIORITY = ['Low', 'Medium', 'High', 'Urgent'] as const;
export type Priority = (typeof PRIORITY)[number];

// ── NMS ──
export const DEVICE_TYPE = ['Switch', 'Router', 'Firewall', 'LoadBalancer', 'Server', 'PDU', 'UPS', 'Other'] as const;
export type DeviceType = (typeof DEVICE_TYPE)[number];

export const DEVICE_REACHABILITY = ['Reachable', 'Unreachable', 'Degraded'] as const;
export type DeviceReachability = (typeof DEVICE_REACHABILITY)[number];

export const IF_OPER_STATUS = ['Up', 'Down', 'Testing', 'Dormant'] as const;
export type IfOperStatus = (typeof IF_OPER_STATUS)[number];

export const ALARM_SEVERITY = ['Critical', 'Major', 'Minor', 'Warning', 'Info'] as const;
export type AlarmSeverity = (typeof ALARM_SEVERITY)[number];

export const ALARM_STATE = ['Active', 'Acknowledged', 'Cleared'] as const;
export type AlarmState = (typeof ALARM_STATE)[number];

export const METRIC_TYPE = ['CPU', 'Memory', 'IfUtilization', 'Latency', 'PacketLoss', 'Errors', 'Throughput', 'Temperature'] as const;
export type MetricType = (typeof METRIC_TYPE)[number];

export const CONFIG_CHANGE_STATUS = ['Planned', 'Approved', 'Pushed', 'Verified', 'Failed', 'RolledBack'] as const;
export type ConfigChangeStatus = (typeof CONFIG_CHANGE_STATUS)[number];

export const DISCOVERY_METHOD = ['SNMP', 'LLDP', 'CDP', 'Ping', 'API'] as const;
export type DiscoveryMethod = (typeof DISCOVERY_METHOD)[number];

export const DISCOVERY_STATUS = ['Scheduled', 'Running', 'Completed', 'Failed'] as const;
export type DiscoveryStatus = (typeof DISCOVERY_STATUS)[number];

export const LINK_LAYER = ['L1', 'L2', 'L3'] as const;
export type LinkLayer = (typeof LINK_LAYER)[number];

export const REGIONS = ['North America', 'EMEA', 'APAC', 'LATAM'] as const;
export type RegionName = (typeof REGIONS)[number];

// ── Breadth modules (Delivery / Procurement / Build / Commissioning / Audit) ──
export const PROJECT_STATUS = ['Planning', 'Active', 'At Risk', 'Blocked', 'Completed', 'On Hold'] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export const PROGRAM_STATUS = ['Proposed', 'Planning', 'Active', 'On Hold', 'Closed'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUS)[number];
// Classifies a programme. Blueprint-backed types (e.g. Greenfield Build) generate
// a sequenced set of phase projects; the rest are containers filled with projects.
export const PROGRAM_TYPE = ['Greenfield Build', 'Capacity Expansion', 'Network Modernization', 'Resilience / Sustainability', 'Decommissioning', 'Other'] as const;
export type ProgramType = (typeof PROGRAM_TYPE)[number];
// Project execution is modelled as a BPMN-style process; each node is an activity.
export const PROCESS_NODE_TYPE = ['start', 'task', 'gateway', 'end'] as const;
export type ProcessNodeType = (typeof PROCESS_NODE_TYPE)[number];
export const ACTIVITY_STATUS = ['Pending', 'Active', 'Done', 'Skipped'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUS)[number];
/** Delivery templates, grouped by category in the registry. Includes facility & construction. */
export const PROJECT_TEMPLATE_CATEGORY = ['IT', 'Network', 'Facility', 'Construction'] as const;
export type ProjectTemplateCategory = (typeof PROJECT_TEMPLATE_CATEGORY)[number];
export const MILESTONE_STATUS = ['Not Started', 'In Progress', 'Completed', 'Delayed'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUS)[number];

// ── Permits & approvals (front-end of a facility build) ──
export const PERMIT_TYPE = ['Planning / Zoning', 'Building Permit', 'Environmental', 'Electrical', 'Mechanical / HVAC', 'Fire / Life Safety', 'Utility Interconnect', 'Occupancy'] as const;
export type PermitType = (typeof PERMIT_TYPE)[number];
export const PERMIT_STATUS = ['Not Started', 'Applied', 'In Review', 'Approved', 'Rejected', 'Expired'] as const;
export type PermitStatus = (typeof PERMIT_STATUS)[number];

// ── Design documents (concept → IFC → as-built) ──
export const DESIGN_DOC_TYPE = ['Concept Design', 'Schematic Design', 'Detailed Design', 'MEP Design', 'Structural', 'IFC Package', 'As-Built'] as const;
export type DesignDocType = (typeof DESIGN_DOC_TYPE)[number];
export const DESIGN_DOC_STATUS = ['Draft', 'In Review', 'Reviewed', 'Issued for Construction', 'Superseded', 'As-Built'] as const;
export type DesignDocStatus = (typeof DESIGN_DOC_STATUS)[number];
export const DESIGN_DISCIPLINE = ['Architectural', 'Structural', 'Electrical', 'Mechanical', 'Network', 'Civil'] as const;
export type DesignDiscipline = (typeof DESIGN_DISCIPLINE)[number];

// ── Delivery tickets (P2B ad-hoc issues / tasks — distinct from operational Incidents) ──
export const TICKET_STATUS = ['New', 'Open', 'Assigned', 'In Progress', 'Blocked', 'Parked', 'Resolved', 'Verified', 'Closed'] as const;
export type TicketStatus = (typeof TICKET_STATUS)[number];
export const TICKET_TYPE = ['Issue', 'Defect', 'Ad-hoc Task', 'Request', 'Blocker'] as const;
export type TicketType = (typeof TICKET_TYPE)[number];

// ── Change orders (the only thing that moves a project's approved budget) ──
export const CHANGE_ORDER_STATUS = ['Draft', 'Submitted', 'Approved', 'Rejected'] as const;
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUS)[number];
export const CHANGE_ORDER_REASON = ['Scope change', 'Design development', 'Site conditions', 'Regulatory', 'Client request', 'Error / omission'] as const;
export type ChangeOrderReason = (typeof CHANGE_ORDER_REASON)[number];
export const WORK_ORDER_TYPE = ['RackInstall', 'Cabling', 'PowerConnect', 'DeviceDeploy', 'DeviceRemoval', 'Migration', 'PlantInstall', 'PlantCutIn', 'Commissioning', 'Civil', 'Inspection', 'Disposal', 'CircuitTurnUp', 'Configuration'] as const;
export type WorkOrderType = (typeof WORK_ORDER_TYPE)[number];
export const WORK_ORDER_STATUS = ['Draft', 'Awaiting change approval', 'Ready', 'Assigned', 'InProgress', 'Validated', 'Completed', 'Cancelled', 'Failed'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUS)[number];

// ── Commissioning levels · ATP · HOTO ──
export const CX_LEVEL = ['L1 FAT', 'L2 SAT', 'L3 Pre-functional', 'L4 Functional', 'L5 IST'] as const;
export type CxLevel = (typeof CX_LEVEL)[number];
export const ATP_SYSTEM = ['Power', 'Cooling', 'Network', 'Controls', 'Integrated'] as const;
export type AtpSystem = (typeof ATP_SYSTEM)[number];
export const ATP_STATUS = ['Draft', 'In Progress', 'Witnessed', 'Accepted', 'Failed'] as const;
export type AtpStatus = (typeof ATP_STATUS)[number];
export const STEP_RESULT = ['Pending', 'Pass', 'Fail', 'N/A'] as const;
export type StepResult = (typeof STEP_RESULT)[number];
export const SNAG_SEVERITY = ['Critical', 'Major', 'Minor'] as const;
export type SnagSeverity = (typeof SNAG_SEVERITY)[number];
export const SNAG_STATUS = ['Open', 'Closed'] as const;
export type SnagStatus = (typeof SNAG_STATUS)[number];
export const HOTO_STATUS = ['Not Started', 'In Progress', 'Accepted', 'Accepted with conditions', 'Rejected'] as const;
export type HotoStatus = (typeof HOTO_STATUS)[number];
export const DELIVERABLE_STATUS = ['Pending', 'Done', 'N/A'] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUS)[number];
export const SIGNOFF_ROLE = ['Delivery / PM', 'Commissioning Agent', 'Operations / NOC', 'Facilities'] as const;
export type SignoffRole = (typeof SIGNOFF_ROLE)[number];
export const SIGNOFF_DECISION = ['Pending', 'Signed', 'Rejected'] as const;
export type SignoffDecision = (typeof SIGNOFF_DECISION)[number];
export const CONTRACT_TYPE = ['Support', 'Warranty', 'SLA', 'Supply', 'Framework', 'Lease', 'Maintenance'] as const;
export type ContractType = (typeof CONTRACT_TYPE)[number];
export const BOM_TYPE = ['Rack', 'Network', 'Power', 'Compute'] as const;
export type BOMType = (typeof BOM_TYPE)[number];
export const PO_STATUS = ['Draft', 'Approved', 'Ordered', 'Received'] as const;
export type POStatus = (typeof PO_STATUS)[number];
export const DOC_TYPE = ['Runbook', 'Diagram', 'Contract', 'Report', 'Policy', 'Evidence'] as const;
export type DocType = (typeof DOC_TYPE)[number];
export const DOC_STATUS = ['Draft', 'In Review', 'Published', 'Archived'] as const;
export type DocStatus = (typeof DOC_STATUS)[number];

// ── PPM depth: tasks & risks ──
export const TASK_STATUS = ['To Do', 'In Progress', 'Blocked', 'Done'] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];
export const RISK_CATEGORY = ['Schedule', 'Capacity', 'Vendor', 'Operational'] as const;
export type RiskCategory = (typeof RISK_CATEGORY)[number];
export const RISK_STATUS = ['Open', 'Mitigated', 'Closed'] as const;
export type RiskStatus = (typeof RISK_STATUS)[number];
export const PROBABILITY = ['Low', 'Medium', 'High'] as const;
export type Probability = (typeof PROBABILITY)[number];

// ── Customization: custom fields & tags ──
export const CUSTOM_FIELD_TYPE = ['text', 'longtext', 'number', 'boolean', 'select', 'multiselect', 'date', 'url'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPE)[number];
/** Entity types that support custom fields & tags. Extend freely — these are the
 *  object kinds the Customization hub offers when scoping a field. */
export const CUSTOMIZABLE_ENTITIES = [
  'dataCenters', 'devices', 'racks', 'subnets', 'ipAddresses', 'vlans', 'vrfs', 'circuits', 'changeRequests', 'projects',
] as const;
export type CustomizableEntity = (typeof CUSTOMIZABLE_ENTITIES)[number];

// Materials (see Material / MaterialLine / MaterialEvent in types.ts)
/** Material line progress, in order. 'Returned' and 'Cancelled' end a line early. */
export const MATERIAL_LINE_STATUS = ['Planned', 'Ordered', 'Received', 'Kit requested', 'Kitted', 'Delivered to site', 'Issued', 'Installed', 'Consumed', 'Returned', 'Cancelled'] as const;
export type MaterialLineStatus = (typeof MATERIAL_LINE_STATUS)[number];
export const MATERIAL_EVENT_KIND = ['Planned', 'Ordered', 'ETA changed', 'Received', 'Kit requested', 'Kitted', 'Delivered to site', 'Issued', 'Installed', 'Consumed', 'Removed', 'Returned', 'Faulty', 'RMA raised', 'Cancelled', 'Availability checked', 'Reserved', 'Quantity changed', 'Disposition set', 'Sanitised', 'Disposed'] as const;
export type MaterialEventKind = (typeof MATERIAL_EVENT_KIND)[number];
