# SynapseDC website (website/)

Next.js 16 App Router + TypeScript marketing site for SynapseDC. Structure after the Opstral site (data-driven pages, `buildMetadata`,
JSON-LD, mega-menu nav, scroll reveals, pinned intro, marquee, FAQ, closing CTA) — redesigned 28-Oct-2026 after the user rejected the
first draft (app screenshots, placeholder logo, misaligned grid, hover-vs-click menu).

## Positioning (user, 28-Oct-2026)
SynapseDC is the END-TO-END platform to **plan, build and operate** datacenters, never "an operations platform". Hero, intro, nav order
(Plan & build before Operate), stage grid and the module rows all follow Plan · Build · Operate · Govern. Keep it that way in new copy.

## Rules
- **Brand**: the designed SynapseDC logo in `public/brand/` (`synapsedc-logo.svg` ink, `-white.svg`, marks) — never draw a substitute. Navy canvas
  `#060b16`, brand blue `#1C81EF` as the only accent, Poppins headings, Inter text. Red / amber only for faults. Tokens on `:root` in
  `src/app/globals.css`; no other colour sources.
- **Home page order** (user, 28-Oct-2026): hero → intro → why it exists → seven capability scenes + "See the whole platform" → scenario timeline →
  integrations → FAQ → CTA. Removed on request: the platform map, business-model cards, how-it-works and outcomes (they live on /platform, /solutions, /how-it-works).
- **Solutions page** (`/solutions`, after opstral.ai/use-cases): hero with badge, stats and See · Understand · Act · Plan; a flagship use case; `UseCaseBrowser`
  (sticky domain pills + model segment) over `data/useCases.ts` (20 use cases in 6 domains, each with pain, what it does, modules, demo-estate figures
  labelled "Modelled on the SynapseDC demo estate"); then business models and roles. New use cases go in `USE_CASES`.
- **Hero scene** = `src/components/art/hero.tsx` (client): one isometric hall cycling Plan → Build → Operate, three narrated 1.5 s steps per phase
  (`STORY` lines, svg classes `ph-<phase> st-<step>`, elements gated with `at-1` / `at-2`, counters via `useCount`); reduced motion holds the last Operate step. Home intro = `home/Intro.tsx` in Opstral's "What is Opstral" shape.
- **Platform page** (`/platform`, user 28-Oct-2026: "complete pictorial representation … highlight key modules, not only plan, build and operate"):
  `components/PlatformMap.tsx` + `data/platformMap.ts` = the platform diagram in the shape of opstral.ai/platform/pillars: centred headline,
  then one card = Your datacenter (8 inputs) | SynapseDC platform (Opstral AI bar · Plan & build 8 | core | Operate 8 · Govern row · Governed bar) |
  Outcomes (8), a deploy strip and a caption that shows the clicked block. Keep the two sides and the two inner columns symmetric. Blocks follow docs/dco-platform-menu.html; add a new screen there AND here.
- **Illustrations, not screenshots**: every visual is an abstract SVG concept drawing from `src/components/art/` (`kit.tsx` primitives on one
  640 × 420 canvas; `features.tsx` = the five home scenes (Planner, DCIM, Command Center, 3D datacenter layout, GPU Fleet) with header chip + message line and
  build-up classes `a-in / a-grow / a-draw / a-pop` + `--d` that play when `ArtFrame` adds `is-in`; `index.tsx` the rest, registry `ART`, `<ArtFor id=…/>`). Never put product screenshots on the site.
  `public/brand/aisle.jpg` (from the login theme's `synapse-aisle.svg`) is the only photo-like asset, used dimmed behind the home hero.
- **Grid**: Opstral's content width — `.wrap { width: calc(100% - 112px); max-width: 1296px }` (user, 28-Oct-2026: "too much white space … keep the Opstral margin/padding"), 100 px section rhythm (Opstral's), every block starts on the grid; split layouts are `.split` / `.hero-grid` /
  `.page-hero-grid`. No overlays over illustrations.
- **Scrolling**: smooth scroll only via `data-scroll-behavior="smooth"` on `<html>` (CSS `scroll-behavior` on html made the router land
  past the hero after a dropdown click, 28-Oct-2026). No pinned / sticky-screen sections: they left viewport-sized empty bands.
- **Navigation**: a top-level label is a link to its landing page (`/platform`, `/solutions`, `/resources`); hover (120 ms intent) or focus
  opens the panel, the chevron toggles it; hover never fights the click. Mobile = drawer with accordions.
- Copy lives in `src/data/*` (modules, solutions + roles, site), never inline. Every claim must exist in the product / BRD
  (`../docs/SynapseDC-BRD.md`); demo figures are labelled illustrative. No invented customers, certifications or results.
- Every page exports `buildMetadata()`; a new static route goes into `src/app/sitemap.ts`. Pages without content yet (blog, case studies,
  videos, glossary, about, customers, pricing, privacy, terms) are `placeholders` in `src/data/site.ts`, served by `src/app/[page]`, noindex.
- Contact form is not wired (no backend). Connect before launch. `siteConfig.contact` is empty until confirmed.
- QA: `npm run build` must pass; check `/`, a module page, a solution page and the menu at 1440 / 1280 / 390 (no horizontal overflow,
  no console errors). Scratch scripts used so far: viewport walk, full-page shot, menu click test (Playwright from `../app`).
- No deploy without the user's go-ahead (no Vercel project yet).

## GPU & AI is the flagship use case (28-Oct-2026, user)
GPU Fleet is part of the solution, NOT an add-on (the user reversed an add-on idea the same day): no "add-on", no packaging /
"included vs extra" wording anywhere. `/gpu-ai` (top menu "GPU & AI") presents GPU as the powerful use case: what a GPU depends
on (power path, CDU loops, liquid racks) and what it earns (GPU, job, customer, revenue) on one estate model
(`components/gpu/GpuChain.tsx`), five GPU use cases, AI hall plan & build, coverage, FAQ. The home page has no GPU band (removed 28-Oct-2026, user: did not fit); GPU shows there only as the GPU Fleet scene.

## Company menu (28-Oct-2026, user: "add a Company menu like Opstral")
Top menu **Company** (label → /about): Why Us (`/why-synapsedc`), Why Now (`/why-now`), Our Story (`/our-story`), About SynapseDC (`/about`) +
a "Request a demo" promo card (→ /contact). Content in `data/company.ts` (typed sections: cards · compare · table · timeline · claims ·
faq · next), one renderer `components/company/CompanyPage.tsx` (Opstral company-page shape: hero, four cards, before/after, our position,
"What we are not going to claim", FAQ, where to read next, CTA). No invented team, customers or results; "Built by VisionWaves" uses
only public VisionWaves facts. Resources' old Company column became "Trust". Top-menu labels never wrap (nowrap, tighter below 1380 px).
