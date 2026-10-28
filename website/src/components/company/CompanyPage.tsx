import Link from "next/link";
import { CtaBand, FaqList, Kicker, PageHero, Section } from "@/components/Blocks";
import { Icon } from "@/components/Icon";
import { Reveal, RevealHeading } from "@/components/Reveal";
import type { CompanyPageData, CompanySection } from "@/data/company";
import { differentiators } from "@/data/site";
import { JsonLd, breadcrumbSchema } from "@/seo";

/** One template for the Company pages (after the Opstral company pages); content in @/data/company. */
export function CompanyPage({ page }: { page: CompanyPageData }) {
	return (
		<>
			<JsonLd schema={breadcrumbSchema([{ name: "Home", path: "/" }, { name: page.nav, path: page.path }])} />
			<PageHero kicker={page.hero.kicker} title={page.hero.title} summary={page.hero.summary} art={page.hero.art} crumbs={[{ name: "Home", href: "/" }, { name: page.nav, href: page.path }]} actions={<Link href="/contact" className="btn btn-primary">Request a demo <Icon name="arrow" size={16} /></Link>} />
			{page.sections.map((s, i) => (
				<Block key={i} s={s} />
			))}
			<CtaBand title={page.cta.title} text={page.cta.text} />
		</>
	);
}

function Block({ s }: { s: CompanySection }) {
	switch (s.kind) {
		case "cards":
			return (
				<Section tone={s.tone ?? "white"} kicker={s.kicker} title={s.title} intro={s.intro}>
					<div className={`grid-${s.cols ?? 3} co-cards`}>
						{s.items.map((it, i) => (
							<Reveal key={it.title} className="card co-card" delay={(i % 4) * 60}>
								{it.icon && (
									<span className="card-ico">
										<Icon name={it.icon} size={20} />
									</span>
								)}
								{it.tag && <small className="co-tag">{it.tag}</small>}
								<h3>{it.title}</h3>
								<p>{it.text}</p>
								{it.foot && (
									<span className="co-foot">
										<Icon name="arrow" size={13} />
										{it.foot}
									</span>
								)}
							</Reveal>
						))}
					</div>
				</Section>
			);
		case "compare":
			return (
				<Section tone={s.tone ?? "white"} kicker={s.kicker} title={s.title} intro={s.intro}>
					<div className="co-compare">
						<div className="co-cmp-head">
							<span>Situation</span>
							<span>{s.before}</span>
							<span>{s.after}</span>
						</div>
						{s.rows.map((r) => (
							<Reveal key={r.what} className="co-cmp-row">
								<strong>{r.what}</strong>
								<span className="co-before">{r.before}</span>
								<span className="co-after">
									<Icon name="check" size={16} />
									{r.after}
								</span>
							</Reveal>
						))}
					</div>
				</Section>
			);
		case "table":
			return (
				<Section tone={s.tone ?? "white"} kicker={s.kicker} title={s.title} intro={s.intro}>
					<div className="table-wrap">
						<table className="t">
							<thead>
								<tr>
									<th>You have</th>
									<th>What it does well</th>
									<th>What SynapseDC adds</th>
								</tr>
							</thead>
							<tbody>
								{differentiators.map((d) => (
									<tr key={d.have}>
										<td className="k">{d.have}</td>
										<td>{d.good}</td>
										<td className="adds">{d.adds}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Section>
			);
		case "matrix":
			return (
				<Section tone={s.tone ?? "white"} kicker={s.kicker} title={s.title} intro={s.intro}>
					<div className="cmx-wrap">
						<table className="cmx">
							<thead>
								<tr>
									<th scope="col">Capability</th>
									{s.cols.map((c, i) => (
										<th key={c.name} scope="col" className={i === 0 ? "is-us" : ""}>
											<strong>{c.name}</strong>
											<small>{c.sub}</small>
										</th>
									))}
								</tr>
							</thead>
							{s.groups.map((g) => (
								<tbody key={g.name}>
									<tr className="cmx-group">
										<th colSpan={s.cols.length + 1} scope="colgroup">
											{g.name}
										</th>
									</tr>
									{g.rows.map((r) => (
										<tr key={r.cap}>
											<th scope="row">{r.cap}</th>
											{r.cells.map(([lv, t], i) => (
												<td key={i} className={i === 0 ? "is-us" : ""}>
													<span className={`cmx-lv lv-${lv.toLowerCase()}`}>{lv}</span>
													<span className="cmx-t">{t}</span>
												</td>
											))}
										</tr>
									))}
								</tbody>
							))}
						</table>
					</div>
					{s.note && <p className="note">{s.note}</p>}
				</Section>
			);
		case "timeline":
			return (
				<Section tone={s.tone ?? "white"} kicker={s.kicker} title={s.title} intro={s.intro}>
					<ol className="tl4" style={{ gridTemplateColumns: `repeat(${s.steps.length}, minmax(0, 1fr))` }}>
						{s.steps.map((st, i) => (
							<Reveal as="li" key={st.title} delay={i * 80}>
								<div className="tl4-dot">{String(i + 1).padStart(2, "0")}</div>
								<small>{st.label}</small>
								<h3>{st.title}</h3>
								<p>{st.text}</p>
							</Reveal>
						))}
					</ol>
				</Section>
			);
		case "claims":
			return (
				<Section tone={s.tone ?? "white"}>
					<div className="co-claims">
						<div>
							<Kicker>{s.kicker}</Kicker>
							<RevealHeading className="h-2">{s.title}</RevealHeading>
						</div>
						<ul>
							{s.items.map((c) => (
								<li key={c}>
									<Icon name="minus" size={16} />
									{c}
								</li>
							))}
						</ul>
					</div>
				</Section>
			);
		case "faq":
			return (
				<Section tone={s.tone ?? "white"}>
					<div className="faq-layout">
						<div className="section-head">
							<Kicker>{s.kicker}</Kicker>
							<RevealHeading className="h-2">{s.title}</RevealHeading>
						</div>
						<FaqList items={s.items} name="co-faq" />
					</div>
				</Section>
			);
		case "next":
			return (
				<Section tone={s.tone ?? "white"} kicker={s.kicker} title={s.title}>
					<div className="grid-3">
						{s.items.map((n, i) => (
							<Reveal key={n.href} delay={i * 60}>
								<Link href={n.href} className="card co-next">
									<small className="co-tag">{n.label}</small>
									<strong>{n.title}</strong>
									<span>{n.text}</span>
									<em>
										Read <Icon name="arrow" size={14} />
									</em>
								</Link>
							</Reveal>
						))}
					</div>
				</Section>
			);
	}
}
