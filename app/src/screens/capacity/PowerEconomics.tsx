import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { getPowerEconomics, useQuery } from '../../api';
import type { SitePowerEcon } from '../../api/types';
import { Loading } from '../../shell/page';
import { SummaryStrip } from '../site/SummaryStrip';
import { Panel } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { DcLink, Meter } from '../../ui/status';
import { Facts } from '../../ui/Analytics';
import { BarList } from '../../charts/BarList';
import { Donut } from '../../charts/Donut';
import { currencySymbol, fmtDate, fmtKw, fmtMoney, fmtNum } from '../../lib/format';
import { PowerFindings } from '../gpu/PowerUse';
import '../../styles/power-econ.css';

/* Capacity → Power → Power economics (21-Oct-2026). What the estate pays for power and where committed power sits idle:
   the deck's "committed MW, take-or-pay, idle megawatts, cost per sold MW" as live figures (mock/power-econ.ts). */

/* small money: a price per kWh or per GPU-hour, never rounded to whole units */
export const fmtRate = (n: number, digits = 2) => `${currencySymbol()}${n.toFixed(digits)}`;
const fmtMw = (kw: number) => `${(kw / 1000).toFixed(kw >= 10_000 ? 0 : 1)} MW`;
const MONTH = 30.4 * 86_400_000;

export function PowerEconomicsTab({ dc }: { dc: string }) {
  const nav = useNavigate();
  const { data: e } = useQuery(() => getPowerEconomics(dc || undefined), [dc]);
  if (!e) return <Loading />;
  const t = e.totals;
  const now = Date.now();
  const renewals = e.sites.filter(s => s.termEnd - now < 12 * MONTH).sort((a, b) => a.termEnd - b.termEnd);
  const idleSites = e.sites.filter(s => s.idleKw > 0);
  const avgEsc = e.sites.length ? e.sites.reduce((a, s) => a + s.escalatorPct, 0) / e.sites.length : 0;
  const soldLabel = t.costPerSoldMwMonth !== null;
  return (
    <>
      <SummaryStrip items={[
        { key: 'bill', label: 'Power bill', value: fmtMoney(t.billMonth), sub: `per month · ${fmtNum(Math.round(t.mwhDay))} MWh/day`, info: 'Energy (facility load × 24 h × the site tariff) plus capacity: the utility demand charge on the higher of peak and take-or-pay floor, or the colocation rate on the whole committed block. Tariffs are published state averages, so this is illustrative until a customer supplies its tariff sheets.' },
        { key: 'tariff', label: 'Blended tariff', value: `${fmtRate(t.blendedTariff, t.blendedTariff < 1 ? 3 : 2)} / kWh`, sub: `energy ${Math.round((t.energyCostMonth / (t.billMonth || 1)) * 100)}% of bill`, info: `Energy cost ÷ energy used across the sites in scope. Source: ${e.sources.tariff}.` },
        { key: 'comm', label: 'Committed vs peak', value: `${fmtMw(t.peakKw)} of ${fmtMw(t.committedKw)}`, sub: `${t.committedKw ? Math.round((t.peakKw / t.committedKw) * 100) : 0}% at peak`, info: 'Contracted power (utility connections and colocation power blocks) against the highest facility draw today.' },
        { key: 'idle', label: 'Idle committed', value: fmtKw(t.idleKw), sub: `${fmtMoney(t.idleCostMonth)} / mo`, tone: t.idleCostMonth > t.billMonth * 0.1 ? 'warn' : undefined, info: 'Power that is billed but not drawn: at a utility site the take-or-pay floor above today\'s peak; at a colocation site the whole committed block above the peak. The deck calls this "paying for idle megawatts".' },
        { key: 'colo', label: 'Colocation blocks', value: `${t.colocationSites} of ${e.sites.length}`, sub: t.colocationSites ? 'per-kW blocks' : 'all utility', info: e.sources.colocation + '. ' + e.sources.demand + '.' },
        soldLabel
          ? { key: 'cps', label: 'Cost per sold MW', value: `${fmtMoney(t.costPerSoldMwMonth!)} / mo`, sub: `${fmtMw(t.soldKw)} sold`, info: 'The whole power bill over the IT power customers are billed for right now (GPU nodes in a running job, tenant contracted power). The IT-MW figure spreads the bill over all IT load instead.' }
          : { key: 'cps', label: 'Cost per IT MW', value: `${fmtMoney(t.costPerItMwMonth)} / mo`, sub: 'nothing sold', info: 'The whole power bill over the IT load. Sold MW needs customers billed for power or GPU capacity.' }
      ]} />
      <PowerFindings e={e} />
      <div className="pe-row">
        <Panel title="Where committed power sits idle" icon={I.PlugZap} sub="Sites paying most for power they do not draw, per month"
          info="Idle cost per site = idle kW × the capacity rate (demand charge, or the colocation per-kW-month rate). Click a site to open its power path in Facilities.">
          {idleSites.length ? <BarList limit={8} items={idleSites.map(s => ({ key: s.id, label: `${s.id} · ${s.city}`, sublabel: `${s.kind === 'colocation' ? `${s.supplier} block` : `${s.supplier} · floor ${s.floorPct}%`} · ${fmtKw(s.idleKw)} of ${fmtKw(s.committedKw)} idle`, value: s.idleCostMonth, display: fmtMoney(s.idleCostMonth), color: s.kind === 'colocation' ? '#F59E0B' : '#64748B', onClick: () => nav(`/facilities?dc=${s.id}&tab=power`) }))} />
            : <div className="ch-empty">Every site draws above its billed floor.</div>}
        </Panel>
        <Panel title="What the bill is made of" icon={I.ReceiptText} sub="Energy used, capacity drawn and capacity paid for but idle"
          info="Energy = kWh × tariff. Capacity drawn = the demand or block charge on the power actually used at peak. Capacity idle = the same charge on power above the peak that the contract bills anyway.">
          <div className="pe-donut">
            <Donut size={150} centerValue={fmtMoney(t.billMonth)} centerLabel="per month" format={v => fmtMoney(v)} slices={[
              { key: 'e', label: 'Energy', value: t.energyCostMonth, color: '#1C81EF' },
              { key: 'c', label: 'Capacity drawn', value: Math.max(0, t.capacityCostMonth - t.idleCostMonth), color: '#94A3B8' },
              { key: 'i', label: 'Capacity idle', value: t.idleCostMonth, color: '#F59E0B' }]} />
            <Facts items={[
              { n: `${avgEsc.toFixed(1)}%`, label: 'average yearly escalator in the power contracts' },
              { n: renewals.length, label: renewals.length ? `contract${renewals.length === 1 ? '' : 's'} end within 12 months · first ${renewals[0].id} ${fmtDate(renewals[0].termEnd)}` : 'contracts end within 12 months', tone: renewals.length ? 'warn' : undefined },
              { n: fmtMw(t.committedKw - t.peakKw), label: 'contracted headroom above today\'s peak' }
            ]} />
          </div>
        </Panel>
      </div>
      <section className="vw-card-section dcl-table">
        <DataTable<SitePowerEcon> rows={e.sites} pageSize={30} defaultSort={{ key: 'idle', dir: 'desc' }} onRow={s => nav(`/facilities?dc=${s.id}&tab=power`)} cols={[
          { key: 'd', header: 'Datacenter', sort: x => x.id, render: x => <span className="cell-2"><DcLink id={x.id} /><small>{x.city}</small></span> },
          { key: 'k', header: 'Power contract', sort: x => `${x.kind}${x.supplier}`, render: x => <span className="cell-2"><span>{x.kind === 'colocation' ? 'Colocation block' : `Utility · floor ${x.floorPct}%`}</span><small>{x.supplier}</small></span> },
          { key: 't', header: 'Tariff / kWh', sort: x => x.tariff, render: x => <span className="num">{fmtRate(x.tariff, x.tariff < 1 ? 3 : 2)}</span> },
          { key: 'p', header: 'Peak of committed', sort: x => x.peakKw / (x.committedKw || 1), render: x => <span className="cell-2"><Meter pct={x.committedKw ? (x.peakKw / x.committedKw) * 100 : 0} width={56} label={fmtKw(x.peakKw)} /><small>of {fmtKw(x.committedKw)}</small></span> },
          { key: 'idle', header: 'Idle cost / mo', sort: x => x.idleCostMonth, render: x => x.idleKw ? <span className="cell-2"><span className={`num${x.idleCostMonth > x.billMonth * 0.15 ? ' bad' : ''}`}>{fmtMoney(x.idleCostMonth)}</span><small>{fmtKw(x.idleKw)} idle</small></span> : <span className="faint">—</span> },
          { key: 'bill', header: 'Bill / month', sort: x => x.billMonth, render: x => <span className="num">{fmtMoney(x.billMonth)}</span> },
          { key: 's', header: 'Sold IT', sort: x => x.soldKw, render: x => <span className="cell-2"><span className="num">{x.soldKw ? fmtKw(x.soldKw) : '—'}</span><small>PUE {x.pue}</small></span> },
          { key: 'cps', header: 'Cost / sold MW', sort: x => x.costPerSoldMwMonth ?? 0, render: x => <span className="num nowrap">{x.costPerSoldMwMonth !== null ? fmtMoney(x.costPerSoldMwMonth) : '—'}</span> },
          { key: 'end', header: 'Term ends', sort: x => x.termEnd, render: x => <span className="cell-2"><span className={`num nowrap${x.termEnd - now < 12 * MONTH ? ' warn' : ''}`}>{fmtDate(x.termEnd)}</span><small>+{x.escalatorPct}% / yr</small></span> }
        ]} />
      </section>
      <p className="pe-note"><I.Info size={13} /> Tariffs: {e.sources.tariff}. {e.sources.demand}. {e.sources.colocation}. Power contracts are seeded per site; a customer's own tariff sheets and contracts replace them.</p>
    </>
  );
}

/* GPU Fleet → Cooling & power: what a GPU-hour costs in power against what it earns (mock/power-econ.ts `gpu`) */
export function GpuPowerCost({ dcId }: { dcId?: string }) {
  const nav = useNavigate();
  const { data: e } = useQuery(() => getPowerEconomics(dcId), [dcId]);
  if (!e) return <Loading />;
  const g = e.gpu;
  if (!g) return null;
  const share = (p: number | null) => p === null ? <span className="faint">—</span> : <span className="pe-sharecell"><span className="pe-share"><i style={{ width: `${Math.min(100, p)}%`, background: p >= 30 ? 'var(--vw-color-red-400)' : p >= 15 ? 'var(--vw-color-amber-400)' : 'var(--primaryColor400)' }} /></span><span className="num nowrap">{p}%</span></span>;
  return (
    <>
      <SummaryStrip items={[
        { key: 'kw', label: 'GPU power now', value: fmtKw(g.nodeKw), sub: `${fmtKw(g.facilityKw)} with cooling and losses (site PUE)`, info: 'Node power of every GPU node in scope (DCGM board power plus the host), and the same with the building\'s share applied through each site\'s PUE.' },
        { key: 'cost', label: 'Power cost', value: `${fmtMoney(g.powerCostDay)} / day`, sub: `${fmtMoney(g.powerCostDay * 30.4)} per month at the site tariffs`, info: 'GPU facility power × 24 h × each site\'s tariff. Tariffs are published state averages, so this is illustrative until a customer supplies its own.' },
        { key: 'cph', label: 'Power per GPU-hour', value: fmtRate(g.costPerGpuHour), sub: `installed · ${g.costPerSoldGpuHour !== null ? fmtRate(g.costPerSoldGpuHour) : '—'} per sold GPU-hour`, info: 'Installed = the fleet\'s power over every GPU. Sold = the same power over only the GPUs earning in a running job; idle and failed GPUs still draw power, so the sold figure is what a billed hour really carries.' },
        { key: 'share', label: 'Power share of price', value: g.powerSharePct !== null ? `${g.powerSharePct}%` : '—', sub: `average price ${fmtRate(g.avgPrice)} per GPU-hour`, tone: (g.powerSharePct ?? 0) >= 15 ? 'warn' : undefined, info: 'Power cost per sold GPU-hour ÷ the average price of the GPU-hours being sold now (the persona\'s rate × each model\'s price factor).' },
        { key: 'idle', label: 'Idle GPUs burning', value: `${fmtMoney(g.idlePowerCostDay)} / day`, sub: `${fmtNum(g.gpus - g.inJobGpus)} of ${fmtNum(g.gpus)} GPUs not earning`, tone: g.idlePowerCostDay > g.powerCostDay * 0.15 ? 'warn' : undefined, info: 'Power cost of GPUs that are powered but not in a running job: idle nodes, allocations to idle jobs and nodes in burn-in. Failed and drained nodes are left out.' },
        { key: 'deck', label: 'Deck assumption', value: fmtRate(g.deck.costPerGpuHour), sub: `1.2 kW · PUE ${g.deck.pue} · blended tariff`, info: 'The pitch deck\'s slide-16 line (1.2 kW per GPU, $0.14 at $0.08/kWh implies PUE 1.46) priced at this estate\'s blended tariff, for comparison with the measured figures beside it.' }
      ]} />
      <Panel title="Power cost per GPU-hour by pod" icon={I.CircleDollarSign} sub="Where power eats the margin: cheap inference GPUs at expensive sites first" flush
        info="One row per pod: node kW per GPU from DCGM, the site's PUE and tariff, the power cost of an installed and of a sold GPU-hour, the model's price per GPU-hour and the share power takes of it. Click a row for the site's power economics in Capacity.">
        <DataTable rows={g.pods.map(p => ({ ...p, id: p.clusterId }))} pageSize={12} defaultSort={{ key: 'share', dir: 'desc' }} onRow={p => nav(`/capacity?tab=economics&dc=${p.dcId}`)} cols={[
          { key: 'pod', header: 'Pod', sort: p => `${p.dcId} ${p.name}`, render: p => <span className="cell-2 nowrap"><span className="gpu-strong">{p.dcId} · {p.name}{p.cooling === 'liquid' && <I.Droplets size={12} style={{ marginLeft: 6, verticalAlign: -1 }} />}</span><small>{p.model}</small></span> },
          { key: 'g', header: 'GPUs earning', sort: p => p.inJob / (p.gpus || 1), render: p => <span className="cell-2"><span className="num">{fmtNum(p.inJob)} of {fmtNum(p.gpus)}</span><small>{p.gpus ? Math.round((p.inJob / p.gpus) * 100) : 0}% earning</small></span> },
          { key: 'kw', header: 'kW / GPU', sort: p => p.kwPerGpu, render: p => <span className="num">{p.kwPerGpu.toFixed(2)}</span> },
          { key: 'pue', header: 'Site PUE · tariff', sort: p => p.pue * p.tariff, render: p => <span className="cell-2"><span className="num">PUE {p.pue}</span><small>{fmtRate(p.tariff, p.tariff < 1 ? 3 : 2)} / kWh</small></span> },
          { key: 'cs', header: 'Per sold GPU-h', sort: p => p.costPerSoldGpuHour ?? 0, render: p => <span className="cell-2"><span className="num">{p.costPerSoldGpuHour !== null ? fmtRate(p.costPerSoldGpuHour) : '—'}</span><small>{fmtRate(p.costPerGpuHour)} installed</small></span> },
          { key: 'pr', header: 'Price / GPU-h', sort: p => p.price, render: p => <span className="num">{fmtRate(p.price)}</span> },
          { key: 'share', header: 'Power share', sort: p => p.powerSharePct ?? -1, render: p => share(p.powerSharePct) },
          { key: 'left', header: 'Left / GPU-h', sort: p => p.leftPerGpuHour ?? 0, render: p => <span className={`num${p.leftPerGpuHour !== null && p.leftPerGpuHour < p.price * 0.5 ? ' bad' : ''}`}>{p.leftPerGpuHour !== null ? fmtRate(p.leftPerGpuHour) : '—'}</span> }
        ]} />
      </Panel>
    </>
  );
}
