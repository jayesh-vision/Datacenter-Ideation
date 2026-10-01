import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getEstate, getLocations, useQuery } from '../api';
import type { Location } from '../api/types';
import { usePage, PageHead, Loading } from '../shell/page';
import { DataTable, type Col } from '../ui/DataTable';
import { Chip, Drawer, KV, SearchBox, Btn } from '../ui/kit';
import { Meter, RolloutChip, StackBar, Legend } from '../ui/status';
import { ROLLOUT, ROLLOUT_ORDER } from '../lib/vocab';
import { fmtNum } from '../lib/format';
import '../styles/overview.css';

const KIND: Record<string, string> = { datacenter: 'Datacenter', pop: 'PoP', site: 'Site' };
const BLOCK: Record<string, string> = { power: 'Power issue', fiber: 'Fiber issue', commissioning: 'Commissioning hold', supply: 'Supply delay', lease: 'Lease issue', civil: 'Civil work issue', regulatory: 'Regulatory hold' };

/* DC-INV-001/003 — every estate location with search + filters in the URL. */
export function Locations() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const f = { kind: sp.get('kind') ?? '', status: sp.get('status') ?? '', region: sp.get('region') ?? '', circle: sp.get('circle') ?? '', blocker: sp.get('blocker') ?? '', q: sp.get('q') ?? '', view: sp.get('view') ?? '' };
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const [open, setOpen] = useState<Location | null>(null);
  usePage([{ label: 'Location', to: '/inventory' }, { label: 'Locations' }]);
  const { data: all } = useQuery(() => getLocations({}), []);
  const { data: est } = useQuery(getEstate, []);

  const rows = useMemo(() => (all ?? []).filter(l => (!f.kind || l.kind === f.kind) && (!f.status || l.status === f.status) && (!f.region || l.regionId === f.region) && (!f.circle || l.circleId === f.circle) && (!f.blocker || l.blocker === f.blocker)
    && (f.view !== 'blocked' || l.status === 'failed' || !!l.blocker) && (!f.q || `${l.name} ${l.city} ${l.state}`.toLowerCase().includes(f.q.toLowerCase()))), [all, f.kind, f.status, f.region, f.circle, f.blocker, f.q, f.view]);

  if (!all || !est) return <Loading />;
  const st = ROLLOUT_ORDER.map(s => ({ s, n: rows.filter(r => r.status === s).length }));
  const filtered = Object.entries(f).some(([, v]) => v);
  const cols: Col<Location>[] = [
    { key: 'st', header: 'Status', render: l => <RolloutChip s={l.status} size="xs" />, sort: l => ROLLOUT_ORDER.indexOf(l.status) },
    { key: 'name', header: 'Name', render: l => <span className="mono strong">{l.name}</span>, sort: l => l.name },
    { key: 'kind', header: 'Type', render: l => <Chip tone={l.kind === 'datacenter' ? 'purple' : l.kind === 'pop' ? 'info' : 'cyan'} size="xs">{KIND[l.kind]}</Chip>, sort: l => l.kind },
    { key: 'circle', header: 'Circle', render: l => est.circles.find(c => c.id === l.circleId)?.name ?? l.circleId, sort: l => l.circleId },
    { key: 'city', header: 'City', render: l => <span className="cell-2">{l.city}<small>{l.state}</small></span>, sort: l => l.city },
    { key: 'ne', header: 'NE', align: 'right', render: l => <span className="num">{l.neCount}</span>, sort: l => l.neCount },
    { key: 'disc', header: 'Discovered', align: 'right', render: l => <span className="num">{l.discovered}</span>, sort: l => l.discovered },
    { key: 'cov', header: 'Coverage', render: l => { const p = l.neCount ? (l.discovered / l.neCount) * 100 : 0; return <Meter pct={p} width={56} color={p === 100 ? 'var(--vw-color-emerald-500)' : 'var(--vw-color-amber-400)'} />; }, sort: l => (l.neCount ? l.discovered / l.neCount : 0) },
    { key: 'blk', header: 'Blocker', render: l => l.blocker ? <span className="cell-2"><b className="strong" style={{ fontWeight: 500 }}>{BLOCK[l.blocker]}</b><small>{l.blockerNote}</small></span> : <span className="faint">—</span>, sort: l => l.blocker ?? '' }
  ];

  return (
    <div className="page">
      <PageHead title={f.view === 'blocked' ? 'Blocked & failed locations' : 'Locations'} sub="Every datacenter, PoP and site in the estate. Filter by type, status, region, circle or rollout blocker; datacenters open their full site profile."
        chips={f.view === 'blocked' ? <Chip tone="error" size="sm">Rollout blockers</Chip> : undefined} />
      <section className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row between"><b className="strong">{fmtNum(rows.length)} locations in view</b><Legend items={st.map(x => ({ label: <><b className="num" style={{ fontWeight: 500 }}>{fmtNum(x.n)}</b> {ROLLOUT[x.s].label.toLowerCase()}</>, color: ROLLOUT[x.s].color }))} /></div>
        <StackBar height={10} parts={st.map(x => ({ value: x.n, color: ROLLOUT[x.s].color, label: ROLLOUT[x.s].label }))} />
      </section>
      <section className="card">
        <DataTable rows={rows} cols={cols} pageSize={25} defaultSort={{ key: 'st', dir: 'desc' }} onRow={l => (l.kind === 'datacenter' ? nav(`/datacenters/${l.id}`) : setOpen(l))}
          toolbar={
            <div className="toolbar" style={{ width: '100%' }}>
              <SearchBox value={f.q} onChange={v => set('q', v)} placeholder="Name, city, state" width={240} />
              <select className="select" value={f.kind} onChange={e => set('kind', e.target.value)} aria-label="Type"><option value="">All types</option><option value="datacenter">Datacenters</option><option value="pop">PoPs</option><option value="site">Sites</option></select>
              <select className="select" value={f.status} onChange={e => set('status', e.target.value)} aria-label="Status"><option value="">All statuses</option>{ROLLOUT_ORDER.map(s => <option key={s} value={s}>{ROLLOUT[s].label}</option>)}</select>
              <select className="select" value={f.region} onChange={e => set('region', e.target.value)} aria-label="Region"><option value="">All regions</option>{est.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              <select className="select" value={f.circle} onChange={e => set('circle', e.target.value)} aria-label="Circle"><option value="">All circles</option>{est.circles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <select className="select" value={f.blocker} onChange={e => set('blocker', e.target.value)} aria-label="Blocker"><option value="">Any blocker</option>{Object.entries(BLOCK).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {filtered && <button type="button" className="panel-link" onClick={() => setSp(new URLSearchParams(), { replace: true })}><I.X size={13} />Clear</button>}
            </div>
          } />
      </section>
      <Drawer open={!!open} onClose={() => setOpen(null)} width={500} title={<span className="mono">{open?.name}</span>} sub={open ? `${KIND[open.kind]} · ${open.city}, ${open.state}` : ''}
        foot={open && <><Btn onClick={() => setOpen(null)}>Close</Btn><Btn variant="filled" icon={I.Filter} onClick={() => { const c = open.circleId; setOpen(null); nav(`/inventory/locations?circle=${c}&kind=${open.kind}`); }}>Same circle &amp; type</Btn></>}>
        {open && (
          <div className="col" style={{ gap: 16 }}>
            <div className="row" style={{ gap: 8 }}><RolloutChip s={open.status} />{open.blocker && <Chip tone="error" size="sm">{BLOCK[open.blocker]}</Chip>}</div>
            {open.blocker && <div className="note note--bad"><I.TriangleAlert size={14} />{open.blockerNote} — rollout cannot move to on-air until cleared.</div>}
            <KV cols={2} items={[['Location ID', <span className="mono">{open.id}</span>], ['Category', open.category], ['Circle', est.circles.find(c => c.id === open.circleId)?.name], ['Region', est.regions.find(r => r.id === open.regionId)?.name],
              ['Coordinates', <span className="num">{open.lat.toFixed(3)}°N {open.lng.toFixed(3)}°E</span>], ['Discovery', `${open.discovered} of ${open.neCount} NE (${open.neCount ? Math.round((open.discovered / open.neCount) * 100) : 0}%)`]]} />
            <div className="dsec">Active inventory</div>
            <div className="inv-chips">{Object.entries(open.roles).map(([k, v]) => <span key={k} className="inv-chip">{k}<b>{v}</b></span>)}</div>
            <div className="dsec">Passive inventory</div>
            <div className="inv-chips">{Object.entries(open.passive).filter(([, v]) => v > 0).map(([k, v]) => <span key={k} className="inv-chip">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}<b>{v}</b></span>)}{Object.values(open.passive).every(v => !v) && <span className="faint">None recorded</span>}</div>
            <div className="note note--info"><I.Info size={14} />PoP and site records are summary-only in this prototype; datacenters carry the full rack, equipment and service model.</div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
