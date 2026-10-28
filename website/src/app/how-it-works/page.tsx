import Link from "next/link";
import { CtaBand, FeatureCards, PageHero, Section } from "@/components/Blocks";
import { Architecture } from "@/components/home/Architecture";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";
import { journey } from "@/data/site";
import { buildMetadata } from "@/seo";

export const metadata = buildMetadata({
	title: "How it works & security",
	description: "How SynapseDC connects to a datacenter and what it will never do: a read-only, outbound-only collector, one estate model, clear security boundaries and a one-site pilot in 6–10 weeks.",
	path: "/how-it-works",
});

const data = [
	{ t: "Every count is derived", d: "Counts come from devices, interfaces, links, services, alarms and incidents, never typed in." },
	{ t: "Every sample keeps its source", d: "Source and receipt time on every reading. Fresh means younger than two polling intervals." },
	{ t: "Stable identities", d: "Entity ids are stable strings, so adding data never reshuffles the rest." },
	{ t: "Your currency, your tariffs", d: "Money in your currency and format. Tariffs and benchmarks are marked illustrative until your own replace them." },
];

const boundaries = [
	{ icon: "eye-off", title: "Never controls plant", text: "SynapseDC reads the BMS, UPS, PDUs, meters, network and BMCs. It never changes a set point or switches anything. People act through a change request." },
	{ icon: "lock", title: "Outbound only", text: "The collector (active + standby) sends outbound over mTLS on port 443. Nothing connects into the site." },
	{ icon: "shield", title: "Tenant equipment sealed", text: "In colocation, tenant gear is never polled. Power at the cabinet, inlet temperature and the cage door are measured from outside." },
	{ icon: "cpu", title: "GPU jobs, not their contents", text: "In a GPU cloud, GPUs and jobs are monitored. A job's data, model weights and code never are." },
	{ icon: "users", title: "Your identity provider", text: "Screens run with your identity (OIDC), in the platform shell or embedded in your portal." },
	{ icon: "clipboard-check", title: "Every change recorded", text: "Record edits run under a change request; decisions, approvals and plan edits are audited." },
];

const walkthrough = [
	{ title: "The collector", text: "Placement inside the site, active and standby, what it reads and how it buffers when the uplink drops." },
	{ title: "Ports and protocols", text: "Every southbound protocol, its credentials and the read-only role it uses; the single outbound port." },
	{ title: "The data each one carries", text: "Per source, the records and samples that leave the site, and the ones that never do." },
];

export default function HowItWorks() {
	return (
		<>
			<PageHero art="facilities" kicker="How it works & security" title="Read-only on site. One model for the estate. Live in weeks." summary="A collector per datacenter reads your equipment and sends outbound only. SynapseDC builds one estate model and never controls plant, polls tenant gear or reads job data. People decide and act." crumbs={[{ name: "Home", href: "/" }, { name: "How it works & security", href: "/how-it-works" }]} />

			<Section tone="dark" kicker="Architecture" title="From the equipment to the answer.">
				<Architecture />
			</Section>

			<Section id="security" kicker="Security boundaries" title="What SynapseDC will and will not do." intro="Clear limits, stated early. It reads, explains and recommends; people decide and act.">
				<FeatureCards items={boundaries} />
			</Section>

			<Section tone="soft" kicker="Data" title="Numbers you can trust, because nothing is typed in.">
				<div className="grid-4">
					{data.map((d) => (
						<div key={d.t} className="card">
							<h3>{d.t}</h3>
							<p>{d.d}</p>
						</div>
					))}
				</div>
			</Section>

			<Section id="journey" kicker="Onboarding" title="One site, live in 6–10 weeks." intro="A pilot runs the operate core on one datacenter, read-only. Further sites and modules follow once the pilot has proved what you agreed it should.">
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

			<Section tone="soft" kicker="With your security team" title="What we walk through in discovery.">
				<FeatureCards items={walkthrough} />
			</Section>

			<CtaBand />
		</>
	);
}
