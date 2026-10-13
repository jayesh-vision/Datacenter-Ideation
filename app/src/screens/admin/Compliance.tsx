/* Compliance (Admin, 13-Oct-2026: P2B merge phase 7, minimal redesign). Posture per framework, controls mapped to the policies that
   evidence them, the policies evaluated on the estate, every violation with a link to the record, and the audit trail. Tabs `?tab=`. */
import { useSearchParams, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { getAuditLog, getCompliance, useQuery } from '../../api';
import type { ComplianceControl } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Chip, Panel, Tabs } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { SoftMeter, StatGrid, StatTile } from '../../ui/Analytics';
import { DcLink } from '../../ui/status';
import { fmtDate, fmtDateTime, fmtNum } from '../../lib/format';
import '../../styles/dcim.css';

type Tab = 'posture' | 'controls' | 'policies' | 'violations' | 'audit';
const ST: Record<ComplianceControl['status'], 'success' | 'warning' | 'error' | 'info'> = { Compliant: 'success', Partial: 'warning', 'Non-compliant': 'error', 'Evidence due': 'info' };

export function Compliance() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const apply = useParamPatch();
  const tab = (sp.get('tab') as Tab) || 'posture';
  const fw = sp.get('fw') ?? '', pol = sp.get('pol') ?? '', q = sp.get('q') ?? '';
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
  usePage([{ label: 'Admin' }, { label: 'Compliance', to: '/compliance' }]);
  const { data: c } = useQuery(getCompliance, []);
  const { data: audit } = useQuery(getAuditLog, []);
  if (!c || !audit) return <Loading />;
  const ctl = c.controls.filter(x => !fw || x.framework === fw);
  const vio = c.violations.filter(v => (!pol || v.policyId === pol) && (!q || `${v.resourceName} ${v.message} ${v.dcId}`.toLowerCase().includes(q.toLowerCase())));
  const pname = new Map(c.policies.map(p => [p.id, p.name]));
  return (
    <div className="page dcim">
      <PageHead title="Compliance" sub="Framework controls evidenced by policies that run on the estate itself; manual controls carry their attestation" />
      <StatGrid cols={c.frameworks.length + 1}>
        {c.frameworks.map(f => (
          <StatTile key={f.id} label={f.name} value={`${Math.round((f.compliant / f.controls) * 100)}%`} sub={`${f.compliant} of ${f.controls} controls`} onClick={() => set({ tab: 'controls', fw: f.name })} active={fw === f.name} info={f.description}>
            <SoftMeter pct={(f.compliant / f.controls) * 100} tone={f.compliant === f.controls ? 'success' : f.compliant / f.controls >= 0.6 ? 'warning' : 'error'} />
          </StatTile>
        ))}
        <StatTile label="Policy violations" value={fmtNum(c.violations.length)} sub={`${c.policies.filter(p => p.violations).length} of ${c.policies.length} policies`} subTone={c.violations.length ? 'warn' : undefined} onClick={() => set({ tab: 'violations', fw: '' })} info="Resources that break a policy right now; each links to the record to fix.">
          <SoftMeter pct={(c.policies.filter(p => !p.violations).length / c.policies.length) * 100} tone="info" />
        </StatTile>
      </StatGrid>
      <Tabs value={tab} onChange={v => set({ tab: v === 'posture' ? '' : v, pol: '', q: '' })} tabs={[{ id: 'posture', label: 'Posture' }, { id: 'controls', label: 'Frameworks & controls', count: c.controls.length }, { id: 'policies', label: 'Policies', count: c.policies.length }, { id: 'violations', label: 'Violations', count: c.violations.length }, { id: 'audit', label: 'Audit trail', count: audit.length }]} />
      {tab === 'posture' && <Panel title="Controls that need work" icon={I.ShieldAlert} flush info="Controls not compliant, worst first, with the policy findings behind them.">
        <DataTable rows={c.controls.filter(x => x.status !== 'Compliant')} pageSize={20} onRow={x => set({ tab: 'violations', pol: x.policyIds[0] ?? '' })} cols={[
          { key: 'f', header: 'Framework', render: x => <span className="cell-2"><b>{x.ref}</b><small>{x.framework}</small></span> },
          { key: 't', header: 'Control', wrap: true, render: x => x.title },
          { key: 'e', header: 'Evidence', wrap: true, render: x => <span className="vw-label">{x.evidence}</span> },
          { key: 's', header: 'Status', render: x => <Chip tone={ST[x.status]} dot>{x.status}</Chip> }]} />
      </Panel>}
      {tab === 'controls' && <section className="vw-card-section dcim-table"><DataTable rows={ctl} pageSize={30} onRow={x => x.policyIds.length && set({ tab: 'violations', pol: x.policyIds[0] })}
        toolbar={<ListToolbar shown={ctl.length} total={c.controls.length} noun="controls" onApply={apply} filters={[{ id: 'fw', label: 'Framework', quick: true, value: fw, anyLabel: 'All frameworks', onChange: v => set({ fw: v }), options: c.frameworks.map(f => ({ id: f.name, label: f.name, count: f.controls })) }]} />} cols={[
        { key: 'r', header: 'Control', render: x => <span className="cell-2"><b>{x.ref} · {x.title}</b><small>{x.framework}</small></span>, wrap: true },
        { key: 'ty', header: 'Type', render: x => x.type },
        { key: 'p', header: 'Evidenced by', wrap: true, render: x => x.policyIds.length ? x.policyIds.map(id => `${id} ${pname.get(id)}`).join(' · ') : <span className="vw-label">attestation</span> },
        { key: 'o', header: 'Owner', render: x => <span className="cell-2"><span>{x.owner}</span><small>{fmtDate(x.assessed)}</small></span> },
        { key: 's', header: 'Status', render: x => <Chip tone={ST[x.status]} dot>{x.status}</Chip> }]} /></section>}
      {tab === 'policies' && <section className="vw-card-section dcim-table"><DataTable rows={c.policies} pageSize={20} onRow={p => set({ tab: 'violations', pol: p.id })} cols={[
        { key: 'n', header: 'Policy', wrap: true, render: p => <span className="cell-2"><b>{p.id} · {p.name}</b><small>{p.rule}</small></span> },
        { key: 'a', header: 'Area', render: p => p.area },
        { key: 'e', header: 'Enforcement', render: p => <Chip tone={p.enforcement === 'Block' ? 'error' : 'warning'} size="xs">{p.enforcement}</Chip> },
        { key: 'v', header: 'Result', sort: p => p.violations, render: p => <span className="cell-2"><span style={{ color: p.violations ? 'var(--vw-color-red-600)' : undefined }}>{fmtNum(p.violations)} violation{p.violations === 1 ? '' : 's'}</span><small>of {fmtNum(p.evaluated)} evaluated</small></span> }]} /></section>}
      {tab === 'violations' && <section className="vw-card-section dcim-table"><DataTable rows={vio} pageSize={30} onRow={v => nav(v.to)}
        toolbar={<ListToolbar shown={vio.length} total={c.violations.length} noun="violations" onApply={apply} search={{ value: q, onChange: v => set({ q: v }), placeholder: 'Resource, message, site' }} filters={[{ id: 'pol', label: 'Policy', quick: true, value: pol, anyLabel: 'Any policy', onChange: v => set({ pol: v }), options: c.policies.filter(p => p.violations).map(p => ({ id: p.id, label: p.name, count: p.violations })) }]} />} cols={[
        { key: 'r', header: 'Resource', wrap: true, render: v => <span className="cell-2"><b className="mono">{v.resourceName}</b><small>{pname.get(v.policyId)}</small></span> },
        { key: 'd', header: 'Site', render: v => v.dcId ? <DcLink id={v.dcId} /> : '—' },
        { key: 'm', header: 'Finding', wrap: true, render: v => v.message }]} /></section>}
      {tab === 'audit' && <section className="vw-card-section dcim-table"><DataTable rows={audit} pageSize={30} empty={<p className="vw-label" style={{ padding: 16 }}>No changes recorded yet.</p>} cols={[
        { key: 'a', header: 'When', render: a => <span className="nowrap">{fmtDateTime(a.at)}</span> },
        { key: 'u', header: 'Who', render: a => a.actor },
        { key: 'o', header: 'Record', render: a => <span className="mono">{a.object}</span> },
        { key: 'f', header: 'Change', wrap: true, render: a => `${a.field}: ${a.prev} → ${a.next}` },
        { key: 's', header: 'Source', render: a => a.source }]} /></section>}
    </div>
  );
}
