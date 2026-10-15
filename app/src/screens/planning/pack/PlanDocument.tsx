/* Plan document: the basis of design as a clean, printable document with a title block (Print, Download as HTML). */
import * as I from 'lucide-react';
import type * as T from '../../../planner/p2b/types';
import type { BodSection } from '../../../planner/lib/outputs';
import { bodHtml, downloadText, printPlanArea, type DocHeader } from '../../../planner/lib/packModel';
import { Btn, Panel } from '../../../ui/kit';
import { SCOPE_LABEL, date } from '../common';
import { usdText } from './records';

export function PlanDocument({ plan, template, sections, siteName }: { plan: T.PlannerPlan; template?: T.PlannerTemplate; sections: BodSection[]; siteName: string }) {
  const approvers = (template?.approvalPath ?? []).map(step => { const a = plan.approvals.find(x => x.step === step); return a?.person ? `${step} (${a.person})` : step; });
  // Engine texts carry USD; the document shows the geography's money.
  const secs = sections.map(s => ({ ...s, text: s.text && usdText(s.text), rows: s.rows.map(r => ({ ...r, value: usdText(r.value) })) }));
  const header: DocHeader = {
    title: plan.title, planId: plan.plnId, revision: plan.revision ?? 'A', status: plan.status, date: date(plan.updatedAt), owner: plan.ownerName,
    approvers, site: siteName, planType: template?.name ?? SCOPE_LABEL[plan.scope],
  };
  const block: [string, string][] = [
    ['Plan', header.planId], ['Revision', header.revision], ['Status', header.status], ['Date', header.date],
    ['Owner', header.owner], ['Site', header.site], ['Plan type', header.planType], ['Approvers', approvers.join(' → ') || 'Design review, then budget approval'],
  ];
  return (
    <Panel icon={I.FileText} title="Basis of design" info="The plan written up as a design document: purpose, site, redundancy, space, power, cooling, network, cost, risks and the rule checks, each value with where it came from."
      actions={<><Btn size="sm" icon={I.Printer} onClick={printPlanArea}>Print</Btn><Btn size="sm" icon={I.Download} onClick={() => downloadText(`${plan.plnId}-basis-of-design.html`, bodHtml(header, secs), 'text/html')}>Download as HTML</Btn></>}>
      <div className="plan-print-area pk-doc">
        <div className="pk-doc-kicker">Basis of design</div>
        <h2 className="pk-doc-title">{plan.title}</h2>
        <div className="pk-titleblock">{block.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
        {secs.map(sec => (
          <section key={sec.id} className="pk-doc-sec">
            <h3>{sec.title}</h3>
            {sec.text && <p>{sec.text}</p>}
            {sec.rows.map((r, i) => <div key={`${r.label}-${i}`} className="pk-doc-row"><span>{r.label}</span><span>{r.value}{r.source && <small>{r.source}</small>}</span></div>)}
          </section>
        ))}
        <p className="pk-doc-foot">Figures are indicative until the plan is approved. The note after a value says where it came from.</p>
      </div>
    </Panel>
  );
}
