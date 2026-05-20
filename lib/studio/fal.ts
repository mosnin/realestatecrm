/**
 * fal.ai client wrapper — the only module that talks to fal. Every Studio
 * generation goes through here, the same swap-insulation invariant held for
 * Composio (`lib/integrations/composio.ts`) and the OpenAI Agents SDK.
 *
 * The @fal-ai/client SDK reads the FAL_KEY env var automatically on the
 * server — there is no explicit configure step.
 */

import { fal } from '@fal-ai/client';

export interface GeneratedImage {
  /** fal-hosted URL of the result — temporary, copy the bytes promptly. */
  url: string;
  contentType: string;
}

/** True when FAL_KEY is set. Routes use this to fail cleanly when it isn't. */
export function falConfigured(): boolean {
  return Boolean(process.env.FAL_KEY);
}

/**
 * Generate an image from a text prompt. `fal.subscribe` submits to fal's
 * queue and resolves when the result is ready — image models finish in a few
 * seconds. Video will use the async queue + webhook path in a later phase.
 */
export async function generateImage(args: {
  modelId: string;
  prompt: string;
}): Promise<GeneratedImage> {
  const result = await fal.subscribe(args.modelId, {
    input: { prompt: args.prompt },
  });
  const data = result.data as {
    images?: Array<{ url?: string; content_type?: string }>;
  };
  const image = data.images?.[0];
  if (!image?.url) {
    throw new Error('fal returned no image');
  }
  return { url: image.url, contentType: image.content_type ?? 'image/jpeg' };
}
