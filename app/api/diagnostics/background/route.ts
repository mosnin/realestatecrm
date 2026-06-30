/**
 * GET /api/diagnostics/background — platform-admin-only infra readiness report.
 *
 * Admin-guarded: this names internal env var prerequisites and third-party
 * vendors (Modal, Inngest, Composio, the cron secret) — presence only, never
 * secret values, but still infrastructure detail that has no business being
 * visible to end users. requireAdmin() throws for non-admins, mirroring
 * app/api/admin/observability/route.ts.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getBackgroundReadiness } from '@/lib/diagnostics/background-readiness';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const report = await getBackgroundReadiness();
  return NextResponse.json(report);
}
