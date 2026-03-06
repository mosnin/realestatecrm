import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { embedText } from '@/lib/embeddings';
import { searchVectors } from '@/lib/zilliz';
import { db } from '@/lib/db';

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

  // Retrieve relevant context from Zilliz
  let contextBlocks: string[] = [];
  try {
    const queryVector = await embedText(queryText);
    const results = await searchVectors(spaceId, queryVector, 5);

    const contactIds: string[] = [];
    const dealIds: string[] = [];

    for (const r of results) {
      if (r.entity_type === 'contact') contactIds.push(r.entity_id);
      else if (r.entity_type === 'deal') dealIds.push(r.entity_id);
    }

    if (contactIds.length) {
      const contacts = await db.contact.findMany({
        where: { id: { in: contactIds }, spaceId }
      });
      contextBlocks.push(
        'Relevant Contacts:\n' +
          contacts
            .map(
              (c) =>
                `- ${c.name} (${c.type}) | ${c.email ?? ''} | ${c.phone ?? ''} | ${c.address ?? ''} | Notes: ${c.notes ?? ''}`
            )
            .join('\n')
      );
    }

    if (dealIds.length) {
      const deals = await db.deal.findMany({
        where: { id: { in: dealIds }, spaceId },
        include: { stage: true, dealContacts: { include: { contact: true } } }
      });
      contextBlocks.push(
        'Relevant Deals:\n' +
          deals
            .map(
              (d) =>
                `- ${d.title} | Stage: ${d.stage.name} | Value: ${d.value != null ? `$${d.value}` : 'N/A'} | Priority: ${d.priority} | Address: ${d.address ?? ''} | Contacts: ${d.dealContacts.map((dc) => dc.contact.name).join(', ')}`
            )
            .join('\n')
      );
    }
  } catch {
    // Embeddings or Zilliz may not be configured — proceed without RAG context
  }

  const systemPrompt = [
    `You are an intelligent real estate CRM assistant for the space "${spaceName}".`,
    `You help with managing clients through qualification, tour, and application stages, plus real estate deals.`,
    contextBlocks.length
      ? `\nHere is relevant CRM data for this query:\n\n${contextBlocks.join('\n\n')}`
      : ''
  ]
    .filter(Boolean)
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
      const message = error instanceof Error ? error.message : 'Unknown OpenAI error';
      if (!looksLikeAnthropicKey(anthropicKey)) {
        return textStream(`AI provider error: ${message}`);
      }
    }
  }

  if (!looksLikeAnthropicKey(anthropicKey)) {
    return textStream('AI provider error: Anthropic key is missing or invalid.');
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
    const message = error instanceof Error ? error.message : 'Unknown Anthropic error';
    return textStream(`AI provider error: ${message}`);
  }
}
