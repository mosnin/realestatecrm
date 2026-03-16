import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { scoreLeadApplication } from '@/lib/lead-scoring';
import type { Contact } from '@/lib/types';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;

  const { data: rows, error: fetchError } = await supabase
    .from('Contact')
    .select('*')
    .eq('id', id);
  if (fetchError) throw fetchError;
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contact = rows[0] as Contact;

  const space = await getSpaceForUser(userId);
  if (!space || contact.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Mark as pending while scoring
  await supabase
    .from('Contact')
    .update({ scoringStatus: 'pending' })
    .eq('id', id);

  const result = await scoreLeadApplication({
    contactId: id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone ?? '',
    budget: contact.budget,
    applicationData: contact.applicationData,
  });

  const { error: updateError } = await supabase
    .from('Contact')
    .update({
      scoringStatus: result.scoringStatus,
      leadScore: result.leadScore,
      scoreLabel: result.scoreLabel,
      scoreSummary: result.scoreSummary,
      scoreDetails: result.scoreDetails,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) throw updateError;

  return NextResponse.json(result);
}
