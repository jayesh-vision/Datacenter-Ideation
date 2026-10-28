"use client";

import Link from "next/link";
import { useState } from "react";
import { DOMAINS, USE_CASES, type Domain, type UseCase } from "@/data/useCases";
import { Icon } from "./Icon";

/** Filter pills (sticky under the header) and the use cases grouped by domain. */
export function UseCaseBrowser() {
	const [filter, setFilter] = useState<Domain | "all">("all");
	const [model, setModel] = useState<"all" | "Colocation" | "NeoCloud">("all");
	const shown = DOMAINS.filter((d) => filter === "all" || d.id === filter);
	const fits = (m: string) => model === "all" || m === "Both" || m === model;

	return (
		<div className="uc">
			<div className="uc-filters">
				<div className="wrap uc-filter-row">
					<div className="uc-pills" role="tablist" aria-label="Domain">
						<button type="button" className={`uc-pill${filter === "all" ? " is-on" : ""}`} onClick={() => setFilter("all")}>
							All <b>{USE_CASES.filter((u) => fits(u.model)).length}</b>
						</button>
						{DOMAINS.map((d) => (
							<button key={d.id} type="button" className={`uc-pill${filter === d.id ? " is-on" : ""}`} onClick={() => setFilter(d.id)}>
								<i style={{ background: d.color }} />
								{d.name} <b>{USE_CASES.filter((u) => u.domain === d.id && fits(u.model)).length}</b>
							</button>
						))}
					</div>
					<div className="uc-seg" role="tablist" aria-label="Business model">
						{(["all", "Colocation", "NeoCloud"] as const).map((m) => (
							<button key={m} type="button" className={model === m ? "is-on" : ""} onClick={() => setModel(m)}>
								{m === "all" ? "All models" : m}
							</button>
						))}
					</div>
				</div>
			</div>

			<div className="wrap">
				{shown.map((d) => {
					const list = USE_CASES.filter((u) => u.domain === d.id && fits(u.model));
					if (!list.length) return null;
					return (
						<section key={d.id} className="uc-group" id={`uc-${d.id}`}>
							<div className="uc-group-head">
								<h2 className="h-2">
									{d.name} <small>{list.length} use cases</small>
								</h2>
								<p style={{ borderColor: d.color }}>{d.line}</p>
							</div>
							<div className="uc-grid">
								{list.map((u) => (
									<UseCaseCard key={u.id} u={u} color={d.color} name={d.name} />
								))}
							</div>
						</section>
					);
				})}
			</div>
		</div>
	);
}

/** One use case card; also used on /gpu-ai. */
export function UseCaseCard({ u, color, name }: { u: UseCase; color: string; name: string }) {
	const d = { color, name };
	return (
		<article className="uc-card">
		<div className="uc-card-top">
			<span className="uc-tag" style={{ color: d.color, borderColor: d.color }}>
				{d.name}
			</span>
			<span className="uc-id">{u.id}</span>
			<span className="uc-model">{u.model === "Both" ? "Colocation · NeoCloud" : u.model}</span>
		</div>
		<h3>{u.title}</h3>
		<p className="uc-pain">{u.pain}</p>
		<p className="uc-detail">{u.detail}</p>
		<ul className="uc-does">
			{u.does.map((x) => (
				<li key={x}>
					<Icon name="check" size={14} />
					{x}
				</li>
			))}
		</ul>
		<div className="uc-mods">
			{u.modules.map((m) => (
				<Link key={m.href} href={m.href}>
					{m.name}
				</Link>
			))}
		</div>
		<div className="uc-proof">
			<small>Modelled on the SynapseDC demo estate</small>
			<div>
				{u.proof.map((p) => (
					<span key={p.l}>
						<b>{p.v}</b>
						{p.l}
					</span>
				))}
			</div>
		</div>
									</article>
	);
}
