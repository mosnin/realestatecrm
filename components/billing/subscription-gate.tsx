'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2 } from 'lucide-react';

/**
 * Blocks dashboard access for users without an active subscription.
 * The billing page and settings pages are always accessible.
 * Shows different messaging for first-time trial vs expired/failed billing.
 */
export function SubscriptionGate({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const [loading, setLoading] = useState(false);

  // Always allow billing and settings pages
  const isExemptPath =
    pathname.endsWith('/billing') ||
    pathname.includes('/settings') ||
    pathname.startsWith('/broker/billing') ||
    pathname.startsWith('/broker/settings');

  if (isExemptPath) return <>{children}</>;

  async function handleStartTrial() {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Couldn't start checkout. Try again.");
        setLoading(false);
      }
    } catch {
      alert("That didn't go through. Usually temporary.");
      setLoading(false);
    }
  }

  const features = [
    'AI-powered lead scoring',
    'Unlimited contacts & deals',
    'Custom intake forms',
    'Tour scheduling & booking',
    'Follow-up reminders',
    'Notes, calendar & analytics',
    'Voice calling when Telnyx is configured',
    'MCP integration for Claude after you create a key',
  ];

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Main card */}
        <div className="rounded-2xl border border-border bg-card shadow-lg p-8 text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Start your free trial</h1>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Get full access to everything in Chippi for 7 days. No credit card required to start.
            </p>
          </div>

          {/* Price */}
          <div className="flex items-end justify-center gap-1">
            <span className="text-4xl font-bold">$97</span>
            <span className="text-muted-foreground text-lg mb-1">/month</span>
          </div>
          <p className="text-xs text-muted-foreground -mt-4">after 7-day free trial · cancel anytime</p>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
            {features.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <span>{f}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Button
            onClick={handleStartTrial}
            disabled={loading}
            size="lg"
            className="w-full rounded-full text-base font-semibold gap-2"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : null}
            {loading ? 'Redirecting to checkout...' : 'Start 7-day free trial'}
            {!loading && <ArrowRight size={16} />}
          </Button>

          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span>No credit card upfront</span>
            <span>Cancel anytime</span>
          </div>
        </div>

        {/* Already subscribed? */}
        <p className="text-center text-xs text-muted-foreground">
          Already subscribed?{' '}
          <a href={pathname.startsWith('/broker') ? '/broker/billing' : `/s/${slug}/billing`} className="text-foreground underline hover:text-foreground/80">
            Manage billing
          </a>
        </p>

        {/* Escape hatches — never trap a user on the paywall. They can always
            head back to the marketing site or sign out and return later. */}
        <div className="flex items-center justify-center gap-5 text-xs text-muted-foreground">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            Back to home
          </a>
          <span aria-hidden className="text-border">·</span>
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: '/' })}
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
