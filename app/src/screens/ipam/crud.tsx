/* IP & Network CRUD (15-Oct-2026, user: "create for IP Address, VRFs, VLANs … check the P2B forms and field level details").
   One form per record kind, fields after P2B's IPAM pages (IP address, VRF, VLAN, IP range, ASN, FHRP group, aggregate, application
   service; prefixes are edited here, created with New prefix). The mock server validates against the plan and says why it refuses. */
import { useMemo, useState, type ReactNode } from 'react';
import * as I from 'lucide-react';
import { deleteIpamRecord, saveIpamRecord } from '../../api';
import type { IpamView } from '../../api/types';
import { Btn, Field, Modal } from '../../ui/kit';

export type IpamKind = 'address' | 'prefix' | 'vrf' | 'vlan' | 'range' | 'asn' | 'fhrp' | 'aggregate' | 'service';
export const KIND_LABEL: Record<IpamKind, string> = { address: 'IP address', prefix: 'prefix', vrf: 'VRF', vlan: 'VLAN', range: 'IP range', asn: 'ASN', fhrp: 'FHRP gateway group', aggregate: 'aggregate', service: 'application service' };
type Opt = { id: string; label: string };
type F = { k: string; label: string; type?: 'text' | 'number' | 'select' | 'switch' | 'textarea' | 'checks'; options?: Opt[]; required?: boolean; hint?: string; placeholder?: string; full?: boolean; create?: boolean };
type Rec = Record<string, unknown>;

/* the form of each kind; `create: true` = only asked when creating (the key of the record) */
function fieldsOf(kind: IpamKind, m: IpamView, v: Rec, sites: Opt[]): F[] {
  const leaf = m.prefixes.filter(p => p.status !== 'Container');
  const pfxOpts = (dc?: string) => leaf.filter(p => !dc || p.dcId === dc).slice(0, 800).map(p => ({ id: p.id, label: `${p.prefix} · ${p.vrf} · ${p.description}` }));
  const dc = String(v.dcId ?? '');
  switch (kind) {
    case 'address': {
      const p = m.prefixes.find(x => x.id === v.prefixId);
      const devs = [...new Map(m.addresses.filter(a => a.deviceId && (!p?.dcId || a.dcId === p.dcId)).map(a => [a.deviceId!, a.deviceName ?? a.deviceId!])).entries()].sort((a, b) => a[1].localeCompare(b[1])).slice(0, 600);
      return [
        { k: 'prefixId', label: 'Prefix', type: 'select', required: true, create: true, options: pfxOpts(), full: true },
        { k: 'address', label: 'Address', required: true, create: true, placeholder: p ? p.prefix.replace(/\.\d+\/\d+$/, '.20') : '10.20.30.40', hint: p ? `Inside ${p.prefix}` : undefined },
        { k: 'status', label: 'Status', type: 'select', options: [{ id: 'Active', label: 'Active' }, { id: 'Reserved', label: 'Reserved' }] },
        { k: 'deviceId', label: 'Assigned device', type: 'select', create: true, options: [{ id: '', label: 'Not assigned' }, ...devs.map(([id, n]) => ({ id, label: n }))], hint: 'Devices at the prefix’s site' },
        { k: 'iface', label: 'Interface', create: true, placeholder: 'e.g. eth0, mgmt0, xe-0/0/1' },
        { k: 'dns', label: 'DNS name', placeholder: 'host.dc.internal' },
        { k: 'mac', label: 'MAC address', placeholder: '00:1a:2b:3c:4d:5e' },
        { k: 'note', label: 'Description', type: 'textarea', full: true }
      ];
    }
    case 'prefix': return [
      { k: 'description', label: 'Description', required: true, full: true },
      { k: 'role', label: 'Role', type: 'select', options: ['Management', 'Loopback', 'Point-to-point', 'Production', 'Storage', 'Backbone', 'Public', 'Customer'].map(x => ({ id: x, label: x })) },
      ...(v.status === 'Container' ? [] : [{ k: 'status', label: 'Status', type: 'select' as const, options: [{ id: 'Active', label: 'Active' }, { id: 'Reserved', label: 'Reserved' }] }]),
      { k: 'vlan', label: 'VLAN id', type: 'number', placeholder: 'optional' }
    ];
    case 'vrf': return [
      { k: 'name', label: 'Name', required: true, create: true, placeholder: 'VRF-PROD' },
      { k: 'rd', label: 'Route distinguisher', required: true, placeholder: '64500:120' },
      { k: 'scope', label: 'Scope', type: 'select', options: ['Site', 'Estate', 'Customer'].map(x => ({ id: x, label: x })) },
      ...(v.scope === 'Site' ? [{ k: 'dcId', label: 'Datacenter', type: 'select' as const, required: true, options: sites }] : []),
      { k: 'importRt', label: 'Import targets', placeholder: '64500:120, 64500:999', hint: 'Comma-separated; blank = the RD' },
      { k: 'exportRt', label: 'Export targets', placeholder: '64500:120', hint: 'Comma-separated; blank = the RD' },
      { k: 'enforceUnique', label: 'Enforce unique address space', type: 'switch', full: true },
      { k: 'description', label: 'Description', type: 'textarea', full: true }
    ];
    case 'vlan': return [
      { k: 'dcId', label: 'Datacenter', type: 'select', required: true, create: true, options: sites },
      { k: 'vid', label: 'VLAN id', type: 'number', required: true, create: true, placeholder: '1–4094', hint: dc ? `Taken at ${dc}: ${m.vlans.filter(x => x.dcId === dc).length}` : undefined },
      { k: 'name', label: 'Name', required: true, placeholder: 'VLAN_PROD_01' },
      { k: 'group', label: 'VLAN group', type: 'select', create: true, options: ['Management', 'Fabric', 'Storage', 'Services'].map(x => ({ id: x, label: x })) },
      { k: 'role', label: 'Role', placeholder: 'e.g. Production hosts, hall B' },
      { k: 'status', label: 'Status', type: 'select', options: ['Active', 'Reserved', 'Unused'].map(x => ({ id: x, label: x })) },
      { k: 'prefix', label: 'Prefix on it', placeholder: 'e.g. 10.4.32.0/22', hint: 'Optional' }
    ];
    case 'range': return [
      { k: 'prefixId', label: 'Prefix', type: 'select', required: true, options: pfxOpts(), full: true },
      { k: 'start', label: 'Start address', required: true, placeholder: '10.0.0.10' },
      { k: 'end', label: 'End address', required: true, placeholder: '10.0.0.100' },
      { k: 'purpose', label: 'Purpose', type: 'textarea', full: true, placeholder: 'e.g. PXE / DHCP pool for GPU hall B' }
    ];
    case 'asn': return [
      { k: 'asn', label: 'ASN', type: 'number', required: true, create: true, placeholder: '65123', hint: 'Private: 64512–65534 or 4,200,000,000–4,294,967,294' },
      { k: 'dcId', label: 'Datacenter', type: 'select', options: [{ id: '', label: 'Estate-wide' }, ...sites] },
      { k: 'description', label: 'Description', type: 'textarea', full: true }
    ];
    case 'fhrp': {
      const p = m.prefixes.find(x => x.id === v.prefixId);
      const routers = [...new Map(m.addresses.filter(a => a.deviceId && p?.dcId && a.dcId === p.dcId && (a.use === 'Management' || a.use === 'Loopback')).map(a => [a.deviceId!, a.deviceName ?? a.deviceId!])).entries()]
        .filter(([, n]) => /LEAF|SPINE|TOR|AGG|BDR|PE|CORE|SW|FW|ETH/i.test(n)).sort((a, b) => a[1].localeCompare(b[1])).slice(0, 80);
      return [
        { k: 'prefixId', label: 'Host prefix', type: 'select', required: true, create: true, options: pfxOpts().filter(o => /Production|Storage|Management/i.test(m.prefixes.find(x => x.id === o.id)?.role ?? '') || true), full: true },
        { k: 'protocol', label: 'Protocol', type: 'select', options: [{ id: 'VRRP', label: 'VRRP' }, { id: 'HSRP', label: 'HSRP' }] },
        { k: 'group', label: 'Group id', type: 'number', required: true, placeholder: '1–255' },
        { k: 'vip', label: 'Virtual IP', required: true, create: true, placeholder: p ? p.prefix.replace(/\.\d+\/\d+$/, '.1') : '10.0.0.1' },
        { k: 'members', label: `Routers in the group (${routers.length})`, type: 'checks', required: true, full: true, options: routers.map(([id, n]) => ({ id, label: n })), hint: p ? undefined : 'Pick the prefix first' }
      ];
    }
    case 'aggregate': return [
      { k: 'prefix', label: 'Aggregate (CIDR)', required: true, create: true, placeholder: '198.18.0.0/15' },
      { k: 'rir', label: 'Registry (RIR)', type: 'select', required: true, options: m.registers.rirs.map(r => ({ id: r.id, label: r.name })) },
      { k: 'description', label: 'Description', type: 'textarea', full: true }
    ];
    case 'service': return [
      { k: 'name', label: 'Name', required: true, placeholder: 'HTTPS' },
      { k: 'protocol', label: 'Protocol', type: 'select', options: [{ id: 'TCP', label: 'TCP' }, { id: 'UDP', label: 'UDP' }] },
      { k: 'ports', label: 'Ports', required: true, placeholder: '443, 8443', hint: 'Comma-separated' },
      { k: 'addressId', label: 'On address', type: 'select', required: true, create: true, full: true, options: m.addresses.filter(a => a.deviceId).slice(0, 800).map(a => ({ id: a.id, label: `${a.address} · ${a.deviceName}${a.iface ? ` ${a.iface}` : ''}` })) }
    ];
  }
}

const DEFAULTS: Partial<Record<IpamKind, Rec>> = { address: { status: 'Reserved' }, vrf: { scope: 'Estate', enforceUnique: true }, vlan: { group: 'Services', status: 'Active' }, fhrp: { protocol: 'VRRP', members: [] }, service: { protocol: 'TCP' } };
/* a record → its form values */
const toForm = (kind: IpamKind, r: Rec): Rec => kind === 'vrf' ? { ...r, importRt: (r.importRt as string[] ?? []).join(', '), exportRt: (r.exportRt as string[] ?? []).join(', ') }
  : kind === 'service' ? { ...r, ports: (r.ports as number[] ?? []).join(', ') } : r;

export function useIpamCrud(m: IpamView | null | undefined, sites: Opt[], dcId: string, toast: (t: string, b?: string) => void) {
  const [form, setForm] = useState<{ kind: IpamKind; id?: string; v: Rec } | null>(null);
  const [del, setDel] = useState<{ kind: IpamKind; id: string; label: string } | null>(null);
  const [err, setErr] = useState('');
  const open = (kind: IpamKind, rec?: Rec & { id?: string }) => { setErr(''); setForm({ kind, id: rec?.id as string | undefined, v: rec ? toForm(kind, rec) : { ...DEFAULTS[kind], ...(dcId ? { dcId } : {}) } }); };
  const remove = (kind: IpamKind, id: string, label: string) => { setErr(''); setDel({ kind, id, label }); };
  const fields = useMemo(() => (form && m ? fieldsOf(form.kind, m, form.v, sites).filter(f => !form.id || !f.create) : []), [form, m, sites]);
  const set = (k: string, val: unknown) => setForm(f => (f ? { ...f, v: { ...f.v, [k]: val } } : f));
  const missing = fields.some(f => f.required && (f.type === 'checks' ? !(form?.v[f.k] as string[] | undefined)?.length : !String(form?.v[f.k] ?? '').trim()));
  const save = () => form && saveIpamRecord(form.kind, form.v, form.id).then(() => { toast(`${KIND_LABEL[form.kind][0].toUpperCase()}${KIND_LABEL[form.kind].slice(1)} ${form.id ? 'updated' : 'created'}`, form.id ? undefined : 'It counts in the plan, the usage roll-ups and the findings right away.'); setForm(null); }).catch(e => setErr(String(e?.message ?? e)));
  const input = (f: F): ReactNode => {
    const val = form!.v[f.k];
    if (f.type === 'select') return <select className="select" value={String(val ?? '')} onChange={e => set(f.k, e.target.value)}>{!f.required || !val ? <option value="">{f.required ? 'Pick…' : '—'}</option> : null}{(f.options ?? []).filter(o => o.id !== '' || !f.required).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>;
    if (f.type === 'switch') return <label className="ipam-check"><input type="checkbox" checked={!!val} onChange={e => set(f.k, e.target.checked)} /><span>{val ? 'Yes' : 'No'}</span></label>;
    if (f.type === 'textarea') return <textarea className="input" rows={2} value={String(val ?? '')} onChange={e => set(f.k, e.target.value)} placeholder={f.placeholder} />;
    if (f.type === 'checks') { const cur = (val as string[]) ?? []; return <div className="dcim-fits">{(f.options ?? []).map(o => <label key={o.id} className={cur.includes(o.id) ? 'is-on' : ''}><input type="checkbox" checked={cur.includes(o.id)} onChange={e => set(f.k, e.target.checked ? [...cur, o.id] : cur.filter(x => x !== o.id))} />{o.label}</label>)}{!f.options?.length && <span className="vw-label">No router or switch at this prefix’s site.</span>}</div>; }
    return <input className={`input${/address|prefix|rd|Rt|vip|start|end|mac|asn/i.test(f.k) ? ' mono' : ''}`} type={f.type === 'number' ? 'number' : 'text'} value={String(val ?? '')} onChange={e => set(f.k, e.target.value)} placeholder={f.placeholder} />;
  };
  const node = <>
    {form && <Modal open onClose={() => setForm(null)} width={620} title={`${form.id ? 'Edit' : 'New'} ${KIND_LABEL[form.kind]}`} sub={form.id ? <span className="mono">{String(form.v.address ?? form.v.prefix ?? form.v.name ?? (form.v.vid != null ? `VLAN ${form.v.vid}` : form.v.asn != null ? `AS${form.v.asn}` : form.id))}</span> : 'Checked against the address plan before it is saved'}
      foot={<><Btn onClick={() => setForm(null)}>Cancel</Btn><Btn variant="filled" icon={form.id ? I.Save : I.Plus} disabled={missing} onClick={save}>{form.id ? 'Save' : `Create ${KIND_LABEL[form.kind]}`}</Btn></>}>
      <div className="dcim-form" data-ipam-form={form.kind}>
        {fields.map(f => <Field key={f.k} label={f.label} required={f.required} hint={f.hint} style={f.full ? { gridColumn: '1 / -1' } : undefined}>{input(f)}</Field>)}
        {err && <p className="dcim-err">{err}</p>}
      </div>
    </Modal>}
    {del && <Modal open onClose={() => setDel(null)} title={`Delete ${KIND_LABEL[del.kind]}?`} sub={<span className="mono">{del.label}</span>}
      foot={<><Btn onClick={() => setDel(null)}>Cancel</Btn><Btn variant="filled" icon={I.Trash2} onClick={() => deleteIpamRecord(del.kind, del.id).then(r => { toast(`${r} deleted`); setDel(null); }).catch(e => setErr(String(e?.message ?? e)))}>Delete</Btn></>}>
      <p style={{ margin: 0 }}>It leaves the address plan. Records that still use it block the delete, and the reason is shown here.</p>
      {err && <p className="dcim-err" style={{ marginTop: 10 }}>{err}</p>}
    </Modal>}
  </>;
  return { open, remove, node };
}

/* edit / delete icons for a grid row */
export function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return <span className="dcim-acts" onClick={e => e.stopPropagation()}><button type="button" title="Edit" onClick={onEdit}><I.Pencil size={14} /></button><button type="button" title="Delete" onClick={onDelete}><I.Trash2 size={14} /></button></span>;
}
