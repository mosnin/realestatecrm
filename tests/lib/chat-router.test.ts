/**
 * Tests for the Phase 4 dual-path router.
 *
 * The router is a pure function — no I/O — so the surface to cover is the
 * heuristic itself: which messages route 'direct', which route 'agent', and
 * the escalation phrase detector.
 */

import { describe, it, expect } from 'vitest';
import { decideRoute, shouldEscalate, ACTION_VERBS_REGEX } from '@/lib/chat/router';

describe('decideRoute', () => {
  it('routes a generic question to direct', () => {
    expect(decideRoute("what's a CMA?")).toBe('direct');
    expect(decideRoute('Explain the 1031 exchange rules to me.')).toBe('direct');
    expect(decideRoute('What did Preston say in his last note?')).toBe('direct');
    expect(decideRoute('Summarize this for me.')).toBe('direct');
    expect(decideRoute('Who is my hottest lead?')).toBe('direct');
  });

  it('routes action verbs to agent', () => {
    expect(decideRoute('Add Preston as a contact')).toBe('agent');
    expect(decideRoute('Send Preston the follow-up email')).toBe('agent');
    expect(decideRoute('Schedule a tour for tomorrow at 3pm')).toBe('agent');
    expect(decideRoute('Mark this deal as won.')).toBe('agent');
    expect(decideRoute('Draft a check-in message for Sarah')).toBe('agent');
    expect(decideRoute('Create a new deal for 123 Oak Ave')).toBe('agent');
    expect(decideRoute('Update his lead score to 80')).toBe('agent');
    expect(decideRoute('Reach out to the buyer about closing')).toBe('agent');
    expect(decideRoute('Book a showing for Saturday')).toBe('agent');
    expect(decideRoute('Cancel the 5pm tour')).toBe('agent');
    expect(decideRoute('Reply to Sarah saying yes')).toBe('agent');
    expect(decideRoute('Text Preston the address')).toBe('agent');
  });

  it('is case insensitive', () => {
    expect(decideRoute('SEND PRESTON THE EMAIL')).toBe('agent');
    expect(decideRoute('add a contact')).toBe('agent');
    expect(decideRoute('Add a contact')).toBe('agent');
  });

  it('matches action verbs as standalone words, not substrings', () => {
    // 'sending' would be a verb — but the regex is on \badd\b etc., and
    // 'sending' contains 'send' as a prefix word boundary, so it matches.
    // 'addendum' should NOT match \badd\b because of the trailing chars
    // — actually \badd\b matches whole-word 'add' only, so addendum fails.
    expect(decideRoute('The addendum was unclear')).toBe('direct');
    expect(decideRoute('Show me sender info')).toBe('direct');
  });

  it('routes attachments without action verbs to direct (multimodal Q&A)', () => {
    const att = [{ id: 'a1', mimeType: 'image/png' }];
    expect(decideRoute('What is this listing showing?', att)).toBe('direct');
    expect(decideRoute('Summarize this MLS sheet', att)).toBe('direct');
    expect(decideRoute('', att)).toBe('direct');
  });

  it('still routes to agent when both attachments AND action verbs present', () => {
    const att = [{ id: 'a1', mimeType: 'image/png' }];
    expect(decideRoute('Send this photo to Preston', att)).toBe('agent');
    expect(decideRoute('Add this property to the deal', att)).toBe('agent');
  });

  it('empty messages route direct (nothing to act on)', () => {
    expect(decideRoute('')).toBe('direct');
    expect(decideRoute('   ')).toBe('direct');
  });

  it('exposes the action verb regex for documentation', () => {
    expect(ACTION_VERBS_REGEX).toBeInstanceOf(RegExp);
    expect(ACTION_VERBS_REGEX.test('add')).toBe(true);
    expect(ACTION_VERBS_REGEX.test('addendum')).toBe(false);
  });
});

describe('shouldEscalate', () => {
  it('escalates when the model says it would need to actually do something', () => {
    expect(shouldEscalate("I'd need to actually create that contact for you.")).toBe(true);
    expect(shouldEscalate('I would need to actually send that.')).toBe(true);
    expect(shouldEscalate("I'll need to actually create him in the CRM first.")).toBe(true);
    expect(shouldEscalate("Let me create that contact for you.")).toBe(true);
  });

  it('escalates on explicit refusals', () => {
    expect(shouldEscalate("I can't send messages from here.")).toBe(true);
    expect(shouldEscalate("I cannot run that action.")).toBe(true);
    expect(shouldEscalate("I can't actually trigger that.")).toBe(true);
  });

  it('escalates on hand-off language', () => {
    expect(
      shouldEscalate("Let me hand this to Chippi's tools for the actual send."),
    ).toBe(true);
    expect(shouldEscalate("I'll hand this over to the agent.")).toBe(true);
  });

  it('does not escalate on plain Q&A responses', () => {
    expect(shouldEscalate('Preston is your hottest lead — emailed Tuesday.')).toBe(false);
    expect(
      shouldEscalate('A CMA (Comparative Market Analysis) compares recent sales nearby.'),
    ).toBe(false);
    expect(shouldEscalate('This MLS sheet shows a 3-bed, 2-bath at $450k.')).toBe(false);
  });

  it('does not escalate on empty input', () => {
    expect(shouldEscalate('')).toBe(false);
    expect(shouldEscalate('   ')).toBe(false);
  });
});
