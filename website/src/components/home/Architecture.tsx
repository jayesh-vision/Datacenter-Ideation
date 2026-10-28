import { Icon } from "../Icon";

/**
 * The architecture (BRD §6.2 and the interface specification), drawn as zones:
 *   inside the site      sources by protocol → the collector (active + standby) → one outbound channel
 *   the trust boundary   mTLS 443 out, nothing in
 *   SynapseDC            ingest → stores → read models → API + events → screens
 *   your systems         ITSM · CRM · IPAM · SIEM · your tools
 * and, across the bottom, where it deploys and whose identity it uses.
 */
const SOURCES: [string, string, string][] = [
	["zap", "BMS · UPS · PDUs · meters", "BACnet · Modbus · SNMP"],
	["thermometer", "CRAH · CDUs · sensors", "BACnet · Modbus"],
	["network", "Routers · switches · optics", "SNMPv3 · gNMI · syslog"],
	["server", "Servers · BMCs", "Redfish · IPMI"],
	["cpu", "GPUs · scheduler · fabric", "DCGM · Slurm · UFM"],
	["lock", "Doors · cages · CCTV", "PACS · VMS"],
];
const MODELS = ["Impact", "Revenue", "Root cause", "GPU", "Physical", "Capacity", "Power economics", "Security", "Compliance"];
const NORTH: [string, string][] = [
	["workflow", "ITSM · incidents, changes, tickets"],
	["users", "CRM · customers, contracts, notices"],
	["database", "IPAM · DNS · DHCP"],
	["shield", "SIEM · OCSF events"],
	["plug", "Your tools · REST API v1 · webhooks · Kafka"],
];

export function Architecture() {
	return (
		<div className="ar">
			{/* --- inside the site --- */}
			<section className="ar-zone ar-site">
				<header>
					<span className="ar-zone-tag">Inside your datacenter</span>
					<span className="ar-zone-sub">read-only · no inbound ports</span>
				</header>
				<div className="ar-site-grid">
					<ul className="ar-sources">
						{SOURCES.map(([i, t, p]) => (
							<li key={t}>
								<Icon name={i} size={15} />
								<span>
									<strong>{t}</strong>
									<small>{p}</small>
								</span>
							</li>
						))}
					</ul>
					<div className="ar-arrows" aria-hidden="true">
						{SOURCES.map((s) => (
							<i key={s[1]} />
						))}
					</div>
					<div className="ar-collector">
						<div className="ar-col-head">
							<Icon name="radio-tower" size={18} />
							<strong>On-site collector</strong>
							<span>active + standby</span>
						</div>
						<ol>
							<li>
								<b>Read</b> each source with a read-only role
							</li>
							<li>
								<b>Normalise</b> alarms; keep source and time
							</li>
							<li>
								<b>Buffer</b> when the uplink drops
							</li>
							<li>
								<b>Send</b> outbound only, one channel
							</li>
						</ol>
						<div className="ar-never">
							<Icon name="eye-off" size={14} />
							Never controls plant · never polls tenant gear
						</div>
					</div>
				</div>
			</section>

			{/* --- boundary --- */}
			<div className="ar-boundary" aria-hidden="true">
				<span className="ar-out">
					<i />
					<b>outbound only · mTLS · port 443</b>
				</span>
				<span className="ar-in">
					<Icon name="x" size={12} />
					nothing connects in
				</span>
			</div>

			{/* --- platform --- */}
			<section className="ar-zone ar-platform">
				<header>
					<span className="ar-zone-tag ar-zone-tag-brand">SynapseDC</span>
					<span className="ar-zone-sub">one estate model · one alarm model · one money model</span>
				</header>
				<div className="ar-pipe">
					{[
						["download", "Ingest", "OTLP · remote write · events"],
						["database", "Stores", "time series · events · records"],
						["waypoints", "Estate model", "sites → racks → devices → ports, customers, contracts"],
					].map(([i, t, s]) => (
						<div key={t} className="ar-step">
							<Icon name={i} size={16} />
							<strong>{t}</strong>
							<small>{s}</small>
						</div>
					))}
					<div className="ar-step ar-models">
						<Icon name="activity" size={16} />
						<strong>Read models</strong>
						<div className="ar-model-chips">
							{MODELS.map((m) => (
								<span key={m}>{m}</span>
							))}
						</div>
					</div>
					<div className="ar-step">
						<Icon name="sparkles" size={16} />
						<strong>Opstral AI</strong>
						<small>answers · causes · actions, approval-gated</small>
					</div>
					<div className="ar-step ar-out-step">
						<Icon name="monitor" size={16} />
						<strong>Screens · API · events</strong>
						<small>the same REST contract the screens use · CloudEvents</small>
					</div>
				</div>
			</section>

			{/* --- north --- */}
			<section className="ar-zone ar-north">
				<header>
					<span className="ar-zone-tag">Your systems</span>
					<span className="ar-zone-sub">the module that owns a record stays its system of record</span>
				</header>
				<ul>
					{NORTH.map(([i, t]) => (
						<li key={t}>
							<Icon name={i} size={15} />
							{t}
						</li>
					))}
				</ul>
			</section>

			{/* --- deploy --- */}
			<footer className="ar-deploy">
				<strong>Runs where your data must live</strong>
				{[
					["server", "On-premises"],
					["cloud", "Your cloud"],
					["lock", "Air-gapped"],
					["users", "Your identity · OIDC"],
					["monitor", "Embedded in your portal"],
				].map(([i, t]) => (
					<span key={t}>
						<Icon name={i} size={14} />
						{t}
					</span>
				))}
			</footer>
		</div>
	);
}
