import Link from "next/link";
import { CtaBand, PageHero, Section } from "@/components/Blocks";
import { Architecture } from "@/components/home/Architecture";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";
import { journey } from "@/data/site";
import { buildMetadata } from "@/seo";

export const metadata = buildMetadata({
	title: "How it works",
	description: "How SynapseDC connects to a datacenter: an on-site collector, read-only and outbound-only, one estate model, and an onboarding journey from first meeting to go-live.",
	path: "/how-it-works",
});

const data = [
	{ t: "Every count is derived", d: "Counts come from devices, interfaces, links, services, alarms and incidents, never typed in." },
	{ t: "Every sample keeps its source", d: "Source and receipt time on every reading. Fresh means younger than two polling intervals." },
	{ t: "Stable identities", d: "Entity ids are stable strings, so adding data never reshuffles the rest." },
	{ t: "Your currency, your tariffs", d: "Money in your currency and format. Tariffs and benchmarks are marked illustrative until your own replace them." },
];


export default function HowItWorks() {
	return (
		<>
			<PageHero art="facilities" kicker="How it works" title="Read-only on site, one model for the estate, live in weeks." summary="A collector per datacenter reads your equipment and sends outbound only. The platform builds one estate model and the read models every screen uses: impact, revenue, root cause, GPU, physical, capacity, power, security and compliance." crumbs={[{ name: "Home", href: "/" }, { name: "How it works", href: "/how-it-works" }]} />

			<Section tone="dark" kicker="Architecture" title="From the equipment to the answer.">
				<Architecture />
			</Section>

			<Section kicker="Data" title="Numbers you can trust, because nothing is typed in.">
				<div className="grid-4">
					{data.map((d) => (
						<div key={d.t} className="card">
							<h3>{d.t}</h3>
							<p>{d.d}</p>
						</div>
					))}
				</div>
			</Section>

			<Section tone="soft" id="journey" kicker="Onboarding" title="One site, live in 6–10 weeks." intro="A pilot runs the operate core on one datacenter, read-only. Further sites and modules follow once the pilot has proved what you agreed it should.">
				<ol className="tl4">
					{journey.map((j, i) => (
						<Reveal as="li" key={j.step} delay={i * 80}>
							<div className="tl4-dot">{j.step}</div>
							<small>{j.when}</small>
							<h3>{j.title}</h3>
							<p>{j.text}</p>
							<ul>
								{j.items.map((x) => (
									<li key={x}>
										<Icon name="check" size={14} />
										{x}
									</li>
								))}
							</ul>
						</Reveal>
					))}
				</ol>
				<p style={{ marginTop: 32 }}>
					<Link className="text-link" href="/integrations">
						See every source and system <Icon name="arrow" size={16} />
					</Link>
				</p>
			</Section>

			<CtaBand />
		</>
	);
}
