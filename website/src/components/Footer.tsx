import Link from "next/link";
import { footerColumns } from "@/data/site";
import { siteConfig } from "@/seo";
import { Logo } from "./Logo";

export function Footer() {
	return (
		<footer className="site-footer">
			<div className="wrap footer-grid">
				<div className="footer-company">
					<Link href="/" aria-label="SynapseDC home">
						<Logo tone="light" />
					</Link>
					<p>{siteConfig.description}</p>
				</div>
				{footerColumns.map((col) => (
					<nav key={col.title} className="footer-col" aria-label={`Footer ${col.title}`}>
						<h2>{col.title}</h2>
						<ul>
							{col.links.map(([label, href]) => (
								<li key={href}>
									<Link href={href}>{label}</Link>
								</li>
							))}
						</ul>
					</nav>
				))}
			</div>
			<div className="footer-bottom">
				<div className="wrap footer-bottom-row">
					<p>© {new Date().getFullYear()} SynapseDC. All rights reserved.</p>
					<nav aria-label="Legal">
						<Link href="/privacy">Privacy</Link>
						<Link href="/terms">Terms</Link>
						<Link href="/how-it-works#security">Security</Link>
					</nav>
				</div>
			</div>
		</footer>
	);
}
