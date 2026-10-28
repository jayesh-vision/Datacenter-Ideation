/**
 * Company pages (Why Us, Why Now, Our Story, About), in the shape of the Opstral company pages:
 * hero, then a list of typed sections rendered by components/company/CompanyPage.tsx.
 * Claims stay inside the product and the public VisionWaves facts; no invented customers, team or results.
 */

export type CompanySection =
	| { kind: "cards"; kicker: string; title: string; intro?: string; cols?: 2 | 3 | 4; items: { icon?: string; title: string; text: string; tag?: string }[]; tone?: "soft" | "white" | "dark" }
	| { kind: "compare"; kicker: string; title: string; intro?: string; before: string; after: string; rows: { what: string; before: string; after: string }[]; tone?: "soft" | "white" }
	| { kind: "table"; kicker: string; title: string; intro?: string; tone?: "soft" | "white" }
	| { kind: "timeline"; kicker: string; title: string; intro?: string; steps: { label: string; title: string; text: string }[]; tone?: "soft" | "white" }
	| { kind: "claims"; kicker: string; title: string; items: string[]; tone?: "soft" | "white" }
	| { kind: "faq"; kicker: string; title: string; items: { q: string; a: string }[]; tone?: "soft" | "white" }
	| { kind: "next"; kicker: string; title: string; items: { label: string; title: string; text: string; href: string }[]; tone?: "soft" | "white" };

export interface CompanyPageData {
	path: string;
	nav: string;
	metaTitle: string;
	metaDesc: string;
	hero: { kicker: string; title: string; summary: string; art: string };
	sections: CompanySection[];
	cta: { title: string; text: string };
}

const READ = {
	whyUs: { label: "Company", title: "Why Us", text: "One estate model from the first plan to the live GPU, against a stack of separate tools.", href: "/why-synapsedc" },
	whyNow: { label: "Company", title: "Why Now", text: "AI density, GPU economics and power contracts turned every fault into money within the hour.", href: "/why-now" },
	story: { label: "Company", title: "Our Story", text: "Three gaps we kept running into, and what each one became.", href: "/our-story" },
	about: { label: "Company", title: "About SynapseDC", text: "What we build, how we build it and where it sits in the VisionWaves platform.", href: "/about" },
	gpu: { label: "Use case", title: "GPU & AI", text: "What a GPU depends on and what it earns, on one estate model.", href: "/gpu-ai" },
	how: { label: "Platform", title: "How it works & security", text: "The collector, the trust boundary, the estate model and the onboarding steps.", href: "/how-it-works" },
};

export const NOT_CLAIMED = [
	"No measured customer results yet. Every figure on this site is modelled on the SynapseDC demo estate and says so.",
	"SynapseDC never controls plant. Breakers, generators and cooling stay with your BMS and your people; disruptive steps wait for a named approver.",
	"It does not ask you to replace a BMS, DCIM or ITSM that works. It reads from them and adds what they cannot do.",
	"The first release is for colocation and GPU cloud operators. Cloud, enterprise and telco datacenters follow on the same estate model.",
];

export const whyUs: CompanyPageData = {
	path: "/why-synapsedc",
	nav: "Why Us",
	metaTitle: "Why Us",
	metaDesc: "Why SynapseDC: one estate model from the first plan to the live GPU, connected to the BMS, DCIM, ITSM and CRM you already run.",
	hero: {
		kicker: "Company · Why Us",
		title: "One closed loop, from the first plan to the live GPU.",
		summary: "Most datacenters run six tools that never share a record. SynapseDC keeps one estate model that is planned, built and operated in place, and connects to the tools that work, adding the impact, the money and the physical context they cannot see.",
		art: "command-center",
	},
	sections: [
		{
			kind: "cards",
			kicker: "The loop",
			title: "Plan, build, operate and govern the same record.",
			intro: "Each stage writes to the estate model the next stage reads. Nothing is re-keyed between a plan, a rack and a live alarm.",
			cols: 4,
			items: [
				{ icon: "drafting-compass", tag: "Plan", title: "A plan that knows the estate", text: "Sellable capacity net of holds, a hall sized, priced and scheduled, approved by CapEx band." },
				{ icon: "layers", tag: "Build", title: "A build that becomes the record", text: "Racks, power chains and cabling recorded in DCIM under change control, commissioned L1 to L5." },
				{ icon: "activity", tag: "Operate", title: "Operations that read the record", text: "Every alarm scoped to the site and traced to the customers, the money and the next step." },
				{ icon: "shield-check", tag: "Govern", title: "Evidence from the same model", text: "Policies as code and controls evidenced from the live estate, not from a spreadsheet." },
			],
		},
		{ kind: "table", kicker: "Compared with what you have", title: "What each tool does well, and what SynapseDC adds.", tone: "soft" },
		{ kind: "claims", kicker: "Being straight with you", title: "What we are not going to claim", items: NOT_CLAIMED },
		{ kind: "next", kicker: "Go deeper", title: "Where to read next", tone: "soft", items: [READ.whyNow, READ.story, READ.gpu] },
	],
	cta: { title: "Bring the fault your team keeps dealing with.", text: "We walk it end to end on a demo estate shaped like yours, then agree what a one-site pilot should prove." },
};

export const whyNow: CompanyPageData = {
	path: "/why-now",
	nav: "Why Now",
	metaTitle: "Why Now",
	metaDesc: "Why now: AI density, coupled GPU workloads, power contracts and hourly SLAs changed datacenters faster than the tools that run them.",
	hero: {
		kicker: "Company · Why Now",
		title: "The building changed faster than the tools that run it.",
		summary: "AI density, GPU economics and power contracts turned every fault into money within the hour. Planning, building and operating still happen in separate tools that do not share a record, so the answer to who is affected and what it costs still arrives after the call.",
		art: "neocloud",
	},
	sections: [
		{
			kind: "cards",
			kicker: "What actually changed",
			title: "Four things changed, and the toolchain changed with none of them.",
			cols: 4,
			items: [
				{ icon: "zap", title: "Density went up by an order of magnitude", text: "AI racks run at 40–60 kW on liquid loops. A cooling fault that once left hours to respond now leaves minutes." },
				{ icon: "network", title: "The workload became coupled", text: "A training job spans hundreds of GPUs. One failed GPU or one flapping rail stops or slows every one of them." },
				{ icon: "receipt", title: "Power became the constraint and the bill", text: "Capacity is sold by the kW and bought under take-or-pay floors and demand charges. Idle contracted power is paid either way." },
				{ icon: "badge-dollar-sign", title: "Customers buy uptime by the hour", text: "SLAs on cabinets and GPU-hours turn minutes of impact into credits. Someone has to say whose service and what it costs, during the call." },
			],
		},
		{
			kind: "compare",
			kicker: "The shift, side by side",
			title: "The same estate, before and after.",
			tone: "soft",
			before: "Separate tools",
			after: "One estate model",
			rows: [
				{ what: "A UPS goes on battery", before: "A point alarm in the BMS", after: "The busway, the racks, the tenants and the minutes to the next SLA credit tier" },
				{ what: "A job runs slow", before: "A slow job in the scheduler", after: "The CDU loop that throttled its GPUs, and the GPU time it is costing" },
				{ what: "Sales asks for a cage", before: "Free racks in a spreadsheet", after: "Sellable racks net of holds, power and cooling headroom" },
				{ what: "A hall is handed over", before: "A PDF and a project tracker", after: "The commissioned records operations runs on from day one" },
				{ what: "The power bill arrives", before: "Explained at month end", after: "Idle kW and contract findings raised as they happen" },
			],
		},
		{
			kind: "cards",
			kicker: "Our position",
			title: "More dashboards are not the answer. One shared record is.",
			cols: 2,
			items: [
				{ icon: "eye-off", title: "AI on one tool sees half of an event", text: "An assistant inside the BMS cannot know the tenant. One inside the ticketing tool cannot see the busway. A useful answer needs the whole chain, from the utility feed to the invoice." },
				{ icon: "gauge", title: "Waiting moves the start date, not the risk", text: "Every hall planned and built on separate records adds to the reconciliation later. The estate model is cheapest to start before the next hall, not after it." },
			],
		},
		{ kind: "claims", kicker: "Being straight with you", title: "What we are not going to claim", items: NOT_CLAIMED, tone: "soft" },
		{
			kind: "faq",
			kicker: "Questions we get asked",
			title: "Frequently asked questions",
			items: [
				{ q: "Is this only for new AI halls?", a: "No. Existing halls come first: the estate model covers legacy rooms, air-cooled racks and older plant as well as liquid-cooled GPU pods." },
				{ q: "Do we have to change the tools we run?", a: "No. SynapseDC reads from the BMS, power, cooling, network and GPU sources with a read-only role and syncs with your ITSM and CRM." },
				{ q: "How quickly can we see it on our own estate?", a: "A one-site pilot follows four steps: discovery, site survey and data, connect, go-live. How it works lists what each step needs." },
			],
		},
		{ kind: "next", kicker: "Go deeper", title: "Where to read next", tone: "soft", items: [READ.whyUs, READ.story, READ.gpu] },
	],
	cta: { title: "Start with one site, not a rollout.", text: "Pick one site and two situations your team keeps dealing with. We connect it and agree what the pilot should prove." },
};

export const ourStory: CompanyPageData = {
	path: "/our-story",
	nav: "Our Story",
	metaTitle: "Our Story",
	metaDesc: "How SynapseDC came to be: three gaps we kept running into in datacenter operations, and the platform each one became.",
	hero: {
		kicker: "Company · Our Story",
		title: "Three gaps that became a platform.",
		summary: "SynapseDC did not start as a datacenter platform. It started inside datacenter operations, and it grew every time we hit a gap that no existing tool closed.",
		art: "hero",
	},
	sections: [
		{
			kind: "cards",
			kicker: "Where it came from",
			title: "Three things we kept running into, and what each one became.",
			cols: 3,
			items: [
				{ icon: "siren", tag: "Became: alarm scope and Revenue Impact", title: "The building knew. The business didn't.", text: "A UPS went on battery and the BMS knew within a second. Working out which customers were affected took an hour, three people and a spreadsheet." },
				{ icon: "drafting-compass", tag: "Became: Planner and DCIM", title: "The plan never reached the floor.", text: "Capacity was planned in a spreadsheet, built from a tracker and handed over as a PDF. Operations started from a record nobody trusted." },
				{ icon: "cpu", tag: "Became: GPU Fleet", title: "Two teams watched one event.", text: "A coolant flow drop showed up as a slow job. The GPU team saw the symptom, the facility team saw the cause, and neither saw the other." },
			],
		},
		{
			kind: "timeline",
			kicker: "How it grew",
			title: "One estate model, extended a step at a time.",
			tone: "soft",
			steps: [
				{ label: "Operate", title: "Datacenter operations", text: "Alarms scoped to the site, incidents with impact, the power path and the 3D layout." },
				{ label: "Colocation", title: "Tenants and contracts", text: "Cages, contracted power and SLA credits, with tenant gear never polled." },
				{ label: "GPU cloud", title: "Jobs and GPUs", text: "Per-GPU telemetry joined to the job, the customer and the power bill." },
				{ label: "Plan & build", title: "Planner, DCIM, delivery", text: "Plans, records and commissioning written into the same model." },
				{ label: "Govern", title: "Security and evidence", text: "Security operations and compliance evidence from the live estate." },
			],
		},
		{
			kind: "cards",
			kicker: "Two decisions we made early",
			title: "The decisions that shaped the platform.",
			cols: 2,
			items: [
				{ icon: "waypoints", title: "One estate model, never a second copy", text: "Every count on every screen is derived from the model, never typed in, so adjacent figures add up and a click shows the same number on the list behind it." },
				{ icon: "lock", title: "Read-only and outbound only", text: "The on-site collector reads every source with a read-only role and only connects out. Control of the plant never leaves your people." },
			],
		},
		{
			kind: "cards",
			kicker: "Who builds it",
			title: "Built by VisionWaves.",
			intro: "SynapseDC is built by VisionWaves, an engineering-led company whose platform also carries NetSingularity and Opstral. SynapseDC uses Opstral AI for its AI and the shared VisionWaves foundations for data and governance.",
			cols: 3,
			tone: "soft",
			items: [
				{ icon: "building-2", title: "Datacenter-specific, built here", text: "The facility, GPU, money, planner and DCIM models are SynapseDC's own." },
				{ icon: "sparkles", title: "AI from Opstral AI", text: "Answers, ranked causes and next steps over SynapseDC data, with an approval gate on any action." },
				{ icon: "plug", title: "Platform modules through their APIs", text: "Inventory, IP, ITSM and billing stay in the systems that own them." },
			],
		},
		{ kind: "next", kicker: "Go deeper", title: "Where to read next", items: [READ.whyNow, READ.whyUs, READ.about] },
	],
	cta: { title: "Bring us the incident that keeps coming back.", text: "We trace it through the estate model on a demo shaped like yours, from the first alarm to the customer and the cost." },
};

export const about: CompanyPageData = {
	path: "/about",
	nav: "About SynapseDC",
	metaTitle: "About SynapseDC",
	metaDesc: "About SynapseDC: one platform to plan, build and operate datacenters, built by VisionWaves. What we build, how we build it and how we work with you.",
	hero: {
		kicker: "Company · About",
		title: "Who is building SynapseDC, and how.",
		summary: "SynapseDC is one platform to plan, build and operate datacenters, for colocation providers and GPU clouds first. It is built by VisionWaves on the same governed platform as NetSingularity and Opstral.",
		art: "dcim",
	},
	sections: [
		{
			kind: "cards",
			kicker: "What we build",
			title: "The whole life of a datacenter, on one estate model.",
			cols: 3,
			items: [
				{ icon: "drafting-compass", tag: "Plan", title: "Capacity and plans", text: "Sellable capacity, power economics and plans sized, priced, scheduled and approved." },
				{ icon: "layers", tag: "Build", title: "Records and delivery", text: "DCIM under change control, projects, work orders and commissioning to handover." },
				{ icon: "activity", tag: "Operate", title: "Live operations", text: "Command Center, facilities, GPU Fleet, revenue impact and security operations." },
			],
		},
		{
			kind: "cards",
			kicker: "How we build it",
			title: "Four rules every screen follows.",
			cols: 4,
			tone: "soft",
			items: [
				{ icon: "clipboard-check", title: "Every claim is in the product", text: "If a page on this site says it, the product does it. Anything else is marked as roadmap." },
				{ icon: "scale", title: "Every number adds up", text: "Figures side by side reconcile, and a click shows the same count on the list behind it." },
				{ icon: "lock", title: "Read-only by design", text: "Outbound mTLS only, no inbound ports, no control of plant, tenant gear never polled." },
				{ icon: "users", title: "Your vocabulary", text: "Tenants and cabinets for colocation, jobs and GPU-hours for GPU clouds, on the same model." },
			],
		},
		{
			kind: "timeline",
			kicker: "How we work with you",
			title: "From the first conversation to a live site.",
			steps: [
				{ label: "1–2 weeks", title: "Discovery", text: "Your sites, the systems you run and what the pilot should prove." },
				{ label: "2–3 weeks", title: "Site survey and data", text: "Collector placement, one outbound firewall rule and your records." },
				{ label: "2–4 weeks", title: "Connect", text: "The sources that prove value first, the rest in later waves." },
				{ label: "Pilot site", title: "Go-live", text: "Alarms in scope and incidents with impact, checked against the criteria." },
			],
		},
		{ kind: "claims", kicker: "Being straight with you", title: "What we are not going to claim", items: NOT_CLAIMED, tone: "soft" },
		{ kind: "next", kicker: "Go deeper", title: "Where to read next", items: [READ.story, READ.whyNow, READ.how] },
	],
	cta: { title: "Request a demo.", text: "We show SynapseDC on a demo estate shaped like yours, then agree what a one-site pilot should prove." },
};

export const companyPages = [whyUs, whyNow, ourStory, about];
