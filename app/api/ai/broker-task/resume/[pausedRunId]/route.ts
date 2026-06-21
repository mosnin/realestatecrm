/**
 * POST /api/ai/broker-task/resume/[pausedRunId]
 *
 * Broker chat approvals are intentionally not wired to the realtor resume
 * endpoint. Broker tools do not currently support paused approval resumes; this
 * route exists as an explicit fail-closed boundary so a broker UI prompt cannot
 * accidentally resume through `/api/ai/task/resume`, whose authorization model
 * is realtor-space based.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveBrokerContext } from '@/lib/agent/broker-context';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ pausedRunId: string }> },
) {
  const brokerCtx = await resolveBrokerContext();
  if (!brokerCtx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Consume params so Next validates the dynamic route contract, but do not
  // disclose whether any paused run id exists on another surface.
  await params;
  return NextResponse.json({ error: 'Broker resume is not available' }, { status: 404 });
}
