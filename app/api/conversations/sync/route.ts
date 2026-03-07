import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { listVapiCalls } from '@/lib/vapi';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const spaceId = request.nextUrl.searchParams.get('spaceId');
  if (!spaceId) {
    return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const space = await db.space.findFirst({
    where: { id: spaceId, ownerId: user.id },
  });
  if (!space) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agent = await db.vapiAgent.findUnique({ where: { spaceId } });
  if (!agent) {
    return NextResponse.json({ error: 'No agent configured' }, { status: 404 });
  }

  try {
    // Get the latest conversation timestamp to only fetch newer calls
    const latest = await db.conversation.findFirst({
      where: { spaceId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const calls = await listVapiCalls(agent.vapiAssistantId, {
      limit: 100,
      createdAtGt: latest?.createdAt.toISOString(),
    });

    let synced = 0;

    for (const call of calls) {
      const callType =
        call.type === 'inboundPhoneCall'
          ? 'VOICE_INBOUND'
          : call.type === 'outboundPhoneCall'
            ? 'VOICE_OUTBOUND'
            : 'VOICE_INBOUND';

      let durationSeconds: number | null = null;
      if (call.startedAt && call.endedAt) {
        durationSeconds = Math.round(
          (new Date(call.endedAt).getTime() -
            new Date(call.startedAt).getTime()) /
            1000
        );
      }

      const artifact = call.artifact;

      await db.conversation.upsert({
        where: { vapiCallId: call.id },
        create: {
          vapiCallId: call.id,
          spaceId,
          type: callType as 'VOICE_INBOUND' | 'VOICE_OUTBOUND' | 'SMS',
          status: call.status ?? 'ended',
          phone: call.customer?.number ?? null,
          startedAt: call.startedAt ? new Date(call.startedAt) : null,
          endedAt: call.endedAt ? new Date(call.endedAt) : null,
          durationSeconds,
          summary: call.analysis?.summary ?? null,
          transcript: artifact?.transcript ?? null,
          messages: artifact?.messages ? (artifact.messages as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          recordingUrl:
            artifact?.recordingUrl ?? artifact?.recording?.url ?? null,
          cost: call.costBreakdown?.total ?? null,
        },
        update: {
          status: call.status ?? 'ended',
          summary: call.analysis?.summary ?? null,
          transcript: artifact?.transcript ?? null,
          messages: artifact?.messages ? (artifact.messages as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          recordingUrl:
            artifact?.recordingUrl ?? artifact?.recording?.url ?? null,
          cost: call.costBreakdown?.total ?? null,
        },
      });
      synced++;
    }

    return NextResponse.json({ synced });
  } catch (error) {
    console.error('Conversation sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync conversations' },
      { status: 500 }
    );
  }
}
