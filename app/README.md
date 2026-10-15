# Data Center Operations — prototype (mock data)

```bash
npm install
npm run dev        # http://localhost:5181
npm run build      # typecheck + production build
```

## Demo path (the operational flow)

Estate → Datacenter → Infrastructure → Connectivity → Services → Customers → Events → Impact → Diagnosis → Action

1. **Command center** `/` — attention queue: "incidents breaching SLA" → Incidents.
2. **Estate** `/inventory` → West region → **Datacenters** `/inventory/datacenters` → **MH-DC-001**.
3. **Site · Attention** — 76 not discovered / 21 drifted → **Reconciliation** (accept observed → audit trail).
4. **Site · Site details / Site equipment** — power, racks, ports, cable ledger → port 7 → PE-T4-01 xe-0/0/3.
5. **NE MH-DC-001-PE-T4-01** — Overview (health, ICMP/NTP/RADIUS) → **Links** (xe-0/0/3 at 87%, forecast) →
   **Network services** (15 services, 6 on xe-0/0/3) → **Alerts & diagnostics** (ALM-1930 flapping, AI root cause 92%).
6. **INC-0001** RCA workspace — correlated alerts, impact on services/customers, CHG re-patch 15 h before,
   approval-gated action plan → closure checks → resolve.
7. **Capacity** → raise a plan for the backhaul; **Ask Sentinel** anywhere ("what is at risk in Pune?").

## Code mapi

| Path | Role |
|---|---|
| `src/api/types.ts` | API contract (entity + roll-up shapes) |
| `src/api/index.ts` | The only data module screens import — async `getX()`, mutations, `useQuery`. Swap bodies for `fetch` to go live; suggested REST paths are inline. |
| `src/mock/seed.ts` | Static seed: regions, 20 circles, 24 datacenters, customers, clock (01-Oct-2026 13:20) |
| `src/mock/generate.ts` | Deterministic estate: NEs, interfaces, links (LLDP/OSPF/ISIS/BGP/LSP), services, facility, alerts, changes, reconciliation |
| `src/mock/incidents.ts` | Alert → incident correlation scenarios, impact, RCA hypotheses, action plans |
| `src/mock/server.ts` | Mock backend: queries, derived roll-ups (`DcSummary`, capacity, command center), mutations |
| `src/mock/sentinel.ts` | Deterministic copilot answers with evidence links |
| `src/shell/` | Rail, topbar breadcrumbs, ⌘K search, Sentinel drawer |
| `src/ui/`, `src/charts/` | Shared NST components, tables, status chips, SVG charts |
| `src/screens/` | One file (or folder) per screen |

Every count on screen is derived from the entities, so a number reached from two screens is the same number.
State lives in memory: mutations (ack, resolve, reconcile, approve…) persist until reload; "Reset demo data" is in the bell drawer.

## QA

```bash
node .qa/all.mjs                      # every route @1440/1280: console errors, NaN/undefined, overflow
node .qa/shot.mjs "/route|name" …     # full-page screenshots into .qa/out/
npx tsx .qa/data-check.ts             # dataset reconciliation printout
```
