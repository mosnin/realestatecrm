import { describe, expect, it } from 'vitest';
import { decideRoute } from '@/lib/chat/router';
import { getChatTools } from '@/lib/ai-tools/toolsets';
import { buildSystemPrompt } from '@/lib/ai-tools/system-prompt';
import type { ToolContext } from '@/lib/ai-tools/types';
import { chatRuntime } from '@/lib/ai-tools/runtime-flag';

const namesFor = (message: string) =>
  getChatTools(message, { workMode: true }).map((tool) => tool.name);

const ctx: ToolContext = {
  userId: 'user-1',
  space: { id: 'space-1', slug: 'demo', name: 'Demo Realty', ownerId: 'owner-1' },
  signal: new AbortController().signal,
  workMode: true,
};

describe('Work intent-to-execution contract', () => {
  it('keeps the in-process Fast runtime on by default', () => {
    const previous = process.env.CHIPPI_CHAT_RUNTIME;
    delete process.env.CHIPPI_CHAT_RUNTIME;
    expect(chatRuntime()).toBe('ts');
    if (previous === undefined) delete process.env.CHIPPI_CHAT_RUNTIME;
    else process.env.CHIPPI_CHAT_RUNTIME = previous;
  });

  it('routes a property valuation request to tools, not to ungrounded direct prose', () => {
    expect(decideRoute('Analyze nearby property values for 10 Main Street')).toBe('agent');
    const names = namesFor('Analyze nearby property values for 10 Main Street');
    expect(names).toContain('analyze_property_values');
    expect(names).not.toContain('add_property');
    expect(names).not.toContain('update_property_status');
    expect(names).not.toContain('delete_property');
  });

  it('makes explicit send mutually exclusive with draft tools', () => {
    const names = namesFor('Send an email to Jane about tomorrow\'s showing');
    expect(names).toContain('send_email');
    expect(names).not.toContain('draft_email');
    expect(names).not.toContain('draft_sms');
    expect(names).not.toContain('start_work_session');
    expect(names).not.toContain('cancel_tour');
    expect(names).not.toContain('delete_tour');
  });

  it('makes explicit drafting mutually exclusive with send tools', () => {
    const names = namesFor('Draft an email to Jane about tomorrow\'s showing');
    expect(names).toContain('draft_email');
    expect(names).not.toContain('send_email');
    expect(names).not.toContain('send_sms');
  });

  it('exposes real contact creation without a draft or background-work escape hatch', () => {
    const names = namesFor('Create a contact named Jane Smith with jane@example.com');
    expect(names).toContain('add_person');
    expect(names).not.toContain('draft_email');
    expect(names).not.toContain('start_work_session');
    expect(names).not.toContain('archive_person');
    expect(names).not.toContain('merge_persons');
    expect(names).not.toContain('delete_contact');
  });

  it('exposes a native automation creator', () => {
    const names = namesFor('Create an automation that emails every new lead immediately');
    expect(names).toContain('create_automation');
    expect(names).not.toContain('draft_email');
    expect(names).not.toContain('start_work_session');
    expect(names).not.toContain('send_email');
    expect(names).not.toContain('add_person');
  });

  it('gives the model explicit no-hallucination and execute-the-verb rules', () => {
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain('analyze_property_values');
    expect(prompt).toMatch(/address.*missing.*ask/i);
    expect(prompt).toMatch(/send_email.*never.*draft_email/i);
    expect(prompt).toContain('create_automation');
    expect(prompt).toContain('add_person');
  });
});
