# Experience components

Branded, motion-rich UI built on the [cult-ui](https://cult-ui.com) primitives.
These take the product "to the next level" — full-screen focus morphs, a
compose surface that grows out of a pill, a contextual side rail, and a live
status island. This doc is the **source of truth** so we don't regress: what
each one is, where it's used, and the footguns.

## Layers

```
components/ui/*            ← raw cult-ui registry primitives (faithful drops)
components/experience/*    ← OUR branded wrappers (theme-aware, opinionated)
```

**Always import from `@/components/experience`, never the raw primitive**, unless
you're building a new wrapper. The wrappers apply our design tokens (`bg-card`,
`border-border`, ring colors) and collapse fiddly compound APIs into one
component. Raw primitives ship registry defaults (bare colors, hardcoded dark
tones) that will look off in-app.

## The primitives (`components/ui/`)

| File | Source | Notes |
| --- | --- | --- |
| `expandable-screen.tsx` | cult-ui `expandable-screen` | Shared-`layoutId` morph from a trigger to full-screen. |
| `morph-surface.tsx` | cult-ui `morph-surface` | Pill → compose surface. **Local adaptation:** added a `dockLabel` prop (upstream hardcoded "Morph Surface"). |
| `side-panel.tsx` | cult-ui `side-panel` | Left rail that expands sideways; needs `react-use-measure`. |
| `dynamic-island.tsx` | cult-ui `dynamic-island` | Apple-style morphing island; byte-identical to the registry. |

Re-installing a primitive with `pnpm dlx shadcn@latest add <url>` will **clobber
local adaptations** (e.g. `morph-surface`'s `dockLabel`). If you re-pull, re-apply
the adaptation and update this table.

## The wrappers (`components/experience/`)

### `FocusView` — expand anything to full-screen focus
Built on `ExpandableScreen`. A trigger morphs into a centered, themed full-screen
surface and back.

```tsx
<FocusView layoutId="deal-report-42" trigger={<KpiCard … />}>
  <FullReport … />
</FocusView>
```

- **`layoutId` is required and must be page-unique.** Two FocusViews sharing a
  `layoutId` will morph into each other — the #1 footgun. Namespace by entity id.
- Body scroll locks while expanded; Escape and the close button both collapse.
- Avoid wrapping components that own their own click handler as the *trigger* —
  the trigger click is consumed to expand.

### `QuickCaptureDock` — corner dock → compose box
Built on `MorphSurface`. A fixed corner pill that morphs into a one-line compose
box. Presentational + a single `onCapture(text)` callback; persistence is the
caller's job.

```tsx
<QuickCaptureDock onCapture={async (t) => { await save(t); }} dockLabel="Quick note" />
```

- Fixed-position, `z-40` (below command palette / toasts). One per screen.
- `onCapture` throwing signals failure (the surface stays open).
- Live wiring: `ContactsQuickCapture` (People page) posts to `/api/notes`.

### `ContextPanel` — collapsible contextual rail
Built on `SidePanel`. A slim left strip that expands sideways into a wide
contextual surface. Self-manages open state (or drive it with `open`/`onOpenChange`).

```tsx
<ContextPanel><FiltersOrDetail /></ContextPanel>
```

- Theme-aware (`bg-card`), unlike the raw dark primitive.
- Anchored left, expands to ~97% width — it's a takeover rail, not a slim drawer.
  Use where a big contextual reveal beats a modal.

### `LiveProductIsland` — marketing status island
Built on `DynamicIsland`. Display-only; cycles through Chippi's activity beats
(lead read → reply drafted → tour booked → deal advanced), morphing between each.

- No props, no data — safe to drop into any **client** marketing section.
- Respects `prefers-reduced-motion` (renders one static beat, no cycling).
- Intentionally `bg-black` — tuned for the dark cinematic hero. Live on the
  marketing homepage hero (`components/marketing/giga/hero.tsx`, bottom-right,
  desktop-only).

## Where they're used (keep current)

| Component | Location |
| --- | --- |
| `LiveProductIsland` | Marketing hero (`components/marketing/giga/hero.tsx`) |
| `QuickCaptureDock` via `ContactsQuickCapture` | People page (`app/s/[slug]/contacts/page.tsx`) |
| `FocusView` | Available; adopt for KPI/report/property expansions |
| `ContextPanel` | Available; adopt for contextual detail rails |

## Regression guardrails

1. **Import from `@/components/experience`**, not raw `@/components/ui` primitives.
2. **Unique `layoutId`** per `FocusView` on a page.
3. **One `QuickCaptureDock`** per screen (fixed-position).
4. **Reduced motion**: any new looping animation must bail on `useReducedMotion()`
   — `LiveProductIsland` is the reference.
5. **Re-installing a primitive** re-applies local adaptations (see the primitive
   table) — check `git diff` before committing a re-pull.
6. Deps: `motion`, `lucide-react`, `react-use-measure` (all already in
   `package.json`). No new dependency is required by these components.
