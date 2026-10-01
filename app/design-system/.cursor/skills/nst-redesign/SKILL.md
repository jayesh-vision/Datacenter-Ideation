---
name: nst-redesign
description: Redesigns an existing app's UI/UX to match the NST / Vision Waves design system — audits current screens, maps old classes/colors/fonts (Bootstrap, Tailwind, MUI, custom CSS, etc.) onto the `.vw-*`/`.nst-*` registry in COMPONENTS.md, and migrates screen-by-screen without breaking app logic. Use when a user wants to "redesign", "reskin", "restyle", "migrate to NST", or "apply the design system to my existing app" on a codebase that isn't yet using this design system. Complements `/nst-app-bootstrap` (one-time wiring) and `/nst-design-system` (net-new component generation).
user-invocable: true
---

# NST Redesign

Retrofits an **existing** app's UI onto the NST / Vision Waves design system. This is a migration skill, not a generation skill — the app already has screens, markup, and (usually) working JS/data logic. The job is to replace the visual layer without breaking behavior.

## How this fits with the other two skills

| Skill | When |
|---|---|
| `/nst-app-bootstrap` | One-time only. Run first if this app has never been wired to the design system (no `design-system/` submodule, no reachable `COMPONENTS.md`). |
| `/nst-design-system` | The component registry and rules this skill draws from. Every mapping below resolves to something in `COMPONENTS.md`. |
| `/nst-redesign` (this skill) | The app already has UI. Walk it screen-by-screen and swap it onto the registry. |

If the design system isn't wired in yet, stop and run `/nst-app-bootstrap` before doing anything below — don't hand-roll a partial stylesheet link.

## Step 1 — audit before touching anything

Inventory the app before writing a single line of code:

- List every screen/route/page (or component file, for a React/SPA app).
- For each, note: the current UI library/framework (Bootstrap, Tailwind, MUI, Ant, plain CSS, styled-components, etc.), current font, current color values (hex/rgb), and the UI patterns present (cards, tables, forms, buttons, chips/badges, nav, charts, modals).
- Note anything that is **not** pure presentation — state, event handlers, data fetching, routing, validation. This must not change.

Produce a short before-state checklist and share it before migrating anything. Don't start editing mid-audit.

## Step 2 — map old → new

Build a translation table using `COMPONENTS.md` as the source of truth. Typical mappings:

| Existing pattern | NST replacement |
|---|---|
| Bootstrap `.card` / `.card-body` | `.vw-card-section`, `.vw-card-title`, `.vw-card-description` |
| Tailwind utility soup on a metric tile | `.vw-card-metric-lg` + `.vw-card-metric-label` |
| MUI `<Chip>` / Bootstrap `.badge` | `.vw-chip.vw-chip--success\|error\|warning\|info\|neutral` |
| Custom hex colors (`#1a73e8`, `rgb(...)`) | nearest token in `colors.css` / `theme-tokens.css` (`var(--vw-color-*)`, `var(--primaryColor*)`) |
| Inter / system-ui / Roboto on dashboard pages | Poppins (Google Fonts link from `COMPONENTS.md`) |
| Raw `<input>` / `<table>` with custom CSS | `.nst-input`, `.nst-table` / `.nst-table-card` family (Layer 2) |
| Bootstrap/MUI buttons | `.nst-btn` + variant/size modifiers |
| Custom flex/grid utility classes | `.vw-flex`, `.vw-page-gap`, `.vw-grid.vw-grid-cols-*` |

If something has no registry equivalent, say so explicitly and propose adding it to the design system rather than inventing a one-off style — same rule `/nst-design-system` follows.

## Step 3 — migrate in this order

1. **Global tokens first**: swap the font link and root stylesheet include (`nst-design-system.css`, Poppins). This alone reveals how much existing CSS was fighting the old framework vs. genuinely custom.
2. **Layout shells** (page containers, nav, grid) → `.vw-flex` / `.vw-grid` / `.vw-page-*`.
3. **Cards and KPIs** → Layer 1 `.vw-card-*`.
4. **Forms, tables, buttons** → Layer 2 `.nst-*` (only where the screen needs atomic controls).
5. **Status/semantic elements** (chips, badges, alerts) → `.vw-chip--*`.
6. **Charts** → match `preview/bar-chart.html` / `preview/line-chart.html` structure.

Go screen by screen, not stylesheet-wide in one pass — each screen should still work immediately after its swap.

## Step 4 — preserve behavior

- Keep IDs, data attributes, event bindings, and JS selectors intact. If a class rename forces a selector update, make that update in the same pass — don't leave a dangling selector.
- Don't touch business logic, API calls, or state management while restyling. If a screen needs both a behavior fix and a redesign, do them as separate passes.
- For React/JSX apps, prefer swapping to `components.jsx` from `ui_kits/admin-console/` where an equivalent exists, keeping props and data flow unchanged.

## Step 5 — self-check

Before calling a screen done, check it against `COMPONENTS.md`'s **Forbidden** list: no random hex, no leftover Tailwind/Bootstrap/MUI classes, no Inter on dashboard pages, no invented `.card`/`.badge` names. Compare the result against the matching `preview/*.html` specimen.

## Report per screen

For each screen migrated, state: old pattern → new pattern, any registry gaps found, and anything intentionally left untouched (with the reason why).
