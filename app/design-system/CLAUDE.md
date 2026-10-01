# NST Design System — Claude Code

This repo is a **design system**. Do not invent UI styles. Match Vision Waves legacy guidelines.

## Before any UI work

1. Read @COMPONENTS.md — use listed components only
2. Read matching `preview/*.html` specimen — copy structure
3. Invoke `/nst-design-system` for dashboards, cards, KPIs, admin screens
4. Invoke `/nst-redesign` instead if the app already has UI and needs to be migrated onto this system

## Default stack (enterprise / legacy apps)

```html
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="nst-design-system.css">
```

- **Cards/KPIs:** `.vw-card-section`, `.vw-card-title`, `.vw-card-metric-lg`, `.vw-chip--*`
- **Layout:** `.vw-flex`, `.vw-page-gap`, `.vw-grid-cols-auto-320`
- **Specimens:** `preview/vw-cards.html`, `preview/kpi-card.html`

Add `components.css` only for `.nst-input` / `.nst-table-*` forms.

## Do not

- Freestyle cards, chips, or color palettes
- Use Inter on dashboard pages (Poppins only)
- Use `colors_and_type.css` or `ui_kits/admin-console/` for KPI/dashboard cards
- Tailwind, Bootstrap, Material, or invented `.card` / `.badge` classes

## Full rules

@AGENTS.md · @COMPONENTS.md · skill: `/nst-design-system`
