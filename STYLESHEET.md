# STYLESHEET.md

The design system in one place. Read this before adding a UI element.

If you find yourself doing something not described here, the answer is almost
always "no, do the thing on this page instead." The product gets cohesion the
same way a building does — every door, every window, every handle obeys the
same vocabulary.

---

## The one idea

Chippi feels **calm, paper-flat, and quietly confident**.

A realtor opens it and the surface gets out of the way. There are no shadows,
no gradients, no celebrations. The chrome recedes. The work — names, numbers,
drafts — is the only thing that's loud. Brand orange exists, but it's earned;
it does not decorate.

If a screen feels busy, you have too many things competing to be the focal
element. Every page has **one** focal element. Find it. Cut everything else
back a layer.

---

## Principles

1. **Paper-flat.** No drop shadows, no glassmorphism, no inset highlights.
   Hairline borders (`border-border/60` or `/70`) carry the structure.
2. **Neutral-first.** Backgrounds, surfaces, text, and primary buttons are all
   in the neutral scale. Color is reserved for meaning (brand, lead tier,
   destructive).
3. **One focal element per screen.** Title + status sentence is the loud note.
   Section headings recede. Body recedes further. Muted labels recede furthest.
4. **Configuration is failure to decide.** If you're choosing between two
   variants of a thing, pick one and delete the other. Tabs, settings, and
   toggles are confessions that the team couldn't choose.
5. **Quiet authority in copy.** Lowercase verbs, periods at the end of toasts,
   no exclamation marks unless something genuinely warrants celebration.
6. **Sweat the corner radius and the silence.** Spacing, easing, and stop-time
   between micro-interactions are not optional details — they are the design.
7. **The agent has a single voice.** When Chippi appears anywhere — toast,
   draft card, activity row, badge — it carries the same orange + serif
   signature. Nothing else does.

---

## Color

### Tokens (defined in `app/globals.css` — read it; don't invent new ones)

```
--background        white in light, near-black in dark
--foreground        near-black in light, off-white in dark
--surface           one half-step off the background (subtle inset)
--card              elevated content (same as background in light)
--muted             #f4f4f5 / dark equivalent — quiet bg
--muted-foreground  #6b6f76 / #9ca3af — secondary text
--border            #e7e7e9 / #27272a — hairlines
--ring              translucent foreground — focus rings

--primary           = foreground. Black on white, white on black. NOT orange.
--destructive       red

--brand             #ff964f — Chippi orange
--brand-foreground  white
--brand-subtle      #fff4eb / #2a1f17 — washed orange tint

--lead-hot          red    — leadScore ≥ 70
--lead-warm         mustard — leadScore 50–69 (note: NOT amber, NOT brand)
--lead-cold         blue
```

### Where to reach for what

| Need | Token |
|---|---|
| Default button background | `bg-foreground` (black) — **never** brand |
| Page background | `bg-background` |
| Card / row hover | `hover:bg-muted/30` (or `bg-foreground/[0.04]` for ghost buttons — same family) |
| Hairline divider / border | `border-border/60` between sections, `border-border/70` on cards |
| Empty-state container | `bg-muted/20` + `border-dashed border-border/70` + `rounded-xl` |
| Section heading text | `text-muted-foreground` |
| Body text | `text-foreground` (default) or `text-muted-foreground` (subtitle) |

### The brand orange rule

Brand orange (`--brand`, `text-orange-500`, `text-orange-600 dark:text-orange-400`) lives in **only these places**:

1. The logo.
2. The Chippi avatar / chip widget.
3. `AgentGeneratedBadge` and similar "this came from Chippi" cues.
4. Agent-output activity bars and progress fills.
5. The lead-warm tier (mustard, not orange — but conceptually related).

It does **not** appear on default buttons, primary CTAs, links, focus rings,
nav, or "active" indicators. Those are all foreground (black/white). If you
catch yourself reaching for orange on a non-Chippi element, that's the bug.

---

## Type

### Fonts

| Variable | Stack | Use |
|---|---|---|
| `--font-sans` | -apple-system, SF Pro Text/Display, system-ui | Body, default |
| `--font-heading` | SF Pro Display, system-ui | All `<h*>` (auto via base layer) |
| `--font-title` | **Times New Roman**, Times, serif | Page-level h1 only |
| `--font-mono` | SF Mono, ui-monospace | Code, data, numbers in dense tables |

The serif Times is the **brand's quiet flourish**. Use it on page titles and
on focal stat numbers. Never on body, never on UI chrome, never on more than
one element on a page. The whole reason it works is scarcity.

### The hierarchy (from `lib/typography.ts`)

```
H1            text-3xl tracking-tight  + serif Times       — page title
STAT_NUMBER   text-3xl tracking-tight  tabular-nums serif  — focal data
H2            text-xl font-semibold                          — section
H3            text-base font-semibold                        — card head
SECTION_LABEL text-[11px] uppercase tracking-wider muted    — small caps over groups
BODY          text-sm                                        — default
BODY_MUTED    text-sm muted                                  — subtitle / helper
CAPTION       text-xs muted                                  — chrome / metadata
META          text-[11px] tabular-nums muted                 — timestamp / id
```

**Apply via `cn(...)` from `lib/typography.ts`.** Don't hand-roll text classes
on a new page. If a new page needs a size that isn't in the file, that's a
sign the page is wrong, not the file.

### The status-sentence pattern

Every page header looks like this:

```tsx
<header className="space-y-1.5">
  <p className="text-sm text-muted-foreground">Reviews.</p>
  <h1
    className="text-3xl tracking-tight text-foreground"
    style={{ fontFamily: 'var(--font-title)' }}
  >
    Deals flagged for you
  </h1>
  <p className="text-sm text-muted-foreground">{statusSentence}</p>
</header>
```

Three lines: muted greeting line (with period) → serif h1 → one-sentence
status. Same shape on Chippi home, Reviews, agent-activity, broker overview.
**Don't break the pattern.** It's how the surface reads as one product.

---

## Space

```
PAGE_RHYTHM    space-y-12   between major sections
SECTION_RHYTHM space-y-6    within a section
FIELD_RHYTHM   space-y-4    between form fields / list rows
ROW_PAD        py-3         hairline-divided rows (or py-2.5 for tight)
```

### Containers

| Width | When |
|---|---|
| `max-w-5xl mx-auto` | Broker overview, dashboard pages |
| `max-w-4xl mx-auto` | Reviews, focused list views |
| `max-w-3xl mx-auto` | Chat, settings, intake — single-column reading |
| `max-w-[1500px]` | Wide tables, kanban |

Always paired with `pb-12` so the page has bottom breathing room.

---

## Surfaces

### The hairline-divider grid

For stat strips and snapshots, **always** use this trick:

```tsx
<section className="grid grid-cols-3 gap-px rounded-xl overflow-hidden
                    border border-border/60 bg-border/60">
  <div className="bg-background px-4 py-4">…</div>
  <div className="bg-background px-4 py-4">…</div>
  <div className="bg-background px-4 py-4">…</div>
</section>
```

Background color shows through the `gap-px` to make 1px dividers between
cells. It looks like printed paper. It's the snapshot vocabulary; don't
invent a different one.

### Cards

```
bg-card  border border-border/70  rounded-xl  px-4 py-3
```

Hover (when interactive): `hover:bg-muted/30 transition-colors`.

### Rows

`<ul className="divide-y divide-border/60">` with each `<li>` using
`flex items-center gap-3 py-3`. No card chrome on individual rows — the
divider is the structure.

### Empty states

Always:

```tsx
<div className="rounded-xl border border-dashed border-border/70
                bg-muted/20 px-5 py-10 text-center">
  <p className="text-sm text-foreground">{calmHeadline}</p>
  <p className="text-xs text-muted-foreground mt-1">{whatsNext}</p>
</div>
```

The headline is the calm fact ("You're all caught up.", "Nothing flagged.
Quiet day.", "quiet — no activity yet"). The second line says what would
populate it.

---

## Buttons

**One source: `components/ui/button.tsx`.** Use the cva variants. Don't
hand-roll a button.

### Sizes (kept lean)

```
xs       h-6   rare; small inline pills
sm       h-8
default  h-9   matches sidebar nav rows — the canonical size
lg       h-10
icon{,-sm,-lg,-xs}  square equivalents
```

### Variants

| Variant | Background | When |
|---|---|---|
| `default` | foreground (black/white) | Primary action — Save, Send, Add |
| `outline` | transparent + `border-border` | Secondary action |
| `ghost` | transparent, hover `bg-foreground/[0.04]` | Tertiary, in-line |
| `secondary` | `bg-secondary` | Mid-emphasis |
| `link` | text only, underline on hover | Inline link |
| `destructive` | red | Delete, irreversible |

### Press feedback (do not omit)

```
transition-all duration-150
active:scale-[0.98]                  (except on link variant)
focus-visible:ring-2 ring-ring/40 ring-offset-2 ring-offset-background
```

The 0.98 press is tactile and feels like real product. The 2px focus ring
(not the shadcn 3px default) keeps focus visible without screaming.

### Pill primary (when a button has to feel like a CTA)

`PRIMARY_PILL` from `lib/typography.ts` — `rounded-full px-4 h-9
bg-foreground text-background`. Use on inline composer Send buttons, locked
primary actions, anywhere the rectangle button feels too generic.

---

## Motion

**One library: `framer-motion`.** All variants live in `lib/motion.ts`.

### Timing

```
DURATION_FAST  0.15s   hover, color shifts, micro
DURATION_BASE  0.22s   page entrance, list stagger
DURATION_SLOW  0.32s   bar fills, rare emphasis
```

### Easing

```
EASE_OUT     [0.16, 1, 0.3, 1]   premium ease-out cubic — entrances
EASE_IN_OUT  [0.4, 0, 0.2, 1]    symmetric — toggles, returns
```

### The two patterns we use

**Stagger list** — every list of rows on the dashboard.

```tsx
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';

<StaggerList key={listKey} className="space-y-2 (or divide-y…)">
  {rows.map((r) => <StaggerItem key={r.id}>…</StaggerItem>)}
</StaggerList>
```

When the list contents change (filter, tab swap, window change), key the
StaggerList so it remounts and the children re-stagger in. **Don't add
exit animations to list items** — items leaving on filter is jumpy. The
key remount handles the swap.

**Shared layout (`layoutId`)** — segmented controls and sliding tab
indicators.

```tsx
{isActive && (
  <motion.span
    layoutId="reviews-tab-underline"   // pick one id per indicator group
    className="absolute bottom-[-1px] left-2 right-2 h-[2px]
               rounded-full bg-foreground"
    transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
  />
)}
```

The active indicator's underline / pill / chip shares an id across siblings.
Framer Motion animates between positions on swap. This is the iOS
segmented-control trick. **Use it for any tab strip or window selector.**

### What we do NOT do

- No bounce / spring overshoot. Eases land flat.
- No spinning loaders longer than 1s before they get a status line.
- No celebratory motion (confetti, big checkmarks) unless you can defend it
  in a meeting. We have `confetti.tsx` — it's used once.
- No animating numbers up. The number is the substance; flashing it around
  is decoration.

---

## Voice

The product talks like a sharp colleague who already knows your CRM.

- Lowercase verb in toasts: `"Tour booked — Sarah Chen."` Period.
- One-sentence status lines under every page title.
- Active voice; "drafted" not "has been drafted."
- Empty states are calm facts: "You're all caught up.", "Nothing flagged.
  Quiet day.", "quiet — nothing in flight."
- Microcopy on buttons is verb-led: "Open", "Resolve", "Pause", "Run now".
- "Chippi" is the agent's name. Capitalised. Don't say "the agent" or "the
  AI" or "the assistant" anywhere user-facing.
- No emojis in product chrome. Suggestion chips are the one exception.
- No exclamation marks. Confidence doesn't shout.

---

## Iconography

| Library | `lucide-react` |
|---|---|
| Default size | 14–16 in primary actions, 11–13 in chrome / muted UI |
| Pairing | `inline-flex gap-1.5` for icon+text in chips, `gap-2` in buttons |
| Stroke weight | Default lucide |

Common pairings (memorise the verb-icon shape so the agent surface stays
coherent):

```
CalendarCheck   booked / confirmed
ArrowUpRight    advanced / moved forward
ArrowRightLeft  routed
Flag            flagged / review
Paperclip       attached (packet, doc)
MessageSquare   SMS / draft
Mail            email
Bell            follow-up scheduled
Brain           memory / observation
Sparkles        Chippi (the agent itself)
```

---

## File map — where the truth lives

```
app/globals.css                  Theme tokens, CSS variables, Clerk overrides
lib/typography.ts                Type scale, spacing rhythm, primary pill, ghost pill
lib/motion.ts                    Eases, durations, stagger + dialog variants
lib/color.ts                     pickContrastColor() helper
components/ui/button.tsx         The only canonical button
components/ui/empty-state.tsx    Empty-state component (use it)
components/motion/stagger-list.tsx   StaggerList + StaggerItem (use them)
components/agent/agent-generated-badge.tsx   Chippi-stamp on agent-authored content
```

If you find a screen doing something this file doesn't sanction, the screen
is wrong. Fix it back. The system holds because it's enforced.
