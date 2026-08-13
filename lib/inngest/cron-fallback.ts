/**
 * Inngest cron mirrors are an emergency scheduler, never a second active rail.
 * Only the exact value `1` enables them, and a configured Cloudflare Worker
 * always remains authoritative.
 */
export function inngestCronFallbackEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const requested = env.INNGEST_CRONS_ENABLED?.trim() === '1';
  const cloudflareConfigured = Boolean(
    env.WORKER_URL?.trim() && env.WORKER_SECRET?.trim(),
  );
  return requested && !cloudflareConfigured;
}
