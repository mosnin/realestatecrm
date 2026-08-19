/**
 * Realtor-facing copy for an approval pause. The model-facing summariseCall
 * often includes truncated ids; this layer prefers a short action question
 * and labeled fields the realtor can actually read.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELD_LABELS: Record<string, string> = {
  title: 'Deal',
  dealTitle: 'Deal',
  name: 'Name',
  personName: 'Name',
  when: 'When',
  stage: 'Stage',
  stageName: 'Stage',
  toStageName: 'Stage',
  subject: 'Subject',
  body: 'Message',
  toEmail: 'To',
  toPhone: 'To',
  value: 'Value',
  address: 'Address',
  propertyAddress: 'Address',
  description: 'Description',
  reason: 'Reason',
  note: 'Note',
  startsAt: 'Starts',
  durationMinutes: 'Minutes',
  leadType: 'Type',
  guestName: 'Guest',
};

const SKIP_KEYS = new Set([
  'contactId',
  'dealId',
  'personId',
  'stageId',
  'tourId',
  'propertyId',
  'id',
  'workbookId',
  'artifactId',
  'sourceVersionNumber',
  'operations',
]);

export interface PermissionField {
  label: string;
  value: string;
}

export function permissionPromptTitle(
  name: string,
  summary: string,
  args?: Record<string, unknown> | null,
): string {
  const subject = firstHuman(
    args?.dealTitle,
    args?.title,
    args?.name,
    args?.personName,
    args?.address,
    args?.propertyAddress,
    args?.guestName,
  );
  const stage = firstHuman(args?.stageName, args?.toStageName, args?.stage);
  const when = firstHuman(args?.when);

  switch (name) {
    case 'send_email':
      return 'Allow this email to send?';
    case 'send_sms':
      return 'Allow this text to send?';
    case 'move_deal_stage':
      if (subject && stage) return `Move ${subject} to ${stage}?`;
      if (subject) return `Move ${subject}?`;
      return 'Move this deal?';
    case 'create_deal':
      return subject ? `Create deal "${subject}"?` : 'Create this deal?';
    case 'add_person':
      return subject ? `Add ${subject}?` : 'Add this person?';
    case 'set_followup':
      if (subject && when) return `Set a follow-up for ${subject} (${when})?`;
      if (subject) return `Set a follow-up for ${subject}?`;
      if (when) return `Set this follow-up (${when})?`;
      return 'Set this follow-up?';
    case 'clear_followup':
      return subject ? `Clear the follow-up for ${subject}?` : 'Clear this follow-up?';
    case 'mark_deal_won':
      return subject ? `Mark ${subject} won?` : 'Mark this deal won?';
    case 'mark_deal_lost':
      return subject ? `Mark ${subject} lost?` : 'Mark this deal lost?';
    case 'schedule_tour':
      return subject ? `Schedule a tour at ${subject}?` : 'Schedule this tour?';
    case 'reschedule_tour':
      return 'Reschedule this tour?';
    case 'create_automation':
      return 'Create this automation?';
    case 'note_on_person':
    case 'note_on_deal':
    case 'note_on_property':
      return 'Save this note?';
    case 'add_property':
      return subject ? `Add ${subject}?` : 'Add this property?';
    case 'delete_contact':
      return subject ? `Delete ${subject}?` : 'Delete this person?';
    case 'delete_deal':
      return subject ? `Delete ${subject}?` : 'Delete this deal?';
    case 'delete_property':
      return subject ? `Delete ${subject}?` : 'Delete this property?';
    case 'delete_tour':
    case 'cancel_tour':
      return 'Cancel this tour?';
    default:
      break;
  }

  const cleaned = summary.replace(/\s+/g, ' ').trim();
  if (!cleaned || looksTechnical(cleaned)) return 'Allow this action?';
  return cleaned.endsWith('?') ? cleaned : `${cleaned}?`;
}

/** Hide UUID-heavy summariseCall text from the approval chrome. */
export function permissionPromptDescription(summary: string): string | undefined {
  const cleaned = summary.replace(/\s+/g, ' ').trim();
  if (!cleaned || looksTechnical(cleaned)) return undefined;
  return cleaned;
}

export function permissionArgFields(
  name: string,
  args: Record<string, unknown> | null | undefined,
): PermissionField[] {
  if (!args) return [];
  if (name === 'send_email' || name === 'send_sms') return [];

  const fields: PermissionField[] = [];
  for (const [key, raw] of Object.entries(args)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = formatFieldValue(raw);
    if (!value) continue;
    fields.push({
      label: FIELD_LABELS[key] ?? humanizeKey(key),
      value,
    });
    if (fields.length >= 6) break;
  }
  return fields;
}

export function firstHuman(...values: unknown[]): string | null {
  for (const raw of values) {
    const value = formatFieldValue(raw);
    if (value) return value;
  }
  return null;
}

export function formatFieldValue(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Number.isInteger(raw) && raw >= 1000
      ? `$${raw.toLocaleString('en-US')}`
      : String(raw);
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || UUID_RE.test(trimmed) || looksTechnical(trimmed)) return null;
  return trimmed.length > 220 ? `${trimmed.slice(0, 217)}…` : trimmed;
}

export function looksTechnical(text: string): boolean {
  return UUID_RE.test(text) || /[0-9a-f]{8}-[0-9a-f]{4}/i.test(text);
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}
