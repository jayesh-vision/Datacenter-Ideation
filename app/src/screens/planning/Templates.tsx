/* Planner → Templates: the plan types, site-type profiles and modules (aspect modules, rule sets, demand profiles, documents,
   checklists) the wizard is built from. A template is viewed in a drawer: inheritance, areas, approval path, inputs with their
   defaults, rules, plans using it, versions. Lifecycle: draft → published → retired; defaults are edited on drafts only and every
   content change bumps the version (plans keep the version they were approved on). "Make a variant" starts a draft that inherits. */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { DataTable, type Col } from '../../ui/DataTable';
import { Btn, Chip, Drawer, Field, KV, Modal, Panel, Seg, Toggle } from '../../ui/kit';
import { useEntityList } from '../../planner/compat/useEntityCRUD';
import { usePlannerActions, usePlans, useTemplates } from '../../planner/lib/usePlanner';
import { resolveTemplate } from '../../planner/lib/engine';
import { dimensionsFor } from '../../planner/lib/dimensions';
import { DC_TYPE_CATALOG } from '../../planner/p2b/dcTypes';
import type * as T from '../../planner/p2b/types';
import { Sub } from './parts';
import { ASPECT_LABEL, NumInput, SCOPE_LABEL, SelectInput, TemplateStatusChip, TextInput, date, fmtValue } from './common';

type View = 'plans' | 'sites' | 'modules';
const KIND_LABEL: Record<T.PlannerTemplateKind, string> = { profile: 'Site type', plan: 'Plan type', aspect: 'Aspect module', ruleset: 'Rule set', benchmarkset: 'Benchmark set', demand: 'Demand profile', document: 'Document', checklist: 'Checklist', blueprint: 'Blueprint' };
const viewOf = (k: T.PlannerTemplateKind): View => (k === 'plan' ? 'plans' : k === 'profile' ? 'sites' : 'modules');

export function TemplatesTab() {
  const [sp] = useSearchParams();
  const apply = useParamPatch();
  const templates = useTemplates();
  const plans = usePlans();
  const view = (sp.get('view') as View) || 'plans';
  const q = sp.get('q') ?? '', status = sp.get('status') ?? '';
  const [openId, setOpenId] = useState<string | null>(sp.get('template'));
  const rows = useMemo(() => templates.filter(t => viewOf(t.kind) === view).map(t => ({ ...t, uses: plans.filter(p => p.templateId === t.id).length, areas: t.requiredAspects.filter(a => a.depth !== 'skipped').length })), [templates, plans, view]);
  const shown = rows.filter(t => (!status || t.status === status) && (!q || `${t.name} ${t.description} ${t.labels.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  const cols: Col<typeof rows[number]>[] = [
    { key: 'name', header: 'Template', sort: t => t.name, render: t => <span className="cell-2"><b>{t.name}</b><small>{t.description}</small></span>, wrap: true },
    ...(view === 'modules' ? [{ key: 'kind', header: 'Kind', sort: (t: typeof rows[number]) => t.kind, render: (t: typeof rows[number]) => KIND_LABEL[t.kind] }] : []),
    ...(view === 'plans' ? [{ key: 'scope', header: 'Plan type', sort: (t: typeof rows[number]) => t.scope ?? '', render: (t: typeof rows[number]) => (t.scope ? SCOPE_LABEL[t.scope] : '—') }, { key: 'areas', header: 'Areas', sort: (t: typeof rows[number]) => t.areas, render: (t: typeof rows[number]) => `${dimensionsFor(t).length} steps · ${t.areas} aspects` }, { key: 'appr', header: 'Approved by', render: (t: typeof rows[number]) => t.approvalPath.join(' → ') || '—', wrap: true }] : []),
    ...(view === 'sites' ? [{ key: 'seg', header: 'Segment', render: (t: typeof rows[number]) => DC_TYPE_CATALOG.find(p => p.key === t.dcTypeKey)?.segment ?? '—' }, { key: 'dens', header: 'Density', render: (t: typeof rows[number]) => fmtValue(t.params.find(p => p.key === 'densityKwPerRack')?.default, 'kW/rack') }, { key: 'pue', header: 'PUE target', render: (t: typeof rows[number]) => fmtValue(t.params.find(p => p.key === 'pueTarget')?.default) }] : []),
    { key: 'applies', header: 'Applies to', render: t => t.appliesTo.label },
    { key: 'status', header: 'Status', sort: t => t.status, render: t => <TemplateStatusChip s={t.status} /> },
    { key: 'v', header: 'Version', sort: t => t.version, render: t => <span className="mono">v{t.version}</span> },
    { key: 'uses', header: 'Plans', sort: t => t.uses, render: t => <span className="num">{t.uses}</span> },
    { key: 'owner', header: 'Owner', render: t => t.ownerName, hideBelow: 1360 },
    { key: 'upd', header: 'Updated', sort: t => t.updatedAt, render: t => date(t.updatedAt) },
  ];
  const open = templates.find(t => t.id === openId);
  return (
    <section className="vw-card-section dcl-table">
      <DataTable rows={shown} cols={cols} pageSize={25} defaultSort={{ key: 'name', dir: 'asc' }} onRow={t => setOpenId(t.id)}
        toolbar={<ListToolbar shown={shown.length} total={rows.length} noun="templates" onApply={apply} search={{ value: q, onChange: v => apply({ q: v }), placeholder: 'Name, description, label' }}
          filters={[{ id: 'status', label: 'Status', quick: true, value: status, anyLabel: 'Any status', onChange: v => apply({ status: v }), options: (['published', 'draft', 'deprecated'] as const).filter(s => rows.some(t => t.status === s)).map(s => ({ id: s, label: s === 'deprecated' ? 'Retired' : s[0].toUpperCase() + s.slice(1), count: rows.filter(t => t.status === s).length })) }]}
          actions={[]}>
          <Seg<View> size="sm" value={view} onChange={v => apply({ view: v, status: '', q: '' })} options={[{ id: 'plans', label: 'Plan types' }, { id: 'sites', label: 'Site types' }, { id: 'modules', label: 'Modules & rules' }]} />
        </ListToolbar>} />
      {open && <TemplateDrawer t={open} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
    </section>
  );
}

function TemplateDrawer({ t, onClose, onOpen }: { t: T.PlannerTemplate; onClose: () => void; onOpen: (id: string) => void }) {
  const templates = useTemplates();
  const plans = usePlans();
  const actions = usePlannerActions();
  const audit = (useEntityList('auditEvents', { pageSize: 100000 }).data?.data ?? []) as unknown as T.AuditEvent[];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, T.PlannerParamDef['default']>>({});
  const [variant, setVariant] = useState<string | null>(null);
  const resolved = resolveTemplate(t.id, templates);
  const chain = resolved?.chain ?? [t];
  const params = resolved?.params ?? t.params;
  const rules = resolved?.rules ?? t.rules;
  const own = new Set(t.params.map(p => p.key));
  const uses = plans.filter(p => p.templateId === t.id);
  const versions = audit.filter(a => a.entityId === t.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const editable = t.status === 'draft';
  const save = () => {
    const next = { ...t, params: params.map(p => (draft[p.key] !== undefined ? { ...p, default: draft[p.key] } : p)).filter(p => own.has(p.key) || draft[p.key] !== undefined) };
    actions.saveTemplate(next); setEditing(false); setDraft({});
  };
  const paramRow = (p: T.PlannerParamDef) => {
    const v = draft[p.key] ?? p.default;
    if (!editing) return fmtValue(v, p.unit);
    if (p.type === 'bool') return <Toggle on={!!v} onChange={x => setDraft(d => ({ ...d, [p.key]: x }))} />;
    if (p.type === 'select') return <SelectInput value={String(v ?? '')} options={(p.options ?? []).map(o => ({ id: o, label: o }))} onChange={x => setDraft(d => ({ ...d, [p.key]: x }))} style={{ height: 32 }} />;
    if (p.type === 'number') return <NumInput value={typeof v === 'number' ? v : undefined} min={p.min} max={p.max} unit={p.unit} onChange={x => setDraft(d => ({ ...d, [p.key]: x }))} style={{ maxWidth: 180 }} />;
    return <TextInput value={String(v ?? '')} onChange={x => setDraft(d => ({ ...d, [p.key]: x }))} style={{ height: 32 }} />;
  };
  return (
    <Drawer open onClose={onClose} width={760} title={t.name} sub={t.description}
      head={<div className="row wrap" style={{ gap: 6, marginTop: 8 }}><Chip tone="neutral">{KIND_LABEL[t.kind]}</Chip><TemplateStatusChip s={t.status} /><Chip tone="neutral">v{t.version}</Chip>{t.scope && <Chip tone="info">{SCOPE_LABEL[t.scope]}</Chip>}{t.inheritsFrom && <Chip tone="purple">Variant</Chip>}</div>}
      foot={<div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span className="vw-label">{editable ? 'Draft: defaults can be edited; publishing makes it available to new plans.' : t.status === 'published' ? 'Published: make a variant to change defaults; retire to stop new plans using it.' : 'Retired: existing plans keep it; new plans cannot use it.'}</span>
        <span className="row" style={{ gap: 8 }}>
          {editable && !editing && <Btn icon={I.Pencil} onClick={() => setEditing(true)}>Edit defaults</Btn>}
          {editing && <><Btn onClick={() => { setEditing(false); setDraft({}); }}>Cancel</Btn><Btn variant="filled" icon={I.Save} onClick={save}>Save defaults</Btn></>}
          {!editing && <Btn icon={I.GitBranch} onClick={() => setVariant(`${t.name} · variant`)}>Make a variant</Btn>}
          {!editing && editable && <Btn variant="filled" icon={I.CheckCircle2} onClick={() => actions.saveTemplate({ ...t, status: 'published' })}>Publish</Btn>}
          {!editing && t.status === 'published' && <Btn variant="danger-subtle" icon={I.Ban} onClick={() => actions.saveTemplate({ ...t, status: 'deprecated' })}>Retire</Btn>}
          {!editing && t.status === 'deprecated' && <Btn icon={I.RotateCcw} onClick={() => actions.saveTemplate({ ...t, status: 'draft' })}>Reopen as draft</Btn>}
        </span>
      </div>}>
      <KV cols={3} items={[['Applies to', t.appliesTo.label], ['Becomes a', t.executesAs ?? '—'], ['Owner', t.ownerName], ['Site type', DC_TYPE_CATALOG.find(p => p.key === t.dcTypeKey)?.name ?? '—'], ['Blueprint', t.blueprintKey ?? '—'], ['Updated', date(t.updatedAt)]]} />
      {chain.length > 1 && <><Sub>Inherits from</Sub><div className="pn-chain">{[...chain].reverse().map((c, i) => <span key={c.id} className="row" style={{ gap: 6 }}>{i > 0 && <I.ChevronRight size={14} />}{c.id === t.id ? <b>{c.name} v{c.version}</b> : <button type="button" className="ent-link" onClick={() => onOpen(c.id)}>{c.name} v{c.version}</button>}</span>)}</div><p className="vw-label" style={{ margin: '6px 0 0' }}>Nearer templates override inputs by key and add rules; this template's own inputs are marked below.</p></>}
      {t.kind === 'plan' && <>
        <Sub>Wizard areas</Sub>
        <div className="row wrap" style={{ gap: 6 }}>{dimensionsFor(t).map(({ dim, depth }) => <Chip key={dim.key} tone={depth === 'full' ? 'info' : 'neutral'} size="xs">{dim.label}{depth === 'summary' ? ' · brief' : ''}</Chip>)}</div>
        <div className="pn-two" style={{ marginTop: 12 }}>
          <Panel title="Approval path" icon={I.ShieldCheck}>{t.approvalPath.length ? <ol className="pl-steps">{t.approvalPath.map((s, i) => <li key={i} className="is-pending"><span className="pl-step-n">{i + 1}</span><span className="cell-2"><b>{s}</b><small>{/finance/i.test(s) ? 'Decided by the CapEx band of the scenario under review' : 'From the template'}</small></span></li>)}</ol> : <p className="vw-label">No approval step: plans execute once submitted.</p>}</Panel>
          <Panel title="Outputs" icon={I.FileText}>{t.outputs.length ? <ul className="pn-list">{t.outputs.map(o => <li key={o}><I.FileCheck size={14} className="muted" /><span>{o}</span></li>)}</ul> : <p className="vw-label">—</p>}</Panel>
        </div>
      </>}
      {t.kind === 'demand' && t.demand && <><Sub>Workload and phases</Sub><KV cols={3} items={[['GPU', `${t.demand.gpuPct}%`], ['Compute', `${t.demand.computePct}%`], ['Storage', `${t.demand.storagePct}%`], ...t.demand.phases.map(p => [p.name, `${p.sharePct}% from month ${p.monthsFromStart}`] as [string, string])]} /></>}
      {t.items?.length ? <><Sub>{t.kind === 'checklist' ? 'Checks' : 'Sections'}</Sub><ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>{t.items.map(i => <li key={i}>{i}</li>)}</ol></> : null}
      {params.length > 0 && <>
        <Sub extra={<span className="vw-label">{params.length} inputs · {t.params.length} own</span>}>Inputs and defaults</Sub>
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Input</th><th>Area</th><th>Default</th><th>From</th></tr></thead><tbody>
          {[...params].sort((a, b) => a.aspect.localeCompare(b.aspect)).map(p => <tr key={p.key}><td><span className="cell-2"><b>{p.label}</b>{p.help && <small>{p.help}</small>}</span></td><td>{ASPECT_LABEL[p.aspect]}</td><td className="num">{paramRow(p)}</td><td>{own.has(p.key) ? <Chip tone="info" size="xs">This template</Chip> : <Chip tone="neutral" size="xs">{chain.find(c => c.params.some(x => x.key === p.key))?.name ?? 'Inherited'}</Chip>}</td></tr>)}
        </tbody></table>
      </>}
      {rules.length > 0 && <>
        <Sub extra={<span className="vw-label">{rules.filter(r => r.severity === 'hard').length} must · {rules.filter(r => r.severity === 'soft').length} should</span>}>Rules checked</Sub>
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Rule</th><th>Area</th><th>Severity</th><th>Standard</th></tr></thead><tbody>
          {rules.map(r => <tr key={r.id}><td><span className="cell-2"><b>{r.title}</b><small className="mono">{r.id}</small></span></td><td>{ASPECT_LABEL[r.aspect]}</td><td><Chip tone={r.severity === 'hard' ? 'error' : 'warning'} size="xs" outline>{r.severity === 'hard' ? 'Must' : 'Should'}</Chip></td><td>{r.standard ?? '—'}</td></tr>)}
        </tbody></table>
      </>}
      {uses.length > 0 && <><Sub>Plans using this template</Sub><ul className="pn-list">{uses.map(p => <li key={p.id}><span className="cell-2"><b>{p.title}</b><small className="mono">{p.plnId} · {p.status}{p.templateVersion ? ` · approved on v${p.templateVersion}` : ''}</small></span></li>)}</ul></>}
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
