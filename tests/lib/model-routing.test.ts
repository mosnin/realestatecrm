/**
 * Guards the fixed model strategy:
 *   - Chippi chats on DeepSeek V4 Pro (text-only).
 *   - Image turns switch to qwen3.6-flash (the vision fallback).
 *   - The per-workspace picker is gone, so stale/removed model picks fall back
 *     to the default instead of being sent to the provider.
 *
 * The autonomous swarm worker model (tencent/hy3-preview) lives in
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
  it('default chat model is DeepSeek V4 Pro', () => {
    expect(DEFAULT_CHAT_MODEL).toBe('deepseek/deepseek-v4-pro');
  });

  it('only the supported chat model validates; removed ones do not', () => {
    expect(isValidChatModel('deepseek/deepseek-v4-pro')).toBe(true);
    expect(isValidChatModel('x-ai/grok-4.3')).toBe(false);
    expect(isValidChatModel('anthropic/claude-opus-4.7')).toBe(false);
  });

  it('image turns switch to qwen3.6-flash', () => {
    expect(VISION_FALLBACK_MODEL).toBe('qwen/qwen3.6-flash');
    expect(providerSupportsImages('qwen')).toBe(true);
    expect(providerSupportsImages('deepseek')).toBe(false);
    // A DeepSeek (text-only) turn carrying an image upgrades to qwen for that turn.
    expect(pickModelForAttachments('deepseek/deepseek-v4-pro', [IMG], true)).toEqual({
      model: 'qwen/qwen3.6-flash',
      upgraded: true,
    });
    // A text-only turn is left on DeepSeek.
    expect(pickModelForAttachments('deepseek/deepseek-v4-pro', [], true)).toEqual({
      model: 'deepseek/deepseek-v4-pro',
      upgraded: false,
    });
  });
});

describe('resolveChatModel falls back for stale/removed picks', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns the default for a model no longer in the registry (OpenRouter on)', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
    const { resolveChatModel } = await import('@/lib/llm');
    expect(resolveChatModel('x-ai/grok-4.3')).toBe('deepseek/deepseek-v4-pro');
    expect(resolveChatModel('deepseek/deepseek-v4-pro')).toBe('deepseek/deepseek-v4-pro');
    expect(resolveChatModel(null)).toBe('deepseek/deepseek-v4-pro');
  });
});
