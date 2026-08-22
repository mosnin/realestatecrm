/**
 * Duplicate-contact detection.
 *
 *   GET /api/contacts/duplicates?slug=<space>
 *     → { groups: DuplicateGroup[], scanned, capped }
 *
 * SPACE-SCOPED: loads only `.eq('spaceId', space.id)` contacts (and excludes
 * brokerage leads, mirroring the People view), then runs the pure grouping in
 * lib/contact-dedup.ts. A contact from another workspace can never appear in a
 * group because it is never loaded.
 *
 * Read-only — finds candidates, mutates nothing. The merge happens via
 * POST /api/contacts/merge after the realtor reviews a preview.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { groupDuplicates, DEDUP_SCAN_CAP, type DedupContact } from '@/lib/contact-dedup';
import { tenantTable } from '@/lib/tenant-db';

/** Slim row the detector returns to the client (enough to render a preview). */
type DupRow = DedupContact & {
  type: string;
  tags: string[] | null;
  leadScore: number | null;
  budget: number | null;
};

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Load this space's contacts, newest first, capped. Duplicates are
  // overwhelmingly recent (double-submits, re-imports), so the most-recent
  // slice catches the vast majority while keeping the O(n^2) scan bounded.
  const { data, error } = await tenantTable(supabase, 'Contact', { spaceId: space.id })
    .select('id, name, email, phone, type, tags, leadScore, budget, createdAt')
    .is('brokerageId', null) // exclude brokerage leads (shown on /broker/leads)
    .order('createdAt', { ascending: false })
    .limit(DEDUP_SCAN_CAP);

  if (error) {
    console.error('[contacts/duplicates] query error:', error);
    return NextResponse.json({ error: 'Failed to scan for duplicates' }, { status: 500 });
  }

  const rows = (data ?? []) as DupRow[];
  const groups = groupDuplicates(rows);

  return NextResponse.json({
    groups,
    scanned: rows.length,
    capped: rows.length >= DEDUP_SCAN_CAP,
  });
}
