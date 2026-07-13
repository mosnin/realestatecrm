import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const dialogFiles = [
  'app/s/[slug]/calendar/calendar-view.tsx',
  'components/communication/email-inbox-view.tsx',
  'components/contacts/compose-email-dialog.tsx',
  'components/contacts/contact-form.tsx',
  'components/leads/convert-lead-dialog.tsx',
  'components/ui/intro-disclosure.tsx',
];

describe('dialog accessibility descriptions', () => {
  it.each(dialogFiles)('%s describes its dialog content', (path) => {
    const source = readFileSync(path, 'utf8');

    expect(source).toContain('DialogContent');
    expect(source).toContain('DialogDescription');
  });
});
