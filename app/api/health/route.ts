import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const checks: Record<string, unknown> = {
    DATABASE_URL_SET: !!process.env.DATABASE_URL,
    DATABASE_URL_PREFIX: process.env.DATABASE_URL?.substring(0, 30) + '...',
  };

  try {
    const rows = await sql`SELECT 1 AS ok`;
    checks.db = 'connected';
    checks.result = rows;
  } catch (err) {
    checks.db = 'error';
    checks.error = err instanceof Error ? err.message : String(err);
  }

  try {
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    checks.tables = tables.map((r: Record<string, unknown>) => r.table_name);
  } catch (err) {
    checks.tables_error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(checks);
}
