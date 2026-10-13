/* New plan (/planner/new?scope=): scope → where → requirements, with the evaluation live beside the form (the same engine the plan
   page uses), so a blocking check is visible before the draft exists. EditPlanModal reuses the requirements form for drafts. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getDcim, getDcimTypes, getPlanner, getPlannerHalls, previewPlan, createPlannerPlan, updatePlannerPlan, useQuery, CURRENT_USER } from '../../api';
import type { PlanInput, PlannerPlan, PlanScope } from '../../api/types';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Chip, Field, Modal, Panel } from '../../ui/kit';
import { SevDot } from '../../ui/status';
import { fmtDate, fmtKw, fmtMoney } from '../../lib/format';
import { SCOPE_ICON } from './Planner';
import '../../styles/dcim.css';
import '../../styles/planner.css';

const DAY = 864e5;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export function PlanWizard() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  usePage([{ label: 'Plan & Build' }, { label: 'Planner', to: '/planner' }, { label: 'New plan' }]);
  const { data: pl } = useQuery(getPlanner, []);
  const { data: dc } = useQuery(() => getDcim(), []);
  const [scope, setScope] = useState<PlanScope | null>((sp.get('scope') as PlanScope) || null);
  const [x, setX] = useState<PlanInput | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!scope || !pl || !dc) return;
    const t = pl.templates.find(z => z.scope === scope)!;
    const site = dc.sites.find(s => s.status === 'on-air') ?? dc.sites[0];
    const planned = dc.sites.find(s => s.status === 'planned');
    setX({ scope, name: '', dcId: scope === 'new-site' ? (planned?.id ?? site.id) : site.id, city: scope === 'new-site' ? planned?.city ?? '' : undefined, racks: 0, kwPerRack: 0, redundancy: 'N+1', tier: site.tier, cooling: 'Air', target: clockNow() + 180 * DAY, owner: CURRENT_USER, ...t.defaults } as PlanInput);
  }, [scope, pl, dc]);
  if (!pl || !dc) return <Loading />;
  const create = () => x && createPlannerPlan({ ...x, name: x.name || autoName(x) }).then(id => nav(`/planner/${id}`)).catch(e => setErr(String(e.message ?? e)));
  return (
    <div className="page dcim planner">
      <PageHead title="New plan" sub="Choose what you are planning, where, and what it needs. The checks, cost and schedule update as you type." actions={<Btn icon={I.ArrowLeft} onClick={() => nav('/planner')}>Back to plans</Btn>} />
      <ol className="pl-stepper"><li className={scope ? 'done' : 'on'}>1 · Scope</li><li className={scope ? 'on' : ''}>2 · Where and what</li><li className={scope && x ? 'on' : ''}>3 · Check and create</li></ol>
      {!scope || !x ? (
        <div className="pl-scopes">{(['Grow in place', 'Build new', 'Upgrade & refresh'] as const).map(g => (
          <section key={g} className="pl-scope-group"><h3>{g}</h3>
            {pl.templates.filter(t => t.group === g).map(t => { const Ic = SCOPE_ICON[t.scope]; return (
              <button key={t.scope} type="button" className="vw-card-section pl-scope" onClick={() => setScope(t.scope)}><Ic size={20} /><b>{t.name}</b><span>{t.description}</span></button>
            ); })}
          </section>
        ))}</div>
      ) : (
        <div className="pl-wiz">
          <Panel title="Where and what" icon={SCOPE_ICON[scope]} sub={pl.templates.find(t => t.scope === scope)!.name} actions={<Btn icon={I.Undo2} onClick={() => { setScope(null); setX(null); }}>Change scope</Btn>}>
            <PlanForm x={x} setX={setX} sites={dc.sites} />
            {err && <p className="dcim-err">{err}</p>}
            <div className="row" style={{ gap: 8, marginTop: 14 }}><Btn variant="filled" icon={I.FilePlus2} onClick={create}>Create draft</Btn><span className="vw-label">The draft can be edited, compared with scenarios and submitted from its page.</span></div>
          </Panel>
          <Preview x={x} />
        </div>
      )}
    </div>
  );
}

const autoName = (x: PlanInput) => x.scope === 'new-site' ? `New datacenter ${x.city || x.dcId}` : x.scope === 'plant-upgrade' ? `${x.plant} +${x.plantKw} kW at ${x.dcId}` : x.scope === 'refresh' ? `Refresh at ${x.dcId}` : `${x.racks} × ${x.kwPerRack} kW ${x.scope === 'ai-pod' ? 'GPU pod' : x.scope === 'new-hall' ? 'new hall' : 'racks'} at ${x.dcId}`;

export function PlanForm({ x, setX, sites }: { x: PlanInput; setX: (f: (p: PlanInput | null) => PlanInput | null) => void; sites: { id: string; city: string; status: string; tier: PlanInput['tier'] }[] }) {
  const up = (patch: Partial<PlanInput>) => setX(p => (p ? { ...p, ...patch } : p));
  const { data: halls } = useQuery(() => (x.scope !== 'new-site' ? getPlannerHalls(x.dcId) : Promise.resolve([])), [x.dcId, x.scope]);
  const { data: types } = useQuery(() => (x.scope === 'refresh' ? getDcimTypes() : Promise.resolve(null)), [x.scope]);
  const needsHall = x.scope === 'rack-expansion' || x.scope === 'ai-pod';
  useEffect(() => { if (needsHall && halls?.length && !halls.some(h => h.id === x.hallId)) up({ hallId: [...halls].sort((a, b) => b.free - a.free)[0].id }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [halls, needsHall]);
  const net = (types?.types ?? []).filter(t => t.devices && t.category !== 'tenant');
  useEffect(() => { if (x.scope === 'refresh' && net.length && !x.refreshTypeId) { const f = net[0]; up({ refreshTypeId: f.id, refreshToTypeId: net.find(t => t.role === f.role && t.id !== f.id)?.id }); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [types]);
  const live = sites.filter(s => s.status !== 'planned');
  return (
    <div className="dcim-form">
      <Field label="Plan name" hint="Leave empty for a generated name" style={{ gridColumn: '1 / -1' }}><input className="input" value={x.name} onChange={e => up({ name: e.target.value })} placeholder={autoName(x)} /></Field>
      {x.scope === 'new-site' ? <>
        <Field label="Site record"><select className="select" value={x.dcId} onChange={e => up({ dcId: e.target.value })}>{sites.map(s => <option key={s.id} value={s.id}>{s.id} · {s.city}{s.status === 'planned' ? ' (planned)' : ''}</option>)}</select></Field>
        <Field label="City"><input className="input" value={x.city ?? ''} onChange={e => up({ city: e.target.value })} /></Field>
      </> : <Field label="Datacenter" required><select className="select" value={x.dcId} onChange={e => { const s = sites.find(z => z.id === e.target.value); up({ dcId: e.target.value, hallId: undefined, tier: s?.tier ?? x.tier }); }}>{live.map(s => <option key={s.id} value={s.id}>{s.id} · {s.city} · {s.tier}</option>)}</select></Field>}
      {needsHall && <Field label="Hall" required hint="Free positions on the hall's floor plan"><select className="select" value={x.hallId ?? ''} onChange={e => up({ hallId: e.target.value })}>{(halls ?? []).map(h => <option key={h.id} value={h.id}>{h.floor} · {h.name} — {h.free} free</option>)}</select></Field>}
      {x.scope === 'plant-upgrade' ? <>
        <Field label="Plant"><select className="select" value={x.plant} onChange={e => up({ plant: e.target.value as PlanInput['plant'] })}>{['UPS', 'Cooling', 'Generator'].map(v => <option key={v}>{v}</option>)}</select></Field>
        <Field label="Capacity to add (kW)"><input className="input" type="number" min={50} step={50} value={x.plantKw ?? 0} onChange={e => up({ plantKw: Number(e.target.value) })} /></Field>
      </> : x.scope === 'refresh' ? <>
        <Field label="Replace model"><select className="select" value={x.refreshTypeId ?? ''} onChange={e => up({ refreshTypeId: e.target.value })}>{net.map(t => <option key={t.id} value={t.id}>{t.manufacturer} {t.model} ({t.devices})</option>)}</select></Field>
        <Field label="With model"><select className="select" value={x.refreshToTypeId ?? ''} onChange={e => up({ refreshToTypeId: e.target.value })}>{net.filter(t => t.id !== x.refreshTypeId).map(t => <option key={t.id} value={t.id}>{t.manufacturer} {t.model}</option>)}</select></Field>
      </> : <>
        <Field label="Racks" error={x.racks < 1 ? 'At least one' : undefined}><input className="input" type="number" min={1} value={x.racks} onChange={e => up({ racks: Number(e.target.value) })} /></Field>
        <Field label="kW per rack" error={x.kwPerRack <= 0 ? 'Above zero' : undefined}><input className="input" type="number" min={1} step={0.5} value={x.kwPerRack} onChange={e => up({ kwPerRack: Number(e.target.value) })} /></Field>
        <Field label="Cooling"><select className="select" value={x.cooling} onChange={e => up({ cooling: e.target.value as PlanInput['cooling'] })}>{['Air', 'Rear-door', 'Liquid-to-chip'].map(v => <option key={v}>{v}</option>)}</select></Field>
      </>}
      {(x.scope === 'new-site' || x.scope === 'new-hall') && <>
        <Field label="Redundancy"><select className="select" value={x.redundancy} onChange={e => up({ redundancy: e.target.value as PlanInput['redundancy'] })}>{['N', 'N+1', '2N'].map(v => <option key={v}>{v}</option>)}</select></Field>
        <Field label="Tier"><select className="select" value={x.tier} onChange={e => up({ tier: e.target.value as PlanInput['tier'] })}>{['Tier II', 'Tier III', 'Tier IV'].map(v => <option key={v}>{v}</option>)}</select></Field>
      </>}
      <Field label="Target date"><input className="input" type="date" value={isoDay(x.target)} onChange={e => up({ target: new Date(e.target.value).getTime() || x.target })} /></Field>
    </div>
  );
}

function Preview({ x }: { x: PlanInput }) {
  const key = JSON.stringify(x);
  const { data: e } = useQuery(() => previewPlan(x), [key]);
  if (!e) return <Panel title="Check" icon={I.ListChecks}><Loading /></Panel>;
  return (
    <Panel title="Live check" icon={I.ListChecks} className="pl-preview" info="The same evaluation the plan page shows: checks against the site, plant to add, CapEx, return and finish date.">
      <p className={`pl-verdict is-${e.verdict.state}`}>{e.verdict.text}</p>
      <div className="pl-kv4">
        <span><small>IT · facility</small><b>{fmtKw(e.itKw)} · {fmtKw(e.facilityKw)}</b></span>
        <span><small>CapEx</small><b>{fmtMoney(e.capexTotal)}</b></span>
        <span><small>{e.irr !== null ? 'IRR · NPV' : 'NPV (cost)'}</small><b>{e.irr !== null ? `${e.irr}% · ` : ''}{fmtMoney(e.npv)}</b></span>
        <span><small>Finish</small><b style={{ color: e.lateDays ? 'var(--vw-color-red-600)' : undefined }}>{fmtDate(e.finish)}</b></span>
      </div>
      {e.checks.length > 0 && <ul className="pl-checks">{e.checks.map(c => <li key={c.key}><Chip tone={c.ok ? 'success' : 'error'} dot size="xs">{c.ok ? 'Pass' : 'Fails'}</Chip><span><b>{c.label}</b> — {c.need} of {c.have} {c.unit}{!c.ok && c.fix ? `. ${c.fix}` : ''}</span></li>)}</ul>}
      {e.findings.filter(f => !f.title.includes(':')).slice(0, 4).map((f, i) => <p key={i} className="pl-find"><SevDot s={f.severity} /><span>{f.title}</span></p>)}
      {e.plant.length > 0 && <p className="vw-label" style={{ margin: '8px 0 0' }}>Adds: {e.plant.map(p2 => `${p2.units} × ${p2.unitSize} ${p2.stage.toLowerCase()}`).join(' · ')}</p>}
    </Panel>
  );
}

export function EditPlanModal({ plan, onClose }: { plan: PlannerPlan; onClose: () => void }) {
  const { data: dc } = useQuery(() => getDcim(), []);
  const [x, setX] = useState<PlanInput | null>(() => ({ ...plan }));
  const [err, setErr] = useState('');
  const save = () => x && updatePlannerPlan(plan.id, { name: x.name, dcId: x.dcId, hallId: x.hallId, city: x.city, racks: x.racks, kwPerRack: x.kwPerRack, cooling: x.cooling, redundancy: x.redundancy, tier: x.tier, plant: x.plant, plantKw: x.plantKw, refreshTypeId: x.refreshTypeId, refreshToTypeId: x.refreshToTypeId, target: x.target }).then(onClose).catch(e => setErr(String(e.message ?? e)));
  const sites = useMemo(() => dc?.sites ?? [], [dc]);
  return (
    <Modal open onClose={onClose} width={760} title={`Edit ${plan.id}`} sub="Checks, cost and schedule are recalculated when you save." foot={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="filled" onClick={save}>Save draft</Btn></>}>
      {x && dc ? <div className="pl-edit"><PlanForm x={x} setX={setX} sites={sites} /><Preview x={x} /></div> : <Loading />}
      {err && <p className="dcim-err">{err}</p>}
    </Modal>
  );
}
