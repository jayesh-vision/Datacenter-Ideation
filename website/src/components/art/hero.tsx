"use client";

import { useEffect, useRef, useState } from "react";
import { C, Chip, Label, Person } from "./kit";

/**
 * Hero scene: one isometric hall that moves through the lifecycle, three narrated steps per phase.
 *   Plan     – blueprint draws and is scanned · CapEx and payback count up · approval path ticks
 *   Build    – racks rise under a change request · orders and work orders fill · commissioning gates light
 *   Operate  – alarm fires on a rack · impact runs to customers and cost · cause and action
 * The svg carries `ph-<phase>` and `st-<step>`; elements with `at-1` / `at-2` appear from that step on.
 * Reduced motion holds the last Operate step.
 */
const PHASES = ["plan", "build", "operate"] as const;
type Phase = (typeof PHASES)[number];
const STEP_MS = 1500;
const STEPS = 3;

const STORY: Record<Phase, string[]> = {
	plan: ["Sizing hall C: 96 racks, 2.0 MW, from the capacity you can sell", "Pricing it: CapEx, payback and the phased schedule", "Routing approval by CapEx band, with the plan pack attached"],
	build: ["Installing racks as records, each under change request CHG-2041", "Receiving purchase orders and closing work orders on site", "Commissioning L1 → L5, then handing over to operations"],
	operate: ["13:12 · UPS-2 on battery. Alarm scoped to the site, incident opened", "Impact in seconds: 12 customers, 2 premium, $2,641 an hour", "Likely cause 84 %: feeder trip. Action: start DG, with approval"],
};

const iso = (x: number, y: number, z: number): [number, number] => [205 + (x - y) * 0.86, 222 + (x + y) * 0.5 - z];
const pts = (p: [number, number][]) => p.map((q) => q.join(",")).join(" ");

function Box({ x, y, w, d, h, className, style, top = C.card2, stroke = C.line2 }: { x: number; y: number; w: number; d: number; h: number; className?: string; style?: React.CSSProperties; top?: string; stroke?: string }) {
	const p = [iso(x, y, 0), iso(x + w, y, 0), iso(x + w, y + d, 0), iso(x, y + d, 0), iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d, h), iso(x, y + d, h)];
	return (
		<g className={className} style={style} stroke={stroke} strokeWidth="1">
			<polygon points={pts([p[3], p[2], p[6], p[7]])} fill={C.card} />
			<polygon points={pts([p[1], p[2], p[6], p[5]])} fill="#0b1527" />
			<polygon points={pts([p[4], p[5], p[6], p[7]])} fill={top} className="hx-top" />
		</g>
	);
}

/** Counts from 0 to `to` while `on`, eased. */
function useCount(to: number, on: boolean, ms = 1100) {
	const [v, setV] = useState(on ? to : 0);
	const raf = useRef(0);
	useEffect(() => {
		cancelAnimationFrame(raf.current);
		if (!on) {
			setV(0);
			return;
		}
		const t0 = performance.now();
		const tick = (t: number) => {
			const p = Math.min(1, (t - t0) / ms);
			setV(to * (1 - Math.pow(1 - p, 3)));
			if (p < 1) raf.current = requestAnimationFrame(tick);
		};
		raf.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf.current);
	}, [to, on, ms]);
	return v;
}

const RACKS = Array.from({ length: 12 }, (_, i) => ({ r: Math.floor(i / 6), c: i % 6 }));
const rackXY = (r: number, c: number) => ({ x: -108 + c * 38, y: r === 0 ? -50 : 20 });
const FAULT = { r: 0, c: 3 };

export function HeroArt() {
	const [phase, setPhase] = useState<Phase>("operate");
	const [step, setStep] = useState(STEPS - 1);
	const [live, setLive] = useState(false);

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		setLive(true);
		setPhase("plan");
		setStep(0);
		let n = 0;
		const t = setInterval(() => {
			n = (n + 1) % (PHASES.length * STEPS);
			setPhase(PHASES[Math.floor(n / STEPS)]);
			setStep(n % STEPS);
		}, STEP_MS);
		return () => clearInterval(t);
	}, []);

	const capex = useCount(18.4, phase === "plan" && step >= 1);
	const built = useCount(61, phase === "build" && step >= 1);
	const cost = useCount(2641, phase === "operate" && step >= 1);

	const fx = rackXY(FAULT.r, FAULT.c);
	const [bx, by] = iso(fx.x + 12, fx.y + 13, 42);
	const [ux, uy] = iso(153, 88, 0);
	const floor = pts([iso(-120, -76, 0), iso(172, -76, 0), iso(172, 92, 0), iso(-120, 92, 0)]);
	const aisle = pts([iso(-112, -18, 0.5), iso(126, -18, 0.5), iso(126, 14, 0.5), iso(-112, 14, 0.5)]);
	const bus = `M${iso(-112, -56, 46).join(" ")} L ${iso(153, -56, 46).join(" ")} L ${iso(153, 62, 46).join(" ")}`;
	const scanA = iso(-120, -76, 0);
	const scanB = iso(-120, 92, 0);
	const installing = step === 0 ? Math.min(11, Math.floor(((Date.now() / 1) % STEP_MS) / (STEP_MS / 12))) : 11;

	return (
		<figure className="art art-hero" role="img" aria-label="An isometric datacenter hall moving through plan, build and operate: blueprint and costing, racks rising under change control, then a live fault with its customers, cost and next action">
			<svg viewBox="0 0 640 420" preserveAspectRatio="xMidYMid meet" fontFamily="var(--font-text), Inter, sans-serif" className={`hx ph-${phase} st-${step}${live ? " hx-live" : ""}`}>
				<defs>
					<pattern id="hx-grid" width="32" height="32" patternUnits="userSpaceOnUse">
						<path d="M32 0H0V32" fill="none" stroke="#1a2b4a" strokeWidth="1" />
					</pattern>
					<radialGradient id="hx-glow" cx="50%" cy="50%" r="50%">
						<stop offset="0" stopColor={C.blue} stopOpacity=".45" />
						<stop offset="1" stopColor={C.blue} stopOpacity="0" />
					</radialGradient>
					<linearGradient id="hx-bar" x1="0" x2="1">
						<stop offset="0" stopColor={C.blue} />
						<stop offset="1" stopColor={C.sky} />
					</linearGradient>
					<linearGradient id="hx-scan" x1="0" x2="1">
						<stop offset="0" stopColor={C.sky} stopOpacity="0" />
						<stop offset="1" stopColor={C.sky} stopOpacity=".9" />
					</linearGradient>
				</defs>
				<rect width="640" height="420" fill="url(#hx-grid)" opacity=".7" />

				{/* stage tabs: three equal segments across the canvas */}
				{PHASES.map((p, i) => {
					const x = 24 + i * 200,
						w = 192;
					return (
						<g key={p} className={`hx-tab${phase === p ? " is-on" : ""}`} transform={`translate(${x} 18)`}>
							<rect x="0" y="0" width={w} height="34" rx="9" className="hx-tab-bg" />
							<circle cx="18" cy="17" r="9" className="hx-tab-dot" />
							<text x="18" y="20.5" fontSize="9.5" textAnchor="middle" fontWeight="500" className="hx-tab-num">
								{i + 1}
							</text>
							<text x="34" y="21" fontSize="12" fontWeight="500" letterSpacing=".06em" className="hx-tab-txt">
								{p.toUpperCase()}
							</text>
							<rect x="0" y="40" width={w} height="2" rx="1" fill={C.line} />
							{phase === p && live && <rect key={`${phase}-${step}`} x={(w / STEPS) * step} y="40" width={w / STEPS} height="2" rx="1" fill={C.sky} className="hx-prog" style={{ animationDuration: `${STEP_MS}ms` }} />}
							{phase === p && step > 0 && <rect x="0" y="40" width={(w / STEPS) * step} height="2" rx="1" fill={C.sky} />}
						</g>
					);
				})}

				{/* scene glow + floor */}
				<ellipse cx="205" cy="240" rx="170" ry="84" fill="url(#hx-glow)" className="hx-glow" />
				<polygon points={floor} fill={C.card} stroke={C.line2} />
				<polygon points={floor} fill="none" stroke={C.sky} strokeDasharray="5 5" className="hx-bp hx-bp-outline" />
				<polygon points={aisle} fill={C.blue} fillOpacity=".14" stroke={C.sky} strokeOpacity=".5" className="hx-aisle" />

				{/* blueprint footprints + scan line (plan) */}
				{RACKS.map(({ r, c }, i) => {
					const { x, y } = rackXY(r, c);
					return <polygon key={`bp${r}${c}`} points={pts([iso(x, y, 0.5), iso(x + 24, y, 0.5), iso(x + 24, y + 26, 0.5), iso(x, y + 26, 0.5)])} fill={C.blue} fillOpacity=".12" stroke={C.sky} strokeDasharray="3 3" className="hx-bp hx-bp-fp" style={{ ["--i" as string]: i }} />;
				})}
				<g className="hx-bp hx-scan">
					<line x1={scanA[0]} y1={scanA[1]} x2={scanB[0]} y2={scanB[1]} stroke={C.sky} strokeOpacity=".18" strokeWidth="14" strokeLinecap="round" />
					<line x1={scanA[0]} y1={scanA[1]} x2={scanB[0]} y2={scanB[1]} stroke={C.sky} strokeOpacity=".9" strokeWidth="1.5" />
				</g>

				{/* busway (build step 1 +) and UPS */}
				<path d={bus} fill="none" stroke={C.sky} strokeWidth="2" className="hx-bus" />
				<Box x={140} y={62} w={26} d={26} h={30} className="hx-rack hx-ups" style={{ ["--i" as string]: 12 }} />
				<text x={ux + 26} y={uy - 10} fontSize="9.5" fill={C.ice} className="hx-rack" style={{ ["--i" as string]: 12 }}>
					UPS-2
				</text>

				{/* racks */}
				{RACKS.map(({ r, c }, i) => {
					const { x, y } = rackXY(r, c);
					const fault = r === FAULT.r && c === FAULT.c;
					const led = iso(x + 21, y + 2, 9 + (i % 3) * 9);
					return (
						<g key={`rk${r}${c}`}>
							<Box x={x} y={y} w={24} d={26} h={40} className={`hx-rack${fault ? " is-fault" : ""}`} style={{ ["--i" as string]: i }} />
							<circle cx={led[0]} cy={led[1]} r="1.7" fill={fault ? C.fault : C.ok} className="hx-led" style={{ ["--i" as string]: i }} />
						</g>
					);
				})}

				{/* change-request tag that follows the racks as they rise (build step 0) */}
				<g className="hx-cr" style={{ ["--n" as string]: installing }}>
					{RACKS.map(({ r, c }, i) => {
						const { x, y } = rackXY(r, c);
						const [tx, ty] = iso(x + 12, y + 13, 70);
						return (
							<g key={`cr${i}`} className="hx-cr-tag" style={{ ["--i" as string]: i }}>
								<rect x={tx - 30} y={ty - 24} width="60" height="16" rx="8" fill={C.card2} stroke={C.sky} strokeOpacity=".8" />
								<text x={tx} y={ty - 13} fontSize="8.5" fill={C.ice} textAnchor="middle" fontWeight="500">
									CHG-2041
								</text>
								<line x1={tx} y1={ty - 8} x2={tx} y2={ty + 2} stroke={C.sky} />
							</g>
						);
					})}
				</g>

				{/* fault beacon + chain (operate) */}
				<g className="hx-op">
					<circle cx={bx} cy={by} r="6" fill={C.fault} className="art-beacon" />
					<circle cx={bx} cy={by} r="6" fill={C.fault} className="art-beacon" style={{ animationDelay: ".9s" }} />
					<circle cx={bx} cy={by} r="4" fill={C.fault} />
				</g>
				<g className="hx-chain">
					<path d={`M${bx} ${by} C ${bx + 30} ${by - 70}, 330 72, 394 104`} fill="none" stroke={C.fault} strokeWidth="2" strokeDasharray="7 11" className="art-flow" />
				</g>

				{/* readout panel */}
				<rect x="400" y="70" width="216" height="288" rx="16" fill={C.card} stroke={C.line2} />
				<rect x="400" y="70" width="216" height="288" rx="16" fill="none" stroke={C.sky} strokeOpacity=".7" className="hx-panel-ring" />

				{/* PLAN readout */}
				<g className="hx-card" data-ph="plan">
					<Label x={418} y={96} size={10} color={C.sky} weight={500}>
						PLAN · HALL C
					</Label>
					<Label x={418} y={120} size={12} color={C.ink}>
						96 racks · 2.0 MW · 4 phases
					</Label>
					<Label x={418} y={135} size={9.5}>
						Tier III · 12 kW per rack · liquid-ready rows
					</Label>
					<g className="at-1">
						<Label x={418} y={160} size={22} color={C.ink} weight={500}>
							${capex.toFixed(1)}M
						</Label>
						<Label x={508} y={160} size={11}>
							CapEx
						</Label>
						<Label x={418} y={178} size={11.5} color={C.ink}>
							4.1 y payback · NPV positive
						</Label>
						{[
							["Design", 0, 40],
							["Permits", 30, 32],
							["Civil & MEP", 52, 64],
							["Fit-out", 104, 48],
						].map(([n, x, w], i) => (
							<g key={String(n)}>
								<rect x={418 + Number(x)} y={190 + i * 14} width={Number(w)} height="6" rx="3" fill={i === 3 ? C.ok : "url(#hx-bar)"} className="hx-grow" style={{ ["--i" as string]: i }} />
								<Label x={418 + Number(x) + Number(w) + 6} y={196 + i * 14} size={9}>
									{String(n)}
								</Label>
							</g>
						))}
					</g>
					<g className="at-2">
						<Label x={418} y={266} size={10}>
							APPROVAL PATH · BAND C
						</Label>
						{["Site lead", "Engineering", "Finance"].map((n, i) => (
							<g key={n} className="hx-tick" style={{ ["--i" as string]: i }}>
								<circle cx={426} cy={286 + i * 20} r="6" fill={i < 2 ? C.ok : C.card2} stroke={i < 2 ? C.ok : C.line2} />
								{i < 2 && <path d={`M${422.5} ${286 + i * 20} l 2.5 2.5 4.5 -5`} fill="none" stroke={C.card} strokeWidth="1.6" />}
								<Label x={440} y={290 + i * 20} size={11} color={C.ink}>
									{n}
								</Label>
							</g>
						))}
						<g className="hx-tick" style={{ ["--i" as string]: 3 }}>
							<Chip x={418} y={330} color={C.sky} w={96}>
								plan pack ready
							</Chip>
						</g>
					</g>
				</g>

				{/* BUILD readout */}
				<g className="hx-card" data-ph="build">
					<Label x={418} y={96} size={10} color={C.sky} weight={500}>
						BUILD · PRJ-0014
					</Label>
					<Label x={418} y={120} size={12} color={C.ink}>
						12 racks installing · CHG-2041
					</Label>
					<Label x={418} y={135} size={9.5}>
						crew window today · kit on site
					</Label>
					<g className="at-1">
						<Label x={418} y={154} size={22} color={C.ink} weight={500}>
							{Math.round(built)} %
						</Label>
						<Label x={476} y={154} size={11}>
							built · on plan
						</Label>
						{[
							["Purchase orders", 0.69, "9 of 13 received", 176],
							["Work orders", 0.64, "14 of 22 done", 218],
						].map(([n, v, t, y], i) => (
							<g key={String(n)}>
								<Label x={418} y={Number(y)} size={11} color={C.ink}>
									{String(n)}
								</Label>
								<rect x={418} y={Number(y) + 7} width="180" height="5" rx="2.5" fill={C.line} />
								<rect x={418} y={Number(y) + 7} width={180 * Number(v)} height="5" rx="2.5" fill="url(#hx-bar)" className="hx-grow" style={{ ["--i" as string]: i }} />
								<Label x={418} y={Number(y) + 24} size={9.5}>
									{String(t)}
								</Label>
							</g>
						))}
					</g>
					<g className="at-2">
						<Label x={418} y={266} size={10}>
							COMMISSIONING
						</Label>
						<line x1="424" y1="288" x2="592" y2="288" stroke={C.line2} />
						<line x1="424" y1="288" x2="508" y2="288" stroke={C.sky} strokeWidth="2.5" className="hx-gateline" />
						{["L1", "L2", "L3", "L4", "L5"].map((g, i) => (
							<g key={g} className={i < 3 ? "hx-tick" : undefined} style={{ ["--i" as string]: i }}>
								<circle cx={424 + i * 42} cy={288} r="7" fill={i < 3 ? C.sky : C.card2} stroke={C.sky} />
								<Label x={424 + i * 42} y={308} size={9} anchor="middle">
									{g}
								</Label>
							</g>
						))}
						<g className="hx-tick" style={{ ["--i" as string]: 3 }}>
							<Chip x={418} y={330} color={C.sky} w={132}>
								every write has a CR
							</Chip>
						</g>
					</g>
				</g>

				{/* OPERATE readout */}
				<g className="hx-card" data-ph="operate">
					<Label x={418} y={96} size={10} color={C.fault} weight={500}>
						OPERATE · INC-0002 · CRITICAL
					</Label>
					<Label x={418} y={120} size={14} color={C.ink} weight={500}>
						UPS-2 on battery
					</Label>
					<Label x={418} y={136} size={10}>
						13:12 · scope: site · feed A lost
					</Label>
					<g className="at-1">
						<Label x={418} y={164} size={10}>
							WHO IS AFFECTED
						</Label>
						<g className="hx-tick" style={{ ["--i" as string]: 0 }}>
							<Person x={426} y={176} color={C.fault} />
						</g>
						<g className="hx-tick" style={{ ["--i" as string]: 1 }}>
							<Person x={444} y={176} />
						</g>
						<g className="hx-tick" style={{ ["--i" as string]: 2 }}>
							<Person x={462} y={176} />
						</g>
						<Label x={478} y={188} size={12} color={C.ink}>
							12 customers
						</Label>
						<Label x={478} y={203} size={10.5}>
							2 premium · credits due
						</Label>
						<Label x={418} y={226} size={10}>
							WHAT IT COSTS
						</Label>
						<Label x={418} y={249} size={20} color={C.warn} weight={500}>
							${Math.round(cost).toLocaleString("en-US")} / h
						</Label>
						<Label x={418} y={265} size={10}>
							next credit tier in 3 h 9 m
						</Label>
					</g>
					<g className="at-2">
						<Label x={418} y={288} size={10}>
							LIKELY CAUSE · 84 %
						</Label>
						<Label x={418} y={303} size={12} color={C.ink}>
							Feeder trip on utility feed A
						</Label>
						<g className="hx-tick" style={{ ["--i" as string]: 1 }}>
							<rect x={418} y={313} width="13" height="13" rx="3" fill={C.ok} />
							<path d="M421 319.5l3 3 5.5 -6.5" fill="none" stroke={C.card} strokeWidth="1.8" />
							<Label x={438} y={324} size={12} color={C.ink} weight={500}>
								Start DG, transfer load
							</Label>
						</g>
						<g className="hx-tick" style={{ ["--i" as string]: 2 }}>
							<Chip x={418} y={330} color={C.warn} w={96}>
								needs approval
							</Chip>
							<Chip x={522} y={330} color={C.ok} w={76}>
								&lt; 60 s
							</Chip>
						</g>
					</g>
				</g>

				{/* narrated message, full width */}
				<rect x="24" y="372" width="592" height="32" rx="9" fill={C.card2} stroke={C.line2} />
				<circle cx="42" cy="388" r="3.5" fill={phase === "operate" ? C.fault : C.sky} className="hx-msg-dot" />
				<text key={`${phase}-${step}`} x="56" y="392.5" fontSize="11.5" fill={C.ink} className="hx-msg">
					{STORY[phase][step]}
				</text>
			</svg>
		</figure>
	);
}
