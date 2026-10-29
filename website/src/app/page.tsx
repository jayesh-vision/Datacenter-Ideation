import Link from "next/link";
import { CtaBand, FaqList, Kicker, Section, SplitFeature } from "@/components/Blocks";
import { ArtFor } from "@/components/art";
import { Intro } from "@/components/home/Intro";
import { Scenarios } from "@/components/home/Scenarios";
import { Icon } from "@/components/Icon";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { modules } from "@/data/modules";
import { faqs } from "@/data/site";
import { JsonLd, buildMetadata, siteConfig, softwareSchema } from "@/seo";

/** The home tab title is absolute: the layout's "%s | SynapseDC" template does not apply to the root page. */
const HOME_TITLE = "Datacenter platform for plan, build and operate | SynapseDC";
const base = buildMetadata({ title: HOME_TITLE, description: siteConfig.description, path: "/" });
export const metadata = { ...base, title: { absolute: HOME_TITLE } };

const problems = [
	{ t: "The building and the business never meet", d: "The BMS knows the UPS is on battery. The CRM knows who the tenants are. Nothing in between can say which contracts are now at risk." },
	{ t: "Impact is worked out by hand", d: "When a link drops or a CRAH fails, the affected services, customers and money are reconstructed from memory and spreadsheets, after the event." },
	{ t: "GPUs are blind to the facility", d: "A CDU flow drop or a power cap shows up as a slow job. The GPU team sees the symptom; the facility team sees the cause. Nobody sees both." },
	{ t: "Plan and build never reach operations", d: "Capacity is planned in a spreadsheet, built from a project tracker and handed over as a PDF. The live estate starts from a record nobody trusts." },
];



/** Home integrations panel: systems grouped by what SynapseDC does with them. */
const integrationGroups: { dir: "Reads from" | "Syncs with"; name: string; icon: string; items: string[] }[] = [
	{ dir: "Reads from", name: "Facility & power", icon: "zap", items: ["BACnet", "Modbus TCP", "OPC UA", "SNMPv3"] },
	{ dir: "Reads from", name: "Network & servers", icon: "network", items: ["gNMI", "Syslog", "NetFlow", "Redfish", "IPMI"] },
	{ dir: "Reads from", name: "GPU & AI", icon: "cpu", items: ["NVIDIA DCGM", "Intel Gaudi", "InfiniBand UFM"] },
	{ dir: "Syncs with", name: "ITSM", icon: "workflow", items: ["ServiceNow", "Jira Service Management"] },
	{ dir: "Syncs with", name: "CRM & customers", icon: "users", items: ["Salesforce", "Microsoft Dynamics", "HubSpot"] },
	{ dir: "Syncs with", name: "IP & security", icon: "shield", items: ["Infoblox", "BlueCat", "SIEM (OCSF)"] },
	{ dir: "Syncs with", name: "Open interfaces", icon: "plug", items: ["REST API v1", "Webhooks", "Kafka", "Excel import"] },
];


export default function Home() {
	return (
		<>
			<JsonLd schema={softwareSchema(siteConfig.name, siteConfig.description, "/", modules.map((m) => m.name))} />

			{/* 1 · Hero */}
			<section className="canvas hero on-dark">
				<div className="canvas-bg" aria-hidden="true">
					<img src="/brand/aisle.jpg" alt="" width={1920} height={1200} fetchPriority="high" />
				</div>
				<div className="wrap hero-grid">
					<div>
						<Kicker>Plan · Build · Operate</Kicker>
						<h1 className="h-display">
							One platform for the whole life of a <em>datacenter.</em>
						</h1>
						<p className="lead">
							SynapseDC plans the capacity, builds it under change control and operates it live, with power, cooling, racks, GPUs and network connected to the customers they serve. When something fails, you see who is affected, what it costs and what to do first.
						</p>
						<div className="actions">
							<Link href="/contact" className="btn btn-primary">
								Book a demo <Icon name="arrow" size={16} />
							</Link>
							<Link href="/platform" className="btn btn-ghost-light">
								Explore the platform
							</Link>
						</div>
					</div>
					<ArtFor id="hero" />
				</div>
				<div className="wrap trust-strip" style={{ marginTop: 80 }}>
					<div className="trust-grid">
						<div className="trust-cell">
							<strong>One estate model, end to end</strong>
							<span>The hall you plan, the rack you install and the device you operate are the same record, so nothing is re-keyed between plan, build and run.</span>
						</div>
						<div className="trust-cell">
							<strong>On-prem, your cloud, or air-gapped</strong>
							<span>Deploys where your data must live, inside your perimeter and identity stack. The collector only reads, and only sends outbound.</span>
						</div>
						<div className="trust-cell">
							<strong>Built on open standards</strong>
							<span>NVIDIA DCGM, Redfish, SNMPv3, BACnet, MITRE ATT&amp;CK, NIST SP 800-61, IEC 62443, ISO 22237, TIA-942.</span>
						</div>
					</div>
				</div>
			</section>

			{/* 2 · Pinned statement + flow */}
			<Intro />

			{/* 3 · Problem */}
			<Section tone="soft" kicker="Why it exists" title="Planned in spreadsheets, built in silos, operated across many tools." intro="A spreadsheet for capacity, a project tracker for the build, a DCIM for records, a BMS for the plant, an NMS for the network and a ticketing tool for incidents. None of them share a record, and none can say who is affected and what it is costing.">
				<div className="grid-4">
					{problems.map((p, i) => (
						<Reveal key={p.t} className="card num-card" delay={i * 70}>
							<b>0{i + 1}</b>
							<h3>{p.t}</h3>
							<p>{p.d}</p>
						</Reveal>
					))}
				</div>
			</Section>

			{/* 4 · Capabilities */}
			<section className="section">
				<div className="wrap">
					<div className="section-head center">
						<Kicker>What you get</Kicker>
						<RevealHeading className="h-2">From the first plan to the live building, and the money.</RevealHeading>
					</div>
					<div className="rows">
						<SplitFeature art="planner" kicker="Plan · Planner and capacity" title="From a capacity question to an approved plan." text="Sellable space, power, cooling and GPUs net of what is already held, and a planner that sizes a new hall, prices it with payback, schedules it from lead times, checks the rules and routes approval by CapEx band." points={["Templates and benchmarks for halls, plant, refreshes and new sites", "Plan pack, drawings and a review portal for sign-off", "Power economics: the bill, contract findings, cost per sold GPU-hour"]} href="/platform/planner" cta="Explore the Planner" />
						<SplitFeature flip art="dcim" kicker="Build · DCIM and delivery" title="Built as records, under change control." text="Racks, devices, power chains and cabling down to the outlet and the patch cord. Every write carries a change request, and approved plans flow into projects, work orders, purchase orders and commissioning gates." points={["Site → hall → row → rack → device → port", "Standard, open or new change request on every edit", "Commissioning L1 to L5 and earned value per project"]} href="/platform/dcim" cta="Explore DCIM" />
						<SplitFeature art="command-center" kicker="Command Center" title="Every datacenter, ordered by what matters." text="An estate health score you can explain, a live map, and every site worst-first. Then three columns: what is happening, who is affected and the recommended next step." points={["Status follows the worst single issue, not an average", "Every figure opens the list behind it, with the same count", "Recommendations are ranked by money and customers at risk"]} href="/platform/command-center" cta="Explore Command Center" />
						<SplitFeature flip art="datacenters" kicker="3D datacenter layout" title="Building, floor, room, rack, device." text="A 3D layout of every site with health beacons on the racks that need attention. Turn on power paths to see which UPS feeds a rack, or cable paths to follow a service to its trunk." points={["Colour by health, temperature, rack power or connectivity", "Walk the aisle at eye level", "Trace one device's cords and cables end to end"]} href="/platform/datacenters" cta="Explore the datacenter view" />
						<SplitFeature art="gpu-fleet" kicker="GPU Fleet" title="What one bad GPU costs, per hour." text="Per-GPU telemetry joined to jobs, customers and the building. The job with the biggest blast radius, the slowest job, GPU time lost and the work to redo since the last checkpoint." points={["DCGM-style telemetry for NVIDIA and Intel accelerators", "Cooling and power cost per sold GPU-hour", "Where to place the next job"]} href="/gpu-ai" cta="See GPU & AI" />
						<SplitFeature flip art="revenue-impact" kicker="Revenue Impact" title="Which issue is costing the most right now?" text="Each impacted service is charged to exactly one issue. Revenue lost so far, SLA credits by tier, the next credit cliff and what is at stake, reconciled across issues, customers and sites." points={["Down, degraded or exposed to a critical fault", "Credits net of those already locked in", "A cost-of-delay curve for the order of work"]} href="/platform/revenue-impact" cta="Explore Revenue Impact" />
						<SplitFeature art="facilities" kicker="Facilities" title="Know how long the building holds." text="The single-line power path from the utility to the rack, UPS minutes, generator kW and fuel hours, the cooling heat balance, and every single point of failure with a what-if." points={["Hover any node to trace upstream and downstream", "Single points of failure found before a fault finds them", "Maintenance planned and booked as changes"]} href="/platform/facilities" cta="Explore Facilities" />
					</div>
					<p className="all-modules">
						<Link className="btn btn-ghost" href="/platform">
							See the whole platform, block by block <Icon name="arrow" size={16} />
						</Link>
					</p>
				</div>
			</section>

			{/* 7 · Scenario */}
			<Section tone="dark" kicker="One fault, end to end" title="What the first sixty seconds look like.">
				<Scenarios />
			</Section>

			{/* 9 · Integrations */}
			<section className="section">
				<div className="wrap ig">
					<div className="ig-head">
						<Kicker>Integrations</Kicker>
						<RevealHeading className="h-2">{"Works with the systems\nyou already run."}</RevealHeading>
						<p className="section-intro">SynapseDC reads the building, the network, the servers and the GPUs through a read-only collector, and syncs incidents, customers, addresses and security events with the tools your teams use.</p>
						<Link className="btn btn-ghost" href="/integrations">
							All integrations <Icon name="arrow" size={16} />
						</Link>
					</div>
					<div className="ig-panel">
						{integrationGroups.map((g) => (
							<div key={g.name} className="ig-row">
								<div className="ig-name">
									<span className="ig-ico">
										<Icon name={g.icon} size={16} />
									</span>
									<span>
										<small>{g.dir}</small>
										<strong>{g.name}</strong>
									</span>
								</div>
								<div className="ig-chips">
									{g.items.map((i) => (
										<span key={i}>{i}</span>
									))}
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* 11 · FAQ */}
			<Section tone="soft">
				<div className="faq-layout">
					<div className="section-head">
						<Kicker>Common questions</Kicker>
						<RevealHeading className="h-2">Before you begin.</RevealHeading>
						<p className="section-intro">The questions that come up in nearly every first conversation.</p>
						<p style={{ marginTop: 22 }}>
							<Link className="text-link" href="/faq">
								Browse all questions <Icon name="arrow" size={16} />
							</Link>
						</p>
					</div>
					<FaqList items={[faqs[1], faqs[5], faqs[6], faqs[7], faqs[9]]} name="home-faq" />
				</div>
			</Section>

			<CtaBand />
		</>
	);
}
