/* MACD → New request (drawer): type (Move / Add / Change / Disconnect) → catalogue item → datacenter → rack (and the target for a move)
   → quantity, priority, note. The feasibility checks, charges and due date are previewed live against the estate before submitting;
   a request with a failing check can still be submitted (it waits in Feasibility until the blocker is cleared or it is rejected). */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { createMacd, defaultDcId, getDatacenter, getDatacenters, previewMacd, useQuery } from '../../api';
import type { MacdCheck, MacdKind, MacdPriority, MacdView } from '../../api/types';
import { Btn, Drawer, Field, Seg } from '../../ui/kit';
import { fmtDateTime } from '../../lib/format';
import { KINDS, KIND_ICON, hrs, money, mrcLine } from './common';

type Preview = Awaited<ReturnType<typeof previewMacd>>;
export const CHECK_ICON: Record<MacdCheck['result'], I.LucideIcon> = { Pass: I.CircleCheck, Warn: I.CircleAlert, Fail: I.CircleX };
export function Checks({ checks }: { checks: MacdCheck[] }) {
  return <ul className="mc-checks">{checks.map((c, i) => { const Ic = CHECK_ICON[c.result]; return <li key={i} className={`is-${c.result.toLowerCase()}`}><Ic size={15} /><span className="cell-2"><b>{c.label}</b><small>{c.detail}</small></span></li>; })}</ul>;
}

export function NewRequest({ all, dcId: scopeDc, cat, rack, onClose, toast }: { all: MacdView; dcId: string; cat: string; rack: string; onClose: () => void; toast: (t: string, b?: string, l?: { to: string; label: string }) => void }) {
  const nav = useNavigate();
  const c0 = all.catalog.find(c => c.id === cat);
  const [kind, setKind] = useState<MacdKind>(c0?.kind ?? 'Add');
  const [catId, setCat] = useState(c0?.id ?? all.catalog.find(c => c.kind === 'Add')?.id ?? all.catalog[0]?.id ?? '');
  const [dcId, setDc] = useState(scopeDc || (rack ? rack.replace(/^([A-Z]{2}-DC-\d{3}).*/, '$1') : defaultDcId()));
  const [rackId, setRack] = useState(rack);
  const [toRackId, setTo] = useState('');
  const [qty, setQty] = useState(1);
  const [priority, setPrio] = useState<MacdPriority>('Standard');
  const [detail, setDetail] = useState('');
  const [pv, setPv] = useState<Preview | null>(null);
  const [err, setErr] = useState('');
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: dcs } = useQuery(getDatacenters, []);
  const { data: site } = useQuery(() => getDatacenter(dcId), [dcId]);
  const item = all.catalog.find(c => c.id === catId);
  const needsRack = item && item.object !== 'IP addresses' && item.object !== 'Access';
  const racks = useMemo(() => (site?.dc.racks ?? []).filter(r => !/ODF/i.test(r.role)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [site]);
  const draft = { catalogId: catId, dcId, rackId: needsRack ? rackId || undefined : undefined, toRackId: item?.kind === 'Move' ? toRackId || undefined : undefined, qty, priority, detail };
  const key = JSON.stringify(draft);
  useEffect(() => {
    let live = true; setErr('');
    setFailed('');
    previewMacd(draft).then(x => live && setPv(x)).catch(e => { if (live) { setPv(null); setErr(String(e.message ?? e)); } });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickKind = (k: MacdKind) => { setKind(k); const first = all.catalog.find(c => c.kind === k); if (first) setCat(first.id); };
  const submit = () => { setBusy(true); createMacd(draft).then(id => { toast(`${id} submitted`, pv?.title, { to: `/macd/requests/${id}`, label: 'Open the request' }); onClose(); nav(`/macd/requests/${id}`); }).catch(e => { setFailed(String(e.message ?? e)); setBusy(false); }); };
  const fails = pv?.checks.filter(c => c.result === 'Fail').length ?? 0;
  const live = (dcs ?? []).filter(d => d.status === 'on-air');
  /* the default datacenter may not be in service yet: start on the first live one */
  useEffect(() => { if (live.length && !live.some(d => d.id === dcId)) { setDc(live[0].id); setRack(''); } }, [live.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Drawer open onClose={onClose} width={720} title="New MACD request" sub="Move, add, change or disconnect something in a datacenter"
      foot={<div className="row" style={{ justifyContent: 'space-between', width: '100%', gap: 8 }}>
        <span className="vw-label">{failed ? <span className="so-bad">{failed}</span> : err ? err : fails ? `${fails} check${fails === 1 ? '' : 's'} failing: it waits in Feasibility` : pv ? `Due ${fmtDateTime(pv.due)} (${hrs(pv.slaH)} SLA)` : ''}</span>
        <span className="row" style={{ gap: 8 }}><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Send} disabled={!pv || busy} onClick={submit}>Submit request</Btn></span></div>}>
      <div className="col mc-form" style={{ gap: 14 }}>
        <Field label="What kind of request">
          <Seg options={KINDS.map(k => ({ id: k, label: k, icon: KIND_ICON[k] }))} value={kind} onChange={pickKind} />
        </Field>
        <Field label="Request type" required hint={item?.desc}>
          <select className="select" style={{ width: '100%' }} value={catId} onChange={e => setCat(e.target.value)}>
            {all.catalog.filter(c => c.kind === kind).map(c => <option key={c.id} value={c.id}>{c.name} · {c.object}</option>)}</select>
        </Field>
        <div className="grid g-2">
          <Field label="Datacenter" required><select className="select" style={{ width: '100%' }} value={dcId} onChange={e => { setDc(e.target.value); setRack(''); setTo(''); }}>
            {live.map(d => <option key={d.id} value={d.id}>{d.id} · {d.city}</option>)}</select></Field>
          {needsRack && <Field label={item?.object === 'Cabinet' && item.kind === 'Add' ? 'Next to cabinet' : item?.kind === 'Move' ? 'From rack' : 'Rack or cabinet'} required>
            <select className="select" style={{ width: '100%' }} value={rackId} onChange={e => setRack(e.target.value)}>
              <option value="">Pick a rack…</option>
              {racks.map(r => <option key={r.id} value={r.id}>{r.name} · {r.room} · {r.heightU - r.usedU} U free · {r.drawKw.toFixed(1)}/{r.budgetKw} kW{r.owner === 'tenant' ? ' · tenant' : ''}</option>)}</select></Field>}
          {item?.kind === 'Move' && <Field label={item.object === 'Cabinet' ? 'To a hall, next to' : 'To rack'} required>
            <select className="select" style={{ width: '100%' }} value={toRackId} onChange={e => setTo(e.target.value)}>
              <option value="">Pick the target…</option>
              {racks.filter(r => item.object === 'Equipment' || r.id !== rackId).map(r => <option key={r.id} value={r.id}>{r.name} · {r.room} · {r.heightU - r.usedU} U free · {r.drawKw.toFixed(1)}/{r.budgetKw} kW</option>)}</select></Field>}
          <Field label={`How many (${item?.unit ?? 'units'}${item?.unit === 'kW' ? ` · ${Math.abs(item.kwPerUnit)} kW each` : ''})`} required>
            <input className="input" type="number" min={1} max={50} value={qty} onChange={e => setQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></Field>
          <Field label="Priority"><Seg options={(['Standard', 'Expedited', 'Emergency'] as const).map(p => ({ id: p, label: p }))} value={priority} onChange={setPrio} /></Field>
        </div>
        <Field label="Details for the field team" hint="Device names, port numbers, power-down window agreed with the customer…"><textarea className="input" rows={2} value={detail} onChange={e => setDetail(e.target.value)} /></Field>

        {pv && <section className="mc-preview">
          <header><b>{pv.title}</b><small>{pv.customerName ? `for ${pv.customerName}` : 'internal request'} · {pv.standard ? 'standard change (pre-approved)' : 'normal change through the change board'}</small></header>
          <div className="mc-pv-figs">
            <span><em>One-time</em><b>{pv.billable ? money(pv.nrc) : '—'}</b></span>
            <span><em>Monthly</em><b>{pv.billable ? mrcLine(pv.mrcDelta) : '—'}</b></span>
            <span><em>Rack space</em><b>{pv.uDelta ? `${pv.uDelta > 0 ? '+' : ''}${pv.uDelta} U` : '—'}</b></span>
            <span><em>Power</em><b>{pv.kwDelta ? `${pv.kwDelta > 0 ? '+' : ''}${pv.kwDelta} kW` : '—'}</b></span>
            <span><em>Due</em><b>{hrs(pv.slaH)}</b></span>
          </div>
          <h5>Feasibility</h5>
          <Checks checks={pv.checks} />
        </section>}
      </div>
    </Drawer>
  );
}
