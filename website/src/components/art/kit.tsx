import type { ReactNode } from "react";

/**
 * Illustration kit: every concept drawing on the site is built from these primitives on one
 * 640 × 420 canvas, so the drawings read as one family. Colours are fixed here (the drawings
 * always sit on the navy panel), never from page CSS.
 */
export const C = {
	line: "#24395f",
	line2: "#345082",
	blue: "#1c81ef",
	sky: "#60a5fa",
	ice: "#bfdbfe",
	ink: "#eef2f8",
	muted: "#8aa0c2",
	card: "#0e1a30",
	card2: "#13223d",
	fault: "#f87171",
	warn: "#fbbf24",
	ok: "#34d399",
};

export function Art({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
	return (
		<figure className={`art ${className}`} role="img" aria-label={label}>
			<svg viewBox="0 0 640 420" preserveAspectRatio="xMidYMid meet" fontFamily="var(--font-text), Inter, sans-serif">
				<defs>
					<pattern id="art-grid" width="32" height="32" patternUnits="userSpaceOnUse">
						<path d="M32 0H0V32" fill="none" stroke="#1a2b4a" strokeWidth="1" />
					</pattern>
					<radialGradient id="art-glow" cx="50%" cy="50%" r="50%">
						<stop offset="0" stopColor={C.blue} stopOpacity=".35" />
						<stop offset="1" stopColor={C.blue} stopOpacity="0" />
					</radialGradient>
					<linearGradient id="art-bar" x1="0" x2="1">
						<stop offset="0" stopColor={C.blue} />
						<stop offset="1" stopColor={C.sky} />
					</linearGradient>
				</defs>
				<rect width="640" height="420" fill="url(#art-grid)" opacity=".7" />
				{children}
			</svg>
		</figure>
	);
}

/** Glass card. */
export const Card = ({ x, y, w, h, r = 12, tone = "card", stroke = C.line2 }: { x: number; y: number; w: number; h: number; r?: number; tone?: "card" | "card2"; stroke?: string }) => (
	<rect x={x} y={y} width={w} height={h} rx={r} fill={C[tone]} stroke={stroke} strokeWidth="1.2" />
);

export const Label = ({ x, y, children, size = 12, color = C.muted, weight = 400, anchor = "start" }: { x: number; y: number; children: ReactNode; size?: number; color?: string; weight?: number; anchor?: "start" | "middle" | "end" }) => (
	<text x={x} y={y} fontSize={size} fill={color} fontWeight={weight} textAnchor={anchor}>
		{children}
	</text>
);

/** Animated flow line (dashes travel along the path). */
export const Flow = ({ d, color = C.sky, width = 2, delay = 0 }: { d: string; color?: string; width?: number; delay?: number }) => (
	<g>
		<path d={d} fill="none" stroke={C.line2} strokeWidth={width} />
		<path d={d} fill="none" stroke={color} strokeWidth={width} className="art-flow" style={{ animationDelay: `${delay}s` }} />
	</g>
);

export const Node = ({ x, y, r = 6, color = C.sky, glow = false }: { x: number; y: number; r?: number; color?: string; glow?: boolean }) => (
	<g>
		{glow && <circle cx={x} cy={y} r={r * 3} fill="url(#art-glow)" />}
		<circle cx={x} cy={y} r={r} fill={C.card} stroke={color} strokeWidth="2" />
		<circle cx={x} cy={y} r={r / 2.4} fill={color} />
	</g>
);

/** Pulsing fault beacon. */
export const Beacon = ({ x, y, color = C.fault }: { x: number; y: number; color?: string }) => (
	<g>
		<circle cx={x} cy={y} r="5" fill={color} className="art-beacon" />
		<circle cx={x} cy={y} r="5" fill={color} className="art-beacon" style={{ animationDelay: ".8s" }} />
		<circle cx={x} cy={y} r="4" fill={color} />
	</g>
);

/** A rack glyph with U-lines and front LEDs. */
export function Rack({ x, y, w = 34, h = 86, leds = [C.ok, C.ok, C.ok, C.ok], fault = false }: { x: number; y: number; w?: number; h?: number; leds?: string[]; fault?: boolean }) {
	const rows = 5;
	return (
		<g>
			<rect x={x} y={y} width={w} height={h} rx="4" fill={C.card2} stroke={fault ? C.fault : C.line2} strokeWidth="1.2" />
			{Array.from({ length: rows }, (_, i) => {
				const yy = y + 8 + (i * (h - 16)) / rows;
				return (
					<g key={i}>
						<rect x={x + 5} y={yy} width={w - 10} height={(h - 16) / rows - 4} rx="1.5" fill={C.card} stroke={C.line} />
						<circle cx={x + w - 9} cy={yy + ((h - 16) / rows - 4) / 2} r="1.6" fill={leds[i % leds.length]} />
					</g>
				);
			})}
		</g>
	);
}

/** Ring gauge (0–1). */
export function Ring({ x, y, r = 34, v, color = C.sky, label, sub }: { x: number; y: number; r?: number; v: number; color?: string; label?: string; sub?: string }) {
	const c = 2 * Math.PI * r;
	return (
		<g>
			<circle cx={x} cy={y} r={r} fill="none" stroke={C.line} strokeWidth="7" />
			<circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${x} ${y})`} className="art-ring" />
			{label && (
				<Label x={x} y={y + 6} size={r / 1.8} color={C.ink} weight={500} anchor="middle">
					{label}
				</Label>
			)}
			{sub && (
				<Label x={x} y={y + r + 18} size={11} anchor="middle">
					{sub}
				</Label>
			)}
		</g>
	);
}

/** Horizontal bar with a label on the left and a value on the right. */
export function Bar({ x, y, w, v, label, value, color = "url(#art-bar)" }: { x: number; y: number; w: number; v: number; label: string; value: string; color?: string }) {
	return (
		<g>
			<Label x={x} y={y - 6} size={11} color={C.ink}>
				{label}
			</Label>
			<Label x={x + w} y={y - 6} size={11} color={C.ice} anchor="end" weight={500}>
				{value}
			</Label>
			<rect x={x} y={y} width={w} height="6" rx="3" fill={C.line} />
			<rect x={x} y={y} width={w * v} height="6" rx="3" fill={color} className="art-grow" />
		</g>
	);
}

export const Chip = ({ x, y, children, color = C.sky, w }: { x: number; y: number; children: string; color?: string; w?: number }) => {
	const width = w ?? children.length * 6.4 + 18;
	return (
		<g>
			<rect x={x} y={y} width={width} height="20" rx="10" fill={color} fillOpacity=".14" stroke={color} strokeOpacity=".5" />
			<Label x={x + width / 2} y={y + 14} size={11} color={color} anchor="middle" weight={500}>
				{children}
			</Label>
		</g>
	);
};

/** Small person glyph. */
export const Person = ({ x, y, color = C.sky }: { x: number; y: number; color?: string }) => (
	<g fill={color}>
		<circle cx={x} cy={y} r="4" />
		<path d={`M${x - 7} ${y + 14} a7 7 0 0 1 14 0z`} />
	</g>
);
