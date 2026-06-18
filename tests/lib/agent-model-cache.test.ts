import { describe, it, expect } from 'vitest';
import { isCacheCapable, applyCacheMarkers } from '@/lib/ai-tools/agent-model';

describe('agent-model — prompt-cache markers (L4)', () => {
  it('only marks cache-capable providers (anthropic/google), not grok/openai', () => {
    expect(isCacheCapable('anthropic/claude-sonnet-4')).toBe(true);
    expect(isCacheCapable('google/gemini-2.5-pro')).toBe(true);
    expect(isCacheCapable('x-ai/grok-4.3')).toBe(false);
    expect(isCacheCapable('openai/gpt-5')).toBe(false);
    expect(isCacheCapable('')).toBe(false);
  });

  it('marks the system message + last tool, and is idempotent', () => {
    const body = {
      messages: [
        { role: 'system', content: 'You are Chippi.' },
        { role: 'user', content: 'who are my leads' },
      ],
      tools: [
        { type: 'function', function: { name: 'find_person' } },
        { type: 'function', function: { name: 'list_contacts' } },
      ],
    };
    applyCacheMarkers(body);
    // System content becomes a block array carrying the marker.
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'You are Chippi.', cache_control: { type: 'ephemeral' } },
    ]);
    // User message untouched.
    expect(body.messages[1].content).toBe('who are my leads');
    // Last tool carries the marker; earlier tools don't (provider caches the run).
    expect((body.tools[1] as Record<string, unknown>).cache_control).toEqual({ type: 'ephemeral' });
    expect('cache_control' in body.tools[0]).toBe(false);

    // Idempotent — a second pass changes nothing.
    const snapshot = JSON.stringify(body);
    applyCacheMarkers(body);
    expect(JSON.stringify(body)).toBe(snapshot);
  });

  it('is a safe no-op on empty/odd bodies', () => {
    expect(() => applyCacheMarkers(undefined)).not.toThrow();
    expect(() => applyCacheMarkers({})).not.toThrow();
    expect(() => applyCacheMarkers({ messages: [], tools: [] })).not.toThrow();
  });
});
