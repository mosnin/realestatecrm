/**
 * Runs `prisma migrate deploy` with retries and exponential backoff.
 *
 * Neon serverless PostgreSQL can time out on advisory lock acquisition
 * during cold starts. This script retries the migration up to 3 times
 * with increasing delays to handle transient connection issues.
 */

const { execSync } = require('child_process');

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[migrate] Attempt ${attempt}/${MAX_RETRIES}: prisma migrate deploy`);
      execSync('prisma migrate deploy', { stdio: 'inherit' });
      console.log('[migrate] Migration completed successfully.');
      return;
    } catch (err) {
      console.error(`[migrate] Attempt ${attempt} failed.`);
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[migrate] Retrying in ${delay / 1000}s...`);
        await sleep(delay);
      } else {
        console.error('[migrate] All attempts failed. Exiting.');
        process.exit(1);
      }
    }
  }
}

run();
