/* Bill of materials: where the items come from (spare site capacity, stock, purchase) with vendors and contracts, the avoided cost,
   totals by category, the comparison with the CapEx estimate and the line table (Download CSV). */
import { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import type * as T from '../../../planner/p2b/types';
import { bomCsv, type Bom, type BomItem } from '../../../planner/lib/outputs';
import type { SourceKind, SourcedBom, SourcedLine } from '../../../planner/lib/sourcing';
import { SOURCE_LABEL, SOURCE_SHORT, avoidedCost, contractByVendor, downloadText, sourcedAsBom, sourcedBomCsv, sourcingSplit, vendorOrders } from '../../../planner/lib/packModel';
import { Btn, Chip, Empty, Panel, Seg } from '../../../ui/kit';
import { DataTable, type Col } from '../../../ui/DataTable';
import { SOFT, SoftMeter, Split, type Tone } from '../../../ui/Analytics';
import { Figs } from '../parts';
import { money, num } from '../common';
import { usdText } from './records';

const ESTIMATE_SCOPES: T.PlannerScope[] = ['new-dc', 'expansion', 'hall', 'portfolio'];
const SOURCE_TONE: Record<SourceKind, Tone> = { site: 'success', stock: 'info', procure: 'neutral' };
const dash = <span className="vw-label">—</span>;
type Row = BomItem & Partial<SourcedLine>;

function Allocations({ line }: { line: Row }) {
  return (
    <div className="pk-alloc">
      {line.substituted && <p className="note note--warn">Preferred model not used: {line.substituted}.</p>}
      {(line.allocations ?? []).map((a, i) => (
        <div key={i} className="row wrap" style={{ gap: 6 }}>
          <Chip tone={SOURCE_TONE[a.source]} size="xs" dot>{SOURCE_SHORT[a.source]} {num(a.qty)}</Chip>
          <span>{usdText(a.note)}</span>
          {a.source === 'procure' && <small className="vw-label">{money(a.unitCost)} each{a.leadWeeks ? ` · ${a.leadWeeks} weeks lead` : ''}</small>}
          {a.source === 'stock' && a.deviceIds && <small className="vw-label">{a.deviceIds.length} device{a.deviceIds.length === 1 ? '' : 's'} held on execution</small>}
          {a.source === 'site' && a.rackIds && <small className="vw-label">{a.rackIds.slice(0, 6).join(', ')}{a.rackIds.length > 6 ? ` and ${a.rackIds.length - 6} more` : ''}</small>}
        </div>
      ))}
    </div>
  );
}

function SourcingSummary({ sourced }: { sourced: SourcedBom }) {
  const split = sourcingSplit(sourced);
  const avoided = avoidedCost(sourced);
  const orders = vendorOrders(sourced).length;
  return (
    <Panel icon={I.PackageSearch} title="Where the items come from" info="Each line is matched first against spare capacity at the site, then against stock that nobody holds, and only then bought from the catalogue vendor under its contract."
      actions={<span className="vw-label">{avoided ? `${money(avoided)} of new spend avoided` : 'Everything is bought new'}</span>}>
      <Split legend={false} parts={split.map(x => ({ key: x.source, label: SOURCE_LABEL[x.source], n: x.value, tone: SOURCE_TONE[x.source] }))} />
      <div className="pk-split">
        {split.map(x => (
          <div key={x.source}>
            <span className="vw-label"><i style={{ background: SOFT[SOURCE_TONE[x.source]] }} />{SOURCE_LABEL[x.source]}</span>
            <b className="num">{money(x.value)}</b>
            <small className="vw-label">{x.lines ? `${x.lines} line${x.lines === 1 ? '' : 's'}` : 'none'}{x.source === 'procure' && orders ? ` · ${orders} vendor order${orders === 1 ? '' : 's'}` : ''}</small>
          </div>
        ))}
        <div>
          <span className="vw-label">Avoided cost</span>
          <b className="num" style={avoided ? { color: 'var(--vw-color-emerald-700)' } : undefined}>{money(avoided)}</b>
          <small className="vw-label">site capacity and stock at list price</small>
        </div>
      </div>
    </Panel>
  );
}

export function BomView({ plan, bom: plain, sourced, capexTotal }: { plan: T.PlannerPlan; bom: Bom; sourced?: SourcedBom; capexTotal: number }) {
  const bom = useMemo(() => (sourced ? sourcedAsBom(plain, sourced) : plain), [plain, sourced]);
  const contract = useMemo(() => (sourced ? contractByVendor(sourced) : new Map<string, string>()), [sourced]);
  const [category, setCategory] = useState<string>('all');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const max = Math.max(1, ...bom.byCategory.map(c => c.total));
  const longLead = bom.lines.filter(l => (l.leadWeeks ?? 0) >= 40).length;
  const estimate = ESTIMATE_SCOPES.includes(plan.scope);

  const cols: Col<Row>[] = useMemo(() => {
    const toggle = (id: string) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const expand: Col<Row> = { key: 'x', header: '', render: r => (r.allocations?.length
      ? <button type="button" className="pk-expand" aria-label={open.has(r.id) ? 'Hide sourcing' : 'Show sourcing'} aria-expanded={open.has(r.id)} onClick={() => toggle(r.id)}>{open.has(r.id) ? <I.ChevronDown size={14} /> : <I.ChevronRight size={14} />}</button> : null) };
    const cat: Col<Row> = { key: 'category', header: 'Category', render: r => r.category };
    const item: Col<Row> = { key: 'item', header: 'Item', wrap: true, render: r => <span className="cell-2"><span className="pk-b">{r.item}</span>{sourced && open.has(r.id) && <Allocations line={r} />}</span> };
    const spec: Col<Row> = { key: 'spec', header: 'Specification', wrap: true, render: r => <span className="cell-2"><span>{r.spec}</span>{r.note && <small>{r.note}</small>}</span> };
    const qty: Col<Row> = { key: 'qty', header: 'Quantity', sort: r => r.qty, render: r => <span className="num">{num(r.qty)} {r.unit}</span> };
    const unit: Col<Row> = { key: 'unit', header: 'Unit cost', render: r => <span className="num">{money(r.unitCost)}</span> };
    const total: Col<Row> = { key: 'total', header: 'Total', sort: r => r.total, render: r => (r.monthly ? <span className="num vw-label" title="Service charge billed monthly; not part of the CapEx total">{money(r.total)} a month</span> : <span className="num pk-b">{money(r.total)}</span>) };
    const lead: Col<Row> = { key: 'lead', header: 'Lead time', sort: r => r.leadWeeks ?? 0, render: r => (r.leadWeeks === undefined ? dash : <span className={`num${r.leadWeeks >= 40 ? ' pk-late' : ''}`}>{r.leadWeeks} wk</span>) };
    const pn: Col<Row> = { key: 'pn', header: 'Part number', render: r => <span className="mono pk-small">{r.partNumber}</span> };
    const mfr: Col<Row> = { key: 'mfr', header: 'Manufacturer', render: r => r.manufacturer };
    if (!sourced) return [cat, item, spec, qty, unit, total, lead, pn, mfr];
    const model: Col<Row> = { key: 'model', header: 'Model', wrap: true, render: r => (r.model
      ? <span className="cell-2"><span>{r.model}{r.substituted && <> <Chip tone="warning" size="xs" title={`Preferred model not used: ${r.substituted}`}>Substitute</Chip></>}</span><small>{r.manufacturer}</small></span>
      : <span className="vw-label">{r.manufacturer}</span>) };
    const split = (key: 'fromSite' | 'fromStock' | 'toBuy', header: string): Col<Row> => ({ key, header, sort: r => r[key] ?? 0, render: r => (r[key] ? <span className="num">{num(r[key]!)}</span> : dash) });
    const vendor: Col<Row> = { key: 'vendor', header: 'Vendor', wrap: true, render: r => {
      const buy = r.allocations?.find(a => a.source === 'procure');
      if (!buy) return <span className="vw-label">Nothing to buy</span>;
      const c = contract.get(buy.vendorName ?? '') ?? 'no contract';
      return <span className="cell-2"><span>{buy.vendorName ?? 'To tender'}</span>{c === 'no contract' ? <span><Chip tone="warning" size="xs">No contract</Chip></span> : <small>{c}</small>}</span>;
    } };
    // Sourced lines carry more columns: the category sits under the item and the unit cost under the total (both in the CSV as columns).
    const itemCat: Col<Row> = { key: 'item', header: 'Item', wrap: true, render: r => <span className="cell-2"><span className="pk-b">{r.item}</span><small>{r.category}</small>{open.has(r.id) && <Allocations line={r} />}</span> };
    const totalUnit: Col<Row> = { ...total, render: r => <span className="cell-2">{total.render(r)}<small className="num">{money(r.unitCost)} each</small></span> };
    return [expand, itemCat, model, qty, split('fromSite', 'From site'), split('fromStock', 'From stock'), split('toBuy', 'To buy'), totalUnit, vendor, lead, { ...pn, hideBelow: 1560 }];
  }, [sourced, contract, open]);

  const rows = useMemo(() => (category === 'all' ? bom.lines : bom.lines.filter(l => l.category === category)) as Row[], [bom.lines, category]);
  if (!bom.lines.length) return <Panel><Empty icon={I.ListOrdered} title="No bill of materials">Nothing in this plan's sizing needs to be bought. Check the sizing and the plan type if that looks wrong.</Empty></Panel>;
  const filteredTotal = rows.filter(r => !r.monthly).reduce((a, r) => a + r.total, 0);
  const csv = () => downloadText(`${plan.plnId}-bom.csv`, sourced ? sourcedBomCsv(sourced) : bomCsv(bom), 'text/csv');
  const comparison = estimate
    ? `The bill of materials covers ${bom.coveragePct}% of the plant and IT estimate (${money(bom.capexCompared)}); land, shell and services are not in it.`
    : `This plan type is estimated bottom-up, so the bill of materials is the better figure. The CapEx estimate is ${money(capexTotal)}.`;

  return (
    <div className="col" style={{ gap: 14 }}>
      {sourced && <SourcingSummary sourced={sourced} />}
      {sourced && sourced.warnings.length > 0 && <div className="note note--warn"><I.TriangleAlert size={15} /><span><b>Sourcing notes ({sourced.warnings.length})</b> · {sourced.warnings.map(usdText).join(' · ')}</span></div>}
      <div className="pn-two">
        <Panel icon={I.Sigma} title="Totals" info="Sum of the bill of materials lines (indicative list prices until the items are tendered); monthly service charges are not in it. Long-lead items decide when orders must be placed.">
          <Figs items={[['Total', money(bom.total)], ['Lines', num(bom.lines.length)], ['Long lead (40+ weeks)', num(longLead)]]} />
          <p className="vw-label" style={{ margin: '10px 0 0', fontSize: 12.5 }}>{estimate ? `${bom.coveragePct}% of the plant and IT estimate` : `CapEx estimate ${money(capexTotal)}`}{plain.monthlyTotal ? ` · plus ${money(plain.monthlyTotal)} a month in services` : ''}</p>
        </Panel>
        <Panel icon={I.Truck} title="By category" info="Bill of materials value per category.">
          <div className="pk-cats">{bom.byCategory.map(c => <div key={c.category}><span className="vw-label">{c.category}</span><SoftMeter pct={(c.total / max) * 100} /><b className="num">{money(c.total)}</b></div>)}</div>
        </Panel>
      </div>
      <p className="note note--info"><I.Info size={15} /><span>{comparison} Unit costs are indicative list prices until the items are tendered.{sourced ? ' Models come from the approved catalogue; open a line to see where each quantity comes from.' : ''}</span></p>
      <Panel flush icon={I.ListOrdered} title="Lines" count={rows.length} actions={<Btn size="sm" icon={I.Download} onClick={csv}>Download CSV</Btn>}
        foot={<div className="row" style={{ justifyContent: 'space-between' }}><span className="vw-label">Total{rows.length !== bom.lines.length ? ' (filtered)' : ''}</span><b className="num">{money(filteredTotal)}</b></div>}>
        <DataTable<Row> rows={rows} cols={cols} pageSize={1000}
          toolbar={bom.byCategory.length > 1 ? <Seg<string> size="sm" value={category} onChange={setCategory} options={[{ id: 'all', label: 'All' }, ...bom.byCategory.map(c => ({ id: c.category as string, label: c.category as string }))]} /> : undefined} />
      </Panel>
    </div>
  );
}
