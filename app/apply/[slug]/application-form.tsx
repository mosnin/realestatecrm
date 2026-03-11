'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ApplicationForm({ slug }: { slug: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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

    const formData = new FormData(e.currentTarget);
    const payload = {
      slug,
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
      }
    } finally {
      setSubmitting(false);
      submissionLockRef.current = false;
    }
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="font-medium">Thanks — your application was received.</p>
          <p className="text-sm text-muted-foreground mt-2">
            An agent will review your info and follow up shortly.
          </p>
          <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
            {scoreState?.scoringStatus === 'scored' ? (
              <>
                <p className="text-sm font-medium">
                  Lead score: {Math.round(scoreState.leadScore ?? 0)} ({scoreState.scoreLabel})
                </p>
                {scoreState.scoreSummary ? (
                  <p className="text-xs text-muted-foreground mt-1">{scoreState.scoreSummary}</p>
                ) : null}
              </>
            ) : scoreState?.scoringStatus === 'pending' ? (
              <p className="text-sm font-medium">Scoring is in progress. Your lead was saved.</p>
            ) : (
              <p className="text-sm font-medium">Scoring is currently unavailable. Your lead was saved.</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rental Application Intake</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Input name="name" placeholder="Full name" required />
          <Input name="email" type="email" placeholder="Email (optional)" />
          <Input name="phone" placeholder="Phone number" required />
          <Input name="budget" placeholder="Monthly budget (optional)" />
          <Input name="timeline" placeholder="Move-in timeline (optional)" />
          <Input name="preferredAreas" placeholder="Preferred areas (optional)" />
          <Textarea name="notes" placeholder="Anything else we should know?" />
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Submitting...' : 'Submit application'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
