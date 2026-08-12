# Marketing voice: sell the outcome, not the machine

The rule: **a five-year-old should understand every sentence on the public
site.** Not childish — *plain*. Short words, short sentences, concrete results.
If a realtor has to think about what a sentence means, the sentence has failed.

This applies to every page under `app/(marketing)/` and every language in
`lib/i18n/dictionaries/`. English is written first; the translations must be
just as simple in their own language (see "Translating simple copy" below).

## The test

Before shipping a line, ask:

1. **Would a 5-year-old know every word?** "Credit balance", "workflow",
   "pipeline", "integration", "autonomy", "orchestrate" — all fail.
2. **Does it say what the realtor GETS?** Not what the software has.
3. **Can you cut a word?** Then cut it.
4. **Read it aloud.** If you run out of breath, it's too long.

## The rules

- **Sentences under 12 words.** Most under 8.
- **One idea per sentence.** No semicolons. No "and also".
- **Say "you" and "your".** Never "users", "clients", "agents" (in the
  software sense), "the platform", "the system".
- **Verbs over nouns.** "Chippi answers your leads" beats "automated lead
  response capability".
- **Numbers beat adjectives.** "Answers in 2 minutes" beats "lightning fast".
- **No jargon, ever.** If an industry word is unavoidable, say what it does
  in the same breath.
- **No hype words**: seamless, robust, powerful, cutting-edge, revolutionary,
  next-level, supercharge, unlock, leverage, empower, elevate.
- **No exclamation marks.** Confidence is quiet.
- **Never fake proof.** No invented testimonials, logos, or certifications
  (CLAUDE.md non-negotiable #5).

## Before → after

| Instead of (mechanism) | Say (outcome) |
|---|---|
| "Premium AI workflows draw from a monthly credit balance." | "You get a set number of jobs each month." |
| "Pricing that scales with you." | "Pay for what you use." |
| "A shared command center for scoring, routing, and accountability." | "See what your whole team is doing." |
| "Brokerage-level workflow without enterprise complexity." | "Run a big team. Keep it simple." |
| "Reads and drafts every lead." | "Chippi reads every new lead. It writes the reply for you." |
| "Tour booking and follow-ups." | "It books showings. It follows up so you don't forget." |
| "Every integration included." | "Works with the apps you already use." |
| "Credits are spent when Chippi does real work." | "You only pay when Chippi actually does something." |
| "Unused credits roll over for 30 days." | "Didn't use them all? They wait 30 days for you." |
| "Add an agent, billing updates itself." | "Add someone to your team. We fix the bill for you." |

## Translating simple copy

The translations must be **as simple in their language as the English is in
English**. That is not the same as translating word-for-word — a literal
translation of simple English often produces stiff, formal Spanish or Russian.

- **es-419**: informal "tú". Short sentences. Everyday words a person uses
  out loud, not business register. Avoid "usted", avoid nominalizations
  ("la realización de" → just use the verb).
- **ru**: formal «вы» (the register the market expects), but *plain* — short
  sentences, everyday verbs, no bureaucratic noun chains
  («осуществление коммуникации» → «мы пишем»).
- Keep the **same number of sentences** as English wherever the grammar
  allows. If English says it in two short sentences, so does the translation.
- Interpolation tokens ({price}, {n}) stay exactly as-is.

Worked example — the pricing hero subtitle:

> **en (before):** Every plan starts with a 7-day free trial. Move up as you
> grow, premium AI workflows draw from a monthly credit balance, and brokerage
> pricing expands automatically as you add agents.
>
> **en (after):** Try it free for 7 days. Chippi does the work you hate. You
> keep the deals.
>
> **es-419:** Pruébalo gratis 7 días. Chippi hace el trabajo que odias. Tú te
> quedas con los negocios.
>
> **ru:** Попробуйте бесплатно 7 дней. Chippi делает работу, которую вы не
> любите. Сделки остаются вам.

Each is three short sentences. Each sells the outcome. None mentions credits,
workflows, or expansion — those live in the FAQ, where someone who wants the
mechanism can go looking for it.

## Where the detail goes

Simplifying the pitch does not mean hiding the facts. Pricing numbers, credit
counts, seat rules, and billing terms stay accurate and visible — they move
**down the page** into the FAQ and detail sections, where a buyer who wants
them will look. The top of every page sells the outcome; the bottom answers
the questions.

## Enforcement

`lib/i18n/dictionaries/` is the single place marketing copy lives, and the
`en` dictionary is canonical. Rewrites happen there, then propagate to every
language before shipping (the dictionary type makes a missing key a build
error; `tests/lib/i18n-markets.test.ts` pins token parity).
