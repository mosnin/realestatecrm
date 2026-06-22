import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const migration = readFileSync(
  path.join(ROOT, 'supabase/migrations/20260729000000_chat_message_parent_space_constraints.sql'),
  'utf8',
);
const schema = readFileSync(path.join(ROOT, 'supabase/schema.sql'), 'utf8');

describe('realtor chat message parent-space migration', () => {
  it('normalizes existing Message.spaceId from the parent Conversation before validating', () => {
    expect(migration).toContain('UPDATE "Message" m');
    expect(migration).toContain('SET "spaceId" = c."spaceId"');
    expect(migration).toContain('FROM "Conversation" c');
    expect(migration).toContain('m."spaceId" IS DISTINCT FROM c."spaceId"');
  });

  it('adds and validates a composite FK from Message to Conversation space scope', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_id_spaceId_key"');
    expect(migration).toContain('CONSTRAINT "Message_conversation_space_fk"');
    expect(migration).toContain('FOREIGN KEY ("conversationId", "spaceId")');
    expect(migration).toContain('REFERENCES "Conversation" ("id", "spaceId")');
    expect(migration).toContain('VALIDATE CONSTRAINT "Message_conversation_space_fk"');
  });

  it('keeps the canonical schema in sync with the parent-space invariant', () => {
    expect(schema).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_id_spaceId_key"');
    expect(schema).toContain('CONSTRAINT "Message_conversation_space_fk"');
    expect(schema).toContain('REFERENCES "Conversation" ("id", "spaceId")');
  });
});
