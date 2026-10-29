import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";

/** Icon per role named in `askedBy`; unknown roles fall back to a person. */
const ROLE_ICON: Record<string, string> = {
	"NOC engineer": "monitor",
	"Head of operations": "briefcase",
	"Shift lead": "users",
	Finance: "badge-dollar-sign",
	"Facility engineer": "zap",
	"GPU platform engineer": "cpu",
	"Datacenter engineering": "building-2",
	"Capacity planner": "line-chart",
	"Capacity manager": "line-chart",
	"SOC analyst": "shield",
	"Site lead": "user-round",
	"Site engineer": "hard-hat",
	"Programme manager": "folder-kanban",
	"OT security lead": "lock",
	"On-call lead": "bell-ring",
	"Mechanical engineer": "thermometer",
	"Incident manager": "siren",
	"Electrical engineer": "zap",
	"Customer success": "users",
	"Compliance lead": "clipboard-check",
	"Commissioning engineer": "clipboard-list",
	"Commercial lead": "receipt",
	"Change manager": "workflow",
	Auditor: "scale",
	Approver: "shield-check",
	"Account manager": "briefcase",
};

/** Who asks what, and what the screen answers with: one tile per question. */
export function RoleStrip({ questions, askedBy, answers }: { questions: string[]; askedBy: string[]; answers?: string[] }) {
	return (
		<div className="roles">
			{questions.map((q, i) => (
				<Reveal key={q} className="role" delay={i * 60}>
					<span className="role-ico">
						<Icon name={ROLE_ICON[askedBy[i]] ?? "user-round"} size={20} />
					</span>
					<small>{askedBy[i]} asks</small>
					<strong>{q}</strong>
					{answers?.[i] && <p>{answers[i]}</p>}
				</Reveal>
			))}
		</div>
	);
}
