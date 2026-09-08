import { brokerageUrl } from '@/lib/workspaces/brokerage-request';
import { brokerageSwitchDestination } from '@/lib/workspaces/navigation';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get('purpose') === 'prefetch' || request.headers.has('next-router-prefetch')) return new Response(null, { status: 204 });
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site)) return new Response(null, { status: 403 });
  const { userId } = await auth();
  if (!userId) return new Response(null, { status: 401 });
  const { id } = await context.params;
  const { data: user, error } = await supabase.from('User').select('id, status, platformRole').eq('clerkId', userId).maybeSingle();
  if (error || !user || user.status === 'offboarded' || user.platformRole === 'banned') return new Response(null, { status: 403 });
  const { data: member, error: memberError } = await unscoped(supabase.from('BrokerageMembership'), 'validate explicit workspace switch against current membership').select('role').eq('userId', user.id).eq('brokerageId', id).maybeSingle();
  if (memberError || !member || !['broker_owner', 'broker_admin', 'realtor_member'].includes(member.role)) return new Response(null, { status: 403 });
  const response = NextResponse.redirect(new URL(brokerageUrl(brokerageSwitchDestination(new URL(request.url).searchParams.get('next'), member.role), id), request.url));
  response.headers.set('cache-control', 'no-store');
  response.cookies.set('chippi-brokerage', id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return response;
}
