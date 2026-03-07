import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';
import type { RetellWebhookPayload, RetellCustomAnalysisData } from '@/lib/types';

// Retell signs POST bodies with HMAC-SHA256 using your API key.
// Header: x-retell-signature
function verifyRetellSignature(body: string, signature: string): boolean {
  const secret = process.env.RETELL_API_KEY ?? '';
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

// Next.js 15 App Router: disable body auto-parsing so we can read raw bytes
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-retell-signature') ?? '';

  if (!verifyRetellSignature(rawBody, signature)) {
    console.warn('[retell-webhook] Invalid signature');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: RetellWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Only process analyzed calls — this is when lead data is ready
  if (payload.event !== 'call_analyzed') {
    return NextResponse.json({ ok: true });
  }

  const { call } = payload;

  // Resolve the space via the agent_id stored in our RetellAgent table
  const agentRecord = await db.retellAgent.findFirst({
    where: { retellAgentId: call.agent_id }
  });

  if (!agentRecord) {
    console.warn(`[retell-webhook] No agent record found for agent_id: ${call.agent_id}`);
    return NextResponse.json({ error: 'Agent not registered' }, { status: 404 });
  }

  const analysis = call.call_analysis?.custom_analysis_data as RetellCustomAnalysisData | undefined;
  const rawScore = analysis?.score?.toUpperCase();
  const rawIntent = analysis?.intent?.toUpperCase();

  const score =
    rawScore === 'HOT' ? 'HOT' :
    rawScore === 'WARM' ? 'WARM' : 'COLD';

  const intent =
    rawIntent === 'BUYER' ? 'BUYER' :
    rawIntent === 'SELLER' ? 'SELLER' : 'UNKNOWN';

  try {
    await db.lead.upsert({
      where: { callId: call.call_id },
      create: {
        callId: call.call_id,
        spaceId: agentRecord.spaceId,
        phone: call.from_number ?? 'Unknown',
        score,
        intent,
        budget: analysis?.budget ?? null,
        timeline: analysis?.timeline ?? null,
        preferredAreas: analysis?.preferredAreas ?? null,
        transcriptSummary: call.call_analysis?.call_summary ?? null,
        transcript: call.transcript ?? null
      },
      update: {
        score,
        intent,
        budget: analysis?.budget ?? null,
        timeline: analysis?.timeline ?? null,
        preferredAreas: analysis?.preferredAreas ?? null,
        transcriptSummary: call.call_analysis?.call_summary ?? null,
        transcript: call.transcript ?? null
      }
    });

    // Mark agent as active on first successful lead ingestion
    if (agentRecord.status !== 'ACTIVE') {
      await db.retellAgent.update({
        where: { id: agentRecord.id },
        data: { status: 'ACTIVE' }
      });
    }
  } catch (err) {
    console.error('[retell-webhook] DB upsert error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
