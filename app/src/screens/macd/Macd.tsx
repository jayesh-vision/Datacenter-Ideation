/* MACD (28-Oct-2026, user: "introduce the MACD management system in our SynapseDC platform … in the context of the datacenter").
   Move · Add · Change · Disconnect requests for what customers and internal teams have in the datacenter. Sub-menus (shell/submenus.tsx
   `macd`): Insights (`overview`) · Requests (`requests` list + `board` by stage) · Schedule · Catalogue. `?dc=` scopes every view to one
   datacenter; `?new=1` (optionally `&cat=`, `&rack=`) opens the New request form. Data: mock/macd.ts. */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getMacd, useQuery } from '../../api';
import type { MacdView } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { SubTabs, subCrumb, subHead } from '../../shell/submenus';
import { Btn } from '../../ui/kit';
import { useToast } from '../ops/shared';
import { MacdOverview } from './Overview';
import { BoardView, RequestsView } from './Requests';
import { CatalogView, ScheduleView } from './Schedule';
import { NewRequest } from './NewRequest';
import { isOpen } from './common';
import '../../styles/dcim.css';
import '../../styles/delivery.css';
import '../../styles/ipam.css';
import '../../styles/secops.css';
import '../../styles/macd.css';

export type MacdTab = 'overview' | 'requests' | 'board' | 'schedule' | 'catalog';
export interface MacdProps {
  v: MacdView; all: MacdView; dcId: string;
  q: (k: string) => string;
  set: (patch: Record<string, string>) => void;
  go: (t: MacdTab, extra?: Record<string, string>) => void;
  toast: (title: string, body?: string, link?: { to: string; label: string }) => void;
}

function scope(v: MacdView, dc: string): MacdView {
  if (!dc) return v;
  const reqs = v.requests.filter(r => r.dcId === dc);
  const open = reqs.filter(isOpen);
  return { ...v, requests: reqs, sites: v.sites.filter(s => s.dcId === dc),
    metrics: { ...v.metrics, open: open.length, atRisk: open.filter(r => r.sla === 'At risk').length, breached: open.filter(r => r.sla === 'Breached').length,
      byStage: v.metrics.byStage.map(s => ({ ...s, n: open.filter(r => r.stage === s.stage).length })) } };
}

export function Macd() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as MacdTab) || 'overview';
  const dcId = sp.get('dc') ?? '';
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, val]) => (val ? n.set(k, val) : n.delete(k))); setSp(n, { replace: true }); };
  const go = (t: MacdTab, extra: Record<string, string> = {}) => { const n = new URLSearchParams(); if (dcId) n.set('dc', dcId); if (t !== 'overview') n.set('tab', t); Object.entries(extra).forEach(([k, val]) => val && n.set(k, val)); setSp(n); window.scrollTo({ top: 0 }); };
  usePage([{ label: 'Operate' }, { label: 'MACD', to: '/macd' }, ...subCrumb('macd', tab), ...(dcId ? [{ label: dcId }] : [])], dcId ? { dcId } : {});
  const { data: all } = useQuery(getMacd, []);
  const toast = useToast();
  const v = useMemo(() => (all ? scope(all, dcId) : null), [all, dcId]);
  if (!all || !v) return <Loading />;
  const p: MacdProps = { v, all, dcId, q: k => sp.get(k) ?? '', set, go, toast: toast.show };
  const open = v.requests.filter(isOpen);
  const TABS: { id: MacdTab; label: string; count?: number }[] = [{ id: 'requests', label: 'List', count: v.requests.length }, { id: 'board', label: 'Board', count: open.length }];
  const sites = [...new Set(all.requests.map(r => r.dcId))].sort();
  return (
    <div className="page dcim macd head-1line">
      <PageHead {...subHead('macd', tab, { title: 'MACD', sub: 'Move, add, change and disconnect requests in the datacenter' })}
        actions={<>
          <span className="so-live"><i className="live-dot" />{open.length} open · {v.metrics.breached} past SLA</span>
          <label className="so-scope"><I.Building2 size={14} /><select className="select" value={dcId} onChange={e => set({ dc: e.target.value })} aria-label="Datacenter">
            <option value="">All datacenters</option>{sites.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
          <Btn variant="filled" icon={I.Plus} onClick={() => set({ new: '1' })}>New request</Btn>
        </>} />
      <SubTabs screen="macd" value={tab} onChange={t => go(t)} tabs={TABS} />
      {tab === 'overview' && <MacdOverview {...p} />}
      {tab === 'requests' && <RequestsView {...p} />}
      {tab === 'board' && <BoardView {...p} />}
      {tab === 'schedule' && <ScheduleView {...p} />}
      {tab === 'catalog' && <CatalogView {...p} />}
      {p.q('new') && <NewRequest all={all} dcId={dcId} cat={p.q('cat')} rack={p.q('rack')} onClose={() => set({ new: '', cat: '', rack: '' })} toast={toast.show} />}
      {toast.node}
    </div>
  );
}
