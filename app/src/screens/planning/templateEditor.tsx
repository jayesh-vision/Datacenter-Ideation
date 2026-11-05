/* Planner → Templates: creating and editing templates (lifecycle in planner/lib/templateCatalog.ts).
   NewTemplateModal = a copy / variant of an existing template, or a blank module. TemplateEditor = every field of a draft (details,
   wizard areas, approval path, outputs, inputs with allowed values, demand mix, document / checklist items); it never touches a
   published template — "Edit" on one opens its next version as a draft first. PublishSection = changes from the live version, effect
   on open plans, then Publish or Send for approval (approve / reject by a second template approver). VersionsSection = the live
   version, the stored earlier versions (view what changed since) and the history lines. */
import { Fragment, useEffect, useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip, Field, Modal, Seg, Toggle } from '../../ui/kit';
import { useBenchmarks, useEstate, usePlannerActions, usePlans, useTemplateAudit, useTemplates } from '../../planner/lib/usePlanner';
import { MODULE_KINDS, resolveTemplate, type EstateActuals } from '../../planner/lib/engine';
import { BOD_SECTIONS } from '../../planner/lib/outputs';
import { ATP_SYSTEM } from '../../planner/p2b/enums';
import { usePlannerData } from '../../planner/lib/plannerData';
import { estateActuals } from '../../planner/lib/ai';
import { APPROVAL_STEPS, ASPECT_ORDER, EXECUTES_AS, NEW_KINDS, TEMPLATE_APPROVER_ROLE, contentOf, dependents, liveTemplates, moduleBrings, needsPublishApproval, outputCatalog, paramCatalog, templateDiff, templateErrors, templateImpact, type TplChange, type TplImpactRow } from '../../planner/lib/templateCatalog';
import { CLIMATE_LABEL, COOLING_LABEL, RULE_PLAIN } from '../../planner/lib/labels';
import { LIMIT_INFO, RULE_TEMPLATE_KINDS, checkCatalog, nextRuleId, ruleIndex } from '../../planner/lib/ruleCatalog';
import { DC_TYPE_CATALOG } from '../../planner/p2b/dcTypes';
import { PEOPLE } from '../../planner/compat/people';
import { switchUser, useAuth } from '../../planner/compat/auth';
import type * as T from '../../planner/p2b/types';
import { ASPECT_LABEL, NumInput, SCOPE_LABEL, SelectInput, TextArea, TextInput, date, money, num } from './common';

/* ---- plain values: engine keys and raw numbers as a planner would say them */
const SIMPLE_KEBAB = /^[a-z0-9]+(-[a-z0-9]+)+$/;
export function optionLabel(key: string, v: string): string {
  if (key === 'coolingType') return COOLING_LABEL[v as T.PlannerCoolingType] ?? v;
  if (key === 'climate') return CLIMATE_LABEL[v] ?? v;
  if (key === 'feedVoltage') return Number(v) >= 1000 ? `${num(Number(v) / 1000, 1)} kV` : `${v} V`;
  if (/Gbps$/.test(key)) return `${v} Gbps`;
  if (/Kva$/.test(key)) return `${num(Number(v))} kVA`;
  if (key === 'commissioningLevel') return `Level ${v}`;
  if (SIMPLE_KEBAB.test(v)) { const t = v.replace(/-/g, ' ').replace(/\b(dc|it|ups|pdu|gpu|dci|wan)\b/g, w => w.toUpperCase()); return t[0].toUpperCase() + t.slice(1); }
  return v;
}
export function fmtDefault(p: T.PlannerParamDef, v: T.PlannerParamDef['default'] = p.default): string {
  if (v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') { if (p.unit && /^USD/i.test(p.unit)) { const rest = p.unit.replace(/^USD\/?/i, ''); return `${money(v)}${rest ? ` / ${rest}` : ''}`; } return `${num(v, 2)}${p.unit ? ` ${p.unit}` : ''}`; }
  return optionLabel(p.key, v);
}
export const KIND_LABEL: Record<T.PlannerTemplateKind, string> = { profile: 'Site type', plan: 'Plan type', aspect: 'Aspect module', ruleset: 'Rule set', benchmarkset: 'Benchmark set', demand: 'Demand profile', document: 'Document', checklist: 'Checklist', blueprint: 'Blueprint' };
const DEPTH_OPTS: { id: T.PlannerAspectDepth; label: string }[] = [{ id: 'full', label: 'In full' }, { id: 'summary', label: 'Brief' }, { id: 'skipped', label: 'Skip' }];
const clone = <X,>(x: X): X => JSON.parse(JSON.stringify(x));

/* ------------------------------------------------------------------ New template */
export type NewPreset = { kind?: T.PlannerTemplateKind; source?: T.PlannerTemplate; mode?: 'copy' | 'variant' | 'blank' };
export function NewTemplateModal({ view, preset, onClose, onCreated }: { view: 'plans' | 'sites' | 'modules'; preset?: NewPreset; onClose: () => void; onCreated: (id: string) => void }) {
  const templates = useTemplates();
  const actions = usePlannerActions();
  const live = useMemo(() => liveTemplates(templates), [templates]);
  const kinds = NEW_KINDS.filter(k => (view === 'plans' ? k.kind === 'plan' : view === 'modules' ? k.kind !== 'plan' : false));
  const [kind, setKind] = useState<T.PlannerTemplateKind>(preset?.kind ?? kinds[0]?.kind ?? 'plan');
  const [mode, setMode] = useState<'copy' | 'variant' | 'blank'>(preset?.mode ?? (kind === 'plan' ? 'copy' : 'blank'));
  const sources = live.filter(t => t.kind === kind && t.status !== 'draft');
  const [srcId, setSrcId] = useState<string>(preset?.source?.id ?? '');
  const src = sources.find(t => t.id === srcId) ?? (kind === 'plan' ? sources[0] : undefined);
  const needsSource = mode !== 'blank';
  const [name, setName] = useState('');
  const suggested = src && needsSource ? `${src.name} · ${mode === 'copy' ? 'copy' : 'variant'}` : '';
  const finalName = name.trim() || suggested;
  const clash = live.find(t => t.kind === kind && t.name.trim().toLowerCase() === finalName.toLowerCase());
  const ok = !!finalName && !clash && (!needsSource || !!src);
  const create = () => {
    const resolved = mode === 'copy' && src ? resolveTemplate(src.id, templates) : null;
    const rec = actions.createTemplate({ kind, name: finalName, mode, source: needsSource ? src : undefined, resolved: resolved ? { params: resolved.params, rules: resolved.rules } : undefined });
    onCreated(rec.id);
  };
  const modes: { id: 'copy' | 'variant' | 'blank'; label: string }[] = kind === 'plan' ? [{ id: 'copy', label: 'Copy' }, { id: 'variant', label: 'Variant' }] : [{ id: 'blank', label: 'Blank' }, { id: 'copy', label: 'Copy' }, { id: 'variant', label: 'Variant' }];
  return (
    <Modal open onClose={onClose} title="New template" width={560}
      foot={<div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Plus} disabled={!ok} onClick={create}>Create draft</Btn></div>}>
      <div className="pn-te-new">
        {view === 'sites' ? null : kinds.length > 1 && <Field label="Kind">
          <div className="pn-te-kinds">{kinds.map(k => <button key={k.kind} type="button" className={kind === k.kind ? 'is-on' : ''} onClick={() => { setKind(k.kind); setSrcId(''); if (k.kind !== 'plan' && mode === 'copy' && !preset?.source) setMode('blank'); }}><b>{k.label}</b><small>{k.sub}</small></button>)}</div>
        </Field>}
        <Field label="Start from" hint={mode === 'copy' ? 'An independent template with its own copy of every input and rule (flattened from the source and what it inherits). Later changes to the source do not reach it.' : mode === 'variant' ? 'Inherits every input, rule and the approval path of the source; you override only what differs, and later changes to the source still reach it.' : 'An empty template of this kind.'}>
          <Seg size="sm" value={mode} onChange={setMode} options={modes} />
        </Field>
        {needsSource && <Field label={`Source ${KIND_LABEL[kind].toLowerCase()}`} required>
          <SelectInput value={src?.id ?? ''} placeholder="Choose" options={sources.map(t => ({ id: t.id, label: `${t.name} · v${t.version}${t.status === 'deprecated' ? ' (retired)' : ''}${t.scope ? ` · ${SCOPE_LABEL[t.scope]}` : ''}` }))} onChange={setSrcId} />
        </Field>}
        {kind === 'plan' && <p className="vw-label" style={{ margin: 0 }}>A plan type always starts from one of the same family (rack, hall, new site, refresh …): the family decides the wizard steps and the checks the planner runs.</p>}
        <Field label="Name" required error={clash ? `“${clash.name}” already exists.` : undefined}><TextInput value={name} onChange={setName} placeholder={suggested || 'e.g. Inference pod, 30 kW air'} /></Field>
        <p className="vw-label" style={{ margin: 0 }}>It starts as a draft v1 that no plan can use. Edit it, then publish it.</p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Editor (drafts only) */
export function TemplateEditor({ t, onDone }: { t: T.PlannerTemplate; onDone: () => void }) {
  const templates = useTemplates();
  const actions = usePlannerActions();
  const estate = useEstate();
  const [w, setW] = useState<T.PlannerTemplate>(() => clone(t));
  const set = (patch: Partial<T.PlannerTemplate>) => setW(x => ({ ...x, ...patch }));
  const withW = useMemo(() => templates.map(x => (x.id === w.id ? w : x)), [templates, w]);
  const resolved = resolveTemplate(w.id, withW);
  const chain = resolved?.chain ?? [w];
  const own = new Set(w.params.map(p => p.key));
  const covered = new Set(w.requiredAspects.filter(a => a.depth !== 'skipped').map(a => a.aspect));
  const allParams = resolved?.params ?? w.params;
  const shownParams = w.kind === 'plan' && covered.size ? allParams.filter(p => covered.has(p.aspect) || own.has(p.key)) : allParams;
  const catalog = useMemo(() => paramCatalog(templates), [templates]);
  const addable = catalog.filter(p => !allParams.some(x => x.key === p.key) && (w.kind !== 'plan' || !covered.size || covered.has(p.aspect)));
  const outputsKnown = useMemo(() => outputCatalog(templates), [templates]);
  const errors = templateErrors(w, templates);
  const diff = templateDiff(contentOf(t), contentOf(w));
  const [newOut, setNewOut] = useState('');
  const [addKey, setAddKey] = useState('');
  const [newItem, setNewItem] = useState('');
  const [addRule, setAddRule] = useState('');
  const [openRule, setOpenRule] = useState<string | null>(null);

  /* rules: this template's own copies (set here, overrides, switched off) over what it inherits */
  /* what it would get without its own copies: the parent chain and every module (its own and inherited) */
  const base = useMemo(() => resolveTemplate(w.id, withW.map(x => (x.id === w.id ? { ...w, params: [], rules: [] } : x))), [withW, w]);
  const parentRules = useMemo(() => base?.rules ?? [], [base]);
  const mods = resolved?.modules ?? [];
  const modRules = (m: T.PlannerTemplate) => resolveTemplate(m.id, withW)?.rules ?? [];
  const modParams = (m: T.PlannerTemplate) => resolveTemplate(m.id, withW)?.params ?? [];
  const live = useMemo(() => liveTemplates(templates), [templates]);
  const [addMod, setAddMod] = useState('');
  const ruleRows = useMemo(() => {
    const ids = [...new Set([...parentRules.map(r => r.id), ...w.rules.map(r => r.id)])];
    return ids.map(id => ({ id, own: w.rules.find(r => r.id === id), inh: parentRules.find(r => r.id === id) }))
      .sort((a, b) => { const ra = (a.own ?? a.inh)!, rb = (b.own ?? b.inh)!; return ra.severity.localeCompare(rb.severity) || ASPECT_ORDER.indexOf(ra.aspect) - ASPECT_ORDER.indexOf(rb.aspect) || (RULE_PLAIN[ra.check] ?? ra.title).localeCompare(RULE_PLAIN[rb.check] ?? rb.title); });
  }, [parentRules, w.rules]);
  const activeChecks = new Set(ruleRows.filter(r => !(r.own?.off)).map(r => (r.own ?? r.inh)!.check));
  const library = useMemo(() => ruleIndex(templates).filter(e => e.carriers.length), [templates]);
  const checks = useMemo(() => checkCatalog(templates), [templates]);
  const libAdd = library.filter(e => !ruleRows.some(r => r.id === e.id) && !activeChecks.has(e.rule.check));
  const newAdd = checks.filter(c => !activeChecks.has(c.check));
  const inhFrom = (id: string) => chain.slice(1).find(c => c.rules.some(r => r.id === id))?.name ?? [...mods].reverse().find(m => modRules(m).some(r => r.id === id))?.name ?? 'Inherited';
  const paramFrom = (key: string) => chain.slice(1).find(c => c.params.some(x => x.key === key))?.name ?? [...mods].reverse().find(m => modParams(m).some(x => x.key === key))?.name;
  const setRule = (id: string, patch: Partial<T.PlannerRuleDef>) => setW(x => ({ ...x, rules: x.rules.map(r => (r.id === id ? { ...r, ...patch } : r)) }));
  const dropRule = (id: string) => setW(x => ({ ...x, rules: x.rules.filter(r => r.id !== id) }));
  const putRule = (r: T.PlannerRuleDef) => setW(x => ({ ...x, rules: [...x.rules.filter(y => y.id !== r.id), r] }));
  const doAddRule = (v: string) => {
    if (v.startsWith('check:')) { const c = checks.find(k => k.check === v.slice(6)); if (!c) return; putRule({ id: nextRuleId(withW), check: c.check, title: RULE_PLAIN[c.check] ?? c.plain, aspect: c.aspect, severity: 'soft', threshold: LIMIT_INFO[c.check]?.dflt }); }
    else { const e = library.find(x => x.id === v); if (e) putRule(clone(e.rule)); }
    setAddRule('');
  };
  const limitText = (r: T.PlannerRuleDef) => (LIMIT_INFO[r.check] ? `${num(r.threshold ?? LIMIT_INFO[r.check].dflt, 2)} ${LIMIT_INFO[r.check].unit}` : '—');

  const setParam = (key: string, patch: Partial<T.PlannerParamDef>) => setW(x => ({ ...x, params: x.params.map(p => (p.key === key ? { ...p, ...patch } : p)) }));
  const overrideParam = (p: T.PlannerParamDef) => setW(x => ({ ...x, params: [...x.params, clone(p)] }));
  const removeParam = (key: string) => setW(x => ({ ...x, params: x.params.filter(p => p.key !== key) }));
  const depth = (a: T.PlannerAspect) => w.requiredAspects.find(r => r.aspect === a)?.depth ?? 'skipped';
  const setDepth = (a: T.PlannerAspect, d: T.PlannerAspectDepth) => set({ requiredAspects: ASPECT_ORDER.map(x => ({ aspect: x, depth: x === a ? d : depth(x) })) });
  const move = <X,>(xs: X[], i: number, d: -1 | 1) => { const y = xs.slice(); const j = i + d; if (j < 0 || j >= y.length) return y; [y[i], y[j]] = [y[j], y[i]]; return y; };
  const owners = [...new Set([w.ownerName, ...PEOPLE.map(p => p.name)])];
  const regions = estate.regions as unknown as { id: string; name: string }[];
  const sites = estate.dataCenters as unknown as { id: string; name: string; code?: string }[];

  const defaultEditor = (p: T.PlannerParamDef) => {
    const v = p.default;
    if (p.type === 'bool') return <Toggle on={!!v} onChange={x => setParam(p.key, { default: x })} />;
    if (p.type === 'select') return <SelectInput value={String(v ?? '')} options={(p.options ?? []).map(o => ({ id: o, label: optionLabel(p.key, o) }))} onChange={x => setParam(p.key, { default: x })} style={{ height: 32 }} />;
    if (p.type === 'number') return <NumInput value={typeof v === 'number' ? v : undefined} unit={p.unit} onChange={x => setParam(p.key, { default: x })} style={{ maxWidth: 120 }} />;
    return <TextInput value={String(v ?? '')} onChange={x => setParam(p.key, { default: x })} style={{ height: 32 }} />;
  };
  const allowedEditor = (p: T.PlannerParamDef) => {
    if (p.type === 'number') return <span className="row pn-te-range"><NumInput value={p.min} placeholder="min" onChange={x => setParam(p.key, { min: x })} style={{ width: 64 }} /><span>–</span><NumInput value={p.max} placeholder="max" onChange={x => setParam(p.key, { max: x })} style={{ width: 64 }} /></span>;
    if (p.type === 'select') return <TextInput value={(p.options ?? []).join(', ')} onChange={x => setParam(p.key, { options: x.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="option, option" style={{ height: 32, minWidth: 140 }} />;
    return <span className="vw-label">—</span>;
  };
  const save = () => { if (actions.saveTemplateDraft(w).ok) onDone(); };

  return (
    <div className="pn-te">
      {t.versionOf && <div className="pn-bm-note is-info"><I.GitCommitVertical size={15} /><span>You are editing <b>draft v{t.version}</b>. v{t.version - 1} stays live for plans until this draft is published.</span></div>}
      <section>
        <h4>Details</h4>
        <div className="pn-grid-2">
          <Field label="Name" required style={{ gridColumn: 'span 2' }}><TextInput value={w.name} onChange={v => set({ name: v })} /></Field>
          <Field label="Description" style={{ gridColumn: 'span 2' }}><TextArea value={w.description} onChange={v => set({ description: v })} rows={2} /></Field>
          <Field label="Owner"><SelectInput value={w.ownerName} options={owners.map(n => ({ id: n, label: n }))} onChange={v => set({ ownerName: v })} /></Field>
          <Field label="Applies to" hint="who may use it; informative in the prototype">
            <span className="row" style={{ gap: 6 }}>
              <SelectInput<'org' | 'region' | 'site'> value={w.appliesTo.level} options={[{ id: 'org', label: 'Organisation' }, { id: 'region', label: 'A region' }, { id: 'site', label: 'A site' }]} onChange={v => set({ appliesTo: v === 'org' ? { level: 'org', label: 'Whole organisation' } : { level: v, refId: undefined, label: v === 'region' ? 'Region' : 'Site' } })} style={{ width: 140 }} />
              {w.appliesTo.level !== 'org' && <SelectInput value={w.appliesTo.refId ?? ''} placeholder="Choose" options={(w.appliesTo.level === 'region' ? regions.map(r => ({ id: r.id, label: r.name })) : sites.map(s => ({ id: s.id, label: s.name ?? s.code ?? s.id })))} onChange={v => set({ appliesTo: { ...w.appliesTo, refId: v, label: (w.appliesTo.level === 'region' ? regions.find(r => r.id === v)?.name : sites.find(s => s.id === v)?.name) ?? v } })} />}
            </span>
          </Field>
          {w.kind === 'plan' && <Field label="Once approved it becomes a"><SelectInput value={w.executesAs ?? ''} placeholder="Nothing (record only)" options={EXECUTES_AS.map(e => ({ id: e, label: e[0].toUpperCase() + e.slice(1) }))} onChange={v => set({ executesAs: (v || undefined) as T.PlannerTemplate['executesAs'] })} /></Field>}
          {w.kind === 'plan' && <Field label="Site type" hint="the default for new plans"><SelectInput value={w.dcTypeKey ?? ''} placeholder="Any" options={DC_TYPE_CATALOG.map(p => ({ id: p.key, label: p.name }))} onChange={v => set({ dcTypeKey: v || undefined })} /></Field>}
          {w.kind === 'plan' && w.scope && <div className="pn-bm-unit" style={{ gridColumn: 'span 2' }}><I.Lock size={13} />Family <b>{SCOPE_LABEL[w.scope]}</b><span className="vw-label">· fixed: it decides the wizard steps and the checks. Start from another plan type to change it.</span></div>}
          {chain.length > 1 && <div className="pn-bm-unit" style={{ gridColumn: 'span 2' }}><I.GitBranch size={13} />Inherits from <b>{chain[1].name} v{chain[1].version}</b></div>}
        </div>
      </section>

      {w.kind === 'plan' && <section>
        <h4>Wizard areas</h4>
        <p className="vw-label" style={{ margin: '0 0 8px' }}>In full = a wizard step with every input; brief = a short summary; skip = not asked. Inputs of skipped areas are left out.</p>
        <div className="pn-te-areas">{ASPECT_ORDER.map(a => <div key={a}><span>{ASPECT_LABEL[a]}</span><Seg size="sm" value={depth(a)} onChange={d => setDepth(a, d)} options={DEPTH_OPTS} /></div>)}</div>
      </section>}

      {w.kind === 'plan' && <section>
        <h4>Approval path</h4>
        <p className="vw-label" style={{ margin: '0 0 8px' }}>Steps are decided in order. “Finance (by amount)” is filled from the CapEx band of the plan; without it the band's approvers are added.</p>
        {w.approvalPath.length ? <ol className="pn-te-list">{w.approvalPath.map((s, i) => <li key={`${s}-${i}`}><span className="pl-step-n">{i + 1}</span><b>{s}</b>
          <span className="pn-te-acts"><Btn size="sm" icon={I.ArrowUp} disabled={i === 0} onClick={() => set({ approvalPath: move(w.approvalPath, i, -1) })} title="Move up" /><Btn size="sm" icon={I.ArrowDown} disabled={i === w.approvalPath.length - 1} onClick={() => set({ approvalPath: move(w.approvalPath, i, 1) })} title="Move down" /><Btn size="sm" icon={I.X} onClick={() => set({ approvalPath: w.approvalPath.filter((_, k) => k !== i) })} title="Remove step" /></span></li>)}</ol>
          : <p className="vw-label">No steps: plans of this type go to the default path (design authority, then finance by amount).</p>}
        <SelectInput value="" placeholder="Add a step…" options={APPROVAL_STEPS.filter(s => !w.approvalPath.includes(s)).map(s => ({ id: s, label: s }))} onChange={v => v && set({ approvalPath: [...w.approvalPath, v] })} style={{ maxWidth: 260, marginTop: 8 }} />
      </section>}

      {w.kind === 'plan' && <section>
        <h4>Modules <span className="vw-label" style={{ fontWeight: 400 }}>· {mods.length} used</span></h4>
        <p className="vw-label" style={{ margin: 0 }}>Reusable parts this plan type is built from. Their inputs and rules apply unless the plan type{chain.length > 1 ? ' or its parent' : ''} sets its own copy; a demand profile sets the workload mix a new plan starts from; commissioning checklists become the build's test plans; the basis of design document sets the plan document's sections, other documents are added to Delivery's design documents. One per area or test system.</p>
        {mods.length > 0 && <div className="pn-te-mods">{mods.map(m => { const mine = (w.modules ?? []).includes(m.id); const ov = [...modRules(m).filter(r => w.rules.some(x => x.id === r.id)), ...modParams(m).filter(p => own.has(p.key))].length;
          return <div key={m.id}><Chip size="xs" tone="neutral">{KIND_LABEL[m.kind]}</Chip><b>{m.name} v{m.version}</b><small>{moduleBrings(m, withW)}{ov ? ` · ${ov} overridden here` : ''}{!mine ? ` · via ${chain.slice(1).find(c => c.modules?.includes(m.id))?.name ?? 'the parent'}` : ''}</small>
            {mine && <Btn size="sm" icon={I.X} onClick={() => set({ modules: (w.modules ?? []).filter(x => x !== m.id) })}>Remove</Btn>}</div>; })}</div>}
        <div className="row" style={{ gap: 6 }}>
          <select className="select" value={addMod} onChange={ev => setAddMod(ev.target.value)} style={{ maxWidth: 420 }}>
            <option value="">Add a module…</option>
            {MODULE_KINDS.map(k => { const ms = live.filter(m => m.kind === k && m.status === 'published' && !mods.some(x => x.id === m.id) && (k !== 'checklist' || !!m.atpSystem)); return ms.length ? <optgroup key={k} label={`${KIND_LABEL[k]}s`}>{ms.map(m => <option key={m.id} value={m.id}>{m.name} · {moduleBrings(m, templates)}</option>)}</optgroup> : null; })}
          </select>
          <Btn size="sm" icon={I.Plus} disabled={!addMod} onClick={() => { set({ modules: [...(w.modules ?? []), addMod] }); setAddMod(''); }}>Add module</Btn>
        </div>
      </section>}

      {(w.kind === 'plan' || w.kind === 'profile') && <section>
        <h4>Outputs</h4>
        <div className="row wrap" style={{ gap: 6 }}>{w.outputs.map(o => <Chip key={o} tone="neutral">{o}<button type="button" className="pn-te-x" aria-label={`Remove ${o}`} onClick={() => set({ outputs: w.outputs.filter(x => x !== o) })}><I.X size={12} /></button></Chip>)}{!w.outputs.length && <span className="vw-label">None</span>}</div>
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <input className="input" list="pn-te-outputs" value={newOut} onChange={e => setNewOut(e.target.value)} placeholder="Add an output, e.g. Business case" style={{ maxWidth: 300, height: 32 }} />
          <datalist id="pn-te-outputs">{outputsKnown.filter(o => !w.outputs.includes(o)).map(o => <option key={o} value={o} />)}</datalist>
          <Btn size="sm" icon={I.Plus} disabled={!newOut.trim() || w.outputs.includes(newOut.trim())} onClick={() => { set({ outputs: [...w.outputs, newOut.trim()] }); setNewOut(''); }}>Add</Btn>
        </div>
      </section>}

      {w.kind === 'demand' && w.demand && <section>
        <h4>Workload mix and phasing</h4>
        <div className="pn-grid-3">
          {(['gpuPct', 'computePct', 'storagePct'] as const).map(k => <Field key={k} label={k === 'gpuPct' ? 'GPU %' : k === 'computePct' ? 'Compute %' : 'Storage %'}><NumInput value={w.demand![k]} min={0} max={100} onChange={v => set({ demand: { ...w.demand!, [k]: v ?? 0 } })} /></Field>)}
        </div>
        <table className="nst-table pn-te-tbl"><thead><tr><th>Phase</th><th>Share %</th><th>Months from start</th><th /></tr></thead><tbody>
          {w.demand.phases.map((p, i) => <tr key={i}><td><TextInput value={p.name} onChange={v => set({ demand: { ...w.demand!, phases: w.demand!.phases.map((x, k) => (k === i ? { ...x, name: v } : x)) } })} style={{ height: 30 }} /></td>
            <td><NumInput value={p.sharePct} min={0} max={100} onChange={v => set({ demand: { ...w.demand!, phases: w.demand!.phases.map((x, k) => (k === i ? { ...x, sharePct: v ?? 0 } : x)) } })} style={{ width: 90 }} /></td>
            <td><NumInput value={p.monthsFromStart} min={0} onChange={v => set({ demand: { ...w.demand!, phases: w.demand!.phases.map((x, k) => (k === i ? { ...x, monthsFromStart: v ?? 0 } : x)) } })} style={{ width: 90 }} /></td>
            <td><Btn size="sm" icon={I.X} title="Remove phase" onClick={() => set({ demand: { ...w.demand!, phases: w.demand!.phases.filter((_, k) => k !== i) } })} /></td></tr>)}
        </tbody></table>
        <Btn size="sm" icon={I.Plus} onClick={() => set({ demand: { ...w.demand!, phases: [...w.demand!.phases, { name: `Phase ${w.demand!.phases.length + 1}`, sharePct: 0, monthsFromStart: 0 }] } })}>Add phase</Btn>
      </section>}

      {w.kind === 'checklist' && <section>
        <h4>Used as</h4>
        <SelectInput<string> value={w.perSite ? 'sat' : w.atpSystem ?? ''} options={[{ id: '', label: 'A gate list (shown, not turned into tests)' }, ...ATP_SYSTEM.map(s => ({ id: s, label: `${s} commissioning tests` })), { id: 'sat', label: 'Acceptance test for every edge site' }]} onChange={v => set(v === 'sat' ? { atpSystem: 'Integrated', perSite: true } : { atpSystem: (v || undefined) as T.PlannerTemplate['atpSystem'], perSite: undefined })} style={{ maxWidth: 360 }} />
        {(w.atpSystem || w.perSite) && <p className="vw-label" style={{ margin: 0 }}>Write each test as <span className="mono">level | step | method | expected result</span> (levels L1 FAT · L2 SAT · L3 Pre-functional · L4 Functional · L5 IST). A plan type built from it gets one test plan per level{w.perSite ? ' for every edge site' : ' and phase'}; lines in another form are skipped.</p>}
      </section>}

      {(w.kind === 'document' || w.kind === 'checklist') && <section>
        <h4>{w.kind === 'checklist' ? 'Items' : 'Sections'}</h4>
        {w.kind === 'document' && /basis of design/i.test(w.name) && <p className="vw-label" style={{ margin: 0 }}>The planner writes these sections: {BOD_SECTIONS.map(([, n]) => n).join(' · ')}. Leave one out to drop it; reorder to change the document; any other name becomes an empty section for the design author.</p>}
        <ol className="pn-te-list">{(w.items ?? []).map((it, i) => <li key={i}><span className="pl-step-n">{i + 1}</span><TextInput value={it} onChange={v => set({ items: (w.items ?? []).map((x, k) => (k === i ? v : x)) })} style={{ height: 30 }} />
          <span className="pn-te-acts"><Btn size="sm" icon={I.ArrowUp} disabled={i === 0} onClick={() => set({ items: move(w.items ?? [], i, -1) })} title="Move up" /><Btn size="sm" icon={I.ArrowDown} disabled={i === (w.items ?? []).length - 1} onClick={() => set({ items: move(w.items ?? [], i, 1) })} title="Move down" /><Btn size="sm" icon={I.X} onClick={() => set({ items: (w.items ?? []).filter((_, k) => k !== i) })} title="Remove" /></span></li>)}</ol>
        <div className="row" style={{ gap: 6 }}><TextInput value={newItem} onChange={setNewItem} placeholder={w.kind === 'checklist' ? 'Add an item' : 'Add a section'} style={{ maxWidth: 360, height: 32 }} /><Btn size="sm" icon={I.Plus} disabled={!newItem.trim()} onClick={() => { set({ items: [...(w.items ?? []), newItem.trim()] }); setNewItem(''); }}>Add</Btn></div>
      </section>}

      {(shownParams.length > 0 || addable.length > 0) && w.kind !== 'demand' && w.kind !== 'document' && w.kind !== 'checklist' && <section>
        <h4>Inputs and defaults</h4>
        <p className="vw-label" style={{ margin: '0 0 8px' }}>Set here = this template's own value (edit default and allowed values, or remove it to fall back to {chain.length > 1 ? 'the inherited one' : 'the planner default'}). Inherited = from {chain.length > 1 ? chain.slice(1).map(c => c.name).join(' › ') : 'nothing'}; Override copies it here.</p>
        <div className="pn-te-scroll"><table className="nst-table pn-te-tbl"><thead><tr><th>Input</th><th>Default</th><th>Allowed</th><th>From</th></tr></thead><tbody>
          {[...shownParams].sort((a, b) => ASPECT_ORDER.indexOf(a.aspect) - ASPECT_ORDER.indexOf(b.aspect) || a.label.localeCompare(b.label)).map(p => {
            const mine = own.has(p.key); const inherited = paramFrom(p.key);
            return <tr key={p.key} className={mine ? 'is-own' : ''}>
              <td><span className="cell-2"><b>{p.label}</b><small>{ASPECT_LABEL[p.aspect]} · <span className="mono">{p.key}</span></small></span></td>
              <td>{mine ? defaultEditor(p) : fmtDefault(p)}</td>
              <td>{mine ? allowedEditor(p) : <span className="vw-label">{p.type === 'number' ? (p.min !== undefined || p.max !== undefined ? `${p.min ?? '…'} – ${p.max ?? '…'}` : 'any') : p.type === 'select' ? `${(p.options ?? []).length} options` : '—'}</span>}</td>
              <td><span className="pn-te-from">{mine ? <Chip tone="info" size="xs">Set here</Chip> : <Chip tone="neutral" size="xs">{inherited ?? 'Inherited'}</Chip>}{mine ? <Btn size="sm" icon={inherited ? I.Undo2 : I.Trash2} onClick={() => removeParam(p.key)}>{inherited ? 'Use inherited' : 'Remove'}</Btn> : <Btn size="sm" icon={I.PenLine} onClick={() => overrideParam(p)}>Override</Btn>}</span></td>
            </tr>;
          })}
        </tbody></table></div>
        {addable.length > 0 && <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <SelectInput value={addKey} placeholder="Add an input the planner knows…" options={addable.sort((a, b) => ASPECT_ORDER.indexOf(a.aspect) - ASPECT_ORDER.indexOf(b.aspect)).map(p => ({ id: p.key, label: `${ASPECT_LABEL[p.aspect]} · ${p.label}` }))} onChange={setAddKey} style={{ maxWidth: 380 }} />
          <Btn size="sm" icon={I.Plus} disabled={!addKey} onClick={() => { const p = catalog.find(x => x.key === addKey); if (p) overrideParam(p); setAddKey(''); }}>Add input</Btn>
        </div>}
        <p className="vw-label" style={{ margin: '6px 0 0' }}>Only inputs the planner reads can be added; a new kind of input needs the engine to read it.</p>
      </section>}

      {RULE_TEMPLATE_KINDS.includes(w.kind) && <section>
        <h4>Rules <span className="vw-label" style={{ fontWeight: 400 }}>· {ruleRows.filter(r => !r.own?.off).length} checked · {w.rules.filter(r => !r.off).length} set here{w.rules.some(r => r.off) ? ` · ${w.rules.filter(r => r.off).length} switched off` : ''}</span></h4>
        <p className="vw-label" style={{ margin: 0 }}>Set here = this template's own copy (how strict, the limit). Inherited rules come from {chain.length > 1 ? chain.slice(1).map(c => c.name).join(' › ') : 'nothing'}: override to change them here, or switch one off for plans on this template{w.kind === 'plan' ? '' : ' and its variants'}. The check itself is part of the planner engine.</p>
        {ruleRows.length > 0 && <div className="pn-te-scroll"><table className="nst-table pn-te-tbl"><thead><tr><th>What is checked</th><th>When it fails</th><th>Limit</th><th>From</th></tr></thead><tbody>
          {ruleRows.map(({ id, own: o, inh }) => { const r = (o ?? inh)!; const lim = LIMIT_INFO[r.check];
            return <Fragment key={id}><tr className={o?.off ? 'is-off' : o ? 'is-own' : ''}>
              <td><span className="cell-2"><b>{r.title || RULE_PLAIN[r.check]}</b><small>{ASPECT_LABEL[r.aspect]} · <span className="mono">{r.id}</span>{r.standard ? ` · ${r.standard}` : ''}{r.title && RULE_PLAIN[r.check] && r.title !== RULE_PLAIN[r.check] ? ` · checks: ${RULE_PLAIN[r.check]}` : ''}</small></span></td>
              <td>{o && !o.off ? <Seg<T.PlannerRuleSeverity> size="sm" value={o.severity} onChange={v => setRule(id, { severity: v })} options={[{ id: 'hard', label: 'Must' }, { id: 'soft', label: 'Should' }]} /> : <Chip size="xs" tone={o?.off ? 'neutral' : r.severity === 'hard' ? 'error' : 'warning'} outline>{o?.off ? 'Not checked' : r.severity === 'hard' ? 'Must pass' : 'Should pass'}</Chip>}</td>
              <td>{o && !o.off && lim ? <NumInput value={o.threshold} placeholder={String(lim.dflt)} unit={lim.unit} onChange={v => setRule(id, { threshold: v })} style={{ maxWidth: 130 }} /> : <span className="vw-label" style={{ whiteSpace: 'nowrap' }}>{limitText(r)}</span>}</td>
              <td><span className="pn-te-from">
                {o?.off ? <Chip tone="neutral" size="xs">Switched off</Chip> : o ? <Chip tone="info" size="xs">{inh ? 'Override' : 'Set here'}</Chip> : <Chip tone="neutral" size="xs">{inhFrom(id)}</Chip>}
                <span className="row" style={{ gap: 4 }}>
                  {o?.off ? <Btn size="sm" icon={I.Power} onClick={() => dropRule(id)}>Switch on</Btn>
                    : o ? <><Btn size="sm" icon={I.Text} title="Name, standard and source" onClick={() => setOpenRule(openRule === id ? null : id)}>{openRule === id ? 'Done' : 'Details'}</Btn>{inh ? <Btn size="sm" icon={I.Undo2} onClick={() => dropRule(id)}>Use inherited</Btn> : <Btn size="sm" icon={I.Trash2} onClick={() => dropRule(id)}>Remove</Btn>}{inh && <Btn size="sm" icon={I.PowerOff} title="Switch off" onClick={() => putRule({ ...clone(inh), off: true })} />}</>
                    : <><Btn size="sm" icon={I.PenLine} onClick={() => putRule(clone(inh!))}>Override</Btn><Btn size="sm" icon={I.PowerOff} onClick={() => putRule({ ...clone(inh!), off: true })}>Switch off</Btn></>}
                </span>
              </span></td>
            </tr>{o && !o.off && openRule === id && <tr className="is-own pn-te-rdet"><td colSpan={4}><div className="pn-te-rdet-grid">
              <Field label="Name"><TextInput value={o.title} onChange={v => setRule(id, { title: v })} placeholder={RULE_PLAIN[o.check] ?? ''} /></Field>
              <Field label="Standard" hint="e.g. Uptime Tier III, ASHRAE TC9.9"><TextInput value={o.standard ?? ''} onChange={v => setRule(id, { standard: v || undefined })} /></Field>
              <Field label="Source" hint="where the limit comes from"><TextInput value={o.source ?? ''} onChange={v => setRule(id, { source: v || undefined })} /></Field>
              {inh && <small className="vw-label" style={{ gridColumn: '1 / -1' }}>This copy applies to plans on this template{w.kind === 'plan' ? '' : ' and its variants'}; {inhFrom(id)} keeps its own wording.</small>}
            </div></td></tr>}</Fragment>; })}
        </tbody></table></div>}
        {!ruleRows.length && <p className="vw-label" style={{ margin: 0 }}>No rules yet.</p>}
        {(libAdd.length > 0 || newAdd.length > 0) && <div className="row" style={{ gap: 6 }}>
          <select className="select" value={addRule} onChange={ev => setAddRule(ev.target.value)} style={{ maxWidth: 420 }}>
            <option value="">Add a rule…</option>
            {libAdd.length > 0 && <optgroup label="Rules in the library (same settings as elsewhere)">{libAdd.sort((a, b) => ASPECT_ORDER.indexOf(a.rule.aspect) - ASPECT_ORDER.indexOf(b.rule.aspect)).map(e => <option key={e.id} value={e.id}>{ASPECT_LABEL[e.rule.aspect]} · {RULE_PLAIN[e.rule.check] ?? e.rule.title} ({e.id}{LIMIT_INFO[e.rule.check] ? `, ${limitText(e.rule)}` : ''})</option>)}</optgroup>}
            {newAdd.length > 0 && <optgroup label="New rule from a check the planner runs">{newAdd.map(c => <option key={c.check} value={`check:${c.check}`}>{ASPECT_LABEL[c.aspect]} · {c.plain}</option>)}</optgroup>}
          </select>
          <Btn size="sm" icon={I.Plus} disabled={!addRule} onClick={() => doAddRule(addRule)}>Add rule</Btn>
        </div>}
        <p className="vw-label" style={{ margin: 0 }}>A check already run by another rule on this template is not offered twice. Details on a rule set here edits its name, standard and source for this template; every template a rule is in: Benchmarks → Rules.</p>
      </section>}

      <div className="pn-te-bar">
        <span className="vw-label">{errors.length ? `To save: ${errors.join(' ')}` : diff.length ? `${diff.length} change${diff.length === 1 ? '' : 's'} not saved` : 'No changes'}</span>
        <span className="row" style={{ gap: 8 }}><Btn onClick={onDone}>Cancel</Btn><Btn variant="filled" icon={I.Save} disabled={!!errors.length || !diff.length} onClick={save}>Save draft</Btn></span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Changes + publish (a draft) */
export function ChangeList({ changes }: { changes: TplChange[] }) {
  if (!changes.length) return <p className="vw-label" style={{ margin: 0 }}>No changes.</p>;
  return <table className="nst-table pn-te-tbl"><thead><tr><th>Area</th><th>What</th><th>Was</th><th>Now</th></tr></thead><tbody>
    {changes.map((c, i) => <tr key={i}><td className="pn-nowrap">{c.area}</td><td>{c.what}</td><td className="vw-label">{c.from ?? '—'}</td><td>{c.to ?? '—'}</td></tr>)}
  </tbody></table>;
}
function Delta({ a, b, money: m }: { a: number; b: number; money?: boolean }) {
  const f = (n: number) => (m ? money(n) : num(n, 0));
  if (a === b) return <span className="num">{f(a)}</span>;
  return <span className="cell-2 num"><b style={{ fontWeight: 500 }}>{f(b)}</b><small className={b > a ? 'pn-up' : 'pn-down'}>{b > a ? '+' : '−'}{f(Math.abs(b - a))}</small></span>;
}
export function PublishSection({ t, ask, onPublished }: { t: T.PlannerTemplate; ask: (r: { title: string; description?: React.ReactNode; okText: string; danger?: boolean; needsReason: boolean; placeholder?: string; onOk: (reason: string) => void }) => void; onPublished: () => void }) {
  const templates = useTemplates(); const plans = usePlans(); const benchmarks = useBenchmarks(); const data = usePlannerData(); const estate = useEstate();
  const actions = usePlannerActions();
  const { user, users } = useAuth();
  const live = t.versionOf ? templates.find(x => x.id === t.versionOf) : undefined;
  const changes = live ? templateDiff(contentOf(live), contentOf(t), id => templates.find(x => x.id === id)?.name ?? id ?? '—', a => ASPECT_LABEL[a]) : [];
  const approval = needsPublishApproval(t, templates, plans);
  const dep = live ? dependents(live, templates, plans) : undefined;
  const errors = templateErrors(t, templates);
  const [reason, setReason] = useState('');
  const [impact, setImpact] = useState<{ rows: TplImpactRow[]; checked: number } | null>(null);
  const sig = JSON.stringify(contentOf(t));
  useEffect(() => {
    setImpact(null); if (!live) return;
    const h = setTimeout(() => {
      const act = new Map<string, EstateActuals>();
      const actualsOf = (p: T.PlannerPlan) => { const k = p.dcTypeKey ?? ''; if (!act.has(k)) act.set(k, k ? estateActuals(k, estate) : { sampleSites: 0 }); return act.get(k)!; };
      setImpact(templateImpact(plans, templates, live.id, contentOf(t), benchmarks, actualsOf, data));
    }, 300);
    return () => clearTimeout(h);
  }, [sig, live?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pend = t.pendingPublish;
  const approvers = PEOPLE.filter(p => p.role === TEMPLATE_APPROVER_ROLE && p.id !== pend?.requestedById);
  const canApprove = !!pend && approvers.some(p => p.id === user.id);
  const publish = () => { const r = actions.publishTemplate(t, reason.trim() || undefined); if (r.ok && !('pending' in r && r.pending)) onPublished(); };
  return (
    <div className="pn-te-pub">
      {pend && <div className="pn-bm-note is-info"><I.Hourglass size={15} /><span>
        <b>Waiting for approval to publish v{t.version}.</b> Requested by {pend.requestedBy} on {date(pend.requestedAt)}{pend.reason ? ` · “${pend.reason}”` : ''}. {live ? `v${live.version} keeps serving plans until then.` : ''}
        <span className="pn-bm-approve">{canApprove ? <><Btn size="sm" variant="filled" icon={I.Check} onClick={() => { if (actions.approveTemplatePublish(t).ok) onPublished(); }}>Approve and publish as {user.name}</Btn><Btn size="sm" icon={I.X} onClick={() => ask({ title: 'Reject this version?', description: 'It stays a draft; the live version is unchanged.', okText: 'Reject', danger: true, needsReason: true, onOk: r => actions.rejectTemplatePublish(t, r) })}>Reject</Btn></>
          : <><small>Approved by a {TEMPLATE_APPROVER_ROLE.toLowerCase()} other than the requester.</small>{user.id === pend.requestedById && <Btn size="sm" icon={I.Undo2} onClick={() => actions.rejectTemplatePublish(t, 'Withdrawn to edit', true)}>Withdraw</Btn>}{approvers.map(p => { const u = users.find(x => x.id === p.id); return u ? <Btn key={p.id} size="sm" onClick={() => switchUser(u.id)}>Switch to {p.name}</Btn> : null; })}</>}</span>
      </span></div>}
      {live && <section>
        <h4>Changes from v{live.version} (live)</h4>
        <ChangeList changes={changes} />
      </section>}
      {live && <section>
        <h4>Effect on open plans</h4>
        {!impact ? <p className="vw-label" style={{ margin: 0 }}>Re-estimating the open plans on this template…</p>
          : !impact.rows.length ? <p className="vw-label" style={{ margin: 0 }}>{impact.checked ? `None of the ${impact.checked} open plans on it changes in cost, schedule or rule results.` : 'No open plan uses this template.'} {dep?.live.length ? `${dep.live.length} approved or delivered plan(s) keep v${live.version}.` : ''}</p>
          : <><p className="vw-label" style={{ margin: 0 }}>{impact.rows.length} of {impact.checked} open plans change once published. Plans already submitted or approved keep v{live.version}.</p>
            <table className="nst-table pn-rule-where"><thead><tr><th>Plan</th><th>CapEx</th><th>OpEx / month</th><th>Late items</th><th>Rules</th></tr></thead><tbody>
              {impact.rows.map(r => <tr key={r.plan.id}><td><span className="cell-2"><b>{r.plan.title}</b><small>{r.plan.id} · {r.plan.status}</small></span></td>
                <td><Delta a={r.before.capex} b={r.after.capex} money /></td><td><Delta a={r.before.opexMonthly} b={r.after.opexMonthly} money /></td><td><Delta a={r.before.late} b={r.after.late} /></td>
                <td className="pn-nowrap">{r.before.hard === r.after.hard && r.before.warn === r.after.warn ? <span className="vw-label">same</span> : <span>{r.after.hard} fail · {r.after.warn} warn <small className="vw-label">(was {r.before.hard} · {r.before.warn})</small></span>}</td></tr>)}
            </tbody></table></>}
      </section>}
      {!pend && <section>
        <h4>Publish</h4>
        {errors.length > 0 ? <p className="vw-label" style={{ margin: 0 }}>To publish: {errors.join(' ')}</p> : <>
          <p className="vw-label" style={{ margin: '0 0 8px' }}>{live ? (approval ? `v${live.version} is used by ${dep!.plans.length} plan(s)${dep!.variants.length ? ` and ${dep!.variants.length} variant(s)` : ''}: a ${TEMPLATE_APPROVER_ROLE.toLowerCase()} other than you approves v${t.version} before it replaces v${live.version}.` : `Nothing uses v${live.version}: v${t.version} replaces it straight away. v${live.version} is kept in Versions.`) : 'New plans can use it once published.'}</p>
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <Field label={approval ? 'Reason (sent with the request)' : 'Reason (optional)'} style={{ flex: 1 }}><TextInput value={reason} onChange={setReason} placeholder="e.g. Liquid cooling standard for 2027 halls" /></Field>
            <Btn variant="filled" icon={approval ? I.Send : I.CheckCircle2} disabled={approval && reason.trim().length < 5 || (!!live && !changes.length)} onClick={publish}>{approval ? 'Send for approval' : `Publish v${t.version}`}</Btn>
          </div>
          {live && !changes.length && <p className="vw-label" style={{ margin: '6px 0 0' }}>Nothing differs from v{live.version} yet.</p>}
        </>}
      </section>}
    </div>
  );
}

/* ------------------------------------------------------------------ Versions (a published / retired template) */
export function VersionsSection({ t }: { t: T.PlannerTemplate }) {
  const templates = useTemplates();
  const audit = useTemplateAudit(t.id);
  const [view, setView] = useState<T.PlannerTemplateSnapshot | null>(null);
  const hist = [...(t.history ?? [])].reverse();
  const names = (id?: string) => templates.find(x => x.id === id)?.name ?? id ?? '—';
  return <>
    <div className="pn-te-vers">
      <div className="is-live"><span className="mono">v{t.version}</span><b>{t.status === 'deprecated' ? 'Retired' : t.status === 'draft' ? 'Draft' : 'Live'}</b><small>{t.publishedAt ? `published ${date(t.publishedAt)}${t.publishedBy ? ` by ${t.publishedBy}` : ''}` : `since ${date(t.updatedAt ?? t.createdAt)}`}</small></div>
      {hist.map(h => <div key={h.version}><span className="mono">v{h.version}</span><b>Earlier</b><small>replaced {date(h.at)}{h.note ? ` · ${h.note.toLowerCase()}` : ''}</small><Btn size="sm" icon={I.Eye} onClick={() => setView(h)}>What changed since</Btn></div>)}
    </div>
    {!hist.length && <p className="vw-label" style={{ margin: '6px 0 0' }}>No earlier version stored. Each publish keeps the version it replaces; plans pinned to it keep using it.</p>}
    {audit.length > 0 && <ol className="pn-bm-hist" style={{ marginTop: 10 }}>{audit.slice(0, 30).map(e => <li key={e.id}><b>{e.action}</b><span>{e.summary.replace(/^Template [^:]*?: /, '')}{e.reason ? ` · “${e.reason}”` : ''}</span><small>{e.actorName} · {date(e.timestamp)}</small></li>)}</ol>}
    {view && <Modal open onClose={() => setView(null)} title={`${t.name}: v${view.version} → v${t.version}`} width={720} foot={<div className="row" style={{ justifyContent: 'flex-end' }}><Btn onClick={() => setView(null)}>Close</Btn></div>}>
      <ChangeList changes={templateDiff(view.content, contentOf(t), names, a => ASPECT_LABEL[a])} />
    </Modal>}
  </>;
}
