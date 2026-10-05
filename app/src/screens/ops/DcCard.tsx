import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { vocabNow } from '../../api';
import { fmtAgo, fmtDur } from '../../lib/format';
import '../../styles/command.css';

/* The datacenter + incident card: used by the Command center's "Critical now" lane and
   by the Datacenters tile view, so both show one card. Fixed slots — every card has the
   same rows at the same heights (header · id line · title · cause · impact · SLA · next). */

export interface CardSite { id: string; city: string; state: string; tier: string; siteOpen: number }
export interface CardIncident {
  id: string; title: string; sev: number; status: string; type: string; owner: string; detected: number;
  sla: { resolveLeft: number }; resolveSlaMin: number; impact: { services: number; premium: number; customers: number };
  cause: string; confidence: number; nextAction: string | null; awaitingApproval: number;
}
/* shown in the same slots when the site has no open incident */
export interface CardQuiet {
  state: 'attention' | 'normal'; alarms: number; critAlarms: number; services: number; degraded: number; customers: number;
  powerPct: number; coolPct: number; note: string; noteLabel: string;
}

const BAD = 'var(--vw-color-red-500)', WARN = 'var(--vw-color-amber-500)', ACCENT = 'var(--primaryColor500)', CALM = 'var(--vw-color-emerald-400)', MUTED = 'var(--vw-color-slate-300)';

export function DcCard({ site, inc, quiet, now }: { site: CardSite; inc?: CardIncident; quiet?: CardQuiet; now: number }) {
  const V = vocabNow();
  const accent = inc ? (inc.sev === 1 ? BAD : inc.sev === 2 ? WARN : MUTED) : quiet?.state === 'attention' ? WARN : CALM;
  return (
    <div className="vw-card-section vw-card--accent cmd-inc">
      <div className="vw-card-accent" style={{ background: accent }} />
      <Link to={`/datacenters/${site.id}`} className="ci-dc" title={`Open datacenter ${site.id}`}>
        <span className="vw-card-icon-sm ci-dc-ic"><I.Building2 size={16} /></span>
        <div className="ci-dc-id">
          <span className="ci-dc-name">{site.id}</span>
          <span className="vw-label">{site.city}, {site.state} · {site.tier}</span>
        </div>
        <span className="ci-dc-ctx" title="Open incidents at this datacenter">{site.siteOpen} open<small>in DC</small></span>
      </Link>
      {inc ? <IncidentBody inc={inc} siteId={site.id} now={now} /> : quiet ? (
        <Link to={`/datacenters/${site.id}`} className="ci-body" title={`Open datacenter ${site.id}`}>
          <div className="ci-head">
            <span className={`vw-chip ${quiet.state === 'attention' ? 'vw-chip--warning' : 'vw-chip--success'} is-strong cmd-chip`}>{quiet.state === 'attention' ? 'Attention' : 'Normal'}</span>
            <span className="vw-footer-meta ci-age">no open incident</span>
          </div>
          <div className="vw-card-title-sm ci-title">{quiet.state === 'attention' ? 'No incident open — conditions to watch' : 'Operating normally'}</div>
          <div className="ci-cause">
            <span className="vw-label">Active alarms</span>
            <span className="vw-value ci-clamp1">{quiet.alarms ? `${quiet.alarms} active · ${quiet.critAlarms ? `${quiet.critAlarms} critical` : 'none critical'}` : 'None'}</span>
          </div>
          <div className="ci-impact">
            <div><span className="vw-card-metric-sm">{quiet.services}</span><span className="vw-label">{V.services.toLowerCase()}</span></div>
            <div><span className="vw-card-metric-sm">{quiet.degraded}</span><span className="vw-label">degraded</span></div>
            <div><span className="vw-card-metric-sm">{quiet.customers}</span><span className="vw-label">{V.customers.toLowerCase()}</span></div>
          </div>
          <div className="ci-sla">
            <div className="ci-sla-row">
              <span className="vw-card-variance is-neutral">Power {quiet.powerPct}%</span>
              <span className="vw-footer-meta ci-owner">Cooling {quiet.coolPct}%</span>
            </div>
            <div className="bar" style={{ height: 4 }}><i style={{ width: `${quiet.powerPct}%`, background: quiet.powerPct >= 85 ? BAD : ACCENT }} /></div>
          </div>
          <div className="vw-card-child-shaded ci-next" title={quiet.note}>
            <span className="vw-label">{quiet.noteLabel}</span>
            <span className="vw-value ci-clamp2">{quiet.note}</span>
          </div>
        </Link>
      ) : null}
    </div>
  );
}

function IncidentBody({ inc: i, siteId, now }: { inc: CardIncident; siteId: string; now: number }) {
  const V = vocabNow();
  const left = i.sla.resolveLeft, used = Math.max(0, Math.min(100, ((i.resolveSlaMin - left) / i.resolveSlaMin) * 100));
  const late = left < 0;
  return (
    <Link to={`/incidents/${i.id}`} className="ci-body" title={`Open incident ${i.id}`}>
      <div className="ci-head">
        <span className={`vw-chip ${i.sev === 1 ? 'vw-chip--error' : i.sev === 2 ? 'vw-chip--warning' : 'vw-chip--neutral'} is-strong cmd-chip`}>SEV{i.sev}</span>
        <span className="vw-card-activity-label">{i.id}</span>
        <span className="vw-chip vw-chip--neutral cmd-chip">{i.type}</span>
        <span className="vw-footer-meta ci-age">{fmtAgo(i.detected, now)}</span>
      </div>
      <div className="vw-card-title-sm ci-title" title={i.title}>{i.title.replace(new RegExp(`\\s+(in|at|—)\\s+${siteId}$`), '')}</div>
      <div className="ci-cause" title={`${i.cause} (${i.confidence}% confidence)`}>
        <span className="vw-label">Likely cause · {i.confidence}%</span>
        <span className="vw-value ci-clamp1">{i.cause}</span>
      </div>
      <div className="ci-impact">
        <div><span className="vw-card-metric-sm">{i.impact.services}</span><span className="vw-label">{V.services.toLowerCase()}</span></div>
        <div><span className="vw-card-metric-sm">{i.impact.premium}</span><span className="vw-label">{V.premium.toLowerCase()}</span></div>
        <div><span className="vw-card-metric-sm">{i.impact.customers}</span><span className="vw-label">{V.customers.toLowerCase()}</span></div>
      </div>
      <div className="ci-sla">
        <div className="ci-sla-row">
          <span className={`vw-card-variance ${late ? 'is-negative' : 'is-neutral'}`}>{late ? `Overdue ${fmtDur(-left)}` : `${fmtDur(left)} to SLA`}</span>
          <span className="vw-footer-meta ci-owner" title={`${i.status} · ${i.owner}`}>{i.status} · {i.owner}</span>
        </div>
        <div className="bar" style={{ height: 4 }}><i style={{ width: `${late ? 100 : used}%`, background: late ? BAD : ACCENT }} /></div>
      </div>
      <div className="vw-card-child-shaded ci-next" title={i.nextAction ?? undefined}>
        <span className="vw-label">{!i.nextAction ? 'Next action' : i.awaitingApproval > 0 ? `${i.awaitingApproval} step${i.awaitingApproval > 1 ? 's need' : ' needs'} approval` : 'Next action'}</span>
        <span className="vw-value ci-clamp2">{i.nextAction ?? 'All actions complete — run closure checks'}</span>
      </div>
    </Link>
  );
}
