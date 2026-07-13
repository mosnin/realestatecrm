'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { setRealtimeAuth } from '@/lib/supabase-browser';

/**
 * Bridge Clerk's session JWT into Supabase Realtime.
 *
 * Supabase Realtime evaluates RLS against the JWT's `sub` claim. Clerk's
 * native Supabase integration adds the required `role: authenticated` claim
 * to the normal session token, so the policies can match
 * `auth.jwt() ->> 'sub'` to `User.clerkId` without a legacy JWT template.
 *
 * Without this hook running (or without the native integration enabled), the
 * client stays on the anon key — every subscription returns zero rows under
 * the post-migration RLS predicates. That's the graceful-degradation path.
 *
 * Refresh strategy:
 *   - Fetch a token on mount.
 *   - Re-fetch every 50 seconds. Clerk session JWTs expire after 60 seconds;
 *     we leave a 10-second buffer so a slow tick can't leave us holding
 *     an expired token.
 *   - On unmount, clear the token (sign-out path), which falls Realtime
 *     back to anon — i.e. no events.
 */
export function useSupabaseRealtimeAuth(): void {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setRealtimeAuth(null);
      return;
    }

    let cancelled = false;

    async function refresh() {
      try {
        const token = await getToken({ skipCache: true });
        if (cancelled) return;
        setRealtimeAuth(token);
      } catch (err) {
        // Authentication can still fail during a transient Clerk outage.
        // Fall back to anon so subscriptions fail closed under RLS without
        // crashing the dashboard.
        console.warn(
          '[supabase-realtime-auth] Could not fetch Clerk session token. Realtime falling back to anon.',
          err,
        );
        setRealtimeAuth(null);
      }
    }

    void refresh();
    // Clerk session JWTs expire after 60s. Force a fresh token at 50s.
    const interval = setInterval(() => void refresh(), 50 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      setRealtimeAuth(null);
    };
  }, [isLoaded, isSignedIn, getToken]);
}
