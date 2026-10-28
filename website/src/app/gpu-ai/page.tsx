import Link from "next/link";
import { CtaBand, FaqList, FeatureCards, Kicker, PageHero, Section } from "@/components/Blocks";
import { GpuChain } from "@/components/gpu/GpuChain";
import { Icon } from "@/components/Icon";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { UseCaseCard } from "@/components/UseCaseBrowser";
import { DOMAINS, USE_CASES } from "@/data/useCases";
import { JsonLd, breadcrumbSchema, buildMetadata } from "@/seo";

export const metadata = buildMetadata({
	title: "GPU & AI infrastructure",
	description:
		"SynapseDC for GPU clouds and AI halls. The core platform runs the power, cooling and liquid racks around your GPUs; the GPU Fleet add-on joins every GPU to its job, its customer and its cost.",
	path: "/gpu-ai",
});

const different = [
	{ icon: "zap", title: "Density", text: "40–60 kW liquid racks on CDU loops. A cooling fault stops being a ticket and becomes lost GPU time within minutes." },
	{ icon: "network", title: "Coupling", text: "A training job spans hundreds of GPUs. One failed GPU or one flapping rail stops or slows all of them." },
	{ icon: "receipt", title: "Cost", text: "Power is the largest running cost, and it is billed whether the GPUs are earning or idle." },
	{ icon: "eye-off", title: "Blind spots", text: "The GPU team sees a slow job. The facility team sees a CDU alarm. Nobody sees that it is the same event." },
];

const plan = [
	{ icon: "drafting-compass", title: "Plan the AI hall", text: "Size a new hall by IT kW, rack density and cooling type, then price it, schedule it from lead times and route it for approval." },
	{ icon: "gauge", title: "Know what you can sell", text: "Capacity in GPUs: in a job, allocated to an idle job, free, or out of service, next to the rack power and cooling headroom behind them." },
	{ icon: "layers", title: "Build it as records", text: "Liquid racks, CDUs, PDUs and the cabling to every node recorded in DCIM, each edit under a change request, commissioned L1 to L5." },
];

const rows: [string, string, string][] = [
	["Power path, UPS ride-through and busways to GPU racks", "Included", ""],
	["CDU loops, liquid racks, heat balance and cooling redundancy", "Included", ""],
	["Capacity, reservations and the site power bill", "Included", ""],
	["Planner, DCIM and commissioning for AI halls", "Included", ""],
	["Revenue Impact, incidents and Security Ops on the estate", "Included", ""],
	["GPU Fleet: clusters, jobs, nodes, GPU models and telemetry", "", "Add-on"],
	["Blast radius, slowest job, GPU time lost and work to redo", "", "Add-on"],
	["InfiniBand, Ethernet and OOB rails per GPU node", "", "Add-on"],
	["Power and energy per job and per tenant, cost per sold GPU-hour", "", "Add-on"],
	["Where to place the next job, ranked by pod", "", "Add-on"],
	["GPU fleet row on the Command Center, GPU causes in Revenue Impact, GPU questions in Opstral AI", "", "Add-on"],
];

const hardware: { group: string; items: string[] }[] = [
	{ group: "NVIDIA", items: ["B200", "H200", "H100", "A100", "L40S", "T4"] },
	{ group: "Intel", items: ["Gaudi 3", "Data Center GPU Max 1550"] },
	{ group: "Telemetry", items: ["NVIDIA DCGM", "Intel Gaudi hl-smi", "Intel XPU Manager", "Redfish (node BMC)"] },
	{ group: "Fabric & scheduler", items: ["InfiniBand NDR · UFM", "Ethernet front-end", "Slurm", "Kubernetes"] },
];

const faqs = [
	{ q: "Do I need the add-on to monitor liquid cooling and GPU racks?", a: "No. CDU loops, liquid racks, the power path to the rack and the power bill are part of the core platform. The add-on adds the GPU, the job and the customer on top of them." },
	{ q: "Do you read our customers' jobs or models?", a: "No. SynapseDC reads GPU telemetry and the scheduler's job metadata (who, which GPUs, start, state). It never reads a job's data, model or code." },
	{ q: "Which accelerators are covered?", a: "NVIDIA B200, H200, H100, A100, L40S and T4, and Intel Gaudi 3 and Data Center GPU Max 1550, with vendor-aware telemetry labels. Other accelerators are to be discussed." },
	{ q: "How is the add-on priced?", a: "The add-on is licensed separately from the core platform. Talk to us for a quote shaped to your fleet." },
];

export default function GpuAiPage() {
	const gpuDomain = DOMAINS.find((d) => d.id === "gpu")!;
	const comm = DOMAINS.find((d) => d.id === "commercial")!;
	const cases = [...USE_CASES.filter((u) => u.domain === "gpu").map((u) => ({ u, d: gpuDomain })), ...USE_CASES.filter((u) => u.id === "UC-C4").map((u) => ({ u, d: comm }))];

	return (
		<>
			<JsonLd schema={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "GPU & AI", path: "/gpu-ai" }])} />
			<PageHero
				kicker="GPU & AI · GPU Fleet add-on"
				title="The GPU is what you sell. SynapseDC runs everything it depends on."
				summary="For GPU clouds and AI halls. The core platform runs the power, cooling and liquid racks around your GPUs. The GPU Fleet add-on joins every GPU to its job, its customer and what it costs, so a CDU alarm reads as GPU time lost and a failed GPU reads as revenue at risk."
				art="neocloud"
				crumbs={[{ name: "Home", href: "/" }, { name: "GPU & AI", href: "/gpu-ai" }]}
				actions={
					<>
						<Link href="/contact" className="btn btn-primary">
							Book a GPU cluster assessment <Icon name="arrow" size={16} />
						</Link>
						<Link href="/platform/gpu-fleet" className="btn btn-ghost-light">
							See GPU Fleet
						</Link>
					</>
				}
			/>

			<Section kicker="Why GPU estates are different" title="Every fault is now a GPU fault.">
				<FeatureCards items={different} cols={4} />
			</Section>

			<Section tone="dark" kicker="One chain" title="From the utility feed to the invoice." intro="The core platform covers what a GPU depends on. The add-on covers what it earns. Together they read one event the same way on both sides of the building.">
				<GpuChain />
			</Section>

			<section className="section section-soft">
				<div className="wrap">
					<div className="section-head">
						<Kicker>Use cases</Kicker>
						<RevealHeading className="h-2">Five situations every GPU cloud knows.</RevealHeading>
						<p className="section-intro">Each one names the modules that answer it. Figures are modelled on the SynapseDC demo estate, not customer results.</p>
					</div>
					<div className="uc-grid">
						{cases.map(({ u, d }) => (
							<UseCaseCard key={u.id} u={u} color={d.color} name={d.name} />
						))}
					</div>
				</div>
			</section>

			<Section kicker="Plan & build · core platform" title="Plan and build the AI hall before the GPUs arrive." intro="Planning and building for AI density is part of the core platform: the same estate model the GPUs will run on.">
				<FeatureCards items={plan} cols={3} />
			</Section>

			<Section tone="soft" kicker="Packaging" title="What the core includes, what the add-on adds.">
				<div className="pk">
					<div className="pk-head">
						<span>Capability</span>
						<span>Core platform</span>
						<span>GPU Fleet add-on</span>
					</div>
					{rows.map(([t, c, a]) => (
						<Reveal key={t} className="pk-row">
							<span>{t}</span>
							<span>{c && <><Icon name="check" size={16} /> {c}</>}</span>
							<span>{a && <b className="addon-badge">{a}</b>}</span>
						</Reveal>
					))}
				</div>
				<p className="note">The GPU Fleet add-on is licensed separately from the core platform.</p>
			</Section>

			<Section kicker="Coverage" title="Accelerators, telemetry and fabric.">
				<div className="hw">
					{hardware.map((h) => (
						<div key={h.group} className="hw-col">
							<small>{h.group}</small>
							<ul>
								{h.items.map((i) => (
									<li key={i}>{i}</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</Section>

			<Section tone="soft">
				<div className="faq-layout">
					<div className="section-head">
						<Kicker>GPU Fleet add-on</Kicker>
						<RevealHeading className="h-2">Questions about the add-on.</RevealHeading>
					</div>
					<FaqList items={faqs} name="gpu-faq" />
				</div>
			</Section>

			<CtaBand title="Bring one GPU cluster." text="We map it onto a demo estate shaped like yours: its power path, its cooling loop, its jobs and its customers. Then we agree what a one-pod pilot of the add-on should prove." />
		</>
	);
}
