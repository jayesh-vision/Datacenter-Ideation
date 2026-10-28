/**
 * SINGLE SOURCE OF TRUTH for the brand, the domain and company facts.
 * Rebranding or changing the domain should need edits here only.
 * Values marked PLACEHOLDER are still to be confirmed by the business.
 */

const DEV_ORIGIN = "http://localhost:3010";

/** Absolute origin, defensive against blank values, missing scheme and trailing slash. */
function resolveSiteUrl(): string {
	for (const raw of [process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]) {
		const value = raw?.trim();
		if (!value) continue;
		try {
			return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).origin;
		} catch {
			console.warn(`[seo] Ignoring unusable site URL ${JSON.stringify(raw)}`);
		}
	}
	return DEV_ORIGIN;
}

export const siteUrl = resolveSiteUrl();

export const siteConfig = {
	name: "SynapseDC",
	tagline: "Plan, build and operate datacenters on one platform",
	description:
		"SynapseDC is the end-to-end platform for colocation and GPU cloud operators to plan, build and operate datacenters: capacity and planning, DCIM under change control, and live operations with impact and cost.",
	locale: "en_US",
	ogImage: "/product/command-center.jpg",
	/** PLACEHOLDER: contact details are not confirmed yet. */
	contact: {
		email: "",
		phone: "",
		address: "",
	},
	/** PLACEHOLDER: social profiles, added when they exist. */
	social: [] as { label: string; href: string }[],
};

export const absoluteUrl = (path = "/") => new URL(path, siteUrl).toString();
