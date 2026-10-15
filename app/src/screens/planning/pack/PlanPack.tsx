/* Plan pack (plan page tab `?tab=pack`, section `&sec=`): what the plan turns into so it can be built. "What this plan creates" lists
   every output with its state and links to the records in Delivery, IP & Network and DCIM; the template's output manifest; then the
   sections: plan document (basis of design), bill of materials (site / stock / buy), IP and network plan, drawings, build initiation,
   followed by the sections the plan's family adds (`uiFor(scope).packSections`). */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation } from '../../../planner/lib/engine';
import type { PlannerData } from '../../../planner/lib/plannerData';
import type { DeliveryProjectView } from '../../../api/types';
import { PACK_SECTIONS, buildPack, packManifest, sourcingReady, vendorOrders, type ArtefactStatus } from '../../../planner/lib/packModel';
import { useRecordedOrders, useSourcingContext } from '../../../planner/lib/usePlanner';
import { useReviewInput } from './review/reviewInput';
import { clockMs } from '../../../planner/compat/clock';
import { message } from '../../../planner/compat/notify';
import { Btn, Chip, Panel } from '../../../ui/kit';
import { DataTable, type Col } from '../../../ui/DataTable';
import type { Tone } from '../../../lib/tone';
import { uiFor, type PlanViewProps } from '../scopes/registry';
import { BomView } from './BomView';
import { DrawingsView } from './DrawingsView';
import { InitiationView } from './InitiationView';
import { IpPlanView } from './IpPlanView';
import { PlanDocument } from './PlanDocument';
import { recordLines, type RecordLine } from './records';
import { SendForReview } from './review/lazy';
import '../../../styles/planning-pack.css';

export const RECORD_STATUS: Record<ArtefactStatus, { label: string; tone: Tone }> = {
  ready: { label: 'Ready to generate', tone: 'neutral' },
  approved: { label: 'Created when executed', tone: 'info' },
  created: { label: 'Created', tone: 'success' },
  none: { label: 'Not created', tone: 'warning' },
  na: { label: 'Not part of this plan type', tone: 'neutral' },
};
const SECTION_ICON: Record<string, I.LucideIcon> = { document: I.FileText, bom: I.ListOrdered, ip: I.Network, drawings: I.DraftingCompass, initiation: I.Rocket };

/** The plan overview's "What the plan produces": each output the template lists with where it lives and its state (the pack manifest),
 *  the record behind it when there is one (bill of materials, IP plan, the Delivery project: created / created when executed / ready),
 *  and the Delivery project the plan becomes. Same logic as the Plan pack tab, so the two never disagree. */
export function PackDeliverables({ plan, ev, template, benchmarks, siteName, dcIds, delivery }: Omit<PlanPackProps, 'data'>) {
  const ctx = useSourcingContext();
  const sourcing = sourcingReady(ctx) ? ctx : undefined;
  const extra = useMemo(() => uiFor(plan.scope).packSections ?? [], [plan.scope]);
  const pack = useMemo(() => buildPack(plan, ev, template, benchmarks, siteName, sourcing), [plan, ev, template, benchmarks, siteName, sourcing]);
  const lines = useMemo(() => recordLines(plan, pack, delivery, dcIds), [plan, pack, delivery, dcIds]);
  const manifest = useMemo(() => packManifest(template, extra, pack.sheets), [template, extra, pack.sheets]);
  const rec = (k: string) => lines.find(l => l.key === k && l.status !== 'na');
  const SECTION_RECORD: Record<string, string> = { bom: 'bom', ip: 'ip', initiation: 'vehicle' };
  const packUrl = (sec: string) => `/planning/plans/${plan.id}?tab=pack${sec === 'document' ? '' : `&sec=${sec}`}`;
  const vehicle = rec('vehicle');
  const created = lines.filter(l => l.status === 'created').length, applicable = lines.filter(l => l.status !== 'na').length;
  type Row = { id: string; output: string; where?: { label: string; to: string }; status: { label: string; tone: Tone }; links: { label: string; to: string }[] };
  const rows: Row[] = manifest.map(m => {
    // the record behind an output: by its pack section, else by name (commissioning → the tests, permits, work orders in Delivery)
    const byName = /commissioning|acceptance/i.test(m.output) ? 'atps' : /work orders/i.test(m.output) ? 'wo' : /permits? per site|permit register/i.test(m.output) ? 'permits' : '';
    const r = (m.section ? rec(SECTION_RECORD[m.section] ?? '') : undefined) ?? (byName ? rec(byName) : undefined);
    const status = r && (r.status !== 'ready' || !m.section) ? RECORD_STATUS[r.status] : m.section ? { label: 'In the plan pack', tone: 'success' as Tone } : { label: 'Not generated yet', tone: 'warning' as Tone };
    return { id: m.output, output: m.output, where: m.section ? { label: m.sectionLabel ?? m.section, to: packUrl(m.section) } : undefined, status, links: r?.status === 'created' ? r.links.slice(0, 2) : [] };
  });
  if (template?.executesAs && vehicle) rows.push({ id: '__vehicle', output: `Becomes a ${template.executesAs}`, where: { label: 'Delivery', to: packUrl('initiation') }, status: RECORD_STATUS[vehicle.status], links: vehicle.status === 'created' ? vehicle.links.slice(0, 2) : [] });
  const cols: Col<Row>[] = [
    { key: 'output', header: 'Deliverable', wrap: true, render: r => <span className="pk-b">{r.output}</span> },
    { key: 'where', header: 'In', render: r => (r.where ? <Link className="ent-link nowrap" to={r.where.to}>{r.where.label}</Link> : <span className="vw-label">—</span>) },
    { key: 'status', header: 'State', render: r => <span className="row wrap" style={{ gap: 8 }}><Chip tone={r.status.tone} size="xs" dot>{r.status.label}</Chip>{r.links.map(k => <Link key={k.to + k.label} className="ent-link mono nowrap" to={k.to}>{k.label}</Link>)}</span> },
  ];
  return (
    <div className="col" style={{ gap: 8, marginBottom: 10 }}>
      {rows.length ? <DataTable rows={rows} cols={cols} pageSize={50} /> : <p className="vw-label" style={{ margin: 0 }}>The plan template lists no outputs.</p>}
      <span className="vw-label">{plan.artefacts || delivery ? `${created} of ${applicable} build records created` : `${applicable} build records ${plan.status === 'Approved' ? 'are created when the build starts' : 'are created on approval and execution'}`} · <Link className="ent-link" to={packUrl('document')}>Open the plan pack</Link></span>
    </div>
  );
}

type PackKind = 'zip' | 'pdf' | 'xlsx';
const PACK_LABEL: Record<PackKind, string> = { zip: 'review pack', pdf: 'PDF', xlsx: 'workbook' };
const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
/** The review pack downloads: the document a reviewer reads by email or in the portal (review/build.ts → pdf / xlsx / zip). The document
 *  is built on click from the figures on screen; the builders and their libraries load only then. */
function ReviewPackPanel({ plan }: { plan: T.PlannerPlan }) {
  // the same inputs as the reviewer's page (scenario under review / approved / preferred), so the files match what the portal shows
  const { input } = useReviewInput(plan);
  const [busy, setBusy] = useState<PackKind | null>(null);
  const [last, setLast] = useState<string>();
  const [sending, setSending] = useState(false);
  const run = async (kind: PackKind) => {
    if (!input) return;
    setBusy(kind);
    try {
      const [{ buildReviewDoc }, { downloadPackFile, packFileName }] = await Promise.all([import('./review/build'), import('./review/zip')]);
      const doc = buildReviewDoc({ ...input, generatedAt: new Date(clockMs()).toISOString() });
      const bytes = await downloadPackFile(doc, kind);
      setLast(`${packFileName(doc, kind)} · ${size(bytes)}`);
    } catch (e) { message.error(`The ${PACK_LABEL[kind]} could not be built: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };
  const btn = (kind: PackKind, label: string, icon: I.LucideIcon, variant?: 'filled') => <Btn size="sm" variant={variant} icon={busy === kind ? I.LoaderCircle : icon} disabled={!!busy || !input} onClick={() => void run(kind)}>{busy === kind ? 'Building…' : label}</Btn>;
  return (
    <Panel icon={I.FileArchive} title="Review pack" sub="The document a reviewer reads by email or in the portal"
      info="One package for the review: the review document as PDF (cover and verdict, approval sheet, executive summary, design basis with drawings, capacity, cost and business case, bill of materials, schedule, IP plan, risks, rule checks, delivery, assumptions, drawing sheets), the data workbook, every table as CSV, every drawing sheet as SVG, a README and a manifest with checksums."
      actions={<span className="row wrap" style={{ gap: 6 }}>{!['Cancelled', 'Completed'].includes(plan.status) && <Btn size="sm" icon={I.Send} onClick={() => setSending(true)}>Send for review</Btn>}{btn('zip', 'Download review pack (.zip)', I.FileArchive, 'filled')}{btn('pdf', 'Download PDF', I.FileText)}{btn('xlsx', 'Download workbook', I.Sheet)}</span>}>
      <p className="vw-label" style={{ margin: 0, fontSize: 12.5 }}>
        PDF with the drawings · data workbook · CSV per table · drawing sheets as SVG · README and checksums.{' '}
        <Link className="ent-link" to={`/planning/plans/${plan.id}/review`}>Open the review page</Link>
        {last && <> · <span>Downloaded {last}</span></>}
      </p>
      {sending && <SendForReview plan={plan} onClose={() => setSending(false)} />}
    </Panel>
  );
}

export interface PlanPackProps { plan: T.PlannerPlan; ev: Evaluation; template?: T.PlannerTemplate; benchmarks: T.PlannerBenchmark[]; data: PlannerData; siteName: string; dcIds: Set<string>; delivery?: DeliveryProjectView | null }

export function PlanPack({ plan, ev, template, benchmarks, data, siteName, dcIds, delivery }: PlanPackProps) {
  const [sp, setSp] = useSearchParams();
  const ctx = useSourcingContext();
  // Sourcing (site / stock / buy) needs the catalogue, the vendors and the stock; until they are there the plain bill of materials shows.
  const sourcing = sourcingReady(ctx) ? ctx : undefined;
  /* once executed, the orders execution recorded (Delivery's purchase orders); before, the sourcing as it stands */
  const recorded = useRecordedOrders(plan);
  const extra = useMemo(() => uiFor(plan.scope).packSections ?? [], [plan.scope]);
  const vp: PlanViewProps = { plan, ev, data, template, benchmarks };
  const pack = useMemo(() => buildPack(plan, ev, template, benchmarks, siteName, sourcing), [plan, ev, template, benchmarks, siteName, sourcing]);
  const lines = useMemo(() => recordLines(plan, pack, delivery, dcIds), [plan, pack, delivery, dcIds]);
  const manifest = useMemo(() => packManifest(template, extra, pack.sheets), [template, extra, pack.sheets]);
  const keys = [...PACK_SECTIONS.map(s => s.value as string), ...extra.map(x => x.key)];
  const section = keys.includes(sp.get('sec') ?? '') ? sp.get('sec')! : 'document';
  const setSection = (k: string) => { const n = new URLSearchParams(sp); k === 'document' ? n.delete('sec') : n.set('sec', k); setSp(n, { replace: true }); };
  const created = lines.filter(l => l.status === 'created').length, applicable = lines.filter(l => l.status !== 'na').length;

  const counts: Record<string, string> = {
    document: `${pack.bod.length}`, bom: `${pack.bom.lines.length}`, ip: pack.applies.ip ? `${pack.ip.items.length}` : '—', drawings: `${pack.sheets.length}`,
    initiation: `${pack.init.projects.length + (pack.sourced ? (recorded ?? vendorOrders(pack.sourced)).length : pack.init.orders.length)}`,
  };
  const nav = [
    ...PACK_SECTIONS.map(s => ({ key: s.value as string, label: s.label, count: counts[s.value], icon: SECTION_ICON[s.value], family: false })),
    ...extra.map(x => ({ key: x.key, label: x.label, count: x.count?.(vp), icon: I.Layers, family: true })),
  ];
  const cols: Col<RecordLine & { id: string }>[] = [
    { key: 'label', header: 'Output', render: l => <span className={l.status === 'na' ? 'vw-label' : 'pk-b'}>{l.label}</span> },
    { key: 'detail', header: 'What', wrap: true, render: l => <span className="vw-label">{l.detail}</span> },
    { key: 'links', header: 'Records', render: l => (l.links.length ? <span className="row wrap" style={{ gap: 10 }}>{l.links.map(k => <Link key={k.to + k.label} className="ent-link nowrap" to={k.to}>{k.label}</Link>)}</span> : <span className="vw-label">—</span>) },
    { key: 'status', header: 'Status', render: l => <Chip tone={RECORD_STATUS[l.status].tone} size="xs" dot>{RECORD_STATUS[l.status].label}</Chip> },
  ];
  const stripNote = delivery ? `${created} of ${applicable} created · in Delivery as ${delivery.project.id}`
    : plan.artefacts ? `${created} of ${applicable} created`
    : plan.status === 'Approved' ? 'Created in Delivery once the plan is approved and the build starts'
    : plan.status === 'Executing' || plan.status === 'Completed' ? 'Executed before build records were tracked'
    : 'Generated from the plan as it stands; created on approval';

  return (
    <div className="col pk" style={{ gap: 14 }}>
      <Panel flush icon={I.PackageOpen} title="What this plan creates" info="Every record the plan turns into when it is approved and built, with its state. Created records link to the screen that holds them: Delivery for the project, orders, work orders, change requests, permits and documents; IP & Network for subnets and VLANs; DCIM for racks and devices."
        actions={<span className="vw-label">{stripNote}</span>}>
        <DataTable rows={lines.map(l => ({ ...l, id: l.key }))} cols={cols} pageSize={100} />
      </Panel>

      <ReviewPackPanel plan={plan} />

      {manifest.length > 0 && (
        <Panel icon={I.Boxes} title="Plan pack" sub="The outputs this plan type delivers, from the plan template" info="Each output the template lists and the section of this pack that holds it; click one to open that section.">
          <div className="row wrap" style={{ gap: 6 }}>
            {manifest.map(m => m.section
              ? <button key={m.output} type="button" className="pk-chipbtn" onClick={() => setSection(m.section!)}><Chip tone={m.family ? 'info' : 'neutral'} size="sm">{m.output} · {m.sectionLabel}</Chip></button>
              : <Chip key={m.output} tone="warning" size="sm">{m.output} · not generated yet</Chip>)}
          </div>
        </Panel>
      )}

      <div className="pk-nav" role="tablist" aria-label="Plan pack sections">
        {nav.map(n => (
          <button key={n.key} type="button" role="tab" aria-selected={section === n.key} className={`pk-nav-btn${section === n.key ? ' is-active' : ''}${n.family ? ' is-family' : ''}`} onClick={() => setSection(n.key)}>
            <n.icon size={14} />{n.label}{n.count !== undefined && n.count !== '' && <span className="count">{n.count}</span>}
          </button>
        ))}
      </div>

      {section === 'document' && <PlanDocument plan={plan} template={template} sections={pack.bod} siteName={siteName} />}
      {section === 'bom' && <BomView plan={plan} bom={pack.bom} sourced={pack.sourced} capexTotal={ev.estimate.capexTotal} />}
      {section === 'ip' && <IpPlanView plan={plan} ip={pack.ip} applies={pack.applies.ip} />}
      {section === 'drawings' && <DrawingsView plan={plan} ev={ev} sheets={pack.sheets} />}
      {section === 'initiation' && <InitiationView plan={plan} init={pack.init} sourced={pack.sourced} recorded={recorded} dv={delivery} />}
      {extra.filter(x => x.key === section).map(x => <div key={x.key} className="col" style={{ gap: 14 }}>{x.render(vp)}</div>)}
    </div>
  );
}
