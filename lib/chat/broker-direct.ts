/**
 * Broker direct path — the in-process fast lane for the brokerage chat.
 *
 * The broker chat used to send EVERY turn to Modal (cold start, the same
 * fragility the realtor chat was moved off of). Most broker questions are
 * read-only Q&A — "how's the team doing?", "how many leads are waiting?",
 * "what's our pipeline?" — which need no tools, just the brokerage's current
 * numbers. This answers those in-process, instantly, from a live snapshot.
 * Action turns (reassign, set a routing rule) still route to Modal, where the
 * BROKER_TOOLS catalog lives.
 *
 * Mirrors `lib/chat/direct-stream.ts` (the realtor direct path): same SSE
 * shape, same persistence + usage recording, just a brokerage-scoped context
 * block instead of per-space vector retrieval.
 */

import { logger } from '@/lib/logger';
import { saveAssistantMessage } from '@/lib/ai-tools/persistence';
import { chippiErrorMessage } from '@/lib/ai-tools/chippi-voice';
import { recordChatUsage } from '@/lib/usage/record-chat-usage';
import type { MessageBlock } from '@/lib/ai-tools/blocks';
import { runDirectChat, type DirectHistoryRow } from '@/lib/chat/direct-llm';
import { resolveChatModel } from '@/lib/llm';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { supabase } from '@/lib/supabase';
import { formatCompact } from '@/lib/formatting';

/** The brokerage chief-of-staff persona for the read-only fast path. */
const BROKER_INSTRUCTIONS_LITE = `
You are Chippi, the chief of staff for a real estate brokerage owner. A sharp
operator who already knows their team's book of business. Never apologise for
being software, never say "as an AI."

# What you can do here
This is the fast Q&A surface. You answer the broker's questions about the whole
brokerage using the live snapshot below: team size, pipeline, leads waiting,
won deals. You do NOT take actions here, no routing, no reassigning, no sending.
If the broker asks you to DO something (reassign a lead, set a routing rule,
draft and send), say so plainly so they can phrase it as a request and the
action path picks it up.

# Output
Lead with the answer. Short for simple, structured for synthesis. No hedging,
no emoji, no exclamation, no narration. Name the numbers from the snapshot
verbatim. If the snapshot does not cover something, say you do not have it here
and point them at the relevant page (Realtors, Deals, Forecast, Retention).
`.trim();

interface BrokerDirectInput {
  brokerage: { id: string; name: string; ownerId: string };
  persistenceSpaceId: string;
  userId: string | null;
  conversationId: string;
  userMessage: string;
  history: DirectHistoryRow[];
  model?: string;
  abortController: AbortController;
}

/** Aggregate the brokerage's current numbers into a compact context block the
 *  direct LLM can answer from. Cheap, parallel counts across member spaces. */
async function buildBrokerageSnapshot(brokerage: { id: string; name: string; ownerId: string }): Promise<string> {
  const members = await getBrokerageMembers(brokerage.id, { includeSpaceName: true });
  const spaceIds = members.map((m) => m.Space?.id).filter((id): id is string => Boolean(id));
  const realtorCount = members.filter((m) => m.role === 'realtor_member').length;
  if (spaceIds.length === 0) {
    return `Brokerage snapshot (${brokerage.name}):\n- Realtors: ${realtorCount}\n- No member workspaces with data yet.`;
  }

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();

  const [activeDeals, wonDeals, waitingLeads] = await Promise.all([
    // Limit matches the broker dashboard (app/broker/realtors/page.tsx) so the
    // two surfaces report the same totals for a large brokerage.
    supabase.from('Deal').select('value').in('spaceId', spaceIds).eq('status', 'active').limit(10000),
    supabase.from('Deal').select('value, updatedAt').in('spaceId', spaceIds).eq('status', 'won').gte('updatedAt', monthStart).limit(10000),
    supabase
      .from('Contact')
      .select('id', { count: 'exact', head: true })
      .in('spaceId', spaceIds)
      .contains('tags', ['assigned-by-broker'])
      .is('lastContactedAt', null),
  ]);

  // A failed query must NOT degrade to a confident "0". When a metric errors we
  // omit it and note it could not be loaded, so the persona hedges instead of
  // stating a fabricated zero.
  const lines = [
    `Brokerage snapshot (${brokerage.name}), as of now:`,
    `- Realtors on the team: ${realtorCount}`,
  ];

  if (activeDeals.error) {
    logger.warn('[broker-direct] active deals query failed', { brokerageId: brokerage.id }, activeDeals.error);
    lines.push(`- Active deals: (could not load)`);
  } else {
    const active = (activeDeals.data ?? []) as { value: number | null }[];
    const activeValue = active.reduce((s, d) => s + (d.value ?? 0), 0);
    lines.push(`- Active deals: ${active.length} worth $${formatCompact(activeValue)} in pipeline`);
  }

  if (wonDeals.error) {
    logger.warn('[broker-direct] won deals query failed', { brokerageId: brokerage.id }, wonDeals.error);
    lines.push(`- Won this month: (could not load)`);
  } else {
    const won = (wonDeals.data ?? []) as { value: number | null }[];
    const wonValue = won.reduce((s, d) => s + (d.value ?? 0), 0);
    lines.push(`- Won this month: ${won.length} worth $${formatCompact(wonValue)}`);
  }

  if (waitingLeads.error) {
    logger.warn('[broker-direct] waiting leads query failed', { brokerageId: brokerage.id }, waitingLeads.error);
    lines.push(`- Leads routed but not yet contacted (waiting on a first response): (could not load)`);
  } else {
    lines.push(`- Leads routed but not yet contacted (waiting on a first response): ${waitingLeads.count ?? 0}`);
  }

  return lines.join('\n');
}

interface SseEvent {
  type: 'text_delta' | 'turn_complete' | 'error' | 'route_picked';
  [k: string]: unknown;
}

/**
 * Stream a broker Q&A turn in-process. Same SSE protocol as the realtor direct
 * path, so the broker chat client needs no changes.
 */
export function streamBrokerDirectTurn(input: BrokerDirectInput): Response {
  const encoder = new TextEncoder();
  let seq = 0;
  const frame = (e: SseEvent) =>
    `data: ${JSON.stringify({ seq: seq++, ts: new Date().toISOString(), ...e })}\n\n`;

  const model = resolveChatModel(input.model);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (e: SseEvent) => {
        try { controller.enqueue(encoder.encode(frame(e))); } catch { /* closed */ }
      };

      push({ type: 'route_picked', route: 'direct' });

      try {
        const snapshot = await buildBrokerageSnapshot(input.brokerage);
        const systemMessage = `${BROKER_INSTRUCTIONS_LITE}\n\n${snapshot}`;

        const result = await runDirectChat({
          model,
          systemMessage,
          history: input.history,
          userMessage: input.userMessage,
          signal: input.abortController.signal,
        });

        if (result.text) push({ type: 'text_delta', delta: result.text });
        push({ type: 'turn_complete', reason: 'complete' });

        if (result.text.trim()) {
          const blocks: MessageBlock[] = [{ type: 'text', content: result.text }];
          try {
            await saveAssistantMessage({ spaceId: input.persistenceSpaceId, conversationId: input.conversationId, blocks });
          } catch (err) {
            logger.warn('[broker-direct] save assistant message failed', { brokerageId: input.brokerage.id }, err);
          }
        }
        void recordChatUsage({
          spaceId: input.persistenceSpaceId,
          userId: input.userId,
          conversationId: input.conversationId,
          model,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          cachedTokens: result.usage.cachedTokens,
          route: 'direct',
          runtime: 'ts',
        }).catch(() => {});
      } catch (err) {
        const aborted = (err as { name?: string })?.name === 'AbortError';
        if (!aborted) {
          logger.error('[broker-direct] crashed', { brokerageId: input.brokerage.id }, err);
          push({ type: 'error', message: chippiErrorMessage('internal') });
        }
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      input.abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
