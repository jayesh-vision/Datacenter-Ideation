import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { usePage, PageHead } from '../shell/page';
import { Tabs, Empty } from '../ui/kit';
import '../styles/help.css';

/* Help & FAQ (user, 21-Oct-2026: "add a FAQ section as a menu and keep all the docs related to Datacenter in this help
   section"). One place for every Datacenter document (the HTML guides served from app/public, the downloads) and the
   questions people ask first. A document opens inside the app in a reader (`?tab=docs&doc=<id>`), with its sections as
   chips (the guides read their `#hash` on load) and an "Open in new tab" link; downloads open directly.
   Facility integration tab (`?tab=survey`, user 26-Oct-2026): the site integration survey (`/site-integration-survey.html`, source in
   docs/) that captures what we need to connect one datacenter's BMS, power, cooling and server BMCs through the on-site
   collector. It keeps surveys in the browser and moves them between people as JSON files.
   Customer guide tab (`?tab=customer`, user 27-Oct-2026): the customer engagement guide (`/customer-guide.html`) framed in embed
   mode; its own search, `?q=` and `#e-<id>` links work inside the frame (`q` / `s` on this page pass through). */

type Tab = 'faq' | 'docs' | 'survey' | 'customer';
const SURVEY = '/site-integration-survey.html';
const CUSTOMER = '/customer-guide.html';
interface Doc {
  id: string; title: string; blurb: string; href: string; icon: I.LucideIcon; group: string;
  sections?: { label: string; hash: string }[]; download?: boolean; route?: string; files?: { label: string; href: string }[];
}

const GROUPS: Record<string, { title: string; sub: string }> = {
  understand: { title: 'Understand the product', sub: 'What the screens show, how the numbers are made, and the story behind the demo' },
  data: { title: 'Data', sub: 'How the records connect, what a customer must send, and the estate as workbooks' },
  integrate: { title: 'Integrate and embed', sub: 'Where Datacenter sits in the platform and how its screens are opened from it' }
};

const DOCS: Doc[] = [
  { id: 'field-guide', group: 'understand', icon: I.BookOpen, href: '/field-guide.html', title: 'Field guide',
    blurb: 'Glossary of every term, how the pieces fit together, the questions customers ask, every metric with its source, the inventory a datacenter needs, and flashcards.',
    sections: [['Glossary', 'glossary'], ['How it fits together', 'explain'], ['Customer questions', 'questions'], ['Metrics & sources', 'metrics'], ['Inventory', 'inventory'], ['Flashcards', 'cards']].map(([label, hash]) => ({ label, hash })) },
  { id: 'customer-guide', group: 'understand', icon: I.Handshake, href: '/customer-guide.html', title: 'Customer engagement guide',
    blurb: 'How to present SynapseDC to a datacenter customer (colocation as the example): the step-by-step journey, pitch and value, discovery questions, their systems, onboarding data and integrations. Search any keyword or problem.',
    sections: [['Journey', 'journey'], ['Pitch & value', 'pitch'], ['Colocation', 'colo'], ['Discovery', 'discovery'], ['Tools', 'tools'], ['Data', 'data'], ['Integrations', 'integ'], ['Objections', 'objections'], ['Templates', 'templates']].map(([label, hash]) => ({ label, hash })) },
  { id: 'gpu-anatomy', group: 'understand', icon: I.Cpu, href: '/gpu-anatomy.html', title: 'GPU datacenter anatomy',
    blurb: 'Understand GPUs from the chip to the building: how they are packaged and bought, how a failure travels through the cluster, how to size one, and the GPU vocabulary.',
    sections: [['Chip to building', 'zoom-h'], ['Packaged and bought', 'buy-h'], ['Follow a failure', 'sim-h'], ['Size a cluster', 'calc-h'], ['Glossary', 'g-h']].map(([label, hash]) => ({ label, hash })) },
  { id: 'demo-playbook', group: 'understand', icon: I.Clapperboard, href: '/demo-playbook.html', title: 'Demo playbook',
    blurb: '"The 13:20 call": one afternoon in a datacenter operations team told in eleven acts, with the same story for every persona and deep links into the tool.' },
  { id: 'personas', group: 'understand', icon: I.Users, href: '/datacenter-personas.html', title: 'Datacenter personas',
    blurb: 'The four business models one estate can run under (network operator, colocation, cloud, enterprise) plus NeoCloud, their roles, equipment categories and what changes on screen.' },
  { id: 'overview', group: 'understand', icon: I.FileText, href: '/dco-platform-overview.pdf', title: 'Platform overview', download: true,
    blurb: 'The one-document overview of Datacenter Ops for people outside the team.',
    files: [{ label: 'PDF', href: '/dco-platform-overview.pdf' }, { label: 'Word', href: '/dco-platform-overview.docx' }] },
  { id: 'data-model', group: 'data', icon: I.Waypoints, href: '/data-model.html', route: '/data-model', title: 'Data model',
    blurb: 'Every entity from region to cable and how they connect: ontology, full map and containment hierarchy, with fields marked Import, Live or Derived.' },
  { id: 'template', group: 'data', icon: I.FileSpreadsheet, href: '/downloads/dco-inventory-import-template.xlsx', download: true, title: 'Inventory import template',
    blurb: 'What a customer sends to onboard their datacenters: one sheet per entity, a field dictionary, lookups and summary checks, with two illustrative sites filled in.' },
  { id: 'backup', group: 'data', icon: I.DatabaseBackup, href: '/downloads/dco-data-backup/dco-backup-neocloud-us-2026-10-12.xlsx', download: true, title: 'Estate data backups',
    blurb: 'The whole mock estate in the import template layout, one workbook per persona and geography, with snapshot sheets of alarms, incidents and changes.',
    files: (['network', 'colocation', 'cloud', 'enterprise', 'neocloud'] as const).flatMap(p => (['in', 'us'] as const).map(g => ({ label: `${p[0].toUpperCase()}${p.slice(1)} · ${g === 'in' ? 'India' : 'USA'}`, href: `/downloads/dco-data-backup/dco-backup-${p}-${g}-2026-10-12.xlsx` }))) },
  { id: 'brd', group: 'understand', icon: I.FileText, href: '/brd.html', title: 'Business requirements (BRD)',
    blurb: 'The SynapseDC BRD: business case, the module split against the existing platform (build / analytics-only / integrate), colocation + NeoCloud first, 12 module chapters with business rules, 472 functional requirements, user stories, integrations per platform module, data, NFRs, phasing, risks. Searchable by requirement id or term.',
    sections: [['Summary', '1'], ['Module split', '3'], ['Business models', '5'], ['Command Center', '7-1'], ['Datacenters', '7-2'], ['Facilities', '7-3'], ['GPU Fleet', '7-4'], ['Alarms & incidents', '7-5'], ['Revenue', '7-6'], ['Security Ops', '7-7'], ['Capacity', '7-8'], ['Planner', '7-9'], ['DCIM', '7-10'], ['Compliance', '7-11'], ['Cross-cutting', '7-12'], ['Modules via API', '3-5'], ['What we build', '3-6'], ['Integrations', '9'], ['Phasing', '12'], ['Realisation & stack', '17'], ['Index', 'appendix-a'], ['Screens & features', 'appendix-b'], ['API responses', '9-11']].map(([label, hash]) => ({ label, hash })) },
  { id: 'integration', group: 'integrate', icon: I.Blocks, href: '/integration-guide.html', title: 'Integration guide',
    blurb: 'Which platform modules the Datacenter solution builds on (30 across Plan to Build, Supply Chain, BSS, ITSM and the Ops Toolkit), the journeys, who owns each record, and the technical data-source guide.',
    sections: [['Platform map', 'map'], ['Journeys', 'journeys'], ['Modules', 'modules'], ['Screens × modules', 'matrix'], ['Ownership', 'ownership'], ['Waves', 'waves'], ['Technical guide', 'tech']].map(([label, hash]) => ({ label, hash })) },
  { id: 'interfaces', group: 'integrate', icon: I.Cable, href: '/interface-spec.html', title: 'Interface specification',
    blurb: 'How SynapseDC talks to the systems above and below it: northbound REST API, events (webhooks, Kafka), ITSM, paging, BSS, export, SIEM and embed; southbound collector, protocols, ports, intervals and alarm normalisation. Searchable.',
    sections: [['Interface map', 'overview'], ['Register', 'register'], ['REST API', 'nb-rest'], ['Events', 'nb-events'], ['ITSM', 'nb-itsm'], ['Platform modules', 'ew'], ['Collector', 'sb-collector'], ['Southbound sources', 'sb-sources'], ['Normalisation', 'sb-normalise'], ['Ports', 'ports']].map(([label, hash]) => ({ label, hash })) },
  { id: 'embed', group: 'integrate', icon: I.AppWindow, href: '/embed-guide.html', title: 'Embed guide',
    blurb: 'Every screen URL with its parameters, how to open a screen without the menu (shell=false), pick the persona and geography from the link, and the sub-menu URLs.' },
  { id: 'platform-menu', group: 'integrate', icon: I.LayoutGrid, href: '/platform-menu.html', title: 'Platform menu',
    blurb: 'Where each Datacenter screen sits in the platform launcher (Plan to Build, Ops Toolkit, ITSM, BSS, Intelligence Hub, Platform Engineering) with its sub-menus and embed URL.' }
];

interface Faq { cat: string; q: string; a: string; links?: { label: string; to: string }[] }
const FAQ: Faq[] = [
  { cat: 'Getting started', q: 'What does Datacenter Ops do?', a: 'It runs a datacenter estate from one place: what is happening (alarms, incidents), what it affects (services, customers, revenue), why (root cause) and what to do next. The flow every screen follows is estate → datacenter → infrastructure → connectivity → services → customers → events → impact → diagnosis → recommended action. Plan & Build adds planning, capacity, IP, DCIM, delivery and work orders.', links: [{ label: 'Command center', to: '/' }, { label: 'Field guide · How it fits together', to: '/help?tab=docs&doc=field-guide&s=explain' }] },
  { cat: 'Getting started', q: 'What are personas and geographies?', a: 'One estate, five business models: network operator, colocation, cloud, enterprise and NeoCloud (GPU as a service). The persona changes vocabulary, customers, services and rack contents; sites, power, cooling and alarms are shared. Geography (India or the USA) relabels the same 24 sites, people, currency and dates. Both switches sit in the top bar and can be fixed in a link with ?persona= and ?geo=.', links: [{ label: 'Datacenter personas', to: '/help?tab=docs&doc=personas' }, { label: 'Embed guide', to: '/help?tab=docs&doc=embed' }] },
  { cat: 'Getting started', q: 'Is this real data?', a: 'No. Everything is a seeded mock estate generated in the browser; there is no backend, collector or login. Every count is derived from the entities (devices, interfaces, links, services, alarms), never typed in, so the figures reconcile across screens. Opstral AI answers, root causes and forecasts are deterministic logic over the same data.', links: [{ label: 'Data model', to: '/data-model' }] },
  { cat: 'Getting started', q: 'Where is the demo script?', a: 'The demo playbook tells "The 13:20 call" in eleven acts, from the first alarm to the recommended action and the AI cluster, with the same story for every persona and "Open in tool" links into the screens.', links: [{ label: 'Demo playbook', to: '/help?tab=docs&doc=demo-playbook' }] },
  { cat: 'Operations', q: 'Why does an alarm not count against a datacenter?', a: 'Only alarms in a datacenter\'s scope count: inside it (facility, racked devices, internal links), on a link leaving it (counts for both ends) or on something it depends on outside (far-end node, shared AAA/NTP, collectors). Remote sites that depend ON the datacenter are never counted; when the datacenter is the cause they appear as impact under the incident.', links: [{ label: 'Datacenters', to: '/datacenters' }, { label: 'Alerts', to: '/alerts' }] },
  { cat: 'Operations', q: 'How is revenue impact calculated?', a: 'A service is down, degraded or exposed (riding a critical fault). Each impacted service is charged to one issue, its most severe cause. Loss = the monthly charge ÷ 730 hours (× 0.3 when degraded) × hours since the alarm began, plus the SLA credit tier the impacted minutes push the customer into. Every total reconciles: issues = causes = datacenters = customers.', links: [{ label: 'Revenue impact', to: '/revenue' }, { label: 'Field guide · Metrics & sources', to: '/help?tab=docs&doc=field-guide&s=metrics' }] },
  { cat: 'Operations', q: 'Where do incidents come from and what do the severities mean?', a: 'Incidents are opened from alarms by the mock operations model; there is no manual "raise incident". They carry Critical, High, Medium or Low; alarms keep Critical, Major, Minor and Warning. Changes, maintenance and problems are tracked in Change management and under Incidents → Problems.', links: [{ label: 'Incidents', to: '/incidents' }, { label: 'Change management', to: '/changes' }] },
  { cat: 'Operations', q: 'What is the difference between the schematic and the realistic digital twin?', a: 'Both live on a datacenter\'s Overview tab and show the same layout, attention roll-up and drill path building → floor → room → rack → device. The schematic view is the signed-off abstract twin; the realistic view adds textured racks, plant, containment, overlays (health, temperature, rack power, connectivity), power and cable paths, a device popup and a street-view Walk mode.', links: [{ label: 'Datacenters', to: '/datacenters' }] },
  { cat: 'Operations', q: 'How does power reach a device, and how is a cable routed?', a: 'Facilities → Power & backup draws the path utility feed → transfer switch → UPS → busway → rack PDU → outlet → power supply; a device\'s Power & cabling tab shows its own cords and its cables through patch panels, trunks and the ODF to the far end. Single points of failure (both cords on one side, a tripped PDU, no cooling spare) are listed per site with a what-if.', links: [{ label: 'Facilities', to: '/facilities' }] },
  { cat: 'GPU Fleet', q: 'What does GPU Fleet show?', a: 'The GPU estate for personas that have one (cloud, enterprise, NeoCloud): clusters, pods, nodes, jobs, DCGM-style telemetry per GPU (utilisation, memory, temperature, power, ECC, Xid, NVLink), faults and the GPU time they cost. GPU time lost counts productive GPU hours (a stalled job × all its GPUs, a slowed job × the share lost, idle allocations); revenue impact counts what customers are billed.', links: [{ label: 'GPU Fleet', to: '/gpu' }, { label: 'GPU datacenter anatomy', to: '/help?tab=docs&doc=gpu-anatomy' }] },
  { cat: 'GPU Fleet', q: 'Why is GPU Fleet missing from my menu?', a: 'The item appears only when the estate has GPU infrastructure. The network-operator persona runs no GPUs, so GPU Fleet and the datacenter GPU tab are hidden there. Switch to cloud, enterprise or NeoCloud in the top bar.', links: [{ label: 'GPU Fleet', to: '/gpu' }] },
  { cat: 'GPU Fleet', q: 'What does a GPU-hour cost in power, and what do we pay for idle megawatts?', a: 'Capacity → Power → Power economics prices every site\'s power: tariff × live load plus the capacity charge of its contract (a utility demand charge on the take-or-pay floor, or a colocation block billed per committed kW), so it shows committed versus peak, idle committed power and its monthly cost, and the cost per sold MW. GPU Fleet → Cooling & power turns the same figures into power cost per installed and per sold GPU-hour by pod, against the price per GPU-hour. Tariffs are published state averages until a customer supplies its own.', links: [{ label: 'Power economics', to: '/capacity?tab=economics' }, { label: 'GPU Fleet · Cooling & power', to: '/gpu?gtab=cooling' }] },
  { cat: 'GPU Fleet', q: 'Which GPU models are in the estate?', a: 'NVIDIA B200, H200, H100, A100, L40S and T4, and Intel Gaudi 3 and Data Center GPU Max 1550. One model per pod; L40S and T4 pods run inference only. The GPU models tab lists vendor, memory, power, scale-up link, fabric and the server each OEM ships it in.', links: [{ label: 'GPU models', to: '/gpu?gtab=models' }] },
  { cat: 'Plan & Build', q: 'How do Planner, Delivery, DCIM, Capacity and IP & Network fit together?', a: 'A plan is designed and approved in Planner; starting the build hands it to Delivery as a project with milestones, work orders, purchase orders and commissioning tests L1 to L5. Approved plans hold capacity (Capacity → Reservations) and create the IP and DCIM records in the plan pack. Every DCIM edit runs under a change request from Change management, and handover completes the plan.', links: [{ label: 'Planner', to: '/planning' }, { label: 'Delivery', to: '/delivery' }, { label: 'DCIM', to: '/dcim' }] },
  { cat: 'Plan & Build', q: 'What are the sub-menus under Planner, Capacity, DCIM and the others?', a: 'Each Plan & Build screen opens its sections from the left menu instead of a row of tabs: Planner has Insights, Plans, Templates and Benchmarks; Capacity has Insights, Power, Space, Network, Compute and Reservations; DCIM has Insights, Sites, Racks, Devices, Cabling, Power, Catalogue and Changes. Analytics strips sit on the Insights sub-menu only. The same URLs are used by the platform launcher.', links: [{ label: 'Platform menu', to: '/help?tab=docs&doc=platform-menu' }] },
  { cat: 'Plan & Build', q: 'Why does a DCIM change need a change request?', a: 'Every DCIM edit (new rack, install, move, connect, power feed) is record work on live infrastructure, so it is tagged with a CR: a pre-approved standard change for patch cords and labels, an open approved CR at the site, or a new CR that waits for approval and is executed from DCIM once approved. A site under an incident freeze refuses standard changes.', links: [{ label: 'DCIM · Changes', to: '/dcim?tab=changes' }, { label: 'Change management', to: '/changes' }] },
  { cat: 'Data & integration', q: 'How do I onboard my own datacenter data?', a: 'Fill the inventory import template: one sheet per entity from sites and floors down to racks, plant, devices, interfaces, links, GPUs, customers and services, with a field dictionary, dropdown lookups and summary checks. The field guide\'s Inventory tab explains why monitoring depends on this inventory and the order to onboard it in.', links: [{ label: 'Import template', to: '/downloads/dco-inventory-import-template.xlsx' }, { label: 'Field guide · Inventory', to: '/help?tab=docs&doc=field-guide&s=inventory' }] },
  { cat: 'Data & integration', q: 'How do the records connect to each other?', a: 'The data model explorer shows every entity from region to cable, its fields marked Import, Live or Derived, and the relationships between them in three views: ontology around one entity, the full map by domain, and the containment hierarchy. Record counts follow the persona.', links: [{ label: 'Data model', to: '/data-model' }] },
  { cat: 'Data & integration', q: 'Which platform modules does Datacenter integrate with?', a: 'Thirty modules across Plan to Build, Supply Chain, BSS, Services & ITSM and the Opstral Ops Toolkit. Where a function overlaps, the platform module owns the record and Datacenter reads it; the integration guide lists each module, the journeys, the screens × modules matrix, ownership and the delivery waves, plus the technical data-source guide.', links: [{ label: 'Integration guide', to: '/help?tab=docs&doc=integration' }] },
  { cat: 'Data & integration', q: 'How will the BMS, UPS, cooling and server data be collected?', a: 'One collector runs inside each datacenter, as a VM on the customer\'s virtualization or a small appliance in a management rack. It reads read-only: the BMS over BACnet (or Modbus / OPC UA), UPS and rack PDUs over SNMP, meters, generators and transfer switches over Modbus, servers through their BMC over Redfish, GPUs from DCGM. It sends the readings out over one HTTPS connection; nothing connects in. The Facility integration tab lists everything to collect from the customer before a site is connected.', links: [{ label: 'Facility integration', to: '/help?tab=survey' }, { label: 'Integration guide · Technical guide', to: '/help?tab=docs&doc=integration&s=tech' }] },
  { cat: 'Embedding', q: 'How do I open a screen inside the platform without the menu?', a: 'Add ?shell=false to any screen URL to hide the left menu and the top bar for an iframe; ?persona= and ?geo= fix the persona and geography. Every route and its parameters, including the sub-menu URLs, are in the embed guide; the platform menu page shows where each card goes.', links: [{ label: 'Embed guide', to: '/help?tab=docs&doc=embed' }, { label: 'Platform menu', to: '/help?tab=docs&doc=platform-menu' }] }
];
const CATS = [...new Set(FAQ.map(f => f.cat))];

const TABS: { id: Tab; label: string; icon: I.LucideIcon; count?: number }[] = [
  { id: 'faq', label: 'FAQ', icon: I.CircleHelp, count: FAQ.length },
  { id: 'docs', label: 'Documents', icon: I.Library, count: DOCS.length },
  { id: 'customer', label: 'Customer guide', icon: I.Handshake },
  { id: 'survey', label: 'Facility integration', icon: I.ClipboardList }
];

export function Help() {
  const [sp, setSp] = useSearchParams();
  const t0 = sp.get('tab');
  const tab: Tab = t0 === 'docs' || t0 === 'survey' || t0 === 'customer' ? t0 : 'faq';
  const doc = DOCS.find(d => d.id === sp.get('doc') && !d.download);
  const section = sp.get('s') ?? '';
  usePage([{ label: 'Help & FAQ' }, ...(tab === 'docs' ? [{ label: doc ? doc.title : 'Documents' }] : tab === 'survey' ? [{ label: 'Facility integration' }] : tab === 'customer' ? [{ label: 'Customer guide' }] : [])]);
  const customerSrc = `${CUSTOMER}?embed=1${sp.get('q') ? `&q=${encodeURIComponent(sp.get('q')!)}` : ''}${section ? `#${section}` : ''}`;
  const set = (patch: Record<string, string | null>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } setSp(n, { replace: true }); };
  const open = (d: Doc, s?: string) => set({ tab: 'docs', doc: d.id, s: s ?? null });

  return (
    <div className="page help">
      <PageHead title="Help & FAQ" sub="Answers to the questions people ask first, and every Datacenter document in one place: guides, glossary, GPU anatomy, data model, downloads and integration."
        actions={tab === 'customer' ? <a className="nst-btn nst-btn--sm" href={customerSrc.replace('?embed=1&', '?').replace('?embed=1', '')} target="_blank" rel="noreferrer"><I.ExternalLink size={15} />Open in new tab</a> : tab === 'survey' ? <a className="nst-btn nst-btn--sm" href={SURVEY} target="_blank" rel="noreferrer"><I.ExternalLink size={15} />Open in new tab</a> : doc && <>
          <button type="button" className="nst-btn nst-btn--sm" onClick={() => set({ doc: null, s: null })}><I.ArrowLeft size={15} />All documents</button>
          <a className="nst-btn nst-btn--sm" href={`${doc.href}${section ? `#${section}` : ''}`} target="_blank" rel="noreferrer"><I.ExternalLink size={15} />Open in new tab</a>
        </>} />
      <Tabs value={tab} onChange={t => set({ tab: t === 'faq' ? null : t, doc: null, s: null, q: null })} tabs={TABS} />
      {tab === 'faq' ? <FaqView open={open} /> : tab === 'survey' ? <SurveyView /> : tab === 'customer' ? <CustomerView src={customerSrc} /> : doc ? <Reader doc={doc} section={section} onSection={s => set({ s })} /> : <Library open={open} />}
    </div>
  );
}

function FaqView({ open }: { open: (d: Doc, s?: string) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return FAQ.filter(f => (!cat || f.cat === cat) && (!t || `${f.q} ${f.a} ${f.cat}`.toLowerCase().includes(t)));
  }, [q, cat]);
  return (
    <section className="vw-card-section help-faq">
      <div className="help-faq-tb">
        <label className="lt-search"><I.Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search questions" aria-label="Search questions" />{q && <button type="button" className="lt-x" onClick={() => setQ('')} aria-label="Clear search"><I.X size={14} /></button>}</label>
        <div className="pills help-cats">
          <button type="button" className={`pill${!cat ? ' is-active' : ''}`} onClick={() => setCat('')}>All <span className="count">{FAQ.length}</span></button>
          {CATS.map(c => <button key={c} type="button" className={`pill${cat === c ? ' is-active' : ''}`} onClick={() => setCat(cat === c ? '' : c)}>{c} <span className="count">{FAQ.filter(f => f.cat === c).length}</span></button>)}
        </div>
      </div>
      {shown.length === 0 ? <Empty icon={I.SearchX} title="No question matches">Try another word, or browse the documents.</Empty> : (
        <div className="help-qs">
          {shown.map(f => (
            <details key={f.q} className="help-q" open={shown.length <= 2 || undefined}>
              <summary><span className="help-q-cat">{f.cat}</span><span className="help-q-t">{f.q}</span><I.ChevronDown size={16} className="help-q-chev" /></summary>
              <div className="help-a">
                <p>{f.a}</p>
                {f.links && <div className="help-a-links">{f.links.map(l => <FaqLink key={l.to} to={l.to} open={open}>{l.label}</FaqLink>)}</div>}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

/* a FAQ link into this screen's reader opens the document in place; others are ordinary links */
function FaqLink({ to, open, children }: { to: string; open: (d: Doc, s?: string) => void; children: ReactNode }) {
  if (to.startsWith('/help?')) {
    const p = new URLSearchParams(to.slice(6)); const d = DOCS.find(x => x.id === p.get('doc'));
    if (d) return <button type="button" className="help-chip help-link" onClick={() => open(d, p.get('s') ?? undefined)}><d.icon size={13} />{children}</button>;
  }
  if (to.startsWith('/downloads/')) return <a className="help-chip help-link" href={to} download><I.Download size={13} />{children}</a>;
  return <Link className="help-chip help-link" to={to}><I.ArrowUpRight size={13} />{children}</Link>;
}

function Library({ open }: { open: (d: Doc, s?: string) => void }) {
  return (
    <div className="help-lib">
      {Object.entries(GROUPS).map(([g, meta]) => (
        <section key={g} className="help-group">
          <div className="help-group-h"><h2>{meta.title}</h2><p className="muted">{meta.sub}</p></div>
          <div className="help-cards">
            {DOCS.filter(d => d.group === g).map(d => <DocCard key={d.id} d={d} open={open} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function DocCard({ d, open }: { d: Doc; open: (d: Doc, s?: string) => void }) {
  const Ic = d.icon;
  const main = d.download
    ? <a className="nst-btn nst-btn--sm nst-btn--primary" href={d.href} download><I.Download size={15} />Download</a>
    : <button type="button" className="nst-btn nst-btn--sm nst-btn--primary" onClick={() => open(d)}><I.BookOpenText size={15} />Read</button>;
  return (
    <article className={`vw-card-section help-card${d.download ? '' : ' is-doc'}`} onClick={d.download ? undefined : () => open(d)}>
      <div className="help-card-h"><span className="help-card-ic"><Ic size={20} /></span><h3>{d.title}</h3></div>
      <p className="help-card-b">{d.blurb}</p>
      {d.sections && <div className="help-card-secs">{d.sections.map(s => <button key={s.hash} type="button" className="help-chip" onClick={e => { e.stopPropagation(); open(d, s.hash); }}>{s.label}</button>)}</div>}
      {d.files && d.files.length > 2 && <div className="help-card-secs">{d.files.map(f => <a key={f.href} className="help-chip" href={f.href} download onClick={e => e.stopPropagation()}><I.Download size={12} />{f.label}</a>)}</div>}
      <div className="help-card-f" onClick={e => e.stopPropagation()}>
        {d.files && d.files.length <= 2 ? d.files.map(f => <a key={f.href} className="nst-btn nst-btn--sm nst-btn--primary" href={f.href} download><I.Download size={15} />{f.label}</a>) : main}
        {d.route && <Link className="nst-btn nst-btn--sm" to={d.route}><I.AppWindow size={15} />Open the screen</Link>}
        {!d.download && <a className="nst-btn nst-btn--sm" href={d.href} target="_blank" rel="noreferrer"><I.ExternalLink size={15} />New tab</a>}
      </div>
    </article>
  );
}

function SurveyView() {
  return (
    <section className="vw-card-section help-reader">
      <div className="help-reader-h">
        <span className="help-card-ic"><I.ClipboardList size={20} /></span>
        <div style={{ minWidth: 0 }}>
          <h3>Facility integration</h3>
          <p className="muted">One survey per datacenter: where the collector goes, the BMS, power and cooling equipment, server BMCs, firewall rules, the records we need and the sign-off. Each survey keeps a list of what is still missing or awaited. Surveys are saved in this browser; Download JSON and Import JSON move one between people.</p>
        </div>
      </div>
      <div className="help-frame"><iframe src={SURVEY} title="Facility integration" /></div>
    </section>
  );
}

function CustomerView({ src }: { src: string }) {
  return (
    <section className="vw-card-section help-reader">
      <div className="help-reader-h">
        <span className="help-card-ic"><I.Handshake size={20} /></span>
        <div style={{ minWidth: 0 }}>
          <h3>Customer engagement guide</h3>
          <p className="muted">How to present SynapseDC to a datacenter customer, colocation as the worked example: the 10-step journey, pitch and value, discovery questions, their systems and tools, onboarding data, integrations, objections and templates. Search any keyword or problem inside the guide.</p>
        </div>
      </div>
      <div className="help-frame"><iframe key={src} src={src} title="Customer engagement guide" /></div>
    </section>
  );
}

function Reader({ doc, section, onSection }: { doc: Doc; section: string; onSection: (s: string) => void }) {
  const Ic = doc.icon;
  const src = `${doc.href}${doc.id === 'data-model' ? '?embed=1' : ''}${section ? `#${section}` : ''}`;
  return (
    <section className="vw-card-section help-reader">
      <div className="help-reader-h">
        <span className="help-card-ic"><Ic size={20} /></span>
        <div style={{ minWidth: 0 }}>
          <h3>{doc.title}</h3>
          <p className="muted">{doc.blurb}</p>
        </div>
        {doc.sections && <div className="help-reader-secs">{doc.sections.map(s => <button key={s.hash} type="button" className={`help-chip${section === s.hash ? ' is-active' : ''}`} onClick={() => onSection(s.hash)}>{s.label}</button>)}</div>}
      </div>
      <div className="help-frame"><iframe key={src} src={src} title={doc.title} /></div>
    </section>
  );
}
