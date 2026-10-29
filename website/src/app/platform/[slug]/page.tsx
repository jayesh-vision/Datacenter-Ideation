import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand, FeatureCards, ModuleGrid, PageHero, Section } from "@/components/Blocks";
import { Icon } from "@/components/Icon";
import { Anatomy } from "@/components/platform/Anatomy";
import { RoleStrip } from "@/components/platform/RoleStrip";
import { Reveal } from "@/components/Reveal";
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
 * the illustration with numbered pins beside the pinned capabilities, the rest as icon cards (soft)
 * → related modules (white) → CTA (dark). A module whose capabilities carry no `pin` yet falls back
 * to the plain capability grid.
 */
export default async function ModulePage({ params }: Params) {
	const { slug } = await params;
	const m = moduleBySlug(slug);
	if (!m) notFound();
	const path = `/platform/${m.slug}`;
	const models = m.models === "Both" ? "Colocation and NeoCloud" : m.models;
	const pinned = m.capabilities.filter((c) => c.pin);
	const rest = m.capabilities.filter((c) => !c.pin);
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

			<Section kicker="Who opens it" title={`Three questions ${m.name} answers.`} intro={`What people ask in the first minutes, who asks it, and what the screen answers with, for ${models} operators.`}>
				<RoleStrip questions={m.questions} askedBy={m.askedBy} answers={m.answers} />
			</Section>

			{pinned.length > 0 ? (
				<Section tone="soft" kicker="On the screen" title={`Where each capability lives.`} intro={`${m.name} on one screen, numbered. Pick a number on the drawing or in the list to see what that part of the screen does.`}>
					<Anatomy art={m.slug} items={m.capabilities} />
					{rest.length > 0 && (
						<div className="an-more">
							<p className="an-more-k">Also on the screen</p>
							<div className="an-more-grid">
								{rest.map((c, i) => (
									<Reveal key={c.title} className="an-also" delay={i * 60}>
										<span className="card-ico">
											<Icon name={c.icon ?? "layers"} size={20} />
										</span>
										<span>
											<h3>{c.title}</h3>
											<p>{c.text}</p>
										</span>
									</Reveal>
								))}
							</div>
						</div>
					)}
				</Section>
			) : (
				<Section tone="soft" kicker="Capabilities" title={`What ${m.name} does.`}>
					<FeatureCards items={m.capabilities} cols={m.capabilities.length % 3 === 0 ? 3 : 2} />
				</Section>
			)}

			<Section kicker="Related" title="Works together with" intro={`${m.name} shares one estate model with the modules it hands off to.`}>
				<ModuleGrid slugs={m.related} />
			</Section>

			<CtaBand />
		</>
	);
}
