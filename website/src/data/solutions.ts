/**
 * Business models (/solutions/<slug>) and roles (/roles/<slug>).
 * First release = colocation + NeoCloud (BRD §5); cloud, enterprise and telco follow.
 */

export interface Solution {
	slug: string;
	name: string;
	icon: string;
	status: "First release" | "Later release";
	short: string;
	headline: string;
	summary: string;
	metaDesc: string;
	killer?: string;
	facts?: { label: string; value: string }[];
	/** Heading of the facts section, written for this business model. */
	factsTitle?: string;
	/** Heading and intro of the pains section (the illustration with the pains spotlighted). */
	painsTitle?: string;
	screenIntro?: string;
	/** `area` = the panel on this model's illustration (640 × 420 canvas) where the answer shows. */
	pains?: { pain: string; answer: string; module: string; area?: [number, number, number, number] }[];
	privacy?: string;
	modules: string[];
}

export const solutions: Solution[] = [
	{
		slug: "colocation",
		name: "Colocation",
		icon: "warehouse",
		status: "First release",
		short: "Power, space and cooling sold to tenants",
		headline: "Which tenants are riding a critical fault right now, and what will the credits be?",
		summary:
			"You sell cabinets, cages and suites: contracted kW, space, cross-connects and remote hands. SynapseDC follows the power from the utility feed to the tenant's cabinet, joins it to tenants and contracts, and shows the capacity you have paid for but cannot sell yet.",
		metaDesc:
			"SynapseDC for colocation operators: tenant impact and SLA credits per fault, contracted power vs draw, sellable capacity, cross-connects and access audits.",
		killer: "UPS-2 goes on battery: which cabinets are on it, whose SLA is at risk and what it will cost, before anyone asks.",
		factsTitle: "Cabinets, contracted kW and tenants you never look inside.",
		painsTitle: "Six colocation faults, read from the cabinet outward.",
		screenIntro: "One tenant cabinet as SynapseDC sees it: the power it is fed from, the draw against the contract, the inlet, the cage door and the fault it is riding.",
		facts: [
			{ label: "What is sold", value: "Cabinets, cages, suites, contracted kW, cross-connects, remote hands" },
			{ label: "Inside the rack", value: "Never polled. Power at the cabinet (A / B vs contracted kW), inlet temperature, cage door" },
			{ label: "Premium tier", value: "Premium tenants, SLA 99.999 / 99.99" },
			{ label: "Capacity unit", value: "kW and cabinets" },
			{ label: "Not a loss", value: "A tenant drawing above contracted power" },
		],
		pains: [
			{ pain: "A plant alarm, but no idea which tenants are affected", answer: "Power path to the cabinet; exposed tenants and credits per issue", module: "revenue-impact", area: [380, 310, 210, 60] },
			{ pain: "Free racks you cannot actually sell", answer: "Space, power and cooling together, net of reservations", module: "capacity-power-economics" },
			{ pain: "Tenants over their contracted power", answer: "Draw vs contracted kW per cabinet, overage and stranded power", module: "capacity-power-economics", area: [380, 70, 210, 60] },
			{ pain: "Single-fed cabinets found during a fault", answer: "SPOF list and what-if per feed, UPS, side and PDU", module: "facilities", area: [48, 70, 150, 30] },
			{ pain: "Access audits by spreadsheet", answer: "Who entered which cage, escorted or not, exceptions and the rights review", module: "datacenters", area: [380, 230, 210, 60] },
			{ pain: "Cross-connect and remote-hands backlog", answer: "Orders and tickets on the tenant's page", module: "datacenters", area: [200, 60, 130, 300] },
		],
		privacy: "Tenant equipment is sealed. SynapseDC never polls or looks inside it; it measures the cabinet from the outside.",
		modules: ["command-center", "facilities", "revenue-impact", "capacity-power-economics", "datacenters", "security-ops"],
	},
	{
		slug: "neocloud",
		name: "NeoCloud / GPU cloud",
		icon: "cpu",
		status: "First release",
		short: "Reserved clusters and on-demand GPUs",
		headline: "One failed GPU stopped 152 GPUs. Which job, which customer, what per hour, where is the last checkpoint?",
		summary:
			"You rent GPUs and must keep expensive jobs running. SynapseDC joins the building, the fabric, the GPU and the job into one picture, so a CDU flow drop or a power cap reads as GPU time lost, and a stalled job opens a Critical incident within seconds of the Xid.",
		metaDesc:
			"SynapseDC for NeoCloud and GPU cloud operators: per-GPU telemetry, jobs and blast radius, GPU time lost, power per sold GPU-hour and job placement.",
		killer: "Xid 79 on one GPU stalls a 152-GPU training run: lost per hour, work to redo since the checkpoint, the customer and the recovery plan.",
		factsTitle: "GPUs, jobs and customers, with the building underneath them.",
		painsTitle: "Six GPU-cloud problems, joined to the job they hurt.",
		screenIntro: "One GPU node as SynapseDC sees it: the failed GPU, the job it stalled, the customer behind it, the power that job costs and the line the platform never crosses.",
		facts: [
			{ label: "What is sold", value: "Reserved GPU clusters and on-demand GPUs, billed per GPU-hour" },
			{ label: "Monitored", value: "Node BMC, per-GPU DCGM telemetry, fabric rails, scheduler job metadata" },
			{ label: "Never", value: "Workload data, model weights, code or job contents" },
			{ label: "Premium tier", value: "Reserved customers, SLA 99.9 / 99.5" },
			{ label: "Capacity unit", value: "GPUs" },
		],
		pains: [
			{ pain: "GPU teams can't see the building", answer: "CDU flow, power caps and rack heat joined to the job they slow down", module: "gpu-fleet", area: [48, 222, 260, 38] },
			{ pain: "One bad GPU stalls a whole job", answer: "Blast radius, GPU time lost and work to redo since the checkpoint", module: "gpu-fleet", area: [380, 80, 220, 80] },
			{ pain: "Idle allocations nobody notices", answer: "Idle allocated GPUs and their cost per hour", module: "gpu-fleet", area: [48, 60, 260, 160] },
			{ pain: "Power is the biggest cost", answer: "Power per sold GPU-hour against the price, take-or-pay floors, demand ratchets", module: "capacity-power-economics", area: [380, 180, 220, 80] },
			{ pain: "Where to place the next big job", answer: "Pods ranked by free healthy GPUs, headroom, cooling and power already paid for", module: "gpu-fleet" },
			{ pain: "Crypto-mining or rogue devices on the fabric", answer: "Detections on GPU nodes, OOB and BMCs", module: "security-ops" },
		],
		privacy: "The GPUs are yours, so SynapseDC monitors GPUs and jobs. It never reads a job's data, model or code.",
		modules: ["gpu-fleet", "command-center", "revenue-impact", "capacity-power-economics", "facilities", "security-ops"],
	},
	{
		slug: "cloud",
		name: "Cloud",
		icon: "cloud",
		status: "Later release",
		short: "Leaf-spine fabric, server, storage and GPU hosts",
		headline: "Cloud operators: on the roadmap.",
		summary: "The same estate model with leaf–spine fabric and server, storage and GPU hosts. The prototype already carries this variant; requirements follow the first release.",
		metaDesc: "SynapseDC for cloud operators is planned after the first release. Talk to us about your estate.",
		modules: ["command-center", "gpu-fleet", "facilities"],
	},
	{
		slug: "enterprise",
		name: "Enterprise",
		icon: "landmark",
		status: "Later release",
		short: "Own datacenters, business value and OLAs",
		headline: "Enterprise datacenters: on the roadmap.",
		summary: "Business value, cost of downtime and OLA rebates in place of revenue and SLA credits. The prototype already carries this variant; requirements follow the first release.",
		metaDesc: "SynapseDC for enterprise datacenters is planned after the first release. Talk to us about your estate.",
		modules: ["command-center", "revenue-impact", "facilities"],
	},
	{
		slug: "telco",
		name: "Network / telco",
		icon: "radio-tower",
		status: "Later release",
		short: "Routers, DWDM, backhaul and operator servers",
		headline: "Telco datacenters: on the roadmap.",
		summary: "Routers, switches, DWDM and the operator's own servers, with backhaul edge redundancy. The prototype already carries this variant; requirements follow the first release.",
		metaDesc: "SynapseDC for network and telco datacenters is planned after the first release. Talk to us about your estate.",
		modules: ["command-center", "alarms-incidents", "facilities"],
	},
];

export interface Role {
	slug: string;
	name: string;
	icon: string;
	short: string;
	headline: string;
	summary: string;
	questions: string[];
	/** Heading of the questions section, written for this role. */
	askTitle: string;
	screenIntro: string;
	/** Which illustration the questions are spotlighted on (a module slug); defaults to modules[0]. */
	art?: string;
	/** What the screen answers with and where, same order as `questions`. */
	answers: { text: string; area?: [number, number, number, number] }[];
	modules: string[];
}

export const roles: Role[] = [
	{ slug: "noc-operations", name: "NOC & operations", icon: "monitor", short: "Alarms in scope, incidents with impact", headline: "Start every shift knowing what to do first.", summary: "Alarms scoped to the datacenter, incidents that arrive with affected customers, likely cause and actions, and the on-call chain beside them.", questions: ["What is failing, and is it ours?", "Who is affected?", "What do we do first?"], askTitle: "The first minute of every shift.", screenIntro: "The Command Center: every live site worst-first, with the cause, the customers and the next step on one screen.", answers: [{ text: "The map and the worst-first column point at the site; the scope ring says whether the fault is inside it.", area: [216, 98, 220, 246] }, { text: "Customers and services read from the busway, the trunk or the job, premium first.", area: [448, 98, 168, 246] }, { text: "Recommendations ranked by money and customers at risk; disruptive steps wait for approval.", area: [24, 376, 592, 30] }], modules: ["command-center", "alarms-incidents", "datacenters"] },
	{ slug: "facility-engineering", name: "Facility engineering", icon: "zap", short: "Power, cooling, SPOFs, maintenance", headline: "See the building's weak points before a fault finds them.", summary: "The power path, ride-through, cooling heat balance, environment, single points of failure, a what-if for every asset and the maintenance plan.", questions: ["How long do we ride through a utility loss?", "Is there a cooling spare on this floor?", "What breaks if we service UPS-2?"], askTitle: "The plant, read as minutes, kilowatts and spares.", screenIntro: "Facilities: the power path from the utility feed to the rack, the ride-through card, cooling per floor and the what-if.", answers: [{ text: "UPS minutes, then generator kW and fuel hours, with the readiness checks behind them.", area: [24, 224, 300, 90] }, { text: "Cooling per floor against its heat load, the spare unit named or marked missing.", area: [336, 224, 280, 90] }, { text: "The what-if: every rack, device and service that goes dark when UPS-2 is taken out.", area: [24, 322, 592, 84] }], modules: ["facilities", "datacenters", "compliance"] },
	{ slug: "gpu-platform", name: "GPU / AI platform", icon: "cpu", short: "Jobs, GPUs, rails, placement", headline: "Keep the jobs running and the GPUs earning.", summary: "Per-GPU telemetry, jobs and blast radius, network rails, the building's effect on GPUs and where to place the next job.", questions: ["Which job did this Xid stop?", "Why is this job 24% slower?", "Where does the next 256-GPU job fit?"], askTitle: "The job, the GPU and the building on one screen.", screenIntro: "GPU Fleet: the job with the biggest blast radius, the slowest job, per-GPU telemetry and where the next job fits.", answers: [{ text: "The Xid, the node, the job it stalled and the customer who owns it.", area: [340, 48, 276, 92] }, { text: "CDU flow, a power cap or rack heat, joined to the job it slows and the money per hour.", area: [340, 150, 276, 74] }, { text: "Pods ranked by free healthy GPUs, rack headroom, cooling and the marginal power cost per GPU-hour.", area: [340, 234, 276, 128] }], modules: ["gpu-fleet", "capacity-power-economics", "alarms-incidents"] },
	{ slug: "capacity-planning", name: "Capacity & planning", icon: "drafting-compass", short: "Sellable capacity, plans, approvals", headline: "Sell capacity with confidence. Plan what comes next.", summary: "Net available power and space after holds, power economics, and a planner from requirement to an approved plan pack.", questions: ["What can we sell here?", "What does the next hall cost?", "When does power run out?"], askTitle: "What can be sold, and what the next hall costs.", screenIntro: "The Planner: sellable capacity at the site, the hall being planned, its schedule, business case and approval path.", art: "planner", answers: [{ text: "Space, power, cooling and GPUs per hall, net of reservations, pipeline and holds.", area: [24, 52, 196, 254] }, { text: "CapEx, NPV and payback from the benchmarks, with the approval path by CapEx band.", area: [448, 52, 168, 254] }, { text: "The schedule from supplier lead times, against the date the capacity is needed.", area: [232, 230, 210, 80] }], modules: ["capacity-power-economics", "planner", "dcim"] },
	{ slug: "finance-commercial", name: "Finance & commercial", icon: "badge-dollar-sign", short: "Revenue impact, credits, the power bill", headline: "Put a number on every fault and every idle kW.", summary: "Revenue lost and SLA credits per issue, money at stake, the power bill and its findings, cost per sold MW and per GPU-hour.", questions: ["What is this incident costing?", "What credits are we exposed to?", "What are we paying for power we don't use?"], askTitle: "A number on every fault and every idle kW.", screenIntro: "Revenue Impact: every open issue priced, the cost of delay on the one costing most, and totals that reconcile.", answers: [{ text: "Revenue lost so far and the rate per hour, charged to the issue's most severe cause.", area: [24, 52, 312, 262] }, { text: "Credits by tier, the next cliff and what an outage on an exposed service would cost.", area: [348, 52, 268, 262] }, { text: "Idle contracted kW and take-or-pay floors as money per month, on the Capacity screen." }], modules: ["revenue-impact", "capacity-power-economics"] },
	{ slug: "security-compliance", name: "Security & compliance", icon: "shield-check", short: "Detections, cases, frameworks, evidence", headline: "One view of logical, OT and physical security.", summary: "Detections on ATT&CK, cases on NIST 800-61, SSVC vulnerabilities, OT zones on IEC 62443, access exceptions, and compliance evidence from the live estate.", questions: ["Who was on site when the config changed?", "Which controls lack evidence?", "Which OT devices miss their target level?"], askTitle: "Doors, routers and controllers in one case model.", screenIntro: "Security Ops: physical, network and OT detections joined into one case, on ATT&CK and NIST 800-61.", answers: [{ text: "The badge-in and the configuration change read as one case, with the person, the door and the device.", area: [48, 80, 330, 190] }, { text: "Controls mapped to the policies that evidence them, with the ones still Not assessed, on Compliance." }, { text: "IEC 62443 zones with target against achieved security level, and the devices that miss it.", area: [48, 300, 330, 80] }], modules: ["security-ops", "compliance", "datacenters"] },
	{ slug: "executive", name: "Executive", icon: "user-round", short: "Estate health, money, pipeline", headline: "The estate, the money and the pipeline in one look.", summary: "The Command Center hero, revenue impact, GPU fleet health and the plan & build pipeline.", questions: ["How healthy is the estate?", "What is it costing us?", "What capacity is coming?"], askTitle: "The estate, the money and the pipeline.", screenIntro: "The Command Center: one health score, the live map, the worst-first column and the plan & build strip.", answers: [{ text: "One health score across GPU fleet, power, cooling and network, following the worst single issue.", area: [24, 98, 180, 246] }, { text: "The worst open incidents with the money and customers behind each one.", area: [448, 98, 168, 246] }, { text: "Plans in review, builds in flight and capacity not yet live, in the plan & build lens." }], modules: ["command-center", "revenue-impact", "planner"] },
];
