import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

/**
 * POST /api/broker/create
 * Self-serve brokerage creation. Any authenticated, onboarded realtor can create
 * one brokerage. Enforced by the UNIQUE index on Brokerage.ownerId.
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 3 attempts per user per day
  const { allowed } = await checkRateLimit(`broker:create:${clerkId}`, 3, 86400);
  if (!allowed) return NextResponse.json({ error: 'Too many attempts. Try again tomorrow.' }, { status: 429 });

  let name: string;
  try {
    ({ name } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const trimmedName = (typeof name === 'string' ? name : '').trim();
  if (!trimmedName || trimmedName.length > 120) {
    return NextResponse.json({ error: 'Brokerage name required (max 120 chars)' }, { status: 400 });
  }

  // Resolve internal user id
  const { data: user, error: userErr } = await supabase
    .from('User')
    .select('id, onboard, accountType')
    .eq('clerkId', clerkId)
    .maybeSingle();
  if (userErr || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  // Broker-only users are marked onboard during setup even without a Space
  if (!user.onboard) return NextResponse.json({ error: 'Complete onboarding first' }, { status: 403 });

  // Check: does this user already own a brokerage?
  const { data: existing } = await supabase
    .from('Brokerage')
    .select('id')
    .eq('ownerId', user.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'You already own a brokerage' }, { status: 409 });

  // Atomic creation: brokerage + owner membership in one transaction
  const { data: brokerageId, error: rpcError } = await supabase.rpc('create_brokerage_with_owner', {
    p_name: trimmedName,
    p_owner_id: user.id,
  });
  if (rpcError || !brokerageId) {
    console.error('[broker/create] rpc failed', rpcError);
    return NextResponse.json({ error: 'Failed to create brokerage' }, { status: 500 });
  }

  const { data: brokerage, error: fetchErr } = await supabase
    .from('Brokerage')
    .select('*')
    .eq('id', brokerageId)
    .single();
  if (fetchErr) {
    console.error('[broker/create] fetch failed', fetchErr);
    return NextResponse.json({ error: 'Brokerage created but failed to fetch details' }, { status: 500 });
  }

  void audit({ actorClerkId: clerkId, action: 'CREATE', resource: 'Brokerage', resourceId: brokerageId, metadata: { name: trimmedName } });

  return NextResponse.json({ brokerage }, { status: 201 });
}
