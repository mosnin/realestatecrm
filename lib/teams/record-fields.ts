export const RECORD_KINDS = ['contact', 'deal', 'property'] as const;
export type RecordKind = typeof RECORD_KINDS[number];
export const SHARED_RECORD_FIELDS = {
  contact: { table: 'Contact', title: 'name', columns: 'id, name, email, phone, leadType' },
  deal: { table: 'Deal', title: 'title', columns: 'id, title, status, value, closeDate' },
  property: { table: 'Property', title: 'address', columns: 'id, address, city, listingStatus, listPrice, beds, baths' },
} as const;
