/* Security Ops → Cases (NIST SP 800-61 lifecycle) and Playbooks. A case groups detections, carries its playbook's steps per phase (automated
   ones run, manual ones are marked done), notes and the SLA by severity; it moves to the next phase only when that phase's steps are done. */
import { useState } from 'react';
import * as I from 'lucide-react';
import { addSecCaseNote, advanceSecCase, runSecCaseStep } from '../../api';
import type { SecCase } from '../../api/types';
import { Btn, Chip, Drawer, KV, Panel } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { DcLink } from '../../ui/status';
import { fmtAgo, fmtDateTime, fmtDur, fmtNum } from '../../lib/format';
import type { SecProps } from './SecOps';
import { DomainTag, Lifecycle, PHASES, PhaseChip, SEVS, SevChip, StateChip, Tech } from './common';

const VIEWS = [{ id: 'open', label: 'Open' }, { id: 'late', label: 'Past SLA' }, { id: 'closed', label: 'Closed' }, { id: 'all', label: 'All' }];

export function CasesView(p: SecProps) {
  const { v, q, set } = p;
  const apply = useParamPatch();
  const cv = q('cv') || 'open', sev = q('sev'), search = q('q');
  const late = (c: SecCase) => c.phase !== 'Closed' && v.now > c.slaDue;
  const rows = v.cases.filter(c => (cv === 'all' || (cv === 'open' ? c.phase !== 'Closed' : cv === 'closed' ? c.phase === 'Closed' : late(c))) && (!sev || c.severity === sev)
    && (!search || `${c.id} ${c.title} ${c.dcId} ${c.owner} ${c.assets.join(' ')}`.toLowerCase().includes(search.toLowerCase())));
  const cur = q('case') ? v.cases.find(c => c.id === q('case')) : undefined;
  return (
    <>
      <section className="vw-card-section dcim-table">
        <DataTable rows={rows} pageSize={25} onRow={c => set({ case: c.id })}
          toolbar={<ListToolbar shown={rows.length} total={v.cases.length} noun="cases" onApply={apply} search={{ value: search, onChange: x => set({ q: x }), placeholder: 'Case, asset, owner, datacenter' }}
            filters={[{ id: 'cv', label: 'View', quick: true, value: cv, defaultValue: 'open', onChange: x => set({ cv: x === 'open' ? '' : x }), options: VIEWS.map(o => ({ ...o, count: v.cases.filter(c => o.id === 'all' || (o.id === 'open' ? c.phase !== 'Closed' : o.id === 'closed' ? c.phase === 'Closed' : late(c))).length })) },
              { id: 'sev', label: 'Severity', quick: true, value: sev, anyLabel: 'Any severity', onChange: x => set({ sev: x }), options: SEVS.map(s => ({ id: s, label: s, count: v.cases.filter(c => c.severity === s).length })) }]} />}
          cols={[
            { key: 'id', header: 'Case', wrap: true, sort: c => c.id, render: c => <span className="cell-2"><b>{c.title}</b><small><span className="mono">{c.id}</span> · {c.owner} · opened {fmtAgo(c.opened, v.now)}</small></span> },
            { key: 'sev', header: 'Severity', sort: c => SEVS.indexOf(c.severity), render: c => <SevChip s={c.severity} /> },
            { key: 'dc', header: 'Datacenter', sort: c => c.dcId, render: c => <DcLink id={c.dcId} /> },
            { key: 'dom', header: 'Domain', sort: c => c.domain, render: c => <DomainTag d={c.domain} /> },
            { key: 'ph', header: 'Phase', sort: c => PHASES.indexOf(c.phase), render: c => <span className="cell-2"><PhaseChip p={c.phase} /><small>{c.steps.filter(s => s.done).length} of {c.steps.length} steps</small></span> },
            { key: 'sla', header: 'Response SLA', sort: c => c.slaDue, render: c => c.phase === 'Closed' ? <span className="cell-2"><span>Closed</span><small>{c.closed ? `in ${fmtDur((c.closed - c.opened) / 6e4)}` : ''}</small></span>
              : <span className={late(c) ? 'so-bad' : ''}>{late(c) ? `${fmtDur((v.now - c.slaDue) / 6e4)} late` : `${fmtDur((c.slaDue - v.now) / 6e4)} left`}</span> },
            { key: 'det', header: 'Detections', sort: c => c.detectionIds.length, render: c => fmtNum(c.detectionIds.length) }
          ]} />
      </section>
      {cur && <CaseDrawer c={cur} p={p} onClose={() => set({ case: '' })} />}
    </>
  );
}

function CaseDrawer({ c, p, onClose }: { c: SecCase; p: SecProps; onClose: () => void }) {
  const { all, go, toast } = p;
  const [note, setNote] = useState('');
  const dets = c.detectionIds.map(id => all.detections.find(d => d.id === id)).filter(Boolean) as typeof all.detections;
  const tech = new Map(all.techniques.map(t => [t.id, t]));
  const pb = all.playbooks.find(x => x.id === c.playbookId);
  const late = c.phase !== 'Closed' && all.now > c.slaDue;
  const openHere = c.steps.filter(s => s.phase === c.phase && !s.done).length;
  const run = (f: () => Promise<unknown>, ok: string) => f().then(() => toast(ok, `${c.id} · ${c.title}`)).catch(e => toast('Not done', String(e.message ?? e)));
  const next = PHASES[PHASES.indexOf(c.phase) + 1];
  return (
    <Drawer open onClose={onClose} width={880} title={<span className="row" style={{ gap: 8 }}><SevChip s={c.severity} size="sm" />{c.title}</span>}
      sub={<><span className="mono">{c.id}</span> · {c.dcId} · owner {c.owner} · opened {fmtDateTime(c.opened)}{pb ? <> · playbook {pb.name}</> : ''}</>}
      foot={c.phase === 'Closed' ? <span className="vw-label">Closed {c.closed ? fmtDateTime(c.closed) : ''} · {c.outcome}</span> : <>
        <Btn variant="filled" icon={next === 'Closed' ? I.Archive : I.ArrowRight} disabled={openHere > 0} title={openHere ? `${openHere} step(s) of ${c.phase} still open` : undefined} onClick={() => run(() => advanceSecCase(c.id, next === 'Closed' ? 'Resolved' : undefined), next === 'Closed' ? 'Case closed' : `Moved to ${next}`)}>{next === 'Closed' ? 'Close case' : `Move to ${next}`}</Btn>
        {openHere > 0 && <span className="vw-label">{openHere} step{openHere === 1 ? '' : 's'} of {c.phase.toLowerCase()} still open</span>}
      </>}>
      <Lifecycle phase={c.phase} />
      <div className="so-case-sum">
        <div><b className="dcim-sub-h">What happened</b><p>{c.summary}</p></div>
        <div><b className="dcim-sub-h">Impact</b><p>{c.impact}</p></div>
      </div>
      <KV cols={4} items={[['First event', fmtDateTime(c.firstEvent)], ['Detected after', fmtDur((c.opened - c.firstEvent) / 6e4)], ['Acknowledged after', fmtDur((c.acked - c.opened) / 6e4)],
        ['Response SLA', c.phase === 'Closed' ? 'met' : <span className={late ? 'so-bad' : ''}>{late ? `${fmtDur((all.now - c.slaDue) / 6e4)} late` : `due ${fmtDateTime(c.slaDue)}`}</span>],
        ['Datacenter', <DcLink id={c.dcId} />], ['Domain', <DomainTag d={c.domain} />], ['Assets', c.assets.join(', ')], ['Techniques', c.techniques.length ? <span className="row wrap" style={{ gap: 4 }}>{c.techniques.map(t => <Tech key={t} id={t} title={tech.get(t)?.name} />)}</span> : 'physical']]} />

      <b className="dcim-sub-h">Response steps {pb ? <span className="vw-label" style={{ fontWeight: 400 }}>from {pb.id} · {pb.name}</span> : null}</b>
      <ol className="so-steps">{c.steps.map((s, i) => { const now = s.phase === c.phase && !s.done; return (
        <li key={i} className={`${s.done ? 'is-done' : ''}${now ? ' is-now' : ''}`}>
          <i>{s.done ? <I.Check size={12} /> : s.auto ? <I.Zap size={12} /> : <I.User size={12} />}</i>
          <span className="cell-2"><b>{s.title}</b><small>{s.phase} · {s.system}{s.done ? ` · ${s.by}${s.at ? `, ${fmtDateTime(s.at)}` : ''}` : s.auto ? ' · automated' : ' · manual'}</small></span>
          {now && <Btn size="sm" icon={s.auto ? I.Play : I.Check} onClick={() => run(() => runSecCaseStep(c.id, i), s.auto ? 'Automation ran' : 'Step done')}>{s.auto ? 'Run' : 'Mark done'}</Btn>}
        </li>); })}</ol>

      <b className="dcim-sub-h">Detections ({dets.length})</b>
      <ul className="ipam-find">{dets.map(d => <li key={d.id}><button type="button" onClick={() => go('detections', { det: d.id })}><SevChip s={d.severity} /><span className="cell-2"><b>{d.title}</b><small><span className="mono">{d.id}</span> · {fmtDateTime(d.at)} · {d.summary}</small></span><StateChip s={d.state} /></button></li>)}</ul>

      <b className="dcim-sub-h">Notes</b>
      <ul className="so-notes">{c.notes.map((n, i) => <li key={i}><small>{fmtDateTime(n.at)} · {n.by}</small><span>{n.text}</span></li>)}{!c.notes.length && <li className="vw-label">No notes yet.</li>}</ul>
      {c.phase !== 'Closed' && <div className="so-note-add"><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note to the case timeline" /><Btn icon={I.MessageSquarePlus} disabled={!note.trim()} onClick={() => run(() => addSecCaseNote(c.id, note).then(() => setNote('')), 'Note added')}>Add</Btn></div>}
    </Drawer>
  );
}

export function PlaybooksView({ v }: SecProps) {
  return (
    <div className="so-pbs">{v.playbooks.map(p => (
      <Panel key={p.id} title={<>{p.name} <span className="mono vw-label">{p.id}</span></>} icon={I.Workflow} sub={`Trigger: ${p.trigger}`}
        actions={<Chip tone="info" size="xs">{p.autoPct}% automated</Chip>} info="A response playbook (SOAR): its steps per NIST SP 800-61 phase; ⚡ steps run by automation, the others are done by a person. Runs = cases and detections it ran on in 30 days.">
        <div className="so-pb-f"><span><b>{fmtNum(p.runs30d)}</b><em>runs, 30 days</em></span><span><b>{p.medianMin} min</b><em>median to contain</em></span><span><DomainTag d={p.domain} /></span></div>
        <ol className="so-steps is-compact">{p.steps.map((s, i) => <li key={i}><i>{s.auto ? <I.Zap size={12} /> : <I.User size={12} />}</i><span className="cell-2"><b>{s.title}</b><small>{s.phase} · {s.system}</small></span></li>)}</ol>
      </Panel>))}</div>
  );
}
