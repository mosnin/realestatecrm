/** Generate and persist one Studio image for the current workspace. */

import { z } from 'zod';
import { defineTool } from '../types';
import { isStudioEnabled } from '@/lib/chippi/studio-flag';
import { falConfigured } from '@/lib/studio/fal';
import { runStudioGeneration, StudioGenerationError } from '@/lib/studio/generate';
import { checkStudioSpendBudget } from '@/lib/studio/spend';

const parameters = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .describe('The exact visual to generate. Include property, audience, composition, and on-image copy when needed.'),
    model: z
      .enum(['flux-schnell', 'flux-2', 'seedream-4'])
      .optional()
      .describe('Optional image model. Use flux-schnell by default, flux-2 for polish, seedream-4 for photorealism.'),
  })
  .strict()
  .describe('Generate one branded image and save it to the workspace Files library.');

interface GeneratedStudioImage {
  generationId: string;
  fileId: string;
  kind: 'image';
  prompt: string;
  model: string;
  costUsd: number;
}

export const generateStudioImageTool = defineTool<typeof parameters, GeneratedStudioImage>({
  name: 'generate_studio_image',
  riskLevel: 'high',
  description:
    'Generate a real branded image with Studio, save it to Files, and return a stable in-chat image card. Use only when the user explicitly asks to create or generate visual media.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 10, windowSeconds: 3600 },
  summariseCall: (args) => `Generate and save an image: ${args.prompt.slice(0, 180)}`,

  async handler(args, ctx) {
    if (!isStudioEnabled()) {
      return { summary: 'Studio is paused.', display: 'error' };
    }
    if (!falConfigured()) {
      return { summary: 'Studio image generation is not configured.', display: 'error' };
    }
    if (ctx.signal.aborted) {
      return { summary: 'Image generation was cancelled before it started.', display: 'error' };
    }

    const budget = await checkStudioSpendBudget(ctx.space.id);
    if (!budget.allowed) {
      return {
        summary: `Daily generation limit reached ($${budget.spentUsd.toFixed(2)} / $${budget.capUsd.toFixed(2)}).`,
        display: 'error',
      };
    }

    try {
      const result = await runStudioGeneration({
        spaceId: ctx.space.id,
        userId: ctx.userId,
        prompt: args.prompt,
        modelSlug: args.model,
      });
      if (result.kind !== 'image') {
        return { summary: 'Studio returned an unsupported media type.', display: 'error' };
      }
      return {
        summary: 'Generated the image and saved it to Files.',
        modelContext: JSON.stringify({
          persisted: true,
          fileId: result.fileId,
          kind: result.kind,
          model: result.model,
        }),
        data: {
          generationId: result.generationId,
          fileId: result.fileId,
          kind: 'image',
          prompt: args.prompt,
          model: result.model,
          costUsd: result.costUsd,
        },
        display: 'generated-image',
      };
    } catch (error) {
      return {
        summary:
          error instanceof StudioGenerationError
            ? error.message
            : 'Image generation failed before a file was saved.',
        display: 'error',
      };
    }
  },
});
