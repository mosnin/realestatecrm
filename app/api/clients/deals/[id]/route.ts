import { NextResponse, type NextRequest } from 'next/server';
import { getClientUser } from '@/lib/client-auth';
import { getClientDeal } from '@/lib/client-deals';

export const runtime = 'nodejs';

/**
 * GET /api/clients/deals/[id] — one deal, scoped to the signed-in client.
 *
 * The id is caller-supplied and is used ONLY to filter the client's already-
 * resolved (verified-email → Contact → DealContact) deal set. A deal the client
 * is not a party to returns 404 — identical to a non-existent id, so the
 * endpoint never reveals whether a given deal exists. FAIL CLOSED.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getClientUser();
  if (!user?.emailVerifiedAt) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const deal = await getClientDeal(user.email, id);
  if (!deal) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ deal });
}
