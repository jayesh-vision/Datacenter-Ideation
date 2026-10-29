import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand, ModuleTiles, PageHero, Section } from "@/components/Blocks";
import { Anatomy } from "@/components/platform/Anatomy";
import { Icon } from "@/components/Icon";
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

/** ROLES › <role>. Hero → the role's questions spotlighted on its main screen → module tiles → CTA. Content in @/data/solutions (BRD §4). */
export default async function RolePage({ params }: Params) {
	const { slug } = await params;
	const r = roles.find((x) => x.slug === slug);
	if (!r) notFound();
	const crumbs = [{ name: "Home", href: "/" }, { name: "Solutions", href: "/solutions" }, { name: r.name, href: `/roles/${r.slug}` }];
	const art = r.art ?? r.modules[0];
	const heroArt = r.modules.find((m) => m !== art) ?? art;
	const items = r.questions.map((q, i) => ({ title: q, text: r.answers[i]?.text ?? "", area: r.answers[i]?.area }));
	return (
		<>
			<JsonLd schema={breadcrumbSchema(crumbs.map((c) => ({ name: c.name, path: c.href })))} />
			<PageHero
				kicker={`For ${r.name}`}
				title={r.headline}
				summary={r.summary}
				crumbs={crumbs}
				art={heroArt}
				actions={
					<Link href="/contact" className="btn btn-primary">
						Book a demo <Icon name="arrow" size={16} />
					</Link>
				}
			/>
			<Section tone="soft" kicker="Your questions" title={r.askTitle} intro={r.screenIntro}>
				<Anatomy art={art} items={items} all />
			</Section>
			<Section kicker="Your screens" title="Where you will spend your day.">
				<ModuleTiles slugs={r.modules} />
			</Section>
			<CtaBand />
		</>
	);
}
