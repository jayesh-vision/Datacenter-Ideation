import { CtaBand, PageHero, Section } from "@/components/Blocks";
import { differentiators } from "@/data/site";
import { buildMetadata } from "@/seo";

export const metadata = buildMetadata({
	title: "Why SynapseDC",
	description: "How SynapseDC differs from a BMS, a DCIM, ITSM, CRM, network monitoring and spreadsheets: it joins them into live operations with impact and money.",
	path: "/why-synapsedc",
});

export default function WhyPage() {
	return (
		<>
			<PageHero art="command-center" kicker="Why SynapseDC" title="We don't ask you to throw anything away." summary="Where you have a tool that works, SynapseDC connects to it and adds what it cannot do: impact, money and the physical context behind every fault." crumbs={[{ name: "Home", href: "/" }, { name: "Why SynapseDC", href: "/why-synapsedc" }]} />
			<Section kicker="Compared with what you have" title="What each tool does well, and what SynapseDC adds.">
				<div className="table-wrap">
					<table className="t">
						<thead>
							<tr>
								<th>You have</th>
								<th>What it does well</th>
								<th>What SynapseDC adds</th>
							</tr>
						</thead>
						<tbody>
							{differentiators.map((d) => (
								<tr key={d.have}>
									<td className="k">{d.have}</td>
									<td>{d.good}</td>
									<td className="adds">{d.adds}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Section>
			<CtaBand />
		</>
	);
}
