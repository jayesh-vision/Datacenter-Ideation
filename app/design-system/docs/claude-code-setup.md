# Using this design system in another project (Claude Code)

Clone or submodule this repo into your app, then choose one setup:

## Option A (automated) — `/nst-app-bootstrap` skill

Everything in Option A below, done for you: submodule add, `CLAUDE.md` wiring, local skill install, and a minimal starter page.

```bash
# once per machine, so the skill exists before any app does:
git clone https://github.com/singularity-eco/nst-design-system.git
cp -r nst-design-system/.claude/skills/nst-app-bootstrap ~/.claude/skills/

# then, per app:
cd your-app
claude
# run: /nst-app-bootstrap
```

Safe to re-run on a repo that's already partially set up — it skips or merges instead of overwriting.

## Option A — Submodule (manual)

```bash
git submodule add https://github.com/singularity-eco/nst-design-system.git design-system
```

Add to your app’s `CLAUDE.md`:

```markdown
## Design system
- Path: `design-system/`
- Before UI work: read `design-system/COMPONENTS.md`
- Stylesheet: `design-system/nst-design-system.css` + Poppins font
- Skill: copy `design-system/.claude/skills/nst-design-system/` to `.claude/skills/`
```

## Option B — Copy skill globally (all projects)

```bash
git clone https://github.com/singularity-eco/nst-design-system.git
cp -r nst-design-system/.claude/skills/nst-design-system ~/.claude/skills/
```

Point Claude at the cloned `COMPONENTS.md` path in your prompts.

## Option C — Work inside this repo

```bash
git clone https://github.com/singularity-eco/nst-design-system.git
cd nst-design-system
claude
```

`CLAUDE.md` and `/nst-design-system` load automatically. No manual skill install.

## Verify in Claude Code

```
/skills
```

You should see `nst-design-system`. Run `/nst-design-system` when generating UI.
