# Realtor loop — weekly staging journey

The production wedge is Solo/Pro: lead in → score → draft → send → tour.
Run this on one seeded staging tenant after every release that touches
chat, messaging, intake, or crons.

Needs: Clerk session, a public apply form, Gmail or Telnyx, Calendar.
Authenticated Playwright is not wired yet (`e2e-browser/` is signed-out
only). Until then this is a founder/scripted runbook.

## Journey

1. **Apply** — Submit `/apply/[slug]`. Confirm a Contact row, a
   `MessagingConsent` row, and a score that does not cite a protected class
   (`lib/scoring/fair-housing-guard.ts`).
2. **Today** — `/s/[slug]/chippi/brief` shows the new lead on first paint
   (not a zero that fills in later).
3. **Draft** — Chippi writes a first touch. Edit it. Send. Confirm TCPA
   quiet hours and STOP still block.
4. **Tour** — Book via the public token. Confirm the Worker reminder cron
   actually fires (not just that the route exists).
5. **Control** — Stop cancels the in-flight turn. Steer does not duplicate.
   A failed turn does not hold the composer.
6. **Honest degrade** — Disconnect Gmail, or unset Analyze keys, or stop
   Modal. UI must say degraded — never a fake success.

## Time box

A new realtor (or this script) should finish the happy path in under
20 minutes. If it needs an engineer, the loop is not ready to scale.

## Do not exercise here

Workspace Runs, Research Workspace, voice, Workbench, Chrome extension,
Compass/BoomTown, Team checkout.
