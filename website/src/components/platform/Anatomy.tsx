"use client";

import { useState } from "react";
import { ArtFor } from "@/components/art";
import type { Capability } from "@/data/modules";

/**
 * "Anatomy of the screen": the module's illustration with numbered pins, and the pinned
 * capabilities as a numbered list beside it, stretched to the drawing's height. Hovering or clicking
 * either side lights the other; only the active capability shows its text (the list stays as tall as the drawing).
 */
export function Anatomy({ art, items }: { art: string; items: Capability[] }) {
	const pinned = items.filter((c) => c.pin);
	const [on, setOn] = useState(0);
	return (
		<div className="anatomy">
			<div className="an-art">
				<ArtFor id={art} />
				<div className="an-pins" aria-hidden="true">
					{pinned.map((c, i) => (
						<button
							key={c.title}
							type="button"
							tabIndex={-1}
							className={`an-pin${on === i ? " is-on" : ""}`}
							style={{ left: `${(c.pin![0] / 640) * 100}%`, top: `${(c.pin![1] / 420) * 100}%` }}
							onMouseEnter={() => setOn(i)}
							onClick={() => setOn(i)}
						>
							{i + 1}
						</button>
					))}
				</div>
			</div>
			<ol className="an-list">
				{pinned.map((c, i) => (
					<li key={c.title}>
						<button type="button" className={`an-item${on === i ? " is-on" : ""}`} onMouseEnter={() => setOn(i)} onFocus={() => setOn(i)} onClick={() => setOn(i)} aria-pressed={on === i}>
							<span className="an-num">{i + 1}</span>
							<span>
								<h3>{c.title}</h3>
								<span className="an-body">
									<p>{c.text}</p>
								</span>
							</span>
						</button>
					</li>
				))}
			</ol>
		</div>
	);
}
