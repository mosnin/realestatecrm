# Chippi hierarchy and Mac application

## Design OS source and application

Official source: https://github.com/buildermethods/design-os at
529dedb43bfec24b2cbb128f26dd8cbc6143f754, inspected locally outside this CRM.
Read design-shell and design-screen command guidance. No named Design OS plugin
was installed or callable in this Codex session. Its specification, shared-token,
responsive-shell and props-driven-screen approach is applied to the existing
product; the separate Design OS prototype app is not copied over the CRM.
Existing user decisions supply the shell and visual direction: actual Sicarii
source, orange accents, Inter/Space Grotesk, upright text, retained features.

## Product and sections

Chippi serves individual real estate agents, brokerage owners and team members.
Daily work is Today, Chippi, People, Deals, Calendar and Mailbox. Business tools
include Properties, Follow-through, Automations and Files. Brokerage navigation
also exposes team management and performance. All current role-scoped routes
remain available. This pass changes presentation, not data or execution policies.

## Screen specification

Today must answer: what needs my attention, what has Chippi done, and what can I
ask it to do next? Order: compact status header; compact linked counters; next
moves and verified activity; goal entry; supporting relationship/calendar panels.
Pipeline value is context, not the dominant visual. Additional status sentences
live in an accessible native disclosure. No extra positive agent-health claims.
Empty and unavailable states retain the existing real-data view model.

Desktop retains the 256px grouped sidebar and two-column work/activity region.
Mobile uses two columns for counters and a single-column work queue, followed by
activity and goal entry. Primary page headings use 24–30px type. The brokerage
header and Deals header use the same scale; working tables/boards retain their
features. All data and callbacks remain connected to the existing components.

## Mac application

SwiftUI window with WKWebView using persistent website data, loading progress,
connection recovery, native navigation, keyboard shortcuts, upload/download
panels and popup support. It opens the production sign-in route; the web server
continues to enforce Clerk authentication, workspace access and agent policies.
No auth bypass, duplicated local CRM database, or invented offline mode.

Local developers may set CHIPPI_APP_URL to HTTPS previews or localhost HTTP.
Production distribution needs a Developer ID signature and notarization. Embedded
provider login policies, voice permissions and live customer sessions require
provider QA; a successful native build does not establish those outcomes.

## Verification for this change

- TypeScript check and targeted ESLint passed; eight dashboard view-model tests passed.
- Three Swift navigation-policy tests passed; debug app built, bundled, ad-hoc signed
  and signature-verified on Apple Silicon. Info.plist validated.
- Chromium rendered Today in light/dark desktop and 390px mobile with no console
  or page errors. No horizontal overflow or italic text. Next-work panel begins
  at y=381 desktop / y=575 mobile in the synthetic fixture.
- Exercised the day-details disclosure and mobile Apps open/Escape; rendered Deals
  and brokerage unavailable state. Removed duplicate currency symbols observed
  in brokerage totals. These previews use isolated synthetic APIs, not customer data.
- Public marketing/layout/global CSS still match baseline 75113c0d.
- Native UI interaction is blocked by the host Mac lock. Live authentication,
  provider connections and distribution signing/notarization remain unverified.
- No production deployment or backend changes in this pass. The Mac app uses the
  deployed website; this branch's UI appears there only after web deployment.

## Brand asset follow-up

At the user's request, brand placement now uses a text-only Chippi wordmark.
Image edits derived a standalone wordmark and cookie from the original logo;
`public/brand` holds those assets and a 1200×630 text-only social card. The cookie
replaces the orange-bordered favicon, legacy avatar image and Mac bundle icon.
Chippi chat rows and agent branding use text instead of the orb/avatar icon.

This intentionally supersedes the earlier byte-for-byte marketing preservation
receipt only for the requested logo images and social metadata. Marketing page
composition, copy and styling remain otherwise unchanged. Open Graph and Twitter
serve the same local PNG without remote font dependencies. The social route test,
typecheck and targeted lint passed (existing image/ignored-file warnings remain).
The Mac bundle was rebuilt and signature-verified with the updated icon.
