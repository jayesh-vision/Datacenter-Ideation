import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { OpstralBtn } from '../ui/OpstralMark';
import { clockNow, getAlerts, getCommandCenter, hasGpuNow, resetDemo, useQuery, CURRENT_USER, PERSONAS, GEOS, setPersona, setGeo, usePersona, useGeo, vocabNow } from '../api';
import { MoneyIcon } from '../ui/Money';
import type { Persona } from '../api/types';
import type { Geo } from '../api';
import { fmtAgo, fmtDow, fmtShortDate, fmtTime } from '../lib/format';
import { Drawer } from '../ui/kit';
import { SevDot } from '../ui/status';
import { PageCtx, type PageMeta } from './page';
import { Palette } from './Palette';
import { Sentinel } from './Sentinel';
import { shellVisible } from './embed';
import { SUBMENUS, subMenuHref } from './submenus';

type Badge = 'incidents' | 'alerts' | 'changes';
/* `tab` binds an item to one `?tab=` of its screen (Commissioning); items whose screen is in SUBMENUS get sub-links (19-Oct-2026) */
const NAV: { group: string; items: { to: string; label: string; icon: I.LucideIcon; badge?: Badge; match?: RegExp; tab?: string }[] }[] = [
  { group: 'Overview', items: [{ to: '/', label: 'Command center', icon: I.LayoutDashboard }, { to: '/revenue', label: 'Revenue impact', icon: I.Coins }] },
  { group: 'Infrastructure', items: [
    { to: '/datacenters', label: 'Datacenters', icon: I.Building2, match: /^\/(datacenters|ne\/)/ },
    { to: '/facilities', label: 'Facilities', icon: I.Zap },
    { to: '/gpu', label: 'GPU Fleet', icon: I.Cpu }
  ] },
  { group: 'Operate', items: [
    { to: '/alerts', label: 'Alerts', icon: I.BellRing, badge: 'alerts' },
    { to: '/incidents', label: 'Incidents', icon: I.Siren, badge: 'incidents' },
    { to: '/changes', label: 'Change management', icon: I.ArrowLeftRight, badge: 'changes', match: /^\/changes/ }
  ] },
  /* the datacenter SOC (26-Oct-2026, user) */
  { group: 'Security', items: [{ to: '/secops', label: 'Security Ops', icon: I.ShieldHalf, match: /^\/secops/ }] },
  /* the inventory record behind operations (P2B merge, 13-Oct-2026) */
  { group: 'Plan & Build', items: [
    { to: '/planning', label: 'Planner', icon: I.DraftingCompass, match: /^\/plann(er|ing)/ },
    { to: '/capacity', label: 'Capacity', icon: I.Gauge },
    { to: '/ipam', label: 'IP & Network', icon: I.Network },
    { to: '/dcim', label: 'DCIM', icon: I.Server, match: /^\/dcim/ },
    { to: '/delivery', label: 'Delivery', icon: I.FolderKanban, match: /^\/delivery/ },
    { to: '/delivery', tab: 'commissioning', label: 'Commissioning', icon: I.ClipboardCheck, match: /^\/delivery/ },
    { to: '/workorders', label: 'Work orders', icon: I.ClipboardList, match: /^\/workorders/ }
  ] },
  { group: 'Admin', items: [{ to: '/compliance', label: 'Compliance', icon: I.ShieldCheck }, { to: '/customization', label: 'Customization', icon: I.SlidersHorizontal }] },
  /* how every record links to the others (user, 12-Oct-2026) */
  { group: 'Reference', items: [{ to: '/data-model', label: 'Data model', icon: I.Waypoints }, { to: '/help', label: 'Help & FAQ', icon: I.CircleHelp }] },
];
/* Services and customers appear only as impact (incident, device, site pages);
   capacity planning lives in the separate Plan & Build section. */

const PERSONA_ICON: Record<Persona, I.LucideIcon> = { network: I.Network, colocation: I.Building2, cloud: I.Cloud, enterprise: I.Landmark, neocloud: I.Cpu };

/* Top-bar persona switch: the business model the whole estate is modelled as.
   Changing it regenerates the mock estate and every screen refetches. */
function PersonaSwitch() {
  const { persona, def } = usePersona();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', f); window.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', f); window.removeEventListener('keydown', k); };
  }, [open]);
  const pick = async (p: Persona) => {
    setOpen(false);
    if (p === persona) return;
    setBusy(true);
    await setPersona(p);
    setBusy(false);
    /* entity pages (device, workload, customer, incident) hold ids that only exist in one persona */
    if (/^\/(ne|services|customers|incidents)\/./.test(loc.pathname)) nav('/datacenters');
  };
  const Icon = PERSONA_ICON[persona];
  return (
    <div ref={ref} className="persona" data-persona={persona}>
      <button type="button" className={`persona-btn${open ? ' is-open' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} title="Datacenter persona — changes the data model of the whole application" disabled={busy}>
        <span className="persona-ic">{busy ? <span className="spinner" /> : <Icon size={15} />}</span>
        <span className="persona-txt"><small>Persona</small><b>{def.label}</b></span>
        <I.ChevronDown size={14} className="persona-chev" />
      </button>
      {open && (
        <div className="persona-menu" role="listbox" aria-label="Datacenter persona">
          <div className="persona-menu-h">Model the estate as</div>
          {PERSONAS.map(p => { const PI = PERSONA_ICON[p.id]; return (
            <button key={p.id} type="button" role="option" aria-selected={p.id === persona} className={`persona-opt${p.id === persona ? ' is-on' : ''}`} onClick={() => pick(p.id)}>
              <span className="persona-ic"><PI size={16} /></span>
              <span className="persona-opt-txt"><b>{p.label}</b><span>{p.tagline}</span></span>
              {p.id === persona && <I.Check size={15} className="persona-check" />}
            </button>
          ); })}
          <div className="persona-menu-f">Same sites, power and cooling · different racks, {PERSONAS.find(p => p.id === persona)!.vocab.customers.toLowerCase()} and {PERSONAS.find(p => p.id === persona)!.vocab.services.toLowerCase()}</div>
        </div>
      )}
    </div>
  );
}

/* Top-bar geography switch: India or the USA. Changing it regenerates the estate with that
   geography's sites, customers, people and currency; site IDs change, so entity pages are left. */
function GeoSwitch() {
  const { geo, def } = useGeo();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', f); window.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', f); window.removeEventListener('keydown', k); };
  }, [open]);
  const pick = async (g: Geo) => {
    setOpen(false);
    if (g === geo) return;
    setBusy(true);
    await setGeo(g);
    setBusy(false);
    if (/^\/(datacenters|ne|services|customers|incidents)\/./.test(loc.pathname) || /[?&]dc=/.test(loc.search)) nav('/datacenters');
  };
  return (
    <div ref={ref} className="persona geo" data-geo={geo}>
      <button type="button" className={`persona-btn${open ? ' is-open' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} title="Geography — where the estate is, and its currency" disabled={busy}>
        <span className="persona-ic">{busy ? <span className="spinner" /> : <I.Globe size={15} />}</span>
        <span className="persona-txt"><small>Geography</small><b>{def.label}</b></span>
        <I.ChevronDown size={14} className="persona-chev" />
      </button>
      {open && (
        <div className="persona-menu" role="listbox" aria-label="Geography">
          <div className="persona-menu-h">Model the estate in</div>
          {GEOS.map(g => (
            <button key={g.id} type="button" role="option" aria-selected={g.id === geo} className={`persona-opt${g.id === geo ? ' is-on' : ''}`} onClick={() => pick(g.id)}>
              <span className="persona-ic"><I.MapPin size={16} /></span>
              <span className="persona-opt-txt"><b>{g.label}</b><span>{g.tagline}</span></span>
              {g.id === geo && <I.Check size={15} className="persona-check" />}
            </button>
          ))}
          <div className="persona-menu-f">Same equipment, alarms and story · different sites, {vocabNow().customers.toLowerCase()}, people and currency</div>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const loc = useLocation();
  const nav = useNavigate();
  const [meta, setMeta] = useState<PageMeta>({ crumbs: [], ctx: {} });
  /* ?shell=false (iframe embedding) hides the menu and the header — see shell/embed.ts */
  const shell = shellVisible();
  const { vocab } = usePersona();
  /* the money page is "Revenue impact" for an operator and "Business impact" for an enterprise IT estate */
  const navLabel = (it: { to: string; label: string }) => (it.to === '/revenue' ? vocab.money.impact : it.label);
  /* AI & GPU appears only when the estate runs GPUs or hosts AI cages (not the telco model) */
  const showItem = (it: { to: string }) => it.to !== '/gpu' || hasGpuNow();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('dco.rail') === '1'; } catch { return false; } });
  const [palette, setPalette] = useState(false);
  const [bell, setBell] = useState(false);
  const [sentinel, setSentinel] = useState<{ open: boolean; q?: string }>({ open: false });
  const { data: cc } = useQuery(getCommandCenter, []);
  const { data: hot } = useQuery(() => getAlerts({ state: 'open' }), []);

  useEffect(() => { try { localStorage.setItem('dco.rail', collapsed ? '1' : '0'); } catch { /* storage blocked */ } }, [collapsed]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); } };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  const badge = useMemo<Record<Badge, { n: number; c: string } | null>>(() => ({
    incidents: cc?.pulse.breaching ? { n: cc.pulse.breaching, c: 'is-hot' } : null,
    alerts: cc ? { n: cc.pulse.critMajor, c: 'is-warn' } : null,
    changes: cc ? { n: cc.attention.find(a => a.key === 'chg')?.n ?? 0, c: '' } : null
  }), [cc]);
  const openSentinel = useCallback((q?: string) => setSentinel({ open: true, q }), []);
  const ctxValue = useMemo(() => ({ set: setMeta, openSentinel }), [openSentinel]);
  const now = clockNow();
  const curTab = new URLSearchParams(loc.search).get('tab') ?? '';
  const crit = (hot ?? []).filter(a => a.severity === 'critical' || a.severity === 'major').slice(0, 30);

  return (
    <PageCtx.Provider value={ctxValue}>
      <div className={`shell${collapsed ? ' is-collapsed' : ''}${shell ? '' : ' is-embed'}`}>
        {shell && <aside className="rail">
          <Link to="/" className="rail-brand">
            <span className="rail-logo"><I.Server size={18} /></span>
            <span className="rail-brand-text"><b>Data Center Ops</b><span>NetSingularity · DCO</span></span>
          </Link>
          <nav className="rail-scroll">
            {NAV.map(g => (
              <div className="rail-group" key={g.group}>
                <div className="rail-group-label">{g.group}</div>
                {g.items.filter(showItem).map(it => {
                  const b = it.badge ? badge[it.badge] : null;
                  const onRoute = it.match ? it.match.test(loc.pathname) : it.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(it.to);
                  /* a tab-bound item owns its tab; the screen's own item takes every other tab */
                  const boundTabs = NAV.flatMap(x => x.items).filter(x => x.to === it.to && x.tab).map(x => x.tab as string);
                  const active = onRoute && (it.tab ? curTab === it.tab : !boundTabs.includes(curTab));
                  const key = it.tab ? undefined : Object.keys(SUBMENUS).find(k => SUBMENUS[k].to === it.to);
                  const menu = key ? SUBMENUS[key] : undefined;
                  /* sub-links show under the open screen; one is lit only on the screen itself (not on its detail pages) */
                  const lit = menu && loc.pathname === menu.to ? menu.items.find(s => s.tabs.includes(curTab || menu.defaultTab)) : undefined;
                  return (
                    <div key={it.to + (it.tab ?? '')}>
                      <NavLink to={it.tab ? `${it.to}?tab=${it.tab}` : it.to} end className={() => `rail-link${active ? ' is-active' : ''}`} title={collapsed ? navLabel(it) : undefined}>
                        {it.to === '/revenue' ? <MoneyIcon size={18} /> : <it.icon size={18} />}<span>{navLabel(it)}</span>
                        {b && b.n > 0 && <em className={`rail-badge ${b.c}`} style={{ fontStyle: 'normal' }}>{b.n}</em>}
                        {b && b.n > 0 && <i className="rail-dot" />}
                      </NavLink>
                      {menu && key && active && <div className="rail-sub">
                        {menu.items.map(s => <NavLink key={s.id} to={subMenuHref(key, s)} className={() => `rail-link rail-sublink${lit?.id === s.id ? ' is-active' : ''}`} title={s.desc}><span>{s.label}</span></NavLink>)}
                      </div>}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="rail-foot">
            <button type="button" className="rail-link" style={{ border: 0, background: 'transparent', cursor: 'pointer', width: '100%' }} onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
              {collapsed ? <I.PanelLeftOpen size={18} /> : <I.PanelLeftClose size={18} />}<span>Collapse</span>
            </button>
          </div>
        </aside>}

        <div className="main">
          {shell && <header className="topbar">
            <nav className="topbar-crumbs" aria-label="Breadcrumb">
              {meta.crumbs.map((c, i) => (
                <span key={i} className="row" style={{ gap: 6 }}>
                  {i > 0 && <I.ChevronRight size={14} className="faint" />}
                  {c.to && i < meta.crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : <b>{c.label}</b>}
                </span>
              ))}
            </nav>
            <div className="topbar-spacer" />
            <PersonaSwitch />
            <GeoSwitch />
            <button type="button" className="topbar-search" onClick={() => setPalette(true)}><I.Search size={15} /><span className="ellipsis">Search estate…</span><kbd>⌘K</kbd></button>
            <OpstralBtn onClick={() => openSentinel()} />
            <span className="topbar-clock" title="Mock operations clock — data is a deterministic snapshot"><span className="live-dot" />{fmtDow(now)} {fmtShortDate(now)} · {fmtTime(now)}</span>
            <button type="button" className="nst-icon-btn topbar-icon" title="Critical & major alarms" onClick={() => setBell(true)}><I.Bell size={17} />{crit.length > 0 && <span className="count">{crit.length > 9 ? '9+' : crit.length}</span>}</button>
            <span className="avatar-me" title={`${CURRENT_USER} · Global operations`}>JV</span>
          </header>}
          <Outlet />
        </div>

        <Palette open={palette} onClose={() => setPalette(false)} />
        <Sentinel open={sentinel.open} initial={sentinel.q} ctx={meta.ctx} onClose={() => setSentinel({ open: false })} />
        <Drawer open={bell} onClose={() => setBell(false)} title="Critical & major alarms" sub="Newest first · click to open the device or site" width={460}>
          {crit.map(a => (
            <button key={a.id} type="button" onClick={() => { setBell(false); nav(a.neId ? `/ne/${a.neId}?tab=alerts` : `/datacenters/${a.dcId}?tab=attention`); }} className="card bell-row">
              <SevDot s={a.severity} />
              <span style={{ flex: 1, minWidth: 0 }}><b className="strong" style={{ fontSize: 13, display: 'block' }}>{a.title}</b><span className="muted" style={{ fontSize: 12 }}>{a.neId ?? a.dcId}{a.ifName ? ` · ${a.ifName}` : ''} · {a.code}</span></span>
              <span className="faint num" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{fmtAgo(a.start, now)}</span>
            </button>
          ))}
          <Link to="/alerts" className="panel-link" onClick={() => setBell(false)}>Open alerts console<I.ChevronRight size={14} /></Link>
          <button type="button" className="panel-link" style={{ marginTop: 6 }} onClick={() => { resetDemo(); setBell(false); }}><I.RotateCcw size={13} />Reset demo data</button>
        </Drawer>
      </div>
    </PageCtx.Provider>
  );
}
