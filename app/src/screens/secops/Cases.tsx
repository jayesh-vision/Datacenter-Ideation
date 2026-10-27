/* Security Ops → Cases (NIST SP 800-61 lifecycle) and Playbooks. A case groups detections, carries its playbook's steps per phase (automated
   ones run, manual ones are marked done), notes and the SLA by severity; it moves to the next phase only when that phase's steps are done. */
import { useState } from 'react';
import * as I from 'lucide-react';
import { addSecCaseNote, advanceSecCase, runSecCaseStep } from '../../api';
import type { SecCase } from '../../api/types';
import { Btn, Chip, Drawer, KV } from '../../ui/kit';
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

/* Playbooks (27-Oct-2026 review): equal summary cards (what it answers, how much runs by itself, its shape over the NIST phases);
   "View playbook" opens the full runbook — steps per phase with system and owner, the rules that trigger it, the cases it ran on. */
const PH5 = PHASES.slice(0, 5);
const trig = (t: string) => (t === 'Every new detection' ? 'Runs on every new detection' : `Triggered by ${t}`);
const PH_SHORT: Record<string, string> = { 'Detection & analysis': 'Analysis', Containment: 'Contain', Eradication: 'Eradicate', Recovery: 'Recover', 'Post-incident': 'Review' };
export function PlaybooksView(p: SecProps) {
  const { v, q, set } = p;
  const cur = q('pb') ? v.playbooks.find(x => x.id === q('pb')) : undefined;
  return (
    <>
      <div className="so-pbs">{v.playbooks.map(pb => {
        const auto = pb.steps.filter(s => s.auto).length;
        const cases = v.cases.filter(c => c.playbookId === pb.id);
        return (
          <article key={pb.id} className="so-pb vw-card-section">
            <header>
              <span className="so-pb-ic"><I.Workflow size={16} /></span>
              <span className="cell-2"><b>{pb.name}</b><small><span className="mono">{pb.id}</span> · <DomainTag d={pb.domain} /></small></span>
              <Chip tone="info" size="xs">{pb.autoPct}% automated</Chip>
            </header>
            <p className="so-pb-trig"><I.Radar size={13} />{trig(pb.trigger)}</p>
            <div className="so-pb-figs">
              <span><b>{fmtNum(pb.runs30d)}</b><em>runs · 30 d</em></span>
              <span><b>{pb.medianMin} min</b><em>median to contain</em></span>
              <span><b>{pb.steps.length} steps</b><em>{auto} auto · {pb.steps.length - auto} manual</em></span>
            </div>
            <div className="so-pb-phases" aria-label="Steps per phase">{PH5.map(ph => { const st = pb.steps.filter(s => s.phase === ph); return (
              <span key={ph} className={st.length ? '' : 'is-none'} title={`${ph}: ${st.length} step${st.length === 1 ? '' : 's'}`}>
                <i>{st.map((s, k) => <em key={k} className={s.auto ? 'is-auto' : ''} />)}</i><small>{PH_SHORT[ph]}</small></span>); })}</div>
            <footer>
              <span className="vw-label">{cases.length ? `${cases.length} case${cases.length === 1 ? '' : 's'} · ${cases.filter(c => c.phase !== 'Closed').length} open` : 'No case yet'}</span>
              <Btn size="sm" iconRight={I.ArrowRight} onClick={() => set({ pb: pb.id })}>View playbook</Btn>
            </footer>
          </article>); })}</div>
      {cur && <PlaybookDrawer pb={cur} p={p} onClose={() => set({ pb: '' })} />}
    </>
  );
}

function PlaybookDrawer({ pb, p, onClose }: { pb: SecProps['v']['playbooks'][number]; p: SecProps; onClose: () => void }) {
  const { all, go } = p;
  const rules = all.rules.filter(r => r.playbookId === pb.id);
  const cases = all.cases.filter(c => c.playbookId === pb.id);
  const auto = pb.steps.filter(s => s.auto).length;
  return (
    <Drawer open onClose={onClose} width={720} title={pb.name}
      sub={<span className="so-dh"><span className="mono">{pb.id}</span><DomainTag d={pb.domain} /><Chip tone="info" size="xs">{pb.autoPct}% automated</Chip></span>}>
      <div className="so-callout"><p>{trig(pb.trigger)}.</p><small>{fmtNum(pb.runs30d)} runs in 30 days · median {pb.medianMin} min to contain · {auto} of {pb.steps.length} steps run by automation, the rest wait for a person</small></div>
      <section className="so-sec"><header><I.ListChecks size={14} /><b>Runbook</b><small>steps per NIST SP 800-61 phase</small></header>
        <div className="so-rb">{PH5.map((ph, n) => { const st = pb.steps.filter(s => s.phase === ph); return (
          <div key={ph} className={`so-rb-ph${st.length ? '' : ' is-none'}`}>
            <span className="so-rb-h"><i>{n + 1}</i><b>{ph}</b><small>{st.length ? `${st.length} step${st.length === 1 ? '' : 's'}` : 'no step'}</small></span>
            {st.length > 0 && <ol className="so-steps">{st.map((s, k) => (
              <li key={k}><i>{s.auto ? <I.Zap size={12} /> : <I.User size={12} />}</i><span className="cell-2"><b>{s.title}</b><small>{s.auto ? 'Automated' : 'Manual'} · {s.system}</small></span></li>))}</ol>}
          </div>); })}</div>
      </section>
      <section className="so-sec"><header><I.ScanSearch size={14} /><b>Triggered by</b><small>{rules.length ? `${rules.length} rule${rules.length === 1 ? '' : 's'}` : 'every detection'}</small></header>
        {rules.length ? <ul className="ipam-find">{rules.map(r => <li key={r.id}><button type="button" onClick={() => go('rules', { rule: r.id })}><SevChip s={r.level} /><span className="cell-2"><b>{r.title}</b><small><span className="mono">{r.id}</span> · {r.hits7d} hits in 7 days</small></span><I.ChevronRight size={14} className="ipam-chev" /></button></li>)}</ul>
          : <p className="so-p">Runs first on every new detection to attach the datacenter context the other playbooks rely on.</p>}
      </section>
      <section className="so-sec"><header><I.FolderOpen size={14} /><b>Cases it ran on</b><small>{cases.length || 'none'}</small></header>
        {cases.length ? <ul className="ipam-find">{cases.map(c => <li key={c.id}><button type="button" onClick={() => go('cases', { case: c.id })}><SevChip s={c.severity} /><span className="cell-2"><b>{c.title}</b><small><span className="mono">{c.id}</span> · {c.dcId} · {c.steps.filter(s => s.done).length} of {c.steps.length} steps done</small></span><PhaseChip p={c.phase} /></button></li>)}</ul>
          : <p className="so-p">No case has used this playbook yet.</p>}
      </section>
    </Drawer>
  );
}
