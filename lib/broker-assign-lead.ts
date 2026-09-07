import { supabase } from '@/lib/supabase';
import { notifyNewLead } from '@/lib/notify';


export type AssignLeadResult =
  | { ok: true; newContactId: string; assignedToSpaceId: string }
  | { ok: false; error: string; status: number };

/**
 * Assign a brokerage lead (Contact) from the broker's space into a realtor's
 * space: clone the contact, mark the original as assigned, notify the realtor.
 *
 * Shared by POST /api/broker/assign-lead and the /assign team-chat command so
 * the two can never drift. Callers MUST verify the caller is a broker who can
 * manage leads before calling this — it performs no auth of its own.
 */
export async function assignLeadToRealtor(params: {
  brokerage: { id: string; ownerId: string; name: string };
  assignedByUserId: string;
  contactId: string;
  realtorUserId: string;
}): Promise<AssignLeadResult> {
  const { brokerage, assignedByUserId, contactId, realtorUserId } = params;

  const { data, error } = await supabase.rpc('assign_broker_lead', {
    p_brokerage_id: brokerage.id,
    p_actor_id: assignedByUserId,
    p_contact_id: contactId,
    p_realtor_id: realtorUserId,
  });
  if (error) throw error;
  if (!data || typeof data.ok !== 'boolean') throw new Error('Assignment receipt missing');
  if (!data.ok) return { ok: false, error: data.error, status: data.status };
  const { newContactId, assignedToSpaceId } = data;
  if (typeof newContactId !== 'string' || typeof assignedToSpaceId !== 'string') throw new Error('Invalid assignment receipt');
  // A retried request returns the existing clone and never sends a duplicate notice.
  if (data.replayed) return { ok: true, newContactId, assignedToSpaceId };
  const contact = data.contact;
  // ── Notify the realtor (best-effort — never fail the assignment) ───────
  try {
    await notifyNewLead({
      spaceId: assignedToSpaceId,
      contactId: newContactId,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      leadScore: contact.leadScore,
      scoreLabel: contact.scoreLabel,
      scoreSummary: contact.scoreSummary,
      applicationData: contact.applicationData,
    });
  } catch (e) {
    console.error('[assign-lead] notification failed:', { newContactId, e });
  }

  return { ok: true, newContactId, assignedToSpaceId: assignedToSpaceId };
}
