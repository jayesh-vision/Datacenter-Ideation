import Link from "next/link";
import { CtaBand, PageHero, Section } from "@/components/Blocks";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";
import { navigation } from "@/data/site";
import { buildMetadata } from "@/seo";

export const metadata = buildMetadata({
	title: "Resources",
	description: "SynapseDC resources: FAQ, blog, case studies, videos, and how SynapseDC differs from DCIM, BMS and ITSM.",
	path: "/resources",
});

export default function ResourcesPage() {
	const item = navigation.find((n) => n.label === "Resources")!;
	return (
		<>
			<PageHero kicker="Resources" title="Learn how SynapseDC works, and why." crumbs={[{ name: "Home", href: "/" }, { name: "Resources", href: "/resources" }]} />
			{item.columns!.map((col, i) => (
				<Section key={col.heading} tone={i % 2 ? "soft" : "white"} kicker={col.heading}>
					<div className="grid-3">
						{col.links.map((l, k) => (
							<Reveal key={l.href} delay={(k % 3) * 60}>
								<Link href={l.href} className="card">
									<span className="card-ico">
										<Icon name={l.icon ?? "book-open"} size={20} />
									</span>
									<strong>{l.label}</strong>
									<span>{l.desc}</span>
									<em>
										Open <Icon name="arrow" size={14} />
									</em>
								</Link>
							</Reveal>
						))}
					</div>
				</Section>
			))}
			<CtaBand />
		</>
	);
}
