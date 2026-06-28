'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BODY_MUTED, CAPTION, FIELD_RHYTHM, PRIMARY_PILL } from '@/lib/typography';
import type { TrackingPixels } from '@/lib/types';

interface TrackingPixelsFormProps {
  slug: string;
  initialPixels: TrackingPixels | null;
}

/** The seven ID fields, in the order they render. Each maps 1:1 to a key on
 *  TrackingPixels and is validated server-side (alphanumeric + - _ only). */
const PIXEL_FIELDS: { key: keyof TrackingPixels; label: string; placeholder: string }[] = [
  { key: 'facebookPixelId', label: 'Meta (Facebook) Pixel ID', placeholder: '123456789012345' },
  { key: 'tiktokPixelId', label: 'TikTok Pixel ID', placeholder: 'C9ABC123DEF456' },
  { key: 'googleAnalyticsId', label: 'Google Analytics ID', placeholder: 'G-XXXXXXXXXX' },
  { key: 'googleAdsId', label: 'Google Ads ID', placeholder: 'AW-123456789' },
  { key: 'twitterPixelId', label: 'X (Twitter) Pixel ID', placeholder: 'o1abc' },
  { key: 'linkedinPartnerId', label: 'LinkedIn Partner ID', placeholder: '1234567' },
  { key: 'snapchatPixelId', label: 'Snapchat Pixel ID', placeholder: 'a1b2c3d4-0000-1111-2222' },
];

type FieldState = Record<string, string>;

function toFieldState(pixels: TrackingPixels | null): FieldState {
  const out: FieldState = {};
  for (const { key } of PIXEL_FIELDS) out[key] = (pixels?.[key] as string | undefined) ?? '';
  out.customHeadScript = pixels?.customHeadScript ?? '';
  return out;
}

/**
 * Custom tracking pixels for the public intake form. The realtor pastes the IDs
 * from each ad platform; the saved pixels fire on the public /apply/[slug] form
 * so the realtor can measure and retarget their own intake traffic.
 *
 * Saves through the existing owner-scoped PUT /api/settings/tracking, which
 * validates every ID (alphanumeric only) and sanitizes the custom script
 * (HTTPS + allowlisted domains, no inline JS) — this form is just the surface;
 * the security lives in the endpoint and the renderer.
 */
export function TrackingPixelsForm({ slug, initialPixels }: TrackingPixelsFormProps) {
  const router = useRouter();
  const [fields, setFields] = useState<FieldState>(() => toFieldState(initialPixels));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  function setField(key: string, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    setFieldErrors([]);

    // Build the trackingPixels payload, omitting blanks so the endpoint stores a
    // clean object. The server re-validates + sanitizes everything regardless.
    const trackingPixels: Record<string, string> = {};
    for (const { key } of PIXEL_FIELDS) {
      const v = fields[key]?.trim();
      if (v) trackingPixels[key] = v;
    }
    const script = fields.customHeadScript?.trim();
    if (script) trackingPixels.customHeadScript = script;

    try {
      const res = await fetch('/api/settings/tracking', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, trackingPixels }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.details) && data.details.length > 0) {
          setFieldErrors(data.details as string[]);
        }
        setSaveError(data.error || "Couldn't save. Try again.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    } catch {
      setSaveError('Network hiccup. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <p className={BODY_MUTED}>
        Paste the IDs from any ad platforms you use. They fire on your public
        intake form (/apply) so you can measure and retarget the leads who land
        there. Leave a field blank to skip it.
      </p>

      <div className={FIELD_RHYTHM}>
        {PIXEL_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`pixel-${key}`} className="text-[12.5px] font-medium text-foreground">
              {label}
            </Label>
            <Input
              id={`pixel-${key}`}
              value={fields[key] ?? ''}
              onChange={(e) => setField(key, e.target.value)}
              placeholder={placeholder}
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ))}

        <div className="space-y-1.5">
          <Label htmlFor="pixel-customHeadScript" className="text-[12.5px] font-medium text-foreground">
            Custom head script (advanced)
          </Label>
          <Textarea
            id="pixel-customHeadScript"
            value={fields.customHeadScript ?? ''}
            onChange={(e) => setField('customHeadScript', e.target.value)}
            placeholder={'<script src="https://cdn.segment.com/analytics.js/v1/KEY/analytics.min.js"></script>'}
            rows={3}
            maxLength={5000}
            className="font-mono text-xs"
            spellCheck={false}
          />
          <p className={CAPTION}>
            For platforms without a field above. Only external <code>&lt;script src&gt;</code> tags
            from approved analytics domains (HTTPS) are allowed — inline scripts and event handlers
            are stripped for safety.
          </p>
        </div>
      </div>

      <p className={CAPTION}>
        Adding pixels means third parties may set cookies on your intake visitors.
        Make sure your privacy policy (set under Legal) discloses the platforms
        you enable here.
      </p>

      {fieldErrors.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-destructive">
          {fieldErrors.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      )}
      {saveError && fieldErrors.length === 0 && (
        <p className="text-sm text-destructive">{saveError}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? 'Saving' : 'Save pixels'}
        </button>
        {saved && (
          <span className={`inline-flex items-center gap-1.5 ${BODY_MUTED}`}>
            <CheckCircle2 size={14} className="text-foreground" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
