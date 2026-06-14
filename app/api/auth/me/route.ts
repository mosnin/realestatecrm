import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { resolveSelfServePlan } from '@/lib/plans';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: user } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .maybeSingle();
  if (!user) return NextResponse.json({ slug: null, plan: 'solo' });

  const { data: space } = await supabase
    .from('Space')
    .select('slug, plan')
    .eq('ownerId', user.id)
    .maybeSingle();

  // `plan` is the buyer's chosen self-serve tier persisted at onboarding
  // (resolveSelfServePlan normalizes legacy 'free'/unset rows to 'solo'), so
  // /subscribe can display + charge the right tier after Clerk's redirects.
  return NextResponse.json({
    slug: space?.slug ?? null,
    plan: resolveSelfServePlan(space?.plan),
  });
}
