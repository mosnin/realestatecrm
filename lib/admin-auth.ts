import { auth, currentUser } from '@clerk/nextjs/server';

const ADMIN_ROLE = 'admin';

function getAllowedAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function getAdminAuth() {
  const { userId } = await auth();
  if (!userId) {
    return { isAuthenticated: false, isAdmin: false, userId: null as string | null };
  }

  const user = await currentUser();
  if (!user) {
    return { isAuthenticated: true, isAdmin: false, userId };
  }

  const role = typeof user.publicMetadata?.role === 'string' ? user.publicMetadata.role : null;
  const primaryEmail = user.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? null;
  const allowlisted = primaryEmail ? getAllowedAdminEmails().has(primaryEmail) : false;

  return {
    isAuthenticated: true,
    isAdmin: role === ADMIN_ROLE || allowlisted,
    userId,
    role,
    primaryEmail
  };
}

export function isValidAdminRole(role: string): role is 'admin' | 'member' {
  return role === 'admin' || role === 'member';
}
