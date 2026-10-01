import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDatacenter, runDiscovery, useQuery, clockNow } from '../../api';
import { usePage, Loading, useSentinel } from '../../shell/page';
import { Btn, Chip } from '../../ui/kit';
import { RolloutChip, Fresh } from '../../ui/status';
import { fmtAgo, fmtINR, fmtNum } from '../../lib/format';
import { NotFound } from '../NotFound';
import { Attention } from './Attention';
import { Elements } from './Elements';
import { Finance } from './Finance';
import { Details } from './Details';
import { Equipment } from './Equipment';
import { Timeline } from './Timeline';
import '../../styles/site.css';

export type SiteData = NonNullable<Awaited<ReturnType<typeof getDatacenter>>>;
type Tab = 'attention' | 'elements' | 'capex' | 'opex' | 'details' | 'equipment' | 'timeline';
const TABS: { id: Tab; label: string }[] = [
  { id: 'attention', label: 'Attention' }, { id: 'elements', label: 'Network elements' }, { id: 'capex', label: 'Capex' }, { id: 'opex', label: 'Opex' },
  { id: 'details', label: 'Site details' }, { id: 'equipment', label: 'Site equipment' }, { id: 'timeline', label: 'Timeline' }
];

/* INV-02 / INV-04 / INV-05 — one site profile: identity, reconciliation,
   finance, physical plant, cabling and the operational timeline. */
export function Site() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const ask = useSentinel();
  const [disc, setDisc] = useState<{ busy: boolean; msg?: string }>({ busy: false });
  usePage([{ label: 'Location', to: '/inventory' }, { label: 'Datacenters — filtered list', to: '/inventory/datacenters' }, { label: id }], { dcId: id });
  const { data, loading } = useQuery(() => getDatacenter(id), [id]);
  if (loading && !data) return <Loading label="Loading site" />;
  if (!data) return <NotFound what="Datacenter" />;
  const { dc, summary: s } = data;
  const gaps = s.notDiscovered + s.drifted + dc.risks.length;
  const tab = (sp.get('tab') as Tab) || (gaps ? 'attention' : 'details');
  const go = (t: Tab) => { const n = new URLSearchParams(sp); n.set('tab', t); ['role', 'disc', 'q', 'kind'].forEach(k => n.delete(k)); setSp(n, { replace: true }); };
  const now = clockNow();
  const roles = Object.entries(s.byRole).sort((a, b) => b[1] - a[1]);
  const capexPct = s.capexApproved ? Math.round((s.capexCommitted / s.capexApproved) * 100) : 0;
  const staleCol = dc.collectors.filter(c => c.state !== 'up');

  const doDiscovery = () => {
    setDisc({ busy: true });
    runDiscovery(dc.id).then(n => setDisc({ busy: false, msg: n ? `Collector sweep found ${n} element${n === 1 ? '' : 's'} — records reconciled and audited.` : 'Collector sweep complete — no new elements found. Remaining gaps are planned or need a field visit.' }));
  };

  const strip: { l: string; v: string; s: string; c: string; to: Tab }[] = [
    { l: 'Network elements', v: fmtNum(s.ne), s: roles.map(([k, v]) => `${k} ${v}`).join(' · '), c: 'var(--vw-color-sky-500)', to: 'elements' },
    { l: 'Discovered', v: fmtNum(s.discovered), s: `${s.coveragePct}% of record`, c: 'var(--vw-color-emerald-500)', to: 'elements' },
    { l: 'Drifted', v: fmtNum(s.drifted), s: 'incl. duplicate serials', c: 'var(--vw-color-amber-400)', to: 'attention' },
    { l: 'Not discovered', v: fmtNum(s.notDiscovered), s: 'planned or no collector', c: 'var(--vw-color-red-400)', to: 'attention' },
    { l: 'Links terminating', v: fmtNum(s.links), s: 'LLDP · OSPF · ISIS · BGP · LSP', c: 'var(--vw-color-purple-400)', to: 'equipment' },
    { l: 'Capex committed', v: fmtINR(s.capexCommitted), s: `one-off · ${capexPct}% of ${fmtINR(s.capexApproved)}`, c: 'var(--vw-color-cyan-500)', to: 'capex' },
    { l: 'Opex run rate', v: s.opexMonthly ? `${fmtINR(s.opexMonthly)}/mo` : '—', s: s.opexMonthly ? `recurring · ${fmtINR(s.opexMonthly * 12)} a year` : 'not yet billing', c: 'var(--vw-color-teal-500)', to: 'opex' }
  ];

  return (
    <div className="page site">
      <section className="card ent-head">
        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <RolloutChip s={dc.status} />
            <Chip tone="warning">{dc.category}</Chip>
            <Chip tone="neutral">{dc.tier}</Chip>
            {s.notDiscovered > 0 && <Chip tone="warning">{s.notDiscovered} not discovered</Chip>}
            {s.drifted > 0 && <Chip tone="warning">{s.drifted} drifted</Chip>}
            {s.openIncidents > 0 && <Link to={`/incidents?dc=${dc.id}`}><Chip tone="error" dot>{s.openIncidents} open incident{s.openIncidents === 1 ? '' : 's'}</Chip></Link>}
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <Btn icon={I.Network} onClick={() => nav(`/topology?dc=${dc.id}`)} disabled={!s.discovered}>Topology</Btn>
            <Btn icon={I.Radar} onClick={doDiscovery} disabled={disc.busy || dc.status === 'planned'} title={dc.status === 'planned' ? 'No collector assigned yet' : undefined}>{disc.busy ? 'Discovering…' : 'Run discovery'}</Btn>
            <Btn variant="filled" icon={I.Sparkles} onClick={() => ask(`What is at risk in ${dc.id}?`)}>Ask Sentinel</Btn>
          </div>
        </div>
        {disc.msg && <div className="note note--good"><I.CircleCheck size={15} />{disc.msg}</div>}
        <dl className="ent-attrs" style={{ '--cols': 5 } as React.CSSProperties}>
          <div><dt>Name</dt><dd>{dc.name}</dd></div>
          <div><dt>Site type</dt><dd>{dc.siteType}</dd></div>
          <div><dt>Location ID</dt><dd>{dc.locationId}</dd></div>
          <div><dt>Address</dt><dd>{dc.address}</dd></div>
          <div><dt>Coordinates</dt><dd>{dc.lat.toFixed(3)}°N {dc.lng.toFixed(3)}°E</dd></div>
          <div><dt>Zone</dt><dd>{dc.zone}</dd></div>
          <div><dt>State</dt><dd>{dc.state}</dd></div>
          <div><dt>City</dt><dd>{dc.city}</dd></div>
          <div><dt>Tier</dt><dd>{dc.tier}</dd></div>
          <div><dt>Collectors</dt><dd className="col" style={{ gap: 2 }}>
            {dc.status === 'planned' ? <span className="faint">Not assigned</span> : dc.collectors.map(c => (
              <span key={c.id} className="row" style={{ gap: 6, fontSize: 12.5 }}>
                <i className="site-dot" style={{ background: c.state === 'up' ? 'var(--vw-color-emerald-500)' : 'var(--vw-color-amber-500)' }} />
                {c.name.replace('Collector ', '')}<span className={c.state === 'up' ? 'faint' : 'warn'}>{fmtAgo(c.lastSeen, now)}</span>
              </span>
            ))}
          </dd></div>
        </dl>
        {staleCol.length > 0 && <div className="note note--warn"><I.TriangleAlert size={15} />{staleCol.map(c => c.name).join(', ')} stale — discovery data for part of this site is older than the 15-minute freshness SLA.</div>}
      </section>

      <div className="strip" style={{ '--n': 7 } as React.CSSProperties}>
        {strip.map(x => (
          <button key={x.l} type="button" className="strip-item is-click" style={{ '--c': x.c } as React.CSSProperties} onClick={() => go(x.to)}>
            <div className="l">{x.l}</div><div className="v">{x.v}</div><div className="s" title={x.s}>{x.s}</div>
          </button>
        ))}
      </div>

      <div className="row between wrap" style={{ gap: 12 }}>
        <div className="pills" role="tablist">
          {TABS.map(t => {
            const n = t.id === 'attention' ? dc.risks.length : t.id === 'elements' ? s.ne : undefined;
            return <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`pill${tab === t.id ? ' is-active' : ''}`} onClick={() => go(t.id)}>{t.label}{n ? <span className="count">{n}</span> : null}</button>;
          })}
        </div>
        {dc.status === 'planned' ? <span className="fresh">No collector assigned · record data only</span> : <Fresh>Inventory as of {fmtAgo(Math.max(...dc.collectors.map(c => c.lastSeen)), now)}</Fresh>}
      </div>

      {tab === 'attention' && <Attention data={data} />}
      {tab === 'elements' && <Elements dcId={dc.id} />}
      {(tab === 'capex' || tab === 'opex') && <Finance data={data} view={tab} />}
      {tab === 'details' && <Details data={data} />}
      {tab === 'equipment' && <Equipment data={data} />}
      {tab === 'timeline' && <Timeline data={data} />}
    </div>
  );
}
