import { expect, it, vi } from 'vitest';
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'test-clerk-user' })),
  currentUser: vi.fn(async () => ({ emailAddresses: [{ emailAddress: 'test@example.com' }] })),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gt', 'order', 'limit']) chain[method] = () => chain;
  chain.maybeSingle = async () => ({ data: table === 'Invitation' ? { token: 'test-invite' } : null, error: null });
  return chain;
} } }));
import AuthRedirectPage from '@/app/auth/redirect/page';
it('preserves a valid pending invitation through the real Next redirect exception', async () => {
  await expect(AuthRedirectPage({ searchParams: Promise.resolve({ intent: 'realtor' }) }))
    .rejects.toMatchObject({ digest: expect.stringContaining(';/invite/test-invite;') });
});
