'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CreditCard, Loader2, ArrowRight } from 'lucide-react';

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Branding */}
        <div className="text-center">
          <h2 className="text-lg font-semibold text-primary tracking-tight">Chippi</h2>
        </div>

        {/* Main card */}
        <div className="rounded-2xl border border-border bg-card shadow-lg p-8 text-center space-y-6">
          <div className="space-y-2">
            <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
              <AlertTriangle size={26} className="text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isCanceled ? 'Subscription canceled' : isInactive ? 'Subscription expired' : 'Payment issue'}
            </h1>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
              {isCanceled
                ? 'Your subscription has been canceled. Resubscribe to regain access to your dashboard and all your data.'
                : isInactive
                ? 'Your subscription has expired. Resubscribe to continue using Chippi.'
                : 'There was an issue processing your payment. Please update your billing information to continue using Chippi.'}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3">
            {(isCanceled || isInactive) ? (
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
              className="block text-sm text-muted-foreground hover:text-foreground underline"
            >
              Go to billing settings
            </a>
          </div>
        </div>

        {/* Help */}
        <p className="text-center text-xs text-muted-foreground">
          Need help?{' '}
          <a href="mailto:support@usechippi.com" className="text-primary underline hover:text-primary/80">
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}

export default function BillingRequiredPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <BillingRequiredContent />
    </Suspense>
  );
}
