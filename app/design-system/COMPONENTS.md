# Component registry

**Read this before generating any UI.** If a component exists here, you MUST use it. Do not invent styles, colors, fonts, or class names.

## Mandatory setup (every HTML page)

```html
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="nst-design-system.css">
```

Optional form/table layer:

```html
<link rel="stylesheet" href="components.css">
```

---

## Layer 1 — Legacy / dashboard (default for enterprise apps)

Use for: KPI cards, dashboards, admin consoles, CRM screens, data-dense layouts.

| Need | Use | Reference |
|------|-----|-----------|
| Stylesheet bundle | `nst-design-system.css` | imports all vw layers |
| Card container | `.vw-card-section` | `vw-cards.css`, `preview/vw-cards.html` |
| Nested cards | `.vw-card-parent`, `.vw-card-child`, `.vw-card-child-shaded` | `vw-cards.css` |
| Card title | `.vw-card-title`, `.vw-card-title-lg`, `.vw-card-title-sm` | `vw-cards.css` |
| Card body text | `.vw-card-description` | `vw-cards.css` |
| KPI / metric value | `.vw-card-metric-lg` … `.vw-card-metric-xxxl` | `vw-cards.css`, `preview/kpi-card.html` |
| Metric label | `.vw-card-metric-label`, `.vw-card-metric-label-sub` | `vw-cards.css` |
| Trend / delta | `.vw-card-variance.is-positive\|is-negative\|is-neutral` | `vw-cards.css` |
| Semantic card bg | `.vw-card--success\|error\|warning\|info` (+ fuchsia, purple, etc.) | `vw-cards.css` |
| Status chip | `.vw-chip.vw-chip--success\|error\|warning\|info\|neutral` (+ `-solid`) | `vw-chips.css` |
| Page title | `.vw-page-title`, `.vw-page-description` | `vw-cards.css` |
| Layout | `.vw-flex`, `.vw-flex-col`, `.vw-justify-between`, `.vw-page-gap`, `.vw-gap-sm` | `vw-utilities.css` |
| Grid of cards | `.vw-grid.vw-grid-cols-auto-320.vw-gap-xl` | `vw-utilities.css` |
| Clickable card | `.vw-card--clickable` | `vw-cards.css` |
| Status accent strip (color-code a card without tinting the whole surface) | `.vw-card--accent` on host + `.vw-card-accent` first-child div | `vw-cards.css` |
| Card icon slot | `.vw-card-icon-md` + `.vw-chip--neutral` | `vw-cards.css` |
| Colors | `var(--vw-color-*)` | `colors.css` |
| Spacing / radius | `var(--vw-space-*)`, `var(--vw-radius-*)` | `spacing.css` |
| Theme colors | `var(--grayColor*)`, `var(--primaryColor*)` | `theme-tokens.css` |

**Live specimens:** `preview/vw-cards.html`, `preview/kpi-card.html`

---

## Layer 2 — Atomic / form controls (when building inputs, tables, buttons)

Use only when the task needs atomic controls not covered by vw-cards.

| Need | Use | Reference |
|------|-----|-----------|
| Text input | `.nst-input`, `.nst-input-label` | `components.css`, `preview/inputs-states.html` |
| Input shell (prefix/suffix) | `.nst-input-shell` | `components.css` |
| Textarea | `.nst-textarea`, `.nst-textarea-wrap` | `components.css`, `preview/textarea.html` |
| Table (grid-of-divs — resizable/virtualisable columns) | `.nst-table-card`, `.nst-table-toolbar`, `.nst-table-head`, `.nst-table-th`, `.nst-table-row`, `.nst-table-td` | `components.css`, `preview/table.html` |
| Table (real `<table>` — prefer for plain data grids, keeps screen-reader row/column semantics) | `.nst-table` on the `<table>`; plain `<tr>`, `.is-clickable`, `.is-selected` | `components.css`, `preview/table-semantic.html` |
| Table toolbar search (collapsible) | `.nst-table-search` (+ `.is-open`), `.nst-table-search-icon`, `.nst-table-search-clear` | `components.css`, `preview/table.html` |
| Icon-only button (filter, actions trigger) | `.nst-icon-btn` (+ `.is-active`) | `components.css`, `preview/table.html` |
| Table row actions (kebab) | `.nst-table-kebab`, `.nst-table-menu`, `.nst-table-menu-item` | `components.css`, `preview/table.html` |
| Table status badge | `.vw-chip.vw-chip--success\|warning\|...` (reuse Layer 1 chips) | `vw-chips.css` |
| Tile view for table data | `.vw-grid.vw-grid-cols-2\|3\|4` + `.vw-card-section` tiles | `vw-utilities.css`, `preview/table.html` |
| Action menu (generic dropdown — also used for the table toolbar's Actions trigger) | `.nst-action-menu`, `.nst-action-menu-item`, `.nst-action-menu-divider` | `components.css`, `preview/action-menu.html` |
| Surface | `.nst-surface`, `.nst-surface--raised` | `components.css` |
| Buttons | `.nst-btn` + variant (`--filled\|--gray\|--ghost\|--action\|--danger\|--danger-subtle`, default = outline) + size (`--xs\|--sm\|--md\|--lg`, default = md) | `components.css`, `preview/buttons-styles.html`, `buttons-sizes.html` |
| Buttons (React) | `Button`, `Field`, `Chip` from `components.jsx` | `ui_kits/admin-console/` |
| Checkbox / radio / toggle | preview specimens | `preview/selection-controls.html` |
| Chips (Figma pastel) | preview specimens | `preview/chips-status.html` |
| Tabs | preview specimens | `preview/tabs.html` |
| Tooltip | preview specimens | `preview/tooltip.html` |
| Stepper | preview specimens | `preview/stepper.html` |
| Timeline | `Timeline` in `components.jsx` | `preview/timeline.html` |
| Charts | preview specimens | `preview/bar-chart.html`, `preview/line-chart.html` |
| Filter popover | preview specimens | `preview/filter-popover.html` |
| Colors (Figma semantic) | `colors_and_type.css` tokens | `preview/colors-semantic.html` |

**React prototype:** `ui_kits/admin-console/index.html` (atomic Figma components; Inter font — use only for atomic demos, not dashboard cards)

---

## Decision tree

```
Building UI?
├─ Dashboard / KPI / card grid / enterprise screen
│  └─ Layer 1 ONLY (nst-design-system.css + vw-* classes)
├─ Form + table page inside enterprise app
│  └─ Layer 1 layout + Layer 2 inputs/tables (components.css)
└─ Standalone atomic component demo
   └─ Layer 2 preview/*.html or components.jsx as reference
```

---

## Forbidden (will be rejected)

- Random hex colors not from `colors.css` or `theme-tokens.css`
- Custom card CSS when `.vw-card-*` exists
- Inter or system fonts on legacy/dashboard pages (use Poppins)
- `colors_and_type.css` for dashboard cards (wrong layer)
- Tailwind / Bootstrap / Material UI classes
- Invented class names (`card`, `kpi-box`, `status-badge`, `btn-primary`, etc.) when vw/nst equivalents exist
- Inline `style="color: #..."` except layout constraints (`max-width`, `grid-template-columns`)
