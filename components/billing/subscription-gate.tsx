'use client';

import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Lock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

/**
 * Blocks dashboard access for users without an active subscription.
 * The billing page (/s/[slug]/billing) is always accessible so users can subscribe.
 */
export function SubscriptionGate({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Always allow the billing page
  if (pathname.endsWith('/billing')) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center space-y-5 p-8 max-w-md">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Lock size={24} className="text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Subscription required</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You need an active Pro subscription to access your dashboard.
            Start your 7-day free trial to get started — no credit card required upfront.
          </p>
        </div>
        <Link href={`/s/${slug}/billing`}>
          <Button size="lg" className="gap-2">
            View plans & subscribe
            <ArrowRight size={16} />
          </Button>
        </Link>
      </div>
    </div>
  );
}
