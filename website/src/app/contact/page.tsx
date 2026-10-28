import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";
import { Icon } from "@/components/Icon";
import { buildMetadata } from "@/seo";

export const metadata = buildMetadata({
	title: "Request a demo",
	description: "Request a SynapseDC demo on an estate shaped like yours, colocation or GPU cloud, and agree what a one-site pilot should prove.",
	path: "/contact",
});

const expect = [
	"One fault walked end to end: a UPS on battery, the tenants it affects, what it costs and the next step",
	"Your business model in your vocabulary: cabinets and tenants for colocation, jobs and GPU-hours for GPU clouds",
	"If you run GPUs: blast radius, GPU time lost, power per GPU-hour and where to place the next job",
	"Plan and build: a new hall sized, priced and scheduled, then recorded in DCIM under change control",
	"Architecture and security: the read-only collector, outbound mTLS 443 and where it deploys",
	"A one-site pilot plan with success criteria agreed before it starts",
];

const after: [string, string, string][] = [
	["01", "Discovery", "1–2 weeks"],
	["02", "Site survey and data", "2–3 weeks"],
	["03", "Connect and go-live", "one pilot site"],
];

export default function ContactPage() {
	return (
		<section className="canvas on-dark ct">
			<div className="canvas-glow" aria-hidden="true" />
			<div className="wrap ct-inner">
				<nav className="crumbs" aria-label="Breadcrumb">
					<span>
						<Link href="/">Home</Link>
					</span>
					<span>
						<span aria-hidden="true">/</span>
						<span aria-current="page">Request a demo</span>
					</span>
				</nav>
				<span className="uc-badge">Request a demo</span>
				<h1 className="h-1">See SynapseDC on an estate shaped like yours.</h1>
				<p className="lead ct-lead">A focused live walk-through: one fault from the first alarm to the customer and the cost, your plan-to-build flow and, if you run GPUs, the job behind every GPU. No slideware. Just the platform.</p>

				<div className="ct-grid">
					<ContactForm />
					<aside className="ct-side">
						<h2>What to expect</h2>
						<p className="ct-sub">A real engineer, a demo estate in your vocabulary, your real questions.</p>
						<ul className="ct-list">
							{expect.map((x) => (
								<li key={x}>
									<Icon name="check" size={16} />
									{x}
								</li>
							))}
						</ul>
						<div className="ct-after">
							<small>After the demo</small>
							<ol>
								{after.map(([n, t, w]) => (
									<li key={n}>
										<b>{n}</b>
										<span>{t}</span>
										<em>{w}</em>
									</li>
								))}
							</ol>
							<Link className="text-link ct-link" href="/how-it-works#journey">
								How onboarding works <Icon name="arrow" size={14} />
							</Link>
						</div>
					</aside>
				</div>
			</div>
		</section>
	);
}
