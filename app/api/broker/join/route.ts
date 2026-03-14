import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/broker/join
 * Join a brokerage using its invite code.
 * Any authenticated, onboarded user can join. Assigns role: realtor_member.
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let code: string;
  try {
    ({ code } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const normalizedCode = (code ?? '').trim().toUpperCase();
  if (!normalizedCode) {
    return NextResponse.json({ error: 'Invite code required' }, { status: 400 });
  }

  // Resolve current user
  const { data: user } = await supabase
    .from('User')
    .select('id, onboard')
    .eq('clerkId', clerkId)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (!user.onboard) return NextResponse.json({ error: 'Complete onboarding before joining a brokerage' }, { status: 403 });

  // Find brokerage by code
  const { data: brokerage } = await supabase
    .from('Brokerage')
    .select('id, name, status')
    .eq('joinCode', normalizedCode)
    .maybeSingle();

  if (!brokerage) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
  }

  if (brokerage.status === 'suspended') {
    return NextResponse.json({ error: 'This brokerage is currently suspended' }, { status: 403 });
  }

  // Idempotent: already a member?
  const { data: existing } = await supabase
    .from('BrokerageMembership')
    .select('id, role')
    .eq('brokerageId', brokerage.id)
    .eq('userId', user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ brokerageName: brokerage.name, alreadyMember: true }, { status: 200 });
  }

  // Create membership
  const { error: memberErr } = await supabase
    .from('BrokerageMembership')
    .insert({ brokerageId: brokerage.id, userId: user.id, role: 'realtor_member' });

  if (memberErr) {
    console.error('[broker/join] membership insert failed', memberErr);
    return NextResponse.json({ error: 'Failed to join brokerage' }, { status: 500 });
  }

  // Link the user's Space to this brokerage (best-effort)
  const { data: space } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', user.id)
    .maybeSingle();
  if (space) {
    await supabase.from('Space').update({ brokerageId: brokerage.id }).eq('id', space.id);
  }

  return NextResponse.json({ brokerageName: brokerage.name }, { status: 201 });
}
