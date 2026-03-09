'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ApplicationForm({ subdomain }: { subdomain: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(formData: FormData) {
    setSubmitting(true);
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

    const response = await fetch('/api/public/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);
    if (response.ok) {
      setSubmitted(true);
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
        <form action={onSubmit} className="space-y-4">
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
