/* Planner → Benchmarks & rules: the reference values every estimate reads, organised by the question they answer ("What does it cost
   to build, per kW?", "What PUE can we expect?", "How long does equipment take to arrive?"), each with its source and date, and the
   rules the plan templates check, grouped into Must pass and Should pass. Charts from charts/library.tsx: RangeBar for ranges,
   PueMatrix for cooling × climate, LeadBars for equipment lead times. Each tab adds its own kind of value (planner/lib/benchCatalog.ts:
   the measure fixes the unit and the applies-to fields the engine matches; one active value per case). Values are edited in a drawer;
   every edit bumps the version and is audited, so an approved plan can say which value it used; values are retired, never deleted.
   Engine keys never reach the screen (METRIC_INFO names them). */
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { DataTable, type Col } from '../../ui/DataTable';
import { Btn, Chip, Drawer, Empty, Field, Panel, Seg } from '../../ui/kit';
import { useBenchmarkAudit, useBenchmarkLibrary, useEstate, usePlannerActions, useTemplates } from '../../planner/lib/usePlanner';
import { OPEN_FAMILIES, VIEW_ADD, VIEW_CATEGORIES, dimsOf, duplicateOf, measuresFor, viewOf, type BenchDim, type BenchView } from '../../planner/lib/benchCatalog';
import { CLIMATE_LABEL, COOLING_LABEL, METRIC_INFO, RULE_PLAIN, metricDetail, metricKey } from '../../planner/lib/labels';
import { DC_TYPE_CATALOG } from '../../planner/p2b/dcTypes';
import { DC_TIERS } from '../../planner/p2b/enums';
import type * as T from '../../planner/p2b/types';
import { clockMs } from '../../planner/compat/clock';
import { ASPECT_LABEL, NumInput, ReasonModal, SCOPE_LABEL, SelectInput, TextInput, date, money, num, type ReasonRequest } from './common';
import { LeadBars, PueMatrix, RangeBar, Tip } from './charts/library';

type View = 'cost' | 'efficiency' | 'lead' | 'sizing' | 'rules';
type BRow = T.PlannerBenchmark & { name: string; applies: string };
type EditState = { b: T.PlannerBenchmark | null; view: BenchView; preset?: Partial<T.PlannerBenchmark> };
const DIM_LABEL: Record<BenchDim, string> = { dcTypeKey: 'Site type', tier: 'Tier', coolingType: 'Cooling', climate: 'Climate', regionId: 'Region' };
const RetiredTag = ({ b }: { b: T.PlannerBenchmark }) => (b.retiredAt ? <Chip size="xs" tone="neutral">Retired</Chip> : null);
const CATEGORY_LABEL: Record<T.PlannerBenchmark['category'], string> = { cost: 'Cost', performance: 'Efficiency', sustainability: 'Sustainability', leadtime: 'Lead time', sizing: 'Sizing', staffing: 'Staffing' };
const dcTypeName = (k?: string) => (k ? DC_TYPE_CATALOG.find(p => p.key === k)?.name ?? k : '');

/** the plain name of a reference value: a full-key name, the equipment / build kind, the metric's name, or its own label */
export function benchName(b: Pick<T.PlannerBenchmark, 'metric' | 'label'>): string {
  const full = METRIC_INFO[b.metric]; if (full) return full.name;
  const key = metricKey(b.metric), detail = metricDetail(b.metric);
  if (key === 'leadWeeks') return detail || b.label.replace(/^Lead time · /, '');
  if (key === 'durationWeeks') return SCOPE_LABEL[detail as T.PlannerScope] ?? b.label;
  if (METRIC_INFO[key] && !detail) return METRIC_INFO[key].name;
  return b.label.replace(/^Lead time · /, '');
}
const benchUse = (b: T.PlannerBenchmark) => METRIC_INFO[b.metric]?.use ?? METRIC_INFO[metricKey(b.metric)]?.use;
/** a value with its unit; money in the geography's currency */
function withUnit(n: number | undefined, unit: string): string {
  if (n === undefined) return '—';
  if (/^USD\/?/i.test(unit)) { const rest = unit.replace(/^USD\/?/i, ''); return `${money(n)}${rest ? ` / ${rest}` : ''}`; }
  if (unit === '%') return `${num(n, 2)}%`;
  if (unit === 'ratio' || unit === 'x') return num(n, 2);
  return `${num(n, 2)} ${unit}`;
}
const isMoney = (unit: string) => /^USD/i.test(unit);
const rangeText = (b: T.PlannerBenchmark) => (b.low === undefined && b.high === undefined ? '' : `${b.low === undefined ? '…' : isMoney(b.unit) ? money(b.low) : num(b.low, 2)} – ${b.high === undefined ? '…' : isMoney(b.unit) ? money(b.high) : num(b.high, 2)}`);

export function BenchmarksTab() {
  const [sp] = useSearchParams();
  const apply = useParamPatch();
  const library = useBenchmarkLibrary();
  const state = sp.get('state') ?? '';
  /* active values by default; Filters → Status → Retired shows the retired ones instead */
  const benchmarks = useMemo(() => library.filter(b => (state === 'retired') === !!b.retiredAt), [library, state]);
  const templates = useTemplates();
  const estate = useEstate();
  const view = (sp.get('view') as View) || 'cost';
  const q = sp.get('q') ?? '', metric = sp.get('metric') ?? '';
  /* one toolbar for the whole view (user, 21-Oct-2026: "the same filters, search and quick filters as Plans and Templates") */
  const site = sp.get('site') ?? '', cooling = sp.get('cooling') ?? '', tier = sp.get('tier') ?? '', reg = sp.get('region') ?? '', conf = sp.get('conf') ?? '';
  const area = sp.get('area') ?? '', sev = sp.get('sev') ?? '';
  const CLEAR = { q: '', metric: '', site: '', cooling: '', tier: '', region: '', conf: '', area: '', sev: '', state: '' };
  const [edit, setEdit] = useState<EditState | null>(null);
  const addNew = () => setEdit({ b: null, view: view === 'rules' ? 'cost' : view });
  const region = (id?: string) => (id ? estate.regions.find(r => r.id === id)?.name ?? id : '');
  const appliesLabel = (b: T.PlannerBenchmark) => [dcTypeName(b.appliesTo.dcTypeKey), b.appliesTo.coolingType && COOLING_LABEL[b.appliesTo.coolingType], b.appliesTo.climate && CLIMATE_LABEL[b.appliesTo.climate], b.appliesTo.tier, region(b.appliesTo.regionId)].filter(Boolean).join(' · ');
  const all = useMemo<BRow[]>(() => benchmarks.map(b => ({ ...b, name: benchName(b), applies: appliesLabel(b) })), [benchmarks, estate]); // eslint-disable-line react-hooks/exhaustive-deps
  const openB = (b?: T.PlannerBenchmark) => b && setEdit({ b, view: viewOf(b) });
  const open = (b: BRow) => openB(library.find(x => x.id === b.id));

  /* the questions each view answers */
  const g = useMemo(() => {
    const cat = (...c: T.PlannerBenchmark['category'][]) => all.filter(b => c.includes(b.category));
    const cost = cat('cost'), eff = cat('performance', 'sustainability'), lead = cat('leadtime');
    const capex = cost.filter(b => b.metric === 'capexPerKw').sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
    const pue = eff.filter(b => metricKey(b.metric) === 'pue' && b.appliesTo.coolingType && b.appliesTo.climate);
    return {
      capex, otherCost: cost.filter(b => !capex.includes(b)),
      pue, otherEff: eff.filter(b => !pue.includes(b)),
      leadWeeks: lead.filter(b => metricKey(b.metric) === 'leadWeeks'), build: lead.filter(b => metricKey(b.metric) === 'durationWeeks'), logistics: lead.filter(b => !['leadWeeks', 'durationWeeks'].includes(metricKey(b.metric))),
      sizing: cat('sizing', 'staffing'),
    };
  }, [all]);
  const ruleRows = useMemo(() => {
    const seen = new Map<string, { id: string; rule: T.PlannerRuleDef; from: string[] }>();
    for (const t of templates) for (const r of t.rules) { const x = seen.get(r.id) ?? { id: r.id, rule: r, from: [] }; x.from.push(t.name); seen.set(r.id, x); }
    return [...seen.values()];
  }, [templates]);
  const counts: Record<View, number> = { cost: g.capex.length + g.otherCost.length, efficiency: g.pue.length + g.otherEff.length, lead: g.leadWeeks.length + g.build.length + g.logistics.length, sizing: g.sizing.length, rules: ruleRows.length };

  /* every table and chart of the view reads the same filtered rows */
  const matchQ = (b: BRow) => !q || `${b.name} ${b.label} ${b.applies} ${b.source}`.toLowerCase().includes(q.toLowerCase());
  const listed = (rows: BRow[]) => rows.filter(b => (!metric || metricKey(b.metric) === metric) && (!site || b.appliesTo.dcTypeKey === site) && (!cooling || b.appliesTo.coolingType === cooling)
    && (!tier || b.appliesTo.tier === tier) && (!reg || b.appliesTo.regionId === reg) && (!conf || (conf === 'confirmed') === !b.indicative) && matchQ(b));
  const viewRows: BRow[] = view === 'cost' ? [...g.capex, ...g.otherCost] : view === 'efficiency' ? [...g.pue, ...g.otherEff] : view === 'lead' ? [...g.leadWeeks, ...g.build, ...g.logistics] : g.sizing;
  const shownRows = listed(viewRows);
  const filtered = !!(q || metric || site || cooling || tier || reg || conf || state);
  const opt = <K extends string>(keys: K[], of: (b: BRow) => K | undefined, label: (k: K) => string, cur: string) =>
    keys.filter(k => k === cur || viewRows.some(b => of(b) === k)).map(k => ({ id: k, label: label(k), count: viewRows.filter(b => of(b) === k).length }));
  const metrics = [...new Set(viewRows.map(b => metricKey(b.metric)))];
  const metricLabel = (m: string) => METRIC_INFO[m]?.name ?? benchName(viewRows.find(b => metricKey(b.metric) === m)!);
  const toolbar = view === 'rules' ? null : <ListToolbar shown={shownRows.length} total={viewRows.length} noun="values" onApply={apply} search={{ value: q, onChange: v => apply({ q: v }), placeholder: 'Value, site type, source' }}
    filters={[
      { id: 'metric', label: 'Reference value', quick: true, value: metric, anyLabel: 'Any value', onChange: v => apply({ metric: v }), options: metrics.map(m => ({ id: m, label: metricLabel(m), count: viewRows.filter(b => metricKey(b.metric) === m).length })) },
      { id: 'site', label: 'Site type', quick: true, value: site, anyLabel: 'Any site type', onChange: v => apply({ site: v }), options: opt(DC_TYPE_CATALOG.map(d => d.key), b => b.appliesTo.dcTypeKey, k => dcTypeName(k), site) },
      { id: 'cooling', label: 'Cooling', value: cooling, anyLabel: 'Any cooling', onChange: v => apply({ cooling: v }), options: opt(Object.keys(COOLING_LABEL) as T.PlannerCoolingType[], b => b.appliesTo.coolingType, k => COOLING_LABEL[k], cooling) },
      { id: 'tier', label: 'Tier', value: tier, anyLabel: 'Any tier', onChange: v => apply({ tier: v }), options: opt([...DC_TIERS], b => b.appliesTo.tier, k => k, tier) },
      { id: 'region', label: 'Region', value: reg, anyLabel: 'Any region', onChange: v => apply({ region: v }), options: opt(estate.regions.map(r => r.id), b => b.appliesTo.regionId, k => region(k), reg) },
      { id: 'state', label: 'Status', value: state, anyLabel: 'Active', onChange: v => apply({ state: v }), options: [{ id: 'retired', label: 'Retired', count: library.filter(b => b.retiredAt && VIEW_CATEGORIES[view as BenchView].includes(b.category)).length }] },
      { id: 'conf', label: 'Confidence', value: conf, anyLabel: 'Confirmed and indicative', onChange: v => apply({ conf: v }), options: [{ id: 'confirmed', label: 'Confirmed', count: viewRows.filter(b => !b.indicative).length }, { id: 'indicative', label: 'Indicative', count: viewRows.filter(b => b.indicative).length }] },
    ]} />;
  const addLabel = view === 'rules' ? '' : VIEW_ADD[view].button;
  const emptyVals = <Empty icon={I.Inbox} title={state === 'retired' ? 'No retired values' : 'No values match'} action={filtered ? <Btn onClick={() => apply(CLEAR)}>Clear filters</Btn> : <Btn icon={I.Plus} onClick={addNew}>{view === 'rules' ? '' : VIEW_ADD[view].empty}</Btn>}>{state === 'retired' ? 'Values retired from this tab show here; open one to restore it.' : 'Clear the search or add a value for the planner to use.'}</Empty>;

  return (
    <div className="pn-lib">
      <div className="pn-lib-bar">
        <Seg<View> size="sm" value={view} onChange={v => apply({ ...CLEAR, view: v === 'cost' ? '' : v })} options={[{ id: 'cost', label: `Costs · ${counts.cost}` }, { id: 'efficiency', label: `Efficiency · ${counts.efficiency}` }, { id: 'lead', label: `Lead times · ${counts.lead}` }, { id: 'sizing', label: `Sizing & staffing · ${counts.sizing}` }, { id: 'rules', label: `Rules · ${counts.rules}` }]} />
        {view !== 'rules' && <Btn variant="filled" icon={I.Plus} onClick={addNew}>{addLabel}</Btn>}
      </div>
      {toolbar && <section className="vw-card-section pn-lib-tb">{toolbar}</section>}

      {view === 'cost' && <>
        <Panel flush icon={I.DollarSign} count={listed(g.capex).length} title="What does it cost to build, per kW?" sub="Plant and fit-out cost for each kW of IT, by site type, cheapest first. The planner uses the typical value unless our own delivered builds say otherwise." info="Build cost per kW of IT load, excluding land and IT equipment. The bar shows low to high on one scale for every site type; the dark tick is the typical value. Click a row to change it.">
          <ValueTable rows={listed(g.capex)} onRow={open} empty={emptyVals} shared first={{ title: 'Site type', render: b => <span className="cell-2 pn-name-cell"><b>{dcTypeName(b.appliesTo.dcTypeKey) || 'All site types'} <RetiredTag b={b} /></b>{[b.appliesTo.coolingType && COOLING_LABEL[b.appliesTo.coolingType], b.appliesTo.tier, region(b.appliesTo.regionId)].filter(Boolean).join(' · ') && <small>{[b.appliesTo.coolingType && COOLING_LABEL[b.appliesTo.coolingType], b.appliesTo.tier, region(b.appliesTo.regionId)].filter(Boolean).join(' · ')}</small>}</span> }} />
        </Panel>
        <Panel flush icon={I.Receipt} count={listed(g.otherCost).length} title="Other cost inputs" sub="IT equipment, plant prices, labour, maintenance, staff, energy, migration and disposal prices used in CapEx and OpEx." info="Every other cost the estimates read. Filter by reference value or search; click a row to change it.">
          <ValueTable rows={listed(g.otherCost)} onRow={open} empty={emptyVals} />
        </Panel>
      </>}

      {view === 'efficiency' && <>
        <Panel flush icon={I.Gauge} count={listed(g.pue).length} title="What PUE can we expect?" sub="Typical PUE for each cooling choice in each climate, with its range. Lower is better; the best value is green and paler cells are more efficient. Click a value to change it." info="PUE = total facility power ÷ IT power. The planner picks the cell for the plan's cooling and the site's climate.">
          <PueMatrix rows={listed(g.pue)} onEdit={b => openB(library.find(x => x.id === b.id))} />
        </Panel>
        <Panel flush icon={I.Droplets} count={listed(g.otherEff).length} title="Water, carbon and other efficiency values" sub="Used for the sustainability figures of a plan." info="Water use, grid carbon intensity and any PUE value not tied to one cooling and climate pair.">
          <ValueTable rows={listed(g.otherEff)} onRow={open} empty={emptyVals} />
        </Panel>
      </>}

      {view === 'lead' && <>
        <Panel icon={I.Truck} count={listed(g.leadWeeks).length} title="How long does equipment take to arrive?" sub="Weeks from order to delivery on site, longest first. The planner orders at the high end plus contingency and flags anything that cannot arrive in time." info="Each bar runs from the low to the high lead time; the dark tick is the typical value. Amber bars are long-lead items. Click a row to change it.">
          <LeadBars rows={listed(g.leadWeeks)} onEdit={b => openB(library.find(x => x.id === b.id))} />
        </Panel>
        <div className="pn-two">
          <Panel flush icon={I.CalendarClock} count={listed(g.build).length} title="How long does a build take?" sub="From start to the first hall or pod ready for service, from our delivery history.">
            <ValueTable rows={listed(g.build)} onRow={open} empty={emptyVals} compact shared first={{ title: 'Kind of build', render: b => <span className="cell-2 pn-name-cell"><b>{b.name}</b></span> }} />
          </Panel>
          <Panel flush icon={I.ArrowRightLeft} count={listed(g.logistics).length} title="Logistics and migration timings" sub="Days to get spares and new kit to the rack, and hours of downtime when a service moves.">
            <ValueTable rows={listed(g.logistics)} onRow={open} empty={emptyVals} compact />
          </Panel>
        </div>
      </>}

      {view === 'sizing' && (
        <Panel flush icon={I.Ruler} count={listed(g.sizing).length} title="Sizing and staffing rules of thumb" sub="How much space, margin, plant and staff a plan needs. Hover a name to see what it means." info="Sizing and staffing values the engine uses to turn IT load into halls, plant and people. Click a row to change it.">
          <ValueTable rows={listed(g.sizing)} onRow={open} empty={emptyVals} />
        </Panel>
      )}

      {view === 'rules' && <RulesView rows={ruleRows} q={q} area={area} sev={sev} apply={apply} />}

      {edit && <BenchmarkDrawer key={`${edit.b?.id ?? 'new'}-${edit.view}-${edit.preset ? 'dup' : ''}`} edit={edit} library={library} onOpen={setEdit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** one reference value per row: name, typical value, range bar, applies to, source, version */
function ValueTable({ rows, first, onRow, toolbar, empty, shared, compact }: { rows: BRow[]; first?: { title: string; render: (b: BRow) => ReactNode }; onRow: (b: BRow) => void; toolbar?: ReactNode; empty?: ReactNode; shared?: boolean; compact?: boolean }) {
  const sharedMax = Math.max(1e-9, ...rows.map(b => b.high ?? b.value ?? 0));
  /* one scale for the whole table, starting just under the lowest value so the differences show */
  const sharedMin = Math.max(0, Math.min(...rows.map(b => b.low ?? b.value ?? 0)) * 0.8);
  const cols: Col<BRow>[] = [
    first ? { key: 'name', header: first.title, sort: b => b.name, wrap: true, render: first.render }
      : { key: 'name', header: 'Reference value', sort: b => b.name, wrap: true, render: b => { const use = benchUse(b); const body = <span className="cell-2 pn-name-cell"><b>{b.name} <RetiredTag b={b} /></b>{b.applies && <small>{b.applies}</small>}</span>;
        return use ? <Tip content={{ title: b.name, rows: [], note: use }}>{body}</Tip> : body; } },
    { key: 'v', header: 'Typical', sort: b => b.value ?? b.high ?? 0, render: b => <span className="num pn-nowrap"><b style={{ fontWeight: 500 }}>{withUnit(b.value ?? b.high, b.unit)}</b></span> },
    { key: 'range', header: 'Range', sort: b => (b.high ?? 0) - (b.low ?? 0), render: b => (b.low === undefined && b.high === undefined ? <span className="vw-label">—</span>
      : <span className="row pn-nowrap" style={{ gap: 8 }}><RangeBar low={b.low} value={b.value} high={b.high} min={shared ? sharedMin : 0} max={shared ? sharedMax : Math.max(1e-9, (b.high ?? b.value ?? 0) * 1.15)} width={compact ? 70 : 100} title={b.name} fmt={n => (isMoney(b.unit) ? money(n) : num(n, 2))} unit={isMoney(b.unit) ? b.unit.replace(/^USD\/?/i, '') && `per ${b.unit.replace(/^USD\/?/i, '')}` : b.unit === 'ratio' ? '' : b.unit} />{!compact && <span className="vw-label num">{rangeText(b)}</span>}</span>) },
    ...(compact ? [] : [{ key: 'src', header: 'Source', wrap: true, render: (b: BRow) => <span className="cell-2"><span style={{ fontSize: 12.5 }}>{b.source}</span><small>as of {date(b.sourceDate)} · {b.indicative ? 'indicative' : 'confirmed'}</small></span> }]),
    { key: 'ver', header: 'Version', sort: b => b.version ?? 1, render: b => <span className="mono">v{b.version ?? 1}</span> },
  ];
  /* a short table with no ranges at all leaves the Range column out */
  const shownCols = compact && !rows.some(b => b.low !== undefined || b.high !== undefined) ? cols.filter(c => c.key !== 'range') : cols;
  return <DataTable<BRow> rows={rows} cols={shownCols} pageSize={toolbar ? 25 : 100} onRow={onRow} toolbar={toolbar} empty={empty} />;
}

/** rules from every template, once, in two groups: must pass (blocks submission) and should pass (warns) */
function RulesView({ rows, q, area, sev, apply }: { rows: { id: string; rule: T.PlannerRuleDef; from: string[] }[]; q: string; area: string; sev: string; apply: (p: Record<string, string>) => void }) {
  type R = (typeof rows)[number];
  const what = (r: R) => RULE_PLAIN[r.rule.check] ?? r.rule.title;
  const shown = rows.filter(r => (!area || r.rule.aspect === area) && (!sev || r.rule.severity === sev) && (!q || `${what(r)} ${r.rule.title} ${r.id} ${r.rule.standard ?? ''} ${ASPECT_LABEL[r.rule.aspect]}`.toLowerCase().includes(q.toLowerCase())));
  const areas = (Object.keys(ASPECT_LABEL) as (keyof typeof ASPECT_LABEL)[]).filter(a => a === area || rows.some(r => r.rule.aspect === a));
  const toolbar = <ListToolbar shown={shown.length} total={rows.length} noun="rules" onApply={apply} search={{ value: q, onChange: v => apply({ q: v }), placeholder: 'Rule, id, standard, area' }}
    filters={[
      { id: 'area', label: 'Area', quick: true, value: area, anyLabel: 'Any area', onChange: v => apply({ area: v }), options: areas.map(a => ({ id: a, label: ASPECT_LABEL[a], count: rows.filter(r => r.rule.aspect === a).length })) },
      { id: 'sev', label: 'Severity', quick: true, value: sev, anyLabel: 'Must and should pass', onChange: v => apply({ sev: v }), options: [{ id: 'hard', label: 'Must pass', count: rows.filter(r => r.rule.severity === 'hard').length }, { id: 'soft', label: 'Should pass', count: rows.filter(r => r.rule.severity === 'soft').length }] },
    ]} />;
  const cols: Col<R>[] = [
    { key: 'r', header: 'What is checked', sort: what, wrap: true, render: r => <span className="cell-2 pn-name-cell"><b>{what(r)}</b><small>{RULE_PLAIN[r.rule.check] ? `${r.rule.title} · ` : ''}<span className="mono">{r.id}</span></small></span> },
    { key: 'a', header: 'Area', sort: r => ASPECT_LABEL[r.rule.aspect], render: r => ASPECT_LABEL[r.rule.aspect] },
    { key: 'std', header: 'Standard', wrap: true, render: r => r.rule.standard ?? <span className="vw-label">Internal</span> },
    { key: 'lim', header: 'Limit', sort: r => r.rule.threshold ?? -1, render: r => (r.rule.threshold !== undefined ? <span className="num">{num(r.rule.threshold, 2)}</span> : <span className="vw-label">—</span>) },
    { key: 'from', header: 'In templates', sort: r => r.from.length, render: r => <Tip className="is-dotted" content={{ title: `${r.from.length} template${r.from.length === 1 ? '' : 's'} check this`, rows: [], note: r.from.slice(0, 12).join(', ') + (r.from.length > 12 ? ` and ${r.from.length - 12} more` : '') }}><span className="pn-nowrap">{r.from.length} template{r.from.length === 1 ? '' : 's'}</span></Tip> },
  ];
  const group = (sev: 'hard' | 'soft') => shown.filter(r => r.rule.severity === sev);
  return <>
    <section className="vw-card-section pn-lib-tb">{toolbar}</section>
    {(['hard', 'soft'] as const).filter(x => !sev || x === sev).map(x => (
      <Panel key={x} flush icon={x === 'hard' ? I.ShieldAlert : I.ShieldCheck} count={group(x).length} title={x === 'hard' ? 'Must pass' : 'Should pass'}
        sub={x === 'hard' ? 'A plan cannot be submitted while any of these fails.' : 'A plan can be submitted, but the reviewer sees a warning with the reason.'}
        actions={<Chip tone={x === 'hard' ? 'error' : 'warning'} size="xs" outline>{x === 'hard' ? 'Blocks submission' : 'Warns the reviewer'}</Chip>}
        info="Every rule any template checks, once. The limit is the threshold the check compares against; In templates lists the templates that carry it.">
        <DataTable<R> rows={group(x)} cols={cols} pageSize={25} defaultSort={{ key: 'a', dir: 'asc' }}
          empty={<Empty icon={I.Inbox} title="No rules match" action={(q || area) ? <Btn onClick={() => apply({ q: '', area: '', sev: '' })}>Clear filters</Btn> : undefined}>{q || area ? 'Clear the search or the area filter to see every rule.' : 'No template carries a rule of this kind.'}</Empty>} />
      </Panel>
    ))}
  </>;
}

/** Add or change one reference value. The tab decides the kind of value; the measure decides the unit and which "applies to" fields
 *  the planner matches it on; another active value for the same case blocks the save (open it instead). Existing values also offer
 *  Duplicate for another case, Retire / Restore and their history. */
function BenchmarkDrawer({ edit, library, onOpen, onClose }: { edit: EditState; library: T.PlannerBenchmark[]; onOpen: (s: EditState) => void; onClose: () => void }) {
  const actions = usePlannerActions();
  const estate = useEstate();
  const b = edit.b, view = b ? viewOf(b) : edit.view, retired = !!b?.retiredAt;
  const measures = useMemo(() => measuresFor(view, library), [view, library]);
  const blank: Partial<T.PlannerBenchmark> = { metric: measures[0]?.metric, category: measures[0]?.category, unit: measures[0]?.unit, indicative: true, appliesTo: {}, source: '', sourceDate: new Date(clockMs()).toISOString() };
  const [f, setF] = useState<Partial<T.PlannerBenchmark>>(b ?? { ...blank, ...edit.preset });
  const [newItem, setNewItem] = useState(''); // a new equipment item (open families only)
  const [ask, setAsk] = useState<ReasonRequest | null>(null);
  const history = useBenchmarkAudit(b?.id);
  const set = (p: Partial<T.PlannerBenchmark>) => setF(x => ({ ...x, ...p }));
  const isNewItem = !b && (f.metric ?? '').startsWith('new:');
  const family = isNewItem ? f.metric!.slice(4) : metricKey(f.metric ?? '');
  const metric = isNewItem ? (newItem.trim() ? `${family}:${newItem.trim()}` : '') : f.metric ?? '';
  const measure = measures.find(m => m.metric === f.metric);
  const dim = dimsOf(metric || family);
  const pickMeasure = (id: string) => {
    if (id.startsWith('new:')) { const fam = id.slice(4); const like = measures.find(m => m.family === fam); set({ metric: id, category: like?.category ?? VIEW_CATEGORIES[view][0], unit: like?.unit ?? '', appliesTo: {} }); return; }
    const m = measures.find(x => x.metric === id); set({ metric: id, category: m?.category, unit: m?.unit, appliesTo: {} });
  };
  const applies = (p: Partial<T.PlannerBenchmark['appliesTo']>) => set({ appliesTo: { ...(f.appliesTo ?? {}), ...p } });
  const cleanApplies = Object.fromEntries(Object.entries(f.appliesTo ?? {}).filter(([k, v]) => v && dim.dims.includes(k as BenchDim))) as T.PlannerBenchmark['appliesTo'];
  const dup = metric ? duplicateOf(library, { id: b?.id, metric, appliesTo: cleanApplies }) : undefined;
  const caseMoved = !b || b.metric !== metric || JSON.stringify(b.appliesTo ?? {}) !== JSON.stringify(cleanApplies);
  /* checks shown next to the fields */
  const missingDims = dim.required ? dim.dims.filter(d => !cleanApplies[d]) : [];
  const hasValue = f.value !== undefined || (f.low !== undefined && f.high !== undefined);
  const order = [f.low, f.value, f.high].filter((x): x is number => x !== undefined);
  const badOrder = order.some((x, i) => i > 0 && x < order[i - 1]);
  const errors = [!metric && (isNewItem ? 'Name the equipment item.' : 'Pick what it measures.'), missingDims.length && `Say which ${missingDims.map(d => DIM_LABEL[d].toLowerCase()).join(' and ')} it applies to.`, !hasValue && 'Give a typical value, or a low and a high.', badOrder && 'Low ≤ typical ≤ high.', !f.source?.trim() && 'Say where the figure comes from.', dup && caseMoved && 'Another value already covers this case.'].filter(Boolean) as string[];
  const save = () => {
    const id = b?.id ?? actions.newId('BM');
    const fam = METRIC_INFO[family]?.name;
    const label = f.label?.trim() || (isNewItem ? `Lead time · ${newItem.trim()}` : b?.label ?? library.find(x => x.metric === metric)?.label ?? fam ?? metric);
    const rec = { ...(b ?? { id, bmId: id, customerId: 'CUST-001', isDeleted: false, createdAt: new Date(clockMs()).toISOString(), createdBy: actions.actor, createdById: actions.actorId ?? 'me', updatedAt: new Date(clockMs()).toISOString() }), ...f, metric, label, appliesTo: cleanApplies } as T.PlannerBenchmark;
    if (actions.saveBenchmark(rec).ok) onClose();
  };
  const dimField = (d: BenchDim) => {
    const req = !!dim.required, ro = !!b && retired;
    const opts = d === 'dcTypeKey' ? DC_TYPE_CATALOG.map(p => ({ id: p.key, label: p.name })) : d === 'tier' ? DC_TIERS.map(t => ({ id: t, label: t }))
      : d === 'coolingType' ? (Object.keys(COOLING_LABEL) as T.PlannerCoolingType[]).map(c => ({ id: c, label: COOLING_LABEL[c] })) : d === 'climate' ? Object.keys(CLIMATE_LABEL).map(c => ({ id: c, label: CLIMATE_LABEL[c] }))
      : estate.regions.map(r => ({ id: r.id, label: r.name }));
    return <Field key={d} label={DIM_LABEL[d]} required={req}><SelectInput value={(cleanApplies[d] as string) ?? ''} placeholder={req ? 'Choose' : 'Any (default)'} disabled={ro} options={opts} onChange={v => applies({ [d]: v || undefined })} /></Field>;
  };
  const families = [...new Set(measures.map(m => m.family))];
  const title = b ? benchName(b) : VIEW_ADD[view].title;
  const use = METRIC_INFO[metric]?.use ?? METRIC_INFO[family]?.use ?? measure?.use;
  return (
    <Drawer open onClose={onClose} width={600} title={title}
      sub={b ? <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}><Chip size="xs" outline>{CATEGORY_LABEL[b.category]}</Chip><span className="mono">v{b.version ?? 1}</span>{retired ? <Chip size="xs" tone="neutral">Retired {date(b.retiredAt!)}</Chip> : <Chip size="xs" tone={b.indicative ? 'warning' : 'success'} outline>{b.indicative ? 'Indicative' : 'Confirmed'}</Chip>}</span> : VIEW_ADD[view].sub}
      foot={<div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <span className="row" style={{ gap: 8 }}>
          {b && !retired && <Btn icon={I.Copy} onClick={() => onOpen({ b: null, view, preset: { metric: b.metric, category: b.category, unit: b.unit, value: b.value, low: b.low, high: b.high, source: b.source, sourceDate: b.sourceDate, indicative: true, appliesTo: { ...b.appliesTo }, label: b.label } })}>Duplicate for another case</Btn>}
          {b && !retired && <Btn icon={I.Archive} onClick={() => setAsk({ title: `Retire ${benchName(b)}?`, description: 'The planner stops reading this value: plans of this case fall back to the next matching value or the built-in default. Approved baselines keep the version they used, and you can restore it later.', okText: 'Retire value', danger: true, needsReason: true, placeholder: 'Why it is retired (kept in its history)', onOk: r => { actions.retireBenchmark(b, r); onClose(); } })}>Retire</Btn>}
          {b && retired && <Btn icon={I.RotateCcw} onClick={() => { if (actions.restoreBenchmark(b).ok) onClose(); }}>Restore</Btn>}
        </span>
        <span className="row" style={{ gap: 8 }}><Btn onClick={onClose}>{retired ? 'Close' : 'Cancel'}</Btn>{!retired && <Btn variant="filled" icon={I.Save} disabled={errors.length > 0} onClick={save}>{b ? 'Save new version' : 'Add value'}</Btn>}</span>
      </div>}>
      <div className="pn-bm-form">
        {retired && <div className="pn-bm-note is-muted"><I.Archive size={15} /><span>Retired by {b!.retiredBy ?? '—'} on {date(b!.retiredAt!)}{b!.retireReason ? `: ${b!.retireReason}` : ''}. The planner does not read it.</span></div>}
        <section>
          <h4>What it measures</h4>
          {b ? <div className="pn-bm-measure"><b>{benchName(b)}</b>{use && <span>{use}</span>}</div>
            : <Field label="Measure" required hint={use}>
              <select className="select" value={f.metric ?? ''} onChange={e => pickMeasure(e.target.value)}>
                {families.map(fam => { const ms = measures.filter(m => m.family === fam); const open = OPEN_FAMILIES[fam];
                  return ms.length === 1 && !open ? <option key={fam} value={ms[0].metric}>{ms[0].metric.includes(':') ? `${ms[0].familyName} · ${ms[0].name}` : ms[0].name}</option>
                    : <optgroup key={fam} label={ms[0].familyName}>{ms.map(m => <option key={m.metric} value={m.metric}>{m.name}</option>)}{open && <option value={`new:${fam}`}>Another {open.label.toLowerCase()}…</option>}</optgroup>; })}
              </select>
            </Field>}
          {isNewItem && <Field label={OPEN_FAMILIES[family].label} required hint={OPEN_FAMILIES[family].note}><TextInput value={newItem} onChange={setNewItem} placeholder={OPEN_FAMILIES[family].placeholder} /></Field>}
          <div className="pn-bm-unit"><I.Lock size={13} />Unit <b>{f.unit || '—'}</b><span className="vw-label">· set by the measure{/^USD/.test(f.unit ?? '') ? ', in the planner currency (USD)' : ''}</span></div>
        </section>
        <section>
          <h4>Applies to</h4>
          {dim.dims.length ? <div className="pn-grid-2">{dim.dims.map(dimField)}</div> : <p className="vw-label" style={{ margin: 0 }}>One value for every plan: the planner reads it whatever the site type, tier, cooling, climate or region.</p>}
          {dim.dims.length > 0 && <p className="vw-label" style={{ margin: '6px 0 0' }}>{dim.note}</p>}
          {dup && caseMoved && <div className="pn-bm-note is-warn"><I.TriangleAlert size={15} /><span><b>{benchName(dup)}</b> already has a value for this case (v{dup.version ?? 1}, typical {withUnit(dup.value ?? dup.high, dup.unit)}). One value per case: change that one, or pick another case.</span><Btn size="sm" onClick={() => onOpen({ b: dup, view })}>Open that value</Btn></div>}
          {b && !caseMoved && !retired && duplicateOf(library, b) && <div className="pn-bm-note is-warn"><I.TriangleAlert size={15} /><span>Another active value covers the same case, so the planner reads whichever comes first. Retire one of them.</span><Btn size="sm" onClick={() => onOpen({ b: duplicateOf(library, b)!, view })}>Open the other</Btn></div>}
        </section>
        <section>
          <h4>Value</h4>
          <div className="pn-grid-3">
            <Field label="Low"><NumInput value={f.low} onChange={v => set({ low: v })} disabled={retired} /></Field>
            <Field label="Typical" hint="what the planner uses"><NumInput value={f.value} onChange={v => set({ value: v })} disabled={retired} /></Field>
            <Field label="High"><NumInput value={f.high} onChange={v => set({ high: v })} disabled={retired} /></Field>
          </div>
          {badOrder && <span className="field-error">Low must not exceed typical, and typical must not exceed high.</span>}
        </section>
        <section>
          <h4>Source</h4>
          <div className="pn-grid-2">
            <Field label="Where the figure comes from" required style={{ gridColumn: 'span 2' }}><TextInput value={f.source ?? ''} onChange={v => set({ source: v })} placeholder="e.g. Supplier quotes 2026, last three builds" disabled={retired} /></Field>
            <Field label="As of"><TextInput type="date" value={(f.sourceDate ?? '').slice(0, 10)} onChange={v => set({ sourceDate: v ? `${v}T00:00:00.000Z` : f.sourceDate })} disabled={retired} /></Field>
            <Field label="Confidence" hint={f.indicative ? 'not yet confirmed by our own sites' : 'confirmed by our own delivered sites'}><Seg<'i' | 'c'> size="sm" value={f.indicative ? 'i' : 'c'} onChange={v => !retired && set({ indicative: v === 'i' })} options={[{ id: 'i', label: 'Indicative' }, { id: 'c', label: 'Confirmed' }]} /></Field>
            <Field label="Name shown to planners" style={{ gridColumn: 'span 2' }}><TextInput value={f.label ?? ''} onChange={v => set({ label: v })} placeholder={b?.label ?? (isNewItem ? `Lead time · ${newItem || '…'}` : library.find(x => x.metric === metric)?.label ?? '')} disabled={retired} /></Field>
          </div>
        </section>
        {!retired && errors.length > 0 && !(errors.length === 1 && dup) && <p className="vw-label" style={{ margin: 0 }}>To save: {errors.join(' ')}</p>}
        {b && <section>
          <h4>History</h4>
          {history.length ? <ol className="pn-bm-hist">{history.map(e => <li key={e.id}><b>{e.action.replace(/^benchmark /, '')}</b><span>{e.summary.replace(/^Benchmark [^:]*?(v\d+ → v\d+: )?/, (_m, v) => v ?? '')}{e.reason ? ` · “${e.reason}”` : ''}</span><small>{e.actorName} · {date(e.timestamp)}</small></li>)}</ol>
            : <p className="vw-label" style={{ margin: 0 }}>v{b.version ?? 1} as loaded from the {b.indicative ? 'benchmark set' : 'confirmed benchmark set'}; no edits since. Every save adds a version here (old → new).</p>}
        </section>}
      </div>
      <ReasonModal req={ask} onClose={() => setAsk(null)} />
    </Drawer>
  );
}
