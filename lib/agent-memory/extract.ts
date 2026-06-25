/**
 * Automatic memory extraction (P3).
 *
 * Until now Chippi only remembered something when the model chose to call a
 * `store_memory` tool — so most conversations persisted nothing, and Chippi
 * forgot durable facts the realtor had already told it. This distills the
 * lasting facts/preferences out of a finished exchange and writes them to
 * AgentMemory, so the next conversation already knows them.
 *
 * Hooked from saveAssistantMessage (lib/ai-tools/persistence.ts) via `after()`
 * so it runs AFTER the reply is streamed — it never adds latency to the turn.
 *
 * Conservative by design:
 *   - only PERSISTENT facts/preferences (not one-off task requests),
 *   - deduped against existing memories by semantic similarity so the Memory
 *     list doesn't fill with near-duplicates,
 *   - capped per turn,
 *   - best-effort: every failure is swallowed, never thrown into the chat path.
 *
 * Extracted memories are space-scoped and show up in the realtor's Memory list,
 * where they can delete anything wrong — a visible correction loop.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getOpenAIClient } from '@/lib/ai-tools/openai-client';
import { recallMemory, storeMemory } from '@/lib/agent-memory/store';
import type { MemoryKind } from '@/lib/agent-memory/types';

const MODEL = 'gpt-5-mini';
const MIN_USER_CHARS = 15; // below this the turn is too thin to hold a durable fact
const MAX_PER_TURN = 3;
/** Cosine similarity at/above which a candidate is treated as already-known. */
const DEDUP_SIMILARITY = 0.9;

export interface ExtractionCandidate {
  content: string;
  kind: MemoryKind; // narrowed to 'fact' | 'preference' in practice
  importance: number;
}

const EXTRACT_SYSTEM_PROMPT = [
  'You pull DURABLE facts and preferences about a real estate agent (the user) out of a chat exchange,',
  'so an AI teammate can remember them months later.',
  '',
  'Return a JSON object: {"memories": [{"content": string, "kind": "fact" | "preference", "importance": number}]}.',
  '',
  'Rules:',
  '- Keep ONLY things still true and useful in six months: who they are, their market and focus, how they work,',
  '  standing preferences and instructions, and durable facts about their business or key people.',
  '- DROP one-off task requests, questions, greetings, chit-chat, and anything ephemeral.',
  '- Write each memory as a standalone third-person statement, e.g. "Works mainly with first-time buyers in Austin"',
  '  or "Prefers texting clients over email".',
  '- importance is 0 to 1 (0.8 for core identity/standing rules, 0.4 for minor preferences).',
  '- At most 3. If nothing is worth remembering, return {"memories": []}.',
  '- Never use an em dash.',
].join('\n');

/** Parse + sanitize the model output into safe candidates. Tolerant of junk. */
export function parseCandidates(raw: string): ExtractionCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = (parsed as { memories?: unknown })?.memories;
  if (!Array.isArray(list)) return [];

  const out: ExtractionCandidate[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const content = typeof r.content === 'string' ? r.content.trim() : '';
    if (content.length < 3 || content.length > 400) continue;
    const kind: MemoryKind = r.kind === 'preference' ? 'preference' : 'fact';
    let importance = typeof r.importance === 'number' ? r.importance : 0.5;
    if (!Number.isFinite(importance)) importance = 0.5;
    importance = Math.max(0, Math.min(1, importance));
    out.push({ content, kind, importance });
    if (out.length >= MAX_PER_TURN) break;
  }
  return out;
}

async function distill(userMessage: string, assistantMessage: string): Promise<ExtractionCandidate[]> {
  let client;
  try {
    ({ client } = getOpenAIClient());
  } catch {
    return []; // no key configured — extraction is a best-effort enhancement
  }
  const exchange = `User: ${userMessage}\n\nAssistant: ${assistantMessage}`.slice(0, 6000);
  try {
    const result = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
        { role: 'user', content: exchange },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 400,
    });
    return parseCandidates(result.choices[0]?.message?.content ?? '');
  } catch (err) {
    logger.warn('[memory-extract] distill failed', undefined, err);
    return [];
  }
}

/**
 * Store the candidates that aren't already known. A candidate is "known" when
 * an existing memory sits at or above DEDUP_SIMILARITY. Returns how many were
 * newly stored.
 */
export async function storeNovelCandidates(
  spaceId: string,
  candidates: ExtractionCandidate[],
): Promise<number> {
  let stored = 0;
  for (const c of candidates) {
    try {
      const existing = await recallMemory({ spaceId, query: c.content, k: 1, minSimilarity: 0 });
      const top = existing[0];
      if (top && typeof top.similarity === 'number' && top.similarity >= DEDUP_SIMILARITY) {
        continue; // already remembered something equivalent
      }
      await storeMemory({ spaceId, kind: c.kind, content: c.content, importance: c.importance });
      stored += 1;
    } catch (err) {
      logger.warn('[memory-extract] store candidate failed', { spaceId }, err);
    }
  }
  return stored;
}

/** The latest user message and assistant reply for a conversation. */
async function loadLatestExchange(
  spaceId: string,
  conversationId: string,
): Promise<{ user: string; assistant: string } | null> {
  const { data, error } = await supabase
    .from('Message')
    .select('role, content, createdAt')
    .eq('spaceId', spaceId)
    .eq('conversationId', conversationId)
    .order('createdAt', { ascending: false })
    .limit(6);
  if (error || !data) return null;

  const rows = data as Array<{ role: string; content: string | null }>;
  const assistant = rows.find((r) => r.role === 'assistant' && (r.content ?? '').trim())?.content ?? '';
  const user = rows.find((r) => r.role === 'user' && (r.content ?? '').trim())?.content ?? '';
  if (!user.trim() || !assistant.trim()) return null;
  return { user: user.trim(), assistant: assistant.trim() };
}

/**
 * Entry point — hooked after an assistant message is persisted. Reads the
 * just-saved exchange, distills durable memories, and stores the novel ones.
 * Never throws.
 */
export async function extractConversationMemories(args: {
  spaceId: string;
  conversationId: string;
}): Promise<void> {
  try {
    const exchange = await loadLatestExchange(args.spaceId, args.conversationId);
    if (!exchange) return;
    if (exchange.user.length < MIN_USER_CHARS) return;

    const candidates = await distill(exchange.user, exchange.assistant);
    if (candidates.length === 0) return;

    const stored = await storeNovelCandidates(args.spaceId, candidates);
    if (stored > 0) {
      logger.info('[memory-extract] stored memories', { spaceId: args.spaceId, stored });
    }
  } catch (err) {
    logger.warn('[memory-extract] extraction failed', { spaceId: args.spaceId }, err);
  }
}
