import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'app/api/broker/leads/export/route.ts'), 'utf8');

describe('broker leads export scope', () => {
  it('exports only lead-tagged contacts from verified member spaces', () => {
    expect(source).toContain(".eq('brokerageId', brokerage.id)");
    expect(source).toContain("supabase.from('Space').select('id, ownerId').in('ownerId', memberUserIds)");
    expect(source).toContain(".in('spaceId', spaceIds)\n    .contains('tags', ['new-lead'])");
    expect(source).not.toContain(".in('spaceId', spaceIds)\n    .order('createdAt'");
  });
});
