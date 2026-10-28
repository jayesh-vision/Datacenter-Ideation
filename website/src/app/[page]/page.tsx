import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero, Section } from "@/components/Blocks";
import { Icon } from "@/components/Icon";
import { placeholders } from "@/data/site";
import { buildMetadata } from "@/seo";

type Params = { params: Promise<{ page: string }> };

/** Pages in the site map that have no content yet (blog, case studies, videos, glossary, about, pricing, legal). */
export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(placeholders).map((page) => ({ page }));

export async function generateMetadata({ params }: Params) {
	const { page } = await params;
	const p = placeholders[page];
	// Kept out of search until they have content.
	return buildMetadata({ title: p?.title ?? "Not found", description: p?.desc ?? "", path: `/${page}`, noIndex: true });
}

export default async function ComingSoonPage({ params }: Params) {
	const { page } = await params;
	const p = placeholders[page];
	if (!p) notFound();
	return (
		<>
			<PageHero kicker="Coming soon" title={p.title} summary={p.desc} crumbs={[{ name: "Home", href: "/" }, { name: p.title, href: `/${page}` }]} />
			<Section kicker="In preparation" title="What this page will hold.">
				<div className="soon">
					{p.plan.map((x) => (
						<div key={x} className="card">
							<span className="card-ico">
								<Icon name={p.icon} size={20} />
							</span>
							<h3>{x}</h3>
						</div>
					))}
				</div>
				<p style={{ marginTop: 32 }}>
					<Link className="text-link" href="/platform">
						Meanwhile, explore the platform <Icon name="arrow" size={16} />
					</Link>
				</p>
			</Section>
		</>
	);
}
