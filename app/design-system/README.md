# Vision Waves Design System (NST)

Enterprise UI design system aligned with the **Vision Waves guidelines** (`reference-only/` — local reference, not published). Built around brand blue `#1C81EF`, the `--vw-color-*` primitive palette, `.vw-card-*` / `.vw-chip-*` classes, and Poppins typography.

**New here?** → [`GETTING-STARTED.md`](GETTING-STARTED.md) — set up Claude Code once, then use this design system in any new or existing project.

## Quick start

```html
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="nst-design-system.css">
```

Optional form/table primitives:

```html
<link rel="stylesheet" href="components.css">
```

## Index (what's in this folder)

```
README.md                 ← you are here
SKILL.md                  ← Agent-Skill compatible prompt
nst-design-system.css     ← **canonical bundle** (import this)
colors.css                ← --vw-color-* primitive palette
spacing.css               ← --vw-space-*, --vw-radius-*, --vw-page-gap
typography-tokens.css     ← --vw-font-*, --vw-line-*, Poppins
theme-tokens.css          ← --grayColor*, --primaryColor*, --accentColor*
vw-cards.css              ← .vw-card-section, .vw-card-title, metrics, etc.
vw-chips.css              ← .vw-chip--success, .vw-chip--neutral, etc.
vw-utilities.css          ← .vw-flex, .vw-page-gap, grid helpers
components.css            ← .nst-* inputs, tables (optional layer)
theme-blue.css            ← scoped blue theme override [data-theme="blue"]
fonts/                    ← Inter (legacy Figma previews)
assets/                   ← logos / icon guidance (Phosphor via CDN)
preview/                  ← HTML specimens
ui_kits/admin-console/    ← React prototype (atomic Figma components)
reference-only/           ← local Angular guidelines (gitignored)
```

## For Claude Code

| File | Role |
|------|------|
| **`CLAUDE.md`** | Auto-loaded every session — **no manual install needed** |
| **`.claude/skills/nst-design-system/`** | Project skill — run `/nst-design-system` to generate UI |
| **`.claude/skills/nst-app-bootstrap/`** | Project skill — run `/nst-app-bootstrap` to wire this design system into a new or existing app repo (submodule + CLAUDE.md + skill install + starter page) |
| **`COMPONENTS.md`** | Component registry — check before generating UI |
| **`GETTING-STARTED.md`** | Quick start for developers new to this repo — one-time install, then bootstrap any project |
| **`docs/claude-code-setup.md`** | Full setup reference — manual options, Cursor support |

Verify: run `/skills` in Claude Code — `nst-design-system` and `nst-app-bootstrap` should appear.

## For Cursor (optional)

| File | Role |
|------|------|
| `.cursor/rules/nst-design-system.mdc` | Always-on rule |
| `.cursor/skills/nst-design-system/SKILL.md` | Project skill |

## Content fundamentals

The source file has no long-form copy — all text lives inside component samples and status labels. The vocabulary that does exist tells a clear story:

- **Domain:** operations / workflow / sales pipeline. Status labels include *Qualified, Closed won, Pending approval, Provisioning, Rollback skipped, Value proposition, Lead identified, Emergency, Mitigating, Revoked, System reserved, Quote submitted.*
- **Tone:** **terse, literal, state-driven.** Labels are past-tense participles (*Submitted*, *Delivered*, *Parked*) or short noun phrases (*High impact*, *Employee referal*, *On air*). No marketing voice, no exclamations, no emoji.
- **Casing:** **Sentence case** everywhere — `Submitted`, `Pending approval`, `Closed won`. Never Title Case. HTTP verbs (`GET`, `POST`, `PUT`) are the only ALL-CAPS exception.
- **Voice:** product speaks about the object, not to the user (`Assigned`, not "You assigned it"). When addressing the user directly elsewhere (form labels, tooltips) use **you** ("This is a tooltip. Tooltips are used to describe or identify an element.").
- **Length:** chips max ~20 chars; button labels 1–2 words; tooltip body two short sentences.
- **Typos in source:** `Setlled`, `Obsolate`, `Employee referal`, `mantainance` — preserved for parity but **fix in production copy.**
- **No emoji, no decorative unicode.** Icons carry iconographic meaning.

## Visual foundations

### Color
- **Primary brand:** `#1C81EF` (rgb 28, 129, 239) — used for filled buttons, active borders, selected checkboxes/radios, stepper active dot, tab underline.
- **Primary hover:** `#4290ED` — applied to border + fill on hover; no darken-on-press, the hover swatch _lightens_ slightly.
- **Neutrals:** `#252525` headline, `#515151` body, `#A8A8A8` muted, `#E9E9E9` default border, `#E3E3E3` disabled, `#F4F4F4` gray-button / subtle fill, `#FFFFFF` surface.
- **Semantics (pastel bg + darker text):**
  - Success/positive — bg `#D1FAE5`, text `#047857`
  - Danger/error — bg `#FEE2E2`, text `#B91C1C` (or `#B21313` for input borders, `#FF2020` for destructive buttons)
  - Warning/attention — bg `#FFEDD5`, text `#C2410C`
  - Caution — bg `#FEF9C5`, text `#A16207`
  - Info — bg `#DBEAFE`, text `#1D4EB8`
  - Teal — bg `#CFFAFE`, text `#0E7490`
- The palette is **low-chroma, pastel-on-white**. No gradients, no neon, no dark-mode variants found in source.

### Type
- **Family:** Inter only (Regular, Medium, Semibold). Serif and monospace are not present in the source — if needed, the skill suggests Inter as the fallback.
- **Scale (line heights fixed to 18/20/24):**
  - 12 / 18 — chips, step numbers, captions, tooltip body
  - 14 / 20 — small button, dense table row
  - 16 / 24 — default body, field input, medium button, tab label
- Weights: 400 Regular (body), 500 Medium (labels, small emphasis), 600 Semibold (tooltip titles, headings).
- No italic, no letter-spacing overrides, no all-caps treatments.

### Spacing & radius
- **Radius ladder:** 4 → 8 → 12 → 16 → 80(pill). 8 is the workhorse (fields, small buttons); 12 for medium buttons, 16 for large buttons + cards; pill for chips.
- **Padding:** buttons pair h/v (24/16 L, 16/8 M, 8/6 S, 4/4 XS). Fields are 8/6. Chips are 8/2.
- **Gaps:** 4 for icon-adjacent inline, 8 for intra-group, 12 between form rows, 16 as card padding. Multiples of 4 throughout.

### Backgrounds, borders, shadows
- Surfaces are **flat white on a pale gray page** (`#F4F4F4` or `#FFFFFF`). No hand-drawn illustrations, no full-bleed imagery, no textures, no noise, no repeating patterns.
- Borders are **1px hairlines** in `#E9E9E9`. Active state swaps to brand blue. There is no double-border / inset ring treatment.
- One shadow token — `0 2px 2px -1px rgba(10,13,18,.04), 0 4px 6px -2px rgba(10,13,18,.03), 0 12px 16px -4px rgba(10,13,18,.08)` — used on tooltips, popovers, floating cards. Resting surfaces have **no shadow**; elevation is carried by the border.

### Motion
- The source has no declared motion spec. Recommended defaults: **150ms ease-out** for hover transitions (border-color, background-color), **200ms ease-out** for toggle slides. Fades only. No bounces, no spring, no lift.

### States
- **Hover:** border and/or fill shift one step toward the brand blue (default border `#E9E9E9` → `#4290ED`). Buttons lighten, not darken. Gray button goes from `#F4F4F4` → `#E9E9E9`.
- **Active / pressed:** field border goes full primary `#1C81EF`.
- **Disabled:** fill → `#E3E3E3`, text → `#A8A8A8`, no interaction ring.
- **Focus:** source does not specify a ring — use a 2px primary-blue outline with 2px offset as a production default.

### Corners, elevation, cards
- Cards (table container, tooltip content): radius 16, white fill, no border, `padding: 16`, shadow only when elevated.
- Inline chips are always pills (radius 80).

### Layout rules
- Dense, left-aligned, reading-order layout. No carousels, no floating hero content, no diagonal splits. Tables and forms dominate.
- No fixed headers/footers inferred — set according to product need.

## Iconography

The source file references an icon system **by name only** — icons are referenced via symbol paths like `/external-shared/WeightRegularStateNoInteraction…` with weight variants `Regular` (2413 instances), `Duotone` (1271 instances), and size buckets 12/16/20/24. These names map cleanly to **[Phosphor Icons](https://phosphoricons.com/)** (which ships `regular`, `duotone`, `bold`, `thin`, `light`, `fill` weights and 16/20/24 px sprites). The Figma file does not ship a bundled icon font.

- **In this system:** Phosphor is loaded from CDN (`@phosphor-icons/web`) with the `regular` weight as default. Swap to `duotone` for promo/marketing contexts (matches 1271 usages in source). See `assets/icons.md` for usage.
- **Sizes:** 12 / 16 / 20 / 24 — map to button sizes XS / S / M / L respectively.
- **Color:** icons inherit `currentColor`; explicit overrides in source go to `#252525` (text) or `#FFFFFF` (on filled button), and `#EEF1F4` for the subdued trailing-icon slot.
- **No emoji, no unicode decoration, no custom hand-SVG illustrations.** An SVG logo placeholder lives at `assets/logo.svg`.

**Flagged substitution:** the original Figma uses a proprietary Phosphor-style set mapped through Figma variants. Phosphor via CDN is the closest 1:1 public equivalent. If the production app uses a different icon font, replace the Phosphor link in `ui_kits/admin-console/index.html` and `preview/*.html`.

## Font substitution note

**Flagged:** the Figma uses Inter, which is already free on Google Fonts — so no substitution was needed. Inter is loaded from Google Fonts CDN. If your production app self-hosts Inter, copy the `.woff2` files into `fonts/` and update `colors_and_type.css`.

## Caveats

- No brand name, logo, product copy, or marketing imagery exists in source. Names, tone descriptions, and the logo mark are **inferred / placeholder**.
- No dark mode, no motion spec, no focus-ring spec, no density scale — defaults chosen.
- Icon system is inferred to be Phosphor based on component naming; confirm before production.
- UI kit is a single "admin console" mock — the source file contains only atomic components, no screens.
