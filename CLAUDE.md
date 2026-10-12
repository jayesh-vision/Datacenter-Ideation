# Data Center Operations (DCO) — ideation prototype

Navigable React prototype of the Data Center Operations product described in
`Data_Center_Operations_Master_Requirements_Blueprint_v0.1.docx` (requirement IDs
DC-INV-*, DC-SITE-*, DC-NET-*, DC-FAC-*, DC-OPS-*, DC-CAP-*, DC-AI-*, WF-01…07) and the
reference screens in `screens-shot/` (Inventory = INV-01…09, Datacenter = later ideation).

**Flow to preserve:** Estate → Datacenter → Infrastructure → Connectivity → Services →
Customers → Events → Impact → Diagnosis → Recommended action.

## Scope rules (user, 01-Oct-2026)
- Mock data only. No production DB, backend APIs, collectors, auth or final data model.
- Don't invent major capabilities that aren't in the blueprint; keep any necessary gap-fillers minimal and isolated.
- AI (Sentinel, RCA, recommendations, forecasts) is deterministic mock logic grounded in the mock data.
- Data must reconcile everywhere (e.g. MH-DC-001 = 179 NE, 103 discovered, 21 drifted, 76 not discovered).

## Architecture (`app/`)
- Vite · React 19 · TS · react-router 7 · lucide-react · leaflet. Dev: `npm run dev` → http://localhost:5181
- `src/api/types.ts` — the API contract. `src/api/index.ts` — the ONLY module screens import for data
  (async `getX()` + mutations + `useQuery`). Each function notes its future REST path.
- `src/mock/` — seeded generator (`seed.ts`, `generate.ts`, `incidents.ts`), the mock server
  (`server.ts`: queries, roll-ups, mutations), `sentinel.ts` (mock copilot). Screens never import mock/.
- All counts are derived from entities (NE, interfaces, links, services, alerts, incidents…), never typed in.
- Shell: `src/shell/` (Layout rail + topbar crumbs, Palette ⌘K search, Sentinel drawer). Pages call
  `usePage(crumbs, sentinelCtx)`.
- Shared UI: `src/ui/kit.tsx` (Chip, Btn, Panel, Kpi, Tabs, Seg, Drawer, Modal, Menu, KV, Empty…),
  `src/ui/DataTable.tsx`, `src/ui/status.tsx` (status chips, Meter, StackBar, entity links, Fresh),
  `src/charts/*` (TimeChart, Donut, BarList, Sparkline, HeatGrid). Status vocabulary: `src/lib/vocab.ts`.

## Design system — NST / Vision Waves (non-negotiable)
Same rules as `../FFM/CLAUDE.md`: load nst-design-system.css + components.css; Poppins for chrome,
Inter tabular for numbers; colours only via NST tokens (`--vw-color-*`, `--primaryColor*`); `.nst-table`,
`.nst-btn`, `.vw-chip`; no secondary left menus inside screens (tabs / pills / cards instead).
App CSS: `src/styles/app.css` (from FFM), `base.css` (shared DCO classes), plus one css file per screen area.

## QA bar (mandatory before calling anything done)
`node .qa/shot.mjs "/route|name" …` → full-page screenshots in `.qa/out/` + text/overflow/console checks.
Review every screen critically; every control must work; no NaN/undefined; no horizontal overflow at 1280/1440.

## Operations scope model (decided with the user, 01-Oct-2026)
This is a datacenter **operations** tool. Estate, Locations and Reconciliation (inventory / build) are parked
outside the menu (code kept for a future Plan & Build or Inventory section; old URLs redirect to /datacenters).
An alarm counts against a datacenter only when it is in scope (`Alert.scope`, computed in `mock/generate.ts`
`scopeOf` and per-site in `mock/server.ts` `scopeFor`):
- **site**: inside the datacenter (facility, racked devices, internal links);
- **edge**: a link leaving the site (backhaul, PoP uplink), which counts for both ends;
- **dependency**: something the site depends on outside it (far-end node as it affects the edge link, shared AAA/NTP, collectors);
- **downstream**: remote PoPs and sites that depend ON the datacenter. They are never counted. When the datacenter is the cause,
  they appear as `symptomOf` impact under the incident, not as separate issues.
Edge redundancy (`DcSummary.edge`): redundant / redundancy-lost / isolated. Guarded by `npx tsx .qa/scope-check.ts`.
Scope decisions 02-Oct-2026: the menu is Command center · Revenue impact (added 05-Oct-2026) · Datacenters · Facilities · AI & GPU (05-Oct-2026, GPU estates only) · Alerts · Incidents · Changes & maintenance.
Topology left the menu 05-Oct-2026 (user): it lives only as the datacenter page's Topology tab; `/topology?dc=X` redirects to that tab.
Network services, Customers and Capacity & forecast are parked (code kept, routes redirect); services and customers appear only as
impact on incidents, devices and sites. Revenue was hidden until 05-Oct-2026; the user then asked for it — see "Revenue impact" below. Site tab ORDER (08-Oct-2026, user): Overview · Attention · Metrics · Power & space · AI & GPU · Equipment · Assets · Topology · Customers ·
Revenue · Ops log (health → plant & installed base → connectivity → impact → history). Site tabs: Overview (3D) · Attention · Topology (`TopologyView` from screens/Topology.tsx, same view as the /topology page) · Metrics (aggregated thermal/power/backup/fault KPIs)
· Customers (customers served from the DC) · Revenue (`site/Revenue.tsx`) · Assets (floors/rooms/racks, equipment by category, facility plant) · Equipment
(installed devices only; planned devices = reserved rack space) · Power & space · Ops log. Cabling tab hidden (02-Oct-2026; `site/Equipment.tsx` kept). No discovery/drift/reconciliation UI.

## Personas (02-Oct-2026) — one estate, four business models
Top-bar dropdown (`shell/Layout.tsx` PersonaSwitch) sets `Persona` = network | colocation | cloud | enterprise | neocloud (localStorage `dco.persona`).
`mock/server.ts` regenerates the whole mock (`generate(persona)`) and notifies subscribers, so every screen refetches. Sites, power,
cooling, alarms and incidents are shared; `mock/personas.ts` holds per-persona vocabulary (customer/service/premium words, capacity
unit), customers, service types (`Service.qty` + `unit`), room names and incident titles. Rack contents: telco = routers/switches/DWDM
(unchanged, byte-identical to before — MH-DC-001 179/103/21/76 holds ONLY in the network persona); colocation = operator MMR + opaque
`Tenant gear` blocks (role, `Rack.owner/tenantId/contractedKw`, OpsState `tenant-owned`, never polled); cloud/enterprise = leaf–spine
fabric + Server/Storage/GPU hosts (telemetry, modules, host alerts). `NE_CATEGORY` maps role → network/compute/storage/tenant.
Screens read words via `usePersona()` / `vocabNow()`; topology draws network devices only (hosts counted per ToR).
QA: `node .qa/persona.mjs` (all screens × 4 personas + dropdown) and `.qa/persona-twin.mjs`.
Tall sites (6–7 floors, `PersonaDef.tall`): network DL-DC-009, colocation KA-DC-020, cloud TN-DC-022, enterprise HR-DC-011.
Twin default view highlights attention (`twin/attention.ts`): beacons on racks with critical/major issues, red/amber floor & room
edges, issue counts on floor labels, ≤3 critical callouts (one per room) and a "Needs attention" card that drills to the item.
Customer lists show "Why at risk" from `servicesOf().causes` (server.ts `causeIndex`); seeded scenarios at MH-DC-001 per persona.

## Revenue impact (05-Oct-2026) — what every open issue costs
User ask: show revenue degradation caused by datacenter issues and which issue costs the most. Model = `mock/revenue.ts`
(`buildRevenue` once per data version, `revenueView(dcId?)` per scope; API `getRevenue({ dcId })`, types `Rev*` in api/types.ts).
- A service is **down**, **degraded** (losing now) or **exposed** (Active but riding a CRITICAL fault: UPS on battery, failed CRAH,
  critical alarm on its path). Not a loss: a service hot inside its own contracted size (utilisation causes, tenant over power budget).
- Each impacted service is charged to ONE issue = its most severe `ImpactCause` (link/port/rack/site before device, single-PSU last);
  the issue is the open incident tracking that alarm, else faults grouped by site + title. `ImpactCause` carries `since/incidentId/domain`.
- Money: rate = monthly ÷ 730 h (degraded × 0.3); lost = rate × hours since the alarm began; credits = extra SLA tier caused by the
  impacted minutes (shortfall >0 → 10%, ≥0.5 pt → 25%, ≥2 pt → 50% of the monthly charge), net of credits already "locked in"
  (uptime30d < target). `nextCliff` = next tier step; `forecast24`; exposed → `potentialRate` / `potentialCredits` (4 h outage).
- Losses are charged to the datacenter where the FAULT is (a backhaul fault also degrades services homed at far-end sites).
- Everything must reconcile: Σ issues = Σ causes = Σ datacenters = Σ customers = Σ site views = total. Check: `npx tsx .qa/revenue-check.ts`.
- 30-day history = resolved incidents (duration × severity × site average) + locked-in credits + today's open impact.
- Screens: `/revenue` (`screens/Revenue.tsx`: strip of 6 tiles, two answer cards "Costing the most right now" / "Most at stake" with a
  cost-of-delay curve, tabs Issues · Customers · Datacenters · Causes & trend · One failure away; row → cost-breakdown drawer;
  "How it is calculated" drawer). Shared parts in `screens/revenue/parts.tsx` (IssueTable, IssueDrawer, CostCurve, Fig, lc()).
  Also: datacenter Revenue tab, incident "Revenue impact" panel, a column on the Datacenters and Incidents lists (the Command center band was
  removed 08-Oct-2026, to be re-placed later), Opstral AI answers ("Which issue is costing the most revenue?", "What is INC-0002 costing us?").
- Words come from `vocab.money` (enterprise = Business value / Business impact / Cost of downtime / OLA rebates); use `lc()` to
  lower-case them (keeps SLA/OLA). Money in a grid cell uses `.rev-amt`, NOT `.strong` (that class forces a 220px column).
- Customer page (`screens/CustomerDetail.tsx`, 05-Oct-2026): identity header (avatar, state, facts row, one-line verdict with the main
  cause), analytics strip of 6 tiles, "What is impacting this customer" (issues from `customer().hits`, money per issue) beside "Where
  they are served", then the service grid. Styles `styles/customer.css`. Check: `node .qa/customer.mjs <persona>`.
- Layout check: `node .qa/revenue.mjs <persona>` (no table overflow, no cut text, equal cards, drawer, all related screens).

## Visual rhythm (02-Oct-2026) — one system, not per-screen styling
- `OpsKpi` (screens/ops/shared.tsx) is THE KPI card everywhere: `.app-kpi` = white `.vw-card-section`, grey icon, light metric,
  `.vw-card-variance` note; state only via the 3px top accent (red = fault, amber = attention). No pastel-tinted tiles.
- Datacenter page pinned header (07-Oct-2026, user): the slim site bar + the tab row stay pinned under the top bar (`.site-sticky` in
  Site.tsx / site.css); expanded header mode pins only the tabs. Its measured height is `--site-sticky-h`, used to pin list toolbars and
  grid headers inside tabs just below it. Tabs stay on one row at 1280 (tighter pills). Check: `node .qa/site-sticky.mjs`.
- Datacenter page (02-Oct-2026): header collapses to a slim bar (default; remembered per browser) with flagged-KPI chips
  (`site/FlagRow.tsx`, auto-fits, "+N more") and telemetry freshness. Inside site tabs use `site/SummaryStrip.tsx`
  (one slim card, clickable items = filters), not rows of OpsKpi cards.
- Page: `.page` gap/padding, panel density, tabs and table toolbar come from the tail of `styles/base.css`; per-screen CSS does layout only.
- Side-by-side cards must be equal height (`.qa/heights.mjs` checks the command center); nothing clipped at 1280.
- Grids (02-Oct-2026, from the user's platform reference): light slate-50 header band, regular 13px labels, roomy 13.5px rows,
  `table-layout: auto` (columns size to content; DataTable ignores `width` hints except in compact tables), text cells wrap,
  equal-width NST pastel pills (status pills have a dot; no solid SEV1). Check with `node .qa/grids.mjs <persona>` (no table overflow).
- List pages open with an analytics strip from `ui/Analytics.tsx` (StatGrid of 6 StatTiles: headline + soft proportion bar with
  NST pill legend / meter / facts / mini bars / ranked list; tiles and pills click through to the list filters). Datacenters, Alerts,
  Incidents, Changes use it; colours = NST pill palette (200–300 shades for bars). Check: `node .qa/analytics.mjs`.
  Tile rhythm is fixed (label 18 · number 34 · qualifier 18 · bar) so every bar lines up; every tile leads with a bar or meter.
  Calm palette (05-Oct-2026): bars in a blue-grey ramp, red/amber only for faults; breakdown = one column of ≤3 rows
  (most severe first, rest folded into "Other"); a breakdown tile shows one fact line at the bottom, a meter tile up to three.
  Check: `node .qa/tiles2.mjs` (equal heights, same bar/fact lines, nothing cut).
- Facilities (04-Oct-2026 redesign): shared analytics strip, then tabs. Power = single-line power-path diagram (`PowerPath`, measured
  layout, HTML nodes over SVG edges, animated flow, hover traces upstream/downstream), 24 h load chart vs capacity, "If utility power
  fails" ride-through (UPS min → DG kW → fuel hours + readiness checks), rack load tiles + table. Cooling = heat balance + unit cards.
  Environment = zone cards with safe-band tracks. Styles in `styles/facilities.css`. Check: `node .qa/facilities.mjs`.
- Datacenters list has a list ⇄ tiles switch (ListToolbar `layout` prop); tiles reuse `screens/ops/DcCard.tsx`, the same card as the
  Command center's Critical-now lane (worst open incident per site, or a quiet variant). Check: `node .qa/dc-tiles.mjs`.
- Estate map (`overview/DcMap.tsx`, 04-Oct-2026): Esri basemaps Light/Streets/Satellite/Terrain (remembered), rippling pins for
  SEV1/2 and incident sites, animated dashes on backhaul that is down, click → summary popup + that site's backhaul fan-out, expand button fills the content area (Esc closes),
  legend items toggle states, Focus-issues / Reset buttons, wheel-zoom only after clicking the map, a search tool (top of the tool column,
  `MapSearch`: id / city / state / region / tier via `DcPin.place`; pick → fly to the site + open its card). Check: `node .qa/map.mjs`.
- Lists keep their toolbar and column header pinned under the top bar while rows scroll (sticky; wrappers use `overflow: clip`,
  never `hidden`, around a `.dt`). Check: `node .qa/sticky.mjs`.
- Every list uses `ui/ListToolbar.tsx` (no hand-built toolbars): `Showing N of M` · search · ≤2 quick filters (searchable dropdowns)
  ··· refresh · filter icon (Filters panel: categories / options / Reset to default / Apply filters) · ⋮ actions. URL-backed lists pass
  `onApply={useParamPatch()}`. All grid columns left-aligned (header = values). Check: `node .qa/toolbars.mjs`.
- Palette: slate/white, brand blue accent, red/amber for faults only. The digital twin (`screens/site/twin`) is signed off — don't restyle it.

## Command center layout (02-Oct-2026, after the user rejected the 17-box version)
Hero card (08-Oct-2026, user) = three columns 30 / 40 / 30, 600 px tall: health ring + title/band + one verdict line + weakest area,
a 2 × 2 strip of clickable numbers (Critical · High · Past SLA · premium customers; colour on the number only), then 4 areas as rows (left;
check `node .qa/cc-verdict.mjs`) · the live
DcMap (middle) · a vertically scrolling column of every live datacenter as a `DcCard`, worst first, with an All / Critical / High quick
filter on the worst open incident; cards there are a compact variant (CSS under `.hero-dcs-list`, ~286 px, ≥1.5 visible) (`DcColumn` in CommandCenter.tsx; the mock's `dcMap` rows carry `condition` + the quiet-card fields).
The vitals strip, the horizontal Critical-now lane and the revenue band were removed (08-Oct-2026, user; revenue will get a proper place on
the Command center later). Then ONE row of three equal columns, 600 px, bodies scroll (`.cmd-trio`): What is happening · Who is affected ·
Recommendations (renamed from "What to do next", user 12-Oct-2026). The "Why" (root-cause families) panel was removed 08-Oct-2026. Checks: `node .qa/cc-hero.mjs`, `node .qa/cc-trio.mjs`.
Don't reintroduce rows of boxed KPI tiles on the landing page.
Area rows (12-Oct-2026, user): each of the 4 areas carries `sites` (datacenters with an issue there, critical first, note + deep link) shown as
chips under the detail line (2 names at 1440, 1 at 1280, then "+N" listing the rest on hover; `.only-wide` / `.only-narrow`), the score has a
caption (`unit`: within SLA · links up · plant online · in range) and the state word sits above the score. The title is a stretched link
(`.hero-area-link::after`); chips are their own links. The area icon column is hidden at 1280 so labels never wrap; the hero stays 600 px.
Each area also carries `good` / `total` / `items` / `why` (server.ts `explain`): the % = good ÷ total, higher is better, caption "healthy"
(response: "within SLA"); the status word follows the worst single issue (one UPS on battery = Critical at 98%) and its hover says why; the
score bar is always neutral blue. Power story (12-Oct-2026 data fix): at dcAt(9) only utility feed A is lost and the ATS has moved its load
onto standby feed B; UPS-2 is on battery (before, both feeds were marked lost, which contradicted the alarm / incident / RCA).

Hero numbers must add up (12-Oct-2026, user caught "7 of 23" next to 1 Critical + 8 High): the verdict line reads "N critical or high incidents at
S of 23 datacenters" (N = Critical + High tiles; a site can carry several) with an info bubble listing each site (`situation.critBySite`). The High
tile opens `/incidents?view=high` (new view, open + High), the premium-customer tile scrolls to "Who is affected" (`.cc-affected`), never an
unfiltered list. Check: `npx tsx .qa/cc-numbers.ts` (every hero figure vs the list it links to, 5 personas × India/USA).

## Info icons (12-Oct-2026, user) — an "i" on every widget
`Info` in `ui/kit.tsx` (portalled bubble, flips near the bottom, click inside a link only toggles). `info?: string` on `Panel`, `Kpi`, `OpsKpi`,
`StatTile` and `SummaryStrip` items; hand-built headers place `<Info text=…/>` after the title. Texts: 1–2 sentences — what the widget shows, how
the number is computed, what clicking does; persona vocabulary via `vocabNow()`. New widgets must get one.

## Realistic digital twin (08-Oct-2026, user) — a second 3D view, the first one untouched
The datacenter Overview tab now hosts two 3D views (`site/TwinHost.tsx`): a slim bar "Digital twin · Building › Floor › Room › Rack ›
Equipment" with a View switch Schematic | Realistic (`?twin=schematic|realistic` wins, then localStorage `dco.twin.view`; default
schematic). Schematic = the signed-off twin in `site/twin/*` (still frozen). Realistic = `site/twin2/*`, a port of the user's friend's
DC-Digital-View prototype (`../DC-Digital-View/`, untracked, kept as the visual reference): textured device bezels per role (server /
GPU / storage / switch / router / firewall / optical / tenant / patch), perforated cabinet doors (the selected rack's door swings open),
ID plates, LED light bars, overhead wire-basket + fibre trays with drops into every rack, cold-aisle containment (only where racks face
each other), white CRAH / UPS / rectifier cabinets and a dark battery bank with textured fronts, a DG canopy outside, glass curtain
wall + roof parapet at building level, studio lighting, AO + LED bloom (`@react-three/postprocessing`; dropped automatically on slow GPUs).
Rack / device camera is its own (`aislePose`, 08-Oct-2026 fix: the shared straight-back pose ended up inside the facing row): rack =
front-on from 3.5 m with the facing row of the same pair faded to glass (`facingRow`, no clicks, devices hidden); device = close-up from
inside the cold aisle. It reuses the schematic twin's layout (`twin/layout.ts`), attention roll-up, camera poses (backed off 1.2× at building / floor level),
`TwinPanel` and `Pick` semantics, so numbers, drill path and panel are identical in both views. Floor mode shows only the chosen floor.
Overlays: Health · Temperature (floor heat-map from rack inlets) · Rack power · Connectivity (edge stubs). Labels are DOM anchors
projected every frame (`twin2/anchors2.ts`), never drei `Html` (per-label React roots break under React 19). Rules carried over: health is
shown by LEDs, beacons and halos, cabinets stay neutral. Check: `node .qa/twin2.mjs` (and `W=1280`); it is slow under software GL.
Realistic twin additions (12-Oct-2026, user): an open room names every rack with a status dot (as the schematic does; the label overlay
steps overlapping labels apart and keeps them clear of the controls); a rack label opens that rack. With a rack open, its facing row and the
cold-aisle frame are left out entirely (the glass ghost still blocked the view). Plant is selectable (`twin2/units.ts`: cooling units, UPS,
rectifier, battery bank, DG; key kept beside `Sel` because the schematic types are frozen): the camera flies to the unit (staying inside the
room), racks / cabinets in the line of sight are hidden, and a card shows its facts + "Open in Facilities". **Walk** button = street-view mode
(`twin2/walk.tsx`): eye-level camera, drag to look, click the floor to walk there (ring marks the spot), W A S D / arrows (Shift faster),
scroll to zoom, racks and cabinets block the way, picking anything walks up to it, Esc stops. Check: `node .qa/twin2-walk.mjs`.

## Device digital twin (08-Oct-2026, user) — a pictorial, live view of one piece of equipment
3D since the user rejected the 2D diagram version ("don't use the reference screenshots as is"): `screens/ne/twin3d/` (`kit.tsx` hardware primitives —
chassis, port cages + link LEDs, spinning fans, finned heatsinks, PSUs, DIMMs, Pick (hover outline, fault halo), Ex (explode / lid motion), canvas
captions; `devices.tsx` models per family + rack + accelerator; `Device3D.tsx` stage, modes Device · Open lid · Exploded · One accelerator · In the rack,
camera 3/4 · Front · Rear · Top, Health / Heat overlay). Inspector data still comes from the 2D scene builders below (`twin/scenes.tsx`), which are
also the no-WebGL fallback. Check: `node .qa/devtwin.mjs` (WebGL via SwiftShader).
Device page tab **3D view** (renamed from "Digital twin", user 08-Oct-2026) (`?tab=twin`, `screens/ne/twin/`: `model.ts` parts vocabulary + silicon lookup, `scenes.tsx` one builder per view
and family, `DeviceTwin.tsx` SVG renderer + inspector; styles `styles/devtwin.css`). Views (`?tview=`): face (front panel / rear I/O / front & rear),
inside (top view: ASIC or NP7, control CPU, DRAM, port cages, PSUs, fans; DWDM = optical path; GPU = 8 GPUs + NVSwitch / PCIe switch / RoCE / Xe Link,
CPUs, NICs, BMC, PSUs, fans or coolant manifold), chip (GPU only, `?gpu=0..7`: die with SMs lit by SM-active, HBM / GDDR stacks, scale-up ports,
power, PCIe, cold plate / heatsink) and rack (busway A+B, PDUs, every device in the cabinet by U, cold/hot aisle or liquid manifolds;
`networkElement()` returns `rackNes`). Part colour = kind (compute · power · cooling · network · memory · storage · management, the reference's
legend); state from modules, interfaces (down / admin-down / errors / flaps), GPU telemetry and rack power. Click → inspector; issues listed in the
summary. Check: `node .qa/devtwin.mjs` (12 devices × every view × 1440/1280).

## Testing cadence (user, 02-Oct-2026)
Small change → verify only the affected screen (screenshot/measure at 1440 and 1280). Full suite `app/.qa/regress.sh` ONLY when the
user explicitly asks — not even before push/deploy. Digital twin is final: don't edit `src/screens/site/twin/*`, don't run `twin.mjs` / `twin-full.mjs`.

## AI & GPU (05-Oct-2026) — the most demanding hardware in the building
Menu item **AI & GPU** (`/gpu`, `screens/Gpu.tsx`) and a datacenter tab, both shown only when the estate has GPU infrastructure
(`hasGpuNow()`); telco has none (its data stays byte-identical — `npx tsx .qa/fingerprint.ts network` before/after).
- Data: `mock/gpu.ts`, phases called from generate(): A `buildGpuFleet` (per-GPU DCGM-style telemetry, pods of ≤32 nodes, jobs:
  one big training run + fine-tunes + inference, ~10% spares; liquid cooling + H200 at TN-DC-022 / KA-DC-020 / TS-DC-023 with CDU
  loops added to `dc.cooling.units`; colocation: 3 tenant racks per site → liquid AI cages 40–60 kW) · A2 `addGpuServices` (each job is
  a service on every node of the job: cloud 'GPU cluster' ₹1,75,000/GPU/mo, enterprise 'AI platform' charge-back ₹85,000) ·
  B `injectGpuFaults` (Xid 79 stalls the biggest KA-DC-020 training job; Xid 48 row-remap at MH-DC-003; NVLink straggler TS-DC-023;
  CDU flow low → hardware slowdown TN-DC-022; InfiniBand rail flapping UP-DC-005 (no incident, on purpose); power-capped rack
  DL-DC-009; 6 h idle inference WB-DC-016) · C `addGpuChange` (driver rollout) + `buildGpuIncidents` (INC-0061… type 'GPU').
- Every entity is seeded on its own id (`rngOf`), never on a shared stream, so adding GPU data never reshuffles the rest.
- Read model `mock/gpu-view.ts`: GPU time lost = stalled job all GPUs × rate, slowed job × step-time share lost, idle allocation × all;
  work to redo = GPUs × time since the last checkpoint. Revenue counts what customers are billed; this counts productive GPU time.
- Revenue: new cause `RevDomain` 'GPU' (Xid / ECC / NVLink); GPU heat counts as Cooling. `impactOf` takes `pathIds` so a job's service
  is hit by a fault on any of its nodes.
- Checks: `node .qa/gpu.mjs <persona>` (menu visibility, tiles, cards, drawers, tabs, site tab), plus `.qa/revenue-check.ts`.

## Demo playbook (05-Oct-2026)
`docs/dco-demo-playbook.html` = the customer demo script ("The 13:20 call", 11 acts incl. "AI cluster", same story per persona, persona switch,
"Open in tool" deep links carrying `?persona=` which the mock server honours on load). A copy is served at `/demo-playbook.html`
(`app/public/demo-playbook.html`) — edit the docs file, then copy it over. Its figures are taken from the mock at the fixed clock;
if the seed, incidents or revenue model change, re-check them.

## NeoCloud persona and DCGM telemetry (07-Oct-2026)
Fifth persona `neocloud` (GPU-as-a-service: customers rent reserved clusters and on-demand GPUs; scale 1.5,
GPU_RATE.neocloud ₹1,50,000/GPU/mo, SLA 99.9/99.5, tall site index 23). Same GPU layer (`mock/gpu.ts`) as cloud/enterprise;
every `persona === 'cloud'` branch that means "a GPU cloud" must include `neocloud`.
Bill of materials (user, 07-Oct-2026: "NeoCloud installs GPUs and what they need, not telco gear") — its own `buildNes` branch and link block
in generate.ts, no DWDM, no PE/AGG/ToR: 2 border routers `BDR-01/02` (Juniper MX304, the hero backhaul story lives on BDR-01 xe-0/0/3),
2 firewalls, `IB-SPINE`/`IB-LEAF` (NVIDIA Quantum-2 QM9700, 64 × 400G NDR, rail-optimised: a GPU node links two IB leafs at 400G),
`ETH-SPINE`/`ETH-LEAF` (NVIDIA Spectrum-4 SN5600 / Arista 7060DX5, 100G front-end + storage, BGP), `OOB-nn` (SN2201, 1G BMC ports),
hosts = 72% `GPU-nnn` (DGX H100 / Supermicro SYS-821GE-TNHR / Dell XE9680; H200 variants at the liquid sites), 10% `STG-nnn`
(VAST, WEKA, DDN), rest `CPU-nnnn`. Interface kinds `ce` (100G Ethernet on hosts, eth0..) and `ndr` (400G OSFP, ib0..7); hosts get
`mgmt0`. WAN-edge naming is per persona: `PersonaDef.edgePrefix` + `edgeId(persona, dcId, i)` (never write `PE-T4-01` literally;
screens use `heroNeId()`). Capex/opex labels and the Junos/BFD/fabric changes read per persona. Cloud/enterprise GPU nodes at liquid
sites now carry the H200 model name (only the model string changed).
Fabric planes (user, 07-Oct-2026): in NeoCloud, links read by network plane, not routing protocol — `lib/fabric.ts` `planeOf()` =
InfiniBand (400G) · Ethernet front-end (100G) · Management/OOB (1G or an OOB switch end). Device Links tab (`ne/Links.tsx`): every
device except the border routers shows "Fabric connections" plane cards (+ a BGP card where the switch runs it); border routers keep
the protocol cards. Command center row is "Network" (IB · Eth · OOB down · unreachable; the user asked 12-Oct-2026 that the Fabric category reads Network everywhere — area row, AI & GPU tab (id stays `gtab=fabric`), device "Network connections", link role chip, incident titles "N network cables down"). Cable incidents say "N fabric cables
down in X · HOST lost both front-end uplinks" with transceiver / fibre-trunk RCA and DOM actions. The persona switch, PERSONA_ICON, the playbook
and the embed guide list five personas.
GPU models & vendors (08-Oct-2026, user: "different NVIDIA GPUs … and other vendors like Intel"): catalogue `lib/gpuSpec.ts` (B200 · H200 · H100 ·
A100 · L40S · T4 from NVIDIA, Gaudi 3 · Data Center GPU Max 1550 from Intel: memory, TDP, clocks, scale-up link, fabric, server per OEM, driver,
telemetry source, `rateX` price vs an H100). One model per pod, chosen by site position in `mock/gpu.ts` `SITE_PLAN`; the GPU host NE takes
the pod's server model. L40S / T4 pods run inference jobs only. Fault stories (Xid 79 / 48 / 74, NVLink) pick NVIDIA pods only, so they land
where they did; drift = a node on its model's `driverOld`; job / service price = persona rate × `rateX` (H100 = H200 = 1). UI: AI & GPU
"GPU models" tab (vendor cards + model table → Nodes filtered by `?gmodel=` model or vendor), vendor tag + model on nodes, cluster cards,
jobs, node drawer hardware row (`[data-gpu-hw]`), vendor-aware telemetry labels (DCGM / Intel Gaudi hl-smi / Intel XPU Manager).
Check: `node .qa/gpu-models.mjs <persona>`.
GPU telemetry follows the NVIDIA DCGM exporter: `Gpu` carries the DCGM fields (comments name them: util / SM active / tensor /
mem copy / DRAM, FB used, GPU + HBM temp, power + energy, SM + mem clock, P-state, fan, throttle reasons, ECC SBE/DBE, retired
pages + row remap, PCIe replay + traffic, NVLink errors + traffic, last Xid); `GpuNode.series` = 24 h hourly history built AFTER the
faults (`buildGpuHistory`) so it ends on the current reading. `gpu-view.ts` adds `telemetry` (fleet histograms, 24 h series, energy,
P-states, Xid timeline, ECC totals, per-counter leaders, the DCGM field list). Screens: AI & GPU → Telemetry tab; node drawer and the
device page's "GPUs · DCGM" tab share `GpuNodeDetail` (health view + profiling view + 24 h sparklines); the datacenter Equipment tab
shows the 8-GPU strip for GPU nodes. New per-GPU random draws go AFTER the existing ones (same stream) so cloud/enterprise data
does not move. Check: `node .qa/gpu.mjs neocloud` (and cloud).

## Geography (06-Oct-2026) — India or the USA
`mock/geo.ts`: a geography = places (regions, states/circles, cities, the 24 site rows), customer locations, people, currency,
number locale and date style. India = the original seed; the USA = the same 24 sites BY POSITION (status, device counts, tier
identical) in US markets with `XX-DC-NNN` ids (VA-DC-001 Ashburn is the hero, IL-DC-009 Chicago the UPS site, CA-DC-020 the GPU
fault), US customers/people, `fx` 0.02 on the generator's rupee constants, $ with K/M, en-US numbers, "Sep 21, 2026" dates.
- The scenario never names a site literally: `dcAt(n)` (1-based position) everywhere in generate.ts / incidents.ts / gpu.ts;
  personas carry `tall.dcIndex`; people are India's names mapped through `person()` / `localizeNames()`; persona customer rows are
  placed with `placeCustomer()`. India telco data stays byte-identical (`npx tsx .qa/fingerprint.ts network`).
- Money: write constants in rupees and wrap with `money()`; format with `fmtMoney()` (never `fmtINR`, never a literal ₹) and
  `fmtNum()` (never `toLocaleString('en-IN')`); `MoneyIcon` / `moneyIcon()` for the currency icon; `currencySymbol()` for headers.
- State: `?geo=in|us` wins and is remembered (`dco.geo`), top-bar GeoSwitch next to the persona switch; API `getGeo/setGeo/useGeo/
  geoNow/defaultDcId` (no hard-coded `MH-DC-001` in screens — use `defaultDcId()`). Regions and map bounds come from `geoNow()`.
- Checks: `node .qa/geo.mjs` (USA relabels every screen, switch, memory, URL precedence), `GEO=us npx tsx .qa/revenue-check.ts`.
  The demo playbook is India-only (its links pin `geo=in`); the embed guide carries a geography control and a persona × geography matrix.

## Embedding & routes (05-Oct-2026)
`?shell=false` hides the left menu and the top header (iframe use in the user's platform); `?shell=true` shows them; no parameter =
shown unless this tab/iframe already chose (sessionStorage `dco.shell`, plus a memory copy for iframes with blocked storage) — see
`shell/embed.ts`. `.shell.is-embed` sets `--rail-w` / `--top-h` to 0 so sticky list headers and full-screen map / 3D pin to the frame.
`?persona=` picks the persona, `?geo=` the geography (mock/server.ts). Route catalogue with every screen's URL parameters: `docs/dco-embed-guide.html`
(served at `/embed-guide.html`; copy it to `app/public/` after editing). Check: `node .qa/embed.mjs <host page with an iframe>`.
When a screen gains a URL parameter or a new route is added, add it to the guide.
Deployment overrides (`mock/override.ts`): Vercel env vars `VITE_PERSONA_OVERRIDE` / `VITE_GEO_OVERRIDE` with rules
`[geo:]from=to` or `to` (comma-separated, first match wins) — applied AFTER the URL and the saved choice, so they win over links in
other people's code. Build-time (Vite), so changing them needs a redeploy. Unset = no override.
`VITE_PERSONA_DEFAULT` (08-Oct-2026, user) = the persona a viewer gets with no `?persona=` and no saved choice; set to `neocloud` on
Vercel production (local dev stays network). Not an override: the switch and links still work. A saved choice made under a different default
is dropped once (`dco.persona.default` marker) so returning viewers see the new default.
The user's platform iframe (apps.visionwaves.com) passes its own `?persona=`, so production ALSO sets `VITE_PERSONA_OVERRIDE=neocloud`
(every load opens NeoCloud; the in-app switch still works until the next reload). Remove that variable + redeploy to give links control again.

## Incident severity words (07-Oct-2026, user)
Incidents show Critical / High / Medium / Low (stored as sev 1–4; `lib/vocab.ts` `SEV_LABEL` / `sevLabel()` / `SEV_TONE` / `sevChipCls()`),
never "SEV1". Alarms keep Critical / Major / Minor / Warning. Priority (P1–P4) is not shown as a chip; the incident page shows it only when
it differs from severity. URL view ids (`?view=sev1`) are unchanged. The 3D twin side panel (`site/twin/Panel.tsx`) still says "SEV1"
because the twin is frozen — change it only if the user lifts that.

## Field guide (07–08-Oct-2026)
`docs/dco-field-guide.html` (served at `/field-guide.html`; copy to `app/public/field-guide.html` after editing). Tabs: Glossary · How it fits
together · Customer questions · Metrics & sources · Inventory · Flashcards. Inventory tab (08-Oct-2026, user: "monitoring depends on inventory"):
containment chain (region → port and cable), six "why monitoring needs inventory" cards, a 10-step onboarding order, and a filterable catalogue
of 84 inventory items in 11 domains (Core / Recommended / Optional, system of record, how it gets in, where the tool shows it); 14 glossary terms
in the "Inventory" area. Docs only — the tool's inventory screens stay parked. Check: `node .qa/field-inv.mjs`.
