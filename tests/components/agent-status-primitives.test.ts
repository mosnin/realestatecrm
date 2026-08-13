import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AgentApprovalCard,
  type AgentApprovalCardProps,
  AgentProgress,
  AgentToolResult,
  AgentTodoList,
  ImageGeneration,
  ToolApproval,
  agentTodoListStatus,
  boundedTodoProgress,
  formatAgentElapsed,
  normalizeReasoningPhrases,
} from '@/components/ai/agent-status';
import { isPreGroundedReasoningLabel } from '@/components/ai/blocks/thinking-indicator';

describe('agent loading state primitives', () => {
  it('uses a stable safe reasoning label and does not add rotating copy', () => {
    expect(normalizeReasoningPhrases(undefined)).toEqual(['Thinking…']);
    expect(normalizeReasoningPhrases([' Thinking… ', '', 'Thinking…'])).toEqual([
      'Thinking…',
    ]);
    expect(isPreGroundedReasoningLabel('Thinking…')).toBe(true);
    expect(isPreGroundedReasoningLabel('Reading workspace context…')).toBe(false);
  });

  it('formats and renders controlled elapsed progress without a live region', () => {
    expect(formatAgentElapsed(4.8)).toBe('4s');
    expect(formatAgentElapsed(151.6)).toBe('2m 31s');

    const html = renderToStaticMarkup(createElement(AgentProgress, {
      elapsedSeconds: 4.8,
      revealAfterSeconds: 2.5,
    }));
    expect(html).toContain('4s');
    expect(html).not.toContain('aria-live');
  });
});

describe('grounded agent todo primitive', () => {
  it('uses only caller-supplied task status and progress', () => {
    const items = [
      { id: 'inspect', title: 'Inspect the data flow', status: 'completed' as const },
      {
        id: 'verify',
        title: 'Run checks',
        status: 'in-progress' as const,
        progress: 25,
        detail: 'Runtime reported 25%',
      },
    ];

    expect(agentTodoListStatus(items)).toBe('working');
    expect(boundedTodoProgress(undefined)).toBeNull();
    expect(boundedTodoProgress(140)).toBe(100);

    const html = renderToStaticMarkup(createElement(AgentTodoList, { items }));
    expect(html).toContain('Inspect the data flow');
    expect(html).toContain('Run checks');
    expect(html).toContain('aria-valuenow="25"');
    expect(html.match(/role="progressbar"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-live');
  });
});

describe('BEUI-adapted agent surfaces', () => {
  it('renders a truthful review-mode approval disclosure', () => {
    const html = renderToStaticMarkup(createElement(
      ToolApproval,
      {
        tool: 'send_email',
        title: 'Allow Chippi to send this email?',
        description: 'One message to jane@example.com',
        status: 'pending',
      },
      createElement('p', null, 'Subject: Showing tomorrow'),
    ));

    expect(html).toContain('data-beui-surface="tool-approval"');
    expect(html).toContain('data-state="pending"');
    expect(html).toContain('Approval required');
    expect(html).toContain('Subject: Showing tomorrow');
  });

  it('renders bounded tool output without inventing a retry action', () => {
    const html = renderToStaticMarkup(createElement(
      AgentToolResult,
      {
        tool: 'terminal.run',
        title: 'Tests passed',
        kind: 'terminal',
        status: 'success',
        defaultOpen: true,
        copyText: '49 pass · 0 fail',
      },
      createElement('pre', null, '49 pass · 0 fail'),
    ));

    expect(html).toContain('data-beui-surface="tool-result"');
    expect(html).toContain('data-state="success"');
    expect(html).toContain('49 pass · 0 fail');
    expect(html).not.toMatch(/retry/i);
  });

  it('labels approval cards and image-generation state from caller-owned truth', () => {
    const approval = renderToStaticMarkup(createElement(
      AgentApprovalCard,
      {
        title: 'Choose the follow-up date',
        interactive: true,
      } as AgentApprovalCardProps,
      createElement('button', { type: 'button' }, 'Friday'),
    ));
    const image = renderToStaticMarkup(createElement(ImageGeneration, {
      status: 'queued',
      prompt: 'A twilight listing hero for 10 Main Street',
    }));

    expect(approval).toContain('data-beui-surface="approval-card"');
    expect(approval).toContain('Response needed');
    expect(image).toContain('data-beui-surface="image-generation"');
    expect(image).toContain('data-state="queued"');
    expect(image).toContain('Waiting to generate');
  });
});
