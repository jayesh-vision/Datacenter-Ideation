import { NextResponse } from "next/server";

/**
 * The demo-request endpoint (ported from the Opstral website, 28-Oct-2026).
 *
 * Never tell someone their message was sent unless it was. Delivery goes through Resend:
 *   RESEND_API_KEY  the Resend API key (required)
 *   CONTACT_TO      comma-separated recipients (required)
 *   CONTACT_FROM    the sender, on a domain verified in Resend (default "SynapseDC <contact@synapsedc.tech>")
 * With the key or the recipients missing the route answers 503 and the form shows an error, not a thank-you.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED = ["firstName", "lastName", "workEmail", "company", "phone"] as const;
const MAX_REMARKS = 3000;
const MAX_FIELD = 300;
const MAX_BODY_BYTES = 32_000;

/** Best-effort rate limit per serverless instance; the real control belongs at the edge (Vercel firewall). */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
	const now = Date.now();
	const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
	hits.push(now);
	recent.set(ip, hits);
	if (recent.size > 10_000) recent.clear();
	return hits.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
	if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
		return NextResponse.json({ ok: false, error: "toolarge" }, { status: 413 });
	}

	// Same-origin only: an explicit foreign Origin is rejected (works on every domain the site is served from).
	const origin = request.headers.get("origin");
	const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
	if (origin && host && new URL(origin).host !== host) {
		return NextResponse.json({ ok: false, error: "origin" }, { status: 403 });
	}

	const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
	if (rateLimited(ip)) return NextResponse.json({ ok: false, error: "ratelimited" }, { status: 429 });

	const form = await request.formData();
	const value = (key: string) => String(form.get(key) ?? "").trim();

	for (const key of Array.from(form.keys())) {
		if (value(key).length > (key === "remarks" ? MAX_REMARKS : MAX_FIELD)) {
			return NextResponse.json({ ok: false, error: "toolong", fields: [key] }, { status: 400 });
		}
	}

	// Honeypot: answer 200 so the bot learns nothing.
	if (value("website")) return NextResponse.json({ ok: true });

	const missing = REQUIRED.filter((f) => !value(f));
	if (missing.length) return NextResponse.json({ ok: false, error: "missing", fields: missing }, { status: 400 });
	if (!EMAIL.test(value("workEmail"))) return NextResponse.json({ ok: false, error: "email", fields: ["workEmail"] }, { status: 400 });

	const apiKey = process.env.RESEND_API_KEY;
	const to = (process.env.CONTACT_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
	if (!apiKey || !to.length) {
		console.error("RESEND_API_KEY or CONTACT_TO is not set: a demo request could not be delivered.");
		return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
	}

	const lines = [
		["Name", `${value("firstName")} ${value("lastName")}`],
		["Work email", value("workEmail")],
		["Job title", value("jobTitle")],
		["Company", value("company")],
		["Country", value("country")],
		["Phone", `${value("phoneCode")} ${value("phone")}`.trim()],
		["Business model", value("model")],
		["Datacenters", value("sites")],
		["Meeting", value("meetingChoice")],
		["Requested slot", [value("meetingDate"), value("meetingTime"), value("meetingTz")].filter(Boolean).join(" ")],
		["Remarks", value("remarks")],
	].filter(([, v]) => v);

	try {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				from: process.env.CONTACT_FROM ?? "SynapseDC <contact@synapsedc.tech>",
				to,
				reply_to: value("workEmail"),
				subject: `SynapseDC demo request: ${value("company")}`,
				text: lines.map(([k, v]) => `${k}: ${v}`).join("\n"),
			}),
		});
		if (!res.ok) {
			console.error("Resend rejected a demo request:", res.status, await res.text());
			return NextResponse.json({ ok: false, error: "delivery" }, { status: 502 });
		}
	} catch (err) {
		console.error("Could not reach Resend:", err);
		return NextResponse.json({ ok: false, error: "delivery" }, { status: 502 });
	}
	return NextResponse.json({ ok: true });
}
