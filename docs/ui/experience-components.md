# Experience components

Branded, motion-rich UI built on curated registry primitives — cult-ui,
ncdai (chanhdai.com), componentry, pixel-perfect, react-bits. This doc is the
**source of truth** so we don't regress: what was adopted and why, what was
deliberately skipped and why, where each piece is used, and the footguns.

## Curation principles (read before adding more)

1. **One primitive framework.** The design system is radix-based. The @shark
   suite (ark-ui) was skipped wholesale — parallel primitive frameworks for
   identical controls (checkbox, menu, toast…) fragment styling and a11y
   behavior. If a control is missing, add the standard shadcn/radix version.
2. **No heavy deps for accents.** react-bits Dither / FaultyTerminal
   (three.js/ogl) and fluid-cube-scroll (three) were skipped: WebGL runtimes
   for background flourishes fight the photography-led marketing aesthetic
   and the bundle.
3. **Don't duplicate a working system.** ncdai metrics-01 (new chart lib) was
   skipped — analytics has a deliberate recharts system
   (`components/analytics/chart-primitives`). ncdai theme-switcher was
   skipped — the app has its own ThemeProvider + toggle.
4. **Content is not yours to invent.** ncdai testimonials-02 /
   social-proof-01 need real quotes and logos — flagged to the founder, not
   faked.
5. **Registry drops are starting points.** Several were adapted (see tables);
   re-installing from the registry clobbers those adaptations.

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

## The wider registry set (`components/ui/`)

Adopted in the second wave. Adaptations are load-bearing — re-pulling from the
registry loses them.

| Primitive | Source | Adaptation | Status |
| --- | --- | --- | --- |
| `color-picker.tsx` | cult-ui | **Emits 6-digit hex** (APIs validate `/^#[0-9a-f]{6}$/i`; upstream emitted `hsl()`); removed mount-time `onChange` loop; fixed broken hsl regex; themed input; optional custom `children` trigger | Live — deals add-stage |
| `typewriter.tsx` | cult-ui | none | Available |
| `intro-disclosure.tsx` | cult-ui | **rules-of-hooks fix** (upstream early-returns before its `useSwipe` call — eslint error; return moved below hooks) + escaped entities. Also: its internal visibility force-closes on mount, so **wrappers must own first-visit gating** (see `AutomationsIntro`) | Live — Automations tour |
| `code-block.tsx` | cult-ui | none | Live — webhook test request |
| `gradient-button-group.tsx` | cult-ui | rewired next-themes → app ThemeProvider | Available |
| `cosmic-button.tsx` | cult-ui | none | Available |
| `popover-form.tsx` | cult-ui | none | Available |
| `minimal-card.tsx` | cult-ui | none | Available |
| `onboarding.tsx` | cult-ui | (pre-existing, identical to registry) | Pre-existing |
| `logos-carousel.tsx` | ncdai | none | Live — hero logo wave |
| `shimmering-text.tsx` | ncdai | none | Live — hero eyebrow |
| `scroll-fade-effect.tsx` | ncdai | required `@utility`/`@property` CSS added to `app/globals.css` | Live — gallery thumb rail |
| `text-flip.tsx` | ncdai | none | Live — CTA headline |
| `dot-grid-spotlight.tsx` | ncdai | none | Available |
| `circuit-board.tsx` | componentry | import alias fixed | Live via `ChippiCircuit` |
| `footer-reveal.tsx` | pixel-perfect | **rewritten** from demo scaffold into a generic `{children, footer}` primitive | Live — marketing layout |
| `progressive-blur.tsx` | pixel-perfect | none | Available |
| `gradient-glow-fade.tsx` | pixel-perfect | none | Available |
| `checkbox/progress/aspect-ratio/drawer.tsx` | shadcn standard | built on installed `radix-ui` umbrella + `vaul` | Support files |
| `decrypted-text.tsx` | react-bits (idea) | **lean typed reimplementation** — view-triggered sequential decrypt only; adds reduced-motion, SSR-safe first paint, sr-only real text. The 11KB registry JSX (hover/click modes, five directions) was not ported. | Live — /chippi "Reads" headline |

### react-bits decisions

- **StaggeredMenu / FlowingMenu — skipped.** The marketing header's mobile menu
  already implements staggered item choreography (`staggerChildren`) in the
  established frosted-panel language; swapping in react-bits' own visual
  language (colored layers, numbered items) would be a rebuild, not an
  improvement.
- **CardSwap — available, not placed.** A fixed-size absolutely-positioned
  card stack needs a bespoke hero-side slot; every current showcase already
  has a composed visual. Placing it without a slot would be stuffing. Revisit
  if a new marketing section calls for a stacked-cards motif.
- **cosmic-button — available, not placed.** Marketing CTAs speak a strict
  white-pill language; a rainbow gradient border deviates. Founder taste call.

## Where they're used (keep current)

| Component | Location |
| --- | --- |
| `LiveProductIsland` | Marketing hero (`components/marketing/giga/hero.tsx`) |
| `ShimmeringText` | Hero eyebrow ("Introducing Chippi") |
| `LogosCarousel` | Hero logo cloud (replaced the linear marquee) |
| `TextFlip` | `CtaSection` headline second line |
| `ChippiCircuit` (`components/experience/chippi-circuit.tsx`) | Homepage after AgentCanvas; `/chippi` page after showcases |
| `FooterReveal` | Marketing layout (`app/(marketing)/layout.tsx`) |
| `QuickCaptureDock` via `ContactsQuickCapture` | People page (`app/s/[slug]/contacts/page.tsx`) |
| `FocusView` | Property gallery stage photo (`components/properties/property-gallery.tsx`) |
| `ScrollFadeEffect` | Property gallery thumbnail rail |
| `ColorPicker` | Deals board add-stage (`components/deals/kanban-board.tsx`) |
| `CodeBlock` | Webhook trigger panel (`components/workflows/workflow-builder.tsx`) |
| `AutomationsIntro` (IntroDisclosure) | Workflows page (`app/s/[slug]/automations/workflows/page.tsx`) |
| `ContextPanel` | Available; adopt for contextual detail rails |

## Needs real content before shipping (do NOT fake)

- **Testimonials** (ncdai testimonials-02): real customer quotes + names.
- **Social proof logos** (ncdai social-proof-01): licensed partner marks (the
  hero currently uses styled text wordmarks as documented placeholders).
- **Intro tour media**: `AutomationsIntro` steps are text-only; slot real
  product screenshots into each step's `media` when captured.

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
