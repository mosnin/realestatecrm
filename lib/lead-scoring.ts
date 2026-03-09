import OpenAI from 'openai';
import { z } from 'zod';

export type LeadScoringResult = {
  scoringStatus: 'scored' | 'failed' | 'pending';
  leadScore: number | null;
  scoreLabel: string;
  scoreSummary: string | null;
};

const scoreSchema = z.object({
  leadScore: z.number().min(0).max(100),
  scoreLabel: z.enum(['hot', 'warm', 'cold', 'unscored']),
  scoreSummary: z.string().min(1).max(300)
});

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function toPrompt(input: {
  name: string;
  email: string | null;
  phone: string;
  budget: number | null;
  timeline: string | null;
  preferredAreas: string | null;
  notes: string | null;
}) {
  return [
    'You are scoring a U.S. renter leasing lead for follow-up priority.',
    'Return strict JSON only.',
    'Use score 0-100 where higher means higher follow-up priority now.',
    'Label rules: hot (75-100), warm (45-74), cold (0-44), unscored only if insufficient data.',
    'Summary must be explainable and practical in under 300 chars.',
    '',
    `Name: ${input.name}`,
    `Email: ${input.email ?? 'N/A'}`,
    `Phone: ${input.phone}`,
    `Budget: ${input.budget ?? 'N/A'}`,
    `Timeline: ${input.timeline ?? 'N/A'}`,
    `Preferred areas: ${input.preferredAreas ?? 'N/A'}`,
    `Notes: ${input.notes ?? 'N/A'}`
  ].join('\n');
}

export async function scoreLeadApplication(input: {
  contactId: string;
  name: string;
  email: string | null;
  phone: string;
  budget: number | null;
  timeline: string | null;
  preferredAreas: string | null;
  notes: string | null;
}): Promise<LeadScoringResult> {
  console.info('[lead-scoring] start', { contactId: input.contactId });

  try {
    const openai = getOpenAIClient();
    const prompt = toPrompt(input);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'lead_scoring',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              leadScore: { type: 'number', minimum: 0, maximum: 100 },
              scoreLabel: { type: 'string', enum: ['hot', 'warm', 'cold', 'unscored'] },
              scoreSummary: { type: 'string' }
            },
            required: ['leadScore', 'scoreLabel', 'scoreSummary']
          }
        }
      },
      messages: [
        {
          role: 'system',
          content:
            'You are a lead qualification assistant. Return only valid JSON matching the schema.'
        },
        { role: 'user', content: prompt }
      ]
    });

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) {
      console.error('[lead-scoring] empty model response', { contactId: input.contactId });
      return {
        scoringStatus: 'failed',
        leadScore: null,
        scoreLabel: 'unscored',
        scoreSummary: 'Scoring unavailable right now. Lead saved successfully.'
      };
    }

    console.info('[lead-scoring] model response received', { contactId: input.contactId });

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      console.error('[lead-scoring] invalid JSON response', { contactId: input.contactId, error });
      return {
        scoringStatus: 'failed',
        leadScore: null,
        scoreLabel: 'unscored',
        scoreSummary: 'Scoring unavailable right now. Lead saved successfully.'
      };
    }

    const parsed = scoreSchema.safeParse(parsedJson);
    if (!parsed.success) {
      console.error('[lead-scoring] schema validation failed', {
        contactId: input.contactId,
        issues: parsed.error.issues
      });
      return {
        scoringStatus: 'failed',
        leadScore: null,
        scoreLabel: 'unscored',
        scoreSummary: 'Scoring unavailable right now. Lead saved successfully.'
      };
    }

    const safe = parsed.data;
    console.info('[lead-scoring] success', {
      contactId: input.contactId,
      leadScore: safe.leadScore,
      scoreLabel: safe.scoreLabel
    });

    return {
      scoringStatus: 'scored',
      leadScore: safe.leadScore,
      scoreLabel: safe.scoreLabel,
      scoreSummary: safe.scoreSummary
    };
  } catch (error) {
    console.error('[lead-scoring] provider call failed', { contactId: input.contactId, error });
    return {
      scoringStatus: 'failed',
      leadScore: null,
      scoreLabel: 'unscored',
      scoreSummary: 'Scoring unavailable right now. Lead saved successfully.'
    };
  }
}
