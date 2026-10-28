"use client";

import { useState, type FormEvent } from "react";
import SchedulePicker from "./contact/SchedulePicker";
import { Icon } from "./Icon";

/** Country → dialling code (and flag); picking a country sets the phone code. */
const COUNTRIES: [string, string, string][] = [
	["India", "+91", "🇮🇳"],
	["United States", "+1", "🇺🇸"],
	["United Kingdom", "+44", "🇬🇧"],
	["United Arab Emirates", "+971", "🇦🇪"],
	["Saudi Arabia", "+966", "🇸🇦"],
	["Singapore", "+65", "🇸🇬"],
	["Germany", "+49", "🇩🇪"],
	["Netherlands", "+31", "🇳🇱"],
	["France", "+33", "🇫🇷"],
	["Canada", "+1", "🇨🇦"],
	["Australia", "+61", "🇦🇺"],
	["Japan", "+81", "🇯🇵"],
	["Other", "", "🌐"],
];

const MEETING = ["Skip for now", "Schedule a meeting"] as const;

type Status = { state: "idle" } | { state: "sending" } | { state: "sent" } | { state: "error"; message: string; fields?: string[] };

const req = <i aria-hidden="true">*</i>;

/**
 * The demo-request form (after the Opstral DemoForm). Posts to /api/contact, which delivers by email and
 * returns an error, never a success, when it cannot; this form only says "sent" on a 200.
 * Validation is the browser's (required / type) plus the server's check. "Schedule a meeting" opens the
 * date and time pickers; the slot is sent with the visitor's time zone.
 */
export function ContactForm() {
	const [status, setStatus] = useState<Status>({ state: "idle" });
	const [country, setCountry] = useState("India");
	const [code, setCode] = useState("+91");
	const [wantsMeeting, setWantsMeeting] = useState(false);

	async function submit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = e.currentTarget;
		if (!form.reportValidity()) return;
		setStatus({ state: "sending" });
		try {
			const res = await fetch("/api/contact", { method: "POST", body: new FormData(form) });
			const body = await res.json().catch(() => ({}));
			if (res.ok && body.ok) {
				setStatus({ state: "sent" });
				form.reset();
				return;
			}
			setStatus({
				state: "error",
				fields: body.fields,
				message: body.error === "missing" ? "Some required details are missing." : body.error === "email" ? "That work email does not look right." : body.error === "ratelimited" ? "Too many requests from this address." : "We could not send that just now.",
			});
		} catch {
			setStatus({ state: "error", message: "We could not send that just now." });
		}
	}

	const bad = (f: string) => (status.state === "error" && status.fields?.includes(f) ? true : undefined);

	if (status.state === "sent")
		return (
			<div className="cf cf-done" role="status">
				<span className="cf-done-ico">
					<Icon name="check" size={22} />
				</span>
				<strong>Thank you. Your request is with us.</strong>
				<p>A member of the SynapseDC team will reply to arrange the session{wantsMeeting ? " at or near the slot you picked" : ""}.</p>
			</div>
		);

	return (
		<form className="cf" onSubmit={submit} noValidate>
			<div className="cf-grid">
				<label>
					<span>First name {req}</span>
					<input name="firstName" required autoComplete="given-name" aria-invalid={bad("firstName")} />
				</label>
				<label>
					<span>Last name {req}</span>
					<input name="lastName" required autoComplete="family-name" aria-invalid={bad("lastName")} />
				</label>
				<label>
					<span>Work email {req}</span>
					<input name="workEmail" type="email" required autoComplete="email" placeholder="you@company.com" aria-invalid={bad("workEmail")} />
				</label>
				<label>
					<span>Job title</span>
					<input name="jobTitle" autoComplete="organization-title" />
				</label>
				<label>
					<span>Company {req}</span>
					<input name="company" required autoComplete="organization" aria-invalid={bad("company")} />
				</label>
				<label>
					<span>Country</span>
					<select
						name="country"
						value={country}
						onChange={(e) => {
							setCountry(e.target.value);
							const c = COUNTRIES.find((x) => x[0] === e.target.value);
							if (c && c[1]) setCode(c[1]);
						}}
					>
						{COUNTRIES.map(([n]) => (
							<option key={n}>{n}</option>
						))}
					</select>
				</label>
				<label className="cf-wide">
					<span>Phone {req}</span>
					<span className="cf-phone">
						<select name="phoneCode" aria-label="Country dialling code" value={code} onChange={(e) => setCode(e.target.value)}>
							{COUNTRIES.filter((c) => c[1]).map(([n, c, f]) => (
								<option key={n} value={c}>
									{f} {c}
								</option>
							))}
						</select>
						<input name="phone" type="tel" inputMode="numeric" required autoComplete="tel-national" placeholder="98765 43210" aria-invalid={bad("phone")} />
					</span>
				</label>
				<label>
					<span>Business model</span>
					<select name="model" defaultValue="">
						<option value="">Choose…</option>
						<option>Colocation</option>
						<option>NeoCloud / GPU cloud</option>
						<option>Cloud</option>
						<option>Enterprise</option>
						<option>Network / telco</option>
					</select>
				</label>
				<label>
					<span>Datacenters</span>
					<select name="sites" defaultValue="">
						<option value="">Choose…</option>
						<option>1–2</option>
						<option>3–10</option>
						<option>11–30</option>
						<option>More than 30</option>
					</select>
				</label>
				<label className="cf-wide">
					<span>Remarks</span>
					<textarea name="remarks" maxLength={3000} placeholder="The situation your team keeps dealing with. For example: a UPS goes on battery and nobody knows which tenants are affected." />
				</label>
			</div>

			<fieldset className="cf-meet">
				<legend>Schedule a meeting?</legend>
				<div>
					{MEETING.map((m, i) => (
						<label key={m} className={(i === 1) === wantsMeeting ? "is-on" : ""}>
							<input type="radio" name="meetingChoice" value={m} defaultChecked={i === 0} onChange={() => setWantsMeeting(i === 1)} />
							{m}
						</label>
					))}
				</div>
			</fieldset>

			{wantsMeeting ? <SchedulePicker tz={Intl.DateTimeFormat().resolvedOptions().timeZone} /> : null}

			{/* Honeypot: out of sight and out of the accessibility tree; a bot fills it and gives itself away. */}
			<div className="cf-hp" aria-hidden="true">
				<label htmlFor="website">Website</label>
				<input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
			</div>

			<div className="cf-foot">
				<button type="submit" className="btn btn-primary" disabled={status.state === "sending"}>
					{status.state === "sending" ? "Sending…" : "Submit"} <Icon name="arrow" size={16} />
				</button>
				<p>By submitting you agree to be contacted by the SynapseDC team. We never share your information.</p>
			</div>
			{status.state === "error" ? (
				<p className="cf-error" role="alert">
					{status.message} Please try again in a few minutes.
				</p>
			) : null}
		</form>
	);
}
