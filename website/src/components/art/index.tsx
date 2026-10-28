import { HeroArt } from "./hero";
import { CommandCenterArt, DcimArt, GpuArt, PlannerArt, TwinArt } from "./features";
import { Art, Bar, Beacon, C, Card, Chip, Flow, Label, Node, Person, Rack, Ring } from "./kit";

export { HeroArt, CommandCenterArt, DcimArt, GpuArt, PlannerArt, TwinArt };

/* ------------------------------------------------------------------ */
/* Module illustrations                                                */
/* ------------------------------------------------------------------ */
export function FacilitiesArt() {
	const y = 160;
	const nodes = [
		["Utility A", 60],
		["ATS", 170],
		["UPS-2", 280],
		["Busway A", 390],
		["PDU-A", 500],
	];
	return (
		<Art label="Single-line power path from the utility feed to the rack PDU, with the ride-through figure">
			{nodes.map(([n, x], i) => (
				<g key={String(n)}>
					{i < nodes.length - 1 && <Flow d={`M${Number(x) + 28} ${y} L ${Number(nodes[i + 1][1]) - 28} ${y}`} color={i === 0 ? C.fault : C.sky} delay={i * 0.2} />}
					<Card x={Number(x) - 28} y={y - 22} w={56} h={44} r={10} tone="card2" stroke={i === 0 ? C.fault : C.line2} />
					<Label x={Number(x)} y={y + 4} size={10} color={C.ink} anchor="middle" weight={500}>
						{String(n)}
					</Label>
				</g>
			))}
			<Label x={60} y={118} size={10} color={C.fault} anchor="middle">
				feed lost
			</Label>
			<Flow d="M170 182 L 170 240 L 60 240" color={C.ok} />
			<Card x={32} y={226} w={56} h={30} r={8} tone="card2" />
			<Label x={60} y={245} size={10} color={C.ink} anchor="middle">
				DG
			</Label>
			<Card x={60} y={290} w={520} h={88} />
			<Label x={80} y={314} size={11}>
				IF UTILITY POWER FAILS NOW
			</Label>
			<Ring x={110} y={350} r={18} v={0.62} label="" />
			<Label x={140} y={346} size={13} color={C.ink} weight={500}>
				UPS 14 min
			</Label>
			<Label x={140} y={364} size={11}>
				on battery · 62 %
			</Label>
			<Label x={270} y={346} size={13} color={C.ink} weight={500}>
				DG 5,000 kVA
			</Label>
			<Label x={270} y={364} size={11}>
				starts in 12 s · ready
			</Label>
			<Label x={420} y={346} size={13} color={C.ink} weight={500}>
				Fuel 38 h
			</Label>
			<Label x={420} y={364} size={11}>
				at today&apos;s load
			</Label>
		</Art>
	);
}

export function RevenueArt() {
	return (
		<Art label="Open issues ranked by what they cost, and the cost-of-delay curve">
			<Label x={48} y={54} size={11}>
				COSTING THE MOST RIGHT NOW
			</Label>
			<Bar x={48} y={84} w={300} v={0.9} label="UPS-2 on battery · 54 services" value="$2,641 / h" color={C.fault} />
			<Bar x={48} y={128} w={300} v={0.4} label="GPU stalled · 152 GPUs" value="$625 / h" color={C.warn} />
			<Bar x={48} y={172} w={300} v={0.22} label="Fibre trunk · 4 cables" value="$310 / h" />
			<Bar x={48} y={216} w={300} v={0.1} label="CRAH-11 failed" value="exposed" />
			<Card x={380} y={44} w={220} h={200} />
			<Label x={396} y={66} size={11}>
				COST OF DELAY
			</Label>
			<path d="M396 210 L 440 200 L 480 185 L 500 150 L 540 140 L 560 90 L 586 80" fill="none" stroke={C.sky} strokeWidth="2" className="art-draw" />
			<line x1="500" y1="92" x2="500" y2="210" stroke={C.warn} strokeDasharray="3 4" />
			<Label x={504} y={100} size={10} color={C.warn}>
				credit tier 25 %
			</Label>
			<line x1="560" y1="92" x2="560" y2="210" stroke={C.fault} strokeDasharray="3 4" />
			<Label x={556} y={224} size={10} color={C.fault} anchor="end">
				50 %
			</Label>
			<Card x={48} y={270} w={552} h={100} />
			{[
				["Lost so far", "$55.3k"],
				["Credits owed", "$345.9k"],
				["At stake", "$3.44M / mo"],
				["Within SLA", "88.7 %"],
			].map(([k, v], i) => (
				<g key={k}>
					<Label x={68 + i * 138} y={300} size={11}>
						{k}
					</Label>
					<Label x={68 + i * 138} y={330} size={17} color={C.ink} weight={500}>
						{v}
					</Label>
				</g>
			))}
			<Label x={48} y={400} size={11}>
				Σ issues = Σ customers = Σ datacenters
			</Label>
		</Art>
	);
}

export function AlarmsArt() {
	return (
		<Art label="Alarm scope rings around a datacenter: site, edge, dependency and downstream">
			{[
				[190, "downstream · never counted", C.line],
				[146, "dependency", C.line2],
				[102, "edge · both ends", C.sky],
				[58, "site", C.ice],
			].map(([r, t, c]) => (
				<g key={String(t)}>
					<circle cx="230" cy="210" r={Number(r)} fill="none" stroke={String(c)} strokeWidth={r === 190 ? 1 : 1.5} strokeDasharray={r === 190 ? "4 6" : undefined} />
					<Label x={230} y={210 - Number(r) + 16} size={10} color={String(c)} anchor="middle">
						{String(t)}
					</Label>
				</g>
			))}
			<Rack x={213} y={190} h={44} w={34} fault />
			<Beacon x={230} y={186} />
			<Node x={230} y={118} color={C.sky} />
			<Node x={330} y={160} color={C.line2} />
			<Node x={360} y={290} color={C.line} />
			<Flow d="M230 186 L 230 124" color={C.sky} />
			<Card x={420} y={70} w={190} h={280} />
			<Label x={436} y={94} size={11}>
				INC-0002 · CRITICAL
			</Label>
			<Label x={436} y={118} size={13} color={C.ink} weight={500}>
				UPS-2 on battery
			</Label>
			<Label x={436} y={150} size={11}>
				LIKELY CAUSE · 84 %
			</Label>
			<Label x={436} y={168} size={12} color={C.ink}>
				Feeder trip on feed A
			</Label>
			<Label x={436} y={200} size={11}>
				IMPACT
			</Label>
			<Label x={436} y={218} size={12} color={C.ink}>
				54 services · 12 customers
			</Label>
			<Label x={436} y={250} size={11}>
				SYMPTOMS DOWNSTREAM
			</Label>
			<Label x={436} y={268} size={12} color={C.muted}>
				3 remote PoPs · not counted
			</Label>
			<Chip x={436} y={300} color={C.ok}>
				2 actions · approval
			</Chip>
		</Art>
	);
}

export function SecurityArt() {
	return (
		<Art label="Physical, network and OT security layers joined into one case">
			{[
				["PHYSICAL", 80, "Badge-in · mantrap · cage door"],
				["NETWORK", 190, "WAN edge router · ACL change"],
				["OT", 300, "UPS network card · Modbus write"],
			].map(([t, y, d]) => (
				<g key={String(t)}>
					<Card x={48} y={Number(y)} w={330} h={80} />
					<Label x={66} y={Number(y) + 24} size={11}>
						{String(t)}
					</Label>
					<Label x={66} y={Number(y) + 50} size={13} color={C.ink}>
						{String(d)}
					</Label>
				</g>
			))}
			<Flow d="M300 120 C 300 160, 300 170, 300 190" color={C.fault} />
			<Beacon x={300} y={120} />
			<Beacon x={300} y={190} />
			<Flow d="M378 160 C 420 160, 420 200, 450 200" color={C.fault} delay={0.5} />
			<path d="M520 80 l 60 24 v 60 c 0 50 -60 80 -60 80 s -60 -30 -60 -80 v -60 z" fill={C.card2} stroke={C.sky} strokeWidth="1.5" />
			<path d="M496 190 l 16 16 32 -36" fill="none" stroke={C.sky} strokeWidth="3" />
			<Label x={520} y={280} size={11} anchor="middle">
				SEC-0001 · ONE CASE
			</Label>
			<Chip x={436} y={300} color={C.sky} w={168}>
				ATT&CK T1078 · T1562
			</Chip>
			<Chip x={436} y={330} color={C.sky} w={168}>
				NIST 800-61 · containment
			</Chip>
		</Art>
	);
}

export function CapacityArt() {
	const bars = [
		["Space", 0.62, 0.18],
		["Power", 0.71, 0.14],
		["Cooling", 0.58, 0.1],
		["GPUs", 0.81, 0.12],
	];
	return (
		<Art label="Capacity by dimension, split into used, held and sellable, beside the monthly power bill">
			<Label x={48} y={54} size={11}>
				SELLABLE AFTER HOLDS
			</Label>
			{bars.map(([n, u, h], i) => {
				const x = 60 + i * 80;
				return (
					<g key={String(n)}>
						<rect x={x} y={80} width="44" height="220" rx="6" fill={C.card2} stroke={C.line2} />
						<rect x={x} y={80 + 220 * (1 - Number(u) - Number(h))} width="44" height={220 * Number(h)} fill={C.warn} fillOpacity=".55" />
						<rect x={x} y={80 + 220 * (1 - Number(u))} width="44" height={220 * Number(u)} rx="0" fill={C.blue} />
						<Label x={x + 22} y={322} size={11} color={C.ink} anchor="middle">
							{String(n)}
						</Label>
						<Label x={x + 22} y={340} size={10} anchor="middle">
							{Math.round((1 - Number(u) - Number(h)) * 100)} % free
						</Label>
					</g>
				);
			})}
			<Card x={400} y={44} w={200} h={210} />
			<Label x={416} y={66} size={11}>
				POWER BILL · MONTH
			</Label>
			<Ring x={460} y={150} r={40} v={0.68} label="68%" />
			<Label x={520} y={120} size={11} color={C.ink}>
				energy
			</Label>
			<Label x={520} y={146} size={11} color={C.ink}>
				demand charge
			</Label>
			<Label x={520} y={172} size={11} color={C.fault}>
				idle block 310 kW
			</Label>
			<Label x={416} y={236} size={12} color={C.ice} weight={500}>
				$14.2k / mo paid, not sold
			</Label>
			<Card x={400} y={272} w={200} h={88} />
			<Label x={416} y={294} size={11}>
				PER SOLD GPU-HOUR
			</Label>
			<Label x={416} y={322} size={17} color={C.ink} weight={500}>
				$0.19 power
			</Label>
			<Label x={416} y={344} size={11}>
				of $2.40 price · 8 %
			</Label>
			<g>
				<rect x={48} y={372} width="10" height="10" fill={C.blue} />
				<Label x={64} y={381} size={10}>
					used
				</Label>
				<rect x={108} y={372} width="10" height="10" fill={C.warn} fillOpacity=".55" />
				<Label x={124} y={381} size={10}>
					held
				</Label>
				<rect x={160} y={372} width="10" height="10" fill={C.card2} stroke={C.line2} />
				<Label x={176} y={381} size={10}>
					sellable
				</Label>
			</g>
		</Art>
	);
}

export function BuildArt() {
	const gates = ["L1", "L2", "L3", "L4", "L5"];
	return (
		<Art label="Project timeline with work orders, purchase orders and commissioning gates L1 to L5">
			<Label x={48} y={54} size={11}>
				PRJ-0014 · HALL C FIT-OUT
			</Label>
			<line x1="60" y1="120" x2="580" y2="120" stroke={C.line2} />
			<line x1="60" y1="120" x2="380" y2="120" stroke={C.sky} strokeWidth="3" />
			{gates.map((g, i) => (
				<g key={g}>
					<circle cx={100 + i * 110} cy={120} r="11" fill={i < 3 ? C.sky : C.card2} stroke={C.sky} strokeWidth="1.5" />
					<Label x={100 + i * 110} y={124} size={10} color={i < 3 ? C.card : C.sky} anchor="middle" weight={500}>
						{g}
					</Label>
				</g>
			))}
			<Node x={380} y={120} glow />
			<Label x={380} y={156} size={11} color={C.ice} anchor="middle">
				today · 61 % built
			</Label>
			<Card x={48} y={190} w={170} h={110} />
			<Label x={64} y={212} size={11}>
				WORK ORDERS
			</Label>
			<Label x={64} y={240} size={17} color={C.ink} weight={500}>
				14 / 22
			</Label>
			<Label x={64} y={262} size={11}>
				done · 2 blocked on kit
			</Label>
			<Card x={236} y={190} w={170} h={110} />
			<Label x={252} y={212} size={11}>
				PURCHASE ORDERS
			</Label>
			<Label x={252} y={240} size={17} color={C.ink} weight={500}>
				9 received
			</Label>
			<Label x={252} y={262} size={11}>
				3 in transit · 1 late
			</Label>
			<Card x={424} y={190} w={176} h={110} />
			<Label x={440} y={212} size={11}>
				EARNED VALUE
			</Label>
			<Label x={440} y={240} size={17} color={C.ink} weight={500}>
				CPI 0.97
			</Label>
			<Label x={440} y={262} size={11}>
				SPI 0.91 · at risk
			</Label>
			<Chip x={48} y={330} color={C.warn} w={200}>
				L3 pre-functional · next gate
			</Chip>
		</Art>
	);
}

export function ComplianceArt() {
	const fw = ["ISO 27001", "ISO 22237", "TIA-942", "SOC 2"];
	return (
		<Art label="Compliance posture ring, frameworks and policies evaluated on the live estate">
			<Ring x={150} y={170} r={70} v={0.87} label="87%" sub="controls evidenced" />
			{fw.map((f, i) => (
				<Chip key={f} x={60 + (i % 2) * 100} y={290 + Math.floor(i / 2) * 30} color={C.sky} w={90}>
					{f}
				</Chip>
			))}
			<Card x={320} y={50} w={280} h={320} />
			<Label x={336} y={74} size={11}>
				POLICIES ON THE LIVE ESTATE
			</Label>
			{[
				["CP-01 Rack load ≤ 80 %", "3 violations", C.fault],
				["CP-02 Dual-fed devices", "pass", C.ok],
				["CP-03 Cooling N+1", "pass", C.ok],
				["CP-04 UPS ≥ 10 min", "pass", C.ok],
				["CP-06 End of support", "1 warn", C.warn],
				["CP-08 Fire inspections", "pass", C.ok],
			].map(([n, s, c], i) => (
				<g key={String(n)}>
					<circle cx={344} cy={100 + i * 40} r="4" fill={String(c)} />
					<Label x={358} y={104 + i * 40} size={12} color={C.ink}>
						{String(n)}
					</Label>
					<Label x={584} y={104 + i * 40} size={11} color={String(c)} anchor="end">
						{String(s)}
					</Label>
				</g>
			))}
		</Art>
	);
}

export function AiArt() {
	return (
		<Art label="A question to the AI assistant, an answer with its evidence and an approval-gated action">
			<Card x={60} y={60} w={340} h={48} r={24} tone="card2" />
			<Label x={84} y={89} size={13} color={C.ink}>
				Which issue is costing the most revenue?
			</Label>
			<Card x={60} y={140} w={520} h={190} />
			<Label x={80} y={166} size={11}>
				OPSTRAL AI · GROUNDED IN YOUR ESTATE
			</Label>
			<Label x={80} y={192} size={13} color={C.ink} weight={500}>
				INC-0002 UPS-2 on battery at IL-DC-009 · $2,641 / h
			</Label>
			<Label x={80} y={222} size={11}>
				EVIDENCE
			</Label>
			{["Feed A lost 13:12 · ATS transferred to feed B", "54 services on busway A · 12 customers, 2 premium", "Next SLA credit tier in 3 h 9 m"].map((t, i) => (
				<g key={t}>
					<circle cx={86} cy={238 + i * 20} r="2.5" fill={C.sky} />
					<Label x={98} y={242 + i * 20} size={12} color={C.ink}>
						{t}
					</Label>
				</g>
			))}
			<Chip x={80} y={302} color={C.ok} w={210}>
				Recommended: start DG, transfer load
			</Chip>
			<Chip x={300} y={302} color={C.warn} w={120}>
				needs approval
			</Chip>
			<Label x={60} y={370} size={11}>
				Answers come from the same records the screens use. Disruptive steps wait for a person.
			</Label>
		</Art>
	);
}

export function ColocationArt() {
	return (
		<Art label="A tenant cabinet measured from the outside: power at the PDU, inlet temperature and the cage door">
			<rect x={200} y={60} width="130" height="300" rx="8" fill={C.card2} stroke={C.line2} />
			{Array.from({ length: 8 }, (_, i) => (
				<line key={i} x1="214" y1={86 + i * 34} x2="316" y2={86 + i * 34} stroke={C.line} />
			))}
			<Label x={265} y={216} size={12} color={C.muted} anchor="middle">
				TENANT GEAR
			</Label>
			<Label x={265} y={234} size={10} color={C.muted} anchor="middle">
				sealed · never polled
			</Label>
			<path d="M256 182 h18 v-6 a9 9 0 0 0 -18 0z M250 182 h30 v20 h-30z" fill={C.sky} />
			<Card x={380} y={70} w={210} h={60} />
			<Label x={396} y={92} size={11}>
				POWER AT THE CABINET
			</Label>
			<Label x={396} y={116} size={13} color={C.ink} weight={500}>
				4.1 kW of 5 kW contracted
			</Label>
			<Flow d="M330 100 L 380 100" />
			<Card x={380} y={150} w={210} h={60} />
			<Label x={396} y={172} size={11}>
				INLET
			</Label>
			<Label x={396} y={196} size={13} color={C.ink} weight={500}>
				22.4 °C · 44 % RH
			</Label>
			<Flow d="M330 180 L 380 180" delay={0.3} />
			<Card x={380} y={230} w={210} h={60} />
			<Label x={396} y={252} size={11}>
				CAGE DOOR
			</Label>
			<Label x={396} y={276} size={13} color={C.ink} weight={500}>
				Closed · last badge 11:42
			</Label>
			<Flow d="M330 260 L 380 260" delay={0.6} />
			<Card x={380} y={310} w={210} h={60} stroke={C.fault} />
			<Label x={396} y={332} size={11} color={C.fault}>
				RIDING A CRITICAL FAULT
			</Label>
			<Label x={396} y={356} size={13} color={C.ink} weight={500}>
				UPS-2 · credits if 4 h outage
			</Label>
			<Flow d="M60 100 L 200 100" color={C.sky} />
			<Label x={60} y={86} size={11}>
				PDU-A · busway A · UPS-2
			</Label>
		</Art>
	);
}

export function NeocloudArt() {
	return (
		<Art label="A GPU node with its job, cooling loop and the power cost per sold GPU-hour">
			<Card x={48} y={60} w={260} h={200} />
			<Label x={64} y={84} size={11}>
				GPU-003 · DGX H100 · 8 GPUs
			</Label>
			{Array.from({ length: 8 }, (_, i) => (
				<rect key={i} x={64 + (i % 4) * 58} y={100 + Math.floor(i / 4) * 58} width="48" height="48" rx="6" fill={i === 3 ? C.fault : C.card2} stroke={i === 3 ? C.fault : C.line2} />
			))}
			<Beacon x={262} y={102} />
			<Label x={64} y={236} size={11} color={C.warn}>
				CDU-1 flow 62 % · thermal slowdown
			</Label>
			<Flow d="M308 160 C 340 160, 340 120, 380 120" color={C.fault} />
			<Card x={380} y={80} w={220} h={80} />
			<Label x={396} y={102} size={11}>
				JOB llm-pretrain-34b
			</Label>
			<Label x={396} y={128} size={13} color={C.ink} weight={500}>
				Stalled · 152 GPUs · QuantLedger AI
			</Label>
			<Label x={396} y={148} size={11} color={C.fault}>
				$625 / h · checkpoint 52 min ago
			</Label>
			<Card x={380} y={180} w={220} h={80} />
			<Label x={396} y={202} size={11}>
				POWER PER SOLD GPU-HOUR
			</Label>
			<Label x={396} y={230} size={17} color={C.ink} weight={500}>
				$0.19 of $2.40
			</Label>
			<Label x={396} y={250} size={11}>
				PUE 1.32 · tariff $0.071 / kWh
			</Label>
			<Card x={48} y={290} w={552} h={80} />
			<Label x={68} y={314} size={11}>
				NEVER READ
			</Label>
			<Label x={68} y={340} size={13} color={C.ink}>
				The job&apos;s data, model weights and code. Telemetry and job state only.
			</Label>
		</Art>
	);
}

/** Registry so data files can name an illustration. */
export const ART: Record<string, () => React.JSX.Element> = {
	hero: HeroArt,
	"command-center": CommandCenterArt,
	datacenters: TwinArt,
	facilities: FacilitiesArt,
	"gpu-fleet": GpuArt,
	"alarms-incidents": AlarmsArt,
	"revenue-impact": RevenueArt,
	"security-ops": SecurityArt,
	"capacity-power-economics": CapacityArt,
	planner: PlannerArt,
	dcim: DcimArt,
	"build-delivery": BuildArt,
	compliance: ComplianceArt,
	"opstral-ai": AiArt,
	colocation: ColocationArt,
	neocloud: NeocloudArt,
};

export function ArtFor({ id, className }: { id: string; className?: string }) {
	const Comp = ART[id] ?? HeroArt;
	return (
		<div className={className}>
			<Comp />
		</div>
	);
}
