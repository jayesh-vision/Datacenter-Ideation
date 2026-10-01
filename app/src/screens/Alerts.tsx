import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { ackAlert, clockNow, createIncidentFromAlerts, getAlerts, getDatacenters, useQuery } from '../api';
import type { Alert, Severity } from '../api/types';
import { usePage, PageHead, Loading } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { Btn, Chip, SearchBox, Seg } from '../ui/kit';
import { ScopeChip, SCOPE_ORDER } from '../ui/scope';
import { DcLink, Fresh, IncLink, NeLink, SevDot, SeverityChip } from '../ui/status';
import { SEVERITY } from '../lib/vocab';
import { fmtAgo, fmtDateTimeS } from '../lib/format';
import { OpsKpi, useToast } from './ops/shared';

const SEVS: Severity[] = ['critical', 'major', 'minor', 'warning'];
const SOURCES = ['Interface', 'Link', 'Protocol', 'CPU', 'Environment', 'Power', 'Cooling', 'Discovery', 'Security'];

/* Real-time alert console across the estate (DC-INV-014, DC-OPS-001): filter,
   acknowledge, and correlate selected alerts into an incident. */
export function Alerts() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const sev = sp.get('sev') ?? '', source = sp.get('source') ?? '', dc = sp.get('dc') ?? '', q = sp.get('q') ?? '', state = sp.get('state') ?? 'open', scope = (sp.get('scope') ?? 'dc') as 'dc' | 'downstream' | 'all';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toast = useToast();
  usePage([{ label: 'Operate' }, { label: 'Alerts' }], dc ? { dcId: dc } : {});
  const { data: all } = useQuery(() => getAlerts({ ...(state === 'all' ? {} : { state }), scope, ...(dc ? { dcId: dc } : {}) }), [state, scope, dc]);
  const { data: dcs } = useQuery(getDatacenters, []);
  const now = clockNow();

  const base = useMemo(() => (all ?? []).filter(a => (!source || a.source === source)
    && (!q || `${a.code} ${a.title} ${a.description} ${a.neId ?? ''} ${a.node ?? ''} ${a.dcId} ${a.ifName ?? ''} ${a.linkId ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [all, source, q]);
  const rows = useMemo(() => base.filter(a => !sev || a.severity === sev), [base, sev]);
  if (!all || !dcs) return <Loading />;

  const cols: Col<Alert>[] = [
    { key: 'sev', header: 'Severity', render: a => <span className="row" style={{ gap: 8 }}><SevDot s={a.severity} /><SeverityChip s={a.severity} size="xs" /></span>, sort: a => -SEVERITY[a.severity].rank },
    { key: 'title', header: 'Alert', render: a => <span className="cell-2"><b className="strong">{a.title}</b><small className="al-desc">{a.description}</small></span>, wrap: true, width: '34%' },
    { key: 'where', header: 'Source', render: a => <span className="cell-2">{a.neId ? <NeLink id={a.neId} tab="alerts" /> : a.node ? <span className="mono">{a.node}</span> : <DcLink id={a.dcId} tab="attention" />}<small>{a.ifName ? `${a.ifName} · ` : ''}{a.nodeLocation && !a.neId ? `${a.nodeLocation} · via ` : ''}{a.dcId}</small></span>, sort: a => a.neId ?? a.node ?? a.dcId },
    { key: 'scope', header: 'Scope · category', render: a => <span className="cell-2" style={{ gap: 3 }}><ScopeChip a={a} /><small>{a.category} · {a.type}</small></span>, sort: a => SCOPE_ORDER.indexOf(a.scope) },
    { key: 'start', header: 'Started', render: a => <span className="cell-2 num">{fmtAgo(a.start, now)}<small>{a.code} · {fmtDateTimeS(a.start).slice(12)}</small></span>, sort: a => a.start },
    { key: 'state', header: 'State', render: a => <Chip size="xs" tone={a.state === 'active' ? 'error' : a.state === 'acknowledged' ? 'info' : 'neutral'}>{a.state === 'active' ? 'Active' : a.state === 'acknowledged' ? `Ack${a.ackBy ? ` · ${a.ackBy.split(' ')[0]}` : ''}` : 'Cleared'}</Chip>, sort: a => a.state },
    { key: 'inc', header: 'Incident', render: a => (a.incidentId ? <IncLink id={a.incidentId} /> : <span className="faint">—</span>), sort: a => a.incidentId ?? '' }
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
      <PageHead title="Alerts" sub="Datacenter-scoped alarms: inside the site, on links leaving it, and on what it depends on. Downstream PoP and site alarms are kept separate and never count against a datacenter."
        actions={<><Seg size="sm" value={scope} onChange={v => set('scope', v === 'dc' ? '' : v)} options={[{ id: 'dc', label: 'Datacenter scope' }, { id: 'downstream', label: 'Downstream' }, { id: 'all', label: 'All' }]} /><Fresh>Streaming · updated just now</Fresh></>} />
      <div className="kpis">
        {SEVS.map(s => {
          const n = base.filter(a => a.severity === s).length;
          return <OpsKpi key={s} label={SEVERITY[s].label} value={n} active={sev === s} onClick={() => set('sev', sev === s ? '' : s)}
            icon={<span className="sev-swatch" style={{ background: SEVERITY[s].color }} />}
            sub={`${base.filter(a => a.severity === s && a.state === 'active').length} unacknowledged · ${base.filter(a => a.severity === s && a.incidentId).length} in incidents`} />;
        })}
      </div>
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
            <div className="toolbar" style={{ width: '100%' }}>
              <span className="dt-count">{rows.length} of {all.length}</span>
              <SearchBox value={q} onChange={v => set('q', v)} placeholder="Code, title, NE, interface" width={260} />
              <select className="select" value={sev} onChange={e => set('sev', e.target.value)} aria-label="Severity"><option value="">All severity</option>{SEVS.map(s => <option key={s} value={s}>{SEVERITY[s].label}</option>)}</select>
              <select className="select" value={source} onChange={e => set('source', e.target.value)} aria-label="Source"><option value="">All sources</option>{SOURCES.map(s => <option key={s}>{s}</option>)}</select>
              <select className="select" value={dc} onChange={e => set('dc', e.target.value)} aria-label="Datacenter"><option value="">All datacenters ({dcs.length})</option>{dcs.map(d => <option key={d.id} value={d.id}>{d.id} · {d.city}</option>)}</select>
              <select className="select" value={state} onChange={e => set('state', e.target.value === 'open' ? '' : e.target.value)} aria-label="State">
                <option value="open">Active + acknowledged</option><option value="active">Active only</option><option value="acknowledged">Acknowledged</option><option value="cleared">Cleared</option><option value="all">All states</option>
              </select>
              {(sev || source || dc || q || sp.get('state')) && <button type="button" className="panel-link" onClick={() => setSp(new URLSearchParams(), { replace: true })}><I.X size={13} />Clear filters</button>}
            </div>
          } />
        <div className="ops-legend"><span className="mini-legend">{SEVS.map(s => <span key={s}><i style={{ background: SEVERITY[s].color }} />{SEVERITY[s].label}</span>)}</span><span className="faint">Select alerts that share a cause to correlate them — impact and RCA are computed from topology.</span></div>
      </section>
      {toast.node}
    </div>
  );
}
