#!/usr/bin/env bash
#
# One-command deploy for the Chippi background worker.
#
#   cd worker && ./deploy.sh
#
# Creates the queues and KV namespace, wires the KV binding into
# wrangler.toml, prompts for the two secrets, deploys, and verifies the result.
# Safe to re-run: every step detects what already exists and skips it.
#
# Prerequisites:
#   - Cloudflare account on the Workers PAID plan ($5/mo — Queues requires it)
#   - pnpm install already run in this directory
#
set -euo pipefail

cyan() { printf '\033[36m%s\033[0m\n' "$1"; }
green() { printf '\033[32m✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[33m! %s\033[0m\n' "$1"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[ -f wrangler.toml ] || die "Run this from the worker/ directory."

WRANGLER="npx wrangler"

# ── 1. Auth ────────────────────────────────────────────────────────────────
cyan "1/6  Checking Cloudflare login…"
# `wrangler whoami` exits 0 even when NOT authenticated, so the exit code is
# useless — inspect the output instead. (This false-positived once and let the
# script run to a confusing failure two steps later.)
WHOAMI_OUT="$($WRANGLER whoami 2>&1 || true)"
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  green "Using CLOUDFLARE_API_TOKEN from the environment."
elif printf '%s' "$WHOAMI_OUT" | grep -qi 'not authenticated'; then
  warn "Not logged in — opening the browser to authorize. Click Allow."
  $WRANGLER login || die "Login failed. Alternatively set CLOUDFLARE_API_TOKEN and re-run."
  # Verify the login actually took.
  $WRANGLER whoami 2>&1 | grep -qi 'not authenticated' && die "Still not authenticated after login."
  green "Logged in."
else
  green "Already logged in:"
  printf '%s\n' "$WHOAMI_OUT" | grep -iE 'email|account' | head -2 || true
fi

# ── 2. Queues ──────────────────────────────────────────────────────────────
# `queues create` errors if the queue exists; that is a success for our
# purposes, so we tolerate it rather than aborting a re-run.
cyan "2/6  Creating queues…"
QUEUE_LIST="$($WRANGLER queues list 2>&1 || true)"
for q in chippi-jobs chippi-dlq; do
  if printf '%s' "$QUEUE_LIST" | grep -q "$q"; then
    green "Queue $q already exists."
  elif CREATE_OUT="$($WRANGLER queues create "$q" 2>&1)"; then
    green "Created queue $q"
  else
    # Do NOT mask the failure — a missing queue means nothing will run.
    printf '%s\n' "$CREATE_OUT" | tail -5
    die "Could not create queue $q. Usual causes: the account is not on the Workers Paid plan, or the API token lacks the Queues Edit permission."
  fi
done
# Verify both actually exist before continuing — deploying without them fails.
QUEUE_LIST="$($WRANGLER queues list 2>&1 || true)"
for q in chippi-jobs chippi-dlq; do
  printf '%s' "$QUEUE_LIST" | grep -q "$q" || die "Queue $q is not visible after creation — check plan and token permissions."
done
green "Both queues verified."

# ── 3. KV namespace for missed-tick recovery ───────────────────────────────
# Optional but recommended: without it a SKIPPED scheduled trigger is not
# recovered, only a late one.
cyan "3/6  Setting up the state KV namespace…"
if grep -q 'binding = "STATE"' wrangler.toml; then
  green "STATE binding already in wrangler.toml — skipping."
else
  KV_OUT="$($WRANGLER kv namespace create chippi-worker-state 2>&1 || true)"
  KV_ID="$(printf '%s' "$KV_OUT" | grep -oE '"?id"?[[:space:]]*[:=][[:space:]]*"[a-f0-9]{32}"' | grep -oE '[a-f0-9]{32}' | head -1)"
  if [ -n "$KV_ID" ]; then
    cat >> wrangler.toml <<EOF

[[kv_namespaces]]
binding = "STATE"
id = "$KV_ID"
EOF
    green "Created KV namespace and added the STATE binding to wrangler.toml."
  else
    warn "Could not create/parse the KV namespace. Continuing without it —"
    warn "delayed triggers still recover; skipped ones will not. Output was:"
    printf '%s\n' "$KV_OUT" | head -5
  fi
fi

# ── 4. Secrets ─────────────────────────────────────────────────────────────
cyan "4/6  Setting secrets…"
echo
echo "  CRON_SECRET must be the SAME value as in your Vercel project."
echo "  (Vercel → Settings → Environment Variables → CRON_SECRET → reveal)"
echo
read -r -s -p "  Paste CRON_SECRET: " CRON_VAL; echo
[ -n "$CRON_VAL" ] || die "CRON_SECRET cannot be empty."
printf '%s' "$CRON_VAL" | $WRANGLER secret put CRON_SECRET >/dev/null
green "CRON_SECRET set."

if [ -n "${WORKER_SECRET_VALUE:-}" ]; then
  WORKER_VAL="$WORKER_SECRET_VALUE"
else
  WORKER_VAL="$(openssl rand -hex 32)"
fi
printf '%s' "$WORKER_VAL" | $WRANGLER secret put WORKER_SECRET >/dev/null
green "WORKER_SECRET set."

# ── 5. Deploy ──────────────────────────────────────────────────────────────
cyan "5/6  Deploying…"
DEPLOY_OUT="$($WRANGLER deploy 2>&1)" || { printf '%s\n' "$DEPLOY_OUT"; die "Deploy failed."; }
printf '%s\n' "$DEPLOY_OUT" | tail -20
WORKER_URL="$(printf '%s' "$DEPLOY_OUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)"
[ -n "$WORKER_URL" ] || warn "Could not parse the worker URL — find it in the output above."

# ── 6. Verify ──────────────────────────────────────────────────────────────
cyan "6/6  Verifying…"
if [ -n "$WORKER_URL" ]; then
  sleep 3
  HEALTH="$(curl -fsS "$WORKER_URL/health" 2>/dev/null || echo '')"
  if printf '%s' "$HEALTH" | grep -q '"ok":true'; then
    green "Health check passed: $HEALTH"
  else
    warn "Health check did not return ok yet. Try again in a minute:"
    warn "  curl $WORKER_URL/health"
  fi
fi

echo
green "Worker deployed."
echo
cyan "NOW DO THIS — the worker is live but the app can't reach it yet:"
echo
echo "  Vercel → your project → Settings → Environment Variables"
echo "  Add BOTH, scoped to Production:"
echo
echo "    WORKER_URL      = ${WORKER_URL:-<the URL printed above>}"
echo "    WORKER_SECRET   = $WORKER_VAL"
echo
echo "  Then REDEPLOY Vercel (env vars only apply to new deployments)."
echo "  Then merge branch claude/dynamic-localized-pages-ubybuh."
echo
cyan "Watch it run:   npx wrangler tail"
cyan "Expect within 5 min:   'master tick … enqueued N/23 jobs'"
echo
warn "NEVER set INNGEST_CRONS_ENABLED while this worker is live — both would"
warn "run the same 23 jobs and every reminder would send twice."
