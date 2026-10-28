import { RevealHeading } from "../Reveal";

/** "What SynapseDC is": kicker + heading left, the statement right, ruled above and below (Opstral's "What is Opstral" block). */
export function Intro() {
	return (
		<section className="section section-dark on-dark intro" aria-labelledby="intro-title">
			<div className="wrap intro-grid">
				<div>
					<p className="intro-kicker">What SynapseDC is</p>
					<RevealHeading id="intro-title" className="h-2">
						{"Plan, build and operate,\non one estate model"}
					</RevealHeading>
				</div>
				<p className="intro-text">
					SynapseDC is the datacenter platform for colocation and GPU cloud operators. It plans the capacity, builds it as records under change control, and operates it live, with the building, the racks, the GPUs and the network connected to the customers and contracts they serve. Every fault arrives with who is affected, what it costs and the next action, and every number is the same on every screen.
				</p>
			</div>
		</section>
	);
}
