import type { NextConfig } from "next";

/**
 * Security headers on every route (same policy as the Opstral site).
 * The site is static; fonts are self-hosted by next/font, so no external origins are needed.
 * In development the policy is relaxed for HMR (eval + websockets).
 */
const isDev = process.env.NODE_ENV === "development";

const csp = [
	"default-src 'self'",
	`script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"font-src 'self'",
	`connect-src 'self'${isDev ? " ws:" : ""}`,
	"media-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
	...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
	{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
	{ key: "Content-Security-Policy", value: csp },
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "X-Frame-Options", value: "DENY" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
	poweredByHeader: false,
	turbopack: { root: __dirname },
	async redirects() {
		// Security & trust was merged into How it works (28-Oct-2026).
		return [{ source: "/security", destination: "/how-it-works#security", permanent: true }];
	},
	async headers() {
		return [
			{ source: "/(.*)", headers: securityHeaders },
			// Preview deployments must not be indexed as a duplicate site.
			{
				source: "/(.*)",
				has: [{ type: "host", value: "(.*)\\.vercel\\.app" }],
				headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
			},
		];
	},
};

export default nextConfig;
