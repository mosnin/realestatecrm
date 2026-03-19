import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { embedText } from '@/lib/embeddings';
import { searchVectors } from '@/lib/zilliz';
import { supabase } from '@/lib/supabase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function textStream(message: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(message));
      controller.close();
    }
  });
}

function looksLikeAnthropicKey(key?: string | null) {
  return !!key && key.startsWith('sk-ant-');
}

export async function chatWithRAG(
  messages: ChatMessage[],
  spaceId: string,
  spaceName: string,
  apiKey?: string | null
): Promise<ReadableStream> {
  const anthropicKey = apiKey || process.env.ANTHROPIC_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openAIKey) {
    return textStream(
      'No AI API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY in environment variables, or set a workspace key in Settings → AI.'
    );
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const queryText = lastUserMessage?.content ?? '';

  // ── Step 1: always load the user's full CRM data for this space ──────────
  // This guarantees the AI has context even when vectors haven't been populated yet.
  const [{ data: allContacts }, { data: allDeals }] = await Promise.all([
    supabase
      .from('Contact')
      .select('*')
      .eq('spaceId', spaceId)
      .order('createdAt', { ascending: false })
      .limit(100),
    supabase
      .from('Deal')
      .select('*, DealStage(name)')
      .eq('spaceId', spaceId)
      .order('createdAt', { ascending: false })
      .limit(50),
  ]);

  // Fetch deal↔contact links scoped to this space's deal IDs only
  const dealIds = (allDeals ?? []).filter((d: any) => d?.id).map((d: any) => d.id);
  const { data: allDealContactRows } = dealIds.length
    ? await supabase
        .from('DealContact')
        .select('dealId, Contact(name)')
        .in('dealId', dealIds)
    : { data: [] };

  // ── Step 2: try vector search to promote the most relevant records ────────
  // If vectors aren't populated yet this will return an empty list (not an error).
  let priorityContactIds = new Set<string>();
  let priorityDealIds = new Set<string>();
  try {
    const queryVector = await embedText(queryText);
    const results = await searchVectors(spaceId, queryVector, 8);
    for (const r of results) {
      if (r.entity_type === 'contact') priorityContactIds.add(r.entity_id);
      else if (r.entity_type === 'deal') priorityDealIds.add(r.entity_id);
    }
  } catch {
    // Vector search unavailable — fall back to full dataset loaded above
  }

  // ── Step 3: build context blocks, prioritising vector-matched records ─────
  const contextBlocks: string[] = [];

  const contacts = (allContacts ?? []) as any[];
  const deals = (allDeals ?? []) as any[];

  // Sort so vector-matched contacts appear first
  const sortedContacts = [
    ...contacts.filter((c) => priorityContactIds.has(c.id)),
    ...contacts.filter((c) => !priorityContactIds.has(c.id)),
  ];

  if (sortedContacts.length) {
    contextBlocks.push(
      'Contacts:\n' +
        sortedContacts
          .map(
            (c) =>
              `- ${c.name} (${c.type})${priorityContactIds.has(c.id) ? ' ★' : ''} | Score: ${c.leadScore ?? 'N/A'} (${c.scoreLabel ?? 'unscored'}) | ${c.email ?? ''} | ${c.phone ?? ''} | Budget: ${c.budget != null ? `$${c.budget}` : 'N/A'} | ${c.address ?? ''} | Tags: ${(c.tags ?? []).join(', ')} | Notes: ${c.notes ?? ''}`
          )
          .join('\n')
    );
  }

  const contactsByDeal: Record<string, string[]> = {};
  for (const row of (allDealContactRows ?? []) as any[]) {
    if (!contactsByDeal[row.dealId]) contactsByDeal[row.dealId] = [];
    if (row.Contact?.name) contactsByDeal[row.dealId].push(row.Contact.name);
  }

  const sortedDeals = [
    ...deals.filter((d) => priorityDealIds.has(d.id)),
    ...deals.filter((d) => !priorityDealIds.has(d.id)),
  ];

  if (sortedDeals.length) {
    contextBlocks.push(
      'Deals:\n' +
        sortedDeals
          .map(
            (d) =>
              `- ${d.title}${priorityDealIds.has(d.id) ? ' ★' : ''} | Stage: ${d.DealStage?.name ?? 'N/A'} | Value: ${d.value != null ? `$${d.value}` : 'N/A'} | Priority: ${d.priority} | Address: ${d.address ?? ''} | Contacts: ${(contactsByDeal[d.id] ?? []).join(', ')}`
          )
          .join('\n')
    );
  }

  const systemPrompt = [
    `You are an intelligent real estate CRM assistant for the workspace "${spaceName}".`,
    `You help the agent manage clients through qualification, tour, and application stages, plus real estate deals.`,
    `Only reference data that appears in the CRM context below. Never fabricate client names, deal values, or contact details.`,
    contextBlocks.length
      ? `\nCRM Data (★ = most relevant to this query):\n\n${contextBlocks.join('\n\n')}`
      : `\nNo CRM data found for this workspace yet.`
  ]
    .join('\n');

  // Prefer OpenAI when available, because embeddings already rely on it in this app
  // and users may accidentally save non-Anthropic keys in workspace settings.
  if (openAIKey) {
    try {
      const openai = new OpenAI({ apiKey: openAIKey });
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content }))
        ]
      });

      return new ReadableStream({
        async start(controller) {
          for await (const event of stream) {
            const delta = event.choices[0]?.delta?.content;
            if (delta) controller.enqueue(new TextEncoder().encode(delta));
          }
          controller.close();
        }
      });
    } catch (error) {
      // Log full error server-side; never return internal details (API key snippets, rate limit info) to the client
      console.error('[ai] OpenAI provider error', error);
      if (!looksLikeAnthropicKey(anthropicKey)) {
        return textStream('AI provider is temporarily unavailable. Please try again in a moment.');
      }
    }
  }

  if (!looksLikeAnthropicKey(anthropicKey)) {
    return textStream('AI provider error: no valid API key configured. Add one in Settings → AI.');
  }

  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true
    });

    return new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(new TextEncoder().encode(event.delta.text));
          }
        }
        controller.close();
      }
    });
  } catch (error) {
    console.error('[ai] Anthropic provider error', error);
    return textStream('AI provider is temporarily unavailable. Please try again in a moment.');
  }
}
