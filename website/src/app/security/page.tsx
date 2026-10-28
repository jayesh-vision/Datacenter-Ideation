import { CtaBand, FeatureCards, PageHero, Section } from "@/components/Blocks";
import { buildMetadata } from "@/seo";

export const metadata = buildMetadata({
	title: "Security & trust",
	description: "SynapseDC is read-only and outbound-only: it never controls plant, never polls tenant equipment and never reads GPU job data. Here is how the boundaries work.",
	path: "/security",
});

const boundaries = [
	{ icon: "eye-off", title: "Never controls plant", text: "SynapseDC reads the BMS, UPS, PDUs, meters, network and BMCs. It never changes a set point or switches anything. People act through a change request." },
	{ icon: "lock", title: "Outbound only", text: "The collector (active + standby) sends outbound over mTLS on port 443. Nothing connects into the site." },
	{ icon: "shield", title: "Tenant equipment sealed", text: "In colocation, tenant gear is never polled. Power at the cabinet, inlet temperature and the cage door are measured from outside." },
	{ icon: "cpu", title: "GPU jobs, not their contents", text: "In a GPU cloud, GPUs and jobs are monitored. A job's data, model weights and code never are." },
	{ icon: "users", title: "Your identity provider", text: "Screens run with the platform's identity (OIDC), in the platform shell or embedded in your portal." },
	{ icon: "clipboard-check", title: "Every change recorded", text: "DCIM edits run under a change request, and decisions, approvals and plan edits are audited." },
];

const walkthrough = [
	{ title: "The collector", text: "Placement inside the site, active and standby, what it reads and how it buffers when the uplink drops." },
	{ title: "Ports and protocols", text: "Every southbound protocol, its credentials and the read-only role it uses; the single outbound port." },
	{ title: "The data each one carries", text: "Per source, the records and samples that leave the site, and the ones that never do." },
];

export default function SecurityPage() {
	return (
		<>
			<PageHero kicker="Security & trust" title="Read-only by design. Clear limits, stated early." summary="SynapseDC sits beside the systems that run your building. It reads, explains and recommends. People decide and act." art="security-ops" crumbs={[{ name: "Home", href: "/" }, { name: "Security & trust", href: "/security" }]} />
			<Section kicker="Boundaries" title="What SynapseDC will and will not do.">
				<FeatureCards items={boundaries} />
			</Section>
			<Section tone="soft" kicker="With your security team" title="What we walk through in discovery.">
				<FeatureCards items={walkthrough} />
			</Section>
			<CtaBand title="Bring your security team to the first meeting." text="We walk through the collector, the ports, the protocols and the data each one carries, before anything is installed." />
		</>
	);
}
