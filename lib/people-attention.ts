/** Shared, evidence-based ordering for People. A score never outranks a promise. */
export type PersonAttentionInput = {
  work?: {title:string;label:string;dueAt:string;requiresAttention:boolean} | null;
  workUnavailable?: boolean;
  followUpAt?: string | Date | null;
  lastContactedAt?: string | Date | null;
  createdAt: string | Date;
  tags?: string[];
  leadScore?: number | null;
};
const time = (value?: string | Date | null) => value ? new Date(value).getTime() : NaN;
export function personAttention(person: PersonAttentionInput, now = Date.now()) {
  if (person.work?.requiresAttention) return { rank: 0, reason: `${person.work.label} · ${person.work.title}`, due: time(person.work.dueAt) };
  if (person.workUnavailable) return { rank: 1, reason: 'Follow-through status unavailable', due: Infinity };
  const due = time(person.followUpAt);
  if (Number.isFinite(due) && due <= now) return { rank: 0, reason: 'Follow-up overdue', due };
  if (Number.isFinite(due) && due <= now + 86400000) return { rank: 1, reason: 'Follow-up due within 24 hours', due };
  if (!person.lastContactedAt && person.tags?.includes('new-lead')) return { rank: 2, reason: 'New lead · no contact logged', due: time(person.createdAt) };
  return { rank: 3, reason: null, due: Infinity };
}
export function comparePeopleAttention(a: PersonAttentionInput, b: PersonAttentionInput, now = Date.now()) {
  const left = personAttention(a, now), right = personAttention(b, now);
  return left.rank - right.rank || (left.due === right.due ? 0 : left.due - right.due) || (b.leadScore ?? -1) - (a.leadScore ?? -1);
}
