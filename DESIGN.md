# Chippi Product Design System

The authenticated Chippi product has one visual source of truth: the live
**Today** page at `/s/[slug]/chippi/brief`. Realtor and brokerage surfaces use
the same system. A page may be denser because its job is a calendar, kanban,
editor, table, or chat, but it may not introduce a different brand language.

The authenticated shell uses the actual mosnin/Sicarii dashboard source, adapted
to Chippi routes and an orange palette. See docs/product-rebuild/sicarii-restoration.md.
The current hierarchy specification is docs/product-rebuild/design-os-hierarchy.md.

## Product principles

1. **Outcome first.** Lead with the deal, conversation, follow-up, tour, or
   decision the user can move. Do not sell implementation features in the UI.
2. **One calm canvas.** Authenticated dashboard pages use the neutral
   `chippi-dashboard-canvas`; working regions use white or charcoal panels.
3. **Text carries hierarchy.** Use a quiet eyebrow, an editorial title, one
   status sentence, and generous space. Decorative icons do not substitute for
   information architecture.
4. **Content has boundaries.** Compact CRM indexes render as hairline-divided
   rows. Long-form actionable records such as message drafts may use quiet,
   bounded rows when that prevents overlap and keeps each action with its text.
5. **Truthful state.** Counts, progress, activity, and completion language must
   come from persisted product data. Never decorate an empty state with a fake
   metric or implied work.
6. **Same product, both roles.** Brokerage is not a second theme. It uses the
   same canvas, typography, panels, controls, motion, loading, empty, and error
   states as the realtor dashboard.

## Canonical frame

- Canvas ceiling: `1500px` (`PAGE_MAX`).
- Desktop gutters: `48px`; tablet `40px`; mobile `16px`.
- Section rhythm: `20–32px`; compact orientation regions keep work near the top.
- Panel radius: `28px` (`rounded-[1.75rem]`).
- Row radius: `12px`; controls remain rounded pills.
- Panels are neutral white or charcoal with the shared shallow editorial shadow.
- At most one low-opacity shared `AsciiField` atmosphere is allowed on a
  dashboard view, behind its orientation region only.

## Type

- Product chrome and body copy use Inter.
- Page titles and section headlines use Space Grotesk through `TITLE_FONT`.
- All application text is upright sans-serif; serif and italic styling is prohibited.
- Default page titles are 24–30px. Reserve larger type for exceptional content,
  not greetings or repetitive KPI cards.
- Eyebrows use `SECTION_LABEL`; supporting copy uses `BODY_MUTED`.
- Avoid all-caps body copy, tiny low-contrast metadata, and icon-led headings.

## Components

- `DASHBOARD_SURFACE`: one open paper region.
- `DASHBOARD_INSET`: a quiet nested control/summary region.
- `DASHBOARD_ROW`: the default record/activity/action row.
- `SurfaceCard`: compatibility wrapper that resolves to the same Today panel.
- `PRIMARY_PILL`, `GHOST_PILL`, `QUIET_LINK`: standard controls.
- `CHIPPI_PILL`: reserved for a direct Chippi action.

Working layouts keep their useful structure:

- tables keep sortable columns, bulk selection, and pagination;
- kanban keeps drag and drop;
- calendars keep grid and agenda views;
- editors/builders keep their toolbars and previews;
- property and content galleries keep real imagery;
- chat keeps its transcript and composer rather than being boxed into cards.

Only their frame, typography, spacing, surfaces, controls, states, and visual
noise are normalized.

## Page composition is not a skin

Adding `chippi-dashboard-canvas`, changing a card radius, or wrapping an old
screen in `RealtorPage` / `BROKER_PAGE` does **not** count as redesigning that
page. Every canonical page must express its own job through the Today system:

1. an editorial orientation header that names the outcome, not the feature;
2. a grounded summary or next-best action when the underlying data supports it;
3. one primary working region whose geometry matches the task (row list, board,
   calendar, form, gallery, transcript, or report);
4. secondary controls consolidated into a quiet toolbar or disclosure instead
   of a field of icon buttons;
5. loading, empty, error, and mobile states using the same final geometry.

Page families should remain recognizably different. Pipeline is a board,
Calendar is a schedule, Messages is a conversation list, Analytics is a report,
Settings is a calm form, and Properties is an image-led catalog. They share one
brand system without collapsing into one generic card template.

## Navigation

Desktop navigation uses the Sicarii shell with a 256px grouped sidebar by default.
Daily work comes first, followed by Business and Workspace. Preserve all feature
routes in Apps. Nested tools use disclosures; the current route remains visible.
The optional dock is a saved user preference. Mobile uses labeled bottom
navigation and the full Apps sheet. Account and workspace controls stay in the shell.

Today is the default authenticated landing page for both realtor and brokerage.
Chat remains a named Chippi destination, not the implicit brokerage home.

## Motion

Use motion to preserve orientation: sidebar width, menu/history swaps, row
entry, disclosure, and live agent state. Default transitions are 150-220ms,
transform/opacity only. `prefers-reduced-motion` keeps every function and
removes travel, count-up, shimmer, and stagger.

## Prohibited drift

- decorative icon tiles, icon circles, or icons before headings;
- category-colored cards and arbitrary status colors;
- gradients, glows, or ASCII/CSS art outside the sanctioned shared atmosphere;
- a second sidebar, dock, or navigation hierarchy;
- unbounded record content, overlapping actions, or repeated heavy card grids;
- fake data, vanity metrics, or loading states that change final geometry;
- page-specific radii, shadows, and typography that fork the Today system.

## Acceptance

Every canonical authenticated route must retain its actions, links, filters,
forms, role and tenant boundaries, loading/error/empty states, and responsive
behavior. Before release, compare the implementation and the supplied Scalar
reference at the same viewport, then verify representative realtor and broker
pages in light, dark, desktop, and mobile states. Tests and screenshots are
evidence; production acceptance also requires the deployed routes and core
interactions to work.

A route is not accepted on a wrapper/class marker alone. Release evidence must
show at least one populated representative from every page family and prove
that its orientation header, outcome summary, primary work region, and primary
action are visible and functional.
