import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand, FeatureCards, ModuleGrid, PageHero, Section } from "@/components/Blocks";
import { Icon } from "@/components/Icon";
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

/** PLATFORM › <module>. One template for every module; content in @/data/modules. */
export default async function ModulePage({ params }: Params) {
	const { slug } = await params;
	const m = moduleBySlug(slug);
	if (!m) notFound();
	const path = `/platform/${m.slug}`;
	const models = m.models === "Both" ? "Colocation and NeoCloud" : m.models;
	return (
		<>
			<JsonLd schema={[softwareSchema(m.name, m.metaDesc, path, m.capabilities.map((c) => c.title)), breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Platform", path: "/platform" }, { name: m.name, path }])]} />
			<PageHero
				kicker={`${m.stage} · ${m.name}`}
				title={m.headline}
				summary={m.summary}
				art={m.slug}
				crumbs={[{ name: "Home", href: "/" }, { name: "Platform", href: "/platform" }, { name: m.name, href: path }]}
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

			<Section kicker={`Why teams open ${m.name}`} title={`Three questions ${m.name} answers.`} intro={`What people ask in the first minutes, and who asks it. ${m.name} puts the answer on one screen, for ${models} operators.`}>
				<div className="questions">
					{m.questions.map((q, i) => (
						<Reveal key={q} className="question" delay={i * 60}>
							<small>{m.askedBy[i]} asks</small>
							{q}
						</Reveal>
					))}
				</div>
			</Section>

			<Section tone="soft" kicker="Capabilities" title={`What ${m.name} does.`}>
				<FeatureCards items={m.capabilities} cols={m.capabilities.length % 3 === 0 ? 3 : 2} />
				{m.proof && (
					<>
						<div className="proof">
							{m.proof.map((p) => (
								<div key={p.label} className="stat">
									<b>{p.value}</b>
									<span>{p.label}</span>
								</div>
							))}
						</div>
					</>
				)}
			</Section>

			<Section kicker="Related" title="Works together with">
				<ModuleGrid slugs={m.related} />
			</Section>

			<CtaBand />
		</>
	);
}
