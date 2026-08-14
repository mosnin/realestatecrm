# Chippi Product Design System

The authenticated Chippi product has one visual source of truth: the live
**Today** page at `/s/[slug]/chippi/brief`. Realtor and brokerage surfaces use
the same system. A page may be denser because its job is a calendar, kanban,
editor, table, or chat, but it may not introduce a different brand language.

The system translates the hierarchy and calm openness of Scalar into Chippi's
own identity. It does not copy Scalar's blue palette, typography, navigation
content, or product concepts.

## Product principles

1. **Outcome first.** Lead with the deal, conversation, follow-up, tour, or
   decision the user can move. Do not sell implementation features in the UI.
2. **One calm canvas.** Authenticated dashboard pages use the warm
   `chippi-dashboard-canvas`; working regions use warm paper panels rather than
   stacks of bordered cards.
3. **Text carries hierarchy.** Use a quiet eyebrow, an editorial title, one
   status sentence, and generous space. Decorative icons do not substitute for
   information architecture.
4. **Lists are lists.** CRM records render as hairline-divided rows. Cards are
   reserved for meaningful regions, choices, galleries, and working surfaces.
5. **Truthful state.** Counts, progress, activity, and completion language must
   come from persisted product data. Never decorate an empty state with a fake
   metric or implied work.
6. **Same product, both roles.** Brokerage is not a second theme. It uses the
   same canvas, typography, panels, controls, motion, loading, empty, and error
   states as the realtor dashboard.

## Canonical frame

- Canvas ceiling: `1500px` (`PAGE_MAX`).
- Desktop gutters: `48px`; tablet `40px`; mobile `16px`.
- Section rhythm: `32px` minimum; primary orientation regions may use more.
- Panel radius: `28px` (`rounded-[1.75rem]`).
- Row radius: `12px`; controls remain rounded pills.
- Panels are borderless warm paper with the shared shallow editorial shadow.
- At most one low-opacity shared `AsciiField` atmosphere is allowed on a
  dashboard view, behind its orientation region only.

## Type

- Product chrome and body copy use the existing system/SF stack.
- Editorial page titles, focal values, and section headlines use
  `TITLE_FONT` and the existing Times voice.
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

Desktop navigation is one collapsible surface:

- expanded: a `240px` labeled sidebar;
- collapsed: a true `56px` Scalar-style nav strip;
- the strip shows daily destinations, search, one `More` disclosure, settings,
  account, and the expand affordance;
- secondary routes do not become an endless column of icons;
- every icon has a tooltip and active state; badges remain readable;
- `Cmd/Ctrl+B` toggles the strip and the preference persists;
- mobile continues to use the existing drawer and bottom navigation.

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
- dense grids of bordered cards for record lists;
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
