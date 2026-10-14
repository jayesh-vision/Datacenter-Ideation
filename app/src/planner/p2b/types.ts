/**
 * DCOS — entity interfaces (Data Dictionary).
 * Every entity extends BaseEntity (the system envelope).
 */
import type {
  LifecycleStatus, FacilityStatus, DCTier, Containment, PowerRedundancy,
  RackPurpose, RackStatus, AssetCategory, AssetLifecycle,
  CapacityState, CapacityScope, EquipmentStatus, ResourceType, SubnetPurpose,
  IPStatus, NetworkObjStatus, ChangeType, ChangeStatus, RiskLevel,
  PolicyCategory, Enforcement, ApprovalDecision, Severity, IncidentStatus, IncidentPriority, WorklogKind, MaintenanceStatus,
  DemandType, PlanType, PlanStatus, PlanExecPath, ProjectTemplate, CircuitStatus, CircuitPurpose, PrefixStatus, FhrpProtocol, ServiceProtocol, Role, Priority, DeviceType, DeviceReachability, IfOperStatus,
  AlarmSeverity, AlarmState, MetricType, ConfigChangeStatus, DiscoveryMethod,
  DiscoveryStatus, LinkLayer, ControlType, ControlStatus, DecisionOutcome,
  ComponentKind, CableStatus, CableType, DcimDeviceRole, Platform,
  InterfaceType, PoeType, RfRole, ConsoleType, PowerPortType, PowerOutletType, FeedLeg, WeightUnit, ModuleBayPosition,
  IfDuplex, IfMode, DeviceFace, PowerSupply, PowerPhase, PowerFeedType, PowerFeedStatus,
  Airflow, RackWidth, SubdeviceRole, PoeMode, VdcStatus, ReservationStatus,
  CustomFieldType, ProgramStatus, ProcessNodeType, ActivityStatus,
  CxLevel, AtpSystem, AtpStatus, StepResult, SnagSeverity, SnagStatus, HotoStatus, DeliverableStatus, SignoffRole, SignoffDecision,
  DcSegment, DcTypeKey, DcTypeCoverage, DcCapabilityGap,
} from './enums';

export interface BaseEntity {
  id: string;
  customerId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  createdById: string;
  updatedBy?: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  notes?: string;
  /** Tag ids applied to this record (see Tag). Optional on every entity. */
  tags?: string[];
  /** Custom-field values keyed by CustomField.key. Optional on every entity. */
  customFields?: Record<string, unknown>;
}

// ── Customization: custom fields & tags (apply to any entity) ──
export interface CustomField extends BaseEntity {
  cfId: string;
  /** machine key used in record.customFields, e.g. 'asset_owner' */
  key: string;
  /** display label, e.g. 'Asset owner' */
  label: string;
  type: CustomFieldType;
  /** mock-db entity keys this field applies to, e.g. ['devices','racks'] */
  entityTypes: string[];
  required?: boolean;
  /** choices for select / multiselect */
  choices?: string[];
  description?: string;
  /** ordering hint within a screen */
  weight?: number;
}
export interface Tag extends BaseEntity {
  tagId: string;
  name: string;
  slug: string;
  color: string;
  description?: string;
}

// ── Location hierarchy ──
export interface Enterprise extends BaseEntity { entId: string; name: string; tenantCode: string; headquartersCountry: string; regionCount: number; status: LifecycleStatus; }
export interface Region extends BaseEntity { regId: string; enterpriseId: string; name: string; geo: string; campusCount: number; }
export interface Campus extends BaseEntity { cmpId: string; regionId: string; name: string; latitude: number; longitude: number; city: string; country: string; dataCenterCount: number; }
export interface DataCenter extends BaseEntity {
  dcId: string; campusId: string; siteGroupId?: string; name: string; code: string;
  /** Classification from the data-centre type catalogue (see dcTypes.ts). Drives defaults, filters and build intake. */
  dcTypeKey?: DcTypeKey;
  tier: DCTier; status: FacilityStatus; designPowerKw: number; designCoolingKw: number; totalRacks: number; commissionedDate?: string; latitude: number; longitude: number;
  plannerPlanId?: string;
}
/** Reference row for a data-centre type — the catalogue entry, persisted so it is browsable and countable like every other reference entity. */
export interface DataCenterType extends BaseEntity {
  dctId: string; key: DcTypeKey; name: string; segment: DcSegment; description: string;
  typicalRacksMin: number; typicalRacksMax?: number; powerKwMin: number; powerKwMax?: number; kwPerRackMin?: number; kwPerRackMax?: number;
  cooling: string; redundancy: string; defaultTier: DCTier; coverage: DcTypeCoverage; gaps: DcCapabilityGap[];
  highDensity?: boolean; dcPowerPlant?: boolean; multiTenant?: boolean;
  /** Footprint order within the segment (smallest first). */
  order: number;
}
export interface SiteGroup extends BaseEntity { sgId: string; name: string; slug?: string; parentId?: string; }
export interface RackRole extends BaseEntity { rrId: string; name: string; slug?: string; color?: string; }
export interface RackType extends BaseEntity {
  rtypeId: string; manufacturer?: string; model: string; uHeight: number; widthIn?: RackWidth; formFactor?: string;
  // fidelity (NetBox RackType): physical envelope + unit numbering + weight
  startingUnit?: number; descendingUnits?: boolean;
  outerWidthMm?: number; outerDepthMm?: number; mountingDepthMm?: number;
  weight?: number; weightUnit?: WeightUnit;
}
export interface RackGroup extends BaseEntity { rgId: string; dataCenterId?: string; name: string; slug?: string; }
export interface Building extends BaseEntity { bldId: string; dataCenterId: string; name: string; floorCount: number; grossAreaSqm: number;  plannerPlanId?: string; }
export interface Floor extends BaseEntity { flrId: string; buildingId: string; name: string; level: number; usableAreaSqm: number; floorLoadingKgSqm: number; hallCount: number;  plannerPlanId?: string; }
export interface Hall extends BaseEntity { hallId: string; floorId: string; dataCenterId: string; name: string; gridCols: number; gridRows: number; designPowerKw: number; coolingZoneId?: string; rackCount: number; rackCapacity: number; utilizationPct: number; /** Shell: built, not fitted out. Fitting: works in progress. Live: in service. */ status?: 'Planned' | 'Shell' | 'Fitting' | 'Live'; areaSqm?: number; plannerPlanId?: string; }
export interface Row extends BaseEntity { rowId: string; hallId: string; name: string; gridPosition: string; containment: Containment; rackCount: number;  plannerPlanId?: string; }
export interface Rack extends BaseEntity {
  rackId: string; rowId: string; hallId: string; dataCenterId: string; name: string;
  gridX: number; gridY: number; heightU: number; usedU: number; availableU: number;
  widthMm: number; depthMm: number; maxWeightKg: number; currentWeightKg: number;
  maxPowerKw: number; currentPowerKw: number; powerUtilizationPct: number;
  redundancy: PowerRedundancy; coolingZoneId?: string; thermalDensityKwPerRack: number;
  purpose: RackPurpose; status: RackStatus; liquidCoolingReady: boolean; owner: string;
  roleId?: string; rackTypeId?: string; rackGroupId?: string;
  // fidelity (NetBox Rack): rail width + unit numbering + outer envelope
  widthIn?: RackWidth; startingUnit?: number; descendingUnits?: boolean;
  outerWidthMm?: number; outerDepthMm?: number; mountingDepthMm?: number;
  plannerPlanId?: string;
}
export interface AssetModel extends BaseEntity { amodelId: string; manufacturer: string; model: string; category: AssetCategory; heightU: number; typicalPowerW: number; maxPowerW: number; weightKg: number; formFactor: string; eolDate?: string; }
// NOTE: the former `Asset` entity has been unified into `Device` (see operational fields
// on Device below). Asset is no longer part of the public data model. The AssetModel
// catalog and the AssetCategory/AssetLifecycle/AssetStatus enums remain in use by Device.

// ── Capacity ──
export interface UtilityFeed extends BaseEntity { feedId: string; dataCenterId: string; name: string; capacityKw: number; voltage: number; provider: string; redundancyRole: 'A-side' | 'B-side'; }
export interface Transformer extends BaseEntity { xfmrId: string; feedId: string; name: string; capacityKva: number; loadKw: number; status: EquipmentStatus; }
export interface UPS extends BaseEntity { upsId: string; dataCenterId: string; name: string; capacityKw: number; loadKw: number; loadPct: number; redundancy: PowerRedundancy; runtimeMinutes: number; feedId?: string; status: EquipmentStatus; }
export interface PDU extends BaseEntity { pduId: string; upsId?: string; hallId?: string; name: string; capacityKw: number; loadKw: number; loadPct: number; outletCount: number; outletsUsed: number; }
export interface CoolingZone extends BaseEntity { coolzId: string; dataCenterId: string; name: string; coolingCapacityKw: number; currentLoadKw: number; headroomKw: number; setpointC: number; }
export interface CRAC extends BaseEntity { cracId: string; coolingZoneId: string; name: string; capacityKw: number; type: 'CRAC' | 'CRAH' | 'InRow' | 'RDHx' | 'CDU'; status: EquipmentStatus; supplyTempC: number; returnTempC: number; }
export interface ComputeResource extends BaseEntity { compId: string; scopeType: CapacityScope; scopeId: string; cpuCoresTotal: number; cpuCoresUsed: number; memoryGbTotal: number; memoryGbUsed: number; storageTbTotal: number; storageTbUsed: number; gpuCountTotal: number; gpuCountUsed: number; networkGbpsTotal: number; networkGbpsUsed: number; }
export interface CapacityReservation extends BaseEntity { rsvId: string; resourceType: ResourceType; resourceId: string; state: CapacityState; quantity: number; unit: string; demandRequestId?: string; changeRequestId?: string; expiresAt?: string; status: LifecycleStatus; /** Plan that holds the capacity. */ plannerPlanId?: string; dataCenterId?: string; label?: string; }

// ── Network / IPAM ──
// Aggregate (top-level allocation under an RIR). DCOS keeps the name CIDRBlock.
export interface CIDRBlock extends BaseEntity { cidrId: string; cidr: string; name: string; parentBlockId?: string; vrfId?: string; rirId?: string; dateAdded?: string; totalAddresses: number; allocatedAddresses: number; utilizationPct: number; }
// Prefix (hierarchical subnet). DCOS keeps the name Subnet; parentId builds the prefix tree.
export interface Subnet extends BaseEntity { subnetId: string; cidrBlockId?: string; parentId?: string; cidr: string; name: string; vlanId?: string; vrfId?: string; roleId?: string; status?: PrefixStatus; isPool?: boolean; markUtilized?: boolean; gatewayIp: string; dataCenterId?: string; hallId?: string; totalHosts: number; usedHosts: number; utilizationPct: number; forecastExhaustionDate?: string; state: CapacityState; purpose: SubnetPurpose; plannerPlanId?: string; }
export interface VLAN extends BaseEntity { vlanId: string; vlanNumber: number; name: string; dataCenterId?: string; vxlanId?: string; groupId?: string; roleId?: string; status: NetworkObjStatus; plannerPlanId?: string; }
export interface VRF extends BaseEntity { vrfId: string; name: string; routeDistinguisher: string; dataCenterId?: string; enforceUnique?: boolean; importTargetIds?: string[]; exportTargetIds?: string[]; subnetCount: number; }
export interface IPAddress extends BaseEntity { ipId: string; subnetId: string; address: string; status: IPStatus; roleId?: string; dnsName?: string; description?: string; assetId?: string; deviceId?: string; interfaceId?: string; fhrpGroupId?: string; isPrimary?: boolean; hostname?: string; macAddress?: string; allocatedAt?: string; }
// ── IPAM reference & extended entities (NetBox parity) ──
export interface RIR extends BaseEntity { rirId: string; name: string; slug?: string; isPrivate?: boolean; description?: string; }
export interface IpamRole extends BaseEntity { roleId: string; name: string; slug?: string; weight?: number; color?: string; description?: string; }
export interface IPRange extends BaseEntity { iprId: string; startAddress: string; endAddress: string; vrfId?: string; roleId?: string; status: IPStatus; size: number; description?: string; }
export interface ASN extends BaseEntity { asnId: string; asn: number; rirId?: string; description?: string; }
export interface ASNRange extends BaseEntity { asnrId: string; name: string; rirId?: string; start: number; end: number; }
export interface RouteTarget extends BaseEntity { rtId: string; name: string; description?: string; }
export interface VLANGroup extends BaseEntity { vgId: string; name: string; slug?: string; scope?: string; minVid?: number; maxVid?: number; description?: string; }
export interface FHRPGroup extends BaseEntity { fhrpId: string; protocol: FhrpProtocol; groupId: number; authType?: string; description?: string; }
export interface ServiceTemplate extends BaseEntity { svctId: string; name: string; protocol: ServiceProtocol; ports: number[]; description?: string; }
export interface IpService extends BaseEntity { svcId: string; name: string; protocol: ServiceProtocol; ports: number[]; deviceId?: string; ipAddressIds?: string[]; description?: string; }

// ── Change Management ──
export interface ChangeRequest extends BaseEntity {
  chgId: string; title: string; type: ChangeType; description: string; risk: RiskLevel;
  status: ChangeStatus; priority: Priority; affectedResourceType: ResourceType;
  affectedResourceIds: string[]; dataCenterId?: string; requestedBy: string; requestedById: string;
  assignedTo?: string; assignedToId?: string; scheduledStart?: string; scheduledEnd?: string;
  implementedAt?: string; policyViolations: string[]; approvalRuleId?: string; rollbackPlan?: string; linkedWorkOrderId?: string;
  // A CR may be owned by an external ITSM (ServiceNow etc.). These let DCOS reference it.
  source?: string; externalRef?: string;
  // A CR may belong to a delivery project (governs that project's changes).
  projectId?: string;
  /** Plan (and wave) the change implements. */
  plannerPlanId?: string; plannerWaveId?: string;
}
export interface Policy extends BaseEntity { polId: string; name: string; category: PolicyCategory; rule: string; thresholdField?: string; operator?: string; thresholdValue?: number | string; enforcement: Enforcement; appliesTo?: ResourceType; active: boolean; regoPackage?: string; rego?: string; controlRefs?: string[]; }
// Policy-as-code: compliance frameworks + their controls (automated = OPA-evaluated, manual = attested) + OPA decision log
export interface ComplianceFramework extends BaseEntity { fwId: string; name: string; version?: string; description?: string; owner: string; status: string; }
export interface ComplianceControl extends BaseEntity { ctrlId: string; standard: string; frameworkId?: string; ref: string; title: string; description: string; type: ControlType; policyId?: string; owner: string; status: ControlStatus; lastAssessedAt?: string; evidenceCount: number; }
export interface PolicyDecision extends BaseEntity { decId: string; policyId: string; policyName: string; enforcement: Enforcement; resourceType: ResourceType; resourceId: string; resourceName: string; changeRequestId?: string; input: string; decision: DecisionOutcome; violated: boolean; message: string; evaluatedAt: string; evaluatedBy: string; }

// ── DCIM: reference data (real entities, not strings/enums) ──
export interface Manufacturer extends BaseEntity { mfrId: string; name: string; slug?: string; description?: string; }
export interface DeviceRoleEntity extends BaseEntity { drId: string; name: string; slug?: string; color?: string; description?: string; }
export interface PlatformEntity extends BaseEntity { platId: string; name: string; slug?: string; manufacturer?: string; description?: string; }

// ── DCIM: device types → component templates → devices → components → cables → modules ──
export interface DcimDeviceType extends BaseEntity {
  dtId: string; manufacturer: string; manufacturerId?: string; model: string; slug?: string; partNumber?: string;
  uHeight: number; isFullDepth: boolean; airflow?: Airflow; weight?: number; weightUnit?: WeightUnit;
  role: DcimDeviceRole; platform?: Platform; description?: string; excludeFromUtilization?: boolean;
  frontImage?: string; rearImage?: string;
  // fidelity (NetBox DeviceType): default platform as a real FK + parent/child status
  defaultPlatformId?: string; subdeviceRole?: SubdeviceRole;
}
export interface ModuleType extends BaseEntity { mtId: string; manufacturer: string; model: string; partNumber?: string; description?: string; weight?: number; weightUnit?: WeightUnit; }
// Component template — owned by a device type OR a module type; kind-specific fields are optional.
export interface ComponentTemplate extends BaseEntity {
  ctplId: string; deviceTypeId?: string; moduleTypeId?: string; kind: ComponentKind;
  namePattern: string; label?: string; description?: string;
  ifaceType?: InterfaceType | string; mgmtOnly?: boolean; poeType?: PoeType; rfRole?: RfRole; enabled?: boolean;
  speedMbps?: number; duplex?: IfDuplex; mtu?: number;
  consoleType?: ConsoleType; powerPortType?: PowerPortType; maxDrawW?: number; allocatedDrawW?: number;
  outletType?: PowerOutletType; parentPowerPort?: string; feedLeg?: FeedLeg;
  position?: ModuleBayPosition | string;
  rearPortName?: string; rearPortPosition?: number; positions?: number;
}
export interface VirtualChassis extends BaseEntity { vcId: string; name: string; domain?: string; masterDeviceId?: string; }
export interface Device extends BaseEntity {
  devcId: string; name: string; deviceTypeId: string; rackId?: string; dataCenterId?: string; position?: number; status: string;
  parentDeviceId?: string; parentBayName?: string;
  serial?: string; assetTag?: string; face?: DeviceFace; primaryIp4?: string; deviceRoleId?: string; platformId?: string;
  virtualChassisId?: string; vcPosition?: number; vcPriority?: number;
  // fidelity (NetBox Device): per-instance airflow override + IPv6 primary + out-of-band mgmt IP
  airflow?: Airflow; primaryIp6?: string; oobIp?: string;
  // operational fields absorbed from Asset (asset→device unification)
  assetModelId?: string; hostname?: string; manufacturer?: string; model?: string; category?: AssetCategory; heightU?: number; powerDrawW?: number; ratedThermalW?: number;
  weightKg?: number; lifecycleState?: AssetLifecycle; ownerTeam?: string; warrantyContractId?: string; commissionedDate?: string; decommissionDate?: string;
  /** Plan that ordered, reserved or retires the device. */
  plannerPlanId?: string;
}
export interface InventoryItemRole extends BaseEntity { iirId: string; name: string; slug?: string; color?: string; }
export interface InventoryItem extends BaseEntity { invId: string; deviceId: string; parentId?: string; roleId?: string; name: string; label?: string; manufacturer?: string; partNumber?: string; serial?: string; discovered?: boolean; }
export interface DeviceComponent extends BaseEntity {
  dcompId: string; deviceId: string; kind: ComponentKind; name: string; label?: string; ifaceType?: string; moduleId?: string;
  // interface (L1/L2/L3) fields
  enabled?: boolean; mgmtOnly?: boolean; speedMbps?: number; duplex?: IfDuplex; mtu?: number; macAddress?: string;
  mode?: IfMode; untaggedVlanId?: string; taggedVlanIds?: string[]; lagName?: string;
  // fidelity (NetBox Interface): LAG as a real parent FK, per-instance PoE, fibre-channel WWN, per-interface VRF
  lagId?: string; poeMode?: PoeMode; poeType?: PoeType; wwn?: string; vrfId?: string;
  // pass-through (front/rear) mapping
  rearPortId?: string; rearPortPosition?: number; positions?: number;
}
// A module bay slot on a device instance can hold an installed module of a ModuleType.
export interface Module extends BaseEntity { modId: string; deviceId: string; moduleBayName: string; moduleTypeId: string; }
export interface Cable extends BaseEntity { cblId: string; status: CableStatus; cableType: CableType; label?: string; color?: string; lengthM?: number; aKind: ComponentKind; aComponentId: string; aDeviceId: string; bKind: ComponentKind; bComponentId: string; bDeviceId: string; bundleId?: string; }
// A named grouping of physical cables (e.g. a trunk run between two rooms). NetBox CableBundle analogue.
export interface CableBundle extends BaseEntity { bundleId: string; name: string; description?: string; cableIds: string[]; aLocation?: string; bLocation?: string; }
// Per-U rack reservation held by a user/tenant before hardware is installed. NetBox RackReservation analogue.
export interface RackReservation extends BaseEntity { rsvnId: string; rackId: string; units: number[]; reservedBy: string; tenant?: string; description?: string; status: ReservationStatus; plannerPlanId?: string; expiresAt?: string; }
// A virtual device context within a physical device (multi-tenant routing context). NetBox VirtualDeviceContext analogue.
export interface VirtualDeviceContext extends BaseEntity { vdcId: string; deviceId: string; name: string; identifier?: number; status: VdcStatus; primaryIp4?: string; primaryIp6?: string; }
// Template inventory item on a device type; replicated onto InventoryItem when a device is instantiated. NetBox InventoryItemTemplate analogue.
export interface InventoryItemTemplate extends BaseEntity { iitId: string; deviceTypeId: string; roleId?: string; name: string; label?: string; manufacturer?: string; partNumber?: string; }
// Power distribution (NetBox-style): panel → feed → rack. Complements the facility OT chain (UtilityFeed→UPS→PDU).
export interface PowerPanel extends BaseEntity { ppnlId: string; dataCenterId: string; hallId?: string; name: string; }
export interface PowerFeed extends BaseEntity {
  pfId: string; powerPanelId: string; rackId?: string; pduId?: string; name: string;
  supply: PowerSupply; phase: PowerPhase; voltage: number; amperage: number; maxUtilizationPct: number;
  type: PowerFeedType; status: PowerFeedStatus;
}
export interface ApprovalMatrixRule extends BaseEntity { apruleId: string; name: string; changeType?: ChangeType; riskLevel?: RiskLevel; stages: { order: number; approverRole: Role; requiredCount: number }[]; autoApproveBelowRisk?: RiskLevel; }
export interface ApprovalStep extends BaseEntity { apstepId: string; changeRequestId: string; order: number; approverRole: Role; approverId?: string; decision: ApprovalDecision; decidedAt?: string; comment?: string; }

// ── Circuits (carrier / WAN connectivity) ──
export interface Provider extends BaseEntity { provId: string; name: string; slug?: string; account?: string; asn?: number; portalUrl?: string; description?: string; uptimeSlaPct?: number; restorationHrs?: number; supportTier?: string; supportPhone?: string; contractEnd?: string; }
export interface ProviderNetwork extends BaseEntity { pnId: string; providerId: string; name: string; description?: string; }
export interface CircuitType extends BaseEntity { ctId: string; name: string; slug?: string; color?: string; }
export interface Circuit extends BaseEntity {
  cktId: string; cid: string; providerId: string; circuitTypeId: string; status: CircuitStatus;
  commitRateMbps?: number; description?: string; installDate?: string;
  purpose?: CircuitPurpose;
  // financial / contractual
  monthlyCostUsd?: number; slaUptimePct?: number; contractStart?: string; contractEnd?: string;
  // provisioning lifecycle dates
  orderedAt?: string; provisionedAt?: string; testedAt?: string; activatedAt?: string;
  // diversity: circuits sharing a group serve the same site+purpose and should be path/carrier-diverse
  diversityGroup?: string;
  plannerPlanId?: string; ceaseDate?: string;
}
export interface CircuitTermination extends BaseEntity { ctermId: string; circuitId: string; side: 'A' | 'Z'; dataCenterId?: string; providerNetworkId?: string; deviceId?: string; interfaceId?: string; portSpeedMbps?: number; xconnectId?: string; description?: string; }

// ── NMS ──
export interface ManagedDevice extends BaseEntity { devId: string; assetId?: string; hostname: string; mgmtIp: string; deviceType: DeviceType; vendor: string; model: string; osVersion: string; role: string; dataCenterId?: string; rackId?: string; reachability: DeviceReachability; lastPolledAt?: string; uptimeSeconds: number; sourceSystem: string; }
export interface Interface extends BaseEntity { ifaceId: string; deviceId: string; name: string; adminStatus: IfOperStatus; operStatus: IfOperStatus; speedGbps: number; utilizationPct: number; inErrors: number; outErrors: number; }
export interface Alarm extends BaseEntity { almId: string; deviceId: string; interfaceId?: string; severity: AlarmSeverity; type: string; probableCause: string; state: AlarmState; raisedAt: string; firstRaisedAt?: string; clearedAt?: string; acknowledgedBy?: string; acknowledgedAt?: string; correlatedAlarmIds: string[]; correlationId?: string; ruleId?: string; count?: number; flapCount?: number; incidentId?: string; sourceSystem: string; }
// Threshold rule that raises an alarm when a metric crosses a bound for a duration — the fault analogue of policy-as-code.
export interface AlarmRule extends BaseEntity { ruleId: string; name: string; metric: MetricType; operator: '>' | '>=' | '<' | '<='; threshold: number; severity: AlarmSeverity; durationMins: number; enabled: boolean; scope: string; }
export interface ConfigBackup extends BaseEntity { cfgId: string; deviceId: string; version: string; capturedAt: string; configHash: string; isGolden: boolean; sourceSystem: string; }
export interface ConfigChange extends BaseEntity { cfgchgId: string; deviceId: string; changeRequestId: string; diff: string; status: ConfigChangeStatus; pushedAt?: string; pushedBy?: string; driftDetected: boolean; rollbackConfigId?: string;  plannerPlanId?: string; }
export interface DiscoveryJob extends BaseEntity { discId: string; name: string; scope: string; method: DiscoveryMethod; status: DiscoveryStatus; schedule?: string; startedAt?: string; completedAt?: string; devicesFound: number; linksFound: number; }
export interface TopologyLink extends BaseEntity { topoId: string; aDeviceId: string; zDeviceId: string; layer: LinkLayer; discoveredVia: DiscoveryMethod; status: NetworkObjStatus; }

// ── Operations / breadth ──
export interface IncidentWorklogEntry { at: string; author: string; kind: WorklogKind; text: string; }
export interface Incident extends BaseEntity {
  incId: string; title: string; type: string; severity: Severity; status: IncidentStatus;
  priority?: IncidentPriority;
  affectedResourceType: ResourceType; affectedResourceIds: string[]; dataCenterId?: string;
  detectedAt: string; acknowledgedAt?: string; resolvedAt?: string;
  // SLA targets (minutes), captured at raise-time from the severity policy.
  slaResponseMins?: number; slaResolveMins?: number;
  assignee?: string; reportedBy?: string;
  rootCause?: string; rootCauseId?: string;
  // Cross-module loop: the alarm(s) that triggered this and the change raised to fix it.
  linkedAlarmIds?: string[]; linkedChangeRequestId?: string;
  worklog?: IncidentWorklogEntry[];
  /** Operations extension (RCA, action plan, closure checks) — written by the Operate module. */
  ops?: IncidentOpsExt;
}
// Planned maintenance window — change-driven or standalone; surfaced on the NOC cockpit.
export interface MaintenanceWindow extends BaseEntity {
  mwId: string; title: string; status: MaintenanceStatus;
  dataCenterId?: string; changeRequestId?: string;
  scheduledStart: string; scheduledEnd: string;
  affectedDeviceIds?: string[]; impact: string; owner: string;
  plannerPlanId?: string; plannerWaveId?: string;
}
export interface DemandRequest extends BaseEntity { demId: string; title: string; type: DemandType; requestedQuantity: number; unit: string; targetDate: string; businessJustification: string; status: string; requestedById: string; }

// ── Planning: the front-of-funnel intent. Once Approved it spawns a Change (operational) or a Project (build-out). ──
export interface Plan extends BaseEntity {
  planId: string; title: string; type: PlanType; status: PlanStatus;
  description: string; businessJustification: string;
  dataCenterId?: string; priority: Priority; risk: RiskLevel; ownerName: string;
  targetDate: string; estimatedCost?: number;
  // demand drivers (folded in from the old Demand form)
  demandType?: DemandType; requestedQuantity?: number; unit?: string;
  // type-specific detail (only the relevant ones are filled per plan type)
  racksRequested?: number; powerKwRequested?: number; gpusRequested?: number;
  affectedSubnetIds?: string[]; affectedVlanIds?: string[]; affectedDeviceIds?: string[];
  fromLocation?: string; toLocation?: string; scopeNote?: string;
  // type-specific specifics captured in the wizard (JSON; rendered from a per-type field config)
  detail?: string;
  // execution
  execPath?: PlanExecPath; changeType?: ChangeType; projectTemplate?: ProjectTemplate;
  /** For a Facility Build plan, which programme blueprint to instantiate on execution. */
  blueprintKey?: string;
  linkedChangeRequestId?: string; linkedProjectId?: string; linkedProgramId?: string;
  submittedAt?: string; approvedAt?: string; approvedBy?: string; executedAt?: string;
}

// ── Breadth: Delivery / Procurement / Build / Commissioning / Audit / Documents ──
import type { ProjectStatus, MilestoneStatus, WorkOrderType, WorkOrderStatus, ContractType, BOMType, POStatus, DocType, DocStatus, RAGValue, ProgramType, PermitType, PermitStatus, DesignDocType, DesignDocStatus, DesignDiscipline, ChangeOrderStatus, ChangeOrderReason, TicketStatus, TicketType } from './enums';

export interface Program extends BaseEntity { progId: string; name: string; type: ProgramType; objective: string; status: ProgramStatus; ownerName: string; budget: number; startDate: string; endDate: string; projectCount: number; plannerPlanId?: string; }
export interface Project extends BaseEntity {
  projId: string; programId: string; name: string; status: ProjectStatus; rag: RAGValue; managerName: string;
  dataCenterId?: string; plannedStart: string; plannedEnd: string; percentComplete: number; budget: number; actualSpend: number;
  template?: string; planId?: string;
  /** Planner plan and phase this project delivers. */
  plannerPlanId?: string; planPhaseId?: string;
  // ── Programme orchestration: a project may be a phase of a sequenced build ──
  /** Predecessor projects that must complete before this phase can start. */
  dependsOnProjectIds?: string[];
  /** This phase's position in its programme's build sequence (0-based). */
  phase?: number;
  /** Long-lead procurement runs ahead of the build, overlapping predecessors (so it is never blocked). */
  longLead?: boolean;
  /** Human-readable gate that releases this phase, e.g. "Permits cleared", "Structure complete". */
  startGate?: string;
}
/** A runtime step in a project's execution process (instance of a template process node). */
export interface ProjectActivity extends BaseEntity { paId: string; projectId: string; nodeId: string; name: string; nodeType: ProcessNodeType; status: ActivityStatus; order: number; attaches?: 'procurement' | 'commissioning' | 'hoto'; condition?: string; }
export interface Milestone extends BaseEntity { msId: string; projectId: string; name: string; dueDate: string; status: MilestoneStatus; rag: RAGValue; }
// ── Permits & design documents (front-end of a facility build) ──
/** An uploaded file's metadata. (Prototype: bytes are not persisted — name/size/type only.) */
export interface Attachment { name: string; sizeKb?: number; mime?: string; uploadedAt?: string }
export interface Permit extends BaseEntity {
  permitId: string; name: string; type: PermitType; status: PermitStatus;
  authority: string; referenceNo?: string; owner: string;
  programId?: string; projectId?: string; dataCenterId?: string;
  appliedDate?: string; approvedDate?: string; validFrom?: string; expiryDate?: string; notes?: string;
  /** Uploaded supporting documents (application, approval certificate, etc.). */
  attachments?: Attachment[];
  plannerPlanId?: string;
}
export interface DesignDocument extends BaseEntity {
  ddId: string; name: string; type: DesignDocType; status: DesignDocStatus; discipline?: DesignDiscipline;
  revision: string; author: string; reviewedBy?: string; issuedDate?: string;
  programId?: string; projectId?: string; notes?: string;
  /** Uploaded files / drawing sheets. */
  attachments?: Attachment[];
  plannerPlanId?: string;
}
/** A contractual variation — the only instrument that moves a project's approved budget (and may shift its schedule). */
export interface ChangeOrder extends BaseEntity {
  coId: string; projectId: string; title: string; reason: ChangeOrderReason; status: ChangeOrderStatus;
  budgetDelta: number; scheduleImpactDays: number; description: string;
  requestedBy: string; approvedBy?: string; approvedAt?: string; raisedAt: string; changeRequestId?: string;
}
/** A P2B delivery ticket — an ad-hoc issue or task raised against delivery execution
 *  (a project, task, change request or process step). Distinct from operational Incidents. */
export interface Ticket extends BaseEntity {
  tktId: string; title: string; type: TicketType; status: TicketStatus; priority: Priority;
  description?: string;
  projectId?: string; taskId?: string; changeRequestId?: string; activityId?: string;
  dataCenterId?: string; assignee?: string; reporter: string;
  raisedAt: string; resolvedAt?: string; slaDueAt?: string; isBlocker?: boolean;
}
export interface Vendor extends BaseEntity { vendId: string; name: string; category: string; contactName: string; slaTier: string; rating: number; status: string; }
export interface Contract extends BaseEntity { ctrId: string; vendorId: string; type: ContractType; startDate: string; endDate: string; value: number; status: string; /** Site the contract covers (leases, site maintenance). */ dataCenterId?: string; /** Days of notice to terminate or not renew. */ noticeDays?: number; /** Annual value for running-cost comparisons. */ annualValue?: number; description?: string; }
export interface BOM extends BaseEntity { bomId: string; name: string; type: BOMType; projectId?: string; totalCost: number; status: string; lineCount: number;  plannerPlanId?: string; }
export interface BOMLine extends BaseEntity { bomlId: string; bomId: string; lineNo: number; partNumber: string; description: string; manufacturer: string; quantity: number; unitCost: number; category: string; }
/** A dated payment draw against a PO (on-order / on-delivery / on-acceptance). The time-phased source of committed→actual cost. */
export interface PODraw { label: string; amount: number; dueDate: string; paid: boolean; paidDate?: string }
export interface PurchaseOrder extends BaseEntity { poId: string; bomId?: string; vendorId?: string; plannedCost: number; approvedBudget: number; actualSpend: number; forecastVariance: number; status: POStatus; draws?: PODraw[]; plannerPlanId?: string; planPhaseId?: string; contractId?: string; orderBy?: string; needBy?: string; }
export interface WorkOrder extends BaseEntity { woId: string; type: WorkOrderType; changeRequestId?: string; projectId?: string; rackId?: string; assigneeName: string; status: WorkOrderStatus; scheduledDate: string; }

// ── Acceptance Test Protocol (ATP) ──
export interface Atp extends BaseEntity { atpId: string; projectId: string; name: string; system: AtpSystem; level: CxLevel; status: AtpStatus; witnessedBy?: string; acceptedAt?: string; plannerPlanId?: string; planPhaseId?: string; plannerWaveId?: string; }
export interface AtpStep extends BaseEntity { atpsId: string; atpId: string; stepNo: number; description: string; method: string; expectedResult: string; actualResult?: string; result: StepResult; notes?: string; }
// ── Hand-Over To Operations (HOTO) ──
export interface Hoto extends BaseEntity { hotoId: string; projectId: string; status: HotoStatus; warrantyStart?: string; conditions?: string; }
export interface Snag extends BaseEntity { snagId: string; projectId: string; description: string; severity: SnagSeverity; status: SnagStatus; owner: string; raisedAt: string; closedAt?: string; }
export interface HotoDeliverable extends BaseEntity { hdId: string; hotoId: string; category: string; name: string; status: DeliverableStatus; }
export interface HotoSignoff extends BaseEntity { hsId: string; hotoId: string; role: SignoffRole; name: string; decision: SignoffDecision; signedAt?: string; }
export interface AuditEvent extends BaseEntity { audId: string; entityType: string; entityId: string; action: string; actorName: string; timestamp: string; summary: string; projectId?: string; }
export interface DocumentRec extends BaseEntity {
  docId: string; name: string; type: DocType; ownerName: string; sizeKb: number;
  status?: DocStatus; version?: string; summary?: string; tags?: string[];
  reviewDueAt?: string; steps?: string[];
  sections?: { heading: string; body: string }[];
  linkedEntityType?: string; linkedEntityId?: string; linkedEntityName?: string;
}

import type { TaskStatus, RiskCategory, RiskStatus, Probability, RiskLevel as RL2 } from './enums';
export interface Task extends BaseEntity { taskId: string; projectId: string; name: string; status: TaskStatus; assignee: string; startDate: string; dueDate: string; effortDays: number; milestoneId?: string; }
export interface RiskItem extends BaseEntity { riskId: string; projectId: string; category: RiskCategory; description: string; probability: Probability; impact: Probability; level: RL2; mitigation: string; status: RiskStatus; }

// ── Operate module: customers, services, capacity plans, incident extension ──
/** A customer / tenant / account / business unit that buys services from the estate. */
export interface Customer extends BaseEntity { custId: string; name: string; segment: string; city: string; state: string; plan: string; premium: boolean; accountManager: string; revenueMonthly: number; }
export type ServiceStatus = 'Active' | 'Degraded' | 'Down' | 'Disabled';
/** A sold service (circuit, cabinet lease, workload, application) with its dependency path. */
export interface Service extends BaseEntity {
  svcId: string; name: string; type: string; customerRef: string; dataCenterId: string; deviceId?: string; ifName?: string; rackId?: string;
  pathDeviceIds: string[]; cableIds: string[]; bandwidthMbps: number; utilPct: number; status: ServiceStatus; slaTarget: number; uptime30d: number;
  growthPct: number; revenueMonthly: number; critical: boolean; qty: number; unit: string;
}
export interface CapacityPlanRec extends BaseEntity { cpId: string; dataCenterId: string; dimension: 'Power' | 'Cooling' | 'Space' | 'Ports' | 'Bandwidth'; title: string; amount: number; unit: string; targetDate: string; status: 'Submitted' | 'Approved' | 'Executing' | 'Delivered'; capex: number; }
export interface IncidentOpsExt {
  rca?: { cause: string; confidence: number; evidence: { label: string; ref?: string; at?: number }[]; rejected?: boolean }[];
  actions?: { id: string; step: string; owner: string; expected: string; rollback: string; verify: string; disruptive: boolean; status: 'pending' | 'awaiting-approval' | 'approved' | 'running' | 'done' | 'rejected' }[];
  verification?: { check: string; ok: boolean | null }[];
  feedback?: 'confirmed' | 'rejected';
  changeIds?: string[];
  affected?: { kind: 'NE' | 'Link' | 'Rack' | 'Service' | 'Customer' | 'Facility'; id: string; label: string }[];
  opsLog?: { at: number; who: string; text: string; kind: 'system' | 'human' | 'ai' }[];
}

// ── Work orders: mirror of the Camunda 8 process engine (definitions, instances, tokens, tasks) ──
export type ProcessRecordType = 'incident' | 'changeRequest' | 'workOrder' | 'project' | 'dataCenter' | 'device' | 'customer' | 'plannerPlan';
export type ProcessInstanceState = 'active' | 'completed' | 'incident' | 'cancelled';
export type FlowNodeState = 'active' | 'completed' | 'incident' | 'terminated';
/** A deployed BPMN process (one per file under src/workorders/bpmn). */
export interface ProcessDefinition extends BaseEntity {
  key: string; name: string; version: number; owner: string; description: string; specIds: string[]; lanes: string[];
  /** File stem of the BPMN XML (src/workorders/bpmn/<bpmnKey>.bpmn). */
  bpmnKey: string;
}
/** A running or finished process instance, always bound to a real DCOS record. */
export interface ProcessInstance extends BaseEntity {
  definitionKey: string; businessKey: string; recordType: ProcessRecordType; recordId: string; dataCenterId?: string;
  state: ProcessInstanceState; startedAt: string; endedAt?: string;
  currentElementIds: string[]; completedElementIds: string[]; variables: Record<string, unknown>;
}
/** One visit of a token to a flow node. */
export interface FlowNodeInstance extends BaseEntity {
  instanceId: string; elementId: string; elementName: string; type: string; state: FlowNodeState; startedAt: string; endedAt?: string; assignee?: string;
}
/** A Zeebe user task (inbox item) with its Camunda form. */
export interface ProcessUserTask extends BaseEntity {
  instanceId: string; elementId: string; name: string; formKey: string; candidateRole: string; assignee?: string; dueAt: string;
  state: 'created' | 'completed'; completedAt?: string;
  /** The form data the task was completed with (files as document references, lists as arrays). */
  variables?: Record<string, unknown>;
}
/** An engine incident — a job that failed and needs an operator (not an operational Incident). */
export interface EngineIncident extends BaseEntity { instanceId: string; elementId: string; message: string; }

// ── Estate: edge locations (PoPs and access sites) hanging off a campus ──
export type EdgeLocationStatus = 'on-air' | 'in-progress' | 'planned' | 'failed';
export interface EdgeLocation extends BaseEntity {
  locId: string; kind: 'pop' | 'site'; name: string; campusId: string; regionId: string; city: string; country: string; latitude: number; longitude: number;
  status: EdgeLocationStatus; category: 'Regional' | 'Edge'; neCount: number; discovered: number; roles: Record<string, number>;
  blocker?: 'power' | 'fiber' | 'commissioning' | 'supply' | 'lease' | 'civil' | 'regulatory'; blockerNote?: string;
  passive: { fiberSpans: number; odf: number; racks: number; powerPlant: number; splices: number; patchCords: number; ducts: number };
}

// ── Planner: templates, benchmarks, plans, scenarios, feedback ──────────────
export type PlannerScope = 'rack' | 'pod' | 'hall' | 'retrofit' | 'plant' | 'network' | 'expansion' | 'new-dc' | 'portfolio' | 'migration' | 'edge' | 'server-refresh' | 'network-refresh' | 'rack-replace';
export type PlannerAspect = 'space' | 'power' | 'cooling' | 'network' | 'it' | 'fire' | 'security' | 'sustainability' | 'resilience' | 'operations' | 'supply' | 'schedule' | 'finance' | 'compliance' | 'commissioning' | 'migration' | 'risk';
export type PlannerTemplateKind = 'profile' | 'plan' | 'aspect' | 'ruleset' | 'benchmarkset' | 'demand' | 'document' | 'checklist' | 'blueprint';
export type PlannerParamSource = 'user' | 'requirement' | 'template' | 'benchmark' | 'actual' | 'document' | 'ai';
export type PlannerPlanStatus = 'Draft' | 'In review' | 'Approved' | 'Executing' | 'Completed' | 'Rejected' | 'On hold' | 'Cancelled';
export type PlannerAspectDepth = 'full' | 'summary' | 'skipped';
export type PlannerRuleSeverity = 'hard' | 'soft';
export type PlannerCoolingType = 'air-crah' | 'air-economiser' | 'chilled-water' | 'in-row' | 'rear-door' | 'liquid-to-chip' | 'immersion';

export interface PlannerParamDef {
  key: string; label: string; aspect: PlannerAspect; type: 'number' | 'text' | 'select' | 'bool';
  unit?: string; default?: number | string | boolean; min?: number; max?: number; options?: string[]; help?: string;
  /** Formula in words when the default is derived (shown beside the value). */
  derived?: string;
}
export interface PlannerRuleDef {
  id: string; aspect: PlannerAspect; severity: PlannerRuleSeverity; title: string;
  /** Engine check key (see planner/lib/engine.ts RULE_CHECKS). */
  check: string; threshold?: number; standard?: string; source?: string;
}
export interface PlannerTemplate extends BaseEntity {
  tplId: string; kind: PlannerTemplateKind; name: string; description: string; version: number; status: 'draft' | 'published' | 'deprecated'; ownerName: string;
  scope?: PlannerScope; dcTypeKey?: string; inheritsFrom?: string; appliesTo: { level: 'org' | 'region' | 'site'; refId?: string; label: string };
  params: PlannerParamDef[]; rules: PlannerRuleDef[]; requiredAspects: { aspect: PlannerAspect; depth: PlannerAspectDepth }[];
  outputs: string[]; approvalPath: string[]; executesAs?: 'change' | 'project' | 'programme' | 'portfolio'; blueprintKey?: string; labels: string[];
  /** For demand templates: workload split and phasing. */
  demand?: { gpuPct: number; computePct: number; storagePct: number; phases: { name: string; sharePct: number; monthsFromStart: number }[] };
  /** For document and checklist templates: the sections or items. */
  items?: string[];
}
export interface PlannerBenchmark extends BaseEntity {
  bmId: string; metric: string; label: string; category: 'cost' | 'performance' | 'sizing' | 'leadtime' | 'staffing' | 'sustainability';
  value?: number; low?: number; high?: number; unit: string;
  appliesTo: { dcTypeKey?: string; coolingType?: PlannerCoolingType; climate?: string; regionId?: string; tier?: string };
  source: string; sourceDate: string; indicative: boolean;
}
export interface PlannerPhase { id: string; name: string; goLive: string; itKw: number; halls: number; racks: number; status: 'Planned' | 'Approved' | 'In delivery' | 'Live' }
export interface PlannerRisk { id: string; title: string; domain: 'Facility' | 'Network' | 'Supplier' | 'Commissioning' | 'Regulatory' | 'Finance' | 'Security'; probability: 'Low' | 'Medium' | 'High'; impact: 'Low' | 'Medium' | 'High'; owner: string; mitigation: string; source: PlannerParamSource; evidence?: string }
export interface PlannerPermit { id: string; name: string; authority: string; leadWeeks: number; neededBefore: string; status: 'Not started' | 'Applied' | 'In review' | 'Approved' | 'Expired' }
export interface PlannerApproval {
  step: string; role: string; person?: string; decision: 'Pending' | 'Approved' | 'Rejected' | 'Approved with conditions'; at?: string; conditions?: string;
  /** Position in the approval sequence (steps are decided in order). */
  order?: number;
  /** Why the step was added (template path, amount band from the approval-limit table…). */
  basis?: string;
  /** Reason given with a rejection or with conditions (mandatory for both). */
  reason?: string;
  /** Set when a delegate decided on behalf of the named approver. */
  onBehalfOf?: string;
}
/** One round of approvals: every submission starts a new round; earlier rounds are kept as history. */
export interface PlannerApprovalRound { round: number; submittedAt: string; submittedBy: string; approvals: PlannerApproval[]; outcome: 'Approved' | 'Rejected' | 'Withdrawn' | 'Superseded' }
/** A condition attached to an approval: owned, dated and closed out before execution or completion. */
export interface PlannerCondition { id: string; text: string; owner: string; dueDate?: string; raisedBy: string; raisedAt: string; status: 'Open' | 'Closed'; closedAt?: string; closedBy?: string; evidence?: string; blocksExecution: boolean }
/** Figures frozen at final approval. Later edits create a new revision; the baseline never changes. */
export interface PlannerBaseline {
  at: string; by: string; scenarioId?: string; scenarioName?: string; templateId: string; templateVersion: number;
  params: Record<string, number | string | boolean>; designPowerKw: number; targetGoLive: string; phases: PlannerPhase[];
  capexTotal: number; contingencyUsd: number; opexMonthly: number; bomTotal: number; sourcedTotal?: number; buyTotal?: number;
  schedule: { item: string; orderBy: string; needBy: string; phase: string }[];
  benchmarks: { metric: string; value?: number; low?: number; high?: number }[];
  hardFails: number; softWarns: number; readinessPct: number;
}
/** What was delivered, captured when the plan is completed. */
export interface PlannerCloseout {
  completedAt: string; completedBy: string; deliveredKw: number; actualCapex: number; actualOpexMonthly?: number;
  checklist: { key: string; label: string; ok: boolean; detail: string }[]; notes?: string;
  /** Planned kW against measured draw some time after go-live. */
  measuredKw?: number; measuredAt?: string;
}
/** A wave of work inside an existing site: what is touched, when, under which change, and how it is rolled back. */
export interface PlannerWave {
  id: string; name: string; order: number;
  kind: 'pilot' | 'wave' | 'drain' | 'works' | 'repopulate' | 'soak';
  /** Records in the wave. */
  deviceIds: string[]; rackIds: string[]; serviceIds: string[]; circuitIds?: string[];
  /** Network refresh: which side of each redundant pair this wave touches. */
  side?: 'A' | 'B';
  /** How the work is done (approach for migrations, swap method for racks, transfer method for plant). */
  method?: string;
  /** Where moved equipment goes (target racks) and temporary positions used during the wave. */
  targetRackIds?: string[]; swingRackIds?: string[];
  windowStart: string; windowEnd: string; crewHours?: number;
  rollback: string; acceptance?: string;
  changeRequestId?: string; maintenanceWindowId?: string; atpId?: string;
  status: 'Planned' | 'Scheduled' | 'In progress' | 'Closed' | 'Rolled back' | 'Cancelled';
  closedAt?: string; closedBy?: string; actualDowntimeMin?: number; notes?: string;
  /** IT load moved or changed by the wave (kW), for migrations and retrofits. */
  itKw?: number;
}
/** A site in a multi-site plan: a portfolio allocation row or an edge location. */
export interface PlannerSiteRow {
  id: string; name: string;
  /** Existing data centre, edge location or a new candidate. */
  ref: { kind: 'dataCenter' | 'edgeLocation' | 'candidate' | 'campus'; id?: string };
  /** Edge: variant from the template (e.g. 3-phase with generator, 1-phase with 4 h battery). */
  variant?: string;
  itKw: number; goLive: string; wave?: number;
  /** Portfolio: how the capacity is delivered there. */
  route?: 'expansion' | 'new-dc' | 'hall' | 'pod' | 'edge';
  capexUsd?: number; notes?: string; childPlanId?: string;
  status?: 'Proposed' | 'Accepted' | 'Rejected';
}
/** A candidate plot for a new site, compared before the design is fixed. */
export interface PlannerCandidateSite {
  id: string; name: string; latitude?: number; longitude?: number; regionId?: string; climate?: PlannerPlan['climate'];
  plotHa: number; buildableHa: number; zoning: 'Zoned for data centre' | 'Rezoning needed' | 'Unknown';
  gridOfferMva: number; gridEnergisation: string; gridFirm: boolean; waterM3PerDay: number;
  fibreRoutes: number; kmToPop: number; floodZone: boolean; seismicZone: boolean; landCostUsd: number; tariffUsdPerKwh?: number; incentives?: string;
  chosen?: boolean; notes?: string;
}
/** Plant upgrade: one line of what is added, replaced or uprated. */
export interface PlannerPlantLine {
  id: string; system: 'UPS' | 'Generator' | 'Transformer' | 'Chiller' | 'CRAH' | 'CDU' | 'Switchgear' | 'Battery' | 'Dry cooler';
  action: 'add' | 'replace' | 'uprate';
  /** Existing asset being replaced or uprated, or the frame/zone the new item joins. */
  targetAssetId?: string; targetAssetLabel?: string;
  model?: string; ratingKw: number; ratingKva?: number; qty: number; stage?: number; notes?: string;
}
/** Plant upgrade: one step of the cut-in sequence and the redundancy left while it runs. */
export interface PlannerCutInStep {
  id: string; order: number; title: string; isolatedAssetIds: string[]; isolatedLabel: string;
  transfer: 'Static bypass' | 'Maintenance bypass' | 'Transfer to B path' | 'Temporary generator' | 'Rental chiller' | 'None';
  windowStart: string; windowEnd: string; mitigation: string; rollback: string;
  changeRequestId?: string; maintenanceWindowId?: string; status: 'Planned' | 'Scheduled' | 'Done' | 'Rolled back';
}
/** Network uplift: one path between the two ends. */
export interface PlannerNetworkPath {
  id: string; name: string; providerId?: string; providerName: string; routeId?: string; diversityGroup?: string; sharedRiskGroups: string[];
  linkType: 'Leased wavelength' | 'Leased IP transit' | 'Dark fibre with owned DWDM' | 'ZR optics on dark fibre';
  capacityGbps: number; latencyMs?: number; distanceKm?: number;
  aDeviceId?: string; aInterfaceId?: string; zDeviceId?: string; zInterfaceId?: string;
  monthlyUsd: number; installUsd: number; termMonths: number;
  /** Existing circuit this path upgrades, if any. */
  replacesCircuitId?: string; circuitId?: string;
}
/** Migration: customer consent per affected customer. */
export interface PlannerConsent { customerRef: string; customerName: string; serviceIds: string[]; noticeDays: number; notifiedAt?: string; consentAt?: string; status: 'Not sent' | 'Notified' | 'Consented' | 'Refused'; accountManager?: string; notes?: string }
/** What happens to an existing record in a replace, move or decommission plan. */
export type PlannerDisposition = 'move' | 'retire' | 'dispose' | 'keep' | 'hand-back' | 'cease' | 're-terminate' | 'release' | 'end' | 'renew';
export interface PlannerDispositionRow { recordType: 'device' | 'rack' | 'service' | 'circuit' | 'subnet' | 'vlan' | 'contract' | 'plant'; recordId: string; label: string; disposition: PlannerDisposition; targetRef?: string; waveId?: string; date?: string; costUsd?: number; notes?: string }
/** Refresh: old model (or role) to new model. */
export interface PlannerMappingRow { id: string; oldModel: string; role?: string; count: number; newModel: string; ratio: number; disposition: 'dispose' | 'keep' | 'resell'; newUnits: number; newKw: number; oldKw: number }
/** Placement inside existing racks or empty positions. */
export interface PlannerPlacement {
  mode: 'existing-rack' | 'new-cabinet' | 'empty-positions';
  hallId?: string; rowIds?: string[];
  racks: { rackId: string; startU?: number; endU?: number; kw: number; feedIds?: string[]; outletIds?: string[]; ports?: { deviceId: string; ifaceId: string; speedMbps?: number }[] }[];
  /** Empty grid positions for new cabinets (pod, hall). */
  positions?: { hallId: string; rowId?: string; gridX: number; gridY: number; rackId?: string }[];
}
/** Addresses taken from IPAM for the plan (never generated). */
export interface PlannerIpAllocation { at: string; items: { name: string; purpose: string; cidr: string; parentSubnetId?: string; cidrBlockId?: string; dataCenterId?: string; hallId?: string; vlanNumber?: number; existingVlanId?: string; reuse?: boolean }[]; warnings: string[] }
export interface PlannerDemand { gpuPct: number; computePct: number; storagePct: number; densityKwPerRack: number; tenancy: 'single' | 'multi'; growthPctPerYear: number }
export interface PlannerPlan extends BaseEntity {
  plnId: string; title: string; scope: PlannerScope; status: PlannerPlanStatus; templateId: string; dcTypeKey: string;
  campusId?: string; dataCenterId?: string; regionId?: string; newSiteName?: string; climate: 'cold' | 'temperate' | 'hot-dry' | 'hot-humid';
  intent: string; ownerName: string; requestedBy: string; designPowerKw: number; targetGoLive: string;
  demand: PlannerDemand; phases: PlannerPhase[];
  params: Record<string, number | string | boolean>; paramSources: Record<string, PlannerParamSource>;
  preferredScenarioId?: string; risks: PlannerRisk[]; permits: PlannerPermit[]; approvals: PlannerApproval[];
  programId?: string; processInstanceId?: string; wizardStep: number; aiAssisted: boolean;
  revenuePerKwMonth?: number; tariffUsdPerKwh?: number;
  /** Second site for plans that span two (network: the other end; migration: where the load goes). */
  peerDataCenterId?: string;
  /** Records created in the platform when the plan was executed. */
  artefacts?: PlannerArtefacts;
  // ── governance ──
  /** Revision letter; a change after approval creates the next revision with its own approval. */
  revision?: string; revisionOf?: string; supersededBy?: string;
  /** Template version the plan was approved against (pinned). */
  templateVersion?: number;
  approvalHistory?: PlannerApprovalRound[]; conditions?: PlannerCondition[];
  approvedScenarioId?: string; baseline?: PlannerBaseline; closeout?: PlannerCloseout;
  submittedAt?: string; submittedBy?: string; holdReason?: string; cancelReason?: string;
  /** Wizard step key the planner was last on. */
  wizardStepKey?: string;
  // ── multi-plan ──
  parentPlanId?: string; childPlanIds?: string[];
  // ── scope data (each plan type uses its own) ──
  waves?: PlannerWave[]; sites?: PlannerSiteRow[]; candidates?: PlannerCandidateSite[];
  plantLines?: PlannerPlantLine[]; cutIns?: PlannerCutInStep[]; paths?: PlannerNetworkPath[];
  consents?: PlannerConsent[]; dispositions?: PlannerDispositionRow[]; mapping?: PlannerMappingRow[];
  placement?: PlannerPlacement; ipAllocation?: PlannerIpAllocation;
}
export interface PlannerArtefacts {
  createdAt: string; vehicle: 'programme' | 'project' | 'change' | 'portfolio'; programId?: string; changeRequestId?: string; processInstanceId?: string; bomId?: string;
  purchaseOrderIds: string[]; subnetIds: string[]; vlanIds: string[]; permitIds: string[]; designDocIds: string[]; reservedDeviceIds?: string[]; reservedRackIds?: string[];
  /** Execution run id; steps already done are skipped when an execution is resumed. */
  executionId?: string; steps?: Record<string, 'done' | 'failed' | 'skipped'>; errors?: { step: string; message: string; at: string }[]; completedAt?: string;
  projectIds?: string[]; changeRequestIds?: string[]; maintenanceWindowIds?: string[]; reservationIds?: string[]; rackReservationIds?: string[];
  atpIds?: string[]; circuitIds?: string[]; terminationIds?: string[]; childPlanIds?: string[]; plannedDeviceIds?: string[]; plannedRackIds?: string[];
  ipAddressIds?: string[]; configChangeIds?: string[]; certificateIds?: string[];
  createdSite?: { dataCenterId?: string; buildingIds?: string[]; floorIds?: string[]; hallIds?: string[] };
}
export interface PlannerScenario extends BaseEntity {
  scnId: string; planId: string; name: string; description: string; overrides: Record<string, number | string | boolean>; preferred: boolean;
}
export interface PlannerFeedback extends BaseEntity { fbId: string; capability: string; planId: string; accepted: boolean; note?: string; at: string }
/** Certificate of data sanitisation or disposal for retired equipment (chain of custody). */
export interface DisposalCertificate extends BaseEntity {
  certId: string; plannerPlanId?: string; plannerWaveId?: string; dataCenterId?: string; vendorName: string;
  method: 'Purge (NIST 800-88)' | 'Destroy (shred)' | 'Degauss' | 'Recycle (no data)';
  items: { deviceId?: string; rackId?: string; serial?: string; assetTag?: string; model?: string; drives?: number }[];
  collectedAt?: string; issuedAt?: string; status: 'Pending' | 'Collected' | 'Issued'; reference?: string;
}
/** Standby generator at a site. */
export interface Generator extends BaseEntity { genId: string; dataCenterId: string; name: string; capacityKva: number; capacityKw: number; fuelHours: number; redundancyRole?: 'N' | 'Redundant'; status: EquipmentStatus; model?: string; installedDate?: string; plannerPlanId?: string; }
/** Heat rejection plant (chillers, dry coolers) serving a site's cooling zones and facility water. */
export interface Chiller extends BaseEntity { chlrId: string; dataCenterId: string; name: string; type: 'Air-cooled chiller' | 'Water-cooled chiller' | 'Dry cooler' | 'Adiabatic cooler'; capacityKw: number; loadKw: number; supplyTempC: number; status: EquipmentStatus; servesZoneIds?: string[]; model?: string; installedDate?: string; plannerPlanId?: string; }

// ── Planner · A ── governance and lifecycle (declaration merging adds optional fields only)
/** A named person may decide approval steps for another person's role for a date range. */
export interface ApprovalDelegation extends BaseEntity {
  dlgId: string;
  /** The approver who delegates (holds the role). */
  fromName: string; fromId?: string;
  /** The person who may decide in their place. */
  toName: string; toId?: string;
  role: string; startDate: string; endDate: string; reason?: string;
  status: 'Active' | 'Revoked';
}
/** One field changed by an action, with where the new value came from. */
export interface AuditChange { field: string; from?: unknown; to?: unknown; source?: string }
export interface AuditEvent {
  /** Field-level diff of the change (planner mutations). */
  changes?: AuditChange[];
  /** Plan the event belongs to (so a plan's history can be read in one query). */
  plannerPlanId?: string;
  actorId?: string;
  /** Free text reason given with the action (rejection, hold, cancel…). */
  reason?: string;
}
export interface PlannerApprovalRound {
  /** Scenario the approvers were shown and the amount the approval path was built from. */
  scenarioId?: string; scenarioName?: string; amountUsd?: number; band?: string;
  closedAt?: string;
}
export interface PlannerPlan {
  /** Scenario under review (set at submission; becomes approvedScenarioId on final approval). */
  reviewScenarioId?: string;
  /** CapEx the current approval round was routed on (incl. owned IT) and the delegation-of-authority band. */
  approvalAmountUsd?: number; approvalBand?: string;
  /** Hold: who and when (holdReason already exists). Cancel: who and when. */
  heldAt?: string; heldBy?: string; statusBeforeHold?: PlannerPlanStatus;
  cancelledAt?: string; cancelledBy?: string;
}
export interface PlannerArtefacts {
  /** Delivery process started after approval (never the P06 budget approval again). */
  deliveryProcessKey?: string;
  /** Steps run per execution attempt (most recent last). */
  runs?: { executionId: string; at: string; by: string; ok: boolean; failed: string[] }[];
}
export interface PlannerBenchmark {
  /** Bumped on every edit so baselines can say which value they used. */
  version?: number;
}
// ── Planner · E ──
// Plant upgrade and network uplift. Optional fields merged into existing interfaces (declaration merging, so the
// original lines stay untouched), used by the plan's scope data and by the records execution creates.
/** UPS frame details where recorded (make, model, module slots); planned units carry the plan that ordered them. */
export interface UPS { manufacturer?: string; model?: string; frameSlots?: number; modulesInstalled?: number; moduleKw?: number; plannerPlanId?: string; installedDate?: string }
export interface CRAC { plannerPlanId?: string; model?: string }
export interface Transformer { plannerPlanId?: string; model?: string }
export interface CircuitTermination { plannerPlanId?: string }
export interface PlannerPlantLine {
  /** kW per kVA for transformer and generator ratings (defaults 0.95 for transformers, 0.8 for generators). */
  powerFactor?: number;
  /** Generators: the rating the kVA is quoted at. */
  ratingBasis?: 'Standby (ESP)' | 'Prime (PRP)' | 'Continuous (COP)';
  /** Batteries: runtime at full module load, minutes. */
  runtimeMin?: number;
  /** Cooling zone or feed side the new item serves. */
  zoneId?: string; side?: 'A' | 'B';
  manufacturer?: string; unitCostUsd?: number;
}
export interface PlannerCutInStep {
  /** Stage (phase number, 1-based) the step belongs to. */
  stage?: number;
  /** Plant lines whose new units are live after this step. */
  connectsLineIds?: string[];
  /** Temporary plant brought in for the step and its rating. */
  temporaryPlant?: string; temporaryKw?: number;
  /** Method of procedure reference and who approved it. */
  mopRef?: string; mopApprovedBy?: string;
}
export interface PlannerNetworkPath {
  /** Link-layer or optical encryption on the path. */
  encryption?: 'MACsec' | 'Optical (OTNsec)' | 'IPsec' | 'None';
  /** Route evidence from the carrier (KMZ reference, landing stations, ducts, cable systems). */
  routeNotes?: string;
  /** Port names picked at each end. */
  aPortName?: string; zPortName?: string;
}
export interface PlannerArtefacts { plantUnitIds?: { entity: string; id: string }[]; hotoIds?: string[]; ceasedCircuitIds?: string[] }
// ── Planner · B ──
/* Engine core: per-phase design inputs and scenario phases (declaration merging, additive only). */
export interface PlannerPhase {
  /** Per-phase design inputs that differ from the plan (densityKwPerRack, coolingType, hallDesignKw). */
  params?: Record<string, number | string | boolean>;
}
export interface PlannerScenario {
  /** Phases that replace the plan's phases in this scenario (dates, kW and per-phase inputs). */
  phaseOverrides?: PlannerPhase[];
}
// ── Planner · C ──
/** One model in the equipment list of a rack placement (per rack). */
export interface PlannerEquipmentLine { assetModelId: string; qty: number; role?: string }
/** One existing rack chosen for a densification or liquid retrofit. */
export interface PlannerRetrofitRack { rackId: string; targetKw: number; readiness?: 'ready' | 'kit' | 'new-cabinet' }
/** One rack class of a hall fit-out: how many racks, at what kW, cooled how. */
export interface PlannerRackClass { name: string; racks: number; kw: number; cooling: 'air' | 'liquid' }
/** Inputs of the in-site plan types that are lists rather than single values. */
export interface PlannerInSite {
  /** Rack placement: what goes into each rack (models from the DCIM catalogue). */
  equipment?: PlannerEquipmentLine[];
  /** Hall fit-out: the rack classes (count and kW each). */
  classes?: PlannerRackClass[];
  /** Hall fit-out on a floor with free area (no hall record yet). */
  newHall?: { floorId: string; name: string; areaSqm: number; positions: number; designKw: number };
  /** Retrofit: the existing racks converted, with their target kW. */
  retrofit?: PlannerRetrofitRack[];
  /** Retrofit: free positions held as swing space while rows are drained. */
  swingRackIds?: string[];
}
export interface PlannerPlan { inSite?: PlannerInSite }
/** Records an in-site plan creates at execution, beyond the shared artefact lists. */
export interface PlannerArtefacts { rowIds?: string[]; pduIds?: string[]; powerFeedIds?: string[]; cableIds?: string[]; milestoneIds?: string[] }
export interface PDU { plannerPlanId?: string }
export interface PowerFeed { plannerPlanId?: string }
export interface Cable { plannerPlanId?: string }
export interface Milestone { plannerPlanId?: string }
export interface PlannerPlacement {
  /** When the placement was accepted. */
  acceptedAt?: string;
  /** New rows a pod or hall creates on grid lines that have no row record. */
  newRows?: { hallId: string; gridY: number; name: string }[];
}
// ── Planner · D ──
// Site builds (new data centre, expansion, portfolio, edge). Declaration merging adds optional
// fields to the planner interfaces above without touching their lines.
export interface PlannerPermit {
  /** Plan phase whose project this permit gates (defaults to the first phase). */
  gatesPhaseId?: string;
  /** Blueprint project key the permit gates, e.g. 'site-construction', 'substation', 'power-drop'. */
  gatesProjectKey?: string;
  /** Grid uprate permits: facility kW the uprate adds to the intake once energised. */
  upliftKw?: number;
  /** Date the uprate is energised (defaults to the later of needed-before and the earliest decision). */
  energisedBy?: string;
  /** Date the application was filed (the decision is expected lead weeks after it). */
  appliedAt?: string;
  /** Multi-site plans: the site row the permit belongs to. */
  siteRef?: string;
}
export interface PlannerSiteRow {
  /** Edge: supply capacity recorded at survey (kVA). */
  supplyKva?: number;
  /** New locations and candidates: position. */
  latitude?: number; longitude?: number;
  /** Edge: where the location is. */
  city?: string; country?: string;
}
export interface PlannerArtefacts {
  /** Per-site work orders (process instances) started for edge rollouts. */
  workOrderIds?: string[];
  /** Edge locations created or moved to in progress by the plan. */
  edgeLocationIds?: string[];
  /** Programme projects by initiation key (`<phase>:<blueprint key>`), so permits, ATPs and work orders link to the right one on a resumed run. */
  projectByUid?: Record<string, string>;
}

// ── Delivery chain · plan → programme → project → work order → change request (contract for the delivery revamp) ──
/** Change classes: standard changes use a pre-approved template; normal go through the approval matrix and the change board; emergency take the fast path with a review afterwards. */
export type ChangeClass = 'Standard' | 'Normal' | 'Emergency';
export interface ChangeRequest {
  changeClass?: ChangeClass;
  /** Standard change template the change was raised from. */
  standardTemplateId?: string;
  /** The work order this change authorises (one change per work order). */
  workOrderId?: string;
  programId?: string;
  /** BPMN element of the project process that raised the work order and this change. */
  projectStepId?: string;
  implementationPlan?: string; testPlan?: string; backoutPlan?: string;
  /** Services and customers affected (from impact analysis at submission). */
  impactSummary?: string; affectedServiceIds?: string[]; affectedCustomerIds?: string[];
  /** Change board meeting the change goes to (normal changes). */
  cabDate?: string;
  /** Freeze the window falls in, if any (only emergency changes may proceed). */
  freezeId?: string;
  /** Post-implementation review (always for emergency and failed changes). */
  review?: { outcome: 'Successful' | 'Successful with issues' | 'Failed' | 'Rolled back'; notes: string; by: string; at: string; lessons?: string };
  submittedAt?: string; approvedAt?: string; closedAt?: string;
}
export interface WorkOrder {
  title?: string; description?: string;
  programId?: string; plannerPlanId?: string; dataCenterId?: string;
  /** BPMN element of the project process the work order belongs to. */
  projectStepId?: string;
  /** P10 work-order process instance. */
  processInstanceId?: string;
  /** Internal technician or a contractor company from the vendor list. */
  assigneeKind?: 'internal' | 'contractor';
  contractorVendorId?: string; crew?: string[];
  plannedStart?: string; plannedEnd?: string; actualStart?: string; actualEnd?: string;
  deviceIds?: string[]; rackIds?: string[];
  /** Site access request raised for the crew (P12). */
  accessRequestId?: string;
  /** `performedBy`: the technician or crew who did the work; `by`: who confirmed the sign-off. */
  signOff?: { by: string; at: string; notes?: string; customerWitness?: string; performedBy?: string };
  /** Standard change template that covers this kind of work (raises a standard change). */
  standardTemplateId?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
}
/** A pre-approved change template. Work matching it raises a standard change that needs no change board. */
export interface StandardChangeTemplate extends BaseEntity {
  stdId: string; name: string; description: string;
  workTypes: WorkOrderType[]; changeType: ChangeType;
  /** Limits inside which the template applies (e.g. up to 10 kW added, no critical service). */
  limits: { maxKw?: number; maxDevices?: number; criticalServicesAllowed: boolean; liveSiteAllowed: boolean };
  steps: string[]; backout: string;
  owner: string; approvedAt: string; reviewDue: string;
  /** Suspended after a failure until reviewed; changes then go as normal. */
  status: 'Active' | 'Suspended' | 'Retired';
  usedCount: number; failedCount: number; lastFailureAt?: string;
}
/** A period in which only emergency changes may be implemented (site or estate wide). */
export interface ChangeFreeze extends BaseEntity { frzId: string; name: string; dataCenterId?: string; start: string; end: string; reason: string; allows: 'Emergency only' | 'None'; owner: string }


// ── Delivery · D1 ──
export interface WorkOrder {
  /** Method-statement checklist progress recorded on the work order (setChecklistItem). */
  checklist?: { step: string; done: boolean; by?: string; at?: string }[];
}


import type { MaterialLineStatus, MaterialEventKind } from './enums';

// ── Materials ────────────────────────────────────────────────────────────────
// The supply chain platform is the system of record for the catalogue, stock, receiving,
// kitting, transport and returns; the ERP for purchase orders and goods receipts. DCOS mirrors
// what it needs read-only (Material, PurchaseOrderLine, GoodsReceipt), sends requests to the
// platform (SupplyRequest) and owns the material lines of its projects, work orders and
// changes (MaterialLine) with the events that moved them (MaterialEvent). Installed equipment
// stays mastered in DCOS: installing or removing a serialised item updates its Device.

/** Who a mirrored record or event came from. */
export type MaterialSource = 'DCOS' | 'Supply chain' | 'ERP';

/** A catalogue item, mirrored from the supply chain platform. */
export interface Material extends BaseEntity {
  matId: string; partNumber: string; description: string; manufacturer: string;
  /** Serialised items are tracked one by one (each becomes a Device when installed); consumables by quantity. */
  kind: 'Serialised' | 'Consumable';
  category: 'Rack' | 'Compute' | 'Network' | 'Optics' | 'Cabling' | 'Power' | 'Cooling' | 'Plant' | 'Mounting' | 'Spares' | 'Other';
  uom: 'each' | 'm' | 'box' | 'set';
  /** Equipment model a serialised item installs as. */
  assetModelId?: string;
  unitCost: number; leadWeeks?: number;
  /** Reference in the supply chain platform. */
  scpRef: string;
}

/** A purchase order line, mirrored read-only from the ERP. */
export interface PurchaseOrderLine extends BaseEntity {
  polId: string; poId: string; lineNo: number; materialId: string; bomLineId?: string;
  quantity: number; unitCost: number; needBy?: string;
  /** Expected delivery date reported by the supplier (via the ERP). */
  eta?: string;
  receivedQty: number;
  status: 'Open' | 'Partially received' | 'Received' | 'Cancelled';
  erpRef: string;
}

/** A goods receipt posted in the ERP against a purchase order, mirrored read-only. */
export interface GoodsReceipt extends BaseEntity {
  grId: string; poId: string; dataCenterId?: string; receivedAt: string;
  lines: { poLineId: string; quantity: number; serials?: string[] }[];
  erpRef: string;
}


/**
 * What a project step, a work order and its change need (direction 'In') or take out of the
 * estate (direction 'Out': removed equipment going back to stores, RMA or disposal).
 * Lines are planned per project step from the BOM; when the step raises its work orders each
 * work order gets its own lines (workOrderId set; changeRequestId = the work order's change).
 */
export interface MaterialLine extends BaseEntity {
  mlId: string; materialId: string; description: string; kind: Material['kind']; uom: Material['uom'];
  direction: 'In' | 'Out';
  quantity: number;
  projectId?: string; projectStepId?: string; programId?: string; dataCenterId?: string;
  workOrderId?: string; changeRequestId?: string;
  bomLineId?: string; poLineId?: string;
  /** Where the item comes from: bought for the job, taken from stock, or reused from the estate. */
  source: 'Purchase' | 'Stock' | 'Reuse';
  status: MaterialLineStatus;
  needBy?: string; eta?: string;
  /** Running quantities. `faulty` counts items found faulty (on arrival or at install). */
  qty: { received: number; kitted: number; delivered: number; used: number; returned: number; faulty: number };
  /** Serialised: devices reserved for the line (stock or ordered units) and the ones actually installed or removed. */
  deviceIds?: string[]; installedDeviceIds?: string[]; serials?: string[];
  /** Open request in the supply chain platform covering this line. */
  supplyRequestId?: string;
  notes?: string;
}

/** A request DCOS sent to the supply chain platform, with the platform's progress. */
export interface SupplyRequest extends BaseEntity {
  srId: string;
  kind: 'Reservation' | 'Kit' | 'Return' | 'RMA';
  status: 'Sent' | 'Accepted' | 'In progress' | 'Delivered' | 'Completed' | 'Rejected' | 'Cancelled';
  dataCenterId?: string; projectId?: string; workOrderId?: string; changeRequestId?: string;
  materialLineIds: string[];
  /** Where the kit goes (site store, staging area, rack row) or where a return is collected. */
  deliverTo?: string; needBy?: string; eta?: string;
  /** RMA: the vendor and the faulty serials. */
  vendorId?: string; serials?: string[]; reason?: string;
  scpRef: string; sentAt: string; sentBy: string;
  history: { at: string; status: SupplyRequest['status']; note?: string }[];
}


/** One thing that happened to a material line (the audit trail behind its status). */
export interface MaterialEvent extends BaseEntity {
  meId: string; at: string; kind: MaterialEventKind; source: MaterialSource; by: string;
  materialLineId: string; materialId: string; quantity: number;
  deviceId?: string; serial?: string;
  projectId?: string; workOrderId?: string; changeRequestId?: string; supplyRequestId?: string;
  note?: string;
}

/** Items sold in packs (a box of 500 cage nuts): how many pieces one unit holds. Quantities are always in units of `uom`. */
export interface Material { packSize?: number }

// Material links on existing records.
export interface BOMLine {
  /** Catalogue item the line resolves to. */
  materialId?: string;
  /** Project and project step (BPMN wait_<step>) the line is needed for. */
  projectId?: string; projectStepId?: string;
  needBy?: string;
}
export interface StandardChangeTemplate {
  /** Materials every work order under this template takes (e.g. rails, blanking panels, patch cords). */
  kit?: { materialId: string; quantity: number }[];
}
export interface WorkOrder {
  /** When the technician recorded what was used and returned (the "Record materials" step). */
  materialsRecordedAt?: string; materialsRecordedBy?: string;
}
export interface Device {
  /** Material line the unit was installed or removed under, and by which work order. */
  materialLineId?: string; installedByWorkOrderId?: string; removedByWorkOrderId?: string;
}

// ── Materials at change level: availability, reservation, retired equipment ──
/** Where the supply chain platform says a line's items can come from, as of `checkedAt`. */
export interface MaterialAvailability {
  checkedAt: string;
  /** Free (unreserved) quantity in the site's own store. */
  atSite: number;
  /** Free quantity at the central depot, and how many days a transfer to the site takes. */
  atDepot: number; depotDays?: number;
  /** Quantity on open purchase orders for this item and its expected date. */
  onOrder: number; onOrderEta?: string;
  /** What is still missing after site + depot + on order. */
  shortfall: number;
  /** The platform's suggested source for the line. */
  bestSource: 'Site store' | 'Depot transfer' | 'On order' | 'Purchase needed';
  /** Date the full quantity can be at the site, when known. */
  readyBy?: string;
}
/** What happens to a removed (direction 'Out') item. */
export type RetiredDisposition = 'Return to stock' | 'Redeploy' | 'Return to vendor (RMA)' | 'Dispose';
export interface MaterialLine {
  /** Last availability answer from the platform (incoming lines). */
  availability?: MaterialAvailability;
  /** Quantity the platform holds for this line (Reservation request). */
  reservedQty?: number;
  /** Removed equipment: the planned disposition, whether it stores data, and the sanitisation record. */
  disposition?: RetiredDisposition;
  dataBearing?: boolean;
  sanitisation?: { method: 'Wipe (NIST 800-88 purge)' | 'Degauss' | 'Shred' | 'Crypto erase'; certificateNo?: string; at?: string; by?: string; witness?: string };
  /** Disposal certificate (DisposalCertificate) the line's units were issued under. */
  disposalCertificateId?: string;
  /** Added or changed after the change was approved (shown to approvers and in the review). */
  changedAfterApproval?: boolean;
}


// ── Estate model additions (import-ready) ───────────────────────────────────
// Twelve additive extensions so DCOS can hold everything the DCO inventory template /
// NeoCloud backup carries (sites → rooms → racks → devices, plant, cooling, GPU, monitoring,
// commercial). Nothing existing changes; every field is optional on existing records.

/** 1. External key: where an imported record came from and its ID there (re-imports match on it). */
export interface ExternalRef { source: string; id: string; importedAt?: string }
export interface BaseEntity { extRef?: ExternalRef }

/** 2. Site attributes. */
export type SiteCategory = 'Central' | 'Regional' | 'Edge';
export type BusinessModel = 'colocation' | 'neocloud' | 'cloud' | 'enterprise' | 'network';
export interface DataCenter {
  category?: SiteCategory; businessModel?: BusinessModel;
  /** IANA timezone, e.g. America/Chicago. */
  timezone?: string; designPue?: number; coolingRedundancy?: 'N' | 'N+1' | '2N';
  operatorName?: string; address?: string; city?: string; state?: string; country?: string;
}

/** 3. Room types (a Hall is any room on a floor; data and AI halls hold racks, plant rooms hold plant). */
export type RoomType = 'Data hall' | 'AI hall' | 'Meet-me room' | 'Network room' | 'Plant room' | 'UPS room' | 'Battery room' | 'NOC';
export interface Hall { roomType?: RoomType; coolingMethod?: 'Air' | 'Liquid' | 'Hybrid'; containment?: 'Cold aisle' | 'Hot aisle' | 'None' }

/** 4. Rack attributes. */
export interface Rack {
  density?: 'standard' | 'ai';
  /** Liquid-cooled rack and the CDU (Cdu) that feeds it. */
  liquidCooled?: boolean; cduId?: string;
  /** Upstream feeds of the A and B side (UtilityFeed or PowerFeed ids). */
  feedAId?: string; feedBId?: string;
  /** Colocation: the customer leasing the rack and the power they bought. */
  ownerKind?: 'operator' | 'tenant'; tenantCustomerId?: string; contractedKw?: number;
}

/** 5. Device attributes. */
export type NetworkLayer = 'core' | 'spine' | 'leaf' | 'access';
export type GpuModel = 'B200 SXM 192 GB' | 'H200 SXM 141 GB' | 'H100 SXM 80 GB' | 'A100 SXM 80 GB' | 'L40S PCIe 48 GB' | 'T4 PCIe 16 GB' | 'Gaudi 3 OAM 128 GB' | 'Max 1550 OAM 128 GB';
export interface GpuSpec { model: GpuModel | string; vendor: 'NVIDIA' | 'Intel' | 'AMD' | string; count: number; cooling: 'air' | 'liquid'; driver?: string; firmware?: string; clusterId?: string }
export interface Device {
  networkLayer?: NetworkLayer; wanEdge?: boolean;
  /** Polled by a monitoring collector (Collector) or deliberately not monitored. */
  monitored?: boolean; collectorId?: string;
  osVersion?: string; macAddress?: string;
  ownerKind?: 'operator' | 'tenant'; tenantCustomerId?: string;
  /** GPU servers: the accelerators fitted and the cluster the node belongs to. */
  gpu?: GpuSpec;
}

/** 6. GPU cluster (pod): the nodes are Devices with gpu.clusterId = this id. */
export interface GpuCluster extends BaseEntity {
  gclId: string; name: string; dataCenterId: string; hallId?: string;
  scheduler: 'Kubernetes' | 'Slurm' | string; fabric: string; gpuModel: GpuModel | string; cooling: 'air' | 'liquid';
  status?: 'Planned' | 'Live' | 'Degraded' | 'Retired';
}

/** 7. Cable details and routing sessions (logical adjacencies kept apart from physical cables). */
export type LinkRole = 'Fabric' | 'Uplink' | 'Backhaul' | 'Peering' | 'Access';
export interface Cable { role?: LinkRole; capacityMbps?: number; strand?: string; aPatchPort?: string; bPatchPort?: string; carrierCircuitId?: string }
export interface RoutingSession extends BaseEntity {
  rsId: string; protocol: 'BGP' | 'OSPF' | 'ISIS' | 'LSP' | string; role?: LinkRole;
  aDeviceId: string; aIfName?: string; zDeviceId: string; zIfName?: string;
  capacityMbps?: number; dataCenterId?: string; state?: 'Established' | 'Down' | 'Planned';
}

/** 8. Services across several racks or devices. */
export interface Service { rackIds?: string[]; startDate?: string; currency?: 'USD' | 'INR' | 'EUR' | 'GBP' | string }

/** 9. Power plant: 48 V DC plant, plus fields on UPS, generators and utility feeds. */
export interface DcPlant extends BaseEntity {
  dcpId: string; kind: 'Rectifier' | 'Battery bank'; name: string; dataCenterId: string; hallId?: string;
  volts?: number; ah?: number; ratedOutput?: string; capacityKw?: number; autonomyH?: number; lastTestDate?: string;
  status?: EquipmentStatus;
}
export interface UPS { hallId?: string; serial?: string }
export interface Generator { fuelTankLitres?: number; lastTestDate?: string; lastTestResult?: 'Pass' | 'Fail' }
export interface UtilityFeed { supply?: 'AC' | 'DC'; ratingText?: string; currentA?: number; normalRole?: 'Active' | 'Standby'; utilityAccount?: string }

/** 10. Coolant distribution unit (liquid loop); racks point at it with Rack.cduId. */
export interface Cdu extends BaseEntity {
  cduId: string; name: string; dataCenterId: string; hallId?: string; coolingZoneId?: string;
  capacityKw: number; nominalFlowLpm: number; designSupplyC?: number; vendor?: string; model?: string;
  status?: EquipmentStatus;
}

/** 11. Environment sensor (readings arrive live from the BMS; DCOS keeps where it is and how to match it). */
export interface EnvSensor extends BaseEntity {
  snsId: string; name: string; dataCenterId: string; hallId?: string; rackId?: string;
  kind: 'Temperature + humidity' | 'Temperature' | 'Humidity' | 'Leak' | 'Smoke' | 'Differential pressure' | string;
  position?: string; bmsPoint?: string; collectorId?: string;
}

/** 12. Monitoring source; devices point at it with Device.collectorId. Integrations stay with Databyte; DCOS keeps the reference. */
export interface Collector extends BaseEntity {
  colId: string; name: string; dataCenterId: string;
  protocol: 'SNMP' | 'gNMI' | 'Redfish' | 'DCGM exporter' | 'Modbus TCP' | 'BACnet' | 'Syslog' | string;
  domain: 'Network' | 'Facility' | 'Compute' | 'GPU';
  hostIp?: string; covers?: string; status?: 'Healthy' | 'Degraded' | 'Down';
}

/** Added by the estate data pass (Agent A): the serial number of an installed module (line card), as the template's Modules sheet carries it. */
export interface Module { serial?: string }

/** 13. Imported alarm history (DCO workbook Snapshot_Alerts): the site, the node name when the node is not in the
 *  inventory (deviceId is then empty), the workbook's alarm scope and the link or rack it names. */
export interface Alarm { dataCenterId?: string; nodeName?: string; scope?: string; linkRef?: string }
