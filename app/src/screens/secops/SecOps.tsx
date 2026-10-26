/* Security Ops (26-Oct-2026, user: "Security Ops module as a new menu in Datacenter … use the industry standards datacenter Security Ops
   uses"). The datacenter SOC on one security data lake: sensors (device AAA, syslog, config backups, Redfish, osquery, Falco, Trivy, Suricata,
   Zeek, a passive OT sensor, PACS, VMS) → OTel collectors → OCSF tables in ClickHouse; Sigma rules tagged with MITRE ATT&CK Enterprise / ICS;
   cases through the NIST SP 800-61 lifecycle; SSVC-prioritised vulnerabilities; CIS / STIG hardening; IEC 62443 OT zones; physical layers;
   NIST CSF 2.0 posture. Sub-menus (shell/submenus.tsx `secops`) map to `?tab=`; `?dc=` scopes every view to one datacenter.
   Data: mock/secops.ts (derived from the estate; physical detections = the access log's exceptions, unauthorised drifts = SR-002). */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getSecOps, useQuery } from '../../api';
import type { SecOpsView } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { SubTabs, subCrumb, subHead } from '../../shell/submenus';
import { useToast } from '../ops/shared';
import { SecOverview } from './Overview';
import { DetectionsView } from './Detections';
import { CasesView, PlaybooksView } from './Cases';
import { AttackView, RulesView } from './Coverage';
import { VulnsView, HardeningView, DriftView } from './Exposure';
import { OtView, PhysicalView, SourcesView } from './Plant';
import '../../styles/dcim.css';
import '../../styles/delivery.css';
import '../../styles/ipam.css';
import '../../styles/compliance.css';
import '../../styles/secops.css';

export type SecTab = 'overview' | 'detections' | 'cases' | 'playbooks' | 'attack' | 'rules' | 'vulns' | 'hardening' | 'drift' | 'ot' | 'physical' | 'sources';
export interface SecProps {
  v: SecOpsView; all: SecOpsView; dcId: string;
  q: (k: string) => string;
  set: (patch: Record<string, string>) => void;
  go: (t: SecTab, extra?: Record<string, string>) => void;
  toast: (title: string, body?: string) => void;
}

/* one datacenter's slice of the view (rules, techniques, sources, playbooks stay estate-wide) */
function scope(v: SecOpsView, dc: string): SecOpsView {
  if (!dc) return v;
  const at = <T extends { dcId: string }>(xs: T[]) => xs.filter(x => x.dcId === dc);
  return { ...v, sites: at(v.sites), detections: at(v.detections), cases: at(v.cases), vulns: at(v.vulns), hardening: at(v.hardening), drift: at(v.drift), otZones: at(v.otZones), otAssets: at(v.otAssets), physical: at(v.physical) };
}

export function SecOps() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as SecTab) || 'overview';
  const dcId = sp.get('dc') ?? '';
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, val]) => (val ? n.set(k, val) : n.delete(k))); setSp(n, { replace: true }); };
  /* switching sub tab drops the list filters of the old one, keeps the datacenter scope */
  const go = (t: SecTab, extra: Record<string, string> = {}) => { const n = new URLSearchParams(); if (dcId) n.set('dc', dcId); if (t !== 'overview') n.set('tab', t); Object.entries(extra).forEach(([k, val]) => val && n.set(k, val)); setSp(n); window.scrollTo({ top: 0 }); };
  usePage([{ label: 'Security' }, { label: 'Security Ops', to: '/secops' }, ...subCrumb('secops', tab), ...(dcId ? [{ label: dcId }] : [])], dcId ? { dcId } : {});
  const { data: all } = useQuery(getSecOps, []);
  const toast = useToast();
  const v = useMemo(() => (all ? scope(all, dcId) : null), [all, dcId]);
  if (!all || !v) return <Loading />;
  const p: SecProps = { v, all, dcId, q: k => sp.get(k) ?? '', set, go, toast: toast.show };
  const open = v.detections.filter(d => d.state !== 'Closed');
  const counts: Partial<Record<SecTab, number>> = { cases: v.cases.filter(c => c.phase !== 'Closed').length, playbooks: v.playbooks.length, attack: v.techniques.length, rules: v.rules.length, hardening: v.hardening.length, drift: v.drift.length };
  const TABS: { id: SecTab; label: string; count?: number }[] = [
    { id: 'cases', label: 'Cases', count: counts.cases }, { id: 'playbooks', label: 'Playbooks', count: counts.playbooks },
    { id: 'attack', label: 'MITRE ATT&CK', count: counts.attack }, { id: 'rules', label: 'Detection rules', count: counts.rules },
    { id: 'hardening', label: 'Hardening', count: counts.hardening }, { id: 'drift', label: 'Configuration drift', count: counts.drift }
  ];
  const sites = all.sites.map(s => s.dcId).sort();

  return (
    <div className="page dcim secops">
      <PageHead {...subHead('secops', tab, { title: 'Security Ops', sub: 'The datacenter security operations centre' })}
        actions={<>
          <span className="so-live"><i className="live-dot" />{open.length} open detection{open.length === 1 ? '' : 's'}</span>
          <label className="so-scope"><I.Building2 size={14} /><select className="select" value={dcId} onChange={e => set({ dc: e.target.value })} aria-label="Datacenter">
            <option value="">All datacenters</option>{sites.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
        </>} />
      <SubTabs screen="secops" value={tab} onChange={t => go(t)} tabs={TABS} />
      {tab === 'overview' && <SecOverview {...p} />}
      {tab === 'detections' && <DetectionsView {...p} />}
      {tab === 'cases' && <CasesView {...p} />}
      {tab === 'playbooks' && <PlaybooksView {...p} />}
      {tab === 'attack' && <AttackView {...p} />}
      {tab === 'rules' && <RulesView {...p} />}
      {tab === 'vulns' && <VulnsView {...p} />}
      {tab === 'hardening' && <HardeningView {...p} />}
      {tab === 'drift' && <DriftView {...p} />}
      {tab === 'ot' && <OtView {...p} />}
      {tab === 'physical' && <PhysicalView {...p} />}
      {tab === 'sources' && <SourcesView {...p} />}
      {toast.node}
    </div>
  );
}
