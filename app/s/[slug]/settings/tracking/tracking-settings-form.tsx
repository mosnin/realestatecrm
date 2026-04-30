'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import type { TrackingPixels } from '@/lib/types';

interface TrackingSettingsFormProps {
  slug: string;
  trackingPixels: TrackingPixels | null;
}

const PIXEL_ID_REGEX = /^[a-zA-Z0-9\-_]*$/;

const PIXEL_FIELDS: {
  key: keyof Omit<TrackingPixels, 'customHeadScript'>;
  label: string;
  placeholder: string;
  helpText: string;
}[] = [
  {
    key: 'facebookPixelId',
    label: 'Meta/Facebook Pixel',
    placeholder: '123456789012345',
    helpText: 'Enter your Meta Pixel ID (e.g., 123456789)',
  },
  {
    key: 'tiktokPixelId',
    label: 'TikTok Pixel',
    placeholder: 'CXXXXXXXXXXXXXXXXX',
    helpText: 'Enter your TikTok Pixel ID',
  },
  {
    key: 'googleAnalyticsId',
    label: 'Google Analytics (GA4)',
    placeholder: 'G-XXXXXXXXXX',
    helpText: 'Enter your GA4 Measurement ID (e.g., G-XXXXXXX)',
  },
  {
    key: 'googleAdsId',
    label: 'Google Ads',
    placeholder: 'AW-XXXXXXXXXX',
    helpText: 'Enter your Google Ads Conversion ID (e.g., AW-XXXXXXX)',
  },
  {
    key: 'twitterPixelId',
    label: 'Twitter/X Pixel',
    placeholder: 'xxxxx',
    helpText: 'Enter your Twitter Pixel ID',
  },
  {
    key: 'linkedinPartnerId',
    label: 'LinkedIn Insight Tag',
    placeholder: '1234567',
    helpText: 'Enter your LinkedIn Insight Tag Partner ID',
  },
  {
    key: 'snapchatPixelId',
    label: 'Snapchat Pixel',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    helpText: 'Enter your Snapchat Pixel ID',
  },
];

export function TrackingSettingsForm({ slug, trackingPixels }: TrackingSettingsFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of PIXEL_FIELDS) {
      initial[field.key] = trackingPixels?.[field.key] ?? '';
    }
    initial.customHeadScript = trackingPixels?.customHeadScript ?? '';
    return initial;
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  function handleChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    for (const field of PIXEL_FIELDS) {
      const val = values[field.key]?.trim();
      if (val && !PIXEL_ID_REGEX.test(val)) {
        errors[field.key] = 'Must contain only letters, numbers, hyphens, and underscores';
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError('');

    if (!validate()) return;

    setSaving(true);
    try {
      const trackingPixelsPayload: Record<string, string | undefined> = {};
      for (const field of PIXEL_FIELDS) {
        const val = values[field.key]?.trim();
        if (val) trackingPixelsPayload[field.key] = val;
      }
      const customScript = values.customHeadScript?.trim();
      if (customScript) trackingPixelsPayload.customHeadScript = customScript;

      const res = await fetch('/api/settings/tracking', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, trackingPixels: trackingPixelsPayload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Couldn't save those settings. Try again.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Pixel ID Fields */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold">Tracking Pixels</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Add your pixel IDs to track ad performance on your public intake and tour booking pages.
          </p>
        </div>

        {PIXEL_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Input
              id={field.key}
              type="text"
              placeholder={field.placeholder}
              value={values[field.key] ?? ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
              className={fieldErrors[field.key] ? 'border-destructive' : ''}
            />
            {fieldErrors[field.key] && (
              <p className="text-xs text-destructive">{fieldErrors[field.key]}</p>
            )}
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          </div>
        ))}
      </div>

      {/* Custom Head Script */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Custom Head Script</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Add any additional tracking or analytics scripts not covered above.
          </p>
        </div>

        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            This script will be injected into your public form pages. Only use trusted scripts from verified providers. Scripts from non-HTTPS sources will be blocked.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="customHeadScript">Script content</Label>
          <Textarea
            id="customHeadScript"
            placeholder={'<script async src="https://www.googletagmanager.com/gtag/js?id=GTM-XXXX"></script>'}
            value={values.customHeadScript ?? ''}
            onChange={(e) => handleChange('customHeadScript', e.target.value)}
            rows={6}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Maximum 5,000 characters. Paste the full script tag(s), e.g. &lt;script async src=&quot;https://...&quot;&gt;&lt;/script&gt;.
          </p>
        </div>
      </div>

      {saveError && (
        <p className="text-sm text-destructive">{saveError}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 size={15} className="mr-2 animate-spin" />
              Saving
            </>
          ) : (
            'Save'
          )}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={15} />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
