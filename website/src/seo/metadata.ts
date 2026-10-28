import type { Metadata } from "next";
import { absoluteUrl, siteConfig } from "./site.config";

export interface BuildMetadataOptions {
	/** Short page title, without the brand (the layout's template adds " | SynapseDC"). */
	title: string;
	/** 140–160 characters, unique per page. */
	description: string;
	/** Site-relative path; drives the canonical URL. */
	path: string;
	image?: string;
	noIndex?: boolean;
}

/** Every page.tsx exports metadata built through this helper (canonical, Open Graph, Twitter, robots). */
export function buildMetadata({ title, description, path, image = siteConfig.ogImage, noIndex }: BuildMetadataOptions): Metadata {
	const url = absoluteUrl(path);
	return {
		title,
		description,
		alternates: { canonical: url },
		openGraph: { type: "website", url, title, description, siteName: siteConfig.name, images: [{ url: image }] },
		twitter: { card: "summary_large_image", title, description, images: [image] },
		robots: noIndex ? { index: false, follow: true } : undefined,
	};
}
