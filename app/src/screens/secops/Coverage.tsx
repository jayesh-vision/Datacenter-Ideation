/* Security Ops → Threat coverage. MITRE ATT&CK (Enterprise for IT, ICS for the facility plant) as one row per tactic: its coverage on the
   left, its techniques as equal tiles on the right (covered / gap / seen) — the 27-Oct-2026 review replaced the 12-column matrix, which was
   congested and scrolled sideways. Detection rules: the Sigma rule list with create / edit / duplicate / delete (hand-written rules) and
   on / off; each rule shows its Sigma source and the ClickHouse SQL it compiles to. */
import { useEffect, useState } from 'react';
import * as I from 'lucide-react';
import { deleteSecRule, saveSecRule, setSecRule } from '../../api';
import type { SecDomain, SecRule, SecRuleInput, SecSev, SecTechnique } from '../../api/types';
import { Btn, Chip, Drawer, Field, Seg } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { fmtDateTime, fmtNum } from '../../lib/format';
import type { SecProps } from './SecOps';
import { DOMAINS, DomainTag, SEVS, SevChip, TACTICS, Tech, pct } from './common';
import { FacSection, FacSections } from '../../ui/Sections';

/* the adversary's goal per tactic (MITRE ATT&CK wording, shortened) */
const TAC_GOAL: Record<'Enterprise' | 'ICS', Record<string, string>> = {
  Enterprise: { 'Initial Access': 'Getting into the network', Execution: 'Running malicious code', Persistence: 'Keeping a foothold', 'Privilege Escalation': 'Gaining higher permissions',
    'Defense Evasion': 'Avoiding being detected', 'Credential Access': 'Stealing account names and passwords', Discovery: 'Learning the environment', 'Lateral Movement': 'Moving through the environment',
    Collection: 'Gathering data of interest', 'Command and Control': 'Talking to compromised systems', Exfiltration: 'Stealing data', Impact: 'Disrupting or destroying systems and data' },
  ICS: { 'Initial Access': 'Getting into the facility control network', Execution: 'Running code on or manipulating controllers', Persistence: 'Keeping a foothold on controllers', Discovery: 'Mapping the plant and its controllers',
    'Lateral Movement': 'Moving between controllers and zones', Collection: 'Gathering plant data and setpoints', 'Inhibit Response Function': 'Stopping alarms and safety functions from responding',
    'Impair Process Control': 'Manipulating power or cooling control', Impact: 'Causing loss of power, cooling or control' }
};
const TAC_ICON: Record<string, I.LucideIcon> = { 'Initial Access': I.DoorOpen, Execution: I.Terminal, Persistence: I.Anchor, 'Privilege Escalation': I.TrendingUp, 'Defense Evasion': I.EyeOff,
  'Credential Access': I.KeyRound, Discovery: I.Search, 'Lateral Movement': I.ArrowLeftRight, Collection: I.FolderDown, 'Command and Control': I.RadioTower, Exfiltration: I.Upload, Impact: I.Flame,
  'Inhibit Response Function': I.BellOff, 'Impair Process Control': I.SlidersHorizontal };

/* ---------------------------------------------------------------- ATT&CK coverage */
export function AttackView(p: SecProps) {
  const { v, all, q, set } = p;
  const mx = (q('mx') || 'Enterprise') as 'Enterprise' | 'ICS';
  const show = q('tf') || 'all';
  const ts = all.techniques.filter(t => t.matrix === mx);
  const hits = new Map<string, number>(); v.detections.forEach(d => d.techniques.forEach(t => hits.set(t, (hits.get(t) ?? 0) + 1)));
  const covered = ts.filter(t => t.rules > 0).length, gaps = ts.length - covered;
  const seen = ts.filter(t => hits.get(t.id)).length;
  const mapped = ts.reduce((s, t) => s + (hits.get(t.id) ?? 0), 0);
  const cur = q('tq') ? all.techniques.find(t => t.id === q('tq')) : undefined;
  const [form, setForm] = useState<Partial<SecRuleInput> | null>(null);
  const keep = (t: SecTechnique) => show === 'all' || (show === 'gaps' ? !t.rules : !!hits.get(t.id));
  return (
    <div className="so-stack">
      <section className="vw-card-section so-cov-head">
        <Seg value={mx} onChange={x => set({ mx: x === 'Enterprise' ? '' : x, tq: '' })} options={[{ id: 'Enterprise', label: 'Enterprise · IT, network, Kubernetes' }, { id: 'ICS', label: 'ICS · facility plant' }]} />
        <div className="so-cov-figs">
          <span><b className={pct(covered, ts.length) < 60 ? 'is-warn' : ''}>{pct(covered, ts.length)}%</b><em>coverage</em></span>
          <span><b>{covered}</b><em>techniques covered</em></span>
          <span><b className={gaps ? 'is-bad' : ''}>{gaps}</b><em>gaps (no rule)</em></span>
          <span><b>{fmtNum(mapped)}</b><em>detections, 14 days</em></span>
        </div>
        <Seg size="sm" value={show} onChange={x => set({ tf: x === 'all' ? '' : x })} options={[{ id: 'all', label: `All ${ts.length}` }, { id: 'gaps', label: `Gaps ${gaps}` }, { id: 'seen', label: `Seen ${seen}` }]} />
      </section>
      <div className="so-cov-leg"><span><i className="is-cov" />Covered by a rule</span><span><i className="is-gap" />Gap: no rule yet</span><span><i className="is-hot" />Detections in 14 days (darker = more)</span></div>
      <FacSections key={`${mx}-${show}`} scope={`secops-attack-${mx}`} ids={TACTICS[mx]}>{open => TACTICS[mx].map(tac => {
        const all_ = ts.filter(t => t.tactic === tac), col = all_.filter(keep), c = all_.filter(t => t.rules).length, g = all_.length - c;
        if (!col.length) return null;
        const seenHere = all_.map(t => [t, hits.get(t.id) ?? 0] as const).filter(([, h]) => h).sort((x, y) => y[1] - x[1]);
        const det = seenHere.reduce((n, [, h]) => n + h, 0), rules = new Set(all.rules.filter(r => r.enabled && r.techniques.some(id => all_.some(t => t.id === id))).map(r => r.id)).size;
        return (
          <FacSection key={tac} id={tac} scope={`secops-attack-${mx}`} open={open} title={tac} icon={TAC_ICON[tac] ?? I.Crosshair} desc={TAC_GOAL[mx][tac] ?? ''}
            summary={[
              { l: 'Coverage', v: `${c} of ${all_.length} · ${pct(c, all_.length)}%`, tone: c === 0 ? 'bad' : g ? 'warn' : 'ok' },
              { l: 'Gaps', v: g ? `${g} technique${g === 1 ? '' : 's'}` : 'none', tone: g ? (c === 0 ? 'bad' : 'warn') : 'ok' },
              { l: 'Rules', v: String(rules) },
              { l: 'Detections, 14 d', v: fmtNum(det) },
              { l: 'Seen most', v: seenHere[0] ? `${seenHere[0][0].id} · ${seenHere[0][1]}` : '—' }
            ]}>
            <div className="vw-card-section so-cov-in">
              <div className="so-cov-tac"><b>{c} of {all_.length} covered</b><small>{g ? `${g} gap${g === 1 ? '' : 's'} to close` : 'Every technique has a rule'}</small><span className="so-cov-bar"><i style={{ width: `${pct(c, all_.length)}%` }} /></span></div>
              <div className="so-cov-ts">{col.map(t => { const h = hits.get(t.id) ?? 0; return (
                <button key={t.id} type="button" className={`so-tt ${t.rules ? 'is-cov' : 'is-gap'}${h ? ` is-h${h >= 30 ? 3 : h >= 8 ? 2 : 1}` : ''}${cur?.id === t.id ? ' is-on' : ''}`} onClick={() => set({ tq: t.id })} title={`${t.id} ${t.name}`}>
                  <span className="so-tt-top"><span className="mono">{t.id}</span>{h > 0 && <em>{h}</em>}</span>
                  <b>{t.name.replace(/^.*?: /, '')}</b>
                  <small>{t.rules ? `${t.rules} rule${t.rules === 1 ? '' : 's'}` : 'No rule'}</small>
                </button>); })}</div>
            </div>
          </FacSection>);
      })}</FacSections>
      {cur && <TechDrawer t={cur} p={p} onClose={() => set({ tq: '' })} onWrite={() => setForm({ techniques: [cur.id], domain: cur.matrix === 'ICS' ? 'Facility OT' : 'Network', title: `${cur.name.replace(/^.*?: /, '')} detected` })} />}
      {form && <RuleForm p={p} init={form} onClose={() => setForm(null)} onSaved={id => { setForm(null); set({ tq: '' }); p.go('rules', { rule: id }); }} />}
    </div>
  );
}

function TechDrawer({ t, p, onClose, onWrite }: { t: SecTechnique; p: SecProps; onClose: () => void; onWrite: () => void }) {
  const rules = p.all.rules.filter(r => r.techniques.includes(t.id));
  const dets = p.v.detections.filter(d => d.techniques.includes(t.id));
  return (
    <Drawer open onClose={onClose} width={640} title={t.name} sub={<span className="so-dh"><Tech id={t.id} /><span>MITRE ATT&CK {t.matrix}</span><span>{t.tactic}</span></span>}
      foot={<div className="so-foot"><span className="vw-label">{rules.length ? `${rules.filter(r => r.enabled).length} enabled rule${rules.length === 1 ? '' : 's'}` : 'Coverage gap'}</span><div className="so-foot-r"><Btn variant={rules.length ? 'outline' : 'filled'} icon={I.FilePlus2} onClick={onWrite}>Write a rule for it</Btn></div></div>}>
      <div className="so-callout"><p>{rules.length ? `${rules.length} rule${rules.length === 1 ? '' : 's'} detect this technique; ${fmtNum(dets.length)} detection${dets.length === 1 ? '' : 's'} in 14 days.` : 'No rule detects this technique yet: a coverage gap.'}</p>
        <small>{dets.filter(d => d.state !== 'Closed').length} open · <a className="ent-link" href={`https://attack.mitre.org/techniques/${t.id.replace('.', '/')}/`} target="_blank" rel="noreferrer">Technique on attack.mitre.org</a></small></div>
      <section className="so-sec"><header><I.ScanSearch size={14} /><b>Rules detecting it</b></header>
        {rules.length ? <ul className="ipam-find">{rules.map(r => <li key={r.id}><button type="button" onClick={() => p.go('rules', { rule: r.id })}><SevChip s={r.level} /><span className="cell-2"><b>{r.title}</b><small><span className="mono">{r.id}</span> · {r.enabled ? `${r.hits7d} hits in 7 days` : 'disabled'}</small></span><I.ChevronRight size={14} className="ipam-chev" /></button></li>)}</ul>
          : <p className="so-p">Write a Sigma rule for it; it starts covering the technique as soon as it is enabled.</p>}
      </section>
      {dets.length > 0 && <section className="so-sec"><header><I.Radar size={14} /><b>Latest detections</b><small>{dets.length}</small></header>
        <ul className="ipam-find">{dets.slice(0, 8).map(d => <li key={d.id}><button type="button" onClick={() => p.go('detections', { det: d.id })}><SevChip s={d.severity} /><span className="cell-2"><b>{d.summary}</b><small><span className="mono">{d.id}</span> · {d.dcId} · {d.state}</small></span></button></li>)}</ul>
        {dets.length > 8 && <button type="button" className="ent-link" onClick={() => p.go('detections', { tech: t.id })}>All {dets.length} detections →</button>}
      </section>}
    </Drawer>
  );
}

/* ---------------------------------------------------------------- detection rules */
/* short sensor names for the table; the drawer shows the full ones */
const SHORT: Record<string, string> = { tacacs: 'TACACS+', netsyslog: 'Syslog', configs: 'Config backups', redfish: 'Redfish', osquery: 'osquery', falco: 'Falco', k8saudit: 'K8s audit', trivy: 'Trivy', suricata: 'Suricata', zeek: 'Zeek', netflow: 'NetFlow', ot: 'OT sensor', pacs: 'PACS', vms: 'VMS', itsm: 'Change context', dcim: 'Asset context' };
export function RulesView(p: SecProps) {
  const { all, q, set, toast } = p;
  const apply = useParamPatch();
  const dom = q('dom'), on = q('on'), search = q('q');
  const [form, setForm] = useState<{ init: Partial<SecRuleInput>; id?: string } | null>(null);
  const rows = all.rules.filter(r => (!dom || r.domain === dom) && (!on || (on === 'on' ? r.enabled : on === 'off' ? !r.enabled : r.custom)) && (!search || `${r.id} ${r.title} ${r.techniques.join(' ')} ${r.sensors.join(' ')}`.toLowerCase().includes(search.toLowerCase())));
  const cur = q('rule') ? all.rules.find(r => r.id === q('rule')) : undefined;
  const sensor = new Map(all.sensors.map(s => [s.id, SHORT[s.id] ?? s.name]));
  const err = (e: { message?: string }) => toast('Not done', String(e.message ?? e));
  const asInput = (r: SecRule): SecRuleInput => ({ title: r.title, description: r.description, domain: r.domain, level: r.level, status: r.status, sensors: r.sensors, techniques: r.techniques, control: r.control, context: r.context, playbookId: r.playbookId, sigma: r.sigma, sql: r.sql });
  return (
    <>
      <section className="vw-card-section dcim-table">
        <DataTable rows={rows} pageSize={40} onRow={r => set({ rule: r.id })} rowClass={r => (r.enabled ? '' : 'is-muted')}
          toolbar={<ListToolbar shown={rows.length} total={all.rules.length} noun="rules" onApply={apply} search={{ value: search, onChange: x => set({ q: x }), placeholder: 'Rule, technique, sensor' }}
            tools={<Btn variant="filled" icon={I.FilePlus2} onClick={() => setForm({ init: {} })}>New rule</Btn>}
            filters={[{ id: 'dom', label: 'Domain', quick: true, value: dom, anyLabel: 'Any domain', onChange: x => set({ dom: x }), options: DOMAINS.map(d => ({ id: d, label: d, count: all.rules.filter(r => r.domain === d).length })).filter(o => o.count) },
              { id: 'on', label: 'State', quick: true, value: on, anyLabel: 'Any state', onChange: x => set({ on: x }), options: [{ id: 'on', label: 'Enabled', count: all.rules.filter(r => r.enabled).length }, { id: 'off', label: 'Disabled', count: all.rules.filter(r => !r.enabled).length }, { id: 'mine', label: 'Written here', count: all.rules.filter(r => r.custom).length }] }]} />}
          cols={[
            { key: 'r', header: 'Rule', wrap: true, sort: r => r.id, render: r => <span className="cell-2 so-wide"><b>{r.title}</b><small><span className="mono">{r.id}</span> · {r.status} · v{r.version}{r.custom ? ' · written here' : ''}{r.context ? <> · <span className="so-ctx" title="Joins the datacenter context dictionaries (assets, change windows, tickets)"><I.Building2 size={11} />datacenter context</span></> : null}</small></span> },
            { key: 'l', header: 'Level', sort: r => SEVS.indexOf(r.level), render: r => <SevChip s={r.level} /> },
            { key: 'd', header: 'Domain', sort: r => r.domain, render: r => <DomainTag d={r.domain} /> },
            { key: 't', header: 'ATT&CK / control', wrap: true, render: r => r.techniques.length ? <span className="row wrap" style={{ gap: 4 }}>{r.techniques.map(t => <Tech key={t} id={t} />)}</span> : <span className="vw-label">{r.control}</span> },
            { key: 's', header: 'Sensors', wrap: true, hideBelow: 1380, render: r => r.sensors.map(s => sensor.get(s) ?? s).join(' · ') },
            { key: 'h', header: 'Hits, 7 days', sort: r => r.hits7d, render: r => <span className="cell-2"><span>{fmtNum(r.hits7d)}</span><small>{r.hits7d ? `${pct(r.fp7d, r.hits7d)}% false positive` : '—'}</small></span> },
            { key: 'e', header: 'State', sort: r => Number(r.enabled), render: r => <Chip tone={r.enabled ? 'success' : 'neutral'} size="xs" dot>{r.enabled ? 'Enabled' : 'Disabled'}</Chip> }
          ]} />
      </section>
      {cur && !form && <RuleDrawer r={cur} sensor={sensor} onClose={() => set({ rule: '' })}
        onToggle={x => setSecRule(cur.id, x).then(() => toast(x ? 'Rule enabled' : 'Rule disabled', `${cur.id} · ${cur.title}`)).catch(err)}
        onEdit={() => setForm({ init: asInput(cur), id: cur.id })}
        onCopy={() => setForm({ init: { ...asInput(cur), title: `${cur.title} (copy)`, status: 'Experimental' } })}
        onDelete={() => deleteSecRule(cur.id).then(() => { set({ rule: '' }); toast('Rule deleted', `${cur.id} · ${cur.title}`); }).catch(err)} />}
      {form && <RuleForm p={p} init={form.init} id={form.id} onClose={() => setForm(null)} onSaved={id => { setForm(null); set({ rule: id }); }} />}
    </>
  );
}

function RuleDrawer({ r, sensor, onClose, onToggle, onEdit, onCopy, onDelete }: { r: SecRule; sensor: Map<string, string>; onClose: () => void; onToggle: (on: boolean) => void; onEdit: () => void; onCopy: () => void; onDelete: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <Drawer open onClose={onClose} width={780} title={r.title}
      sub={<span className="so-dh"><SevChip s={r.level} /><span className="mono">{r.id}</span><span>v{r.version} · {r.status}</span><DomainTag d={r.domain} />{r.updated && <span>edited {fmtDateTime(r.updated)}{r.by ? ` by ${r.by}` : ''}</span>}</span>}
      foot={<div className="so-foot">
        <label className="cp-toggle"><input type="checkbox" checked={r.enabled} onChange={e => onToggle(e.target.checked)} /><span>{r.enabled ? 'Enabled' : 'Disabled'}</span></label>
        <div className="so-foot-r">
          {r.custom && (sure ? <><span className="vw-label">Delete this rule?</span><Btn onClick={() => setSure(false)}>Keep</Btn><Btn icon={I.Trash2} onClick={onDelete}>Delete</Btn></> : <Btn icon={I.Trash2} onClick={() => setSure(true)}>Delete</Btn>)}
          <Btn icon={I.Copy} onClick={onCopy}>Duplicate</Btn>
          <Btn variant="filled" icon={I.Pencil} onClick={onEdit}>Edit rule</Btn>
        </div>
      </div>}>
      <div className="so-callout"><p>{r.description}</p><small>{fmtNum(r.hits7d)} hits in 7 days · {r.tp7d} true positive · {r.fp7d} false positive{r.fp7d === 1 ? '' : 's'}{r.playbookId ? ` · runs playbook ${r.playbookId}` : ''}</small></div>
      <section className="so-sec"><header><I.Settings2 size={14} /><b>Definition</b></header>
        <dl className="so-facts">
          <div className="so-f"><dt>Maps to</dt><dd>{r.techniques.length ? <span className="row wrap" style={{ gap: 4 }}>{r.techniques.map(t => <Tech key={t} id={t} />)}</span> : r.control ?? '—'}</dd></div>
          <div className="so-f"><dt>Reads</dt><dd>{r.sensors.map(s => sensor.get(s) ?? s).join(', ')}</dd></div>
          <div className="so-f"><dt>Datacenter context</dt><dd>{r.context ? 'Joins assets, change windows, tickets' : 'Not needed'}</dd></div>
        </dl>
      </section>
      <section className="so-sec"><header><I.FileCode2 size={14} /><b>Sigma rule</b></header><pre className="cp-code cp-rego">{r.sigma}</pre></section>
      <section className="so-sec"><header><I.Database size={14} /><b>Compiled to ClickHouse SQL</b>{r.context && <small>joins the datacenter dictionaries</small>}</header><pre className="cp-code">{r.sql}</pre></section>
    </Drawer>
  );
}

/* the Sigma + SQL skeleton for the fields chosen (the analyst then writes the detection logic) */
function skeleton(x: SecRuleInput, sensorName: (id: string) => string) {
  const slug = x.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'new_rule';
  const tags = x.techniques.map(t => `  - attack.${t.toLowerCase()}`).concat(x.control ? [`  - iso27001.${x.control.replace(/^ISO 27001 /, '').toLowerCase()}`] : []);
  const sigma = `title: ${x.title || 'New rule'}\nstatus: ${x.status.toLowerCase()}\ndescription: ${x.description || 'What the rule detects'}\nlogsource:\n  product: ${x.sensors[0] ?? 'custom'}\n  service: ${slug}\ndetection:\n  selection:\n    field: value\n  condition: selection${x.context ? ' and not change_window' : ''}\nfalsepositives:\n  - Known administrative activity\nlevel: ${x.level.toLowerCase()}\ntags:\n${tags.join('\n') || '  - datacenter.custom'}`;
  const sql = `-- ${x.title || 'New rule'} (reads ${x.sensors.map(sensorName).join(', ') || 'a source'})\nSELECT time, src_ip, dst_ip, actor FROM sec.ocsf_detection_finding\nWHERE /* the selection */ 1 = 1${x.context ? "\n  AND dictGetOrDefault('dict_change_windows', 'change_id', asset, '') = ''" : ''}`;
  return { sigma, sql };
}

function RuleForm({ p, init, id, onClose, onSaved }: { p: SecProps; init: Partial<SecRuleInput>; id?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const { all, toast } = p;
  const blank: SecRuleInput = { title: '', description: '', domain: 'Network', level: 'Medium', status: 'Experimental', sensors: [], techniques: [], control: undefined, context: false, playbookId: undefined, sigma: '', sql: '' };
  const [x, setX] = useState<SecRuleInput>(() => { const b = { ...blank, ...init }; return b.sigma ? b : { ...b, ...skeleton(b, s => s) }; });
  const [touched, setTouched] = useState(!!init.sigma);
  const [err, setErr] = useState('');
  const up = <K extends keyof SecRuleInput>(k: K, val: SecRuleInput[K]) => setX(o => ({ ...o, [k]: val }));
  const sensorName = (s: string) => all.sensors.find(y => y.id === s)?.name ?? s;
  /* until the analyst edits the source by hand, the skeleton follows the fields */
  const sig = [x.title, x.description, x.level, x.status, x.sensors.join(), x.techniques.join(), x.control, x.context].join('|');
  useEffect(() => { if (!touched) setX(o => ({ ...o, ...skeleton(o, sensorName) })); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, touched]);
  const techs = all.techniques.filter(t => (x.domain === 'Facility OT' ? t.matrix === 'ICS' : t.matrix === 'Enterprise'));
  const phys = x.domain === 'Physical';
  const save = () => saveSecRule(x, id).then(r => { toast(id ? 'Rule saved' : 'Rule created', `${r} · ${x.title}`); onSaved(r); }).catch(e => setErr(String(e.message ?? e)));
  return (
    <Drawer open onClose={onClose} width={860} title={id ? `Edit ${id}` : 'New detection rule'} sub={id ? 'Saving creates the next version; the rule keeps its id, history and hits.' : 'A Sigma rule tagged with ATT&CK; it compiles to a ClickHouse query that runs on every insert or on a schedule.'}
      foot={<div className="so-foot">{err ? <span className="so-bad">{err}</span> : <span className="vw-label">{touched ? 'Sigma and SQL edited by hand' : 'Sigma and SQL follow the fields until you edit them'}</span>}
        <div className="so-foot-r"><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Save} onClick={save}>{id ? 'Save new version' : 'Create rule'}</Btn></div></div>}>
      <section className="so-sec"><header><I.Settings2 size={14} /><b>What it detects</b></header>
        <div className="dcim-form so-form">
          <Field label="Title" required style={{ gridColumn: '1 / -1' }}><input className="input" value={x.title} onChange={e => up('title', e.target.value)} placeholder="e.g. BMC account created outside the directory" autoFocus /></Field>
          <Field label="Description" style={{ gridColumn: '1 / -1' }}><input className="input" value={x.description} onChange={e => up('description', e.target.value)} placeholder="One sentence: the behaviour and why it matters" /></Field>
          <Field label="Domain"><select className="select" value={x.domain} onChange={e => setX(o => ({ ...o, domain: e.target.value as SecDomain, techniques: [] }))}>{DOMAINS.map(d => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Level"><select className="select" value={x.level} onChange={e => up('level', e.target.value as SecSev)}>{SEVS.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Status"><select className="select" value={x.status} onChange={e => up('status', e.target.value as SecRule['status'])}>{(['Experimental', 'Test', 'Stable'] as const).map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Playbook"><select className="select" value={x.playbookId ?? ''} onChange={e => up('playbookId', e.target.value || undefined)}><option value="">None</option>{all.playbooks.map(b => <option key={b.id} value={b.id}>{b.id} · {b.name}</option>)}</select></Field>
        </div>
      </section>
      <section className="so-sec"><header><I.Crosshair size={14} /><b>{phys ? 'Control' : 'MITRE ATT&CK'}</b><small>{phys ? 'physical rules map to ISO 27001' : x.domain === 'Facility OT' ? 'ATT&CK for ICS' : 'ATT&CK Enterprise'}</small></header>
        {phys ? <Field label="ISO 27001 control"><select className="select" value={x.control ?? ''} onChange={e => up('control', e.target.value || undefined)}><option value="">Pick a control</option>{['ISO 27001 A.7.1', 'ISO 27001 A.7.2', 'ISO 27001 A.7.3', 'ISO 27001 A.7.4', 'ISO 27001 A.5.18'].map(c => <option key={c}>{c}</option>)}</select></Field>
          : <>
            <select className="select" value="" onChange={e => e.target.value && up('techniques', [...new Set([...x.techniques, e.target.value])])}><option value="">Add a technique…</option>
              {techs.filter(t => !x.techniques.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.id} · {t.name}{t.rules ? '' : ' (gap)'}</option>)}</select>
            {x.techniques.length > 0 && <div className="so-picks">{x.techniques.map(t => <button key={t} type="button" onClick={() => up('techniques', x.techniques.filter(y => y !== t))}><span className="mono">{t}</span>{all.techniques.find(y => y.id === t)?.name}<I.X size={12} /></button>)}</div>}
          </>}
      </section>
      <section className="so-sec"><header><I.Radio size={14} /><b>Reads</b><small>the sensors whose OCSF tables the rule queries</small></header>
        <div className="so-picks is-toggle">{all.sensors.map(s => { const on = x.sensors.includes(s.id); return (
          <button key={s.id} type="button" className={on ? 'is-on' : ''} onClick={() => up('sensors', on ? x.sensors.filter(y => y !== s.id) : [...x.sensors, s.id])}>{on ? <I.Check size={12} /> : <I.Plus size={12} />}{s.name}</button>); })}</div>
        <label className="cp-toggle"><input type="checkbox" checked={x.context} onChange={e => up('context', e.target.checked)} /><span>Needs datacenter context (joins assets, change windows and tickets)</span></label>
      </section>
      <section className="so-sec"><header><I.FileCode2 size={14} /><b>Sigma source</b>{touched && <button type="button" className="ent-link so-regen" onClick={() => setTouched(false)}>Regenerate from the fields</button>}</header>
        <textarea className="input mono cp-code-edit so-code" value={x.sigma} onChange={e => { setTouched(true); up('sigma', e.target.value); }} spellCheck={false} rows={14} />
      </section>
      <section className="so-sec"><header><I.Database size={14} /><b>ClickHouse SQL</b><small>what the rule engine runs</small></header>
        <textarea className="input mono cp-code-edit so-code" value={x.sql} onChange={e => { setTouched(true); up('sql', e.target.value); }} spellCheck={false} rows={7} />
      </section>
    </Drawer>
  );
}
