'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SECTION_LABEL,
  BODY_MUTED,
  CAPTION,
  PRIMARY_PILL,
} from '@/lib/typography';

interface LegalSettingsFormProps {
  slug: string;
  privacyPolicyUrl: string;
  consentCheckboxLabel: string;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className={SECTION_LABEL}>{children}</p>;
}

function isValidHttpsUrl(value: string): boolean {
  if (!value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function LegalSettingsForm({
  slug,
  privacyPolicyUrl: initialUrl,
  consentCheckboxLabel: initialLabel,
}: LegalSettingsFormProps) {
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState(initialUrl);
  const [consentCheckboxLabel, setConsentCheckboxLabel] = useState(initialLabel);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [urlError, setUrlError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setUrlError('');
    setSaveError('');

    const trimmedUrl = privacyPolicyUrl.trim();
    if (trimmedUrl && !isValidHttpsUrl(trimmedUrl)) {
      setUrlError('URL must start with https:// and be a valid URL');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name: undefined,
          privacyPolicyUrl: trimmedUrl || null,
          consentCheckboxLabel: consentCheckboxLabel.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || 'Failed to save settings. Please try again.');
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
    <form onSubmit={handleSave} className="space-y-10">
      <section className="space-y-5">
        <SectionLabel>Intake compliance</SectionLabel>
        <p className={BODY_MUTED}>
          Privacy policy and consent text shown on your intake form.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="privacyPolicyUrl" className="text-[12.5px] font-medium text-foreground">
            Privacy policy URL
          </Label>
          <Input
            id="privacyPolicyUrl"
            type="url"
            placeholder="https://yourdomain.com/privacy"
            value={privacyPolicyUrl}
            onChange={(e) => {
              setPrivacyPolicyUrl(e.target.value);
              setUrlError('');
            }}
            className={urlError ? 'border-destructive' : ''}
          />
          {urlError && <p className="text-xs text-destructive">{urlError}</p>}
          <p className={CAPTION}>
            Required before your intake form can collect submissions.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="consentCheckboxLabel" className="text-[12.5px] font-medium text-foreground">
            Custom consent checkbox label
          </Label>
          <Input
            id="consentCheckboxLabel"
            type="text"
            placeholder="I agree to the Privacy Policy"
            value={consentCheckboxLabel}
            onChange={(e) => setConsentCheckboxLabel(e.target.value)}
          />
          <p className={CAPTION}>
            If blank, defaults to: I agree to [Business Name]&apos;s Privacy Policy
          </p>
        </div>
      </section>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? 'Saving' : 'Save changes'}
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
