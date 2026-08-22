import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { tenantTable } from '@/lib/tenant-db';

/**
 * GET — Compare multiple applicants side by side.
 * Query params: slug, ids (comma-separated contact IDs)
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const idsParam = req.nextUrl.searchParams.get('ids');

  if (!slug || !idsParam) {
    return NextResponse.json({ error: 'slug and ids required' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;

  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
  if (ids.length < 2) {
    return NextResponse.json({ error: 'At least 2 IDs required' }, { status: 400 });
  }

  const { data: contacts } = await tenantTable(supabase, 'Contact', { spaceId: auth.space.id })
    .select('id, name, email, phone, budget, leadType, leadScore, scoreLabel, scoreSummary, applicationData, applicationStatus, createdAt')
    .in('id', ids);

  if (!contacts?.length) {
    return NextResponse.json({ error: 'No contacts found' }, { status: 404 });
  }

  return NextResponse.json(contacts);
}
