import Link from "next/link";
import { CtaBand, Kicker, Section } from "@/components/Blocks";
import { Icon } from "@/components/Icon";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { UseCaseBrowser } from "@/components/UseCaseBrowser";
import { roles, solutions } from "@/data/solutions";
import { DOMAINS, USE_CASES } from "@/data/useCases";
import { JsonLd, breadcrumbSchema, buildMetadata } from "@/seo";

export const metadata = buildMetadata({
	title: "Solutions & use cases",
	description: `${USE_CASES.length} datacenter use cases across facility, GPU cloud, network, commercial, security and plan & build, for colocation and NeoCloud operators, each mapped to the SynapseDC modules that answer it.`,
	path: "/solutions",
});

const steps = [
	["01", "See", "Every alarm scoped to the site, the building and the estate in one model."],
	["02", "Understand", "Who is affected, what it costs, and the ranked cause with evidence."],
	["03", "Act", "The next step ordered by money and customers at risk, approval-gated."],
	["04", "Plan", "Sellable capacity, the next hall and the records that keep the loop honest."],
];

export default function SolutionsPage() {
	const first = solutions.filter((s) => s.status === "First release");
	return (
		<>
			<JsonLd schema={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Solutions", path: "/solutions" }])} />

			{/* Hero */}
			<section className="canvas on-dark uc-hero">
				<div className="canvas-bg" aria-hidden="true">
					<img src="/brand/aisle.jpg" alt="" width={1920} height={1200} fetchPriority="high" />
				</div>
				<div className="canvas-glow" aria-hidden="true" />
				<div className="wrap uc-hero-inner">
					<span className="uc-badge">
						{USE_CASES.length} use cases · {DOMAINS.length} domains · colocation and GPU cloud
					</span>
					<h1 className="h-display">
						Situations you recognise. <em>Answers on one screen.</em>
					</h1>
					<p className="lead">
						Each use case starts from a moment an operator knows: a UPS on battery, a GPU that stalls a job, a tenant riding a fault, a hall that cannot be sold. Each one names the SynapseDC modules that answer it. The figures are modelled on the demo estate and say so; they are not customer results.
					</p>
					<div className="uc-stats">
						{[
							[String(USE_CASES.length), "Use cases"],
							[String(DOMAINS.length), "Domains"],
							["2", "Business models in the first release"],
							["13", "Modules they draw on"],
						].map(([v, l]) => (
							<div key={l}>
								<b>{v}</b>
								<span>{l}</span>
							</div>
						))}
					</div>
					<div className="uc-steps">
						{steps.map(([n, t, dsc]) => (
							<div key={n}>
								<small>{n}</small>
								<strong>{t}</strong>
								<span>{dsc}</span>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Flagship */}
			<Section tone="dark" className="uc-flag">
				<div className="uc-flag-grid">
					<div>
						<Kicker>Flagship use case · every datacenter</Kicker>
						<RevealHeading className="h-1">{"One fault, one chain.\nImpact, cost and the next action in a minute."}</RevealHeading>
						<p className="lead" style={{ marginTop: 18 }}>
							<strong style={{ color: "#fff" }}>This is not a separate product.</strong> It is what alarm scope, the estate model, the money model and Opstral AI do together whenever something fails. It does not care whether the alarm came from a UPS, a CDU, a fibre trunk or a GPU: the fault is scoped to the site, the services and customers behind it are read from the physical paths, the money is charged to one issue, and the recommended step waits for approval when it is disruptive.
						</p>
						<div className="uc-flag-chips">
							<span>
								<b>Output:</b> incident with services, customers and money attached
							</span>
							<span>
								<b>Output:</b> ranked cause with evidence
							</span>
							<span>
								<b>Output:</b> approval-gated action, recorded
							</span>
							<span>
								<b>Works across:</b> power · cooling · network · GPU · access
							</span>
						</div>
					</div>
					<div className="uc-flag-steps">
						{[
							["Scope", "Site, edge, dependency or downstream. Downstream never counts on its own."],
							["Impact", "Services, customers and premium customers read from the busway, the trunk or the job."],
							["Money", "Lost so far, credits by tier, the next cliff. One issue per service."],
							["Action", "Ordered by money and customers at risk. Disruptive steps wait for a person."],
						].map(([t, dsc], i) => (
							<Reveal key={t} className="uc-flag-step" delay={i * 80}>
								<small>0{i + 1}</small>
								<strong>{t}</strong>
								<span>{dsc}</span>
							</Reveal>
						))}
					</div>
				</div>
			</Section>

			{/* Use cases */}
			<UseCaseBrowser />

			{/* Business models + roles */}
			<Section tone="soft" kicker="By business model" title="Two business models in the first release." intro="One estate model; the vocabulary, what is monitored inside the rack and how value is counted follow your business.">
				<div className="grid-2">
					{first.map((s) => (
						<Reveal key={s.slug}>
							<Link href={`/solutions/${s.slug}`} className="card">
								<span className="card-ico">
									<Icon name={s.icon} size={20} />
								</span>
								<strong>{s.name}</strong>
								<span>{s.headline}</span>
								<em>
									SynapseDC for {s.name.split(" ")[0]} <Icon name="arrow" size={14} />
								</em>
							</Link>
						</Reveal>
					))}
				</div>
				<div className="later">
					<span>On the roadmap:</span>
					{solutions
						.filter((s) => s.status !== "First release")
						.map((s) => (
							<Link key={s.slug} href={`/solutions/${s.slug}`} className="pill">
								{s.name}
							</Link>
						))}
				</div>
			</Section>
			<Section kicker="By role" title="Every person in the room gets their screen.">
				<div className="grid-3">
					{roles.map((r) => (
						<Reveal key={r.slug}>
							<Link href={`/roles/${r.slug}`} className="card">
								<span className="card-ico">
									<Icon name={r.icon} size={20} />
								</span>
								<strong>{r.name}</strong>
								<span>{r.short}</span>
								<em>
									Explore <Icon name="arrow" size={14} />
								</em>
							</Link>
						</Reveal>
					))}
				</div>
			</Section>
			<CtaBand title="Bring the situation your team keeps dealing with." />
		</>
	);
}
