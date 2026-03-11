import { auth } from '@clerk/nextjs/server';

/**
 * Admin authorization contract:
 *
 * Admin status is determined by Clerk publicMetadata.role === 'admin'.
 * This is set via the Clerk Dashboard or Clerk Backend API.
 *
 * To grant admin access:
 *   1. Go to Clerk Dashboard → Users → select user → Metadata
 *   2. Set publicMetadata to: { "role": "admin" }
 *   Or use clerkClient:
 *     await clerkClient.users.updateUser(userId, {
 *       publicMetadata: { role: 'admin' }
 *     })
 *
 * publicMetadata is included in the session token (sessionClaims)
 * so admin checks are fast and don't require extra API calls.
 *
 * IMPORTANT: Every admin route, API endpoint, and server action
 * must call requireAdmin() or isAdmin() before performing any work.
 */

type AdminCheckResult = {
  isAdmin: boolean;
  userId: string | null;
  email?: string;
};

/**
 * Check if the current user is an admin. Non-throwing.
 * Returns { isAdmin, userId } for use in conditional logic.
 */
export async function checkAdmin(): Promise<AdminCheckResult> {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return { isAdmin: false, userId: null };
  }

  const metadata = (session.sessionClaims?.publicMetadata ?? {}) as Record<string, unknown>;
  const role = metadata.role;

  return {
    isAdmin: role === 'admin',
    userId,
  };
}

/**
 * Require admin access. Throws if not admin.
 * Use in server components, server actions, and API routes.
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  const result = await checkAdmin();

  if (!result.isAdmin || !result.userId) {
    throw new Error('Forbidden: admin access required');
  }

  return { userId: result.userId };
}

/**
 * Log an admin action for audit purposes.
 * Logs to structured console output for now.
 * Can be extended to write to a DB audit table later.
 */
export function logAdminAction(params: {
  actor: string;
  action: string;
  target?: string;
  details?: Record<string, unknown>;
}) {
  console.info('[admin-audit]', {
    ...params,
    timestamp: new Date().toISOString(),
  });
}
