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
Scope decisions 02-Oct-2026: the menu is Command center · Datacenters · Facilities · Topology · Alerts · Incidents · Changes & maintenance.
Network services, Customers and Capacity & forecast are parked (code kept, routes redirect); services and customers appear only as
impact on incidents, devices and sites. Revenue is not shown anywhere operational. Site tabs: Overview (3D) · Attention · Topology (`TopologyView` from screens/Topology.tsx, same view as the /topology page) · Metrics (aggregated thermal/power/backup/fault KPIs)
· Customers (customers served from the DC) · Assets (floors/rooms/racks, equipment by category, facility plant) · Equipment
(installed devices only; planned devices = reserved rack space) · Power & space · Ops log. Cabling tab hidden (02-Oct-2026; `site/Equipment.tsx` kept). No discovery/drift/reconciliation UI.

## Personas (02-Oct-2026) — one estate, four business models
Top-bar dropdown (`shell/Layout.tsx` PersonaSwitch) sets `Persona` = network | colocation | cloud | enterprise (localStorage `dco.persona`).
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

## Visual rhythm (02-Oct-2026) — one system, not per-screen styling
- `OpsKpi` (screens/ops/shared.tsx) is THE KPI card everywhere: `.app-kpi` = white `.vw-card-section`, grey icon, light metric,
  `.vw-card-variance` note; state only via the 3px top accent (red = fault, amber = attention). No pastel-tinted tiles.
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
  legend items toggle states, Focus-issues / Reset buttons, wheel-zoom only after clicking the map. Check: `node .qa/map.mjs`.
- Lists keep their toolbar and column header pinned under the top bar while rows scroll (sticky; wrappers use `overflow: clip`,
  never `hidden`, around a `.dt`). Check: `node .qa/sticky.mjs`.
- Every list uses `ui/ListToolbar.tsx` (no hand-built toolbars): `Showing N of M` · search · ≤2 quick filters (searchable dropdowns)
  ··· refresh · filter icon (Filters panel: categories / options / Reset to default / Apply filters) · ⋮ actions. URL-backed lists pass
  `onApply={useParamPatch()}`. All grid columns left-aligned (header = values). Check: `node .qa/toolbars.mjs`.
- Palette: slate/white, brand blue accent, red/amber for faults only. The digital twin (`screens/site/twin`) is signed off — don't restyle it.

## Command center layout (02-Oct-2026, after the user rejected the 17-box version)
Hero card = health ring + verdict + 4 areas as rows (left) and the live DcMap (right); one `.vitals` strip of 6 metrics with
24 h sparklines (`commandCenter().trends`); then Critical now cards; then ImpactBoard | Recommendations, Exposure | Causes (the 7-day "What happens next" board was removed 05-Oct-2026).
Don't reintroduce rows of boxed KPI tiles on the landing page.

## Testing cadence (user, 02-Oct-2026)
Small change → verify only the affected screen (screenshot/measure at 1440 and 1280). Full suite `app/.qa/regress.sh` ONLY when the
user explicitly asks — not even before push/deploy. Digital twin is final: don't edit `src/screens/site/twin/*`, don't run `twin.mjs` / `twin-full.mjs`.
