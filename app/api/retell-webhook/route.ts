import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyWebhookSignature } from '@/lib/retell';
import type { RetellWebhookPayload } from '@/lib/types/retell';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-retell-signature') ?? '';

    // Verify webhook signature
    const apiKey = process.env.RETELL_API_KEY;
    if (!apiKey) {
      console.error('RETELL_API_KEY not configured');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    if (!verifyWebhookSignature(rawBody, signature, apiKey)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload: RetellWebhookPayload = JSON.parse(rawBody);

    // Only process call_analyzed events (contains post-call analysis data)
    if (payload.event !== 'call_analyzed') {
      return NextResponse.json({ received: true });
    }

    const { call } = payload;

    // Look up the agent to find the space (multi-tenant mapping)
    const agent = await db.retellAgent.findUnique({
      where: { retellAgentId: call.agent_id },
    });

    if (!agent) {
      console.error(`No agent found for retell agent_id: ${call.agent_id}`);
      return NextResponse.json(
        { error: 'Unknown agent' },
        { status: 404 }
      );
    }

    // Extract analysis data from post-call analysis
    const analysis = call.call_analysis?.custom_analysis_data ?? {};
    const rawScore = (analysis.lead_score as string)?.toUpperCase() ?? 'COLD';
    const score = (['HOT', 'WARM', 'COLD'].includes(rawScore) ? rawScore : 'COLD') as 'HOT' | 'WARM' | 'COLD';

    const rawIntent = (analysis.intent as string)?.toUpperCase() ?? null;
    const intent = rawIntent && ['BUYER', 'SELLER', 'BOTH'].includes(rawIntent)
      ? (rawIntent as 'BUYER' | 'SELLER' | 'BOTH')
      : null;

    const preferredAreas = (analysis.preferred_areas as string)
      ?.split(',')
      .map((a: string) => a.trim())
      .filter(Boolean) ?? [];

    // Build transcript summary from transcript object
    const transcriptSummary =
      call.call_analysis?.call_summary ??
      call.transcript_object
        ?.slice(0, 6)
        .map((t) => `${t.role}: ${t.content}`)
        .join('\n') ??
      null;

    // Upsert lead (idempotent on call_id)
    await db.lead.upsert({
      where: { callId: call.call_id },
      create: {
        spaceId: agent.spaceId,
        callId: call.call_id,
        phone: call.from_number,
        score,
        intent,
        budget: (analysis.budget as string) ?? null,
        timeline: (analysis.timeline as string) ?? null,
        preferredAreas,
        preApproved: (analysis.pre_approved as boolean) ?? false,
        transcriptSummary,
        transcript: call.transcript ?? null,
        recordingUrl: call.recording_url ?? null,
        callDuration: call.duration_ms
          ? Math.round(call.duration_ms / 1000)
          : null,
      },
      update: {
        score,
        intent,
        budget: (analysis.budget as string) ?? null,
        timeline: (analysis.timeline as string) ?? null,
        preferredAreas,
        preApproved: (analysis.pre_approved as boolean) ?? false,
        transcriptSummary,
        transcript: call.transcript ?? null,
        recordingUrl: call.recording_url ?? null,
        callDuration: call.duration_ms
          ? Math.round(call.duration_ms / 1000)
          : null,
      },
    });

    return NextResponse.json({ received: true, lead_score: score });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
