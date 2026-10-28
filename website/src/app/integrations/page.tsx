import { CtaBand, PageHero, Pills, Section } from "@/components/Blocks";
import { Reveal } from "@/components/Reveal";
import { integrations } from "@/data/site";
import { buildMetadata } from "@/seo";

export const metadata = buildMetadata({
	title: "Integrations",
	description: "SynapseDC reads BMS, power, cooling, network, BMCs, GPUs (NVIDIA DCGM, Intel) and doors, and connects to ServiceNow, Salesforce, IPAM, SIEM and your own tools.",
	path: "/integrations",
});

export default function IntegrationsPage() {
	return (
		<>
			<PageHero art="dcim" kicker="Integrations" title="Keep the tools that work. Connect them to the business." summary="Southbound, SynapseDC reads your equipment through the on-site collector. Northbound, it gives your ITSM, CRM, SIEM and data teams the same contract the screens use. If you have no ITSM or CRM, the platform offers its own." crumbs={[{ name: "Home", href: "/" }, { name: "Integrations", href: "/integrations" }]} />
			<Section kicker="Sources and systems" title="What SynapseDC connects to.">
				<div className="grid-2">
					{integrations.map((g, i) => (
						<Reveal key={g.group} className="card int-card" delay={(i % 2) * 60}>
							<h3>{g.group}</h3>
							<p>{g.desc}</p>
							<Pills items={g.items} />
						</Reveal>
					))}
				</div>
				<p className="note" style={{ marginTop: 24 }}>Product and protocol names identify the systems SynapseDC reads from or writes to; they do not imply a partnership.</p>
			</Section>
			<CtaBand title="Tell us what you run today." text="In discovery we go through your BMS, EPMS, UPS, PDUs, DCIM, ITSM, CRM, PACS, NMS, SSO and SIEM and decide, per system, whether to integrate or offer." />
		</>
	);
}
