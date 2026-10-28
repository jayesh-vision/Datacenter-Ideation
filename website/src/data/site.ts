/**
 * Shared site content: navigation, footer, FAQ, integrations, onboarding journey,
 * differentiators and placeholder pages.
 */
import { modules } from "./modules";
import { roles, solutions } from "./solutions";

export interface NavLink {
	label: string;
	href: string;
	desc?: string;
	icon?: string;
}
export interface NavItem {
	label: string;
	/** Landing page; a click on the label always navigates here. */
	href: string;
	columns?: { heading: string; links: NavLink[] }[];
	footerLinks?: NavLink[];
	promo?: { kicker: string; title: string; desc: string; cta: string; href: string };
}

const moduleLink = (slug: string): NavLink => {
	const m = modules.find((x) => x.slug === slug)!;
	return { label: m.name, desc: m.short, icon: m.icon, href: `/platform/${m.slug}` };
};

export const navigation: NavItem[] = [
	{
		label: "Platform",
		href: "/platform",
		columns: [
			{ heading: "Plan & build", links: ["capacity-power-economics", "planner", "dcim", "build-delivery", "compliance", "opstral-ai"].map(moduleLink) },
			{ heading: "Operate", links: ["command-center", "datacenters", "facilities", "gpu-fleet", "alarms-incidents", "revenue-impact", "security-ops"].map(moduleLink) },
		],
		footerLinks: [
			{ label: "Platform overview", href: "/platform" },
			{ label: "How it works", href: "/how-it-works" },
		],
	},
	{
		label: "Solutions",
		href: "/solutions",
		columns: [
			{ heading: "By business model", links: solutions.map((s) => ({ label: s.name, desc: s.status === "First release" ? s.short : "On the roadmap", icon: s.icon, href: `/solutions/${s.slug}` })) },
			{ heading: "By role", links: roles.map((r) => ({ label: r.name, desc: r.short, icon: r.icon, href: `/roles/${r.slug}` })) },
		],
		promo: {
			kicker: "GPU cloud story",
			title: "One failed GPU stopped 152 GPUs",
			desc: "Which job, which customer, what per hour and where the last checkpoint is.",
			cta: "See GPU Fleet",
			href: "/platform/gpu-fleet",
		},
	},
	{ label: "Integrations", href: "/integrations" },
	{ label: "How it works", href: "/how-it-works" },
	{
		label: "Resources",
		href: "/resources",
		columns: [
			{
				heading: "Learn",
				links: [
					{ label: "FAQ", desc: "Common questions answered", icon: "circle-help", href: "/faq" },
					{ label: "Glossary", desc: "Datacenter terms defined", icon: "book-open", href: "/glossary" },
					{ label: "Blog", desc: "Field notes from datacenter operations", icon: "newspaper", href: "/blog" },
					{ label: "Case studies", desc: "Pilot results, basis stated", icon: "line-chart", href: "/case-studies" },
					{ label: "Videos", desc: "See the platform run", icon: "video", href: "/videos" },
				],
			},
			{
				heading: "Company",
				links: [
					{ label: "Why SynapseDC", desc: "How we differ from DCIM, BMS and ITSM", icon: "scale", href: "/why-synapsedc" },
					{ label: "Security & trust", desc: "Read-only, outbound-only", icon: "lock", href: "/how-it-works#security" },
					{ label: "About", desc: "Who is building it, and how", icon: "users", href: "/about" },
				],
			},
		],
	},
];

export const footerColumns: { title: string; links: [string, string][] }[] = [
	{ title: "Plan & build", links: ["capacity-power-economics", "planner", "dcim", "build-delivery", "compliance"].map((s) => { const m = modules.find((x) => x.slug === s)!; return [m.name, `/platform/${s}`]; }) },
	{ title: "Operate", links: ["command-center", "datacenters", "facilities", "gpu-fleet", "alarms-incidents", "revenue-impact", "security-ops"].map((s) => { const m = modules.find((x) => x.slug === s)!; return [m.name, `/platform/${s}`]; }) },
	{ title: "Solutions", links: [...solutions.slice(0, 2).map((s) => [s.name, `/solutions/${s.slug}`] as [string, string]), ...roles.slice(0, 4).map((r) => [r.name, `/roles/${r.slug}`] as [string, string])] },
	{ title: "Company", links: [["Why SynapseDC", "/why-synapsedc"], ["How it works & security", "/how-it-works"], ["Integrations", "/integrations"], ["FAQ", "/faq"], ["Contact", "/contact"]] },
];

export interface Faq {
	q: string;
	a: string;
	cat: "Product" | "Data & security" | "Getting started" | "Commercial";
}

export const faqs: Faq[] = [
	{ cat: "Product", q: "What is SynapseDC, in plain words?", a: "One platform for the whole datacenter lifecycle: plan capacity and new halls, build them with racks, power chains and cabling under change control, and operate them live, with the building, the equipment, the GPUs and the network connected to the customers and contracts they serve." },
	{ cat: "Product", q: "We already have a DCIM. Why do we need this?", a: "A DCIM keeps asset records and plans space and power. SynapseDC runs live operations on top of the records: incidents with impact, revenue, access, security and change control in one view. It can import your DCIM." },
	{ cat: "Product", q: "Our BMS already shows the alarms.", a: "The BMS controls and alarms on points. SynapseDC turns a point alarm into impact: which racks, tenants and contracts are affected, what it costs and what to do." },
	{ cat: "Product", q: "Which business models does it support?", a: "The first release targets colocation and NeoCloud / GPU cloud. They share one estate model, one alarm model and one money model. Cloud, enterprise and telco variants follow." },
	{ cat: "Product", q: "How does the AI assistant work?", a: "Opstral AI answers from the same data the screens use, explains the likely cause with its evidence and recommends the next step. Disruptive actions stay approval-gated." },
	{ cat: "Data & security", q: "Will you control or change our plant?", a: "No. SynapseDC is read-only by design. It reads the BMS, UPS, PDUs, meters, network and BMCs and never changes a set point or switches anything. People act through a change request." },
	{ cat: "Data & security", q: "Does data leave our site?", a: "An on-site collector (active + standby) reads the equipment and sends outbound only, over mTLS on port 443. Nothing connects into the site." },
	{ cat: "Data & security", q: "Do you look inside tenant equipment or customer jobs?", a: "In colocation, tenant gear is sealed: it is never polled. In a GPU cloud the GPUs are the operator's, so GPUs and jobs are monitored, but never a job's data, model or code." },
	{ cat: "Data & security", q: "Our BMS is old and has no API.", a: "The protocols usually still work: SNMP, Modbus, BACnet or OPC UA through the collector." },
	{ cat: "Getting started", q: "How long does onboarding take?", a: "A pilot on one site typically takes 6–10 weeks. Further integrations follow in waves of 4–12 weeks." },
	{ cat: "Getting started", q: "Our data is a mess.", a: "That's normal. We start small with an import template in load order (core, recommended, optional) and clean the data as we go. Reconciliation checks show what does not add up." },
	{ cat: "Getting started", q: "We only have one or two sites.", a: "The value still comes from impact, single points of failure, power economics and audit evidence." },
	{ cat: "Getting started", q: "Do we have to replace our ITSM or CRM?", a: "No. If you have one, SynapseDC integrates with it (for example ServiceNow, Jira, Salesforce). If you don't, the platform offers its own modules." },
	{ cat: "Commercial", q: "What does it cost?", a: "We agree the value first, using your own figures. Pricing comes from the commercial team." },
];

export interface Integration {
	group: string;
	desc: string;
	items: string[];
}

/** Southbound sources and northbound systems, from the interface specification. Names are systems, not partnerships. */
export const integrations: Integration[] = [
	{ group: "Building & power", desc: "BMS, EPMS, UPS, PDUs, ATS, generators, meters", items: ["BACnet", "Modbus TCP", "OPC UA", "SNMPv3", "Redfish (PDU)", "Meter / sub-meter"] },
	{ group: "Cooling & environment", desc: "CRAH / CRAC, CDUs, leak detection, sensors", items: ["BACnet", "Modbus", "SNMP", "Leak rope", "Temperature / humidity"] },
	{ group: "Network", desc: "Routers, switches, optics, DWDM", items: ["SNMPv3", "gNMI", "Syslog", "LLDP", "NetFlow", "Config backups"] },
	{ group: "Servers & BMCs", desc: "Compute, storage and GPU nodes", items: ["Redfish", "IPMI", "osquery"] },
	{ group: "GPU & AI", desc: "Per-GPU telemetry, schedulers, fabric", items: ["NVIDIA DCGM", "Intel Gaudi hl-smi", "Intel XPU Manager", "Slurm / Kubernetes scheduler", "InfiniBand UFM"] },
	{ group: "Physical security", desc: "Doors, cages, CCTV", items: ["PACS events", "VMS references", "Visitor system"] },
	{ group: "ITSM", desc: "Incidents, changes, problems, CMDB", items: ["ServiceNow", "Jira Service Management", "Platform Services & ITSM"] },
	{ group: "CRM & BSS", desc: "Customers, contracts, orders, catalogue", items: ["Salesforce", "Microsoft Dynamics", "HubSpot", "Platform BSS"] },
	{ group: "IP & records", desc: "IPAM, DNS, DHCP, DCIM import", items: ["Infoblox", "BlueCat", "Kea DHCP", "DCIM import", "Excel import template"] },
	{ group: "Northbound", desc: "Out of SynapseDC into your tools", items: ["REST API v1", "Webhooks (CloudEvents)", "Kafka", "SIEM (OCSF)", "Paging", "Embed (iframe)"] },
];

export const journey: { step: string; title: string; when: string; text: string; items: string[] }[] = [
	{ step: "01", title: "Discovery", when: "1–2 weeks", text: "Your sites, the systems you run and what the pilot should prove.", items: ["Business model and sites in scope", "BMS, EPMS, DCIM, ITSM, CRM, PACS, SSO", "Success criteria agreed up front"] },
	{ step: "02", title: "Site survey and data", when: "2–3 weeks", text: "Collector placement, the one firewall rule and your records.", items: ["Collector placement, active + standby", "One outbound rule: mTLS 443", "Racks, devices and customers imported"] },
	{ step: "03", title: "Connect", when: "2–4 weeks", text: "The sources that prove value first, the rest in later waves.", items: ["Network, UPS / PDUs and BMS first", "Then BMCs, GPUs and the scheduler", "Then ITSM, paging and CRM"] },
	{ step: "04", title: "Go-live", when: "the pilot site", text: "Live alarms in scope and the first incidents with impact, checked against the criteria.", items: ["Reconciliation checks green", "Alarms in scope, incidents with impact", "Next sites and modules planned"] },
];

export const differentiators: { have: string; good: string; adds: string }[] = [
	{ have: "BMS / SCADA", good: "Controls and monitors plant, alarms on points", adds: "Turns a point alarm into impact: which racks, tenants and contracts, what it costs, what to do" },
	{ have: "DCIM", good: "Asset records, space, power capacity planning", adds: "Live operations: incidents, revenue impact, access, security and change control in one view; imports your DCIM" },
	{ have: "ITSM", good: "Ticket workflow, approvals, CMDB", adds: "Datacenter context on every ticket: power path, tenants, root-cause hypotheses; syncs with it" },
	{ have: "CRM", good: "Accounts, opportunities, contacts", adds: "Tenant impact and capacity tied to every account" },
	{ have: "Network / IT monitoring", good: "Device and port health", adds: "Physical context: which cable, which panel, which UPS and PDU feed that device" },
	{ have: "Spreadsheets", good: "Flexible, everyone has one", adds: "One reconciled model, live, with history and an audit trail" },
];

/** Pages that exist in the map but have no content yet (noindex until they do). */
export const placeholders: Record<string, { title: string; icon: string; desc: string; plan: string[] }> = {
	blog: { title: "Blog", icon: "newspaper", desc: "Field notes on running datacenters: power, cooling, GPUs and money.", plan: ["Why free racks are not sellable racks", "The cost of one failed GPU", "Alarm scope: site, edge, dependency, downstream"] },
	"case-studies": { title: "Case studies", icon: "line-chart", desc: "Pilot results from colocation and GPU cloud operators, with the basis stated for every figure.", plan: ["Colocation pilot (one site)", "NeoCloud pilot (one site)"] },
	videos: { title: "Videos", icon: "video", desc: "Short walk-throughs of the product.", plan: ["The 13:20 call: a UPS on battery, end to end", "Walking the 3D datacenter layout", "GPU Fleet: blast radius and placement"] },
	glossary: { title: "Glossary", icon: "book-open", desc: "Datacenter, power, cooling, GPU and inventory terms, as the product uses them.", plan: ["Ride-through, ATS, busway, PDU", "Xid, DCGM, NVLink, InfiniBand rail", "Take-or-pay, demand ratchet, committed kW"] },
	about: { title: "About", icon: "users", desc: "Who is building SynapseDC, and how.", plan: ["Our story", "Team", "Partners"] },
	customers: { title: "Customers", icon: "building", desc: "Operators running SynapseDC.", plan: ["Customer logos", "Quotes"] },
	pricing: { title: "Pricing", icon: "receipt", desc: "Value first, then pricing from the commercial team.", plan: ["Packaging by business model", "Pilot terms"] },
	privacy: { title: "Privacy policy", icon: "lock", desc: "How this website handles personal data.", plan: ["To be supplied by legal"] },
	terms: { title: "Terms & conditions", icon: "file-text", desc: "Terms of use of this website.", plan: ["To be supplied by legal"] },
};
