import Link from "next/link";
import { CtaBand, FeatureCards, Kicker, ModuleGrid, Section } from "@/components/Blocks";
import { Architecture } from "@/components/home/Architecture";
import { Icon } from "@/components/Icon";
import { PlatformMap } from "@/components/PlatformMap";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { modules, stages } from "@/data/modules";
import { JsonLd, breadcrumbSchema, buildMetadata, softwareSchema } from "@/seo";

export const metadata = buildMetadata({
	title: "Platform",
	description: "The SynapseDC platform in one diagram: Plan & build, the estate-model core, Operate, the governed layer and where it deploys, with Opstral AI across every screen.",
	path: "/platform",
});

const principles = [
	{ icon: "activity", title: "Counts are derived, never typed in", text: "Every number comes from the entities behind it, so the same figure reads the same on every screen." },
	{ icon: "siren", title: "An alarm counts only where it belongs", text: "Site, edge, dependency or downstream. Downstream symptoms appear under the incident that caused them." },
	{ icon: "badge-dollar-sign", title: "One issue per impacted service", text: "Each service is charged to its most severe cause, so money reconciles across issues, customers and sites." },
	{ icon: "monitor", title: "Health shown calmly", text: "LEDs, beacons, halos and chips. Red and amber are used only for faults." },
	{ icon: "clipboard-check", title: "Every record change has a change request", text: "Standard pre-approved work, an open CR at the site, or a new one raised for approval." },
	{ icon: "workflow", title: "The platform module owns the record", text: "CRM, ITSM, inventory and projects stay where they are. SynapseDC builds what is datacenter-specific." },
];

export default function PlatformPage() {
	return (
		<>
			<JsonLd schema={[softwareSchema("SynapseDC", "Datacenter plan, build and operate platform", "/platform", modules.map((m) => m.name)), breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Platform", path: "/platform" }])]} />

			{/* Hero: centred headline, then the whole platform in one diagram */}
			<section className="canvas on-dark pd-hero">
				<div className="canvas-bg" aria-hidden="true">
					<img src="/brand/aisle.jpg" alt="" width={1920} height={1200} fetchPriority="high" />
				</div>
				<div className="canvas-glow" aria-hidden="true" />
				<div className="wrap">
					<div className="pd-hero-head">
						<h1 className="h-1">Plan, build and operate. One estate model across all of it.</h1>
						<p className="lead">Every block reads and writes the same record of your datacenters. Click a block to see what it holds.</p>
					</div>
					<PlatformMap />
				</div>
			</section>

			{stages.map((s, i) => (
				<Section key={s.stage} tone={i % 2 ? "soft" : "white"} kicker={s.stage} title={s.line}>
					<ModuleGrid slugs={modules.filter((m) => m.stage === s.stage).map((m) => m.slug)} />
				</Section>
			))}

			<Section tone="dark" kicker="Architecture" title="One collector per site. One model for the estate." intro="Read-only southbound, outbound-only from the site, and the same REST contract the screens use for your own tools.">
				<Architecture />
			</Section>

			<section className="section">
				<div className="wrap">
					<div className="section-head">
						<Kicker>Design principles</Kicker>
						<RevealHeading className="h-2">Rules the whole product keeps.</RevealHeading>
					</div>
					<FeatureCards items={principles} />
					<Reveal className="stage-foot pm-foot">
						<Icon name="sparkles" size={18} />
						<strong>Opstral AI on every screen</strong>
						<span>Answers, likely causes and recommended actions from your own data.</span>
						<Link className="text-link" href="/platform/opstral-ai">
							Learn more <Icon name="arrow" size={14} />
						</Link>
					</Reveal>
				</div>
			</section>

			<CtaBand />
		</>
	);
}
