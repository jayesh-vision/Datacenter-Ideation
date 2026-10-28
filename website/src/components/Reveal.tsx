"use client";

import { Fragment, useEffect, useRef, type ElementType, type ReactNode } from "react";

function useInView<T extends HTMLElement>(cls: string) {
	const ref = useRef<T>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		// Added here, not rendered, so the content stays visible without JS.
		el.classList.add(cls);
		const io = new IntersectionObserver(
			([e]) => {
				if (e.isIntersecting) {
					el.classList.add("is-visible");
					io.disconnect();
				}
			},
			{ threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [cls]);
	return ref;
}

/** Fades its children up when they scroll into view. */
export function Reveal({ children, className = "", as: Tag = "div", delay = 0 }: { children: ReactNode; className?: string; as?: ElementType; delay?: number }) {
	const ref = useInView<HTMLElement>("reveal");
	return (
		<Tag ref={ref} className={className || undefined} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
			{children}
		</Tag>
	);
}

/** A heading whose words fade up one by one. "\n" = line break. */
export function RevealHeading({ children, id, as: Tag = "h2", className = "" }: { children: string; id?: string; as?: ElementType; className?: string }) {
	const ref = useInView<HTMLElement>("heading-reveal");
	let i = 0;
	return (
		<Tag id={id} ref={ref} className={className || undefined}>
			{children.split("\n").map((line, li) => (
				<Fragment key={li}>
					{li > 0 && <br />}
					{line.split(" ").map((w, wi) => (
						<Fragment key={wi}>
							{wi > 0 && " "}
							<span className="hw" style={{ ["--d" as string]: `${i++ * 90}ms` }}>
								{w}
							</span>
						</Fragment>
					))}
				</Fragment>
			))}
		</Tag>
	);
}
