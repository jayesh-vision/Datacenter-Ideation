/* What is being replaced (server refresh, network device refresh, rack replacement), on the Requirements step.
   15-Oct-2026 (user: "show all the devices in this list and above are the quick filters only"): the table lists EVERY eligible item
   at the chosen site for the plan type (servers / GPU nodes / storage for a server refresh, switches / routers / firewalls for a network
   refresh, racks for a rack replacement), paged and searchable. The reasons (past end of life, warranty expired, faulty, older than N
   years; for racks: old type, damaged, too shallow, over its rating, unmetered) are quick filters: none active by default, each shows
   its count at the site, several active = any of them. Every row carries its reasons as badges with their dates, so the unfiltered list
   says what is due. Order: selected first, then the most severe reasons, then the rest by rack and position. The model / rack / row /
   owner team / service / text filters narrow the list further. Selected rows stay visible whatever the filters say; equipment another
   plan or an open change holds is locked with the reason; the filters are saved with the selection; a selection made at another site
   is cleared when the site changes. Ported from P2B's AffectedAssets. */
import { useEffect, useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { Btn, Chip, CheckBox } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import type { StepProps } from '../../../planner/lib/wizardModel';
import type { PlannerData } from '../../../planner/lib/plannerData';
import { clockMs } from '../../../planner/compat/clock';
import { fmtMonth } from '../../../lib/format';
import { deviceCandidates, effectiveMapping, oldDevicesOf, readCriteria, severityOf, REASON_LABEL, RACK_REASON_LABEL, ROLE_LABEL, selectedIds, toPlanMapping, type Candidate, type Reason, type RackReason, type SelectionCriteria } from '../../../planner/lib/replaceCore';
import { rackCandidates, RACK_REASON_WEIGHT, type RackCandidate } from '../../../planner/lib/replaceRack';
import { Sub } from '../parts';
import { NumInput, SelectInput, TextInput, kw, num } from '../common';

const PAGE = 50;
const REASONS: Reason[] = ['eol', 'warranty', 'faulty', 'age'];
const RACK_REASONS: RackReason[] = ['old-type', 'damaged', 'shallow', 'over-power', 'unmetered'];
const RACK_QUICK: Record<RackReason, string> = { 'old-type': 'Old rack type', damaged: 'Damaged', shallow: 'Too shallow', 'over-power': 'Over its rating', unmetered: 'No metered strips' };

/** Draft changes for a new selection: ids, counts, kW, the mapping (keeping choices already made) and only the waves already run. */
function selectionPatch(draft: T.PlannerPlan, data: PlannerData, ids: string[], criteria: SelectionCriteria): Partial<T.PlannerPlan> {
  const params: T.PlannerPlan['params'] = { ...draft.params, affectedIds: ids.join(','), affectedSiteId: draft.dataCenterId ?? '', selectionCriteria: JSON.stringify(criteria) };
  const next = { ...draft, params };
  const old = oldDevicesOf(data, next);
  const racks = draft.scope === 'rack-replace' ? ids : [...new Set(old.map(d => d.rackId!).filter(Boolean))];
  const oldKw = old.reduce((a, d) => a + (d.powerDrawW ?? 0), 0) / 1000;
  const mapping = draft.scope === 'rack-replace' ? [] : toPlanMapping(effectiveMapping(data, next, old, { replacementModel: String(draft.params.replacementModel ?? ''), consolidationRatio: Number(draft.params.consolidationRatio ?? 2), oldEquipment: String(draft.params.oldEquipment ?? '') }));
  const newKw = mapping.reduce((a, m) => a + m.newKw, 0);
  const kept = (draft.waves ?? []).filter(w => w.status !== 'Planned');
  return {
    params: { ...params, affectedCount: draft.scope === 'rack-replace' ? racks.length : old.length, affectedRacks: racks.length, affectedDevices: old.length, affectedKw: Math.round(oldKw * 10) / 10 },
    paramSources: { ...draft.paramSources, affectedIds: 'user', affectedCount: 'user', selectionCriteria: 'user' },
    mapping, waves: kept, phases: kept.length ? draft.phases : [], designPowerKw: Math.max(0, Math.round(draft.scope === 'rack-replace' ? oldKw : newKw)),
  };
}
/** Everything a selection leaves behind when the site changes. */
function clearedSelection(draft: T.PlannerPlan): Partial<T.PlannerPlan> {
  const params = { ...draft.params };
  for (const k of Object.keys(params)) if (k.startsWith('affected') || k.startsWith('swap:') || k === 'selectionCriteria') delete params[k];
  return { params, mapping: [], waves: [], phases: [], consents: [], designPowerKw: 0 };
}

export function AffectedAssets(props: StepProps) {
  const { draft, patch, data } = props;
  const [crit, setCrit] = useState<SelectionCriteria>(() => readCriteria(draft));
  const ids = useMemo(() => new Set(selectedIds(draft)), [draft]);
  const site = draft.dataCenterId;
  const stale = !props.readOnly && !!ids.size && !!draft.params.affectedSiteId && draft.params.affectedSiteId !== site;
  useEffect(() => { if (stale) patch(clearedSelection(draft)); }, [stale, draft, patch]);
  const saveCrit = (c: SelectionCriteria) => { setCrit(c); if (!props.readOnly) patch({ params: { ...draft.params, selectionCriteria: JSON.stringify(c) } }); };
  const select = (next: Set<string>) => { if (!props.readOnly) patch(selectionPatch(draft, data, [...next], crit)); };
  const toggle = (id: string, on: boolean) => { const n = new Set(ids); if (on) n.add(id); else n.delete(id); select(n); };
  if (!site) return <p className="vw-label pn-aff-empty">Pick the site above to see what can be replaced there.</p>;
  if (!data.ready) return <p className="vw-label pn-aff-empty">Loading the site's equipment…</p>;
  const sp: SelProps = { ...props, crit, saveCrit, ids, toggle, select };
  return draft.scope === 'rack-replace' ? <RackSelection {...sp} /> : <DeviceSelection {...sp} />;
}

interface SelProps extends StepProps { crit: SelectionCriteria; saveCrit: (c: SelectionCriteria) => void; ids: Set<string>; toggle: (id: string, on: boolean) => void; select: (n: Set<string>) => void }
type Opt = { id: string; label: string };
const opts = (pairs: [string, string][]): Opt[] => [...new Map(pairs.filter(([id]) => !!id)).entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
/** A single-choice filter over a list criterion ("Every model" = no filter). */
function Pick({ all, value, options, onChange, label }: { all: string; value?: string[]; options: Opt[]; onChange: (v: string[] | undefined) => void; label: string }) {
  return <span aria-label={label} className="pn-aff-pick"><SelectInput value={value?.[0] ?? ''} options={[{ id: '', label: all }, ...options]} onChange={v => onChange(v ? [v] : undefined)} disabled={!options.length} /></span>;
}
/** A quick-filter pill: toggles on click, shows the count at the site. */
function Quick({ on, label, count, onToggle, children, tone }: { on: boolean; label: string; count: number; onToggle: () => void; children?: React.ReactNode; tone?: 'bad' | 'warn' }) {
  return (
    <span className={`pn-aff-q${on ? ' is-on' : ''}${tone ? ` is-${tone}` : ''}${!count && !on ? ' is-zero' : ''}`}>
      <button type="button" aria-pressed={on} onClick={onToggle} title={on ? 'Showing only these (click to clear)' : 'Show only these'}>
        {on ? <I.Check size={13} aria-hidden /> : <i className="pn-aff-q-dot" aria-hidden />}<span>{label}</span>
      </button>
      {children}
      <em className="num">{num(count)}</em>
    </span>
  );
}
/** Pager under a long list. */
function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  if (total <= size) return null;
  const last = Math.ceil(total / size) - 1;
  return (
    <div className="pn-aff-pager">
      <span className="vw-label">Rows {num(page * size + 1)}–{num(Math.min(total, (page + 1) * size))} of {num(total)}</span>
      <Btn size="xs" variant="ghost" icon={I.ChevronLeft} disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</Btn>
      <span className="vw-label num">Page {page + 1} of {last + 1}</span>
      <Btn size="xs" variant="ghost" iconRight={I.ChevronRight} disabled={page >= last} onClick={() => onPage(page + 1)}>Next</Btn>
    </div>
  );
}
const SelectCell = ({ on, held, name, readOnly, onChange }: { on: boolean; held?: string; name: string; readOnly?: boolean; onChange: (v: boolean) => void }) => (
  <span title={held && !on ? `${held}: cannot be selected` : undefined}>{held && !on ? <I.Lock size={14} className="muted" aria-label={`${held}: cannot be selected`} /> : readOnly ? (on ? <I.Check size={15} className="pn-aff-tick" /> : null) : <CheckBox on={on} label={`Select ${name}`} onChange={onChange} />}</span>
);

/** The reason badges of one device, with the dates behind them. */
function DeviceBadges({ c, now }: { c: Candidate; now: number }) {
  const out: React.ReactNode[] = [];
  if (c.why.includes('faulty')) out.push(<Chip key="f" size="xs" tone="error" title="An open RMA case: a part has failed and is being replaced">Faulty</Chip>);
  if (c.why.includes('eol')) {
    const support = c.supportEndAt !== undefined && c.supportEndAt < now;
    out.push(<Chip key="e" size="xs" tone="warning" title={`End of sale ${c.eolAt ? fmtMonth(c.eolAt) : '—'}${c.supportEndAt ? ` · vendor support ${support ? 'ended' : 'ends'} ${fmtMonth(c.supportEndAt)}` : ''}`}>{support ? 'Past end of support' : 'Past end of life'}</Chip>);
  }
  if (c.why.includes('warranty')) out.push(<Chip key="w" size="xs" tone="neutral" title="Manufacturer's warranty end">Warranty expired {c.warrantyEndAt ? fmtMonth(c.warrantyEndAt) : ''}</Chip>);
  if (c.why.includes('age')) out.push(<Chip key="a" size="xs" tone="neutral" title="Years since it was bought">{c.ageYears} y old</Chip>);
  return out.length ? <span className="row wrap pn-aff-badges">{out}</span> : <span className="vw-label">{c.ageYears !== undefined ? `Current · ${c.ageYears} years` : 'Current'}</span>;
}

function DeviceSelection({ draft, data, crit, saveCrit, ids, toggle, select, readOnly }: SelProps) {
  const [now] = useState(() => clockMs());
  const [page, setPage] = useState(0);
  const all = useMemo(() => deviceCandidates(data, draft, crit.years, now), [data, draft, crit.years, now]);
  const models = useMemo(() => opts(all.map(c => [c.d.model ?? '', `${c.d.model} (${all.filter(x => x.d.model === c.d.model).length})`])), [all]);
  const racks = useMemo(() => opts(all.filter(c => c.rack).map(c => [c.rack!.id, c.rack!.name])), [all]);
  const rows = useMemo(() => opts(all.filter(c => c.row).map(c => [c.row!.id, c.row!.name])), [all]);
  const teams = useMemo(() => opts(all.map(c => [c.d.ownerTeam ?? '', c.d.ownerTeam ?? ''])), [all]);
  const services = useMemo(() => opts(all.flatMap(c => c.services.map(s => [s.id, s.name] as [string, string]))), [all]);
  const text = (crit.text ?? '').trim().toLowerCase();
  const filterKey = JSON.stringify(crit);
  useEffect(() => { setPage(0); }, [filterKey]);
  const quick = crit.reasons;
  const match = all.filter(c => !quick.length || c.why.some(r => quick.includes(r)))
    .filter(c => !crit.models?.length || crit.models.includes(c.d.model ?? ''))
    .filter(c => !crit.rackIds?.length || crit.rackIds.includes(c.rack?.id ?? ''))
    .filter(c => !crit.rowIds?.length || crit.rowIds.includes(c.row?.id ?? ''))
    .filter(c => !crit.teams?.length || crit.teams.includes(c.d.ownerTeam ?? ''))
    .filter(c => !crit.serviceIds?.length || c.services.some(s => crit.serviceIds!.includes(s.id)))
    .filter(c => !text || `${c.d.name} ${c.d.model} ${c.rack?.name} ${c.d.serial ?? ''}`.toLowerCase().includes(text));
  const matchIds = new Set(match.map(c => c.d.id));
  const list = [...match, ...all.filter(c => ids.has(c.d.id) && !matchIds.has(c.d.id))].sort((a, b) => Number(ids.has(b.d.id)) - Number(ids.has(a.d.id))
    || severityOf(b.why) - severityOf(a.why) || (b.ageYears ?? 0) - (a.ageYears ?? 0) || (a.rack?.name ?? '').localeCompare(b.rack?.name ?? '', undefined, { numeric: true }) || (a.d.position ?? 0) - (b.d.position ?? 0));
  const free = match.filter(c => !c.held && !ids.has(c.d.id));
  const sel = all.filter(c => ids.has(c.d.id));
  const heldSel = sel.filter(c => c.held);
  const drawKw = sel.reduce((a, c) => a + (c.d.powerDrawW ?? 0), 0) / 1000;
  const due = all.filter(c => c.why.length).length;
  const filtered = !!(quick.length || crit.models?.length || crit.rackIds?.length || crit.rowIds?.length || crit.teams?.length || crit.serviceIds?.length || text);
  const toggleReason = (r: Reason) => saveCrit({ ...crit, reasons: quick.includes(r) ? quick.filter(x => x !== r) : [...quick, r] });
  const shown = list.slice(page * PAGE, (page + 1) * PAGE);
  return (
    <div className="pn-aff">
      <Sub extra={!readOnly && <span className="row" style={{ gap: 6 }}><Btn size="sm" icon={I.ListChecks} disabled={!free.length} onClick={() => select(new Set([...ids, ...free.map(c => c.d.id)]))}>Select the {num(free.length)} shown</Btn><Btn size="sm" variant="ghost" disabled={!ids.size} onClick={() => select(new Set())}>Clear</Btn></span>}>What is being replaced</Sub>
      <div className="pn-aff-reasons" role="group" aria-label="Quick filters">
        <span className="vw-label">Show only</span>
        {REASONS.map(r => (
          <Quick key={r} on={quick.includes(r)} label={r === 'age' ? 'Older than' : REASON_LABEL[r]} count={all.filter(c => c.why.includes(r)).length} onToggle={() => toggleReason(r)} tone={r === 'faulty' ? 'bad' : r === 'eol' ? 'warn' : undefined}>
            {r === 'age' && <span className="pn-aff-years"><NumInput value={crit.years} min={1} max={15} onChange={v => v !== undefined && v >= 1 && saveCrit({ ...crit, years: v })} /> years</span>}
          </Quick>
        ))}
        {quick.length > 0 && <button type="button" className="pn-aff-clear" onClick={() => saveCrit({ ...crit, reasons: [] })}>Show all</button>}
      </div>
      <div className="pn-aff-filters">
        <Pick label="Model" all="Every model" value={crit.models} options={models} onChange={v => saveCrit({ ...crit, models: v })} />
        <Pick label="Rack" all="Every rack" value={crit.rackIds} options={racks} onChange={v => saveCrit({ ...crit, rackIds: v })} />
        <Pick label="Row" all="Every row" value={crit.rowIds} options={rows} onChange={v => saveCrit({ ...crit, rowIds: v })} />
        <Pick label="Owner team" all="Every owner team" value={crit.teams} options={teams} onChange={v => saveCrit({ ...crit, teams: v })} />
        <Pick label="Service" all="Every service" value={crit.serviceIds} options={services} onChange={v => saveCrit({ ...crit, serviceIds: v })} />
        <span className="pn-aff-search"><I.Search size={14} aria-hidden /><TextInput value={crit.text ?? ''} placeholder="Name, model or rack" onChange={v => saveCrit({ ...crit, text: v })} /></span>
      </div>
      <div className="pn-tbl pn-aff-tbl" style={{ maxHeight: 520 }}>
        <table className="nst-table">
          <thead><tr><th aria-label="Selected" /><th>Device</th><th>Where</th><th>Due because</th><th>Services · draw</th></tr></thead>
          <tbody>
            {shown.map(c => { const on = ids.has(c.d.id); return (
              <tr key={c.d.id} className={on ? 'is-selected' : undefined}>
                <td><SelectCell on={on} held={c.held} name={c.d.name} readOnly={readOnly} onChange={v => toggle(c.d.id, v)} /></td>
                <td><span className="cell-2"><b className="mono" style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{c.d.name}</b><small>{c.d.model ?? '—'} · {ROLE_LABEL[c.role]}</small>{c.held && <small className="pn-warn">{c.held}</small>}</span></td>
                <td><span className="cell-2"><span style={{ whiteSpace: 'nowrap' }}>{c.rack?.name ?? '—'}{c.d.position ? ` · U${c.d.position}` : ''}</span>{c.row && <small>{c.row.name}</small>}{c.d.ownerTeam && <small className="pn-aff-team">{c.d.ownerTeam}</small>}</span></td>
                <td><DeviceBadges c={c} now={now} /></td>
                <td><span className="cell-2">{c.services.length ? <span className="row wrap" style={{ gap: 4 }}><span style={{ whiteSpace: 'nowrap' }}>{num(c.services.length)} service{c.services.length === 1 ? '' : 's'}</span>{c.services.some(s => s.critical) && <Chip tone="error" size="xs">critical</Chip>}</span> : <span className="vw-label">No services</span>}<small className="num" style={{ whiteSpace: 'nowrap' }}>{c.d.powerDrawW ? `${num(c.d.powerDrawW)} W` : '—'}</small></span></td>
              </tr>); })}
            {!list.length && <tr><td colSpan={5} className="vw-label">{all.length ? 'Nothing at this site matches these filters.' : 'No equipment of this kind is racked at this site.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} size={PAGE} total={list.length} onPage={setPage} />
      <p className="pn-aff-sum">Selected <b>{num(sel.length)} device{sel.length === 1 ? '' : 's'}</b> in {num(new Set(sel.map(c => c.rack?.id)).size)} racks, drawing {kw(drawKw)} measured · {filtered ? `${num(match.length)} of ${num(all.length)} at the site shown` : `${num(all.length)} at the site`}, {num(due)} due for replacement.
        {heldSel.length > 0 && <span className="pn-bad"> {heldSel.length} selected device{heldSel.length === 1 ? ' is' : 's are'} held elsewhere; remove {heldSel.length === 1 ? 'it' : 'them'}.</span>}</p>
    </div>
  );
}

/** The reason badges of one rack. */
function RackBadges({ c }: { c: RackCandidate }) {
  const out = [...c.reasons].sort((a, b) => RACK_REASON_WEIGHT[b] - RACK_REASON_WEIGHT[a]).map(r => {
    const title = r === 'damaged' ? c.damageNote ?? 'Marked damaged in this plan' : r === 'old-type' ? `${c.type?.model ?? 'Old type'}${c.ageYears !== undefined ? `, bought ${c.ageYears} years ago` : ''}` : r === 'shallow' ? `${c.deepestModel} is ${c.deepestMm} mm deep; the rack mounts ${c.usableDepthMm} mm` : r === 'over-power' ? 'Draws more than the rack rating' : 'No metered power strip recorded';
    return <Chip key={r} size="xs" tone={r === 'over-power' || r === 'damaged' ? 'error' : r === 'unmetered' ? 'neutral' : 'warning'} title={`${RACK_REASON_LABEL[r]}: ${title}`}>{RACK_QUICK[r]}</Chip>;
  });
  return out.length ? <span className="row wrap pn-aff-badges">{out}</span> : <span className="vw-label">{c.ageYears !== undefined ? `Fine · ${c.ageYears} years` : 'Fine'}</span>;
}

function RackSelection({ draft, data, crit, saveCrit, ids, toggle, select, readOnly }: SelProps) {
  const [now] = useState(() => clockMs());
  const [page, setPage] = useState(0);
  const quick = crit.rackReasons ?? [];
  const all = useMemo(() => rackCandidates(data, draft, crit, now), [data, draft, crit, now]);
  const types = useMemo(() => opts(all.filter(r => r.type?.model && !r.type.legacy).map(r => [r.type!.model, r.type!.model])), [all]);
  const rowsOpt = useMemo(() => opts(all.filter(c => c.row).map(c => [c.row!.id, c.row!.name])), [all]);
  const text = (crit.text ?? '').trim().toLowerCase();
  const filterKey = JSON.stringify(crit);
  useEffect(() => { setPage(0); }, [filterKey]);
  const match = all.filter(r => !quick.length || r.reasons.some(x => quick.includes(x)))
    .filter(c => !crit.rowIds?.length || crit.rowIds.includes(c.row?.id ?? ''))
    .filter(c => !text || `${c.rack.name} ${c.row?.name ?? ''} ${c.rack.owner ?? ''} ${c.type?.model ?? ''}`.toLowerCase().includes(text));
  const matchIds = new Set(match.map(r => r.rack.id));
  const sev = (c: RackCandidate) => c.reasons.reduce((a, r) => a + RACK_REASON_WEIGHT[r], 0);
  const list = [...match, ...all.filter(r => ids.has(r.rack.id) && !matchIds.has(r.rack.id))].sort((a, b) => Number(ids.has(b.rack.id)) - Number(ids.has(a.rack.id)) || sev(b) - sev(a) || a.rack.name.localeCompare(b.rack.name, undefined, { numeric: true }));
  const free = match.filter(r => !r.held && !ids.has(r.rack.id));
  const sel = all.filter(r => ids.has(r.rack.id));
  const damaged = new Set(crit.damagedRackIds ?? []);
  const due = all.filter(c => c.reasons.length).length;
  const filtered = !!(quick.length || crit.rowIds?.length || text);
  const toggleReason = (r: RackReason) => saveCrit({ ...crit, rackReasons: quick.includes(r) ? quick.filter(x => x !== r) : [...quick, r] });
  const shown = list.slice(page * PAGE, (page + 1) * PAGE);
  return (
    <div className="pn-aff">
      <Sub extra={!readOnly && <span className="row" style={{ gap: 6 }}><Btn size="sm" icon={I.ListChecks} disabled={!free.length} onClick={() => select(new Set([...ids, ...free.map(r => r.rack.id)]))}>Select the {num(free.length)} shown</Btn><Btn size="sm" variant="ghost" disabled={!ids.size} onClick={() => select(new Set())}>Clear</Btn></span>}>Which racks are replaced</Sub>
      <div className="pn-aff-reasons" role="group" aria-label="Quick filters">
        <span className="vw-label">Show only</span>
        {RACK_REASONS.map(r => <Quick key={r} on={quick.includes(r)} label={RACK_QUICK[r]} count={all.filter(c => c.reasons.includes(r)).length} onToggle={() => toggleReason(r)} tone={r === 'damaged' || r === 'over-power' ? 'bad' : r === 'old-type' || r === 'shallow' ? 'warn' : undefined} />)}
        {quick.length > 0 && <button type="button" className="pn-aff-clear" onClick={() => saveCrit({ ...crit, rackReasons: [] })}>Show all</button>}
      </div>
      <div className="pn-aff-filters">
        <Pick label="Row" all="Every row" value={crit.rowIds} options={rowsOpt} onChange={v => saveCrit({ ...crit, rowIds: v })} />
        <Pick label="Also an old rack type" all="Also old: no other type" value={crit.rackTypes} options={types} onChange={v => saveCrit({ ...crit, rackTypes: v })} />
        <span className="pn-aff-search"><I.Search size={14} aria-hidden /><TextInput value={crit.text ?? ''} placeholder="Rack, row or owner" onChange={v => saveCrit({ ...crit, text: v })} /></span>
      </div>
      <div className="pn-tbl pn-aff-tbl" style={{ maxHeight: 520 }}>
        <table className="nst-table">
          <thead><tr><th aria-label="Selected" /><th>Rack</th><th>Space · power</th><th>Deepest / depth</th><th>Due because</th></tr></thead>
          <tbody>
            {shown.map(c => { const on = ids.has(c.rack.id); const audit = c.rack.condition === 'Damaged'; return (
              <tr key={c.rack.id} className={on ? 'is-selected' : undefined}>
                <td><SelectCell on={on} held={c.held} name={c.rack.name} readOnly={readOnly} onChange={v => toggle(c.rack.id, v)} /></td>
                <td><span className="cell-2"><b style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{c.rack.name}</b><small>{[c.row?.name, c.rack.owner].filter(Boolean).join(' · ')}</small>{c.type?.model && <small title={c.type.model}>{c.type.model.replace(/ \d+ × \d+$/, '')}{c.ageYears !== undefined ? ` · ${c.ageYears} y` : ''}</small>}{c.held && <small className="pn-warn">{c.held}</small>}</span></td>
                <td><span className="cell-2"><span className="num" style={{ whiteSpace: 'nowrap' }}>{c.rb?.usedUnits.size ?? c.rack.usedU} / {c.rack.heightU} U</span><small className={`num${c.reasons.includes('over-power') ? ' pn-bad' : ''}`} style={{ whiteSpace: 'nowrap' }}>{c.rb?.drawKw ?? c.rack.currentPowerKw} / {c.rack.maxPowerKw} kW</small></span></td>
                <td><span className="cell-2"><span className="num" style={{ whiteSpace: 'nowrap' }}>{c.deepestMm ? `${c.deepestMm}` : '—'} / {c.usableDepthMm} mm</span>{c.deepestModel ? <small>{c.deepestModel}</small> : null}</span></td>
                <td><RackBadges c={c} />{audit && c.damageNote && <small className="vw-label pn-aff-note">{c.damageNote}</small>}
                  {!readOnly && !audit && <button type="button" className="pn-aff-mark" onClick={() => saveCrit({ ...crit, damagedRackIds: damaged.has(c.rack.id) ? [...damaged].filter(x => x !== c.rack.id) : [...damaged, c.rack.id] })}>{damaged.has(c.rack.id) ? 'Not damaged' : 'Mark damaged'}</button>}</td>
              </tr>); })}
            {!list.length && <tr><td colSpan={5} className="vw-label">{all.length ? 'No rack at this site matches these filters.' : 'No live racks at this site.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} size={PAGE} total={list.length} onPage={setPage} />
      <p className="pn-aff-sum">Selected <b>{num(sel.length)} rack{sel.length === 1 ? '' : 's'}</b> holding {num(sel.reduce((a, r) => a + r.devices.length, 0))} devices, drawing {kw(sel.reduce((a, r) => a + (r.rb?.drawKw ?? 0), 0))}. Every device in them is re-racked and re-cabled · {filtered ? `${num(match.length)} of ${num(all.length)} racks shown` : `${num(all.length)} racks at the site`}, {num(due)} with a reason to replace.</p>
    </div>
  );
}
