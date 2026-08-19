/**
 * Realtor-facing copy for an approval pause. The model-facing summariseCall
 * often includes truncated ids; this layer prefers a short action question
 * and labeled fields the realtor can actually read.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTION_TITLES: Record<string, string> = {
  send_email: 'Allow this email to send?',
  send_sms: 'Allow this text to send?',
  move_deal_stage: 'Move this deal?',
  create_deal: 'Create this deal?',
  add_person: 'Add this person?',
  set_followup: 'Set this follow-up?',
  clear_followup: 'Clear this follow-up?',
  mark_deal_won: 'Mark this deal won?',
  mark_deal_lost: 'Mark this deal lost?',
  schedule_tour: 'Schedule this tour?',
  reschedule_tour: 'Reschedule this tour?',
  create_automation: 'Create this automation?',
  note_on_person: 'Save this note?',
  note_on_deal: 'Save this note?',
  note_on_property: 'Save this note?',
  add_property: 'Add this property?',
  delete_contact: 'Delete this person?',
  delete_deal: 'Delete this deal?',
  delete_property: 'Delete this property?',
  delete_tour: 'Cancel this tour?',
};

const FIELD_LABELS: Record<string, string> = {
  title: 'Deal',
  name: 'Name',
  when: 'When',
  stage: 'Stage',
  stageName: 'Stage',
  subject: 'Subject',
  body: 'Message',
  toEmail: 'To',
  toPhone: 'To',
  value: 'Value',
  address: 'Address',
  description: 'Description',
  reason: 'Reason',
  note: 'Note',
  startsAt: 'Starts',
  durationMinutes: 'Minutes',
  leadType: 'Type',
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

export function permissionPromptTitle(name: string, summary: string): string {
  if (ACTION_TITLES[name]) return ACTION_TITLES[name];
  const cleaned = summary.replace(/\s+/g, ' ').trim();
  if (!cleaned || looksTechnical(cleaned)) return 'Allow this action?';
  return cleaned.endsWith('?') ? cleaned : `${cleaned}?`;
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

function formatFieldValue(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Number.isInteger(raw) && raw >= 1000
      ? `$${raw.toLocaleString('en-US')}`
      : String(raw);
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || UUID_RE.test(trimmed)) return null;
  return trimmed.length > 220 ? `${trimmed.slice(0, 217)}…` : trimmed;
}

function looksTechnical(text: string): boolean {
  return UUID_RE.test(text) || /[0-9a-f]{8}-[0-9a-f]{4}/i.test(text);
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}
