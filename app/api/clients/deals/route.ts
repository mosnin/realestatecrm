import { NextResponse } from 'next/server';
import { getClientUser } from '@/lib/client-auth';
import { getClientDeals } from '@/lib/client-deals';

export const runtime = 'nodejs';

/**
 * GET /api/clients/deals — the deals the signed-in client is a party to, as
 * client-safe summaries. Scope is the client's VERIFIED EMAIL (resolved server-
 * side via DealContact); no caller input participates in scoping. A client with
 * no linked deals gets an empty list — never another client's deals. FAIL CLOSED.
 */
export async function GET() {
  const user = await getClientUser();
  if (!user?.emailVerifiedAt) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const deals = await getClientDeals(user.email);
  return NextResponse.json({ deals });
}
