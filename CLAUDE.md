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
Revenue · Access (14-Oct-2026) · Ops log (health → plant & installed base → connectivity → impact → history). Site tabs: Overview (3D) · Attention · Topology (`TopologyView` from screens/Topology.tsx, same view as the /topology page) · Metrics (aggregated thermal/power/backup/fault KPIs)
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

Twin controls + heading (14-Oct-2026, user: "so many legends on the top-left … hiding the screen"; "use a better heading than Digital twin"):
the Overview bar reads **Datacenter layout** · Live (not "design" / "plan": those words belong to Plan & Build / Facilities). Realistic twin:
top-left = floor picker only; top-right = tools + a "?" holding the mouse / keyboard help (the hint line shows only while walking, under the
picker, where the hover tip also sits); bottom-left = ONE dock (`.t2-dock`): Colour by (layer) · Power path / Cable paths, then a foldable
grouped legend (Health · Power · Cables; `dco.twin2.legend`); the path card moved to the bottom-right. Labels keep clear of the dock. Narrow
canvas (container query ≤720 px): no caption, chips read Power / Cables. Checks: `node .qa/twin2.mjs`, `W=1280 node .qa/twin2-paths.mjs`.

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

## Inventory import template and data backup (12-Oct-2026, user)
`docs/dco-inventory-import-template.xlsx` = what a customer (e.g. RackBank) must send to onboard datacenters: one sheet per entity of
`api/types.ts` (Sites → Floors → Rooms → Racks → power / cooling plant → Devices → Interfaces → Links → GPU → Customers → Services → Collectors),
Field_Dictionary (system field per column), Lookups (dropdowns = system enums), Summary with formula checks, two illustrative RackBank sites.
`docs/dco-data-backup/` = the whole mock estate in the same layout, one workbook per persona × geography, plus Snapshot_* sheets (alarms,
incidents, changes; not imported). Rebuild: `npx tsx scripts/inventory/export_backup.ts <persona> <in|us> x.json` (from app/), then
`python scripts/inventory/build_template.py out.xlsx [x.json]` (needs openpyxl; no json = the template). Served under `/downloads/`;
the personas page and platform overview are served at `/datacenter-personas.html`, `/dco-platform-overview.pdf|.docx` (copy after editing docs/).
Known mock gaps the backup's checks flag: serials repeat across sites, GJ-DC-013 (planned) racks exceed its 10 kW, 115 GPU hosts lack GPU records.
Data model explorer (12-Oct-2026, user): `docs/dco-data-model.html` (served at `/data-model.html`; copy to `app/public/` after editing).
It is also in the side menu (group Reference · **Data model**, route `/data-model`, `screens/DataModel.tsx` = an iframe of `/data-model.html?embed=1`,
which forces the light theme). Top section redesigned 12-Oct-2026 (user: "look like our Datacenter screens"): PageHead + Import template / Opstral
buttons, StatGrid of 6 tiles, Tabs (Ontology · Full map · Hierarchy, `?tab=map|tree`), ListToolbar card (search, Domain + Show quick filters, line key)
around the iframe; the page hides its own header in embed mode and is driven through `window.DM` (it posts `{dm:'state'}` only for the user's own moves).
Reset view + Full screen (user, 12-Oct-2026): toolbar icon buttons (ListToolbar `tools` slot) and the diagram's control stack; full screen = the card
fills the content area under the top bar, Esc closes (standalone page uses browser full screen); reset = Rack in the middle, direct links, no filter / search. 38 entities
(types.ts + template sheets) and 78 relationships in one `E` / `R` table; views Ontology (focus entity, 1 or 2 steps out), Full map (3 × 3 domain
clusters) and Hierarchy (containment tree); details panel = fields marked Import / Live / Derived, sheet, example id, relationships. Counts per persona
come from the mock (`COUNTS`, India); update E / R when types.ts gains an entity.

## Physical last mile (12-Oct-2026, user: "how will power come to this device, how is the network cable attached?")
Gap analysis agreed with the user: P1 = power, cooling and cabling down to the device + single points of failure (done); P2 = environment &
safety, asset lifecycle / spares / RMA, planned plant maintenance; P3 = on-call / ITSM / notifications, colocation cross-connect orders.
Read model `mock/physical.ts` (derived per site, cached per db; never changes generated collections, so every fingerprint holds):
- Power: feed → UPS module (A side = UPS-2/4, B side = UPS-1/3, so "UPS-2 on battery" = A side) or the −48 V plant (network persona: DWDM +
  access routers on BDFB panels) → rack PDU A/B (each side rated = rack budget) → breaker bank (cords round-robin over phases) → outlet → PSU.
  Odd PSUs → A, even → B. Σ PDU load = rack draw. Stories: cloud "Host Power Lost" = PSU1 failed + PDU-B outlet 14 tripped; colocation
  "Cabinet PDU-A Breaker Trip" = PDU-A tripped, cabinet on B only; DL-DC-009 A-side PDUs on battery; ~30% of sites have one device with both
  cords on PDU-A (seeded "found at audit").
- Cooling: units on a floor share its air (zone per floor); redundancy is judged for the site exactly as Facilities' heat balance; a floor is
  "No spare" when it holds a unit that is down or a hot room. Each rack has a nearest unit; liquid racks send 75% of heat to their CDU.
- Cabling (TIA-942 style): port → optic → patch cord → cabinet panel (PP-F/M/C n) → trunk (2 tray routes; Tier II = 1) → ODF in the patching
  rack → cross-connect jumper (Link.physical.cable) → … far end; in-rack = one cord; backhaul adds the outside-plant cable (cores from the
  site cable ledger, on the OSP ODF in the rack the "Re-patch ODF RACK-x" change names; hero xe-0/0/3 = core 7, re-patched by the "Re-patch ODF" change = first suspect). Link.physical aPort/zPort are no longer shown.
- SPOFs per site: cords both on A, PSU failed, PDU tripped, cabinets one side cannot carry (≥90% of budget), UPS not online, Tier II single
  feed / tray route / building entry, cooling spare lost. What-if (`whatIf(dc, asset)`): feed, UPS, side:A|B, PDU, cooling unit, trunk.
API: `getSitePhysical · getDevicePhysical · getCablePath · getWhatIf`. Screens: device tab **Power & cabling** (`?tab=physical`, `ne/Physical.tsx`),
link drawer cable path, Facilities Power (cabinet distribution, what-if, PDU A·B column, rack PDU drawer with outlet map), Cooling (coverage by
floor, nearest unit), new tab **Single points of failure** (`?tab=resilience&domain=`), datacenter Attention panel. Shared parts in
`screens/physical/parts.tsx`, styles `styles/physical.css`. Template / backups gained Rack_PDUs, Power_Connections, Patch_Panels, Trunk_Cables,
Cable_Paths, Cooling_Coverage (+4 Summary checks); data model page = 38 entities / 78 relationships. Check: `npx tsx .qa/physical-check.ts`.

## Phases 2 and 3 of the gap analysis (12-Oct-2026, user: "continue with remaining phases step by step")
All read models, derived per site and cached per db; they raise no alarms and never change generated collections (fingerprints hold).
- **Environment & safety** (`mock/safety.ts`): fire zones per room (VESDA / point detection, Novec / IG-541 / pre-action, agent %,
  release mode, quarterly inspection; a booked fire Maintenance change counts as scheduled), leak rope under cooling units / CDUs /
  liquid racks (all dry), access points (mantrap, room doors, tenant cage doors; a door is "Held open" under an in-progress change that
  names a unit in that room). Shown on Facilities → Environment (`SafetyPanels`).
- **Asset lifecycle** (`mock/lifecycle.ts`): install date (after commissioning), warranty, support contract per vendor × level, vendor
  end-of-sale / support per model (catalogue: FortiGate 3700F past support, ASR 9006 within a year; others years out), state Covered /
  Expiring / Out of warranty / End of support. RMA cases from modules in Fault (never past "Engineer booked" while the fault is live) +
  GPU nodes with `rma`; spares per part family (the hero SFP spare exists). Shown on device Hardware (`DeviceLifecycle`) and datacenter
  Assets (`SiteLifecycle`: RMA, spares, warranty & support).
- **Planned maintenance** (`mock/maintenance.ts`): PM plan per plant asset (UPS, battery, DG, CRAH/CRAC, CDU, fire, LV/ATS, PDUs), reusing
  DG / battery / fire dates, booked by a Maintenance change naming the asset; impact = the what-if. Facilities → Maintenance (`PmPlan`).
- **Operations process** (`mock/ops.ts`): on-call rota per region (weekly rotation, day/night), incident paging chain + next escalation,
  ServiceNow ref, customer notices (initial 15/30/60 min, updates 1/2/4 h; a few open incidents have an overdue update), problem records
  grouping incidents by cause (optics lot → one problem incl. the hero INC-0001 = PRB "SFP lot 22B"), resilience tests per site,
  colocation cross-connect orders + remote-hands tickets. Screens: incident "On call & communications", Incidents → **Problems** tab
  (`?tab=problems&prb=`), Attention "On call now", Facilities → Single points of failure "Resilience tests", colocation Tenants tab and
  customer page "Cross-connect orders" / "Remote hands". Views in `screens/physical/phase2.tsx` and `screens/ops/process.tsx`.
- Template / backups: + Fire_Systems, Leak_Detection, Access_Points, Support_Contracts, Asset_Lifecycle, Model_Lifecycle, Spares, PM_Plan,
  On_Call (35 data sheets, 15 checks); backups add Snapshot_RMA / Snapshot_Problems / Snapshot_Orders. Data model page = 51 entities /
  107 relationships (domain "Cooling & safety"); map rows grow with their fullest cluster.

## Access & security tab (14-Oct-2026, user: "entry/exit inside the datacenter … the security audit")
Datacenter tab **Access** (`?tab=access`, between Revenue and Ops log; `site/Access.tsx`, styles `styles/access.css`). Read model `mock/access.ts`,
built from the doors `mock/safety.ts` lists (it calls `buildAccess` and the doors' `events24h / denied24h / last` now come from that log, so
Facilities → Environment and this tab agree; API `getSiteAccess`). Last 24 h of visits + badge reads: guards (2 per 12 h shift), field techs per
shift, site engineers on days, change crews (escorted, `ref` = CHG), the on-call engineer responding to an open incident (`ref` = INC), PM vendor,
couriers, cleaners, visitors (host + escort), colocation tenants at their cage; denials with reasons. Exceptions `SEC-<site>-nnn`: tailgating,
door forced / held open, anti-passback, repeated denials, after-hours entry, unescorted visitor, overstay, badge not returned. Quarterly
access-rights review (badges by type, expired / unused badges, CCTV 90 d, log 1 y). Screen: SummaryStrip (on site · entries · denied · exceptions ·
visitors · doors) → On site now | Security exceptions → 24 h chart | Doors and readers | Access rights review → audit trail (`aq · ares · atype ·
adoor · adir`); person / exception drawers. Planned sites show an empty state. Site tabs got tighter pills so all five personas fit on one row at
1280 (enterprise wrapped before). Checks: `npx tsx .qa/access-check.ts` (`GEO=us`), `node .qa/access.mjs <persona> <geo> <dc>` (W=1280).

## Power & cable paths in 3D (13-Oct-2026, user: "show which UPS feeds which rack PDU and which cable comes from which device on the digital twin and the 3D view, with quick chips")
- Realistic twin (`site/twin2/paths.tsx`): chips **Power path** / **Cable paths** (floor level and below). Power = per room an A (blue) and B
  (orange) overhead busway fed by ONE UPS module each (`mock/physical.ts` now assigns UPS per room: A = UPS-2/4, B = UPS-1/3 by room index),
  header on the wall facing the plant room, feeder behind the rear walls to the UPS (or a riser on upper floors), tap-off into every rack
  (red dashed = tripped, amber dashed = on battery), green −48 V feeders from the rectifier to BDFB racks. Cables = every trunk from rack top
  along the fibre channel to the ODF rack (teal route 1, purple route 2, red = all links down); with a device open its own cables go to the far
  rack (cyan), in-rack cables loop on the cabinet front. Opening a rack with a chip on frames the rack + its busway/trunks (`pathPose`) and shows
  `PathCard` (feed → UPS → busway → PDU, trunks to the ODF, the device's PSU cords and cables). Check: `node .qa/twin2-paths.mjs` (P= DC= W=).
- Device 3D view (`ne/twin3d/paths3d.tsx`): chips **Power** / **Cables** switch to "In the rack"; Power = every PSU cord in the cabinet to its
  rear PDU outlet (this device thick + labelled, camera to the rear at the device's height), PDU ← UPS captions; Cables = this device's ports to
  the top-of-rack patch panel and the trunk, in-rack cables to the far device; a path card lists the chain. Check: `node .qa/devtwin-paths.mjs <ne> <persona>`.
- Known: the shared twin side panel (`site/twin/Panel.tsx`, frozen) lists the site's first two UPS as "Power feeds" for every rack; at 4-UPS
  sites rooms after the first are really fed from UPS-3/4 (the path card is right).
- Device popup + trace views (13-Oct-2026, user): selecting a device in the realistic twin opens `DevicePopup` beside it (role, model, rack · U,
  state, links up, services; actions **Open device**, **View cabling**, **View power**, **Device in 3D**). View cabling / power opens `twin2/Trace.tsx`
  over the whole twin: its own small 3D scene with ONLY this device and what it connects to. Cabling = one lane per cable through the real
  hops (cord → cabinet panel → trunk → ODF → cross-connect → OSP …) to the far device; pick a cable in the list to see it alone with hop labels
  and the check-first marker. Power = the device, each PSU cord to its outlet, the PDU (A / B), the busway, the UPS (or −48 V plant) and the
  utility feed, the two sides as two rows seen from ~40° above. Camera fit is done by hand (camera-controls `fitToBox` snaps to a box face).
  Check: `node .qa/twin2-trace.mjs` (P= DC= W=).

## P2B merge — Plan & Build (13-Oct-2026, user)
The colleague's P2B prototype (github.com/Devendra921/DCOS, cloned at `P2B/`, untracked, never commit it) is being merged screen by screen:
Planner · Capacity · IP & Network · DCIM · Delivery · Change Management · Compliance · Customization. Decisions: ONE estate (ours — P2B's demo
estate, faker seed and its stale copy of our ops app are not brought over); P2B's Change Management will replace "Changes & maintenance";
screens are rebuilt in our kit (PageHead, StatGrid, ListToolbar, DataTable, NST tokens), not antd. Menu group **Plan & Build**.
- **Phase 0 + 1 = DCIM (done)**: read model `mock/dcim.ts` (derived per data version, cleared in `changed()`; nothing generated changes, every
  fingerprint holds): site → floor → hall (= a room; kind from its name) → row (the twin's rule: `rowCols(n)` racks per row, rows paired face to
  face around a cold aisle; keep in step with `twin/layout.ts`) → rack → device (= every NE; status Active / Planned / Maintenance / Decommissioning /
  Tenant-owned) → components (ports, power ports with their PDU outlet, mgmt, console, module bays) → cables (data = every LLDP link with its
  structured route from `physical.ts` ends, type from the port and route; power = every PSU cord). Device type = distinct vendor + model; module
  type = distinct module name. Power: panel = a hall's A / B busway (one UPS module) or −48 V distribution; feed = a rack PDU. Types `Dcim*` in api/types.ts,
  API `getDcim · getDcimDevices · getDcimDevice · getDcimCables · getDcimTypes · getDcimType · getDcimRack · getDcimFreeSlots`; mutations `createRack`,
  `installDevice` (planned NE + reserved interfaces, U range validated), `setDeviceStatus`, `addDeviceType` (runtime only; a reload regenerates).
  `mutate()` now rejects when the server function throws (forms show the message).
- Screens `screens/dcim/`: `/dcim` (`Dcim.tsx`: scope select `?dc=`, StatGrid, tabs `?tab=` sites · floorplan · racks · devices · cabling · power ·
  types · hierarchy), `/dcim/racks/:id` (`RackPage.tsx`: elevation, PDUs + cords, cables, panels), `/dcim/types/:id` (`TypePage.tsx`); device rows open
  `DeviceDrawer` (no third device page: it links to `/ne/:id`); forms in `forms.tsx`. Styles `styles/dcim.css`. The device page's rack link and the
  datacenter Assets tab link into DCIM.
- Checks: `npx tsx .qa/dcim-check.ts` (sites/racks/devices = estate, Σ hall = site, rows partition racks, U = Σ devices + ODF block, no U clash,
  Σ feeds = rack draw, Σ panel = Σ feeds, cables = LLDP links + cords, Σ type devices = devices; `GEO=us` too), `node .qa/dcim.mjs <persona> <geo>`
  (`W=1280`; every tab, overflow, scope, rack/type pages, drawers, new rack + install flow).
- DCIM P2B gap fill (14-Oct-2026, user; `screens/dcim/ops.tsx`, `Explorer.tsx`, server `dcim*` functions): device drawer per-port actions
  (connect a free port to a free same-speed port at the site — `dcimFreePorts` lists only devices that have one; trace = cable path drawer;
  disconnect; edit description / admin state), Bays (FPC0–1 on routers, DISK0–7 on servers with drives; install a fitting module — a line card
  adds its ports —, swap a faulty one, remove), Move (another U or rack at the site, budget checked), inventory items (optics). Rack page: Edit,
  Reserve space (U holds respected by Install / Move, Reserved tab, release), Retire (empty racks only), Activity (audit). Power: New panel /
  New feed (V × A × √3 × 0.8). Catalogue: New module type, Import JSON, component templates on the type page (editable for hand-made types).
  Explorer tab (racks / devices, filters, table / tiles, saved views in localStorage, CSV export). Floor plan: Thermal · Density · Tenant
  (draw vs contracted) colourings and free grid cells that open New rack. `physical.ts` link index is now rebuilt on every change.
- **Phase 2 = IP & Network (done)**: read model `mock/ipam.ts` (usage = addresses actually bound; P2B's 92% padding is not copied). Management =
  each device's own `ip` in a per-site VRF `MGMT-<site>` (the generator reuses 172.x ranges between sites, hence one VRF per site; the NOC
  imports RT 64500:999); the /24s are those the addresses fall in, under one container; an address outside it is "Outside plan" (the hero
  border router's 172.31.40.20 is the one finding per persona). Fabric (VRF DEFAULT) = 10.<site index>.0.0/16: loopbacks for routing speakers,
  a /31 per routing adjacency (127 per /24), a production /22 per hall with hosts (VLAN 200+n, VRRP/HSRP gateway on two of the hall's switches,
  a PXE range), storage /22 (VLAN 300); inter-site links = /31s in 10.255.0.0/16. L3VPN = a customer VRF + PE–CE /31 per service (100.64/10),
  IRV = public /31s (documentation /24s), L2VPN / leased line / cross-connect = a VLAN per service. ASNs: operator 64500, site 65100+n,
  one 32-bit private per BGP leaf. Overlay for "Reserve next IP" / "Carve a prefix" (cleared on regenerate). Screen `/ipam` (`screens/ipam/Ipam.tsx`,
  styles `styles/ipam.css`), DCIM device drawer lists the device's addresses. Checks: `npx tsx .qa/ipam-check.ts` (every device's management
  address, addresses inside their prefix + VRF, no duplicates in a VRF, used = bound, children inside parents, no sibling overlap, 2 link
  addresses per adjacency / inter-site link, one host address per host, PE–CE and VLANs per service, VLAN ids unique per site; `GEO=us`),
  `node .qa/ipam.mjs <persona> <geo>` (W=1280).
  P2B gap fill (14-Oct-2026, user; `screens/ipam/extras.tsx`, mock in `mock/ipam.ts`): address drawer (device → interface → prefix, DNS, MAC,
  VLAN, gateway group, services, other addresses; set primary / unassign), exhaustion forecast per prefix (growth = addresses on devices
  installed in the last 12 months ÷ 12, lifecycle install dates; Consumed ≥ 90%, Committed ≥ 75% or full within 12 months; Forecast + Full by
  columns, prefix drawer card), New prefix form (boundary, inside its container, no overlap in the VRF; pool flag), DCIM device drawer
  address actions (assign the next free address of a site prefix, set primary, unassign), Registers tab (registries, roles, route targets,
  VLAN groups, service templates, all derived), Integrations tab (ServiceNow / Infoblox / BlueCat / AD DNS / Kea DHCP mock connectors:
  records and differences from the plan, sync / import / export / connect, audited). Overlays reset on regenerate.
- **Phase 3 = Capacity (done)**: our parked `/capacity` screen (`screens/Capacity.tsx`) is back in the menu (it was the screen P2B had copied as
  "Plans & forecast") with P2B's additions, all derived (`mock/capacity.ts`, fields `holds · gpu · energy · halls` on `capacity()`): overview opens
  with a StatGrid (one tile per dimension + holds); Space adds space & power by hall (→ DCIM floor plan); Compute & GPU adds GPU capacity (in a
  job / allocated to an idle job / free / out of service, per model); **Reservations** = what is held against capacity (planned device = its U +
  its type's typical draw, Reserved; colocation contract above draw, Committed; approved / executing plan, Pipeline; submitted plan, Requested;
  GPU nodes of an idle job, Reserved) with net available power and space; **PUE & energy** = PUE = facility ÷ IT from the site power split,
  energy/day, CO₂ with the national grid factor (India CEA v19 0.716, USA eGRID 2022 0.371 kg/kWh; renewables / WUE are not modelled, so not
  shown). Tab KPI rows are SummaryStrips now. Check: `node .qa/capacity.mjs <persona> <geo>` (W=1280).
- **Phase 4 = Planner (rebuilt 13-Oct-2026, user: "rebuild the planner like P2B", then "merge into our theme, UI/UX and data")**: P2B's
  planner ENGINE and data are ported as they are, the SCREENS are ours. Logic lives in `src/planner/lib/*` (engine: template inheritance
  `resolveTemplate`, `effectiveParams` with param sources, sizing, cost / NPV / IRR, schedule from lead-time benchmarks, rule checks, readiness;
  `dimensions.ts` = the 12 wizard areas + `deriveFromRequirements`; `wizardModel.ts` = steps per template, validation, blockers; `governance.ts`
  = approval path by template + CapEx band, decisions, conditions, delegations, revisions, baseline; `scopes/*` = the six plan families;
  `usePlanner.ts` = hooks + `usePlannerActions`). The record store is P2B's MockDB (`mock/p2b/store.ts`) built per data version in
  `mock/p2b/index.ts`: our estate adapted to the planner's records (`adapter.ts`: sites, halls/rows/racks/devices from `dcimModel`, UPS/feeds/
  DG, cooling zones per floor, IPAM, holds, services, backhaul circuits; money in USD, `USD_RATE` 50 for India) + P2B's seed (`mock/p2b/seed/*`:
  59 templates, 230 benchmarks, 15 demo plans placed on our sites by position `SITE_KEYS`, place names / customers / carriers localised;
  `validate()` sends an approved demo plan back to Draft with the reason when it fails a hard rule on our estate). The planner finds the store
  through `planner/compat/registry.ts` (registered by `mock/server.ts`, no import cycle); `compat/clock.ts` = the mock clock; `compat/people.ts`
  = this geography's cast with two holders per approving role; `compat/auth.tsx` = the signed-in user (switchable in the decide modal).
  Screens `screens/planning/`: hub `/planning` (`Planner.tsx`: StatGrid, tabs overview · plans · templates · benchmarks; `?tab=`), `Plans.tsx`
  (ListToolbar + DataTable, `?status=&scope=&q=`), `Templates.tsx` (plan types · site types · modules; drawer: inheritance chain, wizard areas,
  approval path, outputs, inputs with defaults editable on drafts, rules, plans using it, versions; Make a variant / Publish / Retire; a content
  change bumps the version), `Benchmarks.tsx` (costs · efficiency · lead times · sizing & staffing · rules; add / edit drawer, versioned),
  wizard `/planning/new` + `/planning/plans/:id/edit` (`PlanWizard.tsx` + `wizard/*`: Plan type cards → Requirements (name, needed-by with
  lead-time check, where per family: site / two sites / campus / new site with candidate plots `Candidates.tsx` / region, affected devices for
  refreshes, edge sites; how much, workload mix, tier; "the planner fills N inputs" with reasons) → one `DimensionStep` per area (inputs with
  source chips + reset, result per area, checks; phases / permits / risks editors) → Scenarios (`Scenarios.tsx`, compare + prefer) → Review
  (blockers with "fix" links, approval path by band, outputs); `LiveEstimate` rail on every step), plan page `/planning/plans/:id`
  (`PlanPage.tsx` + `plan/*`: SummaryStrip, status actions, tabs overview · sizing · capacity · cost · schedule · rules · scenarios · risks &
  permits · approvals (decide modal, conditions, delegations) · delivery · baseline · history). Styles `styles/planning.css`; shared helpers
  `screens/planning/common.tsx` (money = planner USD → geography, `SourceChip`, `PlannerToasts` for `compat/notify.ts`).
  Wizard layout (14-Oct-2026, user: "New plan screen … make it more attractive, clean and professional"): no left steps rail — a stage
  stepper card (Set up · Design · Delivery · Business · Decide with progress, the current stage's steps as pills), a step hero (icon,
  "Step n of N · stage", question), the step as section cards (`Sec` / `Figs` in `planning/parts.tsx`), the live estimate rail (readiness
  ring, CapEx / IT power tiles, source dots) hidden on the plan-type step, and a sticky action bar. Power stages render as a chain of cards. Follow-ups (user, 14-Oct-2026): the stepper is one connected line of
  all five stages (locked "After plan type" until one is picked); the active stage names the current step and has one dot per step (no pill row);
  the step heading is a white card with the step as a chip; plan-type groups are an accordion (one open, a closed group lists its types); the
  selected type's details sit in a right panel as tall as the groups (scrolls inside); the action bar is pinned flush to the window bottom.
  Delivery reads the planner's approved / executing plans through `mock/p2b/bridge.ts` (`PRJ-n` = `PLN-n`; handover completes the plan);
  Capacity → Reservations shows the holds approved plans write (`Planner hold`). Old `/planner…` URLs redirect.
  Checks (NeoCloud + USA only, user 13-Oct-2026): `npx tsx .qa/p2b-check.ts neocloud us` (every demo plan evaluates; `V=1` lists fails),
  `node .qa/p2b-smoke.mjs neocloud us <routes>`, `node .qa/p2b-wizard.mjs neocloud us "New datacenter"` (all 15 steps), `node .qa/p2b-plans.mjs
  neocloud us` (every plan × tab), `node .qa/p2b-flow.mjs neocloud us PLN-0002` (decide → approve → start the build → Delivery → holds).
- **Phase 5 = Delivery (done)**: `mock/delivery.ts` derives a project from every approved / executing / delivered planner plan (`PRJ-n` = `PLN-n`):
  milestones = the plan's schedule; work orders = the field-work milestones split into crew windows (own technicians or the geography's
  contractors), each with a delivery change request `CR-…` and a kit status from its purchase orders; purchase orders = the plan's CapEx lines
  (suppliers + lead times), ordered at approval; commissioning L1 factory witness → L2 site acceptance → L3 pre-functional → L4 functional → L5 IST;
  permits by scope (Indian / US authorities); design documents; EV cost (earned = budget × progress, CPI, SPI); health late / at risk / on track.
  Approved-not-executed plans start no earlier than today (so an approved plan whose lead times miss its target shows late). Two delivered
  rack expansions per persona are seeded (the last racks of the two biggest halls). Overlay moves: receive a PO (goods receipt), start /
  complete a work order (needs kit on site), run Lx in order (L3+ needs installation done), hand over (all WOs done + L5) → plan and its capacity
  plans Delivered. Screens `/delivery` (`screens/delivery/Delivery.tsx`), `/delivery/projects/:id` (`ProjectPage.tsx`). Check:
  `node .qa/delivery.mjs <persona> <geo>` (every project × tab + execute → receive → work orders → L1–L5 → handover; W=1280).
  The new QA scripts save screenshots only on a failure (or `SHOTS=1`): the disk was full on 13-Oct-2026.
- **Phase 6 = Change management (done; replaces "Changes & maintenance", menu label Change management)**: `mock/changemgmt.ts` = one register
  over `db.changes` (operations + maintenance), the delivery change requests of every work order (`CR-…`) and the preventive maintenance done in
  the last 12 weeks (`PMW-…`, from the plant PM plan). Class: emergency flag → Emergency; a low-risk title matching a standard template → Standard;
  else Normal. Approval matrix (Standard pre-approved; Normal change manager, + site lead from Medium, + CAB at High; Emergency ECAB + review);
  freezes = a site with an open Critical incident + the geography's peak / year-end freeze (live sites only, civil works exempt); conflicts =
  overlapping windows on the same devices; policies POL-01…06 (rollback, freeze = Block; maintenance hours, SPOF, overlap, overdue review = Warn);
  a completed change cited by an incident's leading RCA hypothesis = "Caused an incident" (counts as failed; CHG-2001 Re-patch ODF → INC-0001).
  Screens `screens/changes/Changes.tsx` (tabs overview · changes · approvals · calendar · freezes · standard · policies; `?id=` redirects to the
  page; `?dc=` / `?status=` open the list), `ChangePage.tsx` (`/changes/:id`), reusable form / impact parts in `parts.tsx`; styles `changes.css`.
  Check: `node .qa/changes.mjs <persona>`.
- **Phase 7 = Compliance + Customization (done, minimal redesign; menu group Admin)**: `mock/compliance.ts` evaluates policies CP-01…09 on the
  estate (rack ≤ 80%, dual-fed, cooling N+1, UPS ≥ 10 min, addresses in plan, end of support, change policy, fire inspections, PM overdue) and maps
  ISO 27001 / ISO 22237 / TIA-942 / SOC 2 controls to the policies that actually evidence them (P2B's mappings were wrong); manual controls carry an
  attestation date. `mock/customization.ts`: custom fields (filled counts derived) and tags as rules over the estate (+ runtime additions).
  Screens `screens/admin/Compliance.tsx`, `Customization.tsx`. Check: `node .qa/admin.mjs`.
- Not yet ported from P2B (planner): the family-specific editors (plant line-ups, network paths, replacement waves, placement grid, migration
  dispositions / consents), the plan pack documents (BoD / BoM / IP plan / drawings), sourcing against stock and vendors, AI assist.

