'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  AlertTriangle,
  CreditCard,
  Loader2,
  ArrowRight,
  Check,
  XCircle,
  Clock,
} from 'lucide-react';

function BillingRequiredContent() {
  const { isSignedIn, isLoaded } = useAuth();
  const searchParams = useSearchParams();
  const slug = searchParams.get('slug') ?? '';
  const reason = searchParams.get('reason') ?? 'past_due';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect unauthenticated users
  if (isLoaded && !isSignedIn) {
    window.location.href = '/login/realtor';
    return null;
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isCanceled = reason === 'canceled';
  const isInactive = reason === 'inactive';
  const needsResubscribe = isCanceled || isInactive;

  async function handleManageBilling() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Could not open billing portal. Try the billing settings link below.');
        setLoading(false);
      }
    } catch {
      setError('Something went wrong. Try the billing settings link below.');
      setLoading(false);
    }
  }

  async function handleResubscribe() {
    setLoading(true);
    setError('');
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
        setError(data.error || 'Could not start checkout.');
        setLoading(false);
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  const title = isCanceled
    ? 'Subscription canceled'
    : isInactive
      ? 'Subscription expired'
      : 'Payment issue';

  const description = isCanceled
    ? 'Your subscription has been canceled. Resubscribe to regain access to your dashboard and all your data.'
    : isInactive
      ? 'Your subscription has expired. Resubscribe to continue using Chippi.'
      : 'There was an issue processing your payment. Please update your billing information to continue using Chippi.';

  const StatusIcon = isCanceled ? XCircle : isInactive ? Clock : AlertTriangle;

  const impactItems = [
    'Dashboard access is paused',
    'New leads will not be captured',
    'Scheduled tours are on hold',
    'Voice AI assistant is offline',
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-3xl space-y-6">
        {/* Branding */}
        <div className="text-center">
          <h2 className="text-lg font-semibold text-primary tracking-tight">Chippi</h2>
        </div>

        {/* Split alert card */}
        <Card className="rounded-3xl border border-amber-300/50 shadow-xl overflow-hidden p-0">
          <div className="flex flex-col md:flex-row">
            {/* Left side — Status & Action */}
            <div className="flex flex-col justify-center gap-6 bg-amber-50 dark:bg-amber-950/20 p-8 md:p-10 md:w-5/12">
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                  <StatusIcon size={24} className="text-amber-600 dark:text-amber-400" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* CTA */}
              {needsResubscribe ? (
                <Button
                  onClick={handleResubscribe}
                  disabled={loading || !slug}
                  size="lg"
                  className="w-full rounded-full text-base font-semibold gap-2"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <CreditCard size={18} />
                  )}
                  {loading ? 'Redirecting...' : 'Resubscribe'}
                  {!loading && <ArrowRight size={16} />}
                </Button>
              ) : (
                <Button
                  onClick={handleManageBilling}
                  disabled={loading || !slug}
                  size="lg"
                  className="w-full rounded-full text-base font-semibold gap-2"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <CreditCard size={18} />
                  )}
                  {loading ? 'Redirecting...' : 'Update payment method'}
                  {!loading && <ArrowRight size={16} />}
                </Button>
              )}

              <a
                href={slug ? `/s/${slug}/billing` : '/setup'}
                className="text-sm text-muted-foreground hover:text-foreground underline text-center"
              >
                Go to billing settings
              </a>
            </div>

            {/* Right side — Impact details */}
            <div className="flex flex-col justify-center gap-6 p-8 md:p-10 md:w-7/12">
              <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                What&apos;s affected
              </p>
              <ul className="grid grid-cols-1 gap-3">
                {impactItems.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                      <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  What you keep
                </p>
                <ul className="grid grid-cols-1 gap-3">
                  {['All your contacts & deal history', 'Saved forms & templates', 'Analytics data'].map(
                    (item) => (
                      <li key={item} className="flex items-center gap-3 text-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Check size={12} className="text-primary" />
                        </span>
                        <span>{item}</span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            </div>
          </div>
        </Card>

        {/* Help */}
        <p className="text-center text-xs text-muted-foreground">
          Need help?{' '}
          <a
            href="mailto:support@usechippi.com"
            className="text-primary underline hover:text-primary/80"
          >
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}

export default function BillingRequiredPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <BillingRequiredContent />
    </Suspense>
  );
}
