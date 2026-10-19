/* Card view for the planner lists (user, 19-Oct-2026: "a card view for Plans and Templates, 3 or 4 to a row"). The list ⇄ tiles switch
   is ListToolbar's `layout`; the choice is remembered per list in this browser. Cards carry the same figures as the table row and open
   the same thing (plan page / template drawer). Classes are `plc-` (planner CSS is global; `pn-card` is the wizard's). */
import { useState, type ReactNode } from 'react';
import * as I from 'lucide-react';
import type * as T from '../../planner/p2b/types';
import type { DcTypeProfile } from '../../planner/p2b/dcTypes';
import type { PlanRow } from './Planner';
import { SoftMeterCell } from './parts';
import { PlanStatusChip, SCOPE_ICON, SCOPE_LABEL, TemplateStatusChip, date, kw, money, num } from './common';

export type ListLayout = 'list' | 'tiles';
export function useListLayout(key: string): [ListLayout, (v: ListLayout) => void] {
  const k = `dco.pn.layout.${key}`;
  const [v, setV] = useState<ListLayout>(() => { try { return localStorage.getItem(k) === 'tiles' ? 'tiles' : 'list'; } catch { return 'list'; } });
  return [v, n => { setV(n); try { localStorage.setItem(k, n); } catch { /* storage blocked */ } }];
}

/* the toolbar stays on top exactly as in the list view */
export function CardGrid({ toolbar, empty, children }: { toolbar: ReactNode; empty: ReactNode; children: ReactNode[] }) {
  return (
    <div className="dt">
      <div className="dt-toolbar">{toolbar}</div>
      {children.length ? <div className="plc-grid">{children}</div> : <div className="plc-empty">{empty}</div>}
    </div>
  );
}

const Fig = ({ l, v, tone, wide }: { l: string; v: ReactNode; tone?: 'bad' | 'warn'; wide?: boolean }) => <span className={`plc-fig${tone ? ` is-${tone}` : ''}${wide ? ' is-wide' : ''}`}><small>{l}</small><b>{v}</b></span>;

export function PlanCard({ r, onOpen, menu }: { r: PlanRow; onOpen: () => void; menu: ReactNode }) {
  const p = r.plan, Ico = SCOPE_ICON[p.scope] ?? I.ClipboardList;
  const rules = r.ev.hardFails ? { v: `${r.ev.hardFails} fail`, tone: 'bad' as const } : r.ev.softWarns ? { v: `${r.ev.softWarns} warn`, tone: 'warn' as const } : { v: 'Pass' };
  return (
    <div className="plc" role="link" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}>
      <div className="plc-top">
        <span className="plc-ic"><Ico size={16} /></span>
        <span className="plc-kind">{SCOPE_LABEL[p.scope]}</span>
        <PlanStatusChip s={p.status} />
      </div>
      <b className="plc-t">{p.title}</b>
      <span className="plc-sub"><span className="mono">{p.plnId}</span>{p.revision && p.revision !== 'A' ? ` · rev ${p.revision}` : ''} · {r.site}</span>
      <div className="plc-figs">
        <Fig l="IT power" v={kw(p.designPowerKw)} />
        <Fig l="CapEx" v={money(p.baseline?.capexTotal ?? r.capex)} />
        <Fig l="Needed by" v={date(p.targetGoLive)} />
        <Fig l="Rules" v={rules.v} tone={rules.tone} />
      </div>
      <div className="plc-ready"><small>Readiness</small><SoftMeterCell pct={r.ev.readinessPct} /></div>
      <div className="plc-foot" onClick={e => e.stopPropagation()}>
        <span><I.User size={12} />{p.ownerName}</span><span><I.Clock size={12} />{date(p.updatedAt)}</span>
        <span className="plc-menu">{menu}</span>
      </div>
    </div>
  );
}

export function PlanTypeCard({ t, uses, variantOf, aspects, onOpen }: { t: T.PlannerTemplate; uses: number; variantOf?: string; aspects: (a: T.PlannerAspect) => string; onOpen: () => void }) {
  const Ico = (t.scope && SCOPE_ICON[t.scope]) || I.LayoutTemplate;
  const full = t.requiredAspects.filter(x => x.depth === 'full'), brief = t.requiredAspects.filter(x => x.depth === 'summary');
  return (
    <div className="plc" role="link" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}>
      <div className="plc-top"><span className="plc-ic"><Ico size={16} /></span><span className="plc-kind">Plan type · v{t.version}</span><TemplateStatusChip s={t.status} /></div>
      <b className="plc-t is-1" title={t.name}>{t.name}</b>
      <p className="plc-d">{variantOf ? `Variant of ${variantOf} · ` : ''}{t.description}</p>
      <div className="plc-figs">
        <Fig wide l="Areas covered" v={<>{full.length} in full{brief.length ? <span className="plc-light"> · {brief.length} brief</span> : null}</>} />
        <Fig l="Becomes" v={t.executesAs ? t.executesAs[0].toUpperCase() + t.executesAs.slice(1) : '—'} />
        <Fig l="Plans" v={uses} />
      </div>
      <div className="plc-chips" title={full.map(x => aspects(x.aspect)).join(', ')}>{full.slice(0, 4).map(x => <span key={x.aspect}>{aspects(x.aspect)}</span>)}{full.length > 4 && <span>+{full.length - 4}</span>}</div>
      <div className="plc-foot"><span className="plc-appr" title={t.approvalPath.join(' → ')}><I.ShieldCheck size={12} />{t.approvalPath.length ? t.approvalPath.join(' → ') : 'No approval'}</span></div>
    </div>
  );
}

export function SiteTypeCard({ p, uses, status, range, onOpen }: { p: DcTypeProfile; uses: number; status?: T.PlannerTemplate['status']; range: (r: [number, number | null] | null | undefined, f: (n: number) => string) => string; onOpen?: () => void }) {
  return (
    <div className={`plc${onOpen ? '' : ' is-static'}`} role={onOpen ? 'link' : undefined} tabIndex={onOpen ? 0 : undefined} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen?.(); }}>
      <div className="plc-top"><span className="plc-ic"><I.Building2 size={16} /></span><span className="plc-kind">{p.segment}</span>{status ? <TemplateStatusChip s={status} /> : <span className="vw-label">No profile</span>}</div>
      <b className="plc-t is-1" title={p.name}>{p.name}</b>
      <div className="plc-figs">
        <Fig l="Typical size" v={range(p.powerKw, kw)} wide />
        <Fig l="Racks" v={range(p.typicalRacks, n => num(n))} />
        <Fig l="kW per rack" v={p.kwPerRack ? `${num(p.kwPerRack[0])} – ${num(p.kwPerRack[1])}` : '—'} />
        <Fig l="PUE target" v={p.pueTarget ? num(p.pueTarget, 2) : '—'} />
        <Fig l="Tier" v={p.defaultTier} />
        <span className="plc-fig is-wide is-text"><small>Cooling</small><b>{p.cooling}</b></span>
      </div>
      <div className="plc-foot"><span><I.ClipboardList size={12} />{uses === 1 ? '1 plan uses it' : `${uses} plans use it`}</span></div>
    </div>
  );
}

export function ModuleCard({ t, kind, onOpen }: { t: T.PlannerTemplate; kind: string; onOpen: () => void }) {
  return (
    <div className="plc" role="link" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}>
      <div className="plc-top"><span className="plc-ic"><I.Blocks size={16} /></span><span className="plc-kind">{kind}</span><TemplateStatusChip s={t.status} /></div>
      <b className="plc-t is-1" title={t.name}>{t.name}</b>
      <p className="plc-d">{t.description}</p>
      <div className="plc-foot"><span><I.User size={12} />{t.ownerName}</span><span className="mono plc-menu">v{t.version}</span></div>
    </div>
  );
}
