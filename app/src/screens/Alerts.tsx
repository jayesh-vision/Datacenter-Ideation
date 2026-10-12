import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { ackAlert, clockNow, createIncidentFromAlerts, getAlerts, getDatacenters, useQuery } from '../api';
import type { Alert, Severity } from '../api/types';
import { usePage, PageHead, Loading } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { Btn, Chip } from '../ui/kit';
import { ListToolbar, useParamPatch } from '../ui/ListToolbar';
import { ScopeChip, SCOPE_ORDER } from '../ui/scope';
import { DcLink, Fresh, IncLink, NeLink, SevDot, SeverityChip } from '../ui/status';
import { SEVERITY } from '../lib/vocab';
import { fmtAgo, fmtDateTimeS } from '../lib/format';
import { useToast } from './ops/shared';
import { Facts, MiniBars, RankList, SoftMeter, Split, StatGrid, StatTile, type Tone } from '../ui/Analytics';
import { fmtDur } from '../lib/format';

const SEVS: Severity[] = ['critical', 'major', 'minor', 'warning'];
const SOURCES = ['Interface', 'Link', 'Protocol', 'CPU', 'Environment', 'Power', 'Cooling', 'Discovery', 'Security'];

/* Real-time alert console across the estate (DC-INV-014, DC-OPS-001): filter,
   acknowledge, and correlate selected alerts into an incident. */
export function Alerts() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const applyParams = useParamPatch();
  const sev = sp.get('sev') ?? '', source = sp.get('source') ?? '', dc = sp.get('dc') ?? '', q = sp.get('q') ?? '', state = sp.get('state') ?? 'open', scope = (sp.get('scope') ?? 'dc') as 'dc' | 'downstream' | 'all';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toast = useToast();
  usePage([{ label: 'Operate' }, { label: 'Alerts' }], dc ? { dcId: dc } : {});
  const { data: all, reload } = useQuery(() => getAlerts({ ...(state === 'all' ? {} : { state }), scope, ...(dc ? { dcId: dc } : {}) }), [state, scope, dc]);
  const { data: dcs } = useQuery(getDatacenters, []);
  const now = clockNow();

  const base = useMemo(() => (all ?? []).filter(a => (!source || a.source === source)
    && (!q || `${a.code} ${a.title} ${a.description} ${a.neId ?? ''} ${a.node ?? ''} ${a.dcId} ${a.ifName ?? ''} ${a.linkId ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [all, source, q]);
  const rows = useMemo(() => base.filter(a => !sev || a.severity === sev), [base, sev]);
  if (!all || !dcs) return <Loading />;

  const cols: Col<Alert>[] = [
    { key: 'sev', header: 'Severity', width: '9%', render: a => <span className="row" style={{ gap: 8 }}><SevDot s={a.severity} /><SeverityChip s={a.severity} size="xs" /></span>, sort: a => -SEVERITY[a.severity].rank },
    { key: 'title', header: 'Alert', render: a => <span className="cell-2"><b className="strong">{a.title}</b><small className="al-desc">{a.description}</small></span>, wrap: true, width: '34%' },
    { key: 'where', header: 'Source', width: 196, wrap: true, render: a => <span className="cell-2">{a.neId ? <NeLink id={a.neId} tab="alerts" /> : a.node ? <span className="mono">{a.node}</span> : <DcLink id={a.dcId} tab="attention" />}<small>{a.ifName ? `${a.ifName} · ` : ''}{a.nodeLocation && !a.neId ? `${a.nodeLocation} · via ` : ''}{a.dcId}</small></span>, sort: a => a.neId ?? a.node ?? a.dcId },
    { key: 'scope', header: 'Scope · category', width: '14%', wrap: true, render: a => <span className="cell-2" style={{ gap: 3 }}><ScopeChip a={a} /><small>{a.category} · {a.type}</small></span>, sort: a => SCOPE_ORDER.indexOf(a.scope) },
    { key: 'start', header: 'Started', width: 150, render: a => <span className="cell-2 num">{fmtAgo(a.start, now)}<small>{a.code} · {fmtDateTimeS(a.start).slice(12)}</small></span>, sort: a => a.start },
    { key: 'state', header: 'State', width: 96, hideBelow: 1320, render: a => <Chip size="xs" tone={a.state === 'active' ? 'error' : a.state === 'acknowledged' ? 'info' : 'neutral'}>{a.state === 'active' ? 'Active' : a.state === 'acknowledged' ? `Ack${a.ackBy ? ` · ${a.ackBy.split(' ')[0]}` : ''}` : 'Cleared'}</Chip>, sort: a => a.state },
    { key: 'inc', header: 'Incident', width: 92, render: a => (a.incidentId ? <IncLink id={a.incidentId} /> : <span className="faint">—</span>), sort: a => a.incidentId ?? '' }
  ];
  const selected = rows.filter(a => sel.has(a.id));
  const correlate = async () => {
    const id = await createIncidentFromAlerts(selected.map(a => a.id));
    setSel(new Set());
    if (id) nav(`/incidents/${id}`);
  };
  const ack = async () => {
    const n = selected.filter(a => a.state === 'active');
    for (const a of n) await ackAlert(a.id);
    setSel(new Set()); toast.show(`${n.length} alert${n.length === 1 ? '' : 's'} acknowledged`, 'Ownership recorded in the audit trail.');
  };

  return (
    <div className="page">
      <PageHead title="Alerts" sub="Alarms inside each datacenter, on its edge links and on its dependencies; downstream alarms are kept separate."
        actions={<Fresh>Streaming · updated just now</Fresh>} />
      <AlertAnalytics alarms={base} now={now} sev={sev} onSev={v => set('sev', sev === v ? '' : v)} onDc={v => set('dc', v)} />
      <section className="card">
        <DataTable rows={rows} cols={cols} selectable selected={sel} onSelect={setSel} pageSize={25}
          onRow={a => nav(a.neId ? `/ne/${encodeURIComponent(a.neId)}?tab=alerts` : `/datacenters/${a.dcId}?tab=attention`)}
          bulkbar={<>
            <b className="num">{selected.length}</b> selected
            <Btn size="xs" variant="filled" icon={I.GitMerge} onClick={correlate}>Correlate into incident</Btn>
            <Btn size="xs" icon={I.CheckCheck} onClick={ack} disabled={!selected.some(a => a.state === 'active')}>Acknowledge</Btn>
            <button type="button" className="panel-link" onClick={() => setSel(new Set())}>Clear</button>
          </>}
          toolbar={
            <ListToolbar onApply={applyParams} shown={rows.length} total={all.length} onRefresh={reload}
              search={{ value: q, onChange: v => set('q', v), placeholder: 'Code, title, device…' }}
              filters={[
                { id: 'sev', label: 'Severity', quick: true, value: sev, anyLabel: 'Any severity', onChange: v => set('sev', v), options: SEVS.map(s => ({ id: s, label: SEVERITY[s].label, count: base.filter(a => a.severity === s).length })) },
                { id: 'scope', label: 'Scope', quick: true, value: scope, defaultValue: 'dc', onChange: v => set('scope', v === 'dc' ? '' : v), options: [{ id: 'dc', label: 'DC scope' }, { id: 'downstream', label: 'Downstream' }, { id: 'all', label: 'All scopes' }] },
                { id: 'state', label: 'State', value: state, defaultValue: 'open', onChange: v => set('state', v === 'open' ? '' : v), options: [{ id: 'open', label: 'Open' }, { id: 'active', label: 'Active only' }, { id: 'acknowledged', label: 'Acknowledged' }, { id: 'cleared', label: 'Cleared' }, { id: 'all', label: 'All states' }] },
                { id: 'source', label: 'Source', value: source, anyLabel: 'Any source', onChange: v => set('source', v), options: SOURCES.map(s => ({ id: s, label: s })) },
                { id: 'dc', label: 'Datacenter', value: dc, anyLabel: 'Any datacenter', onChange: v => set('dc', v), options: dcs.map(d => ({ id: d.id, label: `${d.id} · ${d.city}` })) }
              ]} />
          } />
        <div className="ops-legend"><span className="mini-legend">{SEVS.map(s => <span key={s}><i style={{ background: SEVERITY[s].color }} />{SEVERITY[s].label}</span>)}</span><span className="faint">Select alerts that share a cause to correlate them — impact and RCA are computed from topology.</span></div>
      </section>
      {toast.node}
    </div>
  );
}

/* analytics strip: what the alarm load is, how much is handled, where it comes from */
const SEV_TONE: Record<Severity, Tone> = { critical: 'error', major: 'orange', minor: 'warning', warning: 'neutral' };
const CAT_TONE: Record<string, Tone> = { Facility: 'purple', Network: 'info', Device: 'cyan', Performance: 'neutral' };
function AlertAnalytics({ alarms, now, sev, onSev, onDc }: { alarms: Alert[]; now: number; sev: string; onSev: (s: string) => void; onDc: (dc: string) => void }) {
  const unack = alarms.filter(a => a.state === 'active');
  const ackPct = alarms.length ? Math.round(((alarms.length - unack.length) / alarms.length) * 100) : 100;
  const critUnack = unack.filter(a => a.severity === 'critical').length;
  const oldest = unack.length ? Math.min(...unack.map(a => a.start)) : 0;
  const inInc = alarms.filter(a => a.incidentId);
  const incs = new Set(inInc.map(a => a.incidentId)).size;
  const cats = ['Facility', 'Network', 'Device', 'Performance'];
  const hours = Array.from({ length: 24 }, (_, h) => alarms.filter(a => a.start > now - (24 - h) * 3600000 && a.start <= now - (23 - h) * 3600000).length);
  const raised = hours.reduce((x, y) => x + y, 0);
  const peak = hours.indexOf(Math.max(...hours));
  const byDc = Object.entries(alarms.reduce<Record<string, number>>((m, a) => { m[a.dcId] = (m[a.dcId] ?? 0) + 1; return m; }, {})).sort((x, y) => y[1] - x[1]).slice(0, 3);
  const critDc = new Set(alarms.filter(a => a.severity === 'critical').map(a => a.dcId));
  return (
    <StatGrid>
      <StatTile label="Active alarms" value={alarms.length} sub={`${unack.length} unacked`} info="Alarms matching the current scope, state and source filters, by severity. Unacked = still Active, not yet acknowledged by anyone. Click a severity to filter the list.">
        <Split parts={SEVS.map(s => ({ key: s, label: SEVERITY[s].label, n: alarms.filter(a => a.severity === s).length, tone: SEV_TONE[s] }))} onPick={onSev} active={sev} />
      </StatTile>
      <StatTile label="Acknowledged" value={`${ackPct}%`} sub={`${alarms.length - unack.length} of ${alarms.length}`} info="Share of the listed alarms that are no longer Active (acknowledged or cleared). Facts: critical alarms still waiting for an owner, and the age of the oldest unacknowledged alarm.">
        <SoftMeter pct={ackPct} tone={ackPct >= 80 ? 'success' : ackPct >= 50 ? 'warning' : 'error'} />
        <Facts items={[{ n: critUnack, label: 'critical waiting', tone: critUnack ? 'bad' : undefined }, { n: oldest ? fmtDur((now - oldest) / 60000) : '—', label: 'oldest' }]} />
      </StatTile>
      <StatTile label="Correlated" value={inInc.length} sub={`alarms in ${incs} incident${incs === 1 ? '' : 's'}`} info="Listed alarms already attached to an incident versus still uncorrelated. To correlate, select alarms that share a cause in the list and use Correlate into incident.">
        <Split parts={[{ key: 'in', label: 'In incidents', n: inInc.length, tone: 'info' }, { key: 'free', label: 'Uncorrelated', n: alarms.length - inInc.length, tone: 'neutral' }]} />
      </StatTile>
      <StatTile label="By category" value={cats.filter(c => alarms.some(a => a.category === c)).length} sub="categories active" info="How many alarm categories (Facility, Network, Device, Performance) have at least one listed alarm, and how the alarms split between them.">
        <Split parts={cats.map(c => ({ key: c, label: c, n: alarms.filter(a => a.category === c).length, tone: CAT_TONE[c] }))} />
      </StatTile>
      <StatTile label="Raised · last 24 h" value={raised} sub={raised ? `peak at ${String(new Date(now - (23 - peak) * 3600000).getHours()).padStart(2, '0')}:00` : 'quiet'} info="Listed alarms that started in the last 24 hours: the bar splits them by severity, the columns count them per hour (the busiest hour is highlighted and named in the qualifier).">
        <Split legend={false} parts={SEVS.map(s => ({ key: s, label: SEVERITY[s].label, n: alarms.filter(a => a.severity === s && a.start > now - 86400000).length, tone: SEV_TONE[s] }))} />
        <MiniBars values={hours} labels={['24 h ago', 'now']} hot={raised ? peak : undefined} />
      </StatTile>
      <StatTile label="Top datacenters" value={`${alarms.length ? Math.round((byDc.reduce((a, x) => a + x[1], 0) / alarms.length) * 100) : 0}%`} sub="of alarms in top 3" info="Share of the listed alarms that sit in the three datacenters with the most alarms. A red bar means that site has a critical alarm. Click a site to filter the list to it.">
        <SoftMeter pct={alarms.length ? (byDc.reduce((a, x) => a + x[1], 0) / alarms.length) * 100 : 0} tone="warning" />
        <RankList items={byDc.map(([dc, n]) => ({ key: dc, label: dc, n, tone: critDc.has(dc) ? 'error' : 'warning', onClick: () => onDc(dc) }))} />
      </StatTile>
    </StatGrid>
  );
}
