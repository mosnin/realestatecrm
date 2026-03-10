# PRODUCT_SCOPE.md

Current product truth and scope guardrails for Chippi.

This document protects the launch wedge and defines what is in scope now versus later.

---

## 1. Primary user now

New solo realtors in the U.S. who are handling renter and leasing leads.

These users:
- Are early in their career or building a solo practice
- Need a fast, lightweight way to capture and qualify renter leads
- Do not want or need enterprise CRM complexity
- Value speed to first value over breadth of features

---

## 2. Launch wedge

Chippi's launch wedge is **not** generic CRM breadth.

The wedge is:

1. One intake link — shareable anywhere (bio, DMs, ads, email)
2. Structured renter qualification form — name, phone, budget, timeline, areas, notes
3. Explainable AI-assisted lead scoring — practical triage, not black-box magic
4. Lightweight CRM clarity — leads, contacts, deals in a clean interface
5. Faster follow-up — less chaos, more context, professional workflow

Everything in the product should serve this wedge until explicitly expanded.

---

## 3. Core product promise

Help realtors qualify renter and leasing leads faster, with less chaos, more context, and a more professional workflow.

---

## 4. Current v1 scope (repo-confirmed)

| Feature | Status | Key files |
|---|---|---|
| Auth (Clerk sign-up/sign-in) | Implemented | `middleware.ts`, `app/(auth)/*` |
| Onboarding wizard (7 steps to activation) | Implemented | `app/onboarding/*`, `app/api/onboarding/route.ts` |
| Intake link setup and public form | Implemented | `app/apply/[subdomain]/*`, `app/api/public/apply/route.ts` |
| Structured application ingestion into CRM | Implemented | `app/api/public/apply/route.ts` → Contact creation |
| Lead scoring with explainable summary | Implemented | `lib/lead-scoring.ts` (OpenAI gpt-4o-mini) |
| CRM: Leads list (intake-sourced) | Implemented | `app/s/[subdomain]/leads/page.tsx` |
| CRM: Contacts CRUD with lifecycle types | Implemented | `app/s/[subdomain]/contacts/*`, `app/api/contacts/*` |
| CRM: Deals kanban board | Implemented | `app/s/[subdomain]/deals/*`, `app/api/deals/*` |
| AI assistant (chat with RAG context) | Implemented | `app/s/[subdomain]/ai/*`, `lib/ai.ts` |
| Workspace settings | Implemented | `app/s/[subdomain]/settings/*`, `app/api/spaces/route.ts` |
| Landing page | Implemented | `app/page.tsx` |
| Legal pages (terms, privacy, cookies) | Implemented | `app/legal/*` |

---

## 5. Explicit out-of-scope items (unless explicitly instructed)

- Broad "all-in-one CRM" expansion
- Enterprise features (team accounts, roles, permissions)
- Advanced automation systems not already present
- Marketing campaign tools
- Email sending or SMS integration
- Property listing management
- MLS integration
- Transaction management
- Document signing
- Product direction rewrites
- Multi-tenant team workspaces (currently one space per user)

---

## 6. Anti-goals

1. Do not drift toward generic CRM dashboards with low activation value.
2. Do not prioritize feature count over qualification speed and clarity.
3. Do not introduce "AI magic" without explainability — every AI output should be practical and transparent.
4. Do not add complexity that increases setup friction.
5. Do not build for enterprise workflows when the user is a solo realtor.
6. Do not optimize for vanity metrics (page views, sign-ups) over activation metrics (intake link generated, applications received).

---

## 7. What success looks like (this phase)

- **Fast setup**: realtor goes from sign-up to live intake link in under 5 minutes
- **Activation**: intake link generated (the activation event)
- **Usage**: repeated application submissions flowing through the CRM
- **Reliability**: lead context arrives in CRM consistently with scoring
- **Practical AI**: scoring helps follow-up decisions with explainable labels and summaries
- **Retention signal**: repeated workflow use — realtor returns to check and act on leads

---

## 8. Product principles that prevent drift

1. **Protect the wedge**: renter/leasing qualification for new solo realtors.
2. **Activation over vanity**: measure intake link generation and application completions, not page views.
3. **Setup friction must stay low**: onboarding should feel like 3 minutes, not a configuration project.
4. **AI must be practical and explainable**: score + label + summary, not opaque scores or vague recommendations.
5. **Modern, calm, product-first tone**: the UI and copy should feel clean, not cluttered or enterprise-y.
6. **Speed and clarity over breadth**: a smaller set of features that work well beats a larger set that feels busy.
7. **Qualify, don't overwhelm**: the CRM exists to triage and follow up, not to manage entire real estate operations.
