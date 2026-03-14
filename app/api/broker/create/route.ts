import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/broker/create
 * Self-serve brokerage creation. Any authenticated, onboarded realtor can create
 * one brokerage. Enforced by the UNIQUE index on Brokerage.ownerId.
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let name: string;
  try {
    ({ name } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const trimmedName = (name ?? '').trim();
  if (!trimmedName || trimmedName.length > 120) {
    return NextResponse.json({ error: 'Brokerage name required (max 120 chars)' }, { status: 400 });
  }

  // Resolve internal user id
  const { data: user, error: userErr } = await supabase
    .from('User')
    .select('id, onboard')
    .eq('clerkId', clerkId)
    .maybeSingle();
  if (userErr || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (!user.onboard) return NextResponse.json({ error: 'Complete onboarding first' }, { status: 403 });

  // Check: does this user already own a brokerage?
  const { data: existing } = await supabase
    .from('Brokerage')
    .select('id')
    .eq('ownerId', user.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'You already own a brokerage' }, { status: 409 });

  // Create brokerage
  const { data: brokerage, error: createErr } = await supabase
    .from('Brokerage')
    .insert({ name: trimmedName, ownerId: user.id })
    .select()
    .single();
  if (createErr || !brokerage) {
    console.error('[broker/create] insert failed', createErr);
    return NextResponse.json({ error: 'Failed to create brokerage' }, { status: 500 });
  }

  // Auto-create broker_owner membership
  const { error: memberErr } = await supabase
    .from('BrokerageMembership')
    .insert({ brokerageId: brokerage.id, userId: user.id, role: 'broker_owner' });
  if (memberErr) {
    console.error('[broker/create] membership insert failed', memberErr);
    // Brokerage was created — don't block, but log
  }

  return NextResponse.json({ brokerage }, { status: 201 });
}
