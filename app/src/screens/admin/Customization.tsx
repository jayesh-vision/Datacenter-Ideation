/* Customization (Admin, 13-Oct-2026: P2B merge phase 7, minimal redesign): custom fields on records and tags (rules over the estate). */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { addCustomField, addTag, getCustomization, useQuery } from '../../api';
import type { CustomField, TagDef } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Field, Modal, Tabs } from '../../ui/kit';
import '../../styles/compliance.css';
import { DataTable } from '../../ui/DataTable';
import { ListToolbar, useParamPatch } from '../../ui/ListToolbar';
import { SummaryStrip } from '../site/SummaryStrip';
import { Meter } from '../../ui/status';
import { fmtNum } from '../../lib/format';
import { useToast } from '../ops/shared';
import '../../styles/dcim.css';

/* calm palette (15-Oct-2026, user: "too bright"): tags are neutral pills; their colour is only a small muted dot */
const TAG_DOT: Record<TagDef['color'], string> = { blue: 'var(--vw-color-blue-400)', purple: 'var(--vw-color-slate-400)', cyan: 'var(--vw-color-blue-300)', amber: 'var(--vw-color-amber-400)', red: 'var(--vw-color-red-400)', slate: 'var(--vw-color-slate-300)', emerald: 'var(--vw-color-slate-500)' };
const TagPill = ({ t }: { t: TagDef }) => <span className="cust-tag"><i style={{ background: TAG_DOT[t.color] }} />{t.name}</span>;

export function Customization() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as 'fields' | 'tags') || 'fields';
  usePage([{ label: 'Admin' }, { label: 'Customization' }]);
  const { data } = useQuery(getCustomization, []);
  const [add, setAdd] = useState(false);
  const q = sp.get('q') ?? '', on = sp.get('on') ?? '';
  const setP = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const apply = useParamPatch();
  if (!data) return <Loading />;
  const has = (x: string) => !q || x.toLowerCase().includes(q.toLowerCase());
  const fields = data.fields.filter(f => (!on || f.appliesTo.includes(on)) && has(`${f.label} ${f.key} ${f.description}`));
  const tags = data.tags.filter(t => (!on || t.appliesTo === on) && has(`${t.name} ${t.rule} ${t.description}`));
  const ons = tab === 'fields' ? [...new Set(data.fields.flatMap(f => f.appliesTo))] : [...new Set(data.tags.map(t => t.appliesTo))];
  const filled = data.fields.reduce((a, f) => a + f.filled, 0), total = data.fields.reduce((a, f) => a + f.total, 0);
  const toolbar = (shown: number, all: number, noun: string) => <ListToolbar shown={shown} total={all} noun={noun} onApply={apply}
    search={{ value: q, onChange: v => setP('q', v), placeholder: tab === 'fields' ? 'Field, key, description' : 'Tag, rule, description' }}
    filters={[{ id: 'on', label: 'Applies to', quick: true, value: on, anyLabel: 'Any record', onChange: v => setP('on', v), options: ons.map(x => ({ id: x, label: x, count: tab === 'fields' ? data.fields.filter(f => f.appliesTo.includes(x)).length : data.tags.filter(t => t.appliesTo === x).length })) }]} />;
  return (
    <div className="page dcim">
      <PageHead title="Customization" sub="Fields your teams add to records, and tags that group records by a rule" actions={<Btn variant="filled" icon={I.Plus} onClick={() => setAdd(true)}>{tab === 'fields' ? 'New field' : 'New tag'}</Btn>} />
      <SummaryStrip items={[
        { key: 'f', label: 'Custom fields', value: data.fields.length, sub: `${data.fields.filter(f => f.custom).length} added here`, onClick: () => setSp({}, { replace: true }), active: tab === 'fields', info: 'Fields your teams add to records (devices, racks, sites…), on top of the built-in data model.' },
        { key: 'r', label: 'Required', value: data.fields.filter(f => f.required).length, sub: 'must be filled', info: 'Custom fields every record of their kind must carry.' },
        { key: 'p', label: 'Filled', value: total ? `${Math.round((filled / total) * 100)}%` : '—', sub: `${fmtNum(filled)} of ${fmtNum(total)} values`, info: 'Values present across all custom fields, against the records they apply to.' },
        { key: 't', label: 'Tags', value: data.tags.length, sub: 'rules over the estate', onClick: () => setSp({ tab: 'tags' }, { replace: true }), active: tab === 'tags', info: 'Tags group records by a rule (or by hand); the count is re-evaluated on every data change.' },
        { key: 'n', label: 'Tagged records', value: fmtNum(data.tags.reduce((a, t) => a + t.count, 0)), sub: 'across all tags', info: 'Records carrying at least one tag, counted once per tag.' }
      ]} />
      <Tabs value={tab} onChange={v => setSp(v === 'fields' ? {} : { tab: v }, { replace: true })} tabs={[{ id: 'fields', label: 'Custom fields', count: data.fields.length }, { id: 'tags', label: 'Tags', count: data.tags.length }]} />
      {tab === 'fields' ? <section className="vw-card-section dcim-table"><DataTable rows={fields.map(f => ({ ...f, id: f.key }))} pageSize={30} toolbar={toolbar(fields.length, data.fields.length, 'fields')} cols={[
        { key: 'l', header: 'Field', wrap: true, render: (f: CustomField) => <span className="cell-2"><span className="vw-card-activity-label">{f.label}{f.custom && <Chip tone="neutral" size="xs">Added here</Chip>}</span><small className="mono">{f.key}</small></span> },
        { key: 't', header: 'Type', render: f => `${f.type}${f.choices ? ` · ${f.choices.length} choices` : ''}` },
        { key: 'a', header: 'On', render: f => f.appliesTo.join(', ') },
        { key: 'r', header: 'Required', render: f => (f.required ? 'Yes' : 'No') },
        { key: 'f', header: 'Filled', render: f => f.total ? <Meter pct={(f.filled / f.total) * 100} width={56} color="var(--primaryColor400, var(--vw-color-blue-400))" label={`${fmtNum(f.filled)} / ${fmtNum(f.total)}`} /> : <span className="vw-label">no records yet</span> },
        { key: 'd', header: 'Description', wrap: true, render: f => <span className="vw-label">{f.description}</span> }]} /></section>
        : <section className="vw-card-section dcim-table"><DataTable rows={tags.map(t => ({ ...t, id: t.slug }))} pageSize={30} toolbar={toolbar(tags.length, data.tags.length, 'tags')} cols={[
        { key: 'n', header: 'Tag', render: (t: TagDef) => <TagPill t={t} /> },
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
