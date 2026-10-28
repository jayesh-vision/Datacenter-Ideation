import type { MetadataRoute } from "next";
import { modules } from "@/data/modules";
import { roles, solutions } from "@/data/solutions";
import { absoluteUrl } from "@/seo";

/** /sitemap.xml from the same data the pages use. Placeholder pages are left out until they have content. */
export default function sitemap(): MetadataRoute.Sitemap {
	const fixed = ["/", "/platform", "/solutions", "/gpu-ai", "/resources", "/how-it-works", "/integrations", "/why-synapsedc", "/faq", "/contact"];
	return [
		...fixed.map((p) => ({ url: absoluteUrl(p), priority: p === "/" ? 1 : 0.8 })),
		...modules.map((m) => ({ url: absoluteUrl(`/platform/${m.slug}`), priority: 0.8 })),
		...solutions.map((s) => ({ url: absoluteUrl(`/solutions/${s.slug}`), priority: s.status === "First release" ? 0.8 : 0.5 })),
		...roles.map((r) => ({ url: absoluteUrl(`/roles/${r.slug}`), priority: 0.6 })),
	];
}
