/**
 * Guards the fixed model strategy:
 *   - Chippi chats on Qwen3.7 Plus (multimodal — text + vision).
 *   - Image turns stay on Qwen3.7 Plus; only a non-vision model would upgrade
 *     to the vision fallback (also Qwen3.7 Plus).
 *   - The per-workspace picker is gone, so stale/removed model picks fall back
 *     to the default instead of being sent to the provider.
 *
 * The autonomous swarm worker model (z-ai/glm-5.2) lives in
 * agent/config.py and is covered on the Python side.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { DEFAULT_CHAT_MODEL, isValidChatModel } from '@/lib/chat-models';
import {
  VISION_FALLBACK_MODEL,
  providerSupportsImages,
  pickModelForAttachments,
} from '@/lib/chat/multimodal';

const IMG = { id: 'i', filename: 's.png', mimeType: 'image/png', url: 'https://x/s.png' };

describe('fixed model strategy', () => {
  it('default chat model is Qwen3.7 Plus', () => {
    expect(DEFAULT_CHAT_MODEL).toBe('qwen/qwen3.7-plus');
  });

  it('only the supported chat model validates; removed ones do not', () => {
    expect(isValidChatModel('qwen/qwen3.7-plus')).toBe(true);
    expect(isValidChatModel('deepseek/deepseek-v4-pro')).toBe(false);
    expect(isValidChatModel('x-ai/grok-4.3')).toBe(false);
    expect(isValidChatModel('anthropic/claude-opus-4.7')).toBe(false);
  });

  it('the vision fallback is the multimodal default; image turns stay on it', () => {
    expect(VISION_FALLBACK_MODEL).toBe('qwen/qwen3.7-plus');
    expect(providerSupportsImages('qwen')).toBe(true);
    expect(providerSupportsImages('deepseek')).toBe(false);
    // The default chat model is itself multimodal — an image turn stays put.
    expect(pickModelForAttachments('qwen/qwen3.7-plus', [IMG], true)).toEqual({
      model: 'qwen/qwen3.7-plus',
      upgraded: false,
    });
    // A text-only model carrying an image upgrades to qwen for that turn.
    expect(pickModelForAttachments('deepseek/deepseek-v4-pro', [IMG], true)).toEqual({
      model: 'qwen/qwen3.7-plus',
      upgraded: true,
    });
    // A text-only turn is left on the requested model.
    expect(pickModelForAttachments('qwen/qwen3.7-plus', [], true)).toEqual({
      model: 'qwen/qwen3.7-plus',
      upgraded: false,
    });
  });
});

describe('resolveChatModel falls back for stale/removed picks', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns the default for a model no longer in the registry (OpenRouter on)', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
    const { resolveChatModel } = await import('@/lib/llm');
    expect(resolveChatModel('x-ai/grok-4.3')).toBe('qwen/qwen3.7-plus');
    expect(resolveChatModel('qwen/qwen3.7-plus')).toBe('qwen/qwen3.7-plus');
    expect(resolveChatModel(null)).toBe('qwen/qwen3.7-plus');
  });
});
