import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const globalForSupabase = globalThis as unknown as {
  supabase: SupabaseClient | undefined;
};

export function getSupabaseClient(): SupabaseClient {
  if (globalForSupabase.supabase) return globalForSupabase.supabase;

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  if (process.env.NODE_ENV !== 'production') {
    globalForSupabase.supabase = client;
  }

  return client;
}

export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
