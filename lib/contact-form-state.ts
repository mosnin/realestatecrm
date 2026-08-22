/**
 * Values for the People add/edit dialog.
 *
 * react-hook-form only reads `defaultValues` on mount. The edit dialog stays
 * mounted with empty defaults until a contact is chosen, so saving without a
 * reset writes blanks over the live row (email, phone, notes, tags, …).
 * Call `contactFormResetValues` every time the dialog opens.
 */

import { CONTACT_STAGES } from '@/lib/constants';

export const CONTACT_FORM_TYPES = ['QUALIFICATION', 'TOUR', 'APPLICATION'] as const;
export type ContactFormType = (typeof CONTACT_FORM_TYPES)[number];

export type ContactFormFieldValues = {
  name: string;
  email: string;
  phone: string;
  budget: string;
  preferences: string;
  address: string;
  notes: string;
  type: ContactFormType;
  tags: string;
};

export type ContactFormDefaults = Partial<ContactFormFieldValues> & {
  properties?: string;
};

export type ContactEditorSource = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  budget?: number | null;
  preferences?: string | null;
  properties?: string[] | null;
  address?: string | null;
  notes?: string | null;
  type?: string | null;
  tags?: string[] | null;
};

function asType(value: string | null | undefined): ContactFormType {
  if (value && (CONTACT_FORM_TYPES as readonly string[]).includes(value)) {
    return value as ContactFormType;
  }
  return CONTACT_STAGES[0].key as ContactFormType;
}

/** Split a comma-separated chip field. Empty / missing → []. */
export function parseChipList(raw?: string | null): string[] {
  if (!raw) return [];
  return raw.split(',').map((part) => part.trim()).filter(Boolean);
}

export function joinChipList(values?: string[] | null): string {
  return (Array.isArray(values) ? values : []).join(', ');
}

/** Map a list-row contact onto the dialog's defaultValues shape. */
export function contactEditorDefaults(contact: ContactEditorSource): ContactFormDefaults {
  return {
    name: contact.name ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    budget: contact.budget != null ? String(contact.budget) : '',
    preferences: contact.preferences ?? '',
    properties: joinChipList(contact.properties),
    address: contact.address ?? '',
    notes: contact.notes ?? '',
    type: asType(contact.type),
    tags: joinChipList(contact.tags),
  };
}

/**
 * Snapshot applied when the dialog opens. Always includes every form field so
 * a remount / reset cannot leave a prior add-draft in the inputs.
 */
export function contactFormResetValues(
  defaultValues?: ContactFormDefaults | null,
): { values: ContactFormFieldValues; properties: string[] } {
  return {
    values: {
      name: defaultValues?.name ?? '',
      email: defaultValues?.email ?? '',
      phone: defaultValues?.phone ?? '',
      budget: defaultValues?.budget ?? '',
      preferences: defaultValues?.preferences ?? '',
      address: defaultValues?.address ?? '',
      notes: defaultValues?.notes ?? '',
      type: asType(defaultValues?.type),
      tags: defaultValues?.tags ?? '',
    },
    properties: parseChipList(defaultValues?.properties),
  };
}

/** Tags-only convert-to-client patch — never resend the rest of the row. */
export function convertLeadTagPatch(currentTags: unknown): { tags: string[] } {
  const tags = Array.isArray(currentTags)
    ? currentTags.filter((t): t is string => typeof t === 'string')
    : [];
  return {
    tags: tags.filter((t) => t !== 'application-link' && t !== 'new-lead'),
  };
}
