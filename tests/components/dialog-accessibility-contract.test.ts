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

const sheetFiles = [
  'app/admin/components/admin-shell.tsx',
  'components/chippi/approvals-pill.tsx',
  'components/dashboard/header.tsx',
  'components/deals/deal-quick-panel.tsx',
];

const drawerFiles = ['components/ui/intro-disclosure.tsx'];

describe('dialog accessibility descriptions', () => {
  it.each(dialogFiles)('%s describes its dialog content', (path) => {
    const source = readFileSync(path, 'utf8');

    expect(source).toContain('DialogContent');
    expect(source).toContain('DialogDescription');
  });

  it.each(sheetFiles)('%s describes its sheet content', (path) => {
    const source = readFileSync(path, 'utf8');

    expect(source).toContain('SheetContent');
    expect(source).toContain('SheetDescription');
  });

  it.each(drawerFiles)('%s describes its drawer content', (path) => {
    const source = readFileSync(path, 'utf8');

    expect(source).toContain('DrawerContent');
    expect(source).toContain('DrawerDescription');
  });
});
