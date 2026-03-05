import { embedText } from '@/lib/embeddings';
import { upsertVector, deleteVector } from '@/lib/zilliz';
import type { Contact, Deal } from '@prisma/client';

export async function syncContact(contact: Contact) {
  const text = [
    contact.name,
    contact.email,
    contact.phone,
    contact.address,
    contact.notes,
    contact.type,
    contact.tags.join(' ')
  ]
    .filter(Boolean)
    .join(' ');

  const vector = await embedText(text);
  await upsertVector(
    contact.spaceId,
    `contact_${contact.id}`,
    'contact',
    contact.id,
    text,
    vector
  );
}

export async function syncDeal(deal: Deal & { stage?: { name: string } }) {
  const text = [
    deal.title,
    deal.description,
    deal.address,
    deal.priority,
    deal.stage?.name,
    deal.value != null ? `$${deal.value}` : null
  ]
    .filter(Boolean)
    .join(' ');

  const vector = await embedText(text);
  await upsertVector(
    deal.spaceId,
    `deal_${deal.id}`,
    'deal',
    deal.id,
    text,
    vector
  );
}

export async function deleteContactVector(spaceId: string, contactId: string) {
  await deleteVector(spaceId, `contact_${contactId}`);
}

export async function deleteDealVector(spaceId: string, dealId: string) {
  await deleteVector(spaceId, `deal_${dealId}`);
}
