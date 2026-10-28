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
		"SynapseDC for GPU clouds and AI halls: the power, cooling and liquid racks around your GPUs, and every GPU joined to its job, its customer and its cost, on one estate model.",
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

const hardware: { group: string; items: string[] }[] = [
	{ group: "NVIDIA", items: ["B200", "H200", "H100", "A100", "L40S", "T4"] },
	{ group: "Intel", items: ["Gaudi 3", "Data Center GPU Max 1550"] },
	{ group: "Telemetry", items: ["NVIDIA DCGM", "Intel Gaudi hl-smi", "Intel XPU Manager", "Redfish (node BMC)"] },
	{ group: "Fabric & scheduler", items: ["InfiniBand NDR · UFM", "Ethernet front-end", "Slurm", "Kubernetes"] },
];

const faqs = [
	{ q: "Does SynapseDC cover liquid cooling as well as the GPUs?", a: "Yes. CDU loops, liquid racks, the power path to the rack and the power bill are in the same estate model as the GPUs, the jobs and the customers, so a cooling fault is read as the GPU time it costs." },
	{ q: "Do you read our customers' jobs or models?", a: "No. SynapseDC reads GPU telemetry and the scheduler's job metadata (who, which GPUs, start, state). It never reads a job's data, model or code." },
	{ q: "Which accelerators are covered?", a: "NVIDIA B200, H200, H100, A100, L40S and T4, and Intel Gaudi 3 and Data Center GPU Max 1550, with vendor-aware telemetry labels. Other accelerators are to be discussed." },
	{ q: "Do we need a scheduler integration?", a: "It helps. GPU telemetry alone shows the GPUs; the scheduler's job metadata (Slurm or Kubernetes) is what joins a GPU to its job and its customer." },
];

export default function GpuAiPage() {
	const gpuDomain = DOMAINS.find((d) => d.id === "gpu")!;
	const comm = DOMAINS.find((d) => d.id === "commercial")!;
	const cases = [...USE_CASES.filter((u) => u.domain === "gpu").map((u) => ({ u, d: gpuDomain })), ...USE_CASES.filter((u) => u.id === "UC-C4").map((u) => ({ u, d: comm }))];

	return (
		<>
			<JsonLd schema={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "GPU & AI", path: "/gpu-ai" }])} />
			<PageHero
				kicker="GPU & AI · GPU clouds and AI halls"
				title="The GPU is what you sell. SynapseDC runs everything it depends on."
				summary="SynapseDC runs the power, cooling and liquid racks around your GPUs and joins every GPU to its job, its customer and what it costs, on one estate model. A CDU alarm reads as GPU time lost; a failed GPU reads as revenue at risk."
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

			<Section tone="dark" kicker="One chain" title="From the utility feed to the invoice." intro="What a GPU depends on and what it earns, on one estate model. One event reads the same way on both sides of the building.">
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

			<Section kicker="Plan & build" title="Plan and build the AI hall before the GPUs arrive." intro="Plan and build for AI density on the same estate model the GPUs will run on.">
				<FeatureCards items={plan} cols={3} />
			</Section>

			<section className="section cov-section">
				<div className="wrap cov">
					<div className="cov-head">
						<Kicker>Coverage</Kicker>
						<h2 className="h-2">Accelerators, telemetry and fabric.</h2>
						<p className="section-intro">Vendor-aware labels per accelerator. One model per pod, read through the telemetry each vendor ships.</p>
					</div>
					<div className="cov-table">
						{hardware.map((h) => (
							<div key={h.group} className="cov-row">
								<small>{h.group}</small>
								<div className="cov-chips">
									{h.items.map((i) => (
										<span key={i}>{i}</span>
									))}
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			<Section tone="soft">
				<div className="faq-layout">
					<div className="section-head">
						<Kicker>GPU & AI</Kicker>
						<RevealHeading className="h-2">Questions GPU clouds ask.</RevealHeading>
					</div>
					<FaqList items={faqs} name="gpu-faq" />
				</div>
			</Section>

			<CtaBand title="Bring one GPU cluster." text="We map it onto a demo estate shaped like yours: its power path, its cooling loop, its jobs and its customers. Then we agree what a one-pod pilot should prove." />
		</>
	);
}
