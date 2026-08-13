import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260915000025_conversation_execution_mode.sql',
  'utf8',
);

describe('conversation Work policy migration', () => {
  it('stores a bounded execution policy and versioned active goal', () => {
    expect(sql).toContain('"executionMode" text NOT NULL DEFAULT \'autonomous\'');
    expect(sql).toContain("CHECK (\"executionMode\" IN ('review', 'autonomous'))");
    expect(sql).toContain('"workGoalVersion" bigint NOT NULL DEFAULT 0');
    expect(sql).toContain('"workGoalVersion" = conversation."workGoalVersion" + 1');
  });

  it('fences goal persistence to the exact Work conversation and service role', () => {
    expect(sql).toContain('conversation.id = p_conversation_id');
    expect(sql).toContain('conversation."spaceId" = p_space_id');
    expect(sql).toContain("conversation.mode = 'work'");
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.set_conversation_work_goal(text,text,text) FROM PUBLIC',
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.set_conversation_work_goal(text,text,text) TO service_role',
    );
  });
});

