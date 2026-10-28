# SynapseDC — Business Requirements Document

| | |
| --- | --- |
| **Product** | SynapseDC — datacenter plan, build and operate solution on the platform |
| **Document** | Business Requirements Document (BRD) with functional detail |
| **Version** | 0.9 (draft for review) |
| **Date** | 27 October 2026 |
| **Owner** | Product (SynapseDC) |
| **Status** | Draft — for review by the platform module owners, engineering and the first design partners |
| **Source** | The SynapseDC ideation prototype (every screen, rule and figure referred to below exists there), the Master Requirements Blueprint v0.1, the data sources and integration guide, the interface specification and the customer engagement guide |

**Version history**

| Version | Date | Change |
| --- | --- | --- |
| 0.9 | 27-Oct-2026 | First complete draft: all modules, module split against the existing platform, colocation + NeoCloud first |
| 0.9.3 | 28-Oct-2026 | Help & FAQ and the documents removed (internal reference material, not product scope) |
| 0.9.2 | 28-Oct-2026 | Section 3.5 modules used through their APIs, 3.6 what SynapseDC builds; Appendix B screen-by-screen and feature-by-feature catalogue; Appendix C expected API responses per module |
| 0.9.1 | 28-Oct-2026 | Build boundary made explicit (3.4): existing platform modules are consumed only through their APIs — no new database, backend or screens for them; telemetry ingested and queried only through the OAP telemetry ingestion / consumer service on ClickHouse (9.0) |

**How to read this document**

- Section 1–6 set the business case, the scope and the module split against the existing platform.
- Section 7 holds one chapter per module that is **built** (7.1–7.11) plus the cross-cutting shell capabilities (7.12): purpose, scope, business rules, numbered functional requirements, user stories with acceptance criteria, data, integrations, reports and screens.
- Section 8 holds the **analytics-only** pages that sit over existing platform modules.
- Section 9 lists, per **existing platform module**, what SynapseDC reads from it, sends to it and through which interface.
- Sections 10–15: data, non-functional requirements, phasing, risks and open decisions, traceability, glossary.
- Appendix B: every screen built, tab by tab and feature by feature, with its requirement ids, data source and phase. Appendix C: the expected request and response of every API SynapseDC consumes from the existing modules.

Requirement identifiers: `<PFX>-nnn` (functional), `BRULE-<PFX>-nn` (business rule), `US-<PFX>-nn` (user story), `ARCH-nnn` (build boundary), `NFR-nnn`, `INTG-nnn`, `DATA-nnn`. Priority uses MoSCoW: **M** must, **S** should, **C** could. Model: **Both**, **Colo** (colocation), **Neo** (NeoCloud / GPU cloud). Phase: **P1** MVP, **P2**, **P3** (section 12). Anything the prototype does not yet decide is marked **(to discuss)**.

---

## Contents

- 1 Executive summary
- 2 Business context
  - 2.1 Problem statement
  - 2.2 Goals
  - 2.3 Success criteria for the first release
- 3 Scope and the module split
  - 3.1 Principle
  - 3.2 The split
  - 3.3 Out of scope (all releases unless re-decided)
  - 3.4 Build boundary: consume the platform, build only what is datacenter-specific
  - 3.5 Modules used through their APIs (nothing built)
  - 3.6 What SynapseDC builds, module by module
- 4 Stakeholders, users and roles
- 5 Business models
- 6 Solution overview
  - 6.1 Capability map
  - 6.2 Architecture
  - 6.3 Key design decisions (carried from the prototype)
- 7 Modules built by SynapseDC
- 7.1 Command Center
- 7.2 Datacenters — site page, layout / digital twin, access & security
- 7.3 Facilities — power, cooling, environment & safety, single points of failure, maintenance
- 7.4 GPU Fleet
- 7.5 Datacenter alarm scope, correlation and incident enrichment
- 7.6 Revenue Impact
- 7.7 Datacenter Security Ops
- 7.8 Capacity and power economics
- 7.9 Planner
- 7.10 DCIM — racks, power chain and cabling
- 7.11 Compliance
- 7.12 Cross-cutting: shell, business models, geography, Opstral AI, search
- 8 Analytics-only pages over existing modules
  - 8.1 Programs & Projects insights
  - 8.2 Work orders and process KPIs
  - 8.3 Commissioning L1–L5
  - 8.4 IP & Network insights
  - 8.5 Change management overview
  - 8.6 DCIM Insights
- 9 Integration with the existing platform modules
  - 9.0 Telemetry: OAP ingestion and consumer services (ClickHouse)
  - 9.1 Operate to Acquire (BSS): CRM, Plans & Products Catalog, Orders, Customers, Experience and Care
  - 9.2 Services & ITSM: Incidents, Change Management, Maintenance, Knowledge Center, Tickets
  - 9.3 Opstral Ops Toolkit: System Alerts, Telemetry Ops, Data Ops, Infra Ops, Fin Ops, Proc Bots, Explainability, Security Ops, Service Ops, Agent Ops
  - 9.4 AI Foundry
  - 9.5 Platform Engineering
  - 9.6 Intelligence Hub (except Command Center)
  - 9.7 Plan to Build: Inventory Planning, Inventory, IP Management, Programs & Projects
  - 9.8 Supply Chain: Materials, Vendors, Contracts, Procurement, Warehouses, Field Force Management, Logistics
  - 9.9 Customer-side systems (when the platform module is not used)
  - 9.10 API needs per module (to confirm with each module team)
- 10 Data requirements
  - 10.1 Entity model
  - 10.2 Onboarding data (the import template)
  - 10.3 Retention
- 11 Non-functional requirements
- 12 Phasing and release plan
  - 12.1 Onboarding a customer site (the delivery approach)
  - 12.2 Release contents by chapter
- 13 Assumptions, dependencies, risks and open decisions
  - 13.1 Assumptions
  - 13.2 Dependencies
  - 13.3 Risks
  - 13.4 Open decisions
- 14 Traceability
  - 14.1 Goals → modules
  - 14.2 Blueprint requirement families → BRD chapters
  - 14.3 Requirement index
- 15 Glossary
- 16 Approvals and sign-off
- Appendix A — Requirement index
- Appendix B — Screen and feature catalogue
- Appendix C — Expected API responses from the existing modules

---

## 1 Executive summary

Datacenter operators run their estate on separate tools: a BMS for the building, an NMS for the network, a DCIM for records, a ticketing tool for incidents, spreadsheets for capacity and billing. None of them answers the questions that matter in the first minutes of a fault: *what is failing, who is affected, what is it costing, and what should we do first?* For a GPU cloud the gap is sharper still: a single failed GPU can stop a 152-GPU training job, and nothing today joins the facility, the fabric, the GPU and the job into one picture.

SynapseDC closes that gap on top of the platform the customer already runs. It adds the datacenter-specific capabilities the platform does not have — the live facility (power, cooling, environment), the physical last mile (which UPS feeds which rack, which cable carries which service), the GPU fleet and its jobs, datacenter alarm scope and correlation, the revenue impact of every open issue, capacity and power economics, a planner for new capacity, DCIM records for racks, power chains and cabling, datacenter security operations and compliance — and it uses the platform's existing modules for everything they already own: CRM, customers, orders and catalogue (Operate to Acquire / BSS), incidents, changes, tickets, maintenance and knowledge (Services & ITSM), alerts, telemetry and security tooling (Opstral Ops Toolkit), AI models (AI Foundry), customisation (Platform Engineering), the data layer (Intelligence Hub) and inventory, IP management, programs and projects (Plan to Build).

**First release targets two business models**: **colocation** (the operator sells power, space and cooling; tenant equipment is never looked into) and **NeoCloud / GPU cloud** (the operator rents GPUs and must keep expensive jobs running). Both share one estate model, one alarm model and one money model; what differs is vocabulary, what is monitored and how value is counted. Cloud, enterprise and telco variants follow.

**Headline outcomes**

| Outcome | Measure | Target |
| --- | --- | --- |
| Faster, better-ordered response | Time from first alarm to an incident with impact and a recommended action | ≤ 60 s automated; ordered by money and customers at risk |
| Less revenue lost | Revenue impact of open issues is visible, reconciled and reduced | Every open issue carries lost-to-date, credits exposure and forecast; Σ issues = Σ customers = Σ sites |
| GPU productive time | GPU time lost (stalled, slowed, idle allocations) | Visible per job, customer and site within one polling interval; work-to-redo from the last checkpoint |
| Fewer surprises from the building | Single points of failure, ride-through, cooling spare | Every live site has an SPOF list, a what-if and a ride-through figure |
| Capacity sold with confidence | Net available power / space after holds; power contract findings | Reservations and contract findings on every site |
| One record of the physical estate | Racks, power chain, cabling as records under change control | Every DCIM write carries a change request |

## 2 Business context

### 2.1 Problem statement

1. **Fragmented view.** Facility, network, compute, GPU, security and commercial data live in different tools with different identities. Nobody can see one site end to end.
2. **Impact is guessed.** When a UPS goes on battery or a backhaul link drops, the services and customers affected — and the money at risk — are worked out by hand, after the event.
3. **GPU operations are blind to the building.** GPU clouds see Xid errors and job states, but not that the CDU flow dropped or a rack was power-capped. Facility teams see the CDU, not the job.
4. **Capacity decisions are slow.** Where to place the next 256 GPUs, what a new hall costs, when power runs out — answered with spreadsheets and long cycles.
5. **The physical last mile is undocumented.** Which PSU is on which PDU outlet, which trunk carries which service, which cabinet is single-fed: unknown until a fault proves it.
6. **Power is the largest cost and the least managed.** Take-or-pay floors, demand ratchets and idle colocation blocks are found at invoice time.

### 2.2 Goals

| ID | Goal | How the solution meets it |
| --- | --- | --- |
| G-01 | One operational picture of every datacenter | Command Center and site page: health, areas, alarms in scope, incidents, impact, money |
| G-02 | Impact and cost of every open issue, reconciled | Revenue Impact model charged to one issue per service, Σ across every view |
| G-03 | Keep GPU jobs running | GPU Fleet: per-GPU telemetry, jobs, blast radius, GPU time lost, placement |
| G-04 | Make the building resilient on paper before it fails | Physical last mile, SPOFs, what-if, ride-through, cooling spare, maintenance |
| G-05 | Plan and build capacity faster | Capacity, power economics, Planner with templates, benchmarks, governance, plan pack; hand-off to Programs & Projects |
| G-06 | Keep the estate's records right | DCIM under change control, lifecycle, reconciliation with the inventory module |
| G-07 | Secure and compliant operations | Datacenter Security Ops on ATT&CK / 800-61 / 62443; compliance against ISO 27001, ISO 22237, TIA-942, SOC 2 |
| G-08 | Reuse the platform | Integrate with every existing module; build only what is datacenter-specific |

### 2.3 Success criteria for the first release

- A colocation operator and a NeoCloud operator run the Operate core (section 12, P1) on at least one live site each, with the collector connected to the BMS, UPS, PDUs, network, BMCs and (NeoCloud) DCGM and the scheduler.
- Every open incident at those sites shows affected services, customers, premium customers and money; the totals reconcile across Command Center, site, customer and issue views.
- GPU jobs at the NeoCloud site show state, MFU, last checkpoint and GPU time lost; a stalled job raises a Critical incident within 60 s of the Xid.
- DCIM holds every rack, PDU, cord and cable of the pilot sites; every write carries a change request from the existing Change Management module.

## 3 Scope and the module split

### 3.1 Principle

**SynapseDC consumes the existing platform modules only through their APIs. It builds no database, backend service or screen for any of them. It builds only the datacenter-specific screens and functionality listed in section 7, and telemetry reaches it only through the OAP telemetry ingestion / consumer service, which reads and writes ClickHouse.** Section 3.4 states this as requirements.

The platform module that already owns an object is its **system of record**. SynapseDC builds only what is **datacenter-specific** on top of it, uses the module's data through its API or the platform event bus, and never duplicates its screens. Where a customer runs their own system instead of the platform module (ServiceNow, Salesforce, NetBox…), the same datacenter capabilities integrate with that system.

### 3.2 The split

| Area | SynapseDC builds | Existing module used (system of record) | Analytics-only pages |
| --- | --- | --- | --- |
| Command Center | **Build** (7.1) | — | — |
| Datacenters: site page, layout / twin, device page, access & security | **Build** (7.2) | Inventory (assets), Security Ops (exceptions) | — |
| Facilities: power, cooling, environment & safety, SPOF, maintenance | **Build** (7.3) | ITSM Maintenance (maintenance changes) | — |
| GPU Fleet | **Build** (7.4) | Ops Toolkit Telemetry Ops (pipeline) | — |
| Alarm scope, correlation, incident enrichment | **Build on** Ops Toolkit System Alerts + ITSM Incidents / Problems (7.5) | System Alerts, Incidents, Change Management, Tickets, Knowledge Center | — |
| Revenue Impact | **Build** (7.6) — the one BSS-area capability not in the platform | CRM, Customers, Orders, Plans & Products Catalog (records) | — |
| Datacenter Security Ops | **Build on** Ops Toolkit Security Ops (7.7) | Security Ops | — |
| Capacity & power economics | **Build** (7.8) | Inventory Planning | — |
| Planner | **Build** the engine, templates, governance, packs (7.9) | Programs & Projects (delivery record), Procurement / Vendors / Contracts (orders) | — |
| DCIM: racks, power chain, cabling | **Build** the datacenter extensions (7.10) | Plan to Build Inventory (asset record), Change Management (CRs) | DCIM Insights (8.6) |
| Compliance | **Build** (7.11) | — | — |
| Programs & Projects, Work orders, Commissioning | — | Plan to Build Programs & Projects, Field Force Management | **Insights pages** (8.1–8.3) |
| IP & Network | — | Plan to Build IP Management | **Insights** (8.4) |
| Change management | — | Services & ITSM Change Management | **Overview** (8.5) |
| CRM, customers, orders, catalogue, experience & care | — | Operate to Acquire (BSS) | — |
| Alerts, telemetry, data, infra, fin, proc bots, explainability, service, agent ops | — | Opstral Ops Toolkit | — |
| AI models and agents | — | AI Foundry | — |
| Customisation (fields, tags), identity | — | Platform Engineering | — |
| Data model, data layer, BI | — | Intelligence Hub (Command Center excluded: built here) | — |
| Cross-cutting: shell, business-model and geography switches, Opstral AI, search, info bubbles, embedding | **Build** (7.12) | Platform Engineering (identity, flags, customisation), AI Foundry (models) | — |
| Materials, vendors, contracts, procurement, warehouses, field force, logistics | — | Supply Chain | — |

### 3.3 Out of scope (all releases unless re-decided)

- Control of any plant, BMS point, network configuration, BMC, security equipment or tenant equipment. SynapseDC reads; people act through a change request.
- Billing and invoicing (the customer's billing system; the platform has no billing module). SynapseDC sends metered usage and credits.
- Video storage, badge issuing, visitor check-in (the PACS / VMS / visitor systems; SynapseDC reads events and references).
- Discovery, drift and reconciliation UI (the inventory module's job; SynapseDC reports what it observed).
- A tenant portal (embed or the tenant-scoped API only, section 9 and NB-12).
- Network service provisioning, orders and the service catalogue (BSS / OSS).


### 3.4 Build boundary: consume the platform, build only what is datacenter-specific

The existing modules named in section 3.2 (Operate to Acquire / BSS except Revenue Impact; Services & ITSM; Opstral Ops Toolkit; AI Foundry; Platform Engineering; Intelligence Hub except Command Center; Plan to Build Inventory, Inventory Planning, IP Management and Programs & Projects; Supply Chain) are **assumed to expose the APIs SynapseDC needs**. SynapseDC calls those APIs; it does not re-create the module.

| ID | Requirement | Priority |
| --- | --- | --- |
| ARCH-001 | SynapseDC shall read and write the data of an existing platform module only through that module's published API (REST, GraphQL or events). It shall assume the API is available and list every field it needs per module (section 9). | M |
| ARCH-002 | SynapseDC shall not build a database, schema, table, backend service or administration screen for an object an existing module owns (customers, contracts, orders, products, incidents, problems, changes, tickets, maintenance windows, knowledge articles, alerts, inventory assets, IP addresses, capacity plans, programmes, projects, work orders, purchase orders, vendors, contracts, stock, users, roles, custom fields). | M |
| ARCH-003 | SynapseDC shall not keep a second copy of a module's records as its own record. It may cache API responses for performance (with the module's id and an expiry) and may store derived results keyed by the module's ids (for example impact or money per incident). | M |
| ARCH-004 | Where SynapseDC needs a field a module API does not offer, the gap shall be raised to the module team as an API requirement (the API gap list in section 9.10). It shall not be worked around with a local table. | M |
| ARCH-005 | SynapseDC shall build only the datacenter-specific screens, read models and the backend that serves them (chapters 7.1–7.12 and the analytics pages of chapter 8). | M |
| ARCH-006 | Screens of an existing module shall not be rebuilt. SynapseDC links or deep-links to them (for example an incident opens in Services & ITSM, a project in Programs & Projects), or embeds them where the module supports it. The analytics pages of chapter 8 read the module's API and drill down into the module's own screens. | M |
| ARCH-007 | Every write SynapseDC makes to an existing module (create an incident, raise a change request, hand a plan over as a project, post a worklog line, send a notice) shall go through that module's API, so the module applies its own rules, approvals and audit. | M |
| ARCH-008 | All telemetry (metrics and time series from the collector: network, BMC, UPS, PDU, meters, BMS, DCGM, scheduler, fabric) shall be written through the **OAP telemetry ingestion microservice** and read through the **OAP telemetry consumer microservice**. These services read and write ClickHouse. SynapseDC shall run no time-series database, ingestion pipeline or telemetry store of its own. | M |
| ARCH-009 | SynapseDC read models (live facility state, GPU fleet, physical last mile, impact, revenue, capacity, power economics) shall query recent and historical telemetry through the OAP consumer API (latest value, range, roll-up, top-N). They shall not query ClickHouse directly. | M |
| ARCH-010 | Alarms and events shall be raised into, and read from, Ops Toolkit System Alerts through its API. Security telemetry and detections shall be read from Ops Toolkit Security Ops (its ClickHouse / OCSF tables) through its API. | M |
| ARCH-011 | Identity, roles, scopes, feature flags and custom fields shall come from Platform Engineering. SynapseDC keeps no user store. | M |
| ARCH-012 | SynapseDC shall keep its own storage only for datacenter-specific data that no platform module owns. The list is in the table below; anything else is consumed. | M |

**What SynapseDC stores and what it consumes**

| Data | SynapseDC stores (datacenter-specific) | Consumed through the API of |
| --- | --- | --- |
| Telemetry: samples, series, roll-ups | — | OAP telemetry ingestion / consumer service (ClickHouse) |
| Alarms, alarm state | scope, placement and correlation tags it adds, keyed by alarm id | Ops Toolkit System Alerts |
| Incidents, problems, changes, tickets, maintenance | RCA hypotheses, impact, money and verification per incident id; DCIM work items per change id | Services & ITSM |
| Customers, contracts, SLA, services, products | impact and money per service / customer id (derived) | BSS: CRM, Customers, Orders, Catalog |
| Assets: sites, rooms, racks, devices, modules, serials, lifecycle | DCIM extensions the Inventory API cannot carry (U position, PDU outlets and cords, panels and feeds, patch panels, trunks, cable paths, rack type and condition; OD-01) | Plan to Build Inventory |
| IP addresses, prefixes, VLANs | — (findings and forecast are derived) | Plan to Build IP Management |
| Capacity targets, holds | reservations derived from planned devices, plans and contracts | Plan to Build Inventory Planning |
| Programmes, projects, work orders, POs, commissioning | — (analytics derived) | Programs & Projects, Field Force Management, Procurement |
| Vendors, contracts, stock, spares | — | Supply Chain |
| Plans, plan templates, benchmarks, scenarios, approvals on plans, plan / review packs, review comments | **stored** (the planner engine is datacenter-specific) | — (approved plans handed over to Programs & Projects) |
| Power contracts, tariffs, findings | **stored** | Fin Ops receives cost figures |
| Facility design: power chain, cooling coverage, fire / leak zones, design ratings | **stored** where Inventory does not hold them (OD-01) | Plan to Build Inventory |
| Compliance policies, control mappings, attestations, decision records | **stored** | — |
| Access events, visits, badges | security exceptions and the access-rights review (derived) | PACS / visitor / VMS connectors (INT-17…19) and Security Ops |
| Business-model vocabulary, geography, severity and scope tables | **stored** (configuration) | — |


### 3.5 Modules used through their APIs (nothing built)

SynapseDC builds **nothing** of the modules below — no database, no backend, no screen. It calls their APIs (assumed available; ARCH-001) for the data listed, and opens their own screens through links. The expected request and response of every API is in **Appendix C**; the API needs per module are summarised in 9.10.

| Suite | Module | Used through its API for | SynapseDC screens that use it | API ids (Appendix C) |
| --- | --- | --- | --- | --- |
| Opstral Ops Toolkit | **OAP telemetry ingestion / consumer services** (ClickHouse) | every live reading, 24 h / 30 d / 12 m history, roll-ups, top-N, freshness | every Operate screen; Capacity; Power economics | API-OAP-01…06 |
| Opstral Ops Toolkit | System Alerts | alarm record, raise / clear, acknowledge, scope tags, on-call and paging | Command Center, Datacenter page, Alerts, Incidents view, Facilities, GPU Fleet | API-ALR-01…07 |
| Opstral Ops Toolkit | Security Ops | detections, cases, rules, vulnerabilities, sensors; datacenter context written back | Security Ops (all sub-menus), Security data sources, Access & security | API-SOC-01…07 |
| Opstral Ops Toolkit | Telemetry Ops · Data Ops · Infra Ops · Fin Ops | collector / pipeline state; scheduler jobs and nodes; cost data; power cost written back | Datacenter header, GPU Fleet, Power economics | API-OPS-01…04 |
| Services & ITSM | Incidents · Problems | incident and problem records; SynapseDC writes impact, RCA, actions, worklog | Incidents (datacenter view), Problems, Command Center, Revenue Impact | API-ITSM-01…05, 13 |
| Services & ITSM | Change Management | changes, approvals, windows, freezes; change requests raised from DCIM, incidents, maintenance, planner | DCIM, Incidents, Change management overview, Ops log | API-ITSM-06…09, 13 |
| Services & ITSM | Maintenance | maintenance windows and plans per plant asset | Facilities → Maintenance, Datacenter Ops log | API-ITSM-10 |
| Services & ITSM | Tickets | remote hands, cross-connect, access requests, RMA cases | Customer page, Device page, Assets | API-ITSM-11 |
| Services & ITSM | Knowledge Center | runbook articles per alarm / incident type | Incidents view | API-ITSM-12 |
| Operate to Acquire (BSS) | CRM · Customers | customers, tier, account manager; contracts, SLA, credit rules, contracted kW, GPU rate | Revenue Impact, Customer page, Command Center "Who is affected", Datacenter Customers tab | API-BSS-01, 02, 10 |
| Operate to Acquire (BSS) | Orders · Plans & Products Catalog | services with placement and charge; products; cross-connect orders | Revenue Impact, impact everywhere, Tenants tab | API-BSS-03, 04, 09 |
| Operate to Acquire (BSS) | Experience and Care | customer notices; impact per customer; SLA credits and metered usage written back | Incidents view (communications), Revenue Impact | API-BSS-05…08 |
| Plan to Build | Inventory | sites, rooms, racks, devices, components, device types, lifecycle; DCIM extensions it can carry | Datacenters, Datacenter page, Device page, DCIM, Assets, Planner | API-INV-01…08 |
| Plan to Build | Inventory Planning | capacity targets and holds; reservations written back | Capacity, Planner | API-IPL-01, 02 |
| Plan to Build | IP Management | prefixes, VRFs, VLANs, addresses; assignment from DCIM | IP & Network insights, DCIM device drawer, Planner IP plan | API-IPM-01…03 |
| Plan to Build | Programs & Projects (incl. work orders, commissioning) | programmes, projects, milestones, cost, risks, change orders, work orders, process tasks, commissioning tests, POs; project created from an approved plan | Programs & Projects insights, Work orders KPIs, Commissioning, Planner Delivery tab, Command Center build lens | API-PRJ-01…08 |
| Supply Chain | Vendors · Contracts · Materials · Warehouses · Procurement · Field Force Management | vendor contracts and support, prices and lead times, stock and spares, POs from the plan BoM, field visits | Planner materials and sourcing, Assets (spares, RMA), Access (contractor visits) | API-SCM-01…05 |
| AI Foundry | Models and agents | Opstral AI copilot answers over SynapseDC read models | Opstral AI drawer on every screen | API-AIF-01, 02 |
| Platform Engineering | Identity · Configuration · Customization | sign-in, roles, site scope, tenant claim; flags and deployment config; custom fields and tags | every screen | API-PEN-01…03 |
| Intelligence Hub | Data model registry · Data lake | SynapseDC entities registered; roll-ups exported for BI | BI and the platform data model | API-IHB-01, 02 |

**Screens of these modules that SynapseDC does not build** (it links to them): incident / problem / change / ticket records and approvals; CRM, customer, contract and order records; inventory asset records; IP address management (prefix, VRF, VLAN, address CRUD); programme, project, work-order, purchase-order and commissioning records and their workflows; vendor, contract and stock records; users, roles, custom-field administration; the data lake.

### 3.6 What SynapseDC builds, module by module

Only datacenter-specific screens and functionality. **Appendix B** lists every screen tab by tab and feature by feature, with the requirement ids, the data source of each feature (API id, OAP, SynapseDC read model or store) and the phase.

| # | SynapseDC module (menu) | Screens built | Chapter | Consumes (Appendix C) | Phase |
| --- | --- | --- | --- | --- | --- |
| 1 | **Command Center** | Hero (health, numbers, areas, map, datacenter column), What is happening · Who is affected · Recommendations, Plan & build strip and lens | 7.1 | OAP, ALR, ITSM, BSS, INV, PRJ | P1 / P2 |
| 2 | **Datacenters** | Datacenters list; Datacenter page (Overview · Facility · Infrastructure · Business impact groups and their sub tabs); schematic and realistic layout / twin; Device page; Customer page | 7.2 | OAP, ALR, ITSM, BSS, INV, IPM, SCM | P1 / P2 |
| 3 | **Facilities** | Power & backup, Cooling, Environment & safety, Single points of failure, Maintenance & alarms | 7.3 | OAP, ALR, ITSM-10, INV | P1 / P2 |
| 4 | **GPU Fleet** | Clusters, Jobs, Nodes, Telemetry, GPU models, Network rails, Cooling & power, Where to place; node detail | 7.4 | OAP (DCGM), OPS-02, ALR, ITSM, BSS | P1 / P2 |
| 5 | **Alerts & incidents (datacenter view)** | Alerts with scope; Incident view with impact, RCA, actions, verification, revenue, on call and communications; Problems — over the System Alerts and ITSM records | 7.5 | ALR, ITSM, BSS, OAP | P1 / P2 |
| 6 | **Revenue Impact** | Issues, Customers, Datacenters, Causes & trend, One failure away; cost drawer; How it is calculated | 7.6 | BSS, ITSM, ALR, OAP | P1 |
| 7 | **Security Ops (datacenter)** | Insights, Detections, Cases + Playbooks, Threat coverage, Vulnerabilities, Hardening & drift, OT security, Physical security; Admin → Security data sources — over Ops Toolkit Security Ops | 7.7 | SOC, INV, ITSM, ALR | P2 |
| 8 | **Capacity & power economics** | Overview, Space, Power (+ Power economics), Cooling, Compute & GPU, Network, Reservations, PUE & energy, Financial | 7.8 | OAP, INV, IPL, PRJ, BSS, OPS-03/04 | P2 |
| 9 | **Planner** | Insights, Plans, Templates, Benchmarks, New plan wizard, Plan page (all tabs), Review portal, plan / review packs | 7.9 | INV, IPL, IPM, PRJ, SCM, ITSM | P2 |
| 10 | **DCIM (datacenter extensions)** | Insights, Sites & hierarchy, Racks & floor plan, Devices & explorer, Cabling, Power, Catalogue, Change requests; Rack page; Device type page | 7.10 | INV, ITSM-06…09, IPM, OAP | P1 / P2 |
| 11 | **Compliance** | Overview, Frameworks & controls, Policies, Violations, Decision records, Audit | 7.11 | ITSM, INV, OAP | P3 |
| 12 | **Analytics pages** | Programs & Projects insights, Work orders KPIs, Commissioning, IP & Network insights, Change management overview, DCIM insights | 8 | PRJ, SCM-05, IPM, ITSM | P2 |
| 13 | **Cross-cutting** | Shell, persona and geography switches, search, Opstral AI, info bubbles, embed | 7.12 | PEN, AIF | P1 / P2 |

## 4 Stakeholders, users and roles

| Role | Business model | What they need from SynapseDC |
| --- | --- | --- |
| NOC / operations engineer | Both | Command Center, site page, alarms in scope, incidents with impact and actions, on-call |
| Facility / electrical / mechanical engineer | Both | Power path, ride-through, cooling heat balance, environment, SPOFs, what-if, maintenance, PM plan |
| GPU / AI platform engineer | Neo | GPU Fleet: jobs, nodes, telemetry, rails, cooling & power, placement |
| Datacenter engineering (records) | Both | DCIM racks, power chain, cabling, device types, change control |
| Capacity / planning manager | Both | Capacity, reservations, power economics, Planner, plan packs, review and approval |
| Finance / commercial | Both | Revenue impact, SLA credits, power bill and findings, cost per sold MW / GPU-hour |
| Customer success / account manager | Both | Customer page: what is impacting a customer, where they are served, notices |
| Security analyst / SOC engineer | Both | Detections, cases, coverage, vulnerabilities, hardening, OT, physical security, data sources |
| Compliance / audit | Both | Policies, frameworks, evidence, attestations, decision records |
| Physical security / site manager | Both | Access & security tab: who is on site, exceptions, access rights review |
| Executive / head of operations | Both | Command Center hero, revenue, capacity pipeline, GPU fleet health |
| Platform module owners (BSS, ITSM, Plan to Build, Ops Toolkit…) | — | Section 9: what SynapseDC needs from each module and sends back |
| Colocation tenant (via the operator's portal or the tenant API) | Colo | Their cabinets' power and environment, incidents affecting them, cross-connects and remote hands **(to discuss)** |
| GPU customer (via portal / API) | Neo | Their jobs, GPU health of their nodes, incidents affecting them **(to discuss)** |

## 5 Business models

One estate, one data model, one set of screens; the persona changes vocabulary, what is monitored and how value is counted. First release: **Colocation** and **NeoCloud**. Later variants: Cloud, Enterprise, Network / telco (the prototype already carries them; they are not written as requirements here).

| Aspect | Colocation | NeoCloud (GPU cloud) |
| --- | --- | --- |
| What is sold | Cabinets, cages, suites: contracted kW, space, cross-connects, remote hands | Reserved GPU clusters and on-demand GPUs; jobs billed per GPU-hour |
| Customer word / service word | Tenant / cabinet, cage, cross-connect | Customer / GPU cluster, job |
| What is monitored inside the rack | Nothing. Tenant gear is an opaque block: power at the cabinet (A / B draw vs contracted kW), inlet temperature and humidity, cage door | Everything the operator owns: node BMC, per-GPU DCGM telemetry, fabric rails, scheduler job metadata |
| Never | Polling or looking inside tenant equipment | Workload data, model weights, code, job contents |
| Premium tier | Premium tenants (SLA 99.999 / 99.99) | Reserved customers (SLA 99.9 / 99.5) |
| Capacity unit | kW and cabinets | GPUs |
| Money model | Monthly charge per service (cabinet / cage); a tenant above contracted power is **not** a loss; SLA credits on power / cooling / cross-connect availability | GPU rate × GPUs; a stalled job loses the whole allocation, a slowed job the step-time share; credits on cluster availability |
| Operator-owned equipment | Meet-me room network, one operator rack per site (BMS/EPMS, access control, NVR, DCIM, monitoring servers) | Border routers, firewalls, InfiniBand spine/leaf, Ethernet front-end, OOB, GPU nodes (DGX / HGX / OEM), storage, CPU hosts |
| Killer use case | "Which tenants are riding a critical fault right now, and what will the credits be?" | "One failed GPU stopped 152 GPUs: which job, which customer, what is it costing per hour, where is the last checkpoint?" |
| Security focus | Physical: cages, mantraps, tailgating, badge review; operator network | Operator fabric and GPU nodes: crypto-mining on idle nodes, rogue OOB devices, BMC credentials, UPS network cards |
| Power economics | Colocation blocks per committed kW-month; idle block cost; tenant overage | Utility take-or-pay floor, demand charge ratchet; power per sold GPU-hour vs price |

## 6 Solution overview

### 6.1 Capability map

```
PLAN                      BUILD                        OPERATE
Capacity & power econ.    DCIM records (racks,         Command Center · Datacenters · Facilities
Planner (templates,       power chain, cabling)        GPU Fleet · Alarm scope & incidents
benchmarks, governance,   under change control         Revenue Impact · Access & security
plan pack, review)        Programs & Projects,         Security Ops · Compliance
→ Programs & Projects     Work orders, Commissioning   Customer impact
  (existing)              (existing; analytics here)
                 ─────────── one estate model · one alarm model · one money model ───────────
                 Operate to Acquire (BSS) · Services & ITSM · Plan to Build · Supply Chain
                 Opstral Ops Toolkit · AI Foundry · Platform Engineering · Intelligence Hub
```

### 6.2 Architecture

- **On-site collector** (one per datacenter, active + standby) reads the equipment read-only (SNMPv3, gNMI, syslog, Redfish, IPMI, Modbus, BACnet / OPC UA, DCGM, scheduler, UFM, PACS), normalises alarms, buffers and sends outbound only over mTLS 443 (interface spec INT-01…13, INT-28).
- **Telemetry**: the collector writes every metric and time series to the **OAP telemetry ingestion microservice**; SynapseDC reads it back through the **OAP telemetry consumer microservice**. Both read and write ClickHouse. SynapseDC has no telemetry store of its own (ARCH-008, ARCH-009).
- **Existing platform modules**: consumed only through their APIs and events (ARCH-001…007). SynapseDC adds no database, backend or screen for them.
- **SynapseDC backend**: the datacenter-specific **read models** (impact, revenue, RCA, GPU, physical, capacity, power economics, security, compliance), the **API** (REST v1 — the same contract the screens use), the **event bus** (CloudEvents on webhooks / Kafka) and **API clients** for the platform modules and customer systems (NB-01…12, EW). Its own storage holds only the datacenter-specific data listed in section 3.4.
- **Screens** run in the platform shell or embedded in the portal (`shell=false`) with the platform's identity (OIDC).
- **Data**: every count is derived from entities; nothing is typed in. Every sample keeps source and receipt time; fresh = younger than two polling intervals.

### 6.3 Key design decisions (carried from the prototype)

| ID | Decision |
| --- | --- |
| DD-01 | An alarm counts against a datacenter only when in scope: **site**, **edge** (counted at both ends), **dependency**; **downstream** is never counted, only shown as a symptom under the causing incident. |
| DD-02 | Every impacted service is charged to exactly one issue (its most severe cause); money reconciles across issues, causes, datacenters, customers and sites. |
| DD-03 | Health is shown with LEDs, beacons, halos and chips; cabinets and plant stay neutral. Red / amber only for faults. |
| DD-04 | Every DCIM write runs under a change request: standard (pre-approved record work), an open CR at the site, or raise new. |
| DD-05 | The platform module owns the record; SynapseDC lists only the data it needs and never invents the module's fields or APIs. |
| DD-06 | Southbound is read-only and outbound-only from the site. |
| DD-09 | Existing platform modules are consumed only through their APIs; SynapseDC never builds a database, backend or screen for them (3.4). |
| DD-10 | Telemetry goes in through the OAP telemetry ingestion service and comes out through the OAP consumer service, on ClickHouse. SynapseDC runs no time-series store. |
| DD-07 | Entity identities are stable strings; every entity is seeded / keyed on its own id so adding data never reshuffles the rest. |
| DD-08 | Money is held in the operator's currency with the geography's formatting; tariffs and benchmarks are real local values marked illustrative until the customer's own replace them. |

---

## 7 Modules built by SynapseDC

Each chapter follows the same layout: purpose · scope · business rules · functional requirements · user stories and acceptance criteria · data · integrations · reports and KPIs · screens.

## 7.1 Command Center

**Purpose.** One landing screen that tells the operations lead, in under a minute, how healthy the whole datacenter estate is, which sites are in trouble, who is affected and what to do next. Every figure on it is clickable and opens the list that produced it, with the same count.
**Lifecycle stage:** Operate (with a Plan & Build strip for the build pipeline).
**Primary users:** NOC / operations manager, datacenter site manager, head of operations, executive sponsor.
**Builds on:** new (the existing Intelligence Hub keeps its own dashboards; this Command Center is datacenter-specific). Reads incidents from Services & ITSM, alarms from Ops Toolkit System Alerts, customers from BSS.
**Colocation:** the first health area is Incident response; "premium customers" are premium tenants; tenant cages are not GPU fleet. **NeoCloud:** the first health area is GPU fleet (GPUs healthy and at full speed ÷ installed), job stalls drive the status, GPU time lost per hour is shown.

### 7.1.1 Scope
- In scope: estate health ring and verdict, four health areas, clickable headline numbers, live estate map, datacenter column (worst first), What is happening · Who is affected · Recommendations, Plan & build strip and build lens, info text on every widget.
- Out of scope: incident and change records themselves (Services & ITSM Incidents / Change Management); customer master data (BSS CRM / Customers); generic platform dashboards (Intelligence Hub); revenue detail (7.6 Revenue Impact).

### 7.1.2 Business rules
| ID | Rule |
| --- | --- |
| BRULE-CC-01 | An alarm counts against a datacenter only when its scope is site, edge or dependency. Downstream alarms are never counted; they appear only as impact under the causing incident. |
| BRULE-CC-02 | Area score = good ÷ total × 100 (higher is better). The area status follows the worst single issue in it, not the percentage (one UPS on battery = Critical even at 98 %); the score bar is always neutral blue. |
| BRULE-CC-14 | What each area counts: Incident response = open incidents still within their resolution SLA ÷ open incidents; Power = UPS modules online + utility feeds normal ÷ (UPS modules + feeds); Cooling & environment = cooling units running + zones at or below 27 °C ÷ (units + zones); Network = physical links (NeoCloud: InfiniBand, Ethernet and OOB cables) up + devices reachable ÷ (links + devices). |
| BRULE-CC-03 | Operations health = the average of the four area scores. |
| BRULE-CC-04 | Area order: GPU fleet (or Incident response where no GPU estate) · Power · Cooling & environment · Network. |
| BRULE-CC-05 | GPU fleet: a GPU counts bad when it is in a stalled, slowed or at-risk job, failed, degraded or throttled; deliberate spares count good. Status = Critical when any job is stalled; Attention for slowed / at-risk jobs, idle allocations, throttling or failed GPUs. |
| BRULE-CC-06 | Verdict line = "N critical or high incidents at S of T datacenters", where N = Critical tile + High tile (a site may carry several). |
| BRULE-CC-07 | Every headline number opens a list filtered to exactly that number (Critical → open Critical incidents; High → open High; Past SLA → open incidents whose resolution SLA clock has run out; premium customers → the Who is affected panel). A site can carry several incidents, so the verdict's site count has an info bubble listing each site with its Critical + High counts. |
| BRULE-CC-08 | The datacenter column is sorted worst first by the worst open incident per site; quick filter All / Critical / High. |
| BRULE-CC-09 | The Network area's detail reads by plane in NeoCloud (InfiniBand · Ethernet · OOB cables down · nodes unreachable) and as physical links down · devices unreachable elsewhere; the score follows BRULE-CC-14 in both. |
| BRULE-CC-11 | Recommendations = the first pending or awaiting-approval action of every open Critical / High incident (Critical rank 1, High rank 2), every change pending approval ("Approve CHG…", emergency rank 1, else rank 3), a batch RMA when an incident's similar-failure analysis names other nodes on the same optics lot, and plan approvals waiting on the viewer; ranked, de-duplicated by title, top 5. |
| BRULE-CC-12 | What is happening = all open incidents across the estate, most severe first then by premium-customer impact, each with its resolution SLA clock (time left, red when overdue) and its services · customers · premium impact. Who is affected = services whose path crosses an open incident or active alarm, split Active / Degraded / Down / Disabled, and the exposed customers premium first (12 shown, total counted). |
| BRULE-CC-13 | A datacenter card shows its worst open incident (Critical red, High amber accent) or, with none, a quiet card: Attention (conditions to watch: active and critical alarms, degraded services) or Normal. |
| BRULE-CC-10 | Plan & build strip: plans by stage planned → approved → in build → commissioning → live, with decisions due. |

### 7.1.3 Functional requirements
| ID | Requirement | Priority | Model | Phase |
| --- | --- | --- | --- | --- |
| CC-001 | The system shall show an estate health ring with the operations health %, a state word and a one-line verdict. | M | Both | P1 |
| CC-002 | The system shall name the weakest area under the verdict. | M | Both | P1 |
| CC-003 | The system shall show a 2 × 2 strip of clickable numbers: Critical incidents, High incidents, Past SLA, premium customers affected. | M | Both | P1 |
| CC-004 | The system shall open, from each number, a list whose count equals the number shown. | M | Both | P1 |
| CC-005 | The system shall show four health areas as rows, each with state word, score %, caption, detail line and a link to the area's screen. | M | Both | P1 |
| CC-006 | The system shall list, under each area, the datacenters with an issue in it (critical first) as chips with a "+N" overflow that lists the rest on hover. | S | Both | P1 |
| CC-007 | The system shall explain each area's status on hover (the worst issue that sets it). | S | Both | P1 |
| CC-008 | The system shall show GPU fleet as the first area where the estate runs GPU nodes, with detail such as "152 GPUs stopped by one failed GPU · 2 jobs slowed · $625/h lost". | M | Neo | P1 |
| CC-009 | The system shall show Incident response as the first area where the estate has no operator GPU fleet. | M | Colo | P1 |
| CC-010 | The system shall link the GPU fleet chips to the site's GPU jobs view. | S | Neo | P1 |
| CC-011 | The system shall show a live estate map with a pin per datacenter coloured by state, rippling pins for Critical / High sites, animated dashes on backhaul that is down. | M | Both | P1 |
| CC-012 | The system shall open a site summary popup with its backhaul fan-out when a pin is clicked. | S | Both | P1 |
| CC-013 | The system shall provide map basemaps (light, streets, satellite, terrain), remembered per viewer. | C | Both | P2 |
| CC-014 | The system shall provide a map search by site id, city, state, region or tier that flies to the site. | S | Both | P1 |
| CC-015 | The system shall provide map legend toggles, Focus issues and Reset, and an expand-to-full-area mode closed by Esc. | S | Both | P1 |
| CC-016 | The system shall show a scrolling column of every live datacenter as a card (worst open incident or a quiet card), worst first, with an All / Critical / High filter. | M | Both | P1 |
| CC-017 | The system shall show "What is happening": open incidents and major alarms in scope, newest first, each linking to its record. | M | Both | P1 |
| CC-018 | The system shall show "Who is affected": customers impacted now, premium first, with the money at risk and the cause. | M | Both | P1 |
| CC-019 | The system shall show "Recommendations": ranked next actions from incidents, capacity and plan approvals, each linking to where it is done. | M | Both | P1 |
| CC-020 | The system shall keep the three panels equal height with scrolling bodies. | S | Both | P1 |
| CC-021 | The system shall reconcile every hero figure with the list it links to (no number differs from its click-through). | M | Both | P1 |
| CC-022 | The system shall show a slim Plan & build strip above the hero with plans per stage and decisions due, expandable to a full strip (remembered). | S | Both | P2 |
| CC-023 | The system shall provide a build lens showing the capacity pipeline (planned → live), decisions, the week ahead and projects. | S | Both | P2 |
| CC-024 | The system shall add plan approvals waiting on the viewer to Recommendations. | S | Both | P2 |
| CC-025 | The system shall show an information bubble on every widget saying what it shows, how it is computed and what a click does. | M | Both | P1 |
| CC-026 | The system shall scope all figures to the geography and business model of the tenant (currency, number and date format). | M | Both | P1 |
| CC-027 | The system shall refresh live figures without a page reload and show data freshness. | M | Both | P1 |
| CC-028 | The system shall show telemetry gaps (collector stale or down) as a state distinct from healthy. | M | Both | P1 |
| CC-029 | The system shall render on large screens and TVs (2200 px and above) scaled up, with tooltips and the map still aligned. | S | Both | P2 |
| CC-030 | The system shall restrict sites shown to those the viewer's role may see. | M | Both | P1 |
| CC-031 | The system shall answer estate questions in the Opstral AI assistant ("What is at risk in <site>?", "Which issue is costing the most revenue?", "What is <incident> costing us?", "Where should the next GPU job go?", "Which GPU job is losing the most?", "What is power costing us?", "What changed in the last 24 hours?") from the same read models, with evidence links and follow-up questions. | S | Both | P2 |
| CC-032 | The system shall be embeddable in the platform portal without its own menu and top bar. | M | Both | P1 |
| CC-033 | The system shall show in "What is happening" each open incident's resolution SLA clock as a bar (time left; red when overdue) and its impact counts (services · customers · premium), per BRULE-CC-12. | M | Both | P1 |
| CC-034 | The system shall show in "Who is affected" the split of impacted services by status (Active / Degraded / Down / Disabled) and the count of exposed premium customers, with the first 12 customers listed and a link to the rest. | M | Both | P1 |
| CC-035 | The system shall build Recommendations per BRULE-CC-11 and show for each the reason (incident or change), the expected benefit and a link to where it is done. | M | Both | P1 |
| CC-036 | The system shall keep the Plan & build strip to one slim row by default so the hero stays above the fold at 1280 × 800, with "More" opening the full strip (remembered per viewer). | S | Both | P2 |
| CC-037 | The system shall show the datacenter column cards in a compact variant (at least 1.5 cards visible) and the same card on the Datacenters tiles view. | S | Both | P1 |
| CC-038 | The system shall let the viewer switch business model (persona) and geography from the top bar, regenerating every figure, and honour `persona` / `geo` URL parameters and a deployment default. | M | Both | P1 |
| CC-039 | The system shall provide a ⌘K palette search over sites, devices, incidents, customers and screens. | S | Both | P1 |

### 7.1.4 User stories and acceptance criteria
**US-CC-01** As a NOC manager I want one verdict and four areas so that I know where to look first (CC-001, CC-002, CC-005).
- Given a UPS is on battery at one site, when I open the Command Center, then Power shows Critical even if its score is above 95 % and the hover names the UPS.

**US-CC-02** As a NOC manager I want every number to open its list so that I can trust the dashboard (CC-003, CC-004, CC-021).
- Given the High tile shows 8, when I click it, then the incidents list opens filtered to open High incidents and shows 8 rows.

**US-CC-03** As a NeoCloud operations lead I want GPU fleet first so that the product's health leads (CC-008, CC-010).
- Given a training job is stalled by an Xid 79 GPU, then GPU fleet is Critical, the detail names the GPUs stopped and the money lost per hour, and the site chip opens that site's jobs.

**US-CC-04** As a colocation site manager I want Incident response first so that tenant-facing response leads (CC-009).
- Given a colocation estate with no operator GPUs, then the first area is Incident response with % within SLA.

**US-CC-05** As an executive I want to see who is affected so that I can call key customers (CC-018).
- Given three premium customers are affected, then the premium tile shows 3 and clicking scrolls to Who is affected with those three first.

**US-CC-06** As an operations engineer I want the map to show where trouble is (CC-011, CC-012, CC-014).
- Given a site has a Critical incident, then its pin ripples; when I search its city and pick it, the map flies to it and opens its card.

**US-CC-07** As a planning lead I want the build pipeline on the landing page (CC-022, CC-023).
- Given two plans await approval, then the strip shows 2 decisions due and Recommendations lists them for their approvers.

**US-CC-08** As a platform user I want the screen embedded in the portal (CC-032).
- Given the portal frames the Command Center with shell off, then no menu or top bar shows and links stay inside the frame.

**US-CC-09** As a NOC manager I want to know what to do first (CC-035).
- Given a Critical incident with a pending action and an emergency change awaiting approval, then Recommendations lists both at rank 1, each with its reason and benefit, and clicking opens the incident or the change.

**US-CC-10** As a head of operations I want to ask the assistant (CC-031).
- Given I ask "Which issue is costing the most revenue?", then the answer names the issue, its money per hour and links to it, and the figure equals the Revenue impact screen.

### 7.1.5 Data
| Entity | Read / write | System of record | Notes |
| --- | --- | --- | --- |
| Datacenter (site) | Read | SynapseDC DCIM / Plan to Build Inventory | state, tier, region, coordinates |
| Alarm | Read | Ops Toolkit System Alerts (normalised by SynapseDC) | scope, severity, category |
| Incident | Read | Services & ITSM Incidents (enriched by SynapseDC) | severity, SLA, impact |
| Customer, service | Read | BSS CRM / Customers / Orders | premium flag, SLA, monthly charge |
| GPU node, GPU, job | Read | SynapseDC GPU Fleet (DCGM + scheduler) | job state, GPU time lost |
| Revenue impact | Read | SynapseDC Revenue Impact | lost, at risk |
| Plan, project | Read | Plan to Build (Programs & Projects) / SynapseDC Planner | stage, decision due |
| Collector state | Read | SynapseDC collector | up / stale / down |

### 7.1.6 Integrations
| System / module | Direction | Data | Interface |
| --- | --- | --- | --- |
| Ops Toolkit System Alerts | In | normalised alarms | EW, INT-28 |
| Services & ITSM Incidents | In | incident state, assignee | EW / NB-04 |
| BSS CRM / Customers | In | customers, premium, SLA | EW / NB-07 |
| Platform portal | Out | embedded screen | NB-11 |
| Event consumers | Out | incident / alarm / GPU job events | NB-02, NB-03 |

### 7.1.7 Reports and KPIs
- Operations health % = mean(area scores).
- GPU fleet % = GPUs healthy and at full speed ÷ GPUs installed.
- Incident response % = open incidents still within their resolution SLA ÷ open incidents.
- Power % = (UPS modules online + utility feeds normal) ÷ (UPS modules + feeds); Cooling & environment % = (cooling units running + zones ≤ 27 °C) ÷ (units + zones); Network % = (links up + devices reachable) ÷ (links + devices).
- Sites with Critical or High incidents = count of distinct sites.
- GPU time lost per hour = Σ (stalled job GPUs + slowed job GPUs × step-time share lost + idle allocated GPUs) × GPU rate.

### 7.1.8 Screens
| Screen / tab | Purpose | Reference route |
| --- | --- | --- |
| Command Center | estate landing | `/` |
| Command Center · build lens | build pipeline | `/?lens=build` |
| Incidents list views opened by the tiles | Critical / High / past SLA | `/incidents?view=sev1\|high\|breaching` |

---

## 7.2 Datacenters — site page, layout / digital twin, access & security

**Purpose.** The datacenter page is the home of one site: its health, its plant and equipment, its layout in 3D, its customers and money at risk, who is inside the building, and its history. It turns an alarm into a place (floor → room → rack → device → port) and a consequence (services, customers, revenue).
**Lifecycle stage:** Operate (with links to Plan and Build).
**Primary users:** site manager, NOC engineer, facilities engineer, field technician, security officer, customer success.
**Builds on:** Plan to Build Inventory (records), Ops Toolkit System Alerts, Services & ITSM, BSS Customers; the layout, twin, access log and impact views are new.
**Colocation:** racks are tenant cabinets with owner and contracted kW; tenant gear is a sealed block (power and environment at the cabinet only, never polled); the Access tab shows tenants at their cage; Business impact lists tenants and cross-connect / remote-hands orders. **NeoCloud:** GPU Fleet sub tab, GPU nodes show the 8-GPU strip, rooms show liquid racks and CDUs, Business impact lists GPU customers and their jobs.

### 7.2.1 Scope
- In scope: Datacenters list (list and tiles), site header, four tab groups and their sub tabs, Needs attention, Metrics, Ops log, schematic and realistic layout views, walk mode, power and cable paths in 3D, device popup and traces, device page (overview, interfaces, hardware, Power & cabling, 3D view, GPUs · DCGM), Access & security tab, Business impact tabs.
- Out of scope: incident workflow (Services & ITSM Incidents), customer records (BSS), the inventory master (Plan to Build Inventory, synced), badge administration (customer's PACS), video storage (customer's VMS).

### 7.2.2 Business rules
| ID | Rule |
| --- | --- |
| BRULE-SITE-01 | Tab groups are fixed: Overview (Datacenter layout · Needs attention · Metrics · Ops log) · Facility (Power & backup · Cooling · Environment · Access & security · Single points of failure · Maintenance & alarms) · Infrastructure (Equipment · GPU Fleet · Topology · Space & ports · Assets) · Business impact (Customers · Revenue). New tabs join a group; no fifth group. |
| BRULE-SITE-02 | The URL names the sub tab; the group follows from it. A group pill opens the sub tab last used in that group this session, else its first. Group count = sum of its sub tab counts. |
| BRULE-SITE-03 | GPU Fleet sub tab is shown only where the site has GPU infrastructure. |
| BRULE-SITE-04 | Device state: in-service (reporting), unmonitored (installed, no successful poll for 15 min), planned (on record, holds rack space only), tenant-owned (power and environment only). |
| BRULE-SITE-05 | A value is fresh while its last sample is younger than two polling intervals; older it is shown stale. |
| BRULE-SITE-06 | Layout attention: beacons on racks with Critical / Major issues; red / amber floor and room edges; issue counts on floor labels; at most 3 critical callouts, one per room. Cabinets stay neutral; health is shown by LEDs, beacons and halos. |
| BRULE-SITE-07 | Both layout views (schematic, realistic) use the same layout, attention roll-up, drill path and side panel, so numbers are identical. |
| BRULE-SITE-08 | Power path in 3D: per room an A (blue) and B (orange) busway, each fed by one UPS module; tripped tap-off = red dashed; on battery = amber dashed. Cable paths: trunk route 1 teal, route 2 purple, all links down red. |
| BRULE-SITE-09 | PSU cords: odd PSUs on PDU A, even on PDU B; Σ PDU load = rack draw. |
| BRULE-SITE-10 | Access: a door is "Held open" while an in-progress change names a unit in that room. Exceptions: tailgating, door forced / held open, anti-passback, repeated denials, after-hours entry, unescorted visitor, overstay, badge not returned. |
| BRULE-SITE-11 | Access log retention 1 year; CCTV references 90 days; the access-rights review is quarterly (badges by type, expired and unused badges). |
| BRULE-SITE-12 | Planned sites show an empty state on live-only tabs (no telemetry, no access log). |
| BRULE-SITE-13 | A figure shown on a Facility tab is not repeated on Metrics / Assets (single place per figure); the Metrics tab opens with the six-tile facility strip, each tile opening its sub tab. |
| BRULE-SITE-14 | Site condition: Critical = a Critical incident, a UPS on battery, a plant fault or an isolated edge; Needs attention = any open incident, critical alarm, link down, unreachable device or facility issue; else Normal. Edge redundancy = redundant / redundancy lost / isolated from the site's backhaul links. |
| BRULE-SITE-15 | Metrics thresholds: a zone is red above 27 °C and amber above 25.5 °C; a device chassis is red at 55 °C; device load is red when any device is at 90 % CPU; humidity band 40–60 % RH. |
| BRULE-SITE-16 | Diesel figures without a tank meter are estimates and shown as such: tank litres = DG kVA × 3.2 (rounded to 50 L), burn ≈ 0.2 L per kVA-hour at 75 % load, 30-day use from generator run hours. A tank reading replaces them. |
| BRULE-SITE-17 | Access log people: guards two per 12 h shift (07:00 / 19:00), field technicians per 12 h shift, site engineers on days, change crews escorted and tagged with their change, the on-call engineer responding to an open incident tagged with it, PM vendors, couriers, cleaners, visitors with host and escort, colocation tenants at their cage. Exception severities: door forced High; tailgating, held open, anti-passback Medium; badge not returned Low. |
| BRULE-SITE-18 | Rack record on Assets: type (a ~1 in 10 share of live non-GPU racks is an old shallow 600 × 1000 type), purchase date and condition (Damaged at audit, with the note); GPU / liquid racks are never the old type. |

### 7.2.3 Functional requirements
| ID | Requirement | Priority | Model | Phase |
| --- | --- | --- | --- | --- |
| SITE-001 | The system shall list all datacenters with analytics tiles (site status by condition, edge redundancy Full / Partial / Isolated, links down, devices unreachable, incidents, facility issues), search, quick filters Condition (All / With incidents / Facility issue / Edge redundancy lost / Clear) and Region, and a list ⇄ tiles switch remembered per viewer. | M | Both | P1 |
| SITE-002 | The system shall show per datacenter its state, worst open incident, money at risk and power / cooling flags in the list. | M | Both | P1 |
| SITE-003 | The system shall show a site header (slim by default, expandable, remembered) with flagged KPI chips that auto-fit with "+N more", telemetry freshness, the collectors line (each collector's state and last seen) and the actions Changes, Plan and Opstral AI. | M | Both | P1 |
| SITE-004 | The system shall keep the header and tab row pinned while the tab body scrolls. | S | Both | P1 |
| SITE-005 | The system shall show four tab groups with sub tabs per BRULE-SITE-01 and keep every sub tab deep-linkable. | M | Both | P1 |
| SITE-006 | The system shall show Needs attention: open incidents with four figure tiles (past SLA, unacknowledged, oldest open, MTTR 30 d), resolved in the last 7 days, and alarm categories with scope and severity. | M | Both | P1 |
| SITE-007 | The system shall show on Needs attention who is on call now for the site. | S | Both | P2 |
| SITE-008 | The system shall show Metrics: zone temperature and humidity with 24 h trends, rack inlet average / range, hottest racks and chassis, diesel litres, burn and 30-day use, hardware faults, device load. | M | Both | P1 |
| SITE-009 | The system shall show an Ops log of commissioning, changes, incidents, maintenance, capacity and discovery events with links. | S | Both | P1 |
| SITE-010 | The system shall show a schematic 3D layout of building → floor → room → rack → device with attention per BRULE-SITE-06. | M | Both | P1 |
| SITE-011 | The system shall show a "Needs attention" card on the layout that drills to the item. | M | Both | P1 |
| SITE-012 | The system shall offer a realistic layout view (textured equipment, cabinet doors, trays, containment, plant cabinets, DG outside) switchable with the schematic view and remembered per viewer. | S | Both | P2 |
| SITE-013 | The system shall colour the layout by Health, Temperature (heat map from rack inlets), Rack power or Connectivity. | S | Both | P2 |
| SITE-014 | The system shall name every rack with a status dot in an open room; clicking a label opens the rack. | S | Both | P2 |
| SITE-015 | The system shall let the user select plant (cooling units, UPS, rectifier, battery bank, DG) in 3D and show its facts with "Open in Facilities". | S | Both | P2 |
| SITE-016 | The system shall provide a Walk mode (eye level, drag to look, click to walk, W A S D, collision with racks, Esc stops). | C | Both | P2 |
| SITE-017 | The system shall show Power path and Cable paths overlays in 3D per BRULE-SITE-08 with a path card (feed → UPS → busway → PDU; trunks to the ODF). | S | Both | P2 |
| SITE-018 | The system shall open a device popup in 3D with role, model, rack · U, state, links up, services and actions Open device, View cabling, View power, Device in 3D. | S | Both | P2 |
| SITE-019 | The system shall show a cabling trace (every hop: cord → panel → trunk → ODF → cross-connect → far device, check-first marker) and a power trace (PSU → outlet → PDU → busway → UPS → feed). | S | Both | P2 |
| SITE-020 | The system shall fall back to a 2D view when the browser has no WebGL. | M | Both | P1 |
| SITE-021 | The system shall show Equipment: installed devices with state, role, rack, model, alarms; planned devices as reserved space. | M | Both | P1 |
| SITE-022 | The system shall show tenant equipment as an opaque block with owner, contracted kW and measured draw, never polling it. | M | Colo | P1 |
| SITE-023 | The system shall show the 8-GPU strip with per-GPU state for GPU nodes on Equipment. | M | Neo | P1 |
| SITE-024 | The system shall show Topology of the site's network devices and links (hosts counted per switch), by plane (InfiniBand, Ethernet front-end, OOB) for GPU fabrics. | M | Both | P1 |
| SITE-025 | The system shall show Space & ports (rack space, ports, floors / rooms / racks table) and Assets (space by room, equipment by category, facility assets, lifecycle). | M | Both | P1 |
| SITE-026 | The system shall show a device page with tabs Overview · 3D view · Hardware & interfaces (modules, lifecycle) · Power & cabling · GPUs (GPU nodes only) · Links (fabric-connection plane cards InfiniBand / Ethernet front-end / Management for NeoCloud; routing-protocol cards on border routers) · Impact (services) · Alerts & diagnostics (ICMP, NTP, AAA probes). | M | Both | P1 |
| SITE-027 | The system shall show on the device page Power & cabling: each PSU → outlet → PDU side → UPS / plant, and each port's cable path. | M | Both | P1 |
| SITE-028 | The system shall show a device 3D view with modes Device · Open lid · Exploded · One accelerator · In the rack, Health / Heat overlay, and Power / Cables chips. | S | Both | P2 |
| SITE-029 | The system shall show GPUs · DCGM (GPUs · Intel for Gaudi / Data Center GPU Max nodes) on GPU nodes: per-GPU health and profiling fields with 24 h sparklines, vendor-aware labels. | M | Neo | P1 |
| SITE-030 | The system shall show Access & security as four collapsible sections: People on site & exceptions · Entries, exits & doors (24 h chart, doors and readers) · Access rights review (quarterly: badges by type, expired and unused badges, CCTV 90 d, log 1 y) · Access audit trail (search and filters: result, person type, door, direction); a door or filter link opens the audit trail at that filter. | S | Both | P2 |
| SITE-031 | The system shall link visits to their change (CHG) or incident (INC) where a crew or on-call engineer entered for one. | S | Both | P2 |
| SITE-032 | The system shall show colocation tenants' badge reads at their cage doors. | S | Colo | P2 |
| SITE-033 | The system shall open a person drawer and an exception drawer from the Access tab. | S | Both | P2 |
| SITE-034 | The system shall show Customers served from the site with why each is at risk (cause), and the site's Revenue impact. | M | Both | P1 |
| SITE-035 | The system shall show cross-connect orders and remote-hands tickets on the Customers tab. | S | Colo | P2 |
| SITE-036 | The system shall show GPU customers with their jobs and GPU time lost on the Customers tab. | S | Neo | P1 |
| SITE-037 | The system shall show an empty state on live-only tabs for planned sites. | M | Both | P1 |
| SITE-038 | The system shall provide "Plan" and "Changes" actions from the header into the Planner and Change Management. | S | Both | P2 |
| SITE-039 | The system shall show a customer page: identity header (state, facts, one-line verdict with the main cause), six analytics tiles, "What is impacting this customer" (issues with money per issue), "Where they are served" and the service grid. | M | Both | P1 |
| SITE-040 | The system shall show on the customer page (Colo) cross-connect orders and remote-hands tickets with their state. | S | Colo | P2 |
| SITE-041 | The system shall show on Assets the rack type, purchase date and condition per BRULE-SITE-18, plus RMA cases, spares, warranty and support (the site lifecycle view). | S | Both | P2 |
| SITE-042 | The system shall show on Equipment the operator's own servers with their purpose (management, applications, BMS / EPMS, access control, NVR, DCIM, monitoring) distinct from tenant gear. | S | Colo | P1 |
| SITE-043 | The system shall mark on the schematic layout, when a rack is open, its facing row as glass with no clicks, and in the realistic view leave the facing row and cold-aisle frame out entirely. | C | Both | P2 |
| SITE-044 | The system shall place the realistic view's controls as: floor picker top-left, tools and a "?" help (mouse / keyboard) top-right, one dock bottom-left (Colour by · Power path / Cable paths · foldable legend Health · Power · Cables), path card bottom-right; labels keep clear of the dock. | C | Both | P2 |
| SITE-045 | The system shall render on the device 3D view one model per family (router, switch, firewall, optical, server, storage, GPU node, tenant block) with hardware parts coloured by kind (compute · power · cooling · network · memory · storage · management), state from modules, interfaces, GPU telemetry and rack power, cameras ¾ · Front · Rear · Top. | S | Both | P2 |
| SITE-046 | The system shall show the Space & ports tab's floors / rooms / racks table and rack space and port totals, and the datacenter Topology tab with the same view as the former topology page (`/topology?dc=` redirects to it). | M | Both | P1 |
| SITE-047 | The system shall keep every figure on the datacenter page reconciled with the Command Center and the lists (same incident, alarm, service and money counts). | M | Both | P1 |

### 7.2.4 User stories and acceptance criteria
**US-SITE-01** As a NOC engineer I want to go from an alarm to its place so that I can send the right technician (SITE-010, SITE-011).
- Given a Critical alarm on a rack PDU, when I open Datacenter layout, then a beacon marks that rack, its room edge is red and the attention card drills to the rack.

**US-SITE-02** As a field technician I want to see which cable to check (SITE-019, SITE-027).
- Given a link is down, when I open View cabling on the device, then every hop to the far device is listed and the check-first hop is marked.

**US-SITE-03** As a facilities engineer I want to see what powers a device (SITE-017, SITE-019).
- Given a device with PSU1 on PDU-A outlet 14, then the power trace shows PSU1 → PDU-A outlet 14 → busway A → its UPS module → utility feed, and a tripped outlet is red dashed.

**US-SITE-04** As a colocation site manager I want tenant cabinets shown without touching tenant gear (SITE-022).
- Given a tenant cabinet, then it shows owner, contracted kW and measured draw, its devices are one sealed block, and no device telemetry is requested.

**US-SITE-05** As a NeoCloud engineer I want each GPU node's GPUs at a glance (SITE-023, SITE-029).
- Given a node with one GPU raising Xid 48, then the strip shows that GPU in fault and the DCGM tab shows the row-remap and Xid fields.

**US-SITE-06** As a security officer I want exceptions with context (SITE-030, SITE-031, SITE-033).
- Given a door was held open during a change, then the exception links the CHG and the door shows Held open while the change is in progress.

**US-SITE-07** As a site manager I want one place per figure (BRULE-SITE-13).
- Given PUE is shown under Facility, then Metrics shows it only in the facility strip tile that opens Power & backup.

**US-SITE-08** As a user without WebGL I still want the layout (SITE-020).
- Given WebGL is unavailable, then a 2D view with the same attention items is shown.

**US-SITE-09** As an account manager I want one page per customer (SITE-034, SITE-039, SITE-040).
- Given a tenant with one cabinet on a tripped PDU-A, then the customer page verdict names that cause, "What is impacting" lists the issue with its money, and the cross-connect orders and remote-hands tickets are listed with their state.

**US-SITE-10** As a head of operations I want the list to show where to look (SITE-001, BRULE-SITE-14).
- Given a site with a UPS on battery and no open incident, then the list shows it as Critical; filtering Condition = Facility issue keeps it; filtering Clear hides it.

### 7.2.5 Data
| Entity | Read / write | System of record | Notes |
| --- | --- | --- | --- |
| Site, floor, room, rack | Read | Plan to Build Inventory / SynapseDC DCIM | rack grid position, owner, contracted kW |
| Device, module, interface | Read | Inventory (record) + collector (state) | ops state, telemetry |
| Link, cable path, patch panel, trunk | Read | SynapseDC DCIM | LLDP ends + recorded hops |
| PDU, outlet, power connection | Read | SynapseDC DCIM | A/B side, outlet per PSU |
| GPU node, GPU, job | Read | SynapseDC GPU Fleet | DCGM fields, job metadata |
| Alarm, incident, change | Read | System Alerts / Services & ITSM | |
| Access event, visit, exception, door | Read | customer PACS / visitor system | 1 y retention; exceptions also feed Security Ops physical detections |
| Rack type, purchase date, condition; device install / warranty / support | Read | Inventory + Supply Chain Contracts | lifecycle read model |
| Cross-connect order, remote-hands ticket | Read | BSS Orders / ITSM Tickets | Colo |
| Customer, service | Read | BSS | cause of risk from SynapseDC |
| Timeline event | Read | SynapseDC | ops log |

### 7.2.6 Integrations
| System / module | Direction | Data | Interface |
| --- | --- | --- | --- |
| Network devices, BMCs, PDUs, sensors | In | state, telemetry | INT-01…05, INT-09 via collector |
| GPU telemetry, scheduler, UFM | In | per-GPU fields, jobs | INT-11, INT-12, INT-13 |
| DCIM / Inventory | In | racks, devices, cables, power chain | INT-14, EW |
| PACS, visitor, VMS | In | badge reads, visits, evidence refs | INT-17, INT-18, INT-19 |
| ITSM | In | changes, incidents | NB-04 / EW |
| BSS | In | customers, services | NB-07 / EW, INT-25 |
| Platform portal | Out | embedded tabs | NB-11 |

### 7.2.7 Reports and KPIs
- Devices monitored % = in-service ÷ (installed − tenant-owned).
- MTTR 30 d = mean(resolved − detected) for incidents resolved in 30 days.
- Rack inlet range = max − min inlet temperature over live racks.
- Diesel runway h = fuel litres ÷ burn rate at current load.
- Access exceptions 24 h, denied entries 24 h, visitors on site now.

### 7.2.8 Screens
| Screen / tab | Purpose | Reference route |
| --- | --- | --- |
| Datacenters list | all sites | `/datacenters` |
| Datacenter page | one site | `/datacenters/:id?tab=` |
| Datacenter layout (schematic / realistic) | 3D site | `?tab=overview&twin=schematic\|realistic` |
| Needs attention · Metrics · Ops log | site health | `?tab=attention\|metrics\|log` |
| Access & security | people and doors | `?tab=access` |
| Equipment · Topology · Space & ports · Assets | installed base | `?tab=equipment\|topology\|details\|assets` |
| Customers · Revenue | business impact | `?tab=customers\|revenue` |
| Device page | one device | `/ne/:id?tab=overview\|twin\|hardware\|physical\|gpus\|links\|impact\|alerts` |
| Customer page | one customer | `/customers/:id` |
| Topology (redirect) | site topology tab | `/topology?dc=` → `/datacenters/:id?tab=topology` |

---

## 7.3 Facilities — power, cooling, environment & safety, single points of failure, maintenance

**Purpose.** Shows how power and cooling reach every rack, whether the site can ride through a utility failure, where one failure would take something down, and when the plant is next maintained. It is the facility engineer's working screen and the source of the facility figures used everywhere else.
**Lifecycle stage:** Operate.
**Primary users:** facilities (electrical, mechanical) engineer, site manager, NOC engineer, maintenance planner.
**Builds on:** Services & ITSM Maintenance and Change Management (booking), Supply Chain Vendors / Contracts / Warehouses (support contracts, spares), Plan to Build Inventory (plant records); live state and the power-path model are new.
**Colocation:** cabinet power vs contracted kW per tenant, A/B both-sides check per cabinet, tenant cages in access and fire zones; tenant gear is measured at the PDU only. **NeoCloud:** liquid-cooled GPU racks (40–60 kW+) with CDU loops, 75 % of liquid-rack heat to the CDU, CDU flow low → GPU slowdown story, GPU heat counts as Cooling.

### 7.3.1 Scope
- In scope: facility strip, Power & backup (power path, load and ride-through, cabinet distribution and what-if, rack power list, rack PDU outlet map), Cooling (heat balance, units, CDUs, coverage by floor, nearest unit), Environment (zones, fire, leak, doors), Single points of failure (+ resilience tests), Maintenance (PM plan, schedule maintenance), lifecycle / RMA / spares views.
- Out of scope: controlling plant (never); maintenance work orders and CMMS records (Services & ITSM Maintenance / customer CMMS); vendor contracts master (Supply Chain Contracts); spares stock master (Supply Chain Warehouses); BMS configuration.

### 7.3.2 Business rules
| ID | Rule |
| --- | --- |
| BRULE-FAC-01 | Power chain: utility feed → ATS → UPS module (A side = UPS-2/4, B side = UPS-1/3) → busway per room → rack PDU A / B → breaker bank → outlet → PSU. Each PDU side is rated at the rack budget. |
| BRULE-FAC-02 | Odd PSUs connect to PDU A, even to PDU B; Σ PDU load = rack draw. |
| BRULE-FAC-03 | Ride-through sequence: UPS batteries (the shortest module's autonomy at current load) → the DG at 80 % of its kVA rating (kW) → fuel hours at the tested runtime (quoted at 60 % load). Readiness checks: UPS redundancy (every module online), utility feeds, DG test passed, battery test in date, fuel: ≥ 50 % OK, 30–50 % warning, < 30 % fault. |
| BRULE-FAC-04 | Cooling redundancy (heat balance): operating units ≥ units needed for the heat load + 1 when the design is N+1. Units on a floor share its air (one zone per floor). A room is hot when a unit in it is down or a sensor reads above 27 °C. A floor reads "N+1 holds", "No spare" (the design margin is lost and a unit is down, or it has a hot room) or "Short" (the site's running capacity is below its heat load and a unit is down). |
| BRULE-FAC-05 | Each rack has a nearest cooling unit; liquid racks send 75 % of their heat to their CDU. |
| BRULE-FAC-06 | Single points of failure: both cords on A, failed PSU, tripped PDU, cabinet that one side cannot carry (≥ 90 % of budget), UPS not online, Tier II single feed / tray route / building entry, cooling spare lost. |
| BRULE-FAC-07 | What-if assets: feed, UPS, side A|B, PDU, cooling unit, trunk; result = devices, racks, services and customers that lose power, cooling or connectivity. |
| BRULE-FAC-08 | PM state: in progress / scheduled when a Maintenance change names the asset; overdue when next due < today; due within 7 days; upcoming within 30 days; else done. UPS inspection and fire inspection every 91 days. |
| BRULE-FAC-09 | Lifecycle state: End of support; Out of warranty (no warranty, no live contract); Expiring (contract ends < 90 days or end of support < 1 year); else Covered. |
| BRULE-FAC-10 | RMA cases come from modules in fault and GPU nodes flagged for RMA; an RMA never passes "Engineer booked" while the fault is live. |
| BRULE-FAC-11 | Leak detection: rope under cooling units, CDUs and liquid racks. Fire zone per room with detection (VESDA / point), suppression (Novec / IG-541 / pre-action), quarterly inspection. |
| BRULE-FAC-12 | PUE = facility power ÷ IT power from the site's power split (IT, cooling, lighting & other). |
| BRULE-FAC-14 | Rack power list: budget = the rating of one PDU side; Over budget at ≥ 85 % of budget, High at ≥ 75 %; Hot when the rack inlet is above 27 °C. The site power-load tile is red at ≥ 85 % of design capacity. |
| BRULE-FAC-15 | Environment safe band: 18–27 °C and 40–60 % RH per zone sensor; red = over temperature, smoke or leak; amber = humidity out of band. Moving to the ASHRAE dew-point envelope is to discuss. |
| BRULE-FAC-16 | Spares per part family: out when on hand − reserved ≤ 0, low when below the minimum, else OK. RMA status advances Opened → Part shipped → Engineer booked → Replaced · verifying, and never passes Engineer booked while the fault is live. |
| BRULE-FAC-17 | What-if on a utility feed drops nothing: the UPS and the DG carry it, so it is shown as a ride-through. What-if on a UPS takes every PDU it feeds; on a PDU its outlets; on a cooling unit its zone's spare; on a trunk every link in it. |
| BRULE-FAC-18 | PM intervals: UPS inspection and thermal scan, cooling filter and coil, CDU coolant and filter, fire inspection every 91 days; battery and DG tests on their own dates; a booked Maintenance change counts as scheduled, not overdue. |
| BRULE-FAC-13 | A closed section shows a one-line summary as status pills (red / amber / green); state remembered per viewer. |

### 7.3.3 Functional requirements
| ID | Requirement | Priority | Model | Phase |
| --- | --- | --- | --- | --- |
| FAC-001 | The system shall show a facility strip: power load, PUE, UPS, cooling, environment, alarms & maintenance; each tile opens its tab. | M | Both | P1 |
| FAC-002 | The system shall draw a single-line power path (utility feeds, DG set with fuel and runtime, ATS with source in use, LT panel with AC / DC split, UPS modules with load and battery minutes, battery bank, IT racks PDU A + B, −48 V DC loads where present) with live states and animated flow. | M | Both | P1 |
| FAC-003 | The system shall trace upstream and downstream on hover of any power node. | S | Both | P1 |
| FAC-004 | The system shall show a 24 h load chart against capacity. | M | Both | P1 |
| FAC-005 | The system shall show "If utility power fails": UPS minutes, DG kW, fuel hours and readiness checks per BRULE-FAC-03. | M | Both | P1 |
| FAC-006 | The system shall raise a clear note when any UPS is on battery with the minutes left at current load. | M | Both | P1 |
| FAC-007 | The system shall group Power & backup into collapsible sections (Power path · Load & ride-through · Cabinet distribution & what-if · Rack power) with summary pills when closed. | S | Both | P1 |
| FAC-008 | The system shall list rack power with search and filters (state, location, role, PDU sides): draw, budget, A / B PDU state, % of budget, Over budget / High / Hot flags per BRULE-FAC-14, URL-addressable. | M | Both | P1 |
| FAC-009 | The system shall show a rack PDU drawer with the outlet map (outlet, device, PSU, current, breaker). | S | Both | P1 |
| FAC-010 | The system shall flag devices with both cords on the same PDU side. | M | Both | P1 |
| FAC-011 | The system shall show tenant cabinet draw against contracted kW and flag cabinets over budget. | M | Colo | P1 |
| FAC-012 | The system shall show cabinet distribution by UPS / busway / PDU side. | S | Both | P2 |
| FAC-013 | The system shall run a what-if for a feed, UPS, side, PDU, cooling unit or trunk and list what is lost per BRULE-FAC-07. | S | Both | P2 |
| FAC-014 | The system shall show the cooling heat balance: heat load, running capacity, capacity after losing the largest unit, redundancy verdict. | M | Both | P1 |
| FAC-015 | The system shall show cooling unit cards (CRAH / CRAC / chiller / CDU) with state, supply / return temperature, load. | M | Both | P1 |
| FAC-016 | The system shall show CDU loops with flow, supply / return temperature and the GPU racks they serve. | M | Neo | P1 |
| FAC-017 | The system shall link a CDU flow fault to the GPU slowdown it causes. | S | Neo | P1 |
| FAC-018 | The system shall show cooling coverage by floor (N+1 / No spare / Short) and each rack's nearest unit. | S | Both | P2 |
| FAC-019 | The system shall show environment zone cards with temperature and humidity on their scale against the safe band (BRULE-FAC-15), smoke and leak detectors and the racks in the zone with their highest inlet. | M | Both | P1 |
| FAC-020 | The system shall show fire zones (detection, suppression, agent %, release mode, last and next inspection). | S | Both | P2 |
| FAC-021 | The system shall show leak detection lines and their state. | S | Both | P2 |
| FAC-022 | The system shall show access points (mantrap, room doors, cage doors) with events and denials in 24 h, consistent with the Access tab. | S | Both | P2 |
| FAC-023 | The system shall list single points of failure per BRULE-FAC-06 with domain filter, detail and what-if link. | S | Both | P2 |
| FAC-024 | The system shall show resilience test results per site (last run, outcome, next due). | C | Both | P2 |
| FAC-025 | The system shall show the PM plan per plant asset (interval, last done, next due, state per BRULE-FAC-08, booking change). | S | Both | P2 |
| FAC-026 | The system shall offer "Schedule maintenance" that raises a Maintenance change in Change Management. | S | Both | P2 |
| FAC-027 | The system shall show the impact of a planned maintenance as the what-if of that asset. | C | Both | P2 |
| FAC-028 | The system shall show device lifecycle: install date, warranty end, support contract, vendor end of sale / support, state per BRULE-FAC-09. | S | Both | P2 |
| FAC-029 | The system shall show open RMA cases and spares per part family at the site. | S | Both | P2 |
| FAC-030 | The system shall show a datacenter picker on the Facilities screen and the same views inside the datacenter page Facility group. | M | Both | P1 |
| FAC-031 | The system shall show battery and DG test dates and flag a test due. | S | Both | P1 |
| FAC-032 | The system shall show the −48 V DC plant where present (rectifiers, BDFB, battery). | C | Both | P3 |
| FAC-033 | The system shall never send a write or control command to plant. | M | Both | P1 |
| FAC-034 | The system shall mark every facility value with its freshness and show stale values as stale. | M | Both | P1 |
| FAC-035 | The system shall show the Maintenance & alarms tab with the site's active facility alarms and its open maintenance changes alongside the PM plan. | M | Both | P1 |
| FAC-036 | The system shall show on Cooling the running capacity after losing the largest unit and the margin in kW, and on each unit card its zone and the racks it is nearest to. | S | Both | P1 |
| FAC-037 | The system shall list spares per part family with on hand, reserved, minimum and state per BRULE-FAC-16, and show whether a spare exists on site for each open RMA. | S | Both | P2 |
| FAC-038 | The system shall show the Facility strip at the top of the Facilities page and on Overview → Metrics, and not repeat it on the five Facility sub tabs of the datacenter page. | S | Both | P1 |
| FAC-039 | The system shall list the datacenter's support contracts (level, expiry) and the vendor end-of-sale / end-of-support dates per model, with totals Covered / Expiring / Out of warranty / End of support. | S | Both | P2 |
| FAC-040 | The system shall treat diesel litres, burn rate, PDUs per rack, one DG and one battery bank per site, the 0.8 generator power factor and the 75 % liquid heat share as estimates to be replaced by records or readings, and label them as estimates on screen. | M | Both | P1 |

### 7.3.4 User stories and acceptance criteria
**US-FAC-01** As a facilities engineer I want to know how long the site lasts if utility power fails (FAC-005, FAC-006).
- Given UPS-2 is on battery with 11 min left and the DG has not taken the load, then the ride-through panel shows a red note naming UPS-2 and 11 min.

**US-FAC-02** As a facilities engineer I want to find racks at risk on one side (FAC-010, FAC-023).
- Given a server has both cords on PDU-A, then it appears in Single points of failure as "both cords on A" with the rack and the fix.

**US-FAC-03** As a colocation site manager I want tenants over their contracted power flagged (FAC-011).
- Given a cabinet contracted at 8 kW draws 8.6 kW, then the rack power list shows 108 % and flags it; it is not counted as revenue loss.

**US-FAC-04** As a NeoCloud engineer I want to see when cooling slows GPUs (FAC-016, FAC-017).
- Given CDU flow is low at a liquid site, then the CDU card is in fault and links to the GPU jobs slowed by hardware slowdown.

**US-FAC-05** As a maintenance planner I want to book plant maintenance (FAC-025, FAC-026).
- Given a UPS inspection is overdue, when I click Schedule maintenance, then a Maintenance change is raised and the PM state becomes Scheduled.

**US-FAC-06** As a site manager I want to test a failure before it happens (FAC-013).
- Given I pick "side A" in what-if, then the system lists every device and service that would run on B only and those that would lose power.

**US-FAC-07** As a procurement lead I want expiring support visible (FAC-028).
- Given a contract ends in 60 days, then the device shows Expiring with the contract id and days left.

**US-FAC-08** As an operator I want assurance the platform never controls plant (FAC-033).
- Given any facility screen, then no control or set action is offered and the collector holds read-only credentials only.

**US-FAC-09** As a mechanical engineer I want to know which floor has no cooling spare (FAC-018, BRULE-FAC-04).
- Given a CRAH on floor 2 is down and the site's design is N+1, then floor 2 reads "No spare", its hot room is listed, and the heat balance shows capacity after losing the largest unit.

**US-FAC-10** As a store keeper I want to know when spares run low (FAC-037).
- Given the SFP spare's on hand minus reserved is below its minimum, then the spare reads Low and the open RMA for that part shows whether a spare is on site.

### 7.3.5 Data
| Entity | Read / write | System of record | Notes |
| --- | --- | --- | --- |
| Utility feed, ATS, UPS, battery, DG | Read | Inventory (record) + collector (state) | ratings, autonomy, fuel |
| Busway, rack PDU, outlet, power connection | Read | SynapseDC DCIM | A/B, outlet per PSU |
| Cooling unit, CDU, cooling zone | Read | Inventory + BMS | capacity, redundancy design |
| Environment sensor | Read | collector | rack inlet, room |
| Fire zone, leak line, access point | Read | BMS / PACS / records | inspections |
| PM plan item | Read | SynapseDC (derived) + ITSM Maintenance / CMMS | booking change |
| Support contract, warranty, model lifecycle | Read | Supply Chain Contracts / Vendors, OEM APIs | |
| RMA case, spare | Read | Supply Chain Warehouses / SynapseDC | |
| Maintenance change | Write (raise) | Services & ITSM Change Management | |

### 7.3.6 Integrations
| System / module | Direction | Data | Interface |
| --- | --- | --- | --- |
| UPS, PDUs, meters, ATS, DG, DC plant | In | live power state | INT-04, INT-05, INT-06, INT-07, INT-10 |
| BMS (cooling, CDU, fire, leak) | In | unit state, alarms | INT-08 |
| Rack / room sensors | In | temperature, humidity | INT-09 |
| PACS | In | door events | INT-17 |
| DCIM / Inventory | In | plant, power chain records | INT-14, EW |
| OEM support APIs | In | warranty, end of life | INT-26 |
| CMMS / ITSM Maintenance | In / Out | PM done dates; maintenance change | INT-27, NB-04 / EW |
| Supply Chain | In | contracts, spares | EW |

### 7.3.7 Reports and KPIs
- PUE = facility kW ÷ IT kW.
- UPS shortest autonomy (min) = min(battery minutes at current load).
- Ride-through h = DG fuel runtime at 60 % load.
- Cooling margin kW = running capacity − heat load; after-loss kW = running − largest unit.
- Rack budget use % = rack draw ÷ rack budget; cabinets ≥ 90 %.
- SPOF count by domain; PM overdue count; devices Out of warranty / End of support.

### 7.3.8 Screens
| Screen / tab | Purpose | Reference route |
| --- | --- | --- |
| Facilities · Power & backup | power path, ride-through, cabinet distribution, rack power (`rq · rstate · rroom · rrole · rpdu`) | `/facilities?dc=` (default tab) |
| Facilities · Cooling | heat balance, units, CDUs | `/facilities?tab=cooling` |
| Facilities · Environment | zones, fire, leak, doors | `/facilities?tab=environment` |
| Facilities · Single points of failure | SPOF, tests | `/facilities?tab=resilience&domain=` |
| Facilities · Maintenance & alarms | PM plan, facility alarms, maintenance changes | `/facilities?tab=maintenance` |
| Schedule maintenance | raise a Maintenance change | `/changes?new=maintenance` |
| Datacenter · Facility group | same views per site | `/datacenters/:id?tab=fpower\|fcooling\|fenv\|fspof\|fmaint` |

## 7.4 GPU Fleet

**Purpose.** Show every GPU cluster, node and customer job the operator runs. For each one, show whether it is healthy and earning, what is slowing or stopping it, and what that costs in GPU time, power and work to redo. This is the product's main use case: a GPU estate is the most expensive and the most fault-sensitive hardware in the building.
**Lifecycle stage:** Operate (with Plan inputs for placement and power cost).
**Primary users:** GPU / AI platform operations engineer, NOC engineer, facility engineer (liquid cooling), capacity planner, customer success manager, operations head.
**Builds on:** new. It uses Opstral Telemetry Ops and Infra Ops pipelines for collection, and the BSS Customers / Orders records for job ownership and price.

**Colocation:** the GPUs belong to the tenant and are never polled. GPU Fleet shows only the tenant AI cages: high-density cabinets (40–60 kW), contracted kW against draw, the liquid loop (CDU) feeding them, inlet temperature and state. There are no jobs, nodes or DCGM telemetry. The menu item is shown only when the estate has GPU infrastructure.
**NeoCloud:** full scope. Operator-owned GPUs, per-GPU DCGM-style telemetry, and customer jobs as the scheduler sees them (job, customer, GPUs and nodes, state, MFU, checkpoint). Workload data, models and code are never read.

### 7.4.1 Scope
**In scope**
- Clusters / pods (at most 32 nodes each, one GPU model per pod), nodes, GPUs and hot spares.
- Jobs (training, fine-tuning, inference) with their states and the money effect of each state.
- Per-GPU telemetry following the NVIDIA DCGM exporter fields, plus the Intel Gaudi (hl-smi) and Intel XPU Manager equivalents.
- GPU models and vendors catalogue (NVIDIA B200, H200, H100, A100, L40S, T4; Intel Gaudi 3, Data Center GPU Max 1550).
- Network rails: InfiniBand (400G NDR), Ethernet front-end (100G), Management / OOB (1G), with port and error state.
- Cooling and power for GPU racks: liquid loops (CDU), rack draw against budget, power cost per GPU-hour, energy and power cost by job and by tenant.
- Where to place the next job: a ranked list of pods.
- "Jobs needing attention" story cards (biggest blast radius, slowest job).
- Node detail and the device "GPUs · DCGM" view.

**Out of scope**
- Job scheduling and submission: the customer's Slurm / Kubernetes / Run:ai.
- Billing of GPU hours: the customer billing system. The BSS Plans & Products Catalog holds the GPU product and rate.
- Ticketing and on-call: Services & ITSM Incidents and Tickets, Ops Toolkit System Alerts.
- Model / training-framework internals, and any customer data.

### 7.4.2 Business rules
| ID | Rule |
|---|---|
| BRULE-GPU-01 | Job states are Running, Slowed, Stalled, At risk and Idle. **Stalled** means the job has stopped because one of its GPUs or nodes failed (for example Xid 79, GPU fell off the bus): every rank waits at the step barrier. **Slowed** means the step time is above the baseline (an NVLink straggler, thermal or hardware slowdown from low coolant flow, an InfiniBand rail flapping); MFU falls by the same factor. **At risk** means the job still runs but a node in it carries a fault where the next event crashes it (uncorrectable ECC with a row remap pending). **Idle** means the job holds an allocation but has run below 5 % utilisation for 6 hours or more; no alarm is raised for it (it is waste, not a fault) and it is shown on the jobs list and the Command Center GPU area instead. Job kinds are training, fine-tuning and inference; inference-only models (L40S, T4) run inference jobs only. |
| BRULE-GPU-02 | Job price per hour = GPUs × (persona rate per GPU-month ÷ 730) × the model's price factor (H100 = H200 = 1; B200 1.45, A100 0.55, L40S 0.38, T4 0.08, Gaudi 3 0.6, Max 1550 0.45). The NeoCloud reference rate is ₹1,50,000 per GPU-month (cloud list ₹1,75,000, enterprise charge-back ₹85,000 for the later variants); the customer's own product rate from the catalogue replaces it. The same figure is the job's service charge for Revenue Impact. |
| BRULE-GPU-03 | GPU time lost now (per hour) = the full job price per hour when Stalled or Idle; the job price per hour × the share of step time lost when Slowed (share = 1 − baseline ÷ current step time); 0 when Running. |
| BRULE-GPU-04 | Lost so far = the lost-now rate × hours since the state began. The fleet's "lost so far" total adds the work to redo of stalled jobs (BRULE-GPU-05). |
| BRULE-GPU-05 | Work to redo (Stalled job) = the job price per hour × hours between the last checkpoint and the stall. |
| BRULE-GPU-06 | At stake (At-risk job) = the job price per hour × the checkpoint interval in hours (the work lost if it crashes now). |
| BRULE-GPU-07 | Node states are In a job, Spare (idle, about 10 % of each pod kept as hot spares), Drained, Failed (open RMA; the failed GPU shows Xid 79 for NVIDIA parts) and Burn-in (24 h after a repair). A GPU counts as healthy and at full speed unless it is in a Stalled / Slowed / At-risk job, failed, degraded, or throttled. Spares count as healthy; drained, failed and burn-in nodes are out of service. Fleet health % = healthy ÷ installed; the Command Center GPU fleet area shows this figure with the detail "N GPUs stopped by one failed GPU · N jobs slowed · money lost per hour". |
| BRULE-GPU-08 | Fleet status is Critical when any job is Stalled. It is Attention when any job is Slowed or At risk, any allocation is Idle, any GPU is throttled, or any GPU has failed. Otherwise it is Normal. |
| BRULE-GPU-09 | Throttle reasons are taken from the DCGM throttle field and reported as thermal, hardware slowdown or power cap. |
| BRULE-GPU-10 | Xid buckets: 48, 64, 79 and 95 = reset the GPU / restart the node (Critical). 74 = NVLink (Major). 94 = contained (Minor). 63 = ignored. |
| BRULE-GPU-11 | Driver drift = a node running its model's older driver while the pod's baseline is the current driver. |
| BRULE-GPU-12 | Power cost per installed GPU-hour = kW per GPU × site PUE × energy tariff. Power cost per sold GPU-hour = the same power spread over GPUs that are earning (in a running job). Both are compared with the model's price to show power share % and "left after power". |
| BRULE-GPU-13 | Job / tenant power cost per day = Σ node kW × PUE × tariff × 24. An idle allocation is billed, draws power and does no work. A power cap reports kW saved against the GPU time it costs. |
| BRULE-GPU-14 | Placement fit for N GPUs of a model is judged per pod on: free healthy GPUs, rack power headroom, cooling state (CDU for liquid racks), contracted power headroom, "already paid" kW (an idle block, or demand below the take-or-pay floor) and the marginal power cost per GPU-hour. Fit is Good, Tight or No. |
| BRULE-GPU-15 | Each job is a customer service on every node of the job, so a fault on any of its nodes affects that service and appears in Revenue Impact under the GPU domain (see 7.6). |
| BRULE-GPU-16 | Telemetry is read-only. The platform never resets a GPU, drains a node or changes a power cap. It recommends these, and people carry them out through a change. |
| BRULE-GPU-17 | Pods are at most 32 nodes of 8 GPUs, one GPU model per pod; the GPU host takes the pod's server model (NVIDIA, Supermicro or Dell OEM). Liquid-cooled halls have one CDU loop per three GPU racks (capacity = load × 1.6 rounded up to 50 kW; nominal flow = capacity × 1.45 L/min); liquid nodes report no fan. Cluster state is bad when a job in it is stalled or a GPU is failed in a job, warn when any GPU needs attention, else ok. |
| BRULE-GPU-18 | Reference scenarios the acceptance tests use (seeded on NVIDIA training pods): Xid 79 stalls the biggest training job at the GPU-fault site, last checkpoint 52 min before; Xid 48 row remap pending puts a fine-tune At risk; Xid 74 NVLink errors make one node a straggler and the job 22 % slower; CDU flow low (pump A seized) puts liquid-cooled GPUs into hardware slowdown with a Cooling incident; an InfiniBand rail flapping slows a job 12 % with **no incident on purpose** (the job is slowed, nothing is down); a rack near its breaker runs its GPUs power-capped at 550 W (Warning alarm, 6 h); an inference service has held its GPUs idle for 6 h (no alarm). A driver rollout change covers the nodes on the old driver. |

### 7.4.3 Functional requirements
| ID | Requirement | Priority | Model | Phase |
|---|---|---|---|---|
| GPU-001 | The system shall show the GPU Fleet menu item and the datacenter GPU sub tab only when the estate (or site) has GPU infrastructure. | M | Both | P1 |
| GPU-002 | The system shall list clusters / pods with GPU model, vendor, nodes, GPUs in a job, spare, out of service, healthy / degraded / failed, jobs, utilisation and power kW. | M | Neo | P1 |
| GPU-003 | The system shall show a per-node heat map for each cluster, coloured by worst GPU state, with the job each node belongs to. | S | Neo | P1 |
| GPU-004 | The system shall list nodes with cluster, job, owner, utilisation, maximum GPU temperature, throttled GPUs, last Xid, alarm count, rack, room and driver drift, filterable by model or vendor. | M | Neo | P1 |
| GPU-005 | The system shall list jobs with kind, customer, premium flag, cluster, GPUs, state, step time against baseline, MFU, last checkpoint, cause and the linked incident. | M | Neo | P1 |
| GPU-006 | The system shall compute GPU time lost now, lost so far, work to redo and at stake per job, as in BRULE-GPU-03 to 06. | M | Neo | P1 |
| GPU-007 | The system shall sort jobs by lost-now rate, then at stake, then GPUs. | S | Neo | P1 |
| GPU-008 | The system shall show a collapsible "Jobs needing attention" section with the Biggest blast radius card (the stalled job stopping the most GPUs, its incident, lost per hour, work to redo, the spare node to restart on) and the Slowest job card (the slowed job with the largest step-time share lost, its cause and lost per hour). Its open / closed state is remembered per viewer; when closed it shows four summary figures: GPUs stopped + incident, lost now, slowest job, lost now. The same section heads the datacenter GPU sub tab for one site. | S | Neo | P1 |
| GPU-009 | The system shall show a fleet summary strip: GPUs installed, in a job, healthy %, jobs by state, GPU time lost per hour and work to redo. | M | Neo | P1 |
| GPU-010 | The system shall read, through the OAP telemetry consumer API, the DCGM fields per GPU: utilisation, SM active, tensor active, memory copy, DRAM active, frame-buffer used, GPU and HBM temperature, power and energy, SM and memory clock, P-state, fan, throttle reasons, ECC single / double bit, retired pages, row remap, PCIe replay and traffic, NVLink errors and traffic, last Xid. | M | Neo | P1 |
| GPU-011 | The system shall read, through the OAP telemetry consumer API, the vendor equivalents for Intel Gaudi (hl-smi / exporter) and Intel XPU Manager, and label telemetry by its source. | S | Neo | P2 |
| GPU-012 | The system shall read a 24-hour hourly history per node from the OAP telemetry consumer API, ending on the current reading, and show it as sparklines in the node detail. | M | Neo | P1 |
| GPU-013 | The system shall show fleet telemetry: utilisation and temperature histograms, 24 h fleet utilisation, power and hottest-GPU series, 24 h energy (MWh), P-state split, Xid events per hour, ECC totals and per-counter leaders. | S | Neo | P1 |
| GPU-014 | The system shall show the node detail (drawer and device page) with a health view, a profiling view, the 8-GPU strip, hardware (model, server OEM, driver) and alarms. | M | Neo | P1 |
| GPU-015 | The system shall classify Xid events per BRULE-GPU-10 and raise GPU alarms with the Xid code. | M | Neo | P1 |
| GPU-016 | The system shall flag driver drift per node and per pod. | S | Neo | P1 |
| GPU-017 | The system shall show a GPU models tab: vendor cards and a model table (memory, TDP, scale-up link, fabric, nodes, GPUs, in job, utilisation, degraded, failed, sites, power). Clicking a row opens Nodes filtered by that model or vendor. | S | Neo | P1 |
| GPU-018 | The system shall show network rails per cluster (InfiniBand, Ethernet front-end, OOB), with ports up / down and error counts on one line, flapping rails and symbol errors. | M | Neo | P1 |
| GPU-019 | The system shall show cooling for GPU racks: CDU loops (capacity, load, supply / return temperature, flow against nominal, pump) and the racks each loop feeds. | M | Both | P1 |
| GPU-020 | The system shall show GPU racks with draw against budget, liquid / air, node count, maximum temperature, CDU and state. | M | Neo | P1 |
| GPU-021 | The system shall show tenant AI cages (contracted kW, draw, CDU, inlet temperature, state, note) for colocation, without polling tenant GPUs. | M | Colo | P1 |
| GPU-022 | The system shall link a job affected by a fault to the open GPU incident and show the incident severity and status on the job. | M | Neo | P1 |
| GPU-023 | The system shall feed the Command Center GPU fleet area (the first hero area where the estate runs operator GPUs; colocation tenant cages do not qualify): % = healthy GPUs ÷ installed, status Critical when a job is stalled and Attention for slowed / at-risk / idle allocations, throttling or failed GPUs, the detail line and one chip per site with a hurt job or throttled GPUs that opens the jobs tab filtered to that datacenter. | M | Neo | P1 |
| GPU-024 | The system shall show power cost per installed and per sold GPU-hour per pod, against the model's price (share %, left after power) and the cost of idle GPUs' power (BRULE-GPU-12). | S | Neo | P2 |
| GPU-025 | The system shall show energy and power cost by job and by tenant per day, against what the job earns, with call-outs for idle allocations and power-capped racks (BRULE-GPU-13). | S | Neo | P2 |
| GPU-026 | The system shall provide a "Where to place" tab: input GPUs needed (8–256) and a model, output pods ranked by fit with free GPUs, rack headroom, cooling, contracted headroom, already-paid kW and marginal power cost per GPU-hour. | S | Neo | P2 |
| GPU-027 | The system shall link the power cost views to Capacity → Power economics for the same datacenter. | S | Neo | P2 |
| GPU-028 | The system shall show GPU nodes with an open RMA and their spare status. | S | Neo | P2 |
| GPU-029 | The system shall pin the tab bar and list headers under the top bar while lists scroll, and fit all tabs on one row at 1280 px. | S | Both | P1 |
| GPU-030 | The system shall scope every tab to one datacenter or the whole estate from a datacenter selector. | M | Both | P1 |
| GPU-031 | The system shall read job metadata from the scheduler (Slurm REST or the Kubernetes API) and never read job inputs, outputs, models or code. | M | Neo | P1 |
| GPU-032 | The system shall show step time, MFU and checkpoint figures only when the customer's AI platform exports them, and otherwise mark them "not available" (to discuss per customer). | M | Neo | P1 |
| GPU-033 | The system shall answer Opstral AI questions "Where should the next GPU job go?", "What is power costing us / at <site>?" and "Which GPU job is losing the most?" from the same placement, power and job data, with evidence links to the jobs, incidents and placement tab; in an estate without GPUs it shall say so. | C | Neo | P2 |
| GPU-034 | The system shall show recommended actions per affected job (for example drain the failed node and restart from the last checkpoint on a spare; reseat or replace the NVLink part; restore CDU flow). These are carried out through incident actions, not by the system. | S | Neo | P1 |
| GPU-035 | The system shall export GPU job hours delivered and lost per customer per day to the billing interface. | C | Neo | P3 |
| GPU-036 | The system shall head the GPU Fleet screen with one row: title and a one-line subtitle, a live chip, a datacenter selector and the Opstral AI button; the tab bar (Clusters · Jobs · Nodes · GPU models · Telemetry · Cooling & power · Network · Where to place) fits one row at 1280 px. | S | Neo | P1 |
| GPU-037 | The system shall filter the jobs list by state (stalled, slowed, at risk, idle, running) and kind (training, fine-tuning, inference), and the nodes list by GPU model, condition (needs attention, failed, in a job, spare, drained, burn-in) and view (throttled, old driver, liquid-cooled), with free-text search. | M | Neo | P1 |
| GPU-038 | The system shall show the open driver-rollout change on nodes running their model's old driver and link to it in Change Management; the pod's standard driver is named in the filter. | S | Neo | P1 |
| GPU-039 | The system shall count node states (in a job, spare, drained, failed, burn-in) and GPU health (healthy, degraded, failed), throttle reasons (thermal, hardware slowdown, power cap), ECC single / double bit, row remaps pending, drift nodes, open RMAs and liquid-cooled nodes in the fleet summary, and show the DCGM field list the telemetry follows on the Telemetry tab. | S | Neo | P1 |
| GPU-040 | The system shall show per-counter leaders on the Telemetry tab: hottest GPUs, most PCIe replays, most NVLink errors, most correctable ECC errors and GPUs in a job under 5 % utilisation, each linking to its node. | S | Neo | P1 |
| GPU-041 | The system shall show a cluster's nodes on the datacenter Equipment tab with the 8-GPU strip for GPU nodes, and open a node by name from a cluster or GPU-models row (`?gtab=nodes&q=`). | S | Neo | P1 |

### 7.4.4 User stories and acceptance criteria
**US-GPU-01** As a GPU operations engineer, I want to see which jobs are stalled or slowed and why, so that I fix the costliest first (GPU-005, GPU-006, GPU-007).
- Given a training job whose node reports Xid 79, when I open GPU Fleet → Jobs, then the job shows Stalled with the cause "GPU n on node fell off the bus (Xid 79)".
- And the job shows the full job price per hour as lost now, and the work to redo since its last checkpoint.
- And it is listed first when it has the highest lost-now rate.

**US-GPU-02** As an operations head, I want one fleet health figure that I can trust, so that I know whether the product is healthy (GPU-009, BRULE-GPU-07/08).
- Given 152 GPUs in a stalled job, when I view the summary, then healthy % excludes those 152 GPUs and the status is Critical.
- Given only spares are idle, then the status is not reduced.

**US-GPU-03** As a NOC engineer, I want node-level DCGM detail, so that I can confirm a hardware fault before I raise an RMA (GPU-010, GPU-012, GPU-014).
- Given a node with a row remap pending, when I open it, then the GPU strip marks that GPU, the ECC and row remap counters are shown, and a 24 h sparkline ends on the current value.

**US-GPU-04** As a facility engineer, I want to see the liquid loops feeding GPU racks, so that I catch low flow before GPUs throttle (GPU-019, GPU-020).
- Given a CDU whose pump A has seized and flow is below 90 % of nominal, when I open Cooling & power, then the CDU shows warn / bad, lists its racks, the jobs on those racks show Slowed with the hardware-slowdown cause, and a Cooling incident links them.

**US-GPU-09** As a GPU operations engineer, I want a slowed job to show even when no incident is open, so that waste is not hidden behind ticketing (GPU-005, GPU-008, BRULE-GPU-18).
- Given an InfiniBand rail flapping on one node of a job and no incident, then the job shows Slowed with the rail as its cause, its lost-now rate, and "no incident open".
- Given an inference allocation idle for 6 h, then it shows Idle with its lost-now rate and no alarm is raised.

**US-GPU-05** As a capacity planner, I want to know where a 64-GPU H100 job fits best, so that new work goes where power is already paid (GPU-026).
- Given I enter 64 GPUs and H100, when the list renders, then each pod shows its fit (Good / Tight / No) and the reasons, and pods with idle contracted power rank above pods that need new demand.

**US-GPU-06** As a finance / ops lead, I want to see the power cost per sold GPU-hour against the price, so that I know the margin left after power (GPU-024).
- Given a pod at 60 % utilisation, when I view power cost, then the cost per sold GPU-hour is higher than the cost per installed GPU-hour, by installed ÷ earning GPUs.

**US-GPU-07** As a colocation operator, I want to see my tenants' AI cages, so that I can protect their power and cooling without touching their GPUs (GPU-021).
- Given the colocation model, when I open GPU Fleet, then I see cages with contracted kW, draw, CDU and inlet temperature, and no jobs, nodes or DCGM fields.

**US-GPU-08** As a customer success manager, I want to see which premium customers' jobs are hurt, so that I contact them before they call (GPU-005, GPU-022).
- Given a slowed job of a premium customer, then the job row shows the premium flag and the linked incident.

### 7.4.5 Data
| Entity | Read / write | System of record | Notes |
|---|---|---|---|
| GPU cluster / pod | Read | DCIM / Inventory (record), scheduler (membership) | one model per pod |
| GPU node | Read | Inventory (asset), collector (state) | server model, driver, cooling, rack |
| GPU (per accelerator) | Read | Collector (DCGM / vendor exporter) | live telemetry, 24 h history |
| Job | Read | Customer's scheduler (Slurm / K8s / Run:ai) | metadata only; MFU / step / checkpoint if exported |
| Customer, price per GPU | Read | BSS Customers / Plans & Products Catalog | rate × model factor |
| CDU / cooling loop | Read | BMS (live), DCIM (record) | flow, temperatures, racks fed |
| Tenant AI cage | Read | DCIM + CRM contract (contracted kW), PDUs (draw) | colocation only |
| Tariff, PUE, power contract | Read | Power economics (7.8), EPMS meters | per site |
| GPU alarm / incident | Read | Ops Toolkit System Alerts / ITSM Incidents | enriched per 7.5 |
| GPU model catalogue | Read | SynapseDC reference data | memory, TDP, links, price factor |

### 7.4.6 Integrations
| System / module | Direction | Data | Interface |
|---|---|---|---|
| dcgm-exporter / Gaudi exporter / XPU Manager | In | per-GPU telemetry, Xid, health | INT-11 |
| Slurm REST / Kubernetes API / Run:ai | In | jobs, nodes allocated, state, customer | INT-12 |
| NVIDIA UFM or host IB counters | In | IB rails, symbol errors, flaps | INT-13 |
| Server BMCs (Redfish) | In | PSUs, fans, temperatures, firmware | INT-03 |
| BMS (CDU loops) | In | flow, supply / return, pump | INT-08 |
| Rack PDUs | In | rack and cage draw | INT-05 |
| BSS Customers / Catalog | In | job owner, premium, GPU rate | EW, NB-07 |
| Ops Toolkit System Alerts, ITSM Incidents | Out / In | GPU alarms, incidents | EW, NB-04 |
| Billing | Out | GPU hours delivered / lost | NB-07 |
| REST API / events | Out | `dco.gpu.job.state-changed` | NB-01, NB-02/03 |
| Tenant-scoped API | Out | a customer's own jobs and GPU health | NB-12 (to discuss) |

### 7.4.7 Reports and KPIs
- Fleet health % = healthy and full-speed GPUs ÷ installed GPUs.
- GPU utilisation in jobs = mean SM active over GPUs in a running job.
- GPU time lost per hour = Σ lost-now per job (BRULE-GPU-03); split stalled / slowed / idle.
- Work to redo = Σ job price per hour × hours since the last checkpoint (stalled jobs).
- At stake = Σ job price per hour × checkpoint interval (at-risk jobs).
- Allocation share = GPUs in a job ÷ installed GPUs; idle allocation GPUs.
- Energy 24 h (MWh), average power as % of TDP.
- Power cost per installed / sold GPU-hour; power share of price %.
- Xid events per 24 h; ECC double-bit totals; throttled GPUs by reason.

### 7.4.8 Screens
| Screen / tab | Purpose | Reference route |
|---|---|---|
| GPU Fleet → Clusters (default) | head row, strip, Jobs needing attention, cluster cards with per-node cells | `/gpu` (`?gtab=clusters`) |
| Jobs | jobs and their money effect | `/gpu?gtab=jobs&dc=` |
| Clusters / Nodes | pods, heat map, node list, node drawer | `/gpu?gtab=clusters`, `/gpu?gtab=nodes` |
| Telemetry | DCGM fleet view | `/gpu?gtab=telemetry` |
| GPU models | vendors and models | `/gpu?gtab=models&gmodel=` |
| Network | IB / Ethernet / OOB rails | `/gpu?gtab=fabric` |
| Cooling & power | CDUs, GPU racks, power cost, energy by job / tenant | `/gpu?gtab=cooling` |
| Where to place | ranked pods for a new job | `/gpu?gtab=placement` |
| Datacenter → Infrastructure → GPU Fleet | the same views for one site | `/datacenters/:id?tab=gpu` |
| Device → GPUs · DCGM (GPUs · Intel for Gaudi / Max) | per-node health and profiling | `/ne/:id?tab=gpus` |
| Command Center → GPU fleet area | % healthy, status, detail, site chips | `/` |
| Datacenter → Equipment | 8-GPU strip on GPU nodes | `/datacenters/:id?tab=equipment` |

---

## 7.5 Datacenter alarm scope, correlation and incident enrichment

**Purpose.** Turn the raw alarms from every source into one normalised, de-duplicated stream that is placed on the datacenter. Decide whether each alarm counts against the site. Group related alarms into incidents enriched with impact, ranked root-cause hypotheses (with change evidence), recommended actions and verification. The alarm and the incident remain records of the existing platform modules; SynapseDC adds the datacenter intelligence.
**Lifecycle stage:** Operate.
**Primary users:** NOC engineer, facility engineer, incident manager, on-call engineer, operations head.
**Builds on:** Ops Toolkit System Alerts (alarm record, routing, paging), Services & ITSM Incidents, Problems and Change Management (records, workflow, approvals), BSS Experience and Care (customer notices).

**Colocation:** tenant gear is never polled, so tenant-cabinet alarms come only from power (PDU, breaker, cabinet over contracted power) and environment (inlet, leak, door). A tenant over its own power budget is an alarm and a commercial matter, not a datacenter fault. Cross-connect and remote-hands tickets sit beside incidents.
**NeoCloud:** GPU alarms (Xid, ECC, NVLink, throttle, CDU) are a domain of their own (incident type GPU). A job's service is hit by a fault on any of its nodes. Fabric alarms are reported by plane (InfiniBand, Ethernet front-end, OOB).

### 7.5.1 Scope
**In scope**
- Normalising source events into one Alert shape.
- Alarm identity, de-duplication, clearing and flapping.
- Severity mapping, placement on the record tree, and scope (site / edge / dependency / downstream).
- Edge redundancy state.
- Correlation into incidents.
- Ranked RCA hypotheses with evidence (alarms, recent changes, topology, optics lots).
- Impact (services, customers, premium, money).
- Recommended action steps with owner, expected result, rollback and verify.
- Verification checks, problem grouping, the on-call / paging chain view, and customer notice timers.

**Out of scope**
- The alarm store, routing rules and notification delivery: Ops Toolkit System Alerts and Service Ops.
- The incident, problem and change records, assignment, approval workflow and CAB: Services & ITSM.
- Paging delivery: PagerDuty / the platform's paging.
- Customer communication delivery: BSS Experience and Care.

### 7.5.2 Business rules
| ID | Rule |
|---|---|
| BRULE-ALM-01 | Alarm identity = source + node + resource + alarm type. A repeat updates last-seen and count; a clear closes the alarm. Sources without a clear close the alarm after the condition has been absent for two polling intervals. |
| BRULE-ALM-02 | Flapping: more than 3 raise / clear cycles in 15 minutes holds the alarm open, marked flapping (feeds flaps-24h per interface and the "rail flapping" state). |
| BRULE-ALM-03 | Alarm severities are Critical / Major / Minor / Warning, mapped from the source scale by a configuration table: syslog 0–2 / 3 / 4 / 5 (6–7 are not alarms); ServiceNow Event Management 1 / 2 / 3 / 4; Redfish Critical / Warning on a redundancy loss / Warning; UPS on battery, depleted, overload = Critical, low battery, bypass, charger = Major, fan = Minor; Xid per BRULE-GPU-10; VESDA Fire 1/2 = Critical, Action = Major, Alert = Minor. |
| BRULE-ALM-04 | Scope **site** = inside the datacenter (facility, racked devices, internal links). **edge** = a link with exactly one end in the site, counted at both ends. **dependency** = the far-end node as it affects the edge link, shared AAA / NTP, collectors. **downstream** = remote PoPs and sites that depend on this datacenter. Downstream alarms are never counted. When the datacenter is the cause, they appear as `symptomOf` impact under its incident. |
| BRULE-ALM-05 | Only site, edge and dependency alarms count in a datacenter's issue counts. |
| BRULE-ALM-06 | Edge redundancy per site: Isolated when no edge link is up; Redundancy lost when at least one edge link is down and at least one is up; else Redundant. Isolated makes the site Critical; Redundancy lost makes it Attention. |
| BRULE-ALM-07 | A rack-level fault (PDU breaker, cabinet power, inlet temperature) carries the rack, so every service hosted in that rack is affected. One physical fault seen on several devices carries a shared fault id and location. |
| BRULE-ALM-08 | Alarms that share a fault, a rack, a link, or a power / cooling upstream within a short window are grouped into one incident. |
| BRULE-ALM-09 | Incident severities are Critical / High / Medium / Low (stored 1–4); statuses Open, Investigating, Mitigated, Resolved, Closed; types Network, Power, Cooling, Rack, Capacity, Security, GPU. Priority P1–P4 is shown only when it differs from severity. Response SLA = 15 / 30 / 60 / 240 min and resolve SLA = 4 / 8 / 24 / 72 h for Critical / High / Medium / Low; an incident is past SLA when the open clock exceeds its target. |
| BRULE-ALM-10 | RCA hypotheses are ranked by confidence (the shares of 100 % across the listed hypotheses). Evidence = alarms, a change completed within 3 days before detection at the site or on the path, topology (an upstream device or power stage explains its downstream alarms), and the optics lot from inventory. |
| BRULE-ALM-11 | A completed change cited by an incident's leading hypothesis is marked "Caused an incident" in Change Management and counts as a failed change. |
| BRULE-ALM-12 | Incidents grouped by a common cause (for example every incident whose evidence or plan names the same optics lot, else type + normalised title) form one problem record with a workaround and a fix; its state is Fix in change (a change is open for it), Investigating (an incident is still open) or Known error. |
| BRULE-ALM-13 | Customer notices: the initial notice is due 15 / 30 / 60 min after detection for Critical / High / Medium or Low, then updates every 1 / 2 / 4 h until resolved, and a resolution notice 20 min after resolution. A missed update is flagged overdue from the minute it was due. |
| BRULE-ALM-14 | Default verification: all correlated alarms cleared; health checks green for 15 minutes; affected services back within SLA. |
| BRULE-ALM-15 | A source silent for two intervals marks its values stale and raises a monitoring-gap alarm. A device with no poll for 15 minutes becomes unmonitored. A collector silent for 15 minutes turns the site's collector chip stale. |
| BRULE-ALM-16 | An open Critical incident at a site freezes non-emergency changes there (Change Management policy). |
| BRULE-ALM-17 | On-call per region: the geography's people rotate weekly, day shift 08–20 and night shift 20–08, in the roles NOC shift lead (tier 1, escalate after 15 min), network engineer, facility engineer and field technician (tier 2, 30 / 30 / 60 min), AI infrastructure engineer at GPU sites (tier 2, 30 min) and duty manager (tier 3, 60 min, whole week). Paging chain: L1 at once; the owner's role (L2) when acknowledged or after L1's escalation time; the duty manager at 30 min for a Critical incident. Next escalation = the duty manager at 60 min while unacknowledged, else at 75 % of the resolve SLA for Critical / High. The customer's paging tool replaces the rota where one exists. |
| BRULE-ALM-18 | Similar incidents: an incident names other devices with the same signature (for example four nodes on the same optics vendor batch), which suggests a batch-level RMA rather than separate ones. |

### 7.5.3 Functional requirements
| ID | Requirement | Priority | Model | Phase |
|---|---|---|---|---|
| ALM-001 | The system shall convert every incoming event (trap, syslog, Redfish event, DCGM Xid, BACnet notification, Modbus threshold, PACS event, collector probe) into the normalised Alert shape at the collector. | M | Both | P1 |
| ALM-002 | The system shall send both the normalised alarm and the raw event to Ops Toolkit System Alerts through its API, so the alert record keeps both for audit and replay. | M | Both | P1 |
| ALM-003 | The system shall de-duplicate and clear alarms per BRULE-ALM-01. | M | Both | P1 |
| ALM-004 | The system shall detect flapping per BRULE-ALM-02 and mark the alarm flapping. | M | Both | P1 |
| ALM-005 | The system shall map source severity to Critical / Major / Minor / Warning from an editable mapping table. | M | Both | P1 |
| ALM-006 | The system shall place each alarm on site → floor → room → rack → device → port by address or serial match to the DCIM record. | M | Both | P1 |
| ALM-007 | The system shall assign each alarm a scope (site / edge / dependency / downstream) and a category (Facility / Network / Device / Performance). | M | Both | P1 |
| ALM-008 | The system shall exclude downstream alarms from every datacenter count and show them as symptoms under the causing incident. | M | Both | P1 |
| ALM-009 | The system shall compute edge redundancy per site per BRULE-ALM-06. | M | Both | P1 |
| ALM-010 | The system shall attach rack and shared-fault references per BRULE-ALM-07. | M | Both | P1 |
| ALM-011 | The system shall publish normalised alarms to Ops Toolkit System Alerts and keep the identity as the de-duplication key. | M | Both | P1 |
| ALM-012 | The system shall provide an Alerts list with an analytics strip of six tiles (active alarms by severity with the unacknowledged count, acknowledged %, correlated into incidents, categories active, raised in the last 24 h by hour, top three datacenters), filters by site, device, severity, state (open / active only / acknowledged / cleared / all), scope, category and source, and the actions Acknowledge and Correlate into incident on selected alarms. | M | Both | P1 |
| ALM-013 | The system shall correlate alarms into incidents per BRULE-ALM-08 and create or update the incident in Services & ITSM Incidents. | M | Both | P1 |
| ALM-014 | The system shall assign the incident type (Network, Power, Cooling, Rack, Capacity, Security, GPU), severity Critical / High / Medium / Low, priority, owner and reporter (Monitoring, BMS, DCIM, Capacity forecaster, Discovery), and show priority only when it differs from severity. | M | Both | P1 |
| ALM-015 | The system shall list affected objects per incident (device, link, rack, service, customer, facility). | M | Both | P1 |
| ALM-016 | The system shall compute incident impact: services, customers, premium customers, revenue at risk and a one-line summary with level High / Medium / Low. | M | Both | P1 |
| ALM-017 | The system shall produce ranked RCA hypotheses with confidence and evidence links per BRULE-ALM-10. | M | Both | P1 |
| ALM-018 | The system shall show recent changes at the site or on the affected path as evidence, and mark a change "Caused an incident" when the leading hypothesis cites it. | M | Both | P1 |
| ALM-019 | The system shall record a user's confirm / reject feedback on a hypothesis. | S | Both | P1 |
| ALM-020 | The system shall list recommended action steps with owner, expected result, rollback and verification, and track each step's status. | M | Both | P1 |
| ALM-021 | The system shall let a user raise an emergency change from an incident, linked to it. | S | Both | P1 |
| ALM-022 | The system shall run the verification checklist per BRULE-ALM-14 before an incident can be resolved. | M | Both | P1 |
| ALM-023 | The system shall show similar past incidents and the nodes they shared. | C | Both | P2 |
| ALM-024 | The system shall show the incident worklog from Services & ITSM and post its system and AI entries to it through the ITSM API (human entries are written in ITSM or through the same API). | M | Both | P1 |
| ALM-025 | The system shall group incidents into problems by common cause and show them on an Incidents → Problems tab. | S | Both | P2 |
| ALM-026 | The system shall show "On call & communications" per incident: on-call engineer from the rota or paging tool, paging chain, next escalation, ITSM reference, customer notice due times and overdue updates. | S | Both | P2 |
| ALM-027 | The system shall show the response and resolve SLA clocks per incident and flag past-SLA incidents. | M | Both | P1 |
| ALM-028 | The system shall show an incident's revenue impact panel from the Revenue Impact model. | M | Both | P1 |
| ALM-029 | The system shall raise monitoring-gap alarms through the System Alerts API and show the unmonitored device state per BRULE-ALM-15, using the freshness the OAP telemetry consumer API returns. | M | Both | P1 |
| ALM-030 | The system shall raise GPU alarms (Xid, ECC, NVLink, throttle) through the System Alerts API and open GPU-type incidents that list the affected jobs through the Services & ITSM API. | M | Neo | P1 |
| ALM-031 | The system shall raise tenant cabinet alarms from power and environment only, and treat a tenant inside its own contracted power as not a datacenter fault. | M | Colo | P1 |
| ALM-032 | The system shall raise power-contract findings (block ≥ 85 % drawn, new demand peak above the floor, unexplained draw > 12 % over the 24 h mean, block ≥ 30 % idle) as Power alarms, and one Medium Power incident for the costliest block or ratchet finding. | S | Both | P2 |
| ALM-033 | The system shall show incident list views Open, Critical open, High open, Breaching SLA and All, a datacenter filter and a Problems tab; the datacenter Needs attention tab shall open with four figure tiles (past SLA, unacknowledged, oldest open, MTTR 30 d) and the list "Resolved · last 7 days". | M | Both | P1 |
| ALM-034 | The system shall emit `dco.alert.*` and `dco.incident.*` events for every lifecycle change. | M | Both | P1 |
| ALM-035 | The system shall answer Opstral AI questions about an incident's cause, what changed before it and its impact from the same RCA, change and impact data. | C | Both | P2 |
| ALM-036 | The system shall let a user correlate selected uncorrelated alarms that share a cause into one incident by hand, and show per alarm the incident it belongs to. | S | Both | P1 |
| ALM-037 | The system shall show per alarm its severity, scope, category, source, title, device and port or link, site, start time, state, count and acknowledged-by, and open the device, link or incident from the row. | M | Both | P1 |
| ALM-038 | The system shall raise hardware alarms (failed disk, failed PSU) on the operator's own servers with the RMA case they open, never marking a server unreachable for a part fault. | S | Both | P1 |
| ALM-039 | The system shall show the incident's similar incidents (BRULE-ALM-18) and the on-call rota of the site's region with the current shift. | S | Both | P2 |

### 7.5.4 User stories and acceptance criteria
**US-ALM-01** As a NOC engineer, I want a single alarm for a repeating trap, so that the list is not flooded (ALM-003, ALM-004).
- Given 40 linkDown / linkUp traps on one port in 15 minutes, when I open Alerts, then one alarm is shown, marked flapping, with its count.

**US-ALM-02** As an operations head, I want a remote PoP outage caused by my backhaul not to count as a second datacenter issue, so that the counts are honest (ALM-008).
- Given a backhaul fault at the site and an alarm at the far PoP, then the site's count includes the edge alarm only, and the PoP appears under the incident as a symptom.

**US-ALM-03** As an incident manager, I want the most likely cause with its evidence, so that I act on the right fix (ALM-017, ALM-018).
- Given a port flapping 15 h after a change re-patched its ODF core, when I open the incident, then the leading hypothesis is a physical-layer fault, the change is listed as evidence, and the change shows "Caused an incident".

**US-ALM-04** As a facility engineer, I want one incident for a UPS on battery and its downstream alarms, so that I am not chasing many alarms (ALM-013).
- Given feed A is lost and UPS-2 is on battery, then one Power incident groups the UPS, ATS and rack alarms, and its affected list includes the racks on the A side.

**US-ALM-05** As an incident manager, I want the incident to sync with ServiceNow, so that my process does not change (ALM-013, ALM-024).
- Given an incident is opened, then a ServiceNow incident is created with the correlation id, and work notes added on either side appear on both.

**US-ALM-06** As an incident manager, I want to resolve only after verification, so that problems do not come back (ALM-022).
- Given a check is still open, when I try to resolve, then the system blocks it and lists the open checks.

**US-ALM-07** As a customer success manager, I want to see when the next customer update is due, so that notices are never late (ALM-026).
- Given a Critical incident open for 80 min with no update since the initial notice at 15 min, then the update due at 75 min shows as overdue, and the next escalation names the duty manager.

**US-ALM-08** As a GPU operations engineer, I want GPU faults as GPU incidents listing the hurt jobs, so that I see the business effect immediately (ALM-030).
- Given Xid 79 on a node in a 152-GPU job, then a GPU incident lists that job as Stalled with its lost-now rate.

### 7.5.5 Data
| Entity | Read / write | System of record | Notes |
|---|---|---|---|
| Alert (normalised) | Write (publish) | Ops Toolkit System Alerts | SynapseDC adds scope, category, rack, fault, symptomOf |
| Raw event | Write | SynapseDC event store | audit / replay |
| Incident | Read / write | Services & ITSM Incidents | SynapseDC adds impact, RCA, actions, verification |
| Problem | Read / write | Services & ITSM (Problem) | grouping by cause |
| Change | Read | Services & ITSM Change Management | evidence; "Caused an incident" flag written back |
| Severity mapping, scope rules | Read / write | SynapseDC configuration | editable tables |
| Topology, DCIM records, services | Read | DCIM / Inventory, BSS Orders | placement and impact |
| On-call rota, paging chain | Read | Paging tool or ITSM / SynapseDC rota | |
| Customer notice | Write (request) | BSS Experience and Care | timers from BRULE-ALM-13 |

### 7.5.6 Integrations
| System / module | Direction | Data | Interface |
|---|---|---|---|
| All southbound sources via the collector | In | events, traps, syslog, health | INT-01…13, INT-28 |
| Ops Toolkit System Alerts | Out | normalised alarms | EW |
| Services & ITSM (or ServiceNow / Jira SM) | Out / In | incidents, problems, changes, work notes | EW, NB-04 |
| PagerDuty / Opsgenie | Out / In | trigger / ack / resolve, on-call | NB-05 |
| Email / SMS / Slack / Teams; Experience and Care | Out | customer notices | NB-06, EW |
| BSS Orders / Customers | In | services and paths, premium | EW, INT-25 |
| REST API, events | Out | alerts, incidents | NB-01, NB-02/03 |
| SIEM | Out | security-relevant alarms | NB-10 |

### 7.5.7 Reports and KPIs
- Open alarms by severity and scope; alarms per site (site + edge + dependency only).
- Noise reduction = raw events ÷ normalised alarms.
- Open incidents by severity; past SLA; unacknowledged; oldest open.
- MTTA = mean (acknowledged − detected); MTTR 30 d = mean (resolved − detected) over incidents resolved in 30 days.
- RCA accuracy = hypotheses confirmed ÷ (confirmed + rejected).
- Change-caused incidents % = incidents whose leading hypothesis cites a change ÷ incidents.
- Customer notices on time % = notices sent by their due time ÷ notices due.
- Monitoring coverage = monitored devices ÷ installed devices.

### 7.5.8 Screens
| Screen / tab | Purpose | Reference route |
|---|---|---|
| Alerts | normalised alarms with scope | `/alerts` |
| Incidents | list with views and revenue column | `/incidents?view=open|sev1|high|breaching|all&dc=` |
| Incident page | impact, RCA, actions, verification, on call & communications, revenue | `/incidents/:id` |
| Incidents → Problems | problem records | `/incidents?tab=problems&prb=` |
| Datacenter → Needs attention | open incidents, alarms by category, on call now | `/datacenters/:id?tab=attention` |
| Command Center | hero numbers, What is happening / Who is affected / Recommendations | `/` |

---

## 7.6 Revenue Impact

**Purpose.** Show what every open datacenter issue is costing now, and what it puts at stake: revenue not delivered, SLA credits triggered, the next credit cliff and a 24-hour forecast. Each figure is charged to exactly one issue, so the totals reconcile across issues, datacenters and customers. Operations can then rank work by business effect.
**Lifecycle stage:** Operate.
**Primary users:** operations head, incident manager, customer success / account manager, finance controller.
**Builds on:** new (no platform module covers it). It reads BSS Customers / Orders / Catalog (contracts, charges, SLA) and ITSM Incidents.

**Colocation:** a tenant running hot inside its own contracted size, or over its own power budget, is not a loss (it is a commercial conversation). Losses come from the operator's faults: cabinet power loss, cooling, cross-connects and the meet-me room. Credits follow the colocation contract tiers.
**NeoCloud:** each GPU job is a service. Domain GPU (Xid / ECC / NVLink) is a cause, and GPU heat counts as Cooling. The customer is billed the job's GPU-month rate. Revenue counts what the customer is billed; GPU Fleet separately counts productive GPU time lost.

### 7.6.1 Scope
**In scope**
- Service impact states (down, degraded, exposed) and attribution to one issue.
- Money: lost so far, rate, credits, locked-in credits, next cliff, forecast 24 h, potential if it fails.
- A cost-of-delay curve.
- Views by issue, customer, datacenter and cause domain.
- 30-day history; the "One failure away" list.
- Revenue panels on the incident, datacenter and customer pages, and a revenue column on lists.
- An explanation drawer ("How it is calculated").

**Out of scope**
- Invoicing and credit notes: the customer's billing system (the platform has no billing module).
- Contracts and price lists as records: BSS CRM, Customers and Plans & Products Catalog.
- Per-contract custom credit formulas beyond the tier table (to discuss).

### 7.6.2 Business rules
| ID | Rule |
|---|---|
| BRULE-REV-01 | A service is **down** when its status is Down, and **degraded** when Degraded (both are losing now). It is **exposed** when it is Active but rides a Critical fault: UPS on battery, a failed cooling unit, or a Critical alarm on its own path. |
| BRULE-REV-02 | Not a loss: a service hot inside its own contracted size (utilisation causes), or a tenant over its own power budget. |
| BRULE-REV-03 | Each impacted service is charged to ONE issue = its most severe cause. Order: link / port / rack / site before device, single-PSU last. The issue is the open incident tracking that alarm; otherwise faults are grouped by site + title. |
| BRULE-REV-04 | Rate = monthly charge ÷ 730 h; × 1.0 when down, × 0.3 when degraded; 0 when exposed. |
| BRULE-REV-05 | Lost = rate × hours since the alarm began. |
| BRULE-REV-06 | SLA credit: the 30-day uptime drops by the impacted minutes (÷ 43,200 min). The shortfall below the SLA target picks the tier: > 0 → 10 %, ≥ 0.5 pt → 25 %, ≥ 2 pt → 50 % of the monthly charge. The issue is charged only the extra tier it causes. |
| BRULE-REV-07 | Credits already owed before this fault (uptime30d already below target) are "locked in". They are reported separately and booked to an earlier incident at the site, never to the current issue. |
| BRULE-REV-08 | Next cliff = the time until the next credit tier step and its amount; cliffs within 30 minutes of the first are grouped into one; the strip also counts the cliffs within 60 minutes. |
| BRULE-REV-09 | Forecast 24 h = lost + credits if the issue is still open 24 h from now. The cost-of-delay curve samples from the fault start to 24 h ahead (48 points, the past share by elapsed time); an exposed-only issue's curve starts at now and reads "if it fails now". |
| BRULE-REV-10 | Exposed: potential rate = Σ hourly charge of the exposed services. Potential credits = the tier step caused by a 4-hour outage (the Critical resolution target). |
| BRULE-REV-11 | Losses are charged to the datacenter where the fault is. A backhaul fault that degrades services homed at the far-end site is charged to the faulty site. |
| BRULE-REV-12 | Reconciliation: Σ issues = Σ causes = Σ datacenters = Σ customers = Σ site views = total. |
| BRULE-REV-13 | Issue ranking: severity weight, then rate, then potential (credits + rate × 4 h), then monthly revenue exposed. |
| BRULE-REV-14 | 30-day history = resolved incidents (duration × severity weight 0.6 for Critical / High, 0.3 Medium, 0.12 Low × site average) + locked-in credits + today's open impact. |
| BRULE-REV-15 | Money is written in the geography's currency and number format. Enterprise wording is Business value / Cost of downtime / OLA rebates. |
| BRULE-REV-16 | GPU jobs: the service's monthly charge = GPUs × persona rate × model price factor. A fault on any node of the job hits that service. |
| BRULE-REV-17 | Within SLA · 30 d = the share of monthly revenue whose services meet their SLA target over 30 days. Credits owed = credits triggered by open issues + credits locked in over 30 days. |
| BRULE-REV-18 | Customer state = the worst of the customer's services: losing now (down / degraded), running on a critical fault (exposed), below SLA over 30 days, on an open incident's path, else normal; the verdict line names the main cause and opens the fault. Running hot is never a loss. |

### 7.6.3 Functional requirements
| ID | Requirement | Priority | Model | Phase |
|---|---|---|---|---|
| REV-001 | The system shall classify every service as down, degraded, exposed or not impacted per BRULE-REV-01/02. | M | Both | P1 |
| REV-002 | The system shall charge each impacted service to exactly one issue per BRULE-REV-03. | M | Both | P1 |
| REV-003 | The system shall compute rate, lost, credits, locked-in credits, next cliff, forecast 24 h, potential rate and potential credits per BRULE-REV-04 to 10. | M | Both | P1 |
| REV-004 | The system shall charge losses to the datacenter where the fault is (BRULE-REV-11). | M | Both | P1 |
| REV-005 | The system shall reconcile totals across issues, causes, datacenters, customers and site views (BRULE-REV-12) and fail the build check when they differ. | M | Both | P1 |
| REV-006 | The system shall show a strip of six tiles, each opening the matching view: Losing now (per hour, split down / degraded), Impact so far (lost + credits, with the +24 h forecast), At stake (monthly charge of exposed services by domain, with the hourly loss if they fail), Credits owed (open issues + locked in 30 d, with the next cliff), Costliest cause · 30 d (by domain) and Within SLA · 30 d (% of monthly revenue). | M | Both | P1 |
| REV-007 | The system shall show the answer cards "Costing the most right now" and "Most at stake", each with a cost-of-delay curve from the fault start to 24 h ahead. | M | Both | P1 |
| REV-008 | The system shall list issues ranked per BRULE-REV-13 with services down / degraded / exposed, customers, premium, rate, lost, credits, next cliff and forecast. | M | Both | P1 |
| REV-009 | The system shall open a cost-breakdown drawer per issue, listing every service, its state, rate, minutes, credit tier step and cliff. | M | Both | P1 |
| REV-010 | The system shall list customers with monthly revenue, services by state, money, locked-in credits, next cliff, SLA target against uptime, and the main cause. | M | Both | P1 |
| REV-011 | The system shall list datacenters with money, issues and services impacted. | M | Both | P1 |
| REV-012 | The system shall show causes by domain (Power, Cooling, Network, Rack, Device, GPU) and the 30-day trend (BRULE-REV-14). | S | Both | P1 |
| REV-013 | The system shall show "One failure away": exposed services ranked by potential cost if the fault fails. | S | Both | P1 |
| REV-014 | The system shall show a "How it is calculated" drawer with every formula and constant. | M | Both | P1 |
| REV-015 | The system shall show a revenue impact panel on the incident page (rate, lost, credits, cliff, curve, services). | M | Both | P1 |
| REV-016 | The system shall show a datacenter Revenue tab with the same model scoped to the site. | M | Both | P1 |
| REV-017 | The system shall show a revenue column on the Datacenters and Incidents lists. | S | Both | P1 |
| REV-018 | The system shall show on the customer page what is impacting the customer, with money per issue. | M | Both | P1 |
| REV-019 | The system shall treat GPU jobs as services and classify GPU-domain causes (BRULE-REV-16). | M | Neo | P1 |
| REV-020 | The system shall not count a tenant inside its contracted size, or over its own power budget, as a loss. | M | Colo | P1 |
| REV-021 | The system shall use persona vocabulary for money words, keeping SLA / OLA capitalised. | S | Both | P1 |
| REV-022 | The system shall format money in the geography's currency and number locale. | M | Both | P1 |
| REV-023 | The system shall emit `dco.revenue.impact-changed` when an issue's money at risk crosses a configured band. | S | Both | P2 |
| REV-024 | The system shall export SLA credits owed per customer (minutes, tier, amount) to the billing interface on incident close and monthly. | S | Both | P2 |
| REV-025 | The system shall read monthly charge, SLA target and premium flag per service from BSS (or the customer's CRM). The tier table is configurable. | M | Both | P1 |
| REV-026 | The system shall support per-contract credit rules in place of the single tier table (to discuss). | C | Both | P3 |
| REV-027 | The system shall answer Opstral AI questions "Which issue is costing the most revenue?" and "What is INC-n costing us?". | C | Both | P2 |
| REV-028 | The system shall show a premium-customer impact figure on the Command Center that opens "Who is affected". | M | Both | P1 |
| REV-029 | The system shall provide the customer page: an identity header (avatar, state, facts row, a one-line verdict naming the main cause with a link to the fault), a strip of six tiles (services by status, impacted now, SLA 30 d against target with credits owed, utilisation, monthly revenue by service type, open issues), "What is impacting this customer" (issues with money per issue) beside "Where they are served", then the service grid with per-service state, path and cause. | M | Both | P1 |
| REV-030 | The system shall show on a colocation customer's page their cross-connect orders and remote-hands tickets beside the impact panels. | S | Colo | P2 |
| REV-031 | The system shall show "Why at risk" per customer on customer lists (the causes of their impacted services) and open the customer page from any list, incident or site. | S | Both | P1 |

### 7.6.4 User stories and acceptance criteria
**US-REV-01** As an operations head, I want to know which issue costs the most right now, so that it is fixed first (REV-007, REV-008).
- Given two open incidents, then "Costing the most right now" names the one with the higher severity weight and rate, with its rate, lost so far and next cliff.

**US-REV-02** As a finance controller, I want numbers that add up, so that I can trust them (REV-005).
- Given any view, then Σ issues = Σ datacenters = Σ customers = total, to the unit.

**US-REV-03** As an account manager, I want to know when a customer's credit steps up, so that I can escalate before it does (REV-003, REV-010).
- Given a service at 0.4 pt below its SLA target, then its next cliff shows the minutes until 0.5 pt and the extra 15 % of the monthly charge.

**US-REV-04** As an incident manager, I want to see the exposure when nothing is down yet, so that a UPS on battery gets urgency (REV-013).
- Given UPS-2 on battery and its services still Active, then those services are exposed, the issue shows the potential rate and the potential credits after a 4-hour outage, and lost = 0.

**US-REV-05** As a colocation operator, I want a tenant over its own power budget not to show as lost revenue, so that the screen is not alarmist (REV-020).
- Given a cabinet drawing above contracted kW with no fault, then no money is charged and the cabinet appears only as a power alarm.

**US-REV-06** As a NeoCloud operator, I want a stalled training job priced as a service, so that its customer impact appears (REV-019).
- Given a stalled job of 152 GPUs, then its service is down, charged to the GPU incident, with rate = monthly charge ÷ 730.

**US-REV-07** As a finance controller, I want to see how a number is computed, so that I can audit it (REV-014).
- When I open "How it is calculated", then I see the formulas of BRULE-REV-04 to 10 with the constants 730 h, 0.3, 10 / 25 / 50 % and 4 h.

### 7.6.5 Data
| Entity | Read / write | System of record | Notes |
|---|---|---|---|
| Service (monthly charge, SLA target, uptime30d, status, path) | Read | BSS Orders / Customers; status from SynapseDC | the base of impact |
| Customer (premium, segment, account manager) | Read | BSS CRM / Customers | |
| Contract credit rules | Read | BSS / CRM contract | tier table by default |
| Incident, alarm, impact cause | Read | ITSM Incidents / System Alerts + SynapseDC enrichment | since, incidentId, domain |
| Revenue view (issues, customers, DCs, causes, history) | Derived | SynapseDC | recomputed per data version |
| SLA credits owed | Write (export) | billing | |

### 7.6.6 Integrations
| System / module | Direction | Data | Interface |
|---|---|---|---|
| BSS CRM / Customers / Orders / Catalog | In | customers, services, charges, SLA, premium | EW, NB-07, INT-23, INT-25 |
| Salesforce / SAP (when the customer runs its own) | In | accounts, contracts | NB-07 |
| Billing (SAP OData, Zuora, Chargebee) | Out | SLA credits, metered usage | NB-07 |
| ITSM Incidents | In | incident ids, severity, times | EW, NB-04 |
| REST API, events | Out | revenue impact, `dco.revenue.impact-changed` | NB-01, NB-02/03 |
| BI export | Out | daily revenue impact | NB-09 |

### 7.6.7 Reports and KPIs
- Losing now = Σ rate per hour of down + degraded services.
- Lost so far = Σ rate × hours since the fault.
- Credits triggered = Σ extra tier × monthly charge.
- Forecast 24 h = Σ (lost + credits) at now + 24 h.
- At stake = Σ potential rate × 4 h + potential credits.
- Revenue exposed (MRR) = Σ monthly charge of impacted services.
- Customers / premium customers affected.
- 30-day cost of downtime by domain; locked-in credits.

### 7.6.8 Screens
| Screen / tab | Purpose | Reference route |
|---|---|---|
| Revenue impact | strip, answer cards, tabs Issues · Customers · Datacenters · Causes & trend · One failure away | `/revenue?tab=&rview=losing|stake&cview=owed` |
| Issue drawer | cost breakdown | `/revenue` (row opens the drawer) |
| Datacenter → Business impact → Revenue | site view | `/datacenters/:id?tab=revenue` |
| Incident page → Revenue impact | per incident | `/incidents/:id` |
| Customer page | what is impacting the customer | `/customers/:id` |

---

## 7.7 Datacenter Security Ops

**Purpose.** Give the datacenter SOC one view of security across the network, management (BMC / OOB), compute and Kubernetes, facility OT and physical access, in the datacenter context: change windows, DCIM placement, access log. This covers detections, cases, threat coverage, vulnerabilities, hardening and drift, OT zones and physical protection, mapped to industry standards.
**Lifecycle stage:** Operate.
**Primary users:** SOC analyst, SOC engineer, security manager / CISO, facility security, compliance officer.
**Builds on:** Ops Toolkit Security Ops (SOC platform, case record, playbook engine). SynapseDC adds the datacenter detections, context and views.

**Colocation:** tenant equipment is out of scope (never monitored). Focus on the operator's network, operator servers (BMS / EPMS, access control, CCTV, DCIM, jump hosts), facility OT and physical security, including tenant cage doors. A typical story case is a jump-host compromise.
**NeoCloud:** adds GPU-node and Kubernetes detections (privileged pods, crypto-mining on idle GPU nodes, kubectl exec), and BMC / OOB detections on GPU servers. Workload contents are never inspected.

### 7.7.1 Scope
**In scope**
- Detections from datacenter rules (Sigma-style, ATT&CK-tagged), triage, dispositions.
- Cases following NIST SP 800-61 with playbooks.
- MITRE ATT&CK Enterprise + ICS coverage and a rules catalogue (enable, edit, new).
- Vulnerabilities prioritised by CVSS v4 + EPSS + CISA KEV → CISA SSVC.
- Hardening (CIS Benchmark / DISA STIG / vendor-guide checks) and configuration drift against the last approved config.
- OT security (IEC 62443 zones and conduits, SL-T vs SL-A).
- Physical security (EN 50600-2-5-style protection classes, access exceptions).
- NIST CSF 2.0 posture.
- Security data sources and coverage gaps (Admin).

**Out of scope**
- The SIEM / SOAR platform, case store and automation engine: Ops Toolkit Security Ops (or the customer's SIEM).
- The access-control and video systems themselves (PACS / VMS).
- Patch deployment: ITSM Change Management executes it.
- Threat-intel subscriptions (feeds such as NVD / KEV / EPSS / PSIRT replace the illustrative advisories).

### 7.7.2 Business rules
| ID | Rule |
|---|---|
| BRULE-SEC-01 | Sites in scope = every site that is not planned. |
| BRULE-SEC-02 | Telemetry path: sensors (TACACS+ / syslog / config backups, Redfish, osquery, Falco, Kubernetes audit, Trivy, Suricata, Zeek, NetFlow, passive OT sensor, PACS, VMS) → OpenTelemetry collectors → OCSF tables → rules compiled to queries. Datacenter context (DCIM, IPAM, change windows, tickets) is joined as lookup tables. |
| BRULE-SEC-03 | A device that is not discovered sends no telemetry, and it counts as a coverage gap. |
| BRULE-SEC-04 | Physical detections ARE the access log's security exceptions (tailgating, door forced / held open, anti-passback, repeated denials, after-hours entry, unescorted visitor, overstay, badge not returned), so both screens reconcile. |
| BRULE-SEC-05 | Unauthorised configuration change (SR-002) = running config differs from the last approved backup and no approved change request covers the device in that window. These are the drift findings with no CR. |
| BRULE-SEC-06 | Example thresholds: brute force = 20 or more failed TACACS+ logins to one device from one source in 10 min. BMC burst = 10 or more failed Redfish / IPMI logins in 10 min. Management port scan = one non-monitoring source touching 50 or more management addresses / ports in 5 min. SSH spraying = one source failing on 5 or more hosts with different accounts in 15 min. |
| BRULE-SEC-07 | OT detections: a Modbus/TCP write (function 5, 6, 15 or 16) to a UPS or cooling controller from a non-BMS / EPMS host; a setpoint changed outside a maintenance change; a login with default credentials on a UPS card or PDU; a new host speaking Modbus or BACnet; BMS alarm limits raised or disabled. |
| BRULE-SEC-08 | Cross-domain rule SR-060: a badge-in at a site followed by an unapproved change on a device in that site correlates into one case. |
| BRULE-SEC-09 | SSVC decision: KEV and (exposure open or asset crown jewel) → Act. KEV → Attend. EPSS ≥ 0.1 and exposure open → Attend. EPSS ≥ 0.1, or CVSS ≥ 9 on a non-standard asset → Track*. Otherwise → Track. |
| BRULE-SEC-10 | Due dates from the advisory date: Act 7 d, Attend 30 d, Track* 90 d, Track 180 d. |
| BRULE-SEC-11 | Case phases (NIST SP 800-61): Detection & analysis → Containment → Eradication → Recovery → Post-incident. |
| BRULE-SEC-12 | OT zone achieved level (SL-A) = target level (SL-T) minus 1 for each of: an open Act / Attend firmware finding in the zone, reachability from the IT network (when SL-T > 2), an any-any conduit rule. Minimum 1. |
| BRULE-SEC-13 | OT asset risk: default credentials and reachable from IT → Critical. Default credentials, or an Act vulnerability → High. Cleartext protocol and reachable from IT → Medium. Otherwise Low. |
| BRULE-SEC-14 | Posture rolls up to the six NIST CSF 2.0 functions (Govern, Identify, Protect, Detect, Respond, Recover), each with its basis and items. Respond = 0.7 × (open cases within SLA ÷ open cases × 100) + 0.3 × max(0, 100 − MTTA in minutes); Protect = hardening pass % − min(25, 0.4 × open Act findings) − min(10, 0.3 × OT default credentials); Identify = (inventory coverage % + 100) ÷ 2; Govern = 100 − 5 × access reviews due − min(20, expired badges still active). |
| BRULE-SEC-15 | Technique ids are MITRE ATT&CK Enterprise and ICS; physical rules carry an ISO 27001 control instead (A.7.1 perimeter, A.7.2 entry, A.7.3 offices and rooms, A.5.18 access rights). Hardening check ids are SynapseDC's own, mapped to CIS / STIG sections (not CIS numbering). Advisories shown before a live feed is connected are marked illustrative. |
| BRULE-SEC-16 | The system never blocks traffic, disables accounts or changes configuration. Containment steps are done by people, through a change or the SOC's own tools. |
| BRULE-SEC-17 | Site security score = 100 − 9 × open Critical detections − 3 × High − min(14, 1.2 × Act vulnerabilities) − 6 × unauthorised drifts (7 d) − 1.5 × open physical exceptions − 0.35 × (100 − hardening pass %) − 0.3 × (100 − sensor coverage %), floored at 0. |
| BRULE-SEC-18 | Rules are Sigma rules (log source, selection, condition) compiled to a query on the security data store; each keeps its source, the compiled query, its version, status (Stable / Test / Off) and who changed it last. Wazuh is not used; the security data store is ClickHouse with OCSF tables and datacenter context as dictionaries. |
| BRULE-SEC-19 | Reference story cases the acceptance tests use, per site: SEC-0001 a badge-in at the hero site followed by an unapproved ACL change opening management access on the WAN edge router (SR-060, Critical, Containment); SEC-0002 crypto-mining on idle GPU nodes (GPU estates) or a jump-host compromise by password spraying, a new admin and cleared logs (colocation); SEC-0003 an unknown device on the OOB network probing BMCs; SEC-0004 default credentials and a Modbus write on a UPS network card; SEC-0005 the worst open physical exception. Closed cases come from true-positive detections. |

### 7.7.3 Functional requirements
| ID | Requirement | Priority | Model | Phase |
|---|---|---|---|---|
| SEC-001 | The system shall provide a Security Ops menu with sub-menus Insights, Detections, Cases, Threat coverage, Vulnerabilities, Hardening & drift, OT security and Physical security, each scoped to one datacenter or all. | M | Both | P2 |
| SEC-002 | The system shall show Insights: NIST CSF 2.0 function scores with their basis, open detections and cases, Act vulnerabilities, coverage gaps and silent sources (linking to Security data sources). | M | Both | P2 |
| SEC-003 | The system shall evaluate datacenter detection rules across the domains Network, Management, Compute, Kubernetes, Facility OT, Physical and cross-domain. | M | Both | P2 |
| SEC-004 | The system shall tag every rule and detection with ATT&CK Enterprise or ICS techniques. | M | Both | P2 |
| SEC-005 | The system shall list detections with rule, severity, asset, site, technique, state and disposition, and let an analyst triage (assign, set state, set disposition true / false / benign positive) and attach to a case. | M | Both | P2 |
| SEC-006 | The system shall raise SR-002 detections from configuration drift with no covering change (BRULE-SEC-05). | M | Both | P2 |
| SEC-007 | The system shall raise physical detections from the access log's security exceptions so the counts equal the Access tab (BRULE-SEC-04). | M | Both | P2 |
| SEC-008 | The system shall correlate the cross-domain badge-in → unapproved change rule (SR-060) into one case. | S | Both | P2 |
| SEC-009 | The system shall detect crypto-mining, privileged pods / host mounts and kubectl exec on GPU nodes. | M | Neo | P2 |
| SEC-010 | The system shall detect BMC login bursts, unknown devices on OOB ports and BMC firmware changes outside a campaign. | M | Both | P2 |
| SEC-011 | The system shall detect the OT behaviours in BRULE-SEC-07. | M | Both | P2 |
| SEC-012 | The system shall manage cases through the NIST SP 800-61 phases with step checklists, notes, closure outcome and SLA. | M | Both | P2 |
| SEC-013 | The system shall offer playbooks per case type and show each step's owner. | S | Both | P2 |
| SEC-014 | The system shall sync cases with Ops Toolkit Security Ops (or the customer's SOAR) as the case record. | M | Both | P2 |
| SEC-015 | The system shall show ATT&CK coverage (techniques with an enabled rule and a live sensor) for Enterprise and ICS. | S | Both | P2 |
| SEC-016 | The system shall provide a rules catalogue: enable / disable, edit and create a rule (title, description, domain, sensors, techniques or ISO control, level, status, playbook, Sigma source and compiled query), with version history and detections per rule over 7 days (BRULE-SEC-18). | S | Both | P2 |
| SEC-017 | The system shall match advisories to firmware, OS and packages per asset and list vulnerabilities with CVSS v4, EPSS, KEV, exposure, SSVC decision and due date (BRULE-SEC-09/10). | M | Both | P2 |
| SEC-018 | The system shall let a user set a vulnerability state (Open, In remediation with a change link, Accepted with a note, Fixed). | M | Both | P2 |
| SEC-019 | The system shall replace the illustrative advisories with live NVD / CISA KEV / FIRST EPSS / vendor PSIRT feeds when they are connected. | S | Both | P3 |
| SEC-020 | The system shall run hardening checks per baseline (for example CIS Cisco IOS XR, DISA STIG NX-OS, CIS Junos, vendor guides for BMCs, UPS cards and PDUs) per asset and show pass / fail with remediation and the pass % per baseline and site. | S | Both | P2 |
| SEC-021 | The system shall show configuration drift per device (running vs last approved) as authorised (with a change) or unauthorised. | M | Both | P2 |
| SEC-022 | The system shall show IEC 62443 zones and conduits per site with SL-T, SL-A (BRULE-SEC-12), assets and findings. | S | Both | P2 |
| SEC-023 | The system shall list OT assets (UPS cards, PDUs, BMS / CDU controllers, meters, DG controllers) with default credentials, cleartext, IT reachability and risk (BRULE-SEC-13). | M | Both | P2 |
| SEC-024 | The system shall show physical protection layers per site (perimeter → building → room → cage / rack) with EN 50600-2-5-style classes, controls and exceptions. | S | Both | P2 |
| SEC-025 | The system shall show Security data sources (in Admin) with each sensor's state, last event, assets covered and gaps. | M | Both | P2 |
| SEC-026 | The system shall send detections, cases and the audit trail to the SIEM as OCSF. | M | Both | P2 |
| SEC-027 | The system shall never perform containment itself (BRULE-SEC-16), and offer "raise change" for remediation. | M | Both | P2 |
| SEC-028 | The system shall exclude tenant-owned equipment from assets, detections and vulnerabilities. | M | Colo | P2 |
| SEC-029 | The system shall show metrics: MTTA, MTTR, open cases within SLA, true-positive rate. | S | Both | P2 |
| SEC-030 | The system shall map security posture to ISO 27001 controls for Compliance (A.5–A.8, A.7 physical). | C | Both | P3 |
| SEC-031 | The system shall show a site security score per datacenter (BRULE-SEC-17) and rank sites by it on Insights. | S | Both | P2 |
| SEC-032 | The system shall keep every triage, case, vulnerability and rule move as the analyst's work in the Security Ops record so it survives a data refresh, and audit who made it. | M | Both | P2 |
| SEC-033 | The system shall list, per detection, the datacenter context it was raised with: site, room, rack, owner or tenant, the change request covering the asset, and who was badged into the room. | M | Both | P2 |
| SEC-034 | The system shall show per playbook its trigger rules and steps by phase with the system each step runs on and whether it is automatic; automatic steps run in the SOC platform, never in SynapseDC (BRULE-SEC-16). | S | Both | P2 |

### 7.7.4 User stories and acceptance criteria
**US-SEC-01** As a SOC analyst, I want an unapproved config change flagged with the person who badged in, so that I can investigate insider activity (SEC-006, SEC-008).
- Given a badge-in at the site and a WAN-edge ACL change with no approved CR, then one case links the access event, the drift and the device, with phase Detection & analysis.

**US-SEC-02** As a SOC analyst, I want to see crypto-mining on idle GPU nodes, so that stolen GPU time is stopped (SEC-009).
- Given a mining-pool connection from a GPU node in an idle allocation, then a High detection on rule SR-032 is shown with its ATT&CK technique, linked to the node and its job.

**US-SEC-03** As a vulnerability manager, I want an SSVC decision per finding, so that I patch what matters first (SEC-017).
- Given a KEV advisory on an internet-exposed firewall, then the decision is Act with a due date 7 days from the advisory.
- Given EPSS 0.03 and no KEV on a standard asset, then the decision is Track.

**US-SEC-04** As a facility security officer, I want OT risks on power gear, so that default credentials on a UPS card are fixed (SEC-023, SEC-011).
- Given a UPS card with default credentials reachable from IT, then its risk is Critical, and a Modbus write to it from a non-BMS host raises a detection.

**US-SEC-05** As a security manager, I want the physical exceptions in the SOC, so that one team sees all (SEC-007).
- Given 3 tailgating exceptions in the access log today at a site, then Physical security shows 3 detections for that site.

**US-SEC-06** As a CISO, I want posture by NIST CSF function, so that I can report it (SEC-002).
- When I open Insights, then six function scores show, each with its basis and items.

**US-SEC-07** As a SOC engineer, I want to see which devices send no telemetry, so that gaps are closed (SEC-025).
- Given devices not discovered, then they are listed as coverage gaps under the sensor that should cover them.

### 7.7.5 Data
| Entity | Read / write | System of record | Notes |
|---|---|---|---|
| Asset (device, BMC, OT controller, door) | Read | DCIM / Inventory | tenant gear excluded |
| Sensor / data source | Read | Ops Toolkit Security Ops / collectors | state, coverage |
| Security events (OCSF) | Read | Security data store | |
| Rule | Read / write | Ops Toolkit Security Ops (rule store) | SynapseDC datacenter rules |
| Detection | Read / write (triage) | Ops Toolkit Security Ops | |
| Case | Read / write | Ops Toolkit Security Ops / customer SOAR | NIST 800-61 phases |
| Advisory, vulnerability | Read / write (state) | feeds + SynapseDC matching | SSVC derived |
| Hardening check, drift | Derived | config backups + change register | |
| OT zone / conduit | Read / write | SynapseDC (to discuss with Ops Toolkit) | SL-T entered, SL-A derived |
| Access exception | Read | PACS via the access log | |
| Change window | Read | ITSM Change Management | authorisation of drift |

### 7.7.6 Integrations
| System / module | Direction | Data | Interface |
|---|---|---|---|
| Ops Toolkit Security Ops | Out / In | detections, cases, rules | EW |
| Network devices (TACACS+, syslog, config backup) | In | logins, commits, configs | INT-01 |
| BMCs (Redfish) | In | logins, firmware | INT-03 |
| PACS, visitor, VMS | In | badge events, exceptions, evidence references | INT-17, INT-18, INT-19 |
| Passive OT sensor, BMS | In | Modbus / BACnet sessions, setpoints | INT-08 (to discuss: OT sensor) |
| Kubernetes audit, Falco, osquery, Trivy, Suricata, Zeek | In | host / container / network events | collector (to discuss per customer) |
| ITSM Change Management | In / Out | change windows; remediation changes | EW, NB-04 |
| SIEM (Splunk, Sentinel, QRadar) | Out | OCSF findings, audit | NB-10 |
| NVD / CISA KEV / FIRST EPSS / vendor PSIRT | In | advisories | (to discuss) |

### 7.7.7 Reports and KPIs
- Open detections by severity and domain; true-positive rate = TP ÷ triaged.
- Open cases by phase; within SLA %; MTTA, MTTR.
- ATT&CK coverage % = techniques with an enabled rule and live sensor ÷ techniques in scope.
- Vulnerabilities by SSVC; Act open; overdue vs due date.
- Hardening pass % per baseline; unauthorised drifts open.
- OT zones below target (SL-A < SL-T); OT assets Critical / High.
- Physical exceptions per site per day.
- NIST CSF 2.0 function scores.

### 7.7.8 Screens
| Screen / tab | Purpose | Reference route |
|---|---|---|
| Insights | posture, gaps, top items | `/secops` |
| Detections | triage | `/secops?tab=detections&dc=` |
| Cases (+ Playbooks) | NIST 800-61 cases | `/secops?tab=cases` |
| Threat coverage | ATT&CK + rules | `/secops?tab=attack`, `/secops?tab=rules` |
| Vulnerabilities | SSVC-prioritised | `/secops?tab=vulns` |
| Hardening & drift | baselines and config drift | `/secops?tab=hardening`, `/secops?tab=drift` |
| OT security | IEC 62443 zones, OT assets | `/secops?tab=ot` |
| Physical security | layers and exceptions | `/secops?tab=physical` |
| Admin → Security data sources | sensors and coverage | `/security-sources` |

## 7.8 Capacity and power economics

**Purpose.** This module shows how much space, power, cooling, ports and GPU capacity each datacenter has: what is used, what is held against it, and what is truly free. It also shows what power costs under the operator's tariff and power contract. It answers three questions. Can we take the next customer or job? Where do we run out first? How much are we paying for power we do not use?
**Lifecycle stage:** Plan / Operate. **Primary users:** capacity planner, facilities manager, commercial / sales engineer, finance (energy cost), GPU platform owner. **Builds on:** Plan to Build Inventory Planning (capacity plans and records), Plan to Build Inventory (racks, devices), BSS Customers (contracted kW).
**Colocation:** capacity is sold as space and contracted kW per cabinet. Contracted kW above the cabinet's draw counts as a committed hold. Tenant power density and power over contract are the key figures.
**NeoCloud:** capacity is sold as GPUs. The GPU view splits the fleet into in a job, allocated to an idle job, free and out of service, per GPU model. Power economics gives the power cost per installed and per sold GPU-hour, and shows where the next job can run on power that is already paid for.

### 7.8.1 Scope
- In:
  - capacity per datacenter, hall and dimension (space U, power kW, cooling kW, ports, GPUs);
  - reservations and holds from every source;
  - net available capacity;
  - forecast against the 85 % warning line, with approved and executing plans netted in;
  - network bandwidth and port headroom (links in countdown);
  - the financial view: CapEx approved and committed, OpEx per month, per site;
  - PUE, energy per day and CO₂;
  - power tariffs and power contracts per site, and the monthly power bill (energy and capacity charges);
  - idle committed kW and its cost, and cost per sold MW-month;
  - GPU power cost per GPU-hour, per job and per tenant;
  - power findings against the contracts, which raise alarms and incidents;
  - GPU job placement ranking (where to place the next job).
- Out:
  - capacity plan records and approvals (Plan to Build Inventory Planning, through the Planner, see 7.9);
  - customer contracts and their contracted kW (BSS Customers / CRM, read);
  - billing of power to tenants (customer billing system; we only send metered usage, NB-07);
  - renewables share and WUE (not modelled, not shown).

### 7.8.2 Business rules
| ID | Rule |
| --- | --- |
| BRULE-CAP-01 | Net available = installed capacity − used − holds. Holds are Reserved, Committed, Pipeline or Requested, and are counted per dimension. |
| BRULE-CAP-02 | Hold sources and states:<br>• planned device = its U plus its device type's typical draw (Reserved);<br>• colocation contracted kW above the cabinet draw (Committed);<br>• approved or executing capacity plan (Pipeline);<br>• submitted plan (Requested);<br>• Planner hold (Reserved, or Committed once the plan is executing);<br>• GPU nodes allocated to an idle job (Reserved). |
| BRULE-CAP-03 | PUE = facility power ÷ IT power, from the site power split. Energy per day = facility kW × 24 h. |
| BRULE-CAP-04 | CO₂ = energy × the national grid factor: India CEA v19 = 0.716 kg/kWh; USA eGRID 2022 = 0.371 kg/kWh. The edition used is shown on screen. |
| BRULE-CAP-05 | Power bill per month = energy charge + capacity charge.<br>• Energy charge = facility load × 24 h × 30.4 days × tariff.<br>• Utility capacity charge = demand charge × max(peak kW, take-or-pay floor).<br>• Colocation capacity charge = the whole committed block × the rate per committed kW-month. |
| BRULE-CAP-06 | Idle kW = billed kW − peak kW. Idle cost per month = idle kW × the demand or committed-kW rate. |
| BRULE-CAP-07 | Sold kW = the power of GPU nodes in a running (not idle) job + tenant contracted power. Cost per sold MW-month = bill ÷ sold MW. When nothing is sold, the cost per IT MW is shown instead. |
| BRULE-CAP-08 | Power per installed GPU-hour = kW per GPU × site PUE × tariff. Power per sold GPU-hour = the same power spread over earning GPUs only. Both are compared with the GPU model's price (share %, and what is left after power). |
| BRULE-CAP-09 | Job or tenant power per day = node kW × PUE × tariff × 24, compared with what the job earns. An idle allocation is billed and drawing power but doing no work. |
| BRULE-CAP-10 | Finding "block near limit" (colocation block): peak ≥ 85 % of the committed block. Severity Major at ≥ 90 %, otherwise Minor. Exposure = the next 100 kW tranche for a year (100 kW × rate per committed kW-month × 12); power above the block bills at 1.5× the block rate. |
| BRULE-CAP-11 | Finding "demand ratchet" (utility contract): a new 12-month demand peak above the take-or-pay floor. Prior peak = the highest of the first eleven months of history × 1.06. Exposure = (new peak − prior peak) × demand rate × 12. Severity Major when the exposure exceeds half a monthly bill, otherwise Minor. |
| BRULE-CAP-12 | Finding "unexplained rise": current draw more than 12 % above the 24 h mean, with no change in progress at the site and no job started in the last 24 h. Severity Minor. Exposure = the rise × tariff × 24 h × 30.4 days per month if it holds. |
| BRULE-CAP-13 | Finding "idle block" (colocation block): idle kW ≥ 30 % of the committed block. Severity Warning. Exposure = idle cost per month × 12. |
| BRULE-CAP-14 | Each finding raises one alarm, code `PWR-<site>-<KIND>` (source Power, category Facility, scope site). The costliest block-near-limit or demand-ratchet finding also opens one Medium Power incident (reported by the EPMS meter check) whose impact is the money exposure and no services; its hypotheses are recent GPU job starts, cooling overhead and meter error; its actions are to cap inference pods in the peak window, place new jobs where power is already paid, and get the supplier's confirmation or a block uplift. |
| BRULE-CAP-15 | Placement of a GPU request (8–256 GPUs of a chosen model) is ranked per pod. Fit = **no** when the pod has no free healthy node of the model or its cooling loop (CDU for liquid pods) is in fault; **tight** when cooling is degraded in the room, a rack is at ≥ 90 % of budget, or the contracted headroom is below the request's load; else **good**. Each pod also shows free healthy GPUs, rack headroom, cooling headroom, already-paid kW (idle block, or draw below the take-or-pay floor) and marginal power per GPU-hour (kW per busy GPU × PUE × tariff). Rank by fit, then by marginal cost. |
| BRULE-CAP-16 | Tariffs and contract values are marked illustrative until the customer's tariff sheets and contracts are loaded. Local prices are never currency-converted. |
| BRULE-CAP-17 | Capacity forecast per dimension = compound growth on today's use over 12 months, with approved and executing plans landing about 3 months out; 12 months of history (metered for power, back-computed from the trend for the rest). The warning line is 85 %; a dimension within 9 months of it is flagged. Links: compound growth of the last six monthly peaks, flagged when 85 % is crossed within 6 months. |
| BRULE-CAP-18 | Illustrative contract seeding until replaced: a colocation block = peak × (1.10–1.45) rounded up to 100 kW, never above site capacity, floor 100 %, escalator 2.5–4 %; a utility connection = design capacity × (1.00–1.15), floor 60–85 %, escalator 2–4.5 %; demand charge $14 per kW-month (₹420 per kVA-month); block rate $145 (₹7,800) per committed kW-month. |
| BRULE-CAP-19 | The pitch-deck reference line (1.2 kW per GPU at PUE 1.46 at the blended tariff) is shown beside the measured cost per GPU-hour. |

### 7.8.3 Functional requirements
| ID | Requirement | Priority | Model | Phase |
| --- | --- | --- | --- | --- |
| CAP-001 | The system shall show capacity per datacenter for space, power, cooling, ports and GPUs as installed, used, held and available. | M | Both | P2 |
| CAP-002 | The system shall open the capacity overview with one summary tile per dimension plus a holds tile, each linking to its tab. | M | Both | P2 |
| CAP-003 | The system shall show space and power by hall, with an 85 % pressure marker and a link to the DCIM floor plan. | M | Both | P2 |
| CAP-004 | The system shall list every reservation with its kind, resource, quantity, unit, state, label and a link to its source record. | M | Both | P2 |
| CAP-005 | The system shall compute net available power and space after all holds (BRULE-CAP-01). | M | Both | P2 |
| CAP-006 | The system shall treat colocation contracted kW above draw as a Committed hold per cabinet. | M | Colo | P2 |
| CAP-007 | The system shall show GPU capacity per model as in a job, allocated and idle, free, and out of service. | M | Neo | P2 |
| CAP-008 | The system shall show PUE, energy per day and CO₂ per site and for the estate (BRULE-CAP-03, BRULE-CAP-04). | M | Both | P2 |
| CAP-009 | The system shall forecast each dimension 12 months forward against the 85 % warning line (BRULE-CAP-17), show the month it is crossed, and publish `dco.capacity.threshold` when a dimension crosses it. | S | Both | P2 |
| CAP-010 | The system shall hold a tariff per state or region and a power contract per live site: supplier, type (utility or colocation block), committed kW, take-or-pay floor, rate, escalator and term end. | M | Both | P2 |
| CAP-011 | The system shall let an authorised user replace the illustrative tariff and contract values with the customer's own, with an as-of date. | M | Both | P2 |
| CAP-012 | The system shall compute the monthly power bill per site and for the estate, split into energy and capacity charges (BRULE-CAP-05). | M | Both | P2 |
| CAP-013 | The system shall show idle committed kW and its monthly cost per site, ranked by cost (BRULE-CAP-06). | M | Both | P2 |
| CAP-014 | The system shall show cost per sold MW-month, or per IT MW when nothing is sold (BRULE-CAP-07). | S | Both | P2 |
| CAP-015 | The system shall show a power bill breakdown chart and a site table that links to that site's Facilities power view. | S | Both | P2 |
| CAP-016 | The system shall compute power cost per installed and per sold GPU-hour per GPU pod against the model's price (BRULE-CAP-08). | M | Neo | P2 |
| CAP-017 | The system shall show energy and power cost per job and per tenant against what each earns, with idle allocations called out (BRULE-CAP-09). | M | Neo | P2 |
| CAP-018 | The system shall show the kW a power cap saves against the GPU time it costs. | S | Neo | P2 |
| CAP-019 | The system shall detect the four power findings (BRULE-CAP-10 to BRULE-CAP-13) each data cycle. | M | Both | P2 |
| CAP-020 | The system shall raise one alarm per finding (System Alerts API) and one Medium incident for the costliest block or ratchet finding (Services & ITSM API), with root-cause hypotheses and actions (BRULE-CAP-14). | M | Both | P2 |
| CAP-021 | The system shall list the power findings with severity, exposure, evidence, and links to their alarm and incident. | M | Both | P2 |
| CAP-022 | The system shall publish `dco.power.finding` events for every finding (NB-02 / NB-03). | S | Both | P2 |
| CAP-023 | The system shall rank GPU pods for a placement request of 8–256 GPUs of a chosen model, with fit, headroom, cooling state, already-paid kW and marginal cost per GPU-hour (BRULE-CAP-15). | M | Neo | P2 |
| CAP-024 | The system shall rank colocation halls for a new cabinet request by free space, power headroom and cooling (to discuss). | C | Colo | P3 |
| CAP-025 | The system shall answer the Opstral AI questions "Where should the next GPU job go?" and "What is power costing us at <site>?" from the same model. | S | Both | P2 |
| CAP-026 | The system shall scope every view to the estate or to one datacenter by a datacenter selector. | M | Both | P2 |
| CAP-027 | The system shall let a planner start a capacity plan from a dimension, opening the Planner with the site and template filled in. | S | Both | P2 |
| CAP-028 | The system shall make every total reconcile: Σ site bills = estate bill; Σ holds per site = holds shown on the site. | M | Both | P2 |
| CAP-029 | The system shall export capacity, holds and power economics as CSV and through NB-01 / NB-09. | S | Both | P2 |
| CAP-030 | The system shall show 12 months of power history per site and use it for the ratchet rule. | M | Both | P2 |
| CAP-031 | The system shall send metered kWh and peak kW per tenant cabinet to billing (NB-07). | S | Colo | P3 |
| CAP-032 | The system shall send delivered and lost GPU-hours per customer job to billing (NB-07). | S | Neo | P3 |
| CAP-033 | The system shall add an info text to every widget saying how its figure is computed. | M | Both | P2 |
| CAP-034 | The system shall show network headroom: links in countdown (utilisation, growth of the last six monthly peaks, the month 85 % is crossed) and port headroom per site, each link opening its forecast on the device. | S | Both | P2 |
| CAP-035 | The system shall show a financial view per site: CapEx approved and committed, OpEx per month, power capacity, racks and backhaul bandwidth, with totals. | S | Both | P2 |
| CAP-036 | The system shall open the capacity overview with a reservation ledger (Submitted → Approved → Executing → Delivered) and the months to the 85 % line per dimension at the current growth rate. | M | Both | P2 |
| CAP-037 | The system shall show the deck reference line beside the measured GPU power cost (BRULE-CAP-19) and label every tariff and contract figure as illustrative until replaced. | S | Neo | P2 |
| CAP-038 | The system shall show no power findings and no incident for a site whose draw and contract give none, and shall never raise contract findings for an estate without power contracts. | M | Both | P2 |

### 7.8.4 User stories and acceptance criteria
**US-CAP-01** As a capacity planner, I want net available power per hall after every hold, so that I don't sell capacity that is already promised. (CAP-003, CAP-004, CAP-005)
- Given a hall with planned devices, tenant contracts and an approved plan, when I open Capacity → Space, then available = installed − used − Σ holds, and each hold links to its source.

**US-CAP-02** As a colocation sales engineer, I want to see contracted kW against drawn kW per cabinet, so that I know which tenants can grow and where the operator is over-committed. (CAP-006)
- Given a cabinet contracted at 10 kW and drawing 6 kW, when I open Reservations, then a 4 kW Committed hold is listed for that tenant.

**US-CAP-03** As a finance analyst, I want the monthly power bill per site split into energy and capacity charges, so that I can check the supplier invoice. (CAP-010, CAP-012)
- Given a site on a colocation block, when I open Power economics, then the capacity charge = committed kW × rate, whatever the draw.

**US-CAP-04** As a commercial lead, I want to see idle committed power ranked by cost, so that I can resize or resell the block. (CAP-013)
- Given a site where 30 % or more of the block is never drawn, then an "Idle committed power" finding is listed, with yearly exposure = idle cost × 12.

**US-CAP-05** As a GPU platform owner, I want power cost per sold GPU-hour per pod, so that I know my margin after power. (CAP-016)
- Given a pod with idle GPUs, then the cost per sold GPU-hour is higher than the cost per installed GPU-hour, and both are shown against the model price.

**US-CAP-06** As a NOC engineer, I want an alarm when a power block nears its limit, so that the overage is avoided. (CAP-019, CAP-020)
- Given a block drawn at 91 %, then a Major alarm `PWR-<site>-BLOCKNEARLIMIT` is active, and Power economics links to it and to the Medium incident it opened.

**US-CAP-07** As a GPU scheduler owner, I want a ranked list of pods for 64 H100 GPUs, so that the job lands where power is already paid for and cooling has headroom. (CAP-023)
- Given the request, when I open Where to place, then the pods are ranked by fit (good, tight, no) and then by marginal cost per GPU-hour, and a pod with a CDU fault is marked no fit.

**US-CAP-08** As a sustainability lead, I want PUE and CO₂ per site with the grid factor named, so that I can report them. (CAP-008)
- The factor's source and edition are shown next to the CO₂ figure.

### 7.8.5 Data
| Entity | Read / write | System of record | Notes |
| --- | --- | --- | --- |
| Site, hall, rack, device | Read | Plan to Build Inventory (+ DCIM extensions, 7.10) | rated kW, U, typical draw |
| Live power and cooling readings | Read | SynapseDC telemetry (INT-04 to INT-08) | facility kW, IT kW, peak, 12-month history |
| GPU nodes, jobs, allocations | Read | SynapseDC GPU telemetry + scheduler (INT-11, INT-12) | job state, nodes, model |
| Tenant contracted kW | Read | BSS Customers / CRM (NB-07) | per cabinet |
| Capacity plans, planner holds | Read | Inventory Planning / Planner (7.9) | state and quantity |
| Tariff, power contract | Read / write | SynapseDC (new, with an as-of date) | illustrative until loaded |
| Power findings | Write | SynapseDC | raise alarms and incidents |
| Capacity view, power economics | Derived | SynapseDC | never stored as entered data |

### 7.8.6 Integrations
| System / module | Direction | Data | Interface |
| --- | --- | --- | --- |
| Plan to Build Inventory Planning | In | capacity plans, holds | EW |
| Plan to Build Inventory | In | racks, devices, typical draw | EW / INT-14 |
| BSS Customers / CRM | In | contracted kW, GPU rates | EW / NB-07 |
| Meters, UPS, PDUs, BMS | In | power and cooling readings | INT-04 to INT-08 |
| DCGM, scheduler | In | GPU state, jobs | INT-11, INT-12 |
| Customer billing | Out | metered kWh, peak kW, GPU-hours | NB-07 |
| Event consumers | Out | capacity thresholds, power findings | NB-02 / NB-03 |
| Ops Toolkit Fin Ops | Out | power cost per site and per job | EW (to discuss) |

### 7.8.7 Reports and KPIs
- Utilisation per dimension, site and hall.
- Net available kW and U.
- Holds by state.
- PUE, MWh per day, CO₂ t per month.
- Power bill per month, idle kW and cost, cost per sold MW-month.
- Power per sold GPU-hour and its share of the price.
- Findings with their exposure.
- Months to threshold.

### 7.8.8 Screens
| Screen / tab | Purpose | Reference route |
| --- | --- | --- |
| Capacity · Insights (Overview & forecast, Financial) | tiles per dimension and holds, ledger, forecast, financial view | `/capacity`, `/capacity?tab=financial` |
| Capacity · Space | space and racks by hall | `/capacity?tab=space` |
| Capacity · Power (Power & cooling, PUE & energy, Power economics) | power and cooling headroom, PUE, energy, CO₂, bill, idle cost, findings, sites | `/capacity?tab=power`, `?tab=energy`, `?tab=economics&dc=` |
| Capacity · Network | bandwidth and port headroom, links in countdown | `/capacity?tab=network` |
| Capacity · Compute | compute and GPU capacity per model | `/capacity?tab=compute` |
| Capacity · Reservations | every hold, by kind and state | `/capacity?tab=reservations` |
| GPU Fleet · Cooling & power | GPU power cost, job / tenant energy | `/gpu?gtab=cooling` |
| GPU Fleet · Where to place | placement ranking | `/gpu?gtab=placement` |

---

## 7.9 Planner

**Purpose.** The Planner turns a capacity need into a designed, costed, scheduled and approved plan:
- a rack, pod or hall fit-out;
- a plant upgrade or a network extension;
- a new datacenter or an expansion;
- a refresh or a migration.

It sizes the plan from templates and benchmarks, checks it against rules, compares scenarios and routes it for approval by CapEx band. It then hands the approved plan to Programs & Projects for delivery.
**Lifecycle stage:** Plan → Build handoff. **Primary users:** capacity planner, design authority, finance manager, facilities director, executive approver, programme manager. **Builds on:**
- Plan to Build Inventory Planning (plan record and holds);
- Plan to Build Inventory and IP Management (site baseline, addresses);
- Supply Chain Materials, Vendors, Contracts and Warehouses (catalogue, stock, vendor contracts);
- Programs & Projects (delivery record).

**Colocation:** typical plans are a cage or hall fit-out for a tenant, a power upgrade, a new hall, or rack replacement. Sizing is in contracted kW per cabinet.
**NeoCloud:** typical plans are a GPU pod or hall (liquid cooling and CDUs, InfiniBand fabric), a plant upgrade for high-density racks, a server refresh, or a new site. Sizing is in GPUs, kW per rack and cooling type.

### 7.9.1 Scope
- In:
  - plan families and their plan types:
    - in-site: rack, pod, hall, retrofit;
    - plant;
    - network;
    - build: new datacenter, expansion, portfolio, edge;
    - replace: server refresh, network refresh, rack replacement;
    - migration;
  - templates with inheritance, versions and variants;
  - benchmarks (costs, efficiency, lead times, sizing and staffing, rules);
  - the wizard;
  - the planner engine: sizing, CapEx / OpEx, NPV / IRR / payback, schedule from lead times, rule checks, readiness;
  - scenarios;
  - the approval path by CapEx band;
  - bill of materials and sourcing;
  - the plan pack (drawings, IP plan, BoM, CSV);
  - the review pack (PDF, XLSX, ZIP) and the review portal;
  - the edit policy and revisions;
  - the baseline;
  - the handoff to delivery.
- Out:
  - delivery execution (work orders, purchase orders, commissioning, handover): owned by Programs & Projects, shown through the analytics pages (8.1 to 8.3);
  - purchase-order issue: Supply Chain Procurement;
  - IP allocation of record: Plan to Build IP Management;
  - the asset record after build: Plan to Build Inventory.

### 7.9.2 Business rules
| ID | Rule |
| --- | --- |
| BRULE-PLN-01 | A template inherits from its parent (resolved chain). A plan's effective input = plan override → template default → benchmark → planner-derived value, and the source is shown for each input. |
| BRULE-PLN-02 | A content change to a template bumps its version. Plans keep the version they were made from, and template drift is flagged on the plan. |
| BRULE-PLN-03 | CapEx band (delegation of authority):<br>• ≤ $50k Operational spend → Capacity Planner;<br>• ≤ $250k Departmental budget → Finance Manager;<br>• ≤ $1M Site programme → Finance Manager, then Facilities Director, with a business case;<br>• above $1M Capital programme → Finance Manager, then Executive, with a business case. |
| BRULE-PLN-04 | The approval path = the template's path with the band's roles inserted at the finance step, or before the first band role, or at the end. The requester and the submitter cannot approve their own plan. |
| BRULE-PLN-05 | Hard rule failures block submission. Soft rules warn. An approved demo or seeded plan that fails a hard rule on the live estate goes back to Draft, with the reason. |
| BRULE-PLN-06 | Schedule = phases from lead-time benchmarks. An item is late when its order-by date has passed. An approved plan that has not started is scheduled no earlier than today. |
| BRULE-PLN-07 | Figures follow the scenario in order: approved → in review → preferred → base. |
| BRULE-PLN-08 | The bill of materials is priced once from the catalogue. Sourcing order per line: spare site capacity, then unheld stock, then the catalogue vendor under its contract. Edits to the bill add one CapEx line, "Bill of materials changes". |
| BRULE-PLN-09 | Edit policy, the same for every editor on the plan page:<br>• Draft / Rejected = edit in place;<br>• In review = "Withdraw and save" (the round stays in History);<br>• Approved / Executing = "Draft revision B" (the edit is applied to the revision, audited "Raised to change: …"; map fields are re-based so the revision keeps its approved overrides); an open draft revision takes further edits ("Save to revision B"); a revision in review makes the plan read-only until it is decided;<br>• On hold / Completed / Cancelled / superseded = read-only, with the reason.<br>Risks and permits are a live register: status, rating, owner and mitigation save straight to any plan; adding, removing or renaming items drafts a revision. |
| BRULE-PLN-10 | On approval a baseline is frozen: CapEx, contingency, OpEx, schedule, scenario and template version. Capacity and rack-unit holds are written. |
| BRULE-PLN-11 | "Start the build" hands the plan to Programs & Projects with the sourced BoM, vendor orders (one per vendor and phase), stock and rack holds, IP and the plan type's records. Handover in delivery completes the plan, and completing the plan signs the handover. |
| BRULE-PLN-12 | Money is held in USD in the engine and shown in the geography's currency (India rate 50). |
| BRULE-PLN-13 | Reviewers for "Send for review" = the holders of the approval path's roles minus the requester and the submitter. The request records who answered; the hub shows "Your review" to a reviewer who has not answered and "Review sent" to the planner. No e-mail is sent by the prototype (to discuss). |
| BRULE-PLN-14 | A plan's tab bar always fits one row: tabs that do not fit fold into "More". Family tabs use short labels (Equipment, Inventory, Waves, Plant, Paths, Site fit). |
| BRULE-PLN-15 | Record changes at closeout (wave close, disposal certificates, the migration meter reading, site retirement) go through one audited action, allowed on executing and completed plans only. |

### 7.9.3 Functional requirements
| ID | Requirement | Priority | Model | Phase |
| --- | --- | --- | --- | --- |
| PLN-001 | The system shall offer the six plan families and their plan types listed in 7.9.1, each with its own wizard steps and plan-page tabs. | M | Both | P2 |
| PLN-002 | The system shall keep a template library (plan types, site types, modules) with inheritance, versions, variants, publish and retire. | M | Both | P2 |
| PLN-003 | The system shall show, for each template: its inheritance chain, wizard areas, approval path, outputs, inputs with defaults, rules, the plans using it and its versions. | M | Both | P2 |
| PLN-004 | The system shall keep versioned benchmarks for costs, efficiency (PUE), lead times, sizing and staffing, and rules, filterable by site type, cooling, tier, region and confidence. | M | Both | P2 |
| PLN-005 | The system shall guide plan creation in a wizard:<br>• plan type;<br>• requirements (name, needed-by date, where, how much, workload mix, tier);<br>• one step per design area (12 areas);<br>• scenarios;<br>• review. | M | Both | P2 |
| PLN-006 | The system shall derive inputs from the requirements and say how many it filled and why. | M | Both | P2 |
| PLN-007 | The system shall show the source of each input (override, template, benchmark, derived) and let the user reset it. | M | Both | P2 |
| PLN-008 | The system shall show a live estimate on every step: readiness, CapEx and IT power. | M | Both | P2 |
| PLN-009 | The system shall size space, power, cooling and network for the plan, and draw them on drawing sheets. | M | Both | P2 |
| PLN-010 | The system shall compute CapEx lines, OpEx per month, NPV, IRR and payback. | M | Both | P2 |
| PLN-011 | The system shall build the schedule from lead-time benchmarks, with phases, gates, order-by dates and late items. | M | Both | P2 |
| PLN-012 | The system shall check the hard and soft rules and list blockers with "fix" links to the step. | M | Both | P2 |
| PLN-013 | The system shall let the user create, compare and prefer scenarios. | M | Both | P2 |
| PLN-014 | The system shall build the approval path by CapEx band and template (BRULE-PLN-03, BRULE-PLN-04), and record decisions, conditions, delegations and rounds. | M | Both | P2 |
| PLN-015 | The system shall enforce segregation of duties: the requester or submitter cannot approve. | M | Both | P2 |
| PLN-016 | The system shall show candidate sites, with capacity bars, for site-selection steps. | S | Both | P2 |
| PLN-017 | The system shall list the affected assets for refresh plans (end of sale, out of support, damaged racks), searchable and filterable by reason. | M | Both | P2 |
| PLN-018 | The system shall price and source the bill of materials (BRULE-PLN-08), and allow quantity, model, vendor and source overrides and added lines. | M | Both | P2 |
| PLN-019 | The system shall produce a plan pack:<br>• what the plan creates;<br>• basis of design;<br>• BoM with sourcing;<br>• IP and network plan;<br>• drawings;<br>• build initiation;<br>• CSV exports. | M | Both | P2 |
| PLN-020 | The system shall produce a review pack from one content model: a PDF, an XLSX workbook, and a ZIP with CSV, SVG drawings, README and manifest checksums. | M | Both | P2 |
| PLN-021 | The system shall provide a review portal per plan: numbered sections, threaded comments per section (reply, resolve), and the decision band. | M | Both | P2 |
| PLN-022 | The system shall let the user send a plan for review to the holders of the approval path's roles, with a message and attachments. Email sending is to be discussed. | S | Both | P2 |
| PLN-023 | The system shall apply the edit policy (BRULE-PLN-09) to every editor on the plan page and record each change in the plan history. | M | Both | P2 |
| PLN-024 | The system shall let a user adjust the project plan (phases, go-live, IT kW, density, cooling, needed-by date) and show the effect live before saving. | M | Both | P2 |
| PLN-025 | The system shall freeze a baseline on approval and write the capacity and rack-unit holds (BRULE-PLN-10). | M | Both | P2 |
| PLN-026 | The system shall hand an approved plan to Programs & Projects (BRULE-PLN-11) and show the delivery state on the plan. | M | Both | P2 |
| PLN-027 | The system shall complete a plan when delivery hands over, and update Inventory Planning. | M | Both | P2 |
| PLN-028 | The system shall show a Plans list with filters by status and scope, and a list ⇄ cards switch. | M | Both | P2 |
| PLN-029 | The system shall show a hub with plans that need action: your decision, your review, blockers. | S | Both | P2 |
| PLN-030 | The system shall start a plan from a datacenter page or from a Capacity dimension, with the site and template filled in. | S | Both | P2 |
| PLN-031 | The system shall support the family-specific views:<br>• site fit;<br>• plant line-ups (as-is / to-be single line);<br>• DCI paths and circuits;<br>• edge sites;<br>• old-to-new mapping and waves;<br>• migration inventory, consents and exit plan. | S | Both | P2 |
| PLN-032 | The system shall print the drawing sheets on landscape A4 with a title block. | S | Both | P2 |
| PLN-033 | The system shall sum GPU pod plans as GPUs, kW per rack, liquid share and CDUs, and the InfiniBand fabric size. | M | Neo | P2 |
| PLN-034 | The system shall size tenant cage or hall plans from contracted kW per cabinet and the cabinet count. | M | Colo | P2 |
| PLN-035 | The system shall publish `dco.plan.decided` and write every plan change to the audit trail. | M | Both | P2 |
| PLN-036 | The system shall offer AI-assisted plan drafting (to discuss). | C | Both | P3 |
| PLN-037 | The system shall show the review status on the plan (reviewers, who has answered, open comments) and list plans that need action in the hub: your decision, your review, review sent, blockers (BRULE-PLN-13). | M | Both | P2 |
| PLN-038 | The system shall offer, in Send for review, the attachment choice PDF / ZIP / link only, a message, an e-mail preview with the real attachment sizes, and the option to submit a draft at the same time. | S | Both | P2 |
| PLN-039 | The system shall open scenarios on demand from the plan header as a What-if drawer, and show figures from the approved → in review → preferred → base scenario (BRULE-PLN-07). | M | Both | P2 |
| PLN-040 | The system shall warn before leaving the wizard with unsaved changes, and let the user jump to any completed step. | S | Both | P2 |
| PLN-041 | The system shall send the plan's vendor orders (one per vendor and phase) to Programs & Projects / Procurement through their APIs, so the purchase orders there equal the plan's orders both before execution (Draft orders from the same sourcing) and after. | M | Both | P2 |
| PLN-042 | The system shall record closeout changes through the audited action in BRULE-PLN-15 and show closeout checks (ready when every check passes or is marked for handover). | S | Both | P2 |
| PLN-043 | The system shall let a template owner make a variant, publish or retire a template and edit input defaults on drafts; a content change bumps the version. | M | Both | P2 |
| PLN-044 | The system shall filter benchmarks per view (reference value, site type, cooling, tier, region, confidence; rules by area and severity) across every table and chart of the view. | S | Both | P2 |
| PLN-045 | The system shall show on the Command Center a Plan & build strip (capacity pipeline planned → approved → in build → commissioning → live, decisions due, week ahead) and a build lens, with plan approvals in Recommendations. | S | Both | P2 |
| PLN-046 | The system shall show per plan an Overview dashboard: what and why with the Draft → In review → Approved → In delivery → Completed tracker, key dates, needs attention (failing rules, late items, conditions, decision due, review comments, submit blockers), phases, cost · capacity · readiness, inputs changed from the template, what the plan produces. | M | Both | P2 |
| PLN-047 | The system shall show on every plan ONE status line: state in words, whose decision, blockers, conditions, template drift, the build in Programs & Projects, an open review and an open revision. | M | Both | P2 |
| PLN-048 | The system shall list in the plan pack what the plan creates with links into Programs & Projects, IP Management and DCIM once the build has started. | S | Both | P2 |

### 7.9.4 User stories and acceptance criteria
**US-PLN-01** As a capacity planner, I want to create a GPU pod plan from a template, so that sizing, cost and schedule come from agreed benchmarks. (PLN-005, PLN-006, PLN-033)
- Given the "GPU pod" type, when I enter 512 GPUs at a liquid-cooled site, then the wizard fills the derived inputs with their sources, and the live estimate shows CapEx and IT kW.

**US-PLN-02** As a finance manager, I want plans routed to me by CapEx band, so that delegation of authority is respected. (PLN-014)
- Given a plan with $600k CapEx, when it is submitted, then the path includes Finance Manager, then Facilities Director, and a business case is required.

**US-PLN-03** As an approver, I want to review the plan in a portal and comment per section, so that the questions are traceable. (PLN-021)
- When I comment on section 4.1 and the planner replies and resolves it, then the thread shows resolved, and the hub no longer lists it for me.

**US-PLN-04** As a planner, I want to edit an approved plan without losing the approval, so that the change is reviewed as revision B. (PLN-023)
- Given an Approved plan, when I change the phases, then the save button reads "Draft revision B", and History records "Raised to change: …".

**US-PLN-05** As a programme manager, I want an approved plan to arrive in Programs & Projects with orders and holds, so that delivery starts from the same numbers. (PLN-026)
- When "Start the build" runs, then the delivery POs equal the plan's vendor orders, and Capacity shows the planner holds.

**US-PLN-06** As a design authority, I want blocking rules shown with fix links, so that a plan cannot be submitted while it fails them. (PLN-012)
- Given a failing hard rule, then Submit is disabled and the blocker links to its step.

**US-PLN-07** As a reviewer, I want a PDF / XLSX / ZIP review pack, so that I can review offline. (PLN-020)
- The ZIP manifest checksums match its files, and the PDF has no blank pages.

### 7.9.5 Data
| Entity | Read / write | System of record | Notes |
| --- | --- | --- | --- |
| Plan, scenario, approval, review, comment | Read / write | Planner (SynapseDC store); capacity holds written to Inventory Planning through its API | audited |
| Template, benchmark | Read / write | Planner | versioned |
| Site baseline (halls, racks, power, cooling, IP) | Read | Plan to Build Inventory, IP Management, SynapseDC telemetry | as-is |
| Catalogue, stock, vendor contracts | Read | Supply Chain Materials, Warehouses, Contracts, Vendors | sourcing |
| Holds | Write | Inventory Planning | on approval |
| Project, POs, work orders | Write (handoff), then Read | Programs & Projects, Supply Chain Procurement | handover back |

### 7.9.6 Integrations
| System / module | Direction | Data | Interface |
| --- | --- | --- | --- |
| Plan to Build Inventory Planning | Both | plans, holds | EW |
| Plan to Build Inventory / IP Management | In | baseline, address space | EW |
| Supply Chain | In / Out | catalogue, stock, vendor orders | EW |
| Programs & Projects | Out / In | handoff, delivery state, handover | EW |
| Identity | In | approver roles and holders | platform identity |
| Event consumers | Out | plan decided | NB-02 |

### 7.9.7 Reports and KPIs
- Plans by status and scope.
- CapEx in review and approved.
- Decisions due and their age.
- Late items and order-by dates in the next 90 days.
- Rule failures.
- Template use.
- Benchmark confidence.

### 7.9.8 Screens
| Screen / tab | Purpose | Reference route |
| --- | --- | --- |
| Planner · Insights | hub and plans that need action | `/planning` |
| Plans | list / cards | `/planning?tab=plans` |
| Templates / Benchmarks | library | `/planning?tab=templates`, `?tab=benchmarks` |
| New plan wizard | create | `/planning/new` |
| Plan page | overview, project plan, family tabs, design, cost, materials, risks & permits, rules, approvals, plan pack, delivery, history; What-if drawer | `/planning/plans/:id` |
| Review portal | review, comment and decide | `/planning/plans/:id/review` |
| Command Center · Plan & build | pipeline strip and build lens | `/?lens=build` |

---

## 7.10 DCIM — racks, power chain and cabling

**Purpose.** DCIM holds the physical model that monitoring, impact and planning depend on:
- where every rack and device sits;
- how power reaches each device (UPS → busway or panel → PDU → outlet → PSU);
- how every cable runs (port → patch panel → trunk → ODF → cross-connect).

These datacenter-specific records extend the Plan to Build Inventory asset record. They are changed only under a change request.
**Lifecycle stage:** Build / Operate. **Primary users:** datacenter engineer, field technician, capacity planner, NOC (trace), colocation operations. **Builds on:** Plan to Build Inventory (asset record: site, device, serial, model, lifecycle), Services & ITSM Change Management (change requests).
**Colocation:** tenant cabinets hold opaque "Tenant gear" (owner, tenant, contracted kW; never polled). The floor plan's Tenant colouring compares draw with contracted kW. Cross-connects and meet-me-room ODFs are central.
**NeoCloud:** GPU nodes with 4 or more PSUs. High-density liquid racks with CDU manifolds. InfiniBand rails (two leafs per node) and front-end Ethernet cabling.

### 7.10.1 Scope
- In (datacenter-specific extensions to the Inventory record):
  - hall kind;
  - rows (paired face to face around a cold aisle);
  - rack grid position, rack budget kW, rack type and condition;
  - device U position and height;
  - components (ports, power ports with their outlet, management, console, module bays);
  - inventory items such as optics;
  - power panels (a hall's A / B busway or −48 V distribution) and feeds (rack PDUs);
  - PSU cords to PDU outlets;
  - data cables with their structured route;
  - device and module types with component templates;
  - rack-unit reservations;
  - floor plan colourings;
  - elevation drag-to-move;
  - the Explorer;
  - DCIM change control.
- Out:
  - the asset master record: serial, model, purchase, warranty and lifecycle state (Plan to Build Inventory);
  - change approval workflow (Services & ITSM Change Management);
  - IP address records (Plan to Build IP Management; the DCIM device drawer only reads and assigns through it);
  - purchase of devices (Supply Chain).

### 7.10.2 Business rules
| ID | Rule |
| --- | --- |
| BRULE-DCIM-01 | Hierarchy: site → floor → hall (a room; its kind comes from its name: meet-me room, data hall…) → row → rack → device → components. Racks per row = max(2, min(8, ⌈√(n × 2.2)⌉)) for n racks in the hall. Rows are paired face to face around a cold aisle. |
| BRULE-DCIM-02 | Device status is one of: Active, Planned, Maintenance, Decommissioning, Tenant-owned. A Planned device reserves its U range and its type's typical power. |
| BRULE-DCIM-03 | U occupancy is checked on install and move: no clash with devices, the ODF block or reservations, and the device must fit within the rack height. |
| BRULE-DCIM-04 | Power: each rack PDU side (A / B) is rated at the rack budget. Σ PDU load = rack draw, and Σ feeds on a panel = panel load. Odd PSUs go to A and even PSUs to B. A new feed's rating = V × A × 0.8 (× √3 when three-phase), the 80 % continuous rating. Panel A of a hall is fed by one UPS module (UPS-2 / 4) and panel B by another (UPS-1 / 3). |
| BRULE-DCIM-05 | A single point of failure is flagged when a device has both cords on one side, a PSU has failed, a PDU is tripped, or a cabinet is at ≥ 90 % of budget (one side cannot carry it). |
| BRULE-DCIM-06 | Cabling (TIA-942): port → optic → patch cord → cabinet panel → trunk (2 tray routes; Tier II = 1) → ODF → cross-connect → far end. In-rack = one cord. Backhaul adds the outside-plant core. Cables = every LLDP link + every power cord. |
| BRULE-DCIM-07 | Connect: only a free port to a free port of the same speed at the same site. Disconnect frees both ends. |
| BRULE-DCIM-08 | Every DCIM edit except the catalogue runs under a change request. There are three options:<br>• **Standard** (pre-approved record work: patch cords, space holds, port label / enable, hot-swap PSU or fan) is raised and closed at once as a Standard change on template STD-07 "DCIM record:" (STD-02 / STD-05 for cords and hot swaps). It is refused at a site under a freeze that allows emergency changes only (an open Critical incident).<br>• **Open CR** at the site: Approved / In progress = applied now; Draft / Pending = saved as planned work.<br>• **Raise new**: a change request in Pending approval, origin DCIM. |
| BRULE-DCIM-09 | Planned work runs once its change is approved and not blocked by policy. A DCIM-raised change completes when all its work is done. Records are tagged with the change id (rack, device, interface, module, reservation, panel, feed), and audit lines carry it. |
| BRULE-DCIM-10 | A rack can be retired only when it is empty. A reserved U range is respected by install and move until it is released. |
| BRULE-DCIM-11 | A planned device that was recorded before DCIM change control carries the open delivery change request of its rack. Records touched by a change are tagged (rack, device, port, module slot, reservation, panel, feed) and every audit line names the change. |
| BRULE-DCIM-12 | Invariants checked on every data change: racks and devices equal the estate; Σ hall = site; rows partition a hall's racks; a rack's U = Σ devices + the ODF block, with no U clash; Σ feeds = rack draw; Σ panel = Σ feeds; cables = LLDP links + power cords; Σ devices per type = devices. |

### 7.10.3 Functional requirements
| ID | Requirement | Priority | Model | Phase |
| --- | --- | --- | --- | --- |
| DCIM-001 | The system shall present the hierarchy site → floor → hall → row → rack → device → components, reading the assets from the Plan to Build Inventory API by their asset ids and storing only the datacenter-specific extensions the Inventory API cannot carry (ARCH-012, OD-01). | M | Both | P1 |
| DCIM-002 | The system shall store (in the Inventory record through its API where it carries the field, otherwise as a DCIM extension) rack grid position, row, U height, budget kW, type (e.g. a legacy 600 × 1000 shallow type), purchase date, condition (including Damaged at audit, with the note), owner and tenant, and contracted kW. | M | Both | P1 |
| DCIM-003 | The system shall store (in the Inventory record through its API where it carries the field, otherwise as a DCIM extension) each device's rack, U position, height and status (BRULE-DCIM-02). | M | Both | P1 |
| DCIM-004 | The system shall store (in the Inventory record through its API where it carries the field, otherwise as a DCIM extension) device components: ports with speed and admin state, power ports with their PDU outlet, management, console, module bays and inventory items. | M | Both | P1 |
| DCIM-005 | The system shall store (in the Inventory record through its API where it carries the field, otherwise as a DCIM extension) power panels (busway A / B per hall or −48 V distribution), feeds (rack PDUs) and PSU cords to outlets (BRULE-DCIM-04). | M | Both | P1 |
| DCIM-006 | The system shall store (in the Inventory record through its API where it carries the field, otherwise as a DCIM extension) data cables with the structured route of BRULE-DCIM-06, and reconcile them with LLDP. | M | Both | P1 |
| DCIM-007 | The system shall show a floor plan per hall, coloured by Thermal, Density or Tenant (draw vs contracted). Free cells open "New rack". | M | Both | P1 |
| DCIM-008 | The system shall show rack elevations (front / rear) with devices, PDUs, cords, cables and panels. | M | Both | P1 |
| DCIM-009 | The system shall show a cable's path end to end, hop by hop, from a port, link or device. | M | Both | P1 |
| DCIM-010 | The system shall read device and module types (vendor, model) from the Inventory API and keep only the datacenter-specific templates for them (U height, typical W, port and power-port templates), with JSON import. | M | Both | P1 |
| DCIM-011 | The system shall show a Sites / Racks / Devices / Cabling / Power / Catalogue / Hierarchy list for each, with search and filters. | M | Both | P1 |
| DCIM-012 | The system shall let a user create a rack and install a device with U-range validation (BRULE-DCIM-03). | M | Both | P2 |
| DCIM-013 | The system shall let a user move a device to another U or rack at the site, by form or by drag-and-drop on the elevation with a green / red drop preview, with the budget checked. | M | Both | P2 |
| DCIM-014 | The system shall let a user connect, trace and disconnect ports, and edit a port's description and admin state (BRULE-DCIM-07). | M | Both | P2 |
| DCIM-015 | The system shall let a user install, swap and remove modules in bays; a line card adds its ports. | S | Both | P2 |
| DCIM-016 | The system shall let a user reserve and release rack units with a reason, and list reservations per rack. | M | Both | P2 |
| DCIM-017 | The system shall let a user create power panels and feeds with a computed rating. | S | Both | P2 |
| DCIM-018 | The system shall let a user edit or retire a rack (empty racks only). | S | Both | P2 |
| DCIM-019 | The system shall set a device's status (Active, Maintenance, Decommissioning…). | M | Both | P2 |
| DCIM-020 | The system shall put every DCIM edit under a change request: Standard, open CR or raise new (BRULE-DCIM-08). | M | Both | P2 |
| DCIM-021 | The system shall keep planned work per change request and execute it (one item or all) once the change is approved (BRULE-DCIM-09). | M | Both | P2 |
| DCIM-022 | The system shall tag records with their change request and show change chips on racks, devices and ports. | M | Both | P2 |
| DCIM-023 | The system shall show a Changes board of DCIM change requests (ready, awaiting approval, in progress, next days, done), with Raise change request. | M | Both | P2 |
| DCIM-024 | The system shall show a notice bar (ready, awaiting, in progress, plans in review), amber markers on racks with an open change, and planned racks as ghosts on the floor plan. | S | Both | P2 |
| DCIM-025 | The system shall flag single points of failure from the power chain (BRULE-DCIM-05). | M | Both | P2 |
| DCIM-026 | The system shall provide an Explorer (racks / devices, table or tiles, filters, saved views, CSV export). | S | Both | P2 |
| DCIM-027 | The system shall show per rack its activity (audit), reserved units, change requests and planned changes. | M | Both | P2 |
| DCIM-028 | The system shall show tenant cabinets as opaque Tenant gear with owner, tenant and contracted kW, and never poll them. | M | Colo | P1 |
| DCIM-029 | The system shall record cross-connects in the meet-me room, from tenant port to carrier or tenant port. | M | Colo | P1 |
| DCIM-030 | The system shall model GPU nodes with 4 or more PSUs, liquid-cooled racks with their CDU and InfiniBand rails per node. | M | Neo | P1 |
| DCIM-031 | The system shall list a device's addresses and assign the next free address of a site prefix through IP Management. | S | Both | P2 |
| DCIM-032 | The system shall write the DCIM extensions back to, or sync them with, Inventory (or the customer's NetBox / dcTrack / Nlyte) through their APIs, holding locally only the fields their APIs cannot carry (OD-01). | M | Both | P1 |
| DCIM-033 | The system shall publish `dco.dcim.record-changed` with before / after and the change id. | S | Both | P2 |
| DCIM-034 | The system shall show an Insights page (see 8.6). | S | Both | P2 |
| DCIM-035 | The system shall show in the device drawer the device's lifecycle (installed, warranty end, vendor support, open RMA) read from the lifecycle record, and link to the device page rather than keep a second device page. | S | Both | P2 |
| DCIM-036 | The system shall, when connecting a port, offer only devices at the site that have a free port of the same speed. | M | Both | P2 |
| DCIM-037 | The system shall check the invariants of BRULE-DCIM-12 on every data change and report a breach as a data-quality finding. | M | Both | P1 |
| DCIM-038 | The system shall let a user raise a change request from the Changes board with the same form as Change Management; it lands in Awaiting approval with origin DCIM. | M | Both | P2 |
| DCIM-039 | The system shall filter the Changes board by view (ready, awaiting approval, in progress, next days, done, all) and source, show which racks and devices each change touches, and list "Plans in review" (planner plans in Draft or In review at the site). | S | Both | P2 |
| DCIM-040 | The system shall show per sub-menu the actions that apply (New rack / Install device on Insights, Sites and Racks; Install device on Devices; none on Cabling, Power and Catalogue, which have in-tab actions). | S | Both | P2 |
| DCIM-041 | The system shall show on the change page the DCIM work it carries with Execute all, and complete a DCIM-raised change when all its work is done (BRULE-DCIM-09). | M | Both | P2 |
| DCIM-042 | The system shall reject a DCIM write that fails validation (U clash, budget, reserved range, freeze, missing change request) with a message naming the reason, and leave the record unchanged. | M | Both | P1 |

### 7.10.4 User stories and acceptance criteria
**US-DCIM-01** As a datacenter engineer, I want to see which UPS, busway, PDU and outlet feed a server, so that I know what a power fault hits. (DCIM-005, DCIM-008)
- Given a GPU node, when I open its power, then each PSU cord shows outlet → PDU side → busway → UPS module, and Σ PDU load = rack draw.

**US-DCIM-02** As a NOC engineer, I want a cable traced hop by hop, so that the field team goes to the right patch panel. (DCIM-009)
- Given a link, then the path lists port, optic, cord, panel, trunk, ODF, cross-connect and the far end.

**US-DCIM-03** As a field technician, I want to drag a device to free units, so that a move is quick and checked. (DCIM-013, DCIM-020)
- When I drop it on a clashing range, then the preview is red and nothing moves. When I drop it on free units, then the Move dialog asks for a change request.

**US-DCIM-04** As a change manager, I want every DCIM edit tied to a change request, so that the record never changes without approval. (DCIM-020, DCIM-021)
- Given "raise new", then a change request in Pending approval with origin DCIM exists and the edit is planned work. After approval, Execute applies it and the change request completes.

**US-DCIM-05** As a colocation operations lead, I want the floor plan coloured by tenant draw vs contracted kW, so that I see who is near their limit. (DCIM-007, DCIM-028)
- A cabinet at ≥ 90 % of contract is coloured as a warning.

**US-DCIM-06** As a planner, I want to reserve 4U in a rack for an approved plan, so that nobody installs there. (DCIM-016)
- When an install targets the reserved range, then it is refused, with the reservation named.

**US-DCIM-07** As an engineer, I want a Standard change refused during an incident freeze, so that record work does not interfere with a live incident. (DCIM-020)
- Given an open Critical incident at the site, then the Standard option is refused, with the freeze named.

### 7.10.5 Data
| Entity | Read / write | System of record | Notes |
| --- | --- | --- | --- |
| Site, device (serial, model, lifecycle) | Read | Plan to Build Inventory | master asset |
| Floor, hall, row, rack position / budget / type / condition | Read / write | Inventory API where it carries the field, else the SynapseDC DCIM extension store (OD-01) | — |
| Device placement (rack, U, height, status) | Read / write | DCIM extension | under a change request |
| Components, modules, inventory items | Read / write | DCIM extension | from type templates |
| Power panel, feed, PDU, outlet, cord | Read / write | DCIM extension | power chain |
| Patch panel, trunk, ODF, cross-connect, cable | Read / write | DCIM extension | TIA-942 |
| Device / module type | Read / write | DCIM catalogue (Supply Chain Materials for purchase) | — |
| Rack reservation | Read / write | DCIM extension | — |
| Change request, work item | Read / write | Change Management (change); DCIM (work item) | tagged |
| LLDP neighbours | Read | SynapseDC discovery (INT-01) | reconcile |

### 7.10.6 Integrations
| System / module | Direction | Data | Interface |
| --- | --- | --- | --- |
| Plan to Build Inventory | Both | asset ids, DCIM extensions | EW / INT-14 |
| Customer DCIM (NetBox, dcTrack, Nlyte) | Both | racks, devices, cables, power | INT-14 |
| Services & ITSM Change Management | Both | change requests, approval state | EW / NB-04 |
| Plan to Build IP Management | Both | device addresses | EW / INT-16 |
| Network devices | In | LLDP, ports | INT-01 |
| Event consumers | Out | record changed | NB-02 / NB-03 |

### 7.10.7 Reports and KPIs
- Racks by density.
- U used, free and reserved.
- Devices by status and maker.
- Cables by type and route, and uncabled ports.
- Power panels by load.
- Devices single-corded.
- Open DCIM change requests and planned work.

### 7.10.8 Screens
| Screen / tab | Purpose | Reference route |
| --- | --- | --- |
| DCIM · Insights | needs attention, pressure, density, makers, change requests | `/dcim` |
| Sites (+ Hierarchy) · Racks (+ Floor plan) · Devices (+ Explorer) · Cabling · Power · Catalogue | records | `/dcim?tab=sites|hierarchy|racks|floorplan|devices|explorer|cabling|power|types` |
| DCIM · Changes | change request board, Raise change request | `/dcim?tab=changes&cv=ready|approval|progress|soon|done|all` |
| Rack page | elevation, PDUs, cables, reservations, change requests, activity | `/dcim/racks/:id` |
| Type page | device type and component templates | `/dcim/types/:id` |
| Device drawer | ports, bays, move, addresses | from any list |

---

## 7.11 Compliance

**Purpose.** This module checks the estate continuously against operating policies, and maps the policy results to the controls of the standards the operator is audited on. Evidence comes from live data, not spreadsheets. Manual controls carry an attestation date.
**Lifecycle stage:** Operate. **Primary users:** compliance / risk officer, facilities manager, auditor (read-only), security lead. **Builds on:** Ops Toolkit Security Ops (security posture evidence), Services & ITSM Change Management (change policy evidence).
**Colocation:** ISO 27001 A.7 physical controls, ISO 22237 and TIA-942 resilience evidence, and SOC 2 evidence shared with tenants (export).
**NeoCloud:** the same policies, plus GPU-density power and cooling evidence (CP-01, CP-03). SOC 2 for the GPU service.

### 7.11.1 Scope
- In:
  - policies CP-01 to CP-09 evaluated on the estate;
  - frameworks with control mappings;
  - policy-as-code (Rego source per policy, switch on / off);
  - decision records (deny / warn / allow, with input);
  - violation outcome Blocked or Warned, with a change link;
  - attestations for manual controls;
  - new policy, control and framework;
  - a posture dashboard.
- Out:
  - audit management and auditor workflow (to discuss);
  - security findings and vulnerabilities (Ops Toolkit Security Ops, read as evidence);
  - change approval (Change Management).

### 7.11.2 Business rules
| ID | Rule |
| --- | --- |
| BRULE-CMP-01 | CP-01: a live rack draws ≤ 80 % of its budget. Warn. |
| BRULE-CMP-02 | CP-02: every powered device draws from both A and B. Block. |
| BRULE-CMP-03 | CP-03: every floor keeps N+1: cooling kW − the largest unit's kW ≥ heat kW. Block. |
| BRULE-CMP-04 | CP-04: every UPS holds its load ≥ 10 min on battery. Warn. |
| BRULE-CMP-05 | CP-05: management addresses are inside the site plan and unique in their VRF. Warn. |
| BRULE-CMP-06 | CP-06: no installed device is past vendor end of support. Warn. |
| BRULE-CMP-07 | CP-07: no open change breaks a blocking change policy (rollback plan, freeze). Block. |
| BRULE-CMP-08 | CP-08: every fire zone has its quarterly inspection done or booked. Warn. |
| BRULE-CMP-09 | CP-09: no plant preventive maintenance is overdue. Warn. |
| BRULE-CMP-10 | An automated control's status follows the policies that evidence it: no active policy (switched off, or only user-added policies) = **Not assessed**; no finding = **Compliant**; a finding on a blocking policy, or findings on more than 5 % of the evaluated resources = **Non-compliant**; otherwise **Partial**. A manual control is **Compliant** while attested within a year, else **Evidence due**; a user-added manual control is Evidence due until first attested. |
| BRULE-CMP-12 | Frameworks and controls: ISO/IEC 27001:2022 (A.7.11 supporting utilities ← CP-02, CP-04; A.7.13 equipment maintenance ← CP-09; A.8.32 change management ← CP-07; A.8.9 configuration management ← CP-05; A.7.2 physical entry and A.5.30 ICT readiness, manual), ISO/IEC 22237 (22237-3 power ← CP-01, CP-02, CP-04; 22237-4 environmental ← CP-03; 22237-6 security systems ← CP-08; 22237-7 management information ← CP-09, CP-06), TIA-942-C (Electrical ← CP-02, CP-01; Mechanical ← CP-03; Telecom structured cabling records, manual), SOC 2 (CC8.1 ← CP-07; A1.2 ← CP-03, CP-04, CP-08; CC7.1 ← CP-06, CP-05; CC6.4 physical access, manual). A control is evidenced only by policies that actually test it. |
| BRULE-CMP-11 | Each finding is a decision record (deny or warn). Passing resources give one allow per policy and site, with the evaluated input kept. |

### 7.11.3 Functional requirements
| ID | Requirement | Priority | Model | Phase |
| --- | --- | --- | --- | --- |
| CMP-001 | The system shall evaluate policies CP-01 to CP-09 on every data cycle (BRULE-CMP-01 to BRULE-CMP-09). | M | Both | P3 |
| CMP-002 | The system shall show each policy with its resources checked, violations, outcome (Blocked / Warned) and a link to the resource. | M | Both | P3 |
| CMP-003 | The system shall map controls of ISO/IEC 27001:2022, ISO/IEC 22237, TIA-942 and SOC 2 to the policies that evidence them. | M | Both | P3 |
| CMP-004 | The system shall compute each control's status (BRULE-CMP-10). | M | Both | P3 |
| CMP-005 | The system shall hold each policy as code (Rego package and source), viewable by the compliance officer. | S | Both | P3 |
| CMP-006 | The system shall let an authorised user switch a policy on or off. An off policy stops counting, and controls it alone evidences become Not assessed. | M | Both | P3 |
| CMP-007 | The system shall keep decision records with the OPA-style input (BRULE-CMP-11). | S | Both | P3 |
| CMP-008 | The system shall let a user attest a manual control with a date, owner and evidence note, and flag attestations that are due. | M | Both | P3 |
| CMP-009 | The system shall let a user create a policy, control or framework. | S | Both | P3 |
| CMP-010 | The system shall show a posture dashboard: overall ring, status tiles, framework cards, controls that need work, policy results, evidence due, latest decisions. | M | Both | P3 |
| CMP-011 | The system shall link a CP-07 violation to its change and block the change from starting. | M | Both | P3 |
| CMP-012 | The system shall scope compliance to one datacenter or the estate. | M | Both | P3 |
| CMP-013 | The system shall export an evidence pack per framework (CSV / PDF) for auditors and tenants (to discuss). | S | Both | P3 |
| CMP-014 | The system shall read security posture findings from Ops Toolkit Security Ops as control evidence. | S | Both | P3 |
| CMP-015 | The system shall send compliance decisions to the SIEM feed (NB-10). | C | Both | P3 |
| CMP-016 | The system shall show colocation tenant-facing controls (physical access, power resilience) as a shareable view (to discuss). | C | Colo | P3 |
| CMP-017 | The system shall record every policy, control and attestation change in the audit trail. | M | Both | P3 |
| CMP-018 | The system shall list every violation (policy, resource, site, message, outcome, raised time, change link) with search and a policy filter, and show the audit of compliance changes. | M | Both | P3 |
| CMP-019 | The system shall evidence each control only by the policies that test it (BRULE-CMP-12) and show the evidence text (resources evaluated, findings, or the attestation). | M | Both | P3 |

### 7.11.4 User stories and acceptance criteria
**US-CMP-01** As a compliance officer, I want ISO 27001 A.7.11 status from live power data, so that the evidence is current. (CMP-003, CMP-004)
- Given a device on one PDU side, then CP-02 shows Blocked, and A.7.11 shows Non-compliant with that device listed.

**US-CMP-02** As a compliance officer, I want to switch off a policy that does not apply, so that it stops distorting posture. (CMP-006)
- When CP-05 is off, then its violations stop counting, and controls evidenced only by it show Not assessed.

**US-CMP-03** As a facilities manager, I want overdue fire inspections flagged, so that I book them. (CMP-001)
- Given a zone with an overdue inspection and nothing booked, then CP-08 lists it with a link to Facilities → Environment.

**US-CMP-04** As an auditor, I want the decision record behind a finding, so that I can see what was evaluated. (CMP-007)
- When I open a finding, then I see the policy, the resource, the outcome and the input values.

**US-CMP-05** As a risk officer, I want manual controls attested with a date, so that the due ones are visible. (CMP-008)
- Given an attestation older than one year, then the control shows Evidence due.

**US-CMP-06** As a change manager, I want a change that breaks a blocking policy flagged, so that it cannot start. (CMP-011)
- Given a change with no rollback plan, then CP-07 denies it and links to the change.

### 7.11.5 Data
| Entity | Read / write | System of record | Notes |
| --- | --- | --- | --- |
| Policy, control, framework, mapping, attestation | Read / write | SynapseDC Compliance | audited |
| Decision record | Write | SynapseDC Compliance | retention to discuss |
| Racks, devices, cords, floors, UPS, addresses, models, fire zones, PM tasks | Read | DCIM / Inventory / IP Management / SynapseDC telemetry and Facilities | inputs |
| Changes and their policy violations | Read | Change Management | CP-07 |
| Security posture | Read | Ops Toolkit Security Ops | evidence |

### 7.11.6 Integrations
| System / module | Direction | Data | Interface |
| --- | --- | --- | --- |
| Services & ITSM Change Management | In | changes, violations | EW / NB-04 |
| Ops Toolkit Security Ops | In | posture, vulnerabilities | EW |
| Plan to Build Inventory / IP Management | In | devices, models, addresses | EW |
| SIEM | Out | decisions | NB-10 |
| Auditors / tenants | Out | evidence export | NB-09 (to discuss) |

### 7.11.7 Reports and KPIs
- Overall posture %.
- Controls Compliant / Partial / Non-compliant / Not assessed / Evidence due per framework.
- Violations per policy and site.
- Blocked changes.
- Attestations due.

### 7.11.8 Screens
| Screen / tab | Purpose | Reference route |
| --- | --- | --- |
| Compliance · Overview | posture dashboard | `/compliance` |
| Policies | policies, code, switch | `/compliance?tab=policies` |
| Frameworks / Controls | mappings and status | `/compliance?tab=controls` |
| Violations | every finding with its outcome and change link | `/compliance?tab=violations` |
| Decisions | decision records | `/compliance?tab=decisions` |
| Audit | compliance change audit | `/compliance?tab=audit` |

---

## 7.12 Cross-cutting: shell, business models, geography, Opstral AI, search

**Purpose.** The capabilities every SynapseDC screen shares: the shell it runs in (menu, breadcrumbs, pinned bars, embedding), the business-model and geography switches that change vocabulary, data and money everywhere, the Opstral AI copilot, global search, and the info bubble on every widget. **Lifecycle stage:** Plan, Build and Operate. **Primary users:** every role; product and platform teams for configuration. **Builds on:** Platform Engineering (identity, feature flags, customisation), AI Foundry (models for the copilot), the platform portal (embedding).
**Colocation:** vocabulary Tenant / cabinet / cage / cross-connect; capacity in kW; the GPU Fleet menu item and site tab are hidden; the site page has a Tenants tab. **NeoCloud:** vocabulary Customer / GPU cluster / job; capacity in GPUs; GPU Fleet shown; the Command Center's first area is GPU fleet.

### 7.12.1 Scope
**In scope**
- Left menu in groups (Operations, Plan & Build, Security, Admin, Reference) with sub-menus per screen; top bar with breadcrumbs, persona and geography switches, global search, Opstral AI.
- Business model (persona) and geography as first-class settings that regenerate vocabulary, customers, service types, money and the capacity unit everywhere.
- Opstral AI copilot: natural-language questions answered from the read models with deep links.
- Global search (⌘K) across sites, devices, customers, services, incidents, changes.
- Info bubble on every widget; pinned tab bars and list headers; big-screen scaling; embedding with `shell=false`.
- Deployment configuration: default persona, persona / geography overrides for embedded use.

**Out of scope**
- Identity, roles and SSO (Platform Engineering).
- Custom fields and tags as records (Platform Engineering Customization); SynapseDC evaluates them over the estate (DCIM 7.10).
- Model hosting and training (AI Foundry).

### 7.12.2 Business rules
| ID | Rule |
| --- | --- |
| BRULE-XC-01 | The business model is set by, in order: the URL `?persona=`, a deployment override, the viewer's saved choice, the deployment default. A saved choice made under a different deployment default is dropped once so returning viewers see the new default. |
| BRULE-XC-02 | The geography is set by `?geo=` or the saved choice (`in` India, `us` USA); it decides currency, number locale, date style, regions, map bounds, place names, people, carbon factor and tariffs. |
| BRULE-XC-03 | Changing persona or geography regenerates the whole estate view and every open screen refetches; the physical estate (sites, power, cooling, alarms, incidents) is the same, the vocabulary, customers, service types, room names and money differ. |
| BRULE-XC-04 | Money is written in the base currency and converted by the geography's rate; formatting always goes through the geography's formatter (₹ Cr / L, $ K / M); the currency symbol never appears as a literal in a screen. |
| BRULE-XC-05 | Every screen URL carries its state (tab, filters, selected object, scope) so a link reproduces the view; new URL parameters are added to the embed guide. |
| BRULE-XC-06 | `?shell=false` hides the menu and top bar for an iframe and is remembered for that tab / frame; `?shell=true` shows them; with neither, the shell is shown unless the frame already chose. |
| BRULE-XC-07 | Opstral AI answers only from the read models (deterministic, grounded in the data on screen) and every answer links to the screen that holds the figure; it never invents a number. |
| BRULE-XC-08 | Every widget carries an info bubble of 1–2 sentences: what it shows, how the number is computed, what clicking does, in the persona's vocabulary. |
| BRULE-XC-09 | From 2200 px the whole UI scales (1.25× from 2200, 1.5× from 2880, 2× from 3440) with charts, maps, tooltips and 3D aligned. |
| BRULE-XC-10 | Tab bars, list toolbars and grid headers stay pinned under the top bar while content scrolls; nothing is clipped at 1280 or 1440 px. |

### 7.12.3 Functional requirements
| ID | Requirement | Priority | Model | Phase |
| --- | --- | --- | --- | --- |
| XC-001 | The system shall present a left menu grouped Operations · Plan & Build · Security · Admin · Reference, with sub-menus under the open screen covering its tabs, and breadcrumbs that include the sub-menu. | M | Both | P1 |
| XC-002 | The system shall offer a business-model switch (network, colocation, cloud, enterprise, NeoCloud) and a geography switch (India, USA) in the top bar, remembered per viewer, honouring `?persona=` and `?geo=` on load. | M | Both | P1 |
| XC-003 | The system shall regenerate vocabulary (customer, service, premium words, capacity unit, money words), customers, service types, room names and incident titles per business model, and every open screen shall refetch on a switch. | M | Both | P1 |
| XC-004 | The system shall apply a deployment default persona and optional persona / geography overrides (rules `[geo:]from=to`) after the URL and the saved choice, so embedded links from other systems open the intended model. | M | Both | P1 |
| XC-005 | The system shall hide GPU Fleet (menu item, site tab, Command Center GPU area) when the estate has no GPU infrastructure, and show the colocation Tenants tab only for colocation. | M | Both | P1 |
| XC-006 | The system shall format every money figure through the geography's formatter and show the geography's currency icon in headers; no literal currency symbol in screen code. | M | Both | P1 |
| XC-007 | The system shall provide global search (⌘K) over datacenters, devices, interfaces, links, customers, services, incidents and changes, opening the object on selection. | M | Both | P1 |
| XC-008 | The system shall provide the Opstral AI drawer on every page with the page's context; it shall answer at least: which issue is costing the most revenue; what a given incident is costing; where the next GPU job should go (NeoCloud); what power is costing us / a site; and open the relevant screen from the answer. | S | Both | P2 |
| XC-009 | Every widget (panel, KPI, tile, summary-strip item) shall carry an info bubble; the bubble shall flip near the bottom of the viewport and a click inside a link shall only toggle it. | M | Both | P1 |
| XC-010 | The system shall pin the page tab bar under the top bar on every screen, and list toolbars and grid headers below it, while rows scroll. | M | Both | P1 |
| XC-011 | The system shall run every screen inside an iframe with `shell=false` (no menu, no top bar, sticky headers and full-screen map / 3D pinned to the frame) and silent single sign-on from the host portal. | M | Both | P1 |
| XC-012 | The system shall scale the UI for TVs from 2200 px with charts, map, tooltips and 3D aligned. | S | Both | P2 |
| XC-013 | The system shall show no horizontal overflow, no cut text and no NaN / undefined at 1280 and 1440 px on any screen (automated check per screen). | M | Both | P1 |
| XC-018 | The system shall use the NST / Vision Waves design system (Poppins chrome, Inter tabular numbers, NST colour tokens, `.nst-table`, `.nst-btn`, `.vw-chip`), with no secondary left menus inside screens. | M | Both | P1 |
| XC-019 | Status words shall be consistent: incidents Critical / High / Medium / Low, alarms Critical / Major / Minor / Warning; priority shown only when it differs from severity; red / amber reserved for faults. | M | Both | P1 |
| XC-020 | Every list shall use the common list toolbar (Showing N of M, search, ≤ 2 quick filters, refresh, Filters panel with Reset / Apply, actions) with URL-backed filters, and the common grid (header band, wrapping text cells, left-aligned columns, equal-width status pills). | M | Both | P1 |
| XC-021 | List pages shall open with an analytics strip of six tiles whose bars, pills and facts click through to the filtered list; closed sections shall show one-line status summaries. | S | Both | P1 |
| XC-022 | The system shall keep per-viewer conveniences (collapsed sections, chosen layout, legend state, last sub tab per group) in the browser and never use them for shared state. | S | Both | P1 |

### 7.12.4 User stories and acceptance criteria
**US-XC-01** As a NeoCloud operator opening a link from the platform portal, I want the screen to open in my business model and currency without the menu, so that it fits inside the portal (XC-002, XC-004, XC-011).
- Given the portal frames `/gpu?shell=false&persona=neocloud&geo=us`, when the page loads, then no menu or top bar is shown, GPU Fleet opens, money is in $ and the viewer is signed in silently.
- Given the deployment override `persona=neocloud`, when a link carries `?persona=colocation`, then NeoCloud still opens and the in-app switch still works until the next reload.

**US-XC-02** As an operations head, I want to ask "Which issue is costing the most revenue?" and be taken there, so that I don't search through lists (XC-008).
- Given open issues with money, when I ask in Opstral AI, then the answer names the issue, its lost-to-date and credits exposure, and a link opens the Revenue impact drawer for it.
- Given no open impact, then the answer says so and links to the 30-day history.

**US-XC-03** As a new user, I want every widget to explain itself, so that I don't need training to read a number (XC-009).
- Given any panel, KPI or tile, when I click its "i", then a bubble explains what it shows, how it is computed and what clicking does, in my model's words.

**US-XC-04** As a colocation operator, I want the product to speak of tenants, cabinets and cross-connects everywhere, so that it reads like my business (XC-003, XC-005).
- Given persona colocation, when I open any screen, then customers are "Tenants", capacity is in kW, GPU Fleet is absent and the site page shows a Tenants tab with cross-connect orders and remote hands.

**US-XC-06** As a NOC on a video wall, I want the Command Center readable on a 4K TV, so that the room sees it (XC-012).
- Given a 3440 px screen, when the Command Center opens, then the UI is scaled 2× and the map, tooltips and charts align with the pointer.

### 7.12.5 Data
| Entity | Read / write | System of record | Notes |
| --- | --- | --- | --- |
| Persona definition (vocabulary, customers, service types, room names, SLA, scale) | read | SynapseDC configuration | one per business model |
| Geography (places, currency, locale, dates, factors) | read | SynapseDC configuration | India, USA |
| Viewer preferences | write (browser) | viewer's browser | never shared |
| Identity, roles, scopes | read | Platform Engineering IdP | OIDC claims |

### 7.12.6 Integrations
| System / module | Direction | Data | Interface |
| --- | --- | --- | --- |
| Platform portal | in | framed screens with `shell=false`, SSO session, postMessage navigation | NB-11 |
| Platform Engineering | in | identity, roles, site scope, tenant claim, feature flags, deployment config | INTG-029, INTG-031 |
| AI Foundry | in / out | models for Opstral AI; tool definitions over the read API | INTG-027 |
| Intelligence Hub | out | the data model registration | INTG-032 |

### 7.12.7 Reports and KPIs
- Screens passing the layout check at 1280 / 1440 (target 100 %).
- Opstral AI answers with a deep link (target 100 % of supported questions).

### 7.12.8 Screens
| Screen / tab | Purpose | Reference route |
| --- | --- | --- |
| Shell: menu, sub-menus, breadcrumbs, persona and geography switches, search, Opstral AI | navigation and context | every route |
| Data model | entity and relationship explorer | `/data-model` |
| Embedded screen | any screen without the shell | `<route>?shell=false&persona=&geo=` |

## 8 Analytics-only pages over existing modules

These pages add datacenter analytics on top of records held by existing platform modules. SynapseDC stores none of these records. It reads them (EW / NB-04), derives the measures and drills down into the owning module's screens. Every page is Phase P2, for Both models unless stated. Measures must reconcile with the owning module's own counts.

### 8.1 Programs & Projects insights
**Purpose.** A portfolio dashboard of datacenter build projects and programmes. Delivery is recorded in the existing Programs & Projects module; this page shows health, cost and schedule across them.

| Widget | Measure / formula | Source module | Drill-down |
| --- | --- | --- | --- |
| KPI sparklines | projects active, late, at risk; CapEx approved vs spent | Programs & Projects | project list |
| Health matrix | projects by stage × health (late / at risk / on track) | Programs & Projects | project |
| Programme progress | % complete per programme; start gates waiting on predecessors | Programs & Projects | programme |
| Cost curve | PV / EV / AC; CPI = EV ÷ AC, SPI = EV ÷ PV; EAC | Programs & Projects | project cost |
| Needs attention | blockers, late POs, open snags, change orders awaiting | Programs & Projects, Supply Chain | item |
| Next 14 days | milestones, deliveries, commissioning tests | Programs & Projects | milestone |
| Change outcomes / calendar | delivery change requests by state; 14-day calendar | Change Management | change |
| Capacity coming online | kW / racks / GPUs by expected go-live | Programs & Projects + Planner | plan |
| Permits | permits by authority and state, due within 6 weeks and not granted | Programs & Projects | permit |
| Design documents | documents per project and scope, state | Programs & Projects | document |
| Materials | purchase orders open / late / in transit / delivered, value, per project | Supply Chain Procurement | PO |

| ID | Requirement | Priority | Model | Phase |
| --- | --- | --- | --- | --- |
| ANL-001 | The system shall show the widgets above, read from Programs & Projects, without storing project records. | M | Both | P2 |
| ANL-002 | The system shall mark a project **late** when its forecast finish is after its target or SPI < 0.90, **at risk** when CPI < 0.95 or SPI < 0.97, else **on track**; a programme is red with a late project, amber with one at risk, else green. An approved project not yet started is scheduled no earlier than today. | M | Both | P2 |
| ANL-003 | The system shall compute EV = budget × progress, CPI and SPI from the module's figures. | M | Both | P2 |
| ANL-004 | The system shall link each project to its source Planner plan (one plan per project). | S | Both | P2 |
| ANL-005 | The system shall show capacity coming online as GPUs for NeoCloud and as cabinets / kW for colocation. | S | Both | P2 |
| ANL-006 | The system shall show change orders with their approver by size: ≤ 5 % of budget the project manager, ≤ 15 % the programme sponsor, else the investment committee; an approved change order moves the approved budget and the finish. | S | Both | P2 |
| ANL-007 | The system shall rank project risks by likelihood × impact and show derived risks (late POs, permits not granted within 6 weeks, CPI < 0.97, SPI < 0.95 or finish after target, waiting on a predecessor). | S | Both | P2 |
| ANL-008 | The system shall show programme start gates: a project waits until its predecessors are delivered, and long-lead MEP orders at kick-off for greenfield phases. | S | Both | P2 |
| ANL-009 | The system shall show work orders by state (Planned, Ready, Awaiting change, In progress, Done) and kit (Ready, Partial, Not ordered), and never show a work order of a project that has not started as more than Ready. | M | Both | P2 |

**Data needed from Programs & Projects:** programmes (dependencies, phases), projects (stage, start, finish, target, budget approved, progress, planned progress, earned, actual), milestones, work orders (state, kit, crew, change request), commissioning tests, permits, design documents, risks, change orders, the planner plan id. **From Supply Chain:** purchase orders (supplier, lines, ordered, due, state, value).

### 8.2 Work orders and process KPIs
**Purpose.** A view of field work and the twelve datacenter processes across the estate, with targets: P01 Site onboarding, P02 Hall fit-out, P03 Customer onboarding, P04 Major incident, P05 Change, P06 Capacity expansion, P07 Firmware campaign, P08 Decommission, P09 Reconciliation, P10 Work order, P11 Maintenance mode, P12 Access request. Each has lanes (candidate roles), user steps with hour targets and automatic steps. The process definitions and instances run over the existing records (delivery work orders = P10, contractor visits = P12, open changes = P05, maintenance = P11, Critical / High incidents = P04, projects = P02 / P03 / P07 / P08, sites being built = P01); the process engine and its instances belong to the existing modules (Programs & Projects, Field Force Management); SynapseDC reads them through their APIs and runs no process engine of its own.

| Widget | Measure / formula | Source module | Drill-down |
| --- | --- | --- | --- |
| Running work | open process instances by process and step, ageing | Programs & Projects / Field Force Management API | instance |
| Process KPIs | cycle time vs target per process; % on time; failed automatic steps | workflow engine | process |
| Work-order throughput | opened / completed per week; first-time fix; re-plans | Field Force Management | work order |
| Waiting on kit | work orders blocked by kit not on site | Field Force Management + Supply Chain | PO |
| Site access | visits per site, escorts, overstays | Access (SynapseDC) + P12 | visit |

| ID | Requirement | Priority | Model | Phase |
| --- | --- | --- | --- | --- |
| ANL-010 | The system shall show running work and KPIs for the 12 datacenter processes, against each step's target. | M | Both | P2 |
| ANL-011 | The system shall show work-order throughput, first-time fix and re-plans per site. | S | Both | P2 |
| ANL-012 | The system shall list work orders blocked by kit, with their PO state. | S | Both | P2 |
| ANL-013 | The system shall link each item to the owning module's record. | M | Both | P2 |
| ANL-014 | The system shall show remote-hands tickets for colocation tenants per site, with SLA. | S | Colo | P2 |
| ANL-015 | The system shall show a My tasks inbox: user steps as tasks with candidate role, due time and overdue flag; a user can claim a task and complete it with the step's form, which advances the instance (completing P10 "Start work" / "Complete with evidence" moves the delivery work order). | M | Both | P2 |
| ANL-016 | The system shall retry a failed automatic step and show the retry in the instance's event history. | S | Both | P2 |
| ANL-017 | The system shall show a swimlane view per process definition and KPIs from closed runs of the last quarter (cycle time vs target, on-time %). | S | Both | P2 |

**Data needed:** process definitions (steps, lanes, targets), instances with step history, work orders (state, crew, site, kit status), remote-hands tickets.

### 8.3 Commissioning L1–L5
**Purpose.** Commissioning progress for every project, by level:
- L1 factory witness;
- L2 site acceptance;
- L3 pre-functional;
- L4 functional;
- L5 integrated systems test.

Test records stay in Programs & Projects.

| Widget | Measure / formula | Source module | Drill-down |
| --- | --- | --- | --- |
| Level funnel | projects at each level; passed / failed / scheduled | Programs & Projects | project |
| Upcoming tests | tests in the next 14 days, with witness | Programs & Projects | test |
| Snags | open snags by project and level | Programs & Projects | snag |
| Handover readiness | all work orders done + L5 passed | Programs & Projects | project |

| ID | Requirement | Priority | Model | Phase |
| --- | --- | --- | --- | --- |
| ANL-020 | The system shall show commissioning by level, in order (a level cannot pass before the one below it; L3 and above need installation done). | M | Both | P2 |
| ANL-021 | The system shall show a project as handover-ready only when every work order is done and L1–L5 have passed; handover marks the plan and its capacity plans Delivered. | M | Both | P2 |
| ANL-022 | The system shall list open snags per project and level. | S | Both | P2 |
| ANL-023 | The system shall show liquid-cooling (CDU loop) and GPU burn-in tests as named L4 / L5 tests for GPU halls (to discuss). | C | Neo | P2 |

**Data needed:** commissioning tests per project (level, date, witness, result), snags, work-order states.

### 8.4 IP & Network insights
**Purpose.** Datacenter views over IP Management records: utilisation and exhaustion forecasts per prefix, addresses outside the site plan, and differences from DNS / DHCP / IPAM systems.

| Widget | Measure / formula | Source module | Drill-down |
| --- | --- | --- | --- |
| Prefix utilisation | used = addresses actually bound ÷ size | IP Management | prefix |
| Exhaustion forecast | growth = addresses on devices installed in the last 12 months ÷ 12; full by = free ÷ growth (containers, point-to-point prefixes and prefixes smaller than 8 addresses are not forecast) | IP Management + Inventory install dates | prefix |
| Prefix state | Consumed when ≥ 90 % or nothing free; Committed when ≥ 75 % or full within 12 months; else Available | IP Management | prefix list |
| Outside plan | management addresses outside the site's management prefixes | IP Management + discovery | address |
| Integration differences | records differing from Infoblox / BlueCat / DNS / DHCP | IP Management connectors | difference |

| ID | Requirement | Priority | Model | Phase |
| --- | --- | --- | --- | --- |
| ANL-030 | The system shall show prefix utilisation counting bound addresses only (no padding). | M | Both | P2 |
| ANL-031 | The system shall forecast exhaustion per prefix and classify it as Consumed / Committed / Available. | M | Both | P2 |
| ANL-032 | The system shall list addresses outside the site plan as findings (feeding CP-05). | M | Both | P2 |
| ANL-033 | The system shall show differences between IP Management and the connected DNS / DHCP / IPAM systems. | S | Both | P2 |
| ANL-034 | The system shall show InfiniBand and front-end fabric address space per GPU pod. | S | Neo | P2 |
| ANL-035 | The system shall show each site's management space as its own VRF (sites may reuse management ranges) under one container, and the fabric plan per site (loopbacks, point-to-point /31s, a /22 per hall, storage). | S | Both | P2 |

**Data needed from IP Management:** VRFs, prefixes (parent, size, role, site), addresses (device, interface, primary), VLANs, ASNs, connector differences. **From Inventory:** device install dates.

### 8.5 Change management overview
**Purpose.** A datacenter view of every change, maintenance and delivery change request in Services & ITSM Change Management. It covers volume, outcome, lead time, approvals, freezes and which changes caused incidents.

| Widget | Measure / formula | Source module | Drill-down |
| --- | --- | --- | --- |
| Volume and outcome | changes per week by class (Standard / Normal / Emergency) and outcome; failed includes "caused an incident" | Change Management | list |
| Lead time | request → approval → start, per class | Change Management | change |
| Open by stage | Draft / Pending / Approved / In progress | Change Management | list |
| Approvals and the board | approvals waiting by role (change manager, site lead from Medium risk, CAB at High, ECAB for Emergency) | Change Management | approval |
| Next 14 days / calendar | windows; conflicts (overlapping windows on the same devices); freezes (open Critical incident at a site; peak and year-end calendar) | Change Management + SynapseDC incidents | change |
| By site / where changes fail | count and failure % by site, source and template | Change Management | filtered list |
| Caused an incident | a completed change cited by an incident's leading root-cause hypothesis | SynapseDC RCA + Change Management | incident / change |

| ID | Requirement | Priority | Model | Phase |
| --- | --- | --- | --- | --- |
| ANL-040 | The system shall show the overview widgets in equal-height pairs, with a tabbed detail table (needs attention, waiting for review, next 14 days, last 28 days). | M | Both | P2 |
| ANL-041 | The system shall count a change as failed when it rolled back or was cited by an incident's leading hypothesis. | M | Both | P2 |
| ANL-042 | The system shall show site freezes derived from open Critical incidents, alongside the calendar freezes. | M | Both | P2 |
| ANL-043 | The system shall flag conflicting windows on the same devices at the same site. | S | Both | P2 |
| ANL-044 | The system shall show policy checks on changes: POL-01 no rollback plan and POL-02 inside a freeze = Block; POL-03 high-risk window outside 22:00–06:00 (not emergency or delivery changes), POL-04 touches a single point of failure (not standard changes), POL-05 overlapping window on the same devices, POL-06 post-implementation review overdue on a completed emergency change = Warn. | S | Both | P2 |
| ANL-046 | The system shall apply freezes as the module does: a site with an open Critical incident allows emergency changes only; peak-season and year-end calendar freezes allow standard and emergency changes; freezes hold live sites only and never civil works. | M | Both | P2 |
| ANL-047 | The system shall measure lead time on normal changes implemented each week: median days from raised to the last approval, then from approval to the window. | S | Both | P2 |
| ANL-048 | The system shall include preventive maintenance done in the last 12 weeks as completed standard changes (template STD-03) in volume and outcome. | S | Both | P2 |
| ANL-045 | The system shall include DCIM-raised changes and delivery change requests in all measures. | M | Both | P2 |

**Data needed from Change Management:** changes (class, risk, status, window, devices, site, approvals, rollback, origin, template), approval matrix, calendar freezes, standard templates. **From SynapseDC:** incidents and RCA hypotheses.

### 8.6 DCIM Insights
DCIM Insights is specified with DCIM (7.10, DCIM-034). Its widgets are:
- needs attention (the same filters as the Racks, Cabling, Power and Devices lists);
- sites and halls by power pressure (85 % marker);
- rack density;
- device donuts;
- cabling stacks;
- power panels by load;
- makers;
- change requests.

It reads DCIM extensions and Inventory records only.

## 9 Integration with the existing platform modules

Every module below is **consumed through its API only** (ARCH-001…007); the API is assumed available and SynapseDC builds nothing of the module itself. The module is the system of record for the objects listed under "SynapseDC reads". SynapseDC never writes those objects except where "SynapseDC sends" says so, and then through the module's own API or the platform event bus, under the module team's contract. Interface references are to the interface specification (NB = northbound, INT = southbound / records, EW = east–west). Each row is a requirement: `INTG-nnn`.

### 9.0 Telemetry: OAP ingestion and consumer services (ClickHouse)

| ID | SynapseDC reads | SynapseDC sends | Interface | Phase |
| --- | --- | --- | --- | --- |
| INTG-055 | — | Every metric and time series from the collector (network, BMC, UPS, PDU, meters, ATS, DG, BMS / cooling / CDU, environment sensors, DCGM / Gaudi / XPU, scheduler, UFM) with labels site · floor · room · rack · device · port · gpu · tenant | OAP telemetry **ingestion** microservice API (OTLP / remote write accepted by it), writing ClickHouse; INT-28 | P1 |
| INTG-056 | Latest values, ranges, 5-minute / hourly roll-ups, top-N and histograms per series and label set | — | OAP telemetry **consumer** microservice API, reading ClickHouse | P1 |
| INTG-057 | Retention, roll-up and down-sampling policies | Metric catalogue: names (`dco_<domain>_<quantity>_<unit>`), units, labels, expected interval per source | OAP telemetry services (configuration API) | P1 |
| INTG-058 | Freshness per series (last sample time, receipt time) for stale / unmonitored states | — | OAP telemetry consumer API | P1 |
| INTG-059 | — | Metric export to the customer's stack (Prometheus / OTLP / BI) is served by the OAP services, not by SynapseDC | NB-08 | P2 |

### 9.1 Operate to Acquire (BSS): CRM, Plans & Products Catalog, Orders, Customers, Experience and Care

| ID | SynapseDC reads | SynapseDC sends | Interface | Phase |
| --- | --- | --- | --- | --- |
| INTG-001 | Customers (account, premium / reserved tier, account manager, locations) | — | EW (CRM / Customers API), daily + change events | P1 |
| INTG-002 | Contracts: SLA targets, credit rules, contracted kW per cabinet (Colo), GPU rate and reserved GPUs (Neo), term | — | EW (Customers / Catalog), daily | P1 |
| INTG-003 | Services and their placement: service → site, rack / cabinet, device, port, links; GPU cluster → nodes (Neo) | Observed placement differences (service path not found on the estate) | EW (Orders), on change + daily | P1 |
| INTG-004 | Products and plans (what "GPU cluster", "Cabinet 10 kW", "Cross-connect" are) | — | EW (Plans & Products Catalog) | P1 |
| INTG-005 | — | Impact per customer (services down / degraded / exposed, incidents, money at risk, SLA status) for the account timeline and Experience and Care | NB-02 events `dco.revenue.impact-changed`, `dco.incident.*` | P1 |
| INTG-006 | — | Customer notices (initial 15 / 30 / 60 min, updates 1 / 2 / 4 h) through Experience and Care channels | EW / NB-06 | P2 |
| INTG-007 | — | SLA credits owed per incident and month (minutes, tier, amount) | NB-07 / EW | P2 |
| INTG-008 | — | Metered usage: kWh and peak kW per cabinet / tenant (Colo); GPU hours delivered and lost per job and customer (Neo) — to the customer's billing system | NB-07 (SAP OData / Zuora / CSV), daily + monthly | P2 |
| INTG-009 | Cross-connect orders and remote-hands tickets (Colo) | Order / ticket references on the customer page | EW (Orders / Tickets) | P2 |
| INTG-010 | When the customer runs their own CRM (Salesforce, Dynamics): the same objects through the connector | Same as above | NB-07 | P2 |

### 9.2 Services & ITSM: Incidents, Change Management, Maintenance, Knowledge Center, Tickets

| ID | SynapseDC reads | SynapseDC sends | Interface | Phase |
| --- | --- | --- | --- | --- |
| INTG-011 | Incident state, owner, assignment, work notes, resolution, priority | Incident open (Critical / High and per rule), severity, affected CIs, impact summary, RCA hypotheses with evidence, recommended actions, verification results, worklog lines | EW (Incidents) / NB-04 for ServiceNow, Jira SM, Helix | P1 |
| INTG-012 | Problem records (state, known error) | Problem created when incidents group by cause (e.g. one optics lot) | EW (Incidents / Problems) | P2 |
| INTG-013 | Changes at a site: status, window, scope, approver, class (standard / normal / emergency), freeze and conflict decisions, CAB outcome | Change requests raised from SynapseDC: DCIM record work, emergency change from an incident, maintenance from the PM plan, planner delivery CRs; DCIM work items executed under a CR | EW (Change Management) / NB-04 | P1 |
| INTG-014 | Maintenance windows and maintenance changes naming a plant asset | Due / overdue preventive maintenance per plant asset; "Schedule maintenance" | EW (Maintenance) | P2 |
| INTG-015 | Knowledge articles linked to an alarm type / incident type | Runbook links on recommended actions **(to discuss)** | EW (Knowledge Center) | P3 |
| INTG-016 | Tickets: remote hands, cross-connect, access requests, RMA cases | Ticket references on devices, customers and work | EW (Tickets) | P2 |
| INTG-017 | A completed change cited by an incident's leading RCA hypothesis | "Caused an incident" flag on that change (counts as failed) | EW | P2 |

### 9.3 Opstral Ops Toolkit: System Alerts, Telemetry Ops, Data Ops, Infra Ops, Fin Ops, Proc Bots, Explainability, Security Ops, Service Ops, Agent Ops

| ID | SynapseDC reads | SynapseDC sends | Interface | Phase |
| --- | --- | --- | --- | --- |
| INTG-018 | Alerts raised by System Alerts for devices in a datacenter (identity, severity, state, source) | Normalised datacenter alarms from the collector (UPS, PDU, BMS, DCGM, Modbus thresholds) into System Alerts; scope (site / edge / dependency / downstream), placement (site → rack → device → port), rack-level and shared-fault tags | EW (System Alerts) / INT-28 | P1 |
| INTG-019 | Alert routing, paging chain, on-call now (System Alerts, or PagerDuty / Opsgenie behind it) | Page on incident open / severity change; acknowledgements back | EW / NB-05 | P1 |
| INTG-020 | Telemetry pipeline state (Telemetry Ops); the series themselves come through the OAP services (9.0) | Collector configuration: targets, intervals, mapping tables; collector heartbeat | EW (Telemetry Ops) / INT-28 | P1 |
| INTG-021 | Data quality and pipeline state (Data Ops) | Monitoring gaps: collector stale / down, device unmonitored, silent source | EW (Data Ops) | P1 |
| INTG-022 | Job scheduler integration state (Infra Ops) for Slurm / Kubernetes / Run:ai | — | EW (Infra Ops) / INT-12 | P1 |
| INTG-023 | Cost data and budgets (Fin Ops) | Power cost per site, per sold MW-month, per GPU-hour, idle power cost, contract findings | EW (Fin Ops) | P2 |
| INTG-024 | Security Ops: detections, cases, rules, vulnerability feeds, data sources (ClickHouse / OCSF tables), sensors | Datacenter context for correlation (DCIM, IPAM, change windows, tickets as dictionaries); physical exceptions from the access log; datacenter Sigma rules (SR-060 cross-domain etc.) | EW (Security Ops) | P2 |
| INTG-025 | Explainability: model cards / explanations for AI answers | RCA hypothesis evidence and confidence for display | EW | P3 |
| INTG-026 | Service Ops / Agent Ops: service maps, agent runs | Opstral AI answers from SynapseDC read models ("which issue costs the most", "where should the next GPU job go") | EW (Agent Ops) | P2 |

### 9.4 AI Foundry

| ID | SynapseDC reads | SynapseDC sends | Interface | Phase |
| --- | --- | --- | --- | --- |
| INTG-027 | Models and agents for the Opstral AI copilot (natural-language questions over the read models) | Tool definitions over the REST API (read scopes) and the read-model context per question | EW (AI Foundry) / NB-01 | P2 |
| INTG-028 | — | Training / evaluation data for RCA ranking and forecast models **(to discuss)**: anonymised alarm sets with confirmed / rejected RCA feedback | EW | P3 |

### 9.5 Platform Engineering

| ID | SynapseDC reads | SynapseDC sends | Interface | Phase |
| --- | --- | --- | --- | --- |
| INTG-029 | Identity and roles (OIDC, groups → roles, site scope claim, tenant claim) | — | NB-11 / platform IdP | P1 |
| INTG-030 | Custom fields and tags defined for datacenter entities (rack, device, site, customer) | Filled counts and tag rules evaluated over the estate | EW (Customization) | P2 |
| INTG-031 | Feature flags, tenant configuration, environment overrides (persona default, geography) | — | EW | P1 |

### 9.6 Intelligence Hub (except Command Center)

| ID | SynapseDC reads | SynapseDC sends | Interface | Phase |
| --- | --- | --- | --- | --- |
| INTG-032 | Data model registry: the SynapseDC entities (51) and relationships (107) registered as a domain | Entity definitions with fields marked Import / Live / Derived; the import template | EW (Intelligence Hub) | P1 |
| INTG-033 | — | Hourly roll-ups, alarms, incidents, changes, revenue, GPU job hours, power to the data lake / BI (Parquet / CSV or SQL views **(to discuss)**) | NB-08 / NB-09 | P2 |
| INTG-034 | — | Normalised metric series (`dco_*`) to Prometheus / OTLP — served by the OAP telemetry services (INTG-059) | NB-08 | P2 |

### 9.7 Plan to Build: Inventory Planning, Inventory, IP Management, Programs & Projects

| ID | SynapseDC reads | SynapseDC sends | Interface | Phase |
| --- | --- | --- | --- | --- |
| INTG-035 | Inventory: sites, floors, rooms, racks, devices, modules, serials, models, install dates, warranty, vendor end of sale / support, owners | DCIM extensions (section 7.10): U position, PDU outlets and cords, panels and feeds, patch panels, trunks, cable paths, rack type and condition; observed state (serial, modules, firmware, LLDP neighbours) for the inventory's reconciliation; drift flags | INT-14 / EW (Inventory), webhooks + daily reconcile | P1 |
| INTG-036 | IP Management: prefixes, VRFs, VLANs, addresses, DNS names; management address per device | Addresses found outside the plan; exhaustion forecast per prefix (analytics 8.4) | INT-16 / EW (IP Management) | P2 |
| INTG-037 | Inventory Planning: capacity targets, planned devices, holds | Capacity by site / hall, reservations (planned devices, approved plans, contracted blocks), forecast | EW (Inventory Planning) | P2 |
| INTG-038 | Programs & Projects: programmes, projects, milestones, work orders, purchase orders, commissioning levels, permits, documents, risks, change orders, cost (PV / EV / AC) | Approved plans handed over as projects (plan id ↔ project id), with the sourced bill of materials, vendor orders, holds, IP and record manifests; handover completes the plan | EW (Programs & Projects) | P2 |
| INTG-039 | Work orders and process instances (P01 site onboarding … P12 access request), task state | Work orders for RMA, cable work, rack installs from DCIM change requests **(to discuss)** | EW (Programs & Projects / Field Force Management) | P2 |
| INTG-040 | When the customer runs their own DCIM (NetBox, dcTrack, Nlyte, Device42) or CMDB (ServiceNow): the same objects through the connector | Same as INTG-035 | INT-14, INT-15 | P2 |

### 9.8 Supply Chain: Materials, Vendors, Contracts, Procurement, Warehouses, Field Force Management, Logistics

| ID | SynapseDC reads | SynapseDC sends | Interface | Phase |
| --- | --- | --- | --- | --- |
| INTG-041 | Vendor support contracts and levels, catalogue models and prices, lead times, contracts and channels | Warranty / support state per device, end-of-support exposure | EW (Vendors, Contracts), weekly | P2 |
| INTG-042 | Spares stock per part family and site (Warehouses, Materials) | Spare draw-down on an RMA; spares minimum breaches | EW (Materials / Warehouses) | P2 |
| INTG-043 | Purchase orders raised for a plan's bill of materials; goods receipt | Bill of materials with sourcing (site spare → stock → vendor under contract) at "Start the build" | EW (Procurement) | P2 |
| INTG-044 | Field engineer jobs and visits (Field Force Management) | Site access needs for work orders; contractor visits as access records | EW (FFM) | P2 |
| INTG-045 | OEM lifecycle through the platform's vendor connectors (Cisco, Dell, HPE, Arista, Fortinet) or import | — | INT-26 | P2 |

### 9.9 Customer-side systems (when the platform module is not used)

| ID | System | Role | Interface | Phase |
| --- | --- | --- | --- | --- |
| INTG-046 | ServiceNow / Jira SM / BMC Helix | ITSM record | NB-04 | P1 |
| INTG-047 | PagerDuty / Opsgenie / xMatters | paging and on-call | NB-05 | P1 |
| INTG-048 | Salesforce / Dynamics / SAP | CRM and contracts | NB-07 | P2 |
| INTG-049 | NetBox / dcTrack / Nlyte / Device42; ServiceNow CMDB | DCIM / CMDB record | INT-14, INT-15 | P2 |
| INTG-050 | Infoblox / BlueCat / Kea / Microsoft DNS | IPAM | INT-16 | P2 |
| INTG-051 | PACS (Lenel, Gallagher, Genetec, Brivo), visitor (Envoy, Proxyclick), VMS (Milestone, Genetec) | physical security events | INT-17–19 | P2 |
| INTG-052 | Splunk / Sentinel / QRadar | SIEM | NB-10 | P2 |
| INTG-053 | Customer's observability stack (Prometheus, Grafana, Datadog) | metric export | NB-08 | P2 |
| INTG-054 | Customer portal | embedded screens; tenant-scoped API **(to discuss)** | NB-11, NB-12 | P1 / P3 |


### 9.10 API needs per module (to confirm with each module team)

SynapseDC assumes these APIs exist (ARCH-001). A module team that cannot offer one records it here as an API gap; SynapseDC does not build a local substitute (ARCH-004).

| Module | Read APIs SynapseDC calls | Write APIs SynapseDC calls | Events SynapseDC subscribes to |
| --- | --- | --- | --- |
| OAP telemetry services | query latest / range / roll-up / top-N / histogram; freshness | ingest (OTLP / remote write); metric catalogue | — |
| Ops Toolkit System Alerts | alerts by site / device / state; alert by id | raise / update / clear alert; add scope and placement tags; acknowledge | alert raised / cleared |
| Ops Toolkit Security Ops | detections, cases, rules, vulnerabilities, sensors by site | datacenter context dictionaries; physical exceptions; case links | detection raised, case changed |
| Ops Toolkit Telemetry / Data / Infra / Fin Ops | pipeline and scheduler integration state; cost data | collector configuration; power cost figures | pipeline state changed |
| Services & ITSM | incidents, problems, changes (with class, window, approvals, freezes), tickets, maintenance windows, knowledge articles | create / update incident, worklog, resolve; create change request, attach work items, transition; create problem; create ticket | incident / change / ticket changed |
| BSS (CRM, Customers, Orders, Catalog, Experience and Care) | customers, contracts and SLA, services with placement, products | impact per customer; notices; SLA credits; metered usage | customer / contract / order changed |
| Plan to Build Inventory | sites, rooms, racks, devices, modules, lifecycle, owners | DCIM extensions it can carry; observed state for reconciliation | asset created / changed |
| Plan to Build Inventory Planning | capacity targets, holds | reservations from approved plans | plan / hold changed |
| Plan to Build IP Management | prefixes, VRFs, VLANs, addresses | address assignment from DCIM (under a CR) | address changed |
| Plan to Build Programs & Projects | programmes, projects, milestones, work orders, POs, commissioning, risks, change orders, cost | create project from an approved plan; handover status | project / work order changed |
| Supply Chain | vendors, contracts, catalogue prices, lead times, stock, POs, FFM jobs | BoM with sourcing; spare draw-down | PO / stock changed |
| Platform Engineering | identity, roles, scopes, flags, custom fields, tags | — | — |
| AI Foundry | models / agents for Opstral AI | tool definitions | — |
| Intelligence Hub | data model registry | entity definitions | — |
---

## 10 Data requirements

### 10.1 Entity model

51 entities in 107 relationships, in nine domains: Estate & locations · Facility (power, cooling, environment & safety) · Equipment & connectivity · GPU · Customers & services · Operations (alarms, incidents, changes, problems, on-call) · Lifecycle & process · Access & security · Planning & delivery. Every field is classified **Import** (a record someone enters or a module syncs), **Live** (a reading or event from the collector) or **Derived** (computed by a read model; never stored as input).

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| DATA-001 | Every count on every screen shall be derived from entities (devices, interfaces, links, services, alarms, incidents); no count is typed in or configured. | M | P1 |
| DATA-002 | Every entity shall have a stable string identity; external references (ITSM number, CRM id, DCIM id, PACS badge id) are kept in `externalRefs[]`, never used as the key. | M | P1 |
| DATA-003 | Every live sample shall keep the source timestamp and the receipt timestamp; a value is fresh while the last sample is younger than two polling intervals, else stale; no successful poll for 15 min → device unmonitored. | M | P1 |
| DATA-004 | Record data shall carry the last successful sync time and the system of record. | M | P1 |
| DATA-005 | Both the normalised alarm and the raw source event shall be stored for audit and replay. | M | P1 |
| DATA-006 | Money shall be stored as amount + currency in the operator's currency; tariffs and benchmarks carry an "illustrative" flag until replaced by the customer's values. | M | P1 |
| DATA-007 | The containment chain region → site → floor → room → row → rack → device → port shall be complete for every live device; a device without a rack is a data-quality finding. | M | P1 |
| DATA-008 | Tenant-owned equipment (Colo) shall be stored as an opaque block per cabinet (owner, contracted kW, role) with no device records inside it. | M | P1 |
| DATA-009 | GPU records shall carry the DCGM field set per GPU and 24 h history; job records carry job id, customer, GPUs / nodes, state, step time, MFU, last checkpoint. Workload data, models and code are never stored. | M | P1 |
| DATA-010 | Custom fields and tags from Platform Engineering shall be attachable to site, rack, device and customer. | S | P2 |
| DATA-015 | Telemetry samples shall be stored only in ClickHouse through the OAP ingestion service; SynapseDC stores no samples, and every live figure is read through the OAP consumer API with its source and receipt time. | M | P1 |
| DATA-016 | Records owned by an existing module shall be referenced by that module's id; SynapseDC holds only derived results and datacenter-specific extensions keyed by it (ARCH-003, ARCH-012). | M | P1 |
| DATA-011 | All per-persona vocabulary (customer / service / premium words, capacity unit, money words) shall be configuration, not code. | M | P1 |

### 10.2 Onboarding data (the import template)

The inventory import template (one sheet per entity, 35 data sheets, field dictionary, lookups, summary checks) is the fallback for every record no system holds: physical placement, power chain, structured cabling, design ratings (site design kW, rack budgets, UPS / DG nameplate, tank, cooling capacity, redundancy, Tier), sensor positions, commercial records, service paths, lifecycle dates for vendors without an API, process records (PM plan, inspections, tests, risks, spares minimums, on-call rota). Load order: Sites → Floors → Rooms → Racks → power / cooling plant → Devices → Interfaces → Links → GPU → Customers → Services → Collectors. **Core** data is required before a site goes live; **Recommended** before Facilities and Revenue are trusted; **Optional** later.

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| DATA-012 | The system shall import the template with per-sheet validation (lookups, references, U clashes, rack budget, Σ checks) and report every rejected row with its reason. | M | P1 |
| DATA-013 | The system shall reconcile an imported site against the collector's discovered inventory (serial, model, modules, LLDP) and report differences to the inventory module; it shall not resolve them itself. | M | P1 |
| DATA-014 | The system shall export any site in the same template layout (data backup). | S | P2 |

### 10.3 Retention

Telemetry retention (raw samples and roll-ups) is set in the OAP telemetry services on ClickHouse; the figures below are what SynapseDC's screens need from them.

| Data | Retention (proposed, **to discuss**) |
| --- | --- |
| Raw samples | 30 days |
| 5-minute roll-ups | 13 months |
| Hourly roll-ups | 5 years |
| Alarms, incidents, changes, problems | 5 years |
| Access events | 1 year; CCTV references 90 days |
| Audit trail | 7 years |

---

## 11 Non-functional requirements

| ID | Area | Requirement | Priority |
| --- | --- | --- | --- |
| NFR-001 | Availability | Central platform API and screens 99.9 % monthly; the collector buffers 72 h so a WAN outage leaves no gap. | M |
| NFR-002 | Latency | Trap / push sources on screen and in the northbound event ≤ 15 s p95; polled sources ≤ one interval + 10 s; incident opened ≤ 60 s after the first alarm; API p95 ≤ 300 ms (one object), ≤ 1 s (lists and roll-ups). | M |
| NFR-003 | Scale | 100 sites, 200 k devices, 50 k GPUs per tenant; ≥ 500 k samples / s and ≥ 2 k events / s per region. The sample rate is carried by the OAP telemetry ingestion service on ClickHouse (a dependency); SynapseDC's own load is the read models and API. | M |
| NFR-004 | Polling | UPS / ATS 10 s + traps; interfaces 30 s (gNMI 10 s); ICMP 30 s, 3 misses; DCGM 10–30 s; PDUs / sensors / cooling / BMC 60 s; inventory 6–24 h + events; records webhooks + daily; OEM weekly. | M |
| NFR-005 | Security | Read-only southbound; outbound-only collector over mTLS 443; SNMPv3 authPriv; Redfish HTTPS; BACnet/SC where available; Modbus / BACnet/IP / SNMP v2c only on isolated VLANs; credentials in the collector vault, rotated ≤ 90 days; OAuth 2.0 / OIDC northbound with scopes per area; every write audited. | M |
| NFR-006 | Tenancy and privacy | Per-tenant separation; tenant-scoped tokens see only their objects; colocation tenant gear never polled; GPU workload contents never read; data residency per customer. | M |
| NFR-007 | Reconciliation | Every roll-up equals the sum of its parts (alarms in scope, incidents, services, money, capacity); automated checks run on every data change. | M |
| NFR-008 | Freshness | Every live figure shows its freshness; stale and unmonitored states are visible, never hidden. | M |
| NFR-009 | Usability | NST / Vision Waves design system; no secondary left menus inside screens; every widget carries an info bubble (what it shows, how computed, what clicking does); 1280 and 1440 layouts with no horizontal overflow; TV scaling from 2200 px. | M |
| NFR-010 | Embedding | Any screen runs inside the platform portal (`shell=false`) with silent SSO; deep links keep their parameters. | M |
| NFR-011 | Accessibility | WCAG 2.1 AA for colour contrast, keyboard navigation and focus; status never by colour alone. | S |
| NFR-012 | Localisation | Geography sets currency, number and date formats; India and USA first. | M |
| NFR-013 | Big screens | From 2200 px the UI scales (1.25 / 1.5 / 2×) with charts, maps and 3D aligned. | S |
| NFR-014 | 3D | Realistic twin degrades automatically on slow GPUs (post-processing dropped); schematic twin works without WebGL via the 2D fallback. | S |
| NFR-015 | Auditability | Every API write, record change, integration call and AI answer is in the audit trail with actor, before / after and change request. | M |
| NFR-016 | Recovery | RPO 5 min, RTO 1 h for the central platform. | S |
| NFR-017 | Observability of integrations | Every connector reports last success, error count and lag; failures raise an alarm under Data Ops. | M |
| NFR-018 | API | OpenAPI 3.1 generated from the contract; cursor paging; ETag / If-Match; Idempotency-Key on POST; RFC 9457 errors; rate limits 600 reads / 60 writes per minute per client; deprecation ≥ 6 months. | M |
| NFR-019 | Events | CloudEvents 1.0; at-least-once with id and per-subject sequence; webhook HMAC signature and retry schedule; Kafka topics versioned. | M |
| NFR-020 | Testing | Each screen has an automated layout and data check (overflow, NaN / undefined, equal heights, sticky headers); each read model has a reconciliation check; each interface has contract tests and failure drills (source down, WAN down, receiver down, duplicates). | M |

---

## 12 Phasing and release plan

| Phase | Name | Content | Exit criteria |
| --- | --- | --- | --- |
| **P1** | Operate core (MVP) | Collector and INT-01…13, INT-28; alarm scope, normalisation, correlation, incident enrichment on System Alerts + ITSM Incidents / Change Management; Command Center; Datacenters site page (Overview, Needs attention, Metrics, Ops log, schematic layout, Equipment, Space & ports, Customers, Revenue tabs); device page (3D view schematic, interfaces, links, Power & cabling); Facilities Power / Cooling / Environment; GPU Fleet jobs, nodes, clusters, telemetry, GPU models, rails; Revenue Impact; DCIM records (racks, devices, power panels / feeds / outlets / cords, cabling) with the standard-CR path; customer page; import template and reconciliation reporting; integrations INTG-001–005, 011, 013, 018–022, 029, 031, 032, 035, 046, 047, 054 (embed). | Two pilot sites (one Colo, one Neo) live; reconciliation checks green; NFR-001–008 met |
| **P2** | Resilience, money, plan & build | Realistic twin, walk, power & cable paths, device popup and trace views; Access & security tab; SPOF and what-if; maintenance (PM plan, resilience tests); lifecycle, RMA, spares; environment & safety panels; Capacity & reservations; power economics (contracts, bill, findings, GPU cost per GPU-hour, by job / tenant, placement); Planner (all families, templates, benchmarks, governance, materials, plan pack, review pack and portal, edit policy) with hand-off to Programs & Projects; DCIM change control (open CR / raise new), drag-move, reservations, explorer, insights; analytics pages 8.1–8.6; Datacenter Security Ops; notices and credits to BSS; metered usage export; customer-side connectors INTG-040, 048–053; Opstral AI on AI Foundry. | Planner → Programs & Projects round trip on a real plan; power findings validated against a real bill; Security Ops cases on real detections |
| **P3** | Govern and extend | Compliance (policies as code, frameworks, decision records, attestations); tenant-scoped API; Knowledge Center runbooks; AI Foundry model training on RCA feedback; cloud, enterprise and telco variants; further vendor connectors. | Compliance evidence accepted by an auditor for one framework; one tenant portal live on NB-12 |

### 12.1 Onboarding a customer site (the delivery approach)

Each site follows the same onboarding journey; the BRD requirements each step relies on are listed.

| Step | What happens | Relies on |
| --- | --- | --- |
| 1 Prepare and first meeting | Pitch by role and value, then a demo in the customer's business model (persona switch) | XC-002 |
| 2 Discovery workshops | Question banks: business, estate, their systems and tools (BMS, EPMS, UPS, PDUs, DCIM, ITSM, CRM, PACS, NMS, SSO, SIEM; GPU: DCGM, scheduler), Integrate-or-Offer decision per system | section 9, interface spec |
| 3 Site survey | A site survey per datacenter: collector placement, BMS, equipment, BMCs, firewall rules, records, sign-off | NFR-004, NFR-005 |
| 4 Proposal and pilot | Scope = P1 operate core on one site; success criteria from section 2.3 | section 12 |
| 5 Onboarding data | Import template in load order (Core → Recommended → Optional); DCIM records; service placement from BSS / OSS | DATA-012, DATA-013, 7.10, INTG-003, INTG-035 |
| 6 Integrations in waves | Wave 1 collector + network + UPS / PDUs + BMS; wave 2 BMCs + GPU + scheduler; wave 3 ITSM, paging, CRM; wave 4 DCIM / IPAM / PACS / OEM; each with contract tests and failure drills | section 9, NFR-017, NFR-020 |
| 7 Go-live | Reconciliation checks green; collector heartbeat; alarms in scope; first incidents with impact | NFR-007, 7.5 |
| 8 Expand | More sites, P2 capabilities, further business models | section 12 |

### 12.2 Release contents by chapter

| Chapter | P1 | P2 | P3 |
| --- | --- | --- | --- |
| 7.1 Command Center | hero, map, DC column, trio | Plan & build strip and lens | — |
| 7.2 Datacenters | site page core tabs, schematic layout, device page | realistic twin, walk, paths, trace views, Access & security | — |
| 7.3 Facilities | power, cooling, environment | SPOF, what-if, maintenance, lifecycle, safety panels | — |
| 7.4 GPU Fleet | jobs, nodes, clusters, telemetry, models, rails | cooling & power cost, placement | — |
| 7.5 Alarms & incidents | scope, normalisation, correlation, enrichment | problems, on-call, notices | runbooks |
| 7.6 Revenue Impact | full model and screens | credits and usage to BSS / billing | — |
| 7.7 Security Ops | — | all | — |
| 7.8 Capacity & power economics | — | all | — |
| 7.9 Planner | — | all, hand-off to Programs & Projects | AI assist |
| 7.10 DCIM | records, standard-CR path | open / new CR, drag-move, reservations, explorer, insights | — |
| 7.11 Compliance | — | — | all |
| 7.12 Cross-cutting | shell, switches, search, info, embed | Opstral AI, big screens | — |
| 8 Analytics pages | — | all | — |
| 9 Integrations | BSS core, ITSM, System Alerts, Telemetry / Data Ops, identity, Inventory, embed | the rest | tenant API, AI Foundry training |

---

## 13 Assumptions, dependencies, risks and open decisions

### 13.1 Assumptions

- The existing platform modules expose APIs and events sufficient for section 9 (listed in 9.10); SynapseDC consumes them and builds nothing of the modules themselves. Their teams own the contracts and agree the fields SynapseDC needs.
- The OAP telemetry ingestion and consumer microservices are available, read and write ClickHouse, and carry the sample rates in NFR-003.
- Customers grant read-only access to the BMS, UPS, PDUs, network, BMCs and (Neo) DCGM / scheduler, and raise the firewall rules in the interface specification.
- One collector (plus standby) can be placed on each site's management network.
- Service placement (which device / port / rack carries which service) exists in BSS Orders, the OSS / control plane or the tenant register; without it impact and revenue are per site only.

### 13.2 Dependencies

| On | For |
| --- | --- |
| OAP telemetry ingestion / consumer services (ClickHouse) | every live figure, history and freshness (P1) |
| Ops Toolkit System Alerts | alarm record, routing, paging (P1) |
| Services & ITSM Incidents / Change Management | incident and change records, CR gate for DCIM (P1) |
| BSS Customers / Orders / Catalog | customers, contracts, services (P1) |
| Plan to Build Inventory | asset record for DCIM extensions (P1) |
| Platform Engineering identity | OIDC, roles, scopes (P1) |
| Plan to Build Programs & Projects | planner hand-off, delivery analytics (P2) |
| Ops Toolkit Security Ops | detection store, rules, cases (P2) |
| AI Foundry | Opstral AI copilot (P2) |

### 13.3 Risks

| ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R-01 | BMS owners refuse BACnet access (safety) | Environment / cooling tabs partly blind | Relay contacts and OPC UA alternatives; the site survey settles it before go-live |
| R-02 | GPU job progress (step time, MFU, checkpoints) is only inside the training framework | GPU time lost and work-to-redo degrade to allocation-level | Agree a metrics / log export with the AI platform team; show scheduler-level state until then |
| R-03 | Service placement missing or stale | Impact and money per customer wrong | Placement differences reported to BSS / OSS; site-level figures flagged "placement incomplete" |
| R-04 | Platform module APIs not ready for the fields needed | Integration slips | API needs in 9.10 agreed per module before P1 build; gaps go to the module's backlog (ARCH-004); the import template loads only datacenter-specific data |
| R-05 | Power chain and cabling records absent at most customers | Physical last mile, SPOF and what-if empty | Template, site survey and audit services at onboarding; DCIM lets engineers record as they audit |
| R-06 | Tariffs and SLA credit rules differ per contract | Money figures disputed | Contract-level rules synced from BSS; "illustrative" flag until replaced |
| R-07 | Tenant privacy concerns (Colo) | Sales objection | Never poll tenant gear; cabinet-level only; clear per-model wording in the pitch |

### 13.4 Open decisions

| ID | Decision | Owner | Needed by |
| --- | --- | --- | --- |
| OD-01 | Which DCIM extensions (U position, outlets and cords, panels and feeds, patch panels, trunks, cable paths, rack type and condition, facility design ratings) the Plan to Build Inventory API can carry; SynapseDC stores only the rest (ARCH-012) | Inventory + SynapseDC | P1 design |
| OD-02 | GPU job progress export (metrics endpoint or log line) | AI platform teams / customers | P1 pilot |
| OD-03 | BMS access: BACnet / OPC UA read-only or relay contacts only | Customer facility owner | per site |
| OD-04 | SLA credit model per contract (tiers, locked-in credits) | BSS + Finance | P1 |
| OD-05 | Where customer notices and the tenant-facing API live: Experience and Care, or SynapseDC's NB-12 | BSS + SynapseDC | P2 |
| OD-06 | Retention periods and data residency | Platform + customers | P1 |
| OD-07 | PUE reporting category per site (ISO/IEC 30134-2) and carbon factor edition | Facilities + Finance | P2 |
| OD-08 | Humidity band: 40–60 % RH or the ASHRAE dew-point envelope | Facilities | P1 |
| OD-09 | Which API receives work orders raised from DCIM change requests and RMAs: Programs & Projects or Field Force Management (both consumed, neither rebuilt) | Plan to Build + Supply Chain | P2 |
| OD-10 | Decided 28-Oct-2026: datacenter-specific capabilities (facility live state, twin, capacity, planner engine, revenue, RCA, compliance, access exceptions) are built in SynapseDC; everything an existing module owns is consumed through its API (3.4) | — | closed |
| OD-11 | BI access: SQL views on the analytics store or export only | Intelligence Hub | P2 |

---

## 14 Traceability

### 14.1 Goals → modules

| Goal | Modules |
| --- | --- |
| G-01 One operational picture | 7.1, 7.2, 7.3, 7.5, 7.12 |
| G-02 Impact and cost | 7.5, 7.6, 9.1 |
| G-03 GPU jobs | 7.4, 7.8, 7.6 |
| G-04 Resilience | 7.3, 7.2, 7.10 |
| G-05 Plan and build | 7.8, 7.9, 8.1–8.3, 9.7, 9.8 |
| G-06 Records | 7.10, 8.6, 9.7 |
| G-07 Secure and compliant | 7.7, 7.11, 7.2 (Access) |
| G-08 Reuse the platform | 9, 3.2, 7.12 |

### 14.2 Blueprint requirement families → BRD chapters

| Blueprint | BRD |
| --- | --- |
| DC-INV-* (inventory) | 7.10 DCIM, 9.7 Inventory, 10.2 template |
| DC-SITE-* (site) | 7.2 Datacenters |
| DC-NET-* (network) | 7.2 device page, 7.5 alarm scope, 8.4 IP & Network |
| DC-FAC-* (facility) | 7.3 Facilities |
| DC-OPS-* (operations) | 7.1 Command Center, 7.5 alarms & incidents, 9.2 ITSM |
| DC-CAP-* (capacity) | 7.8 Capacity, 7.9 Planner |
| DC-AI-* (AI) | 7.4 GPU Fleet, 7.5 RCA, 9.4 AI Foundry |
| WF-01…07 (workflows) | 7.5 incident flow, 7.9 governance, 7.10 change control, 8.2 work orders |

### 14.3 Requirement index

The requirement index (every FR, business rule and user story by chapter, with model and phase) is generated from the tables in sections 7–11; see the appendix at the end of this document.

---

## 15 Glossary

| Term | Meaning |
| --- | --- |
| Alarm scope | site / edge / dependency / downstream: whether an alarm counts against a datacenter (DD-01) |
| Blast radius | the GPUs, nodes and jobs stopped by one fault |
| Block (power) | a colocation power contract: committed kW billed per month |
| CDU | coolant distribution unit for liquid-cooled racks |
| Change request (CR) | a Change Management record; every DCIM write runs under one (standard / open / new) |
| Collector | the on-site software that reads the equipment and sends outbound to the platform |
| DCGM | NVIDIA Data Center GPU Manager; the per-GPU telemetry field set |
| Exposed (service) | active but riding a Critical fault (UPS on battery, failed CRAH, critical alarm on its path) |
| GPU time lost | stalled job × all its GPUs + slowed job × step-time share + idle allocation × all GPUs, at the GPU rate |
| MFU | model FLOPs utilisation of a training job |
| Opstral | the platform's Ops Toolkit and AI copilot |
| Persona / business model | network, colocation, cloud, enterprise, NeoCloud — one estate, different vocabulary, monitoring and money |
| Plan pack / review pack | the planner's generated document set (PDF, workbook, drawings, CSV) for approval |
| Ride-through | minutes a site survives a utility loss: UPS → DG start → fuel hours |
| SPOF | single point of failure: a cord pair on one PDU side, one-side cabinet, Tier II single feed, lost cooling spare… |
| Take-or-pay floor | the minimum share of the utility connection billed whether drawn or not |
| Tenant gear | colocation customer equipment: an opaque block per cabinet, never polled |
| Work to redo | GPUs × time since the job's last checkpoint |
| Xid | NVIDIA GPU error code; 48 / 64 / 79 / 95 = reset or restart, 74 = NVLink, 94 = contained |

---

## 16 Approvals and sign-off

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Product owner, SynapseDC | | | |
| Head of engineering | | | |
| Platform architecture (module split, section 3 and 9) | | | |
| Operate to Acquire (BSS) module owner | | | |
| Services & ITSM module owner | | | |
| Opstral Ops Toolkit module owner | | | |
| Plan to Build module owner | | | |
| Supply Chain module owner | | | |
| Platform Engineering / Intelligence Hub / AI Foundry owners | | | |
| Design partner — colocation operator | | | |
| Design partner — NeoCloud operator | | | |

**Review checklist for approvers:** the module split in section 3.2 is right for your module; the data SynapseDC reads from and sends to your module (section 9) exists or can be provided; the open decisions in 13.4 that name you have an owner and a date; the P1 scope is what the pilot sites need.

---

## Appendix A — Requirement index

472 functional requirements, 191 business rules, 94 user stories, 12 build-boundary requirements, 59 integration requirements, 16 data requirements, 20 non-functional requirements. By phase: P1 207, P2 237, P3 28. By priority: M 287, S 166, C 19. By model: Both 395, Colo 20, Neo 57.

| ID | Requirement | Pri | Model | Phase |
| --- | --- | --- | --- | --- |
| CC-001 | The system shall show an estate health ring with the operations health %, a state word and… | M | Both | P1 |
| CC-002 | The system shall name the weakest area under the verdict. | M | Both | P1 |
| CC-003 | The system shall show a 2 × 2 strip of clickable numbers: Critical incidents, High inciden… | M | Both | P1 |
| CC-004 | The system shall open, from each number, a list whose count equals the number shown. | M | Both | P1 |
| CC-005 | The system shall show four health areas as rows, each with state word, score %, caption, d… | M | Both | P1 |
| CC-006 | The system shall list, under each area, the datacenters with an issue in it (critical firs… | S | Both | P1 |
| CC-007 | The system shall explain each area's status on hover (the worst issue that sets it). | S | Both | P1 |
| CC-008 | The system shall show GPU fleet as the first area where the estate runs GPU nodes, with de… | M | Neo | P1 |
| CC-009 | The system shall show Incident response as the first area where the estate has no operator… | M | Colo | P1 |
| CC-010 | The system shall link the GPU fleet chips to the site's GPU jobs view. | S | Neo | P1 |
| CC-011 | The system shall show a live estate map with a pin per datacenter coloured by state, rippl… | M | Both | P1 |
| CC-012 | The system shall open a site summary popup with its backhaul fan-out when a pin is clicked… | S | Both | P1 |
| CC-013 | The system shall provide map basemaps (light, streets, satellite, terrain), remembered per… | C | Both | P2 |
| CC-014 | The system shall provide a map search by site id, city, state, region or tier that flies t… | S | Both | P1 |
| CC-015 | The system shall provide map legend toggles, Focus issues and Reset, and an expand-to-full… | S | Both | P1 |
| CC-016 | The system shall show a scrolling column of every live datacenter as a card (worst open in… | M | Both | P1 |
| CC-017 | The system shall show "What is happening": open incidents and major alarms in scope, newes… | M | Both | P1 |
| CC-018 | The system shall show "Who is affected": customers impacted now, premium first, with the m… | M | Both | P1 |
| CC-019 | The system shall show "Recommendations": ranked next actions from incidents, capacity and | M | Both | P1 |
| CC-020 | The system shall keep the three panels equal height with scrolling bodies. | S | Both | P1 |
| CC-021 | The system shall reconcile every hero figure with the list it links to (no number differs | M | Both | P1 |
| CC-022 | The system shall show a slim Plan & build strip above the hero with plans per stage and de… | S | Both | P2 |
| CC-023 | The system shall provide a build lens showing the capacity pipeline (planned → live), deci… | S | Both | P2 |
| CC-024 | The system shall add plan approvals waiting on the viewer to Recommendations. | S | Both | P2 |
| CC-025 | The system shall show an information bubble on every widget saying what it shows, how it i… | M | Both | P1 |
| CC-026 | The system shall scope all figures to the geography and business model of the tenant (curr… | M | Both | P1 |
| CC-027 | The system shall refresh live figures without a page reload and show data freshness. | M | Both | P1 |
| CC-028 | The system shall show telemetry gaps (collector stale or down) as a state distinct from he… | M | Both | P1 |
| CC-029 | The system shall render on large screens and TVs (2200 px and above) scaled up, with toolt… | S | Both | P2 |
| CC-030 | The system shall restrict sites shown to those the viewer's role may see. | M | Both | P1 |
| CC-031 | The system shall answer estate questions in the Opstral AI assistant ("What is at risk in | S | Both | P2 |
| CC-032 | The system shall be embeddable in the platform portal without its own menu and top bar. | M | Both | P1 |
| CC-033 | The system shall show in "What is happening" each open incident's resolution SLA clock as | M | Both | P1 |
| CC-034 | The system shall show in "Who is affected" the split of impacted services by status (Activ… | M | Both | P1 |
| CC-035 | The system shall build Recommendations per BRULE-CC-11 and show for each the reason (incid… | M | Both | P1 |
| CC-036 | The system shall keep the Plan & build strip to one slim row by default so the hero stays | S | Both | P2 |
| CC-037 | The system shall show the datacenter column cards in a compact variant (at least 1.5 cards… | S | Both | P1 |
| CC-038 | The system shall let the viewer switch business model (persona) and geography from the top… | M | Both | P1 |
| CC-039 | The system shall provide a ⌘K palette search over sites, devices, incidents, customers and… | S | Both | P1 |
| SITE-001 | The system shall list all datacenters with analytics tiles (site status by condition, edge… | M | Both | P1 |
| SITE-002 | The system shall show per datacenter its state, worst open incident, money at risk and pow… | M | Both | P1 |
| SITE-003 | The system shall show a site header (slim by default, expandable, remembered) with flagged… | M | Both | P1 |
| SITE-004 | The system shall keep the header and tab row pinned while the tab body scrolls. | S | Both | P1 |
| SITE-005 | The system shall show four tab groups with sub tabs per BRULE-SITE-01 and keep every sub t… | M | Both | P1 |
| SITE-006 | The system shall show Needs attention: open incidents with four figure tiles (past SLA, un… | M | Both | P1 |
| SITE-007 | The system shall show on Needs attention who is on call now for the site. | S | Both | P2 |
| SITE-008 | The system shall show Metrics: zone temperature and humidity with 24 h trends, rack inlet | M | Both | P1 |
| SITE-009 | The system shall show an Ops log of commissioning, changes, incidents, maintenance, capaci… | S | Both | P1 |
| SITE-010 | The system shall show a schematic 3D layout of building → floor → room → rack → device wit… | M | Both | P1 |
| SITE-011 | The system shall show a "Needs attention" card on the layout that drills to the item. | M | Both | P1 |
| SITE-012 | The system shall offer a realistic layout view (textured equipment, cabinet doors, trays, | S | Both | P2 |
| SITE-013 | The system shall colour the layout by Health, Temperature (heat map from rack inlets), Rac… | S | Both | P2 |
| SITE-014 | The system shall name every rack with a status dot in an open room; clicking a label opens… | S | Both | P2 |
| SITE-015 | The system shall let the user select plant (cooling units, UPS, rectifier, battery bank, D… | S | Both | P2 |
| SITE-016 | The system shall provide a Walk mode (eye level, drag to look, click to walk, W A S D, col… | C | Both | P2 |
| SITE-017 | The system shall show Power path and Cable paths overlays in 3D per BRULE-SITE-08 with a p… | S | Both | P2 |
| SITE-018 | The system shall open a device popup in 3D with role, model, rack · U, state, links up, se… | S | Both | P2 |
| SITE-019 | The system shall show a cabling trace (every hop: cord → panel → trunk → ODF → cross-conne… | S | Both | P2 |
| SITE-020 | The system shall fall back to a 2D view when the browser has no WebGL. | M | Both | P1 |
| SITE-021 | The system shall show Equipment: installed devices with state, role, rack, model, alarms; | M | Both | P1 |
| SITE-022 | The system shall show tenant equipment as an opaque block with owner, contracted kW and me… | M | Colo | P1 |
| SITE-023 | The system shall show the 8-GPU strip with per-GPU state for GPU nodes on Equipment. | M | Neo | P1 |
| SITE-024 | The system shall show Topology of the site's network devices and links (hosts counted per | M | Both | P1 |
| SITE-025 | The system shall show Space & ports (rack space, ports, floors / rooms / racks table) and | M | Both | P1 |
| SITE-026 | The system shall show a device page with tabs Overview · 3D view · Hardware & interfaces (… | M | Both | P1 |
| SITE-027 | The system shall show on the device page Power & cabling: each PSU → outlet → PDU side → U… | M | Both | P1 |
| SITE-028 | The system shall show a device 3D view with modes Device · Open lid · Exploded · One accel… | S | Both | P2 |
| SITE-029 | The system shall show GPUs · DCGM (GPUs · Intel for Gaudi / Data Center GPU Max nodes) on | M | Neo | P1 |
| SITE-030 | The system shall show Access & security as four collapsible sections: People on site & exc… | S | Both | P2 |
| SITE-031 | The system shall link visits to their change (CHG) or incident (INC) where a crew or on-ca… | S | Both | P2 |
| SITE-032 | The system shall show colocation tenants' badge reads at their cage doors. | S | Colo | P2 |
| SITE-033 | The system shall open a person drawer and an exception drawer from the Access tab. | S | Both | P2 |
| SITE-034 | The system shall show Customers served from the site with why each is at risk (cause), and… | M | Both | P1 |
| SITE-035 | The system shall show cross-connect orders and remote-hands tickets on the Customers tab. | S | Colo | P2 |
| SITE-036 | The system shall show GPU customers with their jobs and GPU time lost on the Customers tab… | S | Neo | P1 |
| SITE-037 | The system shall show an empty state on live-only tabs for planned sites. | M | Both | P1 |
| SITE-038 | The system shall provide "Plan" and "Changes" actions from the header into the Planner and… | S | Both | P2 |
| SITE-039 | The system shall show a customer page: identity header (state, facts, one-line verdict wit… | M | Both | P1 |
| SITE-040 | The system shall show on the customer page (Colo) cross-connect orders and remote-hands ti… | S | Colo | P2 |
| SITE-041 | The system shall show on Assets the rack type, purchase date and condition per BRULE-SITE-… | S | Both | P2 |
| SITE-042 | The system shall show on Equipment the operator's own servers with their purpose (manageme… | S | Colo | P1 |
| SITE-043 | The system shall mark on the schematic layout, when a rack is open, its facing row as glas… | C | Both | P2 |
| SITE-044 | The system shall place the realistic view's controls as: floor picker top-left, tools and | C | Both | P2 |
| SITE-045 | The system shall render on the device 3D view one model per family (router, switch, firewa… | S | Both | P2 |
| SITE-046 | The system shall show the Space & ports tab's floors / rooms / racks table and rack space | M | Both | P1 |
| SITE-047 | The system shall keep every figure on the datacenter page reconciled with the Command Cent… | M | Both | P1 |
| FAC-001 | The system shall show a facility strip: power load, PUE, UPS, cooling, environment, alarms… | M | Both | P1 |
| FAC-002 | The system shall draw a single-line power path (utility feeds, DG set with fuel and runtim… | M | Both | P1 |
| FAC-003 | The system shall trace upstream and downstream on hover of any power node. | S | Both | P1 |
| FAC-004 | The system shall show a 24 h load chart against capacity. | M | Both | P1 |
| FAC-005 | The system shall show "If utility power fails": UPS minutes, DG kW, fuel hours and readine… | M | Both | P1 |
| FAC-006 | The system shall raise a clear note when any UPS is on battery with the minutes left at cu… | M | Both | P1 |
| FAC-007 | The system shall group Power & backup into collapsible sections (Power path · Load & ride-… | S | Both | P1 |
| FAC-008 | The system shall list rack power with search and filters (state, location, role, PDU sides… | M | Both | P1 |
| FAC-009 | The system shall show a rack PDU drawer with the outlet map (outlet, device, PSU, current,… | S | Both | P1 |
| FAC-010 | The system shall flag devices with both cords on the same PDU side. | M | Both | P1 |
| FAC-011 | The system shall show tenant cabinet draw against contracted kW and flag cabinets over bud… | M | Colo | P1 |
| FAC-012 | The system shall show cabinet distribution by UPS / busway / PDU side. | S | Both | P2 |
| FAC-013 | The system shall run a what-if for a feed, UPS, side, PDU, cooling unit or trunk and list | S | Both | P2 |
| FAC-014 | The system shall show the cooling heat balance: heat load, running capacity, capacity afte… | M | Both | P1 |
| FAC-015 | The system shall show cooling unit cards (CRAH / CRAC / chiller / CDU) with state, supply | M | Both | P1 |
| FAC-016 | The system shall show CDU loops with flow, supply / return temperature and the GPU racks t… | M | Neo | P1 |
| FAC-017 | The system shall link a CDU flow fault to the GPU slowdown it causes. | S | Neo | P1 |
| FAC-018 | The system shall show cooling coverage by floor (N+1 / No spare / Short) and each rack's n… | S | Both | P2 |
| FAC-019 | The system shall show environment zone cards with temperature and humidity on their scale | M | Both | P1 |
| FAC-020 | The system shall show fire zones (detection, suppression, agent %, release mode, last and | S | Both | P2 |
| FAC-021 | The system shall show leak detection lines and their state. | S | Both | P2 |
| FAC-022 | The system shall show access points (mantrap, room doors, cage doors) with events and deni… | S | Both | P2 |
| FAC-023 | The system shall list single points of failure per BRULE-FAC-06 with domain filter, detail… | S | Both | P2 |
| FAC-024 | The system shall show resilience test results per site (last run, outcome, next due). | C | Both | P2 |
| FAC-025 | The system shall show the PM plan per plant asset (interval, last done, next due, state pe… | S | Both | P2 |
| FAC-026 | The system shall offer "Schedule maintenance" that raises a Maintenance change in Change M… | S | Both | P2 |
| FAC-027 | The system shall show the impact of a planned maintenance as the what-if of that asset. | C | Both | P2 |
| FAC-028 | The system shall show device lifecycle: install date, warranty end, support contract, vend… | S | Both | P2 |
| FAC-029 | The system shall show open RMA cases and spares per part family at the site. | S | Both | P2 |
| FAC-030 | The system shall show a datacenter picker on the Facilities screen and the same views insi… | M | Both | P1 |
| FAC-031 | The system shall show battery and DG test dates and flag a test due. | S | Both | P1 |
| FAC-032 | The system shall show the −48 V DC plant where present (rectifiers, BDFB, battery). | C | Both | P3 |
| FAC-033 | The system shall never send a write or control command to plant. | M | Both | P1 |
| FAC-034 | The system shall mark every facility value with its freshness and show stale values as sta… | M | Both | P1 |
| FAC-035 | The system shall show the Maintenance & alarms tab with the site's active facility alarms | M | Both | P1 |
| FAC-036 | The system shall show on Cooling the running capacity after losing the largest unit and th… | S | Both | P1 |
| FAC-037 | The system shall list spares per part family with on hand, reserved, minimum and state per… | S | Both | P2 |
| FAC-038 | The system shall show the Facility strip at the top of the Facilities page and on Overview… | S | Both | P1 |
| FAC-039 | The system shall list the datacenter's support contracts (level, expiry) and the vendor en… | S | Both | P2 |
| FAC-040 | The system shall treat diesel litres, burn rate, PDUs per rack, one DG and one battery ban… | M | Both | P1 |
| GPU-001 | The system shall show the GPU Fleet menu item and the datacenter GPU sub tab only when the… | M | Both | P1 |
| GPU-002 | The system shall list clusters / pods with GPU model, vendor, nodes, GPUs in a job, spare,… | M | Neo | P1 |
| GPU-003 | The system shall show a per-node heat map for each cluster, coloured by worst GPU state, w… | S | Neo | P1 |
| GPU-004 | The system shall list nodes with cluster, job, owner, utilisation, maximum GPU temperature… | M | Neo | P1 |
| GPU-005 | The system shall list jobs with kind, customer, premium flag, cluster, GPUs, state, step t… | M | Neo | P1 |
| GPU-006 | The system shall compute GPU time lost now, lost so far, work to redo and at stake per job… | M | Neo | P1 |
| GPU-007 | The system shall sort jobs by lost-now rate, then at stake, then GPUs. | S | Neo | P1 |
| GPU-008 | The system shall show a collapsible "Jobs needing attention" section with the Biggest blas… | S | Neo | P1 |
| GPU-009 | The system shall show a fleet summary strip: GPUs installed, in a job, healthy %, jobs by | M | Neo | P1 |
| GPU-010 | The system shall read, through the OAP telemetry consumer API, the DCGM fields per GPU: ut… | M | Neo | P1 |
| GPU-011 | The system shall read, through the OAP telemetry consumer API, the vendor equivalents for | S | Neo | P2 |
| GPU-012 | The system shall read a 24-hour hourly history per node from the OAP telemetry consumer AP… | M | Neo | P1 |
| GPU-013 | The system shall show fleet telemetry: utilisation and temperature histograms, 24 h fleet | S | Neo | P1 |
| GPU-014 | The system shall show the node detail (drawer and device page) with a health view, a profi… | M | Neo | P1 |
| GPU-015 | The system shall classify Xid events per BRULE-GPU-10 and raise GPU alarms with the Xid co… | M | Neo | P1 |
| GPU-016 | The system shall flag driver drift per node and per pod. | S | Neo | P1 |
| GPU-017 | The system shall show a GPU models tab: vendor cards and a model table (memory, TDP, scale… | S | Neo | P1 |
| GPU-018 | The system shall show network rails per cluster (InfiniBand, Ethernet front-end, OOB), wit… | M | Neo | P1 |
| GPU-019 | The system shall show cooling for GPU racks: CDU loops (capacity, load, supply / return te… | M | Both | P1 |
| GPU-020 | The system shall show GPU racks with draw against budget, liquid / air, node count, maximu… | M | Neo | P1 |
| GPU-021 | The system shall show tenant AI cages (contracted kW, draw, CDU, inlet temperature, state,… | M | Colo | P1 |
| GPU-022 | The system shall link a job affected by a fault to the open GPU incident and show the inci… | M | Neo | P1 |
| GPU-023 | The system shall feed the Command Center GPU fleet area (the first hero area where the est… | M | Neo | P1 |
| GPU-024 | The system shall show power cost per installed and per sold GPU-hour per pod, against the | S | Neo | P2 |
| GPU-025 | The system shall show energy and power cost by job and by tenant per day, against what the… | S | Neo | P2 |
| GPU-026 | The system shall provide a "Where to place" tab: input GPUs needed (8–256) and a model, ou… | S | Neo | P2 |
| GPU-027 | The system shall link the power cost views to Capacity → Power economics for the same data… | S | Neo | P2 |
| GPU-028 | The system shall show GPU nodes with an open RMA and their spare status. | S | Neo | P2 |
| GPU-029 | The system shall pin the tab bar and list headers under the top bar while lists scroll, an… | S | Both | P1 |
| GPU-030 | The system shall scope every tab to one datacenter or the whole estate from a datacenter s… | M | Both | P1 |
| GPU-031 | The system shall read job metadata from the scheduler (Slurm REST or the Kubernetes API) a… | M | Neo | P1 |
| GPU-032 | The system shall show step time, MFU and checkpoint figures only when the customer's AI pl… | M | Neo | P1 |
| GPU-033 | The system shall answer Opstral AI questions "Where should the next GPU job go?", "What is… | C | Neo | P2 |
| GPU-034 | The system shall show recommended actions per affected job (for example drain the failed n… | S | Neo | P1 |
| GPU-035 | The system shall export GPU job hours delivered and lost per customer per day to the billi… | C | Neo | P3 |
| GPU-036 | The system shall head the GPU Fleet screen with one row: title and a one-line subtitle, a | S | Neo | P1 |
| GPU-037 | The system shall filter the jobs list by state (stalled, slowed, at risk, idle, running) a… | M | Neo | P1 |
| GPU-038 | The system shall show the open driver-rollout change on nodes running their model's old dr… | S | Neo | P1 |
| GPU-039 | The system shall count node states (in a job, spare, drained, failed, burn-in) and GPU hea… | S | Neo | P1 |
| GPU-040 | The system shall show per-counter leaders on the Telemetry tab: hottest GPUs, most PCIe re… | S | Neo | P1 |
| GPU-041 | The system shall show a cluster's nodes on the datacenter Equipment tab with the 8-GPU str… | S | Neo | P1 |
| ALM-001 | The system shall convert every incoming event (trap, syslog, Redfish event, DCGM Xid, BACn… | M | Both | P1 |
| ALM-002 | The system shall send both the normalised alarm and the raw event to Ops Toolkit System Al… | M | Both | P1 |
| ALM-003 | The system shall de-duplicate and clear alarms per BRULE-ALM-01. | M | Both | P1 |
| ALM-004 | The system shall detect flapping per BRULE-ALM-02 and mark the alarm flapping. | M | Both | P1 |
| ALM-005 | The system shall map source severity to Critical / Major / Minor / Warning from an editabl… | M | Both | P1 |
| ALM-006 | The system shall place each alarm on site → floor → room → rack → device → port by address… | M | Both | P1 |
| ALM-007 | The system shall assign each alarm a scope (site / edge / dependency / downstream) and a c… | M | Both | P1 |
| ALM-008 | The system shall exclude downstream alarms from every datacenter count and show them as sy… | M | Both | P1 |
| ALM-009 | The system shall compute edge redundancy per site per BRULE-ALM-06. | M | Both | P1 |
| ALM-010 | The system shall attach rack and shared-fault references per BRULE-ALM-07. | M | Both | P1 |
| ALM-011 | The system shall publish normalised alarms to Ops Toolkit System Alerts and keep the ident… | M | Both | P1 |
| ALM-012 | The system shall provide an Alerts list with an analytics strip of six tiles (active alarm… | M | Both | P1 |
| ALM-013 | The system shall correlate alarms into incidents per BRULE-ALM-08 and create or update the… | M | Both | P1 |
| ALM-014 | The system shall assign the incident type (Network, Power, Cooling, Rack, Capacity, Securi… | M | Both | P1 |
| ALM-015 | The system shall list affected objects per incident (device, link, rack, service, customer… | M | Both | P1 |
| ALM-016 | The system shall compute incident impact: services, customers, premium customers, revenue | M | Both | P1 |
| ALM-017 | The system shall produce ranked RCA hypotheses with confidence and evidence links per BRUL… | M | Both | P1 |
| ALM-018 | The system shall show recent changes at the site or on the affected path as evidence, and | M | Both | P1 |
| ALM-019 | The system shall record a user's confirm / reject feedback on a hypothesis. | S | Both | P1 |
| ALM-020 | The system shall list recommended action steps with owner, expected result, rollback and v… | M | Both | P1 |
| ALM-021 | The system shall let a user raise an emergency change from an incident, linked to it. | S | Both | P1 |
| ALM-022 | The system shall run the verification checklist per BRULE-ALM-14 before an incident can be… | M | Both | P1 |
| ALM-023 | The system shall show similar past incidents and the nodes they shared. | C | Both | P2 |
| ALM-024 | The system shall show the incident worklog from Services & ITSM and post its system and AI… | M | Both | P1 |
| ALM-025 | The system shall group incidents into problems by common cause and show them on an Inciden… | S | Both | P2 |
| ALM-026 | The system shall show "On call & communications" per incident: on-call engineer from the r… | S | Both | P2 |
| ALM-027 | The system shall show the response and resolve SLA clocks per incident and flag past-SLA i… | M | Both | P1 |
| ALM-028 | The system shall show an incident's revenue impact panel from the Revenue Impact model. | M | Both | P1 |
| ALM-029 | The system shall raise monitoring-gap alarms through the System Alerts API and show the un… | M | Both | P1 |
| ALM-030 | The system shall raise GPU alarms (Xid, ECC, NVLink, throttle) through the System Alerts A… | M | Neo | P1 |
| ALM-031 | The system shall raise tenant cabinet alarms from power and environment only, and treat a | M | Colo | P1 |
| ALM-032 | The system shall raise power-contract findings (block ≥ 85 % drawn, new demand peak above | S | Both | P2 |
| ALM-033 | The system shall show incident list views Open, Critical open, High open, Breaching SLA an… | M | Both | P1 |
| ALM-034 | The system shall emit `dco.alert.*` and `dco.incident.*` events for every lifecycle change… | M | Both | P1 |
| ALM-035 | The system shall answer Opstral AI questions about an incident's cause, what changed befor… | C | Both | P2 |
| ALM-036 | The system shall let a user correlate selected uncorrelated alarms that share a cause into… | S | Both | P1 |
| ALM-037 | The system shall show per alarm its severity, scope, category, source, title, device and p… | M | Both | P1 |
| ALM-038 | The system shall raise hardware alarms (failed disk, failed PSU) on the operator's own ser… | S | Both | P1 |
| ALM-039 | The system shall show the incident's similar incidents (BRULE-ALM-18) and the on-call rota… | S | Both | P2 |
| REV-001 | The system shall classify every service as down, degraded, exposed or not impacted per BRU… | M | Both | P1 |
| REV-002 | The system shall charge each impacted service to exactly one issue per BRULE-REV-03. | M | Both | P1 |
| REV-003 | The system shall compute rate, lost, credits, locked-in credits, next cliff, forecast 24 h… | M | Both | P1 |
| REV-004 | The system shall charge losses to the datacenter where the fault is (BRULE-REV-11). | M | Both | P1 |
| REV-005 | The system shall reconcile totals across issues, causes, datacenters, customers and site v… | M | Both | P1 |
| REV-006 | The system shall show a strip of six tiles, each opening the matching view: Losing now (pe… | M | Both | P1 |
| REV-007 | The system shall show the answer cards "Costing the most right now" and "Most at stake", e… | M | Both | P1 |
| REV-008 | The system shall list issues ranked per BRULE-REV-13 with services down / degraded / expos… | M | Both | P1 |
| REV-009 | The system shall open a cost-breakdown drawer per issue, listing every service, its state,… | M | Both | P1 |
| REV-010 | The system shall list customers with monthly revenue, services by state, money, locked-in | M | Both | P1 |
| REV-011 | The system shall list datacenters with money, issues and services impacted. | M | Both | P1 |
| REV-012 | The system shall show causes by domain (Power, Cooling, Network, Rack, Device, GPU) and th… | S | Both | P1 |
| REV-013 | The system shall show "One failure away": exposed services ranked by potential cost if the… | S | Both | P1 |
| REV-014 | The system shall show a "How it is calculated" drawer with every formula and constant. | M | Both | P1 |
| REV-015 | The system shall show a revenue impact panel on the incident page (rate, lost, credits, cl… | M | Both | P1 |
| REV-016 | The system shall show a datacenter Revenue tab with the same model scoped to the site. | M | Both | P1 |
| REV-017 | The system shall show a revenue column on the Datacenters and Incidents lists. | S | Both | P1 |
| REV-018 | The system shall show on the customer page what is impacting the customer, with money per | M | Both | P1 |
| REV-019 | The system shall treat GPU jobs as services and classify GPU-domain causes (BRULE-REV-16).… | M | Neo | P1 |
| REV-020 | The system shall not count a tenant inside its contracted size, or over its own power budg… | M | Colo | P1 |
| REV-021 | The system shall use persona vocabulary for money words, keeping SLA / OLA capitalised. | S | Both | P1 |
| REV-022 | The system shall format money in the geography's currency and number locale. | M | Both | P1 |
| REV-023 | The system shall emit `dco.revenue.impact-changed` when an issue's money at risk crosses a… | S | Both | P2 |
| REV-024 | The system shall export SLA credits owed per customer (minutes, tier, amount) to the billi… | S | Both | P2 |
| REV-025 | The system shall read monthly charge, SLA target and premium flag per service from BSS (or… | M | Both | P1 |
| REV-026 | The system shall support per-contract credit rules in place of the single tier table (to d… | C | Both | P3 |
| REV-027 | The system shall answer Opstral AI questions "Which issue is costing the most revenue?" an… | C | Both | P2 |
| REV-028 | The system shall show a premium-customer impact figure on the Command Center that opens "W… | M | Both | P1 |
| REV-029 | The system shall provide the customer page: an identity header (avatar, state, facts row, | M | Both | P1 |
| REV-030 | The system shall show on a colocation customer's page their cross-connect orders and remot… | S | Colo | P2 |
| REV-031 | The system shall show "Why at risk" per customer on customer lists (the causes of their im… | S | Both | P1 |
| SEC-001 | The system shall provide a Security Ops menu with sub-menus Insights, Detections, Cases, T… | M | Both | P2 |
| SEC-002 | The system shall show Insights: NIST CSF 2.0 function scores with their basis, open detect… | M | Both | P2 |
| SEC-003 | The system shall evaluate datacenter detection rules across the domains Network, Managemen… | M | Both | P2 |
| SEC-004 | The system shall tag every rule and detection with ATT&CK Enterprise or ICS techniques. | M | Both | P2 |
| SEC-005 | The system shall list detections with rule, severity, asset, site, technique, state and di… | M | Both | P2 |
| SEC-006 | The system shall raise SR-002 detections from configuration drift with no covering change | M | Both | P2 |
| SEC-007 | The system shall raise physical detections from the access log's security exceptions so th… | M | Both | P2 |
| SEC-008 | The system shall correlate the cross-domain badge-in → unapproved change rule (SR-060) int… | S | Both | P2 |
| SEC-009 | The system shall detect crypto-mining, privileged pods / host mounts and kubectl exec on G… | M | Neo | P2 |
| SEC-010 | The system shall detect BMC login bursts, unknown devices on OOB ports and BMC firmware ch… | M | Both | P2 |
| SEC-011 | The system shall detect the OT behaviours in BRULE-SEC-07. | M | Both | P2 |
| SEC-012 | The system shall manage cases through the NIST SP 800-61 phases with step checklists, note… | M | Both | P2 |
| SEC-013 | The system shall offer playbooks per case type and show each step's owner. | S | Both | P2 |
| SEC-014 | The system shall sync cases with Ops Toolkit Security Ops (or the customer's SOAR) as the | M | Both | P2 |
| SEC-015 | The system shall show ATT&CK coverage (techniques with an enabled rule and a live sensor) | S | Both | P2 |
| SEC-016 | The system shall provide a rules catalogue: enable / disable, edit and create a rule (titl… | S | Both | P2 |
| SEC-017 | The system shall match advisories to firmware, OS and packages per asset and list vulnerab… | M | Both | P2 |
| SEC-018 | The system shall let a user set a vulnerability state (Open, In remediation with a change | M | Both | P2 |
| SEC-019 | The system shall replace the illustrative advisories with live NVD / CISA KEV / FIRST EPSS… | S | Both | P3 |
| SEC-020 | The system shall run hardening checks per baseline (for example CIS Cisco IOS XR, DISA STI… | S | Both | P2 |
| SEC-021 | The system shall show configuration drift per device (running vs last approved) as authori… | M | Both | P2 |
| SEC-022 | The system shall show IEC 62443 zones and conduits per site with SL-T, SL-A (BRULE-SEC-12)… | S | Both | P2 |
| SEC-023 | The system shall list OT assets (UPS cards, PDUs, BMS / CDU controllers, meters, DG contro… | M | Both | P2 |
| SEC-024 | The system shall show physical protection layers per site (perimeter → building → room → c… | S | Both | P2 |
| SEC-025 | The system shall show Security data sources (in Admin) with each sensor's state, last even… | M | Both | P2 |
| SEC-026 | The system shall send detections, cases and the audit trail to the SIEM as OCSF. | M | Both | P2 |
| SEC-027 | The system shall never perform containment itself (BRULE-SEC-16), and offer "raise change"… | M | Both | P2 |
| SEC-028 | The system shall exclude tenant-owned equipment from assets, detections and vulnerabilitie… | M | Colo | P2 |
| SEC-029 | The system shall show metrics: MTTA, MTTR, open cases within SLA, true-positive rate. | S | Both | P2 |
| SEC-030 | The system shall map security posture to ISO 27001 controls for Compliance (A.5–A.8, A.7 p… | C | Both | P3 |
| SEC-031 | The system shall show a site security score per datacenter (BRULE-SEC-17) and rank sites b… | S | Both | P2 |
| SEC-032 | The system shall keep every triage, case, vulnerability and rule move as the analyst's wor… | M | Both | P2 |
| SEC-033 | The system shall list, per detection, the datacenter context it was raised with: site, roo… | M | Both | P2 |
| SEC-034 | The system shall show per playbook its trigger rules and steps by phase with the system ea… | S | Both | P2 |
| CAP-001 | The system shall show capacity per datacenter for space, power, cooling, ports and GPUs as… | M | Both | P2 |
| CAP-002 | The system shall open the capacity overview with one summary tile per dimension plus a hol… | M | Both | P2 |
| CAP-003 | The system shall show space and power by hall, with an 85 % pressure marker and a link to | M | Both | P2 |
| CAP-004 | The system shall list every reservation with its kind, resource, quantity, unit, state, la… | M | Both | P2 |
| CAP-005 | The system shall compute net available power and space after all holds (BRULE-CAP-01). | M | Both | P2 |
| CAP-006 | The system shall treat colocation contracted kW above draw as a Committed hold per cabinet… | M | Colo | P2 |
| CAP-007 | The system shall show GPU capacity per model as in a job, allocated and idle, free, and ou… | M | Neo | P2 |
| CAP-008 | The system shall show PUE, energy per day and CO₂ per site and for the estate (BRULE-CAP-0… | M | Both | P2 |
| CAP-009 | The system shall forecast each dimension 12 months forward against the 85 % warning line (… | S | Both | P2 |
| CAP-010 | The system shall hold a tariff per state or region and a power contract per live site: sup… | M | Both | P2 |
| CAP-011 | The system shall let an authorised user replace the illustrative tariff and contract value… | M | Both | P2 |
| CAP-012 | The system shall compute the monthly power bill per site and for the estate, split into en… | M | Both | P2 |
| CAP-013 | The system shall show idle committed kW and its monthly cost per site, ranked by cost (BRU… | M | Both | P2 |
| CAP-014 | The system shall show cost per sold MW-month, or per IT MW when nothing is sold (BRULE-CAP… | S | Both | P2 |
| CAP-015 | The system shall show a power bill breakdown chart and a site table that links to that sit… | S | Both | P2 |
| CAP-016 | The system shall compute power cost per installed and per sold GPU-hour per GPU pod agains… | M | Neo | P2 |
| CAP-017 | The system shall show energy and power cost per job and per tenant against what each earns… | M | Neo | P2 |
| CAP-018 | The system shall show the kW a power cap saves against the GPU time it costs. | S | Neo | P2 |
| CAP-019 | The system shall detect the four power findings (BRULE-CAP-10 to BRULE-CAP-13) each data c… | M | Both | P2 |
| CAP-020 | The system shall raise one alarm per finding (System Alerts API) and one Medium incident f… | M | Both | P2 |
| CAP-021 | The system shall list the power findings with severity, exposure, evidence, and links to t… | M | Both | P2 |
| CAP-022 | The system shall publish `dco.power.finding` events for every finding (NB-02 / NB-03). | S | Both | P2 |
| CAP-023 | The system shall rank GPU pods for a placement request of 8–256 GPUs of a chosen model, wi… | M | Neo | P2 |
| CAP-024 | The system shall rank colocation halls for a new cabinet request by free space, power head… | C | Colo | P3 |
| CAP-025 | The system shall answer the Opstral AI questions "Where should the next GPU job go?" and "… | S | Both | P2 |
| CAP-026 | The system shall scope every view to the estate or to one datacenter by a datacenter selec… | M | Both | P2 |
| CAP-027 | The system shall let a planner start a capacity plan from a dimension, opening the Planner… | S | Both | P2 |
| CAP-028 | The system shall make every total reconcile: Σ site bills = estate bill; Σ holds per site | M | Both | P2 |
| CAP-029 | The system shall export capacity, holds and power economics as CSV and through NB-01 / NB-… | S | Both | P2 |
| CAP-030 | The system shall show 12 months of power history per site and use it for the ratchet rule.… | M | Both | P2 |
| CAP-031 | The system shall send metered kWh and peak kW per tenant cabinet to billing (NB-07). | S | Colo | P3 |
| CAP-032 | The system shall send delivered and lost GPU-hours per customer job to billing (NB-07). | S | Neo | P3 |
| CAP-033 | The system shall add an info text to every widget saying how its figure is computed. | M | Both | P2 |
| CAP-034 | The system shall show network headroom: links in countdown (utilisation, growth of the las… | S | Both | P2 |
| CAP-035 | The system shall show a financial view per site: CapEx approved and committed, OpEx per mo… | S | Both | P2 |
| CAP-036 | The system shall open the capacity overview with a reservation ledger (Submitted → Approve… | M | Both | P2 |
| CAP-037 | The system shall show the deck reference line beside the measured GPU power cost (BRULE-CA… | S | Neo | P2 |
| CAP-038 | The system shall show no power findings and no incident for a site whose draw and contract… | M | Both | P2 |
| PLN-001 | The system shall offer the six plan families and their plan types listed in 7.9.1, each wi… | M | Both | P2 |
| PLN-002 | The system shall keep a template library (plan types, site types, modules) with inheritanc… | M | Both | P2 |
| PLN-003 | The system shall show, for each template: its inheritance chain, wizard areas, approval pa… | M | Both | P2 |
| PLN-004 | The system shall keep versioned benchmarks for costs, efficiency (PUE), lead times, sizing… | M | Both | P2 |
| PLN-005 | The system shall guide plan creation in a wizard:<br>• plan type;<br>• requirements (name,… | M | Both | P2 |
| PLN-006 | The system shall derive inputs from the requirements and say how many it filled and why. | M | Both | P2 |
| PLN-007 | The system shall show the source of each input (override, template, benchmark, derived) an… | M | Both | P2 |
| PLN-008 | The system shall show a live estimate on every step: readiness, CapEx and IT power. | M | Both | P2 |
| PLN-009 | The system shall size space, power, cooling and network for the plan, and draw them on dra… | M | Both | P2 |
| PLN-010 | The system shall compute CapEx lines, OpEx per month, NPV, IRR and payback. | M | Both | P2 |
| PLN-011 | The system shall build the schedule from lead-time benchmarks, with phases, gates, order-b… | M | Both | P2 |
| PLN-012 | The system shall check the hard and soft rules and list blockers with "fix" links to the s… | M | Both | P2 |
| PLN-013 | The system shall let the user create, compare and prefer scenarios. | M | Both | P2 |
| PLN-014 | The system shall build the approval path by CapEx band and template (BRULE-PLN-03, BRULE-P… | M | Both | P2 |
| PLN-015 | The system shall enforce segregation of duties: the requester or submitter cannot approve.… | M | Both | P2 |
| PLN-016 | The system shall show candidate sites, with capacity bars, for site-selection steps. | S | Both | P2 |
| PLN-017 | The system shall list the affected assets for refresh plans (end of sale, out of support, | M | Both | P2 |
| PLN-018 | The system shall price and source the bill of materials (BRULE-PLN-08), and allow quantity… | M | Both | P2 |
| PLN-019 | The system shall produce a plan pack:<br>• what the plan creates;<br>• basis of design;<br… | M | Both | P2 |
| PLN-020 | The system shall produce a review pack from one content model: a PDF, an XLSX workbook, an… | M | Both | P2 |
| PLN-021 | The system shall provide a review portal per plan: numbered sections, threaded comments pe… | M | Both | P2 |
| PLN-022 | The system shall let the user send a plan for review to the holders of the approval path's… | S | Both | P2 |
| PLN-023 | The system shall apply the edit policy (BRULE-PLN-09) to every editor on the plan page and… | M | Both | P2 |
| PLN-024 | The system shall let a user adjust the project plan (phases, go-live, IT kW, density, cool… | M | Both | P2 |
| PLN-025 | The system shall freeze a baseline on approval and write the capacity and rack-unit holds | M | Both | P2 |
| PLN-026 | The system shall hand an approved plan to Programs & Projects (BRULE-PLN-11) and show the | M | Both | P2 |
| PLN-027 | The system shall complete a plan when delivery hands over, and update Inventory Planning. | M | Both | P2 |
| PLN-028 | The system shall show a Plans list with filters by status and scope, and a list ⇄ cards sw… | M | Both | P2 |
| PLN-029 | The system shall show a hub with plans that need action: your decision, your review, block… | S | Both | P2 |
| PLN-030 | The system shall start a plan from a datacenter page or from a Capacity dimension, with th… | S | Both | P2 |
| PLN-031 | The system shall support the family-specific views:<br>• site fit;<br>• plant line-ups (as… | S | Both | P2 |
| PLN-032 | The system shall print the drawing sheets on landscape A4 with a title block. | S | Both | P2 |
| PLN-033 | The system shall sum GPU pod plans as GPUs, kW per rack, liquid share and CDUs, and the In… | M | Neo | P2 |
| PLN-034 | The system shall size tenant cage or hall plans from contracted kW per cabinet and the cab… | M | Colo | P2 |
| PLN-035 | The system shall publish `dco.plan.decided` and write every plan change to the audit trail… | M | Both | P2 |
| PLN-036 | The system shall offer AI-assisted plan drafting (to discuss). | C | Both | P3 |
| PLN-037 | The system shall show the review status on the plan (reviewers, who has answered, open com… | M | Both | P2 |
| PLN-038 | The system shall offer, in Send for review, the attachment choice PDF / ZIP / link only, a… | S | Both | P2 |
| PLN-039 | The system shall open scenarios on demand from the plan header as a What-if drawer, and sh… | M | Both | P2 |
| PLN-040 | The system shall warn before leaving the wizard with unsaved changes, and let the user jum… | S | Both | P2 |
| PLN-041 | The system shall send the plan's vendor orders (one per vendor and phase) to Programs & Pr… | M | Both | P2 |
| PLN-042 | The system shall record closeout changes through the audited action in BRULE-PLN-15 and sh… | S | Both | P2 |
| PLN-043 | The system shall let a template owner make a variant, publish or retire a template and edi… | M | Both | P2 |
| PLN-044 | The system shall filter benchmarks per view (reference value, site type, cooling, tier, re… | S | Both | P2 |
| PLN-045 | The system shall show on the Command Center a Plan & build strip (capacity pipeline planne… | S | Both | P2 |
| PLN-046 | The system shall show per plan an Overview dashboard: what and why with the Draft → In rev… | M | Both | P2 |
| PLN-047 | The system shall show on every plan ONE status line: state in words, whose decision, block… | M | Both | P2 |
| PLN-048 | The system shall list in the plan pack what the plan creates with links into Programs & Pr… | S | Both | P2 |
| DCIM-001 | The system shall present the hierarchy site → floor → hall → row → rack → device → compone… | M | Both | P1 |
| DCIM-002 | The system shall store (in the Inventory record through its API where it carries the field… | M | Both | P1 |
| DCIM-003 | The system shall store (in the Inventory record through its API where it carries the field… | M | Both | P1 |
| DCIM-004 | The system shall store (in the Inventory record through its API where it carries the field… | M | Both | P1 |
| DCIM-005 | The system shall store (in the Inventory record through its API where it carries the field… | M | Both | P1 |
| DCIM-006 | The system shall store (in the Inventory record through its API where it carries the field… | M | Both | P1 |
| DCIM-007 | The system shall show a floor plan per hall, coloured by Thermal, Density or Tenant (draw | M | Both | P1 |
| DCIM-008 | The system shall show rack elevations (front / rear) with devices, PDUs, cords, cables and… | M | Both | P1 |
| DCIM-009 | The system shall show a cable's path end to end, hop by hop, from a port, link or device. | M | Both | P1 |
| DCIM-010 | The system shall read device and module types (vendor, model) from the Inventory API and k… | M | Both | P1 |
| DCIM-011 | The system shall show a Sites / Racks / Devices / Cabling / Power / Catalogue / Hierarchy | M | Both | P1 |
| DCIM-012 | The system shall let a user create a rack and install a device with U-range validation (BR… | M | Both | P2 |
| DCIM-013 | The system shall let a user move a device to another U or rack at the site, by form or by | M | Both | P2 |
| DCIM-014 | The system shall let a user connect, trace and disconnect ports, and edit a port's descrip… | M | Both | P2 |
| DCIM-015 | The system shall let a user install, swap and remove modules in bays; a line card adds its… | S | Both | P2 |
| DCIM-016 | The system shall let a user reserve and release rack units with a reason, and list reserva… | M | Both | P2 |
| DCIM-017 | The system shall let a user create power panels and feeds with a computed rating. | S | Both | P2 |
| DCIM-018 | The system shall let a user edit or retire a rack (empty racks only). | S | Both | P2 |
| DCIM-019 | The system shall set a device's status (Active, Maintenance, Decommissioning…). | M | Both | P2 |
| DCIM-020 | The system shall put every DCIM edit under a change request: Standard, open CR or raise ne… | M | Both | P2 |
| DCIM-021 | The system shall keep planned work per change request and execute it (one item or all) onc… | M | Both | P2 |
| DCIM-022 | The system shall tag records with their change request and show change chips on racks, dev… | M | Both | P2 |
| DCIM-023 | The system shall show a Changes board of DCIM change requests (ready, awaiting approval, i… | M | Both | P2 |
| DCIM-024 | The system shall show a notice bar (ready, awaiting, in progress, plans in review), amber | S | Both | P2 |
| DCIM-025 | The system shall flag single points of failure from the power chain (BRULE-DCIM-05). | M | Both | P2 |
| DCIM-026 | The system shall provide an Explorer (racks / devices, table or tiles, filters, saved view… | S | Both | P2 |
| DCIM-027 | The system shall show per rack its activity (audit), reserved units, change requests and p… | M | Both | P2 |
| DCIM-028 | The system shall show tenant cabinets as opaque Tenant gear with owner, tenant and contrac… | M | Colo | P1 |
| DCIM-029 | The system shall record cross-connects in the meet-me room, from tenant port to carrier or… | M | Colo | P1 |
| DCIM-030 | The system shall model GPU nodes with 4 or more PSUs, liquid-cooled racks with their CDU a… | M | Neo | P1 |
| DCIM-031 | The system shall list a device's addresses and assign the next free address of a site pref… | S | Both | P2 |
| DCIM-032 | The system shall write the DCIM extensions back to, or sync them with, Inventory (or the c… | M | Both | P1 |
| DCIM-033 | The system shall publish `dco.dcim.record-changed` with before / after and the change id. | S | Both | P2 |
| DCIM-034 | The system shall show an Insights page (see 8.6). | S | Both | P2 |
| DCIM-035 | The system shall show in the device drawer the device's lifecycle (installed, warranty end… | S | Both | P2 |
| DCIM-036 | The system shall, when connecting a port, offer only devices at the site that have a free | M | Both | P2 |
| DCIM-037 | The system shall check the invariants of BRULE-DCIM-12 on every data change and report a b… | M | Both | P1 |
| DCIM-038 | The system shall let a user raise a change request from the Changes board with the same fo… | M | Both | P2 |
| DCIM-039 | The system shall filter the Changes board by view (ready, awaiting approval, in progress, | S | Both | P2 |
| DCIM-040 | The system shall show per sub-menu the actions that apply (New rack / Install device on In… | S | Both | P2 |
| DCIM-041 | The system shall show on the change page the DCIM work it carries with Execute all, and co… | M | Both | P2 |
| DCIM-042 | The system shall reject a DCIM write that fails validation (U clash, budget, reserved rang… | M | Both | P1 |
| CMP-001 | The system shall evaluate policies CP-01 to CP-09 on every data cycle (BRULE-CMP-01 to BRU… | M | Both | P3 |
| CMP-002 | The system shall show each policy with its resources checked, violations, outcome (Blocked… | M | Both | P3 |
| CMP-003 | The system shall map controls of ISO/IEC 27001:2022, ISO/IEC 22237, TIA-942 and SOC 2 to t… | M | Both | P3 |
| CMP-004 | The system shall compute each control's status (BRULE-CMP-10). | M | Both | P3 |
| CMP-005 | The system shall hold each policy as code (Rego package and source), viewable by the compl… | S | Both | P3 |
| CMP-006 | The system shall let an authorised user switch a policy on or off. An off policy stops cou… | M | Both | P3 |
| CMP-007 | The system shall keep decision records with the OPA-style input (BRULE-CMP-11). | S | Both | P3 |
| CMP-008 | The system shall let a user attest a manual control with a date, owner and evidence note, | M | Both | P3 |
| CMP-009 | The system shall let a user create a policy, control or framework. | S | Both | P3 |
| CMP-010 | The system shall show a posture dashboard: overall ring, status tiles, framework cards, co… | M | Both | P3 |
| CMP-011 | The system shall link a CP-07 violation to its change and block the change from starting. | M | Both | P3 |
| CMP-012 | The system shall scope compliance to one datacenter or the estate. | M | Both | P3 |
| CMP-013 | The system shall export an evidence pack per framework (CSV / PDF) for auditors and tenant… | S | Both | P3 |
| CMP-014 | The system shall read security posture findings from Ops Toolkit Security Ops as control e… | S | Both | P3 |
| CMP-015 | The system shall send compliance decisions to the SIEM feed (NB-10). | C | Both | P3 |
| CMP-016 | The system shall show colocation tenant-facing controls (physical access, power resilience… | C | Colo | P3 |
| CMP-017 | The system shall record every policy, control and attestation change in the audit trail. | M | Both | P3 |
| CMP-018 | The system shall list every violation (policy, resource, site, message, outcome, raised ti… | M | Both | P3 |
| CMP-019 | The system shall evidence each control only by the policies that test it (BRULE-CMP-12) an… | M | Both | P3 |
| XC-001 | The system shall present a left menu grouped Operations · Plan & Build · Security · Admin | M | Both | P1 |
| XC-002 | The system shall offer a business-model switch (network, colocation, cloud, enterprise, Ne… | M | Both | P1 |
| XC-003 | The system shall regenerate vocabulary (customer, service, premium words, capacity unit, m… | M | Both | P1 |
| XC-004 | The system shall apply a deployment default persona and optional persona / geography overr… | M | Both | P1 |
| XC-005 | The system shall hide GPU Fleet (menu item, site tab, Command Center GPU area) when the es… | M | Both | P1 |
| XC-006 | The system shall format every money figure through the geography's formatter and show the | M | Both | P1 |
| XC-007 | The system shall provide global search (⌘K) over datacenters, devices, interfaces, links, | M | Both | P1 |
| XC-008 | The system shall provide the Opstral AI drawer on every page with the page's context; it s… | S | Both | P2 |
| XC-009 | Every widget (panel, KPI, tile, summary-strip item) shall carry an info bubble; the bubble… | M | Both | P1 |
| XC-010 | The system shall pin the page tab bar under the top bar on every screen, and list toolbars… | M | Both | P1 |
| XC-011 | The system shall run every screen inside an iframe with `shell=false` (no menu, no top bar… | M | Both | P1 |
| XC-012 | The system shall scale the UI for TVs from 2200 px with charts, map, tooltips and 3D align… | S | Both | P2 |
| XC-013 | The system shall show no horizontal overflow, no cut text and no NaN / undefined at 1280 a… | M | Both | P1 |
| XC-018 | The system shall use the NST / Vision Waves design system (Poppins chrome, Inter tabular n… | M | Both | P1 |
| XC-019 | Status words shall be consistent: incidents Critical / High / Medium / Low, alarms Critica… | M | Both | P1 |
| XC-020 | Every list shall use the common list toolbar (Showing N of M, search, ≤ 2 quick filters, r… | M | Both | P1 |
| XC-021 | List pages shall open with an analytics strip of six tiles whose bars, pills and facts cli… | S | Both | P1 |
| XC-022 | The system shall keep per-viewer conveniences (collapsed sections, chosen layout, legend s… | S | Both | P1 |
| ANL-001 | The system shall show the widgets above, read from Programs & Projects, without storing pr… | M | Both | P2 |
| ANL-002 | The system shall mark a project **late** when its forecast finish is after its target or S… | M | Both | P2 |
| ANL-003 | The system shall compute EV = budget × progress, CPI and SPI from the module's figures. | M | Both | P2 |
| ANL-004 | The system shall link each project to its source Planner plan (one plan per project). | S | Both | P2 |
| ANL-005 | The system shall show capacity coming online as GPUs for NeoCloud and as cabinets / kW for… | S | Both | P2 |
| ANL-006 | The system shall show change orders with their approver by size: ≤ 5 % of budget the proje… | S | Both | P2 |
| ANL-007 | The system shall rank project risks by likelihood × impact and show derived risks (late PO… | S | Both | P2 |
| ANL-008 | The system shall show programme start gates: a project waits until its predecessors are de… | S | Both | P2 |
| ANL-009 | The system shall show work orders by state (Planned, Ready, Awaiting change, In progress, | M | Both | P2 |
| ANL-010 | The system shall show running work and KPIs for the 12 datacenter processes, against each | M | Both | P2 |
| ANL-011 | The system shall show work-order throughput, first-time fix and re-plans per site. | S | Both | P2 |
| ANL-012 | The system shall list work orders blocked by kit, with their PO state. | S | Both | P2 |
| ANL-013 | The system shall link each item to the owning module's record. | M | Both | P2 |
| ANL-014 | The system shall show remote-hands tickets for colocation tenants per site, with SLA. | S | Colo | P2 |
| ANL-015 | The system shall show a My tasks inbox: user steps as tasks with candidate role, due time | M | Both | P2 |
| ANL-016 | The system shall retry a failed automatic step and show the retry in the instance's event | S | Both | P2 |
| ANL-017 | The system shall show a swimlane view per process definition and KPIs from closed runs of | S | Both | P2 |
| ANL-020 | The system shall show commissioning by level, in order (a level cannot pass before the one… | M | Both | P2 |
| ANL-021 | The system shall show a project as handover-ready only when every work order is done and L… | M | Both | P2 |
| ANL-022 | The system shall list open snags per project and level. | S | Both | P2 |
| ANL-023 | The system shall show liquid-cooling (CDU loop) and GPU burn-in tests as named L4 / L5 tes… | C | Neo | P2 |
| ANL-030 | The system shall show prefix utilisation counting bound addresses only (no padding). | M | Both | P2 |
| ANL-031 | The system shall forecast exhaustion per prefix and classify it as Consumed / Committed / | M | Both | P2 |
| ANL-032 | The system shall list addresses outside the site plan as findings (feeding CP-05). | M | Both | P2 |
| ANL-033 | The system shall show differences between IP Management and the connected DNS / DHCP / IPA… | S | Both | P2 |
| ANL-034 | The system shall show InfiniBand and front-end fabric address space per GPU pod. | S | Neo | P2 |
| ANL-035 | The system shall show each site's management space as its own VRF (sites may reuse managem… | S | Both | P2 |
| ANL-040 | The system shall show the overview widgets in equal-height pairs, with a tabbed detail tab… | M | Both | P2 |
| ANL-041 | The system shall count a change as failed when it rolled back or was cited by an incident'… | M | Both | P2 |
| ANL-042 | The system shall show site freezes derived from open Critical incidents, alongside the cal… | M | Both | P2 |
| ANL-043 | The system shall flag conflicting windows on the same devices at the same site. | S | Both | P2 |
| ANL-044 | The system shall show policy checks on changes: POL-01 no rollback plan and POL-02 inside | S | Both | P2 |
| ANL-046 | The system shall apply freezes as the module does: a site with an open Critical incident a… | M | Both | P2 |
| ANL-047 | The system shall measure lead time on normal changes implemented each week: median days fr… | S | Both | P2 |
| ANL-048 | The system shall include preventive maintenance done in the last 12 weeks as completed sta… | S | Both | P2 |
| ANL-045 | The system shall include DCIM-raised changes and delivery change requests in all measures.… | M | Both | P2 |

---

## Appendix B — Screen and feature catalogue

This appendix lists, screen by screen and feature by feature, everything SynapseDC builds. A screen is either **Build (datacenter-specific)**, meaning SynapseDC owns the screen and the data behind it, or **Build — datacenter view over <module> API**, meaning the record stays in the existing module and SynapseDC adds only the datacenter-specific view, calculations and actions. Elements marked **link to <module>** are not built: the user is taken to the module's own screen. "Data from" names the API endpoints from Appendix C, using these labels:
- **API-…**: an existing module's API.
- **API-OAP-…**: the OAP telemetry consumer service on ClickHouse.
- **DC-RM <name>**: a SynapseDC read model, which calculates results from the APIs.
- **DC-STORE**: SynapseDC's own store, which holds datacenter-specific data only.

FR references are to chapters 7.1–7.7 and 7.12. Phases are as in section 12. **Colo** means colocation only and **Neo** means NeoCloud only; rows without a mark apply to both.

### B.1 Command Center
**Route** `/` (`?lens=build` for the build lens) · **Menu** Overview › Command center · **Status** Build (datacenter-specific) · **Phase** P1 (Plan & build strip and lens P2)

This is the landing page: one picture of every datacenter's health, what is happening, who is affected and what to do next.

#### Hero: health and numbers
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Estate health ring | Operations health %, state word and a one-line verdict ("N critical or high incidents at S of 23 datacenters"). An info bubble lists each site. | CC-001, CC-021 | DC-RM health (API-ALR-01, API-ITSM-01, API-OAP-01) | P1 |
| Weakest area | Names the lowest-scoring area under the verdict. | CC-002 | DC-RM health | P1 |
| 2 × 2 number strip | Critical, High, Past SLA and premium customers affected. Clicking a number opens a list whose count equals it (for example `/incidents?view=high`). | CC-003, CC-004, CC-021, REV-028 | API-ITSM-01, DC-RM impact | P1 |
| Area rows | GPU fleet (Neo) or Incident response (Colo), then Power, Cooling & environment, Network. Each row shows the state word, score %, caption and detail line. | CC-005, CC-008, CC-009 | DC-RM health, DC-RM gpu, API-OAP-01, API-ALR-01 | P1 |
| Site chips per area | The datacenters with an issue in the area, critical first: 2 shown at 1440 px, 1 at 1280 px, the rest as "+N" with a hover list. Each chip opens the site. | CC-006 | DC-RM health | P1 |
| Area status hover | Shows why the area has its status (the worst single issue). | CC-007 | DC-RM health | P1 |
| GPU fleet detail | Neo only. For example "152 GPUs stopped by one failed GPU · 2 jobs slowed · $625/h lost"; the chips open `/gpu?dc=&gtab=jobs`. | CC-008, CC-010, GPU-023 | DC-RM gpu (API-OPS-02, API-OAP-01) | P1 |
| Freshness and telemetry gaps | Shows live refresh, data age, and "collector stale" as its own state. | CC-027, CC-028 | API-OAP-04, API-OPS-01 | P1 |

#### Hero: map and datacenter column
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Live estate map | One pin per site, coloured by state. Pins ripple for Critical or High incidents, and backhaul that is down shows animated dashes. | CC-011 | API-INV-01, DC-RM health, API-ALR-01 | P1 |
| Pin popup | Site summary and the site's backhaul fan-out. | CC-012 | DC-RM health, API-INV-03 | P1 |
| Basemaps | Light, Streets, Satellite or Terrain, remembered per viewer. | CC-013 | browser preference | P1 |
| Map search | Search by site id, city, state, region or tier; the map flies to the site and opens its card. | CC-014 | API-INV-01 | P1 |
| Legend, Focus issues, Reset, Expand | Legend items toggle states. Expand fills the content area and Esc closes it. Wheel-zoom works only after the map is clicked. | CC-015 | — | P1 |
| Datacenter column | Every live site as a card, worst first, with an All / Critical / High filter. Cards are compact and quiet sites use a quiet variant. | CC-016, CC-037 | DC-RM health, API-ITSM-01 | P1 |

#### Trio: what is happening, who is affected, recommendations
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| What is happening | Open incidents and major alarms in scope, newest first, each with its resolution-SLA clock bar. The incident opens the datacenter incident view. | CC-017, CC-033 | API-ITSM-01, API-ALR-01, DC-RM rca | P1 |
| Who is affected | Customers impacted now, premium first, with money and the split of services by status. | CC-018, CC-034 | DC-RM impact, DC-RM revenue, API-BSS-01 | P1 |
| Recommendations | Up to 5 ranked, de-duplicated actions: incident steps, pending changes, batch RMA on an optics lot, and plan approvals waiting for the viewer. Each shows its reason. | CC-019, CC-024, CC-035 | DC-RM rca, API-ITSM-06, DC-STORE plans | P1 (plan approvals P2) |
| Equal panels | The three panels are 600 px tall with scrolling bodies. | CC-020 | — | P1 |

#### Plan & build strip and lens
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Plan & build strip | One slim row above the hero: plans per stage and decisions due. "More" opens the full strip and the choice is remembered. | CC-022, CC-036 | DC-STORE plans, API-PRJ-02 | P2 |
| Build lens | Shown with `?lens=build`: capacity pipeline planned → approved → in build → commissioning → live, decisions, the week ahead and projects. | CC-023 | DC-STORE plans, API-PRJ-02, API-PRJ-04, API-IPL-01 | P2 |

#### Shell on this screen
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Info bubbles | An "i" on every widget. | CC-025, XC-009 | — | P1 |
| Persona and geography switch | Changes vocabulary, currency and the first area. | CC-026, CC-038, XC-002 | API-PEN-02, DC-STORE config | P1 |
| ⌘K search | Search over sites, devices, incidents, customers and screens. | CC-039, XC-007 | DC-RM search (API-INV-03, API-ITSM-01, API-BSS-01) | P1 |
| Opstral AI | Questions such as "What is at risk in <site>?", with evidence links. | CC-031, XC-008 | API-AIF-01 over DC-RM | P2 |
| Role scope | Shows only the sites the viewer may see. | CC-030 | API-PEN-01 | P1 |
| TV scaling and embedding | 2200 px and wider screens; `?shell=false`. | CC-029, CC-032, XC-011, XC-012 | — | P1 / P2 |

### B.2 Datacenters list
**Route** `/datacenters` · **Menu** Operations › Datacenters · **Status** Build (datacenter-specific) · **Phase** P1

Lists every datacenter with its condition, its worst issue and the money at risk.

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Analytics strip | Six tiles: site status by condition, edge redundancy, incidents, power, alarms and money. Tiles click through to filters. | SITE-001, XC-021 | DC-RM health, API-ALR-01, DC-RM revenue | P1 |
| List toolbar | Showing N of M, search, Condition and Region quick filters, and a Filters panel. | SITE-001, XC-020 | API-INV-01 | P1 |
| Datacenter rows | State, worst open incident, money at risk, power and space use, and edge redundancy (redundant / redundancy-lost / isolated). | SITE-002, ALM-009, REV-017 | DC-RM health, DC-RM revenue, API-OAP-01, API-INV-02 | P1 |
| List ⇄ tiles switch | The tiles view uses the same card as the Command Center column. | SITE-001 | — | P1 |

### B.3 Datacenter page
**Route** `/datacenters/:id?tab=<sub tab>` · **Menu** Operations › Datacenters › a site · **Status** Build (datacenter-specific) · **Phase** P1 (marked rows P2)

One site end to end. It has four group pills, each with its own sub tabs. `?tab=` names the sub tab.

#### Header and tab groups
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Pinned site header | Slim by default and expandable (remembered). Flagged-KPI chips (FlagRow, "+N more"), a collectors line, telemetry freshness and a quiet collapse icon. | SITE-003, SITE-004 | DC-RM health, API-OAP-04, API-OPS-01 | P1 |
| Header actions | Changes (links to Services & ITSM Change Management via `/changes?dc=`), Plan (opens the Planner prefilled) and Opstral AI. | SITE-038 | API-ITSM-06, DC-STORE plans | P1 / P2 |
| Group pills and sub tabs | Overview · Facility · Infrastructure · Business impact. Each pill shows the sum of its sub tab counts and opens the last sub tab used in that group. | SITE-005 | — | P1 |
| Planned site state | Live-only tabs show an empty state. | SITE-037 | API-INV-01 | P1 |
| Reconciled figures | Same incident, alarm, service and money counts as the Command Center and the lists. | SITE-047 | DC-RM health, DC-RM revenue | P1 |

#### Overview › Datacenter layout (`?tab=overview`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Layout bar and view switch | "Datacenter layout · Live" with a Building › Floor › Room › Rack › Equipment trail and a Schematic / Realistic switch (`?twin=`, remembered). | SITE-010, SITE-012 | — | P1 / P2 |
| Schematic 3D layout | Building → floor → room → rack → device. Beacons mark critical and major racks, floor and room edges show state, floor labels show issue counts, and up to 3 critical callouts appear. | SITE-010 | API-INV-01..03, DC-STORE DCIM, DC-RM health | P1 |
| Needs attention card | Drills straight to the item. | SITE-011 | DC-RM health | P1 |
| Facing row as glass | When a rack is open, the facing row turns to glass and takes no clicks. | SITE-043 | — | P1 |
| Realistic view | Textured bezels per role, perforated doors (the selected rack swings open), trays, containment, plant cabinets, DG canopy and lighting. Effects drop automatically on slow GPUs. | SITE-012, NFR-014 | API-INV-03, DC-STORE DCIM | P2 |
| Colour-by overlays | Health · Temperature (heat map from rack inlets) · Rack power · Connectivity. | SITE-013 | API-OAP-01, DC-RM physical | P2 |
| Rack labels | Every rack in an open room is named with a status dot; clicking a label opens the rack. | SITE-014 | DC-RM health | P2 |
| Plant selection | Cooling units, UPS, rectifier, battery bank or DG. The camera flies to the unit and a card opens with "Open in Facilities". | SITE-015 | API-OAP-01, DC-STORE facility design | P2 |
| Walk mode | Eye-level camera: drag to look, click to walk, W A S D and arrows, collisions with racks, Esc to stop. | SITE-016 | — | P2 |
| Power path / Cable paths chips | A and B busways fed from their UPS module and tap-offs into every rack (tripped and on-battery shown dashed), plus trunks to the ODF. A path card opens beside them. | SITE-017 | DC-RM physical, API-OAP-01 | P2 |
| Device popup | Role, model, rack · U, state, links up and services, with Open device / View cabling / View power / Device in 3D. | SITE-018 | API-INV-03, API-BSS-03, DC-RM impact | P2 |
| Cabling and power trace views | A 3D scene showing only this device: each cable through every hop to the far device (check-first marker), or PSU → outlet → PDU → busway → UPS → feed. | SITE-019 | DC-RM physical, DC-STORE DCIM | P2 |
| Controls dock | Floor picker top-left, tools and "?" help top-right, one dock bottom-left (Colour by, paths and a foldable legend). | SITE-044 | — | P2 |
| 2D fallback | Used when the browser has no WebGL. | SITE-020 | — | P1 |

#### Overview › Needs attention (`?tab=attention`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Open incidents | Four figure tiles (past SLA, unacknowledged, oldest open, MTTR 30 d), then "Resolved · last 7 days". Each incident opens the datacenter incident view. | SITE-006, ALM-033 | API-ITSM-01, API-ITSM-02 | P1 |
| Alarms in scope | Alarm category tiles, then alarms with their scope and severity chips; downstream alarms are excluded. | SITE-006, ALM-008 | API-ALR-01, DC-RM scope | P1 |
| On call now | The site's on-call engineer and escalation. | SITE-007 | API-ALR-06 | P1 |

#### Overview › Metrics (`?tab=metrics`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Facility strip | Six tiles: power load, PUE, UPS, cooling, environment, alarms & maintenance. Each opens its Facility sub tab. | FAC-001, FAC-038 | API-OAP-01, DC-RM physical | P1 |
| Zone temperature and humidity | Averages with 24 h trends. | SITE-008 | API-OAP-02 | P1 |
| Rack inlets and hottest | Inlet average and range, hottest chassis, hottest racks. | SITE-008 | API-OAP-03 | P1 |
| Diesel | Litres, burn rate, 30-day use (estimated until metered). | SITE-008, FAC-040 | API-OAP-01, DC-STORE facility design | P1 |
| Hardware faults and device load | Hardware fault count and device load, CPU above 90 % flagged. | SITE-008 | API-ALR-01, API-OAP-03 | P1 |

#### Overview › Ops log (`?tab=timeline`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Ops log | Commissioning, changes, incidents, maintenance, capacity and discovery events in time order, each linking to its record. Changes and incidents link to Services & ITSM. | SITE-009 | API-ITSM-01, API-ITSM-06, API-ITSM-10, API-PRJ-04 | P1 |

#### Facility › Power & backup · Cooling · Environment · Single points of failure · Maintenance & alarms (`?tab=fpower|fcooling|fenv|fspof|fmaint`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Facilities body for this site | The same content as the Facilities screen (B.6), without the facility strip, which heads Metrics instead. | FAC-030, FAC-038 | see B.6 | P1 / P2 |

#### Facility › Access & security (`?tab=access`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| People on site & exceptions | Who is on site now (guards, technicians, change crews, on-call, vendors, visitors with host and escort) and the security exceptions (tailgating, forced or held door, anti-passback, after-hours, unescorted, overstay, badge not returned). | SITE-030 | PACS / visitor connectors (INT-17, INT-18), DC-RM access, API-SOC-06 | P2 |
| Entries, exits & doors | 24 h chart, doors and readers with events and denials; a door click opens the audit trail. | SITE-030 | INT-17, DC-RM access | P2 |
| Access rights review | Quarterly review: badges by type, expired or unused badges, CCTV 90 d, log 1 y. | SITE-030 | INT-17, DC-RM access | P2 |
| Access audit trail | Filterable log of badge reads (`aq · ares · atype · adoor · adir`). | SITE-030 | INT-17 | P2 |
| Visits linked to work | A visit links to its change (CHG) or incident (INC) in Services & ITSM. | SITE-031 | API-ITSM-02, API-ITSM-07 | P2 |
| Tenant cage doors | Colo only. Tenants' badge reads at their cage. | SITE-032 | INT-17 | P2 |
| Person and exception drawers | Details and history. | SITE-033 | DC-RM access | P2 |

#### Infrastructure › Equipment (`?tab=elements`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Installed devices | State, role, rack, model and alarms. Planned devices show as reserved rack space only. | SITE-021 | API-INV-03, API-ALR-01, API-OAP-04 | P1 |
| Tenant gear | Colo only. An opaque block per cabinet: owner, contracted kW, measured draw; never polled. | SITE-022 | API-INV-02, API-BSS-02, API-OAP-01 | P1 |
| 8-GPU strip | Neo only. Per-GPU state on each GPU node; a cluster's nodes are grouped. | SITE-023, GPU-041 | API-OAP-01, DC-RM gpu | P1 |
| Operator servers | The operator's own servers with their purpose (management, applications, NFV, BMS / ACS / NVR / DCIM in colocation). | SITE-042 | API-INV-03 | P1 |

#### Infrastructure › GPU Fleet (`?tab=gpu`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Site GPU view | Neo only, hidden without GPU infrastructure. The GPU Fleet tabs (B.7) scoped to the site, with its own "Jobs needing attention" section. | GPU-001, GPU-030 | see B.7 | P1 |

#### Infrastructure › Topology (`?tab=topology`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Site topology | Network devices and links with state; hosts are counted per switch. `/topology?dc=` redirects here. | SITE-024, SITE-046 | API-INV-03, DC-STORE DCIM cables, API-OAP-01, API-ALR-01 | P1 |

#### Infrastructure › Space & ports (`?tab=details`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Rack space, ports, building | Used and free U, ports by speed, building facts. | SITE-025, SITE-046 | API-INV-02..04, DC-STORE DCIM | P1 |
| Floors / rooms / racks table | Per room: racks, U and budget. | SITE-046 | API-INV-01, API-INV-02 | P1 |

#### Infrastructure › Assets (`?tab=assets`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Space by room, equipment by category, facility assets | Device counts per room and category, and the facility plant. | SITE-025 | API-INV-03, DC-STORE facility design | P1 |
| Lifecycle | Warranty and support state, RMA cases, spares. Rack type, purchase date and condition, including Damaged at audit. | SITE-041, FAC-028, FAC-029 | API-INV-06, API-SCM-01, API-SCM-03, API-ITSM-11 | P2 |
| Links to DCIM | Rack rows open DCIM. | SITE-025 | — | P1 |

#### Business impact › Customers / Tenants (`?tab=customers`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Customers served | The persona's word is used. Each customer shows why it is at risk (its causes) and opens the customer page. | SITE-034, REV-031 | API-BSS-01, API-BSS-03, DC-RM impact | P1 |
| Cross-connects and remote hands | Colo only. Orders and tickets from BSS and ITSM; the records stay there. | SITE-035 | API-BSS-09, API-ITSM-11 | P2 |
| GPU customers | Neo only. Their jobs and GPU time lost. | SITE-036 | DC-RM gpu, API-OPS-02 | P1 |

#### Business impact › Revenue (`?tab=revenue`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Site revenue impact | The Revenue Impact model (B.11) scoped to the site: issues, money and credits. | REV-016 | DC-RM revenue | P1 |

### B.4 Device page
**Route** `/ne/:id?tab=` · **Menu** reached from any device link · **Status** Build (datacenter-specific; the asset record stays in Plan to Build Inventory) · **Phase** P1 (marked rows P2)

One device: its health, hardware, power, cabling, links and impact.

#### Overview (`?tab=overview`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Identity and state | Role, vendor, model, serial, rack · U, management IP, state, freshness. "Open in Inventory" links to Plan to Build Inventory. | SITE-026 | API-INV-03, API-IPM-02, API-OAP-04 | P1 |
| Health summary | CPU, memory, temperature, alarms and services carried. | SITE-026 | API-OAP-01, API-ALR-01, API-BSS-03 | P1 |

#### 3D view (`?tab=twin`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| 3D model per family | Router, switch, firewall, optical, server, storage, GPU; parts coloured by kind and state. | SITE-028, SITE-045 | API-INV-03, API-INV-04, API-OAP-01 | P1 |
| Modes and cameras | Device · Open lid · Exploded · One accelerator · In the rack; 3/4 · Front · Rear · Top; Health / Heat overlay. | SITE-028 | API-OAP-01 | P1 |
| Power and Cables chips | Every PSU cord to its rear PDU outlet; the device's ports to the patch panel and trunk; a path card. | SITE-017, SITE-028 | DC-RM physical, DC-STORE DCIM | P2 |
| 2D fallback and inspector | Part inspector; 2D scene when there is no WebGL. | SITE-020 | — | P1 |

#### Hardware & interfaces (`?tab=hardware`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Modules, PSUs, fans | State per module and part. | SITE-026 | API-INV-04, API-OAP-01, API-ALR-01 | P1 |
| Interfaces | Speed, admin / oper state, errors, flaps, optics DOM, utilisation. | SITE-026 | API-INV-04, API-OAP-01, API-OAP-02 | P1 |
| Lifecycle | Install date, warranty, support, vendor end of sale and support, RMA. | FAC-028 | API-INV-06, API-SCM-01, API-ITSM-11 | P2 |

#### Power & cabling (`?tab=physical`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Power chain | Each PSU → outlet → PDU side → UPS or −48 V plant → feed, with load per side. Both cords on one side is flagged. | SITE-027, FAC-010 | DC-STORE DCIM, DC-RM physical, API-OAP-01 | P1 |
| Cable paths | Each port → optic → cord → panel → trunk → ODF → cross-connect → far end. | SITE-027, SITE-019 | DC-STORE DCIM, DC-RM physical | P1 |

#### GPUs · DCGM (`?tab=gpus`, GPU nodes only)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| GPU node detail | Neo only. Health view and profiling view per GPU (DCGM fields), 24 h sparklines. Labelled "GPUs · Intel" for Gaudi / Max nodes. | SITE-029, GPU-014, GPU-010, GPU-011, GPU-012 | API-OAP-01, API-OAP-02 | P1 |

#### Links (`?tab=links`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Links and fabric planes | Neighbours with state. Fabric connections are shown by plane (InfiniBand, Ethernet front-end, Management / OOB), with a BGP card where the switch runs it; border routers keep protocol cards. | SITE-026, GPU-018 | DC-STORE DCIM cables, API-OAP-01 | P1 |
| Link drawer | Cable path of the link. | SITE-019 | DC-RM physical | P1 |

#### Impact (`?tab=impact`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Services and customers on the device | Services carried, their state, customers and money if it fails. | SITE-026, REV-013 | API-BSS-03, DC-RM impact, DC-RM revenue | P1 |

#### Alerts & diagnostics (`?tab=alerts`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Device alarms | Active and recent alarms with scope; the incident link opens the datacenter incident view. | SITE-026, ALM-037 | API-ALR-01, API-ITSM-01 | P1 |

### B.5 Customer page
**Route** `/customers/:id` · **Menu** reached from customer links · **Status** Build — datacenter view over BSS Customers API (the customer record stays in BSS) · **Phase** P1

What is affecting one customer, where they are served, and the money involved.

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Identity header | Avatar, state, facts row, a one-line verdict with the main cause. "Open in CRM" links to BSS. | SITE-039, REV-029 | API-BSS-01, API-BSS-02, DC-RM impact | P1 |
| Analytics strip | Six tiles: services, impacted, money lost, credits, SLA, premium. | REV-029 | DC-RM revenue | P1 |
| What is impacting this customer | Issues with money per issue; each opens the datacenter incident view. | REV-018 | DC-RM revenue, API-ITSM-01 | P1 |
| Where they are served | Sites and racks or cabinets. | SITE-039 | API-BSS-03, API-INV-02 | P1 |
| Service grid | Services with state, site, charge, SLA and cause; Status and Datacenter filters. | SITE-039 | API-BSS-03, DC-RM impact | P1 |
| Cross-connect orders and remote hands | Colo only. Shown from BSS and ITSM; the records stay there. | SITE-040, REV-030 | API-BSS-09, API-ITSM-11 | P2 |

### B.6 Facilities
**Route** `/facilities?dc=&tab=power|cooling|environment|resilience|maintenance` · **Menu** Operations › Facilities · **Status** Build (datacenter-specific) · **Phase** P1 (marked rows P2)

The building's power, cooling, environment and safety, single points of failure and maintenance. It has a datacenter picker, and the same tabs also appear inside the datacenter page.

#### Header and strip
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Datacenter picker | Scopes every tab to one site. | FAC-030 | API-INV-01 | P1 |
| Facility strip | Six tiles (power load, PUE, UPS, cooling, environment, alarms & maintenance), each opening its tab. | FAC-001, FAC-038 | API-OAP-01, DC-RM physical | P1 |
| Freshness, read-only | Every value shows its age. No command is ever sent to plant. | FAC-034, FAC-033 | API-OAP-04 | P1 |

#### Power & backup
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Collapsible sections | Power path · Load & ride-through · Cabinet power distribution & what-if · Rack power. A closed section shows a summary card with a state chip. | FAC-007 | — | P1 |
| Power path diagram | Utility feeds, DG with fuel and runtime, ATS, LT panel, UPS modules, battery, IT racks, DC loads, with animated flow. Hovering traces upstream and downstream. | FAC-002, FAC-003 | API-OAP-01, DC-STORE facility design | P1 |
| 24 h load vs capacity | Load chart against capacity. | FAC-004 | API-OAP-02 | P1 |
| If utility power fails | UPS minutes (shortest module), DG kW at 80 % of kVA, fuel hours and five readiness checks. A UPS on battery shows a note with the minutes left. | FAC-005, FAC-006, FAC-031 | API-OAP-01, DC-STORE facility design, API-ITSM-10 | P1 |
| Cabinet distribution | By UPS, busway and PDU side. | FAC-012 | DC-RM physical | P2 |
| What-if | Pick a feed, UPS, side, PDU, cooling unit or trunk to see what drops and what rides through. | FAC-013 | DC-RM physical | P2 |
| Rack power list | Search plus State / Location quick filters, and Role / PDU sides in the panel (`rq rstate rroom rrole rpdu`). Shows draw vs budget and A / B. Over budget at 85 %, High at 75 %. | FAC-008 | API-OAP-01, API-INV-02, DC-STORE DCIM | P1 |
| Rack PDU drawer | Outlet map: outlet, device, PSU, current, breaker. | FAC-009 | DC-STORE DCIM, API-OAP-01 | P2 |
| Same-side cords flag | Devices with both cords on one side. | FAC-010 | DC-RM physical | P1 |
| Tenant cabinets | Colo only. Draw vs contracted kW; over-budget cabinets flagged (a commercial matter, not a loss). | FAC-011 | API-BSS-02, API-OAP-01 | P1 |
| −48 V DC plant | Rectifiers, BDFB panels and battery, where present. | FAC-032 | API-OAP-01 | P1 |

#### Cooling
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Heat balance | Heat load, running capacity, capacity after losing the largest unit, margin. | FAC-014, FAC-036 | API-OAP-01, DC-STORE facility design | P1 |
| Unit cards | CRAH / CRAC / chiller / CDU with state, supply and return temperatures, load. | FAC-015 | API-OAP-01, API-ALR-01 | P1 |
| CDU loops | Neo only. Flow, supply and return, the GPU racks served; a flow fault links to the GPU slowdown it causes. | FAC-016, FAC-017 | API-OAP-01, DC-RM gpu | P1 |
| Coverage by floor | N+1 holds / No spare / Short, and each rack's nearest unit. | FAC-018 | DC-RM physical | P2 |

#### Environment
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Zone cards | Temperature and humidity on safe-band tracks (18–27 °C, 40–60 % RH). | FAC-019 | API-OAP-01 | P1 |
| Fire zones | Detection, suppression, agent %, release mode, last and next inspection. | FAC-020 | API-OAP-01 (BMS), DC-STORE facility design, API-ITSM-10 | P2 |
| Leak detection | Rope lines and their state. | FAC-021 | API-OAP-01 (BMS) | P2 |
| Access points | Mantrap, room doors, cage doors, with events and denials in 24 h. | FAC-022 | INT-17, DC-RM access | P2 |

#### Single points of failure
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| SPOF list | Cords on one side, failed PSU, tripped PDU, one-side cabinets (≥ 90 %), UPS not online, Tier II single feed / route / entry, lost cooling spare. Domain filter (`?domain=`), with a what-if per item. | FAC-023, FAC-013 | DC-RM physical | P2 |
| Resilience tests | Last run, outcome, next due. | FAC-024 | DC-STORE facility design, API-ITSM-10 | P2 |

#### Maintenance & alarms
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Facility alarms | The site's active facility alarms and the incidents tracking them. | FAC-035 | API-ALR-01, API-ITSM-01 | P1 |
| PM plan | Per plant asset: interval, last done, next due, state; impact shown as the what-if. | FAC-025, FAC-027 | API-ITSM-10, DC-RM physical | P2 |
| Schedule maintenance | Raises a Maintenance change through Services & ITSM (`/changes?new=maintenance`). | FAC-026 | API-ITSM-08 | P2 |
| Lifecycle, spares and contracts | Warranty and support state, RMA, spares per part family (on hand, reserved, minimum), support contracts and vendor dates. | FAC-028, FAC-029, FAC-037, FAC-039 | API-INV-06, API-SCM-01, API-SCM-03, API-ITSM-11 | P2 |
| Estimates flagged | Diesel litres, burn, PDUs per rack and similar values are marked estimated until a record or reading replaces them. | FAC-040 | DC-STORE facility design | P1 |

### B.7 GPU Fleet
**Route** `/gpu?dc=&gtab=clusters|jobs|nodes|models|telemetry|cooling|fabric|placement` · **Menu** Operations › GPU Fleet · **Status** Build (datacenter-specific) · **Phase** P1 (cooling & power cost and placement P2)

Neo only; hidden when there is no GPU infrastructure. GPUs, jobs and what faults cost in productive GPU time.

#### Head and attention
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Head row | Title and subtitle, live chip, datacenter select (200 px), Opstral. | GPU-036, GPU-030 | API-INV-01 | P1 |
| Fleet strip | GPUs installed, in a job, healthy %, jobs by state, GPU time lost. | GPU-009, GPU-039 | DC-RM gpu | P1 |
| Jobs needing attention | Collapsible. Biggest blast radius and Slowest job cards; when closed, four facts (GPUs stopped + incident, lost now, slowest job, lost now). | GPU-008 | DC-RM gpu, API-ITSM-01 | P1 |
| Pinned tab bar | Eight tabs on one row at 1280 px; list headers pin below. | GPU-029 | — | P1 |

#### Clusters (default)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Cluster / pod list | GPU model, vendor, nodes, GPUs in a job, spare, out of service, worst state. | GPU-002 | API-INV-03, DC-RM gpu | P1 |
| Node heat map | Per cluster, coloured by worst GPU state. | GPU-003 | API-OAP-01 | P1 |

#### Jobs
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Jobs list | Kind, customer, premium, cluster, GPUs, state, step time, MFU, last checkpoint, lost now / so far / work to redo / at stake. Sorted by lost-now. | GPU-005, GPU-006, GPU-007 | API-OPS-02, DC-RM gpu, API-BSS-02 | P1 |
| Filters | State (stalled, slowed, at risk, idle, running) and kind. | GPU-037 | — | P1 |
| Not exported | Step time, MFU and checkpoint show "not available" when the AI platform does not export them. | GPU-032, GPU-031 | API-OPS-02 | P1 |
| Incident and actions | A job hit by a fault links to its GPU incident; actions such as "drain the failed node and restart from the checkpoint". | GPU-022, GPU-034 | API-ITSM-01, DC-RM rca | P1 |

#### Nodes
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Nodes list | Cluster, job, owner, utilisation, max GPU temperature, throttle, Xid, driver; `?gmodel=` filter. | GPU-004 | API-OAP-01, API-INV-03, API-OPS-02 | P1 |
| Node drawer | Health view, profiling view, 24 h sparklines, hardware row. | GPU-014, GPU-012 | API-OAP-01, API-OAP-02 | P1 |
| Driver drift | Nodes on their model's old driver, linked to the driver-rollout change in Services & ITSM. | GPU-016, GPU-038 | API-INV-03, API-ITSM-07 | P1 |
| RMA nodes | Open RMA and spare status. | GPU-028 | API-ITSM-11, API-SCM-03 | P2 |

#### GPU models
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Vendor cards and model table | NVIDIA B200 / H200 / H100 / A100 / L40S / T4 and Intel Gaudi 3 / Max 1550: memory, TDP, scale-up link, fabric, server, driver, telemetry source; opens Nodes filtered by model or vendor. | GPU-017 | API-INV-05, DC-STORE GPU catalogue | P1 |

#### Telemetry
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Fleet telemetry | Utilisation and temperature histograms, 24 h fleet series, energy, P-states, Xid timeline, ECC totals. | GPU-013 | API-OAP-02, API-OAP-03 | P1 |
| Counter leaders and DCGM fields | Hottest GPUs, most PCIe replays and similar leaders; the DCGM field list. Vendor-aware labels (DCGM / hl-smi / XPU Manager). | GPU-040, GPU-010, GPU-011 | API-OAP-03, API-OAP-06 | P1 |
| Xid alarms | Xid classified per bucket and raised as GPU alarms. | GPU-015 | API-OAP-01, API-ALR-03 | P1 |

#### Cooling & power
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| GPU cooling | CDU loops (capacity, load, supply and return, flow); GPU racks with draw vs budget, liquid / air, maximum temperature. | GPU-019, GPU-020 | API-OAP-01, DC-STORE facility design | P1 |
| Tenant AI cages | Colo only. Contracted kW, draw, CDU and inlet temperature; power and cooling only. | GPU-021 | API-BSS-02, API-OAP-01 | P1 |
| Power cost per GPU-hour | Per pod, per installed and sold GPU-hour against the model's price; idle GPUs' power cost; links to Capacity → Power economics. | GPU-024, GPU-027 | DC-RM power-econ, DC-STORE contracts | P2 |
| Energy and power cost by job / tenant | By job and by tenant: kW × PUE × tariff per day against earnings; idle allocations; power-cap trade-off. | GPU-025 | DC-RM power-econ, API-OPS-02 | P2 |

#### Network
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Network rails | InfiniBand, Ethernet front-end, OOB per cluster: ports, errors and flaps on one line. | GPU-018 | API-OAP-01, DC-STORE DCIM cables | P1 |

#### Where to place
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Placement | Enter GPUs needed (8–256) and a model to get a strip and ranked pods. Each pod shows fit good / tight / no, free healthy GPUs, rack headroom, cooling, contracted headroom, already-paid kW and marginal power per GPU-hour. | GPU-026 | DC-RM power-econ, DC-RM gpu | P2 |

#### Elsewhere
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Opstral AI | "Where should the next GPU job go?", "What is power costing us?", "Which GPU job is losing the most?" | GPU-033 | API-AIF-01 over DC-RM | P2 |
| GPU hours to billing | Delivered and lost hours per customer per day. | GPU-035 | API-BSS-08 | P2 |

### B.8 Alerts
**Route** `/alerts?sev=&scope=&state=&dc=` · **Menu** Operations › Alerts · **Status** Build — datacenter view over Ops Toolkit System Alerts API (alerts stay in System Alerts) · **Phase** P1

Alarms with datacenter scope, placement and correlation added.

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Analytics strip | Six tiles: active alarms by severity, scope, category and source, with click-through. | ALM-012 | API-ALR-01, DC-RM scope | P1 |
| Alarm list | Severity, scope, category, source, title, device and port or rack, age, incident. Severity / Scope quick filters, state filter. | ALM-012, ALM-037 | API-ALR-01, API-INV-03 | P1 |
| Scope and placement | Site / edge / dependency shown; downstream excluded and shown under its causing incident. | ALM-006, ALM-007, ALM-008, ALM-010 | API-ALR-05, DC-RM scope | P1 |
| Acknowledge | Acknowledgement is recorded in System Alerts. | ALM-012 | API-ALR-04 | P1 |
| Correlate into incident | Selected uncorrelated alarms open or extend an incident in Services & ITSM. | ALM-036, ALM-013 | API-ITSM-03, API-ITSM-04 | P1 |
| Monitoring gaps | Collector stale, unmonitored devices. | ALM-029 | API-OAP-04, API-ALR-03 | P1 |
| Normalisation behind the list | Collector alarms are normalised, de-duplicated, checked for flapping, graded and placed before being sent to System Alerts. | ALM-001..005, ALM-011 | API-ALR-03, API-ALR-05 | P1 |

### B.9 Incidents — datacenter incident view
**Route** `/incidents?view=open|high|breaching|all&dc=`, `/incidents/:id`, `/incidents?tab=problems&prb=` · **Menu** Operations › Incidents · **Status** Build — datacenter view over Services & ITSM Incidents / Problems API (incident and problem records stay in ITSM) · **Phase** P1 (problems, notices P2)

Adds impact, root cause, actions, verification, money and communications to the ITSM incident.

#### Incident list
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Views and filters | Open · Critical open · High open · Breaching SLA · All; Datacenter filter. | ALM-033 | API-ITSM-01 | P1 |
| Rows | Severity word, title, site, status, SLA clocks, impact, revenue column. | ALM-027, REV-017 | API-ITSM-01, DC-RM impact, DC-RM revenue | P1 |
| Open in ITSM | Link to the incident record in Services & ITSM. | ARCH-006 | — | P1 |

#### Incident page
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Details | Type, severity, status, owner, SLA clocks (response and resolve), ITSM number. | ALM-014, ALM-027 | API-ITSM-02 | P1 |
| Correlated alerts | Alarms grouped into this incident, with downstream symptoms. | ALM-013, ALM-008 | API-ALR-01, DC-RM rca | P1 |
| Impact assessment | Affected objects; services, customers and premium; revenue at risk. | ALM-015, ALM-016 | DC-RM impact, API-BSS-03 | P1 |
| Root cause hypotheses | Ranked with confidence and evidence; confirm / reject feedback. | ALM-017, ALM-019 | DC-RM rca, DC-STORE feedback | P1 |
| Change awareness | Changes at the site or on the path in the last 3 days marked as suspects. | ALM-018 | API-ITSM-06 | P1 |
| Action plan | Steps with owner, expected result, rollback, verification. Raise an emergency change. | ALM-020, ALM-021 | DC-RM rca, API-ITSM-08 | P1 |
| Closure verification | Checklist before resolve; the resolution is posted to ITSM. | ALM-022 | DC-RM rca, API-ITSM-04 | P1 |
| Similar events | Past incidents and shared nodes; batch RMA suggestion. | ALM-023, ALM-039 | API-ITSM-01, DC-RM rca | P1 |
| Worklog | ITSM work notes, plus system and AI lines posted through the ITSM API. | ALM-024 | API-ITSM-02, API-ITSM-04 | P1 |
| Revenue impact panel | Rate, lost, credits, cliff, forecast. | ALM-028, REV-015 | DC-RM revenue | P1 |
| On call & communications | On-call engineer and paging chain, next escalation, ITSM ref, customer notices (initial 15 / 30 / 60 min, updates 1 / 2 / 4 h, overdue flagged). | ALM-026 | API-ALR-06, API-BSS-06 | P2 |
| GPU incidents | Neo only. Affected jobs listed. | ALM-030 | DC-RM gpu, API-OPS-02 | P1 |
| Opstral AI | Cause, what changed, what to do. | ALM-035 | API-AIF-01 | P2 |

#### Problems tab
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Problem records | Incidents grouped by common cause (for example an optics lot), with state (Fix in change / Investigating / Known error). Created and kept in ITSM. | ALM-025 | API-ITSM-05 | P2 |

### B.10 Revenue Impact
**Route** `/revenue?tab=issues|customers|datacenters|trends|exposure` · **Menu** Overview › Revenue impact · **Status** Build (datacenter-specific) · **Phase** P1

What every open issue costs, reconciled across every view.

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Six-tile strip | Losing now (per hour), Impact so far, At stake, Credits owed, Costliest cause 30 d, Within SLA 30 d. | REV-006 | DC-RM revenue | P1 |
| Answer cards | "Costing the most right now" and "Most at stake", each with a cost-of-delay curve. | REV-007 | DC-RM revenue | P1 |
| Issues tab | Ranked issues: services down / degraded / exposed, customers, lost, credits, next cliff, forecast 24 h. | REV-008, REV-003 | DC-RM revenue (API-ITSM-01, API-BSS-02, API-BSS-03) | P1 |
| Cost-breakdown drawer | Every service with state, rate, minutes, credit step, cliff. | REV-009 | DC-RM revenue | P1 |
| Customers tab | Monthly revenue, services by state, money, locked-in credits; filters View / Impacted now / Segment. | REV-010 | DC-RM revenue, API-BSS-01 | P1 |
| Datacenters tab | Money, issues and services impacted per site; "Impacted or at stake" filter. | REV-011, REV-004 | DC-RM revenue | P1 |
| Causes & trend tab | Causes by domain (Power, Cooling, Network, Rack, Device, GPU) and 30-day history. | REV-012, REV-019 | DC-RM revenue, API-ITSM-01 | P1 |
| One failure away tab | Exposed services ranked by potential cost if the fault turns into an outage. | REV-013 | DC-RM revenue | P1 |
| How it is calculated | Drawer with every formula and constant. | REV-014 | — | P1 |
| Model rules | One issue per service; Colo tenant over its own power is not a loss; GPU jobs are services; persona money words; currency. | REV-001, REV-002, REV-005, REV-020, REV-021, REV-022 | DC-RM revenue | P1 |
| Push to BSS / billing | Impact per customer, SLA credits, events. | REV-023, REV-024 | API-BSS-05, API-BSS-07 | P2 |
| Opstral AI | "Which issue is costing the most revenue?" | REV-027 | API-AIF-01 | P2 |

### B.11 Security Ops
**Route** `/secops?tab=overview|detections|cases|playbooks|attack|rules|vulns|hardening|drift|ot|physical&dc=` · **Menu** Security › Security Ops › Insights · Detections · Cases · Threat coverage · Vulnerabilities · Hardening & drift · OT security · Physical security · **Status** Build — datacenter view over Ops Toolkit Security Ops API (detections, cases, rules and sensors stay in Security Ops) · **Phase** P2

Datacenter security analysis with the site context added.

| Sub-menu | Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- | --- |
| Insights | Posture | NIST CSF 2.0 function scores with their basis, open detections and cases, site security scores ranked, gaps linking to data sources. | SEC-002, SEC-031 | API-SOC-01, API-SOC-02, API-SOC-05, DC-RM secops | P2 |
| Detections | Queue | Rule, severity, asset, site, technique, state, disposition; datacenter context (room, rack, owner, change, who was on site). | SEC-005, SEC-033 | API-SOC-01, API-INV-03, API-ITSM-06, DC-RM access | P2 |
| Detections | Triage | Close, mark as true positive or escalate to a case; the analyst's moves persist in Security Ops. | SEC-032 | API-SOC-07 | P2 |
| Detections | Datacenter rules | SR-002 drift without a change, physical detections equal to the Access tab, SR-060 badge-in → unapproved change, GPU crypto-mining, OOB / BMC probing, OT behaviours. | SEC-003, SEC-006..011 | API-SOC-01, API-SOC-06, API-ITSM-06 | P2 |
| Cases | Case lifecycle | NIST SP 800-61 phases, step checklists, notes, closure. | SEC-012, SEC-014 | API-SOC-02 | P2 |
| Cases | Playbooks | Steps per case type with owner, trigger rules and the system that runs each step (automation runs in the SOC platform). | SEC-013, SEC-034 | API-SOC-02 | P2 |
| Threat coverage | ATT&CK | Enterprise and ICS matrix: techniques with an enabled rule and a live sensor. | SEC-004, SEC-015 | API-SOC-03, API-SOC-05 | P2 |
| Threat coverage | Rules | Sigma source, compiled ClickHouse query, version, status; enable, edit or create. | SEC-016 | API-SOC-03 | P2 |
| Vulnerabilities | Exposure | Advisories matched per asset with CVSS v4, EPSS, KEV and an SSVC decision; set state (In remediation with a change link). | SEC-017, SEC-018, SEC-019 | API-SOC-04, API-INV-03, API-ITSM-08 | P2 |
| Hardening & drift | Baselines | CIS / DISA STIG / vendor checks per device. | SEC-020 | API-SOC-01, API-INV-03 | P2 |
| Hardening & drift | Drift | Running vs approved configuration, authorised (with a CR) or not. | SEC-021 | API-SOC-01, API-ITSM-07 | P2 |
| OT security | Zones and conduits | IEC 62443 zones per site, SL-T vs SL-A, OT assets and findings. | SEC-022, SEC-023 | API-SOC-01, API-INV-03, DC-STORE OT zones | P2 |
| Physical security | Layers | Perimeter → building → room → cage / rack per site, physical detections, access-rights review. | SEC-024, SEC-007 | DC-RM access, API-SOC-01 | P2 |
| All | Guardrails | Tenant equipment is excluded. No containment is performed; "raise change" is offered instead. Output goes to the SIEM as OCSF. | SEC-027, SEC-028, SEC-026 | API-ITSM-08, NB-10 | P2 |
| All | Metrics and compliance | MTTA, MTTR, cases within SLA, true-positive rate; ISO 27001 mapping for Compliance. | SEC-029, SEC-030 | API-SOC-02, DC-RM compliance | P2 |

### B.12 Security data sources
**Route** `/security-sources` (`/secops?tab=sources` redirects) · **Menu** Admin › Security data sources · **Status** Build — datacenter view over Ops Toolkit Security Ops sensors API · **Phase** P2

Shows which sensors feed security monitoring at each site, and where the gaps are.

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Sensor list | TACACS+, syslog, Oxidized, Redfish, osquery, Falco, k8s audit, Trivy, Suricata, Zeek, NetFlow, OT sensor, PACS, VMS: state, last event, assets covered, site. | SEC-025 | API-SOC-05 | P2 |
| Coverage gaps | Devices not discovered send no telemetry; silent sources are flagged. | SEC-025, SEC-015 | API-SOC-05, API-OAP-04, API-INV-03 | P2 |

### B.13 Capacity

**Route** `/capacity?tab=…&dc=` · **Menu** Plan & Build › Capacity › Insights · Power · Space · Network · Compute · Reservations · **Status** Build (datacenter-specific) · **Phase** P2

Shows what each datacenter can still take (space, power, cooling, ports, GPUs) after every hold, what power costs, and where the next load should go.

#### Insights (`overview`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Summary tiles | One tile per dimension (space, power, cooling, ports, GPU) plus a holds tile; each opens its tab | CAP-002 | DC-RM capacity; API-INV-02, API-OAP-01 | P2 |
| Capacity per datacenter | Installed, used, held and free per dimension, by site, scoped by the datacenter picker | CAP-001, CAP-026 | DC-RM capacity; API-INV-01…03, API-OAP-01 | P2 |
| Reservation ledger | Submitted → Approved → Executing → Delivered, months to the 85 % line per dimension | CAP-036 | DC-RM capacity; DC-STORE plans; API-IPL-01 | P2 |
| 12-month forecast | Compound-growth forecast against the 85 % warning line; approved plans netted in; ≤ 9 months flagged | CAP-009 | API-OAP-03 (12-month history); DC-STORE plans | P2 |
| Plan from a dimension | "Plan" button opens a new plan with the site and template pre-filled | CAP-027, PLN-030 | DC-STORE plans | P2 |
| Info and reconciliation | Every widget has an info text; Σ sites = estate on every figure | CAP-033, CAP-028 | DC-RM capacity | P2 |

#### Insights (`financial`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Financial view per site | CapEx approved and committed, OpEx per month, from plans and projects | CAP-035 | DC-STORE plans; API-PRJ-02, API-SCM-04 | P2 |

#### Power (`power`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Power headroom by site and hall | Design vs drawn vs held kW, 85 % marker; link to the DCIM floor plan | CAP-003, CAP-005 | API-OAP-01; API-INV-02; DC-RM capacity | P2 |
| 12-month power history | Monthly peak per site, used by the demand-ratchet finding | CAP-030 | API-OAP-03 | P2 |

#### Power › PUE & energy (`energy`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| PUE, energy, CO₂ | PUE = facility ÷ IT, energy per day, CO₂ with the national grid factor (CEA India, eGRID USA), per site and estate | CAP-008 | API-OAP-03 (meter series); DC-STORE factors | P2 |

#### Power › Power economics (`economics`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Strip | Bill per month, energy vs capacity share, idle kW cost, cost per sold MW-month | CAP-012, CAP-014 | DC-RM power-econ; DC-STORE tariffs, contracts; API-OAP-03 | P2 |
| Idle-cost ranking | Bar list of sites by idle committed kW cost | CAP-013 | DC-RM power-econ | P2 |
| Bill breakdown and site table | Donut energy / demand / block charges; site rows open Facilities power | CAP-015 | DC-RM power-econ | P2 |
| Tariffs and contracts | Tariff per state, contract per site (utility take-or-pay or colocation block); marked illustrative; authorised users replace values | CAP-010, CAP-011 | DC-STORE tariffs, contracts | P2 |
| Power findings | Block ≥ 85 %, new demand peak, unexplained rise, idle block; severity, exposure, alarm and incident links | CAP-019, CAP-021, CAP-038 | DC-RM power-econ; API-ALR-03, API-ITSM-03 (raised); API-ITSM-01 (links) | P2 |
| Raise alarms and incident | One alarm per finding, one Medium incident for the costliest block / ratchet finding | CAP-020, CAP-022 | API-ALR-03; API-ITSM-03 | P2 |
| GPU power cost | Per pod: kW / GPU × PUE × tariff per installed and per sold GPU-hour vs price; deck reference line (Neo) | CAP-016, CAP-037 | DC-RM power-econ; API-OAP-01; API-BSS-02 (GPU rate) | P2 |
| By job / tenant | Energy and power cost per job or tenant vs what it earns; idle allocations; power-cap trade-off | CAP-017, CAP-018 | API-OPS-02; API-OAP-03; API-BSS-03 | P2 |
| Metered usage out | kWh and peak kW per tenant cabinet (Colo); GPU-hours delivered / lost per job (Neo) to billing | CAP-031, CAP-032 | API-BSS-08 | P2 |
| Cost to Fin Ops | Site power cost figures sent to Fin Ops | — | API-OPS-04 | P2 |
| Export | CSV of capacity, holds and power economics | CAP-029 | DC-RM capacity | P2 |

#### Space (`space`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Space and power by hall | Racks / U used, held, free per hall with power pressure; opens the DCIM floor plan | CAP-003 | API-INV-02, API-INV-03; DC-STORE DCIM extensions | P2 |

#### Network (`network`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Links in countdown | Utilisation, growth of the last six monthly peaks, months to full; port headroom per site | CAP-034 | API-OAP-03; API-INV-04 | P2 |

#### Compute (`compute`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| GPU capacity per model | In a job / allocated-idle / free / out of service, per model and site (Neo) | CAP-007 | API-OPS-02; API-OAP-01; API-INV-03 | P2 |
| Where to place | Rank pods for 8–256 GPUs of a chosen model: free healthy GPUs, rack headroom, cooling, already-paid kW, fit good / tight / no (Neo); colocation hall ranking to discuss (Colo) | CAP-023, CAP-024 | DC-RM power-econ, gpu; API-OAP-01 | P2 / P3 |
| Opstral answers | "Where should the next GPU job go?", "What is power costing us?" | CAP-025 | DC-RM power-econ; API-AIF-01 | P2 |

#### Reservations (`reservations`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Reservation list | Every hold: kind (Reserved planned device, Committed colocation contract above draw, Pipeline plan, Requested plan, Reserved idle-job GPUs), resource, quantity, state, link | CAP-004, CAP-006 | DC-RM capacity; API-INV-03; API-BSS-02; DC-STORE plans; API-OPS-02 | P2 |
| Net available | Power and space after all holds | CAP-005 | DC-RM capacity | P2 |
| Write reservations | Holds from approved plans written to Inventory Planning | PLN-025 | API-IPL-02 | P2 |

### B.14 Planner — Insights hub

**Route** `/planning` · **Menu** Plan & Build › Planner › Insights · **Status** Build (datacenter-specific) · **Phase** P2

The planner's landing page: plans that need action and the portfolio at a glance.

#### Insights (`overview`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Analytics strip | Plans by status, CapEx in pipeline, IT capacity planned, decisions due | PLN-029 | DC-STORE plans | P2 |
| Plans that need action | Your decision, Your review, Review sent, blocked submits, failing rules | PLN-029, PLN-037 | DC-STORE plans, reviews | P2 |
| Library charts | Benchmark bars, PUE matrix, lead-time bars | PLN-004 | DC-STORE benchmarks | P2 |
| New plan | Opens the wizard | PLN-005 | — | P2 |

### B.15 Planner — Plans

**Route** `/planning?tab=plans&status=&scope=&q=` · **Menu** Plan & Build › Planner › Plans · **Status** Build · **Phase** P2

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Plans list | Search, quick filters status and scope, Filters panel; rows open the plan page | PLN-028 | DC-STORE plans | P2 |
| Card view | List ⇄ tiles switch, remembered per viewer | PLN-028 | DC-STORE plans | P2 |

### B.16 Planner — Templates

**Route** `/planning?tab=templates` · **Menu** Plan & Build › Planner › Templates · **Status** Build · **Phase** P2

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Views | Plan types · Site types · Modules, list or cards | PLN-002 | DC-STORE templates | P2 |
| Template drawer | Inheritance chain, wizard areas, approval path, outputs, inputs with defaults, rules, plans using it, versions | PLN-003 | DC-STORE templates | P2 |
| Template lifecycle | Make a variant, publish, retire; content change bumps the version | PLN-043 | DC-STORE templates | P2 |

### B.17 Planner — Benchmarks

**Route** `/planning?tab=benchmarks&metric=&site=&cooling=&tier=&region=&conf=` · **Menu** Plan & Build › Planner › Benchmarks · **Status** Build · **Phase** P2

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Views | Costs · Efficiency · Lead times · Sizing & staffing · Rules, each with charts and tables | PLN-004 | DC-STORE benchmarks; API-SCM-02 (prices, lead times) | P2 |
| Toolbar per view | Search, Reference value / Site type quick filters, Cooling / Tier / Region / Confidence (Rules: Area / Severity) | PLN-044 | DC-STORE benchmarks | P2 |
| Add / edit benchmark | Drawer; versioned | PLN-004 | DC-STORE benchmarks | P2 |

### B.18 Planner — New plan wizard

**Route** `/planning/new?dc=&template=` · `/planning/plans/:id/edit` · **Menu** from Planner, a datacenter page or Capacity · **Status** Build · **Phase** P2

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Stage stepper | Set up · Design · Delivery · Business · Decide, one connected line, dots per step | PLN-005 | — | P2 |
| Plan type | Accordion of six families; selected type's details panel | PLN-001 | DC-STORE templates | P2 |
| Requirements | Name, needed-by with lead-time check, where (site / two sites / campus / new site / region), how much, workload mix, tier | PLN-005, PLN-006 | API-INV-01; DC-RM capacity | P2 |
| Candidate sites / plots | Site list with capacity bars; new-site candidate plots | PLN-016 | DC-RM capacity; DC-STORE | P2 |
| Affected assets | Refresh plans: every eligible item, reasons as quick filters (end of sale, out of support, faulty), paged, searchable | PLN-017 | API-INV-03, API-INV-06; API-ITSM-11 (RMA) | P2 |
| Derived inputs | "The planner fills N inputs" with reasons; source chips + reset per input | PLN-006, PLN-007 | DC-STORE templates, benchmarks | P2 |
| Dimension steps | One step per area (space, power, cooling, network…), result per area, checks, drawings, phases / permits / risks editors | PLN-009, PLN-011 | DC-STORE | P2 |
| GPU / colocation sizing | GPU pod plans as GPUs, kW / rack, liquid share, CDUs (Neo); cage / hall from contracted kW per cabinet (Colo) | PLN-033, PLN-034 | DC-STORE | P2 |
| Scenarios | Create, compare, prefer | PLN-013 | DC-STORE | P2 |
| Review | Blockers with "fix" links, approval path by band, outputs; submit | PLN-012, PLN-014 | DC-STORE | P2 |
| Live estimate rail | Readiness ring, CapEx, IT power, source dots on every step | PLN-008 | DC-STORE | P2 |
| Unsaved-changes guard | Warns before leaving; jump-to-step list | PLN-040 | — | P2 |

### B.19 Planner — Plan page

**Route** `/planning/plans/:id?tab=…` · **Menu** from Plans · **Status** Build · **Phase** P2

Header (scope icon, status / revision chips, facts line, primary action, Send for review, Actions), one status line, hero strip (readiness or % built, IT capacity, CapEx, payback, needed by, rule checks), all tabs on one row with "More".

| Tab | Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- | --- |
| Header | Status line | State in words, whose decision, blockers, conditions, template drift, the build in Programs & Projects, open review / revision | PLN-047 | DC-STORE plans; API-PRJ-02 | P2 |
| Header | What-if drawer | Scenarios on demand; figures follow approved → in review → preferred → base | PLN-039 | DC-STORE | P2 |
| Overview | Dashboard | What and why, Draft → Completed tracker, next step, key dates, needs attention, phases, cost · capacity · readiness, inputs changed, outputs | PLN-046 | DC-STORE | P2 |
| Project plan | Schedule | Phases with gates, "order in N wk" / "N wk late", Timeline view, PO numbers | PLN-011 | DC-STORE; API-PRJ-05 | P2 |
| Project plan | Adjust the project plan | Edit name, go-live, IT kW, density, cooling; split / merge / add phases; live effect on CapEx, NPV, late items; commit per edit policy | PLN-024, PLN-023 | DC-STORE | P2 |
| Family tabs | Equipment / Inventory / Waves / Plant / Paths / Site fit | Family-specific views; equipment editor re-evaluated live | PLN-031 | DC-STORE; API-INV-03 | P2 |
| Design | Sizing and capacity | Sizing per area, capacity ladder (`#pn-capacity`) | PLN-009 | DC-STORE | P2 |
| Cost | Cost and business case | CapEx lines, OpEx, NPV, IRR, payback, cashflow and breakdown charts, baseline vs now | PLN-010 | DC-STORE | P2 |
| Materials | Bill of materials editor | Quantity, model, vendor, source (auto / site / stock / buy), remove, add from catalogue; sourcing site spare → stock → vendor | PLN-018 | DC-STORE; API-SCM-01…03 | P2 |
| Risks & permits | Living register | Status, rating, owner, mitigation saved straight; add / remove drafts a revision | PLN-023 | DC-STORE | P2 |
| Rules | Rule checks | Hard / soft rules with results and fixes | PLN-012 | DC-STORE | P2 |
| Approvals | Decide | Approval path, decide modal, conditions, delegations, segregation of duties, review panels | PLN-014, PLN-015, PLN-037 | DC-STORE; API-PEN-01 (roles) | P2 |
| Plan pack | Pack contents | What the plan creates (links into Programs & Projects, IP Management, DCIM), basis of design, BoM, IP plan, drawings, build initiation, CSV | PLN-019, PLN-048 | DC-STORE | P2 |
| Plan pack | Review pack downloads | PDF, XLSX, ZIP (manifest with SHA-256) from one content model | PLN-020 | DC-STORE | P2 |
| Plan pack | Drawing sheets | Family drawings on landscape A4 with title block | PLN-032 | DC-STORE | P2 |
| Delivery | Build status | Start the build hands over as a project with vendor orders, holds, IP; shows project progress; handover completes the plan | PLN-026, PLN-027, PLN-041 | API-PRJ-06, API-PRJ-07, API-SCM-04, API-IPL-02, API-IPM-03, API-INV-07 | P2 |
| History | Audit and baseline | Every change, decision, revision; baseline frozen on approval; closeout records | PLN-025, PLN-035, PLN-042 | DC-STORE | P2 |

### B.20 Planner — Review portal and Send for review

**Route** `/planning/plans/:id/review` · **Menu** from the plan page · **Status** Build · **Phase** P2

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Review document | Cover, numbered sections and sub-sections, tables, figures, sign-off boxes, drawing sheets; print | PLN-021 | DC-STORE | P2 |
| Decision band | Path, whose turn, decide (same rules as Approvals); review status; pack downloads | PLN-021, PLN-037 | DC-STORE | P2 |
| Comments | Threaded per section; reply; resolve | PLN-021 | DC-STORE reviews | P2 |
| Send for review | Reviewers = path role holders minus requester / submitter; message; PDF / ZIP / link; email preview (sending to discuss) | PLN-022, PLN-038 | DC-STORE; API-PEN-01 | P2 |

### B.21 DCIM

**Route** `/dcim?tab=…&dc=` · **Menu** Plan & Build › DCIM › Insights · Sites · Racks · Devices · Cabling · Power · Catalogue · Changes · **Status** Build (datacenter-specific extensions over Plan to Build Inventory) · **Phase** P1 records, P2 change control / insights

The physical record of each datacenter below the asset: where each rack and device sits, how power and cables reach it, under change control.

#### Insights (`overview`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Needs attention | Racks over budget, unpatched ports, single-fed devices… each opens the filtered list | DCIM-034 | DC-RM physical; API-INV-02…04 | P2 |
| Charts | Sites / halls by power pressure (85 %), rack density, device donuts, cabling stacks, panels by load, makers, change requests | DCIM-034 | DC-RM physical; API-OAP-01; API-ITSM-06 | P2 |

#### Sites (`sites`, `hierarchy`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Sites list | Sites with halls, racks, devices, power | DCIM-011 | API-INV-01, API-INV-02 | P1 |
| Hierarchy | Site → floor → hall → row → rack → device → components tree | DCIM-001 | API-INV-01…04; DC-STORE extensions | P1 |

#### Racks (`racks`, `floorplan`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Racks list | Rack, hall, U used, budget, draw, type, condition, CR chip | DCIM-002, DCIM-022 | API-INV-02; DC-STORE extensions; API-OAP-01 | P1 |
| Floor plan | Per hall grid; colour by Thermal / Density / Tenant (draw vs contracted); free cells open New rack; amber CR marker; planned racks as dashed ghosts | DCIM-007, DCIM-024 | DC-STORE; API-OAP-01; API-BSS-02 (contracted kW, Colo); API-ITSM-06 | P1 / P2 |
| New rack | Form with CR section | DCIM-012, DCIM-020 | API-INV-07; API-ITSM-08 | P1 |
| Tenant gear (Colo) | Tenant cabinets shown as opaque blocks with owner and contracted kW, never polled | DCIM-028 | API-INV-02; API-BSS-02 | P1 |

#### Devices (`devices`, `explorer`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Devices list | Device, type, rack, U, status, CR chip; row opens the device drawer | DCIM-003, DCIM-019 | API-INV-03; DC-STORE extensions | P1 |
| Install device | U-range validated, budget checked, under a CR | DCIM-012, DCIM-042 | API-INV-07; DC-STORE; API-ITSM-08 | P1 |
| Explorer | Racks / devices, table or tiles, filters, saved views, CSV export | DCIM-026 | API-INV-02, API-INV-03 | P2 |

#### Device drawer (from Devices, rack page)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Components | Ports, power ports with PDU outlet, management, console, bays, optics | DCIM-004 | API-INV-04; DC-STORE extensions | P1 |
| Port actions | Connect to a free same-speed port, trace (cable path), disconnect, edit description / admin state | DCIM-014, DCIM-036, DCIM-009 | DC-STORE cables; API-INV-04 | P1 / P2 |
| Bays | Install / swap / remove modules; a line card adds its ports | DCIM-015 | API-INV-04, API-INV-05 | P2 |
| Move | Another U or rack at the site, budget checked | DCIM-013 | DC-STORE; API-INV-07 | P2 |
| Status | Active / Maintenance / Decommissioning / Planned | DCIM-019 | API-INV-07 | P1 |
| Addresses | Device addresses; assign next free address of a site prefix, set primary, unassign | DCIM-031 | API-IPM-02, API-IPM-03 | P2 |
| Lifecycle | Installed, warranty, vendor support, open RMA | DCIM-035 | API-INV-06; API-ITSM-11 | P1 |
| Link to device page | No third device page; opens the datacenter device page | DCIM-035 | — | P1 |

#### Cabling (`cabling`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Cables list | Data cables (structured route: cord → panel → trunk → ODF → cross-connect → OSP) and power cords; reconciled with LLDP | DCIM-006 | DC-STORE cables; API-OAP-01 (LLDP neighbours) | P1 |
| Cable path | Hop-by-hop path drawer | DCIM-009 | DC-STORE | P1 |
| Cross-connects (Colo) | Meet-me room cross-connects tenant ↔ carrier / tenant, with the order | DCIM-029 | DC-STORE; API-BSS-09 | P1 |

#### Power (`power`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Panels and feeds | Busway A / B per hall or −48 V; rack PDUs; Σ feeds = rack draw | DCIM-005 | DC-STORE power chain; API-OAP-01 | P1 |
| New panel / feed | Rating = V × A (× √3 three-phase) × 0.8, under a CR | DCIM-017 | DC-STORE; API-ITSM-08 | P2 |
| Single points of failure | From the power chain (both cords on A, one-side cabinets…) | DCIM-025 | DC-RM physical | P1 |
| GPU and liquid racks | 4+ PSU GPU nodes, liquid racks with CDU | DCIM-030 | DC-STORE; API-INV-03 | P1 |

#### Catalogue (`types`) and Device type page `/dcim/types/:id`
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Device / module types | Vendor and model from Inventory; datacenter templates (U, typical W, ports, power ports) kept here | DCIM-010 | API-INV-05; DC-STORE templates | P1 |
| Import JSON, new module type, component templates | On the catalogue and type page | DCIM-010 | DC-STORE | P2 |

#### Changes (`changes`)
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Change board | Every CR at the scope with racks / devices it touches, DCIM work, Execute; views ready / awaiting / in progress / soon / done / all; Plans in review | DCIM-023, DCIM-039 | API-ITSM-06, API-ITSM-07; DC-STORE work items; DC-STORE plans | P2 |
| Notice bar | Ready · awaiting · in progress · plans, under the DCIM header | DCIM-024 | API-ITSM-06 | P2 |
| CR on every edit | Standard (pre-approved template) / open CR at the site / raise new; refused under freeze | DCIM-020 | API-ITSM-06, API-ITSM-08 | P1 |
| Planned work | Saved per CR; executed one or all once approved | DCIM-021, DCIM-041 | DC-STORE; API-ITSM-09 | P2 |
| Raise change request | NewChange form in a drawer, lands in Awaiting approval | DCIM-038 | API-ITSM-08 | P2 |
| Header actions | New rack / Install device on Insights · Sites · Racks; Install on Devices | DCIM-040 | — | P1 |
| Record events | `dco.dcim.record-changed` with before / after and CR; extensions synced to Inventory | DCIM-033, DCIM-032 | API-INV-07 | P1 |
| Invariants | U clash, budget, Σ feeds = draw, cables = links + cords checked on each change | DCIM-037, DCIM-042 | DC-RM physical | P1 |

#### Rack page `/dcim/racks/:id`
| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Elevation | Front / rear with devices, PDUs, cords; drag a device to free units → Move under a CR | DCIM-008, DCIM-013 | DC-STORE; API-INV-03 | P1 / P2 |
| PDUs and cords, cables, panels | Per rack tabs | DCIM-005, DCIM-006 | DC-STORE | P1 |
| Edit / Reserve space / Retire | Edit rack; reserve and release U with reason (Reserved tab); retire empty racks only | DCIM-016, DCIM-018 | DC-STORE; API-INV-07 | P2 |
| Activity and Change requests tabs | Audit lines with CR; CRs touching the rack; "N planned changes" | DCIM-027, DCIM-022 | DC-STORE; API-ITSM-06 | P2 |

### B.22 IP & Network — Insights

**Route** `/ipam` · **Menu** Plan & Build › IP & Network › Insights · **Status** Build — analytics over IP Management API · **Phase** P2

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Prefix utilisation | Bound addresses only, per site / VRF | ANL-030 | API-IPM-01, API-IPM-02 | P2 |
| Exhaustion forecast | Consumed ≥ 90 % / Committed ≥ 75 % or full within 12 months, from growth of recent installs | ANL-031 | API-IPM-01; API-INV-06 | P2 |
| Outside plan | Device addresses outside the site plan as findings | ANL-032 | API-IPM-02; API-INV-03 | P2 |
| Differences | IP Management vs connected DNS / DHCP / IPAM systems | ANL-033 | API-IPM-01 | P2 |
| GPU fabric space | InfiniBand and front-end address space per GPU pod (Neo) | ANL-034 | API-IPM-01 | P2 |
| Management VRF per site | Each site's management space as its own VRF | ANL-035 | API-IPM-01 | P2 |
| IP Space · Routing · Gateways · Registers (prefixes, addresses, VRFs, VLANs, ASNs, FHRP, registers, integrations, CRUD) | Not built — IP Management screens (link) | — | API-IPM-01 | — |

### B.23 Programs & Projects — Insights (Delivery analytics)

**Route** `/delivery` (Insights `overview`, `todo`) · **Menu** Plan & Build › Delivery › Insights · **Status** Build — analytics over Programs & Projects API · **Phase** P2

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Overview dashboard | Sparkline KPIs, health matrix, programme progress, needs attention, throughput, change outcomes, 14-day change calendar, cost curve, next 14 days, activity | ANL-001 | API-PRJ-01, API-PRJ-02, API-PRJ-03; API-ITSM-06 | P2 |
| Project health | Late (finish after target or SPI < 0.90), at risk (CPI < 0.95 or SPI < 0.97), programme RAG | ANL-002 | API-PRJ-02 | P2 |
| Earned value | EV = budget × progress, CPI, SPI, PV / EV / AC curve | ANL-003 | API-PRJ-02 | P2 |
| Plan link | Each project linked to its Planner plan | ANL-004 | API-PRJ-02; DC-STORE plans | P2 |
| Capacity coming online | GPUs (Neo) or cabinets / kW (Colo) by month | ANL-005 | API-PRJ-02; DC-STORE plans | P2 |
| Change orders | Approver by size: ≤ 5 % PM, ≤ 15 % sponsor, else investment committee | ANL-006 | API-PRJ-02 | P2 |
| Risks | Ranked by likelihood × impact, derived risks | ANL-007 | API-PRJ-02 | P2 |
| Programme gates | A project waits until its predecessors are delivered | ANL-008 | API-PRJ-01 | P2 |
| To-do (`todo`) | Items needing action, each linking to the module record | ANL-013 | API-PRJ-02, API-PRJ-03 | P2 |
| Programs · Projects · Work orders · Permits · Design lists; programme, project and work-order pages; New programme / project; receive PO; start / complete work; hand over | Not built — Programs & Projects screens (link) | ANL-013 | API-PRJ-01…05 | — |

### B.24 Commissioning — analytics

**Route** `/delivery?tab=commissioning` · **Menu** Plan & Build › Commissioning · **Status** Build — analytics over Programs & Projects API · **Phase** P2

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Commissioning by level | L1 factory witness → L5 IST per project, in order; L3+ needs installation done | ANL-020 | API-PRJ-04, API-PRJ-03 | P2 |
| Handover-ready | Only when every work order is done and L1–L5 passed | ANL-021 | API-PRJ-03, API-PRJ-04 | P2 |
| Open snags | Per project and level | ANL-022 | API-PRJ-04 | P2 |
| GPU-hall tests | CDU loop and GPU burn-in as named L4 / L5 tests (Neo; to discuss) | ANL-023 | API-PRJ-04 | P2 |
| Run a level, record results | Not built — Programs & Projects (link) | — | API-PRJ-04 | — |

### B.25 Work orders — KPIs

**Route** `/workorders?tab=kpis` · **Menu** Plan & Build › Work orders › Insights · **Status** Build — analytics over Programs & Projects / Field Force Management API · **Phase** P2

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Work orders by state | Planned, Ready, Awaiting change, In progress, Done, Failed | ANL-009 | API-PRJ-03; API-SCM-05 | P2 |
| Process KPIs | Running work and targets for P01–P12; swimlane summary | ANL-010, ANL-017 | API-PRJ-03 | P2 |
| Throughput | Throughput, first-time fix, re-plans per week | ANL-011 | API-PRJ-03 | P2 |
| Blocked by kit | Work orders waiting on a PO, with PO state | ANL-012 | API-PRJ-03, API-PRJ-05 | P2 |
| Remote hands (Colo) | Tenant remote-hands tickets per site | ANL-014 | API-ITSM-11 | P2 |
| My Tasks · Work Orders · Processes (claim, complete with form, retry, instance page, work-order page) | Not built — Programs & Projects / FFM screens (link); shown only as read-outs ANL-015, ANL-016 | ANL-015, ANL-016 | API-PRJ-03 | — |

### B.26 Change management — Overview

**Route** `/changes` (overview) · **Menu** Operations › Change management · **Status** Build — analytics over Services & ITSM Change Management API · **Phase** P2

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Paired widgets | Volume and outcome · Lead time; Open by stage · Approvals and board; Next 14 days · Before the windows; By site · Where changes fail; equal height | ANL-040 | API-ITSM-06, API-ITSM-07 | P2 |
| Failure rule | Failed = rolled back or cited by an incident's leading RCA ("Caused an incident") | ANL-041 | API-ITSM-06; DC-RM rca | P2 |
| Freezes | From open Critical incidents (emergency only) and the peak / year-end freeze; live sites; civil works exempt | ANL-042, ANL-046 | API-ITSM-07; API-ITSM-01 | P2 |
| Conflicts | Overlapping windows on the same devices | ANL-043 | API-ITSM-06 | P2 |
| Policy checks | POL-01…06 (rollback, freeze, hours, SPOF, overlap, overdue review) | ANL-044 | API-ITSM-07; DC-RM physical | P2 |
| Lead time | Normal changes implemented per week | ANL-047 | API-ITSM-06 | P2 |
| Included records | DCIM-raised changes, delivery CRs, preventive maintenance of the last 12 weeks | ANL-045, ANL-048 | API-ITSM-06, API-ITSM-10; API-PRJ-03 | P2 |
| Detail table | Needs attention · waiting for review · next 14 days · last 28 days; rows open the change in ITSM | ANL-040 | API-ITSM-06 | P2 |
| Changes list, approvals, calendar, freezes, standard templates, policies, change page, New change | Not built — Services & ITSM Change Management (link); the datacenter change page's DCIM work panel is built (DCIM-041) | DCIM-041 | API-ITSM-06…09 | — |

### B.27 Compliance

**Route** `/compliance?tab=…&fw=&cst=&pol=&q=` · **Menu** Admin › Compliance · **Status** Build (datacenter-specific) · **Phase** P3

| Tab | Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- | --- |
| Overview | Posture dashboard | Overall ring, status tiles, framework cards, controls needing work, policy results, evidence due, latest decisions | CMP-010 | DC-RM compliance | P3 |
| Frameworks & controls | Control mapping | ISO/IEC 27001, ISO/IEC 22237, TIA-942, SOC 2 controls mapped to the policies that test them; status per control; quick filters framework / status | CMP-003, CMP-004, CMP-019 | DC-STORE compliance | P3 |
| Frameworks & controls | Attest | Attest a manual control (date, owner, evidence); Evidence due after a year | CMP-008 | DC-STORE | P3 |
| Policies | Policy list | CP-01…09 with resources checked, violations, outcome; Rego source; switch on / off (off = Not assessed) | CMP-001, CMP-002, CMP-005, CMP-006 | DC-RM compliance; API-INV-03; API-OAP-01; API-IPM-02; API-ITSM-07, API-ITSM-10 | P3 |
| Violations | Violation list | Policy, resource, site, message, Blocked / Warned, change link | CMP-018, CMP-011 | DC-RM compliance; API-ITSM-07 | P3 |
| Decision records | Decisions | Allow / deny / warn with the OPA-style input | CMP-007 | DC-STORE | P3 |
| Audit | Audit trail | Every policy, control and attestation change | CMP-017 | DC-STORE | P3 |
| All | New policy / control / framework | Forms | CMP-009 | DC-STORE | P3 |
| All | Scope and feeds | Datacenter scope; posture findings from Security Ops; decisions to SIEM | CMP-012, CMP-014, CMP-015 | API-SOC-04; NB-10 | P3 |
| All | Evidence export, tenant view | Evidence pack, tenant-facing controls (to discuss) | CMP-013, CMP-016 | DC-STORE | P3 |

### B.28 Customization

**Route** `/customization` · **Menu** Admin › Customization · **Status** Not built — use Platform Engineering Customization · **Phase** —

| Feature | What the user sees / does | FR | Data from | Phase |
| --- | --- | --- | --- | --- |
| Custom fields and tags | Defined in Platform Engineering; SynapseDC reads them and shows filled counts / tag rules on datacenter entities | XC-020 | API-PEN-03 | P2 |
| Fields / tags admin screens | Not built — Platform Engineering screen (link) | — | API-PEN-03 | — |

### B.29 Summary — built vs consumed

| Screen | Status | Tabs / features built | Modules consumed (API ids) | Phase |
| --- | --- | --- | --- | --- |
| Command Center | Build | Hero (health, numbers, areas incl. GPU fleet), map, datacenter column, What is happening · Who is affected · Recommendations, Plan & build strip and lens | API-OAP-01/03/04, API-ALR-01, API-ITSM-01/06, API-BSS-01/03, API-OPS-02, API-INV-01 | P1 / P2 |
| Datacenters list | Build | Analytics strip, list ⇄ tiles, condition / region filters | API-INV-01, API-ALR-01, API-ITSM-01, API-OAP-01/04 | P1 |
| Datacenter page | Build | Overview (layout / twin, Needs attention, Metrics, Ops log), Facility sub tabs, Infrastructure (Equipment, GPU Fleet, Topology, Space & ports, Assets), Business impact (Customers / Tenants, Revenue), Access & security | API-INV-01…06, API-OAP-01…04, API-ALR-01, API-ITSM-01/06/11, API-BSS-01…03/09, API-OPS-02, API-ALR-06 | P1 / P2 |
| Device page | Build | Overview, 3D view, Hardware & interfaces, Power & cabling, GPUs · DCGM, Links, Impact, Alerts | API-INV-03/04/06, API-OAP-01/02, API-ALR-01, API-BSS-03, API-IPM-02 | P1 / P2 |
| Customer page | Build | Identity header, verdict, six tiles, what is impacting, where served, service grid, cross-connects / remote hands (Colo) | API-BSS-01…03/09, API-ITSM-01/11 | P1 |
| Facilities | Build | Power & backup, Cooling, Environment, Single points of failure, Maintenance & alarms | API-OAP-01…04, API-INV-02/06, API-ALR-01, API-ITSM-06/10, API-SCM-03 | P1 / P2 |
| GPU Fleet | Build (Neo) | Jobs needing attention, Clusters, Jobs, Nodes, Telemetry, GPU models, Network rails, Cooling & power, Where to place | API-OAP-01…04, API-OPS-02, API-INV-03, API-ALR-01, API-ITSM-01, API-BSS-02/03 | P1 / P2 |
| Alerts | Build — datacenter scope over System Alerts | Strip, scoped list, acknowledge, correlate into incident | API-ALR-01…05/07 | P1 |
| Incidents (datacenter view) | Build — enrichment over Services & ITSM | Impact, RCA, actions, verification, revenue, on call & communications; the record and work notes stay in ITSM | API-ITSM-01…04/13, API-ALR-01/06, API-BSS-03/06 | P1 |
| Problems | Build — enrichment over Services & ITSM | Problems grouped by cause (optics lot) with linked incidents | API-ITSM-05 | P2 |
| Revenue Impact | Build | Strip, two answer cards, Issues · Customers · Datacenters · Causes & trend · One failure away, drawer, how it is calculated | API-BSS-01…03/07, API-ITSM-01, API-ALR-01 | P1 |
| Security Ops | Build — datacenter layer over Ops Toolkit Security Ops | Insights, Detections, Cases, Threat coverage, Vulnerabilities, Hardening & drift, OT security, Physical security | API-SOC-01…07, API-ITSM-06, API-INV-03 | P2 |
| Security data sources | Build — datacenter view over Security Ops | Sensors per site, coverage gaps | API-SOC-05, API-INV-03 | P2 |
| Capacity | Build | Insights (overview, financial), Power (power, PUE & energy, Power economics), Space, Network, Compute (incl. Where to place), Reservations | API-OAP-01/03, API-INV-02/03, API-IPL-01/02, API-OPS-02/04, API-BSS-02/03/08, API-ALR-03, API-ITSM-03, API-PRJ-02, API-SCM-04, API-AIF-01 | P2 |
| Planner | Build | Insights hub, Plans, Templates, Benchmarks, wizard, plan page (12 tabs + What-if), review portal, Send for review | API-INV-01/03/06, API-SCM-01…04, API-PRJ-02/05/06/07, API-IPL-02, API-IPM-03, API-INV-07, API-PEN-01 | P2 |
| DCIM | Build — datacenter extensions over Inventory | Insights, Sites + Hierarchy, Racks + Floor plan, Devices + Explorer, device drawer, Cabling, Power, Catalogue, Changes board, rack page, type page | API-INV-01…08, API-OAP-01, API-IPM-02/03, API-ITSM-06…09/11, API-BSS-02/09 | P1 / P2 |
| IP & Network | Build — Insights only | Utilisation, exhaustion forecast, outside plan, differences, GPU fabric, management VRF | API-IPM-01/02, API-INV-03/06 | P2 |
| Delivery (Programs & Projects) | Build — Insights only | Overview dashboard, health, EV, gates, change orders, risks, to-do | API-PRJ-01…03/05, API-ITSM-06 | P2 |
| Commissioning | Build — analytics only | Levels, handover-ready, snags | API-PRJ-03/04 | P2 |
| Work orders | Build — KPIs only | States, process KPIs, throughput, blocked by kit, remote hands | API-PRJ-03/05, API-SCM-05, API-ITSM-11 | P2 |
| Change management | Build — Overview only | Paired widgets, freezes, conflicts, policies, lead time, detail table | API-ITSM-06/07/10, API-ITSM-01, API-PRJ-03 | P2 |
| Compliance | Build | Overview, Frameworks & controls, Policies, Violations, Decision records, Audit | API-SOC-04, API-INV-03, API-OAP-01, API-IPM-02, API-ITSM-07/10 | P3 |
| Customization | Not built — Platform Engineering | — (reads custom fields and tags) | API-PEN-03 | — |
| Shell (menu, switches, search, Opstral AI, embed) | Build | Cross-cutting chapter 7.12 | API-PEN-01/02, API-AIF-01/02 | P1 / P2 |

---

## Appendix C — Expected API responses from the existing modules

For every API SynapseDC consumes (section 3.5), this appendix gives the call, who calls it, the request, an example of the expected response and the fields SynapseDC needs (M = must, O = optional). Paths are illustrative: each module team owns its real API, and an adapter in SynapseDC maps the real response onto these fields. A field a module cannot provide goes to the API gap list (ARCH-004) — SynapseDC never builds a local substitute. Times are RFC 3339 UTC; ids are the module's stable ids; money is `{ amount, currency }`.

### C.1 Telemetry — OAP ingestion / consumer services (ClickHouse)

**Module:** OAP telemetry ingestion and consumer microservices, on ClickHouse. **SynapseDC uses it for** every live figure, 24 h trend, history and freshness. **Screens:** Command Center, Datacenters (Metrics, Equipment, layout overlays), Facilities, GPU Fleet, Capacity and power economics, device page.

> Paths are illustrative — the module team owns the real API; an adapter in SynapseDC maps the real response to these fields. A missing field goes to the API gap list (ARCH-004). SynapseDC never queries ClickHouse directly (ARCH-009); every read goes through the consumer API, every write through the ingestion API.

**Request shape used by API-OAP-01…03.** A query names one metric, a label match and the time scope. It is neutral about the query language (PromQL, SQL or the service's own DSL).

```json
{ "metric": "dco_gpu_sm_active_ratio",
  "match": { "site": "TX-DC-020", "cluster": "CL-TX-020-A" },
  "start": "2026-10-27T09:00:00Z", "end": "2026-10-28T09:00:00Z", "step": "1h",
  "agg": { "fn": "avg", "by": ["device"] } }
```

**Metrics SynapseDC reads (examples, the full list is the metric catalogue, API-OAP-06)**

| Metric | Unit | Labels | Source | Used by |
| --- | --- | --- | --- | --- |
| `dco_ups_output_source` | enum (online, battery, bypass) | site, device | UPS-MIB `upsOutputSource` | FAC-001, CC-004 |
| `dco_ups_runtime_seconds` | s | site, device | UPS-MIB `upsEstimatedMinutesRemaining` × 60 | FAC-006, ride-through |
| `dco_ups_load_ratio` | 0–1 | site, device | UPS-MIB `upsOutputPercentLoad` | FAC-002 |
| `dco_power_pdu_draw_kw` | kW | site, room, rack, device, side (A / B), phase | PDU MIB / Redfish | FAC-010, rack power |
| `dco_power_feed_kw` | kW | site, feed | Modbus meter | power path, PUE |
| `dco_env_inlet_temp_celsius` | °C | site, room, rack, height | rack sensor | SITE-013, heat map |
| `dco_env_humidity_ratio` | % RH | site, room, zone | zone sensor | FAC-020 |
| `dco_cooling_supply_temp_celsius`, `dco_cooling_return_temp_celsius`, `dco_cdu_flow_lpm` | °C, L/min | site, unit | BACnet / Modbus | FAC-015, CDU loop |
| `dco_if_in_bits_total`, `dco_if_out_bits_total`, `dco_if_oper_up` | bit, 0/1 | site, device, port | IF-MIB / gNMI | links, utilisation |
| `dco_gpu_util_ratio`, `dco_gpu_sm_active_ratio`, `dco_gpu_tensor_active_ratio` | 0–1 | site, cluster, device, gpu | DCGM `GPU_UTIL`, `PROF_SM_ACTIVE`, `PROF_PIPE_TENSOR_ACTIVE` | GPU-010 |
| `dco_gpu_temp_celsius`, `dco_gpu_hbm_temp_celsius`, `dco_gpu_power_watts` | °C, W | site, cluster, device, gpu | DCGM `GPU_TEMP`, `MEMORY_TEMP`, `POWER_USAGE` | GPU-010, power cost |
| `dco_gpu_xid_last`, `dco_gpu_ecc_dbe_total`, `dco_gpu_row_remap_pending`, `dco_gpu_nvlink_errors_total`, `dco_gpu_throttle_reasons` | code, count, bool, bitmask | site, device, gpu | DCGM | GPU faults |
| `dco_ib_port_state`, `dco_ib_symbol_errors_total` | enum, count | site, device, rail | UFM / sysfs | network rails |

#### API-OAP-01 Query latest values

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /oap/v1/query/instant` | Read | CC-001…004, SITE-012, FAC-001…010, GPU-010 | on screen load and every 30 s while open |

**Request:** `metric` (one or a list), `match` labels, optional `at` (default now).

**Expected response:**
```json
{ "at": "2026-10-28T09:14:30Z",
  "series": [
    { "metric": "dco_ups_output_source", "labels": { "site": "IL-DC-009", "device": "UPS-2" }, "value": "battery", "ts": "2026-10-28T09:14:22Z", "received": "2026-10-28T09:14:23Z" },
    { "metric": "dco_ups_runtime_seconds", "labels": { "site": "IL-DC-009", "device": "UPS-2" }, "value": 1140, "ts": "2026-10-28T09:14:22Z", "received": "2026-10-28T09:14:23Z" } ] }
```

**Fields SynapseDC needs:**

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `series[].metric` | string | M | mapping to the screen figure |
| `series[].labels` | object | M | placement on site / room / rack / device / port / gpu |
| `series[].value` | number or string | M | the figure |
| `series[].ts` | RFC 3339 | M | source time; freshness |
| `series[].received` | RFC 3339 | O | receipt time; collector lag |

#### API-OAP-02 Query range series

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /oap/v1/query/range` | Read | SITE-014 (24 h zone trends), FAC-003 (24 h load), GPU-012 (node 24 h history), CAP-009 (12 months) | on open; charts |

**Request:** `metric`, `match`, `start`, `end`, `step` (`1m`, `5m`, `1h`, `1d`), optional `agg`.

**Expected response:**
```json
{ "step": "1h",
  "series": [
    { "metric": "dco_gpu_power_watts", "labels": { "site": "TX-DC-020", "device": "GPU-014" }, "agg": "sum",
      "points": [["2026-10-27T10:00:00Z", 5620], ["2026-10-27T11:00:00Z", 5710], ["2026-10-28T09:00:00Z", 2140]] } ] }
```

**Fields SynapseDC needs:**

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `series[].labels` | object | M | which device / rack / zone |
| `series[].points[]` | [time, number] | M | charts, sparklines, forecasts |
| `step` | duration | M | axis and gaps |
| `series[].agg` | string | O | shows a roll-up was applied |

#### API-OAP-03 Aggregate: roll-ups, top-N, histogram

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /oap/v1/query/aggregate` | Read | GPU-013 (fleet histograms, per-counter leaders), SITE-015 (hottest racks), FAC-011 (rack power list), CAP-012 (energy / day) | on open |

**Request:** `metric`, `match`, `start`, `end`, `agg.fn` (`avg`, `max`, `sum`, `p95`, `histogram`, `topk`), `agg.by` labels, `agg.k` or `agg.buckets`.

**Expected response (top-N):**
```json
{ "fn": "topk", "k": 3, "by": ["rack"],
  "rows": [
    { "labels": { "site": "MH-DC-001", "room": "Hall 2", "rack": "R-2-07" }, "value": 31.4 },
    { "labels": { "site": "MH-DC-001", "room": "Hall 2", "rack": "R-2-11" }, "value": 30.9 },
    { "labels": { "site": "MH-DC-001", "room": "Hall 1", "rack": "R-1-03" }, "value": 29.8 } ] }
```
**Expected response (histogram):**
```json
{ "fn": "histogram", "metric": "dco_gpu_temp_celsius",
  "buckets": [ { "le": 50, "count": 212 }, { "le": 70, "count": 1630 }, { "le": 85, "count": 140 }, { "le": "+Inf", "count": 6 } ] }
```

**Fields SynapseDC needs:**

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `rows[].labels`, `rows[].value` | object, number | M | ranked lists, roll-ups |
| `buckets[].le`, `buckets[].count` | number / "+Inf", integer | M (histogram) | fleet distributions |

#### API-OAP-04 Freshness

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /oap/v1/freshness?site=&device=&source=` | Read | DATA-003, ALM-029, SITE-003 (collector chip), Equipment "unmonitored" | every 60 s |

**Expected response:**
```json
{ "items": [
  { "site": "IL-DC-009", "device": "PDU-R-2-07-A", "source": "snmp", "interval": "60s",
    "lastSample": "2026-10-28T09:13:58Z", "lastReceived": "2026-10-28T09:13:59Z", "state": "fresh" },
  { "site": "IL-DC-009", "device": "CRAH-04", "source": "bacnet", "interval": "60s",
    "lastSample": "2026-10-28T08:52:10Z", "lastReceived": "2026-10-28T08:52:11Z", "state": "stale" } ] }
```

**Fields SynapseDC needs:**

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `site`, `device`, `source` | string | M | which object is fresh / stale |
| `interval` | duration | M | stale = older than two intervals |
| `lastSample`, `lastReceived` | RFC 3339 | M | freshness, unmonitored after 15 min |
| `state` | fresh / stale / silent | O | the service's own verdict; SynapseDC applies DATA-003 if absent |

#### API-OAP-05 Ingest metrics

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| OTLP `POST /oap/v1/ingest/otlp` or Prometheus remote write `POST /oap/v1/ingest/prom` | Write | the on-site collector (INT-28), never a screen | continuous, per polling interval (NFR-004) |

**Request:** OTLP metrics or remote-write protobuf with the labels above; mTLS client certificate of the collector.

**Expected response:** `204 No Content`, or
```json
{ "accepted": 18240, "rejected": 2, "errors": [ { "metric": "dco_power_pdu_draw_kw", "reason": "label 'rack' missing" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `accepted`, `rejected` | integer | O | collector health, monitoring gaps |
| `errors[]` | object | O | mapping fixes at the collector |

#### API-OAP-06 Metric catalogue

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /oap/v1/metrics?prefix=dco_` (read); `PUT /oap/v1/metrics/{name}` (register) | Read / write | collector configuration, INTG-057, info bubbles | on deployment; on change |

**Expected response:**
```json
{ "items": [ { "name": "dco_env_inlet_temp_celsius", "unit": "Cel", "type": "gauge", "labels": ["site","floor","room","rack","height"],
               "interval": "60s", "retention": { "raw": "30d", "5m": "395d", "1h": "5y" }, "description": "Rack inlet temperature" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `name`, `unit`, `type`, `labels` | string, string, gauge / counter / enum, list | M | query building, units on screen |
| `interval` | duration | M | freshness rule |
| `retention` | object | O | how far back charts can go |

---

### C.2 Ops Toolkit — System Alerts

**Module:** Opstral Ops Toolkit System Alerts. **SynapseDC uses it for** the alarm record (raise, clear, acknowledge), its datacenter scope and placement tags, and paging / on-call. **Screens:** Command Center, Datacenters (Needs attention), Alerts list, device page Alerts tab, datacenter incident view, Facilities, GPU Fleet.

#### API-ALR-01 List alerts

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /alerts?site=&device=&state=&severity=&since=&tag.scope=` | Read | ALM-012 (Alerts list), CC-005, SITE-008, device Alerts tab | on open; refreshed by API-ALR-07 events |

**Expected response:**
```json
{ "items": [
  { "id": "ALM-000123", "code": "UPS_ON_BATTERY", "title": "UPS-2 on battery", "description": "Utility feed A lost; ATS moved load to feed B",
    "severity": "critical", "state": "active", "source": "Power", "type": "upsOnBattery",
    "site": "IL-DC-009", "device": "UPS-2", "resource": null, "start": "2026-10-28T07:38:12Z", "lastSeen": "2026-10-28T09:14:22Z", "count": 3,
    "ackBy": null, "incidentId": "INC-0003",
    "tags": { "scope": "site", "category": "Facility", "rackId": null, "faultId": null, "symptomOf": null } },
  { "id": "ALM-000188", "code": "LINK_DOWN", "title": "xe-0/0/3 down", "severity": "major", "state": "acknowledged", "source": "Interface", "type": "linkDown",
    "site": "VA-DC-001", "device": "BDR-01", "resource": "xe-0/0/3", "linkId": "LNK-0412", "start": "2026-10-28T07:31:05Z", "lastSeen": "2026-10-28T07:31:05Z", "count": 1,
    "ackBy": "noc.lead@operator.com", "incidentId": "INC-0001",
    "tags": { "scope": "edge", "category": "Network", "node": null, "hops": 1 } } ],
  "next": null }
```

**Fields SynapseDC needs:**

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `code`, `title`, `description` | string | M | list, detail, de-duplication key |
| `severity` | critical / major / minor / warning | M | alarm words, ordering |
| `state` | active / acknowledged / cleared | M | open counts |
| `source` | Interface / CPU / Link / Environment / Power / Cooling / Protocol / Security / Discovery | M | category, revenue domain |
| `type` | string | M | severity mapping, correlation |
| `site`, `device`, `resource`, `linkId` | string | M / O / O / O | placement, scope |
| `start`, `lastSeen`, `count` | RFC 3339, RFC 3339, integer | M | age, flapping, SLA |
| `ackBy`, `incidentId` | string | O | acknowledged by, linked incident |
| `tags.scope`, `tags.category`, `tags.rackId`, `tags.faultId`, `tags.symptomOf`, `tags.node`, `tags.hops` | string / integer | M (scope, category); O (rest) | **written by SynapseDC** (API-ALR-05); datacenter counts, rack-level faults, downstream symptoms |

#### API-ALR-02 Get alert

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /alerts/{id}` | Read | alarm drawer, ALM-002, incident evidence | on open |

**Expected response:** the API-ALR-01 item plus the raw event and history.
```json
{ "id": "ALM-000188", "severity": "major", "state": "acknowledged",
  "raw": { "proto": "snmp-trap", "oid": "1.3.6.1.6.3.1.1.5.3", "varbinds": { "ifIndex": 515, "ifDescr": "xe-0/0/3" }, "receivedAt": "2026-10-28T07:31:05.410Z" },
  "history": [ { "at": "2026-10-28T07:31:05Z", "event": "raised" }, { "at": "2026-10-28T07:33:40Z", "event": "acknowledged", "by": "noc.lead@operator.com" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `raw` | object | M | audit, replay, RCA evidence |
| `history[]` | event list | O | flapping (> 3 raise / clear in 15 min), timeline |

#### API-ALR-03 Raise / update / clear alert

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /alerts` (raise or update by identity) · `POST /alerts/{id}/clear` | Write | collector normalisation (ALM-001), ALM-029 monitoring gaps, ALM-030 GPU alarms, ALM-032 power findings, ALM-038 operator servers | on each event / threshold crossing |

**Request:**
```json
{ "identity": "dcgm|GPU-014|gpu3|XID", "code": "GPU_XID_79", "title": "GPU fell off the bus (Xid 79)", "severity": "critical",
  "source": "GPU", "type": "xid79", "site": "TX-DC-020", "device": "GPU-014", "resource": "gpu3",
  "deviceTime": "2026-10-28T06:02:11Z", "raw": { "proto": "dcgm", "field": "DCGM_FI_DEV_XID_ERRORS", "value": 79 } }
```
**Expected response:**
```json
{ "id": "ALM-000231", "created": true, "count": 1, "state": "active" }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id` | string | M | link to incident, tags |
| `created` | boolean | M | new alarm vs repeat (de-duplication by `identity`) |
| `count`, `state` | integer, string | O | repeat count, current state |

#### API-ALR-04 Acknowledge alert

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /alerts/{id}/ack` | Write | Alerts list, Needs attention, incident view | user action |

**Request:** `{ "by": "noc.engineer@operator.com", "note": "Electrician on site" }` · **Expected response:** `{ "id": "ALM-000123", "state": "acknowledged", "ackBy": "noc.engineer@operator.com", "ackAt": "2026-10-28T07:41:02Z" }`

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `state`, `ackBy`, `ackAt` | string, string, RFC 3339 | M | unacked counts, response SLA |

#### API-ALR-05 Tag alert with datacenter context

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `PATCH /alerts/{id}/tags` | Write (**SynapseDC-owned fields**) | ALM-004…008 (scope, placement), BRULE-ALM rack-level / shared fault | after normalisation and on topology change |

**Request:**
```json
{ "scope": "edge", "category": "Network", "dcId": "VA-DC-001", "rackId": null, "faultId": null, "symptomOf": null,
  "placement": { "site": "VA-DC-001", "floor": "F1", "room": "MMR", "rack": "R-MMR-02", "device": "BDR-01", "port": "xe-0/0/3" } }
```
**Expected response:** `{ "id": "ALM-000188", "tags": { "scope": "edge", "category": "Network", "...": "..." }, "updated": "2026-10-28T07:31:06Z" }`

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `tags` (echo) | object | M | confirms the tags are stored on the alert record, so other modules see the datacenter scope |

#### API-ALR-06 On-call, paging and escalation

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /oncall?region=&at=` · `POST /pages` · `POST /pages/{id}/escalate` | Read / write | ALM-017 (on-call rota), Needs attention "On call now", incident "On call & communications" | read every 5 min; page on incident open / severity change |

**Expected response (`GET /oncall`):**
```json
{ "region": "Midwest", "at": "2026-10-28T09:15:00Z",
  "rota": [ { "role": "NOC shift lead", "name": "Dana Ruiz", "tier": 1, "shift": "Day 07:00–19:00", "escalateAfterMin": 15, "covers": "IL-DC-009, OH-DC-011" },
            { "role": "Facility engineer", "name": "Sam Patel", "tier": 2, "shift": "Day", "escalateAfterMin": 30, "covers": "IL-DC-009" } ] }
```
**Expected response (`POST /pages`):**
```json
{ "pageId": "PG-5531", "incidentId": "INC-0003", "paged": [ { "who": "Dana Ruiz", "role": "NOC shift lead", "at": "2026-10-28T07:38:40Z", "via": "App" } ],
  "nextEscalation": { "who": "Sam Patel", "role": "Facility engineer", "at": "2026-10-28T07:53:40Z" } }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `rota[].role`, `name`, `tier`, `shift`, `escalateAfterMin`, `covers` | string, string, 1–3, string, integer, string | M | on call now, paging chain |
| `paged[].who`, `role`, `at`, `ack`, `via` | string, string, time, time, Phone / SMS / App | M (ack O) | incident paging panel |
| `nextEscalation` | object or null | M | next escalation time |

#### API-ALR-07 Alert events

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| webhook / Kafka topic `alerts.v1`, types `alert.raised`, `alert.updated`, `alert.acknowledged`, `alert.cleared` | Read (subscribe) | correlation engine (ALM-014), every open screen refresh | push |

**Expected event:** CloudEvents envelope, `subject` = alert id, `data` = the API-ALR-01 item.

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `type`, `subject`, `time`, `sequence` | string | M | de-duplication and order per alert |
| `data` | alert | M | correlation within the window, incident open ≤ 60 s |

---

### C.3 Ops Toolkit — Security Ops

**Module:** Opstral Ops Toolkit Security Ops (detections, cases, rules, vulnerabilities, sensors on its ClickHouse / OCSF tables). **SynapseDC uses it for** the datacenter Security Ops views and adds datacenter context. **Screens:** Security Ops Insights, Detections, Cases, Threat coverage, Vulnerabilities, Hardening & drift, OT security, Physical security; Admin → Security data sources; datacenter Access tab links.

#### API-SOC-01 Detections

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /secops/detections?site=&rule=&state=&since=` · `GET /secops/detections/{id}` | Read | SEC-001…007, SEC-033 | on open; events |

**Expected response:**
```json
{ "items": [
  { "id": "DET-10442", "ruleId": "SR-060", "title": "Badge-in followed by unapproved ACL change on WAN edge", "domain": "Cross-domain", "severity": "Critical",
    "state": "Escalated", "disposition": null, "at": "2026-10-28T02:11:40Z", "lastAt": "2026-10-28T02:19:05Z", "count": 2,
    "site": "VA-DC-001", "asset": "BDR-01", "assetKind": "Router", "techniques": ["T1562.004", "T0889"], "sensor": "TACACS+ / Oxidized",
    "ocsf": "Detection Finding (2004)", "summary": "Config commit 4 min after an after-hours badge-in at MMR door", "actor": "j.doe", "srcIp": "10.1.40.22",
    "caseId": "SEC-0001", "assignee": "soc.analyst@operator.com", "event": { "commit": "r4471", "lines": 3 } } ],
  "next": null }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `ruleId`, `title`, `domain`, `severity`, `state`, `disposition` | string / enums (Critical / High / Medium / Low; New / Investigating / Escalated / Closed; True positive / False positive / Benign) | M (disposition O) | queue, triage |
| `at`, `lastAt`, `count` | time, time, integer | M | ageing, MTTA |
| `site`, `asset`, `assetKind` | string | M | datacenter scope, context join |
| `techniques[]` | ATT&CK ids | M | coverage |
| `sensor`, `ocsf`, `summary`, `actor`, `srcIp`, `dstIp`, `event` | string / object | O | detail drawer |
| `caseId`, `assignee` | string | O | case link |
| context (room, rack, owner, tenant, criticality, zone, covering CR, who was on site) | object | — | **added by SynapseDC** from DC-RM (API-SOC-06) |

#### API-SOC-02 Cases

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /secops/cases?site=&phase=` · `GET /secops/cases/{id}` · `PATCH /secops/cases/{id}` | Read / write | SEC-008…011, SEC-034 | on open; user action |

**Expected response:**
```json
{ "id": "SEC-0002", "title": "Crypto-mining on idle GPU nodes", "severity": "High", "phase": "Containment", "site": "TX-DC-020",
  "opened": "2026-10-27T22:40:00Z", "firstEvent": "2026-10-27T21:58:00Z", "acked": "2026-10-27T22:46:00Z", "slaDue": "2026-10-28T02:40:00Z", "closed": null,
  "owner": "soc.lead@operator.com", "detectionIds": ["DET-10390", "DET-10391"], "techniques": ["T1496"], "domain": "Compute", "playbookId": "PB-04",
  "steps": [ { "phase": "Containment", "title": "Cordon nodes in the scheduler", "auto": false, "done": true, "by": "ai.infra@operator.com", "at": "2026-10-27T23:05:00Z", "system": "Slurm" } ],
  "notes": [ { "at": "2026-10-27T23:10:00Z", "by": "soc.lead@operator.com", "text": "Miner image pulled from a public registry" } ],
  "assets": ["GPU-031", "GPU-032"], "incidentId": null, "outcome": null }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `title`, `severity`, `phase` (Detection & analysis / Containment / Eradication / Recovery / Post-incident / Closed) | string / enum | M | case board, NIST 800-61 phases |
| `opened`, `firstEvent`, `acked`, `closed`, `slaDue` | time | M (closed O) | MTTA, MTTR, Respond score |
| `detectionIds[]`, `techniques[]`, `assets[]`, `site`, `domain` | list / string | M | links, coverage, site score |
| `steps[]`, `notes[]`, `playbookId` | list | O | case timeline, playbook progress |
| `incidentId`, `outcome` | string | O | link to the ITSM incident |

#### API-SOC-03 Rules

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /secops/rules` · `PATCH /secops/rules/{id}` (status, enabled) | Read / write | SEC-016 (rules), SEC-013 (ATT&CK coverage) | on open; user action |

**Expected response:**
```json
{ "items": [ { "id": "SR-002", "title": "Running config changed with no covering change request", "domain": "Network", "matrix": "Enterprise",
  "techniques": ["T1562.004"], "level": "High", "status": "Stable", "enabled": true, "sensors": ["Oxidized", "TACACS+"],
  "sigma": "title: Unapproved config change\nlogsource: {product: oxidized}\n...", "sql": "SELECT … FROM ocsf_config_state WHERE …",
  "hits7d": 14, "tp7d": 3, "fp7d": 2, "version": 4, "updated": "2026-10-20T10:00:00Z", "by": "soc.engineer@operator.com", "ocsf": "Device Config State Change (5019)" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `title`, `domain`, `matrix`, `techniques[]`, `level`, `status`, `enabled` | string / enum / list / bool | M | coverage matrix, rule list |
| `sigma`, `sql`, `version`, `updated`, `by` | string / integer / time | M | rule detail, change history |
| `hits7d`, `tp7d`, `fp7d` | integer | M | firing rate, precision |
| `sensors[]`, `ocsf` | list, string | O | data-source coverage |

#### API-SOC-04 Vulnerabilities and advisories

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /secops/vulnerabilities?site=&ssvc=` · `GET /secops/advisories/{id}` · `PATCH /secops/vulnerabilities/{id}` (state, note, changeId) | Read / write | SEC-018…020 | daily; user action |

**Expected response:**
```json
{ "items": [ { "id": "VUL-2201", "advisoryId": "SA-2026-0141", "title": "BMC web server auth bypass", "asset": "GPU-014-BMC", "assetKind": "BMC",
  "site": "TX-DC-020", "zone": "Management", "current": "2.41", "fixedIn": "2.44", "cvss": 9.1, "epss": 0.62, "kev": true, "ssvc": "Act",
  "due": "2026-10-30T00:00:00Z", "state": "Remediation planned", "changeId": "CHG-2214" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `advisoryId`, `title`, `asset`, `assetKind`, `site`, `zone` | string | M | list, scope |
| `cvss` (v4), `epss`, `kev`, `ssvc` (Act / Attend / Track* / Track) | number / bool / enum | M | prioritisation |
| `current`, `fixedIn`, `due`, `state` (Open / Remediation planned / Risk accepted), `changeId` | string / time / enum | M (changeId O) | remediation tracking |

#### API-SOC-05 Security data sources

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /secops/sources?site=` | Read | Admin → Security data sources, SEC-024 (coverage gaps) | every 5 min |

**Expected response:**
```json
{ "items": [ { "id": "SRC-07", "name": "Network device config backups", "sensor": "Oxidized", "collector": "OTel collector VA-DC-001",
  "domain": "Network", "ocsf": ["Device Config State Change"], "table": "ocsf_config_state", "covered": 41, "expected": 44,
  "eps": 0.4, "gbDay": 0.02, "hotDays": 30, "coldDays": 365, "lastEvent": "2026-10-28T09:02:00Z", "state": "Healthy", "gap": "3 devices not discovered" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `name`, `sensor`, `domain`, `table`, `ocsf[]` | string / list | M | sources list |
| `covered`, `expected` | integer | M | coverage % and gaps |
| `eps`, `gbDay`, `hotDays`, `coldDays` | number | O | volume and retention |
| `lastEvent`, `state` (Healthy / Lagging / Silent), `gap` | time / enum / string | M (gap O) | silent-source findings |

#### API-SOC-06 Write datacenter context and physical exceptions

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `PUT /secops/dictionaries/{name}` · `POST /secops/events/physical` | Write (**SynapseDC-owned data**) | SEC-033, SEC-007 | dictionaries hourly and on change; exceptions as they occur |

**Request (dictionary row):**
```json
{ "name": "dc_asset_context", "rows": [ { "asset": "BDR-01", "site": "VA-DC-001", "room": "MMR", "rack": "R-MMR-02", "owner": "Network operations",
  "tenant": null, "criticality": "Crown jewel", "zone": "Network", "changeWindows": [ { "changeId": "CHG-2001", "from": "2026-10-26T22:00:00Z", "to": "2026-10-27T02:00:00Z" } ] } ] }
```
**Request (physical exception):** `{ "id": "SEC-VA-DC-001-014", "kind": "Tailgating", "site": "VA-DC-001", "door": "MMR mantrap", "at": "2026-10-28T02:07:12Z", "badge": "B-00412", "severity": "High" }`

**Expected response:** `{ "accepted": 1, "version": "2026-10-28T09:00:00Z" }`

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `accepted`, `version` | integer, string | M | confirms the context the rules join on |

#### API-SOC-07 Triage action

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /secops/detections/{id}/triage` | Write | SEC-004, SEC-032 | user action |

**Request:** `{ "action": "close", "disposition": "False positive", "by": "soc.analyst@operator.com", "note": "Approved change CHG-2001" }` or `{ "action": "escalate", "caseId": null }`
**Expected response:** `{ "id": "DET-10442", "state": "Escalated", "caseId": "SEC-0001", "by": "soc.analyst@operator.com", "at": "2026-10-28T02:30:00Z" }`

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `state`, `disposition`, `caseId`, `by`, `at` | enum / string / time | M (disposition, caseId O) | queue state survives refresh; audit |

---

### C.4 Ops Toolkit — Telemetry, Data, Infra and Fin Ops

**Module:** Opstral Telemetry Ops, Data Ops, Infra Ops, Fin Ops. **SynapseDC uses it for** collector and pipeline health, GPU scheduler jobs and nodes, and cost data. **Screens:** Datacenters header (collector chip), Command Center GPU fleet area, GPU Fleet Jobs / Nodes / Clusters, Capacity → Power economics.

#### API-OPS-01 Pipeline and collector state

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /telemetry-ops/collectors?site=` · `GET /data-ops/pipelines?site=` | Read | SITE-003, ALM-029, INTG-020/021 | every 60 s |

**Expected response:**
```json
{ "items": [ { "id": "COL-IL-DC-009-A", "site": "IL-DC-009", "role": "active", "version": "1.8.2", "state": "up",
  "lastHeartbeat": "2026-10-28T09:14:40Z", "queueDepth": 0, "targets": { "ok": 412, "failing": 3 },
  "jobs": [ { "kind": "snmp", "ok": 220, "failing": 1 }, { "kind": "bacnet", "ok": 18, "failing": 2 } ] } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `site`, `role` (active / standby), `state` (up / stale / down), `lastHeartbeat` | string / enum / time | M | collector chip, monitoring gaps |
| `targets.ok`, `targets.failing`, `jobs[]` | integer / list | M | unmonitored devices per source |
| `queueDepth`, `version` | integer, string | O | buffering during WAN loss |

#### API-OPS-02 Scheduler jobs and nodes

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /infra-ops/scheduler/jobs?site=&cluster=&state=` · `GET /infra-ops/scheduler/nodes?site=&cluster=` | Read | GPU-001…009, GPU-023 (Command Center GPU area), REV (GPU job services), CAP placement | every 30–60 s |

**Expected response (jobs):**
```json
{ "items": [
  { "id": "JOB-TX-020-001", "name": "llm-pretrain-70b", "kind": "training", "scheduler": "Slurm", "cluster": "CL-TX-020-A", "site": "TX-DC-020",
    "customerId": "CUS-NC-004", "nodes": ["GPU-001", "GPU-002", "…", "GPU-019"], "gpus": 152, "state": "stalled",
    "started": "2026-10-21T04:00:00Z", "since": "2026-10-28T06:02:11Z",
    "progress": { "stepMs": null, "baselineMs": 1840, "mfu": 0.0, "lastCheckpoint": "2026-10-28T05:30:00Z", "checkpointMin": 60 },
    "cause": { "text": "Xid 79 on GPU-014 gpu3", "nodeId": "GPU-014" } },
  { "id": "JOB-TX-020-007", "name": "chat-inference", "kind": "inference", "cluster": "CL-TX-020-B", "site": "TX-DC-020", "customerId": "CUS-NC-011",
    "nodes": ["GPU-041", "GPU-042"], "gpus": 16, "state": "running", "started": "2026-10-25T00:00:00Z",
    "progress": { "stepMs": 92, "baselineMs": 90, "mfu": 0.41, "lastCheckpoint": null, "checkpointMin": null } } ] }
```
**Expected response (nodes):**
```json
{ "items": [ { "id": "GPU-014", "cluster": "CL-TX-020-A", "site": "TX-DC-020", "state": "failed", "jobId": "JOB-TX-020-001",
  "gpus": 8, "model": "H200", "drain": { "reason": "Xid 79", "since": "2026-10-28T06:03:00Z" } } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `name`, `kind` (training / fine-tuning / inference), `cluster`, `site`, `customerId` | string / enum | M | job list, customer, service link |
| `nodes[]`, `gpus` | list, integer | M | blast radius, GPU time lost |
| `state` | running / slowed / stalled / at-risk / idle (SynapseDC may derive slowed / at-risk / idle from telemetry when the scheduler only says running) | M | job state |
| `started`, `since` | time | M (since O) | durations, lost so far |
| `progress.stepMs`, `baselineMs`, `mfu`, `lastCheckpoint`, `checkpointMin` | number / time | O (only when the AI platform exports them, GPU-032) | slowdown, MFU, work to redo |
| `cause.text`, `cause.nodeId` | string | O | story card, incident link |
| nodes: `id`, `state` (in-job / idle / drained / failed / burn-in), `jobId`, `drain.reason` | string / enum | M (drain O) | node states, spares |

#### API-OPS-03 Cost data (read)

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /fin-ops/costs?site=&category=power&period=` · `GET /fin-ops/budgets?site=` | Read | CAP-010…019 (bill actuals vs model), INTG-023 | daily |

**Expected response:**
```json
{ "items": [ { "site": "TX-DC-020", "category": "power", "period": "2026-09", "actual": { "amount": 412800, "currency": "USD" },
  "budget": { "amount": 395000, "currency": "USD" }, "invoiceRef": "ERCOT-INV-88231", "kwh": 4920000, "peakKw": 6930 } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `site`, `category`, `period` | string | M | match to the modelled bill |
| `actual`, `budget` | money | M (budget O) | bill vs model, findings validation |
| `kwh`, `peakKw`, `invoiceRef` | number / string | O | ratchet and block checks |

#### API-OPS-04 Power cost figures (write)

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /fin-ops/allocations` | Write | CAP power economics, GPU power by job / tenant | daily |

**Request:**
```json
{ "period": "2026-10-27", "items": [
  { "site": "TX-DC-020", "kind": "site", "powerCost": { "amount": 13240, "currency": "USD" }, "idleCost": { "amount": 1880, "currency": "USD" }, "costPerSoldMwMonth": { "amount": 61200, "currency": "USD" } },
  { "site": "TX-DC-020", "kind": "job", "ref": "JOB-TX-020-001", "customerId": "CUS-NC-004", "kwh": 6210, "powerCost": { "amount": 590, "currency": "USD" } } ] }
```
**Expected response:** `{ "accepted": 2 }`

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `accepted` | integer | M | delivery confirmation |

---

### C.5 Services & ITSM

**Module:** Services & ITSM — Incidents, Problems, Change Management, Maintenance, Tickets, Knowledge Center. **SynapseDC uses it for** the incident, problem, change, maintenance and ticket records; it adds impact, RCA, money and DCIM work to them. **Screens:** datacenter incident view, Command Center trio, Needs attention, Change management overview, DCIM change control, Facilities → Maintenance, customer page (remote hands), Revenue Impact.

#### API-ITSM-01 List incidents

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /itsm/incidents?site=&status=&severity=&since=` | Read | CC-003, CC-017, ALM-033, SITE-008, REV-001 | on open; events |

**Expected response:**
```json
{ "items": [
  { "id": "INC-0003", "number": "INC0091442", "title": "UPS-2 on battery", "type": "Power", "severity": 1, "priority": 1, "status": "Investigating",
    "site": "IL-DC-009", "owner": "Facility engineering", "assignee": "sam.patel@operator.com", "reportedBy": "SynapseDC",
    "detected": "2026-10-28T07:38:12Z", "acknowledged": "2026-10-28T07:41:02Z", "resolved": null,
    "sla": { "responseMin": 15, "resolveMin": 240, "responseDue": "2026-10-28T07:53:12Z", "resolveDue": "2026-10-28T11:38:12Z", "breached": false },
    "alertIds": ["ALM-000123"], "changeIds": [], "problemId": null } ],
  "next": null }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id` (correlation id = SynapseDC id), `number` (ITSM ref) | string | M | link both ways |
| `title`, `type` (Network / Power / Cooling / Rack / Capacity / Security / GPU) | string / enum | M | lists, revenue domain |
| `severity` 1–4 (Critical / High / Medium / Low), `priority` 1–4 | integer | M (priority O) | severity words; priority only when different |
| `status` (Open / Investigating / Mitigated / Resolved / Closed) | enum | M | open counts |
| `site`, `owner`, `assignee`, `reportedBy` | string | M (assignee O) | lists, ownership |
| `detected`, `acknowledged`, `resolved` | time | M (others O) | MTTA, MTTR, past SLA |
| `sla.responseMin`, `resolveMin`, `responseDue`, `resolveDue`, `breached` | integer / time / bool | M | SLA clock bar, Past SLA tile |
| `alertIds[]`, `changeIds[]`, `problemId` | list / string | M (problemId O) | evidence, change link |

#### API-ITSM-02 Get incident

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /itsm/incidents/{id}` | Read | datacenter incident view (ALM-015…026), REV-009 | on open; events |

**Expected response:** the API-ITSM-01 item plus:
```json
{ "workNotes": [ { "at": "2026-10-28T07:45:00Z", "by": "sam.patel@operator.com", "text": "DG running, feed A utility fault confirmed", "kind": "human" },
                 { "at": "2026-10-28T07:38:40Z", "by": "SynapseDC", "text": "Opened from ALM-000123; 18 services exposed", "kind": "system" } ],
  "cis": [ { "kind": "Facility", "id": "UPS-2", "label": "UPS-2 (A side)" }, { "kind": "Rack", "id": "R-2-07", "label": "Hall 2 · R-2-07" } ],
  "group": "Facility engineering", "resolutionCode": null,
  "datacenter": { "impact": { "services": 18, "customers": 6, "premium": 2, "revenueAtRisk": { "amount": 41200, "currency": "USD" }, "level": "High",
                              "summary": "18 cabinets on the A side ride UPS-2 battery; 2 premium tenants" },
                  "rca": [ { "cause": "Utility feed A lost; ATS on B; UPS-2 carrying A-side busway on battery", "confidence": 0.82,
                             "evidence": [ { "label": "ALM-000123 UPS_ON_BATTERY", "ref": "ALM-000123", "at": "2026-10-28T07:38:12Z" } ] } ],
                  "actions": [ { "id": "A1", "step": "Confirm DG on load and fuel ≥ 8 h", "owner": "Facility engineer", "status": "done", "disruptive": false } ],
                  "verification": [ { "check": "UPS-2 back on mains", "ok": null } ] } }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `workNotes[]` (`at`, `by`, `text`, `kind` system / human / ai) | list | M | worklog |
| `cis[]` (`kind` NE / Link / Rack / Service / Customer / Facility, `id`, `label`) | list | M | affected objects |
| `group`, `resolutionCode` | string | O | ownership, closure |
| `datacenter.impact`, `datacenter.rca[]`, `datacenter.actions[]`, `datacenter.verification[]` | object / list | O | **written by SynapseDC** (API-ITSM-04); stored on the incident if the module supports extension fields, otherwise kept in DC-STORE keyed by incident id |

#### API-ITSM-03 Create incident

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /itsm/incidents` | Write | ALM-014 (correlation opens an incident), ALM-030 GPU incidents, CAP-020 power finding incident | within 60 s of the first correlated alarm |

**Request:**
```json
{ "correlationId": "INC-0061", "title": "152 GPUs stopped by one failed GPU in CL-TX-020-A", "type": "GPU", "severity": 1, "site": "TX-DC-020",
  "alertIds": ["ALM-000231"], "cis": [ { "kind": "NE", "id": "GPU-014" } ], "description": "Job JOB-TX-020-001 stalled; last checkpoint 05:30",
  "reportedBy": "SynapseDC" }
```
**Expected response:** `{ "id": "INC-0061", "number": "INC0091460", "status": "Open", "sla": { "responseDue": "2026-10-28T06:17:40Z", "resolveDue": "2026-10-28T10:02:40Z" } }`

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `number`, `status`, `sla` | string / enum / object | M | link, SLA clocks |

#### API-ITSM-04 Update incident

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `PATCH /itsm/incidents/{id}` · `POST /itsm/incidents/{id}/work-notes` · `POST /itsm/incidents/{id}/resolve` | Write | ALM-016…026 (impact, RCA, actions, verification, worklog), user actions | on change; per action |

**Request:** any of `severity`, `datacenter.impact`, `datacenter.rca`, `datacenter.actions`, `datacenter.verification`, a work note `{ "text", "kind": "system" | "ai" }`, or resolve `{ "code", "note" }`.
**Expected response:** `{ "id": "INC-0003", "updated": "2026-10-28T08:02:00Z", "version": 7 }`

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `updated`, `version` | time, integer | M | optimistic concurrency (If-Match), echo suppression |

#### API-ITSM-05 Problems

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /itsm/problems?site=&state=` · `POST /itsm/problems` · `POST /itsm/problems/{id}/incidents` | Read / write | ALM-012 Problems tab, ALM-018 batch RMA | on open; when incidents group by cause |

**Expected response:**
```json
{ "items": [ { "id": "PRB-0007", "number": "PRB0004410", "title": "SFP lot 22B early failures", "type": "Network", "state": "Fix in change",
  "incidents": ["INC-0001", "INC-0014", "INC-0022"], "open": 1, "sites": ["VA-DC-001", "NY-DC-004"],
  "firstSeen": "2026-09-02T11:00:00Z", "lastSeen": "2026-10-28T07:31:05Z", "workaround": "Swap from spares", "fix": "Replace lot 22B optics", "changeId": "CHG-2230", "owner": "Network engineering" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `number`, `title`, `type`, `state` (Investigating / Known error / Fix in change) | string / enum | M | problems list |
| `incidents[]`, `open`, `sites[]` | list / integer | M | grouping, counts |
| `firstSeen`, `lastSeen`, `workaround`, `fix`, `changeId`, `owner` | time / string | O | detail |

#### API-ITSM-06 List changes

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /itsm/changes?site=&status=&from=&to=&class=` | Read | ANL (Change management overview 8.5), DCIM-018…024 (open CR picker), ALM-016 (change evidence, last 3 days), CC-019 | on open; events |

**Expected response:**
```json
{ "items": [ { "id": "CHG-2001", "number": "CHG0033120", "title": "Re-patch ODF RACK-3", "class": "Normal", "kind": "Change", "source": "Operations",
  "site": "VA-DC-001", "scope": ["ODF-RACK-3", "BDR-01"], "risk": "Medium", "status": "Completed",
  "windowStart": "2026-10-26T22:00:00Z", "windowEnd": "2026-10-27T02:00:00Z", "requester": "field.tech@operator.com", "approver": "change.manager@operator.com",
  "created": "2026-10-24T09:00:00Z", "outcome": "Caused an incident", "causedIncident": "INC-0001" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `number`, `title`, `class` (Standard / Normal / Emergency), `kind` (Change / Maintenance), `source` | string / enum | M | lists, classes |
| `site`, `scope[]`, `risk` (Low / Medium / High), `status` (Draft / Pending approval / Approved / In progress / Completed / Rolled back / Rejected) | string / list / enum | M | site filter, scope match for RCA and drift |
| `windowStart`, `windowEnd`, `created` | time | M | calendar, lead time, "within 3 days before detection" |
| `requester`, `approver`, `outcome`, `causedIncident` | string / enum | O | outcome charts; caused-an-incident is **written by SynapseDC** via API-ITSM-09 |

#### API-ITSM-07 Get change

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /itsm/changes/{id}` | Read | change drawer, DCIM CR chip, DCIM-021 (execute when approved) | on open; events |

**Expected response:** the API-ITSM-06 item plus:
```json
{ "template": "STD-07", "rollback": "Restore the previous jumper map from the ODF ledger",
  "approvals": [ { "role": "Change manager", "who": "change.manager@operator.com", "decision": "Approved", "at": "2026-10-25T10:00:00Z" },
                 { "role": "Site lead", "who": "site.lead@operator.com", "decision": "Approved", "at": "2026-10-25T11:20:00Z" } ],
  "conflicts": [], "freeze": null, "violations": [ { "policy": "POL-03", "enforcement": "Warn", "text": "Window outside maintenance hours" } ],
  "pir": { "state": "Due", "due": "2026-11-03T00:00:00Z" }, "incidentId": null, "projectId": null, "woId": null }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `approvals[]` (`role`, `who`, `decision` Approved / Pending / Waiting / Rejected / Pre-approved, `at`) | list | M | approval board, DCIM execution gate |
| `template`, `rollback` | string | M (template O) | standard change, rollback evidence |
| `freeze`, `conflicts[]`, `violations[]` (`policy`, `enforcement` Block / Warn, `text`) | string / list | M | freeze refusal, conflicts, policy warnings |
| `pir`, `incidentId`, `projectId`, `woId` | object / string | O | review status, links |

#### API-ITSM-08 Create change request

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /itsm/changes` | Write | DCIM-018…020 (standard / raise new), ALM-025 (emergency change from an incident), FAC "Schedule maintenance", PLN delivery CRs | user action |

**Request:**
```json
{ "class": "Standard", "template": "STD-07", "title": "DCIM record: install GPU-052 in R-3-04 U10–U17", "site": "TX-DC-020",
  "scope": ["rack:R-3-04", "ne:GPU-052"], "risk": "Low", "windowStart": "2026-10-28T10:00:00Z", "windowEnd": "2026-10-28T12:00:00Z",
  "rollback": "Remove the planned device record", "origin": "DCIM", "requester": "dc.engineer@operator.com" }
```
**Expected response:** `{ "id": "CHG-2241", "number": "CHG0033188", "status": "Approved", "class": "Standard", "freeze": null }` or `409` with `{ "freeze": "FRZ-IL-DC-009", "allows": "Emergency only" }`

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `number`, `status`, `class` | string / enum | M | tag DCIM work with the CR; apply now vs plan |
| `freeze`, `allows` | string / enum | M on refusal | refusal message under a freeze |

#### API-ITSM-09 Change transition and work items

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /itsm/changes/{id}/transition` · `POST /itsm/changes/{id}/work-items` · `PATCH /itsm/changes/{id}/work-items/{wid}` | Write | DCIM-021 (execute planned work), DCIM-022, INTG-017 (caused an incident) | on approval; on execution |

**Request (work item):** `{ "id": "DW-0091", "op": "installDevice", "tags": ["rack:R-3-04", "ne:GPU-052"], "state": "done", "doneBy": "dc.engineer@operator.com", "at": "2026-10-28T10:42:00Z" }`
**Expected response:** `{ "changeId": "CHG-2241", "status": "Completed", "workItems": { "total": 3, "done": 3 } }`

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `status`, `workItems.total`, `workItems.done` | enum / integer | M | complete a DCIM-raised CR when all its work is done |

#### API-ITSM-10 Maintenance windows and plans

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /itsm/maintenance?site=&asset=&from=&to=` | Read | FAC (Maintenance & PM plan), FAC SPOF what-if, CC Recommendations | daily; on open |

**Expected response:**
```json
{ "items": [ { "id": "PMW-IL-DC-009-0042", "site": "IL-DC-009", "assetId": "DG-1", "asset": "Generator DG-1", "kind": "Generator",
  "task": "Monthly load-bank test", "intervalDays": 30, "lastDone": "2026-10-02T09:00:00Z", "nextDue": "2026-11-01T09:00:00Z",
  "state": "scheduled", "owner": "Facility engineering", "changeId": "CHG-2236" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `site`, `assetId`, `asset`, `kind` (UPS / Battery / Generator / Cooling / CDU / Fire / Electrical), `task` | string / enum | M | PM plan per plant asset |
| `intervalDays`, `lastDone`, `nextDue`, `state` | integer / time / enum | M | due / overdue |
| `owner`, `changeId` | string | O | booked by a maintenance change |

#### API-ITSM-11 Tickets

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /itsm/tickets?site=&customer=&kind=` · `POST /itsm/tickets` | Read / write | customer page (remote hands, cross-connect), SITE lifecycle (RMA cases), access requests | on open; user action |

**Expected response:**
```json
{ "items": [ { "id": "TKT-77120", "kind": "remote-hands", "site": "IL-DC-009", "customerId": "CUS-CO-031", "title": "Reseat PSU in cabinet C-2-14",
  "state": "In progress", "opened": "2026-10-28T06:10:00Z", "due": "2026-10-28T10:10:00Z", "assignee": "field.tech@operator.com", "ref": { "rack": "C-2-14" } },
  { "id": "TKT-77131", "kind": "rma", "site": "TX-DC-020", "title": "RMA GPU-014 gpu3 (Xid 79)", "state": "Engineer booked", "opened": "2026-10-28T06:30:00Z",
    "ref": { "device": "GPU-014", "part": "H200 SXM", "vendorCase": "NV-55102" } } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `kind` (remote-hands / cross-connect / access / rma), `site`, `customerId`, `title`, `state` | string / enum | M (customerId O) | customer page panels, RMA status |
| `opened`, `due`, `assignee`, `ref` | time / string / object | O | SLA, link to rack / device |

#### API-ITSM-12 Knowledge articles

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /itsm/knowledge?alarmType=&incidentType=` | Read | INTG-015 runbook links on recommended actions (P3) | on open |

**Expected response:** `{ "items": [ { "id": "KB0012", "title": "UPS on battery: first 15 minutes", "url": "https://itsm/kb/KB0012", "updated": "2026-08-14T00:00:00Z" } ] }`

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `title`, `url` | string | M | runbook link |
| `updated` | time | O | stale-article hint |

#### API-ITSM-13 Events

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| webhook / Kafka topic `itsm.v1`: `incident.changed`, `change.changed`, `ticket.changed`, `problem.changed` | Read (subscribe) | every ITSM-backed panel; DCIM execution gate (change approved) | push |

**Expected event:** CloudEvents envelope, `subject` = record id, `data` = `{ "id", "number", "status", "changedFields": [...], "version" }`.

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `subject`, `data.status`, `data.changedFields`, `data.version` | string / list / integer | M | refresh only what changed; run approved DCIM work |

---

### C.6 AI Foundry

**Module:** AI Foundry (models and agents). **SynapseDC uses it for** the Opstral AI copilot answering from SynapseDC read models. **Screens:** the Opstral AI drawer on every page (XC-008), Command Center recommendations explanations.

#### API-AIF-01 Invoke agent

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /ai-foundry/agents/{agent}/invoke` | Read / write | XC-008, CC-031, GPU-033 | user question |

**Request:**
```json
{ "agent": "opstral-dc", "question": "Which issue is costing the most revenue?",
  "context": { "page": "/revenue", "persona": "neocloud", "geo": "us", "dcId": null, "user": "ops.head@operator.com" },
  "tools": ["synapsedc.getRevenue", "synapsedc.getIncident", "synapsedc.getGpu"] }
```
**Expected response:**
```json
{ "answer": "INC-0061 in TX-DC-020 is costing the most: $8,940 lost so far at $1,520 per hour, with $27,300 of credits at stake.",
  "citations": [ { "tool": "synapsedc.getRevenue", "ref": "INC-0061", "figure": "lost", "value": { "amount": 8940, "currency": "USD" } } ],
  "links": [ { "label": "Open the cost breakdown", "href": "/revenue?dc=TX-DC-020" } ],
  "confidence": 0.93, "toolCalls": 2, "latencyMs": 1840 }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `answer` | string | M | the reply |
| `citations[]` (`tool`, `ref`, `figure`, `value`) | list | M | every number traces to a read model (BRULE-XC-07) |
| `links[]` | list | M | deep link to the screen holding the figure |
| `confidence`, `toolCalls`, `latencyMs` | number / integer | O | audit, explainability |

#### API-AIF-02 Register tools

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `PUT /ai-foundry/tools/{name}` | Write | INTG-027 (deployment) | on release |

**Request:**
```json
{ "name": "synapsedc.getRevenue", "description": "Revenue impact of open datacenter issues, optionally for one datacenter",
  "endpoint": "https://{host}/api/dco/v1/revenue-impact", "method": "GET", "auth": "oauth2-client-credentials", "scope": "revenue:read",
  "parameters": { "type": "object", "properties": { "dcId": { "type": "string" } } } }
```
**Expected response:** `{ "name": "synapsedc.getRevenue", "version": 3, "status": "active" }`

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `name`, `version`, `status` | string / integer / enum | M | the copilot uses the current tool version |

### C.7 Operate to Acquire (BSS)

Module: CRM, Customers, Orders, Plans & Products Catalog, Experience and Care. SynapseDC uses it for who the customers are, what they bought, where each service sits and what it is worth, and it sends back impact, notices, credits and metered usage. It is used on the Command Center (Who is affected), the customer page, Revenue Impact, the datacenter Customers / Tenants and Revenue tabs, incidents and Capacity → Reservations.

#### API-BSS-01 Customers

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /customers`, `GET /customers/{id}` | In | Customer page, Revenue Impact (REV-001…), Command Center Who is affected (CC-019), site Customers tab | daily full read + API-BSS-10 events |

**Request:** `?site=` (optional), `?updatedSince=`, cursor paging.

**Expected response:**
```json
{ "items": [
  { "id": "CUS-0007", "name": "Northwind AI Labs", "segment": "AI / ML", "tier": "reserved", "premium": true,
    "accountManager": { "id": "USR-114", "name": "Priya Nair" },
    "locations": [{ "city": "Chicago", "state": "IL" }],
    "revenueMonthly": { "amount": 412000, "currency": "USD" },
    "status": "active", "updatedAt": "2026-10-27T06:00:00Z" } ],
  "next": null }
```

**Fields SynapseDC needs:**

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id` | string | M | key for impact, revenue and the customer page |
| `name` | string | M | every customer list |
| `segment` | string | O | customer facts row |
| `tier` / `premium` | enum / boolean | M | premium tile, credit weighting, notice schedule |
| `accountManager` | object | M | customer page, notices |
| `locations[]` | array | O | customer header |
| `revenueMonthly` | money | O | cross-check of Σ service charges |
| `status` | enum | M | hide closed accounts |

#### API-BSS-02 Contracts and SLA

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /customers/{id}/contracts`, `GET /contracts?site=` | In | Revenue Impact credits (REV-004…), customer page, Capacity reservations (contracted kW), Power economics | daily + events |

**Request:** customer id or `?site=`; `?active=true`.

**Expected response:**
```json
{ "items": [
  { "id": "CTR-2041", "customerId": "CUS-0007", "kind": "gpu-cluster",
    "term": { "start": "2026-01-01", "end": "2028-12-31" },
    "sla": { "targetPct": 99.9, "measure": "cluster-availability",
             "credits": [ { "shortfallPctGt": 0, "creditPct": 10 }, { "shortfallPctGte": 0.5, "creditPct": 25 }, { "shortfallPctGte": 2, "creditPct": 50 } ] },
    "gpu": { "model": "H100", "reservedGpus": 256, "rate": { "amount": 3000, "currency": "USD", "per": "gpu-month" } } },
  { "id": "CTR-1188", "customerId": "CUS-0031", "kind": "colocation",
    "sla": { "targetPct": 99.99, "measure": "power-availability" },
    "cabinets": [ { "rackRef": "IL-DC-009/RACK-B07", "contractedKw": 12, "feeds": "A+B" } ] } ] }
```

**Fields SynapseDC needs:**

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `customerId`, `kind` | string / enum | M | link services to their contract |
| `term.start`, `term.end` | date | O | renewal facts |
| `sla.targetPct` | number | M | within-SLA %, credits, cliffs |
| `sla.credits[]` | array | O | per-contract credit tiers; falls back to the 10 / 25 / 50 % table |
| `cabinets[].rackRef`, `contractedKw` | string / number | M (Colo) | tenant draw vs contracted kW, reservations "Committed", not-a-loss rule |
| `gpu.model`, `reservedGpus`, `rate` | string / int / money | M (Neo) | GPU job price, GPU time lost in money |

#### API-BSS-03 Services with placement

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /services?site=` | In | Impact and Revenue (REV-001…), incident impact (ALM-020…), customer page service grid, GPU Fleet job → customer | on change (API-BSS-10) + daily reconcile |

**Request:** `?site=`, `?customerId=`, `?updatedSince=`.

**Expected response:**
```json
{ "items": [
  { "id": "SVC-04211", "customerId": "CUS-0031", "type": "Cabinet lease", "status": "Active",
    "qty": 12, "unit": "kW", "monthlyCharge": { "amount": 5400, "currency": "USD" }, "critical": true,
    "placement": { "dcId": "IL-DC-009", "rackId": "RACK-B07", "deviceId": null, "port": null, "linkIds": [] } },
  { "id": "SVC-09007", "customerId": "CUS-0007", "type": "GPU cluster", "status": "Active",
    "qty": 152, "unit": "GPU", "monthlyCharge": { "amount": 456000, "currency": "USD" },
    "placement": { "dcId": "CA-DC-020", "clusterId": "POD-CA-020-A", "nodeIds": ["GPU-014", "GPU-015"], "jobRef": "JOB-7781" } } ] }
```

**Fields SynapseDC needs:**

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `customerId`, `type` | string | M | impact keys, persona service words |
| `status` | enum Active / Degraded / Down / Planned | M | down / degraded / exposed state |
| `qty`, `unit` | number / enum | M | service size (kW, Mbps, GPU) |
| `monthlyCharge` | money | M | rate = monthly ÷ 730 h |
| `critical` | boolean | O | ordering in Who is affected |
| `placement.dcId` | string | M | which site |
| `placement.rackId` / `deviceId` / `port` / `linkIds[]` | string | M where known | path of the service: which fault hits it |
| `placement.clusterId`, `nodeIds[]`, `jobRef` | string | M (Neo) | job → nodes → GPU faults |

When placement is missing, SynapseDC shows the service at site level and reports "placement incomplete" (R-03).

#### API-BSS-04 Products and plans

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /catalog/products` | In | persona service types, Planner revenue lines, Capacity | daily |

**Request:** none.

**Expected response:**
```json
{ "items": [ { "id": "PRD-COLO-10KW", "name": "Cabinet 10 kW", "serviceType": "Cabinet lease", "unit": "kW", "listPrice": { "amount": 450, "currency": "USD", "per": "kW-month" } },
             { "id": "PRD-GPU-H100", "name": "Reserved H100 cluster", "serviceType": "GPU cluster", "unit": "GPU", "listPrice": { "amount": 3000, "currency": "USD", "per": "gpu-month" } } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `name`, `serviceType`, `unit` | string | M | service vocabulary per business model |
| `listPrice` | money | O | planner revenue assumptions |

#### API-BSS-05 Push customer impact

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /customers/{id}/impact` | Out | Revenue Impact, incident enrichment (INTG-005) | on change of a customer's impact band |

**Request body:**
```json
{ "customerId": "CUS-0007", "asOf": "2026-10-27T07:40:00Z",
  "services": { "down": 0, "degraded": 1, "exposed": 2 },
  "issues": [ { "incidentId": "INC-0061", "title": "Xid 79 stalled training job", "lostSoFar": { "amount": 1875, "currency": "USD" }, "creditsAtRisk": { "amount": 45600, "currency": "USD" } } ],
  "slaStatus": "at-risk", "link": "https://{host}/customers/CUS-0007" }
```

**Expected response:** `202 Accepted` `{ "id": "IMP-88123" }`.

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| response `id` | string | O | idempotent update of the same impact record |

#### API-BSS-06 Send customer notice

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /care/notices` | Out | incident communications (ALM-026…), customer page | initial 15 / 30 / 60 min by severity, updates 1 / 2 / 4 h, resolution |

**Request body:**
```json
{ "customerId": "CUS-0031", "incidentRef": "INC-0003", "kind": "initial", "severity": "Critical",
  "channel": ["email"], "template": "colo-power-event", "fields": { "site": "IL-DC-009", "cabinets": ["RACK-B07"], "summary": "UPS-2 on battery, cabinet on B feed" } }
```

**Expected response:**
```json
{ "id": "NTC-55012", "status": "queued", "sentAt": null }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id` | string | M | notice log on the incident |
| `status` | enum queued / sent / failed | M | overdue-update warning |
| `sentAt` | time | O | notice timeline |

#### API-BSS-07 Post SLA credits

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /contracts/{id}/credits` | Out | Revenue Impact (INTG-007) | on incident close + month end |

**Request body:**
```json
{ "contractId": "CTR-2041", "period": "2026-10", "incidentRef": "INC-0061",
  "impactedMinutes": 96, "shortfallPct": 0.22, "tierPct": 10, "amount": { "amount": 45600, "currency": "USD" } }
```

**Expected response:** `201` `{ "id": "CRD-3320", "status": "proposed" }`.

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `status` (proposed / approved / rejected) | string / enum | M | "Credits owed" tile reconciles with what BSS accepted |

#### API-BSS-08 Post metered usage

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /usage` (batch) | Out | Power economics, GPU Fleet (INTG-008) | daily preview + monthly final |

**Request body:**
```json
{ "period": "2026-10", "records": [
  { "customerId": "CUS-0031", "contractId": "CTR-1188", "meter": "cabinet-energy", "rackRef": "IL-DC-009/RACK-B07", "kWh": 7420.5, "peakKw": 11.6, "contractedKw": 12 },
  { "customerId": "CUS-0007", "contractId": "CTR-2041", "meter": "gpu-hours", "jobRef": "JOB-7781", "gpuHoursDelivered": 108220, "gpuHoursLost": 152 } ] }
```

**Expected response:** `202` `{ "batchId": "USG-2026-10-27", "accepted": 2, "rejected": [] }`.

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `batchId`, `accepted`, `rejected[]` (with reason) | string / int / array | M | retry and reconciliation of usage |

#### API-BSS-09 Cross-connect orders

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /orders?type=cross-connect&site=` | In | colocation Tenants tab, customer page "Cross-connect orders" (REV-030), DCIM meet-me room cross-connects (DCIM-029) | every 15 min + events |

**Expected response:**
```json
{ "items": [ { "id": "ORD-XC-1042", "customerId": "CUS-0031", "site": "IL-DC-009", "aEnd": { "rackRef": "RACK-B07", "port": "PP-1/12" },
    "zEnd": { "party": "Carrier Zayo", "rackRef": "MMR-01", "port": "ODF-2/31" }, "media": "SMF", "speed": "10G",
    "status": "In progress", "requested": "2026-10-20T09:00:00Z", "due": "2026-10-29T17:00:00Z" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `customerId`, `site`, `status`, `due` | string / enum / time | M | order list, late orders |
| `aEnd`, `zEnd` (rack, port, party) | object | M | match to the DCIM cross-connect cable |
| `media`, `speed` | string | O | order facts |

#### API-BSS-10 Events

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| subscription `customer.changed`, `contract.changed`, `service.changed`, `order.changed` | In | impact and revenue read models | push |

**Expected event:**
```json
{ "type": "service.changed", "id": "evt_9a1", "time": "2026-10-27T07:10:00Z", "subject": "SVC-04211", "data": { "id": "SVC-04211", "changed": ["placement.rackId"] } }
```
SynapseDC re-reads the object with API-BSS-01 / 02 / 03 / 09.

---

### C.8 Plan to Build — Inventory

Module: Plan to Build Inventory. SynapseDC uses it as the record of every location, rack and device, their components and lifecycle; it reads them by id and writes back only the DCIM fields Inventory can carry. It is used on the Datacenters list and site page, device page, Facilities (rack power, PDUs), DCIM, the twins, GPU Fleet (node → rack), Capacity and the Planner's site baseline.

#### API-INV-01 Locations

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /locations?kind=site`, `GET /locations/{id}/children` | In | Datacenters list (SITE-001), map (CC-011), DCIM hierarchy (DCIM-001), Capacity | daily + API-INV-08 |

**Expected response:**
```json
{ "items": [ { "id": "IL-DC-009", "kind": "site", "name": "Chicago West", "status": "Live", "tier": "Tier III",
    "region": "Midwest", "state": "IL", "city": "Chicago", "address": "2200 W Cermak Rd", "lat": 41.852, "lng": -87.681, "commissionedOn": "2019-04-01",
    "floors": [ { "id": "IL-DC-009/F1", "name": "Floor 1", "rooms": [ { "id": "IL-DC-009/F1/HALL-A", "name": "Data Hall A", "kind": "data-hall" }, { "id": "IL-DC-009/F1/MMR", "name": "Meet-me room", "kind": "mmr" } ] } ] } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `name`, `status` (Live / In progress / Planned) | string / enum | M | site lists, planned sites hide live tabs |
| `tier` | enum | M | SPOF rules (Tier II single feed), plan baselines |
| `region`, `state`, `city`, `address`, `lat`, `lng` | string / number | M | map, filters, tariffs and carbon factor by state |
| `commissionedOn` | date | O | asset age rules |
| `floors[].rooms[]` (id, name, kind) | array | M | hall / room tree, twin, floor plan |

#### API-INV-02 Racks

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /racks?site=`, `GET /racks/{id}` | In | DCIM racks / floor plan (DCIM-002), Facilities rack power (FAC-007), twin, Capacity space | daily + events |

**Expected response:**
```json
{ "items": [ { "id": "RACK-B07", "siteId": "IL-DC-009", "roomId": "IL-DC-009/F1/HALL-A", "name": "B07", "role": "Tenant cabinet",
    "heightU": 42, "budgetKw": 12, "owner": "tenant", "tenantId": "CUS-0031", "liquid": false, "density": null,
    "model": "Rittal TS IT 800×1200", "purchasedOn": "2019-03-12", "status": "In service" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `siteId`, `roomId`, `name`, `role` | string | M | placement, rack lists |
| `heightU`, `budgetKw` | int / number | M | U usage, over-budget 85 % rule, capacity |
| `owner`, `tenantId` | enum / string | M (Colo) | tenant gear opaque, never polled |
| `liquid`, `density` | boolean / enum | O | CDU heat share, AI rack styling |
| `model`, `purchasedOn`, `status` | string / date / enum | O | rack vintage, retire / damaged rules |

Grid position, row, rack type code and condition are DCIM extensions (API-INV-07).

#### API-INV-03 Devices / assets

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /assets?site=&type=device`, `GET /assets/{id}` | In | Equipment tab, device page, DCIM devices, GPU nodes, alarm placement, Planner refresh candidates | daily + events |

**Expected response:**
```json
{ "items": [ { "id": "GPU-014", "siteId": "CA-DC-020", "rackId": "RACK-G03", "u": 12, "uSize": 8,
    "role": "GPU", "vendor": "NVIDIA", "model": "DGX H100", "serial": "1563922001844", "status": "In service",
    "mgmtIp": "172.31.20.14", "owner": "operator", "purpose": null, "tags": ["pod:POD-CA-020-A"] } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `siteId`, `rackId` | string | M | containment chain, alarm placement |
| `u`, `uSize` | int | M | elevation, U clash check (if Inventory carries them; else DC-STORE) |
| `role`, `vendor`, `model`, `serial` | string | M | role filters, GPU model, drift vs observed |
| `status` (In service / Planned / Maintenance / Decommissioning / Tenant-owned) | enum | M | ops state, reserved space |
| `mgmtIp` | string | M | collector targets, IPAM cross-check |
| `owner`, `purpose` | enum / string | O | operator servers, tenant gear |

#### API-INV-04 Components

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /assets/{id}/components` | In | device Hardware tab, DCIM device drawer bays / ports, RMA and spares | on device open + daily |

**Expected response:**
```json
{ "assetId": "PE-01", "modules": [ { "slot": "FPC0", "name": "MPC7E-10G", "serial": "CAEB4471", "state": "OK" } ],
  "ports": [ { "name": "xe-0/0/3", "type": "10G SFP+", "speedMbps": 10000, "adminState": "up" } ],
  "psus": [ { "slot": "PSU1", "model": "PWR-MX480-2520", "state": "OK" }, { "slot": "PSU2", "state": "OK" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `modules[]` slot, name, serial, state | array | M | module faults, RMA, drift |
| `ports[]` name, type, speed, admin state | array | M | port capacity, free same-speed ports |
| `psus[]` slot, state | array | M | PSU cords to PDU outlets, single-PSU SPOF |

#### API-INV-05 Device and module types

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /catalog/device-types`, `GET /catalog/module-types` | In | DCIM catalogue (DCIM-010), install form, Planner BoM models | daily |

**Expected response:**
```json
{ "items": [ { "id": "DT-DELL-R760", "vendor": "Dell", "model": "PowerEdge R760", "uHeight": 2, "typicalW": 850, "maxW": 1400, "psus": 2, "generation": "current", "endOfSale": "2029-06-30" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `vendor`, `model` | string | M | type pages, install |
| `uHeight`, `typicalW`, `maxW`, `psus` | int / number | O | install budget check, planned draw (else DC-STORE templates) |
| `generation`, `endOfSale` | enum / date | O | refresh candidates |

#### API-INV-06 Lifecycle

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /assets/{id}/lifecycle`, `GET /lifecycle?site=` | In | site Assets → lifecycle (SITE-041), device Hardware, Planner refresh, Compliance CP-06 (end of support) | weekly + events |

**Expected response:**
```json
{ "items": [ { "assetId": "SRV-0007", "purchasedOn": "2018-05-14", "installedOn": "2019-04-02",
    "warranty": { "end": "2023-05-14" }, "support": { "contractId": "SUP-DELL-114", "level": "ProSupport", "end": "2026-12-31" },
    "vendorDates": { "endOfSale": "2022-02-28", "endOfSupport": "2027-02-28" }, "state": "Out of warranty" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `purchasedOn`, `installedOn` | date | M | age, vintage |
| `warranty.end`, `support.*` | date / object | M | Covered / Expiring / Out of warranty / End of support |
| `vendorDates.endOfSale`, `endOfSupport` | date | M | refresh plans, compliance |

#### API-INV-07 Write DCIM extensions and observed state

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `PATCH /assets/{id}`, `PATCH /racks/{id}`, `POST /assets/{id}/observations` | Out | DCIM edits under a change request (DCIM-032), collector discovery reconciliation (DATA-013) | on each DCIM write; observations every 6–24 h |

**Request body (extension):**
```json
{ "changeRequest": "CHG-2311", "fields": { "u": 14, "uSize": 2, "rackId": "RACK-B09", "status": "In service" } }
```

**Request body (observation):**
```json
{ "observedAt": "2026-10-27T03:00:00Z", "source": "collector-IL-DC-009-a",
  "serial": "FDO2301A0ZQ", "model": "N9K-C93180YC-FX", "os": "NX-OS 10.3(4a)",
  "modules": [ { "slot": "PSU2", "serial": "LIT2303", "state": "Fault" } ],
  "lldp": [ { "localPort": "Eth1/49", "remoteDevice": "SPINE-01", "remotePort": "Eth1/7" } ] }
```

**Expected response:** `200` `{ "id": "SW-LEAF-03", "version": 42, "drift": [ { "attr": "os", "record": "NX-OS 10.2(5)", "observed": "NX-OS 10.3(4a)" } ] }`.

**DCIM extension fields SynapseDC would like Inventory to carry (OD-01).** Each one Inventory accepts is written here; each one it does not stays in **DC-STORE**, keyed by the Inventory id:

| Field | On | Notes |
| --- | --- | --- |
| `u`, `uSize` | device | U position and height |
| `row`, `gridPosition` (col, row), `face` | rack | floor plan and the twin |
| `rackType` (e.g. `RT-TS8-42-1000`), `condition` (OK / Damaged at audit + note) | rack | vintage and replacement plans |
| `pduSide` A / B, `pduId`, `outlet` per PSU | device power port | power chain, single-side SPOF |
| `powerPanel` (busway A / B per hall, −48 V), `feed` (V, A, phases, rating kW) | rack PDU | panel load, feed rating |
| `patchPanel`, `trunk`, `odfPort`, `crossConnect` | cable path | structured cabling hops |
| `sensorPosition` (rack, height) | sensor | rack inlet heat map |

Stays in DC-STORE whatever Inventory decides: work items under a change request, U reservations, cooling coverage (nearest unit, liquid share), facility design ratings (site design kW, UPS / DG nameplate, tank, redundancy) where Inventory has no field.

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `version` | string / int | M | optimistic concurrency (If-Match) |
| `drift[]` | array | O | drift shown on device and DCIM |

#### API-INV-08 Events

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| subscription `asset.created`, `asset.changed`, `asset.retired`, `rack.changed`, `location.changed` | In | every read model that keys on assets | push |

```json
{ "type": "asset.changed", "id": "evt_31c", "time": "2026-10-27T08:01:00Z", "subject": "GPU-014", "data": { "changed": ["status"], "version": 43 } }
```

---

### C.9 Plan to Build — Inventory Planning

Module: Inventory Planning. SynapseDC uses it for capacity targets and holds, and writes the reservations that approved plans create. It is used on Capacity (Overview, Reservations), the Planner and the Command Center build lens.

#### API-IPL-01 Capacity targets and holds

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /capacity/targets?site=`, `GET /capacity/holds?site=` | In | Capacity overview and Reservations (CAP-001…, CAP-036), Planner site fit | hourly + events |

**Expected response:**
```json
{ "targets": [ { "siteId": "IL-DC-009", "dimension": "Power", "unit": "kW", "designCapacity": 6000, "warnAtPct": 85 } ],
  "holds": [ { "id": "HLD-5512", "siteId": "IL-DC-009", "roomId": "IL-DC-009/F1/HALL-A", "dimension": "Power", "amount": 240, "unit": "kW",
               "kind": "Pipeline", "source": { "type": "plan", "ref": "PLN-0004" }, "from": "2026-11-01", "to": "2027-03-31", "status": "Approved" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `targets[]` dimension, unit, designCapacity, warnAtPct | array | M | capacity bars, 85 % line |
| `holds[]` id, site, room, dimension, amount, unit | array | M | net available |
| `holds[].kind` Reserved / Committed / Pipeline / Requested | enum | M | reservation ledger columns |
| `holds[].source`, `from`, `to`, `status` | object / date / enum | M | link to plan or contract, ageing |

#### API-IPL-02 Write reservations from approved plans

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /capacity/holds`, `PATCH /capacity/holds/{id}` | Out | Planner approval and "Start the build" (PLN-026), DCIM U reservations (DCIM-016) | on approval / start / release |

**Request body:**
```json
{ "siteId": "IL-DC-009", "roomId": "IL-DC-009/F1/HALL-A", "dimension": "Power", "amount": 240, "unit": "kW",
  "kind": "Pipeline", "source": { "type": "plan", "ref": "PLN-0004" }, "from": "2026-11-01", "to": "2027-03-31" }
```

**Expected response:** `201` `{ "id": "HLD-5512", "status": "Approved" }`.

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `status` | string / enum | M | plan pack "what this plan creates", release on cancel |

---

### C.10 Plan to Build — IP Management

Module: IP Management. SynapseDC uses it for prefixes, VLANs and the addresses on its devices, assigns addresses from DCIM under a change request, and derives findings and forecasts. It is used on IP & Network Insights (8.4), the DCIM device drawer and the device page.

#### API-IPM-01 Prefixes, VRFs, VLANs, ranges

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /ipam/prefixes?site=`, `GET /ipam/vrfs`, `GET /ipam/vlans?site=` | In | IP & Network Insights (ANL-030), exhaustion forecast, outside-plan check | daily + events |

**Expected response:**
```json
{ "prefixes": [ { "id": "PFX-0193", "prefix": "172.31.40.0/24", "vrf": "MGMT-IL-DC-009", "site": "IL-DC-009", "role": "Management",
                  "parentId": "PFX-0012", "isPool": false, "size": 254, "used": 187, "status": "Active" } ],
  "vrfs": [ { "id": "VRF-MGMT-IL-DC-009", "name": "MGMT-IL-DC-009", "rd": "64500:109", "importTargets": ["64500:999"] } ],
  "vlans": [ { "id": "VLAN-IL-009-200", "site": "IL-DC-009", "vid": 200, "name": "HALL-A-PROD", "group": "IL-DC-009" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `prefix`, `vrf`, `site`, `role`, `parentId` | string | M | hierarchy, outside-plan finding |
| `size`, `used` | int | M | utilisation, Consumed ≥ 90 % / Committed ≥ 75 % |
| `isPool`, `status` | boolean / enum | O | exclude containers / point-to-point from forecast |
| `vrfs[]`, `vlans[]` | array | O | registers, VLAN uniqueness per site |

#### API-IPM-02 Addresses by device / interface

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /ipam/addresses?device=` | In | device page, DCIM device drawer, collector target check | on open + daily |

**Expected response:**
```json
{ "items": [ { "id": "IP-88412", "address": "172.31.40.20/24", "vrf": "MGMT-IL-DC-009", "deviceId": "BDR-01", "interface": "fxp0",
               "primary": true, "dnsName": "bdr-01.il-dc-009.mgmt", "status": "Active", "assignedOn": "2024-02-11T10:00:00Z" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `address`, `vrf`, `deviceId`, `interface`, `primary` | string / boolean | M | device addresses, primary management IP |
| `dnsName`, `status`, `assignedOn` | string / enum / time | O | facts; growth rate for the forecast |

#### API-IPM-03 Assign / release address

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /ipam/prefixes/{id}/next-address`, `DELETE /ipam/addresses/{id}/assignment` | Out | DCIM device drawer address actions (under a CR) | on user action |

**Request body:** `{ "deviceId": "SRV-0412", "interface": "mgmt0", "primary": true, "changeRequest": "CHG-2311" }`.

**Expected response:** `201` `{ "id": "IP-88517", "address": "172.31.40.41/24", "vrf": "MGMT-IL-DC-009" }`; `409` when the prefix is full.

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `address`, `vrf` | string | M | show the new address, audit with the CR |

---

### C.11 Plan to Build — Programs & Projects

Module: Programs & Projects (with its work orders, processes and commissioning). SynapseDC hands approved plans over as projects and reads delivery back for its analytics pages. It is used on Programs & Projects Insights (8.1), Work orders & process KPIs (8.2), Commissioning (8.3), the Planner (Delivery tab, plan pack, closeout) and the Command Center build lens.

#### API-PRJ-01 Programmes

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /programmes`, `GET /programmes/{id}` | In | Insights programme progress (ANL-001…), programme gates | hourly + events |

**Expected response:**
```json
{ "items": [ { "id": "PGM-02", "name": "Chicago AI hall expansion", "owner": "USR-077", "rag": "Amber",
    "phases": [ { "projectId": "PRJ-0004", "name": "Hall B fit-out", "dependsOn": [], "status": "Executing" },
                { "projectId": "PRJ-0021", "name": "Liquid cooling loop", "dependsOn": ["PRJ-0004"], "status": "Waiting at gate" } ],
    "budget": { "amount": 18400000, "currency": "USD" } } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `name`, `owner`, `rag` | string / enum | M | programme cards |
| `phases[]` projectId, dependsOn, status | array | M | start gates, roadmap |
| `budget` | money | O | programme budget |

#### API-PRJ-02 Projects

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /projects?site=&status=`, `GET /projects/{id}` | In | Insights health matrix, needs attention, cost curve, plan Delivery tab (PLN-026) | hourly + events |

**Expected response:**
```json
{ "items": [ { "id": "PRJ-0004", "planRef": "PLN-0004", "name": "Hall B fit-out", "siteId": "IL-DC-009", "status": "Executing",
    "target": "2027-03-31", "forecastFinish": "2027-04-18",
    "milestones": [ { "id": "MS-1", "name": "Power cut-in", "due": "2026-12-10", "done": null } ],
    "cost": { "bac": { "amount": 6200000, "currency": "USD" }, "pv": 2100000, "ev": 1890000, "ac": 2050000 },
    "risks": [ { "id": "RSK-31", "title": "Transformer lead time", "likelihood": 4, "impact": 4, "status": "Open" } ],
    "changeOrders": [ { "id": "CO-12", "amount": { "amount": 280000, "currency": "USD" }, "status": "Approved", "approver": "sponsor" } ],
    "permits": [ { "name": "Electrical permit", "authority": "City of Chicago", "status": "Granted" } ] } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `planRef`, `siteId`, `status` | string / enum | M | plan ↔ project link, filters |
| `target`, `forecastFinish` | date | M | late rule |
| `milestones[]` | array | M | next 14 days, schedule |
| `cost.bac`, `pv`, `ev`, `ac` | money / number | M | CPI = EV ÷ AC, SPI = EV ÷ PV, health (late SPI < 0.90; at risk CPI < 0.95 or SPI < 0.97) |
| `risks[]` likelihood, impact, status | array | O | risk ranking |
| `changeOrders[]`, `permits[]` | array | O | change outcomes, permits widget |

#### API-PRJ-03 Work orders and process instances

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /work-orders?site=&status=`, `GET /processes/instances?process=` | In | Work orders & process KPIs (8.2), site Ops log, DCIM CR work | every 15 min + events |

**Expected response:**
```json
{ "workOrders": [ { "id": "WO-0004-07", "projectId": "PRJ-0004", "changeRequest": "CHG-2311", "siteId": "IL-DC-009",
    "title": "Install busway B, Hall B", "crew": "Contractor: Ameresco", "window": { "start": "2026-11-03T08:00:00Z", "end": "2026-11-03T18:00:00Z" },
    "status": "Ready", "kit": "On site" } ],
  "instances": [ { "id": "P10-0441", "process": "P10", "step": "Complete with evidence", "lane": "Field technician",
    "startedAt": "2026-10-26T09:00:00Z", "targetH": 8, "state": "Running", "ref": "WO-0004-07" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| work order `id`, `projectId`, `changeRequest`, `siteId`, `status`, `window` | string / enum / object | M | running work, next 14 days, CR link |
| `crew`, `kit` | string / enum | O | kit-on-site rule |
| instance `process` (P01–P12), `step`, `lane`, `startedAt`, `targetH`, `state`, `ref` | string / time / number / enum | M | swimlanes, ageing, process KPIs |

#### API-PRJ-04 Commissioning tests

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /projects/{id}/commissioning` | In | Commissioning (8.3), plan closeout | hourly + events |

**Expected response:**
```json
{ "projectId": "PRJ-0004", "tests": [
  { "level": "L1", "name": "Factory witness", "status": "Passed", "date": "2026-09-14" },
  { "level": "L3", "name": "Pre-functional", "status": "Blocked", "reason": "Installation not complete" },
  { "level": "L5", "name": "Integrated systems test", "status": "Not started" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `tests[]` level, name, status, date, reason | array | M | L1–L5 ladder, handover readiness |

#### API-PRJ-05 Purchase orders and goods receipt

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /projects/{id}/purchase-orders` | In | plan Materials and pack (PLN-041), Insights materials | hourly + events |

**Expected response:**
```json
{ "items": [ { "id": "PO-0004-02", "vendor": "Schneider Electric", "planLine": "UPS 1250 kVA", "phase": 1, "amount": { "amount": 812000, "currency": "USD" },
               "orderedOn": "2026-10-05", "promisedOn": "2027-01-20", "status": "Ordered", "received": null } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `vendor`, `planLine`, `phase`, `amount` | string / int / money | M | PO = plan vendor order parity |
| `orderedOn`, `promisedOn`, `status`, `received` | date / enum | M | late materials, kit status |

#### API-PRJ-06 Create project from an approved plan

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /projects` | Out | Planner "Start the build" (PLN-026) | on user action |

**Request body:**
```json
{ "planRef": "PLN-0004", "name": "Hall B fit-out", "siteId": "IL-DC-009", "target": "2027-03-31",
  "milestones": [ { "name": "Power cut-in", "due": "2026-12-10" } ],
  "budget": { "amount": 6200000, "currency": "USD" },
  "bom": [ { "line": "UPS 1250 kVA", "qty": 2, "source": "buy", "vendor": "Schneider Electric", "phase": 1 } ],
  "holds": ["HLD-5512"], "records": [ { "kind": "rack", "count": 48 }, { "kind": "prefix", "ref": "10.9.32.0/22" } ] }
```

**Expected response:** `201` `{ "id": "PRJ-0004", "status": "Mobilising", "link": "https://{platform}/projects/PRJ-0004" }`.

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `status`, `link` | string / enum / url | M | plan page Delivery tab, deep link |

#### API-PRJ-07 Handover status / signal

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /projects/{id}/handover`, `POST /projects/{id}/handover` | In / Out | plan closeout, plan status line | on change |

**Expected response:**
```json
{ "projectId": "PRJ-0004", "ready": false, "checks": [ { "name": "All work orders done", "ok": false }, { "name": "L1–L5 passed", "ok": false } ], "handedOverAt": null }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `ready`, `checks[]`, `handedOverAt` | boolean / array / time | M | plan → Completed when handed over |

#### API-PRJ-08 Events

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| subscription `project.changed`, `workorder.changed`, `commissioning.changed`, `po.changed` | In | analytics pages, planner | push |

```json
{ "type": "workorder.changed", "id": "evt_7f2", "time": "2026-10-27T09:30:00Z", "subject": "WO-0004-07", "data": { "status": "In progress" } }
```

---

### C.12 Supply Chain

Module: Materials, Vendors, Contracts, Procurement, Warehouses, Field Force Management. SynapseDC uses it for support contracts, catalogue prices and lead times, spares, purchase orders from plans and field visits. It is used on site Assets (lifecycle, RMA, spares), the Planner (sourcing, Materials, pack), the Access tab (contractor visits) and Work orders.

#### API-SCM-01 Vendors, contracts, support levels

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /vendors`, `GET /contracts?type=support` | In | lifecycle (Covered / Expiring), Planner channels | weekly |

**Expected response:**
```json
{ "vendors": [ { "id": "VND-DELL", "name": "Dell Technologies" } ],
  "contracts": [ { "id": "SUP-DELL-114", "vendorId": "VND-DELL", "level": "ProSupport 4h", "assets": ["SRV-0007", "SRV-0008"], "end": "2026-12-31" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `vendors[]` id, name | array | M | names |
| `contracts[]` level, assets, end | array | M | support state per device |

#### API-SCM-02 Catalogue prices and lead times

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /catalog/items?kind=` | In | Planner BoM pricing and schedule (PLN-018) | daily |

**Expected response:**
```json
{ "items": [ { "id": "CAT-UPS-1250", "kind": "UPS", "model": "Galaxy VX 1250 kVA", "vendorId": "VND-SCHN", "rating": { "kva": 1250 },
               "price": { "amount": 406000, "currency": "USD" }, "leadTimeWeeks": 26, "contractId": "FWA-SCHN-2025" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `kind`, `model`, `vendorId`, `rating` | string / object | M | model choice, same-rating swap |
| `price`, `leadTimeWeeks`, `contractId` | money / int / string | M | CapEx, order-by dates, contract channel |

#### API-SCM-03 Stock and spares

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /stock?site=&family=` | In | site Assets → Spares, RMA, Planner sourcing (stock before buy) | hourly |

**Expected response:**
```json
{ "items": [ { "site": "IL-DC-009", "family": "SFP-10G-LR", "onHand": 6, "reserved": 1, "minimum": 4, "warehouse": "WH-CHI-01" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `family`, `onHand`, `reserved`, `minimum` | string / int | M | spare available, below-minimum flag, sourcing |

#### API-SCM-04 Purchase orders from a plan

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /purchase-orders`, `GET /purchase-orders/{id}` | Out / In | Planner "Start the build" (vendor orders per vendor and phase) | on start; status hourly |

**Request body:** `{ "projectId": "PRJ-0004", "vendorId": "VND-SCHN", "phase": 1, "lines": [ { "catalogId": "CAT-UPS-1250", "qty": 2 } ], "status": "Draft" }`.

**Expected response:** `201` `{ "id": "PO-0004-02", "status": "Draft" }`.

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `id`, `status` | string / enum | M | parity with the plan's orders |

#### API-SCM-05 Field Force Management jobs and visits

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /ffm/jobs?site=&from=&to=` | In | Access tab (expected contractor visits), Work orders, RMA engineer booked | every 15 min |

**Expected response:**
```json
{ "items": [ { "id": "FFM-22014", "site": "IL-DC-009", "kind": "RMA", "ref": "RMA-0091", "engineer": "J. Ortiz", "company": "Dell", "window": { "start": "2026-10-28T09:00:00Z", "end": "2026-10-28T12:00:00Z" }, "status": "Booked" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `site`, `kind`, `ref`, `window`, `status` | string / object / enum | M | visit expected vs badge-in, RMA progress |
| `engineer`, `company` | string | O | on site now list |

---

### C.13 Platform Engineering

Module: Platform Engineering (identity, configuration, customisation). SynapseDC uses it for who the user is and what they may see, feature flags and the deployment's persona / geography defaults, and custom fields. It is used on every screen.

#### API-PEN-01 Identity

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| OIDC `/userinfo` + token claims | In | shell, every write (audit actor), scoped APIs (XC-002, XC-011) | on sign-in, token refresh |

**Expected response:**
```json
{ "sub": "USR-114", "name": "Priya Nair", "email": "priya@operator.example", "roles": ["dc.noc", "dc.planner.approver"],
  "scope": "alerts:read incidents:write dcim:write", "dc": ["IL-DC-009", "CA-DC-020"], "tenant": null }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `sub`, `name` | string | M | audit, worklog author |
| `roles[]`, `scope` | array / string | M | what the user may do (approve, DCIM write) |
| `dc[]` | array | O | site scope filter |
| `tenant` | string | O | tenant-scoped views (NB-12) |

#### API-PEN-02 Feature flags and tenant configuration

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /config?app=synapsedc` | In | shell (persona default, overrides), GPU Fleet visibility | on load |

**Expected response:**
```json
{ "personaDefault": "neocloud", "personaOverride": null, "geoOverride": null, "flags": { "realisticTwin": true, "secops": true } }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `personaDefault`, `personaOverride`, `geoOverride` | string | M | BRULE-XC-01 |
| `flags` | object | O | phase-gated features |

#### API-PEN-03 Custom fields and tags

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `GET /custom-fields?entity=rack,device,site,customer`, `GET /tags` | In | DCIM explorer columns, filters (DATA-010) | daily |

**Expected response:**
```json
{ "fields": [ { "id": "CF-12", "entity": "rack", "name": "Insurance class", "type": "enum", "options": ["A", "B"] } ],
  "tags": [ { "id": "TAG-4", "name": "Liquid ready", "rule": "rack.liquid == true" } ] }
```

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `fields[]` entity, name, type, options | array | M | extra columns and filters |
| `tags[]` name, rule | array | O | tag chips evaluated over the estate |

---

### C.14 Intelligence Hub

Module: Intelligence Hub (data model registry, data lake). SynapseDC registers its datacenter entities and sends roll-ups for BI. It is used by the Data model reference page and exports.

#### API-IHB-01 Register data model

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `PUT /registry/domains/synapsedc` | Out | release pipeline (INTG-032) | on each release |

**Request body (excerpt):**
```json
{ "domain": "synapsedc", "version": "1.0.0", "entities": [
  { "name": "Rack", "owner": "Inventory", "fields": [ { "name": "budgetKw", "type": "number", "class": "Import" }, { "name": "drawKw", "type": "number", "class": "Live" } ] },
  { "name": "PowerFeed", "owner": "SynapseDC", "fields": [ { "name": "ratingKw", "type": "number", "class": "Derived" } ] } ],
  "relationships": [ { "from": "PowerFeed", "to": "Rack", "kind": "feeds" } ] }
```

**Expected response:** `200` `{ "domain": "synapsedc", "version": "1.0.0", "entities": 51, "relationships": 107 }`.

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `version`, `entities`, `relationships` | string / int | M | confirm the registration matches the release |

#### API-IHB-02 Data lake / BI export

| Method · illustrative path | Direction | Called by | Rate / trigger |
| --- | --- | --- | --- |
| `POST /lake/datasets/{name}/partitions` | Out | daily export (INTG-033) | daily |

**Request body:** `{ "dataset": "dco_incident_impact", "partition": "dt=2026-10-27", "format": "parquet", "uri": "s3://…/dco_incident_impact/dt=2026-10-27/part-0.parquet", "rows": 1842 }`.

**Expected response:** `201` `{ "dataset": "dco_incident_impact", "partition": "dt=2026-10-27", "status": "registered" }`.

| Field | Type | Req. | Used for |
| --- | --- | --- | --- |
| `status` | enum registered / rejected | M | export health under Data Ops |
