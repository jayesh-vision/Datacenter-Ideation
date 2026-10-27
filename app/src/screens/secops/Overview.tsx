/* Security Ops → Insights: a posture dashboard, not a list. NIST CSF 2.0 functions on top, then the SOC's numbers (open detections, cases,
   response times, exposure, drift, coverage), what was detected over 14 days, the cases being worked, the sites at most risk, what needs
   action and the ATT&CK techniques seen most. Every figure links to the list filtered to the rows behind it. */
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { Panel } from '../../ui/kit';
import { Facts, SoftMeter, Split, StatGrid, StatTile } from '../../ui/Analytics';
import { TimeChart } from '../../charts/TimeChart';
import { BarList } from '../../charts/BarList';
import { fmtAgo, fmtNum, fmtShortDate } from '../../lib/format';
import type { SecCsf } from '../../api/types';
import type { SecProps, SecTab } from './SecOps';
import { DomainTag, PhaseChip, Ring, SevChip, pct, plural, SSVC_INFO } from './common';

const CSF_TAB: Record<SecCsf['fn'], SecTab | 'sources'> = { Govern: 'physical', Identify: 'sources', Protect: 'vulns', Detect: 'attack', Respond: 'cases', Recover: 'drift' };
const CSF_ICON: Record<SecCsf['fn'], I.LucideIcon> = { Govern: I.Landmark, Identify: I.ScanSearch, Protect: I.ShieldCheck, Detect: I.Radar, Respond: I.Siren, Recover: I.RotateCcw };

export function SecOverview({ v, all, dcId, go: goTab }: SecProps) {
  const nav = useNavigate();
  /* Data sources live under Admin now */
  const go = (t: SecTab | 'sources', extra?: Record<string, string>) => (t === 'sources' ? nav('/security-sources') : goTab(t, extra));
  const now = v.now;
  const open = v.detections.filter(d => d.state !== 'Closed');
  const sev = (s: string) => open.filter(d => d.severity === s).length;
  const cases = v.cases.filter(c => c.phase !== 'Closed');
  const ph = (p: string) => cases.filter(c => c.phase === p).length;
  const act = v.vulns.filter(x => x.ssvc === 'Act' && x.state === 'Open'), attend = v.vulns.filter(x => x.ssvc === 'Attend' && x.state === 'Open');
  const un7 = v.drift.filter(x => !x.authorised && x.at > now - 7 * 864e5);
  const cov = all.sources.reduce((s, x) => s + x.covered, 0), exp = all.sources.reduce((s, x) => s + x.expected, 0);
  const posture = v.sites.length ? Math.round(v.sites.reduce((s, x) => s + x.score, 0) / v.sites.length) : 100;
  const late = cases.filter(c => now > c.slaDue).length;
  const otDefault = v.otAssets.reduce((s, a) => s + a.defaultCreds, 0);
  const silent = all.sources.filter(s => s.state !== 'Healthy');
  const expired = v.physical.reduce((s, p) => s + p.expiredActive, 0);
  const t14 = v.detections.filter(d => d.at > now - 14 * 864e5);
  const tp = t14.filter(d => d.disposition === 'True positive' || d.caseId).length, fp = t14.filter(d => d.disposition === 'False positive').length;
  const techHits = new Map<string, number>(); v.detections.forEach(d => d.techniques.forEach(t => techHits.set(t, (techHits.get(t) ?? 0) + 1)));
  const topTech = [...techHits].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const tName = new Map(all.techniques.map(t => [t.id, t]));
  const trend = v.metrics.trend;
  const dTrend = dcId ? trend.map(t => { const from = t.day, to = from + 864e5; const ds = v.detections.filter(d => d.at >= from && d.at < to);
    return { ...t, network: ds.filter(d => ['Network', 'Management', 'Cross-domain'].includes(d.domain)).length, compute: ds.filter(d => d.domain === 'Compute' || d.domain === 'Kubernetes').length, ot: ds.filter(d => d.domain === 'Facility OT').length, physical: ds.filter(d => d.domain === 'Physical').length }; }) : trend;

  const needs: { key: string; tone: 'bad' | 'warn'; title: string; sub: string; onClick: () => void }[] = [
    ...(sev('Critical') ? [{ key: 'crit', tone: 'bad' as const, title: `${plural(sev('Critical'), 'critical detection')} open`, sub: open.filter(d => d.severity === 'Critical').slice(0, 2).map(d => d.title).join(' · '), onClick: () => go('detections', { sev: 'Critical', st: 'open' }) }] : []),
    ...(late ? [{ key: 'late', tone: 'bad' as const, title: `${plural(late, 'case')} past its response SLA`, sub: 'Critical 4 h · High 24 h · Medium 72 h', onClick: () => go('cases', { cv: 'late' }) }] : []),
    ...(act.length ? [{ key: 'act', tone: 'bad' as const, title: `${plural(act.length, 'vulnerability', 'vulnerabilities')} to act on now (SSVC Act)`, sub: `Known exploited (CISA KEV) on exposed or crown-jewel assets · ${plural(new Set(act.map(x => x.advisoryId)).size, 'advisory', 'advisories')}`, onClick: () => go('vulns', { ssvc: 'Act' }) }] : []),
    ...(un7.length ? [{ key: 'drift', tone: 'warn' as const, title: `${plural(un7.length, 'configuration change')} with no change request (7 days)`, sub: un7.slice(0, 3).map(x => x.asset).join(' · '), onClick: () => go('drift', { auth: 'no' }) }] : []),
    ...(otDefault ? [{ key: 'ot', tone: 'warn' as const, title: `${plural(otDefault, 'facility controller')} with default credentials`, sub: 'UPS cards, PDUs, cooling controllers and cameras (IEC 62443 SR 1.5)', onClick: () => go('ot', { otf: 'creds' }) }] : []),
    ...silent.map(s => ({ key: s.id, tone: (s.state === 'Silent' ? 'bad' : 'warn') as 'bad' | 'warn', title: `${s.name}: ${s.state.toLowerCase()}`, sub: s.gap ?? `Last event ${fmtAgo(s.lastEvent, now)}`, onClick: () => go('sources') })),
    ...(expired ? [{ key: 'badge', tone: 'warn' as const, title: `${plural(expired, 'expired badge')} still active`, sub: 'Found by the access-rights review', onClick: () => go('physical') }] : [])
  ];

  return (
    <div className="dl-dash so-ov">
      <section className="so-hero dl-span-12 vw-card-section">
        <div className="so-hero-l">
          <Ring value={posture} size={104} />
          <span className="cell-2"><b>Security posture{dcId ? ` · ${dcId}` : ''}</b><small>{dcId ? 'Score of this datacenter' : `Average of ${v.sites.length} datacenters`} from open detections, exposure, drift, hardening and telemetry coverage</small>
            <em>{v.sites.filter(s => s.score < 65).length} below 65 · weakest {v.sites[0]?.dcId ?? '—'} ({v.sites[0]?.score ?? '—'})</em></span>
        </div>
        <div className="so-csf">{v.csf.map(f => { const Ic = CSF_ICON[f.fn]; return (
          <button key={f.fn} type="button" className="so-csf-f" onClick={() => go(CSF_TAB[f.fn])} title={f.basis}>
            <span className="so-csf-h"><Ic size={14} />{f.fn}</span>
            <Ring value={f.score} size={58} />
            {(() => { const i = f.items.find(x => x.bad) ?? f.items[0]; return <span className={`so-csf-i${i.bad ? ' is-bad' : ''}`}><b>{i.value}</b><em>{i.label}</em></span>; })()}
          </button>); })}</div>
        <span className="so-hero-foot">NIST Cybersecurity Framework 2.0 functions · click one for the screen that evidences it</span>
      </section>

      <div className="dl-span-12">
        <StatGrid fit>
          <StatTile label="Open detections" value={fmtNum(open.length)} sub={`${fmtNum(t14.length)} in 14 days`} onClick={() => go('detections', { st: 'open' })} info="Detections not closed yet, by severity. Each severity opens the queue filtered to it.">
            <Split parts={[{ key: 'Critical', label: 'Critical', n: sev('Critical'), tone: 'error' }, { key: 'High', label: 'High', n: sev('High'), tone: 'orange' }, { key: 'Medium', label: 'Medium', n: sev('Medium'), tone: 'info' }, { key: 'Low', label: 'Low', n: sev('Low'), tone: 'neutral' }]} onPick={k => go('detections', { st: 'open', sev: k })} />
          </StatTile>
          <StatTile label="Open cases" value={cases.length} sub={late ? `${late} past SLA` : 'all within SLA'} subTone={late ? 'bad' : undefined} onClick={() => go('cases')} info="Security cases not closed, by NIST SP 800-61 phase.">
            <Split parts={[{ key: 'da', label: 'Analysis', n: ph('Detection & analysis'), tone: 'info' }, { key: 'co', label: 'Containment', n: ph('Containment'), tone: 'orange' }, { key: 'er', label: 'Eradication / recovery', n: ph('Eradication') + ph('Recovery') + ph('Post-incident'), tone: 'neutral' }]} />
          </StatTile>
          <StatTile label="Mean time to detect" value={`${v.metrics.mttdMin} min`} sub="to open a case" info="MTTD = first event to case opened; MTTA = case opened to acknowledged; MTTR = opened to closed, over the cases of the last 14 days.">
            <SoftMeter pct={v.metrics.autoPct} tone="info" />
            <Facts items={[{ n: `${v.metrics.autoPct}%`, label: 'of response steps automated' }, { n: `${v.metrics.mttaMin} min`, label: 'to acknowledge' }, { n: `${v.metrics.mttrH} h`, label: 'to resolve' }]} />
          </StatTile>
          <StatTile label="Act now" value={act.length} sub={`fix in 7 days · ${attend.length} attend`} subTone={act.length ? 'bad' : undefined} onClick={() => go('vulns', { ssvc: 'Act' })} info={SSVC_INFO}>
            <Split parts={(() => { const m = [...act.reduce((a, x) => a.set(x.assetKind, (a.get(x.assetKind) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]); const rest = m.slice(2).reduce((a, [, n]) => a + n, 0); return [...m.slice(0, 2).map(([k, n]) => ({ key: k, label: k === 'UPS NMC' ? 'UPS cards' : k, n, tone: 'error' as const })), ...(rest ? [{ key: '_o', label: 'Other', n: rest, tone: 'neutral' as const }] : [])]; })()} onPick={() => go('vulns', { ssvc: 'Act' })} />
          </StatTile>
          <StatTile label="Unapproved changes" value={un7.length} sub="last 7 days" subTone={un7.length ? 'warn' : undefined} onClick={() => go('drift', { auth: 'no' })} info="Running configs that differ from the last approved backup with no change request in the window (each one is an SR-002 detection).">
            <Split parts={[{ key: 'u', label: 'No change request', n: v.drift.filter(x => !x.authorised).length, tone: 'orange' }, { key: 'a', label: 'Under a change', n: v.drift.filter(x => x.authorised).length, tone: 'info' }]} onPick={k => go('drift', { auth: k === 'u' ? 'no' : 'yes' })} />
            <Facts items={[{ n: v.drift.length, label: 'config changes in 14 days' }]} />
          </StatTile>
          <StatTile label="Telemetry coverage" value={`${pct(cov, exp)}%`} sub={`${silent.length} degraded`} subTone={silent.length ? 'warn' : undefined} onClick={() => go('sources')} info="Assets each sensor actually hears from ÷ assets it should hear from, over every data source. Devices not discovered yet send nothing.">
            <SoftMeter pct={pct(cov, exp)} tone={pct(cov, exp) >= 90 ? 'info' : 'warning'} />
            <Facts items={[{ n: fmtNum(exp - cov), label: 'assets not reporting' }, { n: `${all.sources.length - silent.length} of ${all.sources.length}`, label: 'sources healthy', tone: silent.length ? 'warn' : undefined }]} />
          </StatTile>
        </StatGrid>
      </div>

      <Panel className="dl-span-8 dl-h-360" title="What was detected" icon={I.ChartColumnStacked} sub="Detections per day by domain, last 14 days" info="Every detection the rules raised per day, stacked by domain: network and management (incl. cross-domain correlations), hosts and Kubernetes, facility OT, physical.">
        <TimeChart height={270} labels={dTrend.map(t => fmtShortDate(t.day))} series={[
          { key: 'n', label: 'Network & management', color: '#1C81EF', kind: 'bar', stack: 's', values: dTrend.map(t => t.network) },
          { key: 'c', label: 'Hosts & Kubernetes', color: '#60A5FA', kind: 'bar', stack: 's', values: dTrend.map(t => t.compute) },
          { key: 'o', label: 'Facility OT', color: '#A78BFA', kind: 'bar', stack: 's', values: dTrend.map(t => t.ot) },
          { key: 'p', label: 'Physical', color: '#CBD5E1', kind: 'bar', stack: 's', values: dTrend.map(t => t.physical) }]} />
      </Panel>
      <Panel className="dl-span-4 dl-h-360" title="Cases being worked" icon={I.FolderOpen} count={cases.length} actions={<button type="button" className="ent-link" onClick={() => go('cases')}>All cases →</button>} info="Open security cases, most severe first, with their phase.">
        <ul className="ipam-find">{cases.map(c => (
          <li key={c.id}><button type="button" onClick={() => go('cases', { case: c.id })}><SevChip s={c.severity} /><span className="cell-2"><b>{c.title}</b><small><span className="mono">{c.id}</span> · {c.dcId} · <PhaseChip p={c.phase} /></small></span><I.ChevronRight size={14} className="ipam-chev" /></button></li>))}
          {!cases.length && <li><p className="vw-label" style={{ margin: 0 }}>No open case.</p></li>}</ul>
      </Panel>

      <Panel className="dl-span-6 dl-h-360" title="Datacenters by security score" icon={I.Building2} count={v.sites.length} sub="Lowest first" info="Per datacenter: 100 minus open critical / high detections, SSVC Act vulnerabilities, unauthorised changes, open physical exceptions, the hardening gap and the telemetry gap. Click a datacenter to scope the whole screen to it.">
        <BarList items={v.sites.map(s => ({ key: s.dcId, label: s.dcId, sublabel: `${s.open} open · ${s.critical} critical · ${s.act} act · ${s.unauthorised} unapproved · hardening ${s.hardening}%`, value: s.score, display: `${s.score}`, color: s.score < 50 ? '#FCA5A5' : s.score < 65 ? '#FDBA74' : '#60A5FA', onClick: () => go('overview', { dc: s.dcId }) }))} max={100} marker={{ value: 65, label: 'attention' }} />
      </Panel>
      <Panel className="dl-span-6 dl-h-360" title="Needs action" icon={I.TriangleAlert} count={needs.length} info="What the SOC should pick up next across detections, cases, vulnerabilities, drift, OT, telemetry and access rights. Each row opens the filtered list.">
        <ul className="ipam-find">{needs.map(x => <li key={x.key}><button type="button" onClick={x.onClick}><i className={`so-dot is-${x.tone}`} /><span className="cell-2"><b>{x.title}</b><small>{x.sub}</small></span><I.ChevronRight size={14} className="ipam-chev" /></button></li>)}
          {!needs.length && <li><p className="vw-label" style={{ margin: 0 }}>Nothing waiting.</p></li>}</ul>
      </Panel>

      <Panel className="dl-span-6 dl-h-360" title="Techniques seen most" icon={I.Crosshair} sub="MITRE ATT&CK, last 14 days" actions={<button type="button" className="ent-link" onClick={() => go('attack')}>Coverage →</button>} info="ATT&CK techniques (Enterprise and ICS) behind the detections, most frequent first. Physical detections map to ISO 27001 controls instead.">
        <BarList items={topTech.map(([id, n]) => ({ key: id, label: `${id} · ${tName.get(id)?.name ?? ''}`, sublabel: `${tName.get(id)?.matrix ?? ''} · ${tName.get(id)?.tactic ?? ''}`, value: n, display: fmtNum(n), color: id.startsWith('T0') ? '#A78BFA' : '#60A5FA', onClick: () => go('detections', { tech: id }) }))} />
      </Panel>
      <Panel className="dl-span-6 dl-h-360" title="From detection to case" icon={I.Filter} sub="Last 14 days" info="How the detections of the last 14 days ended: still open, closed as false positive or benign, or true positive (closed as such or escalated to a case). The false-positive rate tunes the rules.">
        <div className="so-funnel">
          {[{ l: 'Detections raised', n: t14.length, c: '#1C81EF' }, { l: 'Triaged (not new)', n: t14.filter(d => d.state !== 'New').length, c: '#60A5FA' }, { l: 'True positive or escalated', n: tp, c: '#93C5FD' }, { l: 'Cases opened', n: v.cases.filter(c => c.opened > now - 14 * 864e5).length, c: '#BFDBFE' }].map(x => (
            <div key={x.l}><span><em>{x.l}</em><b>{fmtNum(x.n)}</b></span><i style={{ width: `${Math.max(4, pct(x.n, t14.length || 1))}%`, background: x.c }} /></div>))}
        </div>
        <Facts items={[{ n: `${v.metrics.fpPct}%`, label: 'false positives (closed)', tone: v.metrics.fpPct > 35 ? 'warn' : undefined }, { n: fmtNum(fp), label: 'false positives' }, { n: fmtNum(t14.filter(d => d.disposition === 'Benign').length), label: 'benign' }]} />
        <div className="so-domains">{(['Network', 'Management', 'Compute', 'Kubernetes', 'Facility OT', 'Physical', 'Cross-domain'] as const).map(d => { const n = open.filter(x => x.domain === d).length; return n ? <button key={d} type="button" onClick={() => go('detections', { st: 'open', dom: d })}><DomainTag d={d} /><b>{n}</b></button> : null; })}</div>
      </Panel>
    </div>
  );
}
