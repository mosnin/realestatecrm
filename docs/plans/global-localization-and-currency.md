# Plan — Global IP-based localization and local-currency payments

Linear: *"The entire experience should adapt automatically to the visitor's
country based on their IP address, including displaying prices and processing
checkout in the appropriate local currency."*

Half of this is already shipped: the site resolves a visitor's country to a
language and a display currency and renders converted prices. What is missing
is everything downstream of *display* — the currency is never carried into
Stripe, a manual choice cannot be made or remembered, and two of the three
named acceptance markets are not in the registry at all.

---

## 1. What already exists

| Piece | Where | State |
| --- | --- | --- |
| Country → `{ lang, currency }` registry | `lib/i18n/markets.ts` (`resolveMarket`) | Ships, partial coverage |
| Pinned USD→currency rates, clean rounding, `Intl` formatting | `lib/i18n/currency.ts` | Ships |
| IP country read at the edge | `middleware.ts` via `x-vercel-ip-country` | Ships |
| Language routing (`/es/...`, `/ru/...`, `?hl=`, explicit-beats-geo) | `decideLangRouting` | Ships |
| Request language available to RSC | `lib/i18n/request.ts` (`x-language` header) | Ships |
| Localized price rendering + "billed in USD" disclosure | `components/marketing/local-price.tsx` | Ships |
| Checkout | `app/api/billing/checkout/route.ts` | **USD only** — fixed Stripe price ids, no `currency`, no `automatic_tax` |

## 2. Gaps against the acceptance criteria

1. **GBP does not exist.** `Currency` is `USD · EUR · AED · ARS · BOB · CLP ·
   COP · MXN · PEN · PYG · UYU`. `GB` is in neither `EUR_COUNTRIES` nor
   `COUNTRY_CURRENCY`, so a UK visitor sees USD. The criteria name GBP
   explicitly. AED and USD are correct today.
2. **A manual choice is impossible, and would not survive if it were.**
   `middleware.ts` writes `CURRENCY_COOKIE` from geo on *every* public GET
   (`res.cookies.set(CURRENCY_COOKIE, resolveMarket(country).currency, …)`),
   deliberately — it is documented as display state, not a preference. The
   issue requires the opposite: manual selection, remembered, never overwritten
   by later IP detection. There is also no currency switcher UI (only
   `LangSwitcher`).
3. **Checkout charges USD.** `lib/i18n/currency.ts` says so in its header
   comment, and `CurrencyNote` discloses it honestly. Local-currency processing
   is simply not built.
4. **Price shown ≠ price charged has no guard.** Display prices are derived
   client-side from pinned rates; checkout resolves a Stripe price id from
   `lib/plans.ts`. Nothing ties the two together, so a rate re-pin between page
   render and checkout silently changes the charge.
5. **No tax, no local payment methods.** No `automatic_tax`, no tax-ID
   collection, no per-country method configuration.
6. **Server render is always USD** and swaps after hydration — a visible flash,
   and the first paint is wrong for every non-US visitor even though middleware
   already knows the country.
7. **No country override**, so nothing can be tested without a foreign IP —
   an explicit acceptance criterion.
8. **Rate governance is a TODO.** `PINNED_USD_RATES` carries
   `TODO(founder): verify/adjust … before launch` with no defined cadence,
   source, or drift check.

---

## 3. Design decisions

**Two cookies, not one.** Mirror the language model exactly, which already
solved this: `LANG_COOKIE` records *explicit choice only* and geo is never
persisted. So:

- `chippi_currency_pref` — written **only** on an explicit `?cur=` choice.
- `chippi_currency` — the derived display currency, still refreshed from geo,
  but computed as `pref ?? geo ?? USD`.

A single `decideCurrency({ country, cookiePref, curParam })` in
`lib/i18n/markets.ts`, tested the way `decideLangRouting` is, and the manual
choice then wins everywhere without a second mechanism.

**Charge what was displayed, provably.** Introduce a signed **price quote**:
the server mints `{ plan, cadence, currency, unitAmount, ratePinVersion, exp }`
(HMAC, ~30 min TTL) when the pricing page renders, the checkout route verifies
it, and refuses rather than silently substituting if the quote is stale or the
currency is unsupported. This is what makes "pricing remains consistent
throughout the website and checkout" a property instead of a hope.

**Stripe multi-currency via `currency_options`, not parallel price objects.**
One price per plan/cadence carrying per-currency amounts keeps `lib/plans.ts`
as the single source of truth for tier identity; the checkout session just
passes `currency`. Per-currency price ids would multiply the env-var surface
(`STRIPE_PRICE_*` already has cadence and add-on variants) and give the webhook
plan-reverse-lookup (`lib/plans.ts`) many ids per plan to match.

**Zero-decimal currencies are a correctness trap.** CLP, PYG (and JPY, KRW if
ever added) take amounts *unmultiplied* by Stripe. The conversion helper must
own this, not each call site — a `stripeUnitAmount(amount, currency)` with a
table-driven test.

**Fallback is disclosed, never silent.** `CurrencyNote` already exists for
"billed in USD". Keep it, but drive it from real capability: displayed currency
supported by Stripe *and* configured on the price ⇒ charge locally; otherwise
show the fallback note with the exact USD amount that will be charged.

---

## 4. Phases

### Phase 1 — Registry and preference (display correctness)

- Extend `Currency` and the country maps: add `GBP` (`GB`, `GG`, `IM`, `JE`),
  and the obvious high-traffic markets — `CAD`, `AUD`, `NZD`, `CHF`, `SEK`,
  `NOK`, `DKK`, `PLN`, `SGD`, `INR`, `BRL`, `ZAR`, `SAR`, `QAR`, `KWD`.
  Every added currency needs a pinned rate; the existing test that enforces
  "every `Currency` has a rate" keeps this honest.
- Keep the deliberate exclusions and document them next to the code: dollarized
  economies (EC, SV, PA) and hyper-inflationary ones (VE) stay USD; RUB stays
  out because Stripe does not support it.
- `decideCurrency()` + the `chippi_currency_pref` cookie; middleware writes the
  derived cookie **and** a new `x-currency` request header (mirroring
  `x-language`), plus `getRequestCurrency()` in `lib/i18n/request.ts`.
- Server-render prices from `x-currency` on dynamic pages; static marketing
  pages keep the client swap (`useDisplayCurrency`) but seed from the header
  where the page is already dynamic. Do not make `/pricing` per-currency
  dynamic — that trades a hydration swap for a CDN cache miss on every visit.
- `CurrencySwitcher` next to `LangSwitcher`: links carry `?cur=GBP`, middleware
  pins the preference cookie, choice wins over geo from then on.
- Logged-in users: persist the chosen currency on the profile so it follows
  them across devices, with the cookie as the logged-out carrier.
- **Test override:** `?country=GB` honoured only in non-production, or behind a
  signed debug token in production. This is what makes the whole matrix
  testable without foreign IPs.

**Acceptance covered:** UAE→AED, UK→GBP, US→USD, manual choice retained,
unsupported/undetected → USD default, testable from anywhere.

### Phase 2 — Local-currency checkout

- Configure `currency_options` on each plan price in Stripe (monthly, annual,
  and the per-seat add-on prices — a brokerage's base and add-on lines must be
  in the *same* currency or Stripe rejects the session).
- Price quote token: `lib/billing/price-quote.ts` (mint + verify), rendered into
  the pricing CTA, verified in `app/api/billing/checkout/route.ts` and
  `checkout-value`.
- `stripe.checkout.sessions.create({ currency, … })` when the quote's currency
  is supported by *every* line item; otherwise fall back to USD **and** return
  the fallback in the response so the UI can disclose it before redirect.
- Persist the transacted currency on the internal subscription record; teach the
  webhook plan-reverse-lookup that a price id now maps to many currencies.
- Receipts/invoices need no separate work once the subscription is created in
  the target currency — but assert it: a test that the invoice's `currency` and
  `amount_due` equal the quote.

**Acceptance covered:** checkout shows the exact currency and amount charged;
receipts and invoices match; payment processed in the displayed currency when
supported; fallback clearly disclosed.

### Phase 3 — Tax, methods, and money-movement correctness

- Stripe Tax: `automatic_tax: { enabled: true }` with
  `customer_update: { address: 'auto' }` and `tax_id_collection` for EU/GB/AE
  B2B (reverse charge). Display must state tax-inclusive vs exclusive per
  market — an inclusive market showing an exclusive price is the same class of
  bug as the wrong currency.
- Local payment methods per country (SEPA, iDEAL, Bancontact, BACS, PayNow…)
  via `payment_method_types` / automatic payment methods, constrained by what
  Stripe supports for *subscriptions* in each currency.
- `stripeUnitAmount()` zero-decimal handling with a table-driven test.
- Credits checkout (`app/api/billing/credits/checkout`) goes through the same
  quote + currency path so a customer never sees two currencies in one account.

### Phase 4 — Rate governance, privacy, performance

- **Rates:** keep them pinned and in git — stable, reviewable, no runtime FX
  dependency. Add `RATE_PIN_VERSION` and `RATE_PINNED_AT`, and a low-frequency
  job that compares each pinned rate against an approved reference source and
  **alerts** (Sentry + notification) when drift exceeds 5%. It never rewrites a
  rate automatically; re-pinning stays a human PR. Document the cadence
  (quarterly, or on a >5% drift alert) in this file and in `docs/RELEASE.md`.
- **Privacy:** the country comes from an edge header; the raw IP is never read,
  logged, or stored, and that must stay true — add a test asserting no
  `x-forwarded-for` / `x-real-ip` read in the geo path. Classify
  `chippi_currency*` as functional/preference cookies in the consent copy and
  privacy policy, and state that approximate country is inferred from IP for
  pricing and language.
- **Performance:** the resolution is a pure map lookup in middleware — no
  network call, no geo-IP database at request time. Guard rails: no new
  `await` in the public fast path, and `/pricing` must stay statically
  generated per language (currency varies client-side), so the CDN keeps
  serving one document per language rather than one per country.

---

## 5. Acceptance criteria → verification

| Criterion | Verification |
| --- | --- |
| Any country gets the appropriate experience | Table test over the full country→market matrix, including unmapped input |
| UAE sees UAE content and AED | `?country=AE` (Phase 1 override) e2e through pricing → checkout |
| UK sees GBP | Same, `?country=GB` — currently fails; Phase 1 fixes it |
| US sees USD | Same, `?country=US` |
| Pricing consistent site-wide and through checkout | Quote-token verification test: tampered/stale quote is refused, never silently re-priced |
| Checkout shows exact currency and amount | Assert the Stripe session's `currency` + line amounts equal the quote |
| Receipts/invoices match checkout | Assert invoice `currency`/`amount_due` against the quote |
| Manual change retained | Set `?cur=GBP`, then request from a US IP: still GBP |
| Unsupported/undetectable → default | Garbage/absent country and unsupported currency both resolve to USD with the fallback note |
| Testable without foreign IPs | The `?country=` override + the matrix test are the mechanism |

## 6. Sequencing and risk

- Phase 1 is independently shippable and low-risk (display only) — and it is
  what closes the two failing named markets (GB, plus manual choice).
- Phase 2 must not ship before the Stripe `currency_options` objects exist in
  **both** test and live mode; gate it on `CHIPPI_LOCAL_CURRENCY_CHECKOUT` +
  a space/market allowlist, defaulting off, so a misconfigured price falls back
  to today's USD path rather than failing checkout.
- Removing the "billed in USD" note is the *last* step of Phase 2, per the
  honest-UI non-negotiable: the note comes out only where local charging is
  actually live, and is never softened while USD is still what gets charged.
- Biggest risk is a plan whose base price supports a currency while its
  per-seat add-on does not — the brokerage path would fail at session creation.
  Validate the whole line-item set before choosing a currency, and fall back as
  a set, not per line.
