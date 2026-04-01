'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, CheckCircle2, Loader2, Shield, Zap } from 'lucide-react';

function SubscribeContent() {
  const { isSignedIn, isLoaded } = useAuth();
  const searchParams = useSearchParams();
  const slug = searchParams.get('slug') ?? '';
  const [loading, setLoading] = useState(false);

  // Redirect unauthenticated users
  if (isLoaded && !isSignedIn) {
    window.location.href = '/login/realtor';
    return null;
  }

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
        alert(data.error || 'Failed to start checkout');
        setLoading(false);
      }
    } catch {
      alert('Something went wrong. Please try again.');
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
    'Voice AI assistant (Chip)',
    'MCP integration for Claude',
  ];

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Logo / Branding */}
        <div className="text-center">
          <h2 className="text-lg font-semibold text-primary tracking-tight">Chippi</h2>
        </div>

        {/* Main card */}
        <div className="rounded-2xl border border-border bg-card shadow-lg p-8 text-center space-y-6">
          <div className="space-y-2">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Sparkles size={26} className="text-primary" />
            </div>
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
          <p className="text-xs text-muted-foreground -mt-4">after 7-day free trial &middot; cancel anytime</p>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
            {features.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Button
            onClick={handleStartTrial}
            disabled={loading || !slug}
            size="lg"
            className="w-full rounded-full text-base font-semibold gap-2"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Zap size={18} />
            )}
            {loading ? 'Redirecting to checkout...' : 'Start 7-day free trial'}
            {!loading && <ArrowRight size={16} />}
          </Button>

          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Shield size={12} /> No credit card upfront</span>
            <span>Cancel anytime</span>
          </div>
        </div>

        {/* Already subscribed? */}
        <p className="text-center text-xs text-muted-foreground">
          Already subscribed?{' '}
          <a href={slug ? `/s/${slug}/billing` : '#'} className="text-primary underline hover:text-primary/80">
            Manage billing
          </a>
        </p>
      </div>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <SubscribeContent />
    </Suspense>
  );
}
