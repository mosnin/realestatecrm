import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

describe('realtor quick-create shortcuts', () => {
  it('targets actual creation flows instead of list pages', () => {
    const sidebar = readFileSync(resolve(root, 'components/dashboard/sidebar.tsx'), 'utf8');
    const palette = readFileSync(resolve(root, 'components/command-palette/command-palette.tsx'), 'utf8');

    expect(sidebar).toContain("{ href: `${base}/contacts?new=contact`, label: 'New contact' }");
    expect(sidebar).toContain("{ href: `${base}/deals/new`, label: 'New deal' }");
    expect(sidebar).not.toContain("{ href: `${base}/contacts`, label: 'New contact' }");
    expect(sidebar).not.toContain("{ href: `${base}/deals`, label: 'New deal' }");
    expect(palette).toContain("href: `${base}/contacts?new=contact`");
    expect(palette).toContain("href: `${base}/calendar?new=event`");
  });

  it('hands the contact-create flag into the client table and clears it on close', () => {
    const page = readFileSync(resolve(root, 'app/s/[slug]/contacts/page.tsx'), 'utf8');
    const table = readFileSync(resolve(root, 'components/contacts/contact-table.tsx'), 'utf8');

    expect(page).toContain("openCreateForm={sp.new === 'contact'}");
    expect(table).toContain('if (openCreateForm) setAddOpen(true)');
    expect(table).toContain('onOpenChange={handleAddOpenChange}');
    expect(table).toContain("router.replace(`/s/${slug}/contacts`, { scroll: false })");
  });

  it('opens and clears the calendar event-create handoff', () => {
    const page = readFileSync(resolve(root, 'app/s/[slug]/calendar/page.tsx'), 'utf8');
    const calendar = readFileSync(
      resolve(root, 'app/s/[slug]/calendar/calendar-view.tsx'),
      'utf8',
    );

    expect(page).toContain("openCreateForm={sp.new === 'event'}");
    expect(calendar).toContain('if (openCreateForm && connected)');
    expect(calendar).toContain('onClose={closeAddModal}');
    expect(calendar).toContain("router.replace(`/s/${slug}/calendar`, { scroll: false })");
  });
});
