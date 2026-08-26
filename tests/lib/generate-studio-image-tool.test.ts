import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  falConfigured: vi.fn(),
  checkStudioSpendBudget: vi.fn(),
  runStudioGeneration: vi.fn(),
}));

vi.mock('@/lib/studio/fal', () => ({
  falConfigured: mocks.falConfigured,
}));

vi.mock('@/lib/studio/spend', () => ({
  checkStudioSpendBudget: mocks.checkStudioSpendBudget,
}));

vi.mock('@/lib/studio/generate', () => {
  class StudioGenerationError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.name = 'StudioGenerationError';
      this.status = status;
    }
  }
  return {
    StudioGenerationError,
    runStudioGeneration: mocks.runStudioGeneration,
  };
});

import { StudioGenerationError } from '@/lib/studio/generate';
import { generateStudioImageTool } from '@/lib/ai-tools/tools/generate-studio-image';
import type { ToolContext } from '@/lib/ai-tools/types';

const ctx: ToolContext = {
  userId: 'user-1',
  space: { id: 'space-1', slug: 'demo', name: 'Demo', ownerId: 'owner-1' },
  signal: new AbortController().signal,
};

describe('generate_studio_image', () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED', 'true');
    mocks.falConfigured.mockReturnValue(true);
    mocks.checkStudioSpendBudget.mockResolvedValue({
      allowed: true,
      spentUsd: 1.25,
      capUsd: 50,
    });
  });

  it('accepts only a bounded image prompt and supported image model', () => {
    expect(generateStudioImageTool.parameters.safeParse({}).success).toBe(false);
    expect(
      generateStudioImageTool.parameters.safeParse({
        prompt: 'A twilight listing hero',
        model: 'flux-2',
      }).success,
    ).toBe(true);
    expect(
      generateStudioImageTool.parameters.safeParse({
        prompt: 'A listing video',
        model: 'seedance-video',
      }).success,
    ).toBe(false);
  });

  it('fails before provider work when Studio is paused', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED', 'false');
    const paused = await generateStudioImageTool.handler(
      { prompt: 'A twilight listing hero' },
      ctx,
    );
    expect(paused.display).toBe('error');
    expect(paused.summary).toMatch(/paused/i);
    expect(mocks.falConfigured).not.toHaveBeenCalled();
    expect(mocks.checkStudioSpendBudget).not.toHaveBeenCalled();
    expect(mocks.runStudioGeneration).not.toHaveBeenCalled();
  });

  it('fails before provider work when Studio or spend authority is unavailable', async () => {
    mocks.falConfigured.mockReturnValue(false);
    const unconfigured = await generateStudioImageTool.handler(
      { prompt: 'A twilight listing hero' },
      ctx,
    );
    expect(unconfigured.display).toBe('error');
    expect(mocks.checkStudioSpendBudget).not.toHaveBeenCalled();
    expect(mocks.runStudioGeneration).not.toHaveBeenCalled();

    mocks.falConfigured.mockReturnValue(true);
    mocks.checkStudioSpendBudget.mockResolvedValue({
      allowed: false,
      spentUsd: 50,
      capUsd: 50,
    });
    const overBudget = await generateStudioImageTool.handler(
      { prompt: 'A twilight listing hero' },
      ctx,
    );
    expect(overBudget.display).toBe('error');
    expect(overBudget.summary).toContain('$50.00 / $50.00');
    expect(mocks.runStudioGeneration).not.toHaveBeenCalled();
  });

  it('returns only a persisted file identity to the generated-media surface', async () => {
    mocks.runStudioGeneration.mockResolvedValue({
      generationId: 'generation-1',
      fileId: 'file-1',
      url: 'https://temporary-provider.example/image.png',
      kind: 'image',
      model: 'fal-ai/flux-2',
      costUsd: 0.05,
    });

    const result = await generateStudioImageTool.handler(
      { prompt: 'A twilight listing hero', model: 'flux-2' },
      ctx,
    );

    expect(mocks.runStudioGeneration).toHaveBeenCalledWith({
      spaceId: 'space-1',
      userId: 'user-1',
      prompt: 'A twilight listing hero',
      modelSlug: 'flux-2',
    });
    expect(result.display).toBe('generated-image');
    expect(result.data).toEqual({
      generationId: 'generation-1',
      fileId: 'file-1',
      kind: 'image',
      prompt: 'A twilight listing hero',
      model: 'fal-ai/flux-2',
      costUsd: 0.05,
    });
    expect(JSON.stringify(result)).not.toContain('temporary-provider.example');
  });

  it('surfaces bounded provider failure copy without claiming a saved file', async () => {
    mocks.runStudioGeneration.mockRejectedValue(
      new StudioGenerationError('Generation provider is temporarily unavailable.', 502),
    );

    const result = await generateStudioImageTool.handler(
      { prompt: 'A twilight listing hero' },
      ctx,
    );

    expect(result.display).toBe('error');
    expect(result.summary).toBe('Generation provider is temporarily unavailable.');
    expect(result.data).toBeUndefined();
  });
});
