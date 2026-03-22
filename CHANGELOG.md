# CHANGELOG.md

Chronological record of features, fixes, and changes in Chippi. Most recent first.

Use this to understand what changed, when, and why — so fixes don't conflict with or revert prior work.

---

## How to use this file

1. **Before fixing a bug**: Check if a recent change already addressed it or introduced it.
2. **Before reverting**: Understand why the original change was made.
3. **After completing work**: Add an entry here with the change category, description, and affected files.
4. **AI agents**: Log all changes here after completing a task.

---

## Categories

- **Feature** — New functionality
- **Fix** — Bug fix
- **Security** — Security hardening
- **UI** — Visual/UX changes
- **Refactor** — Code restructuring without behavior change
- **Docs** — Documentation only
- **Infra** — Build, deployment, config changes

---

## Log

### 2026-03-22

- **Security**: Fix cross-space data leakage and cross-tenant resource linking (`998c6fb`)
- **Security**: Fix critical security and data integrity issues — batch #1-6 (`557be8a`)
- **Security**: Fix security and hardening issues — batch #7-17 (`96e8d5d`)

### 2026-03-21

- **Fix**: Application compare page — was using `useState` instead of `useEffect` (`65de22c`)
- **Fix**: Error handling in lead conversion and bulk delete (`4982ca1`)
- **Fix**: Settings save/delete error handling, profile init, nav items (`07bd260`)
- **Fix**: Missing auth checks and uncaught throws across dashboard pages (`34125c1`)
- **UI**: Add error feedback to deal panel and kanban board operations (`9cd9e4d`)
- **UI**: Polish dashboard overview with better visual hierarchy (`6e25073`)

### 2026-03-20

- **UI**: Add motion animations to intake and touring forms (`25a112b`)
- **UI**: Redesign public pages with professional header bar layout (`985ae46`, `f99a91b`)
- **UI**: Remove emoji from all UI — replace with Building2 icon (`985ae46`)
- **UI**: Polish public-facing pages with consistent branding (`270f712`)
- **Fix**: Error handling, CRON_SECRET validation, input validation, add .env.example (`d1d0ee6`)
- **UI**: Add toast feedback to contact form, rescore button, leads view (`321fd2d`, `e9cf484`)
- **UI**: Add onboarding checklist and toast notifications (`01bb6d9`)
- **UI**: Add mobile nav items, loading skeletons, toast notifications (`0d65648`)

### 2026-03-19

- **UI**: Redesign auth pages — role switcher, mobile layout, dark mode (`57cfd0c`)
- **Fix**: Configure page consistent card radius (`a1ea3b3`)
- **Fix**: High-priority pages — contact detail, deal detail, leads, profile, settings, billing (`9ce174c`)
- **UI**: Redesign sidebar and overview dashboard (`e937e44`)
- **UI**: Apply consistent border radius across all components (`1b6c258`, `8417296`, `82f9146`)
- **UI**: Tighter design tokens, professional component styling (`5b81231`)

### 2026-03-18

- **Feature**: Replace LLM-only lead scoring with proprietary deterministic engine + AI enhancement (`2696055`)
- **Docs**: Generate project docs from framework templates (`b6f7b27`)
- **Docs**: Add LoxSammy SaaS framework docs (`ab81d53`)
- **UI**: Redesign sidebar — clean, minimal, no emojis (`ede9222`)
- **Fix**: Duplicate notification icon, settings/configure full width (`56106e4`)

### 2026-03-17

- **Fix**: AI action approval — partial updates for contacts + error feedback (`95410d4`)
- **Fix**: Blank/double messages, typing dots, action approval saving (`c10ab3a`)
- **Fix**: Hide referencing prefix from chat UI (`910ca52`)
- **Infra**: Fix migration ordering so columns exist when indexes run (`a4914e1`, `3193e92`)
- **Fix**: Schema ordering errors that broke fresh database setup (`ca72c9b`)

### 2026-03-16

- **UI**: White background for realtor and broker dashboards (`4020038`, `3857a22`)
- **Fix**: Schema drift and cron endpoint security bypass (`592f7d4`)
- **Fix**: 9 bugs found during codebase audit (`61bf3f9`)
- **Feature**: Broker-only account type — skip personal workspace for pure brokers (`b4dbaf8`)
- **Feature**: Separate broker dashboard into its own sidebar context (`bf4d541`)

### 2026-03-15

- **Fix**: Intake page performance, global search 500 error, broker overview UI (`758cea5`)
- **Feature**: 9 brokerage features — settings, drill-down, analytics, notifications, bulk invite, export, branding, role editing (`f489743`)
- **Refactor**: Broker/realtor dashboard unification and follow-ups (`1eeff9b`, `d20f1db`)

### 2026-03-14

- **Feature**: 10 professional features for tours and applications (`ec91606`)
- **Feature**: Stage progression, AI tour prep notes, notification center (`338bcc2`)
- **Feature**: Auto-contact creation, unified timeline, smart follow-up suggestions (`8ca6371`)
- **Feature**: Branded pages, unified pipeline flow, dashboard tours, source attribution (`0a15e4e`)

### 2026-03-13

- **Feature**: Property profile management, waitlist, embeddable booking widget (`0128f55`)
- **Feature**: Recurring overrides, timezone-aware booking, multi-property scheduling (`41c1cf7`, `d5ea7ce`)
- **Feature**: Email notifications, buffer time, GCal busy sync, tour-to-deal conversion (`6b80837`)
- **Feature**: Calendly-style tour booking with Google Calendar sync (`58ea360`)

### 2026-03-12

- **Feature**: AI-powered CRM data editing with user approval flow (`fd7fca5`)
- **Feature**: Conversation table and Message.conversationId column (`3cb81d5`)
- **Fix**: Error handling, validation, null safety review (`066c098`)
- **Fix**: ILIKE escaping in global search (`6610ffe`)

### 2026-03-11

- **Fix**: Global search portal rendering and DealStage array handling (`c5ab882`)
- **UI**: Redesign Chip chat layout for more open space (`ef34059`)
- **Fix**: Gradient input pointer events blocking textarea and buttons (`759c9fc`)
- **Feature**: Rebrand AI assistant as Chip with gradient chat input and @ mentions (`b61b063`)

### 2026-03-10

- **Fix**: Application form page not loading after DateWheelPicker addition (`2ddaf0d`)
- **Feature**: DateWheelPicker for move-in date on application form (`4c972da`)
- **UI**: Light mode support for LiquidMetalButton (`ddf1757`)
- **Fix**: Contacts page showing empty by removing application-link tag filter (`98e89e4`)
- **Feature**: LiquidMetalButton component for primary dashboard CTAs (`0adb5f4`)
- **Docs**: Create documentation stack — AGENTS, ARCHITECTURE, PRODUCT_SCOPE, CHANGELOG_AI, DECISIONS, TESTING, ENVIRONMENT, PROMPTS_AND_SCORING, WORKFLOW_BOUNDARIES

### 2026-03-09

- **UI**: Remove AI configuration section from settings page (`f186405`)
- **UI**: Unify dark mode to pastel orange (#ff964f) accent (`a4f5936`)
- **Fix**: Double onboarding, color scheme updates, auth right panel cleanup (`bf6ec93`)
- **UI**: Auth page background — Pexels image, animated grid iterations (`fb7f616`, `9a49162`)
- **UI**: Font swap — headings use Open Sans, titles use Times New Roman (`7d7bd97`)
- **UI**: Dashboard white & charcoal grey color scheme (`e411596`)
- **Refactor**: Auth page rework — CSS Clerk overrides, inline multi-step onboarding (`a2aa7c0`)
