# Agent instructions (Claude Code)

This repository is a **design system**. **Never invent designs.**

Claude Code loads **`CLAUDE.md`** automatically. Skill: **`/nst-design-system`** (`.claude/skills/nst-design-system/`).

Building net-new UI → `/nst-design-system`. Retrofitting an app that already has UI → **`/nst-redesign`** (`.claude/skills/nst-redesign/`). Neither wired into the app yet → `/nst-app-bootstrap` first.

## Required reading order

1. `COMPONENTS.md` — component registry (what exists, what file to use)
2. `CLAUDE.md` or `/nst-design-system` skill — full rules
3. Matching `preview/*.html` specimen — copy structure before adapting

Setup in other projects: `docs/claude-code-setup.md`

## Canonical output (legacy enterprise apps)

- Stylesheet: `nst-design-system.css`
- Font: Poppins (Google Fonts)
- Classes: `.vw-card-*`, `.vw-chip-*`, `.vw-flex`, `.vw-page-gap`
- Tokens: `--vw-color-*`, `--vw-space-*`, `--grayColor*`, `--primaryColor*`

## Two layers (do not mix)

| Layer | When | Files |
|-------|------|-------|
| **1 — Legacy / dashboard** | Default for enterprise apps | `nst-design-system.css`, `vw-*.css`, `preview/vw-cards.html` |
| **2 — Atomic / Figma** | Buttons, inputs, tables only | `components.css`, `preview/buttons-*.html`, `ui_kits/admin-console/` |

Dashboard and KPI screens → **Layer 1 only**.

## If a component exists in the repo

You **must** use it. Check `COMPONENTS.md` first. Freestyling is a failure mode.
