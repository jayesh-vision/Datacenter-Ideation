import { Link, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { getAlerts, getNetworkElements, useQuery, clockNow } from '../../api';
import { Donut } from '../../charts/Donut';
import { Panel, Empty } from '../../ui/kit';
import { SevDot, SeverityChip, RolloutChip } from '../../ui/status';
import { DISCOVERY, ND_REASON, ROLLOUT, SEVERITY } from '../../lib/vocab';
import { fmtAgo, fmtINR } from '../../lib/format';
import type { SiteData } from './Site';

const REASON_COLOR: Record<string, string> = { planned: 'var(--primaryColor400)', 'no-collector': 'var(--vw-color-red-400)', 'collector-unavailable': 'var(--vw-color-amber-400)', 'not-applicable': 'var(--vw-color-slate-300)' };

/* INV-04 — rollout blockers, reconciliation gaps and the order a field team
   would close them in (DC-INV-005/006, DC-SITE-001/008/009). */
export function Attention({ data }: { data: SiteData }) {
  const nav = useNavigate();
  const { dc, summary: s } = data;
  const { data: nd } = useQuery(() => getNetworkElements({ dcId: dc.id, discovery: 'not-discovered' }), [dc.id]);
  const { data: dr } = useQuery(() => getNetworkElements({ dcId: dc.id, discovery: 'drifted' }), [dc.id]);
  const { data: al } = useQuery(() => getAlerts({ dcId: dc.id, state: 'open' }), [dc.id]);
  const now = clockNow();
  const reasons = (nd ?? []).reduce<Record<string, number>>((a, n) => { const k = n.ndReason ?? 'planned'; a[k] = (a[k] ?? 0) + 1; return a; }, {});
  const dupes = (dr ?? []).filter(n => n.duplicateSerialOf).length;
  const driftAttrs = (dr ?? []).flatMap(n => n.drift ?? []).reduce<Record<string, number>>((a, d) => { a[d.attr] = (a[d.attr] ?? 0) + 1; return a; }, {});
  const waitingCollector = (reasons['no-collector'] ?? 0) + (reasons['collector-unavailable'] ?? 0);
  const capPct = s.capexApproved ? (s.capexCommitted / s.capexApproved) * 100 : 0;
  const recon = (kind: string) => `/reconciliation?dc=${dc.id}&kind=${kind}`;

  const steps: { text: string; sub: string; to: string; cta: string }[] = [];
  if (waitingCollector) steps.push({ text: 'Run discovery or assign a collector, then reconcile the record', sub: `${waitingCollector} NE are waiting only on a collector${dc.collectors.some(c => c.state !== 'up') ? '; one collector is stale' : ''}.`, to: recon('not-discovered'), cta: 'Open worklist' });
  if (s.drifted) steps.push({ text: 'Verify the drifted attributes and update the inventory record', sub: `${s.drifted} NE differ from record${dupes ? `, ${dupes} with duplicate serials` : ''}.`, to: recon('drift'), cta: 'Review drift' });
  if (reasons.planned) steps.push({ text: 'Confirm installation dates for planned elements', sub: `${reasons.planned} NE are planned and not yet installed — keep them out of capacity until racked.`, to: `/datacenters/${dc.id}?tab=elements&disc=not-discovered`, cta: 'View planned NE' });
  const openRisk = dc.risks.find(r => r.domain === 'Facility' || r.domain === 'Network');
  if (openRisk) steps.push({ text: `Resolve ${openRisk.domain.toLowerCase()} risk: ${openRisk.title}`, sub: openRisk.detail, to: openRisk.domain === 'Facility' ? `/facilities?dc=${dc.id}` : '/capacity?tab=network', cta: 'Open' });
  const pendingReady = dc.readiness.find(r => !r.done && !/discover|reconcil/i.test(r.step));
  if (pendingReady && dc.status !== 'on-air') steps.push({ text: `Close commissioning step: ${pendingReady.step}`, sub: pendingReady.note ?? 'Required before the site moves to on-air.', to: `/datacenters/${dc.id}?tab=timeline`, cta: 'Timeline' });

  const banner = [s.notDiscovered ? `${s.notDiscovered} NE not discovered` : '', s.drifted ? `${s.drifted} NE drifted` : '', s.openIncidents ? `${s.openIncidents} open incident${s.openIncidents === 1 ? '' : 's'}` : '', s.critAlerts ? `${s.critAlerts} critical alarm${s.critAlerts === 1 ? '' : 's'}` : ''].filter(Boolean);

  return (
    <div className="col" style={{ gap: 16 }}>
      <Panel title="Alert summary" sub="Rollout blockers, risk flags and reconciliation gaps at this site">
        <div className="site-banner">Datacenter · <b>{ROLLOUT[dc.status].label}</b> — {banner.length ? banner.join(', ') : 'no open gaps; inventory matches the network'}.</div>
        <div className="site-gap-cards">
          <button type="button" className="gap-card" onClick={() => nav(recon('not-discovered'))} disabled={!s.notDiscovered}>
            <span className="gap-ico tone-orange"><I.SearchX size={16} /></span>
            <span><b>Not discovered</b><span>{s.notDiscovered} NE on record never seen by discovery</span><span className="faint">Planned or no collector — reconcile to close the record gap</span></span>
          </button>
          <button type="button" className="gap-card" onClick={() => nav(recon('drift'))} disabled={!s.drifted}>
            <span className="gap-ico tone-warning"><I.GitCompareArrows size={16} /></span>
            <span><b>Configuration drift</b><span>{s.drifted} NE differ from the inventory record</span><span className="faint">{dupes ? `Includes ${dupes} duplicate serial${dupes === 1 ? '' : 's'} — ` : ''}verify and update the record</span></span>
          </button>
          <button type="button" className="gap-card" onClick={() => nav(`/incidents?dc=${dc.id}`)} disabled={!s.openIncidents}>
            <span className="gap-ico tone-error"><I.Siren size={16} /></span>
            <span><b>Open incidents</b><span>{s.openIncidents} incident{s.openIncidents === 1 ? '' : 's'} open at this site</span><span className="faint">{s.activeAlerts} active alarms · {s.critAlerts} critical</span></span>
          </button>
          <button type="button" className="gap-card" onClick={() => nav(`/datacenters/${dc.id}?tab=timeline`)} disabled={!dc.readiness.length}>
            <span className="gap-ico tone-info"><I.ListChecks size={16} /></span>
            <span><b>Commissioning</b><span>{dc.readiness.length ? `${dc.readiness.filter(r => r.done).length} of ${dc.readiness.length} readiness steps done` : 'Site is on-air'}</span><span className="faint">{dc.readiness.length ? 'On-air sign-off needs every step closed' : `Commissioned · ${dc.tier}`}</span></span>
          </button>
        </div>
      </Panel>

      <div className="grid g-3">
        <Panel title="Record vs network" sub="Where each NE on record stands against discovery">
          <Donut size={150} centerLabel="NE" slices={[
            { key: 'v', label: DISCOVERY.verified.label, value: s.verified, color: DISCOVERY.verified.color },
            { key: 'd', label: DISCOVERY.drifted.label, value: s.drifted, color: DISCOVERY.drifted.color },
            { key: 'n', label: DISCOVERY['not-discovered'].label, value: s.notDiscovered, color: DISCOVERY['not-discovered'].color }
          ]} />
        </Panel>
        <Panel title="Why not discovered" sub="DC-INV-006 · each reason needs a different fix">
          {s.notDiscovered ? (
            <div className="col" style={{ gap: 12 }}>
              {(['planned', 'no-collector', 'collector-unavailable', 'not-applicable'] as const).map(k => (
                <Link key={k} to={`/datacenters/${dc.id}?tab=elements&disc=not-discovered&reason=${k}`} className="reason-row">
                  <span className="row between"><span className="row" style={{ gap: 8 }}><i className="site-dot" style={{ background: REASON_COLOR[k] }} />{ND_REASON[k]}</span><b className="num">{reasons[k] ?? 0}</b></span>
                  <span className="bar"><i style={{ width: `${((reasons[k] ?? 0) / s.notDiscovered) * 100}%`, background: REASON_COLOR[k] }} /></span>
                </Link>
              ))}
              {Object.keys(driftAttrs).length > 0 && <div className="faint" style={{ fontSize: 12, lineHeight: 1.5 }}>Drift by attribute: {Object.entries(driftAttrs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>}
            </div>
          ) : <Empty icon={I.CircleCheck} title="Everything on record is discovered">{s.drifted ? `${s.drifted} records drifted — see the drift worklist.` : 'Coverage 100%.'}</Empty>}
        </Panel>
        <Panel title="Financial exposure" sub="Money committed against this build">
          <div className="col" style={{ gap: 14 }}>
            <div className="col" style={{ gap: 6 }}>
              <div className="row between"><span className="muted nowrap">Capex committed</span><span className="nowrap"><b className="num strong">{fmtINR(s.capexCommitted)}</b> <span className="faint">of {fmtINR(s.capexApproved)}</span></span></div>
              <span className="bar" style={{ height: 8 }}><i style={{ width: `${capPct}%`, background: 'var(--vw-color-cyan-500)' }} /></span>
              <span className="faint" style={{ fontSize: 12 }}>{Math.round(capPct)}% committed · {fmtINR(s.capexApproved - s.capexCommitted)} remaining</span>
            </div>
            <div className="row between"><span className="muted">Opex run rate</span><span><b className="num strong">{s.opexMonthly ? `${fmtINR(s.opexMonthly)} / mo` : '—'}</b> {s.opexMonthly > 0 && <span className="faint">{fmtINR(s.opexMonthly * 12)} a year</span>}</span></div>
            <div className="row between"><span className="muted">Capex on undiscovered NE</span><span className="num strong">{s.ne ? fmtINR(dc.capex.lines[0].committed * (s.notDiscovered / s.ne)) : '—'}</span></div>
            <Link to={`/datacenters/${dc.id}?tab=capex`} className="panel-link">Capex breakdown<I.ChevronRight size={14} /></Link>
          </div>
        </Panel>
      </div>

      <Panel title="Recommended next steps" sub="In the order a field team would take them">
        {steps.length ? (
          <ol className="steps">
            {steps.map((st, i) => (
              <li key={i}>
                <span className="step-n">{i + 1}</span>
                <span className="step-t"><b>{st.text}</b><span>{st.sub}</span></span>
                <Link to={st.to} className="nst-btn nst-btn--sm">{st.cta}<I.ChevronRight size={14} /></Link>
              </li>
            ))}
          </ol>
        ) : <Empty icon={I.CircleCheck} title="No action needed">Inventory, facility and commissioning are all clear.</Empty>}
      </Panel>

      <div className="grid g-2-1">
        <Panel title="Site risk board" sub="DC-SITE-008 · unresolved inventory, facility, network, supplier and commissioning risks" count={dc.risks.length} flush>
          {dc.risks.length ? (
            <table className="nst-table site-table">
              <thead><tr><th>Domain</th><th>Risk</th><th>Severity</th><th>Owner</th><th className="is-right">Open for</th></tr></thead>
              <tbody>{dc.risks.map(r => (
                <tr key={r.id}><td><span className="muted">{r.domain}</span></td><td><span className="cell-2"><b className="strong" style={{ fontWeight: 500 }}>{r.title}</b><small>{r.detail}</small></span></td><td><SeverityChip s={r.severity} size="xs" /></td><td className="nowrap">{r.owner}</td><td className="is-right num nowrap">{fmtAgo(r.opened, now).replace(' ago', '')}</td></tr>
              ))}</tbody>
            </table>
          ) : <Empty icon={I.ShieldCheck} title="No open risks" />}
        </Panel>
        <Panel title="Commissioning readiness" sub="DC-SITE-001 · WF-01 onboarding steps">
          {dc.readiness.length ? (
            <ul className="checklist">
              {dc.readiness.map((r, i) => (
                <li key={i} className={r.done ? 'is-done' : ''}>
                  {r.done ? <I.CircleCheck size={17} /> : <I.Circle size={17} />}
                  <span><b>{r.step}</b>{r.note && <small>{r.note}</small>}</span>
                </li>
              ))}
            </ul>
          ) : <div className="col" style={{ gap: 8 }}><RolloutChip s={dc.status} /><span className="muted" style={{ fontSize: 13 }}>Commissioning closed; the site is in steady-state operations.</span></div>}
        </Panel>
      </div>

      <Panel title="Active alarms at this site" count={al?.length ?? 0} actions={<Link to={`/alerts?dc=${dc.id}`} className="panel-link">Alerts console<I.ChevronRight size={14} /></Link>} flush>
        {al && al.length ? (
          <table className="nst-table site-table">
            <thead><tr><th style={{ width: 28 }} /><th>Alarm</th><th>Source</th><th>Element</th><th>Code</th><th className="is-right">Raised</th></tr></thead>
            <tbody>{al.slice(0, 8).map(a => (
              <tr key={a.id} className="is-click" onClick={() => nav(a.neId ? `/ne/${a.neId}?tab=alerts` : `/alerts?q=${a.code}`)}>
                <td><SevDot s={a.severity} /></td>
                <td><span className="cell-2"><b className="strong" style={{ fontWeight: 500 }}>{a.title}</b><small>{a.description}</small></span></td>
                <td className="muted">{a.source}</td>
                <td className="mono nowrap">{a.neId ? a.neId.replace(`${dc.id}-`, '') : 'Facility'}{a.ifName ? ` · ${a.ifName}` : ''}</td>
                <td className="mono">{a.code}</td>
                <td className="is-right num nowrap"><span style={{ color: SEVERITY[a.severity].color }}>●</span> {fmtAgo(a.start, now)}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <Empty icon={I.BellOff} title="No active alarms" />}
        {al && al.length > 8 && <div className="panel-foot"><span>{al.length - 8} more</span><Link to={`/alerts?dc=${dc.id}`} className="panel-link">View all<I.ChevronRight size={14} /></Link></div>}
      </Panel>
    </div>
  );
}
