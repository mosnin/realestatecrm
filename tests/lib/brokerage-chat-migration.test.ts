import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260726000000_brokerage_chat_separate_storage.sql',
);
const schemaPath = path.join(process.cwd(), 'supabase/schema.sql');

function sql(filePath: string) {
  return readFileSync(filePath, 'utf8');
}

describe('brokerage team chat structural-storage migration', () => {
  it('creates dedicated brokerage-scoped conversation and message tables', () => {
    const body = sql(migrationPath);

    expect(body).toContain('CREATE TABLE IF NOT EXISTS "BrokerageChatConversation"');
    expect(body).toContain('"brokerageId" text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE');
    expect(body).toContain('CREATE TABLE IF NOT EXISTS "BrokerageChatMessage"');
    expect(body).toContain('"conversationId" text NOT NULL REFERENCES "BrokerageChatConversation"(id) ON DELETE CASCADE');
  });

  it('backfills legacy [BROKERAGE_CHAT] rows without deleting live shared-table rows', () => {
    const body = sql(migrationPath);

    expect(body).toContain("WHERE c.\"title\" LIKE '[BROKERAGE_CHAT] %'");
    expect(body).toContain('INSERT INTO "BrokerageChatConversation"');
    expect(body).toContain('INSERT INTO "BrokerageChatMessage"');
    expect(body).toContain('ON CONFLICT ("id") DO NOTHING');
    const executableSql = body
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(executableSql).not.toMatch(/DELETE\s+FROM\s+"Conversation"/i);
    expect(executableSql).not.toMatch(/DELETE\s+FROM\s+"Message"/i);
  });

  it('enables RLS on the new team chat tables in the same migration', () => {
    const body = sql(migrationPath);

    expect(body).toContain('ALTER TABLE IF EXISTS "BrokerageChatConversation" ENABLE ROW LEVEL SECURITY');
    expect(body).toContain('ALTER TABLE IF EXISTS "BrokerageChatMessage"      ENABLE ROW LEVEL SECURITY');
  });

  it('keeps the canonical schema in sync with the new tables', () => {
    const body = sql(schemaPath);

    expect(body).toContain('CREATE TABLE IF NOT EXISTS "BrokerageChatConversation"');
    expect(body).toContain('CREATE TABLE IF NOT EXISTS "BrokerageChatMessage"');
    expect(body).toContain('"senderUserId"   text REFERENCES "User"(id) ON DELETE SET NULL');
  });
});
