import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getSiteAccess, useQuery } from '../../api';
import type { AccessEvent, AccessPersonType, AccessVisit, SecException, SiteAccess } from '../../api/types';
import { Drawer, Empty, KV, Panel } from '../../ui/kit';
import { Loading } from '../../shell/page';
import { DataTable, type Col } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { TimeChart } from '../../charts/TimeChart';
import { SummaryStrip } from './SummaryStrip';
import { fmtAgo, fmtDate, fmtDateTime, fmtDur, fmtNum, fmtShortDate, fmtTime } from '../../lib/format';
import type { SiteData } from './Site';
import '../../styles/access.css';

const TYPE_TONE: Record<AccessPersonType, string> = { Staff: 'info', Security: 'neutral', Contractor: 'purple', Visitor: 'orange', Tenant: 'cyan', Delivery: 'neutral' };
const TYPE_ICON: Record<AccessPersonType, I.LucideIcon> = { Staff: I.IdCard, Security: I.ShieldCheck, Contractor: I.HardHat, Visitor: I.UserRound, Tenant: I.Building, Delivery: I.Package };
const SEV_TONE = { High: 'error', Medium: 'warning', Low: 'neutral' } as const;
const STATUS_TONE = { Open: 'error', 'Under review': 'warning', Closed: 'success' } as const;
const TYPES: AccessPersonType[] = ['Staff', 'Security', 'Contractor', 'Visitor', 'Tenant', 'Delivery'];

const TypeChip = ({ t }: { t: AccessPersonType }) => <span className={`vw-chip vw-chip--${TYPE_TONE[t]} cmd-chip`}>{t}</span>;
const refTo = (ref?: string) => !ref ? undefined : ref.startsWith('INC') ? `/incidents/${ref}` : ref.startsWith('CHG') ? `/changes/${ref}` : undefined;
const RefLink = ({ r }: { r?: string }) => { const to = refTo(r); return !r ? null : to ? <Link to={to} className="acc-ref" onClick={e => e.stopPropagation()}>{r}</Link> : <span className="acc-ref is-plain">{r}</span>; };

/* Access & security (14-Oct-2026, user): the physical security audit of the building. Who is inside right now, every badge
   entry and exit in the last 24 h (door, direction, method, granted or refused and why, on whose authority), the exceptions
   the security team reviews, and the quarterly access-rights recertification. Data = mock/access.ts; the door counts are the
   same ones Facilities → Environment shows. */
export function Access({ data }: { data: SiteData }) {
  const { dc } = data;
  const { data: a, reload } = useQuery(() => getSiteAccess(dc.id), [dc.id]);
  if (!a) return <Loading label="Loading access log" />;
  if (!a.live) return <Panel title="Access & security"><Empty icon={I.DoorClosed} title="Site not live">{dc.name} has not been handed over; the access-control system records no badge traffic yet.</Empty></Panel>;
  return <AccessBody a={a} reload={reload} />;
}

function AccessBody({ a, reload }: { a: SiteAccess; reload: () => void }) {
  const now = clockNow();
  const [sp, setSp] = useSearchParams();
  const applyParams = useParamPatch();
  const q = sp.get('aq') ?? '', res = sp.get('ares') ?? '', type = sp.get('atype') ?? '', door = sp.get('adoor') ?? '', dir = sp.get('adir') ?? '';
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
  const toLog = (patch: Record<string, string>) => { set({ aq: '', ares: '', atype: '', adoor: '', adir: '', ...patch }); requestAnimationFrame(() => document.querySelector('.acc-log')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
  const [openVisit, setOpenVisit] = useState<AccessVisit | null>(null);
  const [openExc, setOpenExc] = useState<SecException | null>(null);
  const [excView, setExcView] = useState<'open' | 'all'>('open');
  const t = a.totals;
  const visitOf = (id?: string) => a.visits.find(v => v.id === id) ?? null;

  const shown = useMemo(() => a.events.filter(e => (!res || e.result === res) && (!type || e.type === type) && (!door || e.doorId === door) && (!dir || e.dir === dir)
    && (!q || `${e.person} ${e.company} ${e.badge} ${e.door} ${e.zone} ${e.ref ?? ''} ${e.reason ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [a.events, q, res, type, door, dir]);

  const onSite = a.visits.filter(v => v.onSite).sort((x, y) => TYPES.indexOf(x.type) - TYPES.indexOf(y.type) || x.entered - y.entered);
  const exc = excView === 'open' ? a.exceptions.filter(x => x.status !== 'Closed') : a.exceptions;
  /* two biggest groups, the rest folded so the strip never cuts */
  const grp = TYPES.filter(k => t.onSiteByType[k]).sort((x, y) => (t.onSiteByType[y] ?? 0) - (t.onSiteByType[x] ?? 0));
  const rest = grp.slice(1).reduce((n, k) => n + (t.onSiteByType[k] ?? 0), 0);
  const byTypeTxt = grp.length ? `${t.onSiteByType[grp[0]]} ${grp[0].toLowerCase()}${rest ? ` · ${rest} other${rest === 1 ? '' : 's'}` : ''}` : '';
  const entry = a.doors.find(d => d.kind === 'Building entry');

  const cols: Col<AccessEvent>[] = [
    { key: 'at', header: 'Time', sort: e => e.at, render: e => <span className="cell-2"><span className="num">{fmtTime(e.at)}</span><small>{fmtShortDate(e.at)}</small></span> },
    { key: 'door', header: 'Door', wrap: true, sort: e => e.door, render: e => <span className="cell-2"><span>{e.door}</span><small>{e.zone}</small></span> },
    { key: 'dir', header: 'Direction', sort: e => e.dir, render: e => <span className={`acc-dir is-${e.dir.toLowerCase()}`}>{e.dir === 'In' ? <I.LogIn size={13} /> : <I.LogOut size={13} />}{e.dir}</span> },
    { key: 'who', header: 'Person', wrap: true, sort: e => e.person, render: e => <span className="cell-2"><span>{e.person}</span><small>{e.company} · {e.badge}</small></span> },
    { key: 'type', header: 'Type', sort: e => e.type, render: e => <TypeChip t={e.type} /> },
    { key: 'method', header: 'Credential', hideBelow: 1400, sort: e => e.method, render: e => <span className="faint nowrap">{e.method}</span> },
    { key: 'res', header: 'Result', wrap: true, sort: e => (e.result === 'Denied' ? 1 : 0), render: e => e.result === 'Granted' ? <span className="vw-chip vw-chip--success cmd-chip">Granted</span>
      : <span className="cell-2"><span className="vw-chip vw-chip--error cmd-chip">Denied</span><small>{e.reason}</small></span> },
    { key: 'auth', header: 'Authorised by', wrap: true, render: e => <Auth v={visitOf(e.visitId)} /> }
  ];

  return (
    <div className="col acc" style={{ gap: 16 }}>
      <SummaryStrip items={[
        { key: 'on', label: 'On site now', value: t.onSite, sub: byTypeTxt || 'nobody', info: `${grp.map(k => `${t.onSiteByType[k]} ${k.toLowerCase()}`).join(', ') || 'Nobody'} on site now. ` + 'People whose last badge read at the main entrance was In: the building\'s live occupancy, as used for a fire roll-call. Split by staff, security, contractors, visitors, tenants and couriers.' },
        { key: 'in', label: 'Entries · 24 h', value: fmtNum(t.entries24h), sub: `${fmtNum(t.exits24h)} exits`, onClick: () => toLog({ adoor: entry?.id ?? '', adir: 'In' }), active: door === entry?.id && dir === 'In',
          info: 'Granted entries through the main entrance mantrap in the last 24 hours, and the exits recorded there. Click to list the entries in the audit trail.' },
        { key: 'den', label: 'Denied · 24 h', value: t.denied24h, sub: t.denied24h ? `at ${t.deniedDoors} door${t.deniedDoors === 1 ? '' : 's'}` : 'none refused', tone: t.denied24h >= 4 ? 'warn' : undefined, onClick: () => toLog({ ares: 'Denied' }), active: res === 'Denied',
          info: 'Badge reads the access-control system refused in the last 24 hours at any door (zone not authorised, expired badge, wrong PIN, biometric mismatch, anti-passback). Click to list them.' },
        { key: 'exc', label: 'Security exceptions', value: t.open, sub: t.open ? `${t.high} high · ${a.exceptions.length - t.open} closed` : `${a.exceptions.length} closed in 24 h`, tone: t.high ? 'bad' : t.open ? 'warn' : undefined,
          info: 'Exceptions still open or under review: tailgating, forced or held doors, repeated denials, after-hours entry, unescorted visitors, overstays and badges not returned. Red when a high-severity one is open.' },
        { key: 'vis', label: 'Visitors · 24 h', value: t.visitors24h, sub: t.unescorted ? `${t.unescorted} unescorted` : t.visitors24h ? 'all escorted' : 'none', tone: t.unescorted ? 'warn' : undefined, onClick: () => toLog({ atype: 'Visitor' }), active: type === 'Visitor',
          info: 'Visitors signed in at the security desk in the last 24 hours, each with a host and an escort. Click to list their badge events.' },
        { key: 'doors', label: 'Doors secured', value: `${t.secured}/${t.doors}`, sub: t.heldOpen ? `${t.heldOpen} held open` : 'all locked', tone: t.heldOpen ? 'warn' : undefined,
          info: 'Controlled doors (mantrap, hall, plant, meet-me and tenant cage doors) that are closed and locked now. A door held open is under an approved change with a guard posted.' }
      ]} />

      <div className="acc-two">
        <Panel title="On site now" icon={I.Users} count={onSite.length} className="acc-fixed" sub="Live occupancy from the mantrap · roll-call list"
          info="Everyone in the building now (badged In at the main entrance and not yet Out), with their company, the zone of their last badge read, why they are here and who authorised it. Click a person to see their visit and every badge read.">
          {!onSite.length ? <Empty icon={I.Users} title="Nobody on site" /> : (
            <ul className="acc-people">
              {onSite.map(v => { const Ic = TYPE_ICON[v.type]; return (
                <li key={v.id}><button type="button" onClick={() => setOpenVisit(v)}>
                  <span className={`acc-av tone-${TYPE_TONE[v.type]}`}><Ic size={15} /></span>
                  <span className="acc-p-main"><b>{v.person}</b><small>{v.company} · {v.purpose}</small></span>
                  <span className="acc-p-where"><span>{v.where}</span><small>in since {fmtTime(v.entered)} · {fmtDur((now - v.entered) / 60000)}</small></span>
                  <span className="acc-p-auth">{v.ref ? <RefLink r={v.ref} /> : <TypeChip t={v.type} />}{v.escort && <small>escort {v.escort.split(' ')[0]}</small>}</span>
                </button></li>
              ); })}
            </ul>
          )}
        </Panel>
        <Panel title="Security exceptions" icon={I.ShieldAlert} count={exc.length} className="acc-fixed" sub="What the security team reviews · last 24 h"
          info="Events the access-control and CCTV systems flag for review: tailgating at the mantrap, doors forced or held open, anti-passback violations, repeated denials, after-hours entry without a change, unescorted visitors, overstays and visitor badges not returned. Each has an owner, the CCTV evidence and, once closed, the outcome. Click one for details."
          actions={<div className="seg is-sm" role="radiogroup">{(['open', 'all'] as const).map(k => <button key={k} type="button" role="radio" aria-checked={excView === k} className={excView === k ? 'is-active' : ''} onClick={() => setExcView(k)}>{k === 'open' ? `Open · ${t.open}` : `All · ${a.exceptions.length}`}</button>)}</div>}>
          {!exc.length ? <Empty icon={I.ShieldCheck} title={excView === 'open' ? 'No open exceptions' : 'No exceptions in 24 h'}>{excView === 'open' && a.exceptions.length ? `${a.exceptions.length} closed in the last 24 hours.` : 'Every badge read matched an authorisation.'}</Empty> : (
            <ul className="acc-exc">
              {exc.map(x => (
                <li key={x.id}><button type="button" onClick={() => setOpenExc(x)}>
                  <span className={`acc-sev is-${x.severity.toLowerCase()}`} />
                  <span className="acc-x-main">
                    <span className="acc-x-h"><b>{x.kind}</b><span className={`vw-chip vw-chip--${SEV_TONE[x.severity]} cmd-chip`}>{x.severity}</span></span>
                    <small>{x.detail}</small>
                    <small className="faint">{[x.door, x.person, `${fmtTime(x.at)} · ${fmtAgo(x.at, now)}`].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className={`vw-chip vw-chip--${STATUS_TONE[x.status]} cmd-chip`}>{x.status}</span>
                </button></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="acc-three">
        <Panel title="Entries and exits · last 24 h" icon={I.ChartColumn} className="acc-chart" sub={`Main entrance, per hour · ${fmtNum(t.events24h)} badge reads at all doors`}
          info="Granted entries and exits at the main entrance mantrap for each hour of the last 24 hours (shift changes show as peaks), with refused badge reads at any door as a line.">
          <TimeChart labels={a.hourly.map((h, i) => (i % 3 === 0 ? fmtTime(h.at) : ''))} fullLabels={a.hourly.map(h => `${fmtTime(h.at)}–${fmtTime(h.at + 3600e3)}`)} height={210} yMin={0}
            series={[
              { key: 'in', label: 'Entries', color: 'var(--primaryColor500)', kind: 'bar', values: a.hourly.map(h => h.in) },
              { key: 'out', label: 'Exits', color: 'var(--vw-color-slate-300)', kind: 'bar', values: a.hourly.map(h => h.out) },
              { key: 'den', label: 'Denied', color: 'var(--vw-color-red-500)', kind: 'line', values: a.hourly.map(h => h.denied) }
            ]} />
        </Panel>
        <Panel title="Doors and readers" icon={I.DoorClosed} count={a.doors.length} flush className="acc-doors" sub="Badge reads per door · 24 h · click to filter"
          info="Every controlled door with its credential (card, PIN, biometric), state, badge reads and refusals in the last 24 hours. The same counts appear on Facilities → Environment. Click a door to list its reads.">
          <ul className="acc-door-list">
            {a.doors.map(d => (
              <li key={d.id}><button type="button" className={door === d.id ? 'is-on' : ''} onClick={() => toLog({ adoor: door === d.id ? '' : d.id })}>
                <span className="acc-d-main"><b>{d.name}</b><small>{d.zone} · {d.reader}</small></span>
                <span className="acc-d-n"><span className="num">{d.events24h}</span>{d.denied24h > 0 && <small className="is-bad">{d.denied24h} denied</small>}</span>
                <span className={`vw-chip vw-chip--${d.state === 'Secured' ? 'success' : d.state === 'Held open' ? 'warning' : 'error'} cmd-chip`}>{d.state}</span>
              </button></li>
            ))}
          </ul>
        </Panel>
        <Panel title="Access rights review" icon={I.ClipboardCheck} className="acc-review" sub={`${a.review.badges} active badges for this site`}
          info="The quarterly recertification auditors ask for (ISO 27001 A.5.18, SOC 2 CC6.2, TIA-942 physical security): who holds a badge for this site, when access was last reviewed, badges that outlived their contract or went unused, and how long the evidence is kept.">
          <div className="acc-badges">{a.review.byType.map(b => <span key={b.type}><b className="num">{b.n}</b>{b.type.toLowerCase()}</span>)}</div>
          <ul className="acc-find">
            {a.review.findings.map(f => <li key={f.text} className={`is-${f.tone}`}>{f.tone === 'ok' ? <I.CircleCheck size={14} /> : <I.TriangleAlert size={14} />}{f.text}</li>)}
          </ul>
          <KV cols={2} items={[['Last review', fmtDate(a.review.lastReview)], ['Reviewer', a.review.reviewer], ['CCTV kept', `${a.review.cctvDays} days`], ['Access log kept', `${a.review.logDays / 365} year`]]} />
        </Panel>
      </div>

      <section className="card acc-log">
        <div className="acc-log-h"><span className="vw-card-title">Access audit trail</span><span className="vw-footer-meta">Every badge read in the last 24 hours, newest first · {fmtDateTime(a.from)} – {fmtTime(a.to)}</span></div>
        <DataTable rows={shown} cols={cols} pageSize={20} defaultSort={{ key: 'at', dir: 'desc' }} onRow={e => { const v = visitOf(e.visitId); if (v) setOpenVisit(v); }}
          rowClass={e => (e.result === 'Denied' ? 'acc-denied' : '')}
          empty={<Empty icon={I.SearchX} title="No badge reads match these filters" />}
          toolbar={
            <ListToolbar onApply={p => applyParams(p)} shown={shown.length} total={a.events.length} noun="badge reads" onRefresh={reload}
              search={{ value: q, onChange: v => set({ aq: v }), placeholder: 'Search person, company, badge, door, change…' }}
              filters={[
                { id: 'ares', label: 'Result', quick: true, value: res, anyLabel: 'Any result', onChange: v => set({ ares: v }), options: (['Granted', 'Denied'] as const).map(k => ({ id: k, label: k, count: a.events.filter(e => e.result === k).length })) },
                { id: 'atype', label: 'Person type', quick: true, value: type, anyLabel: 'Anyone', onChange: v => set({ atype: v }), options: TYPES.filter(k => a.events.some(e => e.type === k)).map(k => ({ id: k, label: k, count: a.events.filter(e => e.type === k).length })) },
                { id: 'adoor', label: 'Door', value: door, anyLabel: 'Any door', onChange: v => set({ adoor: v }), options: a.doors.map(d => ({ id: d.id, label: d.name, count: d.events24h })) },
                { id: 'adir', label: 'Direction', value: dir, anyLabel: 'In and out', onChange: v => set({ adir: v }), options: (['In', 'Out'] as const).map(k => ({ id: k, label: k, count: a.events.filter(e => e.dir === k).length })) }
              ]} />
          } />
      </section>

      <VisitDrawer v={openVisit} a={a} onClose={() => setOpenVisit(null)} />
      <ExceptionDrawer x={openExc} a={a} onClose={() => setOpenExc(null)} onVisit={v => { setOpenExc(null); setOpenVisit(v); }} />
    </div>
  );
}

/* why this person was let in: a change / incident / work order, else an escorted or hosted visit, else their standing badge rights */
function Auth({ v }: { v: AccessVisit | null }) {
  if (v?.ref) return <span className="cell-2"><RefLink r={v.ref} />{v.escort && <small>escort {v.escort}</small>}</span>;
  if (v?.escort) return <span className="cell-2"><span>Escorted visit</span><small>by {v.escort}</small></span>;
  if (v?.host && v.type !== 'Staff' && v.type !== 'Security') return <span className="cell-2"><span>Hosted visit</span><small>host {v.host}</small></span>;
  return <span className="faint">Standing access</span>;
}

function EventList({ events }: { events: AccessEvent[] }) {
  if (!events.length) return <div className="faint">No badge reads in the last 24 hours.</div>;
  return (
    <ul className="acc-trail">
      {events.slice().sort((x, y) => x.at - y.at).map(e => (
        <li key={e.id} className={e.result === 'Denied' ? 'is-denied' : ''}>
          <span className="num">{fmtTime(e.at)}</span>
          <span className={`acc-dir is-${e.dir.toLowerCase()}`}>{e.dir === 'In' ? <I.LogIn size={13} /> : <I.LogOut size={13} />}{e.dir}</span>
          <span>{e.door}<small>{e.result === 'Denied' ? `Denied · ${e.reason}` : e.method}</small></span>
        </li>
      ))}
    </ul>
  );
}

function VisitDrawer({ v, a, onClose }: { v: AccessVisit | null; a: SiteAccess; onClose: () => void }) {
  const now = clockNow();
  if (!v) return null;
  const evs = a.events.filter(e => e.visitId === v.id);
  const exc = a.exceptions.filter(x => x.person === v.person);
  return (
    <Drawer open onClose={onClose} title={v.person} sub={`${v.company} · ${v.type}`} width={520}>
      <div className="col" style={{ gap: 18 }}>
        <KV cols={2} items={[
          ['Badge', `${v.badge} · ${v.badgeKind}`], ['Status', v.onSite ? <span className="vw-chip vw-chip--success cmd-chip">On site · {v.where}</span> : <span className="vw-chip vw-chip--neutral cmd-chip">Left</span>],
          ['Entered', fmtDateTime(v.entered)], ['Left', v.exited ? `${fmtTime(v.exited)} · ${fmtDur((v.exited - v.entered) / 60000)} on site` : `${fmtDur((now - v.entered) / 60000)} so far`],
          ['Purpose', v.purpose], ['Authorised by', v.ref ? <RefLink r={v.ref} /> : 'standing access'],
          ['Host', v.host ?? '—'], ['Escort', v.escort ?? (v.type === 'Visitor' ? 'none' : 'not required')]
        ]} />
        <div><div className="vw-label acc-dh">Zones on this visit</div><div className="row wrap" style={{ gap: 6 }}>{v.zones.length ? v.zones.map(z => <span key={z} className="vw-chip vw-chip--neutral cmd-chip">{z}</span>) : <span className="faint">Lobby and loading bay only</span>}</div></div>
        {exc.length > 0 && <div><div className="vw-label acc-dh">Exceptions</div>{exc.map(x => <div key={x.id} className="acc-dx"><b>{x.kind}</b> · {x.detail}</div>)}</div>}
        <div><div className="vw-label acc-dh">Badge reads · {evs.length}</div><EventList events={evs} /></div>
      </div>
    </Drawer>
  );
}

function ExceptionDrawer({ x, a, onClose, onVisit }: { x: SecException | null; a: SiteAccess; onClose: () => void; onVisit: (v: AccessVisit) => void }) {
  if (!x) return null;
  const v = x.person ? a.visits.find(y => y.person === x.person && y.entered <= x.at + 3600e3) ?? a.visits.find(y => y.person === x.person) : undefined;
  const evs = a.events.filter(e => (x.person && e.person === x.person) || (!x.person && e.doorId === x.doorId && Math.abs(e.at - x.at) < 3600e3));
  return (
    <Drawer open onClose={onClose} title={`${x.kind} · ${x.id}`} sub={`${x.door ?? ''} · ${fmtDateTime(x.at)}`} width={520}>
      <div className="col" style={{ gap: 18 }}>
        <div className="row wrap" style={{ gap: 6 }}><span className={`vw-chip vw-chip--${SEV_TONE[x.severity]} cmd-chip`}>{x.severity}</span><span className={`vw-chip vw-chip--${STATUS_TONE[x.status]} cmd-chip`}>{x.status}</span></div>
        <p className="acc-detail">{x.detail}</p>
        <KV cols={2} items={[
          ['Door', x.door ?? '—'], ['Person', x.person ? `${x.person}${x.company ? ` · ${x.company}` : ''}` : 'no badge read'],
          ['Evidence', x.evidence ?? '—'], ['Owner', x.owner], ['Related', x.ref ? <RefLink r={x.ref} /> : '—'], ['Raised', fmtDateTime(x.at)]
        ]} />
        {x.outcome && <div className="note note--good"><I.CircleCheck size={15} />{x.outcome}</div>}
        {v && <button type="button" className="panel-link" onClick={() => onVisit(v)}>Open {v.person}'s visit</button>}
        <div><div className="vw-label acc-dh">{x.person ? `Badge reads of ${x.person}` : 'Badge reads at this door around the time'}</div><EventList events={evs} /></div>
      </div>
    </Drawer>
  );
}
