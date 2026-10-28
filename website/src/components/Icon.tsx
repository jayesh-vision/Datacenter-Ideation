import {
	Activity, ArrowLeftRight, ArrowRight, ArrowUpRight, BadgeDollarSign, BellRing, BookOpen, Building, Building2, Cable, Check, ChevronDown, CircleHelp,
	ClipboardList, Database, FolderKanban, Layers, SlidersHorizontal, Waypoints, ChevronRight,
	ClipboardCheck, Cloud, Cpu, DraftingCompass, EyeOff, FileText, Gauge, HardHat, Landmark, LayoutDashboard, LineChart, Lock,
	Mail, Menu, Minus, Monitor, Network, Newspaper, Plug, Plus, RadioTower, Receipt, Scale, Server, Shield, ShieldCheck, Siren,
	Sparkles, Thermometer, UserRound, Users, Video, Warehouse, Workflow, X, Zap, type LucideIcon,
} from "lucide-react";

/** Icons by name, so content files can stay plain data. Add new names here. */
const ICONS: Record<string, LucideIcon> = {
	"arrow-left-right": ArrowLeftRight, "bell-ring": BellRing, "clipboard-list": ClipboardList, database: Database, "folder-kanban": FolderKanban, layers: Layers, "sliders-horizontal": SlidersHorizontal, waypoints: Waypoints, "chevron-right": ChevronRight,
	activity: Activity, arrow: ArrowRight, "arrow-up-right": ArrowUpRight, "badge-dollar-sign": BadgeDollarSign, "book-open": BookOpen,
	building: Building, "building-2": Building2, cable: Cable, check: Check, "chevron-down": ChevronDown, "circle-help": CircleHelp,
	"clipboard-check": ClipboardCheck, cloud: Cloud, cpu: Cpu, "drafting-compass": DraftingCompass, "eye-off": EyeOff, "file-text": FileText,
	gauge: Gauge, "hard-hat": HardHat, landmark: Landmark, "layout-dashboard": LayoutDashboard, "line-chart": LineChart, lock: Lock,
	mail: Mail, menu: Menu, minus: Minus, monitor: Monitor, network: Network, newspaper: Newspaper, plug: Plug, plus: Plus,
	"radio-tower": RadioTower, receipt: Receipt, scale: Scale, server: Server, shield: Shield, "shield-check": ShieldCheck, siren: Siren,
	sparkles: Sparkles, thermometer: Thermometer, "user-round": UserRound, users: Users, video: Video, warehouse: Warehouse,
	workflow: Workflow, x: X, zap: Zap,
};

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
	const C = ICONS[name] ?? CircleHelp;
	return <C size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
}
