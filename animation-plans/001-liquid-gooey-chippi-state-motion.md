# 001 — Add restrained liquid continuity to Chippi state changes

- **Status**: IMPLEMENTED — local verification complete, not deployed
- **Commit**: c40903ef
- **Severity**: MEDIUM
- **Category**: Missed opportunities, cohesion, and accessibility
- **Implemented scope**: dependency + lock entry, 3 application touchpoints,
  2 generated shadcn primitives, shared reduced-motion CSS, and focused tests

## Problem

Two important but occasional Chippi state changes currently teleport even though
they represent continuity, not navigation.

`components/ui/chippi-prompt-box.tsx:108-159` switches the active conversation
mode by swapping borders and backgrounds independently:

```tsx
<div role="group" aria-label="Conversation mode" className="inline-flex ...">
  {(['chat', 'work'] as const).map((item) => {
    const active = mode === item;
    return (
      <button
        aria-pressed={active}
        className={cn(
          'inline-flex h-7 items-center rounded-full px-3 text-[12px] font-medium transition-all duration-150',
          active
            ? 'border border-border/60 bg-foreground/[0.06] text-foreground ...'
            : 'border border-transparent text-muted-foreground hover:text-foreground',
        )}
      >
        {item === 'chat' ? 'Chat' : 'Work'}
      </button>
    );
  })}
</div>
```

The selector is visible only before the first message, so changing it is a rare,
deliberate choice. A moving liquid indicator would explain that the same
conversation is changing operating mode. The current `transition-all` is also
too broad and can animate properties that were never intended.

`components/chippi/realtime-voice-dialog.tsx:482` replaces the live voice label
as plain text:

```tsx
<p className="mt-4 text-sm font-medium text-foreground">
  {stateLabel(voiceState)}
</p>
```

The state progresses through connecting, listening, thinking, speaking, and
delegating. The existing orb communicates energy, but the changing label has no
material continuity. A calm shape morph around that label would make the state
change legible without adding another overlay, modal, or decorative animation.

## Target

Install `liquid-gooey@0.1.0` and use only its two semantically appropriate
effects:

1. **Move** on a single active Chat/Work pill. The liquid surface moves between
   fixed-width text buttons. Text, focus rings, ARIA, tooltips, and hit targets
   remain crisp real DOM above the silhouette. Use calm values:
   `springiness: 0.82`, `wobble: 0.12`, `stretch: 0.18`, `trail: 0.16`.
   Use a maximum blur of `5`, contrast `20`, and the existing subtle selected
   surface color. The buttons themselves must use only color transitions of
   `150ms ease`, never `transition-all`.

2. **Morph shape** on the voice state label capsule. Keep the same text and
   accessible label. Use `speed: 1.8`, `bounce: 0.08`, and
   `contentBlur: 1.25`. Version 0.1.0 ignores its generic transition prop for
   observed shape morphs, so speed is set explicitly to keep the effective
   corner duration under 300ms. The capsule must remain paper-flat with a
   hairline/shallow shadow and no neon glow.

The package release does not reliably collapse its observed SVG effects under
`prefers-reduced-motion`, so the application must hide those SVG silhouettes
and provide a flat, immediate semantic-token fallback. Custom color feedback
may remain within `200ms ease`.

Do not use gooey effects on dashboard cards, tables, transcript rows, ordinary
buttons, terminal content, or every in-progress status. These are high-frequency
surfaces and would make the premium dashboard feel decorative.

## Repo conventions to follow

- Chippi uses warm paper surfaces, graphite focus, hairline borders, rounded
  controls, and one orange accent. Follow the existing selector classes in
  `components/ui/chippi-prompt-box.tsx`.
- Motion-sensitive Chippi code already calls `useReducedMotion()` in
  `components/chippi/chippi-workspace.tsx` and has reduced-motion CSS in
  `app/globals.css:1427`.
- UI entrances use the strong responsive curve `[0.16, 1, 0.3, 1]` in
  `components/chippi/chippi-workspace.tsx:2231-2238`. Liquid's own spring is
  appropriate only for the continuous active indicator and shape morph.
- The mode selector must keep plain `Chat` and `Work` labels with no icons and
  must still disappear once conversation mode is locked.

## Steps

1. Run `npm install liquid-gooey` from the application root. Because the repo's
   canonical package manager is pnpm, do not retain a new `package-lock.json`;
   reconcile the existing `pnpm-lock.yaml` without reverting its current
   Cloudflare pin. Verify the installed package is exactly `0.1.0`, signed npm
   integrity `sha512-iFG1/RaI9Qntvpv6tzxOQGesTJSmctd3gb1pNYH9Tn8elnolknDI2WeYpr5IenClNe/6hWonS/zPvOCJm+9uaQ==`.
2. In `components/ui/chippi-prompt-box.tsx`, import `Liquid`, make both shadcn
   ToggleGroup items fixed and equal width, add one non-interactive
   `Liquid.Item` beneath them with `effect="move"`, and drive its horizontal
   position from `mode`. Keep only the two mode items interactive.
3. Replace the selector's `transition-all` with explicit color/opacity
   transitions. Preserve disabled behavior, `aria-pressed`, labels, tooltips,
   and keyboard focus.
4. In `components/chippi/realtime-voice-dialog.tsx`, wrap only the state-label
   capsule in a `Liquid` group and one stable `Liquid.Item` using
   `morph={{ shape: true, speed: 1.8, bounce: 0.08, contentBlur: 1.25 }}`.
   Do not key the item by state: it must morph in place rather than remount.
5. Add the smallest CSS variables/classes needed in `app/globals.css`, using
   existing semantic foreground/background/border tokens. Include a reduced
   motion fallback; no new glow, gradient, or permanent animation.
6. Add focused component/source-contract tests proving: plain Chat/Work labels
   and ARIA survive; the liquid indicator is one non-interactive moving surface;
   voice uses one stable morph item; reduced motion is covered; dashboards and
   transcript rows do not import `liquid-gooey`.

## Boundaries

- Do NOT alter conversation-mode persistence, the first-message lock, tool
  authorization, voice WebRTC behavior, or any server route.
- Do NOT add icons to Chat/Work.
- Do NOT apply liquid motion to dashboard cards, navigation, message bubbles,
  tables, terminal/workbench UI, or ordinary buttons.
- Do NOT change copy or information architecture.
- Do NOT touch `pnpm-workspace.yaml`; it contains unrelated concurrent edits.
- Preserve all existing staged and unstaged changes from other agents.
- If `liquid-gooey` cannot compile under React 19/Next 15 or creates hydration,
  focus, or SVG ID instability, remove its usage and report the incompatibility
  instead of replacing it with a hand-built imitation.

## Verification

- **Mechanical**:
  - `./node_modules/.bin/vitest run tests/components/chippi-liquid-motion.test.ts tests/lib/chat-client-state-boundary.test.ts`
  - `./node_modules/.bin/tsc --noEmit --pretty false`
  - targeted ESLint on the two changed TSX files
  - `git diff --check`
- **Feel check**:
  - Start a fresh Chippi conversation and toggle Chat/Work repeatedly. The
    active liquid pill must retarget from its current position without
    restarting, overshooting heavily, blurring the labels, or moving hit
    targets.
  - Send the first message. Confirm the selector disappears and the mode cannot
    change, exactly as before.
  - Open voice mode and observe connecting to listening to thinking to speaking.
    The label capsule should reshape calmly while the text remains readable.
  - Emulate `prefers-reduced-motion: reduce`; mode and voice states must update
    immediately with color/opacity feedback but no travel or jelly motion.
  - Inspect light and dark modes, keyboard focus, and Safari if available.
- **Local outcome**: both state changes are materially continuous, no ordinary
  dashboard surface imports `liquid-gooey`, the selector uses the shadcn Radix
  single-select contract, the voice label uses the existing shadcn Badge, and
  the dashboard's compact disclosure uses the existing shadcn Button. Visual
  QA confirmed identical Chat/Work geometry and an immediate flat reduced-
  motion path. Focused tests, TypeScript, targeted ESLint, and diff checks pass.
- **Done when**: both state changes feel materially continuous, no ordinary
  dashboard surface moves, focused tests/typecheck/lint pass, and a reviewer can
  no longer find `transition-all` in the mode selector.
