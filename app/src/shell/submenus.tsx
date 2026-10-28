/* Sub-menus (user, 19-Oct-2026: "create more sub-menus inside Planner like the tabs on the screen … remove the tabs
   from the screen, keep the tabs that are not part of the sub-menus").
   One table drives both the left menu (shell/Layout.tsx) and the screens: a sub-menu names the `?tab=` ids it covers,
   its link opens the first of them. A screen draws its tab row through <SubTabs>: a sub-menu covering one tab shows no
   row at all, one covering several (the merged tabs) shows only those. `?tab=` ids and defaults are unchanged, so every
   deep link, QA script and tile keeps working; the platform launcher embeds the same URLs (`?shell=false`). */
import { Tabs } from '../ui/kit';
import type { LucideIcon } from 'lucide-react';

/* `title` / `sub` = the page heading when this sub-menu is open (user, 21-Oct-2026: in the platform each sub-menu is its own menu screen,
   so "Capacity → Power" must read as the Power screen, not repeat the Capacity heading) */
export interface SubMenu { id: string; label: string; tabs: string[]; desc: string; title: string; sub: string }
export interface ScreenMenu { to: string; defaultTab: string; items: SubMenu[] }

export const SUBMENUS: Record<string, ScreenMenu> = {
  planning: { to: '/planning', defaultTab: 'overview', items: [
    { id: 'insights', label: 'Insights', tabs: ['overview'], desc: 'Pipeline, decisions due and plans that need action', title: 'Insights', sub: 'The planning pipeline: plans by stage, decisions due and the plans that need action, sized against the estate.' },
    { id: 'plans', label: 'Plans', tabs: ['plans'], desc: 'Every plan by status, list or cards', title: 'Plans', sub: 'Every plan by status, as a list or cards; open one to review, edit or decide, or start a new plan.' },
    { id: 'templates', label: 'Templates', tabs: ['templates'], desc: 'Plan types, site types and modules', title: 'Templates', sub: 'Plan types, site types and modules: the questions, rules, approval path and defaults a plan inherits.' },
    { id: 'benchmarks', label: 'Benchmarks', tabs: ['benchmarks'], desc: 'Costs, efficiency, lead times, sizing and rules', title: 'Benchmarks', sub: 'Cost, efficiency, lead-time, sizing and staffing references and the rules every plan is checked against.' }
  ] },
  capacity: { to: '/capacity', defaultTab: 'overview', items: [
    { id: 'insights', label: 'Insights', tabs: ['overview', 'financial'], desc: 'Headroom by dimension, forecast and the financial view', title: 'Insights', sub: 'Headroom by dimension, forecast against the 85% warning line, the plans that will change it and the financial view.' },
    { id: 'power', label: 'Power', tabs: ['power', 'energy', 'economics'], desc: 'Power and cooling headroom, PUE and energy, what power costs', title: 'Power', sub: 'Power and cooling headroom by datacenter, PUE and energy per day, and what power costs under each site\'s contract.' },
    { id: 'space', label: 'Space', tabs: ['space'], desc: 'Rack space and ports by hall', title: 'Space', sub: 'Rack units and ports by datacenter and hall, and where the next racks fit.' },
    { id: 'network', label: 'Network', tabs: ['network'], desc: 'Bandwidth and port headroom', title: 'Network', sub: 'Bandwidth and port headroom on backhaul and uplinks, and the links that will exhaust first.' },
    { id: 'compute', label: 'Compute', tabs: ['compute'], desc: 'Compute and GPU capacity', title: 'Compute', sub: 'CPU, memory, storage and GPU capacity: in a job, allocated but idle, free and out of service.' },
    { id: 'reservations', label: 'Reservations', tabs: ['reservations'], desc: 'What is held against capacity', title: 'Reservations', sub: 'What is held against capacity: planned devices, tenant contracts, approved plans and idle GPU allocations, with net available power and space.' }
  ] },
  ipam: { to: '/ipam', defaultTab: 'overview', items: [
    { id: 'insights', label: 'Insights', tabs: ['overview'], desc: 'Address plan health and findings', title: 'Insights', sub: 'Address plan health: usage, findings and exhaustion forecast across the sites.' },
    { id: 'space', label: 'IP Space', tabs: ['prefixes', 'addresses'], desc: 'Prefixes and IP addresses', title: 'IP space', sub: 'Prefixes and the addresses bound in them, read from the devices, links and services they serve.' },
    { id: 'routing', label: 'Routing', tabs: ['vrfs', 'vlans', 'asns'], desc: 'VRFs, VLANs and ASNs', title: 'Routing', sub: 'VRFs, VLANs and ASNs per site, with what depends on each.' },
    { id: 'gateways', label: 'Gateways', tabs: ['services'], desc: 'Gateway groups and application services', title: 'Gateways', sub: 'Gateway groups, DHCP ranges and application services.' },
    { id: 'registers', label: 'Registers', tabs: ['registers', 'integrations'], desc: 'Registries, roles, route targets and external sources', title: 'Registers', sub: 'Registries, roles, route targets, VLAN groups, service templates and the external sources the plan is reconciled with.' }
  ] },
  dcim: { to: '/dcim', defaultTab: 'overview', items: [
    { id: 'insights', label: 'Insights', tabs: ['overview'], desc: 'What needs attention, where capacity is tight, what the estate is made of', title: 'Insights', sub: 'What needs attention, where capacity is tight and what the estate is made of.' },
    { id: 'sites', label: 'Sites', tabs: ['sites', 'hierarchy'], desc: 'Sites and the containment hierarchy', title: 'Sites', sub: 'Datacenters and the containment hierarchy from site to floor, hall, row and rack.' },
    { id: 'racks', label: 'Racks', tabs: ['racks', 'floorplan'], desc: 'Racks and floor plans', title: 'Racks', sub: 'Every rack with its load and condition, and the floor plans they stand on.' },
    { id: 'devices', label: 'Devices', tabs: ['devices', 'explorer'], desc: 'Devices and the explorer', title: 'Devices', sub: 'Every installed and planned device, with the explorer for filtered views and exports.' },
    { id: 'cabling', label: 'Cabling', tabs: ['cabling'], desc: 'Data and power cables', title: 'Cabling', sub: 'Data cables and power cords with their structured routes from port to far end.' },
    { id: 'power', label: 'Power', tabs: ['power'], desc: 'Power panels and rack feeds', title: 'Power distribution', sub: 'Power panels and the rack feeds they supply, against their ratings.' },
    { id: 'catalogue', label: 'Catalogue', tabs: ['types'], desc: 'Device and module types', title: 'Catalogue', sub: 'Device and module types with their port, power and module templates.' },
    { id: 'changes', label: 'Changes', tabs: ['changes'], desc: 'Change requests touching DCIM records', title: 'Change requests', sub: 'Every change request touching DCIM records: ready to execute, awaiting approval, in progress and done.' }
  ] },
  delivery: { to: '/delivery', defaultTab: 'overview', items: [
    { id: 'insights', label: 'Insights', tabs: ['overview', 'todo'], desc: 'Portfolio health, cost and what is due', title: 'Insights', sub: 'Portfolio health, cost and what is due across programmes and projects.' },
    { id: 'programmes', label: 'Programs', tabs: ['programmes'], desc: 'Programmes and their gated projects', title: 'Programmes', sub: 'Programmes and their gated projects, from kick-off to handover.' },
    { id: 'projects', label: 'Projects', tabs: ['projects', 'workorders'], desc: 'Projects and their field work orders', title: 'Projects', sub: 'Projects from approved plans and templates, and the field work orders they raise, each with its change request.' },
    { id: 'permits', label: 'Permits', tabs: ['permits'], desc: 'Permits by authority and state', title: 'Permits', sub: 'Permits by authority and state across the projects.' },
    { id: 'design', label: 'Design', tabs: ['design'], desc: 'Design documents', title: 'Design documents', sub: 'Design documents per project and their review state.' }
  ] },
  /* Security Ops (26-Oct-2026, user): the datacenter SOC — NIST CSF 2.0 posture, MITRE ATT&CK coverage, NIST SP 800-61 cases */
  secops: { to: '/secops', defaultTab: 'overview', items: [
    { id: 'insights', label: 'Insights', tabs: ['overview'], desc: 'Security posture, what is being detected, open cases', title: 'Insights', sub: 'Security posture across every datacenter: the NIST CSF 2.0 functions, what is being detected, the cases being worked and the sites at most risk.' },
    { id: 'detections', label: 'Detections', tabs: ['detections'], desc: 'The alert queue with datacenter context', title: 'Detections', sub: 'Every detection from the security data lake with its datacenter context (room, rack, owner, change request, who was on site); triage, close or escalate to a case.' },
    { id: 'cases', label: 'Cases', tabs: ['cases', 'playbooks'], desc: 'Cases through the NIST SP 800-61 lifecycle, and the playbooks', title: 'Cases', sub: 'Security cases from detection and analysis through containment, eradication and recovery to post-incident review, and the response playbooks that run their steps.' },
    { id: 'coverage', label: 'Threat coverage', tabs: ['attack', 'rules'], desc: 'MITRE ATT&CK Enterprise and ICS coverage, detection rules', title: 'Threat coverage', sub: 'Which MITRE ATT&CK techniques (Enterprise and ICS) the detection rules cover and how often they fire, and the Sigma rules with the ClickHouse query each one runs.' },
    { id: 'vulns', label: 'Vulnerabilities', tabs: ['vulns'], desc: 'Firmware, OS and package exposure by SSVC priority', title: 'Vulnerabilities', sub: 'Firmware, operating system and package vulnerabilities on network gear, BMCs, hosts and facility controllers, prioritised with CVSS v4, EPSS and CISA KEV into SSVC decisions.' },
    { id: 'hardening', label: 'Hardening & drift', tabs: ['hardening', 'drift'], desc: 'CIS / STIG baselines and configuration drift', title: 'Hardening & drift', sub: 'Configuration checks against CIS Benchmarks, DISA STIGs and vendor guides, and every running config that drifted from the approved one, with or without a change request.' },
    { id: 'ot', label: 'OT security', tabs: ['ot'], desc: 'Facility plant zones and conduits (IEC 62443)', title: 'OT security', sub: 'The facility plant (UPS, PDUs, generators, cooling, BMS, fire, access control) as IEC 62443 zones and conduits: target against achieved security level, controllers and their findings.' },
    { id: 'physical', label: 'Physical security', tabs: ['physical'], desc: 'Layers from perimeter to rack, physical detections', title: 'Physical security', sub: 'Defence in depth from the perimeter to the rack per datacenter, the access-control and CCTV detections and the access-rights review.' },
  ] },
  /* MACD (28-Oct-2026, user): Move · Add · Change · Disconnect requests in the datacenter */
  macd: { to: '/macd', defaultTab: 'overview', items: [
    { id: 'insights', label: 'Insights', tabs: ['overview'], desc: 'The MACD pipeline, SLA and what needs attention', title: 'Insights', sub: 'Move, add, change and disconnect requests across the datacenters: the pipeline by stage, SLA, cycle time, first-time-right and what the open work adds to the estate.' },
    { id: 'requests', label: 'Requests', tabs: ['requests', 'board'], desc: 'Every request, as a list or a board by stage', title: 'Requests', sub: 'Every MACD request from customers and internal teams, as a list or a board by stage; open one to check feasibility, quote, schedule, run and verify it.' },
    { id: 'schedule', label: 'Schedule', tabs: ['schedule'], desc: 'Work windows for the next 14 days', title: 'Schedule', sub: 'The work windows of scheduled and running requests for today and the next 14 days, with their change requests, and what is not scheduled yet.' },
    { id: 'catalogue', label: 'Catalogue', tabs: ['catalog'], desc: 'Request types, SLA and charges', title: 'Catalogue', sub: 'The MACD request types offered: SLA, one-time and monthly charges, standard or normal change, the records each one updates and how it performed in 30 days.' }
  ] },
  workorders: { to: '/workorders', defaultTab: 'tasks', items: [
    { id: 'tasks', label: 'My Tasks', tabs: ['tasks'], desc: 'What waits on you', title: 'My tasks', sub: 'What waits on you: the steps assigned to your role across every running process.' },
    { id: 'running', label: 'Work Orders', tabs: ['running'], desc: 'Every running process', title: 'Work orders', sub: 'Every running process instance and the step it is on.' },
    { id: 'processes', label: 'Processes', tabs: ['processes'], desc: 'The process definitions', title: 'Processes', sub: 'The twelve process definitions as swimlanes: lanes, steps, targets and side branches.' },
    { id: 'insights', label: 'Insights', tabs: ['kpis'], desc: 'How fast work flows', title: 'Insights', sub: 'How fast work flows: cycle times, SLA attainment and throughput per process.' }
  ] }
};

/* a screen's sub-menu for the open tab (undefined = the tab belongs to a menu item of its own, e.g. Commissioning) */
export const subMenuOf = (screen: string, tab: string) => SUBMENUS[screen]?.items.find(s => s.tabs.includes(tab));
/* the link a sub-menu opens: its first tab; the screen's default tab needs no parameter */
export const subMenuHref = (screen: string, s: SubMenu) => { const m = SUBMENUS[screen]; return s.tabs[0] === m.defaultTab ? m.to : `${m.to}?tab=${s.tabs[0]}`; };
/* tabs bound to a menu item of their own (shell/Layout.tsx NAV `tab`) get their heading here */
const BOUND_HEADS: Record<string, { title: string; sub: string }> = {
  'delivery:commissioning': { title: 'Commissioning', sub: 'L1 factory witness to L5 integrated systems test for every project, and the handover to operations.' }
};
/* the page heading for the open sub-menu (or bound tab); the screen's own heading when the tab belongs to neither */
export const subHead = (screen: string, tab: string, fallback: { title: string; sub: string }) => {
  const s = subMenuOf(screen, tab);
  return s ? { title: s.title, sub: s.sub } : BOUND_HEADS[`${screen}:${tab}`] ?? fallback;
};
/* breadcrumb for the open sub-menu */
export const subCrumb = (screen: string, tab: string) => { const s = subMenuOf(screen, tab); return s ? [{ label: s.label }] : []; };

/* The tab row of a screen with sub-menus: only the tabs of the open sub-menu, and none when it covers one tab. */
export function SubTabs<T extends string>({ screen, tabs, value, onChange }: { screen: string; tabs: { id: T; label: string; count?: number; icon?: LucideIcon }[]; value: T; onChange: (v: T) => void }) {
  const s = subMenuOf(screen, value);
  if (!s || s.tabs.length < 2) return null;
  const shown = s.tabs.map(id => tabs.find(t => t.id === id)).filter((t): t is typeof tabs[number] => !!t); // in the sub-menu's order
  return <Tabs value={value} onChange={onChange} tabs={shown} />;
}
