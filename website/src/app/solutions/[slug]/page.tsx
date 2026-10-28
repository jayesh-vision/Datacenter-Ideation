import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand, ModuleGrid, PageHero, Section } from "@/components/Blocks";
import { Icon } from "@/components/Icon";
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

/** SOLUTIONS › <business model>. First-release models get the full page; later ones a short roadmap page. */
export default async function SolutionPage({ params }: Params) {
	const { slug } = await params;
	const s = solutions.find((x) => x.slug === slug);
	if (!s) notFound();
	const path = `/solutions/${s.slug}`;
	const crumbs = [{ name: "Home", href: "/" }, { name: "Solutions", href: "/solutions" }, { name: s.name, href: path }];
	const full = s.status === "First release";
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
				<Section kicker="Your business in SynapseDC" title="Your words, your units, your limits.">
					<div className="facts">
						{s.facts.map((f) => (
							<div key={f.label} className="fact">
								<small>{f.label}</small>
								<span>{f.value}</span>
							</div>
						))}
					</div>
					{s.privacy && (
						<div className="privacy">
							<Icon name="shield" size={20} />
							<p>{s.privacy}</p>
						</div>
					)}
				</Section>
			)}

			{s.pains && (
				<Section tone="soft" kicker="Pains we answer" title="The stories a demo is built around." intro={s.killer}>
					<div className="table-wrap">
						<table className="t">
							<thead>
								<tr>
									<th>Pain</th>
									<th>How SynapseDC answers it</th>
									<th>Where</th>
								</tr>
							</thead>
							<tbody>
								{s.pains.map((p) => (
									<tr key={p.pain}>
										<td className="k">{p.pain}</td>
										<td className="adds">{p.answer}</td>
										<td>
											<Link href={`/platform/${p.module}`}>{moduleBySlug(p.module)?.name}</Link>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Section>
			)}

			<Section kicker="Modules" title={full ? "The screens you will use most." : "Where to start today."}>
				<ModuleGrid slugs={s.modules} />
			</Section>

			<CtaBand />
		</>
	);
}
