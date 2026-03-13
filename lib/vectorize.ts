import { embedText } from '@/lib/embeddings';
import { upsertVector, deleteVector } from '@/lib/zilliz';
import type { Deal, ApplicationData } from '@/lib/types';

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
  applicationData?: ApplicationData | null;
  leadScore?: number | null;
  scoreLabel?: string | null;
  scoreSummary?: string | null;
};

export async function syncContact(contact: VectorContact) {
  const app = contact.applicationData;

  const parts = [
    contact.name,
    contact.email,
    contact.phone,
    contact.address,
    contact.notes,
    contact.preferences,
    (contact.properties ?? []).join(' '),
    contact.budget != null ? `Budget: $${contact.budget}` : null,
    contact.type,
    contact.tags.join(' '),
  ];

  // Enrich with application data for better semantic search
  if (app) {
    if (app.propertyAddress) parts.push(`Property: ${app.propertyAddress}`);
    if (app.unitType) parts.push(`Unit: ${app.unitType}`);
    if (app.targetMoveInDate) parts.push(`Move-in: ${app.targetMoveInDate}`);
    if (app.monthlyRent != null) parts.push(`Rent: $${app.monthlyRent}`);
    if (app.employmentStatus) parts.push(`Employment: ${app.employmentStatus}`);
    if (app.employerOrSource) parts.push(`Employer: ${app.employerOrSource}`);
    if (app.monthlyGrossIncome != null) parts.push(`Income: $${app.monthlyGrossIncome}/mo`);
    if (app.currentAddress) parts.push(`Current address: ${app.currentAddress}`);
    if (app.currentHousingStatus) parts.push(`Housing: ${app.currentHousingStatus}`);
    if (app.reasonForMoving) parts.push(`Reason: ${app.reasonForMoving}`);
    if (app.adultsOnApplication != null) parts.push(`Adults: ${app.adultsOnApplication}`);
    if (app.childrenOrDependents != null) parts.push(`Children: ${app.childrenOrDependents}`);
    if (app.hasPets != null) parts.push(`Pets: ${app.hasPets ? (app.petDetails ?? 'Yes') : 'No'}`);
    if (app.priorEvictions != null && app.priorEvictions) parts.push('Prior evictions');
    if (app.smoking != null && app.smoking) parts.push('Smoker');
  }

  // Include score summary for semantic relevance
  if (contact.scoreSummary) parts.push(`Score: ${contact.scoreSummary}`);
  if (contact.scoreLabel) parts.push(`Priority: ${contact.scoreLabel}`);

  const text = parts.filter(Boolean).join(' ');

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

export async function syncDeal(deal: Deal & { stage?: { name: string } | null }) {
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
