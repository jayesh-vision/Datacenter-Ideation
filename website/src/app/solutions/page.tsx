import Link from "next/link";
import { CtaBand, PageHero, Section } from "@/components/Blocks";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";
import { roles, solutions } from "@/data/solutions";
import { buildMetadata } from "@/seo";

export const metadata = buildMetadata({
	title: "Solutions",
	description: "SynapseDC by business model (colocation, NeoCloud / GPU cloud, and later cloud, enterprise and telco) and by role, from the NOC to finance.",
	path: "/solutions",
});

export default function SolutionsPage() {
	return (
		<>
			<PageHero kicker="Solutions" title="One estate model. Your business model, your role." summary="Vocabulary, what is monitored and how value is counted follow your business. The screens each role needs are the same everywhere." crumbs={[{ name: "Home", href: "/" }, { name: "Solutions", href: "/solutions" }]} />
			<Section kicker="By business model" title="Colocation and GPU cloud first.">
				<div className="grid-3">
					{solutions.map((s) => (
						<Reveal key={s.slug}>
							<Link href={`/solutions/${s.slug}`} className="card">
								<span className="card-ico"><Icon name={s.icon} size={20} /></span>
								<strong>{s.name}</strong>
								<span>{s.short}</span>
								<em>{s.status} <Icon name="arrow" size={14} /></em>
							</Link>
						</Reveal>
					))}
				</div>
			</Section>
			<Section tone="soft" kicker="By role" title="Every person in the room gets their screen.">
				<div className="grid-3">
					{roles.map((r) => (
						<Reveal key={r.slug}>
							<Link href={`/roles/${r.slug}`} className="card">
								<span className="card-ico"><Icon name={r.icon} size={20} /></span>
								<strong>{r.name}</strong>
								<span>{r.short}</span>
								<em>Explore <Icon name="arrow" size={14} /></em>
							</Link>
						</Reveal>
					))}
				</div>
			</Section>
			<CtaBand />
		</>
	);
}
