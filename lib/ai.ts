import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { embedText } from '@/lib/embeddings';
import { searchVectors } from '@/lib/zilliz';
import { supabase } from '@/lib/supabase';
import type { ApplicationData, LeadScoreDetails } from '@/lib/types';

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

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
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

  // Retrieve relevant context via Supabase pgvector similarity search
  let contextBlocks: string[] = [];
  try {
    const queryVector = await embedText(queryText);
    const results = await searchVectors(spaceId, queryVector, 8);

    const contactIds: string[] = [];
    const dealIds: string[] = [];

    for (const r of results) {
      if (r.entity_type === 'contact') contactIds.push(r.entity_id);
      else if (r.entity_type === 'deal') dealIds.push(r.entity_id);
    }

    // Fetch full contact records with application data and scoring
    if (contactIds.length) {
      const { data: contacts } = await supabase
        .from('Contact')
        .select('*')
        .in('id', contactIds)
        .eq('spaceId', spaceId);
      if (contacts?.length) {
        contextBlocks.push(
          'Relevant Contacts/Leads:\n' +
            contacts
              .map((c: Record<string, unknown>) => {
                const app = c.applicationData as ApplicationData | null;
                const score = c.scoreDetails as LeadScoreDetails | null;
                const parts = [
                  `- ${c.name} (${c.type})`,
                  c.email ? `Email: ${c.email}` : null,
                  c.phone ? `Phone: ${c.phone}` : null,
                  c.address ? `Address: ${c.address}` : null,
                ];

                // Application data context
                if (app) {
                  if (app.propertyAddress) parts.push(`Property: ${app.propertyAddress}`);
                  if (app.targetMoveInDate) parts.push(`Move-in: ${app.targetMoveInDate}`);
                  if (app.monthlyRent != null) parts.push(`Rent: ${formatCurrency(app.monthlyRent)}`);
                  if (app.employmentStatus) parts.push(`Employment: ${app.employmentStatus}`);
                  if (app.employerOrSource) parts.push(`Employer: ${app.employerOrSource}`);
                  if (app.monthlyGrossIncome != null) parts.push(`Income: ${formatCurrency(app.monthlyGrossIncome)}/mo`);
                  if (app.adultsOnApplication != null) parts.push(`Adults: ${app.adultsOnApplication}`);
                  if (app.childrenOrDependents != null) parts.push(`Children: ${app.childrenOrDependents}`);
                  if (app.currentHousingStatus) parts.push(`Housing: ${app.currentHousingStatus}`);
                  if (app.hasPets != null) parts.push(`Pets: ${app.hasPets ? (app.petDetails ?? 'Yes') : 'No'}`);
                  if (app.priorEvictions != null) parts.push(`Evictions: ${app.priorEvictions ? 'Yes' : 'No'}`);
                  if (app.reasonForMoving) parts.push(`Reason for moving: ${app.reasonForMoving}`);
                } else {
                  if (c.budget != null) parts.push(`Budget: ${formatCurrency(c.budget as number)}`);
                  if (c.preferences) parts.push(`Preferences: ${c.preferences}`);
                }

                // Score context
                if (score) {
                  parts.push(`Lead Score: ${score.score} (${score.priorityTier})`);
                  parts.push(`Status: ${score.qualificationStatus}`);
                  if (score.summary) parts.push(`Summary: ${score.summary}`);
                  if (score.recommendedNextAction) parts.push(`Next Action: ${score.recommendedNextAction}`);
                  if (score.riskFlags?.length && score.riskFlags[0] !== 'none') parts.push(`Risks: ${score.riskFlags.join(', ')}`);
                } else if (c.leadScore != null) {
                  parts.push(`Lead Score: ${c.leadScore} (${c.scoreLabel})`);
                }

                if (c.notes) parts.push(`Notes: ${c.notes}`);
                return parts.filter(Boolean).join(' | ');
              })
              .join('\n')
        );
      }
    }

    // Fetch full deal records with stage and contact associations
    if (dealIds.length) {
      const { data: deals } = await supabase
        .from('Deal')
        .select('*, DealStage(name)')
        .in('id', dealIds)
        .eq('spaceId', spaceId);
      const { data: dealContactRows } = await supabase
        .from('DealContact')
        .select('dealId, Contact(name)')
        .in('dealId', dealIds);
      const contactsByDeal: Record<string, string[]> = {};
      for (const row of (dealContactRows ?? []) as unknown as { dealId: string; Contact: { name: string }[] | null }[]) {
        if (!contactsByDeal[row.dealId]) contactsByDeal[row.dealId] = [];
        if (row.Contact) {
          for (const c of row.Contact) {
            if (c.name) contactsByDeal[row.dealId].push(c.name);
          }
        }
      }
      if (deals?.length) {
        contextBlocks.push(
          'Relevant Deals:\n' +
            deals
              .map(
                (d: Record<string, unknown>) =>
                  `- ${d.title} | Stage: ${(d.DealStage as { name: string } | null)?.name ?? 'N/A'} | Value: ${d.value != null ? formatCurrency(d.value as number) : 'N/A'} | Priority: ${d.priority} | Address: ${d.address ?? ''} | Contacts: ${(contactsByDeal[d.id as string] ?? []).join(', ')}`
              )
              .join('\n')
        );
      }
    }

    // Also provide aggregate stats for broader questions
    try {
      const [contactCount, dealCount, hotLeads, warmLeads] = await Promise.all([
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', spaceId),
        supabase.from('Deal').select('*', { count: 'exact', head: true }).eq('spaceId', spaceId),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', spaceId).eq('scoreLabel', 'hot'),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', spaceId).eq('scoreLabel', 'warm'),
      ]);
      contextBlocks.push(
        `Pipeline Overview: ${contactCount.count ?? 0} total contacts, ${dealCount.count ?? 0} deals, ${hotLeads.count ?? 0} hot leads, ${warmLeads.count ?? 0} warm leads`
      );
    } catch {
      // non-blocking
    }
  } catch {
    // Embeddings may not be configured — proceed without RAG context
  }

  const systemPrompt = [
    `You are an intelligent real estate CRM assistant for the workspace "${spaceName}".`,
    `You help real estate agents manage renter leads, qualify applicants, track deals, and make data-driven leasing decisions.`,
    `You have access to the agent's contacts, leads with AI scoring and full application data, and their deal pipeline.`,
    `When answering about specific leads or contacts, reference their application details, score, and recommended actions.`,
    `Be concise and actionable. Focus on what the agent should do next.`,
    contextBlocks.length
      ? `\nHere is relevant CRM data for this query:\n\n${contextBlocks.join('\n\n')}`
      : ''
  ]
    .filter(Boolean)
    .join('\n');

  // Prefer OpenAI when available
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
