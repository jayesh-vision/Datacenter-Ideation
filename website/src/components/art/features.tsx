import { Art, Beacon, C, Card, Chip, Flow, Label, Person, Ring } from "./kit";

/**
 * The five "What you get" scenes on the home page. Same canvas (640 × 420) and vocabulary as the
 * hero: a header chip, the scene, a message line. Build-up classes (`a-in`, `a-grow`, `a-draw`,
 * `a-pop`, with `--d` delays) play once the frame scrolls into view (ArtFrame adds `is-in`).
 */
const d = (s: number) => ({ ["--d" as string]: `${s}s` });

function Msg({ text, tone = C.sky }: { text: string; tone?: string }) {
	return (
		<g className="a-in" style={d(1.2)}>
			<rect x="24" y="376" width="592" height="30" rx="8" fill={C.card2} stroke={C.line2} />
			<circle cx="40" cy="391" r="3" fill={tone} className="art-dim" />
			<Label x={52} y={395} size={10.5} color={C.ink}>
				{text}
			</Label>
		</g>
	);
}

function Head({ left, right, rightTone = C.sky, w = 200, rw = 120 }: { left: string; right?: string; rightTone?: string; w?: number; rw?: number }) {
	return (
		<>
			<Chip x={24} y={16} color={C.sky} w={w}>
				{left}
			</Chip>
			{right && (
				<Chip x={616 - rw} y={16} color={rightTone} w={rw}>
					{right}
				</Chip>
			)}
		</>
	);
}

const Tick = ({ x, y, on = true, delay = 0 }: { x: number; y: number; on?: boolean; delay?: number }) => (
	<g className={on ? "a-pop" : undefined} style={on ? d(delay) : undefined}>
		<circle cx={x} cy={y} r="7" fill={on ? C.ok : C.card2} stroke={on ? C.ok : C.line2} />
		{on && <path d={`M${x - 3.5} ${y} l 2.5 2.5 5 -5.5`} fill="none" stroke={C.card} strokeWidth="1.8" />}
	</g>
);

/* ------------------------------------------------------------------ */
/* Planner: sellable capacity → blueprint and schedule → cost and approval */
/* ------------------------------------------------------------------ */
export function PlannerArt() {
	const bars: [string, number, number][] = [
		["Space", 0.62, 0.18],
		["Power", 0.71, 0.14],
		["Cooling", 0.58, 0.1],
		["GPUs", 0.81, 0.12],
	];
	const iso = (x: number, y: number, z = 0): [number, number] => [338 + (x - y) * 0.86, 146 + (x + y) * 0.5 - z];
	const P = (p: [number, number][]) => p.map((q) => q.join(",")).join(" ");
	return (
		<Art label="Planner: sellable capacity feeds a hall blueprint and schedule, priced with CapEx and payback and routed for approval">
			<Head left="PLANNER · PLN-0007 · HALL C EXPANSION" w={236} right="In review" rightTone={C.warn} rw={92} />

			{/* sellable capacity */}
			<Card x={24} y={52} w={196} h={254} />
			<Label x={40} y={74} size={10}>
				SELLABLE CAPACITY · SITE
			</Label>
			{bars.map(([n, u, h], i) => {
				const y = 92 + i * 50;
				return (
					<g key={n}>
						<Label x={40} y={y} size={11} color={C.ink}>
							{n}
						</Label>
						<Label x={204} y={y} size={10.5} color={C.ice} anchor="end" weight={500}>
							{Math.round((1 - u - h) * 100)} % free
						</Label>
						<rect x={40} y={y + 7} width="164" height="7" rx="3.5" fill={C.line} />
						<rect x={40} y={y + 7} width={164 * u} height="7" rx="3.5" fill={C.blue} className="a-grow" style={d(0.1 + i * 0.12)} />
						<rect x={40 + 164 * u} y={y + 7} width={164 * h} height="7" fill={C.warn} fillOpacity=".7" className="a-grow" style={d(0.5 + i * 0.12)} />
						<Label x={40} y={y + 27} size={9}>
							{i === 0 ? "used · held by plans and contracts · free" : i === 3 ? "idle allocations held" : ""}
						</Label>
					</g>
				);
			})}
			<Label x={40} y={294} size={9.5} color={C.muted}>
				Net of reservations, pipeline and holds
			</Label>

			<Flow d="M220 176 L 240 176" />

			{/* blueprint + schedule */}
			<polygon points={P([iso(-62, -40), iso(62, -40), iso(62, 40), iso(-62, 40)])} fill={C.card} stroke={C.sky} strokeDasharray="5 4" className="a-in" style={d(0.3)} />
			{Array.from({ length: 2 }, (_, r) =>
				Array.from({ length: 5 }, (_, c) => {
					const x = -52 + c * 22,
						y = r === 0 ? -30 : 8;
					return <polygon key={`${r}${c}`} points={P([iso(x, y, 0.5), iso(x + 16, y, 0.5), iso(x + 16, y + 20, 0.5), iso(x, y + 20, 0.5)])} fill={C.blue} fillOpacity=".16" stroke={C.sky} strokeDasharray="2.5 2.5" className="a-in" style={d(0.45 + (r * 5 + c) * 0.05)} />;
				}),
			)}
			<Label x={338} y={214} size={10} color={C.ice} anchor="middle" weight={500}>
				HALL C · 2.0 MW · 96 RACKS
			</Label>
			<Label x={248} y={240} size={10}>
				SCHEDULE · GO-LIVE Q3
			</Label>
			{[
				["Design", 0, 30, C.sky],
				["Permits", 22, 26, C.sky],
				["Civil & MEP", 40, 54, C.blue],
				["Fit-out", 82, 38, C.blue],
				["Commission", 108, 24, C.ok],
			].map(([n, x, w, c], i) => (
				<g key={String(n)}>
					<rect x={248 + Number(x)} y={250 + i * 12} width={Number(w)} height="6" rx="3" fill={String(c)} className="a-grow" style={d(0.6 + i * 0.1)} />
					<Label x={248 + Number(x) + Number(w) + 5} y={256 + i * 12} size={8.5}>
						{String(n)}
					</Label>
				</g>
			))}

			<Flow d="M428 176 L 448 176" delay={0.4} />

			{/* cost + approval */}
			<Card x={448} y={52} w={168} h={254} />
			<Label x={464} y={74} size={10}>
				BUSINESS CASE
			</Label>
			<g className="a-in" style={d(0.8)}>
				<Label x={464} y={100} size={21} color={C.ink} weight={500}>
					$18.4M
				</Label>
				<Label x={548} y={100} size={10}>
					CapEx
				</Label>
				<Label x={464} y={118} size={11} color={C.ink}>
					4.1 y payback · NPV +$6.2M
				</Label>
			</g>
			<Label x={464} y={146} size={10}>
				APPROVAL PATH · BAND C
			</Label>
			{[
				["Site lead", true],
				["Engineering", true],
				["Finance", false],
				["Committee", false],
			].map(([n, on], i) => (
				<g key={String(n)}>
					{i > 0 && <line x1="471" y1={162 + (i - 1) * 24 + 7} x2="471" y2={162 + i * 24 - 7} stroke={C.line2} />}
					<Tick x={471} y={162 + i * 24} on={Boolean(on)} delay={1 + i * 0.2} />
					<Label x={486} y={166 + i * 24} size={11} color={i === 2 ? C.ice : C.ink} weight={i === 2 ? 500 : 400}>
						{String(n)}
					</Label>
					{i === 2 && (
						<g className="a-in" style={d(1.5)}>
							<circle cx={471} cy={162 + i * 24} r="7" fill="none" stroke={C.sky} className="art-beacon" />
							<Label x={546} y={166 + i * 24} size={9} color={C.sky}>
								your turn
							</Label>
						</g>
					)}
				</g>
			))}
			<g className="a-in" style={d(1.6)}>
				<Chip x={464} y={266} color={C.sky} w={150}>
					plan pack · drawings · BoM
				</Chip>
			</g>

			<g className="a-in" style={d(1.1)}>
				<Chip x={24} y={330} color={C.ok} w={104}>
					rules: 12 pass
				</Chip>
				<Chip x={136} y={330} color={C.warn} w={96}>
					1 soft warning
				</Chip>
				<Chip x={240} y={330} color={C.sky} w={150}>
					benchmarks: 230 references
				</Chip>
			</g>
			<Msg text="Sized from sellable capacity · priced with benchmarks · routed for approval by CapEx band" />
		</Art>
	);
}

/* ------------------------------------------------------------------ */
/* DCIM: rack elevation, both PDU cords, cable path hop by hop, planned device under its CR */
/* ------------------------------------------------------------------ */
export function DcimArt() {
	const devs: [number, number, string, "live" | "sel" | "plan"][] = [
		[62, 18, "PP-F1 · patch panel", "live"],
		[84, 14, "ToR-01", "live"],
		[102, 14, "ToR-02", "live"],
		[134, 46, "GPU-021 · DGX H100", "sel"],
		[190, 46, "GPU-022 · planned", "plan"],
		[246, 40, "STG-03", "live"],
	];
	return (
		<Art label="DCIM rack elevation with devices by U, cords to PDU A and B, the cable path from a port to the cross-connect, and a planned install under its change request">
			<Head left="DCIM · RACK-A14 · GPU HALL A · 42U" w={214} right="CHG-2041 · Approved" rightTone={C.ok} rw={140} />

			{/* PDUs */}
			<rect x={34} y={52} width="12" height="250" rx="4" fill={C.card2} stroke={C.sky} />
			<rect x={236} y={52} width="12" height="250" rx="4" fill={C.card2} stroke={C.warn} />
			{Array.from({ length: 12 }, (_, i) => (
				<g key={i}>
					<circle cx={40} cy={64 + i * 21} r="1.6" fill={C.sky} fillOpacity={i === 5 ? 1 : 0.4} />
					<circle cx={242} cy={64 + i * 21} r="1.6" fill={C.warn} fillOpacity={i === 6 ? 1 : 0.4} />
				</g>
			))}
			<Label x={40} y={316} size={9} color={C.sky} anchor="middle">
				PDU-A
			</Label>
			<Label x={40} y={328} size={8.5} anchor="middle">
				UPS-2 · bus A
			</Label>
			<Label x={242} y={316} size={9} color={C.warn} anchor="middle">
				PDU-B
			</Label>
			<Label x={242} y={328} size={8.5} anchor="middle">
				UPS-1 · bus B
			</Label>

			{/* rack */}
			<rect x={64} y={52} width="158" height="250" rx="6" fill={C.card} stroke={C.line2} />
			{[42, 38, 34, 30, 26, 22, 18, 14, 10, 6].map((u, i) => (
				<Label key={u} x={74} y={66 + i * 24} size={8} anchor="middle">
					{u}
				</Label>
			))}
			{devs.map(([y, h, n, k], i) => (
				<g key={n} className="a-in" style={d(0.1 + i * 0.1)}>
					<rect x={84} y={y} width="130" height={h} rx="3" fill={k === "plan" ? "none" : C.card2} stroke={k === "sel" ? C.sky : k === "plan" ? C.sky : C.line2} strokeWidth={k === "sel" ? 1.5 : 1} strokeDasharray={k === "plan" ? "4 3" : undefined} className={k === "plan" ? "art-dim" : undefined} />
					{k === "sel" && <rect x={84} y={y} width="130" height={h} rx="3" fill={C.blue} fillOpacity=".12" />}
					<Label x={92} y={y + (h > 20 ? 14 : 10.5)} size={h > 20 ? 10 : 9} color={k === "plan" ? C.sky : C.ink}>
						{n}
					</Label>
					{k !== "plan" && h > 20 && (
						<>
							{Array.from({ length: 8 }, (_, p) => (
								<rect key={p} x={92 + p * 10} y={y + h - 11} width="7" height="5" rx="1" fill={C.card} stroke={C.line} />
							))}
							<circle cx={206} cy={y + 9} r="1.8" fill={C.ok} />
						</>
					)}
					{k === "plan" && (
						<Label x={92} y={y + 32} size={8.5} color={C.sky}>
							U18–U22 · install under CHG-2041
						</Label>
					)}
				</g>
			))}
			{/* cords */}
			<Flow d="M84 162 L 46 162 L 46 169" color={C.sky} />
			<Flow d="M214 170 L 236 170 L 236 190" color={C.warn} delay={0.3} />
			{/* cable from patch panel */}
			<Flow d="M214 71 L 262 71 L 262 96 L 280 96" color={C.ice} delay={0.6} />

			{/* cable path */}
			<Card x={280} y={52} w={336} h={110} />
			<Label x={296} y={74} size={10}>
				CABLE PATH · GPU-021 xe-0/0/3 → FAR END
			</Label>
			<line x1="306" y1="110" x2="590" y2="110" stroke={C.line2} />
			<line x1="306" y1="110" x2="590" y2="110" stroke={C.sky} strokeWidth="2" className="a-draw" style={{ ...d(0.6), ["--len" as string]: 300 }} />
			{["port", "PP-F1 · 7", "trunk T-2", "ODF rack 1", "XC-114", "far end"].map((h, i) => (
				<g key={h}>
					<g className="a-pop" style={d(0.7 + i * 0.15)}>
						<circle cx={306 + i * 56.8} cy={110} r="5" fill={i === 4 ? C.warn : C.card} stroke={i === 4 ? C.warn : C.sky} strokeWidth="1.5" />
					</g>
					<Label x={306 + i * 56.8} y={132} size={8.5} anchor="middle" color={i === 4 ? C.warn : C.muted}>
						{h}
					</Label>
				</g>
			))}
			<Label x={296} y={152} size={9} color={C.warn}>
				XC-114 re-patched by CHG-2001 · check first
			</Label>

			{/* change request */}
			<Card x={280} y={176} w={160} h={126} />
			<Label x={296} y={198} size={10}>
				CHANGE REQUEST
			</Label>
			<Label x={296} y={218} size={12} color={C.ink} weight={500}>
				CHG-2041
			</Label>
			<Label x={296} y={234} size={10} color={C.ink}>
				Install GPU-022 · U18–U22
			</Label>
			<Label x={296} y={250} size={9}>
				reserve U · install · connect 8 ports
			</Label>
			<g className="a-in" style={d(1.3)}>
				<Chip x={296} y={266} color={C.ok} w={128}>
					standard · record work
				</Chip>
			</g>

			{/* power chain */}
			<Card x={456} y={176} w={160} h={126} />
			<Label x={472} y={198} size={10}>
				POWER CHAIN
			</Label>
			{[
				["Feed A", C.sky],
				["UPS-2 · online", C.sky],
				["Busway A · 61 %", C.sky],
				["PDU-A · outlet 14", C.sky],
				["PSU1 · 420 W", C.ok],
			].map(([t, c], i) => (
				<g key={String(t)} className="a-in" style={d(0.9 + i * 0.1)}>
					<circle cx={478} cy={214 + i * 16} r="2.5" fill={String(c)} />
					{i < 4 && <line x1="478" y1={217 + i * 16} x2="478" y2={227 + i * 16} stroke={C.line2} />}
					<Label x={488} y={218 + i * 16} size={9.5} color={C.ink}>
						{String(t)}
					</Label>
				</g>
			))}

			<g className="a-in" style={d(1.1)}>
				<Chip x={24} y={340} color={C.sky} w={120}>
					U fit · budget ok
				</Chip>
				<Chip x={152} y={340} color={C.sky} w={132}>
					both cords, both sides
				</Chip>
				<Chip x={292} y={340} color={C.warn} w={150}>
					1 SPOF at site: cords on A
				</Chip>
			</g>
			<Msg text="Every write carries a change request · racks, cords and cables reconcile with the live estate" />
		</Art>
	);
}

/* ------------------------------------------------------------------ */
/* Command Center: KPI strip, health ring with four areas, live map, worst-first list */
/* ------------------------------------------------------------------ */
export function CommandCenterArt() {
	const pins: [number, number, string, string][] = [
		[262, 196, C.ok, "WA"],
		[300, 236, C.ok, "CA"],
		[330, 206, C.warn, "CO"],
		[352, 232, C.ok, "TX"],
		[372, 184, C.fault, "IL"],
		[404, 204, C.ok, "VA"],
	];
	return (
		<Art label="Command Center: critical and high counts, an operations health ring with four areas, a live map with a rippling pin on the failing site, and incidents ordered by what they cost">
			<Head left="COMMAND CENTER · 23 DATACENTERS · LIVE" w={252} right="Needs attention" rightTone={C.fault} rw={120} />

			{/* KPI strip */}
			{[
				["Critical", "1", C.fault],
				["High", "8", C.warn],
				["Past SLA", "2", C.warn],
				["Premium at risk", "3", C.sky],
			].map(([n, v, c], i) => (
				<g key={String(n)} className="a-in" style={d(i * 0.08)}>
					<Card x={24 + i * 148} y={48} w={140} h={38} r={9} tone="card2" />
					<Label x={36 + i * 148} y={72} size={18} color={String(c)} weight={500}>
						{String(v)}
					</Label>
					<Label x={66 + i * 148} y={72} size={10} color={C.ink}>
						{String(n)}
					</Label>
				</g>
			))}

			{/* health */}
			<Card x={24} y={98} w={180} h={246} />
			<Ring x={114} y={150} r={34} v={0.98} label="98" />
			<Label x={114} y={200} size={9.5} anchor="middle">
				OPERATIONS HEALTH
			</Label>
			{[
				["GPU fleet", 0.96, C.fault, "job stalled"],
				["Power", 0.984, C.fault, "UPS on battery"],
				["Cooling", 0.994, C.warn, "CRAH failed"],
				["Network", 0.996, C.ok, "links up"],
			].map(([n, v, c, w], i) => (
				<g key={String(n)} className="a-in" style={d(0.3 + i * 0.1)}>
					<circle cx={40} cy={222 + i * 32} r="3.5" fill={String(c)} />
					<Label x={50} y={226 + i * 32} size={10.5} color={C.ink}>
						{String(n)}
					</Label>
					<Label x={190} y={226 + i * 32} size={10.5} color={C.ice} anchor="end" weight={500}>
						{(Number(v) * 100).toFixed(1)} %
					</Label>
					<Label x={50} y={239 + i * 32} size={8.5} color={String(c) === C.ok ? C.muted : String(c)}>
						{String(w)}
					</Label>
				</g>
			))}

			{/* map */}
			<Card x={216} y={98} w={220} h={246} />
			<Label x={232} y={120} size={10}>
				LIVE ESTATE
			</Label>
			<path d="M236 206 C 240 176, 268 160, 300 166 C 330 150, 362 156, 392 170 C 416 176, 424 198, 414 218 C 404 244, 372 256, 342 250 C 316 258, 286 254, 262 240 C 242 232, 232 222, 236 206 Z" fill={C.card2} stroke={C.line2} />
			<path d="M372 184 L 330 206 L 300 236" fill="none" stroke={C.fault} strokeWidth="1.2" strokeDasharray="4 5" className="art-flow" opacity=".7" />
			<path d="M372 184 L 404 204" fill="none" stroke={C.sky} strokeWidth="1" strokeDasharray="3 5" opacity=".5" />
			{pins.map(([x, y, c, n], i) => (
				<g key={n} className="a-pop" style={d(0.4 + i * 0.1)}>
					{c === C.fault && (
						<>
							<circle cx={x} cy={y} r="6" fill={C.fault} className="art-beacon" />
							<circle cx={x} cy={y} r="6" fill={C.fault} className="art-beacon" style={{ animationDelay: ".9s" }} />
						</>
					)}
					<circle cx={x} cy={y} r="5" fill={c} stroke={C.card} strokeWidth="2" />
					<Label x={x} y={y + 16} size={8} anchor="middle" color={c === C.fault ? C.fault : C.muted}>
						{n}
					</Label>
				</g>
			))}
			<Label x={232} y={282} size={9}>
				IL-DC-009 · Chicago · Critical
			</Label>
			<Label x={232} y={296} size={9}>
				backhaul to CO · CA degraded
			</Label>
			<g className="a-in" style={d(1)}>
				<Chip x={232} y={310} color={C.fault} w={62}>
					1 critical
				</Chip>
				<Chip x={302} y={310} color={C.warn} w={54}>
					6 high
				</Chip>
				<Chip x={364} y={310} color={C.ok} w={56}>
					16 quiet
				</Chip>
			</g>

			{/* worst first */}
			<Card x={448} y={98} w={168} h={246} />
			<Label x={464} y={120} size={10}>
				WORST FIRST
			</Label>
			{[
				["UPS-2 on battery", "Chicago · 12 customers", "$2.6k/h", 1, C.fault],
				["Job stalled · 152 GPUs", "San Jose · 1 customer", "$625/h", 0.45, C.warn],
				["4 network cables down", "Ashburn · 3 customers", "$310/h", 0.3, C.warn],
				["CRAH-11 failed", "Dallas · exposed", "0 now", 0.12, C.sky],
			].map(([t, s, m, v, c], i) => (
				<g key={String(t)} className="a-in" style={d(0.5 + i * 0.15)}>
					<Label x={464} y={142 + i * 50} size={10.5} color={C.ink} weight={500}>
						{String(t)}
					</Label>
					<Label x={464} y={155 + i * 50} size={8.5}>
						{String(s)}
					</Label>
					<Label x={600} y={155 + i * 50} size={9.5} color={String(c)} anchor="end" weight={500}>
						{String(m)}
					</Label>
					<rect x={464} y={161 + i * 50} width="136" height="4" rx="2" fill={C.line} />
					<rect x={464} y={161 + i * 50} width={136 * Number(v)} height="4" rx="2" fill={String(c)} className="a-grow" style={d(0.7 + i * 0.15)} />
				</g>
			))}

			<g className="a-in" style={d(1.1)}>
				<Chip x={24} y={352} color={C.sky} w={176}>
					1 critical + 8 high at 7 of 23
				</Chip>
				<Chip x={208} y={352} color={C.sky} w={148}>
					every figure opens its list
				</Chip>
			</g>
			<Msg text="What is happening · who is affected · recommendations, ranked by money and customers at risk" tone={C.fault} />
		</Art>
	);
}

/* ------------------------------------------------------------------ */
/* 3D datacenter layout: iso hall with containment, heat tint, power and cable paths, rack card */
/* ------------------------------------------------------------------ */
export function TwinArt() {
	const iso = (x: number, y: number, z = 0): [number, number] => [236 + (x - y) * 0.86, 232 + (x + y) * 0.5 - z];
	const P = (p: [number, number][]) => p.map((q) => q.join(",")).join(" ");
	const box = (x: number, y: number, w: number, dd: number, h: number, key: string, opt: { top?: string; stroke?: string; cls?: string; delay?: number } = {}) => {
		const p = [iso(x, y, 0), iso(x + w, y, 0), iso(x + w, y + dd, 0), iso(x, y + dd, 0), iso(x, y, h), iso(x + w, y, h), iso(x + w, y + dd, h), iso(x, y + dd, h)];
		return (
			<g key={key} stroke={opt.stroke ?? C.line2} strokeWidth="1" className={opt.cls ?? "a-in"} style={d(opt.delay ?? 0)}>
				<polygon points={P([p[3], p[2], p[6], p[7]])} fill={C.card} />
				<polygon points={P([p[1], p[2], p[6], p[5]])} fill="#0b1527" />
				<polygon points={P([p[4], p[5], p[6], p[7]])} fill={opt.top ?? C.card2} />
			</g>
		);
	};
	const rack = (r: number, c: number) => ({ x: -112 + c * 36, y: r === 0 ? -52 : 20 });
	const sel = rack(0, 3);
	const [bx, by] = iso(sel.x + 11, sel.y + 12, 42);
	const [ux, uy] = iso(136, 70, 0);
	return (
		<Art label="3D datacenter layout: an isometric hall with cold-aisle containment, a heat tint on the floor, a rack with a fault beacon, the power path from the UPS and the cable path to the ODF, and the rack's card">
			<Head left="DATACENTER LAYOUT · LIVE · REALISTIC VIEW" w={262} right="Building › Floor 2 › GPU Hall A" rightTone={C.sky} rw={190} />

			{/* floor + heat tint */}
			<polygon points={P([iso(-124, -78), iso(160, -78), iso(160, 96), iso(-124, 96)])} fill={C.card} stroke={C.line2} />
			<ellipse cx={iso(sel.x + 11, sel.y + 12)[0]} cy={iso(sel.x + 11, sel.y + 12)[1]} rx="54" ry="26" fill={C.fault} fillOpacity=".16" className="a-in" style={d(0.9)} />
			<ellipse cx={iso(-60, 30)[0]} cy={iso(-60, 30)[1]} rx="46" ry="22" fill={C.blue} fillOpacity=".12" className="a-in" style={d(0.9)} />
			{/* cold-aisle containment */}
			<polygon points={P([iso(-116, -22, 44), iso(110, -22, 44), iso(110, 14, 44), iso(-116, 14, 44)])} fill={C.sky} fillOpacity=".06" stroke={C.sky} strokeOpacity=".35" className="a-in" style={d(0.8)} />
			{/* racks */}
			{Array.from({ length: 12 }, (_, i) => {
				const r = Math.floor(i / 6),
					c = i % 6;
				const { x, y } = rack(r, c);
				const isSel = r === 0 && c === 3;
				return box(x, y, 22, 26, 40, `r${i}`, { top: isSel ? "#2a1a2a" : C.card2, stroke: isSel ? C.fault : C.line2, delay: 0.1 + i * 0.06 });
			})}
			{Array.from({ length: 12 }, (_, i) => {
				const { x, y } = rack(Math.floor(i / 6), i % 6);
				const l = iso(x + 19, y + 2, 10 + (i % 3) * 9);
				return <circle key={`l${i}`} cx={l[0]} cy={l[1]} r="1.6" fill={i === 3 ? C.fault : C.ok} className="a-in" style={d(0.9)} />;
			})}
			{box(130, 60, 26, 26, 30, "ups", { delay: 0.5 })}
			{box(-120, 60, 22, 26, 40, "odf", { delay: 0.5 })}
			<Label x={ux + 24} y={uy - 6} size={9} color={C.ice}>
				UPS-2
			</Label>
			<Label x={iso(-120, 86)[0] - 4} y={iso(-120, 86)[1] + 14} size={9} color={C.ice} anchor="end">
				ODF rack
			</Label>
			{/* power path: busway from UPS to the rack (A, blue) */}
			<path d={`M${iso(143, 60, 46).join(" ")} L ${iso(143, -58, 46).join(" ")} L ${iso(sel.x + 11, -58, 46).join(" ")} L ${bx} ${by}`} fill="none" stroke={C.line2} strokeWidth="2" />
			<path d={`M${iso(143, 60, 46).join(" ")} L ${iso(143, -58, 46).join(" ")} L ${iso(sel.x + 11, -58, 46).join(" ")} L ${bx} ${by}`} fill="none" stroke={C.sky} strokeWidth="2" strokeDasharray="7 11" className="art-flow" />
			{/* cable path: rack top along the fibre channel to the ODF (teal) */}
			<path d={`M${bx} ${by} L ${iso(sel.x + 11, -66, 56).join(" ")} L ${iso(-112, -66, 56).join(" ")} L ${iso(-112, 60, 56).join(" ")}`} fill="none" stroke="#2dd4bf" strokeWidth="1.6" strokeDasharray="5 9" className="art-flow" style={{ animationDelay: ".5s" }} opacity=".9" />
			<Beacon x={bx} y={by} />

			{/* overlay dock */}
			<g className="a-in" style={d(1)}>
				{[
					["Health", true],
					["Temperature", true],
					["Power path", true],
					["Cable paths", true],
				].map(([t, on], i) => (
					<Chip key={String(t)} x={24 + i * 92} y={340} color={on ? C.sky : C.muted} w={84}>
						{String(t)}
					</Chip>
				))}
			</g>

			{/* rack card */}
			<Card x={432} y={52} w={184} h={190} />
			<Label x={448} y={74} size={10} color={C.fault}>
				RACK-A14 · 1 CRITICAL
			</Label>
			<Label x={448} y={94} size={12} color={C.ink} weight={500}>
				GPU Hall A · row 1 · pos 4
			</Label>
			<Label x={448} y={116} size={9.5}>
				POWER
			</Label>
			<Label x={600} y={116} size={9.5} color={C.ice} anchor="end">
				12.4 of 15 kW
			</Label>
			<rect x={448} y={121} width="152" height="4" rx="2" fill={C.line} />
			<rect x={448} y={121} width={152 * 0.83} height="4" rx="2" fill={C.sky} className="a-grow" style={d(0.8)} />
			{[
				["Fed by", "UPS-2 · busway A · PDU-A/B"],
				["Inlet", "22.1 °C · 44 % RH"],
				["Devices", "8 × DGX H100 · 2 ToR"],
				["Issue", "PSU1 failed · RMA open"],
			].map(([k, v], i) => (
				<g key={String(k)} className="a-in" style={d(0.9 + i * 0.1)}>
					<Label x={448} y={146 + i * 18} size={9}>
						{String(k).toUpperCase()}
					</Label>
					<Label x={496} y={146 + i * 18} size={9.5} color={i === 3 ? C.fault : C.ink}>
						{String(v)}
					</Label>
				</g>
			))}
			<g className="a-in" style={d(1.3)}>
				<Chip x={448} y={216} color={C.sky} w={76}>
					Open rack
				</Chip>
				<Chip x={532} y={216} color={C.sky} w={68}>
					Walk here
				</Chip>
			</g>

			<Msg text="Power path on: UPS-2 → busway A → PDU-A → RACK-A14 · cable path: PP-F1 → trunk T-2 → ODF rack" />
		</Art>
	);
}

/* ------------------------------------------------------------------ */
/* GPU Fleet: node grid with job spans, sparklines, blast radius, placement */
/* ------------------------------------------------------------------ */
export function GpuArt() {
	const spark = (x: number, y: number, w: number, h: number, pts: number[], color: string, delay: number) => {
		const step = w / (pts.length - 1);
		const dpath = pts.map((v, i) => `${i ? "L" : "M"}${x + i * step} ${y + h - v * h}`).join(" ");
		return <path d={dpath} fill="none" stroke={color} strokeWidth="1.5" className="a-draw" style={{ ...d(delay), ["--len" as string]: 200 }} />;
	};
	const nodes = ["GPU-001", "GPU-002", "GPU-003", "GPU-004", "GPU-005", "GPU-006"];
	const jobOf = (r: number) => (r < 3 ? "stalled" : r < 5 ? "inference" : "free");
	return (
		<Art label="GPU Fleet: six nodes of eight GPUs with the stalled training job highlighted and one failed GPU, telemetry sparklines, the blast radius and where the next job fits">
			<Head left="GPU FLEET · CA-DC-020 · AI-POD-1 · 48 GPUs" w={254} right="1 job stalled" rightTone={C.fault} rw={104} />

			{/* node grid */}
			<Card x={24} y={48} w={300} h={176} />
			{nodes.map((n, r) => {
				const job = jobOf(r);
				const tint = job === "stalled" ? C.warn : job === "inference" ? C.sky : C.line2;
				return (
					<g key={n} className="a-in" style={d(0.1 + r * 0.08)}>
						<Label x={36} y={70 + r * 26} size={8.5} color={C.muted}>
							{n}
						</Label>
						<rect x={82} y={58 + r * 26} width="196" height="20" rx="5" fill={tint} fillOpacity={job === "free" ? 0.06 : 0.12} stroke={tint} strokeOpacity={job === "free" ? 0.5 : 0.7} />
						{Array.from({ length: 8 }, (_, c) => {
							const fail = r === 1 && c === 4;
							return <rect key={c} x={88 + c * 24} y={62 + r * 26} width="16" height="12" rx="2.5" fill={fail ? C.fault : job === "free" ? C.card2 : tint} fillOpacity={fail ? 1 : job === "free" ? 1 : 0.55} stroke={fail ? C.fault : C.line2} className={job === "stalled" && !fail ? "art-dim" : undefined} />;
						})}
						<Label x={312} y={71 + r * 26} size={8} anchor="end" color={job === "stalled" ? C.warn : job === "inference" ? C.sky : C.muted}>
							{job === "stalled" ? "llm-34b" : job === "inference" ? "serve-7b" : "spare"}
						</Label>
					</g>
				);
			})}
			<Beacon x={192} y={94} />
			<Flow d="M192 94 C 240 60, 300 70, 340 84" color={C.fault} />

			{/* blast radius */}
			<Card x={340} y={48} w={276} h={92} />
			<Label x={356} y={70} size={10}>
				BIGGEST BLAST RADIUS · llm-pretrain-34b
			</Label>
			<g className="a-in" style={d(0.6)}>
				<Label x={356} y={96} size={20} color={C.ink} weight={500}>
					152 GPUs stopped
				</Label>
				<Label x={356} y={114} size={10}>
					by one failed GPU · Xid 79 · QuantLedger AI
				</Label>
				<Label x={356} y={130} size={10.5} color={C.fault} weight={500}>
					$625 / h lost · 52 min since the last checkpoint
				</Label>
			</g>

			{/* slowest job */}
			<Card x={340} y={150} w={276} h={74} />
			<Label x={356} y={172} size={10}>
				SLOWEST JOB · ft-13b · TX-DC-023
			</Label>
			<g className="a-in" style={d(0.8)}>
				<Label x={356} y={194} size={12} color={C.ink} weight={500}>
					144 GPUs · 24 % slower
				</Label>
				<Label x={356} y={212} size={10} color={C.warn}>
					CDU-1 flow 62 % → thermal slowdown · $190 / h
				</Label>
			</g>

			{/* telemetry */}
			<Card x={24} y={234} w={300} h={128} />
			<Label x={40} y={256} size={10}>
				PER-GPU TELEMETRY · DCGM · GPU-002 / 4
			</Label>
			{[
				["SM active", "86 → 0 %", [0.8, 0.86, 0.84, 0.88, 0.86, 0.9, 0.3, 0.02, 0.0], C.sky],
				["HBM temp", "71 °C", [0.5, 0.52, 0.56, 0.6, 0.66, 0.7, 0.72, 0.5, 0.4], C.warn],
				["Power", "650 → 90 W", [0.84, 0.86, 0.88, 0.9, 0.88, 0.92, 0.4, 0.14, 0.12], C.ice],
			].map(([n, v, pts, c], i) => (
				<g key={String(n)}>
					<Label x={40} y={278 + i * 28} size={9.5} color={C.ink}>
						{String(n)}
					</Label>
					<Label x={308} y={278 + i * 28} size={9.5} color={C.ice} anchor="end">
						{String(v)}
					</Label>
					{spark(126, 268 + i * 28, 108, 12, pts as number[], String(c), 0.6 + i * 0.2)}
				</g>
			))}
			<Label x={40} y={354} size={8.5} color={C.fault}>
				last Xid 79 · 13:12 · ECC DBE 0 · NVLink errors 0
			</Label>

			{/* placement */}
			<Card x={340} y={234} w={276} h={128} />
			<Label x={356} y={256} size={10}>
				WHERE TO PLACE THE NEXT 256 GPUs
			</Label>
			{[
				["AI-POD-3 · CA-DC-020", "312 free · liquid · power paid", "fit good", C.ok],
				["AI-POD-2 · TX-DC-023", "264 free · CDU at 88 %", "tight", C.warn],
				["AI-POD-1 · CA-DC-020", "stalled job holds 152", "no", C.fault],
			].map(([p, w, f, c], i) => (
				<g key={String(p)} className="a-in" style={d(0.9 + i * 0.12)}>
					<Label x={356} y={278 + i * 26} size={10} color={C.ink}>
						{String(p)}
					</Label>
					<Label x={356} y={290 + i * 26} size={8.5}>
						{String(w)}
					</Label>
					<Chip x={540} y={268 + i * 26} color={String(c)} w={60}>
						{String(f)}
					</Chip>
				</g>
			))}

			<Msg text="One failed GPU → one job → one customer → $625 an hour, and where the next job should go" tone={C.fault} />
		</Art>
	);
}

/* ------------------------------------------------------------------ */
/* Revenue Impact: issues ranked by cost, cost-of-delay curve with credit cliffs, reconciled totals */
/* ------------------------------------------------------------------ */
export function RevenueArt() {
	const issues: [string, string, string, number, string][] = [
		["UPS-2 on battery", "54 services · 12 customers · IL-DC-009", "$2,641 / h", 1, C.fault],
		["Job stalled · 152 GPUs", "1 cluster · QuantLedger AI · CA-DC-020", "$625 / h", 0.24, C.warn],
		["Fibre trunk · 4 cables", "3 services · VA-DC-001", "$310 / h", 0.12, C.warn],
		["CRAH-11 failed", "6 services exposed · TX-DC-004", "exposed", 0.05, C.sky],
	];
	const curve = "M356 300 L 392 290 L 428 276 L 452 262 L 470 212 L 504 198 L 524 150 L 552 140 L 590 134";
	return (
		<Art label="Revenue Impact: open issues ranked by what they cost per hour, a cost-of-delay curve with the SLA credit cliffs, and totals that reconcile across issues, customers and sites">
			<Head left="REVENUE IMPACT · OPEN ISSUES · LIVE" w={232} right="Σ reconciles" rightTone={C.ok} rw={104} />

			{/* ranked issues */}
			<Card x={24} y={52} w={312} h={262} />
			<Label x={40} y={74} size={10}>
				COSTING THE MOST RIGHT NOW · ONE ISSUE PER SERVICE
			</Label>
			{issues.map(([t, sub, m, v, c], i) => (
				<g key={t} className="a-in" style={d(0.1 + i * 0.12)}>
					<Label x={40} y={100 + i * 56} size={11} color={C.ink} weight={500}>
						{t}
					</Label>
					<Label x={320} y={100 + i * 56} size={11} color={c} anchor="end" weight={500}>
						{m}
					</Label>
					<Label x={40} y={114 + i * 56} size={8.5}>
						{sub}
					</Label>
					<rect x={40} y={122 + i * 56} width="280" height="6" rx="3" fill={C.line} />
					<rect x={40} y={122 + i * 56} width={280 * v} height="6" rx="3" fill={c} className="a-grow" style={d(0.3 + i * 0.12)} />
				</g>
			))}
			<Label x={40} y={306} size={8.5} color={C.muted}>
				Down and degraded lose now · exposed = riding a critical fault
			</Label>

			{/* cost of delay */}
			<Card x={348} y={52} w={268} h={262} />
			<Label x={364} y={74} size={10}>
				COST OF DELAY · INC-0002
			</Label>
			<line x1="356" y1="300" x2="600" y2="300" stroke={C.line2} />
			{[0, 1, 2, 3].map((h) => (
				<Label key={h} x={356 + h * 78} y={314} size={8.5} anchor={h === 0 ? "start" : "middle"}>
					{h === 0 ? "now" : `+${h} h`}
				</Label>
			))}
			<path d={curve + " L 590 300 L 356 300 Z"} fill={C.blue} fillOpacity=".1" className="a-in" style={d(0.6)} />
			<path d={curve} fill="none" stroke={C.sky} strokeWidth="2" className="a-draw" style={{ ...d(0.4), ["--len" as string]: 420 }} />
			<g className="a-in" style={d(1)}>
				<line x1="470" y1="112" x2="470" y2="300" stroke={C.warn} strokeDasharray="3 4" />
				<Label x={466} y={104} size={9} color={C.warn} anchor="end">
					25 % credit tier · 3 h 9 m
				</Label>
				<line x1="524" y1="112" x2="524" y2="300" stroke={C.fault} strokeDasharray="3 4" />
				<Label x={528} y={104} size={9} color={C.fault}>
					50 % tier
				</Label>
			</g>
			<g className="a-pop" style={d(0.5)}>
				<circle cx="356" cy="300" r="4" fill={C.sky} />
			</g>
			<Label x={364} y={240} size={9} color={C.ink}>
				lost so far $55.3k
			</Label>
			<Label x={364} y={254} size={9} color={C.warn}>
				next cliff +$1.1M in credits
			</Label>

			{/* totals */}
			{[
				["Lost so far", "$55.3k", C.ink],
				["Credits owed", "$345.9k", C.warn],
				["At stake", "$3.44M / mo", C.ink],
				["Within SLA", "88.7 %", C.ok],
			].map(([k, v, c], i) => (
				<g key={String(k)} className="a-in" style={d(0.9 + i * 0.1)}>
					<Card x={24 + i * 150} y={326} w={142} h={40} r={9} tone="card2" />
					<Label x={36 + i * 150} y={342} size={8.5}>
						{String(k).toUpperCase()}
					</Label>
					<Label x={36 + i * 150} y={358} size={12.5} color={String(c)} weight={500}>
						{String(v)}
					</Label>
				</g>
			))}
			<Msg text="Σ issues = Σ causes = Σ datacenters = Σ customers · the same money on every screen" tone={C.warn} />
		</Art>
	);
}

/* ------------------------------------------------------------------ */
/* Facilities: single-line power path with live flow, ride-through, cooling spare, SPOF what-if */
/* ------------------------------------------------------------------ */
export function FacilitiesArt() {
	const y = 128;
	const nodes: [string, number, string][] = [
		["Utility A", 56, "lost 13:12"],
		["ATS", 150, "on feed B"],
		["UPS-2", 244, "battery 62 %"],
		["Busway A", 338, "61 % load"],
		["PDU-A", 432, "rack A14"],
		["Rack", 526, "12.4 kW"],
	];
	return (
		<Art label="Facilities: the single-line power path from the utility feed to the rack with the lost feed and the standby path, ride-through figures, the cooling spare and a what-if">
			<Head left="FACILITIES · IL-DC-009 · POWER PATH · LIVE" w={262} right="Utility A lost" rightTone={C.fault} rw={112} />

			{/* path */}
			{nodes.map(([n, x, sub], i) => (
				<g key={n}>
					{i < nodes.length - 1 && <Flow d={`M${x + 30} ${y} L ${Number(nodes[i + 1][1]) - 30} ${y}`} color={i === 0 ? C.fault : C.sky} delay={i * 0.15} />}
					<g className="a-pop" style={d(0.1 + i * 0.1)}>
						<Card x={x - 30} y={y - 20} w={60} h={40} r={10} tone="card2" stroke={i === 0 ? C.fault : i === 2 ? C.warn : C.line2} />
					</g>
					<Label x={x} y={y + 4} size={10} color={C.ink} anchor="middle" weight={500}>
						{n}
					</Label>
					<Label x={x} y={y + 34} size={8.5} anchor="middle" color={i === 0 ? C.fault : i === 2 ? C.warn : C.muted}>
						{sub}
					</Label>
				</g>
			))}
			{/* standby feed B (live, into the ATS) and DG (standby) */}
			<Card x={120} y={48} w={60} h={24} r={7} tone="card2" stroke={C.ok} />
			<Label x={150} y={64} size={9} color={C.ok} anchor="middle">
				Feed B · live
			</Label>
			<Flow d="M150 72 L 150 108" color={C.ok} delay={0.3} />
			<Card x={120} y={184} w={60} h={24} r={7} tone="card2" />
			<Label x={150} y={200} size={9} anchor="middle">
				DG · standby
			</Label>
			<path d="M150 148 L 150 184" fill="none" stroke={C.line2} strokeWidth="2" strokeDasharray="3 4" />
			<Beacon x={56} y={108} />

			{/* ride-through */}
			<Card x={24} y={224} w={300} h={90} />
			<Label x={40} y={246} size={10}>
				IF UTILITY POWER FAILS NOW
			</Label>
			<Ring x={66} y={282} r={16} v={0.62} color={C.warn} />
			{[
				["UPS 14 min", "on battery · 62 %", 92],
				["DG 5 MVA", "starts in 12 s", 190],
				["Fuel 38 h", "at today's load", 262],
			].map(([a, b, x], i) => (
				<g key={String(a)} className="a-in" style={d(0.7 + i * 0.1)}>
					<Label x={Number(x)} y={280} size={12} color={C.ink} weight={500}>
						{String(a)}
					</Label>
					<Label x={Number(x)} y={296} size={8.5}>
						{String(b)}
					</Label>
				</g>
			))}

			{/* cooling + SPOF */}
			<Card x={336} y={224} w={280} h={90} />
			<Label x={352} y={246} size={10}>
				COOLING · FLOOR 2
			</Label>
			{[
				["CRAH-09", 0.72, C.sky],
				["CRAH-10", 0.68, C.sky],
				["CRAH-11", 0, C.fault],
				["CRAH-12", 0.81, C.sky],
			].map(([n, v, c], i) => (
				<g key={String(n)}>
					<rect x={352 + i * 34} y={258} width="26" height="40" rx="4" fill={C.card2} stroke={String(c)} />
					<rect x={352 + i * 34} y={258 + 40 * (1 - Number(v))} width="26" height={Math.max(0.1, 40 * Number(v))} rx="4" fill={String(c)} fillOpacity=".55" className="a-in" style={d(0.8 + i * 0.1)} />
					<Label x={365 + i * 34} y={310} size={7.5} anchor="middle" color={String(c) === C.fault ? C.fault : C.muted}>
						{String(n).replace("CRAH-", "")}
					</Label>
				</g>
			))}
			<Label x={496} y={264} size={10} color={C.warn} weight={500}>
				No spare on floor 2
			</Label>
			<Label x={496} y={278} size={8.5}>
				heat 1.6 MW · capacity 1.7 MW
			</Label>
			<Label x={496} y={296} size={8.5} color={C.ink}>
				What-if UPS-2 down:
			</Label>
			<Label x={496} y={308} size={8.5} color={C.fault}>
				18 racks dark · 9 customers
			</Label>

			<g className="a-in" style={d(1.1)}>
				<Chip x={24} y={330} color={C.fault} w={132}>
					3 SPOFs at this site
				</Chip>
				<Chip x={164} y={330} color={C.warn} w={176}>
					both cords on A · RACK-B07, B12
				</Chip>
				<Chip x={348} y={330} color={C.sky} w={160}>
					PM: UPS-2 battery · 14 Nov
				</Chip>
			</g>
			<Msg text="Every node traces up- and downstream · ride-through, cooling spare and what-if per asset" tone={C.fault} />
		</Art>
	);
}
