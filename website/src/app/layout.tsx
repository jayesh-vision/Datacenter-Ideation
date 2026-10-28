import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import type { ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { JsonLd, organizationSchema, siteConfig, siteUrl } from "@/seo";
import "./globals.css";

// The product's fonts: Poppins for headings and chrome, Inter for text and numbers.
const head = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-head", display: "swap" });
const text = Inter({ subsets: ["latin"], variable: "--font-text", display: "swap" });

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title: { default: `Datacenter platform for plan, build and operate | ${siteConfig.name}`, template: `%s | ${siteConfig.name}` },
	description: siteConfig.description,
	applicationName: siteConfig.name,
	openGraph: { type: "website", siteName: siteConfig.name, locale: siteConfig.locale, images: [{ url: siteConfig.ogImage }] },
	icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#081120" };

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" className={`${head.variable} ${text.variable}`} data-scroll-behavior="smooth">
			<body>
				<a className="skip" href="#main">
					Skip to content
				</a>
				<JsonLd schema={organizationSchema()} />
				<Header />
				<main id="main">{children}</main>
				<Footer />
			</body>
		</html>
	);
}
