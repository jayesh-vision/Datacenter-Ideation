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
- Data must reconcile everywhere (e.g. network persona, India: MH-DC-001 = 229 NE (179 network elements + 50 operator servers), 153 discovered,
  21 drifted, 76 not discovered — 179/103/21/76 before the operator servers of 15-Oct-2026).

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
+ the operator's own servers (MH-DC-001 229/153/21/76 holds ONLY in the network persona; see "Operator servers" below); colocation = operator
MMR + an operator server rack + opaque `Tenant gear` blocks (role, `Rack.owner/tenantId/contractedKw`, OpsState `tenant-owned`, never polled); cloud/enterprise = leaf–spine
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
  Calm palette (05-Oct-2026; softened 22-Oct-2026, user: "too bright, out of the theme", then "no yellow": ramp primaryColor400 → blue-200 → slate, faults red-300 / orange-300 / orange-200 (no amber), Datacenters site states = Critical red, Needs attention / Normal on the blue ramp, region cards coloured only when Critical, `SOFT` dots one shade lighter): bars in a blue-grey ramp, red/amber only for faults; breakdown = one column of ≤3 rows
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
- Page tab bars (`.page > .tabs`, the plan page's `.pn-tabrow`) are pinned under the top bar on every screen (22-Oct-2026, user); list toolbars and grid
  headers pin below them (`--page-tabs-h` 47px, base.css). Keep a screen's tab row a direct child of `.page`. Check: `node .qa/tabs-survey.mjs` (W=1280).
- Big screens / TVs (22-Oct-2026, user): from 2200 px the whole UI scales (`html { zoom }` 1.25 / 1.5 from 2880 / 2 from 3440, base.css). `lib/bigscreen.ts`
  (installed in main.tsx) makes rects, mouse coordinates, innerWidth/Height and elementFromPoint read in layout pixels while zoomed, so tooltips,
  charts, the map and 3D stay aligned. Use `var(--vh100)` / `var(--vw100)` in CSS, never raw `vh` / `vw`. Check: `node .qa/bigscreen.mjs`.
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

GPU fleet area (21-Oct-2026, user: "we already show incident counts with severity in the tiles … replace Incident response with GPU details"): where the
estate runs GPU nodes (cloud, enterprise, NeoCloud; not network, not colocation's tenant cages) the first hero area is **GPU fleet** instead of Incident
response: % = GPUs healthy and running at full speed ÷ installed (a GPU in a stalled / slowed / at-risk job, failed, degraded or throttled counts bad;
deliberate spares are good), status = Critical when a job is stalled, Attention for slowed / at-risk / idle allocations / throttling / failed GPUs, detail
"152 GPUs stopped by one failed GPU · 2 jobs slowed · $625/h lost", chips = sites with a hurt job or throttled GPUs → `/gpu?dc=&gtab=jobs`. Operations
health then averages the four. Row order (user, 21-Oct-2026): GPU fleet (or Incident response) · Power · Cooling & environment · Network — the product first, then what fails fastest, the fabric last. `cc-numbers.ts` checks whichever first area is present.

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
GPU Fleet head (22-Oct-2026, user): one row — title + one-line subtitle left, live chip · datacenter select (200 px) · Opstral right, centred (`.gpu > .page-head` in `styles/gpu.css`); at 1280 the subtitle wraps inside the row. Check: `node .qa/gpu-head.mjs`.
The two story cards (Biggest blast radius · Slowest job) sit in ONE collapsible section **Jobs needing attention** (`FacSection`, scope `gpu` / `gpu-site` on the
datacenter tab, open by default, remembered per viewer; closed = four summary facts: GPUs stopped + incident, lost now, slowest job, lost now) so the
viewer can fold it away above the lists (22-Oct-2026, user). Check: `node .qa/gpu-stories.mjs`.
The tab bar (`.gpu-tabbar`) is pinned under the top bar on /gpu; list toolbars and grid headers pin below it (`--gpu-tabs-h`); 8 tabs fit one row at 1280.
Network rails cells are one line (ports · errors). A flush Panel around a plain `.dt-scroll` table now clips instead of scrolling (base.css), which fixed a
header offset gap inside the panel. Check: `node .qa/gpu-sticky.mjs` (W=1280).
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

## Integration guide (16-Oct-2026, user: "show how many platform modules the Datacenter solution integrates")
`docs/dco-integration-guide.html` (served at `/integration-guide.html`) is BUILT: edit `docs/dco-data-sources-and-integration-guide.md` (technical
guide) or `app/scripts/docs/integration-guide.template.html` (Platform map data: SUITES / SCREENS / MODULES / JOURNEYS / WAVES), then run
`node scripts/docs/build-integration-guide.mjs` from app/ (writes both copies). Tab Platform map = 30 modules (Plan to Build, Supply Chain, BSS,
Services & ITSM, Opstral Ops Toolkit; Datacenter Ops is itself an Opstral module) linked to the 16 menu screens, journeys, module table, screens ×
modules matrix, ownership (overlapping functions: the platform module owns the record), waves. Module teams own their data models: list only what
Datacenter needs, never invent their fields or APIs. Modules with no match (facility live state, twin, capacity, planner engine, revenue, RCA,
compliance, access log) are "to discuss".

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
  **Estate vintage (15-Oct-2026, user: "for the server refresh scenario no equipment is matching in any data center")** — `mock/vintage.ts`
  ages the estate, deterministic and seeded per site / device (never the generator's stream): at every live site 15–30% of the servers and
  10–20% of the switches (leaf / ToR / front-end Ethernet; DC spines, InfiniBand, OOB stay current) are the previous generation of the same
  family, the lowest-numbered devices of the role (R740 / R640, DL380 / DL360 Gen10, SYS-220U / 120U-TNR, Nexus 9372PX / 3172PQ, Arista
  7050QX / 7050SX-64, QFX5100-48S, SN4600C, 7260CX3-64). `agePreviousGeneration` runs inside `buildNes` and changes ONLY `model` + `os`
  (slot, U, draw, ports unchanged): every collection except `nes` keeps its fingerprint and all count invariants hold (MH-DC-001 then 179/103/21/76;
  229/153/21/76 since the operator servers, which `ageOperatorServers` ages the same way, in build order).
  Purchase dates (`purchasedAt`): old kit 5–8 years (older than most sites — moved in from older sites), current kit since commissioning or
  moved in (≤4.5 y), GPU ≤2.8 y; warranty 3 or 5 years from purchase; half the old kit has no support contract, nothing past vendor end of
  support has one. Vendor dates: every previous-generation model is past end of sale, the old switch families past end of support; current
  models 1000–1800 days from end of sale. Racks (`rackVintage`, `SiteLifecycle.racks`): ~1 in 10 live, non-GPU racks is the old Rittal TS8
  600 × 1000 type (shallow, 7–10 y), about half the sites have 1–2 racks marked Damaged at audit (note). DCIM racks / rack page show type,
  purchase date and condition; the DCIM device drawer shows installed / warranty / vendor support from the same read model. The planner
  adapter copies install date, warranty end (`Device.warrantyEndDate`), Faulty (open RMA), model end of sale (`eolDate`) / support, rack type
  (legacy `RT-TS8-<U>-1000`), condition and `PDU.rackId` — no planner-only overlay (the old ASH R760→R740 rename is gone).
  Replace wizard list (`wizard/AffectedAssets.tsx`): every eligible item at the site, paged (50) and searchable; reasons are quick filters
  (none on by default, any-of), badges per row, sort selected → severity → rack. Demo plans: server refresh = every past-end-of-sale server at
  ASH, leaf refresh = every old leaf / ToR at DUB, rack replacement = old / damaged racks at FRA, titles from what was selected; every persona
  has servers since 15-Oct-2026, so PLN-0013/0014/0015 = server / leaf / rack everywhere (network, colocation: the old operator servers at
  dcAt(1); naming pairs such as NMS-01/02 are split over waves like service-path pairs).
  Checks: `npx tsx .qa/fingerprint.ts <persona>` (only `nes` moves vs before vintage), `node .qa/p2b-affected.mjs <persona> <geo> dc,dc,dc`
  (`W=1280`, `PLANS=PLN-0013,…`, `BASE=` if vite is not on 5181).
- **Operator servers (15-Oct-2026, user: "the Network and Colocation operators have no servers, so a server refresh finds nothing")** —
  `mock/generate.ts` `addOperatorServers` / `placeOperatorServers`, live sites only (none at the planned site), ordinary `Server` hosts carrying
  `NetworkElement.purpose` (`isOpServer`). Telco, sized by the site row's NE count (hub ≥ 140, mid ≥ 90, small): management NMS / AAA / DNS-NTP /
  jump / backup, OSS / BSS / IMS application servers (hubs; OSS + IMS at mid sites), NFV hosts NFVI-CP (5GC control plane / vEPC), NFVI-UP
  (UPF, 2U), VRAN-CU — e.g. MH-DC-001 50, KA-DC-008 44, MH-DC-002 26, MH-DC-004 12 (614 in India, 618 USA). Colocation: BMS/EPMS, ACS (access
  control), NVR (CCTV), JMP, BKP, DCIM, MON — 12 / 10 / 7 per site (215), in one operator rack (`Rack.opServers`, role "Operator servers") in the
  meet-me room; telco servers fill 42U `Compute` racks (≤ 30 U, ≤ 9 kW) in the equipment room. Models R760 / DL380 Gen11 / SYS-121H (one NFV vendor
  per site), 15–30% previous generation (`ageOperatorServers`, build order: management first), one or two failed parts per site (disk / PSU2,
  mostly on old kit → open RMA, "Faulty" in the planner). Each dual-homes to a ToR pair (TOR-001/002, then 003/004 …; leaf pairs where the ToRs are
  not discovered yet, e.g. MH-DC-001; a generic "Server NIC" ToR port is taken when no free 10G port is left). Management address continues the
  site's 172.x sequence (MGMT VRF), a production /22 per hall with hosts (HSRP), BMC. Planner owner teams from `purpose` (Telco cloud (NFVI), IT
  applications, Core network, Network / Facility operations, Physical security, Operations IT); the migration demo retires them with the site.
  Stability: everything is seeded on site / device ids and appended (devices after each site's own, racks after the ODF rack, links / cables after
  every other link, alarms raised after the incidents by `raiseOperatorServerAlerts`, never "unreachable"); racks' temperatures, the UPS line-up
  (from the pre-server design capacity), cable ledger, capex / opex and the telco compute estimate use the site without its servers. So in
  network / colocation only `datacenters` (IT load, capacity, rack list), `nes`, `links`, `alerts` (+ new codes at the end) move; services,
  customers, changes and revenue are identical; colocation incidents move only because INC-0003 lists the hot meet-me-room operator rack.
  Cloud / enterprise / neocloud are byte-identical. Guards moved: `.qa/revenue-check.ts` anchor 229/153/21/76, `.qa/site-interact.mjs` 181
  installed of 229, `.qa/dcim.mjs` waits for the rack power cards (the bigger telco estate missed the fixed 600 ms).
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

## Datacenter page tab groups (16-Oct-2026, user: "too many tabs … group them, with sub tabs")
`site/Site.tsx` shows four group pills, then the open group's sub tabs as an underlined row (`.site-subtabs`, both inside `.site-sticky`):
**Overview** (Datacenter layout · Needs attention · Metrics · Ops log; Metrics moved here 16-Oct-2026) · **Facility** (Power & backup · Cooling ·
Environment · Access & security · Single points of failure · Maintenance & alarms) ·
**Infrastructure** (Equipment · AI & GPU · Topology · Space & ports · Assets; "Space & ports" = the old Power & space tab, `?tab=details`,
moved here and renamed 16-Oct-2026 once its power and cooling parts were hidden) · **Business impact** (persona words for Customers · Revenue).
`?tab=` still names the SUB tab (ids unchanged), so every existing deep link works and the group follows from it; a group pill opens
the sub tab last used in that group this session, else its first. Group pill count = sum of its sub tab counts. AI & GPU stays hidden
without GPU infrastructure. Add a new datacenter tab to a group in `GROUPS`, never as a fifth pill.
Facility group (16-Oct-2026, user: "show the Facility screen's sub tabs directly in Datacenter → Facility"): the first five sub tabs
(`?tab=fpower|fcooling|fenv|fspof|fmaint`) render `FacilitiesBody` from `screens/Facilities.tsx` (its strip + tab content, `hideTabs`),
the same component the /facilities page wraps with its header and datacenter picker; counts follow the Facilities tabs. The six-tile
facility strip (`FacilityStrip`: power load, PUE, UPS, cooling, environment, alarms & maintenance) is NOT repeated on those five sub tabs
(`hideStrip`); it heads Overview → Metrics instead (user, 16-Oct-2026) and each tile opens its sub tab. /facilities keeps it on top.
Power & backup is four collapsible sections (`FacSections` / `FacSection` in Facilities.tsx; user: "too many widgets, user needs to scroll"):
Power path · Load & ride-through · Cabinet power distribution & what-if · Rack power. A closed section shows a one-line summary as
status pills (red / amber / green by state); first section open by default, state remembered per viewer (localStorage `dco.fac.power`);
the Expand all / Collapse all bar above them was removed 21-Oct-2026 (user: it only added space). A section holding one panel hides that panel's own title. The components live in `ui/Sections.tsx` (styles `styles/sections.css`) and
Access & security uses them too: People on site & exceptions · Entries, exits & doors · Access rights review · Access audit trail (the
summary strip was folded into the section figures; clicking a door or a filter link opens the audit trail section and scrolls to it).
The Needs attention tab no longer repeats the single points of failure list (Facility → Single points of failure has it, with tests and
the what-if; hidden via SHOW_DUPLICATES).
Needs attention layout (16-Oct-2026, user: misaligned, too much white space): incident severity chips are a fixed 70 px (titles line up), alarm
scope + severity chips sit in one centred group (`.att-tags`), Open incidents opens with four figure tiles (past SLA · unacked · oldest open ·
MTTR 30 d) matching the alarm category tiles, then "Resolved · last 7 days". Both panel subtitles stay short so the tile rows line up at 1280.
Site header: the Topology and Facilities buttons were removed (the tabs cover them); Changes above Plan (equal-width
column) with Opstral AI beside them, centred across both rows (user: not all three in one row); the collapse arrow is a quiet icon in the top-right corner; below 1400 px
the collectors line drops its label so the card keeps three lines.
A closed section is a summary card (icon, title + Needs action / Watch / Normal chip, one-line description, 3–6 labelled figures,
coloured left edge); keep figure values short enough not to truncate at 1280. Rack power is a standard list (ListToolbar + DataTable:
search, quick filters State / Location, Filters panel adds Role / PDU sides; URL params rq · rstate · rroom · rrole · rpdu). The header's
Facilities button and the power / cooling / PUE KPI tiles open these sub tabs. Which Facility sub tabs to merge is still to be decided.

Duplicate information hidden (16-Oct-2026, user: "hide the overlap, keep the code; roll back if something is missing, else delete later"):
one switch `SHOW_DUPLICATES` in `site/dedupe.ts` (false). Only figures Facilities (or another tab) already shows are hidden — check a
figure is really shown elsewhere before hiding it (user caught non-duplicates hidden on Metrics). Metrics keeps avg zone temperature and
humidity with 24 h trends, rack inlet avg / range, hottest chassis, hottest racks, Diesel (litres, burn, 30-day use), hardware faults and
device load; Power & space keeps rack space, ports, building and the floors / rooms / racks table; Assets keeps space by room (devices
per room), equipment by category, facility assets, compute and lifecycle. A "now on Facilities" note links there.
Roll back = set the switch to true.

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
- **DCIM change control (15-Oct-2026, user: "every DCIM change should be tagged with a CR from Change management")** — step A: every DCIM edit
  (new rack, install, status, move, connect / disconnect, port edit, modules, edit / retire rack, reserve / release U, power panel / feed; NOT the
  catalogue) runs through `mock/server.ts` `dcimRun(op, args, cr)` with a `DcimCr`: **standard** (pre-approved record work — patch cords, space
  holds, port label / enable, hot-swap PSU / fan — raised and closed as a Standard CHG, template STD-07 "DCIM record:" or STD-02 / 05; refused at a
  site under an incident freeze), an **open CR** at the site (Approved / In progress = applied now; Draft / Pending = saved as planned work), or
  **raise new** (CHG Pending approval, `Change.origin = 'DCIM'`, register source "DCIM"). Planned work (`DcimWorkItem`, overlay `dcimCr`, reset on
  regenerate) runs with `dcimExecute` / `dcimExecuteAll` once the CR is approved and not blocked by policy; a DCIM-raised CR completes when all its
  work is done. Records are tagged (`dcimTags`: `rack: · ne: · if:ne|port · mod:ne|slot · resv: · panel: · feed:`; planned generator devices take the
  open delivery CR of their rack); audit lines carry the CR. UI: `screens/dcim/cr.tsx` (`useCrField` section in every form, `useCrGate` for one-click
  actions, `CrChip`, `CrWorkList`), rack page chip + "N planned changes" + **Change requests** tab, device drawer chip / per-port chips / list,
  change page **DCIM work** panel (Execute all). Checks: `npx tsx .qa/dcim-cr-check.ts`, `node .qa/dcim.mjs neocloud us` (raise → approve → execute).
  Steps B + C: DCIM tab **Change requests** (`?tab=changes&cv=ready|approval|progress|soon|done|all&csrc=`; `screens/dcim/Changes.tsx`, server
  `dcimChangeBoard`: every CR at the scope, open + closed in 30 days, with racks / devices it touches, DCIM work, Execute; CR drawer; "Plans in review"
  = planner plans in Draft / In review at the site). Up-front: a notice bar under the DCIM header (ready · awaiting · in progress · plans), amber
  marker on floor-plan racks with an open CR, planned new racks as dashed ghosts in free cells, CR chips in the Racks / Devices lists.
  Rack elevation drag-and-drop (user, 15-Oct-2026): drag a device to free units → drop preview (green / red) → Move dialog under a CR. Check: `node .qa/dcim-drag.mjs`.
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
  CRUD (15-Oct-2026, user; fields after P2B's IPAM pages): create / edit / delete IP addresses, VRFs, VLANs, IP ranges, ASNs, FHRP gateway groups,
  aggregates and application services; prefixes edit / delete (create = New prefix). `mock/ipam.ts` `ipamSave` / `ipamRemove` (overlay `crud`:
  hand-made records + edits + deletions of derived ones), validated (inside the prefix, not network / broadcast, unique in the VRF / site, RD and
  RT format, VLAN 1–4094, ASN reserved ranges, no overlap) and deletes refused while something depends on it. UI `screens/ipam/crud.tsx`
  (`useIpamCrud` form + delete dialog, `RowActions`); "New …" in each list toolbar. Check: `node .qa/ipam-crud.mjs`.
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
- Delivery step A (14-Oct-2026, user; P2B gap fill): template projects (`mock/delivery-templates.ts`: rack install, network fabric, firmware
  campaign, optics refresh, UPS battery, rack replacement, decommission, greenfield phases) become synthetic plans so the same engine gives them
  work orders / POs / tests; a seeded portfolio of 8 template projects + 4 programmes (PGM-01…04) around the planner's projects; programmes with
  dependency gates (a project waits until its predecessors are delivered; greenfield blueprint = 6 gated phases, MEP long-lead ordered at
  kick-off), risks (derived + raised, likelihood × impact), change orders (≤5% PM, ≤15% sponsor, else investment committee; approved ones move
  the approved budget and the finish), cost curves (PV / EV / AC, BAC / EAC). Screens are DASHBOARDS, not strip + tabs + list (user: "don't
  design every screen in the same format"): `delivery/Overview.tsx` (sparkline KPIs, health matrix, programme progress, needs attention,
  throughput, change outcomes, 14-day change calendar, cost curve, next 14 days, activity), `ProgrammePage.tsx` (/delivery/programmes/:id: hero,
  phase roadmap, start gates, plan against today, budget, cost, risks, materials, change orders), `ProjectPage.tsx` Overview (stage tracker,
  key dates, open work, blockers, milestones, materials, commissioning, cost, risks) + Schedule (Gantt) / Risks / Cost tabs. Widgets in
  `delivery/dash.tsx`, `parts.tsx`; styles `styles/delivery.css`.
- Delivery step B (14-Oct-2026, user): work orders and processes (`mock/workflow.ts`): P2B's 12 process definitions (P01 site onboarding …
  P12 access request; lanes, steps, targets, side branches) run over our records — every delivery work order is a P10 instance, contractor
  visits P12, open changes P05, maintenance P11, critical / high incidents P04, the firmware / decommission / hall / cage projects P07 / P08 / P02
  / P03, sites being built P01, plus closed runs of the last quarter for the KPIs. User steps are tasks (lane = candidate role; claim, complete
  with the step's form; completing P10 "Start work" / "Complete with evidence" moves the delivery work order); failed automatic steps retry.
  Screens: `/workorders` (`screens/workorders/WorkOrders.tsx`: My tasks inbox · Running work · Processes (swimlanes) · Process KPIs dashboard),
  `/workorders/instances/:id` (`InstancePage.tsx`), work order page `/delivery/work-orders/:id` (`delivery/WorkOrderPage.tsx`: stage, what /
  where, who and site access, checklist with back-out plan, sign-off or failure → re-plan, kit, change request, P10 process with its tasks).
  Menu: Plan & Build → Work orders. An approved (mobilising) project's work orders are at most Ready (they were shown in progress by date).
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
  Overview redesigned (15-Oct-2026, user: "cards not aligned", "very limited widgets … check P2B"): `screens/changes/ChangeOverview.tsx` = P2B's
  overview in our charts — pairs of equal height (420 px, bodies scroll): Volume and outcome · Lead time, Open by stage · Approvals and the change
  board, Next 14 days · Before the windows, Changes by site · Where changes fail (by source / template); then a tabbed detail table (needs attention ·
  waiting for review · next 14 days · last 28 days). Calm palette (classes blue-grey, red only for failures).
- **Phase 7 = Compliance + Customization (done, minimal redesign; menu group Admin)**: `mock/compliance.ts` evaluates policies CP-01…09 on the
  estate (rack ≤ 80%, dual-fed, cooling N+1, UPS ≥ 10 min, addresses in plan, end of support, change policy, fire inspections, PM overdue) and maps
  ISO 27001 / ISO 22237 / TIA-942 / SOC 2 controls to the policies that actually evidence them (P2B's mappings were wrong); manual controls carry an
  attestation date. `mock/customization.ts`: custom fields (filled counts derived) and tags as rules over the estate (+ runtime additions).
  Screens `screens/admin/Compliance.tsx`, `Customization.tsx`. Check: `node .qa/admin.mjs`.
  Compliance P2B gap fill + redesign (14-Oct-2026, user): policies as code (Rego package + source per policy, switch on / off — an off
  policy's violations stop counting and controls it alone evidences become Not assessed), decision records (each finding = deny / warn,
  passing resources = one allow per policy and site, with the OPA input), violation outcome Blocked / Warned + change link, attest manual
  controls, New policy / control / framework. Overview is a posture dashboard (overall ring + status tiles, framework cards, controls that
  need work, policy results, evidence due, latest decisions); styles `styles/compliance.css`.
- **Planner gaps ported (14-Oct-2026, branch planner-gaps)**: plan page tab **Plan pack** (`screens/planning/pack/*`, `styles/planning-pack.css`:
  "What this plan creates" with links into Delivery / IP & Network / DCIM, plan document (basis of design), bill of materials with sourcing,
  IP and network plan, drawings, build initiation, CSV exports). **Sourcing**: each BoM line from spare site capacity, then unheld stock, then
  the catalogue vendor under its contract (`planner/lib/sourcing.ts`; stock, vendors, contracts and catalogue from `mock/p2b/adapter.ts`
  `stockAndSuppliers`; `useSourcingContext` / `actions.sourcing`). **Delivery is the source of truth** for the build: "Start the build"
  (`planner/lib/execute.ts`) hands the plan to Delivery and records the sourced BoM with its vendor orders, stock / rack holds, IP and the plan
  type's records; Delivery's POs = those vendor orders (one per vendor and phase; before execution the same sourcing as Draft orders, so the pack
  and Delivery agree before and after); the planner reads Delivery through `planner/compat/delivery/handoff.ts`; completing the plan signs the
  handover and a handover in Delivery completes the plan (`planner/lib/closeout.ts`). Wave close, disposal certificates, the migration meter
  reading and site retirement go through the audited `applyRecordChanges` action (allowed on executing / completed plans). **Family UIs**
  (`screens/planning/scopes/{inSite,plant,network,build,replace,migration}`, registered via `scopes/registry.ts`): wizard panels, site pickers,
  requirements, pack sections and plan-page tabs (site fit, plant line-ups, paths and circuits, edge sites / portfolio, old to new and waves,
  migration inventory / consents / exit plan, "Waves and closure"); generic wizard placement / phasing / cut-over steps (`wizard/*`). **Entry
  points**: "Plan" on the datacenter page and from Capacity (`/planning/new?dc=&template=`), delivery change requests link to their plan.
  **Data refresh**: `planner/compat/query.ts` re-runs every mounted query on any planner or Delivery change; `mock/server.ts` re-reads Delivery,
  Change management and Capacity on planner writes. Demo seed on our estate: PLN-0007's 12 edge sites come from the estate's planned /
  in-progress edge locations (plan region first); approved demo baselines are re-frozen from their parameters as placed (`mock/p2b/index.ts`).
  Not ported: AI assist. Card view (19-Oct-2026, user): Plans and every Templates view (plan types, site types, modules) have a list ⇄ tiles
  switch (ListToolbar `layout`, remembered per list `dco.pn.layout.plans|templates`); cards in `screens/planning/cards.tsx` (`plc-` classes), 4 per row at 1440, 3 at 1280. Typecheck with `npx tsc --noEmit -p tsconfig.app.json` (not `-p .`). Checks: `node .qa/p2b-pack.mjs <persona> <geo>`
  (every plan × pack section, CSVs, record links), `node .qa/p2b-families.mjs <persona> <geo> [ids]` (family wizard steps and plan-page tabs);
  the scripts honour `PW_CHROME` (or point `PLAYWRIGHT_BROWSERS_PATH` at a folder aliasing the cached browser build).
- **Planner round 2 (14-Oct-2026, branch planner-gaps)**: the best of DCOS and ours, visuals first. Hub + library (`Planner.tsx`, `Plans.tsx`,
  `Templates.tsx`, `Benchmarks.tsx`, `charts/library.tsx`: bar rows, PUE matrix, lead bars, range / stack bars); Command center **Plan & build**
  (`screens/command/{pbModel.ts,PlanBuild.tsx}`, `styles/command-plan.css`): a strip above the hero (one slim row by default so the hero stays
  above the fold at 1280 × 800; "More" opens the full strip, remembered in localStorage), plan approvals in Recommendations, and the `?lens=build`
  lens (capacity pipeline planned → approved → in build → commissioning → live, decisions, week ahead, projects). Shared charts in
  `screens/planning/charts/` (`chartKit.ts` tokens / ticks / `useTip`, `ChartTip.tsx` floating tooltip, `Cashflow`, `CostBreakdown`,
  `BenchmarkBand`, `ScenarioCompare`) and `pack/drawings.tsx` (no native `<title>`; drawings measure their width). Wizard: drawings on the
  Space / Power / Network steps, phasing Gantt (`LeadTimes`), cost charts, scenario compare, affected-assets picker, site list with capacity
  bars, jump-to-step list, unsaved-changes guard. Plan page: **Schedule redesign** (`plan/schedule.tsx`: attention tiles, one collapsible group
  per phase with gates as milestones, "order in N wk" / "N wk late", filters, Timeline view, Delivery PO numbers), Overview deliverables with
  their created state (`PackDeliverables`, the pack's own manifest + records). **Family drawing sheets** (`pack/{familyDrawings,familyKit,
  familyDrawKit}`, `scopes/*/drawings.tsx`, `packModel.drawingSheets`): plant as-is / to-be single-line + cut-in sequence, DCI paths
  (domestic DCI = terrestrial long-haul routes through carrier POPs; subsea only between countries), hall grid / rack elevations before and
  after, wave plans; drawings print on landscape A4 (named page `planner-sheet`, drawings only). Engine text money (`fmtUsd`) uses the
  geography's formatter registered by the mock server (`compat/registry.registerPlannerMoney`); `fmtMoney` groups the top unit (₹14,284 Cr).
  **Plan page tab bar** (`plan/tabbar.tsx`, the tabs that fit + "More"): every tab button carries `data-id` (its `?tab=` id) and "More" lists
  the hidden ids in `data-more`, so QA visits tabs by id, never by label. New checks: `node .qa/cc-plan.mjs [persona geo …]` (strip, hero height, trio, lens pairs, stage switch, decision links),
  `node .qa/p2b-drawings.mjs <persona> <geo> [ids]` (every sheet: empty, NaN, overlapping or out-of-sheet SVG text).

- **Plan review pack (15-Oct-2026, branch plan-pack-review, user: "the final document reviewed by the end user on email or in the portal")**:
  ONE content model `pack/review/model.ts`, filled once by `review/build.ts` `buildReviewDoc(input)` (inputs from `review/reviewInput.ts`
  `useReviewInput(plan)`, shared by the portal hook and the Plan pack downloads: scenario under review → approved → preferred → base). Sections
  (empty ones dropped, renumbered; ids stable, sub-sections "4.1" are sections of their own): approval sheet (path, approvers, decisions, sign-off,
  conditions, rounds, changes since the parent's baseline) · executive summary · scope and requirements (site baseline, holds merged per device,
  inputs off the template) · design basis (power chain, plant, cooling, network, rack classes, figures inline) · the family's analysis
  (`review/family.ts`: every family pack section rendered to static markup with all DataTable rows (`DataTableAllRows`) and read back into blocks;
  tables over 40 rows go to the workbook in full) · capacity · cost and business case (+ baseline vs now) · bill of materials and sourcing ·
  schedule · network and IP · risks, permits, conditions · rule checks · delivery and build initiation · assumptions and sources · Appendix A
  drawing register. Drawings: `review/svg.ts` renders the SAME `SheetContent` (`pack/sheetContent.tsx`, also used by DrawingsView) with
  react-dom/server at `SHEET_W` 1040 (`DrawWidth` context in chartKit), resolves `var(--vw-color-*)` (live token, else `review/tokens.ts`
  generated from design-system/colors.css), redraws legend / caption / notes as SVG, prefixes ids; `framedSheetSvg` adds frame + title block.
  Files (all lazy): `pdf.ts` (pdfmake 0.3.11, Inter TTFs from @expo-google-fonts/inter fetched only when a PDF is built: cover + verdict,
  contents with page numbers, header doc number / revision, footer page x of y, tables with repeated header rows, vector figures, landscape
  drawing pages; only titled tables are numbered, as in the portal), `xlsx.ts` (exceljs 4.4.0: a sheet per ReviewSheet, frozen header, filters,
  money #,##0 with the currency in the header), `zip.ts` (fflate 0.8.3: PDF, workbook, csv/*.csv with BOM, drawings/*.svg, README.txt,
  manifest.json with sizes + SHA-256; `buildPackFile` / `downloadPackFile`). Plan pack tab: "Review pack" panel with the three downloads.
  Checks: `npx tsx --tsconfig tsconfig.app.json --import ./.qa/lib/css-hook.mjs .qa/review-doc.ts <persona> <geo> [ids]` (lint: NaN, undefined,
  raw keys, rule ids, empty sections, row widths; writes text dumps + SVGs to .qa/out/review), same flags `.qa/review-files.ts` (node: PDF / XLSX /
  ZIP built and checked with poppler + exceljs + manifest checksums, no heading at a page bottom, no blank page; PAGES=1 renders PNGs),
  `node .qa/p2b-review-pack.mjs <persona> <geo> [ids]` (browser: the Plan pack buttons download and the files check out).

- **Plan review portal (15-Oct-2026, branch plan-pack-review)**: `/planning/plans/:id/review` (`pack/review/ReviewPage.tsx`) renders the plan's
  ReviewDoc (`review/useReviewDoc.ts` → `buildReviewDoc`, the same object the PDF / workbook / ZIP use) with `ReviewDocView.tsx` (cover, numbered
  sections and "4.1" sub-sections, tables numbered per section, figures, sign-off boxes, drawing sheets; print-friendly via `printPlanArea`, sheets on
  landscape pages). Band: Decision (the plan's own path, whose turn, the same `DecideModal` / `actions.decide` and segregation rules as the Approvals
  tab) · Review status · Review pack files (`review/files.ts` → zip.ts). Side: Contents rail (sub-sections unfold under the section in view) |
  Comments (threaded per section id, reply, resolve). **Send for review** (`review/SendForReview.tsx`, lazy via `review/lazy.tsx`; plan header,
  Plan pack "Review pack" panel, review page): reviewers = holders of the path's roles minus requester / submitter (`planner/lib/reviews.ts`), message,
  PDF / ZIP / link only, email preview with real attachment sizes; a draft can be submitted at the same time. No email is sent (note in the modal).
  Records: collections `planReviews` (REV-n) + `planReviewComments` (RVC-n), actions `requestReview` / `commentOnReview` / `resolveReviewComment` in
  usePlanner (audited on the plan → History). Shown on the plan page (note under the header, Approvals tab panels) and in the hub's "Plans that need
  action" (`Your review` for the signed-in reviewer who has not answered, else `Review sent`). Check: `node .qa/p2b-review.mjs <persona> <geo> [ids]`
  (W=1280|1440; render, raw values, overflow, PDF / XLSX / ZIP downloads, then send → comment → reply → resolve → hub → decide).

- **Plan drill-down: edit from the plan page + a cleaner page (15-Oct-2026, branch plan-pack-review, user: "options in the plan drill-down for
  materials, adjust project plan etc. … make the plan drill-down UX cleaner, like the other UX in our product")**. **Edit rule** (one for every
  editor on the plan page): `plan/edit/policy.ts` `usePlanEdit(plan, { living? })` → `{ policy: { mode, note, commitLabel, target }, commit(patch, what) }`;
  Draft / Rejected = in place; In review = "Withdraw and save" (withdraw, then patch); Approved / Executing = "Draft revision B" (raiseRevision,
  then the edit patched onto B, audited "Raised to change: <what>"; map fields such as params are re-based so B keeps its approved overrides; an
  open draft revision takes further edits — "Save to revision B"; one in review makes the editor read-only); On hold / Completed / Cancelled /
  superseded = read-only with `G.lockReason`. `living: true` (risks / permits only) saves straight onto a locked plan. Editors show
  `plan/edit/EditNote.tsx` (the calm banner) and land on the returned plan with `landOn(plan, result, tab)`; `patchPlan(id, patch, note?)` and
  `raiseRevision(plan, reason?)` carry the note into History. Never write plan fields from the plan page without it.
  **Page** (`PlanPage.tsx`, `plan/header.tsx`, `plan/overview.tsx`; styles in `planning-plan.css`), in the Delivery project page's rhythm: header
  (scope icon, title, status / Rev chips, one facts line, primary action + Send for review + Actions) → ONE status line `.pn-status` (state in
  words, whose decision, blockers, conditions, template drift, the build in Delivery, an open review — it is the `.note` p2b-review looks for — and
  an open revision) → hero strip `.pn-hero` (readiness ring, or % built in delivery, + IT capacity · CapEx · Payback · Needed by · Rule checks,
  each opens its tab) → ALL tabs in one row (no Figures picker; figures follow approved → in review → preferred scenario → base). Tab order:
  Overview · Project plan (id `schedule`) · family tabs (short labels: Equipment, Inventory, Waves, Plant, Paths, Site fit) · Design (id `sizing`;
  Sizing + Capacity, anchor `#pn-capacity`) · Cost · Materials · Risks & permits · Rules · Approvals · Plan pack · Delivery · History (holds the
  Baseline when there is no Delivery). Scenarios open on demand from the header's What-if button (a drawer; icon + count below 1440 px). Old
  `?tab=capacity|baseline|scenarios` still land right. Every plan's tabs fit one row at 1280 — keep labels short and counts for attention only.
  Overview = 12-column dashboard: What and why (intent, Draft → In review → Approved → In delivery → Completed tracker, next step, where /
  owner / template / design), Key dates, Needs attention (failing rules, late items, conditions, decision due, review comments, submit blockers,
  soft rules), Phases, Cost · Capacity · Readiness, Inputs changed from the template, What the plan produces. **Project plan** (`plan/ProjectPlan.tsx`):
  phases and dates; "Adjust the project plan" edits name / go-live / IT kW / density / cooling, split / merge / remove / add phases and the
  needed-by date (phases move with it by default; live phases stay); the effect is computed live with `useDraftEvaluation` on the draft vs the plan
  (design IT, racks, late items and to-order-in-90-days from `useSchedule` so Delivery's POs count, CapEx, NPV, payback, failing rules, newly late /
  no longer late, first order-by, CapEx by build year, the capacity ladder) and the Schedule board / timeline below is drawn from the draft; a sticky
  bar lists the changes and commits with `policy.commitLabel`. Design IT follows the phase sum when it did before.
  **Materials** (`plan/Materials.tsx`, engine `planner/lib/materials.ts`, styles `planning-materials.css`): the bill is priced once in `buildBom`
  (catalogue model and price; sourcing no longer re-prices), so the bill, Cost tab reconciliation, pack, review pack and Delivery POs agree. Edits are
  `plan.materialOverrides` keyed by `kind|item|phase|site` (or `ADD-n`): quantity, model (same kind; same rating for plant; per-rack IT re-fits),
  vendor (maker or catalogue `CHANNELS`: premium, lead difference, contract from the seed), source (auto / site / stock / buy, from
  `sourceAvailability`), remove, add from the catalogue. `evaluate()` adds one CapEx line "Bill of materials changes" (bill − proposal; the
  reconciliation skips it), sets `ev.materials`, and lays the changes over the schedule by `leadItem`. Check: `node .qa/p2b-materials.mjs <persona> <geo> <PLN> [width]`.
  **Equipment, risks and permits**: `plan/EquipmentEditor.tsx` is the family tab `equipment` (replace "Equipment and waves", migration "Inventory and
  waves", in-site "Racks and equipment"; registered in `scopes/{replace,migration,inSite}/index.tsx`); it reuses the wizard panels on a local copy
  re-evaluated live, and read-only plans show the plan-pack read views. `plan/RisksPermits.tsx` is the `risks` tab (lists + drawer): status, rating,
  owner and mitigation updates are a live register (`usePlanEdit(plan, { living: true })`); adding, removing or renaming items drafts a revision and
  is merged by item id into an open one. Shared `plan/EffectBar.tsx`: EffectStrip (new value, "was …"), pinned ChangeBar (Discard / Review / the
  policy's commit label; withdraw and revision always go through the review dialog), `usePending` keeps unsaved edits per plan across tabs.
  Styles `planning-equipment.css` (`peq-`). Check: `W=1280|1440 node .qa/p2b-plan-edit-eq.mjs <persona> <geo>`. Planner CSS is global: never
  reuse a class name another planner stylesheet already styles (`.pn-params` / `.pn-figs` clashes broke the wizard twice).

## Platform menu proposal (19-Oct-2026, user: "place the Datacenter menus in the platform launcher's sections")
`docs/dco-platform-menu.html` (served at `/platform-menu.html`; copy to `app/public/` after editing): the platform launcher's 8 sections with
each Datacenter screen as its own card (Plan to Build: Planner, Capacity, IP & Network, DCIM, Programmes & Projects, Work Orders · Ops Toolkit:
Command Center, Datacenters, Facilities, AI & GPU, Alerts, Compliance · ITSM: Incidents, Change Management · BSS: Revenue Impact · Intelligence
Hub: Data Model · Platform Engineering: Customization), embed URLs with `?shell=false`, overlaps with platform cards flagged; the old
"Data Center" and "Datacenter Ops" cards are shown as replaced. Our own left menu is unchanged.

## Sub-menus (19-Oct-2026, user: "create sub-menus inside Planner like the tabs on the screen … remove the tabs, keep the ones not in a sub-menu")
`shell/submenus.tsx` is the one table: per screen (planning, capacity, ipam, dcim, delivery, workorders) its sub-menus, each covering `?tab=`
ids (merged tabs, e.g. Capacity Power = power + energy, DCIM Racks = racks + floorplan, Delivery Projects = projects + workorders, Insights =
overview + todo) and a one-line `desc`. The left menu (`shell/Layout.tsx`) renders them as `.rail-sublink`s under the open screen (one lit on the
screen itself, none on its detail pages); **Commissioning** is its own Plan & Build item bound to `/delivery?tab=commissioning` (`tab` on a NAV
item). Screens draw their tab row with `<SubTabs screen=…>`: no row when the open sub-menu covers one tab, only that sub-menu's tabs (in its
order) when it merges several; `subCrumb()` adds the sub-menu to the breadcrumb. `?tab=` ids, defaults, tiles and cross-links are unchanged,
so every deep link and QA script works; a new tab must be added to a sub-menu (or bound to a menu item) or it has no way in. The platform
launcher uses the same URLs (`/platform-menu.html` card chips + table rows, embed guide "Sub-menus" table). Platform decisions: Datacenter
Ops (Ops Toolkit) holds Command Center · Datacenters · Facilities · GPU Fleet (= /gpu) · Compliance as sub-menus. The /gpu screen, its menu
item, the datacenter sub tab and the docs are called **GPU Fleet** since 21-Oct-2026 (user; was "AI & GPU" — code comments, ids and `gtab=` keep the old name).

## Sub-menu headings (21-Oct-2026, user: "in the platform each sub-menu is its own menu screen; Capacity → Power still showed the Capacity heading")
Every sub-menu in `shell/submenus.tsx` carries `title` + `sub`; `subHead(screen, tab, fallback)` returns them (or `BOUND_HEADS` for a tab bound to a menu
item, e.g. Commissioning) and the six screens spread it into `PageHead`. Insights screens are titled just "Insights" (user: no module prefix). Capacity appends
"Scope: <dc>." when a datacenter is picked. Platform embeds (`?shell=false`) therefore read "Power", "Racks", "Projects" …, never the module name twice.

## Insights-only strips and the DCIM Insights screen (21-Oct-2026, user)
Planner, IP & Network and DCIM show their analytics strip (StatGrid) on the **Insights** sub-menu only; Plans, IP space etc. open straight on
the list. Benchmarks has one ListToolbar per view above its panels (search, Reference value / Site type quick filters, Cooling / Tier / Region /
Confidence in the panel; Rules: Area / Severity) filtering every table and chart of the view (`?metric site cooling tier region conf area sev`).
Delivery's header shows one action per sub-menu (planner on Insights, New programme on Programs, New project on Projects).
DCIM → Insights (`screens/dcim/Insights.tsx`, `?tab=overview`, now the default `/dcim`): Needs attention (same predicates as the Racks / Cabling /
Power / Devices list filters, each row opens that filtered list), sites and halls by power pressure (85% marker), rack density and device
donuts, cabling stacks, power panels by load, makers, change requests (board views). Grid = Delivery's `dl-dash` (+ `.dcim-ov > .dl-span-5/7`).
`.qa/dcim.mjs` reads the rack tile on Insights.
Raise actions per screen (21-Oct-2026, user): DCIM → Changes has **Raise change request** (the Change management `NewChange` form in a drawer,
`origin: 'DCIM'`, lands in Awaiting approval); DCIM header shows New rack / Install device on Insights · Sites · Racks, Install device on
Devices, nothing on Cabling / Power / Catalogue (they have in-tab actions). Facilities → Maintenance (PM plan) has **Schedule maintenance** →
`/changes?new=maintenance`. Delivery's strip was removed from its sub-menus (Insights has its own tiles). Not added, flagged only: a manual
Raise incident (incidents come from alarms), Start a process on Work orders, Request permit / Add design document on Delivery.

## Help & FAQ (21-Oct-2026, user: "add a FAQ section as a menu and keep all the Datacenter docs in this help section")
Menu Reference → **Help & FAQ** (`/help`, `screens/Help.tsx`, styles `styles/help.css`). Tabs FAQ (19 questions in six categories, search + category
pills, `<details>` accordion, answers link to screens and into the reader) · Documents (cards in three groups: Understand the product = field guide,
GPU anatomy, demo playbook, personas, platform overview PDF / Word · Data = data model, import template, the 10 estate backups · Integrate and embed =
integration, embed and platform menu guides). A card's "Read" opens the HTML doc from `app/public` in an in-app reader (`?tab=docs&doc=<id>&s=<hash>`;
section chips set the doc's `#hash`, which the guides read on load; the iframe is re-keyed on each change); downloads open directly. New docs go in
`DOCS` there; new questions in `FAQ`. The embed guide lists the route and every served document.

## Power economics (21-Oct-2026, user: "build the power economics screens" after reviewing the neocloud pitch deck)
Read model `mock/power-econ.ts` (derived per data version and scope, server `powerEconomics(dcId?)`, API `getPowerEconomics`, types `SitePowerEcon ·
GpuPodPowerEcon · GpuPowerEcon · PowerEconomics`). Per live site: a TARIFF per state (US EIA industrial averages $/kWh; India DISCOM HT ₹/kWh — real
local prices, never run through `money()`), a seeded POWER CONTRACT (`draw(id|field)` hash, never the generator's stream): utility = connection sized a
little above design capacity, take-or-pay floor 60–85%, demand charge $14 / ₹420 per kW-month; colocation (NeoCloud ~half the sites, cloud a quarter) =
a block 10–45% above today's peak billed per committed kW-month ($145 / ₹7,800), floor 100%; escalator, term end. Bill = energy (facility load × 24 h × 30.4 ×
tariff) + capacity (demand charge on max(peak, floor) or the whole block); idle kW = billed − peak; sold kW = GPU nodes in a running job + tenant contracted
power; cost per sold MW-month (null when nothing is sold → cost per IT MW). GPU: per pod kW/GPU × site PUE × tariff = power per installed GPU-hour, the same
power over earning GPUs = per sold GPU-hour, against the model's price (`jobRate`), share %, "left after power", idle GPUs' power cost; `deck` = the pitch
deck's 1.2 kW · PUE 1.46 line at the blended tariff. Screens: Capacity → Power sub-menu tab **Power economics** (`?tab=economics`, `screens/capacity/
PowerEconomics.tsx`: strip, idle-cost BarList, bill Donut + facts, site table → Facilities power) and GPU Fleet → Cooling & power opens with `GpuPowerCost`
(strip + pods table → `/capacity?tab=economics&dc=`). Styles `styles/power-econ.css`. Tariffs are marked illustrative on screen; a customer's tariff sheets
and contracts replace them.
Round 2 (21-Oct-2026, deck items 3–5, same module): **per job / tenant** (`gpu.jobs`, `gpu.tenants`: node kW × PUE × tariff per day against what the job
earns; idle allocations = billed, drawing, doing nothing; a power cap's kW saved against the GPU time it costs) → GPU Fleet → Cooling & power "Energy and power
cost by job" (By job / By tenant, callouts; `screens/gpu/PowerUse.tsx`). **Findings** (`anomalies`, `buildAnomalies`): colocation block ≥ 85% drawn (overage
1.5×, exposure = next 100 kW tranche / yr), new 12-month demand peak above the take-or-pay floor (prior peak = max(history12m[0..10]) × 1.06; exposure =
Δ × demand rate × 12), draw > 12% above the 24 h mean with no change in progress and no job started in 24 h, block ≥ 30% idle. The generator's last phase
`raisePowerContractAlerts` (generate.ts, after `raiseOperatorServerAlerts`, NOT for the network persona so its fingerprint holds) raises one alarm per finding
(`PWR-<site>-<KIND>`, source Power, Facility) and one Medium Power incident for the costliest block / ratchet finding (RCA: recent GPU job starts, cooling
overhead, meter error; actions: cap inference pods in the peak window, place new jobs where power is already paid, supplier confirmation / block uplift;
impact = the money exposure, no services). Shown as "Power findings against the contracts" on Capacity → Power economics (alarm + incident links); cloud /
colocation may have none. **Placement** (`gpu.placement`): per pod free healthy GPUs, rack headroom, cooling state (CDU for liquid), contracted headroom,
"already paid" kW (idle block or below the floor), marginal power per GPU-hour (kW per busy GPU × PUE × tariff), fit good / tight / no → GPU Fleet tab
**Where to place** (`?gtab=placement`: GPUs needed 8–256 + model picker, strip, ranked pods). Opstral AI: "Where should the next GPU job go?", "What is power
costing us / <site>?" (sentinel.ts, before the GPU branch). Checks: `node .qa/gpu.mjs neocloud`, `node .qa/capacity.mjs neocloud us`, `npx tsx .qa/fingerprint.ts network`.

## Ship (19-Oct-2026, user: "save tokens")
`scripts/ship.sh -m "message" [-c "string in the new build"] [paths…]` = production type-check → commit (default: modified tracked
files + new files under app/src, docs, app/public, scripts; never app/package-lock.json) → push main → Vercel deploy of HEAD from a
clean worktree at the repo root → wait for Ready → optional live check (`-c`, searches every JS chunk). `-d` = deploy only.
