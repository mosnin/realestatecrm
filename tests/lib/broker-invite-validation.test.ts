import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const inviteRoute = readFileSync(join(process.cwd(), 'app/api/broker/invite/route.ts'), 'utf8');
const bulkRoute = readFileSync(join(process.cwd(), 'app/api/broker/invite/bulk/route.ts'), 'utf8');

describe('broker invite validation', () => {
  it('rejects overlong emails instead of truncating them', () => {
    expect(inviteRoute).toContain('trimmedEmail.length > 320');
    expect(bulkRoute).toContain('email.length > 320');
    expect(inviteRoute).not.toContain('.slice(0, 320)');
    expect(bulkRoute).not.toContain('.slice(0, 320)');
  });

  it('rejects invalid explicit bulk roles instead of defaulting to realtor_member', () => {
    expect(bulkRoute).toContain("entry.role && !['broker_admin', 'realtor_member'].includes(entry.role)");
    expect(bulkRoute).toContain("results.push({ email, status: 'error', error: 'Invalid role' })");
    expect(bulkRoute).toContain("const roleToAssign = entry.role === 'broker_admin' ? 'broker_admin' : 'realtor_member'");
  });

  it('checks seat capacity against syntactically valid new bulk invite rows only', () => {
    expect(bulkRoute).toContain('const validInviteEmails = Array.from(new Set(');
    expect(bulkRoute).toContain("const roleIsValid = !entry.role || ['broker_admin', 'realtor_member'].includes(entry.role)");
    expect(bulkRoute).toContain('const existingMemberEmails = new Set<string>()');
    expect(bulkRoute).toContain('const pendingInviteEmails = new Set<string>()');
    expect(bulkRoute).toContain("validInviteEmails.filter((email) => !existingMemberEmails.has(email) && !pendingInviteEmails.has(email)).length");
    expect(bulkRoute).toContain('checkSeatCapacity(brokerage.id, requestedSeatCount)');
    expect(bulkRoute).not.toContain('checkSeatCapacity(brokerage.id, entries.length)');
  });
});
