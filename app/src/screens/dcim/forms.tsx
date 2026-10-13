/* DCIM forms: new rack in a hall, install (plan) a device into free rack units, add a device type to the catalogue.
   Everything is validated against the estate (names unique, U range free and inside the rack); a planned device holds its
   rack units in the twin and the rack until it is installed and discovered. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDeviceType, createRack, getDcim, getDcimFreeSlots, getDcimTypes, installDevice, useQuery } from '../../api';
import type { NeRole } from '../../api/types';
import { Btn, Field, Modal } from '../../ui/kit';
import { useToast } from '../ops/shared';

const ROLES = ['Access', 'Network', 'Compute', 'Storage', 'GPU', 'Core', 'ODF / patching', 'Tenant cabinet'];

export function NewRackModal({ open, onClose, dcId, hallId }: { open: boolean; onClose: () => void; dcId?: string; hallId?: string }) {
  const nav = useNavigate();
  const toast = useToast();
  const { data } = useQuery(() => getDcim(), []);
  const [dc, setDc] = useState(dcId ?? '');
  const [hall, setHall] = useState(hallId ?? '');
  const [name, setName] = useState('');
  const [h, setH] = useState(42);
  const [kw, setKw] = useState(8);
  const [role, setRole] = useState('Access');
  const [err, setErr] = useState('');
  const site = dc || data?.sites[0]?.id || '';
  const halls = (data?.halls ?? []).filter(x => x.dcId === site);
  const hl = halls.some(x => x.id === hall) ? hall : halls.find(x => x.racks)?.id ?? halls[0]?.id ?? '';
  const taken = new Set((data?.racks ?? []).filter(r => r.dcId === site).map(r => r.name));
  const suggest = useMemo(() => { for (let i = 0; i < 26 * 4; i++) { const n = `RACK-${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`; if (!taken.has(n)) return n; } return 'RACK-NEW'; }, [taken]);
  useEffect(() => { if (open) { setErr(''); setName(''); setDc(dcId ?? ''); setHall(hallId ?? ''); } }, [open, dcId, hallId]);
  const submit = () => createRack({ dcId: site, hallId: hl, name: name || suggest, heightU: h, budgetKw: kw, role })
    .then(id => { onClose(); toast.show(`${name || suggest} added to ${halls.find(x => x.id === hl)?.name}`, 'It appears on the floor plan, in the twin and in Facilities with an A and a B rack PDU.', { to: `/dcim/racks/${encodeURIComponent(id)}`, label: 'Open rack' }); nav(`/dcim/racks/${encodeURIComponent(id)}`); })
    .catch(e => setErr(String(e.message ?? e)));
  return (<>
    <Modal open={open} onClose={onClose} title="New rack" sub="Adds an empty cabinet to a hall; its A and B rack PDUs are fed from the hall's busways."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" onClick={submit} disabled={!hl}>Create rack</Btn></>}>
      <div className="dcim-form">
        <Field label="Datacenter" required><select className="select" value={site} onChange={e => { setDc(e.target.value); setHall(''); }}>{(data?.sites ?? []).map(s => <option key={s.id} value={s.id}>{s.id} · {s.city}</option>)}</select></Field>
        <Field label="Hall" required><select className="select" value={hl} onChange={e => setHall(e.target.value)}>{halls.map(x => <option key={x.id} value={x.id}>{x.floor} · {x.name} ({x.racks} racks)</option>)}</select></Field>
        <Field label="Name" hint={`Next free name: ${suggest}`} error={name && taken.has(name.toUpperCase()) ? 'Already used at this site' : undefined}><input className="input" value={name} placeholder={suggest} onChange={e => setName(e.target.value.toUpperCase())} /></Field>
        <Field label="Role"><select className="select" value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Height (U)" error={h < 20 || h > 52 ? '20–52 U' : undefined}><input className="input" type="number" min={20} max={52} value={h} onChange={e => setH(Number(e.target.value))} /></Field>
        <Field label="Power budget (kW per side)" hint="Each side is rated for the whole cabinet (2N at the rack)" error={kw <= 0 || kw > 150 ? 'Above 0, at most 150 kW' : undefined}><input className="input" type="number" min={1} max={150} step={0.5} value={kw} onChange={e => setKw(Number(e.target.value))} /></Field>
        {err && <p className="dcim-err">{err}</p>}
      </div>
    </Modal>
    {toast.node}
  </>);
}

export function InstallDeviceModal({ open, onClose, dcId, rackId }: { open: boolean; onClose: () => void; dcId?: string; rackId?: string }) {
  const toast = useToast();
  const { data } = useQuery(() => getDcim(), []);
  const { data: types } = useQuery(getDcimTypes, []);
  const [dc, setDc] = useState(dcId ?? '');
  const [rack, setRack] = useState(rackId ?? '');
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [u, setU] = useState(0);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setErr(''); setName(''); setU(0); setDc(dcId ?? ''); setRack(rackId ?? ''); } }, [open, dcId, rackId]);
  const site = dc || (rackId ? data?.racks.find(r => r.id === rackId)?.dcId : '') || data?.sites.find(s => s.status !== 'planned')?.id || '';
  const racks = (data?.racks ?? []).filter(r => r.dcId === site && r.owner !== 'tenant');
  const rk = racks.find(r => r.id === rack) ?? racks.find(r => r.freeU >= 2) ?? racks[0];
  const { data: slots } = useQuery(() => (rk ? getDcimFreeSlots(rk.id) : Promise.resolve([])), [rk?.id, open]);
  const tl = (types?.types ?? []).filter(t => t.category !== 'tenant');
  const t = tl.find(x => x.id === type) ?? tl[0];
  const fits = (slots ?? []).filter(s => t && s.to - s.from + 1 >= t.uHeight);
  const pos = u && fits.some(s => u >= s.from && u + (t?.uHeight ?? 1) - 1 <= s.to) ? u : fits[0]?.from ?? 0;
  const submit = () => (rk && t ? installDevice({ rackId: rk.id, typeId: t.id, name: name || `${t.role.toUpperCase()}-${rk.name.replace('RACK-', '')}-U${pos}`, u: pos }) : Promise.reject(new Error('Pick a rack and a device type')))
    .then(id => { onClose(); toast.show(`${id} planned in ${rk!.name} U${pos}`, 'The rack units are held for it on the rack, the floor plan and the twin. It becomes Active once installed and discovered.', { to: `/dcim/racks/${encodeURIComponent(rk!.id)}`, label: 'Open rack' }); })
    .catch(e => setErr(String(e.message ?? e)));
  return (<>
    <Modal open={open} onClose={onClose} width={560} title="Install device" sub="Plans a device into free rack units. It shows as Planned (reserved space) until it is installed and discovered."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" onClick={submit} disabled={!rk || !t || !pos}>Plan device</Btn></>}>
      <div className="dcim-form">
        <Field label="Datacenter" required><select className="select" value={site} onChange={e => { setDc(e.target.value); setRack(''); }}>{(data?.sites ?? []).map(s => <option key={s.id} value={s.id}>{s.id} · {s.city}</option>)}</select></Field>
        <Field label="Rack" required hint={rk ? `${rk.freeU} U free · ${rk.drawKw} of ${rk.budgetKw} kW` : undefined}><select className="select" value={rk?.id ?? ''} onChange={e => { setRack(e.target.value); setU(0); }}>{racks.map(r => <option key={r.id} value={r.id}>{r.name} · {r.hallName} · {r.freeU} U free</option>)}</select></Field>
        <Field label="Device type" required style={{ gridColumn: '1 / -1' }}><select className="select" value={t?.id ?? ''} onChange={e => { setType(e.target.value); setU(0); }}>{tl.map(x => <option key={x.id} value={x.id}>{x.manufacturer} {x.model} · {x.role} · {x.uHeight}U</option>)}</select></Field>
        <Field label="Position (lowest U)" required error={!fits.length ? `No ${t?.uHeight ?? 1}U gap free in this rack` : undefined}
          hint={fits.length ? `Free: ${(slots ?? []).map(s => (s.from === s.to ? `U${s.from}` : `U${s.from}–${s.to}`)).join(', ')}` : undefined}>
          <select className="select" value={pos} onChange={e => setU(Number(e.target.value))}>{fits.flatMap(s => Array.from({ length: s.to - s.from + 2 - (t?.uHeight ?? 1) }, (_, i) => s.from + i)).map(x => <option key={x} value={x}>U{x}{(t?.uHeight ?? 1) > 1 ? `–U${x + (t?.uHeight ?? 1) - 1}` : ''}</option>)}</select>
        </Field>
        <Field label="Name" hint="Leave empty for a generated name"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={t && rk ? `${t.role.toUpperCase()}-${rk.name.replace('RACK-', '')}-U${pos}` : ''} /></Field>
        {t && rk && t.typicalW > 0 && rk.drawKw + t.typicalW / 1000 > rk.budgetKw && <p className="dcim-warn" style={{ gridColumn: '1 / -1' }}>A typical {t.model} draws {t.typicalW} W: once live the rack would draw {Math.round((rk.drawKw + t.typicalW / 1000) * 10) / 10} of {rk.budgetKw} kW.</p>}
        {err && <p className="dcim-err">{err}</p>}
      </div>
    </Modal>
    {toast.node}
  </>);
}

const ROLE_LIST: NeRole[] = ['Router', 'Switch', 'Firewall', 'DWDM', 'Access', 'Server', 'Storage', 'GPU'];
const PORTS = ['1G copper', '10G SFP+', '100G QSFP28', '400G OSFP'];
const SPEED: Record<string, number> = { '1G copper': 1000, '10G SFP+': 10000, '100G QSFP28': 100000, '400G OSFP': 400000 };

export function NewTypeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const [mfr, setMfr] = useState(''); const [model, setModel] = useState(''); const [role, setRole] = useState<NeRole>('Switch');
  const [u, setU] = useState(1); const [psus, setPsus] = useState(2); const [ports, setPorts] = useState<Record<string, number>>({ '100G QSFP28': 32 });
  const [err, setErr] = useState('');
  useEffect(() => { if (open) setErr(''); }, [open]);
  const submit = () => addDeviceType({ manufacturer: mfr, model, role, uHeight: u, psus, ports: Object.entries(ports).filter(([, n]) => n > 0).map(([type, count]) => ({ type, speedMbps: SPEED[type], count })) })
    .then(id => { onClose(); toast.show(`${mfr} ${model} added to the catalogue`, 'You can now plan devices of this type into racks.'); nav(`/dcim/types/${encodeURIComponent(id)}`); })
    .catch(e => setErr(String(e.message ?? e)));
  return (<>
    <Modal open={open} onClose={onClose} title="New device type" sub="A model in the catalogue: height, power supplies and port template. Devices are planned from it."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" onClick={submit} disabled={!mfr.trim() || !model.trim()}>Add type</Btn></>}>
      <div className="dcim-form">
        <Field label="Manufacturer" required><input className="input" value={mfr} onChange={e => setMfr(e.target.value)} placeholder="e.g. Arista" /></Field>
        <Field label="Model" required><input className="input" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. 7280R3-32P4" /></Field>
        <Field label="Role"><select className="select" value={role} onChange={e => setRole(e.target.value as NeRole)}>{ROLE_LIST.map(r => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Height (U)" error={u < 1 || u > 20 ? '1–20 U' : undefined}><input className="input" type="number" min={1} max={20} value={u} onChange={e => setU(Number(e.target.value))} /></Field>
        <Field label="Power supplies"><input className="input" type="number" min={1} max={8} value={psus} onChange={e => setPsus(Number(e.target.value))} /></Field>
        <div />
        <Field label="Port template" style={{ gridColumn: '1 / -1' }}>
          <div className="dcim-ports">{PORTS.map(p => (
            <label key={p}><span>{p}</span><input className="input" type="number" min={0} max={128} value={ports[p] ?? 0} onChange={e => setPorts(x => ({ ...x, [p]: Number(e.target.value) }))} /></label>
          ))}</div>
        </Field>
        {err && <p className="dcim-err">{err}</p>}
      </div>
    </Modal>
    {toast.node}
  </>);
}
