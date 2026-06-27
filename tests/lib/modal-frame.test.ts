/**
 * mapModalToolResultFrame is the hop that carries a Python/Modal tool result onto
 * the browser SSE frame. Its whole reason to exist is forwarding the rich-card
 * `display` hint + structured `data` so the client renders a card instead of a
 * prose dump — but ONLY when present, and `display` only when it's a string. ok
 * defaults true unless explicitly false (a tool that forgot to set ok still
 * renders as success, not a phantom error). Pin the forwarding, the omissions,
 * and the field defaults.
 */

import { describe, it, expect } from 'vitest';
import { mapModalToolResultFrame } from '@/lib/ai-tools/modal-frame';

describe('mapModalToolResultFrame', () => {
  it('forwards display + data and maps the core fields when all present', () => {
    expect(
      mapModalToolResultFrame({
        tool: 'find_property',
        call_id: 'c1',
        ok: true,
        summary: 'Found 3',
        display: 'data-table',
        data: { rows: [1, 2, 3] },
      }),
    ).toEqual({
      type: 'tool_call_result',
      name: 'find_property',
      ok: true,
      summary: 'Found 3',
      callId: 'c1',
      display: 'data-table',
      data: { rows: [1, 2, 3] },
    });
  });

  it('omits display/data keys entirely when absent (the plain-text case)', () => {
    const frame = mapModalToolResultFrame({ tool: 'note', call_id: 'c2', summary: 'ok' });
    expect(frame).toEqual({
      type: 'tool_call_result',
      name: 'note',
      ok: true, // defaults true when ok is unset
      summary: 'ok',
      callId: 'c2',
    });
    expect('display' in frame).toBe(false);
    expect('data' in frame).toBe(false);
  });

  it('drops a non-string display hint but still forwards data (including null)', () => {
    const frame = mapModalToolResultFrame({ tool: 't', display: 42, data: null });
    expect('display' in frame).toBe(false); // 42 is not a valid display hint
    expect('data' in frame).toBe(true);
    expect(frame.data).toBeNull(); // `'data' in evt` forwards an explicit null
  });

  it('applies fail-safe defaults: ok only false when explicitly false, name/callId fallbacks', () => {
    expect(mapModalToolResultFrame({ ok: false }).ok).toBe(false);
    const bare = mapModalToolResultFrame({});
    expect(bare.name).toBe('tool'); // missing tool → 'tool'
    expect(bare.callId).toBe(''); // missing/non-string call_id → ''
    expect(bare.summary).toBe('');
    expect(bare.ok).toBe(true);
  });
});
