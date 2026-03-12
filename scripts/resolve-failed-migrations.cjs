/**
 * Resolves migrations that Prisma marked as "failed" because the columns
 * were already applied via `prisma db push` before the migration was created.
 *
 * This script runs before `prisma migrate deploy` in the build command.
 * It marks known idempotent migrations as "--applied" so deploy can proceed.
 * If a migration is not in a failed state the resolve command errors — we
 * catch and ignore that, then let migrate deploy handle things normally.
 *
 * Each resolve attempt retries up to 3 times to handle Neon cold-start timeouts.
 */

const { execSync } = require('child_process');

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 3000;

// Migrations that may be in a failed state due to db push pre-dating them.
// The migration SQL must use IF NOT EXISTS so re-running is safe.
const migrationsToResolve = [
  '20260309120000_add_onboarding_fields'
];

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy wait for sync context */ }
}

for (const name of migrationsToResolve) {
  let resolved = false;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      execSync(`prisma migrate resolve --applied ${name}`, { stdio: 'pipe' });
      console.log(`[resolve-migrations] Resolved failed migration as applied: ${name}`);
      resolved = true;
      break;
    } catch (err) {
      const msg = err.stderr ? err.stderr.toString() : err.message;
      if (msg.includes('timed out') || msg.includes('P1002') || msg.includes('advisory')) {
        console.log(`[resolve-migrations] Attempt ${attempt}/${MAX_RETRIES} timed out for ${name}`);
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(`[resolve-migrations] Retrying in ${delay / 1000}s...`);
          sleepSync(delay);
        }
      } else {
        // Migration is not in a failed state — already applied or never ran. Fine.
        console.log(`[resolve-migrations] ${name} is not in a failed state, skipping.`);
        resolved = true;
        break;
      }
    }
  }
  if (!resolved) {
    console.error(`[resolve-migrations] Failed to resolve ${name} after ${MAX_RETRIES} attempts, continuing anyway.`);
  }
}
