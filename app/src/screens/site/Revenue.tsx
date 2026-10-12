import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getRevenue, useQuery, usePersona } from '../../api';
import type { RevRack } from '../../api/types';
import { Panel } from '../../ui/kit';
import { BarList } from '../../charts/BarList';
import { fmtDur } from '../../lib/format';
import { SummaryStrip } from './SummaryStrip';
import { CREDIT, DOMAIN, IssueDrawer, IssueTable, LOSS, MethodDrawer, impactOf, inr, lc, perHr, perMo } from '../revenue/parts';
import { ExposureTable } from '../Revenue';
import type { SiteData } from './Site';

const RACK_COLOR: Record<RevRack['state'], string> = { down: LOSS, degraded: CREDIT, exposed: 'var(--vw-color-amber-200)', ok: 'var(--vw-color-slate-300)' };

/* Revenue tab of a datacenter: what the site earns, what its open issues are costing,
   where the money sits in the building and what one more failure would cost. */
export function SiteRevenue({ data }: { data: SiteData }) {
  const { dc } = data;
  const nav = useNavigate();
  const { vocab: V } = usePersona();
  const W = V.money;
  const [sp, setSp] = useSearchParams();
  const { data: v } = useQuery(() => getRevenue({ dcId: dc.id }), [dc.id]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [method, setMethod] = useState(false);
  const [allRacks, setAllRacks] = useState(false);
  if (!v) return null;
  const t = v.total;
  const rview = sp.get('rview') ?? 'all';
  const setView = (val: string) => { const n = new URLSearchParams(sp); val === 'all' ? n.delete('rview') : n.set('rview', val); setSp(n, { replace: true }); };
  const open = openId ? v.issues.find(i => i.id === openId) ?? null : null;
  /* one measure per list so the bars compare like with like: impact so far, else what is at stake, else credits locked in */
  const mode: 'impact' | 'stake' | 'locked' = v.customers.some(c => impactOf(c) > 0) ? 'impact' : v.customers.some(c => c.mrrExposed > 0) ? 'stake' : 'locked';
  const measure = (c: typeof v.customers[number]) => (mode === 'impact' ? impactOf(c) : mode === 'stake' ? c.mrrExposed : c.creditsLocked);
  const owed = v.customers.filter(c => measure(c) > 0).sort((a, b) => measure(b) - measure(a)).slice(0, 6);
  const maxRack = Math.max(1, ...v.racks.map(r => r.mrr));
  const hist = [...v.byDomain].filter(d => d.hist30 > 0).sort((a, b) => b.hist30 - a.hist30);

  return (
    <div className="col" style={{ gap: 16 }}>
      <SummaryStrip items={[
        { key: 'base', label: `${W.noun} hosted here`, value: inr(v.base.mrr), sub: 'a month', onClick: () => setView('all'), active: rview === 'all',
          info: `Sum of the monthly charge of every ${V.service.toLowerCase()} served from this datacenter. Click to show all issues in the table.` },
        { key: 'rate', label: 'Losing now', value: perHr(t.rate), tone: t.rate ? 'bad' : undefined, onClick: () => setView('losing'), active: rview === 'losing',
          info: `${W.noun} draining per hour from the open faults at this site: each down ${V.service.toLowerCase()} at its monthly charge ÷ 730 h, a degraded one at 0.3 × that. Click to list only the issues losing money.` },
        { key: 'impact', label: 'Impact so far', value: inr(impactOf(t)), tone: impactOf(t) ? 'warn' : undefined,
          info: `${W.lost} since each alarm began (hourly rate × hours) plus the ${lc(W.credits)} those impacted minutes have already pushed ${V.customers.toLowerCase()} into.` },
        { key: 'stake', label: 'At stake', value: inr(t.mrrExposed), sub: t.mrrExposed ? 'a month' : undefined, tone: t.mrrExposed ? 'warn' : undefined, onClick: () => setView('stake'), active: rview === 'stake',
          info: `Monthly charge of ${V.services.toLowerCase()} that are still Active but riding a critical fault (UPS on battery, failed cooling, critical alarm on their path). Nothing is lost yet. Click to list those issues.` },
        { key: 'next', label: 'Next credit step', value: v.sla.nextCliff ? inr(v.sla.nextCliff.amount) : 'None', sub: v.sla.nextCliff ? `in ${fmtDur(v.sla.nextCliff.inMin)}` : undefined, tone: v.sla.nextCliff && v.sla.nextCliff.inMin <= 60 ? 'bad' : undefined,
          info: `The next SLA tier an open issue at this site will cross if it runs on, and the extra ${lc(W.credits)} that step adds (tiers: any shortfall 10%, ≥0.5 pt 25%, ≥2 pt 50% of the monthly charge). Red when under an hour away.` },
        { key: 'sla', label: 'Within SLA · 30 d', value: `${v.sla.withinPct}%`, tone: v.sla.withinPct < 90 ? 'warn' : undefined, onClick: () => setMethod(true),
          info: `Share of the monthly ${lc(W.noun)} on ${V.services.toLowerCase()} that are inside their 30-day uptime target and not impacted right now. Click to open how it is calculated.` }
      ]} />

      <IssueTable view={v} onOpen={i => setOpenId(i.id)} hideDc pageSize={10} />

      <div className="rev-site">
        <Panel title={`Where the ${lc(W.noun)} sits`} icon={I.Rows3} sub={`Monthly ${lc(W.noun)} by ${v.rackBy} · ${v.racks.length} ${v.rackBy}${v.racks.length === 1 ? '' : 's'} host ${V.services.toLowerCase()}`}
          info={`Monthly ${lc(W.noun)} of the ${V.services.toLowerCase()} in each ${v.rackBy}, largest first, with its share of the site total. The coloured part of a bar is the ${lc(W.noun)} on ${V.services.toLowerCase()} that are down, degraded or exposed.`}>
          {v.racks.length ? (
            <div className="rev-racks">
              {(allRacks ? v.racks : v.racks.slice(0, 6)).map(r => (
                <div key={r.id} className="rev-rack" title={`${r.services} ${V.services.toLowerCase()} · ${r.customers} ${V.customers.toLowerCase()}${r.atRisk ? ` · ${inr(r.atRisk)} impacted` : ''}`}>
                  <span className="rev-rack-n"><b style={{ fontWeight: 500 }}>{r.name}</b><small>{r.room}{r.state !== 'ok' ? ` · ${r.state}` : ''}</small></span>
                  <span className="rev-rack-v">{inr(r.mrr)}<span className="vw-label"> · {Math.round((r.mrr / Math.max(1, v.base.mrr)) * 100)}%</span></span>
                  <span className="rev-bar"><i style={{ width: `${((r.mrr - r.atRisk) / maxRack) * 100}%`, background: 'var(--vw-color-slate-400)' }} /><i style={{ width: `${(r.atRisk / maxRack) * 100}%`, background: RACK_COLOR[r.state] }} /></span>
                </div>
              ))}
              {v.racks.length > 6 && <button type="button" className="panel-link" onClick={() => setAllRacks(x => !x)}>{allRacks ? 'Show fewer' : `Show all ${v.racks.length} ${v.rackBy}s`}</button>}
            </div>
          ) : <span className="faint" style={{ fontSize: 13 }}>No {V.services.toLowerCase()} are hosted at this site.</span>}
        </Panel>
        <Panel title={`${V.customers} affected`} icon={I.Users} sub={mode === 'impact' ? 'By impact so far on the open issues' : mode === 'stake' ? `By monthly ${lc(W.noun)} running on a critical fault` : `By ${lc(W.credits)} locked in over 30 days`}
          info={`Top 6 ${V.customers.toLowerCase()} on one measure so the bars compare: impact so far (${lc(W.lost)} + ${lc(W.credits)}) when anything is lost, else monthly ${lc(W.noun)} at stake, else ${lc(W.credits)} locked in. Click a bar to open the ${V.customer.toLowerCase()}.`}>
          {owed.length ? <BarList items={owed.map(c => ({ key: c.id, label: c.name, sublabel: c.premium ? V.premium : undefined, value: measure(c), display: mode === 'stake' ? perMo(measure(c)) : inr(measure(c)), color: mode === 'impact' ? LOSS : mode === 'stake' ? CREDIT : 'var(--vw-color-slate-400)', onClick: () => nav(`/customers/${c.id}`) }))} />
            : <span className="faint" style={{ fontSize: 13 }}>No {V.customer.toLowerCase()} is impacted or owed {lc(W.credits)} at this site.</span>}
        </Panel>
        <Panel title="What cost the most · 30 days" icon={I.Scale} sub={`${inr(v.trend.total)} across ${v.trend.incidents} incident${v.trend.incidents === 1 ? '' : 's'}`}
          info={`${W.impact} here over the last 30 days by cause domain: resolved incidents (duration × severity × the site's average rate), ${lc(W.credits)} locked in, and today's open impact. Each bar shows its share of the total.`}>
          {hist.length ? <BarList items={hist.map(d => ({ key: d.domain, label: d.domain, value: d.hist30, display: inr(d.hist30), secondary: `${Math.round((d.hist30 / Math.max(1, v.trend.total)) * 100)}%`, color: DOMAIN[d.domain].color }))} />
            : <span className="faint" style={{ fontSize: 13 }}>Nothing at this site has cost {lc(W.noun)} in the last 30 days.</span>}
        </Panel>
      </div>

      <ExposureTable v={v} hideDc />

      <IssueDrawer issue={open} view={v} onClose={() => setOpenId(null)} />
      <MethodDrawer open={method} onClose={() => setMethod(false)} view={v} />
    </div>
  );
}
