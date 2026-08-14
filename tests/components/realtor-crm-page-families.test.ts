import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

const FAMILY_SURFACES = [
  {
    family: 'relationship-directory',
    file: 'components/contacts/contact-table.tsx',
    heading: 'People worth staying close to.',
    work: 'aria-label="Contact directory"',
    action: 'Add person',
  },
  {
    family: 'lead-intake',
    file: 'app/s/[slug]/leads/page.tsx',
    heading: 'Turn interest into a first conversation.',
    work: '<LeadsView',
    action: 'Share intake link',
  },
  {
    family: 'follow-up-desk',
    file: 'components/follow-ups/follow-ups-view.tsx',
    heading: 'Close the distance.',
    work: 'Follow-up outlook',
    action: 'Plan outreach',
  },
  {
    family: 'deal-pipeline',
    file: 'components/deals/deals-page-client.tsx',
    heading: 'Move the deal that can close next.',
    work: '<KanbanBoard',
    action: 'Tell Chippi',
  },
  {
    family: 'offer-negotiation',
    file: 'app/s/[slug]/offers/page.tsx',
    heading: 'Turn the right offer into a signed deal.',
    work: '<OffersClient',
    action: 'Offer volume',
  },
  {
    family: 'broker-review-room',
    file: 'app/s/[slug]/reviews/page.tsx',
    heading: 'Clear the question. Keep the deal moving.',
    work: '<ReviewsClient',
    action: 'open reviews',
  },
  {
    family: 'calendar-command',
    file: 'app/s/[slug]/calendar/calendar-view.tsx',
    heading: 'Protect the time that closes deals.',
    work: '<MonthView',
    action: 'onAdd=',
  },
  {
    family: 'email-command',
    file: 'app/s/[slug]/communication/communication-view.tsx',
    heading: 'Reply while the conversation is warm.',
    work: '<EmailInboxView',
    action: 'Source of truth',
  },
  {
    family: 'team-room',
    file: 'app/s/[slug]/messages/page.tsx',
    heading: 'Keep the handoff moving.',
    work: '<MessagesApp',
    action: 'Channels for shared context.',
  },
  {
    family: 'unified-inbox',
    file: 'app/s/[slug]/inbox/page.tsx',
    heading: 'Never lose the thread.',
    work: 'lg:grid-cols-[20rem_1fr]',
    action: '<DraftReply',
  },
  {
    family: 'call-memory',
    file: 'app/s/[slug]/calls/calls-view.tsx',
    heading: 'Call once. Remember every detail.',
    work: 'Recent calls',
    action: 'Make the next conversation count.',
  },
] as const;

describe('realtor CRM route families', () => {
  it.each(FAMILY_SURFACES)(
    '$family has route-specific orientation, working geometry, and action',
    ({ family, file, heading, work, action }) => {
      const source = read(file);
      expect(source).toContain(`data-page-family="${family}"`);
      expect(source).toContain(heading);
      expect(source).toContain(work);
      expect(source).toContain(action);
    },
  );

  it('keeps the operational contracts behind the redesigned surfaces', () => {
    const contracts: Array<[string, string[]]> = [
      ['components/contacts/contact-table.tsx', ["fetch('/api/contacts/bulk'", '<CsvImportModal', '<DuplicatesPanel']],
      ['components/leads/leads-view.tsx', ['<ConvertLeadDialog', 'downloadLeadsCSV', 'handleSaveView']],
      ['components/follow-ups/follow-ups-view.tsx', ["method: 'PATCH'", 'handleMarkDone', 'handleSnooze']],
      ['components/deals/deals-page-client.tsx', ['onFocusChange={setFocus}', '<KanbanBoard', 'handleSaveDealView']],
      ['app/s/[slug]/offers/offers-client.tsx', ["method: 'POST'", "method: 'DELETE'", 'handleTransition']],
      ['app/s/[slug]/calendar/calendar-view.tsx', ['setViewPersisted', '<AddEventModal', 'onSlotTap']],
      ['components/communication/email-inbox-view.tsx', ['handleSend', 'handleStarToggle', 'fetchPage']],
      ['components/messaging/messages-app.tsx', ['const send = async', 'createChannel', 'onPickFiles']],
      ['app/s/[slug]/inbox/page.tsx', [".eq('spaceId', space.id)", '<DraftReply']],
      ['app/s/[slug]/calls/calls-view.tsx', ["fetch('/api/calls'", "method: 'POST'", 'setExpanded']],
    ];

    for (const [file, markers] of contracts) {
      const source = read(file);
      for (const marker of markers) expect(source, `${file}: ${marker}`).toContain(marker);
    }
  });

  it('uses genuinely different primary work geometries instead of one repeated card grid', () => {
    expect(read('components/contacts/contact-table.tsx')).toContain('divide-y divide-border/60');
    expect(read('components/deals/deals-page-client.tsx')).toContain('<KanbanBoard');
    expect(read('app/s/[slug]/calendar/calendar-view.tsx')).toContain('grid-cols-[64px_repeat(7');
    expect(read('app/s/[slug]/inbox/page.tsx')).toContain('lg:grid-cols-[20rem_1fr]');
    expect(read('app/s/[slug]/offers/offers-client.tsx')).toContain('data-offer-board="negotiation-lanes"');
    expect(read('app/s/[slug]/messages/page.tsx')).toContain('<MessagesApp');
  });
});
