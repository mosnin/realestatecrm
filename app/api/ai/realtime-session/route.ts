import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  realtimeVoiceGatewayEnabled,
  realtimeVoiceGatewayReady,
} from '@/lib/realtime/voice-feature';
import { buildVoiceRealtimeSessionConfig, failClosedVoiceWorkspaceContinuationEligibility } from '@/lib/realtime/voice-delegation';
import { supabase } from '@/lib/supabase';
import { isRealtorConversation } from '@/lib/chat/conversation-access';
import { isConversationWorkspaceContinuationEligible } from '@/lib/workspace-runs/conversation-continuation';
import { logger } from '@/lib/logger';
import { isRealtimeVoiceFloorManagerEnabled } from '@/lib/realtime/floor-manager-flag';

export const runtime = 'nodejs';

const MAX_SDP_BYTES = 200_000;

/**
 * POST /api/ai/realtime-session?slug=...&conversationId=...
 *
 * Unified WebRTC gateway: the browser sends its SDP offer to Chippi; Chippi
 * creates the OpenAI Realtime call with the server credential and returns
 * only the SDP answer. No standard or ephemeral provider credential crosses
 * into browser JavaScript.
 */
export async function POST(req: Request) {
  if (!realtimeVoiceGatewayEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!realtimeVoiceGatewayReady()) {
    return NextResponse.json({ error: 'Voice mode is not configured.' }, { status: 503 });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get('slug')?.trim() ?? '';
  const conversationId = url.searchParams.get('conversationId')?.trim() ?? '';
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;

  let attachedConversationId: string | null = null;
  if (conversationId) {
    const { data, error } = await supabase
      .from('Conversation')
      .select('id, spaceId, title')
      .eq('id', conversationId)
      .eq('spaceId', auth.space.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'Could not verify conversation.' }, { status: 500 });
    if (!isRealtorConversation(data, auth.space.id)) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    }
    attachedConversationId = conversationId;
  }
  const workspaceContinuationEligible = await failClosedVoiceWorkspaceContinuationEligibility(
    () => isConversationWorkspaceContinuationEligible(auth.space.id, attachedConversationId),
    (error) => logger.warn('[realtime-session] workspace continuation eligibility unavailable', {
      spaceId: auth.space.id,
      conversationId: attachedConversationId,
    }, error),
  );

  const { allowed } = await checkRateLimit(`realtime:session:${auth.userId}`, 6, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many voice sessions. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const offer = await req.text();
  if (!offer.trim().startsWith('v=0') || Buffer.byteLength(offer, 'utf8') > MAX_SDP_BYTES) {
    return NextResponse.json({ error: 'Invalid WebRTC offer.' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Voice mode is not configured.' }, { status: 503 });
  }

  const form = new FormData();
  form.set('sdp', offer);
  form.set(
    'session',
    JSON.stringify(
      buildVoiceRealtimeSessionConfig({
        workspaceName: auth.space.name,
        conversationAttached: Boolean(attachedConversationId),
        workspaceContinuationEligible,
        floorManagerEligible: Boolean(attachedConversationId) && isRealtimeVoiceFloorManagerEnabled(),
      }),
    ),
  );

  try {
    const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Safety-Identifier': crypto
          .createHash('sha256')
          .update(`chippi:${auth.userId}`)
          .digest('hex'),
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    const answer = await upstream.text();
    if (!upstream.ok || !answer.trim().startsWith('v=0')) {
      console.error('[realtime-session] Realtime call creation failed', {
        status: upstream.status,
      });
      return NextResponse.json({ error: 'Could not start voice mode.' }, { status: 502 });
    }

    const headers = new Headers({
      'Content-Type': 'application/sdp',
      'Cache-Control': 'no-store',
    });
    const location = upstream.headers.get('Location');
    if (location) {
      const callId = location.split('/').filter(Boolean).pop();
      if (callId) headers.set('X-Chippi-Realtime-Call-Id', callId);
    }
    return new Response(answer, { status: 200, headers });
  } catch (error) {
    console.error('[realtime-session] Realtime gateway error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Could not start voice mode.' }, { status: 502 });
  }
}
