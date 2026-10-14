/* Floor plans: pick a site and a hall; the hall's racks are drawn on the same grid the 3D twin uses (rows in order, paired face
   to face around a cold aisle). Colour by power, space, inlet temperature or status; a rack opens its rack page. */
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDcim, useQuery } from '../../api';
import type { DcimHall, DcimRack } from '../../api/types';
import { Loading } from '../../shell/page';
import { useState } from 'react';
import { Btn, Chip, Info, KV, Panel, Seg } from '../../ui/kit';
import { NewRackModal } from './forms';
import { Meter } from '../../ui/status';
import { fmtKw, fmtNum } from '../../lib/format';
import { ACCENT, loadColor, pct, rackFill, type PlanMeasure } from './common';

const MEASURES: { id: PlanMeasure; label: string }[] = [{ id: 'power', label: 'Power' }, { id: 'space', label: 'Space' }, { id: 'temp', label: 'Thermal' }, { id: 'density', label: 'Density' }, { id: 'tenant', label: 'Tenant' }, { id: 'status', label: 'Status' }];
const LEGEND: Record<PlanMeasure, { c: string; l: string }[]> = {
  power: [{ c: 'var(--vw-color-blue-50)', l: '< 50%' }, { c: 'var(--vw-color-blue-200)', l: '50–79%' }, { c: 'var(--vw-color-amber-200)', l: '80–89%' }, { c: 'var(--vw-color-red-200)', l: '≥ 90% of budget' }],
  space: [{ c: 'var(--vw-color-blue-50)', l: '< 50% U' }, { c: 'var(--vw-color-blue-200)', l: '50–89%' }, { c: 'var(--vw-color-amber-200)', l: '≥ 90% U used' }],
  temp: [{ c: 'var(--vw-color-green-100)', l: '≤ 25°C' }, { c: 'var(--vw-color-amber-200)', l: '25–27°C' }, { c: 'var(--vw-color-red-200)', l: '> 27°C inlet' }],
  density: [{ c: 'var(--vw-color-slate-100)', l: 'Standard (< 15 kW)' }, { c: 'var(--vw-color-blue-200)', l: 'High (≥ 15 kW)' }, { c: 'var(--vw-color-purple-200, #e9d5ff)', l: 'AI / GPU' }],
  tenant: [{ c: 'var(--vw-color-slate-50)', l: 'Operator' }, { c: 'var(--vw-color-cyan-100, #cffafe)', l: 'Tenant < 90% of contract' }, { c: 'var(--vw-color-amber-200)', l: '90–100%' }, { c: 'var(--vw-color-red-200)', l: 'Over contract' }],
  status: [{ c: 'var(--vw-color-green-100)', l: 'Active, A + B fed' }, { c: 'var(--vw-color-gray-100)', l: 'Tenant' }, { c: 'var(--vw-color-blue-50)', l: 'Planned' }, { c: 'var(--vw-color-red-200)', l: 'One power side down' }]
};

export function FloorPlans({ dcId, onSite }: { dcId: string; onSite: (id: string) => void }) {
  const [sp, setSp] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const nav = useNavigate();
  const { data: all } = useQuery(() => getDcim(), []);
  const { data } = useQuery(() => getDcim({ dcId }), [dcId]);
  if (!data || !all) return <Loading />;
  const halls = data.halls;
  const hallId = sp.get('hall') && halls.some(h => h.id === sp.get('hall')) ? sp.get('hall')! : (halls.find(h => h.racks) ?? halls[0])?.id;
  const m = (sp.get('m') as PlanMeasure) || 'power';
  const setP = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const hall = halls.find(h => h.id === hallId);
  const site = data.sites[0];
  const floors = [...new Set(halls.map(h => h.floor))];

  return (
    <div className="dcim-fp">
      <section className="vw-card-section dcim-fp-bar">
        <select className="select" value={dcId} onChange={e => onSite(e.target.value)} aria-label="Datacenter">
          {all.sites.map(s => <option key={s.id} value={s.id}>{s.id} · {s.city}</option>)}
        </select>
        <div className="dcim-fp-halls" role="tablist" aria-label="Halls">
          {floors.map(f => (
            <span key={f} className="dcim-fp-floor"><small>{f}</small>
              {halls.filter(h => h.floor === f).map(h => (
                <button key={h.id} type="button" role="tab" aria-selected={h.id === hallId} className={`dcim-hall-pill${h.id === hallId ? ' is-on' : ''}`} onClick={() => setP('hall', h.id)}>
                  {h.name}<b>{h.racks}</b>
                </button>
              ))}
            </span>
          ))}
        </div>
        <span className="dcim-fp-colour"><span className="vw-label">Colour by</span><Seg size="sm" value={m} onChange={v => setP('m', v === 'power' ? '' : v)} options={MEASURES} /></span>
      </section>

      {!hall ? <Panel title="No halls"><p className="vw-label">This site has no rooms recorded yet.</p></Panel> : (
        <div className="dcim-fp-grid">
          <Panel title={<>{hall.name}<span className="vw-label"> · {hall.floor} · {site?.id}</span></>} icon={I.LayoutGrid}
            info="The hall's racks on the twin's grid: rows in order, paired face to face around a cold aisle (fronts facing the aisle). Click a rack to open it."
            actions={<span className="row" style={{ gap: 10 }}><span className="dcim-legend">{LEGEND[m].map(x => <span key={x.l}><i style={{ background: x.c }} />{x.l}</span>)}</span>{site?.status !== 'planned' && <Btn size="sm" icon={I.Plus} onClick={() => setAdding(true)}>New rack</Btn>}</span>}>
            <Plan hall={hall} racks={data.racks.filter(r => r.hallId === hall.id)} rows={data.rows.filter(r => r.hallId === hall.id)} m={m} onRack={id => nav(`/dcim/racks/${encodeURIComponent(id)}`)} onAdd={() => setAdding(true)} />
          </Panel>
          <HallFacts hall={hall} racks={data.racks.filter(r => r.hallId === hall.id)} />
        </div>
      )}
      <NewRackModal open={adding} onClose={() => setAdding(false)} dcId={dcId} hallId={hall?.id} />
    </div>
  );
}

function Plan({ hall, racks, rows, m, onRack, onAdd }: { hall: DcimHall; racks: DcimRack[]; rows: { id: string; name: string; racks: string[]; containment: string }[]; m: PlanMeasure; onRack: (id: string) => void; onAdd: () => void }) {
  if (!racks.length) return <div style={{ padding: 16 }}><p className="vw-label">No racks in this room yet.</p><button type="button" className="dcim-rk is-ghost" onClick={onAdd}><I.Plus size={14} /><small>New rack</small></button></div>;
  const byId = new Map(racks.map(r => [r.id, r]));
  /* rows come in pairs (A faces B across a cold aisle); a lone last row has no partner */
  const pairs: typeof rows[] = [];
  for (let i = 0; i < rows.length; i += 2) pairs.push(rows.slice(i, i + 2));
  return (
    <div className="dcim-plan" style={{ ['--cols' as string]: hall.gridCols }}>
      {pairs.map((pr, pi) => (
        <div key={pi} className="dcim-pair">
          {pr.map((row, k) => (
            <div key={row.id} className="dcim-row-wrap">
              {k === 1 && <div className="dcim-aisle cold"><span>Cold aisle · {pr[0].name} ↔ {row.name}</span></div>}
              <div className={`dcim-row${k === 1 ? ' is-back' : ''}`}>
                <span className="dcim-row-l">{row.name}</span>
                {row.racks.map(id => { const r = byId.get(id)!; const f = rackFill(r, m); return (
                  <button key={id} type="button" className={`dcim-rk${r.status === 'Planned' ? ' is-planned' : ''}${r.power !== 'A + B' && r.status !== 'Planned' ? ' is-bad' : ''}`} style={{ background: f.color }} onClick={() => onRack(id)}
                    title={`${r.name} · ${r.role} · ${r.usedU}/${r.heightU} U · ${r.drawKw} of ${r.budgetKw} kW · ${r.power}${r.tenantName ? ` · ${r.tenantName}` : ''}`}>
                    <b>{r.name.replace(/^RACK-/, '')}</b><small>{f.label}</small>
                    {r.liquid && <I.Droplets size={11} className="dcim-rk-liq" aria-label="Liquid cooled" />}
                  </button>
                ); })}
                {pi === pairs.length - 1 && k === pr.length - 1 && Array.from({ length: Math.max(0, hall.gridCols - row.racks.length) }, (_, g) => (
                  <button key={`g${g}`} type="button" className="dcim-rk is-ghost" onClick={onAdd} title="Empty position: add a rack here (racks fill the row in order)"><I.Plus size={13} /><small>Free</small></button>))}
              </div>
            </div>
          ))}
          {pi < pairs.length - 1 && <div className="dcim-aisle hot"><span>Hot aisle</span></div>}
        </div>
      ))}
    </div>
  );
}

function HallFacts({ hall, racks }: { hall: DcimHall; racks: DcimRack[] }) {
  const hot = racks.filter(r => r.powerPct >= 90);
  return (
    <Panel title="Hall" icon={I.Info} info="What the hall holds and what feeds it: the A and B busways each hang off one UPS module (or the −48 V plant), and the room's cooling units carry its air heat.">
      <div className="dcim-hall-facts">
        <div><span className="vw-label">Rack space</span><Meter pct={pct(hall.usedU, hall.totalU)} color={ACCENT} width={110} label={`${fmtNum(hall.usedU)}/${fmtNum(hall.totalU)} U`} /></div>
        <div><span className="vw-label">Rack power</span><Meter pct={pct(hall.drawKw, hall.budgetKw)} color={loadColor(pct(hall.drawKw, hall.budgetKw))} width={110} label={`${fmtKw(hall.drawKw)} of ${fmtKw(hall.budgetKw)}`} /></div>
        <KV cols={2} items={[
          ['Kind', hall.kind], ['Cooling', hall.cooling],
          ['Racks', `${hall.racks} in ${hall.rows} row${hall.rows === 1 ? '' : 's'}`], ['Devices', fmtNum(hall.devices)],
          [<>Busway A <Info text="The A side of every cabinet in this hall is fed from this UPS module." /></>, hall.busA], ['Busway B', hall.busB],
          ['Cooling units', hall.coolingUnits.length ? hall.coolingUnits.join(', ') : 'Shared with the floor'], ['Containment', hall.rows >= 2 ? 'Cold aisle between paired rows' : 'None (single row)']
        ]} />
        {hot.length > 0 && <div className="dcim-hall-warn"><I.TriangleAlert size={14} />{hot.length} rack{hot.length > 1 ? 's' : ''} at ≥ 90% of budget: {hot.slice(0, 4).map(r => r.name).join(', ')}{hot.length > 4 ? ` +${hot.length - 4}` : ''}</div>}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Chip tone="neutral">{hall.gridCols} × {hall.gridRows} grid</Chip>
          <Link className="ent-link" to={`/datacenters/${hall.dcId}?twin=realistic`}>Open the 3D twin →</Link>
        </div>
      </div>
    </Panel>
  );
}
