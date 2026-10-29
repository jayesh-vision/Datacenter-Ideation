/**
 * Product modules: one entry per /platform/<slug> page.
 * Every claim must exist in the product (BRD chapters 7.1–7.12). Figures in `proof`
 * are worked examples from the product; the site shows them without disclaimers (user, 28-Oct-2026).
 */

export type Stage = "Operate" | "Plan" | "Build" | "Govern" | "Across the product";
export type Model = "Colocation" | "NeoCloud" | "Both";

export interface Capability {
	title: string;
	text: string;
	/** Icon for the compact cards (capabilities without a pin). */
	icon?: string;
	/** Where this capability sits on the module's illustration, in the art's 640 × 420 canvas. Pinned capabilities are numbered on the drawing. */
	pin?: [number, number];
}

export interface Module {
	slug: string;
	name: string;
	stage: Stage;
	icon: string;
	/** One line for menus and cards. */
	short: string;
	/** Page H1. */
	headline: string;
	/** Hero paragraph. */
	summary: string;
	metaDesc: string;
	/** The question a person asks that this module answers. */
	questions: string[];
	/** Who typically asks each question, same order as `questions`. */
	askedBy: string[];
	/** What the screen answers with, same order as `questions` (the role strip on the module page). */
	answers?: string[];
	capabilities: Capability[];
	/** Worked-example figures. */
	proof?: { value: string; label: string }[];
	models: Model;
	brdRef: string;
	related: string[];
}

export const modules: Module[] = [
	{
		slug: "command-center",
		name: "Command Center",
		stage: "Operate",
		icon: "layout-dashboard",
		short: "Estate health, live map and what to do first",
		headline: "Every datacenter on one screen, ordered by what matters.",
		summary:
			"An estate health score, a live map and every datacenter worst-first, then three columns: what is happening, who is affected and the recommended next step. Every figure on it opens the list behind it.",
		metaDesc:
			"SynapseDC Command Center: estate health, live datacenter map, critical incidents, affected customers and ranked recommendations on one screen.",
		questions: ["Where is it failing right now?", "Which customers are exposed?", "What should the team do first?"],
		askedBy: ["NOC engineer", "Head of operations", "Shift lead"],
		answers: ["The map and the worst-first column point at the site and the incident.", "Premium customers at risk, counted from the physical paths the fault sits on.", "Ranked recommendations, with the money and customers each one protects."],
		capabilities: [
			{ title: "One health score you can explain", text: "GPU fleet (or incident response), power, cooling and network, each scored as healthy ÷ total. The status follows the worst single issue, so one UPS on battery reads Critical even at 98%.", icon: "gauge", pin: [190, 112] },
			{ title: "Numbers that add up", text: "Critical, High, Past SLA and premium-customer tiles each open the filtered list with the same count. Nothing on the screen is typed in.", icon: "check", pin: [168, 48] },
			{ title: "Live estate map", text: "Rippling pins for critical sites, animated dashes on backhaul that is down, search by site, city or region, and a summary card per site.", icon: "radio-tower", pin: [422, 112] },
			{ title: "Datacenters worst-first", text: "A scrolling column of every live site with its worst open incident, likely cause, customers at risk and the time left to SLA.", icon: "building-2", pin: [602, 112] },
			{ title: "Recommendations, approval-gated", text: "Ranked actions from Opstral AI. Disruptive steps wait for a person to approve them.", icon: "sparkles", pin: [602, 391] },
			{ title: "Plan & build lens", text: "A slim strip and lens for plans in review, builds in flight and capacity not yet live.", icon: "drafting-compass" },
		],
		proof: [
			{ value: "23", label: "datacenters on one screen" },
			{ value: "≤ 60 s", label: "target from first alarm to an incident with impact and an action" },
		],
		models: "Both",
		brdRef: "7.1",
		related: ["alarms-incidents", "revenue-impact", "datacenters"],
	},
	{
		slug: "datacenters",
		name: "Datacenters & 3D layout",
		stage: "Operate",
		icon: "building-2",
		short: "Site page, 3D layout, power and cable paths",
		headline: "See the building, the rack and the device before anyone walks in.",
		summary:
			"Every site has a page: the 3D layout from building to rack to device, what needs attention, metrics, facility, equipment, topology, tenants and revenue. Turn on power or cable paths to see which UPS feeds a rack and which trunk carries a service.",
		metaDesc:
			"SynapseDC datacenter page and 3D datacenter layout: building to device in 3D, health beacons, walk mode, power and cable paths, and the site's impact on customers.",
		questions: ["Which rack, on which floor, in which room?", "Which UPS and PDU feed this device?", "Which cable carries this service?"],
		askedBy: ["Site engineer", "Facility engineer", "NOC engineer"],
		capabilities: [
			{ title: "Schematic and realistic 3D", text: "Building › floor › room › rack › equipment. Health is shown by LEDs, beacons and halos, and the cabinets stay neutral." },
			{ title: "Colour by layer", text: "Health, temperature (a heat map from rack inlets), rack power and connectivity overlays." },
			{ title: "Power and cable paths", text: "A and B busways fed by their UPS modules, tap-offs into every rack, trunks to the ODF, and a trace view for one device's cords and cables." },
			{ title: "Walk mode", text: "Eye-level street view: click the floor to walk, W A S D to move, and pick anything to walk up to it." },
			{ title: "Grouped site tabs", text: "Overview · Facility · Infrastructure · Business impact, with sub tabs that keep deep links stable." },
			{ title: "Access & security", text: "Who is on site now, entries and denials, tailgating and held-open doors, and the quarterly access-rights review." },
		],
		models: "Both",
		brdRef: "7.2",
		related: ["facilities", "dcim", "command-center"],
	},
	{
		slug: "facilities",
		name: "Facilities",
		stage: "Operate",
		icon: "zap",
		short: "Power path, ride-through, cooling, SPOFs",
		headline: "Know how long the building holds if the utility fails.",
		summary:
			"A single-line power path from the utility to the rack, a 24-hour load chart against capacity, and a ride-through card: UPS minutes, generator kW, fuel hours and readiness checks. Cooling heat balance, environment zones, single points of failure with a what-if, and the maintenance plan.",
		metaDesc:
			"SynapseDC Facilities: power path from utility to rack, UPS ride-through, cooling heat balance, environment, single points of failure, what-if and planned maintenance.",
		questions: ["If utility power fails now, how long do we have?", "Is there a spare cooling unit on this floor?", "What breaks if we take UPS-2 down?"],
		askedBy: ["Facility engineer", "Mechanical engineer", "Electrical engineer"],
		capabilities: [
			{ title: "Power path", text: "Feed → ATS → UPS → busway → PDU, with animated flow. Hover a node to trace everything up- and downstream of it." },
			{ title: "Ride-through", text: "UPS minutes, then generator kW and fuel hours, with readiness checks you can audit." },
			{ title: "Cooling and environment", text: "Heat balance per site, a card per cooling unit, CDU loops for liquid racks, and zones drawn against their safe bands." },
			{ title: "Single points of failure", text: "Devices with both cords on A, failed PSUs, tripped PDUs, cabinets one side cannot carry, single feed or tray route, lost cooling spare." },
			{ title: "What-if", text: "Take a feed, a UPS, a side, a PDU, a cooling unit or a trunk away and see what goes dark." },
			{ title: "Maintenance and safety", text: "A PM plan for every plant asset, booked as a change, plus fire zones, leak detection and resilience tests." },
		],
		models: "Both",
		brdRef: "7.3",
		related: ["datacenters", "capacity-power-economics", "alarms-incidents"],
	},
	{
		slug: "gpu-fleet",
		name: "GPU Fleet",
		stage: "Operate",
		icon: "cpu",
		short: "Jobs, GPUs, blast radius, GPU time lost",
		headline: "One failed GPU stops a whole job. Know which, whose and what it costs.",
		summary:
			"Telemetry per GPU in the shape of the NVIDIA DCGM exporter (and Intel Gaudi / XPU Manager), joined to the job, the customer and the building. See the job with the biggest blast radius, the slowest job, GPU time lost per hour and the work to redo since the last checkpoint.",
		metaDesc:
			"SynapseDC GPU Fleet: DCGM telemetry per GPU, jobs and blast radius, GPU time lost, InfiniBand rails, cooling and power cost, and where to place the next job.",
		questions: ["Which job did this Xid stop, and for which customer?", "How much GPU time are we losing per hour?", "Where should the next 256-GPU job go?"],
		askedBy: ["GPU platform engineer", "Finance", "Capacity manager"],
		capabilities: [
			{ title: "Jobs needing attention", text: "The biggest blast radius and the slowest job, with lost now, lost so far, work to redo and the cause (Xid 79, CDU flow low…)." },
			{ title: "DCGM-style telemetry", text: "Utilisation, SM and tensor activity, memory, temperatures, power, clocks, throttle reasons, ECC, row remap, PCIe and NVLink errors, last Xid, plus 24-hour history." },
			{ title: "Clusters, nodes and models", text: "NVIDIA B200 / H200 / H100 / A100 / L40S / T4 and Intel Gaudi 3 / Max 1550, with vendor-aware labels." },
			{ title: "Network rails", text: "InfiniBand, Ethernet front-end and OOB planes, with ports and errors per rail." },
			{ title: "Cooling and power cost", text: "Power per installed and per sold GPU-hour against the price, energy per job and per tenant, and the cost of idle allocations." },
			{ title: "Where to place", text: "Pods ranked by free healthy GPUs, rack headroom, cooling, contracted power and the marginal power cost per GPU-hour." },
		],
		proof: [
			{ value: "152", label: "GPUs stopped by one failed GPU" },
			{ value: "$625/h", label: "GPU time lost on that job" },
		],
		models: "NeoCloud",
		brdRef: "7.4",
		related: ["capacity-power-economics", "revenue-impact", "alarms-incidents"],
	},
	{
		slug: "alarms-incidents",
		name: "Alarms & incidents",
		stage: "Operate",
		icon: "siren",
		short: "Datacenter scope, correlation, root cause",
		headline: "An alarm counts against a datacenter only when it belongs there.",
		summary:
			"Every alarm is scoped: inside the site, on an edge link leaving it, on something it depends on, or downstream. Downstream symptoms never count on their own; they show under the incident that caused them. Each incident arrives with affected services and customers, ranked root-cause hypotheses and actions.",
		metaDesc:
			"SynapseDC alarm scope and incident enrichment: site, edge, dependency and downstream scope, correlation, root-cause hypotheses, affected customers and on-call.",
		questions: ["Is this our fault or a symptom of someone else's?", "What changed before it broke?", "Who is on call, and when is the next customer update due?"],
		askedBy: ["NOC engineer", "Incident manager", "On-call lead"],
		capabilities: [
			{ title: "Scope model", text: "Site, edge (counted at both ends), dependency and downstream. Edge redundancy is redundant, redundancy-lost or isolated." },
			{ title: "Correlation and RCA", text: "Ranked hypotheses with evidence. A completed change cited by the leading hypothesis is marked as having caused an incident." },
			{ title: "Impact on every incident", text: "Services, customers, premium customers and money, the same figures you see on the customer and revenue screens." },
			{ title: "Severity in words", text: "Critical, High, Medium, Low for incidents; Critical, Major, Minor, Warning for alarms." },
			{ title: "On call and communications", text: "Rota per region, the paging chain, the next escalation, and customer notices with their update cadence." },
			{ title: "Problems", text: "Incidents grouped by a shared cause, such as one optics lot behind several link failures." },
		],
		models: "Both",
		brdRef: "7.5",
		related: ["command-center", "revenue-impact", "opstral-ai"],
	},
	{
		slug: "revenue-impact",
		name: "Revenue Impact",
		stage: "Operate",
		icon: "badge-dollar-sign",
		short: "What every open issue costs, reconciled",
		headline: "Which issue is costing the most right now?",
		summary:
			"Every impacted service is charged to exactly one issue, its most severe cause. You see revenue lost so far, SLA credits by tier, the next credit cliff, a 24-hour forecast and what is at stake on services riding a critical fault. Issues, causes, datacenters and customers all add up to the same total.",
		metaDesc:
			"SynapseDC Revenue Impact: revenue lost, SLA credits and money at stake for every open datacenter issue, reconciled across issues, customers and sites.",
		questions: ["What is this incident costing us per hour?", "When does the next SLA credit tier hit?", "Which customers are one failure away from a loss?"],
		askedBy: ["Finance", "Account manager", "Customer success"],
		capabilities: [
			{ title: "Down, degraded or exposed", text: "Down and degraded services lose money now. Exposed services are still active but riding a critical fault: UPS on battery, failed CRAH, critical alarm on the path." },
			{ title: "Credits by tier", text: "Impacted minutes against the SLA target, credits already locked in, and the next cliff." },
			{ title: "Cost of delay", text: "A curve of what waiting costs, so the order of work follows money and customers." },
			{ title: "Charged where the fault is", text: "A backhaul fault is charged to its datacenter, even when it degrades services homed elsewhere." },
			{ title: "30-day history", text: "Resolved incidents, locked-in credits and today's open impact." },
			{ title: "In your words", text: "Colocation, GPU cloud and enterprise vocabularies (business value, OLA rebates)." },
		],
		models: "Both",
		brdRef: "7.6",
		related: ["alarms-incidents", "command-center", "gpu-fleet"],
	},
	{
		slug: "security-ops",
		name: "Security Ops",
		stage: "Operate",
		icon: "shield-check",
		short: "Detections, cases, OT and physical security",
		headline: "A badge-in and an ACL change, read as one case.",
		summary:
			"Datacenter security operations across network, BMCs, GPU nodes, OT and the doors. Detections are mapped to MITRE ATT&CK Enterprise and ICS, cases follow NIST SP 800-61, vulnerabilities are prioritised with CISA SSVC, hardening is checked against vendor guides, and OT zones are rated on IEC 62443.",
		metaDesc:
			"SynapseDC Security Ops: datacenter detections on MITRE ATT&CK, cases on NIST 800-61, SSVC vulnerabilities, hardening and drift, OT security on IEC 62443 and physical security.",
		questions: ["Who changed the router config, and were they on site?", "Is anything mining crypto on idle GPUs?", "Which UPS cards still have default credentials?"],
		askedBy: ["SOC analyst", "GPU platform engineer", "OT security lead"],
		capabilities: [
			{ title: "Cross-domain detections", text: "Physical and logical together: a badge-in followed by an unapproved change on the WAN edge router is one case." },
			{ title: "Cases", text: "NIST 800-61 phases, evidence, owner and timeline." },
			{ title: "Threat coverage", text: "ATT&CK techniques covered by rules and data sources, and the gaps." },
			{ title: "Vulnerabilities", text: "CVSS v4, EPSS and the CISA KEV list, combined into a CISA SSVC decision." },
			{ title: "Hardening and drift", text: "Configuration checks per device family, and unauthorised drift raised as detections." },
			{ title: "OT and physical", text: "IEC 62443 zones (target vs achieved security level), and physical protection classes for doors and cages." },
		],
		models: "Both",
		brdRef: "7.7",
		related: ["compliance", "datacenters", "alarms-incidents"],
	},
	{
		slug: "capacity-power-economics",
		name: "Capacity & power economics",
		stage: "Plan",
		icon: "gauge",
		short: "Sellable capacity, reservations, the power bill",
		headline: "Know what you can really sell, and what power really costs.",
		summary:
			"Space, power, cooling, ports and GPUs per site and hall, net of what is already held: planned devices, contracted power, approved plans and idle job allocations. Power economics prices the bill: energy, demand charges, take-or-pay floors, colocation blocks and idle kW, then cost per sold MW and per sold GPU-hour.",
		metaDesc:
			"SynapseDC Capacity and power economics: sellable space, power and GPUs after reservations, PUE and energy, the power bill, contract findings and cost per sold GPU-hour.",
		questions: ["What can we actually sell at this site?", "How much are we paying for power we don't use?", "What does power cost per GPU-hour we sell?"],
		askedBy: ["Capacity manager", "Finance", "Commercial lead"],
		capabilities: [
			{ title: "Capacity by dimension", text: "Space, power, cooling, ports, compute and GPU, by site and by hall." },
			{ title: "Reservations", text: "Reserved, committed, pipeline and requested holds, with the net available power and space." },
			{ title: "PUE and energy", text: "Facility ÷ IT from the site power split, energy per day, CO₂ from the national grid factor." },
			{ title: "The power bill", text: "Energy plus capacity charges, take-or-pay floors, demand ratchets and colocation blocks per committed kW-month." },
			{ title: "Contract findings", text: "Block nearly used up, a new demand peak above the floor, unexplained draw, or an idle block, each with the money exposure." },
			{ title: "GPU power cost", text: "Power per installed and per sold GPU-hour against the price, per pod, per job and per tenant." },
		],
		models: "Both",
		brdRef: "7.8",
		related: ["planner", "gpu-fleet", "facilities"],
	},
	{
		slug: "planner",
		name: "Planner",
		stage: "Plan",
		icon: "drafting-compass",
		short: "Templates, sizing, cost, governance, plan pack",
		headline: "From a requirement to an approved plan pack.",
		summary:
			"Plan new capacity with templates and benchmarks: rack expansions, halls, plant, network paths, refreshes, migrations and new sites. The engine sizes the design, prices CapEx with NPV and payback, schedules from lead times, checks the rules, routes approval by CapEx band and produces a plan pack and a review pack for sign-off.",
		metaDesc:
			"SynapseDC Planner: plan datacenter capacity with templates and benchmarks, sizing, cost and payback, schedule, rule checks, approvals, plan pack and review portal.",
		questions: ["What does a new 2 MW hall cost, and when can it go live?", "Which servers are past end of sale at this site?", "Who has to approve this plan?"],
		askedBy: ["Capacity planner", "Datacenter engineering", "Approver"],
		capabilities: [
			{ title: "Guided wizard", text: "Plan type, requirements, one step per design area, scenarios and review, with a live estimate beside every step." },
			{ title: "Templates and benchmarks", text: "Plan, site and module templates with inheritance, plus versioned benchmarks for cost, efficiency, lead times and rules." },
			{ title: "Cost and schedule", text: "CapEx lines, NPV, IRR, payback, phases and gates, and order-by dates from supplier lead times." },
			{ title: "Materials and sourcing", text: "A bill of materials sourced from spare capacity, then stock, then the contracted vendor." },
			{ title: "Governance", text: "Approval path by template and CapEx band, conditions, delegations, revisions and a frozen baseline." },
			{ title: "Plan pack and review", text: "Drawings, BoM, IP plan and a review portal with comments. Downloads as PDF, workbook and ZIP." },
		],
		models: "Both",
		brdRef: "7.9",
		related: ["capacity-power-economics", "dcim", "build-delivery"],
	},
	{
		slug: "dcim",
		name: "DCIM",
		stage: "Build",
		icon: "server",
		short: "Racks, power chain and cabling as records",
		headline: "One record of the physical estate, under change control.",
		summary:
			"Sites, floors, halls, rows, racks and devices, down to ports, power ports, PDU outlets and every cable. Every DCIM edit carries a change request: standard for pre-approved record work, an open CR at the site, or a new one raised for approval.",
		metaDesc:
			"SynapseDC DCIM: racks, devices, power panels, feeds, outlets, cords and cabling as records, with every change tied to a change request.",
		questions: ["Which outlet is this PSU plugged into?", "Is there 4U and 6 kW free in this hall?", "Which change request moved this server?"],
		askedBy: ["Datacenter engineering", "Capacity planner", "Change manager"],
		capabilities: [
			{ title: "Hierarchy to the port", text: "Site → floor → hall → row → rack → device → ports, bays, power ports and console." },
			{ title: "Power chain", text: "Panels (a hall's A / B busway or −48 V distribution), feeds (rack PDUs), outlets and cords." },
			{ title: "Cabling", text: "Every link with its structured route: patch cord, panel, trunk, ODF and cross-connect." },
			{ title: "Change control", text: "Standard, open CR or raise new. Planned work runs once the CR is approved and not frozen." },
			{ title: "Rack elevation", text: "Drag a device to free units, preview the fit, then move it under a CR." },
			{ title: "Catalogue and explorer", text: "Device and module types, saved views and CSV export." },
		],
		models: "Both",
		brdRef: "7.10",
		related: ["planner", "datacenters", "build-delivery"],
	},
	{
		slug: "build-delivery",
		name: "Build & delivery insights",
		stage: "Build",
		icon: "hard-hat",
		short: "Projects, work orders, commissioning",
		headline: "Approved plans, built and handed over.",
		summary:
			"Insights over the delivery of every approved plan: milestones, work orders with crew windows, purchase orders from the sourced bill of materials, commissioning L1 to L5, permits and earned value. The project record stays in the platform's Programs & Projects module.",
		metaDesc:
			"SynapseDC build and delivery insights: projects, work orders, purchase orders, commissioning L1–L5 and earned value for every approved datacenter plan.",
		questions: ["Which builds are late, and why?", "Is the kit on site for Monday's work order?", "Has L5 integrated systems testing passed?"],
		askedBy: ["Programme manager", "Site lead", "Commissioning engineer"],
		capabilities: [
			{ title: "Projects and programmes", text: "Health (late, at risk, on track), dependency gates, risks and change orders." },
			{ title: "Work orders", text: "Crew windows, site access, checklist and back-out plan, sign-off or re-plan." },
			{ title: "Commissioning", text: "L1 factory witness through L5 integrated systems test, in order." },
			{ title: "Cost", text: "Planned, earned and actual value; CPI and SPI; budget at and estimate at completion." },
		],
		models: "Both",
		brdRef: "8.1–8.3",
		related: ["planner", "dcim"],
	},
	{
		slug: "compliance",
		name: "Compliance",
		stage: "Govern",
		icon: "clipboard-check",
		short: "Policies as code, frameworks, evidence",
		headline: "Evidence from the estate, not from a spreadsheet.",
		summary:
			"Policies are evaluated on the live estate: rack load, dual feeds, cooling N+1, UPS minutes, addresses in plan, end of support, change policy, fire inspections and PM overdue. They map to ISO 27001, ISO 22237, TIA-942 and SOC 2 controls, with decision records and attestations for manual controls.",
		metaDesc:
			"SynapseDC Compliance: datacenter policies as code evaluated on the live estate, mapped to ISO 27001, ISO 22237, TIA-942 and SOC 2, with decision records.",
		questions: ["Which racks break the 80% rule?", "Which controls need evidence before the audit?", "Who attested this manual control, and when?"],
		askedBy: ["Compliance lead", "Auditor", "Facility engineer"],
		capabilities: [
			{ title: "Policies as code", text: "Each policy has its source and can be switched on or off. A policy that is off stops counting." },
			{ title: "Frameworks", text: "ISO 27001, ISO 22237, TIA-942 and SOC 2 controls, mapped to the policies that evidence them." },
			{ title: "Decision records", text: "Every finding is a deny or warn, and every pass an allow, with its input." },
			{ title: "Attestations", text: "Manual controls carry an attestation date and owner." },
		],
		models: "Both",
		brdRef: "7.11",
		related: ["security-ops", "facilities"],
	},
	{
		slug: "opstral-ai",
		name: "Opstral AI assistant",
		stage: "Across the product",
		icon: "sparkles",
		short: "Answers, causes and actions from your data",
		headline: "Ask the estate a question. Get an answer you can verify.",
		summary:
			"An assistant on every screen. It answers from the same data the screens use, explains the likely cause with its evidence and recommends the next step. Disruptive actions stay approval-gated.",
		metaDesc:
			"Opstral AI in SynapseDC: grounded answers about your datacenters, explained root causes and recommended actions, approval-gated.",
		questions: ["Which issue is costing the most revenue?", "Where should the next GPU job go?", "What is power costing us at this site?"],
		askedBy: ["Finance", "GPU platform engineer", "Facility engineer"],
		capabilities: [
			{ title: "Grounded", text: "Answers come from the estate's own records, alarms and figures, never from guesswork." },
			{ title: "Explained", text: "The likely cause with its confidence and evidence." },
			{ title: "Approval-gated", text: "Recommendations that disrupt service wait for a person." },
		],
		models: "Both",
		brdRef: "7.12",
		related: ["alarms-incidents", "command-center"],
	},
];

export const moduleBySlug = (slug: string) => modules.find((m) => m.slug === slug);

export const stages: { stage: Stage; line: string }[] = [
	{ stage: "Plan", line: "Know what you can sell and plan what to build next." },
	{ stage: "Build", line: "Keep the physical record right and deliver approved plans." },
	{ stage: "Operate", line: "Run the estate live: health, faults, impact, money, security." },
	{ stage: "Govern", line: "Prove the estate meets the frameworks you are audited on." },
];
