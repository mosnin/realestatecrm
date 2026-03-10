#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.next') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(repoRoot).filter((f) => /\.(ts|tsx|js|mjs|md)$/.test(f));
const rel = (f) => f.replace(`${repoRoot}/`, '');
const read = (f) => readFileSync(f, 'utf8');
const errors = [];

function expectContains(file, regex, message) {
  const body = read(file);
  if (!regex.test(body)) errors.push(`${rel(file)}: ${message}`);
}

function expectNotContains(file, regex, message) {
  const body = read(file);
  if (regex.test(body)) errors.push(`${rel(file)}: ${message}`);
}

// 1) Canonical onboarding helper must exist and define isOnboarded by space only.
const onboardingHelper = join(repoRoot, 'lib/onboarding.ts');
expectContains(
  onboardingHelper,
  /isOnboarded:\s*hasSpace/,
  'onboarding helper must define isOnboarded from hasSpace',
);

// 2) Onboarding guards/pages must use the shared helper.
for (const requiredFile of [
  'app/dashboard/page.tsx',
  'app/onboarding/page.tsx',
  'app/s/[subdomain]/layout.tsx',
  'app/api/onboarding/route.ts',
]) {
  const full = join(repoRoot, requiredFile);
  expectContains(full, /getOnboardingStatus/, 'must use getOnboardingStatus');
}

// 3) No subdomain-style intake URL generation in app/lib.
for (const file of files) {
  const r = rel(file);
  if (!r.startsWith('app/') && !r.startsWith('lib/')) continue;
  if (r === 'app/not-found.tsx') continue; // display-only fallback UI
  const body = read(file);
  if (/(https?:\/\/\$\{[^}]+\}\.\$\{rootDomain\})|(\$\{[^}]*subdomain[^}]*\}\.\$\{rootDomain\})/.test(body)) {
    errors.push(`${r}: found subdomain-style URL template`);
  }
}

// 4) Profile/dashboard/onboarding intake links must use canonical helper.
for (const requiredFile of [
  'app/s/[subdomain]/profile/page.tsx',
  'app/s/[subdomain]/page.tsx',
  'app/onboarding/wizard-client.tsx',
]) {
  const full = join(repoRoot, requiredFile);
  expectContains(full, /buildIntakeUrl|buildIntakePath/, 'must use canonical intake helper(s)');
}

// 5) Public intake form has exactly one submission endpoint.
expectContains(
  join(repoRoot, 'app/apply/[subdomain]/application-form.tsx'),
  /fetch\('\/api\/public\/apply'/,
  'form should submit to /api/public/apply',
);
expectNotContains(
  join(repoRoot, 'app/apply/[subdomain]/application-form.tsx'),
  /fetch\('\/api\/(?!public\/apply)/,
  'form should not submit to alternate API routes',
);

// 6) Public apply API must validate schema and perform idempotency protection.
const applyApi = join(repoRoot, 'app/api/public/apply/route.ts');
expectContains(applyApi, /publicApplicationSchema\.safeParse/, 'must validate with shared schema');
expectContains(applyApi, /idempotencyKey/, 'must create idempotency key');
expectContains(applyApi, /redis\.set\(idempotencyKey/, 'must attempt distributed idempotency lock');
expectContains(applyApi, /duplicateCutoff/, 'must include DB duplicate fallback');

if (errors.length) {
  console.error('Regression checks failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Routing/intake regression checks passed.');
