/* Process instance page (/workorders/instances/:id, 14-Oct-2026): the run on its swimlane, the open task with its form, retry a failed
   step, the timeline of completed steps (who, when, how long, what was recorded) and the record it runs for. */
import { Link, useParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getWfInstance, retryWfInstance, useQuery } from '../../api';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Panel } from '../../ui/kit';
import { DcLink } from '../../ui/status';
import { fmtDateTime } from '../../lib/format';
import { useToast } from '../ops/shared';
import { NotFound } from '../NotFound';
import { TaskCard, hrs } from './parts';
import { BpmnView } from './BpmnView';
import '../../styles/delivery.css';
import '../../styles/workorders.css';

export function InstancePage() {
  const { id = '' } = useParams();
  const { data, loading } = useQuery(() => getWfInstance(id), [id]);
  const toast = useToast();
  usePage([{ label: 'Plan & Build' }, { label: 'Work orders', to: '/workorders?tab=running' }, { label: data ? `${data.instance.pid} ${data.instance.businessKey}` : id }], data ? { dcId: data.instance.dcId } : {});
  if (loading && !data) return <Loading />;
  if (!data) return <NotFound what="Process instance" />;
  const { instance: i, process: p, tasks } = data;
  const steps = p.steps.filter(s => !s.branch);
  return (
    <div className="page dcim planner">
      <PageHead title={i.title} icon={<span className="pl-icon"><I.Workflow size={18} /></span>}
        chips={<><Chip tone={i.state === 'Completed' ? 'success' : i.state === 'Incident' ? 'error' : 'info'} dot>{i.state === 'Incident' ? 'Failed step' : i.state}</Chip><Chip tone="neutral">{p.pid} {p.name}</Chip>{i.overdue && <Chip tone="warning" dot>Step overdue</Chip>}</>}
        sub={<><span className="mono">{i.id}</span> · for <span className="mono">{i.businessKey}</span>{i.link && <> · <Link className="ent-link" to={i.link}>open the record</Link></>} · <DcLink id={i.dcId} /></>}
        actions={i.state === 'Incident' ? <Btn variant="filled" icon={I.RotateCcw} onClick={() => retryWfInstance(i.id).then(() => toast.show('Step retried', 'The process moved on.')).catch(e => toast.show('Not done', String(e.message ?? e)))}>Retry the step</Btn> : undefined} />
      <section className="wo-hero">
        <div className="wo-hero-f"><small>Current step</small><b>{i.step}</b><em>{i.state === 'Completed' ? 'finished' : `${i.lane} · step ${i.stepIndex + 1} of ${steps.length}`}</em></div>
        <div className="wo-hero-f"><small>Started</small><b>{fmtDateTime(i.started)}</b><em>{i.history.length} steps done</em></div>
        <div className="wo-hero-f"><small>{i.ended ? 'Ended' : 'Due'}</small><b>{fmtDateTime(i.ended ?? i.due)}</b><em>{i.ended ? `took ${hrs((i.ended - i.started) / 3600e3)}` : `target ${hrs(p.slaHours)} end to end`}</em></div>
        <div className="wo-hero-f"><small>Waiting since</small><b>{fmtDateTime(i.waitingSince)}</b><em>{i.overdue ? 'over the step target' : 'within the step target'}</em></div>
      </section>
      {i.state === 'Incident' && <p className="note note--warning"><I.TriangleAlert size={15} /><span>{i.incidentText}</span></p>}
      <div className="dl-dash">
        <Panel className="dl-span-12" title="Process" icon={I.Workflow} info="The BPMN process: pools and lanes are the roles that act, arrows the sequence, diamonds the decisions. Done steps are green, the current step blue (red when it failed).">
          <BpmnView processKey={p.key} done={i.history.map(h => h.step.replace(' (retried)', ''))} current={i.state === 'Completed' ? undefined : i.step} incident={i.state === 'Incident'} height={440} />
        </Panel>
        <div className="dl-span-6 dl-stack">
          {tasks.map(t => <TaskCard key={t.id} t={t} me="Jayesh Verma" onDone={(m, err) => toast.show(err ? 'Not done' : m, err ? m : undefined)} />)}
          {!tasks.length && <Panel title="Open tasks" icon={I.Inbox}><p className="vw-label">{i.state === 'Completed' ? 'The process is finished.' : i.state === 'Incident' ? 'An automatic step failed; retry it.' : 'The current step runs on its own.'}</p></Panel>}
        </div>
        <Panel className="dl-span-6" title="Timeline" icon={I.History} count={i.history.length}>
          <ol className="wf-tl">{[...i.history].reverse().map((h, k) => (
            <li key={k}><span className="wf-tl-dot" /><span className="cell-2"><b>{h.step}</b><small>{h.who} · {h.lane} · {fmtDateTime(h.at)} · took {hrs(h.tookHours)}</small>{h.data && <small className="wf-tl-data">{Object.entries(h.data).map(([kk, v]) => `${kk}: ${v === true ? 'yes' : v}`).join(' · ')}</small>}</span></li>))}
            {!i.history.length && <li><p className="vw-label" style={{ margin: 0 }}>Nothing done yet.</p></li>}</ol>
        </Panel>
      </div>
      {toast.node}
    </div>
  );
}
