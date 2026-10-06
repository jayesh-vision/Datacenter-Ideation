const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* Locale, currency and date style follow the geography (set by the mock server when it changes).
   India: ₹8.77 Cr · 1,23,456 · 21-Sep-2026.  USA: $1.75M · 123,456 · Sep 21, 2026. */
export interface MoneyLocale { currency: 'INR' | 'USD'; locale: string; dateStyle: 'dmy' | 'mdy' }
let ML: MoneyLocale = { currency: 'INR', locale: 'en-IN', dateStyle: 'dmy' };
export const setMoneyLocale = (m: MoneyLocale) => { ML = m; };
export const moneyLocale = () => ML;
export const currencySymbol = () => (ML.currency === 'USD' ? '$' : '₹');
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const p2 = (n: number) => String(n).padStart(2, '0');

/* One date/time vocabulary across the whole app: 21-Sep-2026 09:34. */
export const fmtDate = (t: number) => { const d = new Date(t); return ML.dateStyle === 'mdy' ? `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : `${p2(d.getDate())}-${MON[d.getMonth()]}-${d.getFullYear()}`; };
export const fmtTime = (t: number) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const fmtDateTime = (t: number) => `${fmtDate(t)} ${fmtTime(t)}`;
export const fmtShortDate = (t: number) => { const d = new Date(t); return ML.dateStyle === 'mdy' ? `${MON[d.getMonth()]} ${d.getDate()}` : `${p2(d.getDate())} ${MON[d.getMonth()]}`; };
export const fmtDow = (t: number) => DOW[new Date(t).getDay()];
export const fmtDayLabel = (t: number, now: number) => {
  const a = new Date(t); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  const d = Math.round((a.getTime() - b.getTime()) / 86400000);
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday' : `${fmtDow(t)} ${fmtShortDate(t)}`;
};
/* "Today 09:34", "Tomorrow 14:00", "Mon 28 Sep 10:15" */
export const fmtWhen = (t: number, now: number) => {
  const l = fmtDayLabel(t, now);
  return Math.abs(t - now) > 20 * 86400000 ? fmtDateTime(t) : `${l} ${fmtTime(t)}`;
};

export function fmtDur(min: number): string {
  const m = Math.round(Math.abs(min));
  if (m < 60) return `${m} m`;
  if (m < 60 * 24) { const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} m` : `${h} h`; }
  const d = Math.floor(m / 1440), h = Math.round((m % 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}
export const fmtAgo = (t: number, now: number) => { const m = (now - t) / 60000; return m < 1 ? 'just now' : m < 60 * 24 * 30 ? `${fmtDur(m)} ago` : fmtDate(t); };
export const fmtIn = (t: number, now: number) => { const m = (t - now) / 60000; return m >= 0 ? `in ${fmtDur(m)}` : `${fmtDur(-m)} ago`; };

export const fmtNum = (n: number) => n.toLocaleString(ML.locale);
export const fmtPct = (n: number, digits = 0) => `${Number.isFinite(n) ? n.toFixed(digits) : '0'}%`;
export const fmtKm = (k: number) => (k < 10 ? `${k.toFixed(1)} km` : `${Math.round(k)} km`);
export const plural = (n: number, one: string, many = `${one}s`) => `${fmtNum(n)} ${n === 1 ? one : many}`;

/* money in the geography's units: ₹8.77 Cr / ₹98.88 L / ₹5,993 — or $1.75M / $340.5K / $5,993 */
export function fmtMoney(n: number, digits = 2): string {
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (ML.currency === 'USD') return a >= 1e9 ? `${sign}$${(a / 1e9).toFixed(digits)}B` : a >= 1e6 ? `${sign}$${(a / 1e6).toFixed(digits)}M` : a >= 1e4 ? `${sign}$${(a / 1e3).toFixed(1)}K` : a < 100 && a !== Math.round(a) ? `${sign}$${a.toFixed(2)}` : `${sign}$${Math.round(a).toLocaleString('en-US')}`;
  return a >= 1e7 ? `${sign}₹${(a / 1e7).toFixed(digits)} Cr` : a >= 1e5 ? `${sign}₹${(a / 1e5).toFixed(digits)} L` : `${sign}₹${Math.round(a).toLocaleString('en-IN')}`;
}
export const fmtBw = (mbps: number) => (mbps >= 1000 ? `${+(mbps / 1000).toFixed(1)} Gbps` : `${mbps} Mbps`);
/* a service quantity in its own unit (Mbps, kW, vCPU, TB, users…) */
export const fmtQty = (qty: number, unit: string) => (unit === 'Mbps' ? fmtBw(qty) : unit === 'kW' ? fmtKw(qty) : `${fmtNum(qty)} ${unit}`);
export const fmtKw = (kw: number) => `${kw >= 1000 ? Math.round(kw).toLocaleString(ML.locale) : +kw.toFixed(1)} kW`;
export const fmtUptime = (min: number) => { const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60); return d ? `${d}d ${h}h` : `${h}h ${Math.round(min % 60)}m`; };
export const fmtMonth = (t: number) => { const d = new Date(t); return `${MON[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtDateTimeS = (t: number) => { const d = new Date(t); return `${fmtDate(t)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
