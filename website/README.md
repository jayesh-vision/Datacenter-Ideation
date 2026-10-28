# SynapseDC website

Marketing site for SynapseDC, the datacenter operations product prototyped in `../app`.
Same stack and page patterns as the Opstral site, with SynapseDC's own brand (logo, navy canvas, brand blue) and abstract concept illustrations.

```bash
npm install
npm run dev        # http://localhost:3010
npm run build && npm start
```

| Path | What it is |
| --- | --- |
| `src/app/` | Routes: `/`, `/platform`, `/platform/[slug]` (13 modules), `/solutions`, `/solutions/[slug]` (5 business models), `/roles/[slug]` (7 roles), `/how-it-works`, `/integrations`, `/security`, `/why-synapsedc`, `/faq`, `/resources`, `/contact`, `/[page]` (pages without content yet), `sitemap.xml`, `robots.txt`, `llms.txt` |
| `src/data/` | ALL page copy: `modules.ts`, `solutions.ts` (models + roles), `site.ts` (nav, footer, FAQ, integrations, journey, differentiators, placeholders) |
| `src/components/art/` | The illustration kit (`kit.tsx`) and the concept drawings (`index.tsx`): hero, one per module, colocation, NeoCloud |
| `src/components/` | Header (mega menu), Footer, Logo, Blocks (PageHero, Section, SplitFeature, cards, FAQ, CTA), Reveal, `home/*` (IntroReveal, FlowChain, Architecture, Marquee) |
| `src/seo/` | `site.config.ts` = brand, domain, contact (single source of truth); `buildMetadata()`; JSON-LD helpers |
| `src/app/globals.css` | The whole theme: tokens on `:root`, then sections |
| `public/brand/` | SynapseDC logo (ink / white / marks) and the hero backdrop |

`CLAUDE.md` holds the rules.
