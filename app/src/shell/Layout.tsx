import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getAlerts, getCommandCenter, resetDemo, useQuery, CURRENT_USER } from '../api';
import { fmtAgo, fmtDow, fmtShortDate, fmtTime } from '../lib/format';
import { Drawer } from '../ui/kit';
import { SevDot } from '../ui/status';
import { PageCtx, type PageMeta } from './page';
import { Palette } from './Palette';
import { Sentinel } from './Sentinel';

type Badge = 'incidents' | 'alerts' | 'changes';
const NAV: { group: string; items: { to: string; label: string; icon: I.LucideIcon; badge?: Badge; match?: RegExp }[] }[] = [
  { group: 'Overview', items: [{ to: '/', label: 'Command center', icon: I.LayoutDashboard }] },
  { group: 'Infrastructure', items: [
    { to: '/datacenters', label: 'Datacenters', icon: I.Building2, match: /^\/(datacenters|ne\/)/ },
    { to: '/topology', label: 'Topology', icon: I.Network }
  ] },
  { group: 'Operate', items: [
    { to: '/alerts', label: 'Alerts', icon: I.BellRing, badge: 'alerts' },
    { to: '/incidents', label: 'Incidents', icon: I.Siren, badge: 'incidents' },
    { to: '/changes', label: 'Changes & maintenance', icon: I.ArrowLeftRight, badge: 'changes' }
  ] },
  { group: 'Services', items: [
    { to: '/services', label: 'Network services', icon: I.Waypoints },
    { to: '/customers', label: 'Customers', icon: I.Users }
  ] },
  { group: 'Plan', items: [
    { to: '/capacity', label: 'Capacity & forecast', icon: I.Gauge },
    { to: '/facilities', label: 'Facilities', icon: I.Zap }
  ] }
];

export function Layout() {
  const loc = useLocation();
  const nav = useNavigate();
  const [meta, setMeta] = useState<PageMeta>({ crumbs: [], ctx: {} });
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
  const crit = (hot ?? []).filter(a => a.severity === 'critical' || a.severity === 'major').slice(0, 30);

  return (
    <PageCtx.Provider value={ctxValue}>
      <div className={`shell${collapsed ? ' is-collapsed' : ''}`}>
        <aside className="rail">
          <Link to="/" className="rail-brand">
            <span className="rail-logo"><I.Server size={18} /></span>
            <span className="rail-brand-text"><b>Data Center Ops</b><span>NetSingularity · DCO</span></span>
          </Link>
          <nav className="rail-scroll">
            {NAV.map(g => (
              <div className="rail-group" key={g.group}>
                <div className="rail-group-label">{g.group}</div>
                {g.items.map(it => {
                  const b = it.badge ? badge[it.badge] : null;
                  const active = it.match ? it.match.test(loc.pathname) : it.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(it.to);
                  return (
                    <NavLink key={it.to} to={it.to} end className={() => `rail-link${active ? ' is-active' : ''}`} title={collapsed ? it.label : undefined}>
                      <it.icon size={18} /><span>{it.label}</span>
                      {b && b.n > 0 && <em className={`rail-badge ${b.c}`} style={{ fontStyle: 'normal' }}>{b.n}</em>}
                      {b && b.n > 0 && <i className="rail-dot" />}
                    </NavLink>
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
        </aside>

        <div className="main">
          <header className="topbar">
            <nav className="topbar-crumbs" aria-label="Breadcrumb">
              {meta.crumbs.map((c, i) => (
                <span key={i} className="row" style={{ gap: 6 }}>
                  {i > 0 && <I.ChevronRight size={14} className="faint" />}
                  {c.to && i < meta.crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : <b>{c.label}</b>}
                </span>
              ))}
            </nav>
            <div className="topbar-spacer" />
            <button type="button" className="topbar-search" onClick={() => setPalette(true)}><I.Search size={15} /><span className="ellipsis">Search estate…</span><kbd>⌘K</kbd></button>
            <button type="button" className="sentinel-btn" onClick={() => openSentinel()}><I.Sparkles size={15} />Ask Sentinel</button>
            <span className="topbar-clock" title="Mock operations clock — data is a deterministic snapshot"><span className="live-dot" />{fmtDow(now)} {fmtShortDate(now)} · {fmtTime(now)}</span>
            <button type="button" className="nst-icon-btn topbar-icon" title="Critical & major alarms" onClick={() => setBell(true)}><I.Bell size={17} />{crit.length > 0 && <span className="count">{crit.length > 9 ? '9+' : crit.length}</span>}</button>
            <span className="avatar-me" title={`${CURRENT_USER} · Global operations`}>JV</span>
          </header>
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
