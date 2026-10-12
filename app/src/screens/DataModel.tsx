import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { usePersona } from '../api';
import { usePage, PageHead, useSentinel } from '../shell/page';
import { Tabs } from '../ui/kit';
import { Facts, MiniBars, Split, StatGrid, StatTile, type Tone } from '../ui/Analytics';
import { ListToolbar } from '../ui/ListToolbar';
import { OpstralBtn } from '../ui/OpstralMark';
import { fmtNum } from '../lib/format';

/* Data model explorer (user, 12-Oct-2026). The diagram + details panel is public/data-model.html (source
   docs/dco-data-model.html) in an iframe; this screen draws the app chrome around it like every other screen:
   page head · analytics strip · tabs · ListToolbar. The page exposes window.DM (same origin) and posts
   { dm: 'state' } when the user changes view or entity inside it. */

type View = 'ontology' | 'map' | 'tree';
type Src = 'I' | 'L' | 'D';
interface Ent { n: string; d: string; t: string; sheet: string; f: [string, string, Src][] }
interface Model { E: Record<string, Ent>; R: [string, string, string, string, 'c' | 'r' | 'is'][]; DOMAINS: Record<string, { name: string }>; COUNTS: Record<string, Record<string, number>> }
interface DmApi {
  model: Model; setView: (v: View) => void; focus: (id: string) => void; setHops: (n: number) => void; setPersona: (p: string) => void;
  setHidden: (d: string[]) => void; setQuery: (q: string) => number; reset: () => void; setFull: (on: boolean) => void;
}
/* the import template's data sheets (scripts/inventory/build_template.py) */
const TEMPLATE_SHEETS = 35;
/* containment from region to cable: the deepest path in the Hierarchy view */
const DEPTH = ['region', 'state', 'site', 'floor', 'room', 'rack', 'device', 'iface', 'link', 'cable'];

export function DataModel() {
  usePage([{ label: 'Data model' }]);
  const ask = useSentinel();
  const { persona, def } = usePersona();
  const [sp, setSp] = useSearchParams();
  const tab = (['ontology', 'map', 'tree'].includes(sp.get('tab') ?? '') ? sp.get('tab') : 'ontology') as View;
  const setTab = (v: View) => { const n = new URLSearchParams(sp); if (v === 'ontology') n.delete('tab'); else n.set('tab', v); setSp(n, { replace: true }); };
  const frame = useRef<HTMLIFrameElement>(null);
  const [dm, setDm] = useState<DmApi | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<number | null>(null);
  const [domain, setDomain] = useState('');
  const [hops, setHops] = useState('1');
  /* full screen = the card fills the content area under the top bar (Esc closes), like the estate map */
  const [full, setFull] = useState(false);
  const resetView = () => { setQ(''); setDomain(''); setHops('1'); dm?.reset(); };
  useEffect(() => { dm?.setFull(full); }, [dm, full]);
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', k); document.body.classList.add('dm-noscroll');
    return () => { window.removeEventListener('keydown', k); document.body.classList.remove('dm-noscroll'); };
  }, [full]);

  /* the page says when it is ready and when the user moves inside it (e.g. double-click on the map opens Ontology) */
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || !e.data?.dm) return;
      if (e.data.dm === 'ready') setDm((frame.current?.contentWindow as unknown as { DM?: DmApi })?.DM ?? null);
      if (e.data.dm === 'reset') resetView();
      if (e.data.dm === 'fullscreen') setFull(f => (typeof e.data.on === 'boolean' ? e.data.on : !f));
      if (e.data.dm === 'state' && dm && e.data.view && e.data.view !== tab) setTab(e.data.view);
    };
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);
  });
  useEffect(() => { dm?.setPersona(persona); }, [dm, persona]);
  useEffect(() => { dm?.setView(tab); }, [dm, tab]);
  useEffect(() => { if (!dm) return; const t = setTimeout(() => setHits(q.trim() ? dm.setQuery(q) : (dm.setQuery(''), null)), 250); return () => clearTimeout(t); }, [dm, q]);
  useEffect(() => { if (dm) dm.setHidden(domain ? Object.keys(dm.model.DOMAINS).filter(d => d !== domain) : []); }, [dm, domain]);
  useEffect(() => { dm?.setHops(Number(hops)); }, [dm, hops]);

  const m = dm?.model;
  const stats = useMemo(() => {
    if (!m) return null;
    const ids = Object.keys(m.E), counts = m.COUNTS[persona] ?? {};
    const byDomain = Object.entries(m.DOMAINS).map(([k, d]) => ({ key: k, label: d.name, n: ids.filter(id => m.E[id].d === k).length })).sort((a, b) => b.n - a.n);
    const kinds = { c: m.R.filter(r => r[4] === 'c').length, r: m.R.filter(r => r[4] === 'r').length, is: m.R.filter(r => r[4] === 'is').length };
    const fields = ids.flatMap(id => m.E[id].f);
    const src = { I: fields.filter(f => f[2] === 'I').length, L: fields.filter(f => f[2] === 'L').length, D: fields.filter(f => f[2] === 'D').length };
    const degree = ids.map(id => ({ id, n: m.R.filter(r => r[0] === id || r[1] === id).length })).sort((a, b) => b.n - a.n);
    const records = ids.reduce((a, id) => a + (counts[id] ?? 0), 0);
    const biggest = ids.map(id => ({ id, n: counts[id] ?? 0 })).sort((a, b) => b.n - a.n);
    const unused = ids.filter(id => !(counts[id] ?? 0) && !m.E[id].sheet.startsWith('—')).length;
    const imported = ids.filter(id => !m.E[id].sheet.startsWith('—'));
    const liveOnly = ids.filter(id => m.E[id].f.every(f => f[2] !== 'I'));
    const mixed = imported.filter(id => m.E[id].f.some(f => f[2] === 'L'));
    return { ids, counts, byDomain, kinds, fields, src, degree, records, biggest, unused, imported, liveOnly, mixed };
  }, [m, persona]);

  const shown = hits ?? (stats ? (domain ? stats.byDomain.find(d => d.key === domain)?.n ?? 0 : stats.ids.length) : 0);
  const RAMP: Tone[] = ['info', 'neutral', 'neutral'];

  return (
    <div className="page">
      <PageHead title="Data model"
        sub="How every record links, what it carries and where its data comes from"
        actions={<>
          <a className="nst-btn nst-btn--sm" href="/downloads/dco-inventory-import-template.xlsx" download><I.FileSpreadsheet size={15} />Import template</a>
          <OpstralBtn onClick={() => ask('How does the data model fit together, from datacenter to customer impact?')} />
        </>} />

      {stats && m && (
        <StatGrid>
          <StatTile label="Entities" value={stats.ids.length} sub={`in ${stats.byDomain.length} domains`} onClick={() => setTab('map')} active={tab === 'map'}
            info="Kinds of record the platform keeps (datacenter, rack, device, service, alarm…), grouped by domain. The bar splits them by domain, largest first. Click opens the Full map.">
            <Split parts={stats.byDomain.map((d, i) => ({ key: d.key, label: d.label, n: d.n, tone: RAMP[Math.min(i, 2)] }))} onPick={k => setDomain(domain === k ? '' : k)} active={domain} />
          </StatTile>
          <StatTile label="Relationships" value={m.R.length} sub="links between entities" onClick={() => setTab('ontology')} active={tab === 'ontology'}
            info="How entities point to each other: contains (a room holds racks), refers to (a service is delivered on a device) and is a kind of (a GPU node is a device). Click opens the Ontology.">
            <Split parts={[{ key: 'c', label: 'Contains', n: stats.kinds.c, tone: 'info' }, { key: 'r', label: 'Refers to', n: stats.kinds.r, tone: 'neutral' }, { key: 'is', label: 'Is a kind of', n: stats.kinds.is, tone: 'neutral' }]} />
          </StatTile>
          <StatTile label="Fields" value={stats.fields.length} sub="across all entities"
            info="Field groups on every entity, by where the value comes from: Import (the inventory template), Live (collectors, BMS, scheduler, ITSM) or Derived (worked out by the platform).">
            <Split parts={[{ key: 'I', label: 'Import', n: stats.src.I, tone: 'info' }, { key: 'L', label: 'Live', n: stats.src.L, tone: 'neutral' }, { key: 'D', label: 'Derived', n: stats.src.D, tone: 'neutral' }]} />
          </StatTile>
          <StatTile label="Records" value={fmtNum(stats.records)} sub={`in ${def.short ?? def.label}`}
            info="How many records of each kind exist in the mock estate for the persona chosen in the top bar (24 datacenters). The bar splits them by entity, largest first; click one to open it in the Ontology.">
            <Split parts={stats.biggest.filter(b => b.n).map((b, i) => ({ key: b.id, label: m.E[b.id].n.replace(/ \(.*\)$/, ''), n: b.n, tone: RAMP[Math.min(i, 2)], display: fmtNum(b.n) }))}
              other={n => fmtNum(n)} onPick={k => { setTab('ontology'); dm?.focus(k); }} />
          </StatTile>
          <StatTile label="Data sources" value={stats.imported.length} sub="entities imported" onClick={() => setTab('tree')} active={tab === 'tree'}
            info={`Entities filled from the inventory import template (${TEMPLATE_SHEETS} sheets), split into imported only and imported plus live readings, against those that come only from monitoring, the scheduler or the platform (alarms, GPUs, jobs, RCA). Click opens the Hierarchy.`}>
            <Split parts={[{ key: 'imp', label: 'Import only', n: stats.imported.length - stats.mixed.length, tone: 'info' }, { key: 'mix', label: 'Import + live', n: stats.mixed.length, tone: 'neutral' }, { key: 'live', label: 'Live or derived', n: stats.liveOnly.length, tone: 'neutral' }]} />
            <Facts items={[{ n: TEMPLATE_SHEETS, label: 'template sheets' }, ...(stats.unused ? [{ n: stats.unused, label: `unused in ${def.short ?? def.label}` }] : [])]} />
          </StatTile>
          <StatTile label="Containment depth" value={DEPTH.length} sub="levels, region to cable" onClick={() => setTab('tree')}
            info="The longest containment chain: region › state › datacenter › floor › room › rack › device › interface › link › cable. Bars are the record count at each level (log scale). Click opens the Hierarchy.">
            <MiniBars values={DEPTH.map(id => Math.round(Math.log10((stats.counts[id] ?? 0) + 1) * 10))} labels={DEPTH.map(id => m.E[id].n)} />
          </StatTile>
        </StatGrid>
      )}

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'ontology', label: 'Ontology', icon: I.Waypoints }, { id: 'map', label: 'Full map', icon: I.LayoutGrid }, { id: 'tree', label: 'Hierarchy', icon: I.ListTree }
      ]} />

      <section className={`vw-card-section dm-card${full ? ' is-full' : ''}`}>
        <div className="dt-toolbar">
          <ListToolbar shown={shown} total={stats?.ids.length ?? 0} noun="entities"
            search={{ value: q, onChange: setQ, placeholder: 'Entity, field or sheet' }}
            onRefresh={() => dm?.setView(tab)}
            tools={<>
              <button type="button" className="nst-icon-btn lt-icon" title="Reset view" aria-label="Reset view" onClick={resetView}><I.RotateCcw size={16} /></button>
              <button type="button" className={`nst-icon-btn lt-icon${full ? ' is-on' : ''}`} title={full ? 'Exit full screen (Esc)' : 'Full screen'} aria-label={full ? 'Exit full screen' : 'Full screen'} aria-pressed={full} onClick={() => setFull(f => !f)}>
                {full ? <I.Minimize2 size={16} /> : <I.Maximize2 size={16} />}
              </button>
            </>}
            filters={[
              { id: 'domain', label: 'Domain', value: domain, onChange: setDomain, anyLabel: 'All domains', quick: true, options: (stats?.byDomain ?? []).map(d => ({ id: d.key, label: d.label, count: d.n })) },
              ...(tab === 'ontology' ? [{ id: 'hops', label: 'Show', value: hops, onChange: setHops, defaultValue: '1', quick: true, options: [{ id: '1', label: 'Direct links' }, { id: '2', label: '2 steps out' }] }] : [])
            ]}>
            <span className="dm-keys" aria-label="Line styles">
              <span><svg width="26" height="8" aria-hidden="true"><path d="M1 4H25" /></svg>contains</span>
              <span><svg width="26" height="8" aria-hidden="true"><path d="M1 4H25" strokeDasharray="5 4" /></svg>refers to</span>
              <span><svg width="26" height="8" aria-hidden="true"><path d="M1 4H25" strokeDasharray="2 3" /></svg>kind of</span>
            </span>
          </ListToolbar>
        </div>
        <div className="dm-frame">
          <iframe ref={frame} src="/data-model.html?embed=1" title="Data model: entities and how they connect" />
        </div>
      </section>
    </div>
  );
}
