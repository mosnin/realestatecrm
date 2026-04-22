/**
 * Shared OpenAI client getter for the on-demand agent.
 *
 * `lib/ai.ts` already instantiates an OpenAI client inline for the legacy
 * chat route; we do the same here rather than sharing a module-level
 * singleton because the existing code reads `OPENAI_API_KEY` inside the
 * handler (friendlier for tests + serverless cold starts).
 *
 * Centralising the model constant means swapping it (or adding a broker /
 * enterprise override later) doesn't require touching the loop.
 */

import OpenAI from 'openai';

/** Default model for the on-demand agent. Tool-calling capable. */
export const AGENT_MODEL = 'gpt-4.1-mini';

export interface OpenAIClientResult {
  client: OpenAI;
}

export class MissingOpenAIKeyError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not configured for this environment.');
    this.name = 'MissingOpenAIKeyError';
  }
}

export function getOpenAIClient(): OpenAIClientResult {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new MissingOpenAIKeyError();
  return { client: new OpenAI({ apiKey }) };
}
