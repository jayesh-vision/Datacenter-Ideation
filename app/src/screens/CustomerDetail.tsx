import { useNavigate, useParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getCustomer, useQuery, vocabNow } from '../api';
import type { Customer, Service } from '../api/types';
import { usePage, PageHead, Loading, useSentinel } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { Chip, Kpi, Panel, Empty, KV } from '../ui/kit';
import { DcLink, IncLink, IncidentChip, Meter, NeLink, ServiceChip, SevChip } from '../ui/status';
import { fmtINR, fmtQty } from '../lib/format';
import { TYPE_TONE, atRisk } from './Services';
import { NotFound } from './NotFound';
import '../styles/plan.css';
import { OpstralBtn } from '../ui/OpstralMark';

type Row = Service & { customer: Customer };

export function CustomerDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const ask = useSentinel();
  const { data, loading } = useQuery(() => getCustomer(id), [id]);
  const V = vocabNow();
  usePage([{ label: V.customers, to: '/customers' }, { label: data?.customer.name ?? id }]);
  if (loading && !data) return <Loading />;
  if (!data) return <NotFound what="Customer" />;
  const { customer: c, services, incidents } = data;
  const risky = services.filter(atRisk);
  const belowSla = services.filter(s => s.status !== 'Disabled' && s.uptime30d < s.slaTarget);
  const dcs = [...new Set(services.map(s => s.dcId))];

  const cols: Col<Row>[] = [
    { key: 'id', header: 'Service ID', render: s => <span className="mono strong">{s.id}</span>, sort: s => s.id },
    { key: 'type', header: 'Type', render: s => <Chip tone={(TYPE_TONE[s.type] ?? 'neutral')} size="xs">{s.type}</Chip>, sort: s => s.type },
    { key: 'dc', header: 'Datacenter', render: s => <DcLink id={s.dcId} />, sort: s => s.dcId },
    { key: 'ne', header: V.handoff, render: s => <span className="cell-2"><NeLink id={s.neId} tab="services">{s.neId.replace(`${s.dcId}-`, '')}</NeLink><small className="mono">{s.ifName}</small></span> },
    { key: 'status', header: 'Status', render: s => <ServiceChip s={s.status} size="xs" /> },
    { key: 'bw', header: 'Size', align: 'right', render: s => <span className="num">{fmtQty(s.qty, s.unit)}</span>, sort: s => s.qty },
    { key: 'util', header: 'Utilisation', render: s => <Meter pct={s.utilPct} width={60} />, sort: s => s.utilPct },
    { key: 'sla', header: 'SLA / uptime', align: 'right', render: s => <span className="num">{s.slaTarget}% / <span className={s.uptime30d < s.slaTarget ? 'bad' : ''}>{s.uptime30d}%</span></span>, sort: s => s.uptime30d - s.slaTarget },
    { key: 'rev', header: 'Revenue / mo', align: 'right', render: s => <span className="num">{fmtINR(s.revenueMonthly)}</span>, sort: s => s.revenueMonthly }
  ];

  return (
    <div className="page">
      <PageHead title={c.name} chips={<><Chip tone="neutral">{c.segment}</Chip>{c.premium && <Chip tone="purple">Premium</Chip>}{c.exposed > 0 && <Chip tone="error">{c.exposed} exposed</Chip>}</>}
        sub={<span className="mono">{c.id}</span>} actions={<OpstralBtn onClick={() => ask(incidents[0] ? `Who is impacted by ${incidents[0].id}?` : `What services depend on ${services[0]?.neId ?? ''}?`)} />} />
      <section className="card" style={{ padding: '16px 20px' }}>
        <KV cols={5} items={[['Location', `${c.city}, ${c.state}`], ['Service plan', c.plan], ['Account manager', c.accountManager], ['Footprint', <span title={dcs.join(', ')}>{dcs.length} datacenters</span>], ['Criticality', c.premium ? 'Premium — proactive notification' : 'Standard']]} />
      </section>
      <div className="kpis">
        <Kpi label={`Active ${V.services.toLowerCase()}`} value={services.filter(s => s.status !== 'Disabled').length} icon={I.Waypoints} tone="info" basis={`${services.length} provisioned · ${fmtQty(services.filter(s => s.unit === V.primaryUnit).reduce((a, s) => a + s.qty, 0), V.primaryUnit)} total`} />
        <Kpi label="Average utilisation" value={c.avgUtil} unit="%" icon={I.Activity} tone={c.avgUtil >= 75 ? 'warning' : 'success'} basis={`${risky.length} at risk (degraded or ≥ 90%)`} />
        <Kpi label="Lowest 30-day uptime" value={services.length ? c.minUptime : '—'} unit={services.length ? '%' : undefined} icon={I.ShieldCheck} tone={belowSla.length ? 'error' : 'success'} basis={`${belowSla.length} service${belowSla.length === 1 ? '' : 's'} below SLA target`} />
        <Kpi label="Revenue / month" value={fmtINR(c.revenueMonthly)} icon={I.IndianRupee} tone="purple" basis={`${fmtINR(c.revenueMonthly * 12)} a year`} />
      </div>
      {c.exposed > 0 ? (
        <div className="note note--bad"><I.ShieldAlert size={16} /><span><b>{c.exposed} service{c.exposed > 1 ? 's are' : ' is'} exposed.</b> {incidents.length ? `${incidents.length} open incident${incidents.length > 1 ? 's' : ''} touch this customer's infrastructure path.` : 'Degraded service state on the delivery path.'} {c.premium ? `Notify ${c.accountManager} and the customer as premium SLA requires.` : ''}</span></div>
      ) : <div className="note note--good"><I.CheckCircle2 size={16} /><span>No service is degraded or on the scope of an open incident.</span></div>}
      <Panel title="Open incidents impacting this customer" count={incidents.length} icon={I.Siren} flush>
        {incidents.length ? (
          <table className="nst-table dt-table"><thead><tr><th>Incident</th><th>Sev</th><th>Status</th><th>Datacenter</th><th>Impact</th><th>Owner</th></tr></thead>
            <tbody>{incidents.map(i => (
              <tr key={i.id} className="is-click" onClick={() => nav(`/incidents/${i.id}`)}>
                <td className="is-wrap"><span className="cell-2"><IncLink id={i.id} /><small>{i.title}</small></span></td><td><SevChip n={i.sev} size="xs" /></td><td><IncidentChip s={i.status} size="xs" /></td><td><DcLink id={i.dcId} /></td><td className="is-wrap" style={{ maxWidth: 360 }}>{i.impact.summary}</td><td>{i.owner}</td>
              </tr>))}</tbody></table>
        ) : <Empty icon={I.CheckCircle2} title="No open incidents" />}
      </Panel>
      <Panel title="Services" count={services.length} icon={I.Waypoints} flush>
        <DataTable rows={services} cols={cols} onRow={s => nav(`/services/${s.id}`)} defaultSort={{ key: 'util', dir: 'desc' }} />
      </Panel>
    </div>
  );
}
