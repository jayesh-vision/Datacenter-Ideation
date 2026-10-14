import type { ProjectTemplate, ProjectTemplateCategory, BOMType, PlanExecPath, ProcessNodeType } from '../enums';

// ── BPMN-style process model ────────────────────────────────────────
export interface ProcessNode { id: string; name: string; type: ProcessNodeType; attaches?: 'procurement' | 'commissioning' | 'hoto'; condition?: string; }
export interface ProcessEdge { from: string; to: string; label?: string; }
export interface ProcessDef { nodes: ProcessNode[]; edges: ProcessEdge[]; }

/** A template-specific intake field captured by the New Project wizard. */
export interface TemplateField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea';
  options?: string[];
  required?: boolean;
  suffix?: string;
}

export interface TemplateDef {
  category: ProjectTemplateCategory;
  description: string;
  bomType: BOMType;
  execPath: PlanExecPath;
  /** Default milestone names materialized when a project is created from this template. */
  milestones: string[];
  /** Default task names (with effort) materialized for the project plan. */
  tasks: Array<{ name: string; effortDays: number }>;
  /** Template-specific intake fields shown in the wizard. */
  fields: TemplateField[];
  /** Rough default budget (used to prefill the wizard), in dollars. */
  defaultBudget: number;
}

const t = (name: string, effortDays: number) => ({ name, effortDays });

/**
 * Single source of truth for delivery templates. Drives the New Project wizard
 * (intake fields + which milestones/tasks get materialized), the BOM type used
 * by the spine, and the category grouping in the picker. Covers IT, Network,
 * Facility and Construction work so the same Plan→Build engine serves all of them.
 */
export const TEMPLATE_REGISTRY: Record<ProjectTemplate, TemplateDef> = {
  // ── IT delivery ──
  'Rack Deployment': {
    category: 'IT', bomType: 'Rack', execPath: 'Project', defaultBudget: 800_000,
    description: 'Deploy and cable a defined set of racks into an existing hall.',
    milestones: ['Design', 'Procure', 'Install', 'Cable', 'Commission', 'Handover'],
    tasks: [t('Rack elevation design', 4), t('Procurement & delivery', 10), t('Rack & stack', 6), t('Structured cabling', 5), t('Burn-in & validation', 4), t('Handover to operations', 2)],
    fields: [{ name: 'rackCount', label: 'Number of racks', type: 'number', required: true, suffix: 'racks' }, { name: 'rackPurpose', label: 'Rack purpose', type: 'select', options: ['Compute', 'GPU', 'Storage', 'Network'] }, { name: 'powerKw', label: 'Power budget', type: 'number', suffix: 'kW' }],
  },
  'Hall Fit-out': {
    category: 'IT', bomType: 'Rack', execPath: 'Project', defaultBudget: 5_000_000,
    description: 'Fit out an empty data hall: power, cooling, racks and network to ready-for-service.',
    milestones: ['Design sign-off', 'Power & cooling fit', 'Rack install', 'Spine/leaf network', 'Commissioning', 'Handover'],
    tasks: [t('Detailed design', 12), t('Power & cooling installation', 25), t('Rack installation', 12), t('Network fabric build', 10), t('Integrated commissioning', 8), t('RFS handover', 3)],
    fields: [{ name: 'hall', label: 'Target hall', type: 'text', required: true }, { name: 'rackPositions', label: 'Rack positions', type: 'number', suffix: 'racks' }, { name: 'designPowerKw', label: 'Design power', type: 'number', suffix: 'kW' }],
  },
  'Capacity Expansion': {
    category: 'IT', bomType: 'Power', execPath: 'Project', defaultBudget: 2_000_000,
    description: 'Add compute, GPU, storage or power capacity to a live facility.',
    milestones: ['Capacity plan', 'Procure', 'Install', 'Burn-in', 'Cutover'],
    tasks: [t('Capacity & power study', 6), t('Procurement', 15), t('Installation', 10), t('Burn-in testing', 5), t('Cutover to production', 3)],
    fields: [{ name: 'resourceKind', label: 'Resource', type: 'select', options: ['Compute', 'GPU', 'Storage', 'Power'], required: true }, { name: 'quantity', label: 'Quantity', type: 'number', required: true }, { name: 'powerKw', label: 'Added power', type: 'number', suffix: 'kW' }],
  },
  'Migration Wave': {
    category: 'IT', bomType: 'Compute', execPath: 'Change', defaultBudget: 600_000,
    description: 'Migrate workloads or hardware between locations in coordinated waves.',
    milestones: ['Discovery', 'Wave plan', 'Pre-checks', 'Migrate', 'Validate', 'Decommission source'],
    tasks: [t('Discovery & dependency mapping', 8), t('Wave planning', 5), t('Pre-migration checks', 4), t('Execute migration', 6), t('Post-migration validation', 4), t('Source decommission', 3)],
    fields: [{ name: 'movingWhat', label: 'What is moving', type: 'text', required: true }, { name: 'itemCount', label: 'Items in wave', type: 'number' }, { name: 'window', label: 'Migration window', type: 'text' }],
  },
  'Decommission Program': {
    category: 'IT', bomType: 'Rack', execPath: 'Project', defaultBudget: 400_000,
    description: 'Retire end-of-life equipment with data sanitisation and disposal.',
    milestones: ['Identify', 'Drain workloads', 'Disconnect', 'Sanitise data', 'Remove & dispose', 'Update records'],
    tasks: [t('Identify EOL inventory', 4), t('Drain & reschedule workloads', 6), t('Physical disconnect', 4), t('Data sanitisation', 3), t('Removal & disposal', 5), t('Update system of record', 2)],
    fields: [{ name: 'scope', label: 'Decommission scope', type: 'text', required: true }, { name: 'itemCount', label: 'Items', type: 'number' }, { name: 'disposal', label: 'Disposal method', type: 'select', options: ['Wipe & reuse', 'Destroy', 'Return to vendor', 'Recycle'] }],
  },
  // ── Network ──
  'Network Refresh': {
    category: 'Network', bomType: 'Network', execPath: 'Change', defaultBudget: 1_200_000,
    description: 'Refresh or upgrade network fabric — spine/leaf, edge or management.',
    milestones: ['Design', 'Stage config', 'Maintenance window', 'Cutover', 'Validate'],
    tasks: [t('Target-state design', 8), t('Stage & pre-config', 6), t('Schedule maintenance window', 2), t('Cutover', 4), t('Validation & monitoring', 4)],
    fields: [{ name: 'layer', label: 'Fabric layer', type: 'select', options: ['Spine', 'Leaf', 'Edge', 'Out-of-band'], required: true }, { name: 'deviceCount', label: 'Devices', type: 'number' }, { name: 'window', label: 'Maintenance window', type: 'text' }],
  },
  // ── Facility ──
  'Facility Master Planning': {
    category: 'Facility', bomType: 'Power', execPath: 'Project', defaultBudget: 3_500_000,
    description: 'Strategic capacity, power and space master plan for a site or campus.',
    milestones: ['Requirements & demand', 'Site assessment', 'Concept design', 'Feasibility & cost', 'Master plan sign-off'],
    tasks: [t('Demand & growth modelling', 10), t('Site & utility assessment', 8), t('Concept design options', 12), t('Feasibility & cost model', 8), t('Stakeholder sign-off', 4)],
    fields: [{ name: 'horizonYears', label: 'Planning horizon', type: 'number', suffix: 'years', required: true }, { name: 'targetMw', label: 'Target IT load', type: 'number', suffix: 'MW' }, { name: 'scope', label: 'Scope', type: 'select', options: ['Single site', 'Campus', 'Regional'] }],
  },
  'Site Construction': {
    category: 'Construction', bomType: 'Power', execPath: 'Project', defaultBudget: 45_000_000,
    description: 'Civil and structural construction of a new facility shell and core.',
    milestones: ['Permits & approvals', 'Site preparation', 'Foundations', 'Structure & envelope', 'Inspections', 'Practical completion'],
    tasks: [t('Permitting & approvals', 30), t('Site prep & earthworks', 25), t('Foundations & slab', 30), t('Steel & envelope', 45), t('Regulatory inspections', 10), t('Practical completion sign-off', 5)],
    fields: [{ name: 'gfaSqm', label: 'Gross floor area', type: 'number', suffix: 'm²', required: true }, { name: 'storeys', label: 'Storeys', type: 'number' }, { name: 'contractor', label: 'Principal contractor', type: 'text' }],
  },
  'Building Fit-out': {
    category: 'Construction', bomType: 'Rack', execPath: 'Project', defaultBudget: 12_000_000,
    description: 'Interior fit-out of white space and support areas to operational standard.',
    milestones: ['Design & BOQ', 'Partitions & finishes', 'Containment & flooring', 'White-space readiness', 'Snagging', 'Handover'],
    tasks: [t('Detailed design & BOQ', 12), t('Partitions, finishes & doors', 20), t('Containment & raised floor', 15), t('White-space readiness', 10), t('Snagging & defects', 6), t('Client handover', 3)],
    fields: [{ name: 'area', label: 'Fit-out area', type: 'text', required: true }, { name: 'whiteSpaceSqm', label: 'White space', type: 'number', suffix: 'm²' }, { name: 'finishStandard', label: 'Finish standard', type: 'select', options: ['Base', 'Standard', 'Premium'] }],
  },
  'MEP & Plant Installation': {
    category: 'Construction', bomType: 'Power', execPath: 'Project', defaultBudget: 28_000_000,
    description: 'Mechanical, electrical and plumbing plant: power trains, cooling and BMS.',
    milestones: ['Detailed MEP design', 'Procurement of plant', 'Electrical installation', 'Mechanical installation', 'Integrated commissioning', 'Handover'],
    tasks: [t('Detailed MEP design', 18), t('Long-lead plant procurement', 40), t('Electrical install (HV/LV/UPS)', 30), t('Mechanical install (CRAC/CRAH/chillers)', 30), t('Integrated systems test (IST)', 12), t('Handover to operations', 5)],
    fields: [{ name: 'powerTrainMw', label: 'Power train', type: 'number', suffix: 'MW', required: true }, { name: 'redundancy', label: 'Redundancy', type: 'select', options: ['N', 'N+1', '2N', '2N+1'] }, { name: 'coolingType', label: 'Cooling', type: 'select', options: ['Air', 'Liquid', 'Hybrid'] }],
  },
  // ── Plan types that work inside live sites ──
  'Plant Upgrade Works': {
    category: 'Facility', bomType: 'Power', execPath: 'Project', defaultBudget: 2_500_000,
    description: 'Add or replace UPS modules, generators, transformers or chillers in a live site without losing redundancy.',
    milestones: ['Studies and MOP approved', 'Factory acceptance test', 'Plant delivered', 'Cut-ins complete', 'Functional test (L4)', 'Integrated systems test (L5)', 'Handover'],
    tasks: [t('Short-circuit, protection and load studies', 10), t('Method of procedure (MOP) per cut-in, facilities sign-off', 6), t('Factory acceptance test', 3), t('Delivery, rigging and positioning', 5), t('Cut-ins in maintenance windows (one change each)', 10), t('L3 pre-functional and L4 functional tests per item', 6), t('L5 integrated systems test with load banks', 3), t('Handover: as-built single-line, O&M, spares, training', 3), t('Retire and dispose of replaced plant', 2)],
    fields: [{ name: 'systems', label: 'Systems', type: 'text', required: true }, { name: 'addedKw', label: 'Plant capacity added', type: 'number', suffix: 'kW' }, { name: 'capacityEnabledKw', label: 'IT capacity enabled', type: 'number', suffix: 'kW' }, { name: 'redundancy', label: 'Redundancy after works', type: 'select', options: ['N', 'N+1', '2N', '2N+1'] }, { name: 'cutIns', label: 'Cut-in steps', type: 'number' }, { name: 'plnId', label: 'Planner plan', type: 'text' }],
  },
  'DCI / WAN Uplift': {
    category: 'Network', bomType: 'Network', execPath: 'Project', defaultBudget: 900_000,
    description: 'Add or upgrade capacity between two sites: carrier orders, optics and line cards at both ends, acceptance tests, cut-over and cease of old circuits.',
    milestones: ['Design and route survey', 'Carrier orders placed', 'Cross-connects (LOA/CFA)', 'Circuits handed over', 'Acceptance tests passed', 'Traffic cut over', 'Old circuits ceased'],
    tasks: [t('Path and diversity design (routes, shared-risk groups, KMZ)', 6), t('Carrier orders', 3), t('Cross-connect orders with LOA/CFA', 3), t('Install optics and line cards at both ends', 4), t('Acceptance tests per path (BER 24 h, throughput, latency, failover)', 3), t('Cut-over in a change window', 1), t('Cease old circuits and recover optics', 2)],
    fields: [{ name: 'capacityGbps', label: 'Capacity', type: 'number', suffix: 'Gbps', required: true }, { name: 'paths', label: 'Diverse paths', type: 'number' }, { name: 'aEnd', label: 'A end', type: 'text', required: true }, { name: 'zEnd', label: 'Z end', type: 'text', required: true }, { name: 'cutover', label: 'Cut-over date', type: 'text' }, { name: 'ceaseBy', label: 'Old circuits ceased by', type: 'text' }, { name: 'plnId', label: 'Planner plan', type: 'text' }],
  },
  'Server Refresh': {
    category: 'IT', bomType: 'Compute', execPath: 'Project', defaultBudget: 800_000,
    description: 'Replace ageing servers with current models in waves: receive, burn in, migrate, retire and dispose.',
    milestones: ['Mapping and waves approved', 'Equipment received', 'Pilot wave closed', 'All waves closed', 'Old equipment disposed', 'Records updated'],
    tasks: [t('Old-to-new mapping and wave plan', 5), t('Receive, rack and burn in', 8), t('Pilot wave', 2), t('Remaining waves', 15), t('Sanitise and dispose', 5), t('Update CMDB and monitoring', 2)],
    fields: [{ name: 'devices', label: 'Devices replaced', type: 'number', required: true }, { name: 'waves', label: 'Waves', type: 'number' }],
  },
  'Rack Replacement': {
    category: 'Facility', bomType: 'Rack', execPath: 'Project', defaultBudget: 250_000,
    description: 'Swap racks and rack power strips, re-racking the equipment in change windows.',
    milestones: ['Swap plan and tenant consent', 'Racks delivered', 'Pilot swap', 'All swaps done', 'Old racks removed', 'Records updated'],
    tasks: [t('Swap method and outlet plan per rack', 4), t('Tenant notices and consent', 10), t('Delivery and pre-build', 4), t('Swaps in windows', 10), t('Removal and disposal', 3), t('Update DCIM', 2)],
    fields: [{ name: 'racks', label: 'Racks replaced', type: 'number', required: true }, { name: 'method', label: 'Swap method', type: 'select', options: ['In place', 'Into the next free position', 'Via a temporary rack'] }],
  },
  'Liquid Retrofit': {
    category: 'Facility', bomType: 'Power', execPath: 'Project', defaultBudget: 6_000_000,
    description: 'Convert live rows to high-density or liquid-cooled racks: drain, pipe, power up, test and repopulate, row by row.',
    milestones: ['Design and studies', 'Facility water tie-in', 'Rows drained', 'Pipework and power uprates', 'Flush, fill and pressure test', 'CDU failover test (L5)', 'Rows repopulated'],
    tasks: [t('Detailed design and structural check', 12), t('Facility water tie-in', 10), t('Drain rows to swing positions', 8), t('Pipework, manifolds and power uprates', 20), t('Flush, fill, pressure and leak test', 5), t('Integrated test with load banks', 4), t('Repopulate rows', 8)],
    fields: [{ name: 'racks', label: 'Racks converted', type: 'number', required: true }, { name: 'targetKwPerRack', label: 'Target per rack', type: 'number', suffix: 'kW' }],
  },
  'Edge Site Rollout': {
    category: 'Construction', bomType: 'Rack', execPath: 'Project', defaultBudget: 1_500_000,
    description: 'One wave of edge sites: survey, lease, power drop, enclosure, install and site acceptance per site.',
    milestones: ['Surveys done', 'Leases signed', 'Power connections', 'Enclosures installed', 'Site acceptance tests', 'Sites live'],
    tasks: [t('Site surveys', 10), t('Lease and landlord consent', 20), t('Power connection by the network operator', 30), t('Enclosure delivery and install', 15), t('Site acceptance tests', 5), t('Hand over to operations', 3)],
    fields: [{ name: 'sites', label: 'Sites in the wave', type: 'number', required: true }, { name: 'variant', label: 'Variant', type: 'text' }],
  },
  // ── Greenfield (full programme-scale build) ──
  'Greenfield DC Build': {
    category: 'Construction', bomType: 'Power', execPath: 'Project', defaultBudget: 85_000_000,
    description: 'End-to-end new data center build from site to ready-for-service.',
    milestones: ['Site design', 'Permitting', 'Construction', 'Power & cooling commissioning', 'Network backbone', 'Handover'],
    tasks: [t('Master site design', 20), t('Permitting & approvals', 30), t('Construction', 90), t('Power & cooling commissioning', 20), t('Network backbone', 15), t('RFS handover', 5)],
    fields: [{ name: 'targetMw', label: 'Target IT load', type: 'number', suffix: 'MW', required: true }, { name: 'tier', label: 'Tier', type: 'select', options: ['Tier II', 'Tier III', 'Tier IV'] }, { name: 'rfsDate', label: 'Target RFS', type: 'text' }],
  },
};

/**
 * Template → BPMN process key: every template runs its own project process
 * (src/workorders/model.ts PRJ-01 … PRJ-17; work steps and milestones in projectProcess.ts).
 */
export const PROCESS_FOR_TEMPLATE: Record<ProjectTemplate, string> = {
  'Greenfield DC Build': 'project-greenfield-build',
  'Hall Fit-out': 'project-hall-fitout',
  'Rack Deployment': 'project-rack-deployment',
  'Capacity Expansion': 'project-capacity-expansion',
  'Network Refresh': 'project-network-refresh',
  'Migration Wave': 'project-migration-wave',
  'Decommission Program': 'project-decommission',
  'Facility Master Planning': 'project-master-planning',
  'Site Construction': 'project-site-construction',
  'Building Fit-out': 'project-building-fitout',
  'MEP & Plant Installation': 'project-mep-plant',
  'Plant Upgrade Works': 'project-plant-upgrade',
  'DCI / WAN Uplift': 'project-dci-uplift',
  'Server Refresh': 'project-server-refresh',
  'Rack Replacement': 'project-rack-replacement',
  'Liquid Retrofit': 'project-liquid-retrofit',
  'Edge Site Rollout': 'project-edge-rollout',
};

export const TEMPLATES_BY_CATEGORY: Record<ProjectTemplateCategory, ProjectTemplate[]> = {
  IT: [], Network: [], Facility: [], Construction: [],
};
(Object.keys(TEMPLATE_REGISTRY) as ProjectTemplate[]).forEach((k) => {
  TEMPLATES_BY_CATEGORY[TEMPLATE_REGISTRY[k].category].push(k);
});

/**
 * Build the BPMN process graph for a template from its milestones, inserting the
 * two standard control gateways: a procurement-approval gate after the procurement
 * activity, and a quality gate before handover. Procurement and commissioning
 * activities are flagged so the cockpit can attach BOMs / tests to them.
 */
export function buildProcess(template: ProjectTemplate): ProcessDef {
  const ms = TEMPLATE_REGISTRY[template].milestones;
  // Permit & design gates apply only to facility/construction work — IT/Network
  // templates don't gate on planning permission or issued-for-construction sets.
  const cat = TEMPLATE_REGISTRY[template].category;
  const gated = cat === 'Construction' || cat === 'Facility';
  const nodes: ProcessNode[] = [{ id: 'start', name: 'Start', type: 'start' }];
  const edges: ProcessEdge[] = [];
  let prev = 'start';
  const link = (to: string, label?: string) => { edges.push({ from: prev, to, label }); prev = to; };

  let sawCommission = false, sawPermit = false, sawDesign = false;
  ms.forEach((name, i) => {
    const id = `a${i}`;
    const lower = name.toLowerCase();
    const isProcure = /procure|procurement|long-lead|bom/.test(lower);
    const isCommission = /commission|ist|validation|functional/.test(lower);
    const attaches = isProcure ? 'procurement' : isCommission ? 'commissioning' : undefined;
    nodes.push({ id, name, type: 'task', attaches });
    link(id);
    // Permit gate after the permits/approval activity (facility/construction only)
    if (gated && !sawPermit && /permit|approval|consent/.test(lower)) {
      sawPermit = true;
      nodes.push({ id: 'g_permit', name: 'Permits approved?', type: 'gateway', condition: 'permit' });
      link('g_permit');
    }
    // Design gate after the first design / IFC activity (facility/construction only)
    if (gated && !sawDesign && /design|ifc|boq/.test(lower)) {
      sawDesign = true;
      nodes.push({ id: 'g_design', name: 'Design issued for construction?', type: 'gateway', condition: 'design' });
      link('g_design');
    }
    // Procurement gate immediately after the procurement activity
    if (isProcure) {
      const g = `g_${id}`;
      nodes.push({ id: g, name: 'Procurement approved?', type: 'gateway', condition: 'procurement' });
      link(g);
    }
    // Quality (ATP) gate right after the commissioning activity
    if (isCommission && !sawCommission) {
      sawCommission = true;
      nodes.push({ id: 'g_quality', name: 'ATPs accepted?', type: 'gateway', condition: 'commissioning' });
      link('g_quality');
    }
  });
  // Hand-over to operations: a dedicated activity + gate before go-live.
  nodes.push({ id: 'hoto', name: 'Hand-over to Operations', type: 'task', attaches: 'hoto' });
  link('hoto');
  nodes.push({ id: 'g_hoto', name: 'HOTO accepted?', type: 'gateway', condition: 'hoto' });
  link('g_hoto');
  nodes.push({ id: 'end', name: 'Live / Handover', type: 'end' });
  link('end');
  return { nodes, edges };
}
