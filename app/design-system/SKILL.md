---
name: nst-design-system
description: Generates Vision Waves / NST enterprise UI using repo components only. Use when building dashboards, KPI cards, admin consoles, forms, tables, HTML mocks, or any UI in this design-system repo. Enforces nst-design-system.css, vw-card/vw-chip classes, and COMPONENTS.md registry — never random designs.
user-invocable: true
---

# NST Design System

## Non-negotiable workflow

Every UI task MUST follow this order:

1. **Read `COMPONENTS.md`** — find the component; if it exists, use it
2. **Read the reference** (CSS + `preview/*.html` listed in registry)
3. **Generate using only those classes and tokens**
4. **Self-check** forbidden patterns in `COMPONENTS.md`

Skipping step 1 produces incorrect output.

Project skill (same rules): `.cursor/skills/nst-design-system/SKILL.md`  
Always-on Cursor rule: `.cursor/rules/nst-design-system.mdc`

App already has UI and needs to be migrated onto this system instead of built from scratch? Use `/nst-redesign` (`.claude/skills/nst-redesign/SKILL.md`) instead of this skill.

## Stylesheet (always)

```html
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="nst-design-system.css">
```

Add `components.css` only for `.nst-input` / `.nst-table-*`.

## Legacy / dashboard (default — matches reference-only guidelines)

- `nst-design-system.css` + vw classes
- Specimens: `preview/vw-cards.html`, `preview/kpi-card.html`
- Cards: `.vw-card-section`, `.vw-card-title`, `.vw-card-metric-lg`
- Chips: `.vw-chip.vw-chip--success`
- Layout: `.vw-flex`, `.vw-page-gap`, `.vw-grid-cols-auto-320`

## Atomic layer (only when task needs buttons/inputs/tables)

- `components.css`, `preview/buttons-*.html`, `preview/table.html`
- React: `ui_kits/admin-console/components.jsx`
- Do **not** use this layer for KPI/dashboard cards

## Hard rules

- **Poppins** on enterprise/dashboard pages (not Inter)
- Use **registry components** — no invented `.card`, `.badge`, random hex
- **Sentence case** copy; pastel chips for status
- **No** Tailwind, Bootstrap, Material, or freestyle layouts

## KPI card pattern

```html
<div class="vw-card-section vw-flex vw-flex-col vw-justify-between" style="max-width: 300px;">
  <div class="vw-card-title">Potential revenue</div>
  <div class="vw-flex vw-justify-between vw-items-baseline vw-gap-sm">
    <div class="vw-card-metric-lg">₹2.5M</div>
    <div class="vw-card-variance is-positive">+12%</div>
  </div>
</div>
```

## File map

| File | Purpose |
|------|---------|
| `COMPONENTS.md` | **Start here** — component registry |
| `nst-design-system.css` | Canonical stylesheet bundle |
| `vw-cards.css` / `vw-chips.css` / `vw-utilities.css` | Legacy component classes |
| `components.css` | Form/table primitives (`.nst-*`) |
| `preview/vw-cards.html` | Card specimens |
| `AGENTS.md` | Short agent instructions |
