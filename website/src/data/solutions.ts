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
	pains?: { pain: string; answer: string; module: string }[];
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
		facts: [
			{ label: "What is sold", value: "Cabinets, cages, suites, contracted kW, cross-connects, remote hands" },
			{ label: "Inside the rack", value: "Never polled. Power at the cabinet (A / B vs contracted kW), inlet temperature, cage door" },
			{ label: "Premium tier", value: "Premium tenants, SLA 99.999 / 99.99" },
			{ label: "Capacity unit", value: "kW and cabinets" },
			{ label: "Not a loss", value: "A tenant drawing above contracted power" },
		],
		pains: [
			{ pain: "A plant alarm, but no idea which tenants are affected", answer: "Power path to the cabinet; exposed tenants and credits per issue", module: "revenue-impact" },
			{ pain: "Free racks you cannot actually sell", answer: "Space, power and cooling together, net of reservations", module: "capacity-power-economics" },
			{ pain: "Tenants over their contracted power", answer: "Draw vs contracted kW per cabinet, overage and stranded power", module: "capacity-power-economics" },
			{ pain: "Single-fed cabinets found during a fault", answer: "SPOF list and what-if per feed, UPS, side and PDU", module: "facilities" },
			{ pain: "Access audits by spreadsheet", answer: "Who entered which cage, escorted or not, exceptions and the rights review", module: "datacenters" },
			{ pain: "Cross-connect and remote-hands backlog", answer: "Orders and tickets on the tenant's page", module: "datacenters" },
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
		facts: [
			{ label: "What is sold", value: "Reserved GPU clusters and on-demand GPUs, billed per GPU-hour" },
			{ label: "Monitored", value: "Node BMC, per-GPU DCGM telemetry, fabric rails, scheduler job metadata" },
			{ label: "Never", value: "Workload data, model weights, code or job contents" },
			{ label: "Premium tier", value: "Reserved customers, SLA 99.9 / 99.5" },
			{ label: "Capacity unit", value: "GPUs" },
		],
		pains: [
			{ pain: "GPU teams can't see the building", answer: "CDU flow, power caps and rack heat joined to the job they slow down", module: "gpu-fleet" },
			{ pain: "One bad GPU stalls a whole job", answer: "Blast radius, GPU time lost and work to redo since the checkpoint", module: "gpu-fleet" },
			{ pain: "Idle allocations nobody notices", answer: "Idle allocated GPUs and their cost per hour", module: "gpu-fleet" },
			{ pain: "Power is the biggest cost", answer: "Power per sold GPU-hour against the price, take-or-pay floors, demand ratchets", module: "capacity-power-economics" },
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
	modules: string[];
}

export const roles: Role[] = [
	{ slug: "noc-operations", name: "NOC & operations", icon: "monitor", short: "Alarms in scope, incidents with impact", headline: "Start every shift knowing what to do first.", summary: "Alarms scoped to the datacenter, incidents that arrive with affected customers, likely cause and actions, and the on-call chain beside them.", questions: ["What is failing, and is it ours?", "Who is affected?", "What do we do first?"], modules: ["command-center", "alarms-incidents", "datacenters"] },
	{ slug: "facility-engineering", name: "Facility engineering", icon: "zap", short: "Power, cooling, SPOFs, maintenance", headline: "See the building's weak points before a fault finds them.", summary: "The power path, ride-through, cooling heat balance, environment, single points of failure, a what-if for every asset and the maintenance plan.", questions: ["How long do we ride through a utility loss?", "Is there a cooling spare on this floor?", "What breaks if we service UPS-2?"], modules: ["facilities", "datacenters", "compliance"] },
	{ slug: "gpu-platform", name: "GPU / AI platform", icon: "cpu", short: "Jobs, GPUs, rails, placement", headline: "Keep the jobs running and the GPUs earning.", summary: "Per-GPU telemetry, jobs and blast radius, network rails, the building's effect on GPUs and where to place the next job.", questions: ["Which job did this Xid stop?", "Why is this job 24% slower?", "Where does the next 256-GPU job fit?"], modules: ["gpu-fleet", "capacity-power-economics", "alarms-incidents"] },
	{ slug: "capacity-planning", name: "Capacity & planning", icon: "drafting-compass", short: "Sellable capacity, plans, approvals", headline: "Sell capacity with confidence. Plan what comes next.", summary: "Net available power and space after holds, power economics, and a planner from requirement to an approved plan pack.", questions: ["What can we sell here?", "What does the next hall cost?", "When does power run out?"], modules: ["capacity-power-economics", "planner", "dcim"] },
	{ slug: "finance-commercial", name: "Finance & commercial", icon: "badge-dollar-sign", short: "Revenue impact, credits, the power bill", headline: "Put a number on every fault and every idle kW.", summary: "Revenue lost and SLA credits per issue, money at stake, the power bill and its findings, cost per sold MW and per GPU-hour.", questions: ["What is this incident costing?", "What credits are we exposed to?", "What are we paying for power we don't use?"], modules: ["revenue-impact", "capacity-power-economics"] },
	{ slug: "security-compliance", name: "Security & compliance", icon: "shield-check", short: "Detections, cases, frameworks, evidence", headline: "One view of logical, OT and physical security.", summary: "Detections on ATT&CK, cases on NIST 800-61, SSVC vulnerabilities, OT zones on IEC 62443, access exceptions, and compliance evidence from the live estate.", questions: ["Who was on site when the config changed?", "Which controls lack evidence?", "Which OT devices miss their target level?"], modules: ["security-ops", "compliance", "datacenters"] },
	{ slug: "executive", name: "Executive", icon: "user-round", short: "Estate health, money, pipeline", headline: "The estate, the money and the pipeline in one look.", summary: "The Command Center hero, revenue impact, GPU fleet health and the plan & build pipeline.", questions: ["How healthy is the estate?", "What is it costing us?", "What capacity is coming?"], modules: ["command-center", "revenue-impact", "planner"] },
];
