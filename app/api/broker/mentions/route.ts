import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { getBrokerageMembers } from '@/lib/brokerage-members';

/**
 * GET /api/broker/mentions?search=<q>
 *
 * Powers the broker chat's `@` mention picker. The realtor mention search
 * hits space-scoped `/api/contacts` + `/api/deals`; the broker surface has no
 * single space, so this endpoint resolves the whole brokerage's member spaces
 * and searches contacts + deals ACROSS them — returning the shared
 * `MentionItem` shape ({ id, type: 'contact' | 'deal', label, subtitle }).
 *
 * Tenant scoping (the `.eq`/`.in` IS the boundary): every read is bounded to
 * the spaceIds owned by THIS brokerage's members, derived from the
 * authenticated broker context — never from the request. A caller outside the
 * brokerage role gets 403 before any read.
 */
export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { brokerage } = ctx;

  const search = (req.nextUrl.searchParams.get('search') ?? '').trim();

  // Resolve every member space in the brokerage — the tenant boundary for the
  // reads below. Fall back to the owner's own spaces if memberships are empty.
  const members = await getBrokerageMembers(brokerage.id, { includeSpaceName: true });
  const memberSpaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];
  let spaceIds = [...new Set(memberSpaceIds)];
  if (spaceIds.length === 0) {
    const { data: ownerSpaces } = await supabase
      .from('Space')
      .select('id')
      .eq('ownerId', brokerage.ownerId)
      .limit(10);
    spaceIds = (ownerSpaces ?? []).map((s: { id: string }) => s.id);
  }
  if (spaceIds.length === 0) return NextResponse.json([]);

  const results: Array<{ id: string; type: 'contact' | 'deal'; label: string; subtitle?: string }> = [];

  // ── Contacts across the brokerage ────────────────────────────────────────
  let contactQuery = supabase
    .from('Contact')
    .select('id, name, email, phone')
    .in('spaceId', spaceIds)
    .limit(10);
  if (search) {
    // Case-insensitive OR across name/email/phone. Escape %,_ and PostgREST's
    // OR delimiters (comma / parens) so a stray char can't break the filter.
    const safe = search.replace(/[%_,()]/g, ' ');
    contactQuery = contactQuery.or(
      `name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
    );
  }
  const { data: contacts } = await contactQuery;
  for (const c of (contacts ?? []) as Array<{ id: string; name: string | null; email: string | null; phone: string | null }>) {
    results.push({
      id: c.id,
      type: 'contact',
      label: c.name ?? c.email ?? 'Unnamed contact',
      subtitle: c.email ?? c.phone ?? undefined,
    });
  }

  // ── Deals across the brokerage ───────────────────────────────────────────
  let dealQuery = supabase
    .from('Deal')
    .select('id, title, value, address')
    .in('spaceId', spaceIds)
    .limit(10);
  if (search) {
    const safe = search.replace(/[%_,()]/g, ' ');
    dealQuery = dealQuery.ilike('title', `%${safe}%`);
  }
  const { data: deals } = await dealQuery;
  for (const d of (deals ?? []) as Array<{ id: string; title: string | null; value: number | null; address: string | null }>) {
    results.push({
      id: d.id,
      type: 'deal',
      label: d.title ?? 'Untitled deal',
      subtitle: d.value ? `$${Number(d.value).toLocaleString()}` : d.address ?? undefined,
    });
  }

  return NextResponse.json(results);
}
