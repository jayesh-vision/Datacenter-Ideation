/* DCIM operations (14-Oct-2026, user: port P2B's device / rack / power / catalogue actions in our own design). Every form validates
   against the estate in the mock server (mock/server.ts dcim* functions) and shows the server's message when it refuses. */
import { useEffect, useMemo, useState } from 'react';
import * as I from 'lucide-react';
import {
  dcimAddModuleType, dcimConnect, dcimCreateFeed, dcimCreatePanel, dcimEditInterface, dcimEditRack, dcimEditTemplates, dcimImportTypes, dcimInstallModule, dcimMoveDevice,
  dcimReserveU, getDatacenter, getDcim, getDcimFreePorts, getDcimFreeSlots, getDcimTypes, useQuery
} from '../../api';
import type { DcimComponent, DcimDeviceType, DcimModuleType, DcimRack, DcimRunResult } from '../../api/types';
import { useCrField } from './cr';
import { Btn, Field, Modal } from '../../ui/kit';
import { fmtBw } from '../../lib/format';

const errOf = (e: unknown) => String((e as Error)?.message ?? e);
type Done = (t: string, r?: DcimRunResult) => void;
const Full = ({ children }: { children: React.ReactNode }) => <div style={{ gridColumn: '1 / -1' }}>{children}</div>;
const Err = ({ m }: { m: string }) => (m ? <p className="dcim-err" style={{ gridColumn: '1 / -1' }}>{m}</p> : null);

/* ---------------------------------------------------------------- connect a free port to a free port on another device */
export function ConnectModal({ port, onClose, onDone }: { port: { deviceId: string; deviceName: string; dcId: string; name: string; speedMbps?: number } | null; onClose: () => void; onDone: Done }) {
  const { data: cands } = useQuery(() => (port ? getDcimFreePorts(port.dcId, port.speedMbps ?? 0, port.deviceId) : Promise.resolve([])), [port?.deviceId, port?.name]);
  const [q, setQ] = useState('');
  const [target, setTarget] = useState('');
  const [tport, setTport] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { setQ(''); setTarget(''); setTport(''); setErr(''); }, [port?.deviceId, port?.name]);
  const cr = useCrField(port?.dcId ?? '', true, !!port);
  if (!port) return null;
  const list = (cands ?? []).filter(d => !q || `${d.name} ${d.rack}`.toLowerCase().includes(q.toLowerCase()));
  const far = list.find(d => d.id === target) ?? (cands ?? []).find(d => d.id === target);
  const go = () => dcimConnect(port.deviceId, port.name, target, tport, cr.value!).then(r => onDone(`${port.deviceName} ${port.name} ↔ ${far?.name} ${tport} connected`, r)).catch(e => setErr(errOf(e)));
  return (
    <Modal open onClose={onClose} width={640} title={`Connect ${port.name}`} sub={`${port.deviceName}${port.speedMbps ? ` · ${fmtBw(port.speedMbps)}` : ''} · devices at ${port.dcId} with a free, enabled port of the same speed`}
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Cable} disabled={!target || !tport || !cr.ok} onClick={go}>Connect cable</Btn></>}>
      <div className="dcim-form">
        <Field label={`Far device (${list.length})`} required>
          <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by name or rack" autoFocus />
          <div className="dcim-pick dcim-pick-sm">{list.slice(0, 120).map(d => (
            <button key={d.id} type="button" className={`dcim-pick-item${target === d.id ? ' is-on' : ''}`} onClick={() => { setTarget(d.id); setTport(d.ports[0]?.name ?? ''); }}>
              <b className="mono">{d.name}</b><small>{d.rack} U{d.u} · {d.ports.length} free</small></button>))}
            {!list.length && <p className="vw-label">No device has a free {port.speedMbps ? fmtBw(port.speedMbps) : ''} port.</p>}
          </div>
        </Field>
        <Field label="Far port" required hint={far ? `${far.ports.length} free on ${far.name.replace(`${port.dcId}-`, '')}` : 'Pick a device first'}>
          <div className="dcim-pick dcim-pick-sm">{(far?.ports ?? []).map(x => (
            <button key={x.name} type="button" className={`dcim-pick-item${tport === x.name ? ' is-on' : ''}`} onClick={() => setTport(x.name)}><b className="mono">{x.name}</b><small>{x.type}</small></button>))}</div>
        </Field>
        <Full>{cr.node}</Full>
        <Err m={err} />
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- edit an interface: description, enabled */
export function InterfaceModal({ port, onClose, onDone }: { port: { deviceId: string; dcId: string; c: DcimComponent } | null; onClose: () => void; onDone: Done }) {
  const [desc, setDesc] = useState('');
  const [on, setOn] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => { if (port) { setDesc(port.c.detail && !/Rx|dBm/.test(port.c.detail) ? port.c.detail : ''); setOn(port.c.state !== 'Disabled'); setErr(''); } }, [port]);
  const cr = useCrField(port?.dcId ?? '', on, !!port);
  if (!port) return null;
  const go = () => dcimEditInterface(port.deviceId, port.c.name, { description: desc, enabled: on }, cr.value!).then(r => onDone(`${port.c.name} updated`, r)).catch(e => setErr(errOf(e)));
  return (
    <Modal open onClose={onClose} title={`Edit ${port.c.name}`} sub={`${port.c.type}${port.c.speedMbps ? ` · ${fmtBw(port.c.speedMbps)}` : ''}`}
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" disabled={!cr.ok} onClick={go}>Save</Btn></>}>
      <div className="dcim-form">
        <Field label="Description" style={{ gridColumn: '1 / -1' }}><input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Uplink to IB-LEAF-03" /></Field>
        <Field label="Admin state" style={{ gridColumn: '1 / -1' }}><label className="ipam-check"><input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} /><span>Enabled{port.c.peer && !on ? ' — disabling a cabled port takes its link down' : ''}</span></label></Field>
        <Full>{cr.node}</Full>
        <Err m={err} />
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- install a module in an empty bay */
export function ModuleModal({ bay, onClose, onDone }: { bay: { deviceId: string; dcId: string; model: string; slot: string } | null; onClose: () => void; onDone: Done }) {
  const { data } = useQuery(getDcimTypes, []);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { setPick(''); setErr(''); }, [bay?.slot, bay?.deviceId]);
  const cr = useCrField(bay?.dcId ?? '', false, !!bay);
  if (!bay) return null;
  const want = /^FPC/.test(bay.slot) ? ['Line card'] : /^DISK/.test(bay.slot) ? ['Storage'] : ['Line card', 'Storage', 'Other', 'Accelerator'];
  const fits = (data?.modules ?? []).filter(m => m.fits.includes(bay.model) && want.includes(m.kind));
  const go = () => dcimInstallModule(bay.deviceId, bay.slot, pick, cr.value!).then(r => onDone(`Module installed in ${bay.slot}${r.result ? ` · ${r.result} ports added` : ''}`, r)).catch(e => setErr(errOf(e)));
  return (
    <Modal open onClose={onClose} title={`Install a module in ${bay.slot}`} sub={`Module types that fit a ${bay.model}. A line card adds its ports to the device.`}
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Cpu} disabled={!pick || !cr.ok} onClick={go}>Install</Btn></>}>
      <div className="dcim-pick">{fits.map(m => (
        <button key={m.id} type="button" className={`dcim-pick-item${pick === m.id ? ' is-on' : ''}`} onClick={() => setPick(m.id)}>
          <b>{m.name}</b><small>{m.kind}{m.ports ? ` · ${m.ports.count}× ${m.ports.type}` : m.kind === 'Line card' ? ' · 8 ports of the chassis speed' : ''} · {m.installed} installed{m.custom ? ' · added by hand' : ''}</small>
        </button>))}
        {!fits.length && <p className="vw-label">No module type in the catalogue fits this bay. Add one under Device types → Module types.</p>}
      </div>
      <div style={{ marginTop: 12 }}>{cr.node}</div>
      <Err m={err} />
    </Modal>
  );
}

/* ---------------------------------------------------------------- move a device to another U or another rack at the site */
export function MoveModal({ dev, onClose, onDone }: { dev: { id: string; name: string; dcId: string; rackId: string; u: number; uHeight: number; powerW: number } | null; onClose: () => void; onDone: Done }) {
  const { data: site } = useQuery(() => (dev ? getDcim({ dcId: dev.dcId }) : Promise.resolve(null)), [dev?.dcId]);
  const [rack, setRack] = useState('');
  const [u, setU] = useState(0);
  const [err, setErr] = useState('');
  useEffect(() => { if (dev) { setRack(dev.rackId); setU(0); setErr(''); } }, [dev]);
  const { data: slots } = useQuery(() => (rack ? getDcimFreeSlots(rack) : Promise.resolve([])), [rack]);
  const cr = useCrField(dev?.dcId ?? '', false, !!dev);
  if (!dev) return null;
  const starts = (slots ?? []).flatMap(s => Array.from({ length: Math.max(0, s.to - s.from - dev.uHeight + 2) }, (_, k) => s.from + k));
  const racks = (site?.racks ?? []).filter(r => r.owner !== 'tenant');
  const go = () => dcimMoveDevice(dev.id, rack, u, cr.value!).then(r => onDone(`${dev.name} moved to ${racks.find(x => x.id === rack)?.name} U${u}`, r)).catch(e => setErr(errOf(e)));
  return (
    <Modal open onClose={onClose} title={`Move ${dev.name}`} sub={`${dev.uHeight}U · ${dev.powerW ? `${dev.powerW} W` : 'no draw'} · within ${dev.dcId}; cables stay on their ports`}
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.MoveVertical} disabled={!u || !cr.ok} onClick={go}>Move device</Btn></>}>
      <div className="dcim-form">
        <Field label="Rack"><select className="select" value={rack} onChange={e => { setRack(e.target.value); setU(0); }}>{racks.map(r => <option key={r.id} value={r.id}>{r.name} · {r.hallName} · {r.freeU} U free · {r.drawKw}/{r.budgetKw} kW</option>)}</select></Field>
        <Field label="Bottom U" hint={starts.length ? `${starts.length} positions fit ${dev.uHeight}U` : 'No free run of this height'}><select className="select" value={u} onChange={e => setU(Number(e.target.value))}><option value={0}>Pick a position…</option>{starts.map(x => <option key={x} value={x}>U{x}{dev.uHeight > 1 ? `–U${x + dev.uHeight - 1}` : ''}</option>)}</select></Field>
        <Full>{cr.node}</Full>
        <Err m={err} />
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- rack: edit, reserve U */
export function RackEditModal({ rack, onClose, onDone }: { rack: DcimRack | null; onClose: () => void; onDone: Done }) {
  const [role, setRole] = useState(''); const [h, setH] = useState(42); const [kw, setKw] = useState(8); const [err, setErr] = useState('');
  useEffect(() => { if (rack) { setRole(rack.role); setH(rack.heightU); setKw(rack.budgetKw); setErr(''); } }, [rack]);
  const cr = useCrField(rack?.dcId ?? '', false, !!rack);
  if (!rack) return null;
  const go = () => dcimEditRack(rack.id, { role, heightU: h, budgetKw: kw }, cr.value!).then(r => onDone(`${rack.name} updated`, r)).catch(e => setErr(errOf(e)));
  return (
    <Modal open onClose={onClose} title={`Edit ${rack.name}`} sub={`${rack.usedU} U used · draws ${rack.drawKw} kW · the height cannot go below the highest device or reservation`}
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" disabled={!cr.ok} onClick={go}>Save</Btn></>}>
      <div className="dcim-form">
        <Field label="Role"><select className="select" value={role} onChange={e => setRole(e.target.value)}>{[...new Set([rack.role, 'Access', 'Network', 'Compute', 'Storage', 'GPU', 'Core', 'ODF / patching', 'Tenant cabinet'])].map(r => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Height (U)"><input className="input" type="number" min={20} max={52} value={h} onChange={e => setH(Number(e.target.value))} /></Field>
        <Field label="Power budget (kW)"><input className="input" type="number" min={1} max={150} step={0.5} value={kw} onChange={e => setKw(Number(e.target.value))} /></Field>
        <Full>{cr.node}</Full>
        <Err m={err} />
      </div>
    </Modal>
  );
}
export function ReserveModal({ rack, onClose, onDone }: { rack: DcimRack | null; onClose: () => void; onDone: Done }) {
  const { data: slots } = useQuery(() => (rack ? getDcimFreeSlots(rack.id) : Promise.resolve([])), [rack?.id]);
  const [u, setU] = useState(0); const [n, setN] = useState(2); const [label, setLabel] = useState(''); const [until, setUntil] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { setU(0); setN(2); setLabel(''); setUntil(''); setErr(''); }, [rack?.id]);
  const cr = useCrField(rack?.dcId ?? '', true, !!rack);
  if (!rack) return null;
  const starts = (slots ?? []).flatMap(s => Array.from({ length: Math.max(0, s.to - s.from - n + 2) }, (_, k) => s.from + k));
  const go = () => dcimReserveU(rack.id, { u, uHeight: n, label, until: until ? new Date(until).getTime() : undefined }, cr.value!).then(r => onDone(`U${u}–U${u + n - 1} held in ${rack.name}`, r)).catch(e => setErr(errOf(e)));
  return (
    <Modal open onClose={onClose} title={`Reserve space in ${rack.name}`} sub="Held space shows on the elevation and cannot be used by Install or Move until it is released."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Bookmark} disabled={!u || !label.trim() || !cr.ok} onClick={go}>Reserve</Btn></>}>
      <div className="dcim-form">
        <Field label="Height (U)"><input className="input" type="number" min={1} max={rack.heightU} value={n} onChange={e => { setN(Math.max(1, Number(e.target.value))); setU(0); }} /></Field>
        <Field label="Bottom U" hint={starts.length ? `${starts.length} positions fit` : 'No free run of this height'}><select className="select" value={u} onChange={e => setU(Number(e.target.value))}><option value={0}>Pick…</option>{starts.map(x => <option key={x} value={x}>U{x}–U{x + n - 1}</option>)}</select></Field>
        <Field label="Held for" required style={{ gridColumn: '1 / -1' }}><input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Q4 firewall pair · CHG-2104" /></Field>
        <Field label="Hold until" hint="Optional"><input className="input" type="date" value={until} onChange={e => setUntil(e.target.value)} /></Field>
        <Full>{cr.node}</Full>
        <Err m={err} />
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- power: new panel, new feed */
export function PanelModal({ open, dcId, onClose, onDone }: { open: boolean; dcId: string; onClose: () => void; onDone: Done }) {
  const { data: site } = useQuery(() => (open && dcId ? getDcim({ dcId }) : Promise.resolve(null)), [open, dcId]);
  const { data: dc } = useQuery(() => (open && dcId ? getDatacenter(dcId) : Promise.resolve(null)), [open, dcId]);
  const [hall, setHall] = useState(''); const [name, setName] = useState(''); const [side, setSide] = useState<'A' | 'B' | 'DC'>('A'); const [ups, setUps] = useState(''); const [kw, setKw] = useState(400); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setHall(''); setName(''); setSide('A'); setUps(''); setKw(400); setErr(''); } }, [open]);
  const cr = useCrField(dcId, false, open);
  if (!open) return null;
  const halls = site?.halls ?? []; const hl = hall || halls.find(h => h.racks)?.id || '';
  const upsList = dc?.dc.power.ups ?? []; const u = ups || upsList[side === 'B' ? 0 : 1]?.name || upsList[0]?.name || '';
  const go = () => dcimCreatePanel({ hallId: hl, name, side, sourceUps: u, capacityKw: kw }, cr.value!).then(r => onDone(`${name} added`, r)).catch(e => setErr(errOf(e)));
  return (
    <Modal open onClose={onClose} title="New power panel" sub={dcId ? `A busway or distribution board in a hall at ${dcId}, fed from one UPS module (or the −48 V plant)` : 'Pick a datacenter in the scope selector first'}
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.Zap} disabled={!dcId || !hl || !name.trim() || !cr.ok} onClick={go}>Create panel</Btn></>}>
      <div className="dcim-form">
        <Field label="Hall" required><select className="select" value={hl} onChange={e => setHall(e.target.value)}>{halls.map(h => <option key={h.id} value={h.id}>{h.floor} · {h.name}</option>)}</select></Field>
        <Field label="Name" required><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Busway C" /></Field>
        <Field label="Side"><select className="select" value={side} onChange={e => setSide(e.target.value as 'A')}><option value="A">A side</option><option value="B">B side</option><option value="DC">−48 V DC</option></select></Field>
        <Field label="Fed from"><select className="select" value={u} disabled={side === 'DC'} onChange={e => setUps(e.target.value)}>{upsList.map(x => <option key={x.id} value={x.name}>{x.name} · {x.state}</option>)}</select></Field>
        <Field label="Capacity (kW)"><input className="input" type="number" min={10} max={5000} value={kw} onChange={e => setKw(Number(e.target.value))} /></Field>
        <Full>{cr.node}</Full>
        <Err m={err} />
      </div>
    </Modal>
  );
}
export function FeedModal({ open, dcId, onClose, onDone }: { open: boolean; dcId: string; onClose: () => void; onDone: Done }) {
  const { data: site } = useQuery(() => (open && dcId ? getDcim({ dcId }) : Promise.resolve(null)), [open, dcId]);
  const [panel, setPanel] = useState(''); const [rack, setRack] = useState(''); const [name, setName] = useState(''); const [v, setV] = useState(415); const [ph, setPh] = useState<1 | 3>(3); const [a, setA] = useState(32); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setPanel(''); setRack(''); setName(''); setErr(''); } }, [open]);
  const cr = useCrField(dcId, false, open);
  if (!open) return null;
  const panels = site?.panels ?? []; const pn = panels.find(p => p.id === panel) ?? panels[0];
  const racks = (site?.racks ?? []).filter(r => pn && r.hallId === pn.hallId); const rk = rack || racks[0]?.id || '';
  const kw = Math.round(((v * a * (ph === 3 ? Math.sqrt(3) : 1) * 0.8) / 1000) * 10) / 10;
  const go = () => dcimCreateFeed({ panelId: pn!.id, rackId: rk, name, volts: v, phases: ph, amps: a }, cr.value!).then(r => onDone(r.staged ? `Feed for ${racks.find(x => x.id === rk)?.name}` : `Feed added · ${r.result?.kw} kW to ${racks.find(x => x.id === rk)?.name}`, r)).catch(e => setErr(errOf(e)));
  return (
    <Modal open onClose={onClose} title="New power feed" sub="A rack PDU circuit from a panel. Rating = volts × amps (× √3 for three-phase) × 80% continuous."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" icon={I.PlugZap} disabled={!pn || !rk || !cr.ok} onClick={go}>Create feed</Btn></>}>
      <div className="dcim-form">
        <Field label="Panel" required><select className="select" value={pn?.id ?? ''} onChange={e => { setPanel(e.target.value); setRack(''); }}>{panels.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Rack" required hint="Racks in the panel's hall"><select className="select" value={rk} onChange={e => setRack(e.target.value)}>{racks.map(r => <option key={r.id} value={r.id}>{r.name} · {r.drawKw}/{r.budgetKw} kW</option>)}</select></Field>
        <Field label="Name" hint="Blank = RACK-x-PDU-side"><input className="input" value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Voltage"><select className="select" value={v} onChange={e => setV(Number(e.target.value))}>{[208, 230, 400, 415, 480].map(x => <option key={x} value={x}>{x} V</option>)}</select></Field>
        <Field label="Phases"><select className="select" value={ph} onChange={e => setPh(Number(e.target.value) as 1 | 3)}><option value={1}>Single-phase</option><option value={3}>Three-phase</option></select></Field>
        <Field label="Breaker (A)" hint={`Rated ${kw} kW`}><input className="input" type="number" min={10} max={125} value={a} onChange={e => setA(Number(e.target.value))} /></Field>
        <Full>{cr.node}</Full>
        <Err m={err} />
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- catalogue: module type, JSON import, templates */
const KINDS: DcimModuleType['kind'][] = ['Line card', 'Storage', 'Power supply', 'Fan', 'Routing engine', 'Accelerator', 'Other'];
export function ModuleTypeModal({ open, types, onClose, onDone }: { open: boolean; types: DcimDeviceType[]; onClose: () => void; onDone: (t: string) => void }) {
  const [name, setName] = useState(''); const [kind, setKind] = useState<DcimModuleType['kind']>('Line card'); const [fits, setFits] = useState<string[]>([]); const [q, setQ] = useState('');
  const [pt, setPt] = useState('100G QSFP28'); const [sp, setSp] = useState(100000); const [pc, setPc] = useState(0); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setName(''); setFits([]); setQ(''); setPc(0); setErr(''); } }, [open]);
  const models = useMemo(() => [...new Set(types.map(t => t.model))].sort(), [types]);
  if (!open) return null;
  const shown = models.filter(m => !q || m.toLowerCase().includes(q.toLowerCase())).slice(0, 80);
  const go = () => dcimAddModuleType({ name, kind, fits, ports: pc ? { type: pt, speedMbps: sp, count: pc } : undefined }).then(() => onDone(`${name} added to the catalogue`)).catch(e => setErr(errOf(e)));
  return (
    <Modal open onClose={onClose} width={620} title="New module type" sub="A part that goes into a device bay: line card, drive, supply, fan, routing engine."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" disabled={!name.trim() || !fits.length} onClick={go}>Add module type</Btn></>}>
      <div className="dcim-form">
        <Field label="Name" required><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. MPC10E-15C" autoFocus /></Field>
        <Field label="Kind"><select className="select" value={kind} onChange={e => setKind(e.target.value as DcimModuleType['kind'])}>{KINDS.map(k => <option key={k}>{k}</option>)}</select></Field>
        {kind === 'Line card' && <>
          <Field label="Ports it adds" hint="0 = the chassis speed, 8 ports"><input className="input" type="number" min={0} max={64} value={pc} onChange={e => setPc(Number(e.target.value))} /></Field>
          <Field label="Port type"><select className="select" value={`${pt}|${sp}`} onChange={e => { const [a, b] = e.target.value.split('|'); setPt(a); setSp(Number(b)); }}>{[['10G SFP+', 10000], ['100G QSFP28', 100000], ['400G QSFP-DD', 400000]].map(([a, b]) => <option key={a} value={`${a}|${b}`}>{a}</option>)}</select></Field>
        </>}
        <Field label={`Fits (${fits.length} model${fits.length === 1 ? '' : 's'})`} required style={{ gridColumn: '1 / -1' }}>
          <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Filter models" />
          <div className="dcim-fits">{shown.map(m => <label key={m} className={fits.includes(m) ? 'is-on' : ''}><input type="checkbox" checked={fits.includes(m)} onChange={e => setFits(f => (e.target.checked ? [...f, m] : f.filter(x => x !== m)))} />{m}</label>)}</div>
        </Field>
        <Err m={err} />
      </div>
    </Modal>
  );
}
const SAMPLE = JSON.stringify([{ manufacturer: 'Arista', model: '7800R3-36P', role: 'Switch', uHeight: 2, psus: 4, ports: [{ type: '400G QSFP-DD', speedMbps: 400000, count: 36 }] }, { manufacturer: 'Supermicro', model: 'SYS-221H-TNR', role: 'Server', uHeight: 2, psus: 2, ports: [{ type: '100G QSFP28', speedMbps: 100000, count: 2 }] }], null, 2);
export function ImportTypesModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (t: string) => void }) {
  const [text, setText] = useState(''); const [res, setRes] = useState<{ model: string; ok: boolean; message: string }[] | null>(null); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setText(''); setRes(null); setErr(''); } }, [open]);
  if (!open) return null;
  const go = () => dcimImportTypes(text).then(r => { setRes(r); const n = r.filter(x => x.ok).length; if (n) onDone(`${n} device type${n === 1 ? '' : 's'} imported`); }).catch(e => setErr(errOf(e)));
  return (
    <Modal open onClose={onClose} width={640} title="Import device types" sub="Paste a JSON array: manufacturer, model, role, uHeight, psus and ports [{ type, speedMbps, count }]. Each row is checked on its own."
      foot={<><Btn onClick={() => setText(SAMPLE)}>Paste an example</Btn><span style={{ flex: 1 }} /><Btn onClick={onClose}>Close</Btn><Btn variant="filled" icon={I.Upload} disabled={!text.trim()} onClick={go}>Import</Btn></>}>
      <textarea className="input mono dcim-json" value={text} onChange={e => setText(e.target.value)} placeholder="[ { &quot;manufacturer&quot;: &quot;…&quot;, &quot;model&quot;: &quot;…&quot; } ]" spellCheck={false} />
      <Err m={err} />
      {res && <ul className="dcim-import">{res.map((r, i) => <li key={i} className={r.ok ? 'is-ok' : 'is-bad'}>{r.ok ? <I.CircleCheck size={14} /> : <I.CircleX size={14} />}<b>{r.model.trim() || `Row ${i + 1}`}</b><span>{r.message}</span></li>)}</ul>}
    </Modal>
  );
}
export function TemplatesModal({ type, onClose, onDone }: { type: DcimDeviceType | null; onClose: () => void; onDone: (t: string) => void }) {
  const [ports, setPorts] = useState<{ type: string; speedMbps: number; count: number }[]>([]); const [psus, setPsus] = useState(2); const [con, setCon] = useState(1); const [mg, setMg] = useState(1); const [bays, setBays] = useState(0); const [err, setErr] = useState('');
  useEffect(() => { if (type) { setPorts(type.ports.map(p => ({ ...p }))); setPsus(type.psus); setCon(type.consolePorts); setMg(type.mgmtPorts); setBays(type.moduleBays); setErr(''); } }, [type]);
  if (!type) return null;
  const upd = (i: number, patch: Partial<{ type: string; speedMbps: number; count: number }>) => setPorts(ps => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const go = () => dcimEditTemplates(type.id, { ports, psus, consolePorts: con, mgmtPorts: mg, moduleBays: bays }).then(() => onDone('Component templates saved')).catch(e => setErr(errOf(e)));
  return (
    <Modal open onClose={onClose} width={640} title={`Component templates · ${type.manufacturer} ${type.model}`} sub="Every device installed from this type is built with these ports, supplies and bays."
      foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" onClick={go}>Save templates</Btn></>}>
      <b className="dcim-sub-h">Interface templates</b>
      <div className="dcim-tpl">{ports.map((p, i) => (
        <div key={i} className="dcim-tpl-row">
          <select className="select" value={`${p.type}|${p.speedMbps}`} onChange={e => { const [a, b] = e.target.value.split('|'); upd(i, { type: a, speedMbps: Number(b) }); }}>{[['1G copper', 1000], ['10G SFP+', 10000], ['25G SFP28', 25000], ['100G QSFP28', 100000], ['400G QSFP-DD', 400000], ['400G OSFP', 400000], [p.type, p.speedMbps]].filter((x, k, a) => a.findIndex(y => y[0] === x[0]) === k).map(([a, b]) => <option key={String(a)} value={`${a}|${b}`}>{a}</option>)}</select>
          <input className="input" type="number" min={1} max={128} value={p.count} onChange={e => upd(i, { count: Number(e.target.value) })} aria-label="Count" />
          <span className="vw-label">ports</span>
          <button type="button" className="dcim-tpl-x" aria-label="Remove" onClick={() => setPorts(ps => ps.filter((_, k) => k !== i))}><I.Trash2 size={14} /></button>
        </div>))}
        <Btn size="sm" icon={I.Plus} onClick={() => setPorts(ps => [...ps, { type: '100G QSFP28', speedMbps: 100000, count: 8 }])}>Add interface template</Btn>
      </div>
      <div className="dcim-form" style={{ marginTop: 12 }}>
        <Field label="Power ports (PSUs)"><input className="input" type="number" min={0} max={8} value={psus} onChange={e => setPsus(Number(e.target.value))} /></Field>
        <Field label="Module bays"><input className="input" type="number" min={0} max={16} value={bays} onChange={e => setBays(Number(e.target.value))} /></Field>
        <Field label="Console ports"><input className="input" type="number" min={0} max={4} value={con} onChange={e => setCon(Number(e.target.value))} /></Field>
        <Field label="Management ports"><input className="input" type="number" min={0} max={4} value={mg} onChange={e => setMg(Number(e.target.value))} /></Field>
        <Err m={err} />
      </div>
    </Modal>
  );
}
