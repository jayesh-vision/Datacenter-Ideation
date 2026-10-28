/**
 * Use cases for /solutions: what SynapseDC does in a situation an operator recognises.
 * Every card names its modules; figures come from the demo estate and are labelled as such
 * ("Modelled on the demo estate"), never presented as measured customer results.
 */

export type Domain = "facility" | "gpu" | "network" | "commercial" | "security" | "build";

export const DOMAINS: { id: Domain; name: string; color: string; line: string }[] = [
	{ id: "facility", name: "Facility", color: "#60a5fa", line: "Power, cooling, environment and the physical last mile." },
	{ id: "gpu", name: "GPU cloud", color: "#a78bfa", line: "Jobs, GPUs, rails and the building's effect on both." },
	{ id: "network", name: "Network & edge", color: "#2dd4bf", line: "Backhaul, fabric and the alarms that belong to a site." },
	{ id: "commercial", name: "Commercial", color: "#fbbf24", line: "Tenants, SLAs, credits and the power bill." },
	{ id: "security", name: "Security & access", color: "#f87171", line: "Logical, OT and physical security as one case." },
	{ id: "build", name: "Plan & build", color: "#34d399", line: "Capacity, plans, records and commissioning." },
];

export interface UseCase {
	id: string;
	domain: Domain;
	model: "Colocation" | "NeoCloud" | "Both";
	title: string;
	pain: string;
	detail: string;
	does: string[];
	modules: { name: string; href: string }[];
	proof: { v: string; l: string }[];
}

export const USE_CASES: UseCase[] = [
	/* ---- Facility ---- */
	{ id: "UC-F1", domain: "facility", model: "Both", title: "A UPS goes on battery and nobody knows who is affected",
		pain: "The BMS raises a point alarm. Which cabinets, which tenants and whose SLA are worked out by hand.",
		detail: "The alarm is scoped to the site, an incident opens with every service on that busway, the customers and premium customers are listed, and the money per hour and the next credit cliff are on the incident.",
		does: ["Alarm scoped to the site, incident opened automatically", "Services, customers and premium customers listed from the power path", "Cost per hour and time to the next credit tier", "Ranked cause with evidence, approval-gated action"],
		modules: [{ name: "Alarms & incidents", href: "/platform/alarms-incidents" }, { name: "Revenue Impact", href: "/platform/revenue-impact" }, { name: "Facilities", href: "/platform/facilities" }],
		proof: [{ v: "< 60 s", l: "alarm to incident with impact" }, { v: "54", l: "services on the busway listed" }, { v: "$2.6k/h", l: "exposure shown on the incident" }] },
	{ id: "UC-F2", domain: "facility", model: "Both", title: "How long do we ride through if the utility fails now?",
		pain: "UPS minutes, generator readiness and fuel live in three places and are checked by walking the plant room.",
		detail: "One card per site: UPS minutes at today's load, generator kW and start readiness, fuel hours, and the checks behind each figure. The what-if takes any feed, UPS, side or PDU away and shows what goes dark.",
		does: ["Ride-through from live UPS, DG and fuel readings", "What-if per feed, UPS, side, PDU, cooling unit and trunk", "Single points of failure listed per site", "Maintenance planned and booked as changes"],
		modules: [{ name: "Facilities", href: "/platform/facilities" }, { name: "Datacenters", href: "/platform/datacenters" }],
		proof: [{ v: "14 min", l: "UPS ride-through at today's load" }, { v: "38 h", l: "fuel at current draw" }, { v: "7", l: "SPOF classes checked per site" }] },
	{ id: "UC-F3", domain: "facility", model: "Both", title: "A cooling unit fails and the floor has no spare",
		pain: "The CRAH alarm is visible; whether the floor still has N+1 and which racks will heat first is not.",
		detail: "Heat balance per floor against remaining capacity, the racks served by the failed unit, inlet temperatures trending, and liquid loops with their CDUs, so the operator knows whether to move load or wait for the fix.",
		does: ["Heat balance and spare per floor", "Racks and services served by the failed unit", "Inlet trend and environment zones against safe bands", "Fire, leak and access state on the same screen"],
		modules: [{ name: "Facilities", href: "/platform/facilities" }, { name: "Datacenters", href: "/platform/datacenters" }],
		proof: [{ v: "1.6 / 1.7 MW", l: "heat against remaining capacity" }, { v: "per floor", l: "cooling spare judged" }, { v: "zones", l: "with safe-band tracks" }] },
	{ id: "UC-F4", domain: "facility", model: "Both", title: "Which PDU outlet is this server plugged into?",
		pain: "Cords, panels and trunks were documented at install and never again. A fault proves the record wrong.",
		detail: "The physical last mile is derived per site: feed → UPS → busway → PDU → outlet → PSU, and port → patch cord → panel → trunk → ODF → cross-connect. Both are drawn on the device and in the 3D twin.",
		does: ["Power chain to every PSU, cabling to every port", "Devices with both cords on one side flagged", "Trace views in the digital twin", "Records kept under change control in DCIM"],
		modules: [{ name: "Datacenters", href: "/platform/datacenters" }, { name: "DCIM", href: "/platform/dcim" }],
		proof: [{ v: "every PSU", l: "mapped to its outlet" }, { v: "every port", l: "mapped to its trunk" }, { v: "1 CR", l: "on every record change" }] },

	/* ---- GPU cloud ---- */
	{ id: "UC-G1", domain: "gpu", model: "NeoCloud", title: "One failed GPU stops a 152-GPU training job",
		pain: "An Xid error on one GPU stalls the whole allocation. The GPU team sees the error; nobody sees the job, the customer or the cost.",
		detail: "The job with the biggest blast radius is on the Command Center and GPU Fleet: the customer, GPU time lost per hour, minutes since the last checkpoint and work to redo, with a Critical incident opened on the node.",
		does: ["Per-GPU telemetry joined to the job and the customer", "Blast radius, GPU time lost and work to redo", "Critical incident within the polling interval", "Revenue impact on the job's service"],
		modules: [{ name: "GPU Fleet", href: "/platform/gpu-fleet" }, { name: "Revenue Impact", href: "/platform/revenue-impact" }],
		proof: [{ v: "152", l: "GPUs stopped by one failure" }, { v: "$625/h", l: "GPU time lost" }, { v: "52 min", l: "since the last checkpoint" }] },
	{ id: "UC-G2", domain: "gpu", model: "NeoCloud", title: "A job is 24 % slower and the cause is in the plant room",
		pain: "CDU flow drops, GPUs throttle, the job slows. The facility team sees the CDU; the platform team sees a slow job.",
		detail: "Thermal slowdown is traced from the job to the GPUs to the rack to the CDU loop. The slowest job and its cause sit together, with the hardware-slowdown flags and the step-time share lost.",
		does: ["Throttle reasons and clocks per GPU", "CDU loops and rack heat joined to the pod", "Slowest job with step-time share lost", "Incident on the cooling fault, not the job"],
		modules: [{ name: "GPU Fleet", href: "/platform/gpu-fleet" }, { name: "Facilities", href: "/platform/facilities" }],
		proof: [{ v: "24 %", l: "step time lost" }, { v: "62 %", l: "CDU flow at the loop" }, { v: "144", l: "GPUs slowed" }] },
	{ id: "UC-G3", domain: "gpu", model: "NeoCloud", title: "Where should the next 256-GPU job go?",
		pain: "Placement is a guess between free GPUs, rack headroom, cooling state and power already paid for.",
		detail: "Pods are ranked for the job: free healthy GPUs, rack power headroom, cooling state (CDU for liquid), contracted headroom, kW already paid under the block or floor, and the marginal power cost per GPU-hour.",
		does: ["Fit per pod: good, tight or no", "Power already paid for shown as free", "Marginal power cost per GPU-hour", "Model picker: B200, H200, H100, Gaudi 3…"],
		modules: [{ name: "GPU Fleet", href: "/platform/gpu-fleet" }, { name: "Capacity & power economics", href: "/platform/capacity-power-economics" }],
		proof: [{ v: "8–256", l: "GPUs per placement query" }, { v: "$0.19", l: "power per sold GPU-hour" }, { v: "per pod", l: "fit and headroom" }] },
	{ id: "UC-G4", domain: "gpu", model: "NeoCloud", title: "GPUs are allocated, drawing power and doing nothing",
		pain: "Idle allocations are billed and powered, but invisible between the scheduler and the facility.",
		detail: "Idle jobs are listed with their GPUs, the power they draw and what that costs per day, next to the inference pods that could be capped in the peak tariff window.",
		does: ["Idle allocations by job, customer and pod", "Energy and cost per job and per tenant", "Power-cap savings against the GPU time it costs", "Findings against the power contract"],
		modules: [{ name: "GPU Fleet", href: "/platform/gpu-fleet" }, { name: "Capacity & power economics", href: "/platform/capacity-power-economics" }],
		proof: [{ v: "6 h", l: "idle allocation found in the demo" }, { v: "per tenant", l: "energy and cost" }, { v: "4", l: "finding types against contracts" }] },

	/* ---- Network & edge ---- */
	{ id: "UC-N1", domain: "network", model: "Both", title: "A backhaul link drops: is it our fault or a symptom?",
		pain: "Remote PoPs raise alarms when a datacenter link fails. The NOC chases symptoms instead of the cause.",
		detail: "Every alarm carries a scope: site, edge (counted at both ends), dependency or downstream. Downstream symptoms never count on their own; they appear under the causing incident. Edge redundancy reads redundant, lost or isolated.",
		does: ["Scope on every alarm, downstream never double-counted", "Edge redundancy per site", "Ranked root-cause hypotheses with evidence", "A completed change cited by the RCA marked as the cause"],
		modules: [{ name: "Alarms & incidents", href: "/platform/alarms-incidents" }, { name: "Command Center", href: "/platform/command-center" }],
		proof: [{ v: "4", l: "scope classes" }, { v: "both ends", l: "edge links counted" }, { v: "0", l: "downstream symptoms counted alone" }] },
	{ id: "UC-N2", domain: "network", model: "NeoCloud", title: "Four fabric cables down and a host lost both uplinks",
		pain: "InfiniBand and front-end Ethernet faults land as port alarms with no view of which node lost its rails.",
		detail: "Links read by plane (InfiniBand, Ethernet front-end, OOB), rails per node with ports and errors, the host that lost both uplinks named, and the transceiver or fibre trunk in the RCA with DOM readings as evidence.",
		does: ["Fabric planes instead of routing protocols", "Rails per node: ports, errors, flaps", "Cable incidents with transceiver / trunk RCA", "Cable path from port to the far device"],
		modules: [{ name: "GPU Fleet", href: "/platform/gpu-fleet" }, { name: "DCIM", href: "/platform/dcim" }],
		proof: [{ v: "3", l: "planes: IB · Ethernet · OOB" }, { v: "per node", l: "rail health" }, { v: "DOM", l: "readings in the RCA" }] },

	/* ---- Commercial ---- */
	{ id: "UC-C1", domain: "commercial", model: "Both", title: "Which issue is costing the most right now?",
		pain: "Revenue at risk and SLA credits are reconstructed after the event, and never agree between teams.",
		detail: "Each impacted service is charged to one issue, its most severe cause. Lost so far, credits by tier, the next cliff and what is at stake reconcile across issues, customers, datacenters and sites. A cost-of-delay curve orders the work.",
		does: ["Down, degraded or exposed, charged to one issue", "Credits by tier, net of those already locked in", "Σ issues = Σ customers = Σ sites, always", "Cost of delay per issue"],
		modules: [{ name: "Revenue Impact", href: "/platform/revenue-impact" }],
		proof: [{ v: "1", l: "issue per impacted service" }, { v: "3 tiers", l: "of SLA credit tracked" }, { v: "24 h", l: "forecast per issue" }] },
	{ id: "UC-C2", domain: "commercial", model: "Colocation", title: "Which tenants are riding a critical fault right now?",
		pain: "A fault is live and the account team hears from the tenant first.",
		detail: "Exposed services are shown while the fault is live: tenants on the affected path, their SLA, what a four-hour outage would cost in credits, and the notice cadence due to each.",
		does: ["Exposed tenants per fault, premium first", "Potential credits for a four-hour outage", "Customer notices on an update cadence", "Why at risk, on the tenant's page"],
		modules: [{ name: "Revenue Impact", href: "/platform/revenue-impact" }, { name: "Datacenters", href: "/platform/datacenters" }],
		proof: [{ v: "4 h", l: "outage scenario priced" }, { v: "15 / 30 / 60 min", l: "notice cadence" }, { v: "per tenant", l: "why at risk" }] },
	{ id: "UC-C3", domain: "commercial", model: "Both", title: "Free racks are not sellable racks",
		pain: "Space says yes, power says no, cooling says maybe. Sales promises what the hall cannot deliver.",
		detail: "Space, power, cooling, ports and GPUs per site and hall, net of planned devices, contracted power, approved plans and idle allocations. Net available is what can be sold today.",
		does: ["Capacity by dimension, by site and hall", "Reservations: reserved, committed, pipeline, requested", "PUE and energy per site", "Forecast against the 85 % line"],
		modules: [{ name: "Capacity & power economics", href: "/platform/capacity-power-economics" }],
		proof: [{ v: "6", l: "capacity dimensions" }, { v: "4", l: "hold classes netted off" }, { v: "per hall", l: "space and power" }] },
	{ id: "UC-C4", domain: "commercial", model: "Both", title: "We pay for power we don't use",
		pain: "Take-or-pay floors, demand ratchets and idle colocation blocks are found when the invoice arrives.",
		detail: "The bill is priced against the tariff and the contract: energy, demand charge on the floor or peak, idle kW, and findings when a block is nearly used, a new peak sets the ratchet, or draw rises with no change in progress.",
		does: ["Bill per site against real tariffs", "Idle kW paid but not sold", "Findings raised as alarms and incidents", "Cost per sold MW and per sold GPU-hour"],
		modules: [{ name: "Capacity & power economics", href: "/platform/capacity-power-economics" }],
		proof: [{ v: "4", l: "contract finding types" }, { v: "per site", l: "idle kW priced" }, { v: "$/GPU-h", l: "power against price" }] },

	/* ---- Security & access ---- */
	{ id: "UC-S1", domain: "security", model: "Both", title: "A badge-in at 02:10 and an ACL change on the WAN edge",
		pain: "The door system and the network logs never meet. Two events, two tools, no case.",
		detail: "Physical and logical detections are correlated: the badge read, the unapproved config change on the edge router outside any change window, and the user, in one case on NIST 800-61 phases with ATT&CK techniques.",
		does: ["Cross-domain detections: PACS + config drift", "Cases with phases, evidence and owner", "ATT&CK coverage and gaps", "Change windows as context for every detection"],
		modules: [{ name: "Security Ops", href: "/platform/security-ops" }, { name: "Datacenters", href: "/platform/datacenters" }],
		proof: [{ v: "1 case", l: "from two domains" }, { v: "800-61", l: "phases on every case" }, { v: "ATT&CK", l: "Enterprise + ICS" }] },
	{ id: "UC-S2", domain: "security", model: "Both", title: "A UPS network card still has default credentials",
		pain: "Plant controllers sit on the OT network with vendor defaults and Modbus open to anything that can reach them.",
		detail: "OT zones are rated on IEC 62443 (target vs achieved level), default credentials and a Modbus write on a UPS card raise a case, and hardening checks per device family show the drift.",
		does: ["OT zones with SL-T vs SL-A", "Default-credential and Modbus-write detections", "Hardening checks and unauthorised drift", "SSVC decisions from CVSS, EPSS and KEV"],
		modules: [{ name: "Security Ops", href: "/platform/security-ops" }, { name: "Compliance", href: "/platform/compliance" }],
		proof: [{ v: "62443", l: "zones and levels" }, { v: "SSVC", l: "vulnerability decisions" }, { v: "per family", l: "hardening checks" }] },
	{ id: "UC-S3", domain: "security", model: "Colocation", title: "Who entered the cage, and were they escorted?",
		pain: "The access audit is a quarterly spreadsheet; tailgating and held-open doors are found by chance.",
		detail: "Twenty-four hours of entries and badge reads per site, exceptions (tailgating, forced or held doors, anti-passback, unescorted visitors, overstays), who is on site now, and the quarterly rights review.",
		does: ["On site now, by role and reason", "Exceptions with evidence and owner", "Access rights review: expired and unused badges", "Audit trail per door and person"],
		modules: [{ name: "Datacenters", href: "/platform/datacenters" }, { name: "Security Ops", href: "/platform/security-ops" }],
		proof: [{ v: "8", l: "exception types" }, { v: "24 h", l: "log on every site" }, { v: "quarterly", l: "rights review" }] },

	/* ---- Plan & build ---- */
	{ id: "UC-B1", domain: "build", model: "Both", title: "What does a new 2 MW hall cost, and when can it go live?",
		pain: "A new hall is planned in a spreadsheet, priced from memory and approved by email.",
		detail: "A template sizes the hall, benchmarks price it, lead times schedule it, rules check it, the approval path follows the CapEx band, and the plan pack carries drawings, BoM and the business case to sign-off.",
		does: ["Templates and benchmarks, versioned", "CapEx, NPV, payback and phases", "Rule checks and readiness", "Plan pack, review portal and approvals"],
		modules: [{ name: "Planner", href: "/platform/planner" }, { name: "Capacity & power economics", href: "/platform/capacity-power-economics" }],
		proof: [{ v: "59", l: "templates" }, { v: "230", l: "benchmarks" }, { v: "6", l: "plan families" }] },
	{ id: "UC-B2", domain: "build", model: "Both", title: "Which servers are past end of sale, site by site?",
		pain: "Refresh candidates are found by walking the halls or by vendor notice.",
		detail: "Lifecycle per device: install date, warranty, support contract, vendor end of sale and support. A refresh plan selects every eligible device at a site, splits them over waves and sources the replacements.",
		does: ["Warranty, support and vendor dates per device", "RMA cases and spares per part family", "Refresh plan over waves", "Sourcing from stock, site or vendor"],
		modules: [{ name: "Planner", href: "/platform/planner" }, { name: "DCIM", href: "/platform/dcim" }],
		proof: [{ v: "4", l: "lifecycle states" }, { v: "per model", l: "end of sale and support" }, { v: "waves", l: "for every refresh" }] },
	{ id: "UC-B3", domain: "build", model: "Both", title: "Install a rack of GPUs without losing the record",
		pain: "The build team installs, the record is updated later, and the live estate starts from a record nobody trusts.",
		detail: "The install is planned work under a change request: U reserved, device installed as a record, ports connected, cords to outlets, and the work order, kit and commissioning gates tracked to handover.",
		does: ["Reserve U, install, connect under one CR", "Work orders with kit status and sign-off", "Commissioning L1 → L5 in order", "Handover completes the plan and releases holds"],
		modules: [{ name: "DCIM", href: "/platform/dcim" }, { name: "Build & delivery", href: "/platform/build-delivery" }],
		proof: [{ v: "1 CR", l: "on every write" }, { v: "L1–L5", l: "gates in order" }, { v: "per WO", l: "kit and crew window" }] },
];

export const useCasesByDomain = (d: Domain) => USE_CASES.filter((u) => u.domain === d);
