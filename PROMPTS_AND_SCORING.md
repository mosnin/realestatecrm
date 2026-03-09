# PROMPTS_AND_SCORING.md

Protected AI behavior map for prompts and scoring.

## 1) Do prompts/scoring exist?

Yes.

- Lead scoring system: implemented
- AI assistant prompting: implemented
- Embedding/vector retrieval path: implemented (optional/config dependent)

## 2) Code locations

### Lead scoring
- `lib/lead-scoring.ts`
- called from `app/api/public/apply/route.ts`

### Assistant prompting/provider routing
- `lib/ai.ts`
- called from `app/api/ai/chat/route.ts`

### Vector context (RAG)
- `lib/embeddings.ts`
- `lib/zilliz.ts`
- `lib/vectorize.ts`
- `app/api/vectorize/sync/route.ts`

## 3) Scoring contract (observed)

### Input shape (scoring call)
- `contactId`
- `name`
- `email`
- `phone`
- `budget`
- `timeline`
- `preferredAreas`
- `notes`

### Output shape (`LeadScoringResult`)
- `scoringStatus`: `scored | failed | pending`
- `leadScore`: `number | null`
- `scoreLabel`: `hot | warm | cold | unscored`
- `scoreSummary`: `string | null`

## 4) Parsing and persistence flow

1. Public apply API creates contact with pending scoring status.
2. API calls `scoreLeadApplication`.
3. Response is validated/parsing-checked against expected schema.
4. Contact row is updated with score fields.
5. If failure occurs, fallback unscored state is persisted.

## 5) Fallback behavior expectations

- AI scoring failures must **not** block lead persistence.
- Fallback should explicitly set failed/unscored semantics with safe summary text.
- Assistant should provide clear provider error messaging if keys are missing/invalid.

## 6) Change control rules (strict)

Do not edit prompts/scoring/model behavior without direct instruction.
This includes:
- prompt text
- schema contracts
- model names/provider selection
- scoring label thresholds
- fallback logic
- persistence fields and status semantics

If task requires scoring/prompt edits:
1. call out impacted workflows
2. document backward compatibility risk
3. test success + failure + fallback paths

## 7) Mandatory protection note

AI prompts and scoring are protected core systems.
Any change requires explicit task instruction and explicit validation evidence.
