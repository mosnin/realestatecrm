/**
 * Telnyx Voice (Call Control) webhook — public, no Clerk.
 *
 * Telnyx POSTs call-control events here as the call moves through its lifecycle.
 * We handle:
 *   - call.initiated        → mark ringing
 *   - call.answered         → (agent leg) bridge to the contact + start recording
 *   - call.bridged          → mark answered
 *   - call.hangup           → mark completed/failed/no_answer + duration
 *   - call.recording.saved  → download, transcribe, Chippi-summarize, persist
 *
 * Auth: this is a machine-to-machine webhook, so there's no Clerk session.
 * Primary gate is Telnyx Ed25519 signature verification (TELNYX_PUBLIC_KEY,
 * base64, from Mission Control) over the raw body + timestamp — same strength
 * as the Stripe webhook's signature check, with built-in 5-minute replay
 * protection. A legacy shared-secret query param (?secret=TELNYX_WEBHOOK_SECRET)
 * is still honored as a second factor when configured.
 *
 * Idempotency: Telnyx retries on non-200, so we dedup by event id via Redis,
 * mirroring the Stripe webhook (lib/redis no-op proxy → best-effort when Redis
 * is absent). Already-processed events are skipped.
 *
 * This route NEVER throws and ALWAYS returns 200 — a non-200 makes Telnyx retry
 * the event, which would compound any transient failure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { verifyTelnyxSignature } from '@/lib/telnyx-webhook';
import {
  bridgeAndRecord,
  decodeClientState,
  downloadRecording,
  encodeClientState,
} from '@/lib/voice';
import { getLLMClient } from '@/lib/llm';
import OpenAI from 'openai';
import { unscoped } from '@/lib/supabase-guard';


export const runtime = 'nodejs';

const ok = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  // Read the raw body ONCE — Ed25519 verification must run over the exact bytes
  // Telnyx signed; re-serializing parsed JSON would not match the signature.
  const rawBody = await req.text();

  // ── Auth: Ed25519 signature (primary) ──────────────────────────────────────
  const sigResult = await verifyTelnyxSignature(rawBody, req.headers);
  if (sigResult === 'invalid') {
    logger.warn('[telnyx-voice] rejected — bad/missing signature');
    // Still 200 so a probe can't distinguish a bad signature from a bad route.
    return ok();
  }
  if (sigResult === 'unconfigured') {
    // No public key set (e.g. preview without Telnyx). Fall through to the
    // shared-secret gate so the route still has *a* gate when configured — but
    // if NO shared secret is set either, the route would be a fully anonymous
    // endpoint that writes CallLog rows and fetches attacker-supplied recording
    // URLs. Fail CLOSED in that case, matching the Stripe/Clerk/Composio
    // webhooks which reject when their secret is missing.
    if (!process.env.TELNYX_WEBHOOK_SECRET) {
      logger.error(
        '[telnyx-voice] rejected — neither TELNYX_PUBLIC_KEY nor TELNYX_WEBHOOK_SECRET is configured; refusing to process an unauthenticated webhook',
      );
      return ok();
    }
    logger.warn('[telnyx-voice] TELNYX_PUBLIC_KEY unset — relying on shared-secret gate');
  }

  // ── Auth: legacy shared-secret gate (second factor when configured) ─────────
  const expected = process.env.TELNYX_WEBHOOK_SECRET;
  if (expected) {
    const provided = req.nextUrl.searchParams.get('secret');
    if (provided !== expected) {
      logger.warn('[telnyx-voice] rejected — bad secret');
      return ok();
    }
  }

  let event: any;
  try {
    event = rawBody ? JSON.parse(rawBody) : {};
    event = event?.data ?? event;
  } catch {
    logger.warn('[telnyx-voice] unparseable body');
    return ok();
  }

  // ── Idempotency: dedup by Telnyx event id (mirrors Stripe webhook) ──────────
  const eventId: string | undefined = event?.id;
  if (eventId) {
    const eventKey = `telnyx:event:${eventId}`;
    try {
      const alreadyProcessed = await redis.get(eventKey);
      if (alreadyProcessed) {
        logger.info('[telnyx-voice] duplicate event skipped', { eventId });
        return ok();
      }
      await redis.set(eventKey, '1', { ex: 86400 }); // Expire after 24h
    } catch {
      // Redis unavailable — proceed anyway (best-effort dedup).
    }
  }

  const eventType: string | undefined = event?.event_type ?? event?.record_type;
  const payload = event?.payload ?? {};
  const callControlId: string | undefined = payload?.call_control_id;
  const clientState = decodeClientState(payload?.client_state);

  try {
    switch (eventType) {
      case 'call.initiated':
        await updateByCallId(callControlId, { status: 'ringing' });
        break;

      case 'call.answered':
        // The agent leg answered. Bridge to the contact and start recording.
        // We only bridge if client_state carries a bridgeTo target (i.e. this is
        // the outbound agent leg we created, not the contact leg we transferred).
        if (callControlId && clientState.bridgeTo) {
          await updateByCallId(callControlId, { status: 'answered' });
          await bridgeAndRecord(
            callControlId,
            clientState.bridgeTo,
            // Forward state minus bridgeTo so the contact leg doesn't re-bridge.
            encodeClientState({ spaceId: clientState.spaceId, contactId: clientState.contactId }),
          );
        }
        break;

      case 'call.bridged':
        await updateByCallId(callControlId, { status: 'answered' });
        break;

      case 'call.hangup': {
        const cause: string | undefined = payload?.hangup_cause;
        const durationSec = parseDuration(payload);
        const status =
          cause === 'normal_clearing' || cause === 'originator_cancel'
            ? 'completed'
            : cause === 'user_busy' || cause === 'no_answer' || cause === 'timeout'
              ? 'no_answer'
              : 'failed';
        await updateByCallId(callControlId, {
          status: durationSec && durationSec > 0 ? 'completed' : status,
          durationSec: durationSec ?? undefined,
        });
        break;
      }

      case 'call.recording.saved':
        await handleRecordingSaved(callControlId, payload);
        break;

      default:
        // Unhandled event types are fine — Telnyx sends many we don't care about.
        break;
    }
  } catch (err) {
    // Never let a handler error escape — Telnyx would retry the event.
    logger.error('[telnyx-voice] handler error', { eventType }, err);
  }

  return ok();
}

// ── DB helpers ──────────────────────────────────────────────────────────────

async function updateByCallId(
  callControlId: string | undefined,
  fields: Record<string, unknown>,
): Promise<void> {
  if (!callControlId) return;
  const { error } = await unscoped(supabase
    .from('CallLog'), 'webhook: lookup by provider id then verify')
    .update({ ...fields, updatedAt: new Date().toISOString() })
    .eq('telnyxCallId', callControlId);
  if (error) {
    logger.error('[telnyx-voice] update failed', { err: error.message });
  }
}

function parseDuration(payload: any): number | null {
  // Telnyx sends start/end timestamps on hangup; derive seconds from them.
  const start = payload?.start_time ? Date.parse(payload.start_time) : NaN;
  const end = payload?.end_time ? Date.parse(payload.end_time) : NaN;
  if (!isNaN(start) && !isNaN(end) && end >= start) {
    return Math.round((end - start) / 1000);
  }
  const direct = payload?.call_duration_secs ?? payload?.duration_secs;
  return typeof direct === 'number' ? direct : null;
}

// ── Recording → transcript → Chippi summary ─────────────────────────────────

async function handleRecordingSaved(
  callControlId: string | undefined,
  payload: any,
): Promise<void> {
  // Telnyx surfaces the recording URLs under recording_urls / public_recording_urls.
  const recordingUrl: string | undefined =
    payload?.recording_urls?.mp3 ??
    payload?.recording_urls?.wav ??
    payload?.public_recording_urls?.mp3 ??
    payload?.public_recording_urls?.wav;

  if (!recordingUrl) {
    logger.warn('[telnyx-voice] recording.saved with no URL', { callControlId });
    return;
  }

  // Persist the URL immediately so it's available even if transcription fails.
  await updateByCallId(callControlId, { recordingUrl });

  // Transcribe via Whisper (needs OPENAI_API_KEY). Gate cleanly when absent.
  let transcript: string | null = null;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const file = await downloadRecording(recordingUrl);
    if (file && file.size <= 25 * 1024 * 1024) {
      try {
        const openai = new OpenAI({ apiKey: openaiKey });
        const result = await openai.audio.transcriptions.create({
          file,
          model: 'whisper-1',
          response_format: 'text',
        });
        transcript = typeof result === 'string' ? result.trim() : null;
      } catch (err) {
        logger.error('[telnyx-voice] transcription failed', { callControlId }, err);
      }
    }
  } else {
    logger.warn('[telnyx-voice] OPENAI_API_KEY missing — skipping transcription');
  }

  if (!transcript) {
    await updateByCallId(callControlId, { recordingUrl });
    return;
  }

  // Chippi summary — 2-3 sentences. Gate on any LLM key being present.
  let summary: string | null = null;
  try {
    const client = getLLMClient();
    const completion = await client.chat.completions.create({
      model: 'qwen/qwen3.7-plus',
      temperature: 0.2,
      max_tokens: 180,
      messages: [
        {
          role: 'system',
          content:
            'You are Chippi, a real-estate CRM assistant. Summarize this phone-call ' +
            'transcript for the agent in 2-3 plain sentences: what was discussed, any ' +
            'commitments, and the next step. Be specific and factual. No preamble.',
        },
        { role: 'user', content: `Call transcript:\n"""\n${transcript}\n"""` },
      ],
    });
    summary = completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    logger.error('[telnyx-voice] summary failed', { callControlId }, err);
  }

  await updateByCallId(callControlId, {
    recordingUrl,
    transcript,
    ...(summary ? { summary } : {}),
  });
  logger.info('[telnyx-voice] recording processed', {
    callControlId,
    hasTranscript: Boolean(transcript),
    hasSummary: Boolean(summary),
  });
}
