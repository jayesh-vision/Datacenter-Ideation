/* MACD → Requests: the list (search, Type / Stage quick filters, object, priority, SLA, customer, checks in the panel) and the board
   (one column per open stage, cards worst SLA first). A row or card opens the request page. URL: q kind stage open sla obj prio cust chk. */
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import type { MacdRequest } from '../../api/types';
import { DataTable } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { fmtAgo, fmtNum } from '../../lib/format';
import type { MacdProps } from './Macd';
import { FLOW, KINDS, KindChip, OBJECTS, OBJ_ICON, OPEN_STAGES, PrioChip, SlaChip, StageChip, isOpen, mrcLine, slaLine } from './common';

function useRows(p: MacdProps) {
  const { v, q } = p;
  const kind = q('kind'), stage = q('stage'), open = q('open'), sla = q('sla'), obj = q('obj'), prio = q('prio'), cust = q('cust'), chk = q('chk'), search = q('q');
  const rows = v.requests.filter(r => (!kind || r.kind === kind) && (!stage || r.stage === stage) && (!open || (open === 'draft' ? r.stage === 'Draft' : isOpen(r))) && (!sla || r.sla === sla) && (!obj || r.object === obj) && (!prio || r.priority === prio)
    && (!cust || (cust === '_int' ? !r.customerId : r.customerId === cust))
    && (!chk || (chk === 'fail' ? isOpen(r) && r.checks.some(c => c.result === 'Fail') : chk === 'blocked' ? !!r.changeBlocked : chk === 'cr' ? r.changeStatus === 'Pending approval' : true))
    && (!search || `${r.id} ${r.title} ${r.dcId} ${r.rackName ?? ''} ${r.customerName ?? ''} ${r.requester} ${r.changeId ?? ''} ${r.ref ?? ''} ${r.workRef ?? ''}`.toLowerCase().includes(search.toLowerCase())));
  return { rows, kind, stage, open, sla, obj, prio, cust, chk, search };
}

function Toolbar({ p, shown, layout }: { p: MacdProps; shown: number; layout?: 'list' | 'board' }) {
  const { v, set, go } = p;
  const apply = useParamPatch();
  const f = useRows(p);
  const count = (fn: (r: MacdRequest) => boolean) => v.requests.filter(fn).length;
  const custs = [...new Map(v.requests.filter(r => r.customerId).map(r => [r.customerId!, r.customerName ?? r.customerId!])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <ListToolbar shown={shown} total={layout === 'board' ? v.requests.filter(isOpen).length : v.requests.length} noun={layout === 'board' ? 'open requests' : 'requests'} onApply={apply}
      search={{ value: f.search, onChange: x => set({ q: x }), placeholder: 'Request, rack, customer, change, work order' }}
      layout={{ value: layout === 'board' ? 'tiles' : 'list', onChange: x => go(x === 'tiles' ? 'board' : 'requests', Object.fromEntries(['q', 'kind', 'obj', 'prio', 'cust', 'sla'].map(k => [k, p.q(k)]))) }}
      filters={[
        { id: 'kind', label: 'Type', quick: true, value: f.kind, anyLabel: 'Any type', onChange: x => set({ kind: x }), options: KINDS.map(k => ({ id: k, label: k, count: count(r => r.kind === k) })) },
        ...(layout === 'board' ? [] : [{ id: 'stage', label: 'Stage', quick: true, value: f.stage, anyLabel: 'Any stage', onChange: (x: string) => set({ stage: x }), options: [...FLOW, 'Rejected', 'Cancelled'].map(s => ({ id: s, label: s, count: count(r => r.stage === s) })).filter(o => o.count) }]),
        { id: 'obj', label: 'What', value: f.obj, anyLabel: 'Anything', onChange: x => set({ obj: x }), options: OBJECTS.map(o => ({ id: o, label: o, count: count(r => r.object === o) })).filter(o => o.count) },
        { id: 'sla', label: 'SLA', value: f.sla, anyLabel: 'Any', onChange: x => set({ sla: x }), options: (['Breached', 'At risk', 'On track', 'Met', 'Missed'] as const).map(s => ({ id: s, label: s === 'Breached' ? 'Past SLA' : s, count: count(r => r.sla === s && (s !== 'Met' || r.stage === 'Completed')) })).filter(o => o.count) },
        { id: 'prio', label: 'Priority', value: f.prio, anyLabel: 'Any priority', onChange: x => set({ prio: x }), options: (['Emergency', 'Expedited', 'Standard'] as const).map(s => ({ id: s, label: s, count: count(r => r.priority === s) })) },
        ...(custs.length ? [{ id: 'cust', label: 'Customer', value: f.cust, anyLabel: 'Any customer', onChange: (x: string) => set({ cust: x }), options: [...custs.map(([id, name]) => ({ id, label: name, count: count(r => r.customerId === id) })), ...(v.requests.some(r => !r.customerId) ? [{ id: '_int', label: 'Internal teams', count: count(r => !r.customerId) }] : [])] }] : []),
        { id: 'chk', label: 'Checks', value: f.chk, anyLabel: 'Any', onChange: x => set({ chk: x }), options: [{ id: 'fail', label: 'Failing feasibility', count: count(r => isOpen(r) && r.checks.some(c => c.result === 'Fail')) }, { id: 'cr', label: 'Change waiting for approval', count: count(r => r.changeStatus === 'Pending approval') }, { id: 'blocked', label: 'Change blocked by policy', count: count(r => !!r.changeBlocked) }] },
        ...(layout === 'board' ? [] : [{ id: 'open', label: 'Show', value: f.open, anyLabel: 'All requests', onChange: (x: string) => set({ open: x }), options: [{ id: '1', label: 'Open only', count: count(isOpen) }, { id: 'draft', label: 'Drafts (not submitted)', count: count(r => r.stage === 'Draft') }] }])
      ]} />
  );
}

export function RequestsView(p: MacdProps) {
  const nav = useNavigate();
  const { rows } = useRows(p);
  const now = p.v.now;
  return (
    <section className="vw-card-section dcim-table">
      <DataTable rows={rows} pageSize={30} defaultSort={{ key: 'created', dir: 'desc' }} onRow={r => nav(`/macd/requests/${r.id}`)} rowClass={r => (isOpen(r) || r.stage === 'Draft' ? '' : 'is-muted')}
        toolbar={<Toolbar p={p} shown={rows.length} />}
        cols={[
          { key: 'created', header: 'Submitted', sort: r => r.created, render: r => <span className="cell-2"><span className="nowrap">{r.stage === 'Draft' ? `Draft · saved ${fmtAgo(r.created, now)}` : fmtAgo(r.created, now)}</span><small className="mono">{r.id}</small></span> },
          { key: 'kind', header: 'Type', sort: r => r.kind, render: r => <KindChip k={r.kind} /> },
          { key: 't', header: 'Request', wrap: true, sort: r => r.title, render: r => { const Ic = OBJ_ICON[r.object]; return <span className="cell-2"><b>{r.title}</b><small className="mc-obj"><Ic size={12} />{r.object} · {r.dcId}{r.room ? ` · ${r.room}` : ''}</small></span>; } },
          { key: 'who', header: 'For', wrap: true, sort: r => r.customerName ?? r.requester, render: r => <span className="cell-2"><span>{r.customerName ?? r.requester}</span><small>{r.customerName ? `${r.requester} · ${r.channel}` : 'Internal'}</small></span> },
          { key: 'prio', header: 'Priority', sort: r => ['Emergency', 'Expedited', 'Standard'].indexOf(r.priority), hideBelow: 1380, render: r => <PrioChip p={r.priority} /> },
          { key: 'stage', header: 'Stage', sort: r => FLOW.indexOf(r.stage), render: r => <span className="cell-2"><StageChip s={r.stage} /><small className="mono">{r.changeId ? `${r.changeId}${r.changeStatus === 'Pending approval' ? ' · awaiting approval' : ''}` : r.ref ?? ''}</small></span> },
          { key: 'sla', header: 'SLA', sort: r => (isOpen(r) ? r.slaLeftH : 1e6), render: r => <span className="cell-2"><SlaChip s={r.sla} draft={r.stage === 'Draft'} /><small>{slaLine(r)}</small></span> },
          { key: 'mrc', header: 'Monthly', sort: r => r.mrcDelta, hideBelow: 1380, render: r => <span className="rev-amt">{r.billable ? mrcLine(r.mrcDelta) : '—'}</span> }
        ]} />
    </section>
  );
}

export function BoardView(p: MacdProps) {
  const nav = useNavigate();
  const { rows } = useRows(p);
  const open = rows.filter(isOpen);
  const cols = OPEN_STAGES.filter(s => s !== 'Quote' || p.v.requests.some(r => r.billable));
  return (
    <section className="vw-card-section mc-board-wrap">
      <Toolbar p={p} shown={open.length} layout="board" />
      <div className="mc-board" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
        {cols.map(s => { const xs = open.filter(r => r.stage === s).sort((a, b) => a.slaLeftH - b.slaLeftH); return (
          <div key={s} className="mc-col">
            <header><StageChip s={s} /><b>{fmtNum(xs.length)}</b></header>
            <div className="mc-cards">
              {xs.map(r => { const Ic = OBJ_ICON[r.object]; return (
                <button type="button" key={r.id} className={`mc-card sla-${r.sla.replace(' ', '-').toLowerCase()}`} onClick={() => nav(`/macd/requests/${r.id}`)}>
                  <span className="mc-card-h"><KindChip k={r.kind} /><span className="mono">{r.id}</span></span>
                  <b>{r.title}</b>
                  <small className="mc-obj"><Ic size={12} />{r.dcId}{r.rackName ? ` · ${r.rackName}` : ''}</small>
                  <small>{r.customerName ?? r.requester}</small>
                  <span className="mc-card-f"><SlaChip s={r.sla} /><small>{slaLine(r)}</small>{r.changeStatus === 'Pending approval' && <I.Hourglass size={13} aria-label="Change waiting for approval" />}</span>
                </button>); })}
              {!xs.length && <p className="vw-label mc-none">None</p>}
            </div>
          </div>); })}
      </div>
    </section>
  );
}
