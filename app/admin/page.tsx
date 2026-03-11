import { clerkClient } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AdminDashboard } from './dashboard';
import { rootDomain } from '@/lib/utils';
import { db } from '@/lib/db';
import { getAdminAuth } from '@/lib/admin-auth';

export const metadata: Metadata = {
  title: `Admin Dashboard | ${rootDomain}`,
  description: `Manage users for ${rootDomain}`
};

export default async function AdminPage() {
  const adminAuth = await getAdminAuth();
  if (!adminAuth.isAuthenticated) {
    redirect('/sign-in?redirect_url=/admin');
  }
  if (!adminAuth.isAdmin) {
    notFound();
  }

  const dbUsers = await db.user.findMany({
    include: {
      space: {
        select: { slug: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const clerk = await clerkClient();
  const clerkUsers = await clerk.users.getUserList({
    userId: dbUsers.map((u: { clerkId: string }) => u.clerkId),
    limit: 500
  });

  const roleByClerkId = new Map(
    clerkUsers.data.map((user: { id: string; publicMetadata?: Record<string, unknown> }) => {
      const role = user.publicMetadata?.role === 'admin' ? 'admin' : 'member';
      return [user.id, role] as const;
    })
  );

  const users = dbUsers.map((user: {
    id: string;
    clerkId: string;
    name: string | null;
    email: string;
    createdAt: Date;
    onboardingCompletedAt: Date | null;
    onboardingCurrentStep: number;
    space: { slug: string } | null;
  }) => ({
    id: user.id,
    clerkId: user.clerkId,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    onboardingCurrentStep: user.onboardingCurrentStep,
    role: roleByClerkId.get(user.clerkId) ?? 'member',
    workspaceSlug: user.space?.slug ?? null
  }));

  return (
    <div className="min-h-screen bg-background">
      <AdminDashboard users={users} />
    </div>
  );
}
