---
name: nst-design-system
description: Generates Vision Waves / NST enterprise UI using repo components only. Use when building dashboards, KPI cards, admin consoles, forms, tables, HTML mocks, or any UI in this design-system repo. Enforces nst-design-system.css, vw-card/vw-chip classes, and COMPONENTS.md registry — never random designs.
---

# NST Design System

## Non-negotiable workflow

Every UI generation task MUST follow this order:

1. **Read `COMPONENTS.md`** — find the component type (card, chip, input, table, etc.)
2. **Read the reference file** listed in the registry (CSS module + `preview/*.html`)
3. **Generate using only those classes and tokens**
4. **Self-check** against the Forbidden list in `COMPONENTS.md` before finishing

If you skip step 1, the output is wrong.

## Stylesheet (always)

```html
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="nst-design-system.css">
```

Add `components.css` only for `.nst-input` / `.nst-table-*` forms.

## Legacy / dashboard (default)

Match `reference-only` guidelines output:

- Cards: `.vw-card-section`, `.vw-card-parent`, `.vw-card-child`
- Type: `.vw-card-title`, `.vw-card-description`, `.vw-card-metric-lg`
- Status: `.vw-chip.vw-chip--success` (etc.)
- Layout: `.vw-flex.vw-flex-col.vw-page-gap-sm`, `.vw-grid.vw-grid-cols-auto-320`
- Specimens: `preview/vw-cards.html`, `preview/kpi-card.html`

## Atomic controls (only when needed)

- Inputs/tables: `components.css` + `preview/inputs-states.html`, `preview/table.html`
- React atoms: `ui_kits/admin-console/components.jsx` (buttons, fields — not for KPI cards)
- Figma previews: `preview/buttons-*.html`, `preview/chips-status.html` (secondary reference)

## Hard rules

- **Poppins** on all enterprise/dashboard pages
- **Sentence case** UI copy
- **Tokens** `var(--vw-color-*)`, `var(--vw-space-*)` — no invented hex
- **No freestyle** cards, chips, or color palettes
- **No** Tailwind, Bootstrap, Material, or generic `.card` classes

## Example — KPI card (copy this pattern)

```html
<div class="vw-card-section vw-flex vw-flex-col vw-justify-between" style="max-width: 300px;">
  <div class="vw-card-title">Potential revenue</div>
  <div class="vw-flex vw-justify-between vw-items-baseline vw-gap-sm">
    <div class="vw-card-metric-lg">₹2.5M</div>
    <div class="vw-card-variance is-positive">+12%</div>
  </div>
</div>
```

## When user request is vague

Ask: dashboard/card screen, form page, or atomic component? Then apply the matching layer from `COMPONENTS.md`.
