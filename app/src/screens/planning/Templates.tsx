/* Planner → Templates: the plan types, site types and modules (aspect modules, rule sets, demand profiles, documents, checklists)
   the wizard is built from, one panel per view with a plain explanation. A template opens in a drawer whose id lives in the URL
   (?template=, also reached from /planning/templates/:id), so it can be linked and browser back closes it. The drawer shows the
   inheritance chain, areas, approval path, inputs with plain-language defaults (only the areas the plan type covers), rules, the
   plans that use it and its versions. Lifecycle: draft → published → retired; defaults are edited on drafts only and every content
   change bumps the version (plans keep the version they were approved on). "Make a variant" starts a draft that inherits;
   "Start a plan" opens the wizard on a published plan type. */
import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { DataTable, type Col } from '../../ui/DataTable';
import { Btn, Chip, Drawer, Empty, Field, KV, Modal, Panel, Seg, Toggle } from '../../ui/kit';
import { useEntityList } from '../../planner/compat/useEntityCRUD';
import { usePlannerActions, usePlans, useTemplates } from '../../planner/lib/usePlanner';
import { resolveTemplate } from '../../planner/lib/engine';
import { dimensionsFor } from '../../planner/lib/dimensions';
import { CLIMATE_LABEL, COOLING_LABEL, RULE_PLAIN } from '../../planner/lib/labels';
import { DC_TYPE_CATALOG, type DcTypeProfile } from '../../planner/p2b/dcTypes';
import type * as T from '../../planner/p2b/types';
import { Sub } from './parts';
import { ASPECT_LABEL, NumInput, PlanStatusChip, SCOPE_LABEL, SelectInput, TemplateStatusChip, TextInput, date, kw, money, num } from './common';
import { StackBar, Tip } from './charts/library';
import { SERIES } from './charts/chartKit';

type View = 'plans' | 'sites' | 'modules';
const KIND_LABEL: Record<T.PlannerTemplateKind, string> = { profile: 'Site type', plan: 'Plan type', aspect: 'Aspect module', ruleset: 'Rule set', benchmarkset: 'Benchmark set', demand: 'Demand profile', document: 'Document', checklist: 'Checklist', blueprint: 'Blueprint' };
const viewOf = (k: T.PlannerTemplateKind): View => (k === 'plan' ? 'plans' : k === 'profile' ? 'sites' : 'modules');
const STATUS_LABEL: Record<T.PlannerTemplate['status'], string> = { published: 'Published', draft: 'Draft', deprecated: 'Retired' };
const INTRO: Record<View, { title: string; sub: string; noun: string; icon: typeof I.LayoutTemplate }> = {
  plans: { title: 'Plan types', noun: 'plan types', icon: I.LayoutTemplate, sub: 'Pick one when you start a plan. It decides which areas you must cover, what the approved plan becomes and who approves it. Open one to see its inputs and checks.' },
  sites: { title: 'Site types', noun: 'site types', icon: I.Building2, sub: 'The kind of site being planned. It sets the typical size, density, cooling, tier and PUE, and which benchmarks apply. Smallest first.' },
  modules: { title: 'Modules & rules', noun: 'modules', icon: I.Blocks, sub: 'For template owners: reusable design modules, rule sets, demand profiles, documents and checklists that plan types are built from.' },
};

/* ---- plain values: engine keys and raw numbers as a planner would say them */
const SIMPLE_KEBAB = /^[a-z0-9]+(-[a-z0-9]+)+$/;
function optionLabel(key: string, v: string): string {
  if (key === 'coolingType') return COOLING_LABEL[v as T.PlannerCoolingType] ?? v;
  if (key === 'climate') return CLIMATE_LABEL[v] ?? v;
  if (key === 'feedVoltage') return Number(v) >= 1000 ? `${num(Number(v) / 1000, 1)} kV` : `${v} V`;
  if (/Gbps$/.test(key)) return `${v} Gbps`;
  if (/Kva$/.test(key)) return `${num(Number(v))} kVA`;
  if (key === 'commissioningLevel') return `Level ${v}`;
  if (SIMPLE_KEBAB.test(v)) { const t = v.replace(/-/g, ' ').replace(/\b(dc|it|ups|pdu|gpu|dci|wan)\b/g, w => w.toUpperCase()); return t[0].toUpperCase() + t.slice(1); }
  return v;
}
function fmtDefault(p: T.PlannerParamDef, v: T.PlannerParamDef['default'] = p.default): string {
  if (v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') { if (p.unit && /^USD/i.test(p.unit)) { const rest = p.unit.replace(/^USD\/?/i, ''); return `${money(v)}${rest ? ` / ${rest}` : ''}`; } return `${num(v, 2)}${p.unit ? ` ${p.unit}` : ''}`; }
  return optionLabel(p.key, v);
}
const range = (r: [number, number | null] | null | undefined, f: (n: number) => string) => (!r ? '—' : r[1] === null ? `${f(r[0])}+` : r[0] === r[1] ? f(r[0]) : `${f(r[0])} – ${f(r[1])}`);
const coveredAspects = (t: T.PlannerTemplate) => new Set(t.requiredAspects.filter(a => a.depth !== 'skipped').map(a => a.aspect));

type TplRow = T.PlannerTemplate & { uses: number };
type SiteRow = DcTypeProfile & { id: string; profile?: T.PlannerTemplate; uses: number };

export function TemplatesTab() {
  const [sp, setSp] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const apply = useParamPatch();
  const templates = useTemplates();
  const plans = usePlans();
  const view = (sp.get('view') as View) || 'plans';
  const q = sp.get('q') ?? '', status = sp.get('status') ?? '';
  const openId = sp.get('template');
  /* the drawer lives in the URL: opening pushes a history entry (back closes it), closing pops it when we pushed it */
  const openTpl = (id: string) => { const n = new URLSearchParams(sp); n.set('template', id); setSp(n, { state: { tplOpen: true } }); };
  const closeTpl = () => { if ((loc.state as { tplOpen?: boolean } | null)?.tplOpen) nav(-1); else { const n = new URLSearchParams(sp); n.delete('template'); setSp(n, { replace: true }); } };

  const byId = useMemo(() => new Map(templates.map(t => [t.id, t])), [templates]);
  const uses = useMemo(() => { const m = new Map<string, number>(); for (const p of plans) { m.set(p.templateId, (m.get(p.templateId) ?? 0) + 1); if (p.dcTypeKey) m.set(`type:${p.dcTypeKey}`, (m.get(`type:${p.dcTypeKey}`) ?? 0) + 1); } return m; }, [plans]);
  const match = (text: string) => !q || text.toLowerCase().includes(q.toLowerCase());
  const tplRows = useMemo<TplRow[]>(() => templates.filter(t => viewOf(t.kind) === view && view !== 'sites').map(t => ({ ...t, uses: uses.get(t.id) ?? 0 })), [templates, uses, view]);
  const profiles = useMemo(() => new Map(templates.filter(t => t.kind === 'profile').map(t => [t.dcTypeKey, t])), [templates]);
  const siteRows = useMemo<SiteRow[]>(() => [...DC_TYPE_CATALOG].sort((a, b) => a.powerKw[0] - b.powerKw[0] || (a.powerKw[1] ?? 1e12) - (b.powerKw[1] ?? 1e12)).map(p => ({ ...p, id: p.key, profile: profiles.get(p.key), uses: uses.get(`type:${p.key}`) ?? 0 })), [profiles, uses]);
  const shownTpl = tplRows.filter(t => (!status || t.status === status) && match(`${t.name} ${t.description} ${t.labels.join(' ')}`));
  const shownSites = siteRows.filter(p => (!status || p.profile?.status === status) && match(`${p.name} ${p.description} ${p.segment} ${p.cooling}`));
  const totals: Record<View, number> = { plans: templates.filter(t => t.kind === 'plan').length, sites: DC_TYPE_CATALOG.length, modules: templates.filter(t => viewOf(t.kind) === 'modules').length };
  const statuses = view === 'sites' ? siteRows.map(p => p.profile?.status) : tplRows.map(t => t.status);
  const name2 = (title: string, sub?: React.ReactNode) => <span className="cell-2 pn-name-cell"><b>{title}</b>{sub && <small>{sub}</small>}</span>;

  const planCols: Col<TplRow>[] = [
    { key: 'name', header: 'Plan type', sort: t => t.name, wrap: true, render: t => name2(t.name, <>{t.inheritsFrom ? `Variant of ${byId.get(t.inheritsFrom)?.name ?? 'a standard'} · ` : ''}{t.description}</>) },
    { key: 'covers', header: 'Areas covered', sort: t => t.requiredAspects.filter(x => x.depth === 'full').length, render: t => { const full = t.requiredAspects.filter(x => x.depth === 'full'), brief = t.requiredAspects.filter(x => x.depth === 'summary');
      return <Tip className="is-dotted" content={{ title: `${t.name} covers`, rows: [['In full', String(full.length)], ['Brief', String(brief.length)]], note: [full.length ? `In full: ${full.map(x => ASPECT_LABEL[x.aspect]).join(', ')}.` : '', brief.length ? ` Brief: ${brief.map(x => ASPECT_LABEL[x.aspect]).join(', ')}.` : ''].join('') }}><span className="pn-nowrap">{full.length} in full{brief.length ? <span className="vw-label">, {brief.length} brief</span> : null}</span></Tip>; } },
    { key: 'becomes', header: 'Becomes', sort: t => t.executesAs ?? '', render: t => <span className="pn-nowrap">{t.executesAs ? `A ${t.executesAs}` : '—'}</span> },
    { key: 'appr', header: 'Approved by', wrap: true, render: t => (t.approvalPath.length ? <span className="pn-appr">{t.approvalPath.join(' → ')}</span> : <span className="vw-label">No approval</span>) },
    { key: 'uses', header: 'Plans', sort: t => t.uses, render: t => <span className="num">{t.uses}</span> },
    { key: 'status', header: 'Status', sort: t => t.status, render: t => <TemplateStatusChip s={t.status} /> },
    { key: 'v', header: 'Version', sort: t => t.version, render: t => <span className="mono">v{t.version}</span> },
  ];
  const siteCols: Col<SiteRow>[] = [
    { key: 'name', header: 'Site type', sort: p => p.name, wrap: true, render: p => name2(p.name, p.segment) },
    { key: 'size', header: 'Typical size', sort: p => p.powerKw[0], render: p => <span className="num pn-nowrap">{range(p.powerKw, kw)}</span> },
    { key: 'racks', header: 'Racks', sort: p => p.typicalRacks[0], render: p => <span className="num pn-nowrap">{range(p.typicalRacks, n => num(n))}</span> },
    { key: 'kwr', header: 'kW per rack', sort: p => p.kwPerRack?.[1] ?? 0, render: p => <span className="num pn-nowrap">{p.kwPerRack ? `${num(p.kwPerRack[0])} – ${num(p.kwPerRack[1])}` : '—'}</span> },
    { key: 'cooling', header: 'Cooling', wrap: true, render: p => <span style={{ fontSize: 12.5 }}>{p.cooling}</span> },
    { key: 'tier', header: 'Tier', sort: p => p.defaultTier, render: p => <span className="pn-nowrap">{p.defaultTier}</span> },
    { key: 'pue', header: 'PUE target', sort: p => p.pueTarget ?? 0, render: p => <span className="num">{p.pueTarget ? num(p.pueTarget, 2) : '—'}</span> },
    { key: 'uses', header: 'Plans', sort: p => p.uses, render: p => <span className="num">{p.uses}</span> },
    { key: 'status', header: 'Status', sort: p => p.profile?.status ?? '', render: p => (p.profile ? <TemplateStatusChip s={p.profile.status} /> : <span className="vw-label">No profile</span>) },
  ];
  const modCols: Col<TplRow>[] = [
    { key: 'name', header: 'Name', sort: t => t.name, wrap: true, render: t => name2(t.name, t.description) },
    { key: 'kind', header: 'Kind', sort: t => KIND_LABEL[t.kind], render: t => KIND_LABEL[t.kind] },
    { key: 'status', header: 'Status', sort: t => t.status, render: t => <TemplateStatusChip s={t.status} /> },
    { key: 'v', header: 'Version', sort: t => t.version, render: t => <span className="mono">v{t.version}</span> },
  ];

  const intro = INTRO[view];
  const shownCount = view === 'sites' ? shownSites.length : shownTpl.length;
  const toolbar = <ListToolbar shown={shownCount} total={totals[view]} noun={intro.noun} onApply={apply} search={{ value: q, onChange: v => apply({ q: v }), placeholder: view === 'sites' ? 'Name, segment, cooling' : 'Name, description, label' }}
    filters={[{ id: 'status', label: 'Status', quick: true, value: status, anyLabel: 'Any status', onChange: v => apply({ status: v }), options: (['published', 'draft', 'deprecated'] as const).filter(s => s === status || statuses.includes(s)).map(s => ({ id: s, label: STATUS_LABEL[s], count: statuses.filter(x => x === s).length })) }]} />;
  const empty = <Empty icon={intro.icon} title={`No ${intro.noun} match`} action={(q || status) ? <Btn onClick={() => apply({ q: '', status: '' })}>Clear filters</Btn> : undefined}>Clear the search or the status filter to see every one.</Empty>;
  const open = openId ? byId.get(openId) : undefined;
  return (
    <div className="pn-lib">
      <Panel flush title={intro.title} sub={intro.sub} icon={intro.icon} count={totals[view]} info="Templates make the planner consistent: a plan type fixes the questions, rules and approvers; a site type sets typical sizes and the benchmarks that apply; modules are the reusable parts plan types are built from."
        actions={<Seg<View> size="sm" value={view} onChange={v => apply({ view: v === 'plans' ? '' : v, status: '', q: '' })} options={[{ id: 'plans', label: `Plan types · ${totals.plans}` }, { id: 'sites', label: `Site types · ${totals.sites}` }, { id: 'modules', label: `Modules & rules · ${totals.modules}` }]} />}>
        {view === 'sites'
          ? <DataTable<SiteRow> rows={shownSites} cols={siteCols} pageSize={25} onRow={p => { if (p.profile) openTpl(p.profile.id); }} toolbar={toolbar} empty={empty} />
          : <DataTable<TplRow> rows={shownTpl} cols={view === 'plans' ? planCols : modCols} pageSize={25} defaultSort={view === 'modules' ? { key: 'kind', dir: 'asc' } : undefined} onRow={t => openTpl(t.id)} toolbar={toolbar} empty={empty} />}
      </Panel>
      {open && <TemplateDrawer key={open.id} t={open} onClose={closeTpl} onOpen={openTpl} />}
    </div>
  );
}

function TemplateDrawer({ t, onClose, onOpen }: { t: T.PlannerTemplate; onClose: () => void; onOpen: (id: string) => void }) {
  const nav = useNavigate();
  const templates = useTemplates();
  const plans = usePlans();
  const actions = usePlannerActions();
  const audit = (useEntityList('auditEvents', { pageSize: 100000 }).data?.data ?? []) as unknown as T.AuditEvent[];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, T.PlannerParamDef['default']>>({});
  const [variant, setVariant] = useState<string | null>(null);
  const resolved = resolveTemplate(t.id, templates);
  const chain = resolved?.chain ?? [t];
  /* a plan type asks only for the areas it covers */
  const allParams = resolved?.params ?? t.params;
  const covered = coveredAspects(t);
  const params = t.kind === 'plan' && covered.size ? allParams.filter(p => covered.has(p.aspect)) : allParams;
  const hidden = allParams.length - params.length;
  const rules = resolved?.rules ?? t.rules;
  const own = new Set(t.params.map(p => p.key));
  const ownShown = params.filter(p => own.has(p.key)).length;
  const profile = t.kind === 'profile' ? DC_TYPE_CATALOG.find(p => p.key === t.dcTypeKey) : undefined;
  const uses = plans.filter(p => p.templateId === t.id || (t.kind === 'profile' && !!t.dcTypeKey && p.dcTypeKey === t.dcTypeKey));
  const versions = audit.filter(a => a.entityId === t.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const editable = t.status === 'draft';
  const save = () => {
    const next = { ...t, params: allParams.map(p => (draft[p.key] !== undefined ? { ...p, default: draft[p.key] } : p)).filter(p => own.has(p.key) || draft[p.key] !== undefined) };
    actions.saveTemplate(next); setEditing(false); setDraft({});
  };
  const paramRow = (p: T.PlannerParamDef) => {
    const v = draft[p.key] ?? p.default;
    if (!editing) return fmtDefault(p, v);
    if (p.type === 'bool') return <Toggle on={!!v} onChange={x => setDraft(d => ({ ...d, [p.key]: x }))} />;
    if (p.type === 'select') return <SelectInput value={String(v ?? '')} options={(p.options ?? []).map(o => ({ id: o, label: optionLabel(p.key, o) }))} onChange={x => setDraft(d => ({ ...d, [p.key]: x }))} style={{ height: 32 }} />;
    if (p.type === 'number') return <NumInput value={typeof v === 'number' ? v : undefined} min={p.min} max={p.max} unit={p.unit} onChange={x => setDraft(d => ({ ...d, [p.key]: x }))} style={{ maxWidth: 180 }} />;
    return <TextInput value={String(v ?? '')} onChange={x => setDraft(d => ({ ...d, [p.key]: x }))} style={{ height: 32 }} />;
  };
  const startPlan = () => nav(`/planning/new?${new URLSearchParams({ ...(t.scope ? { scope: t.scope } : {}), template: t.id })}`);
  return (
    <Drawer open onClose={onClose} width={760} title={t.name} sub={t.description}
      head={<div className="row wrap" style={{ gap: 6, marginTop: 8 }}><Chip tone="neutral">{KIND_LABEL[t.kind]}</Chip><TemplateStatusChip s={t.status} /><Chip tone="neutral">v{t.version}</Chip>{t.scope && <Chip tone="info">{SCOPE_LABEL[t.scope]}</Chip>}{t.inheritsFrom && <Chip tone="purple">Variant</Chip>}</div>}
      foot={<div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span className="vw-label" style={{ flex: '1 1 220px' }}>{editable ? 'Draft: defaults can be edited; publishing makes it available to new plans.' : t.status === 'published' ? (t.kind === 'plan' ? 'Published: start a plan from it, or make a variant to change defaults.' : 'Published: make a variant to change defaults; retire to stop new plans using it.') : 'Retired: existing plans keep it; new plans cannot use it.'}</span>
        <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {editable && !editing && <Btn icon={I.Pencil} onClick={() => setEditing(true)}>Edit defaults</Btn>}
          {editing && <><Btn onClick={() => { setEditing(false); setDraft({}); }}>Cancel</Btn><Btn variant="filled" icon={I.Save} onClick={save}>Save defaults</Btn></>}
          {!editing && <Btn icon={I.GitBranch} onClick={() => setVariant(`${t.name} · variant`)}>Make a variant</Btn>}
          {!editing && editable && <Btn variant="filled" icon={I.CheckCircle2} onClick={() => actions.saveTemplate({ ...t, status: 'published' })}>Publish</Btn>}
          {!editing && t.status === 'published' && <Btn variant="danger-subtle" icon={I.Ban} onClick={() => actions.saveTemplate({ ...t, status: 'deprecated' })}>Retire</Btn>}
          {!editing && t.status === 'deprecated' && <Btn icon={I.RotateCcw} onClick={() => actions.saveTemplate({ ...t, status: 'draft' })}>Reopen as draft</Btn>}
          {!editing && t.kind === 'plan' && t.status === 'published' && <Btn variant="filled" icon={I.Plus} onClick={startPlan}>Start a plan</Btn>}
        </span>
      </div>}>
      <KV cols={3} items={[['Applies to', t.appliesTo.label], ['Becomes a', t.executesAs ?? '—'], ['Owner', t.ownerName], ['Site type', DC_TYPE_CATALOG.find(p => p.key === t.dcTypeKey)?.name ?? '—'], ['Blueprint', t.blueprintKey ? optionLabel('', t.blueprintKey) : '—'], ['Updated', date(t.updatedAt)]]} />
      {chain.length > 1 && <><Sub>Inherits from</Sub><div className="pn-chain">{[...chain].reverse().map((c, i) => <span key={c.id} className="row" style={{ gap: 6 }}>{i > 0 && <I.ChevronRight size={14} />}{c.id === t.id ? <b>{c.name} v{c.version}</b> : <button type="button" className="ent-link" onClick={() => onOpen(c.id)}>{c.name} v{c.version}</button>}</span>)}</div><p className="vw-label" style={{ margin: '6px 0 0' }}>Nearer templates override inputs by key and add rules; this template's own inputs are marked below.</p></>}
      {profile && <><Sub>Typical site</Sub><div className="pn-facts">
        <div><span>Size</span><b>{range(profile.powerKw, kw)}</b></div><div><span>Racks</span><b>{range(profile.typicalRacks, n => num(n))}</b></div><div><span>kW per rack</span><b>{profile.kwPerRack ? `${num(profile.kwPerRack[0])} – ${num(profile.kwPerRack[1])}` : '—'}</b></div>
        <div><span>Cooling</span><b>{profile.cooling}</b></div><div><span>Redundancy</span><b>{profile.redundancy}</b></div><div><span>Tier and PUE</span><b>{profile.defaultTier} · {profile.pueTarget ? num(profile.pueTarget, 2) : '—'}</b></div>
      </div></>}
      {t.kind === 'plan' && <>
        <Sub>Wizard areas</Sub>
        <div className="row wrap" style={{ gap: 6 }}>{dimensionsFor(t).map(({ dim, depth }) => <Chip key={dim.key} tone={depth === 'full' ? 'info' : 'neutral'} size="xs">{dim.label}{depth === 'summary' ? ' · brief' : ''}</Chip>)}</div>
        <div className="pn-two" style={{ marginTop: 12 }}>
          <Panel title="Approval path" icon={I.ShieldCheck}>{t.approvalPath.length ? <ol className="pl-steps">{t.approvalPath.map((s, i) => <li key={i} className="is-pending"><span className="pl-step-n">{i + 1}</span><span className="cell-2"><b>{s}</b><small>{/finance/i.test(s) ? 'Decided by the CapEx band of the scenario under review' : 'From the template'}</small></span></li>)}</ol> : <p className="vw-label">No approval step: plans execute once submitted.</p>}
            {t.executesAs && <p className="vw-label" style={{ margin: '10px 0 0' }}>Once approved it becomes a {t.executesAs}{t.blueprintKey ? ` built from the ${optionLabel('', t.blueprintKey).toLowerCase().replace(/\b(dc|it|ups|gpu)\b/g, w => w.toUpperCase())} blueprint` : ''}.</p>}</Panel>
          <Panel title="Outputs" icon={I.FileText}>{t.outputs.length ? <ul className="pn-list">{t.outputs.map(o => <li key={o}><I.FileCheck size={14} className="muted" /><span>{o}</span></li>)}</ul> : <p className="vw-label">—</p>}</Panel>
        </div>
      </>}
      {t.kind === 'demand' && t.demand && <><Sub>Workload mix and phasing</Sub>
        <StackBar parts={[{ label: 'GPU', pct: t.demand.gpuPct, color: SERIES[0] }, { label: 'Compute', pct: t.demand.computePct, color: SERIES[1] }, { label: 'Storage', pct: t.demand.storagePct, color: SERIES[3] }]} />
        <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>{t.demand.phases.map(p => <Chip key={p.name} tone="neutral" size="xs">{p.name}: {p.sharePct}% at month {p.monthsFromStart}</Chip>)}</div>
      </>}
      {t.items?.length ? <><Sub>{t.kind === 'checklist' ? 'Checks' : 'Sections'}</Sub><ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>{t.items.map(i => <li key={i}>{i}</li>)}</ol></> : null}
      {params.length > 0 && <>
        <Sub extra={<span className="vw-label">{params.length} input{params.length === 1 ? '' : 's'}, all pre-filled · {ownShown} set here</span>}>Inputs and defaults</Sub>
        {hidden > 0 && <p className="vw-label" style={{ margin: '0 0 8px' }}>{hidden} inherited input{hidden === 1 ? '' : 's'} for areas this plan type does not cover {hidden === 1 ? 'is' : 'are'} left out.</p>}
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Input</th><th>Area</th><th>Default</th><th>From</th></tr></thead><tbody>
          {[...params].sort((a, b) => ASPECT_LABEL[a.aspect].localeCompare(ASPECT_LABEL[b.aspect])).map(p => <tr key={p.key}><td><span className="cell-2"><b>{p.label}</b>{p.help && <small>{p.help}</small>}</span></td><td>{ASPECT_LABEL[p.aspect]}</td><td className="num">{paramRow(p)}</td><td>{own.has(p.key) ? <Chip tone="info" size="xs">This template</Chip> : <Chip tone="neutral" size="xs">{chain.find(c => c.params.some(x => x.key === p.key))?.name ?? 'Inherited'}</Chip>}</td></tr>)}
        </tbody></table>
      </>}
      {rules.length > 0 && <>
        <Sub extra={<span className="vw-label">{rules.filter(r => r.severity === 'hard').length} must · {rules.filter(r => r.severity === 'soft').length} should</span>}>Rules checked</Sub>
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>What is checked</th><th>Area</th><th>Severity</th><th>Standard</th></tr></thead><tbody>
          {[...rules].sort((a, b) => a.severity.localeCompare(b.severity)).map(r => <tr key={r.id}><td><span className="cell-2"><b>{RULE_PLAIN[r.check] ?? r.title}</b><small>{RULE_PLAIN[r.check] ? `${r.title} · ` : ''}<span className="mono">{r.id}</span></small></span></td><td>{ASPECT_LABEL[r.aspect]}</td><td><Chip tone={r.severity === 'hard' ? 'error' : 'warning'} size="xs" outline>{r.severity === 'hard' ? 'Must' : 'Should'}</Chip></td><td>{r.standard ?? <span className="vw-label">Internal</span>}</td></tr>)}
        </tbody></table>
      </>}
      <Sub extra={<span className="vw-label">{uses.length} plan{uses.length === 1 ? '' : 's'}</span>}>{t.kind === 'profile' ? 'Plans of this site type' : 'Plans using this template'}</Sub>
      {uses.length ? <ul className="pn-list pn-uses">{uses.map(p => <li key={p.id}><button type="button" className="pn-rowbtn" onClick={() => nav(`/planning/plans/${p.id}`)}><span className="cell-2"><b>{p.title}</b><small className="mono">{p.plnId}{p.templateVersion ? ` · approved on v${p.templateVersion}` : ''}</small></span><PlanStatusChip s={p.status} size="xs" /><I.ChevronRight size={15} className="muted" /></button></li>)}</ul> : <p className="vw-label">No plan uses it yet.</p>}
      <Sub>Versions</Sub>
      {versions.length ? <ul className="pl-hist">{versions.map(a => <li key={a.id}><small>{date(a.timestamp)}</small><span><b>{a.actorName}</b> — {a.summary}</span></li>)}</ul> : <p className="vw-label">v{t.version} · created {date(t.createdAt)} by {t.createdBy}; no change since.</p>}
      <Modal open={variant !== null} onClose={() => setVariant(null)} title="Make a variant" width={460}
        foot={<div className="row" style={{ justifyContent: 'flex-end' }}><Btn onClick={() => setVariant(null)}>Cancel</Btn><Btn variant="filled" disabled={!variant?.trim()} onClick={() => { const rec = actions.cloneTemplate(t, variant!.trim()); setVariant(null); onOpen(rec.id); }}>Create draft</Btn></div>}>
        <p className="vw-label" style={{ margin: '0 0 10px' }}>The variant is a draft that inherits every input, rule and the approval path of {t.name} v{t.version}; override only the defaults that differ, then publish it.</p>
        <Field label="Variant name"><TextInput value={variant ?? ''} onChange={setVariant} /></Field>
      </Modal>
    </Drawer>
  );
}
