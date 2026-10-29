import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand, ModuleTiles, PageHero, Section } from "@/components/Blocks";
import { Icon } from "@/components/Icon";
import { AlsoRow, Anatomy } from "@/components/platform/Anatomy";
import { moduleBySlug } from "@/data/modules";
import { solutions } from "@/data/solutions";
import { JsonLd, breadcrumbSchema, buildMetadata } from "@/seo";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => solutions.map((s) => ({ slug: s.slug }));

export async function generateMetadata({ params }: Params) {
	const { slug } = await params;
	const s = solutions.find((x) => x.slug === slug);
	if (!s) return buildMetadata({ title: "Not found", description: "", path: "/solutions", noIndex: true });
	return buildMetadata({ title: `For ${s.name}`, description: s.metaDesc, path: `/solutions/${s.slug}` });
}

/**
 * SOLUTIONS › <business model>. First-release models get the full page: hero → the model's facts as one
 * definition panel → its pains spotlighted on the model's illustration (same panel as the module pages)
 * → module tiles → CTA. Later ones get the hero and the modules to start with.
 */
export default async function SolutionPage({ params }: Params) {
	const { slug } = await params;
	const s = solutions.find((x) => x.slug === slug);
	if (!s) notFound();
	const path = `/solutions/${s.slug}`;
	const crumbs = [{ name: "Home", href: "/" }, { name: "Solutions", href: "/solutions" }, { name: s.name, href: path }];
	const full = s.status === "First release";
	const pains = (s.pains ?? []).map((p) => ({ title: p.pain, text: p.answer, area: p.area, href: `/platform/${p.module}`, linkLabel: moduleBySlug(p.module)?.name, icon: moduleBySlug(p.module)?.icon }));
	return (
		<>
			<JsonLd schema={breadcrumbSchema(crumbs.map((c) => ({ name: c.name, path: c.href })))} />
			<PageHero
				kicker={`${s.name} · ${s.status}`}
				title={s.headline}
				summary={s.summary}
				art={full ? s.slug : undefined}
				crumbs={crumbs}
				actions={
					<>
						<Link href="/contact" className="btn btn-primary">
							Book a {s.name.split(" ")[0]} demo <Icon name="arrow" size={16} />
						</Link>
						<Link href="/solutions" className="btn btn-ghost-light">
							All solutions
						</Link>
					</>
				}
			/>

			{s.facts && (
				<Section kicker="Your business in SynapseDC" title={s.factsTitle ?? "Your words, your units, your limits."}>
					<dl className="defs">
						{s.facts.map((f) => (
							<div key={f.label}>
								<dt>{f.label}</dt>
								<dd>{f.value}</dd>
							</div>
						))}
						{s.privacy && (
							<div className="defs-note">
								<dt>
									<Icon name="shield" size={16} /> Never read
								</dt>
								<dd>{s.privacy}</dd>
							</div>
						)}
					</dl>
				</Section>
			)}

			{pains.length > 0 && (
				<Section tone="soft" kicker="On the screen" title={s.painsTitle ?? "The stories a demo is built around."} intro={s.screenIntro ?? s.killer}>
					<Anatomy art={s.slug} items={pains} />
					<AlsoRow items={pains.filter((p) => !p.area)} label="Also answered" />
				</Section>
			)}

			<Section kicker="Modules" title={full ? "The screens you will use most." : "Where to start today."}>
				<ModuleTiles slugs={s.modules} />
			</Section>

			<CtaBand />
		</>
	);
}
