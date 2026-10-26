/* Security Ops → Threat coverage: the MITRE ATT&CK matrix (Enterprise for IT, ICS for the facility plant) with each technique's enabled rules
   and hits — techniques without a rule are the coverage gaps — and the detection rules themselves (Sigma source + the ClickHouse SQL it
   compiles to, sensors, hits, false positives, on / off). */
import * as I from 'lucide-react';
import { setSecRule } from '../../api';
import type { SecRule, SecTechnique } from '../../api/types';
import { Chip, Drawer, KV, Seg } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { fmtNum } from '../../lib/format';
import type { SecProps } from './SecOps';
import { DOMAINS, DomainTag, SEVS, SevChip, TACTICS, Tech, pct } from './common';

export function AttackView({ v, all, q, set, go }: SecProps) {
  const mx = (q('mx') || 'Enterprise') as 'Enterprise' | 'ICS';
  const ts = all.techniques.filter(t => t.matrix === mx);
  const hits = new Map<string, number>(); v.detections.forEach(d => d.techniques.forEach(t => hits.set(t, (hits.get(t) ?? 0) + 1)));
  const covered = ts.filter(t => t.rules > 0).length;
  const cur = q('tq') ? all.techniques.find(t => t.id === q('tq')) : undefined;
  const max = Math.max(1, ...ts.map(t => hits.get(t.id) ?? 0));
  return (
    <>
      <section className="vw-card-section so-mx-head">
        <Seg value={mx} onChange={x => set({ mx: x === 'Enterprise' ? '' : x, tq: '' })} options={[{ id: 'Enterprise', label: 'Enterprise (IT, network, Kubernetes)' }, { id: 'ICS', label: 'ICS (facility plant)' }]} />
        <span className="so-mx-f"><b>{pct(covered, ts.length)}%</b><em>{covered} of {ts.length} techniques in scope covered by an enabled rule</em></span>
        <span className="so-mx-f"><b>{fmtNum(ts.reduce((s, t) => s + (hits.get(t.id) ?? 0), 0))}</b><em>detections mapped, 14 days</em></span>
        <span className="so-mx-leg"><i className="is-gap" />No rule (gap)<i className="is-cov" />Covered<i className="is-hot" />Detections seen</span>
      </section>
      <div className="so-mx" style={{ gridTemplateColumns: `repeat(${TACTICS[mx].length}, minmax(96px, 1fr))` }}>
        {TACTICS[mx].map(tac => { const col = ts.filter(t => t.tactic === tac); return (
          <div key={tac} className="so-mx-col">
            <div className="so-mx-th"><b>{tac}</b><small>{col.filter(t => t.rules).length}/{col.length}</small></div>
            {col.map(t => { const h = hits.get(t.id) ?? 0; return (
              <button key={t.id} type="button" className={`so-mx-cell${t.rules ? ' is-cov' : ' is-gap'}${cur?.id === t.id ? ' is-on' : ''}`} style={h ? { boxShadow: `inset 3px 0 0 rgba(28,129,239,${0.35 + 0.65 * (h / max)})` } : undefined} onClick={() => set({ tq: t.id })}>
                <span className="mono">{t.id}</span><b>{t.name.replace(/^.*?: /, '')}</b>
                <small>{t.rules ? `${t.rules} rule${t.rules === 1 ? '' : 's'}` : 'no rule'}{h ? ` · ${h} seen` : ''}</small>
              </button>); })}
          </div>); })}
      </div>
      {cur && <TechDrawer t={cur} p={{ v, all, go, set }} onClose={() => set({ tq: '' })} />}
    </>
  );
}

function TechDrawer({ t, p, onClose }: { t: SecTechnique; p: Pick<SecProps, 'v' | 'all' | 'go' | 'set'>; onClose: () => void }) {
  const rules = p.all.rules.filter(r => r.techniques.includes(t.id));
  const dets = p.v.detections.filter(d => d.techniques.includes(t.id));
  return (
    <Drawer open onClose={onClose} width={640} title={<span className="row" style={{ gap: 8 }}><Tech id={t.id} />{t.name}</span>} sub={`MITRE ATT&CK ${t.matrix} · ${t.tactic}`}>
      <KV cols={3} items={[['Rules', String(rules.filter(r => r.enabled).length)], ['Detections, 14 days', fmtNum(dets.length)], ['Open', fmtNum(dets.filter(d => d.state !== 'Closed').length)]]} />
      <b className="dcim-sub-h">Rules detecting it</b>
      {rules.length ? <ul className="ipam-find">{rules.map(r => <li key={r.id}><button type="button" onClick={() => p.go('rules', { rule: r.id })}><SevChip s={r.level} /><span className="cell-2"><b>{r.title}</b><small><span className="mono">{r.id}</span> · {r.enabled ? `${r.hits7d} hits in 7 days` : 'disabled'}</small></span><I.ChevronRight size={14} className="ipam-chev" /></button></li>)}</ul>
        : <p className="vw-label">No rule covers this technique: a coverage gap. Write a Sigma rule for it under Detection rules.</p>}
      {dets.length > 0 && <><b className="dcim-sub-h">Latest detections</b>
        <ul className="ipam-find">{dets.slice(0, 8).map(d => <li key={d.id}><button type="button" onClick={() => p.go('detections', { det: d.id })}><SevChip s={d.severity} /><span className="cell-2"><b>{d.summary}</b><small><span className="mono">{d.id}</span> · {d.dcId} · {d.state}</small></span></button></li>)}</ul>
        <button type="button" className="ent-link" onClick={() => p.go('detections', { tech: t.id })}>All {dets.length} detections →</button></>}
    </Drawer>
  );
}

/* short sensor names for the table; the drawer shows the full ones */
const SHORT: Record<string, string> = { tacacs: 'TACACS+', netsyslog: 'Syslog', configs: 'Config backups', redfish: 'Redfish', osquery: 'osquery', falco: 'Falco', k8saudit: 'K8s audit', trivy: 'Trivy', suricata: 'Suricata', zeek: 'Zeek', netflow: 'NetFlow', ot: 'OT sensor', pacs: 'PACS', vms: 'VMS', itsm: 'Change context', dcim: 'Asset context' };
export function RulesView({ all, q, set, toast }: SecProps) {
  const apply = useParamPatch();
  const dom = q('dom'), on = q('on'), search = q('q');
  const rows = all.rules.filter(r => (!dom || r.domain === dom) && (!on || (on === 'on' ? r.enabled : !r.enabled)) && (!search || `${r.id} ${r.title} ${r.techniques.join(' ')} ${r.sensors.join(' ')}`.toLowerCase().includes(search.toLowerCase())));
  const cur = q('rule') ? all.rules.find(r => r.id === q('rule')) : undefined;
  const sensor = new Map(all.sensors.map(s => [s.id, SHORT[s.id] ?? s.name]));
  return (
    <>
      <section className="vw-card-section dcim-table">
        <DataTable rows={rows} pageSize={40} onRow={r => set({ rule: r.id })} rowClass={r => (r.enabled ? '' : 'is-muted')}
          toolbar={<ListToolbar shown={rows.length} total={all.rules.length} noun="rules" onApply={apply} search={{ value: search, onChange: x => set({ q: x }), placeholder: 'Rule, technique, sensor' }}
            filters={[{ id: 'dom', label: 'Domain', quick: true, value: dom, anyLabel: 'Any domain', onChange: x => set({ dom: x }), options: DOMAINS.map(d => ({ id: d, label: d, count: all.rules.filter(r => r.domain === d).length })).filter(o => o.count) },
              { id: 'on', label: 'State', quick: true, value: on, anyLabel: 'Enabled or not', onChange: x => set({ on: x }), options: [{ id: 'on', label: 'Enabled', count: all.rules.filter(r => r.enabled).length }, { id: 'off', label: 'Disabled', count: all.rules.filter(r => !r.enabled).length }] }]} />}
          cols={[
            { key: 'r', header: 'Rule', wrap: true, sort: r => r.id, render: r => <span className="cell-2 so-wide"><b>{r.title}</b><small><span className="mono">{r.id}</span> · {r.status}{r.context ? <> · <span className="so-ctx" title="Joins the datacenter context dictionaries (assets, change windows, tickets)"><I.Building2 size={11} />datacenter context</span></> : null}</small></span> },
            { key: 'l', header: 'Level', sort: r => SEVS.indexOf(r.level), render: r => <SevChip s={r.level} /> },
            { key: 'd', header: 'Domain', sort: r => r.domain, render: r => <DomainTag d={r.domain} /> },
            { key: 't', header: 'ATT&CK / control', wrap: true, render: r => r.techniques.length ? <span className="row wrap" style={{ gap: 4 }}>{r.techniques.map(t => <Tech key={t} id={t} />)}</span> : <span className="vw-label">{r.control}</span> },
            { key: 's', header: 'Sensors', wrap: true, hideBelow: 1380, render: r => r.sensors.map(s => sensor.get(s) ?? s).join(' · ') },
            { key: 'h', header: 'Hits, 7 days', sort: r => r.hits7d, render: r => <span className="cell-2"><span>{fmtNum(r.hits7d)}</span><small>{r.hits7d ? `${pct(r.fp7d, r.hits7d)}% false positive` : '—'}</small></span> },
            { key: 'e', header: 'State', sort: r => Number(r.enabled), render: r => <Chip tone={r.enabled ? 'success' : 'neutral'} size="xs" dot>{r.enabled ? 'Enabled' : 'Disabled'}</Chip> }
          ]} />
      </section>
      {cur && <RuleDrawer r={cur} sensor={sensor} onClose={() => set({ rule: '' })} onToggle={x => setSecRule(cur.id, x).then(() => toast(x ? 'Rule enabled' : 'Rule disabled', `${cur.id} · ${cur.title}`)).catch(e => toast('Not done', String(e.message ?? e)))} />}
    </>
  );
}

function RuleDrawer({ r, sensor, onClose, onToggle }: { r: SecRule; sensor: Map<string, string>; onClose: () => void; onToggle: (on: boolean) => void }) {
  return (
    <Drawer open onClose={onClose} width={780} title={<span className="row" style={{ gap: 8 }}><SevChip s={r.level} size="sm" />{r.id} · {r.title}</span>} sub={r.description}
      foot={<label className="cp-toggle"><input type="checkbox" checked={r.enabled} onChange={e => onToggle(e.target.checked)} /><span>{r.enabled ? 'Enabled: runs on every insert / schedule' : 'Disabled'}</span></label>}>
      <KV cols={4} items={[['Status', r.status], ['Domain', <DomainTag d={r.domain} />], ['Hits, 7 days', fmtNum(r.hits7d)], ['True / false positives', `${r.tp7d} / ${r.fp7d}`],
        ['Sensors', r.sensors.map(s => sensor.get(s) ?? s).join(', ')], ['Maps to', r.techniques.length ? r.techniques.join(', ') : r.control ?? '—'], ['Playbook', r.playbookId ?? '—'], ['Needs datacenter context', r.context ? 'yes' : 'no']]} />
      <b className="dcim-sub-h">Sigma rule</b>
      <pre className="cp-code cp-rego">{r.sigma}</pre>
      <b className="dcim-sub-h">Compiled to ClickHouse SQL {r.context && <span className="vw-label" style={{ fontWeight: 400 }}>joins the datacenter dictionaries (assets, change windows, tickets)</span>}</b>
      <pre className="cp-code">{r.sql}</pre>
    </Drawer>
  );
}
