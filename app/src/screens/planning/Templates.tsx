/* Planner → Templates: the plan types, site types and modules (aspect modules, rule sets, demand profiles, documents, checklists)
   the wizard is built from, one panel per view with a plain explanation. A template opens in a drawer whose id lives in the URL
   (?template=, also reached from /planning/templates/:id), so it can be linked and browser back closes it. The drawer shows the
   inheritance chain, areas, approval path, inputs, rules, variants, the plans that use it, and its versions and history.
   Lifecycle (planner/lib/templateCatalog.ts, editor in templateEditor.tsx): New plan type / New module (copy, variant or blank) =
   a draft v1; a published template is never edited in place — Edit opens its next version as a draft beside it, and publishing
   replaces the live version (kept in Versions; plans pinned to it keep it). A version of a template in use goes to a second
   template approver. Retire (with reason, lists the plans and variants that keep it) / Restore; drafts can be deleted. */
import { useMemo, useState } from 'react';
import { KIND_LABEL, NewTemplateModal, PublishSection, TemplateEditor, VersionsSection, fmtDefault, optionLabel, type NewPreset } from './templateEditor';
import { SITE_TYPE_FIELDS, dependents, draftVersionOf, liveTemplates, moduleBrings, usesModule } from '../../planner/lib/templateCatalog';
import { NewSiteTypeModal } from './siteTypeEditor';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { DataTable, type Col } from '../../ui/DataTable';
import { Btn, Chip, Drawer, Empty, KV, Panel, Seg } from '../../ui/kit';
import { usePlannerActions, usePlans, useTemplates } from '../../planner/lib/usePlanner';
import { MODULE_KINDS, resolveTemplate } from '../../planner/lib/engine';
import { dimensionsFor } from '../../planner/lib/dimensions';
import { RULE_PLAIN } from '../../planner/lib/labels';
import { DC_TYPE_CATALOG, type DcTypeProfile } from '../../planner/p2b/dcTypes';
import type * as T from '../../planner/p2b/types';
import { Sub } from './parts';
import { CardGrid, ModuleCard, PlanTypeCard, SiteTypeCard, useListLayout } from './cards';
import { ASPECT_LABEL, PlanStatusChip, ReasonModal, SCOPE_LABEL, TemplateStatusChip, date, kw, num, type ReasonRequest } from './common';
import { StackBar, Tip } from './charts/library';
import { SERIES } from './charts/chartKit';

type View = 'plans' | 'sites' | 'modules';
const viewOf = (k: T.PlannerTemplateKind): View => (k === 'plan' ? 'plans' : k === 'profile' ? 'sites' : 'modules');
const STATUS_LABEL: Record<T.PlannerTemplate['status'], string> = { published: 'Published', draft: 'Draft', deprecated: 'Retired' };
const INTRO: Record<View, { title: string; sub: string; noun: string; icon: typeof I.LayoutTemplate }> = {
  plans: { title: 'Plan types', noun: 'plan types', icon: I.LayoutTemplate, sub: 'Pick one when you start a plan. It decides which areas you must cover, what the approved plan becomes and who approves it. Open one to see its inputs and checks.' },
  sites: { title: 'Site types', noun: 'site types', icon: I.Building2, sub: 'The kind of site being planned. It sets the typical size, density, cooling, tier and PUE, and which benchmarks apply. Smallest first.' },
  modules: { title: 'Modules & rules', noun: 'modules', icon: I.Blocks, sub: 'For template owners: reusable design modules, rule sets, demand profiles, documents and checklists that plan types are built from.' },
};

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
  const [layout, setLayout] = useListLayout('templates');
  /* the drawer lives in the URL: opening pushes a history entry (back closes it), closing pops it when we pushed it */
  const openTpl = (id: string) => { const n = new URLSearchParams(sp); n.set('template', id); setSp(n, { state: { tplOpen: true } }); };
  const closeTpl = () => { if ((loc.state as { tplOpen?: boolean } | null)?.tplOpen) nav(-1); else { const n = new URLSearchParams(sp); n.delete('template'); setSp(n, { replace: true }); } };

  const byId = useMemo(() => new Map(templates.map(t => [t.id, t])), [templates]);
  // The benchmark set is the Benchmarks library itself (each value versioned there), not a template anyone builds from.
  const live = useMemo(() => liveTemplates(templates).filter(t => t.kind !== 'benchmarkset'), [templates]);
  const drafts = useMemo(() => new Map(templates.filter(t => t.versionOf).map(t => [t.versionOf!, t])), [templates]);
  const [newTpl, setNewTpl] = useState<NewPreset | null>(null);
  const Status = ({ t }: { t: T.PlannerTemplate }) => { const d = drafts.get(t.id); return <span className="row pn-nowrap" style={{ gap: 4 }}><TemplateStatusChip s={t.status} />{t.pendingPublish && <Chip size="xs" tone="info" outline>Awaiting approval</Chip>}{d && <Chip size="xs" tone={d.pendingPublish ? 'info' : 'neutral'} outline>{d.pendingPublish ? `v${d.version} awaiting approval` : `Draft v${d.version}`}</Chip>}</span>; };
  const uses = useMemo(() => { const m = new Map<string, number>(); for (const p of plans) { m.set(p.templateId, (m.get(p.templateId) ?? 0) + 1); if (p.dcTypeKey) m.set(`type:${p.dcTypeKey}`, (m.get(`type:${p.dcTypeKey}`) ?? 0) + 1); } return m; }, [plans]);
  const match = (text: string) => !q || text.toLowerCase().includes(q.toLowerCase());
  const tplRows = useMemo<TplRow[]>(() => live.filter(t => viewOf(t.kind) === view && view !== 'sites').map(t => ({ ...t, uses: uses.get(t.id) ?? 0 })), [live, uses, view]);
  const profiles = useMemo(() => new Map(live.filter(t => t.kind === 'profile').map(t => [t.dcTypeKey, t])), [live]);
  /* the catalogue (built-ins + published custom types) plus custom types still in their first draft */
  const siteRows = useMemo<SiteRow[]>(() => [...DC_TYPE_CATALOG, ...live.filter(t => t.kind === 'profile' && t.siteType && !DC_TYPE_CATALOG.some(p => p.key === t.siteType!.key)).map(t => ({ ...t.siteType!, name: t.name }))].sort((a, b) => a.powerKw[0] - b.powerKw[0] || (a.powerKw[1] ?? 1e12) - (b.powerKw[1] ?? 1e12)).map(p => ({ ...p, id: p.key, profile: profiles.get(p.key), uses: uses.get(`type:${p.key}`) ?? 0 })), [profiles, uses, live]);
  const shownTpl = tplRows.filter(t => (!status || t.status === status) && match(`${t.name} ${t.description} ${t.labels.join(' ')}`));
  const shownSites = siteRows.filter(p => (!status || p.profile?.status === status) && match(`${p.name} ${p.description} ${p.segment} ${p.cooling}`));
  const totals: Record<View, number> = { plans: live.filter(t => t.kind === 'plan').length, sites: siteRows.length, modules: live.filter(t => viewOf(t.kind) === 'modules').length };
  const statuses = view === 'sites' ? siteRows.map(p => p.profile?.status) : tplRows.map(t => t.status);
  const name2 = (title: string, sub?: React.ReactNode) => <span className="cell-2 pn-name-cell"><b>{title}</b>{sub && <small>{sub}</small>}</span>;

  const planCols: Col<TplRow>[] = [
    { key: 'name', header: 'Plan type', sort: t => t.name, wrap: true, render: t => name2(t.name, <>{t.inheritsFrom ? `Variant of ${byId.get(t.inheritsFrom)?.name ?? 'a standard'} · ` : ''}{t.description}</>) },
    { key: 'covers', header: 'Areas covered', sort: t => t.requiredAspects.filter(x => x.depth === 'full').length, render: t => { const full = t.requiredAspects.filter(x => x.depth === 'full'), brief = t.requiredAspects.filter(x => x.depth === 'summary');
      return <Tip className="is-dotted" content={{ title: `${t.name} covers`, rows: [['In full', String(full.length)], ['Brief', String(brief.length)]], note: [full.length ? `In full: ${full.map(x => ASPECT_LABEL[x.aspect]).join(', ')}.` : '', brief.length ? ` Brief: ${brief.map(x => ASPECT_LABEL[x.aspect]).join(', ')}.` : ''].join('') }}><span className="pn-nowrap">{full.length} in full{brief.length ? <span className="vw-label">, {brief.length} brief</span> : null}</span></Tip>; } },
    { key: 'becomes', header: 'Becomes', sort: t => t.executesAs ?? '', render: t => <span className="pn-nowrap">{t.executesAs ? `A ${t.executesAs}` : '—'}</span> },
    { key: 'appr', header: 'Approved by', wrap: true, render: t => (t.approvalPath.length ? <span className="pn-appr">{t.approvalPath.join(' → ')}</span> : <span className="vw-label">No approval</span>) },
    { key: 'uses', header: 'Plans', sort: t => t.uses, render: t => <span className="num">{t.uses}</span> },
    { key: 'status', header: 'Status', sort: t => t.status, render: t => <Status t={t} /> },
    { key: 'v', header: 'Version', sort: t => t.version, render: t => <span className="mono">v{t.version}</span> },
  ];
  const siteCols: Col<SiteRow>[] = [
    { key: 'name', header: 'Site type', sort: p => p.name, wrap: true, render: p => name2(p.name, p.basedOn ? `${p.segment} · custom, based on ${DC_TYPE_CATALOG.find(x => x.key === p.basedOn)?.name ?? p.basedOn}` : p.segment) },
    { key: 'size', header: 'Typical size', sort: p => p.powerKw[0], render: p => <span className="num pn-nowrap">{range(p.powerKw, kw)}</span> },
    { key: 'racks', header: 'Racks', sort: p => p.typicalRacks[0], render: p => <span className="num pn-nowrap">{range(p.typicalRacks, n => num(n))}</span> },
    { key: 'kwr', header: 'kW per rack', sort: p => p.kwPerRack?.[1] ?? 0, render: p => <span className="num pn-nowrap">{p.kwPerRack ? `${num(p.kwPerRack[0])} – ${num(p.kwPerRack[1])}` : '—'}</span> },
    { key: 'cooling', header: 'Cooling', wrap: true, render: p => <span style={{ fontSize: 12.5 }}>{p.cooling}</span> },
    { key: 'tier', header: 'Tier', sort: p => p.defaultTier, render: p => <span className="pn-nowrap">{p.defaultTier}</span> },
    { key: 'pue', header: 'PUE target', sort: p => p.pueTarget ?? 0, render: p => <span className="num">{p.pueTarget ? num(p.pueTarget, 2) : '—'}</span> },
    { key: 'uses', header: 'Plans', sort: p => p.uses, render: p => <span className="num">{p.uses}</span> },
    { key: 'status', header: 'Status', sort: p => p.profile?.status ?? '', render: p => (p.profile ? <Status t={p.profile} /> : <span className="vw-label">No profile</span>) },
  ];
  const usedBy = useMemo(() => { const m = new Map<string, T.PlannerTemplate[]>(); if (view !== 'modules') return m; for (const t of tplRows) if (MODULE_KINDS.includes(t.kind)) m.set(t.id, live.filter(x => x.kind === 'plan' && usesModule(x, t.id, templates))); return m; }, [tplRows, live, templates, view]);
  const modCols: Col<TplRow>[] = [
    { key: 'name', header: 'Name', sort: t => t.name, wrap: true, render: t => name2(t.name, t.description) },
    { key: 'kind', header: 'Kind', sort: t => KIND_LABEL[t.kind], render: t => <span className="pn-nowrap">{KIND_LABEL[t.kind]}</span> },
    { key: 'usedby', header: 'Used by', sort: t => usedBy.get(t.id)?.length ?? -1, render: t => { const u = usedBy.get(t.id); if (!u) return <span className="vw-label">—</span>; return u.length ? <Tip className="is-dotted" content={{ title: `${u.length} plan type${u.length === 1 ? '' : 's'} built from it`, rows: [], note: u.map(x => x.name).join(', ') }}><span className="pn-nowrap">{u.length} plan type{u.length === 1 ? '' : 's'}</span></Tip> : <span className="vw-label">Not used</span>; } },
    { key: 'status', header: 'Status', sort: t => t.status, render: t => <Status t={t} /> },
    { key: 'v', header: 'Version', sort: t => t.version, render: t => <span className="mono">v{t.version}</span> },
  ];

  const intro = INTRO[view];
  const shownCount = view === 'sites' ? shownSites.length : shownTpl.length;
  const toolbar = <ListToolbar layout={{ value: layout, onChange: setLayout }} shown={shownCount} total={totals[view]} noun={intro.noun} onApply={apply} search={{ value: q, onChange: v => apply({ q: v }), placeholder: view === 'sites' ? 'Name, segment, cooling' : 'Name, description, label' }}
    filters={[{ id: 'status', label: 'Status', quick: true, value: status, anyLabel: 'Any status', onChange: v => apply({ status: v }), options: (['published', 'draft', 'deprecated'] as const).filter(s => s === status || statuses.includes(s)).map(s => ({ id: s, label: STATUS_LABEL[s], count: statuses.filter(x => x === s).length })) }]} />;
  const empty = <Empty icon={intro.icon} title={`No ${intro.noun} match`} action={(q || status) ? <Btn onClick={() => apply({ q: '', status: '' })}>Clear filters</Btn> : undefined}>Clear the search or the status filter to see every one.</Empty>;
  const open = openId ? byId.get(openId) : undefined;
  return (
    <div className="pn-lib">
      <Panel flush className="pl-tpl" title={intro.title} sub={intro.sub} icon={intro.icon} count={totals[view]} info="Templates make the planner consistent: a plan type fixes the questions, rules and approvers; a site type sets typical sizes and the benchmarks that apply; modules are the reusable parts plan types are built from."
        actions={<span className="row" style={{ gap: 8 }}><Btn size="sm" variant="filled" icon={I.Plus} onClick={() => setNewTpl(view === 'sites' ? { kind: 'profile' } : {})}>{view === 'plans' ? 'New plan type' : view === 'sites' ? 'New site type' : 'New module'}</Btn><Seg<View> size="sm" value={view} onChange={v => apply({ view: v === 'plans' ? '' : v, status: '', q: '' })} options={[{ id: 'plans', label: `Plan types · ${totals.plans}` }, { id: 'sites', label: `Site types · ${totals.sites}` }, { id: 'modules', label: `Modules & rules · ${totals.modules}` }]} /></span>}>
        {layout === 'tiles'
          ? <CardGrid toolbar={toolbar} empty={empty}>{view === 'sites'
            ? shownSites.map(p => <SiteTypeCard key={p.id} p={p} uses={p.uses} status={p.profile?.status} range={range} onOpen={p.profile ? () => openTpl(p.profile!.id) : undefined} />)
            : view === 'plans'
              ? shownTpl.map(t => <PlanTypeCard key={t.id} t={t} uses={t.uses} variantOf={t.inheritsFrom ? byId.get(t.inheritsFrom)?.name ?? 'a standard' : undefined} aspects={a => ASPECT_LABEL[a]} onOpen={() => openTpl(t.id)} />)
              : [...shownTpl].sort((a, b) => KIND_LABEL[a.kind].localeCompare(KIND_LABEL[b.kind])).map(t => <ModuleCard key={t.id} t={t} kind={KIND_LABEL[t.kind]} onOpen={() => openTpl(t.id)} />)}</CardGrid>
          : view === 'sites'
          ? <DataTable<SiteRow> rows={shownSites} cols={siteCols} pageSize={25} onRow={p => { if (p.profile) openTpl(p.profile.id); }} toolbar={toolbar} empty={empty} />
          : <DataTable<TplRow> rows={shownTpl} cols={view === 'plans' ? planCols : modCols} pageSize={25} defaultSort={view === 'modules' ? { key: 'kind', dir: 'asc' } : undefined} onRow={t => openTpl(t.id)} toolbar={toolbar} empty={empty} />}
      </Panel>
      {open && <TemplateDrawer key={open.id} t={open} onClose={closeTpl} onOpen={openTpl} onNew={setNewTpl} />}
      {newTpl && (newTpl.kind === 'profile'
        ? <NewSiteTypeModal base={newTpl.source?.dcTypeKey} onClose={() => setNewTpl(null)} onCreated={id => { setNewTpl(null); EDIT_ON_OPEN.id = id; openTpl(id); }} />
        : <NewTemplateModal view={view} preset={newTpl} onClose={() => setNewTpl(null)} onCreated={id => { setNewTpl(null); EDIT_ON_OPEN.id = id; openTpl(id); }} />)}
    </div>
  );
}

/** A template opened right after it was created (or its draft version opened from Edit) starts in the editor. */
const EDIT_ON_OPEN: { id?: string } = {};

function TemplateDrawer({ t, onClose, onOpen, onNew }: { t: T.PlannerTemplate; onClose: () => void; onOpen: (id: string) => void; onNew: (p: NewPreset) => void }) {
  const nav = useNavigate();
  const templates = useTemplates();
  const plans = usePlans();
  const actions = usePlannerActions();
  const [editing, setEditing] = useState(() => { const on = EDIT_ON_OPEN.id === t.id; EDIT_ON_OPEN.id = undefined; return on && t.status === 'draft'; });
  const [ask, setAsk] = useState<ReasonRequest | null>(null);
  const resolved = resolveTemplate(t.id, templates);
  const chain = resolved?.chain ?? [t];
  /* a plan type asks only for the areas it covers */
  const allParams = resolved?.params ?? t.params;
  const covered = coveredAspects(t);
  const params = t.kind === 'plan' && covered.size ? allParams.filter(p => covered.has(p.aspect)) : allParams;
  const hidden = allParams.length - params.length;
  const rules = resolved?.rules ?? t.rules;
  const mods = resolved?.modules ?? [];
  const own = new Set(t.params.map(p => p.key));
  /* where an inherited input comes from: the nearest template in the chain, else the module that carries it (later modules win) */
  const srcOf = (key: string) => chain.find(c => c.params.some(x => x.key === key))?.name ?? [...mods].reverse().find(m => m.params.some(x => x.key === key))?.name ?? 'Inherited';
  const ownShown = params.filter(p => own.has(p.key)).length;
  const profile = t.kind === 'profile' ? t.siteType ?? DC_TYPE_CATALOG.find(p => p.key === t.dcTypeKey) : undefined;
  const liveRec = t.versionOf ? templates.find(x => x.id === t.versionOf) : undefined;
  const draftV = t.versionOf ? undefined : draftVersionOf(t, templates);
  const dep = dependents(liveRec ?? t, templates, plans);
  const uses = dep.plans;
  const isDraft = t.status === 'draft';
  const edit = () => { if (isDraft) { setEditing(true); document.querySelector('.drawer:last-of-type .drawer-body')?.scrollTo(0, 0); return; } const d = actions.startTemplateVersion(t); EDIT_ON_OPEN.id = d.id; onOpen(d.id); };
  const retire = () => setAsk({ title: `Retire ${t.name}?`, okText: 'Retire template', danger: true, needsReason: true, placeholder: 'Why it is retired (kept in its history)',
    description: <>New plans cannot pick it any more. {dep.plans.length ? `${dep.plans.length} plan(s) on it keep working (${dep.open.length} still open)` : 'No plan uses it'}{dep.variants.length ? `; ${dep.variants.length} variant(s) still inherit from it: ${dep.variants.map(v => v.name).join(', ')}` : ''}{dep.usedBy.length ? `; ${dep.usedBy.length} plan type(s) are built from it and keep it: ${dep.usedBy.map(v => v.name).join(', ')}` : ''}. You can restore it later.</>,
    onOk: r => actions.retireTemplate(t, r) });
  const discard = () => setAsk({ title: t.versionOf ? `Discard draft v${t.version}?` : `Delete ${t.name}?`, okText: t.versionOf ? 'Discard draft' : 'Delete draft', danger: true, needsReason: false,
    description: t.versionOf ? `The live v${liveRec?.version} is unchanged.` : 'The draft is removed; its history line stays in the audit log.',
    onOk: () => { if (actions.discardTemplateDraft(t).ok) { if (liveRec) onOpen(liveRec.id); else onClose(); } } });
  const startPlan = () => nav(`/planning/new?${new URLSearchParams({ ...(t.scope ? { scope: t.scope } : {}), template: t.id })}`);
  const footNote = editing ? 'Editing the draft: save to keep the changes; publishing comes after.'
    : t.versionOf ? `Draft v${t.version} of ${liveRec?.name ?? 'a template'}: v${liveRec?.version} keeps serving plans until this is published.`
    : isDraft ? 'Draft: no plan can use it until it is published.'
    : t.status === 'published' ? 'Published: Edit opens the next version as a draft; plans keep this one until it is published.'
    : 'Retired: existing plans keep it; new plans cannot use it.';
  return (
    <Drawer open onClose={onClose} width={820} title={t.name} sub={t.description}
      head={<div className="row wrap" style={{ gap: 6, marginTop: 8 }}><Chip tone="neutral">{KIND_LABEL[t.kind]}</Chip><TemplateStatusChip s={t.status} /><Chip tone="neutral">v{t.version}</Chip>{t.scope && <Chip tone="info">{SCOPE_LABEL[t.scope]}</Chip>}{t.inheritsFrom && <Chip tone="purple">Variant</Chip>}{t.pendingPublish && <Chip tone="info" outline>Awaiting approval</Chip>}</div>}
      foot={editing ? undefined : <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span className="vw-label" style={{ flex: '1 1 220px' }}>{footNote}</span>
        <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {isDraft && !t.pendingPublish && <Btn icon={I.Trash2} onClick={discard}>{t.versionOf ? 'Discard draft' : 'Delete draft'}</Btn>}
          {!isDraft && <Btn icon={I.Copy} onClick={() => onNew({ kind: t.kind, source: t, mode: 'copy' })}>{t.kind === 'profile' ? 'New site type from this' : 'Duplicate'}</Btn>}
          {!isDraft && t.kind !== 'profile' && <Btn icon={I.GitBranch} onClick={() => onNew({ kind: t.kind, source: t, mode: 'variant' })}>Make a variant</Btn>}
          {t.status === 'published' && <Btn variant="danger-subtle" icon={I.Ban} onClick={retire}>Retire</Btn>}
          {t.status === 'deprecated' && <Btn icon={I.RotateCcw} onClick={() => actions.restoreTemplate(t)}>Restore</Btn>}
          {draftV ? <Btn icon={I.FilePen} onClick={() => onOpen(draftV.id)}>Open draft v{draftV.version}</Btn> : !t.pendingPublish && <Btn variant={isDraft ? 'filled' : undefined} icon={I.Pencil} onClick={edit}>{isDraft ? 'Edit draft' : 'Edit'}</Btn>}
          {t.kind === 'plan' && t.status === 'published' && <Btn variant="filled" icon={I.Plus} onClick={startPlan}>Start a plan</Btn>}
        </span>
      </div>}>
      {t.versionOf && liveRec && <div className="pn-bm-note is-info" style={{ marginBottom: 12 }}><I.GitCommitVertical size={15} /><span>Draft <b>v{t.version}</b> of {liveRec.name}. v{liveRec.version} stays live for {dep.plans.length} plan(s) until this is published.</span><Btn size="sm" onClick={() => onOpen(liveRec.id)}>Open v{liveRec.version}</Btn></div>}
      {draftV && <div className="pn-bm-note is-info" style={{ marginBottom: 12 }}><I.FilePen size={15} /><span>Draft <b>v{draftV.version}</b> is being prepared{draftV.updatedBy ? ` by ${draftV.updatedBy}` : ''}{draftV.pendingPublish ? ' and is waiting for approval' : ''}. Plans use v{t.version} until it is published.</span><Btn size="sm" onClick={() => onOpen(draftV.id)}>Open draft</Btn></div>}
      {t.status === 'deprecated' && <div className="pn-bm-note is-muted" style={{ marginBottom: 12 }}><I.Archive size={15} /><span>Retired{t.retiredBy ? ` by ${t.retiredBy}` : ''}{t.retiredAt ? ` on ${date(t.retiredAt)}` : ''}{t.retireReason ? `: ${t.retireReason}` : ''}. New plans cannot pick it.</span></div>}
      {editing ? <TemplateEditor t={t} onDone={() => { setEditing(false); document.querySelector('.drawer:last-of-type .drawer-body')?.scrollTo(0, 0); }} /> : <>
      {isDraft && <PublishSection t={t} ask={setAsk} onPublished={() => { if (liveRec) onOpen(liveRec.id); }} />}
      <KV cols={3} items={[['Applies to', t.appliesTo.label], ['Becomes a', t.executesAs ?? '—'], ['Owner', t.ownerName], ['Site type', (t.siteType ?? DC_TYPE_CATALOG.find(p => p.key === t.dcTypeKey))?.name ?? '—'], ['Blueprint', t.blueprintKey ? optionLabel('', t.blueprintKey) : '—'], ['Updated', date(t.updatedAt)]]} />
      {chain.length > 1 && <><Sub>Inherits from</Sub><div className="pn-chain">{[...chain].reverse().map((c, i) => <span key={c.id} className="row" style={{ gap: 6 }}>{i > 0 && <I.ChevronRight size={14} />}{c.id === t.id ? <b>{c.name} v{c.version}</b> : <button type="button" className="ent-link" onClick={() => onOpen(c.id)}>{c.name} v{c.version}</button>}</span>)}</div><p className="vw-label" style={{ margin: '6px 0 0' }}>Nearer templates override inputs by key and add rules; this template's own inputs are marked below.</p></>}
      {mods.length > 0 && <><Sub extra={<span className="vw-label">{mods.length}</span>}>Built from modules</Sub><div className="pn-te-mods is-read">{mods.map(m => <button key={m.id} type="button" onClick={() => onOpen(m.id)}><Chip size="xs" tone="neutral">{KIND_LABEL[m.kind]}</Chip><b>{m.name} v{m.version}</b><small>{moduleBrings(m, templates)}{!(t.modules ?? []).includes(m.id) ? ` · via ${chain.slice(1).find(c => c.modules?.includes(m.id))?.name ?? 'the parent'}` : ''}</small></button>)}</div><p className="vw-label" style={{ margin: '6px 0 0' }}>Their inputs and rules apply unless this plan type{chain.length > 1 ? ' or its parent' : ''} sets its own copy.</p></>}
      {MODULE_KINDS.includes(t.kind) && !t.versionOf && <><Sub extra={<span className="vw-label">{dep.usedBy.length}</span>}>Used by plan types</Sub>{dep.usedBy.length ? <div className="row wrap" style={{ gap: 6 }}>{dep.usedBy.map(v => <button key={v.id} type="button" className="ent-link" onClick={() => onOpen(v.id)}>{v.name} v{v.version}</button>)}</div> : <p className="vw-label" style={{ margin: 0 }}>No plan type is built from it yet. Add it to a plan type in that plan type's editor (Modules).</p>}</>}
      {dep.variants.length > 0 && <><Sub extra={<span className="vw-label">{dep.variants.length}</span>}>Variants that inherit from it</Sub><div className="row wrap" style={{ gap: 6 }}>{dep.variants.map(v => <button key={v.id} type="button" className="ent-link" onClick={() => onOpen(v.id)}>{v.name} v{v.version}</button>)}</div></>}
      {profile && <><Sub>Typical site</Sub><div className="pn-facts">
        <div><span>Size</span><b>{range(profile.powerKw, kw)}</b></div><div><span>Racks</span><b>{range(profile.typicalRacks, n => num(n))}</b></div><div><span>kW per rack</span><b>{profile.kwPerRack ? `${num(profile.kwPerRack[0])} – ${num(profile.kwPerRack[1])}` : '—'}</b></div>
        <div><span>Cooling</span><b>{profile.cooling}</b></div><div><span>Redundancy</span><b>{profile.redundancy}</b></div><div><span>Tier and PUE</span><b>{profile.defaultTier} · {profile.pueTarget ? num(profile.pueTarget, 2) : '—'}</b></div>
      </div></>}
      {t.siteType && <><Sub extra={<span className="vw-label">custom{t.siteType.basedOn ? `, based on ${DC_TYPE_CATALOG.find(x => x.key === t.siteType!.basedOn)?.name ?? t.siteType.basedOn}` : ''}</span>}>Site type definition</Sub>
        <KV cols={3} items={SITE_TYPE_FIELDS.map(([l, f]) => [l, f(t.siteType!)] as [string, string])} />
        <p className="vw-label" style={{ margin: '6px 0 0' }}>{t.status === 'draft' && !t.versionOf ? 'Once published, new plans can pick it as their kind of site; benchmarks with no value of its own use the type it was based on.' : t.status === 'deprecated' ? 'Retired: plans on it keep it; new plans cannot pick it.' : 'New plans can pick it as their kind of site. The planner sizes, prices and schedules it from these values; benchmarks with no value of its own use the type it was based on.'}</p></>}
      {t.kind === 'plan' && <>
        <Sub>Wizard areas</Sub>
        <div className="row wrap" style={{ gap: 6 }}>{dimensionsFor(t).map(({ dim, depth }) => <Chip key={dim.key} tone={depth === 'full' ? 'info' : 'neutral'} size="xs">{dim.label}{depth === 'summary' ? ' · brief' : ''}</Chip>)}</div>
        <div className="pn-two" style={{ marginTop: 12 }}>
          <Panel title="Approval path" icon={I.ShieldCheck}>{t.approvalPath.length ? <ol className="pl-steps">{t.approvalPath.map((s, i) => <li key={i} className="is-pending"><span className="pl-step-n">{i + 1}</span><span className="cell-2"><b>{s}</b><small>{/finance/i.test(s) ? 'Decided by the CapEx band of the scenario under review' : 'From the template'}</small></span></li>)}</ol> : <p className="vw-label">No approval step: plans go to the default path.</p>}
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
          {[...params].sort((a, b) => ASPECT_LABEL[a.aspect].localeCompare(ASPECT_LABEL[b.aspect])).map(p => <tr key={p.key}><td><span className="cell-2"><b>{p.label}</b>{p.help && <small>{p.help}</small>}</span></td><td>{ASPECT_LABEL[p.aspect]}</td><td className="num">{fmtDefault(p)}</td><td>{own.has(p.key) ? <Chip tone="info" size="xs">This template</Chip> : <Chip tone="neutral" size="xs">{srcOf(p.key)}</Chip>}</td></tr>)}
        </tbody></table>
      </>}
      {rules.length > 0 && <>
        <Sub extra={<span className="vw-label">{rules.filter(r => r.severity === 'hard').length} must · {rules.filter(r => r.severity === 'soft').length} should</span>}>Rules checked</Sub>
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>What is checked</th><th>Area</th><th>Severity</th><th>Standard</th></tr></thead><tbody>
          {[...rules].sort((a, b) => a.severity.localeCompare(b.severity)).map(r => <tr key={r.id}><td><span className="cell-2"><b>{RULE_PLAIN[r.check] ?? r.title}</b><small>{RULE_PLAIN[r.check] ? `${r.title} · ` : ''}<span className="mono">{r.id}</span></small></span></td><td>{ASPECT_LABEL[r.aspect]}</td><td><Chip tone={r.severity === 'hard' ? 'error' : 'warning'} size="xs" outline>{r.severity === 'hard' ? 'Must' : 'Should'}</Chip></td><td>{r.standard ?? <span className="vw-label">Internal</span>}</td></tr>)}
        </tbody></table>
      </>}
      <Sub extra={<span className="vw-label">{uses.length} plan{uses.length === 1 ? '' : 's'}</span>}>{t.kind === 'profile' ? 'Plans of this site type' : 'Plans using this template'}</Sub>
      {uses.length ? <ul className="pn-list pn-uses">{uses.map(p => <li key={p.id}><button type="button" className="pn-rowbtn" onClick={() => nav(`/planning/plans/${p.id}`)}><span className="cell-2"><b>{p.title}</b><small className="mono">{p.plnId}{p.templateVersion ? ` · on v${p.templateVersion}` : ''}</small></span><PlanStatusChip s={p.status} size="xs" /><I.ChevronRight size={15} className="muted" /></button></li>)}</ul> : <p className="vw-label">No plan uses it yet.</p>}
      {!t.versionOf && <><Sub>Versions and history</Sub><VersionsSection t={t} /></>}
      </>}
      <ReasonModal req={ask} onClose={() => setAsk(null)} />
    </Drawer>
  );
}
