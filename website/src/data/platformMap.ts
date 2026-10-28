/**
 * The platform map on /platform: every block of the SynapseDC solution, grouped the way the
 * platform launcher groups them (docs/dco-platform-menu.html) and the way the product's menu does.
 * `href` points at the website page when one exists; `holds` lists what the block contains.
 */

export type MapGroup = "plan" | "core" | "operate" | "govern" | "foundation";

export interface MapNode {
	id: string;
	group: MapGroup;
	name: string;
	short: string;
	icon: string;
	desc: string;
	holds: string[];
	href?: string;
	/** Platform section the launcher places it in (shown in the detail card). */
	section?: string;
	/** Existing platform module that owns the record, when the block is an analytics layer over it. */
	over?: string;
}

export const MAP_GROUPS: { id: MapGroup; title: string; line: string }[] = [
	{ id: "plan", title: "Plan & build", line: "From sellable capacity to a commissioned hall" },
	{ id: "core", title: "The SynapseDC core", line: "One estate model that every block reads and writes" },
	{ id: "operate", title: "Operate", line: "Run the estate live with impact and cost on every fault" },
	{ id: "govern", title: "Govern & data", line: "Evidence, records and the model behind them" },
	{ id: "foundation", title: "Foundation", line: "How it connects, what it sits on, where it runs" },
];

export const MAP_NODES: MapNode[] = [
	/* ---- Plan & build ---- */
	{ id: "capacity", group: "plan", name: "Capacity", short: "Sellable space, power, cooling, GPUs", icon: "gauge", href: "/platform/capacity-power-economics", section: "Plan to Build",
		desc: "Space, power, cooling, ports and GPUs per site and hall, net of every hold, plus the power bill priced against tariffs and contracts.",
		holds: ["Insights · Power · Space · Network · Compute · Reservations", "PUE and energy, CO₂ by grid factor", "Power economics: bill, contract findings, cost per sold GPU-hour"] },
	{ id: "powerecon", group: "plan", name: "Power economics", short: "The bill, contracts, cost per GPU-hour", icon: "zap", href: "/platform/capacity-power-economics", section: "Plan to Build · Capacity → Power",
		desc: "The power bill priced against real tariffs and contracts: energy, demand charges, take-or-pay floors and colocation blocks, idle kW, findings against the contracts, and power per sold MW and per sold GPU-hour.",
		holds: ["Bill per site, idle kW paid but not sold", "Findings: block nearly used, new demand peak, unexplained draw", "GPU power cost per pod, job and tenant; where to place"] },
	{ id: "planner", group: "plan", name: "Planner", short: "Templates, sizing, cost, approvals, plan pack", icon: "drafting-compass", href: "/platform/planner", section: "Plan to Build",
		desc: "Plans new capacity from templates and benchmarks: sizing, CapEx with NPV and payback, schedule from lead times, rule checks, governance and a plan pack for sign-off.",
		holds: ["Insights · Plans · Templates · Benchmarks", "Six plan families: in-site, plant, network, new build, refresh, migration", "Review portal, PDF / workbook / ZIP pack"] },
	{ id: "dcim", group: "plan", name: "DCIM", short: "Racks, power chain and cabling as records", icon: "server", href: "/platform/dcim", section: "Plan to Build · over Inventory",
		desc: "Sites, floors, halls, rows, racks, devices, ports, PDUs, outlets, cords and every cable, with every write carrying a change request.",
		holds: ["Insights · Sites · Racks · Devices · Cabling · Power · Catalogue · Changes", "Standard, open or new CR on every edit", "Rack elevation drag-move, reservations, explorer"], over: "Plan to Build Inventory" },
	{ id: "ipam", group: "plan", name: "IP & Network", short: "Prefixes, VRFs, VLANs, ASNs, exhaustion", icon: "network", section: "Plan to Build · over IP Management",
		desc: "Management and fabric addressing per site, VRFs, VLANs, ASNs and gateway groups, with an exhaustion forecast per prefix.",
		holds: ["Insights · IP space · Routing · Gateways · Registers", "Every address bound to a device and interface", "Connectors to Infoblox, BlueCat, Kea, AD DNS"], over: "Plan to Build IP Management" },
	{ id: "delivery", group: "plan", name: "Programmes & projects", short: "Milestones, POs, permits, earned value", icon: "folder-kanban", href: "/platform/build-delivery", section: "Plan to Build · over Programs & Projects",
		desc: "Every approved plan as a project: milestones, work orders, purchase orders from the sourced bill of materials, permits, design documents and earned value.",
		holds: ["Insights · Programs · Projects · Permits · Design", "Dependency gates between projects", "Risks and change orders by approval band"], over: "Plan to Build Programs & Projects" },
	{ id: "commissioning", group: "plan", name: "Commissioning", short: "L1 → L5 tests and handover", icon: "clipboard-check", href: "/platform/build-delivery", section: "Plan to Build",
		desc: "Factory witness, site acceptance, pre-functional, functional and integrated systems testing in order, then handover into operations.",
		holds: ["L1 factory witness → L5 integrated systems test", "Gates block until the previous level passes", "Handover completes the plan and releases its holds"] },
	{ id: "workorders", group: "plan", name: "Work orders", short: "Field work, tasks, process KPIs", icon: "clipboard-list", section: "Plan to Build · over Field Force",
		desc: "Build and maintenance field work with crew windows, checklists and sign-off, run as process instances with lanes, tasks and KPIs.",
		holds: ["My tasks · Work orders · Processes · Insights", "Twelve process definitions over our records", "Completing a step moves the delivery work order"], over: "Supply Chain Field Force Management" },

	/* ---- Core ---- */
	{ id: "estate", group: "core", name: "One estate model", short: "Sites → halls → racks → devices → ports, customers and contracts", icon: "waypoints", href: "/how-it-works",
		desc: "The graph every block reads and writes: building, plant, racks, devices, ports, cables, GPUs, services, customers and contracts. Every count is derived from it, never typed in.",
		holds: ["51 entity types, 107 relationships", "Stable identities, so adding data never reshuffles the rest", "Import template in load order for onboarding"] },
	{ id: "twin", group: "core", name: "3D datacenter layout", short: "Building to device in 3D", icon: "building-2", href: "/platform/datacenters",
		desc: "Schematic and realistic 3D views of every site, health shown by beacons and LEDs, overlays for temperature, power and connectivity, and the paths from UPS to PDU and from port to trunk.",
		holds: ["Walk mode at eye level", "Device popup with cabling and power trace views", "Same drill path and numbers in both views"] },
	{ id: "alarm", group: "core", name: "Alarm scope & correlation", short: "Site · edge · dependency", icon: "siren", href: "/platform/alarms-incidents",
		desc: "An alarm counts against a datacenter only when it belongs there. Correlation groups alarms into incidents with ranked root-cause hypotheses and evidence.",
		holds: ["Downstream symptoms shown under the causing incident", "Edge redundancy: redundant · lost · isolated", "Incident enrichment on the platform's System Alerts and ITSM"] },
	{ id: "money", group: "core", name: "Money model", short: "One issue per service, Σ reconciles", icon: "badge-dollar-sign", href: "/platform/revenue-impact",
		desc: "Each impacted service is charged to its most severe cause. Revenue lost, SLA credits by tier, the next cliff and what is at stake reconcile across every view.",
		holds: ["Down, degraded or exposed", "Credits net of those already locked in", "Persona vocabulary: colocation, GPU cloud, enterprise"] },
	{ id: "ai", group: "core", name: "Opstral AI", short: "Answers, causes, actions", icon: "sparkles", href: "/platform/opstral-ai",
		desc: "An assistant on every screen that answers from the same records the screens use, explains the likely cause with evidence and recommends the next step. Disruptive steps wait for approval.",
		holds: ["Which issue is costing the most revenue?", "Where should the next GPU job go?", "What is power costing us at this site?"] },

	{ id: "physical", group: "core", name: "Physical last mile", short: "UPS → PDU → PSU · port → trunk", icon: "cable", href: "/platform/facilities",
		desc: "The power chain and the structured cabling to every device, derived per site: which UPS feeds which PDU, which outlet each PSU is on, which trunk and cross-connect carry each port, and the single points of failure that fall out of it.",
		holds: ["Power, cooling and cabling down to the device", "Single points of failure and what-if per asset", "Lifecycle, RMA, spares, environment & safety"] },
	{ id: "models", group: "core", name: "Business models", short: "Colocation · NeoCloud · 3 more", icon: "users", href: "/solutions",
		desc: "One estate, one alarm model and one money model; the business model sets the vocabulary, what is monitored inside the rack and how value is counted. India and USA geographies with their own currency and formats.",
		holds: ["Tenant gear sealed in colocation", "GPU jobs monitored, never their data", "Persona and geography switch on every screen"] },

	/* ---- Operate ---- */
	{ id: "command", group: "operate", name: "Command Center", short: "Estate health, live map, what to do first", icon: "layout-dashboard", href: "/platform/command-center", section: "Ops Toolkit · Datacenter Ops",
		desc: "Health ring, four areas, the live map and every datacenter worst-first, then what is happening, who is affected and the recommended next step.",
		holds: ["Every figure opens the same count in its list", "Plan & build strip and lens", "Premium customers at risk, past SLA, committed"] },
	{ id: "datacenters", group: "operate", name: "Datacenters", short: "Site page: layout, facility, infrastructure, impact", icon: "building", href: "/platform/datacenters", section: "Ops Toolkit · Datacenter Ops",
		desc: "One page per site with four groups of tabs: Overview, Facility, Infrastructure and Business impact, including access & security and the ops log.",
		holds: ["Needs attention, metrics, equipment, topology", "Who is on site, access exceptions, rights review", "Customers and revenue served from the site"] },
	{ id: "facilities", group: "operate", name: "Facilities", short: "Power path, ride-through, cooling, SPOFs", icon: "zap", href: "/platform/facilities", section: "Ops Toolkit · Datacenter Ops",
		desc: "Single-line power path, 24-hour load against capacity, UPS minutes and generator fuel, cooling heat balance, environment zones, single points of failure with a what-if, and the maintenance plan.",
		holds: ["Power & backup · Cooling · Environment · SPOF · Maintenance", "Fire zones, leak detection, access points", "PM plan per plant asset, booked as changes"] },
	{ id: "gpu", group: "operate", name: "GPU Fleet", short: "Jobs, GPUs, rails, cooling & power, placement", icon: "cpu", href: "/platform/gpu-fleet", section: "Ops Toolkit · Datacenter Ops",
		desc: "DCGM-style telemetry per GPU joined to jobs, customers and the building: blast radius, GPU time lost, network rails, power per sold GPU-hour and where to place the next job.",
		holds: ["Clusters · Jobs · Nodes · GPU models · Telemetry · Cooling & power · Network · Where to place", "NVIDIA and Intel accelerators", "Xid, ECC, NVLink and thermal stories"] },
	{ id: "incidents", group: "operate", name: "Alerts & incidents", short: "Scoped alarms, incidents with impact, problems", icon: "bell-ring", href: "/platform/alarms-incidents", section: "Services & ITSM · over Incidents",
		desc: "Alarms in scope, incidents that arrive with services, customers and money, root-cause hypotheses and actions, on-call and customer notices, and problems grouping incidents by cause.",
		holds: ["Critical / High / Medium / Low", "Paging chain and next escalation", "Notices on an update cadence"], over: "Services & ITSM Incidents" },
	{ id: "changes", group: "operate", name: "Change management", short: "Approvals, freezes, calendar, standard changes", icon: "arrow-left-right", section: "Services & ITSM · over Change Management",
		desc: "One register over operations, maintenance and delivery changes: classes, approval matrix, freezes, conflicts, policies and a change board, with DCIM work executed under its CR.",
		holds: ["Overview · Changes · Approvals · Calendar · Freezes · Standard · Policies", "A change cited by an incident's RCA counts as failed", "Emergency, Normal and Standard classes"], over: "Services & ITSM Change Management" },
	{ id: "revenue", group: "operate", name: "Revenue Impact", short: "What every open issue costs", icon: "badge-dollar-sign", href: "/platform/revenue-impact", section: "Operate to Acquire (BSS)",
		desc: "Issues ranked by cost, customers and datacenters at stake, causes and trend, and the services one failure away from a loss.",
		holds: ["Issues · Customers · Datacenters · Causes & trend · One failure away", "Cost breakdown per issue", "How it is calculated, on the screen"] },
	{ id: "secops", group: "operate", name: "Security Ops", short: "Detections, cases, OT and physical security", icon: "shield-check", href: "/platform/security-ops", section: "Ops Toolkit · over Security Ops",
		desc: "Datacenter detections on ATT&CK, cases on NIST 800-61, SSVC vulnerabilities, hardening and drift, OT zones on IEC 62443 and physical security from the access log.",
		holds: ["Insights · Detections · Cases · Threat coverage · Vulnerabilities · Hardening & drift · OT · Physical", "Security data sources and coverage gaps", "Sigma rules over OCSF tables"], over: "Ops Toolkit Security Ops" },

	/* ---- Govern & data ---- */
	{ id: "compliance", group: "govern", name: "Compliance", short: "Policies as code, frameworks, evidence", icon: "clipboard-check", href: "/platform/compliance", section: "Ops Toolkit · Datacenter Ops",
		desc: "Policies evaluated on the live estate and mapped to ISO 27001, ISO 22237, TIA-942 and SOC 2 controls, with decision records and attestations.",
		holds: ["Posture ring and framework cards", "Deny / warn / allow decision records", "Manual controls with attestation dates"] },
	{ id: "datamodel", group: "govern", name: "Data model", short: "The ontology, explorable", icon: "database", section: "Intelligence Hub",
		desc: "Every entity and relationship of the estate model, by domain and by hierarchy, with the import sheet, example ids and which fields are imported, live or derived.",
		holds: ["Ontology · Full map · Hierarchy", "51 entities, 107 relationships", "Import template and estate backups"] },
	{ id: "customization", group: "govern", name: "Customization", short: "Custom fields and tags", icon: "sliders-horizontal", section: "Platform Engineering",
		desc: "Custom fields on datacenter records with filled counts, and tags as rules over the estate.",
		holds: ["Fields per entity", "Tag rules", "Runtime additions"] },
	{ id: "sources", group: "govern", name: "Security data sources", short: "Sensors, collectors, coverage", icon: "plug", section: "Admin",
		desc: "The sensors and collectors feeding Security Ops, what each covers, and where coverage is missing.",
		holds: ["TACACS+, syslog, config backups, Redfish, osquery, Falco, Suricata, Zeek, NetFlow, PACS, VMS", "OTel collectors → OCSF tables", "Gaps per site"] },
	{ id: "help", group: "govern", name: "Help & documents", short: "FAQ, guides, specifications", icon: "book-open", href: "/resources", section: "Reference",
		desc: "Field guide, data model, import template, integration and interface specifications, customer guide, facility integration survey and the BRD, searchable in the product.",
		holds: ["FAQ in six categories", "Interface specification NB-01…12, INT-01…28", "Facility integration survey per site"] },

	/* ---- Foundation ---- */
	{ id: "collector", group: "foundation", name: "On-site collector", short: "Read-only, outbound-only, active + standby", icon: "radio-tower", href: "/how-it-works",
		desc: "One collector per datacenter reads BMS, UPS, PDUs, meters, cooling, network, BMCs, GPUs, schedulers and doors, normalises alarms and sends outbound over mTLS 443.",
		holds: ["SNMPv3 · gNMI · syslog · Redfish · IPMI · Modbus · BACnet / OPC UA · DCGM · PACS", "Buffers when the uplink drops", "Never controls plant, never polls tenant gear"] },
	{ id: "integrations", group: "foundation", name: "Integrations", short: "ITSM, CRM, IPAM, SIEM, API, events", icon: "workflow", href: "/integrations",
		desc: "REST API v1 (the same contract the screens use), CloudEvents webhooks and Kafka, ITSM, paging, BSS, SIEM in OCSF, embed and a tenant-scoped API.",
		holds: ["ServiceNow, Jira, Salesforce, Dynamics, HubSpot", "Infoblox, BlueCat, Kea, AD DNS", "Embed with ?shell=false in your portal"] },
	{ id: "platform", group: "foundation", name: "Platform modules", short: "BSS · ITSM · Plan to Build · Supply Chain · Ops Toolkit · AI Foundry", icon: "layers", href: "/why-synapsedc",
		desc: "SynapseDC builds only what is datacenter-specific and uses the platform's modules for the rest: the module that owns a record stays its system of record.",
		holds: ["Operate to Acquire (BSS), Services & ITSM, Plan to Build, Supply Chain", "Ops Toolkit, AI Foundry, Platform Engineering, Intelligence Hub", "Integrate with the customer's own systems where they exist"] },
	{ id: "deploy", group: "foundation", name: "Deployment & identity", short: "On-prem, your cloud or air-gapped · OIDC", icon: "lock", href: "/how-it-works#security",
		desc: "Runs where your data must live, inside your perimeter, with the platform's identity (OIDC), in the platform shell or embedded in your portal.",
		holds: ["Business-model and geography switches", "Big-screen scaling for NOC walls", "Every write audited"] },
];

export const nodeById = (id: string) => MAP_NODES.find((n) => n.id === id);
