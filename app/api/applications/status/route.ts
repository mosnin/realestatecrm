import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireContactAccess } from '@/lib/api-auth';

/**
 * PATCH — Update application status (agent-facing, authenticated).
 * Used from the contact detail page to change application status.
 */
export async function PATCH(req: NextRequest) {
  const { contactId, status, statusNote } = await req.json();

  if (!contactId || !status) {
    return NextResponse.json({ error: 'contactId and status required' }, { status: 400 });
  }

  const validStatuses = ['received', 'under_review', 'approved', 'needs_info', 'declined'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const auth = await requireContactAccess(contactId);
  if (auth instanceof NextResponse) return auth;

  const update: Record<string, any> = {
    applicationStatus: status,
    updatedAt: new Date().toISOString(),
  };
  if (statusNote !== undefined) {
    update.applicationStatusNote = statusNote?.trim() || null;
  }

  const { error } = await supabase
    .from('Contact')
    .update(update)
    .eq('id', contactId);

  if (error) throw error;

  return NextResponse.json({ success: true, status });
}
