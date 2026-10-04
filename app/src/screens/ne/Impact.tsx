import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListToolbar } from '../../ui/ListToolbar';
import * as I from 'lucide-react';
import type { ServiceType } from '../../api/types';
import { Chip, Panel } from '../../ui/kit';
import { DataTable, type Col } from '../../ui/DataTable';
import { CustLink, Meter, ServiceChip, SvcLink } from '../../ui/status';
import { fmtQty } from '../../lib/format';
import { OpsKpi } from '../ops/shared';
import type { NeData } from './NetworkElement';
import { NoTelemetry } from './common';

type S = NeData['services'][number];
/* service families present on this device — circuit types, colocation contracts, cloud workloads or enterprise applications */
const familiesOf = (svcs: { type: ServiceType }[]): { t: ServiceType; label: string }[] => [...new Set(svcs.map(s => s.type))].map(t => ({ t, label: t === 'Other' ? 'Others' : t }));
const isOpen = (s: string) => s === 'Open' || s === 'Investigating' || s === 'Mitigated';

/* Impact — the services and customers that ride this device, as operational
   impact only: what is degraded, what is at risk because of an open incident
   or a faulty link on this device, and who is behind it. */
export function Impact({ d }: { d: NeData }) {
  const nav = useNavigate();
  const [iq, setIq] = useState(''), [ist, setIst] = useState(''), [ity, setIty] = useState('');
  if (d.ne.discovery === 'not-discovered') return <NoTelemetry ne={d.ne} what="services" />;
  const svcs = d.services;
  if (!svcs.length) return <section className="vw-card-section"><div className="empty"><span className="empty-ico"><I.Waypoints size={22} /></span><b>Nothing is hosted on this element</b><div>{d.ne.role === 'Switch' ? 'Switches carry infrastructure traffic; what rides them is listed on their links.' : d.ne.role === 'Tenant gear' ? 'Tenant-owned equipment: the operator sees the cabinet’s power and environment, not what runs inside.' : 'This element carries transit traffic only; what traverses it is listed on its links.'}</div></div></section>;

  const live = svcs.filter(s => s.status !== 'Disabled');
  const linkById = new Map(d.links.map(l => [l.id, l]));
  const openInc = d.incidents.filter(i => isOpen(i.status));
  const incLinks = new Set(openInc.flatMap(i => i.affected.filter(a => a.kind === 'Link').map(a => a.id)));
  const incOnDevice = openInc.length > 0;
  const act = d.alerts.filter(a => a.state !== 'cleared');
  const alarmIfs = new Set(act.map(a => a.ifName).filter(Boolean));
  /* why a service is at risk, in operator terms */
  const riskOf = (s: S): string | null => {
    if (s.status === 'Down') return 'service down';
    if (s.status === 'Degraded') return 'service degraded';
    const bad = s.linkIds.map(id => linkById.get(id)).find(l => l && (l.state === 'down' || incLinks.has(l.id) || l.utilPct >= 85));
    if (bad) { const local = bad.aNe === d.ne.id ? bad.aIf : bad.zIf; return bad.state === 'down' ? `rides ${local} (down)` : incLinks.has(bad.id) ? `rides ${local} (in incident)` : `rides ${local} (${bad.utilPct}% utilised)`; }
    if (alarmIfs.has(s.ifName)) return `alarm on handoff ${s.ifName}`;
    if (s.utilPct >= 90) return `${s.utilPct}% of ${fmtQty(s.qty, s.unit)}`;
    return null;
  };
  const atRisk = live.map(s => ({ s, why: riskOf(s) })).filter(x => x.why);
  const custs = new Map(live.map(s => [s.customerId, s.customer]));
  const custsAtRisk = new Set(atRisk.map(x => x.s.customerId));
  const premAtRisk = [...custsAtRisk].filter(id => custs.get(id)?.premium).length;
  const belowSla = live.filter(s => s.uptime30d < s.slaTarget).length;
  const shownSvcs = svcs.filter(s => (!ist || s.status === ist) && (!ity || s.type === ity) && (!iq || `${s.id} ${s.customer.name} ${s.type}`.toLowerCase().includes(iq.toLowerCase())));
  const fam = familiesOf(svcs).map(f => ({ ...f, cs: svcs.filter(s => s.type === f.t) })).filter(f => f.cs.length);

  const cols: Col<S>[] = [
    { key: 'id', header: 'Service', render: s => <span className="cell-2"><SvcLink id={s.id} /><small>{s.type} · handoff <span className="mono">{s.ifName}</span></small></span>, sort: s => s.id },
    { key: 'cust', header: 'Customer', render: s => <span className="cell-2"><CustLink id={s.customerId}>{s.customer.name}</CustLink><small>{s.customer.segment}{s.customer.premium ? ' · premium' : ''}</small></span>, sort: s => s.customer.name },
    { key: 'st', header: 'Status', render: s => { const why = riskOf(s); return <span className="cell-2" style={{ gap: 3 }}><ServiceChip s={s.status} size="xs" />{why && s.status === 'Active' && <small className="warn">{why}</small>}</span>; }, sort: s => (riskOf(s) ? 0 : 1) },
    { key: 'util', header: 'Size · utilisation', render: s => <span className="cell-2"><Meter pct={s.utilPct} width={56} /><small className="num">{fmtQty(s.qty, s.unit)}</small></span>, sort: s => s.utilPct },
    { key: 'up', header: 'Uptime 30 d / SLA', align: 'right', render: s => <span className="cell-2 num" style={{ alignItems: 'flex-end' }}><span className={s.uptime30d < s.slaTarget ? 'bad' : ''}>{s.uptime30d}%</span><small>target {s.slaTarget}%</small></span>, sort: s => s.uptime30d - s.slaTarget }
  ];

  return (
    <>
      <div className="kpis">
        <OpsKpi label="Services on this device" value={svcs.length} sub={`${live.length} live · ${custs.size} customers`} icon={<I.Waypoints size={15} />} />
        <OpsKpi label="At risk now" value={atRisk.length} tone={atRisk.length ? 'bad' : undefined} sub={atRisk.length ? `${custsAtRisk.size} customers · ${premAtRisk} premium` : 'no service affected'} icon={<I.TriangleAlert size={15} />} />
        <OpsKpi label="Degraded / down" value={live.filter(s => s.status !== 'Active').length} tone={live.some(s => s.status !== 'Active') ? 'warn' : undefined} sub={`${live.filter(s => s.status === 'Degraded').length} degraded · ${live.filter(s => s.status === 'Down').length} down`} icon={<I.Activity size={15} />} />
        <OpsKpi label="Below SLA · 30 d" value={belowSla} tone={belowSla ? 'warn' : undefined} sub={belowSla ? 'uptime under contracted target' : 'all within target'} icon={<I.ShieldCheck size={15} />} />
      </div>

      <div className="grid g-main-side ne-impact" style={{ alignItems: 'start' }}>
        <section className="vw-card-section" style={{ padding: 0, overflow: 'hidden' }}>
          <DataTable rows={shownSvcs} cols={cols} onRow={s => nav(`/services/${s.id}`)} pageSize={20} defaultSort={{ key: 'st', dir: 'asc' }}
            toolbar={
              <ListToolbar shown={shownSvcs.length} total={svcs.length}
                search={{ value: iq, onChange: setIq, placeholder: 'Service, customer' }}
                filters={[
                  { id: 'st', label: 'Status', quick: true, value: ist, anyLabel: 'Any status', onChange: setIst, options: [...new Set(svcs.map(s => s.status))].map(x => ({ id: x, label: x, count: svcs.filter(s => s.status === x).length })) },
                  { id: 'ty', label: 'Type', quick: true, value: ity, anyLabel: 'Any type', onChange: setIty, options: [...new Set(svcs.map(s => s.type))].map(x => ({ id: x, label: x, count: svcs.filter(s => s.type === x).length })) }
                ]} />
            } />
        </section>
        <div className="col" style={{ gap: 16 }}>
          <Panel title="At risk now" count={atRisk.length} sub={incOnDevice ? `${openInc.length} open incident${openInc.length > 1 ? 's' : ''} on this device` : 'from faulty links and alarms on this device'} flush>
            {atRisk.length ? <div className="att-list">{atRisk.map(({ s, why }) => (
              <button key={s.id} type="button" className="att-row" onClick={() => nav(`/services/${s.id}`)}>
                <span className="att-main"><b>{s.customer.name}{s.customer.premium ? ' · premium' : ''}</b><small>{s.id} · {s.type} · {why}</small></span>
                <ServiceChip s={s.status} size="xs" />
              </button>))}</div> : <div className="empty" style={{ padding: 24 }}><span className="empty-ico"><I.ShieldCheck size={20} /></span><b>No service at risk</b></div>}
          </Panel>
          <Panel title="By service family">
            <div className="att-kv">{fam.map(f => { const deg = f.cs.filter(s => s.status === 'Degraded' || s.status === 'Down').length; return (
              <div key={f.t} className="att-kv-row"><span className="vw-label">{f.label}</span><span className="vw-value num">{f.cs.length}{deg ? <Chip tone="warning" size="xs" title="degraded or down">{deg}</Chip> : null}</span></div>
            ); })}</div>
          </Panel>
        </div>
      </div>
    </>
  );
}
