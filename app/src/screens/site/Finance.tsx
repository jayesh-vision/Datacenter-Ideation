import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { getLinks, useQuery } from '../../api';
import { Kpi, Panel, Chip, Empty } from '../../ui/kit';
import { BarList } from '../../charts/BarList';
import { fmtDate, fmtMoney, fmtNum, currencySymbol } from '../../lib/format';
import type { SiteData } from './Site';

/* DC-FIN-001…003 — approved vs committed capex, opex run rate and what the
   money buys in delivered capacity. */
export function Finance({ data, view }: { data: SiteData; view: 'capex' | 'opex' }) {
  const { dc, summary: s, plans } = data;
  const { data: links } = useQuery(() => getLinks({ dcId: dc.id, protocol: 'LLDP' }), [dc.id]);
  const gbps = (links ?? []).filter(l => l.role === 'Backhaul' || l.role === 'Uplink').reduce((a, l) => a + l.capacityMbps, 0) / 1000;
  const c = dc.capex;
  const remaining = c.approved - c.committed;
  const kwUse = s.powerKw;
  const racks = dc.racks.length;

  if (view === 'capex') {
    const perUnit = [
      { l: 'per kW of power capacity', v: dc.power.capacityKw ? c.committed / dc.power.capacityKw : 0, basis: `${fmtNum(dc.power.capacityKw)} kW capacity` },
      { l: 'per rack', v: racks ? c.committed / racks : 0, basis: `${racks} racks · ${s.rackTotalU} U` },
      { l: 'per port', v: s.portsTotal ? c.committed / s.portsTotal : 0, basis: `${fmtNum(s.portsTotal)} ports installed` },
      { l: 'per Gbps backhaul', v: gbps ? c.committed / gbps : 0, basis: `${fmtNum(Math.round(gbps))} Gbps uplink + backhaul` }
    ];
    return (
      <div className="col" style={{ gap: 16 }}>
        <div className="kpis">
          <Kpi label="Capex approved" value={fmtMoney(c.approved)} icon={I.BadgeCheck} tone="info" basis="Board-approved build budget" />
          <Kpi label="Committed" value={fmtMoney(c.committed)} icon={I.FileSignature} tone="cyan" basis={`${Math.round((c.committed / c.approved) * 100)}% of approved · POs raised`} />
          <Kpi label="Spent" value={fmtMoney(c.spent)} icon={I.Wallet} tone="purple" basis={`${Math.round((c.spent / c.committed) * 100)}% of committed · invoiced`} />
          <Kpi label="Remaining headroom" value={fmtMoney(remaining)} icon={I.PiggyBank} tone={remaining / c.approved < 0.1 ? 'warning' : 'success'} basis={remaining / c.approved < 0.1 ? 'Under 10% left — new asks need re-approval' : 'Available to commit'} />
        </div>
        <div className="grid g-2-1">
          <Panel title="Capex by line" sub="Approved vs committed — DC-FIN-001" flush>
            <table className="nst-table site-table">
              <thead><tr><th>Line</th><th className="is-right">Approved</th><th className="is-right">Committed</th><th style={{ width: '34%' }}>Committed of approved</th><th className="is-right">Remaining</th></tr></thead>
              <tbody>
                {c.lines.map(l => {
                  const p = l.approved ? (l.committed / l.approved) * 100 : 0;
                  return (
                    <tr key={l.item}><td className="strong" style={{ fontWeight: 500 }}>{l.item}</td><td className="is-right num">{fmtMoney(l.approved)}</td><td className="is-right num">{fmtMoney(l.committed)}</td>
                      <td><span className="fin-bar"><i style={{ width: `${Math.min(100, p)}%`, background: p > 100 ? 'var(--vw-color-red-500)' : 'var(--vw-color-cyan-500)' }} /></span><span className="num faint fin-pct">{Math.round(p)}%</span></td>
                      <td className={`is-right num ${l.approved - l.committed < 0 ? 'bad' : ''}`}>{fmtMoney(l.approved - l.committed)}</td></tr>
                  );
                })}
                <tr className="row-total"><td>Total</td><td className="is-right num">{fmtMoney(c.approved)}</td><td className="is-right num">{fmtMoney(c.committed)}</td><td><span className="fin-bar"><i style={{ width: `${(c.committed / c.approved) * 100}%`, background: 'var(--vw-color-cyan-600)' }} /></span><span className="num faint fin-pct">{Math.round((c.committed / c.approved) * 100)}%</span></td><td className="is-right num">{fmtMoney(remaining)}</td></tr>
              </tbody>
            </table>
          </Panel>
          <Panel title="Cost to capacity" sub="DC-FIN-003 · committed capex per unit delivered">
            <div className="col" style={{ gap: 12 }}>
              {perUnit.map(u => (
                <div key={u.l} className="ctc-row"><span className="cell-2"><b className="num strong">{u.v ? fmtMoney(u.v) : '—'}</b><small>{u.l}</small></span><span className="faint" style={{ fontSize: 12, textAlign: 'right' }}>{u.basis}</span></div>
              ))}
            </div>
          </Panel>
        </div>
        <Panel title="Capacity plans at this site" sub="Approved / executing plans add to committed capex when POs are raised" count={plans.length} flush actions={<Link to="/capacity" className="panel-link">Capacity & forecast<I.ChevronRight size={14} /></Link>}>
          {plans.length ? (
            <table className="nst-table site-table">
              <thead><tr><th>Plan</th><th>Dimension</th><th className="is-right">Adds</th><th className="is-right">Capex</th><th>Target</th><th>Status</th></tr></thead>
              <tbody>{plans.map(p => <tr key={p.id}><td><span className="cell-2"><b className="strong" style={{ fontWeight: 500 }}>{p.title}</b><small className="mono">{p.id}</small></span></td><td>{p.dimension}</td><td className="is-right num">+{fmtNum(p.amount)} {p.unit}</td><td className="is-right num">{fmtMoney(p.capex)}</td><td className="num nowrap">{fmtDate(p.target)}</td><td><Chip tone={p.status === 'Executing' ? 'purple' : p.status === 'Approved' ? 'info' : p.status === 'Delivered' ? 'success' : 'warning'} size="xs">{p.status}</Chip></td></tr>)}</tbody>
            </table>
          ) : <Empty icon={I.ClipboardList} title="No capacity plans raised for this site" />}
        </Panel>
      </div>
    );
  }

  const o = dc.opex;
  const elec = o.drivers.find(d => d.item === 'Electricity')?.monthly ?? 0;
  const kwh = kwUse * 730;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="kpis">
        <Kpi label="Opex run rate" value={o.monthly ? fmtMoney(o.monthly) : '—'} unit={o.monthly ? '/ mo' : undefined} icon={I.Repeat} tone="cyan" basis={o.monthly ? `${fmtMoney(o.monthly * 12)} annualised` : 'Site not yet billing'} />
        <Kpi label="Per kW in use" value={kwUse && o.monthly ? fmtMoney(o.monthly / kwUse) : '—'} unit="/ mo" icon={I.Zap} tone="warning" basis={`${kwUse} kW total facility load`} />
        <Kpi label="Per network element" value={s.discovered && o.monthly ? fmtMoney(o.monthly / s.discovered) : '—'} unit="/ mo" icon={I.Router} tone="info" basis={`${s.discovered} live NE`} />
        <Kpi label="Energy unit cost" value={kwh && elec ? `${currencySymbol()}${(elec / kwh).toFixed(2)}` : '—'} unit="/ kWh" icon={I.PlugZap} tone="purple" basis={`${fmtNum(Math.round(kwh))} kWh / mo at PUE ${dc.power.pue}`} />
      </div>
      <div className="grid g-2">
        <Panel title="Major cost drivers" sub="DC-FIN-002 · monthly run rate by driver">
          {o.monthly ? <BarList items={o.drivers.map(d => ({ key: d.item, label: d.item, value: d.monthly, display: fmtMoney(d.monthly), secondary: `${Math.round((d.monthly / o.monthly) * 100)}%` }))} color="var(--vw-color-teal-500)" /> : <Empty icon={I.Wallet} title="No recurring cost yet">Opex starts at on-air hand-over.</Empty>}
        </Panel>
        <Panel title="Annualised view" sub="Run rate × 12, before escalation clauses" flush>
          <table className="nst-table site-table">
            <thead><tr><th>Driver</th><th className="is-right">Monthly</th><th className="is-right">Annual</th><th className="is-right">Share</th></tr></thead>
            <tbody>
              {o.drivers.map(d => <tr key={d.item}><td>{d.item}</td><td className="is-right num">{fmtMoney(d.monthly)}</td><td className="is-right num">{fmtMoney(d.monthly * 12)}</td><td className="is-right num faint">{o.monthly ? Math.round((d.monthly / o.monthly) * 100) : 0}%</td></tr>)}
              <tr className="row-total"><td>Total</td><td className="is-right num">{fmtMoney(o.monthly)}</td><td className="is-right num">{fmtMoney(o.monthly * 12)}</td><td className="is-right num">100%</td></tr>
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
