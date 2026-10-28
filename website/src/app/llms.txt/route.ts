import { modules } from "@/data/modules";
import { solutions } from "@/data/solutions";
import { absoluteUrl, siteConfig } from "@/seo";

export const dynamic = "force-static";

/** /llms.txt: a plain summary for answer engines, built from the page data. */
export function GET() {
	const lines = [
		`# ${siteConfig.name}`,
		"",
		`> ${siteConfig.description}`,
		"",
		"## Modules",
		...modules.map((m) => `- [${m.name}](${absoluteUrl(`/platform/${m.slug}`)}): ${m.short}`),
		"",
		"## Solutions",
		...solutions.map((s) => `- [${s.name}](${absoluteUrl(`/solutions/${s.slug}`)}): ${s.status}. ${s.short}`),
		"",
		"## Key pages",
		`- [How it works](${absoluteUrl("/how-it-works")})`,
		`- [Integrations](${absoluteUrl("/integrations")})`,
		`- [Security & trust](${absoluteUrl("/security")})`,
		`- [FAQ](${absoluteUrl("/faq")})`,
	];
	return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
