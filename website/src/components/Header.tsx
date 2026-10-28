"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { navigation, type NavItem } from "@/data/site";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

function Panel({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
	return (
		<div className="nav-panel-inner" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate()}>
			<div className="nav-columns" style={{ ["--cols" as string]: item.columns!.length }}>
				{item.columns!.map((col) => (
					<div key={col.heading} className="nav-column">
						<p className="nav-heading">{col.heading}</p>
						{col.links.map((l) => (
							<Link key={l.href} href={l.href} className="nav-link">
								{l.icon && (
									<span className="nav-ico">
										<Icon name={l.icon} size={16} />
									</span>
								)}
								<span>
									<strong>{l.label}</strong>
									{l.desc && <small>{l.desc}</small>}
								</span>
							</Link>
						))}
					</div>
				))}
				{item.footerLinks && (
					<div className="nav-footer-links">
						{item.footerLinks.map((l) => (
							<Link key={l.href} href={l.href}>
								{l.label} <Icon name="arrow" size={14} />
							</Link>
						))}
					</div>
				)}
			</div>
			{item.promo && (
				<Link className="nav-promo" href={item.promo.href}>
					<small>{item.promo.kicker}</small>
					<strong>{item.promo.title}</strong>
					<span>{item.promo.desc}</span>
					<em>
						{item.promo.cta} <Icon name="arrow" size={14} />
					</em>
				</Link>
			)}
		</div>
	);
}

/**
 * Navigation rules: a top-level label is always a link to its landing page (click = navigate).
 * Hovering (with a short intent delay) or focusing it opens the panel; the chevron toggles it for
 * keyboard and touch. Hover never fights the click. Escape, an outside click, a route change, a click on a
 * panel link or a second click on the open label closes it (the last two matter when the URL does not change).
 */
export function Header() {
	const [open, setOpen] = useState<string | null>(null);
	const [mobile, setMobile] = useState(false);
	const ref = useRef<HTMLElement>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const path = usePathname();

	const intent = (label: string | null, delay: number) => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => setOpen(label), delay);
	};

	useEffect(() => {
		setOpen(null);
		setMobile(false);
	}, [path]);

	useEffect(() => {
		if (!open && !mobile) return;
		const key = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			setOpen(null);
			setMobile(false);
		};
		const click = (e: MouseEvent) => {
			if (!ref.current?.contains(e.target as Node)) setOpen(null);
		};
		document.addEventListener("keydown", key);
		document.addEventListener("click", click);
		return () => {
			document.removeEventListener("keydown", key);
			document.removeEventListener("click", click);
		};
	}, [open, mobile]);

	return (
		<header ref={ref} className="site-header" onMouseLeave={() => intent(null, 180)}>
			<div className="wrap header-row">
				<Link href="/" aria-label="SynapseDC home" className="brand">
					<Logo tone="light" />
				</Link>

				<nav className="nav-desktop" aria-label="Main">
					{navigation.map((item) => {
						const active = path === item.href || (item.columns && item.href !== "/" && path.startsWith(item.href));
						if (!item.columns)
							return (
								<div key={item.label} className="nav-item" onMouseEnter={() => intent(null, 0)}>
									<Link href={item.href} className={`nav-top${active ? " is-active" : ""}`}>
										{item.label}
									</Link>
								</div>
							);
						const isOpen = open === item.label;
						return (
							<div key={item.label} className={`nav-item${isOpen ? " is-open" : ""}`} onMouseEnter={() => intent(item.label, 120)}>
								<Link
									href={item.href}
									className={`nav-top${active ? " is-active" : ""}`}
									onFocus={() => intent(item.label, 0)}
									onClick={(e) => {
										if (timer.current) clearTimeout(timer.current);
										if (!isOpen) return;
										setOpen(null);
										if (path === item.href) e.preventDefault();
									}}
								>
									{item.label}
									<button
										type="button"
										aria-label={`${isOpen ? "Close" : "Open"} ${item.label} menu`}
										aria-expanded={isOpen}
										style={{ display: "contents" }}
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											intent(isOpen ? null : item.label, 0);
										}}
									>
										<Icon name="chevron-down" size={14} />
									</button>
								</Link>
							</div>
						);
					})}
				</nav>

				<div className="header-actions">
					<Link href="/contact" className="btn btn-primary btn-sm">
						Book a demo
					</Link>
					<button type="button" className="nav-burger" aria-label={mobile ? "Close menu" : "Open menu"} aria-expanded={mobile} onClick={() => setMobile(!mobile)}>
						<Icon name={mobile ? "x" : "menu"} size={22} />
					</button>
				</div>
			</div>

			{navigation.map(
				(item) =>
					item.columns && (
						<div key={item.label} className="nav-panel" hidden={open !== item.label} onMouseEnter={() => intent(item.label, 0)}>
							<div className="wrap">
								<Panel item={item} onNavigate={() => setOpen(null)} />
							</div>
						</div>
					),
			)}

			{mobile && (
				<div className="nav-mobile">
					{navigation.map((item) =>
						!item.columns ? (
							<Link key={item.label} href={item.href} className="nav-m-top">
								{item.label}
							</Link>
						) : (
							<details key={item.label}>
								<summary className="nav-m-top">
									{item.label} <Icon name="chevron-down" size={16} />
								</summary>
								<div className="nav-m-group">
									<Link href={item.href} style={{ fontWeight: 500 }}>
										{item.label} overview
									</Link>
								</div>
								{item.columns.map((c) => (
									<div key={c.heading} className="nav-m-group">
										<p className="nav-heading">{c.heading}</p>
										{c.links.map((l) => (
											<Link key={l.href} href={l.href}>
												{l.label}
											</Link>
										))}
									</div>
								))}
							</details>
						),
					)}
					<Link href="/contact" className="btn btn-primary">
						Book a demo
					</Link>
				</div>
			)}
		</header>
	);
}
