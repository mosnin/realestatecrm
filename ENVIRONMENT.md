# ENVIRONMENT.md

Configuration and external service reference (repo-truth based).

## 1) Environment variables found/inferable from code

| Variable | Used for | Criticality |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection (Prisma + pg pool) | Critical |
| `KV_REST_API_URL` | Upstash Redis URL | Medium (legacy/admin paths) |
| `KV_REST_API_TOKEN` | Upstash Redis auth | Medium (legacy/admin paths) |
| `OPENAI_API_KEY` | Lead scoring + embeddings + OpenAI chat path | High for AI/scoring |
| `ANTHROPIC_API_KEY` | Anthropic fallback/provider for assistant | Medium/High for AI chat |
| `ZILLIZ_URI` | Milvus/Zilliz vector DB endpoint | Optional (RAG/vector features) |
| `ZILLIZ_TOKEN` | Milvus/Zilliz auth | Optional (RAG/vector features) |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Public URL/domain construction | Medium |

## 2) What each service powers

- Clerk: auth/session and protected route access
- PostgreSQL: source-of-truth app data
- OpenAI: scoring + embeddings + optional assistant path
- Anthropic: assistant provider path/fallback
- Zilliz: vector storage/search for assistant context
- Upstash Redis: subdomain/admin metadata path
- Vercel analytics/speed insights: telemetry packages

## 3) Missing variable symptoms (likely)

- Missing `DATABASE_URL`: DB access failures across app/API routes
- Missing Clerk config: auth pages/middleware failures
- Missing `OPENAI_API_KEY`: scoring/embedding failures; fallback behavior in APIs
- Missing `ANTHROPIC_API_KEY` with no OpenAI path: AI chat provider errors
- Missing `ZILLIZ_*`: vector sync/search disabled/failing (assistant should still run without RAG)
- Missing `NEXT_PUBLIC_ROOT_DOMAIN`: incorrect intake link/domain generation

## 4) Local vs production notes

- `protocol` is derived from `NODE_ENV` (http in dev, https in production).
- Build pipeline runs migration deploy and helper scripts.
- Config/copy references Vercel as deployment environment.

## 5) Third-party services map

| Service | Present in code | Notes |
|---|---|---|
| Clerk | Yes | Core auth + middleware |
| Neon | Not explicit by name | Postgres-compatible via `DATABASE_URL` |
| Vercel | Yes (packages/copy) | Deployment target appears Vercel-oriented |
| Stripe | Not confirmed | No Stripe package/routes found |
| OpenAI | Yes | Scoring + embeddings + assistant path |
| Anthropic | Yes | Assistant provider path |
| Upstash Redis | Yes | Legacy/admin metadata path |
| Zilliz/Milvus | Yes | Vector search infrastructure |
