/**
 * Studio model catalog — the fal.ai models Studio generates with, and the
 * estimated dollar cost of one generation.
 *
 * fal does not return cost in its API response, so `costUsd` here is the
 * list-price estimate we record on StudioGeneration.costUsd and sum into the
 * realtor's usage. Image models price per megapixel; a standard ~1MP
 * generation is close enough to a flat per-image figure for metering.
 */

export type StudioModelKind = 'image' | 'video';

export interface StudioModel {
  /** fal.ai model id passed to the SDK. */
  id: string;
  /** Short label for the picker. */
  label: string;
  kind: StudioModelKind;
  /** Estimated USD cost of one generation. */
  costUsd: number;
}

/**
 * Keyed by our own stable slug — the API accepts the slug, never the raw fal
 * id, so a fal model-id change is a one-line edit here and nothing else moves.
 */
export const STUDIO_MODELS: Record<string, StudioModel> = {
  'flux-schnell': {
    id: 'fal-ai/flux/schnell',
    label: 'Fast draft',
    kind: 'image',
    costUsd: 0.003,
  },
  'flux-2': {
    id: 'fal-ai/flux-2',
    label: 'High quality',
    kind: 'image',
    costUsd: 0.04,
  },
  'seedream-4': {
    id: 'fal-ai/bytedance/seedream/v4.5/text-to-image',
    label: 'Photoreal',
    kind: 'image',
    costUsd: 0.04,
  },
};

/** Default model when the caller doesn't pick one. */
export const DEFAULT_IMAGE_MODEL = 'flux-schnell';
