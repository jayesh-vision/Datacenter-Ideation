/* Customization (Admin, 13-Oct-2026: P2B merge phase 7, minimal redesign): custom fields on records and tags (rules over the estate). */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { addCustomField, addTag, getCustomization, useQuery } from '../../api';
import type { CustomField, TagDef } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Field, Modal, Tabs } from '../../ui/kit';
import { DataTable } from '../../ui/DataTable';
import { Meter } from '../../ui/status';
import { fmtNum } from '../../lib/format';
import { useToast } from '../ops/shared';
import '../../styles/dcim.css';

const TAG_TONE: Record<TagDef['color'], 'info' | 'purple' | 'cyan' | 'warning' | 'error' | 'neutral' | 'success'> = { blue: 'info', purple: 'purple', cyan: 'cyan', amber: 'warning', red: 'error', slate: 'neutral', emerald: 'success' };

export function Customization() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as 'fields' | 'tags') || 'fields';
  usePage([{ label: 'Admin' }, { label: 'Customization' }]);
  const { data } = useQuery(getCustomization, []);
  const [add, setAdd] = useState(false);
  if (!data) return <Loading />;
  return (
    <div className="page dcim">
      <PageHead title="Customization" sub="Fields your teams add to records, and tags that group records by a rule" actions={<Btn variant="filled" icon={I.Plus} onClick={() => setAdd(true)}>{tab === 'fields' ? 'New field' : 'New tag'}</Btn>} />
      <Tabs value={tab} onChange={v => setSp(v === 'fields' ? {} : { tab: v }, { replace: true })} tabs={[{ id: 'fields', label: 'Custom fields', count: data.fields.length }, { id: 'tags', label: 'Tags', count: data.tags.length }]} />
      {tab === 'fields' ? <section className="vw-card-section dcim-table"><DataTable rows={data.fields.map(f => ({ ...f, id: f.key }))} pageSize={30} cols={[
        { key: 'l', header: 'Field', wrap: true, render: (f: CustomField) => <span className="cell-2"><b>{f.label}{f.custom && <Chip tone="info" size="xs">New</Chip>}</b><small className="mono">{f.key}</small></span> },
        { key: 't', header: 'Type', render: f => `${f.type}${f.choices ? ` · ${f.choices.length} choices` : ''}` },
        { key: 'a', header: 'On', render: f => f.appliesTo.join(', ') },
        { key: 'r', header: 'Required', render: f => (f.required ? 'Yes' : 'No') },
        { key: 'f', header: 'Filled', render: f => f.total ? <Meter pct={(f.filled / f.total) * 100} width={56} label={`${fmtNum(f.filled)} / ${fmtNum(f.total)}`} /> : <span className="vw-label">no records yet</span> },
        { key: 'd', header: 'Description', wrap: true, render: f => <span className="vw-label">{f.description}</span> }]} /></section>
        : <section className="vw-card-section dcim-table"><DataTable rows={data.tags.map(t => ({ ...t, id: t.slug }))} pageSize={30} cols={[
        { key: 'n', header: 'Tag', render: (t: TagDef) => <Chip tone={TAG_TONE[t.color]}>{t.name}</Chip> },
        { key: 'a', header: 'On', render: t => t.appliesTo },
        { key: 'r', header: 'Rule', wrap: true, render: t => <span className="mono dcim-via">{t.rule}</span> },
        { key: 'c', header: 'Records', sort: t => t.count, render: t => fmtNum(t.count) },
        { key: 'd', header: 'Description', wrap: true, render: t => <span className="vw-label">{t.description}</span> }]} /></section>}
      {add && <AddModal kind={tab} onClose={() => setAdd(false)} />}
    </div>
  );
}

function AddModal({ kind, onClose }: { kind: 'fields' | 'tags'; onClose: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState(''); const [type, setType] = useState<CustomField['type']>('Text'); const [on, setOn] = useState('Devices'); const [desc, setDesc] = useState(''); const [rule, setRule] = useState('');
  const [err, setErr] = useState('');
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, kind === 'fields' ? '_' : '-').replace(/^[-_]|[-_]$/g, '');
  const save = () => (kind === 'fields' ? addCustomField({ key: slug, label, type, appliesTo: [on], required: false, description: desc || 'Added on the Customization screen.' })
    : addTag({ slug, name: label, color: 'blue', description: desc || 'Added on the Customization screen.', rule: rule || 'applied by hand', appliesTo: on })).then(() => { toast.show(`${label} added`); onClose(); }).catch(e => setErr(String(e.message ?? e)));
  return (
    <Modal open onClose={onClose} title={kind === 'fields' ? 'New custom field' : 'New tag'} foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" disabled={!label.trim()} onClick={save}>Add</Btn></>}>
      <div className="dcim-form">
        <Field label="Name" required><input className="input" value={label} onChange={e => setLabel(e.target.value)} /></Field>
        <Field label="Applies to"><select className="select" value={on} onChange={e => setOn(e.target.value)}>{['Devices', 'Racks', 'Halls', 'Sites', 'Prefixes', 'Changes'].map(x => <option key={x}>{x}</option>)}</select></Field>
        {kind === 'fields' ? <Field label="Type"><select className="select" value={type} onChange={e => setType(e.target.value as CustomField['type'])}>{['Text', 'Number', 'Date', 'Select', 'Boolean'].map(x => <option key={x}>{x}</option>)}</select></Field>
          : <Field label="Rule"><input className="input" value={rule} onChange={e => setRule(e.target.value)} placeholder="e.g. rack.density = AI" /></Field>}
        <Field label="Description" style={{ gridColumn: '1 / -1' }}><input className="input" value={desc} onChange={e => setDesc(e.target.value)} /></Field>
        {err && <p className="dcim-err">{err}</p>}
      </div>
      {toast.node}
    </Modal>
  );
}
