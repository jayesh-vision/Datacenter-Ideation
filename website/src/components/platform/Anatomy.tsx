"use client";

import { useEffect, useRef, useState } from "react";
import { ArtFor } from "@/components/art";
import type { Capability } from "@/data/modules";

const STEP_MS = 4200;

/**
 * "What the screen holds": the module's illustration beside its main capabilities (those with an
 * `area`). The active capability's panel is spotlighted on the drawing (the rest dims, a frame glides
 * to it) and its text opens in the list. While the section is in view it steps through the
 * capabilities on its own; once the visitor points at an item it stays where they put it.
 * No numbers or markers on the drawing (user, 29-Oct-2026).
 */
export function Anatomy({ art, items }: { art: string; items: Capability[] }) {
	const shown = items.filter((c) => c.area);
	const [on, setOn] = useState(0);
	const [auto, setAuto] = useState(true);
	const [inView, setInView] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setAuto(false);
		const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
		io.observe(el);
		return () => io.disconnect();
	}, []);

	useEffect(() => {
		if (!auto || !inView || shown.length < 2) return;
		const t = setInterval(() => setOn((i) => (i + 1) % shown.length), STEP_MS);
		return () => clearInterval(t);
	}, [auto, inView, shown.length]);

	const pick = (i: number) => {
		setAuto(false);
		setOn(i);
	};
	const [x, y, w, h] = shown[on]?.area ?? [0, 0, 640, 420];
	const pct = (v: number, of: number) => `${(v / of) * 100}%`;

	return (
		<div ref={ref} className={`anatomy${auto && inView ? " is-auto" : ""}`}>
			<div className="an-art">
				<ArtFor id={art} />
				<div className="an-spot" aria-hidden="true" style={{ left: pct(x, 640), top: pct(y, 420), width: pct(w, 640), height: pct(h, 420) }} />
			</div>
			<ol className="an-list">
				{shown.map((c, i) => (
					<li key={c.title}>
						<button type="button" className={`an-item${on === i ? " is-on" : ""}`} onMouseEnter={() => pick(i)} onFocus={() => pick(i)} onClick={() => pick(i)} aria-pressed={on === i}>
							<span className="an-num">{String(i + 1).padStart(2, "0")}</span>
							<span>
								<h3>{c.title}</h3>
								<span className="an-body">
									<p>{c.text}</p>
								</span>
							</span>
							{on === i && <span key={`t${on}`} className="an-timer" aria-hidden="true" />}
						</button>
					</li>
				))}
			</ol>
		</div>
	);
}
