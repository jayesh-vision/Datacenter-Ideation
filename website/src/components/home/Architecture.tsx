import { Icon } from "../Icon";

/** Collector → platform → screens, the data path from BRD §6.2. */
export function Architecture() {
	const sources = [
		["zap", "BMS · UPS · PDUs · meters"],
		["thermometer", "Cooling · CDUs · sensors"],
		["network", "Routers · switches · optics"],
		["server", "Servers · BMCs"],
		["cpu", "GPUs (DCGM) · scheduler"],
		["lock", "Doors · cages · CCTV"],
	];
	return (
		<div className="arch">
			<div className="arch-col">
				<p className="arch-h">Your datacenter</p>
				{sources.map(([i, t]) => (
					<div key={t} className="arch-src">
						<Icon name={i} size={16} />
						{t}
					</div>
				))}
			</div>
			<div className="arch-link" aria-hidden="true">
				<span>read-only</span>
			</div>
			<div className="arch-col arch-collector">
				<p className="arch-h">On-site collector</p>
				<div className="arch-box">
					<strong>Active + standby</strong>
					<span>SNMPv3 · gNMI · syslog · Redfish · IPMI · Modbus · BACnet / OPC UA · DCGM</span>
					<span>Normalises alarms, buffers when the uplink drops</span>
				</div>
			</div>
			<div className="arch-link" aria-hidden="true">
				<span>outbound · mTLS 443</span>
			</div>
			<div className="arch-col arch-platform">
				<p className="arch-h">SynapseDC</p>
				<div className="arch-box">
					<strong>One estate · one alarm · one money model</strong>
					<span>Impact, revenue, root cause, GPU, physical, capacity, power economics, security, compliance</span>
				</div>
				<div className="arch-out">
					<span>Screens</span>
					<span>REST API v1</span>
					<span>Events</span>
					<span>ITSM · CRM · SIEM</span>
				</div>
			</div>
		</div>
	);
}
