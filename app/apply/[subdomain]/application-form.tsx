'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2 } from 'lucide-react';

export function ApplicationForm({
  subdomain,
  businessName
}: {
  subdomain: string;
  businessName: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [scoreState, setScoreState] = useState<{
    scoringStatus?: string;
    leadScore?: number | null;
    scoreLabel?: string;
    scoreSummary?: string | null;
  } | null>(null);
  const submissionLockRef = useRef(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || submissionLockRef.current) return;

    submissionLockRef.current = true;
    setSubmitting(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const payload = {
      subdomain,
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      budget: formData.get('budget'),
      timeline: formData.get('timeline'),
      preferredAreas: formData.get('preferredAreas'),
      notes: formData.get('notes'),
    };

    try {
      const response = await fetch('/api/public/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        setScoreState(result);
        setSubmitted(true);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Unable to submit. Check your connection and try again.');
    } finally {
      setSubmitting(false);
      submissionLockRef.current = false;
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <CheckCircle2 size={24} className="text-green-600" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Application received</h2>
          <p className="text-sm text-muted-foreground">
            {businessName} will review your info and follow up shortly.
          </p>
        </div>
        {scoreState?.scoringStatus === 'scored' && scoreState.scoreSummary && (
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-left">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Initial assessment
            </p>
            <p className="text-sm text-foreground leading-relaxed">{scoreState.scoreSummary}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <form onSubmit={onSubmit} className="space-y-5">
        {/* Required fields */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="apply-name">Full name <span className="text-destructive">*</span></Label>
            <Input id="apply-name" name="name" placeholder="Alex Johnson" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="apply-phone">Phone number <span className="text-destructive">*</span></Label>
            <Input id="apply-phone" name="phone" type="tel" placeholder="(555) 123-4567" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="apply-email">Email</Label>
            <Input id="apply-email" name="email" type="email" placeholder="alex@email.com" />
          </div>
        </div>

        {/* Optional details */}
        <div className="border-t border-border/50 pt-5 space-y-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Rental preferences
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="apply-budget">Monthly budget</Label>
              <Input id="apply-budget" name="budget" placeholder="e.g. 2500" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apply-timeline">Move-in timeline</Label>
              <Input id="apply-timeline" name="timeline" placeholder="e.g. August 1" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="apply-areas">Preferred areas</Label>
            <Input id="apply-areas" name="preferredAreas" placeholder="e.g. Midtown, Downtown" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="apply-notes">Anything else we should know?</Label>
            <Textarea
              id="apply-notes"
              name="notes"
              placeholder="Pet-friendly, parking needed, etc."
              rows={3}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" disabled={submitting} className="w-full" size="lg">
          {submitting ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit application'
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground/60">
          By submitting, you agree to share this information with {businessName}.
        </p>
      </form>
    </div>
  );
}
