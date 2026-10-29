import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand, FeatureCards, ModuleTiles, PageHero, Section } from "@/components/Blocks";
import { Icon } from "@/components/Icon";
import { AlsoRow, Anatomy } from "@/components/platform/Anatomy";
import { RoleStrip } from "@/components/platform/RoleStrip";
import { moduleBySlug, modules } from "@/data/modules";
import { JsonLd, breadcrumbSchema, buildMetadata, softwareSchema } from "@/seo";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => modules.map((m) => ({ slug: m.slug }));

export async function generateMetadata({ params }: Params) {
	const { slug } = await params;
	const m = moduleBySlug(slug);
	if (!m) return buildMetadata({ title: "Not found", description: "", path: "/platform", noIndex: true });
	return buildMetadata({ title: m.name, description: m.metaDesc, path: `/platform/${m.slug}` });
}

/**
 * PLATFORM › <module>. One template for every module; content in @/data/modules.
 * Order: dark hero (+ the worked-example figures) → who asks what (white) → anatomy of the screen:
 * the illustration with the active capability's panel spotlighted, beside the capability list; the rest as
 * icon cards (soft) → related modules (white) → CTA (dark). A module whose capabilities carry no `area` falls back
 * to the plain capability grid.
 */
export default async function ModulePage({ params }: Params) {
	const { slug } = await params;
	const m = moduleBySlug(slug);
	if (!m) notFound();
	const path = `/platform/${m.slug}`;
	const models = m.models === "Both" ? "Colocation and NeoCloud" : m.models;
	const shown = m.capabilities.filter((c) => c.area);
	const rest = m.capabilities.filter((c) => !c.area);
	return (
		<>
			<JsonLd schema={[softwareSchema(m.name, m.metaDesc, path, m.capabilities.map((c) => c.title)), breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Platform", path: "/platform" }, { name: m.name, path }])]} />
			<PageHero
				kicker={`${m.stage} · ${m.name}`}
				title={m.headline}
				summary={m.summary}
				art={m.slug}
				crumbs={[{ name: "Home", href: "/" }, { name: "Platform", href: "/platform" }, { name: m.name, href: path }]}
				stats={m.proof}
				actions={
					<>
						<Link href="/contact" className="btn btn-primary">
							See it on a demo estate <Icon name="arrow" size={16} />
						</Link>
						<Link href="/platform" className="btn btn-ghost-light">
							All modules
						</Link>
					</>
				}
			/>

			<Section kicker="Who opens it" title={m.askTitle ?? `Three questions ${m.name} answers.`} intro={m.askIntro ?? `What people ask in the first minutes, who asks it, and what the screen answers with, for ${models} operators.`}>
				<RoleStrip questions={m.questions} askedBy={m.askedBy} answers={m.answers} />
			</Section>

			{shown.length > 0 ? (
				<Section tone="soft" kicker="On the screen" title="What the screen holds." intro={m.screenIntro}>
					<Anatomy art={m.slug} items={m.capabilities} />
					<AlsoRow items={rest} />
				</Section>
			) : (
				<Section tone="soft" kicker="Capabilities" title={`What ${m.name} does.`}>
					<FeatureCards items={m.capabilities} cols={m.capabilities.length % 3 === 0 ? 3 : 2} />
				</Section>
			)}

			<Section kicker="Related" title="Works together with" intro={`${m.name} shares one estate model with the modules it hands off to.`}>
				<ModuleTiles slugs={m.related} />
			</Section>

			<CtaBand />
		</>
	);
}
