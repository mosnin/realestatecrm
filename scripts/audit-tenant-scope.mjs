#!/usr/bin/env node
/**
 * scripts/audit-tenant-scope.mjs
 *
 * Static CI regression gate for tenant isolation IN THE ADMIN TREE
 * (app/api/admin/**). Scans for `.from('<TenantTable>')` Supabase call sites
 * and flags any whose surrounding chain carries neither a
 * `.eq('<scopeColumn>', …)` filter nor a `.unscoped('reason')` /
 * `unscoped(builder, 'reason')` escape hatch — the two sanctioned ways
 * CLAUDE.md and lib/supabase-guard.ts document for a tenant-table read to be
 * compliant.
 *
 * Scope is deliberately app/api/admin/** only, NOT the whole app. Admin
 * routes are the highest-value place for this static gate: every read there
 * is either tenant-scoped (should carry `.eq()`) or intentionally
 * cross-tenant (must carry `.unscoped('reason')` so a reader — and the
 * runtime guard, when TENANT_GUARD=1 — knows it's deliberate, not an
 * oversight). Elsewhere in the app, tenant scoping is frequently established
 * through patterns this text-window heuristic can't see (a helper function
 * that applies the filter, a post-fetch ownership check several statements
 * away, scoping via a joined/derived id) — scanning app-wide produces heavy
 * false-positive noise without a real AST. Widening SOURCE_ROOTS is possible
 * once those patterns are normalized enough for a text scanner to trust.
 *
 * This is the STATIC, always-on cousin of the RUNTIME lib/supabase-guard.ts
 * observer:
 *   - the runtime guard only fires when TENANT_GUARD=1 and only catches code
 *     paths a request/test actually exercises;
 *   - this script inspects every `.from()` call SITE in the source, whether
 *     or not it's ever executed in CI, so it catches an unscoped branch that
 *     happens to never run in the test suite.
 *
 * Source of truth for tables + scope columns: lib/tenant-db.ts's
 * `TENANT_TABLES`, parsed at run time from the source file (not duplicated
 * here) so a table added to the registry is picked up automatically.
 *
 * This is a HEURISTIC text scanner, not a type checker or AST walker — it
 * does not understand control flow, so a scope filter applied on a different
 * runtime branch than the escape hatch (e.g. `if (spaceId) { .eq(...) } else
 * { unscoped(...) }`) is treated as compliant if EITHER appears anywhere in
 * the call's text window, which is the intended, conservative behavior: we
 * want to catch call sites with NO scoping mechanism at all, not police
 * which branch fires at runtime. False positives (a real scoping pattern the
 * heuristic doesn't recognize) should be resolved by adding an explicit
 * `.unscoped('reason')` at the call site, which is a net improvement anyway:
 * it documents WHY the read is safe for the next reader.
 *
 * Usage:
 *   node scripts/audit-tenant-scope.mjs [--json]
 *
 * Exit codes:
 *   0 — no unscoped tenant table access found
 *   1 — at least one unscoped tenant table access found
 *   2 — script-level failure (couldn't load the registry, etc.)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const JSON_OUTPUT = process.argv.includes('--json');

// Files that ARE the scoping mechanism, not a caller of it — scanning them
// would just flag their own generic/dynamic `.from(table)` plumbing.
const MECHANISM_FILES = new Set(['lib/tenant-db.ts', 'lib/supabase-guard.ts']);

// Admin routes only — see the module doc comment for why this gate doesn't
// (yet) scan the whole app.
const SOURCE_ROOTS = ['app/api/admin'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage']);

/** How far past a `.from('Table')` call to look for a scoping mechanism,
 *  bounded by the start of the NEXT `.from(` call so two adjacent queries
 *  in the same function never bleed into each other. */
const WINDOW_AFTER = 900;
/** How far before a `.from('Table')` call to look for the
 *  `unscoped(supabase.from('Table'), 'reason')` wrapper form, where the
 *  escape hatch textually precedes the call it wraps. */
const WINDOW_BEFORE = 120;

// ── 1. Load the tenant-table registry from lib/tenant-db.ts. Parsed from the
//    source text (this is a zero-dependency script, no ts-node) so the list
//    of tables + scope columns can never drift from the registry itself. ───
function loadTenantTables() {
  const text = readFileSync(join(repoRoot, 'lib/tenant-db.ts'), 'utf8');
  const start = text.indexOf('export const TENANT_TABLES');
  if (start === -1) {
    throw new Error('TENANT_TABLES export not found in lib/tenant-db.ts — registry moved?');
  }
  const openBrace = text.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = openBrace; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error('TENANT_TABLES object literal not closed');

  const body = text.slice(openBrace + 1, end);
  /** @type {Record<string, string>} */
  const map = {};
  const entryRe = /^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*'(spaceId|brokerageId)'/gm;
  let m;
  while ((m = entryRe.exec(body)) !== null) {
    map[m[1]] = m[2];
  }
  if (Object.keys(map).length === 0) {
    throw new Error('Parsed zero entries from TENANT_TABLES — parser out of sync with lib/tenant-db.ts');
  }
  return map;
}

// ── 2. Walk the source tree for .ts/.tsx files (skip *.test.* — behavioral
//    tests exercise real call sites via mocks, which is the runtime guard's
//    job, not this static gate's). ──────────────────────────────────────────
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.[jt]sx?$/.test(entry)) out.push(full);
  }
  return out;
}

// ── 3. Scan one file for unscoped tenant-table call sites. ──────────────────
function scanFile(file, tenantTables) {
  const relPath = relative(repoRoot, file).replace(/\\/g, '/');
  if (MECHANISM_FILES.has(relPath)) return [];

  const text = readFileSync(file, 'utf8');
  const violations = [];
  const fromRe = /\.from\(\s*(['"])([A-Za-z][A-Za-z0-9]*)\1\s*\)/g;
  let m;
  while ((m = fromRe.exec(text)) !== null) {
    const table = m[2];
    const column = tenantTables[table];
    if (!column) continue; // not a registered tenant table

    const callStart = m.index;
    const callEnd = m.index + m[0].length;

    const nextFromIdx = text.indexOf('.from(', callEnd);
    const afterBound = Math.min(
      text.length,
      callEnd + WINDOW_AFTER,
      nextFromIdx === -1 ? text.length : nextFromIdx,
    );
    const windowAfter = text.slice(callStart, afterBound);
    const windowBefore = text.slice(Math.max(0, callStart - WINDOW_BEFORE), callStart);

    // A guarded op (select/update/delete) must be present for the runtime
    // observer to check this call at all — insert() is deliberately
    // unguarded (tenant is decided by the insert payload, not a filter).
    const hasGuardedOp = /\.(select|update|delete)\s*\(/.test(windowAfter);
    if (!hasGuardedOp) continue;

    const eqRe = new RegExp(`\\.eq\\(\\s*['"]${column}['"]`);
    const hasScopeFilter = eqRe.test(windowAfter);
    // Matches both the direct `.unscoped('reason')` chain call and the
    // production-safe `unscoped(builder, 'reason')` wrapper from
    // lib/supabase-guard.ts, in front of OR behind the `.from()` call site.
    // The "behind" case looks anywhere in the before-window (not just
    // immediately preceding) because the typical wrapper shape is
    // `unscoped(\n  supabase.from('Table'),\n  'reason',\n)` — the
    // `supabase` identifier sits between `unscoped(` and `.from(`.
    const hasEscapeHatch = /unscoped\(/.test(windowAfter) || /unscoped\(/.test(windowBefore);

    if (!hasScopeFilter && !hasEscapeHatch) {
      const line = text.slice(0, callStart).split('\n').length;
      violations.push({ file: relPath, line, table, column });
    }
  }
  return violations;
}

function main() {
  let tenantTables;
  try {
    tenantTables = loadTenantTables();
  } catch (err) {
    console.error(`audit-tenant-scope: could not load the tenant-table registry: ${err.message}`);
    process.exit(2);
  }

  const files = SOURCE_ROOTS.flatMap((root) => {
    const dir = join(repoRoot, root);
    try {
      statSync(dir);
    } catch {
      return [];
    }
    return walk(dir);
  });

  const allViolations = files.flatMap((f) => scanFile(f, tenantTables));

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ ok: allViolations.length === 0, violations: allViolations }, null, 2));
  } else if (allViolations.length === 0) {
    console.log(
      `audit-tenant-scope: scanned ${files.length} files, ${Object.keys(tenantTables).length} registered tenant tables — no unscoped call sites found.`,
    );
  } else {
    console.log(`audit-tenant-scope: found ${allViolations.length} unscoped tenant-table call site(s):\n`);
    for (const v of allViolations) {
      console.log(`  ${v.file}:${v.line}  .from('${v.table}') — no .eq('${v.column}', …) filter or .unscoped('reason') escape found nearby`);
    }
    console.log(
      '\nAdd .eq(\'<scopeColumn>\', …) if this should be tenant-scoped, or ' +
        'unscoped(builder, \'reason\') (from lib/supabase-guard.ts) if the read ' +
        'is intentionally cross-tenant (admin route, post-fetch ownership check, ' +
        'capability token) — that also documents WHY for the next reader.',
    );
  }

  process.exit(allViolations.length === 0 ? 0 : 1);
}

main();
