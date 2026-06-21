import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const migration = readFileSync(
  path.join(ROOT, 'supabase/migrations/20260728000000_chat_scoped_message_read_indexes.sql'),
  'utf8',
);
const schema = readFileSync(path.join(ROOT, 'supabase/schema.sql'), 'utf8');

describe('scoped chat message read indexes', () => {
  it('indexes realtor message reads by space, conversation, and time', () => {
    const expected = '"Message_spaceId_conversationId_createdAt_idx"';
    expect(migration).toContain(expected);
    expect(migration).toContain('ON "Message" ("spaceId", "conversationId", "createdAt")');
    expect(schema).toContain(expected);
  });

  it('indexes broker message reads by brokerage, conversation, and time', () => {
    const expected = '"BrokerMessage_brokerageId_conversationId_createdAt_idx"';
    expect(migration).toContain(expected);
    expect(migration).toContain('ON "BrokerMessage" ("brokerageId", "conversationId", "createdAt")');
    expect(schema).toContain(expected);
  });

  it('keeps brokerage team chat aligned with the same scoped-read pattern', () => {
    const expected = '"BrokerageChatMessage_brokerageId_conversationId_createdAt_idx"';
    expect(migration).toContain(expected);
    expect(migration).toContain('ON "BrokerageChatMessage" ("brokerageId", "conversationId", "createdAt")');
    expect(schema).toContain(expected);
  });
});
