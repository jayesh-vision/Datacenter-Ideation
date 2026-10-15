/* Plan page "Materials" tab: the bill of materials as the plan buys it, editable line by line against the planner's own proposal.
   Per line (drawer): quantity, another approved catalogue model of the same kind, where it comes from (spare site capacity / stock / buy,
   with what is actually available), the vendor (the maker or an authorised channel, with its contract, price and lead time), remove; and
   lines added from the catalogue. Per vendor order: move the order to another vendor that sells its lines. Every edit shows its cost,
   lead-time and sourcing effect live, the changes against the proposal can be reset one by one, and saving goes through the plan-page
   edit rule (usePlanEdit: in place on a draft, withdraw first in review, revision B once approved). The overrides live on the plan
   (`plan.materialOverrides`) and flow through the engine (planner/lib/materials.ts) into the estimate, the order schedule, the Plan pack,
   the review pack and Delivery's purchase orders. */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation } from '../../../planner/lib/engine';
import { buildBom, type Bom, type BomItem } from '../../../planner/lib/outputs';
import { sourceBom, sourceAvailability, siteCapacity, purchaseContract, type SourcedBom, type SourcedLine, type SourcingContext } from '../../../planner/lib/sourcing';
import { contextForPlan, sourcingReady, vendorOrders } from '../../../planner/lib/packModel';
import { CATALOGUE, sellersOf, type ItemKind } from '../../../planner/lib/catalogue';
import { ADDABLE_KINDS, KIND_CATEGORY, changeSentence, compareBoms, modelChoices, nextAddKey, normaliseOverride, perRackFor, setOverride, type MaterialChange } from '../../../planner/lib/materials';
import { datedPhases } from '../../../planner/lib/engine';
import { usePlans, useSourcingContext } from '../../../planner/lib/usePlanner';
import { clockMs } from '../../../planner/compat/clock';
import { message } from '../../../planner/compat/notify';
import { Btn, Chip, Drawer, Empty, Menu, Panel, Seg, type MenuItem } from '../../../ui/kit';
import { DataTable, type Col } from '../../../ui/DataTable';
import { CheckLabel, NumInput, SelectInput, date, money, num } from '../common';
import { usePlanEdit, landOn } from './edit/policy';
import { EditNote } from './edit/EditNote';
import { ChangeBar, EffectStrip, useLeaveGuard, usePending, type Effect } from './EffectBar';
import type { TabProps } from './tabs';
import '../../../styles/planning-materials.css';

const TAB = 'materials';
type O = T.PlannerMaterialOverride;
const SOURCE_LABEL: Record<T.PlannerMaterialSource, string> = { auto: 'Best available', site: 'Spare site capacity', stock: 'Stock', buy: 'Buy' };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const orderByOf = (l?: SourcedLine) => l?.allocations.filter(a => a.source === 'procure' && a.orderBy && !a.agreement).map(a => a.orderBy!).sort()[0];
const sig = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n))}`;

/** What one change does, in words: "quantity 195 → 220, vendor Insight Enterprises". */
function describe(c: MaterialChange): string {
  const b = c.before, a = c.after;
  if (c.what.includes('added')) return `added ${a ? `${num(a.qty)} × ${a.model ?? c.item}` : ''}`;
  if (c.what.includes('removed')) return 'removed';
  const parts: string[] = [];
  if (c.what.includes('model')) parts.push(`model ${b?.model ?? '—'} → ${a?.model ?? '—'}`);
  if (c.what.includes('quantity')) parts.push(`quantity ${num(b?.qty ?? 0)} → ${num(a?.qty ?? 0)}`);
  if (c.what.includes('vendor')) parts.push(`vendor ${a?.vendor ?? '—'}`);
  if (c.what.includes('source')) parts.push(`source ${SOURCE_LABEL[a?.source ?? 'auto'].toLowerCase()}`);
  return parts.join(', ');
}

interface Model { proposal: Bom; bom: Bom; sourced?: SourcedBom; fx: ReturnType<typeof compareBoms> }
function model(plan: T.PlannerPlan, ev: Evaluation, benchmarks: T.PlannerBenchmark[], overrides: O[], ctx: SourcingContext | undefined): Model {
  const p = { ...plan, materialOverrides: overrides };
  const proposal = buildBom(plan, ev, benchmarks, { proposal: true });
  const bom = buildBom(p, ev, benchmarks);
  const sourced = ctx && bom.lines.length ? sourceBom(p, ev, bom, contextForPlan(p, ctx)) : undefined;
  return { proposal, bom, sourced, fx: compareBoms(proposal, bom, overrides, bom.materials?.stale, bom.materials?.warnings) };
}

interface Row { id: string; key: string; line: BomItem; proposal?: BomItem; src?: SourcedLine; state: 'same' | 'changed' | 'added' | 'removed'; pending: boolean }

export function MaterialsTab({ plan, ev, benchmarks = [] }: TabProps) {
  const nav = useNavigate();
  const ctxAll = useSourcingContext();
  const ctx = sourcingReady(ctxAll) ? ctxAll : undefined;
  const plans = usePlans();
  const edit = usePlanEdit(plan);
  const ro = edit.policy.mode === 'read-only';
  const saved = useMemo(() => plan.materialOverrides ?? [], [plan.materialOverrides]);
  const [pending, setPending] = usePending<O[]>(`materials:${plan.id}:${plan.updatedAt}`);
  const draft = pending ?? saved;
  const dirty = pending !== undefined && !same(pending, saved);
  useLeaveGuard(dirty);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState('all');
  const [onlyChanged, setOnlyChanged] = useState(false);

  const now = useMemo(() => model(plan, ev, benchmarks, saved, ctx), [plan, ev, benchmarks, saved, ctx]);
  const next = useMemo(() => (dirty ? model(plan, ev, benchmarks, draft, ctx) : now), [dirty, plan, ev, benchmarks, draft, ctx, now]);
  const update = (key: string, o: O | undefined) => setPending(cur => { const list = setOverride(cur ?? saved, key, o); return same(list, saved) ? undefined : list; });

  /* rows: every line the plan buys, plus the proposal's lines the planner removed (greyed, can be restored) */
  const rows: Row[] = useMemo(() => {
    const byKey = new Map(next.proposal.lines.map(l => [l.key ?? l.id, l]));
    const src = new Map((next.sourced?.lines ?? []).map(l => [l.key ?? l.id, l]));
    const savedKeys = new Map(saved.map(o => [o.key, o]));
    const out: Row[] = next.bom.lines.map(l => {
      const k = l.key ?? l.id; const o = draft.find(x => x.key === k);
      return { id: l.id, key: k, line: l, proposal: byKey.get(k), src: src.get(k), state: l.applied?.added ? 'added' : l.applied ? 'changed' : 'same', pending: !same(o, savedKeys.get(k)) };
    });
    for (const o of draft.filter(x => x.removed)) { const p = byKey.get(o.key); if (p) out.push({ id: `rm-${p.id}`, key: o.key, line: p, proposal: p, state: 'removed', pending: !same(o, savedKeys.get(o.key)) }); }
    return out;
  }, [next, draft, saved]);
  const cats = useMemo(() => [...new Set(rows.map(r => r.line.category))], [rows]);
  const shown = rows.filter(r => (category === 'all' || r.line.category === category) && (!onlyChanged || r.state !== 'same'));

  /* effects: the figures an edit moves (the saved plan → with the pending changes) */
  const t = clockMs();
  const late = (s?: SourcedBom) => (s ? vendorOrders(s).filter(v => v.orderBy && new Date(v.orderBy).getTime() < t).length : 0);
  const longest = (b: Bom) => Math.max(0, ...b.lines.map(l => l.leadWeeks ?? 0));
  const capex = ev.estimate.capexTotal;
  /* monthly services (carrier circuits) are bought as term contracts: in the orders, not in the bill */
  const svc = (x: { lines: { monthly?: boolean; buyCost: number }[] }) => x.lines.filter(l => l.monthly).reduce((a, l) => a + l.buyCost, 0);
  const effects: Effect[] = [
    { key: 'bill', label: 'Bill of materials', before: now.bom.total, after: next.bom.total, fmt: money, sub: `${plural(next.bom.lines.length, 'line')}${next.fx.changes.length ? ` · ${plural(next.fx.changes.length, 'change')} to the proposal` : ''}` },
    { key: 'capex', label: 'CapEx', before: capex, after: capex + (next.bom.total - now.bom.total), fmt: money, sub: next.fx.delta ? `${sig(next.fx.delta)} against the proposal` : 'as the planner proposed' },
    ...(next.sourced && now.sourced ? [
      { key: 'buy', label: 'To buy', before: now.sourced.buyTotal, after: next.sourced.buyTotal, fmt: money, sub: `${plural(vendorOrders(next.sourced).length, 'vendor order')}${svc(next.sourced) ? ` · ${money(svc(next.sourced))} services` : ''}` },
      { key: 'avoided', label: 'From site and stock', before: now.sourced.siteValue + now.sourced.stockValue, after: next.sourced.siteValue + next.sourced.stockValue, fmt: money, good: 'up' as const, sub: 'new spend avoided' },
      { key: 'late', label: 'Orders past order-by', before: late(now.sourced), after: late(next.sourced), good: 'down' as const, sub: 'order-by date already passed' },
    ] : []),
    { key: 'lead', label: 'Longest lead time', before: longest(now.bom), after: longest(next.bom), fmt: v => `${Math.round(v)} wk`, good: 'down' },
  ];

  /* the pending changes against what is saved, in words (the bar and the review dialog) */
  const pendingChanges = useMemo(() => {
    if (!dirty) return [] as string[];
    const keys = [...new Set([...saved.map(o => o.key), ...draft.map(o => o.key)])].filter(k => !same(saved.find(o => o.key === k), draft.find(o => o.key === k)));
    return keys.map(k => {
      const c = next.fx.changes.find(x => x.key === k);
      const name = c?.item ?? draft.find(o => o.key === k)?.item ?? saved.find(o => o.key === k)?.item ?? k;
      return c ? `${name}: ${describe(c)}${c.deltaUsd ? ` (${sig(c.deltaUsd)})` : ''}` : `${name}: back to the proposal`;
    });
  }, [dirty, saved, draft, next.fx.changes]);

  const save = async () => {
    setBusy(true);
    // a revision already open keeps its own overrides; only the lines changed here move onto it
    let list = draft;
    const tgt = edit.policy.mode === 'revision' && edit.policy.target?.id ? plans.find(p => p.id === edit.policy.target!.id) : undefined;
    if (tgt) {
      const changedKeys = [...new Set([...saved.map(o => o.key), ...draft.map(o => o.key)])].filter(k => !same(saved.find(o => o.key === k), draft.find(o => o.key === k)));
      let base = (tgt.materialOverrides ?? []).filter(o => !changedKeys.includes(o.key));
      for (const k of changedKeys) { const o = draft.find(x => x.key === k); if (!o) continue; const key = o.added && base.some(b => b.key === o.key) ? nextAddKey(base) : o.key; base = [...base, { ...o, key }]; }
      list = base;
    }
    const what = changeSentence(next.fx.changes.filter(c => pendingChanges.some(p => p.startsWith(`${c.item}:`))), money);
    const r = await edit.commit({ materialOverrides: list }, pendingChanges.length ? `${what.replace(/^Materials: .*$/, m => m)}${pendingChanges.length ? ` · ${pendingChanges.slice(0, 3).join('; ')}${pendingChanges.length > 3 ? ` and ${pendingChanges.length - 3} more` : ''}` : ''}` : what).finally(() => setBusy(false));
    if (!r.ok) { message.error(r.reason); return; }
    setPending(undefined);
    const to = landOn(plan, r, TAB);
    if (to) nav(to);
    else if (edit.policy.mode === 'in-place') message.success(`Saved: ${pendingChanges[0] ?? 'materials'}${pendingChanges.length > 1 ? ` and ${pendingChanges.length - 1} more` : ''}`);
  };

  const cols: Col<Row>[] = [
    { key: 'item', header: 'Item', wrap: true, render: r => <span className="cell-2"><span className="pm-item">{r.line.item}{r.state !== 'same' && <Chip size="xs" tone={r.state === 'removed' ? 'error' : r.state === 'added' ? 'info' : 'warning'}>{r.state === 'removed' ? 'Removed' : r.state === 'added' ? 'Added' : 'Changed'}</Chip>}{r.pending && <Chip size="xs" tone="neutral" outline>Not saved</Chip>}</span><small>{r.line.category}{r.line.phaseId ? ` · ${datedPhases(plan).find(p => p.id === r.line.phaseId)?.name ?? r.line.phaseId}` : ''}{r.line.siteRef ? ` · ${r.line.siteRef}` : ''}</small></span> },
    { key: 'model', header: 'Model', wrap: true, render: r => <span className="cell-2"><span>{r.line.model ?? r.line.spec}</span><small>{r.line.manufacturer}</small></span> },
    { key: 'qty', header: 'Quantity', sort: r => r.line.qty, render: r => <span className="num nowrap">{num(r.line.qty)} {r.line.unit}{r.proposal && r.state === 'changed' && r.proposal.qty !== r.line.qty && <small className="pm-was">{num(r.proposal.qty)}</small>}</span> },
    { key: 'src', header: 'Comes from', render: r => r.state === 'removed' ? <span className="vw-label">—</span> : !r.src ? <span className="vw-label">Loading stock…</span> : <span className="pm-src">{r.src.fromSite > 0 && <Chip size="xs" tone="success" dot>Site {num(r.src.fromSite)}</Chip>}{r.src.fromStock > 0 && <Chip size="xs" tone="info" dot>Stock {num(r.src.fromStock)}</Chip>}{r.src.toBuy > 0 && <Chip size="xs" tone="neutral" dot>Buy {num(r.src.toBuy)}</Chip>}{r.line.forceSource && <I.Pin size={12} aria-label="source chosen by the planner" />}</span> },
    { key: 'vendor', header: 'Vendor', wrap: true, render: r => { if (r.state === 'removed' || !r.src) return <span className="vw-label">—</span>; const buy = r.src.allocations.find(a => a.source === 'procure'); if (!buy) return <span className="vw-label">Nothing to buy</span>; const c = buy.contractId ? ctx?.contracts.find(x => x.id === buy.contractId)?.ctrId : undefined; return <span className="cell-2"><span>{buy.vendorName}</span>{c ? <small>{c}</small> : <span><Chip size="xs" tone="warning">No contract</Chip></span>}</span>; } },
    { key: 'lead', header: 'Lead · order by', sort: r => r.line.leadWeeks ?? 0, render: r => { if (r.state === 'removed') return <span className="vw-label">—</span>; const ob = orderByOf(r.src); const isLate = ob && new Date(ob).getTime() < t; return <span className="cell-2"><span className="num">{r.line.leadWeeks !== undefined ? `${r.line.leadWeeks} wk` : '—'}{r.line.leadDelta ? <small className="pm-was">{(r.line.leadWeeks ?? 0) - r.line.leadDelta} wk</small> : null}</span>{ob && <small className={isLate ? 'pm-late' : undefined}>{isLate ? 'order now · was ' : 'by '}{date(ob)}</small>}</span>; } },
    { key: 'total', header: 'Total', sort: r => r.line.total, render: r => <span className="cell-2"><span className={`num${r.state === 'removed' ? ' pm-gone' : ' pk-b'}`}>{r.line.monthly ? `${money(r.line.total)} a month` : money(r.line.total)}</span><small className="num">{money(r.line.unitCost)} each{r.proposal && r.state === 'changed' && r.proposal.total !== r.line.total ? ` · ${sig(r.line.total - r.proposal.total)}` : ''}</small></span> },
  ];

  if (!now.proposal.lines.length && !draft.some(o => o.added)) return (
    <Panel><Empty icon={I.Package} title="No bill of materials">Nothing in this plan's sizing needs to be bought, so there is nothing to change here. Check the sizing and the plan type if that looks wrong.</Empty></Panel>
  );
  const sel = open ? rows.find(r => r.key === open) : undefined;
  return (
    <div className="col pm" style={{ gap: 14 }}>
      <EditNote policy={edit.policy} tab={TAB} />
      <EffectStrip effects={effects} dirty={dirty} />
      <Panel flush icon={I.Package} title="Bill of materials" count={next.bom.lines.length}
        info="Every line the plan buys, priced from the approved catalogue. Open a line to change its quantity, model, source or vendor and see the effect before you save. The planner's own proposal stays underneath: reset any change to go back to it."
        actions={!ro ? <Btn size="sm" icon={I.Plus} onClick={() => setAdding(true)}>Add a line</Btn> : undefined}
        foot={<div className="row" style={{ justifyContent: 'space-between' }}><span className="vw-label">{shown.length !== rows.length ? 'Total of the lines shown' : 'Total'}{next.bom.monthlyTotal ? ` · plus ${money(next.bom.monthlyTotal)} a month in services` : ''}</span><b className="num">{money(shown.filter(r => r.state !== 'removed' && !r.line.monthly).reduce((a, r) => a + r.line.total, 0))}</b></div>}>
        <DataTable<Row> rows={shown} cols={cols} pageSize={1000} onRow={r => setOpen(r.key)} rowClass={r => (r.state === 'removed' ? 'pm-row-gone' : r.state !== 'same' ? 'pm-row-changed' : '')}
          toolbar={<div className="row wrap" style={{ gap: 10 }}>{cats.length > 1 && <Seg<string> size="sm" value={category} onChange={setCategory} options={[{ id: 'all', label: 'All' }, ...cats.map(c => ({ id: c, label: c }))]} />}<CheckLabel on={onlyChanged} onChange={setOnlyChanged} label="Changed only" /></div>}
          empty={<Empty icon={I.Filter} title="No lines match">Clear the filters to see every line.</Empty>} />
      </Panel>
      <div className="pn-two pm-two">
        <ChangesPanel fx={next.fx} saved={saved} ro={ro} onOpen={k => setOpen(k)} onReset={k => update(k, undefined)} onResetAll={() => setPending(saved.length ? [] : undefined)} onDropStale={k => update(k, undefined)} />
        <OrdersPanel sourced={next.sourced} ctx={ctx} ro={ro} draft={draft} onVendor={(lines, vendor) => setPending(cur => { let list = cur ?? saved; for (const l of lines) { const k = l.key ?? l.id; const o = list.find(x => x.key === k) ?? { key: k, kind: l.kind, item: l.item }; const prop = next.proposal.lines.find(p => p.key === k); list = setOverride(list, k, normaliseOverride({ ...o, vendor }, prop)); } return same(list, saved) ? undefined : list; })} />
      </div>
      {next.sourced && next.sourced.warnings.length > 0 && <div className="note note--warn"><I.TriangleAlert size={15} /><span><b>Sourcing notes ({next.sourced.warnings.length})</b> · {next.sourced.warnings.join(' · ')}</span></div>}
      {!ro && <ChangeBar policy={edit.policy} changes={pendingChanges} effects={effects} busy={busy} onDiscard={() => setPending(undefined)} onCommit={() => void save()}
        extra={<p className="vw-label" style={{ margin: '8px 0 0' }}>The overrides are kept on the plan against the planner's proposal: the estimate, the order schedule, the Plan pack, the review pack and Delivery's purchase orders all follow them.</p>} />}
      {sel && <LineDrawer key={sel.key} row={sel} plan={plan} ev={ev} benchmarks={benchmarks} ctx={ctx} draft={draft} ro={ro} onClose={() => setOpen(null)}
        onApply={o => { update(sel.key, o); setOpen(null); }} />}
      {adding && <AddDrawer plan={plan} ev={ev} benchmarks={benchmarks} ctx={ctx} draft={draft} onClose={() => setAdding(false)} onAdd={o => { update(o.key, o); setAdding(false); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ changes against the proposal */
function ChangesPanel({ fx, saved, ro, onOpen, onReset, onResetAll, onDropStale }: { fx: Model['fx']; saved: O[]; ro: boolean; onOpen: (k: string) => void; onReset: (k: string) => void; onResetAll: () => void; onDropStale: (k: string) => void }) {
  return (
    <Panel icon={I.GitCompare} title="Changes to the proposal" count={fx.changes.length || undefined}
      info="What the bill differs from the planner's own proposal (the bill the sizing implies), line by line with the cost difference. Reset a line to take the proposal back."
      actions={!ro && fx.changes.length > 0 ? <Btn size="sm" variant="ghost" icon={I.RotateCcw} onClick={onResetAll}>Reset all</Btn> : undefined}>
      {!fx.changes.length && !fx.stale.length ? <p className="vw-label pm-empty">No changes: the plan buys what the planner proposed.</p> : (
        <ul className="pm-changes">
          {fx.changes.map(c => (
            <li key={c.key}>
              <button type="button" className="pm-change-main" onClick={() => onOpen(c.key)}>
                <b>{c.item}{!saved.some(o => o.key === c.key && same(o, c.override)) && <Chip size="xs" tone="neutral" outline>Not saved</Chip>}</b>
                <small>{describe(c)}</small>
              </button>
              <span className={`num pm-delta${c.deltaUsd > 0 ? ' is-up' : c.deltaUsd < 0 ? ' is-down' : ''}`}>{c.deltaUsd ? sig(c.deltaUsd) : '±0'}</span>
              {!ro && <Btn size="sm" variant="ghost" icon={I.RotateCcw} onClick={() => onReset(c.key)} title="Back to the proposal">Reset</Btn>}
            </li>
          ))}
          {fx.stale.map(o => (
            <li key={o.key} className="is-stale">
              <span className="pm-change-main"><b>{o.item}</b><small>No longer in the bill (the sizing changed); this change does nothing.</small></span>
              {!ro && <Btn size="sm" variant="ghost" icon={I.X} onClick={() => onDropStale(o.key)}>Drop</Btn>}
            </li>
          ))}
        </ul>
      )}
      {fx.changes.length > 0 && <div className="pm-changes-foot"><span className="vw-label">Proposal {money(fx.proposalTotal)} → this bill {money(fx.total)}</span><b className={`num pm-delta${fx.delta > 0 ? ' is-up' : fx.delta < 0 ? ' is-down' : ''}`}>{fx.delta ? sig(fx.delta) : '±0'}</b></div>}
    </Panel>
  );
}

/* ------------------------------------------------------------------ vendor orders */
function OrdersPanel({ sourced, ctx, ro, onVendor }: { sourced?: SourcedBom; ctx?: SourcingContext; ro: boolean; draft: O[]; onVendor: (lines: SourcedLine[], vendor: string) => void }) {
  const orders = sourced ? vendorOrders(sourced) : [];
  const t = clockMs();
  return (
    <Panel icon={I.Truck} title="Vendor orders" count={orders.length || undefined} info="One purchase order per vendor and phase, under the vendor's contract: what Delivery raises when the build starts. Move an order to another company that sells its lines (the maker or an authorised channel); the price and lead time follow.">
      {!sourced ? <p className="vw-label pm-empty">Stock, vendors and contracts are loading…</p> : !orders.length ? <p className="vw-label pm-empty">Nothing to buy: every line comes from spare site capacity or stock.</p> : (
        <ul className="pm-orders">
          {orders.map(o => {
            const lines = o.lines.filter(l => l.allocations.some(a => a.source === 'procure' && a.vendorName === o.vendorName && (!o.phaseId || a.phaseId === o.phaseId)));
            const alts = new Map<string, { n: number; premium: number; lead: number }>();
            for (const l of lines) for (const s of sellersOf(l.kind, l.model)) if (s.vendor !== o.vendorName) { const x = alts.get(s.vendor) ?? { n: 0, premium: s.premiumPct, lead: s.leadDeltaWeeks }; x.n++; alts.set(s.vendor, x); }
            const items: MenuItem[] = [...alts].map(([v, x]) => {
              const rec = ctx?.vendors.find(r => r.name === v); const c = rec ? purchaseContract(ctx!.contracts, rec.id) : undefined;
              const sellers = lines.map(l => sellersOf(l.kind, l.model).find(s => s.vendor === v)).filter(Boolean);
              const premium = Math.max(...sellers.map(s => s!.premiumPct)), lead = Math.max(...sellers.map(s => s!.leadDeltaWeeks));
              return { label: `${v} · ${c ? c.ctrId : 'no contract'} · ${premium ? `+${premium}%` : 'price book'}${lead ? ` · ${lead > 0 ? '+' : '−'}${Math.abs(lead)} wk` : ''}${x.n < lines.length ? ` (${x.n} of ${lines.length} lines)` : ''}`, onClick: () => onVendor(lines.filter(l => sellersOf(l.kind, l.model).some(s => s.vendor === v)), v) };
            });
            const late = o.orderBy && new Date(o.orderBy).getTime() < t;
            return (
              <li key={`${o.vendorName}|${o.phaseId ?? ''}`}>
                <div className="pm-order-main">
                  <b>{o.vendorName}{o.phaseName && <small> · {o.phaseName}</small>}</b>
                  <small>{o.contractId ? <>{o.contractLabel}</> : <Chip size="xs" tone="warning">No contract</Chip>} · {plural(lines.length, 'line')} · {o.leadWeeks ? `${o.leadWeeks} wk lead` : 'no lead time'}{o.orderBy && <> · <span className={late ? 'pm-late' : undefined}>order by {date(o.orderBy)}</span></>}</small>
                </div>
                <span className="num pk-b">{money(o.value)}</span>
                {!ro && items.length > 0 && <Menu align="right" items={items} trigger={op => <Btn size="sm" variant="ghost" icon={I.ArrowLeftRight} onClick={op} title="Buy these lines from another company">Vendor</Btn>} />}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ one line */
function Opt({ on, disabled, onClick, title, sub, side, tag }: { on: boolean; disabled?: boolean; onClick?: () => void; title: ReactNode; sub?: ReactNode; side?: ReactNode; tag?: ReactNode }) {
  return (
    <button type="button" className={`pm-opt${on ? ' is-on' : ''}`} disabled={disabled} aria-pressed={on} onClick={onClick}>
      <span className="pm-opt-dot" aria-hidden />
      <span className="pm-opt-main"><b>{title}{tag}</b>{sub && <small>{sub}</small>}</span>
      {side && <span className="pm-opt-side">{side}</span>}
    </button>
  );
}
const Sect = ({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) => <section className="pm-sect"><header><h4>{title}</h4>{extra}</header>{children}</section>;

function LineDrawer({ row, plan, ev, benchmarks, ctx, draft, ro, onClose, onApply }: { row: Row; plan: T.PlannerPlan; ev: Evaluation; benchmarks: T.PlannerBenchmark[]; ctx?: SourcingContext; draft: O[]; ro: boolean; onClose: () => void; onApply: (o: O | undefined) => void }) {
  const prop = row.proposal;
  const base: O = draft.find(o => o.key === row.key) ?? { key: row.key, kind: row.line.kind, item: (prop ?? row.line).item };
  const [o, setO] = useState<O>(base);
  const kind = row.line.kind as ItemKind;
  const cat = CATALOGUE[kind];
  const trial = useMemo(() => setOverride(draft, row.key, row.line.applied?.added ? (o.removed ? undefined : o) : normaliseOverride(o, prop)), [draft, row.key, o, prop, row.line.applied?.added]);
  const before = useMemo(() => model(plan, ev, benchmarks, draft, ctx), [plan, ev, benchmarks, draft, ctx]);
  const after = useMemo(() => model(plan, ev, benchmarks, trial, ctx), [plan, ev, benchmarks, trial, ctx]);
  const lineB = before.bom.lines.find(l => l.key === row.key), lineA = after.bom.lines.find(l => l.key === row.key);
  const srcB = before.sourced?.lines.find(l => l.key === row.key), srcA = after.sourced?.lines.find(l => l.key === row.key);
  const cur = lineA ?? lineB ?? row.line;
  const neededBy = datedPhases(plan)[0]?.goLive ?? plan.targetGoLive;
  const choices = modelChoices({ kind, model: prop?.model ?? row.line.model }, ctx?.assetModels ?? [], ctx?.vendors ?? [], neededBy);
  const avail = ctx ? sourceAvailability(plan, ev, cur, ctx, siteCapacity(plan, ev, ctx)) : undefined;
  const sellers = sellersOf(kind, cur.model);
  // the line's price before any channel premium, so each seller shows what it would charge
  const baseUnit = cur.chosenVendor ? cur.unitCost / (1 + (sellers.find(x => x.vendor === cur.chosenVendor)?.premiumPct ?? 0) / 100) : cur.unitCost;
  const lead0 = prop?.leadWeeks ?? row.line.leadWeeks;
  const changed = !same(normaliseOverride(o, prop) ?? null, normaliseOverride(base, prop) ?? null) || (!!row.line.applied?.added && !same(o, base));
  const removed = !!o.removed;
  const fig = (label: string, b: ReactNode, a: ReactNode, moved: boolean) => <tr className={moved ? 'is-moved' : undefined}><td>{label}</td><td className="num">{b}</td><td className="num">{a}</td></tr>;
  const split = (s?: SourcedLine) => (s ? [s.fromSite && `site ${num(s.fromSite)}`, s.fromStock && `stock ${num(s.fromStock)}`, s.toBuy && `buy ${num(s.toBuy)}`].filter(Boolean).join(', ') || '—' : '—');
  const vendorOf = (s?: SourcedLine) => s?.allocations.find(a => a.source === 'procure')?.vendorName ?? (s ? 'nothing to buy' : '—');
  const ob = (s?: SourcedLine) => { const d = orderByOf(s); return d ? date(d) : '—'; };
  const qtyB = lineB?.qty ?? row.line.qty;
  return (
    <Drawer open onClose={onClose} width={620} title={(prop ?? row.line).item}
      sub={<>{(prop ?? row.line).category} · {row.state === 'added' ? 'added by the planner from the catalogue' : prop ? `proposal: ${num(prop.qty)} ${prop.unit} × ${prop.model ?? prop.spec} at ${money(prop.unitCost)} = ${money(prop.total)}` : ''}</>}
      foot={ro ? <Btn variant="filled" onClick={onClose}>Close</Btn> : <>
        {row.state !== 'added' && <Btn variant="ghost" className="pm-foot-left" icon={removed ? I.Undo2 : I.Trash2} onClick={() => setO(x => ({ ...x, removed: !x.removed }))}>{removed ? 'Keep the line' : 'Remove the line'}</Btn>}
        {row.state === 'added' && <Btn variant="ghost" className="pm-foot-left" icon={I.Trash2} onClick={() => onApply(undefined)}>Delete the added line</Btn>}
        {row.state === 'changed' && <Btn variant="ghost" icon={I.RotateCcw} onClick={() => onApply(undefined)}>Back to the proposal</Btn>}
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="filled" icon={I.Check} disabled={!changed} onClick={() => onApply(row.line.applied?.added ? o : normaliseOverride(o, prop))}>Apply</Btn></>}>
      <div className="pm-drawer">
        {removed ? <p className="note note--warn"><I.Trash2 size={15} /><span>Removed from the bill: nothing is sourced or bought for it ({sig(-(lineB?.total ?? row.line.total))}). Use Keep the line to take it back.</span></p> : <>
          <Sect title="Quantity" extra={prop && cur.qty !== prop.qty ? <button type="button" className="ent-link pm-reset" onClick={() => setO(x => ({ ...x, qty: undefined }))}>Proposal {num(prop.qty)}</button> : undefined}>
            {ro ? <span className="pm-ro">{num(cur.qty)} {cur.unit}</span> : <NumInput value={o.qty ?? cur.qty} min={0} step={1} unit={cur.unit} onChange={v => setO(x => ({ ...x, qty: v === undefined ? undefined : Math.max(0, Math.round(v)) }))} style={{ maxWidth: 220 }} />}
            {cur.perRack && <p className="pm-hint">{cur.perRack.perRack} per rack in {num(cur.perRack.racks)} racks of {cur.perRack.rackKw} kW (the model's draw and height decide how many fit).</p>}
          </Sect>
          {choices.length > 1 && <Sect title="Model" extra={<span className="vw-label">approved {cat?.label.toLowerCase()} models{choices.some(c => c.option.ratingKw || c.option.ratingKva) ? ' of the same rating' : ''}</span>}>
            <div className="pm-opts">{choices.map(c => {
              const pr = cur.perRack ? perRackFor(c.option, cur.perRack.rackKw, cur.perRack.usableU, ctx?.assetModels ?? []) : undefined;
              const stock = ctx && cat?.stockable && c.option.device ? ctx.devices.filter(d => d.model === c.option.model && !d.rackId && (d.lifecycleState === 'Staged' || d.lifecycleState === 'Received')).length : undefined;
              const on = (o.model ?? cur.model) === c.option.model;
              return <Opt key={c.option.model} on={on} disabled={ro || !!c.blocked} onClick={() => setO(x => ({ ...x, model: c.option.model, qty: cur.perRack ? undefined : x.qty, vendor: undefined }))}
                title={c.option.model} tag={c.current ? <Chip size="xs" tone="neutral">Proposal</Chip> : undefined}
                sub={[c.option.manufacturer, c.option.typicalW ? `${num(c.option.typicalW)} W, ${c.option.heightU} U` : '', pr ? `${pr.perRack} per rack (${pr.limitedBy})` : '', stock !== undefined ? `${stock} in stock` : '', c.blocked ?? ''].filter(Boolean).join(' · ')}
                side={<span className="num">{money(c.option.unitPrice)}</span>} />;
            })}</div>
          </Sect>}
          <Sect title="Comes from">
            <div className="pm-opts">
              {(['auto', 'site', 'stock', 'buy'] as T.PlannerMaterialSource[]).map(s => {
                const n = s === 'site' ? avail?.site.qty ?? 0 : s === 'stock' ? avail?.stock.qty ?? 0 : undefined;
                const sub = s === 'auto' ? 'spare site capacity, then free stock, then buy' : s === 'site' ? avail?.site.note : s === 'stock' ? avail?.stock.note : `from ${vendorOf(srcA) === 'nothing to buy' ? cur.vendorName ?? 'the vendor' : vendorOf(srcA)}, ${cur.leadWeeks ?? '—'} weeks lead`;
                return <Opt key={s} on={(o.source ?? 'auto') === s} disabled={ro || (n !== undefined && n <= 0)} onClick={() => setO(x => ({ ...x, source: s === 'auto' ? undefined : s }))}
                  title={SOURCE_LABEL[s]} sub={sub} side={n !== undefined ? <span className="num">{num(n)} free</span> : undefined} />;
              })}
            </div>
          </Sect>
          {sellers.length > 0 && <Sect title="Vendor" extra={<span className="vw-label">who sells {cur.model ?? cur.item}</span>}>
            <div className="pm-opts">{sellers.map(s => {
              const rec = ctx?.vendors.find(v => v.name === s.vendor); const c = rec && ctx ? purchaseContract(ctx.contracts, rec.id) : undefined;
              const unit = Math.round(baseUnit * (1 + s.premiumPct / 100));
              const on = (o.vendor ?? cur.vendorName ?? sellers[0].vendor) === s.vendor;
              return <Opt key={s.vendor} on={on} disabled={ro} onClick={() => setO(x => ({ ...x, vendor: s.maker ? undefined : s.vendor }))}
                title={s.vendor} tag={c ? <Chip size="xs" tone="success">{c.ctrId}</Chip> : <Chip size="xs" tone="warning">No contract</Chip>}
                sub={`${s.note}${s.premiumPct ? ` · price book +${s.premiumPct}%` : ' · price book'}${lead0 !== undefined ? ` · ${Math.max(1, lead0 + s.leadDeltaWeeks)} weeks lead` : ''}`}
                side={<span className="num">{money(unit)}</span>} />;
            })}</div>
          </Sect>}
        </>}
        <Sect title="Effect">
          <table className="nst-table pm-fx"><thead><tr><th>Figure</th><th>Now</th><th>With this change</th></tr></thead><tbody>
            {fig('Quantity', `${num(qtyB)} ${row.line.unit}`, removed ? 'removed' : `${num(cur.qty)} ${cur.unit}`, removed || cur.qty !== qtyB)}
            {fig('Model', lineB?.model ?? row.line.model ?? '—', removed ? '—' : cur.model ?? '—', !removed && cur.model !== (lineB?.model ?? row.line.model))}
            {fig('Unit price', money(lineB?.unitCost ?? row.line.unitCost), removed ? '—' : money(cur.unitCost), !removed && cur.unitCost !== (lineB?.unitCost ?? row.line.unitCost))}
            {fig('Line total', money(lineB?.total ?? 0), removed ? money(0) : money(cur.total), (lineA?.total ?? 0) !== (lineB?.total ?? 0))}
            {fig('Comes from', split(srcB), removed ? '—' : split(srcA), split(srcA) !== split(srcB))}
            {fig('Vendor', vendorOf(srcB), removed ? '—' : vendorOf(srcA), vendorOf(srcA) !== vendorOf(srcB))}
            {fig('Lead time', lineB?.leadWeeks !== undefined ? `${lineB.leadWeeks} wk` : '—', removed || cur.leadWeeks === undefined ? '—' : `${cur.leadWeeks} wk`, !removed && cur.leadWeeks !== lineB?.leadWeeks)}
            {fig('Order by', ob(srcB), removed ? '—' : ob(srcA), ob(srcA) !== ob(srcB))}
            {fig('Bill of materials', money(before.bom.total), money(after.bom.total), after.bom.total !== before.bom.total)}
          </tbody></table>
          {after.bom.total !== before.bom.total && <p className="pm-hint">CapEx moves by {sig(after.bom.total - before.bom.total)}; the order schedule, the Plan pack and Delivery's purchase orders follow once saved.</p>}
          {srcA && after.sourced && after.sourced.warnings.filter(w => w.startsWith(`${cur.item}:`)).map(w => <p key={w} className="note note--warn"><I.TriangleAlert size={15} /><span>{w}</span></p>)}
        </Sect>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ a line from the catalogue */
function AddDrawer({ plan, ev, benchmarks, ctx, draft, onClose, onAdd }: { plan: T.PlannerPlan; ev: Evaluation; benchmarks: T.PlannerBenchmark[]; ctx?: SourcingContext; draft: O[]; onClose: () => void; onAdd: (o: O) => void }) {
  const phases = datedPhases(plan);
  const [kind, setKind] = useState<ItemKind | undefined>();
  const [modelName, setModel] = useState<string | undefined>();
  const [qty, setQty] = useState<number | undefined>(1);
  const [phaseId, setPhase] = useState<string | undefined>(phases.length > 1 ? phases[0].id : undefined);
  const key = nextAddKey(draft);
  const cat = kind ? CATALOGUE[kind] : undefined;
  const neededBy = phases[0]?.goLive ?? plan.targetGoLive;
  const choices = kind ? modelChoices({ kind, model: undefined }, ctx?.assetModels ?? [], ctx?.vendors ?? [], neededBy) : [];
  const allChoices = kind ? CATALOGUE[kind].options.map(op => choices.find(c => c.option.model === op.model) ?? { option: op, current: false, blocked: undefined }) : [];
  const o: O | undefined = kind && cat && (qty ?? 0) > 0 ? { key, kind, item: cat.label, qty, model: modelName ?? allChoices.find(c => !c.blocked)?.option.model, added: { category: KIND_CATEGORY[kind], unit: 'each', phaseId } } : undefined;
  const after = useMemo(() => (o ? model(plan, ev, benchmarks, [...draft, o], ctx) : undefined), [plan, ev, benchmarks, draft, o?.kind, o?.qty, o?.model, o?.added?.phaseId, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = after?.bom.lines.find(l => l.key === key), src = after?.sourced?.lines.find(l => l.key === key);
  const buy = src?.allocations.find(a => a.source === 'procure');
  const contract = buy?.contractId ? ctx?.contracts.find(c => c.id === buy.contractId)?.ctrId : undefined;
  const groups = [...new Set(ADDABLE_KINDS.map(k => KIND_CATEGORY[k]))];
  return (
    <Drawer open onClose={onClose} width={580} title="Add a line from the catalogue" sub="An approved catalogue item the sizing did not propose: it is priced, sourced and ordered like any other line."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Plus} disabled={!o} onClick={() => o && onAdd(o)}>Add the line</Btn></>}>
      <div className="pm-drawer">
        <Sect title="Item">
          <SelectInput<string> value={kind} placeholder="Choose what to add…" onChange={v => { setKind(v as ItemKind); setModel(undefined); }}
            options={groups.flatMap(g => ADDABLE_KINDS.filter(k => KIND_CATEGORY[k] === g).map(k => ({ id: k, label: `${g} · ${CATALOGUE[k].label}` })))} style={{ width: '100%' }} />
        </Sect>
        {kind && <>
          <Sect title="Model"><div className="pm-opts">{allChoices.map(c => {
            const on = (modelName ?? allChoices.find(x => !x.blocked)?.option.model) === c.option.model;
            return <Opt key={c.option.model} on={on} disabled={!!c.blocked} onClick={() => setModel(c.option.model)} title={c.option.model} sub={[c.option.manufacturer, c.option.vendor !== c.option.manufacturer ? `bought from ${c.option.vendor}` : '', c.blocked ?? ''].filter(Boolean).join(' · ')} side={<span className="num">{money(c.option.unitPrice)}</span>} />;
          })}</div></Sect>
          <div className="pm-grid">
            <Sect title="Quantity"><NumInput value={qty} min={1} step={1} unit="each" onChange={v => setQty(v === undefined ? undefined : Math.max(0, Math.round(v)))} /></Sect>
            {phases.length > 1 && <Sect title="For phase"><SelectInput<string> value={phaseId} onChange={setPhase} options={phases.map(p => ({ id: p.id, label: `${p.name} · ${date(p.goLive)}` }))} style={{ width: '100%' }} /></Sect>}
          </div>
          {line && <Sect title="Effect">
            <table className="nst-table pm-fx"><tbody>
              <tr><td>Line total</td><td className="num">{money(line.total)}</td></tr>
              <tr><td>Comes from</td><td className="num">{src ? [src.fromStock && `stock ${num(src.fromStock)}`, src.toBuy && `buy ${num(src.toBuy)}`].filter(Boolean).join(', ') : '—'}</td></tr>
              <tr><td>Vendor</td><td>{buy ? <>{buy.vendorName} {contract ? <Chip size="xs" tone="success">{contract}</Chip> : <Chip size="xs" tone="warning">No contract</Chip>}</> : 'nothing to buy'}</td></tr>
              <tr><td>Lead time</td><td className="num">{line.leadWeeks !== undefined ? `${line.leadWeeks} wk` : '—'}</td></tr>
              <tr><td>Order by</td><td className="num">{orderByOf(src) ? date(orderByOf(src)) : '—'}</td></tr>
              <tr><td>Bill of materials</td><td className="num">{after ? `${money(after.bom.total)} (${sig(line.total)})` : '—'}</td></tr>
            </tbody></table>
          </Sect>}
        </>}
      </div>
    </Drawer>
  );
}
