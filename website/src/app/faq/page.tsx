import { CtaBand, FaqList, PageHero, Section } from "@/components/Blocks";
import { faqs } from "@/data/site";
import { JsonLd, buildMetadata, faqSchema } from "@/seo";

export const metadata = buildMetadata({
	title: "FAQ",
	description: "Answers to the questions operators ask first about SynapseDC: what it is, how it differs from DCIM and BMS, data and security, onboarding time and cost.",
	path: "/faq",
});

const cats = ["Product", "Data & security", "Getting started", "Commercial"] as const;
const id = (c: string) => c.toLowerCase().replace(/[^a-z]+/g, "-");

export default function FaqPage() {
	return (
		<>
			<JsonLd schema={faqSchema(faqs)} />
			<PageHero kicker="FAQ" title="Questions operators ask first." art="opstral-ai" crumbs={[{ name: "Home", href: "/" }, { name: "FAQ", href: "/faq" }]} />
			<Section>
				<nav className="faq-cats" aria-label="Categories">
					{cats.map((c) => (
						<a key={c} href={`#${id(c)}`} className="pill">{c}</a>
					))}
				</nav>
				{cats.map((c) => (
					<div key={c} id={id(c)} className="faq-group">
						<h2>{c}</h2>
						<FaqList items={faqs.filter((f) => f.cat === c)} name={id(c)} />
					</div>
				))}
			</Section>
			<CtaBand />
		</>
	);
}
