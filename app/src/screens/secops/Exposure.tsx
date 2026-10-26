/* Security Ops → Vulnerabilities (CVSS v4 + EPSS + CISA KEV → SSVC), Hardening (CIS Benchmarks, DISA STIGs, vendor guides) and
   Configuration drift (running config vs the last approved backup, authorised by a change request or not). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { setSecVuln } from '../../api';
import type { SecSsvc, SecVuln } from '../../api/types';
import { Btn, Chip, Drawer, KV, Seg } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { DcLink, Meter, NeLink } from '../../ui/status';
import { SoftMeter } from '../../ui/Analytics';
import { fmtAgo, fmtDate, fmtDateTime, fmtNum } from '../../lib/format';
import type { SecProps } from './SecOps';
import { SSVC_INFO, SSVC_TONE, SEV_TONE, SEVS } from './common';

const SSVCS: SecSsvc[] = ['Act', 'Attend', 'Track*', 'Track'];
const SSVC_SUB: Record<SecSsvc, string> = { Act: 'fix within 7 days', Attend: 'fix within 30 days', 'Track*': 'watch, 90 days', Track: 'next cycle' };
const cvssTone = (s: number) => (s >= 9 ? 'error' : s >= 7 ? 'orange' : s >= 4 ? 'warning' : 'neutral');

export function VulnsView(p: SecProps) {
  const { v, all, q, set, toast } = p;
  const apply = useParamPatch();
  const ssvc = q('ssvc'), kind = q('vk'), vst = q('vst'), search = q('q'), vv = q('vv') || 'findings';
  const rows = v.vulns.filter(x => (!ssvc || x.ssvc === ssvc) && (!kind || x.assetKind === kind) && (!vst || x.state === vst)
    && (!search || `${x.advisoryId} ${x.title} ${x.asset} ${x.dcId} ${x.current}`.toLowerCase().includes(search.toLowerCase())));
  const cur = q('vuln') ? v.vulns.find(x => x.id === q('vuln')) : undefined;
  const kinds = [...new Set(v.vulns.map(x => x.assetKind))].sort();
  const adv = new Map(all.advisories.map(a => [a.id, a]));
  return (
    <>
      <div className="so-ssvc">{SSVCS.map(s => { const n = v.vulns.filter(x => x.ssvc === s && x.state === 'Open').length; return (
        <button key={s} type="button" className={`so-ssvc-t is-${SSVC_TONE[s]}${ssvc === s ? ' is-on' : ''}`} onClick={() => set({ ssvc: ssvc === s ? '' : s, vv: '' })}>
          <span>{s}</span><b>{fmtNum(n)}</b><em>{SSVC_SUB[s]} · {new Set(v.vulns.filter(x => x.ssvc === s && x.state === 'Open').map(x => `${x.dcId}|${x.asset}`)).size} assets</em></button>); })}
        <div className="so-ssvc-n"><I.Info size={14} /><span>{SSVC_INFO} Advisories here are illustrative; a live NVD, CISA KEV, FIRST EPSS and vendor PSIRT feed replaces them.</span></div>
      </div>
      <section className="vw-card-section dcim-table">
        {vv === 'advisories' ? <DataTable rows={all.advisories} pageSize={30} defaultSort={{ key: 'n', dir: 'desc' }} onRow={a => a.affected && set({ vv: '', q: a.id })} rowClass={a => (a.affected ? '' : 'is-muted')}
          toolbar={<ListToolbar shown={all.advisories.length} total={all.advisories.length} noun="advisories" tools={<Seg size="sm" value={vv} onChange={x => set({ vv: x === 'findings' ? '' : x })} options={[{ id: 'findings', label: 'Findings' }, { id: 'advisories', label: 'Advisories' }]} />} />}
          cols={[
            { key: 'a', header: 'Advisory', wrap: true, sort: a => a.id, render: a => <span className="cell-2"><b>{a.title}</b><small><span className="mono">{a.id}</span> · {a.vendor} {a.product} · {a.kind}</small></span> },
            { key: 'c', header: 'CVSS v4', sort: a => a.cvss, render: a => <span className="cell-2"><Chip tone={cvssTone(a.cvss)} size="xs">{a.cvss.toFixed(1)}</Chip><small className="mono">{a.vector.replace('CVSS:4.0/', '')}</small></span> },
            { key: 'e', header: 'EPSS', sort: a => a.epss, render: a => `${(a.epss * 100).toFixed(0)}%` },
            { key: 'k', header: 'CISA KEV', sort: a => Number(a.kev), render: a => a.kev ? <Chip tone="error" size="xs" dot>Known exploited</Chip> : <span className="vw-label">—</span> },
            { key: 'f', header: 'Fixed in', render: a => <span className="mono">{a.fixedIn}</span> },
            { key: 'n', header: 'Affected', sort: a => a.affected * 100 + a.cvss, render: a => a.affected ? fmtNum(a.affected) : <span className="vw-label">not in this estate</span> },
            { key: 'p', header: 'Published', sort: a => a.published, render: a => fmtDate(a.published) }
          ]} />
        : <DataTable rows={rows} pageSize={30} defaultSort={{ key: 'ss', dir: 'asc' }} onRow={x => set({ vuln: x.id })} rowClass={x => (x.state === 'Open' ? '' : 'is-muted')}
          toolbar={<ListToolbar shown={rows.length} total={v.vulns.length} noun="findings" onApply={apply} search={{ value: search, onChange: x => set({ q: x }), placeholder: 'Advisory, asset, version, datacenter' }}
            tools={<Seg size="sm" value={vv} onChange={x => set({ vv: x === 'findings' ? '' : x })} options={[{ id: 'findings', label: 'Findings' }, { id: 'advisories', label: 'Advisories' }]} />}
            filters={[{ id: 'ssvc', label: 'SSVC', quick: true, value: ssvc, anyLabel: 'Any decision', onChange: x => set({ ssvc: x }), options: SSVCS.map(s => ({ id: s, label: s, count: v.vulns.filter(x => x.ssvc === s).length })) },
              { id: 'vk', label: 'Asset type', quick: true, value: kind, anyLabel: 'Any asset type', onChange: x => set({ vk: x }), options: kinds.map(k => ({ id: k, label: k, count: v.vulns.filter(x => x.assetKind === k).length })) },
              { id: 'vst', label: 'State', value: vst, anyLabel: 'Any state', onChange: x => set({ vst: x }), options: (['Open', 'Remediation planned', 'Risk accepted'] as const).map(s => ({ id: s, label: s, count: v.vulns.filter(x => x.state === s).length })) }]} />}
          cols={[
            { key: 'ss', header: 'SSVC', sort: x => SSVCS.indexOf(x.ssvc) * 100 - x.cvss, render: x => <Chip tone={SSVC_TONE[x.ssvc]} size="xs">{x.ssvc}</Chip> },
            { key: 'a', header: 'Vulnerability', wrap: true, sort: x => x.advisoryId, render: x => <span className="cell-2"><b>{x.title}</b><small><span className="mono">{x.advisoryId}</span> · {adv.get(x.advisoryId)?.vendor} {adv.get(x.advisoryId)?.product}</small></span> },
            { key: 'as', header: 'Asset', wrap: true, sort: x => x.asset, render: x => <span className="cell-2"><span>{x.asset}</span><small>{x.assetKind} · {x.dcId} · {x.zone}</small></span> },
            { key: 'v', header: 'Version', render: x => <span className="cell-2 nowrap"><span className="mono">{x.current}</span><small>fixed in <span className="mono">{x.fixedIn}</span></small></span> },
            { key: 'c', header: 'CVSS · EPSS', sort: x => x.cvss, render: x => <span className="cell-2"><Chip tone={cvssTone(x.cvss)} size="xs">{x.cvss.toFixed(1)}</Chip><small>EPSS {(x.epss * 100).toFixed(0)}%{x.kev ? ' · KEV' : ''}</small></span> },
            { key: 'd', header: 'Due', sort: x => x.due, render: x => <span className={`nowrap${x.state === 'Open' && x.due < v.now ? ' so-bad' : ''}`}>{x.state === 'Open' && x.due < v.now ? `overdue ${fmtAgo(x.due, v.now).replace(' ago', '')}` : fmtDate(x.due)}</span> },
            { key: 'st', header: 'State', sort: x => x.state, render: x => <span className="cell-2"><Chip tone={x.state === 'Open' ? 'info' : x.state === 'Remediation planned' ? 'purple' : 'neutral'} size="xs" dot>{x.state}</Chip>{x.changeId && <small className="mono">{x.changeId}</small>}</span> }
          ]} />}
      </section>
      {cur && <VulnDrawer x={cur} p={p} onClose={() => set({ vuln: '' })} done={(m, b) => toast(m, b)} />}
    </>
  );
}

function VulnDrawer({ x, p, onClose, done }: { x: SecVuln; p: SecProps; onClose: () => void; done: (m: string, b?: string) => void }) {
  const a = p.all.advisories.find(y => y.id === x.advisoryId)!;
  const [why, setWhy] = useState('');
  const go = (st: SecVuln['state'], note?: string) => setSecVuln(x.id, st, note).then(() => done(st === 'Open' ? 'Reopened' : st, `${x.advisoryId} on ${x.asset}`)).catch(e => done('Not done', String(e.message ?? e)));
  return (
    <Drawer open onClose={onClose} width={680} title={<span className="row" style={{ gap: 8 }}><Chip tone={SSVC_TONE[x.ssvc]} size="sm">{x.ssvc}</Chip>{x.title}</span>} sub={<><span className="mono">{x.advisoryId}</span> · {a.vendor} {a.product} · published {fmtDate(a.published)}</>}
      foot={x.state === 'Open' ? <><Btn variant="filled" icon={I.CalendarPlus} onClick={() => go('Remediation planned')}>Plan the {a.kind === 'Firmware' ? 'firmware upgrade' : 'patch'}</Btn>
        <input className="input" style={{ maxWidth: 260 }} value={why} onChange={e => setWhy(e.target.value)} placeholder="Reason to accept the risk" /><Btn icon={I.ShieldOff} disabled={!why.trim()} onClick={() => go('Risk accepted', why)}>Accept risk</Btn></>
        : <><span className="vw-label">{x.state}{x.changeId ? ` under ${x.changeId}` : ''}{x.note ? ` · ${x.note}` : ''}</span><Btn icon={I.RotateCcw} onClick={() => go('Open')}>Reopen</Btn></>}>
      <KV cols={3} items={[['Asset', x.neId ? <NeLink id={x.neId}>{x.asset}</NeLink> : x.asset], ['Datacenter', <DcLink id={x.dcId} />], ['Network zone', x.zone], ['Running', <span className="mono">{x.current}</span>], ['Fixed in', <span className="mono">{x.fixedIn}</span>], ['Due', fmtDate(x.due)]]} />
      <b className="dcim-sub-h">How it was prioritised</b>
      <div className="so-ssvc-why">
        <span><small>CVSS v4 base</small><b>{a.cvss.toFixed(1)}</b><em className="mono">{a.vector}</em></span>
        <span><small>EPSS (30-day exploitation probability)</small><b>{(a.epss * 100).toFixed(0)}%</b><em>{a.epss >= 0.1 ? 'proof of concept or better' : 'low'}</em></span>
        <span><small>CISA KEV</small><b>{a.kev ? 'Yes' : 'No'}</b><em>{a.kev ? 'exploited in the wild' : 'not listed'}</em></span>
        <span><small>Exposure</small><b>{x.zone === 'Internet edge' ? 'Open' : x.zone === 'Physical security' ? 'Small' : 'Controlled'}</b><em>{x.zone}</em></span>
      </div>
      <p className="vw-label">SSVC decision <b>{x.ssvc}</b>: {SSVC_SUB[x.ssvc]}. {a.affected} assets across the estate run an affected version.</p>
      {x.assetKind !== 'UPS NMC' && x.neId && <p className="vw-label">Firmware campaigns go through <Link className="ent-link" to="/changes">Change management</Link>; planning one here drafts the change request.</p>}
    </Drawer>
  );
}

export function HardeningView({ v, all, q, set }: SecProps) {
  const apply = useParamPatch();
  const bl = q('bl'), search = q('q');
  const rows = v.hardening.filter(h => (!bl || h.baselineId === bl) && (!search || `${h.asset} ${h.dcId} ${h.failed.join(' ')}`.toLowerCase().includes(search.toLowerCase())));
  const checks = new Map(all.baselines.flatMap(b => b.checks.map(c => [c.id, c] as const)));
  const bname = new Map(all.baselines.map(b => [b.id, b]));
  return (
    <>
      <div className="so-bls">{all.baselines.map(b => (
        <button key={b.id} type="button" className={`so-bl${bl === b.id ? ' is-on' : ''}`} onClick={() => set({ bl: bl === b.id ? '' : b.id })}>
          <span className="so-bl-h"><Chip tone={b.standard === 'CIS Benchmark' ? 'info' : b.standard === 'DISA STIG' ? 'purple' : 'neutral'} size="xs">{b.standard}</Chip><b>{b.passPct}%</b></span>
          <b>{b.name}</b><small>{b.platform} · {fmtNum(b.assets)} assets · {b.checks.length} checks</small>
          <SoftMeter pct={b.passPct} tone={b.passPct >= 90 ? 'info' : 'warning'} />
        </button>))}</div>
      <section className="vw-card-section dcim-table">
        <DataTable rows={rows} pageSize={30} defaultSort={{ key: 's', dir: 'asc' }}
          toolbar={<ListToolbar shown={rows.length} total={v.hardening.length} noun="assets failing a check" onApply={apply} search={{ value: search, onChange: x => set({ q: x }), placeholder: 'Asset, datacenter, check id' }}
            filters={[{ id: 'bl', label: 'Baseline', quick: true, value: bl, anyLabel: 'Any baseline', onChange: x => set({ bl: x }), options: all.baselines.map(b => ({ id: b.id, label: b.name, count: v.hardening.filter(h => h.baselineId === b.id).length })) }]} />}
          cols={[
            { key: 'a', header: 'Asset', wrap: true, sort: h => h.asset, render: h => <span className="cell-2 so-wide">{h.neId && h.assetKind !== 'BMC' ? <NeLink id={h.neId}>{h.asset}</NeLink> : <span>{h.asset}</span>}<small>{h.assetKind} · {h.dcId}</small></span> },
            { key: 'b', header: 'Baseline', wrap: true, sort: h => h.baselineId, render: h => bname.get(h.baselineId)?.name },
            { key: 's', header: 'Score', sort: h => h.score, render: h => <Meter pct={h.score} width={90} label={`${h.score}%`} color={h.score >= 85 ? 'var(--primaryColor400)' : 'var(--vw-color-orange-300)'} /> },
            { key: 'f', header: 'Failed checks', wrap: true, render: h => { const worst = [...h.failed].map(id => checks.get(id)).filter(Boolean).sort((a, b) => SEVS.indexOf(a!.severity) - SEVS.indexOf(b!.severity))[0]; return <span className="cell-2"><span className="so-fails">{h.failed.map(id => { const c = checks.get(id); return <span key={id} title={`${c?.severity}: ${c?.title}`}><Chip tone={SEV_TONE[c?.severity ?? 'Low']} size="xs">{id}</Chip></span>; })}</span><small>{worst ? `${worst.severity}: ${worst.title}` : ''}{h.failed.length > 1 ? ` · +${h.failed.length - 1} more (hover a chip)` : ''}</small></span>; } },
            { key: 't', header: 'Scanned', sort: h => h.scanned, render: h => <span className="cell-2"><span>{fmtAgo(h.scanned, v.now)}</span><small>{h.passed} of {h.total} pass</small></span> }
          ]} />
      </section>
    </>
  );
}

export function DriftView({ v, q, set, go }: SecProps) {
  const apply = useParamPatch();
  const auth = q('auth'), search = q('q');
  const rows = v.drift.filter(x => (!auth || (auth === 'yes' ? x.authorised : !x.authorised)) && (!search || `${x.asset} ${x.summary} ${x.who} ${x.changeId ?? ''}`.toLowerCase().includes(search.toLowerCase())));
  const cur = q('drf') ? v.drift.find(x => x.id === q('drf')) : undefined;
  return (
    <>
      <section className="vw-card-section dcim-table">
        <DataTable rows={rows} pageSize={30} defaultSort={{ key: 'at', dir: 'desc' }} onRow={x => set({ drf: x.id })}
          toolbar={<ListToolbar shown={rows.length} total={v.drift.length} noun="config changes" onApply={apply} search={{ value: search, onChange: x => set({ q: x }), placeholder: 'Device, change, who' }}
            filters={[{ id: 'auth', label: 'Change request', quick: true, value: auth, anyLabel: 'With or without', onChange: x => set({ auth: x }), options: [{ id: 'no', label: 'No change request', count: v.drift.filter(x => !x.authorised).length }, { id: 'yes', label: 'Authorised by a change', count: v.drift.filter(x => x.authorised).length }] }]} />}
          cols={[
            { key: 'at', header: 'When', sort: x => x.at, render: x => <span className="cell-2"><span>{fmtAgo(x.at, v.now)}</span><small className="mono">{x.id}</small></span> },
            { key: 'a', header: 'Device', sort: x => x.asset, render: x => <span className="cell-2">{x.neId ? <NeLink id={x.neId}>{x.asset}</NeLink> : x.asset}<small>{x.dcId}</small></span> },
            { key: 's', header: 'What changed', wrap: true, render: x => <span className="cell-2"><span>{x.summary}</span><small>{fmtNum(x.lines)} line{x.lines === 1 ? '' : 's'} · by {x.who}</small></span> },
            { key: 'c', header: 'Change request', render: x => x.authorised ? <Link className="ent-link mono" to={`/changes/${x.changeId}`} onClick={e => e.stopPropagation()}>{x.changeId}</Link> : <span className="so-bad">None</span> },
            { key: 'd', header: 'Detection', render: x => x.detectionId ? <button type="button" className="ent-link mono" onClick={e => { e.stopPropagation(); go('detections', { det: x.detectionId! }); }}>{x.detectionId}</button> : <span className="vw-label">—</span> }
          ]} />
      </section>
      {cur && <Drawer open onClose={() => set({ drf: '' })} width={640} title={`${cur.asset}: ${cur.summary}`} sub={<><span className="mono">{cur.id}</span> · {fmtDateTime(cur.at)} · by {cur.who}</>}>
        <KV cols={3} items={[['Datacenter', <DcLink id={cur.dcId} />], ['Change request', cur.authorised ? <Link className="ent-link mono" to={`/changes/${cur.changeId}`}>{cur.changeId}</Link> : <span className="so-bad">None</span>], ['Lines changed', fmtNum(cur.lines)]]} />
        <b className="dcim-sub-h">Running config against the last approved backup</b>
        {cur.diff.length ? <pre className="cp-code so-diff">{cur.diff.map((l, i) => <span key={i} className={l.startsWith('+') ? 'is-add' : l.startsWith('-') ? 'is-del' : ''}>{l}{'\n'}</span>)}</pre>
          : <p className="vw-label">{fmtNum(cur.lines)} lines changed under {cur.changeId}; the diff matches the change's implementation plan.</p>}
        {!cur.authorised && <p className="vw-label">No approved change request covered the device; the drift raised {cur.detectionId ? <button type="button" className="ent-link mono" onClick={() => go('detections', { det: cur.detectionId! })}>{cur.detectionId}</button> : 'a detection'} (SR-002).</p>}
      </Drawer>}
    </>
  );
}
