import Link from "next/link";
import { ArtFor } from "@/components/art";
import { CtaBand, Kicker, Section } from "@/components/Blocks";
import { Architecture } from "@/components/home/Architecture";
import { Icon } from "@/components/Icon";
import { PlatformMap } from "@/components/PlatformMap";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { modules, stages, type Stage } from "@/data/modules";
import { JsonLd, breadcrumbSchema, buildMetadata, softwareSchema } from "@/seo";

export const metadata = buildMetadata({
	title: "Platform",
	description: "The SynapseDC platform in one diagram: Plan & build, the estate-model core, Operate, the governed layer and where it deploys, with Opstral AI across every screen.",
	path: "/platform",
});

const principles = [
	{ title: "Counts are derived, never typed in", text: "Every number comes from the entities behind it, so the same figure reads the same on every screen." },
	{ title: "An alarm counts only where it belongs", text: "Site, edge, dependency or downstream. Downstream symptoms appear under the incident that caused them." },
	{ title: "One issue per impacted service", text: "Each service is charged to its most severe cause, so money reconciles across issues, customers and sites." },
	{ title: "Health shown calmly", text: "LEDs, beacons, halos and chips. Red and amber are used only for faults." },
	{ title: "Every record change has a change request", text: "Standard pre-approved work, an open CR at the site, or a new one raised for approval." },
	{ title: "The platform module owns the record", text: "CRM, ITSM, inventory and projects stay where they are. SynapseDC builds what is datacenter-specific." },
];

const LINE = Object.fromEntries(stages.map((s) => [s.stage, s.line]));

/** Rows of the module overview: stages paired so every row is full (2 + 2 · 7 · 1 + 1). */
const BLOCKS: { stage: Stage; line: string }[][] = [
	[
		{ stage: "Plan", line: LINE.Plan },
		{ stage: "Build", line: LINE.Build },
	],
	[{ stage: "Operate", line: LINE.Operate }],
	[
		{ stage: "Govern", line: LINE.Govern },
		{ stage: "Across the product", line: "Answers, likely causes and recommended actions on every screen." },
	],
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
						<p className="lead">Every block reads and writes the same record of your datacenters.</p>
					</div>
					<PlatformMap />
				</div>
			</section>

			<section className="section">
				<div className="wrap">
					<div className="section-head">
						<Kicker>The modules</Kicker>
						<RevealHeading className="h-2">Every screen, from the first plan to the live estate.</RevealHeading>
						<p className="section-intro">Plan, build, operate and govern: each stage has its own screens, and every one of them reads the same estate model.</p>
					</div>
					<div className="stg">
						{BLOCKS.map((row) => (
							<div key={row.map((b) => b.stage).join()} className={`stg-row cols-${row.length}`}>
								{row.map((b) => {
									const list = modules.filter((m) => m.stage === b.stage);
									return (
										<div key={b.stage} className="stg-block">
											<div className="stg-head">
												<span className="stg-name">{b.stage}</span>
												<h3>{b.line}</h3>
												<span className="stg-count">
													{list.length} {list.length === 1 ? "module" : "modules"}
												</span>
											</div>
											<div className={`stg-grid n-${list.length}`}>
												{list.map((m, i) => (
													<Reveal key={m.slug} delay={(i % 4) * 60} className={list.length === 1 ? "mt-cell wide" : i === 0 && list.length > 4 ? "mt-cell lead" : "mt-cell"}>
														<Link href={`/platform/${m.slug}`} className="mt">
															<ArtFor id={m.slug} className="mt-art" />
															<span className="mt-body">
																<strong>
																	<Icon name={m.icon} size={17} />
																	{m.name}
																</strong>
																<span>{m.short}</span>
															</span>
														</Link>
													</Reveal>
												))}
											</div>
										</div>
									);
								})}
							</div>
						))}
					</div>
				</div>
			</section>

			<Section tone="dark" kicker="Architecture" title="One collector per site. One model for the estate." intro="Read-only southbound, outbound-only from the site, and the same REST contract the screens use for your own tools.">
				<Architecture />
			</Section>

			<section className="section section-soft">
				<div className="wrap rules">
					<div className="rules-head">
						<Kicker>Design principles</Kicker>
						<RevealHeading className="h-2">Rules the whole product keeps.</RevealHeading>
						<p className="section-intro">Six decisions that hold on every screen, so a figure, an alarm or a record means the same thing wherever it appears.</p>
					</div>
					<ol className="rules-list">
						{principles.map((r, i) => (
							<Reveal as="li" key={r.title} delay={(i % 2) * 60}>
								<span className="rules-num">{String(i + 1).padStart(2, "0")}</span>
								<span>
									<strong>{r.title}</strong>
									<span>{r.text}</span>
								</span>
							</Reveal>
						))}
					</ol>
				</div>
			</section>

			<CtaBand />
		</>
	);
}
