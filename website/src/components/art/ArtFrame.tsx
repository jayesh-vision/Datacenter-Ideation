"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** The illustration frame. Adds `is-in` once it scrolls into view so the `a-*` build-up classes play. */
export function ArtFrame({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
	const ref = useRef<HTMLElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			el.classList.add("is-in");
			return;
		}
		const io = new IntersectionObserver(
			([e]) => {
				if (e.isIntersecting) {
					el.classList.add("is-in");
					io.disconnect();
				}
			},
			{ threshold: 0.35 },
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);
	return (
		<figure ref={ref} className={`art ${className}`} role="img" aria-label={label}>
			{children}
		</figure>
	);
}
