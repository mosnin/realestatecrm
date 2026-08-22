#!/usr/bin/env node
/**
 * scripts/audit-tenant-scope.mjs
 *
 * Static CI regression gate for tenant isolation across request-path code
 * (app/api/** and lib/**). Scans for `.from('<TenantTable>')` Supabase call
 * sites and flags any whose surrounding chain carries neither a
 * `.eq`/`.in('<scopeColumn>', …)` filter, a `tenantTable(...)` helper, nor a
 * `.unscoped('reason')` / `unscoped(builder, 'reason')` escape hatch.
 *
 * Cycle 2 widened this from admin-only to app/api + lib. Files that ARE the
 * scoping mechanism (lib/tenant-db.ts, lib/supabase-guard.ts) are skipped.
 *
 * This is a HEURISTIC text scanner, not an AST walker. A scope filter applied
 * on a different runtime branch than the escape hatch is treated as compliant
 * if EITHER appears in the call's text window. False positives should be
 * resolved by `tenantTable()` or `unscoped(builder, 'reason')`.
 *
 * Usage:
 *   node scripts/audit-tenant-scope.mjs [--json]
 *
 * Exit codes:
 *   0 — no unscoped tenant table access found
 *   1 — at least one unscoped tenant table access found
 *   2 — script-level failure
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const JSON_OUTPUT = process.argv.includes('--json');

const MECHANISM_FILES = new Set(['lib/tenant-db.ts', 'lib/supabase-guard.ts']);

const SOURCE_ROOTS = ['app/api', 'lib'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage']);

const WINDOW_AFTER = 900;
const WINDOW_BEFORE = 200;

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

/** Strip block + line comments so a commented `.from('Contact')` is not a hit. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (block) => ' '.repeat(block.length)).replace(/\/\/.*$/gm, (line) => ' '.repeat(line.length));
}

function scanFile(file, tenantTables) {
  const relPath = relative(repoRoot, file).replace(/\\/g, '/');
  if (MECHANISM_FILES.has(relPath)) return [];

  const raw = readFileSync(file, 'utf8');
  const text = stripComments(raw);
  const violations = [];
  const fromRe = /\.from\(\s*(['"])([A-Za-z][A-Za-z0-9]*)\1\s*\)/g;
  let m;
  while ((m = fromRe.exec(text)) !== null) {
    const table = m[2];
    const column = tenantTables[table];
    if (!column) continue;

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

    // insert/upsert decide tenant by payload — not a filter. insert().select()
    // still starts with insert.
    let firstOp = null;
    const opRe = /\.(insert|upsert|select|update|delete)\s*\(/g;
    const opMatch = opRe.exec(windowAfter);
    if (opMatch) firstOp = opMatch[1];
    if (!firstOp || firstOp === 'insert' || firstOp === 'upsert') continue;

    const eqRe = new RegExp(`\\.(eq|in)\\(\\s*['"]${column}['"]`);
    const hasScopeFilter = eqRe.test(windowAfter);
    const hasTenantTable =
      /tenantTable\s*\(/.test(windowBefore) || new RegExp(`tenantTable\\s*\\([^)]*['"]${table}['"]`).test(windowBefore);
    const hasEscapeHatch = /unscoped\s*\(/.test(windowAfter) || /unscoped\s*\(/.test(windowBefore);

    if (!hasScopeFilter && !hasTenantTable && !hasEscapeHatch) {
      const line = raw.slice(0, callStart).split('\n').length;
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
      console.log(
        `  ${v.file}:${v.line}  .from('${v.table}') — no .eq/.in('${v.column}', …), tenantTable(), or unscoped('reason') found nearby`,
      );
    }
    console.log(
      '\nAdd tenantTable(supabase, \'<Table>\', { spaceId }) or .eq(\'<scopeColumn>\', …) ' +
        'if this should be tenant-scoped, or unscoped(builder, \'reason\') ' +
        '(from lib/supabase-guard.ts) if the read is intentionally cross-tenant.',
    );
  }

  process.exit(allViolations.length === 0 ? 0 : 1);
}

main();
