"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "./Icon";

/** Country → dialling code (and flag) for the phone field; picking a country sets the code. */
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

const req = <i aria-hidden="true">*</i>;

/**
 * Demo request form. Not connected to a backend yet: it validates and shows a confirmation.
 * Wire it to the CRM / email service before launch.
 */
export function ContactForm() {
	const [sent, setSent] = useState(false);
	const [country, setCountry] = useState("India");
	const [code, setCode] = useState("+91");
	const [meet, setMeet] = useState<"skip" | "schedule">("skip");

	const submit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!e.currentTarget.reportValidity()) return;
		setSent(true);
	};

	if (sent)
		return (
			<div className="cf cf-done" role="status">
				<span className="cf-done-ico">
					<Icon name="check" size={22} />
				</span>
				<strong>Thank you. We will come back to you to plan the demo.</strong>
				<p>This form is not connected yet, so nothing was sent. Until it is, reach us through your VisionWaves contact.</p>
			</div>
		);

	return (
		<form className="cf" onSubmit={submit} noValidate>
			<div className="cf-grid">
				<label>
					<span>First name {req}</span>
					<input name="firstName" required autoComplete="given-name" />
				</label>
				<label>
					<span>Last name {req}</span>
					<input name="lastName" required autoComplete="family-name" />
				</label>
				<label>
					<span>Work email {req}</span>
					<input name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
				</label>
				<label>
					<span>Job title</span>
					<input name="title" autoComplete="organization-title" />
				</label>
				<label>
					<span>Company {req}</span>
					<input name="company" required autoComplete="organization" />
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
						<select name="phoneCode" aria-label="Country code" value={code} onChange={(e) => setCode(e.target.value)}>
							{COUNTRIES.filter((c) => c[1]).map(([n, c, f]) => (
								<option key={n} value={c}>
									{f} {c}
								</option>
							))}
						</select>
						<input name="phone" type="tel" required autoComplete="tel-national" placeholder="98765 43210" />
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
					<textarea name="message" placeholder="The situation your team keeps dealing with. For example: a UPS goes on battery and nobody knows which tenants are affected." />
				</label>
				<div className="cf-wide cf-meet">
					<span>Schedule a meeting?</span>
					<div role="radiogroup" aria-label="Schedule a meeting">
						{(["skip", "schedule"] as const).map((v) => (
							<button key={v} type="button" role="radio" aria-checked={meet === v} className={meet === v ? "is-on" : ""} onClick={() => setMeet(v)}>
								{v === "skip" ? "Skip for now" : "Schedule a meeting"}
							</button>
						))}
					</div>
					<input type="hidden" name="meeting" value={meet} />
				</div>
			</div>
			<div className="cf-foot">
				<button type="submit" className="btn btn-primary">
					Submit <Icon name="arrow" size={16} />
				</button>
				<p>By submitting you agree to be contacted by the SynapseDC team. We never share your information.</p>
			</div>
		</form>
	);
}
