/** Home page "One fault, end to end" stories. Figures follow the product's own worked examples. */
export interface Scenario {
	id: string;
	tab: string;
	intro: string;
	steps: { tone: "fault" | "warn" | "info" | "ok"; tag: string; title: string; line: string; t: string }[];
}

export const SCENARIOS: Scenario[] = [
	{
		id: "gpu",
		tab: "GPU slowed by cooling",
		intro: "A CDU pump seizes in a Houston GPU hall. The GPUs keep running, just slower, and the cause is in the plant room.",
		steps: [
			{ tone: "fault", tag: "Alarm in scope", title: "CDU flow at 62 %", line: "Pump A seized; standby pump B alone cannot hold design flow. Coolant supply 33.4 °C against a 25–27 °C band. Scope: site.", t: "0 s" },
			{ tone: "warn", tag: "Impact", title: "144 GPUs throttle, job 31 % slower", line: "18 nodes on the loop hit hardware slowdown at 86–89 °C. Every step of the training job waits for them; the customer and GPU time lost are attached.", t: "< 60 s" },
			{ tone: "info", tag: "Diagnosis · 81 %", title: "Pump A seized on the CDU loop", line: "Ranked with evidence: flow 62 % of design, supply above band, slowdown on every node of this loop within six minutes.", t: "< 60 s" },
			{ tone: "ok", tag: "Recommended action", title: "Cap the loop at 550 W, start the spare pump", line: "The power cap clears the slowdown now. Starting the spare pump skid restores flow and waits for approval.", t: "approval" },
		],
	},
	{
		id: "ups",
		tab: "UPS on battery",
		intro: "A utility feed is lost at a Chicago datacenter at 13:12.",
		steps: [
			{ tone: "fault", tag: "13:12 · Alarm in scope", title: "UPS-2 on battery", line: "Utility feed A lost. The ATS has moved the load to feed B. Scope: site. A Critical incident opens.", t: "0 s" },
			{ tone: "warn", tag: "Impact", title: "54 services, 12 customers", line: "Every service on busway A is listed, premium customers first, with 3 h 9 m until the next SLA credit tier.", t: "< 60 s" },
			{ tone: "info", tag: "Diagnosis · 84 %", title: "Feeder trip on feed A", line: "Ranked hypotheses with their evidence: the feed loss, the ATS transfer, the generator on standby.", t: "< 60 s" },
			{ tone: "ok", tag: "Recommended action", title: "Start the generator, transfer load", line: "Two steps, ordered by money and customers at risk. The disruptive step waits for approval and is recorded.", t: "approval" },
		],
	},
];
