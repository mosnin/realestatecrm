# SECURITY.md

Consolidated security patterns and rules for Chippi. Read this before modifying auth, API routes, or data access.

---

## 1. Threat model summary

Chippi is a multi-tenant SaaS. The primary security concerns are:

1. **Cross-tenant data leakage** — User A seeing User B's contacts, deals, or messages
2. **Unauthorized access** — Unauthenticated users accessing protected resources
3. **Input injection** — SQL injection, XSS, PostgREST filter injection
4. **Privilege escalation** — Realtors accessing broker/admin functionality
5. **Rate abuse** — Automated spam on public endpoints (intake form, tour booking)

---

## 2. Authentication architecture

### Clerk handles identity

| Layer | Mechanism | File |
|-------|-----------|------|
| Middleware | Clerk `clerkMiddleware()` protects routes | `middleware.ts` |
| API routes | `requireAuth()` from `lib/api-auth.ts` | All protected API routes |
| Public routes | No auth required | `/`, `/apply/*`, `/legal/*`, `/api/public/*` |

### Auth flow

```
Request → Clerk middleware (route protection)
       → API route calls requireAuth()
       → requireAuth() calls auth() from @clerk/nextjs/server
       → Returns { userId: clerkId } or 401 response
```

### Protected route patterns

| Pattern | Protection |
|---------|-----------|
| `/dashboard(.*)` | Clerk middleware — redirect to sign-in |
| `/s/(.*)` | Clerk middleware — redirect to sign-in |
| `/onboarding(.*)` | Clerk middleware — redirect to sign-in |
| `/broker(.*)` | Clerk middleware + `requireBroker()` |
| `/admin(.*)` | Clerk middleware + `requirePlatformAdmin()` |
| `/apply/*` | Public — no auth |
| `/api/public/*` | Public — no auth |

---

## 3. Tenant isolation (critical)

### The rule

**Every database query for tenant-scoped data MUST filter by `spaceId`.**

The `spaceId` is derived from the authenticated user's space, never from user input.

### Correct pattern

```typescript
// 1. Authenticate
const authResult = await requireAuth();
if (authResult instanceof NextResponse) return authResult;
const { userId } = authResult;

// 2. Resolve space from authenticated user (NOT from request params)
const space = await getSpaceForUser(userId);
if (!space) return NextResponse.json({ error: 'No workspace' }, { status: 404 });

// 3. Query scoped to space
const { data } = await supabase
  .from('Contact')
  .select('*')
  .eq('spaceId', space.id);  // Always scope by space
```

### Dangerous pattern (DO NOT DO)

```typescript
// BAD — trusting spaceId from request body
const { spaceId } = await req.json();
const { data } = await supabase.from('Contact').select('*').eq('spaceId', spaceId);
// This lets any authenticated user read any space's contacts
```

### Resource ownership verification

For update/delete on specific resources:

```typescript
// Verify the resource belongs to the user's space
const { data: contact } = await supabase
  .from('Contact')
  .select('*')
  .eq('id', contactId)
  .eq('spaceId', space.id)  // Ownership check
  .maybeSingle();

if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
```

### Cross-resource linking

When linking resources (e.g., adding a contact to a deal):

```typescript
// Verify BOTH resources belong to the same space
const [deal, contact] = await Promise.all([
  supabase.from('Deal').select('*').eq('id', dealId).eq('spaceId', space.id).maybeSingle(),
  supabase.from('Contact').select('*').eq('id', contactId).eq('spaceId', space.id).maybeSingle(),
]);

if (!deal || !contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
```

---

## 4. RLS (defense-in-depth)

- RLS is **enabled on all tables** but the app uses the **service_role key** which bypasses RLS
- RLS policies exist as a safety net — they are NOT the primary access control
- **Application-level checks are mandatory** regardless of RLS
- If Supabase ever switches to anon/authenticated keys, RLS policies prevent data leakage

---

## 5. Role-based access control

### Three levels

| Role | How determined | Access |
|------|---------------|--------|
| Realtor | Default for all users | Own workspace only |
| Broker | Has `BrokerageMembership` with broker role | `/broker` dashboard + member oversight |
| Platform Admin | `User.platformRole = 'admin'` | `/admin` + all management |

### Permission helpers (`lib/permissions.ts`)

```typescript
isPlatformAdmin()       // DB check + Clerk metadata fallback
requirePlatformAdmin()  // Throws if not admin
getBrokerContext()      // Returns brokerage + membership or null
requireBroker()         // Throws if not broker_owner or broker_admin
getCurrentDbUser()      // Clerk userId → internal User row
```

**Rule**: Always use these helpers. Never do raw role checks in route handlers.

---

## 6. Input validation

### Zod schemas for structured input

```typescript
// Public intake form
const publicApplicationSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  // ...
});
```

### PostgREST filter escaping

User-provided search input used in `.ilike()` or `.or()` filters must be escaped:

```typescript
const escaped = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
const sanitized = escaped.replace(/[,()]/g, '');  // Remove PostgREST syntax chars
```

**Why**: PostgREST interprets `,`, `(`, `)` as filter operators. Unescaped `%` and `_` are ILIKE wildcards.

### Request body limits

- String fields: truncate or validate max length
- Budget: parse as float, reject non-numeric
- Arrays: validate element types
- JSON fields: validate with Zod before storing

---

## 7. HTTP security headers

Configured in `next.config.ts`:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking prevention |
| `X-Content-Type-Options` | `nosniff` | MIME-sniffing prevention |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer leakage reduction |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Feature isolation |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HSTS (2 years) |

**CSP**: Not yet implemented. Clerk's hosted components require a large allowlist (clerk.com, lcl.dev, Cloudflare Turnstile). Deferred until full domain list validated against live deployment.

**CSRF**: Not needed — Clerk uses JWT auth (Authorization header), not session cookies. Not vulnerable to traditional CSRF.

---

## 8. Rate limiting

Implementation in `lib/rate-limit.ts` using Upstash Redis sliding-window counters. **Fails open** (allows request) if Redis is unavailable.

| Endpoint | Limit | Key |
|----------|-------|-----|
| `POST /api/public/apply` | 10/hr per IP | `apply:rl:{ip}` |
| `POST /api/ai/chat` | 60/hr per user | User-based |
| `POST /api/contacts/import` | 5/hr per user | User-based |
| `POST /api/broker/invite` | 20/hr per user | User-based |
| `POST /api/broker/join` | 10/hr per user | User-based |

---

## 9. Public endpoint security

### `/api/public/apply` (intake form)

- No auth required (prospect-facing)
- Validated with `publicApplicationSchema` (Zod)
- Deduplication: same name + normalized phone within 2-minute window
- Redis idempotency lock for concurrent submissions
- IP-based rate limiting: 10/hr (see section 8)

### `/api/public/tours/*` (tour booking)

- No auth required (guest-facing)
- Atomic booking via `book_tour_atomic` RPC (prevents double-booking)
- Guest manage token for self-service cancellation/rescheduling

### Security considerations for public endpoints

1. Never expose internal IDs unnecessarily
2. Never return other users' data in error messages
3. Always validate slug resolves to a real space
4. Rate limit to prevent abuse (form spam, booking spam)

---

## 10. File upload security

### Current implementation (`app/api/documents/route.ts`)

- **Size limit**: 10MB max
- **MIME whitelist**: PDF, JPEG, PNG, WebP, DOC, DOCX only — executables, scripts, archives rejected
- **Storage**: Base64 data URLs in `ContactDocument.storageKey` (MVP approach)
- **Auth for uploads**: Authenticated users must pass `requireContactAccess()`
- **Guest uploads**: Restricted to contacts with `application-link` tag created within last 30 minutes
- `uploadedBy` tracks `'guest'` vs authenticated user

### Rules

1. Validate file type server-side (don't trust `Content-Type` header alone)
2. Enforce 10MB size limit
3. Store files with generated keys, never user-provided filenames
4. Scope storage paths by spaceId to prevent cross-tenant access
5. Guest uploads must be associated with a valid, recent intake contact

---

## 11. API key handling

| Key | Storage | Access |
|-----|---------|--------|
| Supabase service role | Server env var | Server-side only, never exposed to client |
| Clerk secret | Server env var | Server-side only |
| OpenAI API key | Server env var | Server-side only |
| Anthropic API key | Server env var + per-workspace `SpaceSetting.anthropicApiKey` | Server-side only |
| Clerk publishable | `NEXT_PUBLIC_*` env var | Client-side (safe to expose) |

### Per-workspace API keys

- `SpaceSetting.anthropicApiKey` is stored in the database
- Must start with `sk-ant-` (validated before use)
- Used server-side only for AI assistant calls
- Never returned to the client in API responses (or if returned, mask it)

---

## 12. Common security mistakes to avoid

| Mistake | Impact | Prevention |
|---------|--------|------------|
| Trusting `spaceId` from request body | Cross-tenant data access | Always derive from authenticated user |
| Missing `spaceId` filter on query | Cross-tenant data leakage | Always scope by `space.id` |
| Not verifying both sides of a link | Cross-tenant resource linking | Check both resources belong to same space |
| Raw string interpolation in SQL | SQL injection | Use PostgREST builder or parameterized RPC |
| Unescaped search input in `.or()` | PostgREST filter injection | Escape `%`, `_`, `\`, `,`, `(`, `)` |
| Returning full error details in production | Information disclosure | Return generic error messages |
| Missing auth check on API route | Unauthorized access | Always call `requireAuth()` first |
| Using anon key instead of service role | RLS-dependent security | Use service role with app-level checks |

---

## 13. Audit logging

The `AuditLog` table provides append-only event tracking:

```typescript
await audit({
  actorId: dbUserId,
  clerkId: clerkUserId,
  ipAddress: req.headers.get('x-forwarded-for'),
  action: 'CREATE',
  resource: 'Contact',
  resourceId: contact.id,
  spaceId: space.id,
  metadata: { name: contact.name },
});
```

**Rules**:
- AuditLog is append-only — never update or delete rows
- Log all mutations (create, update, delete) on sensitive resources
- Include before/after state in `metadata` for updates
- Include IP address for compliance

---

## 14. Security review checklist

Run this after any change to auth, API routes, or data access:

- [ ] Every API route calls `requireAuth()` (or is intentionally public)
- [ ] Every query filters by `spaceId` derived from the authenticated user
- [ ] Resource ownership is verified before update/delete
- [ ] Cross-resource links verify both resources belong to the same space
- [ ] User input is validated (Zod for structured data, escaping for search)
- [ ] No internal IDs or error details leaked in public responses
- [ ] File uploads validated for type and size
- [ ] Admin/broker routes use permission helpers, not raw role checks
- [ ] New public endpoints have rate limiting considerations documented
