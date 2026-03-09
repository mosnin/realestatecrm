/**
 * Resolves migrations that Prisma marked as "failed" because the columns
 * were already applied via `prisma db push` before the migration was created.
 *
 * This script runs before `prisma migrate deploy` in the build command.
 * It marks known idempotent migrations as "--applied" so deploy can proceed.
 * If a migration is not in a failed state the resolve command errors — we
 * catch and ignore that, then let migrate deploy handle things normally.
 */

const { execSync } = require('child_process');

// Migrations that may be in a failed state due to db push pre-dating them.
// The migration SQL must use IF NOT EXISTS so re-running is safe.
const migrationsToResolve = [
  '20260309120000_add_onboarding_fields'
];

for (const name of migrationsToResolve) {
  try {
    execSync(`prisma migrate resolve --applied ${name}`, { stdio: 'pipe' });
    console.log(`[resolve-migrations] Resolved failed migration as applied: ${name}`);
  } catch {
    // Migration is not in a failed state — already applied or never ran. Fine.
    console.log(`[resolve-migrations] ${name} is not in a failed state, skipping.`);
  }
}
