"use client";

import { useState } from "react";
import { ArtFor } from "@/components/art";
import type { Capability } from "@/data/modules";

/**
 * "What the screen holds": the module's illustration beside its main capabilities (those with a `pin`)
 * as a list stretched to the drawing's height; only the active capability shows its text. No markers
 * are drawn over the illustration (user, 29-Oct-2026: pins on the drawing looked odd).
 */
export function Anatomy({ art, items }: { art: string; items: Capability[] }) {
	const pinned = items.filter((c) => c.pin);
	const [on, setOn] = useState(0);
	return (
		<div className="anatomy">
			<div className="an-art">
				<ArtFor id={art} />
			</div>
			<ol className="an-list">
				{pinned.map((c, i) => (
					<li key={c.title}>
						<button type="button" className={`an-item${on === i ? " is-on" : ""}`} onMouseEnter={() => setOn(i)} onFocus={() => setOn(i)} onClick={() => setOn(i)} aria-pressed={on === i}>
							<span className="an-num">{String(i + 1).padStart(2, "0")}</span>
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
