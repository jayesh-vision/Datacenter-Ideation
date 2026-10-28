"use client";

import Link from "next/link";
import { useState } from "react";
import { MAP_NODES, nodeById } from "@/data/platformMap";
import { Icon } from "./Icon";

/**
 * The platform diagram (after Opstral's Ops Pillars diagram): your datacenter on the left, the
 * SynapseDC platform in the middle (Opstral AI across the top, Plan & build | core | Operate, the
 * governed layer), outcomes on the right, the deployment strip, then a caption that shows the
 * selected block. Click any block to read it; the caption links to its page.
 */
const INPUTS = [
	["zap", "BMS · UPS · PDUs · meters"],
	["thermometer", "Cooling · CDUs · sensors"],
	["network", "Routers · switches · optics"],
	["server", "Servers · BMCs"],
	["cpu", "GPUs · DCGM · scheduler"],
	["lock", "Doors · cages · CCTV"],
	["workflow", "ITSM · CRM · IPAM"],
	["file-text", "Records · import template"],
];
const OUTCOMES = [
	["users", "Who is affected"],
	["badge-dollar-sign", "What it costs"],
	["check", "What to do first"],
	["gauge", "Capacity you can sell"],
	["drafting-compass", "Plans approved on evidence"],
	["clipboard-check", "Records under change control"],
	["shield-check", "Audit-ready evidence"],
	["activity", "Numbers that reconcile"],
];
const PLAN = ["capacity", "powerecon", "planner", "dcim", "ipam", "delivery", "commissioning", "workorders"];
const CORE = ["twin", "alarm", "money", "physical"];
const OPERATE = ["command", "datacenters", "facilities", "gpu", "incidents", "changes", "revenue", "secops"];
const GOVERN = ["compliance", "datamodel", "models", "customization", "sources"];
const DEPLOY = [
	["server", "On-premises"],
	["cloud", "Your cloud"],
	["lock", "Air-gapped"],
	["monitor", "Embedded in your portal"],
];

export function PlatformMap() {
	const [sel, setSel] = useState("estate");
	const node = nodeById(sel) ?? MAP_NODES[0];

	const B = ({ id, cls = "" }: { id: string; cls?: string }) => {
		const n = nodeById(id)!;
		return (
			<button type="button" className={`pd-b ${cls}${sel === id ? " is-on" : ""}`} onClick={() => setSel(id)} aria-pressed={sel === id} aria-controls="pd-caption" title={n.short}>
				<Icon name={n.icon} size={15} />
				<span>{n.name}</span>
				{n.addon && <b className="addon-badge">Add-on</b>}
			</button>
		);
	};

	return (
		<div className="pd">
			<div className="pd-top">
				<aside className="pd-side">
					<p className="pd-side-h">Your datacenter</p>
					<ul>
						{INPUTS.map(([i, t]) => (
							<li key={t}>
								<Icon name={i} size={15} />
								{t}
							</li>
						))}
					</ul>
				</aside>

				<div className="pd-link" aria-hidden="true">
					<i />
					<small>read-only</small>
				</div>

				<div className="pd-platform">
					<span className="pd-tag">SynapseDC platform</span>
					<button type="button" className={`pd-ai${sel === "ai" ? " is-on" : ""}`} onClick={() => setSel("ai")} aria-pressed={sel === "ai"}>
						<Icon name="sparkles" size={18} />
						<strong>Opstral AI across every screen</strong>
						<span>Ask · Explain the cause · Recommend the action · Approval-gated</span>
					</button>

					<div className="pd-mid">
						<section className="pd-col">
							<h3>
								Plan &amp; build <small>sellable capacity → commissioned hall</small>
							</h3>
							<div className="pd-grid">
								{PLAN.map((id) => (
									<B key={id} id={id} />
								))}
							</div>
						</section>
						<div className="pd-arrow" aria-hidden="true">
							<i />
							<small>records</small>
						</div>
						<section className="pd-col pd-core">
							<h3>
								The core <small>one estate model</small>
							</h3>
							<B id="estate" cls="pd-big" />
							<div className="pd-grid">
								{CORE.map((id) => (
									<B key={id} id={id} />
								))}
							</div>
						</section>
						<div className="pd-arrow" aria-hidden="true">
							<i />
							<small>live state</small>
						</div>
						<section className="pd-col">
							<h3>
								Operate <small>impact and cost on every fault</small>
							</h3>
							<div className="pd-grid">
								{OPERATE.map((id) => (
									<B key={id} id={id} />
								))}
							</div>
						</section>
					</div>

					<div className="pd-govern">
						<span className="pd-govern-h">Govern &amp; data</span>
						{GOVERN.map((id) => (
							<B key={id} id={id} />
						))}
					</div>
					<div className="pd-bar">
						<Icon name="shield" size={15} />
						<strong>Governed end to end</strong>
						<span>Change request on every write · Approval-gated actions · Audit trail · Every count derived</span>
					</div>
				</div>

				<div className="pd-link" aria-hidden="true">
					<i />
					<small>by impact</small>
				</div>

				<aside className="pd-side">
					<p className="pd-side-h">Outcomes</p>
					<ul>
						{OUTCOMES.map(([i, t]) => (
							<li key={t}>
								<Icon name={i} size={15} />
								{t}
							</li>
						))}
					</ul>
				</aside>
			</div>

			<div className="pd-deploy">
				<div className="pd-deploy-h">
					<strong>Deploy where your data must live</strong>
					<span>One platform, your choice of footprint, inside your identity stack.</span>
				</div>
				{DEPLOY.map(([i, t]) => (
					<span key={t} className="pd-deploy-i">
						<Icon name={i} size={15} />
						{t}
					</span>
				))}
			</div>

			<div id="pd-caption" className="pd-caption" aria-live="polite">
				<span className="pd-caption-ico">
					<Icon name={node.icon} size={18} />
				</span>
				<div className="pd-caption-txt">
					<p>
						<strong>{node.name}.</strong> {node.desc}
						{node.over && <em> Analytics over the platform&apos;s {node.over}, which stays the system of record.</em>}
					</p>
					<ul>
						{node.holds.map((h) => (
							<li key={h}>{h}</li>
						))}
					</ul>
				</div>
				{node.href && (
					<Link className="text-link" href={node.href}>
						Explore <Icon name="arrow" size={15} />
					</Link>
				)}
			</div>
		</div>
	);
}
