/* Public data API for the UI. Every function is async and returns plain JSON
   shapes from ./types. Today they resolve against the in-memory mock in
   src/mock/; to go live, replace each body with a fetch to the matching REST
   endpoint (suggested paths in the comments) and keep the signatures. */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as S from '../mock/server';
import { ask, suggestions, type Answer, type Ctx } from '../mock/sentinel';
import type { ActionStep, CapacityPlan, Change, ChangeStatus, Persona, ReconTask } from './types';
import { PERSONAS, PERSONA_BY_ID, type PersonaDef, type PersonaVocab } from '../mock/personas';
import { GEOS, GEO_BY_ID, type Geo, type GeoDef } from '../mock/geo';

const LATENCY = 90;
const wait = <T,>(f: () => T): Promise<T> => new Promise(res => setTimeout(() => res(structuredClone(f())), LATENCY));
const mutate = <T,>(f: () => T): Promise<T> => new Promise(res => setTimeout(() => res(f()), 60));

/* change feed: a real backend would push this over SSE / websocket */
export const onDataChange = S.subscribe;
export const clockNow = () => S.now();

/* ---- persona (datacenter business model): one setting for the whole estate */
export const getPersona = (): Persona => S.getPersona();                                            // GET /settings/persona
export const setPersona = (p: Persona) => mutate(() => S.setPersona(p));                             // PUT /settings/persona
export { PERSONAS, PERSONA_BY_ID };
export type { PersonaDef, PersonaVocab };
/* synchronous vocabulary for render-time strings in components that already refetch on data change */
export const vocabNow = (): PersonaVocab => PERSONA_BY_ID[S.getPersona()].vocab;
export function usePersona(): { persona: Persona; def: PersonaDef; vocab: PersonaVocab } {
  const [p, setP] = useState<Persona>(S.getPersona());
  useEffect(() => onDataChange(() => setP(S.getPersona())), []);
  return { persona: p, def: PERSONA_BY_ID[p], vocab: PERSONA_BY_ID[p].vocab };
}

/* ---- geography (India / USA): places, customers, people, currency — one setting for the whole estate */
export const getGeo = (): Geo => S.getGeo();                                                        // GET /settings/geography
export const setGeo = (g: Geo) => mutate(() => S.setGeo(g));                                         // PUT /settings/geography
export { GEOS, GEO_BY_ID };
export type { Geo, GeoDef };
export const geoNow = (): GeoDef => S.geoDef();
export function useGeo(): { geo: Geo; def: GeoDef } {
  const [g, setG] = useState<Geo>(S.getGeo());
  useEffect(() => onDataChange(() => setG(S.getGeo())), []);
  return { geo: g, def: GEO_BY_ID[g] };
}
/* the first site of the active geography — the default where a screen needs a datacenter */
export const defaultDcId = () => S.heroDcId();
export const heroNeId = () => S.heroNeId();

/* ---- estate & inventory */
export const getEstate = () => wait(S.estate);                                                     // GET /estate
export const getLocations = (q: Parameters<typeof S.locations>[0] = {}) => wait(() => S.locations(q)); // GET /locations?kind&status&circle
export const getDatacenters = () => wait(S.datacenters);                                           // GET /datacenters
export const getDatacenter = (id: string) => wait(() => S.datacenter(id));                         // GET /datacenters/:id
export const getNetworkElements = (q: Parameters<typeof S.networkElements>[0] = {}) => wait(() => S.networkElements(q)); // GET /network-elements?dcId
export const getNetworkElement = (id: string) => wait(() => S.networkElement(id));                // GET /network-elements/:id
export const getInterfaces = (neId: string) => wait(() => S.interfacesOf(neId));                   // GET /network-elements/:id/interfaces
export const getLinks = (q: Parameters<typeof S.linksOf>[0] = {}) => wait(() => S.linksOf(q));      // GET /links?neId&dcId&protocol
export const getLink = (id: string) => wait(() => S.link(id));                                     // GET /links/:id
export const getTopology = (dcId: string) => wait(() => S.topology(dcId));                         // GET /datacenters/:id/topology

/* ---- services & customers */
export const getServices = (q: Parameters<typeof S.servicesOf>[0] = {}) => wait(() => S.servicesOf(q)); // GET /services?dcId&neId&customerId
export const getService = (id: string) => wait(() => S.service(id));                               // GET /services/:id
export const getCustomers = () => wait(S.customers);                                               // GET /customers
export const getCustomer = (id: string) => wait(() => S.customer(id));                             // GET /customers/:id

/* ---- events & operations */
export const getAlerts = (q: Parameters<typeof S.alerts>[0] = {}) => wait(() => S.alerts(q));       // GET /alerts?dcId&neId&severity&state&scope (dc|downstream|all)
export const getIncidents = (q: Parameters<typeof S.incidents>[0] = {}) => wait(() => S.incidents(q)); // GET /incidents
export const getIncident = (id: string) => wait(() => S.incident(id));                             // GET /incidents/:id
export const getChanges = (q: Parameters<typeof S.changes>[0] = {}) => wait(() => S.changes(q));   // GET /changes
export const previewChangeImpact = (scope: string[], dcId: string, excludeId?: string) => wait(() => S.changeImpact(scope, dcId, excludeId)); // POST /changes/impact-preview
export const getReconciliation = (q: Parameters<typeof S.recon>[0] = {}) => wait(() => S.recon(q)); // GET /reconciliation
export const getAudit = (object?: string) => wait(() => S.audit(object));                          // GET /audit?object
export const getCapacity = (dcId?: string) => wait(() => S.capacity(dcId));                        // GET /capacity?dcId
export const getGpu = (q: Parameters<typeof S.gpu>[0] = {}) => wait(() => S.gpu(q));                // GET /ai-infrastructure?dcId
export const getGpuNode = (neId: string) => wait(() => S.gpuNode(neId));                          // GET /ai-infrastructure/nodes/:id
export const hasGpuNow = (dcId?: string) => S.hasGpu(dcId);
export const getRevenue = (q: Parameters<typeof S.revenue>[0] = {}) => wait(() => S.revenue(q));   // GET /revenue-impact?dcId
export const getCommandCenter = () => wait(S.commandCenter);                                       // GET /command-center
export const search = (q: string) => wait(() => S.search(q));                                       // GET /search?q

/* ---- Sentinel (mock AI) */
export const askSentinel = (q: string, ctx: Ctx): Promise<Answer> => new Promise(res => setTimeout(() => res(ask(q, ctx)), 650)); // POST /sentinel/ask
export const sentinelSuggestions = (ctx: Ctx) => suggestions(ctx);
export type { Answer, Ctx };

/* ---- mutations */
export const ackAlert = (id: string) => mutate(() => S.ackAlert(id));                                             // POST /alerts/:id/ack
export const createIncidentFromAlerts = (ids: string[]) => mutate(() => S.createIncidentFromAlerts(ids));           // POST /incidents
export const advanceIncident = (id: string) => mutate(() => S.advanceIncident(id));                               // POST /incidents/:id/advance
export const addWorklog = (id: string, text: string) => mutate(() => S.addWorklog(id, text));                     // POST /incidents/:id/worklog
export const setActionStatus = (incId: string, stepId: string, to: ActionStep['status']) => mutate(() => S.setAction(incId, stepId, to)); // PATCH /incidents/:id/actions/:step
export const runClosureChecks = (incId: string) => mutate(() => S.runVerification(incId));                         // POST /incidents/:id/verify
export const hypothesisFeedback = (incId: string, idx: number, ok: boolean) => mutate(() => S.hypothesisFeedback(incId, idx, ok)); // POST /incidents/:id/rca/:idx/feedback
export const raiseEmergencyChange = (incId: string) => mutate(() => S.raiseEmergencyChange(incId));               // POST /incidents/:id/emergency-change
export const createChange = (c: Omit<Change, 'id' | 'created' | 'status' | 'risk' | 'requester'>) => mutate(() => S.createChange(c)); // POST /changes
export const setChangeStatus = (id: string, to?: ChangeStatus) => mutate(() => S.setChangeStatus(id, to));        // POST /changes/:id/transition
export const resolveRecon = (id: string, d: NonNullable<ReconTask['decision']>) => mutate(() => S.resolveRecon(id, d)); // POST /reconciliation/:id/resolve
export const assignRecon = (ids: string[], who: string) => mutate(() => S.assignRecon(ids, who));                 // POST /reconciliation/assign
export const runDiscovery = (dcId: string) => mutate(() => S.runDiscovery(dcId));                                 // POST /datacenters/:id/discovery
export const createCapacityPlan = (p: Omit<CapacityPlan, 'id' | 'status'>) => mutate(() => S.createPlan(p));      // POST /capacity/plans
export const resetDemo = () => mutate(() => S.reset());
export const CURRENT_USER = S.ME;

/* ---- hook: load, keep showing stale data while refetching, refetch on change */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => { const n = ++seq.current; setLoading(true); fn().then(d => { if (n === seq.current) { setData(d); setLoading(false); } }); }, deps);
  useEffect(() => { setData(undefined); run(); }, [run]);
  useEffect(() => onDataChange(run), [run]);
  return { data, loading, reload: run };
}
