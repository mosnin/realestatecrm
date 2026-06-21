import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260727000000_chat_message_parent_scope_constraints.sql',
);
const schemaPath = path.join(process.cwd(), 'supabase/schema.sql');

function sql(filePath: string) {
  return readFileSync(filePath, 'utf8');
}

describe('chat message parent-scope constraints migration', () => {
  it('heals child brokerageId drift before validating constraints', () => {
    const body = sql(migrationPath);

    expect(body).toContain('UPDATE "BrokerMessage" bm');
    expect(body).toContain('SET "brokerageId" = bc."brokerageId"');
    expect(body).toContain('UPDATE "BrokerageChatMessage" bcm');
    expect(body).toContain('SET "brokerageId" = bcc."brokerageId"');
  });

  it('adds composite foreign keys tying message brokerageId to parent conversation brokerageId', () => {
    const body = sql(migrationPath);

    expect(body).toContain('"BrokerMessage_conversation_brokerage_fk"');
    expect(body).toContain('FOREIGN KEY ("conversationId", "brokerageId")');
    expect(body).toContain('REFERENCES "BrokerConversation" ("id", "brokerageId")');
    expect(body).toContain('"BrokerageChatMessage_conversation_brokerage_fk"');
    expect(body).toContain('REFERENCES "BrokerageChatConversation" ("id", "brokerageId")');
    expect(body).toContain('VALIDATE CONSTRAINT "BrokerMessage_conversation_brokerage_fk"');
    expect(body).toContain('VALIDATE CONSTRAINT "BrokerageChatMessage_conversation_brokerage_fk"');
  });

  it('keeps canonical schema in sync with composite parent-scope constraints', () => {
    const body = sql(schemaPath);

    expect(body).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "BrokerConversation_id_brokerageId_key"');
    expect(body).toContain('CONSTRAINT "BrokerMessage_conversation_brokerage_fk"');
    expect(body).toContain('REFERENCES "BrokerConversation" ("id", "brokerageId")');
    expect(body).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "BrokerageChatConversation_id_brokerageId_key"');
    expect(body).toContain('CONSTRAINT "BrokerageChatMessage_conversation_brokerage_fk"');
    expect(body).toContain('REFERENCES "BrokerageChatConversation" ("id", "brokerageId")');
  });
});
