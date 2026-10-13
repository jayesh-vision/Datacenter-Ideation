/* Planner → Benchmarks & rules: the reference values every estimate reads (cost, efficiency, lead times, sizing and staffing), each
   with its source and date, and the rules the plan templates check. Values are edited in a drawer; every edit bumps the version and
   is audited, so an approved plan can say which value it used. */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { DataTable, type Col } from '../../ui/DataTable';
import { Btn, Chip, Drawer, Field, Seg, Toggle } from '../../ui/kit';
import { useBenchmarks, useEstate, usePlannerActions, useTemplates } from '../../planner/lib/usePlanner';
import { CLIMATE_LABEL, COOLING_LABEL, METRIC_INFO, RULE_PLAIN, metricDetail, metricKey } from '../../planner/lib/labels';
import { DC_TYPE_CATALOG } from '../../planner/p2b/dcTypes';
import type * as T from '../../planner/p2b/types';
import { clockMs } from '../../planner/compat/clock';
import { ASPECT_LABEL, NumInput, SelectInput, TextInput, date, num } from './common';

type View = 'cost' | 'efficiency' | 'lead' | 'sizing' | 'rules';
const VIEW_CATS: Record<Exclude<View, 'rules'>, T.PlannerBenchmark['category'][]> = { cost: ['cost'], efficiency: ['performance', 'sustainability'], lead: ['leadtime'], sizing: ['sizing', 'staffing'] };
const CATEGORY_LABEL: Record<T.PlannerBenchmark['category'], string> = { cost: 'Cost', performance: 'Efficiency', sustainability: 'Sustainability', leadtime: 'Lead time', sizing: 'Sizing', staffing: 'Staffing' };

export function BenchmarksTab() {
  const [sp] = useSearchParams();
  const apply = useParamPatch();
  const benchmarks = useBenchmarks();
  const templates = useTemplates();
  const estate = useEstate();
  const view = (sp.get('view') as View) || 'cost';
  const q = sp.get('q') ?? '', metric = sp.get('metric') ?? '';
  const [edit, setEdit] = useState<T.PlannerBenchmark | 'new' | null>(null);
  const appliesLabel = (b: T.PlannerBenchmark) => [b.appliesTo.dcTypeKey && (DC_TYPE_CATALOG.find(p => p.key === b.appliesTo.dcTypeKey)?.name ?? b.appliesTo.dcTypeKey), b.appliesTo.coolingType && COOLING_LABEL[b.appliesTo.coolingType], b.appliesTo.climate && CLIMATE_LABEL[b.appliesTo.climate], b.appliesTo.tier, b.appliesTo.regionId && (estate.regions.find(r => r.id === b.appliesTo.regionId)?.name ?? b.appliesTo.regionId)].filter(Boolean).join(' · ') || 'Everywhere';
  const rows = useMemo(() => (view === 'rules' ? [] : benchmarks.filter(b => VIEW_CATS[view].includes(b.category)).map(b => ({ ...b, name: METRIC_INFO[metricKey(b.metric)]?.name ?? b.label, detail: metricDetail(b.metric), applies: appliesLabel(b) }))), [benchmarks, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = rows.filter(b => (!metric || metricKey(b.metric) === metric) && (!q || `${b.name} ${b.detail} ${b.applies} ${b.source}`.toLowerCase().includes(q.toLowerCase())));
  const metrics = [...new Set(rows.map(b => metricKey(b.metric)))];
  const cols: Col<typeof rows[number]>[] = [
    { key: 'm', header: 'Reference value', sort: b => b.name, render: b => <span className="cell-2"><b>{b.name}{b.detail ? ` · ${b.detail}` : ''}</b><small>{METRIC_INFO[metricKey(b.metric)]?.use ?? b.label}</small></span>, wrap: true },
    { key: 'cat', header: 'Group', sort: b => b.category, render: b => CATEGORY_LABEL[b.category] },
    { key: 'applies', header: 'Applies to', sort: b => b.applies, render: b => b.applies, wrap: true },
    { key: 'v', header: 'Typical', sort: b => b.value ?? 0, render: b => <span className="num">{b.value === undefined ? '—' : num(b.value, 3)}</span> },
    { key: 'range', header: 'Low – high', render: b => <span className="num">{b.low === undefined && b.high === undefined ? '—' : `${b.low === undefined ? '…' : num(b.low, 3)} – ${b.high === undefined ? '…' : num(b.high, 3)}`}</span> },
    { key: 'unit', header: 'Unit', render: b => b.unit },
    { key: 'src', header: 'Source', render: b => <span className="cell-2"><b>{b.source}</b><small>as of {date(b.sourceDate)}{b.indicative ? ' · indicative' : ' · confirmed'}</small></span>, wrap: true },
    { key: 'ver', header: 'Version', sort: b => b.version ?? 1, render: b => <span className="mono">v{b.version ?? 1}</span> },
  ];
  const ruleRows = useMemo(() => {
    const seen = new Map<string, { id: string; rule: T.PlannerRuleDef; from: string[] }>();
    for (const t of templates) for (const r of t.rules) { const x = seen.get(r.id) ?? { id: r.id, rule: r, from: [] }; x.from.push(t.name); seen.set(r.id, x); }
    return [...seen.values()].filter(r => !q || `${r.rule.title} ${r.id} ${r.rule.standard ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  }, [templates, q]);
  const ruleCols: Col<typeof ruleRows[number]>[] = [
    { key: 'r', header: 'Rule', sort: r => r.rule.title, render: r => <span className="cell-2"><b>{r.rule.title}</b><small>{RULE_PLAIN[r.rule.check] ?? `check ${r.rule.check}`}{r.rule.threshold !== undefined ? ` · threshold ${r.rule.threshold}` : ''}</small></span>, wrap: true },
    { key: 'id', header: 'Id', sort: r => r.id, render: r => <span className="mono">{r.id}</span> },
    { key: 'a', header: 'Area', sort: r => r.rule.aspect, render: r => ASPECT_LABEL[r.rule.aspect] },
    { key: 's', header: 'Severity', sort: r => r.rule.severity, render: r => <Chip tone={r.rule.severity === 'hard' ? 'error' : 'warning'} size="xs" outline>{r.rule.severity === 'hard' ? 'Must pass' : 'Should pass'}</Chip> },
    { key: 'std', header: 'Standard', render: r => r.rule.standard ?? '—', wrap: true },
    { key: 'from', header: 'In templates', sort: r => r.from.length, render: r => `${r.from.length} template${r.from.length === 1 ? '' : 's'}` },
  ];
  const seg = <Seg<View> size="sm" value={view} onChange={v => apply({ view: v, metric: '', q: '' })} options={[{ id: 'cost', label: 'Costs' }, { id: 'efficiency', label: 'Efficiency' }, { id: 'lead', label: 'Lead times' }, { id: 'sizing', label: 'Sizing & staffing' }, { id: 'rules', label: 'Rules' }]} />;
  return (
    <section className="vw-card-section dcl-table">
      {view === 'rules'
        ? <DataTable rows={ruleRows} cols={ruleCols} pageSize={30} defaultSort={{ key: 'a', dir: 'asc' }} toolbar={<ListToolbar shown={ruleRows.length} total={ruleRows.length} noun="rules" onApply={apply} search={{ value: q, onChange: v => apply({ q: v }), placeholder: 'Rule, id, standard' }}>{seg}</ListToolbar>} />
        : <DataTable rows={shown} cols={cols} pageSize={30} defaultSort={{ key: 'm', dir: 'asc' }} onRow={b => setEdit(benchmarks.find(x => x.id === b.id) ?? null)}
          toolbar={<ListToolbar shown={shown.length} total={rows.length} noun="values" onApply={apply} search={{ value: q, onChange: v => apply({ q: v }), placeholder: 'Value, site type, source' }}
            filters={[{ id: 'metric', label: 'Reference value', quick: true, value: metric, anyLabel: 'Any value', onChange: v => apply({ metric: v }), options: metrics.map(m => ({ id: m, label: METRIC_INFO[m]?.name ?? m, count: rows.filter(b => metricKey(b.metric) === m).length })) }]}
            actions={[{ label: 'Add a value', icon: I.Plus, onClick: () => setEdit('new') }]}>{seg}</ListToolbar>} />}
      {edit && <BenchmarkDrawer b={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function BenchmarkDrawer({ b, onClose }: { b: T.PlannerBenchmark | null; onClose: () => void }) {
  const actions = usePlannerActions();
  const estate = useEstate();
  const [f, setF] = useState<Partial<T.PlannerBenchmark>>(b ?? { metric: 'capexPerKw', category: 'cost', unit: 'USD/kW', indicative: true, appliesTo: {}, source: '', sourceDate: new Date(clockMs()).toISOString() });
  const set = (p: Partial<T.PlannerBenchmark>) => setF(x => ({ ...x, ...p }));
  const applies = (p: Partial<T.PlannerBenchmark['appliesTo']>) => set({ appliesTo: { ...(f.appliesTo ?? {}), ...p } });
  const ok = !!f.metric && !!f.unit && !!f.source && (f.value !== undefined || (f.low !== undefined && f.high !== undefined));
  const save = () => {
    const id = b?.id ?? actions.newId('BM');
    actions.saveBenchmark({ ...(b ?? { id, bmId: id, customerId: 'CUST-001', isDeleted: false, createdAt: new Date(clockMs()).toISOString(), createdBy: actions.actor, createdById: actions.actorId ?? 'me', updatedAt: new Date(clockMs()).toISOString() }), ...f, label: f.label || METRIC_INFO[metricKey(f.metric!)]?.name || f.metric!, appliesTo: Object.fromEntries(Object.entries(f.appliesTo ?? {}).filter(([, v]) => v)) } as T.PlannerBenchmark);
    onClose();
  };
  const metricOpts = Object.entries(METRIC_INFO).filter(([k]) => k !== 'leadWeeks' && k !== 'durationWeeks').map(([k, v]) => ({ id: k, label: v.name }));
  return (
    <Drawer open onClose={onClose} width={560} title={b ? (METRIC_INFO[metricKey(b.metric)]?.name ?? b.label) : 'Add a reference value'} sub={b ? `${b.metric} · v${b.version ?? 1}` : 'A value with its source and date; indicative until confirmed by our own sites.'}
      foot={<div className="row" style={{ justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Save} disabled={!ok} onClick={save}>{b ? 'Save' : 'Add'}</Btn></div>}>
      <div className="pn-grid-2">
        <Field label="What it measures" required>{b?.metric.includes(':') ? <TextInput value={b.metric} onChange={() => undefined} disabled /> : <SelectInput value={f.metric} options={metricOpts} onChange={v => set({ metric: v })} />}</Field>
        <Field label="Group" required><SelectInput value={f.category} options={(Object.keys(CATEGORY_LABEL) as T.PlannerBenchmark['category'][]).map(c => ({ id: c, label: CATEGORY_LABEL[c] }))} onChange={v => set({ category: v })} /></Field>
        <Field label="Low"><NumInput value={f.low} onChange={v => set({ low: v })} /></Field>
        <Field label="Typical"><NumInput value={f.value} onChange={v => set({ value: v })} /></Field>
        <Field label="High"><NumInput value={f.high} onChange={v => set({ high: v })} /></Field>
        <Field label="Unit" required><TextInput value={f.unit ?? ''} onChange={v => set({ unit: v })} /></Field>
        <Field label="Site type"><SelectInput value={f.appliesTo?.dcTypeKey ?? ''} placeholder="Any" options={DC_TYPE_CATALOG.map(p => ({ id: p.key, label: p.name }))} onChange={v => applies({ dcTypeKey: v || undefined })} /></Field>
        <Field label="Cooling"><SelectInput value={f.appliesTo?.coolingType ?? ''} placeholder="Any" options={(Object.keys(COOLING_LABEL) as T.PlannerCoolingType[]).map(c => ({ id: c, label: COOLING_LABEL[c] }))} onChange={v => applies({ coolingType: (v || undefined) as T.PlannerCoolingType | undefined })} /></Field>
        <Field label="Climate"><SelectInput value={f.appliesTo?.climate ?? ''} placeholder="Any" options={Object.keys(CLIMATE_LABEL).map(c => ({ id: c, label: CLIMATE_LABEL[c] }))} onChange={v => applies({ climate: v || undefined })} /></Field>
        <Field label="Region"><SelectInput value={f.appliesTo?.regionId ?? ''} placeholder="Any" options={estate.regions.map(r => ({ id: r.id, label: r.name }))} onChange={v => applies({ regionId: v || undefined })} /></Field>
        <Field label="Source" required style={{ gridColumn: 'span 2' }}><TextInput value={f.source ?? ''} onChange={v => set({ source: v })} placeholder="Where the figure comes from" /></Field>
        <Field label="As of"><TextInput type="date" value={(f.sourceDate ?? '').slice(0, 10)} onChange={v => set({ sourceDate: v ? `${v}T00:00:00.000Z` : f.sourceDate })} /></Field>
        <Field label="Indicative" hint="not yet confirmed by our own sites"><Toggle on={!!f.indicative} onChange={v => set({ indicative: v })} /></Field>
      </div>
    </Drawer>
  );
}
