/**
 * chat-models gates which model slug can be persisted to AgentSettings.
 * isValidChatModel is the allowlist that stops an arbitrary user-supplied
 * string from being stored, and DEFAULT_CHAT_MODEL is the fallback for stale
 * picks — so the default MUST itself pass the allowlist, or settings would
 * fall back to an invalid model. Pin both.
 */

import { describe, it, expect } from 'vitest';
import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  isValidChatModel,
} from '@/lib/chat-models';

describe('isValidChatModel', () => {
  it('accepts a registered model id', () => {
    expect(isValidChatModel(CHAT_MODELS[0].id)).toBe(true);
  });

  it('rejects unknown slugs and non-strings (no arbitrary persisted model)', () => {
    expect(isValidChatModel('gpt-4o')).toBe(false);
    expect(isValidChatModel('')).toBe(false);
    expect(isValidChatModel(null)).toBe(false);
    expect(isValidChatModel(undefined)).toBe(false);
    expect(isValidChatModel(42)).toBe(false);
    expect(isValidChatModel({ id: CHAT_MODELS[0].id })).toBe(false);
  });
});

describe('chat-models registry', () => {
  it('keeps the default model valid against its own allowlist', () => {
    expect(isValidChatModel(DEFAULT_CHAT_MODEL)).toBe(true);
  });

  it('every entry has a non-empty id, label, and tagline', () => {
    expect(CHAT_MODELS.length).toBeGreaterThan(0);
    for (const m of CHAT_MODELS) {
      expect(m.id.trim().length).toBeGreaterThan(0);
      expect(m.label.trim().length).toBeGreaterThan(0);
      expect(m.tagline.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate model ids', () => {
    const ids = CHAT_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
