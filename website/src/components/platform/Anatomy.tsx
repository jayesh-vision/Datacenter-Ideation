"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArtFor } from "@/components/art";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";

const STEP_MS = 4200;

/** One row of the spotlight list: a capability, a pain or a question, with the panel it lives on. */
export interface SpotItem {
	title: string;
	text: string;
	/** [x, y, w, h] on the illustration's 640 × 420 canvas; without it the row shows no spotlight. */
	area?: [number, number, number, number];
	href?: string;
	linkLabel?: string;
	icon?: string;
}

/**
 * "What the screen holds": an illustration beside its main items. The active item's panel is
 * spotlighted on the drawing (the rest dims, a frame glides to it) and its text opens in the list.
 * While the section is in view it steps through the items on its own; once the visitor points at
 * an item it stays where they put it. No numbers or markers on the drawing (user, 29-Oct-2026).
 * `all` keeps items without an `area` in the list (the spotlight hides while one is active).
 */
export function Anatomy({ art, items, all = false }: { art: string; items: SpotItem[]; all?: boolean }) {
	const shown = all ? items : items.filter((c) => c.area);
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
	const area = shown[on]?.area;
	const [x, y, w, h] = area ?? [0, 0, 640, 420];
	const pct = (v: number, of: number) => `${(v / of) * 100}%`;

	return (
		<div ref={ref} className={`anatomy${auto && inView ? " is-auto" : ""}`}>
			<div className="an-art">
				<ArtFor id={art} />
				<div className={`an-spot${area ? "" : " is-off"}`} aria-hidden="true" style={{ left: pct(x, 640), top: pct(y, 420), width: pct(w, 640), height: pct(h, 420) }} />
			</div>
			<ol className="an-list">
				{shown.map((c, i) => (
					<li key={c.title}>
						<button type="button" className={`an-item${on === i ? " is-on" : ""}`} onMouseEnter={() => pick(i)} onFocus={() => pick(i)} onClick={() => pick(i)} aria-pressed={on === i}>
							<span className="an-num">{String(i + 1).padStart(2, "0")}</span>
							<span>
								<h3>{c.title}</h3>
								<span className="an-body">
									<p>
										{c.text}
										{c.href && (
											<Link href={c.href} className="an-link" tabIndex={on === i ? 0 : -1}>
												{c.linkLabel ?? "Open"} <Icon name="arrow" size={13} />
											</Link>
										)}
									</p>
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

/** The items that have no place on the drawing, as a slim row under the panel. */
export function AlsoRow({ items, label = "Also on the screen" }: { items: SpotItem[]; label?: string }) {
	if (!items.length) return null;
	return (
		<div className="an-more">
			<p className="an-more-k">{label}</p>
			<div className="an-more-grid">
				{items.map((c, i) => (
					<Reveal key={c.title} className="an-also" delay={i * 60}>
						<span className="card-ico">
							<Icon name={c.icon ?? "layers"} size={20} />
						</span>
						<span>
							<h3>{c.title}</h3>
							<p>
								{c.text}
								{c.href && (
									<>
										{" "}
										<Link href={c.href} className="an-link">
											{c.linkLabel ?? "Open"} <Icon name="arrow" size={13} />
										</Link>
									</>
								)}
							</p>
						</span>
					</Reveal>
				))}
			</div>
		</div>
	);
}
