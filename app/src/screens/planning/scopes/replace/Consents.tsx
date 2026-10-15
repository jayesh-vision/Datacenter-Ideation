/* Consent register: who must agree, how much notice they get, and where each one stands. Used by rack replacements (tenants) and
   migrations (customers). Editable in the wizard, read-only in the plan pack. */
import { Chip } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import type { Tone } from '../../../../lib/tone';
import { NumInput, SelectInput, TextInput, date } from '../../common';
import { Quiet, Tbl } from './shared';
import { nowIso } from './model';

const STATUS: T.PlannerConsent['status'][] = ['Not sent', 'Notified', 'Consented', 'Refused'];
const TONE: Record<T.PlannerConsent['status'], Tone> = { 'Not sent': 'neutral', Notified: 'warning', Consented: 'success', Refused: 'error' };
const day = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const fromDay = (v: string) => (v ? new Date(`${v}T09:00:00Z`).toISOString() : undefined);

export function ConsentRegister({ rows, onChange, firstWave, readOnly }: { rows: T.PlannerConsent[]; onChange?: (rows: T.PlannerConsent[]) => void; firstWave?: (c: T.PlannerConsent) => string | undefined; readOnly?: boolean }) {
  const set = (i: number, p: Partial<T.PlannerConsent>) => onChange?.(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  if (!rows.length) return <Quiet>Nobody to ask: no tenant or customer service is affected.</Quiet>;
  const ro = readOnly || !onChange;
  return (
    <Tbl>
      <thead>{ro ? <tr><th>Who</th><th>Account manager</th><th>Services</th><th>Notice</th><th>Status</th><th>Notified</th><th>Agreed</th><th>First wave</th><th>Notice ends</th></tr> : <tr><th>Who</th><th>Notice</th><th>Status</th><th>Notified / agreed</th><th>First wave</th></tr>}</thead>
      <tbody>{rows.map((r, i) => {
        const fw = firstWave?.(r);
        const ends = r.notifiedAt ? new Date(new Date(r.notifiedAt).getTime() + r.noticeDays * 864e5).toISOString() : undefined;
        const short = !!fw && (!ends || ends > fw);
        return (
          ro ? <tr key={r.customerRef}>
            <td><span className="strong">{r.customerName}</span></td>
            <td>{r.accountManager ?? '—'}</td>
            <td className="num">{r.serviceIds.length}</td>
            <td><span className="num">{r.noticeDays} days</span></td>
            <td><Chip tone={TONE[r.status]} size="xs" dot>{r.status}</Chip></td>
            <td>{r.notifiedAt ? date(r.notifiedAt) : '—'}</td>
            <td>{r.consentAt ? date(r.consentAt) : '—'}</td>
            <td>{fw ? date(fw) : '—'}</td>
            <td style={{ color: short ? 'var(--vw-color-red-600)' : undefined }}>{ends ? date(ends) : 'Not notified'}{short && ends && ' (after the wave)'}</td>
          </tr> : <tr key={r.customerRef}>
            <td><span className="cell-2"><span className="strong">{r.customerName}</span><small>{r.serviceIds.length} service{r.serviceIds.length === 1 ? '' : 's'}{r.accountManager ? ` · ${r.accountManager}` : ''}</small></span></td>
            <td><NumInput value={r.noticeDays} min={0} max={365} unit="days" style={{ width: 100 }} onChange={v => v !== undefined && set(i, { noticeDays: v })} /></td>
            <td><SelectInput value={r.status} style={{ width: 118 }} options={STATUS.map(s => ({ id: s, label: s }))} onChange={v => { const t = nowIso(); set(i, { status: v, notifiedAt: v !== 'Not sent' && !r.notifiedAt ? t : r.notifiedAt, consentAt: v === 'Consented' && !r.consentAt ? t : r.consentAt }); }} /></td>
            <td><span className="cell-2" style={{ gap: 4 }}><TextInput type="date" value={day(r.notifiedAt)} style={{ width: 136 }} onChange={v => set(i, { notifiedAt: fromDay(v) })} /><TextInput type="date" value={day(r.consentAt)} style={{ width: 136 }} onChange={v => set(i, { consentAt: fromDay(v) })} /></span></td>
            <td style={{ minWidth: 130 }}><span className="cell-2"><span>{fw ? date(fw) : "—"}</span><small style={{ color: short ? 'var(--vw-color-red-600)' : undefined }}>{ends ? `notice ends ${date(ends)}` : 'not notified'}{short && ends ? ' (after the wave)' : ''}</small></span></td>
          </tr>
        );
      })}</tbody>
    </Tbl>
  );
}
