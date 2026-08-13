import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260915000023_conversation_mode_lock.sql',
  'utf8',
);

describe('conversation mode database contract', () => {
  it('stores only Chat or Work and locks the conversation row during first claim', () => {
    expect(sql).toContain("CHECK (mode IS NULL OR mode IN ('chat', 'work'))");
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain("p_mode NOT IN ('chat', 'work')");
  });

  it('keeps populated legacy threads in Chat instead of retyping them later', () => {
    expect(sql).toContain('FROM public."Message"');
    expect(sql).toContain("AND role = 'user'");
    expect(sql).toContain("THEN 'chat' ELSE p_mode END");
  });

  it('keeps the claim authority service-only', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.claim_conversation_mode(text,text,text) FROM PUBLIC');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.claim_conversation_mode(text,text,text) TO service_role');
  });
});
