/* Shared pieces of the in-site panels: the step's check results, the site power chain, the "does not fit" banner. */
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Btn, Chip } from '../../../../ui/kit';
import type * as T from '../../../../planner/p2b/types';
import type { InSiteAnalysis } from '../../../../planner/lib/inSiteAnalysis';
import type { SiteBaseline } from '../../../../planner/lib/site';
import { FINDING_TONE, kw } from '../../common';
import { Note, Tbl } from '../../wizard/panelKit';
import { CHECK_LABEL, linkedPlanUrl } from './helpers';

const STATUS = { pass: 'Pass', fail: 'Fail', warn: 'Warn', 'n/a': 'Not checked' } as const;

/** The in-site checks for this step, read from the plan's analysis. */
export function ChecksBlock({ a, keys }: { a?: InSiteAnalysis; keys: string[] }) {
  const rows = keys.map(k => [k, a?.checks[k]] as const).filter((x): x is readonly [string, NonNullable<typeof x[1]>] => !!x[1]);
  if (!rows.length) return null;
  return (
    <ul className="pn-checks">
      {rows.map(([k, c]) => <li key={k}><span><Chip tone={FINDING_TONE[c.status]} size="xs" dot>{STATUS[c.status]}</Chip></span><span className="strong">{CHECK_LABEL[k] ?? k}</span><span>{c.detail}</span></li>)}
    </ul>
  );
}

/** The site's power chain as the planner reads it: each stage's usable capacity at its redundancy and the IT headroom it leaves. */
export function SiteChain({ site, addKw }: { site?: SiteBaseline; addKw: number }) {
  if (!site) return <Note>Pick the site to read its power chain.</Note>;
  const stages = site.stages.filter(s => s.key !== 'cooling');
  return (<>
    <Tbl head={['Stage', 'Usable', 'Load', 'IT headroom', 'After this plan']}>
      {stages.map(s => { const after = Math.round((s.headroomItKw - addKw) * 10) / 10; const bind = site.binding?.key === s.key; return (
        <tr key={s.key} className={bind ? 'is-on' : undefined}>
          <td title={s.basis}><span className="cell-2"><span className="pn-row" style={{ gap: 6 }}><b className="strong">{s.label}</b>{bind && <Chip tone="warning" size="xs">Binds first</Chip>}</span><small>{s.redundancy}{s.facility ? ' · facility' : ''}</small></span></td>
          <td className="num">{kw(s.usableKw)}</td><td className="num">{kw(s.loadKw)}</td>
          <td className="num">{kw(Math.max(0, s.headroomItKw))}</td><td className={`num${after < 0 ? ' pn-bad' : ''}`}>{after < 0 ? `${kw(-after)} short` : kw(after)}</td>
        </tr>); })}
    </Tbl>
    <Note>IT load today {kw(site.itLoadKw)} · held by reservations {kw(site.reservedKw)} · approved plans not yet holding capacity {kw(site.pipelineKw)}{site.pipeline.length ? ` (${site.pipeline.map(p => p.plnId).join(', ')})` : ''} · PUE {site.pue} ({site.pueSource}){site.dcPlant ? ' · −48 V DC power plant' : ''}</Note>
  </>);
}

/** When the site cannot take the plan: by how much, and a linked plant (or expansion) plan with the shortfall as its intent. */
export function ShortfallBanner({ a, plan }: { a?: InSiteAnalysis; plan: T.PlannerPlan }) {
  const nav = useNavigate();
  const s = a?.shortfall; if (!s) return null;
  return (
    <div className="pn-short">
      <div>
        <span className="pn-row" style={{ gap: 6 }}><Chip tone="error" size="xs" dot>Does not fit</Chip><b>Short of {s.what} by {kw(s.kw)}</b></span>
        <span>{s.plantIntent}. The new plan opens in the wizard with this shortfall as its intent; approve it before this one.</span>
      </div>
      <Btn variant="filled" icon={Plus} onClick={() => nav(linkedPlanUrl(s, plan))}>Create a linked {s.expansion ? 'expansion' : 'plant'} plan</Btn>
    </div>
  );
}
