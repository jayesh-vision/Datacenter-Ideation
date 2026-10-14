/* Device type page (/dcim/types/:id): what the model is (height, airflow, supplies, port template, module bays), the module
   types that fit it, the component list of one installed unit and every device of this type in the estate. */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { getDcimType, useQuery } from '../../api';
import type { DcimDevice } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, KV, Panel } from '../../ui/kit';
import { useToast } from '../ops/shared';
import { TemplatesModal } from './ops';
import { DataTable } from '../../ui/DataTable';
import { SummaryStrip } from '../site/SummaryStrip';
import { fmtBw, fmtNum } from '../../lib/format';
import { NotFound } from '../NotFound';
import { CAT_COLOR, CAT_LABEL, DcimStatusChip } from './common';
import { DeviceDrawer } from './lists';
import '../../styles/dcim.css';

export function TypePage() {
  const { id = '' } = useParams();
  const { data, loading } = useQuery(() => getDcimType(id), [id]);
  const [dev, setDev] = useState<string | null>(null);
  const [tpl, setTpl] = useState(false);
  const toast = useToast();
  usePage([{ label: 'Plan & Build' }, { label: 'DCIM', to: '/dcim' }, { label: 'Device types', to: '/dcim?tab=types' }, { label: data ? data.type.model : id }]);
  if (loading && !data) return <Loading />;
  if (!data) return <NotFound what="Device type" />;
  const t = data.type;
  const sites = [...new Set(data.devices.map(d => d.dcId))];
  const st = (s: string) => data.devices.filter(d => d.status === s).length;
  const ifs = data.sample.filter(c => c.kind === 'Interface');
  return (
    <div className="page dcim">
      <PageHead title={`${t.manufacturer} ${t.model}`} sub={t.description}
        chips={<><Chip tone="neutral"><i className="dcim-dot" style={{ background: CAT_COLOR[t.category] }} /> {t.role}</Chip><Chip tone="neutral">{t.uHeight}U</Chip>{t.custom && <Chip tone="info">Added to the catalogue</Chip>}</>}
        actions={t.custom ? <Btn variant="filled" icon={I.Pencil} onClick={() => setTpl(true)}>Edit templates</Btn> : undefined} />
      <SummaryStrip items={[
        { key: 'n', label: 'In use', value: fmtNum(t.devices), sub: `${sites.length} site${sites.length === 1 ? '' : 's'}`, info: 'Devices of this type placed in racks across the estate.' },
        { key: 's', label: 'Status', value: st('Active'), sub: `active · ${st('Planned')} planned · ${st('Maintenance') + st('Decommissioning')} other`, info: 'Installed devices of this type by lifecycle state.' },
        { key: 'p', label: 'Ports', value: t.ports.reduce((a, p) => a + p.count, 0), sub: t.ports.map(p => `${p.count}× ${p.type}`).join(' · ') || 'none', info: 'The port template: every unit is built with these front-panel ports.' },
        { key: 'w', label: 'Power', value: `${t.psus} supplies`, sub: t.typicalW ? `${fmtNum(t.typicalW)} W typical draw` : 'no reading yet', info: 'Power supplies per unit (odd ones go to PDU-A, even ones to PDU-B) and the average measured draw of installed units.' },
        { key: 'm', label: 'Physical', value: `${t.uHeight}U`, sub: `${t.fullDepth ? 'full depth' : 'half depth'} · ${t.airflow.toLowerCase()} · ${t.weightKg} kg`, info: 'Height in rack units, depth, airflow direction and approximate weight.' }
      ]} />
      <div className="dcim-type-grid">
        <Panel title="Type" icon={I.Info}>
          <KV cols={2} items={[['Manufacturer', t.manufacturer], ['Model', t.model], ['Role', t.role], ['Category', CAT_LABEL[t.category]], ['Platform', t.platform], ['Height', `${t.uHeight}U`],
            ['Airflow', t.airflow], ['Weight', `${t.weightKg} kg`], ['Management ports', t.mgmtPorts], ['Console ports', t.consolePorts], ['Module bays', t.moduleBays], ['Power supplies', t.psus]]} />
        </Panel>
        <Panel title="Component templates" icon={I.EthernetPort} actions={t.custom ? <Btn size="sm" icon={I.Pencil} onClick={() => setTpl(true)}>Edit</Btn> : <span className="vw-label">from the installed units</span>} count={ifs.length || t.ports.reduce((a, p) => a + p.count, 0)} info="The interfaces of one installed unit (names as reported by the device) grouped in the type's template.">
          {t.ports.length ? <table className="nst-table dt-table dcim-comp"><thead><tr><th>Port type</th><th>Speed</th><th>Count</th><th>Names</th></tr></thead><tbody>{t.ports.map(p => {
            const names = ifs.filter(c => c.type === p.type).map(c => c.name);
            return <tr key={p.type}><td>{p.type}</td><td>{fmtBw(p.speedMbps)}</td><td>{p.count}</td><td className="mono">{names.length ? `${names[0]} … ${names[names.length - 1]}` : '—'}</td></tr>;
          })}</tbody></table> : <p className="vw-label">No front-panel ports (opaque equipment).</p>}
          <div className="dcim-tpl-sum">
            <span><I.Plug size={14} /><b>{t.psus}</b>power port{t.psus === 1 ? '' : 's'}<small>{t.psus ? 'odd → PDU-A, even → PDU-B' : '—'}</small></span>
            <span><I.Terminal size={14} /><b>{t.consolePorts}</b>console<small>{t.consolePorts ? 'RJ45, out of band' : 'none'}</small></span>
            <span><I.Network size={14} /><b>{t.mgmtPorts}</b>management<small>{t.mgmtPorts ? '1G copper' : 'none'}</small></span>
            <span><I.Cpu size={14} /><b>{t.moduleBays}</b>module bay{t.moduleBays === 1 ? '' : 's'}<small>{t.moduleBays ? 'line cards, drives, engines' : 'fixed configuration'}</small></span>
          </div>
          {data.modules.length > 0 && <><b className="dcim-sub-h">Modules that fit</b><div className="row wrap" style={{ gap: 6 }}>{data.modules.map(m => <Chip key={m.id} tone={m.faulty ? 'warning' : 'neutral'}>{m.name}{m.name.toLowerCase() === m.kind.toLowerCase() ? '' : ` · ${m.kind}`}{m.faulty ? ` · ${m.faulty} faulty` : ''}</Chip>)}</div></>}
        </Panel>
      </div>
      <section className="vw-card-section dcim-table">
        <div className="dcim-sub-bar"><b>Devices of this type</b><span className="vw-label">{fmtNum(data.devices.length)} · click for ports and power</span></div>
        <DataTable rows={data.devices} pageSize={20} defaultSort={{ key: 'loc', dir: 'asc' }} onRow={(d: DcimDevice) => setDev(d.id)} cols={[
          { key: 'n', header: 'Device', sort: d => d.name, render: d => <span className="mono">{d.name}</span> },
          { key: 'loc', header: 'Location', sort: d => `${d.dcId}${d.rackName}${d.u}`, render: d => <span className="cell-2"><span><Link className="ent-link" to={`/dcim/racks/${encodeURIComponent(d.rackId)}`} onClick={e => e.stopPropagation()}>{d.rackName}</Link> · U{d.u}</span><small>{d.dcId} · {d.hallName}</small></span> },
          { key: 'sn', header: 'Serial', sort: d => d.serial, render: d => <span className="mono">{d.serial || '—'}</span> },
          { key: 'pw', header: 'Draw', sort: d => d.powerW, render: d => (d.powerW ? `${fmtNum(d.powerW)} W` : '—') },
          { key: 'st', header: 'Status', sort: d => d.status, render: d => <DcimStatusChip s={d.status} /> }]}
          empty={<p className="vw-label" style={{ padding: 16 }}>No devices of this type yet. Plan one from DCIM → Install device.</p>} />
      </section>
      <DeviceDrawer id={dev} onClose={() => setDev(null)} />
      <TemplatesModal type={tpl ? t : null} onClose={() => setTpl(false)} onDone={x => { setTpl(false); toast.show(x, 'New devices installed from this type get these components.'); }} />
      {toast.node}
    </div>
  );
}
