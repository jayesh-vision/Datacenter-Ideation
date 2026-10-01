# How to use the `nst-redesign` skill on any existing app

This is a portable checklist for applying the NST / Vision Waves design system to an app that already has UI (any framework — Bootstrap, Tailwind, MUI, Ant Design, custom CSS). It does not generate new UI from scratch; it migrates what already exists, screen by screen, without touching app logic.

## What you need in every session

Two things have to be reachable at the same time:

1. **The target app's codebase** — the app whose UI you're migrating.
2. **The `nst-design-system` folder** — the actual design system source: `COMPONENTS.md`, `nst-design-system.css`, `colors.css`, `theme-tokens.css`, `vw-cards.css`, `vw-chips.css`, `vw-utilities.css`, `preview/*.html` specimens, and `ui_kits/admin-console/` (React reference components).

The skill file (`SKILL.md`) only contains instructions — it does not carry the actual tokens or CSS. If the design system folder isn't connected, the skill has nothing to map onto.

**Two ways to satisfy this:**

- **Quick/one-off:** connect both folders for the session (the app repo, and the `nst-design-system` folder) so Claude can read both.
- **Permanent/recommended:** add `nst-design-system` as a git submodule inside the target app repo (`git submodule add https://github.com/singularity-eco/nst-design-system.git design-system`). This is what the companion `nst-app-bootstrap` skill does automatically when available. Once it's a submodule, `design-system/COMPONENTS.md` is always reachable from inside that repo — no need to connect a second folder every time, and it travels with the repo for anyone else who clones it.

## The redesign workflow (what the skill actually does)

1. **Audit before touching anything.** List every screen/route/component. For each, note the current UI library (Bootstrap/Tailwind/MUI/antd/custom), fonts, hex colors in use, and UI patterns present (cards, tables, forms, buttons, chips, nav, charts, modals). Also note what is *not* presentation — state, event handlers, data fetching, routing, validation. That must not change.

2. **Map old → new**, using `COMPONENTS.md` as the source of truth. Typical mappings:

   | Existing pattern | NST replacement |
   |---|---|
   | Bootstrap `.card` / MUI `<Card>` | `.vw-card-section`, `.vw-card-title`, `.vw-card-description` |
   | Metric tiles built from utility classes | `.vw-card-metric-lg` + `.vw-card-metric-label` |
   | MUI `<Chip>` / Bootstrap `.badge` / antd `<Tag>` | `.vw-chip.vw-chip--success/error/warning/info/neutral` |
   | Custom hex colors | nearest `--vw-color-*` / `--primaryColor*` token |
   | Inter / system-ui / Roboto on dashboard pages | Poppins (link in `COMPONENTS.md`) |
   | Raw `<input>` / `<table>` with custom CSS | `.nst-input`, `.nst-table` / `.nst-table-card` |
   | Framework buttons (Bootstrap/MUI/antd) | `.nst-btn` + variant/size modifiers |
   | Custom flex/grid utilities | `.vw-flex`, `.vw-page-gap`, `.vw-grid.vw-grid-cols-*` |

   If a UI kit (e.g. Ant Design) isn't in this table, don't guess blindly — read `COMPONENTS.md` directly and find the closest registered equivalent. If nothing fits, say so explicitly rather than inventing a one-off style.

3. **Migrate in this order**, one screen at a time (not stylesheet-wide in one pass):
   - Global tokens first: font link + `nst-design-system.css` include.
   - Layout shells (containers, nav, grid) → `.vw-flex` / `.vw-grid` / `.vw-page-*`.
   - Cards and KPIs → `.vw-card-*`.
   - Forms, tables, buttons → `.nst-*`.
   - Status/semantic elements → `.vw-chip--*`.
   - Charts → match `preview/bar-chart.html` / `preview/line-chart.html` structure.
   - For React apps, prefer swapping to the equivalent in `ui_kits/admin-console/components.jsx` where one exists, keeping props/data flow unchanged.

4. **Preserve behavior.** Keep IDs, data attributes, event bindings, and selectors intact. If a rename forces a selector update, fix it in the same pass. Don't mix a behavior fix into a restyle pass.

5. **Self-check** each screen against `COMPONENTS.md`'s Forbidden list before calling it done: no random hex, no leftover Bootstrap/Tailwind/MUI/antd classes, no Inter on dashboard pages, no invented card/badge names. Compare against the matching `preview/*.html` specimen.

6. **Report per screen**: old pattern → new pattern, any registry gaps found, anything intentionally left untouched and why.

## How to trigger it

Once both the app and the design system are reachable, just say:

> Redesign this app's UI to match the NST design system.

or invoke the skill by name (`nst-redesign`). It will start with the audit and won't edit code until that's shared back to you.

## Known gaps to check per environment

- `nst-redesign` assumes the design system is *already* wired into the target repo. If it isn't, someone needs to add it first (submodule, or manual copy of the CSS/registry files) — that setup step is normally handled by a separate `nst-app-bootstrap` skill, which may not be installed in every environment. Check installed skills before assuming it's available; if it isn't, the wiring has to be done manually (copy the files in, add the font link and stylesheet include).
- For component libraries not covered in the mapping table above (Ant Design, Chakra, etc.), expect to spend more time reading `COMPONENTS.md` directly rather than following a pre-written row — the registry is the actual source of truth, this table is just a shortcut for the common cases.
