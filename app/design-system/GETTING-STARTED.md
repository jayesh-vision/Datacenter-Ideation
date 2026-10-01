# Getting started with NST Design System (Claude Code)

For developers who want to use this design system in a **new or existing project**, via Claude
Code. Two steps: install once, then use everywhere.

## 1. One-time setup (per machine, not per project)

```bash
git clone https://github.com/singularity-eco/nst-design-system.git /tmp/nst-design-system
mkdir -p ~/.claude/skills
cp -r /tmp/nst-design-system/.claude/skills/nst-app-bootstrap ~/.claude/skills/
cp -r /tmp/nst-design-system/.claude/skills/nst-design-system ~/.claude/skills/
cp -r /tmp/nst-design-system/.claude/skills/nst-redesign ~/.claude/skills/
rm -rf /tmp/nst-design-system
```

This installs three Claude Code skills globally, so they're available in every project on this
machine from now on:

| Skill | Does |
|---|---|
| `/nst-app-bootstrap` | One-time setup for a project: adds this design system as a submodule, wires up `CLAUDE.md`, installs the other two skills locally in that project too, scaffolds a starter page |
| `/nst-design-system` | Generates net-new UI (dashboards, cards, tables, forms) using only the components in `COMPONENTS.md` — never invents styles |
| `/nst-redesign` | Migrates an app that **already has UI** (Bootstrap, Tailwind, MUI, custom CSS, etc.) onto this design system, screen by screen, without breaking existing behavior |

## 2. Start any project

In a new (even empty) project directory:

```bash
cd your-new-app
claude
```

Then just ask:

> Bootstrap this project to use the nst-design-system design system.

Claude Code picks up `/nst-app-bootstrap` automatically and handles the rest — no need to
remember flags or file paths. Safe to re-run on a repo that's already partially set up; it
skips or merges instead of overwriting.

**Verify it worked:**
```
/skills
```
You should see both `nst-app-bootstrap` and `nst-design-system` listed.

## 3. Build UI

From here on, just describe what you want:

> Build a dashboard with KPI cards for deployment frequency and lead time.

Claude reads `design-system/COMPONENTS.md` first and builds only with registered `.vw-*`/`.nst-*`
classes and tokens — no random hex colors, no invented card/button/table CSS. If a pattern you
need isn't in the registry yet, Claude should tell you and propose adding it rather than
freelancing a local workaround.

Already have screens built (in Bootstrap, Tailwind, MUI, plain CSS, whatever)? Say instead:

> Redesign this app's UI to match the NST design system.

That triggers `/nst-redesign`, which audits your existing screens, maps old classes/colors onto
the registry, and migrates them one at a time without touching app logic.

## Keeping the design system up to date

Each project gets its own submodule checkout, pinned to a commit. To pull in newer components:

```bash
git submodule update --remote design-system
```

## Other setup paths

The steps above are the fast path for day-to-day project work. If you need something else —
manual submodule setup without the skill, a global-only install without per-project wiring, or
working directly inside this repo — see `docs/claude-code-setup.md` for the full set of options,
including Cursor support.
