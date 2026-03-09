/**
 * Runs `prisma migrate deploy` with up to 4 retries (exponential back-off:
 * 5 s, 10 s, 20 s) to survive transient advisory-lock timeouts (P1002).
 */

const { execSync } = require('child_process');

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      execSync('prisma migrate deploy', { stdio: 'inherit' });
      console.log('[migrate-deploy] Migration succeeded.');
      return;
    } catch (err) {
      const isTimeout =
        err.stdout?.toString().includes('P1002') ||
        err.stderr?.toString().includes('P1002') ||
        err.message?.includes('P1002');

      if (attempt < MAX_ATTEMPTS && isTimeout) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[migrate-deploy] Advisory lock timeout (attempt ${attempt}/${MAX_ATTEMPTS}). Retrying in ${delay / 1000}s…`
        );
        await sleep(delay);
      } else {
        // Non-timeout error or last attempt — propagate
        console.error('[migrate-deploy] Migration failed:', err.message);
        process.exit(1);
      }
    }
  }
}

run();
