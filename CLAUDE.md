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
impact on incidents, devices and sites. Revenue is not shown anywhere operational. Site tabs: Overview (3D) · Attention · Equipment
(installed devices only; planned devices = reserved rack space) · Power & space · Cabling · Ops log. No discovery/drift/reconciliation UI.

## Visual rhythm (02-Oct-2026) — one system, not per-screen styling
- `OpsKpi` (screens/ops/shared.tsx) is THE KPI card everywhere: `.app-kpi` = white `.vw-card-section`, grey icon, light metric,
  `.vw-card-variance` note; state only via the 3px top accent (red = fault, amber = attention). No pastel-tinted tiles.
- Page: `.page` gap/padding, panel density, tabs and table toolbar come from the tail of `styles/base.css`; per-screen CSS does layout only.
- Side-by-side cards must be equal height (`.qa/heights.mjs` checks the command center); nothing clipped at 1280.
- Palette: slate/white, brand blue accent, red/amber for faults only. The digital twin (`screens/site/twin`) is signed off — don't restyle it.

## Command center layout (02-Oct-2026, after the user rejected the 17-box version)
Hero card = health ring + verdict + 4 areas as rows (left) and the live DcMap (right); one `.vitals` strip of 6 metrics with
24 h sparklines (`commandCenter().trends`); then Critical now cards; then ImpactBoard | Recommendations, Exposure | Causes, 7-day board.
Don't reintroduce rows of boxed KPI tiles on the landing page.

## Testing cadence (user, 02-Oct-2026)
Small change → verify only the affected screen (screenshot/measure at 1440 and 1280). Full suite `app/.qa/regress.sh` only on request
or before push/deploy. Digital twin is final: don't edit `src/screens/site/twin/*`, don't run `twin.mjs` / `twin-full.mjs`.
