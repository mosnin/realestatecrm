# ROADMAP.md

Prioritized work ahead for Chippi. Use this to avoid fixing things about to be replaced, and to prevent conflicting changes.

---

## Current phase: V1 Stabilization + Tour System

The product is past initial build. Focus is on hardening existing systems, completing the tour booking feature, and preparing for billing.

---

## 1. Active work (in progress)

| Item | Status | Key files | Notes |
|------|--------|-----------|-------|
| Tour booking system | Building | `app/api/tours/*`, `app/s/[slug]/tours/*`, `supabase/migrations/` | Multi-property scheduling, waitlist, feedback, Google Calendar sync |
| Broker/brokerage system | Building | `app/broker/*`, `lib/permissions.ts`, `app/api/broker/*` | Self-serve brokerage creation, invite flow, broker dashboard |
| Audit logging | Building | `lib/audit.ts`, `AuditLog` table | SOC 2 prep, append-only event log |
| Deal activity log | Building | `DealActivity` table, `app/api/deals/[id]/activities/*` | Notes, calls, emails, stage changes tracked per deal |

**Rule**: If your fix touches files in active work areas, coordinate — don't assume the current code is final.

---

## 2. Next up (planned, not started)

| Item | Priority | Dependencies | Notes |
|------|----------|--------------|-------|
| Stripe billing integration | High | Billing field exists in SpaceSetting; no Stripe package yet | $97/mo, 7-day trial. Must not gate existing CRM features without product decision |
| Automated test suite | High | None | Currently all manual validation. Need at minimum: contract tests, API route tests |
| Contact import (CSV/bulk) | Medium | Rate limiting exists (5/hr import tier) | Bulk contact creation with dedup |
| Email notifications expansion | Medium | Resend already integrated | Currently only lead notification; expand to tour confirmations, deal updates |
| Google Calendar OAuth flow | Medium | `GoogleCalendarToken` table exists | Token storage ready, need OAuth consent + sync logic |
| Tour feedback collection | Medium | `TourFeedback` table exists | Post-tour survey emails |
| Waitlist notifications | Medium | `TourWaitlist` table exists | Notify waitlisted guests when slots open |

**Rule**: Don't build these prematurely. If a bug fix would be obsoleted by planned work, note it and fix minimally.

---

## 3. Future considerations (not committed)

These are mentioned in product context but have no code or active plan:

- MLS integration
- Transaction management
- Document signing
- Marketing campaign tools
- SMS integration
- Team workspaces (multi-user per space)
- Advanced automation / workflow builder
- Mobile app

**Rule**: Do not build toward these. They are explicitly out of scope per `PRODUCT_SCOPE.md`.

---

## 4. Technical debt to address

| Item | Severity | Location | Notes |
|------|----------|----------|-------|
| Legacy Redis path | Medium | `app/actions.ts`, `lib/slugs.ts`, `lib/redis.ts` | Slug metadata in Redis diverges from Supabase source of truth. Plan: migrate fully to Supabase, deprecate Redis slug path |
| Two space creation paths | Medium | `app/api/onboarding/route.ts` vs `app/actions.ts` | Different default stage names. Consolidate to onboarding API only |
| Build error suppression | Medium | `next.config.ts` | TS and ESLint errors ignored during build. Re-enable after cleanup |
| Onboarding auto-heal duplication | Low | `app/dashboard/page.tsx`, `app/s/[slug]/layout.tsx` | Both contain backfill logic. Consolidate to `lib/onboarding.ts` helpers |
| Prisma remnants | Low | `prisma.config.ts`, postinstall shim | Prisma no longer used (migrated to Supabase). Clean up references |

**Rule**: Tech debt fixes are lower priority than active work. Don't refactor tech debt as a side effect of unrelated fixes.

---

## 5. How to use this file

1. **Before starting work**: Check if your target area is in active work or planned. If so, coordinate.
2. **Before fixing a bug**: Check if the affected code is about to be replaced. If so, apply a minimal fix.
3. **Before adding a feature**: Check that it's not in "future considerations" (out of scope).
4. **After completing work**: Update this file if the roadmap status changed.
5. **AI agents**: Read this file before making changes that touch multiple systems.
