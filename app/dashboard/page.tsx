import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { ensureOnboardingBackfill } from '@/lib/onboarding';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // On DB error: render an error UI instead of throwing (avoids generic
  // "Application error" page) and instead of .catch(() => null) (avoids
  // redirect loop by treating DB errors as "user not found").
  let user;
  try {
    const rows = await sql`
      SELECT u.*, s."subdomain" AS "slug", s.id AS "spaceId", s.name AS "spaceName"
      FROM "User" u
      LEFT JOIN "Space" s ON s."ownerId" = u.id
      WHERE u."clerkId" = ${userId}
    `;
    if (rows[0]) {
      const row = rows[0] as Record<string, unknown>;
      user = {
        ...row,
        space: row.spaceId ? { id: row.spaceId as string, slug: row.slug as string, name: row.spaceName as string } : null,
      };
      // Remove joined fields from top-level
      delete (user as Record<string, unknown>).spaceId;
      delete (user as Record<string, unknown>).slug;
      delete (user as Record<string, unknown>).spaceName;
    } else {
      user = null;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[dashboard] DB query failed', { clerkId: userId, error: message, stack: err instanceof Error ? err.stack : undefined });
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 p-8 max-w-md">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load your account. This is usually temporary.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <pre className="text-xs text-left bg-red-950/50 text-red-300 p-3 rounded overflow-auto max-h-40">
              {message}
            </pre>
          )}
          <a
            href="/dashboard"
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  // Best-effort backfill (bookkeeping only)
  try {
    await ensureOnboardingBackfill(user);
  } catch {
    // non-blocking
  }

  // Simple routing: has workspace → go there. No workspace → setup.
  if (user?.space?.slug) {
    redirect(`/s/${user.space.slug}`);
  }

  redirect('/setup');
}
