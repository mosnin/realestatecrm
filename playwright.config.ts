import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices, chromium } from '@playwright/test';

/**
 * Browser e2e harness (real Chromium, real rendering/hydration/navigation).
 *
 * Suite lives in e2e-browser/ — NOT tests/e2e/, which is the existing vitest
 * mocked route-lifecycle suite. Run with `pnpm test:e2e:browser`.
 *
 * Boot model:
 *   1. e2e-browser/stub-supabase.mjs — a stub PostgREST server so
 *      server-rendered public pages have deterministic data (one seeded
 *      Space slug, an always-healthy DB probe) with no external network.
 *   2. `pnpm dev` with the stub env from e2e-browser/.env.e2e, which
 *      satisfies exactly the hard-required tier of lib/env.ts. All values
 *      are fake; Clerk-authed routes therefore redirect to sign-in, which is
 *      itself covered as the auth-boundary test.
 */

const APP_PORT = 3100;
const STUB_SUPABASE_PORT = 55321;

/** Parse the committed stub env file (no dotenv dependency needed). */
function loadStubEnv(): Record<string, string> {
  const file = path.join(__dirname, 'e2e-browser', '.env.e2e');
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/**
 * Resolve a Chromium executable when the default download is absent.
 *
 * Sandboxed dev containers pre-install browsers under
 * PLAYWRIGHT_BROWSERS_PATH (e.g. /opt/pw-browsers) and forbid downloads
 * (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1). When the pinned @playwright/test
 * version resolves to a revision that exists there, we return undefined and
 * let Playwright use its default (including the headless shell). Otherwise
 * we fall back to whatever Chromium binary the container ships.
 * In CI the browser is installed by `npx playwright install chromium`, so
 * this returns undefined there too.
 */
function chromiumExecutableOverride(): string | undefined {
  try {
    const def = chromium.executablePath();
    if (def && fs.existsSync(def)) return undefined;
  } catch {
    // fall through to manual resolution
  }
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(
    (r): r is string => Boolean(r),
  );
  for (const root of roots) {
    const symlink = path.join(root, 'chromium');
    if (fs.existsSync(symlink)) return symlink;
    if (!fs.existsSync(root)) continue;
    const dirs = fs
      .readdirSync(root)
      .filter((d) => d.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const dir of dirs) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const candidate = path.join(root, dir, rel);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

const stubEnv = loadStubEnv();
const webServerEnv = {
  ...(process.env as Record<string, string>),
  ...stubEnv,
  STUB_SUPABASE_PORT: String(STUB_SUPABASE_PORT),
};
const executablePath = chromiumExecutableOverride();

export default defineConfig({
  testDir: 'e2e-browser',
  outputDir: 'e2e-browser/test-results',
  // Dev-server first-compiles of the big marketing pages can take tens of
  // seconds; budgets are sized for that, not for flaky-test forgiveness.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  // Two workers: enough parallelism to matter, without stampeding the dev
  // server with simultaneous first-compiles.
  workers: 2,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'e2e-browser/playwright-report', open: 'never' }]]
    : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    launchOptions: {
      // e2e containers/CI runners may run as root, where the Chromium
      // user-namespace sandbox can't start.
      chromiumSandbox: false,
      // Sandboxed containers export HTTP(S)_PROXY, which Chromium would apply
      // to 127.0.0.1 too (ERR_TUNNEL_CONNECTION_FAILED against the dev
      // server). The suite talks only to localhost — third-party requests are
      // aborted by route interception — so skip proxying entirely.
      args: ['--no-proxy-server'],
      ...(executablePath ? { executablePath } : {}),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node e2e-browser/stub-supabase.mjs',
      url: `http://127.0.0.1:${STUB_SUPABASE_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
      env: webServerEnv,
    },
    {
      command: `pnpm dev --port ${APP_PORT}`,
      // /status is server-rendered against the stub DB — reaching 200 here
      // proves env validation, middleware, and the stub wiring all work.
      url: `http://127.0.0.1:${APP_PORT}/status`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: webServerEnv,
    },
  ],
});
