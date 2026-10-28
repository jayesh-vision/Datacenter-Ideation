import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand, ModuleGrid, PageHero, Section } from "@/components/Blocks";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";
import { roles } from "@/data/solutions";
import { JsonLd, breadcrumbSchema, buildMetadata } from "@/seo";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => roles.map((r) => ({ slug: r.slug }));

export async function generateMetadata({ params }: Params) {
	const { slug } = await params;
	const r = roles.find((x) => x.slug === slug);
	if (!r) return buildMetadata({ title: "Not found", description: "", path: "/solutions", noIndex: true });
	return buildMetadata({ title: `For ${r.name}`, description: `${r.headline} ${r.summary}`.slice(0, 158), path: `/roles/${r.slug}` });
}

/** ROLES › <role>. Content in @/data/solutions (BRD §4). */
export default async function RolePage({ params }: Params) {
	const { slug } = await params;
	const r = roles.find((x) => x.slug === slug);
	if (!r) notFound();
	const crumbs = [{ name: "Home", href: "/" }, { name: "Solutions", href: "/solutions" }, { name: r.name, href: `/roles/${r.slug}` }];
	return (
		<>
			<JsonLd schema={breadcrumbSchema(crumbs.map((c) => ({ name: c.name, path: c.href })))} />
			<PageHero
				kicker={`For ${r.name}`}
				title={r.headline}
				summary={r.summary}
				crumbs={crumbs}
				art={r.modules[0]}
				actions={<Link href="/contact" className="btn btn-primary">Book a demo <Icon name="arrow" size={16} /></Link>}
			/>
			<Section kicker="Your questions" title="What you ask, answered on one screen.">
				<div className="questions">
					{r.questions.map((q, i) => (
						<Reveal key={q} className="question" delay={i * 60}>{q}</Reveal>
					))}
				</div>
			</Section>
			<Section tone="soft" kicker="Your screens" title="Where you will spend your day.">
				<ModuleGrid slugs={r.modules} />
			</Section>
			<CtaBand />
		</>
	);
}
