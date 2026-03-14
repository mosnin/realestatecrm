/**
 * Central permission helpers for the org/role system.
 *
 * Three account levels:
 *   1. Realtor (default) — solo workspace owner
 *   2. Broker — has a BrokerageMembership with role broker_owner or broker_manager
 *   3. Platform Admin — User.platformRole = 'admin' (or Clerk metadata fallback)
 *
 * Always use these helpers in API routes, server actions, and layouts.
 * Never scatter raw role checks across the codebase.
 */

import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import type { Brokerage, BrokerageMembership } from '@/lib/types';

// ── Platform admin ────────────────────────────────────────────────────────────

/**
 * Returns true if the current Clerk user is a platform admin.
 * Primary check: User.platformRole = 'admin' in DB.
 * Fallback: Clerk publicMetadata.role = 'admin' (backwards-compat with existing admins).
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session.userId) return false;

  // Fast fallback from session claims (no extra DB query)
  const metadata = (session.sessionClaims?.publicMetadata ?? {}) as Record<string, unknown>;
  if (metadata.role === 'admin') return true;

  // Authoritative check in DB
  const { data } = await supabase
    .from('User')
    .select('platformRole')
    .eq('clerkId', session.userId)
    .maybeSingle();
  return data?.platformRole === 'admin';
}

/**
 * Require platform admin access. Throws if not admin.
 * Use at the top of admin route handlers and server components.
 */
export async function requirePlatformAdmin(): Promise<{ clerkUserId: string }> {
  const session = await auth();
  if (!session.userId) throw new Error('Forbidden: not authenticated');

  const ok = await isPlatformAdmin();
  if (!ok) throw new Error('Forbidden: platform admin access required');

  return { clerkUserId: session.userId };
}

// ── Broker ────────────────────────────────────────────────────────────────────

type BrokerContext = {
  brokerage: Brokerage;
  membership: BrokerageMembership;
  dbUserId: string;
};

/**
 * Returns the brokerage + membership for the current user if they are a broker
 * (role = broker_owner or broker_manager), or null if they are not.
 */
export async function getBrokerContext(): Promise<BrokerContext | null> {
  const session = await auth();
  if (!session.userId) return null;

  const { data: user } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', session.userId)
    .maybeSingle();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('BrokerageMembership')
    .select('*')
    .eq('userId', user.id)
    .in('role', ['broker_owner', 'broker_manager'])
    .maybeSingle();
  if (!membership) return null;

  const { data: brokerage } = await supabase
    .from('Brokerage')
    .select('*')
    .eq('id', membership.brokerageId)
    .maybeSingle();
  if (!brokerage) return null;

  return {
    brokerage: brokerage as Brokerage,
    membership: membership as BrokerageMembership,
    dbUserId: user.id,
  };
}

/**
 * Require broker access. Throws if the current user is not a broker.
 */
export async function requireBroker(): Promise<BrokerContext> {
  const ctx = await getBrokerContext();
  if (!ctx) throw new Error('Forbidden: broker access required');
  return ctx;
}

// ── Shared auth helper ────────────────────────────────────────────────────────

/**
 * Resolve the current Clerk user to their internal User row.
 * Returns null if not authenticated or not in DB.
 */
export async function getCurrentDbUser(): Promise<{ id: string; clerkId: string } | null> {
  const session = await auth();
  if (!session.userId) return null;

  const { data } = await supabase
    .from('User')
    .select('id, clerkId')
    .eq('clerkId', session.userId)
    .maybeSingle();
  return data ?? null;
}
