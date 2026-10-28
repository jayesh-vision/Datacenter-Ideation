import { absoluteUrl, siteConfig } from "./site.config";

type Schema = Record<string, unknown>;

export const organizationSchema = (): Schema => ({
	"@context": "https://schema.org",
	"@type": "Organization",
	name: siteConfig.name,
	url: absoluteUrl("/"),
	description: siteConfig.description,
});

export const softwareSchema = (name: string, description: string, path: string, features: string[] = []): Schema => ({
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name,
	description,
	url: absoluteUrl(path),
	applicationCategory: "BusinessApplication",
	operatingSystem: "Web",
	featureList: features,
});

export const breadcrumbSchema = (items: { name: string; path: string }[]): Schema => ({
	"@context": "https://schema.org",
	"@type": "BreadcrumbList",
	itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
});

export const faqSchema = (items: { q: string; a: string }[]): Schema => ({
	"@context": "https://schema.org",
	"@type": "FAQPage",
	mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

export function JsonLd({ schema }: { schema: Schema | Schema[] }) {
	return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />;
}
