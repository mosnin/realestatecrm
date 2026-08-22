/**
 * GET /api/agent/contact-context/[contactId]
 * Returns the active goal type and most recent agent action for a contact.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { tenantTable } from '@/lib/tenant-db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { contactId } = await params;

  // Validate contact belongs to this space
  const { data: contact } = await tenantTable(supabase, 'Contact', { spaceId: space.id })
    .select('id')
    .eq('id', contactId)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [goalRes, activityRes] = await Promise.all([
    tenantTable(supabase, 'AgentGoal', { spaceId: space.id })
      .select('goalType')
      .eq('contactId', contactId)
      .eq('status', 'active')
      .order('priority', { ascending: false })
      .limit(1)
      .maybeSingle(),

    tenantTable(supabase, 'ContactActivity', { spaceId: space.id })
      .select('content, createdAt')
      .eq('contactId', contactId)
      .or('content.like.[Agent]%,content.like.[Outcome]%')
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const goalType = goalRes.data?.goalType ?? null;
  let lastAction: string | null = null;
  if (activityRes.data?.content) {
    lastAction = activityRes.data.content
      .replace(/^\[Agent\]\s*/, '')
      .replace(/^\[Outcome\]\s*/, '')
      .slice(0, 80);
  }

  return NextResponse.json({ goalType, lastAction });
}
