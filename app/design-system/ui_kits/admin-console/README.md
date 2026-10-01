# Admin Console — UI kit

A clickable prototype that demonstrates every Aurora component in context. Because the source Figma contained only atomic components (no screens), this console was assembled from the available primitives to show how they compose — sidebar + topbar + list + detail + modal wizard.

## What's in here

- `index.html` — entrypoint. Load this.
- `components.jsx` — reusable primitives (`Button`, `Field`, `Chip`, `Checkbox`, `Toggle`, `Tooltip`, `Tabs`, `Stepper`, `Card`, `Icon`).
- `app.jsx` — application shell (`Sidebar`, `Topbar`, `DealsView`, `DealDetail`, `NewDealModal`, `Dashboard`).

## Interactions you can try

1. **Navigate** between Dashboard, Deals, Customers, etc. in the sidebar.
2. **Click a row** in the Deals table to open the detail view (with stepper + tabs + tooltip on Edit).
3. **Tick a row** to see the contextual action bar appear.
4. **Filter with tabs** (All / Qualified / Pending / Closed won / Closed lost).
5. **New deal** button opens a 3-step modal wizard — validates email, supports priority radio, agree-to-submit checkbox.
6. **Hover Edit** on the detail view to see a tooltip.

## Deviations from source

- Source has no screens — only atomic components. The screen-level layout here is inferred best-practice (standard SaaS console), not pulled from Figma.
- Sample data (deal rows, activity log) is invented, but uses the status vocabulary that _does_ appear in the source file (*Qualified, Closed won, Pending approval, Closed lost, On hold, Draft*).
- Icons are Phosphor via CDN (see the ICONOGRAPHY note in the root README).
