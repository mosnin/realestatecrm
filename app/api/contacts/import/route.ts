import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';

const VALID_TYPES = new Set(['QUALIFICATION', 'TOUR', 'APPLICATION']);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, rows } = body as {
    slug: string;
    rows: {
      name: string;
      phone?: string | null;
      email?: string | null;
      budget?: number | null;
      type?: string | null;
      notes?: string | null;
    }[];
  };

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!Array.isArray(rows) || rows.length === 0)
    return NextResponse.json({ error: 'rows required' }, { status: 400 });
  if (rows.length > 500)
    return NextResponse.json({ error: 'Maximum 500 rows per import' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  // Rate limit: max 5 imports per user per hour
  const { allowed } = await checkRateLimit(`import:${userId}`, 5, 3600);
  if (!allowed) return NextResponse.json({ error: 'Import rate limit exceeded. Try again later.' }, { status: 429 });

  const now = new Date().toISOString();
  const inserts = rows
    .filter((r) => r.name?.trim())
    .map((r) => ({
      id: crypto.randomUUID(),
      spaceId: space.id,
      name: r.name.trim(),
      phone: r.phone?.trim() || null,
      email: r.email?.trim() || null,
      budget: r.budget != null && !isNaN(parseFloat(String(r.budget))) && parseFloat(String(r.budget)) >= 0 ? parseFloat(String(r.budget)) : null,
      type: r.type && VALID_TYPES.has(r.type) ? r.type : 'QUALIFICATION',
      notes: r.notes?.trim() || null,
      tags: [],
      properties: [],
      scoringStatus: 'unscored',
      createdAt: now,
      updatedAt: now,
    }));

  if (inserts.length === 0)
    return NextResponse.json({ error: 'No valid rows (name is required)' }, { status: 400 });

  const { error } = await supabase.from('Contact').insert(inserts);
  if (error) {
    console.error('[import] insert error:', error);
    return NextResponse.json({ error: 'Failed to import contacts' }, { status: 500 });
  }

  return NextResponse.json({ created: inserts.length });
}
