import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/join/route.ts'), 'utf8');

describe('broker join code validation and duplicate race handling', () => {
  it('bounds join-code shape before lookup', () => {
    const normalizedIndex = route.indexOf('const normalizedCode =');
    const requiredIndex = route.indexOf('Invite code required', normalizedIndex);
    const lengthIndex = route.indexOf('normalizedCode.length > 64', requiredIndex);
    const patternIndex = route.indexOf('/^[A-Z0-9_-]+$/.test(normalizedCode)', lengthIndex);
    const lookupIndex = route.indexOf(".from('Brokerage')", patternIndex);

    expect(lengthIndex).toBeGreaterThan(requiredIndex);
    expect(patternIndex).toBeGreaterThan(lengthIndex);
    expect(lookupIndex).toBeGreaterThan(patternIndex);
  });

  it('treats duplicate membership insert races as already-member success', () => {
    const insertIndex = route.indexOf(".from('BrokerageMembership')\n    .insert");
    const memberErrIndex = route.indexOf('if (memberErr)', insertIndex);
    const duplicateCodeIndex = route.indexOf("memberErr.code === '23505'", memberErrIndex);
    const duplicateMessageIndex = route.indexOf("message.includes('duplicate key')", duplicateCodeIndex);
    const alreadyMemberIndex = route.indexOf('alreadyMember: true', duplicateMessageIndex);

    expect(insertIndex).toBeGreaterThan(-1);
    expect(duplicateCodeIndex).toBeGreaterThan(memberErrIndex);
    expect(duplicateMessageIndex).toBeGreaterThan(duplicateCodeIndex);
    expect(alreadyMemberIndex).toBeGreaterThan(duplicateMessageIndex);
  });
});
