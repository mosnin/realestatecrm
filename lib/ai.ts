import Anthropic from '@anthropic-ai/sdk';
import { embedText } from '@/lib/embeddings';
import { searchVectors } from '@/lib/zilliz';
import { db } from '@/lib/db';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatWithRAG(
  messages: ChatMessage[],
  spaceId: string,
  spaceName: string
): Promise<ReadableStream> {
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
    // Zilliz not configured yet — proceed without RAG context
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
}
