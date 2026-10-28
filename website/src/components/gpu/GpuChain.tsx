import { Icon } from "../Icon";

/**
 * The GPU chain: what a GPU depends on and what it earns, on one estate model,
 * left to right, with one demo-estate story running underneath (UC-G2).
 */
const CORE: [string, string, string][] = [
	["zap", "Utility feed", "tariff · contract"],
	["battery-charging", "UPS · busway", "A and B sides"],
	["droplets", "CDU loop", "flow · supply temp"],
	["server", "Liquid rack", "40–60 kW"],
];
const EARNS: [string, string, string][] = [
	["cpu", "GPU node", "8 GPUs · NVLink"],
	["activity", "GPU", "clocks · throttle · Xid"],
	["briefcase", "Job", "step time · checkpoint"],
	["users", "Customer", "reserved · on-demand"],
	["badge-dollar-sign", "Revenue", "GPU-hours · credits"],
];

export function GpuChain({ story = true }: { story?: boolean }) {
	return (
		<div className="gc">
			<div className="gc-row">
				<div className="gc-group gc-depends">
					<span className="gc-tag">What the GPU depends on</span>
					<ol>
						{CORE.map(([i, t, s]) => (
							<li key={t}>
								<Icon name={i} size={17} />
								<strong>{t}</strong>
								<small>{s}</small>
							</li>
						))}
					</ol>
				</div>
				<div className="gc-group gc-earn">
					<span className="gc-tag">What the GPU earns</span>
					<ol>
						{EARNS.map(([i, t, s]) => (
							<li key={t}>
								<Icon name={i} size={17} />
								<strong>{t}</strong>
								<small>{s}</small>
							</li>
						))}
					</ol>
				</div>
			</div>
			{story && (
				<div className="gc-story">
					<span className="gc-story-tag">Demo estate · one chain</span>
					<span>
						CDU flow at <b>62 %</b>
					</span>
					<Icon name="arrow" size={14} />
					<span>
						<b>144</b> GPUs throttle
					</span>
					<Icon name="arrow" size={14} />
					<span>
						job <b>24 %</b> slower
					</span>
					<Icon name="arrow" size={14} />
					<span>incident on the cooling fault, not the job</span>
				</div>
			)}
		</div>
	);
}
