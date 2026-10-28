import Link from "next/link";
import { GpuChain } from "../gpu/GpuChain";
import { Icon } from "../Icon";
import { Kicker } from "../Blocks";
import { RevealHeading } from "../Reveal";

/** Home page band for the GPU use case (placed high, links to /gpu-ai). */
export function GpuBand() {
	return (
		<section className="section section-dark on-dark gpu-band">
			<div className="wrap">
				<div className="gpu-band-head">
					<div>
						<Kicker>GPU Fleet · for GPU clouds and AI halls</Kicker>
						<RevealHeading className="h-2">The GPU is what you sell. SynapseDC runs everything it depends on.</RevealHeading>
					</div>
					<div className="gpu-band-side">
						<p>One failed GPU can stop a 152-GPU job. A low CDU flow can slow one by 24 %. SynapseDC puts the GPU, the job and the customer on the same chain as the power and cooling behind them.</p>
						<Link className="btn btn-primary" href="/gpu-ai">
							See GPU &amp; AI <Icon name="arrow" size={16} />
						</Link>
					</div>
				</div>
				<GpuChain story={false} />
				<p className="tl-note">Figures from the SynapseDC demo estate, illustrative.</p>
			</div>
		</section>
	);
}
