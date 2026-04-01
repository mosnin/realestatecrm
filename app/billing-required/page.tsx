'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CreditCard, Loader2, ArrowRight } from 'lucide-react';

export default function BillingRequiredPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const searchParams = useSearchParams();
  const slug = searchParams.get('slug') ?? '';
  const reason = searchParams.get('reason') ?? 'past_due';
  const [loading, setLoading] = useState(false);

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

  async function handleManageBilling() {
    setLoading(true);
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
        // Fallback to billing page
        window.location.href = slug ? `/s/${slug}/billing` : '/setup';
        setLoading(false);
      }
    } catch {
      window.location.href = slug ? `/s/${slug}/billing` : '/setup';
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
              {isCanceled ? 'Subscription canceled' : 'Payment issue'}
            </h1>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
              {isCanceled
                ? 'Your subscription has been canceled. Reactivate to regain access to your dashboard and all your data.'
                : 'There was an issue processing your payment. Please update your billing information to continue using Chippi.'}
            </p>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
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
              {loading ? 'Redirecting...' : 'Update billing'}
              {!loading && <ArrowRight size={16} />}
            </Button>

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
