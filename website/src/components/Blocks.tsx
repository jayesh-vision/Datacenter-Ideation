import Link from "next/link";
import type { ReactNode } from "react";
import { modules, type Module } from "@/data/modules";
import { ArtFor } from "./art";
import { Icon } from "./Icon";
import { Reveal, RevealHeading } from "./Reveal";

export function Kicker({ children }: { children: ReactNode }) {
	return <p className="kicker">{children}</p>;
}

/** Dark page hero: copy on the left, an illustration (or nothing) on the right. */
export function PageHero({ kicker, title, summary, actions, art, crumbs }: { kicker?: string; title: string; summary?: string; actions?: ReactNode; art?: string; crumbs?: { name: string; href: string }[] }) {
	return (
		<section className="canvas page-hero on-dark">
			<div className="canvas-glow" aria-hidden="true" />
			<div className={`wrap page-hero-grid${art ? "" : " single"}`}>
				<div>
					{crumbs && (
						<nav className="crumbs" aria-label="Breadcrumb">
							{crumbs.map((c, i) => (
								<span key={c.href}>
									{i > 0 && <span aria-hidden="true">/</span>}
									{i < crumbs.length - 1 ? <Link href={c.href}>{c.name}</Link> : <span aria-current="page">{c.name}</span>}
								</span>
							))}
						</nav>
					)}
					{kicker && <Kicker>{kicker}</Kicker>}
					<h1 className="h-1">{title}</h1>
					{summary && <p className="lead">{summary}</p>}
					{actions && <div className="actions">{actions}</div>}
				</div>
				{art && <ArtFor id={art} />}
			</div>
		</section>
	);
}

export function Section({ id, kicker, title, intro, children, tone = "white", center = false, className = "" }: { id?: string; kicker?: string; title?: string; intro?: string; children?: ReactNode; tone?: "white" | "soft" | "dark"; center?: boolean; className?: string }) {
	return (
		<section id={id} className={`section section-${tone}${tone === "dark" ? " on-dark" : ""} ${className}`}>
			<div className="wrap">
				{(kicker || title || intro) && (
					<div className={`section-head${center ? " center" : ""}`}>
						{kicker && <Kicker>{kicker}</Kicker>}
						{title && <RevealHeading className="h-2">{title}</RevealHeading>}
						{intro && <p className="section-intro">{intro}</p>}
					</div>
				)}
				{children}
			</div>
		</section>
	);
}

export function ModuleCard({ m }: { m: Module }) {
	return (
		<Link href={`/platform/${m.slug}`} className="card">
			<span className="card-ico">
				<Icon name={m.icon} size={20} />
			</span>
			<strong>
				{m.name}
				{m.addon && <b className="addon-badge">Add-on</b>}
			</strong>
			<span>{m.short}</span>
			<em>
				Explore <Icon name="arrow" size={14} />
			</em>
		</Link>
	);
}

export function ModuleGrid({ slugs }: { slugs?: string[] }) {
	const list = slugs ? slugs.map((s) => modules.find((m) => m.slug === s)!).filter(Boolean) : modules;
	return (
		<div className="grid-3">
			{list.map((m, i) => (
				<Reveal key={m.slug} delay={(i % 3) * 60}>
					<ModuleCard m={m} />
				</Reveal>
			))}
		</div>
	);
}

export function FeatureCards({ items, cols = 3 }: { items: { title: string; text: string; icon?: string }[]; cols?: 2 | 3 | 4 }) {
	return (
		<div className={`grid-${cols}`}>
			{items.map((it, i) => (
				<Reveal key={it.title} className="card" delay={(i % cols) * 60}>
					{it.icon && (
						<span className="card-ico">
							<Icon name={it.icon} size={20} />
						</span>
					)}
					<h3>{it.title}</h3>
					<p>{it.text}</p>
				</Reveal>
			))}
		</div>
	);
}

/** Illustration beside copy; `flip` puts the illustration on the left. */
export function SplitFeature({ art, kicker, title, text, points, href, cta, flip = false }: { art: string; kicker: string; title: string; text: string; points?: string[]; href?: string; cta?: string; flip?: boolean }) {
	return (
		<Reveal className={`split${flip ? " rev" : ""}`}>
			<div className="copy">
				<Kicker>{kicker}</Kicker>
				<RevealHeading className="h-2">{title}</RevealHeading>
				<p>{text}</p>
				{points && (
					<ul className="ticks">
						{points.map((p) => (
							<li key={p}>
								<Icon name="check" size={16} />
								{p}
							</li>
						))}
					</ul>
				)}
				{href && cta && (
					<Link className="text-link" href={href}>
						{cta} <Icon name="arrow" size={16} />
					</Link>
				)}
			</div>
			<ArtFor id={art} />
		</Reveal>
	);
}

export function FaqList({ items, name = "faq" }: { items: { q: string; a: string }[]; name?: string }) {
	return (
		<div className="faq-list">
			{items.map((f) => (
				<details key={f.q} name={name}>
					<summary>
						{f.q}
						<span className="faq-sign" aria-hidden="true">
							<Icon name="plus" size={18} className="i-plus" />
							<Icon name="minus" size={18} className="i-minus" />
						</span>
					</summary>
					<p>{f.a}</p>
				</details>
			))}
		</div>
	);
}

export function CtaBand({ title = "See your own estate in it.", text = "Bring the fault your team keeps dealing with. We walk it end to end on a demo estate shaped like yours, then agree what a one-site pilot should prove." }: { title?: string; text?: string }) {
	return (
		<section className="canvas cta-band on-dark">
			<div className="canvas-glow" aria-hidden="true" />
			<div className="wrap cta-inner">
				<div>
					<RevealHeading className="h-2">{title}</RevealHeading>
					<p>{text}</p>
				</div>
				<div className="actions">
					<Link href="/contact" className="btn btn-primary">
						Book a demo <Icon name="arrow" size={16} />
					</Link>
					<Link href="/how-it-works" className="btn btn-ghost-light">
						How onboarding works
					</Link>
				</div>
			</div>
		</section>
	);
}

export function Pills({ items, light = false }: { items: string[]; light?: boolean }) {
	return (
		<ul className="pills">
			{items.map((c) => (
				<li key={c} className={`pill${light ? " pill-light" : ""}`}>
					{c}
				</li>
			))}
		</ul>
	);
}
