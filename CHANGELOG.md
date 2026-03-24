# Changelog

Chronological record of features, fixes, and changes in Chippi. Most recent first.

Use this to understand what changed, when, and why — so fixes don't conflict with or revert prior work.

---

## 2026-03-24

### Onboarding & Auth Fixes

- **Fix: Onboarding no longer gets stuck on slug step** — When a slug is taken between the availability check and workspace creation (race condition), users now see a clear "That slug was just taken" message and can pick a different one instead of being stuck with a generic error. Applied to both the inline onboarding flow and the /setup page.
- **Feature: Skip onboarding** — Users can now click "Skip for now" on any onboarding step to bypass setup. They'll be redirected to `/setup` where they can complete workspace creation later at their own pace. New `skip` action added to the onboarding API.
- **Fix: Clerk login page no longer clips on desktop** — Changed `overflow-hidden` to `overflow-y-auto` on the auth page layout container, preventing Clerk UI elements (dropdowns, social buttons, etc.) from being cut off or appearing rounded.
- **Fix: Complete handler updates accountType on re-call** — When a skipped user later completes setup, the `accountType` is now properly saved even if `onboard` was already true.

### Notification System

- **Feature: Resend email notifications for tours** — All tour emails (confirmation, reminder, follow-up, agent notification) migrated from SMTP/Nodemailer to Resend, matching the design language of lead notification emails (dark header, detail boxes, CTA buttons).
- **Feature: Telnyx SMS notifications** — New SMS integration (`lib/sms.ts`) for real-time text notifications:
  - New lead applications → agent SMS with lead name, phone, and score
  - Tour bookings → guest confirmation SMS + agent alert SMS
  - New deals created → agent SMS with deal title and value
  - Follow-up reminders → per-contact agent SMS via cron
- **Feature: Deal email notification** — New `sendNewDealNotification()` email template for deal creation with title, value, address, priority, and linked contacts.
- **Feature: Unified notification dispatcher** (`lib/notify.ts`) — Single entry point for all notifications. Checks both channel preferences (email on/off, SMS on/off) and per-event preferences before dispatching. Functions: `notifyNewLead`, `notifyNewTour`, `notifyNewDeal`, `notifyNewContact`.
- **Feature: Per-event notification toggles** — Users can independently enable/disable notifications for each event type: new leads, tour bookings, new deals, follow-up reminders. These work as a second layer alongside the channel toggles.
- **Feature: Notification settings UI redesign** — Settings page now shows:
  - Delivery channels section displaying the user's actual email address and phone number
  - SMS toggle automatically disabled when no phone number is set
  - Event types section with 4 toggles (only shown when at least one channel is enabled)
- **Fix: Duplicate lead email in /api/public/apply** — Was sending the lead notification email twice (once directly via `sendNewLeadNotification`, once via `notifyNewLead`). Consolidated into a single `notifyNewLead()` call.
- **Fix: SMS template showed agent phone instead of lead phone** — `newLeadSMS` was using the `phone` param (destination) in the message body. Added separate `leadPhone` param so the SMS correctly shows the lead's contact number.

### Broker Dashboard Enhancements

- **Enhancement: Dashboard redesign** — Aligned broker dashboard with realtor dashboard design patterns:
  - Time-aware greeting ("Good morning/afternoon/evening")
  - 6-column stat card grid replacing the old gradient hero card layout
  - Table headers with uppercase tracking-wide pattern
  - Improved empty states with icons, guidance text, and CTAs
  - Max-width 1120px constraint matching realtor dashboard
- **Feature: Broker onboarding checklist** — 4-step guided setup (invite realtors, configure settings, review performance, export report) with progress bar and localStorage-persisted dismissal.
- **Feature: Team activity feed** — New `TeamActivityFeed` component + `/api/broker/activity` API route showing recent leads, deals, and tours across all team members in a colored-dot timeline.
- **Feature: Search on realtors page** — Client-side search input filtering realtors by name or email.
- **Feature: Search on members page** — New `MembersSearch` client component wrapping the server-rendered members list with name/email filtering.
- **Feature: Global search for broker users** — `GlobalSearch` and `NotificationCenter` now visible for all users with a workspace slug, including broker users.

### Schema Changes

New `SpaceSetting` columns (all with ALTER TABLE IF NOT EXISTS migrations):
- `smsNotifications` boolean (default false) — master SMS toggle
- `notifyNewLeads` boolean (default true)
- `notifyTourBookings` boolean (default true)
- `notifyNewDeals` boolean (default true)
- `notifyFollowUps` boolean (default true)

### New Files

- `lib/sms.ts` — Telnyx SMS integration with E.164 formatting and 6 pre-built templates
- `lib/notify.ts` — Unified notification dispatcher
- `components/broker/onboarding-checklist.tsx` — Broker onboarding checklist
- `components/broker/team-activity-feed.tsx` — Team activity timeline
- `components/broker/members-search.tsx` — Members page search wrapper
- `app/api/broker/activity/route.ts` — Broker team activity API

### Dependencies

- Added `telnyx` package for SMS notifications

### Documentation

- Rewrote `README.md` from multi-tenant template to Chippi-specific documentation covering features, tech stack, project structure, and setup
- Updated `ENVIRONMENT.md` with Telnyx and Resend service documentation
- Updated `.env.example` with Resend and Telnyx configuration variables
- Created this `CHANGELOG.md`
