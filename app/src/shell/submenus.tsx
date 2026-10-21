/* Sub-menus (user, 19-Oct-2026: "create more sub-menus inside Planner like the tabs on the screen … remove the tabs
   from the screen, keep the tabs that are not part of the sub-menus").
   One table drives both the left menu (shell/Layout.tsx) and the screens: a sub-menu names the `?tab=` ids it covers,
   its link opens the first of them. A screen draws its tab row through <SubTabs>: a sub-menu covering one tab shows no
   row at all, one covering several (the merged tabs) shows only those. `?tab=` ids and defaults are unchanged, so every
   deep link, QA script and tile keeps working; the platform launcher embeds the same URLs (`?shell=false`). */
import { Tabs } from '../ui/kit';
import type { LucideIcon } from 'lucide-react';

export interface SubMenu { id: string; label: string; tabs: string[]; desc: string }
export interface ScreenMenu { to: string; defaultTab: string; items: SubMenu[] }

export const SUBMENUS: Record<string, ScreenMenu> = {
  planning: { to: '/planning', defaultTab: 'overview', items: [
    { id: 'insights', label: 'Insights', tabs: ['overview'], desc: 'Pipeline, decisions due and plans that need action' },
    { id: 'plans', label: 'Plans', tabs: ['plans'], desc: 'Every plan by status, list or cards' },
    { id: 'templates', label: 'Templates', tabs: ['templates'], desc: 'Plan types, site types and modules' },
    { id: 'benchmarks', label: 'Benchmarks', tabs: ['benchmarks'], desc: 'Costs, efficiency, lead times, sizing and rules' }
  ] },
  capacity: { to: '/capacity', defaultTab: 'overview', items: [
    { id: 'insights', label: 'Insights', tabs: ['overview', 'financial'], desc: 'Headroom by dimension, forecast and the financial view' },
    { id: 'power', label: 'Power', tabs: ['power', 'energy', 'economics'], desc: 'Power and cooling headroom, PUE and energy, what power costs' },
    { id: 'space', label: 'Space', tabs: ['space'], desc: 'Rack space and ports by hall' },
    { id: 'network', label: 'Network', tabs: ['network'], desc: 'Bandwidth and port headroom' },
    { id: 'compute', label: 'Compute', tabs: ['compute'], desc: 'Compute and GPU capacity' },
    { id: 'reservations', label: 'Reservations', tabs: ['reservations'], desc: 'What is held against capacity' }
  ] },
  ipam: { to: '/ipam', defaultTab: 'overview', items: [
    { id: 'insights', label: 'Insights', tabs: ['overview'], desc: 'Address plan health and findings' },
    { id: 'space', label: 'IP Space', tabs: ['prefixes', 'addresses'], desc: 'Prefixes and IP addresses' },
    { id: 'routing', label: 'Routing', tabs: ['vrfs', 'vlans', 'asns'], desc: 'VRFs, VLANs and ASNs' },
    { id: 'gateways', label: 'Gateways', tabs: ['services'], desc: 'Gateway groups and application services' },
    { id: 'registers', label: 'Registers', tabs: ['registers', 'integrations'], desc: 'Registries, roles, route targets and external sources' }
  ] },
  dcim: { to: '/dcim', defaultTab: 'overview', items: [
    { id: 'insights', label: 'Insights', tabs: ['overview'], desc: 'What needs attention, where capacity is tight, what the estate is made of' },
    { id: 'sites', label: 'Sites', tabs: ['sites', 'hierarchy'], desc: 'Sites and the containment hierarchy' },
    { id: 'racks', label: 'Racks', tabs: ['racks', 'floorplan'], desc: 'Racks and floor plans' },
    { id: 'devices', label: 'Devices', tabs: ['devices', 'explorer'], desc: 'Devices and the explorer' },
    { id: 'cabling', label: 'Cabling', tabs: ['cabling'], desc: 'Data and power cables' },
    { id: 'power', label: 'Power', tabs: ['power'], desc: 'Power panels and rack feeds' },
    { id: 'catalogue', label: 'Catalogue', tabs: ['types'], desc: 'Device and module types' },
    { id: 'changes', label: 'Changes', tabs: ['changes'], desc: 'Change requests touching DCIM records' }
  ] },
  delivery: { to: '/delivery', defaultTab: 'overview', items: [
    { id: 'insights', label: 'Insights', tabs: ['overview', 'todo'], desc: 'Portfolio health, cost and what is due' },
    { id: 'programmes', label: 'Programs', tabs: ['programmes'], desc: 'Programmes and their gated projects' },
    { id: 'projects', label: 'Projects', tabs: ['projects', 'workorders'], desc: 'Projects and their field work orders' },
    { id: 'permits', label: 'Permits', tabs: ['permits'], desc: 'Permits by authority and state' },
    { id: 'design', label: 'Design', tabs: ['design'], desc: 'Design documents' }
  ] },
  workorders: { to: '/workorders', defaultTab: 'tasks', items: [
    { id: 'tasks', label: 'My Tasks', tabs: ['tasks'], desc: 'What waits on you' },
    { id: 'running', label: 'Work Orders', tabs: ['running'], desc: 'Every running process' },
    { id: 'processes', label: 'Processes', tabs: ['processes'], desc: 'The process definitions' },
    { id: 'insights', label: 'Insights', tabs: ['kpis'], desc: 'How fast work flows' }
  ] }
};

/* a screen's sub-menu for the open tab (undefined = the tab belongs to a menu item of its own, e.g. Commissioning) */
export const subMenuOf = (screen: string, tab: string) => SUBMENUS[screen]?.items.find(s => s.tabs.includes(tab));
/* the link a sub-menu opens: its first tab; the screen's default tab needs no parameter */
export const subMenuHref = (screen: string, s: SubMenu) => { const m = SUBMENUS[screen]; return s.tabs[0] === m.defaultTab ? m.to : `${m.to}?tab=${s.tabs[0]}`; };
/* breadcrumb for the open sub-menu */
export const subCrumb = (screen: string, tab: string) => { const s = subMenuOf(screen, tab); return s ? [{ label: s.label }] : []; };

/* The tab row of a screen with sub-menus: only the tabs of the open sub-menu, and none when it covers one tab. */
export function SubTabs<T extends string>({ screen, tabs, value, onChange }: { screen: string; tabs: { id: T; label: string; count?: number; icon?: LucideIcon }[]; value: T; onChange: (v: T) => void }) {
  const s = subMenuOf(screen, value);
  if (!s || s.tabs.length < 2) return null;
  const shown = s.tabs.map(id => tabs.find(t => t.id === id)).filter((t): t is typeof tabs[number] => !!t); // in the sub-menu's order
  return <Tabs value={value} onChange={onChange} tabs={shown} />;
}
