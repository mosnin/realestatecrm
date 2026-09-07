# Restore the existing Chippi product and apply Sicarii styling

The previous rebuild replaced too much of the customer interface. This correction restores the pre-rebuild public website and the established Today and brokerage dashboard compositions, then applies the actual Sicarii dashboard shell to the existing application.

## Source and boundaries

- Chippi restoration baseline: `75113c0d` (the last commit before this rebuild).
- UI source: `mosnin/Sicarii`, `main`, `7922be8b22e6f7cd3e6041ddecfeceac8f0a4414`.
- Direct source files: `src/components/dashboard/dashboard-shell.tsx`, `ascii-field.tsx`, `dashboard-overview.tsx`, and `src/app/globals.css`.
- The shell, dock magnification, floating sidebar, mobile navigation, Apps composition and springs come from that source. Subsequent user requests change its palette to orange and improve the sidebar hierarchy. The ASCII animation comes from the source; its palette is now Chippi orange at the user's request. Chippi's Today hero uses the source dashboard hero composition with real Chippi fields and destinations.
- Intentional adaptations: Chippi branding, its existing feature catalog and role boundaries, workspace/account controls, conversation history, responsive controls, and accessible keyboard focus inside Apps. No Sicarii business entities or authentication replace Chippi's backend.
- Source fonts are locally hosted Inter and Space Grotesk with their OFL licenses. Application styles override serif tokens and italic presentation within authenticated workspaces. Public typography remains at the restoration baseline.

## Existing functionality retained

Personal navigation includes Today, Chippi and its child tools, People and Smart sync, Deals, Calendar, Mailbox, Properties, commissions, CMA, Files, Documents, Profile, Intake and Settings. Billing, support and referrals remain accessible in Apps. Studio retains its existing pre-rebuild feature flag; this correction does not activate an already-paused provider feature.

Broker owners and administrators retain team, lead, transaction, forecasting and administration destinations. Members retain their own navigation. Existing conversation-history components, including the chat History event, remain connected. Workspace switching, notifications, share links, search and account controls remain available.

The rich Today and brokerage screens are restored. Client follow-through remains available on its own authenticated route instead of replacing existing dashboard panels. Automation settings again include connected apps, alongside sending policies. Server authentication and tenant scoping remain in the existing layouts. Prior autonomy, receipts, calendar, idempotency and CRM integration fixes are retained.

## Verification and limitations

Local verification passed: 6,606 tests (7 skipped), typecheck, lint with image warnings, 52 repository contract tests and the tenant-scope audit. The preceding restoration build at `fed234f9` passed using the committed synthetic fixture environment. The orange/sidebar follow-up has passed typecheck and runtime browser compilation; its remote production build is not yet verified. A retry initially hit disk capacity; removing only this checkout's generated build cache allowed the clean build to finish. No provider was verified by these checks.

The machine-readable companion records the source comparison and retained page inventory. Those checks establish source preservation, not successful execution of every customer workflow.

Local isolated previews render the actual Sicarii shell/dashboard and the adapted Chippi shell/dashboard with synthetic records and mocked account controls. They do not bypass authentication in the application repository. Both preview HTTP requests returned 200.

Browser verification used headless Chromium because the in-app browser returned `Browser is not available: iab` and desktop access was locked. The actual source reference and the adapted UI were rendered and inspected. The OpenUI development-only debug widget was suppressed in the harness after it covered the mobile Apps control; library source confirms it is excluded from production builds.

Eight actual screen components were rendered with synthetic data: Today, People, Deals, Calendar, Chippi, sending policies, brokerage Today and member Today. Browser interactions covered sidebar/dock switching, nested navigation, single active-page indicators, mobile Apps and Escape dismissal, conversation history, manual contact creation, calendar view switching and event creation, failed deal-board creation followed by successful retry, and failed brokerage-summary loading followed by successful retry. These are browser/component checks against mocked APIs, not authenticated backend or provider acceptance. Desktop and mobile screenshots were inspected; the tested 390px Today view had no horizontal overflow. Dark mode and upright application typography were also checked.

Findings fixed during the audit: static heavy font files incorrectly declared variable, duplicate parent/child active indicators, the brokerage summary claiming a healthy team after failed loading, and first-board creation silently swallowing failure. The proper variable fonts now preserve the intended weight hierarchy. Screenshots and temporary browser scripts remain outside the repository under `/tmp`.

The rich product remains broader than this bounded audit: existing customer authentication, live agent runs, message delivery, calendar sync, billing and all other customer workflows still require staging/provider verification.

No production deployment, database migration, customer outreach or merge was performed. The existing PR remains a draft. Production behavior and churn improvement remain unverified.

## Orange accent correction

Application accents now use Chippi orange (`#ff964f`), including navigation, buttons, focus rings, chart accents, the ASCII field and decorative glows. Dark text on filled orange buttons preserves legibility. Marketing files remain unchanged.

## Sidebar correction

The sidebar is now the desktop default (saved dock choices remain respected), with a 256px panel, daily work first, role-specific groups, collapsible subpages and one active destination. Settings contains billing, support and referrals. Account controls occupy a compact footer, the collapse control sits beside the logo, and the navigation background is neutral. Mobile navigation now includes visible labels. The complete feature catalog remains in Apps.
