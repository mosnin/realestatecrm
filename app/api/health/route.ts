import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  const checks: Record<string, unknown> = {
    SUPABASE_URL_SET: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_KEY_SET: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  try {
    const { data, error } = await supabase.from('User').select('id').limit(1);
    if (error) throw error;
    checks.db = 'connected';
    checks.result = data;
  } catch (err) {
    checks.db = 'error';
    checks.error = err instanceof Error ? err.message : String(err);
  }

  try {
    const knownTables = [
      'Contact',
      'DealStage',
      'Space',
      'SpaceSetting',
      'User',
    ];
    checks.tables = knownTables;
  } catch (err) {
    checks.tables_error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(checks);
}
