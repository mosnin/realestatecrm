import { embedText } from '@/lib/embeddings';
import { upsertVector, deleteVector } from '@/lib/zilliz';
import type { Deal } from '@prisma/client';

type VectorContact = {
  id: string;
  spaceId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  preferences?: string | null;
  properties?: string[];
  budget?: number | null;
  type: string;
  tags: string[];
};

export async function syncContact(contact: VectorContact) {
  const text = [
    contact.name,
    contact.email,
    contact.phone,
    contact.address,
    contact.notes,
    contact.preferences,
    (contact.properties ?? []).join(' '),
    contact.budget != null ? `$${contact.budget}` : null,
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
