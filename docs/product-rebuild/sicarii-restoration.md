# Restore the existing Chippi product and apply Sicarii styling

The previous rebuild replaced too much of the customer interface. This correction restores the pre-rebuild public website and the established Today and brokerage dashboard compositions, then applies the actual Sicarii dashboard shell to the existing application.

## Source and boundaries

- Chippi restoration baseline: `75113c0d` (the last commit before this rebuild).
- UI source: `mosnin/Sicarii`, `main`, `7922be8b22e6f7cd3e6041ddecfeceac8f0a4414`.
- Direct source files: `src/components/dashboard/dashboard-shell.tsx`, `ascii-field.tsx`, `dashboard-overview.tsx`, and `src/app/globals.css`.
- The shell, dock magnification, floating sidebar, mobile navigation, Apps composition, springs, spacing, and palette come from that source. The ASCII component is copied without changes. Chippi's Today hero uses the source dashboard hero composition with real Chippi fields and destinations.
- Intentional adaptations: Chippi branding, its existing feature catalog and role boundaries, workspace/account controls, conversation history, responsive controls, and accessible keyboard focus inside Apps. No Sicarii business entities or authentication replace Chippi's backend.
- Source fonts are locally hosted Inter and Space Grotesk with their OFL licenses. Application styles override serif tokens and italic presentation within authenticated workspaces. Public typography remains at the restoration baseline.

## Existing functionality retained

Personal navigation includes Today, Chippi and its child tools, People and Smart sync, Deals, Calendar, Mailbox, Properties, commissions, CMA, Files, Documents, Profile, Intake and Settings. Billing, support and referrals remain accessible in Apps. Studio retains its existing pre-rebuild feature flag; this correction does not activate an already-paused provider feature.

Broker owners and administrators retain team, lead, transaction, forecasting and administration destinations. Members retain their own navigation. Existing conversation-history components, including the chat History event, remain connected. Workspace switching, notifications, share links, search and account controls remain available.

The rich Today and brokerage screens are restored. Client follow-through remains available on its own authenticated route instead of replacing existing dashboard panels. Automation settings again include connected apps, alongside sending policies. Server authentication and tenant scoping remain in the existing layouts. Prior autonomy, receipts, calendar, idempotency and CRM integration fixes are retained.

## Verification and limitations

Local verification passed: 6,604 tests (7 skipped), typecheck, lint with image warnings, 52 repository contract tests and the tenant-scope audit. The final production build passed using the committed synthetic fixture environment. A retry initially hit disk capacity; removing only this checkout's generated build cache allowed the clean build to finish. No provider was verified by these checks.

The machine-readable companion records the source comparison and retained page inventory. Those checks establish source preservation, not successful execution of every customer workflow.

Local isolated previews render the actual Sicarii shell/dashboard and the adapted Chippi shell/dashboard with synthetic records and mocked account controls. They do not bypass authentication in the application repository. Both preview HTTP requests returned 200.

**Visual acceptance remains pending.** Computer-use access reported that the Mac was locked, including on retry. No screenshots of this correction were inspected, and no exact rendered fidelity, mobile overflow, dark-mode or authenticated-provider acceptance is claimed. Older screenshots in this folder show the superseded UI and are not evidence for this correction.

No production deployment, database migration, customer outreach or merge was performed. The existing PR remains a draft. Production behavior and churn improvement remain unverified.
