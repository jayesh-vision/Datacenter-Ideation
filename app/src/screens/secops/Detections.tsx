/* Security Ops → Detections: the alert queue. Each row carries the datacenter context a SIEM alone cannot give (room, rack, owner, the
   change request covering the asset, who was badged in), filters for severity / state / domain / sensor / technique, a bulk "Escalate to
   case", and a drawer with triage actions, the context, the ATT&CK techniques, the rule and the OCSF event as stored in ClickHouse. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { escalateDetections, triageDetection } from '../../api';
import type { SecDetection } from '../../api/types';
import { Btn, Drawer, KV } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { DcLink, NeLink } from '../../ui/status';
import { fmtAgo, fmtDateTime, fmtNum } from '../../lib/format';
import type { SecProps } from './SecOps';
import { DOMAINS, DomainTag, SEVS, SevChip, StateChip, Tech } from './common';

export function DetectionsView(p: SecProps) {
  const { v, all, q, set, go, toast } = p;
  const apply = useParamPatch();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const id = q('det');
  const st = q('st'), sev = q('sev'), dom = q('dom'), sen = q('sen'), tech = q('tech'), search = q('q');
  const rows = v.detections.filter(d => (!st || (st === 'open' ? d.state !== 'Closed' : d.state === st)) && (!sev || d.severity === sev) && (!dom || d.domain === dom) && (!sen || d.sensor === sen) && (!tech || d.techniques.includes(tech))
    && (!search || `${d.id} ${d.title} ${d.summary} ${d.asset} ${d.dcId} ${d.actor ?? ''} ${d.srcIp ?? ''} ${d.caseId ?? ''}`.toLowerCase().includes(search.toLowerCase())));
  const sensorName = new Map(all.sensors.map(s => [s.id, s.name]));
  const ctxRule = new Set(all.rules.filter(r => r.context).map(r => r.id));
  const cur = id ? v.detections.find(d => d.id === id) ?? all.detections.find(d => d.id === id) : undefined;
  const escalate = (ids: string[]) => escalateDetections(ids).then(c => { setSel(new Set()); toast(`${c} opened`, `${ids.length} detection${ids.length === 1 ? '' : 's'} escalated; the playbook steps are listed on the case.`); go('cases', { case: c }); }).catch(e => toast('Not escalated', String(e.message ?? e)));
  const count = (f: (d: SecDetection) => boolean) => v.detections.filter(f).length;

  return (
    <>
      <section className="vw-card-section dcim-table">
        <DataTable rows={rows} pageSize={30} defaultSort={{ key: 'at', dir: 'desc' }} onRow={d => set({ det: d.id })} selectable selected={sel} onSelect={setSel}
          rowClass={d => (d.state === 'Closed' ? 'is-muted' : '')}
          bulkbar={<><b>{sel.size} selected</b><Btn size="sm" variant="filled" icon={I.FolderPlus} onClick={() => escalate([...sel])}>Escalate to one case</Btn><Btn size="sm" onClick={() => setSel(new Set())}>Clear</Btn></>}
          toolbar={<ListToolbar shown={rows.length} total={v.detections.length} noun="detections" onApply={apply} search={{ value: search, onChange: x => set({ q: x }), placeholder: 'Detection, asset, person, IP, case' }}
            filters={[
              { id: 'sev', label: 'Severity', quick: true, value: sev, anyLabel: 'Any severity', onChange: x => set({ sev: x }), options: SEVS.map(s => ({ id: s, label: s, count: count(d => d.severity === s && (!st || st !== 'open' || d.state !== 'Closed')) })) },
              { id: 'st', label: 'State', quick: true, value: st, anyLabel: 'Any state', onChange: x => set({ st: x }), options: [{ id: 'open', label: 'Open (not closed)', count: count(d => d.state !== 'Closed') }, ...(['New', 'Investigating', 'Escalated', 'Closed'] as const).map(s => ({ id: s, label: s, count: count(d => d.state === s) }))] },
              { id: 'dom', label: 'Domain', value: dom, anyLabel: 'Any domain', onChange: x => set({ dom: x }), options: DOMAINS.map(d => ({ id: d, label: d, count: count(x => x.domain === d) })).filter(o => o.count) },
              { id: 'sen', label: 'Sensor', value: sen, anyLabel: 'Any sensor', onChange: x => set({ sen: x }), options: all.sensors.map(s => ({ id: s.id, label: s.name, count: count(d => d.sensor === s.id) })).filter(o => o.count) },
              { id: 'tech', label: 'ATT&CK technique', value: tech, anyLabel: 'Any technique', onChange: x => set({ tech: x }), options: all.techniques.filter(t => t.hits).map(t => ({ id: t.id, label: `${t.id} ${t.name}`, count: count(d => d.techniques.includes(t.id)) })) }
            ]} />}
          cols={[
            { key: 'at', header: 'When', sort: d => d.at, render: d => <span className="cell-2"><span className="nowrap">{fmtAgo(d.at, v.now)}</span><small className="mono">{d.id}</small></span> },
            { key: 'sev', header: 'Severity', sort: d => SEVS.indexOf(d.severity), render: d => <SevChip s={d.severity} /> },
            { key: 'd', header: 'Detection', wrap: true, sort: d => d.title, render: d => <span className="cell-2"><b>{d.title}</b><small>{d.summary}{d.count > 1 ? ` · ×${fmtNum(d.count)}` : ''}</small></span> },
            { key: 'a', header: 'Asset', wrap: true, sort: d => d.asset, render: d => <span className="cell-2"><span>{d.asset}</span><small>{d.assetKind} · {d.dcId}{d.context.room ? ` · ${d.context.room}` : ''}</small></span> },
            { key: 'dom', header: 'Domain', sort: d => d.domain, hideBelow: 1380, render: d => <DomainTag d={d.domain} /> },
            { key: 'cx', header: 'Change request', wrap: true, render: d => d.context.change ? <span className="mono so-ok">{d.context.change.id}</span> : !ctxRule.has(d.ruleId) || d.domain === 'Physical' ? <span className="vw-label">—</span> : <span className="so-bad">None</span> },
            { key: 'st', header: 'State', sort: d => d.state, render: d => <span className="cell-2"><StateChip s={d.state} /><small>{d.caseId ?? d.disposition ?? d.assignee ?? 'unassigned'}</small></span> }
          ]} />
      </section>
      {cur && <DetectionDrawer d={cur} p={p} sensorName={sensorName.get(cur.sensor) ?? cur.sensor} onClose={() => set({ det: '' })} onEscalate={() => escalate([cur.id])} />}
    </>
  );
}

export function DetectionDrawer({ d, p, sensorName, onClose, onEscalate }: { d: SecDetection; p: SecProps; sensorName: string; onClose: () => void; onEscalate: () => void }) {
  const { all, go, toast } = p;
  const rule = all.rules.find(r => r.id === d.ruleId);
  const tech = new Map(all.techniques.map(t => [t.id, t]));
  const act = (a: Parameters<typeof triageDetection>[1], ok: string) => triageDetection(d.id, a).then(() => toast(ok, `${d.id} · ${d.title}`)).catch(e => toast('Not done', String(e.message ?? e)));
  const c = d.context;
  return (
    <Drawer open onClose={onClose} width={760} title={<span className="row" style={{ gap: 8 }}><SevChip s={d.severity} size="sm" />{d.title}</span>} sub={<><span className="mono">{d.id}</span> · {fmtDateTime(d.at)} · {d.dcId} · <StateChip s={d.state} />{d.caseId && <> · in <button type="button" className="ent-link mono" onClick={() => go('cases', { case: d.caseId! })}>{d.caseId}</button></>}</>}
      foot={d.state === 'Closed' ? <span className="vw-label">Closed as {d.disposition?.toLowerCase()}{d.assignee ? ` by ${d.assignee}` : ''}.</span> : <>
        {!d.caseId && <Btn variant="filled" icon={I.FolderPlus} onClick={onEscalate}>Escalate to case</Btn>}
        {d.state === 'New' && <Btn icon={I.UserCheck} onClick={() => act('assign', 'Assigned to you')}>Assign to me</Btn>}
        {!d.caseId && <><Btn icon={I.CircleCheck} onClick={() => act('tp', 'Closed as true positive')}>True positive</Btn><Btn icon={I.CircleSlash} onClick={() => act('benign', 'Closed as benign')}>Benign</Btn><Btn icon={I.CircleX} onClick={() => act('fp', 'Closed as false positive')}>False positive</Btn></>}
      </>}>
      <p className="so-summary">{d.summary}{d.count > 1 ? ` (${fmtNum(d.count)} events, ${fmtDateTime(d.at)} – ${fmtDateTime(d.lastAt)})` : ''}</p>
      <b className="dcim-sub-h">Datacenter context <span className="vw-label" style={{ fontWeight: 400 }}>added in the pipeline from DCIM, IPAM, Change management and PACS</span></b>
      <KV cols={3} items={[
        ['Datacenter', <DcLink id={d.dcId} />], ['Room · rack', `${c.room ?? '—'}${c.rack ? ` · ${c.rack}` : ''}`], ['Asset', d.neId ? <NeLink id={d.neId}>{d.asset}</NeLink> : d.asset],
        ['Owner', c.owner], ['Criticality', c.criticality], ['Network zone', c.zone],
        ['Change request', c.change ? <Link className="ent-link mono" to={`/changes/${c.change.id}`}>{c.change.id}</Link> : d.domain === 'Physical' ? '—' : rule?.context ? <span className="so-bad">None covers it</span> : 'none open'],
        ['On site then', c.onSite === undefined ? 'outside the 24 h access log' : `${c.onSite} people${c.inRoom?.length ? ` · in the room: ${c.inRoom.join(', ')}` : ''}`],
        ['Services · customers', c.services ? `${fmtNum(c.services)} · ${fmtNum(c.customers)}` : 'none on this asset']
      ]} />
      <b className="dcim-sub-h">What happened</b>
      <KV cols={3} items={[['Actor', d.actor ?? '—'], ['Source', d.srcIp ?? '—'], ['Target', d.dstIp ?? d.asset], ['Sensor', sensorName], ['OCSF class', d.ocsf], ['Events', fmtNum(d.count)]]} />
      {d.accessRef && <p className="vw-label">Raised by access control as <b className="mono">{d.accessRef}</b> — the same record is on the datacenter's <Link className="ent-link" to={`/datacenters/${d.dcId}?tab=access`}>Access & security</Link> tab.</p>}
      <b className="dcim-sub-h">MITRE ATT&CK</b>
      {d.techniques.length ? <ul className="so-techs">{d.techniques.map(t => <li key={t}><Tech id={t} /><span>{tech.get(t)?.name}</span><small>{tech.get(t)?.matrix} · {tech.get(t)?.tactic}</small></li>)}</ul>
        : <p className="vw-label">Physical detection — mapped to {rule?.control ?? 'ISO 27001 A.7'} instead of an ATT&CK technique.</p>}
      {rule && <><b className="dcim-sub-h">Rule</b>
        <p className="so-rule-line"><span className="mono">{rule.id}</span> {rule.title} · {rule.status} · {rule.hits7d} hits in 7 days, {rule.fp7d} false positive{rule.fp7d === 1 ? '' : 's'} <button type="button" className="ent-link" onClick={() => go('rules', { rule: rule.id })}>Open rule →</button></p></>}
      <b className="dcim-sub-h">Event (OCSF, as stored)</b>
      <pre className="cp-code">{JSON.stringify(d.event, null, 2)}</pre>
    </Drawer>
  );
}
