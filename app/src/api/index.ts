/* Public data API for the UI. Every function is async and returns plain JSON
   shapes from ./types. Today they resolve against the in-memory mock in
   src/mock/; to go live, replace each body with a fetch to the matching REST
   endpoint (suggested paths in the comments) and keep the signatures. */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as S from '../mock/server';
import { ask, suggestions, type Answer, type Ctx } from '../mock/sentinel';
import type { ActionStep, CapacityPlan, Change, ChangeStatus, DcimCr, DcimRunResult, Persona, ReconTask } from './types';
import { PERSONAS, PERSONA_BY_ID, type PersonaDef, type PersonaVocab } from '../mock/personas';
import { GEOS, GEO_BY_ID, type Geo, type GeoDef } from '../mock/geo';

const LATENCY = 90;
const wait = <T,>(f: () => T): Promise<T> => new Promise(res => setTimeout(() => res(structuredClone(f())), LATENCY));
const mutate = <T,>(f: () => T): Promise<T> => new Promise((res, rej) => setTimeout(() => { try { res(f()); } catch (e) { rej(e); } }, 60));

/* change feed: a real backend would push this over SSE / websocket */
export const onDataChange = S.subscribe;
export const clockNow = () => S.now();

/* ---- persona (datacenter business model): one setting for the whole estate */
export const getPersona = (): Persona => S.getPersona();                                            // GET /settings/persona
export const setPersona = (p: Persona) => mutate(() => S.setPersona(p));                             // PUT /settings/persona
export { PERSONAS, PERSONA_BY_ID };
export type { PersonaDef, PersonaVocab };
/* synchronous vocabulary for render-time strings in components that already refetch on data change */
export const vocabNow = (): PersonaVocab => PERSONA_BY_ID[S.getPersona()].vocab;
export function usePersona(): { persona: Persona; def: PersonaDef; vocab: PersonaVocab } {
  const [p, setP] = useState<Persona>(S.getPersona());
  useEffect(() => onDataChange(() => setP(S.getPersona())), []);
  return { persona: p, def: PERSONA_BY_ID[p], vocab: PERSONA_BY_ID[p].vocab };
}

/* ---- geography (India / USA): places, customers, people, currency — one setting for the whole estate */
export const getGeo = (): Geo => S.getGeo();                                                        // GET /settings/geography
export const setGeo = (g: Geo) => mutate(() => S.setGeo(g));                                         // PUT /settings/geography
export { GEOS, GEO_BY_ID };
export type { Geo, GeoDef };
export const geoNow = (): GeoDef => S.geoDef();
export function useGeo(): { geo: Geo; def: GeoDef } {
  const [g, setG] = useState<Geo>(S.getGeo());
  useEffect(() => onDataChange(() => setG(S.getGeo())), []);
  return { geo: g, def: GEO_BY_ID[g] };
}
/* the first site of the active geography — the default where a screen needs a datacenter */
export const defaultDcId = () => S.heroDcId();
export const heroNeId = () => S.heroNeId();

/* ---- estate & inventory */
export const getEstate = () => wait(S.estate);                                                     // GET /estate
export const getLocations = (q: Parameters<typeof S.locations>[0] = {}) => wait(() => S.locations(q)); // GET /locations?kind&status&circle
export const getDatacenters = () => wait(S.datacenters);                                           // GET /datacenters
export const getDatacenter = (id: string) => wait(() => S.datacenter(id));                         // GET /datacenters/:id
export const getNetworkElements = (q: Parameters<typeof S.networkElements>[0] = {}) => wait(() => S.networkElements(q)); // GET /network-elements?dcId
export const getNetworkElement = (id: string) => wait(() => S.networkElement(id));                // GET /network-elements/:id
export const getInterfaces = (neId: string) => wait(() => S.interfacesOf(neId));                   // GET /network-elements/:id/interfaces
export const getLinks = (q: Parameters<typeof S.linksOf>[0] = {}) => wait(() => S.linksOf(q));      // GET /links?neId&dcId&protocol
export const getLink = (id: string) => wait(() => S.link(id));                                     // GET /links/:id
export const getSitePhysical = (dcId: string) => wait(() => S.sitePhysical(dcId));                 // GET /datacenters/:id/physical (PDUs, cords, cooling coverage, panels, trunks, SPOFs)
export const getDevicePhysical = (neId: string) => wait(() => S.devicePhysical(neId));            // GET /network-elements/:id/physical (power path, cooling, cable paths)
export const getCablePath = (linkId: string) => wait(() => S.cablePath(linkId));                   // GET /links/:id/cable-path
export const getWhatIf = (dcId: string, assetId: string) => wait(() => S.whatIf(dcId, assetId));  // GET /datacenters/:id/what-if?asset
export const getSiteSafety = (dcId: string) => wait(() => S.siteSafety(dcId));                   // GET /datacenters/:id/safety (fire, leak, access)
export const getSiteAccess = (dcId: string) => wait(() => S.siteAccess(dcId));                   // GET /datacenters/:id/access-log (visits, badge events, security exceptions, access review)
export const getSiteLifecycle = (dcId: string) => wait(() => S.siteLifecycle(dcId));             // GET /datacenters/:id/lifecycle (warranty, support, RMA, spares)
export const getDeviceLifecycle = (neId: string) => wait(() => S.deviceLifecycle(neId));         // GET /network-elements/:id/lifecycle
export const getSitePm = (dcId: string) => wait(() => S.sitePm(dcId));                           // GET /datacenters/:id/maintenance-plan
export const getOnCall = (dcId: string) => wait(() => S.onCall(dcId));                            // GET /datacenters/:id/on-call
export const getIncidentOps = (id: string) => wait(() => S.incidentOps(id));                      // GET /incidents/:id/operations (ITSM, paging, customer notices)
export const getProblems = () => wait(() => S.problems());                                       // GET /problems
export const getResilienceTests = (dcId: string) => wait(() => S.resilienceTests(dcId));          // GET /datacenters/:id/resilience-tests
export const getColocationOrders = (q: { dcId?: string; customerId?: string } = {}) => wait(() => S.colocationOrders(q)); // GET /colocation/orders?dcId&customerId
export const getTopology = (dcId: string) => wait(() => S.topology(dcId));                         // GET /datacenters/:id/topology

/* ---- DCIM (Plan & Build): the inventory record — sites, halls, rows, racks, devices, ports, cables, types, power distribution */
export const getDcim = (q: { dcId?: string } = {}) => wait(() => S.dcim(q));                       // GET /dcim?dcId (sites, halls, rows, racks, power panels, feeds)
export const getDcimDevices = (q: Parameters<typeof S.dcimDevices>[0] = {}) => wait(() => S.dcimDevices(q)); // GET /dcim/devices?dcId&rackId&typeId
export const getDcimDevice = (id: string) => wait(() => S.dcimDevice(id));                         // GET /dcim/devices/:id (with ports, power ports, bays)
export const getDcimCables = (q: Parameters<typeof S.dcimCables>[0] = {}) => wait(() => S.dcimCables(q)); // GET /dcim/cables?dcId&kind&deviceId
export const getDcimTypes = () => wait(S.dcimTypes);                                               // GET /dcim/device-types (+ module types, manufacturers, roles, platforms)
export const getDcimType = (id: string) => wait(() => S.dcimType(id));                             // GET /dcim/device-types/:id
export const getDcimRack = (id: string) => wait(() => S.dcimRack(id));                             // GET /dcim/racks/:id (elevation, PDUs, cords, cables)
export const getDcimFreeSlots = (rackId: string) => wait(() => S.dcimFreeSlots(rackId));           // GET /dcim/racks/:id/free-units
export const createRack = (x: Parameters<typeof S.dcimCreateRack>[0], cr: DcimCr) => mutate(() => S.dcimRun('createRack', [x], cr) as DcimRunResult<string>);         // POST /dcim/racks
export const installDevice = (x: Parameters<typeof S.dcimInstallDevice>[0], cr: DcimCr) => mutate(() => S.dcimRun('installDevice', [x], cr) as DcimRunResult<string>); // POST /dcim/devices (planned)
export const setDeviceStatus = (id: string, to: Parameters<typeof S.dcimSetDeviceStatus>[1], cr: DcimCr) => mutate(() => S.dcimRun('setDeviceStatus', [id, to], cr)); // PATCH /dcim/devices/:id
export const addDeviceType = (x: Parameters<typeof S.dcimAddType>[0]) => mutate(() => S.dcimAddType(x));          // POST /dcim/device-types
export const getDcimFreePorts = (dcId: string, speedMbps: number, exceptNe: string) => wait(() => S.dcimFreePorts(dcId, speedMbps, exceptNe)); // GET /dcim/interfaces?site&speed&cabled=false
export const dcimConnect = (aNe: string, aIf: string, zNe: string, zIf: string, cr: DcimCr) => mutate(() => S.dcimRun('connect', [aNe, aIf, zNe, zIf], cr));   // POST /dcim/cables
export const dcimDisconnect = (neId: string, ifName: string, cr: DcimCr) => mutate(() => S.dcimRun('disconnect', [neId, ifName], cr));                    // DELETE /dcim/cables/:id
export const dcimEditInterface = (neId: string, ifName: string, x: { description: string; enabled: boolean }, cr: DcimCr) => mutate(() => S.dcimRun('editInterface', [neId, ifName, x], cr)); // PATCH /dcim/interfaces/:id
export const dcimInstallModule = (neId: string, slot: string, typeId: string, cr: DcimCr) => mutate(() => S.dcimRun('installModule', [neId, slot, typeId], cr) as DcimRunResult<number>); // POST /dcim/devices/:id/modules
export const dcimRemoveModule = (neId: string, slot: string, cr: DcimCr) => mutate(() => S.dcimRun('removeModule', [neId, slot], cr));                   // DELETE /dcim/devices/:id/modules/:slot
export const dcimSwapModule = (neId: string, slot: string, cr: DcimCr) => mutate(() => S.dcimRun('swapModule', [neId, slot], cr));                       // POST /dcim/devices/:id/modules/:slot/replace
export const dcimEditRack = (id: string, x: Parameters<typeof S.dcimEditRack>[1], cr: DcimCr) => mutate(() => S.dcimRun('editRack', [id, x], cr));        // PATCH /dcim/racks/:id
export const dcimRetireRack = (id: string, cr: DcimCr) => mutate(() => S.dcimRun('retireRack', [id], cr));                                                // DELETE /dcim/racks/:id
export const dcimMoveDevice = (neId: string, rackId: string, u: number, cr: DcimCr) => mutate(() => S.dcimRun('moveDevice', [neId, rackId, u], cr));    // PATCH /dcim/devices/:id { rack, position }
export const dcimReserveU = (rackId: string, x: Parameters<typeof S.dcimReserveU>[1], cr: DcimCr) => mutate(() => S.dcimRun('reserveU', [rackId, x], cr)); // POST /dcim/racks/:id/reservations
export const dcimReleaseU = (id: string, cr: DcimCr) => mutate(() => S.dcimRun('releaseU', [id], cr));                                                    // DELETE /dcim/rack-reservations/:id
export const dcimCreatePanel = (x: Parameters<typeof S.dcimCreatePanel>[0], cr: DcimCr) => mutate(() => S.dcimRun('createPanel', [x], cr));              // POST /dcim/power-panels
export const dcimCreateFeed = (x: Parameters<typeof S.dcimCreateFeed>[0], cr: DcimCr) => mutate(() => S.dcimRun('createFeed', [x], cr) as DcimRunResult<{ id: string; kw: number }>);                 // POST /dcim/power-feeds
/* DCIM change control: every edit above takes the change request it runs under (DcimCr) */
export const getDcimCrOptions = (dcId: string) => wait(() => S.dcimCrOptions(dcId));                 // GET /changes?site&status=open (for DCIM edits)
export const getDcimTags = (q: { dcId?: string } = {}) => wait(() => S.dcimTags(q));                  // GET /dcim/change-tags?dcId (record → CR)
export const getDcimWork = (q: Parameters<typeof S.dcimWork>[0] = {}) => wait(() => S.dcimWork(q));   // GET /dcim/work-items?dcId&rackId&neId
export const getDcimWorkOf = (changeId: string) => wait(() => S.dcimItemsOf(changeId));              // GET /changes/:id/dcim-work
export const getDcimChangeBoard = (q: { dcId?: string } = {}) => wait(() => S.dcimChangeBoard(q)); // GET /dcim/change-requests?dcId (CRs with what they touch + DCIM work)
export const executeDcimWork = (id: string) => mutate(() => S.dcimExecute(id));                     // POST /dcim/work-items/:id/execute
export const executeDcimChange = (changeId: string) => mutate(() => S.dcimExecuteAll(changeId));    // POST /changes/:id/dcim-work/execute
export const cancelDcimWork = (id: string) => mutate(() => S.dcimCancelItem(id));                   // DELETE /dcim/work-items/:id
export const dcimOpIsStandard = S.dcimOpIsStandard;
export const dcimAddModuleType = (x: Parameters<typeof S.dcimAddModuleType>[0]) => mutate(() => S.dcimAddModuleType(x));        // POST /dcim/module-types
export const dcimEditTemplates = (id: string, x: Parameters<typeof S.dcimEditTemplates>[1]) => mutate(() => S.dcimEditTemplates(id, x)); // PUT /dcim/device-types/:id/templates
export const dcimImportTypes = (json: string) => mutate(() => S.dcimImportTypes(json));                                          // POST /dcim/device-types/import

/* ---- IP & Network (Plan & Build): prefixes, addresses, VRFs, VLANs, ASNs, gateways, ranges, services, findings */
export const getIpam = (q: { dcId?: string } = {}) => wait(() => S.ipam(q));                      // GET /ipam?dcId
export const getDeviceIps = (neId: string) => wait(() => S.ipamOfDevice(neId));                  // GET /network-elements/:id/ip-addresses
export const reserveIp = (prefixId: string, note: string) => mutate(() => S.ipamReserve(prefixId, note));                // POST /ipam/prefixes/:id/available-ips
export const carvePrefix = (parentId: string, mask: number, role: Parameters<typeof S.ipamCarve>[2], description: string) => mutate(() => S.ipamCarve(parentId, mask, role, description)); // POST /ipam/prefixes/:id/available-prefixes
export const getIpAddress = (id: string) => wait(() => S.ipamAddress(id));                          // GET /ipam/ip-addresses/:id
export const createPrefix = (x: Parameters<typeof S.ipamCreatePrefix>[0]) => mutate(() => S.ipamCreatePrefix(x));           // POST /ipam/prefixes
export const assignDeviceIp = (neId: string, prefixId: string, iface: string | undefined, primary: boolean) => mutate(() => S.ipamAssign(neId, prefixId, iface, primary)); // POST /network-elements/:id/ip-addresses
export const unassignIp = (id: string) => mutate(() => S.ipamUnassign(id));                         // DELETE /ipam/ip-addresses/:id/assignment
export const setPrimaryIp = (neId: string, id: string) => mutate(() => S.ipamSetPrimary(neId, id)); // PATCH /network-elements/:id { primaryIp4 }
export const getIpamIntegrations = () => wait(() => S.ipamIntegrations());                       // GET /ipam/integrations
export const saveIpamRecord = (kind: Parameters<typeof S.ipamSaveRecord>[0], x: Record<string, unknown>, id?: string) => mutate(() => S.ipamSaveRecord(kind, x, id)); // POST /ipam/{kind}s or PATCH /ipam/{kind}s/:id
export const deleteIpamRecord = (kind: Parameters<typeof S.ipamDeleteRecord>[0], id: string) => mutate(() => S.ipamDeleteRecord(kind, id));             // DELETE /ipam/{kind}s/:id
export const syncIpamIntegration = (id: string, action: 'Sync' | 'Import' | 'Export' | 'Connect') => mutate(() => S.ipamSync(id, action)); // POST /ipam/integrations/:id/sync

/* ---- Planner (P2B port): the planner's record store (templates, benchmarks, plans, scenarios, holds) over our estate.
   The planner screens use it through planner/compat (P2B's entity hooks); a real backend would serve each collection. */
export const plannerStore = S.plannerStore;
export const getPlannerQueue = () => wait(S.plannerQueue);                                          // GET /planner/plans?status=In review,Approved                                                         // GET /planner/{collection}
export const onPlannerChange = S.onPlannerChange;
export const plannerStoreSerial = S.plannerStoreSerial;
export type { MockDB } from '../mock/p2b/store';

/* ---- Delivery (Plan & Build): projects from approved plans, work orders, POs, commissioning, permits, design */
export const getDelivery = () => wait(S.delivery);                                                 // GET /delivery (projects, work orders, POs, tests, permits, docs)
export const getDeliveryProject = (id: string) => wait(() => S.deliveryProject(id));              // GET /delivery/projects/:id
export const advanceWorkOrder = (id: string) => mutate(() => S.deliveryAdvanceWo(id));           // POST /delivery/work-orders/:id/advance
export const runCxTest = (projectId: string, level: number) => mutate(() => S.deliveryRunTest(projectId, level)); // POST /delivery/projects/:id/commissioning/:level
export const receivePurchaseOrder = (id: string) => mutate(() => S.deliveryReceivePo(id));         // POST /delivery/purchase-orders/:id/receipt
export const handoverProject = (projectId: string) => mutate(() => S.deliveryHandover(projectId)); // POST /delivery/projects/:id/handover
export const getWorkflow = () => wait(S.wfList);                                                      // GET /workorders (processes, instances, tasks)
export const getWfInstance = (id: string) => wait(() => S.wfInstance(id));                         // GET /workorders/instances/:id
export const getWfKpis = () => wait(S.wfKpiView);                                                  // GET /workorders/kpis
export const claimWfTask = (id: string) => mutate(() => S.wfClaim(id));                            // POST /workorders/tasks/:id/claim
export const completeWfTask = (id: string, data: Record<string, string | boolean | number>) => mutate(() => S.wfComplete(id, data)); // POST /workorders/tasks/:id/complete
export const retryWfInstance = (id: string) => mutate(() => S.wfRetry(id));                        // POST /workorders/instances/:id/retry
export const getWorkOrder = (id: string) => wait(() => S.workOrder(id));                           // GET /delivery/work-orders/:id
export const assignWorkOrder = (id: string, x: Parameters<typeof S.woAssign>[1]) => mutate(() => S.woAssign(id, x)); // PATCH /delivery/work-orders/:id/assignment
export const tickWorkOrderCheck = (id: string, item: string) => mutate(() => S.woTick(id, item));  // POST /delivery/work-orders/:id/checklist/:item
export const requestWorkOrderAccess = (id: string, zones: string) => mutate(() => S.woAccess(id, zones)); // POST /delivery/work-orders/:id/access
export const signOffWorkOrder = (id: string, x: Parameters<typeof S.woSignOff>[1]) => mutate(() => S.woSignOff(id, x)); // POST /delivery/work-orders/:id/sign-off
export const failWorkOrder = (id: string, reason: string) => mutate(() => S.woFail(id, reason));   // POST /delivery/work-orders/:id/failure
export const retryWorkOrder = (id: string) => mutate(() => S.woRetry(id));                         // POST /delivery/work-orders/:id/retry
export const getProgrammes = () => wait(S.deliveryProgrammesList);                                   // GET /delivery/programmes
export const getProgramme = (id: string) => wait(() => S.deliveryProgrammeOne(id));                // GET /delivery/programmes/:id
export const getDeliveryTemplates = () => wait(S.deliveryTemplates);                               // GET /delivery/project-templates
export const createProgramme = (x: Parameters<typeof S.deliveryCreateProgramme>[0]) => mutate(() => S.deliveryCreateProgramme(x)); // POST /delivery/programmes
export const setProgrammeStatus = (id: string, to: 'Active' | 'On hold' | 'Closed') => mutate(() => S.deliveryProgrammeStatus(id, to)); // PATCH /delivery/programmes/:id
export const createDeliveryProject = (x: Parameters<typeof S.deliveryCreateProject>[0]) => mutate(() => S.deliveryCreateProject(x)); // POST /delivery/projects
export const startDeliveryProject = (id: string) => mutate(() => S.deliveryStartProject(id));       // POST /delivery/projects/:id/start
export const raiseChangeOrder = (pid: string, x: Parameters<typeof S.deliveryRaiseCo>[1]) => mutate(() => S.deliveryRaiseCo(pid, x)); // POST /delivery/projects/:id/change-orders
export const decideChangeOrder = (id: string, d: 'Approved' | 'Rejected', note: string) => mutate(() => S.deliveryDecideCo(id, d, note)); // POST /delivery/change-orders/:id/decision
export const addProjectRisk = (pid: string, x: Parameters<typeof S.deliveryAddRisk>[1]) => mutate(() => S.deliveryAddRisk(pid, x)); // POST /delivery/projects/:id/risks
export const setRiskState = (id: string, to: 'Open' | 'Mitigating' | 'Closed') => mutate(() => S.deliveryRiskState(id, to)); // PATCH /delivery/risks/:id

/* ---- Security Ops (26-Oct-2026): one security data lake (OTel → OCSF tables in ClickHouse), Sigma rules tagged with MITRE ATT&CK,
   NIST SP 800-61 cases, SSVC-prioritised vulnerabilities, CIS / STIG hardening, IEC 62443 OT zones, physical security, NIST CSF 2.0 posture */
export const getSecOps = () => wait(S.secops);                                                       // GET /secops (detections, cases, rules, vulnerabilities, hardening, OT, physical, sources, posture)
export const triageDetection = (id: string, action: 'assign' | 'investigate' | 'fp' | 'benign' | 'tp') => mutate(() => S.secTriageDet(id, action)); // POST /secops/detections/:id/triage
export const escalateDetections = (ids: string[]) => mutate(() => S.secEscalateDets(ids));            // POST /secops/cases { detectionIds }
export const advanceSecCase = (id: string, outcome?: string) => mutate(() => S.secAdvanceCase(id, outcome)); // POST /secops/cases/:id/advance
export const runSecCaseStep = (id: string, idx: number) => mutate(() => S.secRunStep(id, idx));       // POST /secops/cases/:id/steps/:n
export const addSecCaseNote = (id: string, text: string) => mutate(() => S.secAddNote(id, text));     // POST /secops/cases/:id/notes
export const setSecVuln = (id: string, state: 'Open' | 'Remediation planned' | 'Risk accepted', note?: string) => mutate(() => S.secSetVuln(id, state, note)); // PATCH /secops/vulnerabilities/:id
export const setSecRule = (id: string, on: boolean) => mutate(() => S.secSetRule(id, on));            // PATCH /secops/rules/:id { enabled }

/* ---- Compliance and Customization (Admin) */
export const getCompliance = () => wait(S.compliance);                                             // GET /compliance (frameworks, controls, policies, violations)
export const setPolicyActive = (id: string, on: boolean) => mutate(() => S.compPolicyActive(id, on));  // PATCH /compliance/policies/:id { active }
export const attestControl = (id: string, note: string) => mutate(() => S.compAttest(id, note));       // POST /compliance/controls/:id/attestation
export const addCompliancePolicy = (x: Parameters<typeof S.compAddPolicy>[0]) => mutate(() => S.compAddPolicy(x)); // POST /compliance/policies
export const addComplianceControl = (x: Parameters<typeof S.compAddControl>[0]) => mutate(() => S.compAddControl(x)); // POST /compliance/controls
export const addComplianceFramework = (x: Parameters<typeof S.compAddFramework>[0]) => mutate(() => S.compAddFramework(x)); // POST /compliance/frameworks
export const getCustomization = () => wait(S.customization);                                       // GET /customization (custom fields, tags)
export const addCustomField = (f: Parameters<typeof S.addCustomField>[0]) => mutate(() => S.addCustomField(f)); // POST /customization/fields
export const addTag = (t: Parameters<typeof S.addTagDef>[0]) => mutate(() => S.addTagDef(t));    // POST /customization/tags
export const getAuditLog = () => wait(S.auditLog);                                                 // GET /audit

/* ---- services & customers */
export const getServices = (q: Parameters<typeof S.servicesOf>[0] = {}) => wait(() => S.servicesOf(q)); // GET /services?dcId&neId&customerId
export const getService = (id: string) => wait(() => S.service(id));                               // GET /services/:id
export const getCustomers = () => wait(S.customers);                                               // GET /customers
export const getCustomer = (id: string) => wait(() => S.customer(id));                             // GET /customers/:id

/* ---- events & operations */
export const getAlerts = (q: Parameters<typeof S.alerts>[0] = {}) => wait(() => S.alerts(q));       // GET /alerts?dcId&neId&severity&state&scope (dc|downstream|all)
export const getIncidents = (q: Parameters<typeof S.incidents>[0] = {}) => wait(() => S.incidents(q)); // GET /incidents
export const getIncident = (id: string) => wait(() => S.incident(id));                             // GET /incidents/:id
export const getChanges = (q: Parameters<typeof S.changes>[0] = {}) => wait(() => S.changes(q));   // GET /changes
export const getChangeRegister = () => wait(S.changeMgmt);                                         // GET /change-management (changes, freezes, templates, policies, weekly volume)
export const getChangeRecord = (id: string) => wait(() => S.changeRecord(id));                     // GET /changes/:id (class, approvals, conflicts, policies, review)
export const decideChange = (id: string, approve: boolean) => mutate(() => S.decideChange(id, approve)); // POST /changes/:id/decision
export const previewChangeImpact = (scope: string[], dcId: string, excludeId?: string) => wait(() => S.changeImpact(scope, dcId, excludeId)); // POST /changes/impact-preview
export const getReconciliation = (q: Parameters<typeof S.recon>[0] = {}) => wait(() => S.recon(q)); // GET /reconciliation
export const getAudit = (object?: string) => wait(() => S.audit(object));                          // GET /audit?object
export const getCapacity = (dcId?: string) => wait(() => S.capacity(dcId));                        // GET /capacity?dcId
export const getPowerEconomics = (dcId?: string) => wait(() => S.powerEconomics(dcId));          // GET /capacity/power-economics?dcId
export const getGpu = (q: Parameters<typeof S.gpu>[0] = {}) => wait(() => S.gpu(q));                // GET /ai-infrastructure?dcId
export const getGpuNode = (neId: string) => wait(() => S.gpuNode(neId));                          // GET /ai-infrastructure/nodes/:id
export const hasGpuNow = (dcId?: string) => S.hasGpu(dcId);
export const getRevenue = (q: Parameters<typeof S.revenue>[0] = {}) => wait(() => S.revenue(q));   // GET /revenue-impact?dcId
export const getCommandCenter = () => wait(S.commandCenter);                                       // GET /command-center
export const search = (q: string) => wait(() => S.search(q));                                       // GET /search?q

/* ---- Sentinel (mock AI) */
export const askSentinel = (q: string, ctx: Ctx): Promise<Answer> => new Promise(res => setTimeout(() => res(ask(q, ctx)), 650)); // POST /sentinel/ask
export const sentinelSuggestions = (ctx: Ctx) => suggestions(ctx);
export type { Answer, Ctx };

/* ---- mutations */
export const ackAlert = (id: string) => mutate(() => S.ackAlert(id));                                             // POST /alerts/:id/ack
export const createIncidentFromAlerts = (ids: string[]) => mutate(() => S.createIncidentFromAlerts(ids));           // POST /incidents
export const advanceIncident = (id: string) => mutate(() => S.advanceIncident(id));                               // POST /incidents/:id/advance
export const addWorklog = (id: string, text: string) => mutate(() => S.addWorklog(id, text));                     // POST /incidents/:id/worklog
export const setActionStatus = (incId: string, stepId: string, to: ActionStep['status']) => mutate(() => S.setAction(incId, stepId, to)); // PATCH /incidents/:id/actions/:step
export const runClosureChecks = (incId: string) => mutate(() => S.runVerification(incId));                         // POST /incidents/:id/verify
export const hypothesisFeedback = (incId: string, idx: number, ok: boolean) => mutate(() => S.hypothesisFeedback(incId, idx, ok)); // POST /incidents/:id/rca/:idx/feedback
export const raiseEmergencyChange = (incId: string) => mutate(() => S.raiseEmergencyChange(incId));               // POST /incidents/:id/emergency-change
export const createChange = (c: Omit<Change, 'id' | 'created' | 'status' | 'risk' | 'requester'>) => mutate(() => S.createChange(c)); // POST /changes
export const setChangeStatus = (id: string, to?: ChangeStatus) => mutate(() => S.setChangeStatus(id, to));        // POST /changes/:id/transition
export const resolveRecon = (id: string, d: NonNullable<ReconTask['decision']>) => mutate(() => S.resolveRecon(id, d)); // POST /reconciliation/:id/resolve
export const assignRecon = (ids: string[], who: string) => mutate(() => S.assignRecon(ids, who));                 // POST /reconciliation/assign
export const runDiscovery = (dcId: string) => mutate(() => S.runDiscovery(dcId));                                 // POST /datacenters/:id/discovery
export const createCapacityPlan = (p: Omit<CapacityPlan, 'id' | 'status'>) => mutate(() => S.createPlan(p));      // POST /capacity/plans
export const resetDemo = () => mutate(() => S.reset());
export const CURRENT_USER = S.ME;

/* ---- hook: load, keep showing stale data while refetching, refetch on change */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => { const n = ++seq.current; setLoading(true); fn().then(d => { if (n === seq.current) { setData(d); setLoading(false); } }); }, deps);
  useEffect(() => { setData(undefined); run(); }, [run]);
  useEffect(() => onDataChange(run), [run]);
  return { data, loading, reload: run };
}
