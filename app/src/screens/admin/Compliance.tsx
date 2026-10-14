/* Compliance (Admin; 14-Oct-2026 redesign + P2B gap fill). Overview is a posture dashboard (overall ring, framework cards, controls that
   need work, policy results, evidence due with attest, recent decisions); tabs hold the registers: frameworks & controls (attest, new
   control / framework), policies as code (Rego drawer, on / off, new policy), violations (blocked / warned), decision records (each
   evaluation with its OPA input) and the audit trail. Data: mock/compliance.ts — policies run on the estate itself. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { addComplianceControl, addComplianceFramework, addCompliancePolicy, attestControl, getAuditLog, getCompliance, setPolicyActive, useQuery } from '../../api';
import type { ComplianceControl, CompliancePolicy, ComplianceView } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Drawer, Field, Modal, Panel, Tabs } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { DcLink } from '../../ui/status';
import { fmtDate, fmtDateTime, fmtNum } from '../../lib/format';
import { useToast } from '../ops/shared';
import '../../styles/dcim.css';
import '../../styles/delivery.css';
import '../../styles/workorders.css';
import '../../styles/compliance.css';

type Tab = 'posture' | 'controls' | 'policies' | 'violations' | 'decisions' | 'audit';
const ST: Record<ComplianceControl['status'], 'success' | 'warning' | 'error' | 'info' | 'neutral'> = { Compliant: 'success', Partial: 'warning', 'Non-compliant': 'error', 'Evidence due': 'info', 'Not assessed': 'neutral' };
const STATUSES: ComplianceControl['status'][] = ['Compliant', 'Partial', 'Non-compliant', 'Evidence due', 'Not assessed'];
const DEC_TONE = { allow: 'success', deny: 'error', warn: 'warning' } as const;
const AREA_ICON: Record<CompliancePolicy['area'], I.LucideIcon> = { Power: I.Zap, Cooling: I.Snowflake, Network: I.Network, Lifecycle: I.CalendarClock, Change: I.GitPullRequestArrow, Safety: I.FlameKindling, Maintenance: I.Wrench };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Ring({ value, size = 84, tone }: { value: number; size?: number; tone: 'good' | 'warn' | 'bad' }) {
  const r = size / 2 - 6, c = 2 * Math.PI * r;
  return (
    <span className="cp-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}><circle cx={size / 2} cy={size / 2} r={r} className="cp-ring-bg" /><circle cx={size / 2} cy={size / 2} r={r} className={`cp-ring-fg is-${tone}`} strokeDasharray={`${(c * value) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} /></svg>
      <b>{value}%</b>
    </span>
  );
}
const toneOf = (v: number) => (v >= 85 ? 'good' : v >= 60 ? 'warn' : 'bad') as 'good' | 'warn' | 'bad';

export function Compliance() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const apply = useParamPatch();
  const tab = (sp.get('tab') as Tab) || 'posture';
  const fw = sp.get('fw') ?? '', pol = sp.get('pol') ?? '', q = sp.get('q') ?? '', cst = sp.get('cst') ?? '';
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
  usePage([{ label: 'Admin' }, { label: 'Compliance', to: '/compliance' }]);
  const { data: c } = useQuery(getCompliance, []);
  const { data: audit } = useQuery(getAuditLog, []);
  const [policy, setPolicy] = useState<string | null>(null);
  const [form, setForm] = useState<'policy' | 'control' | 'framework' | null>(null);
  const [attest, setAttest] = useState<ComplianceControl | null>(null);
  const toast = useToast();
  if (!c || !audit) return <Loading />;
  const pname = new Map(c.policies.map(p => [p.id, p.name]));
  const ctl = c.controls.filter(x => (!fw || x.framework === fw) && (!cst || x.status === cst) && (!q || `${x.ref} ${x.title} ${x.framework}`.toLowerCase().includes(q.toLowerCase())));
  const vio = c.violations.filter(v => (!pol || v.policyId === pol) && (!q || `${v.resourceName} ${v.message} ${v.dcId}`.toLowerCase().includes(q.toLowerCase())));
  const overall = pct(c.controls.filter(x => x.status === 'Compliant').length, c.controls.length);
  const run = (f: () => Promise<unknown>, ok: string, body?: string) => f().then(() => toast.show(ok, body)).catch(e => toast.show('Not done', String(e.message ?? e)));

  return (
    <div className="page dcim">
      <PageHead title="Compliance" sub="Framework controls evidenced by policies that run on the estate itself; manual controls carry their attestation"
        actions={<><Btn icon={I.FolderPlus} onClick={() => setForm('framework')}>New framework</Btn><Btn icon={I.ListPlus} onClick={() => setForm('control')}>New control</Btn><Btn variant="filled" icon={I.FileCode2} onClick={() => setForm('policy')}>New policy</Btn></>} />
      <Tabs value={tab} onChange={v => set({ tab: v === 'posture' ? '' : v, pol: '', q: '', cst: '' })} tabs={[{ id: 'posture', label: 'Overview' }, { id: 'controls', label: 'Frameworks & controls', count: c.controls.length }, { id: 'policies', label: 'Policies', count: c.policies.length },
        { id: 'violations', label: 'Violations', count: c.violations.length }, { id: 'decisions', label: 'Decision records', count: c.decisions.length }, { id: 'audit', label: 'Audit' }]} />

      {tab === 'posture' && <div className="dl-dash">
        <section className="cp-hero dl-span-12">
          <div className="cp-hero-ring"><Ring value={overall} size={96} tone={toneOf(overall)} /><span><b>Overall posture</b><small>{c.controls.filter(x => x.status === 'Compliant').length} of {c.controls.length} controls compliant</small></span></div>
          <div className="cp-hero-st">{STATUSES.map(s => { const n = c.controls.filter(x => x.status === s).length; return (
            <button key={s} type="button" className={`cp-st is-${ST[s]}`} onClick={() => set({ tab: 'controls', cst: s })}><b>{n}</b><span>{s}</span></button>); })}</div>
          <div className="cp-hero-f"><small>Policies</small><b>{c.policies.filter(p => p.active).length} of {c.policies.length} active</b><em>{fmtNum(c.policies.reduce((a, p) => a + p.evaluated, 0))} resources evaluated</em></div>
          <div className="cp-hero-f"><small>Open violations</small><b className={c.violations.length ? 'is-bad' : ''}>{fmtNum(c.violations.length)}</b><em>{c.violations.filter(v => v.outcome === 'Blocked').length} blocked · {c.violations.filter(v => v.outcome === 'Warned').length} warned</em></div>
        </section>
        <div className="cp-fws dl-span-12">{c.frameworks.map(f => { const cs = c.controls.filter(x => x.framework === f.name); const v = pct(f.compliant, f.controls); return (
          <button key={f.id} type="button" className="cp-fw" onClick={() => set({ tab: 'controls', fw: f.name })}>
            <span className="cp-fw-top"><Ring value={v} size={64} tone={toneOf(v)} /><span className="cell-2"><b>{f.name}</b><small>{f.version ?? 'custom'} · {f.controls} controls</small></span></span>
            <p>{f.description}</p>
            <span className="cp-fw-bar">{STATUSES.map(s => { const n = cs.filter(x => x.status === s).length; return n ? <i key={s} className={`is-${ST[s]}`} style={{ flex: n }} title={`${s}: ${n}`} /> : null; })}</span>
            <span className="cp-fw-leg">{STATUSES.map(s => { const n = cs.filter(x => x.status === s).length; return n ? <span key={s}><i className={`is-${ST[s]}`} />{n} {s.toLowerCase()}</span> : null; })}</span>
          </button>); })}</div>
        <Panel className="dl-span-6 dl-h-360" title="Controls that need work" icon={I.ShieldAlert} count={c.controls.filter(x => x.status !== 'Compliant').length} info="Controls not compliant, worst first, with the findings behind them. Click one to see its violations.">
          <ul className="ipam-find">{[...c.controls].filter(x => x.status !== 'Compliant').sort((a, b) => STATUSES.indexOf(b.status) - STATUSES.indexOf(a.status)).sort((a, b) => (a.status === 'Non-compliant' ? -1 : 0) - (b.status === 'Non-compliant' ? -1 : 0)).map(x => (
            <li key={x.id}><button type="button" onClick={() => (x.type === 'Manual' ? setAttest(x) : set({ tab: 'violations', pol: x.policyIds[0] ?? '' }))}>
              <Chip tone={ST[x.status]} size="xs" dot>{x.status}</Chip><span className="cell-2"><b>{x.ref} · {x.title}</b><small>{x.framework} · {x.evidence}</small></span><I.ChevronRight size={14} className="ipam-chev" /></button></li>))}</ul>
        </Panel>
        <Panel className="dl-span-6 dl-h-360" title="Policy results" icon={I.FileCode2} count={c.policies.length} info="Each policy's last evaluation: how many resources it checked and how many failed. Click one to open its Rego source and decisions.">
          <ul className="cp-pr">{[...c.policies].sort((a, b) => pct(b.violations, b.evaluated) - pct(a.violations, a.evaluated)).map(p => { const Ic = AREA_ICON[p.area]; const fail = pct(p.violations, p.evaluated); return (
            <li key={p.id}><button type="button" onClick={() => setPolicy(p.id)}>
              <span className="cp-pr-ico"><Ic size={14} /></span>
              <span className="cp-pr-m"><b>{p.name}</b><small><span className="mono">{p.id}</span> · {p.active ? `${fmtNum(p.evaluated)} evaluated` : 'switched off'}</small></span>
              <span className="cp-pr-bar"><i style={{ width: `${p.evaluated ? 100 - fail : 0}%` }} className="is-ok" /><i style={{ width: `${fail}%` }} className={p.enforcement === 'Block' ? 'is-bad' : 'is-warn'} /></span>
              <span className={`cp-pr-n${p.violations ? (p.enforcement === 'Block' ? ' is-bad' : ' is-warn') : ''}`}>{p.active ? (p.violations ? `${p.violations} failed` : 'all pass') : 'off'}</span>
            </button></li>); })}</ul>
        </Panel>
        <Panel className="dl-span-6 dl-h-360" title="Evidence due" icon={I.FileCheck} count={c.controls.filter(x => x.type === 'Manual' && x.status !== 'Compliant').length} info="Manual controls whose attestation is older than a year (or never made). Attest records the evidence and resets the date.">
          {c.controls.filter(x => x.type === 'Manual' && x.status !== 'Compliant').length ? <ul className="cp-ev">{c.controls.filter(x => x.type === 'Manual' && x.status !== 'Compliant').map(x => (
            <li key={x.id}><span className="cell-2"><b>{x.ref} · {x.title}</b><small>{x.framework} · last {fmtDate(x.assessed)} · {x.owner}</small></span><Btn size="sm" icon={I.Stamp} onClick={() => setAttest(x)}>Attest</Btn></li>))}</ul>
            : <p className="vw-label">Every manual control has a current attestation.</p>}
        </Panel>
        <Panel className="dl-span-6 dl-h-360" title="Latest decisions" icon={I.Gavel} actions={<button type="button" className="ent-link" onClick={() => set({ tab: 'decisions' })}>All records →</button>} info="The most recent deny and warn decisions from the policy evaluator.">
          <ul className="cp-dec">{c.decisions.filter(d => d.decision !== 'allow').slice(0, 7).map(d => (
            <li key={d.id}><Chip tone={DEC_TONE[d.decision]} size="xs" dot>{d.decision.toUpperCase()}</Chip><span className="cell-2"><b>{d.resourceName}</b><small>{d.policyName} · {d.by} · {fmtDateTime(d.at)}</small></span></li>))}</ul>
        </Panel>
      </div>}

      {tab === 'controls' && <section className="vw-card-section dcim-table"><DataTable rows={ctl} pageSize={30} onRow={x => (x.type === 'Manual' ? setAttest(x) : x.policyIds.length && set({ tab: 'violations', pol: x.policyIds[0] }))}
        toolbar={<ListToolbar shown={ctl.length} total={c.controls.length} noun="controls" onApply={apply} search={{ value: q, onChange: v => set({ q: v }), placeholder: 'Reference, control, framework' }}
          filters={[{ id: 'fw', label: 'Framework', quick: true, value: fw, anyLabel: 'All frameworks', onChange: v => set({ fw: v }), options: c.frameworks.map(f => ({ id: f.name, label: f.name, count: f.controls })) },
            { id: 'cst', label: 'Status', quick: true, value: cst, anyLabel: 'Any status', onChange: v => set({ cst: v }), options: STATUSES.map(s => ({ id: s, label: s, count: c.controls.filter(x => x.status === s).length })) }]} />} cols={[
        { key: 'r', header: 'Control', wrap: true, sort: x => `${x.framework}${x.ref}`, render: x => <span className="cell-2"><b>{x.ref} · {x.title}</b><small>{x.framework}{x.custom ? ' · added by hand' : ''}</small></span> },
        { key: 'ty', header: 'Type', sort: x => x.type, render: x => <Chip tone={x.type === 'Automated' ? 'info' : 'neutral'} size="xs">{x.type}</Chip> },
        { key: 'p', header: 'Evidenced by', wrap: true, render: x => x.policyIds.length ? <span className="row wrap" style={{ gap: 4 }}>{x.policyIds.map(id => <button key={id} type="button" className="cp-polchip" onClick={e => { e.stopPropagation(); setPolicy(id); }}>{id} {pname.get(id)}</button>)}</span> : <span className="vw-label">attestation</span> },
        { key: 'o', header: 'Owner', sort: x => x.owner, render: x => <span className="cell-2"><span>{x.owner || '—'}</span><small>{fmtDate(x.assessed)}</small></span> },
        { key: 's', header: 'Status', sort: x => STATUSES.indexOf(x.status), render: x => <Chip tone={ST[x.status]} dot>{x.status}</Chip> },
        { key: 'a', header: '', render: x => x.type === 'Manual' ? <Btn size="sm" icon={I.Stamp} onClick={e => { e.stopPropagation(); setAttest(x); }}>Attest</Btn> : null }]} /></section>}

      {tab === 'policies' && <section className="vw-card-section dcim-table"><DataTable rows={c.policies} pageSize={20} onRow={p => setPolicy(p.id)} cols={[
        { key: 'n', header: 'Policy', wrap: true, sort: p => p.id, render: p => { const Ic = AREA_ICON[p.area]; return <span className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><span className="cp-pr-ico"><Ic size={14} /></span><span className="cell-2"><b>{p.id} · {p.name}</b><small className="mono">{p.pkg}</small></span></span>; } },
        { key: 'e', header: 'Enforcement', sort: p => p.enforcement, render: p => <Chip tone={p.enforcement === 'Block' ? 'error' : 'warning'} size="xs">{p.enforcement}</Chip> },
        { key: 't', header: 'Runs', sort: p => p.trigger, render: p => <span className="cell-2"><span>{p.trigger}</span><small>{p.lastRun ? `last ${fmtDateTime(p.lastRun)}` : 'not run yet'}</small></span> },
        { key: 'c', header: 'Controls', sort: p => p.controlIds.length, render: p => p.controlIds.length ? `${p.controlIds.length} control${p.controlIds.length === 1 ? '' : 's'}` : <span className="vw-label">none mapped</span> },
        { key: 'v', header: 'Result', sort: p => p.violations, render: p => <span className="cell-2"><span style={{ color: p.violations ? 'var(--vw-color-red-600)' : undefined }}>{p.active ? `${fmtNum(p.violations)} failed` : '—'}</span><small>{p.active ? `of ${fmtNum(p.evaluated)} evaluated` : 'switched off'}</small></span> },
        { key: 's', header: 'State', sort: p => Number(p.active), render: p => <Chip tone={p.active ? 'success' : 'neutral'} size="xs" dot>{p.active ? 'Active' : 'Off'}</Chip> }]} /></section>}

      {tab === 'violations' && <section className="vw-card-section dcim-table"><DataTable rows={vio} pageSize={30} defaultSort={{ key: 'w', dir: 'desc' }} onRow={v => nav(v.changeId ? `/changes/${v.changeId}` : v.to)}
        toolbar={<ListToolbar shown={vio.length} total={c.violations.length} noun="violations" onApply={apply} search={{ value: q, onChange: v => set({ q: v }), placeholder: 'Resource, message, site' }} filters={[{ id: 'pol', label: 'Policy', quick: true, value: pol, anyLabel: 'Any policy', onChange: v => set({ pol: v }), options: c.policies.filter(p => p.violations).map(p => ({ id: p.id, label: `${p.id} ${p.name}`, count: p.violations })) }]} />} cols={[
        { key: 'w', header: 'Raised', sort: v => v.raised, render: v => <span className="nowrap">{fmtDateTime(v.raised)}</span> },
        { key: 'r', header: 'Resource', wrap: true, sort: v => v.resourceName, render: v => <span className="cell-2"><b>{v.resourceName}</b><small>{pname.get(v.policyId)}</small></span> },
        { key: 'd', header: 'Datacenter', sort: v => v.dcId, render: v => v.dcId ? <DcLink id={v.dcId} /> : '—' },
        { key: 'm', header: 'Finding', wrap: true, render: v => v.message },
        { key: 'o', header: 'Outcome', sort: v => v.outcome, render: v => <Chip tone={v.outcome === 'Blocked' ? 'error' : 'warning'} size="xs" dot>{v.outcome}</Chip> },
        { key: 'c', header: 'Change', render: v => v.changeId ? <Link className="ent-link mono" to={`/changes/${v.changeId}`} onClick={e => e.stopPropagation()}>{v.changeId}</Link> : <span className="vw-label">—</span> }]} /></section>}

      {tab === 'decisions' && <Decisions c={c} />}

      {tab === 'audit' && <section className="vw-card-section dcim-table"><DataTable rows={audit} pageSize={30} empty={<p className="vw-label" style={{ padding: 16 }}>No changes recorded yet.</p>} cols={[
        { key: 'a', header: 'When', render: a => <span className="nowrap">{fmtDateTime(a.at)}</span> },
        { key: 'u', header: 'Who', render: a => a.actor },
        { key: 'o', header: 'Record', render: a => <span className="mono">{a.object}</span> },
        { key: 'f', header: 'Change', wrap: true, render: a => `${a.field}: ${a.prev} → ${a.next}` },
        { key: 's', header: 'Source', render: a => a.source }]} /></section>}

      {policy && <PolicyDrawer c={c} id={policy} onClose={() => setPolicy(null)} onToggle={(id, on) => run(() => setPolicyActive(id, on), on ? 'Policy switched on' : 'Policy switched off', on ? 'It runs again on its next trigger.' : 'Its violations no longer count; controls it evidences may become Not assessed.')} />}
      <AttestModal ctl={attest} onClose={() => setAttest(null)} onSave={(id, note) => { setAttest(null); run(() => attestControl(id, note), 'Control attested', 'The control is compliant until the next review.'); }} />
      <NewPolicyModal open={form === 'policy'} c={c} onClose={() => setForm(null)} onDone={t => { setForm(null); toast.show(t, 'It is evaluated on its next trigger.'); }} />
      <NewControlModal open={form === 'control'} c={c} onClose={() => setForm(null)} onDone={t => { setForm(null); toast.show(t); }} />
      <NewFrameworkModal open={form === 'framework'} onClose={() => setForm(null)} onDone={t => { setForm(null); toast.show(t, 'Add its controls with New control.'); }} />
      {toast.node}
    </div>
  );
}

/* ---------------------------------------------------------------- decision records: list + the selected decision with its input */
function Decisions({ c }: { c: ComplianceView }) {
  const [f, setF] = useState<'all' | 'deny' | 'warn' | 'allow'>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const rows = c.decisions.filter(d => (f === 'all' || d.decision === f) && (!q || `${d.resourceName} ${d.policyName} ${d.dcId}`.toLowerCase().includes(q.toLowerCase())));
  const cur = rows.find(d => d.id === sel) ?? rows[0];
  return (
    <div className="wf-inbox cp-decs">
      <section className="vw-card-section wf-inbox-l">
        <div className="wf-views2" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>{(['all', 'deny', 'warn', 'allow'] as const).map(k => (
          <button key={k} type="button" className={f === k ? 'is-on' : ''} onClick={() => { setF(k); setSel(null); }}><b>{k === 'all' ? c.decisions.length : c.decisions.filter(d => d.decision === k).length}</b><span>{k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1)}</span></button>))}</div>
        <div className="cp-dsearch"><I.Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Resource, policy, site" /></div>
        <ul className="wf-list">{rows.slice(0, 200).map(d => (
          <li key={d.id}><button type="button" className={cur?.id === d.id ? 'is-on' : ''} onClick={() => setSel(d.id)}>
            <span className="wf-list-top"><b>{d.resourceName}</b><Chip tone={DEC_TONE[d.decision]} size="xs" dot>{d.decision.toUpperCase()}</Chip></span>
            <small>{d.policyName}</small><small className="wf-list-meta">{d.by} · {fmtDateTime(d.at)}{d.dcId ? ` · ${d.dcId}` : ''}</small>
          </button></li>))}</ul>
      </section>
      <div className="wf-inbox-r">{cur ? <Panel title={<>Decision · <span className="mono">{cur.id}</span></>} icon={I.Gavel} actions={<Chip tone={DEC_TONE[cur.decision]} dot>{cur.decision.toUpperCase()}</Chip>}>
        <dl className="wo-kv">
          <div><dt>Policy</dt><dd>{cur.policyId} · {cur.policyName}</dd></div><div><dt>Evaluated by</dt><dd>{cur.by}</dd></div>
          <div><dt>Resource</dt><dd>{cur.resourceName}</dd></div><div><dt>Type · site</dt><dd>{cur.resourceType}{cur.dcId ? ` · ${cur.dcId}` : ''}</dd></div>
          <div><dt>When</dt><dd>{fmtDateTime(cur.at)}</dd></div><div><dt>Result</dt><dd>{cur.result}</dd></div>
        </dl>
        <b className="dcim-sub-h">Input given to the policy</b>
        <pre className="cp-code">{JSON.stringify(cur.input, null, 2)}</pre>
      </Panel> : <Panel title="No decision" icon={I.Gavel}><p className="vw-label">Nothing matches.</p></Panel>}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- policy drawer: rule, Rego, controls, decisions */
function PolicyDrawer({ c, id, onClose, onToggle }: { c: ComplianceView; id: string; onClose: () => void; onToggle: (id: string, on: boolean) => void }) {
  const p = c.policies.find(x => x.id === id); if (!p) return null;
  const Ic = AREA_ICON[p.area];
  const decs = c.decisions.filter(d => d.policyId === id).slice(0, 8);
  return (
    <Drawer open onClose={onClose} width={760} title={<span className="row" style={{ gap: 8 }}><span className="cp-pr-ico"><Ic size={14} /></span>{p.id} · {p.name}</span>} sub={p.rule}
      foot={<><label className="cp-toggle"><input type="checkbox" checked={p.active} onChange={e => onToggle(p.id, e.target.checked)} /><span>{p.active ? 'Active: evaluated ' + p.trigger.toLowerCase() : 'Switched off'}</span></label></>}>
      <div className="wf-pd-sum" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <span><small>Enforcement</small><b>{p.enforcement}</b><em>{p.enforcement === 'Block' ? 'stops the change / record' : 'flags, does not stop'}</em></span>
        <span><small>Evaluated</small><b>{fmtNum(p.evaluated)}</b><em>{p.lastRun ? `last ${fmtDateTime(p.lastRun)}` : 'not run yet'}</em></span>
        <span><small>Failed</small><b className={p.violations ? 'is-bad' : ''}>{fmtNum(p.violations)}</b><em>{p.evaluated ? `${pct(p.violations, p.evaluated)}% of resources` : '—'}</em></span>
        <span><small>Controls</small><b>{p.controlIds.length}</b><em>evidenced by it</em></span>
      </div>
      <b className="dcim-sub-h">Rego source <span className="mono vw-label" style={{ fontWeight: 400 }}>{p.pkg}</span></b>
      <pre className="cp-code cp-rego">{p.rego}</pre>
      <b className="dcim-sub-h">Satisfies controls</b>
      {p.controlIds.length ? <div className="row wrap" style={{ gap: 6 }}>{c.controls.filter(x => p.controlIds.includes(x.id)).map(x => <Chip key={x.id} tone={ST[x.status]} size="xs" dot>{x.framework} {x.ref}</Chip>)}</div> : <p className="vw-label">Not mapped to any control.</p>}
      <b className="dcim-sub-h">Recent decisions</b>
      {decs.length ? <ul className="cp-dec">{decs.map(d => <li key={d.id}><Chip tone={DEC_TONE[d.decision]} size="xs" dot>{d.decision.toUpperCase()}</Chip><span className="cell-2"><b>{d.resourceName}</b><small>{d.result} · {fmtDateTime(d.at)}</small></span></li>)}</ul> : <p className="vw-label">No decisions yet.</p>}
    </Drawer>
  );
}

/* ---------------------------------------------------------------- forms */
function AttestModal({ ctl, onClose, onSave }: { ctl: ComplianceControl | null; onClose: () => void; onSave: (id: string, note: string) => void }) {
  const [note, setNote] = useState('');
  useEffect(() => { setNote(''); }, [ctl?.id]);
  if (!ctl) return null;
  return (
    <Modal open onClose={onClose} title={`Attest ${ctl.ref} · ${ctl.title}`} sub={`${ctl.framework} · manual control · last attested ${fmtDate(ctl.assessed)}`}
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Stamp} disabled={!note.trim()} onClick={() => onSave(ctl.id, note)}>Attest</Btn></>}>
      <Field label="Evidence" required hint="What you checked: document, audit sample, walk-through, ticket"><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Access log sample of 25 entries reviewed, all badged" autoFocus /></Field>
    </Modal>
  );
}
const AREAS: CompliancePolicy['area'][] = ['Power', 'Cooling', 'Network', 'Lifecycle', 'Change', 'Safety', 'Maintenance'];
function NewPolicyModal({ open, c, onClose, onDone }: { open: boolean; c: ComplianceView; onClose: () => void; onDone: (t: string) => void }) {
  const [name, setName] = useState(''); const [area, setArea] = useState<CompliancePolicy['area']>('Power'); const [enf, setEnf] = useState<CompliancePolicy['enforcement']>('Warn'); const [rule, setRule] = useState(''); const [rego, setRego] = useState(''); const [ctls, setCtls] = useState<string[]>([]); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setName(''); setRule(''); setCtls([]); setErr(''); } }, [open]);
  useEffect(() => { setRego(`package dcos.${area.toLowerCase()}.${(name || 'new_policy').toLowerCase().replace(/[^a-z0-9]+/g, '_')}\n\nimport rego.v1\n\n${enf === 'Block' ? 'deny' : 'violation'}[msg] {\n  # the condition that fails, on input.<resource>\n  msg := "describe the finding"\n}`); }, [area, name, enf]);
  if (!open) return null;
  const go = () => addCompliancePolicy({ name, area, enforcement: enf, rule, rego, controlIds: ctls }).then(id => onDone(`${id} created`)).catch(e => setErr(String(e.message ?? e)));
  return (
    <Modal open onClose={onClose} width={720} title="New policy" sub="A rule written as code (Rego) that the evaluator runs on each resource; map it to the controls it evidences."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.FileCode2} disabled={!name.trim() || !rule.trim()} onClick={go}>Create policy</Btn></>}>
      <div className="dcim-form">
        <Field label="Name" required><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. GPU racks are liquid-ready" autoFocus /></Field>
        <Field label="Area"><select className="select" value={area} onChange={e => setArea(e.target.value as CompliancePolicy['area'])}>{AREAS.map(a => <option key={a}>{a}</option>)}</select></Field>
        <Field label="Rule" required style={{ gridColumn: '1 / -1' }}><input className="input" value={rule} onChange={e => setRule(e.target.value)} placeholder="One sentence: what must be true" /></Field>
        <Field label="Enforcement"><select className="select" value={enf} onChange={e => setEnf(e.target.value as CompliancePolicy['enforcement'])}><option value="Warn">Warn (flag only)</option><option value="Block">Block (stop the change)</option></select></Field>
        <Field label={`Evidences controls (${ctls.length})`}><select className="select" value="" onChange={e => e.target.value && setCtls(x => [...new Set([...x, e.target.value])])}><option value="">Add a control…</option>{c.controls.filter(x => x.type === 'Automated' && !ctls.includes(x.id)).map(x => <option key={x.id} value={x.id}>{x.framework} {x.ref} · {x.title}</option>)}</select></Field>
        {ctls.length > 0 && <div className="row wrap" style={{ gap: 6, gridColumn: '1 / -1' }}>{ctls.map(id => { const x = c.controls.find(y => y.id === id)!; return <button key={id} type="button" className="cp-polchip" onClick={() => setCtls(v => v.filter(y => y !== id))}>{x.framework} {x.ref} ×</button>; })}</div>}
        <Field label="Rego source" style={{ gridColumn: '1 / -1' }}><textarea className="input mono cp-code-edit" value={rego} onChange={e => setRego(e.target.value)} spellCheck={false} /></Field>
        {err && <p className="dcim-err" style={{ gridColumn: '1 / -1' }}>{err}</p>}
      </div>
    </Modal>
  );
}
function NewControlModal({ open, c, onClose, onDone }: { open: boolean; c: ComplianceView; onClose: () => void; onDone: (t: string) => void }) {
  const [fw, setFw] = useState(''); const [ref, setRef] = useState(''); const [title, setTitle] = useState(''); const [type, setType] = useState<ComplianceControl['type']>('Manual'); const [pols, setPols] = useState<string[]>([]); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setFw(c.frameworks[0]?.name ?? ''); setRef(''); setTitle(''); setPols([]); setErr(''); } }, [open, c.frameworks]);
  const policies = useMemo(() => c.policies, [c.policies]);
  if (!open) return null;
  const go = () => addComplianceControl({ framework: fw, ref, title, type, policyIds: pols }).then(() => onDone(`${fw} ${ref} added`)).catch(e => setErr(String(e.message ?? e)));
  return (
    <Modal open onClose={onClose} width={620} title="New control" sub="A requirement of a framework: automated controls are evidenced by policies, manual ones by attestation."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" disabled={!ref.trim() || !title.trim()} onClick={go}>Add control</Btn></>}>
      <div className="dcim-form">
        <Field label="Framework"><select className="select" value={fw} onChange={e => setFw(e.target.value)}>{c.frameworks.map(f => <option key={f.id}>{f.name}</option>)}</select></Field>
        <Field label="Reference" required><input className="input" value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. A.7.4" /></Field>
        <Field label="Title" required style={{ gridColumn: '1 / -1' }}><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Physical security monitoring" /></Field>
        <Field label="Type"><select className="select" value={type} onChange={e => setType(e.target.value as ComplianceControl['type'])}><option>Manual</option><option>Automated</option></select></Field>
        {type === 'Automated' && <Field label="Evidenced by"><select className="select" value="" onChange={e => e.target.value && setPols(x => [...new Set([...x, e.target.value])])}><option value="">Add a policy…</option>{policies.filter(p => !pols.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}</select></Field>}
        {pols.length > 0 && <div className="row wrap" style={{ gap: 6, gridColumn: '1 / -1' }}>{pols.map(id => <button key={id} type="button" className="cp-polchip" onClick={() => setPols(v => v.filter(y => y !== id))}>{id} ×</button>)}</div>}
        {err && <p className="dcim-err" style={{ gridColumn: '1 / -1' }}>{err}</p>}
      </div>
    </Modal>
  );
}
function NewFrameworkModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (t: string) => void }) {
  const [name, setName] = useState(''); const [ver, setVer] = useState(''); const [desc, setDesc] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setName(''); setVer(''); setDesc(''); setErr(''); } }, [open]);
  if (!open) return null;
  const go = () => addComplianceFramework({ name, version: ver, description: desc }).then(() => onDone(`${name} added`)).catch(e => setErr(String(e.message ?? e)));
  return (
    <Modal open onClose={onClose} title="New framework" sub="A standard or regulation whose controls you track (e.g. PCI DSS, Uptime Tier, a customer's contract)."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" disabled={!name.trim()} onClick={go}>Add framework</Btn></>}>
      <div className="dcim-form">
        <Field label="Name" required><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. PCI DSS" autoFocus /></Field>
        <Field label="Version"><input className="input" value={ver} onChange={e => setVer(e.target.value)} placeholder="e.g. 4.0" /></Field>
        <Field label="What it covers" style={{ gridColumn: '1 / -1' }}><input className="input" value={desc} onChange={e => setDesc(e.target.value)} /></Field>
        {err && <p className="dcim-err" style={{ gridColumn: '1 / -1' }}>{err}</p>}
      </div>
    </Modal>
  );
}
