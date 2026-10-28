"use client";

import { useState } from "react";
import { SCENARIOS } from "@/data/scenarios";

/** One fault, end to end: a tab per story (GPU slowed by cooling first), four steps each. */
export function Scenarios() {
	const [id, setId] = useState(SCENARIOS[0].id);
	const s = SCENARIOS.find((x) => x.id === id)!;
	return (
		<div className="sc">
			<div className="sc-bar">
				<p className="section-intro sc-intro">{s.intro}</p>
				<div className="sc-tabs" role="tablist" aria-label="Worked examples">
					{SCENARIOS.map((x) => (
						<button key={x.id} type="button" role="tab" aria-selected={x.id === id} aria-controls="sc-panel" className={x.id === id ? "is-on" : ""} onClick={() => setId(x.id)}>
							{x.tab}
						</button>
					))}
				</div>
			</div>
			<div className="timeline" id="sc-panel" role="tabpanel" key={s.id}>
				{s.steps.map((st, i) => (
					<div key={st.title} className={`tl-step tone-${st.tone} sc-in`} style={{ animationDelay: `${i * 70}ms` }}>
						<div className="tl-top">
							<small>
								<i />
								{st.tag}
							</small>
							<b>{st.t}</b>
						</div>
						<strong>{st.title}</strong>
						<span>{st.line}</span>
					</div>
				))}
			</div>
		</div>
	);
}
