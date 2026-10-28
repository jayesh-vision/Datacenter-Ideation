import { PageHero, Section } from "@/components/Blocks";
import { ContactForm } from "@/components/ContactForm";
import { Icon } from "@/components/Icon";
import { buildMetadata } from "@/seo";

export const metadata = buildMetadata({
	title: "Book a demo",
	description: "Book a SynapseDC demo on an estate shaped like yours, colocation or GPU cloud, and agree what a one-site pilot should prove.",
	path: "/contact",
});

const steps = [
	["sparkles", "A demo of your business model", "Colocation or GPU cloud, in your vocabulary, around a fault you recognise."],
	["clipboard-check", "Discovery", "Your sites, your systems and what you want the pilot to prove."],
	["building-2", "A one-site pilot", "Read-only, six to ten weeks, with success criteria agreed before it starts."],
];

export default function ContactPage() {
	return (
		<>
			<PageHero kicker="Book a demo" title="Bring the fault your team keeps dealing with." summary="We show it end to end: who is affected, what it costs and what to do first." crumbs={[{ name: "Home", href: "/" }, { name: "Book a demo", href: "/contact" }]} />
			<Section>
				<div className="contact-layout">
					<div>
						<h2 className="h-2">What happens next</h2>
						<div className="contact-points">
							{steps.map(([i, t, d]) => (
								<div key={t}>
									<Icon name={i} size={20} />
									<div>
										<strong>{t}</strong>
										<span>{d}</span>
									</div>
								</div>
							))}
						</div>
					</div>
					<ContactForm />
				</div>
			</Section>
		</>
	);
}
