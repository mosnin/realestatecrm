/**
 * Test stub for the `server-only` package.
 *
 * `server-only` throws at import time outside a React Server Component to guard
 * the server/client boundary at BUILD time. Under vitest everything runs in
 * Node, so that guard is meaningless and would otherwise crash any test that
 * imports a server module (directly or transitively through the tool registry).
 * Aliased in vitest.config.mts to this empty module.
 */
export {};
