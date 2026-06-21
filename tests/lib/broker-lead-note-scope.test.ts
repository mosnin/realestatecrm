import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routePath = join(process.cwd(), 'app/api/broker/lead-note/route.ts');
const source = readFileSync(routePath, 'utf8');

describe('broker lead note scoping', () => {
  it('looks up broker notes through explicit broker or member scopes', () => {
    expect(source).toContain(".eq('id', contactId)\n      .eq('spaceId', brokerSpaceId)");
    expect(source).toContain(".eq('id', contactId)\n    .eq('brokerageId', brokerage.id)");
    expect(source).toContain(".eq('brokerageId', brokerage.id)\n    .eq('userId', spaceOwner.ownerId)");
  });

  it('scopes contact note writes to the verified source scope', () => {
    expect(source).toContain("type ContactUpdateScope = { column: 'spaceId' | 'brokerageId'; value: string }");
    expect(source).toContain(".eq('id', contactId)\n      .eq(updateScope.column, updateScope.value)");
  });

  it('binds assigned-copy note sync to the assigned space', () => {
    expect(source).toContain('assignedSpaceId?: string');
    expect(source).toContain(".eq('id', meta.assignedContactId)\n            .eq('spaceId', meta.assignedSpaceId)");
    expect(source).toContain(".eq('id', meta.assignedContactId)\n              .eq('spaceId', meta.assignedSpaceId)");
  });
});
