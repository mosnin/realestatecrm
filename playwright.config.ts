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
 *
 * Clerk "dev browser" handshake: on http (non-https) origins, @clerk/nextjs
 * middleware requires a `__clerk_db_jwt` cookie identifying the anonymous
 * browser; when it's missing, it 307-redirects the *browser* to
 * `https://{frontendApi}/v1/client/handshake` to obtain one — a real
 * cross-origin navigation, not an SDK-internal fetch. Our stub publishable
 * key's frontendApi (`clerk.example.com`) is intentionally fake and can
 * never resolve, so without a workaround literally every test's first
 * navigation fails (ERR_NAME_NOT_RESOLVED / ERR_TUNNEL_CONNECTION_FAILED
 * depending on ambient proxy config — this is what was breaking the suite in
 * CI, not a Playwright/proxy bug per se). `page.route()` interception cannot
 * save you here either: Chromium resolves DNS for a 3xx redirect target
 * before the Fetch-domain interception hook fires for it, so `route.abort()`
 * never gets a chance to run (verified via chrome://net-export). The fix
 * (see `use.storageState` below) is to pre-seed that cookie with any
 * non-empty value — `@clerk/backend` only checks truthiness to decide
 * whether the handshake is needed, it doesn't verify the token at that
 * point — so the handshake never triggers and requests proceed straight to
 * the normal signed-out path (still exercised by auth-boundary.spec.ts).
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

// Belt-and-suspenders localhost bypass: whatever NO_PROXY the host shell
// already has (if any), make sure 127.0.0.1/localhost are always in it. Both
// the webServer children and the browser process (via launchOptions.env
// below) get this merged env, so a proxy-enabled host (this sandbox, and
// apparently some CI runners too — see launchOptions comment) can never
// route loopback traffic through it.
const LOCALHOST_NO_PROXY = 'localhost,127.0.0.1,::1';
function withLocalhostBypass(env: Record<string, string>): Record<string, string> {
  const merged = { ...env };
  for (const key of ['NO_PROXY', 'no_proxy']) {
    merged[key] = merged[key] ? `${merged[key]},${LOCALHOST_NO_PROXY}` : LOCALHOST_NO_PROXY;
  }
  return merged;
}

const webServerEnv = withLocalhostBypass({
  ...(process.env as Record<string, string>),
  ...stubEnv,
  STUB_SUPABASE_PORT: String(STUB_SUPABASE_PORT),
});
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
    // Pre-seed a Clerk "dev browser" identity cookie (see the long comment
    // below) so no test's first navigation ever depends on reaching the
    // (fake) Clerk host.
    storageState: {
      cookies: [
        {
          name: '__clerk_db_jwt',
          value: 'e2e-stub-dev-browser-token',
          domain: '127.0.0.1',
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    },
    launchOptions: {
      // e2e containers/CI runners may run as root, where the Chromium
      // user-namespace sandbox can't start.
      chromiumSandbox: false,
      // Proxy-enabled hosts (this sandbox's HTTPS_PROXY; apparently some CI
      // runners too, per the ERR_NAME_NOT_RESOLVED-on-a-literal-IP failure
      // this config is fixing) make Chromium route 127.0.0.1 traffic through
      // the proxy. `--no-proxy-server` alone is NOT reliable for this on
      // Linux: Chromium's ProxyConfigServiceLinux falls back to reading
      // HTTP(S)_PROXY/NO_PROXY env vars directly and that has been observed
      // to win over the command-line switch for some navigations (verified
      // via chrome://net-export). Stripping the proxy env vars from the
      // browser process's own environment is what actually guarantees DIRECT
      // connections, so do both.
      args: ['--no-proxy-server'],
      env: Object.fromEntries(
        Object.entries(webServerEnv).filter(
          ([key]) => !/^(https?|all|ftp)_proxy$/i.test(key) && key !== 'NO_PROXY' && key !== 'no_proxy',
        ),
      ),
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
