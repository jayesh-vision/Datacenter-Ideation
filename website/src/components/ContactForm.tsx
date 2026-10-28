"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "./Icon";

/**
 * Demo request form. Not connected to a backend yet (Opstral posts to /api/contact);
 * it validates and shows a confirmation. Wire it to the CRM / email service before launch.
 */
export function ContactForm() {
	const [sent, setSent] = useState(false);
	const submit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!e.currentTarget.reportValidity()) return;
		setSent(true);
	};
	if (sent)
		return (
			<div className="form">
				<div className="form-done">
					<strong>Thank you.</strong> We will come back to you to plan the demo. (This form is not connected yet, so nothing was sent.)
				</div>
			</div>
		);
	return (
		<form className="form" onSubmit={submit} noValidate>
			<div className="form-row">
				<label>
					Name
					<input name="name" required autoComplete="name" />
				</label>
				<label>
					Work email
					<input name="email" type="email" required autoComplete="email" />
				</label>
			</div>
			<div className="form-row">
				<label>
					Company
					<input name="company" required autoComplete="organization" />
				</label>
				<label>
					Business model
					<select name="model" defaultValue="">
						<option value="" disabled>Choose…</option>
						<option>Colocation</option>
						<option>NeoCloud / GPU cloud</option>
						<option>Cloud</option>
						<option>Enterprise</option>
						<option>Network / telco</option>
					</select>
				</label>
			</div>
			<div className="form-row">
				<label>
					Datacenters
					<select name="sites" defaultValue="">
						<option value="" disabled>Choose…</option>
						<option>1–2</option>
						<option>3–10</option>
						<option>11–30</option>
						<option>More than 30</option>
					</select>
				</label>
				<label>
					Your role
					<input name="role" autoComplete="organization-title" />
				</label>
			</div>
			<label>
				The fault your team keeps dealing with
				<textarea name="message" placeholder="For example: UPS on battery and nobody knows which tenants are affected." />
			</label>
			<button type="submit" className="btn btn-primary">
				Request a demo <Icon name="arrow" size={16} />
			</button>
		</form>
	);
}
