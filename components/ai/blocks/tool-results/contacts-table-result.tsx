'use client';

/**
 * Renders a `display: 'contacts'` tool result as the tool-ui DataTable.
 *
 * The tool returns `{ contacts: [...] }`; we map to the table's serializable
 * shape and validate via `safeParseSerializableDataTable` before rendering.
 * On a malformed payload we return null so the dispatch can fall back to the
 * legacy ContactsResult card stack.
 */

import { DataTable } from '@/components/tool-ui/data-table';
import { safeParseSerializableDataTable } from '@/components/tool-ui/data-table/schema';
import { CompactResultList } from './compact-result-list';
import { buildContactsTable, type ContactRowInput } from './tool-ui-mappers';

export function ContactsTableResult({ contacts }: { contacts: ContactRowInput[] }) {
  if (!contacts?.length) return null;
  const payload = buildContactsTable(contacts);
  const parsed = safeParseSerializableDataTable(payload);
  if (!parsed) return null;
  return (
    <CompactResultList
      noun="person"
      plural="people"
      items={contacts.map((contact) => ({
        id: contact.id,
        title: contact.name,
        subtitle: [contact.scoreLabel, contact.email].filter(Boolean).join(' · ') || undefined,
      }))}
    >
      <div className="mt-2 md:mt-0">
        <DataTable {...parsed} />
      </div>
    </CompactResultList>
  );
}
