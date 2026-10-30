/* Delivery permits, design documents and the project document library (30-Oct-2026, after P2B's Permits / Design registers and its
   project Documents tab). Pure derivation over what mock/delivery.ts already computed; every draw is seeded on the record's own id,
   so nothing else in the estate moves.
   - Permit: type from its name, the authority's reference once filed (India: CODE/STATE/YEAR/NNNN; USA: CODE-YY-NNNNN), granted date,
     validity by type (fire and electrical inspections yearly, building two years, zoning three, environmental consents and rights of way
     five; utility connections, occupancy and decommission records do not lapse), the files on record.
   - Design document: drawing number (site-project-discipline-type-nnn), discipline, reviewer, issued date, sheets and the file of every
     revision (earlier revisions kept as superseded).
   - Project documents: the records the project produced, dated when they happened (never after today). */
import type { CxTest, DesignDiscipline, DesignDoc, DlFile, Permit, PermitType, ProjectDocument, PurchaseOrder, WorkOrder, ChangeOrder } from '../api/types';
import { activeGeo } from './geo';
import { mulberry32, seedOf } from '../lib/rng';
import { DAY } from './seed';

const WEEK = 7 * DAY, MONTH = 30.44 * DAY;
const rngOf = (id: string) => mulberry32(seedOf(`docs:${id}`));
const kbOf = (id: string, lo: number, hi: number) => Math.round(lo + rngOf(id)() * (hi - lo));
const file = (name: string, kb: number, at: number, by: string, label: string): DlFile => ({ name, kb, at, by, label });
const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function permitType(name: string): PermitType {
  const n = name.toLowerCase();
  if (/sanitis|decommission|handback|landlord|disconnection/.test(n)) return 'Decommission';
  if (/zoning|land use/.test(n)) return 'Planning / zoning';
  if (/fire/.test(n)) return 'Fire / life safety';
  if (/environment|emission|refrigerant|hazardous|f-gas|pollution/.test(n)) return 'Environmental';
  if (/occupan/.test(n)) return 'Occupancy';
  if (/right of way/.test(n)) return 'Right of way';
  if (/utility|meter|interconnect|grid/.test(n)) return 'Utility connection';
  if (/electric/.test(n)) return 'Electrical';
  return 'Building';
}
/** months a granted permit stays valid (undefined = does not lapse) */
export const PERMIT_VALID_MONTHS: Record<PermitType, number | undefined> = { 'Planning / zoning': 36, Building: 24, Environmental: 60, Electrical: 12, 'Fire / life safety': 12, 'Utility connection': undefined, Occupancy: undefined, 'Right of way': 60, Decommission: undefined };
const CODE: Record<PermitType, [string, string]> = { 'Planning / zoning': ['LUZ', 'ZON'], Building: ['BP', 'BLD'], Environmental: ['CTE', 'ENV'], Electrical: ['CEIG', 'ELE'], 'Fire / life safety': ['FSNOC', 'FIRE'], 'Utility connection': ['HTC', 'UTL'], Occupancy: ['OC', 'CO'], 'Right of way': ['ROW', 'ROW'], Decommission: ['DCM', 'DCM'] };
export function permitRef(id: string, type: PermitType, dcId: string, at: number, suffix = '') {
  const r = rngOf(`ref:${id}${suffix}`); const y = new Date(at).getFullYear();
  return activeGeo().id === 'in' ? `${CODE[type][0]}/${dcId.slice(0, 2)}/${y}/${String(100 + Math.floor(r() * 9800)).padStart(4, '0')}${suffix}`
    : `${CODE[type][1]}-${String(y).slice(2)}-${String(10000 + Math.floor(r() * 89000))}${suffix}`;
}
export const validTo = (type: PermitType, granted: number) => { const m = PERMIT_VALID_MONTHS[type]; return m ? Math.round(granted + m * MONTH) : undefined; };
const DRAWN: PermitType[] = ['Building', 'Fire / life safety', 'Electrical', 'Occupancy', 'Planning / zoning', 'Right of way'];

/** a permit with its type, reference, dates and files */
export function enrichPermit(x: Omit<Permit, 'type' | 'files'> & Partial<Pick<Permit, 'type' | 'files'>>, dcId: string, now: number): Permit {
  const type = x.type ?? permitType(x.name);
  let state = x.state, submitted = x.submitted, granted: number | undefined, expires: number | undefined;
  if (state === 'Granted' || state === 'Expired') {
    const filed = submitted ?? x.due - 12 * WEEK;
    submitted = Math.min(filed, now - 2 * DAY);
    granted = Math.min(x.due - WEEK, Math.round(now - (2 + rngOf(`gr:${x.id}`)() * 38) * DAY));
    /* an authority takes weeks, not days: a permit granted soon after its (planned) filing date was filed 6–14 weeks before the grant */
    if (granted - submitted < 4 * WEEK) submitted = Math.round(granted - (6 + rngOf(`fil:${x.id}`)() * 8) * WEEK);
    expires = validTo(type, granted);
    if (state === 'Expired') { const lapsed = now - Math.round((5 + rngOf(`exp:${x.id}`)() * 40) * DAY); expires = Math.min(expires ?? lapsed, lapsed); }
    else if (expires && expires < now) state = 'Expired';
  }
  const ref = submitted ? permitRef(x.id, type, dcId, submitted) : undefined;
  const files: DlFile[] = [];
  if (submitted) {
    files.push(file(`${slug(x.name)}_application.pdf`, kbOf(`${x.id}:app`, 180, 900), submitted, x.owner, 'Application'));
    if (DRAWN.includes(type)) files.push(file(`${slug(x.name)}_submission-drawings.zip`, kbOf(`${x.id}:dwg`, 4200, 26000), submitted, x.owner, 'Submission drawings'));
  }
  if (granted) files.push(file(`${(ref ?? x.id).replace(/\//g, '-')}_approval.pdf`, kbOf(`${x.id}:ok`, 120, 520), granted, x.authority, 'Approval certificate'));
  return { ...x, type, state, submitted, ref, granted, expires, files };
}

/* design documents */
export type Family = string;
const KIND_CODE: Record<DesignDoc['kind'], string> = { 'Design basis': 'DB', 'Single-line diagram': 'SLD', 'Cooling P&ID': 'PID', 'Floor layout': 'GA', 'Cable schedule': 'CS', 'Method statement': 'MS', 'As-built': 'AB' };
const DISC_CODE: Record<DesignDiscipline, string> = { Architectural: 'A', Structural: 'S', Electrical: 'E', Mechanical: 'M', Network: 'N', Civil: 'C' };
const famDiscipline = (fam: Family, scope: string): DesignDiscipline =>
  fam === 'network' || fam === 'firmware' || fam === 'onboard' || fam === 'ist' || scope === 'refresh' ? 'Network'
  : fam === 'cooling' ? 'Mechanical' : fam === 'civil' ? 'Civil' : fam === 'design' || fam === 'hall' || scope === 'new-site' || scope === 'new-hall' ? 'Architectural' : 'Electrical';
export const docDiscipline = (kind: DesignDoc['kind'], fam: Family, scope: string): DesignDiscipline =>
  kind === 'Single-line diagram' ? 'Electrical' : kind === 'Cooling P&ID' ? 'Mechanical' : kind === 'Floor layout' ? (fam === 'civil' ? 'Civil' : 'Architectural') : kind === 'Cable schedule' ? 'Network' : famDiscipline(fam, scope);
const SHEETS: Record<DesignDoc['kind'], [number, number]> = { 'Design basis': [1, 1], 'Single-line diagram': [3, 10], 'Cooling P&ID': [3, 8], 'Floor layout': [2, 6], 'Cable schedule': [1, 1], 'Method statement': [1, 1], 'As-built': [8, 24] };
export const docNumber = (dcId: string, pid: string, discipline: DesignDiscipline, kind: DesignDoc['kind'], n: number) => `${dcId}-${pid.slice(4)}-${DISC_CODE[discipline]}-${KIND_CODE[kind]}-${String(n).padStart(3, '0')}`;
export const nextRev = (rev: string) => /^[A-Y]$/.test(rev) ? String.fromCharCode(rev.charCodeAt(0) + 1) : `${rev}1`;
const ext = (kind: DesignDoc['kind']) => kind === 'Cable schedule' ? 'xlsx' : kind === 'Design basis' || kind === 'Method statement' ? 'pdf' : 'pdf';
/** the file of each revision up to `rev` (the earlier ones superseded) plus the CAD source for drawings */
export function docFiles(d: Pick<DesignDoc, 'id' | 'number' | 'kind' | 'rev' | 'author' | 'updated'>, start: number): DlFile[] {
  const revs: string[] = []; for (let c = 'A'; ; c = nextRev(c)) { revs.push(c); if (c === d.rev || revs.length > 8) break; }
  const out: DlFile[] = revs.map((rv, i) => file(`${d.number}_R${rv}.${ext(d.kind)}`, kbOf(`${d.id}:${rv}`, d.kind === 'Cable schedule' ? 60 : 400, d.kind === 'Cable schedule' ? 420 : 6400),
    i === revs.length - 1 ? d.updated : Math.min(d.updated, start + (i + 1) * WEEK), d.author, i === revs.length - 1 ? `Current revision ${rv}` : `Superseded revision ${rv}`)).reverse();
  if (d.kind === 'Single-line diagram' || d.kind === 'Cooling P&ID' || d.kind === 'Floor layout' || d.kind === 'As-built') out.splice(1, 0, file(`${d.number}_R${d.rev}.dwg`, kbOf(`${d.id}:cad`, 1800, 14000), d.updated, d.author, 'CAD source'));
  return out;
}
export function enrichDoc(d: Omit<DesignDoc, 'number' | 'discipline' | 'reviewer' | 'sheets' | 'files'> & Partial<DesignDoc>, i: number, x: { dcId: string; fam: Family; scope: string; people: string[]; start: number; now: number }): DesignDoc {
  const discipline = d.discipline ?? docDiscipline(d.kind, x.fam, x.scope);
  const number = d.number ?? docNumber(x.dcId, d.projectId, discipline, d.kind, i + 1);
  const others = x.people.slice(0, 12).filter(p => p !== d.author);
  const reviewer = d.reviewer ?? (others[Math.floor(rngOf(`rv:${d.id}`)() * others.length)] ?? d.author);
  /* a draft or a document in review was last touched some days ago, not today */
  const updated = !d.added && (d.state === 'Draft' || d.state === 'In review') && d.updated >= x.now - DAY ? Math.round(x.now - (1 + rngOf(`up:${d.id}`)() * 18) * DAY) : d.updated;
  const [lo, hi] = SHEETS[d.kind]; const sheets = d.sheets ?? lo + Math.floor(rngOf(`sh:${d.id}`)() * (hi - lo + 1));
  const issued = d.issued ?? (d.state === 'Issued for construction' || d.state === 'As-built' ? d.updated : undefined);
  const base = { ...d, updated, discipline, number, reviewer, sheets, issued } as DesignDoc;
  return { ...base, files: d.files ?? docFiles(base, x.start) };
}

/* the project's document library */
export function projectLibrary(x: { pid: string; planId?: string; template?: string; name: string; manager: string; now: number; created: number; approvedAt: number; delivered: boolean; finish: number;
  pos: PurchaseOrder[]; wos: WorkOrder[]; tests: CxTest[]; permits: Permit[]; docs: DesignDoc[]; cos: ChangeOrder[]; added: ProjectDocument[] }): ProjectDocument[] {
  const { pid, now } = x; const out: ProjectDocument[] = [];
  const add = (key: string, title: string, category: ProjectDocument['category'], at: number, by: string, name: string, lo: number, hi: number, ref?: string, to?: string) => {
    if (at > now) return; out.push({ id: `DOC-${pid.slice(4)}-${key}`, projectId: pid, title, category, ref, to, file: file(name, kbOf(`${pid}:${key}`, lo, hi), at, by, category) });
  };
  if (x.planId) {
    add('plan', 'Approved plan pack', 'Plan and approval', x.approvedAt, x.manager, `${x.planId}_plan-pack.zip`, 6000, 24000, x.planId, `/planning/plans/${x.planId}?tab=pack`);
    add('appr', 'Plan approval record', 'Plan and approval', x.approvedAt, x.manager, `${x.planId}_approval-record.pdf`, 90, 260, x.planId, `/planning/plans/${x.planId}?tab=approvals`);
  } else add('charter', `Project charter — ${x.template ?? x.name}`, 'Plan and approval', x.created, x.manager, `${pid}_project-charter.pdf`, 140, 480, pid);
  for (const o of x.pos) {
    if (o.state === 'Draft') continue;
    add(`po-${o.id}`, `Purchase order ${o.id} — ${o.supplier}`, 'Contracts and orders', o.ordered, x.manager, `${o.id}_purchase-order.pdf`, 80, 240, o.id, `/delivery/projects/${pid}?tab=procurement`);
    if (o.state === 'Delivered') add(`grn-${o.id}`, `Goods receipt — ${o.id}`, 'Contracts and orders', o.due, x.manager, `${o.id}_goods-receipt.pdf`, 40, 160, o.id, `/delivery/projects/${pid}?tab=procurement`);
  }
  for (const p of x.permits) if (p.granted) add(`pmt-${p.id}`, `${p.name} — approval`, 'Permits', p.granted, p.authority, p.files.find(f => f.label === 'Approval certificate')?.name ?? `${p.id}.pdf`, 120, 520, p.ref, `/delivery/projects/${pid}?tab=permits`);
  /* an issued document: its current revision's file (a schedule is a workbook) and, for a drawing, its CAD source */
  for (const d of x.docs) if (d.issued) {
    const cur = d.files.find(f => f.label.startsWith('Current')), cad = d.files.find(f => f.label === 'CAD source');
    add(`dd-${d.id}`, `${d.kind} rev ${d.rev}${d.state === 'As-built' ? ' (as-built)' : ' (issued for construction)'}`, 'Design', d.issued, d.author, cur?.name ?? `${d.number}_R${d.rev}.pdf`, 400, 6400, d.number, `/delivery/projects/${pid}?tab=permits`);
    if (cad) add(`dd-${d.id}-cad`, `${d.kind} rev ${d.rev} (CAD source)`, 'Design', d.issued, d.author, cad.name, 1800, 14000, d.number, `/delivery/projects/${pid}?tab=permits`);
  }
  for (const w of x.wos) {
    if (w.state === 'Planned') continue;
    add(`rams-${w.id}`, `RAMS and method statement — ${w.title}`, 'Method statements and safety', w.start - 5 * DAY, w.crew, `${w.id}_RAMS.pdf`, 220, 980, w.changeId, `/delivery/work-orders/${w.id}`);
    if (w.state === 'Done') add(`done-${w.id}`, `Completion sign-off — ${w.id}`, 'Method statements and safety', w.end, w.crew, `${w.id}_completion.pdf`, 160, 2600, w.id, `/delivery/work-orders/${w.id}`);
  }
  for (const t of x.tests) {
    if (t.state === 'Passed') add(`cx${t.level}`, `L${t.level} test certificate — ${t.name}`, 'Test and commissioning', t.due, t.witness, `${pid}_L${t.level}_certificate.pdf`, 300, 3800, `L${t.level}`, `/delivery/projects/${pid}?tab=commissioning`);
    else if (t.state === 'Failed' || (t.state === 'Scheduled' && t.snags)) add(`snag${t.level}`, `L${t.level} snag list (${t.snags} open)`, 'Test and commissioning', Math.min(t.due, now), t.witness, `${pid}_L${t.level}_snags.xlsx`, 40, 180, `L${t.level}`, `/delivery/projects/${pid}?tab=commissioning`);
  }
  for (const c of x.cos) add(`co-${c.id}`, `Change order ${c.id} — ${c.title}`, 'Change control', c.raisedAt, c.raisedBy, `${c.id}.pdf`, 90, 320, c.id, `/delivery/projects/${pid}?tab=cost`);
  if (x.delivered) {
    const at = Math.min(x.finish, now);
    add('ho', 'Handover certificate', 'Handover', at, x.manager, `${pid}_handover-certificate.pdf`, 120, 340, pid);
    add('om', 'O&M manuals and warranties', 'Handover', at, x.manager, `${pid}_O-and-M.zip`, 18000, 96000, pid);
    add('rec', 'As-built record set', 'Handover', at, x.manager, `${pid}_as-built-records.zip`, 12000, 64000, pid);
  }
  return [...out, ...x.added].sort((a, b) => b.file.at - a.file.at);
}
