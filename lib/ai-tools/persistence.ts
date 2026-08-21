/**
 * Message persistence for the on-demand agent.
 *
 * Two helpers — `saveUserMessage` and `saveAssistantMessage` — used by the
 * Phase 2 loop and the Phase 3 approval resumer. Saving is centralised
 * here so both:
 *   (a) use the same content-coalescing and content-derivation logic, and
 *   (b) write identical rows, avoiding "looks right on the first send but
 *       diverges on retry" bugs.
 *
 * The `Message` table has both `content` (legacy plain-text fallback) and
 * `blocks` (the rich transcript). Assistant messages populate both: blocks
 * for the new renderer, content as the concatenation of text blocks so
 * anything that reads `content` (old chat UI, export tools, RAG) sees
 * something sensible.
 */

import crypto from 'crypto';
import { after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';
import { extractConversationMemories } from '@/lib/agent-memory/extract';
import {
  commitConversationTurnAssistantV2,
  type ConversationTurnAssistantCommitRecord,
  type TurnTerminalOutcome,
} from '@/lib/chat/turn-control';
import { coalesceTextBlocks, type MessageBlock } from './blocks';

export interface SaveUserMessageInput {
  spaceId: string;
  conversationId: string | null;
  content: string;
  /**
   * Attachment row ids the realtor sent with this message. When present we
   * resolve their metadata and persist an `attachment` block per file so the
   * transcript renders them as chips/thumbnails on reload — the agent already
   * reads the files, but they were previously invisible in history.
   */
  attachmentIds?: string[];
}

/**
 * Resolve attachment ids → persisted `attachment` blocks. Reads only stable
 * metadata (id / filename / mime / size); the renderer signs a URL on demand,
 * so nothing here expires. Scoped to the space so a foreign id can't be
 * smuggled onto a message. Failures degrade to no blocks — a missing chip is
 * never worth failing the whole send.
 */
async function attachmentBlocks(
  spaceId: string,
  ids: string[] | undefined,
): Promise<MessageBlock[]> {
  if (!ids || ids.length === 0) return [];
  try {
    const { data, error } = await tenantTable(supabase, 'Attachment', { spaceId })
      .select('id, filename, "mimeType", "sizeBytes"')
      .in('id', ids);
    if (error) {
      logger.warn('[tools.persistence] attachment block resolve failed', { spaceId }, error);
      return [];
    }
    const rows = (data ?? []) as Array<{
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number | null;
    }>;
    // Preserve the order the realtor sent them in, not PostgREST's row order.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const blocks: MessageBlock[] = [];
    for (const aid of ids) {
      const r = byId.get(aid);
      if (!r) continue;
      const mimeType = r.mimeType ?? '';
      blocks.push({
        type: 'attachment',
        id: r.id,
        filename: r.filename,
        mimeType,
        isImage: mimeType.startsWith('image/'),
        ...(typeof r.sizeBytes === 'number' ? { sizeBytes: r.sizeBytes } : {}),
      });
    }
    return blocks;
  } catch (err) {
    logger.warn('[tools.persistence] attachment block resolve threw', { spaceId }, err);
    return [];
  }
}

export async function saveUserMessage(input: SaveUserMessageInput): Promise<{ messageId: string }> {
  const id = crypto.randomUUID();
  const blocks = await attachmentBlocks(input.spaceId, input.attachmentIds);
  const { error } = await tenantTable(supabase, 'Message', { spaceId: input.spaceId }).insert({
    id,
    spaceId: input.spaceId,
    conversationId: input.conversationId,
    role: 'user',
    content: input.content,
    // User messages are plain text EXCEPT for attachment chips — when the
    // realtor sent files we persist an `attachment` block per file so the
    // bubble can re-render them on reload.
    ...(blocks.length > 0
      ? { blocks: blocks as unknown as Record<string, unknown>[] }
      : {}),
  });
  if (error) {
    logger.error('[tools.persistence] saveUserMessage failed', { spaceId: input.spaceId }, error);
    throw new Error(`Failed to save user message: ${error.message}`);
  }
  return { messageId: id };
}

export interface SaveAssistantMessageInput {
  spaceId: string;
  conversationId: string | null;
  blocks: MessageBlock[];
}

function prepareAssistantMessage(blocks: MessageBlock[]): {
  blocks: MessageBlock[];
  content: string;
} {
  const merged = coalesceTextBlocks(blocks);
  const content = merged
    .filter((b): b is Extract<MessageBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.content)
    .join('\n')
    .trim();
  return { blocks: merged, content: content || '(tool-only turn)' };
}

function scheduleConversationMemoryExtraction(
  spaceId: string,
  conversationId: string | null,
  content: string,
): void {
  if (!conversationId || !content || content === '(tool-only turn)') return;
  try {
    after(() => extractConversationMemories({ spaceId, conversationId }));
  } catch {
    /* no request context (script/test) — skip background extraction */
  }
}

/**
 * Save the assistant's blocks as a new Message row.
 *
 * - Coalesces adjacent text blocks (the loop typically emits many small
 *   text_delta events that accumulate into tiny blocks).
 * - Derives `content` as the concatenation of text-block contents so
 *   legacy readers still get something useful.
 * - Returns the new message id so the caller can reference it in its SSE
 *   `turn_complete` event if it wants to.
 */
export async function saveAssistantMessage(
  input: SaveAssistantMessageInput,
): Promise<{ messageId: string }> {
  const prepared = prepareAssistantMessage(input.blocks);

  const id = crypto.randomUUID();
  const { error } = await tenantTable(supabase, 'Message', { spaceId: input.spaceId }).insert({
    id,
    spaceId: input.spaceId,
    conversationId: input.conversationId,
    role: 'assistant',
    // Content is required-NOT-NULL in the legacy schema; at minimum we
    // store something. An empty-text assistant message (pure tool calls)
    // falls back to a short placeholder so legacy readers don't render a
    // blank row.
    content: prepared.content,
    blocks: prepared.blocks as unknown as Record<string, unknown>[],
  });
  if (error) {
    logger.error('[tools.persistence] saveAssistantMessage failed', { spaceId: input.spaceId }, error);
    throw new Error(`Failed to save assistant message: ${error.message}`);
  }

  // After the reply is sent, distill durable memories from this exchange so
  // Chippi remembers the realtor next time. Non-blocking (after()) and
  // best-effort. Skip pure tool-only turns — there's no substance to learn
  // from, and it saves an LLM call. after() needs a request context (the chat
  // routes always have one); guarded so a non-request caller just skips.
  scheduleConversationMemoryExtraction(input.spaceId, input.conversationId, prepared.content);

  return { messageId: id };
}

export interface SaveConversationTurnAssistantInput extends SaveAssistantMessageInput {
  conversationId: string;
  turnId: string;
  attemptToken: string;
  outcome: TurnTerminalOutcome;
  pauseLeaseSeconds?: number;
}

/**
 * Token-fenced transcript barrier for durable Chat/Work turns.
 *
 * The same server-issued message id is reused for one bounded retry. If the
 * first RPC committed and only its response was lost, PostgreSQL returns the
 * existing attempt receipt; it never inserts a second Message.
 */
export async function saveConversationTurnAssistantMessage(
  input: SaveConversationTurnAssistantInput,
): Promise<ConversationTurnAssistantCommitRecord> {
  const prepared = prepareAssistantMessage(input.blocks);
  const messageId = crypto.randomUUID();
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const receipt = await commitConversationTurnAssistantV2(supabase, {
        turnId: input.turnId,
        spaceId: input.spaceId,
        conversationId: input.conversationId,
        attemptToken: input.attemptToken,
        messageId,
        content: prepared.content,
        blocks: prepared.blocks as unknown as Record<string, unknown>[],
        outcome: input.outcome,
        pauseLeaseSeconds: input.pauseLeaseSeconds,
      });
      scheduleConversationMemoryExtraction(input.spaceId, input.conversationId, prepared.content);
      return receipt;
    } catch (error) {
      lastError = error;
    }
  }

  logger.error('[tools.persistence] atomic assistant commit failed', {
    spaceId: input.spaceId,
    conversationId: input.conversationId,
    turnId: input.turnId,
  }, lastError);
  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to atomically persist assistant message.');
}
