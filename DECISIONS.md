# DECISIONS.md

Decision log for product and technical choices.

Use this to record meaningful decisions and avoid re-litigating context.

---

## Decision template

```md
## [YYYY-MM-DD] <Decision title>
- Decision: <short statement>
- Context: <why this decision was needed>
- Options considered:
  1. <option A>
  2. <option B>
  3. <option C>
- Chosen option: <selected option>
- Expected impact: <benefits/constraints>
- Risks: <known downsides>
- Follow-up review date: <YYYY-MM-DD>
```

---

## Starter placeholders (mark/update after confirmation)

## [PLACEHOLDER] Protect launch wedge over generic CRM expansion
- Decision: Prioritize renter/leasing qualification speed and clarity over broad CRM feature expansion.
- Context: Product direction and existing implementation indicate a narrow launch wedge.
- Options considered:
  1. Expand generic CRM breadth now
  2. Maintain focused wedge (chosen)
- Chosen option: 2
- Expected impact: Better activation and clearer user value in early phase.
- Risks: Some users may request broader CRM features early.
- Follow-up review date: [PLACEHOLDER]

## [PLACEHOLDER] Keep scoring explainable
- Decision: Preserve score + label + summary contract for practical triage.
- Context: Current scoring flow persists explainability fields in contact records.
- Options considered:
  1. Opaque score only
  2. Explainable score contract (chosen)
- Chosen option: 2
- Expected impact: Improved trust and follow-up clarity.
- Risks: Prompt/schema drift could break consistency.
- Follow-up review date: [PLACEHOLDER]
