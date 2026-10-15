/* Build family views (new datacenter, site expansion, regional portfolio, edge rollout): site picker, Requirements blocks, the Power
   step panel and the plan pack sections, chosen by plan type. */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { Chip, Empty, Panel } from '../../../../ui/kit';
import { buildBom, buildInitiation } from '../../../../planner/lib/outputs';
import { scoreWeights } from '../../../../planner/lib/buildSite';
import { byId } from '../../../../planner/lib/plannerData';
import type { StepProps } from '../../../../planner/lib/wizardModel';
import { DIMENSION_PANEL } from '../../wizard/DimensionPanels';
import { SitePicker } from '../../wizard/steps';
import { Sub } from '../../parts';
import { PlanStatusChip, SCOPE_LABEL, date, kw, money } from '../../common';
import type { PlanViewProps } from '../types';
import { Hint, Issues, Quiet, Tbl } from '../replace/shared';
import { analysisOf } from './model';
import { CandidateScorecard, FeasibilityTable, weightsText } from './NewDcBlocks';
import { CampusBlock, CampusPicker, CampusTable } from './ExpansionBlocks';
import { AllocationBlock, AllocationTable, DciTable, DemandTable, RegionPicker } from './PortfolioBlocks';
import { EdgeLadderTable, EdgeSitesBlock, EdgeSiteTable } from './EdgeBlocks';

export function BuildSitePicker(p: StepProps) {
  if (p.draft.scope === 'expansion') return <CampusPicker {...p} />;
  if (p.draft.scope === 'portfolio') return <RegionPicker {...p} />;
  return <SitePicker {...p} />;
}

/** Extra blocks under the site. A new datacenter's plots are edited in the wizard's own candidate block (wizard/Candidates.tsx). */
export function BuildRequirements(p: StepProps) {
  switch (p.draft.scope) {
    case 'expansion': return <CampusBlock {...p} />;
    case 'portfolio': return <AllocationBlock {...p} />;
    case 'edge': return <EdgeSitesBlock {...p} />;
    default: return null;
  }
}

/** Power step: the generic power chain plus what the site build adds (site facts, campus intake, per-site plant, allocation headroom). */
export function BuildPowerPanel(p: StepProps) {
  const Generic = DIMENSION_PANEL.power;
  const a = analysisOf(p.ev);
  const scope = p.draft.scope;
  return (<>
    {scope !== 'portfolio' && <Generic {...p} />}
    {scope === 'new-dc' && (a?.feasibility ? <><Sub>Site facts against the design · {a.feasibility.candidate.name}</Sub><FeasibilityTable f={a.feasibility} /></> : <Hint>Record the site facts on Requirements to check the grid offer and energisation.</Hint>)}
    {scope === 'new-dc' && (a?.candidates?.length ?? 0) > 1 && p.ev && <><Sub extra={<span className="vw-label" style={{ fontSize: 12 }}>Weights: {weightsText(scoreWeights(p.ev.params))}</span>}>Candidate scorecard</Sub><CandidateScorecard scores={a!.candidates!} weights={scoreWeights(p.ev.params)} /></>}
    {scope === 'expansion' && a?.campus && <><Sub>Campus intake per phase</Sub><CampusTable k={a.campus} /></>}
    {scope === 'edge' && (a?.edge?.sites.length ? <><Sub>Plant per site</Sub><EdgeSiteTable a={a.edge} /></> : <Quiet>No edge sites yet: add them on Requirements; each site is then sized with its own power variant.</Quiet>)}
    {scope === 'portfolio' && a?.portfolio && <><Sub>Allocation against real headroom</Sub>{a.portfolio.checks.length ? <AllocationTable m={a.portfolio} /> : <Quiet>No allocation yet.</Quiet>}</>}
  </>);
}

/** Plan pack: the site side of the plan for each build type. */
export function SitePlanSection({ plan, ev }: PlanViewProps) {
  const a = analysisOf(ev);
  if (!a) return <Panel><Empty icon={I.MapPin} title="Not available">The site plan is worked out when the platform data has loaded.</Empty></Panel>;
  if (plan.scope === 'new-dc') return (
    <>
      <Panel icon={I.MapPin} title={a.feasibility ? `Site feasibility · ${a.feasibility.candidate.name}` : 'Site feasibility'} info="The chosen plot's facts against what the design needs: buildable area, grid offer, energisation before phase 1, water and zoning.">
        {a.feasibility ? <FeasibilityTable f={a.feasibility} /> : <Quiet>No site facts recorded.</Quiet>}
      </Panel>
      {(a.candidates?.length ?? 0) > 0 && <Panel icon={I.Trophy} title="Candidate scorecard" count={a.candidates!.length} info="Each criterion scores the best plot 100 and the worst 0, weighted by the plan's scorecard weights; plots that break a hard limit rank below every plot that does not.">
        <CandidateScorecard scores={a.candidates!} weights={scoreWeights(ev.params)} />
        <Hint>Weights: {weightsText(scoreWeights(ev.params))}. Hover a score for each criterion.</Hint>
      </Panel>}
    </>
  );
  if (plan.scope === 'expansion') return a.campus ? (
    <Panel icon={I.Zap} title={`Campus intake · ${a.campus.campus.campus.name}`} info="The campus grid intake per side against each phase's facility load (IT × PUE), with the uprates energised by then.">
      <CampusTable k={a.campus} />
      {(a.shared?.length ?? 0) > 0 && <Hint>Shared with the campus (not bought): {a.shared!.map(s => `${s.item}: ${s.note}`).join('; ')}.</Hint>}
    </Panel>
  ) : <Panel><Empty icon={I.Zap} title="Campus check pending">The campus check runs once a campus is chosen and the platform data has loaded.</Empty></Panel>;
  if (plan.scope === 'portfolio') return a.portfolio ? (
    <>
      <Panel icon={I.TrendingUp} title="Demand in the region" info="Today's IT load at the region's sites grown each year, plus open demand requests weighted by status, against what the region can sell today."><DemandTable m={a.portfolio} /></Panel>
      <Panel icon={I.GitBranch} title="Allocation" actions={<span className="vw-label">{kw(a.portfolio.totals.allocatedKw)} · {money(a.portfolio.totals.capexUsd)}</span>} info="Where and when capacity is added: each row becomes a child plan on approval, checked against real headroom and lead time.">
        {a.portfolio.checks.length ? <AllocationTable m={a.portfolio} /> : <Quiet>No allocation accepted yet.</Quiet>}
        {a.portfolio.gaps.length > 0 && <Issues items={[`Gaps: ${a.portfolio.gaps.map(g => `${g.year}: ${kw(g.kw)} (${g.reason})`).join('; ')}`]} />}
      </Panel>
      <Panel icon={I.Network} title="Interconnect" info="Links needed between the allocated locations, with distance, one-way latency and the carriers present at both ends."><DciTable m={a.portfolio} /></Panel>
    </>
  ) : <Panel><Empty icon={I.GitBranch} title="Allocation pending">The allocation is worked out when the platform data has loaded.</Empty></Panel>;
  if (plan.scope === 'edge') return a.edge?.sites.length ? (
    <>
      <Panel icon={I.Plug} title="Sites and power variants" count={a.edge.sites.length} actions={<span className="vw-label">{a.edge.groups.map(g => `${g.sites.length} × ${g.variant.label}`).join(', ')}</span>} info="Each edge site sized on its own: supply need against the surveyed supply, UPS, battery, genset and cooling for its power variant."><EdgeSiteTable a={a.edge} /></Panel>
      <Panel icon={I.TrendingUp} title="Load per site" info="Each site's load at go-live and after 12 and 24 months of growth, and when it passes 85% of what is installed."><EdgeLadderTable rows={a.edgeLadder ?? []} /></Panel>
    </>
  ) : <Panel><Empty icon={I.MapPin} title="No sites chosen yet">Add the edge locations on Requirements.</Empty></Panel>;
  return null;
}

/** Plan pack: acceptance tests per phase or per site, site work orders, the site records execution created, or the child plans of a portfolio. */
export function CommissioningSection({ plan, ev, data, template, benchmarks }: PlanViewProps) {
  const init = useMemo(() => buildInitiation(plan, ev, template, buildBom(plan, ev, benchmarks)), [plan, ev, template, benchmarks]);
  if (plan.scope === 'portfolio') {
    const kids = (data.plannerPlans ?? []).filter(k => k.parentPlanId === plan.id);
    return (
      <Panel icon={I.GitBranch} title="Child plans" count={kids.length || (init.childPlans ?? []).length} actions={<span className="vw-label">{kids.length ? `${kids.filter(k => k.status === 'Completed').length} of ${kids.length} completed` : 'Created on approval'}</span>}
        info="One child plan per allocation row; each sizes, tests and commissions its own capacity." foot={<span className="vw-label" style={{ fontSize: 12 }}>Each child plan sizes, tests and commissions its own capacity.</span>}>
        <Tbl>
          <thead><tr><th>Plan</th><th>Type</th><th>IT capacity</th><th>Live</th><th>Budget envelope</th><th>Status</th></tr></thead>
          <tbody>{kids.length ? kids.map(k => <tr key={k.id}><td><span className="cell-2"><span className="strong">{k.title}</span><small><Link className="ent-link mono" to={`/planning/plans/${k.id}`}>{k.plnId}</Link></small></span></td><td>{SCOPE_LABEL[k.scope]}</td><td className="num">{kw(k.designPowerKw)}</td><td>{date(k.targetGoLive)}</td><td className="num">{money(Number(k.params.budgetEnvelopeUsd ?? 0))}</td><td><PlanStatusChip s={k.status} size="xs" /></td></tr>)
            : (init.childPlans ?? []).map(c => <tr key={c.rowId}><td><span className="strong">{c.title}</span></td><td>{SCOPE_LABEL[c.scope]}</td><td className="num">{kw(c.itKw)}</td><td>{date(c.goLive)}</td><td className="num">{money(c.budget)}</td><td><Chip tone="neutral" size="xs" dot>On approval</Chip></td></tr>)}
            {!kids.length && !(init.childPlans ?? []).length && <tr><td colSpan={6} className="vw-label">No allocation yet: child plans follow from the allocation rows.</td></tr>}</tbody>
        </Tbl>
      </Panel>
    );
  }
  const atps = init.atps ?? [];
  const created = (data.atps ?? []).filter(t => t.plannerPlanId === plan.id);
  const byPhase = [...new Set(atps.map(x => x.phaseName ?? 'Go-live'))];
  const site = plan.artefacts?.createdSite;
  const edgeIds = plan.artefacts?.edgeLocationIds ?? [];
  const records: { kind: string; id: string; name: string; to?: string }[] = [
    ...(site?.dataCenterId ? [{ kind: 'Datacenter', id: site.dataCenterId, name: byId(data, 'dataCenters', site.dataCenterId)?.name ?? site.dataCenterId }] : []),
    ...(site?.buildingIds ?? []).map(id => ({ kind: 'Building', id, name: byId(data, 'buildings', id)?.name ?? id })),
    ...(site?.floorIds ?? []).map(id => ({ kind: 'Floor', id, name: byId(data, 'floors', id)?.name ?? id })),
    ...(site?.hallIds ?? []).map(id => ({ kind: 'Hall', id, name: byId(data, 'halls', id)?.name ?? id })),
    ...edgeIds.map(id => ({ kind: 'Edge location', id, name: byId(data, 'edgeLocations', id)?.name ?? id })),
  ];
  const statusOf = (r: { kind: string; id: string }) => {
    const rec = r.kind === 'Datacenter' ? byId(data, 'dataCenters', r.id) : r.kind === 'Building' ? byId(data, 'buildings', r.id) : r.kind === 'Hall' ? byId(data, 'halls', r.id) : r.kind === 'Edge location' ? byId(data, 'edgeLocations', r.id) : byId(data, 'floors', r.id);
    return (rec as { status?: string } | undefined)?.status;
  };
  return (
    <>
      <Panel icon={I.ClipboardCheck} title="Acceptance tests" count={atps.length} actions={<span className="vw-label">{created.length ? `${created.filter(t => t.status === 'Accepted').length} of ${created.length} accepted` : `${atps.length} created on execution`}</span>}
        info="The commissioning tests the plan creates on execution (L1 factory witness to L5 integrated systems test), per phase or per site, from the checklist templates."
        foot={<span className="vw-label" style={{ fontSize: 12 }}>{plan.scope === 'edge' ? 'Each site takes service only when its site acceptance test is accepted.' : 'Each phase goes live only when its L5 integrated systems test is accepted.'}</span>}>
        {!atps.length ? <Empty icon={I.ClipboardCheck} title="No acceptance tests">No checklist templates found for this plan type.</Empty> : <div className="col" style={{ gap: 12 }}>{byPhase.map(ph => (
          <div key={ph} className="col" style={{ gap: 6 }}>
            <span className="strong">{ph}</span>
            <Tbl>
              <thead><tr><th>Test</th><th>System</th><th>Level</th><th>Steps</th><th>Project</th><th>Status</th></tr></thead>
              <tbody>{atps.filter(x => (x.phaseName ?? 'Go-live') === ph).map(x => { const rec = created.find(t => t.name === x.name && (!x.planPhaseId || t.planPhaseId === x.planPhaseId)); return (
                <tr key={x.uid}><td><span className="strong">{x.name}</span></td><td>{x.system}</td><td><Chip tone={x.level === 'L5 IST' ? 'warning' : 'neutral'} size="xs">{x.level}</Chip></td><td style={{ whiteSpace: 'normal', minWidth: 260 }}><span className="vw-label" style={{ fontSize: 12.5 }}>{x.steps.map(s => s.description).join('; ')}</span></td><td>{init.projects.find(pj => pj.uid === x.projectUid)?.name.split(' — ').slice(-1)[0] ?? '—'}</td><td>{rec ? <Chip tone={rec.status === 'Accepted' ? 'success' : 'warning'} size="xs" dot>{rec.status}</Chip> : <span className="vw-label">On execution</span>}</td></tr>
              ); })}</tbody>
            </Tbl>
          </div>
        ))}</div>}
      </Panel>
      {(init.workOrders?.length ?? 0) > 0 && (
        <Panel icon={I.Wrench} title="Site work orders" count={init.workOrders!.length} actions={<span className="vw-label">Started on execution</span>} info="Per-site work orders (survey, civil, power, install, commissioning) the rollout starts in Delivery when it is executed.">
          <Tbl>
            <thead><tr><th>Work order</th><th>Process</th><th>From</th><th>To</th></tr></thead>
            <tbody>{init.workOrders!.map(w => <tr key={w.name}><td><span className="strong">{w.name}</span></td><td>{w.process}</td><td>{date(w.start)}</td><td>{date(w.end)}</td></tr>)}</tbody>
          </Tbl>
        </Panel>
      )}
      <Panel icon={I.Building2} title="Site records" count={records.length} info="The estate records execution creates for the new site (datacenter, buildings, floors, halls) or the edge locations it moves into progress; DCIM and Capacity read them.">
        {records.length ? <Tbl>
          <thead><tr><th>Record</th><th>Name</th><th>Id</th><th>Status</th></tr></thead>
          <tbody>{records.map(r => <tr key={`${r.kind}${r.id}`}><td>{r.kind}</td><td><span className="strong">{r.name}</span></td><td className="mono">{r.id}</td><td>{statusOf(r) ? <Chip tone="info" size="xs" dot>{statusOf(r)}</Chip> : '—'}</td></tr>)}</tbody>
        </Tbl> : <Quiet>{plan.status === 'Executing' || plan.status === 'Completed' ? 'No site records were created by this plan.' : plan.scope === 'expansion' && plan.dataCenterId ? 'Execution adds the building to the existing datacenter record.' : 'Created when the build starts: the datacenter, its buildings, floors and halls (or the edge locations).'}</Quiet>}
      </Panel>
    </>
  );
}
