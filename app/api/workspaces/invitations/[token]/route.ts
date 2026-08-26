import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { acceptSpaceInvitation } from '@/lib/workspaces';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? '';
  const { data: user } = await supabase
    .from('User')
    .select('id, email')
    .eq('clerkId', userId)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: 'Finish setup first, then open the invite again.' }, { status: 409 });

  const { token } = await params;
  const result = await acceptSpaceInvitation({
    token,
    userId: user.id,
    email: user.email || email,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ slug: result.slug });
}
