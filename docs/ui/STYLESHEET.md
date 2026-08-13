# Chippi UI Stylesheet — the Today reference

The live **Today** page (`/s/[slug]/chippi/brief`) is the canonical look. Every
authenticated surface — realtor and brokerage — uses its warm canvas, editorial
hierarchy, open paper regions, generous spacing, quiet hairline rows, and pill
controls. People and Deals remain the record-list and kanban behavior references;
they no longer define a separate visual system. The token scale lives in
`lib/typography.ts`; `DESIGN.md` defines the full product contract.

Goal: a **premium, Apple-calm** surface. Quiet, monochrome, text-first. The eye
lands on content, not chrome.

## The one hard rule: no decorative icons

**No decorative icons on any content surface** (realtor or brokerage dashboard).
The ONLY places a lucide icon is allowed:

1. **Sidebar + top navigation** — the persistent nav rail/header.
2. **Functional controls** — an icon that IS the button's action and would
   otherwise need a text label in a tight control: a close `×`, a search field's
   leading glyph, a kebab/⋯ menu, view-toggle segmented controls, a copy button.
   These live inside `<button>`/toolbar chrome, never floating in content.

**Remove** every icon used as decoration:
- per-row "avatar" icon circles / colored trigger-or-type chips
- section-heading glyphs (a `<Zap>` before "Actions")
- status glyphs (`<AlertTriangle>` before "No steps", a `<CheckCircle>` before
  "Done") — use a text pill instead
- empty-state hero icons — lead the empty state with text
- flow/step chains rendered as colored icon glyphs — render the steps as words

If an icon is conveying a *category/type/status*, replace it with the **word**
(a neutral bordered pill) — that's what People/Deals do.

## No gradients, no color accents

- No `bg-gradient-*`, no `from-*/to-*/via-*` fills.
- No per-category color coding (orange/amber/blue/violet accent bgs or text).
  Surfaces are **monochrome**: `foreground`, `muted-foreground`, `border`,
  `card`, `muted`. Color is reserved for genuine semantics only — a **failed**
  run may use the app's rose error token; "on/off" is a neutral pill, not green.
- The single sanctioned brand-orange use is `CHIPPI_PILL` (buttons that directly
  invoke Chippi). Nothing else.

### Dashboard atmosphere exception

An authenticated dashboard view may carry **exactly one** low-opacity Chippi
atmosphere behind its primary orientation region. The atmosphere must use the
shared, real `AsciiField` canvas source, remain decorative (`aria-hidden`), and
stay quiet enough that every label, value, link, and focus state meets normal
contrast. It is not a second content surface and must never sit behind a list or
table.

- One atmosphere per dashboard view, not one per card or section.
- Chippi orange is allowed only inside that shared atmosphere and on direct
  Chippi actions covered by `CHIPPI_PILL`.
- Do not recreate the field with CSS/div art, a custom SVG, a gradient, a glow,
  or repeated background images.
- Dark mode and `prefers-reduced-motion` must remain first-class; the shared
  field owns its reduced-motion behavior.

## Row lists (the default for any list of records)

Match Today&apos;s ranked-move rhythm and People&apos;s record behavior:

```tsx
<ul className="divide-y divide-border/60">
  {items.map((it) => (
    <li key={it.id} className="group/row flex items-start gap-3 py-3 px-2 -mx-2 rounded-md transition-colors hover:bg-muted/30">
      {/* optional left affordance: checkbox, or a 1.5×1.5 data dot — NOT an icon */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{it.name}</span>
          {/* status → neutral text pill, not a colored dot/icon */}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{secondary}</div>
      </div>
    </li>
  ))}
</ul>
```

- Row rhythm: `py-3`. Loading skeleton mirrors the same `divide-y` rows.
- Never a grid of heavy bordered cards for a records list — People/Deals are rows.
  (Cards are fine only for a genuine *gallery of choices*, e.g. a template
  picker, and even then they are plain bordered `bg-card` with **no** icon header.)

## Page frame (match Today)

```tsx
<div className="chippi-dashboard-canvas space-y-8 pb-12">
  <header className="w-full space-y-1.5">
    <p className={BODY_MUTED}>Section.</p>
    <h1 className={H1} style={TITLE_FONT}>Page title</h1>
    <p className={BODY_MUTED}>One quiet subtitle line.</p>
  </header>
  {/* reading surfaces (header, section labels, lists) sit in the centered
      max-w-5xl column; only wide working surfaces span the full frame */}
</div>
```

- Dashboard regions use `DASHBOARD_SURFACE`, `DASHBOARD_INSET`, and
  `DASHBOARD_ROW`. Compatibility `SurfaceCard` uses the same panel vocabulary.
- Section labels: `SECTION_LABEL` (11px uppercase muted), not an icon + heading.
- Spacing: sections `space-y-8`, within-section `space-y-3`, rows `py-3`. Avoid
  `py-5`/`py-6` "airy" list spacing — that reads as unstructured, not premium.

## Pills / badges

- Status ("On", "Paused", "Popular", a category): neutral
  `rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase
  tracking-wide text-muted-foreground` — or `bg-foreground/[0.06] text-foreground/70`
  for the "active" one. No color, no icon.

## Buttons

Use the pills in `lib/typography.ts`: `PRIMARY_PILL`, `GHOST_PILL`, `QUIET_LINK`,
and `CHIPPI_PILL` only for direct-Chippi actions.

---

Applying this file: sweep every content surface (automations, activity, inbox,
property/deal/contact detail panels, brokerage dashboard) and strip decorative
icons + gradients + category colors, converting them to the Today
panel/row/pill/text vocabulary above. Sidebar and navigation keep their icons;
the desktop sidebar collapses into the shared 56px nav strip defined in
`DESIGN.md`.
