/* MACD → Insights: the request pipeline as a dashboard. Strip (open by type, past SLA, completed on time, cycle time, first time right,
   revenue the completed work added), then flow over 14 days, the pipeline by stage, what needs attention, datacenters, types and what
   the open requests will add to the estate. Every figure opens the list filtered to the requests behind it. */
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { Panel } from '../../ui/kit';
import { Facts, SoftMeter, Split, StatGrid, StatTile } from '../../ui/Analytics';
import { TimeChart } from '../../charts/TimeChart';
import { BarList } from '../../charts/BarList';
import { fmtNum, fmtShortDate } from '../../lib/format';
import type { MacdProps } from './Macd';
import { KINDS, KindChip, SlaChip, StageChip, hrs, isOpen, money, mrcLine, plural, slaLine } from './common';

export function MacdOverview({ v, go, dcId }: MacdProps) {
  const nav = useNavigate();
  const now = v.now, m = v.metrics;
  const open = v.requests.filter(isOpen);
  const done30 = v.requests.filter(r => r.stage === 'Completed' && r.completedAt! > now - 30 * 864e5);
  const missed = done30.filter(r => r.sla === 'Missed').length;
  const rework = done30.filter(r => r.firstTimeRight === false).length;
  const ftr = done30.length ? Math.round(((done30.length - rework) / done30.length) * 100) : 100;
  const onTime = done30.length ? Math.round(((done30.length - missed) / done30.length) * 100) : 100;
  const cyc = (xs: typeof done30) => xs.length ? xs.reduce((s, r) => s + (r.completedAt! - r.created), 0) / xs.length / 36e5 : 0;
  const k = (kind: string) => open.filter(r => r.kind === kind).length;
  const billable = v.requests.some(r => r.billable);
  const mrc30 = done30.reduce((s, r) => s + r.mrcDelta, 0), nrc30 = done30.reduce((s, r) => s + r.nrc, 0);
  const pendMrc = open.reduce((s, r) => s + r.mrcDelta, 0);
  const opened14 = v.requests.filter(r => r.created > now - 14 * 864e5).length;
  const trend = Array.from({ length: 14 }, (_, i) => { const d0 = new Date(now); d0.setHours(0, 0, 0, 0); const day = d0.getTime() - (13 - i) * 864e5;
    return { day, opened: v.requests.filter(r => r.created >= day && r.created < day + 864e5).length, done: v.requests.filter(r => r.completedAt && r.completedAt >= day && r.completedAt < day + 864e5).length }; });
  const waitCr = open.filter(r => r.stage === 'Scheduled' && r.changeStatus === 'Pending approval');
  const fails = open.filter(r => (r.stage === 'Feasibility' || r.stage === 'Submitted') && r.checks.some(c => c.result === 'Fail'));
  const quotes = open.filter(r => r.stage === 'Quote' && now - r.created > 3 * 864e5);
  const blocked = open.filter(r => r.changeBlocked);
  const worst = [...open].filter(r => r.sla === 'Breached' || r.sla === 'At risk').sort((a, b) => a.slaLeftH - b.slaLeftH).slice(0, 6);
  const needs: { key: string; tone: 'bad' | 'warn'; title: string; sub: string; onClick: () => void }[] = [
    ...(m.breached ? [{ key: 'br', tone: 'bad' as const, title: `${plural(m.breached, 'request')} past SLA`, sub: 'Due date passed and not completed', onClick: () => go('requests', { sla: 'Breached' }) }] : []),
    ...(fails.length ? [{ key: 'ff', tone: 'bad' as const, title: `${plural(fails.length, 'request')} failing feasibility`, sub: fails.slice(0, 2).map(r => `${r.id} · ${r.checks.find(c => c.result === 'Fail')!.label.toLowerCase()}`).join(' · '), onClick: () => go('requests', { chk: 'fail' }) }] : []),
    ...(blocked.length ? [{ key: 'bl', tone: 'bad' as const, title: `${plural(blocked.length, 'change request')} blocked by policy`, sub: blocked[0].changeBlocked!, onClick: () => go('requests', { chk: 'blocked' }) }] : []),
    ...(waitCr.length ? [{ key: 'cr', tone: 'warn' as const, title: `${plural(waitCr.length, 'change request')} waiting for approval`, sub: waitCr.slice(0, 3).map(r => r.changeId).join(' · '), onClick: () => go('requests', { stage: 'Scheduled', chk: 'cr' }) }] : []),
    ...(quotes.length ? [{ key: 'q', tone: 'warn' as const, title: `${plural(quotes.length, 'quote')} open more than 3 days`, sub: 'Waiting for the customer to accept the charges', onClick: () => go('requests', { stage: 'Quote' }) }] : []),
    ...(m.atRisk ? [{ key: 'ar', tone: 'warn' as const, title: `${plural(m.atRisk, 'request')} at risk of missing SLA`, sub: 'Less than a quarter of the SLA time left', onClick: () => go('requests', { sla: 'At risk' }) }] : [])
  ];
  const sum = (f: (r: typeof open[number]) => boolean, x: (r: typeof open[number]) => number) => open.filter(f).reduce((s, r) => s + x(r), 0);
  const adds = [
    { n: `${fmtNum(Math.round(sum(r => r.kwDelta > 0, r => r.kwDelta) * 10) / 10)} kW`, label: 'power added' },
    { n: `${fmtNum(sum(r => r.uDelta > 0 && r.kind === 'Add', r => r.uDelta))} U`, label: 'rack space installed' },
    { n: fmtNum(sum(r => r.object === 'Cross-connect' && r.kind === 'Add', r => r.qty)), label: 'new cross-connects' },
    ...(v.requests.some(r => r.object === 'GPU nodes') ? [{ n: fmtNum(sum(r => r.object === 'GPU nodes' && r.kind === 'Add', r => r.qty)), label: 'GPU nodes allocated' }] : []),
    ...(v.requests.some(r => r.object === 'Cabinet') ? [{ n: fmtNum(sum(r => r.object === 'Cabinet' && r.kind === 'Add', r => r.qty)), label: 'new cabinets' }] : []),
    { n: `${fmtNum(sum(r => r.kind === 'Disconnect' && r.uDelta < 0, r => -r.uDelta))} U`, label: 'space released' }
  ];
  const maxStage = Math.max(1, ...m.byStage.map(s => s.n));

  return (
    <div className="dl-dash mc-ov">
      <div className="dl-span-12">
        <StatGrid fit>
          <StatTile label="Open requests" value={fmtNum(open.length)} sub={`${fmtNum(opened14)} opened in 14 days`} onClick={() => go('requests', { open: '1' })} info="Requests not completed, rejected or cancelled, by type: Move, Add, Change, Disconnect. A type opens the list filtered to it.">
            <Split parts={KINDS.map(x => ({ key: x, label: x, n: k(x), tone: x === 'Add' ? 'info' as const : x === 'Move' ? 'purple' as const : x === 'Change' ? 'cyan' as const : 'neutral' as const }))} onPick={x => go('requests', { open: '1', kind: x })} />
          </StatTile>
          <StatTile label="Past SLA" value={fmtNum(m.breached)} sub={`${fmtNum(m.atRisk)} at risk`} subTone={m.breached ? 'bad' : m.atRisk ? 'warn' : undefined} onClick={() => go('requests', { sla: 'Breached' })} info="Open requests past their due date (SLA from submission: standard or expedited per catalogue item, emergency 4 h), and those with less than a quarter of their SLA time left.">
            <Split parts={[{ key: 'Breached', label: 'Past SLA', n: m.breached, tone: 'error' }, { key: 'At risk', label: 'At risk', n: m.atRisk, tone: 'orange' }, { key: 'On track', label: 'On track', n: open.length - m.breached - m.atRisk, tone: 'info' }]} onPick={x => go('requests', { sla: x })} />
          </StatTile>
          <StatTile label="Completed · 30 days" value={fmtNum(done30.length)} sub={`${onTime}% within SLA`} subTone={onTime < 80 ? 'warn' : undefined} onClick={() => go('requests', { stage: 'Completed' })} info="Requests verified and closed in the last 30 days, and the share closed before their due date.">
            <SoftMeter pct={onTime} tone={onTime >= 80 ? 'info' : 'warning'} />
            <Facts items={[{ n: fmtNum(missed), label: 'closed after the due date', tone: missed ? 'warn' : undefined }]} />
          </StatTile>
          <StatTile label="Average cycle time" value={hrs(cyc(done30))} sub="submitted to closed" info="Mean time from submission to verified close over the requests completed in the last 30 days, overall and by type.">
            <Facts items={KINDS.map(x => ({ n: done30.some(r => r.kind === x) ? hrs(cyc(done30.filter(r => r.kind === x))) : '—', label: x })).slice(0, 3)} />
          </StatTile>
          <StatTile label="First time right" value={`${ftr}%`} sub={`${rework} needed re-work`} subTone={ftr < 85 ? 'warn' : undefined} info="Completed requests that passed verification at the first attempt (power on both feeds, light levels, link up, records match). A failed verification sends the work back to the field team.">
            <SoftMeter pct={ftr} tone={ftr >= 85 ? 'info' : 'warning'} />
            <Facts items={[{ n: fmtNum(done30.length - rework), label: 'right first time' }]} />
          </StatTile>
          {billable
            ? <StatTile label="Monthly revenue added" value={mrcLine(mrc30)} sub={`one-time ${money(nrc30)} · 30 days`} info="Change in monthly recurring charges (MRC) posted to BSS by the customer requests completed in the last 30 days (new cross-connects, power, cabinets, GPU nodes, minus disconnects), and the one-time charges (NRC) billed with them.">
                <Facts items={[{ n: mrcLine(pendMrc), label: 'more in open requests' }]} />
              </StatTile>
            : <StatTile label="Open requests add" value={`${fmtNum(m.pipelineKw)} kW`} sub={`${fmtNum(m.pipelineU)} U of rack space`} info="Power and rack space the open Add and Move requests will take once they are done.">
                <Facts items={[{ n: fmtNum(open.filter(r => r.kind === 'Disconnect').length), label: 'disconnects in flight' }]} />
              </StatTile>}
        </StatGrid>
      </div>

      <Panel className="dl-span-8 dl-h-360" title="Requests opened and completed" icon={I.ChartColumn} sub="Per day, last 14 days" info="Requests submitted per day against requests verified and closed per day. A growing gap is a growing backlog.">
        <TimeChart height={270} labels={trend.map(t => fmtShortDate(t.day))} series={[
          { key: 'o', label: 'Opened', color: '#1C81EF', kind: 'bar', values: trend.map(t => t.opened) },
          { key: 'd', label: 'Completed', color: '#BFDBFE', kind: 'bar', values: trend.map(t => t.done) }]} />
      </Panel>
      <Panel className="dl-span-4 dl-h-360" title="Pipeline by stage" icon={I.ListOrdered} count={open.length} actions={<button type="button" className="ent-link" onClick={() => go('board')}>Board →</button>} info="Open requests by the stage they are in, from intake to verification. A stage opens the board.">
        <div className="so-funnel mc-funnel">
          {m.byStage.map(s => (
            <button type="button" key={s.stage} onClick={() => go('requests', { stage: s.stage })}><span><em>{s.stage}</em><b>{fmtNum(s.n)}</b></span><i style={{ width: `${Math.max(3, (s.n / maxStage) * 100)}%` }} /></button>))}
        </div>
      </Panel>

      <Panel className="dl-span-6 dl-h-360" title="Needs attention" icon={I.TriangleAlert} count={needs.length + worst.length} info="What the MACD desk should pick up next: requests past SLA, failing feasibility, change requests blocked or waiting for approval, quotes the customer has not accepted, requests at risk. Then the requests closest to (or furthest past) their due date.">
        <ul className="ipam-find">
          {needs.map(x => <li key={x.key}><button type="button" onClick={x.onClick}><i className={`so-dot is-${x.tone}`} /><span className="cell-2"><b>{x.title}</b><small>{x.sub}</small></span><I.ChevronRight size={14} className="ipam-chev" /></button></li>)}
          {worst.map(r => <li key={r.id}><button type="button" onClick={() => nav(`/macd/requests/${r.id}`)}><SlaChip s={r.sla} /><span className="cell-2"><b>{r.title}</b><small><span className="mono">{r.id}</span> · {r.dcId} · {r.stage} · {slaLine(r)}</small></span><I.ChevronRight size={14} className="ipam-chev" /></button></li>)}
          {!needs.length && !worst.length && <li><p className="vw-label" style={{ margin: 0 }}>Nothing waiting.</p></li>}
        </ul>
      </Panel>
      <Panel className="dl-span-6 dl-h-360" title={dcId ? 'This datacenter' : 'Datacenters'} icon={I.Building2} count={v.sites.length} sub="Most past SLA first" info="Open MACD requests per datacenter, with those at risk or past SLA and the share closed on time in 30 days. A datacenter scopes the whole screen to it.">
        <BarList items={v.sites.map(s => ({ key: s.dcId, label: s.dcId, sublabel: `${s.breached} past SLA · ${s.atRisk} at risk · ${s.done30} done in 30 d, ${s.onTimePct}% on time`, value: s.open, display: `${s.open} open`, color: s.breached ? '#FCA5A5' : s.atRisk ? '#FDBA74' : '#60A5FA', onClick: () => go('overview', { dc: s.dcId }) }))} />
      </Panel>

      <Panel className="dl-span-6" title="By type" icon={I.Shuffle} info="Open and completed requests per MACD type, with the average cycle time of the completed ones.">
        <table className="nst-table mc-kinds"><thead><tr><th>Type</th><th>Open</th><th>Past SLA</th><th>Done · 30 d</th><th>Avg cycle</th></tr></thead>
          <tbody>{KINDS.map(x => { const d = done30.filter(r => r.kind === x); return (
            <tr key={x} onClick={() => go('requests', { kind: x })} className="is-click"><td><KindChip k={x} /></td><td>{fmtNum(k(x))}</td><td>{fmtNum(open.filter(r => r.kind === x && r.sla === 'Breached').length)}</td><td>{fmtNum(d.length)}</td><td>{d.length ? hrs(cyc(d)) : '—'}</td></tr>); })}</tbody></table>
      </Panel>
      <Panel className="dl-span-6" title="What the open requests change" icon={I.Boxes} info="What the open requests will add to (or release from) the estate once they are done: power, rack space, cross-connects, GPU nodes and cabinets, and the monthly charges they move.">
        <Facts items={adds} />
        {billable && <p className="mc-note"><StageChip s="Quote" /> {plural(open.filter(r => r.stage === 'Quote').length, 'quote')} out · monthly charges in flight {mrcLine(pendMrc)}</p>}
      </Panel>
    </div>
  );
}
