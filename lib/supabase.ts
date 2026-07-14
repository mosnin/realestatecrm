import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { wrapGuard } from '@/lib/supabase-guard';

// Lazy-initialized Supabase client.
// Created on first use so the build can succeed without env vars.
// Auth is handled by Clerk — we use the service role key (bypasses RLS)
// because all database access is server-side only. Because the service role
// bypasses RLS, the `.eq('spaceId'|'brokerageId', …)` filter on each query IS
// the tenant boundary — so the client is wrapped in the tenant-scope guard
// (lib/supabase-guard.ts), which is a no-op unless TENANT_GUARD=1.
let _client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Add them to your Vercel project settings or .env.local file.'
    );
  }

  _client = wrapGuard(createClient(url, key));
  return _client;
}

// Convenience export — a Proxy that lazily initializes on first property access.
// This lets consumers write `supabase.from(...)` without calling `getSupabase()`.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabase();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
