export interface Commitment {
  id: string; contactId: string; title: string; instruction: string; kind: 'commitment' | 'handoff';
  dueAt: string; status: 'open' | 'accepted' | 'completed' | 'canceled';
  scheduledMessageId: string | null; acceptedAt: string | null; completedAt: string | null;
  completionNote: string | null;
  delivery?: { status: string; detail: Record<string, unknown> | null } | null;
}
export function commitmentState(item: Commitment, now = Date.now()): string {
  if (item.status === 'canceled') return 'Canceled';
  if (item.delivery?.status === 'sent') return 'Sent';
  if (item.status === 'completed') return 'Completed';
  if (item.scheduledMessageId && !item.delivery) return 'Delivery unavailable';
  if (item.delivery?.status === 'failed') return 'Needs attention';
  if (item.delivery?.status === 'drafted') return 'Needs attention';
  if (item.delivery?.status === 'canceled') return 'Canceled';
  if (item.delivery?.status === 'sending') return 'Delivery in progress';
  if (new Date(item.dueAt).getTime() < now) return item.scheduledMessageId ? 'Awaiting delivery' : 'Overdue';
  return item.scheduledMessageId ? 'Scheduled to send' : item.status === 'accepted' ? 'Accepted' : 'Needs you';
}
