import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { VapiWebhookPayload } from '@/lib/types/vapi';

export async function POST(request: NextRequest) {
  try {
    const payload: VapiWebhookPayload = await request.json();
    const { message } = payload;

    // Only process end-of-call-report events
    if (message.type !== 'end-of-call-report') {
      return NextResponse.json({ received: true });
    }

    const call = message.call;
    if (!call?.assistantId || !call.id) {
      console.error('Webhook missing call data');
      return NextResponse.json({ error: 'Missing call data' }, { status: 400 });
    }

    // Look up agent by Vapi assistant ID (multi-tenant mapping)
    const agent = await db.vapiAgent.findUnique({
      where: { vapiAssistantId: call.assistantId },
    });

    if (!agent) {
      console.error(`No agent found for Vapi assistantId: ${call.assistantId}`);
      return NextResponse.json({ error: 'Unknown agent' }, { status: 404 });
    }

    // Extract analysis data
    const analysis = message.analysis?.structuredData ?? call.analysis?.structuredData ?? {};
    const summary = message.analysis?.summary ?? call.analysis?.summary ?? null;

    const rawScore = (analysis.lead_score as string)?.toUpperCase() ?? 'COLD';
    const score = (['HOT', 'WARM', 'COLD'].includes(rawScore) ? rawScore : 'COLD') as
      | 'HOT'
      | 'WARM'
      | 'COLD';

    const rawIntent = (analysis.intent as string)?.toUpperCase() ?? null;
    const intent =
      rawIntent && ['BUYER', 'SELLER', 'BOTH'].includes(rawIntent)
        ? (rawIntent as 'BUYER' | 'SELLER' | 'BOTH')
        : null;

    const preferredAreas =
      (analysis.preferred_areas as string)
        ?.split(',')
        .map((a: string) => a.trim())
        .filter(Boolean) ?? [];

    // Determine call type
    const callType =
      call.type === 'inboundPhoneCall'
        ? 'VOICE_INBOUND'
        : call.type === 'outboundPhoneCall'
          ? 'VOICE_OUTBOUND'
          : 'VOICE_INBOUND';

    const callerPhone = call.customer?.number ?? '';
    const artifact = message.artifact ?? call.artifact;
    const transcript = artifact?.transcript ?? null;
    const messages = artifact?.messages ?? null;
    const recordingUrl = artifact?.recordingUrl ?? artifact?.recording?.url ?? null;

    // Calculate duration
    let durationSeconds: number | null = null;
    if (call.startedAt && call.endedAt) {
      durationSeconds = Math.round(
        (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
      );
    }

    // Upsert Lead record
    const leadData = {
      spaceId: agent.spaceId,
      phone: callerPhone,
      score,
      intent,
      budget: (analysis.budget as string) ?? null,
      timeline: (analysis.timeline as string) ?? null,
      preferredAreas,
      preApproved: (analysis.pre_approved as boolean) ?? false,
      transcriptSummary: summary,
      transcript,
      recordingUrl,
      callDuration: durationSeconds,
    };

    await db.lead.upsert({
      where: { callId: call.id },
      create: { callId: call.id, ...leadData },
      update: leadData,
    });

    // Upsert Conversation record
    const conversationData = {
      spaceId: agent.spaceId,
      type: callType as 'VOICE_INBOUND' | 'VOICE_OUTBOUND' | 'SMS',
      status: call.status ?? 'ended',
      phone: callerPhone,
      startedAt: call.startedAt ? new Date(call.startedAt) : null,
      endedAt: call.endedAt ? new Date(call.endedAt) : null,
      durationSeconds,
      summary,
      transcript,
      messages: messages ? (messages as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      recordingUrl,
      cost: call.costBreakdown?.total ?? null,
    };

    await db.conversation.upsert({
      where: { vapiCallId: call.id },
      create: { vapiCallId: call.id, ...conversationData },
      update: conversationData,
    });

    return NextResponse.json({ received: true, lead_score: score });
  } catch (error) {
    console.error('Vapi webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
