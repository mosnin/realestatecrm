/**
 * Tenant-scope observer for the service-role Supabase client.
 *
 * The service-role key bypasses RLS, so server tenant isolation lives entirely
 * in the `.eq('spaceId'|'brokerageId', …)` filter on each query. This guard
 * OBSERVES every query and flags reads/updates/deletes on a registered tenant
 * table (lib/tenant-db.ts) that carry no scope filter and no explicit
 * `.unscoped(reason)` escape:
 *
 *   - test / development → THROW (fails the suite, surfaces in dev)
 *   - production         → captureMessage to Sentry and PROCEED (telemetry
 *                          only — it must never block a real request or turn a
 *                          missing filter into an outage)
 *
 * It is deliberately opt-in (wrapGuard is applied by lib/supabase.ts only when
 * TENANT_GUARD='1'; default on in test via the guard's own env check) so it
 * can be rolled out across all ~380 routes at once with zero rewrite and zero
 * outage risk. The legitimate non-eq scoping patterns (post-fetch ownership
 * compare, capability token, verified-email portal, admin cross-tenant) opt
 * out per-query with `.unscoped('why it is safe')`.
 *
 * insert/upsert are not checked here — a write's tenant is decided by the
 * payload's scope column, which tenantTable()/callers set directly.
 */

import { captureMessage } from '@/lib/observability';
import { isTenantTable, scopeColumnFor } from '@/lib/tenant-db';

const GUARDED_OPS = new Set(['select', 'update', 'delete']);
/** Filter builders that can carry the scope column. */
const FILTER_METHODS = new Set(['eq', 'in', 'match', 'or', 'filter', 'contains']);

function isEnabled(): boolean {
  // Single opt-in. Default OFF everywhere — including the normal test run — so
  // wiring wrapGuard into lib/supabase.ts can never wrap the global client
  // unexpectedly and break unrelated tests. The dedicated guard test sets
  // TENANT_GUARD=1 to exercise it; prod sets it to start Sentry observation.
  return process.env.TENANT_GUARD === '1';
}

function isHardFail(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
}

interface QueryState {
  table: string;
  op: string | null;
  scoped: boolean;
  unscopedReason: string | null;
}

/** The violation as an Error when the query resolves non-compliant, else null. */
function violation(state: QueryState): Error | null {
  if (!state.op || !GUARDED_OPS.has(state.op) || state.scoped) return null;
  const column = scopeColumnFor(state.table);
  const msg =
    `Unscoped tenant query: ${state.op} on "${state.table}" ` +
    `without a ${column} filter or .unscoped()`;
  if (isHardFail()) {
    return new Error(
      `${msg}. Add .eq('${column}', …) or, if the query is safe by another ` +
        `mechanism (post-fetch check, capability token, admin), annotate it ` +
        `with .unscoped('reason').`,
    );
  }
  // Prod: telemetry only — log and let the query proceed unchanged.
  captureMessage(msg, 'warning', { table: state.table, op: state.op, scopeColumn: column });
  return null;
}

/**
 * Wrap one `.from(table)` builder. Records the operation and whether a scope
 * filter (or `.unscoped`) was applied, and evaluates when the query is
 * awaited (the builder is a thenable).
 */
function wrapBuilder<T extends object>(
  builder: T,
  table: string,
  state: QueryState = { table, op: null, scoped: false, unscopedReason: null },
): T {
  const proxy = new Proxy(builder, {
    get(target, prop, receiver) {
      // Escape hatch: `.unscoped(reason)` marks the query as intentionally
      // scoped by a mechanism this observer can't see. Returns the same proxy
      // so the chain continues.
      if (prop === 'unscoped') {
        return (reason?: string) => {
          state.scoped = true;
          state.unscopedReason = reason ?? 'unspecified';
          return receiver;
        };
      }

      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') return value;
      const column = scopeColumnFor(table);

      // The builder is a thenable; awaiting it calls `.then`. Evaluate scope
      // compliance there and deliver any violation THROUGH the promise
      // channel (so `await` rejects) rather than throwing synchronously.
      if (prop === 'then') {
        return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
          const err = violation(state);
          if (err) return Promise.reject(err).then(onFulfilled, onRejected);
          return (value as (...a: unknown[]) => unknown).call(target, onFulfilled, onRejected);
        };
      }

      return (...args: unknown[]) => {
        if (typeof prop === 'string') {
          if (GUARDED_OPS.has(prop) && state.op === null) state.op = prop;
          if (FILTER_METHODS.has(prop) && column && args.some((a) => mentionsColumn(a, column))) {
            state.scoped = true;
          }
        }
        const result = Reflect.apply(value, target, args);
        // Chainable builder calls return the builder itself — keep it wrapped
        // (same state) so scope filters applied later still register.
        if (result === target || result === receiver) return receiver;
        // Real supabase-js returns a NEW builder object from .select()/.update()
        // etc; re-wrap it with the SAME state so op + scope tracking survive the
        // whole chain (a fresh state would silently forget the operation).
        if (result && typeof result === 'object' && sharesBuilderShape(result, target)) {
          return wrapBuilder(result as object, table, state);
        }
        return result;
      };
    },
  });

  return proxy as T;
}

/** True when the arg to a filter method names the scope column. */
function mentionsColumn(arg: unknown, column: string): boolean {
  if (typeof arg === 'string') return arg === column || arg.includes(`${column}.`) || arg.includes(column);
  return false;
}

function sharesBuilderShape(a: object, b: object): boolean {
  // PostgREST filter builders expose `then` and `eq`; a returned object with
  // those is another builder link in the same chain.
  return 'then' in a && 'eq' in (b as Record<string, unknown>);
}

/**
 * Wrap a Supabase client so its `.from()` returns guarded builders. No-op
 * (returns the client unchanged) when the guard is disabled, so production
 * pays nothing unless TENANT_GUARD is set.
 */
export function wrapGuard<T extends { from: (t: string) => object }>(client: T): T {
  if (!isEnabled()) return client;
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) => {
          const builder = (target.from as (t: string) => object)(table);
          if (!isTenantTable(table)) return builder;
          return wrapBuilder(builder, table);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as T;
}

/**
 * Production-safe escape hatch: call `unscoped(supabase.from('Table')…, 'reason')`
 * anywhere in a builder chain to mark a query as intentionally scoped by a
 * mechanism the guard can't see (admin capability gate, post-fetch ownership
 * check, capability token, …) — the documented `.unscoped(reason)` pattern.
 *
 * Calling `.unscoped(reason)` directly on the chain is only safe while the
 * guard is actually wrapping the client. `wrapGuard` is a no-op unless
 * `TENANT_GUARD=1` (the shared `supabase` export in lib/supabase.ts wraps
 * lazily against that same flag), so most of the time `supabase.from(...)`
 * returns the REAL supabase-js builder, which has no `.unscoped` method —
 * calling it directly would throw at runtime and break the request. This
 * helper checks for the method first and passes the builder through
 * unchanged whenever the guard isn't active, so call sites are safe
 * regardless of how TENANT_GUARD is set in the current environment.
 */
export function unscoped<T extends object>(builder: T, reason: string): T {
  const maybeGuarded = builder as unknown as { unscoped?: (r: string) => T };
  return typeof maybeGuarded.unscoped === 'function' ? maybeGuarded.unscoped(reason) : builder;
}
