/** Two rows of source / system names scrolling in opposite directions (Opstral's connector marquee, as text tiles). */
export function Marquee({ rows }: { rows: string[][] }) {
	return (
		<div className="marquee" aria-label="Sources and systems SynapseDC connects to">
			{rows.map((row, r) => (
				<div key={r} className={`marquee-row${r % 2 ? " rev" : ""}`}>
					<div className="marquee-track">
						{[0, 1].map((copy) => (
							<ul key={copy} aria-hidden={copy === 1 || undefined}>
								{row.map((n) => (
									<li key={n}>{n}</li>
								))}
							</ul>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
