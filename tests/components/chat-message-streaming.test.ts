import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TextBlockView } from '@/components/ai/blocks/text-block-view';
import { StreamingResponse } from '@/components/ai/chat/streaming-response';
import { Message, MessageContent } from '@/components/ai/prompt-kit/message';

function render(element: React.ReactElement): string {
  vi.stubGlobal('React', React);
  try {
    return renderToStaticMarkup(element);
  } finally {
    vi.unstubAllGlobals();
  }
}

describe('Chippi message surfaces', () => {
  it('preserves the sent bubble treatment and open assistant layout', () => {
    const user = render(
      createElement(MessageContent, { role: 'user' }, 'Sent'),
    );
    const assistant = render(
      createElement(MessageContent, { role: 'assistant' }, 'Reply'),
    );

    expect(user).toContain('max-w-[75%]');
    expect(user).toContain('rounded-[1.375rem]');
    expect(user).toContain('bg-foreground');
    expect(user).toContain('text-background');
    expect(assistant).toContain('max-w-full text-foreground');
    expect(assistant).not.toContain('rounded-[1.375rem]');
    expect(assistant).not.toContain('bg-foreground');
  });

  it('offers an opt-in, mount-only entrance without using streamed content as a key', () => {
    const html = render(
      createElement(Message, { role: 'assistant', animateIn: true }, 'Stable row'),
    );

    expect(html).toContain('data-role="assistant"');
    expect(html).toContain('data-animate-in="true"');
    expect(html).not.toContain('key=');
  });
});

describe('StreamingResponse', () => {
  it('marks live content busy and polite without exposing settled actions', () => {
    const html = render(
      createElement(
        StreamingResponse,
        {
          status: 'streaming',
          copyText: 'partial response',
          sources: [{ id: 'crm-1', title: 'CRM record', kind: 'contact' }],
        },
        'partial response',
      ),
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="false"');
    expect(html).not.toContain('Copy response');
    expect(html).not.toContain('1 source');
    expect(html).not.toContain('CRM record');
  });

  it('shows copy and caller-supplied source disclosure only after completion', () => {
    const html = render(
      createElement(
        StreamingResponse,
        {
          status: 'complete',
          copyText: 'settled response',
          sources: [{ id: 'crm-1', title: 'CRM record', kind: 'contact' }],
        },
        'settled response',
      ),
    );

    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('aria-label="Copy response"');
    expect(html).toContain('1 source');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('CRM record');
    // History mounted already complete is not a live region. Only an instance
    // that actually streamed retains the polite announcement lifecycle.
    expect(html).not.toContain('aria-live=');
  });

  it('never clamps or offers disclosure while content is live', () => {
    const live = render(
      createElement(
        StreamingResponse,
        { status: 'streaming', collapse: { collapsedLines: 3 } },
        'A long response that is still arriving.',
      ),
    );
    const settled = render(
      createElement(
        StreamingResponse,
        { status: 'complete', collapse: { collapsedLines: 3 } },
        'A long response that has settled.',
      ),
    );

    expect(live).not.toContain('-webkit-line-clamp');
    expect(live).not.toContain('Show more');
    expect(settled).toContain('-webkit-line-clamp:3');
    expect(settled).toContain('Show more');
  });

  it('gives assistant text one announcement owner and keeps user text unchanged', () => {
    const assistant = render(
      createElement(TextBlockView, {
        block: { type: 'text', content: 'Working reply' },
        role: 'assistant',
        streaming: true,
      }),
    );
    const user = render(
      createElement(TextBlockView, {
        block: { type: 'text', content: 'My request' },
        role: 'user',
      }),
    );

    expect(assistant.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(assistant).toContain('aria-busy="true"');
    expect(user).not.toContain('data-streaming-response');
    expect(user).not.toContain('Copy response');
  });
});
