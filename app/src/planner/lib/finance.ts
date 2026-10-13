/**
 * Finance — the investment view of a plan: a yearly cash flow built month by month, depreciation by
 * asset class, tax, NPV and IRR at the hurdle rate, and payback.
 *
 *  - CapEx lands when it is spent: plant and shell over the build window before each phase goes live,
 *    land at the start, IT just before go-live and again at every refresh (when the operator owns it).
 *  - Revenue follows the phase's capacity × fill: the pre-let share from day one, then a straight ramp
 *    to the target fill over the ramp months.
 *  - Energy follows the IT actually drawn (sold capacity × draw share × PUE). It is recovered from
 *    tenants only on multi-tenant sites.
 *  - Depreciation is straight line from the go-live of the phase: shell 30 years, MEP 15–20 years,
 *    IT over its refresh cycle; land is not depreciated.
 *  - Tax is charged on profit after depreciation, with losses carried forward.
 *
 * The families (plant, network, refresh, migration) use the small helpers at the bottom for their
 * own business cases: payback on a benefit, incremental OpEx lines and a contingency line.
 */
import type * as T from '../p2b/types';
import type { CashflowYear, EstimateLine } from './engine';
import type { PlannerData } from './plannerData';

const MONTH_MS = 30.4375 * 864e5;
const r0 = (n: number) => Math.round(n);

export type AssetClass = 'land' | 'shell' | 'mep' | 'it' | 'other';
export interface CapexItem {
  label: string; amount: number; assetClass: AssetClass;
  /** When the asset goes into service (depreciation starts); spending ends here. */
  inServiceMs: number;
  /** Months of spending before `inServiceMs` (0 = all at once). */
  spreadMonths?: number;
  /** Useful life in years (land: none). */
  lifeYears?: number;
  /** Bought again every `lifeYears` within the horizon (IT refresh). */
  refresh?: boolean;
}
export interface RevenueStream { label: string; kw: number; fromMs: number; priceKwMonth: number; targetFillPct: number; rampMonths: number; preLetPct?: number }
export interface OpexItem { label: string; monthly: number; fromMs: number; untilMs?: number }
export interface BenefitItem { label: string; annual: number; fromMs: number }
export interface EnergyModel { pue: number; tariffUsdPerKwh: number; drawPct: number; recovered: boolean; /** IT kW drawn when there is no revenue stream (internal sites): kW and from when. */ internal?: { kw: number; fromMs: number; targetFillPct: number; rampMonths: number }[] }
export interface CashflowInput {
  startMs: number; horizonYears: number; discountPct: number; taxRatePct: number;
  capex: CapexItem[]; revenue?: RevenueStream[]; energy?: EnergyModel; opex?: OpexItem[]; benefits?: BenefitItem[];
}
export interface CashflowResult {
  years: CashflowYear[]; npvUsd: number; irrPct: number | null; discountPct: number;
  /** Months from the first spend until the cumulative cash flow turns positive; null when it never does within the horizon. */
  paybackMonths: number | null;
  /** Depreciation a year once every phase is in service. */
  depreciationAnnual: number;
  /** Steady-state year (all phases live, ramps complete) used for the run-rate figures. */
  steady?: CashflowYear;
  basis: string[];
}

/** Fill of a stream `m` months after its go-live. */
function fillAt(m: number, target: number, ramp: number, preLet = 0): number {
  if (m < 0) return 0;
  const start = Math.min(target, preLet);
  if (ramp <= 0) return target;
  return Math.min(target, start + ((target - start) * m) / ramp);
}

/** Month-by-month cash flow rolled up into calendar years. */
export function cashflowFor(input: CashflowInput): CashflowResult {
  const months = Math.max(12, Math.round(input.horizonYears * 12));
  const start = new Date(input.startMs); const y0 = start.getFullYear();
  const monthMs = (i: number) => input.startMs + i * MONTH_MS;
  const yearOf = (i: number) => new Date(monthMs(i)).getFullYear() - y0;
  const nYears = yearOf(months - 1) + 1;
  const rows = Array.from({ length: nYears }, (_, i) => ({ year: y0 + i, capex: 0, opex: 0, revenue: 0, benefit: 0, energy: 0, depreciation: 0, tax: 0, it: 0 }));
  const monthIdx = (ms: number) => Math.floor((ms - input.startMs) / MONTH_MS);
  const add = (i: number, k: 'capex' | 'opex' | 'revenue' | 'benefit' | 'energy' | 'depreciation' | 'it', v: number) => { if (i >= 0 && i < months) rows[yearOf(i)][k] += v; };

  // CapEx and depreciation.
  for (const c of input.capex) {
    if (c.amount <= 0) continue;
    const buys = [c.inServiceMs];
    if (c.refresh && c.lifeYears) for (let t = c.inServiceMs + c.lifeYears * 12 * MONTH_MS; monthIdx(t) < months; t += c.lifeYears * 12 * MONTH_MS) buys.push(t);
    for (const at of buys) {
      const spread = Math.max(0, Math.round(c.spreadMonths ?? 0));
      const end = monthIdx(at);
      const first = Math.max(0, end - spread);
      const n = Math.max(1, end - first + (spread ? 0 : 1));
      for (let i = first; i < first + n; i++) { add(Math.min(i, months - 1), 'capex', c.amount / n); if (c.assetClass === 'it') add(Math.min(i, months - 1), 'it', c.amount / n); }
      if (c.assetClass !== 'land' && c.lifeYears) {
        const per = c.amount / (c.lifeYears * 12);
        for (let i = Math.max(0, end); i < Math.min(months, end + c.lifeYears * 12); i++) add(i, 'depreciation', per);
      }
    }
  }
  // Revenue and energy.
  const e = input.energy;
  for (let i = 0; i < months; i++) {
    const t = monthMs(i);
    let soldKw = 0;
    for (const s of input.revenue ?? []) {
      const m = (t - s.fromMs) / MONTH_MS;
      const fill = fillAt(m, s.targetFillPct / 100, s.rampMonths, (s.preLetPct ?? 0) / 100);
      soldKw += s.kw * fill;
      add(i, 'revenue', s.kw * fill * s.priceKwMonth);
    }
    if (e) {
      let drawnKw = soldKw * (e.drawPct / 100);
      for (const s of e.internal ?? []) drawnKw += s.kw * fillAt((t - s.fromMs) / MONTH_MS, s.targetFillPct / 100, s.rampMonths) * (e.drawPct / 100);
      const cost = drawnKw * e.pue * 730 * e.tariffUsdPerKwh;
      add(i, 'energy', cost);
      if (e.recovered) add(i, 'revenue', cost);
    }
    for (const o of input.opex ?? []) if (t >= o.fromMs && (!o.untilMs || t < o.untilMs)) add(i, 'opex', o.monthly);
    for (const b of input.benefits ?? []) if (t >= b.fromMs) add(i, 'benefit', b.annual / 12);
  }
  // Tax with losses carried forward, then the cash flow.
  let carried = 0; let cumulative = 0; let pvSum = 0;
  const r = input.discountPct / 100;
  const years: CashflowYear[] = rows.map((row, i) => {
    const opex = row.opex + row.energy;
    const profit = row.revenue + row.benefit - opex - row.depreciation;
    const taxable = profit + carried; let tax = 0;
    if (taxable > 0) { tax = taxable * (input.taxRatePct / 100); carried = 0; } else carried = taxable;
    const net = row.revenue + row.benefit - opex - row.capex - tax;
    cumulative += net;
    const discounted = net / Math.pow(1 + r, i);
    pvSum += discounted;
    return { year: row.year, label: String(row.year), capex: r0(row.capex), opex: r0(opex), revenue: r0(row.revenue), benefit: r0(row.benefit), net: r0(net), cumulative: r0(cumulative), discounted: r0(discounted), energy: r0(row.energy), depreciation: r0(row.depreciation), tax: r0(tax), itCapex: r0(row.it) };
  });
  // Payback month by month (cumulative cash, tax spread evenly over the year).
  let pay: number | null = null; { let cum = 0; let started = false; let firstSpend = 0;
    for (let i = 0; i < months; i++) {
      const y = years[yearOf(i)]; const share = 1 / 12;
      const net = (y.revenue + y.benefit - y.opex - y.capex - (y.tax ?? 0)) * share;
      if (!started && (y.capex > 0 || net !== 0)) { started = true; firstSpend = i; }
      cum += net;
      if (started && cum >= 0 && i > firstSpend && years.slice(0, yearOf(i) + 1).some(x => x.capex > 0)) { pay = i - firstSpend + 1; break; }
    } }
  const lastInService = Math.max(input.startMs, ...input.capex.map(c => c.inServiceMs), ...(input.revenue ?? []).map(s => s.fromMs + s.rampMonths * MONTH_MS));
  const steadyIdx = Math.min(years.length - 1, Math.max(0, new Date(lastInService).getFullYear() - y0 + 1));
  const steady = years[steadyIdx];
  return {
    years, npvUsd: r0(pvSum), irrPct: irr(years.map(y => y.net)), discountPct: input.discountPct, paybackMonths: pay,
    depreciationAnnual: r0(steady?.depreciation ?? 0), steady,
    basis: [
      `${input.horizonYears}-year horizon from ${y0}, discounted at ${input.discountPct}% (hurdle rate)`,
      `tax at ${input.taxRatePct}% of profit after depreciation, losses carried forward`,
      `payback counted from the first spend`,
    ],
  };
}

/** Internal rate of return of a yearly series, as a percentage; null when the series never changes sign. */
export function irr(flows: number[]): number | null {
  if (!flows.some(f => f < 0) || !flows.some(f => f > 0)) return null;
  const npv = (rate: number) => flows.reduce((a, f, i) => a + f / Math.pow(1 + rate, i), 0);
  let lo = -0.99, hi = 5; let fLo = npv(lo); const fHi = npv(hi);
  if (fLo * fHi > 0) return null;
  for (let k = 0; k < 120; k++) {
    const mid = (lo + hi) / 2; const fm = npv(mid);
    if (Math.abs(fm) < 1) return Math.round(mid * 1000) / 10;
    if (fLo * fm < 0) hi = mid; else { lo = mid; fLo = fm; }
  }
  return Math.round(((lo + hi) / 2) * 1000) / 10;
}

/** Simple payback on a yearly benefit (plant, network, refresh and migration cases). */
export function paybackFromBenefit(capex: number, benefitAnnual: number): number | null {
  if (capex <= 0) return 0;
  if (benefitAnnual <= 0) return null;
  return r0((capex / benefitAnnual) * 12);
}

/** A contingency line on a base amount (risk allowance on works, not on bought-in equipment). */
export function contingency(base: number, pct: number, what = 'works'): EstimateLine {
  return { category: 'CapEx', item: 'Contingency', amount: r0(base * (pct / 100)), basis: `${pct}% of ${what} (${Math.round(base).toLocaleString('en-US')} USD)`, source: 'benchmark' };
}

/** Average price of WAN and interconnect capacity from the company's own circuits, USD per Gbps per month. */
export function usdPerGbpsMonth(data?: Pick<PlannerData, 'circuits'>, fallback = 250): { value: number; source: T.PlannerParamSource; note: string } {
  const cs = (data?.circuits ?? []).filter(c => (c.commitRateMbps ?? 0) > 0 && (c.monthlyCostUsd ?? 0) > 0 && c.status !== 'Decommissioned' && (c.purpose === 'Internet' || c.purpose === 'DC Interconnect' || c.purpose === 'Cloud On-ramp'));
  const gbps = cs.reduce((a, c) => a + (c.commitRateMbps ?? 0) / 1000, 0);
  const usd = cs.reduce((a, c) => a + (c.monthlyCostUsd ?? 0), 0);
  if (!gbps) return { value: fallback, source: 'benchmark', note: 'no priced circuits recorded; benchmark price' };
  return { value: Math.round(usd / gbps), source: 'actual', note: `average of ${cs.length} circuits (${Math.round(gbps).toLocaleString('en-US')} Gbps, ${Math.round(usd).toLocaleString('en-US')} USD a month)` };
}

/**
 * OpEx a plan adds to a site that already runs (in-site, plant, refresh scopes): energy for the
 * added IT draw, maintenance on the added plant, any added staff and circuits, software per kW.
 */
export function incrementalOpex(x: {
  addedItKw: number; pue: number; tariffUsdPerKwh: number; drawPct?: number;
  maintenanceBaseUsd?: number; maintenancePct?: number; addedFte?: number; staffCostFte?: number;
  addedGbps?: number; usdPerGbps?: number; softwareUsdPerKwYear?: number; source?: T.PlannerParamSource;
}): EstimateLine[] {
  const draw = (x.drawPct ?? 70) / 100; const src = x.source ?? 'benchmark';
  const lines: EstimateLine[] = [
    { category: 'OpEx', item: 'Energy (added load)', amount: r0(x.addedItKw * draw * x.pue * 730 * x.tariffUsdPerKwh), basis: `${r0(x.addedItKw).toLocaleString('en-US')} kW × ${Math.round(draw * 100)}% drawn × PUE ${x.pue} × 730 h × ${x.tariffUsdPerKwh} USD/kWh`, source: src },
    { category: 'OpEx', item: 'Maintenance (added plant)', amount: r0(((x.maintenanceBaseUsd ?? 0) * (x.maintenancePct ?? 2.5)) / 100 / 12), basis: `${x.maintenancePct ?? 2.5}% a year of ${r0(x.maintenanceBaseUsd ?? 0).toLocaleString('en-US')} USD`, source: src },
    { category: 'OpEx', item: 'Staff (added)', amount: r0(((x.addedFte ?? 0) * (x.staffCostFte ?? 96000)) / 12), basis: `${x.addedFte ?? 0} FTE × ${(x.staffCostFte ?? 96000).toLocaleString('en-US')} USD`, source: src },
    { category: 'OpEx', item: 'Connectivity (added)', amount: r0((x.addedGbps ?? 0) * (x.usdPerGbps ?? 250)), basis: `${x.addedGbps ?? 0} Gbps × ${x.usdPerGbps ?? 250} USD/Gbps/month`, source: src },
    { category: 'OpEx', item: 'Software and licences (added)', amount: r0((x.addedItKw * (x.softwareUsdPerKwYear ?? 14)) / 12), basis: 'monitoring, DCIM, ITSM per kW', source: src },
  ];
  return lines.filter(l => l.amount > 0);
}
